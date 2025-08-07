// React hooks dla systemu referali
import { useState, useEffect, useCallback } from 'react';
import { 
  getUserReferralStats, 
  getUserReferrals,
  getUserReferralRewards,
  initializeReferralStats,
  registerReferral,
  checkIfUserWasReferred
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

// Hook do obsługi procesu rejestracji z linku referalowego
export const useReferralRegistration = () => {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerWithReferral = useCallback(async (
    referralCode: string,
    newUserAddress: string,
    metadata?: any
  ): Promise<boolean> => {
    setProcessing(true);
    setError(null);

    try {
      const success = await registerReferral(referralCode, newUserAddress, metadata);
      
      if (!success) {
        setError('Failed to register referral');
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error registering referral:', err);
      setError('An error occurred during registration');
      return false;
    } finally {
      setProcessing(false);
    }
  }, []);

  return {
    registerWithReferral,
    processing,
    error
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