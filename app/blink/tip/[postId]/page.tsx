import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostForShare, shortAddress } from '../../../utils/posts/getPostForShare';
import { SOLANA_NETWORK_LABEL, solanaExplorerTxUrl } from '../../../basechat/Solana/config/solanaChain';
import BlinkFrame from '../../components/BlinkFrame';
import PostCard from '../../components/PostCard';
import BlinkTipClient from './BlinkTipClient';

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
 * post, mowi, ze napiwek idzie na portfel, ktory podpisal post (samego
 * adresu nie drukuje - pokazuje go karta akcji, GET /api/actions/tip), i SAMA
 * wykonuje akcje portfelem Solany (TipPanel).
 *
 * Do 23.09.2026 wykonanie oddawalismy interstycjalowi dial.to (Dialect).
 * Wlasciciel kliknal i trafil na Vercelowe "DEPLOYMENT_PAUSED" pod adresem
 * dial.to - zewnetrzny serwis padl, a nasz przycisk byl do niego przywiazany.
 * Strona, ktora ma dzialac zawsze, nie moze zalezec od cudzego deploymentu.
 */

export const runtime = 'nodejs';
export const revalidate = 300;

type Props = { params: { postId: string } };

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://mysphere.fun';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPostForShare(params.postId).catch(() => null);
  if (!post) return { title: 'Post not found' };

  const author = post.authorName || shortAddress(post.author);
  const title = `Tip ${author} on Solana`;
  // Opis mowi, co robi strona - tresc posta niesie juz obrazek karty.
  const description = 'Tip the author in SOL. It goes to the Solana wallet that signed this post.';
  const image = `${SITE}/post/${post.id}/opengraph-image`;
  return {
    title,
    description,
    // Ten sam post zyje pod trzema adresami (/post, /blink/tip, /blink/reply).
    // Kanoniczny jest /post - tak jak /tip i /u wskazuja same siebie.
    alternates: { canonical: `https://mysphere.fun/post/${post.id}` },
    openGraph: { title, description, type: 'article', images: [image] },
    // Bez wlasnego `twitter` X dziedziczyl tytul i opis strony glownej
    // z app/layout.tsx - link wklejony na X opisywal serwis, nie napiwek.
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function BlinkTipPage({ params }: Props) {
  const post = await getPostForShare(params.postId).catch(() => null);
  if (!post) notFound();

  const author = post.authorName || shortAddress(post.author);
  const isSolanaPost = post.network === 'solana' && !!post.txHash;

  return (
    <BlinkFrame title="Tip">
      <div className="p-4 sm:p-5">
        <PostCard
          authorName={post.authorName}
          authorAddress={post.author}
          content={post.content}
          timestamp={post.timestamp}
          networkLabel={isSolanaPost ? SOLANA_NETWORK_LABEL : undefined}
          receiptUrl={isSolanaPost && post.txHash ? solanaExplorerTxUrl(post.txHash) : undefined}
        />
      </div>

      <div className="border-t border-soft-line p-4 sm:p-5">
        {isSolanaPost ? (
          <BlinkTipClient postId={post.id} author={author} />
        ) : (
          <div className="text-sm leading-relaxed text-soft-ink-muted">
            <p>
              This post was not published on Solana, so there is no Solana wallet to tip. Open it in the
              feed to tip the author on the network they used.
            </p>
            <Link
              href={`/post/${post.id}`}
              className="mt-3 inline-flex min-h-[44px] items-center font-semibold text-soft-primary-deep underline-offset-2 hover:underline"
            >
              Open the post on MySphere
            </Link>
          </div>
        )}
      </div>
    </BlinkFrame>
  );
}
