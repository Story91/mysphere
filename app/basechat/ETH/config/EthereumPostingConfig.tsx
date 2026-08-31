'use client';

/** Wszystko, czym Ethereum rozni sie od pozostalych lancuchow w sciezce postowania. */

import type { Abi } from 'viem';
import type { ChainWithComposer } from '../../chainPosting/ChainCreatePost';
import { ETHEREUM_CHAIN_ID, ethereumChain } from './EthereumNetworkConfig';
import {
  ETHEREUM_POST_CONTRACT_ABI,
  getEthereumContractAddress,
} from '../contracts/EthereumPostContract';

/**
 * Logo ETH jest jednokolorowe, wiec na jasnym przycisku (portfel na Ethereum)
 * jest czarne, a na ciemnym - bialy negatyw. Stad `onChain` w parametrach.
 */
function EthereumLogo({ className, onChain }: { className: string; onChain: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/eth.svg"
      alt="Ethereum"
      className={className}
      style={{ filter: onChain ? 'brightness(0)' : 'brightness(0) invert(1)' }}
    />
  );
}

export const ETHEREUM_POSTING: ChainWithComposer = {
  chainId: ETHEREUM_CHAIN_ID,
  chain: ethereumChain,
  abi: ETHEREUM_POST_CONTRACT_ABI as unknown as Abi,
  getContractAddress: getEthereumContractAddress,

  networkLabel: 'Ethereum Network',
  shortName: 'Ethereum',

  txHashStorageKey: 'lastEthereumTxHash',
  explorerTxUrl: 'https://etherscan.io/tx/',
  explorerButtonLabel: 'View on Etherscan',

  post: {
    onChain: 'bg-white text-black border border-black hover:bg-gray-50',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600',
    spinner: onChain => (onChain ? 'text-black' : 'text-white'),
    sentAccent: 'bg-blue-500',
    sentText: 'text-white',
    icon: onChain => <EthereumLogo className="w-4 h-4 mr-1" onChain={onChain} />,
  },
  comment: {
    onChain: 'bg-white text-black hover:bg-gray-50 border border-black',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600',
    spinner: onChain => (onChain ? 'text-black' : 'text-white'),
    sentAccent: 'bg-gray-400',
    sentText: 'text-white',
    icon: onChain => <EthereumLogo className="w-4 h-4 mr-1.5" onChain={onChain} />,
  },
  composer: {
    background: <div className="w-16 h-16 bg-blue-500 rounded-full" />,
    focusRing: 'focus:ring-blue-500',
    progressBar: 'bg-blue-500',
    placeholder: "What's happening on Ethereum? Drop your current Spotify vibe and share what's on your mind!",
    network: 'ethereum',
    mediaFilePrefix: 'ethereum-post-media',
    savingLabel: 'Ethereum Network',
  },
};
