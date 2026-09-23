'use client';

/**
 * <Avatar /> - awatar ENS/Basename z lekkim, deterministycznym fallbackiem.
 *
 * Struktura DOM jest taka sama jak w OnchainKit (wrapper `relative` +
 * kontener z klasami uzytkownika), zeby podmiana nie ruszyla layoutu:
 * klasy typu "w-10 h-10 rounded-full mr-2" trafiaja tam, gdzie trafialy.
 */

import { useId, useMemo, type ReactNode } from 'react';
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

/**
 * Dwa odcienie wyliczone z adresu - ten sam adres zawsze daje ten sam gradient.
 *
 * Hash po znakach, a nie parseInt(hex): adresy Solany sa w base58, a
 * parseInt('G...', 16) daje NaN - okolo dwoch trzecich awatarow autorow
 * platnych odpowiedzi rysowalo sie na czarno (znalezisko z przegladu).
 */
function gradientForAddress(address: string): { from: string; to: string; id: string } {
  const key = address.toLowerCase().replace(/^0x/, '');
  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (Math.imul(h2, 33) + c) >>> 0;
  }
  const hue = h1 % 360;
  const hueShift = 30 + (h2 % 70);
  return {
    from: `hsl(${hue}, 70%, 58%)`,
    to: `hsl(${(hue + hueShift) % 360}, 72%, 42%)`,
    id: `ident-grad-${h1.toString(16).padStart(8, '0')}`,
  };
}

export function AvatarPlaceholder({ address }: { address: string }) {
  const { from, to, id: baseId } = useMemo(() => gradientForAddress(address), [address]);
  // Id gradientu musi byc unikalny na INSTANCJE, nie na adres. Ten sam autor
  // stoi czesto w dwoch miejscach DOM naraz (karta Aska w pasie `xl:hidden`
  // nad feedem i jego post pod spodem, dwie kopie Trends). url(#id) bierze
  // PIERWSZY element o tym id, a gdy lezy on w poddrzewie display:none, Chrome
  // nie maluje gradientu wcale i awatar znika.
  // useId daje ten sam wynik na serwerze i w przegladarce (brak rozjazdu
  // hydracji), ale zawiera ':' (np. ":r3:"), a to psuje url(#...) - stad
  // wyciecie wszystkiego poza [a-zA-Z0-9_-].
  const id = `${baseId}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

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
