import { DISPLAY_FAMILY } from './fonts';

import { chartDataUri } from './chartSvg';
import { BrandMark, Disc, Frame, INK, Sticker } from './sticker';
import { PageShareCard } from './PageShareCard';
import { mcapLabel, safeSymbol } from '../../startpad/shareText';
import type { TokenCardData } from '../../startpad/share/tokenCard';

/**
 * Karta udostepniania tokena startpada - jeden rysunek dla dwoch tras:
 * app/startpad/[address]/opengraph-image.tsx (1200x630) oraz
 * .../miniapp-image/route.tsx (1200x800, proporcja 3:2 wymagana przez
 * `fc:miniapp`). Jeden plik, zeby te obrazki nie mogly sie rozjechac.
 *
 * ===========================================================================
 * CO TA KARTA MOWI I W JAKIEJ KOLEJNOSCI
 * ===========================================================================
 * Ktos widzi ja na cudzej osi czasu, w miniaturze, przez pol sekundy i nie zna
 * tego tokena. Dostaje wiec trzy rzeczy w kolejnosci waznosci:
 *   1. MNOZNIK od startu - najwieksza naklejka, w barwie kierunku;
 *   2. KSZTALT - wykres mowi, czy to rosnie od poczatku, czy wlasnie spada;
 *   3. STAN - zbiorka na krzywej, kupujacy, kapitalizacja.
 * Logo i $SYMBOL sa tozsamoscia: logo to naklejka, symbol duzym krojem obok.
 *
 * Styl naklejek z app/components/og/sticker.tsx (zatwierdzony 2026-10-12).
 *
 * WARIANT PERPA: token z rynku perpa (`data.perp`) dostaje adres /perps,
 * bursztynowa naklejke "paired with <perp>", zbiorke w dolarach z NAV i
 * naklejke ruchu perpa z 24h zamiast wieku. Bez NAV zostaja jednostki perpa
 * i kreska przy kapitalizacji.
 *
 * KIERUNEK CENY jest SEMANTYCZNY: --sp-up #0B9A51 (3.17:1) i --sp-down
 * #C76B12 (3.29:1) - te same barwy, co linia wykresu w chartSvg.ts. Liczby
 * w barwie kierunku stoja tylko na BIALYCH naklejkach (na bursztynie spadaja
 * ponizej 3:1).
 */

const PADDING = 72;
const WIDTH = 1200;
const COLUMN = WIDTH - PADDING * 2;

/** Nazwa tokena jest dowolnym stringiem z kontraktu - kadr ma swoja miare. */
const MAX_NAME = 30;
/** $SYMBOL obok logo, przed naklejka mnoznika. Dluzszy symbol zmniejsza krój. */
const SYMBOL_ROOM = 520;

function Glyph({ data }: { data: TokenCardData }) {
  const size = 120;
  const frame = {
    display: 'flex',
    width: size,
    height: size,
    borderRadius: 28,
    border: `3px solid ${INK.ink}`,
    boxShadow: `7px 7px 0 ${INK.ink}`,
    transform: 'rotate(-6deg)',
    overflow: 'hidden',
  } as const;

  if (data.logoUrl) {
    return (
      <div style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.logoUrl} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...frame,
        background: data.accent,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: DISPLAY_FAMILY,
        fontSize: 44,
        fontWeight: 700,
        /**
         * Inicjaly ciemne, nie biale: chipy (ACCENTS w app/startpad/metadata.ts)
         * to sredniotonowe pastele, bialy dawal na nich ponizej 3:1. Barw
         * chipow NIE ruszamy - to wspolna tozsamosc z tablica i strona tokena.
         */
        color: INK.ink,
      }}
    >
      {safeSymbol(data.symbol).slice(0, 2).toUpperCase()}
    </div>
  );
}

/**
 * Cena tokena z krzywej to okolo 1e-9 ETH. Notacja naukowa wyglada na blad, a
 * pelny zapis dziesietny na sciane zer - dlatego cena idzie w GWEI, gdzie te
 * liczby sa czytelne (7.5e-10 ETH to 0.75 gwei), a jednostka jest obok.
 */
