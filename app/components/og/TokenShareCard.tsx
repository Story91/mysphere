import { DISPLAY_FAMILY, BODY_FAMILY } from './fonts';

import { chartDataUri } from './chartSvg';
import { mcapLabel, safeSymbol } from '../../startpad/shareText';
import type { TokenCardData } from '../../startpad/share/tokenCard';

/**
 * Karta udostepniania tokena startpada - jeden rysunek dla dwoch tras:
 * app/startpad/[address]/opengraph-image.tsx (1200x630) oraz
 * .../miniapp-image/route.tsx (1200x800, proporcja 3:2 wymagana przez
 * `fc:miniapp`). Jeden plik, zeby te obrazki nie mogly sie rozjechac - dokladnie
 * ta sama decyzja, co przy HomeShareCard dla strony glownej.
 *
 * ===========================================================================
 * CO TA KARTA MOWI I W JAKIEJ KOLEJNOSCI
 * ===========================================================================
 * Ktos widzi ja na cudzej osi czasu, w miniaturze, przez pol sekundy i nie zna
 * tego tokena. Dostaje wiec trzy rzeczy w kolejnosci waznosci:
 *   1. MNOZNIK od startu - jedyny powod, dla ktorego zatrzymalby wzrok;
 *   2. KSZTALT - wykres mowi, czy to rosnie od poczatku, czy wlasnie spada;
 *   3. STAN - ile ETH na krzywej i ilu kupujacych, czyli czy jest jeszcze o co grac.
 * Nazwa i logo sa tozsamoscia, nie argumentem, wiec stoja obok, a nie w srodku.
 *
 * ===========================================================================
 * ZASADY RODZINY KART (nie lamac ich tutaj)
 * ===========================================================================
 * Padding 72, trzy pasma ze `space-between`, rozstrzelona nadlinia,
 * `sans-serif` (Noto Sans wbudowane w @vercel/og). Ta karta jest SZOSTA
 * z rodziny i ma wygladac na rodzenstwo pozostalych pieciu.
 *
 * TLO: #F1EDFA, nie #0A1024. Zmiana zamowiona przez wlasciciela 2026-09-01
 * razem z HomeShareCard - uzasadnienie i przyjeta cena sa opisane tam.
 * Od 2026-10 cala rodzina (strony, ranking, post, tip, profil, perpy, aski)
 * stoi na jasnym tle.
 *
 * WARIANT PERPA: token z rynku perpa (`data.perp`) dostaje nadlinie
 * MYSPHERE PERPS, plakietke "PAIRED WITH <perp>", zbiorke w dolarach z NAV
 * i kafel ruchu perpa z 24h zamiast wieku. Bez NAV zostaja jednostki perpa
 * i kreska przy kapitalizacji.
 *
 * SATORI, NIE PRZEGLADARKA: kazdy kontener ma jawny `display`, zero klas
 * Tailwinda, zero cieni pod tekstem, zero jednostek innych niz liczby.
 */

/**
 * Paleta przepisana z tokenow produktu (app/globals.css). Kontrasty WCAG
 * policzone wobec tla #F1EDFA, nie oszacowane:
 *   #2E2A44  11.9:1  ink       - $SYMBOL 72/700 i wartosci kafli 34/700
 *   #6B6486   4.8:1  inkMuted  - nazwa 28px, siec i stan 22px
 *   #5F4EC2   5.4:1  brand     - nadlinia 24/700, SINCE LAUNCH 20px, etykiety 17px
 * Nadlinia NIE uzywa --soft-primary #7C6BDA (3.67:1) - X skaluje podglad do
 * ~0.35, wiec 24px robi sie 8px i taki fiolet znika. Ta sama decyzja co
 * w HomeShareCard.
 *
 * KIERUNEK CENY jest SEMANTYCZNY i dlatego NIE idzie na tokeny --soft-*.
 * Bierze wlasne barwy startpada (globals.css:101-108), czyli te same, ktorych
 * uzywaja strony produktu:
 *   --sp-up   #0B9A51  3.17:1  wzrost
 *   --sp-down #C76B12  3.29:1  spadek
 * Oba przechodza prog 3:1 dla mnoznika 104/700 i dla linii wykresu. NIE
 * mapowac spadku na --soft-accent #F5A73B: to 1.74:1 (niewidoczne), a w tym
 * systemie pomarancz znaczy KWOTE, nie kierunek.
 *
 * KAFLE: alfa sie odwraca. rgba(255,255,255,0.04) na jasnym tle daje ~1.01:1,
 * czyli nic - kafel musi byc kryty, a wlos ciemniejszy od tla, nie jasniejszy.
 */
