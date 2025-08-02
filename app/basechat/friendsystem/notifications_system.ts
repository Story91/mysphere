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
  updateDoc,
  setDoc
} from 'firebase/firestore';
import { db } from './config';

// ===============================================
// 🔔 NOTIFICATIONS SYSTEM INTERFACES
// ===============================================

export type NotificationType = 
  | 'LIKE'                    // Post został polubiony
  | 'COMMENT'                 // Nowy komentarz na poście
  | 'MENTION'                 // Wspomnienie w poście/komentarzu
  | 'FOLLOW'                  // Nowy obserwujący
  | 'FRIEND_REQUEST'          // Zaproszenie do znajomych
  | 'FRIEND_REQUEST_ACCEPTED' // Zaakceptowane zaproszenie
  | 'POST_PINNED'            // Post został przypięty
  | 'TIP_RECEIVED'           // Otrzymano tip
  | 'SYSTEM'                 // Powiadomienie systemowe
  | 'ACHIEVEMENT';           // Odblokowane osiągnięcie

export interface Notification {
  id?: string;
  userId: string;            // Odbiorca powiadomienia
  type: NotificationType;
  fromUserId?: string;       // Kto wywołał akcję (jeśli dotyczy)
  fromUserName?: string;     // Nazwa użytkownika który wywołał akcję
  fromUserAvatar?: string;   // Avatar użytkownika
  title: string;             // Tytuł powiadomienia
  message: string;           // Treść powiadomienia
  data?: {                   // Dodatkowe dane specyficzne dla typu
    postId?: string;
    commentId?: string;
    tipAmount?: string;
    achievementId?: string;
    [key: string]: any;
  };
  isRead: boolean;
  createdAt: any;
  readAt?: any;
  actionUrl?: string;        // URL do przekierowania po kliknięciu
}

export interface NotificationPreferences {
  userId: string;
  email: boolean;
  push: boolean;
  inApp: boolean;
  types: {
    [K in NotificationType]: boolean;
  };
  quiet_hours: {
    enabled: boolean;
    start: string;  // "22:00"
    end: string;    // "08:00"
  };
}

// ===============================================
// 🚀 CORE NOTIFICATION FUNCTIONS
// ===============================================

/**
 * Zresetuj licznik nieprzeczytanych powiadomień
 */
const resetUnreadCount = async (userId: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      unreadNotifications: 0,
      lastNotificationUpdate: serverTimestamp()
    });
  } catch (error) {
    console.error('Error resetting unread count:', error);
  }
};

/**
 * Sprawdź czy aktualny czas jest w quiet hours
 */
const isInQuietHours = (quietHours: { start: string; end: string }): boolean => {
  const now = new Date();
  const currentTime = now.getHours() * 100 + now.getMinutes(); // Format: HHMM

  const [startHour, startMin] = quietHours.start.split(':').map(Number);
  const [endHour, endMin] = quietHours.end.split(':').map(Number);
  
  const startTime = startHour * 100 + startMin;
  const endTime = endHour * 100 + endMin;

  if (startTime <= endTime) {
    // Same day quiet hours (e.g., 14:00 - 18:00)
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    // Overnight quiet hours (e.g., 22:00 - 08:00)
    return currentTime >= startTime || currentTime <= endTime;
  }
};

/**
 * Wyczyść stare powiadomienia (maintenance function)
 */
export const cleanupOldNotifications = async (
  userId: string,
  daysOld: number = 30
): Promise<number> => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const notificationsRef = collection(db, `users/${userId}/notifications`);
    const oldNotificationsQuery = query(
      notificationsRef,
      where('createdAt', '<', cutoffDate),
      limit(100) // Process in batches
    );

    const snapshot = await getDocs(oldNotificationsQuery);
    if (snapshot.empty) return 0;

    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`🧹 Cleaned up ${snapshot.docs.length} old notifications for ${userId}`);
    return snapshot.docs.length;

  } catch (error) {
    console.error('Error cleaning up old notifications:', error);
    return 0;
  }
};

