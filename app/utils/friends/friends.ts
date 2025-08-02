// ===============================================
// 🤝 FRIENDS SYSTEM - System znajomych z zaproszeniami
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
  formatTimestamp,
  generateId 
} from './config';

// ===============================================
// 🏷️ INTERFACES
// ===============================================

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';

export interface FriendRequest {
  id?: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  sentAt: any;
  respondedAt?: any;
  message?: string;
  senderName?: string;
  receiverName?: string;
}

export interface Friendship {
  id?: string;
  user1Id: string;
  user2Id: string;
  createdAt: any;
  user1Name?: string;
  user2Name?: string;
  lastInteraction?: any;
}

export interface FriendWithStatus {
  address: string;
  name: string;
  avatar?: string;
  friendshipId: string;
  friendsSince: number;
  lastInteraction?: number;
  isOnline?: boolean;
  mutualFriends?: number;
  lastActive?: number;
}

export interface FriendsStats {
  totalFriends: number;
  pendingRequests: number;
  sentRequests: number;
  onlineFriends: number;
  mutualFriends: number;
}

// ===============================================
// 🚀 FRIEND REQUEST FUNCTIONS
// ===============================================

/**
 * Wyślij zaproszenie do znajomych
 */
export const sendFriendRequest = async (
  senderId: string,
  receiverId: string,
  message?: string
): Promise<{ success: boolean; error?: string; requestId?: string }> => {
  try {
    // Walidacja danych wejściowych
    if (!isValidEthereumAddress(senderId) || !isValidEthereumAddress(receiverId)) {
      return { success: false, error: 'Invalid user address' };
    }


    
    if (isSameUser(senderId, receiverId)) {
      return { success: false, error: 'Cannot send friend request to yourself' };
    }

    // Sprawdź czy już są znajomymi
    const areFriends = await checkFriendship(senderId, receiverId);
    if (areFriends) {
      return { success: false, error: 'Already friends' };
    }

    // Sprawdź czy istnieje pending request w obu kierunkach
    const [existingRequest, reverseRequest] = await Promise.all([
      getPendingFriendRequest(senderId, receiverId),
      getPendingFriendRequest(receiverId, senderId)
    ]);

    if (existingRequest) {
      return { success: false, error: 'Friend request already sent' };
    }

    if (reverseRequest) {
      // Automatycznie zaakceptuj - oba chcą być znajomymi
      const acceptResult = await acceptFriendRequest(reverseRequest.id!, senderId);
      if (acceptResult.success) {
        return { 
          success: true, 
          requestId: reverseRequest.id,
          error: 'Zaproszenie automatycznie zaakceptowane' 
        };
      }
    }

    // Sprawdź limit zaproszeń na dzień
    const todayRequestsCount = await getTodayFriendRequestsCount(senderId);
    if (todayRequestsCount >= SOCIAL_CONFIG.MAX_FRIEND_REQUESTS_PER_DAY) {
      return { 
        success: false, 
        error: `Osiągnięto dzienny limit zaproszeń (${SOCIAL_CONFIG.MAX_FRIEND_REQUESTS_PER_DAY})` 
      };
    }

    // Stwórz nowe zaproszenie
    const requestData: Omit<FriendRequest, 'id'> = {
      senderId,
      receiverId,
      status: 'pending',
      sentAt: serverTimestamp(),
      message: message?.trim() || undefined
    };

    const docRef = await addDoc(collection(db, COLLECTIONS.FRIEND_REQUESTS), requestData);

    // Send notification (asynchronously)
    setTimeout(async () => {
      try {
        const { createNotification } = await import('./notifications');
        await createNotification({
          userId: receiverId,
          type: 'FRIEND_REQUEST',
          fromUserId: senderId,
          title: 'Friend Request',
          message: message || 'sent you a friend request',
          data: { requestId: docRef.id }
        });
      } catch (error) {
        console.error('Błąd wysyłania powiadomienia o zaproszeniu:', error);
      }
    }, 100);

    console.log(`✅ Friend request sent: ${senderId} -> ${receiverId}`);
    return { success: true, requestId: docRef.id };

  } catch (error) {
    console.error('Błąd wysyłania zaproszenia do znajomych:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Zaakceptuj zaproszenie do znajomych
 */
export const acceptFriendRequest = async (
  requestId: string,
  userId: string
): Promise<{ success: boolean; error?: string; friendshipId?: string }> => {
  try {
    // Pobierz request
    const requestRef = doc(db, COLLECTIONS.FRIEND_REQUESTS, requestId);
    const requestDoc = await getDoc(requestRef);

    if (!requestDoc.exists()) {
      return { success: false, error: 'Zaproszenie nie istnieje' };
    }

    const requestData = requestDoc.data() as FriendRequest;

    // Sprawdź czy user może zaakceptować (jest receiverem)
    if (requestData.receiverId !== userId) {
      return { success: false, error: 'Nie możesz zaakceptować tego zaproszenia' };
    }

    if (requestData.status !== 'pending') {
      return { success: false, error: 'To zaproszenie już zostało przetworzone' };
    }

    // Sprawdź ponownie czy nie są już znajomymi (race condition)
    const areFriends = await checkFriendship(requestData.senderId, requestData.receiverId);
    if (areFriends) {
      return { success: false, error: 'Już jesteście znajomymi' };
    }

    const batch = writeBatch(db);
    const timestamp = serverTimestamp();

    // 1. Aktualizuj status zaproszenia
    batch.update(requestRef, {
      status: 'accepted',
      respondedAt: timestamp
    });

    // 2. Stwórz przyjaźń
    const friendshipRef = doc(collection(db, COLLECTIONS.FRIENDSHIPS));
    const friendshipData: Omit<Friendship, 'id'> = {
      user1Id: requestData.senderId,
      user2Id: requestData.receiverId,
      createdAt: timestamp
    };
    batch.set(friendshipRef, friendshipData);

    // 3. Dodaj do subcollections dla szybkiego dostępu
    const user1FriendRef = doc(db, `${COLLECTIONS.USERS}/${requestData.senderId}/${COLLECTIONS.USER_FRIENDS}`, requestData.receiverId);
    batch.set(user1FriendRef, {
      friendId: requestData.receiverId,
      friendshipId: friendshipRef.id,
      createdAt: timestamp
    });

    const user2FriendRef = doc(db, `${COLLECTIONS.USERS}/${requestData.receiverId}/${COLLECTIONS.USER_FRIENDS}`, requestData.senderId);
    batch.set(user2FriendRef, {
      friendId: requestData.senderId,
      friendshipId: friendshipRef.id,
      createdAt: timestamp
    });

    // 4. Aktualizuj liczniki znajomych
    const user1Ref = doc(db, COLLECTIONS.USERS, requestData.senderId);
    batch.update(user1Ref, {
      [FIELDS.FRIENDS_COUNT]: increment(1),
      [FIELDS.USER_LAST_ACTIVE]: timestamp
    });

    const user2Ref = doc(db, COLLECTIONS.USERS, requestData.receiverId);
    batch.update(user2Ref, {
      [FIELDS.FRIENDS_COUNT]: increment(1),
      [FIELDS.USER_LAST_ACTIVE]: timestamp
    });

    await batch.commit();

    // Send notification to sender (asynchronously)
    setTimeout(async () => {
      try {
        const { createNotification } = await import('./notifications');
        await createNotification({
          userId: requestData.senderId,
          type: 'FRIEND_REQUEST_ACCEPTED',
          fromUserId: requestData.receiverId,
          title: 'Friend Request Accepted',
          message: 'accepted your friend request',
          data: { friendshipId: friendshipRef.id }
        });
      } catch (error) {
        console.error('Błąd wysyłania powiadomienia o akceptacji:', error);
      }
    }, 100);

    console.log(`✅ Friend request accepted: ${requestData.senderId} <-> ${requestData.receiverId}`);
    return { success: true, friendshipId: friendshipRef.id };

  } catch (error) {
    console.error('Błąd akceptowania zaproszenia:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Odrzuć zaproszenie do znajomych
 */
export const rejectFriendRequest = async (
  requestId: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const requestRef = doc(db, COLLECTIONS.FRIEND_REQUESTS, requestId);
    const requestDoc = await getDoc(requestRef);

    if (!requestDoc.exists()) {
      return { success: false, error: 'Zaproszenie nie istnieje' };
    }

    const requestData = requestDoc.data() as FriendRequest;

    if (requestData.receiverId !== userId) {
      return { success: false, error: 'Nie możesz odrzucić tego zaproszenia' };
    }

    if (requestData.status !== 'pending') {
      return { success: false, error: 'To zaproszenie już zostało przetworzone' };
    }

    // Aktualizuj status
    await updateDoc(requestRef, {
      status: 'rejected',
      respondedAt: serverTimestamp(),
      rejectionReason: reason || undefined
    });

    console.log(`❌ Friend request rejected: ${requestData.senderId} -x-> ${requestData.receiverId}`);
    return { success: true };

  } catch (error) {
    console.error('Błąd odrzucania zaproszenia:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// ===============================================
// 🔍 QUERY FUNCTIONS
// ===============================================

/**
 * Pobierz otrzymane zaproszenia do znajomych
 */
export const getReceivedFriendRequests = async (
  userId: string,
  limitCount: number = SOCIAL_CONFIG.DEFAULT_LIMIT
): Promise<FriendRequest[]> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return [];
    }

    const requestsRef = collection(db, COLLECTIONS.FRIEND_REQUESTS);
    const requestsQuery = query(
      requestsRef,
      where(FIELDS.RECEIVER_ID, '==', userId),
      where(FIELDS.FRIEND_STATUS, '==', 'pending'),
      orderBy(FIELDS.SENT_AT, 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(requestsQuery);
    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      sentAt: formatTimestamp(doc.data()[FIELDS.SENT_AT])
    } as FriendRequest));

    // Wzbogać o dane nadawców
    return await enrichFriendRequestsWithUserData(requests);

  } catch (error) {
    console.error('Błąd pobierania otrzymanych zaproszeń:', error);
    return [];
  }
};

/**
 * Pobierz wysłane zaproszenia do znajomych
 */
export const getSentFriendRequests = async (
  userId: string,
  limitCount: number = SOCIAL_CONFIG.DEFAULT_LIMIT
): Promise<FriendRequest[]> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return [];
    }

    const requestsRef = collection(db, COLLECTIONS.FRIEND_REQUESTS);
    const requestsQuery = query(
      requestsRef,
      where(FIELDS.SENDER_ID, '==', userId),
      where(FIELDS.FRIEND_STATUS, '==', 'pending'),
      orderBy(FIELDS.SENT_AT, 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(requestsQuery);
    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      sentAt: formatTimestamp(doc.data()[FIELDS.SENT_AT])
    } as FriendRequest));

    // Wzbogać o dane odbiorców
    return await enrichFriendRequestsWithUserData(requests);

  } catch (error) {
    console.error('Błąd pobierania wysłanych zaproszeń:', error);
    return [];
  }
};

