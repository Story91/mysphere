import 'server-only';
import { TransactionReceiptNotFoundError, createPublicClient, http, type Hash } from 'viem';
import { base } from 'viem/chains';
import { lowerTxHash, type SealedEscrow } from '../../utils/asks/askSealCore';
import { askIdToBytes32, escrowDeployment, escrowKeyFor, readEscrow } from '../../utils/asks/escrow';
import {
  checkFundedAgainstDraft,
  findAskFunded,
  legacyEscrowFromChain,
  type EscrowLogLike,
  type EscrowOnchain,
  type FundMismatch,
  type FundedEvent,
} from '../../utils/asks/escrowProofCore';

/**
 * Dowody z lancucha dla tras Askow - paragony i odczyt escrowFor na Base.
 *
 * Logika czytania logow jest czysta i siedzi w
 * app/utils/asks/escrowProofCore.ts (testy). Tutaj tylko RPC: wlasny klient
 * Base (ten sam wzorzec co verifyPayment.ts i escrow-resolve), bo tamte
 * moduly nie eksportuja swoich.
 */

/** Escrow Askow istnieje w aplikacji tylko na Base mainnet. */
export const ESCROW_CHAIN_ID = base.id;

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.CDP_RPC_URL),
});

export { legacyEscrowFromChain };

/* ------------------------------------------------------------------ */
/*  PARAGON                                                            */
/* ------------------------------------------------------------------ */

export type ReceiptProof =
  | {
      ok: true;
      txHash: string;
      logs: EscrowLogLike[];
      blockNumber: bigint;
      /** Sekundy epoch z bloku. */
      blockTimeSec: number;
    }
  | {
      ok: false;
      /**
       * tx_not_found - RPC nie zna tej transakcji (swieza albo zmyslona),
       * tx_reverted  - cofnieta, nic nie przeszlo,
       * rpc_error    - awaria RPC: "nie wiem", NIE "nie ma".
       */
      code: 'tx_not_found' | 'tx_reverted' | 'rpc_error';
      error: string;
    };

/** Paragon transakcji na Base z logami i czasem bloku. */
export async function readEscrowReceipt(txHash: string): Promise<ReceiptProof> {
  const hash = lowerTxHash(txHash);
  if (!hash) return { ok: false, code: 'tx_not_found', error: 'That is not a transaction hash.' };

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: hash as Hash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return { ok: false, code: 'tx_not_found', error: 'That transaction is not on Base yet. Wait for it to confirm and try again.' };
    }
    console.error('[asks/escrowProof] Odczyt paragonu nie powiodl sie:', error);
    return { ok: false, code: 'rpc_error', error: 'Could not read the transaction from Base. Retry in a moment.' };
  }

  if (receipt.status !== 'success') {
    return { ok: false, code: 'tx_reverted', error: 'That transaction reverted on-chain.' };
  }

  let blockTimeSec: number;
  try {
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
    blockTimeSec = Number(block.timestamp);
  } catch (error) {
    console.error('[asks/escrowProof] Odczyt bloku nie powiodl sie:', error);
    return { ok: false, code: 'rpc_error', error: 'Could not read the block of that transaction. Retry in a moment.' };
  }

  return {
    ok: true,
    txHash: hash,
    logs: receipt.logs as unknown as EscrowLogLike[],
    blockNumber: receipt.blockNumber,
    blockTimeSec,
  };
}

/* ------------------------------------------------------------------ */
/*  NOWY ASK: log AskFunded zgodny ze szkicem                          */
/* ------------------------------------------------------------------ */

export type VerifyAskFundedResult =
  | { ok: true; escrow: SealedEscrow; event: FundedEvent; blockTimeSec: number }
  | {
      ok: false;
      /**
       * fund_not_visible      - paragonu jeszcze nie ma (albo RPC chwilowo padl);
       *                         klient ponawia (retryable),
       * fund_reverted         - fund sie cofnal,
       * fund_not_for_this_ask - w transakcji nie ma JEDNEGO AskFunded z kluczem
       *                         (sesja, askId),
       * fund_mismatch         - warunki na lancuchu != szkic (lista w `mismatches`),
       * escrow_unavailable    - brak wdrozenia escrow na Base w tej aplikacji.
       */
      code: 'fund_not_visible' | 'fund_reverted' | 'fund_not_for_this_ask' | 'fund_mismatch' | 'escrow_unavailable';
      retryable: boolean;
      error: string;
      mismatches?: FundMismatch[];
    };

/**
 * Dowod, ze budzet NOWEGO Aska lezy na kontrakcie - WYLACZNIE dla trasy
 * tworzenia. Szkic musi sie zgadzac z logiem co do jednostki i sekundy.
 *
 * `author` to adres z sesji SIWE. Klucz escrow = keccak(msg.sender, askId),
 * wiec fund z cudzego portfela ma inny klucz i tu nie przejdzie. UWAGA: to
 * NIE chroni przed przejeciem cudzego askId - kazdy moze sfinansowac
 * keccak(cudzeId) ze swojego portfela. Przed tym broni decyzja o utworzeniu
 * w trasie tworzenia (decideEscrowedCreate: istniejacy stan albo cudzy
 * dokument -> 409), nie ta funkcja.
 */
