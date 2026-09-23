import 'server-only';
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { getAddress } from 'viem';
import { SOLANA_CLUSTER, SOLANA_RPC_URL } from '../../basechat/Solana/config/solanaChain';
import { isSolanaSignature } from '../../basechat/Solana/replies/replyCore';
import {
  AskError,
  acceptancePayoutRef,
  countTakenSeats,
  isAutoFull,
  isDocId,
  isSolanaAcceptance,
  lowerAddress,
  payoutIsTimely,
  railOf,
  readAnyAcceptance,
  readAnyRegistry,
  readPayee,
  solanaPayoutRegistryId,
  solanaTransferAcceptance,
  type AnswerPayee,
  type AnyAcceptanceRecord,
  type SealedAskState,
  type SolanaAcceptanceRecord,
  type SolanaClusterName,
} from '../../utils/asks/askSealCore';
import { formatLamports, lamportsToSolNumber } from '../../utils/asks/solAmounts';
import { verifySolanaAskPayout, type SolanaAskPayoutReason, type SolanaPayoutTx } from '../../utils/asks/solanaAskCore';
import type { AskStatus } from '../../utils/asks/types';
import { fetchPlainTransaction } from '../../utils/solana/postReceipt';
import {
  acceptanceRef,
  answerRef,
  askBundleFromSnapshots,
  askRef,
  mirrorAsk,
  payeeRef,
  payoutRef,
  putState,
  readAcceptances,
  readAnswerRow,
  readAskBundle,
  recordAcceptance,
  stateRef,
  usableView,
  type AskStore,
} from './askStore';

/**
 * ===========================================================================
 * AKCEPTACJA ODPOWIEDZI NA ASKU SOL (model A: autor placi przy akceptacji)
 * ===========================================================================
 *
 * POST /api/asks/[id]/accept z `payoutSignature` trafia tutaj. Kolejnosc jak
 * na Base: NAJPIERW przelew z portfela autora, POTEM ta funkcja - platforma
 * niczego nie trzyma i niczego nie wyplaca, sprawdza tylko, ze autor zaplacil.
 *
 * Wyplata SOL jest wazna, gdy transakcja (commitment `confirmed`):
 *   - ma DOKLADNIE jedno memo `mysphere:ask|v1|<askId>|<answerId>` (Memo v2)
 *     z platnikiem autora jako kontem (Memo v2 wymaga jego podpisu),
 *   - przelewa SystemProgram.Transfer od platnika autora ZAMROZONEGO w stanie
 *     do odbiorcy ZAMROZONEGO dla tej odpowiedzi, lacznie >= stawka,
 *   - blok nie jest starszy niz odpowiedz (createTime dokumentu odpowiedzi),
 *   - podpis nie oplacil jeszcze niczego innego (rejestr `solana:<podpis>`,
 *     tx.create w tej samej transakcji co przyjecie).
 * Wszystko ze stanu i pieczeci - kwota, platnik i odbiorca nigdy z zadania.
 *
 * Ponowienie z tym samym podpisem jest idempotentne (200 alreadyRecorded,
 * bez drugiego powiadomienia), inny podpis dla przyjetej odpowiedzi -> 409.
 *
 * Kody (AskError): invalid_id 400, invalid_signature 400, ask_not_found 404,
 * seal_invalid 503, wrong_rail 409, not_ask_author 403, answer_not_found 404,
 * invalid_payee 409, already_accepted 409, ask_resolved 409, wrong_cluster 409,
 * payee_unbound 409, chain_unavailable 503, payout_unverified 409 (retryable),
 * payout_failed / payout_memo_missing / payout_memo_ambiguous /
 * payout_wrong_memo / payout_memo_unsigned / payout_no_transfer /
 * payout_wrong_sender / payout_wrong_recipient / payout_too_small /
 * payout_self_pay 409, payout_time_unknown 409 (retryable),
 * payout_predates_answer 409, payout_already_used 409, no_seats_left 409.
 * Awaria commitu -> accept_write_failed 500 (pieniadze juz poszly, ponow).
 */

/** Transakcja z lancucha dla weryfikacji: dane + czas bloku (s) albo null. */
export type FetchedSolanaTx = { tx: SolanaPayoutTx; blockTimeSec: number | null };

/**
 * Odczyt transakcji po podpisie. null = RPC jej (jeszcze) nie zna.
 * Rzucony blad = RPC niedostepne (-> 503 chain_unavailable).
 */
