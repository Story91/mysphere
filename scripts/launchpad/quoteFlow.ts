import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * PELNY PRZEBIEG LAUNCHPADA Q NA ZYWEJ SIECI (testnet): start z dev-buyem,
 * kupno do progu, awans, swap w obie strony przez PoolManager, settle i odbior.
 *
 * Czyta adresy z zapisu `deployQuote.ts`. Wydaje QUOTE z portfela wdrazajacego,
 * wiec wymaga FLOW_CONFIRM=tak. Na mainnecie NIE uruchamiac - to jest test.
 *
 *   FLOW_CONFIRM=tak Q_RECORD=launchpad-q-usdc-base-sepolia.json
 *   npx hardhat run scripts/launchpad/quoteFlow.ts --network base-sepolia
 *
 * FLOW_TOKEN=0x... wznawia od kroku 4 (swapy) na tokenie juz po awansie.
 *
 * Publiczne RPC Sepolii rozklada zapytania na wezly, ktore potrafia byc blok
 * z tylu: `estimateGas` zaraz po potwierdzonym przelewie widzi stare saldo
 * i rewertuje "transfer amount exceeds balance". Stad `waitBalance` przed
 * kazdym krokiem, ktory zalezy od swiezego salda.
 */

const MIN_SQRT = 4295128739n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n;

async function waitBalance(token: any, who: string, atLeast: bigint) {
  for (let i = 0; i < 30; i++) {
    if ((await token.balanceOf(who)) >= atLeast) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`saldo ${who} nie doszlo do ${atLeast} - RPC nie nadaza`);
}

