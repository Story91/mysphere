import type { SealCheck, SealedAskState } from './askSealCore';
import type { Ask } from './types';

/**
 * ZAKLADANIE ASKA - czysta logika decyzji i klienta, bez Firestore i bez sieci.
 *
 * Plik jest bezpieczny dla przegladarki: z askSealCore bierzemy WYLACZNIE typy
 * (import type znika po kompilacji), bo askSealCore ciagnie node:crypto.
 * Korzysta z niego trasa POST /api/asks/create (decyzja o utworzeniu) i hook
 * useCreateAsk (ponowienia, zapamietany depozyt). Mocha laduje go wprost
 * (test/asksCreate.test.ts).
 */

/* ------------------------------------------------------------------ */
/*  FORMATY                                                            */
/* ------------------------------------------------------------------ */

/**
 * Identyfikator Aska z escrow: dokladnie format newAskId (auto-id Firestore,
 * 20 znakow alfanumerycznych). Id wybiera KLIENT (musi byc znany przed
 * transakcja fund), wiec ograniczamy go do tego, co klient naprawde generuje -
 * nic innego nie ma prawa trafic do admin doc().
 */
export const ESCROW_ASK_ID_PATTERN = /^[A-Za-z0-9]{20}$/;

export function isEscrowAskId(id: unknown): id is string {
  return typeof id === 'string' && ESCROW_ASK_ID_PATTERN.test(id);
}

// Lokalne kopie lowerAddress/lowerTxHash z askSealCore - tamten modul ciagnie
// node:crypto, a ten musi dac sie zbundlowac do przegladarki.
function asAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

