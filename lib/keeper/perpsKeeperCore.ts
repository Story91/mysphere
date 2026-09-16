import { Contract, ZeroAddress, formatUnits, parseEther, type Provider, type Signer } from "ethers";

/**
 * RDZEN KEEPERA PERPOW - czysty ethers, bez hardhata, bez fs, bez process.env.
 *
 * ===========================================================================
 * PO CO OSOBNY MODUL
 * ===========================================================================
 * Do 16.09.2026 keeper zyl wylacznie w scripts/derivatives/keeper.ts, czyli
 * w skrypcie hardhata odpalanym z Harmonogramu zadan na laptopie wlasciciela.
 * Dwa razy stanal po cichu: raz przez zepsute cudzyslowy w zadaniu, raz przez
 * 12 godzin bez gazu (47 przebiegow "GAZ NISKI") - i przez ten czas wszystkie
 * trzy rynki na testnecie byly "halted", bo rejestr cen wymaga heartbeatu co
 * godzine (MAX_PRICE_AGE), a bez niego `openPosition` rewertuje OracleInactive.
 *
 * Ten modul dostaje provider, signer i konfiguracje JAKO ARGUMENTY, wiec ten
 * sam kod odpala sie z:
 *   - hardhata (scripts/derivatives/keeper.ts - reczny bieg, dry-run, CLI),
 *   - trasy Next `app/api/keeper/perps` uruchamianej cronem Vercela albo
 *     dowolnym zewnetrznym cronem z sekretem - bez laptopa i bez Harmonogramu.
 *
 * ===========================================================================
 * CO ROBI JEDEN PRZEBIEG (kolejnosc ma znaczenie)
 * ===========================================================================
 * 1. FUNDING: `settleFunding` na rynkach, ktorym minal FUNDING_INTERVAL.
 * 2. LIKWIDACJE: adresy z logow `PositionOpened` (okno `scanBlocks` wstecz od
 *    glowy, nie od bloku wdrozenia - publiczne RPC tna stara historie),
 *    `marginRatioBps < MAINTENANCE_MARGIN_BPS` -> `liquidate`.
 * 3. PYTH: dla kazdego adaptera wiek ceny w zrodle; powyzej `pushAfter`
 *    pobiera podpisana aktualizacje z Hermesa i wola `updatePriceFeeds`.
 *    Bez klucza Hermesa tylko raportuje.
 * 4. HEARTBEAT REJESTRU: `submitPrice` dla rynkow, ktorych cena w rejestrze
 *    ma wiecej niz `heartbeatAfter` sekund. Cena z adaptera, gdy swieza;
 *    inaczej ostatnia cena rejestru (czysty heartbeat). Skok przycinany do
 *    MAX_DEVIATION_BPS. Wysylac moze tylko wystawca lub tworca feedu.
 *
 * Gaz na Arc to USDC (18 miejsc natywnie). `gasLow` w wyniku = saldo ponizej
 * progu; wywolujacy decyduje, jak alarmowac (toast, log, HTTP 200 z flaga).
 */

export const ARC_CHAIN_IDS = new Set([5042002, 5042]);
export const NETWORK_LABEL: Record<number, string> = { 5042002: "arc-testnet", 5042: "arc-mainnet" };

const FACTORY_ABI = [
  "function marketCount() view returns (uint256)",
  "function allMarkets(uint256) view returns (address)",
];
const MARKET_ABI = [
  "function FUNDING_INTERVAL() view returns (uint32)",
  "function MAINTENANCE_MARGIN_BPS() view returns (uint16)",
  "function lastFundingAt() view returns (uint64)",
  "function getPosition(address) view returns (int256 size,uint256 margin,uint256 openNotional,uint256 entryPrice,int256 funding)",
  "function marginRatioBps(address) view returns (int256)",
  "function settleFunding() external",
  "function liquidate(address) external returns (uint256)",
  "function ORACLE() view returns (address)",
  "function ORACLE_MARKET_ID() view returns (uint256)",
  "function CHAINLINK_FEED() view returns (address)",
  "event PositionOpened(address indexed trader,bool isLong,uint256 marginUsdc,uint256 notional,uint256 size,uint256 entryPrice)",
];
const REGISTRY_ABI = [
  "function getMarket(uint256) view returns (address creator,address publisher,string symbol,uint256 price,uint64 updatedAt,uint256 bond,bool slashed)",
  "function MAX_PRICE_AGE() view returns (uint32)",
  "function MAX_DEVIATION_BPS() view returns (uint16)",
  "function MIN_UPDATE_INTERVAL() view returns (uint32)",
  "function submitPrice(uint256 marketId,uint256 price,uint64 observedAt) external",
];
const FEED_ABI = [
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function decimals() view returns (uint8)",
];
const PYTH_ABI = [
  "function getPriceUnsafe(bytes32) view returns (tuple(int64 price,uint64 conf,int32 expo,uint256 publishTime))",
  "function getUpdateFee(bytes[]) view returns (uint256)",
  "function updatePriceFeeds(bytes[]) payable",
];

