import { DISPLAY_FAMILY } from './fonts';
import { BrandMark, Collage, Disc, Frame, INK, type StickerSpec } from './sticker';

/**
 * Karta podgladu linku dla STRONY (nie dla rekordu z danymi): strona glowna,
 * /startpad, /startpad/sphere, /b20, /asks, /how, /Docs.
 *
 * Uklad rodziny naklejek (app/components/og/sticker.tsx):
 *   lewa kolumna  - znak marki z adresem, naglowek w 2-3 linijkach, zdanie,
 *   prawa strona  - kolaz do szesciu naklejek + fioletowy bohater.
 *
 * MIARA: kolumna tekstu ma 560 px, linijki naglowka sa `nowrap`. Baloo 2 700
 * zajmuje ~0.47 kegla na znak, wiec przy 104 px linijka miesci ~11 znakow -
 * dluzsza wyjdzie pod kolaz. Po kazdej zmianie tresci obejrzec obrazek.
 *
 * `height` 800 = karta miniappki (3:2); kolaz i kolo zjezdzaja wtedy o polowe
 * nadwyzki, zeby nie wisialy u gory.
 */

const PADDING = 72;
const COLUMN = 560;

export type PageShareCardProps = {
  /** Sciezka po domenie w znaku marki, np. "/perps". */
  path?: string;
  /** Linijki naglowka - kazda w osobnym wierszu. */
  headline: string[];
  headSize?: number;
  subline?: string;
  stickers: StickerSpec[];
  hero?: StickerSpec;
  height?: number;
};

export function PageShareCard({ path, headline, headSize = 104, subline, stickers, hero, height = 630 }: PageShareCardProps) {
  const dy = Math.round((height - 630) / 2);
  return (
    <Frame>
      <Disc dy={dy} />
      <div
        style={{
          position: 'absolute',
          left: PADDING,
          top: 64,
          bottom: 64,
          width: COLUMN,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <BrandMark path={path} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontFamily: DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: headSize,
            lineHeight: 0.98,
            letterSpacing: -2.5,
            color: INK.ink,
          }}
        >
          {headline.map((line) => (
            <div key={line} style={{ display: 'flex', whiteSpace: 'nowrap' }}>
              {line}
            </div>
          ))}
        </div>
        {subline ? (
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: INK.muted, whiteSpace: 'nowrap' }}>{subline}</div>
        ) : (
          <div style={{ display: 'flex' }} />
        )}
      </div>
      <Collage stickers={stickers} hero={hero} dy={dy} />
    </Frame>
  );
}

/**
 * Cache dla kart stron: tresc stala miedzy wdrozeniami, wiec tydzien w CDN.
 * Karty z danymi (tokeny, perpy, aski) maja wlasne, krotsze naglowki.
 */
export const PAGE_OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=604800',
};
