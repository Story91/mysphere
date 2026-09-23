import 'server-only';
import { readServiceAccount } from '../../utils/auth/firebaseAdmin';
import { deriveAskSealKeys, type AskSealKeys } from '../../utils/asks/askSealCore';

/**
 * Klucze pieczeci Askow i flaga wdrozenia - jedyne miejsce, ktore czyta env.
 *
 * Czysta logika (wyprowadzanie klucza, MAC, odczyt pieczeci) mieszka
 * w app/utils/asks/askSealCore.ts, zeby testowala ja mocha. Tutaj tylko
 * skladamy wejscie: process.env i konto uslugowe tym samym parserem, ktorego
 * uzywa Firebase Admin (readServiceAccount) - inny parser na maszynie
 * z surowymi znakami nowej linii w .env dalby INNY klucz i kazda pieczec
 * z tej maszyny wychodzilaby na produkcji jako podrobka.
 */

let memo: AskSealKeys | null = null;

/**
 * Klucze pieczeci, liczone RAZ na proces.
 *
 * Kolejnosc (decyzja wlasciciela): podpisuje ASK_SEAL_SECRET, a bez niego
 * klucz z konta uslugowego. Sprawdzamy wszystkimi dostepnymi, lacznie
 * z ASK_SEAL_SECRET_PREVIOUS. Log mowi, KTORY klucz podpisuje - bez sekretu.
 */
export function askSealKeys(): AskSealKeys {
  if (memo) return memo;
  const keys = deriveAskSealKeys(process.env, readServiceAccount());
  memo = keys;

  if (keys.current) {
    console.info(
      `[asks/seals] Klucz pieczeci: ${keys.current.kid} (${keys.current.source}). ` +
        `Sprawdzamy kluczami: ${keys.all.map((key) => key.kid).join(', ')}.`
    );
  } else {
    // Jeden raz na proces - trasy Askow i tak odpowiadaja 503 store_unavailable.
    console.error(
      '[asks/seals] BRAK klucza pieczeci: nie ma ani ASK_SEAL_SECRET, ani klucza konta uslugowego ' +
        '(GOOGLE_CREDENTIALS). Kazda trasa Askow, ktora zapisuje, odpowie 503.'
    );
  }
  return keys;
}

/**
 * Flaga wdrozenia. Zmienia WYLACZNIE odczyt Askow BEZ zapieczetowanego stanu:
 * wylaczona - dzisiejsza semantyka ('legacy'), wlaczona - 'unverified' (bez
 * odslaniania, bez nowych odpowiedzi, bez pokazywania przyjec). Zapisy sa
 * scisle od pierwszego wdrozenia, niezaleznie od flagi. Czytana przy kazdym
 * zadaniu, zeby dalo sie ja przelaczyc bez nowego procesu.
 */
export function sealsEnforced(): boolean {
  return process.env.ASK_SEALS_ENFORCED === '1';
}
