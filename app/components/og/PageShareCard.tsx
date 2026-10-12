import { DISPLAY_FAMILY, BODY_FAMILY } from './fonts';

/**
 * Karta podgladu linku dla STRONY (nie dla rekordu z danymi).
 *
 * Jeden rysunek dla strony glownej, /startpad, /startpad/sphere i /b20 - te
 * same trzy pasma, ktore wczesniej mialy statyczne PNG z /asks, /how i /Docs:
 *   1. nadlinia (domena albo sekcja),
 *   2. krecoslup + naglowek + druga linijka,
 *   3. chipy i/lub stopka.
 *
 * Paleta przepisana z tokenow produktu (app/globals.css), kontrasty wobec
 * tla #F1EDFA: ink 11.9:1, inkMuted 4.8:1, brand 5.4:1. Nadlinia NIE uzywa
 * --soft-primary #7C6BDA (3.67:1) - X skaluje podglad do ~0.35 i taki fiolet
 * znika. Pomarancz (--soft-accent) w tym systemie znaczy KWOTE, a na kartach
 * stron kwot nie ma - wiec go tu nie ma.
 *
 * MIARA: kolumna tekstu ma 1020 px, a naglowek i druga linijka sa `nowrap`.
 * Zmierzone na wyrenderowanym PNG: znak Baloo 2 700 zajmuje ~0.44 kegla,
 * Nunito 600 ~0.48. Przy 88 px miesci sie ~23 znaki naglowka, przy 48 px
 * ~42 znaki drugiej linijki. Za dlugi tekst wychodzi poza kadr - widac to od
 * razu, w przeciwienstwie do cichego zlamania na dwie linijki. Po kazdej
 * zmianie tresci obejrzec obrazek.
 *
 * SATORI, NIE PRZEGLADARKA: kazdy kontener ma jawny `display`, zero klas
 * Tailwinda, zero cieni.
 */

const CARD = {
  bg: '#F1EDFA', // --soft-bg
  ink: '#2E2A44', // --soft-ink
  inkMuted: '#6B6486', // --soft-ink-muted
  brand: '#5F4EC2', // --soft-primary-deep
  line: '#B9B1D8', // --soft-line-strong
  panel: '#FFFFFF', // --soft-surface
} as const;

const PADDING = 72;
const HEAD_SIZE = 88;
const HEAD_LINE_HEIGHT = 1.12;
const SUB_SIZE = 48;
const SUB_LINE_HEIGHT = 1.3;
const SPINE_WIDTH = 8;
const SPINE_GAP = 28;
const TEXT_INDENT = SPINE_WIDTH + SPINE_GAP;
const TEXT_WIDTH = 1200 - PADDING * 2 - TEXT_INDENT;

export type PageShareCardProps = {
  eyebrow: string;
  headline: string;
  subline?: string;
  /** Krotkie etykiety w pigulkach - rynki, moduly. Max ~5, zeby zmiescic sie w kolumnie. */
  chips?: readonly string[];
  /** Zdanie w ostatnim pasmie, obok chipow albo zamiast nich. */
  footer?: string;
};

export function PageShareCard({ eyebrow, headline, subline, chips, footer }: PageShareCardProps) {
  const heroHeight = Math.round(HEAD_SIZE * HEAD_LINE_HEIGHT + (subline ? SUB_SIZE * SUB_LINE_HEIGHT + 14 : 0));

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
        fontFamily: BODY_FAMILY,
      }}
    >
      <div
        style={{
          display: 'flex',
          marginLeft: TEXT_INDENT,
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: 5,
          color: CARD.brand,
        }}
      >
        {eyebrow}
      </div>

      <div style={{ display: 'flex', gap: SPINE_GAP }}>
        {/* Krecoslup - ten sam gest co .spine-fill w globals.css. */}
        <div style={{ display: 'flex', width: SPINE_WIDTH, height: heroHeight, borderRadius: 4, background: CARD.brand }} />
        <div style={{ display: 'flex', flexDirection: 'column', width: TEXT_WIDTH }}>
          <div
            style={{
              display: 'flex',
              fontFamily: DISPLAY_FAMILY,
              fontSize: HEAD_SIZE,
              lineHeight: HEAD_LINE_HEIGHT,
              fontWeight: 700,
              letterSpacing: -1.6,
              color: CARD.ink,
              whiteSpace: 'nowrap',
            }}
          >
            {headline}
          </div>
          {subline && (
            <div
              style={{
                display: 'flex',
                fontSize: SUB_SIZE,
                lineHeight: SUB_LINE_HEIGHT,
                fontWeight: 600,
                letterSpacing: -0.6,
                color: CARD.inkMuted,
                whiteSpace: 'nowrap',
              }}
            >
              {subline}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: TEXT_INDENT }}>
        {chips?.map((chip) => (
          <div
            key={chip}
            style={{
              display: 'flex',
              padding: '10px 22px',
              borderRadius: 999,
              border: `2px solid ${CARD.line}`,
              background: CARD.panel,
              fontFamily: DISPLAY_FAMILY,
              fontSize: 28,
              fontWeight: 700,
              color: CARD.brand,
            }}
          >
            {chip}
          </div>
        ))}
        {footer && (
          <div
            style={{
              display: 'flex',
              marginLeft: chips?.length ? 10 : 0,
              fontSize: chips?.length ? 28 : 32,
              fontWeight: 600,
              color: CARD.inkMuted,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Cache dla kart stron: tresc stala miedzy wdrozeniami, wiec tydzien w CDN.
 * Karty z danymi (tokeny, perpy, aski) maja wlasne, krotsze naglowki.
 */
export const PAGE_OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=604800',
};
