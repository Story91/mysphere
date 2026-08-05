/**
 * Jeden klient Firestore do PUBLICZNYCH odczytow serwerowych.
 *
 * PO CO TO ISTNIEJE: trasy udostepnialne (/post/[id], /u/[address],
 * /tip/[txHash], /leaderboard, sitemapa) potrzebuja kilku odczytow z Firestore i
 * niczego wiecej. Kazdy z tych modulow niosl WLASNA kopie `firebaseConfig` i
 * wlasne `getDb()` - ten sam blok skopiowany trzy razy, wiec kazda zmiana
 * konfiguracji wymagala pamietania o wszystkich trzech miejscach.
 *
 * Czemu nie app/utils/firebase.ts: tamten modul ma ~5800 linii i ciagnie
 * firebase/auth, localStorage oraz logike kliencka. Tutaj potrzeba samego
 * odczytu.
 *
 * `getApps()` jest sprawdzane celowo: jesli w tym samym procesie zyje juz
 * domyslna aplikacja Firebase (np. zainicjowana przez app/utils/firebase.ts),
 * reuzywamy jej zamiast inicjowac druga.
 *
 * UPRAWNIENIA: to zwykly klient, ktory PODLEGA regulom bezpieczenstwa - tak
 * samo jak przegladarka. Do danych, ktorych klientowi widziec nie wolno (tresc
 * premium), sluzy getAdminDb() z utils/auth/firebaseAdmin.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Firestore do publicznych odczytow. Reuzywa domyslnej aplikacji, gdy istnieje. */
export function getPublicDb(): Firestore {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getFirestore(app);
}
