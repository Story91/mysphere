import 'server-only';
import type { CollectionReference, DocumentReference, Transaction } from 'firebase-admin/firestore';
import {
  ASKS_COLLECTION,
  ASK_ANSWERS_COLLECTION,
  AskError,
  acceptancesCol,
  askBundleFromSnapshots,
  askRef,
  answerRef,
  answerRowFromSnapshot,
  createPayoutEntry,
  isDocId,
  legacyContext,
  mirrorAsk,
  payoutRef,
  putAcceptance,
  putState,
  readAcceptances,
  stateRef,
  verifyLegacyAcceptance,
  type AnswerRow,
  type AskMirrorPatch,
  type AskStore,
  type LegacyAcceptanceContext,
  type LegacyVerdict,
  type SealedEscrow,
} from '../../asks/askStore';
import {
  proveLegacyEscrow,
  readEscrowOnchain,
  readEscrowReceipt,
  type LegacyEscrowProof,
  type ReceiptProof,
} from '../../asks/escrowProof';
import {
  lowerAddress,
  lowerTxHash,
  payoutEntryFor,
  railOf,
  readRegistry,
  readSealedState,
  registryDoc,
  unsealedAskBornAfterCutoff,
  type PayoutRegistryEntry,
  type SealCheck,
} from '../../../utils/asks/askSealCore';
import { escrowKeyFor } from '../../../utils/asks/escrow';
import { findAskExpired, findAskResolved, type EscrowOnchain } from '../../../utils/asks/escrowProofCore';
import {
  acceptancesFingerprint,
  answerAcceptedMirrorPlan,
  answerResetMirrorPlan,
  answerRowsFingerprint,
  askMirrorPlan,
  closureHashCandidates,
  planAcceptances,
  planAskState,
  pubAuthor,
  pubFingerprint,
  registryFingerprint,
  registryIdsToRead,
  stateFingerprint,
  type AcceptancePlan,
  type AnswerAcceptanceInput,
  type EscrowClosure,
  type EscrowEvidence,
  type MirrorPlan,
  type ResealRequest,
} from '../../../utils/asks/resealCore';

/**
 * SILNIK RESEALU - zbiera dowody (RPC, poza transakcja) i zapisuje wynik
 * (jedna transakcja na Aska). Decyzje podejmuje czysty
 * app/utils/asks/resealCore.ts; tu jest tylko I/O.
 *
 * Osobny plik obok route.ts, bo plik trasy Nexta moze eksportowac wylacznie
 * handlery i konfiguracje - a ten kod chcemy uruchomic w mochy na atrapie
 * Firestore (test/asksReseal.test.ts) z podstawionym lancuchem (ResealDeps).
 *
 * KOLEJNOSC NA JEDNEGO ASKA
 *   1. odczyt: dokument + stan, rekordy przyjec, WSZYSTKIE odpowiedzi
 *      (zapytanie bez orderBy - odpowiedz bez createdAt tez sie liczy),
 *   2. dowody: escrowFor / logi zamkniecia escrow / verifyLegacyAcceptance
 *      dla kazdego 'accepted' bez rekordu / wpisy rejestru wyplat,
 *   3. plan: planAcceptances + planAskState + lustra (czyste funkcje),
 *   4. zapis (tylko apply): transakcja czyta wszystko jeszcze raz, porownuje
 *      odciski i dopiero wtedy pisze. Rozjazd -> 'changed_during_run', nic
 *      nie zapisane, kolejny przebieg zacznie od nowa.
 */

/** Twardy limit odpowiedzi na Aska w resealu. Wiecej = anomalia, Ask pominiety. */
const ANSWER_SCAN_LIMIT = 200;

/* ------------------------------------------------------------------ */
/*  ZALEZNOSCI (podmieniane w testach)                                 */
/* ------------------------------------------------------------------ */

export type ListedAsk = {
  id: string;
  /** Referencja z listingu - jedyna droga do Aska z id spoza isDocId. */
  ref: DocumentReference;
  data: Record<string, any>;
  createTimeMs: number | null;
};

export type ResealDeps = {
  listPage(store: AskStore, cursor: string | null, limit: number): Promise<ListedAsk[]>;
  verifyAcceptance(ctx: LegacyAcceptanceContext, row: AnswerRow): Promise<LegacyVerdict>;
  /** RZUCA przy awarii RPC. */
  proveEscrow(pub: Record<string, any>, author: string, askId: string): Promise<LegacyEscrowProof>;
  /** RZUCA przy awarii RPC. */
  readOnchain(author: string, askId: string): Promise<EscrowOnchain>;
  readReceipt(txHash: string): Promise<ReceiptProof>;
  now(): number;
  /** Po tylu ms od startu nie zaczynamy kolejnego Aska (maxDuration trasy). */
  timeBudgetMs: number;
};

