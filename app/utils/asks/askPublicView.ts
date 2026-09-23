import { toAnswerMeta } from './askMapping';
import {
  lowerAddress,
  type AcceptanceRecord,
  type AskTrust,
  type AskView,
  type SealedEscrow,
} from './askSealCore';
import type { Ask, AskStatus } from './types';

/**
 * CO WOLNO POKAZAC O ASKU - czysta logika wyswietlania, bez Firestore.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Trzy miejsca mowia o Asku na zewnatrz, zanim ktokolwiek otworzy aplikacje:
 *   - GET /api/asks/[id]/answers   - kto widzi tresci i ktore odpowiedzi sa
 *                                     "przyjete",
 *   - GET /api/asks                - lista dla agentow,
 *   - /ask/[id]                    - strona udostepniania i jej metadane
 *                                     (crawlery, podglady linkow).
 * Kazde z nich bralo status, "accepted" i escrow wprost z dokumentow, ktore
 * dzis zapisuje kazda przegladarka. Podrobiony `status: 'resolved'` odslanial
 * wszystkie zapieczetowane odpowiedzi, a podrobione `funding: 'escrowed'`
 * z dowolnym hashem dawalo publiczne zdanie "budzet lezy w escrow" z linkiem.
 *
 * Tu zapada decyzja, co z tego jest PRAWDA (pieczec, rekord przyjecia), co
 * jest dzisiejsza semantyka Aska sprzed pieczeci ('legacy', do resealu), a co
 * trzeba powiedziec neutralnie. Trasy i strona tylko czytaja dane i skladaja
 * odpowiedz - dzieki temu mocha testuje decyzje bez Firebase
 * (test/asksPublicView.test.ts).
 *
 * Plik nie importuje 'server-only' ani SDK. askSealCore ciagnie node:crypto,
 * wiec to i tak modul serwerowy (trasy i komponent serwerowy strony).
 */

/**
 * AskTrust z askSealCore plus 'unchecked': magazyn pieczeci jest na tym
 * wdrozeniu niedostepny (brak konta uslugowego albo awaria odczytu), wiec
 * pokazujemy tylko to, co mowi dokument, i mowimy to neutralnie.
 */
export type PublicAskTrust = AskTrust | 'unchecked';

const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/* ------------------------------------------------------------------ */
/*  KWOTY                                                              */
/* ------------------------------------------------------------------ */

/**
 * Kwota Aska dla komponentu serwerowego. Kopia formatAskMoney z
 * app/basechat/components/AskCard.tsx - 1:1, bo te same kwoty widac w feedzie.
 *
 * Kopia, a nie import: AskCard.tsx ma 'use client', a eksport modulu
 * klienckiego zaimportowany do komponentu serwerowego jest REFERENCJA
 * KLIENTA, nie funkcja. /ask/[id] i jego generateMetadata wywracaly sie na
 * tym 500 ("formatAskMoney is not a function") - zmierzone 2026-09-23 na
 * serwerze deweloperskim.
 */
export function formatShareMoney(amount: number, token = 'USDC'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return token === 'USDC' || token === 'USD' ? `$${value.toFixed(2)}` : `${value.toFixed(2)} ${token}`;
}

/* ------------------------------------------------------------------ */
/*  ODPOWIEDZI: KTO WIDZI TRESC I CO JEST "PRZYJETE"                   */
/* ------------------------------------------------------------------ */

/**
 * Czy wsrod waznych rekordow przyjec jest wyplata dla kogos innego niz autor
 * Aska. Tylko ona robi z "resolved" rozstrzygniecie, za ktore ktos dostal
 * pieniadze.
 */
export function hasPaidAnswer(records: Iterable<Pick<AcceptanceRecord, 'payee'>>, askAuthor: unknown): boolean {
  const author = lowerAddress(askAuthor);
  for (const record of records) {
    if (author === null || lowerAddress(record.payee) !== author) return true;
  }
  return false;
}

