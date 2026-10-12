import { DISPLAY_FAMILY, BODY_FAMILY } from './fonts';

/**
 * Karta pojedynczego Aska (/ask/[id]).
 *
 * Do 2026-10-12 link do Aska dziedziczyl karte strony glownej, czyli kazde
 * pytanie wygladalo w podgladzie identycznie. Teraz karta niesie to samo, co
 * tytul strony: KWOTE ZA ODPOWIEDZ (liczba czytajacego, nie autora) i pytanie.
 *
 * Kwota w --soft-accent-deep #C2410C (4.50:1) - w tym systemie pomarancz
 * znaczy kwote, tak samo jak na karcie rankingu. Plakietka stanu pojawia sie
 * tylko wtedy, gdy stan jest sprawdzony (Ask zapieczetowany albo legacy);
 * Ask niesprawdzony nie dostaje ani "OPEN", ani "CLOSED".
 */

const CARD = {
  bg: '#F1EDFA',
  ink: '#2E2A44',
  inkMuted: '#6B6486',
  brand: '#5F4EC2',
  amount: '#C2410C',
  open: '#0B9A51',
  line: '#B9B1D8',
  panel: '#FFFFFF',
} as const;

const PADDING = 72;
/** ~3 linijki po ~38 znakow przy 52 px; dluzsze pytanie dostaje wielokropek. */
const MAX_QUESTION = 120;

export type AskShareCardProps = {
  perAnswer: string;
  budget: string;
  seats: number;
  question: string;
  /** null = stan niesprawdzony, plakietki nie ma. */
  state: { label: string; open: boolean } | null;
  escrowed: boolean;
};

export function AskShareCard({ perAnswer, budget, seats, question, state, escrowed }: AskShareCardProps) {
  const text = question.length > MAX_QUESTION ? `${question.slice(0, MAX_QUESTION - 1).trimEnd()}…` : question;
  const facts = [`${budget} across ${seats} ${seats === 1 ? 'seat' : 'seats'}`, 'sealed answers', escrowed ? 'budget in escrow' : null]
    .filter(Boolean)
    .join(' · ');

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
        <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 5, color: CARD.brand }}>MYSPHERE ASKS</div>
        {state && (
          <div
            style={{
              display: 'flex',
              padding: '6px 16px',
              borderRadius: 999,
              border: `2px solid ${CARD.line}`,
              background: CARD.panel,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 2,
              color: state.open ? CARD.open : CARD.inkMuted,
            }}
          >
            {state.label}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <div style={{ display: 'flex', fontFamily: DISPLAY_FAMILY, fontSize: 96, fontWeight: 700, lineHeight: 1, color: CARD.amount }}>
            {perAnswer}
          </div>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, color: CARD.inkMuted }}>for an answer</div>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 24,
            fontFamily: DISPLAY_FAMILY,
            fontSize: 52,
            fontWeight: 600,
            lineHeight: 1.18,
            color: CARD.ink,
          }}
        >
          {text}
        </div>
      </div>

      <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: CARD.inkMuted }}>{facts}</div>
    </div>
  );
}

/** Stan Aska zmienia sie z kazda odpowiedzia - 5 minut w CDN. */
export const ASK_OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
};
