import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isSolanaAddress, isSolanaSignature } from '../../basechat/Solana/replies/replyCore';
import { toMillis } from '../firestoreTime';
import { toAsk } from './askMapping';
import {
  MAX_BUDGET_LAMPORTS,
  MIN_PER_ANSWER_LAMPORTS,
  formatLamports,
  isLamportsString,
  lamportsToSolNumber,
  perAnswerLamportsFor,
} from './solAmounts';
import { MAX_SEATS, perAnswerFor, type Ask, type AskFunding, type AskStatus } from './types';

/**
 * PIECZECIE ASKOW - czysta logika, bez Firestore i bez 'server-only'.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Dokumenty `asks` i `askAnswers` zapisuje dzis kazda przegladarka (reguly
 * Firestore pilnuja tylko kilku pol). Status "resolved", licznik przyjec,
 * flaga "accepted" przy odpowiedzi - wszystko to da sie podrobic z devtools,
 * a serwer na tych polach podejmowal decyzje o PIENIADZACH i o tym, komu
 * odslonic zapieczetowane odpowiedzi.
 *
 * Prawda przenosi sie wiec do dokumentow, ktorych przegladarka nie dotknie
 * (asks/{id}/sealed/state, asks/{id}/acceptances/*, asks/{id}/answerers/*,
 * askAnswerContent/_registry/payouts/*), a kazdy z nich niesie HMAC liczony
 * kluczem, ktory zna tylko serwer. HMAC chroni przed PODROBKA (gdyby sciezka
 * kiedys sie otworzyla), sciezka zamknieta regulami chroni przed
 * SKASOWANIEM i COFNIECIEM - jedno nie zastepuje drugiego.
 *
 * Ten plik nie importuje 'server-only' celowo: mocha laduje go wprost
 * (test/asksSeals.test.ts). Klucz z env i z konta uslugowego sklada
 * app/api/asks/askSeals.ts - tutaj konto uslugowe przychodzi PARAMETREM.
 *
 * ===========================================================================
 * ZASADA, KTOREJ PILNUJE KAZDY WOLAJACY (patrz naglowek askStore.ts)
 * ===========================================================================
 * Funkcja, ktora ZAPISUJE pieczec, bierze dane wylacznie z: waznych pieczeci,
 * dowodow z lancucha pobranych w tym zadaniu i pol zamrozonych regulami
 * (author, budget, seats, deadline, funding). Nigdy z lustra (accepted,
 * acceptedCount, status, token, network, escrow*).
 */

/* ------------------------------------------------------------------ */
/*  BLAD DOMENOWY                                                      */
/* ------------------------------------------------------------------ */

/**
 * Blad z kodem i statusem HTTP. Rzucany takze WEWNATRZ transakcji Firestore -
 * runTransaction przepuszcza go do wolajacego bez ponawiania, wiec trasa
 * mapuje go 1:1 na odpowiedz.
 */
export class AskError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AskError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/* ------------------------------------------------------------------ */
/*  FORMATY                                                            */
/* ------------------------------------------------------------------ */

/**
 * Identyfikator dokumentu, ktory wolno podac do admin `doc()`.
 *
 * Bez tej bramki `params.id` = 'X/sealed/state' adresuje zapieczetowany stan
 * cudzego Aska, a set(merge) lustra pisze prosto w niego. Znak '_' tez odpada,
 * wiec zadna trasa nie dosiegnie askAnswerContent/_registry.
 */
export function isDocId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9]{1,64}$/.test(id);
}

/** Adres EVM w dowolnej wielkosci liter -> malymi literami, albo null. */
export function lowerAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** Hash transakcji w dowolnej wielkosci liter -> malymi literami, albo null. */
export function lowerTxHash(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

const LOWER_ADDRESS = /^0x[0-9a-f]{40}$/;
const LOWER_HASH = /^0x[0-9a-f]{64}$/;
/** Liczba calkowita >= 0 zapisana dziesietnie, bez wiodacych zer. */
const UINT_DECIMAL = /^(0|[1-9][0-9]{0,77})$/;

const isLowerAddress = (v: unknown): v is string => typeof v === 'string' && LOWER_ADDRESS.test(v);
const isLowerHash = (v: unknown): v is string => typeof v === 'string' && LOWER_HASH.test(v);
const isUintDecimal = (v: unknown): v is string => typeof v === 'string' && UINT_DECIMAL.test(v);
const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 32 znaki hex malymi literami - nonce powiazania portfela. */
const isNonceHex = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);

/* ------------------------------------------------------------------ */
/*  SZYNA (USDC na Base albo SOL na Solanie)                           */
/* ------------------------------------------------------------------ */

/**
 * Czym Ask placi. Zamrozone w stanie przy tworzeniu. Adresy i podpisy Solany
 * to base58 - wielkosc liter jest czescia wartosci, wiec NIGDY nie przechodza
 * przez lowerAddress / lowerTxHash / toLowerCase (inny zapis = inny klucz).
 */
export type AskRail = 'usdc-base' | 'sol-solana';

export type SolanaClusterName = 'devnet' | 'mainnet-beta';

const SOLANA_CLUSTERS: readonly SolanaClusterName[] = ['devnet', 'mainnet-beta'];

export const isSolanaClusterName = (v: unknown): v is SolanaClusterName =>
  SOLANA_CLUSTERS.includes(v as SolanaClusterName);

/**
 * Szyna ze stanu albo z widoku zbudowanego ze stanu. Wolajacy podaje
 * SealedAskState albo AskView - NIGDY surowy dokument asks/{id}, bo jego
 * `network` przestawi kazda przegladarka.
 */
export function railOf(source: { network?: unknown } | null | undefined): AskRail {
  return source?.network === 'solana' ? 'sol-solana' : 'usdc-base';
}

/* ------------------------------------------------------------------ */
/*  KLUCZE                                                             */
/* ------------------------------------------------------------------ */

/** Separacja domen: ten sam sekret nie moze dac klucza rejestru Solany. */
export const ASK_SEAL_KEY_DOMAIN = 'mysphere:ask-seal:v1';

export type AskSealKeySource = 'env' | 'env-previous' | 'service-account';

export type AskSealKey = {
  /** Jawny identyfikator klucza, zapisywany przy pieczeci POZA MAC. */
  kid: string;
  key: Buffer;
  source: AskSealKeySource;
};

export type AskSealKeys = {
  /** Klucz, ktorym PODPISUJEMY nowe pieczecie. null = nie ma czym. */
  current: AskSealKey | null;
  /** Wszystkie klucze, ktorymi wolno SPRAWDZAC (bez duplikatow po kid). */
  all: AskSealKey[];
};

/** Zgodne z process.env, ale bez ciagniecia typow Node do testow. */
export type AskSealEnv = Record<string, string | undefined>;

/** Tylko te dwa pola konta uslugowego sa potrzebne. */
export type ServiceAccountFields =
  | { private_key?: unknown; private_key_id?: unknown }
  | null
  | undefined;

function keyFromSecret(secret: string, source: AskSealKeySource): AskSealKey {
  // Odcisk sekretu w kid (8 znakow sha256) - ten sam schemat co envKey()
  // w receiptRegistry.ts. Mowi, KTORY sekret podpisal, nie zdradzajac go.
  const fingerprint = createHash('sha256').update(secret).digest('hex').slice(0, 8);
  return {
    kid: `ask:${fingerprint}`,
    key: createHmac('sha256', secret).update(ASK_SEAL_KEY_DOMAIN).digest(),
    source,
  };
}

function keyFromServiceAccount(account: ServiceAccountFields): AskSealKey | null {
  if (!account) return null;
  const { private_key: privateKeyRaw, private_key_id: keyId } = account;
  if (typeof privateKeyRaw !== 'string' || typeof keyId !== 'string') return null;
  // Klucz PEM bywa zapisany z `\n` jako sekwencja albo jako nowa linia -
  // sprowadzamy do jednej postaci, zeby JSON i base64 dawaly ten sam klucz.
  // 1:1 z serviceAccountKey() w receiptRegistry.ts.
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  if (privateKey.trim() === '' || keyId.trim() === '') return null;
  return {
    kid: `ask-sa:${keyId.slice(0, 12)}`,
    key: createHmac('sha256', privateKey).update(ASK_SEAL_KEY_DOMAIN).digest(),
    source: 'service-account',
  };
}

/**
 * Klucze pieczeci z env i z konta uslugowego.
 *
 * DECYZJA WLASCICIELA (2026-09-23): ASK_SEAL_SECRET NIE jest obowiazkowy.
 * - Podpisuje ASK_SEAL_SECRET, gdy jest ustawiony; bez niego - klucz
 *   wyprowadzony z klucza prywatnego konta uslugowego (ten sam wzorzec co
 *   rejestr kwitow Solany). Dzieki temu kazdy build z GOOGLE_CREDENTIALS
 *   umie pieczetowac bez dodatkowej zmiennej.
 * - Sprawdzamy KAZDYM dostepnym kluczem: env, ASK_SEAL_SECRET_PREVIOUS (tylko
 *   do sprawdzania, nigdy do podpisu) i konto uslugowe. Wlaczenie sekretu
 *   w env po czasie nie uniewaznia wiec pieczeci z klucza konta.
 * - NIGDY AUTH_SESSION_SECRET: rotacja sekretu sesji to zwykla operacja i nie
 *   moze po cichu uniewaznic wszystkich pieczeci (to samo uzasadnienie co
 *   w receiptRegistry.ts).
 *
 * `serviceAccount` przychodzi parametrem (readServiceAccount() w askSeals.ts),
 * zeby ten plik dalo sie testowac bez Firebase.
 */
