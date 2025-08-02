// ===============================================
// 🚀 SOCIAL FEATURES - Główny export wszystkich funkcji
// ===============================================

// Export konfiguracji
export * from './config';

// Export core social features
export * from './follows';
export * from './friends';
export * from './notifications';

// ===============================================
// 🔄 COMPATIBILITY WITH EXISTING FIREBASE.TS
// ===============================================

// Note: Legacy notification functions available in '../firebase'
// Import them directly if needed:
// import { addNotification, fetchUnreadNotifications, markNotificationAsRead } from '../firebase';

// Import wszystkich typów dla re-export
import type {
  Follow,
  FollowStats,
  UserWithFollowStatus
} from './follows';

import type {
  FriendRequest,
  Friendship,
  FriendWithStatus,
  FriendsStats,
  FriendRequestStatus
} from './friends';

import type {
  Notification,
  NotificationPreferences,
  NotificationSummary,
  NotificationType
} from './notifications';

import type {
  COLLECTIONS,
  FIELDS,
  SOCIAL_CONFIG
} from './config';

// Re-export types
export type {
  Follow,
  FollowStats,
  UserWithFollowStatus,
  FriendRequest,
  Friendship,
  FriendWithStatus,
  FriendsStats,
  FriendRequestStatus,
  Notification,
  NotificationPreferences,
  NotificationSummary,
  NotificationType
};

// ===============================================
// 🎯 UNIFIED SOCIAL API CLASS
// ===============================================

/**
 * Główne API społecznościowe - jedna klasa do wszystkich akcji
 * Przykład użycia:
 * 
 * const social = new SocialAPI('0x123...');
 * await social.follow('0x456...');
 * const followers = await social.getFollowers();
 * const notifications = await social.getNotifications();
 */
export class SocialAPI {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  // ===== FOLLOWS =====
  async follow(targetUserId: string) {
    const { followUser } = await import('./follows');
    return followUser(this.userId, targetUserId);
  }

  async unfollow(targetUserId: string) {
    const { unfollowUser } = await import('./follows');
    return unfollowUser(this.userId, targetUserId);
  }

  async getFollowers(limit?: number) {
    const { getFollowers } = await import('./follows');
    return getFollowers(this.userId, limit);
  }

  async getFollowing(limit?: number) {
    const { getFollowing } = await import('./follows');
    return getFollowing(this.userId, limit);
  }

  async getMutualFollows(limit?: number) {
    const { getMutualFollows } = await import('./follows');
    return getMutualFollows(this.userId, limit);
  }

  async getSuggestedUsers(limit?: number) {
    const { getSuggestedUsers } = await import('./follows');
    return getSuggestedUsers(this.userId, limit);
  }

  async getFollowStats() {
    const { getUserFollowStats } = await import('./follows');
    return getUserFollowStats(this.userId);
  }

  async checkIfFollowing(targetUserId: string) {
    const { checkIfFollowing } = await import('./follows');
    return checkIfFollowing(this.userId, targetUserId);
  }

  async getFollowRelationship(targetUserId: string) {
    const { getFollowRelationship } = await import('./follows');
    return getFollowRelationship(this.userId, targetUserId);
  }

  // ===== FRIENDS =====
  async sendFriendRequest(targetUserId: string, message?: string) {
    const { sendFriendRequest } = await import('./friends');
    return sendFriendRequest(this.userId, targetUserId, message);
  }

  async acceptFriendRequest(requestId: string) {
    const { acceptFriendRequest } = await import('./friends');
    return acceptFriendRequest(requestId, this.userId);
  }

  async rejectFriendRequest(requestId: string, reason?: string) {
    const { rejectFriendRequest } = await import('./friends');
    return rejectFriendRequest(requestId, this.userId, reason);
  }

  async getFriends(limit?: number) {
    const { getFriendsList } = await import('./friends');
    return getFriendsList(this.userId, limit);
  }

  async removeFriend(friendId: string) {
    const { removeFriend } = await import('./friends');
    return removeFriend(this.userId, friendId);
  }

  async getReceivedFriendRequests(limit?: number) {
    const { getReceivedFriendRequests } = await import('./friends');
    return getReceivedFriendRequests(this.userId, limit);
  }

  async getSentFriendRequests(limit?: number) {
    const { getSentFriendRequests } = await import('./friends');
    return getSentFriendRequests(this.userId, limit);
  }

  async getFriendsStats() {
    const { getFriendsStats } = await import('./friends');
    return getFriendsStats(this.userId);
  }

  async checkFriendship(targetUserId: string) {
    const { checkFriendship } = await import('./friends');
    return checkFriendship(this.userId, targetUserId);
  }

  async getFriendshipStatus(targetUserId: string) {
    const { getFriendshipStatus } = await import('./friends');
    return getFriendshipStatus(this.userId, targetUserId);
  }

