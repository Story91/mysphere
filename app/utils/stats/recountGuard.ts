/**
 * Straznik dobowego przeliczenia licznikow (app/api/stats/recount/route.ts).
 *
 * === DLACZEGO LAJKI MAJA STRAZNIKA, A RESZTA NIE ===
 * Uzytkownicy, posty i komentarze to LICZBA DOKUMENTOW. Zeby ja nabic, trzeba
 * zapisac jeden dokument na kazda jednostke - kosztowne i widoczne w bazie.
 *
 * Lajki to SUMA POLA `posts.likes`, a to pole zmienia przegladarka (toggleLike
 * w app/utils/firebase.ts robi `increment(+-1)` bez zadnej reguly, ktora by
 * pilnowala kroku). Jeden zapis `likes: 1e9` na dowolnym poscie przesuwa sume
 * o miliard. Bez straznika cron przepisalby taka liczbe na ekran kazdego
 * goscia jako "dokladny pomiar" - czyli dokladnie ten blad, ktory usuwalismy
 * z feedu, tylko tym razem podpisany data.
 *
 * Straznik NIE udowadnia, ze suma jest prawdziwa - tego sie z otwartego pola
 * nie da zrobic. Lapie tylko skok, ktorego zwykly ruch nie wyprodukuje.
 * Prawdziwa naprawa to regula Firestore, ktora pozwala zmienic `likes` tylko
 * o 1 i tylko razem z `likedBy` - osobna zmiana.
 *
 * === CO SIE DZIEJE PRZY ODMOWIE ===
 * Cron nie zapisuje NIC i zwraca 409. Poprzednie liczby zostaja, a ich data
 * sie starzeje - po dwoch dobach panel Trends pisze "not updated since"
 * (app/utils/stats/countedCaption.ts). Odmowa jest wiec widoczna na ekranie,
 * a nie cicha.
 *
 * Odmowa powtarza sie codziennie, dopoki czlowiek nie zdecyduje. Jesli skok
 * okaze sie prawdziwy, wystarczy wpisac nowa wartosc w `globalStats/current`
 * pole `likes` z konsoli Firebase - nastepny przebieg porowna sie juz do niej.
 * Automatyczne "przyjmij po trzech dniach" oznaczaloby, ze wystarczy
 * cierpliwosc, zeby straznik przepuscil podrobke.
 *
 * Plik jest czysta logika bez importow, zeby dalo sie go testowac bez Firebase
 * (test/globalStatsRecount.test.ts).
 */

/** Ile razy nowa suma moze urosnac (albo zmalec) wzgledem poprzedniej w jedna dobe. */
export const MAX_DAILY_RATIO = 2;

/**
 * Bezwzgledny luz dla malych liczb. Bez niego poprzednia suma rowna 0 albo 6
 * (a taka byla w globalStats, gdy licznik przyrostowy dopiero ruszal)
 * blokowalaby kazdy pierwszy prawdziwy pomiar na zawsze, bo 2 x 6 = 12.
 */
export const ABSOLUTE_SLACK = 1000;

/**
 * Sufit niezalezny od historii: srednio 50 lajkow na post. Agregacja tylko do
 * odczytu z 2026-09-23 dala okolo 0,1 na post (25 433 na 263 662), wiec sufit
 * jest luzny o ponad dwa rzedy wielkosci - ma zlapac liczbe absurdalna, a nie
 * wzrost.
 */
export const LIKES_PER_POST_CEILING = 50;

export type LikesRecountVerdict =
  | { ok: true }
  | {
      ok: false;
      reason: 'not-integer' | 'negative' | 'ceiling' | 'jump' | 'drop';
      next: number;
      previous: number | null;
      ceiling: number;
    };

function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Punkt odniesienia z poprzedniego dokumentu `globalStats/current`.
 *
 * Najpierw pelna suma `likes`, jesli ktos ja juz zapisal. Przed pierwszym
 * przebiegiem crona jej nie ma (panel admina zapisywal `likes: null`), a jest
 * za to stara para `likesBaseline + likesSince` - ta sama, ktora feed
 * pokazywal z plusem jako dolna granice. Porownanie do niej jest ostrozniejsze
 * niz brak porownania: pierwszy przebieg to wlasnie ten, w ktorym podrobiona
 * suma przeszlaby najlatwiej.
 *
 * `null` = nie ma do czego porownac, zostaje sam sufit.
 */
export function previousLikesReference(data: Record<string, unknown> | undefined | null): number | null {
  if (!data) return null;

  const likes = asCount(data.likes);
  if (likes !== null) return likes;

  const baseline = asCount(data.likesBaseline);
  if (baseline !== null) {
    // likesSince bywa ujemne (nieatomowe -1 w toggleLike), wiec liczymy je
    // wprost, a nie przez asCount - inaczej suma bylaby zawyzona.
    const since = typeof data.likesSince === 'number' && Number.isFinite(data.likesSince) ? data.likesSince : 0;
    return Math.max(0, baseline + since);
  }

  return null;
}

/**
 * Czy nowa suma lajkow nadaje sie do zapisania.
 *
 * Spadek jest sprawdzany tak samo jak wzrost. Jeden zapis `likes: -1e9` na
 * poscie zbija sume rownie latwo, jak `1e9` ja pompuje, a zerowy licznik na
 * ekranie klamie tak samo jak napompowany.
 */
export function judgeLikesRecount(input: {
  next: number;
  previous: number | null;
  posts: number;
}): LikesRecountVerdict {
  const { next, previous, posts } = input;
  const ceiling = Math.max(ABSOLUTE_SLACK, posts * LIKES_PER_POST_CEILING);
  const refuse = (reason: Exclude<LikesRecountVerdict, { ok: true }>['reason']): LikesRecountVerdict => ({
    ok: false,
    reason,
    next,
    previous,
    ceiling,
  });

  // Suma liczb calkowitych jest calkowita. Ulamek znaczy, ze ktos wpisal
  // na poscie `likes: 0.5` - dane sa podrobione, a pomiar "dokladny, bez plusa"
  // bylby o nich nieprawda.
  if (!Number.isSafeInteger(next)) return refuse('not-integer');
  if (next < 0) return refuse('negative');
  if (next > ceiling) return refuse('ceiling');

  if (previous !== null) {
    if (next > previous * MAX_DAILY_RATIO && next - previous > ABSOLUTE_SLACK) return refuse('jump');
    if (next * MAX_DAILY_RATIO < previous && previous - next > ABSOLUTE_SLACK) return refuse('drop');
  }

  return { ok: true };
}
