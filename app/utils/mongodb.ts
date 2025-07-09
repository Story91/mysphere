import { MongoClient, Db, Collection } from 'mongodb';

const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient> | null = null;

function initializeClient(): Promise<MongoClient> {
  if (!process.env.MONGODB_URI) {
    throw new Error('Please add your MongoDB URI to .env.local');
  }

  const uri = process.env.MONGODB_URI as string;

  if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    let globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>;
    };

    if (!globalWithMongo._mongoClientPromise) {
      client = new MongoClient(uri, options);
      globalWithMongo._mongoClientPromise = client.connect();
    }
    return globalWithMongo._mongoClientPromise;
  } else {
    // In production mode, it's best to not use a global variable.
    client = new MongoClient(uri, options);
    return client.connect();
  }
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
function getClientPromise(): Promise<MongoClient> {
  if (!clientPromise) {
    clientPromise = initializeClient();
  }
  return clientPromise;
}

export default getClientPromise;

// Database helper functions
export async function getDatabase(): Promise<Db> {
  const client = await getClientPromise();
  return client.db('basemorning');
}

export async function getCollection(collectionName: string): Promise<Collection> {
  const db = await getDatabase();
  return db.collection(collectionName);
}

// Collection names
export const COLLECTIONS = {
  PLAYERS: 'players',
  ELEMENTS: 'elements',
  TRADES: 'trades',
  EVENTS: 'contract_events',
  LEADERBOARD: 'leaderboard',
  ACHIEVEMENTS: 'achievements'
} as const; 