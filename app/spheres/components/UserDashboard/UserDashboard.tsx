'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import UserProgressCard from './UserProgressCard';
import JoinedCommunitiesCard from './JoinedCommunitiesCard';
import ActivityOverview from './ActivityOverview';
import QuickActions from './QuickActions';

export default function UserDashboard() {
  const { address } = useAccount();
  const { 
    getAllCommunities, 
    getMemberDetails, 
    platformStats, 
    isLoading 
  } = useSpheresContract();

  const [userCommunities, setUserCommunities] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<any>(null);
  const [loadingUserData, setLoadingUserData] = useState(true);

  // Ładowanie danych użytkownika
  useEffect(() => {
    const loadUserData = async () => {
      if (!address) return;
      
      setLoadingUserData(true);
      try {
        // Pobierz wszystkie społeczności
        const allCommunities = await getAllCommunities();
        
        // Sprawdź członkostwo w każdej społeczności
        const membershipPromises = allCommunities.map(async (community: any) => {
          const memberDetails = await getMemberDetails(community.id, address);
          return memberDetails ? { ...community, memberDetails } : null;
        });
        
        const memberships = await Promise.all(membershipPromises);
        const joinedCommunities = memberships.filter(Boolean);
        
        setUserCommunities(joinedCommunities);
        
        // Oblicz statystyki użytkownika
        const totalRespectPoints = joinedCommunities.reduce((sum, community) => 
          sum + (community.memberDetails?.respectPoints || 0), 0);
        const totalEventsParticipated = joinedCommunities.reduce((sum, community) => 
          sum + (community.memberDetails?.totalEventsParticipated || 0), 0);
        const averageLevel = joinedCommunities.length > 0 ? 
          joinedCommunities.reduce((sum, community) => sum + (community.memberDetails?.level || 0), 0) / joinedCommunities.length : 0;
        
        setUserStats({
          totalRespectPoints,
          totalEventsParticipated,
          averageLevel: Math.round(averageLevel * 10) / 10,
          communitiesJoined: joinedCommunities.length,
          totalSpent: joinedCommunities.reduce((sum, community) => 
            sum + (community.memberDetails?.totalSpent || 0), 0)
        });
        
      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        setLoadingUserData(false);
      }
    };

    loadUserData();
  }, [address, getAllCommunities, getMemberDetails]);

  if (loadingUserData) {
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

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h2 className="text-3xl font-bold text-white mb-2">
          Welcome to Spheres! 🌟
        </h2>
        <p className="text-gray-300 max-w-2xl mx-auto">
          Manage your communities, track your progress, and engage with the ecosystem
        </p>
      </motion.div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl p-6 border border-purple-500/20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-2xl">🏆</div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {userStats?.totalRespectPoints || 0}
              </div>
              <div className="text-sm text-gray-300">Respect Points</div>
            </div>
          </div>
          <div className="text-sm text-gray-400">Total earned across communities</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-2xl p-6 border border-blue-500/20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-2xl">🏘️</div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {userStats?.communitiesJoined || 0}
              </div>
              <div className="text-sm text-gray-300">Communities</div>
            </div>
          </div>
          <div className="text-sm text-gray-400">Active memberships</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl p-6 border border-green-500/20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-2xl">🎪</div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {userStats?.totalEventsParticipated || 0}
              </div>
              <div className="text-sm text-gray-300">Events</div>
            </div>
          </div>
          <div className="text-sm text-gray-400">Total participated</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-2xl p-6 border border-orange-500/20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-2xl">📈</div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {userStats?.averageLevel || 0}
              </div>
              <div className="text-sm text-gray-300">Avg Level</div>
            </div>
          </div>
          <div className="text-sm text-gray-400">Across all communities</div>
        </motion.div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Progress & Communities */}
        <div className="lg:col-span-2 space-y-6">
          <UserProgressCard userStats={userStats} />
          <JoinedCommunitiesCard communities={userCommunities} />
        </div>

        {/* Right Column - Activity & Actions */}
        <div className="space-y-6">
          <QuickActions />
          <ActivityOverview userStats={userStats} />
        </div>
      </div>

      {/* Platform Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
      >
        <h3 className="text-xl font-bold text-white mb-4">Platform Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">
              {platformStats?.totalCommunities || 0}
            </div>
            <div className="text-sm text-gray-400">Total Communities</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">
              {platformStats?.totalMembers || 0}
            </div>
            <div className="text-sm text-gray-400">Total Members</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              {platformStats?.activeCommunities || 0}
            </div>
            <div className="text-sm text-gray-400">Active Communities</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">
              {platformStats?.totalTransactions || 0}
            </div>
            <div className="text-sm text-gray-400">Total Transactions</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 