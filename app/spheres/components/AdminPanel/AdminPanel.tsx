'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { Shield, BarChart3, Settings, Users, AlertTriangle, Crown, DollarSign, Activity } from 'lucide-react';
import AdminDashboard from './AdminDashboard';
import AdminCommunityManagement from './AdminCommunityManagement';
import AdminUserManagement from './AdminUserManagement';
import AdminFeeManagement from './AdminFeeManagement';
import AdminSecurityPanel from './AdminSecurityPanel';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { useRouter } from 'next/navigation';

interface AdminPanelProps {
  className?: string;
}

const adminTabs = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: BarChart3,
    description: 'Platform statistics and overview',
    color: 'text-blue-400'
  },
  {
    id: 'communities',
    label: 'Communities',
    icon: Users,
    description: 'Manage communities and creators',
    color: 'text-green-400'
  },
  {
    id: 'users',
    label: 'Users',
    icon: Shield,
    description: 'User management and bans',
    color: 'text-purple-400'
  },
  {
    id: 'fees',
    label: 'Fees',
    icon: DollarSign,
    description: 'Platform fee configuration',
    color: 'text-yellow-400'
  },
  {
    id: 'security',
    label: 'Security',
    icon: AlertTriangle,
    description: 'Platform security controls',
    color: 'text-red-400'
  }
];

export default function AdminPanel({ className = '' }: AdminPanelProps) {
  const router = useRouter();
  const { address, isConnected, isAdmin, isPaused, isLoading } = useSpheresContract();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-8 bg-slate-800 rounded-2xl border border-slate-700"
        >
          <Crown className="mx-auto h-12 w-12 text-blue-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Admin Panel</h2>
          <p className="text-slate-400">Please connect your wallet to access admin features.</p>
        </motion.div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-8 bg-slate-800 rounded-2xl border border-slate-700"
        >
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You don't have permission to access this admin panel.</p>
          <p className="text-slate-500 text-sm mt-2">You need admin privileges to access this panel</p>
        </motion.div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <AdminDashboard />;
      case 'communities':
        return <AdminCommunityManagement />;
      case 'users':
        return <AdminUserManagement />;
      case 'fees':
        return <AdminFeeManagement />;
      case 'security':
        return <AdminSecurityPanel />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className={`min-h-screen bg-slate-900 ${className}`}>
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
              <div className="p-2 bg-blue-500 rounded-lg">
                <Crown className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
                <p className="text-slate-400">Platform administration and control</p>
              </div>
            </div>
            
            {/* Status indicator */}
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-green-400" />
              <span className="text-sm text-green-400">Platform Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="container mx-auto px-4">
          <nav className="flex space-x-8 overflow-x-auto">
            {adminTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-2 border-b-2 transition-colors relative ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="whitespace-nowrap font-medium">{tab.label}</span>
                  
                  {/* Active tab indicator */}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                      initial={false}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content Area */}
      <div className="container mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="relative"
          >
            {/* Tab description */}
            <div className="mb-6">
              <p className="text-slate-400">
                {adminTabs.find(tab => tab.id === activeTab)?.description}
              </p>
            </div>

            {/* Tab content */}
            <div className="space-y-6">
              {renderTabContent()}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
            <p className="text-slate-400 mt-2">Processing...</p>
          </div>
        </div>
      )}
    </div>
  );
} 