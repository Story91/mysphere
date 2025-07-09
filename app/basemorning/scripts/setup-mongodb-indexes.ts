import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'basemorning';

async function setupIndexes() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    console.log('🔧 Setting up MongoDB indexes for optimal performance...');
    
    // Players collection indexes
    const playersCollection = db.collection('players');
    await playersCollection.createIndex({ address: 1 }, { unique: true });
    await playersCollection.createIndex({ xp: -1 }); // For leaderboard
    await playersCollection.createIndex({ baseLevel: -1 }); // For level stats
    await playersCollection.createIndex({ isActive: 1 }); // For active players
    await playersCollection.createIndex({ lastSeen: -1 }); // For online status
    await playersCollection.createIndex({ createdAt: 1 }); // For new players
    await playersCollection.createIndex({ streak: -1 }); // For streak leaderboard
    await playersCollection.createIndex({ lastCheckIn: 1 }); // For check-in queries
    
    // Elements collection indexes
    const elementsCollection = db.collection('elements');
    await elementsCollection.createIndex({ tokenId: 1 }, { unique: true });
    await elementsCollection.createIndex({ owner: 1 }); // For user elements
    await elementsCollection.createIndex({ isFused: 1 }); // For active elements
    await elementsCollection.createIndex({ isForSale: 1 }); // For marketplace
    await elementsCollection.createIndex({ rarity: 1 }); // For rarity stats
    await elementsCollection.createIndex({ elementType: 1 }); // For type stats
    await elementsCollection.createIndex({ level: -1 }); // For level sorting
    await elementsCollection.createIndex({ power: -1 }); // For power sorting
    await elementsCollection.createIndex({ mintedAt: -1 }); // For recent mints
    await elementsCollection.createIndex({ createdAt: -1 }); // For recent activity
    
    // Trades collection indexes
    const tradesCollection = db.collection('trades');
    await tradesCollection.createIndex({ tradeId: 1 }, { unique: true });
    await tradesCollection.createIndex({ seller: 1 }); // For seller's trades
    await tradesCollection.createIndex({ buyer: 1 }); // For buyer's trades
    await tradesCollection.createIndex({ isActive: 1 }); // For active trades
    await tradesCollection.createIndex({ isCompleted: 1 }); // For completed trades
    await tradesCollection.createIndex({ tokenId: 1 }); // For element trades
    await tradesCollection.createIndex({ price: 1 }); // For price sorting
    await tradesCollection.createIndex({ createdAt: -1 }); // For recent trades
    await tradesCollection.createIndex({ completedAt: -1 }); // For completed trades
    
    // Contract events collection indexes
    const eventsCollection = db.collection('contract_events');
    await eventsCollection.createIndex({ blockNumber: 1 }); // For block processing
    await eventsCollection.createIndex({ transactionHash: 1 }); // For tx lookup
    await eventsCollection.createIndex({ eventName: 1 }); // For event filtering
    await eventsCollection.createIndex({ timestamp: -1 }); // For recent events
    await eventsCollection.createIndex({ processed: 1 }); // For processing status
    await eventsCollection.createIndex({ 
      transactionHash: 1, 
      logIndex: 1 
    }, { unique: true }); // Prevent duplicate events
    
    // Compound indexes for common queries
    await eventsCollection.createIndex({ 
      eventName: 1, 
      timestamp: -1 
    }); // For event timeline
    await eventsCollection.createIndex({ 
      'data.player': 1, 
      timestamp: -1 
    }); // For player activity
    
    // Leaderboard collection indexes
    const leaderboardCollection = db.collection('leaderboard');
    await leaderboardCollection.createIndex({ address: 1 }, { unique: true });
    await leaderboardCollection.createIndex({ xp: -1 }); // For XP ranking
    await leaderboardCollection.createIndex({ level: -1 }); // For level ranking
    await leaderboardCollection.createIndex({ netWorth: -1 }); // For wealth ranking
    await leaderboardCollection.createIndex({ rank: 1 }); // For rank lookup
    await leaderboardCollection.createIndex({ updatedAt: -1 }); // For fresh data
    
    // Achievements collection indexes
    const achievementsCollection = db.collection('achievements');
    await achievementsCollection.createIndex({ 
      playerId: 1, 
      achievementId: 1 
    }, { unique: true });
    await achievementsCollection.createIndex({ playerId: 1 }); // For player achievements
    await achievementsCollection.createIndex({ achievementId: 1 }); // For achievement stats
    await achievementsCollection.createIndex({ completedAt: -1 }); // For recent achievements
    
    // Indexer status collection
    const indexerStatusCollection = db.collection('indexer_status');
    await indexerStatusCollection.createIndex({ type: 1 }, { unique: true });
    
    // Missions collection indexes (for future use)
    const missionsCollection = db.collection('missions');
    await missionsCollection.createIndex({ playerId: 1 }); // For player missions
    await missionsCollection.createIndex({ missionId: 1 }); // For mission lookup
    await missionsCollection.createIndex({ status: 1 }); // For mission status
    await missionsCollection.createIndex({ startedAt: -1 }); // For recent missions
    await missionsCollection.createIndex({ completedAt: -1 }); // For completed missions
    
    // Alliances collection indexes (for future use)
    const alliancesCollection = db.collection('alliances');
    await alliancesCollection.createIndex({ allianceId: 1 }, { unique: true });
    await alliancesCollection.createIndex({ leader: 1 }); // For alliance leaders
    await alliancesCollection.createIndex({ 'members': 1 }); // For member lookup
    await alliancesCollection.createIndex({ totalPower: -1 }); // For alliance ranking
    await alliancesCollection.createIndex({ level: -1 }); // For alliance level
    
    // TTL indexes for temporary data
    await eventsCollection.createIndex(
      { timestamp: 1 }, 
      { expireAfterSeconds: 60 * 60 * 24 * 30 } // 30 days
    );
    
    console.log('✅ MongoDB indexes created successfully!');
    
    // Display index information
    const collections = [
      'players', 'elements', 'trades', 'contract_events', 
      'leaderboard', 'achievements', 'indexer_status', 
      'missions', 'alliances'
    ];
    
    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const indexes = await collection.listIndexes().toArray();
      console.log(`📊 ${collectionName} collection has ${indexes.length} indexes`);
    }
    
  } catch (error) {
    console.error('❌ Error setting up indexes:', error);
  } finally {
    await client.close();
  }
}

