// ===============================================
// 👥 FOLLOWS SYSTEM - System obserwowania użytkowników
// ===============================================

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

import { 
  db, 
  COLLECTIONS, 
  FIELDS, 
  SOCIAL_CONFIG,
  isValidEthereumAddress,
  isSameUser,
  formatTimestamp 
} from './config';

// ===============================================
// 🏷️ INTERFACES
// ===============================================

export interface Follow {
  id?: string;
  followerId: string;    // Kto obserwuje
  followingId: string;   // Kogo obserwuje  
  createdAt: any;
  followerName?: string;
  followingName?: string;
  mutualFollow?: boolean;
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
  isOnline?: boolean;
  lastActive?: number;
}

// ===============================================
// 🚀 CORE FUNCTIONS
// ===============================================

/**
 * Obserwuj użytkownika
 */
export const followUser = async (
  followerId: string, 
  followingId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Walidacja danych wejściowych
    if (!isValidEthereumAddress(followerId) || !isValidEthereumAddress(followingId)) {
      return { success: false, error: 'Nieprawidłowy adres użytkownika' };
    }

    if (isSameUser(followerId, followingId)) {
      return { success: false, error: 'Nie możesz obserwować samego siebie' };
    }

    // Sprawdź czy już obserwuje
    const isAlreadyFollowing = await checkIfFollowing(followerId, followingId);
    if (isAlreadyFollowing) {
      return { success: false, error: 'Już obserwujesz tego użytkownika' };
    }

    const batch = writeBatch(db);
    const timestamp = serverTimestamp();

    // 1. Dodaj do głównej kolekcji follows
    const followRef = doc(collection(db, COLLECTIONS.FOLLOWS));
    batch.set(followRef, {
      [FIELDS.FOLLOWER_ID]: followerId,
      [FIELDS.FOLLOWING_ID]: followingId,
      [FIELDS.CREATED_AT]: timestamp
    });

    // 2. Dodaj do subcollection followerId/following
    const followingRef = doc(db, `${COLLECTIONS.USERS}/${followerId}/${COLLECTIONS.USER_FOLLOWING}`, followingId);
    batch.set(followingRef, {
      userId: followingId,
      [FIELDS.FOLLOWED_AT]: timestamp
    });

    // 3. Dodaj do subcollection followingId/followers  
    const followerRef = doc(db, `${COLLECTIONS.USERS}/${followingId}/${COLLECTIONS.USER_FOLLOWERS}`, followerId);
    batch.set(followerRef, {
      userId: followerId,
      [FIELDS.FOLLOWED_AT]: timestamp
    });

    // 4. Aktualizuj liczniki w profilach użytkowników
    const followerProfileRef = doc(db, COLLECTIONS.USERS, followerId);
    batch.update(followerProfileRef, {
      [FIELDS.FOLLOWING_COUNT]: increment(1),
      [FIELDS.USER_LAST_ACTIVE]: timestamp
    });

    const followingProfileRef = doc(db, COLLECTIONS.USERS, followingId);
    batch.update(followingProfileRef, {
      [FIELDS.FOLLOWERS_COUNT]: increment(1),
      [FIELDS.USER_LAST_ACTIVE]: timestamp
    });

    // Commit all changes
    await batch.commit();

    // 5. Send notification (asynchronously)
    setTimeout(async () => {
      try {
        console.log(`📢 Creating FOLLOW notification: ${followerId} -> ${followingId}`);
        const { createNotification } = await import('./notifications');
        const result = await createNotification({
          userId: followingId,
          type: 'FOLLOW',
          fromUserId: followerId,
          title: 'New Follower',
          message: 'started following you'
        });
        console.log('📢 FOLLOW notification created:', result);
      } catch (error) {
        console.error('Błąd wysyłania powiadomienia o obserwowaniu:', error);
      }
    }, 100);

    console.log(`✅ Follow: ${followerId} -> ${followingId}`);
    return { success: true };

  } catch (error) {
    console.error('Błąd podczas obserwowania użytkownika:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
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
    // Walidacja
    if (!isValidEthereumAddress(followerId) || !isValidEthereumAddress(followingId)) {
      return { success: false, error: 'Nieprawidłowy adres użytkownika' };
    }

    if (isSameUser(followerId, followingId)) {
      return { success: false, error: 'Nie możesz przestać obserwować samego siebie' };
    }

    // Sprawdź czy obserwuje
    const isFollowing = await checkIfFollowing(followerId, followingId);
    if (!isFollowing) {
      return { success: false, error: 'Nie obserwujesz tego użytkownika' };
    }

    const batch = writeBatch(db);
    const timestamp = serverTimestamp();

    // 1. Usuń z głównej kolekcji follows
    const followsQuery = query(
      collection(db, COLLECTIONS.FOLLOWS),
      where(FIELDS.FOLLOWER_ID, '==', followerId),
      where(FIELDS.FOLLOWING_ID, '==', followingId),
      limit(1)
    );
    const followsSnapshot = await getDocs(followsQuery);
    
    if (!followsSnapshot.empty) {
      followsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
    }

    // 2. Usuń z subcollections
    const followingRef = doc(db, `${COLLECTIONS.USERS}/${followerId}/${COLLECTIONS.USER_FOLLOWING}`, followingId);
    batch.delete(followingRef);

    const followerRef = doc(db, `${COLLECTIONS.USERS}/${followingId}/${COLLECTIONS.USER_FOLLOWERS}`, followerId);
    batch.delete(followerRef);

    // 3. Aktualizuj liczniki
    const followerProfileRef = doc(db, COLLECTIONS.USERS, followerId);
    batch.update(followerProfileRef, {
      [FIELDS.FOLLOWING_COUNT]: increment(-1),
      [FIELDS.USER_LAST_ACTIVE]: timestamp
    });

    const followingProfileRef = doc(db, COLLECTIONS.USERS, followingId);
    batch.update(followingProfileRef, {
      [FIELDS.FOLLOWERS_COUNT]: increment(-1),
      [FIELDS.USER_LAST_ACTIVE]: timestamp
    });

    await batch.commit();

    console.log(`❌ Unfollow: ${followerId} -x-> ${followingId}`);
    return { success: true };

  } catch (error) {
    console.error('Błąd podczas przestania obserwowania:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
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
    if (!isValidEthereumAddress(followerId) || !isValidEthereumAddress(followingId)) {
      return false;
    }

    if (isSameUser(followerId, followingId)) {
      return false;
    }

    const followingRef = doc(db, `${COLLECTIONS.USERS}/${followerId}/${COLLECTIONS.USER_FOLLOWING}`, followingId);
    const followingDoc = await getDoc(followingRef);
    return followingDoc.exists();

  } catch (error) {
    console.error('Błąd sprawdzania statusu obserwowania:', error);
    return false;
  }
};

/**
 * Pobierz statystyki obserwowania użytkownika
 */
export const getUserFollowStats = async (userId: string): Promise<FollowStats> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return { followers: 0, following: 0, mutualFollows: 0 };
    }

    const userRef = doc(db, COLLECTIONS.USERS, userId);
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
    console.error('Błąd pobierania statystyk obserwowania:', error);
    return { followers: 0, following: 0, mutualFollows: 0 };
  }
};

