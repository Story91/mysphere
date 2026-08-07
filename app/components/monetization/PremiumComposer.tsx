'use client';

import { useEffect, useId, useState } from 'react';
import { DEFAULT_UNLOCK_TOKEN, type MonetizationToken } from '../../utils/monetization/types';

/**
 * Sekcja kompozytora do oznaczania czesci posta jako platnej.
 *
 * Bez tego cala warstwa tip-to-unlock byla martwa: model, brama i weryfikacja
 * platnosci istnialy, ale nie bylo sposobu, zeby ktokolwiek oznaczyl post jako
 * premium.
 *
 * Domyslnie ZWINIETA. Wiekszosc postow nie jest platna, wiec pole nie moze
 * zabierac miejsca ani sugerowac, ze trzeba je wypelnic.
 *
 * === OSTRZEZENIE DLA AUTORA ZMIENILO TRESC, BO ZMIENIL SIE KOD ===
 * Stalo tu: "premiumContent trafia do dokumentu posta, ktory feed czyta
 * klienckim SDK - kto zajrzy w odpowiedz sieciowa, zobaczy tresc bez
 * placenia". Bylo to PRAWDA i bylo powaznym bledem: platna czesc lezala
 * otwartym tekstem w publicznie czytelnej kolekcji `posts`.
 *
 * Od naprawy (app/basechat/page.tsx, sealPremiumContent) tresc nie trafia do
 * dokumentu posta ANI RAZU. Idzie przez POST /api/premium do kolekcji
 * `premiumContent`, ktora ma w regulach `allow read, write: if false` - czyli
 * przegladarka nie ma tam wstepu wcale - i wydaje ja wylacznie GET
 * /api/premium po sprawdzeniu wpisu w `unlocks`.
 *
 * CO ZOSTAJE PRAWDA I DLATEGO ZOSTAJE NAPISANE UZYTKOWNIKOWI: to nadal nie
 * jest szyfrowanie. Kazdy, kto zaplaci, dostaje tekst i moze go skopiowac
 * gdziekolwiek. Zaslona dziala na tych, ktorzy nie zaplacili - nie na tych,
 * ktorzy zaplacili raz.
 */

export interface PremiumComposerValue {
  premiumContent: string;
  unlockPrice: string;
  unlockToken: MonetizationToken;
}

export const EMPTY_PREMIUM: PremiumComposerValue = {
  premiumContent: '',
  unlockPrice: '0.5',
  unlockToken: DEFAULT_UNLOCK_TOKEN,
};

export default function PremiumComposer({
  value,
  onChange,
  isOpen,
  onToggle,
  disabled = false,
}: {
  value: PremiumComposerValue;
  onChange: (next: PremiumComposerValue) => void;
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const contentId = useId();
  const priceId = useId();

  const priceNumber = parseFloat(value.unlockPrice);
  const priceInvalid = value.premiumContent.trim().length > 0 && (!Number.isFinite(priceNumber) || priceNumber <= 0);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1.5 rounded-pill font-soft text-xs font-semibold text-soft-ink-muted transition-[color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-accent-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-50 disabled:active:scale-100"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
        </svg>
        {isOpen ? 'Remove paid section' : 'Add a paid section'}
      </button>

      {/* ===== POMARANCZ TYLKO NA PIENIADZACH, NIE NA CALYM PANELU =====
          Ten blok byl w calosci pomaranczowy: tlo bg-soft-accent-soft,
          wszystkie obwodki border-soft-accent, KAZDA etykieta
          text-soft-accent-deep. Wygladalo to jak zolta plama w bialym
          kompozytorze i lamalo wlasna zasade systemu.

          Zasada brzmi "pomaranczowy jest zarezerwowany dla pieniedzy" i ma
          sens dokladnie tak dlugo, jak dlugo pomaranczowy jest RZADKI. Gdy
          nosi go tlo, ramka i trzy napisy, przestaje cokolwiek znaczyc -
          wzrok nie ma za czym isc.

          Teraz panel jest zwyklym blokiem na lawendowym tle, a akcent zostaje
          na jednej rzeczy: na cenie. To ona jest tu pieniedzmi. */}
      {isOpen && (
        <div className="mt-2 rounded-card border border-soft-line bg-soft-bg p-4 font-soft">
          <label
            htmlFor={contentId}
            className="mb-1.5 block font-soft-display text-[11px] font-bold uppercase tracking-[0.08em] text-soft-ink-faint"
          >
            Paid part of this post
          </label>
          <textarea
            id={contentId}
            value={value.premiumContent}
            onChange={(e) => onChange({ ...value, premiumContent: e.target.value })}
            rows={3}
            disabled={disabled}
            placeholder="Only readers who pay will see this."
            className="w-full resize-none rounded-2xl border border-soft-line bg-soft-surface px-3 py-2 text-sm text-soft-ink outline-none transition-[border-color] [transition-duration:var(--dur-press)] ease-out-strong placeholder:text-soft-ink-soft focus:border-soft-primary focus-visible:ring-2 focus-visible:ring-soft-primary"
          />

          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <label
                htmlFor={priceId}
                className="mb-1.5 block font-soft-display text-[11px] font-bold uppercase tracking-[0.08em] text-soft-accent-deep"
              >
                Price
              </label>
              <input
                id={priceId}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={value.unlockPrice}
                onChange={(e) => onChange({ ...value, unlockPrice: e.target.value })}
                disabled={disabled}
                className="w-full rounded-2xl border border-soft-line bg-soft-surface px-3 py-2 font-soft-display text-sm font-bold tabular-nums text-soft-accent-deep outline-none transition-[border-color] [transition-duration:var(--dur-press)] ease-out-strong focus:border-soft-accent focus-visible:ring-2 focus-visible:ring-soft-primary"
              />
            </div>
            <div className="flex gap-1 pb-0.5">
              {(['USDC', 'ETH'] as const).map((token) => (
                <button
                  key={token}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...value, unlockToken: token })}
                  className={`rounded-pill border px-3 py-2 font-soft-display text-xs font-semibold transition-[background-color,border-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${
                    value.unlockToken === token
                      ? 'border-soft-primary bg-soft-surface text-soft-primary-deep'
                      : 'border-soft-line text-soft-ink-muted hover:border-soft-primary/60'
                  }`}
                >
                  {token}
                </button>
              ))}
            </div>
          </div>

          {priceInvalid && (
            <p className="mt-2 text-xs text-red-700">
              Set a price above zero, or remove the paid section.
            </p>
          )}

          {/* Ostrzezenie widoczne, nie ukryte. Autor podejmuje decyzje
              o zamknieciu tresci i musi wiedziec, czym ta zaslona naprawde jest. */}
          <p className="mt-3 border-t border-soft-line pt-2 text-[11px] leading-relaxed text-soft-ink-soft">
            This text is stored where the app cannot read it and is only handed out
            after someone pays. It is not encrypted, though: anyone who pays once can
            copy it anywhere. Price what a stranger reposting it would cost you.
          </p>

          {/* ETH jest weryfikowane slabiej niz USDC - powiedz to wprost,
              zamiast pozwolic autorowi odkryc to pozniej. */}
          {value.unlockToken === 'ETH' && (
            <p className="mt-2 text-[11px] leading-relaxed text-soft-ink-soft">
              Payments in ETH from smart wallets can only be confirmed as
              &ldquo;succeeded&rdquo;, not matched to an exact amount. USDC is verified
              precisely.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
