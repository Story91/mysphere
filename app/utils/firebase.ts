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
  orderBy,
  serverTimestamp,
  increment,
  Timestamp,
  arrayUnion,
  arrayRemove,
  limit,
  writeBatch,
  deleteField,
  deleteDoc
} from 'firebase/firestore';
import { UserProfile } from '../types';

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

const convertTimestamp = (timestamp: Timestamp): number => {
  return timestamp.toMillis();
};

// Zaawansowany system lajków
export const toggleLike = async (postId: string, userId: string): Promise<boolean> => {
  try {
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);

    if (!postDoc.exists()) {
      throw new Error('Post nie istnieje');
    }

    const postData = postDoc.data();
    const authorRef = doc(db, 'users', postData.author);
    const likedBy = postData.likedBy || [];
    const isLiked = likedBy.includes(userId);
    
    const batch = writeBatch(db);

    if (isLiked) {
      // Usuń lajka
      batch.update(postRef, {
        likes: increment(-1),
        likedBy: arrayRemove(userId)
      });
      batch.update(authorRef, {
        likesReceived: increment(-1),
        lastActive: serverTimestamp()
      });
      
      await batch.commit();
      return false;
    } else {
      // Dodaj lajka
      batch.update(postRef, {
        likes: increment(1),
        likedBy: arrayUnion(userId)
      });
      batch.update(authorRef, {
        likesReceived: increment(1),
        lastActive: serverTimestamp()
      });
      
      await batch.commit();
      return true;
    }
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
    orderBy('timestamp', 'desc'),
    limit(20)
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
}): Promise<string> => {
  const postsRef = collection(db, 'posts');
  
  // Najpierw pobierz nazwę użytkownika
  const userName = await getUserName(post.author);
  
  // Wykryj wzmianki w treści
  const mentionRegex = /@(\w+)/g;
  const mentionsFromContent = (post.content.match(mentionRegex) || [])
    .map(m => m.slice(1));
  const mentions = Array.from(
    new Set([...(post.mentions || []), ...mentionsFromContent])
  );

  // Wykryj hashtagi w treści
  const hashtagRegex = /#(\w+)/g;
  const hashtagsFromContent = (post.content.match(hashtagRegex) || [])
    .map(h => h.slice(1));
  const hashtags = Array.from(
    new Set([...(post.tags || []), ...hashtagsFromContent])
  );

  const docRef = await addDoc(postsRef, {
    ...post,
    authorName: userName,
    timestamp: serverTimestamp(),
    likes: 0,
    likedBy: [],
    comments: [],
    shares: 0,
    tags: hashtags,
    mentions: mentions,
    visibility: post.visibility || 'public',
    image: post.image || null,
    video: post.video || null
  });

  // Aktualizuj statystyki użytkownika
  const userRef = doc(db, 'users', post.author);
  await updateDoc(userRef, {
    postsCount: increment(1),
    lastActive: serverTimestamp(),
    'stats.posts': increment(1)
  });

  return docRef.id;
};

