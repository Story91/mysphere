'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface SuccessStepProps {
  communityId: number | null;
  communityName: string;
}

export default function SuccessStep({ communityId, communityName }: SuccessStepProps) {
  const nextSteps = [
    {
      icon: '👥',
      title: 'Invite Members',
      description: 'Share your community with friends and start building your audience',
      action: 'Copy invite link'
    },
    {
      icon: '🎪',
      title: 'Create Your First Event',
      description: 'Engage your community with events, workshops, or competitions',
      action: 'Create event'
    },
    {
      icon: '⚙️',
      title: 'Customize Settings',
      description: 'Configure moderation, roles, and community rules',
      action: 'Open settings'
    },
    {
      icon: '📊',
      title: 'Track Analytics',
      description: 'Monitor your community growth and member engagement',
      action: 'View analytics'
    }
  ];

  const handleCopyInviteLink = () => {
    const inviteLink = `${window.location.origin}/spheres/join/${communityId}`;
    navigator.clipboard.writeText(inviteLink);
    // Toast notification will be handled by parent component
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Success Header */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 10 }}
          className="w-24 h-24 mx-auto mb-6 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center"
        >
          <span className="text-4xl">🎉</span>
        </motion.div>
        
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-3xl font-bold text-white mb-2"
        >
          Community Created Successfully!
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-gray-300 text-lg max-w-2xl mx-auto"
        >
          Congratulations! <strong className="text-green-400">{communityName}</strong> is now live and ready for members.
        </motion.p>
      </div>

      {/* Community Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl p-6 border border-green-500/20"
      >
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-xl">
              {communityName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-white">{communityName}</h3>
            <p className="text-gray-300">Community ID: #{communityId}</p>
          </div>
          <div className="text-right">
            <div className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-semibold">
              ✓ Active
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">0</div>
            <div className="text-sm text-gray-400">Members</div>
          </div>
          <div className="bg-white/10 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">0</div>
            <div className="text-sm text-gray-400">Events</div>
          </div>
          <div className="bg-white/10 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">0.0000</div>
            <div className="text-sm text-gray-400">ETH Revenue</div>
          </div>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
        className="bg-white/5 rounded-2xl p-6"
      >
        <h3 className="text-xl font-bold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={handleCopyInviteLink}
            className="p-4 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl border border-blue-500/20 hover:bg-blue-500/30 transition-all group"
          >
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🔗</span>
              <div className="text-left">
                <h4 className="text-white font-semibold group-hover:text-blue-400">Share Invite Link</h4>
                <p className="text-gray-400 text-sm">Copy link to invite members</p>
              </div>
            </div>
          </button>

          <button className="p-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl border border-purple-500/20 hover:bg-purple-500/30 transition-all group">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🎨</span>
              <div className="text-left">
                <h4 className="text-white font-semibold group-hover:text-purple-400">Customize Community</h4>
                <p className="text-gray-400 text-sm">Edit settings and appearance</p>
              </div>
            </div>
          </button>

          <button className="p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl border border-green-500/20 hover:bg-green-500/30 transition-all group">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🎪</span>
              <div className="text-left">
                <h4 className="text-white font-semibold group-hover:text-green-400">Create First Event</h4>
                <p className="text-gray-400 text-sm">Engage your community</p>
              </div>
            </div>
          </button>

          <button className="p-4 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-xl border border-orange-500/20 hover:bg-orange-500/30 transition-all group">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">📊</span>
              <div className="text-left">
                <h4 className="text-white font-semibold group-hover:text-orange-400">View Dashboard</h4>
                <p className="text-gray-400 text-sm">Monitor your community</p>
              </div>
            </div>
          </button>
        </div>
      </motion.div>

      {/* Next Steps */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl p-6 border border-blue-500/20"
      >
        <h3 className="text-xl font-bold text-white mb-4">🚀 Next Steps</h3>
        <div className="space-y-4">
          {nextSteps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.4 + index * 0.1 }}
              className="flex items-center space-x-4 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all"
            >
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <span className="text-xl">{step.icon}</span>
              </div>
              <div className="flex-1">
                <h4 className="text-white font-semibold">{step.title}</h4>
                <p className="text-gray-400 text-sm">{step.description}</p>
              </div>
              <button className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors">
                {step.action}
              </button>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Community Guidelines */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6 }}
        className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-2xl p-6 border border-yellow-500/20"
      >
        <h3 className="text-xl font-bold text-white mb-4">📋 Community Guidelines</h3>
        <div className="space-y-3 text-sm text-gray-300">
          <div className="flex items-start space-x-3">
            <span className="text-green-400">✓</span>
            <span>Keep your community active with regular events and content</span>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-green-400">✓</span>
            <span>Respond to member questions and maintain engagement</span>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-green-400">✓</span>
            <span>Use moderation tools to maintain a positive environment</span>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-green-400">✓</span>
            <span>Monitor your community analytics to understand member behavior</span>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-green-400">✓</span>
            <span>Regularly withdraw earnings and reinvest in community growth</span>
          </div>
        </div>
      </motion.div>

      {/* Support */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8 }}
        className="bg-white/5 rounded-2xl p-6 text-center"
      >
        <h3 className="text-xl font-bold text-white mb-4">Need Help?</h3>
        <p className="text-gray-300 mb-4">
          Check out our documentation or join our Discord community for support
        </p>
        <div className="flex justify-center space-x-4">
          <button className="px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-xl transition-colors">
            📚 Documentation
          </button>
          <button className="px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-xl transition-colors">
            💬 Discord Support
          </button>
        </div>
      </motion.div>

      {/* Final Action */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.0 }}
        className="flex justify-center space-x-4 pt-6"
      >
        <button className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl">
          🎯 Go to Creator Dashboard
        </button>
        <button className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-lg transition-all">
          🏠 Return to Home
        </button>
      </motion.div>
    </motion.div>
  );
} 