export function defaultResealDeps(timeBudgetMs: number): ResealDeps {
  return {
    async listPage(store, cursor, limit) {
      const { FieldPath } = await import('firebase-admin/firestore');
      let query = store.db.collection(ASKS_COLLECTION).orderBy(FieldPath.documentId()).limit(limit);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      return snap.docs.map((doc) => ({
        id: doc.id,
        ref: doc.ref,
        data: (doc.data() ?? {}) as Record<string, any>,
        createTimeMs: doc.createTime ? doc.createTime.toMillis() : null,
      }));
    },
    verifyAcceptance: verifyLegacyAcceptance,
    proveEscrow: proveLegacyEscrow,
    readOnchain: readEscrowOnchain,
    readReceipt: readEscrowReceipt,
    now: () => Date.now(),
    timeBudgetMs,
  };
}

/* ------------------------------------------------------------------ */
/*  RAPORT                                                             */
/* ------------------------------------------------------------------ */

export type AskOutcome =
  | 'sealed'
  | 'updated'
  | 'unchanged'
  | 'needs_decision'
  | 'skipped'
  | 'deleted'
  | 'invalid_id'
  | 'error';

export type ResealReport = {
  dryRun: boolean;
  processed: number;
  /** Podaj jako `cursor` w nastepnym zadaniu; null = koniec kolekcji. */
  nextCursor: string | null;
  /** Aski, ktorym zapisujemy (albo zapisalibysmy) stan. */
  sealed: Array<{
    askId: string;
    mode: 'adopt' | 'repair' | 'sealed';
    status: string;
    funding: string;
    resolveKind: string | null;
    origin: string;
    escrowSource: string | null;
    labels: string[];
    written: boolean;
  }>;
  /** Przyjecia do zapieczetowania (z rejestrem wyplat). */
  acceptances: Array<{
    askId: string;
    answerId: string;
    kind: string;
    txHash: string;
    logIndex: number;
    units: string;
    registry: 'create' | 'keep' | 'overwrite';
    written: boolean;
  }>;
  /** Odpowiedzi czekajace na decyzje wlasciciela; Ask zostaje bez zmian. */
  needsDecision: Array<{
    askId: string;
    answerId: string;
    verdict: 'weak' | 'forged';
    reason: string;
    payee: string | null;
    txHash: string | null;
    answerCreateTime: string | null;
    candidates: Array<{ from: string; logIndex: number; units: string }>;
    hint: string;
  }>;
  resets: Array<{ askId: string; answerId: string; written: boolean }>;
  mirrorRepairs: Array<{
    askId: string;
    fields: string[];
    answers: Array<{ answerId: string; fields: string[] }>;
    written: boolean;
  }>;
  deleted: Array<{ askId: string; written: boolean }>;
  anomalies: Array<{ askId: string; code: string; detail?: string }>;
  notes: Array<{ askId: string; answerId: string; code: string }>;
  /** Jeden wiersz na Aska z tej strony - do przegladu (spoofy widac po createTime). */
  asks: Array<{
    askId: string;
    createTime: string | null;
    author: string | null;
    funding: string | null;
    pubStatus: string | null;
    seal: 'valid' | 'absent' | 'invalid' | 'n/a';
    answers: number | null;
    recorded: number | null;
    outcome: AskOutcome;
  }>;
};

function emptyReport(dryRun: boolean): ResealReport {
  return {
    dryRun,
    processed: 0,
    nextCursor: null,
    sealed: [],
    acceptances: [],
    needsDecision: [],
    resets: [],
    mirrorRepairs: [],
    deleted: [],
    anomalies: [],
    notes: [],
    asks: [],
  };
}

const iso = (ms: number | null | undefined) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null);

/** Przerywa zapis Aska - dane zmienily sie miedzy odczytem a transakcja. */
function changed(what: string): AskError {
  return new AskError('changed_during_run', 409, `The ${what} changed while the reseal was running. Run it again.`);
}

/** Awaria RPC przy zbieraniu dowodow - Ask pomijamy (zamknieto). */
class ChainUnavailable extends Error {}

/* ------------------------------------------------------------------ */
/*  ODCZYTY POMOCNICZE                                                 */
/* ------------------------------------------------------------------ */

/**
 * Wszystkie odpowiedzi Aska. BEZ orderBy: Firestore pomija w sortowaniu
 * dokumenty bez pola createdAt, a reseal musi widziec kazda odpowiedz
 * (i kazde 'accepted'). Kolejnosc ustalamy w pamieci po createTime serwera.
 */
