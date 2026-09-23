import 'server-only';
import { getAdminDb } from '../../utils/auth/firebaseAdmin';
import { lowerAddress, railOf } from '../../utils/asks/askSealCore';
import type { AskStatus } from '../../utils/asks/types';
import {
  ASKS_COLLECTION,
  ASK_ANSWERS_COLLECTION,
  ASK_ANSWER_CONTENT_COLLECTION,
  answerRef,
  answererGuardDoc,
  answererRef,
  askBundleFromSnapshots,
  askRef,
  contentRef,
  isDocId,
  readSolanaWalletBinding,
  stateRef,
  type AskStore,
} from './askStore';
import { freezePayeeFromBinding } from './solanaWalletStore';

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

// Nazwy kolekcji zyja teraz w askStore.ts (jedno miejsce po stronie serwera);
// re-eksport zostawia dotychczasowe importy w spokoju.
export { ASK_ANSWER_CONTENT_COLLECTION, ASK_ANSWERS_COLLECTION, ASKS_COLLECTION };

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
 * Dlaczego odpowiedz nie zostala zapisana. `status` to gotowy kod HTTP.
 *
 * already_answered - ten adres juz odpowiedzial (straznik albo stara odpowiedz),
 * ask_closed       - Ask nie jest otwarty albo minal termin (`askStatus`),
 * own_ask          - autor odpowiada na wlasnego Aska,
 * ask_unverified   - Ask bez pieczeci przy wlaczonej fladze ASK_SEALS_ENFORCED,
 * seal_invalid     - pieczec stanu niewazna (503, nic nie zapisujemy),
 * answer_write_failed - transakcja sie nie powiodla; nic nie zostalo zapisane.
 */
export type SaveAnswerRefusal =
  | 'invalid_id'
  | 'invalid_author'
  | 'ask_not_found'
  | 'seal_invalid'
  | 'ask_unverified'
  | 'ask_closed'
  | 'own_ask'
  | 'already_answered'
  | 'answer_write_failed';

/**
 * Dodatki tylko dla Aska SOL (na Asku USDC tych kluczy nie ma wcale):
 * payoutAddressBound - odbiorca zamrozony w tej samej transakcji z powiazania
 *                      odpowiadajacego; false = wyplata zablokowana, dopoki
 *                      nie powiaze portfela (POST /api/asks/[id]/payee),
 * payoutAddressIssue - dlaczego nie zamrozono mimo powiazania.
 */
export type SolanaAnswerExtras = {
  rail: 'sol-solana';
  payoutAddressBound: boolean;
  payoutAddressIssue?: 'payee_is_author_wallet' | 'binding_invalid';
};

export type SaveAnswerResult =
  | ({ ok: true; answer: StoredAnswer } & Partial<SolanaAnswerExtras>)
  | { ok: false; code: SaveAnswerRefusal; status: number; askStatus?: AskStatus };

const refuse = (code: SaveAnswerRefusal, status: number, askStatus?: AskStatus): SaveAnswerResult => ({
  ok: false,
  code,
  status,
  ...(askStatus ? { askStatus } : {}),
});

/**
 * Zapisuje odpowiedz w JEDNEJ transakcji Firestore.
 *
 * === DLACZEGO TRANSAKCJA, A NIE TRZY ZAPISY ===
 * Poprzednia wersja pisala tresc, potem metadane, potem licznik - osobno,
 * a stan Aska i "czy juz odpowiadal" sprawdzala trasa PRZED zapisem,
 * klienckim odczytem. Miedzy sprawdzeniem a zapisem Ask mogl zostac
 * rozstrzygniety (odpowiedz ladowala po odpieczetowaniu, gdy wszyscy juz
 * czytaja cudze tresci), a dwie rownolegle karty tego samego portfela
 * przechodzily obie. Teraz stan, termin, autor i duplikat sa sprawdzane
 * W TEJ SAMEJ transakcji, ktora zapisuje:
 *   odczyty: asks/{id}, asks/{id}/sealed/state, asks/{id}/answerers/{adres}
 *            + zapytanie o stara odpowiedz tego adresu (sprzed straznika),
 *   zapisy:  straznik (tx.create - drugi commit tego adresu sie wywroci),
 *            tresc, metadane, licznik odpowiedzi.
 * Wszystko albo nic, wiec sprzatanie osieroconej tresci nie jest juz potrzebne.
 *
 * Stan Aska czytamy przez askBundleFromSnapshots: Ask zapieczetowany bierze
 * status i termin ze stanu (lustro moze klamac), Ask bez stanu - z dokumentu
 * jak dotad ('legacy') albo odmawia ('unverified' przy wlaczonej fladze).
 *
 * `author` MUSI pochodzic z podpisanej sesji - ta funkcja nie sprawdza
 * tozsamosci, tylko prawo tego adresu do odpowiedzi.
 */
