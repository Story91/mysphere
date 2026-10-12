import { DISPLAY_FAMILY } from './fonts';
import { BrandMark, Disc, Frame, INK, Sticker } from './sticker';

/**
 * Karta pojedynczego Aska (/ask/[id]), w stylu naklejek
 * (app/components/og/sticker.tsx).
 *
 * Niesie to samo, co tytul strony: KWOTE ZA ODPOWIEDZ (liczba czytajacego, nie
 * autora) na bursztynowej naklejce - w tym systemie bursztyn znaczy kwote - i
 * pytanie duzym krojem. Naklejka stanu pojawia sie tylko wtedy, gdy stan jest
 * sprawdzony (Ask zapieczetowany albo legacy); Ask niesprawdzony nie dostaje
 * ani "open", ani "closed".
 */

const PADDING = 72;
/** ~3 linijki po ~40 znakow przy 50 px; dluzsze pytanie dostaje wielokropek. */
const MAX_QUESTION = 120;

export type AskShareCardProps = {
  perAnswer: string;
  budget: string;
  seats: number;
  question: string;
  /** null = stan niesprawdzony, naklejki stanu nie ma. */
  state: { label: string; open: boolean } | null;
  escrowed: boolean;
};

/** Szerokosc naklejki z etykieta tekstowa - do kotwiczenia przy prawej krawedzi. */
function widthOf(text: string, size: number): number {
  return Math.round(text.length * size * 0.5) + Math.round(size * 0.6) * 2 + 6;
}

export function AskShareCard({ perAnswer, budget, seats, question, state, escrowed }: AskShareCardProps) {
  const text = question.length > MAX_QUESTION ? `${question.slice(0, MAX_QUESTION - 1).trimEnd()}…` : question;
  const facts = [`${budget} across ${seats} ${seats === 1 ? 'seat' : 'seats'}`, 'sealed answers', escrowed ? 'budget in escrow' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Frame>
      <Disc dy={-160} />

      <div style={{ position: 'absolute', left: PADDING, top: 64, display: 'flex' }}>
        <BrandMark path="/ask" />
      </div>
      {state && (
        <Sticker
          label={<span style={{ color: state.open ? INK.up : INK.muted }}>{state.label}</span>}
          size={26}
          tone="paper"
          rotate={3}
          at={{ x: 1200 - PADDING - widthOf(state.label, 26), y: 54 }}
        />
      )}

      <div style={{ position: 'absolute', left: PADDING, top: 140, right: PADDING, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex' }}>
          <Sticker label={perAnswer} sub="for an answer" size={64} subSize={24} tone="amber" rotate={-4} />
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 34,
            fontFamily: DISPLAY_FAMILY,
            fontSize: 50,
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: -0.8,
            color: INK.ink,
          }}
        >
          {text}
        </div>
      </div>

      <div
        style={{ position: 'absolute', left: PADDING, bottom: 56, display: 'flex', fontSize: 26, fontWeight: 700, color: INK.muted }}
      >
        {facts}
      </div>
    </Frame>
  );
}

/** Stan Aska zmienia sie z kazda odpowiedzia - 5 minut w CDN. */
export const ASK_OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
};
