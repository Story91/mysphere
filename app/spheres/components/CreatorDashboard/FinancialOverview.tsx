'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface FinancialOverviewProps {
  community: {
    id: number;
    name: string;
    balance: string;
    withdrawableBalance: string;
    totalMembers: number;
  };
}

export default function FinancialOverview({ community }: FinancialOverviewProps) {
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  
  const financialData = {
    totalBalance: parseFloat(community.balance),
    withdrawableBalance: parseFloat(community.withdrawableBalance),
    pendingBalance: parseFloat(community.balance) - parseFloat(community.withdrawableBalance),
    totalMembers: community.totalMembers,
    // Symulowane dane revenue (w rzeczywistej aplikacji z API)
    revenueThisMonth: 0.15,
    revenueLastMonth: 0.12,
    projectedRevenue: 0.18,
    withdrawalFee: 0.01, // 1%
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    if (parseFloat(withdrawAmount) > financialData.withdrawableBalance) {
      toast.error('Insufficient withdrawable balance');
      return;
    }

    setIsWithdrawing(true);
    try {
      // Tutaj będzie implementacja withdraw z kontraktu
      await new Promise(resolve => setTimeout(resolve, 2000)); // Symulacja
      toast.success(`Successfully withdrawn ${withdrawAmount} ETH`);
      setWithdrawAmount('');
    } catch (error) {
      toast.error('Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const revenueGrowth = ((financialData.revenueThisMonth - financialData.revenueLastMonth) / financialData.revenueLastMonth) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">Financial Overview</h3>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400">Community:</span>
          <span className="text-sm text-white font-semibold">{community.name}</span>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl border border-green-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Total Balance</span>
            <span className="text-xl">💰</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {financialData.totalBalance.toFixed(4)} ETH
          </div>
          <div className="text-xs text-gray-400">
            ~${(financialData.totalBalance * 2800).toFixed(2)} USD
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl border border-blue-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Withdrawable</span>
            <span className="text-xl">💸</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {financialData.withdrawableBalance.toFixed(4)} ETH
          </div>
          <div className="text-xs text-gray-400">
            Available for withdrawal
          </div>
        </div>
      </div>

      {/* Revenue Analytics */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-white mb-3">Revenue Analytics</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-white/5 rounded-xl">
            <div className="text-lg font-bold text-green-400">
              {financialData.revenueThisMonth.toFixed(3)}
            </div>
            <div className="text-xs text-gray-400">This Month</div>
          </div>
          <div className="text-center p-3 bg-white/5 rounded-xl">
            <div className="text-lg font-bold text-blue-400">
              {financialData.revenueLastMonth.toFixed(3)}
            </div>
            <div className="text-xs text-gray-400">Last Month</div>
          </div>
          <div className="text-center p-3 bg-white/5 rounded-xl">
            <div className="text-lg font-bold text-purple-400">
              {financialData.projectedRevenue.toFixed(3)}
            </div>
            <div className="text-xs text-gray-400">Projected</div>
          </div>
        </div>
        
        <div className="mt-3 p-3 bg-white/5 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Growth Rate</span>
            <span className={`text-sm font-semibold ${revenueGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Withdrawal Section */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-white mb-3">Withdraw Funds</h4>
        <div className="space-y-4">
          <div className="p-4 bg-white/5 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Available to Withdraw</span>
              <span className="text-sm text-white font-semibold">
                {financialData.withdrawableBalance.toFixed(4)} ETH
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Withdrawal Fee: {(financialData.withdrawalFee * 100).toFixed(1)}%</span>
              <span>
                Net Amount: {(financialData.withdrawableBalance * (1 - financialData.withdrawalFee)).toFixed(4)} ETH
              </span>
            </div>
          </div>

          <div className="flex space-x-2">
            <input
              type="number"
              placeholder="0.0000"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              max={financialData.withdrawableBalance}
              step="0.0001"
              className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={() => setWithdrawAmount(financialData.withdrawableBalance.toString())}
              className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors"
            >
              Max
            </button>
          </div>

          <button
            onClick={handleWithdraw}
            disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
            className={`w-full py-3 rounded-xl font-semibold transition-all ${
              isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0
                ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white'
            }`}
          >
            {isWithdrawing ? 'Processing...' : 'Withdraw Funds'}
          </button>
        </div>
      </div>

      {/* Financial Stats */}
      <div className="border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Financial Stats</h4>
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Revenue per Member</span>
            <span className="text-white">
              {financialData.totalMembers > 0 ? 
                (financialData.totalBalance / financialData.totalMembers).toFixed(4) : '0.0000'} ETH
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Pending Balance</span>
            <span className="text-orange-400">{financialData.pendingBalance.toFixed(4)} ETH</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Total Members</span>
            <span className="text-white">{financialData.totalMembers}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Avg Monthly Revenue</span>
            <span className="text-green-400">
              {((financialData.revenueThisMonth + financialData.revenueLastMonth) / 2).toFixed(4)} ETH
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
} 