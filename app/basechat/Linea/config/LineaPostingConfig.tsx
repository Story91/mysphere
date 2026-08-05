'use client';

/** Wszystko, czym Linea rozni sie od pozostalych lancuchow w sciezce postowania. */

import type { Abi } from 'viem';
import type { ChainPostingConfig } from '../../chainPosting/types';
import { LINEA_CHAIN_ID, lineaChain } from './LineaNetworkConfig';
import { LINEA_POST_CONTRACT_ABI, getLineaContractAddress } from '../contracts/LineaPostContract';

function LineaLogo({ className }: { className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/Logomark Blue BG.svg" alt="Linea" className={className} />;
}

export const LINEA_POSTING: ChainPostingConfig = {
  chainId: LINEA_CHAIN_ID,
  chain: lineaChain,
  abi: LINEA_POST_CONTRACT_ABI as unknown as Abi,
  getContractAddress: getLineaContractAddress,

  networkLabel: 'Linea Network',
  shortName: 'Linea',

  txHashStorageKey: 'lastLineaTxHash',
  explorerTxUrl: 'https://lineascan.build/tx/',
  explorerButtonLabel: 'View on Lineascan',

  post: {
    onChain: 'bg-cyan-200 text-black hover:bg-cyan-300 border border-black',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600',
    spinner: () => 'text-black',
    sentAccent: 'bg-blue-500',
    sentText: 'text-white',
    icon: () => <LineaLogo className="w-4 h-4 mr-1" />,
  },
  comment: {
    onChain: 'bg-black text-cyan-400 hover:bg-gray-900 border border-cyan-400/30',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600',
    spinner: () => 'text-cyan-400',
    sentAccent: 'bg-cyan-400',
    sentText: 'text-white',
    icon: () => <LineaLogo className="w-4 h-4 mr-1.5" />,
  },
};
