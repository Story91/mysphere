'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount, useDisconnect, useBalance } from 'wagmi';
import { base } from 'viem/chains';
import Avatar from '../identity/Avatar';
import Name from '../identity/Name';
import Address from '../identity/Address';
import ConnectModal from './ConnectModal';
import { useFundingUrl } from '../Navigation/useFundingUrl';
import { useSolanaWallet } from '../solana/SolanaWalletHost';
import { SOLANA_ROUTE, shortSolanaAddress } from '../solana/solanaWalletNav';

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

const MENU_ID = 'wallet-menu';

const ROW = [
  'flex items-center gap-3 w-full px-4 py-2.5',
  'font-soft text-[13px] font-semibold text-soft-ink-muted',
  'transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong',
  'hover:bg-soft-sunken hover:text-soft-ink active:scale-[0.98]',
  'outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-inset',
].join(' ');

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-soft-ink-faint"
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
      className="h-3 w-3 shrink-0 text-soft-ink-faint"
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
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const solana = useSolanaWallet();
  const router = useRouter();
  const { data: balance } = useBalance({ address, chainId: base.id, query: { enabled: !!address } });
  const fundingUrl = useFundingUrl();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Klikniecie poza menu i Escape zamykaja je.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setIsMenuOpen(false);
      // Escape musi oddac fokus przyciskowi, ktory menu otworzyl. Bez tego
      // fokus zostaje na zniknietym elemencie i klawiatura zaczyna od poczatku
      // dokumentu.
      triggerRef.current?.focus();
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
    const connectButton = (
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="rounded-pill bg-soft-primary px-4 py-2 font-soft-display text-[13px] font-bold text-white shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
      >
        Connect wallet
      </button>
    );
    const modal = <ConnectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} solana="navigate" />;

    // Samo konto Solany, bez strony EVM: Solflare/Backpack (nie maja EVM),
    // odmowa strony EVM przy podwojnym laczeniu albo "Disconnect" EVM przy
    // zostawionej Solanie. Menu ponizej istnieje tylko z portfelem EVM, wiec
    // bez tego znacznika podpietego konta Solany nie bylo widac nigdzie w
    // nawigacji i nie dalo sie go odpiac.
    if (solana.connected) {
      const short = shortSolanaAddress(solana.address);
      return (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => solana.disconnect()}
            aria-label={`Disconnect Solana account ${short}`}
            title={`Solana ${short} - click to disconnect`}
            className="group flex items-center gap-1.5 rounded-pill border border-soft-line bg-soft-surface px-2.5 py-2 font-soft-display text-[12px] font-bold tabular-nums text-soft-ink transition-[background-color,border-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:border-soft-line-strong hover:bg-soft-sunken active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- znak Solany z public/ */}
            <img src="/solana.svg" alt="" className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{short}</span>
            <svg aria-hidden="true" className="h-3 w-3 text-soft-ink-faint group-hover:text-soft-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
          {connectButton}
          {modal}
        </div>
      );
    }

    return (
      <>
        {connectButton}
        {modal}
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Etykieta jest wymuszona, bo ponizej progu `sm` przycisk ma w srodku
          wylacznie awatar (nazwa jest ukryta) - bez niej przycisk nie ma zadnej
          nazwy dostepnej. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsMenuOpen((open) => !open)}
        aria-expanded={isMenuOpen}
        aria-haspopup="true"
        aria-controls={MENU_ID}
        aria-label="Wallet menu"
        className="flex items-center gap-2 rounded-pill bg-soft-primary p-2 sm:pr-3 text-white shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
      >
        <Avatar address={address} className="h-6 w-6" />
        <Name address={address} className="hidden font-soft-display text-[13px] font-bold text-white sm:inline" />
      </button>

      {isMenuOpen && (
        <div
          id={MENU_ID}
          /* Popover skaluje sie OD SWOJEGO PRZYCISKU, nie od srodka - stad
             origin-top-right. Menu wychodzi spod przycisku portfela w prawym
             gornym rogu, wiec tam ma miec punkt zaczepienia. */
          className="absolute right-0 top-full z-[9999] mt-2 w-[300px] max-[360px]:w-[calc(100vw-24px)] origin-top-right overflow-hidden rounded-card border border-soft-line bg-soft-surface shadow-float animate-in fade-in-0 zoom-in-95 duration-200 ease-out-strong"
        >
          {/* Blok tozsamosci czytany jak karta profilu - to apka spolecznosciowa,
              gdzie portfel JEST tozsamoscia. */}
          <div className="flex items-center gap-3 border-b border-soft-line px-4 py-4">
            <Avatar address={address} className="h-10 w-10 rounded-full ring-2 ring-soft-primary/70" />
            <div className="min-w-0">
              <Name
                address={address}
                className="block truncate font-soft-display text-[15px] font-bold text-soft-ink"
              />
              <span className="block font-soft-display text-[12px] tabular-nums text-soft-ink-soft">
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

            {/* Konto Solany obok EVM. Bez tego wiersza jedynym miejscem, gdzie
                bylo widac podpiete konto Solany (i jedynym, gdzie dalo sie je
                odpiac), byl composer w basechacie. Wiersz dziala tak samo jak
                wybor Solany w przelaczniku sieci: konto Solany TEGO SAMEGO
                portfela, a bez pary - wybor portfela. W miniappie Farcastera
                Solany nie ma, wiec wiersza tez nie. */}
            {solana.available && (
              <button
                type="button"
                onClick={() => {
                  router.push(SOLANA_ROUTE);
                  if (solana.connected) solana.setMode('solana');
                  else solana.connectPreferred(connector?.name ?? null);
                  setIsMenuOpen(false);
                }}
                className={ROW}
                aria-label={
                  solana.connected
                    ? `Solana account ${shortSolanaAddress(solana.address)}, open Solana`
                    : 'Connect Solana account'
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- znak Solany z public/ */}
                <img src="/solana.svg" alt="" className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">
                  {solana.connected
                    ? `Solana · ${shortSolanaAddress(solana.address)}`
                    : solana.connecting
                      ? 'Connecting Solana…'
                      : 'Connect Solana account'}
                </span>
              </button>
            )}

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

          <div className="border-t border-soft-line py-1">
            <button
              type="button"
              onClick={() => {
                disconnect();
                setIsMenuOpen(false);
              }}
              /* Jasna czerwien z ciemnego motywu (#FF8A8A) na bialej karcie ma
                 2.2:1. accent-deep to najciemniejszy cieply ton w palecie i
                 nadal czyta sie jako ostrzezenie. */
              className={`${ROW} !text-soft-accent-deep hover:!bg-soft-accent-soft hover:!text-soft-accent-deep`}
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
            {/* Odpiecie Solany osobno: "Disconnect" wyzej rozlacza strone EVM
                (profil), a konto Solany jest drugim, niezaleznym polaczeniem
                w tym samym portfelu. */}
            {solana.connected && (
              <button
                type="button"
                onClick={() => {
                  solana.disconnect();
                  setIsMenuOpen(false);
                }}
                className={ROW}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- znak Solany z public/ */}
                <img src="/solana.svg" alt="" className="h-4 w-4 shrink-0 opacity-70" />
                <span className="flex-1 text-left">Disconnect Solana</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
