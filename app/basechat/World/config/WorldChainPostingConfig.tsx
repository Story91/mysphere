'use client';

/** Wszystko, czym World Chain rozni sie od pozostalych lancuchow w sciezce postowania. */

import type { Abi } from 'viem';
import type { ChainPostingConfig } from '../../chainPosting/types';
import { WORLD_CHAIN_ID, worldChain } from './WorldChainNetworkConfig';
import {
  WORLD_CHAIN_POST_CONTRACT_ABI,
  getWorldChainContractAddress,
} from '../contracts/WorldChainPostContract';

function WorldChainLogo({ className }: { className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logotypy/logo-symbol.svg" alt="World Chain" className={className} />;
}

export const WORLD_CHAIN_POSTING: ChainPostingConfig = {
  chainId: WORLD_CHAIN_ID,
  chain: worldChain,
  abi: WORLD_CHAIN_POST_CONTRACT_ABI as unknown as Abi,
  getContractAddress: getWorldChainContractAddress,

  networkLabel: 'World Chain',
  shortName: 'World Chain',

  txHashStorageKey: 'lastWorldChainTxHash',
  explorerTxUrl: 'https://worldscan.org/tx/',
  explorerButtonLabel: 'View on Worldscan',

  post: {
    onChain: 'bg-white text-black border border-black hover:bg-gray-50',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600',
    spinner: () => 'text-black',
    sentAccent: 'bg-blue-500',
    sentText: 'text-white',
    icon: () => <WorldChainLogo className="w-4 h-4 mr-1" />,
  },
  comment: {
    onChain: 'bg-white text-black hover:bg-gray-50 border border-black',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600',
    spinner: () => 'text-black',
    sentAccent: 'bg-gray-400',
    sentText: 'text-white',
    icon: () => <WorldChainLogo className="w-4 h-4 mr-1.5" />,
  },
};
