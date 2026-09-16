import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * WDROZENIE PythAggregatorAdapter NA ARC TESTNET.
 *
 * Adapter jest per FEED (jeden price id). Rynek dostaje jego adres w
 * `factory.createMarket(oracleMarketId, liquidity, chainlinkFeed)` - pole
 * `CHAINLINK_FEED` jest immutable, wiec istniejacy rynek ARC-USD go nie
 * dostanie; adapter jest dla NOWYCH rynkow na aktywach, ktore Pyth wycenia.
 *
 * Pyth na Arc testnet: 0x2880aB155794e7179c9eE2e38200202908C17B43
 * (docs.arc.io -> oracles -> Pyth EVM addresses). Price id z
 * https://www.pyth.network/developers/price-feed-ids (np. BTC/USD, ETH/USD).
 *
 * UZYCIE
 *   PRICE_ID=0xe62df6c8... SYMBOL="BTC/USD" CONFIRM=tak \
 *     npx cross-env TS_NODE_PROJECT=./hardhat.tsconfig.json \
 *     hardhat run scripts/derivatives/deploy-pyth-adapter.ts --network arcTestnet
 *
 * Zmienne:
 *   PRICE_ID   bytes32 feedu Pytha (wymagane)
 *   SYMBOL     opis, np. "BTC/USD" (wymagane)
 *   MAX_AGE    sekundy, domyslnie 3600 (po tym adapter oddaje 0, rynek spada na TWAP)
 *   PYTH       nadpisanie adresu kontraktu Pytha
 *   CONFIRM    "tak" na sieci innej niz lokalna
 *
 * Skrypt najpierw CZYTA feed z Pytha i drukuje wiek ceny. Feed, ktorego nikt
 * nie aktualizuje (11.09.2026: ETH/USD mial 15 dni), da adapter zwracajacy
 * zero od pierwszej sekundy - lepiej to wiedziec przed wdrozeniem.
 */

/** Oba lancuchy Arc; pliki deployments/*.<chainId>.json bierze z prawdziwego chainId. */
const ARC_CHAIN_IDS = new Set([5042002, 5042]);
const PYTH_ARC_TESTNET = "0x2880aB155794e7179c9eE2e38200202908C17B43";

/**
 * Zrodlo domyslne: NASZ PythReceiver (deployments/pythReceiver.<chainId>.json),
 * bo kontrakt Pytha na Arc odrzuca aktualizacje Hermesa po 26.08.2026 i tylko
 * BTC/USD ktos tam jeszcze odswieza. PYTH=... nadpisuje (np. dla BTC).
 */
function defaultPyth(chainId: number): string {
  const file = path.join(__dirname, "..", "..", "deployments", `pythReceiver.${chainId}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")).receiver;
  // Na mainnecie Pytha NIE MA (docs Pytha: tylko Arc testnet; pod 0x2880 na
  // 5042 stoi 1 kB czegos innego, co rewertuje). Bez odbiornika nie ma z czego
  // czytac - lepiej odpasc tu niz wdrozyc adapter na martwy adres.
  if (chainId === 5042) {
    throw new Error("Brak deployments/pythReceiver.5042.json - najpierw wdroz PythReceiver (deploy-pyth-receiver.ts --network arcMainnet).");
  }
  return PYTH_ARC_TESTNET;
}
const PYTH_ABI = [
  "function getPriceUnsafe(bytes32) view returns (tuple(int64 price,uint64 conf,int32 expo,uint256 publishTime))",
];

async function main() {
  const provider = ethers.provider;
  const chainId = Number((await provider.getNetwork()).chainId);
  const isLocal = network.name === "hardhat" || network.name === "localhost";
  if (!isLocal && !ARC_CHAIN_IDS.has(chainId)) throw new Error(`Oczekiwalem Arc (5042002 albo 5042), dostalem ${chainId}.`);
  if (!isLocal && process.env.CONFIRM !== "tak") throw new Error("To wdraza kontrakt. Powtorz z CONFIRM=tak.");

  const priceId = process.env.PRICE_ID;
  const symbol = process.env.SYMBOL;
  if (!priceId || !/^0x[0-9a-fA-F]{64}$/.test(priceId)) throw new Error("PRICE_ID musi byc bytes32 (0x + 64 hex).");
  if (!symbol) throw new Error("SYMBOL jest wymagane, np. BTC/USD.");
  const maxAge = Number(process.env.MAX_AGE || 3600);
  const pythAddress = process.env.PYTH || defaultPyth(chainId);

  const pyth = new ethers.Contract(pythAddress, PYTH_ABI, provider);
  try {
    const p = await pyth.getPriceUnsafe(priceId);
    const nowSec = Math.floor(Date.now() / 1000);
    const age = nowSec - Number(p.publishTime);
    console.log(`Pyth ${symbol}: price=${p.price} expo=${p.expo} publishTime=${p.publishTime} wiek=${age}s (MAX_AGE=${maxAge}s)`);
    if (age > maxAge) console.log("UWAGA: cena jest starsza niz MAX_AGE - adapter oddaje 0, dopoki ktos nie wypchnie aktualizacji.");
  } catch {
    // Swiezy PythReceiver nie ma jeszcze tego feedu - pierwsza aktualizacja
    // przyjdzie z keepera po wdrozeniu adaptera. To nie jest blad.
    console.log(`Pyth ${symbol}: brak feedu pod ${pythAddress} (pusty odbiornik?) - adapter oddaje 0 do pierwszej aktualizacji.`);
  }

  const [deployer] = await ethers.getSigners();
  const adapter = await (await ethers.getContractFactory("PythAggregatorAdapter")).deploy(
    pythAddress,
    priceId,
    maxAge,
    `${symbol} (Pyth)`
  );
  await adapter.waitForDeployment();
  const address = await adapter.getAddress();
  // latestAnswer rewertuje, gdy odbiornik nie ma jeszcze feedu (udokumentowane
  // w adapterze). Wdrozenie juz sie udalo - adres MUSI trafic do pliku.
  const answer = await adapter.latestAnswer().catch(() => null);
  console.log(`PythAggregatorAdapter ${symbol}: ${address} (latestAnswer=${answer == null ? "brak feedu" : ethers.formatEther(answer) + " USD"})`);

  if (!isLocal) {
    const file = path.join(__dirname, "..", "..", "deployments", `pythAdapters.${chainId}.json`);
    const json = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { chainId, pyth: pythAddress, adapters: {} };
    // Placeholder z zerowym `pyth` (frontend potrzebuje pliku, zeby sie zbudowac)
    // dostaje prawdziwe zrodlo przy pierwszym adapterze.
    if (!json.pyth || /^0x0+$/.test(json.pyth)) json.pyth = pythAddress;
    json.adapters[symbol] = { address, priceId, maxAge, pyth: pythAddress, deployer: deployer.address, deployedAt: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
    console.log(`zapisano ${file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
