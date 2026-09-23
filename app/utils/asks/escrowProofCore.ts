import { parseEventLogs, type Log } from 'viem';
import { toMillis } from '../firestoreTime';
import { ASK_ESCROW_ABI, perAnswerToUnits } from './escrow';
import type { SealedEscrow } from './askSealCore';
import { ASK_DURATIONS, MIN_PER_ANSWER, perAnswerFor } from './types';

/**
 * DOWODY Z KONTRAKTU ESCROW - czyste funkcje nad logami paragonu.
 *
 * Bez RPC i bez 'server-only': paragon pobiera app/api/asks/escrowProof.ts,
 * a tutaj tylko go czytamy, zeby mocha mogla to sprawdzic na logach
 * zakodowanych viem-em.
 *
 * KAZDA funkcja NAJPIERW odsiewa logi po adresie kontraktu. Bez tego
 * dowolny kontrakt moglby wyemitowac zdarzenie o tym samym ksztalcie
 * (ten sam topic0) i "udowodnic" finansowanie albo wyplate.
 */

/** Minimalny ksztalt logu z paragonu viem. */
export type EscrowLogLike = {
  address: string;
  topics: readonly string[];
  data: string;
  logIndex: number | bigint | null;
};

type Target = { contract: string; key: string };

function fromContract(logs: readonly EscrowLogLike[], contract: string): Log[] {
  const wanted = contract.toLowerCase();
  return logs
    .filter((log) => typeof log.address === 'string' && log.address.toLowerCase() === wanted)
    .map((log) => ({ ...log, logIndex: log.logIndex === null ? null : Number(log.logIndex) })) as unknown as Log[];
}

function logIndexOf(log: { logIndex: number | null }): number | null {
  return typeof log.logIndex === 'number' && Number.isSafeInteger(log.logIndex) && log.logIndex >= 0
    ? log.logIndex
    : null;
}

/* ------------------------------------------------------------------ */
/*  AskFunded                                                          */
/* ------------------------------------------------------------------ */

export type FundedEvent = {
  logIndex: number;
  key: string;
  author: string;
  askId: string;
  perAnswer: bigint;
  seats: number;
  deadline: bigint;
};

/**
 * JEDEN log AskFunded z tego kontraktu, z tym kluczem, autorem i askId.
 * null = brak, 'ambiguous' = wiecej niz jeden (kontrakt na to nie pozwala,
 * wiec to znaczy, ze cos jest nie tak i nie wolno zgadywac).
 */
export function findAskFunded(
  logs: readonly EscrowLogLike[],
  want: { contract: string; key: string; author: string; askIdBytes: string }
): FundedEvent | null | 'ambiguous' {
  const key = want.key.toLowerCase();
  const author = want.author.toLowerCase();
  const askId = want.askIdBytes.toLowerCase();
  const matches: FundedEvent[] = [];
  for (const event of parseEventLogs({ abi: ASK_ESCROW_ABI, eventName: 'AskFunded', logs: fromContract(logs, want.contract) })) {
    const logIndex = logIndexOf(event);
    if (logIndex === null) continue;
    if (event.args.key.toLowerCase() !== key) continue;
    if (event.args.author.toLowerCase() !== author) continue;
    if (event.args.askId.toLowerCase() !== askId) continue;
    matches.push({
      logIndex,
      key,
      author,
      askId,
      perAnswer: event.args.perAnswer,
      seats: Number(event.args.seats),
      deadline: event.args.deadline,
    });
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) return 'ambiguous';
  return matches[0];
}

/* ------------------------------------------------------------------ */
/*  SeatAwarded / AskResolved / AskExpired                             */
/* ------------------------------------------------------------------ */

export type SeatAward = {
  logIndex: number;
  recipient: string;
  answerRef: string;
  amount: bigint;
};

