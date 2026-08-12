/**
 * Stan poczatkowy lajkow z ZAMROZONEJ MIGAWKI - bez czytania bazy.
 *
 *   node scripts/setLikesBaselineFromSnapshot.cjs           <- podglad, nic nie zapisuje
 *   node scripts/setLikesBaselineFromSnapshot.cjs --apply   <- zapis do globalStats/current
 *
 * KOSZT: jeden odczyt (kontrola dokumentu przed zapisem) i jeden zapis.
 * Zero skanowania postow. To jest cala jego racja bytu.
 *
 * URUCHOMIONY 2026-08-13 (--apply): likesBaseline=18817 wpisany do
 * globalStats/current przy likesSince=58, suma na kaflu 18875 z podpisem
 * "at least". Ponowne uruchomienie jest idempotentne (merge tej samej liczby).
 *
 * ===========================================================================
 * SKAD TA LICZBA
 * ===========================================================================
 * Z historii gita, nie z powietrza. Commit 978e151 "daily stats update"
 * (2025-08-16 03:37:16 +0200), plik app/basechat/page.tsx:
 *
 *     const [totalLikes, setTotalLikes] = useState(18817);
 *
 * a obok, z tej samej migawki: users 175 708, posts 239 961, comments 10 972.
 *
 * ===========================================================================
 * DLACZEGO UZNAJEMY TO ZA POMIAR, A NIE ZA LICZBE Z POWIETRZA
 * ===========================================================================
 * Pytanie jest powazne, bo ten sam plik po chwili mnozyl te liczby przez
 * losowy wspolczynnik "dla realizmu" - czyli w tym pliku FALSZOWANIE liczb
 * naprawde wystepowalo. Sprawdzone zostalo wiec kazde "za" osobno:
 *
 * 1. To nie jedna liczba, tylko koncowka serii recznych commitow
 *    "daily stats update". Wartosci `totalLikes` w kolejnych migawkach:
 *      2025-07-18  14 563     2025-08-12  18 420
 *      2025-07-21  15 531     2025-08-16  18 817
 *      2025-07-25  15 921
 *
 * 2. Przyrosty sa NIEROWNE i nie ukladaja sie w zadna formule: +968 przez trzy
 *    dni, potem +390 przez cztery, potem +2499 przez osiemnascie, potem +397
 *    przez cztery. Liczba zmyslana rosnie rowno, bo zmyslajacy nie ma powodu
 *    udawac zastoju.
 *
 * 3. Stosunek lajkow do uzytkownikow DRYFUJE (0,129 -> 0,131 -> 0,118 -> 0,108
 *    -> 0,107), wiec lajki nie byly wyliczane z liczby uzytkownikow mnoznikiem.
 *
 * 4. Najmocniejszy dowod: w tej samej serii `transactionsCount` STOI NIERUCHOMO
 *    na 40 818, podczas gdy pozostale cztery liczby rosna przy kazdym commicie.
 *    Ktos, kto wpisuje liczby z sufitu, podbija wszystkie. Ktos, kto WKLEJA
 *    ODCZYT, aktualizuje to, co potrafil zmierzyc, i zostawia reszte w spokoju.
 *
 * 5. Kierunek sie zgadza z tym, co zmierzono na produkcji w 2026-08:
 *    users 184 064 > 175 708, comments 13 492 > 10 972, posts 263 613 > 239 961.
 *    Wszystkie trzy wyzsze i o wiarygodna skale.
 *
 * SPRAWDZONY I ODRZUCONY ZARZUT: w tym samym commicie stoi tez `totalUsers:
 * 146 650`, czyli inna liczba uzytkownikow niz 175 708. Wygladalo to na
 * sprzecznosc dyskwalifikujaca cala migawke. To NIE JEST sprzecznosc - tamta
 * liczba siedzi w app/mycamp/page.tsx i ma obok siebie rozbicie na twitter /
 * spotify / tiktok. To licznik MyCampu, osobnego produktu.
 *
 * ===========================================================================
 * DLACZEGO WYNIK JEST DOLNA GRANICA, A NIE POMIAREM
 * ===========================================================================
 * Migawka opisuje 16 sierpnia 2025. Licznik przyrostowy (`likesSince`) ruszyl
 * duzo pozniej. Lajki postawione POMIEDZY tymi dwoma momentami nie sa ani
 * w migawce, ani w liczniku - NIKT ICH NIE POLICZYL i ten skrypt ich nie
 * odzyska. To rok z okladem dziury.
 *
 * Dlatego zapisuje `likesBaselineSource: 'snapshot'`. To pole nie jest metadana
 * dla porzadku - na jego podstawie likesTotal() w app/utils/stats/globalStats.ts
 * ustawia `basis: 'lowerBound'`, a kafel dostaje podpis "at least". Zapisanie
 * tej liczby BEZ tego pola zamienialoby domysl w pomiar, czyli powtarzaloby
 * dokladnie ten blad, ktory usuwano z tego pliku.
 *
 * Data w `likesBaselineAt` to znacznik commita. Pomiar zostal zrobiony wtedy
 * albo chwile wczesniej - przy roku luki ta roznica nic nie zmienia, ale niech
 * bedzie napisane, skad ta data jest.
 *
 * ===========================================================================
 * DLACZEGO NIE ZERUJEMY `likesSince` - INACZEJ NIZ ROBI TO SKAN
 * ===========================================================================
 * countLikesBaseline.cjs przy zapisie odejmuje `likesSince`, bo skan widzi
 * lajki NA TERAZ, czyli razem z tymi, ktore licznik juz sobie doliczyl - bez
 * odjecia byly policzone dwa razy.
 *
 * Tutaj jest odwrotnie. Migawka opisuje stan sprzed startu licznika, wiec te
 * dwa zbiory sa ROZLACZNE. Nie ma zakladki do usuniecia, a wyzerowanie licznika
 * skasowaloby prawdziwe, policzone lajki. Zostawiamy `likesSince`
 * i `likesSinceStartedAt` nietkniete.
 *
 * Zeby to nie bylo zalozeniem, ktore kiedys cicho przestanie byc prawda, skrypt
 * ODMAWIA zapisu, gdy `likesSinceStartedAt` jest WCZESNIEJSZY niz data migawki.
 * Taki uklad znaczylby, ze licznik chodzil juz przed migawka, czyli zbiory
 * jednak zachodza - i suma zawyzalaby zamiast zanizac.
 */
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, Timestamp } = require('firebase/firestore');

