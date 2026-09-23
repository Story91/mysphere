/**
 * Serwerowa weryfikacja platnosci na Base. Uzywana przez /api/unlock/**.
 *
 * PO CO: klient moze wyslac dowolny txHash. Zanim zapiszemy odblokowanie albo
 * wsparcie, serwer sam patrzy na lancuch.
 *
 * NAJWAZNIEJSZE: `receipt.status === 'reverted'` to BLAD, nie sukces.
 * Dokladnie ten blad byl w TipButton pod OnchainKit - transakcja wchodzila na
 * lancuch, OnchainKit raportowal sukces, a cofnieta transakcja zapisywala tip,
 * ktory nigdy nie doszedl. Tutaj nie ma sciezki, ktora zapisuje cokolwiek przy
 * statusie innym niz 'success'.
 *
 * DWA POZIOMY PEWNOSCI (`PaymentVerificationLevel`):
 *  - 'strict'       - potwierdzono odbiorce ORAZ kwote,
 *  - 'receipt-only' - potwierdzono tylko, ze transakcja sie powiodla.
 *
 * Skad 'receipt-only': przy natywnym ETH wyslanym z portfela smart-contract
 * (Base Account / Coinbase Smart Wallet) transakcja zewnetrzna idzie do konta
 * portfela, a wlasciwy transfer do tworcy jest wywolaniem wewnetrznym - nie ma
 * go ani w `tx.to`, ani w logach. Bez trace RPC nie da sie go sprawdzic.
 * Dlatego domyslnym tokenem monetyzacji jest USDC: transfer ERC-20 zawsze
 * zostawia log Transfer, wiec zawsze konczy sie poziomem 'strict'.
 */

import {
  TransactionReceiptNotFoundError,
  createPublicClient,
  http,
  parseEther,
  parseUnits,
  type Hash,
} from 'viem';
import { base } from 'viem/chains';
import { MONETIZATION_CHAIN_ID, type MonetizationToken, type PaymentVerificationLevel } from './types';

/** USDC na Base - ten sam adres, ktorego uzywa TipNetworkConfig. */
export const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.CDP_RPC_URL),
});

export type PaymentVerificationResult =
  | { ok: true; level: PaymentVerificationLevel; note?: string }
  | { ok: false; error: string };

export interface VerifyPaymentInput {
  txHash: string;
  /** Adres, ktory ma dostac pieniadze (tworca). */
  expectedTo: string;
  /** Kwota jako string dziesietny, np. "1" albo "0.001". */
  expectedAmount: string;
  token: MonetizationToken;
}

/** Adres z 32-bajtowego topicu logu. */
function addressFromTopic(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

export async function verifyBasePayment(input: VerifyPaymentInput): Promise<PaymentVerificationResult> {
  const txHash = input.txHash as Hash;
  const expectedTo = input.expectedTo.toLowerCase();

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  } catch (error) {
    // Brak potwierdzenia to nie jest sukces - klient ma ponowic po zamknieciu bloku.
    return { ok: false, error: 'Transaction not found on Base yet. Wait for confirmation and retry.' };
  }

  // === TU JEST TA POPRAWKA Z TipButton ===
  // Transakcja weszla na lancuch, ale sie cofnela. Pieniadze NIE doszly.
  if (receipt.status !== 'success') {
    return { ok: false, error: 'Transaction reverted on-chain - no payment was made.' };
  }

  if (input.token === 'USDC') {
    const expected = parseUnits(input.expectedAmount, 6);
    const matching = receipt.logs.find(log => {
      if (log.address.toLowerCase() !== USDC_BASE_ADDRESS) return false;
      if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return false;
      if (!log.topics[2]) return false;
      if (addressFromTopic(log.topics[2]) !== expectedTo) return false;
      let value: bigint;
      try {
        value = BigInt(log.data);
      } catch {
        return false;
      }
      return value >= expected;
    });

    if (!matching) {
      return {
        ok: false,
        error: `No USDC transfer of at least ${input.expectedAmount} to ${input.expectedTo} found in this transaction.`,
      };
    }
    return { ok: true, level: 'strict' };
  }

  // Natywny ETH.
  const expectedWei = parseEther(input.expectedAmount);
  try {
    const tx = await publicClient.getTransaction({ hash: txHash });
    if (tx.to && tx.to.toLowerCase() === expectedTo && tx.value >= expectedWei) {
      return { ok: true, level: 'strict' };
    }
  } catch (error) {
    console.error('[monetization] nie udalo sie pobrac transakcji do weryfikacji ETH:', error);
  }

  // Nie udalo sie potwierdzic odbiorcy/kwoty (najczesciej: batch ze smart
  // walleta). Transakcja na pewno sie powiodla, ale reszta jest niesprawdzona -
  // zapisujemy to jawnie w rekordzie zamiast udawac pelna weryfikacje.
  return {
    ok: true,
    level: 'receipt-only',
    note:
      'Transaction succeeded, but the native ETH transfer could not be matched to the creator address ' +
      '(likely a smart-wallet batched call). Recorded as receipt-only. Use USDC for fully verified payments.',
  };
}

export const VERIFICATION_CHAIN_ID = MONETIZATION_CHAIN_ID;

/* ------------------------------------------------------------------ */
/*  SUROWE TRANSFERY USDC - dla wyplat Askow                           */
/* ------------------------------------------------------------------ */

