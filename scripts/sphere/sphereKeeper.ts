import { ethers } from "hardhat";

/**
 * SPHERE KEEPER - cron peryferii (spec sekcja 8, "SphereKeeper").
 *
 * Wszystko, co wola, jest bezuprawnieniowe albo nalezy do rol, ktorych ten
 * skrypt NIE trzyma - kierunki przelewow sa zaszyte w kontraktach, wiec
 * keeper moze byc dowolnym, niezaufanym adresem z gazem.
 *
 * Kroki (kazdy pomijany, gdy nie ma nic do zrobienia):
 *  1. per token z TOKENS: hook.settle + vault.harvest (odswieza salda przed
 *     snapshotem epoki) + hook.executeBuyback (auto-burn tokena),
 *  2. dostawy claimFor/claimEthFor na adresy z env (SAFE / REWARDS / ESCROW),
 *  3. SphereBuyback.execute (gdy BUYBACK ustawiony i checkpoint swiezy),
 *  4. Distributor.activate (gdy pending root po oknie weta).
 *
 * Lifecycle graduacji robi istniejacy scripts/launchpad/keeper.ts - ten
 * skrypt go UZUPELNIA, nie zastepuje.
 *
 * Uzycie (dry-run bez KEEPER_CONFIRM=tak, konwencja keeper.ts):
 *   TOKENS=0x...,0x... KEEPER_CONFIRM=tak npx hardhat run scripts/sphere/sphereKeeper.ts --network base
 * Env: LAUNCHPAD, HOOK, VAULT (domyslnie wdrozenie Base), SAFE, REWARDS,
 *      ESCROW, BUYBACK, DISTRIBUTOR, TRANCHE_ETH (domyslnie 0.05).
 */

