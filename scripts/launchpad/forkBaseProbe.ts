import { artifacts, ethers, network } from "hardhat";
import fs from "fs";
import path from "path";
import {
  AbiCoder,
  Contract,
  ContractTransactionReceipt,
  Interface,
  JsonRpcProvider,
  concat,
  getAddress,
  getCreateAddress,
  id,
  keccak256,
} from "ethers";
import { buildPlan, KNOWN_POOL_MANAGERS } from "./plan";

const BASE_CHAIN_ID = 8453;
const POOL_MANAGER = KNOWN_POOL_MANAGERS[BASE_CHAIN_ID];
const B20_FACTORY = "0xB20f000000000000000000000000000000000000";

// Parametry PRODUKCYJNE z wdrozenia 2026-08-10 (70% tworca, jak PONS) -
// sonda ma cwiczyc dokladnie te liczby, ktore pojda na mainnet.
const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 70n;
const PROTOCOL_SHARE_BPS = 3000n;
const WINDOW = 300;

const MIN_SQRT_PRICE_PLUS_ONE = 4_295_128_740n;

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

function add(checks: Check[], name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name} :: ${detail}`);
}

async function resetToBaseFork(rpcUrl: string) {
  if (network.name !== "hardhat") {
    throw new Error(
      `Ten skrypt musi isc po lokalnym forku Hardhata, a nie po --network ${network.name}. ` +
        "Uruchom: npm run launchpad:fork:base"
    );
  }

  const blockNumber = process.env.BASE_FORK_BLOCK ? Number(process.env.BASE_FORK_BLOCK) : undefined;
  const forking: { jsonRpcUrl: string; blockNumber?: number } = { jsonRpcUrl: rpcUrl };
  if (blockNumber !== undefined) forking.blockNumber = blockNumber;

  await network.provider.send("hardhat_reset", [{ forking }]);
}

async function deployPlainLaunchpad() {
  const [deployer, creator, trader, caller, treasury] = await ethers.getSigners();

  const Plain = await ethers.getContractFactory("PlainTokenFactory");
  const tokenFactory = await Plain.deploy();
  const tokenFactoryRc = await tokenFactory.deploymentTransaction()?.wait();
  await tokenFactory.waitForDeployment();

  const nonce = await deployer.getNonce("pending");
  const plan = await buildPlan({
    poolManager: POOL_MANAGER,
    feeRecipient: treasury.address,
    protocolShareBps: PROTOCOL_SHARE_BPS,
    deployer: deployer.address,
    nonce,
  });

  const Pad = await ethers.getContractFactory("CurveLaunchpad");
  const pad = await Pad.deploy(
    POOL_MANAGER,
    FEE_BPS,
    CREATOR_FEE_BPS,
    treasury.address,
    PROTOCOL_SHARE_BPS,
    await tokenFactory.getAddress(),
    plan.hookSalt
  );
  const padDeployRc = await pad.deploymentTransaction()?.wait();
  await pad.waitForDeployment();

  const vault = await ethers.getContractAt("LiquidityVault", await pad.VAULT());
  const hook = await ethers.getContractAt("B20LaunchHook", await pad.HOOK());

  return {
    deployer,
    creator,
    trader,
    caller,
    treasury,
    tokenFactory,
    tokenFactoryGas: tokenFactoryRc?.gasUsed ?? 0n,
    pad,
    padDeployGas: padDeployRc?.gasUsed ?? 0n,
    vault,
    hook,
    plan,
  };
}

function parseEvent(contract: Contract, receipt: ContractTransactionReceipt, eventName: string) {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === eventName) return parsed;
    } catch {
      // Not this contract.
    }
  }
  throw new Error(`Brak eventu ${eventName}`);
}

function plainKey(key: any) {
  return [key[0], key[1], key[2], key[3], key[4]];
}

async function runRealPoolPath(checks: Check[]) {
  const pmCode = await ethers.provider.getCode(POOL_MANAGER);
  add(
    checks,
    "Base fork ma prawdziwy PoolManager",
    pmCode !== "0x" && (pmCode.length - 2) / 2 === 24_009,
    `${POOL_MANAGER}, ${(pmCode.length - 2) / 2} B kodu`
  );

  const ctx = await deployPlainLaunchpad();
  add(
    checks,
    "hook ma wymagane bity v4",
    (BigInt(await ctx.hook.getAddress()) & ((1n << 14n) - 1n)) === 0x2044n,
    await ctx.hook.getAddress()
  );

  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const launchTx = await ctx.pad.connect(ctx.creator).launch("Fork Hook", "FHOOK", 0n, now + 600);
  const launchRc = (await launchTx.wait())!;
  const launched = parseEvent(ctx.pad, launchRc, "Launched");
  const token = getAddress(launched.args[0]);
  const launch = await ctx.pad.launchOf(token);
  add(
    checks,
    "launch na forku przechodzi bez tworzenia puli",
    launch[1] === 1n,
    `token ${token}, gas ${launchRc.gasUsed.toString()}`
  );

  await network.provider.send("evm_increaseTime", [WINDOW + 1]);
  await network.provider.send("evm_mine");

  const buyTx = await ctx.pad
    .connect(ctx.trader)
    .buy(token, 1n, (await ethers.provider.getBlock("latest"))!.timestamp + 600, {
      value: ethers.parseEther("5"),
    });
  const buyRc = (await buyTx.wait())!;
  add(
    checks,
    "kupno domyka krzywa do Locked",
    (await ctx.pad.launchOf(token))[1] === 2n,
    `gas ${buyRc.gasUsed.toString()}`
  );

  const gradTx = await ctx.pad.connect(ctx.caller).graduate(token);
  const gradRc = (await gradTx.wait())!;
  const key = await ctx.pad.poolKeyOf(token);
  const pos = await ctx.vault.positionOf(token);
  add(
    checks,
    "graduate przechodzi przez prawdziwy initialize/modifyLiquidity",
    (await ctx.pad.launchOf(token))[1] === 3n && pos[1] > 0n,
    `gas ${gradRc.gasUsed.toString()}, liquidity ${pos[1].toString()}`
  );

  add(
    checks,
    "POOLS_SLOT=6 czyta cene prawdziwego PoolManagera",
    pos[0] !== ethers.ZeroHash,
    `poolId ${pos[0]}`
  );

  const tokenContract = await ethers.getContractAt("LaunchToken", token);
  const deadBalance = await tokenContract.balanceOf("0x000000000000000000000000000000000000dEaD");
  add(
    checks,
    "sciezka seed wysyla nadmiar tokena na 0xdEaD",
    deadBalance > 0n,
    `dead balance ${deadBalance.toString()}`
  );

  const Probe = await ethers.getContractFactory("RealPoolSwapProbe");
  const probe = await Probe.deploy(POOL_MANAGER);
  await probe.waitForDeployment();

  const exactIn = ethers.parseEther("0.001");
  const beforePendingToken = await ctx.hook.pendingToken(token);
  const swapInTx = await probe.doSwap(plainKey(key), [true, -exactIn, MIN_SQRT_PRICE_PLUS_ONE], {
    value: exactIn,
  });
  const swapInRc = (await swapInTx.wait())!;
  const afterPendingToken = await ctx.hook.pendingToken(token);
  const inDelta0 = await probe.lastAmount0();
  const inDelta1 = await probe.lastAmount1();
  add(
    checks,
    "afterSwap dodatnia delta hooka domyka exactInput na prawdziwym v4",
    inDelta0 < 0n && inDelta1 > 0n && afterPendingToken > beforePendingToken,
    `delta0 ${inDelta0.toString()}, delta1 ${inDelta1.toString()}, gas ${swapInRc.gasUsed.toString()}`
  );

  const exactOutTokens = ethers.parseEther("1000");
  const beforePendingEth = await ctx.hook.pendingEth(token);
  const swapOutTx = await probe.doSwap(plainKey(key), [true, exactOutTokens, MIN_SQRT_PRICE_PLUS_ONE], {
    value: ethers.parseEther("0.01"),
  });
  const swapOutRc = (await swapOutTx.wait())!;
  const afterPendingEth = await ctx.hook.pendingEth(token);
  const outDelta0 = await probe.lastAmount0();
  const outDelta1 = await probe.lastAmount1();
  add(
    checks,
    "afterSwap dodatnia delta hooka domyka exactOutput na prawdziwym v4",
    outDelta0 < 0n && outDelta1 > 0n && afterPendingEth > beforePendingEth,
    `delta0 ${outDelta0.toString()}, delta1 ${outDelta1.toString()}, gas ${swapOutRc.gasUsed.toString()}`
  );

  return {
    token,
    launchGas: launchRc.gasUsed.toString(),
    buyGas: buyRc.gasUsed.toString(),
    graduateGas: gradRc.gasUsed.toString(),
    swapExactInputGas: swapInRc.gasUsed.toString(),
    swapExactOutputGas: swapOutRc.gasUsed.toString(),
    tokenFactoryGas: ctx.tokenFactoryGas.toString(),
    padDeployGas: ctx.padDeployGas.toString(),
  };
}

async function runB20PrecompileCall(checks: Check[], rpcUrl: string) {
  const provider = new JsonRpcProvider(rpcUrl);
  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== BASE_CHAIN_ID) {
    throw new Error(`BASE_RPC_URL wskazuje chainId ${chainId}, oczekiwalem ${BASE_CHAIN_ID}.`);
  }

  const b20Code = await provider.getCode(B20_FACTORY);
  add(
    checks,
    "B20 factory jest precompile bez kodu EVM",
    b20Code === "0x",
    `${B20_FACTORY}, eth_getCode=${b20Code}`
  );

  const factoryArtifact = await artifacts.readArtifact("B20TokenFactory");
  const factoryIface = new Interface(factoryArtifact.abi);
  const factoryAddress = getAddress("0x0000000000000000000000000000000000b20fac");
  const factorySalt = id(`launchpad-b20-factory-${Date.now()}`);
  const factoryData = factoryIface.encodeFunctionData("createToken", [
    "Factory Probe",
    "FPROBE",
    ethers.parseEther("1000000000"),
    factorySalt,
    getAddress("0x0000000000000000000000000000000000000002"),
    getAddress("0x0000000000000000000000000000000000000003"),
  ]);
  const factoryCall = {
    from: getAddress("0x0000000000000000000000000000000000000001"),
    to: factoryAddress,
    data: factoryData,
  };
  const factoryOverride = {
    [factoryAddress]: {
      code: factoryArtifact.deployedBytecode,
    },
  };

  let factoryGas: bigint | null = null;
  try {
    const rawGas = await provider.send("eth_estimateGas", [factoryCall, "latest", factoryOverride]);
    factoryGas = BigInt(rawGas);
  } catch (error: any) {
    add(checks, "RPC umie estimateGas dla B20TokenFactory override", false, error.shortMessage || error.message);
  }

  const rawFactory = await provider.send("eth_call", [factoryCall, "latest", factoryOverride]);
  const createdByFactory = getAddress(factoryIface.decodeFunctionResult("createToken", rawFactory)[0]);
  add(
    checks,
    "B20TokenFactory.createToken przechodzi na prawdziwym precompile",
    createdByFactory.toLowerCase().startsWith("0xb2"),
    `token ${createdByFactory}`
  );
  if (factoryGas !== null) {
    add(
      checks,
      "realny gaz B20TokenFactory.createToken + postwarunki",
      factoryGas > 0n,
      `${factoryGas.toString()} gas`
    );
  }

  const artifact = await artifacts.readArtifact("B20PrecompileProbe");
  const iface = new Interface(artifact.abi);
  const probeAddress = getAddress("0x0000000000000000000000000000000000b20bee");
  const from = getAddress("0x0000000000000000000000000000000000000001");
  const salt = id(`launchpad-b20-probe-${Date.now()}`);
  const data = iface.encodeFunctionData("run", [salt]);
  const call = { from, to: probeAddress, data };
  const override = {
    [probeAddress]: {
      code: artifact.deployedBytecode,
    },
  };

  let probeGas: bigint | null = null;
  try {
    const rawGas = await provider.send("eth_estimateGas", [call, "latest", override]);
    probeGas = BigInt(rawGas);
  } catch (error: any) {
    add(checks, "RPC umie estimateGas ze state override", false, error.shortMessage || error.message);
  }

  const raw = await provider.send("eth_call", [call, "latest", override]);
  const decoded = iface.decodeFunctionResult("run", raw);
  const token = getAddress(decoded[0]);
  const seizeOk = Boolean(decoded[1]);
  const deadTransferOk = Boolean(decoded[2]);
  const totalSupply = decoded[3] as bigint;
  const deadBalance = decoded[4] as bigint;

  add(
    checks,
    "abi.encode(struct) dla params przechodzi na prawdziwym B20",
    totalSupply === ethers.parseEther("1000000000"),
    `token ${token}, totalSupply ${totalSupply.toString()}`
  );
  add(
    checks,
    "SEIZE_ROLE() na ASSET nie istnieje",
    !seizeOk,
    `staticcall success=${seizeOk}`
  );
  add(
    checks,
    "B20 ASSET transferuje na 0xdEaD",
    deadTransferOk && deadBalance === 1n,
    `transfer=${deadTransferOk}, deadBalance=${deadBalance.toString()}`
  );
  if (probeGas !== null) {
    add(
      checks,
      "realny gaz sondy B20 create + transfer DEAD",
      probeGas > 0n,
      `${probeGas.toString()} gas`
    );
  }

  const fullProbeArtifact = await artifacts.readArtifact("FullB20LaunchGasProbe");
  const fullProbeIface = new Interface(fullProbeArtifact.abi);
  const fullProbeAddress = getAddress("0x0000000000000000000000000000000000b20f11");
  // State override dostarcza kod do pustego konta, ktore ma nonce 0. Pierwsze
  // dwa CREATE sondy sa wiec pod nonce 0 i 1 (w odroznieniu od kontraktu
  // wdrozonego normalna transakcja, ktorego nonce po stworzeniu wynosi 1).
  const fullFactoryAddress = getCreateAddress({ from: fullProbeAddress, nonce: 0 });
  const fullLaunchpadAddress = getCreateAddress({ from: fullProbeAddress, nonce: 1 });
  const fullPlan = await buildPlan({
    poolManager: POOL_MANAGER,
    feeRecipient: getAddress("0x0000000000000000000000000000000000000FEE"),
    protocolShareBps: PROTOCOL_SHARE_BPS,
    deployer: fullProbeAddress,
    nonce: 1,
  });
  const latestBaseBlock = await provider.getBlock("latest");
  if (!latestBaseBlock) throw new Error("Brak latest block na Base RPC.");
  const previousBaseBlock = await provider.getBlock(latestBaseBlock.number - 1);
  if (!previousBaseBlock) throw new Error("Brak poprzedniego bloku na Base RPC.");
  const fullLaunchId = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint256", "uint256", "bytes32"],
      [fullLaunchpadAddress, fullProbeAddress, 0n, BASE_CHAIN_ID, previousBaseBlock.hash]
    )
  );
  const directFactoryCall = {
    from: fullLaunchpadAddress,
    to: fullFactoryAddress,
    data: factoryIface.encodeFunctionData("createToken", [
      "Full B20 Gas",
      "FB20",
      ethers.parseEther("1000000000"),
      fullLaunchId,
      fullLaunchpadAddress,
      fullProbeAddress,
    ]),
  };
  const directFactoryOverride = {
    [fullFactoryAddress]: {
      code: factoryArtifact.deployedBytecode,
    },
  };
  let directFactoryToken = "";
  try {
    const directFactoryRaw = await provider.send("eth_call", [directFactoryCall, "latest", directFactoryOverride]);
    directFactoryToken = getAddress(factoryIface.decodeFunctionResult("createToken", directFactoryRaw)[0]);
  } catch (error: any) {
    add(checks, "B20 fabryka przyjmuje parametry pelnego launchu", false, error.shortMessage || error.message);
  }
  if (directFactoryToken) {
    add(
      checks,
      "B20 fabryka przyjmuje parametry pelnego launchu",
      directFactoryToken.toLowerCase().startsWith("0xb2"),
      `token ${directFactoryToken}`
    );
  }
  const launchpadArtifact = await artifacts.readArtifact("CurveLaunchpad");
  const launchpadConstructorArgs = AbiCoder.defaultAbiCoder().encode(
    ["address", "uint16", "uint16", "address", "uint16", "address", "bytes32"],
    [
      POOL_MANAGER,
      FEE_BPS,
      CREATOR_FEE_BPS,
      getAddress("0x0000000000000000000000000000000000000FEE"),
      PROTOCOL_SHARE_BPS,
      fullFactoryAddress,
      fullPlan.hookSalt,
    ]
  );
  const fullCall = {
    from,
    to: fullProbeAddress,
    data: fullProbeIface.encodeFunctionData("run", [
      factoryArtifact.bytecode,
      concat([launchpadArtifact.bytecode, launchpadConstructorArgs]),
    ]),
  };
  const fullOverride = {
    [fullProbeAddress]: {
      code: fullProbeArtifact.deployedBytecode,
    },
  };
  const rawFull = await provider.send("eth_call", [fullCall, "latest", fullOverride]);
  const fullDecoded = fullProbeIface.decodeFunctionResult("run", rawFull);
  const fullToken = getAddress(fullDecoded[2]);
  const fullLaunchGas = fullDecoded[5] as bigint;
  add(
    checks,
    "realny gaz CurveLaunchpad.launch z B20",
    fullLaunchGas > 0n && getAddress(fullDecoded[0]) === fullFactoryAddress && getAddress(fullDecoded[1]) === fullLaunchpadAddress,
    `${fullLaunchGas.toString()} gas, token ${fullToken}`
  );

  return {
    tokenFromFactory: createdByFactory,
    factoryGasEstimate: factoryGas?.toString() ?? null,
    token,
    totalSupply: totalSupply.toString(),
    deadBalance: deadBalance.toString(),
    seizeRoleStaticcallSucceeded: seizeOk,
    deadTransferSucceeded: deadTransferOk,
    probeGasEstimate: probeGas?.toString() ?? null,
    fullLaunchGasMeasured: fullLaunchGas.toString(),
    fullLaunchToken: fullToken,
  };
}

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  const checks: Check[] = [];

  console.log("BASE RPC", rpcUrl.replace(/([?&](?:key|api_key|apikey)=)[^&]+/gi, "$1***"));
  await resetToBaseFork(rpcUrl);

  const forkBlock = await ethers.provider.getBlockNumber();
  console.log("fork block", forkBlock);
  console.log("");

  const pool = await runRealPoolPath(checks);
  console.log("");
  const b20 = await runB20PrecompileCall(checks, rpcUrl);

  const failed = checks.filter((c) => !c.ok);
  const result = {
    ranAt: new Date().toISOString(),
    rpc: rpcUrl.replace(/([?&](?:key|api_key|apikey)=)[^&]+/gi, "$1***"),
    forkBlock,
    pool,
    b20,
    checks,
  };

  const outDir = path.join(process.cwd(), "scripts", "output");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "launchpad-base-fork-probe.json");
  fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);

  console.log("");
  console.log(`Zapisano ${outFile}`);
  if (failed.length !== 0) {
    throw new Error(`${failed.length} sprawdzen odpadlo - patrz lista powyzej.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
