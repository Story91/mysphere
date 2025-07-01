import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  collection,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy as firestoreOrderBy,
  serverTimestamp,
  increment,
  Timestamp,
  arrayUnion,
  arrayRemove,
  limit as firestoreLimit,
  writeBatch,
  deleteField,
  deleteDoc,
  startAfter as firestoreStartAfter,
  QueryDocumentSnapshot,
  runTransaction
} from 'firebase/firestore';
import { getAuth, TwitterAuthProvider } from 'firebase/auth';
import { UserProfile, Post, Comment } from '../types';

// Stała z adresem admina
export const ADMIN_ADDRESS = '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd'.toLowerCase();

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const twitterProvider = new TwitterAuthProvider();

const convertTimestamp = (timestamp: Timestamp): number => {
  return timestamp.toMillis();
};

// Funkcja sprawdzająca czy użytkownik ma BaseName i dodająca bonus
export const hasBaseName = async (userAddress: string): Promise<boolean> => {
  try {
    const usernameRef = doc(db, 'usernames', userAddress);
    const usernameDoc = await getDoc(usernameRef);
    
    if (usernameDoc.exists()) {
      const data = usernameDoc.data();
      const isBaseNameUser = data.isBaseName === true;
      
      // Jeśli użytkownik ma BaseName, dodaj bonus 1000 punktów
      if (isBaseNameUser) {
        await addBaseNameBonusToUser(userAddress);
      }
      
      return isBaseNameUser;
    }
    return false;
  } catch (error) {
    console.error('Error checking BaseName status:', error);
    return false;
  }
};

// Funkcja dodająca bonus BaseName dla użytkownika
const addBaseNameBonusToUser = async (userAddress: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userAddress);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      
      // Sprawdź, czy baseChatPoints jest stringiem (błąd)
      let baseChatPoints: any = userData.baseChatPoints;
      
      // Jeśli baseChatPoints jest stringiem lub nie istnieje, utwórz nowy obiekt
      if (typeof baseChatPoints === 'string' || !baseChatPoints) {
        baseChatPoints = {
          activityBonus: 0,
          likePoints: 0,
          postPoints: 0,
          totalPoints: 0
        };
      }
      
      // Upewnij się, że wszystkie pola są liczbami
      baseChatPoints.activityBonus = Number(baseChatPoints.activityBonus || 0);
      baseChatPoints.likePoints = Number(baseChatPoints.likePoints || 0);
      baseChatPoints.postPoints = Number(baseChatPoints.postPoints || 0);
      
      // Dodaj baseNameBonus jako liczbę
      baseChatPoints.baseNameBonus = 1000;
      
      // Przelicz totalPoints jako sumę wszystkich składników
      baseChatPoints.totalPoints = 
        baseChatPoints.activityBonus + 
        baseChatPoints.likePoints + 
        baseChatPoints.postPoints + 
        baseChatPoints.baseNameBonus;
      
      // Zaktualizuj dokument użytkownika
      await updateDoc(userRef, {
        baseChatPoints: baseChatPoints,
        lastUpdated: serverTimestamp()
      });
      
      console.log(`Dodano baseNameBonus dla użytkownika ${userAddress}`);
    }
  } catch (error) {
    console.error('Error adding BaseName bonus:', error);
  }
};

// Funkcja dodająca bonus 500 punktów za .camper
const addCamperBonusToUser = async (userAddress: string): Promise<void> => {
  try {
    console.log(`🏕️ [addCamperBonusToUser] Rozpoczynam dodawanie bonusu dla ${userAddress}`);
    const userRef = doc(db, 'users', userAddress);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      
      // Sprawdź, czy baseChatPoints jest stringiem (błąd)
      let baseChatPoints: any = userData.baseChatPoints;
      
      // Jeśli baseChatPoints jest stringiem lub nie istnieje, utwórz nowy obiekt
      if (typeof baseChatPoints === 'string' || !baseChatPoints) {
        baseChatPoints = {
          activityBonus: 0,
          likePoints: 0,
          postPoints: 0,
          totalPoints: 0
        };
      }
      
      // Upewnij się, że wszystkie pola są liczbami
      baseChatPoints.activityBonus = Number(baseChatPoints.activityBonus || 0);
      baseChatPoints.likePoints = Number(baseChatPoints.likePoints || 0);
      baseChatPoints.postPoints = Number(baseChatPoints.postPoints || 0);
      baseChatPoints.baseNameBonus = Number(baseChatPoints.baseNameBonus || 0);
      
      // Sprawdź czy użytkownik już ma camperBonus - jeśli tak, nie dodawaj ponownie
      if (baseChatPoints.camperBonus) {
        console.log(`Użytkownik ${userAddress} już ma camperBonus, pomijam dodawanie`);
        return;
      }
      
      // Dodaj camperBonus jako liczbę
      baseChatPoints.camperBonus = 500;
      
      // Przelicz totalPoints jako sumę wszystkich składników
      baseChatPoints.totalPoints = 
        baseChatPoints.activityBonus + 
        baseChatPoints.likePoints + 
        baseChatPoints.postPoints + 
        baseChatPoints.baseNameBonus + 
        baseChatPoints.camperBonus;
      
      // Zaktualizuj dokument użytkownika
      await updateDoc(userRef, {
        baseChatPoints: baseChatPoints,
        lastUpdated: serverTimestamp()
      });
      
      console.log(`🏕️ Dodano camperBonus (500 pts) dla użytkownika ${userAddress}! Nowe total: ${baseChatPoints.totalPoints}`);
    }
  } catch (error) {
    console.error('Error adding Camper bonus:', error);
  }
};

// Funkcja dodająca bonus BaseName dla wszystkich użytkowników z BaseName
export const addBaseNameBonusToAllUsers = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('Rozpoczynam dodawanie bonusu BaseName dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników z kolekcji usernames, którzy mają isBaseName: true
    const usernamesRef = collection(db, 'usernames');
    const baseNameQuery = query(usernamesRef, where('isBaseName', '==', true));
    const baseNameSnapshot = await getDocs(baseNameQuery);
    
    let updatedUsers = 0;
    
    // Przetwórz każdego użytkownika z BaseName
    for (const usernameDoc of baseNameSnapshot.docs) {
      const userAddress = usernameDoc.id;
      
      // Dodaj bonus BaseName dla użytkownika
      await addBaseNameBonusToUser(userAddress);
      updatedUsers++;
      
      // Loguj co 10 użytkowników
      if (updatedUsers % 10 === 0) {
        console.log(`Zaktualizowano ${updatedUsers} użytkowników...`);
      }
    }
    
    console.log(`Zakończono dodawanie bonusu BaseName:
    - Zaktualizowano ${updatedUsers} użytkowników`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas dodawania bonusu BaseName:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas dodawania bonusu BaseName'
    };
  }
};

// Zaawansowany system lajków
export const toggleLike = async (postId: string, userId: string): Promise<boolean> => {
  try {
    const postRef = doc(db, 'posts', postId);

    // Użyj transakcji zamiast batcha - jest szybsza i bardziej niezawodna
    return await runTransaction(db, async (transaction) => {
      const postDoc = await transaction.get(postRef);

      if (!postDoc.exists()) {
        throw new Error('Post nie istnieje');
      }

      const postData = postDoc.data();
      const likedBy = postData.likedBy || [];
      const isLiked = likedBy.includes(userId);
      
      // Aktualizuj post z inkrementacją/dekrementacją lajków
      transaction.update(postRef, {
        likes: increment(isLiked ? -1 : 1),
        likedBy: isLiked ? arrayRemove(userId) : arrayUnion(userId)
      });
      
      // Zaktualizuj profil autora tylko jeśli autor != lajkujący (optymalizacja)
      // Zrobimy to w osobnym wywołaniu, asynchronicznie, aby nie blokować transakcji
      if (postData.author !== userId) {
        // Zaktualizujemy autora poza transakcją, aby była ona szybsza
        setTimeout(async () => {
          try {
            const authorRef = doc(db, 'users', postData.author);
            await updateDoc(authorRef, {
              likesReceived: increment(isLiked ? -1 : 1),
              lastActive: serverTimestamp()
            });
          } catch (error) {
            console.error('Error updating author stats:', error);
          }
        }, 10);
      }
      
      return !isLiked; // Zwróć true jeśli dodano lajka, false jeśli usunięto
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    throw error;
  }
};

// Funkcja do przeliczania lajków użytkownika
export const recalculateUserLikes = async (userId: string) => {
  try {
    console.log('Przeliczam lajki dla użytkownika:', userId);
    
    // Pobierz wszystkie posty użytkownika
    const postsRef = collection(db, 'posts');
    const postsQuery = query(postsRef, where('author', '==', userId));
    const postsSnapshot = await getDocs(postsQuery);
    
    let totalLikes = 0;
    
    // Zlicz wszystkie lajki z postów
    postsSnapshot.forEach((doc) => {
      const postData = doc.data();
      totalLikes += postData.likes || 0;
    });
    
    // Aktualizuj profil użytkownika
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      likesReceived: totalLikes,
      lastCalculated: serverTimestamp()
    });
    
    console.log('Zaktualizowano licznik lajków:', totalLikes);
    return totalLikes;
  } catch (error) {
    console.error('Błąd podczas przeliczania lajków:', error);
    throw error;
  }
};

// Funkcja do usuwania lajków posta
export const deletePostLikes = async (postId: string) => {
  try {
    console.log('Usuwam lajki dla posta:', postId);
    
    // Pobierz wszystkie lajki dla danego posta
    const likesRef = collection(db, 'likes');
    const likesQuery = query(likesRef, where('postId', '==', postId));
    const likesSnapshot = await getDocs(likesQuery);
    
    // Użyj batcha do usunięcia wszystkich lajków
    const batch = writeBatch(db);
    likesSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log('Usunięto lajki:', likesSnapshot.size);
    
    // Pobierz autora posta
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    
    if (postDoc.exists()) {
      const authorId = postDoc.data().author;
      // Przelicz lajki dla autora
      await recalculateUserLikes(authorId);
    }
  } catch (error) {
    console.error('Błąd podczas usuwania lajków:', error);
    throw error;
  }
};

