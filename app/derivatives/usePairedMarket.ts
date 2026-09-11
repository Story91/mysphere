'use client';

import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { DEPLOYED, DERIV_CHAIN, FACTORY_ADDRESS, factoryAbi, marketAbi } from './config';
import { ZERO_FEED } from './indexFeeds';

/**
 * KTORY RYNEK PERP CZYTA TEN FEED.
 *
 * Token sparowany z indeksem (metadane `pairedIndex.feed`) ma prowadzic do
 * rynku, ktory na tym feedzie stoi - a nie do ogolnej tablicy. Rynek nie zna
 * tokena (i nie ma znac: to dwa niezalezne kontrakty), wiec szukamy po
 * adresie feedu: `CHAINLINK_FEED` kazdego rynku z fabryki. Pierwszy trafiony
 * wygrywa; gdy zadnego nie ma, wolajacy pokazuje "zaloz rynek".
 *
 * `null` = jeszcze nie wiemy albo modul nie jest wdrozony; `''` = sprawdzone,
 * brak rynku. Rozroznienie ma znaczenie: "brak" jest przyciskiem, "nie wiem"
 * nie jest.
 */
export function usePairedMarket(feed: string | null | undefined): Address | '' | null {
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const [market, setMarket] = useState<Address | '' | null>(null);

  useEffect(() => {
    if (!client || !DEPLOYED || !feed || feed === ZERO_FEED) {
      setMarket(feed ? '' : null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const count = Number(
          await client.readContract({ address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'marketCount' }),
        );
        if (count === 0) {
          if (!cancelled) setMarket('');
          return;
        }
        type Res = { status: 'success' | 'failure'; result?: unknown };
        const addrs = (await client.multicall({
          contracts: Array.from({ length: count }, (_, i) => ({
            address: FACTORY_ADDRESS,
            abi: factoryAbi,
            functionName: 'allMarkets',
            args: [BigInt(i)],
          })) as never,
          allowFailure: true,
        })) as Res[];
        const markets = addrs
          .map((r) => (r.status === 'success' ? (r.result as Address) : null))
          .filter((a): a is Address => a != null);
        const feeds = (await client.multicall({
          contracts: markets.map((address) => ({ address, abi: marketAbi, functionName: 'CHAINLINK_FEED' })) as never,
          allowFailure: true,
        })) as Res[];
        const needle = feed.toLowerCase();
        const hit = markets.find((_, i) => {
          const r = feeds[i];
          return r.status === 'success' && String(r.result).toLowerCase() === needle;
        });
        if (!cancelled) setMarket(hit ?? '');
      } catch {
        if (!cancelled) setMarket(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, feed]);

  return market;
}
