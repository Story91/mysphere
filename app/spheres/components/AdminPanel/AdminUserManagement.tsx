'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, UserX, User, Shield, AlertTriangle, CheckCircle, Clock, Ban, UnlockKeyhole } from 'lucide-react';

interface BannedUser {
  address: string;
  reason: string;
  bannedAt: string;
  bannedBy: string;
  isGlobalBan: boolean;
  communities: string[];
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  globalBans: number;
  communityBans: number;
}

const mockBannedUsers: BannedUser[] = [
  {
    address: "0x1234567890123456789012345678901234567890",
    reason: "Spamming multiple communities",
    bannedAt: "2024-01-20T10:30:00Z",
    bannedBy: "Admin",
    isGlobalBan: true,
    communities: ["Crypto Builders", "NFT Artists Hub", "DeFi Traders"]
  },
  {
    address: "0x9876543210987654321098765432109876543210",
    reason: "Harassment and toxic behavior",
    bannedAt: "2024-01-19T15:45:00Z",
    bannedBy: "Admin",
    isGlobalBan: true,
    communities: ["Gaming Community", "Art Collective"]
  },
  {
    address: "0x5555555555555555555555555555555555555555",
    reason: "Scamming attempts",
    bannedAt: "2024-01-18T09:15:00Z",
    bannedBy: "Admin",
    isGlobalBan: true,
    communities: ["DeFi Traders", "Crypto Builders"]
  }
];

const mockUserStats: UserStats = {
  totalUsers: 1337,
  activeUsers: 1284,
  globalBans: 3,
  communityBans: 15
};