/**
 * Sprawdź czy dwóch użytkowników to znajomi
 */
export const checkFriendship = async (
  user1Id: string,
  user2Id: string
): Promise<boolean> => {
  try {
    if (!isValidEthereumAddress(user1Id) || !isValidEthereumAddress(user2Id)) {
      return false;
    }

    if (isSameUser(user1Id, user2Id)) {
      return false;
    }

    const friendRef = doc(db, `${COLLECTIONS.USERS}/${user1Id}/${COLLECTIONS.USER_FRIENDS}`, user2Id);
    const friendDoc = await getDoc(friendRef);
    return friendDoc.exists();

  } catch (error) {
    console.error('Błąd sprawdzania przyjaźni:', error);
    return false;
  }
};

/**
 * Pobierz pending friend request między dwoma użytkownikami
 */
export const getPendingFriendRequest = async (
  senderId: string,
  receiverId: string
): Promise<FriendRequest | null> => {
  try {
    if (!isValidEthereumAddress(senderId) || !isValidEthereumAddress(receiverId)) {
      return null;
    }

    const requestsRef = collection(db, COLLECTIONS.FRIEND_REQUESTS);
    const requestQuery = query(
      requestsRef,
      where(FIELDS.SENDER_ID, '==', senderId),
      where(FIELDS.RECEIVER_ID, '==', receiverId),
      where(FIELDS.FRIEND_STATUS, '==', 'pending'),
      limit(1)
    );

    const snapshot = await getDocs(requestQuery);
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { 
        id: doc.id, 
        ...doc.data(),
        sentAt: formatTimestamp(doc.data()[FIELDS.SENT_AT])
      } as FriendRequest;
    }

    return null;
  } catch (error) {
    console.error('Błąd pobierania pending friend request:', error);
    return null;
  }
};

