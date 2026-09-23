import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostForShare, shortAddress } from '../../../utils/posts/getPostForShare';
import { REPLY_MIN_LAMPORTS } from '../../../basechat/Solana/replies/replyCore';
import BlinkReplyClient from './BlinkReplyClient';

/**
 * Adres, ktory udostepnia sie na X jako Blink "Reply".
 *
 * U osob z Blinkami wlaczonymi w Phantomie albo Backpacku karta rozwija sie
 * w X (po wpisie MySphere do Dialect Actions Registry). Wszyscy pozostali
 * klikaja link i laduja tutaj - ta strona wykonuje te sama akcje wlasnym
 * portfelem, bez dial.to (patrz naglowek app/blink/tip/[postId]/page.tsx).
 *
 * `?signature=<podpis>[&account=<portfel>]` to link odzyskania z karty
 * "Retry saving": panel sam dokancza zapis oplaconej odpowiedzi. Parametry
 * czyta ReplyPanel w przegladarce, a nie ta strona - `searchParams` tutaj
 * zrobilby ja dynamiczna i wylaczyl ISR dla wszystkich wejsc.
 */

export const runtime = 'nodejs';
export const revalidate = 300;

type Props = { params: { postId: string } };

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://mysphere.fun';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPostForShare(params.postId).catch(() => null);
  if (!post) return { title: 'Post not found' };
  const author = post.authorName || shortAddress(post.author);
  const title = `Reply to ${author}`;
  // Opis mowi, co robi strona - tresc posta niesie juz obrazek karty.
  const description = `Reply and tip the author in one Solana transaction, ${Number(REPLY_MIN_LAMPORTS) / 1e9} SOL at least.`;
  const image = `${SITE}/post/${post.id}/opengraph-image`;
  return {
    title,
    description,
    // Kanoniczny jest /post - ten sam post zyje tez pod /blink/tip i tutaj.
    alternates: { canonical: `https://mysphere.fun/post/${post.id}` },
    openGraph: { title: `${title} on MySphere`, description, type: 'article', images: [image] },
    // Bez wlasnego `twitter` X dziedziczyl tytul i opis strony glownej
    // z app/layout.tsx - link wklejony na X opisywal serwis, nie odpowiedz.
    twitter: { card: 'summary_large_image', title: `${title} on MySphere`, description, images: [image] },
  };
}

export default async function BlinkReplyPage({ params }: Props) {
  const post = await getPostForShare(params.postId).catch(() => null);
  if (!post) notFound();

  const author = post.authorName || shortAddress(post.author);
  const isSolanaPost = post.network === 'solana' && !!post.txHash;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col justify-center gap-5 px-4 py-12">
      <div className="rounded-card border border-soft-line bg-soft-surface p-5">
        <p className="text-sm text-soft-ink-muted">{author} on MySphere</p>
        <p className="mt-2 whitespace-pre-wrap text-soft-ink">{post.content}</p>
      </div>

      {isSolanaPost ? (
        <BlinkReplyClient postId={post.id} />
      ) : (
        <p className="text-center text-sm text-soft-ink-muted">
          Paid replies work under posts published on Solana - that is where we know the author&apos;s
          wallet. Open the post in the feed to comment there.
        </p>
      )}

      <Link href={`/post/${post.id}`} className="text-center text-sm underline text-soft-ink-muted">
        Open the post in MySphere
      </Link>
    </main>
  );
}
