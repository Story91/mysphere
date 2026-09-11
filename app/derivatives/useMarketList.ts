'use client';

import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { DEPLOYED, DERIV_CHAIN, FACTORY_ADDRESS, ORACLE_ADDRESS, factoryAbi, oracleAbi } from './config';
import { shortAddress } from './format';

export type MarketListItem = { id: number; address: Address; symbol: string };

const ZERO = '0x0000000000000000000000000000000000000000';

/**
 * Lekka lista rynkow (id, adres, symbol) do dropdownu w naglowku rynku.
 * Dwa multicalle: `marketOf` po wszystkich feedach, potem `getMarket` tylko
 * dla tych, ktore maja vAMM. Tablica rynkow ma swoj pelny odczyt i tego
 * hooka nie uzywa - tu chodzi o przelaczanie miedzy rynkami, nie o dane.
 */
export function useMarketList(): MarketListItem[] {
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const [items, setItems] = useState<MarketListItem[]>([]);

  useEffect(() => {
    if (!client || !DEPLOYED) return;
    let cancelled = false;
    void (async () => {
      try {
        const count = Number((await client.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'marketCount' })) as bigint);
        if (count === 0) return;
        const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
        type Res = { status: 'success' | 'failure'; result?: unknown };
        const addrs = (await client.multicall({
          contracts: ids.map((id) => ({ address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'marketOf', args: [id] })) as never,
          allowFailure: true,
        })) as readonly Res[];
        const live = ids
          .map((id, i) => ({ id: Number(id), address: (addrs[i].status === 'success' ? addrs[i].result : null) as Address | null }))
          .filter((m): m is { id: number; address: Address } => m.address != null && m.address !== ZERO);
        const metas = (await client.multicall({
          contracts: live.map((m) => ({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'getMarket', args: [BigInt(m.id)] })) as never,
          allowFailure: true,
        })) as readonly Res[];
        if (cancelled) return;
        setItems(
          live.map((m, i) => {
            const meta = metas[i].status === 'success' ? (metas[i].result as readonly unknown[]) : null;
            return { ...m, symbol: (meta?.[2] as string) || shortAddress(m.address) };
          }),
        );
      } catch {
        // Lista jest wygoda, nie danymi - bez niej dropdown pokazuje tylko biezacy rynek.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  return items;
}
