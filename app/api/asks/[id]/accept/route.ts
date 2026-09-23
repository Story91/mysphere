/**
 * POST /api/asks/[id]/accept - autor przyjmuje JEDNA odpowiedz i zapisuje
 * przy niej DOWOD wyplaty.
 *
 * === PO CO TA TRASA ISTNIEJE ===
 * Ask dawal sie zalozyc i dawal sie odpowiedziec, ale bez tej trasy konczyl sie
 * slepym zaulkiem: odpowiedzi lezaly zapieczetowane i nic nie moglo ich przyjac.
 * Kolejnosc jest jedyna mozliwa: NAJPIERW przelew z portfela autora, POTEM ta
 * trasa. Przy Asku 'on-resolve' platforma nie ma czym zaplacic za autora - moze
 * wylacznie sprawdzic, ze autor zaplacil sam.
 *
 * === CO BYLO NIE TAK (plan zabezpieczen Askow, krok 5) ===
 * Poprzednia wersja pytala verifyBasePayment "czy w tej transakcji jest JAKIS
 * transfer USDC >= stawka do odpowiadajacego" i zapisywala przyjecie klienckim
 * SDK w dokumencie, ktory kazda przegladarka moze zmienic. Skutki:
 *  - dowolny przelew do tego adresu (cudza wyplata, wyplata z gieldy, stary
 *    napiwek) "oplacal" jego odpowiedz na dowolnym Asku i dowolnie wiele razy,
 *  - decyzje czytaly acceptedCount / accepted / status / token / network
 *    z lustra, ktore da sie podrobic z devtools: blokada autora (DoS) albo
 *    falszywe domkniecie Aska "na komplet" i odpieczetowanie odpowiedzi.
 *
 * === JAK JEST TERAZ ===
 *  - Przelew musi byc OD autora Aska (Transfer.from), DO autora odpowiedzi,
 *    >= stawka i z bloku NIE starszego niz odpowiedz (createTime dokumentu
 *    odpowiedzi nadaje serwer Firestore - nie da sie go podrobic).
 *  - Jeden log = jedna wyplata: wpis w askAnswerContent/_registry/payouts
 *    zakladany przez tx.create w TEJ SAMEJ transakcji co przyjecie.
 *  - Prawda lezy w asks/{id}/acceptances/{answerId} i asks/{id}/sealed/state
 *    (HMAC, sciezki zamkniete regulami). asks i askAnswers to tylko lustro,
 *    ktore ta trasa przy okazji naprawia.
 *  - Miejsca liczymy WYLACZNIE z rekordow i ze starych przyjec sprawdzonych na
 *    lancuchu w tym zadaniu. acceptedCount ani raw.accepted nie wchodza do
 *    decyzji niezaleznie od ASK_SEALS_ENFORCED.
 *  - Ask escrow przyjmuje przelew bezposredni dopiero wtedy, gdy kontrakt nie
 *    moze juz zaplacic (termin + 48h, ResolveWindowClosed) albo escrow wygasl.
 *    Wczesniej jedyna droga jest /escrow-resolve.
 *
 * === CZEGO TA TRASA NIE ROBI ===
 * Nie rozstrzyga Aska na zyczenie - przyjecie i zamkniecie to dwie decyzje
 * (POST /api/asks/[id]/resolve). Wyjatek: ostatnie oplacone miejsce Aska
 * 'on-resolve' zamyka go samo, bo nie ma juz czego rozstrzygac.
 *
 * Ta trasa NIE eksportuje niczego poza POST i konfiguracja - Next odrzuca
 * inne eksporty z plikow route.ts, wiec pomocnicze funkcje sa lokalne.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { getAddress } from 'viem';
import {
  countTakenSeats,
  escrowSeatAcceptance,
  isAutoFull,
  lowerAddress,
  lowerTxHash,
  matchUsdcTransfers,
  payoutEntryFor,
  payoutIsTimely,
  payoutRegistryId,
  pickTransfer,
  readAcceptance,
  railOf,
  readRegistry,
  transferAcceptance,
  type TransferLike,
} from '../../../../utils/asks/askSealCore';
import { RESOLVE_GRACE_MS, escrowKeyFor } from '../../../../utils/asks/escrow';
import { findAskExpired } from '../../../../utils/asks/escrowProofCore';
import type { AskStatus } from '../../../../utils/asks/types';
import { notifyAskPayout } from '../../../../utils/friends/notifications';
import { readUsdcTransfers } from '../../../../utils/monetization/verifyPayment';
import { proveLegacyEscrow, readEscrowReceipt } from '../../escrowProof';
import { sessionAddress } from '../../identity';
import { acceptSolanaAnswer } from '../../solanaAccept';
import {
  ASK_ANSWERS_COLLECTION,
  AskError,
  acceptanceRef,
  adoptLegacyState,
  answerRef,
  answerRowFromSnapshot,
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
  readAnswerRow,
  readAnswerRows,
  readAskBundle,
  recordAcceptance,
  stateRef,
  usableView,
  verifyLegacyAcceptance,
  type AcceptanceRecord,
  type AnswerRow,
  type AskBundle,
  type AskStore,
  type AskView,
  type LegacyAcceptanceContext,
  type LegacyVerdict,
  type PayoutRegistryEntry,
  type SealCheck,
  type SealedAskState,
  type SealedEscrow,
} from '../../askStore';

// getSessionFromCookies uzywa node:crypto, viem i firebase-admin nie dzialaja na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Stare przyjecia sprawdzamy na lancuchu (RPC) - przy kilkunastu to trwa.
export const maxDuration = 30;

/** Odpowiedz mowi o pieniadzach konkretnego czlowieka - nigdzie jej nie cache'ujemy. */
const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

/** Przelew bezposredni jest zawsze na Base - ta sama liczba co w transferAcceptance. */
const TRANSFER_CHAIN_ID = 8453;

/**
 * Ile odpowiedzi z tym samym hashem wyplaty sprawdzamy. Dotyczy tylko zapisow
 * sprzed rejestru - nowe przyjecia rejestr widzi sam. Jedna transakcja
 * uczciwie oplaca najwyzej kilka odpowiedzi (batch portfela kontraktowego).
 */
const SAME_HASH_SCAN_LIMIT = 50;