// Pobierz wszystkie posty z zaawansowaną filtracją
export const fetchPosts = async (options: {
  userId?: string;
  tag?: string;
  author?: string;
  limit?: number;
  startAfter?: number;
} = {}) => {
  const postsRef = collection(db, 'posts');
  let constraints: any[] = [orderBy('timestamp', 'desc')];

  if (options.tag) {
    constraints.push(where('tags', 'array-contains', options.tag));
  }

  if (options.author) {
    constraints.push(where('author', '==', options.author));
  }

  if (options.limit) {
    constraints.push(limit(options.limit));
  }

  const q = query(postsRef, ...constraints);
  const snapshot = await getDocs(q);
  
  const posts = await Promise.all(snapshot.docs.map(async (doc) => {
    const postData = doc.data();
    const likedBy = postData.likedBy || [];
    
    // Pobierz nazwę autora posta
    const authorName = await getUserName(postData.author);
    
    // Pobierz nazwy autorów komentarzy
    const comments = await Promise.all((postData.comments || []).map(async (comment: any) => {
      const commentAuthorName = await getUserName(comment.author);
      return {
        ...comment,
        authorName: commentAuthorName
      };
    }));

    return {
      id: doc.id,
      author: postData.author,
      authorName: authorName,
      content: postData.content,
      likes: postData.likes || 0,
      likedBy: likedBy,
      image: postData.image || null,
      video: postData.video || null,
      timestamp: convertTimestamp(postData.timestamp as Timestamp),
      comments: comments,
      tags: postData.tags || [],
      mentions: postData.mentions || [],
      shares: postData.shares || 0,
      visibility: postData.visibility || 'public'
    };
  }));

  return posts;
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
    mentions: []
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
export const fetchUserProfile = async (address: string): Promise<UserProfile | null> => {
  try {
    const userRef = doc(db, 'users', address);
    const userDoc = await getDoc(userRef);
    
    // Get actual posts count
    const postsRef = collection(db, 'posts');
    const postsQuery = query(postsRef, where('author', '==', address));
    const postsSnapshot = await getDocs(postsQuery);
    const actualPostsCount = postsSnapshot.size;
    
    if (userDoc.exists()) {
      const data = userDoc.data();
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
export const saveProfileName = async (address: string, name: string) => {
  try {
    const userRef = doc(db, 'usernames', address);
    const isBaseName = name.endsWith('.base.eth');
    
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
      isBaseName
    });
    
    // Zaktualizuj też profil użytkownika
    const profileRef = doc(db, 'users', address);
    await setDoc(profileRef, {
      name,
      lastUpdated: serverTimestamp()
    }, { merge: true });
    
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
      
      // Sprawdź czy użytkownik ma BaseName
      if (usernameDoc.exists() && usernameDoc.data().isBaseName) {
        name = usernameDoc.data().name;
      }
      
      // Pobierz dane z profilu użytkownika
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (!name) {
          name = userData.name;
        }
        avatar = userData.avatar;
      }
      
      // Jeśli nie ma żadnej nazwy, użyj skróconego adresu
      if (!name) {
        name = `${address.slice(0, 6)}...${address.slice(-4)}`;
      }
      
      userInfo[address] = { name, avatar };
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

// Funkcja do usuwania komentarza
export const deleteComment = async (postId: string, commentId: string) => {
  try {
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    const comments = postData.comments || [];
    
    // Usuń komentarz z tablicy
    const updatedComments = comments.filter((c: any) => c.id !== commentId);
    
    // Zapisz zaktualizowane komentarze
    await updateDoc(postRef, { comments: updatedComments });
    
    return true;
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
};

// Funkcja do przełączania polubienia komentarza
export const toggleCommentLike = async (postId: string, commentId: string, userId: string) => {
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
    
    const comment = comments[commentIndex];
    const likedBy = comment.likedBy || [];
    const isLiked = likedBy.includes(userId);
    
    // Aktualizuj komentarz
    comments[commentIndex] = {
      ...comment,
      likes: (comment.likes || 0) + (isLiked ? -1 : 1),
      likedBy: isLiked 
        ? likedBy.filter((id: string) => id !== userId)
        : [...likedBy, userId]
    };
    
    // Zapisz zaktualizowane komentarze
    await updateDoc(postRef, { comments });
    
    return true;
  } catch (error) {
    console.error('Error toggling comment like:', error);
    throw error;
  }
};

export const addCommentReply = async (postId: string, commentId: string, replyData: { author: string, content: string }) => {
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

    // Utwórz nową odpowiedź
    const newReply = {
      id: generateId(),
      author: replyData.author,
      content: replyData.content,
      timestamp: Date.now(),
      likes: 0,
      likedBy: [],
      replyTo: commentId // Dodaj referencję do komentarza nadrzędnego
    };

    // Dodaj odpowiedź do tablicy komentarzy
    comments.push(newReply);

    // Zaktualizuj dokument
    await updateDoc(postRef, {
      comments: comments
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
  const usersRef = collection(db, 'usernames');
  let queryRef;

  if (searchQuery && searchQuery.length >= 3) {
    // Wyszukiwanie po frazie
    queryRef = query(
      usersRef,
      where('isBaseName', '==', true),
      where('name', '>=', searchQuery),
      where('name', '<=', searchQuery + '\uf8ff'),
      limit(10)
    );
  } else {
    // Pobierz wszystkich użytkowników z BaseName i wybierz losowych 10
    queryRef = query(
      usersRef,
      where('isBaseName', '==', true),
      limit(50) // Pobieramy więcej, żeby potem wylosować z nich 10
    );
  }
  
  const snapshot = await getDocs(queryRef);
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
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const queryRef = query(
    messagesRef,
    orderBy('timestamp', 'desc'),
    limit(messageLimit)
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
  const chatsRef = collection(db, 'chats');
  const queryRef = query(
    chatsRef,
    where('participants', 'array-contains', userId),
    orderBy('lastMessageTime', 'desc')
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
    const requestsQuery = query(
      collection(db, 'friendRequests'),
      where('to', '==', userAddress),
      where('status', '==', 'pending'),
      orderBy('timestamp', 'desc')
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
      orderBy('timestamp', 'desc')
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

    // Calculate total points
    // Base formula: (posts * 5) + (likes * 1)
    const points = ((totalPosts * 5) + totalLikes) * recentActivityBonus;

    // Update user statistics
    const userRef = doc(db, 'users', userAddress);
    await updateDoc(userRef, {
      postsCount: totalPosts,
      likesReceived: totalLikes,
      lastCalculated: serverTimestamp(),
      'stats.posts': totalPosts,
      'stats.likes': totalLikes,
      'stats.points': Math.round(points)
    });

    return {
      posts: totalPosts,
      likes: totalLikes,
      points: Math.round(points),
      hasRecentActivity: recentActivityBonus > 1
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
    const userStats: { [key: string]: { posts: number, likes: number } } = {};
    
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
        userStats[post.author] = { posts: 0, likes: 0 };
      }
      userStats[post.author].posts++;
      userStats[post.author].likes += actualLikes;
    }
    
    // Aktualizuj statystyki użytkowników
    for (const [userId, stats] of Object.entries(userStats)) {
      const userRef = doc(db, 'users', userId);
      batch.update(userRef, {
        postsCount: stats.posts,
        likesReceived: stats.likes,
        lastCalculated: serverTimestamp(),
        'stats.posts': stats.posts,
        'stats.likes': stats.likes,
        'stats.points': Math.round((stats.posts * 5 + stats.likes) * 1.25)
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
      orderBy('timestamp', 'desc')
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
      orderBy('timestamp', 'desc')
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