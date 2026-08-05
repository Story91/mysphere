'use client';

/**
 * useAvatar - sygnatura zgodna z OnchainKit:
 *   useAvatar({ ensName, chain }, queryOptions?) -> { data, isLoading, ... }
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Chain } from 'viem';
import { mainnet } from 'viem/chains';
import { getAvatar } from './getAvatar';
import type { IdentityQueryOptions } from './useName';

export type UseAvatarParams = {
  ensName?: string | null;
  chain?: Chain;
};

export const AVATAR_STALE_TIME = 1000 * 60 * 60;
export const AVATAR_GC_TIME = 1000 * 60 * 60 * 24;

export function useAvatar(
  { ensName, chain = mainnet }: UseAvatarParams,
  queryOptions?: IdentityQueryOptions<string | null>,
): UseQueryResult<string | null, Error> {
  return useQuery<string | null, Error, string | null, readonly unknown[]>({
    queryKey: ['useAvatar', ensName, chain.id],
    queryFn: () => getAvatar({ ensName: ensName as string, chain }),
    enabled: !!ensName,
    staleTime: AVATAR_STALE_TIME,
    gcTime: AVATAR_GC_TIME,
    refetchOnWindowFocus: false,
    retry: 1,
    ...queryOptions,
  });
}