/**
 * Pobierz listę znajomych użytkownika
 */
export const getFriendsList = async (
  userId: string,
  limitCount: number = SOCIAL_CONFIG.MAX_FRIENDS_FETCH
): Promise<FriendWithStatus[]> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return [];
    }

    const friendsRef = collection(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_FRIENDS}`);
    const friendsQuery = query(
      friendsRef,
      orderBy(FIELDS.CREATED_AT, 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(friendsQuery);
    const friendIds = snapshot.docs.map(doc => doc.id);

    if (friendIds.length === 0) return [];

    // Pobierz profile znajomych w batch'ach
    const friends: FriendWithStatus[] = [];
    
    for (let i = 0; i < friendIds.length; i += SOCIAL_CONFIG.BATCH_SIZE) {
      const batch = friendIds.slice(i, i + SOCIAL_CONFIG.BATCH_SIZE);
      const userRefs = batch.map(id => doc(db, COLLECTIONS.USERS, id));
      const userDocs = await Promise.all(userRefs.map(ref => getDoc(ref)));

      for (let j = 0; j < userDocs.length; j++) {
        const userDoc = userDocs[j];
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const friendData = snapshot.docs.find(doc => doc.id === userDoc.id)?.data();
          
          friends.push({
            address: userDoc.id,
            name: userData.name || `${userDoc.id.slice(0, 6)}...${userDoc.id.slice(-4)}`,
            avatar: userData.avatar,
            friendshipId: friendData?.friendshipId || '',
            friendsSince: formatTimestamp(friendData?.[FIELDS.CREATED_AT]),
            lastInteraction: formatTimestamp(userData[FIELDS.USER_LAST_ACTIVE]),
            isOnline: userData[FIELDS.USER_IS_ONLINE] || false,
            lastActive: formatTimestamp(userData[FIELDS.USER_LAST_ACTIVE]),
            mutualFriends: 0 // TODO: Calculate mutual friends count
          });
        }
      }
    }

    return friends.sort((a, b) => (b.friendsSince || 0) - (a.friendsSince || 0));

  } catch (error) {
    console.error('Błąd pobierania listy znajomych:', error);
    return [];
  }
};

/**
 * Usuń znajomego
 */
export const removeFriend = async (
  userId: string,
  friendId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Walidacja
    if (!isValidEthereumAddress(userId) || !isValidEthereumAddress(friendId)) {
      return { success: false, error: 'Nieprawidłowy adres użytkownika' };
    }

    if (isSameUser(userId, friendId)) {
      return { success: false, error: 'Nie możesz usunąć samego siebie ze znajomych' };
    }

    // Sprawdź czy są znajomymi
    const areFriends = await checkFriendship(userId, friendId);
    if (!areFriends) {
      return { success: false, error: 'Nie jesteście znajomymi' };
    }

    const batch = writeBatch(db);
    const timestamp = serverTimestamp();

    // 1. Usuń z subcollections
    const user1FriendRef = doc(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_FRIENDS}`, friendId);
    batch.delete(user1FriendRef);

    const user2FriendRef = doc(db, `${COLLECTIONS.USERS}/${friendId}/${COLLECTIONS.USER_FRIENDS}`, userId);
    batch.delete(user2FriendRef);

    // 2. Znajdź i usuń przyjaźń z głównej kolekcji
    const friendshipsRef = collection(db, COLLECTIONS.FRIENDSHIPS);
    const [friendshipQuery1, friendshipQuery2] = await Promise.all([
      getDocs(query(
        friendshipsRef,
        where('user1Id', '==', userId),
        where('user2Id', '==', friendId),
        limit(1)
      )),
      getDocs(query(
        friendshipsRef,
        where('user1Id', '==', friendId),
        where('user2Id', '==', userId),
        limit(1)
      ))
    ]);

    [...friendshipQuery1.docs, ...friendshipQuery2.docs].forEach(doc => {
      batch.delete(doc.ref);
    });

    // 3. Aktualizuj liczniki znajomych
    const user1Ref = doc(db, COLLECTIONS.USERS, userId);
    batch.update(user1Ref, {
      [FIELDS.FRIENDS_COUNT]: increment(-1),
      [FIELDS.USER_LAST_ACTIVE]: timestamp
    });

    const user2Ref = doc(db, COLLECTIONS.USERS, friendId);
    batch.update(user2Ref, {
      [FIELDS.FRIENDS_COUNT]: increment(-1),
      [FIELDS.USER_LAST_ACTIVE]: timestamp
    });

    await batch.commit();

    console.log(`💔 Friendship removed: ${userId} -x-> ${friendId}`);
    return { success: true };

  } catch (error) {
    console.error('Błąd usuwania znajomego:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// ===============================================
// 🛠️ UTILITY FUNCTIONS
// ===============================================

/**
 * Pobierz statystyki znajomych użytkownika
 */
export const getFriendsStats = async (userId: string): Promise<FriendsStats> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return {
        totalFriends: 0,
        pendingRequests: 0,
        sentRequests: 0,
        onlineFriends: 0,
        mutualFriends: 0
      };
    }

    const [friends, received, sent] = await Promise.all([
      getFriendsList(userId, SOCIAL_CONFIG.MAX_FRIENDS_FETCH),
      getReceivedFriendRequests(userId, 100),
      getSentFriendRequests(userId, 100)
    ]);

    const onlineFriends = friends.filter(f => f.isOnline).length;
    const mutualFriends = 0; // TODO: Calculate mutual friends

    return {
      totalFriends: friends.length,
      pendingRequests: received.length,
      sentRequests: sent.length,
      onlineFriends,
      mutualFriends
    };

  } catch (error) {
    console.error('Błąd pobierania statystyk znajomych:', error);
    return {
      totalFriends: 0,
      pendingRequests: 0,
      sentRequests: 0,
      onlineFriends: 0,
      mutualFriends: 0
    };
  }
};

