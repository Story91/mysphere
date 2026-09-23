'use client';

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import AskCard, { formatAskMoney } from './AskCard';
import AskRailRow from './AskRailRow';
import FeedAnswerForm from './FeedAnswerForm';
import { getOpenAsks, getResolvedAsks } from '../../utils/asks/asks';
import { addTokenAmount, isExpired, type Ask, type TokenAmounts } from '../../utils/asks/types';
import { isSolAsk } from '../../utils/asks/solAmounts';
import { useIsFarcasterMiniApp } from '../../hooks/useIsFarcasterMiniApp';

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
 * W prawej kolumnie (`layout="column"`) ten sam chwyt w mniejszej skali:
 * zaglebienie wewnatrz bialej karty raila, a w nim biale kafle wierszy. Kafle
 * sa konieczne, nie ozdobne - kwota w `accent-deep` trzyma AA tylko na bieli.
 *
 * Aska od posta odroznia JEDEN kolor, morski `soft-ask` (pasek stanu na
 * AskCard, naglowek raila). Tlo i powloka sa te same co u posta.
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
  /**
   * `row`    poziomy pas nad lista postow. Domyslny i niezmieniony.
   * `column` biala karta w prawej kolumnie od progu `xl`, czyli od 1152px
   *          (tailwind.config.ts przesuwa progi w dol - to NIE jest domyslne
   *          1280px). Ta sama powloka co karty Trends pod nia.
   *
   * TO JEST WYLACZNIE UKLAD. Odczyty, cache, przelacznik Open/Resolved,
   * odsiew po terminie i miejscach, zwijanie pasa przy pisaniu odpowiedzi
   * i obsluga awarii sa wspolne dla obu wariantow - inaczej mielibysmy dwa
   * miejsca do naprawiania jednego bledu.
   */
  layout?: 'row' | 'column';
  className?: string;
};