/**
 * Czy Ask jest rozstrzygniety na tyle, zeby odslonic WSZYSTKIE tresci.
 *
 * - sealed     - zapieczetowany stan 'resolved' ORAZ co najmniej jeden wazny
 *                rekord wyplaty dla kogos innego niz autor. Podrobiony status
 *                w dokumencie nie odslania niczego, z flaga czy bez. Warunek
 *                wyplaty zamyka darmowa droge przez escrow: resolve() na
 *                lancuchu z nagrodami dla wlasnych portfeli autora daje
 *                AskResolved bez zadnej dopasowanej odpowiedzi - bez tego
 *                warunku odslanialby wszystko, nikomu nie placac (trasa
 *                on-resolve odmawia tego samego jako nothing_accepted).
 * - legacy     - Ask sprzed pieczeci przy wylaczonej fladze: dzisiejsza
 *                semantyka (status z dokumentu) az do resealu. To jest
 *                swiadome ryzyko rezydualne nr 2 z planu - okno ma trwac minuty.
 * - unverified - flaga wlaczona, pieczeci brak: nie odslaniamy.
 * - broken     - trasa odpowiada 503, zanim tu dojdzie; tu i tak false.
 */
export function revealsAllAnswers(view: AskView, acceptances: ReadonlyMap<string, AcceptanceRecord>): boolean {
  if (view.trust === 'sealed') {
    return view.state !== null && view.state.status === 'resolved' && hasPaidAnswer(acceptances.values(), view.state.author);
  }
  if (view.trust === 'legacy') return view.status === 'resolved';
  return false;
}

export type AnswerPayoutFacts = {
  accepted: boolean;
  payoutTxHash: string | null;
  payoutLogIndex: number | null;
  /**
   * true WYLACZNIE z waznego rekordu przyjecia (HMAC, sciezka zamknieta
   * regulami). false przy Asku 'legacy' znaczy "tak mowi dokument odpowiedzi".
   */
  payoutVerified: boolean;
};

const NOT_ACCEPTED: AnswerPayoutFacts = {
  accepted: false,
  payoutTxHash: null,
  payoutLogIndex: null,
  payoutVerified: false,
};

/**
 * Przyjecie jednej odpowiedzi do wyswietlenia.
 *
 * Wazny rekord wygrywa zawsze - to prawda zapisana przez serwer po dowodzie
 * z lancucha, niezaleznie od tego, jak ufamy samemu Askowi. Bez rekordu:
 * - 'legacy'  - pola odpowiedzi jak dzis (accepted, payoutTxHash),
 * - reszta    - nieprzyjeta. Flaga `accepted` przestawiona z devtools przy
 *               Asku zapieczetowanym NIE pokazuje sie jako przyjeta.
 */
export function answerPayoutFacts(
  trust: AskTrust,
  raw: Record<string, any>,
  record: AcceptanceRecord | undefined
): AnswerPayoutFacts {
  if (record) {
    return { accepted: true, payoutTxHash: record.txHash, payoutLogIndex: record.logIndex, payoutVerified: true };
  }
  if (trust === 'legacy') {
    return {
      // Boolean(...) jak w toAnswerMeta - dokladnie dzisiejsza odpowiedz trasy.
      accepted: Boolean(raw.accepted),
      payoutTxHash: typeof raw.payoutTxHash === 'string' ? raw.payoutTxHash : null,
      payoutLogIndex: isIndex(raw.payoutLogIndex) ? raw.payoutLogIndex : null,
      payoutVerified: false,
    };
  }
  return NOT_ACCEPTED;
}

/** Wiersz odpowiedzi z askStore.readAnswerRows (wystarcza id i surowe pola). */
export type ThreadRowInput = { id: string; raw: Record<string, any> };

export type ThreadAnswerPlan = AnswerPayoutFacts & {
  id: string;
  askId: string;
  author: string;
  createdAt: number;
  /** Czy TEN pytajacy moze dostac tresc. */
  visible: boolean;
};

