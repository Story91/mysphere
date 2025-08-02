import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  increment,
  updateDoc
} from 'firebase/firestore';
import { db } from './config';

// ===============================================
// 🔔 FOLLOW SYSTEM INTERFACES
// ===============================================

export interface Follow {
  id?: string;
  followerId: string;    // Kto obserwuje
  followingId: string;   // Kogo obserwuje
  createdAt: any;
  followerName?: string;
  followingName?: string;
  mutualFollow?: boolean; // Czy obserwują się wzajemnie
}

export interface FollowStats {
  followers: number;
  following: number;
  mutualFollows: number;
}

export interface UserWithFollowStatus {
  address: string;
  name: string;
  avatar?: string;
  isFollowing: boolean;
  isFollower: boolean;
  isMutual: boolean;
  followedAt?: number;
}

// ===============================================
// 🚀 CORE FOLLOW FUNCTIONS
// ===============================================

/**
 * Obserwuj użytkownika
 */
export const followUser = async (
  followerId: string, 
  followingId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (followerId === followingId) {
      return { success: false, error: 'Nie możesz obserwować samego siebie' };
    }

    // Sprawdź czy już obserwuje
    const existingFollow = await checkIfFollowing(followerId, followingId);
    if (existingFollow) {
      return { success: false, error: 'Już obserwujesz tego użytkownika' };
    }

    const batch = writeBatch(db);

    // 1. Dodaj follow do kolekcji follows
    const followRef = doc(collection(db, 'follows'));
    batch.set(followRef, {
      followerId,
      followingId,
      createdAt: serverTimestamp()
    });

    // 2. Dodaj do subcollection followerId/following
    const followingRef = doc(db, `users/${followerId}/following`, followingId);
    batch.set(followingRef, {
      userId: followingId,
      followedAt: serverTimestamp()
    });

    // 3. Dodaj do subcollection followingId/followers
    const followerRef = doc(db, `users/${followingId}/followers`, followerId);
    batch.set(followerRef, {
      userId: followerId,
      followedAt: serverTimestamp()
    });

    // 4. Aktualizuj liczniki w profilach użytkowników
    const followerProfileRef = doc(db, 'users', followerId);
    batch.update(followerProfileRef, {
      'socialStats.following': increment(1),
      lastActive: serverTimestamp()
    });

    const followingProfileRef = doc(db, 'users', followingId);
    batch.update(followingProfileRef, {
      'socialStats.followers': increment(1),
      lastActive: serverTimestamp()
    });

    await batch.commit();

    // 5. Wyślij powiadomienie (asynchronicznie)
    setTimeout(async () => {
      try {
        await addNotification(followingId, {
          type: 'FOLLOW',
          fromUser: followerId,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error sending follow notification:', error);
      }
    }, 100);

    console.log(`✅ ${followerId} zaczął obserwować ${followingId}`);
    return { success: true };

  } catch (error) {
    console.error('Error following user:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Błąd podczas obserwowania' 
    };
  }
};

/**
 * Przestań obserwować użytkownika
 */
export const unfollowUser = async (
  followerId: string, 
  followingId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Sprawdź czy obserwuje
    const isFollowing = await checkIfFollowing(followerId, followingId);
    if (!isFollowing) {
      return { success: false, error: 'Nie obserwujesz tego użytkownika' };
    }

    const batch = writeBatch(db);

    // 1. Usuń z głównej kolekcji follows
    const followsQuery = query(
      collection(db, 'follows'),
      where('followerId', '==', followerId),
      where('followingId', '==', followingId)
    );
    const followsSnapshot = await getDocs(followsQuery);
    followsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // 2. Usuń z subcollections
    const followingRef = doc(db, `users/${followerId}/following`, followingId);
    batch.delete(followingRef);

    const followerRef = doc(db, `users/${followingId}/followers`, followerId);
    batch.delete(followerRef);

    // 3. Aktualizuj liczniki
    const followerProfileRef = doc(db, 'users', followerId);
    batch.update(followerProfileRef, {
      'socialStats.following': increment(-1),
      lastActive: serverTimestamp()
    });

    const followingProfileRef = doc(db, 'users', followingId);
    batch.update(followingProfileRef, {
      'socialStats.followers': increment(-1),
      lastActive: serverTimestamp()
    });

    await batch.commit();

    console.log(`❌ ${followerId} przestał obserwować ${followingId}`);
    return { success: true };

  } catch (error) {
    console.error('Error unfollowing user:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Błąd podczas przestania obserwowania' 
    };
  }
};

