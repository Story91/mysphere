import 'server-only';
import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { getAdminDb } from '../../utils/auth/firebaseAdmin';
import {
  ASK_LEGACY_CUTOFF_MS,
  AskError,
  adoptLegacyState,
  answererDoc,
  effectiveAsk,
  isDocId,
  isPayoutRegistryId,
  legacyClaimAfterCutoff,
  lowerAddress,
  lowerTxHash,
  matchUsdcTransfers,
  newAskState,
  payoutEntryFor,
  payoutIsTimely,
  payoutRegistryId,
  readAcceptance,
  readSealedState,
  registryDoc,
  sealAcceptanceDoc,
  sealStateDoc,
  unsealedAskBornAfterCutoff,
  type AcceptanceRecord,
  type AnswererGuard,
  type AskOrigin,
  type AskSealKey,
  type AskSealKeys,
  type AskView,
  type PayoutRegistryEntry,
  type SealCheck,
  type SealedAskState,
  type SealedEscrow,
} from '../../utils/asks/askSealCore';
import { answerIdToBytes32, escrowKeyFor, perAnswerToUnits } from '../../utils/asks/escrow';
import { findSeatAwards, type SeatAward } from '../../utils/asks/escrowProofCore';
import { perAnswerFor, type AskFunding, type AskStatus } from '../../utils/asks/types';
import { usdcTransfersFromLogs, type UsdcTransferLog } from '../../utils/monetization/verifyPayment';
import { askSealKeys, sealsEnforced } from './askSeals';
import { readEscrowReceipt } from './escrowProof';

