import { ethers, network } from "hardhat";
import { concat, getAddress, getCreate2Address, getCreateAddress, keccak256, toBeHex, zeroPadValue } from "ethers";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { readCommonEnv, resolvePoolManager, HOOK_ALL_MASK, HOOK_REQUIRED_FLAGS } from "./plan";
import { verifyPoolManagerCode } from "./verifyPoolManager";

/**
 * WDROZENIE LAUNCHPADA Q - krzywa z tokenem ERC-20 po drugiej stronie pary.
 * Specyfikacja: docs/LAUNCHPAD-QUOTE-ERC20.md.
 *
 * Jedno uruchomienie = jedno aktywo (QUOTE). Ten sam przebieg co
 * `deploy.ts` (plan adresow offline, kopanie salta, jedna transakcja, odczyty
 * kazdego wiazania), z trzema roznicami:
 *
 * 1. QUOTE jest wymagany i sprawdzany ODCZYTEM: kod pod adresem, decimals 6..18,
 *    symbol do wypisu. R_VIRT_QUOTE podaje sie w CALYCH jednostkach QUOTE
 *    ("2500" przy USDC = zbiorka 10 000 USDC), a skrypt mnozy przez 10^decimals.
 * 2. Hook Q ma QUOTE w konstruktorze, wiec salt kopiemy pod JEGO kod tworzacy.
 * 3. Fabryke tokena najlepiej wziac istniejaca (TOKEN_FACTORY) - ta sama, ktorej
 *    uzywa launchpad ETH na tej sieci. Bez zmiennej wdrazamy nowa.
 *
 * Lista kontrolna aktywa (rebase, pauza, blokady emitenta) - sekcja 2.5 specyfikacji.
 * Tego skrypt NIE sprawdzi i nie udaje, ze sprawdza.
 *
 *   QUOTE=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 R_VIRT_QUOTE=2500 \
 *   FEE_RECIPIENT=0x... TOKEN_FACTORY=0x... CONFIRM=tak \
 *   npx hardhat run scripts/launchpad/deployQuote.ts --network base
 */

const BASE_CHAIN_IDS = new Set([8453, 84532, 84531]);
const MAX_ATTEMPTS = 5_000_000;

async function retryRpc<T>(label: string, read: () => Promise<T>, attempts = 8): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.log(`oczekuje na propagacje RPC (${label}, ${attempt}/${attempts - 1})`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }
  throw lastError;
}

