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
 *  2. dostawy claimFor/claimEthFor/claimTokenFor na adresy z env
 *     (SAFE / REWARDS / ESCROW) - ETH i tokeny,
 *  2b. escrow.release() (ETH 50/50 pot/ops) + escrow.releaseToken() (tokeny
 *     -> vesting) + vesting.release() po klifie - wszystko bezuprawnieniowe,
 *  3. SphereBuyback: checkpoint (gdy ten klucz jest CHECKPOINTEREM) + execute,
 *  4. Distributor.activate (gdy pending root po oknie weta).
 *
 * Lifecycle graduacji robi istniejacy scripts/launchpad/keeper.ts - ten
 * skrypt go UZUPELNIA, nie zastepuje.
 *
 * Uzycie (dry-run bez KEEPER_CONFIRM=tak, konwencja keeper.ts):
 *   TOKENS=0x...,0x... KEEPER_CONFIRM=tak npx hardhat run scripts/sphere/sphereKeeper.ts --network base
 * Env: LAUNCHPAD, HOOK, VAULT (domyslnie wdrozenie Base), SAFE, REWARDS,
 *      ESCROW, VESTING, BUYBACK, DISTRIBUTOR, TRANCHE_ETH (domyslnie 0.05).
 * Komplet dla SPHERE ustawia scripts/sphere/keeper.ps1 (Task Scheduler).
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
  "event AutoBuyback(address indexed token, uint256 ethIn, uint256 tokensBought, address indexed caller)",
  "function claimableEth(address) view returns (uint256)",
  "function claimEthFor(address) external",
  "function claimableToken(address,address) view returns (uint256)",
  "function claimTokenFor(address,address) external",
];
const VAULT_ABI = [
  "function seeded(address) view returns (bool)",
  "function harvest(address) external",
  "function claimableEth(address) view returns (uint256)",
  "function claimEthFor(address) external",
  "function claimableToken(address,address) view returns (uint256)",
  "function claimTokenFor(address,address) external",
];
const ESCROW_ABI = [
  "function sphereToken() view returns (address)",
  "function release() external",
  "function releaseToken(address) external",
];
const VESTING_ABI = [
  "function releasable(address) view returns (uint256)",
  "function release(address) external",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
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

/** Oddech miedzy transakcjami - seria kilkunastu tx pod rzad wywalala limity publicznych RPC. */
const pace = () => new Promise<void>((r) => setTimeout(r, 700));

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
      if (execute) await (await hook.settle(token)).wait(); await pace();
    }
    if (await vault.seeded(token)) {
      log(`harvest(${token})`);
      if (execute) {
        try {
          await (await vault.harvest(token)).wait(); await pace();
        } catch {
          log(`  harvest bez naroslych oplat - pomijam`);
        }
      }
    }
    // BURN_ROUNDS > 1 = "wypalamy wszystko": hook i tak wydaje na jedno
    // wywolanie tylko tyle, ile miesci sie w 1.5% ruchu sqrtP (~3% ceny),
    // wiec jedyna droga do oproznienia kolejki jest kilka wywolan pod rzad.
    // Kazde kolejne kupuje drozej - stad pauza BURN_PAUSE_S miedzy nimi
    // i stop, gdy w kolejce zostaje mniej niz 0.002 ETH.
    const burnRounds = Number(process.env.BURN_ROUNDS ?? "1");
    const burnPauseMs = Number(process.env.BURN_PAUSE_S ?? "20") * 1000;
    for (let round = 0; round < burnRounds; round++) {
    const buybackEth = await hook.pendingBuybackEth(token);
    if (buybackEth <= 2_000_000_000_000_000n && round > 0) {
      log(`  kolejka ${ethers.formatEther(buybackEth)} ETH - koniec rund`);
      break;
    }
    if (round > 0) {
      log(`  runda ${round + 1}/${burnRounds} za ${burnPauseMs / 1000}s (kolejka ${ethers.formatEther(buybackEth)} ETH)`);
      if (execute) await new Promise((r) => setTimeout(r, burnPauseMs));
    }
    if (buybackEth > 0n) {
      // ETH NIE jest palone: hook kupuje za nie token w puli v4 i dopiero
      // KUPIONE TOKENY ida na 0xdEaD. Poprzedni skrot "ETH -> 0xdEaD"
      // wygladal jak spalenie ETH i wystraszyl wlasciciela 2.09.2026.
      // Kwota ponizej to KOLEJKA, nie wydatek: hook ma limit ruchu ceny
      // w jednej transakcji i wydaje tylko tyle, ile pula zniesie - reszta
      // zostaje w pendingBuybackEth na nastepny przebieg. Prawdziwe kwoty
      // czytamy z eventu AutoBuyback PO transakcji (2.09.2026: keeper
      // wypisal 0.1827 ETH z kolejki, swap wydal 0.035 ETH, a ta pierwsza
      // liczba trafila do publicznego posta i wymagala sprostowania).
      log(`executeBuyback(${token}): w kolejce ${ethers.formatEther(buybackEth)} ETH (kupuje token w puli v4, kupione tokeny -> 0xdEaD)`);
      if (execute) {
        const rc = await (await hook.executeBuyback(token, 1n, deadline)).wait(); await pace();
        for (const l of rc.logs) {
          try {
            const d = hook.interface.parseLog({ topics: [...l.topics], data: l.data });
            if (d && d.name === "AutoBuyback") {
              log(`  AutoBuyback: wydano ${ethers.formatEther(d.args.ethIn)} ETH, kupiono i spalono ${ethers.formatEther(d.args.tokensBought)} tokenow | tx ${rc.hash}`);
            }
          } catch {
            /* log innego kontraktu */
          }
        }
        log(`  zostaje w kolejce: ${ethers.formatEther(await hook.pendingBuybackEth(token))} ETH`);
      }
    }
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
      if (execute) await (await pad.claimFor(addr)).wait(); await pace();
    }
    if (hEth > 0n) {
      log(`hook.claimEthFor(${name}): ${ethers.formatEther(hEth)} ETH`);
      if (execute) await (await hook.claimEthFor(addr)).wait(); await pace();
    }
    if (vEth > 0n) {
      log(`vault.claimEthFor(${name}): ${ethers.formatEther(vEth)} ETH`);
      if (execute) await (await vault.claimEthFor(addr)).wait(); await pace();
    }
    // Noga TOKENOWA oplat (hook 30/70, LP 30/70) - do 2.09.2026 keeper
    // odbieral tylko ETH i 20.8M SPHERE lezalo w hooku/vaulcie.
    for (const token of tokens) {
      const [hTok, vTok] = [await hook.claimableToken(token, addr), await vault.claimableToken(token, addr)];
      if (hTok > 0n) {
        log(`hook.claimTokenFor(${name}): ${ethers.formatEther(hTok)} tokenow`);
        if (execute) await (await hook.claimTokenFor(token, addr)).wait(); await pace();
      }
      if (vTok > 0n) {
        log(`vault.claimTokenFor(${name}): ${ethers.formatEther(vTok)} tokenow`);
        if (execute) await (await vault.claimTokenFor(token, addr)).wait(); await pace();
      }
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
        await (await buyback.checkpoint()).wait(); await pace();
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
        // Dwie proby: 2.09.2026 pierwsza transza padla na estimateGas z
        // "panic 0x11", a symulacja na spojnym stanie przechodzila - to byl
        // load-balansowany publiczny RPC mieszajacy stan miedzy wezlami.
        // Przy drugiej probie czekamy 15 s i odswiezamy deadline.
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const rc = await (await buyback.execute(tranche, 1n, deadline + BigInt(attempt) * 60n)).wait(); await pace();
            log(`  BuybackExecuted | tx ${rc.hash}`);
            break;
          } catch (e) {
            const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
            log(`  buyback odbity (proba ${attempt}/2): ${msg}`);
            if (attempt === 1) await new Promise((r) => setTimeout(r, 15_000));
          }
        }
      }
    } else if (bal > 0n) {
      log(`buyback: ${ethers.formatEther(bal)} ETH czeka, ale checkpoint nieswiezy, a ten klucz nie jest CHECKPOINTEREM`);
    }
  }

  // ---- 2b. escrow release + vesting ---------------------------------------
  // Wszystko bezuprawnieniowe, kierunki zamrozone: ETH escrow -> 50/50
  // BUYBACK_POT/OPS (oba Safe), tokeny escrow -> vesting, vesting -> Safe
  // po klifie. Keeper tylko placi gaz.
  if (process.env.ESCROW) {
    const escrow = new ethers.Contract(process.env.ESCROW, ESCROW_ABI, signer);
    const escrowEth = await ethers.provider.getBalance(process.env.ESCROW);
    if (escrowEth > 0n) {
      log(`escrow.release(): ${ethers.formatEther(escrowEth)} ETH -> 50/50 pot/ops`);
      if (execute) await (await escrow.release()).wait(); await pace();
    }
    const sphere: string = await escrow.sphereToken();
    if (sphere !== ethers.ZeroAddress) {
      const tok = new ethers.Contract(sphere, ERC20_ABI, signer);
      const escrowTok: bigint = await tok.balanceOf(process.env.ESCROW);
      if (escrowTok > 0n) {
        log(`escrow.releaseToken(): ${ethers.formatEther(escrowTok)} SPHERE -> vesting`);
        if (execute) await (await escrow.releaseToken(ethers.ZeroAddress)).wait(); await pace();
      }
      if (process.env.VESTING) {
        const vesting = new ethers.Contract(process.env.VESTING, VESTING_ABI, signer);
        const rel: bigint = await vesting.releasable(sphere);
        if (rel > 0n) {
          log(`vesting.release(): ${ethers.formatEther(rel)} SPHERE -> beneficjent (Safe)`);
          if (execute) await (await vesting.release(sphere)).wait(); await pace();
        }
      }
    }
  }

  // ---- 4. Distributor.activate --------------------------------------------
  if (process.env.DISTRIBUTOR) {
    const dist = new ethers.Contract(process.env.DISTRIBUTOR, DIST_ABI, signer);
    const p = await dist.pending();
    if (p.validAt > 0n && now >= p.validAt) {
      log(`distributor.activate(): epoka ${p.epochId}, root ${p.root}`);
      if (execute) await (await dist.activate()).wait(); await pace();
    }
  }

  log("keeper: koniec przebiegu");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
