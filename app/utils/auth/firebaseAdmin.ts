import 'server-only';
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Mintowanie tokenow Firebase po weryfikacji SIWE.
 *
 * PO CO TO ISTNIEJE - to jest naprawa realnej dziury bezpieczenstwa:
 * Aplikacja nigdy nie logowala sie do Firebase Auth, wiec `request.auth`
 * w regulach Firestore bylo ZAWSZE null. Reguly nie mogly sprawdzic, kto
 * pisze, i dlatego produkcyjna regula brzmiala
 * `match /{document=**} { allow read, write: if true }` - baza otwarta
 * na oscież od stycznia 2025.
 *
 * Lancuch, ktory to zamyka:
 *   podpis SIWE -> serwer weryfikuje go on-chain -> mintuje token Firebase
 *   z uid = adres portfela -> klient robi signInWithCustomToken
 *   -> request.auth.uid w regulach JEST adresem portfela
 *
 * Dopiero wtedy regula "tylko wlasciciel edytuje swoj dokument" jest
 * wykonalna.
 *
 * KLUCZ USLUGOWY czytany jest z GOOGLE_CREDENTIALS w pamieci - nigdy nie
 * ladujemy go na dysk.
 */

let cachedApp: App | null = null;
let warnedMissing = false;

/** Parsuje konto uslugowe z env. Zwraca null, gdy nieskonfigurowane. */
function readServiceAccount(): Record<string, string> | null {
  const raw = process.env.GOOGLE_CREDENTIALS?.trim();
  if (!raw) return null;

  try {
    // Wartosc bywa zapisana jako czysty JSON albo jako base64.
    const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(text);
    if (parsed?.type !== 'service_account' || !parsed?.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getAdminApp(): App | null {
  if (cachedApp) return cachedApp;

  const existing = getApps();
  if (existing.length > 0) {
    cachedApp = existing[0];
    return cachedApp;
  }

  const serviceAccount = readServiceAccount();
  if (!serviceAccount) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        '[firebaseAdmin] GOOGLE_CREDENTIALS nie jest ustawione albo nie jest kontem uslugowym. ' +
          'Tokeny Firebase nie beda mintowane - logowanie SIWE zadziala, ale zapisy do Firestore ' +
          'pozostana anonimowe.'
      );
    }
    return null;
  }

  cachedApp = initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      // Klucze w env maja czesto zescapowane znaki nowej linii.
      privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
    }),
  });

  return cachedApp;
}

/**
 * Token logujacy do Firebase dla podanego adresu portfela.
 *
 * WOLAJ WYLACZNIE po udanej weryfikacji podpisu SIWE. Ta funkcja nie sprawdza
 * niczego - mintuje token dla adresu, ktory dostanie.
 *
 * Zwraca null, gdy konto uslugowe nie jest skonfigurowane. To jest celowe:
 * brak tokenu ma degradowac logowanie do dzisiejszego zachowania, a nie
 * wywalac uwierzytelnienie.
 */
export async function mintFirebaseToken(address: string): Promise<string | null> {
  const app = getAdminApp();
  if (!app) return null;

  try {
    // uid = adres w lowercase, zeby regula mogla porownywac go wprost
    // z polami dokumentow, ktore tez trzymamy w lowercase.
    return await getAuth(app).createCustomToken(address.toLowerCase(), {
      wallet: address.toLowerCase(),
    });
  } catch (error) {
    console.error('[firebaseAdmin] Nie udalo sie zmintowac tokenu:', error);
    return null;
  }
}