export async function verifyAskFunded(input: {
  author: string;
  askId: string;
  fundTxHash: string;
  budget: number;
  seats: number;
  deadlineMs: number;
}): Promise<VerifyAskFundedResult> {
  const deployment = escrowDeployment(ESCROW_CHAIN_ID);
  if (!deployment) {
    return { ok: false, code: 'escrow_unavailable', retryable: false, error: 'Escrow is not deployed on Base in this app.' };
  }

  const receipt = await readEscrowReceipt(input.fundTxHash);
  if (!receipt.ok) {
    if (receipt.code === 'tx_reverted') {
      return { ok: false, code: 'fund_reverted', retryable: false, error: 'The escrow deposit reverted on-chain. Nothing was locked.' };
    }
    return {
      ok: false,
      code: 'fund_not_visible',
      retryable: true,
      error: 'The escrow deposit is not visible on Base yet. Retry in a few seconds.',
    };
  }

  const event = findAskFunded(receipt.logs, {
    contract: deployment.address,
    key: escrowKeyFor(input.author, input.askId),
    author: input.author,
    askIdBytes: askIdToBytes32(input.askId),
  });
  if (event === null || event === 'ambiguous') {
    return {
      ok: false,
      code: 'fund_not_for_this_ask',
      retryable: false,
      error: 'That transaction does not fund this Ask from your wallet.',
    };
  }

  const mismatches = checkFundedAgainstDraft(event, {
    budget: input.budget,
    seats: input.seats,
    deadlineMs: input.deadlineMs,
    blockTimeSec: receipt.blockTimeSec,
  });
  if (mismatches.length > 0) {
    return {
      ok: false,
      code: 'fund_mismatch',
      retryable: false,
      error: 'The escrow deposit does not match this Ask (amount, seats or deadline).',
      mismatches,
    };
  }

  return {
    ok: true,
    event,
    blockTimeSec: receipt.blockTimeSec,
    escrow: {
      chainId: ESCROW_CHAIN_ID,
      contract: deployment.address.toLowerCase(),
      fundTxHash: receipt.txHash,
      perAnswerUnits: event.perAnswer.toString(),
      seats: event.seats,
      deadlineSec: event.deadline.toString(),
      source: 'fund-log',
    },
  };
}

/* ------------------------------------------------------------------ */
/*  STARY ASK: escrowFor                                               */
/* ------------------------------------------------------------------ */

/**
 * escrowFor(author, askId) na Base. RZUCA przy awarii RPC - "nie udalo sie
 * sprawdzic" nie moze wygladac jak "nie sfinansowano".
 */
export async function readEscrowOnchain(author: string, askId: string): Promise<EscrowOnchain> {
  const state = await readEscrow(publicClient, ESCROW_CHAIN_ID, author, askId);
  return {
    funded: state.funded,
    open: state.open,
    perAnswerUnits: state.perAnswer,
    deadlineSec: state.deadlineSeconds,
    seatsLeft: state.seatsLeft,
  };
}

export type LegacyEscrowProof =
  | { funded: false; onchain: EscrowOnchain }
  | { funded: true; escrow: SealedEscrow; anomalies: string[]; onchain: EscrowOnchain };

/**
 * Pelny dowod escrow Aska sprzed pieczeci: escrowFor + (opcjonalnie)
 * weryfikacja pub.escrowTxHash logiem AskFunded. Sam hash z dokumentu niczego
 * nie dowodzi - przegladarka moze go podmienic - wiec trafia do pieczeci
 * tylko wtedy, gdy jego log AskFunded ma klucz TEGO Aska.
 *
 * `author` bierz z zamrozonego pola dokumentu (albo ze stanu). RZUCA przy
 * awarii RPC (escrowFor albo paragon) - wolajacy odpowiada 503 i nic nie
 * zapisuje, zeby chwilowa awaria nie zapieczetowala fundTxHash = null.
 */
export async function proveLegacyEscrow(
  pub: Record<string, any>,
  author: string,
  askId: string
): Promise<LegacyEscrowProof> {
  const deployment = escrowDeployment(ESCROW_CHAIN_ID);
  if (!deployment) throw new Error('Escrow is not deployed on Base in this app.');

  const onchain = await readEscrowOnchain(author, askId);
  if (!onchain.funded) return { funded: false, onchain };

  let verifiedFundTxHash: string | null = null;
  const claimed = lowerTxHash(pub.escrowTxHash);
  if (claimed) {
    const receipt = await readEscrowReceipt(claimed);
    if (!receipt.ok && receipt.code === 'rpc_error') {
      throw new Error('Could not read the escrow deposit transaction from Base.');
    }
    if (receipt.ok) {
      const event = findAskFunded(receipt.logs, {
        contract: deployment.address,
        key: escrowKeyFor(author, askId),
        author,
        askIdBytes: askIdToBytes32(askId),
      });
      if (event !== null && event !== 'ambiguous') verifiedFundTxHash = receipt.txHash;
    }
  }

  const legacy = legacyEscrowFromChain(pub, onchain, {
    chainId: ESCROW_CHAIN_ID,
    contract: deployment.address,
    verifiedFundTxHash,
  });
  if (!legacy) return { funded: false, onchain };
  return { funded: true, escrow: legacy.escrow, anomalies: legacy.anomalies, onchain };
}