  // ===== NOTIFICATIONS =====
  async getNotifications(limit?: number, onlyUnread?: boolean) {
    const { getUserNotifications } = await import('./notifications');
    return getUserNotifications(this.userId, limit, onlyUnread);
  }

  async getNotificationsSummary() {
    const { getNotificationsSummary } = await import('./notifications');
    return getNotificationsSummary(this.userId);
  }

  async markNotificationAsRead(notificationId: string) {
    const { markNotificationAsRead } = await import('./notifications');
    return markNotificationAsRead(this.userId, notificationId);
  }

  async markAllNotificationsAsRead() {
    const { markAllNotificationsAsRead } = await import('./notifications');
    return markAllNotificationsAsRead(this.userId);
  }

  async deleteNotification(notificationId: string) {
    const { deleteNotification } = await import('./notifications');
    return deleteNotification(this.userId, notificationId);
  }

  async getUnreadNotificationsCount() {
    const { getUnreadNotificationsCount } = await import('./notifications');
    return getUnreadNotificationsCount(this.userId);
  }

  async getNotificationPreferences() {
    const { getNotificationPreferences } = await import('./notifications');
    return getNotificationPreferences(this.userId);
  }

  async updateNotificationPreferences(preferences: Partial<NotificationPreferences>) {
    const { updateNotificationPreferences } = await import('./notifications');
    return updateNotificationPreferences(this.userId, preferences);
  }

  async subscribeToNotifications(
    callback: (notification: Notification) => void,
    types?: NotificationType[]
  ) {
    const { subscribeToNotifications } = await import('./notifications');
    return subscribeToNotifications(this.userId, callback, types);
  }

  // ===== UTILITY METHODS =====
  
  /**
   * Pobierz kompletny profil społecznościowy użytkownika
   */
  async getCompleteProfile() {
    const [followStats, friendsStats, notificationsSummary] = await Promise.all([
      this.getFollowStats(),
      this.getFriendsStats(),
      this.getNotificationsSummary()
    ]);

    return {
      userId: this.userId,
      followStats,
      friendsStats,
      notificationsSummary
    };
  }

  /**
   * Sprawdź pełny status relacji z innym użytkownikiem
   */
  async getRelationshipWith(targetUserId: string) {
    const [followRelationship, friendshipStatus] = await Promise.all([
      this.getFollowRelationship(targetUserId),
      this.getFriendshipStatus(targetUserId)
    ]);

    return {
      targetUserId,
      following: {
        iFollowThem: followRelationship.user1FollowsUser2,
        theyFollowMe: followRelationship.user2FollowsUser1,
        isMutual: followRelationship.isMutual
      },
      friendship: {
        areFriends: friendshipStatus.areFriends,
        canSendRequest: friendshipStatus.canSendRequest,
        relationship: friendshipStatus.relationship,
        pendingRequest: friendshipStatus.pendingRequest
      }
    };
  }
}

// ===============================================
// 🚀 CONVENIENCE FUNCTIONS
// ===============================================

/**
 * Stwórz instancję Social API dla użytkownika
 */
export const createSocialAPI = (userId: string): SocialAPI => {
  return new SocialAPI(userId);
};

/**
 * Hook-like function dla React components
 * Przykład: const social = useSocialAPI(userAddress);
 */
export const useSocialAPI = (userId: string | null): SocialAPI | null => {
  if (!userId) return null;
  return new SocialAPI(userId);
};

// ===============================================
// 📊 GLOBAL SOCIAL FUNCTIONS
// ===============================================

/**
 * Pobierz globalne statystyki społecznościowe platformy
 */
export const getGlobalSocialStats = async (): Promise<{
  totalUsers: number;
  totalConnections: number;
  totalFollows: number;
  totalFriendships: number;
  activeUsers24h: number;
  topActiveUsers: Array<{
    userId: string;
    name: string;
    avatar?: string;
    activityScore: number;
  }>;
}> => {
  try {
    // TODO: Implement global stats aggregation
    // This would require additional aggregation collections or cloud functions
    
    return {
      totalUsers: 0,
      totalConnections: 0,
      totalFollows: 0,
      totalFriendships: 0,
      activeUsers24h: 0,
      topActiveUsers: []
    };

  } catch (error) {
    console.error('Błąd pobierania globalnych statystyk społecznościowych:', error);
    return {
      totalUsers: 0,
      totalConnections: 0,
      totalFollows: 0,
      totalFriendships: 0,
      activeUsers24h: 0,
      topActiveUsers: []
    };
  }
};

// ===============================================
// 🔧 BATCH OPERATIONS
// ===============================================

/**
 * Masowe operacje społecznościowe
 */
