'use client';

import { useEffect, useState } from 'react';
import { Droplets, X } from 'lucide-react';

const KEY = 'deriv-faucet-dismissed';
/** Circle wydaje testowe USDC na Arc Testnet z tego samego kranu, co na inne sieci. */
export const CIRCLE_FAUCET_URL = 'https://faucet.circle.com';

/**
 * Baner testnetu: skad wziac USDC. Znika po zamknieciu (localStorage),
 * ale WRACA, gdy saldo podlaczonego portfela wynosi zero - wtedy nie ma
 * nic wazniejszego do powiedzenia niz "najpierw kran".
 */
export default function FaucetBanner({ balance, connected }: { balance: bigint | null; connected: boolean }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const empty = connected && balance === 0n;
  if (dismissed && !empty) return null;

  return (
    <div className="mb-5 flex items-start gap-3 rounded-[18px] border border-sp-info/20 bg-sp-info-soft px-4 py-3 text-sm">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sp-surface text-sp-info">
        <Droplets className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sp-ink">
          {empty ? 'Your wallet has no USDC on Arc testnet.' : 'You are trading on Arc testnet.'}
        </p>
        <p className="mt-0.5 text-sp-ink-soft">
          Margin is testnet USDC - the same token that pays for gas here. Get some from the{' '}
          <a href={CIRCLE_FAUCET_URL} target="_blank" rel="noreferrer" className="font-semibold text-sp-info underline underline-offset-2">
            Circle faucet
          </a>{' '}
          (pick Arc Testnet), then come back and open a position.
        </p>
      </div>
      {!empty && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(KEY, '1');
            } catch {
              /* prywatne okno - baner wroci przy nastepnej wizycie */
            }
          }}
          className="rounded-full p-1 text-sp-ink-soft hover:bg-sp-surface hover:text-sp-ink"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
