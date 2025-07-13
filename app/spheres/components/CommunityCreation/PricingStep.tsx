'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface CommunityFormData {
  joinFee: string;
  monthlyFee: string;
  lifetimeFee: string;
}

interface PricingStepProps {
  formData: CommunityFormData;
  updateFormData: (updates: Partial<CommunityFormData>) => void;
  errors: Partial<CommunityFormData>;
  creationFee: string;
}

export default function PricingStep({ formData, updateFormData, errors, creationFee }: PricingStepProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const pricingTemplates = [
    {
      id: 'free',
      name: 'Free Community',
      description: 'Perfect for building an audience',
      joinFee: '0',
      monthlyFee: '0',
      lifetimeFee: '0',
      icon: '🆓',
      recommended: false
    },
    {
      id: 'starter',
      name: 'Starter',
      description: 'Ideal for small communities',
      joinFee: '0.001',
      monthlyFee: '0.005',
      lifetimeFee: '0.05',
      icon: '🌱',
      recommended: true
    },
    {
      id: 'professional',
      name: 'Professional',
      description: 'For established creators',
      joinFee: '0.005',
      monthlyFee: '0.01',
      lifetimeFee: '0.1',
      icon: '💼',
      recommended: false
    },
    {
      id: 'premium',
      name: 'Premium',
      description: 'For exclusive content',
      joinFee: '0.01',
      monthlyFee: '0.02',
      lifetimeFee: '0.2',
      icon: '💎',
      recommended: false
    }
  ];

  const handleTemplateSelect = (template: typeof pricingTemplates[0]) => {
    setSelectedTemplate(template.id);
    updateFormData({
      joinFee: template.joinFee,
      monthlyFee: template.monthlyFee,
      lifetimeFee: template.lifetimeFee
    });
  };

  const calculateRevenue = () => {
    const joinFee = parseFloat(formData.joinFee) || 0;
    const monthlyFee = parseFloat(formData.monthlyFee) || 0;
    const lifetimeFee = parseFloat(formData.lifetimeFee) || 0;

    // Symulacja dla różnych scenariuszy
    const scenarios = [
      { members: 10, retention: 0.8 },
      { members: 50, retention: 0.7 },
      { members: 100, retention: 0.6 }
    ];

    return scenarios.map(scenario => {
      const monthlyRevenue = (joinFee * scenario.members * 0.1) + (monthlyFee * scenario.members * scenario.retention);
      const lifetimeRevenue = lifetimeFee * scenario.members * 0.2; // Zakładamy że 20% wybierze lifetime
      return {
        members: scenario.members,
        monthly: monthlyRevenue,
        lifetime: lifetimeRevenue,
        total: monthlyRevenue + lifetimeRevenue
      };
    });
  };

  const revenueProjections = calculateRevenue();

  const getMultiplierRecommendation = () => {
    const monthlyFee = parseFloat(formData.monthlyFee) || 0;
    const lifetimeFee = parseFloat(formData.lifetimeFee) || 0;
    
    if (monthlyFee === 0) return null;
    
    const currentMultiplier = lifetimeFee / monthlyFee;
    const recommendedMultiplier = 12; // 12 miesięcy
    
    return {
      current: currentMultiplier,
      recommended: recommendedMultiplier,
      optimal: monthlyFee * recommendedMultiplier
    };
  };

  const multiplierRec = getMultiplierRecommendation();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Set Your Pricing</h2>
        <p className="text-gray-400">
          Choose how much members pay to join and maintain their membership
        </p>
      </div>

      {/* Pricing Templates */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-white mb-4">Choose a Template</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pricingTemplates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateSelect(template)}
              className={`p-4 rounded-xl border-2 transition-all text-left relative ${
                selectedTemplate === template.id
                  ? 'border-purple-500 bg-purple-500/20'
                  : 'border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/10'
              }`}
            >
              {template.recommended && (
                <div className="absolute -top-2 -right-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-2 py-1 rounded-full text-xs font-semibold">
                  Recommended
                </div>
              )}
              <div className="flex items-center space-x-3 mb-2">
                <span className="text-2xl">{template.icon}</span>
                <div>
                  <h4 className="text-white font-semibold">{template.name}</h4>
                  <p className="text-gray-400 text-sm">{template.description}</p>
                </div>
              </div>
              <div className="text-sm text-gray-300 space-y-1">
                <div>Join: {template.joinFee} ETH</div>
                <div>Monthly: {template.monthlyFee} ETH</div>
                <div>Lifetime: {template.lifetimeFee} ETH</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Pricing */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Join Fee */}
        <div>
          <label className="block text-sm font-semibold text-white mb-2">
            Join Fee (ETH)
          </label>
          <input
            type="number"
            value={formData.joinFee}
            onChange={(e) => updateFormData({ joinFee: e.target.value })}
            placeholder="0.001"
            step="0.001"
            min="0"
            className={`w-full px-4 py-3 bg-white/10 border-2 rounded-xl text-white placeholder-gray-400 focus:outline-none transition-all ${
              errors.joinFee ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
            }`}
          />
          {errors.joinFee && (
            <p className="text-red-400 text-sm mt-1">{errors.joinFee}</p>
          )}
          <p className="text-gray-400 text-sm mt-1">
            One-time fee to join the community
          </p>
        </div>

        {/* Monthly Fee */}
        <div>
          <label className="block text-sm font-semibold text-white mb-2">
            Monthly Fee (ETH)
          </label>
          <input
            type="number"
            value={formData.monthlyFee}
            onChange={(e) => updateFormData({ monthlyFee: e.target.value })}
            placeholder="0.005"
            step="0.001"
            min="0"
            className={`w-full px-4 py-3 bg-white/10 border-2 rounded-xl text-white placeholder-gray-400 focus:outline-none transition-all ${
              errors.monthlyFee ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
            }`}
          />
          {errors.monthlyFee && (
            <p className="text-red-400 text-sm mt-1">{errors.monthlyFee}</p>
          )}
          <p className="text-gray-400 text-sm mt-1">
            Recurring monthly subscription
          </p>
        </div>

        {/* Lifetime Fee */}
        <div>
          <label className="block text-sm font-semibold text-white mb-2">
            Lifetime Fee (ETH)
          </label>
          <input
            type="number"
            value={formData.lifetimeFee}
            onChange={(e) => updateFormData({ lifetimeFee: e.target.value })}
            placeholder="0.05"
            step="0.001"
            min="0"
            className={`w-full px-4 py-3 bg-white/10 border-2 rounded-xl text-white placeholder-gray-400 focus:outline-none transition-all ${
              errors.lifetimeFee ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
            }`}
          />
          {errors.lifetimeFee && (
            <p className="text-red-400 text-sm mt-1">{errors.lifetimeFee}</p>
          )}
          <p className="text-gray-400 text-sm mt-1">
            One-time payment for lifetime access
          </p>
        </div>
      </div>

      {/* Pricing Recommendations */}
      {multiplierRec && (
        <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl p-4 border border-yellow-500/20">
          <h3 className="text-lg font-semibold text-white mb-2">💡 Pricing Recommendation</h3>
          <div className="text-sm text-gray-300 space-y-1">
            <p>Current lifetime multiplier: <span className="text-white font-semibold">{multiplierRec.current.toFixed(1)}x</span></p>
            <p>Recommended multiplier: <span className="text-green-400 font-semibold">{multiplierRec.recommended}x</span></p>
            <p>Optimal lifetime fee: <span className="text-green-400 font-semibold">{multiplierRec.optimal.toFixed(4)} ETH</span></p>
          </div>
          <button
            onClick={() => updateFormData({ lifetimeFee: multiplierRec.optimal.toString() })}
            className="mt-2 px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-sm transition-colors"
          >
            Apply Recommendation
          </button>
        </div>
      )}

      {/* Revenue Projections */}
      <div className="bg-white/5 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">📈 Revenue Projections</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {revenueProjections.map((scenario, index) => (
            <div key={index} className="bg-white/10 rounded-lg p-4">
              <h4 className="text-white font-semibold mb-2">
                {scenario.members} Members
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Monthly Revenue:</span>
                  <span className="text-green-400">{scenario.monthly.toFixed(4)} ETH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Lifetime Revenue:</span>
                  <span className="text-blue-400">{scenario.lifetime.toFixed(4)} ETH</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2">
                  <span className="text-gray-400">Total Monthly:</span>
                  <span className="text-white font-semibold">{scenario.total.toFixed(4)} ETH</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-gray-400 text-sm mt-4">
          * Projections based on typical community retention rates and member behavior
        </p>
      </div>

      {/* Platform Fees Info */}
      <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl p-4 border border-blue-500/20">
        <h3 className="text-lg font-semibold text-white mb-3">💰 Platform Fees</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Creation Fee:</span>
              <span className="text-white font-semibold">{creationFee} ETH</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Transaction Fee:</span>
              <span className="text-white font-semibold">0.5%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Platform Fee:</span>
              <span className="text-white font-semibold">2.5%</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">You Keep:</span>
              <span className="text-green-400 font-semibold">~97.5%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Withdrawal Fee:</span>
              <span className="text-white font-semibold">1%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-4 border border-green-500/20">
        <h3 className="text-lg font-semibold text-white mb-3">🎯 Pricing Tips</h3>
        <ul className="space-y-2 text-sm text-gray-300">
          <li>• <strong>Start lower:</strong> You can always increase prices later</li>
          <li>• <strong>Lifetime value:</strong> Set lifetime fee to 8-12x monthly fee</li>
          <li>• <strong>Join fee:</strong> Low join fee encourages more members</li>
          <li>• <strong>Test pricing:</strong> Monitor member retention and adjust accordingly</li>
          <li>• <strong>Value proposition:</strong> Higher prices work with exclusive content</li>
        </ul>
      </div>
    </motion.div>
  );
} 