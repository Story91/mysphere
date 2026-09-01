import { ethers, network } from "hardhat";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";

/**
 * FAZA 1B - dystrybutor nagrod + buyback (docs/SPHERE-TOKENOMIKA.md, sekcja 9).
 *
 * Kolejnosc jest twarda: buyback dostaje adres dystrybutora w konstruktorze
 * (immutable), wiec dystrybutor idzie PIERWSZY. Oba kontrakty sa zero-admin
 * poza immutable rolami - kazdy parametr ponizej mrozi sie na zawsze, stad
 * dry-run drukuje komplet i wymaga CONFIRM=tak.
 *
 * Co ten skrypt NIE robi: nie proponuje zadnego roota (payouty dopiero po
 * min. czterech epokach shadow - doktryna fazy 1A) i nie wola execute()
 * buybacku (pula v4 istnieje dopiero po graduacji). Deploy jest niezalezny
 * od obu tych bram - adresy moga byc publiczne wczesniej.
 *
 * ROLE (recenzja przedwdrozeniowa 2026-09-02, trzy niezalezne soczewki):
 *   PROPOSER     = deployer (publikuje manifesty, wiec i rooty)
 *   GUARDIAN     = Safe (weto; kontrakt wymusza GUARDIAN != PROPOSER)
 *   OPERATOR     = Safe (cancel() - zwrot NIEWYDANEGO ETH; to protokolowe ETH,
 *                  wiec NIE moze byc zwracane do goracego klucza)
 *   CHECKPOINTER = deployer/keeper (checkpoint() co najwyzej CHECKPOINT_S
 *                  przed transza - Safe nie zrobi tego co godzine)
 *
 * UZYCIE (konwencja repo: ts-node przez hardhat.tsconfig.json)
 *   dry-run (nic nie wysyla):   npm run launchpad:sphere:1b
 *   deploy, PowerShell:         $env:CONFIRM='tak'; npm run launchpad:sphere:1b
 *   deploy, bash:               CONFIRM=tak npm run launchpad:sphere:1b
 *   wznowienie po padzie tx 2:  DISTRIBUTOR=0x... (pomija deploy dystrybutora,
 *                               sprawdza jego parametry, wdraza tylko buyback)
 *
 * ENV (opcjonalne; domyslne = decyzje speca + wnioski z recenzji):
 *   SPHERE          token (domyslnie odczyt escrow.sphereToken())
 *   PROPOSER / GUARDIAN / OPERATOR / CHECKPOINTER   role jak wyzej
 *   MIN_DELAY_S     okno weta roota (86400 - decyzja #10)
 *   STREAM_S        streaming przyrostu epoki (7 dni - decyzja #15)
 *   BURN_BPS        czesc kupionego SPHERE palona (2000 = 20%)
 *   TRANCHE_ETH     max jedna transza (0.05)
 *   WINDOW_ETH      budzet okna (0.5) - TWARDY SUFIT na zawsze, ~26 ETH/rok
 *   WINDOW_S        dlugosc okna budzetu (7 dni)
 *   CHECKPOINT_S    max wiek checkpointu ceny (3600)
 *   MAX_DEV_BPS     max odchylenie od checkpointu (400): swap buybacku placi
 *                   0.3% LP + 1% hooka = 130 bps ZANIM policzy sie poslizg,
 *                   wiec 150 bps z fixture testow blokowaloby kazda transze
 *                   powyzej ~0.006 ETH przy plynnosci z graduacji (~2.9 ETH)
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
/** Publiczny RPC Base potrafi oddac stan sprzed bloku tuz po deployu - powtarzamy odczyt. */
async function readRetry<T>(fn: () => Promise<T>, attempts = 8, delayMs = 1500): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
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
  const operator = envAddr("OPERATOR", BASE.safe);
  const checkpointer = envAddr("CHECKPOINTER", deployer.address);
  const minDelay = envBig("MIN_DELAY_S", DAY);
  const stream = envBig("STREAM_S", 7n * DAY);
  const burnBps = envBig("BURN_BPS", 2000n);
  const trancheMax = envEth("TRANCHE_ETH", "0.05");
  const windowBudget = envEth("WINDOW_ETH", "0.5");
  const windowSeconds = envBig("WINDOW_S", 7n * DAY);
  const checkpointMaxAge = envBig("CHECKPOINT_S", 3600n);
  const maxDevBps = envBig("MAX_DEV_BPS", 400n);

  // Lustro warunkow konstruktorow (ZeroAddress / BadConfig / BadSchedule) -
  // PRZED pierwsza transakcja, zeby literowka w env nie osierocila dystrybutora.
  if (proposer.toLowerCase() === guardian.toLowerCase()) throw new Error("PROPOSER i GUARDIAN musza byc rozne (weto bez proponenta).");
  if (minDelay === 0n || stream === 0n) throw new Error("MIN_DELAY_S i STREAM_S musza byc > 0.");
  if (burnBps > 10_000n) throw new Error("BURN_BPS > 10000.");
  if (maxDevBps >= 10_000n) throw new Error("MAX_DEV_BPS musi byc < 10000.");
  if (trancheMax === 0n) throw new Error("TRANCHE_ETH musi byc > 0.");
  if (windowBudget < trancheMax) throw new Error("WINDOW_ETH < TRANCHE_ETH - kontrakt odrzuci (BadConfig).");
  if (windowSeconds === 0n || checkpointMaxAge === 0n) throw new Error("WINDOW_S i CHECKPOINT_S musza byc > 0.");
  if (maxDevBps < 200n) console.log("UWAGA: MAX_DEV_BPS < 200 nie pokrywa 130 bps oplat swapu - execute() bedzie rewertowac PriceGuard.\n");

  console.log(`siec: ${network.name} (chainId ${chainId}) | wdrazajacy: ${deployer.address}`);
  console.log(`saldo: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);
  console.log(
    "DISTRIBUTOR  token=%s proposer=%s guardian=%s minDelay=%ss stream=%ss",
    sphere,
    proposer,
    guardian,
    String(minDelay),
    String(stream)
  );
  console.log(
    "BUYBACK      pool=%s/%s/%s operator=%s checkpointer=%s burn=%sbps tranche=%s ETH window=%s ETH/%ss checkpoint<=%ss maxDev=%sbps",
    BASE.poolFee,
    BASE.tickSpacing,
    BASE.hook,
    operator,
    checkpointer,
    String(burnBps),
    ethers.formatEther(trancheMax),
    ethers.formatEther(windowBudget),
    String(windowSeconds),
    String(checkpointMaxAge),
    String(maxDevBps)
  );
  const reuse = (process.env.DISTRIBUTOR ?? "").trim();
  if (reuse) console.log(`DISTRIBUTOR  istniejacy: ${reuse} (deploy pominiety, parametry zostana sprawdzone)`);

  if (!local && !confirm) {
    console.log("\nDry-run zakonczony. Deploy: CONFIRM=tak + te same env.");
    return;
  }

  // --- 1. dystrybutor (albo wznowienie na istniejacym) --------------------
  const D = await ethers.getContractFactory("SphereStreamingMerkleDistributor");
  let distAddr: string;
  let dist: any;
  if (reuse) {
    distAddr = ethers.getAddress(reuse);
    dist = D.attach(distAddr);
    const [t, p, g, md, sd] = await Promise.all([
      dist.TOKEN(),
      dist.PROPOSER(),
      dist.GUARDIAN(),
      dist.MIN_DELAY(),
      dist.STREAM_DURATION(),
    ]);
    if (t !== sphere || p !== proposer || g !== guardian || BigInt(md) !== minDelay || BigInt(sd) !== stream) {
      throw new Error("Istniejacy DISTRIBUTOR ma inne parametry niz zadane - STOP.");
    }
    console.log(`\nSphereStreamingMerkleDistributor: ${distAddr} (istniejacy, parametry zgodne)`);
  } else {
    dist = await D.deploy(sphere, proposer, guardian, minDelay, stream);
    await dist.waitForDeployment();
    distAddr = await dist.getAddress();
    console.log(`\nSphereStreamingMerkleDistributor: ${distAddr}`);
  }

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
    checkpointer,
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

  // --- 3. rekord NAJPIERW (zeby pad RPC nie zgubil adresow), potem kontrola --
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
      checkpointer,
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
  console.log(`rekord: ${outPath}`);
  console.log("\nweryfikacja zrodel na Basescanie:");
  console.log(`  npx hardhat verify --network ${network.name} ${distAddr} ${sphere} ${proposer} ${guardian} ${minDelay} ${stream}`);
  console.log(
    `  npx hardhat verify --network ${network.name} ${buybackAddr} ${BASE.poolManager} ${sphere} ${BASE.poolFee} ${BASE.tickSpacing} ${BASE.hook} ${distAddr} ${operator} ${checkpointer} ${burnBps} ${trancheMax} ${windowBudget} ${windowSeconds} ${checkpointMaxAge} ${maxDevBps}`
  );

  const dOk = await readRetry(
    async () => (await dist.TOKEN()) === sphere && (await dist.PROPOSER()) === proposer && (await dist.GUARDIAN()) === guardian
  );
  const bOk = await readRetry(
    async () =>
      (await buyback.DISTRIBUTOR()) === distAddr &&
      (await buyback.SPHERE()) === sphere &&
      (await buyback.OPERATOR()) === operator &&
      (await buyback.CHECKPOINTER()) === checkpointer &&
      Number(await buyback.BURN_BPS()) === Number(burnBps)
  );
  if (!dOk || !bOk) throw new Error("Odczyt kontrolny nie zgadza sie z parametrami - NIE publikowac adresow.");
  console.log("\nodczyty kontrolne: OK");
  console.log("nastepne kroki: NEXT_PUBLIC_SPHERE_DISTRIBUTOR_ADDRESS / NEXT_PUBLIC_SPHERE_BUYBACK_ADDRESS w configu,");
  console.log("keeper z env BUYBACK= i DISTRIBUTOR= (scripts/sphere/sphereKeeper.ts), pierwszy root dopiero po shadow.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