export function deriveAskSealKeys(env: AskSealEnv, serviceAccount?: ServiceAccountFields): AskSealKeys {
  const secret = env.ASK_SEAL_SECRET?.trim() || '';
  const previous = env.ASK_SEAL_SECRET_PREVIOUS?.trim() || '';

  const fromEnv = secret ? keyFromSecret(secret, 'env') : null;
  const fromPrevious = previous && previous !== secret ? keyFromSecret(previous, 'env-previous') : null;
  const fromAccount = keyFromServiceAccount(serviceAccount);

  const all: AskSealKey[] = [];
  for (const candidate of [fromEnv, fromPrevious, fromAccount]) {
    if (candidate && !all.some((existing) => existing.kid === candidate.kid)) all.push(candidate);
  }

  return { current: fromEnv ?? fromAccount, all };
}

/** Klucz o danym kid albo null. Nieznany kid NIE jest "brakiem pieczeci". */
export function keyForKid(keys: AskSealKeys, kid: unknown): Buffer | null {
  if (typeof kid !== 'string' || kid === '') return null;
  return keys.all.find((candidate) => candidate.kid === kid)?.key ?? null;
}

/* ------------------------------------------------------------------ */
/*  KANONICZNY JSON I MAC                                              */
/* ------------------------------------------------------------------ */

/**
 * JSON z posortowanymi kluczami - jeden ciag bajtow dla tych samych danych,
 * niezaleznie od kolejnosci pol po odczycie z Firestore.
 *
 * RZUCA na undefined, NaN, Infinity, bigint i obiektach innych niz zwykle
 * (Date, Timestamp, Buffer). Ciche zamiany (undefined -> null, bigint ->
 * string) dalyby dwa rozne zapisy tego samego podpisu po obu stronach
 * odczytu - pieczec psulaby sie bez sladu. Wolajacy podaje null jawnie,
 * a kwoty w jednostkach i sekundy jako dziesietne stringi.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError('canonicalJson: only plain objects are allowed');
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    default:
      // undefined, bigint, function, symbol
      throw new TypeError(`canonicalJson: unsupported value of type ${typeof value}`);
  }
}

/** Domeny MAC - jedna na rodzaj dokumentu, zeby podpisu nie dalo sie przeniesc. */
export const SEAL_DOMAINS = {
  state: 'askstate:v1',
  accept: 'askaccept:v1',
  payout: 'askpayout:v1',
  answerer: 'askanswerer:v1',
  /** Odbiorca SOL zamrozony przy odpowiedzi - asks/{id}/payees/{answerId}. */
  payee: 'askpayee:v1',
  /** Powiazanie portfela Solany z kontem EVM - _registry/solanaWallets/{evm}. */
  solBind: 'asksolbind:v1',
  /** Bezstanowy challenge powiazania (solanaAskCore.ts). */
  solChallenge: 'asksolchallenge:v1',
} as const;

export type SealDomain = (typeof SEAL_DOMAINS)[keyof typeof SEAL_DOMAINS];

/** hex HMAC-SHA256(key, domain + '|' + canonicalJson(payload)). */
export function sealMac(key: Buffer, domain: SealDomain, payload: unknown): string {
  return createHmac('sha256', key).update(`${domain}|${canonicalJson(payload)}`).digest('hex');
}

/**
 * Wynik sprawdzenia pieczeci. CZTERY sytuacje, nie dwie:
 * - absent  - dokumentu nie ma (Ask sprzed pieczeci),
 * - valid   - podpis sie zgadza,
 * - invalid - dokument JEST, ale nie da sie mu zaufac. Wolajacy odpowiada
 *   503 i NIGDY go nie nadpisuje automatycznie. Zlaczenie tego z 'absent'
 *   konczyloby sie adopcja: zepsuta pieczec rozstrzygnietego Aska zostalaby
 *   zastapiona nowa ze statusem 'open'.
 *   Powody: malformed (zly ksztalt), unknown_kid (podpisal klucz, ktorego ten
 *   serwer nie zna), bad_mac (podrobka), wrong_binding (prawdziwy podpis,
 *   ale dokument lezy pod cudza sciezka).
 */
export type SealInvalidReason = 'malformed' | 'unknown_kid' | 'bad_mac' | 'wrong_binding';

export type SealCheck<T> =
  | { kind: 'absent' }
  | { kind: 'valid'; value: T; kid: string }
  | { kind: 'invalid'; reason: SealInvalidReason };

/**
 * Sprawdza MAC juz wybranego ladunku. `payload` musi byc dokladnie tym
 * obiektem, ktory byl podpisany (pola wybrane funkcja pick*), nigdy surowym
 * dokumentem - dodatkowe pola (sealedAt, recordedAt, smieci) nie wchodza
 * do MAC i nie moga go zepsuc.
 */
export function verifySealed<T>(
  keys: AskSealKeys,
  domain: SealDomain,
  payload: T,
  mac: unknown,
  kid: unknown
): SealCheck<T> {
  if (typeof mac !== 'string' || !/^[0-9a-f]{64}$/.test(mac)) return { kind: 'invalid', reason: 'malformed' };
  if (typeof kid !== 'string' || kid === '') return { kind: 'invalid', reason: 'malformed' };
  const key = keyForKid(keys, kid);
  if (!key) return { kind: 'invalid', reason: 'unknown_kid' };

  let expectedHex: string;
  try {
    expectedHex = sealMac(key, domain, payload);
  } catch {
    return { kind: 'invalid', reason: 'malformed' };
  }
  const expected = Buffer.from(expectedHex, 'hex');
  const given = Buffer.from(mac, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { kind: 'invalid', reason: 'bad_mac' };
  }
  return { kind: 'valid', value: payload, kid };
}

/** Ladunek + mac + kid - tak lezy kazda pieczec w Firestore. */
export type SealedDoc<T> = T & { mac: string; kid: string };

function sealDoc<T extends object>(key: AskSealKey, domain: SealDomain, payload: T): SealedDoc<T> {
  return { ...payload, mac: sealMac(key.key, domain, payload), kid: key.kid };
}

type RawDoc = Record<string, unknown> | null | undefined;

/* ------------------------------------------------------------------ */
/*  ZAPIECZETOWANY STAN ASKA - asks/{askId}/sealed/state               */
/* ------------------------------------------------------------------ */

export type AskOrigin = 'session' | 'x402' | 'legacy' | 'adopted';
export type AskResolveKind = 'author' | 'auto-full' | 'escrow' | 'legacy';

/**
 * Warunki escrow tego Aska - z LANCUCHA, nigdy z dokumentu.
 * source 'fund-log'  - z logu AskFunded transakcji fund (nowe Aski),
 * source 'escrowFor' - z odczytu escrowFor(author, askId) (Aski sprzed
 *                      pieczeci; nagrobek perAnswer zostaje na zawsze).
 * Kwoty i sekundy jako dziesietne stringi - patrz canonicalJson.
 */
export type SealedEscrow = {
  chainId: number;
  contract: string;
  fundTxHash: string | null;
  perAnswerUnits: string;
  seats: number;
  deadlineSec: string;
  source: 'fund-log' | 'escrowFor';
};

/**
 * Warunki Aska SOL - istnieja WYLACZNIE przy network 'solana'.
 * - cluster          klaster z chwili tworzenia; accept na innym -> wrong_cluster,
 * - payer            portfel Solany autora (z powiazania), zrodlo kazdej wyplaty;
 *                    base58, wielkosc liter zachowana,
 * - budgetLamports   prawda o budzecie (dziesietnie),
 * - perAnswerLamports floor(budget / seats) - policzone RAZ, sprawdzane przy odczycie.
 */
export type SealedSolanaTerms = {
  cluster: SolanaClusterName;
  payer: string;
  budgetLamports: string;
  perAnswerLamports: string;
};

export type SealedAskState = {
  v: 1;
  askId: string;
  /** Malymi literami. */
  author: string;
  funding: AskFunding;
  token: 'USDC' | 'SOL';
  network: 'base' | 'solana';
  /**
   * Dla SOL: liczba SOL do wyswietlania, zawsze rowna
   * lamportsToSolNumber(solana.budgetLamports) - sprawdzane przy odczycie.
   */
  budget: number;
  seats: number;
  /** ms */
  deadline: number;
  origin: AskOrigin;
  escrow: SealedEscrow | null;
  status: AskStatus;
  resolvedAt: number | null;
  resolveKind: AskResolveKind | null;
  resolveTxHash: string | null;
  expiredTxHash: string | null;
  expiredLogIndex: number | null;
  /**
   * Tylko Aski SOL. Klucza NIE MA w ogole w stanie Base (nie undefined, nie
   * null) - ladunek MAC Base musi zostac bajt w bajt taki jak przed Solana,
   * inaczej wszystkie istniejace pieczecie przestalyby sie zgadzac
   * (zlote wektory w test/asksSeals.test.ts).
   */
  solana?: SealedSolanaTerms;
};

const ORIGINS: readonly AskOrigin[] = ['session', 'x402', 'legacy', 'adopted'];
const RESOLVE_KINDS: readonly AskResolveKind[] = ['author', 'auto-full', 'escrow', 'legacy'];
const STATUSES: readonly AskStatus[] = ['open', 'resolved', 'expired'];

function pickEscrow(raw: unknown): SealedEscrow | null | undefined {
  // undefined = zly ksztalt, null = brak escrow (swiadomie zapisany null)
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const e = raw as Record<string, unknown>;
  if (!(typeof e.chainId === 'number' && Number.isSafeInteger(e.chainId) && e.chainId > 0)) return undefined;
  if (!isLowerAddress(e.contract)) return undefined;
  if (!(e.fundTxHash === null || isLowerHash(e.fundTxHash))) return undefined;
  if (!isUintDecimal(e.perAnswerUnits) || e.perAnswerUnits === '0') return undefined;
  if (!(typeof e.seats === 'number' && Number.isSafeInteger(e.seats) && e.seats >= 1)) return undefined;
  if (!isUintDecimal(e.deadlineSec)) return undefined;
  if (e.source !== 'fund-log' && e.source !== 'escrowFor') return undefined;
  return {
    chainId: e.chainId,
    contract: e.contract,
    fundTxHash: e.fundTxHash,
    perAnswerUnits: e.perAnswerUnits,
    seats: e.seats,
    deadlineSec: e.deadlineSec,
    source: e.source,
  };
}

