import { decideEscrowedCreate, isEscrowAskId } from '../../utils/asks/askCreateCore';
import {
  effectiveAsk,
  isDocId,
  lowerTxHash,
  type SealedAskState,
  type SealedEscrow,
} from '../../utils/asks/askSealCore';
import { ASK_DURATIONS, MAX_SEATS, MIN_PER_ANSWER, perAnswerFor } from '../../utils/asks/types';
import {
  ASK_ANSWERS_COLLECTION,
  AskError,
  readAskBundle,
  usableView,
  writeNewAsk,
  type AskStore,
  type AskView,
} from './askStore';
import { MAX_QUESTION_LENGTH } from './pricing';

/**
 * SZKIC NOWEGO ASKA - walidacja pol z ciala zadania i zapis zweryfikowanego
 * szkicu escrow.
 *
 * Walidacja wyciagnieta z handlePost (POST /api/asks, x402), bo te same zasady
 * obowiazuja teraz w dwoch trasach: x402 i POST /api/asks/create (sesja SIWE).
 * Dwie kopie walidacji to dwa rozne minima stawki - a to jest jedyne miejsce,
 * ktore pilnuje ich po stronie serwera. Komunikaty bledow zostaly slowo
 * w slowo takie jak w handlePost - agenci x402 moga je juz czytac. Doszly
 * tylko kody.
 *
 * commitEscrowedAsk (transakcja) siedzi tu, a nie w pliku trasy, bo plik
 * route.ts w Next nie moze eksportowac niczego poza handlerami - a to jest
 * kawalek, ktory MUSI miec test (test/asksCreate.test.ts, atrapa Firestore):
 * tu zapada decyzja, czy cudze id da sie przejac.
 */

export type AskDraftRefusal = {
  status: 400;
  body: { error: string; code: string } & Record<string, unknown>;
};

export type AskDraftCheck<T> = { ok: true; value: T } | { ok: false; refusal: AskDraftRefusal };

export type AskDraftFields = {
  question: string;
  budget: number;
  seats: number;
  /** perAnswerFor(budget, seats) - policzone RAZ tutaj. */
  perAnswer: number;
};

function refuse(code: string, error: string, extra: Record<string, unknown> = {}): { ok: false; refusal: AskDraftRefusal } {
  return { ok: false, refusal: { status: 400, body: { error, code, ...extra } } };
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

/**
 * Pytanie, budzet, miejsca i minimalna stawka. Termin sprawdza osobno
 * validateDurationMs (on-resolve) albo lancuch (escrow: termin z logu fund).
 */
export function validateAskDraft(body: Record<string, unknown>): AskDraftCheck<AskDraftFields> {
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return refuse('missing_question', 'Missing question');
  if (question.length > MAX_QUESTION_LENGTH) {
    return refuse('question_too_long', `Question is limited to ${MAX_QUESTION_LENGTH} characters`);
  }

  const budget = asNumber(body.budget);
  if (!Number.isFinite(budget) || budget <= 0) return refuse('invalid_budget', 'Invalid budget');

  const seats = asNumber(body.seats);
  if (!Number.isSafeInteger(seats) || seats < 1 || seats > MAX_SEATS) {
    return refuse('invalid_seats', `Seats must be a whole number between 1 and ${MAX_SEATS}`);
  }

  // Kwota ponizej progu jest gestem, nie zaplata - i to jest jedyne miejsce,
  // ktore moze tego pilnowac po stronie serwera.
  const perAnswer = perAnswerFor(budget, seats);
  if (perAnswer < MIN_PER_ANSWER) {
    return refuse(
      'per_answer_too_low',
      `Each seat must be worth at least ${MIN_PER_ANSWER} - this budget gives ${perAnswer} per answer`
    );
  }

  return { ok: true, value: { question, budget, seats, perAnswer } };
}

export const ALLOWED_DURATIONS: ReadonlySet<number> = new Set<number>(ASK_DURATIONS.map((duration) => duration.ms));

/**
 * Czas trwania z zamknietego zbioru, a nie dowolna liczba: termin krotszy niz
 * godzina nie daje szans na odpowiedz, a dowolnie dlugi zamraza `resolve rate`
 * autora.
 */
export function validateDurationMs(value: unknown): AskDraftCheck<number> {
  const durationMs = asNumber(value);
  if (!ALLOWED_DURATIONS.has(durationMs)) {
    return refuse('invalid_duration', 'Invalid duration', {
      allowed: ASK_DURATIONS.map((duration) => ({ label: duration.label, ms: duration.ms })),
    });
  }
  return { ok: true, value: durationMs };
}

export type EscrowDraftFields = {
  /** Id z newAskId - wybrane przez klienta PRZED transakcja fund. */
  askId: string;
  /** Hash fund, malymi literami. */
  fundTxHash: string;
  /** Termin, ktory klient podal kontraktowi (ms). Lancuch go potwierdza. */
  deadlineMs: number;
};

/**
 * Pola Aska z escrow. Tylko ksztalt - czy fund naprawde zablokowal te kwote
 * pod tym id z portfela z sesji, sprawdza verifyAskFunded, a czy id wolno
 * zajac - decideEscrowedCreate w transakcji.
 */
export function validateEscrowFields(body: Record<string, unknown>): AskDraftCheck<EscrowDraftFields> {
  // Id trafia do admin doc(): 'X/sealed/state' adresowaloby cudzy stan.
  // Dodatkowo tylko format newAskId - nic innego klient nie generuje.
  const askId = body.askId;
  if (!isDocId(askId) || !isEscrowAskId(askId)) return refuse('invalid_id', 'Invalid Ask id');

  const fundTxHash = lowerTxHash(body.fundTxHash);
  if (!fundTxHash) return refuse('invalid_fund_tx', 'Missing or invalid escrow deposit transaction hash');

  const deadlineMs = asNumber(body.deadlineMs);
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) return refuse('invalid_deadline', 'Invalid deadline');

  return { ok: true, value: { askId, fundTxHash, deadlineMs } };
}

