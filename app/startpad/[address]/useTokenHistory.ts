'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAbiItem, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import {
  ACTIVE_LAUNCHPAD_NETWORK,
  erc20Abi,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  LAUNCHPAD_DEPLOY_BLOCK,
  launchpadAbi,
} from '../config';
import {
  DEAD_ADDRESS,
  POOL_MANAGER_ADDRESS,
  priceWeiAfter,
  SECONDS_PER_BLOCK,
  ZERO_ADDRESS,
  type TradeEntry,
} from './detailShared';

/**
 * Historia jednego tokena odtworzona z logow: transakcje krzywej (Bought/Sold
 * launchpada) i salda holderow (Transfer ERC-20). Oba skany ida TYMI SAMYMI
 * oknami, ktorych rozmiar bierze sie Z KONFIGURACJI SIECI.
 *
 * Do 2026-08-13 stalo tu twarde 1900 x 64 okien (limit publicznego RPC Base).
 * Na Robinhoodzie, gdzie blok trwa 0,1 s, dawalo to okolo TRZECH MINUT
 * historii - wykres i lista transakcji tokena byly tam puste, mimo ze logi
 * stoja na lancuchu. Te same wartosci co tablica rynku (patrz config.ts).
 */
const LOG_WINDOW = ACTIVE_LAUNCHPAD_NETWORK.scanWindow;

/**
 * Sufit okien. Skan i tak zwykle konczy sie wczesniej: schodzimy wstecz tylko
 * do bloku startu tokena (estymowanego ze startedAt), a zdarzenie Launched
 * urywa petle w chwili, gdy je zobaczymy - starszych logow tego tokena z
 * definicji nie ma.
 */
const MAX_LOG_WINDOWS = ACTIVE_LAUNCHPAD_NETWORK.maxScanWindows;

/**
 * Margines pod estymowany blok startu, w SEKUNDACH przeliczonych na bloki.
 *
 * Bylo 900 blokow na sztywno - na Base to ~30 minut zapasu, ale na
 * Robinhoodzie (0,1 s/blok) raptem 90 sekund, czyli za malo, zeby pokryc blad
 * estymacji. Liczymy wiec z czasu: pol godziny zapasu w kazdej sieci.
 */
const LAUNCH_BLOCK_MARGIN = BigInt(Math.ceil(1800 / SECONDS_PER_BLOCK));

const LAUNCHED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Launched' });
const BOUGHT_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Bought' });
const SOLD_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Sold' });
const LOCKED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'CurveLocked' });
const GRADUATED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Graduated' });
const TRANSFER_EVENT = getAbiItem({ abi: erc20Abi, name: 'Transfer' });

/** Ksztalt loga z watchContractEvent - dekodowany, ale traktowany ostroznie. */
export type LiveLaunchpadLog = {
  eventName?: string;
  args?: Record<string, unknown>;
  transactionHash?: `0x${string}` | null;
  logIndex?: number | null;
  blockNumber?: bigint | null;
};

export type TokenHistory = {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Rosnaco po bloku; widoki odwracaja sobie same. */
  trades: TradeEntry[];
  /** Adres (lowercase) -> saldo w wei tokena. Zawiera kontrakty i dEaD. */
  balances: Map<string, bigint>;
  graduatedTs: number | null;
  /** Skan uderzyl w sufit okien - historia na ekranie jest ucieta od dolu. */
  truncated: boolean;
};

const EMPTY: TokenHistory = {
  loading: true,
  loaded: false,
  error: null,
  trades: [],
  balances: new Map(),
  graduatedTs: null,
  truncated: false,
};

function applyBalanceDelta(balances: Map<string, bigint>, account: string, delta: bigint) {
  const key = account.toLowerCase();
  if (key === ZERO_ADDRESS) return;
  balances.set(key, (balances.get(key) ?? 0n) + delta);
}

/** Skutek transakcji dla saldo: krzywa oddaje tokeny kupujacemu i odbiera od sprzedajacego. */
function applyTradeToBalances(balances: Map<string, bigint>, trade: TradeEntry) {
  const curve = LAUNCHPAD_ADDRESS.toLowerCase();
  if (trade.kind === 'buy') {
    applyBalanceDelta(balances, trade.account, trade.tokens);
    applyBalanceDelta(balances, curve, -trade.tokens);
  } else {
    applyBalanceDelta(balances, trade.account, -trade.tokens);
    applyBalanceDelta(balances, curve, trade.tokens);
  }
}

