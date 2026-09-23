import 'server-only';
import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';

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
 *
 * ===========================================================================
 * DLACZEGO firebase-admin JEST LADOWANY LENIWIE, A NIE ZWYKLYM IMPORTEM
 * ===========================================================================
 * Objaw z produkcji (5 sierpnia 2026): trasy /api/auth/verify, /api/auth/session
 * i /api/premium zwracaly 500 w postaci strony HTML, a /api/auth/nonce - jedyna
 * z tej grupy nieimportujaca tego pliku - dzialala. HTML zamiast JSON-a znaczy,
 * ze modul wybuchal PRZY LADOWANIU, zanim handler wystartowal. Dowod dodatkowy:
 * GET /api/auth/verify zwracal lokalnie 405 (modul zaladowany, brak eksportu
 * GET), a na produkcji 500. Ten sam build uruchomiony lokalnie przez `next start`
 * dzialal bez zarzutu, wiec przyczyna byla srodowiskowa, nie w kodzie.
 *
 * Sprawdzone i WYKLUCZONE: reczne externals wypychajace gcp-metadata poza slad
 * plikow (@vercel/nft zawiera komplet w obu wariantach konfiguracji), brak
 * pakietu `server-only` (Next dostarcza wlasny shim), wersja Node (engines
 * podbite do >=22, Vercel raportuje uzycie 24.x), reguly Firestore (admin SDK
 * omija je z definicji), brak pakietu w package-lock (jest).
 *
 * Statyczny import sprawial, ze awaria POBOCZNEJ integracji kasowala
 * uwierzytelnienie - a weryfikacja podpisu SIWE nie potrzebuje firebase-admin
 * do niczego. Leniwy import odwraca zaleznosc: gdy pakiet sie nie zaladuje,
 * dzieje sie dokladnie to, co ten modul robi od poczatku przy braku
 * konfiguracji - logowanie przechodzi, sesja powstaje, a zapisy do Firestore
 * zostaja anonimowe. Degradacja zamiast piecsetki.
 *
 * To jest naprawa ODPORNOSCIOWA, nie usuniecie przyczyny. Przyczyna nadal
 * czeka na log runtime'u z Vercela - patrz AUDYT.md, sekcja 2b.
 */

/** Stan ladowania modulu. `failed` zapamietuje, ze nie ma po co probowac znowu. */
type AdminState = { app: App | null; failed: boolean };

let cached: AdminState | null = null;
let inFlight: Promise<AdminState> | null = null;
let warned = false;

/** Ostrzegamy RAZ na proces - inaczej kazde zadanie zasmieca logi. */
function warnOnce(message: string, error?: unknown) {
  if (warned) return;
  warned = true;
  if (error) console.error(message, error);
  else console.warn(message);
}

/**
 * Parsuje konto uslugowe z env. Zwraca null, gdy nieskonfigurowane.
 * Eksportowane dla rejestru kwitow Solany, ktory wyprowadza z klucza konta
 * swoj klucz HMAC - musi czytac GOOGLE_CREDENTIALS tym samym parserem, inaczej
 * na maszynie z surowymi znakami nowej linii w .env nie mialby klucza.
 */
