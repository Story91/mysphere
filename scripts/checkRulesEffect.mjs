/**
 * Sonda regul Firestore - SAME ODCZYTY, zadnego zapisu.
 *
 *   node scripts/checkRulesEffect.mjs
 *
 * === PO CO ===
 * Reguly Firestore sa SUMOWANE: dostep jest przyznany, gdy pozwala
 * JAKAKOLWIEK pasujaca regula. Na koncu firestore.rules stal przez dlugi czas
 * rekursywny `match /{document=**} { allow read, write: if true; }`, ktory
 * pasowal do kazdego dokumentu w bazie - i przez to uniewazniał wszystkie
 * reguly nad soba. `askAnswerContent` mialo `allow read: if false` i bylo
 * czytelne dla kazdej przegladarki, mimo ze opis /asks obiecuje odpowiedzi
 * zapieczetowane do rozstrzygniecia.
 *
 * Ten skrypt sprawdza JEDNA rzecz, ktorej nie da sie sprawdzic czytaniem
 * pliku regul: czy po wdrozeniu zachowanie faktycznie sie zmienilo.
 *
 * Uzywa KLIENCKIEGO SDK (nie administracyjnego) - administracyjny omija reguly
 * z definicji, wiec sonda oparta na nim zawsze pokazywalaby sukces i nie
 * mowilaby nic. To musi byc ta sama droga, ktora ma przegladarka.
 *
 * === JAK CZYTAC WYNIK ===
 *   posts, users        -> MUSZA byc czytelne. Zamkniecie ich zepsuloby feed.
 *   asks, askAnswers    -> MUSZA byc czytelne (metadane sa jawne z zalozenia).
 *   askAnswerContent    -> MUSI byc ODMOWA. To jest ta obietnica z /asks.
 *   premiumContent      -> MUSI byc ODMOWA. To jest tresc, za ktora ktos placi.
 *   solanaPostReceipts  -> MUSI byc ODMOWA. Rejestr portfeli do wyplat z Solany.
 *
 * === SCIEZKI PIECZECI ASKOW (asks/{id}/sealed|acceptances|answerers,
 *     askAnswerContent/_registry/payouts) ===
 * Serwer trzyma tam prawde o Askach: zapieczetowany stan, przyjecia, straznika
 * "jedna odpowiedz na adres" i rejestr zuzytych wyplat. HMAC chroni je przed
 * PODROBKA, ale nie przed SKASOWANIEM ani COFNIECIEM - przed tym chronia tylko
 * reguly. Projekt zaklada, ze te sciezki sa zamkniete JUZ DZIS: 'asks'
 * i 'askAnswerContent' sa w hasOwnRules, a nierekursywny catch-all
 * `{collection}/{docId}/{rest=**}` zwraca !hasOwnRules(pierwszy segment).
 * Odmowa ODCZYTU dowodzi, ze dla tych sciezek dziala wlasnie ta instrukcja
 * `allow read, write` (innej pasujacej reguly nie ma), wiec zapis tez jest
 * zamkniety. Id Aska w sondzie jest zmyslone - regula nie patrzy na id,
 * a sonda niczego nie tworzy.
 *
 * Ktorakolwiek z tych sond 'open' = produkcja NIE ma tego catch-alla.
 * STOP: przed wdrozeniem kodu pieczeci wdroz najpierw czesc firestore.rules
 * z hasOwnRules i catch-allem - inaczej pieczecie da sie kasowac i cofac.
 */
import { config } from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

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

/** Zmyslone id Aska do sond podkolekcji - istnienie dokumentu nie ma znaczenia dla regul. */
const PROBE_ASK_ID = 'probeAskId0000000000';

/** oczekiwanie: 'open' = ma sie udac, 'denied' = ma odmowic */
const PROBES = [
  ['posts', 'open'],
  ['users', 'open'],
  ['comments', 'open'],
  ['tips', 'open'],
  ['usernames', 'open'],
  ['referrals', 'open'],
  ['globalStats', 'open'],
  ['asks', 'open'],
  ['askAnswers', 'open'],
  ['agents', 'open'],
  ['askAnswerContent', 'denied'],
  ['premiumContent', 'denied'],
  // Rejestr kwitow Solany: jedyne zrodlo portfela do napiwkow i platnych
  // odpowiedzi. Otwarty = kazdy moze go skasowac i wylaczyc platnosci
  // (przekierowac ich nie moze - wpisy niosa HMAC). Patrz receiptRegistry.ts.
  ['solanaPostReceipts', 'denied'],
  // Pieczecie Askow - patrz naglowek. Sciezka z '/' to podkolekcja.
  [`asks/${PROBE_ASK_ID}/sealed`, 'denied'],
  [`asks/${PROBE_ASK_ID}/acceptances`, 'denied'],
  [`asks/${PROBE_ASK_ID}/answerers`, 'denied'],
  ['askAnswerContent/_registry/payouts', 'denied'],
];

let zle = 0;

for (const [name, oczekiwane] of PROBES) {
  let wynik;
  try {
    await getDocs(query(collection(db, name), limit(1)));
    wynik = 'open';
  } catch (error) {
    wynik = error?.code === 'permission-denied' ? 'denied' : `blad: ${error?.code || error}`;
  }

  const ok = wynik === oczekiwane;
  if (!ok) zle += 1;
  console.log(
    `${ok ? 'OK  ' : 'ZLE '} ${name.padEnd(38)} oczekiwano=${oczekiwane.padEnd(7)} jest=${wynik}`
  );
}

console.log(
  zle === 0
    ? '\nWSZYSTKO ZGODNE: nic dzialajacego sie nie zamknelo, a tresci platne i zapieczetowane sa zamkniete.'
    : `\n${zle} NIEZGODNOSCI - patrz wyzej.`
);
process.exit(zle === 0 ? 0 : 1);
