'use client';

import DirectMessages from '../components/DirectMessages/DirectMessages';

export default function MessagesPage() {
  return (
    <div className="flex items-center justify-center h-screen">
      {/* Orby w tle */}
      <div className="fixed top-0 left-0 w-[800px] h-[800px] rounded-full bg-gradient-to-r from-[#0052FF]/30 to-[#0052FF]/10 blur-[120px] -translate-x-1/2 -translate-y-1/2 animate-pulse" />
      <div className="fixed top-0 right-0 w-[800px] h-[800px] rounded-full bg-gradient-to-l from-[#0052FF]/30 to-[#0052FF]/10 blur-[120px] translate-x-1/2 -translate-y-1/2 animate-pulse" />
      
      {/* Główny komponent */}
      <div className="relative z-10 w-full max-w-[1400px] mx-auto h-full">
        <DirectMessages />
      </div>
    </div>
  );
} 