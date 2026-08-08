import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { toMillis } from '../firestoreTime';
import {
  ASKS_COLLECTION,
  ASK_ANSWERS_COLLECTION,
  type Ask,
  type AskAnswer,
  type ResolveRate,
  perAnswerFor,
} from './types';
import { getAskAuthorStats } from './userStats';

/**
 * Warstwa danych Aska.
 *
 * === PODZIAL NA DWIE KOLEKCJE I DLACZEGO ===
 *   `asks`             pytanie, budzet, miejsca, termin, liczniki - JAWNE
 *   `askAnswers`       kto i kiedy odpowiedzial, czy przyjeto, hash wyplaty - JAWNE
 *   `askAnswerContent` sama TRESC odpowiedzi - NIEDOSTEPNA dla klienta
 *
 * Manifest obiecuje, ze odpowiedzi sa "sealed until you resolve: nobody can
 * read what anyone else wrote, so nobody can rewrite it slightly and take a
 * seat with it". Tej obietnicy NIE DA SIE dotrzymac po stronie klienta:
 * dopoki tresc lezy w dokumencie, ktory feed czyta klienckim SDK, kazdy widzi
 * ja w odpowiedzi sieciowej - zaslona w UI to nie zapieczetowanie.
 *
 * Dlatego tresc idzie do osobnej kolekcji z regula `allow read, write: if
 * false` i wydaje ja wylacznie trasa serwerowa. To ten sam uklad, ktory
 * dziala juz dla tresci premium (app/api/premium/route.ts) - wzorzec
 * sprawdzony w tym repo, nie wymyslony tutaj.
 *
 * Ten plik NIE zapisuje tresci odpowiedzi. Robi to trasa serwerowa, bo klient
 * do tamtej kolekcji nie ma dostepu ani do zapisu, ani do odczytu.
 */

// Nazwy kolekcji stoja w types.ts - czyta je stamtad takze czytnik statystyk
// (userStats.ts), zeby obie warstwy nie mogly sie rozjechac.
const ASKS = ASKS_COLLECTION;
const ASK_ANSWERS = ASK_ANSWERS_COLLECTION;

/** Mapowanie dokumentu na Aska. Znaczniki przez toMillis - patrz firestoreTime. */
function toAsk(id: string, data: Record<string, any>): Ask {
  const budget = Number(data.budget) || 0;
  const seats = Number(data.seats) || 0;
  return {
    id,
    author: typeof data.author === 'string' ? data.author : '',
    question: typeof data.question === 'string' ? data.question : '',
    budget,
    seats,
    // Liczymy z budzetu i miejsc, a nie czytamy zapisanej wartosci: gdyby
    // kiedys rozjechala sie z budzetem, karta obiecywalaby inna kwote, niz
    // wyplaci rozstrzygniecie.
    perAnswer: perAnswerFor(budget, seats),
    token: typeof data.token === 'string' ? data.token : 'USDC',
    network: typeof data.network === 'string' ? data.network : 'base',
    deadline: toMillis(data.deadline),
    createdAt: toMillis(data.createdAt),
    status: data.status === 'resolved' || data.status === 'expired' ? data.status : 'open',
    funding: data.funding === 'escrowed' ? 'escrowed' : 'on-resolve',
    answerCount: Number(data.answerCount) || 0,
    acceptedCount: Number(data.acceptedCount) || 0,
    resolvedAt: data.resolvedAt ? toMillis(data.resolvedAt) : undefined,
    escrowTxHash: typeof data.escrowTxHash === 'string' ? data.escrowTxHash : null,
    escrowChainId: typeof data.escrowChainId === 'number' ? data.escrowChainId : null,
    escrowResolveTxHash:
      typeof data.escrowResolveTxHash === 'string' ? data.escrowResolveTxHash : null,
  };
}

