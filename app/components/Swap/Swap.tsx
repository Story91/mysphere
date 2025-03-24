'use client';

import { 
  Swap, 
  SwapAmountInput, 
  SwapToggleButton, 
  SwapButton, 
  SwapMessage, 
  SwapToast
} from '@coinbase/onchainkit/swap';
import type { Token } from '@coinbase/onchainkit/token';
import { Fragment } from 'react';

export default function SwapComponent() {
  // Definicje tokenów
  const ethToken: Token = {
    name: 'ETH',
    address: '',
    symbol: 'ETH',
    decimals: 18,
    chainId: 8453,
    image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png'
  };
  
  const aisToken: Token = {
    name: 'All I See Is Base',
    address: '0x26F732eD652A63aE66F365936fdDD2389c051B31',
    symbol: 'AIS',
    decimals: 18,
    chainId: 8453,
    image: '/aislogo.png'
  };
  
  const usdcToken: Token = {
    name: 'USD Coin',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6,
    chainId: 8453,
    image: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png'
  };

  // Tokeny dostępne w komponentach
  const swappableTokens = [ethToken, usdcToken, aisToken];

  return (
    <div className="w-full rounded-xl border border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)] relative overflow-hidden z-10 p-5">
      {/* Custom CSS to hide the Swap title */}
      <style jsx global>{`
        /* Target specific elements within the swap component */
        .swap-container h2:first-of-type {
          display: none !important;
        }
        
        /* Hide title/header area */
        .swap-container > div > div:first-child {
          display: none !important;
        }
        
        /* Hide any headings that contain the text "Swap" */
        .swap-container h1, 
        .swap-container h2, 
        .swap-container h3, 
        .swap-container h4 {
          font-size: 0 !important;
          color: transparent !important;
          height: 0 !important;
          overflow: hidden !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        /* Make the component larger */
        .swap-container {
          min-height: 450px !important;
          display: flex;
          flex-direction: column;
          padding: 1.25rem !important;
        }

        /* Add more space between elements */
        .swap-container > div {
          margin-bottom: 1.25rem !important;
        }

        /* Make inputs and font sizes larger */
        .swap-container input {
          font-size: 2.25rem !important;
          line-height: 2.75rem !important;
          height: 3.5rem !important;
        }

        /* Balance text */
        .swap-container .balance-display {
          font-size: 1.1rem !important;
          margin-top: 0.6rem !important;
        }

        /* Token selector */
        .swap-container .token-selector {
          font-size: 1.2rem !important;
          padding: 0.6rem 0.9rem !important;
        }

        /* Labels */
        .swap-container .amount-input_label {
          font-size: 1.4rem !important;
          margin-bottom: 0.4rem !important;
        }

        /* Swap button */
        .swap-container button[type="submit"] {
          height: 3.6rem !important;
          font-size: 1.4rem !important;
          margin-top: 1.25rem !important;
        }

        /* Toggle button */
        .swap-container .toggle-button {
          height: 3rem !important;
          width: 3rem !important;
          margin: 0.8rem auto !important;
        }
      `}</style>
      
      <Swap 
        className="
          swap-container
          [&_input]:!h-[4.5rem] 
          [&_input]:!text-3xl 
          [&_input]:!rounded-xl 
          [&_input]:!border-green-200
          [&_input]:!bg-transparent
          [&_input]:!text-white
          [&_input]:!placeholder-gray-400
          [&_input]:!shadow-none
          [&_input]:!pl-5
          [&_input]:hover:!border-green-400
          [&_input]:focus:!border-green-500
          [&_div.amount-input]:!py-6
          [&_div.amount-input]:!px-5
          [&_div.amount-input_label]:!text-xl
          [&_div.amount-input_label]:!font-bold
          [&_div.amount-input_label]:!mb-2
          [&_div.token-selector]:!px-4
          [&_div.token-selector]:!py-3
          [&_div.token-selector]:!text-lg
          [&_div.balance-display]:!text-lg
          [&_div.balance-display]:!mt-2
        "
        headerLeftContent={<Fragment />}
      >
        {/* Input "Sell" */}
        <SwapAmountInput
          label="Sell"
          swappableTokens={swappableTokens}
          token={ethToken} 
          type="from"
          className="mt-0 pt-0"
        />
        
        {/* Przycisk zamiany */}
        <SwapToggleButton 
          className="!border-green-500 !text-green-500 !h-14 !w-14 !text-2xl !rounded-xl !my-3 toggle-button" 
        />
        
        {/* Input "Buy" */}
        <SwapAmountInput
          label="Buy"
          swappableTokens={swappableTokens}
          token={aisToken}
          type="to"
        />
        
        {/* Przycisk Swap */}
        <SwapButton 
          className="!bg-green-500 !hover:bg-green-600 !h-[4.5rem] !text-xl !rounded-xl !font-bold !mt-5 !mb-2" 
        />
        
        {/* Komunikat o statusie transakcji */}
        <SwapMessage className="!text-lg !py-2" />
        
        {/* Powiadomienie o udanej transakcji */}
        <SwapToast />
      </Swap>
    </div>
  );
}