function asTxHash(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

/* ------------------------------------------------------------------ */
/*  DECYZJA: CZY WOLNO ZALOZYC ASKA Z ESCROW POD TYM ID                */
/* ------------------------------------------------------------------ */

export type EscrowedCreateInput = {
  /** Istnieje dokument asks/{askId} (odczyt w tej samej transakcji). */
  pubExists: boolean;
  /** pub.author surowo - moze byc czymkolwiek, lustro pisze dzis kazdy. */
  pubAuthor: unknown;
  /** Wynik readSealedState dla asks/{askId}/sealed/state. */
  stateCheck: SealCheck<SealedAskState>;
  /** Czy jest choc jedna odpowiedz z askId == X (zapytanie limit 1). */
  hasAnswers: boolean;
  /** Adres z sesji SIWE. */
  session: string;
  /** Hash fund z TEGO zadania, juz zweryfikowany logiem AskFunded. */
  fundTxHash: string;
};

export type EscrowedCreateRefusalCode = 'ask_exists' | 'seal_invalid' | 'invalid_request';

export type EscrowedCreateDecision =
  /** Nie ma ani stanu, ani dokumentu: tx.create. */
  | { action: 'create' }
  /** Wlasny pusty dokument autora bez stanu: tx.set bez merge, kazde pole od nowa. */
  | { action: 'overwrite' }
  /** Ten sam autor i ten sam fund - ponowienie zapisu, ktory juz sie udal: 200. */
  | { action: 'existing' }
  | { action: 'refuse'; status: 400 | 409 | 503; code: EscrowedCreateRefusalCode; error: string };

/**
 * Czy wolno zapisac Aska z escrow pod identyfikatorem wybranym przez klienta.
 *
 * DLACZEGO TO W OGOLE JEST DECYZJA: AskEscrow.fund kluczuje depozyt po
 * keccak(msg.sender, askId), a askId moze byc DOWOLNYM bytes32. Kazdy moze
 * wiec sfinansowac keccak(cudzeId) ze SWOJEGO portfela, a verifyAskFunded
 * (autor = jego sesja) to potwierdzi. Gdyby trasa po udanym fund nadpisywala
 * istniejacy dokument albo stan, napastnik przejmowalby cudzego Aska: zostaje
 * "autorem", czyta zapieczetowane odpowiedzi, rozstrzyga i odbiera budzet
 * drugim portfelem. Koszt bliski zera. Stad zasada: istniejacy stan albo
 * cudzy dokument -> 409, nigdy nadpisanie.
 *
 * Kolejnosc:
 * - stan niewazny           -> 503 seal_invalid (nigdy nie nadpisujemy
 *                              automatycznie - decyzja wlasciciela),
 * - stan wazny, ten sam autor i ten sam fund -> 'existing' (ponowienie),
 * - kazdy inny wazny stan   -> 409 ask_exists,
 * - brak stanu, jest dokument: wolno TYLKO gdy dokument niesie adres autora
 *   z sesji I nie ma zadnej odpowiedzi (stary albo zasiedziany dokument
 *   z wlasnym adresem autora) - inaczej 409 ask_exists,
 * - nie ma nic               -> 'create'.
 */
export function decideEscrowedCreate(input: EscrowedCreateInput): EscrowedCreateDecision {
  const session = asAddress(input.session);
  const fundTxHash = asTxHash(input.fundTxHash);
  if (!session || !fundTxHash) {
    return { action: 'refuse', status: 400, code: 'invalid_request', error: 'Missing a valid author or deposit hash.' };
  }

  const { stateCheck } = input;
  if (stateCheck.kind === 'invalid') {
    return {
      action: 'refuse',
      status: 503,
      code: 'seal_invalid',
      error: 'An Ask with this id exists but cannot be verified right now. Nothing was changed.',
    };
  }

  if (stateCheck.kind === 'valid') {
    const state = stateCheck.value;
    if (state.author === session && state.funding === 'escrowed' && state.escrow?.fundTxHash === fundTxHash) {
      return { action: 'existing' };
    }
    return askExists();
  }

  if (!input.pubExists) return { action: 'create' };
  if (asAddress(input.pubAuthor) === session && !input.hasAnswers) return { action: 'overwrite' };
  return askExists();
}

function askExists(): EscrowedCreateDecision {
  return {
    action: 'refuse',
    status: 409,
    code: 'ask_exists',
    error: 'An Ask with this id already exists and belongs to someone else, or already has answers.',
  };
}

/* ------------------------------------------------------------------ */
/*  ODPOWIEDZ TRASY                                                    */
/* ------------------------------------------------------------------ */

/**
 * Sam Ask, bez pol serwera (trust, escrow, state). Te pola nie sa tajne, ale
 * klient ich nie czyta, a karta ma dostac dokladnie ksztalt `Ask` - ten sam,
 * ktory daje toAsk przy odczycie listy.
 */
export function publicAsk(view: Ask): Ask {
  return {
    id: view.id,
    author: view.author,
    question: view.question,
    budget: view.budget,
    seats: view.seats,
    perAnswer: view.perAnswer,
    token: view.token,
    network: view.network,
    deadline: view.deadline,
    createdAt: view.createdAt,
    status: view.status,
    funding: view.funding,
    answerCount: view.answerCount,
    acceptedCount: view.acceptedCount,
    ...(view.resolvedAt !== undefined ? { resolvedAt: view.resolvedAt } : {}),
    escrowTxHash: view.escrowTxHash ?? null,
    escrowChainId: view.escrowChainId ?? null,
    escrowResolveTxHash: view.escrowResolveTxHash ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  KLIENT: PONOWIENIA ZAPISU                                          */
/* ------------------------------------------------------------------ */

/**
 * Ile razy klient PONAWIA zapis po pierwszej probie. fund_not_visible znaczy,
 * ze RPC serwera jeszcze nie widzi paragonu, ktory portfel juz potwierdzil -
 * zwykle to sekundy. 8 ponowien z odstepem 1,5 s x numer daje ~54 s.
 */
export const CREATE_RETRY_LIMIT = 8;
const CREATE_RETRY_STEP_MS = 1500;

export function createRetryDelayMs(retry: number): number {
  return CREATE_RETRY_STEP_MS * Math.max(1, Math.floor(retry));
}

/** Odmowa, po ktorej warto sprobowac jeszcze raz tym samym zadaniem. */
export function isRetryableCreateRefusal(code: string | null | undefined): boolean {
  return code === 'fund_not_visible';
}

/**
 * Odmowy, po ktorych TEN depozyt nigdy nie da sie zapisac jako Ask: fund
 * cofniety, fund nie dla tego id z tego portfela, warunki na lancuchu inne niz
 * zapamietane, id zajete, albo zle same zapamietane warunki (kwota, miejsca,
 * stawka) - te przy ponowieniu sa zawsze te same. Zapamietany depozyt trzeba
 * wtedy zapomniec - inaczej kazde nastepne "Post" z escrow probowaloby zapisac
 * go od nowa i nigdy nie doszloby do nowego depozytu. Pieniadze i tak wracaja
 * z kontraktu po terminie + 48 h (minus oplata).
 *
 * NIE ma tu odmow zaleznych od biezacej tresci pytania (missing_question,
 * question_too_long) ani chwilowych (503, 401, fund_not_visible) - po nich
 * autor poprawia tresc albo ponawia, a depozyt zostaje zapamietany.
 */
const DEFINITIVE_ESCROW_REFUSALS: ReadonlySet<string> = new Set([
  'fund_reverted',
  'fund_not_for_this_ask',
  'fund_mismatch',
  'ask_exists',
  'invalid_id',
  'invalid_fund_tx',
  'invalid_deadline',
  'invalid_budget',
  'invalid_seats',
  'per_answer_too_low',
]);

export function isDefinitiveEscrowRefusal(code: string | null | undefined): boolean {
  return typeof code === 'string' && DEFINITIVE_ESCROW_REFUSALS.has(code);
}

/* ------------------------------------------------------------------ */
/*  KLIENT: ZAPAMIETANY DEPOZYT (pending escrow)                       */
/* ------------------------------------------------------------------ */

/**
 * Depozyt, ktory jest juz na kontrakcie, a Ask jeszcze nie zostal zapisany.
 *
 * KLUCZEM JEST SAM AUTOR, nie odcisk szkicu. Odcisk z tresci pytania
 * sprawial, ze poprawka jednego slowa po nieudanym zapisie wygladala jak nowy
 * Ask i konczyla sie DRUGIM depozytem. Dopoki autor ma zapamietany depozyt,
 * kazde "Post" z escrow zapisuje TEN depozyt (jego warunkami z lancucha),
 * a nie zaklada nowego. Inna tresc pytania wolno podac.
 */
export type PendingEscrow = {
  /** Autor, malymi literami. */
  author: string;
  /** Identyfikator z newAskId - to on jest askId na lancuchu. */
  reservedId: string;
  /** Hash transakcji fund, malymi literami. */
  fundTxHash: string;
  /** Termin, ktory poszedl do kontraktu (ms). */
  deadlineMs: number;
  budget: number;
  seats: number;
  /** Pytanie z chwili depozytu - tylko do pokazania, zapis bierze biezace. */
  question: string;
  savedAt: number;
};

export const PENDING_ESCROW_STORAGE_KEY = 'mysphere:ask-pending-escrow';

export type PendingEscrowMap = Record<string, PendingEscrow>;

function asPendingEscrow(value: unknown): PendingEscrow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const author = asAddress(raw.author);
  const fundTxHash = asTxHash(raw.fundTxHash);
  if (!author || !fundTxHash || !isEscrowAskId(raw.reservedId)) return null;
  if (typeof raw.deadlineMs !== 'number' || !Number.isFinite(raw.deadlineMs) || raw.deadlineMs <= 0) return null;
  if (typeof raw.budget !== 'number' || !Number.isFinite(raw.budget) || raw.budget <= 0) return null;
  if (typeof raw.seats !== 'number' || !Number.isSafeInteger(raw.seats) || raw.seats < 1) return null;
  return {
    author,
    reservedId: raw.reservedId,
    fundTxHash,
    deadlineMs: raw.deadlineMs,
    budget: raw.budget,
    seats: raw.seats,
    question: typeof raw.question === 'string' ? raw.question : '',
    savedAt: typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : 0,
  };
}

/**
 * Odczyt mapy z localStorage. Zly JSON albo zle wpisy znikaja po cichu -
 * wpis, ktorego nie umiemy odczytac, nie moze zablokowac zakladania.
 */
export function parsePendingEscrows(raw: string | null | undefined): PendingEscrowMap {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: PendingEscrowMap = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const entry = asPendingEscrow(value);
    // Klucz musi byc autorem wpisu - inaczej wpis jednego portfela
    // zapisywalby sie pod drugim.
    if (entry && asAddress(key) === entry.author) out[entry.author] = entry;
  }
  return out;
}

export function pendingEscrowFor(map: PendingEscrowMap, author: string): PendingEscrow | null {
  const key = asAddress(author);
  return key ? map[key] ?? null : null;
}

export function withPendingEscrow(map: PendingEscrowMap, entry: PendingEscrow): PendingEscrowMap {
  const checked = asPendingEscrow(entry);
  if (!checked) return map;
  return { ...map, [checked.author]: checked };
}

export function withoutPendingEscrow(map: PendingEscrowMap, author: string): PendingEscrowMap {
  const key = asAddress(author);
  if (!key || !(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}
