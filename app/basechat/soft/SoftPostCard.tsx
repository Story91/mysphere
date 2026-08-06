'use client';

import Image from 'next/image';
import { SOFT_NETWORKS } from './SoftStoryRail';

/**
 * Karta posta w kierunku Soft Social.
 *
 * Z projektu (wariant 1b): biale tlo, promien 24px, padding 16px, cien
 * `0 4px 16px rgba(102,86,190,.08)`. Cien jest FIOLETOWY, nie czarny - czarny
 * na lawendowym tle wyglada jak brud, a nie jak uniesienie.
 *
 * CZEGO TA KARTA NIE ROBI. Nie pobiera danych, nie zna Firestore, nie wola
 * zadnego API. Dostaje gotowe wartosci i zdarzenia. Dzieki temu da sie ja
 * obejrzec w oderwaniu od aplikacji, a wdrozenie nowego wygladu nie wymaga
 * dotykania logiki feedu - czyli tego, co przy poprzednich zmianach wygladu
 * psulo sie najczesciej.
 *
 * ODZNAKA SIECI jest tu maksymalnie cicha: sam znak, bez podpisu i bez
 * kolorowej pigulki. W projekcie siec jest juz powiedziana wyzej, w pasku
 * "stories" - powtarzanie jej krzykliwie przy kazdym poscie robi z feedu
 * tablice logotypow.
 */

export type SoftPostCardProps = {
  authorName: string;
  authorAvatarUrl?: string | null;
  network?: string | null;
  timeAgo: string;
  content: string;
  imageUrl?: string | null;
  likes: number;
  comments: number;
  /** Suma tipow gotowa do wyswietlenia, np. "4 USDC". Brak = nie pokazujemy. */
  tipsLabel?: string | null;
  isPinned?: boolean;
  isLiked?: boolean;
  onLike?: () => void;
  onComment?: () => void;
  onTip?: () => void;
  onOpenAuthor?: () => void;
};

function IconButton({
  label,
  onClick,
  active,
  children,
  count,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={[
        'flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 font-soft text-[12.5px] font-semibold',
        'transition-[color,background-color,transform] duration-[--dur-press] ease-out-strong',
        'active:scale-[0.94] outline-none',
        'focus-visible:ring-2 focus-visible:ring-soft-primary',
        active ? 'text-soft-accent-deep' : 'text-soft-ink-soft',
      ].join(' ')}
    >
      <span aria-hidden="true">{children}</span>
      {typeof count === 'number' && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

export default function SoftPostCard({
  authorName,
  authorAvatarUrl,
  network,
  timeAgo,
  content,
  imageUrl,
  likes,
  comments,
  tipsLabel,
  isPinned,
  isLiked,
  onLike,
  onComment,
  onTip,
  onOpenAuthor,
}: SoftPostCardProps) {
  const networkDef = SOFT_NETWORKS.find((n) => n.id === network);

  return (
    <article className="rounded-card bg-soft-surface p-4 shadow-card">
      <header className="mb-3 flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenAuthor}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-pill text-left outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
        >
          {authorAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- dowolne domeny
            <img src={authorAvatarUrl} alt="" className="h-9 w-9 flex-none rounded-full object-cover" />
          ) : (
            <Image src="/ghostavatar.png" alt="" width={36} height={36} className="h-9 w-9 flex-none rounded-full" />
          )}

          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-soft-display text-[14px] font-bold text-soft-ink">
                {authorName}
              </span>
              {networkDef && (
                <Image
                  src={networkDef.iconSrc}
                  alt={networkDef.label}
                  width={14}
                  height={14}
                  className="h-3.5 w-3.5 flex-none rounded-[3px] object-contain"
                />
              )}
            </span>
            <span className="block font-soft text-[11.5px] text-soft-ink-faint">
              {isPinned && <span className="mr-1 text-soft-accent-deep">Pinned</span>}
              {timeAgo}
            </span>
          </span>
        </button>
      </header>

      <p className="whitespace-pre-wrap break-words font-soft text-[14.5px] leading-[1.55] text-soft-ink-muted">
        {content}
      </p>

      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- dowolne domeny
        <img
          src={imageUrl}
          alt=""
          className="mt-3 w-full rounded-[18px] object-cover"
          loading="lazy"
        />
      )}

      <footer className="mt-3 flex items-center gap-1 border-t border-soft-line/60 pt-2">
        <IconButton label="Like" onClick={onLike} active={isLiked} count={likes}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 5.6a5.5 5.5 0 00-7.8 0L12 6.6l-1-1a5.5 5.5 0 00-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 000-7.8z" />
          </svg>
        </IconButton>

        <IconButton label="Comments" onClick={onComment} count={comments}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-4-.9L3 21l1.9-4.9A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" />
          </svg>
        </IconButton>

        <span className="flex-1" />

        {/* Kwota, jesli jakas jest, stoi PRZED przyciskiem tipa i jest jedynym
            miejscem w karcie z mocnym kolorem. Rozliczone pieniadze to jedyna
            liczba w tym feedzie, ktorej nie da sie nabic. */}
        {tipsLabel && (
          <span className="rounded-pill bg-soft-accent-soft px-2.5 py-1 font-soft-display text-[12px] font-bold tabular-nums text-soft-accent-deep">
            {tipsLabel}
          </span>
        )}

        <IconButton label="Send a tip" onClick={onTip}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5s2.2 2.7 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3" />
          </svg>
        </IconButton>
      </footer>
    </article>
  );
}
