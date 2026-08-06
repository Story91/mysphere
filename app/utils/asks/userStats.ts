import {
  collection,
  getCountFromServer,
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
  computeAcceptRate,
  computeResolveRate,
  perAnswerFor,
  type AskAnswererStats,
  type AskAuthorStats,
  type AskUserStats,
  type TokenAmounts,
} from './types';

/**
 * SLAD, JAKI CZLOWIEK ZOSTAWIA W ASKACH.
 *
 * === PO CO TO ISTNIEJE ===
 * Zgloszenie wlasciciela: "jesli jakis uzytkownik cos robi, to musi to byc
 * zapisywane gdzies w jego db i musi gdzies miec swoje statystyki". Posty,
 * lajki i tipy taki slad zostawialy od dawna. Aski - nie: jedyna liczba, jaka
 * z nich wychodzila, byl `resolve rate` autora, i to wylacznie na kartach
 * w feedzie. Czlowiek, ktory napisal dwadziescia odpowiedzi i wzial za nie
 * pieniadze, nie mial tego nigdzie zapisane.
 *
 * === DLACZEGO LICZYMY NA ODCZYCIE, A NIE TRZYMAMY LICZNIKA ===
 * Istniejacy system punktow siedzi w `users/{adres}.baseChatPoints` i jego
 * skladniki sa WYLICZONE w app/utils/firebase.ts (tablica POINT_COMPONENTS,
 * ~linia 214). `totalPoints` jest przeliczane z tej tablicy w kilku miejscach
 * (addDomainBonusToUser, recalculateAllUsersPoints, naprawy struktury). Dopisanie
 * tam wlasnego pola `askPoints` BEZ dodania go do POINT_COMPONENTS konczy sie
 * tym, ze pierwsze przeliczenie po prostu je z sumy wyrzuca - czyli licznikiem,
 * ktory cicho gubi czyjas prace.
 *
 * Dlatego to NIE JEST drugi, rownolegly system punktow. To odczyt, ktory liczy
 * z danych juz istniejacych, dokladnie tak jak `getResolveRate` robil to dla
 * jednej liczby. Wpiecie Askow w `baseChatPoints` wymaga zmiany POINT_COMPONENTS
 * w firebase.ts i jest osobna decyzja - opisana w raporcie, nie przemycona tutaj.
 *
 * === KOSZT ODCZYTU NIE ROSNIE Z BAZA ===
 * Baza ma 184 064 konta i 263 613 postow, wiec kazde `getDocs` po calej kolekcji
 * jest tu wykluczone. Wszystkie zapytania sa PUNKTOWE - po `author` - wiec koszt
 * to wlasna historia tego czlowieka, a nie rozmiar bazy. Liczba, dla ktorej
 * wystarczy sama liczba (`ile odpowiedzi napisal`), idzie przez
 * `getCountFromServer` - Firestore liczy po swojej stronie i rozlicza to jako
 * jeden odczyt na kazde rozpoczete 1000 wpisow. Ten sam wzorzec co
 * app/admin/components/Statistics.tsx i app/utils/agents/registry.ts.
 *
 * ZMIERZONE 6 sierpnia 2026 na produkcyjnym projekcie: agregacja `count()`
 * zwraca tam dzis `RESOURCE_EXHAUSTED: Quota exceeded` - i to zarowno z SDK
 * klienckiego, jak i administracyjnego, podczas gdy zwykle `getDocs` dziala.
 * Dlatego czytnik odpowiedzi ma sciezke zapasowa (patrz `readAnswerStats`):
 * gdy agregacja odmawia, liczby powstaja z jednego zapytania o odpowiedzi tego
 * czlowieka. Drozej, wciaz ograniczone jego wlasna aktywnoscia - i przede
 * wszystkim NIE ZEREM podanym jako fakt.
 *
 * === DLACZEGO WLASNY KLIENT FIRESTORE ===
 * `getPublicDb()` reuzywa domyslnej aplikacji Firebase, gdy juz istnieje, wiec
 * w przegladarce to ten sam klient co feed. Import z app/utils/firebase.ts
 * wciagalby ~5800 linii i firebase/auth do kazdej trasy serwerowej, ktora
 * zechce pokazac te liczby. Ten sam powod, dla ktorego osobno stoja
 * getProfile.ts i getLeaderboard.ts.
 */

