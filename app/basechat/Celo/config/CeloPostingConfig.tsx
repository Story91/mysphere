'use client';

/** Wszystko, czym Celo rozni sie od pozostalych lancuchow w sciezce postowania. */

import type { Abi } from 'viem';
import type { ChainPostingConfig } from '../../chainPosting/types';
import { CELO_CHAIN_ID, celoChain } from './CeloNetworkConfig';
import { CELO_POST_CONTRACT_ABI, getCeloContractAddress } from '../contracts/CeloPostContract';

function CeloLogo({ className }: { className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logotypy/AkeHh5LriDwrNIvVvUQ66wSHU.webp" alt="Celo" className={className} />;
}

export const CELO_POSTING: ChainPostingConfig = {
  chainId: CELO_CHAIN_ID,
  chain: celoChain,
  abi: CELO_POST_CONTRACT_ABI as unknown as Abi,
  getContractAddress: getCeloContractAddress,

  networkLabel: 'Celo Network',
  shortName: 'Celo',

  txHashStorageKey: 'lastCeloTxHash',
  explorerTxUrl: 'https://explorer.celo.org/tx/',
  explorerButtonLabel: 'View on Celo Explorer',

  post: {
    onChain: 'bg-yellow-400 text-black border border-black hover:bg-yellow-500',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600',
    spinner: () => 'text-black',
    sentAccent: 'bg-blue-500',
    sentText: 'text-white',
    icon: () => <CeloLogo className="w-4 h-4 mr-1" />,
  },
  comment: {
    onChain: 'bg-yellow-400 text-black hover:bg-yellow-500 border border-black',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600',
    spinner: () => 'text-black',
    sentAccent: 'bg-yellow-400',
    sentText: 'text-black',
    icon: () => <CeloLogo className="w-4 h-4 mr-1.5" />,
  },
};