export type AnswerThreadPlan = {
  status: AskStatus;
  resolved: boolean;
  viewerIsAuthor: boolean;
  trust: AskTrust;
  answers: ThreadAnswerPlan[];
};

/**
 * Plan odpowiedzi dla GET /api/asks/[id]/answers: metadane kazdej odpowiedzi
 * i decyzja, ktore tresci wolno wydac temu pytajacemu.
 *
 * Trzy drogi do tresci i ani jednej wiecej:
 *   1. Ask rozstrzygniety (revealsAllAnswers),
 *   2. pytajacy jest autorem Aska - autor ze STANU, gdy Ask jest zapieczetowany,
 *      inaczej z pola dokumentu, ktore regula update zamraza,
 *   3. pytajacy pyta o WLASNA odpowiedz - autor odpowiedzi z dokumentu, ktory
 *      tworzy wylacznie admin i ktorego pola author regula nie pozwala zmienic.
 *
 * `viewer` MUSI pochodzic z podpisanej sesji SIWE - adres z zapytania nie jest
 * tozsamoscia.
 */
export function planAnswerThread(input: {
  askId: string;
  view: AskView;
  rows: readonly ThreadRowInput[];
  acceptances: ReadonlyMap<string, AcceptanceRecord>;
  viewer: string | null;
}): AnswerThreadPlan {
  const { askId, view } = input;
  const viewer = lowerAddress(input.viewer);
  const askAuthor = lowerAddress(view.author);
  const viewerIsAuthor = viewer !== null && askAuthor !== null && viewer === askAuthor;
  const resolved = revealsAllAnswers(view, input.acceptances);

  const answers = input.rows.map((row): ThreadAnswerPlan => {
    const meta = toAnswerMeta(row.id, row.raw);
    const ownAnswer = viewer !== null && lowerAddress(meta.author) === viewer;
    return {
      id: row.id,
      askId,
      author: meta.author,
      createdAt: meta.createdAt,
      ...answerPayoutFacts(view.trust, row.raw, input.acceptances.get(row.id)),
      visible: resolved || viewerIsAuthor || ownAnswer,
    };
  });

  return { status: view.status, resolved, viewerIsAuthor, trust: view.trust, answers };
}

/* ------------------------------------------------------------------ */
/*  POLA PUBLICZNE: LISTA DLA AGENTOW I STRONA UDOSTEPNIANIA           */
/* ------------------------------------------------------------------ */

/**
 * Ask w ksztalcie publicznym. Escrow (hash depozytu, siec, hash resolve)
 * WYLACZNIE z warunkow zapieczetowanych (`escrow` z widoku) - bez nich te pola
 * sa null, nawet gdy dokument niesie jakis hash: przegladarka moze dzis
 * wpisac tam cokolwiek o dlugosci 66 znakow.
 *
 * token/network zawsze USDC na Base: kazdy Ask w tej aplikacji jest w USDC na
 * Base (rowniez te oplacone przez x402 w USDG), a pola w dokumencie da sie
 * dzis przestawic z przegladarki (patrz mirrorAsk w askStore.ts).
 */
function publicAsk(ask: Ask, escrow: SealedEscrow | null, acceptedCount = ask.acceptedCount): Ask {
  return {
    id: ask.id,
    author: ask.author,
    question: ask.question,
    budget: ask.budget,
    seats: ask.seats,
    perAnswer: ask.perAnswer,
    token: 'USDC',
    network: 'base',
    deadline: ask.deadline,
    createdAt: ask.createdAt,
    status: ask.status,
    funding: ask.funding,
    answerCount: ask.answerCount,
    acceptedCount,
    ...(ask.resolvedAt !== undefined ? { resolvedAt: ask.resolvedAt } : {}),
    escrowTxHash: escrow ? escrow.fundTxHash : null,
    escrowChainId: escrow ? escrow.chainId : null,
    escrowResolveTxHash: escrow ? ask.escrowResolveTxHash ?? null : null,
  };
}