/**
 * Ile najwyzej dokumentow czytamy na jedno wywolanie.
 *
 * Limit jest ten sam, co dotad w `getResolveRate` (200), i to nie jest
 * przypadek: strona /asks dociaga wskaznik dla maks. 12 autorow naraz, wiec
 * podniesienie limitu podnioslo by koszt tamtego ekranu razy tyle samo.
 * Przekroczenie limitu ustawia `truncated` - liczby staja sie wtedy DOLNA
 * GRANICA i interfejs ma prawo to napisac.
 */
const HISTORY_CAP = 200;

/** Firestore rozlicza `count()` jako 1 odczyt na kazde rozpoczete 1000 wpisow. */
const readsForCount = (count: number) => Math.max(1, Math.ceil(count / 1000));

/** Zapytanie zwracajace dokumenty kosztuje 1 odczyt za dokument, minimum jeden. */
const readsForDocs = (size: number) => Math.max(1, size);

/**
 * Warianty zapisu adresu, po ktorych szukamy.
 *
 * Obie sciezki zapisu normalizuja adres do malych liter (POST /api/asks przez
 * `normalizeAddress`, odpowiedzi przez `saveAnswer`), ale reguly Firestore
 * dopuszczaja przy `asks` zapis wprost z przegladarki z adresem w checksumie.
 * Pytanie o oba warianty kosztuje tyle samo co o jeden - zwraca te same
 * dokumenty - a chroni przed statystyka, ktora cicho gubi polowe historii.
 * Ta sama ostroznosc co w getProfile.ts.
 */
function addressVariants(address: string): string[] {
  const trimmed = address.trim();
  const lower = trimmed.toLowerCase();
  return trimmed === lower ? [lower] : [trimmed, lower];
}

/** Zapytanie o dokumenty tego czlowieka w danej kolekcji. */
function byAuthor(collectionName: string, variants: string[]): Query {
  return query(
    collection(getPublicDb(), collectionName),
    where('author', 'in', variants),
    fsLimit(HISTORY_CAP)
  );
}

/* ------------------------------------------------------------------ */
/*  AUTOR ASKOW                                                        */
/* ------------------------------------------------------------------ */

export type AuthorStatsResult = { stats: AskAuthorStats | null; reads: number };

/**
 * Statystyki autora: ile zalozyl, ile rozstrzygnal, ile porzucil, ile obiecal
 * i ile wyplacil.
 *
 * JEDNO ZAPYTANIE. Agregacja `count()` nic by tu nie dala - potrzebne sa same
 * dokumenty (budzet, token, status, termin, licznik przyjec), a nie ich liczba.
 * Koszt to liczba wlasnych Askow tego czlowieka, ograniczona `HISTORY_CAP`.
 *
 * @returns `stats: null` znaczy AWARIE ODCZYTU, nigdy "nie zalozyl zadnego".
 */