export type CreateAskInput = {
  author: string;
  question: string;
  budget: number;
  seats: number;
  durationMs: number;
  token?: string;
  network?: string;
  /**
   * Identyfikator nadany Z GORY przez `newAskId`.
   *
   * Potrzebny WYLACZNIE dla escrow i to jest jedyny powod, dla ktorego istnieje:
   * kontrakt kluczuje escrow po (autor, askId), wiec askId musi byc znany PRZED
   * transakcja - a transakcja idzie PRZED zapisem. Bez tego dokument powstalby
   * pierwszy i przez chwile obiecywalby zablokowane srodki, ktorych jeszcze nie ma.
   */
  id?: string;
  /**
   * Termin PODANY WPROST, w milisekundach.
   *
   * Przy escrow ta sama liczba musi trafic do kontraktu i do dokumentu. Liczona
   * dwa razy z `Date.now() + durationMs` rozjechalaby sie o czas approve i fund,
   * czyli o kilkanascie sekund - a karta obiecywalaby wtedy inny termin niz ten,
   * ktorego pilnuje lancuch.
   */
  deadlineMs?: number;
  funding?: 'on-resolve' | 'escrowed';
  /** Hash `fund`. WYMAGANY przy funding: 'escrowed' - patrz nizej. */
  escrowTxHash?: string;
  escrowChainId?: number;
};

/**
 * Nadaje identyfikator dokumentu NIE ZAPISUJAC go.
 *
 * Firestore generuje identyfikatory lokalnie, wiec `doc(collection(...))` jest
 * darmowy i nie tworzy dokumentu. Dzieki temu escrow moze pojsc na lancuch pod
 * ostatecznym identyfikatorem, a Firestore dostaje zapis dopiero, gdy pieniadze
 * naprawde leza.
 */
export function newAskId(): string {
  return doc(collection(db, ASKS)).id;
}

/** @returns identyfikator utworzonego Aska. */
export async function createAsk(input: CreateAskInput): Promise<string> {
  const seats = Math.max(1, Math.floor(input.seats));
  const budget = Math.max(0, input.budget);
  const funding = input.funding ?? 'on-resolve';

  // Zapisanie 'escrowed' bez hasha `fund` byloby obietnica bez pokrycia wpisana
  // wprost do bazy - dokladnie tym, czego pole `funding` ma pilnowac. Bramka
  // stoi TUTAJ, a nie tylko w UI, zeby zadna druga sciezka zapisu jej nie ominela.
  if (funding === 'escrowed' && !input.escrowTxHash) {
    throw new Error('An escrowed Ask cannot be recorded without the funding transaction hash.');
  }

  const payload = {
    author: input.author,
    question: input.question.trim(),
    budget,
    seats,
    perAnswer: perAnswerFor(budget, seats),
    token: input.token ?? 'USDC',
    network: input.network ?? 'base',
    // Termin liczony OD TERAZ po stronie klienta, chyba ze wolajacy poda go
    // wprost (escrow - patrz `deadlineMs`). Swiadome uproszczenie:
    // serverTimestamp() nie da sie dodac przesuniecia, a rozjazd zegara rzedu
    // sekund nie ma tu znaczenia przy terminach liczonych w godzinach.
    deadline: input.deadlineMs ?? Date.now() + input.durationMs,
    createdAt: serverTimestamp(),
    status: 'open',
    funding,
    answerCount: 0,
    acceptedCount: 0,
    ...(funding === 'escrowed'
      ? {
          escrowTxHash: input.escrowTxHash,
          escrowChainId: input.escrowChainId ?? null,
        }
      : {}),
  };

  if (input.id) {
    // setDoc pod znanym identyfikatorem - ten sam, ktory posluzyl za askId na
    // lancuchu. addDoc nadalby wlasny i escrow wisialby pod kluczem, do ktorego
    // zaden dokument by nie prowadzil.
    await setDoc(doc(db, ASKS, input.id), payload);
    return input.id;
  }

  const ref = await addDoc(collection(db, ASKS), payload);
  return ref.id;
}

export async function getAsk(id: string): Promise<Ask | null> {
  try {
    const snapshot = await getDoc(doc(db, ASKS, id));
    if (!snapshot.exists()) return null;
    return toAsk(snapshot.id, snapshot.data());
  } catch (error) {
    console.error('[asks] Odczyt Aska nie powiodl sie:', error);
    // Rzucamy dalej: `null` znaczy "nie ma takiego Aska" i konczy sie 404,
    // czyli oswiadczeniem, ze zasob nie istnieje. Ta sama zasada co przy
    // udostepnionych postach i paragonach.
    throw error;
  }
}

export type AsksResult = { asks: Ask[]; failed: boolean };