/** Ile weryfikacji RPC naraz - jedno zadanie nie moze zalac RPC. */
const RPC_CONCURRENCY = 5;

interface AcceptBody {
  answerId?: unknown;
  payoutTxHash?: unknown;
  /** Ask SOL: podpis transakcji Solany (base58). Patrz ../../solanaAccept.ts. */
  payoutSignature?: unknown;
}

/* ------------------------------------------------------------------ */
/*  TRASA                                                              */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  // Id idzie prosto do admin doc(). Bez tej bramki 'X/sealed/state' adresowaloby
  // zapieczetowany stan cudzego Aska, a lustro (set merge) pisaloby prosto w niego.
  const askId = params.id;
  if (!isDocId(askId)) return fail(400, 'invalid_id', 'Invalid Ask id.');

  // Adres z ciala zadania NIE JEST tozsamoscia. Tylko podpisana sesja SIWE mowi,
  // kto to jest - inaczej kazdy przyjmowalby odpowiedzi na cudzym Asku.
  const viewer = lowerAddress(sessionAddress(request));
  if (!viewer) return fail(401, 'session_required', 'Sign in with your wallet to accept an answer.');

  let body: AcceptBody;
  try {
    body = (await request.json()) as AcceptBody;
  } catch {
    return fail(400, 'invalid_json', 'Invalid JSON body');
  }
  if (!body || typeof body !== 'object') return fail(400, 'invalid_json', 'Invalid JSON body');

  const answerId = typeof body.answerId === 'string' ? body.answerId.trim() : '';
  if (!isDocId(answerId)) return fail(400, 'invalid_id', 'Missing or invalid answerId.');

  // Ask SOL: dowodem jest podpis transakcji Solany (base58 - bez zmiany
  // wielkosci liter). Cala logika w ../../solanaAccept.ts; tutaj tylko wybor
  // szyny po polu ciala. Bez `payoutSignature` trasa dziala jak dotad.
  if (body.payoutSignature !== undefined) {
    const signature = typeof body.payoutSignature === 'string' ? body.payoutSignature.trim() : '';
    if (!signature) return fail(400, 'invalid_signature', 'A Solana payout transaction signature is required to accept an answer.');
    const solStore = await openAskStore();
    if (!solStore) {
      return fail(
        503,
        'store_unavailable',
        'Ask storage is not configured on this deployment. Nothing was recorded - retry later with the same signature.'
      );
    }
    try {
      const result = await acceptSolanaAnswer(solStore, { askId, answerId, signature, viewer });
      return NextResponse.json(result.body, { status: result.status, headers: NO_STORE_PRIVATE });
    } catch (error) {
      if (error instanceof AskError) return fail(error.status, error.code, error.message, error.details);
      console.error('[api/asks/accept] Odczyt przed zapisem przyjecia SOL nie powiodl sie:', error);
      return fail(
        503,
        'ask_unavailable',
        'Could not read this Ask right now. Nothing was recorded - retry with the same signature.'
      );
    }
  }

  const rawHash = typeof body.payoutTxHash === 'string' ? body.payoutTxHash.trim() : '';
  const hash = lowerTxHash(rawHash);
  if (!hash) {
    return fail(400, 'payout_hash_required', 'A payout transaction hash is required to accept an answer.');
  }

  // Bez magazynu (admin SDK + klucz pieczeci) nie da sie zapisac przyjecia tam,
  // gdzie przegladarka go nie podrobi. Odmawiamy zamiast pisac do lustra.
  const store = await openAskStore();
  if (!store) {
    return fail(
      503,
      'store_unavailable',
      'Ask storage is not configured on this deployment. Nothing was recorded - retry later with the same transaction hash.'
    );
  }

  try {
    return await acceptAnswer(store, { askId, answerId, hash, rawHash, viewer });
  } catch (error) {
    if (error instanceof AskError) return fail(error.status, error.code, error.message, error.details);
    // Blad PRZED transakcja zapisu (odczyt Firestore). Nieudany odczyt to nie
    // "nie ma takiego Aska" - nic nie zapisano, ponowienie jest bezpieczne.
    console.error('[api/asks/accept] Odczyt przed zapisem przyjecia nie powiodl sie:', error);
    return fail(
      503,
      'ask_unavailable',
      'Could not read this Ask right now. Nothing was recorded - retry with the same transaction hash.'
    );
  }
}

type AcceptInput = {
  askId: string;
  answerId: string;
  /** Hash wyplaty malymi literami. */
  hash: string;
  /** Hash tak, jak przyszedl - stare zapisy trzymaja go bez normalizacji. */
  rawHash: string;
  /** Adres z sesji, malymi literami. */
  viewer: string;
};

