# 🚀 Social System Implementation Documentation 

## Overview / Przegląd
Complete social features system implementation for BaseChat including follows, friends, and notifications functionality.

**Created Files / Utworzone pliki:**
- `/app/utils/friends/` - Core Firebase functions (Główne funkcje Firebase)
- `/app/basechat/friendsystem/` - React components and hooks (Komponenty React i hooki)

---

## 📁 File Structure / Struktura plików

```
app/
├── utils/friends/              # 🔥 Core Firebase Functions (Główne funkcje Firebase)
│   ├── config.ts              # Firebase configuration (Konfiguracja Firebase)
│   ├── follows.ts             # Follow system (System obserwowania) 
│   ├── friends.ts             # Friends system (System znajomych)
│   ├── notifications.ts       # Notifications system (System powiadomień)
│   └── index.ts              # Main export file (Główny plik eksportu)
│
└── basechat/friendsystem/     # 🎯 React Components (Komponenty React)
    ├── config.ts             # Config re-export (Re-eksport konfiguracji)
    ├── SocialIntegration.tsx # Main UI component (Główny komponent UI)
    ├── hooks.ts             # React hooks (Hooki React)
    └── [existing files]    # Your original files (Twoje oryginalne pliki)
```

---

## 🔥 Core Firebase System / Główny system Firebase

### **config.ts** - Firebase Configuration
**Purpose / Cel:** Centralized Firebase setup and constants (Scentralizowana konfiguracja Firebase i stałe)

**Key Features / Główne funkcje:**
- Shared Firebase instance (Współdzielona instancja Firebase)
- Collection names constants (Stałe nazw kolekcji)
- Field mappings (Mapowanie pól)
- Social configuration limits (Limity konfiguracji społecznościowej)
- Utility functions (Funkcje pomocnicze)

**Collections Used / Używane kolekcje:**
```typescript
COLLECTIONS = {
  USERS: 'users',                    // Użytkownicy
  FOLLOWS: 'follows',                // Relacje obserwowania
  FRIENDSHIPS: 'friendships',        // Przyjaźnie
  FRIEND_REQUESTS: 'friendRequests', // Zaproszenia do znajomych
  // Subcollections:
  USER_FOLLOWERS: 'followers',       // users/{userId}/followers
  USER_FOLLOWING: 'following',       // users/{userId}/following
  USER_FRIENDS: 'friends',          // users/{userId}/friends
  USER_NOTIFICATIONS: 'notifications' // users/{userId}/notifications
}
```

### **follows.ts** - Follow System
**Purpose / Cel:** Complete user following functionality (Kompletna funkcjonalność obserwowania użytkowników)

**Main Functions / Główne funkcje:**
```typescript
// Core operations (Główne operacje)
followUser(followerId, followingId) → Promise<{success, error?}>
unfollowUser(followerId, followingId) → Promise<{success, error?}>
checkIfFollowing(followerId, followingId) → Promise<boolean>

// Data retrieval (Pobieranie danych)
getFollowers(userId, limit?) → Promise<UserWithFollowStatus[]>
getFollowing(userId, limit?) → Promise<UserWithFollowStatus[]>
getMutualFollows(userId, limit?) → Promise<UserWithFollowStatus[]>
getSuggestedUsers(userId, limit?) → Promise<UserWithFollowStatus[]>
getUserFollowStats(userId) → Promise<FollowStats>

// Utility (Narzędzia)
getFollowRelationship(user1, user2) → Promise<{user1FollowsUser2, user2FollowsUser1, isMutual}>
followMultipleUsers(followerId, userIds[]) → Promise<{successful[], failed[]}>
```

**Database Operations / Operacje bazodanowe:**
- Main collection: `follows` (Główna kolekcja)
- Subcollections for fast access: `users/{userId}/followers`, `users/{userId}/following`
- Automatic counter updates in user profiles (Automatyczne aktualizacje liczników w profilach)
- Real-time notifications (Powiadomienia w czasie rzeczywistym)

### **friends.ts** - Friends System  
**Purpose / Cel:** Friend requests and friendships management (Zarządzanie zaproszeniami i przyjaźniami)

