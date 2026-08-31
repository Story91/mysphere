/**
 * Jednorazowa migracja: hash userOp -> hash prawdziwej transakcji w kolekcji `tips`.
 *
 * ================== CZYTAJ PRZED URUCHOMIENIEM ==================
 * To jedyny skrypt w tym repo, ktory ZAPISUJE do produkcyjnej bazy.
 * Domyslnie NIC NIE ZAPISUJE - bez flagi --apply robi wylacznie prz1egląd.
 *
 *   node scripts/migrate-userop-hashes.mjs            # podglad, zero zapisow
 *   node scripts/migrate-userop-hashes.mjs --apply    # wykonanie
 *
 * ================== PO CO ==================
 * Platnosci przez Base Pay zapisywaly do pola `txHash` to, co zwraca `pay()`,
 * a ta wartosc jest hashem userOp (ERC-4337), nie transakcji. Pod /tx/ w
 * eksploratorze jej nie ma, wiec kazdy link "verify onchain" na stronie Paid
 * prowadzil do pustej strony.
 *
 * ZMIERZONE: 17 z 17 identyfikatorow o poprawnym formacie zwracalo `null` z
 * eth_getTransactionByHash na Base mainnet (sprawdzone takze na Base Sepolia,
 * Ethereum, Optimism i Arbitrum). Te same 17 rozwiazalo sie przez bundlera na
 * transakcje, ktorych istnienie potwierdzilem na lancuchu.
 *
 * Nowe tipy zapisuja juz prawdziwy hash (app/utils/tips/resolveUserOp.ts).
 * Ten skrypt naprawia to, co zostalo w bazie.
 *
 * ================== ZASADY BEZPIECZENSTWA ==================
 * 1. Podglad domyslny. Zeby cokolwiek zapisac, trzeba swiadomie dodac --apply.
 * 2. Nie ruszamy rekordu, ktorego hash JUZ jest transakcja na lancuchu.
 * 3. Nie ruszamy rekordu, ktorego nie udalo sie rozwiazac.
 * 4. Kazdy nowy hash jest WERYFIKOWANY na lancuchu PRZED zapisem. Nie
 *    zamieniamy jednego niesprawdzonego identyfikatora na drugi.
 * 5. Stara wartosc ladzie do pola `txHashLegacyUserOp`, wiec zmiana jest
 *    odwracalna, a dowod, co bylo wczesniej, nie ginie.
 * 6. Zapis pole po polu (merge), nigdy nadpisanie calego dokumentu.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolveUserOpToTxHash } from '../app/utils/tips/resolveUserOp.ts';

const APPLY = process.argv.includes('--apply');
const RPC = 'https://mainnet.base.org';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const db = getFirestore(
  initializeApp({
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  })
);

const isTx = async (hash) => {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [hash] }),
  }).then((r) => r.json());
  return Boolean(res?.result);
};

console.log(APPLY ? '=== TRYB ZAPISU (--apply) ===' : '=== PODGLAD - nic nie zostanie zapisane ===');

const snap = await getDocs(query(collection(db, 'tips'), orderBy('timestamp', 'desc'), limit(500)));
console.log(`przejrzanych dokumentow: ${snap.size}\n`);

const licznik = { juzTransakcja: 0, doNaprawy: 0, nierozwiazane: 0, pominiete: 0, zapisane: 0, bledy: 0 };

for (const d of snap.docs) {
  const t = d.data();
  const hash = t.txHash;

  if (t.network !== 'base' || typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    licznik.pominiete++;
    continue;
  }

  // ZASADA 2 - rekord juz dobry, nie dotykamy.
  if (await isTx(hash)) {
    licznik.juzTransakcja++;
    continue;
  }

  const txHash = await resolveUserOpToTxHash(hash);
  if (!txHash) {
    // ZASADA 3 - nie zgadujemy.
    licznik.nierozwiazane++;
    console.log(`  ? ${d.id}  ${hash.slice(0, 12)}... nie do rozwiazania - ZOSTAJE bez zmian`);
    continue;
  }

  // ZASADA 4 - weryfikacja PRZED zapisem.
  if (!(await isTx(txHash))) {
    licznik.bledy++;
    console.log(`  ! ${d.id}  rozwiazano na ${txHash.slice(0, 12)}..., ale tego NIE MA na lancuchu - ZOSTAJE`);
    continue;
  }

  licznik.doNaprawy++;
  console.log(`  > ${d.id}  ${hash.slice(0, 12)}...  ->  ${txHash.slice(0, 12)}...`);

  if (APPLY) {
    try {
      // ZASADY 5 i 6 - stara wartosc zachowana, zapis pole po polu.
      await updateDoc(doc(db, 'tips', d.id), { txHash, txHashLegacyUserOp: hash });
      licznik.zapisane++;
    } catch (error) {
      licznik.bledy++;
      console.error(`  ! ${d.id} zapis nie powiodl sie:`, error.message);
    }
  }
}

console.log('\n=== PODSUMOWANIE ===');
console.log(`  juz poprawne (nietkniete):     ${licznik.juzTransakcja}`);
console.log(`  do naprawy:                    ${licznik.doNaprawy}`);
console.log(`  nie do rozwiazania (zostaja):  ${licznik.nierozwiazane}`);
console.log(`  pominiete (inna siec / brak):  ${licznik.pominiete}`);
console.log(`  bledy:                         ${licznik.bledy}`);
console.log(APPLY ? `  ZAPISANYCH:                    ${licznik.zapisane}` : '\n  Nic nie zapisano. Aby wykonac: --apply');

process.exit(licznik.bledy > 0 ? 1 : 0);