// Modyfikacja funkcji deletePost aby używała nowego systemu lajków
export const deletePost = async (postId: string, authorAddress: string) => {
  try {
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const postData = postSnap.data();
    if (postData.author !== authorAddress) {
      throw new Error('Unauthorized to delete this post');
    }

    // Prepare batch for atomic operations
    const batch = writeBatch(db);

    // Odejmij lajki od autora
    const authorRef = doc(db, 'users', authorAddress);
    batch.update(authorRef, {
      likesReceived: increment(-(postData.likes || 0)),
      lastActive: serverTimestamp()
    });

    // Delete post comments
    const commentsRef = collection(db, 'comments');
    const commentsQuery = query(commentsRef, where('postId', '==', postId));
    const commentsSnap = await getDocs(commentsQuery);
    commentsSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete the post
    batch.delete(postRef);

    // Execute all operations
    await batch.commit();

    return true;
  } catch (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
};

// System powiadomień
export const addNotification = async (userId: string, notification: {
  type: 'LIKE' | 'COMMENT' | 'MENTION' | 'FOLLOW';
  fromUser: string;
  postId?: string;
  commentId?: string;
  timestamp: number;
}): Promise<void> => {
  const notificationsRef = collection(db, `users/${userId}/notifications`);
  await addDoc(notificationsRef, {
    ...notification,
    read: false,
    timestamp: serverTimestamp()
  });
};

// Pobierz nieprzeczytane powiadomienia
export const fetchUnreadNotifications = async (userId: string) => {
  const notificationsRef = collection(db, `users/${userId}/notifications`);
  const q = query(
    notificationsRef,
    where('read', '==', false),
    firestoreOrderBy('timestamp', 'desc'),
    firestoreLimit(20)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    timestamp: convertTimestamp(doc.data().timestamp as Timestamp)
  }));
};

// Oznacz powiadomienie jako przeczytane
export const markNotificationAsRead = async (userId: string, notificationId: string): Promise<void> => {
  const notificationRef = doc(db, `users/${userId}/notifications/${notificationId}`);
  await updateDoc(notificationRef, {
    read: true
  });
};

// Utwórz nowy post z zaawansowanymi opcjami
export const createPost = async (post: { 
  author: string; 
  content: string; 
  timestamp: number;
  image?: string | null;
  video?: string | null;
  tags?: string[];
  mentions?: string[];
  visibility?: 'public' | 'followers' | 'private';
  txHash?: string; // Keep this as it now represents the Zora creation tx hash
  zoraCoinAddress?: string; // <-- ADDED
  network?: 'base' | 'basecamp'; // Add network parameter to identify the source network
}): Promise<string> => {
  try {
    const userRef = doc(db, 'users', post.author);
    const postsRef = collection(db, 'posts');
    
    // Utwórz nowy dokument posta
    const docRef = await addDoc(postsRef, {
      ...post,
      timestamp: serverTimestamp(), // Użyj serverTimestamp dla Firebase
      likes: 0,
      likedBy: [],
      comments: []
    });

    // Zaktualizuj statystyki użytkownika (liczbę postów)
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists()) {
        // Jeśli użytkownik nie istnieje, utwórz go
        transaction.set(userRef, { 
          address: post.author,
          postsCount: 1, 
          likesReceived: 0,
          joinedAt: serverTimestamp(),
          lastActive: serverTimestamp()
        });
      } else {
        // Jeśli użytkownik istnieje, zaktualizuj liczbę postów
        transaction.update(userRef, { 
          postsCount: increment(1),
          lastActive: serverTimestamp()
        });
      }
    });
    
    console.log("Post created with ID: ", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error creating post: ", error);
    throw error;
  }
};

// Interfejs dla parametrów funkcji fetchPosts
interface FetchPostsParams {
  userId?: string;
  limit?: number;
  startAfter?: QueryDocumentSnapshot | null;
  orderBy?: 'newest' | 'oldest';
  authorFilter?: string | null;
  tagFilter?: string | null;
  searchTerm?: string | null;
  networkFilter?: 'base' | 'basecamp' | null; // Add network filter parameter
}

// Interfejs zwracany przez funkcję fetchPosts
interface FetchPostsResult {
  posts: ExtendedPost[];
  lastVisible: QueryDocumentSnapshot | null;
}

// Funkcja do pobierania postów z Firestore
export const fetchPosts = async ({ 
  userId, 
  limit = 50,  // Zwiększam domyślny limit z 20 do 50 postów
  startAfter = null, 
  orderBy = 'newest',
  authorFilter = null,
  tagFilter = null,
  searchTerm = null,
  networkFilter = null // Default to null (no filtering)
}: FetchPostsParams = {}): Promise<FetchPostsResult> => {
  try {
    const postsCollection = collection(db, 'posts');
    const queryConstraints = [];
    
    // Sortowanie postów
    if (orderBy === 'newest') {
      queryConstraints.push(firestoreOrderBy('timestamp', 'desc'));
    } else {
      queryConstraints.push(firestoreOrderBy('timestamp', 'asc'));
    }
    
    // Filtrowanie postów
    if (authorFilter) {
      queryConstraints.push(where('author', '==', authorFilter));
    }
    
    if (tagFilter) {
      queryConstraints.push(where('tags', 'array-contains', tagFilter));
    }
    
    // Add network filter - only if specifically requested for filtered views
    // For normal feed, we want to show all posts regardless of network
    if (networkFilter) {
      queryConstraints.push(where('network', '==', networkFilter));
    }
    
    // Ograniczenie liczby postów
    queryConstraints.push(firestoreLimit(limit));
    
    // Paginacja - jeśli startAfter jest zdefiniowany
    if (startAfter) {
      queryConstraints.push(firestoreStartAfter(startAfter));
    }
    
    // Wykonaj zapytanie
    const postsQuery = query(postsCollection, ...queryConstraints);
    const postsSnapshot = await getDocs(postsQuery);
    
    // Pobierz dokumenty
    const posts: ExtendedPost[] = [];
    
    // Referencja do ostatniego dokumentu dla paginacji
    let lastVisible: QueryDocumentSnapshot | null = null;
    
    if (!postsSnapshot.empty) {
      lastVisible = postsSnapshot.docs[postsSnapshot.docs.length - 1];
      
      // Iteruj po dokumentach i twórz obiekty postów
      for (const postDoc of postsSnapshot.docs) {
        const postData = postDoc.data();
        const post: ExtendedPost = {
          id: postDoc.id,
          author: postData.author,
          content: postData.content,
          timestamp: postData.timestamp instanceof Timestamp 
            ? postData.timestamp.toMillis() 
            : (postData.timestamp || Date.now()),
          likes: postData.likes || 0,
          likedBy: postData.likedBy || [],
          comments: postData.comments || [], // Użyj już zapisanych komentarzy zamiast ponownego pobierania
          tags: postData.tags || [],
          mentions: postData.mentions || [],
          image: postData.image || null,
          video: postData.video || null,
          txHash: postData.txHash || null,
          lastEdited: postData.lastEdited || null,
          zoraCoinAddress: postData.zoraCoinAddress || null,
          network: postData.network || 'base', // Include network property and default to 'base' for backward compatibility
        };
        
        // Dodatkowe filtrowanie po stronie klienta dla wyszukiwania (jeśli potrzebne)
        if (searchTerm && typeof post.content === 'string' && 
            !post.content.toLowerCase().includes(searchTerm.toLowerCase())) {
          continue; // Pomiń post, jeśli nie zawiera szukanej frazy
        }
        
        // Remove this debugging log to reduce console output
        // console.log(`Post ${post.id} network: ${post.network}, content: ${post.content.substring(0, 20)}...`);
        
        posts.push(post);
      }
    }
    
    // Zwróć posty wraz z informacją o ostatnim widocznym dokumencie do paginacji
    return { 
      posts, 
      lastVisible 
    };
    
  } catch (error) {
    console.error('Error fetching posts:', error);
    throw error;
  }
};

// Funkcja do pobierania postów (wersja uproszczona)
export const fetchPostsSimple = async () => {
  try {
    const postsCollection = collection(db, 'posts');
    const q = query(
      postsCollection, 
      firestoreOrderBy('timestamp', 'desc'),
      firestoreLimit(20)
    );
    const postSnapshots = await getDocs(q);
    
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
};

// Zapisz profil użytkownika
export const saveUserProfile = async (profile: { 
  walletAddress: string; 
  name: string;
  avatar?: string;
}): Promise<void> => {
  const userRef = doc(db, 'users', profile.walletAddress);
  
  // Sprawdź czy profil już istnieje
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    // Aktualizuj istniejący profil
    await updateDoc(userRef, {
      ...profile,
      lastActive: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });
  } else {
    // Utwórz nowy profil
    await setDoc(userRef, {
      ...profile,
      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      postsCount: 0,
      likesReceived: 0,
      stats: {
        posts: 0,
        likes: 0,
        comments: 0
      }
    });
  }
};

// Dodaj komentarz do posta
export const addComment = async (postId: string, comment: {
  author: string;
  content: string;
  timestamp: number;
  likes: number;
  likedBy: string[];
  mentions: string[];
  txHash?: string | null;
}): Promise<void> => {
  // Pobierz nazwę autora komentarza
  const authorName = await getUserName(comment.author);
  
  // Dodaj komentarz do kolekcji comments
  const commentsRef = collection(db, 'comments');
  const commentDoc = await addDoc(commentsRef, {
    ...comment,
    authorName, // Dodaj nazwę autora do komentarza
    postId,
    timestamp: serverTimestamp(),
    likes: 0,
    likedBy: [],
    mentions: [],
    txHash: comment.txHash || null, // Dodaj hash transakcji
    onchain: comment.txHash ? true : false // Oznacz, czy komentarz jest na blockchainie
  });

  // Dodaj komentarz do tablicy comments w dokumencie posta
  const postRef = doc(db, 'posts', postId);
  const postDoc = await getDoc(postRef);
  
  if (postDoc.exists()) {
    const postData = postDoc.data();
    await updateDoc(postRef, {
      comments: [...(postData.comments || []), {
        id: commentDoc.id,
        ...comment,
        authorName, // Dodaj nazwę autora do komentarza w poście
        timestamp: Date.now(),
        likes: 0,
        likedBy: [],
        mentions: []
      }]
    });

    // Aktualizuj statystyki użytkownika
    const userRef = doc(db, 'users', comment.author);
    await updateDoc(userRef, {
      'stats.comments': increment(1),
      lastActive: serverTimestamp()
    });
  }
};

// Funkcja do pobierania profilu użytkownika
export const fetchUserProfile = async (address: string, options: { loadSocialLinks?: boolean } = {}): Promise<UserProfile | null> => {
  try {
    const { loadSocialLinks = false } = options;
    const userRef = doc(db, 'users', address);
    const userDoc = await getDoc(userRef);
    
    // Get actual posts count
    const postsRef = collection(db, 'posts');
    const postsQuery = query(postsRef, where('author', '==', address));
    const postsSnapshot = await getDocs(postsQuery);
    const actualPostsCount = postsSnapshot.size;
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      console.log("Loaded user profile from Firebase:", data);
      return {
        id: userDoc.id,
        name: data.name,
        avatar: data.avatar,
        postsCount: actualPostsCount, // Use actual count instead of stored
        likesReceived: data.likesReceived || 0,
        address: address,
        joinedAt: data.joinedAt,
        lastActive: data.lastActive,
        bio: data.bio,
        socialLinks: loadSocialLinks ? data.socialLinks || {
          twitter: '',
          farcaster: '',
          discord: ''
        } : undefined,
        stats: {
          posts: actualPostsCount, // Update stats as well
          likes: data.stats?.likes || 0,
          comments: data.stats?.comments || 0
        }
      };
    }
    
    // Default profile for new users
    return {
      id: address,
      name: `${address.slice(0, 6)}...${address.slice(-4)}`,
      address: address,
      postsCount: actualPostsCount,
      likesReceived: 0,
      joinedAt: Date.now(),
      lastActive: Date.now(),
      socialLinks: loadSocialLinks ? {
        twitter: '',
        farcaster: '',
        discord: ''
      } : undefined,
      stats: {
        posts: actualPostsCount,
        likes: 0,
        comments: 0
      }
    };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

// Funkcja do pobierania nazwy użytkownika
export const getUserName = async (walletAddress: string): Promise<string> => {
  try {
    const userRef = doc(db, 'users', walletAddress);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData.name || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    }
    
    // Jeśli użytkownik nie istnieje, utwórz podstawowy profil
    await setDoc(userRef, {
      walletAddress,
      name: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      stats: {
        posts: 0,
        likes: 0,
        comments: 0
      }
    });
    
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  } catch (error) {
    console.error('Error getting user name:', error);
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }
};