async function acceptAnswer(store: AskStore, input: AcceptInput): Promise<NextResponse> {
  const { askId, answerId, hash, viewer } = input;

  /* ---------------- (2) Ask ---------------- */

  const bundle = await readAskBundle(store, askId);
  const view = usableView(bundle); // 404 albo 503 seal_invalid
  // Ask SOL (szyna ze STANU) nie przyjmuje hashy z Base - wyplata idzie
  // podpisem Solany (payoutSignature). Lustro szyny nie wybiera.
  if (railOf(bundle.state) === 'sol-solana') {
    throw new AskError(
      'wrong_rail',
      409,
      'This Ask pays in SOL on Solana. Accept it with the Solana transaction signature (payoutSignature).'
    );
  }
  const pub = requirePub(bundle);
  const author = lowerAddress(view.author);
  if (!author || author !== viewer) {
    throw new AskError('not_ask_author', 403, 'Only the author of this Ask can accept an answer.');
  }

  /* ---------------- (3) Odpowiedz ---------------- */

  const row = await readAnswerRow(store, answerId);
  if (!row || row.raw.askId !== askId) {
    // Odpowiedz spod innego Aska jest dla tego Aska nieistniejaca - i tak samo
    // ma sie czytac, zeby nie dalo sie zgadywac cudzych identyfikatorow.
    throw new AskError('answer_not_found', 404, 'Answer not found on this Ask');
  }
  const payee = lowerAddress(row.raw.author);
  if (!payee || payee === author) {
    // Zaplata samemu sobie podnosilaby tylko wlasny resolve rate.
    throw new AskError('invalid_payee', 409, 'This answer has no payable author.');
  }

  /* ---------------- (4) Istniejacy rekord ---------------- */

  // Sprawdzany PRZED statusem: ostatnie miejsce zamyka Aska, a ponowienie
  // z tym samym hashem (zgubiona odpowiedz sieciowa) ma dostac 200, nie
  // "Ask juz rozstrzygniety".
  const recorded = await ownRecordResponse(store, view, { askId, answerId, hash });
  if (recorded) return recorded;

  // Rozstrzygniecie jest jednokierunkowe (patrz isResolvedForRefusal).
  if (isResolvedForRefusal(bundle)) {
    throw new AskError('ask_resolved', 409, 'This Ask is already resolved.');
  }

  /* ---------------- Escrow i stawka ---------------- */

  const escrow = await escrowTermsFor(bundle, view, pub, author, askId);
  if (view.funding === 'escrowed') {
    if (!escrow) throw new AskError('escrow_unverified', 409, 'The escrow terms of this Ask are unknown.');
    // Przed termin + 48h kontrakt wciaz umie zaplacic - wyplata ma isc przez
    // escrow, inaczej autor zaplacilby dwa razy (przelew + zwrot przez resolve
    // albo settleExpired). Po tej chwili zostaje juz tylko zwrot autorowi,
    // wiec zaplacenie z reki jest jedynym sposobem, zeby odpowiadajacy dostal
    // cokolwiek. Status z lustra nie otwiera tej furtki - tylko zapieczetowane
    // 'expired' albo czas liczony od terminu z LANCUCHA.
    if (!directPayoutAllowed(bundle.state, escrow, Date.now())) {
      throw new AskError(
        'use_escrow_resolve',
        409,
        'This Ask is paid through its escrow. Award answers with the escrow resolve; a direct payout can be recorded only once the escrow can no longer pay (48 hours after the deadline).',
        { directPayoutAfter: Number(escrow.deadlineSec) * 1000 + RESOLVE_GRACE_MS }
      );
    }
  }

  // Stawka: z lancucha dla escrow, z budzetu i miejsc (zamrozonych) dla reszty.
  const ctx = legacyContext(askId, view, escrow, store.legacyCutoffMs);
  const perAnswerUnits = ctx.perAnswerUnits;
  const perAnswer = unitsToUsdc(perAnswerUnits);

  /* ---------------- (4b) Stare przyjecie TEJ odpowiedzi innym hashem ---------------- */

  const oldHash = row.raw.accepted === true ? lowerTxHash(row.raw.payoutTxHash) : null;
  if (oldHash && oldHash !== hash) {
    const verdict = await verifyLegacyAcceptance(ctx, row);
    if (verdict.kind === 'unknown') throw chainUnavailable();
    const planned = planFromVerdict(askId, row, verdict, perAnswerUnits);
    if (planned) {
      // Prawdziwa, stara wyplata: zapisujemy ja jako rekord i odmawiamy drugiej.
      // 'weak' i 'forged' przepuszczamy - nowa wyplata jest sprawdzana nizej
      // i nadpisze lustro.
      const recorded = await commitLegacyOnly(store, [planned]);
      if (recorded > 0) {
        // Rekord TEJ odpowiedzi juz jest (nasz zapis albo rownolegle zadanie) -
        // odpowiadamy wedlug niego: ten sam hash -> 200, inny -> 409.
        const response = await ownRecordResponse(store, view, { askId, answerId, hash });
        if (response) return response;
        throw alreadyAccepted(oldHash);
      }
    }
  }

  /* ---------------- (5) Lancuch ---------------- */

  const chain = await readUsdcTransfers(hash);
  if (!chain.ok) {
    if (chain.code === 'rpc_error') throw chainUnavailable();
    // 409, nie 400: cialo zadania jest poprawne, to STAN LANCUCHA sie nie zgadza.
    // Swieza transakcja (tx_not_found) przejdzie po ponowieniu z tym samym hashem.
    throw new AskError('payout_unverified', 409, chain.error, { retryable: chain.code === 'tx_not_found' });
  }

  const candidates = matchUsdcTransfers(chain.transfers, { from: author, to: payee, minUnits: perAnswerUnits });
  if (candidates.length === 0) {
    const fromSomeoneElse = chain.transfers.some((t) => t.to === payee && t.value >= perAnswerUnits);
    if (fromSomeoneElse) {
      throw new AskError(
        'payout_wrong_sender',
        409,
        'This transfer was not sent from the wallet that posted the Ask. Pay from the Ask author wallet so the payout can be verified.'
      );
    }
    throw new AskError(
      'payout_unverified',
      409,
      `This transaction has no USDC transfer of at least ${perAnswer.toFixed(2)} from the Ask author to the answer author.`
    );
  }

  /* ---------------- (6) Czas ---------------- */

  if (!payoutIsTimely(chain.blockTimeSec, row.createTimeMs)) {
    throw new AskError(
      'payout_predates_answer',
      409,
      'This transfer happened before the answer was written, so it cannot be the payout for it.'
    );
  }

  /* ---------------- (7) Stare uzycia tego hasha + stare przyjecia tego Aska ---------------- */

  // Przyjecia sprzed rejestru nie maja wpisu w rejestrze. Gdyby to byl jedyny
  // bezpiecznik, ta sama wyplata policzylaby sie drugi raz. Szukamy ich po
  // hashu w lustrze, ale LICZA SIE tylko te, ktore wiaza sie na lancuchu -
  // przegladarka nie zajmie cudzego hasha samym wpisem.
  // Wyplata z bloku po granicy nie mogla byc przyjeta starym kodem, wiec nie
  // ma czego szukac w lustrze: kazde takie "przyjecie" to wpis z devtools
  // (verifyLegacyAcceptance i tak dalby mu 'weak'). Oszczedza zapytanie i RPC.
  const planned =
    chain.blockTimeSec * 1000 < store.legacyCutoffMs
      ? await legacyUsesOfHash(store, { askId, answerId, hash, rawHash: input.rawHash, ctx })
      : [];
  if (!bundle.state) {
    // Adopcja Aska bez stanu. Po zapieczetowaniu wyswietlanie czyta TYLKO
    // rekordy - prawdziwe stare przyjecia bez rekordu wygladalyby na
    // nieoplacone (przycisk "Pay" = druga wyplata), a miejsca bylyby policzone
    // za nisko (brak domkniecia na komplet). Rozszerzenie planu (krok 5 bierze
    // tylko ten sam hash) - opis w raporcie.
    planned.push(...(await legacyAcceptancesOnAsk(store, askId, answerId, ctx, planned)));
  }

  // Ask escrow bez stanu, ktory naprawde wygasl na lancuchu, ma zostac
  // 'expired' - adopcja bez tego zapieczetowalaby 'open' i UI kazalby odzyskac
  // budzet, ktory juz wrocil.
  const adoptedExpiry = !bundle.state && escrow ? await provenLegacyExpiry(pub, author, askId, escrow) : null;

  /* ---------------- (8) Transakcja ---------------- */

  let outcome: TxOutcome;
  try {
    outcome = await store.db.runTransaction((tx) =>
      acceptInTransaction(tx, store, {
        askId,
        answerId,
        author,
        payee,
        hash,
        candidates,
        perAnswer,
        planned,
        escrow,
        adoptedExpiry,
      })
    );
  } catch (error) {
    if (error instanceof AskError) throw error;
    // Przegrany wyscig (tx.create wpisu rejestru) albo awaria Firestore. Nic
    // nie zostalo zapisane - transakcja jest atomowa - a ponowienie z tym samym
    // hashem jest idempotentne. PIENIADZE JUZ POSZLY i mowimy to wprost.
    console.error('[api/asks/accept] Zapis przyjecia nie powiodl sie:', error);
    return fail(
      500,
      'accept_write_failed',
      'The payout is confirmed on-chain but recording it failed. Retry with the same transaction hash - you will not be charged again.',
      { payoutTxHash: hash }
    );
  }

  if (outcome.kind === 'refused') throw outcome.error;
  if (outcome.kind === 'already') {
    return acceptedResponse({
      askId,
      answerId,
      record: outcome.record,
      perAnswer,
      acceptedCount: outcome.acceptedCount,
      seats: outcome.seats,
      status: outcome.status,
      alreadyRecorded: true,
    });
  }

  /* ---------------- (9) Powiadomienie ---------------- */

  // Tylko gdy TO zadanie zapisalo przyjecie. Stare przyjecie z tym samym
  // hashem (lustro juz mowilo accepted) zostalo ogloszone przez stara trase.
  const legacyUpgrade = row.raw.accepted === true && lowerTxHash(row.raw.payoutTxHash) === hash;
  if (!legacyUpgrade) {
    try {
      await notifyAskPayout({
        // Sesja trzyma adresy malymi literami, powiadomienia czyta przegladarka
        // adresem z wagmi (EIP-55) - bez checksumy dokument lezalby pod kluczem,
        // do ktorego nikt nie zaglada.
        recipientId: getAddress(payee),
        askAuthorId: getAddress(author),
        askId,
        answerId,
        amount: perAnswer.toFixed(2),
        token: 'USDC',
        // Bezposredni przelew: pieniadze sa juz w portfelu, nic nie trzeba odbierac.
        delivery: 'wallet',
        txHash: hash,
      });
    } catch (error) {
      // Powiadomienie NIE cofa przyjecia: przelew jest na lancuchu, rekord zapisany.
      console.error('[api/asks/accept] Powiadomienie o wyplacie nie powiodlo sie:', error);
    }
  }

  return acceptedResponse({
    askId,
    answerId,
    record: outcome.record,
    perAnswer,
    acceptedCount: outcome.acceptedCount,
    seats: outcome.seats,
    status: outcome.status,
    autoResolved: outcome.autoResolved,
  });
}