const CARD = {
  bg: '#F1EDFA', // --soft-bg
  ink: '#2E2A44', // --soft-ink
  inkMuted: '#6B6486', // --soft-ink-muted
  brand: '#5F4EC2', // --soft-primary-deep
  /** Wzrost i spadek - te same barwy, co linia wykresu w chartSvg.ts. */
  up: '#0B9A51', // --sp-up
  down: '#C76B12', // --sp-down
  line: '#B9B1D8', // --soft-line-strong, wlos CIEMNIEJSZY od tla
  panel: '#FFFFFF', // --soft-surface, kryty
} as const;

const PADDING = 72;
const WIDTH = 1200;
const COLUMN = WIDTH - PADDING * 2;

/** Nazwa tokena jest dowolnym stringiem z kontraktu - kadr ma swoja miare. */
const MAX_NAME = 30;

function Glyph({ data }: { data: TokenCardData }) {
  const size = 104;
  if (data.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={data.logoUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 26, objectFit: 'cover' }}
      />
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        borderRadius: 26,
        background: data.accent,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: DISPLAY_FAMILY,
        fontSize: 40,
        fontWeight: 700,
        /**
         * Inicjaly ciemne, nie biale - i to nie jest kwestia motywu. Chipy
         * (ACCENTS w app/startpad/metadata.ts) to sredniotonowe pastele:
         * bialy tekst dawal na nich 2.74 / 2.84 / 2.94:1, czyli PONIZEJ progu
         * 3:1 na trzech z szesciu, juz w wersji ciemnej. #2E2A44 daje
         * 3.87-5.00:1 na wszystkich szesciu. Chipow NIE ruszamy - ich barwy sa
         * wspolna tozsamoscia z tablica launchpada i strona tokena.
         */
        color: '#2E2A44',
      }}
    >
      {safeSymbol(data.symbol).slice(0, 2).toUpperCase()}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 26px',
        borderRadius: 16,
        border: `1px solid ${CARD.line}`,
        background: CARD.panel,
        minWidth: 200,
      }}
    >
      <div style={{ display: 'flex', fontFamily: DISPLAY_FAMILY, fontSize: 34, fontWeight: 700, color: tone ?? CARD.ink }}>{value}</div>
      <div style={{ display: 'flex', fontSize: 17, letterSpacing: 2, color: CARD.brand, marginTop: 6 }}>{label}</div>
    </div>
  );
}

/**
 * Cena tokena z krzywej to okolo 1e-9 ETH. Notacja naukowa wyglada na blad, a
 * pelny zapis dziesietny na sciane zer - na karcie ogladanej w miniaturze
 * przegrywaja obie. Dlatego cena idzie w GWEI, gdzie te liczby sa czytelne
 * (7.5e-10 ETH to 0.75 gwei), a jednostka jest napisana obok.
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

/**
 * Nazwa perpa z API Flash ("ETH 2x Long"), a gdy jej nie ma - ticker z
 * konfiguracji ("ETH2xL"). Wielkie litery, bo stoi w nadlinii.
 */
function perpLabel(perp: NonNullable<TokenCardData['perp']>): string {
  return (perp.name ?? perp.symbol).toUpperCase();
}

