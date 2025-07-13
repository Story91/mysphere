'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Eye, Pause, Play, Settings, Users, DollarSign, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';

interface Community {
  id: number;
  name: string;
  creator: string;
  description: string;
  totalMembers: number;
  balance: string;
  joinFee: string;
  monthlyFee: string;
  lifetimeFee: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  createdAt: string;
  platformFeePercentage: number;
}

const mockCommunities: Community[] = [
  {
    id: 1,
    name: "Crypto Builders",
    creator: "0x1234...5678",
    description: "A community for crypto developers and builders",
    totalMembers: 156,
    balance: "12.5 ETH",
    joinFee: "0.01 ETH",
    monthlyFee: "0.005 ETH",
    lifetimeFee: "0.1 ETH",
    status: "ACTIVE",
    createdAt: "2024-01-15",
    platformFeePercentage: 25
  },
  {
    id: 2,
    name: "NFT Artists Hub",
    creator: "0x9876...5432",
    description: "Creative space for NFT artists and collectors",
    totalMembers: 89,
    balance: "8.3 ETH",
    joinFee: "0.02 ETH",
    monthlyFee: "0.01 ETH",
    lifetimeFee: "0.15 ETH",
    status: "ACTIVE",
    createdAt: "2024-01-20",
    platformFeePercentage: 25
  },
  {
    id: 3,
    name: "DeFi Traders",
    creator: "0x5555...1111",
    description: "Community for DeFi trading strategies and tips",
    totalMembers: 234,
    balance: "18.7 ETH",
    joinFee: "0.015 ETH",
    monthlyFee: "0.008 ETH",
    lifetimeFee: "0.12 ETH",
    status: "SUSPENDED",
    createdAt: "2024-01-10",
    platformFeePercentage: 30
  }
];

export default function AdminCommunityManagement() {
  const [communities, setCommunities] = useState<Community[]>(mockCommunities);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED'>('ALL');
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [newFeePercentage, setNewFeePercentage] = useState(25);

  // Filter communities based on search and status
  const filteredCommunities = communities.filter(community => {
    const matchesSearch = community.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         community.creator.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || community.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSuspendCommunity = async (communityId: number) => {
    setIsLoading(true);
    try {
      // TODO: Implement actual contract call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setCommunities(prev => 
        prev.map(community => 
          community.id === communityId 
            ? { ...community, status: 'SUSPENDED' as const }
            : community
        )
      );
      
      // TODO: Show success toast
      console.log('Community suspended');
    } catch (error) {
      console.error('Error suspending community:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const handleReactivateCommunity = async (communityId: number) => {
    setIsLoading(true);
    try {
      // TODO: Implement actual contract call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setCommunities(prev => 
        prev.map(community => 
          community.id === communityId 
            ? { ...community, status: 'ACTIVE' as const }
            : community
        )
      );
      
      // TODO: Show success toast
      console.log('Community reactivated');
    } catch (error) {
      console.error('Error reactivating community:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePlatformFee = async (communityId: number, newFee: number) => {
    setIsLoading(true);
    try {
      // TODO: Implement actual contract call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setCommunities(prev => 
        prev.map(community => 
          community.id === communityId 
            ? { ...community, platformFeePercentage: newFee }
            : community
        )
      );
      
      setShowFeeModal(false);
      setSelectedCommunity(null);
      
      // TODO: Show success toast
      console.log('Platform fee updated');
    } catch (error) {
      console.error('Error updating platform fee:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-400 bg-green-400/10';
      case 'SUSPENDED': return 'text-yellow-400 bg-yellow-400/10';
      case 'CLOSED': return 'text-red-400 bg-red-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE': return <CheckCircle className="h-4 w-4" />;
      case 'SUSPENDED': return <Pause className="h-4 w-4" />;
      case 'CLOSED': return <AlertTriangle className="h-4 w-4" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Community Management</h2>
        <div className="text-sm text-slate-400">
          Total Communities: {communities.length}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search communities or creators..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {/* Communities List */}
      <div className="space-y-4">
        {filteredCommunities.map((community, index) => (
          <motion.div
            key={community.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-slate-600 transition-all duration-200"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-semibold text-white">{community.name}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getStatusColor(community.status)}`}>
                    {getStatusIcon(community.status)}
                    <span>{community.status}</span>
                  </span>
                </div>
                
                <p className="text-slate-400 text-sm mb-3">{community.description}</p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Creator:</span>
                    <p className="text-white font-mono">{community.creator}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Members:</span>
                    <p className="text-white">{community.totalMembers}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Balance:</span>
                    <p className="text-green-400 font-medium">{community.balance}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Platform Fee:</span>
                    <p className="text-blue-400 font-medium">{community.platformFeePercentage / 10}%</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                  <div>
                    <span className="text-slate-500">Join Fee:</span>
                    <p className="text-white">{community.joinFee}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Monthly:</span>
                    <p className="text-white">{community.monthlyFee}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Lifetime:</span>
                    <p className="text-white">{community.lifetimeFee}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => {
                    setSelectedCommunity(community);
                    setNewFeePercentage(community.platformFeePercentage);
                    setShowFeeModal(true);
                  }}
                  className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                  title="Update Platform Fee"
                >
                  <Settings className="h-4 w-4 text-white" />
                </button>
                
                {community.status === 'ACTIVE' ? (
                  <button
                    onClick={() => handleSuspendCommunity(community.id)}
                    disabled={isLoading}
                    className="p-2 bg-yellow-500 hover:bg-yellow-600 rounded-lg transition-colors disabled:opacity-50"
                    title="Suspend Community"
                  >
                    <Pause className="h-4 w-4 text-white" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleReactivateCommunity(community.id)}
                    disabled={isLoading}
                    className="p-2 bg-green-500 hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50"
                    title="Reactivate Community"
                  >
                    <Play className="h-4 w-4 text-white" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      {filteredCommunities.length === 0 && (
        <div className="text-center py-12">
          <Users className="mx-auto h-12 w-12 text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-400">No communities found</h3>
          <p className="text-slate-500">Try adjusting your search or filters</p>
        </div>
      )}

      {/* Fee Modal */}
      {showFeeModal && selectedCommunity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full mx-4"
          >
            <h3 className="text-lg font-semibold text-white mb-4">
              Update Platform Fee
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Community: {selectedCommunity.name}
              </label>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Platform Fee Percentage (current: {selectedCommunity.platformFeePercentage / 10}%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="5"
                value={newFeePercentage}
                onChange={(e) => setNewFeePercentage(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Fee will be {newFeePercentage / 10}% of community revenue
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowFeeModal(false);
                  setSelectedCommunity(null);
                }}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdatePlatformFee(selectedCommunity.id, newFeePercentage)}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Updating...' : 'Update Fee'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
} 