/* ------------------------------------------------------------------ */
/*  TRANSAKCJA PRZYJECIA                                               */
/* ------------------------------------------------------------------ */

type TxInput = {
  askId: string;
  answerId: string;
  author: string;
  payee: string;
  hash: string;
  /** Pasujace logi Transfer (od autora, do odpowiadajacego, >= stawka). */
  candidates: TransferLike[];
  perAnswer: number;
  planned: PlannedLegacy[];
  /** Warunki escrow z lancucha - tylko do adopcji Aska bez stanu. */
  escrow: SealedEscrow | null;
  adoptedExpiry: ExpiryProof | null;
};

type TxOutcome =
  | { kind: 'already'; record: AcceptanceRecord; acceptedCount: number; seats: number; status: AskStatus }
  /** Nasze przyjecie odrzucone; stare przyjecia zwiazane po drodze zostaly zapisane. */
  | { kind: 'refused'; error: AskError }
  | {
      kind: 'recorded';
      record: AcceptanceRecord;
      acceptedCount: number;
      seats: number;
      status: AskStatus;
      autoResolved: boolean;
    };

/**
 * Wszystkie odczyty najpierw (wymog Firestore), potem decyzje i zapisy.
 * Odczyty w transakcji blokuja dokumenty, wiec rownolegle przyjecie na tym
 * samym Asku (oba pisza asks/{id}) zostanie powtorzone i zobaczy nasz rekord -
 * dwa zadania nie zajma jednego ostatniego miejsca.
 */