/**
 * Pobierz listę obserwowanych użytkowników
 */
export const getFollowing = async (
  userId: string, 
  limitCount: number = SOCIAL_CONFIG.DEFAULT_LIMIT
): Promise<UserWithFollowStatus[]> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return [];
    }

    const followingRef = collection(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_FOLLOWING}`);
    const followingQuery = query(
      followingRef,
      orderBy(FIELDS.FOLLOWED_AT, 'desc'),
      limit(Math.min(limitCount, SOCIAL_CONFIG.MAX_FOLLOWERS_FETCH))
    );
    
    const followingSnapshot = await getDocs(followingQuery);
    const followingIds = followingSnapshot.docs.map(doc => doc.id);

    if (followingIds.length === 0) return [];

    // Pobierz profile obserwowanych użytkowników w batch'ach
    const users: UserWithFollowStatus[] = [];
    
    for (let i = 0; i < followingIds.length; i += SOCIAL_CONFIG.BATCH_SIZE) {
      const batch = followingIds.slice(i, i + SOCIAL_CONFIG.BATCH_SIZE);
      const userRefs = batch.map(id => doc(db, COLLECTIONS.USERS, id));
      const userDocs = await Promise.all(userRefs.map(ref => getDoc(ref)));

      for (let j = 0; j < userDocs.length; j++) {
        const userDoc = userDocs[j];
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const followData = followingSnapshot.docs.find(doc => doc.id === userDoc.id)?.data();
          
          // Sprawdź czy jest też obserwującym (mutual follow)
          const isFollower = await checkIfFollowing(userDoc.id, userId);
          
          users.push({
            address: userDoc.id,
            name: userData.name || `${userDoc.id.slice(0, 6)}...${userDoc.id.slice(-4)}`,
            avatar: userData.avatar,
            isFollowing: true,
            isFollower,
            isMutual: isFollower,
            followedAt: formatTimestamp(followData?.[FIELDS.FOLLOWED_AT]),
            isOnline: userData[FIELDS.USER_IS_ONLINE] || false,
            lastActive: formatTimestamp(userData[FIELDS.USER_LAST_ACTIVE])
          });
        }
      }
    }

    return users.sort((a, b) => (b.followedAt || 0) - (a.followedAt || 0));

  } catch (error) {
    console.error('Błąd pobierania listy obserwowanych:', error);
    return [];
  }
};

/**
 * Pobierz listę obserwujących użytkowników
 */
export const getFollowers = async (
  userId: string, 
  limitCount: number = SOCIAL_CONFIG.DEFAULT_LIMIT
): Promise<UserWithFollowStatus[]> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return [];
    }

    const followersRef = collection(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_FOLLOWERS}`);
    const followersQuery = query(
      followersRef,
      orderBy(FIELDS.FOLLOWED_AT, 'desc'),
      limit(Math.min(limitCount, SOCIAL_CONFIG.MAX_FOLLOWERS_FETCH))
    );
    
    const followersSnapshot = await getDocs(followersQuery);
    const followerIds = followersSnapshot.docs.map(doc => doc.id);

    if (followerIds.length === 0) return [];

    // Pobierz profile obserwujących użytkowników w batch'ach
    const users: UserWithFollowStatus[] = [];
    
    for (let i = 0; i < followerIds.length; i += SOCIAL_CONFIG.BATCH_SIZE) {
      const batch = followerIds.slice(i, i + SOCIAL_CONFIG.BATCH_SIZE);
      const userRefs = batch.map(id => doc(db, COLLECTIONS.USERS, id));
      const userDocs = await Promise.all(userRefs.map(ref => getDoc(ref)));

      for (let j = 0; j < userDocs.length; j++) {
        const userDoc = userDocs[j];
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const followData = followersSnapshot.docs.find(doc => doc.id === userDoc.id)?.data();
          
          // Sprawdź czy użytkownik też go obserwuje (mutual follow)
          const isFollowing = await checkIfFollowing(userId, userDoc.id);
          
          users.push({
            address: userDoc.id,
            name: userData.name || `${userDoc.id.slice(0, 6)}...${userDoc.id.slice(-4)}`,
            avatar: userData.avatar,
            isFollowing,
            isFollower: true,
            isMutual: isFollowing,
            followedAt: formatTimestamp(followData?.[FIELDS.FOLLOWED_AT]),
            isOnline: userData[FIELDS.USER_IS_ONLINE] || false,
            lastActive: formatTimestamp(userData[FIELDS.USER_LAST_ACTIVE])
          });
        }
      }
    }

    return users.sort((a, b) => (b.followedAt || 0) - (a.followedAt || 0));

  } catch (error) {
    console.error('Błąd pobierania listy obserwujących:', error);
    return [];
  }
};

