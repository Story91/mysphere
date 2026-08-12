// ===============================================
// 🔔 NOTIFICATIONS SYSTEM - System powiadomień
// ===============================================

import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  updateDoc,
  setDoc
} from 'firebase/firestore';

import { 
  db, 
  COLLECTIONS, 
  FIELDS, 
  SOCIAL_CONFIG,
  isValidEthereumAddress,
  formatTimestamp,
  generateId,
  sanitizeInput 
} from './config';

// ===============================================
// 🏷️ INTERFACES
// ===============================================

export type NotificationType = 
  | 'LIKE'                    // Post został polubiony
  | 'COMMENT'                 // Nowy komentarz na poście
  | 'MENTION'                 // Wspomnienie w poście/komentarzu
  | 'FOLLOW'                  // Nowy obserwujący
  | 'FRIEND_REQUEST'          // Zaproszenie do znajomych
  | 'FRIEND_REQUEST_ACCEPTED' // Zaakceptowane zaproszenie
  | 'POST_PINNED'            // Post został przypięty
  | 'TIP_RECEIVED'           // Otrzymano tip
  | 'SYSTEM'                 // Powiadomienie systemowe
  | 'ACHIEVEMENT';           // Odblokowane osiągnięcie

export interface Notification {
  id?: string;
  userId: string;            // Odbiorca powiadomienia
  type: NotificationType;
  fromUserId?: string;       // Kto wywołał akcję (jeśli dotyczy)
  fromUserName?: string;     // Nazwa użytkownika który wywołał akcję
  fromUserAvatar?: string;   // Avatar użytkownika
  title: string;             // Tytuł powiadomienia
  message: string;           // Treść powiadomienia
  data?: {                   // Dodatkowe dane specyficzne dla typu
    postId?: string;
    commentId?: string;
    tipAmount?: string;
    achievementId?: string;
    requestId?: string;
    friendshipId?: string;
    [key: string]: any;
  };
  isRead: boolean;
  createdAt: any;
  readAt?: any;
  actionUrl?: string;        // URL do przekierowania po kliknięciu
}

export interface NotificationPreferences {
  userId: string;
  email: boolean;
  push: boolean;
  inApp: boolean;
  types: {
    [K in NotificationType]: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string;  // "22:00"
    end: string;    // "08:00"
  };
  updatedAt?: any;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  byType: { [K in NotificationType]: number };
  recent: Notification[];
}

// ===============================================
// 🚀 CORE NOTIFICATION FUNCTIONS
// ===============================================

/**
 * Stwórz nowe powiadomienie
 */
export const createNotification = async (
  notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>
): Promise<string | null> => {
  try {
    // Walidacja danych wejściowych
    if (!isValidEthereumAddress(notification.userId)) {
      console.error('Invalid user ID for notification');
      return null;
    }

    // Sprawdź preferencje użytkownika
    const preferences = await getNotificationPreferences(notification.userId);
    if (!preferences.inApp || !preferences.types[notification.type]) {
      console.log(`🔕 Notification blocked by user preferences: ${notification.type}`);
      return null;
    }

    // Sprawdź quiet hours
    if (preferences.quietHours.enabled && isInQuietHours(preferences.quietHours)) {
      console.log(`🌙 Notification delayed due to quiet hours`);
      // TODO: Implement delayed notifications queue
      return null;
    }

    // Pobierz dane użytkownika który wywołał akcję (jeśli dotyczy)
    let fromUserData = null;
    if (notification.fromUserId && isValidEthereumAddress(notification.fromUserId)) {
      const fromUserDoc = await getDoc(doc(db, COLLECTIONS.USERS, notification.fromUserId));
      if (fromUserDoc.exists()) {
        fromUserData = fromUserDoc.data();
      }
    }

    // Utwórz czysty obiekt bez undefined values
    const notificationData: any = {
      ...notification,
      title: sanitizeInput(notification.title),
      message: sanitizeInput(notification.message),
      isRead: false,
      createdAt: serverTimestamp()
    };

    // Dodaj tylko te pola które nie są undefined
    const fromUserName = fromUserData?.name || notification.fromUserName;
    const fromUserAvatar = fromUserData?.avatar || notification.fromUserAvatar;
    
    if (fromUserName) {
      notificationData.fromUserName = fromUserName;
    }
    if (fromUserAvatar) {
      notificationData.fromUserAvatar = fromUserAvatar;
    }

    // Dodaj do kolekcji powiadomień użytkownika
    const notificationRef = await addDoc(
      collection(db, `${COLLECTIONS.USERS}/${notification.userId}/${COLLECTIONS.USER_NOTIFICATIONS}`),
      notificationData
    );

    // Aktualizuj licznik nieprzeczytanych powiadomień
    await updateUnreadCount(notification.userId, 1);

    console.log(`🔔 Notification created: ${notification.type} for ${notification.userId}`);

    // Broadcast real-time notification
    setTimeout(() => {
      broadcastNotification({
        ...notificationData,
        id: notificationRef.id
      });
    }, 0);

    return notificationRef.id;

  } catch (error) {
    console.error('Błąd tworzenia powiadomienia:', error);
    return null;
  }
};

