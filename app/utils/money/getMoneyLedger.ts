import {
  collection,
  getDocs,
  query,
  where,
  limit as fsLimit,
  type Query,
} from 'firebase/firestore';
import { getPublicDb } from '../publicFirestore';
import { toMillis } from '../firestoreTime';
import {
  ASKS_COLLECTION,
  ASK_ANSWERS_COLLECTION,
  addTokenAmount,
  perAnswerFor,
  type AskFunding,
  type TokenAmounts,
} from '../asks/types';
// monetization/types.ts to same typy i funkcje czyste (jedyny import: viem),
// wiec nie lamie zasady z naglowka o nieciagnieciu tu firebase.ts.
import { addressReadVariants } from '../monetization/types';

/**
 * KSIEGA JEDNEGO CZLOWIEKA - wszystko, co przeszlo przez jego portfel TUTAJ.
 *
 * === PO CO TO ISTNIEJE ===
 * Pieniadze uzytkownika sa dzis rozrzucone po czterech ekranach i na zaden
 * z nich nie prowadzi pytanie, ktore czlowiek ma naprawde w glowie:
 *
 *   "ile mam do odebrania"   -> AskClaimPanel, wylacznie na /asks
 *   "ile zablokowalem"       -> nigdzie; kontrakt wie, aplikacja nie pyta
 *   "ile mi zaplacono"       -> /leaderboard (cudze i wlasne razem) i profil
 *   "ile wydalem"            -> nigdzie
 *
 * Ten modul odpowiada na trzy z nich z Firestore. Czwarte - saldo do odebrania -
 * jest pytaniem do LANCUCHA i celowo go tu nie ma: patrz `readClaimable`
 * w app/utils/asks/escrow.ts i AskClaimPanel, ktory juz to robi.
 *
 * === CZEGO TEN PLIK NIE ROBI ===
 * Nie zna Reacta, nie zna wagmi i nie dotyka lancucha. Oddaje surowe wiersze
 * z hashami; ile z tego wciaz lezy na kontrakcie, ustala dopiero wolajacy przez
 * `escrowFor` (kwota zablokowana zmienia sie bez zadnego zapisu w Firestore -
 * dokument Aska nie wie o rozstrzygnieciu ani o wygasnieciu).
 *
 * === KOSZT ODCZYTU ===
 * Baza ma 184 tys. kont i 263 tys. postow, agregacje na tym projekcie odmawiaja
 * (RESOURCE_EXHAUSTED), wiec kazde zapytanie tutaj jest PUNKTOWE - po adresie
 * tego czlowieka - i ma twardy limit `ROW_CAP`. Koszt to jego wlasna historia,
 * nigdy rozmiar kolekcji. Szesc zapytan lecacych ROWNOLEGLE:
 *
 *   tips        recipientAddress in [warianty]     wplywy: napiwki
 *   tips        senderAddress    in [warianty]     wydatki: napiwki
 *   unlocks     creatorAddress   in [warianty]     wplywy: sprzedana tresc
 *   unlocks     walletAddress    in [warianty]     wydatki: kupiona tresc
 *   askAnswers  author in [...] + accepted == true wplywy: przyjete odpowiedzi
 *   asks        author in [warianty]               wydatki + otwarte escrow
 *
 * ZADNE nie ma `orderBy`. To nie jest zaniedbanie: `tips` i `unlocks` nie maja
 * ani jednego indeksu zlozonego w firestore.indexes.json, wiec zapytanie
 * `where(...) + orderBy('timestamp')` konczy sie bledem FAILED_PRECONDITION,
 * czyli pusta sekcja u kogos, kto ma pieniadze. Sortujemy w pamieci, a limit
 * ustawia `truncated` - obciecie ma byc widoczne, a nie udawac kompletu.
 * (Dwa indeksy, ktore by to zdjely, sa opisane na koncu pliku.)
 *
 * === AWARIA != PUSTKA ===
 * Kazda sekcja niesie WLASNA flage `failed`. Nieudany odczyt napiwkow nie moze
 * wyzerowac wydatkow ani - przede wszystkim - pokazac sie jako "nic ci nie
 * zaplacono". Kwota, ktorej nie zmierzylismy, jest `null`, nie zerem: pozycje
 * bez zapisanej kwoty licza sie w `unknownAmounts`, a nie w sumie.
 */

