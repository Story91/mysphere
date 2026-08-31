/**
 * MIGRACJA PISOWNI ADRESOW W KOLEKCJI `tips`.
 *
 * =====================================================================
 *  TEN SKRYPT NIE ZOSTAL URUCHOMIONY. ZAPISUJE DO PRODUKCYJNEJ BAZY.
 *  Uruchomienie go jest DECYZJA WLASCICIELA BAZY, nie skutkiem ubocznym
 *  poprawki w kodzie. Najpierw przeczytaj cala te glowke.
 * =====================================================================
 *
 *   node scripts/migrateAddressCasing.mjs            # SUCHY BIEG, tylko raport
 *   node scripts/migrateAddressCasing.mjs --apply    # faktyczny zapis
 *
 * === CO NAPRAWIA ===
 * Adresy trafialy do `tips` w pisowni podanej przez portfel (zwykle checksuma).
 * Firestore porownuje stringi bajt po bajcie, wiec zapytanie o `0xabc...` mijalo
 * dokument zapisany jako `0xAbC...` - czyjs napiwek nie pojawial sie w jego
 * ksiedze na /money, mimo ze transakcja byla na lancuchu.
 *
 * Zapisy sa juz naprawione (`saveTip`), a odczyty pytaja o oba warianty. Ta
 * migracja jest po to, zeby MOC KIEDYS USUNAC warstwe zgodnosci wstecznej -
 * nie jest potrzebna do poprawnego dzialania aplikacji dzisiaj.
 *
 * Stan zmierzony sonda (scripts/countMixedCaseAddresses.mjs):
 *   tips: 187 z 189 dokumentow ma adres w innej pisowni niz znormalizowana.
 *
 * === CZEGO TEN SKRYPT CELOWO NIE RUSZA ===
 * `users` i `referralStats` trzymaja dokumenty pod IDENTYFIKATOREM rownym
 * adresowi, a te identyfikatory sa CHECKSUMA - sonda znalazla 265 profili pod
 * checksuma i ZERO pod mala pisownia. Tam mala pisownia NIE JEST postacia
 * kanoniczna i "normalizacja" oznaczalaby przepisanie kazdego profilu pod nowy
 * identyfikator, czyli operacje kasujaco-tworzaca na koncie kazdego uzytkownika.
 *
 * Z tego samego powodu poza zakresem sa pola `referrals.referredAddress`
 * i `referrals.referrerId` (234 z 234 w checksumie): oba sa KLUCZAMI OBCYMI do
 * `users` / `referralStats`. Znormalizowanie ich bez jednoczesnego przeniesienia
 * tamtych dokumentow rozpieloby polecenia od profili, ktorych dotycza.
 *
 * `unlocks`, `subscriptions`, `asks` i `askAnswers` sa juz zapisywane malymi
 * literami i sonda nie znalazla w nich ani jednego dokumentu do poprawy.
 *
 * === BEZPIECZENSTWO ===
 *  - domyslnie SUCHY BIEG: bez `--apply` nie leci ani jeden zapis,
 *  - zapisuje wylacznie pola `senderAddress` i `recipientAddress`, przez
 *    `update` z dwoma polami - reszta dokumentu jest nietykana,
 *  - NIE zmienia identyfikatorow dokumentow, wiec nie psuje zadnego odnosnika,
 *  - `runTransaction` i `getCountFromServer` sa na tym projekcie niedostepne
 *    (RESOURCE_EXHAUSTED), wiec migracja idzie zwyklym `writeBatch` po 400,
 *  - jest IDEMPOTENTNA: ponowne uruchomienie nie ma co poprawiac i konczy sie
 *    zerem zmian.
 *
 * === PRZED URUCHOMIENIEM ===
 * Zrob eksport kolekcji `tips` (189 dokumentow, wiec jest to tanie):
 *   gcloud firestore export gs://<bucket>/tips-backup --collection-ids=tips
 */
import { config } from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch } from 'firebase/firestore';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);

const ADDRESS_FIELDS = ['senderAddress', 'recipientAddress'];
const BATCH_SIZE = 400;

console.log(
  APPLY
    ? 'TRYB: ZAPIS (--apply). Dokumenty zostana zmienione.'
    : 'TRYB: SUCHY BIEG. Zaden dokument nie zostanie zmieniony. Dodaj --apply, zeby zapisac.'
);

let snapshot;
try {
  snapshot = await getDocs(collection(db, 'tips'));
} catch (error) {
  // AWARIA != PUSTKA: bez odczytu nie wiemy nic i nie wolno nam ruszyc dalej.
  console.error(`ODCZYT KOLEKCJI PADL (${error?.code || error}). Nic nie zmieniono.`);
  process.exit(1);
}

const pending = [];
for (const entry of snapshot.docs) {
  const data = entry.data();
  const patch = {};

  for (const field of ADDRESS_FIELDS) {
    const value = data[field];
    if (typeof value !== 'string' || !value.trim()) continue;
    const normalized = value.trim().toLowerCase();
    if (normalized !== value) patch[field] = normalized;
  }

  if (Object.keys(patch).length > 0) pending.push({ ref: entry.ref, id: entry.id, patch });
}

console.log(`Przeczytano ${snapshot.size} dokumentow, do poprawy: ${pending.length}.`);

if (pending.length === 0) {
  console.log('Nie ma czego migrowac.');
  process.exit(0);
}

for (const item of pending.slice(0, 5)) {
  console.log(`  przyklad ${item.id}: ${JSON.stringify(item.patch)}`);
}
if (pending.length > 5) console.log(`  ... i ${pending.length - 5} wiecej`);

if (!APPLY) {
  console.log('\nSUCHY BIEG - nic nie zapisano. Uruchom z --apply, zeby wykonac migracje.');
  process.exit(0);
}

let written = 0;
for (let i = 0; i < pending.length; i += BATCH_SIZE) {
  const slice = pending.slice(i, i + BATCH_SIZE);
  const batch = writeBatch(db);
  for (const item of slice) batch.update(item.ref, item.patch);

  try {
    await batch.commit();
    written += slice.length;
    console.log(`  zapisano ${written}/${pending.length}`);
  } catch (error) {
    console.error(`PACZKA OD ${i} PADLA (${error?.code || error}).`);
    console.error(`Zapisano ${written} z ${pending.length}. Migracja jest idempotentna - mozna uruchomic ponownie.`);
    process.exit(1);
  }
}

console.log(`\nGOTOWE: ${written} dokumentow ma teraz adres malymi literami.`);
console.log('Warstwe zgodnosci wstecznej w odczytach mozna usunac dopiero, gdy sonda pokaze zero.');
process.exit(0);
