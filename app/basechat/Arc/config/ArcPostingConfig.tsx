'use client';

/** Wszystko, czym Arc rozni sie od pozostalych lancuchow w sciezce postowania. */

import type { Abi } from 'viem';
import type { ChainWithComposer } from '../../chainPosting/ChainCreatePost';
import { arcTestnet } from '../../../startpad/arcChain';
import {
  ARC_CHAIN_ID,
  ARC_POST_CONTRACT_ABI,
  getArcContractAddress,
  isArcPostContractDeployed,
} from '../contracts/ArcPostContract';

export const ARC_POSTING_DISABLED_MESSAGE = 'Posting on Arc is not live yet';

function ArcLogo({ className }: { className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/arc.jpg" alt="Arc" className={`${className} rounded-[3px]`} />;
}

export const ARC_POSTING: ChainWithComposer = {
  chainId: ARC_CHAIN_ID,
  chain: arcTestnet,
  abi: ARC_POST_CONTRACT_ABI as unknown as Abi,
  getContractAddress: getArcContractAddress,

  networkLabel: 'Arc Testnet',
  shortName: 'Arc',

  txHashStorageKey: 'lastArcTxHash',
  explorerTxUrl: `${arcTestnet.blockExplorers.default.url}/tx/`,
  explorerButtonLabel: 'View on Arcscan',

  // Kontrakt czeka na deploy - patrz ArcPostContract.ts.
  isLive: isArcPostContractDeployed,
  notLiveMessage: ARC_POSTING_DISABLED_MESSAGE,

  post: {
    onChain: 'bg-black text-white hover:bg-gray-900 border border-black',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600',
    spinner: () => 'text-white',
    sentAccent: 'bg-black',
    sentText: 'text-white',
    icon: () => <ArcLogo className="w-4 h-4 mr-1" />,
  },
  comment: {
    onChain: 'bg-white text-black hover:bg-gray-100 border border-black/30',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600',
    spinner: () => 'text-black',
    sentAccent: 'bg-black',
    sentText: 'text-white',
    icon: () => <ArcLogo className="w-4 h-4 mr-1.5" />,
  },
  composer: {
    // eslint-disable-next-line @next/next/no-img-element
    background: <img src="/arc.jpg" alt="" className="w-16 h-16 rounded-xl" />,
    focusRing: 'focus:ring-black',
    progressBar: 'bg-black',
    placeholder: "What's happening on Arc? Drop your current Spotify vibe and share what's on your mind!",
    network: 'arc',
    mediaFilePrefix: 'arc-post-media',
    savingLabel: 'Arc',
    notice: (
      <div
        role="status"
        className="mb-4 rounded-lg border border-black/30 bg-black/5 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 relative z-10"
      >
        <span className="font-medium">{ARC_POSTING_DISABLED_MESSAGE}.</span>{' '}
        <span className="opacity-80">
          Tipping in USDC on Arc already works - only onchain posting waits for the contract deployment.
        </span>
      </div>
    ),
  },
};
