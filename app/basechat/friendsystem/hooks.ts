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
  /**
   * Nazwy sekcji, ktorych NIE UDALO SIE odczytac ('followers', 'following',
   * 'friends', 'notifications', 'followStats', 'friendsStats',
   * 'notificationsSummary').
   *
   * Widok musi to odroznic od pustki: pusta lista obserwujacych znaczy "nikt
   * cie nie obserwuje", a to zdanie o czlowieku, nie o naszym zapytaniu.
   */
  failedSections: string[];
  /** `null` = liczby NIE ODCZYTANO. Zero znaczy "nic nowego" i jest inna informacja. */
  unreadCount: number | null;
  
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
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [failedSections, setFailedSections] = useState<string[]>([]);

  // Refs to prevent stale closures
  const socialAPIRef = useRef<SocialAPI | null>(null);
  const subscriptionManagerRef = useRef<SocialSubscriptionManager | null>(null);
  // Numer biezacego wczytania. Odpowiedz ze starego adresu (albo po odmontowaniu)
  // nie moze juz nic wpisac do stanu.
  const loadTokenRef = useRef(0);

  useEffect(() => {
    return () => { loadTokenRef.current += 1; };
  }, []);

  // ===============================================
  // 🚀 INITIALIZATION
  // ===============================================

  useEffect(() => {
    const token = ++loadTokenRef.current;

    if (!currentUserAddress) {
      setSocialAPI(null);
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
        socialAPIRef.current = api;
        subscriptionManagerRef.current = subManager;

        // Subscribe to real-time notifications
        await subManager.subscribeToNotifications(
          currentUserAddress,
          handleNewNotification,
          ['FOLLOW', 'FRIEND_REQUEST', 'FRIEND_REQUEST_ACCEPTED', 'LIKE', 'COMMENT', 'TIP_RECEIVED']
        );

        // Load initial data
        await loadAllData(api, token);

      } catch (err) {
        if (loadTokenRef.current !== token) return;
        console.error('Error initializing social features:', err);
        setError("Social features couldn't be loaded.");
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

  /**
   * KAZDY ODCZYT NIESIE WLASNA AWARIE.
   *
   * Wczesniej stalo tu jedno `Promise.all` w jednym `try`: padniecie
   * ktoregokolwiek z siedmiu zapytan kasowalo WSZYSTKIE - lista obserwujacych
   * znikala, bo nie udalo sie policzyc powiadomien. Teraz kazde zapytanie ma
   * wlasny `catch`: liczniki, ktorych nie odczytano, sa `null` (czyli "nie
   * wiem", a nie "zero"), a nazwy padnietych sekcji ida do `failedSections`,
   * zeby widok napisal o nich prawde zamiast pokazac pustke. Ten sam podzial
   * na osobne awarie co w getAskUserStats.
   */
  const loadAllData = async (api: SocialAPI, token = loadTokenRef.current) => {
    const failed: string[] = [];
    const attempt = async <T,>(label: string, run: () => Promise<T>): Promise<T | null> => {
      try {
        return await run();
      } catch (err) {
        console.error(`Error loading social data (${label}):`, err);
        failed.push(label);
        return null;
      }
    };

    const [
      followersData,
      followingData,
      friendsData,
      notificationsData,
      followStatsData,
      friendsStatsData,
      notificationsSummaryData
    ] = await Promise.all([
      attempt('followers', () => api.getFollowers(50)),
      attempt('following', () => api.getFollowing(50)),
      attempt('friends', () => api.getFriends(50)),
      attempt('notifications', () => api.getNotifications(20)),
      attempt('followStats', () => api.getFollowStats()),
      attempt('friendsStats', () => api.getFriendsStats()),
      attempt('notificationsSummary', () => api.getNotificationsSummary())
    ]);

    if (loadTokenRef.current !== token) return;

    // Listy, ktorych nie udalo sie odczytac, zostaja przy poprzedniej
    // zawartosci - nadpisanie ich pusta tablica bylo tym samym klamstwem
    // ("nikogo nie obserwujesz") co zero w liczniku.
    if (followersData) setFollowers(followersData);
    if (followingData) setFollowing(followingData);
    if (friendsData) setFriends(friendsData);
    if (notificationsData) setNotifications(notificationsData);

    setFollowStats(followStatsData);
    setFriendsStats(friendsStatsData);
    setNotificationsSummary(notificationsSummaryData);
    setUnreadCount(notificationsSummaryData ? notificationsSummaryData.unread : null);

    // Awaria czesciowa NIE gasi calego panelu: sekcje, ktore przyszly, zostaja
    // na ekranie, a te, ktore padly, powiedza to same przez `failedSections`.
    setFailedSections(failed);
    setLoading(false);
  };

  // ===============================================
  // 🔔 NOTIFICATION HANDLING
  // ===============================================

  const handleNewNotification = useCallback((notification: Notification) => {
    setNotifications(prev => [notification, ...prev.slice(0, 19)]);
    // Przyszlo nowe powiadomienie. Gdy licznika nie udalo sie odczytac, nie
    // udajemy, ze znamy sume - zostaje `null`.
    setUnreadCount(prev => (prev === null ? null : prev + 1));
    
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
        setUnreadCount(prev => (prev === null ? null : Math.max(0, prev - 1)));
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
    failedSections,
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

export interface UseNotificationsOptions {
  /**
   * Dzwonek w globalnej nawigacji montuje sie na KAZDEJ trasie, a na start
   * potrzebuje wylacznie licznika nieprzeczytanych (1 tani odczyt licznika
   * z dokumentu usera). Pelna lista to 20 pelnych dokumentow subkolekcji -
   * pobierana bezwarunkowo na mount kosztowala ~21 odczytow za sama kropke,
   * na kazde wejscie na kazda strone. Z lazyList mount czyta tylko licznik,
   * a lista dociera dopiero po jawnym loadNotificationsList().
   */
  lazyList?: boolean;
}

export interface UseNotificationsResult {
  notifications: Notification[];
  /** `null` = liczby NIE ODCZYTANO. Zero znaczy "nic nowego". */
  unreadCount: number | null;
  loading: boolean;
  /** Doczytywanie listy na zadanie (tryb lazyList) - osobno od `loading`,
   *  zeby kropka z licznikiem nie migala spinnerem, gdy dogrywa sie lista. */
  listLoading: boolean;
  error: string | null;
  markAsRead: (notificationId: string) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
  deleteNotification: (notificationId: string) => Promise<boolean>;
  /**
   * Doczytuje liste, gdy user naprawde chce ja zobaczyc (np. otwarcie
   * dropdownu). Wynik siedzi w stanie hooka jako cache sesyjny - ponowne
   * wywolanie nie czyta bazy drugi raz. Wymuszone odswiezenie to
   * refreshNotifications().
   */
  loadNotificationsList: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

/**
 * Hook do zarządzania powiadomieniami
 */
export const useNotifications = (
  userAddress: string | null,
  options?: UseNotificationsOptions
): UseNotificationsResult => {
  // Prymityw zamiast obiektu opcji w zaleznosciach efektu - konsumenci
  // podaja opcje inline, wiec obiekt jest nowy co render i restartowalby
  // efekt (czyli i odczyty) przy kazdym przerysowaniu.
  const lazyList = options?.lazyList ?? false;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  // `null` = nie odczytano. Zero to twierdzenie "nic nowego" i nie wolno go
  // wpisac po padnietym zapytaniu.
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socialAPIRef = useRef<SocialAPI | null>(null);
  // Czy lista TEGO uzytkownika juz jest w stanie. Ref, nie stan - to czysty
  // strażnik przed powtornym odczytem 20 dokumentow, nic nie renderuje.
  const listLoadedRef = useRef(false);

  useEffect(() => {
    if (!userAddress) {
      setNotifications([]);
      // Bez zalogowanego adresu naprawde nie ma zadnych powiadomien.
      setUnreadCount(0);
      setLoading(false);
      socialAPIRef.current = null;
      listLoadedRef.current = false;
      return;
    }

    const api = createSocialAPI(userAddress);
    socialAPIRef.current = api;
    // Nowy adres = cache listy poprzedniego uzytkownika przestaje byc prawda.
    listLoadedRef.current = false;

    // Po zmianie adresu (albo odmontowaniu) stara odpowiedz nie moze nadpisac stanu.
    let cancelled = false;

    const loadNotifications = async () => {
      try {
        setLoading(true);
        setError(null);

        if (lazyList) {
          // Lista poprzedniego uzytkownika nie moze wisiec w stanie do czasu,
          // az ktos zawola loadNotificationsList().
          setNotifications([]);
          const unreadCountData = await api.getUnreadNotificationsCount();
          if (cancelled) return;
          setUnreadCount(unreadCountData);
        } else {
          const [notificationsData, unreadCountData] = await Promise.all([
            api.getNotifications(20),
            api.getUnreadNotificationsCount()
          ]);
          if (cancelled) return;

          setNotifications(notificationsData);
          setUnreadCount(unreadCountData);
          listLoadedRef.current = true;
        }
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading notifications:', err);
        setError("Notifications couldn't be loaded.");
        setLoading(false);
      }
    };

    loadNotifications();

    return () => { cancelled = true; };
  }, [userAddress, lazyList]);

  const markAsRead = useCallback(async (notificationId: string): Promise<boolean> => {
    if (!socialAPIRef.current) return false;

    try {
      const success = await socialAPIRef.current.markNotificationAsRead(notificationId);
      if (success) {
        setNotifications(prev => prev.map(n => 
          n.id === notificationId ? { ...n, isRead: true } : n
        ));
        setUnreadCount(prev => (prev === null ? null : Math.max(0, prev - 1)));
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
          setUnreadCount(prev => (prev === null ? null : Math.max(0, prev - 1)));
        }
      }
      return success;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  }, [notifications]);

  const loadNotificationsList = useCallback(async (): Promise<void> => {
    const api = socialAPIRef.current;
    if (!api) return;
    // Cache sesyjny: drugie otwarcie dropdownu nie placi drugi raz za 20
    // dokumentow. Kto chce swiezej listy, wola refreshNotifications().
    if (listLoadedRef.current) return;

    try {
      setListLoading(true);
      const notificationsData = await api.getNotifications(20);
      // Jesli w trakcie pobierania zmienil sie adres, ta odpowiedz nalezy do
      // starego uzytkownika i nie wolno jej wpisac w stan nowego.
      if (socialAPIRef.current !== api) return;

      setNotifications(notificationsData);
      listLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading notifications list:', error);
      setError("Notifications couldn't be loaded.");
    } finally {
      setListLoading(false);
    }
  }, []);

  const refreshNotifications = useCallback(async (): Promise<void> => {
    if (!socialAPIRef.current) return;

    try {
      const [notificationsData, unreadCountData] = await Promise.all([
        socialAPIRef.current.getNotifications(20),
        socialAPIRef.current.getUnreadNotificationsCount()
      ]);

      setNotifications(notificationsData);
      setUnreadCount(unreadCountData);
      // Swiezo pobrana lista jest w stanie, wiec lazy-loader nie musi
      // czytac jej jeszcze raz.
      listLoadedRef.current = true;
    } catch (error) {
      console.error('Error refreshing notifications:', error);
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    listLoading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    loadNotificationsList,
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

    // Odpowiedz dla poprzedniej pary adresow nie moze wygrac z biezaca.
    let cancelled = false;

    const loadRelationship = async () => {
      try {
        setLoading(true);
        setError(null);

        const relationshipData = await api.getRelationshipWith(targetUserAddress);
        if (cancelled) return;
        setRelationship(relationshipData);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading relationship:', err);
        setError('Błąd wczytywania relacji');
        setLoading(false);
      }
    };

    loadRelationship();

    return () => { cancelled = true; };
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
    if (!currentUserAddress) return new Set();

    // Same ID z subkolekcji - jedno zapytanie. getFollowing() doczytywalby
    // jeszcze profile kazdego obserwowanego, czego tu w ogole nie potrzebujemy.
    const { fetchFollowingIdSet } = await import('../../utils/friends/follows');
    const ids = await fetchFollowingIdSet(currentUserAddress);
    const set = new Set(Array.from(ids).map(id => id.toLowerCase()));
    followingSetRef.current = set;
    return set;
  }, [currentUserAddress]);

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
