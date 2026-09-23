/**
 * KWOTY I FORMATY ASKOW NA SOLANIE - czysta logika, bezpieczna w przegladarce.
 *
 * ===========================================================================
 * DLACZEGO OSOBNY PLIK
 * ===========================================================================
 * Ten modul czytaja trzy strony naraz: serwer (pieczecie, weryfikacja
 * wyplaty), mocha i komponenty Askow w przegladarce (composer, karta).
 * Dlatego NIE importuje node:crypto ani niczego z '@solana/*' - jeden taki
 * import przeciagnalby modul serwerowy albo caly stack Solany do bundla feedu
 * (patrz naglowek app/basechat/Solana/config/solanaChain.ts).
 *
 * ===========================================================================
 * PRAWDA TO LAMPORTY
 * ===========================================================================
 * Aski USDC licza w centach (perAnswerFor w types.ts zaokragla do 0.01). Dla
 * SOL to nie dziala: 0.005 SOL zaokraglone do centa daje 0.00 albo 0.01 -
 * kwote, ktorej nikt nie obiecal. Wszystko, co dotyczy pieniedzy, liczymy
 * wiec w lamportach (1 SOL = 1e9 lamportow) na bigincie, a zapisujemy jako
 * dziesietne napisy (canonicalJson i Firestore nie przyjmuja biginta).
 * Liczby SOL (number) sluza WYLACZNIE do wyswietlania.
 */

/** 1 SOL w lamportach. */
export const LAMPORTS_PER_SOL = 1_000_000_000n;

/**
 * Minimum na jedna odpowiedz: 0.005 SOL. Zatwierdzone przez wlasciciela
 * 2026-09-23. 0.001 SOL lezy tuz nad minimum rent (890 880 lamportow) - pierwszy
 * przelew na puste konto odpowiadajacego po prostu by padl.
 */
export const MIN_PER_ANSWER_LAMPORTS = 5_000_000n;

/** Sufit budzetu jednego Aska: 1000 SOL. Bezpiecznik na literowke w kwocie. */
export const MAX_BUDGET_LAMPORTS = 1000n * LAMPORTS_PER_SOL;

/** Najwieksza wartosc u64 - wiecej lamportow nie zmiesci sie w instrukcji Transfer. */
const U64_MAX = 18_446_744_073_709_551_615n;

/** Ile miejsc po przecinku ma SOL. */
const SOL_DECIMALS = 9;

/* ------------------------------------------------------------------ */
/*  NAPISY LAMPORTOW                                                   */
/* ------------------------------------------------------------------ */

/**
 * Liczba lamportow zapisana dziesietnie, bez wiodacych zer, w zakresie u64.
 * Jedna postac na jedna liczbe - '05' i '5' dawalyby dwa rozne MAC-i.
 */
export function isLamportsString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value)) return false;
  return BigInt(value) <= U64_MAX;
}

function toLamports(value: bigint | string): bigint | null {
  if (typeof value === 'bigint') return value >= 0n && value <= U64_MAX ? value : null;
  return isLamportsString(value) ? BigInt(value) : null;
}

/**
 * Kwota SOL wpisana przez czlowieka -> lamporty, albo null.
 *
 * Przyjmuje przecinek jako separator ("0,5" - polska klawiatura), najwyzej
 * 9 miejsc po przecinku, bez znaku, bez wykladnika i bez separatorow tysiecy.
 * Wiecej niz 9 miejsc to blad, a nie zaokraglenie: po cichu obcieta kwota to
 * inna kwota niz ta, ktora ktos wpisal.
 */
export function parseSolToLamports(input: unknown): bigint | null {
  if (typeof input !== 'string') return null;
  const text = input.trim().replace(',', '.');
  const match = /^([0-9]*)(?:\.([0-9]*))?$/.exec(text);
  if (!match) return null;
  const whole = match[1] ?? '';
  const fraction = match[2] ?? '';
  if (whole === '' && fraction === '') return null;
  if (fraction.length > SOL_DECIMALS) return null;
  const lamports = BigInt(whole || '0') * LAMPORTS_PER_SOL + BigInt((fraction || '').padEnd(SOL_DECIMALS, '0') || '0');
  return lamports <= U64_MAX ? lamports : null;
}

/**
 * Lamporty -> napis SOL bez zbednych zer ("0.005", "1", "12.5"). Dokladny -
 * bez przejscia przez number. Zly napis daje '0' (to funkcja wyswietlania).
 */