function FeedAskRail({ viewer = null, layout = 'row', className = '' }: FeedAskRailProps) {
  const column = layout === 'column';
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

  /**
   * ===== ASKI SOL NIE W MINIAPPIE =====
   * W miniappie Farcastera portfel jest wylacznie EVM i zadnego portfela
   * Solany nie da sie tam podpiac - ani zeby zaplacic, ani zeby dostac
   * wyplate. Ask SOL w tym pasie bylby zaproszeniem do pracy, za ktora nie da
   * sie odebrac pieniedzy, wiec pas go tam nie pokazuje (spec: "tylko do
   * odczytu, ukryte w pasie feedu"). `null` (jeszcze nie wiemy) NIE chowa -
   * migniecie karty, ktora zaraz znika, jest gorsze niz jej obecnosc przez
   * ulamek sekundy w przegladarce, gdzie i tak zostanie.
   */
  const isMiniApp = useIsFarcasterMiniApp();
  const railVisible = (ask: Ask) => isMiniApp !== true || !isSolAsk(ask);

  // Odsiew na BIEZACYM czasie, nie na tym z chwili pobrania.
  const now = Date.now();
  /**
   * WSZYSTKIE otwarte, w ktore da sie jeszcze wejsc - nie tylko te pokazane.
   * Suma w naglowku liczy sie z tej listy, bo mowi o pieniadzach lezacych
   * na stole, a nie o pieniadzach lezacych na czterech pierwszych kartach.
   */
  const openAnswerable =
    openList.phase === 'ready'
      ? openList.asks.filter((ask) => isAnswerable(ask, now) && railVisible(ask))
      : [];
  const openShown = openAnswerable.slice(0, SHOW_LIMIT);

  /** Odczyt sie udal i nie zostalo nic, w co da sie jeszcze wejsc. */
  const openEmpty = openList.phase === 'ready' && openShown.length === 0;

  /**
   * ===== ILE PIENIEDZY LEZY NA STOLE =====
   *
   * `perAnswer * (seats - acceptedCount)`, czyli miejsca JESZCZE WOLNE. Suma
   * calych budzetow obejmowalaby takze miejsca juz zajete i oplacone, a
   * naglowek mowi o pieniadzach, ktore nadal da sie zgarnac.
   *
   * PER TOKEN, a nie w jednej liczbie. `Ask.token` domyslnie to USDC
   * i kompozytor wpisuje USDC na sztywno (useCreateAsk.ts), ale typ dopuszcza
   * inne. Zsumowanie roznych tokenow w jedno "$17.00" byloby napisem
   * nieprawdziwym. `addTokenAmount` jest do dokladnie tego i zwraca `false`,
   * gdy nie bylo czego dodac - takie pozycje liczymy osobno, jako "nie wiadomo
   * ile", zamiast wrzucac je jako zero.
   *
   * ZERO NOWYCH ODCZYTOW: liczone z tablicy, ktora komponent i tak juz ma.
   */
  const openMoney: TokenAmounts = {};
  let unpricedCount = 0;
  for (const ask of openAnswerable) {
    const seatsLeft = Math.max(0, ask.seats - ask.acceptedCount);
    if (!addTokenAmount(openMoney, ask.token, ask.perAnswer * seatsLeft)) unpricedCount += 1;
  }
  const moneyLines = Object.entries(openMoney).map(([token, amount]) =>
    formatAskMoney(amount, token)
  );

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
    resolvedList.phase === 'ready' ? resolvedList.asks.filter(railVisible).slice(0, SHOW_LIMIT) : [];

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
  const renderCards = (fullList: Ask[], archive = false) => {
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

    /**
     * WARIANT KOLUMNOWY. Ta sama lista, ten sam podzial na "odpowiadajacy
     * zostaje, autor wychodzi" - inny tylko ksztalt wiersza i kierunek.
     *
     * Formularz odpowiedzi nie dostaje tu wlasnej ramki: FeedAnswerForm
     * rysuje swoje pudelko sam (obwodka `soft-line` na bieli), a karta raila
     * jest juz biala. Ramka wokol ramki byla potrzebna tylko wtedy, gdy
     * formularz stal na granacie.
     *
     * `archive` (zakladka Resolved): wiersze leza w zaglebieniu `soft-sunken`
     * (DECYZJA 5), wiec kazdy dostaje WLASNA biala powierzchnie. Kwota
     * w `accent-deep` trzyma AA tylko na bieli (5.2:1); wprost na zaglebieniu
     * spada do 4.36:1. Z tego samego powodu miedzy wierszami jest odstep,
     * a nie linia - linia na zaglebieniu nie oddziela bialych kafli.
     */
    if (column) {
      return (
        <ul className={archive ? 'flex flex-col gap-1.5' : '-mx-1 flex flex-col'}>
          {list.map((ask) => {
            const isAuthor = viewerAddress !== null && ask.author.toLowerCase() === viewerAddress;
            const answerable =
              !isAuthor &&
              ask.status === 'open' &&
              ask.deadline > Date.now() &&
              ask.acceptedCount < ask.seats;

            return (
              <li
                key={ask.id}
                className={
                  archive
                    ? 'rounded-xl bg-soft-surface'
                    : 'border-t border-soft-line/60 first:border-t-0'
                }
              >
                <AskRailRow
                  ask={ask}
                  {...(answerable ? { onAnswer: () => setAnswering(ask.id) } : { href: '/asks' })}
                />
                {answering === ask.id && (
                  <div className="mx-1 mb-2">
                    <FeedAnswerForm
                      ask={ask}
                      onSent={bumpAnswerCount}
                      onClose={() => setAnswering(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      );
    }

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
              // `flex flex-col` razem z `flex-1` na karcie: wiersz i tak rownia
              // opakowania do najwyzszego (domyslny `align-items: stretch`), a
              // to sprawia, ze SAMA KARTA wypelnia swoje opakowanie. Bez tego
              // krotszy kafelek konczyl sie w powietrzu i rzad wygladal na
              // rozjechany.
              className={single ? 'w-full' : 'flex w-[290px] shrink-0 snap-start flex-col sm:w-[330px]'}
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
                // W rzedzie kart pytanie jest PRZYCINANE. Na /asks zostaje cale.
                clampQuestion={!single}
                className={single ? 'w-full' : 'w-full flex-1'}
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
      // Kolumna: ta sama powloka co karty Trends zaraz pod nia
      // (SoftTrendsPanel) - biel, `rounded-card`, `shadow-card`. Aska w tej
      // kolumnie poznaje sie po morskim naglowku, nie po innym tle.
      className={`font-soft ${column ? 'rounded-card bg-soft-surface p-4 shadow-card' : ''} ${className}`}
      aria-label={shownTab === 'open' ? 'Open asks' : 'Resolved asks'}
    >
      {column ? (
        /* ===== NAGLOWEK KOLUMNOWY: NAJPIERW LICZBA, POTEM LISTA =====
           Sama lista pytan nie mowi, ile tu lezy. Suma mowi to jednym rzutem
           oka i jest policzona z tych samych Askow, ktore widac pod nia -
           zadnego drugiego zrodla. Podpis nazywa zakres wprost, bo pas zna
           tylko FETCH_LIMIT najnowszych otwartych Askow i nie wolno mu
           udawac, ze zna wszystkie.

           Kolory: naglowek i kropka w morskim `soft-ask` - tym samym, ktory
           niesie pasek stanu na AskCard i licznik "Open Asks" w Trends. Suma
           w `accent-deep`, bo to kwota i stoi na bieli. */
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            {/* Krotko, bo w kolumnie 320px dluzszy naglowek lamal sie na dwie
                linie i wchodzil pod przelacznik. */}
            <h2 className="flex min-w-0 items-center gap-1.5 font-soft-display text-[10.5px] font-bold uppercase tracking-[0.14em] text-soft-ask-deep">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-soft-ask" aria-hidden="true" />
              <span className="truncate">
                {shownTab === 'open' ? 'Money on the table' : 'Resolved asks'}
              </span>
            </h2>
            <RailFilter value={shownTab} onPick={pick} />
          </div>
          {shownTab === 'open' && moneyLines.length > 0 && (
            <>
              <p className="font-soft-display text-[26px] font-bold leading-none text-soft-accent-deep">
                {moneyLines.join(' + ')}
              </p>
              <p className="mt-1 font-soft text-[11px] text-soft-ink-muted">
                across {openAnswerable.length}{' '}
                {openAnswerable.length === 1 ? 'open ask' : 'open asks'}
                {unpricedCount > 0 ? `, ${unpricedCount} without a listed budget` : ''}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-0.5">
          <h2 className="min-w-0 font-soft-display text-[13px] font-bold text-soft-ink">
            Asks
            <span className="ml-1.5 font-soft text-[12px] font-normal text-soft-ink-muted">
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
      )}

      {shownTab === 'open' ? (
        openList.phase === 'failed' ? (
          <FailedLine
            inset={column}
            onRetry={retryOpen}
            message="Open asks could not be checked. This is a failed read, not an empty list. The posts below are unaffected."
          />
        ) : openShown.length > 0 ? (
          renderCards(openShown)
        ) : (
          // Reczny wybor "Open" przy pustej liscie. Historii tu NIE
          // podstawiamy - filtr, ktory pokazuje co innego, niz na nim pisze,
          // jest gorszy niz puste miejsce. Zdanie mowi, gdzie sa tresci.
          <QuietLine inset={column}>
            No open asks right now. Nothing to answer at this moment, but resolved ones are still
            on the record.
          </QuietLine>
        )
      ) : resolvedList.phase === 'failed' ? (
        <FailedLine
          inset={column}
          onRetry={retryResolved}
          message="Resolved asks could not be loaded. This is a failed read, not an empty history. Open asks and the posts below are unaffected."
        />
      ) : resolvedList.phase === 'loading' ? (
        // Ponowna proba po awarii NIE MOZE zwinac pasa: naglowek i filtr
        // zostaja, zmienia sie sam srodek. Jedna linia, a nie szkielet karty -
        // szkielet obiecywalby karty, ktorych moze wcale nie byc.
        <QuietLine inset={column}>Checking resolved asks…</QuietLine>
      ) : resolvedShown.length > 0 ? (
        /*
          ===== HISTORIA SIEDZI W ZAGLEBIENIU =====
          Panel `soft-sunken` z obwodka to cala roznica wobec otwartych: biala
          karta WEWNATRZ zaglebienia czyta sie jak wpis w archiwum, a nie jak
          kafelek do klikniecia. Zadnego nowego koloru, zadnego akcentu -
          uzasadnienie przy DECYZJI 5.

          Przez okres granatowych kart Aska (od 2026-08-13) panelu tu nie
          bylo, bo jasne zaglebienie wokol ciemnych kart robilo sie ramka.
          Wrocil razem z biela, w obu ukladach. W kolumnie wiersze dostaja
          wlasne biale kafle (renderCards, `archive`), bo kwoty nie moga stac
          wprost na zaglebieniu.

          ZDANIE NAD LISTA NIE MOWI "paid". Przy escrow resolve() tylko
          przypisuje salda, a tokeny wychodza przy claim() - ta sama zasada
          co przy zdaniu o `funding` w AskCard.tsx. Prawda w obu wariantach
          jest tylko to, ze kazda przyjeta odpowiedz ma zapisana transakcje
          (POST /api/asks/[id]/accept odrzuca przyjecie bez hasha przelewu, a
          /escrow-resolve zapisuje hash transakcji resolve() przy kazdej
          przyznanej odpowiedzi).
        */
        <div
          className={
            column
              ? 'rounded-[18px] border border-soft-line bg-soft-sunken p-2'
              : 'rounded-card border border-soft-line bg-soft-sunken p-2.5 sm:p-3'
          }
        >
          <p
            className={`mb-2 text-[11.5px] leading-[1.45] text-soft-ink-muted ${
              column ? 'px-3' : 'px-0.5'
            }`}
          >
            Resolved by their authors. Nothing to answer here: each accepted answer is recorded
            with its transaction.
          </p>
          {renderCards(resolvedShown, true)}
        </div>
      ) : openList.phase === 'failed' ? (
        // Historia jest pusta, a otwartych NIE UDALO SIE sprawdzic. Nie wolno
        // tu napisac "nikt jeszcze nie zalozyl Aska" - tego wlasnie nie wiemy.
        <FailedLine
          inset={column}
          onRetry={retryOpen}
          message="No resolved asks yet, and open asks could not be checked. This is a failed read, not an empty list. The posts below are unaffected."
        />
      ) : openShown.length > 0 ? (
        // Historia pusta, ale otwarte SA - ktos siegnal po nia sam. "No asks
        // yet" bylo by tu klamstwem o produkcie, wiec mowimy dokladnie tyle,
        // ile wiemy, i wskazujemy druga pigulke.
        // "resolved", nie "closed and paid" - powod przy zdaniu nad historia.
        <QuietLine inset={column}>
          Nothing has been resolved yet. Asks that get resolved land here; the open ones are under
          Open.
        </QuietLine>
      ) : (
        // ===== PUSTY RYNEK TRZEBA NAZWAC =====
        // Obie listy odczytane, obie puste. To jedyny moment, w ktorym pas nie
        // ma zadnego Aska - i najlepszy, zeby powiedziec, po co on jest.
        <QuietLine inset={column}>
          No asks yet. An ask is a question with a budget, a deadline and a fixed number of seats.
          Answers stay sealed until the author resolves.{' '}
          <Link
            href="/asks"
            className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            See how asks work
          </Link>
        </QuietLine>
      )}

      {column && (
        /* Jedno wyjscie z karty. Prowadzi na /asks, bo tam jest cala lista,
           zakladanie wlasnego Aska i rozstrzyganie. Napis mowi, co sie stanie
           po klinieciu, a nie jak sie nazywa strona docelowa.

           Stal tu pomaranczowy przycisk wersalikami - wbrew DECYZJI 5
           (pomaranczowy nalezy wylacznie do kwot). Teraz fiolet jak kazda
           akcja w produkcie: pelny `primary-deep` (6.26:1 dla bieli; zwykly
           `primary` ma 4.22:1 i przy 12.5px nie trzyma AA) przy otwartych,
           gdzie jest co zrobic; obrysowana pigulka jak "Sell" w PostList
           przy historii, gdzie to zwykle przejscie dalej. Pelny wariant ma
           przezroczysta ramke 1px, bo obrysowany ja ma - bez niej przycisk
           zmienialby wysokosc o 2px przy przelaczaniu zakladek. */
        <Link
          href="/asks"
          className={`mt-3 block rounded-pill px-4 py-2.5 text-center font-soft-display text-[12.5px] font-bold transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface ${
            shownTab === 'open'
              ? 'border border-transparent bg-soft-primary-deep text-white shadow-chip hover:bg-soft-primary-deep/90'
              : 'border border-soft-line-strong bg-soft-surface text-soft-primary-deep hover:bg-soft-sunken'
          }`}
        >
          {shownTab === 'open' ? 'Answer an ask' : 'See all asks'}
        </Link>
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
 *
 * Jeden wariant na oba uklady - od kiedy karta raila jest biala, sciezka
 * `soft-sunken` czyta sie na niej tak samo jak na tle feedu.
 *   - Niewybrana pigulka w `ink-muted` (4.7:1 na sciezce). `ink-faint` mial
 *     tu 2.2:1, a `ink-soft` mialby 2.9:1 - oba to napis do zgadywania.
 *   - `ring-offset` w kolorze SCIEZKI, nie karty: przycisk lezy na
 *     `soft-sunken`, wiec offset w bieli rysowalby wokol niego jasna aureole.
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
            className={`rounded-pill px-2.5 py-[3px] font-soft-display text-[11px] font-semibold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-1 focus-visible:ring-offset-soft-sunken ${
              active ? 'bg-soft-surface text-soft-ink shadow-chip' : 'text-soft-ink-muted'
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
 * Zdanie zamiast kart. Pas ma zajmowac miejsce takze wtedy, gdy nie ma czego
 * pokazac, bo znikanie uczylo ludzi, ze tej funkcji nie ma.
 *
 * `inset` to POLOZENIE, nie motyw kolorystyczny:
 *   - bez niego (pas nad feedem) linia stoi wprost na tle strony, wiec jest
 *     wlasna biala karta z ta sama obwodka co reszta produktu,
 *   - z nim (wewnatrz bialej karty raila) biala karta w bialej karcie bylaby
 *     niewidoczna, wiec linia jest wpuszczona w `soft-sunken`.
 * Tekst w obu przypadkach `ink-muted` - na zaglebieniu trzyma 4.7:1.
 */
function QuietLine({ children, inset = false }: { children: ReactNode; inset?: boolean }) {
  return (
    <p
      className={
        inset
          ? 'rounded-[18px] bg-soft-sunken px-3.5 py-3 text-[12.5px] leading-[1.5] text-soft-ink-muted'
          : 'rounded-card border border-soft-line bg-soft-surface px-4 py-3 text-[12.5px] leading-[1.5] text-soft-ink-muted shadow-card'
      }
    >
      {children}
    </p>
  );
}

/**
 * Awaria ma wlasny slad na ekranie i wlasne wyjscie - nigdy nie udaje pustki.
 * `inset` jak przy QuietLine. "Try again" w `primary-deep`: biel na zwyklym
 * `soft-primary` ma 4.22:1 i przy 12px nie trzyma AA. Offset pierscienia
 * w kolorze tego, na czym przycisk lezy.
 */
function FailedLine({
  message,
  onRetry,
  inset = false,
}: {
  message: string;
  onRetry: () => void;
  inset?: boolean;
}) {
  return (
    <div
      role="status"
      className={
        inset
          ? 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[18px] bg-soft-sunken px-3.5 py-3'
          : 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-card border border-soft-line bg-soft-surface px-4 py-3 shadow-card'
      }
    >
      <p className="min-w-0 flex-1 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={`shrink-0 rounded-lg bg-soft-primary-deep px-3.5 py-1.5 font-soft-display text-[12px] font-semibold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${
          inset ? 'focus-visible:ring-offset-soft-sunken' : 'focus-visible:ring-offset-soft-surface'
        }`}
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
