import { createPublicClient, http, parseAbiItem, Log, Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import { ObjectId } from 'mongodb';
import { getCollection, COLLECTIONS } from '../../utils/mongodb';
import { 
  ContractEvent, 
  MongoPlayer, 
  MongoElement, 
  MongoTrade, 
  IndexerStatus 
} from '../types/mongodb-schema';
import { CONTRACT_ADDRESS } from '../config/contract';

// Create viem client for Base Sepolia
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org')
});

// Event signatures for the Base Morning Game contract
const EVENT_SIGNATURES = {
  PlayerRegistered: 'event PlayerRegistered(address player)',
  CheckInCompleted: 'event CheckInCompleted(address player, uint256 streak, uint256 xpEarned)',
  BaseLevelUp: 'event BaseLevelUp(address player, uint8 newLevel)',
  ElementMinted: 'event ElementMinted(address player, uint256 tokenId, uint256 price)',
  BatchElementsMinted: 'event BatchElementsMinted(address player, uint8 quantity, uint256 totalPrice, uint256 discount)',
  ElementFused: 'event ElementFused(address player, uint256[] burnedTokenIds, uint256 newTokenId)',
  TradeCreated: 'event TradeCreated(uint256 tradeId, address seller, uint256 tokenId, uint256 price)',
  TradeCompleted: 'event TradeCompleted(uint256 tradeId, address buyer)',
  TradeCancelled: 'event TradeCancelled(uint256 tradeId)',
  FundsWithdrawn: 'event FundsWithdrawn(address owner, uint256 amount)'
} as const;

class ContractIndexer {
  private isRunning = false;
  private lastProcessedBlock = 0;

  constructor() {
    this.initializeStatus();
  }