/**
 * Sprawdź czy użytkownik obserwuje innego użytkownika
 */
export const checkIfFollowing = async (
  followerId: string, 
  followingId: string
): Promise<boolean> => {
  try {
    const followingRef = doc(db, `users/${followerId}/following`, followingId);
    const followingDoc = await getDoc(followingRef);
    return followingDoc.exists();
  } catch (error) {
    console.error('Error checking follow status:', error);
    return false;
  }
};

/**
 * Pobierz statystyki obserwowania użytkownika
 */
export const getUserFollowStats = async (userId: string): Promise<FollowStats> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      const socialStats = userData.socialStats || {};
      
      return {
        followers: socialStats.followers || 0,
        following: socialStats.following || 0,
        mutualFollows: socialStats.mutualFollows || 0
      };
    }

    return { followers: 0, following: 0, mutualFollows: 0 };
  } catch (error) {
    console.error('Error getting follow stats:', error);
    return { followers: 0, following: 0, mutualFollows: 0 };
  }
};

/**
 * Pobierz listę obserwowanych użytkowników
 */
export const getFollowing = async (
  userId: string, 
  limitCount: number = 50
): Promise<UserWithFollowStatus[]> => {
  try {
    const followingRef = collection(db, `users/${userId}/following`);
    const followingQuery = query(
      followingRef,
      orderBy('followedAt', 'desc'),
      limit(limitCount)
    );
    
    const followingSnapshot = await getDocs(followingQuery);
    const followingIds = followingSnapshot.docs.map(doc => doc.id);

    if (followingIds.length === 0) return [];

    // Pobierz profile obserwowanych użytkowników
    const users: UserWithFollowStatus[] = [];
    
    // Pobierz w batch'ach po 10 (Firestore limit)
    for (let i = 0; i < followingIds.length; i += 10) {
      const batch = followingIds.slice(i, i + 10);
      const userRefs = batch.map(id => doc(db, 'users', id));
      const userDocs = await Promise.all(userRefs.map(ref => getDoc(ref)));

      for (let j = 0; j < userDocs.length; j++) {
        const userDoc = userDocs[j];
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const followData = followingSnapshot.docs.find(doc => doc.id === userDoc.id)?.data();
          
          users.push({
            address: userDoc.id,
            name: userData.name || `${userDoc.id.slice(0, 6)}...${userDoc.id.slice(-4)}`,
            avatar: userData.avatar,
            isFollowing: true,
            isFollower: await checkIfFollowing(userDoc.id, userId),
            isMutual: false, // Będzie obliczone
            followedAt: followData?.followedAt?.toMillis?.() || Date.now()
          });
        }
      }
    }

    // Sprawdź mutual follows
    for (const user of users) {
      user.isMutual = user.isFollowing && user.isFollower;
    }

    return users;
  } catch (error) {
    console.error('Error getting following list:', error);
    return [];
  }
};

/**
 * Pobierz listę obserwujących użytkowników
 */
export const getFollowers = async (
  userId: string, 
  limitCount: number = 50
): Promise<UserWithFollowStatus[]> => {
  try {
    const followersRef = collection(db, `users/${userId}/followers`);
    const followersQuery = query(
      followersRef,
      orderBy('followedAt', 'desc'),
      limit(limitCount)
    );
    
    const followersSnapshot = await getDocs(followersQuery);
    const followerIds = followersSnapshot.docs.map(doc => doc.id);

    if (followerIds.length === 0) return [];

    // Pobierz profile obserwujących użytkowników
    const users: UserWithFollowStatus[] = [];
    
    for (let i = 0; i < followerIds.length; i += 10) {
      const batch = followerIds.slice(i, i + 10);
      const userRefs = batch.map(id => doc(db, 'users', id));
      const userDocs = await Promise.all(userRefs.map(ref => getDoc(ref)));

      for (let j = 0; j < userDocs.length; j++) {
        const userDoc = userDocs[j];
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const followData = followersSnapshot.docs.find(doc => doc.id === userDoc.id)?.data();
          
          users.push({
            address: userDoc.id,
            name: userData.name || `${userDoc.id.slice(0, 6)}...${userDoc.id.slice(-4)}`,
            avatar: userData.avatar,
            isFollowing: await checkIfFollowing(userId, userDoc.id),
            isFollower: true,
            isMutual: false, // Będzie obliczone
            followedAt: followData?.followedAt?.toMillis?.() || Date.now()
          });
        }
      }
    }

    // Sprawdź mutual follows
    for (const user of users) {
      user.isMutual = user.isFollowing && user.isFollower;
    }

    return users;
  } catch (error) {
    console.error('Error getting followers list:', error);
    return [];
  }
};

