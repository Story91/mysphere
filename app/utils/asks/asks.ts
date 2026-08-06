import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
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
  type Ask,
  type AskAnswer,
  type ResolveRate,
  computeResolveRate,
  isExpired,
  perAnswerFor,
} from './types';

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

const ASKS = 'asks';
const ASK_ANSWERS = 'askAnswers';

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
};

/** @returns identyfikator utworzonego Aska. */
export async function createAsk(input: CreateAskInput): Promise<string> {
  const seats = Math.max(1, Math.floor(input.seats));
  const budget = Math.max(0, input.budget);

  const ref = await addDoc(collection(db, ASKS), {
    author: input.author,
    question: input.question.trim(),
    budget,
    seats,
    perAnswer: perAnswerFor(budget, seats),
    token: input.token ?? 'USDC',
    network: input.network ?? 'base',
    // Termin liczony OD TERAZ po stronie klienta. Swiadome uproszczenie:
    // serverTimestamp() nie da sie dodac przesuniecia, a rozjazd zegara rzedu
    // sekund nie ma tu znaczenia przy terminach liczonych w godzinach.
    deadline: Date.now() + input.durationMs,
    createdAt: serverTimestamp(),
    status: 'open',
    funding: 'on-resolve',
    answerCount: 0,
    acceptedCount: 0,
  });

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
 * Odpowiedzi BEZ TRESCI - metadane, ktore wolno pokazac kazdemu.
 *
 * Liczba odpowiedzi jest jawna celowo: karta ma pokazywac "7 answers sealed
 * until resolve". Jawne jest TO, ZE ktos odpowiedzial; niejawne CO napisal.
 */
export async function getAnswerMeta(askId: string): Promise<AskAnswer[]> {
  const snapshot = await getDocs(
    query(collection(db, ASK_ANSWERS), where('askId', '==', askId), orderBy('createdAt', 'asc'))
  );
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      askId,
      author: typeof data.author === 'string' ? data.author : '',
      createdAt: toMillis(data.createdAt),
      content: null, // zapieczetowane - tresc wydaje wylacznie trasa serwerowa
      accepted: Boolean(data.accepted),
      payoutTxHash: typeof data.payoutTxHash === 'string' ? data.payoutTxHash : null,
    };
  });
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
 * Oznacza odpowiedz jako przyjeta i zapisuje DOWOD wyplaty.
 *
 * `payoutTxHash` jest WYMAGANY. Bez niego "przyjeta" jest samym slowem, a caly
 * produkt stoi na tym, ze kwoty da sie sprawdzic. Wolane dopiero PO tym, jak
 * przelew wszedl na lancuch - nigdy przed.
 */
export async function acceptAnswer(
  askId: string,
  answerId: string,
  payoutTxHash: string
): Promise<void> {
  if (!payoutTxHash) throw new Error('acceptAnswer wymaga hasha wyplaty');

  await updateDoc(doc(db, ASK_ANSWERS, answerId), {
    accepted: true,
    payoutTxHash,
    acceptedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, ASKS, askId), {
    acceptedCount: increment(1),
  });
}

/** Zamyka Aska. Wolane, gdy autor skonczyl przyjmowac odpowiedzi. */
export async function resolveAsk(askId: string): Promise<void> {
  await updateDoc(doc(db, ASKS, askId), {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
  });
}

/**
 * Wskaznik rozstrzygalnosci autora.
 *
 * Liczymy TYLKO Aski, ktorych termin juz minal - wciaz otwarty Ask nie jest
 * ani rozstrzygniety, ani porzucony, wiec wliczanie go zanizaloby wskaznik
 * kazdemu, kto wlasnie cos zalozyl.
 */
export async function getResolveRate(author: string): Promise<ResolveRate> {
  try {
    const snapshot = await getDocs(
      query(collection(db, ASKS), where('author', '==', author), fsLimit(200))
    );

    let settled = 0;
    let resolved = 0;
    const now = Date.now();

    for (const entry of snapshot.docs) {
      const ask = toAsk(entry.id, entry.data());
      if (ask.status === 'resolved') {
        settled++;
        resolved++;
      } else if (ask.status === 'expired' || isExpired(ask, now)) {
        settled++;
      }
    }

    return computeResolveRate(settled, resolved);
  } catch (error) {
    console.error('[asks] Odczyt resolve rate nie powiodl sie:', error);
    // `null` znaczy "nie wiem", a nie "zero" - zero bylby zarzutem wobec
    // czlowieka, postawionym w chwili, gdy nie udalo sie tego sprawdzic.
    return { settled: 0, resolved: 0, rate: null };
  }
}
