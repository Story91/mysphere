'use client';

/**
 * Wyspa kliencka strony odpowiedzi - ten sam uklad co BlinkTipClient.
 * Portfel (BlinkWalletShell) i panel laduja sie dynamicznie, `ssr: false`:
 * stos Solany ma trafic tylko do kogos, kto na te strone faktycznie wszedl.
 */

import dynamic from 'next/dynamic';
import PanelSkeleton from '../../components/PanelSkeleton';

// Oba z tym samym szkieletem: bez niego pierwszy chunk (portfel) nie rysowal
// nic i karta skakala dwa razy.
const BlinkWalletShell = dynamic(() => import('../../components/BlinkWalletShell'), {
  ssr: false,
  loading: () => <PanelSkeleton />,
});
const ReplyPanel = dynamic(() => import('./ReplyPanel'), {
  ssr: false,
  loading: () => <PanelSkeleton />,
});

export default function BlinkReplyClient({ postId, author }: { postId: string; author: string }) {
  return (
    <BlinkWalletShell>
      <ReplyPanel postId={postId} author={author} />
    </BlinkWalletShell>
  );
}
