import { getCollection, COLLECTIONS } from '../../utils/mongodb';
import { MongoPlayer, MongoElement, MongoTrade, ContractEvent } from '../types/mongodb-schema';

export interface AdminAnalytics {
  // Real-time metrics
  realTime: {
    playersOnline: number;
    activeTransactions: number;
    systemHealth: 'healthy' | 'warning' | 'critical';
    lastUpdate: Date;
  };
  
  // Player metrics
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
  
  // Economic metrics
  economy: {
    totalRevenue: string; // in ETH
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
  
  // Game metrics
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
  
  // System metrics
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

export interface PublicStats {
  totalPlayers: number;
  totalElements: number;
  totalTrades: number;
  averageLevel: number;
  topPlayers: Array<{address: string, level: number, masked: boolean}>;
  recentActivity: Array<{
    type: 'mint' | 'trade' | 'fusion' | 'levelup';
    timestamp: Date;
    details: string;
  }>;
}

export class AdminAnalyticsService {
  private cache: Map<string, {data: any, timestamp: number}> = new Map();
  private readonly CACHE_DURATION = 30 * 1000; // 30 seconds

  async getAdminAnalytics(): Promise<AdminAnalytics> {
    const cached = this.getFromCache('admin-analytics');
    if (cached) return cached;

    const [players, economy, game, system] = await Promise.all([
      this.getPlayerMetrics(),
      this.getEconomicMetrics(),
      this.getGameMetrics(),
      this.getSystemMetrics()
    ]);

    const analytics: AdminAnalytics = {
      realTime: {
        playersOnline: await this.getOnlinePlayersCount(),
        activeTransactions: await this.getActiveTransactionsCount(),
        systemHealth: await this.getSystemHealth(),
        lastUpdate: new Date()
      },
      players,
      economy,
      game,
      system
    };

    this.setCache('admin-analytics', analytics);
    return analytics;
  }

  async getPublicStats(): Promise<PublicStats> {
    const cached = this.getFromCache('public-stats');
    if (cached) return cached;

    const playersCollection = await getCollection(COLLECTIONS.PLAYERS);
    const elementsCollection = await getCollection(COLLECTIONS.ELEMENTS);
    const tradesCollection = await getCollection(COLLECTIONS.TRADES);
    const eventsCollection = await getCollection(COLLECTIONS.EVENTS);

    // Basic counts
    const [totalPlayers, totalElements, totalTrades] = await Promise.all([
      playersCollection.countDocuments({ isActive: true }),
      elementsCollection.countDocuments({ isFused: false }),
      tradesCollection.countDocuments({ isCompleted: true })
    ]);

    // Average level
    const avgResult = await playersCollection.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, avgLevel: { $avg: '$baseLevel' } } }
    ]).toArray();
    const averageLevel = avgResult[0]?.avgLevel || 1;

    // Top players (anonymized for public)
    const topPlayers = await playersCollection
      .find({ isActive: true })
      .sort({ xp: -1 })
      .limit(10)
      .project({ address: 1, baseLevel: 1, xp: 1 })
      .toArray();

    // Recent activity
    const recentEvents = await eventsCollection
      .find({ processed: true })
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    const recentActivity = recentEvents.map(event => ({
      type: this.mapEventToActivityType(event.eventName),
      timestamp: event.timestamp,
      details: this.formatActivityDetails(event as ContractEvent)
    }));

    const stats: PublicStats = {
      totalPlayers,
      totalElements,
      totalTrades,
      averageLevel: Math.round(averageLevel * 10) / 10,
      topPlayers: topPlayers.map((player, index) => ({
        address: this.maskAddress(player.address),
        level: player.baseLevel,
        masked: true
      })),
      recentActivity
    };

    this.setCache('public-stats', stats);
    return stats;
  }

  private async getPlayerMetrics() {
    const playersCollection = await getCollection(COLLECTIONS.PLAYERS);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      total,
      active24h,
      active7d,
      newToday,
      levelDistribution,
      topByXP,
      topByStreak
    ] = await Promise.all([
      playersCollection.countDocuments({ isActive: true }),
      playersCollection.countDocuments({ 
        isActive: true, 
        lastSeen: { $gte: yesterday } 
      }),
      playersCollection.countDocuments({ 
        isActive: true, 
        lastSeen: { $gte: weekAgo } 
      }),
      playersCollection.countDocuments({ 
        createdAt: { $gte: yesterday } 
      }),
      this.getLevelDistribution(),
      playersCollection.find({ isActive: true })
        .sort({ xp: -1 })
        .limit(10)
        .project({ address: 1, xp: 1, baseLevel: 1 })
        .toArray(),
      playersCollection.find({ isActive: true })
        .sort({ streak: -1 })
        .limit(10)
        .project({ address: 1, streak: 1 })
        .toArray()
    ]);

    // Calculate average level
    const avgResult = await playersCollection.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, avgLevel: { $avg: '$baseLevel' } } }
    ]).toArray();

    return {
      total,
      active24h,
      active7d,
      newToday,
      averageLevel: Math.round((avgResult[0]?.avgLevel || 1) * 10) / 10,
      levelDistribution,
      topPlayers: {
        byXP: topByXP.map(p => ({
          address: p.address,
          xp: p.xp,
          level: p.baseLevel
        })),
        byStreak: topByStreak.map(p => ({
          address: p.address,
          streak: p.streak
        })),
        byNetWorth: [] // TODO: Calculate from elements + trades
      }
    };
  }

  private async getEconomicMetrics() {
    const eventsCollection = await getCollection(COLLECTIONS.EVENTS);
    const tradesCollection = await getCollection(COLLECTIONS.TRADES);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Calculate revenue from mints and trades
    const [mints, trades24h, trades7d, completedTrades] = await Promise.all([
      eventsCollection.find({ 
        eventName: { $in: ['ElementMinted', 'BatchElementsMinted'] } 
      }).toArray(),
      tradesCollection.find({ 
        isCompleted: true, 
        completedAt: { $gte: yesterday } 
      }).toArray(),
      tradesCollection.find({ 
        isCompleted: true, 
        completedAt: { $gte: weekAgo } 
      }).toArray(),
      tradesCollection.find({ isCompleted: true }).toArray()
    ]);

    // Calculate totals
    const totalMintRevenue = mints.reduce((sum, mint) => {
      const price = mint.data.price || mint.data.totalPrice || '0';
      return sum + parseInt(price);
    }, 0);

    const totalTradeVolume = completedTrades.reduce((sum, trade) => {
      return sum + parseInt(trade.price);
    }, 0);

    const revenue24h = trades24h.reduce((sum, trade) => {
      return sum + parseInt(trade.price) * 0.025; // 2.5% fee
    }, 0);

    const revenue7d = trades7d.reduce((sum, trade) => {
      return sum + parseInt(trade.price) * 0.025;
    }, 0);

    return {
      totalRevenue: (totalMintRevenue + totalTradeVolume * 0.025).toString(),
      revenue24h: revenue24h.toString(),
      revenue7d: revenue7d.toString(),
      averageTransactionValue: completedTrades.length > 0 
        ? (totalTradeVolume / completedTrades.length).toString()
        : '0',
      totalVolume: totalTradeVolume.toString(),
      contractBalance: '0', // TODO: Get from contract
      priceMetrics: {
        averageElementPrice: '50000000000000000', // Mock data
        floorPrice: '10000000000000000',
        ceilingPrice: '1000000000000000000'
      }
    };
  }

  private async getGameMetrics() {
    const elementsCollection = await getCollection(COLLECTIONS.ELEMENTS);
    const eventsCollection = await getCollection(COLLECTIONS.EVENTS);
    const tradesCollection = await getCollection(COLLECTIONS.TRADES);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalElements,
      elementsMinted24h,
      totalFusions,
      fusions24h,
      activeTrades,
      completedTrades24h
    ] = await Promise.all([
      elementsCollection.countDocuments({ isFused: false }),
      eventsCollection.countDocuments({
        eventName: { $in: ['ElementMinted', 'BatchElementsMinted'] },
        timestamp: { $gte: yesterday }
      }),
      eventsCollection.countDocuments({ eventName: 'ElementFused' }),
      eventsCollection.countDocuments({
        eventName: 'ElementFused',
        timestamp: { $gte: yesterday }
      }),
      tradesCollection.countDocuments({ isActive: true }),
      tradesCollection.countDocuments({
        isCompleted: true,
        completedAt: { $gte: yesterday }
      })
    ]);

    return {
      totalElements,
      elementsMinted24h,
      totalFusions,
      fusions24h,
      activeTrades,
      completedTrades24h,
      rarityDistribution: {
        'COMMON': Math.floor(totalElements * 0.5),
        'UNCOMMON': Math.floor(totalElements * 0.3),
        'RARE': Math.floor(totalElements * 0.15),
        'EPIC': Math.floor(totalElements * 0.05),
        'GENESIS': Math.floor(totalElements * 0.001)
      },
      elementTypeDistribution: {
        'REACTOR': Math.floor(totalElements * 0.2),
        'STORAGE': Math.floor(totalElements * 0.2),
        'DEFENSE_TOWER': Math.floor(totalElements * 0.2),
        'LIVING_MODULE': Math.floor(totalElements * 0.2),
        'TECH_LAB': Math.floor(totalElements * 0.2)
      }
    };
  }

  private async getSystemMetrics() {
    const statusCollection = await getCollection('indexer_status');
    const indexerStatus = await statusCollection.findOne({ type: 'main' });

    return {
      indexerStatus: {
        isRunning: indexerStatus?.isRunning || false,
        lastProcessedBlock: indexerStatus?.lastProcessedBlock || 0,
        eventsProcessed: indexerStatus?.eventsProcessed || 0,
        errors: indexerStatus?.errors || [],
        lastRunAt: indexerStatus?.lastRunAt || new Date()
      },
      performance: {
        avgResponseTime: 150, // Mock data
        errorRate: 0.1,
        uptime: 99.9
      }
    };
  }

  private async getLevelDistribution() {
    const playersCollection = await getCollection(COLLECTIONS.PLAYERS);
    const distribution = await playersCollection.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$baseLevel', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();

    const result: Record<number, number> = {};
    distribution.forEach(item => {
      result[item._id] = item.count;
    });

    return result;
  }

  private async getOnlinePlayersCount(): Promise<number> {
    const playersCollection = await getCollection(COLLECTIONS.PLAYERS);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    return playersCollection.countDocuments({
      isActive: true,
      lastSeen: { $gte: fiveMinutesAgo }
    });
  }

  private async getActiveTransactionsCount(): Promise<number> {
    const tradesCollection = await getCollection(COLLECTIONS.TRADES);
    return tradesCollection.countDocuments({ isActive: true });
  }

  private async getSystemHealth(): Promise<'healthy' | 'warning' | 'critical'> {
    const statusCollection = await getCollection('indexer_status');
    const status = await statusCollection.findOne({ type: 'main' });
    
    if (!status?.isRunning) return 'critical';
    if (status.errors && status.errors.length > 5) return 'warning';
    
    return 'healthy';
  }

  private maskAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private mapEventToActivityType(eventName: string): 'mint' | 'trade' | 'fusion' | 'levelup' {
    switch (eventName) {
      case 'ElementMinted':
      case 'BatchElementsMinted':
        return 'mint';
      case 'TradeCompleted':
        return 'trade';
      case 'ElementFused':
        return 'fusion';
      case 'BaseLevelUp':
        return 'levelup';
      default:
        return 'mint';
    }
  }

  private formatActivityDetails(event: ContractEvent): string {
    switch (event.eventName) {
      case 'ElementMinted':
        return `Element #${event.data.tokenId} minted`;
      case 'TradeCompleted':
        return `Trade #${event.data.tradeId} completed`;
      case 'ElementFused':
        return `Elements fused → #${event.data.newTokenId}`;
      case 'BaseLevelUp':
        return `Level up to ${event.data.newLevel}`;
      default:
        return 'Game activity';
    }
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}

export const adminAnalytics = new AdminAnalyticsService(); 