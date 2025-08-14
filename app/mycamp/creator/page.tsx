'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import NftCreator from '../components/NftCreator';
import { ToastProvider } from '../components/Toast';

export default function IpCreatorPage() {
  return (
    <ToastProvider>
      <div className="min-h-screen overflow-x-hidden relative">
        <div className="fixed inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: 'url(/CampBack.jpg)' }} />
        <div className="fixed inset-0 bg-gradient-to-br from-black/70 via-purple-700/40 to-fuchsia-600/60" />

        <div className="relative z-10 max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">IP Creator</h1>
            <Link href="/mycamp" className="text-sm text-white/80 hover:text-white underline">Back to MyCamp</Link>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-black/30 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-3 sm:p-6">
            <NftCreator />
          </motion.div>
        </div>
      </div>
    </ToastProvider>
  );
}


