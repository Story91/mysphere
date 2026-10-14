import { BODY_FAMILY, DISPLAY_FAMILY } from './fonts';
import { BrandMark, Frame, INK, Sticker } from './sticker';
import { clashRopeShare, safeSymbol } from '../../startpad/shareText';
import { isBullBear, isShortPerp, perpBaseOf, sideWord } from '../../startpad/duel';
import type { TokenCardData } from '../../startpad/share/tokenCard';

/**
 * Plakat pojedynku (Bull vs Bear / Asset Clash) - karta OG dla
 * /perps/clash/<a>-<b>/. Dwie naklejki-zawodnicy (strona 'a' fioletowa po
 * lewej, strona 'b' bursztynowa po prawej, jak na tablicy), lina z plakietka VS
 * i haslo "Pick a side". Styl naklejek z ./sticker.tsx.
 *
 * ===========================================================================
 * CO TA KARTA ZAPEWNIA I CZEGO NIE WOLNO NA NIEJ POKAZAC
 * ===========================================================================
 * To zaproszenie do wyboru strony, nie wynik. Dlatego NIE MA tu kwot, kapitalizacji,
 * mnoznikow, procentow zysku ani 24-godzinnego ruchu perpa. Jedyne liczby to
 * procenty liny, i to tylko gdy OBIE strony cos zebraly (clashRopeShare);
 * "X leads" tez tylko wtedy. Bez ruchu na obu stronach lina jest 50/50
 * i karta mowi "PICK A SIDE".
 *
 * Stopka niesie ostrzezenie o dzwigni 2x - karta krazy po X poza naszym
 * kontekstem, wiec nie wolno liczyc na to, ze ktos przeczyta je na stronie.
 *
 * Zero emoji: kroje w ./fonts.ts sa lacinskie. Strzalki long/short i gwiazda
 * VS sa rysowane (SVG / diwy), nie znakami.
 *
 * SATORI: sam flex, `display` jawnie na kazdym kontenerze, bez animacji i
 * filtrow. Karta ma sie narysowac zawsze - brak logo = glif z inicjalami,
 * brak danych = 50/50, nigdy NaN ani kreski.
 */

const WIDTH = 1200;
const PADDING = 64;
const COLUMN = WIDTH - PADDING * 2;

const CARD_TOP = 152;
const CARD_HEIGHT = 196;
const CARD_WIDTH = 468;

const ROPE_HEIGHT = 52;
const ROPE_CENTER = 410;

/** Szerokosc naklejki z etykieta tekstowa - satori nie zna `right`, wiec kotwiczymy z szacunku. */
function widthOf(text: string, size: number): number {
  return Math.round(text.length * size * 0.5) + Math.round(size * 0.6) * 2 + 6;
}

type Side = {
  card: TokenCardData;
  word: string;
  base: string;
  short: boolean;
  tone: 'violet' | 'amber';
};

function sideOf(card: TokenCardData, bullBear: boolean, tone: Side['tone'], fallback: string): Side {
  const perpSymbol = card.perp?.symbol ?? '';
  const word = perpSymbol ? sideWord(perpSymbol, bullBear) : fallback;
  return {
    card,
    word: word || fallback,
    base: perpSymbol ? perpBaseOf(perpSymbol) || fallback : fallback,
    short: perpSymbol ? isShortPerp(perpSymbol) : false,
    tone,
  };
}

