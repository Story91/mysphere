import 'server-only';
import { getAdminDb } from '../../utils/auth/firebaseAdmin';
import { normalizeAddress } from '../../utils/monetization/types';

/**
 * Magazyn ZAPIECZETOWANYCH tresci odpowiedzi - kolekcja `askAnswerContent`.
 *
 * To jest ten sam uklad, ktory dziala juz dla tresci premium
 * (app/utils/monetization/premiumStore.ts), przeniesiony na Aski. Nie jest
 * wymyslony tutaj i celowo nie rozni sie w niczym, co nie musi.
 *
 * === DLACZEGO TRESC NIE MOZE LEZEC W DOKUMENCIE ODPOWIEDZI ===
 * Manifest obiecuje, ze odpowiedzi sa "sealed until you resolve: nobody can
 * read what anyone else wrote, so nobody can rewrite it slightly and take a
 * seat with it". Feed czyta Firestore klienckim SDK, wiec dopoki tresc siedzi
 * w dokumencie, kazdy widzi ja w odpowiedzi sieciowej - zaslona w UI to nie
 * zapieczetowanie. Tresc idzie wiec do kolekcji z regula `allow read, write:
 * if false`, a wydaje ja wylacznie trasa serwerowa po sprawdzeniu uprawnienia.
 *
 * ID DOKUMENTU = id odpowiedzi z `askAnswers`. Jedna odpowiedz ma najwyzej
 * jedna tresc, wiec deterministyczne ID daje odczyt po kluczu bez indeksow.
 *
 * === UWAGA O REGULACH, KTORA MUSI TU STAC ===
 * `firestore.rules` konczy sie regula `match /{document=**} { allow read,
 * write: if true; }`. Firestore przyznaje dostep, gdy POZWALA JAKAKOLWIEK
 * pasujaca regula, a rekursywny wildcard pasuje takze do `askAnswerContent`
 * i do `premiumContent`. Dopoki ta regula tam stoi, `if false` przy tych
 * kolekcjach NIE zamyka ich przed przegladarka. Bramka w tej trasie dziala,
 * ale sama nie wystarcza - patrz komentarz w firestore.rules.
 */

export const ASK_ANSWER_CONTENT_COLLECTION = 'askAnswerContent';
export const ASK_ANSWERS_COLLECTION = 'askAnswers';
export const ASKS_COLLECTION = 'asks';

/** Czy magazyn w ogole dziala. Bez konta uslugowego nie da sie nic zapisac. */
export async function isAnswerStoreAvailable(): Promise<boolean> {
  return (await getAdminDb()) !== null;
}

export type StoredAnswer = {
  id: string;
  askId: string;
  author: string;
  createdAt: number;
};

/**
 * Zapisuje odpowiedz: NAJPIERW tresc do zapieczetowanej kolekcji, POTEM
 * metadane i licznik.
 *
 * Kolejnosc nie jest kosmetyczna. Odwrotna dawalaby odpowiedz widoczna w
 * liczniku i pusta w srodku - dokladnie ten sam blad, przed ktorym broni sie
 * /api/premium ("paywall nad pustka"). Tu byloby gorzej: autor Aska zobaczylby
 * "7 answers sealed" i przy rozstrzygnieciu nie zastal nic.
 *
 * NIE sprawdza uprawnien - wolajacy musi wczesniej potwierdzic tozsamosc,
 * stan Aska i to, ze ten adres jeszcze nie odpowiadal.
 *
 * @returns metadane zapisanej odpowiedzi albo null, gdy zapis sie nie udal.
 */
export async function saveAnswer(input: {
  askId: string;
  author: string;
  content: string;
}): Promise<StoredAnswer | null> {
  const db = await getAdminDb();
  if (!db) return null;

  const ref = db.collection(ASK_ANSWERS_COLLECTION).doc();
  const now = Date.now();
  const author = normalizeAddress(input.author);

  try {
    await db.collection(ASK_ANSWER_CONTENT_COLLECTION).doc(ref.id).set({
      answerId: ref.id,
      askId: input.askId,
      author,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error('[asks/answerStore] Zapis tresci odpowiedzi nie powiodl sie:', error);
    return null;
  }

  try {
    await ref.set({
      askId: input.askId,
      author,
      createdAt: now,
      accepted: false,
      payoutTxHash: null,
    });
  } catch (error) {
    console.error('[asks/answerStore] Zapis metadanych odpowiedzi nie powiodl sie:', error);
    // Tresc bez metadanych jest niewidoczna dla kogokolwiek - sierota, ale nie
    // klamstwo. Sprzatamy ja, zeby nie zostawiac cudzego tekstu w bazie po
    // zapisie, ktory sie nie udal.
    try {
      await db.collection(ASK_ANSWER_CONTENT_COLLECTION).doc(ref.id).delete();
    } catch (cleanupError) {
      console.error('[asks/answerStore] Sprzatanie osieroconej tresci nie powiodlo sie:', cleanupError);
    }
    return null;
  }

  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    await db
      .collection(ASKS_COLLECTION)
      .doc(input.askId)
      .update({ answerCount: FieldValue.increment(1) });
  } catch (error) {
    // Licznik to informacja, nie tresc. Rozjechany licznik jest bledem
    // kosmetycznym; odrzucenie odpowiedzi, ktora juz lezy w bazie, byloby
    // strata czyjejs pracy. Logujemy i idziemy dalej.
    console.error('[asks/answerStore] Nie udalo sie podbic licznika odpowiedzi:', error);
  }

  return { id: ref.id, askId: input.askId, author, createdAt: now };
}

/**
 * Tresci odpowiedzi po ich identyfikatorach.
 *
 * NIE sprawdza uprawnien - wolajacy musi wczesniej ustalic, ktore z nich wolno
 * wydac. Zwraca mape, zeby brak wpisu znaczyl "nie ma tresci", a nie "pusta".
 */
export async function readAnswerContents(
  answerIds: string[]
): Promise<Map<string, string> | null> {
  if (answerIds.length === 0) return new Map();

  const db = await getAdminDb();
  if (!db) return null;

  try {
    const refs = answerIds.map((id) => db.collection(ASK_ANSWER_CONTENT_COLLECTION).doc(id));
    const snapshots = await db.getAll(...refs);

    const contents = new Map<string, string>();
    for (const snapshot of snapshots) {
      const content = snapshot.exists ? snapshot.data()?.content : null;
      if (typeof content === 'string' && content.trim() !== '') {
        contents.set(snapshot.id, content);
      }
    }
    return contents;
  } catch (error) {
    console.error('[asks/answerStore] Odczyt tresci odpowiedzi nie powiodl sie:', error);
    // null znaczy AWARIA. Pusta mapa znaczy "nie ma tresci" - i te dwa zdania
    // nie moga wygladac tak samo dla wolajacego.
    return null;
  }
}
