/**
 * 🐛 DEBUG UTILITY dla Paid Pins
 * Sprawdza stan paid pins w Firebase
 */

import { db } from './firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { PinDuration } from '../basechat/PinnedJobs/types/pinTypes';

interface PaidPinDebugInfo {
  postId: string;
  owner: string;
  duration: PinDuration;
  expiresAt: number;
  paidAmount: string;
  txHash: string;
  isActive: boolean;
  createdAt: number;
  timeLeft?: string;
}

interface PostDebugInfo {
  postId: string;
  isPinned: boolean;
  isPaidPin: boolean;
  pinExpiresAt?: number;
  pinOwner?: string;
  pinTxHash?: string;
  content: string;
  author: string;
}

/**
 * 🔍 Sprawdź wszystkie paid pins w Firebase
 */
export const debugAllPaidPins = async (): Promise<{
  totalPins: number;
  activePins: number;
  expiredPins: number;
  pins: PaidPinDebugInfo[];
}> => {
  console.log('🔍 Debugging all paid pins...');
  
  try {
    const paidPinsQuery = query(
      collection(db, 'paidPins'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    
    const snapshot = await getDocs(paidPinsQuery);
    const pins: PaidPinDebugInfo[] = [];
    let activePins = 0;
    let expiredPins = 0;
    const now = Date.now();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const isExpired = data.expiresAt <= now;
      
      if (data.isActive && !isExpired) {
        activePins++;
      } else {
        expiredPins++;
      }
      
      const timeLeft = isExpired ? 'EXPIRED' : formatTimeLeft(data.expiresAt - now);
      
      pins.push({
        postId: data.postId,
        owner: data.owner,
        duration: data.duration,
        expiresAt: data.expiresAt,
        paidAmount: data.paidAmount,
        txHash: data.txHash,
        isActive: data.isActive,
        createdAt: data.createdAt,
        timeLeft
      });
    });
    
    const result = {
      totalPins: snapshot.docs.length,
      activePins,
      expiredPins,
      pins
    };
    
    console.log('📊 Paid Pins Debug Results:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error debugging paid pins:', error);
    return {
      totalPins: 0,
      activePins: 0,
      expiredPins: 0,
      pins: []
    };
  }
};

/**
 * 🔍 Sprawdź specific post czy jest pinowany
 */
export const debugPostPinStatus = async (postId: string): Promise<PostDebugInfo | null> => {
  console.log(`🔍 Debugging post pin status: ${postId}`);
  
  try {
    const postsQuery = query(
      collection(db, 'posts'),
      where('__name__', '==', postId)
    );
    
    const snapshot = await getDocs(postsQuery);
    
    if (snapshot.empty) {
      console.log('❌ Post not found in Firebase');
      return null;
    }
    
    const postDoc = snapshot.docs[0];
    const data = postDoc.data();
    
    const result: PostDebugInfo = {
      postId,
      isPinned: data.isPinned || false,
      isPaidPin: data.isPaidPin || false,
      pinExpiresAt: data.pinExpiresAt,
      pinOwner: data.pinOwner,
      pinTxHash: data.pinTxHash,
      content: data.content?.substring(0, 100) + '...' || 'No content',
      author: data.author
    };
    
    console.log('📌 Post Pin Status:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error debugging post:', error);
    return null;
  }
};

/**
 * 🔍 Znajdź paid pin po transaction hash
 */
export const debugPinByTxHash = async (txHash: string): Promise<PaidPinDebugInfo | null> => {
  console.log(`🔍 Searching for pin by txHash: ${txHash}`);
  
  try {
    const paidPinsQuery = query(
      collection(db, 'paidPins'),
      where('txHash', '==', txHash)
    );
    
    const snapshot = await getDocs(paidPinsQuery);
    
    if (snapshot.empty) {
      console.log('❌ No paid pin found with this txHash');
      return null;
    }
    
    const data = snapshot.docs[0].data();
    const now = Date.now();
    const timeLeft = data.expiresAt <= now ? 'EXPIRED' : formatTimeLeft(data.expiresAt - now);
    
    const result: PaidPinDebugInfo = {
      postId: data.postId,
      owner: data.owner,
      duration: data.duration,
      expiresAt: data.expiresAt,
      paidAmount: data.paidAmount,
      txHash: data.txHash,
      isActive: data.isActive,
      createdAt: data.createdAt,
      timeLeft
    };
    
    console.log('💰 Found paid pin:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error searching by txHash:', error);
    return null;
  }
};

/**
 * 🔍 Debug user's paid pins
 */
export const debugUserPaidPins = async (userAddress: string): Promise<PaidPinDebugInfo[]> => {
  console.log(`🔍 Debugging paid pins for user: ${userAddress}`);
  
  try {
    const userPinsQuery = query(
      collection(db, 'paidPins'),
      where('owner', '==', userAddress.toLowerCase()),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(userPinsQuery);
    const pins: PaidPinDebugInfo[] = [];
    const now = Date.now();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const timeLeft = data.expiresAt <= now ? 'EXPIRED' : formatTimeLeft(data.expiresAt - now);
      
      pins.push({
        postId: data.postId,
        owner: data.owner,
        duration: data.duration,
        expiresAt: data.expiresAt,
        paidAmount: data.paidAmount,
        txHash: data.txHash,
        isActive: data.isActive,
        createdAt: data.createdAt,
        timeLeft
      });
    });
    
    console.log(`👤 User paid pins (${pins.length}):`, pins);
    return pins;
    
  } catch (error) {
    console.error('❌ Error debugging user pins:', error);
    return [];
  }
};

/**
 * Helper function to format time left
 */
const formatTimeLeft = (timeLeft: number): string => {
  if (timeLeft <= 0) return 'EXPIRED';
  
  const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
  const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

/**
 * 🎯 MAIN DEBUG FUNCTION
 * Wyświetla kompletny raport o paid pins
 */
export const debugPaidPinsReport = async (userAddress?: string, txHash?: string): Promise<void> => {
  console.log('🚀 Starting Paid Pins Debug Report...');
  
  // 1. All paid pins overview
  const overview = await debugAllPaidPins();
  
  // 2. User specific pins (if provided)
  if (userAddress) {
    await debugUserPaidPins(userAddress);
  }
  
  // 3. Specific transaction (if provided)
  if (txHash) {
    const pinData = await debugPinByTxHash(txHash);
    if (pinData) {
      await debugPostPinStatus(pinData.postId);
    }
  }
  
  console.log('✅ Debug report completed');
  console.log('📊 Summary:', {
    totalPins: overview.totalPins,
    activePins: overview.activePins,
    expiredPins: overview.expiredPins
  });
}; 