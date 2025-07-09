import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  DollarSign, 
  Users, 
  Settings, 
  TrendingUp, 
  AlertTriangle, 
  Download, 
  Lock,
  Activity,
  Database,
  Zap,
  Eye,
  RefreshCw,
  BarChart3,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Gamepad2,
  Coins,
  TrendingDown
} from 'lucide-react';
import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { useBaseMorningContract } from '../hooks/useBaseMorningContract';
import { ADMIN_ADDRESS } from '../../utils/firebase';

// Types for analytics data
interface AdminAnalytics {
  realTime: {
    playersOnline: number;
    activeTransactions: number;
    systemHealth: 'healthy' | 'warning' | 'critical';
    lastUpdate: Date;
  };
  players: {
    total: number;
    active24h: number;
    active7d: number;
    newToday: number;
    averageLevel: number;
    levelDistribution: Record<number, number>;
    topPlayers: {
      byXP: Array<{address: string, xp: number, level: number}>;
      byStreak: Array<{address: string, streak: number}>;
      byNetWorth: Array<{address: string, netWorth: string}>;
    };
  };
  economy: {
    totalRevenue: string;
    revenue24h: string;
    revenue7d: string;
    averageTransactionValue: string;
    totalVolume: string;
    contractBalance: string;
    priceMetrics: {
      averageElementPrice: string;
      floorPrice: string;
      ceilingPrice: string;
    };
  };
  game: {
    totalElements: number;
    elementsMinted24h: number;
    totalFusions: number;
    fusions24h: number;
    activeTrades: number;
    completedTrades24h: number;
    rarityDistribution: Record<string, number>;
    elementTypeDistribution: Record<string, number>;
  };
  system: {
    indexerStatus: {
      isRunning: boolean;
      lastProcessedBlock: number;
      eventsProcessed: number;
      errors: string[];
      lastRunAt: Date;
    };
    performance: {
      avgResponseTime: number;
      errorRate: number;
      uptime: number;
    };
  };
}

