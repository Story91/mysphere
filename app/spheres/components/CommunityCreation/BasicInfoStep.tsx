'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface CommunityFormData {
  name: string;
  description: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  autoApprove: boolean;
  allowReferrals: boolean;
}

interface BasicInfoStepProps {
  formData: CommunityFormData;
  updateFormData: (updates: Partial<CommunityFormData>) => void;
  errors: Partial<CommunityFormData>;
}

export default function BasicInfoStep({ formData, updateFormData, errors }: BasicInfoStepProps) {
  const [newTag, setNewTag] = useState('');

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

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim()) && formData.tags.length < 5) {
      updateFormData({
        tags: [...formData.tags, newTag.trim()]
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    updateFormData({
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Basic Information</h2>
        <p className="text-gray-400">
          Tell us about your community. This information will be visible to potential members.
        </p>
      </div>

      {/* Community Name */}
      <div>
        <label className="block text-sm font-semibold text-white mb-2">
          Community Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => updateFormData({ name: e.target.value })}
          placeholder="Enter your community name"
          className={`w-full px-4 py-3 bg-white/10 border-2 rounded-xl text-white placeholder-gray-400 focus:outline-none transition-all ${
            errors.name ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
          }`}
          maxLength={50}
        />
        {errors.name && (
          <p className="text-red-400 text-sm mt-1">{errors.name}</p>
        )}
        <p className="text-gray-400 text-sm mt-1">
          {formData.name.length}/50 characters
        </p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-white mb-2">
          Description <span className="text-red-400">*</span>
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => updateFormData({ description: e.target.value })}
          placeholder="Describe what your community is about, what members can expect, and what makes it special..."
          rows={4}
          className={`w-full px-4 py-3 bg-white/10 border-2 rounded-xl text-white placeholder-gray-400 focus:outline-none transition-all resize-none ${
            errors.description ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
          }`}
          maxLength={500}
        />
        {errors.description && (
          <p className="text-red-400 text-sm mt-1">{errors.description}</p>
        )}
        <p className="text-gray-400 text-sm mt-1">
          {formData.description.length}/500 characters
        </p>
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-semibold text-white mb-2">
          Category <span className="text-red-400">*</span>
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => updateFormData({ category: category.id })}
              className={`p-3 rounded-xl border-2 transition-all text-left ${
                formData.category === category.id
                  ? 'border-purple-500 bg-purple-500/20 text-white'
                  : 'border-white/20 bg-white/5 text-gray-300 hover:border-white/30 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="text-lg">{category.icon}</span>
                <span className="text-sm font-medium">{category.name}</span>
              </div>
            </button>
          ))}
        </div>
        {errors.category && (
          <p className="text-red-400 text-sm mt-1">{errors.category}</p>
        )}
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-semibold text-white mb-2">
          Tags <span className="text-gray-400">(Optional, max 5)</span>
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {formData.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="ml-2 text-purple-300 hover:text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex space-x-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add a tag (e.g., DeFi, NFT, Web3)"
            className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            maxLength={20}
            disabled={formData.tags.length >= 5}
          />
          <button
            type="button"
            onClick={handleAddTag}
            disabled={!newTag.trim() || formData.tags.length >= 5}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              !newTag.trim() || formData.tags.length >= 5
                ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                : 'bg-purple-500 hover:bg-purple-600 text-white'
            }`}
          >
            Add
          </button>
        </div>
        <p className="text-gray-400 text-sm mt-1">
          Tags help members find your community. Use relevant keywords.
        </p>
      </div>

      {/* Settings */}
      <div className="bg-white/5 rounded-xl p-4 space-y-4">
        <h3 className="text-lg font-semibold text-white">Community Settings</h3>
        
        <div className="space-y-3">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={formData.isPublic}
              onChange={(e) => updateFormData({ isPublic: e.target.checked })}
              className="w-5 h-5 text-purple-500 bg-white/10 border-white/20 rounded focus:ring-purple-500"
            />
            <div>
              <span className="text-white font-medium">Public Community</span>
              <p className="text-gray-400 text-sm">Community will be visible in public listings</p>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={formData.autoApprove}
              onChange={(e) => updateFormData({ autoApprove: e.target.checked })}
              className="w-5 h-5 text-purple-500 bg-white/10 border-white/20 rounded focus:ring-purple-500"
            />
            <div>
              <span className="text-white font-medium">Auto-approve Members</span>
              <p className="text-gray-400 text-sm">Members join automatically after payment</p>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={formData.allowReferrals}
              onChange={(e) => updateFormData({ allowReferrals: e.target.checked })}
              className="w-5 h-5 text-purple-500 bg-white/10 border-white/20 rounded focus:ring-purple-500"
            />
            <div>
              <span className="text-white font-medium">Allow Referrals</span>
              <p className="text-gray-400 text-sm">Members can refer others and earn bonuses</p>
            </div>
          </label>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl p-4 border border-blue-500/20">
        <h3 className="text-lg font-semibold text-white mb-3">Preview</h3>
        <div className="bg-white/10 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold">
                {formData.name.charAt(0).toUpperCase() || '?'}
              </span>
            </div>
            <div>
              <h4 className="text-white font-semibold">{formData.name || 'Community Name'}</h4>
              <p className="text-gray-400 text-sm">
                {categories.find(c => c.id === formData.category)?.name || 'Select category'}
              </p>
            </div>
          </div>
          <p className="text-gray-300 text-sm mb-3">
            {formData.description || 'Community description will appear here...'}
          </p>
          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
} 