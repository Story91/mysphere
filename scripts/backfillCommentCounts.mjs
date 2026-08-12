/**
 * BACKFILL LICZNIKA KOMENTARZY (`commentsCount`) DLA NAJNOWSZYCH POSTOW.
 *
 *   node scripts/backfillCommentCounts.mjs                # SUCHY BIEG, raport
 *   node scripts/backfillCommentCounts.mjs --apply        # faktyczny zapis
 *   node scripts/backfillCommentCounts.mjs --limit 250    # ile najnowszych (domyslnie 250)
 *
 * === PO CO ===
 * Feed pokazuje liczbe komentarzy z pola `commentsCount` (nowe komentarze nie
 * rosna juz w tablicy dokumentu posta). Stare posty bez tego pola maja fallback
 * z dlugosci tablicy, wiec NIC nie jest zepsute bez tej migracji - backfill
 * tylko wyrownuje gorace okno feedu, zeby liczniki byly na miejscu od razu.
 *
 * === DLACZEGO TYLKO NAJNOWSZE, A NIE CALA BAZA ===
 * Decyzja wlasciciela (2026-08-12): pelna migracja ~264k postow kosztowalaby
 * tyle odczytow co dwa pelne skany admina, a do starych postow prawie nikt nie
 * wraca. Kazdy post spoza okna dostaje licznik "przy dotknieciu" - pierwszy
 * nowy komentarz przepisuje mu dlugosc tablicy (patrz addComment).
 *
 * === BEZPIECZENSTWO ===
 *  - domyslnie SUCHY BIEG, bez --apply zero zapisow,
 *  - zapisuje WYLACZNIE pole `commentsCount`, reszta dokumentu nietykana,
 *  - pomija posty, ktore licznik juz maja (idempotentny),
 *  - odczyty = dokladnie --limit dokumentow, ani jednego wiecej.
 */
import { config } from 'dotenv';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit as fsLimit,
  writeBatch,
} from 'firebase/firestore';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const limitArgIndex = process.argv.indexOf('--limit');
const LIMIT = limitArgIndex !== -1 ? Number(process.argv[limitArgIndex + 1]) : 250;
if (!Number.isInteger(LIMIT) || LIMIT <= 0 || LIMIT > 5000) {
  console.error('--limit musi byc liczba calkowita w zakresie 1-5000');
  process.exit(1);
}

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);

const BATCH_SIZE = 400;

console.log(
  APPLY
    ? `TRYB: ZAPIS (--apply). Najnowsze ${LIMIT} postow dostanie commentsCount.`
    : `TRYB: SUCHY BIEG. Zaden dokument nie zostanie zmieniony. Dodaj --apply, zeby zapisac.`
);

const snap = await getDocs(
  query(collection(db, 'posts'), orderBy('timestamp', 'desc'), fsLimit(LIMIT))
);

let toSet = 0;
let alreadySet = 0;
let batch = writeBatch(db);
let inBatch = 0;

for (const postDoc of snap.docs) {
  const data = postDoc.data();
  if (typeof data.commentsCount === 'number') {
    alreadySet += 1;
    continue;
  }
  const count = Array.isArray(data.comments) ? data.comments.length : 0;
  toSet += 1;
  if (APPLY) {
    batch.update(postDoc.ref, { commentsCount: count });
    inBatch += 1;
    if (inBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      inBatch = 0;
    }
  }
}

if (APPLY && inBatch > 0) await batch.commit();

console.log(
  `Przejrzane: ${snap.size} postow. Licznik juz mialo: ${alreadySet}. ` +
    (APPLY ? `Zapisano: ${toSet}.` : `Do zapisania (po --apply): ${toSet}.`)
);
process.exit(0);
