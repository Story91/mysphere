'use client';

/**
 * Kontekst bledow laczenia portfela na stronach /blink/*. Osobny, lekki plik:
 * czyta go panel, a ustawia BlinkWalletShell - zaden z nich nie musi znac
 * drugiego.
 */

import { createContext, useContext } from 'react';

export type BlinkWalletError = {
  /** 'cancelled' to odmowa w portfelu - pokazujemy ja spokojnie, nie jako blad. */
  kind: 'cancelled' | 'not-installed' | 'failed';
  message: string;
  at: number;
};

export const BlinkWalletErrorContext = createContext<{ error: BlinkWalletError | null; clear: () => void }>({
  error: null,
  clear: () => undefined,
});

export function useBlinkWalletError() {
  return useContext(BlinkWalletErrorContext);
}
