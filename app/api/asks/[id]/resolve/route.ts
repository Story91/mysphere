/**
 * POST /api/asks/[id]/resolve - autor zamyka Aska 'on-resolve'.
 *
 * === CO SIE PRZY TYM DZIEJE ===
 * Rozstrzygniecie robi dwie rzeczy naraz i obie sa nieodwracalne:
 *   1. Ask przestaje byc otwarty - w `resolve rate` autora laduje po stronie
 *      "rozstrzygnietych", a nie "porzuconych",
 *   2. PIECZEC PADA. GET /api/asks/[id]/answers wydaje od tej chwili tresci
 *      WSZYSTKICH odpowiedzi kazdemu, kto zapyta - tak dziala caly mechanizm
 *      ("sealed until you resolve"), ale odpowiadajacy musza to wiedziec.
 *
 * === DLACZEGO NIE DA SIE ROZSTRZYGNAC, NIE PLACAC ===
 * `resolve rate` jest JEDYNA ochrona odpowiadajacego: to on pracuje przed
 * zaplata. Gdyby autor mogl zamknac Aska z zerem przyjetych odpowiedzi, mialby
 * darmowy sposob na podniesienie sobie tej liczby - zalozyc Aska, zebrac prace,
 * zamknac, powtorzyc. Dlatego przy Asku, na ktory ktos odpowiedzial, wymagamy
 * co najmniej jednego przyjecia (czyli co najmniej jednego przelewu z dowodem
 * na lancuchu, patrz ./accept).
 *
 * Ask, na ktory NIKT nie odpowiedzial, zamyka sie bez tego warunku - nie ma tam
 * kogo skrzywdzic ani komu zaplacic.
 *
 * SWIADOMY KOSZT TEJ ZASADY: autor, ktory dostal same zle odpowiedzi, nie ma jak
 * zamknac Aska "uczciwie na zero" - minie mu termin i wskaznik potraktuje to jak
 * porzucenie. Wybor jest miedzy krzywda dla niego a darmowa furtka dla kazdego,
 * kto chce zbierac prace i nie placic; ta druga psuje liczbe, na ktorej stoi
 * zaufanie do calego mechanizmu.
 *
 * === CO BYLO NIE TAK (plan zabezpieczen Askow, krok 6) ===
 * Warunek "co najmniej jedno przyjecie" czytal answerCount i acceptedCount
 * z lustra, a flage `accepted` przy odpowiedzi kazda przegladarka ustawia
 * sama. Jedna podrobiona flaga + to wywolanie dawaly TRWALE, zapieczetowane
 * 'resolved': odpieczetowanie wszystkich odpowiedzi bez grosza wyplaty.
 *
 * Teraz, NIEZALEZNIE od ASK_SEALS_ENFORCED:
 *  - przyjecia liczymy WYLACZNIE z rekordow asks/{id}/acceptances (HMAC)
 *    i ze starych przyjec, ktore wiaza sie na lancuchu w tym zadaniu
 *    (verifyLegacyAcceptance: 'transfer') - te od razu zapisujemy jako rekordy,
 *  - liczbe odpowiedzi bierzemy z askAnswers przez admin SDK (dokumenty tworzy
 *    tylko serwer), nie z licznika w lustrze,
 *  - wszystko w jednej transakcji admin SDK, a wynik to zapieczetowany stan
 *    'resolved' (resolveKind 'author'). Lustro asks/{id} zostaje naprawione.
 *  - Ask escrow odsylamy do /escrow-resolve: zamkniecie samego dokumentu
 *    twierdziloby, ze wyplacono, a budzet dalej lezalby na kontrakcie.
 *
 * Ta trasa NIE eksportuje niczego poza POST i konfiguracja - Next odrzuca
 * inne eksporty z plikow route.ts, wiec pomocnicze funkcje sa lokalne.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import {
  lowerAddress,
  payoutEntryFor,
  payoutRegistryId,
  pickTransfer,
  readAcceptance,
  readRegistry,
  transferAcceptance,
  type TransferLike,
} from '../../../../utils/asks/askSealCore';
import { sessionAddress } from '../../identity';
import {
  AskError,
  acceptanceRef,
  adoptLegacyState,
  answerRef,
  askBundleFromSnapshots,
  askRef,
  createPayoutEntry,
  isDocId,
  legacyContext,
  mirrorAsk,
  openAskStore,
  payoutRef,
  putAcceptance,
  putState,
  readAcceptances,
  readAnswerRows,
  readAskBundle,
  stateRef,
  usableView,
  verifyLegacyAcceptance,
  type AcceptanceRecord,
  type AnswerRow,
  type AskBundle,
  type AskStore,
  type AskView,
  type PayoutRegistryEntry,
  type SealCheck,
  type SealedAskState,
} from '../../askStore';

// getSessionFromCookies uzywa node:crypto, firebase-admin nie dziala na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Stare przyjecia sprawdzamy na lancuchu (RPC) - przy kilkunastu to trwa.
export const maxDuration = 30;

const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

/** Przelew bezposredni jest zawsze na Base - ta sama liczba co w transferAcceptance. */
const TRANSFER_CHAIN_ID = 8453;

