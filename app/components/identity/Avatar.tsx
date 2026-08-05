'use client';

/**
 * <Avatar /> - awatar ENS/Basename z lekkim, deterministycznym fallbackiem.
 *
 * Struktura DOM jest taka sama jak w OnchainKit (wrapper `relative` +
 * kontener z klasami uzytkownika), zeby podmiana nie ruszyla layoutu:
 * klasy typu "w-10 h-10 rounded-full mr-2" trafiaja tam, gdzie trafialy.
 */

import { useMemo, type ReactNode } from 'react';
import type { Address, Chain } from 'viem';
import { cn } from '@/lib/utils';
import { useAvatar } from '@/app/utils/identity/useAvatar';
import { useName } from '@/app/utils/identity/useName';
import { useIdentityContext } from './IdentityContext';

export type AvatarProps = {
  address?: Address | null;
  chain?: Chain;
  className?: string;
  defaultComponent?: ReactNode;
  loadingComponent?: ReactNode;
  children?: ReactNode;
};

/** Dwa odcienie wyliczone z adresu - ten sam adres zawsze daje ten sam gradient. */
function gradientForAddress(address: string): { from: string; to: string; id: string } {
  const hex = address.toLowerCase().replace(/^0x/, '').padEnd(12, '0');
  const hue = parseInt(hex.slice(0, 4), 16) % 360;
  const hueShift = 30 + (parseInt(hex.slice(4, 8), 16) % 70);
  return {
    from: `hsl(${hue}, 70%, 58%)`,
    to: `hsl(${(hue + hueShift) % 360}, 72%, 42%)`,
    id: `ident-grad-${hex.slice(0, 8)}`,
  };
}

export function AvatarPlaceholder({ address }: { address: string }) {
  const { from, to, id } = useMemo(() => gradientForAddress(address), [address]);

  return (
    <svg
      viewBox="0 0 40 40"
      className="h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" fill={`url(#${id})`} />
      <circle cx="20" cy="16" r="6.5" fill="rgba(255,255,255,0.85)" />
      <path d="M8 40c0-7 5.4-11.5 12-11.5S32 33 32 40Z" fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}

export function Avatar({
  address = null,
  chain,
  className,
  defaultComponent,
  loadingComponent,
  children,
}: AvatarProps) {
  const { address: contextAddress, chain: contextChain } = useIdentityContext();
  const accountAddress = address ?? contextAddress ?? null;
  const accountChain = chain ?? contextChain;

  const { data: name, isLoading: isLoadingName } = useName({
    address: accountAddress,
    chain: accountChain,
  });

  const { data: avatar, isLoading: isLoadingAvatar } = useAvatar(
    { ensName: name ?? '', chain: accountChain },
    { enabled: !!name },
  );

  if (!accountAddress) {
    return null;
  }

  const isLoading = isLoadingName || isLoadingAvatar;

  // W trakcie ladowania rysujemy placeholder o tych samych wymiarach -
  // brak przeskoku layoutu, gdy nazwa/awatar sie dociagnie.
  const content =
    isLoading && loadingComponent ? (
      loadingComponent
    ) : !isLoading && avatar ? (
      <img
        className="min-h-full min-w-full object-cover"
        loading="lazy"
        width="100%"
        height="100%"
        decoding="async"
        src={avatar}
        alt={name ?? accountAddress}
      />
    ) : (
      (defaultComponent ?? <AvatarPlaceholder address={accountAddress} />)
    );

  return (
    <div className="relative">
      <div
        data-testid="ockAvatar_ImageContainer"
        className={cn('h-10 w-10 overflow-hidden rounded-full', className)}
      >
        {content}
      </div>
      {children}
    </div>
  );
}

export default Avatar;