// Funkcja do aktualizacji nazwy użytkownika
export const updateUserName = async (walletAddress: string, newName: string): Promise<boolean> => {
  try {
    const userRef = doc(db, 'users', walletAddress);
    await updateDoc(userRef, {
      name: newName,
      lastActive: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Error updating user name:', error);
    return false;
  }
};

// Prosta funkcja do zapisywania nazwy profilowej
export const saveProfileName = async (address: string, name: string, suffix?: 'sphere' | 'camper') => {
  try {
    const userRef = doc(db, 'usernames', address);
    const isBaseName = name.endsWith('.base.eth');
    const isCamper = name.endsWith('.camper');
    
    // Sprawdź czy użytkownik już ma zapisaną nazwę
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const currentData = userDoc.data();
      // Nie nadpisuj BaseName zwykłą nazwą
      if (currentData.isBaseName && !isBaseName) {
        return true;
      }
    }
    
    await setDoc(userRef, {
      address,
      name,
      updatedAt: serverTimestamp(),
      isBaseName,
      isCamper
    });
    
    // Zaktualizuj też profil użytkownika
    const profileRef = doc(db, 'users', address);
    await setDoc(profileRef, {
      name,
      lastUpdated: serverTimestamp()
    }, { merge: true });
    
    // Jeśli to BaseName, dodaj bonus 1000 punktów
    if (isBaseName) {
      await addBaseNameBonusToUser(address);
    }
    
    // Jeśli to .camper, dodaj bonus 500 punktów
    if (isCamper || suffix === 'camper') {
      console.log(`🏕️ Próba dodania camperBonus dla ${address}, isCamper: ${isCamper}, suffix: ${suffix}`);
      await addCamperBonusToUser(address);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving profile name:', error);
    return false;
  }
};

// Prosta funkcja do pobierania nazwy profilowej
export const getProfileName = async (address: string): Promise<string | null> => {
  try {
    const userRef = doc(db, 'usernames', address);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data().name || null;
    }
    return null;
  } catch (error) {
    console.error('Error getting profile name:', error);
    return null;
  }
};

// Prosta funkcja do pobierania wielu nazw profilowych
export const getBulkUserNames = async (addresses: string[]): Promise<{[key: string]: {name: string, avatar?: string}}> => {
  const userInfo: {[key: string]: {name: string, avatar?: string}} = {};
  
  try {
    const uniqueAddresses = Array.from(new Set(addresses));
    
    // Najpierw pobierz dane z kolekcji users
    const userRefs = uniqueAddresses.map(addr => doc(db, 'users', addr));
    const userDocs = await Promise.all(userRefs.map(ref => getDoc(ref)));
    
    // Następnie pobierz dane z kolekcji usernames (dla BaseName)
    const usernameRefs = uniqueAddresses.map(addr => doc(db, 'usernames', addr));
    const usernameDocs = await Promise.all(usernameRefs.map(ref => getDoc(ref)));
    
    for (let i = 0; i < uniqueAddresses.length; i++) {
      const address = uniqueAddresses[i];
      const userDoc = userDocs[i];
      const usernameDoc = usernameDocs[i];
      
      let name = '';
      let avatar = undefined;
      let isBaseName = false;
      
      // Sprawdź czy użytkownik ma BaseName - ma najwyższy priorytet
      if (usernameDoc.exists() && usernameDoc.data().isBaseName) {
        name = usernameDoc.data().name;
        isBaseName = true;
        // Usuwam log: console.log(`User ${address} has BaseName: ${name}`);
      }
      
      // Pobierz dane z profilu użytkownika
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Użyj nazwy z users tylko jeśli użytkownik NIE ma BaseName
        if (!isBaseName && userData.name) {
          name = userData.name;
          // Usuwam log: console.log(`User ${address} has regular name: ${name}`);
        }
        
        // Zawsze pobierz avatar
        avatar = userData.avatar;
      }
      
      // Jeśli nie ma żadnej nazwy, użyj skróconego adresu
      if (!name) {
        name = `${address.slice(0, 6)}...${address.slice(-4)}`;
      }
      
      userInfo[address] = { name, avatar };
      
      // Dodaj informację o BaseName do konsoli dla debugowania - tylko dla wyjątkowych przypadków
      /*
      if (isBaseName) {
        console.log(`Returning BaseName for ${address}: ${name}`);
      }
      */
    }
    
    return userInfo;
  } catch (error) {
    console.error('Error getting bulk user info:', error);
    return {};
  }
};

// Funkcja do edycji komentarza
export const editComment = async (postId: string, commentId: string, newContent: string) => {
  try {
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    const comments = postData.comments || [];
    const commentIndex = comments.findIndex((c: any) => c.id === commentId);
    
    if (commentIndex === -1) {
      throw new Error('Comment not found');
    }
    
    // Aktualizuj komentarz
    comments[commentIndex] = {
      ...comments[commentIndex],
      content: newContent,
      lastEdited: serverTimestamp()
    };
    
    // Zapisz zaktualizowane komentarze
    await updateDoc(postRef, { comments });
    
    return true;
  } catch (error) {
    console.error('Error editing comment:', error);
    throw error;
  }
};

// Funkcja do usuwania komentarza - dodaję sprawdzenie uprawnień
export const deleteComment = async (postId: string, commentId: string, userId: string) => {
  try {
    console.log(`[DEBUG] Usuwanie komentarza ${commentId} z posta ${postId} przez ${userId}`);
    
    // 1. Przygotuj batch do operacji atomowych
    const batch = writeBatch(db);
    
    // 2. Pobierz post
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      console.error(`[DEBUG] Post ${postId} nie istnieje!`);
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    const comments = postData.comments || [];
    
    console.log(`[DEBUG] Znaleziono ${comments.length} komentarzy w poście ${postId}`);
    
    // Znajdź komentarz który ma zostać usunięty
    const commentToDelete = comments.find((c: any) => c.id === commentId);
    
    if (!commentToDelete) {
      throw new Error('Comment not found');
    }
    
    // Sprawdź uprawnienia - tylko autor komentarza lub admin mogą usuwać
    const isAdmin = userId.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
    const isAuthor = commentToDelete.author === userId;
    
    if (!isAdmin && !isAuthor) {
      throw new Error('Unauthorized to delete this comment');
    }
    
    // 3. Znajdź odpowiedzi do usuwanego komentarza
    const repliesToDelete = comments.filter((c: any) => c.replyTo === commentId);
    console.log(`[DEBUG] Znaleziono ${repliesToDelete.length} odpowiedzi do usuwanego komentarza`);
    
    // 4. Usuń główny komentarz z kolekcji comments
    try {
      const commentRef = doc(db, 'comments', commentId);
      batch.delete(commentRef);
    } catch (error) {
      console.error(`[DEBUG] Błąd podczas usuwania komentarza z głównej kolekcji:`, error);
    }
    
    // 5. Usuń odpowiedzi z kolekcji comments
    for (const reply of repliesToDelete) {
      try {
        const replyRef = doc(db, 'comments', reply.id);
        batch.delete(replyRef);
      } catch (error) {
        console.error(`[DEBUG] Błąd podczas usuwania odpowiedzi ${reply.id}:`, error);
      }
    }
    
    // 6. Przygotuj zaktualizowaną tablicę komentarzy w poście (bez głównego komentarza i jego odpowiedzi)
    const replyIds = repliesToDelete.map((r: any) => r.id);
    const updatedComments = comments.filter((c: any) => 
      c.id !== commentId && !replyIds.includes(c.id)
    );
    
    console.log(`[DEBUG] Po usunięciu zostało ${updatedComments.length} komentarzy (usunięto ${comments.length - updatedComments.length})`);
    
    // 7. Zaktualizuj tablicę komentarzy w dokumencie posta
    batch.update(postRef, { comments: updatedComments });
    
    // 8. Wykonaj wszystkie operacje atomowo
    await batch.commit();
    
    console.log(`[DEBUG] Komentarz ${commentId} i ${repliesToDelete.length} odpowiedzi zostały usunięte`);
    
    return true;
  } catch (error) {
    console.error('[DEBUG] Error deleting comment:', error);
    throw error;
  }
};

// Funkcja do przełączania polubienia komentarza
export const toggleCommentLike = async (postId: string, commentId: string, userId: string) => {
  try {
    const postRef = doc(db, 'posts', postId);
    const commentRef = doc(db, 'comments', commentId);
    
    // Użyj transakcji zamiast wielu operacji odczytu/zapisu
    return await runTransaction(db, async (transaction) => {
      // Wykonaj WSZYSTKIE odczyty na początku transakcji
      const postDoc = await transaction.get(postRef);
      const commentDoc = await transaction.get(commentRef);

      if (!postDoc.exists()) {
        throw new Error('Post not found');
      }
      
      // Pobierz tablicę komentarzy z dokumentu posta
      const postData = postDoc.data();
      const comments = postData.comments || [];
      
      // Znajdź indeks komentarza w tablicy
      const commentIndex = comments.findIndex((c: any) => c.id === commentId);
      
      if (commentIndex === -1) {
        throw new Error('Comment not found');
      }
      
      // Pobierz dane komentarza
      const comment = comments[commentIndex];
      const likedBy = comment.likedBy || [];
      const isLiked = likedBy.includes(userId);
      
      // Przygotuj zaktualizowaną wersję komentarza
      const updatedComment = {
        ...comment,
        likes: (comment.likes || 0) + (isLiked ? -1 : 1),
        likedBy: isLiked 
          ? likedBy.filter((id: string) => id !== userId)
          : [...likedBy, userId]
      };
      
      // Utwórz nową tablicę komentarzy z zaktualizowanym komentarzem
      comments[commentIndex] = updatedComment;
      
      // WSZYSTKIE ZAPISY wykonuj PO wszystkich odczytach
      
      // Zaktualizuj dokument posta w transakcji
      transaction.update(postRef, { 
        comments: comments,
        lastUpdated: serverTimestamp()
      });
      
      // Jeśli komentarz istnieje w kolekcji comments, zaktualizuj go również tam
      if (commentDoc.exists()) {
        const commentData = commentDoc.data();
        const commentLikedBy = commentData.likedBy || [];
        const isCommentLiked = commentLikedBy.includes(userId);
        
        transaction.update(commentRef, {
          likes: (commentData.likes || 0) + (isCommentLiked ? -1 : 1),
          likedBy: isCommentLiked 
            ? commentLikedBy.filter((id: string) => id !== userId)
            : [...commentLikedBy, userId],
          lastUpdated: serverTimestamp()
        });
      }
      
      return !isLiked; // Zwróć true jeśli dodano lajka, false jeśli usunięto
    });
  } catch (error) {
    console.error('Error toggling comment like:', error);
    throw error;
  }
};

