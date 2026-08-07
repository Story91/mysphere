'use client';

import { useCallback, useState } from 'react';
import { useAccount } from 'wagmi';

import useSiweAuth from '../../utils/auth/useSiweAuth';

/**
 * Ekran pokazywany, gdy przegladarka NIE MA serwerowej sesji SIWE.
 *
 * DLACZEGO ISTNIEJE OSOBNO: podlaczony portfel w wagmi to nie to samo co sesja
 * po stronie serwera. Admin moze miec portfel podlaczony i mimo to nie miec
 * cookie - i wtedy 404 bylby zagadka, a nie odmowa. Ten ekran daje droge dalej
 * i NIE POKAZUJE ANI JEDNEJ danej operacyjnej: zadnego adresu infrastruktury,
 * zadnego progu, zadnego salda. Nawet po podpisie nieadmin zobaczy stad 404.
 */
export default function OpsSignInGate() {
  const { address, status } = useAccount();
  const { signIn, isLoading, error } = useSiweAuth();
  const [isWorking, setIsWorking] = useState(false);

  const isSettling = status === 'connecting' || status === 'reconnecting';

  const handleSignIn = useCallback(async () => {
    setIsWorking(true);
    const ok = await signIn();
    if (ok) {
      // Bramka siedzi w komponencie SERWEROWYM, wiec o nowej sesji dowie sie
      // dopiero przy kolejnym zadaniu. Pelne przeladowanie jest tu uczciwsze
      // niz router.refresh(): sesja zmienia tozsamosc calej strony.
      window.location.reload();
      return;
    }
    setIsWorking(false);
  }, [signIn]);

  const busy = isWorking || isLoading || isSettling;

  return (
    <main className="min-h-screen bg-soft-bg px-4 py-16 font-soft text-soft-ink">
      <div className="mx-auto max-w-md rounded-card bg-soft-surface p-8 shadow-card">
        <h1 className="font-soft-display text-2xl font-bold">Sign in to continue</h1>
        <p className="mt-3 text-sm leading-relaxed text-soft-ink-muted">
          This page reads live infrastructure state, so it needs a wallet signature the server can
          verify, not just a connected wallet.
        </p>

        {!address && !isSettling && (
          <p className="mt-4 rounded-2xl bg-soft-sunken px-4 py-3 text-sm text-soft-ink-muted">
            Connect a wallet first, then sign in here.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-2xl bg-[#FBEEF1] px-4 py-3 text-sm text-[#A33A50]">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSignIn}
          disabled={busy || !address}
          className="mt-6 w-full rounded-pill bg-soft-primary px-6 py-3 font-soft-display text-base font-bold text-white shadow-chip transition-transform ease-out-strong [transition-duration:var(--dur-press)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Waiting for the signature…' : 'Sign in with wallet'}
        </button>
      </div>
    </main>
  );
}