/** Pozycja listy GET /api/asks: dotychczasowy ksztalt Aska plus dwa pola. */
export type ListedAsk = Ask & {
  trust: PublicAskTrust;
  /** true tylko, gdy warunki escrow pochodza z pieczeci (dowod z lancucha). */
  escrowVerified: boolean;
};

/**
 * Pozycja listy otwartych Askow albo null, gdy Aska nie wolno na niej pokazac:
 * - 'broken'     - pieczec niewazna, trasy Aska odpowiadaja 503,
 * - 'unverified' - flaga wlaczona, pieczeci brak: Ask nie przyjmuje odpowiedzi,
 * - status z widoku != 'open' - np. pieczec mowi 'resolved', a lustro 'open'.
 *
 * Zapytanie listy filtruje po `status` lustra, wiec Ask z podrobionym
 * statusem zamknietym i tak z niej wypadnie - to tylko ukrycie (DoS
 * wyswietlania), nie falszywe zdanie. Pieczeci nie da sie tu przeszukac bez
 * indeksu grupy kolekcji.
 */
export function listingEntry(view: AskView): ListedAsk | null {
  if (view.trust === 'broken' || view.trust === 'unverified') return null;
  if (view.status !== 'open') return null;
  return { ...publicAsk(view, view.escrow), trust: view.trust, escrowVerified: view.escrow !== null };
}

/** Pozycja listy, gdy magazyn pieczeci jest niedostepny: nic nie jest "zweryfikowane". */
export function uncheckedListingEntry(ask: Ask): ListedAsk {
  return { ...publicAsk(ask, null), trust: 'unchecked', escrowVerified: false };
}

/* ------------------------------------------------------------------ */
/*  STRONA UDOSTEPNIANIA /ask/[id]                                     */
/* ------------------------------------------------------------------ */

export type AskShare = {
  /** Pola do wyswietlenia; escrow* tylko z pieczeci (patrz publicAsk). */
  ask: Ask;
  trust: PublicAskTrust;
  /** Warunki escrow z pieczeci albo null. */
  escrow: SealedEscrow | null;
};

/**
 * Strona udostepniania z widoku magazynu.
 *
 * `records` - liczba waznych i niewaznych rekordow przyjec (czytane tylko dla
 * Aska zapieczetowanego). Zapieczetowany Ask liczy zajete miejsca z rekordow,
 * nie z licznika w lustrze. Niewazny rekord robi z widoku 'broken' - tak samo
 * jak trasy, ktore odpowiadaja wtedy 503.
 */
export function shareFromView(view: AskView, records?: { valid: number; invalid: number }): AskShare {
  if (view.trust === 'broken' || (records !== undefined && records.invalid > 0)) {
    return { ask: publicAsk(view, null, 0), trust: 'broken', escrow: null };
  }
  const acceptedCount = view.trust === 'sealed' && records !== undefined ? records.valid : view.acceptedCount;
  return { ask: publicAsk(view, view.escrow, acceptedCount), trust: view.trust, escrow: view.escrow };
}

/** Strona udostepniania z samego dokumentu, gdy magazyn jest niedostepny. */
export function shareUnchecked(ask: Ask): AskShare {
  return { ask: publicAsk(ask, null), trust: 'unchecked', escrow: null };
}

/** Czy liczbe zajetych miejsc wolno pokazac jako fakt. */
function statesSeats(share: AskShare): boolean {
  return share.trust === 'sealed' || share.trust === 'legacy';
}

export function shareSeatsLeft(share: AskShare): number {
  return Math.max(0, share.ask.seats - share.ask.acceptedCount);
}

/** "2 of 3" tylko tam, gdzie to wiemy; inaczej sama liczba miejsc. */
export function shareSeatsLabel(share: AskShare): string {
  return statesSeats(share) ? `${share.ask.acceptedCount} of ${share.ask.seats}` : String(share.ask.seats);
}

