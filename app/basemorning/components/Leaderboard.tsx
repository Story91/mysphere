import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Medal, Crown, Zap, Star } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  address: string;
  username?: string;
  level: number;
  xp: number;
  elements: number;
  pvpWins: number;
  totalPower: number;
}

const Leaderboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overall' | 'pvp' | 'power'>('overall');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Mock data - replace with real API call
  useEffect(() => {
    const mockData: LeaderboardEntry[] = [
      { rank: 1, address: '0x123...abc', username: 'ElementMaster', level: 12, xp: 156000, elements: 89, pvpWins: 47, totalPower: 234500 },
      { rank: 2, address: '0x456...def', username: 'NexusCommander', level: 11, xp: 142000, elements: 76, pvpWins: 39, totalPower: 198700 },
      { rank: 3, address: '0x789...ghi', username: 'QuantumForge', level: 10, xp: 128000, elements: 68, pvpWins: 34, totalPower: 167800 },
      { rank: 4, address: '0xabc...jkl', username: 'CoreBuilder', level: 9, xp: 115000, elements: 59, pvpWins: 28, totalPower: 145200 },
      { rank: 5, address: '0xdef...mno', username: 'ElementalLord', level: 9, xp: 109000, elements: 54, pvpWins: 25, totalPower: 132800 },
    ];
    
    setTimeout(() => {
      setLeaderboardData(mockData);
      setLoading(false);
    }, 1000);
  }, []);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="w-6 h-6 text-yellow-400" />;
      case 2: return <Medal className="w-6 h-6 text-gray-400" />;
      case 3: return <Medal className="w-6 h-6 text-amber-600" />;
      default: return <Trophy className="w-5 h-5 text-cyan-400" />;
    }
  };

  const getRankGradient = (rank: number) => {
    switch (rank) {
      case 1: return "from-yellow-400/20 to-orange-500/20 border-yellow-400/50";
      case 2: return "from-gray-300/20 to-gray-500/20 border-gray-400/50";
      case 3: return "from-amber-400/20 to-amber-600/20 border-amber-500/50";
      default: return "from-cyan-400/10 to-blue-500/10 border-cyan-400/30";
    }
  };

  const getSortedData = () => {
    switch (activeTab) {
      case 'pvp': return [...leaderboardData].sort((a, b) => b.pvpWins - a.pvpWins);
      case 'power': return [...leaderboardData].sort((a, b) => b.totalPower - a.totalPower);
      default: return [...leaderboardData].sort((a, b) => b.xp - a.xp);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const tabs = [
    { key: 'overall', label: 'Overall XP', icon: Star },
    { key: 'pvp', label: 'PvP Victories', icon: Zap },
    { key: 'power', label: 'Total Power', icon: Trophy },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">
          Global Leaderboard
        </h2>
        <p className="text-cyan-300">Compete with commanders across the universe</p>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center space-x-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`
              flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-300
              ${activeTab === tab.key
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 hover:text-white'
              }
            `}
          >
            <tab.icon className="w-5 h-5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </motion.div>

      {/* Leaderboard */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-gray-900/50 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {getSortedData().map((entry, index) => (
              <motion.div
                key={entry.address}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`
                  flex items-center justify-between p-4 rounded-lg
                  bg-gradient-to-r ${getRankGradient(index + 1)}
                  border hover:scale-[1.02] transition-all duration-300
                  hover:shadow-lg hover:shadow-cyan-500/20
                `}
              >
                {/* Rank & User Info */}
                <div className="flex items-center space-x-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-800/50">
                    {getRankIcon(index + 1)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-lg">#{index + 1}</span>
                      <span className="text-cyan-300 font-medium">
                        {entry.username || `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400">
                      Level {entry.level} • {entry.elements} Elements
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right">
                  <div className="text-xl font-bold text-white">
                    {activeTab === 'overall' && `${formatNumber(entry.xp)} XP`}
                    {activeTab === 'pvp' && `${entry.pvpWins} Wins`}
                    {activeTab === 'power' && `${formatNumber(entry.totalPower)} Power`}
                  </div>
                  <div className="text-sm text-gray-400">
                    Total Power: {formatNumber(entry.totalPower)}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Your Rank Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-xl p-6"
      >
        <h3 className="text-xl font-bold text-purple-300 mb-3">Your Position</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <span className="text-purple-300 font-bold">#42</span>
            </div>
            <div>
              <div className="text-white font-medium">Your Account</div>
              <div className="text-sm text-gray-400">Level 7 • 23 Elements</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-purple-300">45,600 XP</div>
            <div className="text-sm text-gray-400">8,400 to next rank</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Leaderboard; 