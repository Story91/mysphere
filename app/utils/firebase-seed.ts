/**
 * 🌱 FIREBASE SEEDING UTILITY
 * Dodaje test data do database i wymusza utworzenie indexes
 */

import { db } from './firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp, deleteField, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { PinDuration } from '../basechat/PinnedJobs/types/pinTypes';

// Test users dla mock data
const TEST_USERS = [
  '0x7476c2Ee2E79e70bdabA30D0eD0ADe6e7bB3bfb3',
  '0x8586c2Ee2E79e70bdabA30D0eD0ADe6e7bB3bfb4', 
  '0x9696c2Ee2E79e70bdabA30D0eD0ADe6e7bB3bfb5',
  '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd' // Admin
];

const TEST_DURATIONS: PinDuration[] = ['HOUR_1', 'HOURS_6', 'HOURS_24', 'DAYS_7'];

/**
 * Generuje realistic timestamp dla expired/active pins
 */
const generateTimestamp = (type: 'expired' | 'active' | 'future') => {
  const now = Date.now();
  
  switch (type) {
    case 'expired':
      return now - (Math.random() * 2 * 60 * 60 * 1000); // 0-2 hours ago
    case 'active':
      return now + (Math.random() * 24 * 60 * 60 * 1000); // 0-24 hours from now
    case 'future':
      return now + (24 * 60 * 60 * 1000) + (Math.random() * 6 * 24 * 60 * 60 * 1000); // 1-7 days from now
  }
};

/**
 * 🎯 SEED 1: Dodaj aktywne paid pins
 * To spowoduje utworzenie indexes dla collection 'paidPins'
 */
export const seedActivePaidPins = async (): Promise<{
  created: number;
  errors: string[];
}> => {
  console.log('🌱 Seeding active paid pins...');
  
  const result = {
    created: 0,
    errors: [] as string[]
  };

  // Utwórz 10 aktywnych paid pins
  for (let i = 0; i < 10; i++) {
    try {
      const owner = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
      const duration = TEST_DURATIONS[Math.floor(Math.random() * TEST_DURATIONS.length)];
      const now = Date.now();
      const expiresAt = generateTimestamp('active');
      
      const paidPinData = {
        postId: `test-post-${i + 1}`,
        owner,
        duration,
        expiresAt,
        paidAmount: ['0.0005', '0.002', '0.005', '0.02'][Math.floor(Math.random() * 4)],
        txHash: '0x' + Math.random().toString(16).substr(2, 64),
        isActive: true,
        createdAt: now - (Math.random() * 24 * 60 * 60 * 1000), // Random time in last 24h
        network: 'base'
      };

      await addDoc(collection(db, 'paidPins'), paidPinData);
      result.created++;
    } catch (error) {
      result.errors.push(`Failed to create paid pin ${i + 1}: ${error}`);
    }
  }

  console.log(`✅ Created ${result.created} active paid pins`);
  return result;
};

/**
 * 🎯 SEED 2: Dodaj expired paid pins
 * To przetestuje cleanup queries i wywoła indexowanie
 */
export const seedExpiredPaidPins = async (): Promise<{
  created: number;
  errors: string[];
}> => {
  console.log('🌱 Seeding expired paid pins...');
  
  const result = {
    created: 0,
    errors: [] as string[]
  };

  // Utwórz 5 expired paid pins
  for (let i = 0; i < 5; i++) {
    try {
      const owner = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
      const duration = TEST_DURATIONS[Math.floor(Math.random() * TEST_DURATIONS.length)];
      const now = Date.now();
      const expiresAt = generateTimestamp('expired');
      
      const paidPinData = {
        postId: `expired-post-${i + 1}`,
        owner,
        duration,
        expiresAt,
        paidAmount: ['0.0005', '0.002', '0.005', '0.02'][Math.floor(Math.random() * 4)],
        txHash: '0x' + Math.random().toString(16).substr(2, 64),
        isActive: true, // Będzie zmienione na false przez cleanup
        createdAt: now - (Math.random() * 48 * 60 * 60 * 1000), // Random time in last 48h
        network: 'base'
      };

      await addDoc(collection(db, 'paidPins'), paidPinData);
      result.created++;
    } catch (error) {
      result.errors.push(`Failed to create expired paid pin ${i + 1}: ${error}`);
    }
  }

  console.log(`✅ Created ${result.created} expired paid pins`);
  return result;
};

