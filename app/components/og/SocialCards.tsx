import { DISPLAY_FAMILY } from './fonts';
import { BrandMark, Disc, Frame, INK, Sticker } from './sticker';

/**
 * Karty spolecznosciowe w stylu naklejek (app/components/og/sticker.tsx):
 * post (/post/[id]), napiwek (/tip/[txHash]), profil (/u/[address]) i ranking
 * (/leaderboard). Czyste komponenty na gotowych danych - trasy tylko czytaja
 * baze i podaja propsy, wiec rysunek da sie obejrzec bez Firestore.
 *
 * Zasady barw z rodziny: bursztyn = KWOTA (naklejka kwoty), zielen --sp-up =
 * stan "rozliczone", fiolet = to, co nalezy do czlowieka (autor, profil).
 */

const PADDING = 72;
const WIDTH = 1200;
const COLUMN = WIDTH - PADDING * 2;

/** Szerokosc naklejki z etykieta tekstowa - do kotwiczenia przy prawej krawedzi (satori nie zna `right`). */
function widthOf(text: string, size: number): number {
  return Math.round(text.length * size * 0.5) + Math.round(size * 0.6) * 2 + 6;
}

function Top({ path, tag, tagColor }: { path: string; tag?: string; tagColor?: string }) {
  return (
    <>
      <div style={{ position: 'absolute', left: PADDING, top: 64, display: 'flex' }}>
        <BrandMark path={path} />
      </div>
      {tag && (
        <Sticker
          label={<span style={{ color: tagColor ?? INK.ink }}>{tag}</span>}
          size={26}
          rotate={3}
          at={{ x: WIDTH - PADDING - widthOf(tag, 26), y: 54 }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------------ */

export type PostShareCardProps = {
  author: string;
  content: string;
  /** "12 USDC + 3 CELO" albo null, gdy nikt nie dal napiwku. */
  tips: string | null;
  likes: number | null;
  comments: number | null;
  networkNote: string | null;
};

export function PostShareCard({ author, content, tips, likes, comments, networkNote }: PostShareCardProps) {
  const size = content.length > 120 ? 40 : 54;
  return (
    <Frame>
      <Disc dy={-200} />
      <Top path="/post" tag={networkNote ?? undefined} />
      <div
        style={{
          position: 'absolute',
          left: PADDING,
          top: 150,
          width: COLUMN,
          display: 'flex',
          fontSize: size,
          lineHeight: 1.25,
          fontWeight: 700,
          letterSpacing: -0.6,
          color: INK.ink,
        }}
      >
        {content}
      </div>
      <div style={{ position: 'absolute', left: PADDING, top: 470, display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex' }}>
          <Sticker label={author} size={30} tone="violet" rotate={-3} />
        </div>
        {tips && (
          <div style={{ display: 'flex' }}>
            <Sticker label={tips} sub="in tips" size={30} subSize={18} tone="amber" rotate={2} />
          </div>
        )}
        {likes !== null && (
          <div style={{ display: 'flex' }}>
            <Sticker label={String(likes)} sub={likes === 1 ? 'like' : 'likes'} size={30} subSize={18} rotate={-1.5} subColor={INK.muted} />
          </div>
        )}
        {comments !== null && (
          <div style={{ display: 'flex' }}>
            <Sticker label={String(comments)} sub={comments === 1 ? 'comment' : 'comments'} size={30} subSize={18} rotate={2} subColor={INK.muted} />
          </div>
        )}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */

export type TipShareCardProps = {
  amount: string;
  token: string;
  from: string;
  to: string;
  /** Siec, na ktorej lezy kwit; null = kwitu nie znaleziono. */
  network: string | null;
};

export function TipShareCard({ amount, token, from, to, network }: TipShareCardProps) {
  return (
    <Frame>
      <Disc dy={-120} />
      <Top path="/tip" tag={network ? 'Settled onchain' : undefined} tagColor={INK.up} />
      <div style={{ position: 'absolute', left: PADDING, top: 150, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex' }}>
          <Sticker label={`${amount} ${token}`.trim()} size={104} tone="amber" rotate={-3} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 44, fontFamily: DISPLAY_FAMILY, fontSize: 44, fontWeight: 700 }}>
          <div style={{ display: 'flex', color: INK.ink }}>{from}</div>
          <div style={{ display: 'flex', color: INK.muted }}>→</div>
          <div style={{ display: 'flex', color: INK.violet }}>{to}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: PADDING, bottom: 56, display: 'flex', fontSize: 26, fontWeight: 700, color: INK.muted }}>
        {network ? `Verifiable on ${network}` : 'Receipt not found'}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */

export type ProfileShareCardProps = {
  name: string;
  /** Skrocony adres pod nazwa - tylko gdy nazwa nie jest juz adresem. */
  address: string | null;
  stats: Array<{ value: string; label: string; amount?: boolean }>;
};

export function ProfileShareCard({ name, address, stats }: ProfileShareCardProps) {
  const initials = name.replace(/^0x/i, '').slice(0, 2).toUpperCase();
  const nameSize = name.length <= 14 ? 84 : name.length <= 22 ? 64 : 50;
  const tilts = [-2, 1.5, -1, 2];
  return (
    <Frame>
      <Disc dy={-120} />
      <Top path="/u" />
      <div style={{ position: 'absolute', left: PADDING + 6, top: 150, display: 'flex', alignItems: 'center', gap: 34 }}>
        <div
          style={{
            display: 'flex',
            width: 128,
            height: 128,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            background: INK.violet,
            border: `3px solid ${INK.ink}`,
            boxShadow: `7px 7px 0 ${INK.ink}`,
            transform: 'rotate(-6deg)',
            fontFamily: DISPLAY_FAMILY,
            fontSize: 48,
            fontWeight: 700,
            color: INK.paper,
          }}
        >
          {initials}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: 820 }}>
          <div
            style={{
              display: 'flex',
              fontFamily: DISPLAY_FAMILY,
              fontSize: nameSize,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: -1.5,
              color: INK.ink,
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          {address && <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: INK.muted, marginTop: 10 }}>{address}</div>}
        </div>
      </div>
      <div style={{ position: 'absolute', left: PADDING, top: 440, display: 'flex', gap: 24 }}>
        {stats.map((stat, i) => (
          <div key={stat.label} style={{ display: 'flex' }}>
            <Sticker
              label={stat.value}
              sub={stat.label}
              size={38}
              subSize={20}
              tone={stat.amount ? 'amber' : 'paper'}
              rotate={tilts[i % tilts.length]}
              subColor={stat.amount ? undefined : INK.muted}
            />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */

export type LeaderboardShareCardProps = {
  windowLabel: string;
  rows: Array<{ name: string; amount: string }>;
  footer: string;
};

export function LeaderboardShareCard({ windowLabel, rows, footer }: LeaderboardShareCardProps) {
  const tilts = [-1.5, 1, -1];
  return (
    <Frame>
      <Disc dy={-120} />
      <Top path="/asks" tag={windowLabel} />
      <div
        style={{
          position: 'absolute',
          left: PADDING,
          top: 120,
          display: 'flex',
          fontFamily: DISPLAY_FAMILY,
          fontSize: 80,
          fontWeight: 700,
          letterSpacing: -2,
          color: INK.ink,
        }}
      >
        Who got paid
      </div>
      <div style={{ position: 'absolute', left: PADDING, top: 228, width: COLUMN, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.length === 0 ? (
          <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, color: INK.muted }}>Nobody yet - the list is open.</div>
        ) : (
          rows.map((row, i) => (
            <div
              key={row.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: 820,
                padding: '10px 26px',
                borderRadius: 22,
                background: i === 0 ? INK.amber : INK.paper,
                border: `3px solid ${INK.ink}`,
                boxShadow: `7px 7px 0 ${INK.ink}`,
                transform: `rotate(${tilts[i % tilts.length]}deg)`,
                fontFamily: DISPLAY_FAMILY,
                fontSize: 36,
                fontWeight: 700,
                color: INK.ink,
              }}
            >
              <div style={{ display: 'flex', gap: 22 }}>
                <div style={{ display: 'flex', width: 30 }}>{i + 1}</div>
                <div style={{ display: 'flex' }}>{row.name}</div>
              </div>
              <div style={{ display: 'flex' }}>{row.amount}</div>
            </div>
          ))
        )}
      </div>
      <div style={{ position: 'absolute', left: PADDING, bottom: 40, display: 'flex', fontSize: 24, fontWeight: 700, color: INK.muted }}>
        {footer}
      </div>
    </Frame>
  );
}