export function TokenShareCard({ data, height }: { data: TokenCardData; height: number }) {
  const symbol = safeSymbol(data.symbol);
  const name = data.name.length > MAX_NAME ? `${data.name.slice(0, MAX_NAME)}…` : data.name;
  const tone = data.up ? CARD.up : CARD.down;
  const progress = Math.min(100, Math.round((data.raised / data.target) * 100));

  // Wykres dostaje resztę wysokosci: karta 3:2 jest o 170 px wyzsza od OG i to
  // wlasnie wykres ma z tego skorzystac, a nie powietrze miedzy pasmami.
  const chartHeight = Math.max(120, height - 470);
  const chart = chartDataUri(data.prices, { width: COLUMN, height: chartHeight, up: data.up });
  const perp = data.perp;
  const nav = perp?.navUsd ?? null;

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
      {/* PASMO 1 - skad to jest i z ktorego lancucha. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 5, color: CARD.brand }}>
          {perp ? 'MYSPHERE PERPS' : 'MYSPHERE STARTPAD'}
        </div>
        {/* Rynek perpa mowi, z CZYM mem jest sparowany - to jest powod, dla
            ktorego ten link w ogole ktos wkleja. Siec i stan schodza wtedy
            z karty (siec jest jedna: Base; stan widac po pasku krzywej). */}
        {perp ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', fontSize: 22, letterSpacing: 2, color: CARD.inkMuted }}>PAIRED WITH</div>
            <div
              style={{
                display: 'flex',
                padding: '6px 16px',
                borderRadius: 999,
                border: `2px solid ${CARD.line}`,
                background: CARD.panel,
                fontFamily: DISPLAY_FAMILY,
                fontSize: 24,
                fontWeight: 700,
                color: CARD.brand,
              }}
            >
              {perpLabel(perp)}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 2, color: CARD.inkMuted }}>
            {data.networkLabel.toUpperCase()} · {data.state.toUpperCase()}
          </div>
        )}
      </div>

      {/* PASMO 2 - tozsamosc po lewej, powod udostepnienia po prawej. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <Glyph data={data} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontFamily: DISPLAY_FAMILY, fontSize: 72, fontWeight: 700, color: CARD.ink, lineHeight: 1.05 }}>
              ${symbol}
            </div>
            <div style={{ display: 'flex', fontSize: 28, color: CARD.inkMuted, marginTop: 8 }}>{name}</div>
          </div>
        </div>

        {/* Mnoznik jest jedyna liczba pisana kolorem kierunku - reszta karty
            zostaje atramentowa, zeby to on byl widoczny w miniaturze. */}
        {data.multiple && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', fontFamily: DISPLAY_FAMILY, fontSize: 104, fontWeight: 700, color: tone, lineHeight: 1 }}>
              {data.multiple}
            </div>
            <div style={{ display: 'flex', fontSize: 20, letterSpacing: 3, color: CARD.brand, marginTop: 8 }}>
              SINCE LAUNCH
            </div>
          </div>
        )}
      </div>

      {/* PASMO 3 - ksztalt i stan. Wykresu nie ma, dopoki nie ma dwoch
          prawdziwych punktow; wtedy pasmo zostaje samymi liczbami. */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {chart && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chart} alt="" width={COLUMN} height={chartHeight} style={{ marginBottom: 26 }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Stat
            label={data.state === 'Graduated' ? 'RAISED' : `ON THE CURVE · ${progress}%`}
            // Jednostka SIECI, nie wpisany na sztywno eter: Arc rozlicza sie
            // w USDC i karta pisala tam "1000 ETH".
            value={
              perp && nav !== null
                ? `${usdShort(data.raised * nav)} / ${usdShort(data.target * nav)}`
                : `${ethLabel(data.raised)} / ${ethLabel(data.target)} ${data.nativeSymbol}`
            }
            tone={CARD.ink}
          />
          <Stat label="BUYERS" value={String(data.holders)} />
          {/* Kapitalizacja, nie cena. Cena tokena na krzywej to 7.5e-10 ETH -
              w dolarach wyglada jak zero, a w gwei nikt nie wie, czy 0.88 to
              duzo. Bez kursu ETH schodzimy na cene, zeby kafelek nie zostal
              pusty. */}
          {/* Cena w gwei ma sens tylko w ETH - na rynku perpa bez NAV zostaje
              kreska przy kapitalizacji zamiast liczby w zlej jednostce. */}
          {data.mcapUsd === null && !perp ? (
            <Stat label="PRICE" value={priceLabel(data.priceEth)} />
          ) : (
            <Stat label="MARKET CAP" value={mcapLabel(data.mcapUsd)} />
          )}
          {/* Na rynku perpa ostatni kafel nalezy do perpa: jego ruch z 24h to
              druga polowa argumentu "mem na dzwigni". Wiek tokena ustepuje. */}
          {perp && perp.change24hPct !== null ? (
            <Stat
              label={`${perp.symbol.toUpperCase()} · 24H`}
              value={pctLabel(perp.change24hPct)}
              tone={perp.change24hPct >= 0 ? CARD.up : CARD.down}
            />
          ) : (
            <Stat label="AGE" value={data.ageLabel.replace(' old', '')} />
          )}
        </div>
      </div>
    </div>
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
export function TokenShareFallback() {
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
      <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 5, color: CARD.brand }}>
        MYSPHERE STARTPAD
      </div>
      <div style={{ display: 'flex', fontFamily: DISPLAY_FAMILY, fontSize: 66, fontWeight: 700, color: CARD.ink, lineHeight: 1.1 }}>
        Launch a token on a curve. Graduate it to a live pool.
      </div>
      <div style={{ display: 'flex', fontSize: 26, color: CARD.inkMuted }}>mysphere.fun/startpad</div>
    </div>
  );
}

/**
 * Naglowki cache obu tras tokena.
 *
 * Krocej niz karta strony glownej (tydzien) i z powodu, ktorego tamta nie ma:
 * ta karta niesie cene, ktora zmienia sie z kazda transakcja. Piec minut to
 * kompromis - fala wejsc z jednego wklejenia miesci sie w jednym renderze, a
 * link odswiezony pol godziny pozniej nie pokazuje wczorajszego mnoznika.
 */
export const TOKEN_OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
};
