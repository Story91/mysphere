'use client';

/** Wyspa kliencka strony odpowiedzi - ten sam uklad co BlinkTipClient. */

import dynamic from 'next/dynamic';

const SolanaWalletProvider = dynamic(
  () => import('../../../basechat/Solana/components/SolanaWalletProvider'),
  { ssr: false }
);
const ReplyPanel = dynamic(() => import('./ReplyPanel'), {
  ssr: false,
  loading: () => <p className="text-center text-sm text-soft-ink-muted">Loading Solana wallet…</p>,
});

export default function BlinkReplyClient({ postId }: { postId: string }) {
  return (
    <SolanaWalletProvider>
      <ReplyPanel postId={postId} />
    </SolanaWalletProvider>
  );
}