/**
 * Pobierz wzajemne obserwacje (mutual follows)
 */
export const getMutualFollows = async (
  userId: string,
  limitCount: number = 50
): Promise<UserWithFollowStatus[]> => {
  try {
    const following = await getFollowing(userId, 200); // Pobierz więcej do filtrowania
    const mutualFollows = following.filter(user => user.isMutual);
    
    return mutualFollows.slice(0, limitCount);
  } catch (error) {
    console.error('Error getting mutual follows:', error);
    return [];
  }
};

/**
 * Sugerowane użytkownicy do obserwowania
 */
export const getSuggestedUsers = async (
  userId: string,
  limitCount: number = 10
): Promise<UserWithFollowStatus[]> => {
  try {
    // Pobierz użytkowników których już obserwuje
    const following = await getFollowing(userId, 1000);
    const followingIds = following.map(u => u.address);
    followingIds.push(userId); // Dodaj siebie do wykluczonych

    // Pobierz top aktywnych użytkowników którzy nie są obserwowani
    const usersRef = collection(db, 'users');
    const suggestedQuery = query(
      usersRef,
      orderBy('socialStats.followers', 'desc'),
      limit(limitCount * 3) // Pobierz więcej żeby po filtrowaniu zostało wystarczająco
    );

    const snapshot = await getDocs(suggestedQuery);
    const suggested: UserWithFollowStatus[] = [];

    for (const userDoc of snapshot.docs) {
      if (followingIds.includes(userDoc.id)) continue; // Pomiń już obserwowanych
      if (suggested.length >= limitCount) break; // Osiągnięto limit

      const userData = userDoc.data();
      suggested.push({
        address: userDoc.id,
        name: userData.name || `${userDoc.id.slice(0, 6)}...${userDoc.id.slice(-4)}`,
        avatar: userData.avatar,
        isFollowing: false,
        isFollower: await checkIfFollowing(userDoc.id, userId),
        isMutual: false,
        followedAt: 0
      });
    }

    return suggested;
  } catch (error) {
    console.error('Error getting suggested users:', error);
    return [];
  }
};

// ===============================================
// 🛠️ UTILITY FUNCTIONS
// ===============================================

/**
 * Pobierz status obserwowania między dwoma użytkownikami
 */
export const getFollowRelationship = async (
  user1: string, 
  user2: string
): Promise<{
  user1FollowsUser2: boolean;
  user2FollowsUser1: boolean;
  isMutual: boolean;
}> => {
  try {
    const [user1Follows, user2Follows] = await Promise.all([
      checkIfFollowing(user1, user2),
      checkIfFollowing(user2, user1)
    ]);

    return {
      user1FollowsUser2: user1Follows,
      user2FollowsUser1: user2Follows,
      isMutual: user1Follows && user2Follows
    };
  } catch (error) {
    console.error('Error getting follow relationship:', error);
    return {
      user1FollowsUser2: false,
      user2FollowsUser1: false,
      isMutual: false
    };
  }
};

/**
 * Masowe obserwowanie użytkowników (np. import z Twitter)
 */
export const followMultipleUsers = async (
  followerId: string,
  userIds: string[]
): Promise<{ 
  successful: string[]; 
  failed: Array<{ userId: string; error: string }> 
}> => {
  const successful: string[] = [];
  const failed: Array<{ userId: string; error: string }> = [];

  for (const userId of userIds) {
    try {
      const result = await followUser(followerId, userId);
      if (result.success) {
        successful.push(userId);
      } else {
        failed.push({ userId, error: result.error || 'Unknown error' });
      }
      
      // Małe opóźnienie żeby nie przeciążyć Firebase
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      failed.push({ 
        userId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  return { successful, failed };
};

// Import z pliku notifications.ts (będzie stworzony osobno)
async function addNotification(userId: string, notification: any) {
  // Implementacja powiadomień
  console.log('Notification would be sent:', { userId, notification });
}