const AdminPanel: React.FC = () => {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });
  const [contractBalance, setContractBalance] = useState<bigint>(BigInt(0));
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'withdrawal' | 'players' | 'system' | 'settings'>('overview');
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  // Real admin check using Firebase ADMIN_ADDRESS
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS;

  // Fetch analytics data via API
  useEffect(() => {
    if (!isAdmin) return;

    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/basemorning/stats?type=admin&admin_key=' + process.env.NEXT_PUBLIC_ADMIN_KEY);
        if (response.ok) {
          const data = await response.json();
          setAnalytics(data);
        } else {
          console.error('Failed to fetch analytics:', response.statusText);
        }
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const handleWithdraw = async () => {
    if (!isAdmin) return;
    
    setIsWithdrawing(true);
    try {
      // Replace with actual withdrawal function
      await new Promise(resolve => setTimeout(resolve, 2000)); // Mock delay
      alert('Withdrawal successful! 💰');
    } catch (error: any) {
      console.error('Withdrawal failed:', error);
      alert(`Withdrawal failed: ${error.message}`);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const refreshAnalytics = async () => {
    if (!isAdmin) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/basemorning/stats?type=admin&admin_key=' + process.env.NEXT_PUBLIC_ADMIN_KEY);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to refresh analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-20"
      >
        <Lock className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h2>
        <p className="text-gray-400">You don't have admin privileges to access this panel.</p>
      </motion.div>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview', icon: TrendingUp, color: 'blue' },
    { key: 'analytics', label: 'Analytics', icon: BarChart3, color: 'purple' },
    { key: 'withdrawal', label: 'Treasury', icon: DollarSign, color: 'green' },
    { key: 'players', label: 'Players', icon: Users, color: 'cyan' },
    { key: 'system', label: 'System', icon: Database, color: 'orange' },
    { key: 'settings', label: 'Settings', icon: Settings, color: 'gray' },
  ];

  const StatCard = ({ title, value, subtitle, icon: Icon, color, trend, isLoading: cardLoading }: any) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-br from-${color}-900/20 to-${color}-800/20 border border-${color}-500/30 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden`}
    >
      {cardLoading && (
        <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-white" />
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className={`text-${color}-300 text-sm font-medium mb-1`}>{title}</h3>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subtitle && (
            <div className="flex items-center gap-2 mt-2">
              <p className={`text-${color}-400 text-xs`}>{subtitle}</p>
              {trend && (
                <span className={`text-xs flex items-center gap-1 ${
                  trend > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(trend)}%
                </span>
              )}
            </div>
          )}
        </div>
        <Icon className={`w-8 h-8 text-${color}-400`} />
      </div>
    </motion.div>
  );

  const HealthIndicator = ({ health }: { health: 'healthy' | 'warning' | 'critical' }) => {
    const config = {
      healthy: { color: 'green', icon: CheckCircle, text: 'Healthy' },
      warning: { color: 'yellow', icon: AlertCircle, text: 'Warning' },
      critical: { color: 'red', icon: XCircle, text: 'Critical' }
    };
    
    const { color, icon: Icon, text } = config[health];
    
    return (
      <div className={`flex items-center gap-2 text-${color}-400`}>
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{text}</span>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading && !analytics) {
      return (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
          <span className="ml-3 text-white">Loading analytics...</span>
        </div>
      );
    }

    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            {/* Real-time status bar */}
            <div className="bg-gray-900/50 border border-cyan-500/20 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-cyan-400" />
                    <span className="text-white font-medium">System Status</span>
                  </div>
                  <HealthIndicator health={analytics?.realTime.systemHealth || 'warning'} />
                </div>
                
                <div className="flex items-center gap-6 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span>{analytics?.realTime.playersOnline || 0} online</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    <span>{analytics?.realTime.activeTransactions || 0} active txs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>Updated {lastUpdate.toLocaleTimeString()}</span>
                  </div>
                  <button
                    onClick={refreshAnalytics}
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Key metrics grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              <StatCard
                title="Total Players"
                value={analytics?.players.total.toLocaleString() || '0'}
                subtitle={`${analytics?.players.active24h || 0} active today`}
                icon={Users}
                color="blue"
                trend={5.2}
                isLoading={isLoading}
              />
              <StatCard
                title="Game Elements"
                value={analytics?.game.totalElements.toLocaleString() || '0'}
                subtitle={`${analytics?.game.elementsMinted24h || 0} minted today`}
                icon={Gamepad2}
                color="purple"
                trend={12.8}
                isLoading={isLoading}
              />
              <StatCard
                title="Total Revenue"
                value={`${parseFloat(formatEther(BigInt(analytics?.economy.totalRevenue || '0'))).toFixed(3)} ETH`}
                subtitle={`${parseFloat(formatEther(BigInt(analytics?.economy.revenue24h || '0'))).toFixed(4)} ETH today`}
                icon={DollarSign}
                color="green"
                trend={8.5}
                isLoading={isLoading}
              />
              <StatCard
                title="Active Trades"
                value={analytics?.game.activeTrades.toLocaleString() || '0'}
                subtitle={`${analytics?.game.completedTrades24h || 0} completed today`}
                icon={TrendingUp}
                color="cyan"
                trend={-2.1}
                isLoading={isLoading}
              />
            </div>

            {/* Contract balance */}
            <div className="bg-gradient-to-r from-emerald-900/20 to-green-900/20 border border-emerald-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-emerald-300 mb-2">Contract Treasury</h3>
                  <div className="text-3xl font-bold text-white mb-2">
                    {formatEther(contractBalance)} ETH
                  </div>
                  <p className="text-emerald-400 text-sm">Available for withdrawal</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400 mb-1">Estimated USD Value</div>
                  <div className="text-lg font-semibold text-white">
                    ${(parseFloat(formatEther(contractBalance)) * 2500).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setActiveTab('withdrawal')}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg p-4 text-left transition-all"
              >
                <DollarSign className="w-6 h-6 mb-2" />
                <div className="font-medium">Withdraw Funds</div>
                <div className="text-sm opacity-80">Access treasury</div>
              </button>
              
              <button
                onClick={() => setActiveTab('analytics')}
                className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white rounded-lg p-4 text-left transition-all"
              >
                <BarChart3 className="w-6 h-6 mb-2" />
                <div className="font-medium">View Analytics</div>
                <div className="text-sm opacity-80">Detailed metrics</div>
              </button>
              
              <button
                onClick={() => setActiveTab('system')}
                className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-lg p-4 text-left transition-all"
              >
                <Database className="w-6 h-6 mb-2" />
                <div className="font-medium">System Health</div>
                <div className="text-sm opacity-80">Monitor indexer</div>
              </button>
            </div>
          </div>
        );

      case 'analytics':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Detailed Analytics</h2>
              <button
                onClick={refreshAnalytics}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            {/* Player analytics */}
            <div className="bg-gray-900/50 border border-blue-500/20 rounded-xl p-6">
              <h3 className="text-xl font-bold text-blue-300 mb-4">Player Metrics</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">{analytics?.players.total || 0}</div>
                  <div className="text-sm text-gray-400">Total Players</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-400">{analytics?.players.active24h || 0}</div>
                  <div className="text-sm text-gray-400">Active 24h</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-400">{analytics?.players.averageLevel || 0}</div>
                  <div className="text-sm text-gray-400">Average Level</div>
                </div>
              </div>

              {/* Level distribution */}
              <div>
                <h4 className="text-lg font-semibold text-white mb-3">Level Distribution</h4>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(analytics?.players.levelDistribution || {}).map(([level, count]) => (
                    <div key={level} className="bg-gray-800 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-white">{count}</div>
                      <div className="text-xs text-gray-400">Level {level}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Economic analytics */}
            <div className="bg-gray-900/50 border border-green-500/20 rounded-xl p-6">
              <h3 className="text-xl font-bold text-green-300 mb-4">Economic Metrics</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-lg font-semibold text-white mb-3">Revenue Breakdown</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Revenue:</span>
                      <span className="text-white font-medium">
                        {parseFloat(formatEther(BigInt(analytics?.economy.totalRevenue || '0'))).toFixed(4)} ETH
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">24h Revenue:</span>
                      <span className="text-green-400 font-medium">
                        {parseFloat(formatEther(BigInt(analytics?.economy.revenue24h || '0'))).toFixed(4)} ETH
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">7d Revenue:</span>
                      <span className="text-blue-400 font-medium">
                        {parseFloat(formatEther(BigInt(analytics?.economy.revenue7d || '0'))).toFixed(4)} ETH
                      </span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-lg font-semibold text-white mb-3">Trading Volume</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Volume:</span>
                      <span className="text-white font-medium">
                        {parseFloat(formatEther(BigInt(analytics?.economy.totalVolume || '0'))).toFixed(4)} ETH
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Transaction:</span>
                      <span className="text-cyan-400 font-medium">
                        {parseFloat(formatEther(BigInt(analytics?.economy.averageTransactionValue || '0'))).toFixed(4)} ETH
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Game metrics */}
            <div className="bg-gray-900/50 border border-purple-500/20 rounded-xl p-6">
              <h3 className="text-xl font-bold text-purple-300 mb-4">Game Statistics</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">{analytics?.game.totalElements || 0}</div>
                  <div className="text-sm text-gray-400">Total Elements</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{analytics?.game.elementsMinted24h || 0}</div>
                  <div className="text-sm text-gray-400">Minted 24h</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-400">{analytics?.game.totalFusions || 0}</div>
                  <div className="text-sm text-gray-400">Total Fusions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">{analytics?.game.fusions24h || 0}</div>
                  <div className="text-sm text-gray-400">Fusions 24h</div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'system':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">System Health</h2>
            
            {/* Indexer status */}
            <div className="bg-gray-900/50 border border-orange-500/20 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-orange-300">Contract Indexer</h3>
                <HealthIndicator health={analytics?.system.indexerStatus.isRunning ? 'healthy' : 'critical'} />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-lg font-semibold text-white mb-3">Status</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Running:</span>
                      <span className={analytics?.system.indexerStatus.isRunning ? 'text-green-400' : 'text-red-400'}>
                        {analytics?.system.indexerStatus.isRunning ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Last Block:</span>
                      <span className="text-white">{analytics?.system.indexerStatus.lastProcessedBlock || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Events Processed:</span>
                      <span className="text-white">{analytics?.system.indexerStatus.eventsProcessed || 0}</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-lg font-semibold text-white mb-3">Recent Errors</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {analytics?.system.indexerStatus.errors.length ? (
                      analytics.system.indexerStatus.errors.map((error, index) => (
                        <div key={index} className="text-sm text-red-400 bg-red-900/20 p-2 rounded">
                          {error}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-400">No recent errors</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Performance metrics */}
            <div className="bg-gray-900/50 border border-cyan-500/20 rounded-xl p-6">
              <h3 className="text-xl font-bold text-cyan-300 mb-4">Performance Metrics</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">{analytics?.system.performance.avgResponseTime || 0}ms</div>
                  <div className="text-sm text-gray-400">Avg Response Time</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-400">{analytics?.system.performance.uptime || 0}%</div>
                  <div className="text-sm text-gray-400">Uptime</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-400">{analytics?.system.performance.errorRate || 0}%</div>
                  <div className="text-sm text-gray-400">Error Rate</div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'withdrawal':
        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-500/30 rounded-xl p-6">
              <h3 className="text-xl font-bold text-green-300 mb-4">💰 Treasury Management</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Contract Balance:</span>
                  <span className="text-2xl font-bold text-white">
                    {formatEther(contractBalance)} ETH
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Estimated USD:</span>
                  <span className="text-green-400 font-medium">
                    ${(parseFloat(formatEther(contractBalance)) * 2500).toLocaleString()}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Your Admin Wallet:</span>
                  <span className="text-green-400 font-medium">
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Current Balance:</span>
                  <span className="text-white font-medium">
                    {balance ? formatEther(balance.value) : '0'} ETH
                  </span>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleWithdraw}
                disabled={isWithdrawing || contractBalance === BigInt(0)}
                className={`
                  w-full mt-6 py-4 rounded-lg font-bold text-lg flex items-center justify-center space-x-3
                  transition-all duration-300
                  ${contractBalance > BigInt(0) && !isWithdrawing
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg shadow-green-600/25'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }
                `}
              >
                {isWithdrawing ? (
                  <>
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    <span>Processing Withdrawal...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-6 h-6" />
                    <span>Withdraw All Funds</span>
                  </>
                )}
              </motion.button>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-yellow-300">Security Notice</h4>
                  <p className="text-sm text-yellow-200 mt-1">
                    Only withdraw funds when necessary. All transactions are recorded on-chain and cannot be reversed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return <div className="text-center py-20 text-gray-400">Select a tab to view content</div>;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="w-8 h-8 text-red-400" />
              <h1 className="text-2xl font-bold">Admin Control Center</h1>
            </div>
            <div className="text-sm text-gray-400">
              Welcome, Administrator
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`
                    flex items-center space-x-2 py-4 px-2 border-b-2 font-medium text-sm transition-colors whitespace-nowrap
                    ${activeTab === tab.key
                      ? `border-${tab.color}-500 text-${tab.color}-400`
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {renderContent()}
      </div>
    </div>
  );
};

export default AdminPanel; 