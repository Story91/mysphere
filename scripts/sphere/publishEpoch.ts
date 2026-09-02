import { ethers } from "hardhat";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";

/**
 * PUBLIKATOR EPOKI volume mining (faza 1A/1B speca).
 *
 * Robi to, co bedzie robil proposer przed kazdym `propose()` na
 * SphereStreamingMerkleDistributor - i to, co KAZDY moze powtorzyc, zeby
 * zweryfikowac root:
 *   1. deterministyczny skan logow epoki po zakresach blokow (ta sama
 *      logika co app/api/sphere/season - epochMath jest wspolne),
 *   2. kanoniczny MANIFEST: pelne dane wejsciowe + wynik + hash algorytmu
 *      (keccak zrodla epochMath.ts) + keccak manifestu,
 *   3. przy PULI > 0: liscie (account, cumulative, prevCumulative) i root
 *      Merkle w DOKLADNIE formacie dystrybutora (podwojny keccak, pary
 *      sortowane). prevCumulative czytane z manifestu poprzedniej epoki.
 *
 * SHADOW (domyslnie): POOL_SPHERE=0 -> zadnych lisci, sam manifest z
 * udzialami i sufitami reguly 0. Wyplacalna epoka: podac POOL_SPHERE
 * (ile SPHERE kupil buyback w epoce) - nagroda_i = share_i * pula,
 * przycieta sufitem reguly 0 przeliczonym po VWAP_SPHERE_PER_ETH.
 *
 * Uzycie:
 *   npx hardhat run scripts/sphere/publishEpoch.ts                 # shadow, biezaca epoka
 *   EPOCH=3 POOL_SPHERE=125000 VWAP_SPHERE_PER_ETH=2500000 npx hardhat run ...
 */

import {
  EPOCH_BLOCKS,
  SEASON_GENESIS_BLOCK,
  scoreEpoch,
  type TokenEpochInput,
} from "../../app/startpad/sphere/season/epochMath";

const LAUNCHPAD = "0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D";
const HOOK = "0x71028Ea6999e2c415b46cc022ED0A9fDca2e2044";
const SAFE = "0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F";
const CHUNK = 9_500n;

const PAD_EVENTS = [
  "event Bought(address indexed token, address indexed buyer, uint256 ethIn, uint256 ethNet, uint256 feeEth, uint256 tokensOut, uint256 refund, uint256 ethReserveAfter, uint256 tokenReserveAfter)",
  "event Sold(address indexed token, address indexed seller, uint256 tokensIn, uint256 ethGross, uint256 feeEth, uint256 ethOut, uint256 ethReserveAfter, uint256 tokenReserveAfter)",
  "event FeeAccrued(address indexed token, address indexed account, uint256 amount, uint8 kind)",
  "function launchOf(address token) view returns (address creator, uint8 state, uint256 ethReserve, uint256 tokenReserve, uint40 startedAt, bytes32 launchId)",
];
const HOOK_EVENTS = ["event HookFeeTaken(address indexed token, bool indexed isEth, uint256 amount)"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scanChunks(contract: any, filter: any, from: bigint, to: bigint) {
  const out: any[] = [];
  for (let a = from; a <= to; a += CHUNK) {
    const b = a + CHUNK - 1n > to ? to : a + CHUNK - 1n;
    for (let attempt = 0; ; attempt++) {
      try {
        out.push(...(await contract.queryFilter(filter, a, b)));
        break;
      } catch (e) {
        if (attempt >= 5) throw e;
        await sleep(400 * (attempt + 1));
      }
    }
    await sleep(120);
  }
  return out;
}

/** Leaf i drzewo DOKLADNIE jak w kontrakcie/testach dystrybutora. */
function leafOf(account: string, cum: bigint, prevCum: bigint): string {
  return ethers.keccak256(
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256"], [account, cum, prevCum])
    )
  );
}

