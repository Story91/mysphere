// ===============================================
// 🎣 SOCIAL HOOKS - React hooks dla systemu społecznościowego
// ===============================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createSocialAPI,
  SocialAPI,
  UserWithFollowStatus,
  FriendWithStatus,
  Notification,
  NotificationSummary,
  FollowStats,
  FriendsStats,
  createSubscriptionManager,
  SocialSubscriptionManager
} from '../../utils/friends';

// ===============================================
// 🎯 MAIN SOCIAL HOOK
// ===============================================

export interface UseSocialResult {
  // API instance
  socialAPI: SocialAPI | null;
  
  // Loading states
  loading: boolean;
  error: string | null;
  
  // Social data
  followers: UserWithFollowStatus[];
  following: UserWithFollowStatus[];
  friends: FriendWithStatus[];
  notifications: Notification[];
  
  // Stats
  followStats: FollowStats | null;
  friendsStats: FriendsStats | null;
  notificationsSummary: NotificationSummary | null;
  unreadCount: number;
  
  // Actions
  followUser: (targetUserId: string) => Promise<boolean>;
  unfollowUser: (targetUserId: string) => Promise<boolean>;
  sendFriendRequest: (targetUserId: string, message?: string) => Promise<boolean>;
  acceptFriendRequest: (requestId: string) => Promise<boolean>;
  rejectFriendRequest: (requestId: string) => Promise<boolean>;
  markNotificationAsRead: (notificationId: string) => Promise<boolean>;
  markAllNotificationsAsRead: () => Promise<boolean>;
  
  // Utility
  checkIfFollowing: (targetUserId: string) => Promise<boolean>;
  getRelationshipWith: (targetUserId: string) => Promise<any>;
  refreshData: () => Promise<void>;
}

/**
 * Główny hook do zarządzania funkcjami społecznościowymi
 */
