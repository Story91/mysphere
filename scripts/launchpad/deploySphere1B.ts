import { ethers, network } from "hardhat";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";

/**
 * FAZA 1B - dystrybutor nagrod + buyback (docs/SPHERE-TOKENOMIKA.md, sekcja 9).
 *
 * Kolejnosc jest twarda: buyback dostaje adres dystrybutora w konstruktorze
 * (immutable), wiec dystrybutor idzie PIERWSZY. Oba kontrakty sa zero-admin
 * poza dwiema/trzema immutable rolami - kazdy parametr ponizej mrozi sie na
 * zawsze, stad dry-run drukuje komplet i wymaga CONFIRM=tak.
 *
 * Co ten skrypt NIE robi: nie proponuje zadnego roota (payouty dopiero po
 * min. czterech epokach shadow - doktryna fazy 1A) i nie wola execute()
 * buybacku (pula v4 istnieje dopiero po graduacji). Deploy jest niezalezny
 * od obu tych bram - adresy moga byc publiczne wczesniej.
 *
 * UZYCIE
 *   dry-run (nic nie wysyla):
 *     npx hardhat run scripts/launchpad/deploySphere1B.ts --network base
 *   deploy:
 *     CONFIRM=tak npx hardhat run scripts/launchpad/deploySphere1B.ts --network base
 *
 * ENV (wszystko opcjonalne, domyslne = decyzje ze speca / fixture testow):
 *   SPHERE          token (domyslnie odczyt escrow.sphereToken())
 *   PROPOSER        kto proponuje rooty (domyslnie deployer = publikator manifestow)
 *   GUARDIAN        kto ma weto (domyslnie Safe; MUSI roznic sie od PROPOSER)
 *   OPERATOR        checkpoint()/cancel() buybacku (domyslnie deployer)
 *   MIN_DELAY_S     okno weta roota (domyslnie 86400 - decyzja #10)
 *   STREAM_S        streaming przyrostu epoki (domyslnie 7 dni - decyzja #15)
 *   BURN_BPS        czesc kupionego SPHERE palona (domyslnie 2000 = 20%)
 *   TRANCHE_ETH     max jedna transza (domyslnie 0.05)
 *   WINDOW_ETH      budzet okna (domyslnie 0.5)
 *   WINDOW_S        dlugosc okna budzetu (domyslnie 7 dni)
 *   CHECKPOINT_S    max wiek checkpointu ceny (domyslnie 3600)
 *   MAX_DEV_BPS     max odchylenie od checkpointu (domyslnie 150 = ~1.5%)
 */

const BASE = {
  poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  hook: "0x71028Ea6999e2c415b46cc022ED0A9fDca2e2044",
  escrow: "0xe984986f4F1E067f697b548D5fe942813d03Da37",
  safe: "0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F",
  poolFee: 3000,
  tickSpacing: 60,
} as const;

const DAY = 24n * 3600n;