function buildTree(leaves: string[]): { root: string; proofs: Record<string, string[]> } {
  const sorted = leaves.slice().sort();
  const layers: string[][] = [sorted];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 === prev.length) next.push(prev[i]);
      else {
        const [a, b] = [prev[i], prev[i + 1]].sort();
        next.push(ethers.keccak256(ethers.concat([a, b])));
      }
    }
    layers.push(next);
  }
  const proofs: Record<string, string[]> = {};
  for (const leaf of sorted) {
    const proof: string[] = [];
    let idx = sorted.indexOf(leaf);
    for (let l = 0; l < layers.length - 1; l++) {
      const sib = idx ^ 1;
      if (sib < layers[l].length) proof.push(layers[l][sib]);
      idx = Math.floor(idx / 2);
    }
    proofs[leaf] = proof;
  }
  return { root: layers[layers.length - 1][0], proofs };
}

/** Kanonizacja: sortowane klucze, bigint jako string - hash liczy sie z TEGO. */
function canonical(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return v;
  });
}

async function main() {
  const pad = new ethers.Contract(LAUNCHPAD, PAD_EVENTS, ethers.provider);
  const hook = new ethers.Contract(HOOK, HOOK_EVENTS, ethers.provider);

  const head = BigInt(await ethers.provider.getBlockNumber());
  const currentIdx = Number((head - SEASON_GENESIS_BLOCK) / EPOCH_BLOCKS);
  const epochIdx = process.env.EPOCH ? Number(process.env.EPOCH) : currentIdx;
  const fromBlock = SEASON_GENESIS_BLOCK + BigInt(epochIdx) * EPOCH_BLOCKS;
  const toBlock = fromBlock + EPOCH_BLOCKS - 1n;
  const scanTo = head < toBlock ? head : toBlock;
  const closed = head > toBlock;
  console.log(`epoka ${epochIdx}: bloki ${fromBlock}-${toBlock} (${closed ? "ZAMKNIETA" : "w toku"})`);

  const bought = await scanChunks(pad, pad.filters.Bought(), fromBlock, scanTo);
  const sold = await scanChunks(pad, pad.filters.Sold(), fromBlock, scanTo);
  const fees = await scanChunks(pad, pad.filters.FeeAccrued(null, SAFE), fromBlock, scanTo);
  const hookFees = await scanChunks(hook, hook.filters.HookFeeTaken(null, true), fromBlock, scanTo);

  const perToken = new Map<string, TokenEpochInput & { traders: Set<string> }>();
  const metas = new Map<string, { creator: string; startedAt: bigint }>();
  const tokens = new Set<string>();
  for (const log of [...bought, ...sold, ...fees, ...hookFees]) tokens.add((log.args[0] as string).toLowerCase());
  for (const t of tokens) {
    try {
      const l = await pad.launchOf(t);
      if (l[0] !== ethers.ZeroAddress) metas.set(t, { creator: l[0], startedAt: BigInt(l[4]) });
    } catch {
      /* spoza wdrozenia */
    }
  }
  const ensure = (t: string) => {
    const key = t.toLowerCase();
    const meta = metas.get(key);
    if (!meta) return null;
    let row = perToken.get(key);
    if (!row) {
      row = { token: key, creator: meta.creator, startedAt: meta.startedAt, curveBuyNet: 0n, curveSellGross: 0n, curveSelfVolume: 0n, hookEthFees: 0n, protocolFeeEth: 0n, uniqueTraders: 0, traders: new Set() };
      perToken.set(key, row);
    }
    return row;
  };
  for (const log of bought) {
    const r = ensure(log.args[0]);
    if (!r) continue;
    const buyer = (log.args[1] as string).toLowerCase();
    if (buyer === r.creator.toLowerCase()) r.curveSelfVolume += log.args[3];
    else {
      r.curveBuyNet += log.args[3];
      r.traders.add(buyer);
    }
  }
  for (const log of sold) {
    const r = ensure(log.args[0]);
    if (!r) continue;
    const seller = (log.args[1] as string).toLowerCase();
    if (seller === r.creator.toLowerCase()) r.curveSelfVolume += log.args[3];
    else {
      r.curveSellGross += log.args[3];
      r.traders.add(seller);
    }
  }
  for (const log of fees) {
    const r = ensure(log.args[0]);
    if (r) r.protocolFeeEth += log.args[2];
  }
  for (const log of hookFees) {
    const r = ensure(log.args[0]);
    if (r) r.hookEthFees += log.args[2];
  }

  const inputs: TokenEpochInput[] = [...perToken.values()].map((r) => ({ ...r, uniqueTraders: r.traders.size }));
  const endTs = BigInt((await ethers.provider.getBlock(Number(scanTo)))!.timestamp) + (toBlock > scanTo ? (toBlock - scanTo) * 2n : 0n);
  const result = scoreEpoch(inputs, epochIdx, fromBlock, toBlock, endTs);

  // ---- nagrody i liscie (jesli pula > 0) -----------------------------------
  const poolSphere = ethers.parseEther(process.env.POOL_SPHERE ?? "0");
  const vwap = ethers.parseEther(process.env.VWAP_SPHERE_PER_ETH ?? "0"); // SPHERE za 1 ETH
  const outDir = join(__dirname, "..", "output", "sphere-epochs");
  const prevPath = join(outDir, `epoch-${epochIdx - 1}.json`);
  const prevCums: Record<string, string> = existsSync(prevPath)
    ? JSON.parse(readFileSync(prevPath, "utf8")).cumulative ?? {}
    : {};

  const cumulative: Record<string, string> = { ...prevCums };
  let leaves: { account: string; cumulative: string; prevCumulative: string; proof?: string[] }[] = [];
  let root: string | null = null;

  if (poolSphere > 0n) {
    if (!closed) throw new Error("Wyplacalna epoka musi byc ZAMKNIETA (EPOCH < biezaca).");
    if (vwap === 0n) throw new Error("Podaj VWAP_SPHERE_PER_ETH do przeliczenia sufitu reguly 0.");
    for (const c of result.creators) {
      const share = (poolSphere * c.shareBps) / 10_000n;
      // Regula 0: sufit w ETH przeliczony na SPHERE po VWAP transz buybacku.
      const capSphere = (c.rewardCapEth * vwap) / 10n ** 18n;
      const reward = share < capSphere ? share : capSphere;
      if (reward === 0n) continue;
      const key = c.creator.toLowerCase();
      cumulative[key] = (BigInt(prevCums[key] ?? "0") + reward).toString();
    }
    const leafData = Object.entries(cumulative).map(([account, cum]) => ({
      account,
      cumulative: cum,
      prevCumulative: prevCums[account] ?? "0",
    }));
    const tree = buildTree(leafData.map((l) => leafOf(l.account, BigInt(l.cumulative), BigInt(l.prevCumulative))));
    root = tree.root;
    leaves = leafData.map((l) => ({ ...l, proof: tree.proofs[leafOf(l.account, BigInt(l.cumulative), BigInt(l.prevCumulative))] }));
  }

  const algoSource = readFileSync(join(__dirname, "..", "..", "app", "startpad", "sphere", "season", "epochMath.ts"), "utf8");
  const manifestBody = {
    epoch: epochIdx,
    fromBlock,
    toBlock,
    closed,
    algorithmHash: ethers.keccak256(ethers.toUtf8Bytes(algoSource)),
    inputs,
    result: {
      totalExternalVolume: result.totalExternalVolume,
      totalProtocolEth: result.totalProtocolEth,
      creators: result.creators.map((c) => ({
        creator: c.creator,
        shareBps: c.shareBps,
        netProtocolEth: c.netProtocolEth,
        rewardCapEth: c.rewardCapEth,
      })),
    },
    poolSphere,
    vwapSpherePerEth: vwap,
    cumulative,
    root,
  };
  const canon = canonical(manifestBody);
  const manifestHash = ethers.keccak256(ethers.toUtf8Bytes(canon));

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `epoch-${epochIdx}.json`);
  const manifestJson = JSON.stringify({ ...JSON.parse(canon), manifestHash, leaves }, null, 2) + "\n";
  writeFileSync(outPath, manifestJson);
  // Kopia PUBLICZNA: przegladarka (przycisk Claim na /startpad/sphere/season)
  // bierze stad liscie i proofy. Statyczny plik pod public/ jedzie z deployem;
  // kazdy moze porownac jego manifestHash z tym, co stoi w dystrybutorze.
  const publicDir = join(__dirname, "..", "..", "public", "sphere-epochs");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, `epoch-${epochIdx}.json`), manifestJson);
  console.log(`manifest: ${outPath} (+ public/sphere-epochs/epoch-${epochIdx}.json)`);
  console.log(`manifestHash: ${manifestHash}`);
  const totalCumulative = Object.values(cumulative).reduce((a, v) => a + BigInt(v), 0n);
  if (!root) {
    console.log("SHADOW: bez lisci (POOL_SPHERE=0). Udzialy i sufity w manifescie.");
    return;
  }
  console.log(`root do propose(): ${root} (totalCumulative: ${totalCumulative})`);

  // ---- PROPOSE=tak: propozycja roota na dystrybutorze (klucz PROPOSER) ----
  // On-chain epochId to LICZNIK wyplacalnych epok (0, 1, 2...), nie numer
  // epoki kalendarzowej - kontrakt wymaga dokladnie epochId+1. Mapowanie
  // kalendarz -> licznik zapisujemy w latest.json, zeby UI wiedzialo, ktory
  // manifest jest aktywny.
  const distributorAddr = process.env.DISTRIBUTOR ?? "0xc0b018161bB48383c808Aa47923f5501758D3E9D";
  const [signer] = await ethers.getSigners();
  const dist = new ethers.Contract(
    distributorAddr,
    [
      "function epochId() view returns (uint64)",
      "function PROPOSER() view returns (address)",
      "function pending() view returns (bytes32 root, bytes32 manifestHash, uint64 epochId, uint256 totalCumulative, uint64 validAt)",
      "function propose(bytes32 root_, bytes32 manifestHash_, uint64 epochId_, uint256 totalCumulative_)",
    ],
    signer
  );
  const onchainNext = BigInt(await dist.epochId()) + 1n;
  const latest = {
    epoch: epochIdx,
    onchainEpochId: onchainNext.toString(),
    root,
    manifestHash,
    totalCumulative: totalCumulative.toString(),
    poolSphere: poolSphere.toString(),
    proposedAt: null as string | null,
  };
  if (process.env.PROPOSE !== "tak") {
    writeFileSync(join(publicDir, "latest.json"), JSON.stringify(latest, null, 2) + "\n");
    console.log(`propose: pominiete (PROPOSE=tak zeby wyslac). Nastepny on-chain epochId: ${onchainNext}`);
    return;
  }
  if ((await dist.PROPOSER()).toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`PROPOSER dystrybutora to nie ${signer.address} - ten klucz nie moze proponowac.`);
  }
  const tx = await dist.propose(root, manifestHash, onchainNext, totalCumulative);
  const rc = await tx.wait();
  const p = await dist.pending();
  latest.proposedAt = new Date().toISOString();
  writeFileSync(join(publicDir, "latest.json"), JSON.stringify(latest, null, 2) + "\n");
  console.log(`propose OK | tx ${rc.hash} | epochId ${onchainNext} | weto do ${new Date(Number(p.validAt) * 1000).toISOString()}`);
  console.log("po oknie weta keeper wola activate(); od tej chwili Claim na /startpad/sphere/season.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