/** Strzalka long (w gore, zielona) albo short (w dol, brazowa) - rysowana, bo kroje nie maja strzalek. */
function Arrow({ down }: { down: boolean }) {
  return (
    <svg width="20" height="18" viewBox="0 0 20 18">
      <polygon
        points={down ? '10,17 19,2 1,2' : '10,1 19,16 1,16'}
        fill={down ? INK.down : INK.up}
        stroke={INK.ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Logo tokena (PNG z loadTokenCard) albo glif z inicjalami - jak na karcie tokena.
 *
 * Obrys to PADDING na granatowym tle, a nie `border`: przy `border` + `overflow:
 * hidden` + obrazku w przechylonej karcie resvg ucinal obrazek inaczej niz
 * ramke i miedzy nimi robila sie szczelina (zmierzone na PNG).
 */
function Portrait({ card, size }: { card: TokenCardData; size: number }) {
  const inner = size - 6;
  return (
    <div
      style={{
        display: 'flex',
        padding: 3,
        borderRadius: 26,
        background: INK.ink,
        boxShadow: `5px 5px 0 ${INK.ink}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: inner,
          height: inner,
          borderRadius: 23,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          background: card.logoUrl ? INK.ink : card.accent,
          fontFamily: DISPLAY_FAMILY,
          fontSize: 44,
          fontWeight: 700,
          color: INK.ink,
        }}
      >
        {card.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.logoUrl} alt="" width={inner} height={inner} style={{ width: inner, height: inner, objectFit: 'cover' }} />
        ) : (
          safeSymbol(card.symbol).slice(0, 2).toUpperCase()
        )}
      </div>
    </div>
  );
}

function Fighter({ side, x, rotate, bullBear }: { side: Side; x: number; rotate: number; bullBear: boolean }) {
  const violet = side.tone === 'violet';
  const fg = violet ? INK.paper : INK.ink;
  const symbol = `$${safeSymbol(side.card.symbol)}`;
  const symbolSize = symbol.length <= 9 ? 38 : symbol.length <= 12 ? 32 : 27;
  // Bull vs Bear: chip niesie perp ("ETH 2x"). Asset Clash: slowo strony JEST
  // aktywem, wiec chip mowi o kierunku ("2x long") zamiast je powtarzac.
  const chip = bullBear ? `${side.base} 2x` : `2x ${side.short ? 'short' : 'long'}`;
  const wordSize = side.word.length <= 4 ? 72 : side.word.length <= 6 ? 58 : 46;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: CARD_TOP,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '0 26px',
        borderRadius: 28,
        background: violet ? INK.violet : INK.amber,
        border: `3px solid ${INK.ink}`,
        boxShadow: `7px 7px 0 ${INK.ink}`,
        transform: `rotate(${rotate}deg)`,
      }}
    >
      <Portrait card={side.card} size={124} />
      <div style={{ display: 'flex', flexDirection: 'column', width: 246 }}>
        <div
          style={{
            display: 'flex',
            fontFamily: DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: wordSize,
            lineHeight: 0.95,
            letterSpacing: -1.5,
            color: fg,
            whiteSpace: 'nowrap',
          }}
        >
          {side.word}
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: symbolSize,
            lineHeight: 1.05,
            marginTop: 6,
            color: fg,
            whiteSpace: 'nowrap',
          }}
        >
          {symbol}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 8,
            marginTop: 10,
            padding: '4px 14px 4px 11px',
            borderRadius: 999,
            background: INK.paper,
            border: `3px solid ${INK.ink}`,
            fontFamily: DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 24,
            lineHeight: 1,
            color: INK.ink,
            whiteSpace: 'nowrap',
          }}
        >
          <Arrow down={side.short} />
          {chip}
        </div>
      </div>
    </div>
  );
}

/**
 * Lina: dwa kolory dzielone w punkcie `aPct`, skrety splotu jako skosne kreski
 * i jasny blik u gory. Splot to dziesiatki malych divow - satori nie rysuje
 * powtarzanych gradientow, ale rysuje div.
 */
function Rope({ aPct }: { aPct: number }) {
  const inner = COLUMN - 6;
  const left = Math.round((inner * aPct) / 100);
  const twists = Array.from({ length: Math.ceil(inner / 26) }, (_, i) => i);

  return (
    <div
      style={{
        position: 'absolute',
        left: PADDING,
        top: ROPE_CENTER - ROPE_HEIGHT / 2,
        width: COLUMN,
        height: ROPE_HEIGHT,
        display: 'flex',
        borderRadius: 999,
        border: `3px solid ${INK.ink}`,
        boxShadow: `5px 5px 0 ${INK.ink}`,
        background: INK.paper,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', width: left, height: '100%', background: INK.violet, borderRight: `3px solid ${INK.ink}` }} />
      <div style={{ display: 'flex', flex: 1, height: '100%', background: INK.amber }} />
      <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', width: inner, height: '100%' }}>
        {twists.map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              width: 26,
              height: '100%',
              borderRight: '4px solid rgba(46,42,68,0.2)',
              transform: 'skewX(-24deg)',
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 14,
          top: 6,
          width: inner - 28,
          height: 7,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.32)',
          display: 'flex',
        }}
      />
    </div>
  );
}

/** Plakietka VS: osmioramienna gwiazda z dwoch kwadratow i napis, przechylona jak uderzenie. */
function Slam({ x }: { x: number }) {
  const box = 112;
  const square = 70;
  const offset = (box - square) / 2;
  const squareStyle = {
    position: 'absolute',
    left: offset,
    top: offset,
    width: square,
    height: square,
    display: 'flex',
    background: INK.amber,
    border: `4px solid ${INK.ink}`,
  } as const;

  return (
    <div
      style={{
        position: 'absolute',
        left: x - box / 2,
        top: ROPE_CENTER - box / 2,
        width: box,
        height: box,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: 'rotate(-9deg)',
      }}
    >
      <div style={{ ...squareStyle, borderRadius: 10 }} />
      <div style={{ ...squareStyle, borderRadius: 10, transform: 'rotate(45deg)' }} />
      {/* Zakrywa zewnetrzny obrys w srodku, zeby napis stal na gladkim polu. */}
      <div style={{ ...squareStyle, borderRadius: 10, border: '0 solid transparent', width: square - 8, height: square - 8, left: offset + 4, top: offset + 4 }} />
      <div
        style={{
          display: 'flex',
          fontFamily: DISPLAY_FAMILY,
          fontWeight: 700,
          fontSize: 44,
          lineHeight: 1,
          color: INK.ink,
          letterSpacing: -1,
        }}
      >
        VS
      </div>
    </div>
  );
}

function PercentLabel({ pct, word, tone, align }: { pct: number; word: string; tone: Side['tone']; align: 'left' | 'right' }) {
  const dot = (
    <div
      style={{
        display: 'flex',
        width: 22,
        height: 22,
        borderRadius: 999,
        border: `3px solid ${INK.ink}`,
        background: tone === 'violet' ? INK.violet : INK.amber,
      }}
    />
  );
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: DISPLAY_FAMILY,
        fontWeight: 700,
        fontSize: 40,
        lineHeight: 1,
        color: INK.ink,
        whiteSpace: 'nowrap',
      }}
    >
      {align === 'left' && dot}
      <span>
        {pct}% {word}
      </span>
      {align === 'right' && dot}
    </div>
  );
}

export function ClashShareCard({ a, b, ticker }: { a: TokenCardData; b: TokenCardData; ticker: string }) {
  const bullBear = isBullBear(a.perp?.symbol, b.perp?.symbol);
  const sideA = sideOf(a, bullBear, 'violet', 'A');
  const sideB = sideOf(b, bullBear, 'amber', 'B');
  const rope = clashRopeShare(
    { raised: a.raised, navUsd: a.perp?.navUsd ?? null },
    { raised: b.raised, navUsd: b.perp?.navUsd ?? null }
  );

  const headline = `$${safeSymbol(ticker)}: ${sideA.word} VS ${sideB.word}`;
  const headlineSize = headline.length <= 20 ? 64 : headline.length <= 26 ? 56 : 48;
  const tag = 'Flash 2x perps';

  const ropeWidth = COLUMN - 6;
  const slamX = PADDING + 3 + Math.round((ropeWidth * rope.aPct) / 100);

  const leader = !rope.traded ? null : rope.aPct > rope.bPct ? sideA : rope.bPct > rope.aPct ? sideB : null;

  return (
    <Frame>
      {/* Dwa miekkie kola pod zawodnikami - fiolet po lewej, bursztyn po prawej. */}
      <div style={{ position: 'absolute', left: -170, top: 70, width: 620, height: 620, borderRadius: 999, background: 'rgba(95,78,194,0.13)', display: 'flex' }} />
      <div style={{ position: 'absolute', left: 750, top: 70, width: 620, height: 620, borderRadius: 999, background: 'rgba(245,167,59,0.2)', display: 'flex' }} />

      <div style={{ position: 'absolute', left: PADDING, top: 36, display: 'flex' }}>
        <BrandMark path="/perps" />
      </div>
      <Sticker label={tag} size={22} tone="paper" rotate={3} at={{ x: WIDTH - PADDING - widthOf(tag, 22) - 8, y: 30 }} />

      <div
        style={{
          position: 'absolute',
          left: PADDING,
          top: 80,
          display: 'flex',
          fontFamily: DISPLAY_FAMILY,
          fontWeight: 700,
          fontSize: headlineSize,
          lineHeight: 1,
          letterSpacing: -1.5,
          color: INK.ink,
          whiteSpace: 'nowrap',
        }}
      >
        {headline}
      </div>

      <Fighter side={sideA} x={PADDING} rotate={-2} bullBear={bullBear} />
      <Fighter side={sideB} x={WIDTH - PADDING - CARD_WIDTH} rotate={2} bullBear={bullBear} />

      <Rope aPct={rope.aPct} />
      <Slam x={slamX} />

      {/* Pod lina: bez ruchu po obu stronach - zaproszenie, z ruchem - podzial i prowadzacy. */}
      <div
        style={{
          position: 'absolute',
          left: PADDING,
          top: 470,
          width: COLUMN,
          height: 70,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', width: 330, justifyContent: 'flex-start' }}>
          {rope.traded && <PercentLabel pct={rope.aPct} word={sideA.word} tone="violet" align="left" />}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {rope.traded ? (
            <Sticker
              label={leader ? `${leader.word} LEADS` : 'DEAD HEAT'}
              size={30}
              tone={leader ? leader.tone : 'paper'}
              rotate={-2}
            />
          ) : (
            <Sticker label="PICK A SIDE" size={38} tone="violet" rotate={-2} />
          )}
        </div>
        <div style={{ display: 'flex', width: 330, justifyContent: 'flex-end' }}>
          {rope.traded && <PercentLabel pct={rope.bPct} word={sideB.word} tone="amber" align="right" />}
        </div>
      </div>

      {/* Stopka: kredyt i ostrzezenie o dzwigni - male, ale czytelne w miniaturze na telefonie. */}
      <div
        style={{
          position: 'absolute',
          left: PADDING,
          top: 558,
          width: COLUMN,
          display: 'flex',
          alignItems: 'center',
          gap: 30,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 28,
            lineHeight: 1,
            color: INK.ink,
            whiteSpace: 'nowrap',
          }}
        >
          Built on Flash
        </div>
        {/* Dwie recznie podzielone linie: lamanie satori zostawialo sierote na koncu. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontFamily: BODY_FAMILY,
            fontWeight: 700,
            fontSize: 21,
            lineHeight: 1.25,
            color: INK.muted,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ display: 'flex' }}>Flash perps are 2x leveraged and can lose most of their value</div>
          <div style={{ display: 'flex' }}>in a large move. Not financial advice.</div>
        </div>
      </div>
    </Frame>
  );
}
