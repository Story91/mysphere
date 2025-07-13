'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import UserDashboard from './components/UserDashboard/UserDashboard';
import CommunityBrowser from './components/CommunityBrowser/CommunityBrowser';
import CreatorDashboard from './components/CreatorDashboard/CreatorDashboard';
import CreateCommunityForm from './components/CommunityCreation/CreateCommunityForm';
import { useSpheresContract } from './hooks/useSpheresContract';

export default function SpheresPage() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'browser' | 'create' | 'creator'>('dashboard');
  const { isLoading, error } = useSpheresContract();

  // Redirect to wallet connection if not connected
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
          <p className="text-gray-300 mb-4">Please connect your wallet to access Spheres</p>
          <p className="text-sm text-gray-400">Connect your wallet in the top navigation</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header Navigation */}
      <header className="sticky top-0 z-50 bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">S</span>
                </div>
                <h1 className="text-xl font-bold text-white">Spheres</h1>
              </div>
            </div>
            
            {/* Tab Navigation */}
            <nav className="flex space-x-1 bg-white/5 rounded-full p-1">
                          {[
              { id: 'dashboard', label: 'Dashboard', icon: '📊' },
              { id: 'browser', label: 'Browse', icon: '🔍' },
              { id: 'creator', label: 'Creator', icon: '🎨' },
              { id: 'create', label: 'Create', icon: '➕' }
            ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all ${
                    activeTab === tab.id
                      ? 'bg-purple-500 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span className="font-medium">{tab.label}</span>
                </button>
              ))}
            </nav>

            {/* User Info */}
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="text-sm text-gray-300">Connected</p>
                <p className="text-xs text-gray-400">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>
              <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">👤</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6"
          >
            <p className="text-red-400">Error: {error}</p>
          </motion.div>
        )}

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'dashboard' && <UserDashboard />}
          {activeTab === 'browser' && <CommunityBrowser />}
          {activeTab === 'creator' && <CreatorDashboard />}
          {activeTab === 'create' && <CreateCommunityForm />}
        </motion.div>
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