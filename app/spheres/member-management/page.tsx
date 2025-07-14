'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useSpheresContract, Community } from '../hooks/useSpheresContract';
import MemberManagementPanel from '../components/MemberManagement/MemberManagementPanel';
import { useSearchParams } from 'next/navigation';

export default function MemberManagementPage() {
  const { address, isConnected } = useAccount();
  const { communities, isLoading, isAdmin } = useSpheresContract();
  
  const searchParams = useSearchParams();
  const initialCommunityId = searchParams.get('communityId');

  const [createdCommunities, setCreatedCommunities] = useState<Community[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);

  useEffect(() => {
    if (address && communities.length > 0) {
      const userCommunities = communities.filter(c => c.creator.toLowerCase() === address.toLowerCase());
      setCreatedCommunities(userCommunities);

      if (userCommunities.length > 0) {
        if (initialCommunityId) {
            const initialCommunity = userCommunities.find(c => c.id === parseInt(initialCommunityId, 10));
            setSelectedCommunity(initialCommunity || userCommunities[0]);
        } else {
            setSelectedCommunity(userCommunities[0]);
        }
      }
    }
  }, [address, communities, initialCommunityId]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-8 bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10"
        >
          <div className="w-16 h-16 mx-auto mb-4 bg-purple-500/20 rounded-full flex items-center justify-center">
            <span className="text-2xl">🔗</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Connect Wallet</h2>
          <p className="text-gray-300 mb-4">Please connect your wallet to access Member Management</p>
          <p className="text-sm text-gray-400">Connect your wallet in the top navigation</p>
        </motion.div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center text-white py-10">Loading communities...</div>;
  }

  if (createdCommunities.length === 0) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-8 bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10"
        >
          <div className="w-16 h-16 mx-auto mb-4 bg-purple-500/20 rounded-full flex items-center justify-center">
            <span className="text-4xl">🏘️</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">No Communities Found</h2>
          <p className="text-gray-300">You have not created any communities yet.</p>
          <p className="text-sm text-gray-400 mt-4">Go to Creator Dashboard to create your first one.</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-3">Select a community to manage:</h2>
            <div className="flex flex-wrap gap-3">
                {createdCommunities.map(community => (
                    <button 
                        key={community.id}
                        onClick={() => setSelectedCommunity(community)}
                        className={`px-4 py-2 rounded-lg border-2 transition-all ${selectedCommunity?.id === community.id ? 'bg-purple-600 border-purple-400 text-white' : 'bg-white/10 border-transparent hover:border-purple-500/50 text-gray-300'}`}
                    >
                        {community.name}
                    </button>
                ))}
            </div>
        </div>

        {selectedCommunity ? (
            <MemberManagementPanel 
                communityId={selectedCommunity.id}
                userAddress={address}
                isPlatformAdmin={isAdmin}
            />
        ) : (
            <div className="text-center text-white py-10">Please select a community to continue.</div>
        )}
      </main>

      {/* Toast Notifications */}
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#fff',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff'
            }
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff'
            }
          }
        }}
      />
    </div>
  );
} 