export const addCommentReply = async (postId: string, commentId: string, replyData: { 
  author: string, 
  content: string,
  txHash?: string | null 
}) => {
  try {
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);

    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }

    const post = postDoc.data();
    const comments = post.comments || [];
    
    // Sprawdź czy komentarz istnieje
    const parentComment = comments.find((c: any) => c.id === commentId);
    if (!parentComment) {
      throw new Error('Parent comment not found');
    }

    // Utwórz nową odpowiedź z wszystkimi wymaganymi polami
    const newReply = {
      id: generateId(),
      postId: postId, // Dodane pole postId
      author: replyData.author,
      content: replyData.content,
      timestamp: Date.now(),
      likes: 0,
      likedBy: [],
      mentions: [], // Dodane pole mentions
      replyTo: commentId, // Dodaj referencję do komentarza nadrzędnego
      txHash: replyData.txHash || null, // Dodajemy obsługę txHash dla onchain
      onchain: replyData.txHash ? true : false // Oznaczamy czy jest onchain
    };

    // Dodaj odpowiedź do tablicy komentarzy
    comments.push(newReply);

    // Zaktualizuj dokument
    await updateDoc(postRef, {
      comments: comments,
      lastUpdated: serverTimestamp() // Aktualizujemy czas ostatniej zmiany
    });

    return newReply;
  } catch (error) {
    console.error('Error adding reply:', error);
    throw error;
  }
};

// Funkcja do generowania unikalnych ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

// Usuń blokadę zmiany avatara dla admina
export const removeAvatarRestriction = async (address: string) => {
  if (address.toLowerCase() === ADMIN_ADDRESS) {
    const userRef = doc(db, 'users', address);
    await updateDoc(userRef, {
      lastImageUpdate: null
    });
  }
};

// Debug funkcja - sprawdź status użytkownika
export const checkUserStatus = async (address: string) => {
  const userRef = doc(db, 'users', address);
  const userDoc = await getDoc(userRef);
  console.log('User data:', userDoc.data());
  return userDoc.data();
};

// Reset profilu admina
export const resetAdminProfile = async () => {
  const userRef = doc(db, 'users', ADMIN_ADDRESS);
  
  // Usuń stary dokument
  try {
    await deleteDoc(userRef);
  } catch (error) {
    console.error('Error deleting old profile:', error);
  }

  // Utwórz nowy dokument bez lastImageUpdate
  try {
    await setDoc(userRef, {
      address: ADMIN_ADDRESS,
      name: 'story91.base.eth',
      isAdmin: true,
      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating new profile:', error);
  }
};

// Sprawdź czy użytkownik może zmienić avatar
export const canChangeAvatar = async (address: string): Promise<boolean> => {
  // Admin zawsze może zmienić avatar
  if (address.toLowerCase() === ADMIN_ADDRESS) {
    await resetAdminProfile(); // Reset profilu przy każdej próbie zmiany avatara
    return true;
  }

  const userRef = doc(db, 'users', address);
  const userDoc = await getDoc(userRef);
  const userData = userDoc.data();

  if (!userData?.lastImageUpdate) {
    return true;
  }

  const lastUpdate = userData.lastImageUpdate.toDate();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  return lastUpdate < oneMonthAgo;
};

// Zapisz nowy avatar
export const saveUserAvatar = async (address: string, avatarUrl: string) => {
  const userRef = doc(db, 'users', address);
  
  if (address.toLowerCase() === ADMIN_ADDRESS) {
    await updateDoc(userRef, {
      avatar: avatarUrl
    });
    return;
  }

  await updateDoc(userRef, {
    avatar: avatarUrl,
    lastImageUpdate: serverTimestamp()
  });
};

// Funkcje do obsługi wiadomości bezpośrednich
export const searchUsers = async (searchQuery?: string) => {
  const usersRef = collection(db, 'users');
  let usersQuery;
  
  if (searchQuery && searchQuery.trim() !== '') {
    // Wyszukiwanie użytkowników po nazwie
    usersQuery = query(
      usersRef,
      where('name', '>=', searchQuery),
      where('name', '<=', searchQuery + '\uf8ff'),
      firestoreLimit(10)
    );
  } else {
    // Pobierz wszystkich użytkowników z BaseName i wybierz losowych 10
    usersQuery = query(
      usersRef,
      where('isBaseName', '==', true),
      firestoreLimit(50) // Pobieramy więcej, żeby potem wylosować z nich 10
    );
  }
  
  const snapshot = await getDocs(usersQuery);
  let users = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name,
      address: data.address,
      isBaseName: true
    };
  });

  // Jeśli nie ma wyszukiwania, wybierz losowych 10 użytkowników
  if (!searchQuery || searchQuery.length < 3) {
    users = users
      .sort(() => Math.random() - 0.5) // Losowe sortowanie
      .slice(0, 10); // Wybierz pierwszych 10
  }

  return users;
};

export const createChat = async (user1: string, user2: string) => {
  // Sortujemy ID użytkowników, żeby mieć spójne ID czatu
  const participants = [user1, user2].sort();
  const chatId = `${participants[0]}_${participants[1]}`;
  
  const chatRef = doc(db, 'chats', chatId);
  const chatDoc = await getDoc(chatRef);
  
  if (!chatDoc.exists()) {
    await setDoc(chatRef, {
      participants,
      createdAt: serverTimestamp(),
      lastMessage: null,
      lastMessageTime: null
    });
  }
  
  return chatId;
};

export const sendMessage = async (chatId: string, message: {
  sender: string;
  content: string;
  timestamp?: any;
}) => {
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const chatRef = doc(db, 'chats', chatId);
  
  // Dodaj wiadomość
  await addDoc(messagesRef, {
    ...message,
    timestamp: serverTimestamp()
  });
  
  // Zaktualizuj informacje o ostatniej wiadomości
  await updateDoc(chatRef, {
    lastMessage: message.content,
    lastMessageTime: serverTimestamp()
  });
};

export const getMessages = async (chatId: string, messageLimit = 50) => {
  const messagesRef = collection(db, 'chatRooms', chatId, 'messages');
  const queryRef = query(
    messagesRef,
    firestoreOrderBy('timestamp', 'desc'),
    firestoreLimit(messageLimit)
  );
  
  const snapshot = await getDocs(queryRef);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      content: data.content,
      sender: data.sender,
      timestamp: data.timestamp ? convertTimestamp(data.timestamp as Timestamp) : null
    };
  }).reverse();
};

export const getUserChats = async (userId: string) => {
  const chatsRef = collection(db, 'chatRooms');
  const queryRef = query(
    chatsRef,
    where('participants', 'array-contains', userId),
    firestoreOrderBy('lastMessageTime', 'desc')
  );
  
  const snapshot = await getDocs(queryRef);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      participants: data.participants,
      lastMessage: data.lastMessage,
      lastMessageTime: data.lastMessageTime ? convertTimestamp(data.lastMessageTime as Timestamp) : null
    };
  });
};

// --- Friend System Functions ---

interface UserData {
  name?: string;
  address?: string;
  avatar?: string;
  isBaseName?: boolean;
  baseChatPoints?: number;
}

interface FriendRequest {
  id: string;
  from: string;
  to: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: any;
  senderName?: string;
  senderAvatar?: string;
  receiverName?: string;
  receiverAvatar?: string;
}

/**
 * Retrieves the list of friends for a given user from the 'friendships' collection.
 * It queries documents with status 'accepted' and where the 'users' array contains the userAddress.
 */
export const getFriendsList = async (userAddress: string): Promise<any[]> => {
  try {
    const friendshipsQuery = query(
      collection(db, 'friendships'),
      where('users', 'array-contains', userAddress),
      where('status', '==', 'accepted')
    );
    
    const friendshipsSnapshot = await getDocs(friendshipsQuery);
    const friendsPromises = friendshipsSnapshot.docs.map(async (docSnapshot) => {
      const data = docSnapshot.data();
      const friendAddress = data.users.find((addr: string) => addr !== userAddress);
      
      const userRef = doc(db, 'users', friendAddress);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data() as UserData;
      
      return {
        id: friendAddress,
        name: userData?.name || `${friendAddress.slice(0, 6)}...${friendAddress.slice(-4)}`,
        address: friendAddress,
        avatar: userData?.avatar,
        isBaseName: userData?.isBaseName || false
      };
    });
    
    return await Promise.all(friendsPromises);
  } catch (error) {
    console.error('Błąd podczas pobierania listy znajomych:', error);
    throw error;
  }
};

/**
 * Sends a friend request from 'fromAddress' to 'toAddress'.
 * The request is stored in the 'friendRequests' collection with a status of 'pending'.
 * Returns the ID of the created request.
 */
export const sendFriendRequest = async (fromAddress: string, toAddress: string): Promise<string> => {
  try {
    // 1. Najpierw sprawdź czy użytkownicy nie są już znajomymi
    const existingFriendshipQuery = query(
      collection(db, 'friendships'),
      where('users', 'array-contains', fromAddress),
      where('status', '==', 'accepted')
    );
    
    const existingFriendshipSnapshot = await getDocs(existingFriendshipQuery);
    const alreadyFriends = existingFriendshipSnapshot.docs.some(doc => {
      const data = doc.data();
      return data.users.includes(toAddress);
    });
    
    if (alreadyFriends) {
      throw new Error('Users are already friends');
    }

    // 2. Sprawdź czy nie ma już zaproszenia w którąkolwiek stronę
    const pendingRequestsQuery1 = query(
      collection(db, 'friendRequests'),
      where('from', '==', fromAddress),
      where('to', '==', toAddress),
      where('status', '==', 'pending')
    );

    const pendingRequestsQuery2 = query(
      collection(db, 'friendRequests'),
      where('from', '==', toAddress),
      where('to', '==', fromAddress),
      where('status', '==', 'pending')
    );

    const [snapshot1, snapshot2] = await Promise.all([
      getDocs(pendingRequestsQuery1),
      getDocs(pendingRequestsQuery2)
    ]);

    if (!snapshot1.empty || !snapshot2.empty) {
      throw new Error('Friend request already exists');
    }

    // 3. Dodaj nowe zaproszenie
    const friendRequest = {
      from: fromAddress,
      to: toAddress,
      status: 'pending',
      timestamp: serverTimestamp(),
      users: [fromAddress, toAddress]
    };

    const docRef = await addDoc(collection(db, 'friendRequests'), friendRequest);
    console.log('Friend request sent with ID:', docRef.id);
    
    return docRef.id;
  } catch (error) {
    console.error('Error sending friend request:', error);
    throw error;
  }
};

