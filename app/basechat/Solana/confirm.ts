/**
 * Potwierdzanie transakcji na Solanie - wspolne dla przycisku posta
 * (SolanaPostButton) i strony napiwku (/blink/tip).
 *
 * === DLACZEGO TO NIE JEST ZWYKLE `await confirmTransaction` ===
 *
 * Bo `confirmTransaction` rzuca wyjatkiem takze wtedy, gdy transakcja
 * ZOSTALA PRZYJETA. Zmierzone na mainnecie 22.09.2026, pierwszy post
 * wlasciciela:
 *
 *   podpis 3F7V48xEPn2zh2Ej5HPxua6rq...  ->  "has expired: block height
 *   exceeded"  ->  a w tej samej chwili na lancuchu: finalized, err: null,
 *   Memo Program wykonany, oplata 5413 lamportow pobrana.
 *
 * Aplikacja powiedziala "Transaction failed", posta NIE zapisala do
 * Firestore, a uzytkownik zaplacil i ma swoje memo na mainnecie NA STALE.
 *
 * Skad to sie bierze: blockhash jest wazny okolo 150 blokow, czyli mniej
 * wiecej minute. Odliczanie startuje w chwili jego pobrania - a POMIEDZY
 * pobraniem a wyslaniem stoi czlowiek czytajacy okno portfela.
 *
 * === ZASADA ===
 * Wygasniecie okna potwierdzania NIE jest odpowiedzia na pytanie "czy
 * transakcja przeszla". Odpowiedzia jest wylacznie stan podpisu na lancuchu,
 * wiec po wyjatku PYTAMY LANCUCH, zamiast zgadywac.
 *
 * `searchTransactionHistory` jest tu konieczne: bez niego RPC przeszukuje
 * tylko swiezy bufor i dla transakcji sprzed kilkudziesieciu sekund zwraca
 * `null`, czyli to samo, co "nie ma".
 */

import type { Connection } from '@solana/web3.js';

/** Ile razy pytamy o status po wygasnieciu okna. */
const STATUS_POLL_ATTEMPTS = 6;
/** Odstep miedzy pytaniami. 6 x 2,5 s = 15 s - tyle wystarcza, by RPC nadgonil. */
const STATUS_POLL_INTERVAL_MS = 2500;

export type ConfirmOutcome =
  /** Transakcja jest na lancuchu i nie zwrocila bledu. */
  | { kind: 'landed' }
  /** Transakcja jest na lancuchu, ale wykonala sie z bledem. */
  | { kind: 'failed'; detail: string }
  /** Okno wygaslo i po odpytaniu lancucha podpisu nadal nie ma. */
  | { kind: 'expired' };

export async function confirmOrAskChain(
  connection: Connection,
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number
): Promise<ConfirmOutcome> {
  try {
    const result = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    if (result.value.err) {
      return { kind: 'failed', detail: JSON.stringify(result.value.err) };
    }
    return { kind: 'landed' };
  } catch {
    // Okno potwierdzania wygaslo. To pytanie bez odpowiedzi, a nie odpowiedz -
    // patrz naglowek. Pytamy lancuch.
    for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
      try {
        const statuses = await connection.getSignatureStatuses([signature], {
          searchTransactionHistory: true,
        });
        const status = statuses.value[0];
        if (status) {
          if (status.err) {
            return { kind: 'failed', detail: JSON.stringify(status.err) };
          }
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            return { kind: 'landed' };
          }
        }
      } catch (statusError) {
        // Jedno nieudane pytanie o status nie konczy sprawdzania - RPC bywa
        // chwilowo niedostepny, a my mamy tu do rozstrzygniecia pieniadze.
        console.warn('Solana status check failed, retrying:', statusError);
      }
      await new Promise(resolve => setTimeout(resolve, STATUS_POLL_INTERVAL_MS));
    }
    // Po wygasnieciu blockhasha transakcja nie moze juz wejsc do bloku, wiec
    // brak podpisu po tych probach znaczy, ze naprawde nie przeszla.
    return { kind: 'expired' };
  }
}
