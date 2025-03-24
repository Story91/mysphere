'use client';

import { motion } from 'framer-motion';

export default function StakingDocs() {
  return (
    <div className="max-w-5xl mx-auto p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-[#1E2025] rounded-2xl p-8 mb-8"
      >
        <h2 className="text-3xl font-bold text-blue-400 mb-6">$AIS Token Staking System</h2>
        <p className="text-blue-300 text-lg mb-8">
          A decentralized yield farming program that allows token holders to stake their $AIS tokens and earn rewards.
          Participate in the ecosystem's growth while earning significant returns on your holdings.
        </p>
      </motion.div>

      {/* Core Parameters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-[#1E2025] rounded-2xl p-8 mb-8"
      >
        <h3 className="text-2xl font-bold text-blue-400 mb-6">Core Parameters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <p className="text-blue-300">Token Contract</p>
              <p className="text-blue-400 font-mono text-sm break-all">
                0x26F732eD652A63aE66F365936fdDD2389c051B31
              </p>
            </div>
            <div>
              <p className="text-blue-300">Total Reward Pool</p>
              <p className="text-blue-400 font-bold">100,000,000 $AIS tokens</p>
            </div>
            <div>
              <p className="text-blue-300">Program Duration</p>
              <p className="text-blue-400 font-bold">30 days (2,592,000 seconds)</p>
            </div>
            <div>
              <p className="text-blue-300">Reward Rate</p>
              <p className="text-blue-400 font-bold">38.58 $AIS tokens per second</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-blue-300">Minimum Stake</p>
              <p className="text-blue-400 font-bold">10,000,000 $AIS tokens</p>
            </div>
            <div>
              <p className="text-blue-300">Minimum Staking Period</p>
              <p className="text-blue-400 font-bold">7 days (604,800 seconds)</p>
            </div>
            <div>
              <p className="text-blue-300">Maximum Stakers</p>
              <p className="text-blue-400 font-bold">50 participants</p>
            </div>
            <div>
              <p className="text-blue-300">Token Price</p>
              <p className="text-blue-400 font-bold">$0.0000003592 per $AIS</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Yield Information */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-[#1E2025] rounded-2xl p-8 mb-8"
      >
        <h3 className="text-2xl font-bold text-blue-400 mb-6">Yield Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-[#2A2D36] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-blue-300">30-day Yield</p>
              <p className="text-green-400 font-bold text-xl">100%</p>
            </div>
            <p className="text-blue-400/70 text-sm">
              Expected return on staked tokens over the program duration
            </p>
          </div>
          <div className="bg-[#2A2D36] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-blue-300">Annual APY</p>
              <p className="text-green-400 font-bold text-xl">~1200%</p>
            </div>
            <p className="text-blue-400/70 text-sm">
              Annualized yield (not accounting for compounding)
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          <div className="bg-[#2A2D36] rounded-xl p-6">
            <div className="mb-4">
              <p className="text-blue-300">Reward Distribution</p>
              <p className="text-blue-400 mt-2">
                Rewards are distributed proportionally to each user's stake relative to the total staked amount
              </p>
            </div>
          </div>
          <div className="bg-[#2A2D36] rounded-xl p-6">
            <div className="mb-4">
              <p className="text-blue-300">Reward Accrual</p>
              <p className="text-blue-400 mt-2">
                Rewards accrue in real-time and can be claimed at any time after the minimum staking period
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* How It Works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="bg-[#1E2025] rounded-2xl p-8"
      >
        <h3 className="text-2xl font-bold text-blue-400 mb-6">How It Works</h3>
        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-blue-400 font-bold">1</span>
            </div>
            <div>
              <p className="text-blue-300 font-bold mb-2">Connect & Approve</p>
              <p className="text-blue-400/70">
                Connect your wallet and approve the staking contract to use your $AIS tokens
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-4">
            <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-blue-400 font-bold">2</span>
            </div>
            <div>
              <p className="text-blue-300 font-bold mb-2">Stake Tokens</p>
              <p className="text-blue-400/70">
                Stake a minimum of 10M $AIS tokens to start earning rewards
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-4">
            <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-blue-400 font-bold">3</span>
            </div>
            <div>
              <p className="text-blue-300 font-bold mb-2">Earn Rewards</p>
              <p className="text-blue-400/70">
                Earn 38.58 $AIS tokens per second, distributed proportionally among all stakers
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-4">
            <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-blue-400 font-bold">4</span>
            </div>
            <div>
              <p className="text-blue-300 font-bold mb-2">Claim & Withdraw</p>
              <p className="text-blue-400/70">
                Claim your rewards at any time and withdraw your stake after the 7-day minimum period
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 