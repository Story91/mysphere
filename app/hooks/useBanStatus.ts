'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { useAccount } from 'wagmi';

interface BanStatus {
  isBanned: boolean;
  reason?: string;
  bannedAt?: string;
}

export function useBanStatus() {
  const { address } = useAccount();
  const [banStatus, setBanStatus] = useState<BanStatus>({ isBanned: false });
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    
    const checkBanStatus = async () => {
      if (!address) {
        setLoading(false);
        return;
      }

      try {
        const banRef = doc(db, 'bannedUsers', address.toLowerCase());
        const banDoc = await getDoc(banRef);

        if (banDoc.exists()) {
          const banData = banDoc.data();
          setBanStatus({
            isBanned: true,
            reason: banData.reason,
            bannedAt: banData.bannedAt,
          });
        } else {
          setBanStatus({ isBanned: false });
        }
      } catch (error) {
        console.error('Error checking ban status:', error);
        setBanStatus({ isBanned: false });
      }

      setLoading(false);
    };

    checkBanStatus();
  }, [address, isMounted]);

  return { ...banStatus, loading, isMounted };
} 