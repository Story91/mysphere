import type { ReactNode } from 'react';
import { DISPLAY_FAMILY, BODY_FAMILY } from './fonts';

/**
 * Klocki rodziny kart OG w stylu "naklejek" (zatwierdzony przez wlasciciela
 * 2026-10-12 na karcie strony glownej).
 *
 * Idea: produkt to mem sklejony z tickerem, wiec karta jest kolazem naklejek -
 * gruby granatowy obrys, twardy cien bez rozmycia, lekki przechyl. Po lewej
 * zawsze duzy tekst, po prawej kolaz na miekkim lawendowym kole. Jedna
 * naklejka "bohater" (fiolet) niesie to, co jest TWOJE: twoj mem, twoje
 * pytanie, $SPHERE.
 *
 * Paleta z tokenow produktu (app/globals.css). Kontrasty wobec tla #F1EDFA:
 * ink 11.9:1, muted 4.8:1. Tekst na naklejce bursztynowej to ink (7.2:1),
 * na fioletowej bialy (6.0:1). Kierunek ceny: --sp-up / --sp-down.
 *
 * SATORI: kazdy kontener ma jawny `display`, pozycjonowanie absolutne wzgledem
 * kadru, `transform: rotate` dziala, `boxShadow` bez rozmycia dziala.
 */

export const INK = {
  bg: '#F1EDFA', // --soft-bg
  ink: '#2E2A44', // --soft-ink - obrys, cien, tekst
  muted: '#6B6486', // --soft-ink-muted
  violet: '#5F4EC2', // --soft-primary-deep - naklejka bohatera
  amber: '#F5A73B', // --soft-accent - druga barwa naklejek
  paper: '#FFFFFF', // --soft-surface
  lilac: '#DCD3FA', // kolo pod kolazem
  up: '#0B9A51', // --sp-up
  down: '#C76B12', // --sp-down
} as const;

export type StickerTone = 'paper' | 'amber' | 'violet';

const FILL: Record<StickerTone, { bg: string; fg: string }> = {
  paper: { bg: INK.paper, fg: INK.ink },
  amber: { bg: INK.amber, fg: INK.ink },
  violet: { bg: INK.violet, fg: INK.paper },
};

export type StickerProps = {
  label: ReactNode;
  sub?: ReactNode;
  tone?: StickerTone;
  /** Stopien pisma etykiety. */
  size?: number;
  rotate?: number;
  /** Pozycja absolutna w kadrze. Bez niej naklejka plynie w ukladzie. */
  at?: { x: number; y: number };
  /** Kolor dopisku - np. kierunek ceny. Domyslnie barwa naklejki. */
  subColor?: string;
  /** Stopien dopisku; domyslnie polowa etykiety, nie mniej niz 18 px. */
  subSize?: number;
};