export const batchSocialOperations = {
  /**
   * Obserwuj wielu użytkowników jednocześnie
   */
  async followMultiple(
    followerId: string,
    userIds: string[],
    batchSize: number = 5
  ) {
    const { followMultipleUsers } = await import('./follows');
    return followMultipleUsers(followerId, userIds, batchSize);
  },

  /**
   * Wyślij powiadomienia do wielu użytkowników
   */
  async createMultipleNotifications(
    notifications: Array<Omit<Notification, 'id' | 'createdAt' | 'isRead'>>
  ) {
    const { createBatchNotifications } = await import('./notifications');
    return createBatchNotifications(notifications);
  }
};

// ===============================================
// 🧹 MAINTENANCE FUNCTIONS
// ===============================================

/**
 * Funkcje maintenance dla czyszczenia starych danych
 */
export const maintenanceOperations = {
  /**
   * Wyczyść stare powiadomienia dla użytkownika
   */
  async cleanupUserNotifications(userId: string, daysOld: number = 30) {
    const { cleanupOldNotifications } = await import('./notifications');
    return cleanupOldNotifications(userId, daysOld);
  },

  /**
   * Wyczyść stare zaproszenia do znajomych
   */
  async cleanupOldFriendRequests(daysOld: number = 60) {
    const { cleanupOldFriendRequests } = await import('./friends');
    return cleanupOldFriendRequests(daysOld);
  },

  /**
   * Wyczyść nieaktywne follows
   */
  async cleanupInactiveFollows(daysInactive: number = 180) {
    const { cleanupInactiveFollows } = await import('./follows');
    return cleanupInactiveFollows(daysInactive);
  }
};

// ===============================================
// 🔐 PRIVACY & MODERATION
// ===============================================

/**
 * Funkcje moderation i privacy
 */
export const moderationOperations = {
  /**
   * Zablokuj użytkownika (TODO: implement)
   */
  async blockUser(
    blockerId: string,
    blockedId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement user blocking
    // This should:
    // 1. Add to blocked users list
    // 2. Remove any existing follows/friendships
    // 3. Prevent future interactions
    // 4. Hide content from blocked user
    
    console.log(`🚫 Block user functionality not implemented yet`);
    return { success: false, error: 'Funkcja blokowania nie jest jeszcze zaimplementowana' };
  },

  /**
   * Odblokuj użytkownika (TODO: implement)
   */
  async unblockUser(
    blockerId: string,
    blockedId: string
  ): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement user unblocking
    
    console.log(`✅ Unblock user functionality not implemented yet`);
    return { success: false, error: 'Funkcja odblokowywania nie jest jeszcze zaimplementowana' };
  }
};

// ===============================================
// 📝 EXAMPLE USAGE
// ===============================================

/**
 * Przykład użycia Social API:
 * 
 * ```typescript
 * import { createSocialAPI } from '@/utils/friends';
 * 
 * const social = createSocialAPI('0x123...');
 * 
 * // Follow operations
 * await social.follow('0x456...');
 * const followers = await social.getFollowers();
 * 
 * // Friend operations  
 * await social.sendFriendRequest('0x789...', 'Cześć!');
 * const friends = await social.getFriends();
 * 
 * // Notifications
 * const notifications = await social.getNotifications();
 * await social.markAllNotificationsAsRead();
 * 
 * // Complete profile
 * const profile = await social.getCompleteProfile();
 * 
 * // Relationship status
 * const relationship = await social.getRelationshipWith('0x456...');
 * ```
 */

console.log('🚀 Social Features API initialized - ready to connect people!');

// ===============================================
// 📱 REAL-TIME SUBSCRIPTIONS HELPER
// ===============================================

/**
 * Helper do zarządzania real-time subscriptions
 */
export class SocialSubscriptionManager {
  private subscriptions: Map<string, () => void> = new Map();

  /**
   * Subskrybuj powiadomienia dla użytkownika
   */
  async subscribeToNotifications(
    userId: string,
    callback: (notification: Notification) => void,
    types?: NotificationType[]
  ): Promise<string> {
    const { subscribeToNotifications } = await import('./notifications');
    const subscriptionId = subscribeToNotifications(userId, callback, types);
    
    // Dodaj unsubscribe function
    const unsubscribe = () => {
      const { unsubscribeFromNotifications } = require('./notifications');
      unsubscribeFromNotifications(subscriptionId);
    };
    
    this.subscriptions.set(subscriptionId, unsubscribe);
    return subscriptionId;
  }

  /**
   * Anuluj konkretną subskrypcję
   */
  unsubscribe(subscriptionId: string): void {
    const unsubscribeFunc = this.subscriptions.get(subscriptionId);
    if (unsubscribeFunc) {
      unsubscribeFunc();
      this.subscriptions.delete(subscriptionId);
    }
  }

  /**
   * Anuluj wszystkie subskrypcje
   */
  unsubscribeAll(): void {
    this.subscriptions.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.subscriptions.clear();
  }

  /**
   * Pobierz aktywne subskrypcje
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }
}

/**
 * Stwórz manager subskrypcji
 */
export const createSubscriptionManager = (): SocialSubscriptionManager => {
  return new SocialSubscriptionManager();
};