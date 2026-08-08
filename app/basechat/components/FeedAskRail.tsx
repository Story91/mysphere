'use client';

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import AskCard from './AskCard';
import FeedAnswerForm from './FeedAnswerForm';
import { getOpenAsks, getResolvedAsks } from '../../utils/asks/asks';
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
 * DECYZJA 2: PAS ISTNIEJE ZAWSZE - TAKZE GDY NIC NIE JEST OTWARTE
 * ==================================================================
 * Pierwsza wersja pokazywala WYLACZNIE otwarte Aski i znikala calkowicie, gdy
 * zadnego nie bylo. Domknelismy dwa Aski i pas przestal istniec - z feedu nie
 * dalo sie juz poznac, ze ta funkcja w produkcie w ogole jest. Znikajacy
 * element uczy tylko jednego: ze nie ma na co patrzec.
 *
 * Dlatego pas ma teraz trzy stany tresci i zaden z nich nie jest znikaniem:
 *   sa otwarte              -> karty otwartych, zaproszenie do odpowiedzi
 *   nie ma otwartych        -> HISTORIA, czyli rozstrzygniete (patrz DECYZJA 3)
 *   nie ma ani jednych, ani drugich -> jedno zdanie o tym, czym jest Ask
 *
 * Trzeci stan jest tani i wazny: pusty rynek trzeba nazwac, a nie ukryc. Zdanie
 * mowi, co Ask robi, i prowadzi na /asks - bo brak Askow to najlepszy moment,
 * zeby ktos zalozyl pierwszego.
 *
 * ==================================================================
 * DECYZJA 3: FILTR MA DWIE POZYCJE, NIE TRZY
 * ==================================================================
 * Przelacznik to `Open` / `Resolved` i CELOWO nie ma trzeciej pozycji "All".
 * Trzy powody, kazdy osobno wystarczajacy:
 *
 * (a) "All" musialoby trzymac OBIE listy naraz, czyli dokladnie ten koszt,
 *     ktorego ten pas ma nie miec (DECYZJA 4). Zakladka, ktorej nie da sie
 *     otworzyc bez dwoch zapytan, to zakladka placona przez kazde wejscie na
 *     feed, gdyby ktos zostawil ja jako ostatnio wybrana.
 * (b) "All" to jedna lista posortowana po czasie UTWORZENIA, w ktorej
 *     rozstrzygniete mieszaja sie z otwartymi - a to sa dwie rozne rzeczy dla
 *     czytelnika (w otwarte da sie jeszcze wejsc, rozstrzygniete sa do
 *     obejrzenia). To ten sam powod, dla ktorego warstwa danych ma dwa osobne
 *     zapytania zamiast `status in ['open','resolved']` - patrz getResolvedAsks.
 * (c) Pas pokazuje CZTERY karty. "All" w oknie na cztery karty znaczy "cztery
 *     najswiezsze z obu list", czyli moze zaslonic KAZDY otwarty Ask czterema
 *     rozstrzygnietymi. Odwrotnosc tego, po co ten pas stoi nad feedem.
 *
 * Slowa na pigulkach sa przepisane z paska stanu AskCard ("Open ask",
 * "Resolved"), a nie wymyslone tutaj. Trzecie slownictwo na to samo ("active",
 * "settled") kazaloby czytelnikowi zgadywac, czy to inny zbior.
 *
 * Na pigulkach NIE MA LICZNIKOW. Licznik przy "Resolved" wymagalby znajomosci
 * drugiej listy zanim ktokolwiek na nia spojrzy - czyli tego samego podwojnego
 * zapytania, ktorego unikamy.
 *
 * ==================================================================
 * DECYZJA 4: KOSZT - DRUGA LISTA DOPIERO NA ZADANIE
 * ==================================================================
 * Wejscie na feed pobiera JEDNA liste: otwarte. Rozstrzygniete dociagaja sie
 * wylacznie w dwoch przypadkach i oba sa swiadome:
 *   - ktos sam przelaczyl filtr,
 *   - otwartych NIE MA, wiec bez historii pas nie mialby czego pokazac
 *     (DECYZJA 2 - to jest cena za to, ze pas nie znika).
 * Kazda lista ma WLASNY wpis w localStorage z wlasnym znacznikiem czasu i ta
 * sama piecominutowa waznosc co posty (getCachedPosts/setCachedPosts w
 * basechat/page.tsx). Przelaczanie tam i z powrotem NIE kosztuje nic: obie
 * listy siedza juz w stanie komponentu, a po przeladowaniu strony w cache'u.
 *
 * Gorna granica kosztu tego pasa to FETCH_LIMIT + SHOW_LIMIT odczytow na piec
 * minut na przegladarke, i tylko wtedy, gdy ktos naprawde siegnal po historie.
 *
 * NIE DOCIAGAMY tu wskaznika rozstrzygalnosci autora. Na /asks to osobne
 * zapytanie na KAZDEGO unikalnego autora; w feedzie pomnozylo by jedno
 * zapytanie przez cztery. AskCard bez `resolveRate` nie rysuje odznaki wcale -
 * czyli mowi "nie sprawdzilismy", a nie zmyslona zerowke. Kto chce zobaczyc
 * historie autora, ma po to /asks i przycisk na karcie tam prowadzi.
 *
 * Oba zapytania (`status ==` + `orderBy createdAt desc`) chodza po TYM SAMYM
 * indeksie zlozonym, ktory jest juz wdrozony - nic nie trzeba dopisywac.
 *
 * ==================================================================
 * DECYZJA 5: ROZSTRZYGNIETE MAJA CZYTAC SIE INACZEJ
 * ==================================================================
 * Otwarty Ask jest ZAPROSZENIEM: mozna wejsc, zegar tyka, miejsce moze zniknac.
 * Rozstrzygniety jest ZAPISEM: nie da sie z nim nic zrobic, jest dowodem, ze
 * ktos zaplacil. Gdyby oba wygladaly tak samo, historia konkurowalaby wzrokowo
 * z jedyna rzecza w tym pasie, na ktora da sie zareagowac.
 *
 * Roznice robimy TLEM I OBWODKA, nie akcentem:
 *   otwarte      karty stoja wprost na tle feedu, naglowek pelnym `soft-ink`
 *   rozstrzygniete  caly zestaw siedzi WPUSZCZONY w panel `soft-sunken`
 *                   z obwodka `soft-line`, naglowek schodzi do `soft-ink-muted`
 * Karta na powierzchni w zaglebieniu czyta sie jak wpis w archiwum, a nie jak
 * kafelek do klikniecia - i dzieje sie to bez ani jednego nowego koloru.
 *
 * POMARANCZOWEGO (`soft-accent`) TU NIE MA I NIE MOZE BYC. Ten kolor nalezy
 * w tym produkcie WYLACZNIE do kwot - na karcie Aska trzyma budzet i stawke za
 * odpowiedz. Odroznienie stanu pomaranczem kazaloby czytac panel jak trzecia
 * liczbe z pieniedzmi.
 *
 * Nie nadpisujemy tez klas WEWNATRZ AskCard przez `className` (np. wlasnym
 * tlem karty). Dwie klasy na to samo pole CSS rozstrzyga kolejnosc w arkuszu,
 * a nie kolejnosc w atrybucie - taki "override" dziala przypadkiem i psuje sie
 * przy zmianie konfiguracji Tailwinda. Roznicujemy OTOCZENIE karty, ktore
 * nalezy do tego pliku w calosci.
 *
 * ==================================================================
 * PUSTO, AWARIA I MILCZENIE
 * ==================================================================
 * Cztery rozne rzeczy i kazda wyglada inaczej:
 *   nie wczytano jeszcze  -> nie rysujemy nic (patrz nizej, dlaczego bez atrapy)
 *   nie ma otwartych      -> historia albo zdanie zapraszajace; NIGDY znikniecie
 *   odczyt otwartych PADL -> jedna linia, ktora mowi to wprost, i "Try again"
 *   odczyt historii PADL  -> wlasna linia i wlasne "Try again", filtr zostaje
 * Awaria NIE MOZE wygladac jak brak Askow. Awaria JEDNEJ listy nie moze tez
 * zabrac drugiej: obie maja osobny stan, osobny cache i osobna ponowna probe,
 * wiec z komunikatu o bledzie historii wciaz da sie wrocic do otwartych (i na
 * odwrot). Posty ponizej sa w kazdym z tych przypadkow nietkniete.
 *
 * Atrapy ladowania (szkieletu karty) tu NIE MA celowo: pas w stanie pustym to
 * jedno zdanie, wiec szkielet karty zapowiadalby 300px tresci, ktorej czesto
 * nie bedzie. Sciezka z cache'u i tak wypelnia pas od razu.
 */

