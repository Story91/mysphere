import { NextRequest, NextResponse } from 'next/server';
import { fetchEligibleVaults } from '../../utils/morpho/client';
import { diffSnapshots, isSuspectShrink } from '../../utils/morpho/curator/diff';
import { buildSnapshot } from '../../utils/morpho/curator/snapshot';
import { readSnapshot, writeChanges, writeSnapshot } from '../../utils/morpho/curator/store';

/**
 * CODZIENNE SPRAWDZENIE PARAMETROW NOTOWANYCH SKARBCOW.
 *
 * ===========================================================================
 * HARMONOGRAM ISTNIEJE OD TEJ ZMIANY, WCZESNIEJ NIE ISTNIAL ZADEN
 * ===========================================================================
 * W repozytorium NIE BYLO pliku vercel.json, wiec zaden cron nie byl
 * zdefiniowany. Komentarz w app/api/cleanup-expired-pins/route.ts twierdzil, ze
 * tamta trasa "chodzi co 5 minut przez Vercel Cron" - to nieprawda i zostalo
 * przy tej okazji sprostowane w tamtym pliku. Nikt jej nigdy nie wolal.
 *
 * Ta zmiana zaklada vercel.json z JEDNYM wpisem, wskazujacym na te trase.
 * Format JSON nie przyjmuje komentarzy, wiec uzasadnienie kazdej decyzji z
 * tamtego pliku stoi tutaj:
 *
 *   "schedule": "0 6 * * *"  - RAZ NA DOBE, 06:00 UTC.
 *     Dobowy krok jest wyborem, nie ograniczeniem technicznym, ale zgadza sie
 *     tez z najnizszym planem Vercela, ktory dopuszcza wylacznie harmonogramy
 *     dobowe. Czesciej nie ma po co: prowizja i kurator to parametry zmieniane
 *     przez CZLOWIEKA, raz na wiele miesiecy. Godzinowy krok zwezilby przedzial
 *     "zaszlo miedzy X a Y" z doby do godziny i kosztowal 24 razy wiecej
 *     wolan do cudzego API za informacje, ktora prawie zawsze jest ta sama.
 *     06:00 UTC to martwy czas dla ruchu, ktory mamy.
 *
 *   JEDEN wpis, a nie dwa. Kusilo, zeby przy okazji dopisac harmonogram do
 *     /api/cleanup-expired-pins - ta trasa deklaruje cykl pieciominutowy,
 *     ktorego najnizszy plan nie przyjmie, a wlaczenie jej po raz pierwszy po
 *     miesiacach to zmiana zachowania produkcji przy okazji zupelnie innego
 *     zadania. Zostaje tam sprostowany komentarz i decyzja dla wlasciciela.
 *
 *   BRAK naglowka w konfiguracji. Vercel sam dokleja
 *     `Authorization: Bearer $CRON_SECRET`, gdy zmienna CRON_SECRET jest
 *     ustawiona w projekcie. Bez niej cron zawola trase bez naglowka i dostanie
 *     503 z wyraznym powodem - to jest zamierzone, patrz nizej.
 *
 * ===========================================================================
 * DLACZEGO NIE DA SIE TEGO ZROBIC BEZ HARMONOGRAMU
 * ===========================================================================
 * Rozwazana alternatywa: migawka "przy okazji", robiona przy pierwszym wejsciu
 * na strone danego dnia. Odrzucona z trzech powodow:
 *   (a) Odstep miedzy migawkami zalezalby od ruchu. Rejestr, w ktorym przedzial
 *       "zmiana zaszla miedzy X a Y" ma raz 20 godzin, a raz szesc dni, jest
 *       gorszym dowodem niz rejestr o stalym kroku.
 *   (b) Zapis do bazy w trakcie renderowania strony znaczy, ze czlowiek czeka
 *       na cudze zadanie sieciowe do api.morpho.org.
 *   (c) Dwa jednoczesne wejscia to dwa rownolegle porownania wzgledem tego
 *       samego starego stanu. Bez transakcji (a `runTransaction` na tym
 *       projekcie ODMAWIA) nie ma jak tego rozstrzygnac - ratowaloby nas
 *       wylacznie to, ze identyfikator wpisu jest deterministyczny.
 *
 * ===========================================================================
 * TA TRASA NIE PISZE NIC W POLOWIE
 * ===========================================================================
 * Kazde wyjscie bledem zostawia baze DOKLADNIE tak, jak ja zastalo, poza jednym
 * przypadkiem opisanym nizej (wpisy zapisane, stan niezapisany - powtarzalne
 * i nieszkodliwe, bo identyfikator jest deterministyczny).
 */

export const dynamic = 'force-dynamic';

/**
 * Jedno wolanie do api.morpho.org (limit 6 s po ich stronie) plus kilka zapisow.
 * Trzydziesci sekund to zapas, a nie oczekiwana dlugosc.
 */
