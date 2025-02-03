'use client';

import { useEffect } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gecko-coin-price-marquee-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        locale?: string;
        outlined?: string;
        'coin-ids'?: string;
        'initial-currency'?: string;
      };
    }
  }
}

export default function CoinGeckoMarqueeWidget() {
  useEffect(() => {
    // Dodaj skrypt CoinGecko tylko jeśli jeszcze nie istnieje
    if (!document.querySelector('script[src*="gecko-coin-price-marquee-widget.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://widgets.coingecko.com/gecko-coin-price-marquee-widget.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  return (
    <div className="w-full space-y-1">
      {/* Widget dla głównych kryptowalut */}
      <div className="w-full bg-white/[.02] backdrop-blur-sm py-1">
        <gecko-coin-price-marquee-widget 
          locale="en" 
          outlined="true"
          coin-ids="bitcoin,ethereum,binancecoin,ripple,cardano,solana,polkadot,dogecoin" 
          initial-currency="usd"
        />
      </div>

      {/* Widget dla memecoinów i innych tokenów */}
      <div className="w-full bg-white/[.02] backdrop-blur-sm py-1">
        <gecko-coin-price-marquee-widget 
          locale="en" 
          outlined="true"
          coin-ids="official-trump,american-coin,maga,ondo-finance,fartcoin,department-of-government-efficiency,ai16z,dogelon-mars,jupiter-exchange-solana,dogecoin,griffain,virtual-protocol,aixbt" 
          initial-currency="usd"
        />
      </div>
    </div>
  );
} 