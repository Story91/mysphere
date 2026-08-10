import { ethers, network } from "hardhat";
import { getAddress } from "ethers";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { buildPlan, readCommonEnv, resolvePoolManager, HOOK_ALL_MASK, HOOK_REQUIRED_FLAGS } from "./plan";

/**
 * WDROZENIE LAUNCHPADA - jedna transakcja, cztery kontrakty, zero setterow.
 *
 * ===========================================================================
 * CO SIE TU DZIEJE I W JAKIEJ KOLEJNOSCI
 * ===========================================================================
 *   1. fabryka tokena            - osobna transakcja, bo jej adres wchodzi do
 *                                  konstruktora launchpada
 *   2. plan adresow + kopanie    - offline, bez dotykania sieci
 *   3. launchpad                 - JEDNA transakcja, ktora w swoim konstruktorze
 *                                  tworzy vault, a vault tworzy hooka
 *   4. weryfikacja odczytami     - kazde wiazanie sprawdzone z zewnatrz
 *
 * Krok 3 jest niepodzielny z premedytacja: wiazanie launchpad <-> vault <-> hook
 * powstaje w jednej transakcji, wiec nie istnieje blok, w ktorym ktorakolwiek
 * strona wskazuje na adres przewidziany zamiast istniejacego. Zadnego settera
 * nie ma i nie bedzie.
 *
 * ===========================================================================
 * DLACZEGO NONCE JEST TU NAJWAZNIEJSZA LICZBA
 * ===========================================================================
 * Salt hooka jest kopany pod adres vaulta, a ten wynika z adresu launchpada,
 * a ten z (wdrazajacy, nonce). KAZDA transakcja wyslana z tego adresu miedzy
 * kopaniem a wdrozeniem uniewaznia salt. Dlatego ten skrypt kopie i wdraza
 * w jednym przebiegu, a nonce czyta jako `pending`, nie `latest`.
 *
 * ===========================================================================
 * UZYCIE
 * ===========================================================================
 *   FEE_RECIPIENT=0x... npx hardhat run scripts/launchpad/deploy.ts --network base
 *
 * Zmienne srodowiskowe:
 *   FEE_RECIPIENT       (wymagane) odbiorca oplat protokolu
 *   PROTOCOL_SHARE_BPS  udzial protokolu w oplatach LP i hooka (domyslnie 6000)
 *   FEE_BPS             oplata krzywej w bps (domyslnie 100 = 1%, sufit 100)
 *   CREATOR_FEE_BPS     czesc FEE_BPS dla tworcy (domyslnie 60 = 0.6%,
 *                       najwyzej 60% z FEE_BPS - reszta nalezy do protokolu)
 *   TOKEN_FACTORY       adres istniejacej fabryki; bez tego wdrazamy nowa
 *   FACTORY_KIND        `b20` (domyslnie na Base) albo `plain` (poza Base)
 *   POOL_MANAGER        adres v4 PoolManager; wymagany poza sprawdzonymi sieciami
 *   CONFIRM             musi byc `tak` przy wdrozeniu na siec inna niz lokalna
 */