/**
 * Pobierz powiadomienia użytkownika
 *
 * @throws gdy odczyt sie nie powiedzie - wolajacy MUSI to odroznic od pustki.
 *
 * DOKLADNIE TEN SAM BLAD, CO W RecentTips: `catch` zwracal `[]`, wiec ekran
 * powiadomien pisal "No notifications - all caught up!" takze wtedy, gdy nie
 * udalo sie ich odczytac. NotificationsView ma juz wlasny stan bledu (`error`)
 * i wlasny komunikat - byl martwy, bo nigdy nie dostawal wyjatku.
 */
export const getUserNotifications = async (
  userId: string,
  limitCount: number = SOCIAL_CONFIG.DEFAULT_LIMIT,
  onlyUnread: boolean = false
): Promise<Notification[]> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return [];
    }

    const notificationsRef = collection(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_NOTIFICATIONS}`);
    let notificationsQuery = query(
      notificationsRef,
      orderBy(FIELDS.CREATED_AT, 'desc'),
      limit(Math.min(limitCount, SOCIAL_CONFIG.MAX_NOTIFICATIONS_FETCH))
    );

    if (onlyUnread) {
      notificationsQuery = query(
        notificationsRef,
        where(FIELDS.IS_READ, '==', false),
        orderBy(FIELDS.CREATED_AT, 'desc'),
        limit(Math.min(limitCount, SOCIAL_CONFIG.MAX_NOTIFICATIONS_FETCH))
      );
    }

    const snapshot = await getDocs(notificationsQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: formatTimestamp(doc.data()[FIELDS.CREATED_AT]),
      readAt: doc.data()[FIELDS.READ_AT] ? formatTimestamp(doc.data()[FIELDS.READ_AT]) : undefined
    } as Notification));

  } catch (error) {
    console.error('Błąd pobierania powiadomień użytkownika:', error);
    throw error;
  }
};

/**
 * Oznacz powiadomienie jako przeczytane
 */
export const markNotificationAsRead = async (
  userId: string,
  notificationId: string
): Promise<boolean> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return false;
    }

    const notificationRef = doc(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_NOTIFICATIONS}`, notificationId);
    const notificationDoc = await getDoc(notificationRef);

    if (!notificationDoc.exists()) {
      return false;
    }

    const notificationData = notificationDoc.data();
    if (notificationData[FIELDS.IS_READ]) {
      return true; // Już przeczytane
    }

    await updateDoc(notificationRef, {
      [FIELDS.IS_READ]: true,
      [FIELDS.READ_AT]: serverTimestamp()
    });

    // Zmniejsz licznik nieprzeczytanych
    await updateUnreadCount(userId, -1);

    return true;
  } catch (error) {
    console.error('Błąd oznaczania powiadomienia jako przeczytane:', error);
    return false;
  }
};

/**
 * Oznacz wszystkie powiadomienia jako przeczytane
 */
