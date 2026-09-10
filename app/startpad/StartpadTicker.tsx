'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { formatEther, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import {
  ACTIVE_LAUNCHPAD_NETWORK,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  LIQUIDITY_VAULT_ADDRESS,
  launchpadAbi,
  liquidityVaultAbi,
  LIVE_WATCH,
  NATIVE_SYMBOL,
} from './config';
import { tapeAmount } from './[address]/detailShared';
import { POOL_SWAP_EVENT } from './[address]/poolSwaps';
import { useEthUsd } from './useEthUsd';
import { fetchLogos, recallLogos } from './logos';
import { loadFeedSnapshot, loadSnapshot } from './snapshot';
import { SPHERE_TOKEN_ADDRESS } from './sphere/sphereConfig';

/**
 * PASEK ZDARZEN STARTPADA - do wstawienia poza tablica (basechat).
 *
 * Zastapil widget cenowy CoinGecko. Tamten pokazywal kursy bitcoina i solany,
 * czyli rzeczy, na ktore nie mamy wplywu i o ktorych nie mamy nic do
 * powiedzenia. Tutaj leci to, co dzieje sie NA NASZYM launchpadzie: starty,
 * kupna, sprzedaze, graduacje - z linkiem prosto do tokena.
 *
 * Trzy zrodla, w tej kolejnosci:
 *   1. migawka tasmy z localStorage (ten sam origin, co tablica) - pasek ma
 *      tresc od pierwszej klatki, jesli ktos byl juz na Startpadzie;
 *   2. ostatnie swapy z puli tokena pada przez `/api/launchpad/pool-swaps`
 *      (odpowiedz z cache'u brzegowego) - zeby pasek nie byl pusty takze dla
 *      kogos, kto trafil tu pierwszy raz;
 *   3. subskrypcja na zywo: zdarzenia launchpada I swapy w puli.
 *
 * Punkt trzeci ma osobny watcher na PoolManagerze, bo launchpad milknie przy
 * graduacji - bez tego token, ktoremu sie udalo, znikalby z paska na zawsze.
 */

type TickerItem = {
  id: string;
  address?: string;
  symbol: string;
  label: string;
  eth?: number;
  tone: 'launch' | 'buy' | 'sell' | 'graduate';
};

const MAX_ITEMS = 20;

/**
 * Ile trwa jedno okrazenie tasmy. Wspolna klasa `.soft-marquee` ma 32 s, co
 * przy kursach bylo w porzadku, ale tutaj wiersze niosa kwote i symbol - trzeba
 * zdazyc je przeczytac, zanim znikna. 90 s czyta sie spokojnie i nie odciaga
 * uwagi od tresci strony.
 */
const LAP_SECONDS = 90;

function shortAddress(value: string) {
  return `${value.slice(0, 5)}…${value.slice(-3)}`;
}

const TONE_CLASS: Record<TickerItem['tone'], string> = {
  buy: 'text-emerald-600',
  sell: 'text-rose-600',
  launch: 'text-violet-600',
  graduate: 'text-emerald-700',
};

