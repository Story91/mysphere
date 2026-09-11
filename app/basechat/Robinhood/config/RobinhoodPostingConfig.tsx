'use client';

/** Wszystko, czym Robinhood Chain rozni sie od pozostalych lancuchow w sciezce postowania. */

import type { Abi } from 'viem';
import type { ChainWithComposer } from '../../chainPosting/ChainCreatePost';
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_CONFIG, robinhoodChain } from './RobinhoodNetworkConfig';
import {
  ROBINHOOD_POST_CONTRACT_ABI,
  getRobinhoodContractAddress,
  isRobinhoodPostContractDeployed,
} from '../contracts/RobinhoodPostContract';

// Komunikat na wypadek pustego adresu kontraktu (np. po redeployu bez env).
export const ROBINHOOD_POSTING_DISABLED_MESSAGE = 'Posting on Robinhood Chain is not live yet';

function RobinhoodLogo({ className }: { className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/robin.webp" alt="Robinhood Chain" className={className} />;
}

export const ROBINHOOD_POSTING: ChainWithComposer = {
  chainId: ROBINHOOD_CHAIN_ID,
  chain: robinhoodChain,
  abi: ROBINHOOD_POST_CONTRACT_ABI as unknown as Abi,
  getContractAddress: getRobinhoodContractAddress,

  networkLabel: 'Robinhood Chain',
  shortName: 'Robinhood Chain',

  txHashStorageKey: 'lastRobinhoodTxHash',
  explorerTxUrl: `${ROBINHOOD_CONFIG.explorerUrl}/tx/`,
  explorerButtonLabel: 'View on Blockscout',

  // Kontrakt wdrozony 2026-08-05; isLive zostaje jako bezpiecznik.
  isLive: isRobinhoodPostContractDeployed,
  notLiveMessage: ROBINHOOD_POSTING_DISABLED_MESSAGE,

  post: {
    onChain: 'bg-[#00C805] text-black hover:bg-[#00b104] border border-black',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600',
    spinner: () => 'text-black',
    sentAccent: 'bg-[#00C805]',
    sentText: 'text-white',
    icon: () => <RobinhoodLogo className="w-4 h-4 mr-1" />,
  },
  comment: {
    onChain: 'bg-black text-[#00C805] hover:bg-gray-900 border border-[#00C805]/30',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600',
    spinner: () => 'text-[#00C805]',
    sentAccent: 'bg-[#00C805]',
    sentText: 'text-white',
    icon: () => <RobinhoodLogo className="w-4 h-4 mr-1.5" />,
  },
  composer: {
    // eslint-disable-next-line @next/next/no-img-element
    background: <img src="/robin.webp" alt="" className="w-16 h-16" />,
    focusRing: 'focus:ring-black',
    progressBar: 'bg-[#00C805]',
    placeholder: "What's happening on Robinhood Chain? Drop your current Spotify vibe and share what's on your mind!",
    network: 'robinhood',
    mediaFilePrefix: 'robinhood-post-media',
    savingLabel: 'Robinhood Chain',
    notice: (
      <div
        role="status"
        className="mb-4 rounded-lg border border-[#00C805]/40 bg-[#00C805]/10 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 relative z-10"
      >
        <span className="font-medium">{ROBINHOOD_POSTING_DISABLED_MESSAGE}.</span>{' '}
        <span className="opacity-80">
          Tipping on Robinhood Chain already works - only onchain posting waits for the contract address.
        </span>
      </div>
    ),
  },
};
