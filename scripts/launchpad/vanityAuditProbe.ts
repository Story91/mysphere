import { ethers, network } from "hardhat";
import { buildPlan, KNOWN_POOL_MANAGERS } from "./plan";

/**
 * AUDYT VANITY - krok 1.
 *
 * Pytanie: czy PRZEWIDYWALNY adres tokena B20 pozwala napastnikowi ZATRUC pule
 * przed graduacja? Jesli tak, vanity (kopanie adresu) otwiera dziure. Jesli nie
 * - `blockhash` w salcie jest tylko obrona-w-glab i mozna go zdjac pod vanity.
 *
 * Symulacja na forku Base MAINNET (prawdziwy Uniswap v4 PoolManager):
 *   1. deploy stacka, launch tokena -> adres tokena ZNANY (scenariusz vanity),
 *   2. ATAK 1: obcy adres probuje initialize NASZEJ puli (z naszym hookiem)
 *              -> oczekiwany REWERT (beforeInitialize: sender != VAULT),
 *   3. ATAK 2: obcy tworzy pule BEZ naszego hooka (hooks=0) na te sama pare
 *              -> przechodzi (inny PoolKey), ale nie koliduje z nasza,
 *   4. graduacja mimo junk-puli MUSI zadzialac.
 */

const BASE_CHAIN_ID = 8453;
const POOL_MANAGER = KNOWN_POOL_MANAGERS[BASE_CHAIN_ID];
const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 70n;
const PROTOCOL_SHARE_BPS = 3000n;
const SQRT_1_1 = 79228162514264337593543950336n; // 2^96, cena 1:1 (arbitralna/zatruta)

const pmAbi = [
  "function initialize((address,address,uint24,int24,address) key, uint160 sqrtPriceX96) returns (int24)",
];

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function add(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name} :: ${detail}`);
}

async function main() {
  const rpc = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  await network.provider.send("hardhat_reset", [{ forking: { jsonRpcUrl: rpc } }]);
  console.log("fork Base mainnet, block", await ethers.provider.getBlockNumber());

  const [deployer, attacker, creator, trader, treasury] = await ethers.getSigners();

  const Plain = await ethers.getContractFactory("PlainTokenFactory");
  const tokenFactory = await Plain.deploy();
  await tokenFactory.waitForDeployment();

  const nonce = await deployer.getNonce("pending");
  const plan = await buildPlan({ poolManager: POOL_MANAGER, feeRecipient: treasury.address, protocolShareBps: PROTOCOL_SHARE_BPS, deployer: deployer.address, nonce });
  const Pad = await ethers.getContractFactory("CurveLaunchpad");
  const pad = await Pad.deploy(POOL_MANAGER, FEE_BPS, CREATOR_FEE_BPS, treasury.address, PROTOCOL_SHARE_BPS, await tokenFactory.getAddress(), plan.hookSalt);
  await pad.waitForDeployment();
  const hook = await pad.HOOK();
  console.log("pad", await pad.getAddress(), "hook", hook);

  // Launch -> adres tokena jest teraz ZNANY (dokladnie tak, jak przy vanity).
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const rc = (await (await pad.connect(creator).launch("Vanity Test", "VNTY", 0n, now + 600)).wait())!;
  let token = "";
  for (const log of rc.logs) { try { const p = pad.interface.parseLog(log); if (p?.name === "Launched") token = ethers.getAddress(p.args[0]); } catch {} }
  add("token wystartowal (adres znany)", token !== "", token);

  const key = await pad.poolKeyOf(token);
  const keyTuple = [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks];
  const pm = new ethers.Contract(POOL_MANAGER, pmAbi, ethers.provider);

  // --- ATAK 1: obcy initialize NASZEJ puli (z naszym hookiem) ---
  let a1Reverted = false, a1Detail = "";
  try {
    await pm.connect(attacker).initialize.staticCall(keyTuple, SQRT_1_1);
    a1Detail = "NIE zrewertowalo - DZIURA";
  } catch (e: any) {
    a1Reverted = true;
    a1Detail = (e.shortMessage || e.message || "").slice(0, 90);
  }
  add("ATAK1: obcy initialize NASZEJ puli rewertuje (brama hooka)", a1Reverted, a1Detail);

  // --- ATAK 2: junk pool bez naszego hooka (hooks=0), ta sama para ---
  const junkKey = [key.currency0, key.currency1, key.fee, key.tickSpacing, ethers.ZeroAddress];
  let junkOk = false;
  try {
    await (await pm.connect(attacker).initialize(junkKey, SQRT_1_1)).wait();
    junkOk = true;
  } catch (e: any) {
    junkOk = false;
  }
  add("ATAK2: junk pool bez hooka powstaje (inny PoolKey, nie nasz)", junkOk, junkOk ? "powstal - ale to INNA pula" : "nie powstal");

  // --- Graduacja MIMO junk-puli ---
  await network.provider.send("evm_increaseTime", [301]);
  await network.provider.send("evm_mine");
  await (await pad.connect(trader).buy(token, 1n, (await ethers.provider.getBlock("latest"))!.timestamp + 600, { value: ethers.parseEther("5") })).wait();
  add("kupno domyka krzywa do Locked", (await pad.launchOf(token))[1] === 2n, "state=Locked");

  let gradOk = false, gradDetail = "";
  try {
    await (await pad.connect(deployer).graduate(token)).wait();
    gradOk = (await pad.launchOf(token))[1] === 3n;
    gradDetail = "state=Graduated";
  } catch (e: any) {
    gradDetail = (e.shortMessage || e.message || "").slice(0, 90);
  }
  add("graduacja NASZEJ puli dziala mimo junk-puli", gradOk, gradDetail);

  const failed = checks.filter((c) => !c.ok);
  console.log("");
  console.log("=== WNIOSEK ===");
  if (a1Reverted && gradOk) {
    console.log("Przewidywalny adres NIE otwiera zatrucia: bramka hooka blokuje obca");
    console.log("inicjalizacje naszej puli, a junk-pula bez hooka nie blokuje graduacji.");
    console.log("=> blockhash jest obrona-w-glab; vanity mozna dodac bezpiecznie.");
  } else {
    console.log("UWAGA: jeden z warunkow nie przeszedl - vanity NIE jest bezpieczne bez zmian.");
  }
  if (failed.length) throw new Error(`${failed.length} sprawdzen odpadlo.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
