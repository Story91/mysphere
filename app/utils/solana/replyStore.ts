import 'server-only';

/**
 * Zapis zweryfikowanej, oplaconej odpowiedzi z X jako komentarza.
 *
 * Wolac WYLACZNIE po verifyReplyTransaction - ta funkcja niczego nie sprawdza,
 * zapisuje to, co dostanie.
 *
 * Identyfikator dokumentu = podpis transakcji. Zapis idzie w transakcji
 * Firestore, ktora najpierw sprawdza, czy dokument juz istnieje: drugie
 * zgloszenie tego samego podpisu (ponowienie z naszej strony, podwojny
 * callback z rozszerzenia) konczy sie niczym i NIE podbija licznika drugi raz.
 *
 * Firebase Admin ladowany leniwie przez getAdminDb, a FieldValue importem
 * dynamicznym - dokladnie jak w app/api/asks/answerStore.ts i z tego samego
 * powodu (patrz naglowek app/utils/auth/firebaseAdmin.ts).
 */

import { getAdminDb } from '../auth/firebaseAdmin';

export interface VerifiedReply {
  postId: string;
  signature: string;
  /** Adres Solany odpowiadajacego. */
  author: string;
  /** Tresc Z MEMO na lancuchu, nie z zadania. */
  text: string;
  lamports: bigint;
}

export type SaveReplyResult = 'created' | 'already-saved' | 'repaired' | 'unavailable';

/** Czy serwer w ogole moze zapisac odpowiedz - pytamy ZANIM ktos zaplaci. */
export async function replyStoreAvailable(): Promise<boolean> {
  return (await getAdminDb()) !== null;
}

export async function saveVerifiedReply(reply: VerifiedReply): Promise<SaveReplyResult> {
  const db = await getAdminDb();
  if (!db) return 'unavailable';
  const { FieldValue } = await import('firebase-admin/firestore');

  const commentRef = db.collection('comments').doc(reply.signature);
  const postRef = db.collection('posts').doc(reply.postId);

  const verified = {
    author: reply.author,
    // Adres Solany nie ma profilu w `users` - skrot jest jedyna nazwa, jaka
    // mamy, i tak samo skraca go displayUserName w feedzie.
    authorName: `${reply.author.slice(0, 4)}…${reply.author.slice(-4)}`,
    content: reply.text,
    postId: reply.postId,
    txHash: reply.signature,
    network: 'solana',
    onchain: true,
    // String, nie number: lamporty to u64, a Firestore trzyma liczby
    // calkowite do 2^63 - bez stringa pierwsza duza kwota zgubilaby cyfry.
    tipLamports: reply.lamports.toString(),
    via: 'blink',
  };

  return db.runTransaction(async t => {
    const existing = await t.get(commentRef);
    if (existing.exists) {
      // Dopoki reguly Firestore nie zamkna kolekcji `comments`, dokument pod
      // tym podpisem mogl zapisac KTOKOLWIEK - np. bot, ktory zobaczyl
      // transakcje na lancuchu i uprzedzil nasz zapis z podmieniona trescia
      // (znalezisko z przegladu 2026-09-23). Zgodny dokument zostawiamy,
      // niezgodny NADPISUJEMY tym, co zweryfikowalismy na lancuchu. Licznika
      // nie podbijamy - nie wiemy, czy podrobka go ruszyla.
      const current = existing.data() ?? {};
      const matches = (Object.keys(verified) as Array<keyof typeof verified>).every(k => current[k] === verified[k]);
      if (matches) return 'already-saved' as const;
      t.set(commentRef, {
        ...verified,
        timestamp: FieldValue.serverTimestamp(),
        likes: 0,
        likedBy: [],
        mentions: [],
      });
      return 'repaired' as const;
    }

    t.create(commentRef, {
      ...verified,
      timestamp: FieldValue.serverTimestamp(),
      likes: 0,
      likedBy: [],
      mentions: [],
    });
    // Tylko licznik - tresc zyje w kolekcji `comments`, jak przy addComment.
    // Statystyk w `users/{adres}` nie ruszamy: ten dokument istnieje tylko dla
    // adresow EVM, a update na nieistniejacym dokumencie wywraca transakcje.
    t.update(postRef, { commentsCount: FieldValue.increment(1) });
    return 'created' as const;
  });
}
