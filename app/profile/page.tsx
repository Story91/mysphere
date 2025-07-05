'use client';

import { useState, useEffect } from 'react';
import IdentityComponent from '../components/Identity/Identity';

export default function ProfilePage() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div></div>;
  }

  return (
    <div className="min-h-screen bg-black">
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
        <div className="w-full max-w-[2000px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <IdentityComponent />
        </div>
      </div>
    </div>
  );
} 