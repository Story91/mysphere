'use client';

/**
 * Zbiorcze sprawdzanie odblokowan i wsparc dla CALEGO feedu.
 *
 * Feed renderuje do 150 postow - zapytanie per post jest niedopuszczalne.
 * Wzorzec jest ten sam, co getBulkPostTipStats w PostList: zbieramy unikalne
 * klucze raz dla calej listy i robimy zapytania zbiorcze (chunki po 30, limit
 * Firestore na operator `in`).
 *
 * Koszt przy 150 postach:
 *  - odblokowania: 1 zapytanie na kazde 30 postow PREMIUM. Feed bez postow
 *    premium (czyli caly dzisiejszy stan bazy) = 0 zapytan,
 *  - wsparcia: 1 zapytanie na kazde 30 unikalnych autorow.
 *
 * Klucz zaleznosci jest stringiem (`ids.join(',')`), a nie tablica - inaczej
 * kazdy re-render feedu tworzylby nowa referencje i odpalal zapytania od nowa.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBulkUnlockedPostIds } from '../../utils/monetization/unlocks';
import { getBulkActiveSubscriptions } from '../../utils/monetization/subscriptions';
import { normalizeAddress } from '../../utils/monetization/types';

export interface FeedUnlocksResult {
  /** postId odblokowane przez ten portfel. */
  unlockedPostIds: Set<string>;
  loading: boolean;
  /** Optymistyczne oznaczenie po udanym odblokowaniu - bez ponownego zapytania. */
  markUnlocked: (postId: string) => void;
}

export function useFeedUnlocks(
  walletAddress: string | null | undefined,
  premiumPostIds: string[]
): FeedUnlocksResult {
  const [unlockedPostIds, setUnlockedPostIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const key = useMemo(
    () => Array.from(new Set(premiumPostIds.filter(Boolean))).sort().join(','),
    [premiumPostIds]
  );

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (!walletAddress || ids.length === 0) {
      setUnlockedPostIds(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getBulkUnlockedPostIds(walletAddress, ids)
      .then(result => { if (!cancelled) setUnlockedPostIds(result); })
      .catch(err => console.error('[monetization] blad pobierania odblokowan feedu:', err))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [walletAddress, key]);

  const markUnlocked = useCallback((postId: string) => {
    setUnlockedPostIds(prev => {
      if (prev.has(postId)) return prev;
      const next = new Set(prev);
      next.add(postId);
      return next;
    });
  }, []);

  return { unlockedPostIds, loading, markUnlocked };
}

export interface FeedSubscriptionsResult {
  /** Adresy tworcow (lowercase) z AKTYWNYM, jeszcze niewygaslym wsparciem. */
  subscribedCreators: Set<string>;
  loading: boolean;
  markSubscribed: (creatorAddress: string) => void;
}

export function useFeedSubscriptions(
  walletAddress: string | null | undefined,
  creatorAddresses: string[]
): FeedSubscriptionsResult {
  const [subscribedCreators, setSubscribedCreators] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const key = useMemo(
    () => Array.from(new Set(creatorAddresses.filter(Boolean).map(normalizeAddress))).sort().join(','),
    [creatorAddresses]
  );

  useEffect(() => {
    const addresses = key ? key.split(',') : [];
    if (!walletAddress || addresses.length === 0) {
      setSubscribedCreators(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getBulkActiveSubscriptions(walletAddress, addresses)
      .then(result => { if (!cancelled) setSubscribedCreators(result); })
      .catch(err => console.error('[monetization] blad pobierania wsparc feedu:', err))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [walletAddress, key]);

  const markSubscribed = useCallback((creatorAddress: string) => {
    const creator = normalizeAddress(creatorAddress);
    setSubscribedCreators(prev => {
      if (prev.has(creator)) return prev;
      const next = new Set(prev);
      next.add(creator);
      return next;
    });
  }, []);

  return { subscribedCreators, loading, markSubscribed };
}
