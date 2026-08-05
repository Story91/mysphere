'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConnect, type Connector } from 'wagmi';

/**
 * Wybor portfela. Zastepuje modal z <ConnectWallet> OnchainKit.
 *
 * Czemu wlasny: OnchainKit zostal wygaszony przez Base 19 marca 2026 (npm
 * zamrozony na 1.1.2, docs usuniete, repo bez commitow od stycznia), a jego
 * modal mial wlasny, nieprzezroczysty motyw, ktory i tak nadpisywalismy.
 *
 * Lista portfeli bierze sie WPROST z konektorow zarejestrowanych w wagmi
 * (app/providers.tsx), wiec nie ma tu zadnej osobnej listy do utrzymania -
 * dodanie konektora w configu automatycznie pokazuje go tutaj.
 *
 * RENDEROWANY PRZEZ PORTAL DO document.body - to nie jest ozdobnik.
 * WalletButton siedzi w <header>, ktory ma `backdrop-blur-xl`. Wlasciwosc
 * `backdrop-filter` tworzy BLOK ZAWIERAJACY dla potomkow z `position: fixed`
 * oraz wlasny kontekst stackingu. Bez portalu `fixed inset-0` pozycjonowalo sie
 * wzgledem headera (modal ladowal na srodku jego obszaru zamiast ekranu),
 * a `z-[10000]` bylo uwiezione wewnatrz `z-50` headera, wiec modal chowal sie
 * pod nawigacja.
 */

/** Etykiety i ikony per id konektora. Nieznane id dostaje nazwe z wagmi. */
const CONNECTOR_META: Record<string, { label: string; hint?: string; icon: string }> = {
  baseAccount: { label: 'Base Account', hint: 'Smart wallet, no extension needed', icon: '🔵' },
  farcaster: { label: 'Farcaster', hint: 'Inside the Farcaster app', icon: '🟣' },
  injected: { label: 'Browser wallet', icon: '🦊' },
  metaMask: { label: 'MetaMask', icon: '🦊' },
  walletConnect: { label: 'WalletConnect', hint: 'Scan with your phone', icon: '🔗' },
  safe: { label: 'Safe', icon: '🔐' },
};

export default function ConnectModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { connectors, connect, status, error } = useConnect();

  // Escape zamyka, a blokada scrolla zapobiega przewijaniu tla pod modalem.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  // Portal montujemy dopiero po stronie klienta - document nie istnieje na serwerze.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isOpen || !mounted) return null;

  const handleConnect = (connector: Connector) => {
    // Wywolanie MUSI zostac w handlerze klikniecia - popup keys.coinbase.com
    // jest blokowany, jesli otwiera sie po asynchronicznej przerwie.
    connect(
      { connector },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a wallet"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#0A1024]/95 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.75)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 className="font-['Coinbase_Display'] text-[15px] font-semibold text-[#EEF3FF]">
            Connect a wallet
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#7E93BC] transition-colors hover:bg-white/[0.06] hover:text-[#EEF3FF]"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="py-1">
          {connectors.map((connector) => {
            const meta = CONNECTOR_META[connector.id];
            const isPending = status === 'pending';

            return (
              <button
                key={connector.uid}
                type="button"
                disabled={isPending}
                onClick={() => handleConnect(connector)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-lg" aria-hidden="true">
                  {meta?.icon ?? '👛'}
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-medium text-[#C7D4EE]">
                    {meta?.label ?? connector.name}
                  </span>
                  {meta?.hint && (
                    <span className="block text-[11px] text-[#7E93BC]">{meta.hint}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="border-t border-white/[0.08] px-5 py-3 text-[12px] text-[#FF8A8A]">
            {error.message.slice(0, 140)}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
