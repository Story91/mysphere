/**
 * Post na stronach /blink/* narysowany jak post w feedzie: awatar, autor,
 * znacznik sieci, data, tresc w normalnym rozmiarze i cichy link do kwitu.
 *
 * Komponent SERWEROWY (bez 'use client'), bo strona jest ISR i post ma byc
 * w HTML od pierwszego bajtu - takze w podgladzie linku i u kogos, komu stos
 * Solany jeszcze sie nie zaladowal.
 *
 * Awatar: app/components/identity/Avatar.tsx jest modulem klienckim, ktory
 * ciagnie hooki tozsamosci (ENS/Basename). Tu potrzeba samego zastepczego
 * awatara, wiec rysujemy go lokalnie TA SAMA funkcja koloru co
 * AvatarPlaceholder - ten sam autor ma ten sam gradient co w feedzie.
 */

import { shortAddress } from '../../utils/posts/getPostForShare';

/** Kopia gradientForAddress z Avatar.tsx - trzymac w zgodzie. */
function gradientForAddress(address: string): { from: string; to: string; key: string } {
  const key = address.toLowerCase().replace(/^0x/, '');
  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (Math.imul(h2, 33) + c) >>> 0;
  }
  const hue = h1 % 360;
  const hueShift = 30 + (h2 % 70);
  return {
    from: `hsl(${hue}, 70%, 58%)`,
    to: `hsl(${(hue + hueShift) % 360}, 72%, 42%)`,
    key: h1.toString(16).padStart(8, '0'),
  };
}

function PostAvatar({ seed }: { seed: string }) {
  const { from, to, key } = gradientForAddress(seed || 'unknown');
  const id = `blink-avatar-${key}`;
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full">
      <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill={`url(#${id})`} />
        <circle cx="20" cy="16" r="6.5" fill="rgba(255,255,255,0.85)" />
        <path d="M8 40c0-7 5.4-11.5 12-11.5S32 33 32 40Z" fill="rgba(255,255,255,0.85)" />
      </svg>
    </div>
  );
}

// Strefa UTC, bo strona renderuje sie na serwerze (ISR) - lokalna strefa
// serwera nic nie mowi czytajacemu, a UTC przynajmniej jest stala.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default function PostCard({
  authorName,
  authorAddress,
  content,
  timestamp,
  networkLabel,
  receiptUrl,
  threaded = false,
}: {
  authorName?: string;
  authorAddress: string;
  content: string;
  timestamp: number;
  /** Np. "Solana" - znacznik obok autora. Brak dla postow spoza Solany. */
  networkLabel?: string;
  /** Link do transakcji posta w eksploratorze. */
  receiptUrl?: string;
  /** Linia watku od awatara w dol - pod postem stoi odpowiedz. */
  threaded?: boolean;
}) {
  const handle = shortAddress(authorAddress);
  const date = timestamp > 0 ? new Date(timestamp) : null;

  return (
    <article className="flex gap-3" aria-label={`Post by ${authorName || handle}`}>
      <div className="flex flex-col items-center">
        <PostAvatar seed={authorAddress} />
        {threaded && <div aria-hidden="true" className="mt-2 w-0.5 flex-1 rounded-full bg-soft-line" />}
      </div>

      <div className={`min-w-0 flex-1 ${threaded ? 'pb-5' : ''}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-bold text-soft-ink">{authorName || handle}</span>
          {authorName && <span className="truncate font-mono text-xs text-soft-ink-muted">{handle}</span>}
          {networkLabel && (
            <span className="rounded-full bg-soft-sunken px-2 py-0.5 text-[11px] font-semibold text-soft-ink-muted">
              on {networkLabel}
            </span>
          )}
        </div>
        {date && (
          <time dateTime={date.toISOString()} className="mt-0.5 block text-xs text-soft-ink-muted">
            {DATE_FORMAT.format(date)}
          </time>
        )}

        <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-soft-ink">{content}</p>

        {receiptUrl && (
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-[32px] items-center gap-1 rounded text-xs font-semibold text-soft-ink-muted underline-offset-2 hover:text-soft-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            View receipt
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3">
              <path d="M6 3h7v7M13 3 5 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">(opens the Solana explorer)</span>
          </a>
        )}
      </div>
    </article>
  );
}
