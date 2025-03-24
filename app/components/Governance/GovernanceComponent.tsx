'use client';

import { useState, useEffect } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { motion } from 'framer-motion';
import { formatEther, parseEther } from 'viem';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import GovernanceDocs from './GovernanceDocs';

// ABI dla funkcji balanceOf
const aisTokenABI = [
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "type": "function"
  }
] as const;

interface Proposal {
  id: number;
  title: string;
  description: string;
  votesFor: number;
  votesAgainst: number;
  endTime: number;
  status: 'active' | 'passed' | 'failed';
}

export default function GovernanceComponent() {
  const { address, isConnected } = useAccount();
  const [isMobile, setIsMobile] = useState(false);
  const [activeView, setActiveView] = useState<'dao' | 'docs'>('dao');
  const [showDesktopDocs, setShowDesktopDocs] = useState(false);
  const [aisPrice, setAisPrice] = useState(0);
  const [showMessage, setShowMessage] = useState(true);
  
  // Bot's AIS balance
  const { data: botTokenData } = useBalance({
    address: '0x30086f99fe23f2e65dc48bb1a88eeacd835ec038',
    token: '0x26F732eD652A63aE66F365936fdDD2389c051B31',
  });

  const [proposals, setProposals] = useState<Proposal[]>([
    {
      id: 1,
      title: "100% Transaction Fees to Staking",
      description: "Proposal to allocate 100% of transaction fees generated from $AIS trading as staking rewards for token holders. This would incentivize long-term holding by providing a constant stream of rewards to stakers. The mechanism would capture fees from each trade and distribute them proportionally to all stakers based on their staked amount and duration.",
      votesFor: 0,
      votesAgainst: 0,
      endTime: Date.now(), // 0 hours remaining
      status: 'failed'
    },
    {
      id: 2,
      title: "100% Token Burn Implementation",
      description: "Implement 100% token burn mechanism for all $AIS tokens collected as transaction fees. This deflationary approach would reduce the total supply over time, potentially increasing the value of remaining tokens. Every transaction would contribute to gradually decreasing the circulating supply, creating scarcity in the ecosystem.",
      votesFor: 0,
      votesAgainst: 0,
      endTime: Date.now(), // 0 hours remaining
      status: 'failed'
    },
    {
      id: 3,
      title: "50/50 Split: Burn and Staking",
      description: "Split transaction fees 50/50 between token burning and staking rewards distribution. This balanced approach would both reward stakers with passive income and implement a moderate deflationary mechanism. Half of all transaction fees would be distributed to stakers while the other half would be permanently burned, offering benefits of both strategies.",
      votesFor: 0,
      votesAgainst: 0,
      endTime: Date.now(), // 0 hours remaining
      status: 'failed'
    }
  ]);

  const { data: tokenData } = useBalance({
    address,
    token: '0x26F732eD652A63aE66F365936fdDD2389c051B31',
  });

  const userVotingPower = tokenData ? tokenData.formatted : '0';
  const botBalance = botTokenData ? botTokenData.formatted : '0';
  // Use the actual market cap value from AIS Stats
  const marketCap = 32114;

  // Fetch real price from DexScreener
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch(
          'https://api.dexscreener.com/latest/dex/tokens/0x26f732ed652a63ae66f365936fddd2389c051b31'
        );
        const data = await response.json();
        if (data.pairs && data.pairs[0]) {
          const price = parseFloat(data.pairs[0].priceUsd);
          setAisPrice(price);
        }
      } catch (error) {
        console.error('Error fetching AIS price:', error);
      }
    };

    fetchPrice();
    // Refresh price every 30 seconds
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const calculateUsdValue = (aisAmount: string) => {
    try {
      // Remove commas and spaces from the number
      const cleanAmount = aisAmount.replace(/[,\s]/g, '');
      const amount = parseFloat(cleanAmount);
      const usdValue = amount * aisPrice;
      return usdValue.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } catch (error) {
      console.error('Error calculating USD value:', error);
      return '$0.00';
    }
  };

  // Format large numbers with spaces every 3 digits
  const formatLargeNumber = (number: string) => {
    try {
      const cleanNumber = number.replace(/[,\s]/g, '');
      return parseFloat(cleanNumber).toLocaleString('en-US', {
        maximumFractionDigits: 3,
        useGrouping: true
      }).replace(/,/g, ' ');
    } catch (error) {
      console.error('Error formatting large number:', error);
      return '0';
    }
  };

  const handleVote = async (proposalId: number, voteFor: boolean) => {
    setShowMessage(true);
  };

  const calculateProgress = (votesFor: number, votesAgainst: number) => {
    const total = votesFor + votesAgainst;
    return total > 0 ? (votesFor / total) * 100 : 0;
  };

  const formatVotes = (votes: number) => {
    return (votes / 1000000).toFixed(2) + 'M';
  };

  return (
    <div className={`relative bg-[#1a1b1f] ${isMobile ? '' : ''}`}>
      <div className={`w-full p-8 ${isMobile && activeView === 'docs' ? 'hidden' : ''}`}>
        {/* Governance Announcement */}
        {showMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 bg-[#1E2025] border border-[#00F0FF]/30 text-blue-400 p-6 rounded-2xl shadow-[0_0_15px_rgba(0,240,255,0.2)]"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-[#00FFFF] via-[#FA00FF] to-[#00FFFF] animate-gradient-shift">Governance Coming Soon</h3>
                <p className="mb-2">The governance system is currently in development and not yet active.</p>
                <p>Once deployed, you'll be able to participate in voting to shape the future of the $AIS ecosystem.</p>
              </div>
              <button 
                onClick={() => setShowMessage(false)}
                className="text-blue-400 hover:text-blue-300 p-2"
              >
                ×
              </button>
            </div>
          </motion.div>
        )}
        
        {/* Top Stats Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12 max-w-[1920px] mx-auto">
          {/* Voting Power */}
          <div className="bg-[#1E2025] rounded-2xl p-8 border border-blue-900/20">
            <h3 className="text-xl font-bold text-[#00FFFF] mb-4">Your Voting Power</h3>
            <p className="text-xl lg:text-2xl font-mono text-[#FA00FF] mb-2">
              {formatLargeNumber(userVotingPower)} $AIS
            </p>
            <p className="text-sm text-[#8BFDFF] mb-2">
              ≈ {calculateUsdValue(userVotingPower)}
            </p>
            <p className="text-xs text-blue-300">1 $AIS = {aisPrice.toFixed(8)} USD</p>
          </div>

          {/* Bot Treasury */}
          <div className="bg-[#1E2025] rounded-2xl p-8 border border-blue-900/20">
            <h3 className="text-xl font-bold text-[#00FFFF] mb-4">$AIS Treasury</h3>
            <p className="text-xl lg:text-2xl font-mono text-[#FA00FF] mb-2">
              {formatLargeNumber(botBalance)} $AIS
            </p>
            <p className="text-sm text-[#8BFDFF] mb-2">
              ≈ {calculateUsdValue(botBalance)}
            </p>
            <div className="flex justify-between mt-3 pt-3 border-t border-blue-900/10">
              <p className="text-xs text-blue-300">Available for Distribution</p>
            </div>
            <div className="flex justify-between mt-2">
              <p className="text-xs text-blue-300">Market Cap:</p>
              <p className="text-xs text-[#8BFDFF] font-bold">
                {marketCap.toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                  minimumSignificantDigits: 5,
                  maximumSignificantDigits: 5
                })}
              </p>
            </div>
          </div>

          {/* Voting Stats */}
          <div className="bg-[#1E2025] rounded-2xl p-6 border border-blue-900/20">
            <h3 className="text-lg font-bold text-[#00FFFF] mb-3">Voting Statistics</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-blue-900/10 pb-2">
                <p className="text-xs text-blue-300">Total Proposals</p>
                <p className="text-base font-mono text-[#FA00FF]">{proposals.length}</p>
              </div>
              <div className="flex items-center justify-between border-b border-blue-900/10 pb-2">
                <p className="text-xs text-blue-300">Active Proposals</p>
                <p className="text-base font-mono text-[#00FFFF]">
                  {proposals.filter(p => p.status === 'active').length}
                </p>
              </div>
              <div className="flex items-center justify-between border-b border-blue-900/10 pb-2">
                <p className="text-xs text-blue-300">Completed Proposals</p>
                <p className="text-base font-mono text-[#00FF85]">
                  {proposals.filter(p => p.status === 'passed').length}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-blue-300">Inactive Proposals</p>
                <p className="text-base font-mono text-[#A020F0]">
                  {proposals.filter(p => p.status === 'failed').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Proposals Section */}
        <div className="space-y-6 max-w-[1920px] mx-auto mb-12">
          <h3 className="text-2xl font-bold text-blue-400 mb-8">Active Proposals</h3>
          
          {proposals.map(proposal => (
            <div key={proposal.id} className="bg-[#1E2025] rounded-2xl p-8 border border-blue-900/20">
              <div className="flex justify-between items-start mb-6">
                <h4 className="text-xl font-bold text-blue-400">{proposal.title}</h4>
                <span className="text-sm text-blue-300 bg-blue-400/10 px-3 py-1 rounded-full">
                  {proposal.status === 'failed' || proposal.status === 'passed' 
                    ? '∞ remaining' 
                    : Math.floor((proposal.endTime - Date.now()) / 3600000) + 'h remaining'}
                </span>
              </div>
              
              <p className="text-blue-300 mb-6">{proposal.description}</p>
              
              {/* Progress Bar */}
              <div className="w-full h-2 bg-[#2A2D35] rounded-full mb-2">
                <div 
                  className="h-full bg-green-400 rounded-full transition-all duration-300"
                  style={{ width: `${calculateProgress(proposal.votesFor, proposal.votesAgainst)}%` }}
                />
              </div>
              
              {/* Vote Stats */}
              <div className="flex justify-between text-sm mb-6">
                <div>
                  <span className="text-green-400">For: </span>
                  <span className="text-blue-300">{formatVotes(proposal.votesFor)}</span>
                </div>
                <div>
                  <span className="text-red-400">Against: </span>
                  <span className="text-blue-300">{formatVotes(proposal.votesAgainst)}</span>
                </div>
              </div>

              {/* Vote Buttons */}
              <div className="grid grid-cols-2 gap-4">
                {/* Vote For Button */}
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00FF85] via-[#00FFAA] to-[#00FF85] rounded-xl blur opacity-75 group-hover:opacity-100 animate-gradient-shift transition duration-1000 group-hover:duration-300"></div>
                  
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleVote(proposal.id, true)}
                    className="relative w-full bg-gradient-to-br from-[#004D28] via-[#007040] to-[#005535] text-white py-4 rounded-xl font-bold text-lg transition-all duration-300 border border-[#00FF85]/30 flex items-center justify-center gap-3 shadow-[0_0_15px_rgba(0,255,133,0.5)]"
                  >
                    <span className="text-2xl">🔒</span>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00FF85] via-[#00FFAA] to-[#00FF85] animate-gradient-shift">
                      Vote For
                    </span>
                  </motion.button>
                </div>
                
                {/* Vote Against Button */}
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-[#FF3D00] via-[#FF0055] to-[#FF3D00] rounded-xl blur opacity-75 group-hover:opacity-100 animate-gradient-shift transition duration-1000 group-hover:duration-300"></div>
                  
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleVote(proposal.id, false)}
                    className="relative w-full bg-gradient-to-br from-[#4C0000] via-[#700000] to-[#550000] text-white py-4 rounded-xl font-bold text-lg transition-all duration-300 border border-[#FF3D00]/30 flex items-center justify-center gap-3 shadow-[0_0_15px_rgba(255,61,0,0.5)]"
                  >
                    <span className="text-2xl">🔒</span>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF3D00] via-[#FF0055] to-[#FF3D00] animate-gradient-shift">
                      Vote Against
                    </span>
                  </motion.button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Docs Toggle Button */}
        {!isMobile && (
          <div className="flex justify-center mt-16 mb-8">
            <button
              onClick={() => setShowDesktopDocs(!showDesktopDocs)}
              className="flex items-center space-x-2 bg-[#1E2025] hover:bg-[#7B3FE4] text-blue-300 hover:text-white px-8 py-4 rounded-xl font-bold transition-all duration-300"
            >
              <span>{showDesktopDocs ? 'Hide Documentation' : 'View Documentation'}</span>
              <svg 
                className={`w-5 h-5 transition-transform duration-300 ${showDesktopDocs ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path 
                  fillRule="evenodd" 
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" 
                  clipRule="evenodd" 
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Documentation Panel - Visible on mobile when toggled or on desktop when showDesktopDocs is true */}
      {(isMobile && activeView === 'docs') || (!isMobile && showDesktopDocs) ? (
        <div className={`w-full bg-[#1E2025] overflow-y-auto border-t border-blue-900/20 ${!isMobile ? 'border-t border-blue-900/20 rounded-b-2xl' : ''}`}>
          <GovernanceDocs />
        </div>
      ) : null}

      {/* Mobile Footer Navigation */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#1a1b1f] border-t border-blue-900/20 p-4 flex justify-center">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveView('dao')}
              className={`px-6 py-3 rounded-xl font-bold ${
                activeView === 'dao'
                  ? 'bg-[#7B3FE4] text-white'
                  : 'bg-[#1E2025] text-blue-300'
              }`}
            >
              DAO
            </button>
            <button
              onClick={() => setActiveView('docs')}
              className={`px-6 py-3 rounded-xl font-bold ${
                activeView === 'docs'
                  ? 'bg-[#7B3FE4] text-white'
                  : 'bg-[#1E2025] text-blue-300'
              }`}
            >
              Docs
            </button>
          </div>
        </div>
      )}

      {/* CSS for animated gradients */}
      <style jsx global>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50% }
          50% { background-position: 100% 50% }
          100% { background-position: 0% 50% }
        }
        .animate-gradient-shift {
          background-size: 200% auto;
          animation: gradient-shift 3s linear infinite;
        }
      `}</style>
    </div>
  );
} 