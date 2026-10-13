'use client';

/**
 * Wspolny jezyk wizualny podstron $SPHERE (redesign 2026-08-31).
 *
 * Overview ustawil ton: hero z poswiata, WIELKIE tykajace liczby, kafle
 * zamiast tabelek, zero akapitow. Te klocki niosa ten ton na wszystkie
 * podstrony, zeby kazda wygladala jak ta sama aplikacja.
 *
 * Zasada tresci: dlugie objasnienia mieszkaja na /about. Tutaj co najwyzej
 * JEDNA linijka podpisu pod naglowkiem.
 */

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import { useSphereCreator } from './sphereActions';
import { ArrowUpRight, ChevronDown, Copy, ExternalLink } from 'lucide-react';
import { SPHERE_EXPLORER_URL } from './sphereChain';
import NumberTicker from './NumberTicker';

/** Naglowek podstrony z poswiata - odpowiednik hero z Overview, nizszy. */
export function PageHero({
  title,
  tagline,
  badge,
  icon,
  children,
}: {
  title: string;
  tagline?: string;
  badge?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="sph-hero rounded-card border border-sp-shade/10 p-5 sm:p-6">
      <div className="sph-orb left-[-50px] top-[-70px] h-44 w-44 bg-sp-brand/35" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-soft-display text-[20px] font-extrabold leading-tight tracking-[-0.01em] text-sp-ink sm:text-[22px]">
              {icon}
              {title}
            </h2>
            {tagline && <p className="mt-1 text-[12px] font-bold text-sp-shade/55">{tagline}</p>}
          </div>
          {badge}
        </div>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  WIELKA LICZBA                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Szerokosc napisu w "em" wlasnego stopnia pisma. Baloo 2 w wariancie
 * tabularnym daje cyfrze ~0.60em, a przecinkowi/kropce ~0.32em - zmierzone
 * na hubie: "59,332,928" przy 27px zajmowalo 147px, czyli 5.44em.
 */
function textEm(text: string): number {
  let w = 0;
  for (const ch of text) w += ch === ',' || ch === '.' || ch === ' ' ? 0.32 : 0.6;
  return w;
}

/**
 * Liczba z jednostka - wspolny silnik `BigStat` i hubowego `HeroStat`.
 *
 * ===========================================================================
 * DLACZEGO TO NIE JEST ZWYKLY <span> Z ml-1 (10 wrzesnia 2026)
 * ===========================================================================
 * Poprzednia wersja sklejala tykajaca liczbe i sufiks w JEDEN ciag inline:
 * `<NumberTicker/>{suffix && <span className="ml-1">…</span>}`. Miedzy tymi
 * dwoma wyrazeniami JSX nie ma bialego znaku, a margines nie jest miejscem
 * zlamania - dla przegladarki "59,332,928SPHERE" to jedno, NIEZLAMYWALNE
 * slowo. Kafel w siatce byl wezszy, `.sph-hero` ma `overflow: hidden`, wiec
 * jednostka wychodzila poza krawedz i byla scinana w polowie litery:
 * wlasciciel zobaczyl "59,332,928 SPHERI". Zmierzone przed poprawka przy
 * 1440px: scrollWidth 201px w clientWidth 175px.
 *
 * Poprawka jest strukturalna, nie kosmetyczna - trzy niezalezne zabezpieczenia:
 *
 *  1. Liczba i jednostka to DWA elementy flex, a nie jeden ciag tekstu. Miedzy
 *     elementami flex zawsze wolno zlamac wiersz, wiec nie da sie ich na
 *     siebie nasunac ani skleic w jedno slowo.
 *  2. Stopien pisma liczy sie z SZEROKOSCI KAFLA (`cqi`) i z DLUGOSCI tej
 *     konkretnej wartosci, a nie z punktu widokowego. Kafel deklaruje
 *     `container-type: inline-size`, a `clamp()` dzieli jego szerokosc przez
 *     zmierzona szerokosc napisu w em. Dluzsza liczba = mniejszy stopien,
 *     automatycznie, bez zgadywania breakpointow. Jednostka skaluje sie razem
 *     (0.45em), wiec proporcja z projektu zostaje.
 *  3. Gdyby i to nie starczylo (skrajnie waski kafel, dolny prog stopnia),
 *     jednostka spada do drugiego wiersza zamiast wyjsc poza kafel, a
 *     `overflow-wrap: anywhere` pilnuje samych cyfr.
 *
 * Dolny prog istnieje po to, zeby "wielka liczba" nie zrobila sie petitem;
 * gorny - zeby krotka wartosc ("1.00%") nie urosla na cala szerokosc.
 */
export function StatValue({
  value,
  decimals = 0,
  suffix,
  max,
  min = 17,
  className = '',
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  /** Gorny prog stopnia pisma w px - tyle, ile kafel mial w projekcie. */
  max: number;
  min?: number;
  className?: string;
}) {
  const text = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // Budzet szerokosci: cyfry + odstep + jednostka (jednostka ma 0.45em, wiec
  // jej litera to ~0.32em stopnia glownego). 2px zapasu na zaokraglenia.
  const em = textEm(text) + (suffix ? 0.22 + suffix.length * 0.32 : 0);
  return (
    <span
      className={`flex flex-wrap items-baseline gap-x-[0.18em] leading-none ${className}`}
      style={{ fontSize: `clamp(${min}px, calc((100cqi - 2px) / ${em.toFixed(2)}), ${max}px)` }}
    >
      <NumberTicker value={value} decimals={decimals} className="min-w-0 [overflow-wrap:anywhere]" />
      {suffix && <span className="text-[0.45em] font-bold text-sp-shade/50">{suffix}</span>}
    </span>
  );
}

/**
 * Kafel liczby. `container-type: inline-size` MUSI siedziec tutaj, nie na
 * wierszu z liczba: `cqi` odpytuje najblizszego PRZODKA, element nie moze
 * zapytac sam siebie. `min-w-0` odbiera kafelkowi domyslne `min-width: auto`
 * z siatki, przez ktore szeroka tresc rozpychala tor zamiast sie zmiescic.
 */
export function StatShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-xl bg-sp-sunken p-3.5 ${className}`} style={{ containerType: 'inline-size' }}>
      {children}
    </div>
  );
}

/** Wielka liczba - glowny nosnik informacji na podstronach. */
export function BigStat({
  label,
  value,
  decimals = 4,
  suffix,
  tone = 'ink',
  hint,
}: {
  label: string;
  value: number | null;
  decimals?: number;
  suffix?: string;
  tone?: 'ink' | 'brand' | 'up' | 'down';
  hint?: string;
}) {
  const toneClass =
    tone === 'brand' ? 'text-sp-brand' : tone === 'up' ? 'text-sp-up' : tone === 'down' ? 'text-sp-down' : 'text-sp-ink';
  return (
    <StatShell>
      <p className="text-[12px] font-semibold text-sp-shade/60">{label}</p>
      <div className={`mt-1 font-soft-display font-extrabold ${toneClass}`}>
        {value === null ? (
          <span className="sph-skeleton inline-block h-6 w-20 align-middle" />
        ) : (
          <StatValue value={value} decimals={decimals} suffix={suffix} max={27} />
        )}
      </div>
      {hint && <p className="mt-1 text-[11px] leading-tight text-sp-shade/55">{hint}</p>}
    </StatShell>
  );
}

/**
 * Pasek udzialu - jedna liczba pokazana jako DLUGOSC, nie jako zdanie.
 * Powstal, bo wlasciciel czytal "5.93% of supply" jako plakietke obok
 * czterech innych plakietek; pasek widac zanim sie go przeczyta.
 */
export function MeterBar({
  pct,
  tone = 'brand',
  left,
  right,
}: {
  pct: number | null;
  tone?: 'brand' | 'up' | 'down';
  left: string;
  right: string;
}) {
  const fill = tone === 'down' ? 'bg-sp-down' : tone === 'up' ? 'bg-sp-up' : 'bg-sp-brand';
  const width = pct === null ? 0 : Math.max(0.6, Math.min(100, pct));
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-sp-shade/10">
        <div className={`h-full rounded-full ${fill} transition-[width] duration-700 ease-out`} style={{ width: `${width}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11.5px] font-semibold text-sp-shade/60">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

/**
 * Zwijana tresc - JEDEN wzorzec na cale centrum $SPHERE (te same <details>,
 * co `LifecycleGuide` i `AdvancedSection` nizej, zeby nie zrobil sie trzeci).
 *
 * Powod: wlasciciel po przegladzie stron ("za duzo napisow, za malo fajnych
 * wizualnych spraw - tresc chowaj w dropdownach"). Chowamy WYPROWADZENIA i
 * opisy mechanizmu; zastrzezenie, ktore zmienia ZNACZENIE liczby, zostaje
 * na wierzchu obok tej liczby. Podpis musi sam mowic, co jest w srodku -
 * "Read more" nie jest podpisem.
 */
export function Disclosure({
  summary,
  children,
  variant = 'inline',
}: {
  summary: string;
  children: ReactNode;
  variant?: 'card' | 'inline';
}) {
  const shell =
    variant === 'card'
      ? 'sph-card rounded-card border border-sp-shade/10 bg-sp-surface'
      : 'rounded-xl border border-sp-shade/10 bg-sp-shade/[0.03]';
  return (
    <details className={`group ${shell}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-[11.5px] font-extrabold text-sp-shade/60 transition-colors hover:text-sp-brand [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-sp-shade/40">
          <span className="group-open:hidden">read</span>
          <span className="hidden group-open:inline">hide</span>
        </span>
      </summary>
      <div className="border-t border-sp-shade/10 px-3.5 py-3 text-[11.5px] leading-relaxed text-sp-shade/60">{children}</div>
    </details>
  );
}

/**
 * Rozwijana sekcja szczegolow - przycisk-karta z tytulem i jednym zdaniem o tym,
 * co jest w srodku, a pod nim plynnie rozwijana tresc (`.board-expand`).
 *
 * Wlasciciel (2026-10-14): na podstronach $SPHERE stalo wszystko naraz i nikt
 * nie wiedzial, co robic. Na wierzchu zostaje to, po co czlowiek przychodzi,
 * a ksiegi, wykresy i rozbicia leza tutaj. Tresc jest zawsze zamontowana
 * (odczyty z lancucha nie zaleza od rozwiniecia), tylko ukryta.
 */
export function Reveal({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-3 rounded-card border border-sp-shade/10 bg-sp-surface px-4 py-3.5 text-left transition-colors [transition-duration:var(--dur-press)] hover:bg-sp-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-brand"
      >
        <span>
          <span className="block text-[14px] font-semibold text-sp-ink">{title}</span>
          {hint && <span className="block text-[12px] text-sp-shade/60">{hint}</span>}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-sp-shade/60 transition-transform [transition-duration:var(--dur-sheet)] ease-drawer ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <div id={id} className="board-expand" data-open={open}>
        <div>
          <div className="grid gap-4 pt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Karta akcji: co robi + kto moze + przycisk. Zastepuje sciany tekstu. */
export function ActionCard({
  title,
  hint,
  badge,
  disabledNote,
  children,
}: {
  title: string;
  hint: string;
  badge?: ReactNode;
  disabledNote?: string;
  children?: ReactNode;
}) {
  return (
    <div className="sph-card flex flex-col justify-between gap-3 rounded-card border border-sp-shade/10 bg-sp-surface p-4">
      <div>
        <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-extrabold text-sp-ink">
          {title} {badge}
        </p>
        <p className="mt-1 text-[11px] font-bold leading-relaxed text-sp-shade/50">{hint}</p>
      </div>
      {disabledNote ? (
        <p className="rounded-xl bg-sp-shade/5 px-3 py-2 text-[11px] font-bold text-sp-shade/45">{disabledNote}</p>
      ) : (
        <div className="flex flex-wrap gap-2">{children}</div>
      )}
    </div>
  );
}

/** Adres jako pastylka z linkiem do eksploratora i kopiowaniem. */
export function AddressPill({ address, label }: { address: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sp-shade/5 px-2.5 py-1 font-mono text-[10.5px] font-bold text-sp-shade/60">
      <span className="font-sans font-extrabold uppercase tracking-[0.06em] text-sp-shade/40">{label}</span>
      {address.slice(0, 6)}…{address.slice(-4)}
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(address)}
        aria-label={`Copy ${label} address`}
        className="text-sp-shade/40 transition-colors hover:text-sp-brand"
      >
        <Copy className="h-3 w-3" aria-hidden="true" />
      </button>
      <a
        href={`${SPHERE_EXPLORER_URL}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${label} in explorer`}
        className="text-sp-shade/40 transition-colors hover:text-sp-brand"
      >
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </span>
  );
}

/** Stopka podstrony: jedno zdanie + link do /about zamiast akapitow. */
export function LearnMore({ children }: { children: ReactNode }) {
  return (
    <Link
      href="/startpad/sphere/about"
      className="sph-card flex items-center justify-between gap-2 rounded-card border border-dashed border-sp-shade/20 bg-sp-surface px-4 py-3 text-[11.5px] font-bold text-sp-shade/55 hover:text-sp-brand"
    >
      <span>{children}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/**
 * Sekcja operacji keeperowych. Dla TWORCY rozwinieta na stale (to jego
 * codzienne narzedzia), dla gosci zwinieta pod jedna linijke - przyciski
 * "deliver/release" sa permissionless i celowo publiczne (protokol ma
 * przezyc milczenie zespolu), ale zwyklemu kupujacemu nic nie mowia
 * i tylko zaslanialy tresc. Zwiniecie != ukrycie: kazdy moze rozwinac
 * i zawolac, doktryna z sekcji 3 tokenomiki zostaje nietknieta.
 */
export function KeeperSection({ children }: { children: ReactNode }) {
  const isCreator = useSphereCreator();
  if (isCreator) return <>{children}</>;
  return (
    <details className="group">
      <summary className="sph-card flex cursor-pointer list-none items-center justify-between rounded-card border border-sp-shade/10 bg-sp-surface px-4 py-3 text-[12.5px] font-extrabold text-sp-shade/60 transition-colors hover:text-sp-brand [&::-webkit-details-marker]:hidden">
        Keeper operations - anyone can run these, gas is the only cost
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-sp-shade/40 group-open:hidden">show</span>
        <span className="hidden text-[10px] font-bold uppercase tracking-[0.08em] text-sp-shade/40 group-open:inline">hide</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/**
 * Sekcja "Advanced" - konsola ABI. WYLACZNIE dla tworcy (decyzja wlasciciela
 * 2026-09-02): gosc nie widzi ani konsoli, ani naglowka, ani wzmianki, ze
 * cokolwiek istnieje - zero szumu "to nie dla ciebie". Odczyty kontraktow
 * sa i tak publiczne na Basescanie.
 */
export function AdvancedSection({ children }: { children: ReactNode }) {
  const isCreator = useSphereCreator();
  if (!isCreator) return null;
  return (
    <details className="group">
      <summary className="sph-card flex cursor-pointer list-none items-center justify-between rounded-card border border-sp-shade/10 bg-sp-surface px-4 py-3 text-[12.5px] font-extrabold text-sp-shade/60 transition-colors hover:text-sp-brand [&::-webkit-details-marker]:hidden">
        Advanced - full contract console
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-sp-shade/40 group-open:hidden">show</span>
        <span className="hidden text-[10px] font-bold uppercase tracking-[0.08em] text-sp-shade/40 group-open:inline">hide</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
