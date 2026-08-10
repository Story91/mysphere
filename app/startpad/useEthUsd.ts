'use client';

import { useEffect, useState } from 'react';

/**
 * Kurs ETH/USD dla dopiskow w UI - KONTRAKT INTERFEJSU dla calego launchpada:
 * ETH jest zawsze wartoscia glowna, USD tylko dopiskiem ("2.1 ETH · $9,400"),
 * a przy braku kursu dopisek po prostu znika. Dlatego null, nie 0 i nie NaN -
 * zero daloby sie pomylic z prawdziwa cena.
 */

const POLL_MS = 60_000;

export function useEthUsd(): { usd: number | null; refreshedAt: number | null } {
  const [usd, setUsd] = useState<number | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/launchpad/eth-price');
        if (!response.ok) return;
        const payload = (await response.json()) as { usd?: number; at?: number };
        if (cancelled) return;
        if (typeof payload.usd === 'number' && Number.isFinite(payload.usd) && payload.usd > 0) {
          setUsd(payload.usd);
          setRefreshedAt(typeof payload.at === 'number' ? payload.at : Date.now());
        }
      } catch {
        // Brak kursu nie jest awaria strony - zostaje ostatnia znana wartosc
        // (albo null przy starcie) i dopiski USD sie nie pokazuja.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return { usd, refreshedAt };
}

/**
 * "$1,234", "$42.5", "$0.043", "<$0.01". Progi pod DOPISKI, nie ksiegowosc:
 * ponizej centa dokladnosc nie niesie informacji, powyzej tysiaca centy
 * tylko szumia, a posrodku wystarcza dwie cyfry znaczace.
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '--';
  if (value === 0) return '$0.00';
  if (value < 0.01) return '<$0.01';
  if (value < 1) return `$${value.toLocaleString('en-US', { maximumSignificantDigits: 2 })}`;
  if (value < 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