/**
 * Sprawdź status relacji między dwoma użytkownikami
 */
export const getFriendshipStatus = async (
  user1Id: string,
  user2Id: string
): Promise<{
  areFriends: boolean;
  pendingRequest?: FriendRequest;
  canSendRequest: boolean;
  relationship: 'friends' | 'request_sent' | 'request_received' | 'none';
}> => {
  try {
    if (!isValidEthereumAddress(user1Id) || !isValidEthereumAddress(user2Id)) {
      return {
        areFriends: false,
        canSendRequest: false,
        relationship: 'none'
      };
    }

    if (isSameUser(user1Id, user2Id)) {
      return {
        areFriends: false,
        canSendRequest: false,
        relationship: 'none'
      };
    }

    // Sprawdź czy są znajomymi
    const areFriends = await checkFriendship(user1Id, user2Id);
    if (areFriends) {
      return {
        areFriends: true,
        canSendRequest: false,
        relationship: 'friends'
      };
    }

    // Sprawdź pending requests
    const [sentRequest, receivedRequest] = await Promise.all([
      getPendingFriendRequest(user1Id, user2Id),
      getPendingFriendRequest(user2Id, user1Id)
    ]);

    if (sentRequest) {
      return {
        areFriends: false,
        pendingRequest: sentRequest,
        canSendRequest: false,
        relationship: 'request_sent'
      };
    }

    if (receivedRequest) {
      return {
        areFriends: false,
        pendingRequest: receivedRequest,
        canSendRequest: false,
        relationship: 'request_received'
      };
    }

    return {
      areFriends: false,
      canSendRequest: true,
      relationship: 'none'
    };

  } catch (error) {
    console.error('Błąd pobierania statusu przyjaźni:', error);
    return {
      areFriends: false,
      canSendRequest: false,
      relationship: 'none'
    };
  }
};