async function acceptInTransaction(tx: Transaction, store: AskStore, input: TxInput): Promise<TxOutcome> {
  const { askId, answerId } = input;

  const ownRegistryIds = input.candidates.map((c) => payoutRegistryId(TRANSFER_CHAIN_ID, input.hash, c.logIndex));
  const legacyReads = legacyReadRefs(store, input.planned);
  const registryIds = Array.from(new Set([...ownRegistryIds, ...legacyReads.registryIds]));

  const snaps = await tx.getAll(
    askRef(store, askId),
    stateRef(store, askId),
    answerRef(store, answerId),
    acceptanceRef(store, askId, answerId),
    ...legacyReads.acceptanceRefs,
    ...registryIds.map((id) => payoutRef(store, id))
  );
  const accepted = await readAcceptances(store, askId, tx);

  const [askSnap, stateSnap, answerSnap, ownSnap] = snaps;
  const legacySnaps = snaps.slice(4, 4 + input.planned.length);
  const registrySnaps = snaps.slice(4 + input.planned.length);

  // Ponowne sprawdzenie Aska - miedzy odczytem a transakcja mogl zostac
  // rozstrzygniety albo zapieczetowany przez inne zadanie.
  const bundle = askBundleFromSnapshots(store, askId, askSnap, stateSnap);
  const view = usableView(bundle);
  const pub = requirePub(bundle);
  if (lowerAddress(view.author) !== input.author) {
    throw new AskError('not_ask_author', 403, 'Only the author of this Ask can accept an answer.');
  }

  const answerRaw = snapData(answerSnap);
  if (!answerRaw || answerRaw.askId !== askId || lowerAddress(answerRaw.author) !== input.payee) {
    throw new AskError('answer_not_found', 404, 'Answer not found on this Ask');
  }

  const own = readAcceptance(store.keys, askId, answerId, snapData(ownSnap));
  if (own.kind === 'invalid' || accepted.invalid.length > 0) throw sealInvalid();
  if (own.kind === 'valid') {
    // Rownolegle ponowienie zdazylo pierwsze.
    if (own.value.txHash !== input.hash) throw alreadyAccepted(own.value.txHash);
    return {
      kind: 'already',
      record: own.value,
      acceptedCount: accepted.valid.size,
      seats: view.seats,
      status: view.status,
    };
  }
  if (isResolvedForRefusal(bundle)) throw new AskError('ask_resolved', 409, 'This Ask is already resolved.');

  // Rejestr: niewazny wpis -> 503 (nigdy nie nadpisujemy), wazny -> log zajety.
  const registry = readRegistryState(store, registryIds, registrySnaps);
  const legacy = bindLegacy(store, input.planned, legacySnaps, registry);

  // Nasz log. Wpis rejestru nalezacy juz do TEJ odpowiedzi (bez rekordu - np.
  // rekord skasowal skrypt admina) bierzemy ponownie, zamiast odmawiac.
  const ownedLog = findOwnedLog(registry, TRANSFER_CHAIN_ID, input.hash, input.candidates, askId, answerId);
  const picked = ownedLog ?? pickTransfer(input.candidates, usedFor(registry, TRANSFER_CHAIN_ID, input.hash));

  // Miejsca WYLACZNIE z rekordow i ze starych przyjec zwiazanych na lancuchu.
  const legacyHere = legacy.bound.filter((b) => b.planned.askId === askId).map((b) => b.planned.row.id);
  const taken = countTakenSeats(accepted.valid.keys(), legacyHere, answerId);
  const base = bundle.state ?? adoptState(askId, pub, input.escrow, input.adoptedExpiry);

  // Odmowa NASZEGO przyjecia nie kasuje prawdy ustalonej po drodze: stare
  // przyjecia zwiazane na lancuchu zapisujemy mimo to (commit), a odmowe
  // zwracamy dopiero po transakcji. Throw tutaj wycofalby tez je.
  if (!picked || taken >= base.seats) {
    writeLegacy(tx, store, legacy.bound);
    return {
      kind: 'refused',
      error: picked
        ? new AskError('no_seats_left', 409, `All ${base.seats} seats on this Ask are taken.`, {
            acceptedCount: taken,
            seats: base.seats,
          })
        : new AskError(
            'payout_already_used',
            409,
            'This transfer was already recorded as the payout for another answer. Each transfer can pay for one answer only.'
          ),
    };
  }

  const acceptedCount = taken + 1;
  const autoResolved = base.status === 'open' && isAutoFull(acceptedCount, base.seats, base.funding);
  const next: SealedAskState = autoResolved
    ? { ...base, status: 'resolved', resolvedAt: Date.now(), resolveKind: 'auto-full' }
    : base;

  /* ----- zapisy ----- */

  writeLegacy(tx, store, legacy.bound);

  const record = transferAcceptance({
    askId,
    answerId,
    payee: input.payee,
    from: input.author,
    txHash: input.hash,
    logIndex: picked.logIndex,
    units: picked.value,
  });
  recordAcceptance(tx, store, record, input.perAnswer, { createPayout: !ownedLog });

  if (!bundle.state || next.status !== bundle.state.status) putState(tx, store, next);
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

/**
 * Odpowiedz z juz zapisanego rekordu tej odpowiedzi: ten sam hash -> 200
 * alreadyRecorded (bez drugiego powiadomienia), inny hash -> 409
 * already_accepted, niewazna pieczec -> 503. null = rekordu nie ma.
 */
async function ownRecordResponse(
  store: AskStore,
  view: AskView,
  input: { askId: string; answerId: string; hash: string }
): Promise<NextResponse | null> {
  const snap = await acceptanceRef(store, input.askId, input.answerId).get();
  const own = readAcceptance(store.keys, input.askId, input.answerId, snapData(snap));
  if (own.kind === 'absent') return null;
  if (own.kind === 'invalid') throw sealInvalid();
  if (own.value.txHash !== input.hash) throw alreadyAccepted(own.value.txHash);
  const accepted = await readAcceptances(store, input.askId);
  if (accepted.invalid.length > 0) throw sealInvalid();
  return acceptedResponse({
    askId: input.askId,
    answerId: input.answerId,
    record: own.value,
    perAnswer: view.perAnswer,
    acceptedCount: accepted.valid.size,
    seats: view.seats,
    status: view.status,
    alreadyRecorded: true,
  });
}

/** Stan adoptowanego Aska: zamrozone pola + escrow z lancucha + udowodnione wygasniecie. */
function adoptState(
  askId: string,
  pub: Record<string, any>,
  escrow: SealedEscrow | null,
  expiry: ExpiryProof | null
): SealedAskState {
  const adopted = adoptLegacyState(askId, pub, 'adopted', escrow);
  if (!expiry || adopted.funding !== 'escrowed') return adopted;
  return { ...adopted, status: 'expired', expiredTxHash: expiry.txHash, expiredLogIndex: expiry.logIndex };
}

/* ------------------------------------------------------------------ */
/*  ESCROW                                                             */
/* ------------------------------------------------------------------ */

/**
 * Warunki escrow: ze stanu albo - dla Aska bez stanu - z escrowFor na lancuchu.
 * pub.escrowTxHash nie jest dowodem (regula update go nie zamraza).
 */
async function escrowTermsFor(
  bundle: AskBundle,
  view: AskView,
  pub: Record<string, any>,
  author: string,
  askId: string
): Promise<SealedEscrow | null> {
  if (view.funding !== 'escrowed') return null;
  if (bundle.state) return bundle.state.escrow;

  let proof;
  try {
    proof = await proveLegacyEscrow(pub, author, askId);
  } catch (error) {
    // "Nie udalo sie sprawdzic" nie moze wygladac jak "nie sfinansowano".
    console.error('[api/asks/accept] Odczyt escrowFor nie powiodl sie:', error);
    throw chainUnavailable();
  }
  if (!proof.funded) {
    throw new AskError(
      'escrow_unverified',
      409,
      'This Ask says its budget is escrowed, but the escrow contract has no deposit for it.'
    );
  }
  if (proof.anomalies.length > 0) {
    console.warn(`[api/asks/accept] Ask ${askId}: dokument rozjezdza sie z escrow na lancuchu: ${proof.anomalies.join(', ')}`);
  }
  return proof.escrow;
}

/**
 * Czy wolno zapisac przelew bezposredni na Asku escrow. Kontrakt odrzuca
 * resolve, gdy block.timestamp > deadline + RESOLVE_GRACE (ostra nierownosc),
 * wiec liczymy tak samo, od terminu z LANCUCHA (escrow.deadlineSec).
 */
function directPayoutAllowed(state: SealedAskState | null, escrow: SealedEscrow, now: number): boolean {
  if (state?.status === 'expired') return true;
  const deadlineSec = Number(escrow.deadlineSec);
  return Number.isFinite(deadlineSec) && now > deadlineSec * 1000 + RESOLVE_GRACE_MS;
}

type ExpiryProof = { txHash: string; logIndex: number };

/**
 * Wygasniecie escrow Aska bez stanu - tylko gdy pub.expiredTxHash ma log
 * AskExpired z kluczem TEGO Aska. Sam hash z lustra niczego nie dowodzi.
 */
async function provenLegacyExpiry(
  pub: Record<string, any>,
  author: string,
  askId: string,
  escrow: SealedEscrow
): Promise<ExpiryProof | null> {
  const claimed = lowerTxHash(pub.expiredTxHash);
  if (!claimed) return null;
  const receipt = await readEscrowReceipt(claimed);
  if (!receipt.ok) {
    if (receipt.code === 'rpc_error') throw chainUnavailable();
    return null;
  }
  const event = findAskExpired(receipt.logs, { contract: escrow.contract, key: escrowKeyFor(author, askId) });
  return event ? { txHash: receipt.txHash, logIndex: event.logIndex } : null;
}

/* ------------------------------------------------------------------ */
/*  STARE PRZYJECIA (sprzed rekordow i rejestru)                       */
/* ------------------------------------------------------------------ */

/** Stare przyjecie zwiazane na lancuchu, do zapisania jako rekord w transakcji. */
type PlannedLegacy = {
  askId: string;
  row: AnswerRow;
  kind: 'transfer' | 'escrow-seat';
  chainId: number;
  txHash: string;
  payee: string;
  /** Autor Aska (transfer) albo adres kontraktu escrow (escrow-seat). */
  from: string;
  /** Logi, ktore moga byc ta wyplata. Dla escrow-seat - jeden SeatAwarded. */
  candidates: TransferLike[];
  /** Stawka Aska - do lustra odpowiedzi. */
  payoutAmount: number;
};

type BoundLegacy = { planned: PlannedLegacy; record: AcceptanceRecord; createPayout: boolean };

function planFromVerdict(
  askId: string,
  row: AnswerRow,
  verdict: LegacyVerdict,
  perAnswerUnits: bigint
): PlannedLegacy | null {
  const payoutAmount = unitsToUsdc(perAnswerUnits);
  if (verdict.kind === 'transfer') {
    return {
      askId,
      row,
      kind: 'transfer',
      chainId: TRANSFER_CHAIN_ID,
      txHash: verdict.txHash,
      payee: verdict.payee,
      from: verdict.from,
      candidates: verdict.candidates,
      payoutAmount,
    };
  }
  if (verdict.kind === 'escrow-seat') {
    return {
      askId,
      row,
      kind: 'escrow-seat',
      chainId: verdict.chainId,
      txHash: verdict.txHash,
      payee: verdict.payee,
      from: verdict.contract,
      candidates: [
        { logIndex: verdict.award.logIndex, from: verdict.contract, to: verdict.payee, value: verdict.award.amount },
      ],
      payoutAmount,
    };
  }
  // 'weak' i 'forged' nie zajmuja miejsca ani logu. 'weak' NIGDY nie resetujemy
  // automatycznie - decyzja nalezy do wlasciciela (reseal, trustWeak).
  return null;
}

/**
 * (7) Inne odpowiedzi z TYM hashem w lustrze, oznaczone jako przyjete, bez
 * rekordu. Kazda sprawdzamy w kontekscie JEJ Aska (autor, stawka).
 */
async function legacyUsesOfHash(
  store: AskStore,
  input: { askId: string; answerId: string; hash: string; rawHash: string; ctx: LegacyAcceptanceContext }
): Promise<PlannedLegacy[]> {
  // Stara trasa zapisywala hash z oryginalna wielkoscia liter (tylko trim).
  // Szukamy tez formy wielkimi literami, zeby stare przyjecie zapisane jako
  // 0xAB... nie umknelo i ten sam log nie zaplacil drugi raz.
  const upper = input.hash.startsWith('0x') ? `0x${input.hash.slice(2).toUpperCase()}` : '';
  const values = Array.from(new Set([input.hash, input.rawHash, upper].filter((value) => value !== '')));
  const snap = await store.db
    .collection(ASK_ANSWERS_COLLECTION)
    .where('payoutTxHash', 'in', values)
    .limit(SAME_HASH_SCAN_LIMIT)
    .get();

  const rows: AnswerRow[] = [];
  for (const doc of snap.docs) {
    if (doc.id === input.answerId) continue; // te odpowiedz zapisuje to zadanie
    const row = answerRowFromSnapshot(doc);
    // Id spoza isDocId nie przejda przez zadna trase - nie ma ich jak zapisac.
    if (row.raw.accepted !== true || !isDocId(doc.id) || !isDocId(row.raw.askId)) continue;
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const contexts = new Map<string, Promise<LegacyAcceptanceContext | null>>();
  contexts.set(input.askId, Promise.resolve(input.ctx));

  const planned = await mapLimit(rows, RPC_CONCURRENCY, async (row) => {
    const rowAskId = row.raw.askId as string;
    const recSnap = await acceptanceRef(store, rowAskId, row.id).get();
    const rec = readAcceptance(store.keys, rowAskId, row.id, snapData(recSnap));
    // Niewazny rekord: nie wiemy, czy zuzyl nasz log - i nie wolno go nadpisac.
    if (rec.kind === 'invalid') throw sealInvalid();
    if (rec.kind === 'valid') return null; // jego wpis rejestru przeczyta transakcja
    const ctx = await contextFor(store, contexts, rowAskId);
    if (!ctx) return null;
    const verdict = await verifyLegacyAcceptance(ctx, row);
    if (verdict.kind === 'unknown') throw chainUnavailable();
    return planFromVerdict(rowAskId, row, verdict, ctx.perAnswerUnits);
  });
  return planned.filter((p): p is PlannedLegacy => p !== null);
}

/**
 * Kontekst weryfikacji innego Aska. Escrow tylko ze stanu: dla Aska bez stanu
 * liczy sie tu dowod przelewu (stawka z zamrozonych budzetu i miejsc), a nie
 * SeatAwarded - to oszczedza escrowFor na kazdy cudzy Ask.
 */
function contextFor(
  store: AskStore,
  cache: Map<string, Promise<LegacyAcceptanceContext | null>>,
  askId: string
): Promise<LegacyAcceptanceContext | null> {
  const cached = cache.get(askId);
  if (cached) return cached;
  const pending = (async () => {
    const bundle = await readAskBundle(store, askId);
    if (!bundle.exists || !bundle.view) return null;
    // Zepsuta pieczec cudzego Aska: nie umiemy powiedziec, ktory log zuzyl.
    if (bundle.view.trust === 'broken') throw sealInvalid();
    try {
      return legacyContext(askId, bundle.view, bundle.view.escrow, store.legacyCutoffMs);
    } catch (error) {
      if (error instanceof AskError) return null; // Ask bez stawki nie ma czym zajac logu
      throw error;
    }
  })();
  cache.set(askId, pending);
  return pending;
}

/**
 * Adopcja: wszystkie odpowiedzi TEGO Aska oznaczone jako przyjete, bez rekordu,
 * poza te, ktora wlasnie przyjmujemy i tymi juz zaplanowanymi.
 */
async function legacyAcceptancesOnAsk(
  store: AskStore,
  askId: string,
  answerId: string,
  ctx: LegacyAcceptanceContext,
  already: PlannedLegacy[]
): Promise<PlannedLegacy[]> {
  const [rows, accepted] = await Promise.all([readAnswerRows(store, askId), readAcceptances(store, askId)]);
  if (accepted.invalid.length > 0) throw sealInvalid();
  const skip = new Set(already.map((p) => p.row.id));
  const pending = rows.filter(
    (row) => row.id !== answerId && row.raw.accepted === true && !accepted.valid.has(row.id) && !skip.has(row.id)
  );
  if (pending.length === 0) return [];

  const verdicts = await mapLimit(pending, RPC_CONCURRENCY, (row) => verifyLegacyAcceptance(ctx, row));
  const out: PlannedLegacy[] = [];
  const review: string[] = [];
  verdicts.forEach((verdict, index) => {
    if (verdict.kind === 'unknown') throw chainUnavailable();
    if (verdict.kind === 'weak') review.push(pending[index].id);
    const planned = planFromVerdict(askId, pending[index], verdict, ctx.perAnswerUnits);
    if (planned) out.push(planned);
  });
  if (review.length > 0) {
    console.warn(
      `[api/asks/accept] Ask ${askId}: przyjecia 'weak' bez decyzji wlasciciela (${review.join(', ')}). ` +
        'Nie licza sie jako zajete miejsca; reseal (trustWeak) moze je zapieczetowac.'
    );
  }
  return out;
}

/** Referencje do odczytu w transakcji dla zaplanowanych starych przyjec. */
function legacyReadRefs(store: AskStore, planned: PlannedLegacy[]) {
  return {
    acceptanceRefs: planned.map((p) => acceptanceRef(store, p.askId, p.row.id)),
    registryIds: planned.flatMap((p) => p.candidates.map((c) => payoutRegistryId(p.chainId, p.txHash, c.logIndex))),
  };
}

/**
 * Przypisanie logow starym przyjeciom - od najstarszej odpowiedzi, bo stare
 * przyjecia wydarzyly sie wczesniej niz to, ktore teraz zapisujemy.
 * Rekord juz wazny -> pomijamy; niewazny -> 503 (nigdy nie nadpisujemy).
 */
function bindLegacy(
  store: AskStore,
  planned: PlannedLegacy[],
  snaps: DocumentSnapshot[],
  registry: RegistryState
): { bound: BoundLegacy[]; alreadyRecorded: number } {
  const order = planned
    .map((p, index) => ({ p, snap: snaps[index] }))
    .sort((a, b) => a.p.row.createTimeMs - b.p.row.createTimeMs || a.p.row.id.localeCompare(b.p.row.id));

  const bound: BoundLegacy[] = [];
  let alreadyRecorded = 0;
  for (const { p, snap } of order) {
    const check = readAcceptance(store.keys, p.askId, p.row.id, snapData(snap));
    if (check.kind === 'invalid') throw sealInvalid();
    if (check.kind === 'valid') {
      alreadyRecorded += 1;
      continue;
    }
    const owned = findOwnedLog(registry, p.chainId, p.txHash, p.candidates, p.askId, p.row.id);
    const pick = owned ?? pickTransfer(p.candidates, usedFor(registry, p.chainId, p.txHash));
    if (!pick) {
      // Wszystkie pasujace logi zuzyte przez inne odpowiedzi - to przyjecie nie
      // ma wlasnej wyplaty i nie zajmuje miejsca.
      console.warn(`[api/asks/accept] Stare przyjecie ${p.askId}/${p.row.id}: brak wolnego logu w ${p.txHash}.`);
      continue;
    }
    usedFor(registry, p.chainId, p.txHash).add(pick.logIndex);
    bound.push({ planned: p, record: legacyRecord(p, pick.logIndex, pick.value), createPayout: !owned });
  }
  return { bound, alreadyRecorded };
}

function legacyRecord(p: PlannedLegacy, logIndex: number, units: bigint): AcceptanceRecord {
  const common = { askId: p.askId, answerId: p.row.id, payee: p.payee, txHash: p.txHash, logIndex, units };
  return p.kind === 'transfer'
    ? transferAcceptance({ ...common, from: p.from })
    : escrowSeatAcceptance({ ...common, contract: p.from, chainId: p.chainId });
}

/**
 * Zapis zwiazanych starych przyjec: wpis rejestru + rekord + naprawa lustra.
 * Lustro bez acceptedAt - zostaje chwila prawdziwego przyjecia, a kwota,
 * token i siec wracaja do prawdy (mogly byc podrobione przy fladze accepted).
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

/** (4b) Samo zapisanie starych przyjec, bez nowej wyplaty. Zwraca, ile jest juz zapisanych. */
async function commitLegacyOnly(store: AskStore, planned: PlannedLegacy[]): Promise<number> {
  const reads = legacyReadRefs(store, planned);
  try {
    return await store.db.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...reads.acceptanceRefs, ...reads.registryIds.map((id) => payoutRef(store, id)));
      const registry = readRegistryState(store, reads.registryIds, snaps.slice(planned.length));
      const { bound, alreadyRecorded } = bindLegacy(store, planned, snaps.slice(0, planned.length), registry);
      writeLegacy(tx, store, bound);
      return bound.length + alreadyRecorded;
    });
  } catch (error) {
    if (error instanceof AskError) throw error;
    console.error('[api/asks/accept] Zapis starego przyjecia nie powiodl sie:', error);
    throw new AskError(
      'accept_write_failed',
      500,
      'Could not record the earlier payout of this answer. Nothing was changed - retry in a moment.'
    );
  }
}

