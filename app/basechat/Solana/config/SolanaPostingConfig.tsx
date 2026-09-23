'use client';

/** Wszystko, czym Solana rozni sie od pozostalych lancuchow w formularzu postu. */

import type { ComposerOnlyConfig } from '../../chainPosting/ChainCreatePost';
import type { ChainPostReceipt, ComposerPostFields } from '../../chainPosting/types';
import { IS_SOLANA_MAINNET, SOLANA_NETWORK_LABEL } from './solanaChain';

/**
 * POST /api/solana/post. Serwer sam ponawia odczyt transakcji przez kilka
 * sekund; 202 znaczy, ze RPC dalej jej nie widzi - wtedy probujemy jeszcze
 * dwa razy, zanim poddamy sie z czytelnym komunikatem.
 */
async function saveSolanaPost(fields: ComposerPostFields, receipt: ChainPostReceipt | undefined): Promise<string> {
  if (!receipt) throw new Error('Missing post ID from the Solana transaction.');
  const body = JSON.stringify({
    postId: receipt.postId,
    signature: fields.txHash,
    content: fields.content,
    author: fields.author,
    image: fields.image,
    video: fields.video,
    musicTrack: fields.musicTrack ?? null,
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
    const response = await fetch('/api/solana/post', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; postId?: string; error?: string };
    if (response.ok && data.ok && data.postId) return data.postId;
    if (response.status !== 202) throw new Error(data.error || `Saving failed (${response.status}).`);
  }
  throw new Error(`Solana has not confirmed the transaction to our server yet. Transaction: ${fields.txHash}`);
}

/**
 * Brak pol `chainId`, `chain`, `abi` i `getContractAddress` jest celowy - patrz
 * `ComposerOnlyConfig`. Solana nie ma zadnego z tych pojec, a przycisk
 * transakcji dostaje ten formularz osobno (`PostButton`).
 */
export const SOLANA_POSTING: ComposerOnlyConfig = {
  composer: {
    // eslint-disable-next-line @next/next/no-img-element
    background: <img src="/solana.svg" alt="" className="w-16 h-16" />,
    focusRing: 'focus:ring-[#9945FF]',
    progressBar: 'bg-gradient-to-r from-[#9945FF] to-[#14F195]',
    placeholder: "What's happening on Solana? Drop your current Spotify vibe and share what's on your mind!",
    network: 'solana',
    mediaFilePrefix: 'solana-post-media',
    savingLabel: 'Solana',
    // Post z Solany zapisuje serwer, razem z wpisem w rejestrze kwitow - od
    // `txHash` zaleza napiwki i platne odpowiedzi, a kolekcje `posts` zapisuje
    // dzis kazda przegladarka. Szczegoly: app/utils/solana/receiptRegistry.ts.
    savePost: saveSolanaPost,
    // Baner tylko na devnecie: uzytkownik ma wiedziec, ze podpis, ktory za
    // chwile zobaczy w eksploratorze, nie stoi na sieci glownej. Na mainnecie
    // pole znika samo, bez zmiany kodu.
    notice: IS_SOLANA_MAINNET ? undefined : (
      <div
        role="status"
        className="mb-4 rounded-lg border border-[#9945FF]/30 bg-[#9945FF]/5 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 relative z-10"
      >
        <span className="font-medium">Posting on {SOLANA_NETWORK_LABEL}.</span>{' '}
        <span className="opacity-80">
          The post itself is saved normally - only the on-chain receipt goes to the test cluster. Devnet SOL
          is free from a faucet.
        </span>
      </div>
    ),
  },
};
