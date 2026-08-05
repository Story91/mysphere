'use client';

/**
 * useName - hook zgodny sygnatura z OnchainKit:
 *   useName({ address, chain }, queryOptions?) -> { data, isLoading, ... }
 * dzieki czemu podmiana importu w miejscu niczego nie psuje.
 */

import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import type { Address, Chain } from 'viem';
import { mainnet } from 'viem/chains';
import { getName } from './getName';

export type UseNameParams = {
  address?: Address | null;
  chain?: Chain;
};

export type IdentityQueryOptions<T> = Omit<
  Partial<UseQueryOptions<T, Error, T, readonly unknown[]>>,
  'queryKey' | 'queryFn'
>;

/** Nazwy zmieniaja sie rzadko - godzina swiezosci, doba w cache. */
export const NAME_STALE_TIME = 1000 * 60 * 60;
export const NAME_GC_TIME = 1000 * 60 * 60 * 24;

export function useName(
  { address, chain = mainnet }: UseNameParams,
  queryOptions?: IdentityQueryOptions<string | null>,
): UseQueryResult<string | null, Error> {
  return useQuery<string | null, Error, string | null, readonly unknown[]>({
    queryKey: ['useName', address, chain.id],
    queryFn: () => getName({ address: address as Address, chain }),
    enabled: !!address,
    staleTime: NAME_STALE_TIME,
    gcTime: NAME_GC_TIME,
    refetchOnWindowFocus: false,
    retry: 1,
    ...queryOptions,
  });
}