export const useSocial = (currentUserAddress: string | null): UseSocialResult => {
  const [socialAPI, setSocialAPI] = useState<SocialAPI | null>(null);
  const [subscriptionManager, setSubscriptionManager] = useState<SocialSubscriptionManager | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Social data
  const [followers, setFollowers] = useState<UserWithFollowStatus[]>([]);
  const [following, setFollowing] = useState<UserWithFollowStatus[]>([]);
  const [friends, setFriends] = useState<FriendWithStatus[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // Stats
  const [followStats, setFollowStats] = useState<FollowStats | null>(null);
  const [friendsStats, setFriendsStats] = useState<FriendsStats | null>(null);
  const [notificationsSummary, setNotificationsSummary] = useState<NotificationSummary | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs to prevent stale closures
  const socialAPIRef = useRef<SocialAPI | null>(null);
  const subscriptionManagerRef = useRef<SocialSubscriptionManager | null>(null);

  // ===============================================
  // 🚀 INITIALIZATION
  // ===============================================

  useEffect(() => {
    if (!currentUserAddress) {
      setSocialAPI(null);
      setSubscriptionManager(null);
      socialAPIRef.current = null;
      subscriptionManagerRef.current = null;
      setLoading(false);
      return;
    }

    const initializeSocial = async () => {
      try {
        setLoading(true);
        setError(null);

        // Initialize API and subscription manager
        const api = createSocialAPI(currentUserAddress);
        const subManager = createSubscriptionManager();
        
        setSocialAPI(api);
        setSubscriptionManager(subManager);
        socialAPIRef.current = api;
        subscriptionManagerRef.current = subManager;

        // Subscribe to real-time notifications
        await subManager.subscribeToNotifications(
          currentUserAddress,
          handleNewNotification,
          ['FOLLOW', 'FRIEND_REQUEST', 'FRIEND_REQUEST_ACCEPTED', 'LIKE', 'COMMENT', 'TIP_RECEIVED']
        );

        // Load initial data
        await loadAllData(api);

      } catch (err) {
        console.error('Error initializing social features:', err);
        setError('Błąd inicjalizacji funkcji społecznościowych');
        setLoading(false);
      }
    };

    initializeSocial();

    // Cleanup on unmount or user change
    return () => {
      subscriptionManagerRef.current?.unsubscribeAll();
    };
  }, [currentUserAddress]);

  // ===============================================
  // 📊 DATA LOADING
  // ===============================================

  const loadAllData = async (api: SocialAPI) => {
    try {
      const [
        followersData,
        followingData,
        friendsData,
        notificationsData,
        followStatsData,
        friendsStatsData,
        notificationsSummaryData
      ] = await Promise.all([
        api.getFollowers(50),
        api.getFollowing(50),
        api.getFriends(50),
        api.getNotifications(20),
        api.getFollowStats(),
        api.getFriendsStats(),
        api.getNotificationsSummary()
      ]);

      setFollowers(followersData);
      setFollowing(followingData);
      setFriends(friendsData);
      setNotifications(notificationsData);
      setFollowStats(followStatsData);
      setFriendsStats(friendsStatsData);
      setNotificationsSummary(notificationsSummaryData);
      setUnreadCount(notificationsSummaryData.unread);
      
      setLoading(false);
    } catch (err) {
      console.error('Error loading social data:', err);
      setError('Błąd wczytywania danych społecznościowych');
      setLoading(false);
    }
  };

  // ===============================================
  // 🔔 NOTIFICATION HANDLING
  // ===============================================

  const handleNewNotification = useCallback((notification: Notification) => {
    setNotifications(prev => [notification, ...prev.slice(0, 19)]);
    setUnreadCount(prev => prev + 1);
    
    // Update notifications summary
    setNotificationsSummary(prev => prev ? {
      ...prev,
      unread: prev.unread + 1,
      total: prev.total + 1,
      recent: [notification, ...prev.recent.slice(0, 4)]
    } : null);
  }, []);

  // ===============================================
  // 🎯 ACTION HANDLERS
  // ===============================================

  const followUser = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      const result = await socialAPIRef.current.follow(targetUserId);
      if (result.success) {
        await refreshData();
        return true;
      } else {
        console.error('Follow error:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Error following user:', error);
      return false;
    }
  }, []);

  const unfollowUser = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      const result = await socialAPIRef.current.unfollow(targetUserId);
      if (result.success) {
        await refreshData();
        return true;
      } else {
        console.error('Unfollow error:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Error unfollowing user:', error);
      return false;
    }
  }, []);

  const sendFriendRequest = useCallback(async (targetUserId: string, message?: string): Promise<boolean> => {
    if (!socialAPIRef.current) return false;



    try {
      const result = await socialAPIRef.current.sendFriendRequest(targetUserId, message);
      if (result.success) {
        await refreshData();
        return true;
      } else {
        console.error('Send friend request error:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      return false;
    }
  }, []);

  const acceptFriendRequest = useCallback(async (requestId: string): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      const result = await socialAPIRef.current.acceptFriendRequest(requestId);
      if (result.success) {
        await refreshData();
        return true;
      } else {
        console.error('Accept friend request error:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
      return false;
    }
  }, []);

  const rejectFriendRequest = useCallback(async (requestId: string): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      const result = await socialAPIRef.current.rejectFriendRequest(requestId);
      if (result.success) {
        await refreshData();
        return true;
      } else {
        console.error('Reject friend request error:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      return false;
    }
  }, []);

  const markNotificationAsRead = useCallback(async (notificationId: string): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      const success = await socialAPIRef.current.markNotificationAsRead(notificationId);
      if (success) {
        setNotifications(prev => prev.map(n => 
          n.id === notificationId ? { ...n, isRead: true } : n
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  }, []);

  const markAllNotificationsAsRead = useCallback(async (): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      const count = await socialAPIRef.current.markAllNotificationsAsRead();
      if (count > 0) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return false;
    }
  }, []);


// ===============================================
  // 🛠️ UTILITY FUNCTIONS
  // ===============================================

  const checkIfFollowing = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      return await socialAPIRef.current.checkIfFollowing(targetUserId);
    } catch (error) {
      console.error('Error checking follow status:', error);
      return false;
    }
  }, []);

  const getRelationshipWith = useCallback(async (targetUserId: string) => {
    if (!socialAPIRef.current) return null;

    try {
      return await socialAPIRef.current.getRelationshipWith(targetUserId);
    } catch (error) {
      console.error('Error getting relationship status:', error);
      return null;
    }
  }, []);

  const refreshData = useCallback(async (): Promise<void> => {
    if (!socialAPIRef.current) return;

    try {
      await loadAllData(socialAPIRef.current);
    } catch (error) {
      console.error('Error refreshing social data:', error);
    }
  }, []);

  return {
    socialAPI,
    loading,
    error,
    followers,
    following,
    friends,
    notifications,
    followStats,
    friendsStats,
    notificationsSummary,
    unreadCount,
    followUser,
    unfollowUser,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    checkIfFollowing,
    getRelationshipWith,
    refreshData
  };
};