**Main Functions / Główne funkcje:**
```typescript
// Friend requests (Zaproszenia do znajomych)
sendFriendRequest(senderId, receiverId, message?) → Promise<{success, error?, requestId?}>
acceptFriendRequest(requestId, userId) → Promise<{success, error?, friendshipId?}>
rejectFriendRequest(requestId, userId, reason?) → Promise<{success, error?}>

// Data retrieval (Pobieranie danych)
getReceivedFriendRequests(userId, limit?) → Promise<FriendRequest[]>
getSentFriendRequests(userId, limit?) → Promise<FriendRequest[]>
getFriendsList(userId, limit?) → Promise<FriendWithStatus[]>

// Relationship checks (Sprawdzanie relacji)
checkFriendship(user1Id, user2Id) → Promise<boolean>
getFriendshipStatus(user1Id, user2Id) → Promise<{areFriends, pendingRequest?, canSendRequest, relationship}>

// Management (Zarządzanie)
removeFriend(userId, friendId) → Promise<{success, error?}>
getFriendsStats(userId) → Promise<FriendsStats>
```

**Smart Features / Inteligentne funkcje:**
- Auto-accept when both users send requests (Auto-akceptacja gdy obaj wysyłają zaproszenia)
- Daily request limits (Dzienne limity zaproszeń)
- Request status tracking (Śledzenie statusu zaproszeń)
- Mutual friends detection (Wykrywanie wspólnych znajomych)

### **notifications.ts** - Notifications System
**Purpose / Cel:** Comprehensive notification system (Kompleksowy system powiadomień)

**Main Functions / Główne funkcje:**
```typescript
// Core operations (Główne operacje)
createNotification(notification) → Promise<string | null>
getUserNotifications(userId, limit?, onlyUnread?) → Promise<Notification[]>
markNotificationAsRead(userId, notificationId) → Promise<boolean>
markAllNotificationsAsRead(userId) → Promise<number>
deleteNotification(userId, notificationId) → Promise<boolean>

// Preferences (Preferencje)
getNotificationPreferences(userId) → Promise<NotificationPreferences>
updateNotificationPreferences(userId, preferences) → Promise<boolean>

// Specific creators (Specjalne kreatory)
notifyPostLiked(postId, postAuthorId, likedByUserId) → Promise<void>
notifyNewComment(postId, postAuthorId, commentAuthorId, content) → Promise<void>
notifyNewFollower(followingId, followerId) → Promise<void>
notifyFriendRequest(receiverId, senderId, requestId, message?) → Promise<void>
notifyTipReceived(recipientId, senderId, amount, token, postId?) → Promise<void>

// Batch operations (Operacje grupowe)
createBatchNotifications(notifications[]) → Promise<{successful, failed}>
```

**Advanced Features / Zaawansowane funkcje:**
- Real-time subscriptions (Subskrypcje w czasie rzeczywistym)
- Quiet hours support (Obsługa godzin ciszy)
- User preferences (Preferencje użytkownika)
- Notification types filtering (Filtrowanie typów powiadomień)
- Automatic cleanup (Automatyczne czyszczenie)

---

## 🎯 React Integration / Integracja React

### **SocialIntegration.tsx** - Main UI Component
**Purpose / Cel:** Complete social features UI for BaseChat (Kompletny UI funkcji społecznościowych dla BaseChat)

**Features / Funkcje:**
- Tabbed interface: Followers, Following, Friends, Notifications (Interfejs z zakładkami)
- Real-time updates (Aktualizacje w czasie rzeczywistym)
- Action buttons for each user (Przyciski akcji dla każdego użytkownika)
- Loading states and error handling (Stany ładowania i obsługa błędów)
- Responsive design (Responsywny design)

**Props:**
```typescript
interface SocialIntegrationProps {
  currentUserAddress: string;           // Adres aktualnego użytkownika
  onUserClick?: (userAddress: string) => void; // Callback przy kliknięciu użytkownika
  className?: string;                   // Dodatkowe klasy CSS
}
```