export function readServiceAccount(): Record<string, string> | null {
  const raw = process.env.GOOGLE_CREDENTIALS?.trim();
  if (!raw) return null;

  try {
    // Wartosc bywa zapisana jako czysty JSON albo jako base64.
    const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = parseServiceAccountJson(text);
    if (parsed?.type !== 'service_account' || !parsed?.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * JSON konta uslugowego, odporny na SUROWE ZNAKI NOWEJ LINII w `private_key`.
 *
 * === TO BYLA PRZYCZYNA ZRODLOWA, SZUKANA PRZEZ DWA DNI ===
 * AUDYT.md par. 2b opisywal nierozwiazana awarie: na produkcji trasy
 * importujace ten plik zwracaly 500, SIWE nie dzialalo, `request.auth`
 * w regulach Firestore bylo zawsze `null`. Postawilem i obalilem cztery
 * hipotezy (gcp-metadata w externals, brak `server-only`, wersja Node,
 * reguly Firestore) i nie znalazlem powodu.
 *
 * Powod jest w PARSERZE PLIKU .env, nie w tym module:
 *
 *   GOOGLE_CREDENTIALS="{...\n...}"     <- PODWOJNE cudzyslowy
 *
 * Przy wartosci w podwojnych cudzyslowach dotenv (i @next/env) rozwija `\n`
 * w PRAWDZIWY znak nowej linii - to udokumentowane zachowanie, przydatne dla
 * kluczy PEM trzymanych w osobnej zmiennej. Tutaj jest zgubne: klucz siedzi
 * WEWNATRZ JSON-a, wiec surowy znak nowej linii laduje w srodku literalu
 * napisowego i `JSON.parse` konczy sie "Bad control character in string
 * literal at position 158".
 *
 * Zmierzone na tym repo: `JSON.parse` wywala sie, `readServiceAccount()`
 * zwraca null, `getAdminDb()` zwraca null - i cala reszta lancucha milknie.
 * Modul zawodzil CICHO i wygladalo to jak brak konfiguracji, a nie jak blad.
 *
 * === DLACZEGO NAPRAWA JEST TUTAJ, A NIE W .env ===
 * Poprawienie zmiennej (pojedyncze cudzyslowy albo base64) rozwiazuje objaw
 * u jednej osoby, na jednej maszynie. Ten sam plik wklei sie kiedys do Vercela,
 * do CI i na czyjs drugi komputer - i zaleznie od cudzyslowow zadziala albo
 * nie, bez zadnego sygnalu. Modul ma przyjac obie postacie.
 *
 * === DLACZEGO PODMIANA JEST BEZPIECZNA ===
 * W poprawnym JSON-ie surowy znak nowej linii NIE MOZE wystapic wewnatrz
 * literalu napisowego - to jest wlasnie blad, ktory naprawiamy. Poza
 * literalami jest tylko formatowaniem i podmiana na `\n` nic nie zmienia,
 * bo i tak parsujemy wynik jako JSON. Probujemy tego DOPIERO po nieudanym
 * pierwszym parsowaniu, wiec poprawne wartosci nie przechodza przez zadna
 * transformacje.
 */
function parseServiceAccountJson(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch (firstError) {
    // Druga proba: surowe znaki nowej linii i powrotu karetki z powrotem na
    // sekwencje ucieczki. Ratuje wartosc rozwinieta przez parser .env.
    try {
      return JSON.parse(text.replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
    } catch {
      // Zglaszamy PIERWSZY blad - opisuje prawdziwy ksztalt wartosci.
      // Blad z proby naprawczej tylko myliby czytajacego log.
      throw firstError;
    }
  }
}

/**
 * Laduje firebase-admin i inicjuje aplikacje. KAZDY etap moze zawiesc i kazdy
 * zawodzi cicho, oddajac `app: null`.
 *
 * `inFlight` chroni przed wyscigiem: dwa rownolegle zadania na zimnej instancji
 * inaczej wywolalyby initializeApp dwa razy.
 */
async function loadAdminApp(): Promise<AdminState> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<AdminState> => {
    const serviceAccount = readServiceAccount();
    if (!serviceAccount) {
      warnOnce(
        '[firebaseAdmin] GOOGLE_CREDENTIALS nie jest ustawione albo nie jest kontem uslugowym. ' +
          'Tokeny Firebase nie beda mintowane - logowanie SIWE zadziala, ale zapisy do Firestore ' +
          'pozostana anonimowe.'
      );
      return { app: null, failed: true };
    }

    try {
      const { getApps, initializeApp, cert } = await import('firebase-admin/app');

      const existing = getApps();
      if (existing.length > 0) return { app: existing[0], failed: false };

      const app = initializeApp({
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          // Klucze w env maja czesto zescapowane znaki nowej linii.
          privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
        }),
      });

      return { app, failed: false };
    } catch (error) {
      warnOnce(
        '[firebaseAdmin] Nie udalo sie zaladowac firebase-admin ani zainicjowac konta ' +
          'uslugowego. Tokeny Firebase nie beda mintowane, ale logowanie SIWE dziala dalej. Blad:',
        error
      );
      return { app: null, failed: true };
    }
  })();

  cached = await inFlight;
  inFlight = null;
  return cached;
}

/**
 * Firestore z uprawnieniami administracyjnymi - OMIJA reguly bezpieczenstwa.
 *
 * PO CO: sa dane, ktorych przegladarka nie moze zobaczyc niezaleznie od tego,
 * jak dobre sa reguly - bo klient czyta dokument posta w calosci. Tresc premium
 * jest wlasnie taka: dopoki siedzi w dokumencie posta, kazdy widzi ja w
 * odpowiedzi sieciowej bez placenia. Rozwiazaniem jest kolekcja, do ktorej
 * klient nie ma dostepu WCALE (`allow read, write: if false`), a czyta ja
 * wylacznie serwer tym klientem.
 *
 * KAZDE uzycie tej funkcji musi samo sprawdzic, czy wolajacy ma prawo do danych
 * - tutaj nie ma zadnej bramki. Zwraca null, gdy konto uslugowe nie jest
 * skonfigurowane albo pakiet sie nie zaladowal; wolajacy ma wtedy zdecydowac,
 * czy to blad, czy degradacja.
 */
export async function getAdminDb(): Promise<Firestore | null> {
  const { app } = await loadAdminApp();
  if (!app) return null;

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    return getFirestore(app);
  } catch (error) {
    console.error('[firebaseAdmin] Nie udalo sie otworzyc Firestore:', error);
    return null;
  }
}

/**
 * Token logujacy do Firebase dla podanego adresu portfela.
 *
 * WOLAJ WYLACZNIE po udanej weryfikacji podpisu SIWE. Ta funkcja nie sprawdza
 * niczego - mintuje token dla adresu, ktory dostanie.
 *
 * Zwraca null, gdy konto uslugowe nie jest skonfigurowane albo pakiet sie nie
 * zaladowal. To jest celowe: brak tokenu ma degradowac logowanie do
 * dzisiejszego zachowania, a nie wywalac uwierzytelnienie.
 */
export async function mintFirebaseToken(address: string): Promise<string | null> {
  const { app } = await loadAdminApp();
  if (!app) return null;

  try {
    const { getAuth } = await import('firebase-admin/auth');
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
