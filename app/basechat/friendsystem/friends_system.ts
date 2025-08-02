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
// 🤝 FRIENDS SYSTEM INTERFACES
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
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (senderId === receiverId) {
      return { success: false, error: 'Nie możesz wysłać zaproszenia do siebie' };
    }

    // Sprawdź czy już są znajomymi
    const areFriends = await checkFriendship(senderId, receiverId);
    if (areFriends) {
      return { success: false, error: 'Już jesteście znajomymi' };
    }

    // Sprawdź czy istnieje pending request
    const existingRequest = await getPendingFriendRequest(senderId, receiverId);
    if (existingRequest) {
      return { success: false, error: 'Zaproszenie już zostało wysłane' };
    }

    // Sprawdź czy receiver już wysłał request do sendera (prevent duplicates)
    const reverseRequest = await getPendingFriendRequest(receiverId, senderId);
    if (reverseRequest) {
      // Automatycznie zaakceptuj - oba chcą być znajomymi
      return await acceptFriendRequest(reverseRequest.id!, senderId);
    }

    // Stwórz nowe zaproszenie
    const requestRef = doc(collection(db, 'friendRequests'));
    const requestData: FriendRequest = {
      senderId,
      receiverId,
      status: 'pending',
      sentAt: serverTimestamp(),
      message: message || undefined
    };

    await addDoc(collection(db, 'friendRequests'), requestData);

    // Wyślij powiadomienie
    setTimeout(async () => {
      try {
        await addNotification(receiverId, {
          type: 'FRIEND_REQUEST',
          fromUser: senderId,
          timestamp: Date.now(),
          message: message
        });
      } catch (error) {
        console.error('Error sending friend request notification:', error);
      }
    }, 100);

    console.log(`✅ ${senderId} wysłał zaproszenie do ${receiverId}`);
    return { success: true };

  } catch (error) {
    console.error('Error sending friend request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Błąd podczas wysyłania zaproszenia'
    };
  }
};

/**
 * Zaakceptuj zaproszenie do znajomych
 */
