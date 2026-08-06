'use client';

import Image from 'next/image';
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
 * monety - JEDNA NARAZ. Kiedy moneta dojezdza, obwodka znaku blyska raz
 * i moneta znika pod spodem: platnosc weszla do feedu.
 *
 * DLACZEGO JEDNA NARAZ. Siedem monet jednoczesnie to szum - oko nie ma czego
 * sledzic i caly obrazek zamienia sie w migotanie. Jedna moneta na przewodzie
 * jest zdarzeniem: da sie ja przeprowadzic wzrokiem od sieci do srodka. Rytm
 * (1,6 s na przyjazd) robi z tego puls rozliczen, a nie animacje.
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
  return (
    <section className="relative overflow-hidden rounded-card bg-gradient-to-b from-[#8E7BE8] via-[#7C6BDA] to-[#6656BE] px-6 py-10 text-center font-soft">
      {/* ===== ROZLICZENIE ===== */}
      <div
        aria-hidden="true"
        className="soft-settle-stage soft-hero-rise relative mx-auto mb-7 h-[200px] w-[200px] sm:h-[236px] sm:w-[236px]"
      >
        {/* Okrag sadzajacy wezly na jednym promieniu. Ledwo widoczny - ma
            trzymac uklad, a nie rywalizowac z przewodami. */}
        <span className="absolute left-1/2 top-1/2 h-[160px] w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 sm:h-[188px] sm:w-[188px]" />

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

              {/* Ujemne opoznienie przesuwa kazdy przewod o jedno okienko
                  w tym samym cyklu - dlatego w kadrze jest zawsze dokladnie
                  jedna moneta, bez zadnego JS-owego zegara. */}
              <span
                className="soft-wire-coin"
                style={{ animationDelay: `${-index * 1600}ms` }}
              />

              {/* Znak sieci odkreca sie o wlasny kat orbity - inaczej lezalby
                  na boku po lewej stronie kola. */}
              <span
                className="absolute left-full top-0 flex h-[26px] w-[26px] items-center justify-center rounded-[9px] bg-white/95 shadow-chip sm:h-[30px] sm:w-[30px]"
                style={{ transform: `translate(-50%, -50%) rotate(${-deg}deg)` }}
              >
                <Image
                  src={network.iconSrc}
                  alt=""
                  width={17}
                  height={17}
                  className="h-[15px] w-[15px] object-contain sm:h-[17px] sm:w-[17px]"
                />
              </span>
            </span>
          );
        })}

        {/* Blysk rozliczenia. Okres rowny odstepowi miedzy przyjazdami,
            opoznienie rowne czasowi przejazdu - blyska dokladnie wtedy, gdy
            moneta wchodzi pod znak marki. */}
        <span className="soft-settle-ring absolute left-1/2 top-1/2 h-[74px] w-[74px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-soft-accent sm:h-[86px] sm:w-[86px]" />

        {/* Znak marki. Rysowany na koncu, wiec moneta znika POD nim -
            to jest ten moment, w ktorym platnosc wchodzi do feedu. */}
        <span className="absolute left-1/2 top-1/2 flex h-[66px] w-[66px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_10px_28px_rgba(50,36,110,0.38)] sm:h-[76px] sm:w-[76px]">
          <Image
            src="/android-chrome-192x192.png"
            alt=""
            width={46}
            height={46}
            className="h-[40px] w-[40px] rounded-full object-contain sm:h-[46px] sm:w-[46px]"
            priority
          />
        </span>
      </div>

      <h1
        className="soft-hero-rise mb-3 font-soft-display text-[26px] font-bold leading-[1.15] text-white sm:text-[30px]"
        style={{ ['--rise-delay' as string]: '60ms' }}
      >
        Post, tip &amp; connect
        <br />
        onchain
      </h1>

      <p
        className="soft-hero-rise mx-auto mb-7 max-w-[34ch] text-[13.5px] font-semibold leading-[1.5] text-white/80"
        style={{ ['--rise-delay' as string]: '120ms' }}
      >
        Every tip here is a settled payment with a transaction hash anyone can check.
      </p>

      {/* Wezly na kole sa dla oka. Czytnik ekranu dostaje te sama liste
          slowami - z tej samej konfiguracji, wiec nie da sie jej rozjechac. */}
      <p className="sr-only">
        One feed across {SOFT_NETWORKS.length} networks:{' '}
        {SOFT_NETWORKS.map((network) => network.label).join(', ')}.
      </p>

      <div
        className="soft-hero-rise mx-auto flex max-w-[320px] flex-col gap-2.5"
        style={{ ['--rise-delay' as string]: '180ms' }}
      >
        <button
          type="button"
          onClick={onContinueWithBase}
          disabled={isBusy}
          className="rounded-pill bg-white px-5 py-3.5 font-soft text-[14.5px] font-bold text-soft-primary-deep shadow-float transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
        >
          {isBusy ? 'Check your wallet…' : 'Continue with Base Account'}
        </button>

        <button
          type="button"
          onClick={onUseAnotherWallet}
          disabled={isBusy}
          className="rounded-pill border border-white/45 px-5 py-3.5 font-soft text-[14.5px] font-semibold text-white transition-[background-color,transform] duration-[--dur-press] ease-out-strong hover:bg-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
        >
          Use another wallet
        </button>
      </div>

      {signedInAs && (
        <p className="mt-5 text-[12.5px] font-semibold text-white/90">Signed in as {signedInAs}</p>
      )}

      {statusMessage && (
        <p role="alert" className="mt-5 text-[12.5px] font-semibold text-[#FFD9C2]">
          {statusMessage}
        </p>
      )}
    </section>
  );
}
