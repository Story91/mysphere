import { NextRequest, NextResponse } from 'next/server';
import { getCollection, COLLECTIONS } from '../../../utils/mongodb';
import { MongoPlayer, MongoElement, MongoTrade, ContractEvent } from '../../../basemorning/types/mongodb-schema';

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
      address: string;
      xp: number;
      level: number;
      streak: number;
    }>;
  };
  activity: {
    recentActivities: Array<{
      type: 'mint' | 'trade' | 'fusion' | 'levelup';
      player: string;
      timestamp: Date;
      details: string;
    }>;
  };
  health: {
    status: 'healthy' | 'warning' | 'critical';
    uptime: number;
  };
}

// Cache for analytics data
const cache = new Map<string, {data: any, timestamp: number}>();
const CACHE_DURATION = 30 * 1000; // 30 seconds

function getFromCache(key: string): any | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function maskAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function mapEventToActivityType(eventName: string): 'mint' | 'trade' | 'fusion' | 'levelup' {
  switch (eventName) {
    case 'ElementMinted':
    case 'BatchElementsMinted':
      return 'mint';
    case 'TradeCompleted':
      return 'trade';
    case 'ElementFused':
    case 'EpicElementFused':
    case 'GenesisElementFused':
      return 'fusion';
    case 'BaseLevelUp':
      return 'levelup';
    default:
      return 'mint';
  }
}

function formatActivityDetails(event: ContractEvent): string {
  switch (event.eventName) {
    case 'ElementMinted':
      return 'minted an element';
    case 'BatchElementsMinted':
      return `minted ${event.data.quantity} elements`;
    case 'TradeCompleted':
      return 'completed a trade';
    case 'ElementFused':
      return 'fused elements';
    case 'BaseLevelUp':
      return `reached level ${event.data.newLevel}`;
    default:
      return 'performed an action';
  }
}

async function getPublicStats(): Promise<PublicStats> {
  const cached = getFromCache('public-stats');
  if (cached) return cached;

  try {
    const playersCollection = await getCollection(COLLECTIONS.PLAYERS);
    const elementsCollection = await getCollection(COLLECTIONS.ELEMENTS);
    const tradesCollection = await getCollection(COLLECTIONS.TRADES);
    const eventsCollection = await getCollection(COLLECTIONS.EVENTS);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Basic counts
    const [totalPlayers, totalElements, activeTrades] = await Promise.all([
      playersCollection.countDocuments({ isActive: true }),
      elementsCollection.countDocuments({ isFused: false }),
      tradesCollection.countDocuments({ isActive: true })
    ]);

    // Players online (active in last 5 minutes)
    const playersOnline = await playersCollection.countDocuments({
      isActive: true,
      lastSeen: { $gte: fiveMinutesAgo }
    });

    // New players today
    const newToday = await playersCollection.countDocuments({
      isActive: true,
      createdAt: { $gte: yesterday }
    });

    // Average level
    const avgResult = await playersCollection.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, avgLevel: { $avg: '$baseLevel' } } }
    ]).toArray();
    const averageLevel = avgResult[0]?.avgLevel || 1;

    // Game metrics
    const [elementsMinted24h, totalFusions, fusions24h] = await Promise.all([
      eventsCollection.countDocuments({
        eventName: { $in: ['ElementMinted', 'BatchElementsMinted'] },
        timestamp: { $gte: yesterday }
      }),
      eventsCollection.countDocuments({
        eventName: { $in: ['ElementFused', 'EpicElementFused', 'GenesisElementFused'] }
      }),
      eventsCollection.countDocuments({
        eventName: { $in: ['ElementFused', 'EpicElementFused', 'GenesisElementFused'] },
        timestamp: { $gte: yesterday }
      })
    ]);

    // Top players (anonymized for public)
    const topPlayers = await playersCollection
      .find({ isActive: true })
      .sort({ xp: -1 })
      .limit(10)
      .project({ address: 1, baseLevel: 1, xp: 1, streak: 1 })
      .toArray();

    // Recent activity
    const recentEvents = await eventsCollection
      .find({ processed: true })
      .sort({ timestamp: -1 })
      .limit(15)
      .toArray();

    const recentActivities = recentEvents.map(event => ({
      type: mapEventToActivityType(event.eventName),
      player: maskAddress(event.data.player || event.data.address || 'Unknown'),
      timestamp: event.timestamp,
      details: formatActivityDetails(event as ContractEvent)
    }));

    const stats: PublicStats = {
      players: {
        total: totalPlayers,
        online: playersOnline,
        newToday,
        averageLevel: Math.round(averageLevel * 10) / 10
      },
      game: {
        totalElements,
        elementsMinted24h,
        totalFusions,
        fusions24h,
        activeTrades
      },
      leaderboard: {
        topPlayers: topPlayers.map((player, index) => ({
          rank: index + 1,
          address: maskAddress(player.address),
          xp: player.xp,
          level: player.baseLevel,
          streak: player.streak || 0
        }))
      },
      activity: {
        recentActivities
      },
      health: {
        status: 'healthy', // Simple implementation
        uptime: 99.9
      }
    };

    setCache('public-stats', stats);
    return stats;
  } catch (error) {
    console.error('Error fetching public stats:', error);
    // Return default stats on error
    return {
      players: { total: 0, online: 0, newToday: 0, averageLevel: 1 },
      game: { totalElements: 0, elementsMinted24h: 0, totalFusions: 0, fusions24h: 0, activeTrades: 0 },
      leaderboard: { topPlayers: [] },
      activity: { recentActivities: [] },
      health: { status: 'critical', uptime: 0 }
    };
  }
}