/**
 * Pobierz podsumowanie powiadomień (dla dashboard)
 */
export const getNotificationsSummary = async (userId: string): Promise<{
  total: number;
  unread: number;
  byType: { [K in NotificationType]: number };
  recent: Notification[];
}> => {
  try {
    const [allNotifications, recentNotifications] = await Promise.all([
      getUserNotifications(userId, 100),
      getUserNotifications(userId, 5)
    ]);

    const byType: { [K in NotificationType]: number } = {
      LIKE: 0,
      COMMENT: 0,
      MENTION: 0,
      FOLLOW: 0,
      FRIEND_REQUEST: 0,
      FRIEND_REQUEST_ACCEPTED: 0,
      POST_PINNED: 0,
      TIP_RECEIVED: 0,
      SYSTEM: 0,
      ACHIEVEMENT: 0
    };

    let unread = 0;

    allNotifications.forEach(notification => {
      byType[notification.type]++;
      if (!notification.isRead) {
        unread++;
      }
    });

    return {
      total: allNotifications.length,
      unread,
      byType,
      recent: recentNotifications
    };

  } catch (error) {
    console.error('Error getting notifications summary:', error);
    return {
      total: 0,
      unread: 0,
      byType: {
        LIKE: 0,
        COMMENT: 0,
        MENTION: 0,
        FOLLOW: 0,
        FRIEND_REQUEST: 0,
        FRIEND_REQUEST_ACCEPTED: 0,
        POST_PINNED: 0,
        TIP_RECEIVED: 0,
        SYSTEM: 0,
        ACHIEVEMENT: 0
      },
      recent: []
    };
  }
};

// ===============================================
// 📱 REAL-TIME NOTIFICATIONS (for WebSocket/SSE)
// ===============================================

/**
 * Interfejs dla real-time notyfikacji
 */
export interface RealtimeNotificationSubscription {
  userId: string;
  callback: (notification: Notification) => void;
  types?: NotificationType[];
}

// Mapa aktywnych subskrypcji (w prawdziwej implementacji użyj Redis/WebSocket)
const activeSubscriptions = new Map<string, RealtimeNotificationSubscription>();

/**
 * Subskrybuj real-time powiadomienia
 */
export const subscribeToNotifications = (
  subscription: RealtimeNotificationSubscription
): string => {
  const subscriptionId = `${subscription.userId}_${Date.now()}_${Math.random()}`;
  activeSubscriptions.set(subscriptionId, subscription);
  
  console.log(`📡 User ${subscription.userId} subscribed to notifications`);
  return subscriptionId;
};

/**
 * Anuluj subskrypcję
 */
export const unsubscribeFromNotifications = (subscriptionId: string): void => {
  activeSubscriptions.delete(subscriptionId);
  console.log(`📡 Unsubscribed: ${subscriptionId}`);
};

/**
 * Wyślij real-time powiadomienie do subskrybentów
 */
export const broadcastNotification = (notification: Notification): void => {
  activeSubscriptions.forEach((subscription, subscriptionId) => {
    if (subscription.userId === notification.userId) {
      // Sprawdź czy typ powiadomienia jest subskrybowany
      if (!subscription.types || subscription.types.includes(notification.type)) {
        try {
          subscription.callback(notification);
        } catch (error) {
          console.error(`Error broadcasting to ${subscriptionId}:`, error);
          // Usuń zepsutą subskrypcję
          activeSubscriptions.delete(subscriptionId);
        }
      }
    }
  });
};

// ===============================================
// 🎯 BATCH NOTIFICATIONS (for mass operations)
// ===============================================

/**
 * Wyślij powiadomienia do wielu użytkowników jednocześnie
 */
