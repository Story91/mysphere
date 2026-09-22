'use client';

/** Wszystko, czym Solana rozni sie od pozostalych lancuchow w formularzu postu. */

import type { ComposerOnlyConfig } from '../../chainPosting/ChainCreatePost';
import { IS_SOLANA_MAINNET, SOLANA_NETWORK_LABEL } from './solanaChain';

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
