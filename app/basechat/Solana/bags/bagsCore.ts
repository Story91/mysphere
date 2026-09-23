/**
 * Proof of Bags - czysta logika. Bez web3.js, bez sieci, bez Reacta.
 *
 * Post z Solany, ktory wspomina token, niesie w WLASNEJ transakcji dowod, ile
 * tego tokena autor mial w chwili publikacji. Mechanizm i jego pomiar:
 * docs/superpowers/specs/2026-09-23-proof-of-bags-design.md.
 *
 * Ten plik nie importuje @solana/web3.js celowo: czyta go i przycisk posta
 * (ladowany leniwie), i trasa serwerowa, i testy. Wszystko, co wymaga
 * PublicKey (wyprowadzanie ATA), siedzi w osobnym module.
 */

import {
  MEMO_PROGRAM_ADDRESS,
  MEMO_V1_PROGRAM_ADDRESS,
  parsePostMemo,
  type ParsedPostMemo,
} from '../config/solanaChain';

export const TOKEN_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM_ADDRESS = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

/**
 * Ile tokenow moze udowodnic jeden post. Trzy, bo kazdy dokłada do transakcji
 * konto (32 B) i adres w danych (44 B), a transakcja ma twardy limit 1232 B.
 * Post wymieniajacy wiecej niz trzy tokeny i tak nie jest shillem jednego.
 */
export const MAX_BAGS_MINTS = 3;

/** Ile kandydatow sprawdzamy na lancuchu, zanim zostana trzy prawdziwe minty. */
export const MAX_MINT_CANDIDATES = 10;

const BAGS_MEMO_PREFIX = 'mysphere:bags|v1|';

const BASE58 = '1-9A-HJ-NP-Za-km-z';
/**
 * Ciag base58 dlugosci adresu (32-44), NIE przylegajacy do innych znakow
 * base58. Warunek przylegania jest wazny: bez niego z 88-znakowego podpisu
 * transakcji wycielibysmy "adres", ktory nigdy nie istnial.
 */
const MINT_CANDIDATE = new RegExp(`(?<![${BASE58}])[${BASE58}]{32,44}(?![${BASE58}])`, 'g');

/**
 * Kandydaci na adres minta w tresci posta - w kolejnosci wystapienia, bez
 * powtorzen. Lapie gole adresy i adresy wewnatrz linkow (pump.fun, dexscreener,
 * birdeye, jup.ag, solscan), bo tam mint siedzi w sciezce URL-a.
 *
 * To sa TYLKO kandydaci. Adres portfela, pary DEX-owej albo zwykle slowo tej
 * dlugosci tez tu wpadna - odsiewa je dopiero sprawdzenie na lancuchu, czy
 * konto jest mintem.
 *
 * Cashtagi ($XYZ) swiadomie pomijamy: ticker nie wskazuje jednoznacznie
 * tokena, a podszywanie sie pod tickery to podstawowe narzedzie scamerow.
 */
export function extractMintCandidates(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(MINT_CANDIDATE)) {
    const candidate = match[0];
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

export function buildBagsMemo(mints: string[]): string {
  if (mints.length === 0 || mints.length > MAX_BAGS_MINTS) {
    throw new Error(`Proof of Bags carries 1-${MAX_BAGS_MINTS} mints, got ${mints.length}`);
  }
  return `${BAGS_MEMO_PREFIX}${mints.join(',')}`;
}

export function parseBagsMemo(memo: string): string[] | null {
  if (!memo.startsWith(BAGS_MEMO_PREFIX)) return null;
  const mints = memo.slice(BAGS_MEMO_PREFIX.length).split(',').filter(Boolean);
  if (mints.length === 0 || mints.length > MAX_BAGS_MINTS) return null;
  return mints;
}

/* ------------------------------------------------------------------ *
 * WERDYKT
 * ------------------------------------------------------------------ */

/**
 * Werdykty opisuja SALDO PORTFELA, nie intencje autora.
 *
 * Stad `reduced` i `emptied`, a nie "sold": spadek salda moze byc sprzedaza,
 * ale rownie dobrze przelewem na cold wallet. Odznaka "sold 82%" przy
 * przelewie bylaby nieprawda o konkretnym czlowieku - wiec ani nazwy w kodzie,
 * ani teksty w interfejsie nie twierdza wiecej, niz widac na lancuchu.
 */
export type BagsVerdict = 'no-position' | 'bought-after' | 'holding' | 'added' | 'reduced' | 'emptied';

/* Ksztalt odpowiedzi /api/bags/[postId] - tu, a nie w pliku trasy, zeby
 * komponent kliencki nie importowal niczego z kodu serwerowego. */
export interface BagsPositionDto {
  mint: string;
  symbol: string | null;
  name: string | null;
  icon: string | null;
  decimals: number;
  /** Surowe kwoty jako stringi - BigInt nie przechodzi przez JSON. */
  atPost: string;
  now: string;
  atPostUi: string;
  nowUi: string;
  verdict: BagsVerdict;
  changePct: number | null;
}

export type BagsResponse =
  | { status: 'ok'; signer: string; txHash: string; explorerUrl: string; blockTime: number | null; positions: BagsPositionDto[] }
  | { status: 'not-applicable' | 'not-found' | 'unverified' | 'no-proof' | 'error' };

/**
 * Co autor zrobil z tokenem od chwili posta.
 *
 * Na BigInt, nie na liczbach zmiennoprzecinkowych: memecoiny maja podazy rzedu
 * 10^15 jednostek i wiecej, a `Number` traci tam dokladnosc - "trzyma 100%"
 * potrafiloby wyjsc jako "spadek o 0,0000001%".
 */
export function computeVerdict(atPost: bigint, now: bigint): { verdict: BagsVerdict; changePct: number | null } {
  if (atPost === 0n) {
    return { verdict: now === 0n ? 'no-position' : 'bought-after', changePct: null };
  }
  if (now === atPost) return { verdict: 'holding', changePct: 0 };
  if (now === 0n) return { verdict: 'emptied', changePct: -100 };
  // Procent z dokladnoscia do setnych, liczony w calosci na BigInt.
  const changePct = Number(((now - atPost) * 10_000n) / atPost) / 100;
  return { verdict: now > atPost ? 'added' : 'reduced', changePct };
}

/**
 * Kwota tokena do odznaki: 1.24M, 1.84, 0.00012.
 *
 * Duze kwoty skracamy, ale male NIE moga wyjsc jako "0" - "wrzucil posta,
 * trzymajac 0 XYZ" przy niezerowej pozycji byloby klamstwem odznaki.
 */
export function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0';
  const value = Number(raw) / 10 ** decimals;
  if (value >= 1) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  }
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(value);
}