/**
 * Otwarte Aski, najswiezsze pierwsze.
 *
 * `failed` odroznia awarie od pustki - pusty wynik i nieudany odczyt daja te
 * sama liste, ale znacza co innego dla czytelnika. Ta sama zasada co na Paid.
 */
export async function getOpenAsks(max = 20): Promise<AsksResult> {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, ASKS),
        where('status', '==', 'open'),
        orderBy('createdAt', 'desc'),
        fsLimit(max)
      )
    );
    return { asks: snapshot.docs.map((d) => toAsk(d.id, d.data())), failed: false };
  } catch (error) {
    console.error('[asks] Lista Askow nie powiodla sie:', error);
    return { asks: [], failed: true };
  }
}

/**
 * Rozstrzygniete Aski, najswiezsze pierwsze.
 *
 * === DLACZEGO TO MUSI ISTNIEC ===
 * Strona /asks pokazywala WYLACZNIE otwarte. Rozstrzygniety Ask znikal
 * z produktu calkowicie: nie widzial go autor, nie widzieli go ludzie, ktorzy
 * na niego odpowiedzieli i chcieli zobaczyc swoja wyplate, i nie widzial go
 * nikt, kto chcial sprawdzic, jak ten autor rozlicza.
 *
 * Na produkcie, ktorego teza brzmi "rozliczone platnosci sa zapisem", chowanie
 * kazdej rozliczonej sprawy jest odwrotnoscia tezy. Rozstrzygniecie to moment,
 * w ktorym Ask staje sie NAJBARDZIEJ warty pokazania - odpowiedzi sa
 * odpieczetowane, a przy przyjetych stoja hashe wyplat.
 *
 * Wyszlo to dopiero, gdy domknelismy dwa Aski i lista zrobila sie pusta.
 *
 * === DLACZEGO OSOBNE ZAPYTANIE, A NIE `in` ===
 * `where('status','in',['open','resolved'])` zwrocilby jedna liste posortowana
 * po czasie UTWORZENIA, w ktorej rozstrzygniete mieszalyby sie z otwartymi.
 * A to sa dwie rozne rzeczy dla czytelnika: w otwarte da sie jeszcze wejsc,
 * rozstrzygniete sa do obejrzenia. Dwie listy, dwa naglowki, ten sam indeks
 * (status + createdAt), ktory juz jest wdrozony.
 */
export async function getResolvedAsks(max = 10): Promise<AsksResult> {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, ASKS),
        where('status', '==', 'resolved'),
        orderBy('createdAt', 'desc'),
        fsLimit(max)
      )
    );
    return { asks: snapshot.docs.map((d) => toAsk(d.id, d.data())), failed: false };
  } catch (error) {
    console.error('[asks] Lista rozstrzygnietych Askow nie powiodla sie:', error);
    return { asks: [], failed: true };
  }
}

/**
 * Odpowiedzi BEZ TRESCI - metadane, ktore wolno pokazac kazdemu.
 *
 * Liczba odpowiedzi jest jawna celowo: karta ma pokazywac "7 answers sealed
 * until resolve". Jawne jest TO, ZE ktos odpowiedzial; niejawne CO napisal.
 */
function toAnswerMeta(id: string, data: Record<string, any>): AskAnswer {
  return {
    id,
    askId: typeof data.askId === 'string' ? data.askId : '',
    author: typeof data.author === 'string' ? data.author : '',
    createdAt: toMillis(data.createdAt),
    content: null, // zapieczetowane - tresc wydaje wylacznie trasa serwerowa
    accepted: Boolean(data.accepted),
    payoutTxHash: typeof data.payoutTxHash === 'string' ? data.payoutTxHash : null,
    // Kwota zapisana w chwili przyjecia. `null` znaczy "nie wiadomo ile",
    // a nie "zero" - patrz komentarz przy tych polach w types.ts.
    payoutAmount: typeof data.payoutAmount === 'number' ? data.payoutAmount : null,
    payoutToken: typeof data.payoutToken === 'string' ? data.payoutToken : null,
    payoutNetwork: typeof data.payoutNetwork === 'string' ? data.payoutNetwork : null,
  };
}

