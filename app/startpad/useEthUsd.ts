'use client';

import { useEffect, useState } from 'react';
import { NATIVE_IS_USD } from './config';

/**
 * Kurs jednostki natywnej do USD dla dopiskow w UI - KONTRAKT INTERFEJSU dla
 * calego launchpada: jednostka natywna jest zawsze wartoscia glowna, USD tylko
 * dopiskiem ("2.1 ETH · $9,400"), a przy braku kursu dopisek po prostu znika.
 * Dlatego null, nie 0 i nie NaN - zero daloby sie pomylic z prawdziwa cena.
 *
 * NA SIECI, GDZIE NATYWNY PIENIADZ JEST DOLAREM, KURSU SIE NIE PYTA.
 * Arc liczy w USDC, wiec kurs wynosi tam 1 z definicji. Pytanie o niego
 * wyroczni ceny ETH dawaloby dopiski w rodzaju "3 USDC · $13 000" - liczbe
 * fizycznie nieprawdziwa, wzieta z zupelnie innego aktywa.
 */

const POLL_MS = 60_000;

export type EthUsdOptions = {
  /**
   * Czy jednostka natywna jest dolarem. Domyslnie: siec WYBRANA na tablicy
   * (`NATIVE_IS_USD`). Komponent przypiety do jednej sieci podaje to wprost -
   * pasek na /basechat pokazuje zawsze Base, a z domyslna wartoscia
   * przegladarka z zapisanym Arc dostawala kurs 1 i kwoty w ETH wychodzily
   * jako grosze w dolarach.
   */
  nativeIsUsd?: boolean;
};

export function useEthUsd(options?: EthUsdOptions): { usd: number | null; refreshedAt: number | null } {
  const nativeIsUsd = options?.nativeIsUsd ?? NATIVE_IS_USD;
  const [usd, setUsd] = useState<number | null>(nativeIsUsd ? 1 : null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  useEffect(() => {
    // Dolar do dolara. Zadnego zapytania, zadnego pollowania.
    if (nativeIsUsd) return;
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
    // Na ukrytej karcie kurs nikomu nie jest potrzebny - tick odpuszcza fetch,
    // a powrot na karte od razu odswieza, zeby dopiski USD nie byly przeterminowane.
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [nativeIsUsd]);

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
