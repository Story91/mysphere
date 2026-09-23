'use client';

/**
 * Blok "Open this page in your wallet" - pokazywany ZAMIAST modala, gdy w tej
 * przegladarce nie ma zadnego portfela Solany (najczesciej: przegladarka
 * wbudowana w X). Naglowek walletLinks.ts mowi, dlaczego tak.
 *
 * Na telefonie: universal linki Phantoma, Solflare i Backpacka, ktore otwieraja
 * TEN SAM adres w przegladarce portfela (ze szkicem odpowiedzi w parametrach).
 * Na komputerze: link do instalacji Phantoma - rozszerzenie wstrzykuje sie
 * dopiero przy ladowaniu strony, stad "Reload".
 *
 * Ikon portfeli nie ma w public/, a obrazkow z cudzych domen nie linkujemy -
 * przyciski sa tekstowe.
 */

import { useMemo } from 'react';
import {
  isMobileDevice,
  PHANTOM_DOWNLOAD_URL,
  walletBrowseLinks,
  withCarriedParams,
} from './walletLinks';
import { FOCUS_RING } from './ui';

const X_GUIDANCE =
  "X's built-in browser has no wallet. Open this page in your wallet app, or in a browser with the Phantom extension.";

export default function OpenInWallet({
  carry,
  carryNote,
  compact = false,
}: {
  /** Parametry doklejane do adresu (np. szkic odpowiedzi), zeby nie pisac od nowa. */
  carry?: Record<string, string | undefined>;
  /** Zdanie pod linkami, gdy cos faktycznie przenosimy (np. "Your reply comes with you."). */
  carryNote?: string;
  /** Wersja pod bledem polaczenia - bez naglowka, tylko linki. */
  compact?: boolean;
}) {
  const mobile = useMemo(
    () => (typeof navigator === 'undefined' ? true : isMobileDevice(navigator.userAgent, navigator.maxTouchPoints)),
    []
  );

  const links = useMemo(() => {
    if (typeof window === 'undefined') return [];
    const pageUrl = withCarriedParams(window.location.href, carry ?? {});
    return walletBrowseLinks(pageUrl, window.location.origin);
  }, [carry]);

  const linkBase = `flex min-h-[44px] w-full items-center justify-center rounded-pill px-4 text-[15px] font-bold transition-colors ${FOCUS_RING}`;
  const primaryLink = `${linkBase} bg-soft-primary-deep text-soft-on-primary hover:bg-soft-primary-deep/90`;
  const secondaryLink = `${linkBase} border border-soft-line-strong bg-soft-surface text-soft-ink hover:bg-soft-sunken`;

  if (compact) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-soft-ink-muted">Or open this page in your wallet app:</p>
        <div className="grid grid-cols-3 gap-2">
          {links.map(link => (
            <a key={link.id} href={link.href} aria-label={`Open in ${link.label}`} className={secondaryLink}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    );
  }

  if (!mobile) {
    return (
      <section aria-labelledby="open-in-wallet-title" className="rounded-2xl border border-soft-line bg-soft-sunken/50 p-4">
        <h2 id="open-in-wallet-title" className="font-bold text-soft-ink">
          No Solana wallet in this browser
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-soft-ink-muted">
          Install the Phantom extension, then reload this page. {X_GUIDANCE}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <a href={PHANTOM_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className={primaryLink}>
            Get Phantom
          </a>
          <button
            type="button"
            // Przeladowanie z przeniesionymi parametrami - szkic przetrwa instalacje.
            onClick={() => window.location.assign(withCarriedParams(window.location.href, carry ?? {}))}
            className={secondaryLink}
          >
            I installed it, reload
          </button>
        </div>
      </section>
    );
  }

  const [first, ...rest] = links;
  return (
    <section aria-labelledby="open-in-wallet-title" className="rounded-2xl border border-soft-line bg-soft-sunken/50 p-4">
      <h2 id="open-in-wallet-title" className="font-bold text-soft-ink">
        Open this page in your wallet
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-soft-ink-muted">{X_GUIDANCE}</p>
      <div className="mt-3 space-y-2">
        {first && (
          <a href={first.href} className={primaryLink}>
            Open in {first.label}
          </a>
        )}
        <div className="grid grid-cols-2 gap-2">
          {rest.map(link => (
            <a key={link.id} href={link.href} aria-label={`Open in ${link.label}`} className={secondaryLink}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
      {carryNote && <p className="mt-3 text-xs text-soft-ink-muted">{carryNote}</p>}
    </section>
  );
}