export async function getAnswerMeta(askId: string): Promise<AskAnswer[]> {
  const snapshot = await getDocs(
    query(collection(db, ASK_ANSWERS), where('askId', '==', askId), orderBy('createdAt', 'asc'))
  );
  return snapshot.docs.map((d) => toAnswerMeta(d.id, d.data()));
}

/**
 * JEDNA odpowiedz po jej identyfikatorze - bez tresci, jak wszedzie tutaj.
 *
 * === PO CO OSOBNO OD `getAnswerMeta` ===
 * Trasa przyjmujaca odpowiedz musi sprawdzic trzy rzeczy o JEDNEJ odpowiedzi:
 * czy nalezy do tego Aska, czy nie jest juz przyjeta i komu nalezy sie przelew.
 * `getAnswerMeta` odpowiedzialoby na to zapytaniem `askId ==` z `orderBy`, czyli
 * odczytem WSZYSTKICH odpowiedzi tego Aska ORAZ indeksem zlozonym. Odczyt po
 * kluczu to jeden dokument i zadnego indeksu.
 *
 * @returns `null` znaczy "nie ma takiej odpowiedzi". Blad odczytu leci wyzej -
 * "nie udalo sie sprawdzic" nie moze wygladac jak "nie istnieje".
 */
export async function getAnswer(answerId: string): Promise<AskAnswer | null> {
  const snapshot = await getDoc(doc(db, ASK_ANSWERS, answerId));
  if (!snapshot.exists()) return null;
  return toAnswerMeta(snapshot.id, snapshot.data());
}

/** Czy ten adres juz odpowiedzial. Jedna odpowiedz na osobe i na Aska. */
export async function hasAnswered(askId: string, author: string): Promise<boolean> {
  const snapshot = await getDocs(
    query(
      collection(db, ASK_ANSWERS),
      where('askId', '==', askId),
      where('author', '==', author),
      fsLimit(1)
    )
  );
  return !snapshot.empty;
}

/** Ile i w czym wyplacono za jedna przyjeta odpowiedz. */
export type AnswerPayout = {
  amount: number;
  token: string;
  network: string;
};

/**
 * Oznacza odpowiedz jako przyjeta i zapisuje DOWOD wyplaty.
 *
 * `payoutTxHash` jest WYMAGANY. Bez niego "przyjeta" jest samym slowem, a caly
 * produkt stoi na tym, ze kwoty da sie sprawdzic. Wolane dopiero PO tym, jak
 * przelew wszedl na lancuch - nigdy przed.
 *
 * === CO DOPISUJE POZA HASHEM I PO CO ===
 * Razem z przyjeciem zapisujemy KWOTE, TOKEN i SIEC wyplaty. Bez tego statystyki
 * odpowiadajacego ("ile zarobil, per token") wymagalyby doczytania Aska do
 * kazdej przyjetej odpowiedzi - zlaczenia, ktorego koszt rosnie z liczba
 * przyjec. Drugi powod jest wazniejszy: zapisana stawka jest TA, ktora
 * obowiazywala przy przyjeciu, i zostaje przy odpowiedzi na stale.
 *
 * `payout` wolno pominac - wtedy funkcja doczytuje Aska sama (jeden odczyt) i
 * bierze stawke z niego. Wolajacy, ktory Aska juz ma w rece (a musi go miec,
 * zeby wiedziec, ile przelac), oszczedza ten odczyt, podajac wartosci wprost.
 *
 * Gdy odczyt Aska sie nie uda, przyjecie i tak zostaje zapisane: przelew juz
 * poszedl na lancuch i odmowa zapisu byla by strata dowodu. Odpowiedz ladzie
 * wtedy w `acceptedWithoutAmount` - "nie wiadomo ile", nie "zero".
 */