/** Ile weryfikacji RPC naraz - jedno zadanie nie moze zalac RPC. */
const RPC_CONCURRENCY = 5;

/* ------------------------------------------------------------------ */
/*  TRASA                                                              */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  // Id idzie prosto do admin doc() - 'X/sealed/state' adresowaloby cudzy stan.
  const askId = params.id;
  if (!isDocId(askId)) return fail(400, 'invalid_id', 'Invalid Ask id.');

  // Adres z ciala zadania nie jest tozsamoscia - liczy sie podpisana sesja.
  const viewer = lowerAddress(sessionAddress(request));
  if (!viewer) return fail(401, 'session_required', 'Sign in with your wallet to resolve an Ask.');

  const store = await openAskStore();
  if (!store) {
    return fail(503, 'store_unavailable', 'Ask storage is not configured on this deployment. Nothing was changed.');
  }

  try {
    return await resolveOnResolveAsk(store, askId, viewer);
  } catch (error) {
    if (error instanceof AskError) return fail(error.status, error.code, error.message, error.details);
    // Blad PRZED transakcja (odczyt). Nieudany odczyt to nie "nie ma Aska".
    console.error('[api/asks/resolve] Odczyt przed rozstrzygnieciem nie powiodl sie:', error);
    return fail(503, 'ask_unavailable', 'Could not read this Ask right now. Nothing was changed.');
  }
}

async function resolveOnResolveAsk(store: AskStore, askId: string, viewer: string): Promise<NextResponse> {
  /* ---------------- (1) Sprawdzenia ---------------- */

  const bundle = await readAskBundle(store, askId);
  const view = usableView(bundle); // 404 albo 503 seal_invalid
  requirePub(bundle);
  const author = lowerAddress(view.author);
  if (!author || author !== viewer) {
    throw new AskError('not_ask_author', 403, 'Only the author of this Ask can resolve it.');
  }
  assertResolvable(bundle, view);

  /* ---------------- (2) Stare przyjecia - poza transakcja (RPC) ---------------- */

  const [rows, accepted] = await Promise.all([readAnswerRows(store, askId), readAcceptances(store, askId)]);
  if (accepted.invalid.length > 0) throw sealInvalid();

  // Flaga `accepted` bez rekordu to albo przyjecie sprzed rekordow, albo
  // podrobka z devtools. Rozstrzyga lancuch, nie flaga.
  const pending = rows.filter((row) => row.raw.accepted === true && !accepted.valid.has(row.id));
  const planned: PlannedLegacy[] = [];
  const review: string[] = [];
  if (pending.length > 0) {
    // Ask 'on-resolve' nie ma escrow, wiec jedynym dowodem jest przelew.
    const ctx = legacyContext(askId, view, null, store.legacyCutoffMs);
    const verdicts = await mapLimit(pending, RPC_CONCURRENCY, (row) => verifyLegacyAcceptance(ctx, row));
    verdicts.forEach((verdict, index) => {
      if (verdict.kind === 'unknown') throw chainUnavailable();
      if (verdict.kind === 'transfer') {
        planned.push({
          row: pending[index],
          txHash: verdict.txHash,
          payee: verdict.payee,
          from: verdict.from,
          candidates: verdict.candidates,
          payoutAmount: unitsToUsdc(ctx.perAnswerUnits),
        });
      } else if (verdict.kind === 'weak') {
        // NIGDY nie resetujemy automatycznie - moze to byc prawdziwa wyplata
        // z innego portfela. Nie liczy sie, decyduje wlasciciel (reseal).
        review.push(pending[index].id);
      }
    });
  }
  if (review.length > 0) {
    console.warn(
      `[api/asks/resolve] Ask ${askId}: przyjecia 'weak' bez decyzji wlasciciela (${review.join(', ')}) - nie licza sie.`
    );
  }

  /* ---------------- (3) Transakcja ---------------- */

  let outcome: ResolveOutcome;
  try {
    outcome = await store.db.runTransaction((tx) =>
      resolveInTransaction(tx, store, { askId, author, planned, pendingReview: review.length })
    );
  } catch (error) {
    if (error instanceof AskError) throw error;
    console.error('[api/asks/resolve] Zapis rozstrzygniecia nie powiodl sie:', error);
    // Transakcja jest atomowa - nic nie zapisano, ponowienie jest bezpieczne.
    return fail(
      500,
      'resolve_write_failed',
      'Failed to resolve this Ask. Accepted answers and their payouts are already recorded.'
    );
  }

  /* ---------------- (4) Odpowiedz - ksztalt bez zmian ---------------- */

  return NextResponse.json(
    {
      askId,
      status: 'resolved',
      acceptedCount: outcome.acceptedCount,
      answerCount: outcome.answerCount,
      seats: outcome.seats,
      // Mowimy wprost o skutku, ktorego nie da sie cofnac.
      unsealed: true,
      note: 'Every answer on this Ask is now readable by anyone.',
    },
    { headers: NO_STORE_PRIVATE }
  );
}

