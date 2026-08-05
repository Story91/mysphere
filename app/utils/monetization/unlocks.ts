/**
 * Odblokowania tresci premium w Firestore - kolekcja `unlocks`.
 *
 * KSZTALT: jeden dokument na pare (postId, walletAddress), o DETERMINISTYCZNYM
 * ID `${postId}__${wallet}`. Deterministyczne ID daje trzy rzeczy naraz:
 *  - odblokowanie jest idempotentne (setDoc na tym samym ID, brak duplikatow),
 *  - sprawdzenie feedu idzie przez `where(documentId(), 'in', [...])`, czyli
 *    zapytanie po kluczu - BEZ indeksu zlozonego,
 *  - post bez pol premium nie generuje zadnego zapytania.
 *
 * WYDAJNOSC: feed pyta zbiorczo tylko o posty premium. 150 postow, z ktorych
 * zaden nie jest premium = 0 zapytan. 150 postow premium = 5 zapytan (limit
 * Firestore na `in` to 30 wartosci) - ten sam wzorzec co getBulkPostTipStats.
 */

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  MONETIZATION_CHAIN_ID,
  MONETIZATION_NETWORK,
  normalizeAddress,
  type PaymentVerificationLevel,
  type MonetizationToken,
  type PostUnlock,
} from './types';

export const UNLOCKS_COLLECTION = 'unlocks';

/** ID dokumentu odblokowania. Adres zawsze lowercase. */
export function unlockDocId(postId: string, walletAddress: string): string {
  return `${postId}__${normalizeAddress(walletAddress)}`;
}

export interface SaveUnlockInput {
  postId: string;
  walletAddress: string;
  creatorAddress: string;
  amount: string;
  token: MonetizationToken;
  txHash: string;
  verified: PaymentVerificationLevel;
}

/** Zapisuje odblokowanie. Idempotentne - powtorka nadpisuje ten sam dokument. */
export async function saveUnlock(input: SaveUnlockInput): Promise<PostUnlock> {
  const record: PostUnlock = {
    postId: input.postId,
    walletAddress: normalizeAddress(input.walletAddress),
    creatorAddress: normalizeAddress(input.creatorAddress),
    amount: input.amount,
    token: input.token,
    network: MONETIZATION_NETWORK,
    chainId: MONETIZATION_CHAIN_ID,
    txHash: input.txHash,
    unlockedAt: Date.now(),
    verified: input.verified,
  };

  await setDoc(doc(db, UNLOCKS_COLLECTION, unlockDocId(input.postId, input.walletAddress)), record);
  return record;
}

/** Pojedyncze sprawdzenie - do API i do widoku pojedynczego posta. */
export async function isPostUnlocked(postId: string, walletAddress: string): Promise<boolean> {
  if (!postId || !walletAddress) return false;
  try {
    const snapshot = await getDoc(doc(db, UNLOCKS_COLLECTION, unlockDocId(postId, walletAddress)));
    return snapshot.exists();
  } catch (error) {
    console.error('[monetization] blad sprawdzania odblokowania:', error);
    return false;
  }
}

export async function getUnlock(postId: string, walletAddress: string): Promise<PostUnlock | null> {
  if (!postId || !walletAddress) return null;
  try {
    const snapshot = await getDoc(doc(db, UNLOCKS_COLLECTION, unlockDocId(postId, walletAddress)));
    return snapshot.exists() ? (snapshot.data() as PostUnlock) : null;
  } catch (error) {
    console.error('[monetization] blad pobierania odblokowania:', error);
    return null;
  }
}

/**
 * ZBIORCZE sprawdzenie dla calego feedu. Zwraca zbior postId odblokowanych
 * przez `walletAddress`. Zapytanie per post jest niedopuszczalne - stad
 * chunkowanie po 30 i zapytanie po documentId().
 */
export async function getBulkUnlockedPostIds(
  walletAddress: string | null | undefined,
  postIds: string[]
): Promise<Set<string>> {
  const unlocked = new Set<string>();
  if (!walletAddress) return unlocked;

  const unique = Array.from(new Set(postIds.filter(Boolean)));
  if (unique.length === 0) return unlocked;

  const wallet = normalizeAddress(walletAddress);
  const byDocId = new Map<string, string>();
  unique.forEach(postId => byDocId.set(`${postId}__${wallet}`, postId));
  const docIds = Array.from(byDocId.keys());

  try {
    for (let i = 0; i < docIds.length; i += 30) {
      const chunk = docIds.slice(i, i + 30);
      const snapshot = await getDocs(
        query(collection(db, UNLOCKS_COLLECTION), where(documentId(), 'in', chunk))
      );
      snapshot.docs.forEach(d => {
        const postId = byDocId.get(d.id);
        if (postId) unlocked.add(postId);
      });
    }
  } catch (error) {
    console.error('[monetization] blad zbiorczego sprawdzania odblokowan:', error);
  }

  return unlocked;
}

/**
 * Straznik przed ponownym uzyciem tej samej transakcji do odblokowania innego
 * posta. Zwraca true, gdy `txHash` zostal juz zuzyty na INNE odblokowanie.
 */
export async function isUnlockTxAlreadyUsed(txHash: string, expectedDocId: string): Promise<boolean> {
  try {
    const snapshot = await getDocs(
      query(collection(db, UNLOCKS_COLLECTION), where('txHash', '==', txHash), firestoreLimit(5))
    );
    return snapshot.docs.some(d => d.id !== expectedDocId);
  } catch (error) {
    // Blad odczytu nie moze cicho przepuszczac replayu - traktujemy jak zajete.
    console.error('[monetization] blad sprawdzania powtorzenia txHash:', error);
    return true;
  }
}