export async function getAskAuthorStats(address: string): Promise<AuthorStatsResult> {
  if (!address || !address.trim()) return { stats: null, reads: 0 };

  let snapshot;
  try {
    snapshot = await getDocs(byAuthor(ASKS_COLLECTION, addressVariants(address)));
  } catch (error) {
    console.error('[askStats] Odczyt Askow autora nie powiodl sie:', error);
    return { stats: null, reads: 0 };
  }

  const committed: TokenAmounts = {};
  const paid: TokenAmounts = {};
  let open = 0;
  let resolved = 0;
  let abandoned = 0;
  const now = Date.now();

  for (const entry of snapshot.docs) {
    const data = entry.data() as Record<string, any>;

    const status = data.status === 'resolved' || data.status === 'expired' ? data.status : 'open';
    // Termin przez toMillis - kolekcja moze go trzymac w kilku ksztaltach naraz
    // (liczba ms, liczba sekund, Timestamp, ISO), patrz app/utils/firestoreTime.ts.
    const deadline = toMillis(data.deadline);
    const budget = Number(data.budget) || 0;
    const seats = Number(data.seats) || 0;
    const token = typeof data.token === 'string' ? data.token : 'USDC';
    const acceptedCount = Number(data.acceptedCount) || 0;

    if (status === 'resolved') {
      resolved++;
    } else if (status === 'expired' || (status === 'open' && deadline > 0 && deadline <= now)) {
      // Termin minal, rozstrzygniecia nie bylo. Zaden proces nie przestawia
      // `status` na `expired` sam z siebie, wiec porzucenie poznajemy po
      // terminie - dokladnie tak, jak robi to `isExpired` w types.ts.
      abandoned++;
    } else {
      open++;
      // Budzet trwajacego Aska to OBIETNICA. Nic go nie blokuje - nie ma
      // escrow (patrz naglowek types.ts) - wiec nie wolno tego liczyc jako
      // wydatku ani nazywac "zablokowane".
      addTokenAmount(committed, token, budget);
    }

    if (acceptedCount > 0) {
      // Stawke liczymy z budzetu i miejsc, nie z zapisanego `perAnswer`:
      // gdyby te wartosci sie rozjechaly, statystyka obiecywalaby inna kwote
      // niz karta Aska. Ta sama decyzja co w `toAsk`.
      addTokenAmount(paid, token, acceptedCount * perAnswerFor(budget, seats));
    }
  }

  return {
    stats: {
      created: snapshot.size,
      open,
      resolved,
      abandoned,
      // Wciaz otwarty Ask nie jest ani rozstrzygniety, ani porzucony - wliczenie
      // go zanizaloby wskaznik kazdemu, kto wlasnie cos zalozyl.
      resolveRate: computeResolveRate(resolved + abandoned, resolved),
      committed,
      paid,
      truncated: snapshot.size >= HISTORY_CAP,
    },
    reads: readsForDocs(snapshot.size),
  };
}

/* ------------------------------------------------------------------ */
/*  ODPOWIADAJACY                                                      */
/* ------------------------------------------------------------------ */

export type AnswererStatsResult = { stats: AskAnswererStats | null; reads: number };

/** Zlicza przyjete odpowiedzi i to, co za nie zaplacono. */
function foldAccepted(docs: Array<Record<string, any>>) {
  const earned: TokenAmounts = {};
  let acceptedWithoutAmount = 0;
  let acceptedWithoutProof = 0;

  for (const data of docs) {
    // Kwota i token zapisane przy PRZYJECIU odpowiedzi (patrz acceptAnswer).
    // Gdy ich nie ma, nie zgadujemy z Aska - liczymy taka sztuke osobno.
    if (!addTokenAmount(earned, data.payoutToken, data.payoutAmount)) {
      acceptedWithoutAmount++;
    }
    const hash = typeof data.payoutTxHash === 'string' ? data.payoutTxHash.trim() : '';
    if (!hash) acceptedWithoutProof++;
  }

  return { earned, acceptedWithoutAmount, acceptedWithoutProof };
}

/**
 * Statystyki odpowiadajacego: ile napisal, ile przyjeto, ile na tym zarobil.
 *
 * === DWIE SCIEZKI I DLACZEGO OBIE SA POTRZEBNE ===
 * TANIA (domyslna): `count()` po wszystkich odpowiedziach tego czlowieka - sama
 * liczba, wiec 1 odczyt na kazde 1000 - plus `getDocs` po samych PRZYJETYCH,
 * bo tam potrzebne sa kwoty. Przy dwudziestu przyjeciach to ok. 21 odczytow
 * niezaleznie od tego, ile odpowiedzi napisal.
 *
 * ZAPASOWA: jedno `getDocs` po wszystkich jego odpowiedziach. Wchodzi, gdy
 * ktorykolwiek odczyt tanie sciezki padnie - a to nie jest hipoteza: agregacja
 * `count()` odmawia dzis na tym projekcie z `RESOURCE_EXHAUSTED` (zmierzone
 * 6 sierpnia 2026, patrz naglowek pliku). Kosztuje tyle, ile ten czlowiek
 * napisal odpowiedzi, i wciaz nie zalezy od rozmiaru bazy.
 *
 * @returns `stats: null` znaczy AWARIE OBU SCIEZEK, nigdy "nic nie napisal".
 */