export const createBatchNotifications = async (
  notifications: Array<Omit<Notification, 'id' | 'createdAt' | 'isRead'>>
): Promise<{ successful: number; failed: number }> => {
  let successful = 0;
  let failed = 0;

  // Procesuj w batch'ach po 20 (Firestore limitation)
  for (let i = 0; i < notifications.length; i += 20) {
    const batch = notifications.slice(i, i + 20);
    
    try {
      const promises = batch.map(notification => createNotification(notification));
      const results = await Promise.allSettled(promises);
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          successful++;
        } else {
          failed++;
        }
      });

      // Małe opóźnienie między batch'ami
      if (i + 20 < notifications.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      console.error(`Error processing notification batch ${i}-${i + 20}:`, error);
      failed += batch.length;
    }
  }

  console.log(`📬 Batch notifications: ${successful} successful, ${failed} failed`);
  return { successful, failed };
};

/**
 * Powiadom wszystkich obserwujących o nowym poście
 */
export const notifyFollowersAboutNewPost = async (
  authorId: string,
  postId: string,
  postContent: string
): Promise<void> => {
  try {
    // Pobierz obserwujących (tylko aktywnych użytkowników)
    const followersRef = collection(db, `users/${authorId}/followers`);
    const followersQuery = query(followersRef, limit(1000)); // Limit dla performance
    const followersSnapshot = await getDocs(followersQuery);

    if (followersSnapshot.empty) return;

    // Pobierz nazwę autora
    const authorDoc = await getDoc(doc(db, 'users', authorId));
    const authorName = authorDoc.exists() ? authorDoc.data().name : 'Użytkownik';

    // Przygotuj powiadomienia
    const notifications: Array<Omit<Notification, 'id' | 'createdAt' | 'isRead'>> = [];

    followersSnapshot.docs.forEach(followerDoc => {
      notifications.push({
        userId: followerDoc.id,
        type: 'SYSTEM',
        fromUserId: authorId,
        title: 'Nowy post',
        message: `${authorName} opublikował(a) nowy post: "${postContent.slice(0, 50)}${postContent.length > 50 ? '...' : ''}"`,
        data: { postId },
        actionUrl: `/post/${postId}`
      });
    });

    // Wyślij w batch'ach
    await createBatchNotifications(notifications);

  } catch (error) {
    console.error('Error notifying followers about new post:', error);
  }
};

// ===============================================
// 📊 ANALYTICS & METRICS
// ===============================================

/**
 * Pobierz metryki powiadomień dla użytkownika
 */