/**
 * Checks if two users are friends by looking for an accepted friendship in the 'friendships' collection.
 */
export const checkFriendship = async (userA: string, userB: string): Promise<boolean> => {
  const q = query(
    collection(db, 'friendships'),
    where('status', '==', 'accepted'),
    where('users', 'array-contains', userA)
  );
  const querySnapshot = await getDocs(q);
  let isFriend = false;
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.users && Array.isArray(data.users) && data.users.includes(userB)) {
      isFriend = true;
    }
  });
  return isFriend;
};

/**
 * Pobiera listę otrzymanych zaproszeń do znajomych
 */
export const getReceivedFriendRequests = async (userAddress: string): Promise<FriendRequest[]> => {
  try {
    const requestsRef = collection(db, 'friendRequests');
    const requestsQuery = query(
      requestsRef,
      where('to', '==', userAddress),
      where('status', '==', 'pending'),
      firestoreOrderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(requestsQuery);
    const requests = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
      const data = docSnapshot.data();
      const userRef = doc(db, 'users', data.from);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data() as UserData;
      
      return {
        id: docSnapshot.id,
        from: data.from,
        to: data.to,
        status: data.status,
        timestamp: data.timestamp,
        senderName: userData?.name || `${data.from.slice(0, 6)}...${data.from.slice(-4)}`,
        senderAvatar: userData?.avatar
      } as FriendRequest;
    }));
    
    return requests;
  } catch (error) {
    console.error('Błąd podczas pobierania otrzymanych zaproszeń:', error);
    throw error;
  }
};

/**
 * Pobiera listę wysłanych zaproszeń do znajomych
 */
export const getSentFriendRequests = async (userAddress: string): Promise<FriendRequest[]> => {
  try {
    console.log('Getting sent friend requests for address:', userAddress);
    const requestsQuery = query(
      collection(db, 'friendRequests'),
      where('from', '==', userAddress),
      where('status', '==', 'pending'),
      firestoreOrderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(requestsQuery);
    console.log('Found sent requests:', snapshot.docs.length);
    
    const requests = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
      const data = docSnapshot.data();
      console.log('Processing sent request:', data);
      
      const userRef = doc(db, 'users', data.to);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data() as UserData;
      
      return {
        id: docSnapshot.id,
        from: data.from,
        to: data.to,
        status: data.status,
        timestamp: data.timestamp,
        receiverName: userData?.name || `${data.to.slice(0, 6)}...${data.to.slice(-4)}`,
        receiverAvatar: userData?.avatar
      } as FriendRequest;
    }));
    
    console.log('Processed sent requests:', requests);
    return requests;
  } catch (error) {
    console.error('Error getting sent friend requests:', error);
    throw error;
  }
};

/**
 * Akceptuje zaproszenie do znajomych
 */
export const acceptFriendRequest = async (requestId: string): Promise<void> => {
  try {
    const requestRef = doc(db, 'friendRequests', requestId);
    const requestDoc = await getDoc(requestRef);
    
    if (!requestDoc.exists()) {
      throw new Error('Zaproszenie nie istnieje');
    }
    
    const requestData = requestDoc.data();
    if (requestData.status !== 'pending') {
      throw new Error('Zaproszenie zostało już przetworzone');
    }
    
    // Utwórz nową znajomość
    await addDoc(collection(db, 'friendships'), {
      users: [requestData.from, requestData.to],
      status: 'accepted',
      timestamp: serverTimestamp()
    });
    
    // Zaktualizuj status zaproszenia
    await updateDoc(requestRef, {
      status: 'accepted',
      acceptedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Błąd podczas akceptowania zaproszenia:', error);
    throw error;
  }
};

/**
 * Odrzuca zaproszenie do znajomych
 */
export const rejectFriendRequest = async (requestId: string): Promise<void> => {
  try {
    const requestRef = doc(db, 'friendRequests', requestId);
    const requestDoc = await getDoc(requestRef);
    
    if (!requestDoc.exists()) {
      throw new Error('Zaproszenie nie istnieje');
    }
    
    await updateDoc(requestRef, {
      status: 'rejected',
      rejectedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Błąd podczas odrzucania zaproszenia:', error);
    throw error;
  }
};

// Funkcja do usuwania wszystkich zaproszeń do znajomych
export async function clearAllFriendRequests() {
  const friendRequestsRef = collection(db, 'friendRequests');
  const querySnapshot = await getDocs(friendRequestsRef);
  
  const batch = writeBatch(db);
  querySnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
}

// --- End Friend System Functions ---

// Calculate user statistics from posts
export const calculateUserStats = async (userAddress: string) => {
  try {
    const postsRef = collection(db, 'posts');
    const userPostsQuery = query(
      postsRef,
      where('author', '==', userAddress)
    );
    
    const postsSnapshot = await getDocs(userPostsQuery);
    let totalLikes = 0;
    let totalPosts = postsSnapshot.size;
    
    // Calculate total likes from all user's posts
    postsSnapshot.forEach((doc) => {
      const postData = doc.data();
      totalLikes += postData.likes || 0;
    });

    // Get last 30 days activity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentPostsQuery = query(
      postsRef,
      where('author', '==', userAddress),
      where('timestamp', '>=', thirtyDaysAgo)
    );
    
    const recentPostsSnapshot = await getDocs(recentPostsQuery);
    const recentActivityBonus = recentPostsSnapshot.size > 0 ? 1.25 : 1;

    // Sprawdź czy użytkownik ma BaseName
    const isBaseNameUser = await hasBaseName(userAddress);
    const baseNameBonus = isBaseNameUser ? 1000 : 0;

    // Calculate total points
    // Base formula: (posts * 5) + (likes * 1) + BaseName bonus
    const points = ((totalPosts * 5) + totalLikes) * recentActivityBonus + baseNameBonus;

    // Update user statistics
    const userRef = doc(db, 'users', userAddress);
    await updateDoc(userRef, {
      postsCount: totalPosts,
      likesReceived: totalLikes,
      lastCalculated: serverTimestamp(),
      'stats.posts': totalPosts,
      'stats.likes': totalLikes,
      'stats.points': Math.round(points),
      'stats.hasBaseName': isBaseNameUser,
      'stats.baseNameBonus': baseNameBonus
    });

    return {
      posts: totalPosts,
      likes: totalLikes,
      points: Math.round(points),
      hasRecentActivity: recentActivityBonus > 1,
      hasBaseName: isBaseNameUser,
      baseNameBonus: baseNameBonus
    };
  } catch (error) {
    console.error('Error calculating user stats:', error);
    throw error;
  }
};

// Funkcja do odświeżania wszystkich postów
export const refreshAllPosts = async () => {
  try {
    console.log('Rozpoczynam odświeżanie wszystkich postów...');
    const batch = writeBatch(db);
    
    // Pobierz wszystkie posty
    const postsRef = collection(db, 'posts');
    const postsSnapshot = await getDocs(postsRef);
    
    let processedPosts = 0;
    let updatedPosts = 0;
    
    // Mapa do śledzenia statystyk użytkowników
    const userStats: { [key: string]: { posts: number, likes: number, hasBaseName: boolean } } = {};
    
    // Przetwórz każdy post
    for (const postDoc of postsSnapshot.docs) {
      processedPosts++;
      const post = postDoc.data();
      const postRef = doc(db, 'posts', postDoc.id);
      
      // Sprawdź czy liczba lajków zgadza się z długością tablicy likedBy
      const likedBy = post.likedBy || [];
      const actualLikes = likedBy.length;
      
      // Jeśli liczba lajków się różni, zaktualizuj post
      if (post.likes !== actualLikes) {
        batch.update(postRef, {
          likes: actualLikes,
          lastUpdated: serverTimestamp()
        });
        updatedPosts++;
      }
      
      // Aktualizuj statystyki użytkownika
      if (!userStats[post.author]) {
        // Sprawdź czy użytkownik ma BaseName
        const userHasBaseName = await hasBaseName(post.author);
        userStats[post.author] = { posts: 0, likes: 0, hasBaseName: userHasBaseName };
      }
      userStats[post.author].posts++;
      userStats[post.author].likes += actualLikes;
    }
    
    // Aktualizuj statystyki użytkowników
    for (const [userId, stats] of Object.entries(userStats)) {
      const userRef = doc(db, 'users', userId);
      const baseNameBonus = stats.hasBaseName ? 1000 : 0;
      
      batch.update(userRef, {
        postsCount: stats.posts,
        likesReceived: stats.likes,
        lastCalculated: serverTimestamp(),
        'stats.posts': stats.posts,
        'stats.likes': stats.likes,
        'stats.hasBaseName': stats.hasBaseName,
        'stats.baseNameBonus': baseNameBonus,
        'stats.points': Math.round((stats.posts * 5 + stats.likes) * 1.25 + baseNameBonus)
      });
    }
    
    // Wykonaj wszystkie aktualizacje
    await batch.commit();
    
    console.log(`Zakończono odświeżanie postów:
    - Przetworzono postów: ${processedPosts}
    - Zaktualizowano postów: ${updatedPosts}
    - Zaktualizowano użytkowników: ${Object.keys(userStats).length}`);
    
    return {
      success: true,
      processedPosts,
      updatedPosts,
      updatedUsers: Object.keys(userStats).length
    };
  } catch (error) {
    console.error('Błąd podczas odświeżania postów:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas odświeżania postów'
    };
  }
};

// Interface for authorized quote
export interface AuthorizedQuote {
  id: string;
  content: string;
  submittedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: any;
  category: string;
  submitterName?: string;
  isOwnQuote?: boolean;
}

// Submit a quote for authorization
export const submitQuoteForAuthorization = async (quote: {
  content: string;
  submittedBy: string;
  category: string;
  isOwnQuote?: boolean;
}): Promise<string> => {
  try {
    const quoteData = {
      ...quote,
      status: 'pending',
      timestamp: serverTimestamp(),
      isOwnQuote: quote.isOwnQuote || false
    };

    const docRef = await addDoc(collection(db, 'authorizedQuotes'), quoteData);
    return docRef.id;
  } catch (error) {
    console.error('Error submitting quote:', error);
    throw error;
  }
};

// Get pending quotes (admin only)
export const getPendingQuotes = async (): Promise<AuthorizedQuote[]> => {
  try {
    const quotesRef = collection(db, 'authorizedQuotes');
    const q = query(
      quotesRef,
      where('status', '==', 'pending'),
      firestoreOrderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as AuthorizedQuote));
  } catch (error) {
    console.error('Error getting pending quotes:', error);
    throw error;
  }
};

// Update quote status (admin only)
export const updateQuoteStatus = async (
  quoteId: string, 
  status: 'approved' | 'rejected'
): Promise<void> => {
  try {
    const quoteRef = doc(db, 'authorizedQuotes', quoteId);
    await updateDoc(quoteRef, {
      status,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating quote status:', error);
    throw error;
  }
};

// Get approved quotes by category
export const getApprovedQuotes = async (category: string): Promise<AuthorizedQuote[]> => {
  try {
    const quotesRef = collection(db, 'authorizedQuotes');
    const q = query(
      quotesRef,
      where('status', '==', 'approved'),
      where('category', '==', category),
      firestoreOrderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as AuthorizedQuote));
  } catch (error) {
    console.error('Error getting approved quotes:', error);
    throw error;
  }
};

// Funkcja do usuwania bonusu za BaseName dla wszystkich użytkowników
export const removeBaseNameBonus = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('Rozpoczynam usuwanie bonusu za BaseName dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników z kolekcji usernames, którzy mają isBaseName: true
    const usernamesRef = collection(db, 'usernames');
    const baseNameQuery = query(usernamesRef, where('isBaseName', '==', true));
    const baseNameSnapshot = await getDocs(baseNameQuery);
    
    let updatedUsers = 0;
    const batch = writeBatch(db);
    const batchSize = 500; // Firestore ma limit 500 operacji w jednym batchu
    let batchCount = 0;
    let currentBatch = batch;
    
    // Przetwórz każdego użytkownika z BaseName
    for (const usernameDoc of baseNameSnapshot.docs) {
      const userAddress = usernameDoc.id;
      
      // Pobierz dane użytkownika z kolekcji users
      const userRef = doc(db, 'users', userAddress);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Pobierz aktualną strukturę baseChatPoints
        if (userData.baseChatPoints) {
          const baseChatPoints = { ...userData.baseChatPoints };
          
          // Usuń baseNameBonus
          delete baseChatPoints.baseNameBonus;
          
          // Przelicz totalPoints
          const postPoints = baseChatPoints.postPoints || 0;
          const likePoints = baseChatPoints.likePoints || 0;
          const activityBonus = baseChatPoints.activityBonus || 0;
          
          // Suma wszystkich punktów bez baseNameBonus
          baseChatPoints.totalPoints = postPoints + likePoints + activityBonus;
          
          // Zaktualizuj dokument użytkownika
          currentBatch.update(userRef, {
            baseChatPoints: baseChatPoints,
            lastUpdated: serverTimestamp()
          });
          
          updatedUsers++;
          batchCount++;
          
          // Jeśli osiągnęliśmy limit batcha, wykonaj go i utwórz nowy
          if (batchCount >= batchSize) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            batchCount = 0;
            console.log(`Zaktualizowano ${updatedUsers} użytkowników. Tworzę nowy batch...`);
          }
        }
      }
    }
    
    // Wykonaj ostatni batch, jeśli zawiera jakieś operacje
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    console.log(`Zakończono usuwanie bonusu za BaseName:
    - Zaktualizowano użytkowników: ${updatedUsers}`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas usuwania bonusu za BaseName:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas usuwania bonusu za BaseName'
    };
  }
};

