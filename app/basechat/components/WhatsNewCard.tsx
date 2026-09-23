'use client';

/**
 * Karta "co nowego" nad feedem: Solana z kwitami.
 *
 * PO CO: Proof of Bags i platne odpowiedzi z X istnieja od 23.09.2026, ale
 * aplikacja nie ma changelogu ani paska ogloszen, a manifest na /re-definition
 * mowi wprost, ze changelogiem nie jest. Kto nie trafi na post z Solany, nie
 * dowie sie o nich wcale. Jedna karta, zamykana raz na zawsze.
 *
 * WZOR: app/derivatives/FaucetBanner.tsx - start jako zamknieta (nic nie
 * mignie, zanim odczytamy localStorage), odczyt i zapis w try/catch, bo
 * prywatne okno albo zablokowane dane strony rzucaja wyjatkiem.
 *
 * KIEDY SIE NIE POKAZUJE:
 *   - w miniappie Farcastera: zakladki Solany tam nie ma (brak portfela
 *     Solany w webview), wiec karta reklamowalaby cos, czego nie da sie
 *     uzyc. O tym decyduje rodzic (`showSolanaTab` w app/basechat/page.tsx),
 *   - na buildzie devnetowym: platne odpowiedzi odpowiadaja tam 503, a wiersz
 *     "Paid replies on." pod postem (SolanaBlinkShare) sie nie renderuje.
 *
 * Kolor: pomarancz WYLACZNIE na kwocie "0.001 SOL" - w tym systemie
 * pomarancz znaczy kwote i nic wiecej.
 *
 * Klucz ma date w nazwie: nastepne ogloszenie dostaje nowy klucz, a to
 * zamkniete nie wraca.
 *
 * Link prowadzi do /Docs/solana, a nie do /how#post: tam sa oba tematy karty
 * (Proof of Bags i platne odpowiedzi) razem z tym, jak je sprawdzic.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { IS_SOLANA_MAINNET } from '../Solana/config/solanaChain';

const KEY = 'whatsnew-2026-09-solana';

export default function WhatsNewCard({ className = '' }: { className?: string }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(KEY) === '1');
    } catch {
      // Bez dostepu do localStorage karta sie pokazuje, a "zamknij" chowa ja
      // do konca wizyty.
      setDismissed(false);
    }
  }, []);

  if (!IS_SOLANA_MAINNET || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* prywatne okno - karta wroci przy nastepnej wizycie */
    }
  };

  return (
    <section
      aria-label="What's new"
      className={`relative rounded-card border border-soft-line bg-soft-surface px-4 py-3.5 pr-11 font-soft shadow-card sm:px-5 ${className}`}
    >
      <h2 className="font-soft-display text-[14.5px] font-bold text-soft-ink">New: Solana, with receipts.</h2>
      <p className="mt-1 text-[13px] leading-[1.55] text-soft-ink-muted">
        Post on Solana and name a token by its address: the same transaction records what your wallet held of it,
        and the post shows then against now (Proof of Bags). Anyone can answer a Solana post from a link shared on
        X, and the reply and a tip for the author go out in one transaction, from{' '}
        <span className="font-soft-display font-bold text-soft-accent-deep">0.001 SOL</span>.
      </p>
      <Link
        href="/Docs/solana"
        className="mt-1.5 inline-block rounded text-[13px] font-semibold text-soft-primary-deep underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
      >
        How it works
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute right-2.5 top-2.5 rounded-full p-1.5 text-soft-ink-faint transition-colors hover:bg-soft-sunken hover:text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