/* ------------------------------------------------------------------ */
/*  ZAPIS ASKA Z ESCROW (po verifyAskFunded)                           */
/* ------------------------------------------------------------------ */

export type EscrowedCommitInput = {
  askId: string;
  /** Adres z sesji SIWE - autor Aska i nadawca fund. */
  session: string;
  draft: AskDraftFields;
  /** Warunki escrow z logu AskFunded (verifyAskFunded) - nigdy ze szkicu. */
  escrow: SealedEscrow;
  /** Termin z lancucha, w ms. */
  deadline: number;
};

export type EscrowedCommit =
  | { created: true; state: SealedAskState; ask: AskView }
  /** Ponowienie: ten sam autor i ten sam fund - Ask juz jest. */
  | { created: false; ask: AskView };

/**
 * Jedna transakcja: odczyt dokumentu, stanu i (limit 1) odpowiedzi, decyzja
 * decideEscrowedCreate, potem zapis dokumentu i pieczeci.
 *
 * WOLAJ DOPIERO PO verifyAskFunded dla (sesja, askId, fund) - ta funkcja nie
 * robi RPC i wierzy, ze `escrow` pochodzi z logu tej transakcji fund.
 * Odmowy rzuca jako AskError (ask_exists 409, seal_invalid 503) - nigdy nie
 * nadpisuje cudzego dokumentu ani zadnego stanu.
 */
export async function commitEscrowedAsk(store: AskStore, input: EscrowedCommitInput): Promise<EscrowedCommit> {
  const { askId, session, draft, escrow, deadline } = input;
  if (!escrow.fundTxHash) {
    // Log fund zawsze niesie hash; brak znaczy blad wolajacego, nie klienta.
    throw new AskError('seal_write_malformed', 500, 'An escrowed Ask must carry its verified deposit hash.');
  }
  const fundTxHash = escrow.fundTxHash;

  return store.db.runTransaction(async (tx): Promise<EscrowedCommit> => {
    // Wszystkie odczyty przed zapisami (wymog transakcji Firestore).
    const bundle = await readAskBundle(store, askId, tx);
    const answers = await tx.get(
      store.db.collection(ASK_ANSWERS_COLLECTION).where('askId', '==', askId).limit(1)
    );

    const decision = decideEscrowedCreate({
      pubExists: bundle.pub !== null,
      pubAuthor: bundle.pub?.author,
      stateCheck: bundle.stateCheck,
      hasAnswers: !answers.empty,
      session,
      fundTxHash,
    });

    if (decision.action === 'refuse') {
      throw new AskError(decision.code, decision.status, decision.error);
    }
    if (decision.action === 'existing') {
      return { created: false, ask: usableView(bundle) };
    }

    const state = writeNewAsk(
      tx,
      store,
      askId,
      {
        author: session,
        origin: 'session',
        question: draft.question,
        budget: draft.budget,
        seats: draft.seats,
        deadline,
        funding: 'escrowed',
        escrow,
      },
      // 'overwrite' tylko dla wlasnego pustego dokumentu autora bez stanu:
      // tx.set BEZ merge, wiec zadne pole starego dokumentu nie przetrwa.
      decision.action === 'create' ? 'create' : 'overwrite'
    );
    const ask = effectiveAsk(
      askId,
      { question: draft.question, createdAt: Date.now(), answerCount: 0, acceptedCount: 0 },
      { kind: 'valid', value: state, kid: store.key.kid },
      store.enforce
    );
    return { created: true, state, ask };
  });
}
