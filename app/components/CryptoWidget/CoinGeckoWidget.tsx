'use client';

import { useEffect } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gecko-coin-market-ticker-list-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        locale?: string;
        outlined?: string;
        'coin-id'?: string;
        'initial-currency'?: string;
      };
    }
  }
}

export default function CoinGeckoWidget() {
  useEffect(() => {
    // Dodaj skrypt CoinGecko tylko jeśli jeszcze nie istnieje
    if (!document.querySelector('script[src*="gecko-coin-market-ticker-list-widget.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://widgets.coingecko.com/gecko-coin-market-ticker-list-widget.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto my-8">
      <gecko-coin-market-ticker-list-widget 
        locale="en" 
        outlined="true" 
        coin-id="official-trump" 
        initial-currency="usd"
      />
    </div>
  );
} 