/** Wszystkie SeatAwarded tego Aska (klucz = keccak(author, askId)). Adresy malymi literami. */
export function findSeatAwards(logs: readonly EscrowLogLike[], want: Target): SeatAward[] {
  const key = want.key.toLowerCase();
  const out: SeatAward[] = [];
  for (const event of parseEventLogs({ abi: ASK_ESCROW_ABI, eventName: 'SeatAwarded', logs: fromContract(logs, want.contract) })) {
    const logIndex = logIndexOf(event);
    if (logIndex === null) continue;
    if (event.args.key.toLowerCase() !== key) continue;
    out.push({
      logIndex,
      recipient: event.args.recipient.toLowerCase(),
      answerRef: event.args.answerRef.toLowerCase(),
      amount: event.args.amount,
    });
  }
  return out.sort((a, b) => a.logIndex - b.logIndex);
}

export type ResolvedEvent = { logIndex: number; seatsAwarded: number; refundToAuthor: bigint };

export function findAskResolved(logs: readonly EscrowLogLike[], want: Target): ResolvedEvent | null {
  const key = want.key.toLowerCase();
  for (const event of parseEventLogs({ abi: ASK_ESCROW_ABI, eventName: 'AskResolved', logs: fromContract(logs, want.contract) })) {
    const logIndex = logIndexOf(event);
    if (logIndex === null) continue;
    if (event.args.key.toLowerCase() !== key) continue;
    return { logIndex, seatsAwarded: Number(event.args.seatsAwarded), refundToAuthor: event.args.refundToAuthor };
  }
  return null;
}

/**
 * Czy ta transakcja ZAMKNELA escrow tego Aska. To jest warunek zamkniecia
 * po stronie aplikacji - nie liczba dopasowanych SeatAwarded.
 */
export function hasAskResolved(logs: readonly EscrowLogLike[], want: Target): boolean {
  return findAskResolved(logs, want) !== null;
}

export type ExpiredEvent = { logIndex: number; author: string; refundToAuthor: bigint; fee: bigint };