/* ------------------------------------------------------------------ */
/*  REJESTR WYPLAT                                                     */
/* ------------------------------------------------------------------ */

type RegistryState = {
  checks: Map<string, SealCheck<PayoutRegistryEntry>>;
  /** `${chainId}:${txHash}` -> zajete logIndex. */
  used: Map<string, Set<number>>;
};

function readRegistryState(store: AskStore, ids: string[], snaps: DocumentSnapshot[]): RegistryState {
  const checks = new Map<string, SealCheck<PayoutRegistryEntry>>();
  const used = new Map<string, Set<number>>();
  ids.forEach((id, index) => {
    const check = readRegistry(store.keys, id, snapData(snaps[index]));
    if (check.kind === 'invalid') {
      console.error(`[api/asks/accept] ALARM: niewazny wpis rejestru wyplat ${id} (${check.reason}).`);
      throw sealInvalid();
    }
    checks.set(id, check);
    if (check.kind === 'valid') {
      const key = `${check.value.chainId}:${check.value.txHash}`;
      const set = used.get(key) ?? new Set<number>();
      set.add(check.value.logIndex);
      used.set(key, set);
    }
  });
  return { checks, used };
}

function usedFor(registry: RegistryState, chainId: number, txHash: string): Set<number> {
  const key = `${chainId}:${txHash.toLowerCase()}`;
  let set = registry.used.get(key);
  if (!set) {
    set = new Set<number>();
    registry.used.set(key, set);
  }
  return set;
}

