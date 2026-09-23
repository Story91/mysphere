import { toMillis } from '../firestoreTime';
import {
  AskError,
  adoptLegacyState,
  canonicalJson,
  escrowSeatAcceptance,
  isAutoFull,
  isDocId,
  lowerAddress,
  lowerTxHash,
  payoutRegistryId,
  pickTransfer,
  transferAcceptance,
  weakAcceptance,
  type AcceptanceRecord,
  type PayoutRegistryEntry,
  type SealCheck,
  type SealedAskState,
  type SealedEscrow,
  type TransferLike,
} from './askSealCore';

/**
 * RESEAL ASKOW SPRZED PIECZECI - czysta logika decyzji, bez Firestore i RPC.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Aski zalozone przed wdrozeniem pieczeci nie maja asks/{id}/sealed/state.
 * Trasa POST /api/admin/asks-reseal (wolana przez wlasciciela) pieczetuje je
 * raz, na podstawie DOWODOW: odczytu escrowFor, logow AskResolved/AskExpired,
 * przelewow USDC i SeatAwarded. Ten plik mowi, CO z tych dowodow wynika;
 * trasa (app/api/admin/asks-reseal/resealEngine.ts) je zbiera i zapisuje.
 *
 * Czysty modul (bez 'server-only'), zeby mocha sprawdzala kazda galaz
 * decyzji (test/asksReseal.test.ts) bez bazy i bez lancucha.
 *
 * ===========================================================================
 * ZASADY, KTORYCH TEN PLIK PILNUJE
 * ===========================================================================
 * 1. Nic nie jest resetowane automatycznie. Slaby dowod ('weak') albo brak
 *    dowodu ('forged') zostaje w raporcie jako `needs_decision`, a Ask
 *    zostaje BEZ pieczeci, dopoki wlasciciel nie zdecyduje (trustWeak /
 *    resetForged). Zapieczetowanie go wczesniej sprawiloby, ze scisly widok
 *    pokaze przycisk "zaplac" przy odpowiedzi, za ktora autor juz zaplacil -
 *    i autor zaplacilby drugi raz.
 * 2. Przyjecie liczy sie tylko z rekordu albo z dowodu 'transfer' /
 *    'escrow-seat' z tego przebiegu. `accepted`, `acceptedCount` i
 *    `answerCount` z lustra nie wchodza do zadnej decyzji.
 * 3. Jedyne pole lustra, ktore wplywa na stan, to `status` starego Aska
 *    'on-resolve' (decyzja planu, krok 13): 'resolved' zostaje uznane, gdy
 *    jest co najmniej jedno ZWERYFIKOWANE przyjecie albo gdy nikt nie
 *    odpowiedzial (nie ma czego odslonic ani komu zaplacic). Okno, w ktorym
 *    przegladarka moze to podrobic, to czas miedzy wdrozeniem a resealem -
 *    dlatego raport pokazuje createTime i status z lustra obok werdyktu.
 */

/* ------------------------------------------------------------------ */
/*  ZADANIE                                                            */
/* ------------------------------------------------------------------ */

export const RESEAL_DEFAULT_LIMIT = 10;
export const RESEAL_MAX_LIMIT = 25;
/** Bezpiecznik na dlugosc list decyzji w jednym zadaniu. */
const MAX_DECISION_ENTRIES = 500;

export type ResealDecisions = {
  /** Id ODPOWIEDZI ze slabym dowodem, ktore wlasciciel uznaje (kind 'legacy-weak'). */
  trustWeak: ReadonlySet<string>;
  /** Id ODPOWIEDZI, ktorych lustro 'accepted' wlasciciel kaze wyczyscic. */
  resetForged: ReadonlySet<string>;
  /** Id ASKA -> hash transakcji zamykajacej escrow (AskResolved/AskExpired). */
  resolveHashes: ReadonlyMap<string, string>;
  /** Id ASKOW bez stanu, bez odpowiedzi i bez escrow do skasowania. */
  deleteUnverified: ReadonlySet<string>;
  /** Id ASKOW, ktorych niewazny stan/rekordy wolno nadpisac dowodem z lancucha. */
  repairInvalid: ReadonlySet<string>;
  /**
   * Id ASKOW bez stanu zalozonych PO granicy (ASK_LEGACY_CUTOFF_MS), ktore
   * wlasciciel sprawdzil recznie i kaze adoptowac. Bez tego taki Ask jest
   * pomijany: po wdrozeniu Aska bez stanu zaklada tylko devtools, a adopcja
   * nadalaby spoofowi prawdziwa pieczec.
   */
  adoptAfterCutoff: ReadonlySet<string>;
};

export type ResealRequest = {
  apply: boolean;
  cursor: string | null;
  limit: number;
  decisions: ResealDecisions;
};

export type ResealParse = { ok: true; request: ResealRequest } | { ok: false; error: string };

const BODY_KEYS = new Set([
  'apply',
  'cursor',
  'limit',
  'trustWeak',
  'resetForged',
  'resolveHashes',
  'deleteUnverified',
  'repairInvalid',
  'adoptAfterCutoff',
]);

/**
 * Dowolny identyfikator dokumentu Firestore (nie tylko isDocId) - do kursora
 * i do kasowania Askow, ktore przegladarka zalozyla z dziwnym id. Takie id
 * nigdy nie trafia do doc() jako sciezka: kursor idzie do startAfter po
 * documentId, a kasowanie uzywa referencji z listingu.
 */