export const markAllNotificationsAsRead = async (userId: string): Promise<number> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return 0;
    }

    const notificationsRef = collection(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_NOTIFICATIONS}`);
    const unreadQuery = query(
      notificationsRef,
      where(FIELDS.IS_READ, '==', false),
      limit(100) // Batch limit
    );

    const snapshot = await getDocs(unreadQuery);
    if (snapshot.empty) return 0;

    const batch = writeBatch(db);
    const timestamp = serverTimestamp();

    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        [FIELDS.IS_READ]: true,
        [FIELDS.READ_AT]: timestamp
      });
    });

    await batch.commit();

    // Zresetuj licznik nieprzeczytanych
    await resetUnreadCount(userId);

    console.log(`✅ Marked ${snapshot.docs.length} notifications as read for ${userId}`);
    return snapshot.docs.length;

  } catch (error) {
    console.error('Błąd oznaczania wszystkich powiadomień jako przeczytane:', error);
    return 0;
  }
};

/**
 * Usuń powiadomienie
 */
export const deleteNotification = async (
  userId: string,
  notificationId: string
): Promise<boolean> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return false;
    }

    const notificationRef = doc(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_NOTIFICATIONS}`, notificationId);
    const notificationDoc = await getDoc(notificationRef);

    if (!notificationDoc.exists()) {
      return false;
    }

    const notificationData = notificationDoc.data();
    await deleteDoc(notificationRef);

    // Jeśli było nieprzeczytane, zmniejsz licznik
    if (!notificationData[FIELDS.IS_READ]) {
      await updateUnreadCount(userId, -1);
    }

    return true;
  } catch (error) {
    console.error('Błąd usuwania powiadomienia:', error);
    return false;
  }
};

/**
 * Pobierz liczbę nieprzeczytanych powiadomień
 *
 * @returns `null` znaczy AWARIE ODCZYTU, nigdy "nic nowego".
 *
 * Zero na dzwonku to komunikat "nikt sie do ciebie nie odezwal". Wpisane po
 * padnietym `getDoc` jest to zdanie falszywe i kosztowne: czlowiek nie wchodzi
 * sprawdzic czegos, o czym mu powiedziano, ze nie istnieje.
 */
export const getUnreadNotificationsCount = async (userId: string): Promise<number | null> => {
  try {
    // Adres nie do przyjecia - nie bylo o kogo zapytac, wiec zero nie klamie.
    if (!isValidEthereumAddress(userId)) {
      return 0;
    }

    const userRef = doc(db, COLLECTIONS.USERS, userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData[FIELDS.UNREAD_NOTIFICATIONS] || 0;
    }

    return 0;
  } catch (error) {
    console.error('Błąd pobierania liczby nieprzeczytanych powiadomień:', error);
    return null;
  }
};

// ===============================================
// 🎯 SPECIFIC NOTIFICATION CREATORS
// ===============================================

/**
 * Powiadomienie o polubieniu posta
 */
export const notifyPostLiked = async (
  postId: string,
  postAuthorId: string,
  likedByUserId: string
): Promise<void> => {
  if (postAuthorId === likedByUserId) return; // Nie powiadamiaj o własnych akcjach

  await createNotification({
    userId: postAuthorId,
    type: 'LIKE',
    fromUserId: likedByUserId,
    title: 'Nowy polubiony post',
    message: 'polubił(a) Twój post',
    data: { postId },
    actionUrl: `/post/${postId}`
  });
};

/**
 * Powiadomienie o nowym komentarzu
 */
export const notifyNewComment = async (
  postId: string,
  postAuthorId: string,
  commentAuthorId: string,
  commentContent: string
): Promise<void> => {
  if (postAuthorId === commentAuthorId) return;

  const truncatedContent = commentContent.length > 50 
    ? `${commentContent.slice(0, 50)}...` 
    : commentContent;

  await createNotification({
    userId: postAuthorId,
    type: 'COMMENT',
    fromUserId: commentAuthorId,
    title: 'Nowy komentarz',
    message: `skomentował(a): "${truncatedContent}"`,
    data: { postId },
    actionUrl: `/post/${postId}#comments`
  });
};

/**
 * Powiadomienie o obserwowaniu
 */
export const notifyNewFollower = async (
  followingId: string,
  followerId: string
): Promise<void> => {
  await createNotification({
    userId: followingId,
    type: 'FOLLOW',
    fromUserId: followerId,
    title: 'Nowy obserwujący',
    message: 'zaczął(ęła) Cię obserwować',
    actionUrl: `/profile/${followerId}`
  });
};

/**
 * Powiadomienie o zaproszeniu do znajomych
 */
export const notifyFriendRequest = async (
  receiverId: string,
  senderId: string,
  requestId: string,
  message?: string
): Promise<void> => {
  await createNotification({
    userId: receiverId,
    type: 'FRIEND_REQUEST',
    fromUserId: senderId,
    title: 'Zaproszenie do znajomych',
    message: message || 'wysłał(a) Ci zaproszenie do znajomych',
    data: { requestId },
    actionUrl: '/friends/requests'
  });
};

/**
 * Powiadomienie o zaakceptowaniu zaproszenia
 */