export default function StartpadTicker() {
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });
  const chainId = ACTIVE_LAUNCHPAD_NETWORK.chain.id;
  // Kurs ETH/USD z tego samego zrodla, co tablica - pasek ma pokazywac
  // dolary, a nie ulamki ETH, ktore nikomu nic nie mowia. Gdy kursu jeszcze
  // nie ma, `tapeAmount` sam wraca do jednostki natywnej.
  const { usd: ethUsd } = useEthUsd();
  const [items, setItems] = useState<TickerItem[]>([]);
  const [poolId, setPoolId] = useState<`0x${string}` | null>(null);
  const seeded = useRef(false);
  // Logo tokenow z tego samego zrodla, co tablica (Vercel Blob przez
  // /api/startpad/logos). Najpierw pamiec podreczna, zeby awatary byly od
  // pierwszej klatki, potem swieza mapa.
  const [logos, setLogos] = useState<Record<string, string>>(() => recallLogos(ACTIVE_LAUNCHPAD_NETWORK.chain.id));

  useEffect(() => {
    let cancelled = false;
    void fetchLogos(chainId)
      .then((map) => {
        if (!cancelled && Object.keys(map).length) setLogos((current) => ({ ...current, ...map }));
      })
      .catch(() => {
        // Brak logo nie jest bledem - zostaje kolorowa kropka z inicjalem.
      });
    return () => {
      cancelled = true;
    };
  }, [chainId]);

  /** Adres -> symbol z migawki tablicy; bez niej zostaje skrocony adres. */
  const symbols = useMemo(() => {
    const map = new Map<string, string>();
    const rows = loadSnapshot<{ address?: string; symbol?: string }>(chainId);
    for (const row of rows ?? []) {
      if (row?.address && row?.symbol) map.set(row.address.toLowerCase(), row.symbol);
    }
    if (SPHERE_TOKEN_ADDRESS) map.set(SPHERE_TOKEN_ADDRESS.toLowerCase(), 'SPHERE');
    return map;
  }, [chainId]);

  const nameOf = (token: string) => symbols.get(token.toLowerCase()) ?? shortAddress(token);

  const push = (fresh: TickerItem[]) => {
    if (fresh.length === 0) return;
    setItems((current) => {
      const seen = new Set(current.map((item) => item.id));
      const unique = fresh.filter((item) => !seen.has(item.id));
      if (unique.length === 0) return current;
      return [...unique, ...current].slice(0, MAX_ITEMS);
    });
  };

  // 1. Migawka tasmy z tablicy - natychmiastowa tresc dla powracajacych.
  useEffect(() => {
    const cached = loadFeedSnapshot<TickerItem>(chainId);
    if (cached?.length) setItems(cached.slice(0, MAX_ITEMS));
  }, [chainId]);

  // 2. poolId tokena pada - potrzebny i do zasiewu, i do subskrypcji.
  useEffect(() => {
    if (!readClient || !SPHERE_TOKEN_ADDRESS || !LIQUIDITY_VAULT_ADDRESS) return;
    let cancelled = false;
    void (async () => {
      try {
        const position = (await readClient.readContract({
          address: LIQUIDITY_VAULT_ADDRESS as Address,
          abi: liquidityVaultAbi,
          functionName: 'positionOf',
          args: [SPHERE_TOKEN_ADDRESS],
        })) as readonly [`0x${string}`, bigint, number, number];
        if (!cancelled && /^0x[0-9a-fA-F]{64}$/.test(position[0]) && !/^0x0+$/.test(position[0])) {
          setPoolId(position[0]);
        }
      } catch {
        // Bez puli pasek dziala dalej, tyle ze wylacznie na zdarzeniach krzywej.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readClient]);

  // 3. Zasiew z ostatnich swapow puli - zeby pasek nie byl pusty u nowego gosca.
  useEffect(() => {
    if (!poolId || seeded.current) return;
    seeded.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const query = new URLSearchParams({
          chainId: String(chainId),
          poolId,
          decimals: '18',
          // Ostatnia doba Base wystarcza na pasek i schodzi jednym oknem.
          fromBlock: '0',
        });
        const response = await fetch(`/api/launchpad/pool-swaps?${query.toString()}`, {
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) return;
        const data = (await response.json()) as { swaps?: string[] };
        const rows = Array.isArray(data.swaps) ? data.swaps.slice(-MAX_ITEMS) : [];
        if (cancelled || rows.length === 0) return;
        const token = SPHERE_TOKEN_ADDRESS as string;
        push(
          rows
            .reverse()
            .map((row): TickerItem | null => {
              // Kodowanie wierszy jest wspolne z historia krzywej: kind|account|eth|...
              const parts = row.split('|');
              if (parts.length < 10) return null;
              const isBuy = parts[0] === 'b';
              return {
                id: `${parts[9]}-swap-${parts[7]}`,
                address: token,
                symbol: nameOf(token),
                label: isBuy ? 'Pool buy' : 'Pool sell',
                eth: Number(formatEther(BigInt(parts[2]))),
                tone: isBuy ? ('buy' as const) : ('sell' as const),
              };
            })
            .filter((item): item is TickerItem => item !== null)
        );
      } catch {
        // Zasiew jest wygoda, nie warunkiem - subskrypcja nizej i tak dziala.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, chainId]);

  // 4a. Na zywo: zdarzenia launchpada (krzywa).
  useEffect(() => {
    if (!readClient) return;
    const unwatch = readClient.watchContractEvent({
      address: LAUNCHPAD_ADDRESS as Address,
      abi: launchpadAbi,
      poll: LIVE_WATCH.poll,
      pollingInterval: LIVE_WATCH.pollingInterval,
      onError: () => {},
      onLogs: (logs) => {
        const fresh: TickerItem[] = [];
        for (const log of logs) {
          const decoded = log as unknown as {
            eventName?: string;
            args?: Record<string, unknown>;
            transactionHash?: string;
            logIndex?: number;
          };
          const token = decoded.args?.token as string | undefined;
          const event = decoded.eventName;
          if (!token || !event) continue;
          const id = `${decoded.transactionHash ?? ''}-${event}-${String(decoded.logIndex ?? 0)}`;
          if (event === 'Launched') {
            fresh.push({ id, address: token, symbol: (decoded.args?.symbol as string) ?? nameOf(token), label: 'Launched', tone: 'launch' });
          } else if (event === 'Graduated') {
            fresh.push({ id, address: token, symbol: nameOf(token), label: 'Graduated', tone: 'graduate' });
          } else if (event === 'Bought' || event === 'Sold') {
            const isBuy = event === 'Bought';
            const eth = (isBuy ? decoded.args?.ethNet : decoded.args?.ethOut) as bigint | undefined;
            fresh.push({
              id,
              address: token,
              symbol: nameOf(token),
              label: isBuy ? 'Buy' : 'Sell',
              eth: eth === undefined ? undefined : Number(formatEther(eth)),
              tone: isBuy ? 'buy' : 'sell',
            });
          }
        }
        push(fresh);
      },
    });
    return () => unwatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readClient]);

  // 4b. Na zywo: swapy w puli tokena pada (po graduacji krzywa juz milczy).
  useEffect(() => {
    if (!readClient || !poolId || !SPHERE_TOKEN_ADDRESS) return;
    const token = SPHERE_TOKEN_ADDRESS as string;
    const unwatch = readClient.watchEvent({
      address: ACTIVE_LAUNCHPAD_NETWORK.poolManager,
      event: POOL_SWAP_EVENT,
      args: { id: poolId },
      poll: LIVE_WATCH.poll,
      pollingInterval: LIVE_WATCH.pollingInterval,
      onError: () => {},
      onLogs: (logs) => {
        const fresh: TickerItem[] = [];
        for (const log of logs) {
          const args = (log as unknown as { args?: Record<string, unknown> }).args ?? {};
          const amount0 = args.amount0 as bigint | undefined;
          if (amount0 === undefined) continue;
          // amount0 < 0 = swapujacy zaplacil ETH, czyli KUPIL token.
          const isBuy = amount0 < 0n;
          fresh.push({
            id: `${(log as unknown as { transactionHash?: string }).transactionHash ?? ''}-swap-${String((log as unknown as { logIndex?: number }).logIndex ?? 0)}`,
            address: token,
            symbol: nameOf(token),
            label: isBuy ? 'Pool buy' : 'Pool sell',
            eth: Number(formatEther(amount0 < 0n ? -amount0 : amount0)),
            tone: isBuy ? 'buy' : 'sell',
          });
        }
        push(fresh);
      },
    });
    return () => unwatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readClient, poolId]);

  // Tasma jedzie w kolko, wiec tresc jest zdublowana - druga kopia wjezdza
  // dokladnie wtedy, gdy pierwsza schodzi z ekranu. Sama animacja siedzi
  // w globals.css jako `.soft-marquee`: przesuwa o -50%, wiec petla nie ma
  // szwu, i znika sama przy `prefers-reduced-motion`.
  const lane = items.length ? [...items, ...items] : [];

  return (
    <div className="w-full overflow-hidden border-b border-soft-line bg-soft-surface py-1.5">
      {lane.length === 0 ? (
        <p className="px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-sp-shade/40">
          Watching Startpad for live trades...
        </p>
      ) : (
        <div
          className="soft-marquee flex w-max items-center gap-5 whitespace-nowrap px-3"
          style={{ animationDuration: `${LAP_SECONDS}s` }}
        >
          {lane.map((item, index) => (
            <Link
              key={`${item.id}-${index}`}
              href={item.address ? `/startpad/${item.address}` : '/startpad'}
              className="flex items-center gap-1.5 text-[11.5px] font-bold text-sp-ink/70 hover:text-sp-ink"
            >
              {(() => {
                const url = item.address ? logos[item.address.toLowerCase()] : undefined;
                return url ? (
                  // Zwykly <img>, nie next/image: to 16 px z Bloba, wiec optymalizator
                  // nie ma czego zoptymalizowac, a wymagalby wpisania hosta w konfig.
                  // Tak samo robi tablica.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" width={16} height={16} className="h-4 w-4 shrink-0 rounded-full object-cover" loading="lazy" />
                ) : (
                  // Zastepnik zamiast pustego miejsca - pasek nie ma podskakiwac,
                  // gdy token nie ma jeszcze wgranego logo.
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sp-shade/15 text-[8px] font-extrabold text-sp-shade/60">
                    {item.symbol.slice(0, 1).toUpperCase()}
                  </span>
                );
              })()}
              <span className="font-extrabold">{item.symbol}</span>
              <span className={TONE_CLASS[item.tone]}>{item.label}</span>
              {item.eth !== undefined && (
                <span className="text-sp-shade/50">{tapeAmount(item.eth, ethUsd, NATIVE_SYMBOL)}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
