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
  // Przy wznowieniu (`FLOW_TOKEN`) kupna JUZ NIE MA - token stoi na progu albo
  // po graduacji. Zadanie wtedy pelnej kwoty zamykalo droge dokladnie temu,
  // po co wznawianie powstalo: dokonczeniu przebiegu po tym, jak 3 ETH
  // zostalo juz wydane.
  const wymagane = process.env.FLOW_TOKEN ? gasReserve : buyEth + gasReserve;
  if (balanceBefore < wymagane) {
    throw new Error(
      `Za malo ETH: potrzeba co najmniej ${ethers.formatEther(wymagane)} ETH` +
        (process.env.FLOW_TOKEN ? " (sam gaz, wznowienie)" : ` (kupno ${ethers.formatEther(buyEth)} + rezerwa na gaz)`) +
        `, jest ${ethers.formatEther(balanceBefore)} ETH.`
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
  // Te powstaja WYLACZNIE w pelnym przebiegu. Przy wznawianiu zostaja `null`,
  // a podsumowanie ma to jawnie pokazac zamiast wywracac sie na `undefined`.
  let launchReceipt: ContractTransactionReceipt | null = null;
  let buyReceipt: ContractTransactionReceipt | null = null;
  let graduateReceipt: ContractTransactionReceipt | null = null;
  let quote: readonly [bigint, bigint, bigint] | null = null;

  if (resumeToken) {
    token = getAddress(resumeToken);
    const state = (await pad.launchOf(token))[1] as bigint;
    console.log("token   ", token, `(wznowienie, stan ${state})`);
    if (state === 0n) throw new Error("Ten launchpad nie zna tego tokena.");
    if (state === 1n) throw new Error("Token jest jeszcze na krzywej - dokoncz kupno albo uruchom flow bez FLOW_TOKEN.");
    if (state === 3n) console.log("token juz po graduacji - przechodze do puli, oplat i wyplat");
  } else {
    const launchTx = await pad.launch("Sepolia Flow", "SFLOW", 0, deadline);
    launchReceipt = (await launchTx.wait())!;
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
    quote = await retryRead("quoteBuy", () => pad.quoteBuy(token, buyEth));
    const minTokensOut = (quote[0] * 9950n) / 10_000n;
    if (minTokensOut === 0n) throw new Error("Quote kupna zwrocil zero tokenow.");
    const buyDeadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
    const buyTx = await pad.buy(token, minTokensOut, buyDeadline, { value: buyEth });
    buyReceipt = (await buyTx.wait())!;
    await waitForState(pad, token, 2n, "kupno domykajace krzywa");
    console.log("buy     ", receiptSummary(buyReceipt));
  }

  if (((await pad.launchOf(token))[1] as bigint) === 3n) {
    console.log("graduate  (juz wykonana, pomijam)");
  } else {
  const graduateTx = await pad.graduate(token);
  graduateReceipt = (await graduateTx.wait())!;
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
  // Ktora waluta niesie oplate, zalezy od KIERUNKU wymiany. Hook bierze ja z
  // waluty NIEPODANEJ: przy exactInput ETH->token podana jest ETH, wiec oplata
  // schodzi z TOKENA. Skrypt sprawdzal `pendingEth` i oglaszal porazke przy
  // poprawnie dzialajacym hooku - dokladnie ta sama pomylka, ktora opisuje
  // naglowek testu `B20LaunchHook`.
  const pendingEthBefore = await hook.pendingEth(token);
  const pendingTokenBefore = await hook.pendingToken(token);
  const swapTx = await probe.doSwap(
    [key[0], key[1], key[2], key[3], key[4]],
    [true, -SWAP_ETH, MIN_SQRT_PRICE_PLUS_ONE],
    { value: SWAP_ETH }
  );
  const swapReceipt = (await swapTx.wait())!;
  // Kwote oplaty bierzemy ZE ZDARZENIA W PARAGONIE, nie z odczytu po
  // transakcji. Odczyt trafia na wezel, ktory moze jeszcze nie miec nowego
  // bloku, i oddaje wartosc SPRZED wymiany - a wtedy roznica wychodzi zero i
  // skrypt oglasza porazke przy hooku, ktory zadzialal. Ta sama pulapka
  // wywrocila juz `startedAt` i sprawdzenie stanu po kupnie.
  const hookFeeLogs = swapReceipt.logs
    .map((log) => {
      try {
        return hook.interface.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        return null;
      }
    })
    .filter((parsed): parsed is NonNullable<typeof parsed> => parsed?.name === "HookFeeTaken");

  if (hookFeeLogs.length === 0) {
    throw new Error("Swap przeszedl, ale hook nie wyemitowal HookFeeTaken - nie wzial oplaty.");
  }
  for (const parsed of hookFeeLogs) {
    const isEth = parsed.args.isEth as boolean;
    const amount = parsed.args.amount as bigint;
    console.log(`oplata hooka: ${ethers.formatEther(amount)} ${isEth ? "ETH" : "tokena"} (ze zdarzenia)`);
  }
  void pendingEthBefore;
  void pendingTokenBefore;
  console.log("swap    ", receiptSummary(swapReceipt));

  const settleTx = await hook.settle(token);
  const settleReceipt = (await settleTx.wait())!;
  console.log("settle  ", receiptSummary(settleReceipt));

  // Tak samo jak przy hooku: odbieramy tylko wtedy, gdy JEST co odebrac.
  // Wyplata to pull, wiec po pierwszym odbiorze saldo jest zerowe i `claim`
  // rewertuje `NothingToClaim`. Przy wznawianym przebiegu to normalny stan,
  // a nie awaria.
  const launchClaimableBefore = (await pad.claimable(creator)) as bigint;
  let launchClaimReceipt = null;
  if (launchClaimableBefore > 0n) {
    launchClaimReceipt = (await (await pad.claim()).wait())!;
  }
  // ODBIERAMY TYLKO TO, CO NAPRAWDE JEST.
  //
  // Hook zbiera oplate w walucie NIEPODANEJ w wymianie, wiec po wymianie
  // ETH->token ma tokeny i ZERO ETH. `claimEth` rewertuje wtedy `NothingToClaim`
  // - i slusznie, bo odbieranie zera nie jest operacja. Skrypt wolal obie
  // wyplaty bezwarunkowo i wywracal caly przebieg na ostatnim kroku, mimo ze
  // wszystko wczesniej przeszlo.
  const hookEthClaimableBefore = (await hook.claimableEth(creator)) as bigint;
  const hookTokenClaimableBefore = (await hook.claimableToken(token, creator)) as bigint;

  let hookEthClaimReceipt = null;
  if (hookEthClaimableBefore > 0n) {
    hookEthClaimReceipt = (await (await hook.claimEth()).wait())!;
  }
  let hookTokenClaimReceipt = null;
  if (hookTokenClaimableBefore > 0n) {
    hookTokenClaimReceipt = (await (await hook.claimToken(token)).wait())!;
  }

  console.log(
    "claim   ",
    launchClaimReceipt
      ? `${receiptSummary(launchClaimReceipt)} | odebrano ${ethers.formatEther(launchClaimableBefore)} ETH`
      : "(zero do odebrania - juz wyplacone)"
  );
  console.log(
    "hook ETH",
    hookEthClaimReceipt ? receiptSummary(hookEthClaimReceipt) : "(zero do odebrania - wymiana szla ETH->token)"
  );
  console.log(
    "hook TOK",
    hookTokenClaimReceipt
      ? `${receiptSummary(hookTokenClaimReceipt)} | odebrano ${ethers.formatEther(hookTokenClaimableBefore)} tokena`
      : "(zero do odebrania)"
  );

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
    resumed: Boolean(resumeToken),
    quoteTokensOut: quote ? quote[0].toString() : null,
    quoteFee: quote ? quote[1].toString() : null,
    quoteRefund: quote ? quote[2].toString() : null,
    launch: launchReceipt ? receiptSummary(launchReceipt) : null,
    buy: buyReceipt ? receiptSummary(buyReceipt) : null,
    graduate: graduateReceipt ? receiptSummary(graduateReceipt) : null,
    probeDeployGas: probeDeploy?.gasUsed.toString() ?? null,
    swap: receiptSummary(swapReceipt),
    settle: receiptSummary(settleReceipt),
    launchClaimableBefore: launchClaimableBefore.toString(),
    launchClaim: launchClaimReceipt ? receiptSummary(launchClaimReceipt) : null,
    hookEthClaimableBefore: hookEthClaimableBefore.toString(),
    hookTokenClaimableBefore: hookTokenClaimableBefore.toString(),
    hookEthClaim: hookEthClaimReceipt ? receiptSummary(hookEthClaimReceipt) : null,
    hookTokenClaim: hookTokenClaimReceipt ? receiptSummary(hookTokenClaimReceipt) : null,
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
