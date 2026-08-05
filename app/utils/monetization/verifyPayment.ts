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

import { createPublicClient, http, parseEther, parseUnits, type Hash } from 'viem';
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