const APPLY = process.argv.includes('--apply');

/** Liczba i data z commita 978e151 - uzasadnienie w naglowku. */
const MIGAWKA = {
  likes: 18817,
  at: new Date('2025-08-16T01:37:16.000Z'), // 2025-08-16 03:37:16 +0200
  commit: '978e151',
};

/** Milisekundy z Timestamp / Date / liczby. Brak daty daje 0, nie dzisiaj. */
function naMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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
  const snap = await getDoc(ref);
  const dane = snap.exists() ? snap.data() : {};

  const likesSince = Number(dane.likesSince) || 0;
  const likesSinceStartedAt = naMs(dane.likesSinceStartedAt);
  const zrodlo = dane.likesBaselineSource;

  console.log(APPLY ? '=== ZAPIS STANU POCZATKOWEGO Z MIGAWKI ===' : '=== PODGLAD (nic nie zapisuje) ===');
  console.log('  migawka          :', MIGAWKA.likes, 'lajkow, commit', MIGAWKA.commit);
  console.log('  data migawki     :', MIGAWKA.at.toISOString());
  console.log('  likesSince w bazie:', likesSince);
  console.log('  licznik ruszyl   :', likesSinceStartedAt ? new Date(likesSinceStartedAt).toISOString() : '(brak daty)');
  console.log('  suma po zapisie  :', MIGAWKA.likes + likesSince, '(kafel pokaze to z podpisem "at least")');

  // ---- Odmowa 1: prawdziwy skan jest lepszy od migawki i nie wolno go zdeptac.
  if (zrodlo === 'scan') {
    console.error('\n  W bazie stoi juz stan poczatkowy z PRAWDZIWEGO SKANU (likesBaselineSource: "scan").');
    console.error('  To liczba dokladna. Nadpisanie jej migawka sprzed roku zamienialoby pomiar');
    console.error('  na domysl i cofaloby kafel z liczby dokladnej do dolnej granicy. NIC NIE ROBIE.');
    process.exit(1);
  }

  // ---- Odmowa 2: zbiory musza byc rozlaczne, inaczej suma zawyza.
  if (likesSinceStartedAt && likesSinceStartedAt < MIGAWKA.at.getTime()) {
    console.error('\n  Licznik przyrostowy ruszyl PRZED data migawki.');
    console.error('  Znaczy to, ze lajki z okresu po starcie licznika sa juz i w migawce, i w liczniku,');
    console.error('  wiec `likesBaseline + likesSince` policzyloby je dwa razy i dalo liczbe ZAWYZONA.');
    console.error('  Dolna granica moze byc zanizona - zawyzona nie moze. NIC NIE ZAPISUJE.');
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\n  Aby zapisac: --apply');
    process.exit(0);
  }

  await setDoc(
    ref,
    {
      likesBaseline: MIGAWKA.likes,
      likesBaselineAt: Timestamp.fromDate(MIGAWKA.at),
      // Bez tego pola liczba udawalaby pomiar - patrz naglowek.
      likesBaselineSource: 'snapshot',
      // Slad, skad to wzieto, zeby nie trzeba bylo wierzyc na slowo.
      likesBaselineCommit: MIGAWKA.commit,
      // `likesSince` i `likesSinceStartedAt` CELOWO nietkniete - patrz naglowek.
      //
      // `measuredAt` TEZ NIE. To data pomiaru users/posts/comments/tips, a tych
      // ten skrypt nie dotyka. Odswiezenie jej tutaj postarzyloby o zero liczby,
      // ktorych nikt nie przeliczyl - czyli kafle mowilyby "policzone przed
      // chwila" o pomiarze sprzed dni. Wiek ma opisywac pomiar, nie ostatni
      // zapis do dokumentu.
    },
    { merge: true }
  );

  console.log('\n  ZAPISANO. Kafel Likes pokaze', MIGAWKA.likes + likesSince, 'z podpisem "at least".');
  console.log('  Zdjac ten podpis moze WYLACZNIE pelny skan (countLikesBaseline.cjs),');
  console.log('  bo tylko on domyka luke miedzy migawka a startem licznika.');
  process.exit(0);
})();