export const acceptFriendRequest = async (
  requestId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Pobierz request
    const requestRef = doc(db, 'friendRequests', requestId);
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

    const batch = writeBatch(db);

    // 1. Aktualizuj status zaproszenia
    batch.update(requestRef, {
      status: 'accepted',
      respondedAt: serverTimestamp()
    });

    // 2. Stwórz przyjaźń
    const friendshipRef = doc(collection(db, 'friendships'));
    const friendshipData: Friendship = {
      user1Id: requestData.senderId,
      user2Id: requestData.receiverId,
      createdAt: serverTimestamp()
    };
    batch.set(friendshipRef, friendshipData);

    // 3. Dodaj do subcollections dla szybkiego dostępu
    const user1FriendRef = doc(db, `users/${requestData.senderId}/friends`, requestData.receiverId);
    batch.set(user1FriendRef, {
      friendId: requestData.receiverId,
      friendshipId: friendshipRef.id,
      createdAt: serverTimestamp()
    });

    const user2FriendRef = doc(db, `users/${requestData.receiverId}/friends`, requestData.senderId);
    batch.set(user2FriendRef, {
      friendId: requestData.senderId,
      friendshipId: friendshipRef.id,
      createdAt: serverTimestamp()
    });

    // 4. Aktualizuj liczniki znajomych
    const user1Ref = doc(db, 'users', requestData.senderId);
    batch.update(user1Ref, {
      'socialStats.friends': increment(1),
      lastActive: serverTimestamp()
    });

    const user2Ref = doc(db, 'users', requestData.receiverId);
    batch.update(user2Ref, {
      'socialStats.friends': increment(1),
      lastActive: serverTimestamp()
    });

    await batch.commit();

    // Wyślij powiadomienie do sendera
    setTimeout(async () => {
      try {
        await addNotification(requestData.senderId, {
          type: 'FRIEND_REQUEST_ACCEPTED',
          fromUser: requestData.receiverId,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error sending acceptance notification:', error);
      }
    }, 100);

    console.log(`✅ ${requestData.receiverId} zaakceptował zaproszenie od ${requestData.senderId}`);
    return { success: true };

  } catch (error) {
    console.error('Error accepting friend request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Błąd podczas akceptowania zaproszenia'
    };
  }
};

/**
 * Odrzuć zaproszenie do znajomych
 */
export const rejectFriendRequest = async (
  requestId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const requestRef = doc(db, 'friendRequests', requestId);
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
      respondedAt: serverTimestamp()
    });

    console.log(`❌ ${requestData.receiverId} odrzucił zaproszenie od ${requestData.senderId}`);
    return { success: true };

  } catch (error) {
    console.error('Error rejecting friend request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Błąd podczas odrzucania zaproszenia'
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
  limitCount: number = 20
): Promise<FriendRequest[]> => {
  try {
    const requestsRef = collection(db, 'friendRequests');
    const requestsQuery = query(
      requestsRef,
      where('receiverId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('sentAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(requestsQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as FriendRequest));

  } catch (error) {
    console.error('Error getting received friend requests:', error);
    return [];
  }
};

/**
 * Pobierz wysłane zaproszenia do znajomych
 */
export const getSentFriendRequests = async (
  userId: string,
  limitCount: number = 20
): Promise<FriendRequest[]> => {
  try {
    const requestsRef = collection(db, 'friendRequests');
    const requestsQuery = query(
      requestsRef,
      where('senderId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('sentAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(requestsQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as FriendRequest));

  } catch (error) {
    console.error('Error getting sent friend requests:', error);
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
    const friendRef = doc(db, `users/${user1Id}/friends`, user2Id);
    const friendDoc = await getDoc(friendRef);
    return friendDoc.exists();
  } catch (error) {
    console.error('Error checking friendship:', error);
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
    const requestsRef = collection(db, 'friendRequests');
    const requestQuery = query(
      requestsRef,
      where('senderId', '==', senderId),
      where('receiverId', '==', receiverId),
      where('status', '==', 'pending'),
      limit(1)
    );

    const snapshot = await getDocs(requestQuery);
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() } as FriendRequest;
    }

    return null;
  } catch (error) {
    console.error('Error getting pending friend request:', error);
    return null;
  }
};

/**
 * Pobierz listę znajomych użytkownika
 */
export const getFriendsList = async (
  userId: string,
  limitCount: number = 50
): Promise<FriendWithStatus[]> => {
  try {
    const friendsRef = collection(db, `users/${userId}/friends`);
    const friendsQuery = query(
      friendsRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(friendsQuery);
    const friendIds = snapshot.docs.map(doc => doc.id);

    if (friendIds.length === 0) return [];

    // Pobierz profile znajomych
    const friends: FriendWithStatus[] = [];
    
    for (let i = 0; i < friendIds.length; i += 10) {
      const batch = friendIds.slice(i, i + 10);
      const userRefs = batch.map(id => doc(db, 'users', id));
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
            friendsSince: friendData?.createdAt?.toMillis?.() || Date.now(),
            lastInteraction: userData.lastActive?.toMillis?.() || undefined,
            isOnline: userData.isOnline || false,
            mutualFriends: 0 // TODO: Implement mutual friends count
          });
        }
      }
    }

    return friends;
  } catch (error) {
    console.error('Error getting friends list:', error);
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
    // Sprawdź czy są znajomymi
    const areFriends = await checkFriendship(userId, friendId);
    if (!areFriends) {
      return { success: false, error: 'Nie jesteście znajomymi' };
    }

    const batch = writeBatch(db);

    // 1. Usuń z subcollections
    const user1FriendRef = doc(db, `users/${userId}/friends`, friendId);
    batch.delete(user1FriendRef);

    const user2FriendRef = doc(db, `users/${friendId}/friends`, userId);
    batch.delete(user2FriendRef);

    // 2. Znajdź i usuń przyjaźń z głównej kolekcji
    const friendshipsRef = collection(db, 'friendships');
    const friendshipQuery1 = query(
      friendshipsRef,
      where('user1Id', '==', userId),
      where('user2Id', '==', friendId)
    );
    const friendshipQuery2 = query(
      friendshipsRef,
      where('user1Id', '==', friendId),
      where('user2Id', '==', userId)
    );

    const [snapshot1, snapshot2] = await Promise.all([
      getDocs(friendshipQuery1),
      getDocs(friendshipQuery2)
    ]);

    [...snapshot1.docs, ...snapshot2.docs].forEach(doc => {
      batch.delete(doc.ref);
    });

    // 3. Aktualizuj liczniki znajomych
    const user1Ref = doc(db, 'users', userId);
    batch.update(user1Ref, {
      'socialStats.friends': increment(-1),
      lastActive: serverTimestamp()
    });

    const user2Ref = doc(db, 'users', friendId);
    batch.update(user2Ref, {
      'socialStats.friends': increment(-1),
      lastActive: serverTimestamp()
    });

    await batch.commit();

    console.log(`💔 ${userId} usunął znajomego ${friendId}`);
    return { success: true };

  } catch (error) {
    console.error('Error removing friend:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Błąd podczas usuwania znajomego'
    };
  }
};

// ===============================================
// 🔍 ADVANCED QUERY FUNCTIONS
// ===============================================

/**
 * Pobierz wspólnych znajomych między dwoma użytkownikami
 */
export const getMutualFriends = async (
  user1Id: string,
  user2Id: string,
  limitCount: number = 20
): Promise<FriendWithStatus[]> => {
  try {
    // Pobierz znajomych obydwu użytkowników
    const [user1Friends, user2Friends] = await Promise.all([
      getFriendsList(user1Id, 200),
      getFriendsList(user2Id, 200)
    ]);

    // Znajdź wspólnych
    const mutualFriendsMap = new Map<string, FriendWithStatus>();
    
    user1Friends.forEach(friend => {
      mutualFriendsMap.set(friend.address, friend);
    });

    const mutualFriends: FriendWithStatus[] = [];
    user2Friends.forEach(friend => {
      if (mutualFriendsMap.has(friend.address) && mutualFriends.length < limitCount) {
        mutualFriends.push(friend);
      }
    });

    return mutualFriends;
  } catch (error) {
    console.error('Error getting mutual friends:', error);
    return [];
  }
};

