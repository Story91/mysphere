'use client';

import { useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toMillis } from '../../utils/firestoreTime';
import SoftStoryRail from './SoftStoryRail';
import SoftTabs from './SoftTabs';
import SoftComposerPill from './SoftComposerPill';
import SoftPostCard from './SoftPostCard';

/**
 * Mobilny feed w kierunku Soft Social - WPIETY W PRODUKCJE.
 *
 * ZAKRES JEST CELOWO WASKI. Ten komponent zastepuje wyglad SRODKOWEGO PANELU
 * na telefonie i nic wiecej. Desktop idzie stara sciezka bez jednej zmienionej
 * linii, a cala logika - postowanie na osmiu lancuchach, platnosci, znajomi,
 * powiadomienia - zostaje tam, gdzie byla.
 *
 * Dlaczego tak, a nie przepisanie panelu na miejscu: `app/basechat/page.tsx`
 * ma blisko 3800 linii i trzyma stan calej aplikacji. Kazda zmiana wygladu
 * robiona wewnatrz niego dotyka tego samego kodu, co platnosci. Tutaj granica
 * jest ostra: ten plik dostaje gotowe dane i oddaje zdarzenia w gore.
 *
 * KOMPOZYTOR. Pigulka nie jest osobnym formularzem - po dotknieciu przewija do
 * PRAWDZIWEGO kompozytora i ustawia w nim fokus. Druga implementacja pisania
 * postu byla by drugim miejscem, w ktorym trzeba naprawiac ten sam blad.
 */

export type SoftFeedPost = {
  id: string;
  author: string;
  authorName?: string;
  content: string;
  timestamp: unknown;
  image?: string | null;
  network?: string;
  likes?: number;
  comments?: unknown[];
  isPinned?: boolean;
  likedBy?: string[];
};

const TABS = [
  { id: 'forYou', label: 'All Posts' },
  { id: 'following', label: 'Follows' },
  { id: 'baseName', label: 'Basenames' },
];

function shortAddress(value: string) {
  return value && value.length > 10 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value || 'unknown';
}

export default function SoftFeedMobile({
  posts,
  currentAddress,
  avatarUrl,
  activeFeed,
  onFeedChange,
  onOpenComposer,
  onLike,
  onOpenPost,
  onOpenAuthor,
  onTip,
  isLoading,
}: {
  posts: SoftFeedPost[];
  currentAddress?: string;
  avatarUrl?: string | null;
  activeFeed: string;
  onFeedChange: (id: string) => void;
  onOpenComposer: () => void;
  onLike?: (postId: string) => void;
  onOpenPost?: (postId: string) => void;
  onOpenAuthor?: (address: string) => void;
  onTip?: (postId: string) => void;
  isLoading?: boolean;
}) {
  /**
   * `null` znaczy "wszystkie sieci" i jest stanem POCZATKOWYM.
   * Gdyby domyslnie wybrany byl Base, feed po wejsciu ukrywalby posty
   * z siedmiu pozostalych lancuchow bez zadnej informacji dlaczego.
   */
  const [networkFilter, setNetworkFilter] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const visiblePosts = useMemo(() => {
    if (!networkFilter) return posts;
    return posts.filter((post) => (post.network ?? 'base') === networkFilter);
  }, [posts, networkFilter]);

  const formatTime = (value: unknown) => {
    const ms = toMillis(value);
    if (!ms) return 'just now';
    try {
      return formatDistanceToNow(new Date(ms), { addSuffix: true });
    } catch {
      return 'recently';
    }
  };

  return (
    <div ref={railRef} className="bg-soft-bg font-soft lg:hidden">
      {/* Dotkniecie aktywnej sieci ODZNACZA ja i wraca do wszystkich - inaczej
          nie ma drogi powrotnej bez przeladowania strony. */}
      <SoftStoryRail
        activeNetwork={networkFilter ?? ''}
        onSelect={(id) => setNetworkFilter((current) => (current === id ? null : id))}
      />

      <SoftTabs tabs={TABS} activeTab={activeFeed} onSelect={onFeedChange} />

      <div className="flex flex-col gap-3.5 px-4 pb-28 pt-1">
        {currentAddress && (
          <SoftComposerPill avatarUrl={avatarUrl} onOpen={onOpenComposer} />
        )}

        {isLoading && (
          <div className="flex flex-col gap-3.5" aria-live="polite" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-card bg-soft-surface p-4 shadow-card">
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-soft-sunken" />
                  <div className="h-3 w-28 animate-pulse rounded-pill bg-soft-sunken" />
                </div>
                <div className="mb-2 h-3 w-full animate-pulse rounded-pill bg-soft-sunken" />
                <div className="h-3 w-2/3 animate-pulse rounded-pill bg-soft-sunken" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && visiblePosts.length === 0 && (
          <div className="rounded-card bg-soft-surface p-8 text-center shadow-card">
            <p className="mb-1 font-soft-display text-[15px] font-bold text-soft-ink">
              Nothing here yet
            </p>
            <p className="font-soft text-[13px] text-soft-ink-soft">
              {networkFilter
                ? 'No posts on this network. Tap it again to see all of them.'
                : 'Be the first to post.'}
            </p>
          </div>
        )}

        {!isLoading &&
          visiblePosts.map((post) => (
            <SoftPostCard
              key={post.id}
              authorName={post.authorName || shortAddress(post.author)}
              network={post.network}
              timeAgo={formatTime(post.timestamp)}
              content={post.content}
              imageUrl={post.image}
              likes={typeof post.likes === 'number' ? post.likes : 0}
              comments={Array.isArray(post.comments) ? post.comments.length : 0}
              isPinned={post.isPinned}
              isLiked={
                !!currentAddress && Array.isArray(post.likedBy) && post.likedBy.includes(currentAddress)
              }
              onLike={onLike ? () => onLike(post.id) : undefined}
              onComment={onOpenPost ? () => onOpenPost(post.id) : undefined}
              onTip={onTip ? () => onTip(post.id) : undefined}
              onOpenAuthor={onOpenAuthor ? () => onOpenAuthor(post.author) : undefined}
            />
          ))}
      </div>
    </div>
  );
}