/**
 * Wybiera i sprawdza pola stanu. null = zly ksztalt (-> invalid/malformed).
 *
 * Rozgalezienie po `network`: galaz Base zwraca DOKLADNIE dzisiejszy zestaw
 * kluczy (zlote wektory), galaz Solany - ten sam zestaw plus `solana`.
 * Dokument Base z doklejonym kluczem `solana` przechodzi galezia Base, a obcy
 * klucz nie wchodzi do ladunku - nie zmienia MAC ani niczego nie obiecuje.
 */
function pickState(raw: Record<string, unknown>): SealedAskState | null {
  return raw.network === 'solana' ? pickSolanaState(raw) : pickBaseState(raw);
}

/**
 * Niezmienniki Aska SOL. Kazdy z nich dotyczy pieniedzy albo tego, skad
 * pieniadze wyjda, wiec stan, ktory ktoregos nie spelnia, jest 'malformed'
 * (503), a nie "prawie dobry":
 * - tylko 'on-resolve' bez escrow (escrow istnieje tylko na Base),
 * - origin 'session' (x402 zostaje w USDC, adopcja dotyczy Askow sprzed pieczeci),
 * - platnik base58 w oryginalnej wielkosci liter,
 * - budzet w (0, 1000 SOL], stawka = floor(budzet / miejsca) >= 0.005 SOL,
 * - `budget` (liczba) rowny budzetowi z lamportow - dwie prawdy o kwocie to
 *   o jedna za duzo,
 * - brak hashy EVM (resolve/expire escrow) i rozstrzygniec 'escrow'/'legacy'.
 */
function pickSolanaState(raw: Record<string, unknown>): SealedAskState | null {
  if (raw.v !== 1) return null;
  if (!isDocId(raw.askId)) return null;
  if (!isLowerAddress(raw.author)) return null;
  if (raw.funding !== 'on-resolve') return null;
  if (raw.token !== 'SOL' || raw.network !== 'solana') return null;
  if (!(typeof raw.seats === 'number' && Number.isSafeInteger(raw.seats) && raw.seats >= 1 && raw.seats <= MAX_SEATS)) return null;
  if (!isFiniteNumber(raw.deadline) || raw.deadline <= 0) return null;
  if (raw.origin !== 'session') return null;
  if (raw.escrow !== null) return null;
  if (!STATUSES.includes(raw.status as AskStatus)) return null;
  if (!(raw.resolvedAt === null || isFiniteNumber(raw.resolvedAt))) return null;
  if (!(raw.resolveKind === null || raw.resolveKind === 'author' || raw.resolveKind === 'auto-full')) return null;
  if (raw.resolveTxHash !== null || raw.expiredTxHash !== null || raw.expiredLogIndex !== null) return null;

  const terms = pickSolanaTerms(raw.solana, raw.seats);
  if (!terms) return null;
  if (!isFiniteNumber(raw.budget) || raw.budget !== lamportsToSolNumber(terms.budgetLamports)) return null;

  return {
    v: 1,
    askId: raw.askId,
    author: raw.author,
    funding: 'on-resolve',
    token: 'SOL',
    network: 'solana',
    budget: raw.budget,
    seats: raw.seats,
    deadline: raw.deadline,
    origin: 'session',
    escrow: null,
    status: raw.status as AskStatus,
    resolvedAt: raw.resolvedAt as number | null,
    resolveKind: raw.resolveKind as AskResolveKind | null,
    resolveTxHash: null,
    expiredTxHash: null,
    expiredLogIndex: null,
    solana: terms,
  };
}

function pickSolanaTerms(raw: unknown, seats: number): SealedSolanaTerms | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  if (!isSolanaClusterName(t.cluster)) return null;
  // isSolanaAddress sprawdza base58 i 32 bajty - bez zadnej normalizacji.
  // Adres zapisany malymi literami to INNY (albo zaden) klucz publiczny.
  if (!isSolanaAddress(t.payer)) return null;
  if (!isLamportsString(t.budgetLamports) || !isLamportsString(t.perAnswerLamports)) return null;
  const budget = BigInt(t.budgetLamports);
  if (budget <= 0n || budget > MAX_BUDGET_LAMPORTS) return null;
  const perAnswer = perAnswerLamportsFor(budget, seats);
  if (perAnswer < MIN_PER_ANSWER_LAMPORTS || perAnswer.toString() !== t.perAnswerLamports) return null;
  return {
    cluster: t.cluster,
    payer: t.payer,
    budgetLamports: t.budgetLamports,
    perAnswerLamports: t.perAnswerLamports,
  };
}

/** Galaz Base - bez zmian od wdrozenia pieczeci (zlote wektory). */
function pickBaseState(raw: Record<string, unknown>): SealedAskState | null {
  if (raw.v !== 1) return null;
  if (!isDocId(raw.askId)) return null;
  if (!isLowerAddress(raw.author)) return null;
  if (raw.funding !== 'on-resolve' && raw.funding !== 'escrowed') return null;
  if (raw.token !== 'USDC' || raw.network !== 'base') return null;
  if (!isFiniteNumber(raw.budget) || raw.budget <= 0) return null;
  if (!(typeof raw.seats === 'number' && Number.isSafeInteger(raw.seats) && raw.seats >= 1)) return null;
  if (!isFiniteNumber(raw.deadline) || raw.deadline <= 0) return null;
  if (!ORIGINS.includes(raw.origin as AskOrigin)) return null;
  const escrow = pickEscrow(raw.escrow);
  if (escrow === undefined) return null;
  if (!STATUSES.includes(raw.status as AskStatus)) return null;
  if (!(raw.resolvedAt === null || isFiniteNumber(raw.resolvedAt))) return null;
  if (!(raw.resolveKind === null || RESOLVE_KINDS.includes(raw.resolveKind as AskResolveKind))) return null;
  if (!(raw.resolveTxHash === null || isLowerHash(raw.resolveTxHash))) return null;
  if (!(raw.expiredTxHash === null || isLowerHash(raw.expiredTxHash))) return null;
  if (!(raw.expiredLogIndex === null || isIndex(raw.expiredLogIndex))) return null;

  return {
    v: 1,
    askId: raw.askId,
    author: raw.author,
    funding: raw.funding,
    token: 'USDC',
    network: 'base',
    budget: raw.budget,
    seats: raw.seats,
    deadline: raw.deadline,
    origin: raw.origin as AskOrigin,
    escrow,
    status: raw.status as AskStatus,
    resolvedAt: raw.resolvedAt as number | null,
    resolveKind: raw.resolveKind as AskResolveKind | null,
    resolveTxHash: raw.resolveTxHash as string | null,
    expiredTxHash: raw.expiredTxHash as string | null,
    expiredLogIndex: raw.expiredLogIndex as number | null,
  };
}

/**
 * Stan gotowy do zapisu: wybrane pola + mac + kid.
 *
 * Rzuca, gdy stan ma zly ksztalt albo jest wewnetrznie sprzeczny (escrowed
 * bez warunkow escrow). Zapis takiej pieczeci dalby dokument, ktory przy
 * odczycie wyszedlby 'invalid' - lepiej, zeby blad wybuchl tu i teraz.
 */
export function sealStateDoc(key: AskSealKey, state: SealedAskState): SealedDoc<SealedAskState> {
  const picked = pickState(state as unknown as Record<string, unknown>);
  if (!picked) throw new AskError('seal_write_malformed', 500, 'Refusing to seal a malformed Ask state.');
  if ((picked.funding === 'escrowed') !== (picked.escrow !== null)) {
    throw new AskError('seal_write_malformed', 500, 'An escrowed Ask state must carry its escrow terms, and only then.');
  }
  return sealDoc(key, SEAL_DOMAINS.state, picked);
}

/**
 * Odczyt stanu. Wymaga, zeby raw.askId byl identyfikatorem z SCIEZKI - stan
 * przeniesiony pod inny Ask wychodzi 'invalid', nie 'valid'.
 */
export function readSealedState(keys: AskSealKeys, askId: string, raw: RawDoc): SealCheck<SealedAskState> {
  if (!raw) return { kind: 'absent' };
  const picked = pickState(raw);
  if (!picked) return { kind: 'invalid', reason: 'malformed' };
  const check = verifySealed(keys, SEAL_DOMAINS.state, picked, raw.mac, raw.kid);
  if (check.kind !== 'valid') return check;
  if (picked.askId !== askId) return { kind: 'invalid', reason: 'wrong_binding' };
  return check;
}

/* ------------------------------------------------------------------ */
/*  PRZYJECIE ODPOWIEDZI - asks/{askId}/acceptances/{answerId}         */
/* ------------------------------------------------------------------ */

/**
 * transfer    - bezposredni przelew USDC od autora Aska do odpowiadajacego,
 * escrow-seat - log SeatAwarded z kontraktu escrow,
 * legacy-weak - stary zapis, w ktorym przelew do odpowiadajacego jest, ale
 *               nie od autora albo sprzed odpowiedzi. Powstaje WYLACZNIE
 *               z jawnej decyzji wlasciciela (reseal, trustWeak).
 */
export type AcceptanceKind = 'transfer' | 'escrow-seat' | 'legacy-weak';

export type AcceptanceRecord = {
  v: 1;
  askId: string;
  answerId: string;
  /** Odpowiadajacy, malymi literami. */
  payee: string;
  kind: AcceptanceKind;
  chainId: number;
  /** Malymi literami. */
  txHash: string;
  logIndex: number;
  /** Jednostki bazowe USDC, dziesietnie. */
  units: string;
  /** Transfer.from albo adres kontraktu escrow. Malymi literami. */
  from: string;
  token: 'USDC';
  network: 'base';
};