export async function saveAnswer(
  store: AskStore,
  input: { askId: string; author: string; content: string }
): Promise<SaveAnswerResult> {
  if (!isDocId(input.askId)) return refuse('invalid_id', 400);
  const author = lowerAddress(input.author);
  if (!author) return refuse('invalid_author', 400);
  const askId = input.askId;

  try {
    return await store.db.runTransaction(async (tx): Promise<SaveAnswerResult> => {
      const [askSnap, stateSnap, guardSnap] = await tx.getAll(
        askRef(store, askId),
        stateRef(store, askId),
        answererRef(store, askId, author)
      );
      // Odpowiedzi sprzed straznika: ten sam warunek co dawne hasAnswered.
      const earlier = await tx.get(
        store.db
          .collection(ASK_ANSWERS_COLLECTION)
          .where('askId', '==', askId)
          .where('author', '==', author)
          .limit(1)
      );

      const bundle = askBundleFromSnapshots(store, askId, askSnap, stateSnap);
      const view = bundle.view;
      // Bez publicznego dokumentu nie ma czego pokazac ani czego liczyc.
      if (!bundle.exists || !bundle.pub || !view) return refuse('ask_not_found', 404);
      if (view.trust === 'broken') return refuse('seal_invalid', 503);
      if (view.trust === 'unverified') return refuse('ask_unverified', 409);

      const now = Date.now();
      if (view.status !== 'open' || view.deadline <= now) return refuse('ask_closed', 409, view.status);
      if (lowerAddress(view.author) === author) return refuse('own_ask', 403);
      if (guardSnap.exists || !earlier.empty) return refuse('already_answered', 409);

      // Ask SOL (szyna ze STANU): powiazanie odpowiadajacego czytamy w tej
      // samej transakcji - odbiorca zamraza sie razem z odpowiedzia albo wcale.
      // Odczyt przed pierwszym zapisem (wymog Firestore). Bez powiazania
      // odpowiedz i tak przechodzi (decyzja wlasciciela), wyplata czeka.
      const solState = bundle.state && railOf(bundle.state) === 'sol-solana' ? bundle.state : null;
      const binding = solState ? await readSolanaWalletBinding(store, author, tx) : null;

      const answerDoc = store.db.collection(ASK_ANSWERS_COLLECTION).doc();
      const answerId = answerDoc.id;

      tx.create(answererRef(store, askId, author), {
        ...answererGuardDoc(store, { v: 1, askId, author, answerId, createdAt: now }),
      });
      tx.create(contentRef(store, answerId), {
        answerId,
        askId,
        author,
        content: input.content,
        createdAt: now,
        updatedAt: now,
      });
      tx.create(answerRef(store, answerId), {
        askId,
        author,
        createdAt: now,
        accepted: false,
        payoutTxHash: null,
      });
      tx.update(askRef(store, askId), { answerCount: store.FieldValue.increment(1) });

      const answer = { id: answerId, askId, author, createdAt: now };
      if (!solState) return { ok: true, answer };

      // Niewazne powiazanie nie blokuje odpowiedzi (ALARM jest w logu), ale
      // nie zamrazamy z niego odbiorcy - to decyzja wlasciciela.
      if (!binding || binding.kind !== 'valid') {
        return {
          ok: true,
          answer,
          rail: 'sol-solana',
          payoutAddressBound: false,
          ...(binding?.kind === 'invalid' ? { payoutAddressIssue: 'binding_invalid' as const } : {}),
        };
      }
      const frozen = freezePayeeFromBinding(tx, store, {
        state: solState,
        answerId,
        answerer: author,
        binding: binding.value,
        nowMs: now,
      });
      return frozen.ok
        ? { ok: true, answer, rail: 'sol-solana', payoutAddressBound: true }
        : { ok: true, answer, rail: 'sol-solana', payoutAddressBound: false, payoutAddressIssue: frozen.code };
    });
  } catch (error) {
    // Przegrany wyscig (drugi commit straznika) albo awaria Firestore.
    // Nic nie zostalo zapisane - transakcja jest atomowa.
    console.error('[asks/answerStore] Transakcja zapisu odpowiedzi nie powiodla sie:', error);
    return refuse('answer_write_failed', 500);
  }
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
