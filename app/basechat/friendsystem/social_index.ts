// ===============================================
// 📱 SOCIAL.TS - Wspólne funkcje społecznościowe
// ===============================================

import { db } from './config';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// ===============================================
// 🔄 GENERAL SOCIAL FUNCTIONS
// ===============================================

/**
 * Aktualizuj ostatnią aktywność użytkownika
 */
export const updateUserActivity = async (userId: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      lastActive: serverTimestamp(),
      isOnline: true
    });
  } catch (error) {
    console.error('Error updating user activity:', error);
  }
};

/**
 * Ustaw status offline użytkownika
 */
export const setUserOffline = async (userId: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isOnline: false,
      lastSeen: serverTimestamp()
    });
  } catch (error) {
    console.error('Error setting user offline:', error);
  }
};

/**
 * Pobierz kompletny profil społecznościowy użytkownika
 */
export const getSocialProfile = async (userId: string): Promise<{
  basicInfo: any;
  socialStats: {
    followers: number;
    following: number;
    friends: number;
    posts: number;
    likes: number;
  };
  activityInfo: {
    isOnline: boolean;
    lastActive?: number;
    lastSeen?: number;
  };
  relationshipStatus?: {
    isFollowing: boolean;
    isFollower: boolean;
    areFriends: boolean;
    canSendFriendRequest: boolean;
  };
} | null> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return null;
    }

    const userData = userDoc.data();

    return {
      basicInfo: {
        address: userId,
        name: userData.name || `${userId.slice(0, 6)}...${userId.slice(-4)}`,
        avatar: userData.avatar,
        bio: userData.bio,
        joinedAt: userData.joinedAt?.toMillis?.() || Date.now()
      },
      socialStats: {
        followers: userData.socialStats?.followers || 0,
        following: userData.socialStats?.following || 0,
        friends: userData.socialStats?.friends || 0,
        posts: userData.postsCount || 0,
        likes: userData.likesReceived || 0
      },
      activityInfo: {
        isOnline: userData.isOnline || false,
        lastActive: userData.lastActive?.toMillis?.(),
        lastSeen: userData.lastSeen?.toMillis?.()
      }
    };

  } catch (error) {
    console.error('Error getting social profile:', error);
    return null;
  }
};

/**
 * Sprawdź status relacji między dwoma użytkownikami
 */
export const getRelationshipStatus = async (
  currentUserId: string,
  targetUserId: string
): Promise<{
  isFollowing: boolean;
  isFollower: boolean;
  areFriends: boolean;
  canSendFriendRequest: boolean;
  pendingFriendRequest?: 'sent' | 'received';
}> => {
  try {
    // Import funkcji z innych modułów (będą dostępne po stworzeniu)
    // const { checkIfFollowing } = await import('./follows');
    // const { checkFriendship, getFriendshipStatus } = await import('./friends');

    // Placeholder implementation - zastąp właściwymi funkcjami
    return {
      isFollowing: false,
      isFollower: false,
      areFriends: false,
      canSendFriendRequest: true
    };

  } catch (error) {
    console.error('Error getting relationship status:', error);
    return {
      isFollowing: false,
      isFollower: false,
      areFriends: false,
      canSendFriendRequest: false
    };
  }
};

// ===============================================
// 📊 SOCIAL ANALYTICS
// ===============================================

/**
 * Pobierz społeczne metryki użytkownika
 */
export const getSocialMetrics = async (userId: string, days: number = 30): Promise<{
  engagement: {
    likesReceived: number;
    commentsReceived: number;
    sharesReceived: number;
  };
  growth: {
    newFollowers: number;
    newFriends: number;
    followersGrowthRate: number;
  };
  activity: {
    postsCreated: number;
    commentsLeft: number;
    likesGiven: number;
    avgPostsPerDay: number;
  };
}> => {
  try {
    // TODO: Implement actual metrics calculation
    // This would involve querying posts, likes, comments, follows, etc.
    
    return {
      engagement: {
        likesReceived: 0,
        commentsReceived: 0,
        sharesReceived: 0
      },
      growth: {
        newFollowers: 0,
        newFriends: 0,
        followersGrowthRate: 0
      },
      activity: {
        postsCreated: 0,
        commentsLeft: 0,
        likesGiven: 0,
        avgPostsPerDay: 0
      }
    };

  } catch (error) {
    console.error('Error getting social metrics:', error);
    throw error;
  }
};

