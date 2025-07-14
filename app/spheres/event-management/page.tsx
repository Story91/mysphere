'use client';

import React from 'react';
import { useAccount } from 'wagmi';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import EventManagement from '../components/EventManagement/EventManagement';

export default function EventManagementPage() {
  const { address, isConnected } = useAccount();

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
          <p className="text-gray-300 mb-4">Please connect your wallet to access Event Management</p>
          <p className="text-sm text-gray-400">Connect your wallet in the top navigation</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <EventManagement 
          communityId="1"
          currentUserAddress={address || ''}
          isCreator={true}
        />
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