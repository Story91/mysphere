import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";
import { runPerpsKeeper, type DeploymentFile, type PythAdaptersFile } from "../../lib/keeper/perpsKeeperCore";

/**
 * KEEPER PERPOW NA ARC - reczne uruchomienie przez hardhat.
 *
 * Od 16.09.2026 cala logika (funding, likwidacje, wypychanie Pytha, heartbeat
 * rejestru) mieszka w lib/keeper/perpsKeeperCore.ts i jest wspolna z trasa
 * app/api/keeper/perps (cron na Vercelu). Ten plik tylko: czyta pliki
 * deployments/*.json, bierze provider i signer z hardhata, drukuje raport JSON
 * i linie "GAZ NISKI" (umowa z keeper.ps1 - nie zmieniac slow).
 *
 * DLACZEGO TAK: keeper z Harmonogramu na laptopie stanal dwa razy po cichu
 * (zepsute cudzyslowy w zadaniu; 12 h bez gazu = 47 przebiegow "GAZ NISKI"),
 * a przez ten czas wszystkie rynki na testnecie byly "halted". Cron w chmurze
 * z osobnym kluczem nie zalezy od tego, czy laptop jest wlaczony.
 *
 * UZYCIE
 *   npm run perps:keeper                       (testnet, dry-run)
 *   KEEPER_CONFIRM=tak npm run perps:keeper    (testnet, na zywo)
 *   npm run perps:keeper:mainnet               (5042; wymaga wdrozonego modulu)
 *
 * Zmienne:
 *   DERIV_FACTORY   nadpisanie adresu fabryki
 *   KEEPER_CONFIRM  "tak" = wysylaj transakcje
 *   GAS_ALERT_USDC  prog alarmu gazu, domyslnie "1"
 *   PYTH_API_KEY    klucz Hermesa; bez niego krok Pytha tylko raportuje
 *   PYTH_PUSH_AFTER po ilu sekundach wieku ceny wypychac, domyslnie "600"
 *   HERMES_URL      domyslnie https://hermes.pyth.network
 *   REGISTRY_HEARTBEAT_AFTER  po ilu sekundach wysylac submitPrice, domyslnie "2400"
 *   KEEPER_SCAN_BLOCKS  ile blokow wstecz skanowac pozycje, domyslnie 200000
 */

function readJson<T>(name: string): T | null {
  const file = path.join(__dirname, "..", "..", "deployments", name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

async function main() {
  const provider = ethers.provider;
  const chainId = Number((await provider.getNetwork()).chainId);
  const [signer] = await ethers.getSigners();
  const deployment = readJson<DeploymentFile>(`derivativeMarket.${chainId}.json`) ?? {};
  const pythAdapters = readJson<PythAdaptersFile>(`pythAdapters.${chainId}.json`) ?? { adapters: {} };
  const execute = process.env.KEEPER_CONFIRM === "tak";

  const report = await runPerpsKeeper({
    provider,
    signer,
    chainId,
    execute,
    deployment,
    pythAdapters,
    factoryAddress: process.env.DERIV_FACTORY,
    scanBlocks: process.env.KEEPER_SCAN_BLOCKS ? Number(process.env.KEEPER_SCAN_BLOCKS) : undefined,
    pythApiKey: process.env.PYTH_API_KEY,
    hermesUrl: process.env.HERMES_URL,
    pushAfter: process.env.PYTH_PUSH_AFTER ? Number(process.env.PYTH_PUSH_AFTER) : undefined,
    heartbeatAfter: process.env.REGISTRY_HEARTBEAT_AFTER ? Number(process.env.REGISTRY_HEARTBEAT_AFTER) : undefined,
    gasAlertUsdc: process.env.GAS_ALERT_USDC,
  });

  console.log(JSON.stringify({ hardhatNetwork: network.name, ...report }, null, 2));
  if (report.gasLow) {
    // Ta linia jest umowa z keeper.ps1 - nie zmieniac slow "GAZ NISKI".
    console.log(`GAZ NISKI: keeper ${report.keeper} ma ${report.gasUsdc} USDC na Arc, prog ${process.env.GAS_ALERT_USDC || "1"} USDC.`);
  }
  if (!execute) console.log("Dry-run: ustaw KEEPER_CONFIRM=tak dopiero po sprawdzeniu raportu.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