/** Ta sama waznosc co cache postow - pas ma sie starzec razem z feedem. */
const ASKS_CACHE_DURATION = 5 * 60 * 1000;

/**
 * Klucz cache'u OTWARTYCH.
 *
 * Wyeksportowany, bo feed uniewaznia ten wpis po zalozeniu Aska (inaczej autor
 * przez piec minut widzialby liste sprzed wlasnego Aska). Do tej pory stala
 * byla tam PRZEPISANA z tego pliku - dwie kopie jednego napisu, ktore rozjada
 * sie przy pierwszej zmianie nazwy.
 */
export const ASKS_RAIL_CACHE_KEY = 'asks_feedRail';

/**
 * Klucz cache'u ROZSTRZYGNIETYCH - osobny, bo to osobne zapytanie o osobnym
 * cyklu zycia. Zalozenie nowego Aska nie zmienia historii, wiec ten wpis nie
 * ma powodu ginac razem z tamtym.
 */
const RESOLVED_CACHE_KEY = 'asks_feedRail_resolved';

/**
 * Ile dokumentow bierze zapytanie, a ile kart trafia na ekran.
 *
 * Roznica dotyczy WYLACZNIE otwartych: tam dochodzi odsiew po terminie i
 * miejscach (patrz nizej), wiec bierzemy z zapasem. Rozstrzygniety Ask nie ma
 * czego stracic po drodze - jego zapytanie bierze dokladnie tyle, ile pokaze.
 */