export const notifyFriendRequestAccepted = async (
  senderId: string,
  accepterId: string,
  friendshipId: string
): Promise<void> => {
  await createNotification({
    userId: senderId,
    type: 'FRIEND_REQUEST_ACCEPTED',
    fromUserId: accepterId,
    title: 'Zaproszenie zaakceptowane',
    message: 'zaakceptował(a) Twoje zaproszenie do znajomych',
    data: { friendshipId },
    actionUrl: `/profile/${accepterId}`
  });
};

/**
 * Powiadomienie o otrzymanym tipie
 */
export const notifyTipReceived = async (
  recipientId: string,
  senderId: string,
  amount: string,
  token: string,
  postId?: string
): Promise<void> => {
  await createNotification({
    userId: recipientId,
    type: 'TIP_RECEIVED',
    fromUserId: senderId,
    title: 'Otrzymano tip',
    message: `wysłał(a) Ci ${amount} ${token}`,
    data: { tipAmount: amount, token, postId },
    actionUrl: postId ? `/post/${postId}` : `/profile/${senderId}`
  });
};

/**
 * Jak wygrany dostaje swoje pieniadze - a wiec co mu wolno o nich powiedziec.
 *
 *   'escrow'  kontrakt ZAPISAL saldo (zdarzenie SeatAwarded). W portfelu
 *             jeszcze nic nie ma: claim() to osobna transakcja, ktora wygrany
 *             musi podpisac sam i zaplacic za nia gaz na Base.
 *   'wallet'  autor przelal wprost, a transfer zostal potwierdzony na lancuchu
 *             (verifyBasePayment). Pieniadze SA juz na miejscu.
 */
export type AskPayoutDelivery = 'escrow' | 'wallet';

/**
 * Powiadomienie o wyplacie za przyjeta odpowiedz na Aska.
 *
 * === CO NAPRAWIA ===
 * Rozstrzygniecie Aska przypisywalo pieniadze i na tym sie konczylo. Wygrany
 * dowiadywal sie o nich wylacznie wtedy, gdy sam z siebie zajrzal na /money
 * albo /asks. Przy escrow oznacza to pieniadze lezace w kontrakcie NIEODEBRANE,
 * bo nikt nie wie, ze sa.
 *
 * === DWA ZDANIA, BO DWIE ROZNE SYTUACJE ===
 * Przy escrow "otrzymales" byloby obietnica, ktorej kod nie dotrzymuje - tam
 * trzeba jeszcze kliknac i zaplacic gaz. Przy przelewie bezposrednim pieniadze
 * naprawde juz sa w portfelu. Stad `delivery`, a nie jedno uniwersalne zdanie.
 *
 * === DLACZEGO TYP TIP_RECEIVED, A NIE WLASNY ===
 * `createNotification` odrzuca wszystko, czego nie ma w preferencjach odbiorcy
 * (`preferences.types[type]`), a dokumenty preferencji SA JUZ ZAPISANE w bazie -
 * z tymi kluczami, ktore istnialy w chwili zapisu. Nowy typ bylby dla kazdego
 * istniejacego uzytkownika `undefined`, czyli po cichu zablokowany: kod
 * wygladalby na dzialajacy, a nikt nie dostalby nic. TIP_RECEIVED to ta sama
 * polka - "pieniadze dla ciebie" - i ma juz ikone, kolor, filtr w
 * NotificationsView oraz miejsce na liscie subskrypcji w hooks.ts.
 *
 * === O ADRESACH ===
 * `recipientId` i `askAuthorId` musza przyjsc W FORMIE EIP-55 (checksum).
 * Powiadomienia lezą pod `users/{adres}/notifications`, a czyta je przegladarka
 * adresem prosto z wagmi, ktory JEST checksumowany. Sesja SIWE trzyma adres
 * malymi literami (app/api/auth/verify), wiec zapis "jak leci" trafilby pod
 * klucz, do ktorego nikt nigdy nie zaglada. Checksumuje wolajacy - to trasy
 * serwerowe maja viem, a ten modul ladowany jest takze w przegladarce.
 */