// ===============================================
// 🎯 SOCIAL RECOMMENDATIONS
// ===============================================

/**
 * Pobierz rekomendacje społecznościowe dla użytkownika
 */
export const getSocialRecommendations = async (userId: string): Promise<{
  suggestedUsers: Array<{
    address: string;
    name: string;
    avatar?: string;
    reason: string;
    mutualConnections: number;
  }>;
  trendingTopics: Array<{
    tag: string;
    count: number;
    growth: number;
  }>;
  recommendedContent: Array<{
    postId: string;
    reason: string;
    score: number;
  }>;
}> => {
  try {
    // TODO: Implement recommendation algorithms
    
    return {
      suggestedUsers: [],
      trendingTopics: [],
      recommendedContent: []
    };

  } catch (error) {
    console.error('Error getting social recommendations:', error);
    return {
      suggestedUsers: [],
      trendingTopics: [],
      recommendedContent: []
    };
  }
};

// ===============================================
// 🔧 MAINTENANCE FUNCTIONS
// ===============================================

/**
 * Wyczyść nieaktywne połączenia społecznościowe
 */
export const cleanupInactiveSocialConnections = async (daysInactive: number = 90): Promise<{
  cleanedFollows: number;
  cleanedFriendRequests: number;
  cleanedNotifications: number;
}> => {
  try {
    // TODO: Implement cleanup logic
    
    return {
      cleanedFollows: 0,
      cleanedFriendRequests: 0,
      cleanedNotifications: 0
    };

  } catch (error) {
    console.error('Error cleaning up social connections:', error);
    return {
      cleanedFollows: 0,
      cleanedFriendRequests: 0,
      cleanedNotifications: 0
    };
  }
};

// ===============================================
// 📋 INDEX.TS - Główny export pliku
// ===============================================

// Config exports
export * from './config';

// Core social features
export * from './follows_system';
export * from './friends_system';
export * from './notifications_system';

// ===============================================
// 🎯 UNIFIED SOCIAL API
// ===============================================

/**
 * Główne API społecznościowe - jedna funkcja do wszystkich akcji
 */
export class SocialAPI {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  // ===== FOLLOWS =====
  async follow(targetUserId: string) {
    const { followUser } = await import('./follows_system');
    return followUser(this.userId, targetUserId);
  }

  async unfollow(targetUserId: string) {
    const { unfollowUser } = await import('./follows_system');
    return unfollowUser(this.userId, targetUserId);
  }

  async getFollowers(limit?: number) {
    const { getFollowers } = await import('./follows_system');
    return getFollowers(this.userId, limit);
  }

  async getFollowing(limit?: number) {
    const { getFollowing } = await import('./follows_system');
    return getFollowing(this.userId, limit);
  }

  // ===== FRIENDS =====
  async sendFriendRequest(targetUserId: string, message?: string) {
    const { sendFriendRequest } = await import('./friends_system');
    return sendFriendRequest(this.userId, targetUserId, message);
  }

  async acceptFriendRequest(requestId: string) {
    const { acceptFriendRequest } = await import('./friends_system');
    return acceptFriendRequest(requestId, this.userId);
  }

  async getFriends(limit?: number) {
    const { getFriendsList } = await import('./friends_system');
    return getFriendsList(this.userId, limit);
  }

  async removeFriend(friendId: string) {
    const { removeFriend } = await import('./friends_system');
    return removeFriend(this.userId, friendId);
  }

  // ===== NOTIFICATIONS =====
  async getNotifications(limit?: number, onlyUnread?: boolean) {
    const { getUserNotifications } = await import('./notifications_system');
    return getUserNotifications(this.userId, limit, onlyUnread);
  }

  async markNotificationAsRead(notificationId: string) {
    const { markNotificationAsRead } = await import('./notifications_system');
    return markNotificationAsRead(this.userId, notificationId);
  }

  async markAllNotificationsAsRead() {
    const { markAllNotificationsAsRead } = await import('./notifications_system');
    return markAllNotificationsAsRead(this.userId);
  }