export type FetchSolanaTx = (signature: string) => Promise<FetchedSolanaTx | null>;

export type SolanaAcceptDeps = {
  fetchTx?: FetchSolanaTx;
  /** Klaster TEGO serwera (domyslnie SOLANA_CLUSTER z env). */
  cluster?: SolanaClusterName;
  now?: () => number;
  notify?: (params: {
    recipientId: string;
    askAuthorId: string;
    askId: string;
    answerId: string;
    amount: string;
    token: string;
    delivery: 'wallet';
    txHash: string;
  }) => Promise<void>;
};

export type SolanaAcceptBody = {
  askId: string;
  answerId: string;
  accepted: true;
  /** Podpis Solany (base58, wielkosc liter zachowana) - to samo co payoutSignature. */
  payoutTxHash: string;
  payoutSignature: string;
  payoutLogIndex: null;
  /** SOL do wyswietlania. Prawda: payoutLamports. */
  payoutAmount: number;
  payoutLamports: string;
  payoutToken: 'SOL';
  payoutNetwork: 'solana';
  solanaCluster: SolanaClusterName;
  verification: 'strict';
  acceptedCount: number;
  seats: number;
  status: AskStatus;
  alreadyRecorded?: true;
  autoResolved?: true;
};

export type SolanaAcceptResult = { status: 200; body: SolanaAcceptBody };

/** RPC serwera: SOLANA_RPC_URL (tylko serwer, np. Helius) albo publiczny z solanaChain. */
function serverRpcUrl(): string {
  return process.env.SOLANA_RPC_URL?.trim() || SOLANA_RPC_URL;
}

/**
 * Hash genezy kazdego klastra. SOLANA_RPC_URL (tylko serwer) jest niezalezny
 * od NEXT_PUBLIC_SOLANA_CLUSTER: RPC devnetu przy klastrze mainnet-beta
 * uznalby darmowy SOL z faucetu za prawdziwa wyplate. Klaster RPC sprawdzamy
 * wiec genezy, a nie wierzymy konfiguracji.
 */
const CLUSTER_GENESIS: Record<SolanaClusterName, string> = {
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
};

/** URL RPC -> hash genezy (raz na instancje; blad odczytu nie zostaje w pamieci). */
const genesisByUrl = new Map<string, Promise<string>>();

async function assertRpcCluster(
  connection: { getGenesisHash: () => Promise<string> },
  url: string,
  cluster: SolanaClusterName
): Promise<void> {
  let pending = genesisByUrl.get(url);
  if (!pending) {
    pending = connection.getGenesisHash();
    genesisByUrl.set(url, pending);
    pending.catch(() => genesisByUrl.delete(url));
  }
  const genesis = await pending;
  if (genesis !== CLUSTER_GENESIS[cluster]) {
    console.error(`[api/asks/accept/solana] ALARM: RPC serwera nie jest klastrem ${cluster} (geneza ${genesis}).`);
    // Rzucony blad = chain_unavailable (503): nic nie zapisujemy.
    throw new Error(`Solana RPC is not ${cluster}`);
  }
}

/**
 * Domyslny odczyt z lancucha. @solana/web3.js ladujemy dynamicznie, zeby
 * modul (i trasa accept dla USDC) nie ciagnal stacku Solany przy imporcie.
 */
export const defaultFetchSolanaTx: FetchSolanaTx = async (signature) => {
  const { Connection } = await import('@solana/web3.js');
  const url = serverRpcUrl();
  const connection = new Connection(url, 'confirmed');
  await assertRpcCluster(connection, url, SOLANA_CLUSTER);
  const fetched = await fetchPlainTransaction(connection, signature);
  if (!fetched) return null;
  return { tx: { ...fetched.plain, failed: fetched.failed }, blockTimeSec: fetched.blockTime };
};

async function defaultNotify(params: Parameters<NonNullable<SolanaAcceptDeps['notify']>>[0]): Promise<void> {
  // Dynamicznie: notifications.ts ciagnie kliencki SDK Firebase - nie przy
  // imporcie modulu, tylko gdy naprawde jest co ogloszic.
  const { notifyAskPayout } = await import('../../utils/friends/notifications');
  await notifyAskPayout(params);
}

