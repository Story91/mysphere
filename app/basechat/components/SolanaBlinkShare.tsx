'use client';

/**
 * "Reply with SOL from X" pod postem z Solany.
 *
 * PO CO: platne odpowiedzi i napiwki w SOL dzialaja z linku
 * (/blink/reply/<id>, /blink/tip/<id>), ale do 23.09.2026 zadne miejsce w
 * aplikacji tego linku nie pokazywalo - funkcja istniala tylko dla kogos, kto
 * znal adres na pamiec. Ten wiersz daje go wprost: jedno klikniecie otwiera
 * okno posta na X z gotowym linkiem, drugie kopiuje link.
 *
 * Tylko na mainnecie: na devnecie trasy akcji odpowiadaja 503 na produkcji
 * (misconfiguredCluster), a link do martwej karty to gorzej niz brak linku.
 * Nie importuje web3.js - lezy w glownym bundle feedu.
 */

import { useState } from 'react';
import { IS_SOLANA_MAINNET } from '../Solana/config/solanaChain';

function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return typeof window === 'undefined' ? 'https://mysphere.fun' : window.location.origin;
}

export default function SolanaBlinkShare({ postId }: { postId: string }) {
  const [copied, setCopied] = useState(false);
  if (!IS_SOLANA_MAINNET) return null;

  const replyUrl = `${siteOrigin()}/blink/reply/${encodeURIComponent(postId)}`;
  const tweetText = 'Reply to this post with SOL - the reply and the tip go out in one Solana transaction.';
  const intentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(replyUrl)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(replyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Schowek bywa zablokowany (iframe, brak uprawnien) - wtedy zostaje
      // link do X, ktory niesie ten sam adres.
      window.prompt('Copy this link', replyUrl);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-soft text-[12px] text-soft-ink-muted">
      <span>
        <span className="font-semibold text-soft-ink">Paid replies on.</span> Anyone can reply from X and tip in SOL
        (0.001 min).
      </span>
      <a
        href={intentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-soft-primary-deep underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary rounded"
      >
        Share on X
      </a>
      <button
        type="button"
        onClick={copy}
        className="font-semibold text-soft-primary-deep underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary rounded"
        aria-live="polite"
      >
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
}
