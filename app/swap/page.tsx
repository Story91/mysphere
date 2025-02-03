'use client';

import SwapComponent from '../components/Swap/Swap';
import RandomToken from '../components/Swap/RandomToken';
import Script from 'next/script';

// Deklaracja typu dla widgetu CoinGecko
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gecko-coin-heatmap-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        locale?: string;
        'dark-mode'?: string;
        outlined?: string;
        top?: string;
        width?: string;
        height?: string;
      };
    }
  }
}

export default function SwapPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Matrix background effect */}
      <div className="fixed inset-0 bg-black opacity-90">
        <div className="absolute inset-0 bg-[url('/matrix.png')] opacity-10 animate-matrix"></div>
      </div>

      {/* Cyber grid background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,82,255,0.1)_0%,transparent_70%)]"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent)',
        backgroundSize: '50px 50px'
      }}></div>

      {/* Glowing orbs */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-[#0052FF]/20 rounded-full filter blur-3xl animate-pulse"></div>
      <div className="absolute top-1/2 left-1/4 w-80 h-80 bg-[#0052FF]/15 rounded-full filter blur-3xl animate-pulse delay-300"></div>
      <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-200"></div>

      {/* Main content */}
      <div className="relative z-10">
        <div className="container mx-auto px-4 py-8">
          <RandomToken />
          <SwapComponent />
          
          {/* CoinGecko Heatmap Widget - aktualizuje się co 30 sekund */}
          <div className="mt-8">
            <Script src="https://widgets.coingecko.com/gecko-coin-heatmap-widget.js" />
            <gecko-coin-heatmap-widget 
              locale="en" 
              dark-mode="true" 
              outlined="true" 
              top="100" 
              width="100" 
              height="300"
            />
          </div>
        </div>
      </div>
    </div>
  );
}