const ACCEPTANCE_KINDS: readonly AcceptanceKind[] = ['transfer', 'escrow-seat', 'legacy-weak'];

function pickAcceptance(raw: Record<string, unknown>): AcceptanceRecord | null {
  if (raw.v !== 1) return null;
  if (!isDocId(raw.askId) || !isDocId(raw.answerId)) return null;
  if (!isLowerAddress(raw.payee)) return null;
  if (!ACCEPTANCE_KINDS.includes(raw.kind as AcceptanceKind)) return null;
  if (!(typeof raw.chainId === 'number' && Number.isSafeInteger(raw.chainId) && raw.chainId > 0)) return null;
  if (!isLowerHash(raw.txHash)) return null;
  if (!isIndex(raw.logIndex)) return null;
  if (!isUintDecimal(raw.units)) return null;
  if (!isLowerAddress(raw.from)) return null;
  if (raw.token !== 'USDC' || raw.network !== 'base') return null;
  return {
    v: 1,
    askId: raw.askId,
    answerId: raw.answerId,
    payee: raw.payee,
    kind: raw.kind as AcceptanceKind,
    chainId: raw.chainId,
    txHash: raw.txHash,
    logIndex: raw.logIndex,
    units: raw.units,
    from: raw.from,
    token: 'USDC',
    network: 'base',
  };
}

/**
 * Przyjecie odpowiedzi na Asku SOL: przelew SystemProgram od zamrozonego
 * platnika autora (state.solana.payer) do zamrozonego odbiorcy odpowiedzi
 * (asks/{id}/payees/{answerId}), z memo `mysphere:ask|v1|<askId>|<answerId>`
 * podpisanym przez platnika. Adresy i podpis w base58, wielkosc liter
 * zachowana. Ta sama domena MAC co przyjecie EVM - `kind` i `network`
 * w ladunku i tak nie pozwalaja pomylic jednego z drugim.
 */
export type SolanaAcceptanceRecord = {
  v: 1;
  askId: string;
  answerId: string;
  /** Portfel Solany odpowiadajacego (base58). */
  payee: string;
  kind: 'sol-transfer';
  cluster: SolanaClusterName;
  /** Podpis transakcji (base58) - jeden podpis placi jedna odpowiedz. */
  signature: string;
  /** Suma przelewow platnik -> odbiorca w tej transakcji, dziesietnie. */
  lamports: string;
  /** Platnik autora (base58). */
  from: string;
  token: 'SOL';
  network: 'solana';
};

/**
 * Przyjecie dowolnej szyny. `AcceptanceRecord` zostaje nazwa typu EVM, zeby
 * dzisiejsze trasy (txHash, logIndex, units) kompilowaly sie bez zmian;
 * wolajacy, ktory obsluguje obie szyny, bierze te unie i rozroznia po
 * `network` (albo `kind === 'sol-transfer'`).
 */
export type AnyAcceptanceRecord = AcceptanceRecord | SolanaAcceptanceRecord;

export const isSolanaAcceptance = (record: AnyAcceptanceRecord): record is SolanaAcceptanceRecord =>
  record.network === 'solana';

function pickSolanaAcceptance(raw: Record<string, unknown>): SolanaAcceptanceRecord | null {
  if (raw.v !== 1) return null;
  if (!isDocId(raw.askId) || !isDocId(raw.answerId)) return null;
  if (raw.kind !== 'sol-transfer') return null;
  if (!isSolanaClusterName(raw.cluster)) return null;
  if (!isSolanaAddress(raw.payee) || !isSolanaAddress(raw.from)) return null;
  // Przelew autora do samego siebie nie jest wyplata (verifySolanaAskPayout
  // odrzuca go jako self-pay) - taki rekord nie ma prawa powstac.
  if (raw.payee === raw.from) return null;
  if (!isSolanaSignature(raw.signature)) return null;
  if (!isLamportsString(raw.lamports) || raw.lamports === '0') return null;
  if (raw.token !== 'SOL' || raw.network !== 'solana') return null;
  return {
    v: 1,
    askId: raw.askId,
    answerId: raw.answerId,
    payee: raw.payee,
    kind: 'sol-transfer',
    cluster: raw.cluster,
    signature: raw.signature,
    lamports: raw.lamports,
    from: raw.from,
    token: 'SOL',
    network: 'solana',
  };
}

function pickAnyAcceptance(raw: Record<string, unknown>): AnyAcceptanceRecord | null {
  return raw.network === 'solana' ? pickSolanaAcceptance(raw) : pickAcceptance(raw);
}

export function sealAcceptanceDoc(key: AskSealKey, record: AcceptanceRecord): SealedDoc<AcceptanceRecord>;
export function sealAcceptanceDoc(key: AskSealKey, record: SolanaAcceptanceRecord): SealedDoc<SolanaAcceptanceRecord>;
export function sealAcceptanceDoc(key: AskSealKey, record: AnyAcceptanceRecord): SealedDoc<AnyAcceptanceRecord>;
export function sealAcceptanceDoc(key: AskSealKey, record: AnyAcceptanceRecord): SealedDoc<AnyAcceptanceRecord> {
  const picked = pickAnyAcceptance(record as unknown as Record<string, unknown>);
  if (!picked) throw new AskError('seal_write_malformed', 500, 'Refusing to seal a malformed acceptance.');
  return sealDoc(key, SEAL_DOMAINS.accept, picked);
}

function readAcceptanceWith<T extends AnyAcceptanceRecord>(
  pick: (raw: Record<string, unknown>) => T | null,
  keys: AskSealKeys,
  askId: string,
  answerId: string,
  raw: RawDoc
): SealCheck<T> {
  if (!raw) return { kind: 'absent' };
  const picked = pick(raw);
  if (!picked) return { kind: 'invalid', reason: 'malformed' };
  const check = verifySealed(keys, SEAL_DOMAINS.accept, picked, raw.mac, raw.kid);
  if (check.kind !== 'valid') return check;
  if (picked.askId !== askId || picked.answerId !== answerId) return { kind: 'invalid', reason: 'wrong_binding' };
  return check;
}

/**
 * Odczyt przyjecia EVM - zwiazany z askId i answerId ze SCIEZKI.
 *
 * Rekord SOL wychodzi tu 'invalid/malformed' (zamknieto): dzisiejsze trasy
 * znaja tylko USDC i trasa odpowie 503, zamiast potraktowac przyjecie SOL jak
 * brak przyjecia. Wolajacy obslugujacy obie szyny uzywa readAnyAcceptance.
 */
export function readAcceptance(
  keys: AskSealKeys,
  askId: string,
  answerId: string,
  raw: RawDoc
): SealCheck<AcceptanceRecord> {
  return readAcceptanceWith(pickAcceptance, keys, askId, answerId, raw);
}

/** Odczyt przyjecia dowolnej szyny - zwiazany z askId i answerId ze SCIEZKI. */
export function readAnyAcceptance(
  keys: AskSealKeys,
  askId: string,
  answerId: string,
  raw: RawDoc
): SealCheck<AnyAcceptanceRecord> {
  return readAcceptanceWith(pickAnyAcceptance, keys, askId, answerId, raw);
}

/** Przyjecie z przelewu SOL (akceptacja na Asku SOL). Rzuca seal_write_malformed. */
export function solanaTransferAcceptance(input: {
  askId: string;
  answerId: string;
  payee: string;
  from: string;
  cluster: SolanaClusterName;
  signature: string;
  lamports: bigint | string;
}): SolanaAcceptanceRecord {
  const lamports = typeof input.lamports === 'bigint' ? input.lamports.toString() : input.lamports;
  const record = pickSolanaAcceptance({
    v: 1,
    askId: input.askId,
    answerId: input.answerId,
    payee: input.payee,
    kind: 'sol-transfer',
    cluster: input.cluster,
    signature: input.signature,
    lamports,
    from: input.from,
    token: 'SOL',
    network: 'solana',
  });
  if (!record) throw new AskError('seal_write_malformed', 500, 'Refusing to build a malformed Solana acceptance record.');
  return record;
}

/**
 * Co pokazac przy przyjetej odpowiedzi (lustro askAnswers, GET answers,
 * linki do eksploratora) - jedno miejsce, ktore wie, jak wyglada dowod
 * kazdej szyny. `amount` tylko do wyswietlania.
 */
export type AcceptancePayoutRef = {
  network: 'base' | 'solana';
  token: 'USDC' | 'SOL';
  /** Hash transakcji Base (malymi literami) albo podpis Solany (base58). */
  txRef: string;
  /** logIndex na Base; Solana nie ma logow -> null. */
  logIndex: number | null;
  amount: number;
  /** Identyfikator wpisu w rejestrze zuzytych wyplat. */
  regId: string;
};

export function acceptancePayoutRef(record: AnyAcceptanceRecord): AcceptancePayoutRef {
  if (isSolanaAcceptance(record)) {
    return {
      network: 'solana',
      token: 'SOL',
      txRef: record.signature,
      logIndex: null,
      amount: lamportsToSolNumber(record.lamports),
      regId: solanaPayoutRegistryId(record.signature),
    };
  }
  return {
    network: 'base',
    token: 'USDC',
    txRef: record.txHash,
    logIndex: record.logIndex,
    amount: Number(BigInt(record.units)) / 1_000_000,
    regId: payoutRegistryId(record.chainId, record.txHash, record.logIndex),
  };
}

/** Przyjecie z bezposredniego przelewu USDC (on-resolve albo escrow po terminie). */
export function transferAcceptance(input: {
  askId: string;
  answerId: string;
  payee: string;
  from: string;
  txHash: string;
  logIndex: number;
  units: bigint | string;
}): AcceptanceRecord {
  return buildAcceptance('transfer', 8453, input);
}

