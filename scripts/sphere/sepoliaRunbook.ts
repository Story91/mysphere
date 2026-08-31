import { ethers, network } from "hardhat";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * RUNBOOK GRADUACJI SPHERE NA SEPOLII - ostatnia warstwa dowodu przed
 * mainnetem (LAUNCHPAD-STAN: "runbook wdrozenia MUSI zawierac jedna pelna
 * graduacje na testnecie/forku PRZED mainnetem" - fork juz byl, to jest
 * testnet z PRAWDZIWYM precompile B20 i PRAWDZIWYM PoolManagerem v4).
 *
 * Kroki: domkniecie krzywej -> graduate -> swapy w obie strony przez
 * RealPoolSwapProbe -> settle -> harvest -> dostawy do escrow ->
 * executeBuyback (spalenie na 0xdEaD) -> zapis dowodow.
 *
 * Uzycie:
 *   KEEPER_CONFIRM=tak npx hardhat run scripts/sphere/sepoliaRunbook.ts --network base-sepolia
 */

const RECORD = join(__dirname, "..", "output", `sphere-${network.name}.json`);

const PAD_ABI = [
  "function launchOf(address) view returns (address creator, uint8 state, uint256 ethReserve, uint256 tokenReserve, uint40 startedAt, bytes32 launchId)",
  "function quoteBuy(address,uint256) view returns (uint256,uint256,uint256)",
  "function buy(address,uint256,uint256) payable returns (uint256)",
  "function graduate(address) external",
  "function gradFeeOf(address) view returns (uint256,uint256)",
  "function poolKeyOf(address) view returns (tuple(address,address,uint24,int24,address))",
  "function claimable(address) view returns (uint256)",
  "function claimFor(address) external",
  "function R_VIRT() view returns (uint256)",
];
const HOOK_ABI = [
  "function pendingEth(address) view returns (uint256)",
  "function pendingToken(address) view returns (uint256)",
  "function pendingBuybackEth(address) view returns (uint256)",
  "function settle(address) external",
  "function executeBuyback(address,uint256,uint256) external returns (uint256)",
  "function claimableEth(address) view returns (uint256)",
  "function claimableToken(address,address) view returns (uint256)",
  "function claimEthFor(address) external",
  "function claimTokenFor(address,address) external",
  "function buybackBps(address) view returns (uint16)",
];
const VAULT_ABI = [
  "function harvest(address) external",
  "function claimableEth(address) view returns (uint256)",
  "function claimableToken(address,address) view returns (uint256)",
  "function claimEthFor(address) external",
  "function claimTokenFor(address,address) external",
  "function positionOf(address) view returns (bytes32, uint128)",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"];

const DEAD = "0x000000000000000000000000000000000000dEaD";
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n;
const MIN_SQRT = 4295128739n;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (process.env.KEEPER_CONFIRM !== "tak") throw new Error("Runbook wymaga KEEPER_CONFIRM=tak.");
  const [signer] = await ethers.getSigners();
  const rec = JSON.parse(readFileSync(RECORD, "utf8"));
  const token: string = process.env.TOKEN ?? rec.token;
  const padAddr: string = process.env.LAUNCHPAD ?? rec.launchpad;
  const escrow: string = rec.sphereCreatorEscrow;
  const rewards: string = rec.sphereRewards;
  if (!token) throw new Error("Brak adresu tokena (TOKEN env albo rekord wdrozenia).");

  const pad = new ethers.Contract(padAddr, PAD_ABI, signer);
  const key = await pad.poolKeyOf(token);
  const hook = new ethers.Contract(key[4], HOOK_ABI, signer);
  const vaultAddr = rec.vault ?? process.env.VAULT;
  const vault = new ethers.Contract(
    vaultAddr ?? (JSON.parse(readFileSync(join(__dirname, "..", "output", `launchpad-${network.name}.json`), "utf8")).vault),
    VAULT_ABI,
    signer
  );
  const asset = new ethers.Contract(token, ERC20_ABI, signer);
  const proofs: Record<string, string> = {};

  console.log(`token: ${token}`);
  console.log(`ogon vanity: ...${token.slice(-18).toLowerCase()} (oczekiwane ba5ed...)`);

  // ---- 1. DOMKNIECIE KRZYWEJ ----------------------------------------------
  let l = await pad.launchOf(token);
  const rVirt: bigint = await pad.R_VIRT();
  if (l[1] === 1n) {
    // Okno snajperskie: cap per adres przez 300 s od startu - czekamy wg
    // CZASU LANCUCHA, nie zegara lokalnego (skew kilku sekund = WindowCap).
    const windowEnd = Number(l[4]) + 300;
    for (;;) {
      const chainNow = Number((await ethers.provider.getBlock("latest"))!.timestamp);
      if (chainNow > windowEnd + 2) break;
      console.log(`okno startowe: czekam ${windowEnd + 3 - chainNow}s (czas lancucha)...`);
      await sleep(Math.min(30, windowEnd + 3 - chainNow) * 1000);
    }
    const target = rVirt * 4n;
    const missingNet = target - l[2];
    const gross = (missingNet * 10_000n) / 9_899n + 10n ** 15n; // fee 1% + margines
    console.log(`domykam krzywa: rezerwa ${ethers.formatEther(l[2])} -> cel ${ethers.formatEther(target)} (zakup ${ethers.formatEther(gross)})`);
    const tx = await pad.buy(token, 1n, BigInt(Math.floor(Date.now() / 1000)) + 900n, { value: gross });
    proofs.closeBuy = (await tx.wait())!.hash;
    l = await pad.launchOf(token);
  }
  console.log(`stan krzywej: ${l[1]} (2 = Locked)`);

  // ---- 2. GRADUACJA NA PRAWDZIWYM POOLMANAGERZE ---------------------------
  if (l[1] === 2n) {
    const [gradFee, callerReward] = await pad.gradFeeOf(token);
    console.log(`graduate(): fee ${ethers.formatEther(gradFee)}, nagroda wolajacego ${ethers.formatEther(callerReward)}`);
    const tx = await pad.graduate(token);
    proofs.graduate = (await tx.wait())!.hash;
  }
  // Publiczny RPC Sepolii to load-balancer - swiezy stan potrafi przyjsc ze
  // spoznionej repliki. Odpytujemy do skutku zamiast wierzyc pierwszemu odczytowi.
  for (let i = 0; i < 12 && l[1] !== 3n; i++) {
    await sleep(3000);
    l = await pad.launchOf(token);
  }
  if (l[1] !== 3n) throw new Error(`token nie jest Graduated (stan ${l[1]})`);
  const pos = await vault.positionOf(token);
  console.log(`GRADUACJA OK - plynnosc pozycji vaulta: ${pos[1]}`);

  // ---- 3. SWAPY W OBIE STRONY (prawdziwa pula v4) -------------------------
  const Probe = await ethers.getContractFactory("RealPoolSwapProbe");
  const pmAddr = key[4] ? await (async () => {
    const hookC = new ethers.Contract(key[4], ["function POOL_MANAGER() view returns (address)"], signer);
    return hookC.POOL_MANAGER();
  })() : process.env.POOL_MANAGER;
  const probe = await Probe.deploy(pmAddr);
  await probe.waitForDeployment();
  const plainKey = [key[0], key[1], key[2], key[3], key[4]];

  /** Odczyt do skutku - publiczny RPC oddaje czasem stan ze spoznionej repliki. */
  async function pollUntil(label: string, read: () => Promise<bigint>): Promise<bigint> {
    for (let i = 0; i < 15; i++) {
      const v = await read();
      if (v > 0n) return v;
      await sleep(3000);
    }
    throw new Error(`${label}: wartosc dalej 0 po 45s - to nie wyglada na lag repliki`);
  }

  const probeAddr = await probe.getAddress();

  // (a) ETH -> token: hook tnie strone tokenowa.
  let tx = await probe.doSwap(plainKey, [true, -ethers.parseEther("0.05"), MIN_SQRT + 1n], { value: ethers.parseEther("0.05") });
  proofs.swapEthToToken = (await tx.wait())!.hash;
  const probeTokens = await pollUntil("saldo sondy", () => asset.balanceOf(probeAddr));
  console.log(`swap ETH->token: probe ma ${ethers.formatEther(probeTokens)} SPHERE; pendingToken hooka: ${ethers.formatEther(await hook.pendingToken(token))}`);

  // (b) token -> ETH: hook tnie strone ETH (z tego zyje buyback).
  tx = await probe.doSwap(plainKey, [false, -(probeTokens / 2n), MAX_SQRT - 1n], {});
  proofs.swapTokenToEth = (await tx.wait())!.hash;
  const pendingEth = await pollUntil("pendingEth hooka", () => hook.pendingEth(token));
  console.log(`swap token->ETH: pendingEth hooka: ${ethers.formatEther(pendingEth)}`);

  // ---- 4. SETTLE + HARVEST + DOSTAWY --------------------------------------
  tx = await hook.settle(token);
  proofs.settle = (await tx.wait())!.hash;
  console.log(`settle: escrow claimableEth ${ethers.formatEther(await hook.claimableEth(escrow))}, buyback pot ${ethers.formatEther(await hook.pendingBuybackEth(token))}`);

  try {
    tx = await vault.harvest(token);
    proofs.harvest = (await tx.wait())!.hash;
    console.log(`harvest: escrow LP-ETH ${ethers.formatEther(await vault.claimableEth(escrow))}, LP-token ${ethers.formatEther(await vault.claimableToken(token, escrow))}`);
  } catch {
    console.log("harvest: brak naroslych oplat LP (ok przy malym wolumenie)");
  }

  for (const [name, fn] of [
    ["pad.claimFor(escrow)", () => pad.claimFor(escrow)],
    ["pad.claimFor(rewards)", () => pad.claimFor(rewards)],
    ["hook.claimEthFor(escrow)", () => hook.claimEthFor(escrow)],
    ["hook.claimTokenFor(escrow)", () => hook.claimTokenFor(token, escrow)],
    ["vault.claimEthFor(escrow)", () => vault.claimEthFor(escrow)],
    ["vault.claimTokenFor(escrow)", () => vault.claimTokenFor(token, escrow)],
  ] as const) {
    try {
      const t = await (fn as () => Promise<any>)();
      await t.wait();
      console.log(`${name}: dostarczone`);
    } catch {
      console.log(`${name}: nic do dostarczenia`);
    }
  }

  // ---- 5. PIERWSZY PRAWDZIWY AUTO-BURN ------------------------------------
  const buybackPot: bigint = await hook.pendingBuybackEth(token);
  if (buybackPot > 0n) {
    const deadBefore: bigint = await asset.balanceOf(DEAD);
    tx = await hook.executeBuyback(token, 1n, BigInt(Math.floor(Date.now() / 1000)) + 900n);
    proofs.executeBuyback = (await tx.wait())!.hash;
    const burned = (await asset.balanceOf(DEAD)) - deadBefore;
    console.log(`AUTO-BURN: spalono ${ethers.formatEther(burned)} SPHERE na 0xdEaD (z ${ethers.formatEther(buybackPot)} ETH)`);
  } else {
    console.log("auto-burn: pot pusty (za maly wolumen ETH-strony)");
  }

  // ---- 6. ZAPIS DOWODOW ---------------------------------------------------
  writeFileSync(RECORD, JSON.stringify({ ...rec, runbook: { completedAt: new Date().toISOString(), proofs } }, null, 2) + "\n");
  console.log(`dowody dopisane do ${RECORD}`);
  console.log("RUNBOOK SEPOLIA: DOMKNIETY");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