/** Powod z verifySolanaAskPayout -> kod i zdanie dla czlowieka. */
const PAYOUT_REFUSALS: Record<SolanaAskPayoutReason, { code: string; error: string }> = {
  'failed-tx': { code: 'payout_failed', error: 'This transaction failed on Solana, so it paid nothing.' },
  'no-ask-memo': {
    code: 'payout_memo_missing',
    error: 'This transaction has no Ask payout memo. Pay from the Ask screen so the payout names the answer.',
  },
  'ambiguous-memo': {
    code: 'payout_memo_ambiguous',
    error: 'This transaction carries more than one Ask payout memo. One transaction can pay for one answer only.',
  },
  'wrong-memo': { code: 'payout_wrong_memo', error: 'This transaction pays for a different Ask or answer.' },
  'memo-not-signed': {
    code: 'payout_memo_unsigned',
    error: 'The payout memo was not signed by the wallet that pays for this Ask.',
  },
  'no-transfer': { code: 'payout_no_transfer', error: 'This transaction has no SOL transfer.' },
  'wrong-sender': {
    code: 'payout_wrong_sender',
    error: 'This transfer was not sent from the Solana wallet linked to this Ask. Pay from that wallet so the payout can be verified.',
  },
  'wrong-recipient': {
    code: 'payout_wrong_recipient',
    error: 'This transfer did not go to the payout address of this answer.',
  },
  'too-small': { code: 'payout_too_small', error: 'This transfer is smaller than what each answer on this Ask gets.' },
  'self-pay': { code: 'payout_self_pay', error: 'The Ask wallet cannot pay itself.' },
};

