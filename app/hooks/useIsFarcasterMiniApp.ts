'use client';

/**
 * Czy aplikacja jest otwarta wewnatrz miniappa Farcastera.
 *
 * ===========================================================================
 * PO CO TO POWSTALO
 * ===========================================================================
 * Miniapp Farcastera renderuje sie w webview hosta, a nie w przegladarce
 * uzytkownika. Portfel jest tam WSTRZYKIWANY przez hosta (konektor
 * 'farcaster' w app/providers.tsx) i jest to portfel EVM. Rozszerzenia
 * przegladarki - Phantom, Solflare, Backpack - w tym webview nie istnieja i
 * nigdy sie nie pojawia.
 *
 * Bez tego sprawdzenia zakladka Solany w basechacie bylaby w miniappie
 * przyciskiem, ktory otwiera wybor portfela, gdzie nie ma zadnego portfela do
 * wybrania. Dokladnie tak zachowywal sie przez miesiac Robinhood z pustym
 * adresem kontraktu - przycisk wygladajacy na dzialajacy jest gorszy niz brak
 * przycisku.
 *
 * ===========================================================================
 * DLACZEGO TRZY STANY, A NIE DWA
 * ===========================================================================
 * `sdk.isInMiniApp()` jest asynchroniczne. Gdyby hook zwracal `false` w czasie
 * sprawdzania, interfejs pokazalby zakladke Solany i schowal ja po chwili -
 * mignięcie elementu, ktory zaraz znika. `null` oznacza "jeszcze nie wiem" i
 * pozwala wywolujacemu wstrzymac sie z decyzja.
 *
 * Timeout jest tu z tego samego powodu co w FarcasterFrameProvider: poza
 * hostem nikt na to wywolanie nie odpowiada i bez ogranicznika czasu obietnica
 * potrafi nie rozwiazac sie nigdy (zmierzone na localhoscie).
 */

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/** Ile czekamy na odpowiedz hosta, zanim uznamy, ze go nie ma. */
const DETECTION_TIMEOUT_MS = 1000;

export function useIsFarcasterMiniApp(): boolean | null {
  const [isMiniApp, setIsMiniApp] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      try {
        const result = await Promise.race([
          sdk.isInMiniApp(),
          new Promise<false>(resolve => setTimeout(() => resolve(false), DETECTION_TIMEOUT_MS)),
        ]);
        if (!cancelled) setIsMiniApp(result);
      } catch {
        // Brak SDK albo brak hosta to NIE awaria - to zwykla przegladarka.
        if (!cancelled) setIsMiniApp(false);
      }
    };

    detect();

    return () => {
      cancelled = true;
    };
  }, []);

  return isMiniApp;
}