/**
 * Czy strona ma zapraszac do odpowiedzi. Tylko Ask, ktory POST
 * /api/asks/answers faktycznie przyjmie: 'unverified' odmawia (409),
 * 'broken' odpowiada 503, a przy 'unchecked' nie wiemy nic.
 */
export function shareTakesAnswers(share: AskShare, now = Date.now()): boolean {
  if (!statesSeats(share)) return false;
  return share.ask.status === 'open' && share.ask.deadline > now && shareSeatsLeft(share) > 0;
}

/**
 * Jedno zdanie o stanie Aska - to samo slownictwo co karta w feedzie, ale
 * pewne zdania ("Settled: ... paid out") tylko ze stanu zapieczetowanego.
 * Ask 'legacy' mowi, co zaznaczono w dokumencie, bez twierdzenia o wyplatach.
 */
export function shareStateLine(share: AskShare, now = Date.now()): string {
  const { ask, trust } = share;
  if (trust === 'unchecked') return 'Its current state could not be checked right now.';
  if (trust === 'broken') return 'This Ask cannot be verified right now.';
  if (trust === 'unverified') return 'This Ask has not been verified yet, so it is not taking answers.';
  if (ask.status === 'resolved') {
    if (trust !== 'sealed') return 'Marked resolved. Its payouts have not been verified yet.';
    // acceptedCount Aska zapieczetowanego pochodzi z rekordow (shareFromView).
    // Zero rekordow = zamkniety bez zadnej zapisanej wyplaty - "paid out"
    // byloby nieprawda (patrz revealsAllAnswers).
    return ask.acceptedCount > 0
      ? 'Settled: the budget has been paid out.'
      : 'Resolved, but no payout to an answer has been recorded.';
  }
  if (ask.status === 'expired') {
    return trust === 'sealed' ? 'Closed without a payout.' : 'Marked closed without a payout.';
  }
  if (ask.deadline <= now) return 'Past its deadline, waiting on the author.';
  const left = shareSeatsLeft(share);
  return left > 0 ? `${left} of the seats are still open.` : 'Every seat is taken.';
}

/**
 * Zdanie o pieniadzach:
 * - escrow             - warunki z pieczeci; link do depozytu (albo do
 *                        kontraktu, gdy stary Ask nie ma zweryfikowanego hasha),
 * - escrow-unverified  - dokument mowi 'escrowed', ale pieczeci nie ma: mowimy,
 *                        ze depozyt nie jest sprawdzony, i NIE linkujemy hasha
 *                        z dokumentu,
 * - on-resolve         - nic nie jest zablokowane. To zdanie jest bezpieczne
 *                        takze bez pieczeci: `funding` jest zamrozone regula
 *                        update, a slabsza obietnica nikogo nie naraza.
 */
export type ShareFundingNote =
  | { kind: 'escrow'; href: string | null; linkLabel: string }
  | { kind: 'escrow-unverified' }
  | { kind: 'on-resolve' };

export function shareFundingNote(share: AskShare): ShareFundingNote {
  const escrow = share.escrow;
  if (escrow) {
    // Linkujemy tylko Base mainnet - innej sieci escrow ta aplikacja nie ma,
    // a basescan pod cudzym chainId prowadzilby donikad.
    if (escrow.chainId !== 8453) return { kind: 'escrow', href: null, linkLabel: '' };
    return escrow.fundTxHash
      ? { kind: 'escrow', href: `https://basescan.org/tx/${escrow.fundTxHash}`, linkLabel: 'Check the deposit' }
      : { kind: 'escrow', href: `https://basescan.org/address/${escrow.contract}`, linkLabel: 'See the escrow contract' };
  }
  if (share.ask.funding === 'escrowed') return { kind: 'escrow-unverified' };
  return { kind: 'on-resolve' };
}