export const maxDuration = 30;

type Outcome = {
  ok: boolean;
  step: string;
  detail?: string;
  vaults?: number;
  changes?: number;
  firstObservedAt?: number;
  observedAt?: number;
};

function fail(status: number, body: Outcome) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  /**
   * === BRAK SEKRETU TO ODMOWA, A NIE OTWARTE DRZWI ===
   * Trasa w app/api/cleanup-expired-pins/route.ts sprawdza sekret WARUNKOWO
   * (`if (cronSecret && ...)`), czyli przy nieustawionej zmiennej wpuszcza
   * kazdego. Tam kasuje to wygasle przypiecia i szkoda jest ograniczona.
   * Tutaj kazde wolanie ZAPISUJE do publicznego rejestru i pyta zewnetrzne API,
   * wiec otwarta trasa jest zaproszeniem do wypalenia dziennego limitu zapisow
   * przez obcego. Bez sekretu odmawiamy i mowimy, czego brakuje.
   */
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return fail(503, {
      ok: false,
      step: 'auth',
      detail: 'CRON_SECRET nie jest ustawiony. Trasa odmawia zamiast dzialac bez zabezpieczenia.',
    });
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return fail(401, { ok: false, step: 'auth', detail: 'Unauthorized' });
  }

  // ===== 1. POPRZEDNI STAN - PRZED ZAPYTANIEM O CZLOWIEKA I O SIEC =====
  // Bez punktu odniesienia nie ma czego porownywac, wiec nieudany odczyt konczy
  // przebieg TUTAJ, zanim cokolwiek pobierzemy. Nadpisanie stanu, ktorego nie
  // udalo sie odczytac, skasowaloby baze porownania i zmiana z tego dnia
  // przepadlaby na zawsze - nastepnym razem porownywalibysmy sie juz do wartosci
  // PO zmianie.
  const previous = await readSnapshot();
  if (!previous.ok) {
    if (previous.reason === 'malformed') {
      // Zepsuty dokument stanu blokuje przebieg CELOWO i wymaga czlowieka.
      // Automatyczne nadpisanie "naprawiloby" objaw, kasujac przy okazji
      // jedyny punkt odniesienia - czyli zamiotloby pod dywan zdarzenie,
      // ktorego juz nikt nie zobaczy.
      console.error('[curator] Dokument stanu jest nieczytelny. Przebieg wstrzymany.');
    }
    return fail(503, { ok: false, step: 'read-state', detail: previous.reason });
  }

  // ===== 2. BIEZACE PARAMETRY =====
  const list = await fetchEligibleVaults();
  if (!list.ok) {
    // Nieudane pobranie NIE JEST pusta lista. Zapisanie pustki wygenerowaloby
    // wpis "zszedl z listy" dla kazdego notowanego skarbca na Base.
    return fail(502, { ok: false, step: 'fetch-vaults', detail: list.reason });
  }

  const now = Date.now();
  const next = buildSnapshot(list.vaults, now, previous.snapshot);

  // ===== 3. STRAZNIK PODEJRZANEGO SKURCZU =====
  if (
    previous.snapshot &&
    isSuspectShrink(previous.snapshot.entries.length, next.entries.length)
  ) {
    console.error(
      '[curator] Lista notowanych skurczyla sie z',
      previous.snapshot.entries.length,
      'do',
      next.entries.length,
      '- przebieg wstrzymany, nic nie zapisano.'
    );
    return fail(409, {
      ok: false,
      step: 'shrink-guard',
      detail: `Lista skurczyla sie z ${previous.snapshot.entries.length} do ${next.entries.length}. Wyglada na awarie po stronie API, nie na wyrejestrowanie skarbcow.`,
      vaults: next.entries.length,
    });
  }

  // ===== 4. ROZNICE, POTEM STAN =====
  const changes = diffSnapshots(previous.snapshot, next);

  const changesWritten = await writeChanges(changes);
  if (!changesWritten.ok) {
    // Stan zostaje STARY. Jutrzejszy przebieg zobaczy te sama roznice jeszcze
    // raz i zapisze ja pod tym samym identyfikatorem.
    return fail(503, { ok: false, step: 'write-changes', detail: changesWritten.reason });
  }

  const stateWritten = await writeSnapshot(next);
  if (!stateWritten.ok) {
    return fail(503, {
      ok: false,
      step: 'write-state',
      detail: stateWritten.reason,
      changes: changes.length,
    });
  }

  return NextResponse.json({
    ok: true,
    step: 'done',
    vaults: next.entries.length,
    changes: changes.length,
    // Pierwszy przebieg w zyciu ma `changes: 0` i to nie jest blad: migawka
    // zerowa jest punktem odniesienia, a nie zdarzeniem.
    baseline: previous.snapshot === null,
    firstObservedAt: next.firstObservedAt,
    observedAt: next.observedAt,
  });
}