/**
 * ===========================================================================
 * MAGAZYN ASKOW PO STRONIE SERWERA (firebase-admin) - API DLA TRAS
 * ===========================================================================
 *
 * GDZIE LEZY PRAWDA. Kazda z tych sciezek jest DZIS zamknieta dla
 * przegladarki: 'asks' i 'askAnswerContent' sa w hasOwnRules, a
 * nierekursywny catch-all `{collection}/{docId}/{rest=**}` zwraca
 * !hasOwnRules(pierwszy segment). Admin SDK omija reguly, wiec ten sam kod
 * dziala przed i po wdrozeniu nowych regul.
 *
 *   stateRef(id)            asks/{id}/sealed/state           stan Aska (HMAC)
 *   acceptanceRef(id, ans)  asks/{id}/acceptances/{ans}      przyjecie (HMAC)
 *   answererRef(id, addr)   asks/{id}/answerers/{addrLower}  "juz odpowiedzial"
 *   payoutRef(regId)        askAnswerContent/_registry/payouts/{regId}
 *                                                            zuzyte wyplaty (HMAC)
 *
 * Dokument asks/{id} i pola askAnswers (accepted, payoutTxHash...) sa
 * wylacznie LUSTREM dla przegladarki. Rodzic '_registry' nigdy nie istnieje,
 * readAnswerContents czyta tylko po id odpowiedzi, a isDocId odrzuca '_',
 * wiec zadna trasa do rejestru nie trafi.
 *
 * ---------------------------------------------------------------------------
 * ZASADA (pilnowana w przegladzie kodu)
 * ---------------------------------------------------------------------------
 * Funkcja, ktora ZAPISUJE stateRef, acceptanceRef albo payoutRef, bierze dane
 * WYLACZNIE z:
 *   - waznych pieczeci ('valid'),
 *   - dowodow z lancucha pobranych w TYM zadaniu,
 *   - wynikow verifyLegacyAcceptance rownych 'transfer' albo 'escrow-seat',
 *   - pol zamrozonych regulami (author, budget, seats, deadline, funding)
 *     przy adopcji Aska bez stanu.
 * NIGDY z lustra: raw.accepted, acceptedCount, answerCount, status, token,
 * network, escrow*. Flaga ASK_SEALS_ENFORCED nie zmienia tej zasady - zmienia
 * tylko ODCZYT Askow bez stanu ('legacy' vs 'unverified').
 *
 * ---------------------------------------------------------------------------
 * API (wszystko synchroniczne w transakcji, chyba ze napisano async)
 * ---------------------------------------------------------------------------
 * openAskStore(): Promise<AskStore | null>
 *   null, gdy nie ma Firebase Admin albo klucza pieczeci. Trasa odpowiada
 *   wtedy 503 { code: 'store_unavailable' } - zamknieto, bez zapisu
 *   (withX402 rozlicza tylko przy statusie < 400).
 *
 * Referencje (rzucaja AskError('invalid_id', 400) przy zlym id):
 *   askRef(store, askId)                      asks/{askId}
 *   stateRef(store, askId)                    asks/{askId}/sealed/state
 *   acceptancesCol(store, askId)              asks/{askId}/acceptances
 *   acceptanceRef(store, askId, answerId)
 *   answererRef(store, askId, address)        (adres -> malymi literami)
 *   answerRef(store, answerId)                askAnswers/{answerId}
 *   contentRef(store, answerId)               askAnswerContent/{answerId}
 *   payoutRef(store, regId)                   regId = payoutRegistryId(...)
 *
 * Odczyty (tx opcjonalny - w transakcji podaj tx, wtedy czytamy z blokada):
 *   readAskBundle(store, askId, tx?): Promise<AskBundle>
 *     { askId, exists, pub, createTimeMs, stateCheck, state, view }
 *     exists = jest dokument albo stan (takze niewazny). view == null gdy
 *     !exists. view.trust: 'sealed' | 'broken' | 'legacy' | 'unverified'.
 *   usableView(bundle): AskView
 *     rzuca AskError('ask_not_found', 404) albo ('seal_invalid', 503).
 *   askBundleFromSnapshots(store, askId, askSnap, stateSnap): AskBundle
 *     dla wolajacych, ktorzy czytaja stan razem z innymi dokumentami.
 *   readAcceptances(store, askId, tx?): Promise<AcceptanceSet>
 *     { all: Map<answerId, SealCheck>, valid: Map<answerId, record>,
 *       invalid: answerId[] }. Niepuste `invalid` -> trasa odpowiada 503
 *     seal_invalid (ALARM jest juz w logu).
 *   readAnswerRows(store, askId, tx?): Promise<AnswerRow[]>
 *     askAnswers where askId == X orderBy createdAt asc limit 200;
 *     AnswerRow = { id, raw, createTimeMs, updateTimeMs } (oba nadaje serwer).
 *   readAnswerRow(store, answerId, tx?): Promise<AnswerRow | null>
 *
 * Dowody (async, POZA transakcja - RPC):
 *   legacyContext(askId, view, escrow, store.legacyCutoffMs): LegacyAcceptanceContext
 *     escrow: view.escrow dla stanu, dla Aska bez stanu z proveLegacyEscrow
 *     (escrowProof.ts). Rzuca AskError('invalid_per_answer', 409).
 *   verifyLegacyAcceptance(ctx, row): Promise<LegacyVerdict>
 *     'transfer'    - od autora, do odpowiadajacego, >= stawka, blok nie
 *                     starszy niz odpowiedz (kandydaci; log wybiera trasa
 *                     w transakcji przez pickTransfer + rejestr),
 *     'escrow-seat' - SeatAwarded(klucz Aska, answerRef, odbiorca, >= stawka),
 *     'weak'        - jest przelew >= stawka do odpowiadajacego, ale nie spelnia
 *                     powyzszego albo przyjecie samym lustrem powstalo po granicy
 *                     (ASK_LEGACY_CUTOFF_MS); NIGDY nie resetowac automatycznie,
 *     'forged'      - nie ma zadnej takiej wyplaty,
 *     'unknown'     - awaria RPC; trasa odpowiada 503 i nic nie zapisuje.
 *
 * Zapisy (w transakcji, po wszystkich odczytach):
 *   putState(tx, store, state)                tx.set stateRef (+ sealedAt)
 *   putAcceptance(tx, store, record)          tx.set acceptanceRef (+ recordedAt)
 *   createPayoutEntry(tx, store, entry)       tx.create payoutRef - wyscig
 *                                             konczy sie bledem commitu, nie
 *                                             nadpisaniem
 *   recordAcceptance(tx, store, record, payoutAmount, { createPayout })
 *                                             przyjecie + (opcjonalnie) wpis
 *                                             rejestru + lustro odpowiedzi
 *   mirrorAnswerAcceptance(tx, store, record, payoutAmount)
 *   mirrorAsk(tx, store, askId, patch)        tx.set(merge) lustra; zawsze
 *                                             naprawia token/network
 *   writeNewAsk(tx, store, askId, input, mode): SealedAskState
 *     mode 'create' - tx.create dokumentu (nowe id z serwera),
 *     mode 'overwrite' - tx.set bez merge (tylko po decyzji o utworzeniu
 *     w trasie escrowed create, np. wlasny pusty dokument autora).
 *   answererGuardDoc(store, guard)            dokument straznika do tx.create
 *   createSealedAsk(store, input): Promise<CreatedAsk>   async
 *     Ask 'on-resolve' z id nadanym przez serwer, publiczny dokument + stan
 *     w jednej transakcji. Zwraca { askId, state, ask: AskView }.
 *
 * Odpowiedzi: app/api/asks/answerStore.ts
 *   saveAnswer(store, { askId, author, content }): Promise<SaveAnswerResult>
 *     jedna transakcja: stan Aska + straznik + zapytanie o duplikat, potem
 *     straznik, tresc, metadane i licznik. { ok: true, answer } albo
 *     { ok: false, code, status } z kodami: invalid_id 400, invalid_author 400,
 *     ask_not_found 404, seal_invalid 503, ask_unverified 409, ask_closed 409,
 *     own_ask 403, already_answered 409, answer_write_failed 500.
 *
 * Czyste funkcje z app/utils/asks/askSealCore.ts, ktorych trasy tez uzywaja:
 *   isDocId, lowerAddress, lowerTxHash, adoptLegacyState, newAskState,
 *   transferAcceptance, escrowSeatAcceptance, weakAcceptance, payoutEntryFor,
 *   payoutRegistryId, readRegistry, matchUsdcTransfers, pickTransfer,
 *   payoutIsTimely, countTakenSeats, isAutoFull, AskError.
 *
 * Kody bledow (AskError.code -> status):
 *   invalid_id 400          zly identyfikator Aska/odpowiedzi
 *   invalid_ask 400         dane nowego Aska, ktorych nie wolno zapieczetowac
 *   ask_not_found 404       nie ma ani dokumentu, ani stanu
 *   seal_invalid 503        stan/przyjecie/wpis rejestru z niewazna pieczecia;
 *                           nigdy nie nadpisujemy tego automatycznie
 *   store_unavailable 503   openAskStore() == null (kod dla trasy)
 *   ask_malformed 409       stary dokument, z ktorego nie da sie zbudowac stanu
 *   escrow_unverified 409   'escrowed' bez depozytu w escrowFor
 *   invalid_per_answer 409  stawka Aska nie daje sie przeliczyc na jednostki
 *   seal_write_malformed 500  blad programisty: proba zapieczetowania smieci
 */

