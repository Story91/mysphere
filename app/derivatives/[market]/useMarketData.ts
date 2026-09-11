'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Address } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import {
  DERIV_CHAIN,
  FACTORY_ADDRESS,
  ORACLE_ADDRESS,
  USDC_ADDRESS,
  erc20Abi,
  factoryAbi,
  feesAbi,
  insuranceAbi,
  marketAbi,
  oracleAbi,
} from '../config';
import { shortAddress } from '../format';
import { ZERO_FEED, feedByAddress, pythAbi, pythEventsAbi, pythToWad } from '../indexFeeds';
import type { ActivityItem, Position, PricePoint, R, Snapshot } from './types';

/**
 * Wszystkie ODCZYTY jednego rynku. Wyniesione z MarketDetail.tsx bez zmian
 * w zapytaniach: nadal jeden multicall na cala strone i jeden getLogs na
 * piec zdarzen, bo Arc limituje liczbe zapytan.
 *
 * Jedyna zmiana: historia feedu to `PricePoint[]` z czasem z argumentu
 * `PriceSubmitted.timestamp`, a nie sam ciag cen - wykres z osia czasu
 * i zakresami 1h/6h/24h nie ma jak dzialac na liscie bez czasu.
 */
export function useMarketData(market: Address) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      // Adresy/identyfikatory, bez ktorych nie da sie ulozyc reszty zapytan.
      // Wszystkie trzy w JEDNYM multicallu - to nadal jedna podroz do RPC.
      // Wszystkie cztery w JEDNYM multicallu - to nadal jedna podroz do RPC.
      // `CHAINLINK_FEED` jest tu, a nie w drugim multicallu, bo od niego
      // zalezy, czy do drugiego dolozyc `getPriceUnsafe` (expo feedu Pytha).
      const [idRes, insRes, feesRes, feedRes] = await client.multicall({
        contracts: [
          { address: market, abi: marketAbi, functionName: 'ORACLE_MARKET_ID' },
          { address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'INSURANCE' },
          { address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'FEES' },
          { address: market, abi: marketAbi, functionName: 'CHAINLINK_FEED' },
        ],
        allowFailure: true,
      });
      if (idRes.status !== 'success') throw new Error('This address does not answer as a derivative market.');
      const id = idRes.result as bigint;
      const insurance = insRes.status === 'success' ? (insRes.result as Address) : null;
      const feesAddress = feesRes.status === 'success' ? (feesRes.result as Address) : null;
      const indexFeed = feedRes.status === 'success' ? (feedRes.result as Address) : null;
      // Znany adapter Pytha z deployments/pythAdapters.*.json - tylko wtedy
      // wiemy, z ktorego kontraktu i pod jakim priceId szukac logow.
      const feed = indexFeed && indexFeed !== ZERO_FEED ? feedByAddress(indexFeed) : null;

      // Jeden multicall na CALA strone. Arc limituje liczbe zapytan i okno
      // getLogs, wiec dwadziescia kilka osobnych `eth_call` to prosta droga
      // do rate-limitu w chwili, gdy ktos odswiezy strone dwa razy.
      type Call = { key: string; address: Address; abi: unknown; functionName: string; args?: unknown[] };
      const marketFns = [
        'markPrice', 'indexPrice', 'quoteReserve', 'baseReserve', 'netSize', 'openInterestNotional',
        'maxOpenInterest', 'creatorOiCap', 'isMature', 'TRADE_FEE_BPS', 'LIQUIDATION_FEE_BPS',
        'FUNDING_INTERVAL', 'MAX_PREMIUM_BPS', 'lastFundingAt', 'cumFunding', 'MAX_LEVERAGE',
        'MIN_MARGIN_USDC', 'MAINTENANCE_MARGIN_BPS', 'coveredBadDebtUsdc', 'OI_MULTIPLIER_PROBATION',
        'OI_MULTIPLIER_MATURE', 'PROBATION_AGE', 'PROBATION_UPDATES', 'CREATOR_OI_CAP_BPS', 'CREATOR',
      ];
      const calls: Call[] = [
        ...marketFns.map((functionName) => ({ key: functionName, address: market, abi: marketAbi, functionName })),
        { key: 'getMarket', address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'getMarket', args: [id] },
        { key: 'marketStats', address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'marketStats', args: [id] },
        { key: 'getPrice', address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'getPrice', args: [id] },
        { key: 'getTwap', address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'getTwap', args: [id] },
        { key: 'isActive', address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'isActive', args: [id] },
        // `isMarket` mieszka na FABRYCE - i od teraz takze w `factoryAbi`.
        // `InsuranceFund` deklaruje ten podpis wylacznie po to, by ZAWOLAC go
        // na fabryce, wiec odczyt pod adresem funduszu rewertuje.
        { key: 'registered', address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'isMarket', args: [market] },
      ];
      if (insurance) {
        calls.push(
          { key: 'paused', address: insurance, abi: insuranceAbi, functionName: 'newPositionsPaused' },
          { key: 'insBalance', address: insurance, abi: insuranceAbi, functionName: 'balance' },
          { key: 'insRequired', address: insurance, abi: insuranceAbi, functionName: 'requiredBalance' },
          { key: 'insMinRatioBps', address: insurance, abi: insuranceAbi, functionName: 'minRatioBps' },
          { key: 'insTotalOi', address: insurance, abi: insuranceAbi, functionName: 'totalOi' },
          // Udzial TEGO rynku w sumie powyzej. Bez tego karta zdrowia mowila
          // wylacznie o calym module, czyli o czyms innym niz ogladany rynek.
          { key: 'insOiHere', address: insurance, abi: insuranceAbi, functionName: 'oiByMarket', args: [market] },
        );
      }
      if (feesAddress) {
        calls.push(
          { key: 'creatorShareBps', address: feesAddress, abi: feesAbi, functionName: 'CREATOR_SHARE_BPS' },
          { key: 'insuranceShareBps', address: feesAddress, abi: feesAbi, functionName: 'INSURANCE_SHARE_BPS' },
          { key: 'feeLockDays', address: feesAddress, abi: feesAbi, functionName: 'LOCK_DAYS' },
          { key: 'treasury', address: feesAddress, abi: feesAbi, functionName: 'TREASURY' },
        );
      }
      if (feed) {
        // Expo feedu - potrzebne do przeliczenia int64 z logow na 18 miejsc
        // dokladnie tak, jak robi to adapter. Bez niego historia zostaje pusta.
        calls.push({ key: 'pythPrice', address: feed.pyth, abi: pythAbi, functionName: 'getPriceUnsafe', args: [feed.priceId] });
      }
      if (address) {
        calls.push(
          { key: 'usdcBalance', address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
          { key: 'getPosition', address: market, abi: marketAbi, functionName: 'getPosition', args: [address] },
          { key: 'unrealizedPnl', address: market, abi: marketAbi, functionName: 'unrealizedPnl', args: [address] },
          { key: 'marginRatioBps', address: market, abi: marketAbi, functionName: 'marginRatioBps', args: [address] },
          { key: 'liquidationPrice', address: market, abi: marketAbi, functionName: 'liquidationPrice', args: [address] },
        );
      }

      const results = (await client.multicall({
        contracts: calls.map(({ key, ...rest }) => rest) as any,
        allowFailure: true,
      })) as readonly { status: 'success' | 'failure'; result?: unknown }[];

      const v: Record<string, unknown> = {};
      calls.forEach((c, i) => {
        v[c.key] = results[i]?.status === 'success' ? results[i].result : null;
      });
      const B = (k: string): R<bigint> => (typeof v[k] === 'bigint' ? (v[k] as bigint) : null);
      const N = (k: string): R<number> =>
        typeof v[k] === 'bigint' ? Number(v[k] as bigint) : typeof v[k] === 'number' ? (v[k] as number) : null;
      const BL = (k: string): R<boolean> => (typeof v[k] === 'boolean' ? (v[k] as boolean) : null);
      const tuple = (k: string): readonly unknown[] | null => (Array.isArray(v[k]) ? (v[k] as unknown[]) : null);

      const meta = tuple('getMarket');
      const stats = tuple('marketStats');
      const price = tuple('getPrice');

      setSnap({
        id,
        symbol: (meta?.[2] as string) || shortAddress(market),
        creator: (v.CREATOR as Address) ?? (meta?.[0] as Address) ?? null,
        insurance,
        mark: B('markPrice'),
        index: B('indexPrice'),
        quoteReserve: B('quoteReserve'),
        baseReserve: B('baseReserve'),
        netSize: B('netSize'),
        oi: B('openInterestNotional'),
        cap: B('maxOpenInterest'),
        creatorCap: B('creatorOiCap'),
        mature: BL('isMature'),
        tradeFeeBps: N('TRADE_FEE_BPS'),
        liqFeeBps: N('LIQUIDATION_FEE_BPS'),
        fundingInterval: N('FUNDING_INTERVAL'),
        maxPremiumBps: N('MAX_PREMIUM_BPS'),
        lastFundingAt: N('lastFundingAt'),
        cumFunding: B('cumFunding'),
        maxLeverage: N('MAX_LEVERAGE'),
        minMargin: B('MIN_MARGIN_USDC'),
        maintenanceBps: N('MAINTENANCE_MARGIN_BPS'),
        coveredBadDebt: B('coveredBadDebtUsdc'),
        oiMultProbation: N('OI_MULTIPLIER_PROBATION'),
        oiMultMature: N('OI_MULTIPLIER_MATURE'),
        probationAge: N('PROBATION_AGE'),
        probationUpdates: N('PROBATION_UPDATES'),
        creatorCapBps: N('CREATOR_OI_CAP_BPS'),
        bond: stats ? (stats[0] as bigint) : null,
        createdAt: stats ? Number(stats[1] as bigint) : null,
        updateCount: stats ? Number(stats[2] as number) : null,
        challenges: stats ? Number(stats[3] as number) : null,
        frozen: stats ? (stats[4] as boolean) : null,
        slashed: stats ? (stats[5] as boolean) : null,
        feedActive: BL('isActive'),
        oraclePrice: price ? (price[0] as bigint) : null,
        oracleUpdatedAt: price ? Number(price[1] as bigint) : null,
        twap: B('getTwap'),
        paused: BL('paused'),
        insBalance: B('insBalance'),
        insRequired: B('insRequired'),
        insMinRatioBps: N('insMinRatioBps'),
        insTotalOi: B('insTotalOi'),
        insOiHere: B('insOiHere'),
        registered: BL('registered'),
        usdcBalance: B('usdcBalance'),
        feesAddress,
        creatorShareBps: N('creatorShareBps'),
        insuranceShareBps: N('insuranceShareBps'),
        feeLockDays: N('feeLockDays'),
        treasury: (v.treasury as Address) ?? null,
        indexFeed,
      });

      const pos = tuple('getPosition');
      if (pos && (pos[0] as bigint) !== 0n) {
        setPosition({
          size: pos[0] as bigint,
          margin: pos[1] as bigint,
          openNotional: pos[2] as bigint,
          entryPrice: pos[3] as bigint,
          funding: pos[4] as bigint,
          pnl: B('unrealizedPnl'),
          liqPrice: B('liquidationPrice'),
          marginRatioBps: B('marginRatioBps'),
        });
      } else {
        setPosition(null);
      }

      // Historia cen z logow feedu - rejestru albo (rynek z CHAINLINK_FEED)
      // kontraktu Pytha/PythReceivera, patrz nizej.
      //
      // Blockdaemon przyjmuje okno 50k blokow na jedno `eth_getLogs`, a Arc
      // robi blok co 0,51 s - jedno okno to ok. 5,5 h. Wykres z zakresem
      // "24h" potrzebuje wiecej, wiec pytamy o CZTERY okna po 40k naraz
      // (ok. 23 h). Cztery zapytania, nie dwadziescia - rate-limit Arca liczy
      // zapytania, a nie bloki. Aktywnosc rynku (nizej) zostaje w ostatnim
      // oknie: to lista dwudziestu wpisow, nie wykres.
      const head = await client.getBlockNumber();
      const from = head > 40_000n ? head - 40_000n : 0n;
      try {
        const CHUNK = 40_000n;
        const CHUNKS = 4;
        const windows = Array.from({ length: CHUNKS }, (_, i) => {
          const to = head - CHUNK * BigInt(i);
          const lo = to > CHUNK ? to - CHUNK + 1n : 0n;
          return { fromBlock: i === 0 ? (head > CHUNK ? head - CHUNK : 0n) : lo, toBlock: i === 0 ? head : to };
        }).filter((w) => w.toBlock > 0n);
        const points: PricePoint[] = [];
        if (feed) {
          // Rynek z zewnetrznym feedem: rejestr nie dostaje dla niego
          // `PriceSubmitted`, wiec historia to `PriceFeedUpdate` z kontraktu,
          // z ktorego adapter czyta (nasz PythReceiver albo kontrakt Pytha
          // dla BTC), filtrowane po priceId. Cena w logu to int64 * 10^expo.
          const pythPrice = v.pythPrice as { expo?: number } | null;
          if (typeof pythPrice?.expo !== 'number') throw new Error('expo unknown');
          const expo = pythPrice.expo;
          const chunks = await Promise.all(
            windows.map((w) =>
              client.getContractEvents({
                address: feed.pyth,
                abi: pythEventsAbi,
                eventName: 'PriceFeedUpdate',
                args: { id: feed.priceId },
                fromBlock: w.fromBlock,
                toBlock: w.toBlock,
              }),
            ),
          );
          for (const l of chunks.flat()) {
            const a = (l as unknown as { args: { price?: bigint; publishTime?: bigint } }).args;
            if (a.price === undefined || a.publishTime === undefined || a.price <= 0n) continue;
            const wad = pythToWad(a.price, expo);
            if (wad === null) continue;
            points.push({ time: Number(a.publishTime), price: wad });
          }
        } else {
          const chunks = await Promise.all(
            windows.map((w) =>
              client.getContractEvents({
                address: ORACLE_ADDRESS,
                abi: oracleAbi,
                eventName: 'PriceSubmitted',
                args: { marketId: id },
                fromBlock: w.fromBlock,
                toBlock: w.toBlock,
              }),
            ),
          );
          for (const l of chunks.flat()) {
            const a = (l as unknown as { args: { price?: bigint; timestamp?: bigint } }).args;
            if (a.price === undefined || a.timestamp === undefined) continue;
            points.push({ time: Number(a.timestamp), price: a.price });
          }
        }
        // Zdarzenia przychodza w kolejnosci blokow, ale wykres potrzebuje
        // rosnacego czasu z argumentu - sortujemy po nim, nie po bloku.
        points.sort((x, y) => x.time - y.time);
        setHistory(points);
      } catch {
        // Brak okna getLogs na RPC nie ma prawa zabrac calej strony.
        setHistory([]);
      }

      // Historia aktywnosci - PROSTO z logow tego rynku, to samo okno co
      // sparkline. Zero liczb zmyslonych na potrzeby "wygladania jak
      // prawdziwa gielda": jak nie ma zdarzen, lista jest po prostu pusta.
      //
      // JEDNO `eth_getLogs` na wszystkie piec zdarzen, nie piec osobnych.
      // `getLogs` z tablica `events` sklada filtr topic0 jako alternatywe, a
      // Arc rate-limituje wlasnie liczbe zapytan - piec rownoleglych kolejek
      // potrafilo wrocic bledem i wyzerowac cala liste.
      try {
        const marketEvents = marketAbi.filter((entry) => entry.type === 'event');
        const logs = (await client.getLogs({
          address: market,
          events: marketEvents as never,
          fromBlock: from,
          toBlock: head,
        })) as unknown as {
          eventName: string;
          args: Record<string, unknown>;
          blockNumber: bigint | null;
          transactionHash: string | null;
        }[];

        // Znaczniki czasu pobieramy TYLKO dla tych blokow, ktore naprawde
        // wyladuja na liscie - inaczej stary rynek to setki `eth_getBlockByNumber`.
        const recent = [...logs]
          .sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)))
          .slice(0, 20);
        const blockNumbers = Array.from(new Set(recent.map((l) => l.blockNumber ?? 0n)));
        const blocks = await Promise.all(blockNumbers.map((bn) => client.getBlock({ blockNumber: bn })));
        const atByBlock = new Map(blockNumbers.map((bn, i) => [bn, Number(blocks[i].timestamp)]));

        const items: ActivityItem[] = [];
        for (const l of recent) {
          const a = l.args;
          const meta = {
            block: l.blockNumber ?? 0n,
            txHash: l.transactionHash ?? '',
            at: atByBlock.get(l.blockNumber ?? 0n) ?? 0,
          };
          if (l.eventName === 'PositionOpened') {
            items.push({
              kind: 'opened',
              trader: a.trader as Address,
              isLong: a.isLong as boolean,
              notional: a.notional as bigint,
              entryPrice: a.entryPrice as bigint,
              ...meta,
            });
          } else if (l.eventName === 'PositionClosed') {
            items.push({ kind: 'closed', trader: a.trader as Address, exitNotional: a.exitNotional as bigint, pnl: a.pnl as bigint, ...meta });
          } else if (l.eventName === 'Liquidated') {
            items.push({ kind: 'liquidated', trader: a.trader as Address, keeper: a.keeper as Address, payoutUsdc: a.payoutUsdc as bigint, ...meta });
          } else if (l.eventName === 'FundingSettled') {
            items.push({ kind: 'funding', premium: a.premium as bigint, perUnit: a.fundingPerUnit as bigint, ...meta });
          } else if (l.eventName === 'BadDebt') {
            items.push({
              kind: 'badDebt',
              trader: a.trader as Address,
              shortfallWad: a.shortfallWad as bigint,
              coveredUsdc: a.coveredUsdc as bigint,
              ...meta,
            });
          }
        }
        setActivity(items);
      } catch {
        setActivity([]);
      }
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err?.shortMessage || err?.message || "Couldn't load the market.");
    } finally {
      setLoading(false);
    }
  }, [client, market, address]);

  useEffect(() => {
    void load();
  }, [load]);

  return { snap, position, history, activity, loading, error, reload: load, address, client };
}
