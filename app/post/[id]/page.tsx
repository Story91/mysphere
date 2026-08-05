import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostForShare, shortAddress } from '../../utils/posts/getPostForShare';

/**
 * Udostepnialna trasa pojedynczego posta.
 *
 * Po co: do tej pory posty nie mialy wlasnych URL-i - caly feed to jedna strona,
 * wiec nie bylo czego wkleic ani co podejrzec. Ta trasa daje kazdemu postowi
 * adres z pelnymi metadanymi i wlasna karta OG (opengraph-image.tsx obok).
 *
 * Komponent SERWEROWY: metadane i obrazek powstaja przed wyslaniem odpowiedzi,
 * wiec crawlery i podglady linkow widza tresc od razu. Przy klienckim root
 * layoucie, ktory byl tu wczesniej, bylo to niemozliwe.
 */

export const runtime = 'nodejs';

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPostForShare(params.id);

  if (!post) {
    return { title: 'Post not found — MySphere' };
  }

  const author = post.authorName || shortAddress(post.author);
  const excerpt = post.content.length > 160 ? `${post.content.slice(0, 160)}…` : post.content;
  const title = `${author} on MySphere`;

  // Embed miniappki wskazujacy na TEN post, nie na strone glowna - dzieki temu
  // udostepniony link otwiera konkretna tresc.
  const embed = JSON.stringify({
    version: '1',
    imageUrl: `https://mysphere.fun/post/${post.id}/opengraph-image`,
    button: {
      title: 'Open in MySphere',
      action: {
        type: 'launch_miniapp',
        name: 'MySphere',
        url: `https://mysphere.fun/post/${post.id}`,
        splashImageUrl: 'https://mysphere.fun/SPLASH.gif',
        splashBackgroundColor: '#FFFFFF',
      },
    },
  });

  return {
    title,
    description: excerpt || 'A post on MySphere.',
    openGraph: { title, description: excerpt, type: 'article' },
    twitter: { card: 'summary_large_image', title, description: excerpt },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

export default async function PostPage({ params }: Props) {
  const post = await getPostForShare(params.id);
  if (!post) notFound();

  const author = post.authorName || shortAddress(post.author);
  const posted = post.timestamp
    ? new Date(post.timestamp).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <main className="min-h-screen bg-[#0A1024] px-5 py-16 sm:px-8">
      <article className="mx-auto max-w-[640px]">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <span className="font-['Coinbase_Display'] text-[15px] font-semibold text-[#EEF3FF]">
            {author}
          </span>
          {posted && <span className="text-[12px] tabular-nums text-[#5C6F94]">{posted}</span>}
        </header>

        <p className="whitespace-pre-wrap text-[17px] leading-relaxed text-[#C7D4EE]">
          {post.content}
        </p>

        {post.image && (
          // images.unoptimized jest wlaczone, wiec Next nie doda wymiarow za nas.
          // Kontener z aspect-ratio rezerwuje miejsce i nie przesuwa tresci.
          <div className="relative mt-6 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#101A33]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        )}

        <div className="mt-8 flex items-center gap-6 border-t border-white/[0.07] pt-5 text-[13px] tabular-nums text-[#93A5C9]">
          <span>{post.likes} likes</span>
          <span>{post.commentCount} comments</span>
          {post.network && <span className="text-[#5C6F94]">on {post.network}</span>}
        </div>

        <div className="mt-10">
          <Link
            href="/basechat"
            className="inline-block rounded-xl bg-[#0052FF] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#0052FF]/90"
          >
            Open MySphere
          </Link>
        </div>
      </article>
    </main>
  );
}
