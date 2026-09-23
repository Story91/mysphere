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
import PanelSkeleton from '../../components/PanelSkeleton';

// Oba z tym samym szkieletem: bez niego pierwszy chunk (portfel) nie rysowal
// nic i karta skakala dwa razy.
const BlinkWalletShell = dynamic(() => import('../../components/BlinkWalletShell'), {
  ssr: false,
  loading: () => <PanelSkeleton composer={false} />,
});
const TipPanel = dynamic(() => import('./TipPanel'), {
  ssr: false,
  loading: () => <PanelSkeleton composer={false} />,
});

export default function BlinkTipClient({ postId, author }: { postId: string; author: string }) {
  return (
    <BlinkWalletShell>
      <TipPanel postId={postId} author={author} />
    </BlinkWalletShell>
  );
}