/**
 * Ile najwyzej wierszy z jednego zapytania.
 *
 * 100 na sekcje, bo to ma byc odczyt o ZNANYM koszcie. Dla porownania: cala
 * produkcyjna kolekcja `tips` ma dzis ~190 dokumentow na wszystkich razem, wiec
 * limit dotknie najwyzej kilka kont. Gdy dotknie, `truncated` mowi interfejsowi,
 * ze sumy sa DOLNA GRANICA - i interfejs ma prawo to napisac.
 */
const ROW_CAP = 100;

/**
 * Nazwy kolekcji spoza rodziny Askow.
 *
 * `unlocks` ma swoja stala w app/utils/monetization/unlocks.ts, ale tamten plik
 * importuje `db` z app/utils/firebase.ts (~5800 linii, firebase/auth,
 * localStorage). Wciaganie tego do strony, ktorej potrzeba szesciu odczytow,
 * kosztowaloby wiecej niz cala reszta modulu. Ta sama decyzja i ten sam powod
 * co w app/utils/asks/userStats.ts. GDY ZMIENIASZ NAZWE KOLEKCJI - zmien w OBU
 * miejscach.
 */
const TIPS_COLLECTION = 'tips';
const UNLOCKS_COLLECTION = 'unlocks';

/* ------------------------------------------------------------------ */
/*  KSZTALT WYNIKU                                                     */
/* ------------------------------------------------------------------ */

/** Skad wziela sie pozycja. Interfejs pisze z tego zdanie po angielsku. */
export type MoneySource =
  /** Napiwek pod postem. */
  | 'tip'
  /** Odblokowanie platnej sekcji posta. */
  | 'unlock'
  /** Wyplata za przyjeta odpowiedz na Aska. */
  | 'ask-answer'
  /** Wplata budzetu wlasnego Aska na kontrakt escrow. */
  | 'ask-escrow';

export type MoneyEvent = {
  /** Identyfikator dokumentu zrodlowego - klucz listy, nie do pokazania. */
  id: string;
  source: MoneySource;
  /**
   * Kwota, albo `null` gdy dokument jej nie ma.
   *
   * `null` ZNACZY "NIE WIADOMO ILE", nigdy "zero". Zero przy przyjetej
   * odpowiedzi bez zapisanej stawki mowiloby czlowiekowi, ze pracowal za darmo.
   * Takie pozycje wchodza do `unknownAmounts`, a nie do sumy.
   */
  amount: number | null;
  token: string;
  /** Siec zapisana przy dokumencie - decyduje, ktory eksplorator otworzyc. */
  network: string;
  /**
   * Hash transakcji. `null` = pozycja BEZ DOWODU i interfejs musi to napisac,
   * zamiast rysowac martwy link.
   */
  txHash: string | null;
  /** Znacznik w ms. `0` = dokument nie mial daty (stare wpisy). */
  timestamp: number;
  /** Druga strona, malymi literami. `null` gdy dokument jej nie zapisal. */
  counterparty: string | null;
  /** Do czego to sie odnosi: postId albo askId. Do zbudowania linku wewnatrz apki. */
  ref: string | null;
};

export type MoneySection = {
  /** Wiersze, najnowsze pierwsze. Pozycje bez daty ida na koniec. */
  events: MoneyEvent[];
  /** Sumy PER TOKEN. Nigdy jedna liczba - patrz TokenAmounts w asks/types.ts. */
  totals: TokenAmounts;
  /** Ile pozycji nie dalo sie policzyc (brak kwoty). Nie wliczone w `totals`. */
  unknownAmounts: number;
  /** Ile pozycji nie ma hasha, czyli nie da sie ich otworzyc w eksploratorze. */
  withoutProof: number;
  /** `true` = ktorykolwiek odczyt tej sekcji siegnal limitu. Sumy sa dolna granica. */
  truncated: boolean;
  /** `true` = ktorykolwiek odczyt tej sekcji PADL. Pustka jest nasza, nie swiata. */
  failed: boolean;
};

/** Wlasny Ask, ktory wciaz trwa - kandydat do odczytu `escrowFor` z lancucha. */
export type OpenAskRow = {
  id: string;
  question: string;
  budget: number;
  token: string;
  seats: number;
  acceptedCount: number;
  deadline: number;
  funding: AskFunding;
  /** Dowod wplaty budzetu. `null` przy 'on-resolve' - tam nic nie wplacano. */
  escrowTxHash: string | null;
  escrowChainId: number | null;
};