export const notifyAskPayout = async (params: {
  recipientId: string;
  askAuthorId: string;
  askId: string;
  answerId: string;
  /** Kwota gotowa do pokazania, np. "5.00" - formatuje ja wolajacy, bo to on wie, czy patrzy na lancuch, czy na zapis. */
  amount: string;
  token: string;
  delivery: AskPayoutDelivery;
  /** Hash rozstrzygniecia albo przelewu - zostaje w dokumencie jako slad. */
  txHash: string;
}): Promise<void> => {
  const { recipientId, askAuthorId, askId, answerId, amount, token, delivery, txHash } = params;

  // Autor nie moze wygrac wlasnego Aska (trasy tego pilnuja), ale gdyby kiedys
  // przeszlo - nie zawiadamiamy kogos o przelewie samemu sobie.
  if (recipientId.toLowerCase() === askAuthorId.toLowerCase()) return;

  const held = delivery === 'escrow';

  const created = await createNotification({
    userId: recipientId,
    type: 'TIP_RECEIVED',
    fromUserId: askAuthorId,
    // Tekst widoczny dla uzytkownika - po angielsku, jak reszta interfejsu.
    title: held ? 'Ask payout waiting for you' : 'Ask payout received',
    message: held
      ? `awarded you ${amount} ${token} for your answer. The escrow contract is holding it until you claim it - open Money to collect.`
      : `paid you ${amount} ${token} for your answer. It is already in your wallet.`,
    data: { askId, answerId, tipAmount: amount, token, delivery, txHash },
    // /money to jedyne miejsce z PRZYCISKIEM ODBIORU (AskClaimPanel) i z lista
    // tego, co juz wplynelo. Trasa istnieje - app/money/page.tsx.
    actionUrl: '/money'
  });

  if (!created) {
    // AWARIA != PUSTKA. `createNotification` zwraca null zarowno przy bledzie
    // zapisu, jak i przy wyciszeniu przez preferencje albo quiet hours - w
    // kazdym z tych przypadkow czlowiek NIE WIE o swoich pieniadzach, wiec
    // slad musi zostac w logu.
    console.warn('⚠️ Powiadomienie o wyplacie za Aska nie zostalo dostarczone:', { askId, answerId });
  }
};

/**
 * Powiadomienie systemowe
 */
export const notifySystem = async (
  userId: string,
  title: string,
  message: string,
  actionUrl?: string,
  data?: any
): Promise<void> => {
  await createNotification({
    userId,
    type: 'SYSTEM',
    title,
    message,
    actionUrl,
    data
  });
};

/**
 * Powiadomienie o osiągnięciu
 */
export const notifyAchievement = async (
  userId: string,
  achievementId: string,
  achievementName: string,
  description: string
): Promise<void> => {
  await createNotification({
    userId,
    type: 'ACHIEVEMENT',
    title: 'Odblokowane osiągnięcie!',
    message: `Gratulacje! Odblokowano: ${achievementName}`,
    data: { achievementId, description },
    actionUrl: '/achievements'
  });
};

// ===============================================
// ⚙️ NOTIFICATION PREFERENCES
// ===============================================

/**
 * Pobierz preferencje powiadomień użytkownika
 */
export const getNotificationPreferences = async (
  userId: string
): Promise<NotificationPreferences> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return getDefaultPreferences(userId);
    }

    const preferencesRef = doc(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_SETTINGS}`, 'notifications');
    const preferencesDoc = await getDoc(preferencesRef);

    if (preferencesDoc.exists()) {
      return preferencesDoc.data() as NotificationPreferences;
    }

    // Zapisz i zwróć domyślne preferencje
    const defaultPreferences = getDefaultPreferences(userId);
    await setDoc(preferencesRef, defaultPreferences);
    return defaultPreferences;

  } catch (error) {
    console.error('Błąd pobierania preferencji powiadomień:', error);
    return getDefaultPreferences(userId);
  }
};

/**
 * Zaktualizuj preferencje powiadomień
 */
export const updateNotificationPreferences = async (
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<boolean> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return false;
    }

    const preferencesRef = doc(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_SETTINGS}`, 'notifications');
    await updateDoc(preferencesRef, {
      ...preferences,
      userId,
      updatedAt: serverTimestamp()
    });

    return true;
  } catch (error) {
    console.error('Błąd aktualizacji preferencji powiadomień:', error);
    return false;
  }
};

// ===============================================
// 📊 ANALYTICS & SUMMARY
// ===============================================

/**
 * Pobierz podsumowanie powiadomień
 */
