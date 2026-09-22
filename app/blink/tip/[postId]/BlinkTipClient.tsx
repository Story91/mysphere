'use client';

/**
 * Wyspa kliencka strony napiwku: portfel Solany + panel.
 *
 * Oba importy dynamiczne z `ssr: false`, z tego samego powodu co w
 * CreatePostSolana: wallet-adapter siega po `window` przy renderze
 * serwerowym, a stos Solany ma sie ladowac dopiero u kogos, kto na te strone
 * faktycznie wszedl.
 */

import dynamic from 'next/dynamic';

const SolanaWalletProvider = dynamic(
  () => import('../../../basechat/Solana/components/SolanaWalletProvider'),
  { ssr: false }
);
const TipPanel = dynamic(() => import('./TipPanel'), {
  ssr: false,
  loading: () => <p className="text-center text-sm text-soft-ink-muted">Loading Solana wallet…</p>,
});

export default function BlinkTipClient({ postId }: { postId: string }) {
  return (
    <SolanaWalletProvider>
      <TipPanel postId={postId} />
    </SolanaWalletProvider>
  );
}