export const ASKS_COLLECTION = 'asks';
export const ASK_ANSWERS_COLLECTION = 'askAnswers';
export const ASK_ANSWER_CONTENT_COLLECTION = 'askAnswerContent';
/** Rodzic rejestru wyplat. Dokument o tym id NIE istnieje i nie ma istniec. */
export const PAYOUT_REGISTRY_PARENT = '_registry';

export { AskError, isDocId, adoptLegacyState };
export type { AcceptanceRecord, AskView, PayoutRegistryEntry, SealCheck, SealedAskState, SealedEscrow };

/* ------------------------------------------------------------------ */
/*  OTWARCIE MAGAZYNU                                                  */
/* ------------------------------------------------------------------ */

type FieldValueStatic = typeof import('firebase-admin/firestore').FieldValue;

export type AskStore = {
  db: Firestore;
  keys: AskSealKeys;
  /** Klucz, ktorym podpisujemy w tym zadaniu (= keys.current). */
  key: AskSealKey;
  /** ASK_SEALS_ENFORCED - wylacznie dla odczytu Askow bez stanu. */
  enforce: boolean;
  /**
   * Granica starego swiata (ASK_LEGACY_CUTOFF_MS w askSealCore.ts). Pole, nie
   * import w miejscu uzycia, zeby testy mogly ja przesunac bez zegara.
   */
  legacyCutoffMs: number;
  FieldValue: FieldValueStatic;
};

/**
 * Magazyn albo null. firebase-admin ladujemy leniwie jak w firebaseAdmin.ts:
 * awaria pakietu ma dawac 503 na trasach Askow, a nie wywracac modulu.
 */