/** Przyjecie z logu SeatAwarded. `from` = adres kontraktu escrow. */
export function escrowSeatAcceptance(input: {
  askId: string;
  answerId: string;
  payee: string;
  contract: string;
  chainId: number;
  txHash: string;
  logIndex: number;
  units: bigint | string;
}): AcceptanceRecord {
  return buildAcceptance('escrow-seat', input.chainId, { ...input, from: input.contract });
}

/** Stary, slabo zwiazany przelew - tylko z jawnej decyzji wlasciciela. */
export function weakAcceptance(input: {
  askId: string;
  answerId: string;
  payee: string;
  from: string;
  txHash: string;
  logIndex: number;
  units: bigint | string;
}): AcceptanceRecord {
  return buildAcceptance('legacy-weak', 8453, input);
}

function buildAcceptance(
  kind: AcceptanceKind,
  chainId: number,
  input: { askId: string; answerId: string; payee: string; from: string; txHash: string; logIndex: number; units: bigint | string }
): AcceptanceRecord {
  const payee = lowerAddress(input.payee);
  const from = lowerAddress(input.from);
  const txHash = lowerTxHash(input.txHash);
  const units = typeof input.units === 'bigint' ? input.units.toString() : input.units;
  if (!isDocId(input.askId) || !isDocId(input.answerId) || !payee || !from || !txHash || !isIndex(input.logIndex) || !isUintDecimal(units)) {
    throw new AskError('seal_write_malformed', 500, 'Refusing to build a malformed acceptance record.');
  }
  return {
    v: 1,
    askId: input.askId,
    answerId: input.answerId,
    payee,
    kind,
    chainId,
    txHash,
    logIndex: input.logIndex,
    units,
    from,
    token: 'USDC',
    network: 'base',
  };
}

/* ------------------------------------------------------------------ */
/*  REJESTR ZUZYTYCH WYPLAT - askAnswerContent/_registry/payouts/{id}  */
/* ------------------------------------------------------------------ */

/**
 * Identyfikator wpisu: `${chainId}:${txHash}:${logIndex}`. Jeden log = jedna
 * wyplata na zawsze. Prefiks sieci zostawia miejsce na Solane.
 */
export function payoutRegistryId(chainId: number, txHash: string, logIndex: number): string {
  return `${chainId}:${txHash.toLowerCase()}:${logIndex}`;
}

/** Prefiks wpisow rejestru dla wyplat SOL. */
export const SOLANA_PAYOUT_REGISTRY_PREFIX = 'solana:';

/**
 * Identyfikator wpisu wyplaty SOL: `solana:<podpis>`. Podpis transakcji jest
 * jeden na transakcje i placi JEDNA odpowiedz na zawsze (niezaleznie od liczby
 * instrukcji Transfer w srodku). Wielkosc liter ZACHOWANA - base58 malymi
 * literami to inny (albo zaden) podpis, a dwa zapisy jednego podpisu daliby
 * dwa wpisy, czyli podwojna wyplate z jednego przelewu.
 */
export function solanaPayoutRegistryId(signature: string): string {
  return `${SOLANA_PAYOUT_REGISTRY_PREFIX}${signature}`;
}

/** Ksztalt identyfikatora - zeby trasa nie podala do doc() niczego innego. */
export function isPayoutRegistryId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  if (id.startsWith(SOLANA_PAYOUT_REGISTRY_PREFIX)) {
    return isSolanaSignature(id.slice(SOLANA_PAYOUT_REGISTRY_PREFIX.length));
  }
  return /^[1-9][0-9]{0,9}:0x[0-9a-f]{64}:(0|[1-9][0-9]{0,8})$/.test(id);
}

/** Identyfikator wpisu rejestru dla przyjecia albo wpisu dowolnej szyny. */
export function payoutRegistryIdFor(source: AnyAcceptanceRecord | AnyPayoutRegistryEntry): string {
  // `in`, nie `network`: wpis rejestru EVM nie ma pola network (i miec nie
  // moze - zmienilby sie jego ladunek MAC).
  if ('signature' in source) return solanaPayoutRegistryId(source.signature);
  return payoutRegistryId(source.chainId, source.txHash, source.logIndex);
}

export type PayoutRegistryEntry = {
  v: 1;
  chainId: number;
  txHash: string;
  logIndex: number;
  kind: AcceptanceKind;
  askId: string;
  answerId: string;
  payee: string;
  from: string;
  units: string;
  token: 'USDC';
};

function pickRegistry(raw: Record<string, unknown>): PayoutRegistryEntry | null {
  if (raw.v !== 1) return null;
  if (!(typeof raw.chainId === 'number' && Number.isSafeInteger(raw.chainId) && raw.chainId > 0)) return null;
  if (!isLowerHash(raw.txHash) || !isIndex(raw.logIndex)) return null;
  if (!ACCEPTANCE_KINDS.includes(raw.kind as AcceptanceKind)) return null;
  if (!isDocId(raw.askId) || !isDocId(raw.answerId)) return null;
  if (!isLowerAddress(raw.payee) || !isLowerAddress(raw.from)) return null;
  if (!isUintDecimal(raw.units) || raw.token !== 'USDC') return null;
  return {
    v: 1,
    chainId: raw.chainId,
    txHash: raw.txHash,
    logIndex: raw.logIndex,
    kind: raw.kind as AcceptanceKind,
    askId: raw.askId,
    answerId: raw.answerId,
    payee: raw.payee,
    from: raw.from,
    units: raw.units,
    token: 'USDC',
  };
}

/**
 * Wpis rejestru wyplaty SOL - askAnswerContent/_registry/payouts/solana:<podpis>.
 * `network` jest tu jawne (w odroznieniu od wpisu EVM), wiec obu ksztaltow
 * nie da sie pomylic przy odczycie.
 */
export type SolanaPayoutRegistryEntry = {
  v: 1;
  network: 'solana';
  cluster: SolanaClusterName;
  signature: string;
  kind: 'sol-transfer';
  askId: string;
  answerId: string;
  payee: string;
  from: string;
  lamports: string;
  token: 'SOL';
};

/** Wpis dowolnej szyny. `PayoutRegistryEntry` zostaje nazwa typu EVM (patrz AnyAcceptanceRecord). */
export type AnyPayoutRegistryEntry = PayoutRegistryEntry | SolanaPayoutRegistryEntry;

function pickSolanaRegistry(raw: Record<string, unknown>): SolanaPayoutRegistryEntry | null {
  if (raw.v !== 1 || raw.network !== 'solana') return null;
  if (!isSolanaClusterName(raw.cluster) || !isSolanaSignature(raw.signature)) return null;
  if (raw.kind !== 'sol-transfer') return null;
  if (!isDocId(raw.askId) || !isDocId(raw.answerId)) return null;
  if (!isSolanaAddress(raw.payee) || !isSolanaAddress(raw.from) || raw.payee === raw.from) return null;
  if (!isLamportsString(raw.lamports) || raw.lamports === '0' || raw.token !== 'SOL') return null;
  return {
    v: 1,
    network: 'solana',
    cluster: raw.cluster,
    signature: raw.signature,
    kind: 'sol-transfer',
    askId: raw.askId,
    answerId: raw.answerId,
    payee: raw.payee,
    from: raw.from,
    lamports: raw.lamports,
    token: 'SOL',
  };
}

function pickAnyRegistry(raw: Record<string, unknown>): AnyPayoutRegistryEntry | null {
  return raw.network === 'solana' ? pickSolanaRegistry(raw) : pickRegistry(raw);
}

/** Wpis rejestru dla danego przyjecia - te same pola, ta sama prawda. */
export function payoutEntryFor(record: AcceptanceRecord): PayoutRegistryEntry;
export function payoutEntryFor(record: SolanaAcceptanceRecord): SolanaPayoutRegistryEntry;
export function payoutEntryFor(record: AnyAcceptanceRecord): AnyPayoutRegistryEntry;
export function payoutEntryFor(record: AnyAcceptanceRecord): AnyPayoutRegistryEntry {
  if (isSolanaAcceptance(record)) {
    return {
      v: 1,
      network: 'solana',
      cluster: record.cluster,
      signature: record.signature,
      kind: 'sol-transfer',
      askId: record.askId,
      answerId: record.answerId,
      payee: record.payee,
      from: record.from,
      lamports: record.lamports,
      token: 'SOL',
    };
  }
  return {
    v: 1,
    chainId: record.chainId,
    txHash: record.txHash,
    logIndex: record.logIndex,
    kind: record.kind,
    askId: record.askId,
    answerId: record.answerId,
    payee: record.payee,
    from: record.from,
    units: record.units,
    token: 'USDC',
  };
}

export function registryDoc(key: AskSealKey, entry: PayoutRegistryEntry): SealedDoc<PayoutRegistryEntry>;
export function registryDoc(key: AskSealKey, entry: SolanaPayoutRegistryEntry): SealedDoc<SolanaPayoutRegistryEntry>;
export function registryDoc(key: AskSealKey, entry: AnyPayoutRegistryEntry): SealedDoc<AnyPayoutRegistryEntry>;
export function registryDoc(key: AskSealKey, entry: AnyPayoutRegistryEntry): SealedDoc<AnyPayoutRegistryEntry> {
  const picked = pickAnyRegistry(entry as unknown as Record<string, unknown>);
  if (!picked) throw new AskError('seal_write_malformed', 500, 'Refusing to seal a malformed payout registry entry.');
  return sealDoc(key, SEAL_DOMAINS.payout, picked);
}