### **hooks.ts** - React Hooks
**Purpose / Cel:** Reusable React hooks for social features (Wielokrotnego użytku hooki React)

**Main Hooks / Główne hooki:**
```typescript
// Main social hook (Główny hook społecznościowy)
useSocial(currentUserAddress) → UseSocialResult
  // Returns: socialAPI, loading, error, followers, following, friends, notifications, stats, actions

// Notifications-focused hook (Hook skupiony na powiadomieniach)  
useNotifications(userAddress) → UseNotificationsResult
  // Returns: notifications, unreadCount, loading, error, actions

// Relationship hook (Hook relacji)
useRelationship(currentUserAddress, targetUserAddress) → UseRelationshipResult
  // Returns: relationship, loading, error, actions (follow, unfollow, friend requests)
```

---

## 🔄 Integration with Existing Firebase / Integracja z istniejącym Firebase

### **Compatibility / Kompatybilność:**
✅ **COMPATIBLE** - Uses same Firebase instance (Używa tej samej instancji Firebase)  
✅ **COMPATIBLE** - Extends existing user collection (Rozszerza istniejącą kolekcję użytkowników)  
✅ **COMPATIBLE** - Maintains existing notification structure (Zachowuje istniejącą strukturę powiadomień)

### **Compatibility Exports / Eksporty kompatybilności:**
```typescript
// From utils/friends/index.ts - Full compatibility (Z utils/friends/index.ts - Pełna kompatybilność):

// ✅ LEGACY FUNCTIONS (re-exported from your firebase.ts)
export { 
  addNotification as legacyAddNotification,           // Twoja funkcja addNotification
  fetchUnreadNotifications as legacyFetchUnreadNotifications, // Twoja funkcja fetchUnreadNotifications  
  markNotificationAsRead as legacyMarkNotificationAsRead      // Twoja funkcja markNotificationAsRead
} from '../firebase';

// 🆕 NEW ENHANCED FUNCTIONS (our new implementation)
export { 
  createNotification,                    // Rozszerzona wersja addNotification
  getUserNotifications,                  // Rozszerzona wersja fetchUnreadNotifications
  markNotificationAsRead,               // Rozszerzona wersja (z preferencjami)
  markAllNotificationsAsRead,           // NOWA: oznacz wszystkie jako przeczytane
  getNotificationPreferences,           // NOWA: preferencje powiadomień
  subscribeToNotifications              // NOWA: real-time subskrypcje
} from './notifications';

// 🚀 COMPLETELY NEW SYSTEMS
export { 
  followUser, unfollowUser, getFollowers, getFollowing,     // System obserwowania
  sendFriendRequest, acceptFriendRequest, getFriendsList,   // System znajomych
  SocialAPI, createSocialAPI, useSocial                     // Unified API i hooki
} from './index';
```

**Migration Path / Ścieżka migracji:**
- Keep using your existing functions (Zachowaj swoje istniejące funkcje) ✅
- Gradually adopt new enhanced functions (Stopniowo przejmuj nowe rozszerzone funkcje) 🔄  
- Use new social features alongside existing code (Używaj nowych funkcji społecznościowych obok istniejącego kodu) 🆕

### **User Profile Extensions / Rozszerzenia profilu użytkownika:**
Your existing user documents will be enhanced with (Twoje istniejące dokumenty użytkowników zostaną rozszerzone o):
```typescript
{
  // Existing fields... (Istniejące pola...)
  socialStats: {
    followers: number,      // Liczba obserwujących
    following: number,      // Liczba obserwowanych
    friends: number,        // Liczba znajomych
    mutualFollows: number   // Liczba wzajemnych obserwacji
  },
  unreadNotifications: number, // Liczba nieprzeczytanych powiadomień
  lastNotificationUpdate: timestamp,
  isOnline: boolean,           // Status online
  lastSeen: timestamp          // Ostatnio widziany
}
```

---

## 📊 Database Schema / Schemat bazy danych