async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const cached = getFromCache('admin-analytics');
  if (cached) return cached;

  try {
    const publicStats = await getPublicStats();
    
    // For now, return enhanced version of public stats
    // In production, you'd implement more detailed admin metrics
    const adminStats: AdminAnalytics = {
      realTime: {
        playersOnline: publicStats.players.online,
        activeTransactions: 0, // Implement if needed
        systemHealth: publicStats.health.status,
        lastUpdate: new Date()
      },
      players: {
        total: publicStats.players.total,
        active24h: publicStats.players.online,
        active7d: publicStats.players.total,
        newToday: publicStats.players.newToday,
        averageLevel: publicStats.players.averageLevel,
        levelDistribution: {}, // Implement if needed
        topPlayers: {
          byXP: publicStats.leaderboard.topPlayers.map(p => ({
            address: p.address,
            xp: p.xp,
            level: p.level
          })),
          byStreak: [],
          byNetWorth: []
        }
      },
      economy: {
        totalRevenue: '0',
        revenue24h: '0',
        revenue7d: '0',
        averageTransactionValue: '0',
        totalVolume: '0',
        contractBalance: '0',
        priceMetrics: {
          averageElementPrice: '0',
          floorPrice: '0',
          ceilingPrice: '0'
        }
      },
      game: {
        totalElements: publicStats.game.totalElements,
        elementsMinted24h: publicStats.game.elementsMinted24h,
        totalFusions: publicStats.game.totalFusions,
        fusions24h: publicStats.game.fusions24h,
        activeTrades: publicStats.game.activeTrades,
        completedTrades24h: 0,
        rarityDistribution: {},
        elementTypeDistribution: {}
      },
      system: {
        indexerStatus: {
          isRunning: true,
          lastProcessedBlock: 0,
          eventsProcessed: 0,
          errors: [],
          lastRunAt: new Date()
        },
        performance: {
          avgResponseTime: 150,
          errorRate: 0.1,
          uptime: publicStats.health.uptime
        }
      }
    };

    setCache('admin-analytics', adminStats);
    return adminStats;
  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'public';
    const adminKey = searchParams.get('admin_key');
    
    // Check if admin access is requested
    if (type === 'admin') {
      // Verify admin key
      const ADMIN_KEY = process.env.ADMIN_API_KEY;
      if (!adminKey || adminKey !== ADMIN_KEY) {
        return NextResponse.json(
          { error: 'Unauthorized access' },
          { status: 401 }
        );
      }
      
      // Return admin analytics
      const adminData = await getAdminAnalytics();
      return NextResponse.json(adminData);
    }
    
    // Return public stats by default
    const publicData = await getPublicStats();
    return NextResponse.json(publicData);
    
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, adminKey } = await request.json();
    
    // Verify admin key
    const ADMIN_KEY = process.env.ADMIN_API_KEY;
    if (!adminKey || adminKey !== ADMIN_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 401 }
      );
    }
    
    switch (action) {
      case 'refresh_cache':
        // Clear cache to force refresh
        cache.clear();
        const freshData = await getAdminAnalytics();
        return NextResponse.json({ 
          success: true, 
          message: 'Cache refreshed',
          data: freshData 
        });
        
      case 'clear_cache':
        cache.clear();
        return NextResponse.json({ 
          success: true, 
          message: 'Cache cleared' 
        });
        
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Stats API POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 