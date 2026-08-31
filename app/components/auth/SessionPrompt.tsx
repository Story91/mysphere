'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';
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

/**
 * Odmowa jest zapamietywana NA ADRES i NA CZAS, w localStorage.
 *
 * Bylo w sessionStorage, czyli "do zamkniecia karty" - a to znaczylo, ze kazda
 * nowa karta pytala od nowa. Uzytkownik, ktory raz powiedzial "nie teraz",
 * slyszal to samo pytanie przy nastepnym wejsciu i przy kazdym kolejnym.
 *
 * Nie zapamietujemy odmowy na zawsze: bez podpisu Firestore widzi tego czlowieka
 * jako anonima, wiec pytanie ma prawo wrocic - ale za tydzien, nie za minute.
 */
const DISMISS_PREFIX = 'mysphere.sessionPrompt.dismissed.';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export default function SessionPrompt() {
  const { isConnected, address } = useAccount();
  const { isAuthenticated, isLoading, signIn, error } = useSiweAuth();

  const [dismissed, setDismissed] = useState(true); // domyslnie ukryty do czasu odczytu
  const [isSigning, setIsSigning] = useState(false);
  // Karencja po podlaczeniu portfela. Ekran przedlogowania prowadzi wlasny
  // przeplyw SIWE zaraz po connect() - bez tej przerwy pasek mrugnalby w jego
  // trakcie i proponowal drugi podpis tej samej rzeczy.
  const [graceElapsed, setGraceElapsed] = useState(false);

  // Magazyn czytamy dopiero po zamontowaniu - inaczej render serwerowy
  // i kliencki rozjechalyby sie przy hydracji.
  //
  // Zaleznosc od `address`: odmowa jednego portfela nie moze uciszac pytania
  // dla innego. Kto przepial konto, dostaje pytanie o NOWY adres.
  useEffect(() => {
    if (!address) {
      setDismissed(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(DISMISS_PREFIX + address.toLowerCase());
      const until = raw ? Number(raw) : 0;
      setDismissed(Number.isFinite(until) && until > Date.now());
    } catch {
      // tryb prywatny bez localStorage - pokazujemy pasek
      setDismissed(false);
    }
  }, [address]);

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
    if (!address) return;
    try {
      window.localStorage.setItem(
        DISMISS_PREFIX + address.toLowerCase(),
        String(Date.now() + DISMISS_TTL_MS)
      );
    } catch {
      // brak magazynu oznacza tylko tyle, ze pasek wroci po odswiezeniu
    }
  };

  const handleSignIn = async () => {
    setIsSigning(true);
    try {
      const ok = await signIn();
      if (ok) {
        // POTWIERDZENIE JEST OBOWIAZKOWE. Bez niego jedyna informacja zwrotna
        // po podpisaniu bylo ZNIKNIECIE panelu - a znikanie znaczy w interfejsie
        // tyle samo co "zadzialalo" i "anulowano". Uzytkownik podpisal wiadomosc
        // w portfelu i nie wiedzial, czy cokolwiek z tego wyszlo.
        //
        // Tresc mowi o SKUTKU, nie o mechanice: nikogo nie obchodzi, ze powstala
        // sesja - obchodzi go, ze jego posty i tipy sa od teraz przypisane jemu.
        toast.success('Wallet confirmed — your posts and tips are now recorded as yours.', {
          duration: 5000,
        });
        // Pasek chowamy TYLKO w stanie lokalnym, zeby nie mrugnal miedzy
        // odpowiedzia serwera a przeliczeniem `isAuthenticated`.
        //
        // NIE wolamy tu hide(): ono zapisuje do localStorage znacznik "ten
        // uzytkownik odmowil, nie pytaj przez 7 dni". Udany podpis zapisywany
        // jako odmowa znaczyl, ze gdy sesja wygasnie albo uzytkownik sie
        // wyloguje, prosba o potwierdzenie NIE wroci przez tydzien - a bez niej
        // Firestore znowu widzi go jako anonima. Sukces i odmowa nie moga
        // zostawiac tego samego sladu.
        setDismissed(true);
      }
    } finally {
      setIsSigning(false);
    }
  };

  /**
   * `isLoading` z useSiweAuth znaczy dwie rozne rzeczy: "sprawdzam, czy jest
   * sesja" (przy starcie - wtedy paska nie pokazujemy) ORAZ "trwa podpisywanie",
   * bo signIn() tez je podnosi. Bez wyjatku na `isSigning` klikniecie "Sign"
   * natychmiast KASOWALO caly pasek, a stan "Check your wallet…" nie mial jak
   * sie pokazac - uzytkownik widzial tylko, ze panel znika, i po odrzuceniu
   * podpisu wraca.
   */
  const isCheckingSession = isLoading && !isSigning;
  if (!isConnected || isAuthenticated || isCheckingSession || dismissed || !graceElapsed) return null;

  return (
    <div
      role="region"
      aria-label="Confirm this wallet is yours"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-[420px] rounded-card border border-soft-line bg-soft-surface p-5 font-soft shadow-float sm:inset-x-auto sm:right-4"
    >
      <p className="mb-1 font-soft-display text-[15px] font-semibold text-soft-ink">
        Confirm this wallet is yours
      </p>
      <p className="mb-3 text-[13px] leading-[1.55] text-soft-ink-muted">
        Sign a message so your posts and tips are recorded as yours. It costs no gas and sends no
        transaction.
      </p>

      {error && (
        <p role="alert" className="mb-3 text-[12px] text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSignIn}
          disabled={isSigning}
          aria-busy={isSigning}
          className="rounded-pill bg-soft-primary px-5 py-2 text-[13px] font-semibold text-white shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:active:scale-100"
        >
          {isSigning ? 'Check your wallet…' : 'Sign'}
        </button>
        <button
          type="button"
          onClick={hide}
          className="rounded-pill border border-soft-line px-5 py-2 text-[13px] font-semibold text-soft-ink-muted transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
