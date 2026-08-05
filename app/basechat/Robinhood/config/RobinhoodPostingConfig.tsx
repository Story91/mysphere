'use client';

/** Wszystko, czym Robinhood Chain rozni sie od pozostalych lancuchow w sciezce postowania. */

import type { Abi } from 'viem';
import type { ChainPostingConfig } from '../../chainPosting/types';
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_CONFIG, robinhoodChain } from './RobinhoodNetworkConfig';
import {
  ROBINHOOD_POST_CONTRACT_ABI,
  getRobinhoodContractAddress,
  isRobinhoodPostContractDeployed,
} from '../contracts/RobinhoodPostContract';

// Komunikat pokazywany dopoki kontrakt postow nie jest wdrozony na Robinhood Chain.
export const ROBINHOOD_POSTING_DISABLED_MESSAGE = 'Posting on Robinhood Chain is not live yet';

function RobinhoodLogo({ className }: { className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logotypy/robinhood.svg" alt="Robinhood Chain" className={className} />;
}

export const ROBINHOOD_POSTING: ChainPostingConfig = {
  chainId: ROBINHOOD_CHAIN_ID,
  chain: robinhoodChain,
  abi: ROBINHOOD_POST_CONTRACT_ABI as unknown as Abi,
  getContractAddress: getRobinhoodContractAddress,

  networkLabel: 'Robinhood Chain',
  shortName: 'Robinhood Chain',

  txHashStorageKey: 'lastRobinhoodTxHash',
  explorerTxUrl: `${ROBINHOOD_CONFIG.explorerUrl}/tx/`,
  explorerButtonLabel: 'View on Blockscout',

  // Jedyny lancuch, na ktorym kontrakt postow nie jest jeszcze wdrozony.
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
};
