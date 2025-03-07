"use client";

import { useEffect } from 'react';

export default function FlashBlockPage() {
  // Ta strona będzie widoczna tylko przez chwilę, zanim zadziała rewrite
  // Możemy dodać przekierowanie na wypadek, gdyby rewrite nie zadziałało
  useEffect(() => {
    // Opcjonalne przekierowanie awaryjne po 3 sekundach
    const timer = setTimeout(() => {
      window.location.href = 'https://base-is-10x-faster.vercel.app';
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-900 to-black text-white p-4">
      <h1 className="text-4xl font-bold mb-6">FLASHBLOCK</h1>
      <p className="text-xl mb-8 text-center">Loading FlashBlock application...</p>
      
      <div className="w-16 h-16 border-t-4 border-blue-500 border-solid rounded-full animate-spin"></div>
    </div>
  );
} 