'use client';

/** <Name /> - Basename/ENS albo skrocony adres, gdy nazwy brak. */

import type { ReactNode } from 'react';
import type { Address, Chain } from 'viem';
import { cn } from '@/lib/utils';
import { getSlicedAddress } from '@/app/utils/identity/resolver';
import { useName } from '@/app/utils/identity/useName';
import { useIdentityContext } from './IdentityContext';

export type NameProps = {
  address?: Address | null;
  chain?: Chain;
  className?: string;
  children?: ReactNode;
};

export function Name({ address = null, chain, className, children }: NameProps) {
  const { address: contextAddress, chain: contextChain } = useIdentityContext();
  const accountAddress = address ?? contextAddress ?? null;
  const accountChain = chain ?? contextChain;

  const { data: name, isLoading } = useName({
    address: accountAddress,
    chain: accountChain,
  });

  if (!accountAddress) {
    return null;
  }

  // Podczas ladowania pusty span - tak samo jak robil OnchainKit
  // (zadnego migotania adresem przed pojawieniem sie nazwy).
  if (isLoading) {
    return <span className={className} />;
  }

  return (
    <div className="flex items-center gap-1">
      <span
        data-testid="ockIdentity_Text"
        className={cn('font-semibold', className)}
        aria-label={
          name
            ? `User identity: ${name}, verified name`
            : `User identity: ${accountAddress}, Ethereum address`
        }
      >
        {name || getSlicedAddress(accountAddress)}
      </span>
      {children}
    </div>
  );
}

export default Name;
