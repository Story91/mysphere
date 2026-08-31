'use client';

import Image from 'next/image';
import Link from 'next/link';
import { SOFT_NETWORKS } from './SoftStoryRail';

/**
 * Ekran powitalny - pierwsza rzecz, jaka niezalogowany gosc widzi z produktu.
 *
 * === ELEMENT SYGNATUROWY: ROZLICZENIE ===
 * Bylo tu kolo z trzema awatarami krazacymi wokol znaku marki. Mowilo "ludzie
 * i marka", czyli dokladnie to samo, co powiedzialby ekran powitalny dowolnej
 * aplikacji spolecznosciowej. Nie mowilo nic o TYM produkcie.
 *
 * Teza MySphere jest inna: osia czasu sa PIENIADZE, nie tresc. Kazdy tip to
 * rozliczona platnosc, ktora da sie sprawdzic na lancuchu. Ekran powitalny ma
 * wiec pokazac jedna rzecz - jak pieniadz dociera tutaj z lancuchow.
 *
 * Uklad: znak marki w srodku, wokol niego wszystkie sieci z konfiguracji, a od
 * kazdej sieci biegnie do srodka przewod. Po przewodach jedza pomaranczowe
 * monety - JEDNA NARAZ. Kiedy moneta dojezdza, obwodka znaku blyska w TEJ
 * SAMEJ klatce i moneta znika pod tarcza: platnosc weszla do feedu.
 *
 * DLACZEGO JEDNA NARAZ. Siedem monet jednoczesnie to szum - oko nie ma czego
 * sledzic i caly obrazek zamienia sie w migotanie. Jedna moneta na przewodzie
 * jest zdarzeniem: da sie ja przeprowadzic wzrokiem od sieci do srodka. Rytm
 * (1,6 s na przyjazd) robi z tego puls rozliczen, a nie animacje.
 *
 * DLACZEGO PRZEJAZD SIE KONCZY. Kazdy lancuch wysyla dokladnie raz, po kolei,
 * a potem scena zastyga: moneta na kazdym przewodzie, obwodka przygaszona.
 * Petla bez konca twierdzilaby "2250 rozliczen na godzine, zawsze" - liczbe,
 * ktorej nikt nie sprawdzi, na ekranie, ktory kilka akapitow nizej obiecuje,
 * ze niczego tu nie zmyslamy. Skonczony przejazd twierdzi dokladnie tyle, ile
 * jest prawda: TE lancuchy tu rozliczaja. Dlugosc bierze sie z SOFT_NETWORKS,
 * wiec osmy lancuch wydluzy przejazd sam.
 *
 * DLACZEGO POMARANCZ TYLKO NA MONECIE. Pomaranczowy akcent jest w tym systemie
 * zarezerwowany dla pieniedzy. Wczesniej mial go wielki dysk pod znakiem marki,
 * czyli kolor pieniedzy nosil element, ktory z pieniedzmi nie ma nic wspolnego.
 * Teraz dysk jest bialy, a jedynym pomaranczem na ekranie jest to, co
 * faktycznie przeplywa - i blysk obwodki w chwili rozliczenia.
 *
 * === ZERO WYMYSLONYCH DANYCH ===
 * Nie ma tu ani jednej nazwy uzytkownika, kwoty, liczby lajkow ani hasha.
 * Produkt obiecuje liczby sprawdzalne - ekran powitalny nie moze otwierac sie
 * atrapa. Wszystko, co widac, pochodzi z SOFT_NETWORKS (prawdziwa konfiguracja
 * lancuchow) albo jest ksztaltem mechanizmu, nie danymi. Liczba sieci nie jest
 * nigdzie wpisana slownie - bierze sie z dlugosci tablicy, wiec nie ma jak sie
 * rozjechac po dodaniu kolejnego lancucha.
 *
 * === RUCH ===
 * Przejazd monety jest `linear`. Ruch ciagly po torze to jedyny przypadek,
 * w ktorym easing byloby bledem - przyspieszanie i zwalnianie na przewodzie
 * wyglada jak zacinanie. Blysk rozliczenia i wejscie ekranu maja
 * `--ease-out-strong`, bo to zdarzenia, a nie ruch ciagly.
 *
 * `prefers-reduced-motion: reduce` zatrzymuje wszystko, ale NICZEGO nie chowa:
 * monety zostaja zaparkowane na przewodach, obwodka rozliczenia zostaje
 * widoczna. Obrazek nadal mowi to samo zdanie, tylko go nie odgrywa.
 *
 * === DLACZEGO DWA PRZYCISKI, A NIE JEDEN ===
 * Base Account jest wyzej, bo dla kogos BEZ portfela to jedyna sciezka
 * konczaca sie sukcesem - zaklada sie go passkeyem, bez rozszerzenia. Ale to
 * nie jest jedyna opcja i przycisk nie moze tak wygladac: w configu siedzi
 * osiem konektorow.
 */

