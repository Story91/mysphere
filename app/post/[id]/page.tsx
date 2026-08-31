import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getPostForShare, getPostTipTotals, shortAddress } from '../../utils/posts/getPostForShare';
import SharePostActions from './SharePostActions';

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

// Strona jest odswiezana co 5 minut zamiast renderowac sie na kazde wejscie.
// Linki rozchodza sie falami (jedno wklejenie = wiele wejsc w krotkim oknie),
// wiec ISR tnie odczyty Firestore do jednego na okno, a lajki i tipy na
// wklejonym linku i tak nie musza byc co do sekundy.
export const revalidate = 300;

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPostForShare(params.id);

  if (!post) {
    // Marke dokłada `title.template` z layoutu glownego.
    return { title: 'Post not found' };
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
  // Tresc i sumy tipow rownolegle - to dwa niezalezne odczyty, a strona czeka
  // na oba, wiec sekwencyjnie kosztowalyby dwa razy tyle czasu.
  const [post, tipTotals] = await Promise.all([
    getPostForShare(params.id),
    getPostTipTotals(params.id),
  ]);
  if (!post) notFound();

  const author = post.authorName || shortAddress(post.author);
  const posted = post.timestamp
    ? new Date(post.timestamp).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const tipLine = Object.entries(tipTotals)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([token, amount]) =>
      `${amount >= 1 ? amount.toFixed(2).replace(/\.00$/, '') : amount.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} ${token}`
    )
    .join(' + ');

  return (
    <main className="min-h-screen bg-soft-bg px-4 py-10 font-soft sm:px-6">
      <div className="mx-auto max-w-[600px]">
        {/* Pasek marki. Ta strona jest najczesciej PIERWSZYM, co ktos widzi
            z MySphere - przychodzi z wklejonego linku, nie z aplikacji. Musi
            wiec od razu powiedziec, gdzie jest, zanim przeczyta post. */}
        <Link
          href="/basechat"
          className="mb-6 inline-flex items-center gap-2.5 rounded-pill bg-soft-surface px-3 py-2 shadow-card transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
        >
          <Image src="/android-chrome-192x192.png" alt="" width={22} height={22} className="rounded-md" />
          <span className="font-soft-display text-[13.5px] font-bold text-soft-ink">MySphere</span>
        </Link>

        <article className="rounded-card bg-soft-surface p-5 shadow-card sm:p-6">
          <header className="mb-4 flex items-center justify-between gap-4">
            <Link
              href={`/u/${post.author}`}
              className="font-soft-display text-[15px] font-bold text-soft-ink hover:text-soft-primary-deep"
            >
              {author}
            </Link>
            {posted && (
              <span className="font-soft text-[12px] tabular-nums text-soft-ink-faint">{posted}</span>
            )}
          </header>

          <p className="whitespace-pre-wrap break-words font-soft text-[16.5px] leading-[1.6] text-soft-ink-muted">
            {post.content}
          </p>

          {post.image && (
            <div className="relative mt-5 aspect-[16/10] w-full overflow-hidden rounded-[18px] bg-soft-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.image} alt="" className="absolute inset-0 h-full w-full object-contain" />
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-soft-line pt-4 font-soft text-[13px] tabular-nums text-soft-ink-soft">
            <span>{post.likes} likes</span>
            <span>{post.commentCount} comments</span>
            {post.network && <span className="capitalize">on {post.network}</span>}

            {/* Kwota stoi na koncu i jest jedynym mocnym kolorem - to jedyna
                liczba na tej stronie, ktorej nie da sie nabic. */}
            {tipLine && (
              <span className="ml-auto rounded-pill bg-soft-accent-soft px-3 py-1 font-soft-display font-bold text-soft-accent-deep">
                {tipLine} in tips
              </span>
            )}
          </div>
        </article>

        <SharePostActions postId={post.id} authorName={author} />

        <p className="mt-8 text-center font-soft text-[12.5px] leading-relaxed text-soft-ink-faint">
          MySphere is a feed where money moves between people, not just posts.{' '}
          {/* Paid zyje jako zakladka na /money - link celuje wprost w nia,
              zeby nie placic przekierowania ze starego /leaderboard. */}
          <Link href="/money?tab=paid" className="font-semibold text-soft-primary-deep underline underline-offset-2">
            See what has been paid
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
