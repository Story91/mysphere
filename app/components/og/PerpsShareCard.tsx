import { DISPLAY_FAMILY, BODY_FAMILY } from './fonts';
import type { PerpMarketSnapshot } from '../../api/launchpad/flashFeed';

/**
 * Karta /perps (i /startpad/perps) - rynki perpow, na ktorych da sie startowac
 * memy, z zywymi liczbami Flash.
 *
 * Kazdy kafel: krotka nazwa ("ETH 2x"), NAV udzialu w dolarach i zmiana 24h.
 * Lista kafli = `markets` z app/startpad/config.ts, wiec nowy rynek pojawia
 * sie tu sam - do osmiu w dwoch rzedach, dalej kafel "+N more". Brak odpowiedzi Flash zostawia kafle z kreskami - karta ma sie
 * narysowac zawsze, a nie wymyslac liczb.
 *
 * Kierunek ceny w barwach startpada (--sp-up / --sp-down), tak jak na karcie
 * tokena: 3.17:1 i 3.29:1 wobec tla, oba ponad progiem dla 34 px / 700.
 */

const CARD = {
  bg: '#F1EDFA',
  ink: '#2E2A44',
  inkMuted: '#6B6486',
  brand: '#5F4EC2',
  up: '#0B9A51',
  down: '#C76B12',
  line: '#B9B1D8',
  panel: '#FFFFFF',
} as const;

const PADDING = 72;
const GAP = 14;
const PER_ROW = 4;
/** Dwa rzedy po cztery. Przy wiekszej liczbie rynkow ostatni kafel mowi "+N more". */
const MAX_TILES = PER_ROW * 2;
const TILE_WIDTH = Math.floor((1200 - PADDING * 2 - GAP * (PER_ROW - 1)) / PER_ROW);

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

function Tile({ perp }: { perp: PerpMarketSnapshot }) {
  const tone = perp.change24hPct === null ? CARD.inkMuted : perp.change24hPct >= 0 ? CARD.up : CARD.down;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: TILE_WIDTH,
        padding: '14px 20px',
        borderRadius: 16,
        border: `1px solid ${CARD.line}`,
        background: CARD.panel,
      }}
    >
      <div style={{ display: 'flex', fontFamily: DISPLAY_FAMILY, fontSize: 28, fontWeight: 700, color: CARD.brand, whiteSpace: 'nowrap' }}>
        {shortName(perp)}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 }}>
        <div style={{ display: 'flex', fontFamily: DISPLAY_FAMILY, fontSize: 26, fontWeight: 700, color: CARD.ink }}>
          {navLabel(perp.priceUsd)}
        </div>
        <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, color: tone }}>{changeLabel(perp.change24hPct)}</div>
      </div>
    </div>
  );
}

export function PerpsShareCard({ perps }: { perps: PerpMarketSnapshot[] }) {
  const overflow = perps.length > MAX_TILES;
  const shown = overflow ? perps.slice(0, MAX_TILES - 1) : perps;
  const rows: PerpMarketSnapshot[][] = [];
  for (let i = 0; i < shown.length; i += PER_ROW) rows.push(shown.slice(i, i + PER_ROW));

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: CARD.bg,
        padding: PADDING,
        fontFamily: BODY_FAMILY,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 5, color: CARD.brand }}>MYSPHERE PERPS</div>
        <div style={{ display: 'flex', fontSize: 22, letterSpacing: 2, color: CARD.inkMuted }}>BASE · FLASH 2X · NAV & 24H</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontFamily: DISPLAY_FAMILY,
            fontSize: 72,
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: -1.4,
            color: CARD.ink,
            whiteSpace: 'nowrap',
          }}
        >
          Memes on 2x leverage.
        </div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: CARD.inkMuted, marginTop: 4, whiteSpace: 'nowrap' }}>
          Launch a meme paired with a perp. Buy it with ETH.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
        {rows.map((row, index) => (
          <div key={index} style={{ display: 'flex', gap: GAP }}>
            {row.map((perp) => (
              <Tile key={perp.id} perp={perp} />
            ))}
            {overflow && index === rows.length - 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: TILE_WIDTH,
                  borderRadius: 16,
                  border: `2px dashed ${CARD.line}`,
                  fontFamily: DISPLAY_FAMILY,
                  fontSize: 28,
                  fontWeight: 700,
                  color: CARD.brand,
                }}
              >
                +{perps.length - shown.length} more
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Liczby Flash zmieniaja sie co minute - CDN trzyma kartę 10 minut. */
export const PERPS_OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=1800',
};
