'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function YapScanCallback() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Tutaj możesz wykonać dodatkową logikę, np. przetwarzanie parametrów z URL
    // lub interakcję z API zewnętrznym, zanim przekierujesz użytkownika
    
    // Symulacja opóźnienia do pokazania animacji ładowania
    const timer = setTimeout(() => {
      setLoading(false);
      // Przekierowanie do głównej strony YapScan po zakończeniu przetwarzania
      router.push('/yapscan');
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="w-16 h-16 border-4 border-t-blue-500 border-r-transparent border-b-blue-500 border-l-transparent rounded-full mx-auto mb-4"
        ></motion.div>
        <h1 className="text-2xl text-white font-bold">Processing...</h1>
        <p className="text-gray-400 mt-2">One moment, taking you back to YapScan</p>
      </motion.div>
    </div>
  );
} 