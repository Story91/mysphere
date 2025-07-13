'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import CommunityStatsCard from './CommunityStatsCard';
import MemberManagementCard from './MemberManagementCard';
import FinancialOverview from './FinancialOverview';
import EventManagementCard from './EventManagementCard';
import RecentActivityCard from './RecentActivityCard';

export default function CreatorDashboard() {
  const { address } = useAccount();
  const { 
    getAllCommunities, 
    getCommunityDetails, 
    getMemberDetails,
    platformStats,
    isLoading 
  } = useSpheresContract();

  const [createdCommunities, setCreatedCommunities] = useState<any[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<any>(null);
  const [memberList, setMemberList] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Ładowanie społeczności stworzonych przez użytkownika
  useEffect(() => {
    const loadCreatorData = async () => {
      if (!address) return;
      
      setLoadingData(true);
      try {
        // Pobierz wszystkie społeczności
        const allCommunities = await getAllCommunities();
        
        // Filtruj tylko te stworzone przez tego użytkownika
        const userCreatedCommunities = allCommunities.filter(
          (community: any) => community.creator.toLowerCase() === address.toLowerCase()
        );
        
        setCreatedCommunities(userCreatedCommunities);
        
        // Ustaw pierwszą społeczność jako domyślnie wybraną
        if (userCreatedCommunities.length > 0) {
          setSelectedCommunity(userCreatedCommunities[0]);
        }
        
      } catch (error) {
        console.error('Error loading creator data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    loadCreatorData();
  }, [address, getAllCommunities]);

  // Oblicz statystyki twórcy
  const creatorStats = {
    totalCommunities: createdCommunities.length,
    totalMembers: createdCommunities.reduce((sum, community) => sum + community.totalMembers, 0),
    totalRevenue: createdCommunities.reduce((sum, community) => sum + parseFloat(community.balance || '0'), 0),
    averageMembers: createdCommunities.length > 0 ? 
      createdCommunities.reduce((sum, community) => sum + community.totalMembers, 0) / createdCommunities.length : 0
  };

  if (loadingData) {
    return (
      <div className="space-y-6">
        {/* Loading skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-white/5 rounded-2xl animate-pulse"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-white/5 rounded-2xl animate-pulse"></div>
          <div className="h-64 bg-white/5 rounded-2xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  // Jeśli użytkownik nie ma żadnych społeczności
  if (createdCommunities.length === 0) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold text-white mb-2">Creator Dashboard 🎨</h2>
          <p className="text-gray-300">
            Manage your communities, track performance, and grow your ecosystem
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center"
        >
          <div className="text-6xl mb-4">🏘️</div>
          <h3 className="text-xl font-bold text-white mb-2">Create Your First Community</h3>
          <p className="text-gray-400 mb-6">
            Start building your community today! Create a space for like-minded people to connect, 
            participate in events, and grow together.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="text-2xl mb-2">💰</div>
              <h4 className="font-semibold text-white">Earn Revenue</h4>
              <p className="text-sm text-gray-400">Set membership fees and earn from your community</p>
            </div>
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="text-2xl mb-2">🎪</div>
              <h4 className="font-semibold text-white">Host Events</h4>
              <p className="text-sm text-gray-400">Create engaging events for your members</p>
            </div>
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="text-2xl mb-2">👥</div>
              <h4 className="font-semibold text-white">Build Community</h4>
              <p className="text-sm text-gray-400">Foster connections and grow your network</p>
            </div>
          </div>

          <button className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold hover:from-purple-600 hover:to-pink-600 transition-all">
            Create Community
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Creator Dashboard 🎨</h2>
          <p className="text-gray-300">
            Welcome back! Here's what's happening with your communities
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm text-gray-400">Total Communities</div>
            <div className="text-2xl font-bold text-white">{createdCommunities.length}</div>
          </div>
          <button className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors">
            Create New
          </button>
        </div>
      </motion.div>

      {/* Creator Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl p-6 border border-purple-500/20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-2xl">🏘️</div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {creatorStats.totalCommunities}
              </div>
              <div className="text-sm text-gray-300">Communities</div>
            </div>
          </div>
          <div className="text-sm text-gray-400">Communities created</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-2xl p-6 border border-blue-500/20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-2xl">👥</div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {creatorStats.totalMembers}
              </div>
              <div className="text-sm text-gray-300">Members</div>
            </div>
          </div>
          <div className="text-sm text-gray-400">Across all communities</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl p-6 border border-green-500/20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-2xl">💰</div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {creatorStats.totalRevenue.toFixed(4)}
              </div>
              <div className="text-sm text-gray-300">ETH Revenue</div>
            </div>
          </div>
          <div className="text-sm text-gray-400">Total earned</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-2xl p-6 border border-orange-500/20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-2xl">📊</div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {Math.round(creatorStats.averageMembers)}
              </div>
              <div className="text-sm text-gray-300">Avg Members</div>
            </div>
          </div>
          <div className="text-sm text-gray-400">Per community</div>
        </motion.div>
      </div>

      {/* Community Selection */}
      {createdCommunities.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
        >
          <h3 className="text-lg font-bold text-white mb-4">Select Community</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {createdCommunities.map((community) => (
              <button
                key={community.id}
                onClick={() => setSelectedCommunity(community)}
                className={`p-4 rounded-xl border transition-all text-left ${
                  selectedCommunity?.id === community.id
                    ? 'border-purple-500 bg-purple-500/20'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <h4 className="font-semibold text-white mb-1">{community.name}</h4>
                <p className="text-sm text-gray-400 mb-2">{community.totalMembers} members</p>
                <p className="text-xs text-gray-500">{community.description}</p>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Main Dashboard Content */}
      {selectedCommunity && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Community Stats & Members */}
          <div className="lg:col-span-2 space-y-6">
            <CommunityStatsCard community={selectedCommunity} />
            <MemberManagementCard community={selectedCommunity} />
          </div>

          {/* Right Column - Financial & Events */}
          <div className="space-y-6">
            <FinancialOverview community={selectedCommunity} />
            <EventManagementCard community={selectedCommunity} />
            <RecentActivityCard community={selectedCommunity} />
          </div>
        </div>
      )}
    </div>
  );
} 