export function formatLamports(lamports: bigint | string): string {
  const value = toLamports(lamports);
  if (value === null) return '0';
  const whole = value / LAMPORTS_PER_SOL;
  const fraction = (value % LAMPORTS_PER_SOL).toString().padStart(SOL_DECIMALS, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Lamporty -> liczba SOL. TYLKO do wyswietlania i do pola `budget` lustra. */
export function lamportsToSolNumber(lamports: bigint | string): number {
  return Number(formatLamports(lamports));
}

/**
 * Stawka za jedna odpowiedz: floor(budzet / miejsca). W dol, jak perAnswerFor:
 * suma wyplat nigdy nie przekroczy budzetu, reszta (najwyzej seats-1
 * lamportow) zostaje u autora. 0n przy zlych danych.
 */
export function perAnswerLamportsFor(budgetLamports: bigint | string, seats: number): bigint {
  const budget = toLamports(budgetLamports);
  if (budget === null || !Number.isSafeInteger(seats) || seats <= 0) return 0n;
  return budget / BigInt(seats);
}

/* ------------------------------------------------------------------ */
/*  MEMO WYPLATY                                                       */
/* ------------------------------------------------------------------ */

/** Poczatek memo wyplaty. Wszystko, co tak sie zaczyna, jest "memo Aska". */
export const ASK_PAYOUT_MEMO_PREFIX = 'mysphere:ask|';

const ASK_PAYOUT_MEMO_VERSION = 'v1';

/** Ta sama regula co isDocId w askSealCore.ts (tamten plik ciagnie node:crypto). */
const DOC_ID = /^[A-Za-z0-9]{1,64}$/;

/**
 * Cale memo wyplaty: `mysphere:ask|v1|<askId>|<answerId>`. Memo wiaze przelew
 * z JEDNA odpowiedzia - bez niego przelew autor -> odpowiadajacy nie mowi, za
 * co zaplacono (ta sama luka, ktora na Base zamyka granica starego swiata).
 * Rzuca przy zlym id: to blad programisty, nie danych.
 */
export function buildAskPayoutMemo(askId: string, answerId: string): string {
  if (!DOC_ID.test(askId) || !DOC_ID.test(answerId)) throw new TypeError('buildAskPayoutMemo: invalid Ask or answer id');
  return `${ASK_PAYOUT_MEMO_PREFIX}${ASK_PAYOUT_MEMO_VERSION}|${askId}|${answerId}`;
}

/** Memo wyplaty -> identyfikatory, albo null. Dokladnie 4 pola, oba id przez DOC_ID. */
export function parseAskPayoutMemo(memo: string): { askId: string; answerId: string } | null {
  if (typeof memo !== 'string' || !memo.startsWith(ASK_PAYOUT_MEMO_PREFIX)) return null;
  const parts = memo.split('|');
  if (parts.length !== 4 || parts[1] !== ASK_PAYOUT_MEMO_VERSION) return null;
  const [, , askId, answerId] = parts;
  if (!DOC_ID.test(askId) || !DOC_ID.test(answerId)) return null;
  return { askId, answerId };
}

/* ------------------------------------------------------------------ */
/*  WIADOMOSC POWIAZANIA PORTFELA                                      */
/* ------------------------------------------------------------------ */

/** Waznosc challenge'u powiazania: 10 minut (patrz solanaAskCore.ts). */
export const SOLANA_BINDING_TTL_MS = 10 * 60 * 1000;

/**
 * Tekst, ktory portfel Solany podpisuje przy powiazaniu z kontem EVM.
 *
 * Serwer odtwarza go BAJT W BAJT z (evm, solana, nonce, issuedAtMs) i dopiero
 * ten odtworzony tekst sprawdza podpisem ed25519 - tresci z przegladarki nie
 * weryfikujemy nigdy. Dlatego format jest tutaj, w jednym miejscu, i nie wolno
 * go zmieniac bez podbicia wersji challenge'u (stare podpisy przestalyby
 * pasowac w trakcie 10-minutowego okna).
 */
export function buildSolanaBindingMessage(input: {
  solana: string;
  evm: string;
  nonce: string;
  issuedAtMs: number;
}): string {
  const issued = new Date(input.issuedAtMs).toISOString();
  const expires = new Date(input.issuedAtMs + SOLANA_BINDING_TTL_MS).toISOString();
  return [
    'mysphere: link a Solana wallet to Asks',
    '',
    `Solana wallet: ${input.solana}`,
    `Account: ${input.evm.toLowerCase()}`,
    'Use: receive SOL for accepted answers and pay SOL on your own Asks',
    `Nonce: ${input.nonce}`,
    `Issued at: ${issued}`,
    `Expires at: ${expires}`,
    '',
    'This signature is free and does not move funds.',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/*  SZYNA                                                              */
/* ------------------------------------------------------------------ */

/**
 * Czy Ask placi w SOL na Solanie. Dla przegladarki (karta, composer) - serwer
 * decyduje ze STANU (railOf w askSealCore.ts), nigdy z lustra.
 */
export function isSolAsk(ask: { token?: unknown; network?: unknown } | null | undefined): boolean {
  return !!ask && ask.token === 'SOL' && ask.network === 'solana';
}