// ===============================================
// 🧹 HELPER FUNCTIONS
// ===============================================

/**
 * Wzbogać friend requests o dane użytkowników
 */
async function enrichFriendRequestsWithUserData(requests: FriendRequest[]): Promise<FriendRequest[]> {
  if (requests.length === 0) return [];

  // Pobierz unique user IDs
  const userIds = [...new Set([
    ...requests.map(r => r.senderId),
    ...requests.map(r => r.receiverId)
  ])];

  // Pobierz dane użytkowników w batch'ach
  const userData: { [key: string]: any } = {};
  
  for (let i = 0; i < userIds.length; i += SOCIAL_CONFIG.BATCH_SIZE) {
    const batch = userIds.slice(i, i + SOCIAL_CONFIG.BATCH_SIZE);
    const userRefs = batch.map(id => doc(db, COLLECTIONS.USERS, id));
    const userDocs = await Promise.all(userRefs.map(ref => getDoc(ref)));

    userDocs.forEach((userDoc, index) => {
      if (userDoc.exists()) {
        userData[batch[index]] = userDoc.data();
      }
    });
  }

  // Wzbogać requests o dane użytkowników
  return requests.map(request => ({
    ...request,
    senderName: userData[request.senderId]?.name || `${request.senderId.slice(0, 6)}...${request.senderId.slice(-4)}`,
    receiverName: userData[request.receiverId]?.name || `${request.receiverId.slice(0, 6)}...${request.receiverId.slice(-4)}`
  }));
}