/* ------------------------------------------------------------------ *
 * ODCZYT DOWODU Z TRANSAKCJI
 *
 * Wejscie to zwykle dane (lista kluczy, instrukcje, salda), a nie obiekt
 * web3.js - dzieki temu ten sam kod czyta prawdziwa transakcje z RPC, wynik
 * symulacji i fixture w testach.
 * ------------------------------------------------------------------ */

export interface PlainInstruction {
  programId: string;
  accountIndexes: number[];
  data: Uint8Array;
}

export interface PlainTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  amount: string;
  decimals: number;
  programId?: string;
}

export interface PlainTransaction {
  feePayer: string;
  accountKeys: string[];
  instructions: PlainInstruction[];
  preBalances: number[];
  preTokenBalances: PlainTokenBalance[];
}

export interface BagsProofPosition {
  mint: string;
  /** Konto tokenowe z transakcji. Czy to ATA autora, sprawdza modul z web3.js. */
  ata: string;
  /** Saldo w chwili posta; `null`, gdy nie da sie go udowodnic. */
  atPost: bigint | null;
  decimals: number | null;
  /** Czy konto w ogole istnialo w chwili posta. */
  existed: boolean;
  /** Czy wlascicielem konta tokenowego jest ten, kto podpisal post. */
  ownerOk: boolean;
}

export interface BagsProof {
  postMemo: ParsedPostMemo | null;
  /** `null`, gdy transakcja nie niesie instrukcji Proof of Bags. */
  positions: BagsProofPosition[] | null;
}

const decoder = new TextDecoder();

export function readBagsProof(tx: PlainTransaction): BagsProof {
  let postMemo: BagsProof['postMemo'] = null;
  let positions: BagsProofPosition[] | null = null;

  for (const ix of tx.instructions) {
    if (ix.programId === MEMO_PROGRAM_ADDRESS && !postMemo) {
      postMemo = parsePostMemo(decoder.decode(ix.data));
      continue;
    }

    if (ix.programId !== MEMO_V1_PROGRAM_ADDRESS || positions) continue;
    const mints = parseBagsMemo(decoder.decode(ix.data));
    // Konta tokenowe stoja w instrukcji przed programami tokena, w kolejnosci
    // mintow w danych. Mniej kont niz mintow = instrukcja nie nasza.
    if (!mints || ix.accountIndexes.length < mints.length) continue;

    positions = mints.map((mint, i) => {
      const index = ix.accountIndexes[i];
      const ata = tx.accountKeys[index];
      const balance = tx.preTokenBalances.find(b => b.accountIndex === index);
      const existed = (tx.preBalances[index] ?? 0) > 0;

      if (balance) {
        const ownerOk = balance.owner === tx.feePayer && balance.mint === mint;
        return { mint, ata, atPost: BigInt(balance.amount), decimals: balance.decimals, existed: true, ownerOk };
      }
      if (!existed) {
        // Konto o zerowym saldzie lamportow nie istnialo - a nieistniejace
        // konto tokenowe to pozycja rowna zeru. To tez jest dowod.
        return { mint, ata, atPost: 0n, decimals: null, existed: false, ownerOk: true };
      }
      // Konto istnialo, ale runtime nie zapisal dla niego salda tokena - nie
      // wiemy, co to jest, wiec niczego nie twierdzimy.
      return { mint, ata, atPost: null, decimals: null, existed: true, ownerOk: false };
    });
  }

  return { postMemo, positions };
}