export type MoneyLedger = {
  /** Adres malymi literami - w tej postaci porownuje go interfejs. */
  address: string;
  incoming: MoneySection;
  outgoing: MoneySection;
  /**
   * Wlasne Aski, ktore jeszcze trwaja. Same dokumenty - ILE naprawde lezy na
   * kontrakcie, wie wylacznie lancuch (`escrowFor`), bo rozstrzygniecie
   * i wygasniecie nie zapisuja sie w tym dokumencie.
   */
  openAsks: { rows: OpenAskRow[]; truncated: boolean; failed: boolean };
  /**
   * Ile poszlo do odpowiadajacych z WLASNEGO PORTFELA autora, per token -
   * czyli wylacznie Aski `funding: 'on-resolve'`.
   *
   * OSOBNO OD `outgoing`, BO NIE MA HASHY. Dowodem kazdej takiej wyplaty jest
   * `payoutTxHash` przy KONKRETNEJ ODPOWIEDZI, a odpowiedzi na cudze pytania
   * nie da sie tu doczytac bez indeksu zlozonego (askId + accepted), ktorego
   * projekt nie ma. Ta liczba mowi wiec, ile Aski BYLY WINNE za zajete miejsca,
   * i interfejs nie ma prawa nazwac jej "rozliczonym" - ma odeslac po dowody
   * na /asks.
   *
   * Aski `escrowed` sa tu POMINIETE swiadomie: tam pieniadze wyszly z portfela
   * raz, przy wplacie budzetu (jest w `outgoing`, z hashem `fund`), a nie przy
   * rozstrzygnieciu. Policzenie ich w obu miejscach liczyloby te sama kwote dwa razy.
   */
  askPayoutsFromWallet: TokenAmounts;
  /** Ile odczytow Firestore kosztowalo to wywolanie. */
  reads: number;
};

/* ------------------------------------------------------------------ */
/*  ODCZYT                                                             */
/* ------------------------------------------------------------------ */

type RawRow = { id: string; data: Record<string, any> };
type RawRead = { rows: RawRow[]; truncated: boolean; failed: boolean };

/** Firestore rozlicza zapytanie zwracajace dokumenty po jednym za dokument, minimum jeden. */
const readsForDocs = (size: number) => Math.max(1, size);

/** Jedno zapytanie. Awaria zwraca `failed`, nie pustke - roznica jest tu calym sednem. */
async function readRows(source: Query, label: string): Promise<RawRead> {
  try {
    const snapshot = await getDocs(source);
    return {
      rows: snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() as Record<string, any> })),
      truncated: snapshot.size >= ROW_CAP,
      failed: false,
    };
  } catch (error) {
    console.error(`[money] Odczyt ${label} nie powiodl sie:`, error);
    return { rows: [], truncated: false, failed: true };
  }
}

/** Zapytanie po jednym polu adresowym, bez orderBy - patrz naglowek pliku. */
function byAddressField(collectionName: string, field: string, variants: string[]): Query {
  return query(
    collection(getPublicDb(), collectionName),
    where(field, 'in', variants),
    fsLimit(ROW_CAP)
  );
}

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Hash albo `null`. Pusty string to BRAK dowodu, a nie dowod pusty. */
const asHash = (value: unknown): string | null => asText(value) || null;

/** Adres malymi literami albo `null`. */
const asAddress = (value: unknown): string | null => asText(value).toLowerCase() || null;

/**
 * Kwota z dokumentu. `unlocks` trzyma ja jako STRING (regula Firestore tego nie
 * zabrania, a `saveUnlock` zapisuje `amount: string`), `tips` tak samo, Aski
 * jako liczbe. Wartosc niedodatnia albo nieliczbowa daje `null` - "nie wiadomo
 * ile", nie zero.
 */