export const getNotificationsSummary = async (userId: string): Promise<NotificationSummary> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return getEmptyNotificationSummary();
    }

    // `total`, `recent` i `byType` licza sie z pobranej listy (jak dotad, 100 -
    // zeby "Total" nie skurczyl sie u kogos z wieloma powiadomieniami). Zmienia
    // sie tylko zrodlo `unread`: bierzemy WIEKSZA z dwoch liczb - licznika
    // w profilu (lapie nieprzeczytane spoza okna 100) i tego, co realnie
    // nieprzeczytane w pobranej liscie. `max`, nie sam licznik: gdyby licznik
    // zdryfowal w dol albo do zera, przycisk "Mark all as read" i tak zostaje
    // widoczny, dopoki na liscie sa nieprzeczytane wpisy.
    const [allNotifications, unreadFromCounter] = await Promise.all([
      getUserNotifications(userId, 100),
      getUnreadNotificationsCount(userId),
    ]);
    const recentNotifications = allNotifications.slice(0, 5);

    const byType: { [K in NotificationType]: number } = {
      LIKE: 0,
      COMMENT: 0,
      MENTION: 0,
      FOLLOW: 0,
      FRIEND_REQUEST: 0,
      FRIEND_REQUEST_ACCEPTED: 0,
      POST_PINNED: 0,
      TIP_RECEIVED: 0,
      SYSTEM: 0,
      ACHIEVEMENT: 0
    };

    let unreadInPage = 0;
    allNotifications.forEach(notification => {
      byType[notification.type]++;
      if (!notification.isRead) {
        unreadInPage++;
      }
    });

    return {
      total: allNotifications.length,
      unread: Math.max(unreadFromCounter ?? 0, unreadInPage),
      byType,
      recent: recentNotifications
    };

  } catch (error) {
    console.error('Błąd pobierania podsumowania powiadomień:', error);
    // Puste podsumowanie ma `unread: 0` i puste `recent` - czyli wyglada
    // identycznie jak czyste konto. Wolajacy ma sie dowiedziec, ze nie wiemy.
    throw error;
  }
};

// ===============================================
// 📱 BATCH OPERATIONS
// ===============================================

/**
 * Wyślij powiadomienia do wielu użytkowników jednocześnie
 */
export const createBatchNotifications = async (
  notifications: Array<Omit<Notification, 'id' | 'createdAt' | 'isRead'>>
): Promise<{ successful: number; failed: number }> => {
  let successful = 0;
  let failed = 0;

  // Procesuj w batch'ach po 20 (Firestore limitation)
  for (let i = 0; i < notifications.length; i += 20) {
    const batch = notifications.slice(i, i + 20);
    
    try {
      const promises = batch.map(notification => createNotification(notification));
      const results = await Promise.allSettled(promises);
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          successful++;
        } else {
          failed++;
        }
      });

      // Małe opóźnienie między batch'ami
      if (i + 20 < notifications.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      console.error(`Błąd przetwarzania batch powiadomień ${i}-${i + 20}:`, error);
      failed += batch.length;
    }
  }

  console.log(`📬 Batch notifications: ${successful} successful, ${failed} failed`);
  return { successful, failed };
};

// ===============================================
// 📡 REAL-TIME FEATURES
// ===============================================

// Mapa aktywnych subskrypcji (w prawdziwej implementacji użyj Redis/WebSocket)
const activeSubscriptions = new Map<string, {
  userId: string;
  callback: (notification: Notification) => void;
  types?: NotificationType[];
}>();

/**
 * Subskrybuj real-time powiadomienia
 */
export const subscribeToNotifications = (
  userId: string,
  callback: (notification: Notification) => void,
  types?: NotificationType[]
): string => {
  const subscriptionId = `${userId}_${Date.now()}_${Math.random()}`;
  activeSubscriptions.set(subscriptionId, { userId, callback, types });
  
  console.log(`📡 User ${userId} subscribed to notifications`);
  return subscriptionId;
};

/**
 * Anuluj subskrypcję
 */
export const unsubscribeFromNotifications = (subscriptionId: string): void => {
  activeSubscriptions.delete(subscriptionId);
  console.log(`📡 Unsubscribed: ${subscriptionId}`);
};

/**
 * Wyślij real-time powiadomienie do subskrybentów
 */