/**
 * DOPISANE OBOK verifyBasePayment, NIE ZAMIAST. Tamta funkcja odpowiada na
 * pytanie "czy jest JAKIS transfer >= kwota na ten adres" i tyle wystarcza
 * tip-to-unlock. Wyplata za odpowiedz na Aska potrzebuje wiecej: KTO wyslal
 * (Transfer.from musi byc autorem Aska), KTORY log (jeden log = jedna wyplata,
 * rejestr zuzytych logow) i KIEDY (blok nie moze byc starszy niz odpowiedz).
 * Dlatego tu oddajemy wszystkie transfery USDC z transakcji razem z czasem
 * bloku, a decyzje podejmuje czysta logika w app/utils/asks/askSealCore.ts.
 * verifyBasePayment zostaje nietkniety - /api/unlock/** dziala jak dotad.
 */

/** Jeden log Transfer USDC na Base, juz zdekodowany. Adresy malymi literami. */
export type UsdcTransferLog = {
  logIndex: number;
  from: string;
  to: string;
  value: bigint;
};

/** Minimalny ksztalt logu z paragonu viem - tylko pola, ktore czytamy. */
export type ReceiptLogLike = {
  address: string;
  topics: readonly (string | null | undefined)[];
  data: string;
  logIndex: number | bigint | null;
};

/**
 * Transfery USDC z logow paragonu - CZYSTE, bez RPC, zeby dalo sie to
 * przetestowac bez lancucha.
 *
 * Log przechodzi tylko wtedy, gdy: pochodzi z kontraktu USDC na Base, ma
 * topic0 Transfer, ma OBA indeksowane adresy i dane daja sie odczytac jako
 * liczba. Log bez logIndex odpada - bez niego nie da sie zapisac, ktory log
 * zuzyto, a wtedy ta sama wyplata moglaby posluzyc dwa razy.
 */
export function usdcTransfersFromLogs(logs: readonly ReceiptLogLike[]): UsdcTransferLog[] {
  const out: UsdcTransferLog[] = [];
  for (const log of logs) {
    if (typeof log.address !== 'string' || log.address.toLowerCase() !== USDC_BASE_ADDRESS) continue;
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    const fromTopic = log.topics[1];
    const toTopic = log.topics[2];
    if (typeof fromTopic !== 'string' || typeof toTopic !== 'string') continue;
    if (!/^0x[0-9a-fA-F]{64}$/.test(fromTopic) || !/^0x[0-9a-fA-F]{64}$/.test(toTopic)) continue;
    if (log.logIndex === null || log.logIndex === undefined) continue;
    const logIndex = Number(log.logIndex);
    if (!Number.isSafeInteger(logIndex) || logIndex < 0) continue;
    // Pusty albo nie-hex `data` to nie jest kwota. BigInt('0x') rzuca, a
    // BigInt('') daje 0 - dlatego najpierw ksztalt, potem liczba.
    if (typeof log.data !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(log.data)) continue;
    let value: bigint;
    try {
      value = BigInt(log.data);
    } catch {
      continue;
    }
    out.push({
      logIndex,
      from: addressFromTopic(fromTopic),
      to: addressFromTopic(toTopic),
      value,
    });
  }
  return out.sort((a, b) => a.logIndex - b.logIndex);
}

export type UsdcTransfersResult =
  | {
      ok: true;
      blockNumber: bigint;
      /** Znacznik czasu bloku w SEKUNDACH - tak podaje go lancuch. */
      blockTimeSec: number;
      transfers: UsdcTransferLog[];
    }
  | {
      ok: false;
      /**
       * tx_not_found - RPC nie zna tej transakcji (jeszcze nie weszla albo hash
       *                jest zmyslony); klient moze ponowic.
       * tx_reverted  - transakcja sie cofnela, nikt nie dostal pieniedzy.
       * rpc_error    - awaria RPC (paragon albo blok). NIE mowi nic o platnosci,
       *                wiec wolajacy musi to traktowac jak "nie wiem", a nie "nie".
       */
      code: 'tx_not_found' | 'tx_reverted' | 'rpc_error';
      error: string;
    };

/**
 * Wszystkie transfery USDC z jednej transakcji na Base plus czas jej bloku.
 *
 * Czas bloku jest czescia wyniku, bo wyplata za odpowiedz nie moze byc
 * STARSZA niz ta odpowiedz - inaczej dowolny stary przelew do tego adresu
 * (wyplata z gieldy, napiwek) "oplacalby" nowa odpowiedz.
 */
export async function readUsdcTransfers(txHash: string): Promise<UsdcTransfersResult> {
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return {
        ok: false,
        code: 'tx_not_found',
        error: 'Transaction not found on Base yet. Wait for confirmation and retry.',
      };
    }
    console.error('[monetization] readUsdcTransfers: odczyt paragonu nie powiodl sie:', error);
    return { ok: false, code: 'rpc_error', error: 'Could not read the transaction from Base. Retry in a moment.' };
  }

  if (receipt.status !== 'success') {
    return { ok: false, code: 'tx_reverted', error: 'Transaction reverted on-chain - no payment was made.' };
  }

  let blockTimeSec: number;
  try {
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
    blockTimeSec = Number(block.timestamp);
  } catch (error) {
    console.error('[monetization] readUsdcTransfers: odczyt bloku nie powiodl sie:', error);
    return { ok: false, code: 'rpc_error', error: 'Could not read the block of this transaction. Retry in a moment.' };
  }

  return {
    ok: true,
    blockNumber: receipt.blockNumber,
    blockTimeSec,
    transfers: usdcTransfersFromLogs(receipt.logs),
  };
}
