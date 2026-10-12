import { DISPLAY_FAMILY } from './fonts';
import { BrandMark, Collage, Disc, Frame, INK, type StickerSpec } from './sticker';
import type { PerpMarketSnapshot } from '../../api/launchpad/flashFeed';

/**
 * Karta /perps (i /startpad/perps) - rynki perpow z zywymi liczbami Flash,
 * w stylu naklejek (app/components/og/sticker.tsx).
 *
 * Kazda naklejka rynku: krotka nazwa ("ETH 2x") i pod nia NAV udzialu oraz
 * zmiana 24h w barwie kierunku. Miejsc w kolazu jest szesc - przy wiekszej
 * liczbie rynkow pokazujemy szesc, ktore NAJMOCNIEJ sie ruszyly (bez danych
 * na koncu), bo ruch jest powodem, dla ktorego ktos patrzy na te karte.
 * Fioletowy bohater "$YOUR MEME" zostaje: to ten sam produkt, co na karcie
 * glownej.
 *
 * Naklejki z liczbami sa zawsze biale: zielen i braz kierunku na bursztynie
 * schodza ponizej 3:1. Brak odpowiedzi Flash = naklejki z kreskami; karta ma
 * sie narysowac zawsze, a nie wymyslac liczb.
 */

const MAX_MARKETS = 6;

/**
 * "ETH 2x Long" -> "ETH 2x", "Flash ETH 2x Short" -> "ETH 2x Short".
 * Short zostaje z dopiskiem, bo to jedyna informacja, ktora go odroznia.
 * Bez nazwy z Flash - ticker z konfiguracji.
 */
function shortName(perp: PerpMarketSnapshot): string {
  if (!perp.name || perp.name === perp.symbol) return perp.symbol;
  const name = perp.name.replace(/^flash\s+/i, '');
  return perp.direction === 'long' ? name.replace(/\s+long$/i, '') : name;
}

function navLabel(usd: number | null): string {
  if (usd === null) return '--';
  return `$${usd >= 100 ? usd.toFixed(0) : usd.toFixed(2)}`;
}

function changeLabel(pct: number | null): string {
  if (pct === null) return '--';
  const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function marketSticker(perp: PerpMarketSnapshot): StickerSpec {
  const tone = perp.change24hPct === null ? INK.muted : perp.change24hPct >= 0 ? INK.up : INK.down;
  return {
    label: shortName(perp),
    size: 34,
    tone: 'paper',
    sub: (
      <div style={{ display: 'flex', gap: 10 }}>
        <span style={{ color: INK.ink }}>{navLabel(perp.priceUsd)}</span>
        <span style={{ color: tone }}>{changeLabel(perp.change24hPct)}</span>
      </div>
    ),
    subColor: INK.ink,
  };
}

export function PerpsShareCard({ perps }: { perps: PerpMarketSnapshot[] }) {
  // Najwiekszy ruch pierwszy; rynek bez danych zawsze na koncu (abs(-1) = 1
  // wpychal go przed rynek, ktory ruszyl sie o 0.01%).
  const move = (p: PerpMarketSnapshot) => (p.change24hPct === null ? -1 : Math.abs(p.change24hPct));
  const byMove = [...perps].sort((a, b) => move(b) - move(a));
  const shown = byMove.slice(0, MAX_MARKETS);

  return (
    <Frame>
      <Disc />
      <div
        style={{
          position: 'absolute',
          left: 72,
          top: 64,
          bottom: 64,
          width: 560,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <BrandMark path="/perps" />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontFamily: DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 104,
            lineHeight: 0.98,
            letterSpacing: -2.5,
            color: INK.ink,
          }}
        >
          <div style={{ display: 'flex' }}>Memes</div>
          <div style={{ display: 'flex' }}>on 2x</div>
          <div style={{ display: 'flex' }}>leverage.</div>
        </div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: INK.muted, whiteSpace: 'nowrap' }}>
          Live NAV and 24h move, from Flash.
        </div>
      </div>
      {/* Bohater nizej niz na kartach stron: naklejki rynkow maja po dwie
          linijki i w standardowym miejscu zaslanial liczby Bitcoina. */}
      <Collage
        stickers={shown.map(marketSticker)}
        hero={{ label: '$YOUR MEME', sub: 'paired with a perp', size: 36 }}
        heroAt={{ x: 830, y: 345, r: -3 }}
      />
    </Frame>
  );
}

/** Liczby Flash zmieniaja sie co minute - CDN trzyma karte 10 minut. */
export const PERPS_OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=1800',
};