const FETCH_LIMIT = 12;
const SHOW_LIMIT = 4;

/**
 * Co pokazuje pas. Wprost dwie wartosci, bez "all" - uzasadnienie w DECYZJI 3.
 */
type RailTab = 'open' | 'resolved';

type ListPhase = 'idle' | 'loading' | 'ready' | 'failed';

type ListState = {
  phase: ListPhase;
  asks: Ask[];
};

const IDLE: ListState = { phase: 'idle', asks: [] };

/** Odczyt cache'u. Zwraca `null` takze przy przeterminowanym wpisie. */
function readCachedAsks(key: string): Ask[] | null {
  try {
    const cached = localStorage.getItem(key);
    const timestamp = localStorage.getItem(`${key}_timestamp`);
    if (!cached || !timestamp) return null;

    if (Date.now() - parseInt(timestamp, 10) >= ASKS_CACHE_DURATION) {
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}_timestamp`);
      return null;
    }

    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? (parsed as Ask[]) : null;
  } catch (error) {
    console.error('[asks] Odczyt cache Askow nie powiodl sie:', error);
    return null;
  }
}

function writeCachedAsks(key: string, asks: Ask[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(asks));
    localStorage.setItem(`${key}_timestamp`, Date.now().toString());
  } catch (error) {
    console.error('[asks] Zapis cache Askow nie powiodl sie:', error);
  }
}

/**
 * Czy tego Aska da sie jeszcze zajac. Liczone na BIEZACYM czasie, a nie na tym
 * z chwili pobrania: przez piecominutowa waznosc wpisu termin moze minac,
 * a wtedy karta z cache'u pokazywalaby zegar na 00:00:00 pod slowem "Open".
 *
 * Termin i miejsca odsiewamy PO STRONIE KLIENTA i to nie jest lenistwo:
 *   - `status` NIKT nie przestawia na 'expired' (potwierdzone w calym repo -
 *     patrz komentarz w utils/money/getMoneyLedger.ts), wiec po terminie
 *     dokument dalej ma 'open'. Zapytanie o `deadline >` wymagaloby drugiego
 *     zakresu obok orderBy i osobnego indeksu.
 *   - `acceptedCount < seats` to porownanie DWOCH POL, czego Firestore nie
 *     potrafi w zapytaniu w ogole.
 */
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
  const [openList, setOpenList] = useState<ListState>({ phase: 'loading', asks: [] });
  const [resolvedList, setResolvedList] = useState<ListState>(IDLE);
  const [openAttempt, setOpenAttempt] = useState(0);
  const [resolvedAttempt, setResolvedAttempt] = useState(0);

  /**
   * Zakladka WYBRANA RECZNIE. `picked` jest osobno, bo brak wyboru to nie to
   * samo co wybor "open": dopoki nikt nie dotknal filtra, pas ma prawo sam
   * pokazac historie, gdy otwartych nie ma. Po recznym wyborze przestaje -
   * przelacznik, ktory sam sie przestawia, nie jest przelacznikiem.
   */
  const [tab, setTab] = useState<RailTab>('open');
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Cache przed zapytaniem - tak samo jak przy postach. Trzymamy SUROWA
      // odpowiedz, odsiew idzie dopiero przy renderze.
      const cached = readCachedAsks(ASKS_RAIL_CACHE_KEY);
      if (cached) {
        if (!cancelled) setOpenList({ phase: 'ready', asks: cached });
        return;
      }

      const result = await getOpenAsks(FETCH_LIMIT);
      if (cancelled) return;

      if (result.failed) {
        // Nieudanego odczytu NIE zapisujemy do cache'u: pusta lista wygladalaby
        // przez piec minut jak "nie ma zadnych Askow".
        setOpenList({ phase: 'failed', asks: [] });
        return;
      }

      writeCachedAsks(ASKS_RAIL_CACHE_KEY, result.asks);
      setOpenList({ phase: 'ready', asks: result.asks });
    })();

    return () => {
      cancelled = true;
    };
  }, [openAttempt]);

  // Odsiew na BIEZACYM czasie, nie na tym z chwili pobrania.
  const now = Date.now();
  const openShown =
    openList.phase === 'ready'
      ? openList.asks.filter((ask) => isAnswerable(ask, now)).slice(0, SHOW_LIMIT)
      : [];

  /** Odczyt sie udal i nie zostalo nic, w co da sie jeszcze wejsc. */
  const openEmpty = openList.phase === 'ready' && openShown.length === 0;

  /**
   * Co pas rzeczywiscie pokazuje. Reczny wybor ma pierwszenstwo; bez niego
   * pusta lista otwartych przerzuca pas na historie - to jest cala mechanika
   * "jesli nie ma active, wyswietl historyczne".
   */
  const shownTab: RailTab = picked ? tab : openEmpty ? 'resolved' : 'open';

  /**
   * Historie dociagamy DOPIERO tutaj - gdy pas naprawde ma ja pokazac. Ref, a
   * nie sama faza: bez niego przelaczanie zakladek tam i z powrotem wysylalo by
   * zapytanie za kazdym powrotem, mimo ze odpowiedz siedzi juz w stanie.
   */
  const resolvedRequested = useRef(false);
  const needResolved = shownTab === 'resolved';

  useEffect(() => {
    if (!needResolved || resolvedRequested.current) return;
    resolvedRequested.current = true;

    // Cache czytamy SYNCHRONICZNIE, przed przestawieniem na 'loading'. Gdyby
    // szedl przez `await`, kazde trafienie w cache mignelo by najpierw linijka
    // "Checking resolved asks…" - czyli komunikatem o czekaniu na cos, co juz
    // lezy w kieszeni.
    const cached = readCachedAsks(RESOLVED_CACHE_KEY);
    if (cached) {
      setResolvedList({ phase: 'ready', asks: cached });
      return;
    }

    let cancelled = false;
    setResolvedList({ phase: 'loading', asks: [] });

    (async () => {
      // Bez zapasu: rozstrzygniety Ask nie odpada juz na zadnym odsiewie, wiec
      // bierzemy dokladnie tyle dokumentow, ile pokazemy.
      const result = await getResolvedAsks(SHOW_LIMIT);
      if (cancelled) return;

      if (result.failed) {
        setResolvedList({ phase: 'failed', asks: [] });
        return;
      }

      writeCachedAsks(RESOLVED_CACHE_KEY, result.asks);
      setResolvedList({ phase: 'ready', asks: result.asks });
    })();

    return () => {
      cancelled = true;
    };
  }, [needResolved, resolvedAttempt]);

  const retryOpen = useCallback(() => {
    setOpenList({ phase: 'loading', asks: [] });
    setOpenAttempt((value) => value + 1);
  }, []);

  const retryResolved = useCallback(() => {
    resolvedRequested.current = false;
    setResolvedAttempt((value) => value + 1);
  }, []);

  const pick = useCallback((next: RailTab) => {
    setTab(next);
    setPicked(true);
  }, []);

  /** Ktory Ask ma otwarty formularz odpowiedzi. Najwyzej jeden naraz. */
  const [answering, setAnswering] = useState<string | null>(null);

  /**
   * Po wyslanej odpowiedzi podbijamy licznik NA MIEJSCU, zamiast pobierac
   * liste jeszcze raz.
   *
   * Ponowny odczyt kosztowalby zapytanie zaraz po tym, jak juz wiemy, co sie
   * zmienilo - a przy nieudanym odczycie zamienilby potwierdzenie sukcesu
   * w komunikat awarii. To ta sama zasada, ktora rzadzi uniewaznianiem cache'u
   * po zalozeniu Aska: swiezosc bierzemy przy najblizszym wejsciu, nie zaraz
   * po udanej akcji.
   *
   * Cache w localStorage zostaje nietkniety celowo: niesie stan sprzed
   * odpowiedzi, a rozjazd o jeden w liczniku jest tansza pomylka niz zapisanie
   * do kieszeni czegos, czego serwer jeszcze nie potwierdzil.
   */
  const bumpAnswerCount = useCallback((askId: string) => {
    setOpenList((previous) => ({
      ...previous,
      asks: previous.asks.map((item) =>
        item.id === askId ? { ...item, answerCount: item.answerCount + 1 } : item
      ),
    }));
  }, []);

  const resolvedShown =
    resolvedList.phase === 'ready' ? resolvedList.asks.slice(0, SHOW_LIMIT) : [];

  // ===== PIERWSZE WEJSCIE: NIC, DOPOKI NIE WIEMY, CO POKAZAC =====
  // Pas w stanie pustym to jedno zdanie, a nie kafelek - naglowek narysowany
  // przed odpowiedzia zapowiadalby wiecej, niz potem stanie. Sciezka z cache'u
  // omija ten stan calkowicie.
  //
  // 'idle' historii trwa doslownie jeden render (efekt przestawia ja na
  // 'loading' natychmiast), wiec tez nie ma czego rysowac. Samo 'loading' juz
  // NIE znika - patrz nizej.
  if (openList.phase === 'loading') return null;
  if (shownTab === 'resolved' && resolvedList.phase === 'idle') return null;

  const viewerAddress = viewer ? viewer.toLowerCase() : null;

  /**
   * Jedna karta dostaje pelna szerokosc kolumny - waski kafelek z pustka obok
   * wygladalby jak niedokonczony pas. Od dwoch w gore jedziemy poziomo, zeby
   * Aski nie zepchnely postow o kilka ekranow w dol. `snap` daje na telefonie
   * zatrzymanie na karcie, a nie w polowie dwoch.
   */
  const renderCards = (fullList: Ask[]) => {
    /**
     * ===== PISANIE ODPOWIEDZI ZWIJA PAS DO JEDNEJ KARTY =====
     * Karty stoja w poziomej karuzeli po 290px. Formularz w takiej kolumnie
     * znaczylby pisanie w waskim pasku, ktory jeszcze przewija sie na boki pod
     * palcem - na telefonie nie do uzycia.
     *
     * Gdy ktos zaczyna odpowiadac, pas pokazuje WYLACZNIE tego Aska, na pelnej
     * szerokosci. Reszta wraca po zamknieciu formularza; nic nie jest tracone,
     * a uwaga i tak jest wtedy przy jednym pytaniu.
     */
    const focused = answering ? fullList.find((item) => item.id === answering) : undefined;
    const list = focused ? [focused] : fullList;
    const single = list.length === 1;
    return (
      <div
        className={
          single
            ? ''
            : '-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]'
        }
      >
        {list.map((ask) => {
          const isAuthor = viewerAddress !== null && ask.author.toLowerCase() === viewerAddress;
          /**
           * Czy da sie jeszcze zajac miejsce. Liczone z BIEZACEGO czasu, bo
           * karta moze wisiec na ekranie dluzej niz do terminu.
           */
          const answerable =
            !isAuthor &&
            ask.status === 'open' &&
            ask.deadline > Date.now() &&
            ask.acceptedCount < ask.seats;

          return (
            <div
              key={ask.id}
              className={single ? 'w-full' : 'w-[290px] shrink-0 snap-start sm:w-[330px]'}
            >
              <AskCard
                ask={ask}
                // Bez `resolveRate` karta nie rysuje odznaki - "nie sprawdzilismy",
                // nie wyzerowany wskaznik. Powod przy naglowku (DECYZJA 4).
                isAuthor={isAuthor}
                /**
                 * ===== ODPOWIADAJACY ZOSTAJE, AUTOR WYCHODZI =====
                 * Dla odpowiadajacego przycisk otwiera formularz TUTAJ: cala
                 * wartosc Aska jest ograniczona terminem, a kazde przekierowanie
                 * to miejsce, w ktorym czesc ludzi odpada.
                 *
                 * Autor dalej idzie na /asks i tak ma zostac. Jego robota to
                 * otwieranie zapieczetowanych odpowiedzi i rozstrzyganie
                 * z platnoscia - portfel, podpis, czasem dwie transakcje. To
                 * jest praca na wlasnym ekranie, nie w pasku nad postami.
                 *
                 * Po terminie albo przy komplecie miejsc nie ma czego otwierac,
                 * wiec karta wraca do zwyklego odnosnika - martwy formularz
                 * byl by gorszy niz jego brak.
                 */
                {...(answerable
                  ? { onAnswer: () => setAnswering(ask.id) }
                  : { href: '/asks' })}
                className="w-full"
              />
              {answering === ask.id && (
                <FeedAnswerForm
                  ask={ask}
                  onSent={bumpAnswerCount}
                  onClose={() => setAnswering(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section
      className={`font-soft ${className}`}
      aria-label={shownTab === 'open' ? 'Open asks' : 'Resolved asks'}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-0.5">
        <h2 className="min-w-0 font-soft-display text-[13px] font-bold text-soft-ink">
          Asks
          <span className="ml-1.5 font-soft text-[12px] font-normal text-soft-ink-faint">
            questions with a budget and a deadline
          </span>
        </h2>

        <div className="flex shrink-0 items-center gap-2.5">
          <RailFilter value={shownTab} onPick={pick} />
          <Link
            href="/asks"
            className="shrink-0 text-[12px] font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            See all
          </Link>
        </div>
      </div>

      {shownTab === 'open' ? (
        openList.phase === 'failed' ? (
          <FailedLine
            onRetry={retryOpen}
            message="Open asks could not be checked. This is a failed read, not an empty list — the posts below are unaffected."
          />
        ) : openShown.length > 0 ? (
          renderCards(openShown)
        ) : (
          // Reczny wybor "Open" przy pustej liscie. Historii tu NIE
          // podstawiamy - filtr, ktory pokazuje co innego, niz na nim pisze,
          // jest gorszy niz puste miejsce. Zdanie mowi, gdzie sa tresci.
          <QuietLine>
            No open asks right now. Nothing to answer at this moment — resolved ones are still on
            the record.
          </QuietLine>
        )
      ) : resolvedList.phase === 'failed' ? (
        <FailedLine
          onRetry={retryResolved}
          message="Resolved asks could not be loaded. This is a failed read, not an empty history — open asks and the posts below are unaffected."
        />
      ) : resolvedList.phase === 'loading' ? (
        // Ponowna proba po awarii NIE MOZE zwinac pasa: naglowek i filtr
        // zostaja, zmienia sie sam srodek. Jedna linia, a nie szkielet karty -
        // szkielet obiecywalby karty, ktorych moze wcale nie byc.
        <QuietLine>Checking resolved asks…</QuietLine>
      ) : resolvedShown.length > 0 ? (
        /*
          ===== HISTORIA SIEDZI W ZAGLEBIENIU =====
          Panel `soft-sunken` z obwodka to cala roznica wobec otwartych: karta
          na powierzchni WEWNATRZ zaglebienia czyta sie jak wpis w archiwum,
          a nie jak kafelek do klikniecia. Zadnego nowego koloru, zadnego
          akcentu - uzasadnienie przy DECYZJI 5.
        */
        <div className="rounded-card border border-soft-line bg-soft-sunken p-2.5 sm:p-3">
          <p className="mb-2 px-0.5 text-[11.5px] leading-[1.45] text-soft-ink-muted">
            Closed and paid. Nothing to answer here — each accepted answer already carries the
            transaction that paid for it.
          </p>
          {renderCards(resolvedShown)}
        </div>
      ) : openList.phase === 'failed' ? (
        // Historia jest pusta, a otwartych NIE UDALO SIE sprawdzic. Nie wolno
        // tu napisac "nikt jeszcze nie zalozyl Aska" - tego wlasnie nie wiemy.
        <FailedLine
          onRetry={retryOpen}
          message="No resolved asks yet, and open asks could not be checked. This is a failed read, not an empty list — the posts below are unaffected."
        />
      ) : openShown.length > 0 ? (
        // Historia pusta, ale otwarte SA - ktos siegnal po nia sam. "No asks
        // yet" bylo by tu klamstwem o produkcie, wiec mowimy dokladnie tyle,
        // ile wiemy, i wskazujemy druga pigulke.
        <QuietLine>
          Nothing has been resolved yet. Asks that get closed and paid land here — the open ones are
          under Open.
        </QuietLine>
      ) : (
        // ===== PUSTY RYNEK TRZEBA NAZWAC =====
        // Obie listy odczytane, obie puste. To jedyny moment, w ktorym pas nie
        // ma zadnego Aska - i najlepszy, zeby powiedziec, po co on jest.
        <QuietLine>
          No asks yet. An ask is a question with a budget, a deadline and a fixed number of seats —
          answers stay sealed until the author resolves and pays.{' '}
          <Link
            href="/asks"
            className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            See how asks work
          </Link>
        </QuietLine>
      )}
    </section>
  );
}

/**
 * Przelacznik. MALY z zalozenia: to pas nad feedem, a nie strona /asks - filtr
 * ma byc do znalezienia, gdy sie go szuka, i niewidoczny, gdy sie go nie szuka.
 *
 * Sciezka `bg-soft-sunken` + wybrana pigulka na `bg-soft-surface` to ten sam
 * chwyt, ktorym rozniamy historie od otwartych: wybrane jest WYZEJ, reszta
 * lezy w zaglebieniu. Ruch wylacznie na transform, czas przez zmienna -
 * `duration-[--dur-press]` NIE KOMPILUJE SIE i nie wolno go tu wpisac.
 */
function RailFilter({ value, onPick }: { value: RailTab; onPick: (next: RailTab) => void }) {
  const options: { key: RailTab; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'resolved', label: 'Resolved' },
  ];

  return (
    <div
      role="group"
      aria-label="Filter asks"
      className="flex shrink-0 items-center gap-0.5 rounded-pill border border-soft-line bg-soft-sunken p-0.5"
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(option.key)}
            className={`rounded-pill px-2.5 py-[3px] font-soft-display text-[11px] font-semibold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-1 focus-visible:ring-offset-soft-bg ${
              active ? 'bg-soft-surface text-soft-ink shadow-chip' : 'text-soft-ink-faint'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Zdanie zamiast kart. Jedna linia w karcie o tej samej obwodce co reszta
 * produktu - pas ma zajmowac miejsce takze wtedy, gdy nie ma czego pokazac,
 * bo znikanie uczylo ludzi, ze tej funkcji nie ma.
 */
function QuietLine({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-soft-line bg-soft-surface px-4 py-3 text-[12.5px] leading-[1.5] text-soft-ink-muted shadow-card">
      {children}
    </p>
  );
}

/** Awaria ma wlasny slad na ekranie i wlasne wyjscie - nigdy nie udaje pustki. */
function FailedLine({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-card border border-soft-line bg-soft-surface px-4 py-3 shadow-card"
    >
      <p className="min-w-0 flex-1 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-lg bg-soft-primary px-3.5 py-1.5 font-soft-display text-[12px] font-semibold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
      >
        Try again
      </button>
    </div>
  );
}

/**
 * memo, bo rodzicem jest feed, ktory przerysowuje sie przy kazdym nacisnieciu
 * klawisza w kompozytorze. Propsy sa proste (adres i klasa), wiec porownanie
 * plytkie wystarcza.
 */
export default memo(FeedAskRail);
