'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AskCard from './AskCard';
import { getOpenAsks } from '../../utils/asks/asks';
import { isExpired, type Ask } from '../../utils/asks/types';

/**
 * Aski NA FEEDZIE - wezszy pas nad lista postow.
 *
 * Do tej pory Aski zyly wylacznie na /asks, czyli na stronie, na ktora trzeba
 * bylo trafic. Feed jest miejscem, do ktorego ludzie wchodza sami, wiec Ask,
 * ktorego nikt nie widzi, jest Askiem bez odpowiedzi.
 *
 * ==================================================================
 * DECYZJA 1: OSOBNY PAS, A NIE WPLATANIE MIEDZY POSTY
 * ==================================================================
 * To jest glowna decyzja tego pliku, wiec uzasadnienie jest dlugie.
 *
 * (a) DWA ZRODLA, DWA KURSORY. PostList ma WLASNE dociaganie kolejnych stron
 *     (`displayLimit` i przycisk "load more"). Wspolne sortowanie po czasie
 *     znaczyloby, ze przy kazdej kolejnej stronie postow trzeba na nowo
 *     rozstrzygnac, ktore Aski wpadaja pomiedzy - czyli albo pobrac WSZYSTKIE
 *     Aski z gory (zapytanie bez sufitu), albo pytac o nie PRZY KAZDYM
 *     PRZEWINIECIU. Drugie jest wprost tym, czego ten feed nie moze robic:
 *     to najczesciej otwierana strona w produkcie i kazde dolozone zapytanie
 *     mnozy sie przez wszystkie wejscia.
 *
 * (b) PostList JEST W React.memo I SYNCHRONIZUJE STAN Z PROPSEM `posts`.
 *     Wsuniecie Askow do tej tablicy znaczy nowa tozsamosc tablicy przy kazdym
 *     przeliczeniu zlaczenia - a to KASUJE stan optymistyczny (serduszko
 *     wracajace do poprzedniego stanu mimo udanego zapisu). Ten blad byl tu
 *     realny i zostal naprawiony przez `visiblePosts` w page.tsx. Osobny pas
 *     nie dotyka `posts` ani jednym znakiem, wiec nie ma jak go przywrocic.
 *
 * (c) ASK TO NIE POST. Ma odliczanie, ktore TYKA, i wolne miejsca, ktore sie
 *     koncza. Wpleciony na pozycji 37 pokazywalby zegar tam, gdzie nikt juz
 *     nie dojedzie - a caly sens Aska polega na tym, ze wygasa.
 *
 * (d) AWARIA ZOSTAJE PO SWOJEJ STRONIE. Pas jest osobnym komponentem z wlasnym
 *     stanem, wiec nieudany odczyt Askow nie ma zadnej drogi do listy postow -
 *     i odwrotnie. Przy wspolnej tablicy jedno zapytanie przewracaloby oba.
 *
 * Cena tej decyzji jest uczciwa i warto ja nazwac: pas integruje slabiej niz
 * wplatanie. Ask nie stoi obok posta z tej samej godziny i nie wchodzi w rytm
 * przewijania. Placimy tym za feed, ktory nie kosztuje wiecej odczytow i nie
 * traci optymistycznych zmian.
 *
 * ==================================================================
 * DECYZJA 2: KTORE ASKI
 * ==================================================================
 * Otwarte, przed terminem, z wolnymi miejscami. Zamkniety Ask w feedzie jest
 * szumem: nie da sie na niego odpowiedziec, a zajmuje miejsce postowi.
 *
 * Termin i miejsca filtrujemy PO STRONIE KLIENTA i to nie jest lenistwo:
 *   - `status` NIKT nie przestawia na 'expired' (potwierdzone w calym repo -
 *     patrz komentarz w utils/money/getMoneyLedger.ts), wiec po terminie
 *     dokument dalej ma 'open'. Zapytanie o `deadline >` wymagaloby drugiego
 *     zakresu obok orderBy i osobnego indeksu.
 *   - `acceptedCount < seats` to porownanie DWOCH POL, czego Firestore nie
 *     potrafi w zapytaniu w ogole.
 * Dlatego bierzemy z zapasem (FETCH_LIMIT) i odsiewamy tutaj. Zapas jest
 * skonczony i maly - to wciaz JEDNO zapytanie z limitem.
 *
 * Filtr liczymy PRZY RENDERZE, a nie przy zapisie do cache'u: przez pieciominutowa
 * waznosc wpisu termin moze minac, a wtedy karta z cache'u pokazywalaby zegar
 * na 00:00:00 pod naglowkiem "Open asks".
 *
 * ==================================================================
 * DECYZJA 3: KOSZT
 * ==================================================================
 * JEDNO zapytanie z limitem, cache'owane w localStorage dokladnie tak jak posty
 * (ten sam ksztalt: wpis + osobny znacznik czasu, ta sama waznosc 5 minut,
 * patrz getCachedPosts/setCachedPosts w basechat/page.tsx). Efekt: wejscie na
 * feed w ciagu 5 minut od poprzedniego kosztuje ZERO odczytow, a przewijanie
 * nie kosztuje ich nigdy - pas nie ma kolejnych stron.
 *
 * NIE DOCIAGAMY tu wskaznika rozstrzygalnosci autora. Na /asks to osobne
 * zapytanie na KAZDEGO unikalnego autora; w feedzie pomnozylo by jedno
 * zapytanie przez cztery. AskCard bez `resolveRate` nie rysuje odznaki wcale -
 * czyli mowi "nie sprawdzilismy", a nie zmyslona zerowke. Kto chce zobaczyc
 * historie autora, ma po to /asks i przycisk na karcie tam prowadzi.
 *
 * Zapytanie `status == 'open'` + `orderBy createdAt desc` ma swoj indeks
 * zlozony w firestore.indexes.json (pierwsza pozycja listy) - sprawdzone, nic
 * nie trzeba dopisywac.
 *
 * ==================================================================
 * PUSTO, AWARIA I MILCZENIE
 * ==================================================================
 * Trzy rozne rzeczy i kazda wyglada inaczej:
 *   nie wczytano jeszcze -> nie rysujemy nic (patrz nizej, dlaczego bez atrapy)
 *   nie ma otwartych     -> nie rysujemy nic; pusto znaczy pusto
 *   odczyt PADL          -> jedna linia, ktora mowi to wprost, i "Try again"
 * Awaria NIE MOZE wygladac jak brak Askow, wiec jako jedyna z tych trzech
 * zostawia slad na ekranie. Zostawia go maly, bo to nie jest awaria feedu -
 * posty ponizej sa nietkniete i zdanie mowi o tym wprost.
 *
 * Atrapy ladowania (szkieletu karty) tu NIE MA celowo: pas najczesciej jest
 * pusty, wiec szkielet oznaczalby dziure na 300px u gory feedu u kazdego, kto
 * wchodzi - zapowiedz tresci, ktorej zwykle nie bedzie. Sciezka z cache'u i tak
 * wypelnia pas od razu.
 */

