'use client';

import { useState } from 'react';
import { Swap, SwapAmountInput, SwapButton, SwapMessage, SwapToast, SwapToggleButton } from '@coinbase/onchainkit/swap';
import type { Token } from '@coinbase/onchainkit/token';

type Theme = 'base' | 'cyberpunk' | 'matrix' | 'minimal';

export default function SwapComponent() {
  const [theme, setTheme] = useState<Theme>('base');

  const tokens: Token[] = [
    {
      name: 'ETH',
      address: '',
      symbol: 'ETH',
      decimals: 18,
      chainId: 8453,
      image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png'
    },
    {
      name: 'USD Coin',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6,
      chainId: 8453,
      image: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png'
    },
    {
      name: 'DEGEN',
      address: '0x4ed4e862860bed51a9570b96d89af5e1b0efefed',
      symbol: 'DEGEN',
      decimals: 18,
      chainId: 8453,
      image: 'https://d3r81g40ycuhqg.cloudfront.net/wallet/wais/3b/bf/3bbf118b5e6dc2f9e7fc607a6e7526647b4ba8f0bea87125f971446d57b296d2-MDNmNjY0MmEtNGFiZi00N2I0LWIwMTItMDUyMzg2ZDZhMWNm'
    }
  ];

  const getThemeStyles = () => {
    switch (theme) {
      case 'cyberpunk':
        return {
          container: 'bg-black border-2 border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.5)]',
          title: 'text-pink-500',
          button: 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600'
        };
      case 'matrix':
        return {
          container: 'bg-black border border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)]',
          title: 'text-green-500 font-mono',
          button: 'bg-green-500 hover:bg-green-600'
        };
      case 'minimal':
        return {
          container: 'bg-white border border-gray-200',
          title: 'text-gray-800',
          button: 'bg-gray-900 hover:bg-gray-800'
        };
      default: // base theme
        return {
          container: 'bg-white dark:bg-gray-800',
          title: 'text-blue-900 dark:text-blue-100',
          button: 'bg-blue-500 hover:bg-blue-600'
        };
    }
  };

  const styles = getThemeStyles();

  return (
    <div className={`w-full rounded-xl shadow-lg p-6 ${styles.container}`}>
      {/* Theme Switcher */}
      <div className="flex justify-between items-center mb-6">
        <h2 className={`text-xl font-bold ${styles.title}`}>Swap Tokens</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setTheme('base')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              theme === 'base' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Base
          </button>
          <button
            onClick={() => setTheme('cyberpunk')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              theme === 'cyberpunk' ? 'bg-pink-100 text-pink-600' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Cyberpunk
          </button>
          <button
            onClick={() => setTheme('matrix')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              theme === 'matrix' ? 'bg-green-100 text-green-600' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Matrix
          </button>
          <button
            onClick={() => setTheme('minimal')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              theme === 'minimal' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Minimal
          </button>
        </div>
      </div>

      {/* Swap Interface */}
      <div className="w-full">
        <Swap isSponsored className="w-full">
          <SwapAmountInput
            label="Sell"
            swappableTokens={tokens}
            token={tokens[0]}
            type="from"
            className="w-full"
          />
          <SwapToggleButton className="my-2 w-full" />
          <SwapAmountInput
            label="Buy"
            swappableTokens={tokens}
            token={tokens[1]}
            type="to"
            className="w-full"
          />
          <div className="w-full mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Estimated Gas Fee:</span>
              <span>~0.0001 ETH</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500 mt-1">
              <span>Price Impact:</span>
              <span className="text-green-500">{'<0.01%'}</span>
            </div>
          </div>
          <SwapButton className={`w-full mt-4 ${styles.button}`} />
          <SwapMessage className="mt-2 w-full" />
          <SwapToast />
        </Swap>
      </div>
    </div>
  );
}