/** Kat kazdego wezla. Rowny rozstaw jest tu POPRAWNY: to schemat rozliczen,
 *  a nie grupa ludzi - zaden lancuch nie jest wazniejszy od pozostalych.
 *  Start od -90deg, zeby pierwsza siec (Base) stala na gorze. */
const STEP = 360 / SOFT_NETWORKS.length;

export default function SoftSignInHero({
  onContinueWithBase,
  onUseAnotherWallet,
  isBusy,
  statusMessage,
  signedInAs,
}: {
  onContinueWithBase: () => void;
  onUseAnotherWallet: () => void;
  isBusy?: boolean;
  statusMessage?: string | null;
  signedInAs?: string | null;
}) {
  // ===== NA DESKTOPIE SEKCJA ZAJMUJE CALE POLE POD NAWIGACJA =====
  // Byla wysoka na tyle, ile mierzyla jej tresc - okolo 300px - i siedziala
  // u gory kolumny wysokiej na caly ekran. Reszta byla pustym lawendowym tlem,
  // przez co ekran powitalny wygladal na splaszczony pasek, a nie na pierwszy
  // ekran produktu.
  //
  // `lg:min-h-full` dziala tu BEZ ZGADYWANIA WYSOKOSCI NAWIGACJI: powloka pod
  // paskiem ma `h-screen` (basechat/page.tsx), a kolumna glowna jest jej
  // dzieckiem z `flex-1`, wiec ma wysokosc definitywna. Procent liczy sie od
  // jej pola tresci, czyli juz po odjeciu `lg:pt-6 lg:pb-24`. Zadnego
  // calc(100vh - 4.5rem), ktore rozjezdza sie przy kazdej zmianie paska.
  //
  // Do tego `lg:flex lg:items-center`: przy wyzszej sekcji tresc ma stac
  // w pionowym srodku, a nie przykleic sie do gornej krawedzi.
  //
  // Scena rozliczen rosnie na `lg` proporcjonalnie (320px zamiast 236px),
  // bo diagram wielkosci znaczka w polu wysokim na caly ekran ginie.
  // Wymiary sceny, kola prowadzacego, tarczy i znakow sieci MUSZA zmieniac sie
  // razem z `--rail-len` i `--coin-in` w globals.css - inaczej monety jada
  // obok znakow albo wystaja spod tarczy.
  //
  // NA TELEFONIE BEZ ZMIAN - wszystkie nowe klasy sa za prefiksem `lg`.
  return (
    <section className="relative overflow-hidden rounded-card bg-gradient-to-b from-[#8E7BE8] via-[#7C6BDA] to-[#6656BE] px-6 py-10 text-center font-soft lg:flex lg:min-h-full lg:items-center lg:px-12 lg:py-14 lg:text-left">
      {/* ===== UKLAD NA DESKTOPIE: OBOK SIEBIE, NIE POD SOBA =====
          Ten ekran renderuje sie teraz na PELNEJ szerokosci kolumny glownej
          (patrz basechat/page.tsx, "EKRAN POWITALNY: NAD FEEDEM I POZA JEGO
          KOLUMNA"), a nie w waskiej kartce w srodku feedu.

          Sam gradient rozciagniety na cala szerokosc nie wystarczy: pionowy
          stos "obrazek - naglowek - przyciski" na szerokim ekranie robi kolumne
          tresci szeroka na 236px w pasie szerokim na 1400px, czyli zamienia
          jeden problem z pustka na drugi. Dlatego powyzej `lg` scena rozliczen
          idzie w lewo, a tekst i przyciski w prawo, oba w pionie wysrodkowane.

          PONIZEJ `lg` NIE ZMIENIA SIE NIC: bez `lg:flex` ten kontener jest
          zwyklym blokiem, wiec telefon dostaje ten sam wysrodkowany stos co
          dotad, z tymi samymi rozmiarami.

          Wewnetrzna miara 1080px nie jest oprawa ekranu (gradient idzie od
          krawedzi do krawedzi), tylko dlugoscia linii tekstu - bez niej
          naglowek na monitorze 2560px rozjezdza sie na pol ekranu. */}
      <div className="lg:mx-auto lg:flex lg:w-full lg:max-w-[1080px] lg:items-center lg:gap-16">
      {/* ===== ROZLICZENIE ===== */}
      {/* --settle-count: ILE RAZY ma sie odegrac przejazd. Bierze sie z dlugosci
          SOFT_NETWORKS, a nie z liczby wpisanej w CSS - dojdzie osmy lancuch
          i przejazd sam sie wydluzy. Wpisanie tu siodemki zlamaloby te sama
          zasade, ktora ten plik trzyma przy liczbie wezlow (patrz STEP). */}
      <div
        aria-hidden="true"
        className="soft-settle-stage soft-hero-rise relative mx-auto mb-7 h-[200px] w-[200px] sm:h-[236px] sm:w-[236px] lg:mb-0 lg:h-[320px] lg:w-[320px] lg:flex-none"
        style={{ ['--settle-count' as string]: SOFT_NETWORKS.length }}
      >
        {/* Okrag sadzajacy wezly na jednym promieniu. Ledwo widoczny - ma
            trzymac uklad, a nie rywalizowac z przewodami. */}
        <span className="absolute left-1/2 top-1/2 h-[160px] w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 sm:h-[188px] sm:w-[188px] lg:h-[256px] lg:w-[256px]" />

        {/* Przewody. Kazdy to jedno ramie obrocone o wlasny kat: linia,
            moneta jadaca do srodka i znak sieci na koncu. */}
        {SOFT_NETWORKS.map((network, index) => {
          const deg = -90 + index * STEP;

          return (
            <span
              key={network.id}
              className="soft-wire"
              style={{ transform: `rotate(${deg}deg)` }}
            >
              <span className="soft-wire-line" />

              {/* DODATNIE opoznienie: kazdy lancuch wysyla po kolei, zaczynajac
                  od pierwszego z konfiguracji. Bylo tu opoznienie UJEMNE
                  (-index * 1600ms) - dzialalo tylko przy petli bez konca i mialo
                  dwie wady. Odtwarzalo liste TYLEM (0, 6, 5, 4, 3, 2, 1), a przy
                  skonczonej liczbie powtorzen przewody 1-6 zaczynalyby PO swoim
                  oknie ruchu i nie ruszylyby sie ani razu.

                  W kadrze nadal jest dokladnie jedna moneta w ruchu, bo takt
                  (1600 ms) jest dluzszy od przejazdu (720 ms). Zadnego zegara
                  w JS, tak jak dotad. */}
              <span
                className="soft-wire-coin"
                style={{ ['--send-delay' as string]: `${index * 1600}ms` }}
              />

              {/* Znak sieci odkreca sie o wlasny kat orbity - inaczej lezalby
                  na boku po lewej stronie kola. */}
              <span
                className="absolute left-full top-0 flex h-[26px] w-[26px] items-center justify-center rounded-[9px] bg-white/95 shadow-chip sm:h-[30px] sm:w-[30px] lg:h-[40px] lg:w-[40px] lg:rounded-[12px]"
                style={{ transform: `translate(-50%, -50%) rotate(${-deg}deg)` }}
              >
                <Image
                  src={network.iconSrc}
                  alt=""
                  width={17}
                  height={17}
                  className="h-[15px] w-[15px] object-contain sm:h-[17px] sm:w-[17px] lg:h-[23px] lg:w-[23px]"
                />
              </span>
            </span>
          );
        })}

        {/* Blysk rozliczenia. Okres rowny odstepowi miedzy przyjazdami,
            opoznienie rowne czasowi przejazdu - blyska dokladnie wtedy, gdy
            moneta wchodzi pod znak marki. */}
        <span className="soft-settle-ring absolute left-1/2 top-1/2 h-[74px] w-[74px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-soft-accent sm:h-[86px] sm:w-[86px] lg:h-[118px] lg:w-[118px]" />

        {/* Znak marki. Rysowany na koncu, wiec moneta znika POD nim -
            to jest ten moment, w ktorym platnosc wchodzi do feedu. */}
        <span className="absolute left-1/2 top-1/2 flex h-[66px] w-[66px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_10px_28px_rgba(50,36,110,0.38)] sm:h-[76px] sm:w-[76px] lg:h-[104px] lg:w-[104px]">
          <Image
            src="/android-chrome-192x192.png"
            alt=""
            width={46}
            height={46}
            className="h-[40px] w-[40px] rounded-full object-contain sm:h-[46px] sm:w-[46px] lg:h-[64px] lg:w-[64px]"
            priority
          />
        </span>
      </div>

      {/* ===== NARRACJA WZIETA Z /re-definition, NIE WYMYSLONA TUTAJ =====
          Wczesniej staly tu slowa "Post, tip & connect onchain" - opis, ktory
          pasuje do kazdego produktu spolecznosciowego z portfelem i do
          zadnego w szczegolnosci.

          Manifest na /re-definition otwiera sie znacznikiem "$0.00 - what a
          like is worth" i zdaniem "A like costs nothing to give, so a thousand
          of them prove nothing". To jest teza calego produktu i ona ma stac
          na wejsciu, bo tylko ona odroznia to miejsce od reszty.

          Druga linijka bierze "$340 - the only score that costs money" oraz
          "A receipt spreads. A screenshot does not." - czyli mowi, co wchodzi
          w miejsce lajka.

          Gdy zmieni sie manifest, ten tekst ma sie zmienic razem z nim. */}
      {/* Prawa kolumna na desktopie; na telefonie zwykly blok, wiec stos
          zostaje dokladnie taki, jaki byl. */}
      <div className="lg:min-w-0 lg:flex-1">
      <h1
        className="soft-hero-rise mb-3 font-soft-display text-[26px] font-bold leading-[1.15] text-white sm:text-[30px] lg:text-[38px]"
        style={{ ['--rise-delay' as string]: '60ms' }}
      >
        A like is worth $0.00.
        <br />
        A payment is not.
      </h1>

      <p
        className="soft-hero-rise mx-auto mb-7 max-w-[36ch] text-[13.5px] font-semibold leading-[1.55] text-white/80 lg:mx-0 lg:max-w-[46ch] lg:text-[14.5px]"
        style={{ ['--rise-delay' as string]: '120ms' }}
      >
        Here the only score is one that cost somebody money, and every tip settles onchain
        with a hash anyone can open.
      </p>

      {/* Wezly na kole sa dla oka. Czytnik ekranu dostaje te sama liste
          slowami - z tej samej konfiguracji, wiec nie da sie jej rozjechac. */}
      <p className="sr-only">
        One feed across {SOFT_NETWORKS.length} networks:{' '}
        {SOFT_NETWORKS.map((network) => network.label).join(', ')}.
      </p>

      <div
        className="soft-hero-rise mx-auto flex max-w-[320px] flex-col gap-2.5 lg:mx-0 lg:max-w-none lg:flex-row lg:flex-wrap lg:justify-start"
        style={{ ['--rise-delay' as string]: '180ms' }}
      >
        <button
          type="button"
          onClick={onContinueWithBase}
          disabled={isBusy}
          className="rounded-pill bg-white px-5 py-3.5 font-soft text-[14.5px] font-bold text-soft-primary-deep shadow-float transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
        >
          {isBusy ? 'Check your wallet…' : 'Continue with Base Account'}
        </button>

        <button
          type="button"
          onClick={onUseAnotherWallet}
          disabled={isBusy}
          className="rounded-pill border border-white/45 px-5 py-3.5 font-soft text-[14.5px] font-semibold text-white transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
        >
          Use another wallet
        </button>
      </div>

      {/* Naglowek stawia mocna teze, wiec musi byc gdzie ja sprawdzic. To
          jedyne wyjscie z tego ekranu poza logowaniem - celowo ciche, zeby
          nie konkurowalo z przyciskami, i celowo obecne, bo twierdzenie bez
          uzasadnienia jest sloganem. `Link`, a nie `onClick` - to nawigacja,
          wiec ma dzialac srodkowym przyciskiem myszy i w nowej karcie. */}
      <Link
        href="/re-definition"
        className="soft-hero-rise mt-5 inline-block text-[12.5px] font-semibold text-white/70 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        style={{ ['--rise-delay' as string]: '240ms' }}
      >
        Why a like is worth nothing here
      </Link>

      {/* `soft-note` daje tym dwom komunikatom wejscie zamiast wyskoku - patrz
          globals.css. `role="alert"` zostaje: ogloszenie dla czytnika ekranu
          jest niezalezne od przejscia i ma sie odbyc tak samo. */}
      {signedInAs && (
        <p className="soft-note mt-5 text-[12.5px] font-semibold text-white/90">
          Signed in as {signedInAs}
        </p>
      )}

      {statusMessage && (
        <p role="alert" className="soft-note mt-5 text-[12.5px] font-semibold text-[#FFD9C2]">
          {statusMessage}
        </p>
      )}
      </div>
      </div>
    </section>
  );
}