/** Ta sama waznosc co cache postow - pas ma sie starzec razem z feedem. */
const ASKS_CACHE_DURATION = 5 * 60 * 1000;
const ASKS_CACHE_KEY = 'asks_feedRail';

/**
 * Ile dokumentow bierze zapytanie, a ile kart trafia na ekran.
 *
 * Roznica to zapas na odsiew (termin i miejsca - patrz naglowek). Gorna granica
 * kosztu tego pasa to FETCH_LIMIT odczytow na 5 minut na przegladarke.
 */
const FETCH_LIMIT = 12;
const SHOW_LIMIT = 4;

type RailPhase = 'loading' | 'ready' | 'failed';

/** Odczyt cache'u. Zwraca `null` takze przy przeterminowanym wpisie. */
function getCachedAsks(): Ask[] | null {
  try {
    const cached = localStorage.getItem(ASKS_CACHE_KEY);
    const timestamp = localStorage.getItem(`${ASKS_CACHE_KEY}_timestamp`);
    if (!cached || !timestamp) return null;

    if (Date.now() - parseInt(timestamp, 10) >= ASKS_CACHE_DURATION) {
      localStorage.removeItem(ASKS_CACHE_KEY);
      localStorage.removeItem(`${ASKS_CACHE_KEY}_timestamp`);
      return null;
    }

    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? (parsed as Ask[]) : null;
  } catch (error) {
    console.error('[asks] Odczyt cache Askow nie powiodl sie:', error);
    return null;
  }
}

function setCachedAsks(asks: Ask[]): void {
  try {
    localStorage.setItem(ASKS_CACHE_KEY, JSON.stringify(asks));
    localStorage.setItem(`${ASKS_CACHE_KEY}_timestamp`, Date.now().toString());
  } catch (error) {
    console.error('[asks] Zapis cache Askow nie powiodl sie:', error);
  }
}

/** Czy tego Aska da sie jeszcze zajac. Liczone na BIEZACYM czasie - patrz naglowek. */
function isAnswerable(ask: Ask, now: number): boolean {
  return ask.status === 'open' && !isExpired(ask, now) && ask.acceptedCount < ask.seats;
}