function parse(contract: any, logs: any[], name: string) {
  return logs
    .map((l: any) => {
      try {
        return contract.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e: any) => e && e.name === name);
}

async function main() {
  if (process.env.FLOW_CONFIRM !== "tak") throw new Error("Przebieg wydaje QUOTE z portfela - powtorz z FLOW_CONFIRM=tak.");
  const recordName = process.env.Q_RECORD ?? "launchpad-q-usdc-base-sepolia.json";
  const record = JSON.parse(readFileSync(join(process.cwd(), "scripts", "output", recordName), "utf8"));
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== record.chainId) throw new Error(`Zapis jest z chainId ${record.chainId}, siec to ${chainId}.`);
  if (chainId === 8453) throw new Error("To jest skrypt testowy - nie na Base mainnet.");

  const [me] = await ethers.getSigners();
  const pad = await ethers.getContractAt("QuoteCurveLaunchpad", record.launchpad);
  const vault = await ethers.getContractAt("QuoteLiquidityVault", record.vault);
  const hook = await ethers.getContractAt("QuoteLaunchHook", record.hook);
  const quote = await ethers.getContractAt("MockQuoteToken", record.quote); // ABI ERC-20
  const dec = Number(record.quoteDecimals);
  const fmt = (v: bigint) => `${ethers.formatUnits(v, dec)} ${record.quoteSymbol}`;
  const rVirt = BigInt(record.rVirt);
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 1800);

  console.log("portfel", me.address, "saldo", fmt(await quote.balanceOf(me.address)));

  async function curveSteps(): Promise<string> {
    const need = rVirt * 4n + rVirt; // zbiorka + zapas na oplaty i dev-buy
    if ((await quote.balanceOf(me.address)) < need) throw new Error(`Za malo ${record.quoteSymbol}: potrzeba ok. ${fmt(need)}.`);
    await (await quote.approve(record.launchpad, ethers.MaxUint256)).wait();

    // 1. START z dev-buyem 1/10 R_VIRT i oknem bez limitu (zeby jednym kupnem dobic prog).
    const rc = await (
      await pad.launchAdvanced("Quote Flow", "QFLOW", rVirt / 10n, 1n, deadline(), 100, 70, 2000, 10n ** 27n, [me.address], [10_000], "")
    ).wait();
    const tokenAddr: string = parse(pad, rc!.logs, "Launched")!.args.token;
    console.log("1. token", tokenAddr, "orientacja", BigInt(record.quote) < BigInt(tokenAddr) ? "QUOTE=currency0" : "QUOTE=currency1");

    // 2. KUPNO DO PROGU - zwrot nadwyzki wraca do nas.
    const buyRc = await (await pad.buy(tokenAddr, rVirt * 5n, 1n, deadline())).wait();
    const bought = parse(pad, buyRc!.logs, "Bought")!;
    const l = await pad.launchOf(tokenAddr);
    console.log("2. stan", Number(l.state) === 2 ? "Locked" : l.state, "zwrot", fmt(bought.args.refund));
    const liab = await pad.totalLiabilities();
    const bal = await quote.balanceOf(record.launchpad);
    console.log("   wyplacalnosc", bal >= liab ? "OK" : "BLAD", fmt(bal), ">=", fmt(liab));

    // 3. AWANS
    const gRc = await (await pad.graduate(tokenAddr)).wait();
    const grad = parse(pad, gRc!.logs, "Graduated")!;
    console.log("3. awans: do puli", fmt(grad.args.ethToPool), "tokenow", ethers.formatEther(grad.args.tokensToPool), "na DEAD", ethers.formatEther(grad.args.tokensToDead));
    return tokenAddr;
  }

  async function poolSteps(tokenAddr: string) {
    const token = await ethers.getContractAt("MockB20", tokenAddr); // ABI ERC-20
    const quoteIs0 = BigInt(record.quote) < BigInt(tokenAddr);

    // 4. SWAPY przez sonde: kupno tokena za 1/10 R_VIRT i sprzedaz polowy.
    const probe = await (await ethers.getContractFactory("QuoteSwapProbe")).deploy(record.poolManager);
    await probe.waitForDeployment();
    const probeAddr = await probe.getAddress();
    const amount = rVirt / 10n;
    await (await quote.transfer(probeAddr, amount)).wait();
    await waitBalance(quote, probeAddr, amount);
    const k = await vault.poolKeyOf(tokenAddr);
    const key = [k[0], k[1], k[2], k[3], k[4]];
    await (await probe.doSwap(key, { zeroForOne: quoteIs0, amountSpecified: -amount, sqrtPriceLimitX96: quoteIs0 ? MIN_SQRT + 1n : MAX_SQRT - 1n })).wait();
    await waitBalance(token, probeAddr, 1n);
    const got = await token.balanceOf(probeAddr);
    await (await probe.doSwap(key, { zeroForOne: !quoteIs0, amountSpecified: -(got / 2n), sqrtPriceLimitX96: quoteIs0 ? MAX_SQRT - 1n : MIN_SQRT + 1n })).wait();
    console.log("4. swapy: kupiono", ethers.formatEther(got), "oplata hooka QUOTE", fmt(await hook.pendingQuote(tokenAddr)), "token", ethers.formatEther(await hook.pendingToken(tokenAddr)));

    // 5. SETTLE + ODBIOR + HARVEST
    await (await hook.settle(tokenAddr)).wait();
    const claimQ = await hook.claimableQuote(me.address);
    if (claimQ > 0n) await (await hook.claimQuote()).wait();
    await (await vault.harvest(tokenAddr)).wait();
    const padClaim = await pad.claimable(me.address);
    if (padClaim > 0n) await (await pad.claim()).wait();
    console.log("5. odebrano z hooka", fmt(claimQ), "z krzywej", fmt(padClaim), "LP do odbioru", fmt(await vault.claimableQuote(me.address)));
  }

  const tokenAddr = process.env.FLOW_TOKEN ? ethers.getAddress(process.env.FLOW_TOKEN) : await curveSteps();
  if (process.env.FLOW_TOKEN) console.log("wznowienie od kroku 4, token", tokenAddr);
  await poolSteps(tokenAddr);
  console.log("GOTOWE - token", tokenAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
