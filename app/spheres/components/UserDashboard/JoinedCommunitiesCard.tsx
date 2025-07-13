'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { formatEther } from 'viem';

interface JoinedCommunitiesCardProps {
  communities: any[];
}

export default function JoinedCommunitiesCard({ communities }: JoinedCommunitiesCardProps) {
  // Funkcja do formatowania daty wygaśnięcia subskrypcji
  const formatExpirationDate = (timestamp: number) => {
    if (timestamp === 0) return 'Never';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
  };

  // Sprawdź czy subskrypcja jest aktywna
  const isSubscriptionActive = (expiresAt: number, lifetime: boolean) => {
    if (lifetime) return true;
    return expiresAt > Date.now() / 1000;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">Your Communities</h3>
        <div className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-semibold">
          {communities.length} Joined
        </div>
      </div>

      {communities.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">🏘️</div>
          <h4 className="text-lg font-semibold text-white mb-2">No Communities Yet</h4>
          <p className="text-gray-400 mb-4">
            Join your first community to start earning rewards and participating in events
          </p>
          <button className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors">
            Browse Communities
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {communities.map((community, index) => (
            <motion.div
              key={community.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-white/20 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-white mb-1">{community.name}</h4>
                  <p className="text-sm text-gray-400 line-clamp-2">{community.description}</p>
                </div>
                <div className="ml-4">
                  <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    isSubscriptionActive(community.memberDetails.subscriptionExpiresAt, community.memberDetails.lifetime)
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {community.memberDetails.lifetime ? 'Lifetime' : 
                     isSubscriptionActive(community.memberDetails.subscriptionExpiresAt, community.memberDetails.lifetime) 
                       ? 'Active' : 'Expired'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-purple-400">
                    {community.memberDetails.level}
                  </div>
                  <div className="text-xs text-gray-400">Level</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-400">
                    {community.memberDetails.respectPoints}
                  </div>
                  <div className="text-xs text-gray-400">Respect</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-400">
                    {community.memberDetails.totalEventsParticipated}
                  </div>
                  <div className="text-xs text-gray-400">Events</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-400">
                    {community.memberDetails.currentStreak}
                  </div>
                  <div className="text-xs text-gray-400">Streak</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-4">
                  <span className="text-gray-400">
                    Members: <span className="text-white">{community.totalMembers}</span>
                  </span>
                  <span className="text-gray-400">
                    Join Fee: <span className="text-white">{formatEther(community.joinFeeEth)} ETH</span>
                  </span>
                </div>
                <div className="text-gray-400">
                  {community.memberDetails.lifetime ? 'Lifetime Member' : 
                   `Expires: ${formatExpirationDate(community.memberDetails.subscriptionExpiresAt)}`}
                </div>
              </div>

              {/* Mentor info */}
              {community.memberDetails.mentorAddress && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="text-yellow-400">👨‍🏫</span>
                    <span className="text-gray-400">Mentor:</span>
                    <span className="text-white font-mono text-xs">
                      {community.memberDetails.mentorAddress.slice(0, 6)}...
                      {community.memberDetails.mentorAddress.slice(-4)}
                    </span>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="mt-4 flex space-x-2">
                <button className="flex-1 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm font-medium transition-colors">
                  View Details
                </button>
                <button className="flex-1 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-colors">
                  Join Events
                </button>
                {!community.memberDetails.lifetime && !isSubscriptionActive(community.memberDetails.subscriptionExpiresAt, community.memberDetails.lifetime) && (
                  <button className="flex-1 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors">
                    Renew
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
} 