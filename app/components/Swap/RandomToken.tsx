'use client';

import Script from 'next/script';

// Deklaracja typu dla widgetu CoinGecko
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gecko-random-coin-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        locale?: string;
        outlined?: string;
      };
    }
  }
}

export default function RandomToken() {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
      <h2 className="text-xl font-bold mb-4 text-blue-900">Poznaj losowy token 🎲</h2>
      <div className="flex justify-center">
        <Script src="https://widgets.coingecko.com/gecko-random-coin-widget.js" />
        <gecko-random-coin-widget 
          locale="en" 
          outlined="true"
        />
      </div>
    </div>
  );
} 