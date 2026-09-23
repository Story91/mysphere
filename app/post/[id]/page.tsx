import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getPostCommentsForShare, getPostForShare, getPostTipTotals, shortAddress } from '../../utils/posts/getPostForShare';
import { SOLANA_EXPLORER_SUFFIX } from '../../basechat/Solana/config/solanaChain';
import { blinksDisabled } from '../../api/actions/actionHeaders';
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
  const [post, tipTotals, comments] = await Promise.all([
    getPostForShare(params.id),
    getPostTipTotals(params.id),
    getPostCommentsForShare(params.id),
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

        {comments.length > 0 && (
          <section aria-label="Replies" className="mt-4 rounded-card bg-soft-surface p-5 shadow-card sm:p-6">
            <h2 className="mb-3 font-soft-display text-[14px] font-bold text-soft-ink">Replies</h2>
            <ul className="flex flex-col gap-4">
              {comments.map(comment => {
                const isSolana = !comment.author.startsWith('0x');
                const name = comment.authorName || (isSolana
                  ? `${comment.author.slice(0, 4)}…${comment.author.slice(-4)}`
                  : shortAddress(comment.author));
                const tipSol = comment.tipLamports ? Number(comment.tipLamports) / 1e9 : null;
                return (
                  <li key={comment.id} className="border-t border-soft-line pt-3 first:border-t-0 first:pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-soft-display text-[13.5px] font-bold text-soft-ink">{name}</span>
                      {tipSol !== null && comment.txHash && (
                        <a
                          href={`https://explorer.solana.com/tx/${comment.txHash}${SOLANA_EXPLORER_SUFFIX}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-pill border border-[#9945FF]/30 bg-[#9945FF]/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-[#6d28d9]"
                        >
                          paid reply · {tipSol} SOL
                        </a>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[14.5px] leading-[1.55] text-soft-ink-muted">
                      {comment.content}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Bez linku, gdy Blinki sa na tym deploymencie wylaczone (prod na
            devnecie): obie trasy odpowiedzialyby wtedy 503, a czlowiek
            szykowalby odpowiedz, ktorej nie da sie oplacic. */}
        {post.network === 'solana' && !blinksDisabled() && (
          <p className="mt-4 text-center font-soft text-[13px] text-soft-ink-soft">
            This post was written on Solana.{' '}
            <Link href={`/blink/reply/${post.id}`} className="font-semibold text-soft-primary-deep underline underline-offset-2">
              Reply and tip the author
            </Link>{' '}
            or{' '}
            <Link href={`/blink/tip/${post.id}`} className="font-semibold text-soft-primary-deep underline underline-offset-2">
              just tip
            </Link>
            .
          </p>
        )}

        <SharePostActions postId={post.id} authorName={author} />

        <p className="mt-8 text-center font-soft text-[12.5px] leading-relaxed text-soft-ink-faint">
          MySphere is a feed where money moves between people, not just posts.{' '}
          {/* Paid zyje jako zakladka na /money - link celuje wprost w nia,
              zeby nie placic przekierowania ze starego /leaderboard. */}
          <Link href="/asks?tab=paid" className="font-semibold text-soft-primary-deep underline underline-offset-2">
            See what has been paid
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