export function isFirestoreDocId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1500 &&
    !value.includes('/') &&
    value !== '.' &&
    value !== '..' &&
    !/^__.*__$/.test(value)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function idList(
  body: Record<string, unknown>,
  field: string,
  accept: (id: unknown) => boolean
): { ok: true; set: Set<string> } | { ok: false; error: string } {
  const raw = body[field];
  if (raw === undefined || raw === null) return { ok: true, set: new Set() };
  if (!Array.isArray(raw)) return { ok: false, error: `${field} must be an array of ids.` };
  if (raw.length > MAX_DECISION_ENTRIES) return { ok: false, error: `${field} has more than ${MAX_DECISION_ENTRIES} entries.` };
  const set = new Set<string>();
  for (const id of raw) {
    if (!accept(id)) return { ok: false, error: `${field} contains an invalid id: ${JSON.stringify(id)}.` };
    set.add(id as string);
  }
  return { ok: true, set };
}

/**
 * Walidacja ciala zadania. Nieznane pola to blad, nie cisza: literowka
 * w "resetForged" nie moze po cichu znaczyc "nic nie resetuj", a "apply":
 * "true" (string) - "zapisz".
 */
export function parseResealRequest(body: unknown): ResealParse {
  const input = body === undefined || body === null ? {} : body;
  if (!isPlainObject(input)) return { ok: false, error: 'The body must be a JSON object.' };

  for (const key of Object.keys(input)) {
    if (!BODY_KEYS.has(key)) return { ok: false, error: `Unknown field: ${key}.` };
  }

  if (input.apply !== undefined && typeof input.apply !== 'boolean') {
    return { ok: false, error: 'apply must be true or false.' };
  }

  let cursor: string | null = null;
  if (input.cursor !== undefined && input.cursor !== null) {
    if (!isFirestoreDocId(input.cursor)) return { ok: false, error: 'cursor must be an Ask id from nextCursor.' };
    cursor = input.cursor;
  }

  let limit = RESEAL_DEFAULT_LIMIT;
  if (input.limit !== undefined) {
    if (!(typeof input.limit === 'number' && Number.isSafeInteger(input.limit) && input.limit >= 1 && input.limit <= RESEAL_MAX_LIMIT)) {
      return { ok: false, error: `limit must be a whole number from 1 to ${RESEAL_MAX_LIMIT}.` };
    }
    limit = input.limit;
  }

  const trustWeak = idList(input, 'trustWeak', isDocId);
  if (!trustWeak.ok) return trustWeak;
  const resetForged = idList(input, 'resetForged', isDocId);
  if (!resetForged.ok) return resetForged;
  const repairInvalid = idList(input, 'repairInvalid', isDocId);
  if (!repairInvalid.ok) return repairInvalid;
  const deleteUnverified = idList(input, 'deleteUnverified', isFirestoreDocId);
  if (!deleteUnverified.ok) return deleteUnverified;
  const adoptAfterCutoff = idList(input, 'adoptAfterCutoff', isDocId);
  if (!adoptAfterCutoff.ok) return adoptAfterCutoff;

  for (const id of trustWeak.set) {
    if (resetForged.set.has(id)) return { ok: false, error: `Answer ${id} is in both trustWeak and resetForged.` };
  }
  for (const id of deleteUnverified.set) {
    if (repairInvalid.set.has(id)) return { ok: false, error: `Ask ${id} is in both deleteUnverified and repairInvalid.` };
    if (adoptAfterCutoff.set.has(id)) return { ok: false, error: `Ask ${id} is in both deleteUnverified and adoptAfterCutoff.` };
  }

  const resolveHashes = new Map<string, string>();
  if (input.resolveHashes !== undefined && input.resolveHashes !== null) {
    if (!isPlainObject(input.resolveHashes)) return { ok: false, error: 'resolveHashes must be an object {askId: txHash}.' };
    const entries = Object.entries(input.resolveHashes);
    if (entries.length > MAX_DECISION_ENTRIES) return { ok: false, error: 'resolveHashes has too many entries.' };
    for (const [askId, hash] of entries) {
      const lower = lowerTxHash(hash);
      if (!isDocId(askId) || !lower) return { ok: false, error: `resolveHashes has an invalid entry for ${JSON.stringify(askId)}.` };
      resolveHashes.set(askId, lower);
    }
  }

  return {
    ok: true,
    request: {
      apply: input.apply === true,
      cursor,
      limit,
      decisions: {
        trustWeak: trustWeak.set,
        resetForged: resetForged.set,
        resolveHashes,
        deleteUnverified: deleteUnverified.set,
        repairInvalid: repairInvalid.set,
        adoptAfterCutoff: adoptAfterCutoff.set,
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  PRZYJECIA                                                          */
/* ------------------------------------------------------------------ */

/**
 * Werdykt verifyLegacyAcceptance (askStore.ts) - ten sam ksztalt, opisany tu
 * strukturalnie, bo askStore jest 'server-only' i mocha go tu nie potrzebuje.
 */
export type LegacyVerdictLike =
  | {
      kind: 'transfer';
      txHash: string;
      payee: string;
      from: string;
      candidates: readonly TransferLike[];
      blockTimeSec: number;
    }
  | {
      kind: 'escrow-seat';
      txHash: string;
      payee: string;
      contract: string;
      chainId: number;
      award: { logIndex: number; amount: bigint };
      blockTimeSec: number;
    }
  | { kind: 'weak'; txHash: string; payee: string; candidates: readonly TransferLike[]; reason?: string }
  | { kind: 'forged'; reason: string }
  | { kind: 'unknown'; reason: string };

export type AnswerAcceptanceInput = {
  answerId: string;
  /** Stan rekordu asks/{askId}/acceptances/{answerId}. */
  record: 'valid' | 'absent' | 'invalid';
  /** Lustro mowi `accepted: true`. Samo w sobie niczego nie dowodzi. */
  mirrorAccepted: boolean;
  /** Wynik weryfikacji - tylko gdy rekordu nie ma (albo jest niewazny), a lustro mowi accepted. */
  verdict: LegacyVerdictLike | null;
  /** Do raportu: odpowiadajacy i hash z lustra (malymi literami albo null). */
  payee: string | null;
  txHash: string | null;
};

/**
 * free    - wpisu nie ma, log jest do wziecia,
 * ours    - wazny wpis dla TEJ odpowiedzi (ponowienie przebiegu),
 * used    - wazny wpis dla INNEJ odpowiedzi: ten log juz zaplacil za cos innego,
 * invalid - wpis z niewazna pieczecia: bez repairInvalid Ask stoi (503 w trasach).
 */
export type RegistrySlot = 'free' | 'ours' | 'used' | 'invalid';

export function registrySlot(
  check: SealCheck<PayoutRegistryEntry> | undefined,
  askId: string,
  answerId: string
): RegistrySlot {
  if (!check || check.kind === 'absent') return 'free';
  if (check.kind === 'invalid') return 'invalid';
  return check.value.askId === askId && check.value.answerId === answerId ? 'ours' : 'used';
}

const BASE_CHAIN_ID = 8453;

/** Id wpisow rejestru, ktore trasa musi przeczytac, zanim wywola planAcceptances. */
export function registryIdsToRead(answers: readonly AnswerAcceptanceInput[]): string[] {
  const ids = new Set<string>();
  for (const answer of answers) {
    const verdict = answer.verdict;
    if (!verdict) continue;
    if (verdict.kind === 'transfer' || verdict.kind === 'weak') {
      for (const candidate of verdict.candidates) ids.add(payoutRegistryId(BASE_CHAIN_ID, verdict.txHash, candidate.logIndex));
    } else if (verdict.kind === 'escrow-seat') {
      ids.add(payoutRegistryId(verdict.chainId, verdict.txHash, verdict.award.logIndex));
    }
  }
  return [...ids];
}

export type PlannedRecord = {
  answerId: string;
  record: AcceptanceRecord;
  /** create - tx.create wpisu; keep - wpis juz jest nasz; overwrite - nadpisanie niewaznego (repairInvalid). */
  registry: 'create' | 'keep' | 'overwrite';
  regId: string;
  /** Czas bloku wyplaty (s) - do resolvedAt przy 'auto-full'. */
  blockTimeSec: number | null;
};

export type UndecidedAcceptance = {
  answerId: string;
  verdict: 'weak' | 'forged';
  reason: string;
  payee: string | null;
  txHash: string | null;
  /** Przelewy do odpowiadajacego, ktore nie wiaza sie z autorem albo z czasem. */
  candidates: Array<{ from: string; logIndex: number; units: string }>;
};

export type AcceptancePlan = {
  /** Rekordy do zapisania (nowe albo nadpisujace niewazne przy repairInvalid). */
  records: PlannedRecord[];
  /** Odpowiedzi, ktorych lustro 'accepted' czyscimy (tylko z resetForged). */
  resets: string[];
  /** Brak decyzji wlasciciela - Ask zostaje bez zmian i bez pieczeci. */
  undecided: UndecidedAcceptance[];
  /** Awaria RPC - Ask pomijamy (zamknieto). */
  unknown: Array<{ answerId: string; reason: string }>;
  /** Niewazne rekordy/wpisy bez repairInvalid - Ask pomijamy. */
  blocked: Array<{ answerId: string; code: string; regId?: string }>;
  /** Informacje dla wlasciciela (decyzja zbedna albo zignorowana). */
  notes: Array<{ answerId: string; code: string }>;
};

type LogChoice =
  | { kind: 'picked'; candidate: TransferLike; regId: string; registry: 'create' | 'keep' | 'overwrite' }
  | { kind: 'none' }
  | { kind: 'blocked'; regId: string };

/**
 * Plan przyjec jednego Aska. Kolejnosc odpowiedzi = kolejnosc wejscia
 * (trasa podaje je po createTime), a logi wziete przez wczesniejsza
 * odpowiedz sa zajete dla pozniejszych - jeden log placi za jedna odpowiedz.
 */
export function planAcceptances(input: {
  askId: string;
  /** Autor Aska malymi literami - odpowiedz autora sama sobie nie jest wyplata. */
  author: string;
  answers: readonly AnswerAcceptanceInput[];
  registry: ReadonlyMap<string, SealCheck<PayoutRegistryEntry>>;
  trustWeak: ReadonlySet<string>;
  resetForged: ReadonlySet<string>;
  /** repairInvalid dla tego Aska: niewazne rekordy i wpisy wolno nadpisac. */
  repair: boolean;
}): AcceptancePlan {
  const { askId, registry, trustWeak, resetForged, repair } = input;
  const author = input.author.toLowerCase();
  const plan: AcceptancePlan = { records: [], resets: [], undecided: [], unknown: [], blocked: [], notes: [] };
  /** txHash -> logIndexy wziete w tym Asku. */
  const takenInAsk = new Map<string, Set<number>>();

  const taken = (txHash: string) => {
    let set = takenInAsk.get(txHash);
    if (!set) {
      set = new Set();
      takenInAsk.set(txHash, set);
    }
    return set;
  };

  const chooseLog = (answerId: string, txHash: string, candidates: readonly TransferLike[]): LogChoice => {
    const inAsk = taken(txHash);
    const slots = candidates.map((candidate) => {
      const regId = payoutRegistryId(BASE_CHAIN_ID, txHash, candidate.logIndex);
      return { candidate, regId, slot: registrySlot(registry.get(regId), askId, answerId) };
    });
    // Ponowienie: log juz zapisany dla tej odpowiedzi wygrywa z kazdym innym.
    const ours = slots.find((s) => s.slot === 'ours' && !inAsk.has(s.candidate.logIndex));
    if (ours) return { kind: 'picked', candidate: ours.candidate, regId: ours.regId, registry: 'keep' };
    const invalid = slots.find((s) => s.slot === 'invalid');
    if (invalid && !repair) return { kind: 'blocked', regId: invalid.regId };

    const unavailable = new Set<number>(inAsk);
    for (const s of slots) if (s.slot === 'used' || s.slot === 'ours') unavailable.add(s.candidate.logIndex);
    const picked = pickTransfer(candidates, unavailable);
    if (!picked) return { kind: 'none' };
    const slot = slots.find((s) => s.candidate.logIndex === picked.logIndex)!;
    return { kind: 'picked', candidate: picked, regId: slot.regId, registry: slot.slot === 'invalid' ? 'overwrite' : 'create' };
  };

  const undecidedOrReset = (answer: AnswerAcceptanceInput, entry: UndecidedAcceptance) => {
    if (resetForged.has(answer.answerId)) {
      plan.resets.push(answer.answerId);
      return;
    }
    if (trustWeak.has(answer.answerId) && entry.verdict === 'forged') {
      plan.notes.push({ answerId: answer.answerId, code: 'trust_weak_not_applicable' });
    }
    plan.undecided.push(entry);
  };

  const forgedEntry = (answer: AnswerAcceptanceInput, reason: string): UndecidedAcceptance => ({
    answerId: answer.answerId,
    verdict: 'forged',
    reason,
    payee: answer.payee,
    txHash: answer.txHash,
    candidates: [],
  });

  for (const answer of input.answers) {
    const { answerId } = answer;

    if (answer.record === 'valid') {
      if (resetForged.has(answerId)) plan.notes.push({ answerId, code: 'reset_refused_recorded' });
      if (trustWeak.has(answerId)) plan.notes.push({ answerId, code: 'trust_weak_not_needed' });
      continue;
    }
    if (answer.record === 'invalid' && !repair) {
      plan.blocked.push({ answerId, code: 'record_invalid' });
      continue;
    }
    if (!answer.mirrorAccepted) {
      if (answer.record === 'invalid') {
        // Niewazny rekord przy odpowiedzi, ktorej lustro nie mowi "accepted":
        // nie ma skad odtworzyc dowodu. Wlasciciel musi to obejrzec recznie.
        plan.blocked.push({ answerId, code: 'record_invalid_unrecoverable' });
        continue;
      }
      if (resetForged.has(answerId)) plan.notes.push({ answerId, code: 'reset_not_needed' });
      if (trustWeak.has(answerId)) plan.notes.push({ answerId, code: 'trust_weak_not_applicable' });
      continue;
    }

    const verdict = answer.verdict;
    if (!verdict) {
      plan.blocked.push({ answerId, code: 'verdict_missing' });
      continue;
    }
    if (verdict.kind === 'unknown') {
      plan.unknown.push({ answerId, reason: verdict.reason });
      continue;
    }
    if (verdict.kind === 'forged') {
      undecidedOrReset(answer, forgedEntry(answer, verdict.reason));
      continue;
    }
    // Odpowiedz autora na wlasnego Aska nie jest wyplata - trasa accept tez ja
    // odrzuca (invalid_payee). Przelew "do siebie" nie moze zajac miejsca.
    if (verdict.payee.toLowerCase() === author) {
      undecidedOrReset(answer, forgedEntry(answer, 'self_payment'));
      continue;
    }

    if (verdict.kind === 'transfer') {
      const choice = chooseLog(answerId, verdict.txHash, verdict.candidates);
      if (choice.kind === 'blocked') {
        plan.blocked.push({ answerId, code: 'registry_invalid', regId: choice.regId });
        continue;
      }
      if (choice.kind === 'none') {
        undecidedOrReset(answer, forgedEntry(answer, 'payout_already_used'));
        continue;
      }
      if (resetForged.has(answerId)) plan.notes.push({ answerId, code: 'reset_ignored_verified' });
      taken(verdict.txHash).add(choice.candidate.logIndex);
      plan.records.push({
        answerId,
        regId: choice.regId,
        registry: choice.registry,
        blockTimeSec: verdict.blockTimeSec,
        record: transferAcceptance({
          askId,
          answerId,
          payee: verdict.payee,
          from: choice.candidate.from,
          txHash: verdict.txHash,
          logIndex: choice.candidate.logIndex,
          units: choice.candidate.value,
        }),
      });
      continue;
    }

    if (verdict.kind === 'escrow-seat') {
      const regId = payoutRegistryId(verdict.chainId, verdict.txHash, verdict.award.logIndex);
      const slot = registrySlot(registry.get(regId), askId, answerId);
      if (slot === 'invalid' && !repair) {
        plan.blocked.push({ answerId, code: 'registry_invalid', regId });
        continue;
      }
      if (slot === 'used' || taken(verdict.txHash).has(verdict.award.logIndex)) {
        undecidedOrReset(answer, forgedEntry(answer, 'payout_already_used'));
        continue;
      }
      if (resetForged.has(answerId)) plan.notes.push({ answerId, code: 'reset_ignored_verified' });
      taken(verdict.txHash).add(verdict.award.logIndex);
      plan.records.push({
        answerId,
        regId,
        registry: slot === 'ours' ? 'keep' : slot === 'invalid' ? 'overwrite' : 'create',
        blockTimeSec: verdict.blockTimeSec,
        record: escrowSeatAcceptance({
          askId,
          answerId,
          payee: verdict.payee,
          contract: verdict.contract,
          chainId: verdict.chainId,
          txHash: verdict.txHash,
          logIndex: verdict.award.logIndex,
          units: verdict.award.amount,
        }),
      });
      continue;
    }

    // 'weak': przelew do odpowiadajacego jest, ale nie od autora albo sprzed
    // odpowiedzi - albo pasuje, lecz samo lustro 'accepted' powstalo po
    // granicy (mirror_after_cutoff / payout_after_cutoff: mozliwe przypiecie
    // cudzej wyplaty z devtools). Uznajemy go WYLACZNIE z jawnej decyzji
    // wlasciciela.
    const weakEntry: UndecidedAcceptance = {
      answerId,
      verdict: 'weak',
      reason: verdict.reason ?? 'transfer_not_bound_to_author_or_time',
      payee: verdict.payee,
      txHash: verdict.txHash,
      candidates: verdict.candidates.map((c) => ({ from: c.from, logIndex: c.logIndex, units: c.value.toString() })),
    };
    if (!trustWeak.has(answerId)) {
      undecidedOrReset(answer, weakEntry);
      continue;
    }
    const choice = chooseLog(answerId, verdict.txHash, verdict.candidates);
    if (choice.kind === 'blocked') {
      plan.blocked.push({ answerId, code: 'registry_invalid', regId: choice.regId });
      continue;
    }
    if (choice.kind === 'none') {
      // Wlasciciel ufa, ale kazdy pasujacy log juz zaplacil za inna odpowiedz.
      plan.undecided.push({ ...weakEntry, reason: 'payout_already_used' });
      continue;
    }
    taken(verdict.txHash).add(choice.candidate.logIndex);
    plan.records.push({
      answerId,
      regId: choice.regId,
      registry: choice.registry,
      blockTimeSec: null,
      record: weakAcceptance({
        askId,
        answerId,
        payee: verdict.payee,
        from: choice.candidate.from,
        txHash: verdict.txHash,
        logIndex: choice.candidate.logIndex,
        units: choice.candidate.value,
      }),
    });
  }

  return plan;
}

/* ------------------------------------------------------------------ */
/*  STAN ASKA                                                          */
/* ------------------------------------------------------------------ */

export type EscrowClosure =
  | { kind: 'resolved'; txHash: string; logIndex: number; blockTimeSec: number }
  | { kind: 'expired'; txHash: string; logIndex: number };

/**
 * Co wiemy o escrow z lancucha (zebrane przez trase w tym przebiegu).
 * funded:false - escrowFor(author, askId) mowi, ze klucza nigdy nie sfinansowano.
 */
export type EscrowEvidence =
  | { funded: false }
  | {
      funded: true;
      escrow: SealedEscrow;
      /** Rozjazdy dokumentu z lancuchem (legacyEscrowFromChain) - do raportu. */
      anomalies: readonly string[];
      /** escrowFor.open w chwili odczytu. */
      open: boolean;
      /** AskResolved/AskExpired z kluczem tego Aska, jesli znaleziony. */
      closure: EscrowClosure | null;
      /** Dwa rozne zamkniecia w podanych hashach - nie zgadujemy. */
      closureConflict: boolean;
    };

export type AskStateInput = {
  askId: string;
  /** Dokument asks/{id} (lustro + pola zamrozone regulami). */
  pub: Record<string, any> | null;
  /** createTime dokumentu (nadany przez serwer). */
  pubCreateTimeMs: number | null;
  /** Wazny zapieczetowany stan albo null (brak stanu albo naprawa niewaznego). */
  sealed: SealedAskState | null;
  /** Liczba odpowiedzi z zapytania (nie z answerCount lustra). */
  answerCount: number;
  /** Przyjecia po tym przebiegu: wazne rekordy + nowe z weryfikacji. */
  recordedCount: number;
  /** Najpozniejszy czas bloku nowo zweryfikowanej wyplaty (ms) albo null. */
  latestPayoutMs: number | null;
  /** Dowod escrow; null dla Askow 'on-resolve'. */
  escrow: EscrowEvidence | null;
  nowMs: number;
};

export type AskStatePlan =
  | {
      ok: true;
      state: SealedAskState;
      /** Stan rozni sie od `sealed` (dla Aska bez stanu zawsze true). */
      changed: boolean;
      /** Klasyfikacja do raportu (np. 'fake_escrow', 'forged_resolve', 'escrow_resolved'). */
      labels: string[];
      /** Rozjazdy do obejrzenia przez wlasciciela. */
      anomalies: string[];
      fakeEscrow: boolean;
    }
  | { ok: false; code: string; detail: string };

/** Tolerancja przy porownaniu znacznikow czasu lustra (tylko do wyswietlania). */
const DISPLAY_TIME_SLACK_MS = 60_000;

function closeEscrow(state: SealedAskState, closure: EscrowClosure): SealedAskState {
  if (closure.kind === 'resolved') {
    return {
      ...state,
      status: 'resolved',
      resolveKind: 'escrow',
      resolveTxHash: closure.txHash,
      resolvedAt: closure.blockTimeSec * 1000,
    };
  }
  return { ...state, status: 'expired', expiredTxHash: closure.txHash, expiredLogIndex: closure.logIndex };
}

/**
 * resolvedAt starego Aska 'resolved': z lustra, jesli jest sensowny (po
 * createTime, nie w przyszlosci), inaczej czas ostatniej wyplaty albo teraz.
 * To pole tylko do wyswietlania - o statusie decyduja dowody, nie ono.
 */
function legacyResolvedAt(input: AskStateInput): number {
  const fromPub = toMillis(input.pub?.resolvedAt);
  const notBefore = (input.pubCreateTimeMs ?? 0) - DISPLAY_TIME_SLACK_MS;
  if (fromPub > 0 && fromPub >= notBefore && fromPub <= input.nowMs + DISPLAY_TIME_SLACK_MS) return fromPub;
  return input.latestPayoutMs ?? input.nowMs;
}

function statusLabel(raw: unknown): string {
  // Status z lustra trafia do raportu - przycinamy smieci do rozsadnego ksztaltu.
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw) ?? 'undefined';
  return text.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'empty';
}

/**
 * Stan Aska BEZ pieczeci (albo z niewazna pieczecia przy repairInvalid),
 * zbudowany z pol zamrozonych regulami i z dowodow. Origin zawsze 'legacy':
 * autorstwa starego Aska nie da sie juz udowodnic.
 */
export function classifyLegacyAsk(input: AskStateInput): AskStatePlan {
  const { askId, pub, escrow } = input;
  if (!pub) return { ok: false, code: 'public_doc_missing', detail: 'The Ask document is missing; nothing to adopt.' };

  const labels: string[] = ['adopted'];
  const anomalies: string[] = [];
  let fakeEscrow = false;
  let state: SealedAskState;

  try {
    if (pub.funding === 'escrowed') {
      if (!escrow) return { ok: false, code: 'escrow_unchecked', detail: 'Escrowed Ask without an escrowFor read.' };
      if (!escrow.funded) {
        // Dokument obiecuje escrow, a kontrakt nigdy nie dostal depozytu pod
        // kluczem (autor, askId). Pieczetujemy prawde: 'on-resolve'.
        fakeEscrow = true;
        labels.push('fake_escrow');
        state = adoptLegacyState(askId, { ...pub, funding: 'on-resolve' }, 'legacy', null);
      } else {
        labels.push('escrow_verified');
        anomalies.push(...escrow.anomalies);
        state = adoptLegacyState(askId, pub, 'legacy', escrow.escrow);
      }
    } else {
      state = adoptLegacyState(askId, pub, 'legacy', null);
    }
  } catch (error) {
    if (error instanceof AskError) return { ok: false, code: error.code, detail: error.message };
    throw error;
  }

  const rawStatus = pub.status;
  if (rawStatus !== 'open' && rawStatus !== 'resolved' && rawStatus !== 'expired') {
    anomalies.push(`unknown_status:${statusLabel(rawStatus)}`);
  }

  if (state.funding === 'escrowed' && escrow && escrow.funded) {
    if (escrow.closureConflict) anomalies.push('closure_conflict');
    if (escrow.closure && !escrow.closureConflict) {
      state = closeEscrow(state, escrow.closure);
      labels.push(escrow.closure.kind === 'resolved' ? 'escrow_resolved' : 'escrow_expired');
    } else if (!escrow.open) {
      // Kontrakt jest zamkniety, a zaden podany hash tego nie dowodzi.
      // Zostaje 'open'; wlasciciel podaje hash (resolveHashes) albo autor
      // wysyla escrow-resolve jeszcze raz.
      anomalies.push('closed_on_chain_unrecorded');
    } else {
      if (rawStatus === 'resolved') labels.push('forged_resolve');
      if (rawStatus === 'expired') labels.push('forged_expire');
    }
  } else {
    if (rawStatus === 'resolved') {
      if (input.recordedCount > 0 || input.answerCount === 0) {
        state = { ...state, status: 'resolved', resolveKind: 'legacy', resolvedAt: legacyResolvedAt(input) };
        labels.push(input.answerCount === 0 ? 'resolved_empty' : 'resolved_legacy');
      } else {
        // 'resolved' przy odpowiedziach bez ani jednej zweryfikowanej wyplaty:
        // dokladnie ta podrobka, ktora odslonilaby cudze odpowiedzi.
        labels.push('forged_resolve');
      }
    } else if (rawStatus === 'expired') {
      labels.push('forged_expire');
    }
    if (state.status === 'open' && isAutoFull(input.recordedCount, state.seats, state.funding)) {
      // Komplet zweryfikowanych wyplat domyka Aska tak jak trasa accept
      // (ostatnie miejsce) - to przejmuje role usunietego backfillResolvedAsks.
      state = { ...state, status: 'resolved', resolveKind: 'auto-full', resolvedAt: input.latestPayoutMs ?? input.nowMs };
      labels.push('auto_full');
    }
  }

  if (state.status === 'open') labels.push('open');
  return { ok: true, state, changed: true, labels, anomalies, fakeEscrow };
}

/**
 * Ask z WAZNYM stanem: status zmienia sie tylko na dowod - log zamkniecia
 * escrow z kluczem tego Aska albo komplet zapieczetowanych przyjec 'on-resolve'.
 */
export function advanceSealedAsk(input: AskStateInput): AskStatePlan {
  const sealed = input.sealed;
  if (!sealed) return { ok: false, code: 'state_missing', detail: 'advanceSealedAsk needs a valid state.' };
  const labels: string[] = ['sealed'];
  const anomalies: string[] = [];
  let state: SealedAskState = sealed;

  if (sealed.status === 'open') {
    if (sealed.funding === 'escrowed') {
      const escrow = input.escrow;
      if (escrow && escrow.funded) {
        if (escrow.closureConflict) anomalies.push('closure_conflict');
        if (escrow.closure && !escrow.closureConflict) {
          state = closeEscrow(state, escrow.closure);
          labels.push(escrow.closure.kind === 'resolved' ? 'escrow_resolved' : 'escrow_expired');
        } else if (!escrow.open) {
          anomalies.push('closed_on_chain_unrecorded');
        }
      }
    } else if (isAutoFull(input.recordedCount, sealed.seats, sealed.funding)) {
      state = { ...state, status: 'resolved', resolveKind: 'auto-full', resolvedAt: input.latestPayoutMs ?? input.nowMs };
      labels.push('auto_full');
    }
  }

  return {
    ok: true,
    state,
    changed: canonicalJson(state) !== canonicalJson(sealed),
    labels,
    anomalies,
    fakeEscrow: false,
  };
}

/** Jedno wejscie dla trasy: stan jest -> advanceSealedAsk, brak -> classifyLegacyAsk. */
export function planAskState(input: AskStateInput): AskStatePlan {
  return input.sealed ? advanceSealedAsk(input) : classifyLegacyAsk(input);
}

/* ------------------------------------------------------------------ */
/*  LUSTRA                                                             */
/* ------------------------------------------------------------------ */

/**
 * Zmiana lustra: `set` - wartosci, `remove` - pola do skasowania,
 * `stamp` - pola do serverTimestamp. `fields` = wszystkie zmieniane pola
 * (pusta lista = lustro juz zgodne, nic nie piszemy - stad idempotencja).
 */
export type MirrorPlan = {
  set: Record<string, unknown>;
  remove: string[];
  stamp: string[];
  fields: string[];
};

function finishPlan(plan: Omit<MirrorPlan, 'fields'>): MirrorPlan {
  return { ...plan, fields: [...Object.keys(plan.set), ...plan.remove, ...plan.stamp] };
}

const present = (value: unknown) => value !== undefined && value !== null;

function sameHash(value: unknown, expected: string): boolean {
  return lowerTxHash(value) === expected;
}

/**
 * Lustro asks/{id} zgodne ze stanem. `answers` = null, gdy liczby odpowiedzi
 * nie znamy na pewno (wtedy answerCount zostaje, jak jest).
 */
export function askMirrorPlan(
  state: SealedAskState,
  pub: Record<string, any>,
  counts: { accepted: number; answers: number | null }
): MirrorPlan {
  const set: Record<string, unknown> = {};
  const remove: string[] = [];
  const stamp: string[] = [];

  if (pub.status !== state.status) set.status = state.status;
  if (pub.acceptedCount !== counts.accepted) set.acceptedCount = counts.accepted;
  if (counts.answers !== null && pub.answerCount !== counts.answers) set.answerCount = counts.answers;
  if (pub.funding !== state.funding) set.funding = state.funding;
  if (pub.token !== 'USDC') set.token = 'USDC';
  if (pub.network !== 'base') set.network = 'base';

  if (state.resolvedAt !== null) {
    const shown = toMillis(pub.resolvedAt);
    if (!(shown > 0 && Math.abs(shown - state.resolvedAt) <= DISPLAY_TIME_SLACK_MS)) set.resolvedAt = state.resolvedAt;
  } else if (present(pub.resolvedAt)) {
    remove.push('resolvedAt');
  }

  if (state.escrow) {
    if (pub.escrowChainId !== state.escrow.chainId) set.escrowChainId = state.escrow.chainId;
    const fundTx = state.escrow.fundTxHash;
    if (fundTx) {
      if (!sameHash(pub.escrowTxHash, fundTx)) set.escrowTxHash = fundTx;
    } else if (present(pub.escrowTxHash)) {
      // Hash z dokumentu nie przeszedl weryfikacji logiem AskFunded - smiec.
      remove.push('escrowTxHash');
    }
  } else {
    if (present(pub.escrowTxHash)) remove.push('escrowTxHash');
    if (present(pub.escrowChainId)) remove.push('escrowChainId');
  }

  const resolveTx = state.resolveKind === 'escrow' ? state.resolveTxHash : null;
  if (resolveTx) {
    if (!sameHash(pub.escrowResolveTxHash, resolveTx)) set.escrowResolveTxHash = resolveTx;
  } else if (present(pub.escrowResolveTxHash)) {
    remove.push('escrowResolveTxHash');
  }

  const expiredTx = state.status === 'expired' ? state.expiredTxHash : null;
  if (expiredTx) {
    if (!sameHash(pub.expiredTxHash, expiredTx)) set.expiredTxHash = expiredTx;
    if (!present(pub.expiredAt)) stamp.push('expiredAt');
  } else {
    if (present(pub.expiredTxHash)) remove.push('expiredTxHash');
    if (present(pub.expiredAt)) remove.push('expiredAt');
  }

  return finishPlan({ set, remove, stamp });
}

/** Jednostki USDC -> kwota do wyswietlania. */
function unitsToUsdc(units: string): number {
  return Number(BigInt(units)) / 1_000_000;
}

/**
 * Lustro odpowiedzi z rekordem przyjecia. payoutAmount poprawiamy tylko,
 * gdy go nie ma albo jest WIEKSZY niz faktyczny log (zawyzony przychod na
 * /money); mniejsza wartosc (trasa accept zapisuje stawke) zostaje.
 */
export function answerAcceptedMirrorPlan(raw: Record<string, any>, record: AcceptanceRecord): MirrorPlan {
  const set: Record<string, unknown> = {};
  const stamp: string[] = [];
  if (raw.accepted !== true) set.accepted = true;
  if (!sameHash(raw.payoutTxHash, record.txHash)) set.payoutTxHash = record.txHash;
  if (raw.payoutLogIndex !== record.logIndex) set.payoutLogIndex = record.logIndex;
  if (raw.payoutToken !== 'USDC') set.payoutToken = 'USDC';
  if (raw.payoutNetwork !== 'base') set.payoutNetwork = 'base';
  const amount = unitsToUsdc(record.units);
  const shown = raw.payoutAmount;
  if (!(typeof shown === 'number' && Number.isFinite(shown) && shown > 0 && shown <= amount + 1e-9)) {
    set.payoutAmount = amount;
  }
  if (!present(raw.acceptedAt)) stamp.push('acceptedAt');
  return finishPlan({ set, remove: [], stamp });
}

const PAYOUT_MIRROR_FIELDS = ['payoutLogIndex', 'payoutAmount', 'payoutToken', 'payoutNetwork', 'acceptedAt'] as const;

/** Wyczyszczenie podrobionego przyjecia (tylko z resetForged). */
export function answerResetMirrorPlan(raw: Record<string, any>): MirrorPlan {
  const set: Record<string, unknown> = {};
  const remove: string[] = [];
  if (raw.accepted !== false) set.accepted = false;
  if (raw.payoutTxHash !== null) set.payoutTxHash = null;
  for (const field of PAYOUT_MIRROR_FIELDS) if (raw[field] !== undefined) remove.push(field);
  return finishPlan({ set, remove, stamp: [] });
}

/* ------------------------------------------------------------------ */
/*  ODCISKI - czy dane nie zmienily sie miedzy odczytem a zapisem      */
/* ------------------------------------------------------------------ */

/**
 * Trasa zbiera dowody POZA transakcja (RPC), a zapisuje W transakcji. Zanim
 * zapisze, porownuje odciski tego, na czym oparla plan - kazda roznica
 * (nowa odpowiedz, trasa accept w miedzyczasie, zmiana lustra) przerywa
 * zapis tego Aska z 'changed_during_run'; kolejny przebieg zacznie od nowa.
 */
export function stateFingerprint(raw: Record<string, unknown> | null | undefined): string {
  if (!raw) return 'absent';
  // Kazdy legalny zapis stanu zmienia mac; przegladarka tu nie pisze.
  return JSON.stringify([raw.mac ?? null, raw.kid ?? null]);
}

const PUB_FIELDS = [
  'author',
  'budget',
  'seats',
  'funding',
  'status',
  'answerCount',
  'acceptedCount',
  'token',
  'network',
  'escrowTxHash',
  'escrowChainId',
  'escrowResolveTxHash',
  'expiredTxHash',
] as const;

export function pubFingerprint(raw: Record<string, any> | null | undefined): string {
  if (!raw) return 'absent';
  return JSON.stringify([
    ...PUB_FIELDS.map((field) => (raw[field] === undefined ? '__undefined' : raw[field])),
    toMillis(raw.deadline),
    toMillis(raw.resolvedAt),
    toMillis(raw.expiredAt),
  ]);
}

export function answerRowsFingerprint(rows: ReadonlyArray<{ id: string; raw: Record<string, any> }>): string {
  return JSON.stringify(
    [...rows]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(({ id, raw }) => [
        id,
        raw.author ?? null,
        raw.accepted ?? null,
        raw.payoutTxHash ?? null,
        raw.payoutLogIndex ?? null,
        raw.payoutAmount ?? null,
        raw.payoutToken ?? null,
        raw.payoutNetwork ?? null,
        present(raw.acceptedAt),
      ])
  );
}

function checkFingerprint<T>(check: SealCheck<T> | undefined): unknown {
  if (!check || check.kind === 'absent') return 'absent';
  if (check.kind === 'invalid') return ['invalid', check.reason];
  return ['valid', canonicalJson(check.value), check.kid];
}

export function acceptancesFingerprint(all: ReadonlyMap<string, SealCheck<AcceptanceRecord>>): string {
  return JSON.stringify([...all.keys()].sort().map((id) => [id, checkFingerprint(all.get(id))]));
}

export function registryFingerprint(check: SealCheck<PayoutRegistryEntry> | undefined): string {
  return JSON.stringify(checkFingerprint(check));
}

/* ------------------------------------------------------------------ */
/*  POMOCNICZE                                                         */
/* ------------------------------------------------------------------ */

/**
 * Hashe, w ktorych szukamy zamkniecia escrow (AskResolved/AskExpired z
 * kluczem Aska). Zrodla w kolejnosci z planu: zamrozone payoutTxHash
 * przyjetych odpowiedzi, escrowResolveTxHash, expiredTxHash, decyzja
 * wlasciciela. Zadne z nich nie jest zaufane - kazdy hash trasa sprawdza
 * logiem z kluczem Aska, wiec podrobiony po prostu nic nie znajdzie.
 */
export function closureHashCandidates(
  rows: ReadonlyArray<{ raw: Record<string, any> }>,
  pub: Record<string, any> | null,
  ownerHash: string | undefined
): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    const hash = lowerTxHash(value);
    if (hash && !out.includes(hash)) out.push(hash);
  };
  for (const row of rows) if (row.raw.accepted === true) add(row.raw.payoutTxHash);
  add(pub?.escrowResolveTxHash);
  add(pub?.expiredTxHash);
  add(ownerHash);
  return out;
}

/** Adres autora z dokumentu (pole zamrozone regulami) albo null. */
export function pubAuthor(pub: Record<string, any> | null | undefined): string | null {
  return lowerAddress(pub?.author);
}