export const broadcastNotification = (notification: Notification): void => {
  activeSubscriptions.forEach((subscription, subscriptionId) => {
    if (subscription.userId === notification.userId) {
      // Sprawdź czy typ powiadomienia jest subskrybowany
      if (!subscription.types || subscription.types.includes(notification.type)) {
        try {
          subscription.callback(notification);
        } catch (error) {
          console.error(`Error broadcasting to ${subscriptionId}:`, error);
          // Usuń zepsutą subskrypcję
          activeSubscriptions.delete(subscriptionId);
        }
      }
    }
  });
};

// ===============================================
// 🛠️ UTILITY FUNCTIONS
// ===============================================

/**
 * Sprawdź czy aktualny czas jest w quiet hours
 */
function isInQuietHours(quietHours: { start: string; end: string }): boolean {
  const now = new Date();
  const currentTime = now.getHours() * 100 + now.getMinutes(); // Format: HHMM

  const [startHour, startMin] = quietHours.start.split(':').map(Number);
  const [endHour, endMin] = quietHours.end.split(':').map(Number);
  
  const startTime = startHour * 100 + startMin;
  const endTime = endHour * 100 + endMin;

  if (startTime <= endTime) {
    // Same day quiet hours (e.g., 14:00 - 18:00)
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    // Overnight quiet hours (e.g., 22:00 - 08:00)
    return currentTime >= startTime || currentTime <= endTime;
  }
}

/**
 * Aktualizuj licznik nieprzeczytanych powiadomień
 */
async function updateUnreadCount(userId: string, delta: number): Promise<void> {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const currentCount = userDoc.data()[FIELDS.UNREAD_NOTIFICATIONS] || 0;
      const newCount = Math.max(0, currentCount + delta);
      
      await updateDoc(userRef, {
        [FIELDS.UNREAD_NOTIFICATIONS]: newCount,
        lastNotificationUpdate: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Błąd aktualizacji licznika nieprzeczytanych:', error);
  }
}

/**
 * Zresetuj licznik nieprzeczytanych powiadomień
 */
async function resetUnreadCount(userId: string): Promise<void> {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    await updateDoc(userRef, {
      [FIELDS.UNREAD_NOTIFICATIONS]: 0,
      lastNotificationUpdate: serverTimestamp()
    });
  } catch (error) {
    console.error('Błąd resetowania licznika nieprzeczytanych:', error);
  }
}

/**
 * Pobierz domyślne preferencje powiadomień
 */
function getDefaultPreferences(userId: string): NotificationPreferences {
  return {
    userId,
    email: true,
    push: true,
    inApp: true,
    types: {
      LIKE: true,
      COMMENT: true,
      MENTION: true,
      FOLLOW: true,
      FRIEND_REQUEST: true,
      FRIEND_REQUEST_ACCEPTED: true,
      POST_PINNED: true,
      TIP_RECEIVED: true,
      SYSTEM: true,
      ACHIEVEMENT: true
    },
    quietHours: {
      enabled: false,
      start: SOCIAL_CONFIG.DEFAULT_QUIET_START,
      end: SOCIAL_CONFIG.DEFAULT_QUIET_END
    }
  };
}

/**
 * Pobierz puste podsumowanie powiadomień
 */
function getEmptyNotificationSummary(): NotificationSummary {
  return {
    total: 0,
    unread: 0,
    byType: {
      LIKE: 0,
      COMMENT: 0,
      MENTION: 0,
      FOLLOW: 0,
      FRIEND_REQUEST: 0,
      FRIEND_REQUEST_ACCEPTED: 0,
      POST_PINNED: 0,
      TIP_RECEIVED: 0,
      SYSTEM: 0,
      ACHIEVEMENT: 0
    },
    recent: []
  };
}

/**
 * Wyczyść stare powiadomienia (maintenance function)
 */
export const cleanupOldNotifications = async (
  userId: string,
  daysOld: number = SOCIAL_CONFIG.OLD_NOTIFICATIONS_DAYS
): Promise<number> => {
  try {
    if (!isValidEthereumAddress(userId)) {
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const notificationsRef = collection(db, `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.USER_NOTIFICATIONS}`);
    const oldNotificationsQuery = query(
      notificationsRef,
      where(FIELDS.CREATED_AT, '<', cutoffDate),
      limit(100) // Process in batches
    );

    const snapshot = await getDocs(oldNotificationsQuery);
    if (snapshot.empty) return 0;

    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`🧹 Cleaned up ${snapshot.docs.length} old notifications for ${userId}`);
    return snapshot.docs.length;

  } catch (error) {
    console.error('Błąd czyszczenia starych powiadomień:', error);
    return 0;
  }
};
