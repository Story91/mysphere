/**
 * SONDA JEDNORAZOWA - do skasowania po uzyciu.
 * Uruchamia PRAWDZIWE funkcje z app/utils/asks/userStats.ts na produkcyjnej
 * bazie i pokazuje, ile odczytow kosztuje jedno wywolanie.
 * Nie drukuje danych osobowych ani poswiadczen.
 */
require('dotenv').config({ path: '.env.local' });

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    target: 'es2019',
    esModuleInterop: true,
    jsx: 'react',
    isolatedModules: false,
    verbatimModuleSyntax: false,
  },
});

const {
  collection, getDocs, getCountFromServer, query, limit,
} = require('firebase/firestore');
const { getPublicDb } = require('./app/utils/publicFirestore.ts');
const { getAskUserStats, getAskAuthorStats, getAskAnswererStats } =
  require('./app/utils/asks/userStats.ts');

const mask = (a) =>
  typeof a === 'string' && a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : '(brak)';

(async () => {
  const db = getPublicDb();

  console.log('=== 1. Co w ogole jest w bazie ===');
  for (const name of ['asks', 'askAnswers']) {
    try {
      const snap = await getDocs(query(collection(db, name), limit(5)));
      console.log(`  ${name}: probka ${snap.size} dok.`);
    } catch (e) {
      console.log(`  ${name}: BLAD ${e.code || e.message}`);
    }
    try {
      const c = await getCountFromServer(collection(db, name));
      console.log(`  count(${name}) = ${c.data().count}`);
    } catch (e) {
      console.log(`  count(${name}): BLAD ${e.code || e.message}  <- agregacja niedostepna`);
    }
  }

  console.log('\n=== 2. Adres do sondy ===');
  let address = process.argv[2] || null;
  if (!address) {
    const snap = await getDocs(query(collection(db, 'asks'), limit(1)));
    if (snap.size) address = snap.docs[0].data().author;
  }
  if (!address) {
    const snap = await getDocs(query(collection(db, 'askAnswers'), limit(1)));
    if (snap.size) address = snap.docs[0].data().author;
  }
  if (!address) {
    // Kolekcje Askow sa puste - bierzemy istniejacy adres z `posts`, zeby
    // zmierzyc koszt sciezki "czlowiek bez zadnego Aska".
    const snap = await getDocs(query(collection(db, 'posts'), limit(1)));
    address = snap.size ? snap.docs[0].data().author : '0x' + '0'.repeat(40);
    console.log('  Kolekcje Askow puste - sonda na adresie bez historii Askow.');
  }
  console.log('  adres:', mask(address));

  console.log('\n=== 3. getAskAuthorStats ===');
  let t = Date.now();
  const author = await getAskAuthorStats(address);
  console.log(`  odczyty: ${author.reads}, czas: ${Date.now() - t} ms`);
  console.log('  wynik:', JSON.stringify(author.stats));

  console.log('\n=== 4. getAskAnswererStats ===');
  t = Date.now();
  const answerer = await getAskAnswererStats(address);
  console.log(`  odczyty: ${answerer.reads}, czas: ${Date.now() - t} ms`);
  console.log('  wynik:', JSON.stringify(answerer.stats));

  console.log('\n=== 5. getAskUserStats (komplet, rownolegle) ===');
  t = Date.now();
  const stats = await getAskUserStats(address);
  console.log(`  ODCZYTY RAZEM: ${stats.reads}, czas: ${Date.now() - t} ms`);
  console.log('  asked:', JSON.stringify(stats.asked));
  console.log('  answered:', JSON.stringify(stats.answered));
  console.log('  address zwrocony malymi literami:', stats.address === stats.address.toLowerCase());

  console.log('\n=== 6. Adres nieistniejacy (pustka != awaria) ===');
  const none = await getAskUserStats('0x' + '1'.repeat(40));
  console.log('  odczyty:', none.reads);
  console.log('  asked === null (awaria)?', none.asked === null, '| answered === null?', none.answered === null);
  console.log('  asked:', JSON.stringify(none.asked));
  console.log('  answered:', JSON.stringify(none.answered));

  console.log('\n=== 7. Pusty adres ===');
  const empty = await getAskUserStats('');
  console.log('  odczyty:', empty.reads, '| asked:', empty.asked, '| answered:', empty.answered);

  // Kolekcje Askow sa puste, wiec nie dowioda, czy ksztalt zapytania nie
  // wymaga indeksu zlozonego. Sprawdzamy TEN SAM ksztalt na kolekcji, ktora
  // dane ma: `where(pole, 'in', [a,b])` + `where(pole2, '==', x)`.
  console.log('\n=== 8. Czy ksztalt zapytania wymaga indeksu zlozonego (na pelnej kolekcji) ===');
  const { where } = require('firebase/firestore');
  const sample = await getDocs(query(collection(db, 'posts'), limit(1)));
  const postAuthor = sample.size ? sample.docs[0].data().author : '0x0';
  const variants = Array.from(new Set([postAuthor, String(postAuthor).toLowerCase()]));
  console.log('  wariantow adresu:', variants.length);

  const shapes = [
    ['posts: author in [..] (limit 200)', query(collection(db, 'posts'), where('author', 'in', variants), limit(200))],
    ['posts: author in [..] + network == base', query(collection(db, 'posts'), where('author', 'in', variants), where('network', '==', 'base'), limit(200))],
  ];
  for (const [label, q] of shapes) {
    const start = Date.now();
    try {
      const snap = await getDocs(q);
      console.log(`  OK   ${label} -> ${snap.size} dok. = ${Math.max(1, snap.size)} odczytow, ${Date.now() - start} ms`);
    } catch (e) {
      console.log(`  FAIL ${label} -> ${e.code || e.message}`);
    }
  }

  process.exit(0);
})().catch((e) => {
  console.error('SONDA PADLA:', e.message);
  process.exit(1);
});