// Funkcja do aktualizacji daty dołączenia dla wszystkich użytkowników
export const updateAllUserJoinDates = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('Rozpoczynam aktualizację daty dołączenia dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
    let updatedUsers = 0;
    const batch = writeBatch(db);
    const batchSize = 500; // Firestore ma limit 500 operacji w jednym batchu
    let batchCount = 0;
    let currentBatch = batch;
    
    // Przetwórz każdego użytkownika
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userAddress = userDoc.id;
      
      // Sprawdź czy użytkownik ma datę dołączenia
      if (!userData.joinedAt) {
        // Ustaw datę dołączenia na aktualny czas
        const userRef = doc(db, 'users', userAddress);
        currentBatch.update(userRef, {
          joinedAt: serverTimestamp()
        });
        
        updatedUsers++;
        batchCount++;
        
        // Jeśli osiągnęliśmy limit batcha, wykonaj go i utwórz nowy
        if (batchCount >= batchSize) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          batchCount = 0;
          console.log(`Zaktualizowano ${updatedUsers} użytkowników. Tworzę nowy batch...`);
        }
      }
    }
    
    // Wykonaj ostatni batch, jeśli zawiera jakieś operacje
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    console.log(`Zakończono aktualizację daty dołączenia:
    - Zaktualizowano użytkowników: ${updatedUsers}`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji daty dołączenia:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas aktualizacji daty dołączenia'
    };
  }
};

// Funkcja do aktualizacji bonusu za BaseName dla wszystkich użytkowników
export const updateBaseNameBonus = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('Rozpoczynam aktualizację bonusu za BaseName dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników z kolekcji usernames, którzy mają isBaseName: true
    const usernamesRef = collection(db, 'usernames');
    const baseNameQuery = query(usernamesRef, where('isBaseName', '==', true));
    const baseNameSnapshot = await getDocs(baseNameQuery);
    
    let updatedUsers = 0;
    const batch = writeBatch(db);
    const batchSize = 500; // Firestore ma limit 500 operacji w jednym batchu
    let batchCount = 0;
    let currentBatch = batch;
    
    // Przetwórz każdego użytkownika z BaseName
    for (const usernameDoc of baseNameSnapshot.docs) {
      const userAddress = usernameDoc.id;
      
      // Pobierz dane użytkownika z kolekcji users
      const userRef = doc(db, 'users', userAddress);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Pobierz aktualną strukturę baseChatPoints lub utwórz nową
        const baseChatPoints = userData.baseChatPoints || {
          activityBonus: 0,
          likePoints: 0,
          postPoints: 0,
          totalPoints: 0
        };
        
        // Dodaj baseNameBonus z wartością 1000
        baseChatPoints.baseNameBonus = 1000;
        
        // Przelicz totalPoints
        const postPoints = baseChatPoints.postPoints || 0;
        const likePoints = baseChatPoints.likePoints || 0;
        const activityBonus = baseChatPoints.activityBonus || 0;
        const baseNameBonus = baseChatPoints.baseNameBonus || 0;
        
        // Suma wszystkich punktów
        baseChatPoints.totalPoints = postPoints + likePoints + activityBonus + baseNameBonus;
        
        // Zaktualizuj dokument użytkownika
        currentBatch.update(userRef, {
          baseChatPoints: baseChatPoints,
          lastUpdated: serverTimestamp()
        });
        
        updatedUsers++;
        batchCount++;
        
        // Jeśli osiągnęliśmy limit batcha, wykonaj go i utwórz nowy
        if (batchCount >= batchSize) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          batchCount = 0;
          console.log(`Zaktualizowano ${updatedUsers} użytkowników. Tworzę nowy batch...`);
        }
      }
    }
    
    // Wykonaj ostatni batch, jeśli zawiera jakieś operacje
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    console.log(`Zakończono aktualizację bonusu za BaseName:
    - Zaktualizowano użytkowników: ${updatedUsers}`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji bonusu za BaseName:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas aktualizacji bonusu za BaseName'
    };
  }
};

// Funkcja naprawiająca strukturę baseChatPoints dla wszystkich użytkowników - wersja radykalna
export const fixBaseChatPointsRadical = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('Rozpoczynam radykalną naprawę struktury baseChatPoints dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
    let updatedUsers = 0;
    const batch = writeBatch(db);
    const batchSize = 500; // Firestore ma limit 500 operacji w jednym batchu
    let batchCount = 0;
    let currentBatch = batch;
    
    // Przetwórz każdego użytkownika
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userAddress = userDoc.id;
      
      // Sprawdź, czy użytkownik ma BaseName
      const hasBaseNameValue = await hasBaseName(userAddress);
      
      // Oblicz punkty na podstawie danych użytkownika
      const likePoints = userData.likesReceived || 0;
      const postPoints = (userData.postsCount || 0) * 5;
      const activityBonus = Math.round((likePoints + postPoints) * 0.25); // 25% bonus za aktywność
      
      // Utwórz nową strukturę baseChatPoints
      const newBaseChatPoints: {
        likePoints: number;
        postPoints: number;
        activityBonus: number;
        totalPoints: number;
        baseNameBonus?: number;
      } = {
        likePoints: likePoints,
        postPoints: postPoints,
        activityBonus: activityBonus,
        totalPoints: likePoints + postPoints + activityBonus
      };
      
      // Dodaj baseNameBonus, jeśli użytkownik ma BaseName
      if (hasBaseNameValue) {
        newBaseChatPoints.baseNameBonus = 1000;
        newBaseChatPoints.totalPoints += 1000;
      }
      
      // Zaktualizuj dokument użytkownika
      currentBatch.update(doc(db, 'users', userAddress), {
        baseChatPoints: newBaseChatPoints,
        lastUpdated: serverTimestamp()
      });
      
      updatedUsers++;
      batchCount++;
      
      // Jeśli osiągnęliśmy limit batcha, wykonaj go i utwórz nowy
      if (batchCount >= batchSize) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        batchCount = 0;
        console.log(`Zaktualizowano ${updatedUsers} użytkowników. Tworzę nowy batch...`);
      }
    }
    
    // Wykonaj ostatni batch, jeśli zawiera jakieś operacje
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    console.log(`Zakończono radykalną naprawę struktury baseChatPoints:
    - Zaktualizowano ${updatedUsers} użytkowników`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas radykalnej naprawy struktury baseChatPoints:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas radykalnej naprawy struktury baseChatPoints'
    };
  }
};

// Funkcja do pobierania globalnych statystyk dla strony głównej
export const getGlobalStats = async () => {
  try {
    // Pobierz liczbę użytkowników
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const userCount = usersSnapshot.size;

    // Pobierz posty
    const postsSnapshot = await getDocs(collection(db, 'posts'));
    const postsCount = postsSnapshot.size;

    // Oblicz łączną liczbę like'ów i komentarzy
    let totalLikes = 0;
    let totalComments = 0;
    
    for (const doc of postsSnapshot.docs) {
      const postData = doc.data();
      // Dodaj like'i
      if (postData.likes) {
        totalLikes += postData.likes;
      }
      
      // Dodaj komentarze
      if (postData.comments && Array.isArray(postData.comments)) {
        totalComments += postData.comments.length;
      } else if (postData.commentsCount) {
        totalComments += postData.commentsCount;
      }
    }

    // Oblicz szacowaną liczbę transakcji
    // Jest to przybliżenie oparte na postach, komentarzach i transakcjach systemowych
    let transactionsCount = postsCount + totalComments;
    
    // Dodaj szacowane transakcje systemowe (np. 10% więcej)
    transactionsCount = Math.floor(transactionsCount * 1.1);

    return {
      userCount,
      postsCount,
      transactionsCount,
      likesCount: totalLikes,
      commentsCount: totalComments
    };
  } catch (error) {
    console.error('Error fetching global stats:', error);
    // Zwróć domyślne wartości w przypadku błędu
    return {
      userCount: 0,
      postsCount: 0,
      transactionsCount: 0,
      likesCount: 0,
      commentsCount: 0
    };
  }
};

// Interfejsy rozszerzające bazowe typy
interface ExtendedPost extends Post {
  pollId?: string;
  lastEdited?: any;
}

