/**
 * JEDNORAZOWE policzenie stanu poczatkowego lajkow (`likesBaseline`).
 *
 *   node scripts/countLikesBaseline.cjs            <- podglad: liczy i POKAZUJE, nic nie zapisuje
 *   node scripts/countLikesBaseline.cjs --apply    <- liczy i zapisuje do globalStats/current
 *   node scripts/countLikesBaseline.cjs --after=<docId>   <- wznowienie od miejsca przerwania
 *
 * TEN SKRYPT NIE ZOSTAL URUCHOMIONY. Decyzja nalezy do wlasciciela, bo
 * KOSZTUJE ODCZYTY: jeden odczyt na kazdy post, czyli okolo 263 613 odczytow
 * za jedno przejscie (~$0,16 przy cenniku $0,06 / 100 tys.). To jest wydatek
 * JEDNORAZOWY - po nim liczba utrzymuje sie sama licznikiem przyrostowym.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * "Calkowita liczba lajkow" nie pokazuje sie w panelu Trends, bo NIE ISTNIEJE
 * nigdzie w bazie. Lajki nie maja wlasnej kolekcji - siedza jako pole `likes`
 * na postach, wiec ich suma wymaga przejscia przez cwierc miliona dokumentow
 * albo `getAggregateFromServer(sum('likes'))`. Agregacje w tym projekcie
 * zwracaja RESOURCE_EXHAUSTED nawet dla pustej kolekcji, wiec zostaje przejscie.
 *
 * Wprowadzony wczesniej licznik przyrostowy (`likesSince`, +1/-1 przy kazdym
 * lajku w toggleLike) rozwiazuje przyszlosc, ale nie przeszlosc: zaczyna od
 * zera. Odczytany stan dokumentu globalStats/current:
 *
 *     { users: 184064, posts: 263613, comments: 13492, tips: 188, likesSince: 6 }
 *
 * Szesc. Tyle wie aplikacja o lajkach, ktorych sa dziesiatki tysiecy.
 *
 * Ten skrypt liczy brakujaca czesc RAZ, serwerowo (firebase-admin, poza
 * limitami klienta i poza regulami), i zapisuje ja jako `likesBaseline`.
 * Interfejs pokazuje `likesBaseline + likesSince` - patrz likesTotal()
 * w app/utils/stats/globalStats.ts.
 *
 * ===========================================================================
 * DLACZEGO ZAPIS ZERUJE `likesSince` - I DLACZEGO PRZEZ increment(), NIE 0
 * ===========================================================================
 * Skan widzi lajki takie, jakie sa NA POSTACH w chwili liczenia - czyli razem
 * z tymi, ktore licznik przyrostowy juz sobie doliczyl. Zostawienie obu wartosci
 * obok siebie dawaloby te lajki policzone DWA RAZY.
 *
 * Odejmujemy wiec przez `increment(-S0)`, gdzie S0 to wartosc `likesSince`
 * odczytana tuz przed zapisem, a nie przez wpisanie zera. Roznica jest istotna:
 * lajk, ktory trafi tu miedzy odczytem a zapisem, przy `increment` OCALEJE,
 * a przy `set: 0` zostalby cicho skasowany.
 *
 * ===========================================================================
 * CZEGO TEN SKRYPT NIE ROBI
 * ===========================================================================
 * Nie uzywa transakcji ani agregacji (jedno i drugie na tym projekcie odmawia)
 * i nie trzyma postow w pamieci - idzie stronami po 1000 dokumentow, biorac
 * przez `select('likes')` SAMO to pole, wiec nie sciaga tresci postow.
 *
 * Nie liczy lajkow z kolekcji `likes` ani z `likedBy` - zrodlem prawdy jest
 * pole `likes` na poscie, bo to je pokazuje karta posta i to je zmienia
 * toggleLike.
 */
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const APPLY = process.argv.includes('--apply');
const AFTER = (process.argv.find((a) => a.startsWith('--after=')) || '').split('=')[1] || null;

/** Strona skanu. 1000 to gorny limit zdrowego rozsadku dla jednego zapytania. */
const BATCH = 1000;

/**
 * Konto uslugowe z GOOGLE_CREDENTIALS - ta sama sciezka co w aplikacji
 * (app/utils/auth/firebaseAdmin.ts), razem z ratunkiem na parser .env, ktory
 * przy podwojnych cudzyslowach rozwija `\n` w SUROWY znak nowej linii i psuje
 * JSON-a. To kosztowalo kiedys dwa dni szukania.
 */
