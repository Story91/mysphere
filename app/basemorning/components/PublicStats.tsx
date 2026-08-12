import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  Trophy, 
  Activity, 
  TrendingUp, 
  RefreshCw, 
  Zap, 
  Coins,
  Gamepad2,
  Target,
  Clock,
  Shield,
  Star
} from 'lucide-react';

// Public stats interface (no sensitive data)
interface PublicStats {
  players: {
    total: number;
    online: number;
    newToday: number;
    averageLevel: number;
  };
  game: {
    totalElements: number;
    elementsMinted24h: number;
    totalFusions: number;
    fusions24h: number;
    activeTrades: number;
  };
  leaderboard: {
    topPlayers: Array<{
      rank: number;
      address: string; // Masked for privacy
      xp: number;
      level: number;
      streak: number;
    }>;
  };
  activity: {
    recentActivities: Array<{
      type: 'mint' | 'trade' | 'fusion' | 'levelup';
      player: string; // Masked address
      timestamp: Date;
      details: string;
    }>;
  };
  health: {
    status: 'healthy' | 'warning' | 'critical';
    uptime: number;
  };
}

const PublicStats: React.FC = () => {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch public stats via API
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/basemorning/stats?type=public');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        } else {
          console.error('Failed to fetch public stats:', response.statusText);
        }
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to fetch public stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();

    // Auto-refresh co 60 s, ale tylko gdy karta jest widoczna - odswiezanie
    // statystyk na ukrytej karcie to czysty koszt bez odbiorcy. Powrot na
    // karte robi odswiezenie od razu, wiec nikt nie patrzy na stare liczby.
    const interval = setInterval(() => {
      if (!document.hidden) fetchStats();
    }, 60000);
    const onVisible = () => {
      if (!document.hidden) fetchStats();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const refreshStats = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/basemorning/stats?type=public');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to refresh stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color, trend }: any) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-br from-${color}-900/20 to-${color}-800/20 border border-${color}-500/30 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden`}
    >
      {isLoading && (
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
                  {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingUp className="w-3 h-3 rotate-180" />}
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

  const ActivityItem = ({ activity }: { activity: any }) => {
    const getActivityIcon = (type: string) => {
      switch (type) {
        case 'mint': return <Coins className="w-4 h-4 text-yellow-400" />;
        case 'trade': return <TrendingUp className="w-4 h-4 text-green-400" />;
        case 'fusion': return <Zap className="w-4 h-4 text-purple-400" />;
        case 'levelup': return <Star className="w-4 h-4 text-blue-400" />;
        default: return <Activity className="w-4 h-4 text-gray-400" />;
      }
    };

    const getActivityColor = (type: string) => {
      switch (type) {
        case 'mint': return 'yellow';
        case 'trade': return 'green';
        case 'fusion': return 'purple';
        case 'levelup': return 'blue';
        default: return 'gray';
      }
    };

    const color = getActivityColor(activity.type);
    
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3 p-3 bg-gray-900/30 rounded-lg"
      >
        <div className={`p-2 rounded-full bg-${color}-500/20`}>
          {getActivityIcon(activity.type)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">{activity.player}</span>
            <span className="text-gray-400 text-sm">{activity.details}</span>
          </div>
          <div className="text-xs text-gray-500">
            {new Date(activity.timestamp).toLocaleString()}
          </div>
        </div>
      </motion.div>
    );
  };

  const LeaderboardItem = ({ player, index }: { player: any, index: number }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="flex items-center gap-4 p-4 bg-gray-900/30 rounded-lg"
    >
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
        ${index < 3 ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white' : 'bg-gray-700 text-gray-300'}
      `}>
        {player.rank}
      </div>
      
      <div className="flex-1">
        <div className="text-white font-medium">{player.address}</div>
        <div className="text-sm text-gray-400">
          Level {player.level} • {player.xp.toLocaleString()} XP
        </div>
      </div>
      
      <div className="text-right">
        <div className="text-orange-400 font-medium">{player.streak} day streak</div>
        <div className="text-xs text-gray-500">Current</div>
      </div>
    </motion.div>
  );

  const HealthIndicator = ({ status }: { status: 'healthy' | 'warning' | 'critical' }) => {
    const config = {
      healthy: { color: 'green', text: 'All Systems Operational' },
      warning: { color: 'yellow', text: 'Minor Issues Detected' },
      critical: { color: 'red', text: 'Service Degraded' }
    };
    
    const { color, text } = config[status];
    
    return (
      <div className={`flex items-center gap-2 text-${color}-400`}>
        <div className={`w-3 h-3 rounded-full bg-${color}-400 animate-pulse`} />
        <span className="text-sm font-medium">{text}</span>
      </div>
    );
  };

  if (isLoading && !stats) {
    return (
      <div className="bg-gray-900/50 border border-cyan-500/20 rounded-xl p-8">
        <div className="flex items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
          <span className="ml-3 text-white">Loading game statistics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target className="w-8 h-8 text-cyan-400" />
          <h2 className="text-2xl font-bold text-white">Game Statistics</h2>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-400">
            Updated {lastUpdate.toLocaleTimeString()}
          </div>
          <button
            onClick={refreshStats}
            className="text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="bg-gray-900/50 border border-cyan-500/20 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-400" />
              <span className="text-white font-medium">Game Health</span>
            </div>
            <HealthIndicator status={stats?.health.status || 'warning'} />
          </div>
          
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>{stats?.players.online || 0} online</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>{stats?.health.uptime || 0}% uptime</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          title="Total Players"
          value={stats?.players.total.toLocaleString() || '0'}
          subtitle={`${stats?.players.newToday || 0} joined today`}
          icon={Users}
          color="blue"
          trend={5.2}
        />
        <StatCard
          title="Game Elements"
          value={stats?.game.totalElements.toLocaleString() || '0'}
          subtitle={`${stats?.game.elementsMinted24h || 0} minted today`}
          icon={Gamepad2}
          color="purple"
          trend={12.8}
        />
        <StatCard
          title="Total Fusions"
          value={stats?.game.totalFusions.toLocaleString() || '0'}
          subtitle={`${stats?.game.fusions24h || 0} fusions today`}
          icon={Zap}
          color="orange"
          trend={8.5}
        />
        <StatCard
          title="Active Trades"
          value={stats?.game.activeTrades.toLocaleString() || '0'}
          subtitle="Marketplace activity"
          icon={TrendingUp}
          color="green"
          trend={-2.1}
        />
      </div>

      {/* Leaderboard and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leaderboard */}
        <div className="bg-gray-900/50 border border-purple-500/20 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Trophy className="w-6 h-6 text-purple-400" />
            <h3 className="text-xl font-bold text-purple-300">Top Players</h3>
          </div>
          
          <div className="space-y-3">
            {stats?.leaderboard.topPlayers.slice(0, 10).map((player, index) => (
              <LeaderboardItem key={player.rank} player={player} index={index} />
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-900/50 border border-green-500/20 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-6 h-6 text-green-400" />
            <h3 className="text-xl font-bold text-green-300">Live Activity</h3>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {stats?.activity.recentActivities.slice(0, 15).map((activity, index) => (
              <ActivityItem key={index} activity={activity} />
            ))}
          </div>
        </div>
      </div>

      {/* Additional game info */}
      <div className="bg-gradient-to-r from-cyan-900/20 to-blue-900/20 border border-cyan-500/30 rounded-xl p-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-cyan-300 mb-2">Average Player Level</h3>
          <div className="text-4xl font-bold text-white mb-2">
            {stats?.players.averageLevel || 0}
          </div>
          <p className="text-cyan-400 text-sm">
            Community is getting stronger! 🚀
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicStats; 