function readRegistryWith<T extends AnyPayoutRegistryEntry>(
  pick: (raw: Record<string, unknown>) => T | null,
  keys: AskSealKeys,
  docId: string,
  raw: RawDoc
): SealCheck<T> {
  if (!raw) return { kind: 'absent' };
  const picked = pick(raw);
  if (!picked) return { kind: 'invalid', reason: 'malformed' };
  const check = verifySealed(keys, SEAL_DOMAINS.payout, picked, raw.mac, raw.kid);
  if (check.kind !== 'valid') return check;
  if (payoutRegistryIdFor(picked) !== docId) return { kind: 'invalid', reason: 'wrong_binding' };
  return check;
}

/**
 * Odczyt wpisu EVM - identyfikator dokumentu musi wynikac z jego tresci.
 * Wpis SOL wychodzi tu 'invalid/malformed' (zamknieto) - obie szyny czyta
 * readAnyRegistry.
 */
export function readRegistry(keys: AskSealKeys, docId: string, raw: RawDoc): SealCheck<PayoutRegistryEntry> {
  return readRegistryWith(pickRegistry, keys, docId, raw);
}

/** Odczyt wpisu dowolnej szyny (id `solana:<podpis>` albo `<chainId>:<hash>:<log>`). */
export function readAnyRegistry(keys: AskSealKeys, docId: string, raw: RawDoc): SealCheck<AnyPayoutRegistryEntry> {
  return readRegistryWith(pickAnyRegistry, keys, docId, raw);
}

/* ------------------------------------------------------------------ */
/*  STRAZNIK "JEDNA ODPOWIEDZ NA ADRES" - asks/{askId}/answerers/{addr} */
/* ------------------------------------------------------------------ */

/**
 * Dokument, ktorego ISTNIENIE znaczy "ten adres juz odpowiedzial". Zakladany
 * przez tx.create w tej samej transakcji co odpowiedz, wiec dwie rownolegle
 * odpowiedzi tego samego portfela nie przejda obie. MAC jest obrona w glab.
 */
export type AnswererGuard = {
  v: 1;
  askId: string;
  author: string;
  answerId: string;
  createdAt: number;
};

function pickAnswerer(raw: Record<string, unknown>): AnswererGuard | null {
  if (raw.v !== 1) return null;
  if (!isDocId(raw.askId) || !isDocId(raw.answerId)) return null;
  if (!isLowerAddress(raw.author)) return null;
  if (!isFiniteNumber(raw.createdAt)) return null;
  return { v: 1, askId: raw.askId, author: raw.author, answerId: raw.answerId, createdAt: raw.createdAt };
}

export function answererDoc(key: AskSealKey, guard: AnswererGuard): SealedDoc<AnswererGuard> {
  const picked = pickAnswerer(guard as unknown as Record<string, unknown>);
  if (!picked) throw new AskError('seal_write_malformed', 500, 'Refusing to seal a malformed answerer guard.');
  return sealDoc(key, SEAL_DOMAINS.answerer, picked);
}

export function readAnswerer(keys: AskSealKeys, askId: string, author: string, raw: RawDoc): SealCheck<AnswererGuard> {
  if (!raw) return { kind: 'absent' };
  const picked = pickAnswerer(raw);
  if (!picked) return { kind: 'invalid', reason: 'malformed' };
  const check = verifySealed(keys, SEAL_DOMAINS.answerer, picked, raw.mac, raw.kid);
  if (check.kind !== 'valid') return check;
  if (picked.askId !== askId || picked.author !== author.toLowerCase()) return { kind: 'invalid', reason: 'wrong_binding' };
  return check;
}

/* ------------------------------------------------------------------ */
/*  POWIAZANIE PORTFELA SOLANY                                         */
/*  askAnswerContent/_registry/solanaWallets/{evmLower}                */
/* ------------------------------------------------------------------ */

/**
 * Jedno konto EVM (sesja SIWE) = jeden portfel Solany. To samo powiazanie
 * jest platnikiem autora (zamrazanym w stanie nowego Aska) i odbiorca
 * odpowiadajacego (zamrazanym przy odpowiedzi). Powstaje dopiero po
 * sprawdzeniu podpisu ed25519 wiadomosci buildSolanaBindingMessage, a podpis
 * zostaje w dokumencie - wlasciciel moze go zweryfikowac jeszcze raz.
 *
 * `issuedAtMs` z challenge'u: nowe powiazanie musi miec wiekszy niz zapisane,
 * wiec przechwycony stary podpis nie cofnie portfela do poprzedniego.
 */
export type SolanaWalletBinding = {
  v: 1;
  /** Konto EVM, malymi literami. */
  evm: string;
  /** Portfel Solany, base58, wielkosc liter zachowana. */
  solana: string;
  issuedAtMs: number;
  nonce: string;
  /** Podpis ed25519 wiadomosci powiazania (base58, 64 bajty). */
  signature: string;
};

function pickSolanaBinding(raw: Record<string, unknown>): SolanaWalletBinding | null {
  if (raw.v !== 1) return null;
  if (!isLowerAddress(raw.evm) || !isSolanaAddress(raw.solana)) return null;
  if (!(typeof raw.issuedAtMs === 'number' && Number.isSafeInteger(raw.issuedAtMs) && raw.issuedAtMs > 0)) return null;
  if (!isNonceHex(raw.nonce) || !isSolanaSignature(raw.signature)) return null;
  return {
    v: 1,
    evm: raw.evm,
    solana: raw.solana,
    issuedAtMs: raw.issuedAtMs,
    nonce: raw.nonce,
    signature: raw.signature,
  };
}

/** Powiazanie do zapisu. Adres EVM sprowadzany do malych liter, Solana bez zmian. */
export function solanaWalletBinding(input: {
  evm: string;
  solana: string;
  issuedAtMs: number;
  nonce: string;
  signature: string;
}): SolanaWalletBinding {
  const binding = pickSolanaBinding({ v: 1, ...input, evm: lowerAddress(input.evm) });
  if (!binding) throw new AskError('seal_write_malformed', 500, 'Refusing to build a malformed Solana wallet binding.');
  return binding;
}

export function sealSolanaBindingDoc(key: AskSealKey, binding: SolanaWalletBinding): SealedDoc<SolanaWalletBinding> {
  const picked = pickSolanaBinding(binding as unknown as Record<string, unknown>);
  if (!picked) throw new AskError('seal_write_malformed', 500, 'Refusing to seal a malformed Solana wallet binding.');
  return sealDoc(key, SEAL_DOMAINS.solBind, picked);
}

/** Odczyt powiazania - zwiazany z kontem EVM z identyfikatora dokumentu. */
export function readSolanaBinding(keys: AskSealKeys, evm: string, raw: RawDoc): SealCheck<SolanaWalletBinding> {
  if (!raw) return { kind: 'absent' };
  const picked = pickSolanaBinding(raw);
  if (!picked) return { kind: 'invalid', reason: 'malformed' };
  const check = verifySealed(keys, SEAL_DOMAINS.solBind, picked, raw.mac, raw.kid);
  if (check.kind !== 'valid') return check;
  if (picked.evm !== lowerAddress(evm)) return { kind: 'invalid', reason: 'wrong_binding' };
  return check;
}

/* ------------------------------------------------------------------ */
/*  ODBIORCA ODPOWIEDZI NA ASKU SOL - asks/{askId}/payees/{answerId}   */
/* ------------------------------------------------------------------ */

/**
 * Portfel Solany, na ktory autor Aska ma zaplacic za TE odpowiedz. Zamrazany
 * przez tx.create (nigdy nie zmieniany) z powiazania odpowiadajacego w chwili
 * odpowiedzi albo pozniej, gdy powiazal portfel. Zmiana powiazania dziala
 * tylko na przyszle odpowiedzi - inaczej przejete konto EVM przekierowaloby
 * wyplaty za juz napisane odpowiedzi.
 */
export type AnswerPayee = {
  v: 1;
  askId: string;
  answerId: string;
  /** Autor odpowiedzi (konto EVM), malymi literami. */
  answerer: string;
  /** Portfel Solany odbiorcy, base58. */
  payee: string;
  /** Kiedy zamrozono (ms) - do wyswietlania i audytu. */
  frozenAtMs: number;
};

function pickPayee(raw: Record<string, unknown>): AnswerPayee | null {
  if (raw.v !== 1) return null;
  if (!isDocId(raw.askId) || !isDocId(raw.answerId)) return null;
  if (!isLowerAddress(raw.answerer) || !isSolanaAddress(raw.payee)) return null;
  if (!isFiniteNumber(raw.frozenAtMs) || raw.frozenAtMs <= 0) return null;
  return {
    v: 1,
    askId: raw.askId,
    answerId: raw.answerId,
    answerer: raw.answerer,
    payee: raw.payee,
    frozenAtMs: raw.frozenAtMs,
  };
}

/** Odbiorca do zapisu. Konto EVM sprowadzane do malych liter, Solana bez zmian. */
export function answerPayee(input: {
  askId: string;
  answerId: string;
  answerer: string;
  payee: string;
  frozenAtMs: number;
}): AnswerPayee {
  const payee = pickPayee({ v: 1, ...input, answerer: lowerAddress(input.answerer) });
  if (!payee) throw new AskError('seal_write_malformed', 500, 'Refusing to build a malformed answer payee.');
  return payee;
}

export function sealPayeeDoc(key: AskSealKey, payee: AnswerPayee): SealedDoc<AnswerPayee> {
  const picked = pickPayee(payee as unknown as Record<string, unknown>);
  if (!picked) throw new AskError('seal_write_malformed', 500, 'Refusing to seal a malformed answer payee.');
  return sealDoc(key, SEAL_DOMAINS.payee, picked);
}

