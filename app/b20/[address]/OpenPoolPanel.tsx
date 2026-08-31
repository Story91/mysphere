'use client';

import { useState } from 'react';

/**
 * Domkniecie petli dla tokena BEZ RYNKU.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Tworzenie tokena konczylo sie tokenem - i na tym stawalo. Zeby ktokolwiek
 * mogl go kupic, ktos musi otworzyc pule, a do tego trzeba bylo samemu wpasc
 * na pomysl, wejsc na Uniswapa i przepisac czterdziestoznakowy adres.
 *
 * Docelowo robi to nasz kontrakt w jednej transakcji razem z tokenem. Zanim
 * stanie na sieci, ta sciezka istnieje i dziala - tak samo jak przycisk kupna,
 * ktory tez tylko prowadzi do prawdziwej puli, zamiast budowac wlasna wymiane.
 *
 * ===========================================================================
 * DLACZEGO ADRES DO SKOPIOWANIA, A NIE WYPELNIONY FORMULARZ
 * ===========================================================================
 * Uniswap nie dokumentuje parametrow wstepnego wypelnienia dla v4. Zgadniety
 * adres, ktory kiedys przestanie dzialac, byl by gorszy niz jawne "skopiuj
 * i wklej": ten drugi dziala zawsze i nie psuje sie po ich zmianie.
 */

const POOL_URL = 'https://app.uniswap.org/positions/create?chain=base';

export default function OpenPoolPanel({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      // Potwierdzenie wraca samo. Bez tego przycisk zostaje na zawsze
      // w stanie "skopiowano" i drugie klikniecie nie daje zadnego sygnalu.
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Schowek bywa zablokowany. Nie udajemy sukcesu - napis sie nie zmienia,
      // a adres i tak stoi obok do zaznaczenia recznie.
    }
  };

  return (
    <div className="mt-3 border-t border-soft-line pt-3">
      <p className="text-[12.5px] leading-[1.55] text-soft-ink-muted">
        Anyone can give this token a price by opening a pool against ETH. Whoever does it puts up
        both sides and keeps the position. We do not hold it and cannot take it.
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <a
          href={POOL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-pill bg-soft-primary px-4 py-2 font-soft-display text-[12.5px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
        >
          Open a pool on Uniswap ↗
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-pill border border-soft-line px-4 py-2 font-soft-display text-[12.5px] font-bold text-soft-ink-muted transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-ink active:scale-[0.97]"
        >
          {copied ? 'Address copied' : 'Copy token address'}
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-[1.5] text-soft-ink-faint">
        Paste the address as the second token. Uniswap does not accept a pre-filled address in the
        link, so this is the shortest honest path.
      </p>
    </div>
  );
}
