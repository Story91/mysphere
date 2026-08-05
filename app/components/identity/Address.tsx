'use client';

/** <Address /> - skrocony (domyslnie) adres portfela. */

import type { Address as ViemAddress } from 'viem';
import { cn } from '@/lib/utils';
import { getSlicedAddress } from '@/app/utils/identity/resolver';
import { useIdentityContext } from './IdentityContext';

export type AddressProps = {
  address?: ViemAddress | null;
  className?: string;
  isSliced?: boolean;
};

export function Address({ address = null, className, isSliced = true }: AddressProps) {
  const { address: contextAddress } = useIdentityContext();
  const accountAddress = address ?? contextAddress ?? null;

  if (!accountAddress) {
    return null;
  }

  return (
    <span data-testid="ockAddress" className={cn('text-sm text-gray-500', className)}>
      {isSliced ? getSlicedAddress(accountAddress) : accountAddress}
    </span>
  );
}

export default Address;
