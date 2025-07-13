'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface CommunityFormData {
  name: string;
  description: string;
  category: string;
  tags: string[];
  joinFee: string;
  monthlyFee: string;
  lifetimeFee: string;
  isPublic: boolean;
  autoApprove: boolean;
  allowReferrals: boolean;
}

interface PreviewStepProps {
  formData: CommunityFormData;
  creationFee: string;
  isCreating: boolean;
  onSubmit: () => void;
}

export default function PreviewStep({ formData, creationFee, isCreating, onSubmit }: PreviewStepProps) {
  const categories = [
    { id: 'defi', name: 'DeFi & Finance', icon: '💰' },
    { id: 'nft', name: 'NFTs & Art', icon: '🎨' },
    { id: 'gaming', name: 'Gaming & Metaverse', icon: '🎮' },
    { id: 'technology', name: 'Technology & Dev', icon: '💻' },
    { id: 'education', name: 'Education & Learning', icon: '📚' },
    { id: 'business', name: 'Business & Entrepreneurship', icon: '💼' },
    { id: 'lifestyle', name: 'Lifestyle & Wellness', icon: '🌱' },
    { id: 'sports', name: 'Sports & Fitness', icon: '⚽' },
    { id: 'music', name: 'Music & Entertainment', icon: '🎵' },
    { id: 'crypto', name: 'Crypto & Blockchain', icon: '₿' },
    { id: 'dao', name: 'DAO & Governance', icon: '🏛️' },
    { id: 'other', name: 'Other', icon: '🔮' }
  ];

  const selectedCategory = categories.find(cat => cat.id === formData.category);

  const calculateTotalCost = () => {
    const creationFeeNum = parseFloat(creationFee) || 0;
    const transactionFee = creationFeeNum * 0.005; // 0.5% transaction fee
    return creationFeeNum + transactionFee;
  };

  const totalCost = calculateTotalCost();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Review Your Community</h2>
        <p className="text-gray-400">
          Please review all details before creating your community. This action cannot be undone.
        </p>
      </div>

      {/* Community Preview Card */}
      <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl p-6 border border-purple-500/20">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-xl">
              {formData.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-white">{formData.name}</h3>
            <div className="flex items-center space-x-2 text-gray-300">
              <span className="text-lg">{selectedCategory?.icon}</span>
              <span>{selectedCategory?.name}</span>
            </div>
          </div>
          <div className="text-right">
            <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
              formData.isPublic ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {formData.isPublic ? 'Public' : 'Private'}
            </div>
          </div>
        </div>

        <p className="text-gray-300 mb-4">{formData.description}</p>

        {formData.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {formData.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-white/10 text-white rounded-full text-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className={`p-3 rounded-xl ${
            formData.autoApprove ? 'bg-green-500/20 border border-green-500/20' : 'bg-gray-500/20 border border-gray-500/20'
          }`}>
            <div className="flex items-center space-x-2">
              <span className="text-lg">{formData.autoApprove ? '✅' : '❌'}</span>
              <span className="text-sm text-white">Auto-approve</span>
            </div>
          </div>
          <div className={`p-3 rounded-xl ${
            formData.allowReferrals ? 'bg-green-500/20 border border-green-500/20' : 'bg-gray-500/20 border border-gray-500/20'
          }`}>
            <div className="flex items-center space-x-2">
              <span className="text-lg">{formData.allowReferrals ? '✅' : '❌'}</span>
              <span className="text-sm text-white">Referrals</span>
            </div>
          </div>
          <div className={`p-3 rounded-xl ${
            formData.isPublic ? 'bg-green-500/20 border border-green-500/20' : 'bg-gray-500/20 border border-gray-500/20'
          }`}>
            <div className="flex items-center space-x-2">
              <span className="text-lg">{formData.isPublic ? '✅' : '❌'}</span>
              <span className="text-sm text-white">Public listing</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Summary */}
      <div className="bg-white/5 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">💰 Pricing Structure</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl p-4 border border-blue-500/20">
            <h4 className="text-white font-semibold mb-2">Join Fee</h4>
            <div className="text-2xl font-bold text-white">{formData.joinFee} ETH</div>
            <p className="text-gray-400 text-sm">One-time payment</p>
          </div>
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-4 border border-green-500/20">
            <h4 className="text-white font-semibold mb-2">Monthly Fee</h4>
            <div className="text-2xl font-bold text-white">{formData.monthlyFee} ETH</div>
            <p className="text-gray-400 text-sm">Recurring payment</p>
          </div>
          <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl p-4 border border-purple-500/20">
            <h4 className="text-white font-semibold mb-2">Lifetime Fee</h4>
            <div className="text-2xl font-bold text-white">{formData.lifetimeFee} ETH</div>
            <p className="text-gray-400 text-sm">One-time payment</p>
          </div>
        </div>
      </div>

      {/* Creation Cost */}
      <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-xl p-6 border border-orange-500/20">
        <h3 className="text-lg font-bold text-white mb-4">💸 Creation Cost</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Platform Creation Fee</span>
            <span className="text-white font-semibold">{creationFee} ETH</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Transaction Fee (0.5%)</span>
            <span className="text-white font-semibold">{(parseFloat(creationFee) * 0.005).toFixed(6)} ETH</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Estimated Gas Fee</span>
            <span className="text-white font-semibold">~0.002 ETH</span>
          </div>
          <div className="border-t border-white/10 pt-3">
            <div className="flex justify-between items-center">
              <span className="text-white font-bold">Total Cost</span>
              <span className="text-orange-400 font-bold text-lg">
                ~{(totalCost + 0.002).toFixed(6)} ETH
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Potential */}
      <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-6 border border-green-500/20">
        <h3 className="text-lg font-bold text-white mb-4">📈 Revenue Potential</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-white font-semibold mb-2">Break-even Analysis</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-400">Monthly members needed (monthly fee): </span>
                <span className="text-green-400 font-semibold">
                  {formData.monthlyFee !== '0' ? Math.ceil(totalCost / parseFloat(formData.monthlyFee)) : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Lifetime members needed: </span>
                <span className="text-green-400 font-semibold">
                  {formData.lifetimeFee !== '0' ? Math.ceil(totalCost / parseFloat(formData.lifetimeFee)) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-2">Monthly Projections</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-400">10 members: </span>
                <span className="text-green-400 font-semibold">
                  {((parseFloat(formData.joinFee) + parseFloat(formData.monthlyFee)) * 10).toFixed(4)} ETH
                </span>
              </div>
              <div>
                <span className="text-gray-400">50 members: </span>
                <span className="text-green-400 font-semibold">
                  {((parseFloat(formData.joinFee) + parseFloat(formData.monthlyFee)) * 50).toFixed(4)} ETH
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl p-6 border border-blue-500/20">
        <h3 className="text-lg font-bold text-white mb-4">📋 Terms & Conditions</h3>
        <div className="space-y-3 text-sm text-gray-300">
          <div className="flex items-start space-x-3">
            <span className="text-green-400">✓</span>
            <span>You will be the owner and admin of this community</span>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-green-400">✓</span>
            <span>You can modify pricing and settings after creation</span>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-green-400">✓</span>
            <span>Platform takes 2.5% of membership fees</span>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-green-400">✓</span>
            <span>You can withdraw earnings with 1% fee</span>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-yellow-400">⚠️</span>
            <span>Community creation cannot be undone</span>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-yellow-400">⚠️</span>
            <span>All transactions are final and irreversible</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4 pt-6">
        <button
          onClick={onSubmit}
          disabled={isCreating}
          className={`px-8 py-4 rounded-xl font-bold text-lg transition-all ${
            isCreating
              ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg hover:shadow-xl'
          }`}
        >
          {isCreating ? (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Creating Community...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span>🚀</span>
              <span>Create Community</span>
            </div>
          )}
        </button>
      </div>

      {/* Warning */}
      <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl p-4 border border-yellow-500/20">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-yellow-400">⚠️</span>
          <span className="text-yellow-400 font-semibold">Important Notice</span>
        </div>
        <p className="text-gray-300 text-sm">
          Once you create your community, you'll be charged the creation fee and the community will be live immediately. 
          Make sure all information is correct before proceeding.
        </p>
      </div>
    </motion.div>
  );
} 