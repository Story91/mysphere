'use client';

/**
 * <IdentityCard /> - wieksza karta: awatar + nazwa + adres.
 * API zgodne z uzyciami OnchainKit w repo: { address, chain, className }.
 */

import type { Address as ViemAddress, Chain } from 'viem';
import { cn } from '@/lib/utils';
import { Address } from './Address';
import { Avatar } from './Avatar';
import { Identity } from './Identity';
import { Name } from './Name';

export type IdentityCardProps = {
  address?: ViemAddress | null;
  chain?: Chain;
  className?: string;
};

export function IdentityCard({ address = null, chain, className }: IdentityCardProps) {
  return (
    <Identity
      address={address}
      chain={chain}
      className={cn(
        'flex min-w-[300px] items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900',
        className,
      )}
    >
      <Avatar className="h-10 w-10 rounded-full" />
      <div className="flex flex-col">
        <Name className="text-gray-900 dark:text-white" />
        <Address />
      </div>
    </Identity>
  );
}

export default IdentityCard;