/**
 * Czy ten Ask w ogole da sie tu rozstrzygnac. Wolane przed i W transakcji.
 *
 * Status bierzemy ze stanu. Dla Aska bez stanu (w OBU trybach flagi -
 * 'unverified' ma status wymuszony na 'open', wiec czytamy lustro wprost):
 *  - 'resolved' z lustra -> odmowa (ostroznie: moglo to byc prawdziwe stare
 *    rozstrzygniecie; podrobke rozpoznaje reseal). To tylko ODMOWA - nic
 *    nie zapisujemy na podstawie lustra,
 *  - 'expired' z lustra -> IGNORUJEMY: Ask 'on-resolve' nie ma czego
 *    wygaszac na lancuchu, wiec to zawsze podrobka (reseal: forged_expire).
 *    Rozstrzygniecie naprawi lustro.
 */
function assertResolvable(bundle: AskBundle, view: AskView): void {
  if (view.funding === 'escrowed') {
    throw new AskError(
      'use_escrow_resolve',
      409,
      'This Ask is escrowed. Resolve it through the escrow contract so the budget reaches the answers you picked.'
    );
  }
  const status = bundle.state ? bundle.state.status : bundle.pub?.status === 'resolved' ? 'resolved' : 'open';
  if (status === 'resolved') throw new AskError('already_resolved', 409, 'This Ask is already resolved.');
  if (status === 'expired') throw new AskError('ask_expired', 409, 'This Ask has expired and can no longer be resolved.');
}

/* ------------------------------------------------------------------ */
/*  TRANSAKCJA                                                         */
/* ------------------------------------------------------------------ */

type ResolveOutcome = { acceptedCount: number; answerCount: number; seats: number };

/** Stare przyjecie zwiazane przelewem od autora - do zapisania jako rekord. */
type PlannedLegacy = {
  row: AnswerRow;
  txHash: string;
  payee: string;
  from: string;
  candidates: TransferLike[];
  payoutAmount: number;
};