  // ===== PROFILE =====
  async getProfile() {
    return getSocialProfile(this.userId);
  }

  async updateActivity() {
    return updateUserActivity(this.userId);
  }

  async setOffline() {
    return setUserOffline(this.userId);
  }

  // ===== ANALYTICS =====
  async getMetrics(days?: number) {
    return getSocialMetrics(this.userId, days);
  }

  async getRecommendations() {
    return getSocialRecommendations(this.userId);
  }

  // ===== RELATIONSHIPS =====
  async getRelationshipWith(targetUserId: string) {
    return getRelationshipStatus(this.userId, targetUserId);
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
 */
export const useSocialAPI = (userId: string | null): SocialAPI | null => {
  if (!userId) return null;
  return new SocialAPI(userId);
};

// ===============================================
// 📊 GLOBAL SOCIAL STATS
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
    
    return {
      totalUsers: 0,
      totalConnections: 0,
      totalFollows: 0,
      totalFriendships: 0,
      activeUsers24h: 0,
      topActiveUsers: []
    };

  } catch (error) {
    console.error('Error getting global social stats:', error);
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
// 🔐 PRIVACY & MODERATION
// ===============================================

/**
 * Zablokuj użytkownika
 */
export const blockUser = async (
  blockerId: string,
  blockedId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // TODO: Implement user blocking
    // This should:
    // 1. Add to blocked users list
    // 2. Remove any existing follows/friendships
    // 3. Prevent future interactions
    // 4. Hide content from blocked user
    
    return { success: true };

  } catch (error) {
    console.error('Error blocking user:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error blocking user'
    };
  }
};

/**
 * Odblokuj użytkownika
 */
export const unblockUser = async (
  blockerId: string,
  blockedId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // TODO: Implement user unblocking
    
    return { success: true };

  } catch (error) {
    console.error('Error unblocking user:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error unblocking user'
    };
  }
};

/**
 * Pobierz listę zablokowanych użytkowników
 */
export const getBlockedUsers = async (userId: string): Promise<Array<{
  blockedUserId: string;
  blockedUserName: string;
  blockedAt: number;
  reason?: string;
}>> => {
  try {
    // TODO: Implement getting blocked users list
    
    return [];

  } catch (error) {
    console.error('Error getting blocked users:', error);
    return [];
  }
};

// ===============================================
// 📱 REAL-TIME SOCIAL FEATURES
// ===============================================

/**
 * Subskrybuj zmiany w statusie znajomych (online/offline)
 */
export const subscribeToFriendsStatus = (
  userId: string,
  callback: (friends: Array<{ userId: string; isOnline: boolean; lastSeen?: number }>) => void
): () => void => {
  // TODO: Implement real-time friends status subscription
  // Using Firestore onSnapshot or WebSocket
  
  console.log(`📡 Subscribed to friends status for ${userId}`);
  
  // Return unsubscribe function
  return () => {
    console.log(`📡 Unsubscribed from friends status for ${userId}`);
  };
};

/**
 * Wyślij typing indicator
 */
export const sendTypingIndicator = async (
  userId: string,
  targetUserId: string,
  isTyping: boolean
): Promise<void> => {
  try {
    // TODO: Implement typing indicators for DMs
    console.log(`⌨️ ${userId} is ${isTyping ? 'typing' : 'stopped typing'} to ${targetUserId}`);
    
  } catch (error) {
    console.error('Error sending typing indicator:', error);
  }
};

// ===============================================
// 🎉 SOCIAL ACHIEVEMENTS SYSTEM
// ===============================================

/**
 * Sprawdź i odblokuj osiągnięcia społecznościowe
 */
export const checkSocialAchievements = async (userId: string): Promise<Array<{
  id: string;
  name: string;
  description: string;
  unlockedAt: number;
  type: 'social';
}>> => {
  try {
    // TODO: Implement social achievements
    // Examples:
    // - First follower
    // - 100 followers
    // - First friend
    // - 50 friends
    // - Social butterfly (high engagement)
    // - Influencer (many followers)
    
    return [];

  } catch (error) {
    console.error('Error checking social achievements:', error);
    return [];
  }
};