/**
 * Pobierz wzajemne obserwacje (mutual follows)
 */
export const getMutualFollows = async (
  userId: string,
  limitCount: number = SOCIAL_CONFIG.DEFAULT_LIMIT
): Promise<UserWithFollowStatus[]> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return [];
    }

    const following = await getFollowing(userId, SOCIAL_CONFIG.MAX_FOLLOWERS_FETCH);
    const mutualFollows = following.filter(user => user.isMutual);
    
    return mutualFollows.slice(0, limitCount);

  } catch (error) {
    console.error('Błąd pobierania wzajemnych obserwacji:', error);
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
    if (!isValidEthereumAddress(userId)) {
      return [];
    }

    // Pobierz użytkowników których już obserwuje
    const following = await getFollowing(userId, SOCIAL_CONFIG.MAX_FOLLOWERS_FETCH);
    const followingIds = following.map(u => u.address);
    followingIds.push(userId); // Dodaj siebie do wykluczonych

    // Pobierz top aktywnych użytkowników
    const usersRef = collection(db, COLLECTIONS.USERS);
    const suggestedQuery = query(
      usersRef,
      orderBy(FIELDS.FOLLOWERS_COUNT, 'desc'),
      limit(limitCount * 3) // Pobierz więcej żeby po filtrowaniu zostało wystarczająco
    );

    const snapshot = await getDocs(suggestedQuery);
    const suggested: UserWithFollowStatus[] = [];

    for (const userDoc of snapshot.docs) {
      if (followingIds.includes(userDoc.id)) continue; // Pomiń już obserwowanych
      if (suggested.length >= limitCount) break; // Osiągnięto limit

      const userData = userDoc.data();
      
      // Sprawdź czy ten użytkownik obserwuje current user
      const isFollower = await checkIfFollowing(userDoc.id, userId);
      
      suggested.push({
        address: userDoc.id,
        name: userData.name || `${userDoc.id.slice(0, 6)}...${userDoc.id.slice(-4)}`,
        avatar: userData.avatar,
        isFollowing: false,
        isFollower,
        isMutual: false,
        isOnline: userData[FIELDS.USER_IS_ONLINE] || false,
        lastActive: formatTimestamp(userData[FIELDS.USER_LAST_ACTIVE])
      });
    }

    return suggested;

  } catch (error) {
    console.error('Błąd pobierania sugerowanych użytkowników:', error);
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
    if (!isValidEthereumAddress(user1) || !isValidEthereumAddress(user2)) {
      return {
        user1FollowsUser2: false,
        user2FollowsUser1: false,
        isMutual: false
      };
    }

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
    console.error('Błąd pobierania relacji obserwowania:', error);
    return {
      user1FollowsUser2: false,
      user2FollowsUser1: false,
      isMutual: false
    };
  }
};