async function resolveInTransaction(
  tx: Transaction,
  store: AskStore,
  input: { askId: string; author: string; planned: PlannedLegacy[]; pendingReview: number }
): Promise<ResolveOutcome> {
  const { askId, planned } = input;
  const registryIds = Array.from(
    new Set(planned.flatMap((p) => p.candidates.map((c) => payoutRegistryId(TRANSFER_CHAIN_ID, p.txHash, c.logIndex))))
  );

  // Wszystkie odczyty najpierw (wymog Firestore). Odczyty blokuja dokumenty:
  // rownolegle przyjecie (pisze asks/{id}) zostanie powtorzone po nas albo my
  // po nim - licznik przyjec nie rozjedzie sie z rozstrzygnieciem.
  const snaps = await tx.getAll(
    askRef(store, askId),
    stateRef(store, askId),
    ...planned.map((p) => acceptanceRef(store, askId, p.row.id)),
    ...registryIds.map((id) => payoutRef(store, id))
  );
  const accepted = await readAcceptances(store, askId, tx);
  const rows = await readAnswerRows(store, askId, tx);

  const bundle = askBundleFromSnapshots(store, askId, snaps[0], snaps[1]);
  const view = usableView(bundle);
  const pub = requirePub(bundle);
  if (lowerAddress(view.author) !== input.author) {
    throw new AskError('not_ask_author', 403, 'Only the author of this Ask can resolve it.');
  }
  assertResolvable(bundle, view);
  if (accepted.invalid.length > 0) throw sealInvalid();

  const legacySnaps = snaps.slice(2, 2 + planned.length);
  const registry = readRegistryState(store, registryIds, snaps.slice(2 + planned.length));
  const bound = bindLegacy(store, askId, planned, legacySnaps, registry);

  const acceptedIds = new Set<string>([...accepted.valid.keys(), ...bound.map((b) => b.record.answerId)]);
  if (rows.length > 0 && acceptedIds.size === 0) {
    // Zadnego zapisu: ani stanu, ani lustra. Podrobiona flaga nie zamknie Aska.
    throw new AskError(
      'nothing_accepted',
      409,
      input.pendingReview > 0
        ? 'Accept at least one answer before resolving. An earlier payout on this Ask could not be matched to your wallet and is waiting for review.'
        : 'Accept at least one answer before resolving. Resolving means you paid - closing without paying is not resolving.',
      { answerCount: rows.length }
    );
  }

  const now = Date.now();
  // Ask bez stanu adoptujemy WYLACZNIE z pol zamrozonych regula (author,
  // budget, seats, deadline, funding) - status z lustra nie wchodzi.
  const base = bundle.state ?? adoptLegacyState(askId, pub, 'adopted', null);
  const next: SealedAskState = { ...base, status: 'resolved', resolvedAt: now, resolveKind: 'author' };

  writeLegacy(tx, store, bound);
  putState(tx, store, next);
  mirrorAsk(tx, store, askId, {
    status: 'resolved',
    resolvedAt: now,
    acceptedCount: acceptedIds.size,
    answerCount: rows.length,
  });

  return { acceptedCount: acceptedIds.size, answerCount: rows.length, seats: next.seats };
}

type BoundLegacy = { planned: PlannedLegacy; record: AcceptanceRecord; createPayout: boolean };

/**
 * Przypisanie logow starym przyjeciom, od najstarszej odpowiedzi. Log zajety
 * w rejestrze przez inna odpowiedz nie moze oplacic drugiej - takie przyjecie
 * sie nie liczy. Rekord juz wazny -> pomijamy (jest w `accepted`);
 * niewazny -> 503, nigdy nie nadpisujemy.
 */
function bindLegacy(
  store: AskStore,
  askId: string,
  planned: PlannedLegacy[],
  snaps: DocumentSnapshot[],
  registry: RegistryState
): BoundLegacy[] {
  const order = planned
    .map((p, index) => ({ p, snap: snaps[index] }))
    .sort((a, b) => a.p.row.createTimeMs - b.p.row.createTimeMs || a.p.row.id.localeCompare(b.p.row.id));

  const bound: BoundLegacy[] = [];
  for (const { p, snap } of order) {
    const check = readAcceptance(store.keys, askId, p.row.id, snapData(snap));
    if (check.kind === 'invalid') throw sealInvalid();
    if (check.kind === 'valid') continue;
    const owned = findOwnedLog(registry, p.txHash, p.candidates, askId, p.row.id);
    const pick = owned ?? pickTransfer(p.candidates, usedFor(registry, p.txHash));
    if (!pick) {
      console.warn(`[api/asks/resolve] Stare przyjecie ${askId}/${p.row.id}: brak wolnego logu w ${p.txHash}.`);
      continue;
    }
    usedFor(registry, p.txHash).add(pick.logIndex);
    bound.push({
      planned: p,
      record: transferAcceptance({
        askId,
        answerId: p.row.id,
        payee: p.payee,
        from: p.from,
        txHash: p.txHash,
        logIndex: pick.logIndex,
        units: pick.value,
      }),
      createPayout: !owned,
    });
  }
  return bound;
}