function envAddr(name: string, fallback: string): string {
  const v = (process.env[name] ?? "").trim();
  return v ? ethers.getAddress(v) : ethers.getAddress(fallback);
}
function envBig(name: string, fallback: bigint): bigint {
  const v = (process.env[name] ?? "").trim();
  return v ? BigInt(v) : fallback;
}
function envEth(name: string, fallback: string): bigint {
  return ethers.parseEther((process.env[name] ?? fallback).trim());
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const local = network.name === "hardhat" || network.name === "localhost";
  const confirm = process.env.CONFIRM === "tak";
  if (!local && !confirm) console.log("[dry-run] bez CONFIRM=tak nic nie zostanie wyslane\n");

  // --- token: z lancucha, nie z palca ------------------------------------
  const escrow = new ethers.Contract(
    BASE.escrow,
    ["function sphereToken() view returns (address)", "function launched() view returns (bool)"],
    ethers.provider
  );
  const sphereFromChain: string = local ? ethers.ZeroAddress : await escrow.sphereToken();
  const sphere = envAddr("SPHERE", sphereFromChain);
  if (sphere === ethers.ZeroAddress) throw new Error("SPHERE = 0x0 - token nie wystartowal albo podaj SPHERE=0x...");

  // --- parametry (mroza sie na zawsze) ------------------------------------
  const proposer = envAddr("PROPOSER", deployer.address);
  const guardian = envAddr("GUARDIAN", BASE.safe);
  const operator = envAddr("OPERATOR", deployer.address);
  const minDelay = envBig("MIN_DELAY_S", DAY);
  const stream = envBig("STREAM_S", 7n * DAY);
  const burnBps = envBig("BURN_BPS", 2000n);
  const trancheMax = envEth("TRANCHE_ETH", "0.05");
  const windowBudget = envEth("WINDOW_ETH", "0.5");
  const windowSeconds = envBig("WINDOW_S", 7n * DAY);
  const checkpointMaxAge = envBig("CHECKPOINT_S", 3600n);
  const maxDevBps = envBig("MAX_DEV_BPS", 150n);

  if (proposer.toLowerCase() === guardian.toLowerCase()) throw new Error("PROPOSER i GUARDIAN musza byc rozne (weto bez proponenta).");
  if (windowBudget < trancheMax) throw new Error("WINDOW_ETH < TRANCHE_ETH - kontrakt odrzuci (BadConfig).");

  console.log(`siec: ${network.name} (chainId ${chainId}) | wdrazajacy: ${deployer.address}`);
  console.log(`saldo: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);
  // String() na BigInt - inaczej %s drukuje "86400n" i wyglada jak jednostka.
  console.log(
    "DISTRIBUTOR  token=%s proposer=%s guardian=%s minDelay=%ss stream=%ss",
    sphere,
    proposer,
    guardian,
    String(minDelay),
    String(stream)
  );
  console.log(
    "BUYBACK      pool=%s/%s/%s operator=%s burn=%sbps tranche=%s ETH window=%s ETH/%ss checkpoint<=%ss maxDev=%sbps",
    BASE.poolFee,
    BASE.tickSpacing,
    BASE.hook,
    operator,
    String(burnBps),
    ethers.formatEther(trancheMax),
    ethers.formatEther(windowBudget),
    String(windowSeconds),
    String(checkpointMaxAge),
    String(maxDevBps)
  );

  if (!local && !confirm) {
    console.log("\nDry-run zakonczony. Deploy: CONFIRM=tak + te same env.");
    return;
  }

  // --- 1. dystrybutor -----------------------------------------------------
  const D = await ethers.getContractFactory("SphereStreamingMerkleDistributor");
  const dist = await D.deploy(sphere, proposer, guardian, minDelay, stream);
  await dist.waitForDeployment();
  const distAddr = await dist.getAddress();
  console.log(`\nSphereStreamingMerkleDistributor: ${distAddr}`);

  // --- 2. buyback (immutable wskazanie na dystrybutor) ---------------------
  const B = await ethers.getContractFactory("SphereBuyback");
  const buyback = await B.deploy(
    BASE.poolManager,
    sphere,
    BASE.poolFee,
    BASE.tickSpacing,
    BASE.hook,
    distAddr,
    operator,
    burnBps,
    trancheMax,
    windowBudget,
    windowSeconds,
    checkpointMaxAge,
    maxDevBps
  );
  await buyback.waitForDeployment();
  const buybackAddr = await buyback.getAddress();
  console.log(`SphereBuyback:                    ${buybackAddr}`);

  // --- 3. odczyty kontrolne - kazde wiazanie sprawdzone z zewnatrz ---------
  const dOk = (await dist.TOKEN()) === sphere && (await dist.PROPOSER()) === proposer && (await dist.GUARDIAN()) === guardian;
  const bOk = (await buyback.DISTRIBUTOR()) === distAddr && (await buyback.SPHERE()) === sphere && Number(await buyback.BURN_BPS()) === Number(burnBps);
  if (!dOk || !bOk) throw new Error("Odczyt kontrolny nie zgadza sie z parametrami - NIE publikowac adresow.");
  console.log("odczyty kontrolne: OK");

  // --- 4. rekord + komendy weryfikacji ------------------------------------
  const record = {
    chainId,
    network: network.name,
    phase: "1B",
    deployer: deployer.address,
    sphere,
    distributor: distAddr,
    buyback: buybackAddr,
    params: {
      proposer,
      guardian,
      operator,
      minDelaySeconds: minDelay.toString(),
      streamSeconds: stream.toString(),
      burnBps: burnBps.toString(),
      trancheMaxWei: trancheMax.toString(),
      windowBudgetWei: windowBudget.toString(),
      windowSeconds: windowSeconds.toString(),
      checkpointMaxAgeSeconds: checkpointMaxAge.toString(),
      maxDevBps: maxDevBps.toString(),
      pool: { manager: BASE.poolManager, fee: BASE.poolFee, tickSpacing: BASE.tickSpacing, hooks: BASE.hook },
    },
    deployedAt: new Date().toISOString(),
  };
  const outPath = join(__dirname, "..", "output", `sphere-${network.name}-1b.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");
  console.log(`\nrekord: ${outPath}`);
  console.log("\nweryfikacja zrodel na Basescanie:");
  console.log(`  npx hardhat verify --network ${network.name} ${distAddr} ${sphere} ${proposer} ${guardian} ${minDelay} ${stream}`);
  console.log(
    `  npx hardhat verify --network ${network.name} ${buybackAddr} ${BASE.poolManager} ${sphere} ${BASE.poolFee} ${BASE.tickSpacing} ${BASE.hook} ${distAddr} ${operator} ${burnBps} ${trancheMax} ${windowBudget} ${windowSeconds} ${checkpointMaxAge} ${maxDevBps}`
  );
  console.log("\nnastepne kroki: NEXT_PUBLIC_SPHERE_DISTRIBUTOR_ADDRESS / NEXT_PUBLIC_SPHERE_BUYBACK_ADDRESS w configu,");
  console.log("keeper z env BUYBACK= i DISTRIBUTOR= (scripts/sphere/sphereKeeper.ts), pierwszy root dopiero po shadow.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