/**
 * Pobierz liczbę zaproszeń wysłanych dzisiaj
 */
async function getTodayFriendRequestsCount(userId: string): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const requestsRef = collection(db, COLLECTIONS.FRIEND_REQUESTS);
    const todayRequestsQuery = query(
      requestsRef,
      where(FIELDS.SENDER_ID, '==', userId),
      where(FIELDS.SENT_AT, '>=', today),
      limit(100)
    );

    const snapshot = await getDocs(todayRequestsQuery);
    return snapshot.size;

  } catch (error) {
    console.error('Błąd pobierania dzisiejszych zaproszeń:', error);
    return 0;
  }
}

/**
 * Wyczyść stare zaproszenia do znajomych (maintenance function)
 */
export const cleanupOldFriendRequests = async (daysOld: number = SOCIAL_CONFIG.OLD_FRIEND_REQUESTS_DAYS): Promise<number> => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const requestsRef = collection(db, COLLECTIONS.FRIEND_REQUESTS);
    const oldRequestsQuery = query(
      requestsRef,
      where(FIELDS.SENT_AT, '<', cutoffDate),
      where(FIELDS.FRIEND_STATUS, 'in', ['rejected', 'blocked']),
      limit(100)
    );

    const snapshot = await getDocs(oldRequestsQuery);
    if (snapshot.empty) return 0;

    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`🧹 Cleaned up ${snapshot.docs.length} old friend requests`);
    return snapshot.docs.length;

  } catch (error) {
    console.error('Błąd czyszczenia starych zaproszeń:', error);
    return 0;
  }
};

console.log('🤝 Friends System initialized');