/** Odczyt odbiorcy - zwiazany z askId i answerId ze SCIEZKI. */
export function readPayee(keys: AskSealKeys, askId: string, answerId: string, raw: RawDoc): SealCheck<AnswerPayee> {
  if (!raw) return { kind: 'absent' };
  const picked = pickPayee(raw);
  if (!picked) return { kind: 'invalid', reason: 'malformed' };
  const check = verifySealed(keys, SEAL_DOMAINS.payee, picked, raw.mac, raw.kid);
  if (check.kind !== 'valid') return check;
  if (picked.askId !== askId || picked.answerId !== answerId) return { kind: 'invalid', reason: 'wrong_binding' };
  return check;
}

/* ------------------------------------------------------------------ */
/*  WIDOK ASKA DLA TRAS                                                */
/* ------------------------------------------------------------------ */

/**
 * sealed     - wartosci ze stanu (lustro sluzy tylko do pytania i licznikow),
 * broken     - stan jest, ale pieczec niewazna: trasa odpowiada 503 seal_invalid,
 * legacy     - brak stanu, flaga ASK_SEALS_ENFORCED wylaczona: semantyka
 *              dzisiejszego toAsk, WYLACZNIE do odczytow,
 * unverified - brak stanu, flaga wlaczona: tylko pola zamrozone regulami
 *              (author, budget, seats, deadline, funding), status 'open',
 *              bez escrow, zawsze USDC na Base.
 */
export type AskTrust = 'sealed' | 'broken' | 'legacy' | 'unverified';

export type AskView = Ask & {
  trust: AskTrust;
  /** Warunki escrow ze stanu. Dla Askow bez stanu ZAWSZE null. */
  escrow: SealedEscrow | null;
  state: SealedAskState | null;
};

/** Stawka z jednostek escrow - do wyswietlania. Liczy sie `perAnswerUnits`. */
function unitsToUsdc(units: string): number {
  return Number(BigInt(units)) / 1_000_000;
}

/** Widok z samych pol zamrozonych regula update - dla 'unverified' i 'broken'. */
function frozenView(askId: string, pub: Record<string, any>, trust: 'unverified' | 'broken'): AskView {
  // Bez stanu nie ma szyny SOL: lustro 'SOL/solana' i lamporty przestawi kazda
  // przegladarka, a regula zamraza tylko `budget`. Mapujemy wiec jak Ask USDC,
  // zeby toAsk nie doliczyl stawki z niezamrozonych budgetLamports.
  const base = toAsk(askId, { ...pub, token: 'USDC', network: 'base' });
  return {
    ...base,
    author: base.author.toLowerCase(),
    token: 'USDC',
    network: 'base',
    status: 'open',
    acceptedCount: 0,
    resolvedAt: undefined,
    escrowTxHash: null,
    escrowChainId: null,
    escrowResolveTxHash: null,
    trust,
    escrow: null,
    state: null,
  };
}

/**
 * Widok, na ktorym trasy podejmuja decyzje. `pub` to dokument asks/{id}
 * (moze byc null, gdy zostal sam stan), `stateCheck` - wynik readSealedState.
 */
export function effectiveAsk(
  askId: string,
  pub: Record<string, any> | null,
  stateCheck: SealCheck<SealedAskState>,
  enforce: boolean
): AskView {
  const doc = pub ?? {};
  if (stateCheck.kind === 'invalid') return frozenView(askId, doc, 'broken');
  if (stateCheck.kind === 'absent') {
    if (enforce) return frozenView(askId, doc, 'unverified');
    return { ...toAsk(askId, doc), trust: 'legacy', escrow: null, state: null };
  }

  const s = stateCheck.value;
  // Szyna ze stanu, nie z lustra: toAsk dostaje token/network ze stanu, wiec
  // pola SOL (lamporty, klaster) pojawiaja sie w widoku tylko przy stanie SOL,
  // a stan Base z lustrem udajacym SOL zostaje zwyklym Askiem USDC.
  const base = toAsk(askId, { ...doc, token: s.token, network: s.network });
  delete base.budgetLamports;
  delete base.perAnswerLamports;
  delete base.solanaCluster;
  const solana = s.solana
    ? {
        budgetLamports: s.solana.budgetLamports,
        perAnswerLamports: s.solana.perAnswerLamports,
        solanaCluster: s.solana.cluster,
      }
    : {};
  return {
    ...base,
    ...solana,
    author: s.author,
    budget: s.budget,
    seats: s.seats,
    perAnswer: s.solana
      ? lamportsToSolNumber(s.solana.perAnswerLamports)
      : s.escrow
        ? unitsToUsdc(s.escrow.perAnswerUnits)
        : perAnswerFor(s.budget, s.seats),
    token: s.token,
    network: s.network,
    deadline: s.deadline,
    status: s.status,
    funding: s.funding,
    resolvedAt: s.resolvedAt ?? undefined,
    escrowTxHash: s.escrow?.fundTxHash ?? null,
    escrowChainId: s.escrow?.chainId ?? null,
    escrowResolveTxHash: s.resolveKind === 'escrow' ? s.resolveTxHash : null,
    trust: 'sealed',
    escrow: s.escrow,
    state: s,
  };
}

/* ------------------------------------------------------------------ */
/*  NOWY ASK I ADOPCJA STAREGO                                         */
/* ------------------------------------------------------------------ */

export type NewAskStateInput = {
  author: string;
  origin: AskOrigin;
  budget: number;
  seats: number;
  deadline: number;
  funding: AskFunding;
  escrow: SealedEscrow | null;
  /** Domyslnie 'usdc-base' - dzisiejsi wolajacy nie musza nic zmieniac. */
  rail?: AskRail;
  /**
   * Wymagane dla rail 'sol-solana'. `budget` (liczba) jest wtedy IGNOROWANY
   * i liczony z budgetLamports - prawda o kwocie jest jedna.
   * `payer` MUSI pochodzic z zapieczetowanego powiazania autora, nigdy z ciala zadania.
   */
  solana?: { cluster: SolanaClusterName; payer: string; budgetLamports: string };
};

/**
 * Stan nowego Aska. Rzuca AskError('invalid_ask', 400) przy danych, ktorych
 * nie wolno zapieczetowac - trasa ma je odrzucic wczesniej, to jest bezpiecznik.
 * Ask SOL: 'escrowed' -> invalid_funding (400), zly platnik/klaster/kwota ->
 * invalid_ask (400).
 */
export function newAskState(askId: string, input: NewAskStateInput): SealedAskState {
  if ((input.rail ?? 'usdc-base') === 'sol-solana') return newSolanaAskState(askId, input);
  if (input.solana !== undefined) throw new AskError('invalid_ask', 400, 'Solana terms belong only to a SOL Ask.');
  const author = lowerAddress(input.author);
  if (!isDocId(askId)) throw new AskError('invalid_id', 400, 'Invalid Ask id.');
  if (!author) throw new AskError('invalid_ask', 400, 'The Ask author is not an address.');
  if (!isFiniteNumber(input.budget) || input.budget <= 0) throw new AskError('invalid_ask', 400, 'Invalid budget.');
  if (!Number.isSafeInteger(input.seats) || input.seats < 1 || input.seats > MAX_SEATS) {
    throw new AskError('invalid_ask', 400, `Seats must be a whole number between 1 and ${MAX_SEATS}.`);
  }
  if (perAnswerFor(input.budget, input.seats) <= 0) throw new AskError('invalid_ask', 400, 'The budget gives nothing per answer.');
  if (!isFiniteNumber(input.deadline) || input.deadline <= 0) throw new AskError('invalid_ask', 400, 'Invalid deadline.');
  if ((input.funding === 'escrowed') !== (input.escrow !== null)) {
    throw new AskError('invalid_ask', 400, 'An escrowed Ask needs verified escrow terms, and only an escrowed one.');
  }
  return {
    v: 1,
    askId,
    author,
    funding: input.funding,
    token: 'USDC',
    network: 'base',
    budget: input.budget,
    seats: input.seats,
    deadline: input.deadline,
    origin: input.origin,
    escrow: input.escrow,
    status: 'open',
    resolvedAt: null,
    resolveKind: null,
    resolveTxHash: null,
    expiredTxHash: null,
    expiredLogIndex: null,
  };
}

function newSolanaAskState(askId: string, input: NewAskStateInput): SealedAskState {
  const author = lowerAddress(input.author);
  if (!isDocId(askId)) throw new AskError('invalid_id', 400, 'Invalid Ask id.');
  if (!author) throw new AskError('invalid_ask', 400, 'The Ask author is not an address.');
  if (input.funding !== 'on-resolve' || input.escrow !== null) {
    throw new AskError('invalid_funding', 400, 'A SOL Ask is paid on accept; it cannot be escrowed.');
  }
  if (input.origin !== 'session') throw new AskError('invalid_ask', 400, 'A SOL Ask can only be created from a signed-in session.');
  if (!Number.isSafeInteger(input.seats) || input.seats < 1 || input.seats > MAX_SEATS) {
    throw new AskError('invalid_ask', 400, `Seats must be a whole number between 1 and ${MAX_SEATS}.`);
  }
  if (!isFiniteNumber(input.deadline) || input.deadline <= 0) throw new AskError('invalid_ask', 400, 'Invalid deadline.');
  const terms = input.solana;
  if (!terms || !isSolanaClusterName(terms.cluster)) throw new AskError('invalid_ask', 400, 'Missing Solana cluster.');
  if (!isSolanaAddress(terms.payer)) throw new AskError('invalid_ask', 400, 'The Solana payer is not a Solana address.');
  if (!isLamportsString(terms.budgetLamports)) throw new AskError('invalid_ask', 400, 'Invalid budget.');
  const budget = BigInt(terms.budgetLamports);
  if (budget <= 0n || budget > MAX_BUDGET_LAMPORTS) {
    throw new AskError('invalid_ask', 400, `The budget must be more than 0 and at most ${formatLamports(MAX_BUDGET_LAMPORTS)} SOL.`);
  }
  const perAnswer = perAnswerLamportsFor(budget, input.seats);
  if (perAnswer < MIN_PER_ANSWER_LAMPORTS) {
    throw new AskError('invalid_ask', 400, `Each answer must get at least ${formatLamports(MIN_PER_ANSWER_LAMPORTS)} SOL.`);
  }
  return {
    v: 1,
    askId,
    author,
    funding: 'on-resolve',
    token: 'SOL',
    network: 'solana',
    budget: lamportsToSolNumber(budget),
    seats: input.seats,
    deadline: input.deadline,
    origin: 'session',
    escrow: null,
    status: 'open',
    resolvedAt: null,
    resolveKind: null,
    resolveTxHash: null,
    expiredTxHash: null,
    expiredLogIndex: null,
    solana: {
      cluster: terms.cluster,
      payer: terms.payer,
      budgetLamports: budget.toString(),
      perAnswerLamports: perAnswer.toString(),
    },
  };
}