// Validation schema setup
async function setupValidationSchemas() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    console.log('🔧 Setting up validation schemas...');
    
    // Players collection validation
    await db.command({
      collMod: 'players',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['address', 'isActive'],
          properties: {
            address: {
              bsonType: 'string',
              pattern: '^0x[a-fA-F0-9]{40}$',
              description: 'must be a valid Ethereum address'
            },
            xp: {
              bsonType: 'number',
              minimum: 0,
              description: 'must be a non-negative number'
            },
            baseLevel: {
              bsonType: 'number',
              minimum: 1,
              maximum: 10,
              description: 'must be between 1 and 10'
            },
            streak: {
              bsonType: 'number',
              minimum: 0,
              description: 'must be a non-negative number'
            },
            isActive: {
              bsonType: 'bool',
              description: 'must be a boolean'
            }
          }
        }
      }
    });
    
    // Elements collection validation
    await db.command({
      collMod: 'elements',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['tokenId', 'owner'],
          properties: {
            tokenId: {
              bsonType: 'string',
              description: 'must be a string'
            },
            owner: {
              bsonType: 'string',
              pattern: '^0x[a-fA-F0-9]{40}$',
              description: 'must be a valid Ethereum address'
            },
            level: {
              bsonType: 'number',
              minimum: 1,
              description: 'must be at least 1'
            },
            power: {
              bsonType: 'number',
              minimum: 0,
              description: 'must be non-negative'
            },
            isFused: {
              bsonType: 'bool',
              description: 'must be a boolean'
            },
            isForSale: {
              bsonType: 'bool',
              description: 'must be a boolean'
            }
          }
        }
      }
    });
    
    console.log('✅ Validation schemas set up successfully!');
    
  } catch (error) {
    console.error('❌ Error setting up validation schemas:', error);
  } finally {
    await client.close();
  }
}

// Performance monitoring setup
async function setupPerformanceMonitoring() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    console.log('🔧 Setting up performance monitoring...');
    
    // Enable profiling for slow operations (>100ms)
    await db.command({
      profile: 2,
      slowms: 100,
      sampleRate: 1.0
    });
    
    console.log('✅ Performance monitoring enabled!');
    
  } catch (error) {
    console.error('❌ Error setting up performance monitoring:', error);
  } finally {
    await client.close();
  }
}

// Main setup function
async function main() {
  console.log('🚀 Starting MongoDB setup for Base Morning Game...');
  
  await setupIndexes();
  await setupValidationSchemas();
  await setupPerformanceMonitoring();
  
  console.log('🎉 MongoDB setup completed successfully!');
  console.log('💡 Your database is now optimized for high performance!');
  
  // Performance tips
  console.log('\n📈 Performance Tips:');
  console.log('- Indexes are optimized for common queries');
  console.log('- TTL indexes will automatically clean old data');
  console.log('- Validation schemas ensure data integrity');
  console.log('- Profiling is enabled for slow query detection');
  console.log('- Use compound indexes for complex queries');
  console.log('- Monitor index usage with db.collection.getIndexes()');
}

if (require.main === module) {
  main().catch(console.error);
}

export { setupIndexes, setupValidationSchemas, setupPerformanceMonitoring }; 