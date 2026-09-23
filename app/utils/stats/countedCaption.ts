/**
 * Podpis "kiedy to policzono" pod licznikami w panelu Trends.
 *
 * === PO CO ===
 * Liczby w panelu pochodza z jednego dokumentu `globalStats/current`, ktory
 * przelicza raz na dobe cron (app/api/stats/recount/route.ts). Bez daty na
 * ekranie liczba sprzed miesiaca wyglada identycznie jak liczba z rana - i tak
 * wlasnie bylo: dokument zasiany skryptem 6 sierpnia odswiezal sie tylko wtedy,
 * gdy admin kliknal "Policz" w /admin, a feed nigdzie nie mowil, z kiedy sa
 * liczby. Data byla w stanie strony (`statsMeasuredAt`), ale nic jej nie
 * rysowalo.
 *
 * === DLACZEGO PODPIS ZMIENIA ZDANIE PO 48 GODZINACH ===
 * Cron chodzi raz na dobe, wiec swiezy pomiar ma najwyzej okolo 24 godzin.
 * Przy 48 godzinach co najmniej jeden przebieg nie zapisal niczego - odmowil
 * straznik (409), padla agregacja (503) albo cron w ogole nie ruszyl. Samo
 * "Counted Aug 6" nie mowi czytelnikowi, ze to jest problem; "Last counted
 * Aug 6 · not updated since" mowi. Martwy cron ma byc widac na ekranie,
 * a nie dopiero w logach Vercela.
 *
 * === ROK ===
 * "Aug 6" bez roku wyglada na ostatni sierpien. Pomiar sprzed roku podpisany
 * tak samo jak zeszlotygodniowy to ta sama pomylka, przed ktora chroni caly
 * podpis - dlatego rok pojawia sie, gdy nie jest biezacy.
 *
 * Czysta logika bez importow - testy w test/globalStatsRecount.test.ts.
 */

/** Po tylu milisekundach pomiar uznajemy za nieodswiezony. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/** "Sep 24", a gdy rok nie jest biezacy: "Aug 6, 2025". Strefa czasowa czytelnika. */
export function countedDate(measuredAt: number, now: number = Date.now()): string {
  const measured = new Date(measuredAt);
  const sameYear = measured.getFullYear() === new Date(now).getFullYear();
  return measured.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export type CountedCaption = {
  /** Gotowe zdanie pod karta liczb. */
  text: string;
  /** Sama data - idzie do dymka nad kazda liczba. */
  date: string;
  /** `true` = od ponad 48 godzin nikt nie przeliczyl. */
  stale: boolean;
};

/**
 * `null`, gdy nie wiadomo, kiedy policzono (0 albo brak) - wtedy panel nie
 * pisze nic. Zmyslona data bylaby gorsza niz brak daty, a przy nieudanym
 * odczycie wszystkie liczby i tak sa kreskami.
 *
 * Data z przyszlosci (zegar urzadzenia w tyle) liczy sie jako swieza, bo
 * pomiar na pewno nie jest stary.
 */
export function countedCaption(measuredAt: number | null | undefined, now: number = Date.now()): CountedCaption | null {
  if (!measuredAt || !Number.isFinite(measuredAt)) return null;

  const date = countedDate(measuredAt, now);
  const stale = now - measuredAt > STALE_AFTER_MS;

  return {
    text: stale ? `Last counted ${date} · not updated since` : `Counted ${date}`,
    date,
    stale,
  };
}