function priceLabel(priceEth: number): string {
  if (!Number.isFinite(priceEth) || priceEth <= 0) return '--';
  const gwei = priceEth * 1e9;
  if (gwei >= 100) return `${gwei.toFixed(0)} gwei`;
  if (gwei >= 1) return `${gwei.toFixed(2)} gwei`;
  return `${gwei.toFixed(3)} gwei`;
}

function ethLabel(value: number): string {
  // 0.004 ETH na krzywej to nie "0" - przy jednym kupujacym karta pisala
  // "0 / 3 ETH" obok kapitalizacji 1.9k $, czyli przeczyla sama sobie.
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toFixed(2).replace(/\.?0+$/, '');
}

/** Kwota zbiorki w dolarach - rynek perpa liczy krzywa w jednostkach perpa, ktorych nikt nie zna. */
function usdShort(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value < 10) return `$${value.toFixed(2)}`;
  return mcapLabel(value);
}

function pctLabel(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

/** Nazwa perpa z API Flash ("ETH 2x Long"), a gdy jej nie ma - ticker z konfiguracji ("ETH2xL"). */
function perpLabel(perp: NonNullable<TokenCardData['perp']>): string {
  return (perp.name ?? perp.symbol).replace(/^flash\s+/i, '');
}

/** Szerokosc naklejki z etykieta tekstowa - do kotwiczenia przy prawej krawedzi (satori nie zna `right`). */
function widthOf(text: string, size: number): number {
  return Math.round(text.length * size * 0.5) + Math.round(size * 0.6) * 2 + 6;
}

export function TokenShareCard({ data, height }: { data: TokenCardData; height: number }) {
  const symbol = safeSymbol(data.symbol);
  const name = data.name.length > MAX_NAME ? `${data.name.slice(0, MAX_NAME)}…` : data.name;
  const tone = data.up ? INK.up : INK.down;
  const progress = Math.min(100, Math.round((data.raised / data.target) * 100));
  const perp = data.perp;
  const nav = perp?.navUsd ?? null;

  // Wykres dostaje reszte wysokosci: karta 3:2 jest o 170 px wyzsza od OG i to
  // wlasnie wykres ma z tego skorzystac, a nie powietrze miedzy pasmami.
  const chartTop = 318;
  const statsTop = height - 64 - 92;
  const chartHeight = Math.max(110, statsTop - chartTop - 24);
  const chart = chartDataUri(data.prices, { width: COLUMN, height: chartHeight, up: data.up });

  const symbolSize = symbol.length <= 7 ? 84 : symbol.length <= 10 ? 66 : 52;
  const multiple = data.multiple;
  const multipleX = multiple ? WIDTH - PADDING - 4 - widthOf(multiple, 80) : 0;
  const tag = perp ? `paired with ${perpLabel(perp)}` : `${data.networkLabel} · ${data.state}`;

  const stats: Array<{ value: string; label: string; color?: string }> = [
    {
      value:
        perp && nav !== null
          ? `${usdShort(data.raised * nav)} / ${usdShort(data.target * nav)}`
          : `${ethLabel(data.raised)} / ${ethLabel(data.target)} ${data.nativeSymbol}`,
      label: data.state === 'Graduated' ? 'raised' : `on the curve · ${progress}%`,
    },
    { value: String(data.holders), label: data.holders === 1 ? 'buyer' : 'buyers' },
    // Cena w gwei ma sens tylko w ETH - na rynku perpa bez NAV zostaje kreska
    // przy kapitalizacji zamiast liczby w zlej jednostce.
    data.mcapUsd === null && !perp
      ? { value: priceLabel(data.priceEth), label: 'price' }
      : { value: mcapLabel(data.mcapUsd), label: 'market cap' },
    // Na rynku perpa ostatnia naklejka nalezy do perpa: jego ruch z 24h to
    // druga polowa argumentu "mem na dzwigni". Wiek tokena ustepuje.
    perp && perp.change24hPct !== null
      ? { value: pctLabel(perp.change24hPct), label: `${perp.symbol} · 24h`, color: perp.change24hPct >= 0 ? INK.up : INK.down }
      : { value: data.ageLabel.replace(' old', ''), label: 'age' },
  ];
  const tilts = [-2, 1.5, -1, 2];

  return (
    <Frame>
      <Disc dy={-120} />

      {/* Znak marki i naklejka kontekstu: z czym mem jest sparowany albo siec i stan. */}
      <div style={{ position: 'absolute', left: PADDING, top: 64, display: 'flex' }}>
        <BrandMark path={perp ? '/perps' : '/startpad'} />
      </div>
      <Sticker
        label={tag}
        size={24}
        tone={perp ? 'amber' : 'paper'}
        rotate={3}
        at={{ x: WIDTH - PADDING - widthOf(tag, 24), y: 52 }}
      />

      {/* Tozsamosc. */}
      <div style={{ position: 'absolute', left: PADDING + 6, top: 146, display: 'flex', alignItems: 'center', gap: 34 }}>
        <Glyph data={data} />
        <div style={{ display: 'flex', flexDirection: 'column', width: SYMBOL_ROOM }}>
          <div
            style={{
              display: 'flex',
              fontFamily: DISPLAY_FAMILY,
              fontSize: symbolSize,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: -1.5,
              color: INK.ink,
              whiteSpace: 'nowrap',
            }}
          >
            ${symbol}
          </div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: INK.muted, marginTop: 8 }}>{name}</div>
        </div>
      </div>

      {/* Mnoznik - najwieksza naklejka, jedyna liczba w barwie kierunku obok wykresu. */}
      {multiple && (
        <Sticker
          label={<span style={{ color: tone }}>{multiple}</span>}
          sub="since launch"
          size={80}
          subSize={24}
          tone="paper"
          rotate={4}
          at={{ x: multipleX, y: 126 }}
          subColor={INK.muted}
        />
      )}

      {/* Ksztalt. Wykresu nie ma, dopoki nie ma dwoch prawdziwych punktow. */}
      {chart && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chart}
          alt=""
          width={COLUMN}
          height={chartHeight}
          style={{ position: 'absolute', left: PADDING, top: chartTop, width: COLUMN, height: chartHeight }}
        />
      )}

      {/* Stan - male naklejki z lekkim przechylem. */}
      <div style={{ position: 'absolute', left: PADDING, top: statsTop, display: 'flex', gap: 22 }}>
        {stats.map((stat, i) => (
          <div key={stat.label} style={{ display: 'flex' }}>
            <Sticker
              label={<span style={{ color: stat.color ?? INK.ink }}>{stat.value}</span>}
              sub={stat.label}
              size={32}
              tone="paper"
              rotate={tilts[i % tilts.length]}
              subColor={INK.muted}
            />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/**
 * Karta dla adresu, ktorego zaden z launchpadow nie zna - albo ktorego nie
 * udalo sie odczytac, bo padly wszystkie RPC.
 *
 * Istnieje, bo podglad linku ma dwa mozliwe konce: obrazek albo BRAK obrazka.
 * Rzucenie bledem daje ten drugi, czyli goly link bez niczego - a to jest
 * gorsze niz uczciwa karta mowiaca, gdzie ktos wlasnie trafil.
 */
export function TokenShareFallback({ height = 630 }: { height?: number }) {
  return (
    <PageShareCard
      path="/startpad"
      headline={['Launch', 'a meme', 'on Base.']}
      subline="Curve first, live pool after."
      stickers={[{ label: 'ETH curve' }, { label: 'Nvidia 2x' }, { label: 'Uniswap v4' }, { label: 'SpaceX 2x' }, { label: 'B20 token' }, { label: 'BTC 2x' }]}
      hero={{ label: '$YOUR MEME', sub: 'graduates to a live pool' }}
      height={height}
    />
  );
}

/**
 * Naglowki cache obu tras tokena.
 *
 * Krocej niz karta strony glownej (tydzien): ta karta niesie cene, ktora
 * zmienia sie z kazda transakcja. Piec minut - fala wejsc z jednego wklejenia
 * miesci sie w jednym renderze, a link odswiezony pol godziny pozniej nie
 * pokazuje wczorajszego mnoznika.
 */
export const TOKEN_OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
};
