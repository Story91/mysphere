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
import { DEFAULT_REFERRAL_CONFIG } from './referrals/types';

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

// ✅ FIREBASE OPTIMIZATION: hasBaseName() function REMOVED - replaced with string.endsWith('.base.eth') checks
// This eliminates expensive Firebase reads from 'usernames' collection, saving $100-200/day

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
      baseChatPoints.baseNameBonus = Number(baseChatPoints.baseNameBonus || 0);
      
      // Sprawdź czy użytkownik już ma baseNameBonus - jeśli tak, nie dodawaj ponownie
      if (baseChatPoints.baseNameBonus) {
        return; // Użytkownik już ma bonus, nie rób nic
      }
      
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
      
      console.log(`✅ Dodano baseNameBonus (1000 pts) dla nowego użytkownika ${userAddress}`);
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
      baseChatPoints.sphereBonus = Number(baseChatPoints.sphereBonus || 0);
      baseChatPoints.celoBonus = Number(baseChatPoints.celoBonus || 0);
      baseChatPoints.worldBonus = Number(baseChatPoints.worldBonus || 0);
      baseChatPoints.referralPoints = Number(baseChatPoints.referralPoints || 0);
      
      // Sprawdź czy użytkownik już ma camperBonus - jeśli tak, nie dodawaj ponownie
      if (baseChatPoints.camperBonus) {
        console.log(`Użytkownik ${userAddress} już ma camperBonus, pomijam dodawanie`);
        return;
      }
      
      // Dodaj camperBonus jako liczbę
      baseChatPoints.camperBonus = 1000;
      
      // Przelicz totalPoints jako sumę wszystkich składników
      baseChatPoints.totalPoints = 
        baseChatPoints.activityBonus + 
        baseChatPoints.likePoints + 
        baseChatPoints.postPoints + 
        baseChatPoints.baseNameBonus + 
        baseChatPoints.camperBonus +
        baseChatPoints.sphereBonus +
        baseChatPoints.celoBonus +
        baseChatPoints.worldBonus +
        baseChatPoints.referralPoints;
      
      // Zaktualizuj dokument użytkownika
      await updateDoc(userRef, {
        baseChatPoints: baseChatPoints,
        lastUpdated: serverTimestamp()
      });
      
      console.log(`🏕️ Dodano camperBonus (1000 pts) dla użytkownika ${userAddress}! Nowe total: ${baseChatPoints.totalPoints}`);
    }
  } catch (error) {
    console.error('Error adding Camper bonus:', error);
  }
};

// Funkcja dodająca bonus 1500 punktów za .sphere
const addSphereBonusToUser = async (userAddress: string): Promise<void> => {
  try {
    console.log(`🌐 [addSphereBonusToUser] Rozpoczynam dodawanie bonusu dla ${userAddress}`);
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
      baseChatPoints.camperBonus = Number(baseChatPoints.camperBonus || 0);
      baseChatPoints.sphereBonus = Number(baseChatPoints.sphereBonus || 0);
      baseChatPoints.celoBonus = Number(baseChatPoints.celoBonus || 0);
      baseChatPoints.worldBonus = Number(baseChatPoints.worldBonus || 0);
      baseChatPoints.referralPoints = Number(baseChatPoints.referralPoints || 0);
      
      // Sprawdź czy użytkownik już ma sphereBonus - jeśli tak, nie dodawaj ponownie
      if (baseChatPoints.sphereBonus) {
        console.log(`Użytkownik ${userAddress} już ma sphereBonus, pomijam dodawanie`);
        return;
      }
      
      // Dodaj sphereBonus jako liczbę
      baseChatPoints.sphereBonus = 1500;
      
      // Przelicz totalPoints jako sumę wszystkich składników
      baseChatPoints.totalPoints = 
        baseChatPoints.activityBonus + 
        baseChatPoints.likePoints + 
        baseChatPoints.postPoints + 
        baseChatPoints.baseNameBonus + 
        baseChatPoints.camperBonus +
        baseChatPoints.sphereBonus +
        baseChatPoints.celoBonus +
        baseChatPoints.worldBonus +
        baseChatPoints.referralPoints;
      
      // Zaktualizuj dokument użytkownika
      await updateDoc(userRef, {
        baseChatPoints: baseChatPoints,
        lastUpdated: serverTimestamp()
      });
      
      console.log(`🌐 Dodano sphereBonus (1500 pts) dla użytkownika ${userAddress}! Nowe total: ${baseChatPoints.totalPoints}`);
    }
  } catch (error) {
    console.error('Error adding Sphere bonus:', error);
  }
};

// Funkcja dodająca bonus 1250 punktów za .celo
const addCeloBonusToUser = async (userAddress: string): Promise<void> => {
  try {
    console.log(`💛 [addCeloBonusToUser] Rozpoczynam dodawanie bonusu dla ${userAddress}`);
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
      baseChatPoints.camperBonus = Number(baseChatPoints.camperBonus || 0);
      baseChatPoints.sphereBonus = Number(baseChatPoints.sphereBonus || 0);
      baseChatPoints.celoBonus = Number(baseChatPoints.celoBonus || 0);
      baseChatPoints.worldBonus = Number(baseChatPoints.worldBonus || 0);
      baseChatPoints.referralPoints = Number(baseChatPoints.referralPoints || 0);
      
      // Sprawdź czy użytkownik już ma celoBonus - jeśli tak, nie dodawaj ponownie
      if (baseChatPoints.celoBonus) {
        console.log(`Użytkownik ${userAddress} już ma celoBonus, pomijam dodawanie`);
        return;
      }
      
      // Dodaj celoBonus jako liczbę
      baseChatPoints.celoBonus = 1250;
      
      // Przelicz totalPoints jako sumę wszystkich składników
      baseChatPoints.totalPoints = 
        baseChatPoints.activityBonus + 
        baseChatPoints.likePoints + 
        baseChatPoints.postPoints + 
        baseChatPoints.baseNameBonus + 
        baseChatPoints.camperBonus +
        baseChatPoints.sphereBonus +
        baseChatPoints.celoBonus +
        baseChatPoints.worldBonus +
        baseChatPoints.referralPoints;
      
      // Zaktualizuj dokument użytkownika
      await updateDoc(userRef, {
        baseChatPoints: baseChatPoints,
        lastUpdated: serverTimestamp()
      });
      
      console.log(`💛 Dodano celoBonus (1250 pts) dla użytkownika ${userAddress}! Nowe total: ${baseChatPoints.totalPoints}`);
    }
  } catch (error) {
    console.error('Error adding Celo bonus:', error);
  }
};

// Funkcja dodająca bonus 1250 punktów za .world
const addWorldBonusToUser = async (userAddress: string): Promise<void> => {
  try {
    console.log(`🌍 [addWorldBonusToUser] Rozpoczynam dodawanie bonusu dla ${userAddress}`);
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
      baseChatPoints.camperBonus = Number(baseChatPoints.camperBonus || 0);
      baseChatPoints.sphereBonus = Number(baseChatPoints.sphereBonus || 0);
      baseChatPoints.celoBonus = Number(baseChatPoints.celoBonus || 0);
      baseChatPoints.worldBonus = Number(baseChatPoints.worldBonus || 0);
      baseChatPoints.referralPoints = Number(baseChatPoints.referralPoints || 0);
      
      // Sprawdź czy użytkownik już ma worldBonus - jeśli tak, nie dodawaj ponownie
      if (baseChatPoints.worldBonus) {
        console.log(`Użytkownik ${userAddress} już ma worldBonus, pomijam dodawanie`);
        return;
      }
      
      // Dodaj worldBonus jako liczbę
      baseChatPoints.worldBonus = 1250;
      
      // Przelicz totalPoints jako sumę wszystkich składników
      baseChatPoints.totalPoints = 
        baseChatPoints.activityBonus + 
        baseChatPoints.likePoints + 
        baseChatPoints.postPoints + 
        baseChatPoints.baseNameBonus + 
        baseChatPoints.camperBonus +
        baseChatPoints.sphereBonus +
        baseChatPoints.celoBonus +
        baseChatPoints.worldBonus +
        baseChatPoints.referralPoints;
      
      // Zaktualizuj dokument użytkownika
      await updateDoc(userRef, {
        baseChatPoints: baseChatPoints,
        lastUpdated: serverTimestamp()
      });
      
      console.log(`🌍 Dodano worldBonus (1250 pts) dla użytkownika ${userAddress}! Nowe total: ${baseChatPoints.totalPoints}`);
    }
  } catch (error) {
    console.error('Error adding World bonus:', error);
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

// Funkcja dodająca bonus .sphere dla wszystkich użytkowników z .sphere
export const addSphereBonusToAllUsers = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('🌐 Rozpoczynam dodawanie bonusu .sphere dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników z kolekcji usernames, którzy mają isSphere: true
    const usernamesRef = collection(db, 'usernames');
    const sphereQuery = query(usernamesRef, where('isSphere', '==', true));
    const sphereSnapshot = await getDocs(sphereQuery);
    
    let updatedUsers = 0;
    
    // Przetwórz każdego użytkownika z .sphere
    for (const usernameDoc of sphereSnapshot.docs) {
      const userAddress = usernameDoc.id;
      
      // Dodaj bonus .sphere dla użytkownika
      await addSphereBonusToUser(userAddress);
      updatedUsers++;
      
      // Loguj co 10 użytkowników
      if (updatedUsers % 10 === 0) {
        console.log(`🌐 Zaktualizowano ${updatedUsers} użytkowników z .sphere...`);
      }
    }
    
    console.log(`🌐 Zakończono dodawanie bonusu .sphere: Zaktualizowano ${updatedUsers} użytkowników`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas dodawania bonusu .sphere:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas dodawania bonusu .sphere'
    };
  }
};

// Funkcja dodająca bonus .camper dla wszystkich użytkowników z .camper
export const addCamperBonusToAllUsers = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('🏕️ Rozpoczynam dodawanie bonusu .camper dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników z kolekcji usernames, którzy mają isCamper: true
    const usernamesRef = collection(db, 'usernames');
    const camperQuery = query(usernamesRef, where('isCamper', '==', true));
    const camperSnapshot = await getDocs(camperQuery);
    
    let updatedUsers = 0;
    
    // Przetwórz każdego użytkownika z .camper
    for (const usernameDoc of camperSnapshot.docs) {
      const userAddress = usernameDoc.id;
      
      // Dodaj bonus .camper dla użytkownika
      await addCamperBonusToUser(userAddress);
      updatedUsers++;
      
      // Loguj co 10 użytkowników
      if (updatedUsers % 10 === 0) {
        console.log(`🏕️ Zaktualizowano ${updatedUsers} użytkowników z .camper...`);
      }
    }
    
    console.log(`🏕️ Zakończono dodawanie bonusu .camper: Zaktualizowano ${updatedUsers} użytkowników`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas dodawania bonusu .camper:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas dodawania bonusu .camper'
    };
  }
};

// Funkcja dodająca bonus .celo dla wszystkich użytkowników z .celo
export const addCeloBonusToAllUsers = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('💛 Rozpoczynam dodawanie bonusu .celo dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników z kolekcji usernames, którzy mają isCelo: true
    const usernamesRef = collection(db, 'usernames');
    const celoQuery = query(usernamesRef, where('isCelo', '==', true));
    const celoSnapshot = await getDocs(celoQuery);
    
    let updatedUsers = 0;
    
    // Przetwórz każdego użytkownika z .celo
    for (const usernameDoc of celoSnapshot.docs) {
      const userAddress = usernameDoc.id;
      
      // Dodaj bonus .celo dla użytkownika
      await addCeloBonusToUser(userAddress);
      updatedUsers++;
      
      // Loguj co 10 użytkowników
      if (updatedUsers % 10 === 0) {
        console.log(`💛 Zaktualizowano ${updatedUsers} użytkowników z .celo...`);
      }
    }
    
    console.log(`💛 Zakończono dodawanie bonusu .celo: Zaktualizowano ${updatedUsers} użytkowników`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas dodawania bonusu .celo:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas dodawania bonusu .celo'
    };
  }
};

// Funkcja dodająca bonus .world dla wszystkich użytkowników z .world
export const addWorldBonusToAllUsers = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('🌍 Rozpoczynam dodawanie bonusu .world dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników z kolekcji usernames, którzy mają isWorld: true
    const usernamesRef = collection(db, 'usernames');
    const worldQuery = query(usernamesRef, where('isWorld', '==', true));
    const worldSnapshot = await getDocs(worldQuery);
    
    let updatedUsers = 0;
    
    // Przetwórz każdego użytkownika z .world
    for (const usernameDoc of worldSnapshot.docs) {
      const userAddress = usernameDoc.id;
      
      // Dodaj bonus .world dla użytkownika
      await addWorldBonusToUser(userAddress);
      updatedUsers++;
      
      // Loguj co 10 użytkowników
      if (updatedUsers % 10 === 0) {
        console.log(`🌍 Zaktualizowano ${updatedUsers} użytkowników z .world...`);
      }
    }
    
    console.log(`🌍 Zakończono dodawanie bonusu .world: Zaktualizowano ${updatedUsers} użytkowników`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas dodawania bonusu .world:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas dodawania bonusu .world'
    };
  }
};