/**
 * 🎯 SEED 3: Dodaj test posts z paid pin fields
 * To wywoła indexowanie dla collection 'posts'
 */
export const seedTestPostsWithPaidPins = async (): Promise<{
  created: number;
  errors: string[];
}> => {
  console.log('🌱 Seeding test posts with paid pins...');
  
  const result = {
    created: 0,
    errors: [] as string[]
  };

  const testPosts = [
    {
      postId: 'test-post-1',
      content: '🎯 Test paid pin #1 - Active pin expires in 2 hours',
      isPaidPin: true,
      pinExpiresAt: Date.now() + (2 * 60 * 60 * 1000), // 2 hours
      duration: 'HOURS_6' as PinDuration
    },
    {
      postId: 'test-post-2', 
      content: '⚡ Test paid pin #2 - Active pin expires tomorrow',
      isPaidPin: true,
      pinExpiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      duration: 'HOURS_24' as PinDuration
    },
    {
      postId: 'expired-post-1',
      content: '💀 Test expired pin #1 - Should be cleaned up',
      isPaidPin: true,
      pinExpiresAt: Date.now() - (30 * 60 * 1000), // 30 minutes ago
      duration: 'HOUR_1' as PinDuration
    },
    {
      postId: 'expired-post-2',
      content: '💀 Test expired pin #2 - Should be cleaned up',
      isPaidPin: true,
      pinExpiresAt: Date.now() - (60 * 60 * 1000), // 1 hour ago
      duration: 'HOURS_6' as PinDuration
    }
  ];

  for (const testPost of testPosts) {
    try {
      const owner = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
      const now = Date.now();
      
      const postData = {
        author: owner,
        content: testPost.content,
        timestamp: now - (Math.random() * 24 * 60 * 60 * 1000),
        likes: Math.floor(Math.random() * 50),
        likedBy: [],
        comments: [],
        tags: ['test', 'paid-pin'],
        mentions: [],
        visibility: 'public',
        txHash: '0x' + Math.random().toString(16).substr(2, 64),
        network: 'base',
        
        // Paid pin fields
        isPinned: true,
        isPaidPin: testPost.isPaidPin,
        pinnedAt: now,
        pinExpiresAt: testPost.pinExpiresAt,
        pinDuration: testPost.duration,
        pinOwner: owner,
        pinAmountPaid: ['0.0005', '0.002', '0.005', '0.02'][Math.floor(Math.random() * 4)],
        pinTxHash: '0x' + Math.random().toString(16).substr(2, 64)
      };

      // Dodaj do posts collection
      await addDoc(collection(db, 'posts'), postData);
      result.created++;
    } catch (error) {
      result.errors.push(`Failed to create test post ${testPost.postId}: ${error}`);
    }
  }

  console.log(`✅ Created ${result.created} test posts with paid pins`);
  return result;
};

/**
 * 🚨 SEED 4: Force Index Creation
 * Wykonuje queries które wymuszą utworzenie indexes
 */
