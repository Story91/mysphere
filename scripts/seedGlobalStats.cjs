/**
 * Jednorazowe wypelnienie dokumentu globalStats/current.
 *
 *   node scripts/seedGlobalStats.cjs           <- podglad, nic nie zapisuje
 *   node scripts/seedGlobalStats.cjs --apply   <- zapis
 *
 * === PO CO ===
 * Liczniki w panelu Trends przestaly pokazywac cokolwiek, bo przepisalem je
 * ze ZMYSLONYCH wartosci wpisanych na sztywno na odczyt prawdziwego dokumentu -
 * a tego dokumentu jeszcze nie bylo. Regresja moja: usunalem falszywe zrodlo,
 * nie dostarczajac prawdziwego.
 *
 * === SKAD TE LICZBY ===
 * Zmierzone TEGO SAMEGO DNIA agregacja getCountFromServer na produkcyjnej
 * bazie, przy okazji przywracania panelu admina:
 *
 *   uzytkownicy  184 064
 *   posty        263 613
 *   komentarze    13 492
 *   tipy             188
 *
 * LIKES ZOSTAJE PUSTE. Nie zmierzylem go wtedy, a dobowy limit zapytan
 * agregujacych jest w tej chwili wyczerpany. Wpisanie tu czegokolwiek byloby
 * powrotem do dokladnie tego, co ten plik naprawia. `null` wyswietli sie jako
 * kreska - i to jest uczciwa odpowiedz.
 *
 * Docelowo ten dokument zapisuje PANEL ADMINA po swoim przeliczeniu. Ten skrypt
 * jest jednorazowa podkladka, zeby feed nie stal pusty do czasu, az ktos wejdzie
 * na /admin i kliknie "Policz".
 */
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, serverTimestamp } = require('firebase/firestore');

const APPLY = process.argv.includes('--apply');

const POMIAR = {
  users: 184064,
  posts: 263613,
  comments: 13492,
  tips: 188,
  // likes: swiadomie POMINIETE - patrz naglowek.
};

(async () => {
  const db = getFirestore(
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  );

  const ref = doc(db, 'globalStats', 'current');
  const istnieje = await getDoc(ref);

  console.log(APPLY ? '=== ZAPIS ===' : '=== PODGLAD (nic nie zapisuje) ===');
  console.log('  dokument istnieje:', istnieje.exists() ? 'TAK' : 'nie');
  for (const [k, v] of Object.entries(POMIAR)) {
    console.log(`  ${k.padEnd(10)} ${v}`);
  }
  console.log('  likes      (pominiete - nie zmierzone)');

  if (!APPLY) {
    console.log('\n  Aby zapisac: --apply');
    process.exit(0);
  }

  await setDoc(ref, { ...POMIAR, measuredAt: serverTimestamp() }, { merge: true });
  const po = await getDoc(ref);
  console.log('\n  ZAPISANO. Odczyt kontrolny:', JSON.stringify(po.data()));
  process.exit(0);
})();
