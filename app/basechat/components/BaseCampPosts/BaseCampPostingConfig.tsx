'use client';

/** Wszystko, czym Camp Network rozni sie od pozostalych lancuchow w sciezce postowania. */

import Image from 'next/image';
import type { Abi } from 'viem';
import type { ChainPostingConfig } from '../../chainPosting/types';
import {
  BASECAMP_CHAIN_ID,
  BASECAMP_POST_CONTRACT_ABI,
  getBaseCampContractAddress,
  baseCampChain,
} from '../../../contracts/BaseCampPostContract';

/** Wersja z pliku - uzywana w przycisku postu, na pomaranczowym tle. */
function CampLogoImage() {
  return (
    <div className="bg-white rounded-full p-1 mr-1">
      <Image src="/Camp.png" alt="Camp" width={14} height={14} />
    </div>
  );
}

/** Wersja rysowana - uzywana w przycisku komentarza. */
function CampLogoSvg() {
  return (
    <svg className="w-4 h-4 mr-1.5" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M300 0C134.3 0 0 134.3 0 300s134.3 300 300 300 300-134.3 300-300S465.7 0 300 0z" fill="#000" />
      <path d="M300 100c-110.5 0-200 89.5-200 200s89.5 200 200 200 200-89.5 200-200-89.5-200-200-200z" fill="#fff" />
      <path d="M330 190c0 0-30 40-10 80 20 40 20 90-20 120 0 0 70-30 70-100 0-70-40-100-40-100z" fill="#FF6B00" />
      <path d="M270 230c0 0-20 30-10 60 10 30 10 60-30 80 0 0 60-10 60-60 0-50-20-80-20-80z" fill="#FF6B00" />
    </svg>
  );
}

export const BASECAMP_POSTING: ChainPostingConfig = {
  chainId: BASECAMP_CHAIN_ID,
  chain: baseCampChain,
  abi: BASECAMP_POST_CONTRACT_ABI as unknown as Abi,
  // Adres Camp jest staly - funkcja z kontraktu nie przyjmuje chainId.
  getContractAddress: () => getBaseCampContractAddress(),

  networkLabel: 'Camp Network',
  // Bez `shortName`: komunikaty na Camp nigdy nie nosily nazwy sieci
  // ("Transaction sent!", nie "Transaction sent on Camp!").

  txHashStorageKey: 'lastBaseCampTxHash',
  explorerTxUrl: 'https://camp.cloud.blockscout.com/tx/',
  explorerButtonLabel: 'View on Explorer',

  post: {
    onChain: 'bg-orange-500 text-white border border-black hover:bg-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.4)]',
    offChain: 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600',
    spinner: () => 'text-white',
    sentAccent: 'bg-blue-500',
    sentText: 'text-white',
    icon: () => <CampLogoImage />,
  },
  comment: {
    onChain: 'bg-orange-500 text-white hover:bg-orange-600',
    offChain: 'bg-yellow-500 text-white hover:bg-yellow-600',
    spinner: () => 'text-white',
    sentAccent: 'bg-orange-400',
    sentText: 'text-white',
    icon: () => <CampLogoSvg />,
  },
};
