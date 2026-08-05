'use client';

/**
 * Kontekst tozsamosci - pozwala dzieciom (<Avatar/>, <Name/>, <Address/>)
 * dzialac bez propsow, gdy sa opakowane w <Identity address={...}>.
 */

import { createContext, useContext } from 'react';
import type { Address, Chain } from 'viem';

export type IdentityContextValue = {
  address?: Address | null;
  chain?: Chain;
};

export const IdentityContext = createContext<IdentityContextValue>({});

export function useIdentityContext(): IdentityContextValue {
  return useContext(IdentityContext);
}