export type Row = Record<string, string | number | boolean>;

export type AdapterEntry = { address: string; priceId: string; maxAge: number; pyth?: string };
export type PythAdaptersFile = { pyth?: string; adapters?: Record<string, AdapterEntry> };
export type DeploymentFile = { factory?: string; deployBlock?: number };

export type KeeperOptions = {
  provider: Provider;
  signer: Signer;
  chainId: number;
  /** false = dry-run: same odczyty, zero transakcji. */
  execute: boolean;
  deployment: DeploymentFile;
  pythAdapters: PythAdaptersFile;
  /** Nadpisanie adresu fabryki (np. z env). */
  factoryAddress?: string;
  /** Ile blokow wstecz od glowy skanowac PositionOpened. Domyslnie 200 000. */
  scanBlocks?: number;
  /** Okno jednego eth_getLogs. Blockdaemon 50 000, oficjalny mainnet <10 000. */
  logWindow?: number;
  pythApiKey?: string;
  hermesUrl?: string;
  /** Po ilu sekundach wieku ceny Pytha wypychac. Domyslnie 600. */
  pushAfter?: number;
  /** Po ilu sekundach wieku ceny w rejestrze wysylac heartbeat. Domyslnie 2400. */
  heartbeatAfter?: number;
  /** Prog alarmu gazu w USDC (jako string, np. "1"). Domyslnie "1". */
  gasAlertUsdc?: string;
};

export type KeeperReport = {
  network: string;
  factory: string;
  keeper: string;
  gasUsdc: string;
  gasLow: boolean;
  latestBlock: number;
  execute: boolean;
  markets: Row[];
  pyth: Row[];
  registry: Row[];
};

export function firstLine(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0] : String(error);
}