export async function acceptAnswer(
  askId: string,
  answerId: string,
  payoutTxHash: string,
  payout?: AnswerPayout
): Promise<void> {
  if (!payoutTxHash) throw new Error('acceptAnswer wymaga hasha wyplaty');

  let recorded: AnswerPayout | null = payout ?? null;
  if (!recorded) {
    try {
      const ask = await getAsk(askId);
      if (ask) recorded = { amount: ask.perAnswer, token: ask.token, network: ask.network };
    } catch (error) {
      console.error('[asks] Nie udalo sie odczytac stawki Aska przy przyjmowaniu:', error);
    }
  }

  await updateDoc(doc(db, ASK_ANSWERS, answerId), {
    accepted: true,
    payoutTxHash,
    acceptedAt: serverTimestamp(),
    // Zapisujemy tylko wtedy, gdy naprawde wiemy ile. Zero udawaloby wyplate,
    // ktorej wysokosci nie znamy.
    ...(recorded && recorded.amount > 0
      ? {
          payoutAmount: recorded.amount,
          payoutToken: recorded.token,
          payoutNetwork: recorded.network,
        }
      : {}),
  });

  // ===================================================================
  // OSTATNIE OPLACONE MIEJSCE ZAMYKA ASKA SAM
  // ===================================================================
  // Zgloszenie wlasciciela: "settles 0 of 2, a 2 sa resolved, bo zaplacilem
  // za najlepsze odpowiedzi". Sprawdzone w bazie - mial racje i to byl blad
  // dzialajacy na jego niekorzysc:
  //
  //   status=open  seats=1  acceptedCount=1   <- kazde miejsce oplacone
  //   status=open  seats=1  acceptedCount=1   <- to samo
  //
  // Obie przyjete odpowiedzi mialy hash wyplaty. Autor zaplacil w CALOSCI,
  // a jego publiczny wskaznik rozstrzygalnosci pokazywal, ze porzucil dwa
  // Aski - bo `resolve` bylo osobnym, drugim klikiem, o ktorym nikt nie
  // powiedzial, ze jest konieczny.
  //
  // Panel mowil doslownie "1 of 1 seats paid" i obok trzymal czynny przycisk
  // "Resolve this Ask". Gdy wszystkie miejsca sa oplacone, nie ma juz CZEGO
  // rozstrzygac: nie ma wolnego miejsca, nie ma decyzji do podjecia. Drugi
  // klik nie niosl informacji, a jego pominiecie kosztowalo reputacje.
  //
  // TYLKO DLA 'on-resolve'. Przy escrow `resolve` jest wywolaniem NA
  // KONTRAKCIE, ktore dopiero rozdziela pieniadze - zamkniecie samego
  // dokumentu twierdziloby, ze wyplacono, podczas gdy budzet dalej lezy
  // zablokowany. Tam drugi krok jest prawdziwym krokiem i zostaje.
  const zamkniete = await zamknijGdyWszystkieMiejscaOplacone(askId);

  if (!zamkniete) {
    await updateDoc(doc(db, ASKS, askId), {
      acceptedCount: increment(1),
    });
  }
}

/**
 * Podbija licznik przyjec i - jesli to bylo ostatnie miejsce - zamyka Aska
 * w TYM SAMYM zapisie.
 *
 * Jeden `updateDoc` zamiast dwoch nie jest optymalizacja, tylko poprawnoscia:
 * dwa osobne zapisy zostawialyby okno, w ktorym Ask ma komplet oplaconych
 * miejsc i status `open`, czyli dokladnie ten stan, ktory naprawiamy.
 *
 * Zwraca `false`, gdy nie dalo sie odczytac Aska - wtedy wolajacy robi sam
 * goly increment. Nieudany odczyt NIE MOZE kosztowac zapisu przyjecia:
 * przelew juz poszedl na lancuch.
 */
async function zamknijGdyWszystkieMiejscaOplacone(askId: string): Promise<boolean> {
  let ask: Ask | null = null;
  try {
    ask = await getAsk(askId);
  } catch (error) {
    console.error('[asks] Nie udalo sie sprawdzic, czy Ask domyka sie sam:', error);
    return false;
  }
  if (!ask) return false;

  const poTym = (ask.acceptedCount ?? 0) + 1;
  const komplet = ask.seats > 0 && poTym >= ask.seats;
  const samoDomkniecie = komplet && ask.funding === 'on-resolve' && ask.status === 'open';

  await updateDoc(doc(db, ASKS, askId), {
    acceptedCount: increment(1),
    ...(samoDomkniecie ? { status: 'resolved', resolvedAt: Date.now() } : {}),
  });

  return true;
}

