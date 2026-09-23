'use client';

/**
 * Wspolne klocki paneli platnosci /blink/reply i /blink/tip.
 *
 * Wlasciciel (23.09.2026): "wyglada troche jak AI". Chodzilo o gradient
 * fiolet->zielen Solany na przycisku, blade lawendowe pastylki, stopke
 * "Runs on Solana." i panel wiszacy na srodku pustej strony. Zasady tych
 * klockow:
 *   - JEDEN glowny przycisk na ekran, pelny kolor marki (soft-primary-deep),
 *     a jego napis mowi, co sie stanie i za ile,
 *   - wybrany wariant kwoty to pelny atrament, nie podbarwione tlo,
 *   - kwoty cyframi tabelarycznymi, zeby nie skakaly przy zmianie,
 *   - stany (sukces, czeka, blad) w tym samym ukladzie: tytul, zdanie, akcje,
 *   - teksty w ink-muted, nie ink-faint (kontrast AA na bialym),
 *   - cele dotyku min. 44 px, widoczny pierscien fokusu z klawiatury.
 */

import { useState, type ReactNode } from 'react';

export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-4 w-4 motion-safe:animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  busy,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-soft-primary-deep px-5 text-[15px] font-bold text-soft-on-primary transition-[background-color,transform] duration-150 hover:bg-soft-primary-deep/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:active:scale-100 ${
        busy ? 'cursor-progress' : 'disabled:bg-soft-line disabled:text-soft-ink-muted'
      } ${FOCUS_RING}`}
    >
      {busy && <Spinner />}
      <span className="tabular-nums">{children}</span>
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[44px] w-full items-center justify-center rounded-pill border border-soft-line-strong bg-soft-surface px-4 text-sm font-semibold text-soft-ink transition-colors hover:bg-soft-sunken disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}

/** Kwota bez zer na koncu: 0.050 -> "0.05". */
export function formatAmount(value: number): string {
  return String(Number(value.toFixed(9)));
}

/** `srSuffix` np. "SOL" - widoczna jest sama liczba, czytnik slyszy jednostke. */
export type AmountOption = { value: string; label: string; srSuffix?: string };

/**
 * Przelacznik kwot. Radio pod spodem, wiec strzalki z klawiatury i czytniki
 * ekranu dzialaja jak w natywnej grupie opcji.
 */
export function AmountSegments({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
  disabled,
}: {
  name: string;
  legend: string;
  hint?: ReactNode;
  options: AmountOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    // Jednostka stoi w samej legendzie, a nie absolutnie w rogu: <legend> ma
    // w przegladarkach wlasne pozycjonowanie i "SOL" z `absolute top-0`
    // nachodzilo na przyciski kwot.
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 truncate text-sm font-semibold text-soft-ink">
        {legend}
        {hint && <span className="ml-1.5 font-normal text-soft-ink-muted">in {hint}</span>}
      </legend>
      <div
        className="grid gap-1 rounded-2xl border border-soft-line bg-soft-surface p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map(option => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={`relative flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl px-2 text-[15px] font-semibold tabular-nums transition-colors duration-150 focus-within:ring-2 focus-within:ring-soft-primary focus-within:ring-offset-1 ${
                selected ? 'bg-soft-ink text-white' : 'text-soft-ink hover:bg-soft-sunken'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
              {option.srSuffix && <span className="sr-only"> {option.srSuffix}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  pending: 'border-amber-200 bg-amber-50 text-amber-950',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
  info: 'border-soft-line bg-soft-sunken/60 text-soft-ink',
} as const;

const TONE_ICON = {
  success: (
    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  pending: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5v5.5M12 16.2v.3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v5.5M12 7.8v.3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
} as const;

/** Stan w jednym ukladzie: ikona, tytul, tresc, akcje. */
export function StatusCard({
  tone,
  title,
  children,
  role,
}: {
  tone: keyof typeof TONES;
  title: ReactNode;
  children?: ReactNode;
  role?: 'status' | 'alert';
}) {
  return (
    <div role={role} className={`rounded-2xl border px-4 py-3.5 ${TONES[tone]}`}>
      <div className="flex gap-3">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0">
          {TONE_ICON[tone]}
        </svg>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug">{title}</p>
          {children && <div className="mt-1 space-y-2 text-sm leading-relaxed">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/** Podpis transakcji do skopiowania - przy "zaplacone, niezapisane" to jedyny dowod. */
export function SignatureLine({ signature, label = 'Signature' }: { signature: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2">
      <p className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">
        <span className="sr-only">{label}: </span>
        {signature}
      </p>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(signature)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            })
            .catch(() => undefined);
        }}
        className={`min-h-[36px] shrink-0 rounded-lg px-2.5 text-xs font-semibold underline-offset-2 hover:underline ${FOCUS_RING}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** Podlaczony portfel - jedna cicha linia nad przyciskiem, z mozliwoscia zmiany. */
export function WalletLine({
  address,
  walletName,
  onSwitch,
  disabled,
}: {
  address: string;
  walletName: string | null;
  onSwitch: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-soft-ink-muted">
      <p className="min-w-0 truncate">
        Paying from <span className="font-mono text-soft-ink">{`${address.slice(0, 4)}…${address.slice(-4)}`}</span>
        {walletName ? ` · ${walletName}` : ''}
      </p>
      <button
        type="button"
        onClick={onSwitch}
        disabled={disabled}
        className={`min-h-[44px] shrink-0 rounded-lg px-2 font-semibold text-soft-primary-deep hover:underline disabled:opacity-50 ${FOCUS_RING}`}
      >
        Switch wallet
      </button>
    </div>
  );
}

export const LINK_CLASS = `rounded font-semibold text-soft-primary-deep underline-offset-2 hover:underline ${FOCUS_RING}`;
