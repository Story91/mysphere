'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import useSiweAuth from '../../utils/auth/useSiweAuth';

/**
 * Zaproszenie do potwierdzenia portfela podpisem.
 *
 * PO CO TO ISTNIEJE. Caly lancuch tozsamosci - podpis SIWE, weryfikacja
 * on-chain po stronie serwera, token Firebase, `request.auth.uid` rowne adresowi
 * portfela - byl wpiety W JEDNYM miejscu: na ekranie przedlogowania
 * (`app/basechat/prelogin/MockFeed.tsx`). Kto podlaczyl portfel przyciskiem w
 * nawigacji, omijal go w calosci: aplikacja znala jego adres, ale NIC go nie
 * potwierdzalo, a Firestore widzial go jako anonima.
 *
 * Dopoki tak jest, reguly Firestore nie moga wymagac `request.auth` - i wlasnie
 * dlatego regula domyslna w `firestore.rules` wciaz brzmi
 * `allow read, write: if true`. Ten komponent jest brakujacym ogniwem.
 *
 * ZASADY, KTORE TU OBOWIAZUJA:
 *  - podpis NIE jest wymuszany automatycznie. Portfel, ktory sam z siebie
 *    wyskakuje z prosba o podpis, uczy uzytkownikow klikac "podpisz" bez
 *    czytania - to jest dokladnie ten nawyk, ktory ich okrada,
 *  - to nie jest bramka. Aplikacja dziala bez podpisu tak jak dotad,
 *  - odrzucenie chowa pasek do konca sesji karty. Nie pytamy drugi raz.
 */

const DISMISS_KEY = 'mysphere.sessionPrompt.dismissed';

export default function SessionPrompt() {
  const { isConnected } = useAccount();
  const { isAuthenticated, isLoading, signIn, error } = useSiweAuth();

  const [dismissed, setDismissed] = useState(true); // domyslnie ukryty do czasu odczytu
  const [isSigning, setIsSigning] = useState(false);
  // Karencja po podlaczeniu portfela. Ekran przedlogowania prowadzi wlasny
  // przeplyw SIWE zaraz po connect() - bez tej przerwy pasek mrugnalby w jego
  // trakcie i proponowal drugi podpis tej samej rzeczy.
  const [graceElapsed, setGraceElapsed] = useState(false);

  // sessionStorage czytamy dopiero po zamontowaniu - inaczej render serwerowy
  // i kliencki rozjechalyby sie przy hydracji.
  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      // tryb prywatny bez sessionStorage - pokazujemy pasek
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (!isConnected) {
      setGraceElapsed(false);
      return;
    }
    const timer = setTimeout(() => setGraceElapsed(true), 4000);
    return () => clearTimeout(timer);
  }, [isConnected]);

  const hide = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // brak magazynu oznacza tylko tyle, ze pasek wroci po odswiezeniu
    }
  };

  const handleSignIn = async () => {
    setIsSigning(true);
    try {
      const ok = await signIn();
      // Sukces sam usuwa pasek (isAuthenticated), wiec chowamy tylko po to,
      // zeby nie mrugnal miedzy odpowiedzia serwera a przeliczeniem stanu.
      if (ok) hide();
    } finally {
      setIsSigning(false);
    }
  };

  if (!isConnected || isAuthenticated || isLoading || dismissed || !graceElapsed) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-[420px] rounded-2xl border border-white/[0.1] bg-[#0E1730]/95 p-4 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:right-4">
      <p className="mb-1 font-['Coinbase_Display'] text-[14px] font-semibold text-[#EEF3FF]">
        Confirm this wallet is yours
      </p>
      <p className="mb-3 text-[13px] leading-[1.55] text-[#9EB0D2]">
        Sign a message so your posts and tips are recorded as yours. It costs no gas and sends no
        transaction.
      </p>

      {error && <p className="mb-3 text-[12px] text-[#FF8080]">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSignIn}
          disabled={isSigning}
          className="rounded-lg bg-[#0052FF] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#0044D6] disabled:opacity-60"
        >
          {isSigning ? 'Check your wallet…' : 'Sign'}
        </button>
        <button
          onClick={hide}
          className="rounded-lg border border-white/[0.12] px-4 py-2 text-[13px] font-medium text-[#9EB0D2] transition hover:bg-white/[0.04]"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
