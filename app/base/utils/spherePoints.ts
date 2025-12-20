// Sphere Points from Firebase (basechat user data)
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';

export interface SpherePoints {
  postPoints: number;
  likePoints: number;
  activityBonus: number;
  baseNameBonus: number;
  sphereBonus: number;
  camperBonus: number;
  celoBonus: number;
  worldBonus: number;
  referralPoints: number;
  totalPoints: number;
}

export interface BaseChatProfile {
  displayName?: string;
  bio?: string;
  avatar?: string;
  postCount: number;
  likesReceived: number;
  spherePoints?: SpherePoints;
}

export async function fetchSpherePoints(walletAddress: string): Promise<SpherePoints | null> {
  try {
    const userRef = doc(db, 'users', walletAddress.toLowerCase());
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      // Try without lowercasing
      const userRef2 = doc(db, 'users', walletAddress);
      const userSnap2 = await getDoc(userRef2);
      
      if (!userSnap2.exists()) return null;
      
      const data = userSnap2.data();
      return data.baseChatPoints || null;
    }
    
    const data = userSnap.data();
    return data.baseChatPoints || null;
  } catch (error) {
    console.error('Error fetching Sphere Points:', error);
    return null;
  }
}

export async function fetchBaseChatProfile(walletAddress: string): Promise<BaseChatProfile | null> {
  try {
    const userRef = doc(db, 'users', walletAddress.toLowerCase());
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      const userRef2 = doc(db, 'users', walletAddress);
      const userSnap2 = await getDoc(userRef2);
      
      if (!userSnap2.exists()) return null;
      
      const data = userSnap2.data();
      return {
        displayName: data.displayName,
        bio: data.bio,
        avatar: data.avatar,
        postCount: data.postCount || 0,
        likesReceived: data.likesReceived || 0,
        spherePoints: data.baseChatPoints || null
      };
    }
    
    const data = userSnap.data();
    return {
      displayName: data.displayName,
      bio: data.bio,
      avatar: data.avatar,
      postCount: data.postCount || 0,
      likesReceived: data.likesReceived || 0,
      spherePoints: data.baseChatPoints || null
    };
  } catch (error) {
    console.error('Error fetching BaseChat Profile:', error);
    return null;
  }
}