/** Sieci, na ktorych `B20TokenFactory` ma sens - precompile B20 zyje tylko na Base. */
const BASE_CHAIN_IDS = new Set([8453, 84532, 84531]);

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
  const creatorFeeBps = BigInt(process.env.CREATOR_FEE_BPS ?? "60");

  // Sufity powtorzone z kontraktu. Nie zastepuja tamtych - odbijaja pomylke
  // ZANIM kosztuje ona gaz i zanim zaczniemy kopac.
  if (feeBps > 100n) throw new Error(`FEE_BPS=${feeBps} przekracza MAX_FEE_BPS=100.`);
  // Podloga protokolu z kontraktu: tworca najwyzej 60% oplaty.
  if (creatorFeeBps * 10_000n > feeBps * 6_000n) {
    throw new Error(`CREATOR_FEE_BPS=${creatorFeeBps} przekracza 60% z FEE_BPS=${feeBps}.`);
  }
  if (creatorFeeBps > feeBps) throw new Error(`CREATOR_FEE_BPS=${creatorFeeBps} > FEE_BPS=${feeBps}.`);

  const [signer] = await ethers.getSigners();
  const deployer = getAddress(signer.address);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = network.name === "hardhat" || network.name === "localhost";

  const { address: poolManager, source: pmSource } = resolvePoolManager(chainId);

  // ------------------------------------------------------------------------
  // PoolManager sprawdzany PRZED czymkolwiek innym
  // ------------------------------------------------------------------------
  // Konstruktor vaulta i tak to sprawdzi (`PoolManagerHasNoCode`), ale tam
  // kosztuje to gaz calego wdrozenia. Tutaj kosztuje jedno `eth_getCode`.
  const pmCode = await ethers.provider.getCode(poolManager);
  if (pmCode === "0x") {
    throw new Error(
      `Pod ${poolManager} nie ma kodu na tej sieci (chainId ${chainId}, zrodlo: ${pmSource}).\n` +
        `To NIE jest PoolManager. Sprawdz adres na https://docs.uniswap.org/contracts/v4/deployments`
    );
  }

  console.log("siec              ", `${network.name} (chainId ${chainId})`);
  console.log("wdrazajacy        ", deployer);
  console.log("saldo             ", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH");
  console.log("PoolManager       ", poolManager, `[${pmSource}, ${(pmCode.length - 2) / 2} B kodu]`);
  console.log("feeRecipient      ", feeRecipient);
  console.log("feeBps            ", feeBps.toString());
  console.log("creatorFeeBps     ", creatorFeeBps.toString());
  console.log("protocolShareBps  ", protocolShareBps.toString());
  console.log("");

  if (!isLocal && process.env.CONFIRM !== "tak") {
    throw new Error(
      "To jest wdrozenie na prawdziwa siec i jest NIEODWRACALNE - nie ma settera, " +
        "pauzy ani migracji.\nPrzeczytaj powyzsze wartosci i powtorz z CONFIRM=tak."
    );
  }

  // ------------------------------------------------------------------------
  // 1. FABRYKA TOKENA - jedyna rzecz, ktora rozni sieci
  // ------------------------------------------------------------------------
  let tokenFactory = process.env.TOKEN_FACTORY;
  if (tokenFactory) {
    tokenFactory = getAddress(tokenFactory);
    if ((await ethers.provider.getCode(tokenFactory)) === "0x") {
      throw new Error(`TOKEN_FACTORY=${tokenFactory} nie ma kodu na tej sieci.`);
    }
    console.log("fabryka tokena     (istniejaca)", tokenFactory);
  } else {
    const kind = process.env.FACTORY_KIND ?? (BASE_CHAIN_IDS.has(chainId) ? "b20" : "plain");
    const name = kind === "b20" ? "B20TokenFactory" : "PlainTokenFactory";
    if (kind === "b20" && !BASE_CHAIN_IDS.has(chainId)) {
      throw new Error(
        `FACTORY_KIND=b20 na chainId ${chainId}, gdzie nie ma precompile B20 (0xB20f...). ` +
          `Poza Base uzyj FACTORY_KIND=plain.`
      );
    }
    const factory = await (await ethers.getContractFactory(name)).deploy();
    await factory.waitForDeployment();
    tokenFactory = getAddress(await factory.getAddress());
    console.log(`fabryka tokena     (${name})`, tokenFactory);
  }
  console.log("");

  // ------------------------------------------------------------------------
  // 2. PLAN ADRESOW - offline, tuz przed wyslaniem
  // ------------------------------------------------------------------------
  // `getNonce('pending')`, a NIE `getTransactionCount(latest)`. Ten drugi nie
  // liczy transakcji juz wyslanych, a jeszcze niezablokowanych - a wlasnie taka
  // jest wdrozenie fabryki wyzej. Objawiloby sie to `BadHookAddress`.
  const nonce = await signer.getNonce("pending");
  const plan = await buildPlan({ poolManager, feeRecipient, protocolShareBps, deployer, nonce });

  console.log("nonce             ", nonce);
  console.log("launchpad bedzie  ", plan.launchpad);
  console.log("vault bedzie      ", plan.vault);
  console.log("hook bedzie       ", plan.hook, `(salt ${plan.hookSalt}, ${plan.attempts} prob)`);
  console.log("");

  // ------------------------------------------------------------------------
  // 3. LAUNCHPAD - jedna transakcja, trzy kontrakty
  // ------------------------------------------------------------------------
  const Launchpad = await ethers.getContractFactory("CurveLaunchpad");
  const launchpad = await Launchpad.deploy(
    poolManager,
    feeBps,
    creatorFeeBps,
    feeRecipient,
    protocolShareBps,
    tokenFactory,
    plan.hookSalt
  );
  await launchpad.waitForDeployment();
  const launchpadAddress = getAddress(await launchpad.getAddress());
  // BLOK WDROZENIA. Bez niego front skanuje zdarzenia od bloku POPRZEDNIEGO
  // wdrozenia i pokazuje pustke albo cudze tokeny - a to nie daje bledu, tylko
  // wyglada jak "nikt jeszcze nic nie wystartowal".
  const deployBlock = (await launchpad.deploymentTransaction()?.wait())?.blockNumber ?? 0;
  await retryRpc("launchpad code", async () => {
    const code = await ethers.provider.getCode(launchpadAddress);
    if (code === "0x") throw new Error(`Brak kodu launchpada pod ${launchpadAddress}`);
    return code;
  });

  // ------------------------------------------------------------------------
  // 4. WERYFIKACJA - kazde wiazanie sprawdzone ODCZYTEM, nie zalozeniem
  // ------------------------------------------------------------------------
  // Skrypt, ktory konczy sie "wdrozono" i nie sprawdza niczego, przenosi caly
  // ciezar dowodu na czlowieka patrzacego na explorer. Ponizsze odczyty sa
  // tanie i odpadaja glosno.
  const vaultAddress = getAddress(await retryRpc("launchpad.VAULT", () => launchpad.VAULT()));
  const hookAddress = getAddress(await retryRpc("launchpad.HOOK", () => launchpad.HOOK()));
  const vault = await ethers.getContractAt("LiquidityVault", vaultAddress);
  const hook = await ethers.getContractAt("B20LaunchHook", hookAddress);

  const checks: [string, boolean, string][] = [
    ["launchpad pod przewidzianym adresem", launchpadAddress === plan.launchpad, plan.launchpad],
    ["vault pod przewidzianym adresem", vaultAddress === plan.vault, plan.vault],
    ["hook pod przewidzianym adresem", hookAddress === plan.hook, plan.hook],
    ["vault.LAUNCHPAD() == launchpad", getAddress(await vault.LAUNCHPAD()) === launchpadAddress, launchpadAddress],
    ["hook.VAULT() == vault", getAddress(await hook.VAULT()) === vaultAddress, vaultAddress],
    ["vault.HOOK() == hook", getAddress(await vault.HOOK()) === hookAddress, hookAddress],
    ["vault.POOL_MANAGER() == podany", getAddress(await vault.POOL_MANAGER()) === poolManager, poolManager],
    ["hook.POOL_MANAGER() == podany", getAddress(await hook.POOL_MANAGER()) === poolManager, poolManager],
    ["bity uprawnien w adresie hooka", (BigInt(hookAddress) & HOOK_ALL_MASK) === HOOK_REQUIRED_FLAGS, `0x${HOOK_REQUIRED_FLAGS.toString(16)}`],
    ["hook.hasValidHookAddress()", await hook.hasValidHookAddress(), "true"],
    ["launchpad.TOKEN_FACTORY() == fabryka", getAddress(await launchpad.TOKEN_FACTORY()) === tokenFactory, tokenFactory],
    ["launchpad.FEE_BPS()", (await launchpad.FEE_BPS()) === feeBps, feeBps.toString()],
    ["launchpad.CREATOR_FEE_BPS()", (await launchpad.CREATOR_FEE_BPS()) === creatorFeeBps, creatorFeeBps.toString()],
    ["hook.PROTOCOL_SHARE_BPS() == vault", (await hook.PROTOCOL_SHARE_BPS()) === (await vault.PROTOCOL_SHARE_BPS()), protocolShareBps.toString()],
    ["hook.FEE_RECIPIENT() == vault", getAddress(await hook.FEE_RECIPIENT()) === getAddress(await vault.FEE_RECIPIENT()), feeRecipient],
  ];

  console.log("WERYFIKACJA");
  let failed = 0;
  for (const [label, ok, expected] of checks) {
    console.log(`  ${ok ? "ok  " : "BLAD"}  ${label.padEnd(40)} ${expected}`);
    if (!ok) failed++;
  }
  console.log("");

  if (failed > 0) {
    throw new Error(
      `${failed} sprawdzen odpadlo. Kontrakty SA JUZ WDROZONE i nie da sie ich cofnac - ` +
        `nie uzywaj tego wdrozenia i nie wpisuj tych adresow nigdzie.`
    );
  }

  console.log("WDROZONE");
  console.log(JSON.stringify(
    {
      chainId,
      network: network.name,
      deployer,
      poolManager,
      tokenFactory,
      launchpad: launchpadAddress,
      vault: vaultAddress,
      hook: hookAddress,
      hookSalt: plan.hookSalt,
      feeBps: feeBps.toString(),
      creatorFeeBps: creatorFeeBps.toString(),
      protocolShareBps: protocolShareBps.toString(),
      feeRecipient,
      deployBlock,
      deployedAt: new Date().toISOString(),
    },
    null,
    2
  ));

  // ZAPIS DO PLIKU, A NIE TYLKO NA EKRAN.
  //
  // Pierwsza wersja tego skryptu wypisywala JSON wylacznie na konsole, a plik
  // `scripts/output/launchpad-base-sepolia.json` byl uzupelniany RECZNIE. Po
  // drugim wdrozeniu na dysku zostaly wiec STARE adresy, a `launchpad:env`
  // czyta wlasnie ten plik - czyli wpisalby do frontu poprzedni launchpad.
  // Blad byl cichy w kazdym miejscu: deploy sie udal, plik istnial, adresy
  // wygladaly poprawnie i wskazywaly na dzialajacy kontrakt. Tyle ze nie ten.
  const outputPath = join(process.cwd(), "scripts", "output", `launchpad-${network.name}.json`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        chainId,
        network: network.name,
        deployer,
        poolManager,
        tokenFactory,
        launchpad: launchpadAddress,
        vault: vaultAddress,
        hook: hookAddress,
        hookSalt: plan.hookSalt,
        feeBps: feeBps.toString(),
        creatorFeeBps: creatorFeeBps.toString(),
        protocolShareBps: protocolShareBps.toString(),
        feeRecipient,
        deployBlock,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "
",
    { encoding: "utf8" }
  );
  console.log(`Zapisano ${outputPath}`);
  console.log("");
  console.log("Nastepny krok: `npx hardhat verify --network <siec> <adres> <argumenty>`");
  console.log("Vault i hook powstaly wewnetrznie, wiec weryfikuje sie je osobno,");
  console.log("z ich wlasnymi argumentami konstruktora (patrz wypis wyzej).");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