// ===============================================
// 🔔 NOTIFICATIONS HOOK
// ===============================================

export interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (notificationId: string) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
  deleteNotification: (notificationId: string) => Promise<boolean>;
  refreshNotifications: () => Promise<void>;
}

/**
 * Hook do zarządzania powiadomieniami
 */
export const useNotifications = (userAddress: string | null): UseNotificationsResult => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const socialAPIRef = useRef<SocialAPI | null>(null);

  useEffect(() => {
    if (!userAddress) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      socialAPIRef.current = null;
      return;
    }

    const api = createSocialAPI(userAddress);
    socialAPIRef.current = api;

    const loadNotifications = async () => {
      try {
        setLoading(true);
        setError(null);

        const [notificationsData, unreadCountData] = await Promise.all([
          api.getNotifications(20),
          api.getUnreadNotificationsCount()
        ]);

        setNotifications(notificationsData);
        setUnreadCount(unreadCountData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading notifications:', err);
        setError('Błąd wczytywania powiadomień');
        setLoading(false);
      }
    };

    loadNotifications();
  }, [userAddress]);

  const markAsRead = useCallback(async (notificationId: string): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      const success = await socialAPIRef.current.markNotificationAsRead(notificationId);
      if (success) {
        setNotifications(prev => prev.map(n => 
          n.id === notificationId ? { ...n, isRead: true } : n
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      return success;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  }, []);

  const markAllAsRead = useCallback(async (): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      const count = await socialAPIRef.current.markAllNotificationsAsRead();
      if (count > 0) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
      return count > 0;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return false;
    }
  }, []);

  const deleteNotification = useCallback(async (notificationId: string): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      const success = await socialAPIRef.current.deleteNotification(notificationId);
      if (success) {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
        // Optionally decrease unread count if the notification was unread
        const wasUnread = notifications.find(n => n.id === notificationId && !n.isRead);
        if (wasUnread) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      }
      return success;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  }, [notifications]);

  const refreshNotifications = useCallback(async (): Promise<void> => {
    if (!socialAPIRef.current) return;

    try {
      const [notificationsData, unreadCountData] = await Promise.all([
        socialAPIRef.current.getNotifications(20),
        socialAPIRef.current.getUnreadNotificationsCount()
      ]);

      setNotifications(notificationsData);
      setUnreadCount(unreadCountData);
    } catch (error) {
      console.error('Error refreshing notifications:', error);
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications
  };
};

// ===============================================
// 👥 RELATIONSHIP HOOK
// ===============================================

export interface UseRelationshipResult {
  relationship: any | null;
  loading: boolean;
  error: string | null;
  follow: () => Promise<boolean>;
  unfollow: () => Promise<boolean>;
  sendFriendRequest: (message?: string) => Promise<boolean>;
  acceptFriendRequest: () => Promise<boolean>;
  rejectFriendRequest: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Hook do zarządzania relacją z konkretnym użytkownikiem
 */
export const useRelationship = (
  currentUserAddress: string | null,
  targetUserAddress: string | null
): UseRelationshipResult => {
  const [relationship, setRelationship] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const socialAPIRef = useRef<SocialAPI | null>(null);

  useEffect(() => {
    if (!currentUserAddress || !targetUserAddress) {
      setRelationship(null);
      setLoading(false);
      socialAPIRef.current = null;
      return;
    }

    const api = createSocialAPI(currentUserAddress);
    socialAPIRef.current = api;

    const loadRelationship = async () => {
      try {
        setLoading(true);
        setError(null);

        const relationshipData = await api.getRelationshipWith(targetUserAddress);
        setRelationship(relationshipData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading relationship:', err);
        setError('Błąd wczytywania relacji');
        setLoading(false);
      }
    };

    loadRelationship();
  }, [currentUserAddress, targetUserAddress]);

  const follow = useCallback(async (): Promise<boolean> => {
    if (!socialAPIRef.current || !targetUserAddress) return false;

    try {
      const result = await socialAPIRef.current.follow(targetUserAddress);
      if (result.success) {
        await refresh();
      }
      return result.success;
    } catch (error) {
      console.error('Error following user:', error);
      return false;
    }
  }, [targetUserAddress]);

  const unfollow = useCallback(async (): Promise<boolean> => {
    if (!socialAPIRef.current || !targetUserAddress) return false;

    try {
      const result = await socialAPIRef.current.unfollow(targetUserAddress);
      if (result.success) {
        await refresh();
      }
      return result.success;
    } catch (error) {
      console.error('Error unfollowing user:', error);
      return false;
    }
  }, [targetUserAddress]);

  const sendFriendRequest = useCallback(async (message?: string): Promise<boolean> => {
    if (!socialAPIRef.current || !targetUserAddress) return false;

    try {
      const result = await socialAPIRef.current.sendFriendRequest(targetUserAddress, message);
      if (result.success) {
        await refresh();
      }
      return result.success;
    } catch (error) {
      console.error('Error sending friend request:', error);
      return false;
    }
  }, [targetUserAddress]);

  const acceptFriendRequest = useCallback(async (): Promise<boolean> => {
    if (!socialAPIRef.current || !relationship?.friendship?.pendingRequest) return false;

    try {
      const result = await socialAPIRef.current.acceptFriendRequest(relationship.friendship.pendingRequest.id);
      if (result.success) {
        await refresh();
      }
      return result.success;
    } catch (error) {
      console.error('Error accepting friend request:', error);
      return false;
    }
  }, [relationship]);

  const rejectFriendRequest = useCallback(async (): Promise<boolean> => {
    if (!socialAPIRef.current || !relationship?.friendship?.pendingRequest) return false;

    try {
      const result = await socialAPIRef.current.rejectFriendRequest(relationship.friendship.pendingRequest.id);
      if (result.success) {
        await refresh();
      }
      return result.success;
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      return false;
    }
  }, [relationship]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!socialAPIRef.current || !targetUserAddress) return;

    try {
      const relationshipData = await socialAPIRef.current.getRelationshipWith(targetUserAddress);
      setRelationship(relationshipData);
    } catch (error) {
      console.error('Error refreshing relationship:', error);
    }
  }, [targetUserAddress]);

  return {
    relationship,
    loading,
    error,
    follow,
    unfollow,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    refresh
  };
};

// ===============================================
// 🪶 LIGHTWEIGHT ACTIONS HOOK
// ===============================================

export interface UseSocialActionsResult {
  followUser: (targetUserId: string) => Promise<boolean>;
  unfollowUser: (targetUserId: string) => Promise<boolean>;
  /** Mapa {adres: czy obserwowany} dla podanej listy adresow - JEDNO zapytanie. */
  getFollowStatuses: (targetUserIds: string[]) => Promise<{ [address: string]: boolean }>;
}

/**
 * Lekki wariant useSocial dla konsumentow, ktorzy potrzebuja tylko akcji
 * follow/unfollow (np. feed). Pelny useSocial przy kazdym mouncie odpala 7
 * rownoleglych loaderow (~150 odczytow Firestore) i byl montowany 2-3x naraz.
 */
export const useSocialActions = (currentUserAddress: string | null): UseSocialActionsResult => {
  const apiRef = useRef<SocialAPI | null>(null);
  const followingSetRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    apiRef.current = currentUserAddress ? createSocialAPI(currentUserAddress) : null;
    followingSetRef.current = null;
  }, [currentUserAddress]);

  const loadFollowingSet = useCallback(async (): Promise<Set<string>> => {
    if (followingSetRef.current) return followingSetRef.current;
    const api = apiRef.current;
    if (!api) return new Set();
    const following = await api.getFollowing(200);
    const set = new Set(following.map(u => u.address.toLowerCase()));
    followingSetRef.current = set;
    return set;
  }, []);

  const getFollowStatuses = useCallback(async (targetUserIds: string[]) => {
    const set = await loadFollowingSet();
    const result: { [address: string]: boolean } = {};
    for (const id of targetUserIds) {
      if (!id) continue;
      result[id] = set.has(id.toLowerCase());
    }
    return result;
  }, [loadFollowingSet]);

  const followUser = useCallback(async (targetUserId: string) => {
    const api = apiRef.current;
    if (!api) return false;
    const res = await api.follow(targetUserId);
    const ok = typeof res === 'boolean' ? res : Boolean(res?.success);
    if (ok) followingSetRef.current?.add(targetUserId.toLowerCase());
    return ok;
  }, []);

  const unfollowUser = useCallback(async (targetUserId: string) => {
    const api = apiRef.current;
    if (!api) return false;
    const res = await api.unfollow(targetUserId);
    const ok = typeof res === 'boolean' ? res : Boolean(res?.success);
    if (ok) followingSetRef.current?.delete(targetUserId.toLowerCase());
    return ok;
  }, []);

  return { followUser, unfollowUser, getFollowStatuses };
};
