// ===============================================
// 🔧 FIREBASE CONFIG FOR SOCIAL FEATURES
// ===============================================

// Ta sama konfiguracja i ten sam projekt co app/utils/firebase.ts.
// Wczesniej byl tu drugi klient Firebase (`initializeApp(config, 'social-features')`),
// co oznaczalo dwa niezalezne kanaly do Firestore i podwojone polaczenia.
export { db } from '../firebase';

// Adres admina i sprawdzenie uprawnien - RE-EKSPORT, nie kopia.
//
// Wczesniej stala tu wlasna kopia adresu z komentarzem "kopiowane z glownego
// firebase.ts", czyli druga niezalezna definicja tego, kto jest adminem.
// Zmiana admina w jednym miejscu zostawilaby drugie przy starym wlascicielu.
// Ten plik i tak importuje juz `db` z firebase.ts, wiec re-eksport nie
// wprowadza zadnego nowego sprzezenia - usuwa tylko rozjazd.
export { ADMIN_ADDRESS, isUserAdmin } from '../firebase';

// ===============================================
// 📊 COLLECTIONS CONFIGURATION
// ===============================================

export const COLLECTIONS = {
  // Główne kolekcje
  USERS: 'users',
  POSTS: 'posts',
  
  // Social features collections
  FOLLOWS: 'follows',                    // Główna kolekcja follow relationships
  FRIENDSHIPS: 'friendships',           // Główna kolekcja przyjaźni
  FRIEND_REQUESTS: 'friendRequests',    // Zaproszenia do znajomych
  
  // Subcollections dla szybkiego dostępu
  USER_FOLLOWERS: 'followers',          // users/{userId}/followers
  USER_FOLLOWING: 'following',          // users/{userId}/following  
  USER_FRIENDS: 'friends',              // users/{userId}/friends
  USER_NOTIFICATIONS: 'notifications', // users/{userId}/notifications
  USER_SETTINGS: 'settings',           // users/{userId}/settings
} as const;

// ===============================================
// 🏷️ FIREBASE FIELD MAPPINGS
// ===============================================

export const FIELDS = {
  // User fields
  USER_ID: 'address',
  USER_NAME: 'name',
  USER_AVATAR: 'avatar',
  USER_BIO: 'bio',
  USER_JOINED: 'joinedAt',
  USER_LAST_ACTIVE: 'lastActive',
  USER_IS_ONLINE: 'isOnline',
  USER_LAST_SEEN: 'lastSeen',
  
  // Social stats fields  
  FOLLOWERS_COUNT: 'socialStats.followers',
  FOLLOWING_COUNT: 'socialStats.following',
  FRIENDS_COUNT: 'socialStats.friends',
  POSTS_COUNT: 'postsCount',
  LIKES_RECEIVED: 'likesReceived',
  UNREAD_NOTIFICATIONS: 'unreadNotifications',
  
  // Follow fields
  FOLLOWER_ID: 'followerId',
  FOLLOWING_ID: 'followingId',
  FOLLOWED_AT: 'followedAt',
  
  // Friend fields
  SENDER_ID: 'senderId', 
  RECEIVER_ID: 'receiverId',
  FRIEND_STATUS: 'status',
  SENT_AT: 'sentAt',
  RESPONDED_AT: 'respondedAt',
  
  // Notification fields
  NOTIFICATION_TYPE: 'type',
  FROM_USER_ID: 'fromUserId',
  IS_READ: 'isRead',
  CREATED_AT: 'createdAt',
  READ_AT: 'readAt',
  
  // Common fields
  TIMESTAMP: 'timestamp',
  SERVER_TIMESTAMP: 'createdAt'
} as const;

// ===============================================
// 🎯 SOCIAL FEATURES CONFIGURATION
// ===============================================

export const SOCIAL_CONFIG = {
  // Limits dla queries
  DEFAULT_LIMIT: 20,
  MAX_FOLLOWERS_FETCH: 1000,
  MAX_FRIENDS_FETCH: 500,
  MAX_NOTIFICATIONS_FETCH: 100,
  BATCH_SIZE: 10, // Firestore batch limit
  
  // Cache settings
  CACHE_TTL: 5 * 60 * 1000, // 5 minut
  USER_NAMES_CACHE_SIZE: 1000,
  
  // Rate limiting
  MAX_FOLLOW_REQUESTS_PER_HOUR: 50,
  MAX_FRIEND_REQUESTS_PER_DAY: 20,
  
  // Cleanup settings
  OLD_NOTIFICATIONS_DAYS: 30,
  OLD_FRIEND_REQUESTS_DAYS: 60,
  
  // Real-time features
  TYPING_INDICATOR_TIMEOUT: 3000, // 3 sekundy
  ONLINE_STATUS_TIMEOUT: 5 * 60 * 1000, // 5 minut
  
  // Quiet hours defaults
  DEFAULT_QUIET_START: "22:00",
  DEFAULT_QUIET_END: "08:00"
} as const;

// ===============================================
// 🔧 UTILITY FUNCTIONS
// ===============================================

/**
 * Generuj unikalny ID dla dokumentów
 */
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Format timestamp dla wyświetlania
 */
export const formatTimestamp = (timestamp: any): number => {
  if (!timestamp) return Date.now();
  if (timestamp.toMillis) return timestamp.toMillis();
  if (timestamp.seconds) return timestamp.seconds * 1000;
  return timestamp;
};

/**
 * Sprawdź czy string to valid Ethereum address
 */
export const isValidEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Skróć adres Ethereum dla wyświetlania
 */
export const truncateAddress = (address: string): string => {
  if (!isValidEthereumAddress(address)) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Validate user input dla bezpieczeństwa
 */
export const sanitizeInput = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};

/**
 * Check if two users are the same
 */
export const isSameUser = (user1: string, user2: string): boolean => {
  return user1.toLowerCase() === user2.toLowerCase();
};
