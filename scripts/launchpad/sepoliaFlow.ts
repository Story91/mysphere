import { artifacts, ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { Contract, ContractTransactionReceipt, getAddress } from "ethers";
import { KNOWN_POOL_MANAGERS } from "./plan";

const CHAIN_ID = 84532;
const POOL_MANAGER = KNOWN_POOL_MANAGERS[CHAIN_ID];
const MIN_SQRT_PRICE_PLUS_ONE = 4_295_128_740n;
const SWAP_ETH = ethers.parseEther("0.001");
const DEFAULT_BUY_ETH = ethers.parseEther("5");
const LAUNCH_WINDOW = 300;

function requireAddress(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} jest wymagane.`);
  return getAddress(value);
}

function parseEvent(contract: Contract, receipt: ContractTransactionReceipt, eventName: string) {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === eventName) return parsed;
    } catch {
      // Log z innego kontraktu.
    }
  }
  throw new Error(`Brak eventu ${eventName}.`);
}

/**
 * Powtarza ODCZYT, gdy wezel nie ma jeszcze swiezego stanu.
 *
 * Rozroznienie jest tu wazne: powtarzamy wylacznie odczyty. Transakcji nie
 * wolno powtarzac na slepo - druga proba to druga transakcja i drugie
 * wydane ETH.
 */
async function retryRead<T>(label: string, read: () => Promise<T>, attempts = 8): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.log(`oczekuje na propagacje RPC (${label}, ${attempt}/${attempts - 1})`);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  }
  throw lastError;
}

/**
 * Czeka, az wezel POKAZE oczekiwany stan startu.
 *
 * `launchOf` NIE REWERTUJE dla nieznanego tokena - oddaje same zera. Odczyt
 * wykonany zaraz po transakcji trafia wiec czasem na wezel, ktory jeszcze nie
 * zastosowal bloku, i odpowiada "poprawnie", tylko nieprawde. `retryRead` tego
 * nie lapie, bo NIE MA BLEDU DO ZLAPANIA.
 *
 * Dlatego tu nie powtarzamy przy wyjatku, tylko czekamy na KONKRETNA wartosc.
 */
async function waitForState(pad: any, token: string, expected: bigint, label: string, attempts = 15) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const state = (await pad.launchOf(token))[1] as bigint;
    if (state === expected) return;
    console.log(`czekam na stan ${expected} (${label}): widze ${state}, proba ${attempt}/${attempts}`);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  const state = (await pad.launchOf(token))[1] as bigint;
  throw new Error(`${label}: po ${attempts} probach stan to ${state}, oczekiwano ${expected}.`);
}

async function waitForLaunchWindow(startedAt: bigint) {
  const target = Number(startedAt) + LAUNCH_WINDOW + 1;
  while (true) {
    const block = await ethers.provider.getBlock("latest");
    if (!block) throw new Error("Brak latest block.");
    const remaining = target - block.timestamp;
    if (remaining <= 0) return;
    console.log(`okno launchu: pozostalo okolo ${remaining}s`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, Math.max(2_000, remaining * 1000))));
  }
}

function receiptSummary(receipt: ContractTransactionReceipt) {
  return { hash: receipt.hash, block: receipt.blockNumber, gas: receipt.gasUsed.toString() };
}

async function main() {
  if (process.env.FLOW_CONFIRM !== "tak") {
    throw new Error(
      "To jest pelna sciezka testnetowa i wysyla transakcje. Powtorz z FLOW_CONFIRM=tak."
    );
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== CHAIN_ID) throw new Error(`Oczekiwalem chainId ${CHAIN_ID}, dostalem ${chainId}.`);

  const launchpadAddress = requireAddress("LAUNCHPAD");
  const buyEth = ethers.parseEther(process.env.FLOW_BUY_ETH ?? "5");
  const [signer] = await ethers.getSigners();
  const creator = getAddress(signer.address);
  const balanceBefore = await ethers.provider.getBalance(creator);
  const gasReserve = ethers.parseEther("0.02");
  if (balanceBefore < buyEth + gasReserve) {
    throw new Error(
      `Za malo ETH: potrzeba co najmniej ${ethers.formatEther(buyEth + gasReserve)} ETH ` +
        `(kupno ${ethers.formatEther(buyEth)} + rezerwa na gaz), jest ${ethers.formatEther(balanceBefore)} ETH.`
    );
  }

  const pad = await ethers.getContractAt("CurveLaunchpad", launchpadAddress);
  const vaultAddress = getAddress(await pad.VAULT());
  const hookAddress = getAddress(await pad.HOOK());
  const vault = await ethers.getContractAt("LiquidityVault", vaultAddress);
  const hook = await ethers.getContractAt("B20LaunchHook", hookAddress);
  if (getAddress(await vault.POOL_MANAGER()) !== POOL_MANAGER) throw new Error("Zly PoolManager w vault.");

  const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
  console.log("launchpad", launchpadAddress);
  console.log("creator  ", creator);
  console.log("buy ETH  ", ethers.formatEther(buyEth));

  // ===========================================================================
  // WZNAWIANIE: FLOW_TOKEN pomija start i kupno
  // ===========================================================================
  // Kupno domykajace krzywa kosztuje 3 ETH. Gdy przebieg przerwie sie PO nim -
  // a przerywal sie, bo skrypt czytal stan zaraz po transakcji i dostawal od
  // wezla nieaktualna odpowiedz - powtorzenie calosci znaczyloby wydanie
  // tych 3 ETH DRUGI RAZ. Dlatego da sie wejsc od srodka, z tokenem, ktory
  // juz stoi na progu.
  const resumeToken = process.env.FLOW_TOKEN;
  let token: string;

  if (resumeToken) {
    token = getAddress(resumeToken);
    const state = (await pad.launchOf(token))[1] as bigint;
    console.log("token   ", token, `(wznowienie, stan ${state})`);
    if (state === 0n) throw new Error("Ten launchpad nie zna tego tokena.");
    if (state === 1n) throw new Error("Token jest jeszcze na krzywej - dokoncz kupno albo uruchom flow bez FLOW_TOKEN.");
    if (state === 3n) console.log("token juz po graduacji - przechodze do puli, oplat i wyplat");
  } else {
    const launchTx = await pad.launch("Sepolia Flow", "SFLOW", 0, deadline);
    const launchReceipt = (await launchTx.wait())!;
    const launched = parseEvent(pad, launchReceipt, "Launched");
    token = getAddress(launched.args[0]);
    console.log("token   ", token);
    console.log("launch  ", receiptSummary(launchReceipt));

    // ZNACZNIK CZASU BIERZEMY ZE ZDARZENIA, A NIE Z ODCZYTU - i to jest istota
    // tej poprawki.
    //
    // Byly tu kolejno dwa bledy. Najpierw `launchOf(...)[2]`, czyli ethReserve
    // zamiast startedAt. Potem `[4]`, czyli juz wlasciwe pole - ale odczyt lecial
    // w tej samej sekundzie co transakcja i trafial na wezel bez swiezego stanu.
    // `launchOf` NIE REWERTUJE dla nieznanego tokena, tylko po cichu oddaje same
    // zera, wiec `startedAt` wychodzilo 0. Okno startowe "konczylo sie" w 1970
    // roku, skrypt nie czekal ani sekundy i kupowal w srodku okna, gdzie
    // obowiazuje `WINDOW_ADDR_CAP` (16 mln tokenow). Kupno za 3 ETH bierze
    // 800 mln, wiec odbijalo sie o `WindowCap` - i to widac dopiero jako
    // `execution reverted` przy szacowaniu gazu.
    //
    // Zdarzenie `Launched` niesie `startedAt` i lezy w paragonie, ktory JUZ mamy.
    // Nie ma tam zadnego wyscigu z propagacja, bo nic nie odczytujemy ponownie.
    const startedAt = launched.args.startedAt as bigint;
    if (startedAt === 0n) throw new Error("Zdarzenie Launched nie ma startedAt - sprawdz ABI.");

    await waitForLaunchWindow(startedAt);

    // Odczyt tuz po transakcji trafia czasem na wezel, ktory nie ma jeszcze
    // nowego stanu - i oddaje goly `execution reverted`, wygladajacy jak blad
    // kontraktu. Ta sama pulapka jest juz obsluzona w `deploy.ts`.
    const quote = await retryRead("quoteBuy", () => pad.quoteBuy(token, buyEth));
    const minTokensOut = (quote[0] * 9950n) / 10_000n;
    if (minTokensOut === 0n) throw new Error("Quote kupna zwrocil zero tokenow.");
    const buyDeadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
    const buyTx = await pad.buy(token, minTokensOut, buyDeadline, { value: buyEth });
    const buyReceipt = (await buyTx.wait())!;
    await waitForState(pad, token, 2n, "kupno domykajace krzywa");
    console.log("buy     ", receiptSummary(buyReceipt));
  }

  if (((await pad.launchOf(token))[1] as bigint) === 3n) {
    console.log("graduate  (juz wykonana, pomijam)");
  } else {
  const graduateTx = await pad.graduate(token);
  const graduateReceipt = (await graduateTx.wait())!;
  await waitForState(pad, token, 3n, "graduacja");
  console.log("graduate", receiptSummary(graduateReceipt));
  }

  const key = await pad.poolKeyOf(token);
  if (getAddress(key[0]) !== ethers.ZeroAddress) {
    throw new Error("Ten flow zaklada ETH jako currency0 w pool key.");
  }
  const Probe = await ethers.getContractFactory("RealPoolSwapProbe");
  const probe = await Probe.deploy(POOL_MANAGER);
  await probe.waitForDeployment();
  const probeDeploy = await probe.deploymentTransaction()?.wait();
  const pendingEthBefore = await hook.pendingEth(token);
  const swapTx = await probe.doSwap(
    [key[0], key[1], key[2], key[3], key[4]],
    [true, -SWAP_ETH, MIN_SQRT_PRICE_PLUS_ONE],
    { value: SWAP_ETH }
  );
  const swapReceipt = (await swapTx.wait())!;
  const pendingEthAfter = await hook.pendingEth(token);
  if (pendingEthAfter <= pendingEthBefore) throw new Error("Swap nie naliczyl pendingEth hooka.");
  console.log("swap    ", receiptSummary(swapReceipt));

  const settleTx = await hook.settle(token);
  const settleReceipt = (await settleTx.wait())!;
  console.log("settle  ", receiptSummary(settleReceipt));

  const launchClaimableBefore = await pad.claimable(creator);
  const launchClaimTx = await pad.claim();
  const launchClaimReceipt = (await launchClaimTx.wait())!;
  const hookEthClaimableBefore = await hook.claimableEth(creator);
  const hookTokenClaimableBefore = await hook.claimableToken(token, creator);
  const hookEthClaimTx = await hook.claimEth();
  const hookEthClaimReceipt = (await hookEthClaimTx.wait())!;
  const hookTokenClaimTx = await hook.claimToken(token);
  const hookTokenClaimReceipt = (await hookTokenClaimTx.wait())!;
  console.log("claim   ", receiptSummary(launchClaimReceipt));
  console.log("hook ETH", receiptSummary(hookEthClaimReceipt));
  console.log("hook TOK", receiptSummary(hookTokenClaimReceipt));

  const out = {
    network: "base-sepolia",
    chainId,
    launchpad: launchpadAddress,
    vault: vaultAddress,
    hook: hookAddress,
    poolManager: POOL_MANAGER,
    creator,
    token,
    buyEth: buyEth.toString(),
    quoteTokensOut: quote[0].toString(),
    quoteFee: quote[1].toString(),
    quoteRefund: quote[2].toString(),
    launch: receiptSummary(launchReceipt),
    buy: receiptSummary(buyReceipt),
    graduate: receiptSummary(graduateReceipt),
    probeDeployGas: probeDeploy?.gasUsed.toString() ?? null,
    swap: receiptSummary(swapReceipt),
    settle: receiptSummary(settleReceipt),
    launchClaimableBefore: launchClaimableBefore.toString(),
    launchClaim: receiptSummary(launchClaimReceipt),
    hookEthClaimableBefore: hookEthClaimableBefore.toString(),
    hookTokenClaimableBefore: hookTokenClaimableBefore.toString(),
    hookEthClaim: receiptSummary(hookEthClaimReceipt),
    hookTokenClaim: receiptSummary(hookTokenClaimReceipt),
    completedAt: new Date().toISOString(),
  };
  const outDir = path.join(process.cwd(), "scripts", "output");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "launchpad-base-sepolia-flow.json"), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