/**
 * Zamyka Aska. Wolane, gdy autor skonczyl przyjmowac odpowiedzi.
 *
 * `escrowResolveTxHash` podaje sciezka escrow: to hash transakcji `resolve` na
 * kontrakcie, czyli moment, w ktorym budzet przestal byc autora. Dla wariantu
 * 'on-resolve' zostaje pusty - tam dowodem sa hashe przy poszczegolnych
 * odpowiedziach, bo kazda byla osobnym przelewem.
 */
export async function resolveAsk(askId: string, escrowResolveTxHash?: string): Promise<void> {
  await updateDoc(doc(db, ASKS, askId), {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
    ...(escrowResolveTxHash ? { escrowResolveTxHash } : {}),
  });
}

/**
 * Ask wygasl: termin minal, autor nie rozstrzygnal, budzet wrocil z kontraktu.
 *
 * ===========================================================================
 * DLACZEGO TO W OGOLE POWSTALO
 * ===========================================================================
 * `status: 'expired'` bylo CZYTANE w czterech miejscach (ten plik, userStats,
 * getMoneyLedger, AskCard), a NIE BYLO ZAPISYWANE NIGDZIE. Kontrakt oddawal
 * pieniadze przez `settleExpired`, a dokument dalej mowil "open" - Ask stal na
 * /asks z odliczaniem po terminie i wygladal, jakby czekal na odpowiedzi,
 * ktorych nikt juz nie moze przyjac. Lancuch wiedzial, baza nie.
 *
 * ===========================================================================
 * DLACZEGO HASH JEST WYMAGANY, A NIE OPCJONALNY
 * ===========================================================================
 * Inaczej niz przy `resolveAsk`, gdzie hash jest dodatkiem. "Wygasl" to zdanie
 * o PIENIADZACH: mowi, ze budzet wrocil do autora pomniejszony o oplate. Bez
 * dowodu byloby to nasze slowo o cudzych srodkach - dokladnie ten sam problem,
 * ktory przy zakladaniu Aska rozwiazuje `escrowTxHash`. Regula Firestore tez
 * tego pilnuje: przy `status == 'expired'` wymaga hasha dlugosci 66 znakow.
 * Sama regula nie czyta lancucha, ale kazdy czytelnik moze - i wlasnie o to
 * chodzi.
 *
 * Wolane DOPIERO po potwierdzeniu transakcji. Zapis przed kwitem oznaczalby
 * Aska jako wygasly na podstawie zamiaru, a nie faktu.
 */
export async function expireAsk(askId: string, settleTxHash: string): Promise<void> {
  const hash = settleTxHash.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    // Rzucamy, zamiast zapisywac bez dowodu. Nieoznaczony Ask jest mniej
    // szkodliwy niz oznaczony klamliwie: pierwszy tylko wisi, drugi twierdzi,
    // ze pieniadze wrocily.
    throw new Error('expireAsk wymaga hasha potwierdzonej transakcji settleExpired.');
  }
  await updateDoc(doc(db, ASKS, askId), {
    status: 'expired',
    expiredAt: serverTimestamp(),
    expiredTxHash: hash,
  });
}

/**
 * Wskaznik rozstrzygalnosci autora.
 *
 * Liczymy TYLKO Aski, ktorych termin juz minal - wciaz otwarty Ask nie jest
 * ani rozstrzygniety, ani porzucony, wiec wliczanie go zanizaloby wskaznik
 * kazdemu, kto wlasnie cos zalozyl.
 *
 * === DLACZEGO TO DELEGUJE ===
 * `resolve rate` to jedna liczba z tego samego zapytania, z ktorego biora sie
 * pelne statystyki autora (userStats.ts). Dwie kopie tego liczenia to dwa
 * miejsca, w ktorych "porzucony" moze zaczac znaczyc co innego - a ta liczba
 * stoi publicznie na kazdej karcie Aska. Koszt bez zmian: to wciaz jedno
 * zapytanie po `author`, ograniczone tym samym limitem co dotad.
 */
export async function getResolveRate(author: string): Promise<ResolveRate> {
  const { stats } = await getAskAuthorStats(author);

  // `null` znaczy "nie wiem", a nie "zero" - zero bylby zarzutem wobec
  // czlowieka, postawionym w chwili, gdy nie udalo sie tego sprawdzic.
  if (!stats) return { settled: 0, resolved: 0, rate: null };

  return stats.resolveRate;
}
