// Główny serwis obsługi systemu referali
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment,
  Timestamp,
  orderBy,
  limit,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Referral, 
  ReferralStats, 
  ReferralReward, 
  DEFAULT_REFERRAL_CONFIG 
} from './types';

// Pobieranie nazwy użytkownika (basename, .sphere, .camper lub skrócony adres)
const getUserDisplayName = async (address: string): Promise<string> => {
  try {
    // 1. Sprawdź profil użytkownika w Firebase (.sphere, .camper, custom name)
    const userDoc = await getDoc(doc(db, 'users', address));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.name) {
        return userData.name;
      }
    }
    
    // 2. Fallback - skrócony adres
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  } catch (error) {
    console.error('Error getting user display name:', error);
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
};

// Generowanie unikalnego kodu referalowego
export const generateReferralCode = (address: string): string => {
  // Używamy pierwszych 6 i ostatnich 4 znaki adresu + losowy suffix
  const prefix = address.slice(2, 8).toUpperCase(); // Pomijamy '0x'
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${suffix}`;
};

/**
 * Generowanie pełnego linku referalowego.
 *
 * `/join` MUSI istnieć jako trasa (app/join/page.tsx). Przez długi czas nie
 * istniała, więc każdy skopiowany i wysłany dalej link referalowy lądował na
 * stronie „nie znaleziono" - polecający tracił osobę, którą właśnie przyprowadził.
 * Zmieniając tę ścieżkę, zmień też stronę.
 */
export const generateReferralLink = (referralCode: string): string => {
  // Always use production domain for referral links
  const baseUrl = 'https://mysphere.fun'; // Production domain
  return `${baseUrl}/join?ref=${encodeURIComponent(referralCode)}`;
};

/** Kody generujemy wielkimi literami - porównanie musi to znosić z obu stron. */
export const normalizeReferralCode = (referralCode: string): string =>
  referralCode.trim().toUpperCase();

// Inicjalizacja statystyk referalowych dla użytkownika
export const initializeReferralStats = async (userId: string): Promise<ReferralStats> => {
  try {
    const statsRef = doc(db, 'referralStats', userId);
    const statsDoc = await getDoc(statsRef);
    
    if (statsDoc.exists()) {
      return statsDoc.data() as ReferralStats;
    }
    
    // Create new stats
    const referralCode = generateReferralCode(userId);
    const referralLink = generateReferralLink(referralCode);
    const userName = await getUserDisplayName(userId);
    
    console.log(`📊 Creating referral stats for ${userId}:`);
    console.log(`   - Code: ${referralCode}`);
    console.log(`   - Link: ${referralLink}`);
    console.log(`   - Name: ${userName}`);
    
    const newStats: ReferralStats = {
      userId,
      userName,
      totalReferrals: 0,
      successfulReferrals: 0,
      pendingReferrals: 0,
      totalRewards: 0,
      referralCode,
      referralLink,
      createdAt: serverTimestamp() as Timestamp,
      milestones: {
        five: false,
        ten: false,
        twentyFive: false,
        fifty: false
      }
    };
    
    await setDoc(statsRef, newStats);
    console.log(`✅ Referral stats initialized for ${userId}`);
    console.log(`✅ Referral link: ${referralLink}`);
    
    return newStats;
  } catch (error) {
    console.error('Error initializing referral stats:', error);
    throw error;
  }
};

// Pobieranie statystyk referalowych użytkownika
export const getUserReferralStats = async (userId: string): Promise<ReferralStats | null> => {
  try {
    const statsRef = doc(db, 'referralStats', userId);
    const statsDoc = await getDoc(statsRef);
    
    if (!statsDoc.exists()) {
      // Automatycznie inicjalizuj jeśli nie istnieją
      return await initializeReferralStats(userId);
    }
    
    return statsDoc.data() as ReferralStats;
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    return null;
  }
};

/**
 * Znajdowanie użytkownika po kodzie referalowym.
 *
 * `null` znaczy WYŁĄCZNIE „takiego kodu nie ma". Awaria zapytania leci dalej
 * jako wyjątek i musi zostać obsłużona osobno: „nie znam tego kodu" i „nie
 * udało mi się sprawdzić" to dwie różne wiadomości dla człowieka, który właśnie
 * kliknął czyjeś zaproszenie. Wcześniej oba przypadki zwracały tu `null`.
 */
export const findUserByReferralCode = async (referralCode: string): Promise<string | null> => {
  const statsQuery = query(
    collection(db, 'referralStats'),
    where('referralCode', '==', normalizeReferralCode(referralCode))
  );

  const snapshot = await getDocs(statsQuery);

  if (!snapshot.empty) {
    return snapshot.docs[0].data().userId;
  }

  return null;
};

/**
 * Wynik rejestracji polecenia.
 *
 * Zamiast `boolean`, bo `false` mieszało pięć zupełnie różnych sytuacji w jedną:
 * kod nie istnieje, ktoś użył własnego linku, ten portfel już kogoś ma, baza nie
 * odpowiedziała. Człowiek, który właśnie kliknął cudze zaproszenie, dostaje na
 * każdą z nich inną wiadomość - i tylko przy jednej ma sens przycisk „spróbuj
 * ponownie".
 */
export type ReferralRegistrationOutcome =
  | { status: 'registered'; referrerId: string }
  | { status: 'unknown_code' }
  | { status: 'self_referral' }
  | { status: 'already_referred' }
  | { status: 'failed'; message: string };

// Rejestracja nowego referala
export const registerReferral = async (
  referralCode: string,
  newUserAddress: string,
  metadata?: Partial<Referral['metadata']>
): Promise<ReferralRegistrationOutcome> => {
  const code = normalizeReferralCode(referralCode);

  if (!code) {
    return { status: 'unknown_code' };
  }

  try {
    // Znajdź referera po kodzie
    const referrerId = await findUserByReferralCode(code);

    if (!referrerId) {
      return { status: 'unknown_code' };
    }

    // Własny link. Bez tego warunku wystarczyło otworzyć swoje zaproszenie,
    // żeby policzyć sobie polecenie samego siebie.
    if (referrerId.toLowerCase() === newUserAddress.toLowerCase()) {
      return { status: 'self_referral' };
    }

    // Sprawdź czy użytkownik już nie był polecony
    const existingReferralQuery = query(
      collection(db, 'referrals'),
      where('referredAddress', '==', newUserAddress)
    );

    const existingSnapshot = await getDocs(existingReferralQuery);

    if (!existingSnapshot.empty) {
      return { status: 'already_referred' };
    }

    /**
     * TRZY ZAPISY JEDNYM BATCHEM - wszystkie albo żaden.
     *
     * Wcześniej szły osobno, jeden po drugim, i każdy mógł paść w środku. Dwa
     * z tego były realne, nie teoretyczne:
     *  - `updateDoc` na profilu użytkownika RZUCA, gdy dokumentu nie ma - a nie
     *    ma go dokładnie u kogoś, kto właśnie przyszedł z linku i nie napisał
     *    jeszcze ani jednego posta. Czyli u całej grupy docelowej tej funkcji.
     *    Dokument polecenia i licznik polecającego były już wtedy zapisane, a
     *    funkcja i tak zwracała `false`,
     *  - odwrotnie: licznik mógł urosnąć bez powiązania w profilu.
     * Batch zdejmuje całą tę klasę rozjazdów. `set` z `merge` zakłada profil,
     * jeśli go nie ma, zamiast wywracać się na jego braku.
     */
    const batch = writeBatch(db);

    const referralRef = doc(collection(db, 'referrals'));
    const newReferral: Referral = {
      referrerId,
      referredAddress: newUserAddress,
      referralCode: code,
      timestamp: serverTimestamp() as Timestamp,
      status: 'pending',
      rewardsClaimed: false,
      metadata: {
        joinedFrom: 'link',
        ...metadata
      }
    };
    batch.set(referralRef, newReferral);

    // Informacja o refererze w profilu nowego użytkownika.
    batch.set(
      doc(db, 'users', newUserAddress),
      {
        walletAddress: newUserAddress,
        referredBy: referrerId,
        referralCode: code,
        joinedViaReferral: true,
        referralTimestamp: serverTimestamp()
      },
      { merge: true }
    );

    // Statystyki referera. Dokument istnieje - właśnie po nim znaleźliśmy kod.
    batch.update(doc(db, 'referralStats', referrerId), {
      totalReferrals: increment(1),
      pendingReferrals: increment(1),
      lastUpdated: serverTimestamp()
    });

    await batch.commit();

    console.log(`✅ New referral registered: ${newUserAddress} referred by ${referrerId}`);
    return { status: 'registered', referrerId };
  } catch (error) {
    console.error('Error registering referral:', error);
    return {
      status: 'failed',
      message: 'We could not save your invite right now. Nothing was lost - you can try again.'
    };
  }
};

// Aktywacja referala (gdy użytkownik spełni wymagania)
export const activateReferral = async (
  referredAddress: string
): Promise<boolean> => {
  try {
    // Znajdź dokument referala
    const referralQuery = query(
      collection(db, 'referrals'),
      where('referredAddress', '==', referredAddress),
      where('status', '==', 'pending')
    );
    
    const snapshot = await getDocs(referralQuery);
    
    if (snapshot.empty) {
      console.log('No pending referral found for this user');
      return false;
    }
    
    const referralDoc = snapshot.docs[0];
    const referralData = referralDoc.data() as Referral;
    
    // Zaktualizuj status referala
    await updateDoc(referralDoc.ref, {
      status: 'completed',
      completedAt: serverTimestamp()
    });
    
    // Zaktualizuj statystyki referera (z aktualną nazwą)
    const statsRef = doc(db, 'referralStats', referralData.referrerId);
    const userName = await getUserDisplayName(referralData.referrerId);
    await updateDoc(statsRef, {
      userName,
      successfulReferrals: increment(1),
      pendingReferrals: increment(-1),
      lastUpdated: serverTimestamp()
    });
    
    // Przyznaj nagrodę
    await awardReferralPoints(
      referralData.referrerId,
      referralDoc.id,
      DEFAULT_REFERRAL_CONFIG.rewardPerReferral,
      'signup',
      `New user joined through your referral link`
    );
    
    console.log(`✅ Referral activated for ${referredAddress}`);
    return true;
  } catch (error) {
    console.error('Error activating referral:', error);
    return false;
  }
};

// Przyznawanie punktów za referala
export const awardReferralPoints = async (
  userId: string,
  referralId: string,
  amount: number,
  type: ReferralReward['type'],
  description: string
): Promise<boolean> => {
  try {
    // Dodaj rekord nagrody
    const rewardRef = doc(collection(db, 'referralRewards'));
    const newReward: ReferralReward = {
      userId,
      referralId,
      amount,
      type,
      description,
      timestamp: serverTimestamp() as Timestamp,
      claimed: true
    };
    
    await setDoc(rewardRef, newReward);
    
    // Zaktualizuj punkty użytkownika
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'baseChatPoints.referralPoints': increment(amount),
      'baseChatPoints.totalPoints': increment(amount),
      lastUpdated: serverTimestamp()
    });
    
    // Zaktualizuj statystyki referalowe
    const statsRef = doc(db, 'referralStats', userId);
    await updateDoc(statsRef, {
      totalRewards: increment(amount),
      lastUpdated: serverTimestamp()
    });
    
    // Sprawdź i przyznaj nagrody za kamienie milowe
    await checkAndAwardMilestones(userId);
    
    console.log(`✅ Awarded ${amount} points to ${userId} for referral`);
    return true;
  } catch (error) {
    console.error('Error awarding points:', error);
    return false;
  }
};

// Sprawdzanie i przyznawanie nagród za kamienie milowe
export const checkAndAwardMilestones = async (userId: string): Promise<void> => {
  try {
    const stats = await getUserReferralStats(userId);
    if (!stats) return;
    
    const { successfulReferrals, milestones } = stats;
    const config = DEFAULT_REFERRAL_CONFIG;
    let updatedMilestones = { ...milestones };
    
    // Sprawdź każdy kamień milowy
    if (successfulReferrals >= 5 && !milestones?.five) {
      await awardReferralPoints(
        userId,
        'milestone-5',
        config.milestoneRewards.five,
        'milestone',
        'Reached 5 referrals!'
      );
      updatedMilestones.five = true;
    }
    
    if (successfulReferrals >= 10 && !milestones?.ten) {
      await awardReferralPoints(
        userId,
        'milestone-10',
        config.milestoneRewards.ten,
        'milestone',
        'Reached 10 referrals!'
      );
      updatedMilestones.ten = true;
    }
    
    if (successfulReferrals >= 25 && !milestones?.twentyFive) {
      await awardReferralPoints(
        userId,
        'milestone-25',
        config.milestoneRewards.twentyFive,
        'milestone',
        'Reached 25 referrals!'
      );
      updatedMilestones.twentyFive = true;
    }
    
    if (successfulReferrals >= 50 && !milestones?.fifty) {
      await awardReferralPoints(
        userId,
        'milestone-50',
        config.milestoneRewards.fifty,
        'milestone',
        'Reached 50 referrals!'
      );
      updatedMilestones.fifty = true;
    }
    
    // Zaktualizuj milestones w bazie
    if (JSON.stringify(updatedMilestones) !== JSON.stringify(milestones)) {
      const statsRef = doc(db, 'referralStats', userId);
      await updateDoc(statsRef, {
        milestones: updatedMilestones,
        lastUpdated: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error checking milestones:', error);
  }
};

// Pobieranie listy referali użytkownika
export const getUserReferrals = async (
  userId: string,
  statusFilter?: Referral['status']
): Promise<Referral[]> => {
  try {
    let referralQuery = query(
      collection(db, 'referrals'),
      where('referrerId', '==', userId)
    );
    
    if (statusFilter) {
      referralQuery = query(
        collection(db, 'referrals'),
        where('referrerId', '==', userId),
        where('status', '==', statusFilter)
      );
    }
    
    const snapshot = await getDocs(referralQuery);
    const referrals: Referral[] = [];
    
    snapshot.forEach((doc) => {
      referrals.push({
        id: doc.id,
        ...doc.data()
      } as Referral);
    });
    
    return referrals;
  } catch (error) {
    console.error('Error fetching referrals list:', error);
    return [];
  }
};

// Pobieranie historii nagród użytkownika
export const getUserReferralRewards = async (
  userId: string,
  limitCount: number = 50
): Promise<ReferralReward[]> => {
  try {
    const rewardsQuery = query(
      collection(db, 'referralRewards'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(rewardsQuery);
    const rewards: ReferralReward[] = [];
    
    snapshot.forEach((doc) => {
      rewards.push({
        id: doc.id,
        ...doc.data()
      } as ReferralReward);
    });
    
    return rewards;
  } catch (error) {
    console.error('Error fetching rewards history:', error);
    return [];
  }
};

// Sprawdzenie czy użytkownik został polecony
export const checkIfUserWasReferred = async (userAddress: string): Promise<{
  wasReferred: boolean;
  referrerId?: string;
  referralCode?: string;
}> => {
  try {
    const userRef = doc(db, 'users', userAddress);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.joinedViaReferral) {
        return {
          wasReferred: true,
          referrerId: userData.referredBy,
          referralCode: userData.referralCode
        };
      }
    }
    
    return { wasReferred: false };
  } catch (error) {
    console.error('Error checking referral:', error);
    return { wasReferred: false };
  }
};

// Bonus za pierwszy post poleconego użytkownika
export const awardFirstPostBonus = async (referredAddress: string): Promise<boolean> => {
  try {
    // Sprawdź czy użytkownik był polecony
    const referralInfo = await checkIfUserWasReferred(referredAddress);
    
    if (!referralInfo.wasReferred || !referralInfo.referrerId) {
      return false;
    }
    
    // Sprawdź czy bonus już nie został przyznany
    const referralQuery = query(
      collection(db, 'referrals'),
      where('referredAddress', '==', referredAddress),
      where('firstPostBonusAwarded', '==', true)
    );
    
    const snapshot = await getDocs(referralQuery);
    
    if (!snapshot.empty) {
      console.log('First post bonus already awarded');
      return false;
    }
    
    // Znajdź dokument referala
    const referralQuery2 = query(
      collection(db, 'referrals'),
      where('referredAddress', '==', referredAddress)
    );
    
    const snapshot2 = await getDocs(referralQuery2);
    
    if (snapshot2.empty) {
      return false;
    }
    
    const referralDoc = snapshot2.docs[0];
    
    // Oznacz że bonus został przyznany
    await updateDoc(referralDoc.ref, {
      firstPostBonusAwarded: true,
      firstPostBonusDate: serverTimestamp()
    });
    
    // Przyznaj bonus punktów
    await awardReferralPoints(
      referralInfo.referrerId,
      referralDoc.id,
      DEFAULT_REFERRAL_CONFIG.firstPostBonus,
      'first_post',
      `Referred user created their first post`
    );
    
    console.log(`✅ First post bonus awarded to referrer ${referralInfo.referrerId}`);
    return true;
  } catch (error) {
    console.error('Error awarding first post bonus:', error);
    return false;
  }
};