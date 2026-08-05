'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount, useDisconnect, useBalance } from 'wagmi';
import { base } from 'viem/chains';
import Avatar from '../identity/Avatar';
import Name from '../identity/Name';
import Address from '../identity/Address';
import ConnectModal from './ConnectModal';
import { useFundingUrl } from '../Navigation/useFundingUrl';

/**
 * Przycisk portfela: logowanie + menu po zalogowaniu.
 *
 * Zastepuje <Wallet>/<ConnectWallet>/<WalletDropdown*> z OnchainKit, ktory Base
 * wygasilo 19 marca 2026. Stoi wylacznie na wagmi + wlasnej warstwie tozsamosci
 * (app/components/identity).
 *
 * Pozycjonowanie: menu jest zwyklym `absolute` wzgledem tego komponentu, ktory
 * ma `relative`. Wczesniejsza wersja z OnchainKit renderowala menu w portalu
 * pozycjonowanym przez Floating UI - i wlasnie dlatego klasy z !important
 * wyrzucaly je na dol strony. Tutaj kontener jest nasz, wiec problem nie wraca.
 */

const ROW = [
  'flex items-center gap-3 w-full px-4 py-2.5',
  'text-[13px] font-medium text-[#C7D4EE]',
  'transition-colors duration-150 hover:bg-white/[0.06] hover:text-[#EEF3FF]',
].join(' ');

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-[#7E93BC]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ExternalMark() {
  return (
    <svg
      className="h-3 w-3 shrink-0 text-[#5C6F94]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M7 17 17 7M17 7H9m8 0v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address, chainId: base.id, query: { enabled: !!address } });
  const fundingUrl = useFundingUrl();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Klikniecie poza menu i Escape zamykaja je.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isMenuOpen]);

  if (!isConnected || !address) {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-xl bg-[#0052FF] px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#0052FF]/90"
        >
          Connect wallet
        </button>
        <ConnectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsMenuOpen((open) => !open)}
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-xl bg-[#0052FF] p-2 text-white transition-colors hover:bg-[#0052FF]/90"
      >
        <Avatar address={address} className="h-6 w-6" />
        <Name address={address} className="hidden text-[13px] font-medium text-white sm:inline" />
      </button>

      {isMenuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[9999] mt-2 w-[300px] max-[360px]:w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-white/10 bg-[#0A1024]/95 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.75)] backdrop-blur-xl"
        >
          {/* Blok tozsamosci czytany jak karta profilu - to apka spolecznosciowa,
              gdzie portfel JEST tozsamoscia. */}
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-4">
            <Avatar address={address} className="h-10 w-10 rounded-full ring-2 ring-[#0052FF]/70" />
            <div className="min-w-0">
              <Name
                address={address}
                className="block truncate font-['Coinbase_Display'] text-[15px] font-semibold text-[#EEF3FF]"
              />
              <span className="block text-[12px] tabular-nums text-[#93A5C9]">
                <Address address={address} />
                {balance && ` · ${Number(balance.formatted).toFixed(4)} ${balance.symbol}`}
              </span>
            </div>
          </div>

          <div className="py-1">
            <Link href="https://keys.coinbase.com" target="_blank" rel="noopener noreferrer" className={ROW}>
              <Icon>
                <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                <path d="M12 16V8m0 0-3 3m3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
              </Icon>
              <span className="flex-1">Wallet</span>
              <ExternalMark />
            </Link>

            <Link
              href={`https://basescan.org/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className={ROW}
            >
              <Icon>
                <path
                  d="M21 21l-5.2-5.2m0 0A7.5 7.5 0 1 0 5.2 5.2a7.5 7.5 0 0 0 10.6 10.6Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Icon>
              <span className="flex-1">Base Scan</span>
              <ExternalMark />
            </Link>

            <Link href="https://bridge.base.org" target="_blank" rel="noopener noreferrer" className={ROW}>
              <Icon>
                <path
                  d="M7 10v4m10-4v4M3 12h4m10 0h4M8 17h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Icon>
              <span className="flex-1">Base Bridge</span>
              <ExternalMark />
            </Link>

            {/* Onramp wymaga session tokenu z /api/onramp/session-token. Gdy go
                nie ma (brak kluczy CDP albo odmowa Coinbase), nie pokazujemy
                martwego wiersza. */}
            {fundingUrl && (
              <a href={fundingUrl} target="_blank" rel="noopener noreferrer" className={ROW}>
                <Icon>
                  <path d="M12 5v14m-7-7h14" strokeLinecap="round" strokeLinejoin="round" />
                </Icon>
                <span className="flex-1">Add funds</span>
                <ExternalMark />
              </a>
            )}
          </div>

          <div className="border-t border-white/[0.08] py-1">
            <button
              type="button"
              onClick={() => {
                disconnect();
                setIsMenuOpen(false);
              }}
              className={`${ROW} !text-[#FF8A8A] hover:!bg-[#FF6B6B]/10 hover:!text-[#FFB3B3]`}
            >
              <Icon>
                <path
                  d="M15 12H3m0 0 3-3m-3 3 3 3M10 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Icon>
              <span className="flex-1 text-left">Disconnect</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
