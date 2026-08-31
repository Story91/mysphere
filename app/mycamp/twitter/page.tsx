'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuthState, useSocials } from '@campnetwork/origin/react';

export default function TwitterCallbackPage() {
  const router = useRouter();
  const { authenticated } = useAuthState();
  const { data: socialsData, isLoading } = useSocials();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    // Handle Twitter OAuth callback
    const handleCallback = async () => {
      try {
        // Check if Twitter was successfully linked
        if (authenticated && socialsData && (socialsData as any)?.twitter) {
          setStatus('success');
          // Redirect back to main mycamp page after 2 seconds
          setTimeout(() => {
            router.push('/mycamp');
          }, 2000);
        } else if (!isLoading) {
          setStatus('error');
          // Redirect back after 3 seconds on error
          setTimeout(() => {
            router.push('/mycamp');
          }, 3000);
        }
      } catch (error) {
        console.error('Twitter callback error:', error);
        setStatus('error');
        setTimeout(() => {
          router.push('/mycamp');
        }, 3000);
      }
    };

    if (!isLoading) {
      handleCallback();
    }
  }, [authenticated, socialsData, isLoading, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-orange-800 to-orange-600 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-8 text-center max-w-md"
      >
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400 mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-orange-200 mb-2">🐦 Connecting Twitter</h2>
            <p className="text-orange-100">Linking your Twitter account...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-green-300 mb-2">Twitter Connected!</h2>
            <p className="text-orange-100 mb-4">Your Twitter account is now linked to Camp Network.</p>
            <p className="text-orange-200/70 text-sm">Redirecting back to My Camp...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-red-300 mb-2">Connection Failed</h2>
            <p className="text-orange-100 mb-4">We couldn't connect your Twitter account.</p>
            <p className="text-orange-200/70 text-sm">Redirecting back to My Camp...</p>
          </>
        )}
      </motion.div>
    </div>
  );
} 