### **New Collections / Nowe kolekcje:**
```typescript
// follows collection (Kolekcja obserwacji)
follows: {
  followerId: string,    // Kto obserwuje
  followingId: string,   // Kogo obserwuje
  createdAt: timestamp
}

// friendships collection (Kolekcja przyjaźni)
friendships: {
  user1Id: string,       // Pierwszy użytkownik
  user2Id: string,       // Drugi użytkownik
  createdAt: timestamp
}

// friendRequests collection (Kolekcja zaproszeń)
friendRequests: {
  senderId: string,      // Nadawca zaproszenia
  receiverId: string,    // Odbiorca zaproszenia
  status: 'pending' | 'accepted' | 'rejected',
  sentAt: timestamp,
  message?: string
}
```

### **Subcollections / Podkolekcje:**
```typescript
users/{userId}/followers/{followerId}     // Szybki dostęp do obserwujących
users/{userId}/following/{followingId}    // Szybki dostęp do obserwowanych
users/{userId}/friends/{friendId}         // Szybki dostęp do znajomych  
users/{userId}/notifications/{notificationId} // Powiadomienia użytkownika
users/{userId}/settings/notifications    // Preferencje powiadomień
```

---

## 🚀 Usage Examples / Przykłady użycia

### **Basic Usage in BaseChat / Podstawowe użycie w BaseChat:**
```tsx
import { SocialIntegration } from './friendsystem/SocialIntegration';
import { useSocial } from './friendsystem/hooks';

function BaseChat() {
  const [userAddress, setUserAddress] = useState('0x123...');
  const [showSocial, setShowSocial] = useState(false);
  
  // Option 1: Use the complete UI component (Opcja 1: Użyj kompletnego komponentu UI)
  return (
    <div>
      <button onClick={() => setShowSocial(!showSocial)}>
        👥 Social Features
      </button>
      
      {showSocial && (
        <SocialIntegration
          currentUserAddress={userAddress}
          onUserClick={(address) => console.log('View profile:', address)}
        />
      )}
    </div>
  );
}
```

### **Using Hooks for Custom UI / Używanie hooków do własnego UI:**
```tsx
import { useSocial, useNotifications } from './friendsystem/hooks';

function CustomSocialUI() {
  const userAddress = '0x123...';
  const { 
    followers, 
    followUser, 
    unreadCount,
    loading 
  } = useSocial(userAddress);
  
  if (loading) return <div>Loading... (Ładowanie...)</div>;
  
  return (
    <div>
      <h3>Followers ({followers.length})</h3>
      {unreadCount > 0 && (
        <span className="notification-badge">{unreadCount}</span>
      )}
      
      {followers.map(user => (
        <div key={user.address}>
          {user.name}
          {!user.isFollowing && (
            <button onClick={() => followUser(user.address)}>
              Follow (Obserwuj)
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

### **Direct API Usage / Bezpośrednie użycie API:**
```tsx
import { createSocialAPI } from '@/utils/friends';

async function directAPIExample() {
  const social = createSocialAPI('0x123...');
  
  // Follow someone (Obserwuj kogoś)
  const result = await social.follow('0x456...');
  console.log(result.success ? 'Followed!' : result.error);
  
  // Send friend request (Wyślij zaproszenie do znajomych)
  await social.sendFriendRequest('0x789...', 'Hello! (Cześć!)');
  
  // Get notifications (Pobierz powiadomienia)
  const notifications = await social.getNotifications();
  console.log(`${notifications.length} notifications`);
}
```

---

## 🔧 Next Steps / Następne kroki

**Ready for integration! / Gotowe do integracji!**

1. **Import the SocialIntegration component in your BaseChat (Zaimportuj komponent SocialIntegration w swoim BaseChat)**
2. **Add social features button to your UI (Dodaj przycisk funkcji społecznościowych do UI)**  
3. **Configure Firebase indexes if needed (Skonfiguruj indeksy Firebase jeśli potrzeba)**
4. **Test the functionality (Przetestuj funkcjonalność)**
5. **Customize styling to match your app (Dostosuj stylizację do swojej aplikacji)**

**Tell me how you want to integrate this with BaseChat and I'll help you implement it! (Powiedz mi jak chcesz to zintegrować z BaseChat, a pomogę Ci to zaimplementować!)**