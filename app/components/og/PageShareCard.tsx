/**
 * Generyczna karta udostepniania (OG) dla POJEDYNCZEJ strony.
 *
 * === PO CO ===
 * Strony bez wlasnego opengraph-image dziedzicza karte korzenia (HomeShareCard),
 * wiec podglad linku do /asks, /money, /startpad... byl ZAWSZE TEN SAM domowy
 * obrazek. Ta karta pozwala kazdej stronie miec wlasny podglad, w TEJ SAMEJ
 * rodzinie wizualnej co reszta: to samo tlo #0A1024, ten sam padding 72, ten sam
 * fioletowy krecoslup i rozstrzelona nadlinia. Rozni sie tylko tekst.
 *
 * === ZASADY (jak w HomeShareCard) ===
 * - Satori, nie przegladarka: kazdy kontener ma jawny `display`, zero Tailwinda.
 * - Zaden logotyp/obrazek z pliku - to zaleznosc, ktora moze paść.
 * - Naglowek MOZE sie zawinac (bez `nowrap`), zeby rozna dlugosc tytulu roznych
 *   stron nie wychodzila poza kadr; `alignItems: stretch` dopasowuje krecoslup
 *   do wysokosci tekstu.
 */

const CARD = {
  bg: '#0A1024',
  ink: '#EEF3FF', // 17:1 - naglowek
  inkMuted: '#B9C6E0', // 11:1 - stopka
  brand: '#9B8CEA', // --soft-primary rozjasniony, jedyny akcent
} as const;

const PADDING = 72;
const SPINE_WIDTH = 8;
const SPINE_GAP = 28;
const TEXT_INDENT = SPINE_WIDTH + SPINE_GAP; // 36
const TEXT_WIDTH = 1200 - PADDING * 2 - TEXT_INDENT;

export type PageShareCardProps = {
  /** Nadlinia - domyslnie domena. Krotka, rozstrzelona. */
  eyebrow?: string;
  /** Naglowek karty (bohater). Krotki, moze zajac dwie linie. */
  head: string;
  /** Stopka - jedno zdanie o stronie. */
  footer: string;
  /** Kolor akcentu (nadlinia + krecoslup). Domyslnie brandowy fiolet. */
  accent?: string;
};

export function PageShareCard({ eyebrow = 'MYSPHERE.FUN', head, footer, accent = CARD.brand }: PageShareCardProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: CARD.bg,
        padding: `${PADDING}px`,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', marginLeft: TEXT_INDENT, fontSize: 24, fontWeight: 700, letterSpacing: 5, color: accent }}>
        {eyebrow}
      </div>

      <div style={{ display: 'flex', gap: SPINE_GAP, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', width: SPINE_WIDTH, borderRadius: 4, background: accent }} />
        <div
          style={{
            display: 'flex',
            width: TEXT_WIDTH,
            fontSize: 66,
            lineHeight: 1.12,
            fontWeight: 700,
            letterSpacing: -1.4,
            color: CARD.ink,
          }}
        >
          {head}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          marginLeft: TEXT_INDENT,
          width: TEXT_WIDTH,
          fontSize: 30,
          lineHeight: 1.35,
          fontWeight: 600,
          letterSpacing: -0.2,
          color: CARD.inkMuted,
        }}
      >
        {footer}
      </div>
    </div>
  );
}

/** Ten sam cache co reszta kart: tresc jest stala, wiec CDN trzyma tygodniami. */
export const OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=604800',
};
