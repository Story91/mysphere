import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { toMillis } from '../firestoreTime';

/**
 * Globalne liczniki produktu - JEDEN dokument, JEDEN odczyt.
 *
 * === CO BYLO WCZESNIEJ ===
 * `fetchGlobalStats` w app/basechat/page.tsx nie czytalo niczego. Zwracalo
 * WPISANE NA SZTYWNO liczby:
 *
 *     userCount: 175708, postsCount: 239961, likesCount: 18817, ...
 *
 * a potem mnozylo kazda przez losowy wspolczynnik +/-1% z komentarzem
 * "dla realizmu". Czyli licznik zmienial sie na oczach czytelnika przy kazdym
 * wejsciu, zeby wygladac na zywy - bedac wymyslonym.
 *
 * Zmierzone tego samego dnia agregacja na produkcyjnej bazie:
 *     uzytkownicy  184 064   (na ekranie: 175 708)
 *     posty        263 613   (na ekranie: 239 961)
 *     komentarze    13 492   (na ekranie:  10 972)
 *
 * Na produkcie, ktorego cala teza brzmi "te liczby sa sprawdzalne i nie da
 * sie ich nabic", pierwsze cztery liczby na ekranie byly nabite.
 *
 * === DLACZEGO JEDEN DOKUMENT, A NIE LICZENIE NA ZYWO ===
 * Policzenie tego agregacja kosztuje okolo 467 odczytow. Zrobione przy KAZDYM
 * wejsciu na feed byloby to 467 odczytow na goscia - czyli dokladnie ten
 * koszt, przed ktorym uciekaly zmyslone liczby.
 *
 * Zamiast tego: liczby zapisuje panel admina po swoim (swiadomym, recznym)
 * przeliczeniu, a feed czyta JEDEN dokument. Jeden odczyt na wejscie, liczby
 * prawdziwe, a ich wiek jest jawny.
 *
 * === WIEK JEST CZESCIA ODPOWIEDZI ===
 * `measuredAt` wraca razem z liczbami, bo licznik sprzed tygodnia to co innego
 * niz licznik sprzed godziny. Interfejs ma powiedziec, kiedy to zmierzono -
 * inaczej stara liczba udaje swieza, czyli wracamy do punktu wyjscia.
 */

const STATS_DOC = 'globalStats';
const STATS_ID = 'current';

export type GlobalStats = {
  users: number;
  posts: number;
  likes: number;
  comments: number;
  tips: number;
  /** Kiedy policzono. 0 = nie wiadomo. */
  measuredAt: number;
};

export type GlobalStatsResult = {
  stats: GlobalStats | null;
  /**
   * `true` = odczytu NIE udalo sie wykonac. `stats: null` przy `failed: false`
   * znaczy "nikt jeszcze nie policzyl" - to dwa rozne zdania i interfejs ma
   * je rozroznic. Ta sama zasada co na Paid i w profilu.
   */
  failed: boolean;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Jeden odczyt. Nigdy nie zmysla liczb - brak danych zwraca `null`. */
export async function getGlobalStats(): Promise<GlobalStatsResult> {
  try {
    const snapshot = await getDoc(doc(db, STATS_DOC, STATS_ID));
    if (!snapshot.exists()) return { stats: null, failed: false };

    const data = snapshot.data();
    return {
      stats: {
        users: toNumber(data.users),
        posts: toNumber(data.posts),
        likes: toNumber(data.likes),
        comments: toNumber(data.comments),
        tips: toNumber(data.tips),
        measuredAt: toMillis(data.measuredAt),
      },
      failed: false,
    };
  } catch (error) {
    console.error('[globalStats] Odczyt nie powiodl sie:', error);
    return { stats: null, failed: true };
  }
}

/**
 * Zapis pomiaru. Wola WYLACZNIE panel admina, po udanym policzeniu.
 *
 * Nie zapisujemy czesciowych wynikow: jesli ktorakolwiek liczba nie doszla,
 * lepiej zostawic poprzedni pomiar w calosci, niz zmieszac swieze liczby ze
 * starymi w jednym dokumencie bez sladu, ktore sa ktore.
 */
export async function saveGlobalStats(
  stats: Omit<GlobalStats, 'measuredAt'>
): Promise<void> {
  await setDoc(doc(db, STATS_DOC, STATS_ID), {
    ...stats,
    measuredAt: serverTimestamp(),
  });
}

/** Krotki, ludzki wiek pomiaru. */
export function statsAge(measuredAt: number, now = Date.now()): string {
  if (!measuredAt) return 'nieznany';
  const mins = Math.round((now - measuredAt) / 60000);
  if (mins < 1) return 'przed chwilą';
  if (mins < 60) return `${mins} min temu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} godz. temu`;
  return `${Math.round(hours / 24)} dni temu`;
}