/** Log, ktorego wazny wpis rejestru nalezy juz do tej odpowiedzi (ponowienie). */
function findOwnedLog<T extends TransferLike>(
  registry: RegistryState,
  chainId: number,
  txHash: string,
  candidates: readonly T[],
  askId: string,
  answerId: string
): T | null {
  for (const candidate of candidates) {
    const check = registry.checks.get(payoutRegistryId(chainId, txHash, candidate.logIndex));
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

function acceptedResponse(input: {
  askId: string;
  answerId: string;
  record: AcceptanceRecord;
  perAnswer: number;
  acceptedCount: number;
  seats: number;
  status: AskStatus;
  alreadyRecorded?: boolean;
  autoResolved?: boolean;
}): NextResponse {
  return NextResponse.json(
    {
      askId: input.askId,
      answerId: input.answerId,
      accepted: true,
      payoutTxHash: input.record.txHash,
      payoutLogIndex: input.record.logIndex,
      payoutAmount: input.perAnswer,
      payoutToken: 'USDC',
      payoutNetwork: 'base',
      // Nadawca, odbiorca, kwota, czas i log sprawdzone na lancuchu.
      verification: 'strict',
      acceptedCount: input.acceptedCount,
      seats: input.seats,
      status: input.status,
      ...(input.alreadyRecorded ? { alreadyRecorded: true } : {}),
      ...(input.autoResolved ? { autoResolved: true } : {}),
    },
    { headers: NO_STORE_PRIVATE }
  );
}

/**
 * Czy odmowic, bo Ask jest juz rozstrzygniety. Ze stanu, gdy jest. Dla Aska
 * bez stanu - z lustra, NIEZALEZNIE od ASK_SEALS_ENFORCED ('unverified' ma
 * status wymuszony na 'open'): to wylacznie ODMOWA (co najwyzej DoS, nigdy
 * zapis), a bez niej adopcja zapieczetowalaby prawdziwie rozstrzygniety stary
 * Ask jako 'open'. Czy stare 'resolved' bylo prawdziwe, rozstrzyga reseal.
 */
function isResolvedForRefusal(bundle: AskBundle): boolean {
  if (bundle.state) return bundle.state.status === 'resolved';
  return bundle.pub?.status === 'resolved';
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
  return new AskError(
    'chain_unavailable',
    503,
    'Could not read Base right now. Nothing was recorded - retry with the same transaction hash.'
  );
}

function alreadyAccepted(payoutTxHash: string, extra: Record<string, unknown> = {}): AskError {
  return new AskError('already_accepted', 409, 'This answer is already accepted.', { payoutTxHash, ...extra });
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
