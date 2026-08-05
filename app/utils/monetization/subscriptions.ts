/**
 * Wsparcie tworcow w Firestore - kolekcja `creatorSubscriptions`.
 *
 * === CZYM TO JEST, A CZYM NIE JEST ===
 * To NIE jest subskrypcja odnawialna i nie wolno jej tak nazywac w UI.
 * Onchain nie ma tu zadnej cyklicznosci: uzytkownik wysyla JEDNA platnosc
 * z gory za N dni dostepu, a dostep gasnie o `expiresAt`. Nic nie odnawia sie
 * automatycznie i nikt nie dostaje zgody na pobranie kolejnej kwoty.
 * Zeby zrobic prawdziwa cyklicznosc, trzeba by:
 *  - spend permissions (Base Account) - zgoda na cykliczne wydatkowanie, albo
 *  - subskrypcje x402 - platnosc wymuszana przy kazdym dostepie do zasobu.
 * Oba sa poza zakresem tej fazy.
 *
 * KSZTALT: jeden dokument na pare (subscriberAddress, creatorAddress),
 * deterministyczne ID `${subscriber}__${creator}`. Przedluzenie NIE tworzy
 * nowego dokumentu - dokłada dni do `expiresAt` tego samego rekordu.
 *
 * WYDAJNOSC: feed sprawdza wszystkich unikalnych autorow jednym zapytaniem na
 * kazde 30 adresow (`where(documentId(), 'in', ...)`), bez indeksu zlozonego.
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
  DAY_MS,
  MONETIZATION_CHAIN_ID,
  MONETIZATION_NETWORK,
  SUBSCRIPTION_PERIOD_DAYS,
  SUBSCRIPTION_TIERS,
  isSubscriptionActive,
  normalizeAddress,
  type CreatorSubscription,
  type MonetizationToken,
  type PaymentVerificationLevel,
  type SubscriptionTier,
  type SubscriptionTierId,
} from './types';

export const SUBSCRIPTIONS_COLLECTION = 'creatorSubscriptions';

/** ID dokumentu wsparcia. Oba adresy lowercase. */
export function subscriptionDocId(subscriberAddress: string, creatorAddress: string): string {
  return `${normalizeAddress(subscriberAddress)}__${normalizeAddress(creatorAddress)}`;
}

export function getTier(tierId: SubscriptionTierId): SubscriptionTier {
  return SUBSCRIPTION_TIERS.find(t => t.id === tierId) || SUBSCRIPTION_TIERS[0];
}

/** Laczna cena za `periods` okresow po 30 dni. */
export function getSubscriptionPrice(tierId: SubscriptionTierId, periods: number): string {
  const tier = getTier(tierId);
  const total = parseFloat(tier.pricePerPeriod) * Math.max(1, periods);
  // USDC ma 6 miejsc, ale ceny sa calkowite lub z jednym miejscem - bez sztuczek.
  return String(Number(total.toFixed(6)));
}

export function getSubscriptionDays(periods: number): number {
  return SUBSCRIPTION_PERIOD_DAYS * Math.max(1, periods);
}

export interface SaveSubscriptionInput {
  subscriberAddress: string;
  creatorAddress: string;
  tier: SubscriptionTierId;
  periodDays: number;
  amount: string;
  token: MonetizationToken;
  txHash: string;
  verified: PaymentVerificationLevel;
}

/**
 * Zapisuje wsparcie. Gdy poprzednie jeszcze trwa, nowe dni sa DOKLADANE do
 * biezacego `expiresAt` (uzytkownik nie traci oplaconego czasu). Gdy wygaslo -
 * odliczamy od teraz.
 */