export const getNotificationMetrics = async (
  userId: string,
  days: number = 7
): Promise<{
  totalSent: number;
  totalRead: number;
  readRate: number;
  avgTimeToRead: number; // in minutes
  topTypes: Array<{ type: NotificationType; count: number }>;
}> => {
  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const notificationsRef = collection(db, `users/${userId}/notifications`);
    const metricsQuery = query(
      notificationsRef,
      where('createdAt', '>=', fromDate),
      orderBy('createdAt', 'desc'),
      limit(1000)
    );

    const snapshot = await getDocs(metricsQuery);
    const notifications = snapshot.docs.map(doc => doc.data() as Notification);

    const totalSent = notifications.length;
    const totalRead = notifications.filter(n => n.isRead).length;
    const readRate = totalSent > 0 ? (totalRead / totalSent) * 100 : 0;

    // Oblicz średni czas do przeczytania
    let totalReadTime = 0;
    let readNotifications = 0;

    notifications.forEach(notification => {
      if (notification.isRead && notification.readAt && notification.createdAt) {
        const createdAt = notification.createdAt.toMillis ? notification.createdAt.toMillis() : notification.createdAt;
        const readAt = notification.readAt.toMillis ? notification.readAt.toMillis() : notification.readAt;
        totalReadTime += (readAt - createdAt) / (1000 * 60); // Convert to minutes
        readNotifications++;
      }
    });

    const avgTimeToRead = readNotifications > 0 ? totalReadTime / readNotifications : 0;

    // Top typy powiadomień
    const typeCounts: { [key: string]: number } = {};
    notifications.forEach(notification => {
      typeCounts[notification.type] = (typeCounts[notification.type] || 0) + 1;
    });

    const topTypes = Object.entries(typeCounts)
      .map(([type, count]) => ({ type: type as NotificationType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalSent,
      totalRead,
      readRate: Math.round(readRate * 100) / 100,
      avgTimeToRead: Math.round(avgTimeToRead * 100) / 100,
      topTypes
    };

  } catch (error) {
    console.error('Error getting notification metrics:', error);
    return {
      totalSent: 0,
      totalRead: 0,
      readRate: 0,
      avgTimeToRead: 0,
      topTypes: []
    };
  }
};

// Export głównej funkcji do tworzenia powiadomień
export const createNotification = async (
  notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>
): Promise<string | null> => {
  try {
    // Sprawdź preferencje użytkownika
    const preferences = await getNotificationPreferences(notification.userId);
    if (!preferences.inApp || !preferences.types[notification.type]) {
      console.log(`🔕 Notification blocked by user preferences: ${notification.type}`);
      return null;
    }

    // Sprawdź quiet hours
    if (preferences.quiet_hours.enabled && isInQuietHours(preferences.quiet_hours)) {
      console.log(`🌙 Notification delayed due to quiet hours`);
      // TODO: Implement delayed notifications queue
      return null;
    }

    // Pobierz dane użytkownika który wywołał akcję (jeśli dotyczy)
    let fromUserData = null;
    if (notification.fromUserId) {
      const fromUserDoc = await getDoc(doc(db, 'users', notification.fromUserId));
      if (fromUserDoc.exists()) {
        fromUserData = fromUserDoc.data();
      }
    }

    const notificationData: Notification = {
      ...notification,
      fromUserName: fromUserData?.name || notification.fromUserName,
      fromUserAvatar: fromUserData?.avatar || notification.fromUserAvatar,
      isRead: false,
      createdAt: serverTimestamp()
    };

    // Dodaj do kolekcji powiadomień użytkownika
    const notificationRef = await addDoc(
      collection(db, `users/${notification.userId}/notifications`),
      notificationData
    );

    // Aktualizuj licznik nieprzeczytanych powiadomień
    await updateUnreadCount(notification.userId, 1);

    console.log(`🔔 Notification created: ${notification.type} for ${notification.userId}`);
    return notificationRef.id;

  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

/**
 * Pobierz powiadomienia użytkownika
 */
export const getUserNotifications = async (
  userId: string,
  limitCount: number = 20,
  onlyUnread: boolean = false
): Promise<Notification[]> => {
  try {
    const notificationsRef = collection(db, `users/${userId}/notifications`);
    let notificationsQuery = query(
      notificationsRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    if (onlyUnread) {
      notificationsQuery = query(
        notificationsRef,
        where('isRead', '==', false),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(notificationsQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toMillis?.() || Date.now(),
      readAt: doc.data().readAt?.toMillis?.() || undefined
    } as Notification));

  } catch (error) {
    console.error('Error getting user notifications:', error);
    return [];
  }
};

/**
 * Oznacz powiadomienie jako przeczytane
 */
export const markNotificationAsRead = async (
  userId: string,
  notificationId: string
): Promise<boolean> => {
  try {
    const notificationRef = doc(db, `users/${userId}/notifications`, notificationId);
    const notificationDoc = await getDoc(notificationRef);

    if (!notificationDoc.exists()) {
      return false;
    }

    const notificationData = notificationDoc.data();
    if (notificationData.isRead) {
      return true; // Już przeczytane
    }

    await updateDoc(notificationRef, {
      isRead: true,
      readAt: serverTimestamp()
    });

    // Zmniejsz licznik nieprzeczytanych
    await updateUnreadCount(userId, -1);

    return true;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }
};

/**
 * Oznacz wszystkie powiadomienia jako przeczytane
 */
export const markAllNotificationsAsRead = async (userId: string): Promise<number> => {
  try {
    const notificationsRef = collection(db, `users/${userId}/notifications`);
    const unreadQuery = query(
      notificationsRef,
      where('isRead', '==', false),
      limit(100) // Batch limit
    );

    const snapshot = await getDocs(unreadQuery);
    if (snapshot.empty) return 0;

    const batch = writeBatch(db);
    const now = serverTimestamp();

    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        isRead: true,
        readAt: now
      });
    });

    await batch.commit();

    // Zresetuj licznik nieprzeczytanych
    await resetUnreadCount(userId);

    console.log(`✅ Marked ${snapshot.docs.length} notifications as read for ${userId}`);
    return snapshot.docs.length;

  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return 0;
  }
};