export const forceIndexCreation = async (): Promise<{
  triggeredQueries: string[];
  errors: string[];
}> => {
  console.log('🔥 Forcing index creation by running complex queries...');
  
  const result = {
    triggeredQueries: [] as string[],
    errors: [] as string[]
  };

  try {
    // Query 1: Expired Pins Query (posts collection)
    console.log('🎯 Query 1: Expired pins in posts collection...');
    const expiredQuery = query(
      collection(db, 'posts'),
      where('isPaidPin', '==', true),
      where('pinExpiresAt', '<=', Date.now())
    );
    
    const expiredPosts = await getDocs(expiredQuery);
    result.triggeredQueries.push(`Posts expired query: ${expiredPosts.size} results`);
    
  } catch (error) {
    result.errors.push(`Posts expired query failed: ${error}`);
    console.log('📋 Index creation link should be in the error above ☝️');
  }

  try {
    // Query 2: Active Pins by Expiration (paidPins collection)
    console.log('🎯 Query 2: Active pins by expiration...');
    const activePinsQuery = query(
      collection(db, 'paidPins'),
      where('isActive', '==', true),
      where('expiresAt', '<=', Date.now())
    );
    
    const activePins = await getDocs(activePinsQuery);
    result.triggeredQueries.push(`PaidPins active query: ${activePins.size} results`);
    
  } catch (error) {
    result.errors.push(`PaidPins active query failed: ${error}`);
    console.log('📋 Index creation link should be in the error above ☝️');
  }

  try {
    // Query 3: Post Active Pins Query
    console.log('🎯 Query 3: Post active pins query...');
    const postActivePinsQuery = query(
      collection(db, 'paidPins'),
      where('postId', '==', 'test-post-1'),
      where('isActive', '==', true)
    );
    
    const postActivePins = await getDocs(postActivePinsQuery);
    result.triggeredQueries.push(`Post active pins query: ${postActivePins.size} results`);
    
  } catch (error) {
    result.errors.push(`Post active pins query failed: ${error}`);
    console.log('📋 Index creation link should be in the error above ☝️');
  }

  try {
    // Query 4: User Pins History
    console.log('🎯 Query 4: User pins history...');
    const userPinsQuery = query(
      collection(db, 'paidPins'),
      where('owner', '==', TEST_USERS[0])
      // Note: createdAt ordering would require additional index
    );
    
    const userPins = await getDocs(userPinsQuery);
    result.triggeredQueries.push(`User pins query: ${userPins.size} results`);
    
  } catch (error) {
    result.errors.push(`User pins query failed: ${error}`);
    console.log('📋 Index creation link should be in the error above ☝️');
  }

  console.log('🔥 Index creation queries completed!');
  console.log('📋 Check Firebase Console errors above for index creation links');
  
  return result;
};

/**
 * 🎯 MASTER SEEDING FUNCTION
 * Wykonuje wszystkie seeding operacje i wymusza indexowanie
 */
export const seedCompleteTestData = async (): Promise<{
  totalCreated: number;
  indexesTriggered: number;
  errors: string[];
}> => {
  console.log('🚀 Starting complete database seeding...');
  
  const result = {
    totalCreated: 0,
    indexesTriggered: 0,
    errors: [] as string[]
  };

  try {
    // Step 1: Seed active paid pins
    const activePins = await seedActivePaidPins();
    result.totalCreated += activePins.created;
    result.errors.push(...activePins.errors);

    // Step 2: Seed expired paid pins
    const expiredPins = await seedExpiredPaidPins();
    result.totalCreated += expiredPins.created;
    result.errors.push(...expiredPins.errors);

    // Step 3: Seed test posts
    const testPosts = await seedTestPostsWithPaidPins();
    result.totalCreated += testPosts.created;
    result.errors.push(...testPosts.errors);

    // Step 4: Force index creation
    const indexResults = await forceIndexCreation();
    result.indexesTriggered = indexResults.triggeredQueries.length;
    result.errors.push(...indexResults.errors);

    console.log('✅ Complete seeding finished!');
    console.log(`📊 Total created: ${result.totalCreated} documents`);
    console.log(`🔥 Indexes triggered: ${result.indexesTriggered} queries`);
    
    if (result.errors.length > 0) {
      console.log('⚠️ Errors (expected for index creation):');
      result.errors.forEach(error => console.log(`  - ${error}`));
    }

  } catch (error) {
    result.errors.push(`Master seeding failed: ${error}`);
  }

  return result;
};

/**
 * 🧹 CLEANUP TEST DATA
 * Usuwa wszystkie test dane z database
 */
export const cleanupTestData = async (): Promise<{
  deleted: number;
  errors: string[];
}> => {
  console.log('🧹 Cleaning up test data...');
  
  const result = {
    deleted: 0,
    errors: [] as string[]
  };

  try {
    // Cleanup test posts
    const testPostsQuery = query(
      collection(db, 'posts'),
      where('tags', 'array-contains', 'test')
    );
    
    const testPosts = await getDocs(testPostsQuery);
    for (const testPost of testPosts.docs) {
      await deleteDoc(testPost.ref);
      result.deleted++;
    }

    // Cleanup test paid pins
    const testPaidPinsQuery = query(
      collection(db, 'paidPins'),
      where('network', '==', 'base')
    );
    
    const testPaidPins = await getDocs(testPaidPinsQuery);
    for (const testPaidPin of testPaidPins.docs) {
      await deleteDoc(testPaidPin.ref);
      result.deleted++;
    }

  } catch (error) {
    result.errors.push(`Cleanup failed: ${error}`);
  }

  console.log(`🧹 Cleanup completed: ${result.deleted} documents deleted`);
  return result;
}; 