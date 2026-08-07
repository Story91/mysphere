/**
 * SONDA PISOWNI ADRESOW - SAME ODCZYTY, ANI JEDNEGO ZAPISU.
 *
 *   node scripts/countMixedCaseAddresses.mjs
 *
 * === PO CO ===
 * Adresy trafialy do Firestore w takiej postaci, w jakiej podal je portfel:
 * raz checksuma (0xAbC...), raz malymi literami (0xabc...). Firestore porownuje
 * stringi BAJT PO BAJCIE, wiec `where('recipientAddress','==', mojAdres)` mija
 * dokument zapisany w drugiej pisowni. Efekt: czyjs napiwek nie pojawia sie
 * w jego ksiedze na /money, mimo ze transakcja jest na lancuchu.
 *
 * Zapisy sa juz naprawione (patrz normalizeAddress w app/utils/monetization/
 * types.ts), ale REKORDY ZAPISANE WCZESNIEJ nie znikna same. Ten skrypt mowi,
 * ilu dokladnie dotyczy problem - czyli czy migracja w ogole ma sens.
 *
 * === KOSZT ===
 * `tips`, `unlocks`, `referrals`, `asks`, `askAnswers` sa male (rzedu setek
 * dokumentow) i czytamy je w calosci. `users` ma ~184 tys. dokumentow i NIE
 * JEST skanowane - sondujemy wylacznie adresy, ktore realnie wystapily w tamtych
 * kolekcjach, paczkami po 30 przez where(documentId(),'in',...).
 */
import { config } from 'dotenv';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  documentId,
  limit,
} from 'firebase/firestore';

config({ path: '.env.local' });

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);

/** Adres "nieznormalizowany" = rozni sie od swojej wersji malymi literami. */
const isMixed = (value) =>
  typeof value === 'string' && value.trim() !== '' && value.trim() !== value.trim().toLowerCase();

/** Kolekcje na tyle male, ze wolno je przeczytac w calosci, i ich pola adresowe. */
const SMALL_COLLECTIONS = [
  ['tips', ['senderAddress', 'recipientAddress']],
  ['unlocks', ['walletAddress', 'creatorAddress']],
  ['referrals', ['referredAddress', 'referrerId']],
  ['asks', ['author']],
  ['askAnswers', ['author']],
];

const addressesSeen = new Set();
/** Ta sama lista, ale W PISOWNI ZASTANEJ - bez tego sonda `users` bada tylko polowe hipotezy. */
const rawAddressesSeen = new Set();
let totalMixedDocs = 0;

for (const [name, fields] of SMALL_COLLECTIONS) {
  try {
    const snapshot = await getDocs(collection(db, name));
    const perField = {};
    let docsWithAny = 0;

    for (const entry of snapshot.docs) {
      const data = entry.data();
      let any = false;
      for (const field of fields) {
        const value = data[field];
        if (typeof value === 'string' && value.trim()) {
          addressesSeen.add(value.trim().toLowerCase());
          rawAddressesSeen.add(value.trim());
        }
        if (isMixed(value)) {
          perField[field] = (perField[field] || 0) + 1;
          any = true;
        }
      }
      if (any) docsWithAny++;
    }

    totalMixedDocs += docsWithAny;
    console.log(`\n== ${name}: ${snapshot.size} dokumentow`);
    for (const field of fields) {
      console.log(`   ${field.padEnd(18)} nieznormalizowanych: ${perField[field] || 0}`);
    }
    console.log(`   dokumentow do poprawy: ${docsWithAny}`);
  } catch (error) {
    // AWARIA != PUSTKA: nieudany odczyt ma wlasny komunikat, nie liczy sie jako zero.
    console.log(`\n== ${name}: ODCZYT PADL (${error?.code || error}) - liczba NIEZNANA, nie zero`);
  }
}

/**
 * users: profil stoi pod ID = adres. Gdy ID jest checksuma, a kod pyta malymi
 * literami, czlowiek widzi PUSTY profil zamiast swojego. Sonda punktowa.
 */
const all = [...addressesSeen];
console.log(`\n== users: sonda po ${all.length} adresach widzianych wyzej (bez skanu kolekcji)`);

const foundLower = new Set();
for (let i = 0; i < all.length; i += 30) {
  const batch = all.slice(i, i + 30);
  try {
    const snapshot = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', batch)));
    for (const entry of snapshot.docs) foundLower.add(entry.id);
  } catch (error) {
    console.log(`   paczka od ${i}: PADLA (${error?.code || error})`);
  }
}
console.log(`   profili pod ID malymi literami: ${foundLower.size}`);

const missing = all.filter((address) => !foundLower.has(address));
console.log(`   adresow bez profilu pod mala pisownia: ${missing.length}`);

/**
 * Te same adresy W PISOWNI ZASTANEJ. Jesli profile stoja tutaj, a nie wyzej, to
 * znaczy, ze kanoniczna postac ID w `users` jest CHECKSUMA - i normalizowanie
 * zapisow do tej kolekcji rozszczepiloby kazdy istniejacy profil.
 */
const rawOnly = [...rawAddressesSeen].filter((address) => address !== address.toLowerCase());
const foundRaw = new Set();
for (let i = 0; i < rawOnly.length; i += 30) {
  const batch = rawOnly.slice(i, i + 30);
  try {
    const snapshot = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', batch)));
    for (const entry of snapshot.docs) foundRaw.add(entry.id);
  } catch (error) {
    console.log(`   paczka checksum od ${i}: PADLA (${error?.code || error})`);
  }
}
console.log(`   profili pod ID w pisowni checksum (z ${rawOnly.length} sprawdzonych): ${foundRaw.size}`);

console.log(`\nRAZEM dokumentow z adresem w innej pisowni niz znormalizowana: ${totalMixedDocs}`);
console.log('Zaden dokument NIE ZOSTAL zmieniony - to byl sam odczyt.');
process.exit(0);