function readServiceAccount() {
  const raw = process.env.GOOGLE_CREDENTIALS?.trim();
  if (!raw) return null;
  const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
  }
}

(async () => {
  const serviceAccount = readServiceAccount();
  if (!serviceAccount || serviceAccount.type !== 'service_account') {
    console.error(
      'GOOGLE_CREDENTIALS nie jest ustawione albo nie jest kontem uslugowym.\n' +
        'Bez niego nie ma jak czytac bazy z pominieciem limitow klienta.'
    );
    process.exit(1);
  }

  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore, FieldPath, FieldValue, Timestamp } = require('firebase-admin/firestore');

  const app = initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: String(serviceAccount.private_key).replace(/\\n/g, '\n'),
    }),
  });
  const db = getFirestore(app);

  console.log(APPLY ? '=== LICZENIE + ZAPIS ===' : '=== LICZENIE (podglad, nic nie zapisuje) ===');
  if (AFTER) console.log('  wznowienie po dokumencie:', AFTER);

  let suma = 0;
  let przejrzane = 0;
  let bezPola = 0;
  let dziwne = 0; // pole jest, ale nie jest sensowna liczba - liczymy je OSOBNO
  let kursor = AFTER;
  const start = Date.now();

  try {
    for (;;) {
      let q = db
        .collection('posts')
        .select('likes')
        .orderBy(FieldPath.documentId())
        .limit(BATCH);
      if (kursor) q = q.startAfter(kursor);

      const snap = await q.get();
      if (snap.empty) break;

      for (const docSnap of snap.docs) {
        przejrzane++;
        const value = docSnap.get('likes');
        if (value === undefined || value === null) {
          bezPola++;
          continue;
        }
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) {
          dziwne++;
          continue;
        }
        suma += n;
      }

      kursor = snap.docs[snap.docs.length - 1].id;
      console.log(
        `  ...${przejrzane} postow, suma ${suma}, ostatni id ${kursor}` +
          ` (${Math.round((Date.now() - start) / 1000)}s)`
      );

      if (snap.size < BATCH) break;
    }
  } catch (error) {
    // Przerwanie w polowie NIE jest katastrofa - podajemy kursor do wznowienia.
    // Zapisanie tego, co udalo sie policzyc, byloby zapisaniem liczby ZANIZONEJ
    // jako calkowitej, czyli dokladnie tym bledem, ktory ten skrypt naprawia.
    console.error('\n  SKAN PRZERWANY:', error && error.message ? error.message : error);
    console.error(`  Policzono ${przejrzane} postow. Wznow: --after=${kursor || '(od poczatku)'}`);
    console.error('  NIC NIE ZAPISANO - czesciowa suma nie jest stanem poczatkowym.');
    process.exit(1);
  }

  console.log('\n  postow przejrzanych :', przejrzane);
  console.log('  bez pola `likes`    :', bezPola, '(traktowane jak 0 - post bez lajkow)');
  console.log('  pole nie-liczbowe   :', dziwne, '(pominiete, patrz kod)');
  console.log('  SUMA LAJKOW         :', suma);

  if (!AFTER && przejrzane === 0) {
    console.error('\n  Zero postow - to nie wyglada na te baze. Nic nie zapisuje.');
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\n  Aby zapisac do globalStats/current: --apply');
    process.exit(0);
  }

  if (AFTER) {
    // Wznowienie liczy tylko OGON kolekcji, wiec jego suma nie jest calosc.
    console.error('\n  --after i --apply naraz: NIE. Suma z wznowienia obejmuje');
    console.error('  tylko czesc kolekcji i zapisana byloby liczba zanizona.');
    process.exit(1);
  }

  const ref = db.collection('globalStats').doc('current');
  const przed = await ref.get();
  const S0 = Number(przed.get('likesSince')) || 0;

  await ref.set(
    {
      likesBaseline: suma,
      likesBaselineAt: Timestamp.now(),
      likesBaselinePosts: przejrzane,
      // Odjecie stanu licznika przyrostowego - uzasadnienie w naglowku.
      likesSince: FieldValue.increment(-S0),
      likesSinceStartedAt: Timestamp.now(),
    },
    { merge: true }
  );

  const po = await ref.get();
  console.log('\n  ZAPISANO. likesSince przed zapisem:', S0);
  console.log('  Odczyt kontrolny:', JSON.stringify(po.data()));
  console.log('  Panel Trends pokaze teraz likesBaseline + likesSince jako liczbe CALKOWITA.');
  process.exit(0);
})();