  private async initializeStatus() {
    const statusCollection = await getCollection('indexer_status');
    const status = await statusCollection.findOne({ type: 'main' });
    
    if (!status) {
      // Get current block number and set as starting point
      const currentBlock = await publicClient.getBlockNumber();
      await statusCollection.insertOne({
        type: 'main',
        lastProcessedBlock: Number(currentBlock) - 1000, // Start 1000 blocks back
        isRunning: false,
        lastRunAt: new Date(),
        errors: [],
        eventsProcessed: 0
      });
      this.lastProcessedBlock = Number(currentBlock) - 1000;
    } else {
      this.lastProcessedBlock = status.lastProcessedBlock;
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('🔄 Indexer already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting contract indexer...');
    
    await this.updateStatus({ isRunning: true, lastRunAt: new Date() });
    
    try {
      await this.processNewBlocks();
      this.startRealTimeListener();
    } catch (error) {
      console.error('❌ Indexer start error:', error);
      this.isRunning = false;
      await this.updateStatus({ 
        isRunning: false, 
        errors: [`Start error: ${error}`] 
      });
    }
  }

  async stop() {
    this.isRunning = false;
    await this.updateStatus({ isRunning: false });
    console.log('🛑 Indexer stopped');
  }

  private async processNewBlocks() {
    const currentBlock = await publicClient.getBlockNumber();
    
    if (this.lastProcessedBlock >= currentBlock) {
      console.log('📊 Already up to date');
      return;
    }

    console.log(`📡 Processing blocks ${this.lastProcessedBlock + 1} to ${currentBlock}`);
    
    // Process in chunks to avoid timeout
    const chunkSize = 1000;
    for (let fromBlock = this.lastProcessedBlock + 1; fromBlock <= currentBlock; fromBlock += chunkSize) {
      const toBlock = Math.min(fromBlock + chunkSize - 1, Number(currentBlock));
      
      await this.processBlockRange(BigInt(fromBlock), BigInt(toBlock));
      await this.updateStatus({ lastProcessedBlock: toBlock });
      this.lastProcessedBlock = toBlock;
    }
  }

  private async processBlockRange(fromBlock: bigint, toBlock: bigint) {
    try {
      // Get all logs for our contract in this range
      const logs = await publicClient.getLogs({
        address: CONTRACT_ADDRESS as Address,
        fromBlock,
        toBlock
      });

      console.log(`📝 Found ${logs.length} logs in blocks ${fromBlock}-${toBlock}`);

      for (const log of logs) {
        await this.processLog(log);
      }
    } catch (error) {
      console.error(`❌ Error processing blocks ${fromBlock}-${toBlock}:`, error);
      await this.addError(`Block range ${fromBlock}-${toBlock}: ${error}`);
    }
  }

  private async processLog(log: Log) {
    try {
      const eventName = this.getEventName(log);
      if (!eventName) return;

      // Type guards for required fields
      if (!log.transactionHash || log.blockNumber === null || log.logIndex === null) {
        console.error('❌ Log missing required fields');
        return;
      }

      const contractEvent: ContractEvent = {
        eventName,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        address: log.address,
        data: this.parseEventData(eventName, log),
        timestamp: new Date(),
        blockTimestamp: 0, // Will be filled from block data
        processed: false
      };

      // Get block timestamp
      const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
      contractEvent.blockTimestamp = Number(block.timestamp);
      contractEvent.timestamp = new Date(Number(block.timestamp) * 1000);

      // Save event to MongoDB
      const eventsCollection = await getCollection(COLLECTIONS.EVENTS);
      await eventsCollection.insertOne(contractEvent);

      // Process the event to update related collections
      await this.handleEvent(contractEvent);

      // Mark as processed
      await eventsCollection.updateOne(
        { transactionHash: contractEvent.transactionHash, logIndex: contractEvent.logIndex },
        { $set: { processed: true, processedAt: new Date() } }
      );

      await this.incrementEventsProcessed();

    } catch (error) {
      console.error('❌ Error processing log:', error);
      await this.addError(`Log processing: ${error}`);
    }
  }

  private getEventName(log: Log): string | null {
    // Simple topic matching - in production, use proper ABI decoding
    const topic = log.topics[0];
    if (!topic) return null;
    
    // Map topics to event names (you'd get these from your contract's ABI)
    const topicToEvent: Record<string, string> = {
      // Add your actual event topics here
      // These are just examples - get real topics from your deployed contract
    };

    return topicToEvent[topic] || null;
  }

  private parseEventData(eventName: string, log: Log): any {
    // This is simplified - in production, use proper ABI decoding
    // with libraries like viem's decodeEventLog
    
    try {
      switch (eventName) {
        case 'PlayerRegistered':
          return { player: log.topics[1] || '' };
        
        case 'CheckInCompleted':
          return {
            player: log.topics[1] || '',
            // Decode other parameters from log.data
          };
        
        case 'ElementMinted':
          return {
            player: log.topics[1] || '',
            tokenId: log.topics[2] || '',
            // Decode price from log.data
          };
        
        // Add other event parsers
        default:
          return { raw: log.data };
      }
    } catch (error) {
      console.error(`Error parsing ${eventName}:`, error);
      return { error: `Parse error: ${error}` };
    }
  }

  private async handleEvent(event: ContractEvent) {
    try {
      switch (event.eventName) {
        case 'PlayerRegistered':
          await this.handlePlayerRegistered(event);
          break;
        
        case 'CheckInCompleted':
          await this.handleCheckIn(event);
          break;
        
        case 'ElementMinted':
          await this.handleElementMinted(event);
          break;
        
        case 'BatchElementsMinted':
          await this.handleBatchElementsMinted(event);
          break;
        
        case 'ElementFused':
          await this.handleElementFused(event);
          break;
        
        case 'TradeCreated':
          await this.handleTradeCreated(event);
          break;
        
        case 'TradeCompleted':
          await this.handleTradeCompleted(event);
          break;
        
        default:
          console.log(`🔍 Unhandled event: ${event.eventName}`);
      }
    } catch (error) {
      console.error(`❌ Error handling ${event.eventName}:`, error);
      throw error;
    }
  }

  private async handlePlayerRegistered(event: ContractEvent) {
    const playersCollection = await getCollection(COLLECTIONS.PLAYERS);
    const player = event.data.player;
    
    if (!player) {
      console.error('❌ PlayerRegistered event missing player address');
      return;
    }
    
    const existingPlayer = await playersCollection.findOne({ address: player });
    if (existingPlayer) return; // Already exists
    
    const newPlayer: MongoPlayer = {
      address: player,
      xp: 0,
      lastCheckIn: 0,
      streak: 0,
      baseLevel: 1,
      isActive: true,
      lastPvpBattle: 0,
      pvpWins: 0,
      resources: 0,
      allianceId: 0,
      totalElements: 0,
      totalSpent: 0,
      totalEarned: 0,
      achievements: [],
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      lastSeen: event.timestamp
    };
    
    await playersCollection.insertOne(newPlayer);
    console.log(`👤 New player registered: ${player}`);
  }

  private async handleCheckIn(event: ContractEvent) {
    const playersCollection = await getCollection(COLLECTIONS.PLAYERS);
    
    if (!event.data.player) {
      console.error('❌ CheckIn event missing player address');
      return;
    }
    
    await playersCollection.updateOne(
      { address: event.data.player },
      {
        $set: {
          lastCheckIn: event.blockTimestamp,
          streak: event.data.streak || 0,
          lastSeen: event.timestamp,
          updatedAt: event.timestamp
        },
        $inc: {
          xp: event.data.xpEarned || 0
        }
      }
    );
    
    console.log(`✅ Check-in processed for ${event.data.player}, streak: ${event.data.streak}`);
  }

  private async handleElementMinted(event: ContractEvent) {
    const elementsCollection = await getCollection(COLLECTIONS.ELEMENTS);
    const playersCollection = await getCollection(COLLECTIONS.PLAYERS);
    
    if (!event.data.player || !event.data.tokenId) {
      console.error('❌ ElementMinted event missing required data');
      return;
    }
    
    // Add element to collection
    const newElement: MongoElement = {
      tokenId: event.data.tokenId,
      owner: event.data.player,
      elementType: 0, // Will need to query from contract
      rarity: 0, // Will need to query from contract  
      level: 1,
      power: 100,
      mintedAt: event.blockTimestamp,
      mintPrice: event.data.price || "0",
      isFused: false,
      isForSale: false,
      tradeHistory: [],
      createdAt: event.timestamp,
      updatedAt: event.timestamp
    };
    
    await elementsCollection.insertOne(newElement);
    
    // Update player stats
    await playersCollection.updateOne(
      { address: event.data.player },
      {
        $inc: {
          totalElements: 1,
          totalSpent: parseInt(event.data.price || "0")
        },
        $set: {
          lastSeen: event.timestamp,
          updatedAt: event.timestamp
        }
      }
    );
    
    console.log(`🎨 Element minted: ${event.data.tokenId} for ${event.data.player}`);
  }

  private async handleBatchElementsMinted(event: ContractEvent) {
    const playersCollection = await getCollection(COLLECTIONS.PLAYERS);
    
    if (!event.data.player) {
      console.error('❌ BatchElementsMinted event missing player address');
      return;
    }
    
    // Update player stats for batch mint
    await playersCollection.updateOne(
      { address: event.data.player },
      {
        $inc: {
          totalElements: event.data.quantity || 1,
          totalSpent: parseInt(event.data.totalPrice || "0")
        },
        $set: {
          lastSeen: event.timestamp,
          updatedAt: event.timestamp
        }
      }
    );
    
    console.log(`🎨🎨 Batch minted: ${event.data.quantity} elements for ${event.data.player}`);
  }

  private async handleElementFused(event: ContractEvent) {
    const elementsCollection = await getCollection(COLLECTIONS.ELEMENTS);
    
    if (!event.data.burnedTokenIds || !event.data.newTokenId) {
      console.error('❌ ElementFused event missing required data');
      return;
    }
    
    // Mark burned elements as fused
    for (const tokenId of event.data.burnedTokenIds) {
      await elementsCollection.updateOne(
        { tokenId },
        {
          $set: {
            isFused: true,
            fusedInto: event.data.newTokenId,
            updatedAt: event.timestamp
          }
        }
      );
    }
    
    console.log(`🔥 Elements fused: ${event.data.burnedTokenIds} → ${event.data.newTokenId}`);
  }

  private async handleTradeCreated(event: ContractEvent) {
    const tradesCollection = await getCollection(COLLECTIONS.TRADES);
    
    if (!event.data.tradeId || !event.data.seller || !event.data.tokenId || !event.data.price) {
      console.error('❌ TradeCreated event missing required data');
      return;
    }
    
    const newTrade: MongoTrade = {
      tradeId: event.data.tradeId,
      seller: event.data.seller,
      tokenId: event.data.tokenId,
      price: event.data.price,
      isActive: true,
      isCompleted: false,
      createdAt: event.timestamp
    };
    
    await tradesCollection.insertOne(newTrade);
    console.log(`💰 Trade created: ${event.data.tradeId} by ${event.data.seller}`);
  }

  private async handleTradeCompleted(event: ContractEvent) {
    const tradesCollection = await getCollection(COLLECTIONS.TRADES);
    
    if (!event.data.tradeId || !event.data.buyer) {
      console.error('❌ TradeCompleted event missing required data');
      return;
    }
    
    await tradesCollection.updateOne(
      { tradeId: event.data.tradeId },
      {
        $set: {
          buyer: event.data.buyer,
          isActive: false,
          isCompleted: true,
          completedAt: event.timestamp
        }
      }
    );
    
    console.log(`✅ Trade completed: ${event.data.tradeId} by ${event.data.buyer}`);
  }

  private startRealTimeListener() {
    // Start watching for new blocks
    console.log('👂 Starting real-time event listener...');
    
    // In production, you'd use WebSocket or subscription
    setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.processNewBlocks();
      } catch (error) {
        console.error('❌ Real-time processing error:', error);
        await this.addError(`Real-time: ${error}`);
      }
    }, 30000); // Check every 30 seconds
  }

  private async updateStatus(updates: Partial<IndexerStatus>) {
    const statusCollection = await getCollection('indexer_status');
    await statusCollection.updateOne(
      { type: 'main' },
      { $set: updates }
    );
  }

  private async addError(error: string) {
    const statusCollection = await getCollection('indexer_status');
    const status = await statusCollection.findOne({ type: 'main' });
    if (status) {
      const errors = [...(status.errors || []), error].slice(-10); // Keep last 10 errors
      await statusCollection.updateOne(
        { type: 'main' },
        { $set: { errors } }
      );
    }
  }

  private async incrementEventsProcessed() {
    const statusCollection = await getCollection('indexer_status');
    await statusCollection.updateOne(
      { type: 'main' },
      { $inc: { eventsProcessed: 1 } }
    );
  }
}

// Export singleton instance
export const contractIndexer = new ContractIndexer();

// API for manual control
export async function startIndexer() {
  return contractIndexer.start();
}

export async function stopIndexer() {
  return contractIndexer.stop();
}

export async function getIndexerStatus() {
  const statusCollection = await getCollection('indexer_status');
  return statusCollection.findOne({ type: 'main' });
} 