/**
 * Wpis rejestru + rekord + naprawa lustra odpowiedzi. Lustro bez acceptedAt -
 * zostaje chwila prawdziwego przyjecia; kwota, token i siec wracaja do prawdy.
 */
function writeLegacy(tx: Transaction, store: AskStore, bound: BoundLegacy[]): void {
  for (const { planned, record, createPayout } of bound) {
    if (createPayout) createPayoutEntry(tx, store, payoutEntryFor(record));
    putAcceptance(tx, store, record);
    tx.set(
      answerRef(store, record.answerId),
      {
        accepted: true,
        payoutTxHash: record.txHash,
        payoutLogIndex: record.logIndex,
        payoutAmount: planned.payoutAmount,
        payoutToken: 'USDC',
        payoutNetwork: 'base',
      },
      { merge: true }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  REJESTR WYPLAT                                                     */
/* ------------------------------------------------------------------ */

type RegistryState = {
  checks: Map<string, SealCheck<PayoutRegistryEntry>>;
  /** txHash (Base) -> zajete logIndex. */
  used: Map<string, Set<number>>;
};

function readRegistryState(store: AskStore, ids: string[], snaps: DocumentSnapshot[]): RegistryState {
  const checks = new Map<string, SealCheck<PayoutRegistryEntry>>();
  const used = new Map<string, Set<number>>();
  ids.forEach((id, index) => {
    const check = readRegistry(store.keys, id, snapData(snaps[index]));
    if (check.kind === 'invalid') {
      console.error(`[api/asks/resolve] ALARM: niewazny wpis rejestru wyplat ${id} (${check.reason}).`);
      throw sealInvalid();
    }
    checks.set(id, check);
    if (check.kind === 'valid' && check.value.chainId === TRANSFER_CHAIN_ID) {
      const set = used.get(check.value.txHash) ?? new Set<number>();
      set.add(check.value.logIndex);
      used.set(check.value.txHash, set);
    }
  });
  return { checks, used };
}

function usedFor(registry: RegistryState, txHash: string): Set<number> {
  const key = txHash.toLowerCase();
  let set = registry.used.get(key);
  if (!set) {
    set = new Set<number>();
    registry.used.set(key, set);
  }
  return set;
}

/** Log, ktorego wazny wpis rejestru nalezy juz do tej odpowiedzi. */
function findOwnedLog<T extends TransferLike>(
  registry: RegistryState,
  txHash: string,
  candidates: readonly T[],
  askId: string,
  answerId: string
): T | null {
  for (const candidate of candidates) {
    const check = registry.checks.get(payoutRegistryId(TRANSFER_CHAIN_ID, txHash, candidate.logIndex));
    if (check?.kind === 'valid' && check.value.askId === askId && check.value.answerId === answerId) return candidate;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  DROBIAZGI                                                          */
/* ------------------------------------------------------------------ */

function fail(status: number, code: string, error: string, details?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, code, ...(details ?? {}) }, { status, headers: NO_STORE_PRIVATE });
}

function requirePub(bundle: AskBundle): Record<string, any> {
  // Sam stan bez publicznego dokumentu: nie ma czego pokazac ani adoptowac.
  if (!bundle.pub) throw new AskError('ask_not_found', 404, 'Ask not found.');
  return bundle.pub;
}

function snapData(snap: DocumentSnapshot | undefined): Record<string, unknown> | null {
  return snap && snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
}

/** Jednostki bazowe USDC -> kwota. Stawki maja najwyzej 2 miejsca po przecinku. */
function unitsToUsdc(units: bigint): number {
  return Number(units) / 1_000_000;
}

function sealInvalid(): AskError {
  return new AskError('seal_invalid', 503, 'This Ask cannot be verified right now. Nothing was changed.');
}

function chainUnavailable(): AskError {
  return new AskError('chain_unavailable', 503, 'Could not read Base right now. Nothing was changed - retry in a moment.');
}

/** Promise.all z limitem rownoleglosci. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