export type FeedAskRailProps = {
  /**
   * Adres patrzacego, jesli jakis jest. Sluzy WYLACZNIE do napisu na przycisku:
   * autor nie moze odpowiedziec na wlasnego Aska (trasa odrzuca to z 403), wiec
   * "Answer" na jego karcie prowadzilby prosto w odmowe.
   */
  viewer?: string | null;
  className?: string;
};

function FeedAskRail({ viewer = null, className = '' }: FeedAskRailProps) {
  const [phase, setPhase] = useState<RailPhase>('loading');
  const [asks, setAsks] = useState<Ask[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Cache przed zapytaniem - tak samo jak przy postach. Trzymamy SUROWA
      // odpowiedz, odsiew idzie dopiero przy renderze.
      const cached = getCachedAsks();
      if (cached) {
        if (!cancelled) {
          setAsks(cached);
          setPhase('ready');
        }
        return;
      }

      const result = await getOpenAsks(FETCH_LIMIT);
      if (cancelled) return;

      if (result.failed) {
        // Nieudanego odczytu NIE zapisujemy do cache'u: pusta lista wygladalaby
        // przez 5 minut jak "nie ma zadnych Askow".
        setPhase('failed');
        return;
      }

      setCachedAsks(result.asks);
      setAsks(result.asks);
      setPhase('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setPhase('loading');
    setAttempt((value) => value + 1);
  }, []);

  if (phase === 'loading') return null;

  if (phase === 'failed') {
    return (
      <div
        role="status"
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-card border border-soft-line bg-soft-surface px-4 py-3 font-soft shadow-card ${className}`}
      >
        <p className="min-w-0 flex-1 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
          Open asks could not be checked. This is a failed read, not an empty list — the posts below
          are unaffected.
        </p>
        <button
          type="button"
          onClick={retry}
          className="shrink-0 rounded-lg bg-soft-primary px-3.5 py-1.5 font-soft-display text-[12px] font-semibold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
        >
          Try again
        </button>
      </div>
    );
  }

  // Odsiew na BIEZACYM czasie, nie na tym z chwili pobrania.
  const now = Date.now();
  const shown = asks.filter((ask) => isAnswerable(ask, now)).slice(0, SHOW_LIMIT);

  // Pusto znaczy pusto: bez otwartych Askow feed wyglada dokladnie tak jak
  // przedtem. Zadnej zachety, zadnej atrapy karty.
  if (shown.length === 0) return null;

  const viewerAddress = viewer ? viewer.toLowerCase() : null;
  const single = shown.length === 1;

  return (
    <section className={`font-soft ${className}`} aria-label="Open asks">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-0.5">
        <h2 className="font-soft-display text-[13px] font-bold text-soft-ink">
          Open asks
          <span className="ml-1.5 font-soft text-[12px] font-normal text-soft-ink-faint">
            questions with a budget and a deadline
          </span>
        </h2>
        <Link
          href="/asks"
          className="shrink-0 text-[12px] font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
        >
          See all
        </Link>
      </div>

      {/*
        Jedna karta dostaje pelna szerokosc kolumny - waski kafelek z pustka obok
        wygladalby jak niedokonczony pas. Od dwoch w gore jedziemy poziomo, zeby
        Aski nie zepchnely postow o kilka ekranow w dol. `snap` daje na telefonie
        zatrzymanie na karcie, a nie w polowie dwoch.
      */}
      <div
        className={
          single
            ? ''
            : '-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]'
        }
      >
        {shown.map((ask) => (
          <AskCard
            key={ask.id}
            ask={ask}
            // Bez `resolveRate` karta nie rysuje odznaki - "nie sprawdzilismy",
            // nie wyzerowany wskaznik. Powod przy naglowku (DECYZJA 3).
            isAuthor={viewerAddress !== null && ask.author.toLowerCase() === viewerAddress}
            // Przycisk prowadzi na /asks, bo TAM stoi panel odpowiedzi,
            // przyjmowania i rozstrzygania. Feed nie dubluje tamtej mechaniki.
            href="/asks"
            className={single ? 'w-full' : 'w-[290px] shrink-0 snap-start sm:w-[330px]'}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * memo, bo rodzicem jest feed, ktory przerysowuje sie przy kazdym nacisnieciu
 * klawisza w kompozytorze. Propsy sa proste (adres i klasa), wiec porownanie
 * plytkie wystarcza.
 */
export default memo(FeedAskRail);