// Funkcja do usuwania postów wg. filtru
export const deletePostsByFilter = async (filter: { author?: string }) => {
  try {
    const postsCollection = collection(db, 'posts');
    const queryConstraints = [];
    
    if (filter.author) {
      queryConstraints.push(where('author', '==', filter.author));
    }
    
    // Zastosuj limit bezpieczeństwa
    queryConstraints.push(firestoreLimit(1000));
    
    const q = query(postsCollection, ...queryConstraints);
    const snapshot = await getDocs(q);
    
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    return { deleted: snapshot.size };
  } catch (error) {
    console.error('Error deleting posts by filter:', error);
    throw error;
  }
};

// Funkcja do pobierania statystyk dla użytkownika
export const fetchUserStats = async (userId: string) => {
  try {
    // Pobierz liczbę postów użytkownika
    const postsRef = collection(db, 'posts');
    const postsQuery = query(
      postsRef, 
      where('author', '==', userId),
      firestoreOrderBy('timestamp', 'desc')
    );
    const postsSnapshot = await getDocs(postsQuery);
    const actualPostsCount = postsSnapshot.size;
    
    if (postsSnapshot.empty) {
      return {
        posts: 0,
        likes: 0,
        points: 0,
        hasRecentActivity: false,
        hasBaseName: false,
        baseNameBonus: 0
      };
    }
    
    let totalLikes = 0;
    let totalPosts = actualPostsCount;
    
    // Calculate total likes from all user's posts
    postsSnapshot.forEach((doc) => {
      const postData = doc.data();
      totalLikes += postData.likes || 0;
    });

    // Get last 30 days activity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentPostsQuery = query(
      postsRef,
      where('author', '==', userId),
      where('timestamp', '>=', thirtyDaysAgo)
    );
    
    const recentPostsSnapshot = await getDocs(recentPostsQuery);
    const recentActivityBonus = recentPostsSnapshot.size > 0 ? 1.25 : 1;

    // Sprawdź czy użytkownik ma BaseName
    const isBaseNameUser = await hasBaseName(userId);
    const baseNameBonus = isBaseNameUser ? 1000 : 0;

    // Calculate total points
    // Base formula: (posts * 5) + (likes * 1) + BaseName bonus
    const points = ((totalPosts * 5) + totalLikes) * recentActivityBonus + baseNameBonus;

    return {
      posts: totalPosts,
      likes: totalLikes,
      points: Math.round(points),
      hasRecentActivity: recentActivityBonus > 1,
      hasBaseName: isBaseNameUser,
      baseNameBonus: baseNameBonus
    };
  } catch (error) {
    console.error('Error calculating user stats:', error);
    throw error;
  }
};