export async function getAskAnswererStats(address: string): Promise<AnswererStatsResult> {
  if (!address || !address.trim()) return { stats: null, reads: 0 };

  const variants = addressVariants(address);
  const all = byAuthor(ASK_ANSWERS_COLLECTION, variants);
  const acceptedOnly = query(
    collection(getPublicDb(), ASK_ANSWERS_COLLECTION),
    where('author', 'in', variants),
    where('accepted', '==', true),
    fsLimit(HISTORY_CAP)
  );

  // --- sciezka tania -------------------------------------------------
  const [writtenCount, acceptedSnapshot] = await Promise.all([
    getCountFromServer(all)
      .then((result) => result.data().count)
      .catch((error) => {
        console.error('[askStats] Agregacja liczby odpowiedzi nie powiodla sie:', error);
        return null;
      }),
    getDocs(acceptedOnly).catch((error) => {
      console.error('[askStats] Odczyt przyjetych odpowiedzi nie powiodl sie:', error);
      return null;
    }),
  ]);

  if (writtenCount !== null && acceptedSnapshot !== null) {
    const accepted = acceptedSnapshot.size;
    const folded = foldAccepted(acceptedSnapshot.docs.map((entry) => entry.data() as Record<string, any>));
    return {
      stats: {
        written: writtenCount,
        accepted,
        acceptRate: computeAcceptRate(writtenCount, accepted),
        ...folded,
        truncated: accepted >= HISTORY_CAP,
      },
      reads: readsForCount(writtenCount) + readsForDocs(accepted),
    };
  }

  // --- sciezka zapasowa ----------------------------------------------
  let snapshot;
  try {
    snapshot = await getDocs(all);
  } catch (error) {
    console.error('[askStats] Zapasowy odczyt odpowiedzi nie powiodl sie:', error);
    return { stats: null, reads: 0 };
  }

  const acceptedDocs = snapshot.docs
    .map((entry) => entry.data() as Record<string, any>)
    .filter((data) => data.accepted === true);

  return {
    stats: {
      written: snapshot.size,
      accepted: acceptedDocs.length,
      acceptRate: computeAcceptRate(snapshot.size, acceptedDocs.length),
      ...foldAccepted(acceptedDocs),
      truncated: snapshot.size >= HISTORY_CAP,
    },
    reads: readsForDocs(snapshot.size),
  };
}

/* ------------------------------------------------------------------ */
/*  KOMPLET                                                            */
/* ------------------------------------------------------------------ */

/**
 * Caly slad jednego czlowieka w Askach - obie strony naraz.
 *
 * Zapytania ida ROWNOLEGLE i kazde niesie wlasna awarie: nieudany odczyt Askow
 * nie kasuje statystyk odpowiedzi. Sekcja, ktorej nie udalo sie odczytac, jest
 * `null` - interfejs ma wtedy napisac "nie udalo sie wczytac", a nie "zero".
 *
 * KOSZT: (wlasne Aski) + (przyjete odpowiedzi) + 1, przy dzialajacej agregacji.
 * Bez agregacji: (wlasne Aski) + (wszystkie wlasne odpowiedzi). W obu wariantach
 * ograniczony `HISTORY_CAP` i niezalezny od rozmiaru bazy.
 *
 * NIE DA SIE STAD POLICZYC (brak zapisu w bazie, nie brak pomyslu):
 *  - ile z odpowiedzi czeka na rozstrzygniecie, a ile juz przepadlo. Odpowiedz
 *    nie wie, co sie stalo z jej Askiem. Zeby `acceptRate` liczyl sie
 *    symetrycznie do `resolve rate` - czyli po samych Askach juz zamknietych -
 *    dokument odpowiedzi musialby dostawac `askSettledAt` w chwili
 *    rozstrzygniecia. To zapis SERWEROWY: reguly Firestore dopuszczaja przy
 *    `askAnswers` wylacznie zmiane `accepted` false->true wraz z hashem.
 *  - oplaty x402 za zalozenie Askow. POST /api/asks rozlicza je w middleware
 *    i nigdzie nie zapisuje przy Asku, wiec `paid` obejmuje wyplaty dla
 *    odpowiadajacych i tylko je.
 */
export async function getAskUserStats(address: string): Promise<AskUserStats> {
  const normalized = (address ?? '').trim().toLowerCase();

  const [author, answerer] = await Promise.all([
    getAskAuthorStats(address),
    getAskAnswererStats(address),
  ]);

  return {
    address: normalized,
    asked: author.stats,
    answered: answerer.stats,
    reads: author.reads + answerer.reads,
  };
}