export function Sticker({ label, sub, tone = 'paper', size = 40, rotate = 0, at, subColor, subSize }: StickerProps) {
  const fill = FILL[tone];
  return (
    <div
      style={{
        ...(at ? { position: 'absolute', left: at.x, top: at.y } : {}),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: `${Math.round(size * 0.35)}px ${Math.round(size * 0.6)}px ${Math.round(size * 0.4)}px`,
        borderRadius: 22,
        background: fill.bg,
        border: `3px solid ${INK.ink}`,
        boxShadow: `7px 7px 0 ${INK.ink}`,
        transform: `rotate(${rotate}deg)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontFamily: DISPLAY_FAMILY,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1,
          color: fill.fg,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      {sub && (
        <div
          style={{
            display: 'flex',
            fontFamily: BODY_FAMILY,
            fontWeight: 700,
            fontSize: subSize ?? Math.max(18, Math.round(size * 0.5)),
            marginTop: 6,
            color: subColor ?? fill.fg,
            opacity: subColor ? 1 : 0.8,
            whiteSpace: 'nowrap',
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/** Znak marki + adres strony, z ktorej jest karta ("mysphere.fun/perps"). */
export function BrandMark({ path = '' }: { path?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', width: 34, height: 34, borderRadius: 999, background: INK.violet, border: `3px solid ${INK.ink}` }} />
      <div style={{ display: 'flex', fontFamily: DISPLAY_FAMILY, fontWeight: 700, fontSize: 32, color: INK.ink }}>
        mysphere.fun
        {path && <span style={{ color: INK.muted }}>{path}</span>}
      </div>
    </div>
  );
}

/** Miekkie kolo pod kolazem - zeby karta nie byla plaska. `dy` przesuwa je w kadrze 3:2. */
export function Disc({ dy = 0 }: { dy?: number }) {
  return (
    <div
      style={{ position: 'absolute', left: 640, top: -60 + dy, width: 680, height: 680, borderRadius: 999, background: INK.lilac, display: 'flex' }}
    />
  );
}

/**
 * Miejsca w kolazu (kadr 1200x630). Kolejnosc = kolejnosc wypelniania,
 * BOHATER zawsze na srodku i rysowany na koncu, zeby lezal na wierzchu.
 * Barwy przeplatane: co druga naklejka bursztynowa, zeby kolaz nie byl
 * jednolicie bialy. Wiecej niz siedem naklejek sie nie zmiesci.
 *
 * Prawa kolumna jest zakotwiczona do PRAWEJ krawedzi (`right`) - dluzsza
 * etykieta rosnie wtedy w lewo, a nie za kadr. Satori nie honoruje `right`
 * przy pozycji absolutnej (naklejki znikaly), wiec `x` liczy sie z szacunku
 * szerokosci (stickerWidth). Etykiety trzymac do ~11 znakow: dluzsze wchodza
 * na sasiadow.
 */
export const SLOTS: Array<{ x?: number; right?: number; y: number; r: number; tone: StickerTone }> = [
  { x: 700, y: 78, r: -8, tone: 'paper' },
  { right: 48, y: 60, r: 7, tone: 'amber' },
  { right: 40, y: 200, r: -5, tone: 'paper' },
  { x: 680, y: 250, r: 6, tone: 'amber' },
  { x: 712, y: 445, r: -4, tone: 'paper' },
  { right: 46, y: 465, r: 8, tone: 'paper' },
];
/**
 * Szacunek szerokosci naklejki: Baloo 2 700 ~0.5 kegla na znak (zmierzone na
 * PNG, z zapasem), plus poziomy padding i obrys. Dopisek liczy sie, gdy jest
 * dluzszy od etykiety. Nie-tekst (np. element z kolorem) = 220 px.
 */
function stickerWidth(spec: StickerSpec, size: number): number {
  const text = (node: ReactNode, k: number) => (typeof node === 'string' ? node.length * k : 220);
  const sub = spec.sub ? text(spec.sub, Math.max(18, Math.round(size * 0.5)) * 0.52) : 0;
  return Math.max(text(spec.label, size * 0.5), sub) + Math.round(size * 0.6) * 2 + 6;
}

export const HERO_SLOT = { x: 790, y: 305, r: -3 };

export type StickerSpec = { label: ReactNode; sub?: ReactNode; subColor?: string; tone?: StickerTone; size?: number };

/** Kolaz: do szesciu naklejek w miejscach SLOTS + opcjonalny bohater na wierzchu. */
export function Collage({
  stickers,
  hero,
  heroAt = HERO_SLOT,
  dy = 0,
}: {
  stickers: StickerSpec[];
  hero?: StickerSpec;
  /** Inne miejsce bohatera - gdy naklejki maja po dwie linijki i bohater zaslanialby liczby. */
  heroAt?: { x: number; y: number; r: number };
  dy?: number;
}) {
  return (
    <>
      {stickers.slice(0, SLOTS.length).map((s, i) => {
        const slot = SLOTS[i];
        const size = s.size ?? 40;
        const x = slot.x ?? 1200 - (slot.right ?? 0) - stickerWidth(s, size);
        return <Sticker key={i} {...s} size={size} tone={s.tone ?? slot.tone} rotate={slot.r} at={{ x, y: slot.y + dy }} />;
      })}
      {hero && <Sticker {...hero} tone={hero.tone ?? 'violet'} size={hero.size ?? 50} rotate={heroAt.r} at={{ x: heroAt.x, y: heroAt.y + dy }} />}
    </>
  );
}

/** Kadr karty: tlo, overflow i pozycjonowanie wzgledne dla naklejek. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: INK.bg,
        fontFamily: BODY_FAMILY,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}