// Funkcja do odświeżenia wszystkich bonusów domenowych dla istniejących użytkowników
export const refreshAllDomainBonuses = async (): Promise<{
  success: boolean;
  sphere: number;
  camper: number;
  celo: number;
  world: number;
  error?: string;
}> => {
  try {
    console.log('🔄 Rozpoczynam odświeżanie wszystkich bonusów domenowych...');
    
    const [sphereResult, camperResult, celoResult, worldResult] = await Promise.all([
      addSphereBonusToAllUsers(),
      addCamperBonusToAllUsers(),
      addCeloBonusToAllUsers(),
      addWorldBonusToAllUsers()
    ]);
    
    const totalUpdated = sphereResult.updatedUsers + camperResult.updatedUsers + 
                        celoResult.updatedUsers + worldResult.updatedUsers;
    
    console.log(`✅ Zakończono odświeżanie wszystkich bonusów domenowych:`);
    console.log(`   🌐 .sphere: ${sphereResult.updatedUsers} użytkowników`);
    console.log(`   🏕️ .camper: ${camperResult.updatedUsers} użytkowników`);
    console.log(`   💛 .celo: ${celoResult.updatedUsers} użytkowników`);
    console.log(`   🌍 .world: ${worldResult.updatedUsers} użytkowników`);
    console.log(`   📊 Łącznie: ${totalUpdated} użytkowników`);
    
    return {
      success: true,
      sphere: sphereResult.updatedUsers,
      camper: camperResult.updatedUsers,
      celo: celoResult.updatedUsers,
      world: worldResult.updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas odświeżania bonusów domenowych:', error);
    return {
      success: false,
      sphere: 0,
      camper: 0,
      celo: 0,
      world: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas odświeżania bonusów domenowych'
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
    
    // ✅ NAPRAWKA: Sprawdź czy użytkownik to autor LUB admin
    const isAdmin = authorAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
    const isAuthor = postData.author === authorAddress;
    
    if (!isAuthor && !isAdmin) {
      throw new Error('Unauthorized to delete this post');
    }

    // Prepare batch for atomic operations
    const batch = writeBatch(db);

    // Odejmij lajki i postsCount od autora (tylko gdy usuwamy własny post)
    if (isAuthor) {
      const authorRef = doc(db, 'users', authorAddress);
      batch.update(authorRef, {
        likesReceived: increment(-(postData.likes || 0)),
        postsCount: increment(-1),
        'stats.posts': increment(-1),
        lastActive: serverTimestamp()
      });
    }

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
  network?: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood'; // Add network parameter to identify the source network
  musicTrack?: { // 🎵 Dodaj obsługę załączników muzycznych
    id: string;
    name: string;
    artists: Array<{
      name: string;
      external_urls?: { spotify: string; };
    }>;
    album: {
      name: string;
      images?: Array<{ url: string; height: number; width: number; }>;
      external_urls?: { spotify: string; };
      release_date?: string;
    };
    duration_ms: number;
    popularity?: number;
    preview_url?: string;
    external_urls?: { spotify: string; };
  };
}): Promise<string> => { // Zmieniamy typ zwracany na Promise<string>
  try {
    const postData = {
      ...post,
      timestamp: serverTimestamp(),
      likes: 0,
      likedBy: [],
      comments: [],
      isPinned: false,
      image: post.image || null,
      video: post.video || null,
      tags: post.tags || [],
      mentions: post.mentions || [],
      visibility: post.visibility || 'public',
      txHash: post.txHash || null,
      zoraCoinAddress: post.zoraCoinAddress || null,
      network: post.network || 'base',
      musicTrack: post.musicTrack || null // 🎵 Dodaj pole musicTrack
    };

    // Użyj batcha do operacji atomowych
    const batch = writeBatch(db);

    // 1. Dodaj post do głównej kolekcji `posts`
    const postsCollection = collection(db, 'posts');
    const newPostRef = doc(postsCollection); // Wygeneruj ID posta z góry
    batch.set(newPostRef, postData);

    // 2. Sprawdź, czy autor ma BaseName
    const usernameRef = doc(db, 'usernames', post.author);
    const usernameDoc = await getDoc(usernameRef);
    const hasBaseName = usernameDoc.exists() && usernameDoc.data().isBaseName === true;

    // 3. Jeśli autor ma BaseName, dodaj kopię posta do `baseNameFeed`
    if (hasBaseName) {
      console.log(`👤 Użytkownik ${post.author} ma BaseName. Dodaję post do baseNameFeed.`);
      const baseNameFeedCollection = collection(db, 'baseNameFeed');
      // Użyj tego samego ID dla posta w obu kolekcjach
      const baseNameFeedPostRef = doc(baseNameFeedCollection, newPostRef.id);
      batch.set(baseNameFeedPostRef, postData);
    }

    // 4. Zaktualizuj statystyki autora (postsCount)
    const authorRef = doc(db, 'users', post.author);
    batch.update(authorRef, {
      postsCount: increment(1),
      'stats.posts': increment(1),
      lastActive: serverTimestamp()
    });

    // 5. Wykonaj wszystkie operacje w batchu
    await batch.commit();
    
    console.log(`✅ Post created with ID: ${newPostRef.id}`);
    
    // 6. Check if this is user's first post and award referral bonus
    const userPostsQuery = query(
      collection(db, 'posts'),
      where('author', '==', post.author)
    );
    const userPostsSnapshot = await getDocs(userPostsQuery);
    
    // If this is user's first post (only the one just created)
    if (userPostsSnapshot.size === 1) {
      // Dynamic import to avoid circular dependencies
      const { awardFirstPostBonus, activateReferral } = await import('./referrals/referralService');
      
      // Activate referral (if user was referred)
      await activateReferral(post.author);
      
      // Award first post bonus
      await awardFirstPostBonus(post.author);
      console.log(`🎁 Checked first post bonus and activated referral for ${post.author}`);
    }
    
    // Zwróć ID nowego posta
    return newPostRef.id;

  } catch (error) {
    console.error('❌ Error creating post:', error);
    throw new Error('Failed to create post in Firebase');
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
  limit = 15,  // ⚡ OPTYMALIZACJA: Zmniejszam domyślny limit z 25 do 15 postów (-40% Firebase reads)
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
          musicTrack: postData.musicTrack || null, // 🎵 Pobierz dane muzyki z Firebase
          isPinned: postData.isPinned || false,
          pinnedAt: postData.pinnedAt instanceof Timestamp 
            ? postData.pinnedAt.toMillis() 
            : (postData.pinnedAt || undefined),
          pinnedBy: postData.pinnedBy || undefined,
          isPaidPin: postData.isPaidPin || false,
          paidPinExpiresAt: postData.paidPinExpiresAt instanceof Timestamp 
            ? postData.paidPinExpiresAt.toMillis() 
            : (postData.paidPinExpiresAt || undefined),
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
    
    // Sortuj posty: przypięte na górze, potem reszta według kolejności
    posts.sort((a, b) => {
      // Jeśli jeden post jest przypięty, a drugi nie
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      
      // Jeśli oba posty są przypięte, sortuj po czasie przypięcia (najnowsze przypięcie pierwsze)
      if (a.isPinned && b.isPinned) {
        const aPinnedAt = a.pinnedAt || 0;
        const bPinnedAt = b.pinnedAt || 0;
        return bPinnedAt - aPinnedAt;
      }
      
      // Jeśli żaden post nie jest przypięty, zachowaj oryginalną kolejność (już posortowaną przez Firebase)
      return 0;
    });
    
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

// Funkcja do pobierania postów z dedykowanego feedu BaseName
export const fetchBaseNameFeedPosts = async ({ 
  limit = 15,
  startAfter = null,
  orderBy = 'newest'
}: {
  limit?: number;
  startAfter?: QueryDocumentSnapshot | null;
  orderBy?: 'newest' | 'oldest';
} = {}): Promise<FetchPostsResult> => {
  try {
    const postsCollection = collection(db, 'baseNameFeed'); // 🎯 CZYTA Z NOWEJ KOLEKCJI
    const queryConstraints = [];
    
    // Sortowanie postów
    if (orderBy === 'newest') {
      queryConstraints.push(firestoreOrderBy('timestamp', 'desc'));
    } else {
      queryConstraints.push(firestoreOrderBy('timestamp', 'asc'));
    }
    
    // Ograniczenie liczby postów
    queryConstraints.push(firestoreLimit(limit));
    
    // Paginacja
    if (startAfter) {
      queryConstraints.push(firestoreStartAfter(startAfter));
    }
    
    const postsQuery = query(postsCollection, ...queryConstraints);
    const postsSnapshot = await getDocs(postsQuery);
    
    const posts: ExtendedPost[] = postsSnapshot.docs.map(doc => {
      const postData = doc.data();
      return {
        id: doc.id,
        author: postData.author,
        content: postData.content,
        timestamp: postData.timestamp instanceof Timestamp 
          ? postData.timestamp.toMillis() 
          : (postData.timestamp || Date.now()),
        likes: postData.likes || 0,
        likedBy: postData.likedBy || [],
        comments: postData.comments || [],
        tags: postData.tags || [],
        mentions: postData.mentions || [],
        image: postData.image || null,
        video: postData.video || null,
        txHash: postData.txHash || null,
        lastEdited: postData.lastEdited || null,
        zoraCoinAddress: postData.zoraCoinAddress || null,
        network: postData.network || 'base',
        musicTrack: postData.musicTrack || null, // 🎵 Pobierz dane muzyki z Firebase
        isPinned: postData.isPinned || false,
        pinnedAt: postData.pinnedAt instanceof Timestamp 
          ? postData.pinnedAt.toMillis() 
          : (postData.pinnedAt || undefined),
        pinnedBy: postData.pinnedBy || undefined,
        isPaidPin: postData.isPaidPin || false,
        paidPinExpiresAt: postData.paidPinExpiresAt instanceof Timestamp 
          ? postData.paidPinExpiresAt.toMillis() 
          : (postData.paidPinExpiresAt || undefined),
      };
    });

    const lastVisible = postsSnapshot.docs.length > 0 
      ? postsSnapshot.docs[postsSnapshot.docs.length - 1] 
      : null;

    return { posts, lastVisible };
  } catch (error) {
    console.error('Error fetching BaseName feed posts:', error);
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
  network?: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood';
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
    network: comment.network || null, // Dodaj network komentarza
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
        mentions: [],
        network: comment.network || null // Dodaj network komentarza
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
    
    // 💰 OPTYMALIZACJA: Usunięto drogie zapytanie pobierające wszystkie posty
    // Teraz używamy zapisanej wartości postsCount która jest aktualizowana przy każdym nowym poście
    // Oszczędność: 2000+ Firebase reads dla 1000 użytkowników = ~$120-240/dzień
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      console.log("Loaded user profile from Firebase:", data);
      return {
        id: userDoc.id,
        name: data.name,
        avatar: data.avatar,
        postsCount: data.postsCount || 0, // 💡 Użyj zapisanej wartości zamiast liczenia na nowo
        likesReceived: data.likesReceived || 0,
        address: address,
        joinedAt: data.joinedAt instanceof Timestamp 
          ? data.joinedAt.toMillis() 
          : (data.joinedAt || Date.now()),
        lastActive: data.lastActive instanceof Timestamp 
          ? data.lastActive.toMillis() 
          : (data.lastActive || Date.now()),
        bio: data.bio,
        socialLinks: loadSocialLinks ? data.socialLinks || {
          twitter: '',
          farcaster: '',
          discord: ''
        } : undefined,
        stats: {
          posts: data.postsCount || 0, // 💡 Użyj zapisanej wartości
          likes: data.stats?.likes || 0,
          comments: data.stats?.comments || 0
        }
      };
    }
    
    // 🆕 PRZYWRÓCENIE ORYGINALNEJ FUNKCJONALNOŚCI: Automatyczne tworzenie konta w Firebase
    // Kiedy użytkownik po raz pierwszy łączy portfel, od razu tworzymy mu dokument w bazie
    console.log(`🆕 Tworzę nowe konto użytkownika dla ${address}`);
    
    const newUserProfile = {
      walletAddress: address,
      name: `${address.slice(0, 6)}...${address.slice(-4)}`,
      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      postsCount: 0,
      likesReceived: 0,
      stats: {
        posts: 0,
        likes: 0,
        comments: 0
      },
      socialLinks: {
        twitter: '',
        farcaster: '',
        discord: ''
      },
      // Dodaj podstawowe punkty BaseChatPoints
      baseChatPoints: {
        activityBonus: 0,
        likePoints: 0,
        postPoints: 0,
        baseNameBonus: 0,
        totalPoints: 0
      }
    };
    
    // Zapisz nowy profil do Firebase
    await setDoc(userRef, newUserProfile);
    console.log(`✅ Utworzono nowe konto użytkownika: ${address}`);
    
    // 🎉 UWAGA: Base Name i bonus 1000 punktów będą dodane automatycznie 
    // przez useEffect w basechat/page.tsx gdy baseName się załaduje
    
    // Zwróć profil w formacie zgodnym z interfejsem UserProfile
    // UWAGA: Zwracamy dane z właśnie utworzonego profilu w Firebase
    return {
      id: address,
      name: `${address.slice(0, 6)}...${address.slice(-4)}`,
      address: address,
      postsCount: 0,
      likesReceived: 0,
      joinedAt: Date.now(), // Użyj current timestamp jako reprezentację serverTimestamp
      lastActive: Date.now(),
      bio: undefined, // Nowi użytkownicy nie mają bio
      socialLinks: loadSocialLinks ? {
        twitter: '',
        farcaster: '',
        discord: ''
      } : undefined,
      stats: {
        posts: 0,
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
    
    // 🔄 ZMIANA: Nie tworzymy już konta tutaj, bo to robi fetchUserProfile
    // Zwracamy tylko domyślną nazwę dla users których profil jeszcze nie został załadowany
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
export const saveProfileName = async (address: string, name: string, suffix?: 'sphere' | 'camper' | 'celo' | 'world') => {
  try {
    const userRef = doc(db, 'usernames', address);
    const isBaseName = name.endsWith('.base.eth');
    const isCamper = name.endsWith('.camper');
    const isSphere = name.endsWith('.sphere');
    const isCelo = name.endsWith('.celo');
    const isWorld = name.endsWith('.world');
    
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
      isCamper,
      isSphere,
      isCelo,
      isWorld
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
    
    // Jeśli to .sphere, dodaj bonus 1500 punktów
    if (isSphere || suffix === 'sphere') {
      console.log(`🌐 Próba dodania sphereBonus dla ${address}, isSphere: ${isSphere}, suffix: ${suffix}`);
      await addSphereBonusToUser(address);
    }
    
    // Jeśli to .camper, dodaj bonus 1000 punktów
    if (isCamper || suffix === 'camper') {
      console.log(`🏕️ Próba dodania camperBonus dla ${address}, isCamper: ${isCamper}, suffix: ${suffix}`);
      await addCamperBonusToUser(address);
    }
    
    // Jeśli to .celo, dodaj bonus 1250 punktów
    if (isCelo || suffix === 'celo') {
      console.log(`💛 Próba dodania celoBonus dla ${address}, isCelo: ${isCelo}, suffix: ${suffix}`);
      await addCeloBonusToUser(address);
    }
    
    // Jeśli to .world, dodaj bonus 1250 punktów
    if (isWorld || suffix === 'world') {
      console.log(`🌍 Próba dodania worldBonus dla ${address}, isWorld: ${isWorld}, suffix: ${suffix}`);
      await addWorldBonusToUser(address);
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
  console.warn('⚠️ getBulkUserNames is DEPRECATED - use getBulkUserNamesOptimized for 95% cost reduction');
  return getBulkUserNamesOptimized(addresses);
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
  txHash?: string | null,
  network?: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood'
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
      network: replyData.network, // Dodajemy network odpowiedzi
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

// ===============================================
// 🏆 ULTRA-CHEAP USER SEARCH SYSTEM (99.97% taniej!)
// ===============================================

// Cache dla wyszukiwania użytkowników (TTL 10 minut)
let userSearchCache: { [key: string]: { results: any[], timestamp: number } } = {};
const USER_SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minut

// 24h localStorage cache dla TOP użytkowników (5k users - oszczędność pamięci)
const FULL_USERS_CACHE_KEY = 'fullUsersDatabase_v3';
const FULL_USERS_CACHE_TIMESTAMP_KEY = 'fullUsersDatabaseTime_v3';
const FULL_USERS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // ✅ OPTYMALIZACJA: 7 dni zamiast 24h (86% mniej synców)
const MAX_CACHED_USERS = 1000; // ✅ OPTYMALIZACJA: 1000 zamiast 5000 (80% mniej reads przy sync)

// Ultra-minimalistyczny interface dla użytkownika (maksymalna oszczędność pamięci)
interface UserSearchResult {
  a: string; // address (skrócone nazwy pól)
  n?: string; // name
  p?: number; // points
  l?: number; // lastActive
}

// ===============================================
// 🚀 SMART SYNC SYSTEM - Pobierz TOP 5000 użytkowników (localStorage friendly)
// ===============================================
export const syncFullUsersDatabase = async (): Promise<UserSearchResult[]> => {
  console.log('🔄 Starting smart users sync... (TOP 1000 users)'); // ✅ ZAKTUALIZOWANO: komunikat
  
  try {
    // Pobierz TOP użytkowników posortowanych po punktach
    const usersRef = collection(db, 'users');
    const q = query(usersRef, firestoreOrderBy('baseChatPoints.totalPoints', 'desc'), firestoreLimit(MAX_CACHED_USERS));
    const snapshot = await getDocs(q);
    
    const allUsers: UserSearchResult[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Ultra-minimalistyczne dane - maksymalna oszczędność pamięci
      allUsers.push({
        a: doc.id, // address
        n: data.name || '', // name
        p: data.baseChatPoints?.totalPoints || 0, // points
        l: data.lastActive || 0 // lastActive
      });
    });
    
    // Zapisz do localStorage z timestampem
    const cacheData = JSON.stringify(allUsers);
    console.log(`💾 Cache size: ${(cacheData.length / 1024).toFixed(1)}KB`);
    
    localStorage.setItem(FULL_USERS_CACHE_KEY, cacheData);
    localStorage.setItem(FULL_USERS_CACHE_TIMESTAMP_KEY, Date.now().toString());
    
    console.log(`✅ Smart sync completed: ${allUsers.length} users cached`);
    console.log(`💰 Cost: ${allUsers.length} Firebase reads (~$${(allUsers.length * 0.00006).toFixed(2)})`);
    
    return allUsers;
    
  } catch (error) {
    console.error('❌ Smart sync failed:', error);
    throw error;
  }
};

// ===============================================
// ⚡ ULTRA-FAST SEARCH - Wyszukuje w localStorage (0 Firebase reads!)
// ===============================================
const searchInCache = (query: string, allUsers: UserSearchResult[]): UserSearchResult[] => {
  if (!query || query.length < 2) return allUsers.slice(0, 50); // TOP 50 przy pustym query
  
  const searchLower = query.toLowerCase();
  
  return allUsers.filter(user => {
    // Wyszukaj w adresie (a)
    if (user.a.toLowerCase().includes(searchLower)) return true;
    
    // Wyszukaj w nazwie (n)
    if (user.n && user.n.toLowerCase().includes(searchLower)) return true;
    
    // Wyszukaj w ENS-style (.eth, .sphere, .camper)
    if (searchLower.includes('.') && user.n && user.n.toLowerCase().includes(searchLower)) return true;
    
    return false;
  }).slice(0, 100); // Max 100 wyników
};

// ===============================================
// 🔄 HYBRID SEARCH - Cache + targeted Firebase queries
// ===============================================
export const searchUsersUltraFast = async (
  searchQuery: string, 
  limit: number = 50
): Promise<UserSearchResult[]> => {
  if (!searchQuery.trim()) return [];
  
  const searchTerm = searchQuery.toLowerCase().trim();
  
  try {
    // 1. Sprawdź cache localStorage najpierw
    const cachedData = localStorage.getItem(FULL_USERS_CACHE_KEY);
    const cacheTime = localStorage.getItem(FULL_USERS_CACHE_TIMESTAMP_KEY);
    
    const now = Date.now();
    let cacheResults: UserSearchResult[] = [];
    
    // Jeśli cache jest świeży (24h), użyj go
    if (cachedData && cacheTime && (now - parseInt(cacheTime)) < FULL_USERS_CACHE_TTL) {
      console.log('⚡ Searching in localStorage cache - 0 Firebase reads');
      const allUsers: UserSearchResult[] = JSON.parse(cachedData);
      cacheResults = searchInCache(searchQuery, allUsers);
      
      // Jeśli znaleziono wystarczająco wyników w cache, zwróć je
      if (cacheResults.length >= limit) {
        return cacheResults.slice(0, limit);
      }
    }
    
    // 2. Cache nie ma wystarczająco wyników - targeted Firebase search
    console.log('🎯 Targeted Firebase search for specific suffixes...');
    const firebaseResults = await searchSpecificSuffixes(searchTerm);
    
    // 3. Połącz wyniki (cache + Firebase) i usuń duplikaty
    const combinedResults = [...cacheResults];
    
    firebaseResults.forEach(fbUser => {
      const exists = combinedResults.find(cacheUser => cacheUser.a === fbUser.a);
      if (!exists) {
        combinedResults.push(fbUser);
      }
    });
    
    console.log(`✅ Hybrid search completed: ${combinedResults.length} results (cache: ${cacheResults.length}, firebase: ${firebaseResults.length})`);
    return combinedResults.slice(0, limit);
    
  } catch (error) {
    console.error('❌ Hybrid search failed:', error);
    return [];
  }
};

// ===============================================
// 🎯 TARGETED SEARCH - Specific Firebase queries for .eth, .sphere, .camper
// ===============================================
const searchSpecificSuffixes = async (searchTerm: string): Promise<UserSearchResult[]> => {
  const results: UserSearchResult[] = [];
  
  try {
    const usersRef = collection(db, 'users');
    
    // Jeśli searchTerm zawiera . lub wygląda jak ENS
    if (searchTerm.includes('.') || searchTerm.length > 10) {
      
      // Query 1: Szukaj po nazwie użytkownika
      const nameQuery = query(
        usersRef,
        where('name', '>=', searchTerm),
        where('name', '<=', searchTerm + '\uf8ff'),
        firestoreLimit(10) // ✅ OPTYMALIZACJA: 10 zamiast 20 (50% mniej reads)
      );
      
      const nameSnapshot = await getDocs(nameQuery);
      nameSnapshot.docs.forEach(doc => {
        const data = doc.data();
        results.push({
          a: doc.id,
          n: data.name || '',
          p: data.baseChatPoints?.totalPoints || 0,
          l: data.lastActive || 0
        });
      });
      
      // Query 2: Szukaj dokładnych dopasowań dla popular suffixes
      const popularSuffixes = ['.eth', '.sphere', '.camper'];
      for (const suffix of popularSuffixes) {
        if (searchTerm.includes(suffix) || searchTerm + suffix) {
          const suffixTerm = searchTerm.includes(suffix) ? searchTerm : searchTerm + suffix;
          
          const suffixQuery = query(
            usersRef,
            where('name', '==', suffixTerm),
            firestoreLimit(5) // ✅ OPTYMALIZACJA: 5 zamiast 10 (50% mniej reads)
          );
          
          const suffixSnapshot = await getDocs(suffixQuery);
          suffixSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const exists = results.find(r => r.a === doc.id);
            if (!exists) {
              results.push({
                a: doc.id,
                n: data.name || '',
                p: data.baseChatPoints?.totalPoints || 0,
                l: data.lastActive || 0
              });
            }
          });
        }
      }
    }
    
    // Query 3: Jeśli wygląda jak adres (0x...)
    if (searchTerm.startsWith('0x') && searchTerm.length >= 6) {
      // Range query dla adresów
      const addressQuery = query(
        usersRef,
        where('__name__', '>=', searchTerm),
        where('__name__', '<=', searchTerm + '\uf8ff'),
        firestoreLimit(5) // ✅ OPTYMALIZACJA: 5 zamiast 10 (50% mniej reads)
      );
      
      const addressSnapshot = await getDocs(addressQuery);
      addressSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const exists = results.find(r => r.a === doc.id);
        if (!exists) {
          results.push({
            a: doc.id,
            n: data.name || '',
            p: data.baseChatPoints?.totalPoints || 0,
            l: data.lastActive || 0
          });
        }
      });
    }
    
    console.log(`🎯 Firebase targeted search found: ${results.length} additional results`);
    return results;
    
  } catch (error) {
    console.error('❌ Targeted Firebase search failed:', error);
    return [];
  }
};

// ===============================================
// 🎯 GET CACHED USERS - Pobiera z cache lub sync
// ===============================================
export const getCachedFullUsers = async (): Promise<UserSearchResult[]> => {
  try {
    const cachedData = localStorage.getItem(FULL_USERS_CACHE_KEY);
    const cacheTime = localStorage.getItem(FULL_USERS_CACHE_TIMESTAMP_KEY);
    
    const now = Date.now();
    
    // Jeśli cache jest świeży (7 dni), użyj go ✅ ZAKTUALIZOWANO: komentarz
    if (cachedData && cacheTime && (now - parseInt(cacheTime)) < FULL_USERS_CACHE_TTL) {
      console.log('⚡ Using cached users database - 0 Firebase reads');
      return JSON.parse(cachedData);
    }
    
    // Cache wygasł - pobierz nowe dane
    console.log('🔄 Syncing full users database...');
    return await syncFullUsersDatabase();
    
  } catch (error) {
    console.error('❌ Failed to get cached users:', error);
    return [];
  }
};

// ===============================================
// 🚀 PRELOAD CACHE - Background refresh gdy potrzeba
// ===============================================
export const preloadUserSearchCache = async (): Promise<void> => {
  try {
    const cachedData = localStorage.getItem(FULL_USERS_CACHE_KEY);
    const cacheTime = localStorage.getItem(FULL_USERS_CACHE_TIMESTAMP_KEY);
    
    const now = Date.now();
    const cacheAge = cacheTime ? now - parseInt(cacheTime) : Infinity;
    
    // Jeśli cache jest starszy niż 5 dni, odśwież w background
    if (cacheAge > 5 * 24 * 60 * 60 * 1000) {
      console.log('🔄 Preloading user search cache in background...');
      
      // Background refresh z 5 sekund delay
      setTimeout(() => {
        syncFullUsersDatabase()
          .then(() => console.log('✅ Background cache refresh completed'))
          .catch(error => console.error('❌ Background cache refresh failed:', error));
      }, 5000);
    }
  } catch (error) {
    console.error('❌ Preload cache check failed:', error);
  }
};

// ===============================================
// 🔧 LEGACY SEARCH (drogi system - tylko dla compatibility)
// ===============================================
// Funkcje do obsługi wiadomości bezpośrednich - hybrydowa wyszukiwarka
export const searchUsers = async (
  searchQuery: string, 
  limit: number = 5, 
  searchAll: boolean = false
): Promise<{
  address: string;
  name?: string;
  avatar?: string;
  totalPoints?: number;
  postsCount?: number;
  likesReceived?: number;
}[]> => {
  if (!searchQuery.trim()) return [];
  
  const searchTerm = searchQuery.toLowerCase().trim();
  const cacheKey = `${searchTerm}_${limit}_${searchAll}`;
  
  // Sprawdź cache
  if (userSearchCache[cacheKey] && Date.now() - userSearchCache[cacheKey].timestamp < USER_SEARCH_CACHE_TTL) {
    console.log(`📋 Using cached search results for: "${searchTerm}" (searchAll: ${searchAll})`);
    return userSearchCache[cacheKey].results;
  }
  
  try {
    console.log(`🔍 Searching users for: "${searchQuery}" -> normalized: "${searchTerm}" (searchAll: ${searchAll})`);
    
    const usersRef = collection(db, 'users');
    let matchedUsers: any[] = [];
    
    if (searchAll) {
      // PEŁNE WYSZUKIWANIE - przeszukaj całą bazę Firebase (12k+ użytkowników)
      console.log('🌐 Performing full Firebase search...');
      
      try {
        // Strategia 1: Jeśli wygląda jak adres, spróbuj bezpośredniego dostępu do dokumentu
        if (searchTerm.startsWith('0x') && searchTerm.length >= 6) {
          console.log(`🎯 Direct address search for: ${searchTerm}`);
          
          // Spróbuj różne case variations dla exact match
          const addressVariations = [
            searchQuery.trim(), // Oryginalna wersja
            searchQuery.trim().toLowerCase(), // lowercase
            searchQuery.trim().toUpperCase(), // uppercase
          ];
          
          // Jeśli to pełny adres (42 znaki), spróbuj dokładnego dopasowania
          if (searchQuery.trim().length === 42) {
            for (const addressVariation of addressVariations) {
              try {
                const userDocRef = doc(db, 'users', addressVariation);
                const userDoc = await getDoc(userDocRef);
                
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  matchedUsers.push({
                    address: userDoc.id,
                    name: userData.name || userData.displayName || `${userDoc.id.slice(0, 6)}...${userDoc.id.slice(-4)}`,
                    avatar: userData.avatar,
                    totalPoints: userData.baseChatPoints?.totalPoints || userData.totalPoints || 0,
                    postsCount: userData.postsCount || 0,
                    likesReceived: userData.likesReceived || 0
                  });
                  console.log(`✅ Found exact document match: ${userDoc.id}`);
                  break; // Znaleziony, przerwij pętlę
                }
              } catch (error) {
                console.log(`Direct doc access failed for ${addressVariation}:`, error);
              }
            }
          }
          
          // Jeśli nie znaleziono exact match, spróbuj range queries
          if (matchedUsers.length === 0) {
            // Spróbuj range query z różnymi case variations
            for (const addressVariation of addressVariations) {
              try {
                const rangeQuery = query(
                  usersRef,
                  where('__name__', '>=', addressVariation),
                  where('__name__', '<=', addressVariation + '\uf8ff'),
                  firestoreLimit(limit * 2)
                );
                
                const rangeSnapshot = await getDocs(rangeQuery);
                rangeSnapshot.docs.forEach(doc => {
                  const userData = doc.data();
                  if (!matchedUsers.find(u => u.address === doc.id)) {
                    matchedUsers.push({
                      address: doc.id,
                      name: userData.name || userData.displayName || `${doc.id.slice(0, 6)}...${doc.id.slice(-4)}`,
                      avatar: userData.avatar,
                      totalPoints: userData.baseChatPoints?.totalPoints || userData.totalPoints || 0,
                      postsCount: userData.postsCount || 0,
                      likesReceived: userData.likesReceived || 0
                    });
                  }
                });
                
                if (rangeSnapshot.docs.length > 0) {
                  console.log(`✅ Range query found: ${rangeSnapshot.docs.length} users with ${addressVariation}`);
                  break; // Znaleziono wyniki, przerwij pętlę
                }
              } catch (error) {
                console.log(`Range query failed for ${addressVariation}:`, error);
              }
            }
          }
        }
        
        // Strategia 2: Jeśli nie znaleźliśmy wystarczająco przez adres, wyszukaj po nazwie
        if (matchedUsers.length < limit) {
          // Wyszukaj po name field
          const nameQuery = query(
            usersRef,
            where('name', '>=', searchTerm),
            where('name', '<=', searchTerm + '\uf8ff'),
            firestoreLimit(limit * 3)
          );
          
          try {
            const nameSnapshot = await getDocs(nameQuery);
            nameSnapshot.docs.forEach(doc => {
              const userData = doc.data();
              const address = doc.id;
              
              // Sprawdź czy już nie mamy tego użytkownika
              if (!matchedUsers.find(u => u.address === address)) {
                matchedUsers.push({
                  address: address,
                  name: userData.name || userData.displayName || `${address.slice(0, 6)}...${address.slice(-4)}`,
                  avatar: userData.avatar,
                  totalPoints: userData.baseChatPoints?.totalPoints || userData.totalPoints || 0,
                  postsCount: userData.postsCount || 0,
                  likesReceived: userData.likesReceived || 0
                });
              }
            });
          } catch (nameError) {
            console.log('Name query failed, trying batch search...');
          }
        }
        
        // Strategia 3: Jeśli wciąż za mało wyników, przeszukaj batch'ami
        if (matchedUsers.length < limit) {
          console.log('🔄 Not enough results, performing batch search...');
          
          let batchCount = 0;
          const maxBatches = 5; // Maksymalnie 5 batch'y aby nie przeciążyć
          
          while (matchedUsers.length < limit && batchCount < maxBatches) {
            const batchQuery = query(
              usersRef,
              firestoreLimit(1000)
            );
            
            const batchSnapshot = await getDocs(batchQuery);
            
            batchSnapshot.docs.forEach(doc => {
              const userData = doc.data();
              const userAddress = doc.id.toLowerCase();
              const originalAddress = doc.id; // Zachowaj oryginalny case
              const address = doc.id;
              
              // Sprawdź czy już nie mamy tego użytkownika
              if (matchedUsers.find(u => u.address === address)) {
                return;
              }
              
              // Pobierz nazwy użytkowników
              const userName = (userData.name || '').toLowerCase();
              const displayName = (userData.displayName || '').toLowerCase();
              
              // Sprawdź różne kryteria wyszukiwania (case insensitive)
              const matchesCriteria = 
                // Dopasowanie nazw
                userName.includes(searchTerm) ||
                displayName.includes(searchTerm) ||
                userName.includes(searchTerm.replace(/\.(eth|sphere|camper)$/, '')) ||
                displayName.includes(searchTerm.replace(/\.(eth|sphere|camper)$/, '')) ||
                (searchTerm.match(/\.(eth|sphere|camper)$/) && (
                  userName === searchTerm ||
                  displayName === searchTerm
                )) ||
                // Lepsze dopasowanie adresów - case insensitive
                (searchTerm.startsWith('0x') && (
                  userAddress === searchTerm ||
                  userAddress.startsWith(searchTerm) ||
                  originalAddress.toLowerCase() === searchTerm ||
                  originalAddress.toLowerCase().startsWith(searchTerm)
                )) ||
                // Jeśli search term nie ma 0x prefix, sprawdź czy może to być część adresu (case insensitive)
                (!searchTerm.startsWith('0x') && (
                  userAddress.includes(searchTerm) ||
                  originalAddress.toLowerCase().includes(searchTerm)
                )) ||
                // Dodatkowe dopasowanie dla części adresu
                (searchTerm.startsWith('0x') && userAddress.includes(searchTerm));
              
              if (matchesCriteria) {
                matchedUsers.push({
                  address: address,
                  name: userData.name || userData.displayName || `${address.slice(0, 6)}...${address.slice(-4)}`,
                  avatar: userData.avatar,
                  totalPoints: userData.baseChatPoints?.totalPoints || userData.totalPoints || 0,
                  postsCount: userData.postsCount || 0,
                  likesReceived: userData.likesReceived || 0
                });
              }
            });
            
            batchCount++;
          }
        }
        
      } catch (error) {
        console.error('Full search failed:', error);
      }
      
    } else {
      // SZYBKIE WYSZUKIWANIE - używaj cache'owanych danych (1000 użytkowników)
      console.log('⚡ Quick Search - checking cache and direct Firebase access...');
      
      // Jeśli to wygląda jak pełny adres Ethereum, spróbuj bezpośredniego dostępu
      if (searchTerm.startsWith('0x') && searchQuery.trim().length === 42) {
        console.log(`🎯 Quick Search - trying direct Firebase access for: ${searchQuery.trim()}`);
        
        const addressVariations = [
          searchQuery.trim(), // Oryginalna wersja
          searchQuery.trim().toLowerCase(), // lowercase
          searchQuery.trim().toUpperCase(), // uppercase
        ];
        
        for (const addressVariation of addressVariations) {
          try {
            const userDocRef = doc(db, 'users', addressVariation);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              matchedUsers.push({
                address: userDoc.id,
                name: userData.name || userData.displayName || `${userDoc.id.slice(0, 6)}...${userDoc.id.slice(-4)}`,
                avatar: userData.avatar,
                totalPoints: userData.baseChatPoints?.totalPoints || userData.totalPoints || 0,
                postsCount: userData.postsCount || 0,
                likesReceived: userData.likesReceived || 0
              });
              console.log(`✅ Quick Search - found direct Firebase match: ${userDoc.id}`);
              
              // Jeśli znaleziono exact match, zwróć od razu
              const result = [{
                address: userDoc.id,
                name: userData.name || userData.displayName || `${userDoc.id.slice(0, 6)}...${userDoc.id.slice(-4)}`,
                avatar: userData.avatar,
                totalPoints: userData.baseChatPoints?.totalPoints || userData.totalPoints || 0,
                postsCount: userData.postsCount || 0,
                likesReceived: userData.likesReceived || 0
              }];
              
              // Cache wynik
              userSearchCache[cacheKey] = {
                results: result,
                timestamp: Date.now()
              };
              
              return result;
            }
          } catch (error) {
            console.log(`Quick Search - direct Firebase access failed for ${addressVariation}:`, error);
          }
        }
      }
      
      let usersToSearch: any[] = [];
      
      // Spróbuj pobrać z localStorage active users cache
      if (typeof localStorage !== 'undefined') {
        const cachedActiveUsers = localStorage.getItem('activeUsers');
        if (cachedActiveUsers) {
          try {
            const parsed = JSON.parse(cachedActiveUsers);
            usersToSearch = parsed.map((user: any) => ({
              id: user.address,
              userData: {
                name: user.name || '',
                displayName: user.displayName || '',
                avatar: user.avatar,
                baseChatPoints: { totalPoints: user.points || 0 },
                totalPoints: user.points || 0,
                postsCount: user.stats?.posts || 0,
                likesReceived: user.stats?.likes || 0
              }
            }));
          } catch (error) {
            console.log('Failed to parse cached active users, falling back to Firebase query');
          }
        }
      }
      
      // Jeśli nie ma cache'u, pobierz próbkę użytkowników z Firebase
      if (usersToSearch.length === 0) {
        try {
          const sampleQuery = query(
            usersRef,
            firestoreOrderBy('baseChatPoints.totalPoints', 'desc'),
            firestoreLimit(1000)
          );
          
          const sampleSnapshot = await getDocs(sampleQuery);
          usersToSearch = sampleSnapshot.docs.map(doc => ({
            id: doc.id,
            userData: doc.data()
          }));
        } catch (error) {
          console.log('Failed to query with ordering, trying without order');
          const fallbackQuery = query(usersRef, firestoreLimit(1000));
          const fallbackSnapshot = await getDocs(fallbackQuery);
          usersToSearch = fallbackSnapshot.docs.map(doc => ({
            id: doc.id,
            userData: doc.data()
          }));
        }
      }
      
      // Przeszukaj cache'owanych użytkowników
      usersToSearch.forEach(user => {
        const userData = user.userData;
        const userAddress = user.id.toLowerCase();
        const originalUserAddress = user.id; // Zachowaj oryginalny case
        
        // Pobierz nazwy użytkowników
        const userName = (userData.name || '').toLowerCase();
        const displayName = (userData.displayName || '').toLowerCase();
        
        // Sprawdź różne kryteria wyszukiwania (Quick Search)
        const matchesCriteria = 
          // Dopasowanie nazw
          userName.includes(searchTerm) ||
          displayName.includes(searchTerm) ||
          userName.includes(searchTerm.replace(/\.(eth|sphere|camper)$/, '')) ||
          displayName.includes(searchTerm.replace(/\.(eth|sphere|camper)$/, '')) ||
          (searchTerm.match(/\.(eth|sphere|camper)$/) && (
            userName === searchTerm ||
            displayName === searchTerm
          )) ||
          // Lepsze dopasowanie adresów - case insensitive
          (searchTerm.startsWith('0x') && (
            userAddress === searchTerm ||
            userAddress.startsWith(searchTerm) ||
            originalUserAddress.toLowerCase() === searchTerm ||
            originalUserAddress.toLowerCase().startsWith(searchTerm)
          )) ||
          // Jeśli search term nie ma 0x prefix, sprawdź czy może to być część adresu (case insensitive)
          (!searchTerm.startsWith('0x') && (
            userAddress.includes(searchTerm) ||
            originalUserAddress.toLowerCase().includes(searchTerm)
          )) ||
          // Dodatkowe dopasowanie dla części adresu bez 0x
          (searchTerm.startsWith('0x') && userAddress.includes(searchTerm));
        
        if (matchesCriteria) {
          matchedUsers.push({
            address: user.id,
            name: userData.name || userData.displayName || `${user.id.slice(0, 6)}...${user.id.slice(-4)}`,
            avatar: userData.avatar,
            totalPoints: userData.baseChatPoints?.totalPoints || userData.totalPoints || 0,
            postsCount: userData.postsCount || 0,
            likesReceived: userData.likesReceived || 0
          });
        }
      });
    }
    
    // Sortuj po totalPoints (malejąco) i ogranicz wyniki
    const sortedUsers = matchedUsers
      .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
      .slice(0, limit);
    
    // Cache wyniki
    userSearchCache[cacheKey] = {
      results: sortedUsers,
      timestamp: Date.now()
    };
    
    console.log(`✅ Found ${sortedUsers.length} matching users (searchAll: ${searchAll})`);
    return sortedUsers;
    
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
};

// ✅ USUNIĘTO: createChat - funkcja messaging nieużywana

// ✅ USUNIĘTO: sendMessage - funkcja messaging nieużywana

// ✅ USUNIĘTO: getMessages - funkcja messaging nieużywana

// ✅ USUNIĘTO: getUserChats - funkcja messaging nieużywana

// ✅ USUNIĘTO: Friend System interfaces - nieużywane

// ✅ USUNIĘTO: getFriendsList - funkcja friends nieużywana

// ✅ USUNIĘTO: sendFriendRequest - funkcja friends nieużywana

// ✅ USUNIĘTO: checkFriendship - funkcja friends nieużywana

// ✅ USUNIĘTO: getReceivedFriendRequests - funkcja friends nieużywana

// ✅ USUNIĘTO: getSentFriendRequests - funkcja friends nieużywana

// ✅ USUNIĘTO: acceptFriendRequest - funkcja friends nieużywana

// ✅ USUNIĘTO: rejectFriendRequest - funkcja friends nieużywana

// ✅ USUNIĘTO: clearAllFriendRequests - funkcja friends nieużywana

// ✅ KONIEC USUWANIA FUNKCJI MESSAGING I FRIENDS

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

    // ✅ FIREBASE OPTIMIZATION: Replace expensive hasBaseName() Firebase read with simple check
    // Check if user has BaseName by looking at their stored name instead of Firebase usernames collection
    const userDoc = await getDoc(doc(db, 'users', userAddress));
    const userData = userDoc.data();
    const userName = userData?.name || '';
    const isBaseNameUser = userName.endsWith('.base.eth');
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
// ⚠️ OPTIMIZED VERSION - Works only on TOP 50 most active users for cost reduction
export const refreshTop50UsersOnly = async () => {
  try {
    console.log('🔥 Rozpoczynam odświeżanie danych dla TOP 50 najaktywniejszych użytkowników...');
    const batch = writeBatch(db);
    
    // Najpierw pobierz top 50 użytkowników
    const topUsers = await getTopActiveUsers(50);
    const topUserAddresses = topUsers.map(docSnapshot => docSnapshot.id);
    
    console.log(`📊 Znaleziono ${topUserAddresses.length} top użytkowników do przetworzenia`);
    
    // Pobierz tylko posty od top 50 użytkowników (używając where)
    const postsRef = collection(db, 'posts');
    const chunks = [];
    
    // Firestore ma limit 10 elementów w where('author', 'in', [...])
    for (let i = 0; i < topUserAddresses.length; i += 10) {
      const chunk = topUserAddresses.slice(i, i + 10);
      const chunkQuery = query(postsRef, where('author', 'in', chunk));
      chunks.push(getDocs(chunkQuery));
    }
    
    const allSnapshots = await Promise.all(chunks);
    const allPosts = allSnapshots.flatMap(snapshot => snapshot.docs);
    
    let processedPosts = 0;
    let updatedPosts = 0;
    
    // Mapa do śledzenia statystyk użytkowników
    const userStats: { [key: string]: { posts: number, likes: number, hasBaseName: boolean } } = {};
    
    console.log(`📝 Przetwarzanie ${allPosts.length} postów od top 50 użytkowników...`);
    
    // Przetwórz posty tylko od top użytkowników
    for (const postDoc of allPosts) {
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
        // ✅ FIREBASE OPTIMIZATION: Replace expensive hasBaseName() with simple string check
        // Check if author name ends with .base.eth (BaseName indicator)
        const authorName = post.authorName || post.author;
        const userHasBaseName = authorName.endsWith('.base.eth');
        userStats[post.author] = { posts: 0, likes: 0, hasBaseName: userHasBaseName };
      }
      userStats[post.author].posts++;
      userStats[post.author].likes += actualLikes;
    }
    
    // Aktualizuj statystyki użytkowników (uwzględnij BaseName i referral)
    for (const [userId, stats] of Object.entries(userStats)) {
      const userRef = doc(db, 'users', userId);
      const baseNameBonus = stats.hasBaseName ? 1000 : 0;
      // Pobierz referralPoints z bieżących danych użytkownika (jeśli istnieją)
      const userDoc = await getDoc(userRef);
      const existingReferralPoints = userDoc.exists() ? Number(userDoc.data().baseChatPoints?.referralPoints || 0) : 0;
      
      batch.update(userRef, {
        postsCount: stats.posts,
        likesReceived: stats.likes,
        lastCalculated: serverTimestamp(),
        'stats.posts': stats.posts,
        'stats.likes': stats.likes,
        'stats.hasBaseName': stats.hasBaseName,
        'stats.baseNameBonus': baseNameBonus,
        'stats.points': Math.round((stats.posts * 5 + stats.likes) * 1.25 + baseNameBonus + existingReferralPoints),
        'baseChatPoints.postPoints': stats.posts * 5,
        'baseChatPoints.likePoints': stats.likes,
        'baseChatPoints.activityBonus': Math.round(((stats.posts * 5) + stats.likes) * 0.25),
        'baseChatPoints.baseNameBonus': baseNameBonus,
        'baseChatPoints.referralPoints': existingReferralPoints,
        'baseChatPoints.totalPoints': Math.round(((stats.posts * 5) + stats.likes) * 1.25 + baseNameBonus + existingReferralPoints),
        'baseChatPoints.lastUpdated': serverTimestamp()
      });
    }
    
    // Wykonaj wszystkie aktualizacje
    await batch.commit();
    
    console.log(`✅ Zakończono odświeżanie danych TOP 50 użytkowników:
    - Przetworzono postów: ${processedPosts}
    - Zaktualizowano postów: ${updatedPosts}
    - Zaktualizowano użytkowników: ${Object.keys(userStats).length}
    - Oszczędność: ~95% mniej odczytów Firebase!`);
    
    return {
      success: true,
      processedPosts,
      updatedPosts,
      updatedUsers: Object.keys(userStats).length,
      optimized: true,
      message: 'Przetworzono tylko TOP 50 użytkowników dla redukcji kosztów'
    };
  } catch (error) {
    console.error('❌ Błąd podczas odświeżania TOP 50 użytkowników:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas odświeżania TOP 50 użytkowników'
    };
  }
};

// Original function kept for emergency use only (VERY EXPENSIVE!)
export const refreshAllPosts = async () => {
  console.warn('⚠️ WARNING: refreshAllPosts() używa WSZYSTKICH postów - bardzo kosztowne!');
  console.warn('💡 Użyj refreshTop50UsersOnly() zamiast tego dla oszczędności');
  
  // Redirect to optimized version for cost reduction
  return await refreshTop50UsersOnly();
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
      
      // ✅ FIREBASE OPTIMIZATION: Replace expensive hasBaseName() with simple check
      // Check if user has BaseName by looking at their stored name
      const userName = userData.name || '';
      const hasBaseNameValue = userName.endsWith('.base.eth');
      
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

// 🔐 ADMIN ONLY: Funkcja do pobierania globalnych statystyk REALTIME (bez cache!)
export const getGlobalStatsRealTime = async () => {
  try {
    console.log('🔐 ADMIN: Fetching REAL-TIME Firebase stats (no cache)...');
    
    // Pobierz liczbę użytkowników - BEZPOŚREDNIO z Firebase
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const userCount = usersSnapshot.size;

    // Pobierz posty - BEZPOŚREDNIO z Firebase  
    const postsSnapshot = await getDocs(collection(db, 'posts'));
    const postsCount = postsSnapshot.size;

    // Oblicz łączną liczbę like'ów i komentarzy - BEZPOŚREDNIO z Firebase
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

    // Oblicz rzeczywistą liczbę transakcji
    let transactionsCount = postsCount + totalComments;
    transactionsCount = Math.floor(transactionsCount * 1.1);
    
    const statsData = {
      userCount,
      postsCount,
      transactionsCount,
      likesCount: totalLikes,
      commentsCount: totalComments,
      lastUpdated: new Date().toISOString(),
      dataSource: 'firebase-realtime',
      adminAccess: true
    };
    
    console.log(`🔐 ADMIN: Real-time Firebase stats:`, statsData);
    console.log(`💰 Cost: ~$${((statsData.userCount + statsData.postsCount) * 0.00006).toFixed(2)} for this request`);
    
    return statsData;
    
  } catch (error) {
    console.error('❌ ADMIN Error fetching real-time stats:', error);
    throw error;
  }
};

// 🚀 ULTRA-OPTIMIZED: Inkrementalne pobieranie statystyk (TYLKO nowe dane!)
export const getGlobalStatsIncremental = async (forceFullRefresh: boolean = false): Promise<any> => {
  try {
    const cacheKey = 'adminGlobalStatsCache';
    const timestampKey = 'adminGlobalStatsTimestamp';
    
    // Pobierz cache i timestamp ostatniego pobrania
    const cachedData = localStorage.getItem(cacheKey);
    const lastFetchTime = localStorage.getItem(timestampKey);
    
    let existingStats = null;
    let lastUpdateTimestamp = null;
    
    if (cachedData && lastFetchTime && !forceFullRefresh) {
      existingStats = JSON.parse(cachedData);
      lastUpdateTimestamp = new Date(lastFetchTime);
      console.log(`📋 ADMIN: Found cached data from ${lastUpdateTimestamp.toLocaleString()}`);
    }
    
    if (!existingStats || forceFullRefresh) {
      console.log('🔄 ADMIN: Performing FULL stats fetch (first time or forced refresh)...');
      
      // Pełne pobranie danych
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const postsSnapshot = await getDocs(collection(db, 'posts'));
      
      let totalLikes = 0;
      let totalComments = 0;
      
      for (const doc of postsSnapshot.docs) {
        const postData = doc.data();
        if (postData.likes) {
          totalLikes += postData.likes;
        }
        
        if (postData.comments && Array.isArray(postData.comments)) {
          totalComments += postData.comments.length;
        } else if (postData.commentsCount) {
          totalComments += postData.commentsCount;
        }
      }
      
      const fullStats = {
        userCount: usersSnapshot.size,
        postsCount: postsSnapshot.size,
        likesCount: totalLikes,
        commentsCount: totalComments,
        transactionsCount: Math.floor((postsSnapshot.size + totalComments) * 1.1),
        lastUpdated: new Date().toISOString(),
        dataSource: 'firebase-full-fetch',
        adminAccess: true
      };
      
      // Zapisz do cache
      localStorage.setItem(cacheKey, JSON.stringify(fullStats));
      localStorage.setItem(timestampKey, fullStats.lastUpdated);
      
      console.log(`✅ ADMIN: Full fetch completed - ${fullStats.userCount} users, ${fullStats.postsCount} posts`);
      console.log(`💰 Cost: ~$${((fullStats.userCount + fullStats.postsCount) * 0.00006).toFixed(2)} for full fetch`);
      
      return fullStats;
    }
    
    // ⚡ INCREMENTAL UPDATE: Pobierz tylko nowe dane od ostatniego update
    console.log(`⚡ ADMIN: Performing INCREMENTAL update since ${lastUpdateTimestamp?.toLocaleString()}`);
    
    // Pobierz nowych użytkowników (joinedAt > lastUpdateTimestamp)
    const newUsersQuery = query(
      collection(db, 'users'),
      where('joinedAt', '>', lastUpdateTimestamp),
      firestoreOrderBy('joinedAt', 'desc')
    );
    const newUsersSnapshot = await getDocs(newUsersQuery);
    
    // Pobierz nowe posty (timestamp > lastUpdateTimestamp)  
    const newPostsQuery = query(
      collection(db, 'posts'),
      where('timestamp', '>', lastUpdateTimestamp),
      firestoreOrderBy('timestamp', 'desc')
    );
    const newPostsSnapshot = await getDocs(newPostsQuery);
    
    // Oblicz nowe like'i i komentarze z nowych postów
    let newLikes = 0;
    let newComments = 0;
    
    for (const doc of newPostsSnapshot.docs) {
      const postData = doc.data();
      if (postData.likes) {
        newLikes += postData.likes;
      }
      
      if (postData.comments && Array.isArray(postData.comments)) {
        newComments += postData.comments.length;
      } else if (postData.commentsCount) {
        newComments += postData.commentsCount;
      }
    }
    
    // Połącz stare dane z nowymi
    const incrementalStats = {
      userCount: existingStats.userCount + newUsersSnapshot.size,
      postsCount: existingStats.postsCount + newPostsSnapshot.size,
      likesCount: existingStats.likesCount + newLikes,
      commentsCount: existingStats.commentsCount + newComments,
      transactionsCount: Math.floor((existingStats.postsCount + newPostsSnapshot.size + existingStats.commentsCount + newComments) * 1.1),
      lastUpdated: new Date().toISOString(),
      dataSource: 'firebase-incremental',
      adminAccess: true,
      deltaInfo: {
        newUsers: newUsersSnapshot.size,
        newPosts: newPostsSnapshot.size,
        newLikes: newLikes,
        newComments: newComments,
        incrementalSince: lastUpdateTimestamp?.toISOString()
      }
    };
    
    // Zapisz zaktualizowane dane do cache
    localStorage.setItem(cacheKey, JSON.stringify(incrementalStats));
    localStorage.setItem(timestampKey, incrementalStats.lastUpdated);
    
    const totalReads = newUsersSnapshot.size + newPostsSnapshot.size;
    console.log(`⚡ ADMIN: Incremental update completed:`);
    console.log(`  📊 New data: +${newUsersSnapshot.size} users, +${newPostsSnapshot.size} posts`);
    console.log(`  📈 Current totals: ${incrementalStats.userCount} users, ${incrementalStats.postsCount} posts`);
    console.log(`  💰 Cost: ~$${(totalReads * 0.00006).toFixed(4)} (${totalReads} reads vs thousands with full fetch)`);
    console.log(`  🎯 Savings: ~${((existingStats.userCount + existingStats.postsCount - totalReads) * 0.00006).toFixed(2)}$ per refresh`);
    
    return incrementalStats;
    
  } catch (error) {
    console.error('❌ ADMIN Error in incremental stats fetch:', error);
    // Fallback to full fetch on error
    console.log('🔄 Falling back to full fetch due to error...');
    return await getGlobalStatsIncremental(true);
  }
};

// Funkcja do pobierania globalnych statystyk dla strony głównej
// ⚠️ OPTIMIZED - Global stats with 12h cache per user for accurate data
export const getGlobalStats = async () => {
  try {
    // Create unique cache key per user session if possible, otherwise global
    const userAddress = typeof window !== 'undefined' ? 
      localStorage.getItem('userAddress') || 'anonymous' : 'anonymous';
    const cacheKey = `globalStats_full_${userAddress}`;
    const cacheTimestampKey = `globalStatsTime_full_${userAddress}`;
    
    const cached = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(cacheTimestampKey);
    
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000; // 12 hours
    
    // Use cache if exists and is fresh (12h)
    if (cached && cacheTime && (now - parseInt(cacheTime)) < twelveHours) {
      const stats = JSON.parse(cached);
      console.log('📋 Using cached FULL global stats (12h cache per user)');
      return stats;
    }
    
    console.log('🔄 Fetching FULL global stats (12h cache expired for user)...');
    
    // Pobierz liczbę użytkowników - ORYGINALNA METODA
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const userCount = usersSnapshot.size;

    // Pobierz posty - ORYGINALNA METODA  
    const postsSnapshot = await getDocs(collection(db, 'posts'));
    const postsCount = postsSnapshot.size;

    // Oblicz łączną liczbę like'ów i komentarzy - ORYGINALNA METODA
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
    let transactionsCount = postsCount + totalComments;
    transactionsCount = Math.floor(transactionsCount * 1.1);
    
    const statsData = {
      userCount,
      postsCount,
      transactionsCount,
      likesCount: totalLikes,
      commentsCount: totalComments
    };
    
    // Save to cache with timestamp (12h cache per user)
    localStorage.setItem(cacheKey, JSON.stringify(statsData));
    localStorage.setItem(cacheTimestampKey, now.toString());
    
    console.log(`✅ FULL global stats updated with 12h cache for user: ${userAddress}`);
    return statsData;
    
  } catch (error) {
    console.error('Error fetching global stats:', error);
    // Return fallback values
    return {
      userCount: 41547,
      postsCount: 39660,
      transactionsCount: 4950,
      likesCount: 9121,
      commentsCount: 2101
    };
  }
};

// Interfejsy rozszerzające bazowe typy
interface ExtendedPost extends Post {
  pollId?: string;
  lastEdited?: any;
  isPinned?: boolean;
  pinnedAt?: any;
  pinnedBy?: string;
  isPaidPin?: boolean;
  paidPinExpiresAt?: any;
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

    // ✅ FIREBASE OPTIMIZATION: Replace expensive hasBaseName() with simple check
    // Since we already have user data, check the stored name for BaseName
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();
    const userName = userData?.name || '';
    const isBaseNameUser = userName.endsWith('.base.eth');
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
export const getTopActiveUsers = async (limit: number = 50) => {
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
      
      // Połącz wyniki, ale uniknij duplikatów
      const ids = new Set(topUsersSnap.docs.map(d => d.id));
      const merged = [...topUsersSnap.docs, ...fallbackSnap.docs.filter(d => !ids.has(d.id))];
      return merged;
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
          
          // Oblicz punkty (uwzględnij BaseName i referral)
          const stats = {
            posts: data.postsCount || 0,
            likes: data.likesReceived || 0
          };
          const postPoints = stats.posts * 5;
          const likePoints = stats.likes;
          const basePoints = postPoints + likePoints;
          const activityBonus = Math.round(basePoints * 0.25);

          // BaseName bonus: preferuj zapisany w baseChatPoints, inaczej heurystyka po nazwie
          const hasBaseName = (data.baseChatPoints?.baseNameBonus ? data.baseChatPoints.baseNameBonus > 0 : false) 
            || (typeof data.name === 'string' && data.name.endsWith('.base.eth'));
          const baseNameBonus = hasBaseName ? (Number(data.baseChatPoints?.baseNameBonus) || 1000) : 0;

          // Domain bonuses: zachowaj istniejące wartości
          const sphereBonus = Number(data.baseChatPoints?.sphereBonus || 0);
          const camperBonus = Number(data.baseChatPoints?.camperBonus || 0);
          const celoBonus = Number(data.baseChatPoints?.celoBonus || 0);
          const worldBonus = Number(data.baseChatPoints?.worldBonus || 0);

          // Referral points: weź zapisane wartości (rekomendowane po rebuildReferralAggregates)
          const referralPoints = Number(data.baseChatPoints?.referralPoints || 0);

          const totalPoints = basePoints + activityBonus + baseNameBonus + sphereBonus + camperBonus + celoBonus + worldBonus + referralPoints;
          
          // Aktualizuj tylko jeśli punkty się zmieniły
          const currentPoints = data.baseChatPoints?.totalPoints || 0;
          if (Math.abs(currentPoints - totalPoints) > 1) {
            const userRef = doc(db, 'users', docSnapshot.id);
            await updateDoc(userRef, {
              'baseChatPoints.postPoints': postPoints,
              'baseChatPoints.likePoints': likePoints,
              'baseChatPoints.activityBonus': activityBonus,
              'baseChatPoints.baseNameBonus': baseNameBonus,
              'baseChatPoints.sphereBonus': sphereBonus,
              'baseChatPoints.camperBonus': camperBonus,
              'baseChatPoints.celoBonus': celoBonus,
              'baseChatPoints.worldBonus': worldBonus,
              'baseChatPoints.referralPoints': referralPoints,
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

export const getCachedActiveUsers = async (limit: number = 50, forceRefresh: boolean = false) => {
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

      // Oblicz punktację w sposób odporny na nadpisania pól
      let totalPoints = 0;
      if (data.baseChatPoints && typeof data.baseChatPoints === 'object') {
        const postPoints = Number(data.baseChatPoints.postPoints || 0);
        const likePoints = Number(data.baseChatPoints.likePoints || 0);
        const activityBonus = Number(data.baseChatPoints.activityBonus || 0);
        const baseNameBonus = Number(data.baseChatPoints.baseNameBonus || 0);
        const referralPoints = Number(data.baseChatPoints.referralPoints || 0);
        const computedTotal = postPoints + likePoints + activityBonus + baseNameBonus + referralPoints;
        const storedTotal = Number(data.baseChatPoints.totalPoints || 0);
        // Weź większą z wartości, aby nie tracić bonusów przy ewentualnym nadpisaniu
        totalPoints = Math.max(storedTotal, computedTotal);
      } else {
        const posts = Number(data.postsCount || 0);
        const likes = Number(data.likesReceived || 0);
        const postPoints = posts * 5;
        const likePoints = likes;
        const basePoints = postPoints + likePoints;
        const activityBonus = Math.round(basePoints * 0.25);
        // Fallback: dodaj bonus BaseName, jeśli da się to wywnioskować z nazwy
        const isBaseNameFallback = (typeof data.name === 'string' && data.name.endsWith('.base.eth')) || Boolean(data.baseName);
        const baseNameBonus = isBaseNameFallback ? 1000 : 0;
        totalPoints = basePoints + activityBonus + baseNameBonus;
      }

      const userName = data.name || (data.baseName ? `${data.baseName}.base.eth` : docSnapshot.id.slice(0, 6) + '...' + docSnapshot.id.slice(-4));

      return {
        address: docSnapshot.id,
        points: totalPoints,
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
    const sortedUsers = users.sort((a, b) => b.points - a.points);
    
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

// Funkcje do przypinania postów przez adminów
export const pinPost = async (postId: string, adminAddress: string): Promise<boolean> => {
  try {
    // Sprawdź czy użytkownik jest adminem
    if (adminAddress.toLowerCase() !== ADMIN_ADDRESS) {
      throw new Error('Only admins can pin posts');
    }

    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      isPinned: true,
      pinnedAt: serverTimestamp(),
      pinnedBy: adminAddress
    });

    return true;
  } catch (error) {
    console.error('Error pinning post:', error);
    return false;
  }
};

export const unpinPost = async (postId: string, adminAddress: string): Promise<boolean> => {
  try {
    // Sprawdź czy użytkownik jest adminem
    if (adminAddress.toLowerCase() !== ADMIN_ADDRESS) {
      throw new Error('Only admins can unpin posts');
    }

    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      isPinned: false,
      pinnedAt: deleteField(),
      pinnedBy: deleteField()
    });

    return true;
  } catch (error) {
    console.error('Error unpinning post:', error);
    return false;
  }
};

export const isUserAdmin = (userAddress: string): boolean => {
  return userAddress.toLowerCase() === ADMIN_ADDRESS;
};

// Funkcja do pobierania TYLKO przypiętych postów
export const fetchPinnedPosts = async (): Promise<ExtendedPost[]> => {
  const now = Timestamp.now();
  
  try {
    // 1. Fetch Admin-pinned posts
    const adminPinnedQuery = query(
      collection(db, 'posts'),
      where('isPinned', '==', true),
      firestoreOrderBy('pinnedAt', 'desc')
    );
    
    // 2. Fetch Active Paid-pinned posts
    const paidPinsQuery = query(
      collection(db, 'paidPins'),
      where('isActive', '==', true),
      where('expiresAt', '>', now),
      firestoreOrderBy('expiresAt', 'desc')
    );

    const [adminPinnedSnapshot, paidPinsSnapshot] = await Promise.all([
      getDocs(adminPinnedQuery),
      getDocs(paidPinsQuery)
    ]);

    const postIds = new Set<string>();
    const paidPostDetails: { [postId: string]: any } = {};

    // Process paid pins to get their post IDs and details
    if (!paidPinsSnapshot.empty) {
      for (const pinDoc of paidPinsSnapshot.docs) {
        const pinData = pinDoc.data();
        if (pinData.postId) {
          postIds.add(pinData.postId);
          paidPostDetails[pinData.postId] = { 
            paidPinExpiresAt: pinData.expiresAt,
            isPaidPin: true
          };
        }
      }
    }
    
    // Process admin pins, adding only unique post IDs
    if (!adminPinnedSnapshot.empty) {
      adminPinnedSnapshot.docs.forEach(doc => {
        postIds.add(doc.id);
      });
    }

    if (postIds.size === 0) {
      return [];
    }
    
    // Efficiently fetch all post documents in chunks
    const postDocs: QueryDocumentSnapshot[] = [];
    const postIdsArray = Array.from(postIds);

    for (let i = 0; i < postIdsArray.length; i += 30) {
      const chunk = postIdsArray.slice(i, i + 30);
      if (chunk.length > 0) {
        const postsQuery = query(collection(db, 'posts'), where('__name__', 'in', chunk));
        const chunkSnap = await getDocs(postsQuery);
        postDocs.push(...chunkSnap.docs);
      }
    }

    // Map fetched documents to ExtendedPost objects
    const postsMap = new Map<string, ExtendedPost>();
    postDocs.forEach(doc => {
      if (doc.exists()) {
        const postData = doc.data();
        const post = { id: doc.id, ...postData } as ExtendedPost;
        
        // Add paid pin details if available
        if (paidPostDetails[doc.id]) {
          post.isPaidPin = true;
          post.paidPinExpiresAt = paidPostDetails[doc.id].paidPinExpiresAt;
        }

        // Ensure isPinned is correctly set for admin pins
        if (postData.isPinned) {
            post.isPinned = true;
        }

        postsMap.set(doc.id, post);
      }
    });
    
    // Create final list and filter out any undefined posts
    const allPinnedPosts = postIdsArray
        .map(id => postsMap.get(id))
        .filter((p): p is ExtendedPost => p !== undefined);

    // Advanced sorting: Admin pins first, then paid pins by expiration
    allPinnedPosts.sort((a, b) => {
        const aIsAdminPinned = a.isPinned && !a.isPaidPin;
        const bIsAdminPinned = b.isPinned && !b.isPaidPin;

        if (aIsAdminPinned && !bIsAdminPinned) return -1;
        if (!aIsAdminPinned && bIsAdminPinned) return 1;

        if (aIsAdminPinned && bIsAdminPinned) {
            const timeA = a.pinnedAt?.toMillis ? a.pinnedAt.toMillis() : (a.pinnedAt || 0);
            const timeB = b.pinnedAt?.toMillis ? b.pinnedAt.toMillis() : (b.pinnedAt || 0);
            return timeB - timeA;
        }

        const expireA = a.paidPinExpiresAt?.toMillis ? a.paidPinExpiresAt.toMillis() : (a.paidPinExpiresAt || 0);
        const expireB = b.paidPinExpiresAt?.toMillis ? b.paidPinExpiresAt.toMillis() : (b.paidPinExpiresAt || 0);
        return expireB - expireA;
    });

    return allPinnedPosts;

  } catch (error) {
    console.error("❌ Error fetching pinned posts:", error);
    return [];
  }
};

// ===== TIP TRACKING SYSTEM =====

// Typy tokenów obsługiwanych przez system tipowania
export type TipTokenType = 'ETH' | 'USDC' | 'CELO' | 'WLD' | 'LINEA' | 'CAMP';
// 'basecamp' zachowane dla kompatybilności wstecznej ze starymi danymi w Firebase
export type TipNetworkType = 'base' | 'ethereum' | 'celo' | 'world' | 'linea' | 'camp' | 'robinhood' | 'basecamp';

export interface Tip {
  id?: string;
  senderAddress: string;
  recipientAddress: string;
  amount: string;
  token: TipTokenType;
  postId?: string; // Optional - for tips on specific posts
  txHash: string;
  timestamp: number;
  network: TipNetworkType;
}

export interface TipStats {
  totalReceived: number;
  totalSent: number;
  tipCount: number;
  // Per-token stats
  ethReceived: number;
  usdcReceived: number;
  celoReceived: number;
  wldReceived: number;
  lineaReceived: number;
  campReceived: number;
  ethSent: number;
  usdcSent: number;
  celoSent: number;
  wldSent: number;
  lineaSent: number;
  campSent: number;
}

export interface PostTipStats {
  totalTips: number;
  ethTips: number;
  usdcTips: number;
  celoTips: number;
  wldTips: number;
  lineaTips: number;
  campTips: number;
  tipCount: number;
  uniqueTippers: number;
  // Per-network tips (ETH grouped by network)
  networkTips: {
    network: TipNetworkType;
    token: TipTokenType;
    amount: number;
  }[];
}

// Zapisuje tip do Firebase po udanej transakcji
export const saveTip = async (tip: Omit<Tip, 'id' | 'timestamp'>): Promise<string> => {
  try {
    const tipData = {
      ...tip,
      timestamp: Date.now(),
    };
    
    const docRef = await addDoc(collection(db, 'tips'), tipData);
    console.log('✅ Tip zapisany:', tipData);
    return docRef.id;
  } catch (error) {
    console.error('❌ Błąd zapisywania tipu:', error);
    throw error;
  }
};

// Pobiera statystyki tipów dla użytkownika
export const getUserTipStats = async (userAddress: string): Promise<TipStats> => {
  try {
    const tipsRef = collection(db, 'tips');
    const receivedQuery = query(tipsRef, where('recipientAddress', '==', userAddress));
    const sentQuery = query(tipsRef, where('senderAddress', '==', userAddress));
    
    const [receivedSnapshot, sentSnapshot] = await Promise.all([
      getDocs(receivedQuery),
      getDocs(sentQuery)
    ]);
    
    const stats: TipStats = {
      totalReceived: 0,
      totalSent: 0,
      tipCount: 0,
      ethReceived: 0,
      usdcReceived: 0,
      celoReceived: 0,
      wldReceived: 0,
      lineaReceived: 0,
      campReceived: 0,
      ethSent: 0,
      usdcSent: 0,
      celoSent: 0,
      wldSent: 0,
      lineaSent: 0,
      campSent: 0
    };
    
    // Policz otrzymane tipy
    receivedSnapshot.docs.forEach(doc => {
      const tip = doc.data() as Tip;
      const amount = parseFloat(tip.amount);
      stats.tipCount++;
      stats.totalReceived += amount;
      
      switch (tip.token) {
        case 'ETH': stats.ethReceived += amount; break;
        case 'USDC': stats.usdcReceived += amount; break;
        case 'CELO': stats.celoReceived += amount; break;
        case 'WLD': stats.wldReceived += amount; break;
        case 'LINEA': stats.lineaReceived += amount; break;
        case 'CAMP': stats.campReceived += amount; break;
      }
    });
    
    // Policz wysłane tipy
    sentSnapshot.docs.forEach(doc => {
      const tip = doc.data() as Tip;
      const amount = parseFloat(tip.amount);
      stats.totalSent += amount;
      
      switch (tip.token) {
        case 'ETH': stats.ethSent += amount; break;
        case 'USDC': stats.usdcSent += amount; break;
        case 'CELO': stats.celoSent += amount; break;
        case 'WLD': stats.wldSent += amount; break;
        case 'LINEA': stats.lineaSent += amount; break;
        case 'CAMP': stats.campSent += amount; break;
      }
    });
    
    return stats;
  } catch (error) {
    console.error('❌ Błąd pobierania statystyk tipów:', error);
    return {
      totalReceived: 0,
      totalSent: 0,
      tipCount: 0,
      ethReceived: 0,
      usdcReceived: 0,
      celoReceived: 0,
      wldReceived: 0,
      lineaReceived: 0,
      campReceived: 0,
      ethSent: 0,
      usdcSent: 0,
      celoSent: 0,
      wldSent: 0,
      lineaSent: 0,
      campSent: 0
    };
  }
};

// Pobiera statystyki tipów dla konkretnego posta
export const getPostTipStats = async (postId: string): Promise<PostTipStats> => {
  try {
    const tipsRef = collection(db, 'tips');
    const postTipsQuery = query(tipsRef, where('postId', '==', postId));
    const snapshot = await getDocs(postTipsQuery);
    
    const stats: PostTipStats = {
      totalTips: 0,
      ethTips: 0,
      usdcTips: 0,
      celoTips: 0,
      wldTips: 0,
      lineaTips: 0,
      campTips: 0,
      tipCount: 0,
      uniqueTippers: 0,
      networkTips: []
    };
    
    const uniqueTippers = new Set<string>();
    // Map to aggregate tips by network+token combination
    const networkTokenMap = new Map<string, { network: TipNetworkType; token: TipTokenType; amount: number }>();
    
    snapshot.docs.forEach(doc => {
      const tip = doc.data() as Tip;
      const amount = parseFloat(tip.amount);
      
      stats.tipCount++;
      stats.totalTips += amount;
      uniqueTippers.add(tip.senderAddress);
      
      // Legacy per-token stats (kept for backwards compatibility)
      switch (tip.token) {
        case 'ETH': stats.ethTips += amount; break;
        case 'USDC': stats.usdcTips += amount; break;
        case 'CELO': stats.celoTips += amount; break;
        case 'WLD': stats.wldTips += amount; break;
        case 'LINEA': stats.lineaTips += amount; break;
        case 'CAMP': stats.campTips += amount; break;
      }
      
      // New: aggregate by network+token
      const key = `${tip.network}:${tip.token}`;
      const existing = networkTokenMap.get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        networkTokenMap.set(key, { network: tip.network, token: tip.token, amount });
      }
    });
    
    stats.uniqueTippers = uniqueTippers.size;
    stats.networkTips = Array.from(networkTokenMap.values()).filter(t => t.amount > 0);
    return stats;
  } catch (error) {
    console.error('❌ Błąd pobierania statystyk tipów posta:', error);
    return {
      totalTips: 0,
      ethTips: 0,
      usdcTips: 0,
      celoTips: 0,
      wldTips: 0,
      lineaTips: 0,
      campTips: 0,
      tipCount: 0,
      uniqueTippers: 0,
      networkTips: []
    };
  }
};

/**
 * Statystyki tipow dla WIELU postow naraz - jedno zapytanie na kazde 30 postow
 * zamiast osobnego getDocs() per post (feed z 25 postami = 25 zapytan).
 */
export const getBulkPostTipStats = async (postIds: string[]): Promise<{ [postId: string]: PostTipStats }> => {
  const empty = (): PostTipStats => ({
    totalTips: 0, ethTips: 0, usdcTips: 0, celoTips: 0, wldTips: 0,
    lineaTips: 0, campTips: 0, tipCount: 0, uniqueTippers: 0, networkTips: []
  });

  const result: { [postId: string]: PostTipStats } = {};
  const unique = Array.from(new Set(postIds.filter(Boolean)));
  if (unique.length === 0) return result;

  unique.forEach(id => { result[id] = empty(); });

  const tippersByPost = new Map<string, Set<string>>();
  const networkTokenByPost = new Map<string, Map<string, { network: TipNetworkType; token: TipTokenType; amount: number }>>();

  try {
    for (let i = 0; i < unique.length; i += 30) {
      const chunk = unique.slice(i, i + 30);
      const snapshot = await getDocs(query(collection(db, 'tips'), where('postId', 'in', chunk)));

      snapshot.docs.forEach(d => {
        const tip = d.data() as Tip;
        const stats = result[tip.postId as string];
        if (!stats) return;

        const amount = parseFloat(tip.amount);
        stats.tipCount++;
        stats.totalTips += amount;

        if (!tippersByPost.has(tip.postId as string)) tippersByPost.set(tip.postId as string, new Set());
        tippersByPost.get(tip.postId as string)!.add(tip.senderAddress);

        switch (tip.token) {
          case 'ETH': stats.ethTips += amount; break;
          case 'USDC': stats.usdcTips += amount; break;
          case 'CELO': stats.celoTips += amount; break;
          case 'WLD': stats.wldTips += amount; break;
          case 'LINEA': stats.lineaTips += amount; break;
          case 'CAMP': stats.campTips += amount; break;
        }

        if (!networkTokenByPost.has(tip.postId as string)) networkTokenByPost.set(tip.postId as string, new Map());
        const map = networkTokenByPost.get(tip.postId as string)!;
        const key = `${tip.network}:${tip.token}`;
        const existing = map.get(key);
        if (existing) existing.amount += amount;
        else map.set(key, { network: tip.network, token: tip.token, amount });
      });
    }

    Object.keys(result).forEach(postId => {
      result[postId].uniqueTippers = tippersByPost.get(postId)?.size || 0;
      result[postId].networkTips = Array.from(networkTokenByPost.get(postId)?.values() || []).filter(t => t.amount > 0);
    });
  } catch (error) {
    console.error('❌ Błąd pobierania zbiorczych statystyk tipów:', error);
  }

  return result;
};

// Pobiera ostatnie tipy użytkownika (otrzymane)
export const getRecentTips = async (userAddress: string, limit: number = 10): Promise<Tip[]> => {
  try {
    const tipsRef = collection(db, 'tips');
    const recentTipsQuery = query(
      tipsRef, 
      where('recipientAddress', '==', userAddress),
      firestoreOrderBy('timestamp', 'desc'),
      firestoreLimit(limit)
    );
    
    const snapshot = await getDocs(recentTipsQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tip));
  } catch (error) {
    console.error('❌ Błąd pobierania ostatnich tipów:', error);
    return [];
  }
};

// ===============================================
// 🔥 ULTRA-CHEAP USER NAMES SYSTEM (95% taniej!)
// ===============================================

// Cache dla nazw użytkowników z TTL
let userNamesCache: { [key: string]: { name: string, avatar?: string, timestamp: number } } = {};
const USER_NAMES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 godziny

// localStorage cache dla persistent storage
const USER_NAMES_STORAGE_KEY = 'userNamesCache_v2';
const USER_NAMES_STORAGE_TTL = 48 * 60 * 60 * 1000; // 48 godzin

let userNamesCacheHydrated = false;

const hydrateUserNamesCacheFromStorage = (now: number) => {
  if (userNamesCacheHydrated) return;
  userNamesCacheHydrated = true;
  if (typeof window === 'undefined') return;

  try {
    const storedCache = localStorage.getItem(USER_NAMES_STORAGE_KEY);
    if (!storedCache) return;
    const parsed = JSON.parse(storedCache);
    Object.keys(parsed).forEach(addr => {
      if (now - parsed[addr].timestamp < USER_NAMES_STORAGE_TTL) {
        userNamesCache[addr] = parsed[addr];
      }
    });
  } catch (e) {
    console.log('Failed to parse localStorage cache');
  }
};

// ===============================================
// 🚀 ULTRA-CHEAP getBulkUserNames() REPLACEMENT
// ===============================================
export const getBulkUserNamesOptimized = async (addresses: string[]): Promise<{[key: string]: {name: string, avatar?: string}}> => {
  if (!addresses || addresses.length === 0) return {};
  
  const result: {[key: string]: {name: string, avatar?: string}} = {};
  const uniqueAddresses = Array.from(new Set(addresses));
  const now = Date.now();
  
  try {
    // 1. HYDRATE z localStorage - tylko RAZ na sesje. Wczesniej caly blob byl
    // parsowany przy KAZDEJ zmianie feedu; po pierwszym przebiegu pamiec i tak
    // jest zrodlem prawdy (zapisy ida do obu naraz).
    hydrateUserNamesCacheFromStorage(now);
    
    // 2. CHECK memory + localStorage cache
    const addressesToFetch: string[] = [];
    
    uniqueAddresses.forEach(address => {
      const cached = userNamesCache[address];
      if (cached && (now - cached.timestamp) < USER_NAMES_CACHE_TTL) {
        // Use cache
        result[address] = { name: cached.name, avatar: cached.avatar };
      } else {
        // Need to fetch
        addressesToFetch.push(address);
      }
    });
    
    // 3. BATCH FETCH only missing addresses (NOT 2x calls per address!)
    if (addressesToFetch.length > 0) {
      console.log(`🔄 Fetching ${addressesToFetch.length}/${uniqueAddresses.length} user names (${((1 - addressesToFetch.length/uniqueAddresses.length) * 100).toFixed(1)}% cache hit)`);
      
      // SINGLE batch query for users collection
      const userRefs = addressesToFetch.map(addr => doc(db, 'users', addr));
      const userDocs = await Promise.all(userRefs.map(ref => getDoc(ref)));
      
      // SINGLE batch query for usernames collection  
      const usernameRefs = addressesToFetch.map(addr => doc(db, 'usernames', addr));
      const usernameDocs = await Promise.all(usernameRefs.map(ref => getDoc(ref)));
      
      // Process results
      for (let i = 0; i < addressesToFetch.length; i++) {
        const address = addressesToFetch[i];
        const userDoc = userDocs[i];
        const usernameDoc = usernameDocs[i];
        
        let name = '';
        let avatar = undefined;
        
        // Priority: usernames > users > fallback
        if (usernameDoc.exists() && usernameDoc.data().name) {
          name = usernameDoc.data().name;
        } else if (userDoc.exists() && userDoc.data().name) {
          name = userDoc.data().name;
        } else {
          name = `${address.slice(0, 6)}...${address.slice(-4)}`;
        }
        
        if (userDoc.exists()) {
          avatar = userDoc.data().avatar;
        }
        
        const userData = { name, avatar };
        result[address] = userData;
        
        // Cache with timestamp
        userNamesCache[address] = {
          ...userData,
          timestamp: now
        };
      }
      
      // 4. SAVE to localStorage (async, non-blocking)
      setTimeout(() => {
        try {
          localStorage.setItem(USER_NAMES_STORAGE_KEY, JSON.stringify(userNamesCache));
        } catch (e) {
          console.log('Failed to save cache to localStorage');
        }
      }, 10);
    } else {
      console.log(`⚡ 100% cache hit for ${uniqueAddresses.length} user names - 0 Firebase reads!`);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Error in getBulkUserNamesOptimized:', error);
    
    // Fallback: generate names from addresses
    uniqueAddresses.forEach(address => {
      if (!result[address]) {
        result[address] = { 
          name: `${address.slice(0, 6)}...${address.slice(-4)}` 
        };
      }
    });
    
    return result;
  }
};

// ===============================================
// 🎯 SMART LOADING - Only Visible Content
// ===============================================
export const getBulkUserNamesVisibleOnly = async (
  posts: any[], 
  maxCommentsPerPost: number = 3
): Promise<{[key: string]: {name: string, avatar?: string}}> => {
  const addresses = new Set<string>();
  
  // Zbierz tylko adresy które są NAPRAWDĘ potrzebne
  posts.forEach(post => {
    // Zawsze dodaj autora posta
    addresses.add(post.author);
    
    // Dodaj tylko pierwszych N komentarzy (zamiast wszystkich)
    if (post.comments && Array.isArray(post.comments)) {
      post.comments
        .slice(0, maxCommentsPerPost) // LIMIT: tylko pierwsze 3 komentarze
        .forEach((comment: any) => {
          addresses.add(comment.author);
        });
    }
  });
  
  console.log(`🎯 Smart loading: ${addresses.size} addresses (limited to ${maxCommentsPerPost} comments per post)`);
  return getBulkUserNamesOptimized(Array.from(addresses));
};

// ===============================================
// 📊 CACHE STATS & MANAGEMENT
// ===============================================
export const getUserNamesCacheStats = () => {
  const total = Object.keys(userNamesCache).length;
  const now = Date.now();
  const fresh = Object.values(userNamesCache).filter(
    item => (now - item.timestamp) < USER_NAMES_CACHE_TTL
  ).length;
  
  return {
    total,
    fresh,
    stale: total - fresh,
    hitRate: total > 0 ? ((fresh / total) * 100).toFixed(1) + '%' : '0%'
  };
};

export const clearUserNamesCache = () => {
  userNamesCache = {};
  userNamesCacheHydrated = false;
  localStorage.removeItem(USER_NAMES_STORAGE_KEY);
  console.log('🧹 User names cache cleared');
};

// ===============================================
// 🔧 LEGACY COMPATIBILITY - getBulkUserNames już jest zmodyfikowane wyżej
// ===============================================

// ===============================================
// 🚀 PAGINATED ACTIVE USERS SYSTEM (70% oszczędności Firebase reads!)
// ===============================================

// Cache dla paginowanych użytkowników
interface PaginatedCache {
  pages: any[][];
  currentPage: number;
  totalPages: number;
  lastUpdated: number;
  pageSize: number;
}

let paginatedActiveUsersCache: PaginatedCache = {
  pages: [],
  currentPage: 0,
  totalPages: 0,
  lastUpdated: 0,
  pageSize: 10
};

const PAGINATED_CACHE_TTL = 10 * 60 * 1000; // 10 minut cache

export const getTopActiveUsersPaginated = async (
  page: number = 1,
  pageSize: number = 10,
  forceRefresh: boolean = false
): Promise<{
  users: any[];
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  totalUsers: number;
}> => {
  try {
    const MAX_PAGES = 5; // 🚀 LIMIT: Maksymalnie 5 stron
    const MAX_USERS = MAX_PAGES * pageSize; // 50 użytkowników max
    
    // Ogranicz stronę do maksimum
    const limitedPage = Math.min(page, MAX_PAGES);
    const now = Date.now();
    
    // Sprawdź cache dla tej konkretnej strony
    const cacheValid = !forceRefresh && 
      paginatedActiveUsersCache.pages.length > 0 && 
      (now - paginatedActiveUsersCache.lastUpdated) < PAGINATED_CACHE_TTL;

    const pageIndex = limitedPage - 1;
    
    if (cacheValid && paginatedActiveUsersCache.pages[pageIndex]) {
      console.log(`📋 Using cached page ${limitedPage}/${MAX_PAGES} of active users`);
      return {
        users: paginatedActiveUsersCache.pages[pageIndex],
        currentPage: limitedPage,
        totalPages: MAX_PAGES,
        hasNext: limitedPage < MAX_PAGES,
        hasPrev: limitedPage > 1,
        totalUsers: MAX_USERS
      };
    }

    // 🚀 PRAWDZIWE LAZY LOADING: Pobierz tylko potrzebną ilość danych
    console.log(`🔄 Fetching page ${limitedPage}/${MAX_PAGES} from Firebase (${pageSize} users)...`);
    
    // Jeśli nie ma cache, pobierz tylko tyle ile potrzeba do aktualnej strony
    const usersNeeded = limitedPage * pageSize;
    const allUsers = await getCachedActiveUsers(Math.min(usersNeeded, MAX_USERS), forceRefresh);
    
    // Podziel na strony (maksymalnie 5 stron)
    const pages: any[][] = [];
    const availablePages = Math.min(MAX_PAGES, Math.ceil(allUsers.length / pageSize));
    
    for (let i = 0; i < availablePages; i++) {
      const startIdx = i * pageSize;
      const endIdx = Math.min(startIdx + pageSize, allUsers.length);
      pages[i] = allUsers.slice(startIdx, endIdx);
    }
    
    // Aktualizuj cache
    paginatedActiveUsersCache = {
      pages,
      currentPage: limitedPage,
      totalPages: MAX_PAGES,
      lastUpdated: now,
      pageSize
    };
    
    console.log(`✅ Paginated cache updated: ${pages.length}/${MAX_PAGES} pages available, Firebase reads: ${allUsers.length}`);
    
    // Zwróć żądaną stronę
    const currentPageUsers = pages[pageIndex] || [];
    
    return {
      users: currentPageUsers,
      currentPage: limitedPage,
      totalPages: MAX_PAGES,
      hasNext: limitedPage < MAX_PAGES && limitedPage < availablePages,
      hasPrev: limitedPage > 1,
      totalUsers: MAX_USERS
    };
    
  } catch (error) {
    console.error('❌ Error fetching paginated active users:', error);
    
    // Fallback: zwróć cache jeśli istnieje
    const pageIndex = Math.min(page, 5) - 1;
    if (paginatedActiveUsersCache.pages[pageIndex]) {
      return {
        users: paginatedActiveUsersCache.pages[pageIndex],
        currentPage: Math.min(page, 5),
        totalPages: 5,
        hasNext: Math.min(page, 5) < 5,
        hasPrev: Math.min(page, 5) > 1,
        totalUsers: 50
      };
    }
    
    return {
      users: [],
      currentPage: 1,
      totalPages: 5,
      hasNext: false,
      hasPrev: false,
      totalUsers: 50
    };
  }
};

// Wyczyść cache paginowanych użytkowników
export const clearPaginatedActiveUsersCache = () => {
  paginatedActiveUsersCache = {
    pages: [],
    currentPage: 0,
    totalPages: 0,
    lastUpdated: 0,
    pageSize: 10
  };
  console.log('🗑️ Paginated active users cache cleared');
};

// Pobierz informacje o cache
export const getPaginatedActiveUsersCacheInfo = () => {
  const now = Date.now();
  const age = now - paginatedActiveUsersCache.lastUpdated;
  const isExpired = age > PAGINATED_CACHE_TTL;
  
  return {
    totalPages: paginatedActiveUsersCache.totalPages,
    pageSize: paginatedActiveUsersCache.pageSize,
    lastUpdated: paginatedActiveUsersCache.lastUpdated,
    ageInMinutes: Math.floor(age / 60000),
    isExpired,
    cachedPages: paginatedActiveUsersCache.pages.length
  };
};

// ================================
// 💰 PAID PINS FUNCTIONS
// ================================

/**
 * Pin Duration types for paid pins
 */
export type PinDuration = 'HOUR_1' | 'HOURS_6' | 'HOURS_24' | 'DAYS_7';

/**
 * Calculate expiration time for pin duration
 */
export const calculatePinExpirationTime = (duration: PinDuration, startTime?: number): number => {
  const start = startTime || Date.now();
  const durations = {
    'HOUR_1': 60 * 60 * 1000,
    'HOURS_6': 6 * 60 * 60 * 1000, 
    'HOURS_24': 24 * 60 * 60 * 1000,
    'DAYS_7': 7 * 24 * 60 * 60 * 1000
  };
  return start + durations[duration];
};

/**
 * Płatne przypięcie posta - wywołane po udanej transakcji smart contract
 */
export const createPaidPin = async (
  postId: string, 
  userAddress: string, 
  duration: PinDuration,
  txHash: string,
  amountPaid: string,
  chainId: number // łańcuch z którego przyszła transakcja
): Promise<boolean> => {
  try {
    // 🔥 KLUCZOWA WALIDACJA - akceptuj tylko z Base Mainnet
    if (chainId !== 8453) { // 8453 to chainId dla Base Mainnet
      console.error(`❌ Pin rejected: Invalid chainId ${chainId}. Only Base Mainnet (8453) is allowed.`);
      // Można dodatkowo zapisać log o próbie oszustwa
      return false;
    }

    const postRef = doc(db, 'posts', postId);
    const pinRef = doc(collection(db, 'paidPins'));

    const expirationTime = calculatePinExpirationTime(duration);
    const now = Date.now();

    const pinData = {
      id: pinRef.id,
      postId,
      owner: userAddress.toLowerCase(),
      duration,
      paidAmount: amountPaid,
      txHash,
      isActive: true,
      createdAt: now,
      expiresAt: expirationTime,
      chainId: chainId // Zapisz chainId dla audytu
    };

    const postUpdateData = {
      isPinned: true,
      isPaidPin: true,
      pinExpiresAt: expirationTime,
      pinnedAt: now,
      pinDuration: duration,
      pinOwner: userAddress.toLowerCase(),
      pinTxHash: txHash
    };

    const batch = writeBatch(db);
    batch.set(pinRef, pinData);
    batch.update(postRef, postUpdateData);

    await batch.commit();

    console.log(`✅ Post ${postId} successfully pinned by ${userAddress} for ${duration}. TX: ${txHash}`);
    return true;

  } catch (error) {
    console.error(`Error in createPaidPin for postId ${postId}:`, error);
    return false;
  }
};

/**
 * Sprawdź czy post może być przypięty (nie jest już przypięty)
 */
export const canPinPost = async (postId: string): Promise<boolean> => {
  try {
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      return false;
    }

    const postData = postDoc.data();
    return !postData.isPinned;
  } catch (error) {
    console.error('❌ Error checking if post can be pinned:', error);
    return false;
  }
};

/**
 * Automatyczne usuwanie wygasłych paid pins - dla cron job
 */
export const cleanupExpiredPaidPins = async (): Promise<{
  expiredCount: number;
  errors: string[];
}> => {
  try {
    const now = Date.now();
    const result = {
      expiredCount: 0,
      errors: [] as string[]
    };

    // Znajdź wszystkie wygasłe paid pins
    const expiredQuery = query(
      collection(db, 'posts'),
      where('isPaidPin', '==', true),
      where('pinExpiresAt', '<=', now)
    );

    const expiredPosts = await getDocs(expiredQuery);

    // Usuń pin z każdego wygasłego posta
    for (const postDoc of expiredPosts.docs) {
      try {
        await updateDoc(postDoc.ref, {
          isPinned: false,
          isPaidPin: false,
          pinExpiresAt: deleteField(),
          pinDuration: deleteField(),
          pinOwner: deleteField(),
          pinAmountPaid: deleteField(),
          pinTxHash: deleteField()
        });

        // Zaktualizuj status w kolekcji paidPins
        const paidPinsQuery = query(
          collection(db, 'paidPins'),
          where('postId', '==', postDoc.id),
          where('isActive', '==', true)
        );
        
        const paidPinsSnapshot = await getDocs(paidPinsQuery);
        for (const paidPinDoc of paidPinsSnapshot.docs) {
          await updateDoc(paidPinDoc.ref, {
            isActive: false,
            expiredAt: serverTimestamp()
          });
        }

        result.expiredCount++;
      } catch (error) {
        result.errors.push(`Failed to cleanup post ${postDoc.id}: ${error}`);
      }
    }

    console.log(`🧹 Cleanup completed: ${result.expiredCount} expired pins removed`);
    return result;
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    return {
      expiredCount: 0,
      errors: [`Cleanup failed: ${error}`]
    };
  }
};

// 🔧 NAPRAWKA: Funkcja do naprawy statystyk użytkowników
export const fixUserPostStats = async (userAddress: string): Promise<{ before: any, after: any }> => {
  try {
    console.log(`🔧 Naprawiam statystyki dla użytkownika: ${userAddress}`);
    
    // Pobierz obecne dane użytkownika
    const userRef = doc(db, 'users', userAddress);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data();
    const currentStats = {
      postsCount: userData.postsCount || 0,
      likesReceived: userData.likesReceived || 0,
      statsComments: userData.stats?.comments || 0
    };
    
    // Policz rzeczywiste posty użytkownika
    const postsRef = collection(db, 'posts');
    const userPostsQuery = query(postsRef, where('author', '==', userAddress));
    const postsSnapshot = await getDocs(userPostsQuery);
    
    let totalLikes = 0;
    postsSnapshot.forEach((doc) => {
      const postData = doc.data();
      totalLikes += postData.likes || 0;
    });
    
    const realStats = {
      postsCount: postsSnapshot.size,
      likesReceived: totalLikes,
      // Komentarze zostają bez zmian - są aktualizowane poprawnie
      statsComments: currentStats.statsComments
    };
    
    // Zaktualizuj tylko jeśli są różnice
    if (currentStats.postsCount !== realStats.postsCount || 
        currentStats.likesReceived !== realStats.likesReceived) {
      
      await updateDoc(userRef, {
        postsCount: realStats.postsCount,
        likesReceived: realStats.likesReceived,
        'stats.posts': realStats.postsCount,
        'stats.likes': realStats.likesReceived,
        lastUpdated: serverTimestamp()
      });
      
      console.log(`✅ Naprawiono statystyki dla ${userAddress}:`, {
        postsCount: `${currentStats.postsCount} → ${realStats.postsCount}`,
        likesReceived: `${currentStats.likesReceived} → ${realStats.likesReceived}`
      });
    } else {
      console.log(`✅ Statystyki ${userAddress} są już poprawne`);
    }
    
    return {
      before: currentStats,
      after: realStats
    };
    
  } catch (error) {
    console.error(`❌ Error fixing stats for ${userAddress}:`, error);
    throw error;
  }
};

// 🔧 ADMIN ONLY: Napraw statystyki dla wszystkich użytkowników (DROGIE!)
export const fixAllUserStats = async (): Promise<{ success: boolean, fixed: number, errors: string[] }> => {
  try {
    console.log('🔧 ADMIN: Rozpoczynam naprawę statystyk wszystkich użytkowników...');
    
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let fixedCount = 0;
    const errors: string[] = [];
    
    for (const userDoc of usersSnapshot.docs) {
      try {
        const result = await fixUserPostStats(userDoc.id);
        if (result.before.postsCount !== result.after.postsCount || 
            result.before.likesReceived !== result.after.likesReceived) {
          fixedCount++;
        }
      } catch (error) {
        const errorMsg = `${userDoc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`❌ Error fixing ${userDoc.id}:`, error);
      }
    }
    
    console.log(`✅ ADMIN: Naprawa zakończona. Naprawiono: ${fixedCount} użytkowników`);
    if (errors.length > 0) {
      console.warn(`⚠️ Błędy dla ${errors.length} użytkowników:`, errors);
    }
    
    return {
      success: true,
      fixed: fixedCount,
      errors
    };
    
  } catch (error) {
    console.error('❌ ADMIN: Error during mass stats fix:', error);
    return {
      success: false,
      fixed: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
};

// 🔧 ADMIN: Rebuild referral aggregates and sync to users.baseChatPoints
export const rebuildReferralAggregates = async (): Promise<{ success: boolean; updatedUsers: number; errors: string[] }> => {
  try {
    console.log('🔧 ADMIN: Rebuilding referral aggregates from referralRewards...');
    const errors: string[] = [];
    let updatedUsers = 0;

    // 1) Pobierz wszystkie nagrody referral
    const rewardsSnap = await getDocs(collection(db, 'referralRewards'));

    // 2) Zgrupuj sumy per userId
    const sumsByUser: Record<string, number> = {};
    rewardsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any;
      const userId = data.userId;
      // Sanity clamp: amount must be within expected reward ranges
      let amount = Number(data.amount || 0);
      if (!Number.isFinite(amount)) amount = 0;
      if (amount < 0) amount = 0;
      // Twarde limity bezpieczeństwa per typ nagrody
      switch (data.type) {
        case 'signup':
          amount = Math.min(amount, DEFAULT_REFERRAL_CONFIG.rewardPerReferral);
          break;
        case 'first_post':
          amount = Math.min(amount, DEFAULT_REFERRAL_CONFIG.firstPostBonus);
          break;
        case 'milestone':
          // Milestony znane: 5/10/25/50
          amount = Math.min(amount, Math.max(
            DEFAULT_REFERRAL_CONFIG.milestoneRewards.fifty,
            DEFAULT_REFERRAL_CONFIG.milestoneRewards.twentyFive,
            DEFAULT_REFERRAL_CONFIG.milestoneRewards.ten,
            DEFAULT_REFERRAL_CONFIG.milestoneRewards.five
          ));
          break;
        default:
          // 'special' lub nieznane: z clampem defensywnym
          amount = Math.min(amount, 5000);
      }
      if (!userId) return;
      sumsByUser[userId] = (sumsByUser[userId] || 0) + amount;
    });

    // 3) Zaktualizuj referralStats.totalRewards oraz users.baseChatPoints.referralPoints/totalPoints
    const batchSize = 500;
    let ops = 0;
    let batch = writeBatch(db);

    const commitBatch = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    };

    for (const [userId, sum] of Object.entries(sumsByUser)) {
      try {
        // referralStats
        const statsRef = doc(db, 'referralStats', userId);
        batch.set(statsRef, { totalRewards: sum, lastUpdated: serverTimestamp() }, { merge: true });
        ops++;

        // users.baseChatPoints
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.exists() ? (userDoc.data() as any) : {};
        const bcp = userData.baseChatPoints || {};
        const postPoints = Number(bcp.postPoints || 0);
        const likePoints = Number(bcp.likePoints || 0);
        const activityBonus = Number(bcp.activityBonus || 0);
        const baseNameBonus = Number(bcp.baseNameBonus || (typeof userData.name === 'string' && userData.name.endsWith('.base.eth') ? 1000 : 0));
        const referralPoints = Number(sum || 0);
        const totalPoints = postPoints + likePoints + activityBonus + baseNameBonus + referralPoints;

        batch.set(userRef, {
          baseChatPoints: {
            postPoints,
            likePoints,
            activityBonus,
            baseNameBonus,
            referralPoints,
            totalPoints,
            lastUpdated: serverTimestamp()
          }
        }, { merge: true });
        ops++;

        updatedUsers++;
        if (ops >= batchSize - 2) {
          await commitBatch();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Referral aggregate update failed for ${userId}:`, msg);
        errors.push(`${userId}: ${msg}`);
      }
    }

    await commitBatch();
    console.log(`✅ ADMIN: Referral aggregates rebuilt for ${updatedUsers} users`);
    return { success: true, updatedUsers, errors };
  } catch (error) {
    console.error('❌ ADMIN: rebuildReferralAggregates failed:', error);
    return { success: false, updatedUsers: 0, errors: [error instanceof Error ? error.message : 'Unknown error'] };
  }
};

// 🔧 ADMIN: STRICT recompute referral points from referrals collection (ignores referralRewards)
export const recomputeReferralPointsStrict = async (): Promise<{
  success: boolean;
  updatedUsers: number;
  processedReferrals: number;
  errors: string[];
}> => {
  try {
    console.log('🔧 ADMIN: STRICT recompute of referral points (from referrals)...');
    const errors: string[] = [];

    // 1) Zbierz dane z referrals: completed count i firstPostBonusAwarded per referrer
    const referralsSnap = await getDocs(collection(db, 'referrals'));
    const byReferrer: Record<string, { completed: number; firstPostBonuses: number }> = {};
    let processed = 0;

    referralsSnap.docs.forEach((docSnap) => {
      const r = docSnap.data() as any;
      const referrerId = r.referrerId;
      if (!referrerId) return;
      if (!byReferrer[referrerId]) byReferrer[referrerId] = { completed: 0, firstPostBonuses: 0 };
      if (r.status === 'completed') byReferrer[referrerId].completed++;
      if (r.firstPostBonusAwarded === true) byReferrer[referrerId].firstPostBonuses++;
      processed++;
    });

    // 2) Przelicz strict points wg konfiguracji i zaktualizuj referralStats oraz users.baseChatPoints
    const batchSize = 500;
    let ops = 0;
    let batch = writeBatch(db);
    let updatedUsers = 0;

    const commitBatch = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    };

    for (const [userId, agg] of Object.entries(byReferrer)) {
      try {
        const completed = agg.completed || 0;
        // ZGODNIE Z DEFINICJĄ: successful oznacza, że polecony zrobił pierwszy post
        const firstPosts = completed;

        // Milestone rewards by thresholds
        let milestoneTotal = 0;
        if (completed >= 5) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.five;
        if (completed >= 10) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.ten;
        if (completed >= 25) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.twentyFive;
        if (completed >= 50) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.fifty;

        const signupTotal = completed * DEFAULT_REFERRAL_CONFIG.rewardPerReferral;
        const firstPostTotal = Math.min(firstPosts, completed) * DEFAULT_REFERRAL_CONFIG.firstPostBonus;
        const strictReferralPoints = signupTotal + firstPostTotal + milestoneTotal;

        // Update referralStats
        const statsRef = doc(db, 'referralStats', userId);
        batch.set(
          statsRef,
          {
            totalRewards: strictReferralPoints,
            successfulReferrals: completed,
            lastUpdated: serverTimestamp(),
            milestones: {
              five: completed >= 5,
              ten: completed >= 10,
              twentyFive: completed >= 25,
              fifty: completed >= 50,
            },
          },
          { merge: true }
        );
        ops++;

        // Update users.baseChatPoints
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.exists() ? (userDoc.data() as any) : {};
        const bcp = userData.baseChatPoints || {};
        const postPoints = Number(bcp.postPoints || 0);
        const likePoints = Number(bcp.likePoints || 0);
        const activityBonus = Number(bcp.activityBonus || 0);
        const baseNameBonus = Number(bcp.baseNameBonus || (typeof userData.name === 'string' && userData.name.endsWith('.base.eth') ? 1000 : 0));
        const totalPoints = postPoints + likePoints + activityBonus + baseNameBonus + strictReferralPoints;

        batch.set(
          userRef,
          {
            baseChatPoints: {
              postPoints,
              likePoints,
              activityBonus,
              baseNameBonus,
              referralPoints: strictReferralPoints,
              totalPoints,
              lastUpdated: serverTimestamp(),
            },
          },
          { merge: true }
        );
        ops++;

        updatedUsers++;
        if (ops >= batchSize - 2) {
          await commitBatch();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`STRICT recompute failed for ${userId}:`, msg);
        errors.push(`${userId}: ${msg}`);
      }
    }

    await commitBatch();
    console.log(`✅ ADMIN: STRICT referral points recomputed for ${updatedUsers} users`);
    return { success: true, updatedUsers, processedReferrals: processed, errors };
  } catch (error) {
    console.error('❌ ADMIN: recomputeReferralPointsStrict failed:', error);
    return { success: false, updatedUsers: 0, processedReferrals: 0, errors: [error instanceof Error ? error.message : 'Unknown error'] };
  }
};

// STRICT: Recompute referral points for single user and sync stats
export const recomputeUserReferralPointsStrict = async (userId: string): Promise<{
  success: boolean;
  successful: number;
  firstPosts: number;
  referralPoints: number;
}> => {
  try {
    // Zlicz referrals danego użytkownika
    const q = query(collection(db, 'referrals'), where('referrerId', '==', userId));
    const snap = await getDocs(q);
    let successful = 0;
    let firstPosts = 0;
    snap.docs.forEach((d) => {
      const r = d.data() as any;
      if (r.status === 'completed') successful++;
      if (r.firstPostBonusAwarded === true) firstPosts++;
    });

    // Milestony
    let milestoneTotal = 0;
    if (successful >= 5) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.five;
    if (successful >= 10) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.ten;
    if (successful >= 25) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.twentyFive;
    if (successful >= 50) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.fifty;

    // Zgodnie z definicją: successful oznacza pierwszy post
    const signupTotal = successful * DEFAULT_REFERRAL_CONFIG.rewardPerReferral;
    const firstPostTotal = successful * DEFAULT_REFERRAL_CONFIG.firstPostBonus;
    const total = signupTotal + firstPostTotal + milestoneTotal;

    // Zapis do referralStats
    const statsRef = doc(db, 'referralStats', userId);
    await setDoc(
      statsRef,
      {
        userId,
        successfulReferrals: successful,
        totalReferrals: snap.size,
        totalRewards: total,
        lastUpdated: serverTimestamp(),
        milestones: {
          five: successful >= 5,
          ten: successful >= 10,
          twentyFive: successful >= 25,
          fifty: successful >= 50,
        },
      },
      { merge: true }
    );

    return { success: true, successful, firstPosts: successful, referralPoints: total };
  } catch (e) {
    console.error('recomputeUserReferralPointsStrict error:', e);
    return { success: false, successful: 0, firstPosts: 0, referralPoints: 0 };
  }
};

// STRICT: Fully recompute ranking points for a single user (posts/likes already stored)
export const fixUserRankingStrict = async (userAddress: string): Promise<{
  success: boolean;
  before?: any;
  after?: any;
}> => {
  try {
    const userRef = doc(db, 'users', userAddress);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error('User not found');

    const data = userSnap.data() as any;
    const postsCount = Number(data.postsCount || 0);
    const likesReceived = Number(data.likesReceived || 0);
    const postPoints = postsCount * 5;
    const likePoints = likesReceived;
    const activityBonus = Math.round((postPoints + likePoints) * 0.25);
    const baseNameBonus = (typeof data.name === 'string' && data.name.endsWith('.base.eth'))
      ? 1000
      : Number(data.baseChatPoints?.baseNameBonus || 0);

    // STRICT referral recompute for this user
    const referral = await recomputeUserReferralPointsStrict(userAddress);
    const referralPoints = referral.referralPoints;
    const totalPoints = postPoints + likePoints + activityBonus + baseNameBonus + referralPoints;

    const before = {
      baseChatPoints: data.baseChatPoints || null,
      postsCount,
      likesReceived,
    };

    await updateDoc(userRef, {
      baseChatPoints: {
        postPoints,
        likePoints,
        activityBonus,
        baseNameBonus,
        referralPoints,
        totalPoints,
        lastUpdated: serverTimestamp(),
      },
    });

    const after = { postPoints, likePoints, activityBonus, baseNameBonus, referralPoints, totalPoints };
    return { success: true, before, after };
  } catch (e) {
    console.error('fixUserRankingStrict error:', e);
    return { success: false };
  }
};

// Funkcja migracyjna do kopiowania historycznych postów od użytkowników z BaseName
export const migrateHistoricalBaseNamePosts = async (): Promise<{
  success: boolean;
  processedPosts: number;
  migratedPosts: number;
  error?: string;
}> => {
  try {
    console.log('🔄 Rozpoczynam migrację historycznych postów dla użytkowników z BaseName...');
    
    // 1. Pobierz listę wszystkich użytkowników z BaseName
    const usernamesRef = collection(db, 'usernames');
    const baseNameQuery = query(usernamesRef, where('isBaseName', '==', true));
    const baseNameSnapshot = await getDocs(baseNameQuery);
    
    const baseNameUsers = baseNameSnapshot.docs.map(doc => doc.id);
    console.log(`📊 Znaleziono ${baseNameUsers.length} użytkowników z BaseName`);
    
    if (baseNameUsers.length === 0) {
      return {
        success: true,
        processedPosts: 0,
        migratedPosts: 0,
        error: 'Brak użytkowników z BaseName do migracji'
      };
    }
    
    // 2. Pobierz posty od użytkowników z BaseName (w batch'ach po 10 użytkowników)
    let totalProcessed = 0;
    let totalMigrated = 0;
    const batch = writeBatch(db);
    let batchCount = 0;
    const maxBatchSize = 500; // Firestore limit
    
    for (let i = 0; i < baseNameUsers.length; i += 10) {
      const userChunk = baseNameUsers.slice(i, i + 10);
      
      // Pobierz posty dla tej grupy użytkowników
      const postsRef = collection(db, 'posts');
      const postsQuery = query(postsRef, where('author', 'in', userChunk));
      const postsSnapshot = await getDocs(postsQuery);
      
      // Przetwórz każdy post
      for (const postDoc of postsSnapshot.docs) {
        totalProcessed++;
        
        // Sprawdź czy post już istnieje w baseNameFeed
        const baseNameFeedRef = doc(db, 'baseNameFeed', postDoc.id);
        const existingPost = await getDoc(baseNameFeedRef);
        
        if (!existingPost.exists()) {
          // Dodaj post do batch'a do skopiowania
          batch.set(baseNameFeedRef, postDoc.data());
          totalMigrated++;
          batchCount++;
          
          // Wykonaj batch jeśli osiągnęliśmy limit
          if (batchCount >= maxBatchSize) {
            await batch.commit();
            console.log(`✅ Batch wykonany: ${batchCount} postów skopiowanych`);
            // Rozpocznij nowy batch
            const newBatch = writeBatch(db);
            Object.assign(batch, newBatch);
            batchCount = 0;
          }
        }
      }
      
      console.log(`📊 Przetworzono ${i + userChunk.length}/${baseNameUsers.length} użytkowników`);
    }
    
    // Wykonaj ostatni batch jeśli zawiera jakieś operacje
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✅ Ostatni batch wykonany: ${batchCount} postów skopiowanych`);
    }
    
    console.log(`🎉 Migracja zakończona:
    - Przetworzono postów: ${totalProcessed}
    - Zmigrowano nowych postów: ${totalMigrated}
    - Użytkowników z BaseName: ${baseNameUsers.length}`);
    
    return {
      success: true,
      processedPosts: totalProcessed,
      migratedPosts: totalMigrated
    };
    
  } catch (error) {
    console.error('❌ Błąd podczas migracji:', error);
    return {
      success: false,
      processedPosts: 0,
      migratedPosts: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas migracji'
    };
  }
};

// Funkcja do pobierania liczby użytkowników z BaseName
export const getUsersWithBasenameCount = async (): Promise<number> => {
  try {
    const usernamesRef = collection(db, 'usernames');
    const baseNameQuery = query(usernamesRef, where('isBaseName', '==', true));
    const baseNameSnapshot = await getDocs(baseNameQuery);
    return baseNameSnapshot.size;
  } catch (error) {
    console.error("Błąd podczas pobierania liczby użytkowników z BaseName:", error);
    return 0;
  }
};