/**
 * Stan Aska sprzed pieczeci, zbudowany WYLACZNIE z pol, ktore obecna regula
 * update zamraza: author, budget, seats, deadline, funding. Status zawsze
 * 'open' - rozstrzygniecie dopisuje wolajacy tylko na podstawie dowodu.
 *
 * Ask 'escrowed' bez `escrow` (escrowFor.funded == false) -> 409
 * escrow_unverified: nie wolno zapieczetowac obietnicy bez pokrycia, a
 * przemianowanie na 'on-resolve' to decyzja resealu, nie tej funkcji.
 */
export function adoptLegacyState(
  askId: string,
  pub: Record<string, any>,
  origin: AskOrigin,
  escrow: SealedEscrow | null
): SealedAskState {
  const funding: AskFunding = pub.funding === 'escrowed' ? 'escrowed' : 'on-resolve';
  if (funding === 'escrowed' && !escrow) {
    throw new AskError('escrow_unverified', 409, 'This Ask says its budget is escrowed, but the escrow contract has no deposit for it.');
  }
  const author = lowerAddress(pub.author);
  const budget = typeof pub.budget === 'number' ? pub.budget : Number(pub.budget);
  const seats = typeof pub.seats === 'number' ? pub.seats : Number(pub.seats);
  const deadline = toMillis(pub.deadline);
  if (!author || !Number.isFinite(budget) || budget <= 0 || !Number.isSafeInteger(seats) || seats < 1 || seats > MAX_SEATS || deadline <= 0) {
    throw new AskError('ask_malformed', 409, 'This Ask record is malformed and cannot be sealed.');
  }
  return newAskState(askId, {
    author,
    origin,
    budget,
    seats,
    deadline,
    funding,
    escrow: funding === 'escrowed' ? escrow : null,
  });
}

/* ------------------------------------------------------------------ */
/*  DOPASOWANIE WYPLAT                                                 */
/* ------------------------------------------------------------------ */

/** Zdekodowany transfer USDC (patrz usdcTransfersFromLogs w verifyPayment.ts). */
export type TransferLike = { logIndex: number; from: string; to: string; value: bigint };

/**
 * Transfery, ktore moga byc wyplata za TE odpowiedz: od autora Aska
 * (Transfer.from, nie tx.from - portfele kontraktowe i przekazniki EIP-3009
 * emituja from == konto), do odpowiadajacego, co najmniej stawka.
 * Posortowane po logIndex.
 */
export function matchUsdcTransfers<T extends TransferLike>(
  transfers: readonly T[],
  want: { from: string; to: string; minUnits: bigint }
): T[] {
  const from = want.from.toLowerCase();
  const to = want.to.toLowerCase();
  return transfers
    .filter(
      (t) =>
        typeof t.from === 'string' &&
        typeof t.to === 'string' &&
        typeof t.value === 'bigint' &&
        t.from.toLowerCase() === from &&
        t.to.toLowerCase() === to &&
        t.value >= want.minUnits
    )
    .sort((a, b) => a.logIndex - b.logIndex);
}

/**
 * Ktory log zuzyc: najmniejsza wystarczajaca kwota, przy remisie najnizszy
 * logIndex, z pominieciem juz zuzytych. Najmniejsza, bo wiekszy przelew
 * w tej samej transakcji moze byc wyplata za inna odpowiedz z wyzsza stawka.
 */
export function pickTransfer<T extends TransferLike>(candidates: readonly T[], used: ReadonlySet<number>): T | null {
  let best: T | null = null;
  for (const candidate of candidates) {
    if (used.has(candidate.logIndex)) continue;
    if (
      best === null ||
      candidate.value < best.value ||
      (candidate.value === best.value && candidate.logIndex < best.logIndex)
    ) {
      best = candidate;
    }
  }
  return best;
}

/** Tolerancja na zegar: dokument potrafi powstac ~0,25 s przed znacznikiem bloku (flashblocks). */
export const PAYOUT_TIME_SLACK_MS = 5000;

/**
 * Czy blok wyplaty nie jest starszy niz odpowiedz. `notBeforeMs` to
 * createTime dokumentu odpowiedzi (nadany przez serwer Firestore, nie do
 * podrobienia z przegladarki). Bez tego warunku dowolny stary przelew do
 * tego adresu oplacalby nowa odpowiedz.
 */
export function payoutIsTimely(blockTimeSec: number, notBeforeMs: number, slackMs = PAYOUT_TIME_SLACK_MS): boolean {
  if (!Number.isFinite(blockTimeSec) || !Number.isFinite(notBeforeMs)) return false;
  return blockTimeSec * 1000 >= notBeforeMs - slackMs;
}

/* ------------------------------------------------------------------ */
/*  GRANICA STAREGO SWIATA                                             */
/* ------------------------------------------------------------------ */

/**
 * Chwila, od ktorej "przyjecie" i "Ask" bez pieczeci nie moga juz byc
 * prawdziwe. Po wdrozeniu tego kodu:
 *   - lustro askAnswers (accepted, payoutTxHash) pisze WYLACZNIE serwer i
 *     zawsze razem z rekordem przyjecia - przyjecie samym lustrem, zapisane
 *     po tej chwili, moglo przyjsc tylko z devtools (stara regula update
 *     pozwala przestawic accepted false -> true z dowolnym hashem),
 *   - Aska zaklada WYLACZNIE serwer, zawsze razem ze stanem - dokument bez
 *     stanu, zalozony po tej chwili, jest spoofem albo zostal z okna miedzy
 *     ta chwila a wdrozeniem.
 *
 * Bez tej granicy weryfikacja starego przyjecia (od autora, do
 * odpowiadajacego, >= stawka, po odpowiedzi) pozwala obcemu przypiac
 * PRAWDZIWA, swieza wyplate autora do innej odpowiedzi tego samego
 * odbiorcy - autor placilby drugi raz.
 *
 * Granica MUSI lezec przed wdrozeniem (nigdy po nim). Przyjecia starym kodem
 * miedzy granica a wdrozeniem nie przepadaja: dostaja werdykt 'weak'
 * i czekaja na decyzje wlasciciela w resealu (trustWeak / resetForged).
 * Trasy biora wartosc z AskStore.legacyCutoffMs (testy podaja wlasna).
 */
export const ASK_LEGACY_CUTOFF_MS = Date.parse('2026-09-23T09:00:00Z');

/**
 * Powod, dla ktorego stare przyjecie przypada PO granicy, albo null.
 * Lustro: updateTime dokumentu odpowiedzi (nadaje Firestore). Stara regula
 * pozwala przegladarce zmienic odpowiedz tylko raz (accepted false -> true),
 * wiec prawdziwe stare przyjecie ma updateTime z chwili tego przestawienia.
 * Brak czasu (NaN) traktujemy jak "po granicy" - zamknieto.
 */
export function legacyClaimAfterCutoff(
  mirrorUpdateTimeMs: number,
  payoutBlockTimeSec: number,
  cutoffMs: number
): 'mirror_after_cutoff' | 'payout_after_cutoff' | null {
  if (!(mirrorUpdateTimeMs < cutoffMs)) return 'mirror_after_cutoff';
  if (!(payoutBlockTimeSec * 1000 < cutoffMs)) return 'payout_after_cutoff';
  return null;
}

/**
 * Ask bez stanu, ktorego dokument powstal po granicy, czytamy jak przy
 * wlaczonej fladze ('unverified'): nie przyjmuje odpowiedzi i niczego nie
 * odslania. `createTimeMs` null (brak dokumentu) nic nie zmienia.
 */
export function unsealedAskBornAfterCutoff(createTimeMs: number | null, cutoffMs: number): boolean {
  if (createTimeMs === null) return false;
  return !(createTimeMs < cutoffMs);
}

/* ------------------------------------------------------------------ */
/*  MIEJSCA                                                            */
/* ------------------------------------------------------------------ */

/**
 * Ile miejsc jest zajetych - WYLACZNIE z waznych rekordow przyjec i ze
 * starych przyjec zweryfikowanych na lancuchu w tym zadaniu. Flaga
 * `accepted` z lustra i licznik `acceptedCount` nie wchodza tu nigdy,
 * niezaleznie od ASK_SEALS_ENFORCED - inaczej podrobione przyjecia
 * zamykalyby Aska "na komplet" przy pierwszej prawdziwej wyplacie.
 */
export function countTakenSeats(
  recordedAnswerIds: Iterable<string>,
  legacyVerifiedAnswerIds: Iterable<string> = [],
  exceptAnswerId?: string
): number {
  const taken = new Set<string>();
  for (const id of recordedAnswerIds) if (id !== exceptAnswerId) taken.add(id);
  for (const id of legacyVerifiedAnswerIds) if (id !== exceptAnswerId) taken.add(id);
  return taken.size;
}

/** Ostatnie oplacone miejsce zamyka Aska sam - tylko 'on-resolve'. */
export function isAutoFull(acceptedAfter: number, seats: number, funding: AskFunding): boolean {
  return funding === 'on-resolve' && seats > 0 && acceptedAfter >= seats;
}