/**
 * Usuń powiadomienie
 */
export const deleteNotification = async (
  userId: string,
  notificationId: string
): Promise<boolean> => {
  try {
    const notificationRef = doc(db, `users/${userId}/notifications`, notificationId);
    const notificationDoc = await getDoc(notificationRef);

    if (!notificationDoc.exists()) {
      return false;
    }

    const notificationData = notificationDoc.data();
    await deleteDoc(notificationRef);

    // Jeśli było nieprzeczytane, zmniejsz licznik
    if (!notificationData.isRead) {
      await updateUnreadCount(userId, -1);
    }

    return true;
  } catch (error) {
    console.error('Error deleting notification:', error);
    return false;
  }
};

/**
 * Pobierz liczbę nieprzeczytanych powiadomień
 */
export const getUnreadNotificationsCount = async (userId: string): Promise<number> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData.unreadNotifications || 0;
    }

    return 0;
  } catch (error) {
    console.error('Error getting unread notifications count:', error);
    return 0;
  }
};

// ===============================================
// 🎯 SPECIFIC NOTIFICATION CREATORS
// ===============================================

/**
 * Powiadomienie o polubieniu posta
 */
export const notifyPostLiked = async (
  postId: string,
  postAuthorId: string,
  likedByUserId: string
): Promise<void> => {
  if (postAuthorId === likedByUserId) return; // Nie powiadamiaj o własnych akcjach

  await createNotification({
    userId: postAuthorId,
    type: 'LIKE',
    fromUserId: likedByUserId,
    title: 'Nowy polubiony post',
    message: 'polubił(a) Twój post',
    data: { postId },
    actionUrl: `/post/${postId}`
  });
};

/**
 * Powiadomienie o nowym komentarzu
 */
export const notifyNewComment = async (
  postId: string,
  postAuthorId: string,
  commentAuthorId: string,
  commentContent: string
): Promise<void> => {
  if (postAuthorId === commentAuthorId) return;

  await createNotification({
    userId: postAuthorId,
    type: 'COMMENT',
    fromUserId: commentAuthorId,
    title: 'Nowy komentarz',
    message: `skomentował(a): "${commentContent.slice(0, 50)}${commentContent.length > 50 ? '...' : ''}"`,
    data: { postId },
    actionUrl: `/post/${postId}#comments`
  });
};

/**
 * Powiadomienie o obserwowaniu
 */
export const notifyNewFollower = async (
  followingId: string,
  followerId: string
): Promise<void> => {
  await createNotification({
    userId: followingId,
    type: 'FOLLOW',
    fromUserId: followerId,
    title: 'Nowy obserwujący',
    message: 'zaczął(ęła) Cię obserwować',
    actionUrl: `/profile/${followerId}`
  });
};

/**
 * Powiadomienie o zaproszeniu do znajomych
 */
export const notifyFriendRequest = async (
  receiverId: string,
  senderId: string,
  message?: string
): Promise<void> => {
  await createNotification({
    userId: receiverId,
    type: 'FRIEND_REQUEST',
    fromUserId: senderId,
    title: 'Zaproszenie do znajomych',
    message: message || 'wysłał(a) Ci zaproszenie do znajomych',
    actionUrl: '/friends/requests'
  });
};

/**
 * Powiadomienie o zaakceptowaniu zaproszenia
 */
export const notifyFriendRequestAccepted = async (
  senderId: string,
  accepterId: string
): Promise<void> => {
  await createNotification({
    userId: senderId,
    type: 'FRIEND_REQUEST_ACCEPTED',
    fromUserId: accepterId,
    title: 'Zaproszenie zaakceptowane',
    message: 'zaakceptował(a) Twoje zaproszenie do znajomych',
    actionUrl: `/profile/${accepterId}`
  });
};

