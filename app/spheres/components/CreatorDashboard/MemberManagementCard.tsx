'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface MemberManagementCardProps {
  community: {
    id: number;
    name: string;
    totalMembers: number;
  };
}

export default function MemberManagementCard({ community }: MemberManagementCardProps) {
  const [selectedMemberType, setSelectedMemberType] = useState<'all' | 'active' | 'inactive' | 'vip'>('all');
  
  // Symulowane dane członków (w rzeczywistej aplikacji będą pobierane z API)
  const memberData = [
    {
      id: 1,
      address: '0x1234567890abcdef1234567890abcdef12345678',
      level: 3,
      respectPoints: 1250,
      joinedDate: '2024-01-15',
      lastActive: '2 hours ago',
      role: 'member',
      isLifetime: false,
      subscriptionExpires: '2024-02-15',
      totalSpent: 0.05,
      eventsParticipated: 8,
      currentStreak: 5,
      status: 'active'
    },
    {
      id: 2,
      address: '0xabcdef1234567890abcdef1234567890abcdef12',
      level: 5,
      respectPoints: 3500,
      joinedDate: '2024-01-10',
      lastActive: '1 day ago',
      role: 'moderator',
      isLifetime: true,
      subscriptionExpires: null,
      totalSpent: 0.15,
      eventsParticipated: 15,
      currentStreak: 12,
      status: 'active'
    },
    {
      id: 3,
      address: '0x9876543210fedcba9876543210fedcba98765432',
      level: 1,
      respectPoints: 350,
      joinedDate: '2024-01-20',
      lastActive: '5 days ago',
      role: 'member',
      isLifetime: false,
      subscriptionExpires: '2024-02-20',
      totalSpent: 0.02,
      eventsParticipated: 2,
      currentStreak: 0,
      status: 'inactive'
    }
  ];

  const filteredMembers = memberData.filter(member => {
    switch (selectedMemberType) {
      case 'active':
        return member.status === 'active';
      case 'inactive':
        return member.status === 'inactive';
      case 'vip':
        return member.isLifetime || member.level >= 4;
      default:
        return true;
    }
  });

  const memberStats = {
    totalMembers: memberData.length,
    activeMembers: memberData.filter(m => m.status === 'active').length,
    lifetimeMembers: memberData.filter(m => m.isLifetime).length,
    moderators: memberData.filter(m => m.role === 'moderator').length
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">Member Management</h3>
        <div className="flex items-center space-x-2">
          <button className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors">
            Export CSV
          </button>
          <button className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm transition-colors">
            Add Member
          </button>
        </div>
      </div>

      {/* Member Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center p-3 bg-white/5 rounded-xl">
          <div className="text-lg font-bold text-blue-400">{memberStats.totalMembers}</div>
          <div className="text-xs text-gray-400">Total</div>
        </div>
        <div className="text-center p-3 bg-white/5 rounded-xl">
          <div className="text-lg font-bold text-green-400">{memberStats.activeMembers}</div>
          <div className="text-xs text-gray-400">Active</div>
        </div>
        <div className="text-center p-3 bg-white/5 rounded-xl">
          <div className="text-lg font-bold text-purple-400">{memberStats.lifetimeMembers}</div>
          <div className="text-xs text-gray-400">Lifetime</div>
        </div>
        <div className="text-center p-3 bg-white/5 rounded-xl">
          <div className="text-lg font-bold text-orange-400">{memberStats.moderators}</div>
          <div className="text-xs text-gray-400">Moderators</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-1 bg-white/5 rounded-full p-1 mb-6">
        {[
          { id: 'all', label: 'All Members', count: memberStats.totalMembers },
          { id: 'active', label: 'Active', count: memberStats.activeMembers },
          { id: 'inactive', label: 'Inactive', count: memberStats.totalMembers - memberStats.activeMembers },
          { id: 'vip', label: 'VIP', count: memberStats.lifetimeMembers }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedMemberType(tab.id as any)}
            className={`flex items-center space-x-2 px-3 py-2 rounded-full transition-all text-sm ${
              selectedMemberType === tab.id
                ? 'bg-purple-500 text-white'
                : 'text-gray-300 hover:bg-white/10'
            }`}
          >
            <span>{tab.label}</span>
            <span className="text-xs opacity-70">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Member List */}
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {filteredMembers.map((member, index) => (
          <motion.div
            key={member.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">{member.level}</span>
                </div>
                <div>
                  <div className="font-mono text-sm text-white">{formatAddress(member.address)}</div>
                  <div className="text-xs text-gray-400">
                    Joined {formatDate(member.joinedDate)} • Last active {member.lastActive}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  member.role === 'moderator' ? 'bg-orange-500/20 text-orange-400' :
                  member.isLifetime ? 'bg-purple-500/20 text-purple-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {member.role === 'moderator' ? 'Moderator' : 
                   member.isLifetime ? 'Lifetime' : 'Member'}
                </div>
                <div className={`w-3 h-3 rounded-full ${
                  member.status === 'active' ? 'bg-green-500' : 'bg-gray-500'
                }`} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
              <div className="text-center">
                <div className="text-sm font-bold text-purple-400">{member.respectPoints}</div>
                <div className="text-xs text-gray-400">Respect</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-green-400">{member.eventsParticipated}</div>
                <div className="text-xs text-gray-400">Events</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-blue-400">{member.totalSpent.toFixed(3)}</div>
                <div className="text-xs text-gray-400">ETH Spent</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-orange-400">{member.currentStreak}</div>
                <div className="text-xs text-gray-400">Streak</div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">
                {member.isLifetime ? 'Lifetime member' : 
                 `Subscription expires: ${formatDate(member.subscriptionExpires!)}`}
              </div>
              <div className="flex space-x-2">
                <button className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs transition-colors">
                  View
                </button>
                <button className="px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs transition-colors">
                  Message
                </button>
                {member.role === 'member' && (
                  <button className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-xs transition-colors">
                    Promote
                  </button>
                )}
                <button className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs transition-colors">
                  Ban
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <h4 className="text-sm font-semibold text-white mb-3">Quick Actions</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <button className="p-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors">
            Mass Message
          </button>
          <button className="p-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm transition-colors">
            Create Event
          </button>
          <button className="p-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors">
            Member Analytics
          </button>
        </div>
      </div>
    </motion.div>
  );
} 