const PAD_ABI = [
  "function claimable(address) view returns (uint256)",
  "function claimFor(address) external",
  "function launchOf(address) view returns (address,uint8,uint256,uint256,uint40,bytes32)",
];
const HOOK_ABI = [
  "function pendingEth(address) view returns (uint256)",
  "function pendingToken(address) view returns (uint256)",
  "function pendingBuybackEth(address) view returns (uint256)",
  "function settle(address) external",
  "function executeBuyback(address,uint256,uint256) external returns (uint256)",
  "function claimableEth(address) view returns (uint256)",
  "function claimEthFor(address) external",
];
const VAULT_ABI = [
  "function seeded(address) view returns (bool)",
  "function harvest(address) external",
  "function claimableEth(address) view returns (uint256)",
  "function claimEthFor(address) external",
];
const BUYBACK_ABI = [
  "function checkpoint() external",
  "function CHECKPOINTER() view returns (address)",
  "function checkpointAt() view returns (uint64)",
  "function CHECKPOINT_MAX_AGE() view returns (uint64)",
  "function TRANCHE_MAX() view returns (uint256)",
  "function execute(uint256,uint256,uint256) external returns (uint256)",
];
const DIST_ABI = [
  "function pending() view returns (bytes32 root, bytes32 manifestHash, uint64 epochId, uint256 totalCumulative, uint64 validAt)",
  "function activate() external",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const execute = process.env.KEEPER_CONFIRM === "tak";
  const log = (m: string) => console.log(`${execute ? "" : "[dry-run] "}${m}`);

  const pad = new ethers.Contract(process.env.LAUNCHPAD ?? "0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D", PAD_ABI, signer);
  const hook = new ethers.Contract(process.env.HOOK ?? "0x71028Ea6999e2c415b46cc022ED0A9fDca2e2044", HOOK_ABI, signer);
  const vault = new ethers.Contract(process.env.VAULT ?? "0x6108aDCb176D2A4A6283A06bb0Dd468b86A6AB63", VAULT_ABI, signer);

  const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
  const deadline = now + 600n;

  // ---- 1. per token: settle / harvest / auto-burn --------------------------
  const tokens = (process.env.TOKENS ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    const [pendingEth, pendingToken] = [await hook.pendingEth(token), await hook.pendingToken(token)];
    if (pendingEth > 0n || pendingToken > 0n) {
      log(`settle(${token}): ETH ${ethers.formatEther(pendingEth)} / token ${ethers.formatEther(pendingToken)}`);
      if (execute) await (await hook.settle(token)).wait();
    }
    if (await vault.seeded(token)) {
      log(`harvest(${token})`);
      if (execute) {
        try {
          await (await vault.harvest(token)).wait();
        } catch {
          log(`  harvest bez naroslych oplat - pomijam`);
        }
      }
    }
    const buybackEth = await hook.pendingBuybackEth(token);
    if (buybackEth > 0n) {
      // ETH NIE jest palone: hook kupuje za nie token w puli v4 i dopiero
      // KUPIONE TOKENY ida na 0xdEaD. Poprzedni skrot "ETH -> 0xdEaD"
      // wygladal jak spalenie ETH i wystraszyl wlasciciela 2.09.2026.
      log(`executeBuyback(${token}): ${ethers.formatEther(buybackEth)} ETH kupuje token w puli v4 -> kupione tokeny na 0xdEaD`);
      if (execute) await (await hook.executeBuyback(token, 1n, deadline)).wait();
    }
  }

  // ---- 2. dostawy claimFor -------------------------------------------------
  const recipients = [
    ["SAFE", process.env.SAFE ?? "0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F"],
    ["REWARDS", process.env.REWARDS],
    ["ESCROW", process.env.ESCROW],
  ].filter(([, a]) => a) as [string, string][];
  for (const [name, addr] of recipients) {
    const [c, hEth, vEth] = [await pad.claimable(addr), await hook.claimableEth(addr), await vault.claimableEth(addr)];
    if (c > 0n) {
      log(`pad.claimFor(${name}): ${ethers.formatEther(c)} ETH`);
      if (execute) await (await pad.claimFor(addr)).wait();
    }
    if (hEth > 0n) {
      log(`hook.claimEthFor(${name}): ${ethers.formatEther(hEth)} ETH`);
      if (execute) await (await hook.claimEthFor(addr)).wait();
    }
    if (vEth > 0n) {
      log(`vault.claimEthFor(${name}): ${ethers.formatEther(vEth)} ETH`);
      if (execute) await (await vault.claimEthFor(addr)).wait();
    }
  }

  // ---- 3. SphereBuyback ----------------------------------------------------
  if (process.env.BUYBACK) {
    const buyback = new ethers.Contract(process.env.BUYBACK, BUYBACK_ABI, signer);
    const bal = await ethers.provider.getBalance(process.env.BUYBACK);
    let at = await buyback.checkpointAt();
    const maxAge = await buyback.CHECKPOINT_MAX_AGE();
    let fresh = at > 0n && now - at <= maxAge;
    // checkpoint() nalezy do CHECKPOINTERA (goracy klucz keepera, rozdzielony
    // od OPERATORA=Safe, ktory trzyma cancel()). Jesli ten klucz to my,
    // odswiezamy referencje ceny tuz przed transza - inaczej execute()
    // rewertuje CheckpointStale po CHECKPOINT_MAX_AGE.
    if (bal > 0n && !fresh && (await buyback.CHECKPOINTER()).toLowerCase() === signer.address.toLowerCase()) {
      log("buyback.checkpoint() - odswiezenie referencji ceny");
      if (execute) {
        await (await buyback.checkpoint()).wait();
        at = await buyback.checkpointAt();
        fresh = true;
      }
    }
    if (bal > 0n && fresh) {
      const trancheMax = await buyback.TRANCHE_MAX();
      const tranche = (ethers.parseEther(process.env.TRANCHE_ETH ?? "0.05") < trancheMax
        ? ethers.parseEther(process.env.TRANCHE_ETH ?? "0.05")
        : trancheMax);
      log(`buyback.execute(${ethers.formatEther(tranche)} ETH)`);
      if (execute) {
        try {
          await (await buyback.execute(tranche, 1n, deadline)).wait();
        } catch (e) {
          log(`  buyback odbity (limit okna / straznik kursu): ${e instanceof Error ? e.message.split("\n")[0] : e}`);
        }
      }
    } else if (bal > 0n) {
      log(`buyback: ${ethers.formatEther(bal)} ETH czeka, ale checkpoint nieswiezy, a ten klucz nie jest CHECKPOINTEREM`);
    }
  }

  // ---- 4. Distributor.activate --------------------------------------------
  if (process.env.DISTRIBUTOR) {
    const dist = new ethers.Contract(process.env.DISTRIBUTOR, DIST_ABI, signer);
    const p = await dist.pending();
    if (p.validAt > 0n && now >= p.validAt) {
      log(`distributor.activate(): epoka ${p.epochId}, root ${p.root}`);
      if (execute) await (await dist.activate()).wait();
    }
  }

  log("keeper: koniec przebiegu");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
