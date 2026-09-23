import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as fsLimit,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ASKS_COLLECTION,
  ASK_ANSWERS_COLLECTION,
  type Ask,
  type AskAnswer,
  type ResolveRate,
} from './types';
import { getAskAuthorStats } from './userStats';
import { toAnswerMeta, toAsk } from './askMapping';

// Mapowanie mieszka w askMapping.ts, bo potrzebuje go tez serwer (askStore)
// bez klienckiego SDK. Re-eksport zostawia dotychczasowe importy w spokoju.
export { toAnswerMeta, toAsk };

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
 *
 * === TEN PLIK JUZ NICZEGO NIE ZAPISUJE ===
 * Zostaly same odczyty i newAskId. Zalozenie, przyjecie, rozstrzygniecie
 * i wygasniecie Aska ida wylacznie przez trasy serwera (admin SDK +
 * zapieczetowany stan w asks/{id}/sealed/state):
 *   zalozenie      POST /api/asks/create      (useCreateAsk) i POST /api/asks (x402)
 *   przyjecie      POST /api/asks/[id]/accept
 *   rozstrzygniecie POST /api/asks/[id]/resolve, .../escrow-resolve
 *   wygasniecie    POST /api/asks/[id]/escrow-expire (MoneyContent)
 * Dawne createAsk/acceptAnswer/resolveAsk/expireAsk pisaly klienckim SDK
 * pola, ktore kazda przegladarka mogla podrobic (autor bez dowodu, 'escrowed'
 * z dowolnym hashem, 'expired' cudzego Aska) - dlatego zniknely, a nie
 * zostaly "na wszelki wypadek". Po wdrozeniu regul i tak by nie przeszly.
 */

// Nazwy kolekcji stoja w types.ts - czyta je stamtad takze czytnik statystyk
// (userStats.ts), zeby obie warstwy nie mogly sie rozjechac.
const ASKS = ASKS_COLLECTION;
const ASK_ANSWERS = ASK_ANSWERS_COLLECTION;

/**
 * Nadaje identyfikator dokumentu NIE ZAPISUJAC go.
 *
 * Firestore generuje identyfikatory lokalnie, wiec `doc(collection(...))` jest
 * darmowy i nie tworzy dokumentu. Dzieki temu escrow moze pojsc na lancuch pod
 * ostatecznym identyfikatorem, a zapis (POST /api/asks/create, przez serwer)
 * idzie dopiero, gdy pieniadze naprawde leza. Serwer przyjmuje tylko ten format
 * (20 znakow alfanumerycznych - isEscrowAskId w askCreateCore.ts).
 */
export function newAskId(): string {
  return doc(collection(db, ASKS)).id;
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

export async function getAnswerMeta(askId: string): Promise<AskAnswer[]> {
  // fsLimit(200) to bezpiecznik, nie regula biznesowa: Ask ma najwyzej 20
  // miejsc, wiec 200 odpowiedzi to wielokrotny zapas - limit chroni tylko
  // przed odczytem bez dna, gdyby kolekcja z jakiegos powodu spuchla.
  const snapshot = await getDocs(
    query(
      collection(db, ASK_ANSWERS),
      where('askId', '==', askId),
      orderBy('createdAt', 'asc'),
      fsLimit(200)
    )
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
