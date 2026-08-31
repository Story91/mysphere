// React hooks dla systemu referali
import { useState, useEffect, useCallback } from 'react';
import {
  getUserReferralStats,
  getUserReferrals,
  getUserReferralRewards,
  initializeReferralStats,
  registerReferral,
  normalizeReferralCode,
  checkIfUserWasReferred,
  type ReferralRegistrationOutcome
} from './referralService';
import { ReferralStats, Referral, ReferralReward } from './types';

// Hook do zarządzania statystykami referalowymi
export const useReferralStats = (userId: string | null) => {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!userId) {
      setStats(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userStats = await getUserReferralStats(userId);
      setStats(userStats);
    } catch (err) {
      console.error('Error loading referral stats:', err);
      setError('Failed to load referral stats');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = useCallback(() => {
    loadStats();
  }, [loadStats]);

  return {
    stats,
    loading,
    error,
    refresh
  };
};

// Hook do zarządzania listą referali
export const useUserReferrals = (userId: string | null, statusFilter?: Referral['status']) => {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReferrals = useCallback(async () => {
    if (!userId) {
      setReferrals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userReferrals = await getUserReferrals(userId, statusFilter);
      setReferrals(userReferrals);
    } catch (err) {
      console.error('Error loading referrals list:', err);
      setError('Failed to load referrals list');
    } finally {
      setLoading(false);
    }
  }, [userId, statusFilter]);

  useEffect(() => {
    loadReferrals();
  }, [loadReferrals]);

  return {
    referrals,
    loading,
    error,
    refresh: loadReferrals
  };
};

// Hook do zarządzania historią nagród
export const useReferralRewards = (userId: string | null, limit: number = 50) => {
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRewards = useCallback(async () => {
    if (!userId) {
      setRewards([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userRewards = await getUserReferralRewards(userId, limit);
      setRewards(userRewards);
    } catch (err) {
      console.error('Error loading rewards history:', err);
      setError('Failed to load rewards history');
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    loadRewards();
  }, [loadRewards]);

  return {
    rewards,
    loading,
    error,
    refresh: loadRewards
  };
};

/**
 * Zapamiętany kod z linku referalowego.
 *
 * Kod musi przeżyć DROGĘ PRZEZ PORTFEL: kliknięcie „Connect" potrafi przerzucić
 * człowieka do aplikacji portfela, do okna keys.coinbase.com albo do skanowania
 * QR telefonem. Gdyby kod żył wyłącznie w adresie URL, każdy taki przeskok
 * gubiłby polecenie - link zadziałałby tylko dla tych, którzy mają portfel
 * gotowy w tej samej karcie.
 *
 * Adres URL ma pierwszeństwo nad magazynem: świeżo kliknięte zaproszenie
 * nadpisuje starsze.
 */
const PENDING_REFERRAL_KEY = 'mysphere.referral.pending';

/**
 * Po tym czasie zapamiętany kod przestaje obowiązywać. Zaproszenie sprzed
 * miesięcy nie ma prawa doczepić się po cichu do konta zakładanego dziś.
 */
const PENDING_REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface PendingReferralCode {
  /** Kod z linku albo z magazynu. `null`, gdy nie ma żadnego. */
  code: string | null;
  /** Skąd pochodzi - rozróżnia „przyszedłeś z linku" od „wracasz". */
  source: 'link' | 'storage' | null;
  /** Czy odczyt (który dzieje się po zamontowaniu) już się odbył. */
  ready: boolean;
  /** Kasuje zapamiętany kod - po rozliczeniu polecenia albo na życzenie. */
  clear: () => void;
}

export const usePendingReferralCode = (): PendingReferralCode => {
  const [code, setCode] = useState<string | null>(null);
  const [source, setSource] = useState<'link' | 'storage' | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Czytamy `window.location`, a nie `useSearchParams()` - ten drugi wymusza
    // na stronie granicę <Suspense> przy prerenderze. Tutaj i tak wszystko
    // dzieje się po zamontowaniu.
    const fromLink = normalizeReferralCode(
      new URLSearchParams(window.location.search).get('ref') || ''
    );

    if (fromLink) {
      setCode(fromLink);
      setSource('link');
      setReady(true);
      try {
        window.localStorage.setItem(
          PENDING_REFERRAL_KEY,
          JSON.stringify({ code: fromLink, savedAt: Date.now() })
        );
      } catch {
        // Tryb prywatny bez magazynu. Kod nadal działa w tej karcie - traci
        // tylko odporność na przeskok do aplikacji portfela.
      }
      return;
    }

    try {
      const raw = window.localStorage.getItem(PENDING_REFERRAL_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { code?: unknown; savedAt?: unknown };
        const savedAt = typeof saved.savedAt === 'number' ? saved.savedAt : 0;
        const savedCode = typeof saved.code === 'string' ? normalizeReferralCode(saved.code) : '';

        if (savedCode && Date.now() - savedAt < PENDING_REFERRAL_TTL_MS) {
          setCode(savedCode);
          setSource('storage');
        } else {
          window.localStorage.removeItem(PENDING_REFERRAL_KEY);
        }
      }
    } catch {
      // Uszkodzony wpis albo brak magazynu - zostajemy bez kodu.
    }

    setReady(true);
  }, []);

  const clear = useCallback(() => {
    setCode(null);
    setSource(null);
    try {
      window.localStorage.removeItem(PENDING_REFERRAL_KEY);
    } catch {
      // nic - i tak wygaśnie po TTL
    }
  }, []);

  return { code, source, ready, clear };
};

/**
 * Hook do obsługi procesu rejestracji z linku referalowego.
 *
 * Zwraca PEŁNY wynik z `registerReferral`, a nie `boolean` - patrz komentarz
 * przy `ReferralRegistrationOutcome`. Strona /join pokazuje inny ekran dla
 * nieznanego kodu, innego dla „już masz polecającego" i inny dla awarii bazy;
 * z jednego `false` nie dało się tego złożyć.
 */
export const useReferralRegistration = () => {
  const [processing, setProcessing] = useState(false);
  const [outcome, setOutcome] = useState<ReferralRegistrationOutcome | null>(null);

  const registerWithReferral = useCallback(async (
    referralCode: string,
    newUserAddress: string,
    metadata?: Partial<Referral['metadata']>
  ): Promise<ReferralRegistrationOutcome> => {
    setProcessing(true);

    try {
      const result = await registerReferral(referralCode, newUserAddress, metadata);
      setOutcome(result);
      return result;
    } catch (err) {
      // registerReferral łapie swoje błędy sam, ale gdyby coś przeciekło,
      // nie zostawiamy strony w stanie „trwa" na zawsze.
      console.error('Error registering referral:', err);
      const failure: ReferralRegistrationOutcome = {
        status: 'failed',
        message: 'We could not save your invite right now. Nothing was lost - you can try again.'
      };
      setOutcome(failure);
      return failure;
    } finally {
      setProcessing(false);
    }
  }, []);

  const resetOutcome = useCallback(() => setOutcome(null), []);

  return {
    registerWithReferral,
    processing,
    outcome,
    resetOutcome,
    /** Komunikat wyłącznie dla awarii - pozostałe wyniki nie są błędami. */
    error: outcome?.status === 'failed' ? outcome.message : null
  };
};

// Hook do sprawdzania statusu referala użytkownika
export const useReferralStatus = (userAddress: string | null) => {
  const [wasReferred, setWasReferred] = useState(false);
  const [referrerId, setReferrerId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      if (!userAddress) {
        setLoading(false);
        return;
      }

      try {
        const status = await checkIfUserWasReferred(userAddress);
        setWasReferred(status.wasReferred);
        setReferrerId(status.referrerId || null);
        setReferralCode(status.referralCode || null);
      } catch (error) {
        console.error('Error checking referral status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [userAddress]);

  return {
    wasReferred,
    referrerId,
    referralCode,
    loading
  };
};

// Hook do kopiowania linku referalowego
export const useReferralLink = (referralLink: string | null) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = useCallback(async () => {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      
      // Reset po 2 sekundach
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Error copying link:', error);
    }
  }, [referralLink]);

  return {
    copyToClipboard,
    copied
  };
};

// Hook do generowania kodu QR dla linku referalowego
export const useReferralQRCode = (referralLink: string | null) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!referralLink) {
      setQrCodeUrl(null);
      return;
    }

    // Używamy API do generowania QR kodów
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(referralLink)}`;
    setQrCodeUrl(qrApiUrl);
  }, [referralLink]);

  return qrCodeUrl;
};

// Hook do śledzenia postępów w kamieniach milowych
export const useMilestoneProgress = (stats: ReferralStats | null) => {
  const [nextMilestone, setNextMilestone] = useState<{
    target: number;
    reward: number;
    progress: number;
  } | null>(null);

  useEffect(() => {
    if (!stats) {
      setNextMilestone(null);
      return;
    }

    const { successfulReferrals, milestones } = stats;

    // Określ następny kamień milowy
    if (!milestones?.five || successfulReferrals < 5) {
      setNextMilestone({
        target: 5,
        reward: 250,
        progress: (successfulReferrals / 5) * 100
      });
    } else if (!milestones?.ten || successfulReferrals < 10) {
      setNextMilestone({
        target: 10,
        reward: 500,
        progress: (successfulReferrals / 10) * 100
      });
    } else if (!milestones?.twentyFive || successfulReferrals < 25) {
      setNextMilestone({
        target: 25,
        reward: 1500,
        progress: (successfulReferrals / 25) * 100
      });
    } else if (!milestones?.fifty || successfulReferrals < 50) {
      setNextMilestone({
        target: 50,
        reward: 5000,
        progress: (successfulReferrals / 50) * 100
      });
    } else {
      // Wszystkie kamienie milowe osiągnięte
      setNextMilestone(null);
    }
  }, [stats]);

  return nextMilestone;
};