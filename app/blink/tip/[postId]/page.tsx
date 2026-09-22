import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostForShare, shortAddress } from '../../../utils/posts/getPostForShare';
import { SOLANA_NETWORK_LABEL } from '../../../basechat/Solana/config/solanaChain';

/**
 * Adres, ktory udostepnia sie jako Blink.
 *
 * ===========================================================================
 * PO CO STRONA, SKORO TO MA BYC AKCJA
 * ===========================================================================
 * Bo Blink rysuje sie u MNIEJSZOSCI. Sprawdzone w dokumentacji Solany
 * i Phantoma (22.09.2026): karta pojawia sie tylko u osob z zainstalowanym
 * rozszerzeniem (Phantom, Backpack, Dialect), ktore dodatkowo WLACZYLY Blinki
 * w ustawieniach eksperymentalnych, i tylko dla adresow zarejestrowanych
 * w Dialect Actions Registry.
 *
 * Wszyscy pozostali - czyli wieksza czesc ludzi, ktorzy zobacza ten link -
 * po prostu w niego klikna i wyladuja tutaj. Gdyby pod tym adresem nie bylo
 * nic, udostepnianie Blinkow byloby publikowaniem martwych linkow dla
 * wiekszosci odbiorcow.
 *
 * Ta strona jest wiec wariantem awaryjnym, ktory ma dzialac zawsze: pokazuje
 * post, mowi wprost, na ktory adres idzie napiwek, i daje przejscie do
 * interstycjala dial.to, ktory wykona akcje bez zadnego rozszerzenia.
 */

export const runtime = 'nodejs';
export const revalidate = 300;

type Props = { params: { postId: string } };

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://mysphere.fun';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPostForShare(params.postId).catch(() => null);
  if (!post) return { title: 'Post not found' };

  const author = post.authorName || shortAddress(post.author);
  return {
    title: `Tip ${author} on Solana`,
    description: post.content.slice(0, 160),
    openGraph: {
      images: [`${SITE}/post/${post.id}/opengraph-image`],
    },
  };
}

export default async function BlinkTipPage({ params }: Props) {
  const post = await getPostForShare(params.postId).catch(() => null);
  if (!post) notFound();

  const author = post.authorName || shortAddress(post.author);
  const actionUrl = `${SITE}/api/actions/tip/${post.id}`;
  // dial.to wykonuje akcje bez rozszerzenia - to jest sciezka dla wszystkich.
  const dialTo = `https://dial.to/?action=solana-action:${encodeURIComponent(actionUrl)}`;
  const isSolanaPost = post.network === 'solana' && !!post.txHash;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col justify-center gap-5 px-4 py-12">
      <div className="rounded-card border border-soft-line bg-soft-surface p-5">
        <p className="text-sm text-soft-ink-muted">{author} on MySphere</p>
        <p className="mt-2 whitespace-pre-wrap text-soft-ink">{post.content}</p>
      </div>

      {isSolanaPost ? (
        <>
          <a
            href={dialTo}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-pill bg-gradient-to-r from-[#9945FF] to-[#14F195] px-5 py-3 text-center font-semibold text-white transition-opacity hover:opacity-90"
          >
            Tip in SOL
          </a>
          <p className="text-center text-sm text-soft-ink-muted">
            The tip goes to the wallet that signed this post on {SOLANA_NETWORK_LABEL}. If you have
            Blinks turned on in Phantom or Backpack, this link also opens as a card directly in your
            feed.
          </p>
        </>
      ) : (
        <p className="text-center text-sm text-soft-ink-muted">
          This post was not published on Solana, so there is no Solana wallet to tip. Open it in the
          feed to tip the author on the network they used.
        </p>
      )}

      <Link href={`/post/${post.id}`} className="text-center text-sm underline text-soft-ink-muted">
        Open the post in MySphere
      </Link>
    </main>
  );
}
