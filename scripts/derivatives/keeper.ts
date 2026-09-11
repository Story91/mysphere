import { ethers, network } from "hardhat";
import { formatUnits } from "ethers";
import fs from "fs";
import path from "path";

/**
 * KEEPER PERPOW NA ARC TESTNET - funding i likwidacje, ktorych nikt nie klika.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * `DerivativeMarket.settleFunding()` i `liquidate(trader)` sa publiczne, ale
 * do 11 wrzesnia 2026 wolal je wylacznie przycisk w przegladarce. Pozycja pod
 * woda zyla tak dlugo, az ktos wszedl na strone rynku - a zly dlug z takiej
 * pozycji pokrywa fundusz ubezpieczeniowy, czyli wszyscy. Arc ma bloki co
 * sekunde i finalnosc natychmiastowa (docs "deterministic finality"), wiec
 * keeper jest tani: jeden przebieg to kilka odczytow i zero albo kilka
 * transakcji po ~0,001 USD (docs "stable fee").
 *
 * ===========================================================================
 * CO ROBI W JEDNYM PRZEBIEGU
 * ===========================================================================
 * 1. Bierze liste rynkow z fabryki (`allMarkets`).
 * 2. Dla kazdego rynku: jesli minal FUNDING_INTERVAL od `lastFundingAt`,
 *    wola `settleFunding`. Kontrakt sam przycina dluga przerwe do doby.
 * 3. Zbiera adresy z logow `PositionOpened` (okno 50 000 blokow - tyle daje
 *    Blockdaemon, patrz hardhat.config), sprawdza `getPosition().size != 0`
 *    i `marginRatioBps < MAINTENANCE_MARGIN_BPS`, i takie likwiduje.
 *    Nagroda keepera wraca na portfel podpisujacy.
 * 4. PYTH. Dla kazdego adaptera z deployments/pythAdapters.<chainId>.json
 *    czyta wiek ceny na lancuchu. Pyth to oracle PULL - jesli nikt nie
 *    wypchnie aktualizacji, adapter po MAX_AGE oddaje 0 i rynek spada na
 *    TWAP rejestru. Gdy cena ma wiecej niz PYTH_PUSH_AFTER sekund, keeper
 *    pobiera podpisana aktualizacje z Hermesa i wola updatePriceFeeds,
 *    placac getUpdateFee w USDC. Hermes od 08.2026 wymaga klucza
 *    (PYTH_API_KEY); bez niego ten krok TYLKO raportuje wiek.
 * 5. Drukuje raport JSON i, gdy saldo gazu spadnie ponizej progu, linie
 *    "GAZ NISKI" - keeper.ps1 zamienia ja w powiadomienie Windows.
 *
 * DOMYSLNIE DRY-RUN. Transakcje ida dopiero z KEEPER_CONFIRM=tak.
 *
 * ===========================================================================
 * GAZ TO USDC. TEN SAM, KTORY JEST KOLATERALEM.
 * ===========================================================================
 * Na Arc natywna jednostka to USDC z 18 miejscami, a ERC-20 pod 0x3600... to
 * to samo saldo z 6 miejscami (docs "EVM differences"). Prog alarmu jest
 * wiec w USDC, nie w ETH, i czyta sie go z `getBalance` (18 miejsc).
 *
 * UZYCIE
 *   npm run perps:keeper                       (dry-run)
 *   KEEPER_CONFIRM=tak npm run perps:keeper    (na zywo)
 *
 * Zmienne:
 *   DERIV_FACTORY   adres fabryki; domyslnie z deployments/derivativeMarket.5042002.json
 *   DERIV_FROM_BLOCK pierwszy blok skanu logow; domyslnie deployBlock z tego pliku
 *   GAS_ALERT_USDC  prog alarmu gazu, domyslnie "1"
 *   KEEPER_CONFIRM  "tak" = wysylaj transakcje
 *   PYTH_API_KEY    klucz Hermesa (https://docs.pyth.network); bez niego brak wypychania
 *   PYTH_PUSH_AFTER po ilu sekundach wieku ceny wypychac, domyslnie "600"
 *   HERMES_URL      domyslnie https://hermes.pyth.network
 */