export async function openAskStore(): Promise<AskStore | null> {
  const db = await getAdminDb();
  if (!db) return null;
  const keys = askSealKeys();
  if (!keys.current) return null;
  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    return { db, keys, key: keys.current, enforce: sealsEnforced(), legacyCutoffMs: ASK_LEGACY_CUTOFF_MS, FieldValue };
  } catch (error) {
    console.error('[asks/askStore] Nie udalo sie zaladowac firebase-admin/firestore:', error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  REFERENCJE                                                         */
/* ------------------------------------------------------------------ */

function requireDocId(id: string, what: string): string {
  if (!isDocId(id)) throw new AskError('invalid_id', 400, `Invalid ${what} id.`);
  return id;
}

export function askRef(store: AskStore, askId: string): DocumentReference {
  return store.db.collection(ASKS_COLLECTION).doc(requireDocId(askId, 'Ask'));
}

export function stateRef(store: AskStore, askId: string): DocumentReference {
  return askRef(store, askId).collection('sealed').doc('state');
}

export function acceptancesCol(store: AskStore, askId: string) {
  return askRef(store, askId).collection('acceptances');
}

export function acceptanceRef(store: AskStore, askId: string, answerId: string): DocumentReference {
  return acceptancesCol(store, askId).doc(requireDocId(answerId, 'answer'));
}

export function answererRef(store: AskStore, askId: string, address: string): DocumentReference {
  const lower = lowerAddress(address);
  if (!lower) throw new AskError('invalid_id', 400, 'Invalid answerer address.');
  return askRef(store, askId).collection('answerers').doc(lower);
}

export function answerRef(store: AskStore, answerId: string): DocumentReference {
  return store.db.collection(ASK_ANSWERS_COLLECTION).doc(requireDocId(answerId, 'answer'));
}

export function contentRef(store: AskStore, answerId: string): DocumentReference {
  return store.db.collection(ASK_ANSWER_CONTENT_COLLECTION).doc(requireDocId(answerId, 'answer'));
}

export function payoutRef(store: AskStore, regId: string): DocumentReference {
  if (!isPayoutRegistryId(regId)) throw new AskError('invalid_id', 400, 'Invalid payout registry id.');
  return store.db
    .collection(ASK_ANSWER_CONTENT_COLLECTION)
    .doc(PAYOUT_REGISTRY_PARENT)
    .collection('payouts')
    .doc(regId);
}

/* ------------------------------------------------------------------ */
/*  ODCZYT ASKA                                                        */
/* ------------------------------------------------------------------ */

export type AskBundle = {
  askId: string;
  /** Jest dokument publiczny albo stan (takze niewazny). */
  exists: boolean;
  pub: Record<string, any> | null;
  /** createTime dokumentu publicznego (nadany przez serwer Firestore). */
  createTimeMs: number | null;
  stateCheck: SealCheck<SealedAskState>;
  state: SealedAskState | null;
  view: AskView | null;
};

function snapshotTimeMs(snapshot: DocumentSnapshot): number | null {
  const time = snapshot.createTime;
  return time ? time.toMillis() : null;
}

/** Bundle z juz pobranych snapshotow (np. getAll razem z innymi dokumentami). */
export function askBundleFromSnapshots(
  store: AskStore,
  askId: string,
  askSnap: DocumentSnapshot,
  stateSnap: DocumentSnapshot
): AskBundle {
  const pub = askSnap.exists ? ((askSnap.data() ?? {}) as Record<string, any>) : null;
  const stateCheck = readSealedState(
    store.keys,
    askId,
    stateSnap.exists ? ((stateSnap.data() ?? {}) as Record<string, unknown>) : null
  );
  if (stateCheck.kind === 'invalid') {
    console.error(
      `[asks/askStore] ALARM: stan Aska ${askId} ma niewazna pieczec (${stateCheck.reason}). ` +
        'Trasy odpowiadaja 503 i niczego nie nadpisuja - decyzja nalezy do wlasciciela (reseal repairInvalid).'
    );
  }
  const exists = pub !== null || stateCheck.kind !== 'absent';
  const createTimeMs = askSnap.exists ? snapshotTimeMs(askSnap) : null;
  // Dokument bez stanu zalozony po granicy nie pochodzi z tego kodu (ten
  // zaklada Aska zawsze razem ze stanem) - czytamy go jak przy wlaczonej
  // fladze, zeby spoof z devtools nie zbieral odpowiedzi pod cudzym autorem.
  const enforce =
    store.enforce ||
    (stateCheck.kind === 'absent' && pub !== null && unsealedAskBornAfterCutoff(createTimeMs, store.legacyCutoffMs));
  return {
    askId,
    exists,
    pub,
    createTimeMs,
    stateCheck,
    state: stateCheck.kind === 'valid' ? stateCheck.value : null,
    view: exists ? effectiveAsk(askId, pub, stateCheck, enforce) : null,
  };
}

/** Dokument publiczny i stan jednym getAll. Rzuca AskError('invalid_id'). */
export async function readAskBundle(store: AskStore, askId: string, tx?: Transaction): Promise<AskBundle> {
  const refs = [askRef(store, askId), stateRef(store, askId)] as const;
  const [askSnap, stateSnap] = tx ? await tx.getAll(...refs) : await store.db.getAll(...refs);
  return askBundleFromSnapshots(store, askId, askSnap, stateSnap);
}

/** Widok, na ktorym wolno podjac decyzje - albo blad do zmapowania na odpowiedz. */
export function usableView(bundle: AskBundle): AskView {
  if (!bundle.exists || !bundle.view) throw new AskError('ask_not_found', 404, 'Ask not found.');
  if (bundle.view.trust === 'broken') {
    throw new AskError('seal_invalid', 503, 'This Ask cannot be verified right now. Nothing was changed.');
  }
  return bundle.view;
}

/* ------------------------------------------------------------------ */
/*  ODCZYT PRZYJEC I ODPOWIEDZI                                        */
/* ------------------------------------------------------------------ */

export type AcceptanceSet = {
  all: Map<string, SealCheck<AcceptanceRecord>>;
  valid: Map<string, AcceptanceRecord>;
  /** Id odpowiedzi z niewazna pieczecia przyjecia. Niepuste -> 503. */
  invalid: string[];
};

/** Wszystkie przyjecia Aska (podkolekcja bez indeksu - Ask ma najwyzej 20 miejsc). */
export async function readAcceptances(store: AskStore, askId: string, tx?: Transaction): Promise<AcceptanceSet> {
  const col = acceptancesCol(store, askId);
  const snap = tx ? await tx.get(col) : await col.get();
  const all = new Map<string, SealCheck<AcceptanceRecord>>();
  const valid = new Map<string, AcceptanceRecord>();
  const invalid: string[] = [];
  for (const doc of snap.docs) {
    const check = readAcceptance(store.keys, askId, doc.id, doc.data() as Record<string, unknown>);
    all.set(doc.id, check);
    if (check.kind === 'valid') valid.set(doc.id, check.value);
    else if (check.kind === 'invalid') invalid.push(doc.id);
  }
  if (invalid.length > 0) {
    console.error(
      `[asks/askStore] ALARM: niewazne pieczecie przyjec w Asku ${askId}: ${invalid.join(', ')}. ` +
        'Trasy odpowiadaja 503 seal_invalid.'
    );
  }
  return { all, valid, invalid };
}

export type AnswerRow = {
  id: string;
  raw: Record<string, any>;
  /** createTime dokumentu odpowiedzi - nadany przez serwer, nie do podrobienia. */
  createTimeMs: number;
  /**
   * updateTime dokumentu odpowiedzi (tez nadaje Firestore). Stare przyjecie
   * zapisane w lustrze po granicy nie jest prawdziwe - patrz
   * legacyClaimAfterCutoff. Brak -> +Infinity (zamknieto).
   */
  updateTimeMs: number;
};

/** Wiersz odpowiedzi ze snapshotu - jedno miejsce na oba znaczniki czasu. */
export function answerRowFromSnapshot(snap: DocumentSnapshot): AnswerRow {
  return {
    id: snap.id,
    raw: (snap.data() ?? {}) as Record<string, any>,
    createTimeMs: snapshotTimeMs(snap) ?? 0,
    updateTimeMs: snap.updateTime ? snap.updateTime.toMillis() : Number.POSITIVE_INFINITY,
  };
}

/**
 * Odpowiedzi Aska przez admin SDK. Ten sam ksztalt zapytania co w kliencie
 * (askId == X, orderBy createdAt), wiec korzysta z juz wdrozonego indeksu.
 * limit 200 to bezpiecznik, nie regula (Ask ma najwyzej 20 miejsc).
 */
export async function readAnswerRows(store: AskStore, askId: string, tx?: Transaction): Promise<AnswerRow[]> {
  requireDocId(askId, 'Ask');
  const query = store.db
    .collection(ASK_ANSWERS_COLLECTION)
    .where('askId', '==', askId)
    .orderBy('createdAt', 'asc')
    .limit(200);
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.docs.map(answerRowFromSnapshot);
}

/** Jedna odpowiedz po kluczu. null = nie ma. */
export async function readAnswerRow(store: AskStore, answerId: string, tx?: Transaction): Promise<AnswerRow | null> {
  const ref = answerRef(store, answerId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) return null;
  return answerRowFromSnapshot(snap);
}

/* ------------------------------------------------------------------ */
/*  WERYFIKACJA STAREGO PRZYJECIA (POZA TRANSAKCJA)                    */
/* ------------------------------------------------------------------ */

export type LegacyAcceptanceContext = {
  askId: string;
  /** Autor Aska, malymi literami - ze stanu albo z zamrozonego pola. */
  author: string;
  /** Stawka w jednostkach: z escrow (lancuch), inaczej z perAnswerFor. */
  perAnswerUnits: bigint;
  escrow: SealedEscrow | null;
  /** AskStore.legacyCutoffMs - przyjecia samym lustrem po tej chwili sa 'weak'. */
  legacyCutoffMs: number;
};

/**
 * Kontekst weryfikacji dla Aska. `escrow` podaj z view.escrow (stan) albo
 * z proveLegacyEscrow (Ask bez stanu); dla 'on-resolve' - null.
 * `legacyCutoffMs` zawsze z AskStore (parametr wymagany, zeby zadne
 * wywolanie go nie zgubilo).
 */
export function legacyContext(
  askId: string,
  view: AskView,
  escrow: SealedEscrow | null,
  legacyCutoffMs: number
): LegacyAcceptanceContext {
  const author = lowerAddress(view.author);
  if (!author) throw new AskError('ask_malformed', 409, 'This Ask has no valid author address.');
  let perAnswerUnits: bigint;
  if (escrow) {
    perAnswerUnits = BigInt(escrow.perAnswerUnits);
  } else {
    const perAnswer = perAnswerFor(view.budget, view.seats);
    if (!(perAnswer > 0)) throw new AskError('invalid_per_answer', 409, 'This Ask has no payable amount per answer.');
    perAnswerUnits = perAnswerToUnits(perAnswer);
  }
  return { askId, author, perAnswerUnits, escrow, legacyCutoffMs };
}

export type LegacyVerdict =
  | {
      kind: 'transfer';
      txHash: string;
      payee: string;
      from: string;
      /** Pasujace logi, posortowane po logIndex. Log wybiera trasa (pickTransfer). */
      candidates: UsdcTransferLog[];
      blockNumber: bigint;
      blockTimeSec: number;
    }
  | {
      kind: 'escrow-seat';
      txHash: string;
      payee: string;
      contract: string;
      chainId: number;
      award: SeatAward;
      blockTimeSec: number;
    }
  | {
      kind: 'weak';
      txHash: string;
      payee: string;
      /** Przelewy >= stawka do odpowiadajacego, ktore NIE wiaza sie z autorem/czasem. */
      candidates: UsdcTransferLog[];
      /**
       * transfer_not_bound_to_author_or_time - przelew nie od autora albo sprzed
       * odpowiedzi; mirror_after_cutoff / payout_after_cutoff - przelew pasuje,
       * ale przyjecie samym lustrem powstalo po granicy (legacyClaimAfterCutoff).
       */
      reason: string;
    }
  | { kind: 'forged'; reason: string }
  | { kind: 'unknown'; reason: string };

/**
 * Czy stare `accepted: true` przy odpowiedzi ma pokrycie na lancuchu.
 * Wspolne dla accept, resolve i reseal. Robi RPC, wiec wolaj POZA transakcja,
 * a wynik zapisuj w transakcji dopiero, gdy jest 'transfer' albo 'escrow-seat'.
 *
 * Probujemy OBU dowodow niezaleznie od `funding`: Aski escrow bywaly
 * przyjmowane zwyklym przelewem przez stare /accept.
 */
export async function verifyLegacyAcceptance(ctx: LegacyAcceptanceContext, row: AnswerRow): Promise<LegacyVerdict> {
  const payee = lowerAddress(row.raw.author);
  if (!payee) return { kind: 'forged', reason: 'answer_author_invalid' };
  const txHash = lowerTxHash(row.raw.payoutTxHash);
  if (!txHash) return { kind: 'forged', reason: 'payout_hash_invalid' };

  const receipt = await readEscrowReceipt(txHash);
  if (!receipt.ok) {
    // Awaria RPC to "nie wiem" - zamknieto (503). Nieznana albo cofnieta
    // transakcja to brak wyplaty.
    if (receipt.code === 'rpc_error') return { kind: 'unknown', reason: 'rpc_error' };
    return { kind: 'forged', reason: receipt.code };
  }

  const transfers = usdcTransfersFromLogs(receipt.logs);
  const candidates = matchUsdcTransfers(transfers, {
    from: ctx.author,
    to: payee,
    minUnits: ctx.perAnswerUnits,
  });
  const bound = candidates.length > 0 && payoutIsTimely(receipt.blockTimeSec, row.createTimeMs);
  // Przelew autor -> odpowiadajacy NIE mowi, za ktora odpowiedz placono. Po
  // granicy samo lustro moglo przyjsc z devtools (przypiecie cudzej, swiezej
  // wyplaty do innej odpowiedzi tego odbiorcy), wiec taki przelew jest tylko
  // 'weak'. SeatAwarded nizej nazywa odpowiedz (answerRef) w transakcji
  // autora - ten dowod granicy nie potrzebuje.
  const late = bound ? legacyClaimAfterCutoff(row.updateTimeMs, receipt.blockTimeSec, ctx.legacyCutoffMs) : null;
  if (bound && !late) {
    return {
      kind: 'transfer',
      txHash,
      payee,
      from: ctx.author,
      candidates,
      blockNumber: receipt.blockNumber,
      blockTimeSec: receipt.blockTimeSec,
    };
  }

  if (ctx.escrow) {
    const ref = answerIdToBytes32(row.id).toLowerCase();
    const award = findSeatAwards(receipt.logs, {
      contract: ctx.escrow.contract,
      key: escrowKeyFor(ctx.author, ctx.askId),
    }).find((candidate) => candidate.answerRef === ref && candidate.recipient === payee && candidate.amount >= ctx.perAnswerUnits);
    if (award) {
      return {
        kind: 'escrow-seat',
        txHash,
        payee,
        contract: ctx.escrow.contract,
        chainId: ctx.escrow.chainId,
        award,
        blockTimeSec: receipt.blockTimeSec,
      };
    }
  }

  if (late) return { kind: 'weak', txHash, payee, candidates, reason: late };
  const weak = transfers.filter((t) => t.to === payee && t.value >= ctx.perAnswerUnits);
  if (weak.length > 0) return { kind: 'weak', txHash, payee, candidates: weak, reason: 'transfer_not_bound_to_author_or_time' };
  return { kind: 'forged', reason: 'no_matching_payment' };
}

/* ------------------------------------------------------------------ */
/*  ZAPISY W TRANSAKCJI                                                */
/* ------------------------------------------------------------------ */

/** Zapieczetowany stan. Kazde pole z dozwolonych zrodel - patrz ZASADA wyzej. */
export function putState(tx: Transaction, store: AskStore, state: SealedAskState): void {
  tx.set(stateRef(store, state.askId), {
    ...sealStateDoc(store.key, state),
    sealedAt: store.FieldValue.serverTimestamp(),
  });
}

/** Zapieczetowane przyjecie odpowiedzi. */
export function putAcceptance(tx: Transaction, store: AskStore, record: AcceptanceRecord): void {
  tx.set(acceptanceRef(store, record.askId, record.answerId), {
    ...sealAcceptanceDoc(store.key, record),
    recordedAt: store.FieldValue.serverTimestamp(),
  });
}

/**
 * Wpis w rejestrze zuzytych wyplat. tx.create, NIE set: gdy rownolegla
 * transakcja zdazyla zapisac ten sam log, commit tej sie wywraca, zamiast
 * nadpisac cudze przyjecie. Wolaj tylko, gdy odczyt w tej transakcji dal
 * 'absent'.
 */
export function createPayoutEntry(tx: Transaction, store: AskStore, entry: PayoutRegistryEntry): void {
  tx.create(payoutRef(store, payoutRegistryId(entry.chainId, entry.txHash, entry.logIndex)), {
    ...registryDoc(store.key, entry),
    recordedAt: store.FieldValue.serverTimestamp(),
  });
}

/**
 * Lustro przyjecia w askAnswers - dla przegladarki i statystyk. Nadpisuje
 * podrobione pola wyplaty (merge), ale samo w sobie niczego nie dowodzi.
 */
export function mirrorAnswerAcceptance(
  tx: Transaction,
  store: AskStore,
  record: AcceptanceRecord,
  payoutAmount: number
): void {
  tx.set(
    answerRef(store, record.answerId),
    {
      accepted: true,
      payoutTxHash: record.txHash,
      payoutLogIndex: record.logIndex,
      payoutAmount,
      payoutToken: 'USDC',
      payoutNetwork: 'base',
      acceptedAt: store.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Przyjecie w komplecie: rekord + (gdy `createPayout`) wpis rejestru + lustro.
 * `createPayout: false`, gdy odczyt rejestru w tej transakcji dal juz WAZNY
 * wpis dla tej samej odpowiedzi (ponowienie).
 */
export function recordAcceptance(
  tx: Transaction,
  store: AskStore,
  record: AcceptanceRecord,
  payoutAmount: number,
  opts: { createPayout: boolean }
): void {
  if (opts.createPayout) createPayoutEntry(tx, store, payoutEntryFor(record));
  putAcceptance(tx, store, record);
  mirrorAnswerAcceptance(tx, store, record, payoutAmount);
}

/** Pola lustra asks/{id}, ktore serwer wolno poprawiac. */
export type AskMirrorPatch = Partial<{
  status: AskStatus;
  resolvedAt: unknown;
  acceptedCount: number;
  answerCount: number;
  funding: AskFunding;
  escrowTxHash: unknown;
  escrowChainId: unknown;
  escrowResolveTxHash: unknown;
  expiredAt: unknown;
  expiredTxHash: unknown;
}>;

/**
 * Lustro dokumentu Aska dla przegladarki. Zawsze naprawia token/network
 * (przegladarka moze je dzis zmienic i zablokowac przyjecia). Wartosci
 * `unknown` pozwalaja podac FieldValue.delete()/serverTimestamp().
 * askRef waliduje id, wiec lustro nigdy nie trafi w cudza podsciezke.
 */
export function mirrorAsk(tx: Transaction, store: AskStore, askId: string, patch: AskMirrorPatch): void {
  // Firestore odrzuca `undefined` w zapisie - pomijamy takie pola, zamiast
  // wywracac cala transakcje (z przyjeciem i pieczecia) na lustrze.
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  tx.set(askRef(store, askId), { ...defined, token: 'USDC', network: 'base' }, { merge: true });
}

/* ------------------------------------------------------------------ */
/*  NOWY ASK                                                           */
/* ------------------------------------------------------------------ */

export type NewAskInput = {
  author: string;
  origin: AskOrigin;
  question: string;
  budget: number;
  seats: number;
  /** ms */
  deadline: number;
  funding: AskFunding;
  escrow: SealedEscrow | null;
};

/**
 * Publiczny dokument + stan nowego Aska w podanej transakcji.
 * Autor i warunki MUSZA pochodzic z sesji/platnosci i z dowodu z lancucha -
 * nigdy z ciala zadania. Zwraca zapisany stan.
 */
export function writeNewAsk(
  tx: Transaction,
  store: AskStore,
  askId: string,
  input: NewAskInput,
  mode: 'create' | 'overwrite'
): SealedAskState {
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  if (!question) throw new AskError('invalid_ask', 400, 'Missing question.');
  const state = newAskState(askId, {
    author: input.author,
    origin: input.origin,
    budget: input.budget,
    seats: input.seats,
    deadline: input.deadline,
    funding: input.funding,
    escrow: input.escrow,
  });

  const pub = {
    author: state.author,
    question,
    budget: state.budget,
    seats: state.seats,
    perAnswer: perAnswerFor(state.budget, state.seats),
    token: 'USDC',
    network: 'base',
    deadline: state.deadline,
    createdAt: store.FieldValue.serverTimestamp(),
    status: 'open',
    funding: state.funding,
    answerCount: 0,
    acceptedCount: 0,
    ...(state.escrow
      ? { escrowTxHash: state.escrow.fundTxHash, escrowChainId: state.escrow.chainId }
      : {}),
  };

  const ref = askRef(store, askId);
  if (mode === 'create') tx.create(ref, pub);
  else tx.set(ref, pub);
  putState(tx, store, state);
  return state;
}

export type CreatedAsk = { askId: string; state: SealedAskState; ask: AskView };

/**
 * Ask 'on-resolve' z identyfikatorem nadanym przez SERWER (x402 i sesja).
 * Escrow tu nie wchodzi: askId escrow musi byc znany przed transakcja fund,
 * wiec to sciezka z id od klienta i z decyzja o utworzeniu (trasa create).
 */
export async function createSealedAsk(
  store: AskStore,
  input: { author: string; origin: 'session' | 'x402'; question: string; budget: number; seats: number; deadline: number }
): Promise<CreatedAsk> {
  const askId = store.db.collection(ASKS_COLLECTION).doc().id;
  const state = await store.db.runTransaction(async (tx) =>
    writeNewAsk(tx, store, askId, { ...input, funding: 'on-resolve', escrow: null }, 'create')
  );
  const now = Date.now();
  const ask = effectiveAsk(
    askId,
    { question: input.question.trim(), createdAt: now, answerCount: 0, acceptedCount: 0 },
    { kind: 'valid', value: state, kid: store.key.kid },
    store.enforce
  );
  return { askId, state, ask };
}

/** Straznik "jedna odpowiedz na adres" - dokument do tx.create. */
export function answererGuardDoc(store: AskStore, guard: AnswererGuard) {
  return answererDoc(store.key, guard);
}