export async function saveSubscription(input: SaveSubscriptionInput): Promise<CreatorSubscription> {
  const id = subscriptionDocId(input.subscriberAddress, input.creatorAddress);
  const ref = doc(db, SUBSCRIPTIONS_COLLECTION, id);
  const now = Date.now();

  let existing: CreatorSubscription | null = null;
  try {
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) existing = snapshot.data() as CreatorSubscription;
  } catch (error) {
    console.error('[monetization] blad odczytu istniejacego wsparcia:', error);
  }

  const base = isSubscriptionActive(existing, now) ? existing!.expiresAt : now;
  const record: CreatorSubscription = {
    subscriberAddress: normalizeAddress(input.subscriberAddress),
    creatorAddress: normalizeAddress(input.creatorAddress),
    tier: input.tier,
    periodDays: input.periodDays,
    startedAt: existing?.startedAt ?? now,
    expiresAt: base + input.periodDays * DAY_MS,
    lastPaymentTx: input.txHash,
    amount: input.amount,
    token: input.token,
    network: MONETIZATION_NETWORK,
    chainId: MONETIZATION_CHAIN_ID,
    updatedAt: now,
    verified: input.verified,
  };

  await setDoc(ref, record);
  return record;
}

export async function getSubscription(
  subscriberAddress: string,
  creatorAddress: string
): Promise<CreatorSubscription | null> {
  if (!subscriberAddress || !creatorAddress) return null;
  try {
    const snapshot = await getDoc(
      doc(db, SUBSCRIPTIONS_COLLECTION, subscriptionDocId(subscriberAddress, creatorAddress))
    );
    return snapshot.exists() ? (snapshot.data() as CreatorSubscription) : null;
  } catch (error) {
    console.error('[monetization] blad pobierania wsparcia:', error);
    return null;
  }
}

/** Czy `subscriber` ma AKTYWNE (jeszcze nie wygasle) wsparcie dla `creator`. */
export async function isSubscribed(subscriberAddress: string, creatorAddress: string): Promise<boolean> {
  const subscription = await getSubscription(subscriberAddress, creatorAddress);
  return isSubscriptionActive(subscription);
}

/**
 * ZBIORCZE sprawdzenie dla calego feedu: zwraca zbior adresow tworcow
 * (lowercase), ktorych wsparcie jest aktywne. Wygasle rekordy sa odfiltrowane
 * po stronie klienta - nie da sie tego zrobic w zapytaniu po documentId(),
 * a odczytow jest tyle samo.
 */
export async function getBulkActiveSubscriptions(
  subscriberAddress: string | null | undefined,
  creatorAddresses: string[]
): Promise<Set<string>> {
  const active = new Set<string>();
  if (!subscriberAddress) return active;

  const subscriber = normalizeAddress(subscriberAddress);
  const unique = Array.from(
    new Set(creatorAddresses.filter(Boolean).map(normalizeAddress))
  ).filter(creator => creator !== subscriber);
  if (unique.length === 0) return active;

  const byDocId = new Map<string, string>();
  unique.forEach(creator => byDocId.set(`${subscriber}__${creator}`, creator));
  const docIds = Array.from(byDocId.keys());
  const now = Date.now();

  try {
    for (let i = 0; i < docIds.length; i += 30) {
      const chunk = docIds.slice(i, i + 30);
      const snapshot = await getDocs(
        query(collection(db, SUBSCRIPTIONS_COLLECTION), where(documentId(), 'in', chunk))
      );
      snapshot.docs.forEach(d => {
        const data = d.data() as CreatorSubscription;
        const creator = byDocId.get(d.id);
        if (creator && isSubscriptionActive(data, now)) active.add(creator);
      });
    }
  } catch (error) {
    console.error('[monetization] blad zbiorczego sprawdzania wsparc:', error);
  }

  return active;
}

/**
 * Straznik przed uzyciem tej samej transakcji do oplacenia wsparcia u innego
 * tworcy. Zwraca true, gdy `txHash` jest juz zuzyty przez INNY dokument.
 */
export async function isSubscriptionTxAlreadyUsed(txHash: string, expectedDocId: string): Promise<boolean> {
  try {
    const snapshot = await getDocs(
      query(collection(db, SUBSCRIPTIONS_COLLECTION), where('lastPaymentTx', '==', txHash), firestoreLimit(5))
    );
    return snapshot.docs.some(d => d.id !== expectedDocId);
  } catch (error) {
    console.error('[monetization] blad sprawdzania powtorzenia txHash:', error);
    return true;
  }
}