async function readAllAnswerRows(
  store: AskStore,
  askId: string,
  tx?: Transaction
): Promise<{ rows: AnswerRow[]; truncated: boolean }> {
  const query = store.db.collection(ASK_ANSWERS_COLLECTION).where('askId', '==', askId).limit(ANSWER_SCAN_LIMIT + 1);
  const snap = tx ? await tx.get(query) : await query.get();
  const rows: AnswerRow[] = snap.docs.map(answerRowFromSnapshot);
  rows.sort((a, b) => a.createTimeMs - b.createTimeMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { rows: rows.slice(0, ANSWER_SCAN_LIMIT), truncated: rows.length > ANSWER_SCAN_LIMIT };
}

const UNKNOWN_KID = 'unknown_kid_needs_matching_key';
const UNKNOWN_KID_DETAIL =
  'A seal on this Ask was made with a key this deployment does not have (unknown_kid). It is not damaged: run the reseal from a deployment with the same ASK_SEAL_SECRET or the same service account instead of repairing it.';

/** Zamkniecie escrow (AskResolved/AskExpired z kluczem Aska) w podanych hashach. */
async function detectClosure(
  deps: ResealDeps,
  escrow: SealedEscrow,
  author: string,
  askId: string,
  hashes: readonly string[]
): Promise<{ closure: EscrowClosure | null; conflict: boolean }> {
  const target = { contract: escrow.contract, key: escrowKeyFor(author, askId) };
  const found = new Map<string, EscrowClosure>();
  for (const hash of hashes) {
    const receipt = await deps.readReceipt(hash);
    if (!receipt.ok) {
      // "Nie wiem" to nie "nie ma" - bez tego chwilowa awaria RPC
      // zapieczetowalaby rozstrzygnietego Aska jako otwartego.
      if (receipt.code === 'rpc_error') throw new ChainUnavailable(`receipt ${hash}: ${receipt.error}`);
      continue;
    }
    const resolved = findAskResolved(receipt.logs, target);
    if (resolved) {
      found.set(`r:${receipt.txHash}:${resolved.logIndex}`, {
        kind: 'resolved',
        txHash: receipt.txHash,
        logIndex: resolved.logIndex,
        blockTimeSec: receipt.blockTimeSec,
      });
    }
    const expired = findAskExpired(receipt.logs, target);
    if (expired) {
      found.set(`e:${receipt.txHash}:${expired.logIndex}`, { kind: 'expired', txHash: receipt.txHash, logIndex: expired.logIndex });
    }
  }
  if (found.size === 0) return { closure: null, conflict: false };
  if (found.size > 1) return { closure: null, conflict: true };
  return { closure: [...found.values()][0], conflict: false };
}

/* ------------------------------------------------------------------ */
/*  ZAPISY POMOCNICZE                                                  */
/* ------------------------------------------------------------------ */

function toFirestorePatch(store: AskStore, plan: MirrorPlan): Record<string, unknown> {
  const out: Record<string, unknown> = { ...plan.set };
  for (const field of plan.remove) out[field] = store.FieldValue.delete();
  for (const field of plan.stamp) out[field] = store.FieldValue.serverTimestamp();
  return out;
}

/* ------------------------------------------------------------------ */
/*  PRZEBIEG                                                           */
/* ------------------------------------------------------------------ */

export async function runReseal(store: AskStore, request: ResealRequest, deps: ResealDeps): Promise<ResealReport> {
  const report = emptyReport(!request.apply);
  const started = deps.now();
  const page = await deps.listPage(store, request.cursor, request.limit);

  // Logi wyplat zajete przez wczesniejsze Aski TEGO przebiegu. W suchym biegu
  // nic nie trafia do rejestru, a bez tego dwa Aski z tym samym przelewem
  // wyszlyby w raporcie jako oba do zapieczetowania - apply odmowilby drugiemu.
  const claims: RunClaims = new Map();
  let lastProcessed: string | null = null;
  let stoppedEarly = false;
  for (const listed of page) {
    if (report.processed > 0 && deps.now() - started > deps.timeBudgetMs) {
      stoppedEarly = true;
      break;
    }
    try {
      await processAsk(store, request, deps, report, listed, claims);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[admin/asks-reseal] Ask ${listed.id} przerwany bledem:`, error);
      report.anomalies.push({ askId: listed.id, code: 'error', detail });
      upsertAskRow(report, listed, { outcome: 'error' });
    }
    report.processed += 1;
    lastProcessed = listed.id;
  }

  report.nextCursor = stoppedEarly || page.length === request.limit ? lastProcessed : null;
  return report;
}

type AskRowPatch = Partial<ResealReport['asks'][number]>;

/** regId -> wpis rejestru zaplanowany (sucho) albo zapisany w tym przebiegu. */
type RunClaims = Map<string, PayoutRegistryEntry>;

function upsertAskRow(report: ResealReport, listed: ListedAsk, patch: AskRowPatch) {
  let row = report.asks.find((entry) => entry.askId === listed.id);
  if (!row) {
    row = {
      askId: listed.id,
      createTime: iso(listed.createTimeMs),
      author: typeof listed.data.author === 'string' ? listed.data.author : null,
      funding: typeof listed.data.funding === 'string' ? listed.data.funding : null,
      pubStatus: typeof listed.data.status === 'string' ? listed.data.status : null,
      seal: 'n/a',
      answers: null,
      recorded: null,
      outcome: 'unchanged',
    };
    report.asks.push(row);
  }
  Object.assign(row, patch);
}

async function processAsk(
  store: AskStore,
  request: ResealRequest,
  deps: ResealDeps,
  report: ResealReport,
  listed: ListedAsk,
  claims: RunClaims
): Promise<void> {
  const { decisions } = request;
  upsertAskRow(report, listed, {});

  // Id spoza isDocId (tylko z bezposredniego zapisu przegladarki): zadna
  // trasa go nie obsluzy (400), wiec jedyne, co wolno, to skasowac.
  if (!isDocId(listed.id)) {
    report.anomalies.push({ askId: listed.id, code: 'invalid_id', detail: 'Routes refuse this id (400). It can only be deleted.' });
    if (decisions.deleteUnverified.has(listed.id)) {
      await deleteUnverifiedAsk(store, request, deps, report, listed, {
        askDoc: listed.ref,
        stateDoc: listed.ref.collection('sealed').doc('state'),
        acceptances: listed.ref.collection('acceptances'),
        answerers: listed.ref.collection('answerers'),
      });
    } else {
      upsertAskRow(report, listed, { outcome: 'invalid_id' });
    }
    return;
  }

  const askId = listed.id;

  if (decisions.deleteUnverified.has(askId)) {
    await deleteUnverifiedAsk(store, request, deps, report, listed, {
      askDoc: askRef(store, askId),
      stateDoc: stateRef(store, askId),
      acceptances: acceptancesCol(store, askId),
      answerers: askRef(store, askId).collection('answerers'),
    });
    return;
  }

  // Stan czytamy sami (nie przez readAskBundle), bo odcisk do transakcji
  // musi pochodzic z TEGO odczytu, na ktorym opieramy plan.
  const [askSnap, stateSnap] = await store.db.getAll(askRef(store, askId), stateRef(store, askId));
  const bundle = askBundleFromSnapshots(store, askId, askSnap, stateSnap);
  const rawStateDoc = stateSnap.exists ? ((stateSnap.data() ?? {}) as Record<string, unknown>) : null;
  const acc = await readAcceptances(store, askId);
  const { rows, truncated } = await readAllAnswerRows(store, askId);
  const skip = (code: string, detail?: string) => {
    report.anomalies.push({ askId, code, ...(detail ? { detail } : {}) });
    upsertAskRow(report, listed, { outcome: 'skipped' });
  };

  upsertAskRow(report, listed, {
    seal: bundle.stateCheck.kind,
    answers: rows.length,
    createTime: iso(bundle.createTimeMs ?? listed.createTimeMs),
  });

  if (!bundle.exists || !bundle.view) return skip('vanished', 'The Ask disappeared between listing and reading.');
  if (truncated) return skip('answers_truncated', `More than ${ANSWER_SCAN_LIMIT} answers; review this Ask by hand.`);

  let mode: 'adopt' | 'repair' | 'sealed';
  if (bundle.stateCheck.kind === 'valid') {
    mode = 'sealed';
    if (decisions.repairInvalid.has(askId)) report.notes.push({ askId, answerId: '', code: 'repair_not_needed' });
  } else if (bundle.stateCheck.kind === 'invalid') {
    if (!decisions.repairInvalid.has(askId)) {
      return skip(
        'state_invalid',
        `Sealed state fails verification (${bundle.stateCheck.reason}). Routes answer 503. Add the id to repairInvalid to re-derive it from the chain.`
      );
    }
    if (bundle.stateCheck.reason === 'unknown_kid') return skip(UNKNOWN_KID, UNKNOWN_KID_DETAIL);
    mode = 'repair';
  } else {
    // Dokument bez stanu z po granicy: stary kod (okno przed wdrozeniem) albo
    // devtools. Adopcja nadalaby mu prawdziwa pieczec, wiec tylko z jawnej
    // decyzji wlasciciela po sprawdzeniu autora i tresci.
    const createdMs = bundle.createTimeMs ?? listed.createTimeMs;
    if (unsealedAskBornAfterCutoff(createdMs, store.legacyCutoffMs) && !decisions.adoptAfterCutoff.has(askId)) {
      return skip(
        'created_after_cutoff',
        'Unsealed Ask created after the legacy cutoff. Only the old client code (before this deploy) or a devtools write could create it. Check the author by hand, then put the id in adoptAfterCutoff to adopt it or in deleteUnverified to remove it.'
      );
    }
    mode = 'adopt';
  }
  const repair = mode === 'repair';
  // Naprawa przepisuje pieczecie kluczem TEGO wdrozenia. 'unknown_kid' to nie
  // uszkodzenie, tylko pieczec klucza, ktorego ten build nie zna (np. produkcja
  // z ASK_SEAL_SECRET, a reseal z builda na kluczu konta serwisowego) -
  // przepisanie zgubiloby prawdziwe rozstrzygniecie. Naprawiamy tylko
  // bad_mac / malformed / wrong_binding.
  if (repair && [...acc.all.values()].some((check) => check.kind === 'invalid' && check.reason === 'unknown_kid')) {
    return skip(UNKNOWN_KID, UNKNOWN_KID_DETAIL);
  }

  if (acc.invalid.length > 0 && !repair) {
    return skip('acceptance_invalid', `Acceptance records fail verification: ${acc.invalid.join(', ')}. Add the Ask to repairInvalid.`);
  }
  const pub = bundle.pub;
  if (!pub) return skip('public_doc_missing', 'Sealed state without the public Ask document.');

  const rowIds = new Set(rows.map((row) => row.id));
  for (const id of acc.all.keys()) {
    if (!rowIds.has(id)) report.anomalies.push({ askId, code: 'record_without_answer', detail: id });
  }
  const answerRows = rows.filter((row) => {
    if (isDocId(row.id)) return true;
    report.anomalies.push({ askId, code: 'answer_invalid_id', detail: row.id });
    return false;
  });

  const sealed = mode === 'sealed' && bundle.stateCheck.kind === 'valid' ? bundle.stateCheck.value : null;
  if (decisions.resolveHashes.has(askId) && (sealed ? sealed.funding : pub.funding) !== 'escrowed') {
    report.notes.push({ askId, answerId: '', code: 'resolve_hash_ignored_not_escrowed' });
  }

  /* ---- 2. dowody ---- */
  let evidence: EscrowEvidence | null = null;
  let ctxEscrow: SealedEscrow | null = null;
  // Ask SOL (szyna ze STANU): bez starego swiata - zadnej weryfikacji USDC na
  // lancuchu, legacyContext (centy USDC) w ogole nie powstaje. planAcceptances
  // z rail 'sol-solana' raportuje lustro bez rekordu jako forged_on_sol_ask.
  const rail = railOf(sealed);
  let ctx: LegacyAcceptanceContext | null = null;
  const answers: AnswerAcceptanceInput[] = [];
  const registry = new Map<string, SealCheck<PayoutRegistryEntry>>();
  try {
    const hashes = () => closureHashCandidates(answerRows, pub, decisions.resolveHashes.get(askId));
    if (sealed) {
      if (sealed.funding === 'escrowed' && sealed.escrow) {
        ctxEscrow = sealed.escrow;
        if (sealed.status === 'open') {
          const onchain = await deps.readOnchain(sealed.author, askId);
          const found = onchain.open
            ? { closure: null, conflict: false }
            : await detectClosure(deps, sealed.escrow, sealed.author, askId, hashes());
          evidence = { funded: true, escrow: sealed.escrow, anomalies: [], open: onchain.open, closure: found.closure, closureConflict: found.conflict };
        }
      }
    } else if (pub.funding === 'escrowed') {
      const author = pubAuthor(pub);
      if (!author) return skip('ask_malformed', 'Escrowed Ask without a valid author address.');
      const proof = await deps.proveEscrow(pub, author, askId);
      if (!proof.funded) {
        evidence = { funded: false };
      } else {
        ctxEscrow = proof.escrow;
        const found = proof.onchain.open
          ? { closure: null, conflict: false }
          : await detectClosure(deps, proof.escrow, author, askId, hashes());
        evidence = {
          funded: true,
          escrow: proof.escrow,
          anomalies: proof.anomalies,
          open: proof.onchain.open,
          closure: found.closure,
          closureConflict: found.conflict,
        };
      }
    }

    if (rail !== 'sol-solana') {
      try {
        ctx = legacyContext(askId, bundle.view, ctxEscrow, store.legacyCutoffMs);
      } catch (error) {
        if (error instanceof AskError) return skip(error.code, error.message);
        throw error;
      }
    }

    for (const row of answerRows) {
      const check = acc.all.get(row.id);
      const record: AnswerAcceptanceInput['record'] =
        check?.kind === 'valid' ? 'valid' : check?.kind === 'invalid' ? 'invalid' : 'absent';
      const mirrorAccepted = row.raw.accepted === true;
      const verdict = ctx && record !== 'valid' && mirrorAccepted ? await deps.verifyAcceptance(ctx, row) : null;
      answers.push({
        answerId: row.id,
        record,
        mirrorAccepted,
        verdict,
        payee: lowerAddress(row.raw.author),
        txHash: lowerTxHash(row.raw.payoutTxHash),
      });
    }

    const regIds = registryIdsToRead(answers, rail);
    if (regIds.length > 0) {
      const snaps = await store.db.getAll(...regIds.map((id) => payoutRef(store, id)));
      snaps.forEach((snap, i) => {
        const check = readRegistry(store.keys, regIds[i], snap.exists ? (snap.data() as Record<string, unknown>) : null);
        const claimed = claims.get(regIds[i]);
        // Wpisu jeszcze nie ma, ale wczesniejszy Ask tego przebiegu go bierze:
        // dla planu to log zajety (planAcceptances patrzy na askId/answerId).
        registry.set(regIds[i], check.kind === 'absent' && claimed ? { kind: 'valid', value: claimed, kid: 'this-run' } : check);
      });
    }
  } catch (error) {
    // Kazda awaria przy zbieraniu dowodow konczy sie pominieciem Aska - bez
    // zapisu (zamknieto). escrowFor i paragon rzucaja przy awarii RPC zwyklym
    // Error, wiec nie da sie ich odroznic od innych bledow po typie.
    if (error instanceof ChainUnavailable) return skip('rpc_error', error.message);
    if (error instanceof AskError) return skip(error.code, error.message);
    console.error(`[admin/asks-reseal] Dowody dla Aska ${askId} niedostepne:`, error);
    return skip('evidence_unavailable', error instanceof Error ? error.message : String(error));
  }

  if (repair && [...registry.values()].some((check) => check.kind === 'invalid' && check.reason === 'unknown_kid')) {
    return skip(UNKNOWN_KID, UNKNOWN_KID_DETAIL);
  }

  /* ---- 3. plan ---- */
  // Autor: z kontekstu (USDC) albo ze stanu (SOL - kontekstu nie ma).
  const planAuthor = ctx?.author ?? sealed?.author ?? null;
  if (!planAuthor) return skip('ask_malformed', 'This Ask has no valid author address.');
  const plan: AcceptancePlan = planAcceptances({
    askId,
    author: planAuthor,
    answers,
    registry,
    trustWeak: decisions.trustWeak,
    resetForged: decisions.resetForged,
    repair,
    rail,
  });
  for (const note of plan.notes) report.notes.push({ askId, ...note });

  if (plan.unknown.length > 0) {
    return skip('rpc_error', `Could not verify payouts for: ${plan.unknown.map((u) => u.answerId).join(', ')}. Nothing written.`);
  }
  if (plan.blocked.length > 0) {
    return skip(
      'seal_invalid',
      plan.blocked.map((b) => `${b.answerId}:${b.code}${b.regId ? `(${b.regId})` : ''}`).join(', ')
    );
  }
  if (plan.undecided.length > 0) {
    const createTimes = new Map(answerRows.map((row) => [row.id, row.createTimeMs]));
    for (const entry of plan.undecided) {
      report.needsDecision.push({
        askId,
        ...entry,
        answerCreateTime: iso(createTimes.get(entry.answerId)),
        hint:
          entry.verdict === 'weak'
            ? 'Genuine payment? Put the answer id in trustWeak. Not a payment? Put it in resetForged.'
            : 'No payout proves this acceptance. Put the answer id in resetForged to clear it, after checking by hand.',
      });
    }
    upsertAskRow(report, listed, { outcome: 'needs_decision', recorded: acc.valid.size });
    return;
  }

  const recordedIds = new Set<string>(acc.valid.keys());
  for (const planned of plan.records) recordedIds.add(planned.answerId);
  const recordedCount = recordedIds.size;
  const payoutTimes = plan.records.map((r) => r.blockTimeSec).filter((t): t is number => typeof t === 'number');
  const latestPayoutMs = payoutTimes.length > 0 ? Math.max(...payoutTimes) * 1000 : null;

  const statePlan = planAskState({
    askId,
    pub,
    pubCreateTimeMs: bundle.createTimeMs,
    sealed,
    answerCount: rows.length,
    recordedCount,
    latestPayoutMs,
    escrow: evidence,
    nowMs: deps.now(),
  });
  if (!statePlan.ok) return skip(statePlan.code, statePlan.detail);
  for (const code of statePlan.anomalies) report.anomalies.push({ askId, code });

  const writeState = mode !== 'sealed' || statePlan.changed;
  const askMirror = askMirrorPlan(statePlan.state, pub, { accepted: recordedCount, answers: rows.length });

  const rowById = new Map(answerRows.map((row) => [row.id, row]));
  const answerMirrors: Array<{ answerId: string; plan: MirrorPlan }> = [];
  const newRecordIds = new Set(plan.records.map((r) => r.answerId));
  for (const [answerId, record] of acc.valid) {
    const row = rowById.get(answerId);
    if (!row || newRecordIds.has(answerId)) continue;
    const mirror = answerAcceptedMirrorPlan(row.raw, record);
    if (mirror.fields.length > 0) answerMirrors.push({ answerId, plan: mirror });
  }
  for (const planned of plan.records) {
    const row = rowById.get(planned.answerId);
    if (!row) continue;
    const mirror = answerAcceptedMirrorPlan(row.raw, planned.record);
    if (mirror.fields.length > 0) answerMirrors.push({ answerId: planned.answerId, plan: mirror });
  }
  for (const answerId of plan.resets) {
    const row = rowById.get(answerId);
    if (!row) continue;
    const mirror = answerResetMirrorPlan(row.raw);
    if (mirror.fields.length > 0) answerMirrors.push({ answerId, plan: mirror });
  }

  const nothingToWrite =
    !writeState && plan.records.length === 0 && plan.resets.length === 0 && askMirror.fields.length === 0 && answerMirrors.length === 0;
  if (nothingToWrite) {
    upsertAskRow(report, listed, { outcome: 'unchanged', recorded: recordedCount });
    return;
  }

  /* ---- 4. zapis (tylko apply) ---- */
  let written = false;
  if (request.apply) {
    const fingerprints = {
      pub: pubFingerprint(pub),
      state: stateFingerprint(rawStateDoc),
      acceptances: acceptancesFingerprint(acc.all),
      rows: answerRowsFingerprint(rows),
    };
    const regIds = plan.records.map((r) => r.regId);
    const regFingerprints = new Map(regIds.map((id) => [id, registryFingerprint(registry.get(id))]));

    try {
      await store.db.runTransaction(async (tx) => {
        const refs = [askRef(store, askId), stateRef(store, askId), ...regIds.map((id) => payoutRef(store, id))];
        const [askNow, stateNow, ...regSnaps] = await tx.getAll(...refs);
        const accNow = await readAcceptances(store, askId, tx);
        const rowsNow = await readAllAnswerRows(store, askId, tx);

        if (pubFingerprint(askNow.exists ? (askNow.data() as Record<string, any>) : null) !== fingerprints.pub) throw changed('Ask document');
        if (stateFingerprint(stateNow.exists ? (stateNow.data() as Record<string, unknown>) : null) !== fingerprints.state) {
          throw changed('sealed state');
        }
        if (acceptancesFingerprint(accNow.all) !== fingerprints.acceptances) throw changed('acceptance records');
        if (rowsNow.truncated || answerRowsFingerprint(rowsNow.rows) !== fingerprints.rows) throw changed('answers');
        regSnaps.forEach((snap, i) => {
          const check = readRegistry(store.keys, regIds[i], snap.exists ? (snap.data() as Record<string, unknown>) : null);
          if (registryFingerprint(check) !== regFingerprints.get(regIds[i])) throw changed('payout registry');
        });

        for (const planned of plan.records) {
          const entry = payoutEntryFor(planned.record);
          if (planned.registry === 'create') {
            createPayoutEntry(tx, store, entry);
          } else if (planned.registry === 'overwrite') {
            // Tylko repairInvalid: niewazny wpis zastepujemy dowodem z lancucha.
            tx.set(payoutRef(store, planned.regId), {
              ...registryDoc(store.key, entry),
              recordedAt: store.FieldValue.serverTimestamp(),
            });
          }
          putAcceptance(tx, store, planned.record);
        }
        for (const mirror of answerMirrors) {
          tx.set(answerRef(store, mirror.answerId), toFirestorePatch(store, mirror.plan), { merge: true });
        }
        if (writeState) putState(tx, store, statePlan.state);
        if (askMirror.fields.length > 0) {
          mirrorAsk(tx, store, askId, toFirestorePatch(store, askMirror) as AskMirrorPatch, statePlan.state);
        }
      });
      written = true;
    } catch (error) {
      if (error instanceof AskError) return skip(error.code, error.message);
      // Np. przegrany wyscig tx.create wpisu rejestru z trasa accept: commit
      // sie wywraca, nic nie jest zapisane, kolejny przebieg zacznie od nowa.
      console.error(`[admin/asks-reseal] Zapis Aska ${askId} nie powiodl sie:`, error);
      return skip('write_failed', error instanceof Error ? error.message : String(error));
    }
  }

  // Tylko przyjecia, ktore naprawde poszly (apply) albo poszlyby (suchy bieg).
  for (const planned of plan.records) claims.set(planned.regId, payoutEntryFor(planned.record));

  /* ---- raport ---- */
  if (writeState) {
    report.sealed.push({
      askId,
      mode,
      status: statePlan.state.status,
      funding: statePlan.state.funding,
      resolveKind: statePlan.state.resolveKind,
      origin: statePlan.state.origin,
      escrowSource: statePlan.state.escrow?.source ?? null,
      labels: statePlan.labels,
      written,
    });
  }
  for (const planned of plan.records) {
    report.acceptances.push({
      askId,
      answerId: planned.answerId,
      kind: planned.record.kind,
      txHash: planned.record.txHash,
      logIndex: planned.record.logIndex,
      units: planned.record.units,
      registry: planned.registry,
      written,
    });
  }
  for (const answerId of plan.resets) report.resets.push({ askId, answerId, written });
  const mirroredAnswers = answerMirrors.map((m) => ({ answerId: m.answerId, fields: m.plan.fields }));
  if (askMirror.fields.length > 0 || mirroredAnswers.length > 0) {
    report.mirrorRepairs.push({ askId, fields: askMirror.fields, answers: mirroredAnswers, written });
  }
  upsertAskRow(report, listed, { outcome: writeState ? 'sealed' : 'updated', recorded: recordedCount });
  if (written) {
    console.info(
      `[admin/asks-reseal] Zapisano Aska ${askId}: stan=${writeState ? statePlan.state.status : 'bez zmian'}, ` +
        `przyjecia=${plan.records.length}, resety=${plan.resets.length}, lustro=${askMirror.fields.join('|') || '-'}`
    );
  }
}

/* ------------------------------------------------------------------ */
/*  KASOWANIE SPOOFOW (deleteUnverified)                               */
/* ------------------------------------------------------------------ */

type DeleteTargets = {
  askDoc: DocumentReference;
  stateDoc: DocumentReference;
  acceptances: CollectionReference;
  answerers: CollectionReference;
};

/**
 * Kasuje Aska wylacznie, gdy nie ma stanu, odpowiedzi, rekordow przyjec ani
 * depozytu escrow (escrowFor.funded). Kazdy z tych warunkow sprawdzamy
 * jeszcze raz w transakcji; kasujemy tez osierocone straznikow odpowiedzi.
 */
async function deleteUnverifiedAsk(
  store: AskStore,
  request: ResealRequest,
  deps: ResealDeps,
  report: ResealReport,
  listed: ListedAsk,
  targets: DeleteTargets
): Promise<void> {
  const askId = listed.id;
  const refuse = (code: string, detail: string) => {
    report.anomalies.push({ askId, code, detail });
    upsertAskRow(report, listed, { outcome: 'skipped' });
  };
  const answersQuery = () => store.db.collection(ASK_ANSWERS_COLLECTION).where('askId', '==', askId).limit(1);

  const [askSnap, stateSnap] = await store.db.getAll(targets.askDoc, targets.stateDoc);
  if (!askSnap.exists) return refuse('delete_refused', 'The Ask document no longer exists.');
  const seal = stateSnap.exists
    ? readSealedState(store.keys, askId, (stateSnap.data() ?? {}) as Record<string, unknown>).kind
    : 'absent';
  upsertAskRow(report, listed, { seal });
  if (stateSnap.exists) return refuse('delete_refused', 'The Ask has a sealed state; only unsealed Asks can be deleted.');
  if (!(await answersQuery().get()).empty) return refuse('delete_refused', 'The Ask has answers.');
  if (!(await targets.acceptances.limit(1).get()).empty) return refuse('delete_refused', 'The Ask has acceptance records.');

  const pub = (askSnap.data() ?? {}) as Record<string, any>;
  const author = pubAuthor(pub);
  if (!author && pub.funding === 'escrowed') {
    // Bez adresu autora nie przeczytamy escrowFor, wiec nie wykluczymy depozytu.
    // "Nie wiem" przy kasowaniu znaczy "nie kasuje".
    return refuse('delete_refused', 'Escrowed Ask without a valid author address; escrowFor cannot be checked.');
  }
  if (author) {
    // Depozyt pod kluczem (autor, askId) zostalby bez dokumentu, a autor bez
    // drogi do zwrotu przez aplikacje - takiego Aska nie kasujemy nigdy.
    let onchain: EscrowOnchain;
    try {
      onchain = await deps.readOnchain(author, askId);
    } catch (error) {
      return refuse('rpc_error', `escrowFor unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (onchain.funded) return refuse('delete_refused', 'escrowFor shows a deposit for this Ask.');
  }

  let written = false;
  if (request.apply) {
    const fingerprint = pubFingerprint(pub);
    try {
      await store.db.runTransaction(async (tx) => {
        const [askNow, stateNow] = await tx.getAll(targets.askDoc, targets.stateDoc);
        const answersNow = await tx.get(answersQuery());
        const acceptancesNow = await tx.get(targets.acceptances);
        const guards = await tx.get(targets.answerers);
        if (!askNow.exists || pubFingerprint(askNow.data() as Record<string, any>) !== fingerprint) throw changed('Ask document');
        if (stateNow.exists) throw changed('sealed state');
        if (!answersNow.empty) throw changed('answers');
        if (!acceptancesNow.empty) throw changed('acceptance records');
        for (const guard of guards.docs) tx.delete(guard.ref);
        tx.delete(targets.askDoc);
      });
      written = true;
    } catch (error) {
      if (error instanceof AskError) return refuse(error.code, error.message);
      console.error(`[admin/asks-reseal] Kasowanie Aska ${askId} nie powiodlo sie:`, error);
      return refuse('write_failed', error instanceof Error ? error.message : String(error));
    }
    console.info(`[admin/asks-reseal] Skasowano niezweryfikowanego Aska ${askId}.`);
  }
  report.deleted.push({ askId, written });
  upsertAskRow(report, listed, { outcome: 'deleted', answers: 0 });
}