const CHAIN_ID = 5042002;
// Blockdaemon daje 50 000 blokow na eth_getLogs (hardhat.config). Przy jednym
// bloku na sekunde to niecale 14 godzin na zapytanie.
const WINDOW = 50_000;

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
  "event PositionOpened(address indexed trader,bool isLong,uint256 marginUsdc,uint256 notional,uint256 size,uint256 entryPrice)",
];

const PYTH_ABI = [
  "function getPriceUnsafe(bytes32) view returns (tuple(int64 price,uint64 conf,int32 expo,uint256 publishTime))",
  "function getUpdateFee(bytes[]) view returns (uint256)",
  "function updatePriceFeeds(bytes[]) payable",
];

type Row = Record<string, string | number | boolean>;

type AdapterEntry = { address: string; priceId: string; maxAge: number; pyth?: string };

function readPythAdapters(): { pyth?: string; adapters: Record<string, AdapterEntry> } {
  const file = path.join(__dirname, "..", "..", "deployments", `pythAdapters.${CHAIN_ID}.json`);
  if (!fs.existsSync(file)) return { adapters: {} };
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  return { pyth: json.pyth, adapters: json.adapters ?? {} };
}

/** Podpisana aktualizacja z Hermesa jako tablica bytes dla updatePriceFeeds. */
async function fetchHermesUpdate(base: string, apiKey: string, priceIds: string[]): Promise<string[]> {
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

function readDeployment(): { factory?: string; deployBlock?: number } {
  const file = path.join(__dirname, "..", "..", "deployments", `derivativeMarket.${CHAIN_ID}.json`);
  if (!fs.existsSync(file)) return {};
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  return { factory: json.factory, deployBlock: json.deployBlock };
}

function firstLine(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0] : String(error);
}