/** Podpisana aktualizacja z Hermesa jako tablica bytes dla updatePriceFeeds. */
export async function fetchHermesUpdate(base: string, apiKey: string, priceIds: string[]): Promise<string[]> {
  const params = priceIds.map((id) => `ids[]=${id}`).join("&");
  const res = await fetch(`${base}/v2/updates/price/latest?${params}&encoding=hex`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Hermes ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const json = (await res.json()) as { binary?: { data?: string[] } };
  const data = json.binary?.data ?? [];
  if (!data.length) throw new Error("Hermes oddal pusta aktualizacje.");
  return data.map((hex) => (hex.startsWith("0x") ? hex : `0x${hex}`));
}

export async function runPerpsKeeper(opts: KeeperOptions): Promise<KeeperReport> {
  const { provider, signer, chainId, execute } = opts;
  if (!ARC_CHAIN_IDS.has(chainId)) throw new Error(`Oczekiwalem Arc (5042002 albo 5042), dostalem ${chainId}.`);
  const factoryAddress = opts.factoryAddress || opts.deployment.factory;
  if (!factoryAddress || /^0x0+$/.test(factoryAddress)) {
    throw new Error(`Brak adresu fabryki dla chainId ${chainId} (deployments/derivativeMarket.${chainId}.json).`);
  }
  const logWindow = opts.logWindow ?? (chainId === 5042 ? 9_000 : 50_000);
  const scanBlocks = opts.scanBlocks ?? 200_000;
  const pushAfter = opts.pushAfter ?? 600;
  const heartbeatAfter = opts.heartbeatAfter ?? 2400;
  const hermesUrl = opts.hermesUrl || "https://hermes.pyth.network";
  const gasAlert = parseEther(opts.gasAlertUsdc || "1");

  const keeperAddress = await signer.getAddress();
  const gasBalance = await provider.getBalance(keeperAddress);
  const gasUsdc = formatUnits(gasBalance, 18);

  const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
  const count = Number(await factory.marketCount());
  const latest = await provider.getBlockNumber();
  const now = (await provider.getBlock(latest))!.timestamp;
  // Skan od max(deployBlock, glowa - scanBlocks): publiczne RPC tna stara
  // historie ("pruned history unavailable"), a pozycje starsze niz kilka dni
  // i tak sa juz zamkniete albo zlikwidowane w poprzednich przebiegach.
  const deployBlock = Number(opts.deployment.deployBlock || 0);
  const fromBlock = Math.max(deployBlock, latest - scanBlocks, 0);

  const markets: Row[] = [];
  const marketAddresses: string[] = [];
  for (let i = 0; i < count; i++) marketAddresses.push(await factory.allMarkets(i));

  for (const marketAddress of marketAddresses) {
    const market = new Contract(marketAddress, MARKET_ABI, provider);
    const row: Row = { market: marketAddress };
    try {
      const [interval, mmBps, lastFundingAt] = await Promise.all([
        market.FUNDING_INTERVAL(),
        market.MAINTENANCE_MARGIN_BPS(),
        market.lastFundingAt(),
      ]);
      const dueAt = Number(lastFundingAt) + Number(interval);
      row.fundingDueInSec = dueAt - now;
      if (now >= dueAt) {
        row.fundingDue = true;
        if (execute) {
          try {
            const tx = await market.connect(signer).getFunction("settleFunding")();
            await tx.wait();
            row.settleTx = tx.hash;
          } catch (error) {
            row.settleError = firstLine(error);
          }
        }
      }

      const topic = market.interface.getEvent("PositionOpened")!.topicHash;
      const traders = new Set<string>();
      let scanError: string | null = null;
      for (let from = fromBlock; from <= latest; from += logWindow) {
        const to = Math.min(latest, from + logWindow - 1);
        try {
          const logs = await provider.getLogs({ address: marketAddress, topics: [topic], fromBlock: from, toBlock: to });
          for (const log of logs) {
            const parsed = market.interface.parseLog(log);
            if (parsed) traders.add(parsed.args.trader);
          }
        } catch (error) {
          // Jedno przyciete okno nie ma prawa zatrzymac reszty skanu.
          scanError = firstLine(error);
        }
      }
      if (scanError) row.scanError = scanError;

      let open = 0;
      let liquidatable = 0;
      const liquidations: string[] = [];
      for (const trader of traders) {
        const pos = await market.getPosition(trader);
        if (pos.size === 0n) continue;
        open++;
        const ratio: bigint = await market.marginRatioBps(trader);
        if (ratio >= BigInt(mmBps)) continue;
        liquidatable++;
        if (!execute) {
          liquidations.push(`${trader} ratio=${ratio}bps (dry-run)`);
          continue;
        }
        try {
          const tx = await market.connect(signer).getFunction("liquidate")(trader);
          const receipt = await tx.wait();
          liquidations.push(`${trader} tx=${tx.hash} block=${receipt?.blockNumber}`);
        } catch (error) {
          liquidations.push(`${trader} error=${firstLine(error)}`);
        }
      }
      row.tradersSeen = traders.size;
      row.openPositions = open;
      row.liquidatable = liquidatable;
      if (liquidations.length) row.liquidations = liquidations.join(" | ");
    } catch (error) {
      row.error = firstLine(error);
    }
    markets.push(row);
  }

  // ---- PYTH ----
  const pyth: Row[] = [];
  const adapters = opts.pythAdapters.adapters ?? {};
  if (opts.pythAdapters.pyth && !/^0x0+$/.test(opts.pythAdapters.pyth)) {
    for (const [symbol, entry] of Object.entries(adapters)) {
      const source = entry.pyth ?? opts.pythAdapters.pyth;
      const pythContract = new Contract(source, PYTH_ABI, provider);
      const row: Row = { symbol, adapter: entry.address, source };
      try {
        const p = await pythContract.getPriceUnsafe(entry.priceId);
        const age = now - Number(p.publishTime);
        row.ageSec = age;
        row.stale = age > entry.maxAge;
        if (age <= pushAfter) {
          pyth.push(row);
          continue;
        }
        if (!opts.pythApiKey) {
          row.pushSkipped = "brak klucza Hermesa - tylko raport";
        } else if (!execute) {
          row.pushSkipped = "dry-run";
        } else {
          const update = await fetchHermesUpdate(hermesUrl, opts.pythApiKey, [entry.priceId]);
          const fee: bigint = await pythContract.getUpdateFee(update);
          const tx = await pythContract.connect(signer).getFunction("updatePriceFeeds")(update, { value: fee });
          await tx.wait();
          row.pushTx = tx.hash;
          row.feeUsdc = formatUnits(fee, 18);
        }
      } catch (error) {
        // 0x2acbe915 = InvalidWormholeVaa: kontrakt Pytha na Arc (1.4.5-alpha.1)
        // nie przyjmuje podpisow Hermesa po upgrade 26.08.2026. Nasz PythReceiver
        // przyjmuje; ten blad zdarza sie wylacznie dla adapterow na kontrakcie Pytha.
        const data = (error as { data?: string }).data;
        row.error =
          data === "0x2acbe915"
            ? "InvalidWormholeVaa: kontrakt Pytha na Arc nie przyjmuje podpisow Hermesa po upgrade 08.2026"
            : firstLine(error);
      }
      pyth.push(row);
    }
  }

  // ---- HEARTBEAT REJESTRU ----
  const registry: Row[] = [];
  for (const marketAddress of marketAddresses) {
    const market = new Contract(marketAddress, MARKET_ABI, provider);
    const row: Row = { market: marketAddress };
    try {
      const [oracleAddress, marketId, feedAddress] = await Promise.all([
        market.ORACLE(),
        market.ORACLE_MARKET_ID(),
        market.CHAINLINK_FEED(),
      ]);
      const oracle = new Contract(oracleAddress, REGISTRY_ABI, provider);
      const [m, maxAge, maxDevBps, minInterval] = await Promise.all([
        oracle.getMarket(marketId),
        oracle.MAX_PRICE_AGE(),
        oracle.MAX_DEVIATION_BPS(),
        oracle.MIN_UPDATE_INTERVAL(),
      ]);
      const age = now - Number(m.updatedAt);
      row.symbol = m.symbol;
      row.ageSec = age;
      row.active = !m.slashed && age <= Number(maxAge);
      if (m.slashed) {
        row.skipped = "feed ukarany (slashed) - submitPrice rewertuje";
        registry.push(row);
        continue;
      }
      if (age < heartbeatAfter) {
        registry.push(row);
        continue;
      }
      if (age < Number(minInterval)) {
        row.skipped = "MIN_UPDATE_INTERVAL";
        registry.push(row);
        continue;
      }
      const me = keeperAddress.toLowerCase();
      if (me !== String(m.publisher).toLowerCase() && me !== String(m.creator).toLowerCase()) {
        row.skipped = `keeper ${keeperAddress} nie jest wystawca ani tworca (publisher ${m.publisher})`;
        registry.push(row);
        continue;
      }

      const prev: bigint = m.price;
      let price = prev;
      let source = "registry (heartbeat, ta sama cena)";
      if (feedAddress !== ZeroAddress) {
        try {
          const feed = new Contract(feedAddress, FEED_ABI, provider);
          const [, answer, , updatedAt] = await feed.latestRoundData();
          const decimals = Number(await feed.decimals());
          if (answer > 0n && now - Number(updatedAt) <= Number(maxAge)) {
            price = decimals === 18 ? answer : decimals < 18 ? answer * 10n ** BigInt(18 - decimals) : answer / 10n ** BigInt(decimals - 18);
            source = `adapter ${feedAddress}`;
          } else {
            source = `registry (adapter ${feedAddress} oddal ${answer > 0n ? "stara" : "zerowa"} cene)`;
          }
        } catch (error) {
          source = `registry (adapter nie odpowiada: ${firstLine(error)})`;
        }
      }
      if (prev > 0n) {
        const cap = (prev * BigInt(maxDevBps)) / 10_000n;
        if (price > prev + cap) {
          price = prev + cap;
          source += " (przyciete do +MAX_DEVIATION_BPS)";
        } else if (price + cap < prev) {
          price = prev - cap;
          source += " (przyciete do -MAX_DEVIATION_BPS)";
        }
      }
      row.source = source;
      row.price = formatUnits(price, 18);
      if (!execute) {
        row.skipped = "dry-run";
        registry.push(row);
        continue;
      }
      try {
        const tx = await oracle.connect(signer).getFunction("submitPrice")(marketId, price, BigInt(now));
        await tx.wait();
        row.submitTx = tx.hash;
      } catch (error) {
        row.submitError = firstLine(error);
      }
    } catch (error) {
      row.error = firstLine(error);
    }
    registry.push(row);
  }

  return {
    network: NETWORK_LABEL[chainId],
    factory: factoryAddress,
    keeper: keeperAddress,
    gasUsdc,
    gasLow: gasBalance < gasAlert,
    latestBlock: latest,
    execute,
    markets,
    pyth,
    registry,
  };
}