export function useTokenHistory(tokenAddress: Address | null, startedAt: number | null) {
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });
  const [state, setState] = useState<TokenHistory>(EMPTY);

  const load = useCallback(async () => {
    if (!readClient || !tokenAddress || startedAt === null) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      // Jeden getBlock na caly skan. Czas kazdego loga liczymy z roznicy
      // numerow blokow (~2 s/blok) - pobieranie timestampu kazdego bloku
      // zamieniloby skan w setki dodatkowych requestow.
      const anchor = await readClient.getBlock({ blockTag: 'latest' });
      const anchorBlock = anchor.number;
      const anchorTs = Number(anchor.timestamp);
      const estTs = (block: bigint) =>
        Math.max(startedAt, anchorTs - Number(anchorBlock - block) * SECONDS_PER_BLOCK);

      const ageBlocks = BigInt(Math.max(0, Math.floor((anchorTs - startedAt) / SECONDS_PER_BLOCK)));
      const estLaunchBlock = anchorBlock > ageBlocks ? anchorBlock - ageBlocks : 0n;
      const floorCandidate = estLaunchBlock > LAUNCH_BLOCK_MARGIN ? estLaunchBlock - LAUNCH_BLOCK_MARGIN : 0n;
      const floor = floorCandidate > LAUNCHPAD_DEPLOY_BLOCK ? floorCandidate : LAUNCHPAD_DEPLOY_BLOCK;

      const wanted = tokenAddress.toLowerCase();
      const trades: TradeEntry[] = [];
      const balances = new Map<string, bigint>();
      let graduatedTs: number | null = null;
      let sawLaunched = false;
      let truncated = false;

      let toBlock = anchorBlock;
      for (let window = 0; window < MAX_LOG_WINDOWS && toBlock >= floor; window += 1) {
        const fromBlock = toBlock > floor + LOG_WINDOW ? toBlock - LOG_WINDOW : floor;
        const [launchpadLogs, transferLogs] = await Promise.all([
          readClient.getLogs({
            address: LAUNCHPAD_ADDRESS as Address,
            events: [LAUNCHED_EVENT, BOUGHT_EVENT, SOLD_EVENT, LOCKED_EVENT, GRADUATED_EVENT],
            fromBlock,
            toBlock,
          }),
          readClient.getLogs({ address: tokenAddress, event: TRANSFER_EVENT, fromBlock, toBlock }),
        ]);

        for (const log of transferLogs) {
          const from = log.args.from as string | undefined;
          const to = log.args.to as string | undefined;
          const value = log.args.value as bigint | undefined;
          if (value === undefined) continue;
          if (from) applyBalanceDelta(balances, from, -value);
          if (to) applyBalanceDelta(balances, to, value);
        }

        for (const log of launchpadLogs) {
          const token = log.args.token as Address | undefined;
          if (!token || token.toLowerCase() !== wanted) continue;
          const id = `${log.transactionHash ?? 'log'}-${String(log.logIndex ?? 0)}`;
          if (log.eventName === 'Launched') {
            sawLaunched = true;
          } else if (log.eventName === 'Bought' || log.eventName === 'Sold') {
            const isBuy = log.eventName === 'Bought';
            const args = log.args as Record<string, unknown>;
            const account = (isBuy ? args.buyer : args.seller) as Address | undefined;
            const eth = (isBuy ? args.ethNet : args.ethOut) as bigint | undefined;
            const tokens = (isBuy ? args.tokensOut : args.tokensIn) as bigint | undefined;
            const reserveAfter = args.ethReserveAfter as bigint | undefined;
            const tokenReserveAfter = args.tokenReserveAfter as bigint | undefined;
            if (!account || eth === undefined || tokens === undefined || reserveAfter === undefined || tokenReserveAfter === undefined) continue;
            trades.push({
              id,
              kind: isBuy ? 'buy' : 'sell',
              account,
              eth,
              tokens,
              priceWei: priceWeiAfter(reserveAfter, tokenReserveAfter),
              ethReserveAfter: reserveAfter,
              block: log.blockNumber,
              logIndex: Number(log.logIndex ?? 0),
              ts: estTs(log.blockNumber),
              txHash: log.transactionHash,
            });
          } else if (log.eventName === 'Graduated') {
            graduatedTs = estTs(log.blockNumber);
          }
        }

        if (fromBlock === floor || sawLaunched) break;
        toBlock = fromBlock - 1n;
        if (window === MAX_LOG_WINDOWS - 1 && toBlock >= floor) truncated = true;
      }

      trades.sort((a, b) =>
        a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1
      );

      setState((prev) => {
        // Zywe logi potrafia przyjsc W TRAKCIE skanu i byc nowsze niz jego
        // kotwica - nadpisanie stanu golym wynikiem skanu by je zgubilo.
        // Doklejamy wiec te, ktorych skan nie mogl widziec.
        const scanned = new Set(trades.map((trade) => trade.id));
        const keep = prev.trades.filter((trade) => !scanned.has(trade.id) && trade.block > anchorBlock);
        for (const trade of keep) applyTradeToBalances(balances, trade);
        return {
          loading: false,
          loaded: true,
          error: null,
          trades: [...trades, ...keep],
          balances,
          graduatedTs: graduatedTs ?? prev.graduatedTs,
          truncated,
        };
      });
    } catch (cause) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: cause instanceof Error ? cause.message.split('\n')[0] : String(cause),
      }));
    }
  }, [readClient, startedAt, tokenAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Doklada pojedyncze zdarzenia z watchContractEvent do stanu, ktory juz
   * jest na ekranie - bez ponownego skanu. Wolajacy MUSI podac wylacznie
   * logi tego tokena.
   */
  const applyLive = useCallback((logs: LiveLaunchpadLog[]) => {
    setState((prev) => {
      const seen = new Set(prev.trades.map((trade) => trade.id));
      const fresh: TradeEntry[] = [];
      let balances: Map<string, bigint> | null = null;
      const mutable = () => (balances ??= new Map(prev.balances));
      let graduatedTs = prev.graduatedTs;
      const now = Math.floor(Date.now() / 1000);

      for (const log of logs) {
        const name = log.eventName;
        const args = log.args ?? {};
        const id = `${log.transactionHash ?? 'live'}-${String(log.logIndex ?? 0)}`;
        if (name === 'Bought' || name === 'Sold') {
          if (seen.has(id)) continue;
          const isBuy = name === 'Bought';
          const account = (isBuy ? args.buyer : args.seller) as Address | undefined;
          const eth = (isBuy ? args.ethNet : args.ethOut) as bigint | undefined;
          const tokens = (isBuy ? args.tokensOut : args.tokensIn) as bigint | undefined;
          const reserveAfter = args.ethReserveAfter as bigint | undefined;
          const tokenReserveAfter = args.tokenReserveAfter as bigint | undefined;
          if (!account || eth === undefined || tokens === undefined || reserveAfter === undefined || tokenReserveAfter === undefined) continue;
          const entry: TradeEntry = {
            id,
            kind: isBuy ? 'buy' : 'sell',
            account,
            eth,
            tokens,
            priceWei: priceWeiAfter(reserveAfter, tokenReserveAfter),
            ethReserveAfter: reserveAfter,
            block: log.blockNumber ?? 0n,
            logIndex: Number(log.logIndex ?? 0),
            ts: now,
            txHash: log.transactionHash ?? null,
          };
          seen.add(id);
          fresh.push(entry);
          applyTradeToBalances(mutable(), entry);
        } else if (name === 'Graduated') {
          graduatedTs = graduatedTs ?? now;
          // Graduacja przenosi tokeny krzywej do puli i na adres spalenia.
          // Historycznie widzimy to w Transferach; na zywo odtwarzamy z pol
          // zdarzenia, zeby taba Holders nie klamala do nastepnego skanu.
          const toPool = args.tokensToPool as bigint | undefined;
          const toDead = args.tokensToDead as bigint | undefined;
          if (toPool !== undefined && toDead !== undefined) {
            const curve = LAUNCHPAD_ADDRESS.toLowerCase();
            applyBalanceDelta(mutable(), curve, -(toPool + toDead));
            applyBalanceDelta(mutable(), POOL_MANAGER_ADDRESS, toPool);
            applyBalanceDelta(mutable(), DEAD_ADDRESS, toDead);
          }
        }
      }

      if (fresh.length === 0 && balances === null && graduatedTs === prev.graduatedTs) return prev;
      return {
        ...prev,
        trades: fresh.length ? [...prev.trades, ...fresh] : prev.trades,
        balances: balances ?? prev.balances,
        graduatedTs,
      };
    });
  }, []);

  return { ...state, reload: load, applyLive };
}