// Pobieranie użytkowników dla proponowanych użytkowników
export const fetchRecommendedUsers = async (currentUserId: string) => {
  try {
    // Najpierw pobierz obserwowanych użytkowników, aby ich wykluczyć
    const userFollowingRef = collection(db, `users/${currentUserId}/following`);
    const followingSnapshot = await getDocs(userFollowingRef);
    const followingIds = followingSnapshot.docs.map(doc => doc.id);
    
    // Dodaj też aktualnego użytkownika do wykluczonych
    const excludedIds = [...followingIds, currentUserId];
    
    // Pobierz wszystkich użytkowników
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
};

// Pobieranie opinii o użytkowniku
export const fetchUserRatings = async (userId: string) => {
  try {
    // ... existing code ...
    
    // Pobierz opinie o użytkowniku
    const ratingsRef = collection(db, 'userRatings');
    const q = query(
      ratingsRef,
      where('ratedUserId', '==', userId),
      firestoreOrderBy('timestamp', 'desc')
    );
    const ratingsSnapshot = await getDocs(q);
    
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
};

// Pobranie historii płatności użytkownika
export const fetchPaymentHistory = async (userId: string) => {
  try {
    // ... existing code ...
    
    const paymentsRef = collection(db, 'payments');
    const q = query(
      paymentsRef,
      where('userId', '==', userId),
      firestoreOrderBy('timestamp', 'desc')
    );
    const paymentsSnapshot = await getDocs(q);
    
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
};

// Zmieniam nazwę zduplikowanej funkcji
export const fetchUserProfileSimple = async (userId: string) => {
  try {
    // ... existing code ...
    
    // Pobierz posty użytkownika
    const postsRef = collection(db, 'posts');
    const postsQuery = query(
      postsRef,
      where('author', '==', userId),
      firestoreOrderBy('timestamp', 'desc')
    );
    const postsSnapshot = await getDocs(postsQuery);
    
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
};

// --- MySphere Social Media Tracking Functions ---

interface MySphereUserSocialConnections {
  address: string;
  connectedPlatforms: string[];
  lastUpdated: any;
  firstConnected: any;
  connectionHistory: {
    platform: string;
    connectedAt: any;
    disconnectedAt?: any;
  }[];
}

// Zapisz połączenia social media użytkownika w Firebase
export const saveMySphereUserConnections = async (
  address: string, 
  connectedPlatforms: string[]
): Promise<void> => {
  try {
    const userSocialRef = doc(db, 'mySphereUserSocials', address);
    const userSocialDoc = await getDoc(userSocialRef);
    
    const now = serverTimestamp();
    
    if (userSocialDoc.exists()) {
      const existingData = userSocialDoc.data() as MySphereUserSocialConnections;
      const previousPlatforms = existingData.connectedPlatforms || [];
      
      // Sprawdź które platformy zostały dodane lub usunięte
      const newPlatforms = connectedPlatforms.filter(p => !previousPlatforms.includes(p));
      const removedPlatforms = previousPlatforms.filter(p => !connectedPlatforms.includes(p));
      
      // Utwórz historię zmian
      const connectionHistory = [...(existingData.connectionHistory || [])];
      
      // Dodaj nowe połączenia do historii
      const currentTime = new Date();
      newPlatforms.forEach(platform => {
        connectionHistory.push({
          platform,
          connectedAt: currentTime
        });
      });
      
      // Dodaj rozłączenia do historii
      removedPlatforms.forEach(platform => {
        const lastConnection = connectionHistory
          .filter(h => h.platform === platform && !h.disconnectedAt)
          .pop();
        if (lastConnection) {
          lastConnection.disconnectedAt = currentTime;
        }
      });
      
      // Zaktualizuj dokument
      await updateDoc(userSocialRef, {
        connectedPlatforms,
        lastUpdated: now,
        connectionHistory
      });
    } else {
      // Utwórz nowy dokument
      const currentTime = new Date();
      const connectionHistory = connectedPlatforms.map(platform => ({
        platform,
        connectedAt: currentTime
      }));
      
      await setDoc(userSocialRef, {
        address,
        connectedPlatforms,
        lastUpdated: now,
        firstConnected: now,
        connectionHistory
      });
    }
    
    console.log(`✅ Zapisano połączenia social media dla ${address}:`, connectedPlatforms);
  } catch (error) {
    console.error('❌ Błąd podczas zapisywania połączeń social media:', error);
    throw error;
  }
};

// Pobierz połączenia social media użytkownika z Firebase
export const getMySphereUserConnections = async (
  address: string
): Promise<MySphereUserSocialConnections | null> => {
  try {
    const userSocialRef = doc(db, 'mySphereUserSocials', address);
    const userSocialDoc = await getDoc(userSocialRef);
    
    if (userSocialDoc.exists()) {
      return userSocialDoc.data() as MySphereUserSocialConnections;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Błąd podczas pobierania połączeń social media:', error);
    return null;
  }
};

// Pobierz globalne statystyki MySphere z Firebase
export const getMySphereGlobalStats = async () => {
  try {
    // Pobierz wszystkich użytkowników z połączeniami social media
    const userSocialsRef = collection(db, 'mySphereUserSocials');
    const userSocialsSnapshot = await getDocs(userSocialsRef);
    
    const totalUsers = userSocialsSnapshot.size;
    
    // Zlicz połączenia per platforma
    const socialMediaConnections = {
      twitter: 0,
      discord: 0,
      spotify: 0,
      tiktok: 0,
      telegram: 0
    };
    
    // Zlicz dystrybucję połączeń
    const connectionDistribution = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0
    };
    
    let totalConnections = 0;
    
    userSocialsSnapshot.forEach(doc => {
      const userData = doc.data() as MySphereUserSocialConnections;
      const connectionCount = userData.connectedPlatforms?.length || 0;
      totalConnections += connectionCount;
      
      // Zlicz dystrybucję
      if (connectionCount >= 0 && connectionCount <= 5) {
        connectionDistribution[connectionCount as keyof typeof connectionDistribution]++;
      }
      
      // Zlicz per platforma
      userData.connectedPlatforms?.forEach(platform => {
        if (platform in socialMediaConnections) {
          socialMediaConnections[platform as keyof typeof socialMediaConnections]++;
        }
      });
    });
    
    const fullyConnectedUsers = connectionDistribution[5];
    const averageConnectionsPerUser = totalUsers > 0 ? (totalConnections / totalUsers) : 0;
    
    // Przygotuj dane dla wykresów
    const platformChartData = [
      { name: 'Twitter', value: socialMediaConnections.twitter, color: '#1DA1F2', icon: '🐦' },
      { name: 'Discord', value: socialMediaConnections.discord, color: '#7289DA', icon: '🎮' },
      { name: 'Spotify', value: socialMediaConnections.spotify, color: '#1DB954', icon: '🎵' },
      { name: 'TikTok', value: socialMediaConnections.tiktok, color: '#FF0050', icon: '🎬' },
      { name: 'Telegram', value: socialMediaConnections.telegram, color: '#0088CC', icon: '✈️' }
    ];
    
    const distributionChartData = [
      { connections: '0', users: connectionDistribution[0], percentage: totalUsers > 0 ? ((connectionDistribution[0] / totalUsers) * 100).toFixed(1) : '0' },
      { connections: '1', users: connectionDistribution[1], percentage: totalUsers > 0 ? ((connectionDistribution[1] / totalUsers) * 100).toFixed(1) : '0' },
      { connections: '2', users: connectionDistribution[2], percentage: totalUsers > 0 ? ((connectionDistribution[2] / totalUsers) * 100).toFixed(1) : '0' },
      { connections: '3', users: connectionDistribution[3], percentage: totalUsers > 0 ? ((connectionDistribution[3] / totalUsers) * 100).toFixed(1) : '0' },
      { connections: '4', users: connectionDistribution[4], percentage: totalUsers > 0 ? ((connectionDistribution[4] / totalUsers) * 100).toFixed(1) : '0' },
      { connections: '5', users: connectionDistribution[5], percentage: totalUsers > 0 ? ((connectionDistribution[5] / totalUsers) * 100).toFixed(1) : '0' }
    ];
    
    // Wygeneruj rzeczywiste dane trendu wzrostu (ostatnie 7 dni) na podstawie historii połączeń
    const growthTrendData = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateString = date.toISOString().split('T')[0];
      
      // Zlicz rzeczywiste połączenia dla każdego dnia
      let dailyStats = {
        date: dateString,
        users: 0,
        twitter: 0,
        discord: 0,
        spotify: 0,
        tiktok: 0,
        telegram: 0
      };
      
      userSocialsSnapshot.forEach(doc => {
        const userData = doc.data() as MySphereUserSocialConnections;
        const userFirstConnected = userData.firstConnected?.toDate?.() || new Date(userData.firstConnected);
        
        // Sprawdź czy użytkownik był aktywny w tym dniu
        if (userFirstConnected <= date) {
          dailyStats.users++;
          
          // Sprawdź każdą platformę w historii połączeń
          userData.connectionHistory?.forEach(connection => {
            const connectionDate = connection.connectedAt?.toDate?.() || new Date(connection.connectedAt);
            const disconnectionDate = connection.disconnectedAt?.toDate?.() || null;
            
            // Sprawdź czy połączenie było aktywne w tym dniu
            if (connectionDate <= date && (!disconnectionDate || disconnectionDate > date)) {
              switch (connection.platform) {
                case 'twitter': dailyStats.twitter++; break;
                case 'discord': dailyStats.discord++; break;
                case 'spotify': dailyStats.spotify++; break;
                case 'tiktok': dailyStats.tiktok++; break;
                case 'telegram': dailyStats.telegram++; break;
              }
            }
          });
        }
      });
      
      growthTrendData.push(dailyStats);
    }
    
    return {
      totalUsers,
      socialMediaConnections,
      fullyConnectedUsers,
      averageConnectionsPerUser: parseFloat(averageConnectionsPerUser.toFixed(1)),
      connectionDistribution,
      platformChartData,
      distributionChartData,
      growthTrendData,
      lastUpdated: new Date().toISOString(),
      dataSource: 'firebase-mysphere'
    };
  } catch (error) {
    console.error('❌ Błąd podczas pobierania globalnych statystyk MySphere:', error);
    throw error;
  }
};

// Pobierz ostatnich aktywnych użytkowników MySphere
export const getMySphereRecentUsers = async (limit: number = 10) => {
  try {
    const userSocialsRef = collection(db, 'mySphereUserSocials');
    const recentUsersQuery = query(
      userSocialsRef,
      firestoreOrderBy('lastUpdated', 'desc'),
      firestoreLimit(limit)
    );
    
    const snapshot = await getDocs(recentUsersQuery);
    return snapshot.docs.map(doc => {
      const data = doc.data() as MySphereUserSocialConnections;
      return {
        address: data.address,
        connectedPlatforms: data.connectedPlatforms || [],
        lastUpdated: data.lastUpdated,
        connectionCount: data.connectedPlatforms?.length || 0
      };
    });
  } catch (error) {
    console.error('❌ Błąd podczas pobierania ostatnich użytkowników:', error);
    return [];
  }
};

// Usuń wszystkie dane MySphere (funkcja czyszcząca dla testów)
export const clearMySphereData = async (): Promise<{success: boolean, deletedRecords: number}> => {
  try {
    const userSocialsRef = collection(db, 'mySphereUserSocials');
    const snapshot = await getDocs(userSocialsRef);
    
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    console.log(`🧹 Usunięto ${snapshot.size} rekordów MySphere`);
    return {
      success: true,
      deletedRecords: snapshot.size
    };
  } catch (error) {
    console.error('❌ Błąd podczas czyszczenia danych MySphere:', error);
    return {
      success: false,
      deletedRecords: 0
    };
  }
};

// --- End MySphere Social Media Tracking Functions ---

/*
🔥 FIREBASE INDEXES REQUIRED 🔥

Aby nowe funkcje optymalizacji działały poprawnie, musisz dodać te indeksy w Firebase Console:

1. Collection: users
   - Field: baseChatPoints.totalPoints (Descending)
   - Field: __name__ (Ascending)

2. Collection: users  
   - Field: postsCount (Descending)
   - Field: __name__ (Ascending)

Instrukcje:
1. Idź do Firebase Console > Firestore Database > Indexes
2. Kliknij "Create Index"
3. Dodaj powyższe indeksy

Alternatywnie uruchom aplikację - Firebase automatycznie zasugeruje indeksy w konsoli.

📊 OPTIMIZED FOR 1000 TOP USERS (vs previous 12k all users):
- 92% reduction in Firebase reads (1000 vs 12k)
- 5-minute cache TTL for fast repeat loads
- Smart localStorage cache with timestamp validation
- Admin can force refresh all 12k users via batch processing
*/

// Optymalizowana funkcja do pobierania tylko top użytkowników
export const getTopActiveUsers = async (limit: number = 1000) => {
  try {
    console.log(`📊 Fetching top ${limit} active users...`);
    
    // Query użytkowników posortowanych po baseChatPoints.totalPoints
    const usersRef = collection(db, 'users');
    const topUsersQuery = query(
      usersRef,
      where('baseChatPoints.totalPoints', '>', 0),
      firestoreOrderBy('baseChatPoints.totalPoints', 'desc'),
      firestoreLimit(limit)
    );
    
    const topUsersSnap = await getDocs(topUsersQuery);
    
    // Jeśli nie ma wystarczająco użytkowników z baseChatPoints, pobierz resztę
    if (topUsersSnap.size < limit) {
      const remainingLimit = limit - topUsersSnap.size;
      const fallbackQuery = query(
        usersRef,
        where('postsCount', '>', 0),
        firestoreOrderBy('postsCount', 'desc'),
        firestoreLimit(remainingLimit)
      );
      
      const fallbackSnap = await getDocs(fallbackQuery);
      
      // Połącz wyniki
      const allUsers = [...topUsersSnap.docs, ...fallbackSnap.docs];
      return allUsers;
    }
    
    return topUsersSnap.docs;
  } catch (error) {
    console.error('Error fetching top active users:', error);
    // Fallback - pobierz pierwszych {limit} użytkowników
    const usersRef = collection(db, 'users');
    const fallbackQuery = query(usersRef, firestoreLimit(limit));
    const fallbackSnap = await getDocs(fallbackQuery);
    return fallbackSnap.docs;
  }
};

// Funkcja dla admina do force refresh rankingu wszystkich użytkowników
export const refreshUserRankings = async (): Promise<{
  success: boolean;
  processedUsers: number;
  updatedUsers: number;
  error?: string;
}> => {
  try {
    console.log('🔄 Starting full user rankings refresh...');
    
    const usersRef = collection(db, 'users');
    const usersSnap = await getDocs(usersRef);
    
    let processedUsers = 0;
    let updatedUsers = 0;
    
    // Przetwarzaj użytkowników w batches po 10
    const batchSize = 10;
    const userDocs = usersSnap.docs;
    
    for (let i = 0; i < userDocs.length; i += batchSize) {
      const batch = userDocs.slice(i, i + batchSize);
      
      // Przetwórz batch równolegle
      await Promise.all(batch.map(async (docSnapshot) => {
        try {
          const data = docSnapshot.data();
          processedUsers++;
          
          // Oblicz punkty
          const stats = {
            posts: data.postsCount || 0,
            likes: data.likesReceived || 0
          };
          const postPoints = stats.posts * 5;
          const likePoints = stats.likes;
          const basePoints = postPoints + likePoints;
          const activityBonus = Math.round(basePoints * 0.25);
          const totalPoints = basePoints + activityBonus;
          
          // Aktualizuj tylko jeśli punkty się zmieniły
          const currentPoints = data.baseChatPoints?.totalPoints || 0;
          if (Math.abs(currentPoints - totalPoints) > 1) {
            const userRef = doc(db, 'users', docSnapshot.id);
            await updateDoc(userRef, {
              'baseChatPoints.postPoints': postPoints,
              'baseChatPoints.likePoints': likePoints,
              'baseChatPoints.activityBonus': activityBonus,
              'baseChatPoints.totalPoints': totalPoints,
              'baseChatPoints.lastUpdated': serverTimestamp()
            });
            updatedUsers++;
          }
        } catch (error) {
          console.error(`Error processing user ${docSnapshot.id}:`, error);
        }
      }));
      
      // Krótka pauza między batch'ami
      if (i + batchSize < userDocs.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Log progress co 100 użytkowników
      if (processedUsers % 100 === 0) {
        console.log(`📊 Processed ${processedUsers}/${userDocs.length} users...`);
      }
    }
    
    console.log(`✅ Rankings refresh completed: ${processedUsers} processed, ${updatedUsers} updated`);
    
    return {
      success: true,
      processedUsers,
      updatedUsers
    };
  } catch (error) {
    console.error('❌ Error refreshing user rankings:', error);
    return {
      success: false,
      processedUsers: 0,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Cache dla aktywnych użytkowników z TTL
let cachedActiveUsers: any[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minut

export const getCachedActiveUsers = async (limit: number = 1000, forceRefresh: boolean = false) => {
  const now = Date.now();
  
  // Użyj cache jeśli jest świeży i nie force refresh
  if (!forceRefresh && cachedActiveUsers.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('📋 Using cached active users (up to 1000)');
    return cachedActiveUsers.slice(0, limit);
  }
  
  console.log('🔄 Refreshing active users cache...');
  
  try {
    const userDocs = await getTopActiveUsers(Math.min(limit * 1.2, 1200)); // Pobierz 20% więcej dla lepszego cache'u, max 1200
    
    const users = userDocs.map(docSnapshot => {
      const data = docSnapshot.data();
      const lastActive = data.lastActive ? new Date(data.lastActive).getTime() : Date.now();
      
      let totalPoints = 0;
      if (data.baseChatPoints && typeof data.baseChatPoints === 'object') {
        totalPoints = data.baseChatPoints.totalPoints || 0;
      } else {
        const stats = {
          posts: data.postsCount || 0,
          likes: data.likesReceived || 0
        };
        const postPoints = stats.posts * 5;
        const likePoints = stats.likes;
        const basePoints = postPoints + likePoints;
        const activityBonus = Math.round(basePoints * 0.25);
        totalPoints = basePoints + activityBonus;
      }
      
      const userName = data.name || (data.baseName ? `${data.baseName}.base.eth` : docSnapshot.id.slice(0, 6) + '...' + docSnapshot.id.slice(-4));
      
      return {
        address: docSnapshot.id,
        points: userName === 'vitalik.eth' ? 5000 : totalPoints,
        stats: {
          posts: data.postsCount || 0,
          likes: data.likesReceived || 0
        },
        lastActive: lastActive,
        name: userName,
        avatar: data.avatar
      };
    });
    
    // Sortuj po punktach
    const sortedUsers = users.sort((a, b) => {
      if (a.name === 'vitalik.eth') return -1;
      if (b.name === 'vitalik.eth') return 1;
      return b.points - a.points;
    });
    
    // Aktualizuj cache
    cachedActiveUsers = sortedUsers;
    cacheTimestamp = now;
    
    console.log(`✅ Active users cache updated: ${sortedUsers.length}/1000 users`);
    return sortedUsers.slice(0, limit);
  } catch (error) {
    console.error('❌ Error updating active users cache:', error);
    return cachedActiveUsers.slice(0, limit); // Zwróć stary cache w przypadku błędu
  }
};