export default function AdminUserManagement() {
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>(mockBannedUsers);
  const [userStats, setUserStats] = useState<UserStats>(mockUserStats);
  const [searchTerm, setSearchTerm] = useState('');
  const [banType, setBanType] = useState<'ALL' | 'GLOBAL' | 'COMMUNITY'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showUnbanModal, setShowUnbanModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<BannedUser | null>(null);
  const [newBanData, setNewBanData] = useState({
    address: '',
    reason: '',
    isGlobalBan: true
  });

  // Filter banned users based on search and ban type
  const filteredBannedUsers = bannedUsers.filter(user => {
    const matchesSearch = user.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.reason.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBanType = banType === 'ALL' || 
                          (banType === 'GLOBAL' && user.isGlobalBan) ||
                          (banType === 'COMMUNITY' && !user.isGlobalBan);
    return matchesSearch && matchesBanType;
  });

  const handleGlobalBan = async (address: string, reason: string) => {
    setIsLoading(true);
    try {
      // TODO: Implement actual contract call to globalBanUser()
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newBan: BannedUser = {
        address,
        reason,
        bannedAt: new Date().toISOString(),
        bannedBy: "Admin",
        isGlobalBan: true,
        communities: []
      };
      
      setBannedUsers(prev => [...prev, newBan]);
      setUserStats(prev => ({ ...prev, globalBans: prev.globalBans + 1 }));
      setShowBanModal(false);
      setNewBanData({ address: '', reason: '', isGlobalBan: true });
      
      // TODO: Show success toast
      console.log('User globally banned');
    } catch (error) {
      console.error('Error banning user:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const handleGlobalUnban = async (address: string) => {
    setIsLoading(true);
    try {
      // TODO: Implement actual contract call to globalUnbanUser()
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setBannedUsers(prev => prev.filter(user => user.address !== address));
      setUserStats(prev => ({ ...prev, globalBans: prev.globalBans - 1 }));
      setShowUnbanModal(false);
      setSelectedUser(null);
      
      // TODO: Show success toast
      console.log('User globally unbanned');
    } catch (error) {
      console.error('Error unbanning user:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const statCards = [
    {
      title: 'Total Users',
      value: userStats.totalUsers,
      icon: User,
      color: 'bg-blue-500',
      change: '+12',
      changeType: 'positive'
    },
    {
      title: 'Active Users',
      value: userStats.activeUsers,
      icon: CheckCircle,
      color: 'bg-green-500',
      change: '+8',
      changeType: 'positive'
    },
    {
      title: 'Global Bans',
      value: userStats.globalBans,
      icon: Ban,
      color: 'bg-red-500',
      change: '+1',
      changeType: 'negative'
    },
    {
      title: 'Community Bans',
      value: userStats.communityBans,
      icon: Shield,
      color: 'bg-orange-500',
      change: '-2',
      changeType: 'positive'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">User Management</h2>
        <button
          onClick={() => setShowBanModal(true)}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center space-x-2"
        >
          <UserX className="h-4 w-4" />
          <span>Ban User</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-800 rounded-xl p-6 border border-slate-700"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${card.color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className={`text-sm font-medium ${
                  card.changeType === 'positive' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {card.change}
                </div>
              </div>
              <h3 className="text-slate-400 text-sm font-medium mb-1">{card.title}</h3>
              <p className="text-2xl font-bold text-white">{card.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by address or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        
        <select
          value={banType}
          onChange={(e) => setBanType(e.target.value as any)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">All Bans</option>
          <option value="GLOBAL">Global Bans</option>
          <option value="COMMUNITY">Community Bans</option>
        </select>
      </div>

      {/* Banned Users List */}
      <div className="space-y-4">
        {filteredBannedUsers.map((user, index) => (
          <motion.div
            key={user.address}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-slate-800 rounded-xl p-6 border border-slate-700"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-mono text-white">{formatAddress(user.address)}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${
                    user.isGlobalBan 
                      ? 'text-red-400 bg-red-400/10' 
                      : 'text-orange-400 bg-orange-400/10'
                  }`}>
                    <Ban className="h-3 w-3" />
                    <span>{user.isGlobalBan ? 'Global Ban' : 'Community Ban'}</span>
                  </span>
                </div>
                
                <p className="text-slate-400 text-sm mb-3">{user.reason}</p>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Banned At:</span>
                    <p className="text-white">{formatDate(user.bannedAt)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Banned By:</span>
                    <p className="text-white">{user.bannedBy}</p>
                  </div>
                </div>
                
                {user.communities.length > 0 && (
                  <div className="mt-3">
                    <span className="text-slate-500 text-sm">Affected Communities:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {user.communities.map((community, idx) => (
                        <span key={idx} className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded">
                          {community}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => {
                    setSelectedUser(user);
                    setShowUnbanModal(true);
                  }}
                  className="p-2 bg-green-500 hover:bg-green-600 rounded-lg transition-colors"
                  title="Unban User"
                >
                  <UnlockKeyhole className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      {filteredBannedUsers.length === 0 && (
        <div className="text-center py-12">
          <Shield className="mx-auto h-12 w-12 text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-400">No banned users found</h3>
          <p className="text-slate-500">Try adjusting your search or filters</p>
        </div>
      )}

      {/* Ban Modal */}
      {showBanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full mx-4"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Ban User</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  User Address
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={newBanData.address}
                  onChange={(e) => setNewBanData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Reason for Ban
                </label>
                <textarea
                  placeholder="Describe the reason for this ban..."
                  value={newBanData.reason}
                  onChange={(e) => setNewBanData(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 h-24 resize-none"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="globalBan"
                  checked={newBanData.isGlobalBan}
                  onChange={(e) => setNewBanData(prev => ({ ...prev, isGlobalBan: e.target.checked }))}
                  className="rounded border-slate-600 text-blue-500"
                />
                <label htmlFor="globalBan" className="text-sm text-slate-400">
                  Global ban (affects all communities)
                </label>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setNewBanData({ address: '', reason: '', isGlobalBan: true });
                }}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleGlobalBan(newBanData.address, newBanData.reason)}
                disabled={isLoading || !newBanData.address || !newBanData.reason}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Banning...' : 'Ban User'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Unban Modal */}
      {showUnbanModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full mx-4"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Unban User</h3>
            
            <div className="mb-4">
              <p className="text-slate-400">Are you sure you want to unban this user?</p>
              <div className="mt-3 p-3 bg-slate-700 rounded-lg">
                <p className="text-white font-mono">{formatAddress(selectedUser.address)}</p>
                <p className="text-slate-400 text-sm mt-1">{selectedUser.reason}</p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowUnbanModal(false);
                  setSelectedUser(null);
                }}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleGlobalUnban(selectedUser.address)}
                disabled={isLoading}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Unbanning...' : 'Unban User'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
} 