export async function acceptSolanaAnswer(
  store: AskStore,
  input: { askId: string; answerId: string; signature: string; viewer: string },
  deps: SolanaAcceptDeps = {}
): Promise<SolanaAcceptResult> {
  const { askId, answerId, signature } = input;
  const fetchTx = deps.fetchTx ?? defaultFetchSolanaTx;
  const serverCluster = deps.cluster ?? SOLANA_CLUSTER;
  const now = deps.now ?? Date.now;
  const notify = deps.notify ?? defaultNotify;

  if (!isDocId(askId) || !isDocId(answerId)) throw new AskError('invalid_id', 400, 'Invalid Ask or answer id.');
  // Podpis base58 64 bajty, bez trim-lowercase: 'a' i 'A' to rozne podpisy.
  if (!isSolanaSignature(signature)) {
    throw new AskError('invalid_signature', 400, 'A Solana payout transaction signature is required to accept an answer.');
  }
  const viewer = lowerAddress(input.viewer);
  if (!viewer) throw new AskError('session_required', 401, 'Sign in with your wallet to accept an answer.');

  /* ---------------- (1) Ask i szyna ---------------- */

  const bundle = await readAskBundle(store, askId);
  usableView(bundle); // 404 albo 503 seal_invalid
  const state = solState(bundle.state);
  if (state.author !== viewer) throw new AskError('not_ask_author', 403, 'Only the author of this Ask can accept an answer.');

  /* ---------------- (2) Odpowiedz ---------------- */

  const row = await readAnswerRow(store, answerId);
  if (!row || row.raw.askId !== askId) throw new AskError('answer_not_found', 404, 'Answer not found on this Ask');
  const answerer = lowerAddress(row.raw.author);
  if (!answerer || answerer === state.author) throw new AskError('invalid_payee', 409, 'This answer has no payable author.');

  /* ---------------- (3) Istniejacy rekord (ponowienie) ---------------- */

  // PRZED statusem: ostatnie miejsce zamyka Aska, a zgubiona odpowiedz
  // sieciowa ma dostac 200, nie "Ask juz rozstrzygniety".
  const ownSnap = await acceptanceRef(store, askId, answerId).get();
  const own = readAnyAcceptance(store.keys, askId, answerId, snapData(ownSnap));
  if (own.kind === 'invalid') throw sealInvalid();
  if (own.kind === 'valid') {
    const accepted = await readAcceptances(store, askId);
    if (accepted.invalid.length > 0) throw sealInvalid();
    return alreadyResponse(own.value, signature, {
      askId,
      answerId,
      cluster: state.solana.cluster,
      acceptedCount: accepted.valid.size,
      seats: state.seats,
      status: state.status,
    });
  }

  if (state.status === 'resolved') throw new AskError('ask_resolved', 409, 'This Ask is already resolved.');
  if (state.solana.cluster !== serverCluster) {
    throw new AskError(
      'wrong_cluster',
      409,
      `This Ask pays on Solana ${state.solana.cluster}, but this server reads ${serverCluster}. Nothing was recorded.`,
      { askCluster: state.solana.cluster, serverCluster }
    );
  }

  /* ---------------- (4) Odbiorca zamrozony dla tej odpowiedzi ---------------- */

  const payeeSnap = await payeeRef(store, askId, answerId).get();
  const payee = readPayee(store.keys, askId, answerId, snapData(payeeSnap));
  if (payee.kind === 'invalid') throw sealInvalid();
  if (payee.kind === 'absent') {
    throw new AskError(
      'payee_unbound',
      409,
      'The author of this answer has not linked a Solana wallet yet, so there is no address to pay. Nothing was recorded.'
    );
  }
  if (payee.value.answerer !== answerer) throw sealInvalid();

  /* ---------------- (5) Lancuch ---------------- */

  let fetched: FetchedSolanaTx | null;
  try {
    fetched = await fetchTx(signature);
  } catch (error) {
    console.error('[api/asks/accept/solana] Odczyt transakcji z RPC nie powiodl sie:', error);
    throw chainUnavailable();
  }
  if (!fetched) {
    // Swieza transakcja: RPC moze jej jeszcze nie widziec na `confirmed`.
    throw new AskError(
      'payout_unverified',
      409,
      'Solana has not confirmed this transaction to us yet. Retry with the same signature in a moment - you will not be charged again.',
      { retryable: true }
    );
  }

  const perAnswerLamports = BigInt(state.solana.perAnswerLamports);
  const check = verifySolanaAskPayout(fetched.tx, {
    askId,
    answerId,
    payer: state.solana.payer,
    payee: payee.value.payee,
    minLamports: perAnswerLamports,
  });
  if (!check.ok) {
    const refusal = PAYOUT_REFUSALS[check.reason];
    throw new AskError(refusal.code, 409, refusal.error, { reason: check.reason });
  }

  /* ---------------- (6) Czas ---------------- */

  if (fetched.blockTimeSec === null || !Number.isFinite(fetched.blockTimeSec)) {
    throw new AskError(
      'payout_time_unknown',
      409,
      'Solana did not report when this transaction happened yet. Retry with the same signature in a moment.',
      { retryable: true }
    );
  }
  if (!payoutIsTimely(fetched.blockTimeSec, row.createTimeMs)) {
    throw new AskError(
      'payout_predates_answer',
      409,
      'This transfer happened before the answer was written, so it cannot be the payout for it.'
    );
  }

  /* ---------------- (7) Transakcja ---------------- */

  const record = solanaTransferAcceptance({
    askId,
    answerId,
    payee: payee.value.payee,
    from: state.solana.payer,
    cluster: state.solana.cluster,
    signature,
    lamports: check.lamports,
  });

  let outcome: TxOutcome;
  try {
    outcome = await store.db.runTransaction((tx) =>
      acceptInTransaction(tx, store, { askId, answerId, author: state.author, answerer, payee: payee.value, record, now })
    );
  } catch (error) {
    if (error instanceof AskError) throw error;
    // Przegrany wyscig tx.create wpisu rejestru albo awaria Firestore - nic
    // nie zapisano. PIENIADZE JUZ POSZLY i mowimy to wprost.
    console.error('[api/asks/accept/solana] Zapis przyjecia nie powiodl sie:', error);
    throw new AskError(
      'accept_write_failed',
      500,
      'The payout is confirmed on Solana but recording it failed. Retry with the same signature - you will not be charged again.',
      { payoutSignature: signature }
    );
  }

  if (outcome.kind === 'already') {
    return alreadyResponse(outcome.record, signature, {
      askId,
      answerId,
      cluster: state.solana.cluster,
      acceptedCount: outcome.acceptedCount,
      seats: outcome.seats,
      status: outcome.status,
    });
  }

  /* ---------------- (8) Powiadomienie ---------------- */

  try {
    await notify({
      // Sesja trzyma adresy malymi literami, powiadomienia czyta przegladarka
      // adresem z wagmi (EIP-55) - jak w trasie USDC.
      recipientId: getAddress(answerer),
      askAuthorId: getAddress(state.author),
      askId,
      answerId,
      amount: formatLamports(record.lamports),
      token: 'SOL',
      delivery: 'wallet',
      txHash: signature,
    });
  } catch (error) {
    // Powiadomienie NIE cofa przyjecia: przelew jest na lancuchu, rekord zapisany.
    console.error('[api/asks/accept/solana] Powiadomienie o wyplacie nie powiodlo sie:', error);
  }

  return {
    status: 200,
    body: responseBody(outcome.record, {
      askId,
      answerId,
      cluster: state.solana.cluster,
      acceptedCount: outcome.acceptedCount,
      seats: outcome.seats,
      status: outcome.status,
      ...(outcome.autoResolved ? { autoResolved: true as const } : {}),
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  TRANSAKCJA                                                         */
/* ------------------------------------------------------------------ */

type SolState = SealedAskState & { solana: NonNullable<SealedAskState['solana']> };

type TxOutcome =
  | { kind: 'already'; record: AnyAcceptanceRecord; acceptedCount: number; seats: number; status: AskStatus }
  | {
      kind: 'recorded';
      record: SolanaAcceptanceRecord;
      acceptedCount: number;
      seats: number;
      status: AskStatus;
      autoResolved: boolean;
    };

/**
 * Wszystkie odczyty najpierw, potem decyzje i zapisy. Odczyty blokuja
 * asks/{id}: rownolegle przyjecie zostanie powtorzone i zobaczy nasz rekord,
 * wiec dwa zadania nie zajma jednego ostatniego miejsca.
 */
async function acceptInTransaction(
  tx: Transaction,
  store: AskStore,
  input: {
    askId: string;
    answerId: string;
    author: string;
    answerer: string;
    payee: AnswerPayee;
    record: SolanaAcceptanceRecord;
    now: () => number;
  }
): Promise<TxOutcome> {
  const { askId, answerId, record } = input;
  const regId = solanaPayoutRegistryId(record.signature);

  const [askSnap, stateSnap, answerSnap, ownSnap, regSnap, payeeSnap] = await tx.getAll(
    askRef(store, askId),
    stateRef(store, askId),
    answerRef(store, answerId),
    acceptanceRef(store, askId, answerId),
    payoutRef(store, regId),
    payeeRef(store, askId, answerId)
  );
  const accepted = await readAcceptances(store, askId, tx);

  // Ponowne sprawdzenie - miedzy odczytem a transakcja Ask mogl zostac
  // rozstrzygniety albo przyjecie zapisane przez rownolegle zadanie.
  const bundle = askBundleFromSnapshots(store, askId, askSnap, stateSnap);
  usableView(bundle);
  const state = solState(bundle.state);
  if (state.author !== input.author) throw new AskError('not_ask_author', 403, 'Only the author of this Ask can accept an answer.');

  const answerRaw = snapData(answerSnap);
  if (!answerRaw || answerRaw.askId !== askId || lowerAddress(answerRaw.author) !== input.answerer) {
    throw new AskError('answer_not_found', 404, 'Answer not found on this Ask');
  }

  const own = readAnyAcceptance(store.keys, askId, answerId, snapData(ownSnap));
  if (own.kind === 'invalid' || accepted.invalid.length > 0) throw sealInvalid();
  if (own.kind === 'valid') {
    return { kind: 'already', record: own.value, acceptedCount: accepted.valid.size, seats: state.seats, status: state.status };
  }
  if (state.status === 'resolved') throw new AskError('ask_resolved', 409, 'This Ask is already resolved.');

  // Odbiorca niezmienny - ten sam, ktory sprawdzilismy na lancuchu.
  const payee = readPayee(store.keys, askId, answerId, snapData(payeeSnap));
  if (payee.kind !== 'valid' || payee.value.payee !== input.payee.payee) throw sealInvalid();

  // Rejestr: niewazny wpis -> 503 (nigdy nie nadpisujemy); wazny wpis TEJ
  // odpowiedzi (rekord skasowany skryptem admina) -> bierzemy ponownie;
  // wazny wpis innej odpowiedzi -> ten podpis juz cos oplacil.
  const registry = readAnyRegistry(store.keys, regId, snapData(regSnap));
  if (registry.kind === 'invalid') {
    console.error(`[api/asks/accept/solana] ALARM: niewazny wpis rejestru wyplat ${regId} (${registry.reason}).`);
    throw sealInvalid();
  }
  const ownedEntry = registry.kind === 'valid' && registry.value.askId === askId && registry.value.answerId === answerId;
  if (registry.kind === 'valid' && !ownedEntry) {
    throw new AskError(
      'payout_already_used',
      409,
      'This transaction was already recorded as the payout for another answer. Each transaction can pay for one answer only.'
    );
  }

  // Miejsca WYLACZNIE z rekordow (Ask SOL nie ma starych przyjec).
  const taken = countTakenSeats(accepted.valid.keys(), [], answerId);
  if (taken >= state.seats) {
    throw new AskError('no_seats_left', 409, `All ${state.seats} seats on this Ask are taken.`, {
      acceptedCount: taken,
      seats: state.seats,
    });
  }

  const acceptedCount = taken + 1;
  const autoResolved = state.status === 'open' && isAutoFull(acceptedCount, state.seats, state.funding);
  const next: SealedAskState = autoResolved
    ? { ...state, status: 'resolved', resolvedAt: input.now(), resolveKind: 'auto-full' }
    : state;

  recordAcceptance(tx, store, record, lamportsToSolNumber(record.lamports), { createPayout: !ownedEntry });
  if (next.status !== state.status) putState(tx, store, next);
  mirrorAsk(
    tx,
    store,
    askId,
    {
      acceptedCount,
      status: next.status,
      ...(next.status === 'resolved' && next.resolvedAt !== null ? { resolvedAt: next.resolvedAt } : {}),
    },
    next
  );

  return { kind: 'recorded', record, acceptedCount, seats: next.seats, status: next.status, autoResolved };
}

/* ------------------------------------------------------------------ */
/*  DROBIAZGI                                                          */
/* ------------------------------------------------------------------ */

/** Stan Aska SOL albo wrong_rail. Szyna WYLACZNIE ze stanu (nie z lustra). */
function solState(state: SealedAskState | null): SolState {
  if (!state || railOf(state) !== 'sol-solana' || !state.solana) {
    throw new AskError('wrong_rail', 409, 'This Ask pays in USDC on Base. Accept it with a Base transaction hash (payoutTxHash).');
  }
  return state as SolState;
}

type ResponseContext = {
  askId: string;
  answerId: string;
  cluster: SolanaClusterName;
  acceptedCount: number;
  seats: number;
  status: AskStatus;
  alreadyRecorded?: true;
  autoResolved?: true;
};

function responseBody(record: SolanaAcceptanceRecord, ctx: ResponseContext): SolanaAcceptBody {
  return {
    askId: ctx.askId,
    answerId: ctx.answerId,
    accepted: true,
    payoutTxHash: record.signature,
    payoutSignature: record.signature,
    payoutLogIndex: null,
    payoutAmount: lamportsToSolNumber(record.lamports),
    payoutLamports: record.lamports,
    payoutToken: 'SOL',
    payoutNetwork: 'solana',
    solanaCluster: record.cluster,
    // Platnik, odbiorca, memo, kwota, czas i jednorazowosc podpisu sprawdzone.
    verification: 'strict',
    acceptedCount: ctx.acceptedCount,
    seats: ctx.seats,
    status: ctx.status,
    ...(ctx.alreadyRecorded ? { alreadyRecorded: true as const } : {}),
    ...(ctx.autoResolved ? { autoResolved: true as const } : {}),
  };
}

/**
 * Odpowiedz z juz zapisanego rekordu tej odpowiedzi: ten sam podpis -> 200
 * alreadyRecorded, cokolwiek innego -> 409 already_accepted.
 */
function alreadyResponse(record: AnyAcceptanceRecord, signature: string, ctx: ResponseContext): SolanaAcceptResult {
  if (!isSolanaAcceptance(record) || record.signature !== signature) {
    throw new AskError('already_accepted', 409, 'This answer is already accepted.', {
      payoutTxHash: acceptancePayoutRef(record).txRef,
    });
  }
  return { status: 200, body: responseBody(record, { ...ctx, alreadyRecorded: true }) };
}

function snapData(snap: DocumentSnapshot | undefined): Record<string, unknown> | null {
  return snap && snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
}

function sealInvalid(): AskError {
  return new AskError('seal_invalid', 503, 'This Ask cannot be verified right now. Nothing was changed.');
}

function chainUnavailable(): AskError {
  return new AskError(
    'chain_unavailable',
    503,
    'Could not read Solana right now. Nothing was recorded - retry with the same signature.'
  );
}
