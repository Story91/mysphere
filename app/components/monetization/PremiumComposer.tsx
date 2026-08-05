'use client';

import { useId } from 'react';
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
 * OSTRZEZENIE DLA AUTORA jest tu celowo widoczne, a nie schowane w komentarzu
 * w kodzie: `premiumContent` trafia do dokumentu posta, ktory feed czyta
 * klienckim SDK Firestore. To zaslona platnicza, nie szyfrowanie - kto zajrzy
 * w odpowiedz sieciowa, zobaczy tresc bez placenia. Czlowiek zamykajacy tresc
 * musi to wiedziec ZANIM cos tam wklei.
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
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-amber-600 disabled:opacity-50 dark:text-gray-400 dark:hover:text-amber-400"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
        </svg>
        {isOpen ? 'Remove paid section' : 'Add a paid section'}
      </button>

      {isOpen && (
        <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-50/60 p-3 dark:bg-amber-900/10">
          <label
            htmlFor={contentId}
            className="mb-1.5 block text-xs font-medium text-amber-800 dark:text-amber-300"
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
            className="w-full resize-none rounded-lg border border-amber-300/60 bg-white/80 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-amber-500 dark:border-amber-700/50 dark:bg-gray-900/60 dark:text-white"
          />

          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <label
                htmlFor={priceId}
                className="mb-1.5 block text-xs font-medium text-amber-800 dark:text-amber-300"
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
                className="w-full rounded-lg border border-amber-300/60 bg-white/80 px-3 py-2 text-sm tabular-nums text-gray-900 outline-none focus:border-amber-500 dark:border-amber-700/50 dark:bg-gray-900/60 dark:text-white"
              />
            </div>
            <div className="flex gap-1 pb-0.5">
              {(['USDC', 'ETH'] as const).map((token) => (
                <button
                  key={token}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...value, unlockToken: token })}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    value.unlockToken === token
                      ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                      : 'border-amber-300/50 text-gray-500 hover:border-amber-400 dark:text-gray-400'
                  }`}
                >
                  {token}
                </button>
              ))}
            </div>
          </div>

          {priceInvalid && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              Set a price above zero, or remove the paid section.
            </p>
          )}

          {/* Ostrzezenie widoczne, nie ukryte. Autor podejmuje decyzje
              o zamknieciu tresci i musi wiedziec, czym ta zaslona naprawde jest. */}
          <p className="mt-3 border-t border-amber-400/30 pt-2 text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-300/80">
            This puts the text behind a payment, but it does not encrypt it. Anyone
            technical enough to read the page&apos;s network response can see it without
            paying. Do not put anything here you could not afford to have public.
          </p>

          {/* ETH jest weryfikowane slabiej niz USDC - powiedz to wprost,
              zamiast pozwolic autorowi odkryc to pozniej. */}
          {value.unlockToken === 'ETH' && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-300/80">
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