/**
 * Pobierz sugerowanych znajomych (znajomi znajomych)
 */
export const getSuggestedFriends = async (
  userId: string,
  limitCount: number = 10
): Promise<Array<{
  address: string;
  name: string;
  avatar?: string;
  mutualFriendsCount: number;
  mutualFriends: string[];
  reason: string;
}>> => {
  try {
    // Pobierz znajomych użytkownika
    const userFriends = await getFriendsList(userId, 100);
    const userFriendIds = userFriends.map(f => f.address);
    userFriendIds.push(userId); // Dodaj siebie do wykluczonych

    // Mapa kandydatów na znajomych
    const candidatesMap = new Map<string, {
      address: string;
      name: string;
      avatar?: string;
      mutualFriends: string[];
      reason: string;
    }>();

    // Dla każdego znajomego, pobierz jego znajomych
    for (const friend of userFriends.slice(0, 20)) { // Ograniczenie żeby nie przeciążyć
      try {
        const friendsFriends = await getFriendsList(friend.address, 50);
        
        friendsFriends.forEach(candidate => {
          if (userFriendIds.includes(candidate.address)) return; // Pomiń już znajomych
          
          if (!candidatesMap.has(candidate.address)) {
            candidatesMap.set(candidate.address, {
              address: candidate.address,
              name: candidate.name,
              avatar: candidate.avatar,
              mutualFriends: [friend.address],
              reason: `Znajomy użytkownika ${friend.name}`
            });
          } else {
            const existing = candidatesMap.get(candidate.address)!;
            existing.mutualFriends.push(friend.address);
          }
        });
      } catch (error) {
        console.error(`Error getting friends for ${friend.address}:`, error);
      }
    }

    // Konwertuj mapę na tablicę i posortuj po liczbie wspólnych znajomych
    const suggestions = Array.from(candidatesMap.values())
      .map(candidate => ({
        ...candidate,
        mutualFriendsCount: candidate.mutualFriends.length
      }))
      .sort((a, b) => b.mutualFriendsCount - a.mutualFriendsCount)
      .slice(0, limitCount);

    return suggestions;
  } catch (error) {
    console.error('Error getting suggested friends:', error);
    return [];
  }
};

/**
 * Wyszukaj znajomych po nazwie
 */
export const searchFriends = async (
  userId: string,
  searchTerm: string,
  limitCount: number = 20
): Promise<FriendWithStatus[]> => {
  try {
    const friends = await getFriendsList(userId, 200);
    const searchLower = searchTerm.toLowerCase();
    
    return friends
      .filter(friend => 
        friend.name.toLowerCase().includes(searchLower) ||
        friend.address.toLowerCase().includes(searchLower)
      )
      .slice(0, limitCount);
  } catch (error) {
    console.error('Error searching friends:', error);
    return [];
  }
};

// ===============================================
// 🛠️ UTILITY FUNCTIONS
// ===============================================

/**
 * Pobierz statystyki znajomych użytkownika
 */
export const getFriendsStats = async (userId: string): Promise<{
  totalFriends: number;
  pendingRequests: number;
  sentRequests: number;
  onlineFriends: number;
}> => {
  try {
    const [friends, received, sent] = await Promise.all([
      getFriendsList(userId, 1000),
      getReceivedFriendRequests(userId, 100),
      getSentFriendRequests(userId, 100)
    ]);

    const onlineFriends = friends.filter(f => f.isOnline).length;

    return {
      totalFriends: friends.length,
      pendingRequests: received.length,
      sentRequests: sent.length,
      onlineFriends
    };
  } catch (error) {
    console.error('Error getting friends stats:', error);
    return {
      totalFriends: 0,
      pendingRequests: 0,
      sentRequests: 0,
      onlineFriends: 0
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
    console.error('Error getting friendship status:', error);
    return {
      areFriends: false,
      canSendRequest: false,
      relationship: 'none'
    };
  }
};

/**
 * Wyczyść wszystkie odrzucone/wygasłe zaproszenia (maintenance function)
 */
export const cleanupOldFriendRequests = async (daysOld: number = 30): Promise<number> => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const requestsRef = collection(db, 'friendRequests');
    const oldRequestsQuery = query(
      requestsRef,
      where('sentAt', '<', cutoffDate),
      where('status', 'in', ['rejected', 'blocked'])
    );

    const snapshot = await getDocs(oldRequestsQuery);
    const batch = writeBatch(db);

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    if (snapshot.docs.length > 0) {
      await batch.commit();
    }

    console.log(`🧹 Cleaned up ${snapshot.docs.length} old friend requests`);
    return snapshot.docs.length;
  } catch (error) {
    console.error('Error cleaning up old friend requests:', error);
    return 0;
  }
};

// Import z pliku notifications.ts (będzie stworzony osobno)
async function addNotification(userId: string, notification: any) {
  // Implementacja powiadomień
  console.log('Notification would be sent:', { userId, notification });
}