async function main() {
  const { feeRecipient, protocolShareBps } = readCommonEnv();
  const feeBps = BigInt(process.env.FEE_BPS ?? "100");
  const creatorFeeBps = BigInt(process.env.CREATOR_FEE_BPS ?? "70");
  if (feeBps > 100n) throw new Error(`FEE_BPS=${feeBps} przekracza MAX_FEE_BPS=100.`);
  if (creatorFeeBps > feeBps || creatorFeeBps * 10_000n > feeBps * 7_000n) {
    throw new Error(`CREATOR_FEE_BPS=${creatorFeeBps} przekracza 70% z FEE_BPS=${feeBps}.`);
  }

  if (!process.env.QUOTE) throw new Error("QUOTE jest wymagany - adres tokena ERC-20 po drugiej stronie pary.");
  if (!process.env.R_VIRT_QUOTE) {
    throw new Error("R_VIRT_QUOTE jest wymagany - skala krzywej w CALYCH jednostkach QUOTE (prog zbiorki = 4x).");
  }
  const quote = getAddress(process.env.QUOTE);

  const [signer] = await ethers.getSigners();
  const deployer = getAddress(signer.address);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = network.name === "hardhat" || network.name === "localhost";
  const { address: poolManager, source: pmSource } = resolvePoolManager(chainId);

  const pmCode = await ethers.provider.getCode(poolManager);
  if (pmCode === "0x") throw new Error(`Pod ${poolManager} nie ma kodu (chainId ${chainId}, ${pmSource}).`);
  const pmCodeHash = verifyPoolManagerCode(chainId, pmCode);

  // QUOTE sprawdzany odczytem, zanim cokolwiek kosztuje gaz.
  if ((await ethers.provider.getCode(quote)) === "0x") throw new Error(`QUOTE=${quote} nie ma kodu na tej sieci.`);
  const erc20 = new ethers.Contract(
    quote,
    ["function decimals() view returns (uint8)", "function symbol() view returns (string)", "function name() view returns (string)"],
    ethers.provider
  );
  const decimals = Number(await erc20.decimals());
  if (decimals < 6 || decimals > 18) throw new Error(`QUOTE ma ${decimals} miejsc - kontrakt przyjmuje 6..18.`);
  const symbol: string = await erc20.symbol().catch(() => "QUOTE");
  const name: string = await erc20.name().catch(() => "?");
  const rVirt = ethers.parseUnits(process.env.R_VIRT_QUOTE, decimals);
  if (rVirt < 75n) throw new Error(`R_VIRT_QUOTE=${process.env.R_VIRT_QUOTE} jest ponizej progu kontraktu (75 jednostek bazowych).`);
  const fmt = (v: bigint) => `${ethers.formatUnits(v, decimals)} ${symbol}`;

  console.log("siec              ", `${network.name} (chainId ${chainId})`);
  console.log("wdrazajacy        ", deployer);
  console.log("saldo             ", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH (gaz)");
  console.log("PoolManager       ", poolManager, `[${pmSource}]`);
  console.log("PoolManager hash  ", pmCodeHash);
  console.log("QUOTE             ", quote, `${name} (${symbol}), ${decimals} miejsc`);
  console.log("feeRecipient      ", feeRecipient);
  console.log("feeBps / tworca   ", `${feeBps} / ${creatorFeeBps}`);
  console.log("protocolShareBps  ", protocolShareBps.toString());
  console.log("R_VIRT            ", fmt(rVirt));
  console.log("prog zbiorki      ", fmt(rVirt * 4n));
  console.log("mcap na starcie   ", fmt(rVirt));
  console.log("mcap po graduacji ", fmt(rVirt * 25n));
  console.log("sufit jednego kupna", fmt(rVirt * 132n));
  console.log("");
  console.log("LISTA KONTROLNA AKTYWA (docs/LAUNCHPAD-QUOTE-ERC20.md 2.5) - sprawdz RECZNIE:");
  console.log("  - salda nie zmieniaja sie bez transferu (brak rebase)");
  console.log("  - brak oplaty od transferu (kontrakt to odrzuci, ale lepiej wiedziec przed)");
  console.log("  - pauza / blokady emitenta - zrozumiane i opisane w UI");
  console.log("");

  if (!isLocal && process.env.CONFIRM !== "tak") {
    throw new Error("Wdrozenie jest NIEODWRACALNE - brak settera, pauzy i migracji. Przeczytaj powyzsze i powtorz z CONFIRM=tak.");
  }

  // Fabryka tokena - istniejaca albo nowa.
  let tokenFactory = process.env.TOKEN_FACTORY;
  if (tokenFactory) {
    tokenFactory = getAddress(tokenFactory);
    if ((await ethers.provider.getCode(tokenFactory)) === "0x") throw new Error(`TOKEN_FACTORY=${tokenFactory} nie ma kodu.`);
    console.log("fabryka tokena     (istniejaca)", tokenFactory);
  } else {
    const factoryName = BASE_CHAIN_IDS.has(chainId) ? "B20TokenFactory" : "PlainTokenFactory";
    const factory = await (await ethers.getContractFactory(factoryName)).deploy();
    await factory.waitForDeployment();
    tokenFactory = getAddress(await factory.getAddress());
    console.log(`fabryka tokena     (${factoryName})`, tokenFactory);
  }

  // Plan adresow offline. Vault to PIERWSZY kontrakt launchpada - nonce 1 (EIP-161).
  const nonce = await signer.getNonce("pending");
  const launchpadAddr = getCreateAddress({ from: deployer, nonce });
  const vaultAddr = getCreateAddress({ from: launchpadAddr, nonce: 1 });
  const Hook = await ethers.getContractFactory("QuoteLaunchHook");
  // Kolejnosc i typy MUSZA zgadzac sie z `QuoteLaunchHook.constructor`.
  const initCodeHash = keccak256(
    concat([
      Hook.bytecode,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "uint16", "address"],
        [poolManager, feeRecipient, protocolShareBps, quote]
      ),
    ])
  );
  let hookSalt = "";
  let hookAddr = "";
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const salt = zeroPadValue(toBeHex(i), 32);
    const candidate = getCreate2Address(vaultAddr, salt, initCodeHash);
    if ((BigInt(candidate) & HOOK_ALL_MASK) === HOOK_REQUIRED_FLAGS) {
      hookSalt = salt;
      hookAddr = candidate;
      break;
    }
  }
  if (!hookSalt) throw new Error("Brak salta hooka - sprawdz HOOK_REQUIRED_FLAGS.");
  console.log("nonce             ", nonce);
  console.log("launchpad bedzie  ", launchpadAddr);
  console.log("vault bedzie      ", vaultAddr);
  console.log("hook bedzie       ", hookAddr, `(salt ${hookSalt})`);
  console.log("");

  const Pad = await ethers.getContractFactory("QuoteCurveLaunchpad");
  const pad = await Pad.deploy(poolManager, quote, feeBps, creatorFeeBps, feeRecipient, protocolShareBps, tokenFactory, hookSalt, rVirt);
  await pad.waitForDeployment();
  const padAddress = getAddress(await pad.getAddress());
  const deployBlock = (await pad.deploymentTransaction()?.wait())?.blockNumber ?? 0;
  await retryRpc("launchpad code", async () => {
    const code = await ethers.provider.getCode(padAddress);
    if (code === "0x") throw new Error("brak kodu");
    return code;
  });

  const vaultAddress = getAddress(await retryRpc("VAULT", () => pad.VAULT()));
  const hookAddress = getAddress(await retryRpc("HOOK", () => pad.HOOK()));
  const vault = await ethers.getContractAt("QuoteLiquidityVault", vaultAddress);
  const hook = await ethers.getContractAt("QuoteLaunchHook", hookAddress);

  const checks: [string, boolean][] = [
    ["launchpad pod przewidzianym adresem", padAddress === launchpadAddr],
    ["vault pod przewidzianym adresem", vaultAddress === vaultAddr],
    ["hook pod przewidzianym adresem", hookAddress === hookAddr],
    ["pad.QUOTE() == QUOTE", getAddress(await pad.QUOTE()) === quote],
    ["vault.QUOTE() == QUOTE", getAddress(await vault.QUOTE()) === quote],
    ["hook.QUOTE() == QUOTE", getAddress(await hook.QUOTE()) === quote],
    ["pad.QUOTE_DECIMALS()", Number(await pad.QUOTE_DECIMALS()) === decimals],
    ["pad.R_VIRT()", (await pad.R_VIRT()) === rVirt],
    ["vault.LAUNCHPAD() == launchpad", getAddress(await vault.LAUNCHPAD()) === padAddress],
    ["hook.VAULT() == vault", getAddress(await hook.VAULT()) === vaultAddress],
    ["vault/hook POOL_MANAGER", getAddress(await vault.POOL_MANAGER()) === poolManager && getAddress(await hook.POOL_MANAGER()) === poolManager],
    ["bity uprawnien hooka", (BigInt(hookAddress) & HOOK_ALL_MASK) === HOOK_REQUIRED_FLAGS && (await hook.hasValidHookAddress())],
    ["TOKEN_FACTORY", getAddress(await pad.TOKEN_FACTORY()) === tokenFactory],
    ["FEE_BPS / CREATOR_FEE_BPS", (await pad.FEE_BPS()) === feeBps && (await pad.CREATOR_FEE_BPS()) === creatorFeeBps],
    ["podzial oplat hook == vault", (await hook.PROTOCOL_SHARE_BPS()) === (await vault.PROTOCOL_SHARE_BPS()) && getAddress(await hook.FEE_RECIPIENT()) === getAddress(await vault.FEE_RECIPIENT())],
  ];
  console.log("WERYFIKACJA");
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "ok  " : "BLAD"}  ${label}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    throw new Error(`${failed} sprawdzen odpadlo. Kontrakty SA wdrozone - nie uzywaj tych adresow.`);
  }

  const record = {
    kind: "quote",
    chainId,
    network: network.name,
    deployer,
    poolManager,
    poolManagerCodeHash: pmCodeHash,
    quote,
    quoteSymbol: symbol,
    quoteDecimals: decimals,
    tokenFactory,
    launchpad: padAddress,
    vault: vaultAddress,
    hook: hookAddress,
    hookSalt,
    feeBps: feeBps.toString(),
    creatorFeeBps: creatorFeeBps.toString(),
    protocolShareBps: protocolShareBps.toString(),
    rVirt: rVirt.toString(),
    curveTarget: (rVirt * 4n).toString(),
    feeRecipient,
    deployBlock,
    deployedAt: new Date().toISOString(),
  };
  const outputPath = join(process.cwd(), "scripts", "output", `launchpad-q-${symbol.toLowerCase()}-${network.name}.json`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(record, null, 2) + "\n", { encoding: "utf8" });
  console.log("");
  console.log("WDROZONE", JSON.stringify(record, null, 2));
  console.log(`Zapisano ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
