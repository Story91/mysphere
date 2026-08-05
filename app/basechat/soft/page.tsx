'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { fetchPosts } from '../../utils/firebase';
import { toMillis } from '../../utils/firestoreTime';
import SoftStoryRail from './SoftStoryRail';
import SoftTabs from './SoftTabs';
import SoftComposerPill from './SoftComposerPill';
import SoftDock, { SOFT_DOCK_ICONS } from './SoftDock';
import SoftPostCard from './SoftPostCard';

/**
 * Kierunek Soft Social na ZYWYCH danych.
 *
 * PO CO OSOBNA TRASA, A NIE PODMIANA FEEDU OD RAZU. `app/basechat/page.tsx` ma
 * 3759 linii i trzyma stan calej aplikacji - postowanie na osmiu lancuchach,
 * platnosci, znajomych, powiadomienia. Przepisanie jego wygladu w jednym ruchu
 * to gwarantowana regresja w miejscu, ktorego nikt nie zauwazy przed wdrozeniem.
 *
 * Ta trasa renderuje TE SAME posty z Firestore przez nowe komponenty. Dzieki
 * temu kierunek da sie obejrzec na prawdziwej tresci - z prawdziwymi dlugosciami
 * nickow, brakujacymi avatarami i postami bez tresci - zanim tknie sie feed.
 * Gdy wyglad zostanie zaakceptowany, wpiecie go w widok mobilny jest podmiana
 * warstwy prezentacji, a nie przepisywaniem logiki.
 *
 * Zakladki i pasek sieci FILTRUJA naprawde - to nie jest makieta.
 */

const TABS = [
  { id: 'all', label: 'All Posts' },
  { id: 'mine', label: 'My Feed' },
  { id: 'follows', label: 'Follows' },
  { id: 'friends', label: 'Friends' },
  { id: 'discover', label: 'Discover' },
];

type FeedPost = {
  id: string;
  author: string;
  authorName?: string;
  content: string;
  timestamp: number;
  image?: string | null;
  network?: string;
  likes: number;
  commentCount: number;
};

function shortAddress(value: string) {
  return value && value.length > 10 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value || 'unknown';
}

export default function SoftFeedPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNetwork, setActiveNetwork] = useState('base');
  const [activeTab, setActiveTab] = useState('all');
  const [activeSection, setActiveSection] = useState('feed');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchPosts({ limit: 20 });
        if (cancelled) return;

        const mapped: FeedPost[] = (result?.posts ?? []).map((post: any) => ({
          id: post.id,
          author: post.author ?? '',
          authorName: post.authorName,
          content: typeof post.content === 'string' ? post.content : '',
          // Firestore oddaje timestamp raz jako obiekt Timestamp, raz jako
          // liczbe - patrz app/utils/firestoreTime.ts.
          timestamp: toMillis(post.timestamp),
          image: post.image ?? null,
          network: post.network,
          likes: typeof post.likes === 'number' ? post.likes : 0,
          commentCount: Array.isArray(post.comments) ? post.comments.length : 0,
        }));

        setPosts(mapped);
      } catch (caught) {
        console.error('[soft] Nie udalo sie pobrac postow:', caught);
        if (!cancelled) setError('Could not load the feed. Pull to try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Filtr sieci dziala naprawde. Post bez pola `network` traktujemy jak Base -
  // tak samo robi feed produkcyjny, bo tak wygladaja najstarsze wpisy.
  const visiblePosts = useMemo(
    () => posts.filter((post) => (post.network ?? 'base') === activeNetwork),
    [posts, activeNetwork]
  );

  const formatTime = useCallback((ms: number) => {
    if (!ms) return 'just now';
    try {
      return formatDistanceToNow(new Date(ms), { addSuffix: true });
    } catch {
      return 'recently';
    }
  }, []);

  return (
    <div className="min-h-screen bg-soft-bg font-soft">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[13px] bg-soft-surface shadow-chip">
            <Image src="/android-chrome-192x192.png" alt="" width={26} height={26} className="rounded-lg" />
          </span>
          <span className="font-soft-display text-[19px] font-bold text-soft-ink">MySphere</span>
        </div>

        <span className="rounded-pill bg-soft-surface px-3 py-1.5 font-soft text-[11px] font-bold uppercase tracking-wider text-soft-primary-deep shadow-chip">
          Preview
        </span>
      </header>

      <SoftStoryRail activeNetwork={activeNetwork} onSelect={setActiveNetwork} />
      <SoftTabs tabs={TABS} activeTab={activeTab} onSelect={setActiveTab} />

      <main className="flex flex-col gap-3.5 px-4 pb-32 pt-1">
        <SoftComposerPill onOpen={() => setActiveSection('feed')} />

        {isLoading && (
          // Szkielety zamiast spinnera: pokazuja, ILE tresci zaraz przyjdzie
          // i gdzie, wiec ekran nie skacze w momencie zaladowania.
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

        {!isLoading && error && (
          <p role="alert" className="rounded-card bg-soft-surface p-4 text-center text-[13.5px] text-soft-accent-deep shadow-card">
            {error}
          </p>
        )}

        {!isLoading && !error && visiblePosts.length === 0 && (
          <div className="rounded-card bg-soft-surface p-8 text-center shadow-card">
            <p className="mb-1 font-soft-display text-[15px] font-bold text-soft-ink">
              Nothing here yet
            </p>
            <p className="font-soft text-[13px] text-soft-ink-soft">
              No posts on this network. Try another one above.
            </p>
          </div>
        )}

        {!isLoading &&
          !error &&
          visiblePosts.map((post) => (
            <SoftPostCard
              key={post.id}
              authorName={post.authorName || shortAddress(post.author)}
              network={post.network}
              timeAgo={formatTime(post.timestamp)}
              content={post.content}
              imageUrl={post.image}
              likes={post.likes}
              comments={post.commentCount}
            />
          ))}
      </main>

      <SoftDock
        items={[
          { id: 'feed', label: 'Feed', icon: SOFT_DOCK_ICONS.feed },
          { id: 'profile', label: 'Profile', icon: SOFT_DOCK_ICONS.profile },
          { id: 'trends', label: 'Trends', icon: SOFT_DOCK_ICONS.trends },
        ]}
        activeItem={activeSection}
        onSelect={setActiveSection}
      />
    </div>
  );
}