/**
 * Masowe obserwowanie użytkowników (np. import z social platform)
 */
export const followMultipleUsers = async (
  followerId: string,
  userIds: string[],
  batchSize: number = 5
): Promise<{ 
  successful: string[]; 
  failed: Array<{ userId: string; error: string }> 
}> => {
  const successful: string[] = [];
  const failed: Array<{ userId: string; error: string }> = [];

  // Walidacja
  if (!isValidEthereumAddress(followerId)) {
    return { successful, failed: [{ userId: 'all', error: 'Nieprawidłowy adres użytkownika' }] };
  }

  // Procesuj w małych batch'ach żeby nie przeciążyć Firebase
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    
    const promises = batch.map(async (userId) => {
      try {
        const result = await followUser(followerId, userId);
        if (result.success) {
          successful.push(userId);
        } else {
          failed.push({ userId, error: result.error || 'Unknown error' });
        }
      } catch (error) {
        failed.push({ 
          userId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    await Promise.allSettled(promises);
    
    // Małe opóźnienie między batch'ami
    if (i + batchSize < userIds.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`📊 Batch follow results: ${successful.length} successful, ${failed.length} failed`);
  return { successful, failed };
};

/**
 * Cleanup nieaktywnych follows (maintenance function)
 */
export const cleanupInactiveFollows = async (daysInactive: number = 180): Promise<number> => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    // TODO: Implementacja cleanup dla nieaktywnych follows
    // Wymagałoby to dodatkowego pola lastInteraction w follow records
    
    console.log(`🧹 Cleanup inactive follows older than ${daysInactive} days`);
    return 0;

  } catch (error) {
    console.error('Błąd podczas cleanup nieaktywnych follows:', error);
    return 0;
  }
};

console.log('👥 Follow System initialized');