/**
 * Powiadomienie o otrzymanym tipie
 */
export const notifyTipReceived = async (
  recipientId: string,
  senderId: string,
  amount: string,
  token: string,
  postId?: string
): Promise<void> => {
  await createNotification({
    userId: recipientId,
    type: 'TIP_RECEIVED',
    fromUserId: senderId,
    title: 'Otrzymano tip',
    message: `wysłał(a) Ci ${amount} ${token}`,
    data: { tipAmount: amount, token, postId },
    actionUrl: postId ? `/post/${postId}` : `/profile/${senderId}`
  });
};

/**
 * Powiadomienie systemowe
 */
export const notifySystem = async (
  userId: string,
  title: string,
  message: string,
  actionUrl?: string
): Promise<void> => {
  await createNotification({
    userId,
    type: 'SYSTEM',
    title,
    message,
    actionUrl
  });
};

// ===============================================
// ⚙️ NOTIFICATION PREFERENCES
// ===============================================

/**
 * Pobierz preferencje powiadomień użytkownika
 */
export const getNotificationPreferences = async (
  userId: string
): Promise<NotificationPreferences> => {
  try {
    const preferencesRef = doc(db, `users/${userId}/settings`, 'notifications');
    const preferencesDoc = await getDoc(preferencesRef);

    if (preferencesDoc.exists()) {
      return preferencesDoc.data() as NotificationPreferences;
    }

    // Domyślne preferencje
    const defaultPreferences: NotificationPreferences = {
      userId,
      email: true,
      push: true,
      inApp: true,
      types: {
        LIKE: true,
        COMMENT: true,
        MENTION: true,
        FOLLOW: true,
        FRIEND_REQUEST: true,
        FRIEND_REQUEST_ACCEPTED: true,
        POST_PINNED: true,
        TIP_RECEIVED: true,
        SYSTEM: true,
        ACHIEVEMENT: true
      },
      quiet_hours: {
        enabled: false,
        start: "22:00",
        end: "08:00"
      }
    };

    // Zapisz domyślne preferencje
    await setDoc(preferencesRef, defaultPreferences);
    return defaultPreferences;

  } catch (error) {
    console.error('Error getting notification preferences:', error);
    // Return safe defaults
    return {
      userId,
      email: false,
      push: false,
      inApp: true,
      types: {
        LIKE: true,
        COMMENT: true,
        MENTION: true,
        FOLLOW: true,
        FRIEND_REQUEST: true,
        FRIEND_REQUEST_ACCEPTED: true,
        POST_PINNED: true,
        TIP_RECEIVED: true,
        SYSTEM: true,
        ACHIEVEMENT: true
      },
      quiet_hours: {
        enabled: false,
        start: "22:00",
        end: "08:00"
      }
    };
  }
};

/**
 * Zaktualizuj preferencje powiadomień
 */
export const updateNotificationPreferences = async (
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<boolean> => {
  try {
    const preferencesRef = doc(db, `users/${userId}/settings`, 'notifications');
    await updateDoc(preferencesRef, {
      ...preferences,
      userId,
      updatedAt: serverTimestamp()
    });

    return true;
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return false;
  }
};

// ===============================================
// 🛠️ UTILITY FUNCTIONS
// ===============================================

/**
 * Aktualizuj licznik nieprzeczytanych powiadomień
 */
const updateUnreadCount = async (userId: string, delta: number): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const currentCount = userDoc.data().unreadNotifications || 0;
      const newCount = Math.max(0, currentCount + delta);
      
      await updateDoc(userRef, {
        unreadNotifications: newCount,
        lastNotificationUpdate: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error updating unread count:', error);
  }
};

// Export głównej funkcji jako alias dla kompatybilności
export const addNotification = createNotification;

/**
 * Export wszystkich funkcji systemu powiadomień
 */