/** Log AskExpired (settleExpired) tego Aska albo null. */
export function findAskExpired(logs: readonly EscrowLogLike[], want: Target): ExpiredEvent | null {
  const key = want.key.toLowerCase();
  for (const event of parseEventLogs({ abi: ASK_ESCROW_ABI, eventName: 'AskExpired', logs: fromContract(logs, want.contract) })) {
    const logIndex = logIndexOf(event);
    if (logIndex === null) continue;
    if (event.args.key.toLowerCase() !== key) continue;
    return {
      logIndex,
      author: event.args.author.toLowerCase(),
      refundToAuthor: event.args.refundToAuthor,
      fee: event.args.fee,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  FINANSOWANIE NOWEGO ASKA vs SZKIC                                  */
/* ------------------------------------------------------------------ */

/**
 * per_answer    - stawka na lancuchu != perAnswerFor(budget, seats) w jednostkach,
 * seats         - inna liczba miejsc,
 * deadline      - floor(deadlineMs/1000) != termin na lancuchu,
 * below_minimum - ponizej MIN_PER_ANSWER (kontrakt minimum nie ma, aplikacja ma),
 * too_long      - termin dalej niz najdluzszy ASK_DURATIONS + 1 h od bloku
 *                 (kontrakt pozwala na 30 dni, aplikacja na 7),
 * past          - termin nie pozniej niz blok.
 */
export type FundMismatch = 'per_answer' | 'seats' | 'deadline' | 'below_minimum' | 'too_long' | 'past';

const MIN_PER_ANSWER_UNITS = perAnswerToUnits(MIN_PER_ANSWER);
const MAX_DURATION_SEC = Math.max(...ASK_DURATIONS.map((duration) => duration.ms)) / 1000;
const DURATION_SLACK_SEC = 3600;

/**
 * Porownanie logu AskFunded ze szkicem, ktory przyslal klient. Warunki
 * escrow bierzemy z LOGU - szkic musi sie z nimi zgadzac co do jednostki,
 * inaczej karta obiecywalaby co innego niz pilnuje lancuch.
 */
export function checkFundedAgainstDraft(
  event: { perAnswer: bigint; seats: number; deadline: bigint },
  draft: { budget: number; seats: number; deadlineMs: number; blockTimeSec: number }
): FundMismatch[] {
  const out: FundMismatch[] = [];

  const perAnswer = perAnswerFor(draft.budget, draft.seats);
  if (!(perAnswer > 0) || perAnswerToUnits(perAnswer) !== event.perAnswer) out.push('per_answer');
  if (event.seats !== draft.seats) out.push('seats');
  if (!Number.isFinite(draft.deadlineMs) || BigInt(Math.floor(draft.deadlineMs / 1000)) !== event.deadline) {
    out.push('deadline');
  }
  if (event.perAnswer < MIN_PER_ANSWER_UNITS) out.push('below_minimum');

  const blockTime = BigInt(Math.floor(draft.blockTimeSec));
  if (event.deadline - blockTime > BigInt(MAX_DURATION_SEC + DURATION_SLACK_SEC)) out.push('too_long');
  if (event.deadline <= blockTime) out.push('past');

  return out;
}

/* ------------------------------------------------------------------ */
/*  ESCROW ASKA SPRZED PIECZECI - z escrowFor                          */
/* ------------------------------------------------------------------ */

/** Wynik escrowFor(author, askId) w jednostkach i sekundach. */
export type EscrowOnchain = {
  funded: boolean;
  open: boolean;
  perAnswerUnits: bigint;
  deadlineSec: bigint;
  seatsLeft: number;
};

export type LegacyEscrow = { escrow: SealedEscrow; anomalies: string[] };

/**
 * Warunki escrow starego Aska z LANCUCHA, nie z dokumentu.
 *
 * Obecna regula update NIE zamraza escrowTxHash ani escrowChainId, wiec
 * przegladarka moze je podmienic przed resealem. escrowFor(author, askId) nie
 * potrzebuje hasha: klucz wiaze autora (zamrozony regula) i keccak(docId),
 * a perAnswer zostaje po zamknieciu jako nagrobek. Stad:
 * - perAnswerUnits i deadlineSec z lancucha,
 * - seats z dokumentu (zamrozone; escrowFor po zamknieciu daje 0),
 * - fundTxHash tylko wtedy, gdy wolajacy ZWERYFIKOWAL go logiem AskFunded.
 * Rozjazdy dokumentu z lancuchem to anomalie do raportu, nie odmowa -
 * prawda o pieniadzach jest na lancuchu.
 *
 * null = escrowFor mowi, ze tego klucza nigdy nie sfinansowano.
 */
export function legacyEscrowFromChain(
  pub: Record<string, any>,
  onchain: EscrowOnchain,
  opts: { chainId: number; contract: string; verifiedFundTxHash: string | null }
): LegacyEscrow | null {
  if (!onchain.funded || onchain.perAnswerUnits <= 0n) return null;

  const anomalies: string[] = [];
  const budget = typeof pub.budget === 'number' ? pub.budget : Number(pub.budget);
  const seatsRaw = typeof pub.seats === 'number' ? pub.seats : Number(pub.seats);
  const seats = Number.isSafeInteger(seatsRaw) && seatsRaw >= 1 ? seatsRaw : 0;
  if (seats === 0) anomalies.push('seats_invalid');

  const docPerAnswer = seats > 0 ? perAnswerFor(budget, seats) : 0;
  if (!(docPerAnswer > 0) || perAnswerToUnits(docPerAnswer) !== onchain.perAnswerUnits) {
    anomalies.push('per_answer_mismatch');
  }
  const docDeadlineMs = toMillis(pub.deadline);
  if (docDeadlineMs <= 0 || BigInt(Math.floor(docDeadlineMs / 1000)) !== onchain.deadlineSec) {
    anomalies.push('deadline_mismatch');
  }
  if (onchain.open && seats > 0 && onchain.seatsLeft > seats) anomalies.push('seats_exceed_document');
  if (typeof pub.escrowTxHash === 'string' && pub.escrowTxHash !== '' && !opts.verifiedFundTxHash) {
    anomalies.push('fund_tx_unverified');
  }

  return {
    escrow: {
      chainId: opts.chainId,
      contract: opts.contract.toLowerCase(),
      fundTxHash: opts.verifiedFundTxHash ? opts.verifiedFundTxHash.toLowerCase() : null,
      perAnswerUnits: onchain.perAnswerUnits.toString(),
      seats: seats > 0 ? seats : Math.max(1, onchain.seatsLeft),
      deadlineSec: onchain.deadlineSec.toString(),
      source: 'escrowFor',
    },
    anomalies,
  };
}