async function main() {
  const provider = ethers.provider;
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) {
    throw new Error(`Oczekiwalem Arc Testnet (${CHAIN_ID}), dostalem ${net.chainId} (network ${network.name}).`);
  }
  const deployment = readDeployment();
  const factoryAddress = process.env.DERIV_FACTORY || deployment.factory;
  if (!factoryAddress) throw new Error("Brak adresu fabryki: ustaw DERIV_FACTORY albo deployments/derivativeMarket.5042002.json.");
  const fromBlock = Number(process.env.DERIV_FROM_BLOCK || deployment.deployBlock || 0);
  const execute = process.env.KEEPER_CONFIRM === "tak";
  const gasAlert = ethers.parseEther(process.env.GAS_ALERT_USDC || "1");

  const [signer] = await ethers.getSigners();
  const gasBalance = await provider.getBalance(signer.address);
  const gasUsdc = formatUnits(gasBalance, 18);

  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
  const count = Number(await factory.marketCount());
  const latest = await provider.getBlockNumber();
  const now = (await provider.getBlock(latest))!.timestamp;

  const markets: Row[] = [];
  for (let i = 0; i < count; i++) {
    const marketAddress: string = await factory.allMarkets(i);
    const market = new ethers.Contract(marketAddress, MARKET_ABI, provider);
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

      // Kandydaci do likwidacji: kazdy, kto KIEDYKOLWIEK otworzyl pozycje.
      // Jeden adres = jedna pozycja (kontrakt), wiec zbior wystarczy.
      const topic = market.interface.getEvent("PositionOpened")!.topicHash;
      const traders = new Set<string>();
      for (let from = fromBlock; from <= latest; from += WINDOW) {
        const to = Math.min(latest, from + WINDOW - 1);
        const logs = await provider.getLogs({ address: marketAddress, topics: [topic], fromBlock: from, toBlock: to });
        for (const log of logs) {
          const parsed = market.interface.parseLog(log);
          if (parsed) traders.add(parsed.args.trader);
        }
      }

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
          // Ktos mogl nas uprzedzic (PositionHealthy / NoPosition) - to nie
          // jest blad keepera, tylko powod, zeby isc dalej.
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

  // ---- PYTH: wiek cen i (z kluczem) wypychanie aktualizacji ----
  const pythCfg = readPythAdapters();
  const pushAfter = Number(process.env.PYTH_PUSH_AFTER || 600);
  const hermesKey = process.env.PYTH_API_KEY;
  const hermesUrl = process.env.HERMES_URL || "https://hermes.pyth.network";
  const pyth: Row[] = [];
  if (pythCfg.pyth) {
    for (const [symbol, entry] of Object.entries(pythCfg.adapters)) {
      // Kazdy adapter czyta z WLASNEGO zrodla: nasz PythReceiver (przyjmuje
      // Hermesa) albo kontrakt Pytha (BTC, odswiezany przez kogos innego).
      const pythContract = new ethers.Contract(entry.pyth ?? pythCfg.pyth, PYTH_ABI, provider);
      const row: Row = { symbol, adapter: entry.address, source: entry.pyth ?? pythCfg.pyth };
      try {
        const p = await pythContract.getPriceUnsafe(entry.priceId);
        const age = now - Number(p.publishTime);
        row.ageSec = age;
        row.stale = age > entry.maxAge;
        if (age <= pushAfter) {
          pyth.push(row);
          continue;
        }
        if (!hermesKey) {
          row.pushSkipped = "brak PYTH_API_KEY - Hermes wymaga klucza, tylko raportuje";
        } else if (!execute) {
          row.pushSkipped = "dry-run";
        } else {
          const update = await fetchHermesUpdate(hermesUrl, hermesKey, [entry.priceId]);
          const fee: bigint = await pythContract.getUpdateFee(update);
          const tx = await pythContract.connect(signer).getFunction("updatePriceFeeds")(update, { value: fee });
          await tx.wait();
          row.pushTx = tx.hash;
          row.feeUsdc = formatUnits(fee, 18);
        }
      } catch (error) {
        // 0x2acbe915 = InvalidWormholeVaa. Stan z 11.09.2026: kontrakt Pytha na
        // Arc testnet (wersja 1.4.5-alpha.1) nie przeszedl upgrade'u z 26.08,
        // a Hermes od tego dnia podpisuje aktualizacje nowym zestawem
        // (guardian set 1, 3 podpisy). Kontrakt przyjmuje tylko zestaw 7
        // Wormhole (13 podpisow). Kazdy endpoint Hermesa (v2, v1, beta,
        // po timestampie) oddaje nowy format - nie da sie tego obejsc po naszej
        // stronie. Do czasu upgrade'u przez Pyth cene BTC/USD na Arc
        // odswiezaja inne aplikacje ze starym formatem, a adapter po MAX_AGE
        // oddaje 0 i rynek spada na TWAP rejestru.
        const msg = firstLine(error);
        const data = (error as { data?: string }).data;
        row.error =
          data === "0x2acbe915"
            ? "InvalidWormholeVaa: kontrakt Pytha na Arc nie przyjmuje podpisow Hermesa po upgrade 08.2026 (czeka na upgrade kontraktu przez Pyth)"
            : msg;
      }
      pyth.push(row);
    }
  }

  console.log(
    JSON.stringify(
      { network: "arc-testnet", factory: factoryAddress, keeper: signer.address, gasUsdc, latestBlock: latest, execute, markets, pyth },
      null,
      2
    )
  );
  if (gasBalance < gasAlert) {
    // Ta linia jest umowa z keeper.ps1 - nie zmieniac slow "GAZ NISKI".
    console.log(`GAZ NISKI: keeper ${signer.address} ma ${gasUsdc} USDC na Arc, prog ${formatUnits(gasAlert, 18)} USDC.`);
  }
  if (!execute) console.log("Dry-run: ustaw KEEPER_CONFIRM=tak dopiero po sprawdzeniu raportu.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