function asAmount(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/* ------------------------------------------------------------------ */
/*  SKLADANIE SEKCJI                                                   */
/* ------------------------------------------------------------------ */

/** Najnowsze pierwsze; pozycje bez daty na koniec, zeby nie udawaly najstarszych. */
function byNewest(a: MoneyEvent, b: MoneyEvent): number {
  if (a.timestamp === b.timestamp) return 0;
  if (a.timestamp === 0) return 1;
  if (b.timestamp === 0) return -1;
  return b.timestamp - a.timestamp;
}

function buildSection(events: MoneyEvent[], truncated: boolean, failed: boolean): MoneySection {
  const totals: TokenAmounts = {};
  let unknownAmounts = 0;
  let withoutProof = 0;

  for (const event of events) {
    // addTokenAmount oddaje `false`, gdy nie bylo czego dodac - wtedy pozycja
    // idzie do osobnego licznika, a NIE do sumy jako zero.
    if (!addTokenAmount(totals, event.token, event.amount)) unknownAmounts++;
    if (!event.txHash) withoutProof++;
  }

  return {
    events: [...events].sort(byNewest),
    totals,
    unknownAmounts,
    withoutProof,
    truncated,
    failed,
  };
}

/* ------------------------------------------------------------------ */
/*  WEJSCIE                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cala ksiega jednego adresu.
 *
 * Szesc zapytan rownolegle, kazde z wlasna awaria. Nieudany odczyt jednej
 * kolekcji nie kasuje pozostalych - dostaje `failed` w swojej sekcji, a
 * interfejs ma napisac "nie udalo sie wczytac", nie "zero".
 *
 * KOSZT: suma zwroconych dokumentow, ograniczona 6 * ROW_CAP i niezalezna od
 * rozmiaru bazy. Typowe konto z kilkoma napiwkami: ~6-15 odczytow.
 */
export async function getMoneyLedger(address: string): Promise<MoneyLedger> {
  const normalized = (address ?? '').trim().toLowerCase();

  const empty = (failed: boolean): MoneySection => buildSection([], false, failed);
  if (!normalized) {
    // Brak adresu to nie awaria - to pytanie bez adresata. Zadnego odczytu.
    return {
      address: '',
      incoming: empty(false),
      outgoing: empty(false),
      openAsks: { rows: [], truncated: false, failed: false },
      askPayoutsFromWallet: {},
      reads: 0,
    };
  }

  /**
   * WARSTWA ZGODNOSCI WSTECZNEJ, nie stan docelowy.
   *
   * `saveTip` normalizuje juz adresy do malych liter, ale w bazie leza rekordy
   * SPRZED tej zmiany - sonda naliczyla 187 z 189 dokumentow w `tips` z adresem
   * w checksumie. Dopoki ich ktos nie przepisze
   * (scripts/migrateAddressCasing.mjs, NIEURUCHOMIONY), kazde zapytanie o
   * historie musi pytac o obie postacie naraz.
   *
   * Wczesniej bylo to liczone tutaj jako `[wejscie, wejscie.toLowerCase()]`
   * i miało cichą dziurę: gdy wolajacy podal adres juz malymi literami, lista
   * skracala sie do jednej pozycji i WSZYSTKIE dokumenty w checksumie wypadaly
   * bez sladu. Dzis ratuje nas tylko to, ze wagmi oddaje checksume. Wspolny
   * `addressReadVariants` odtwarza obie postacie z samego adresu, wiec ksiega
   * jest kompletna niezaleznie od tego, w jakiej pisowni adres tu przyszedl.
   */
  const variants = addressReadVariants(address);
  const db = getPublicDb();

  const [tipsIn, tipsOut, unlocksIn, unlocksOut, answers, asks] = await Promise.all([
    readRows(byAddressField(TIPS_COLLECTION, 'recipientAddress', variants), 'otrzymanych napiwkow'),
    readRows(byAddressField(TIPS_COLLECTION, 'senderAddress', variants), 'wyslanych napiwkow'),
    readRows(byAddressField(UNLOCKS_COLLECTION, 'creatorAddress', variants), 'sprzedanych odblokowan'),
    readRows(byAddressField(UNLOCKS_COLLECTION, 'walletAddress', variants), 'kupionych odblokowan'),
    readRows(
      query(
        collection(db, ASK_ANSWERS_COLLECTION),
        where('author', 'in', variants),
        // Indeks zlozony (author, accepted) JEST w firestore.indexes.json -
        // ten sam, z ktorego korzysta juz userStats.ts.
        where('accepted', '==', true),
        fsLimit(ROW_CAP)
      ),
      'przyjetych odpowiedzi'
    ),
    readRows(byAddressField(ASKS_COLLECTION, 'author', variants), 'wlasnych Askow'),
  ]);

  /* --- WPLYWY ------------------------------------------------------- */

  const incomingEvents: MoneyEvent[] = [
    ...tipsIn.rows.map<MoneyEvent>((row) => ({
      id: `tip-in-${row.id}`,
      source: 'tip',
      amount: asAmount(row.data.amount),
      token: asText(row.data.token) || 'ETH',
      network: asText(row.data.network) || 'base',
      txHash: asHash(row.data.txHash),
      timestamp: toMillis(row.data.timestamp),
      counterparty: asAddress(row.data.senderAddress),
      ref: asText(row.data.postId) || null,
    })),
    ...unlocksIn.rows.map<MoneyEvent>((row) => ({
      id: `unlock-in-${row.id}`,
      source: 'unlock',
      amount: asAmount(row.data.amount),
      token: asText(row.data.token) || 'USDC',
      network: asText(row.data.network) || 'base',
      txHash: asHash(row.data.txHash),
      timestamp: toMillis(row.data.unlockedAt),
      counterparty: asAddress(row.data.walletAddress),
      ref: asText(row.data.postId) || null,
    })),
    ...answers.rows.map<MoneyEvent>((row) => ({
      id: `answer-${row.id}`,
      source: 'ask-answer',
      // Kwota zapisana W CHWILI PRZYJECIA (patrz acceptAnswer). Brak pola
      // znaczy "nie wiadomo ile" - tak wygladaja przyjecia sprzed tego zapisu.
      amount: asAmount(row.data.payoutAmount),
      token: asText(row.data.payoutToken) || 'USDC',
      network: asText(row.data.payoutNetwork) || 'base',
      txHash: asHash(row.data.payoutTxHash),
      timestamp: toMillis(row.data.acceptedAt ?? row.data.createdAt),
      // Autora Aska tu nie ma i nie doczytujemy go - to byloby N+1 odczytow
      // po jednym na kazda przyjeta odpowiedz. Link prowadzi do Aska, a kto go
      // zalozyl, widac na miejscu.
      counterparty: null,
      ref: asText(row.data.askId) || null,
    })),
  ];

  /* --- WYDATKI ------------------------------------------------------ */

  const outgoingEvents: MoneyEvent[] = [
    ...tipsOut.rows.map<MoneyEvent>((row) => ({
      id: `tip-out-${row.id}`,
      source: 'tip',
      amount: asAmount(row.data.amount),
      token: asText(row.data.token) || 'ETH',
      network: asText(row.data.network) || 'base',
      txHash: asHash(row.data.txHash),
      timestamp: toMillis(row.data.timestamp),
      counterparty: asAddress(row.data.recipientAddress),
      ref: asText(row.data.postId) || null,
    })),
    ...unlocksOut.rows.map<MoneyEvent>((row) => ({
      id: `unlock-out-${row.id}`,
      source: 'unlock',
      amount: asAmount(row.data.amount),
      token: asText(row.data.token) || 'USDC',
      network: asText(row.data.network) || 'base',
      txHash: asHash(row.data.txHash),
      timestamp: toMillis(row.data.unlockedAt),
      counterparty: asAddress(row.data.creatorAddress),
      ref: asText(row.data.postId) || null,
    })),
  ];

  /* --- WLASNE ASKI: wplaty escrow, otwarte budzety, wyplaty z portfela --- */

  const askPayoutsFromWallet: TokenAmounts = {};
  const openAskRows: OpenAskRow[] = [];
  const now = Date.now();

  for (const row of asks.rows) {
    const data = row.data;
    const budget = Number(data.budget) || 0;
    const seats = Number(data.seats) || 0;
    const token = asText(data.token) || 'USDC';
    const acceptedCount = Number(data.acceptedCount) || 0;
    const funding: AskFunding = data.funding === 'escrowed' ? 'escrowed' : 'on-resolve';
    const status = data.status === 'resolved' || data.status === 'expired' ? data.status : 'open';
    const deadline = toMillis(data.deadline);
    const escrowTxHash = asHash(data.escrowTxHash);

    if (funding === 'escrowed' && escrowTxHash) {
      // WYDATEK Z HASHEM. Budzet naprawde opuscil portfel w chwili `fund` -
      // dlatego stoi w wydatkach, a nie w "zablokowane". To, co z niego zostalo
      // niewykorzystane, wraca do autora jako SALDO DO ODEBRANIA na kontrakcie
      // (refundToAuthor -> claimable), czyli pojawi sie w panelu odbioru,
      // a nie jako cofniety wiersz tutaj.
      outgoingEvents.push({
        id: `escrow-${row.id}`,
        source: 'ask-escrow',
        amount: budget > 0 ? budget : null,
        token,
        network: asText(data.network) || 'base',
        txHash: escrowTxHash,
        timestamp: toMillis(data.createdAt),
        counterparty: null,
        ref: row.id,
      });
    }

    if (funding === 'on-resolve' && acceptedCount > 0) {
      // Stawke liczymy z budzetu i miejsc, nie z zapisanego `perAnswer` - gdyby
      // te wartosci sie rozjechaly, ksiega obiecywalaby inna kwote niz karta
      // Aska. Ta sama decyzja co w `toAsk` i w userStats.
      addTokenAmount(askPayoutsFromWallet, token, acceptedCount * perAnswerFor(budget, seats));
    }

    // "Otwarty" liczymy tak samo jak `isExpired` w asks/types.ts: zaden proces
    // nie przestawia `status` na 'expired' sam z siebie, wiec po terminie Ask
    // wciaz ma w bazie 'open'. Po budzet z lancucha idziemy tylko dla tych,
    // ktore naprawde jeszcze trwaja.
    if (status === 'open' && (deadline === 0 || deadline > now)) {
      openAskRows.push({
        id: row.id,
        question: asText(data.question),
        budget,
        token,
        seats,
        acceptedCount,
        deadline,
        funding,
        escrowTxHash,
        escrowChainId: typeof data.escrowChainId === 'number' ? data.escrowChainId : null,
      });
    }
  }

  return {
    address: normalized,
    incoming: buildSection(
      incomingEvents,
      tipsIn.truncated || unlocksIn.truncated || answers.truncated,
      tipsIn.failed || unlocksIn.failed || answers.failed
    ),
    outgoing: buildSection(
      outgoingEvents,
      tipsOut.truncated || unlocksOut.truncated || asks.truncated,
      tipsOut.failed || unlocksOut.failed || asks.failed
    ),
    openAsks: { rows: openAskRows, truncated: asks.truncated, failed: asks.failed },
    askPayoutsFromWallet,
    reads:
      readsForDocs(tipsIn.rows.length) +
      readsForDocs(tipsOut.rows.length) +
      readsForDocs(unlocksIn.rows.length) +
      readsForDocs(unlocksOut.rows.length) +
      readsForDocs(answers.rows.length) +
      readsForDocs(asks.rows.length),
  };
}

/* ------------------------------------------------------------------ */
/*  POMOCNICZE DLA WIDOKU                                              */
/* ------------------------------------------------------------------ */

/** Czy w tej sekcji jest cokolwiek do pokazania. Awaria to NIE jest pustka. */
export function isSectionEmpty(section: MoneySection): boolean {
  return !section.failed && section.events.length === 0;
}

/**
 * Czy przez ten portfel nie przeplynelo tu jeszcze nic.
 *
 * `false`, gdy ktorykolwiek odczyt padl - pusty ekran postawiony na nieudanym
 * odczycie mowilby czlowiekowi, ze nie ma pieniedzy, w chwili gdy tego nie wiemy.
 */
export function isLedgerEmpty(ledger: MoneyLedger): boolean {
  if (ledger.incoming.failed || ledger.outgoing.failed || ledger.openAsks.failed) return false;
  return (
    ledger.incoming.events.length === 0 &&
    ledger.outgoing.events.length === 0 &&
    ledger.openAsks.rows.length === 0 &&
    Object.keys(ledger.askPayoutsFromWallet).length === 0
  );
}

/*
 * === INDEKSY, KTORE ZDJELYBY SORTOWANIE W PAMIECI ===
 * Gdyby ksiega miala kiedys stronicowac zamiast ciac na ROW_CAP, potrzebne sa
 * cztery indeksy zlozone w firestore.indexes.json (dzis NIE MA tam ani jednego
 * dla `tips` i `unlocks`):
 *   tips     (recipientAddress ASC, timestamp DESC)
 *   tips     (senderAddress    ASC, timestamp DESC)
 *   unlocks  (creatorAddress   ASC, unlockedAt DESC)
 *   unlocks  (walletAddress    ASC, unlockedAt DESC)
 * Dopoki ich nie ma, dopisanie `orderBy` do ktoregokolwiek zapytania wyzej
 * wywala je bledem FAILED_PRECONDITION - czyli pusta sekcja u czlowieka,
 * ktory ma pieniadze.
 */
