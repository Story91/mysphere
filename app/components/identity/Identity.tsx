'use client';

/**
 * <Identity /> - kontener ukladajacy Avatar/Name/Address.
 * Podaje adres i lancuch dzieciom przez kontekst, wiec dzieci moga byc
 * bez propsow (dokladnie jak w OnchainKit).
 */

import { useMemo, type ReactNode } from 'react';
import type { Address, Chain } from 'viem';
import { cn } from '@/lib/utils';
import { IdentityContext, type IdentityContextValue } from './IdentityContext';

export type IdentityProps = {
  address?: Address | null;
  chain?: Chain;
  className?: string;
  children?: ReactNode;
};

export function Identity({ address = null, chain, className, children }: IdentityProps) {
  const value = useMemo<IdentityContextValue>(() => ({ address, chain }), [address, chain]);

  return (
    <IdentityContext.Provider value={value}>
      <div className={cn('flex items-center gap-3', className)}>{children}</div>
    </IdentityContext.Provider>
  );
}

export default Identity;
