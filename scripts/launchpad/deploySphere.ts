import { ethers, network } from "hardhat";
import { getAddress } from "ethers";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";

/**
 * WDROZENIE PERYFERII SPHERE (faza 0 speca docs/SPHERE-TOKENOMIKA.md).
 *
 * ===========================================================================
 * CO SIE TU DZIEJE I W JAKIEJ KOLEJNOSCI
 * ===========================================================================
 *   1. SphereRewards(CONSUMER)                 - skarbonka nagrod
 *   2. SphereTokenVesting(BENEFICIARY, ...)    - lock tokenow skarbca (#11a)
 *   3. przewidzenie adresu escrow z nonce      - offline
 *   4. vanity salt dla PRZEWIDZIANEGO escrow   - offline (albo z env)
 *   5. SphereCreatorEscrow(...caly config...)  - jedna transakcja, config
 *                                                zapieta w konstruktorze
 *   6. weryfikacja odczytami                   - kazde wiazanie z zewnatrz
 *   7. (LAUNCH=tak) escrow.launch{dev-buy}     - START SPHERE, nieodwracalny
 *
 * KOLEJNOSC JEST TWARDA: adres escrow wchodzi do receiverAccounts JEGO
 * WLASNEJ konfiguracji (odbiorca fee z krzywej) i do preimage vanity, wiec
 * musi byc znany PRZED deployem - stad przewidywanie z nonce, jak przy hooku
 * w deploy.ts. KAZDA transakcja z portfela wdrazajacego miedzy krokiem 3 a 5
 * uniewaznia przewidywanie - skrypt robi wszystko w jednym przebiegu.
 *
 * ===========================================================================
 * DECYZJE WLASCICIELA ZASZYTE JAKO DOMYSLNE (2026-08-30/31)
 * ===========================================================================
 *   #11a tokeny -> vesting (klif 30 dni, 12 mies. liniowo)
 *   #11b split ETH release() 50/50 pot/ops
 *   #12  CONSUMER = Safe 0x83E2...4142F (1/1; adres staly, progi mozna
 *        dolozyc pozniej bez zmian on-chain)
 *   Gate 0: wszystkie cztery role wskazuja TEN SAM Safe.
 *
 * ===========================================================================
 * UZYCIE
 * ===========================================================================
 * Proba generalna na forku Base (nic nie wychodzi w swiat):
 *   FORK_REHEARSAL=tak npx hardhat run scripts/launchpad/deploySphere.ts
 *
 * Wdrozenie kontraktow na Base (BEZ launchu):
 *   CONFIRM=tak npx hardhat run scripts/launchpad/deploySphere.ts --network base
 *
 * Wdrozenie + LAUNCH SPHERE (nieodwracalne!):
 *   CONFIRM=tak LAUNCH=tak DEV_BUY_ETH=0.05 npx hardhat run scripts/launchpad/deploySphere.ts --network base
 *
 * Zmienne srodowiskowe:
 *   SAFE            wspolny adres rol (domyslnie Safe 0x83E2...4142F)
 *   CONSUMER / BENEFICIARY / POT / OPS   nadpisania per rola (domyslnie SAFE)
 *   LAUNCHPAD       adres pada (domyslnie wdrozenie Base 0xCF54...)
 *   VANITY_PREFIX   wzorzec hex do wymielenia (np. ba5ed) - tylko realny Base
 *   VANITY_SALT     gotowy salt (hex32); bez obu: salt pseudolosowy
 *   DEV_BUY_ETH     wielkosc dev-buya w ETH (domyslnie 0.05)
 *   WINDOW_CAP      cap okna w tokenach (domyslnie: szacowany out dev-buya +1%)
 *   VESTING_START   unix start zegara vestingu (domyslnie teraz + 1h)
 *   VESTING_CLIFF / VESTING_DURATION   sekundy (domyslnie 30 dni / 365 dni)
 *   LAUNCH          `tak` = po wdrozeniu odpal escrow.launch (NIEODWRACALNE)
 *   CONFIRM         musi byc `tak` na sieci innej niz lokalna
 *   FORK_REHEARSAL  `tak` = lokalny fork Base + atrapa precompile'a + launch
 */

const DEFAULT_SAFE = "0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F";
const DEFAULT_PAD = "0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D";
const B20_PRECOMPILE = "0xB20f000000000000000000000000000000000000";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// Parametry launchu SPHERE - sekcja 4 speca (mroza sie w escrow na zawsze).
const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 70n;
const BUYBACK_BPS = 5000n;
const ETH_POT_BPS = 5000;
const RECEIVER_SHARES_BPS = [6000, 4000];
const NAME = "Sphere";
const SYMBOL = "SPHERE";
const METADATA_URI = process.env.METADATA_URI ?? "";

// Krzywa Base (bajtkod wdrozony: R_VIRT stale 0.75, T0 1e9, fee z gory).
const R_VIRT = ethers.parseEther("0.75");
const T0 = ethers.parseEther("1000000000");

/** Szacunek tokensOut dev-buya - ta sama arytmetyka co _quoteBuy (bez refundu). */
function estimateDevBuyOut(valueIn: bigint): bigint {
  const fee = (valueIn * FEE_BPS + 9_999n) / 10_000n;
  const eIn = valueIn - fee;
  const k = R_VIRT * T0;
  return T0 - k / (R_VIRT + eIn);
}

/**
 * Mielenie vanity OFFLINE dla PRZEWIDZIANEGO escrow - lancuszek 1:1
 * z app/utils/b20/launchpadVanity.ts (launchId -> effectiveSalt -> ogon
 * precompile'a). Wzorzec siedzi na POCZATKU 9-bajtowego ogona, tuz za pasem
 * zer i bajtem wariantu. Formula precompile'a obowiazuje TYLKO na realnym
 * Base - na forku/rehearsal precompile jest atrapa CREATE2 i wzorzec nie ma
 * sensu. Tempo ~22k prob/s (1 watek): 4 znaki sekundy, 5 ~1 min, 6 ~13 min.
 */
function mineVanity(
  padAddr: string,
  factoryAddr: string,
  creator: string,
  chainId: number,
  prefix: string
): `0x${string}` {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const target = prefix.toLowerCase();
  if (![...target].every((c) => "0123456789abcdef".includes(c))) {
    throw new Error(`VANITY_PREFIX '${prefix}' zawiera znaki spoza hex 0-9a-f.`);
  }
  const expected = Math.pow(16, target.length);
  console.log(`miele wzorzec '${target}' (srednio ~${expected.toLocaleString()} prob)...`);
  for (let i = 0n; ; i++) {
    const salt = ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}`;
    const launchId = ethers.keccak256(
      abi.encode(["address", "address", "bytes32", "uint256"], [padAddr, creator, salt, chainId])
    );
    const effectiveSalt = ethers.keccak256(
      ethers.solidityPacked(["address", "bytes32"], [padAddr, launchId])
    );
    const tail = ethers.keccak256(abi.encode(["address", "bytes32"], [factoryAddr, effectiveSalt])).slice(2, 20);
    if (tail.startsWith(target)) {
      console.log(`znaleziono po ${i} probach`);
      return salt;
    }
    if (i % 500_000n === 0n && i > 0n) console.log(`...${i} prob`);
  }
}

async function main() {
  const rehearsal = process.env.FORK_REHEARSAL === "tak";
  const doLaunch = rehearsal || process.env.LAUNCH === "tak";

  if (rehearsal) {
    console.log(`proba generalna: fork ${BASE_RPC}`);
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: BASE_RPC } }],
    });
    // Jedyna atrapa: precompile B20 (fork nie pobierze jego kodu).
    const Mock = await ethers.getContractFactory("MockB20Factory");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();
    await network.provider.send("hardhat_setCode", [
      B20_PRECOMPILE,
      await ethers.provider.getCode(await mock.getAddress()),
    ]);
  } else if (network.name !== "hardhat" && network.name !== "localhost") {
    if (process.env.CONFIRM !== "tak") {
      throw new Error(`Wdrozenie na ${network.name} wymaga CONFIRM=tak.`);
    }
  }

  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const safe = getAddress(process.env.SAFE ?? DEFAULT_SAFE);
  const consumer = getAddress(process.env.CONSUMER ?? safe);
  const beneficiary = getAddress(process.env.BENEFICIARY ?? safe);
  const pot = getAddress(process.env.POT ?? safe);
  const ops = getAddress(process.env.OPS ?? safe);
  const padAddress = getAddress(process.env.LAUNCHPAD ?? DEFAULT_PAD);

  const devBuy = ethers.parseEther(process.env.DEV_BUY_ETH ?? "0.05");
  const estimatedOut = estimateDevBuyOut(devBuy);
  // +1% marginesu na kierunki zaokraglen krzywej. Konsekwencja nazwana w spec
  // (#8/#9): cap per adres w oknie ~= wielkosc dev-buya - snajper dostaje tyle
  // samo na adres przez pierwsze 300 s.
  const windowCap = process.env.WINDOW_CAP
    ? BigInt(process.env.WINDOW_CAP)
    : (estimatedOut * 101n) / 100n;

  const nowTs = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
  const vestingStart = BigInt(process.env.VESTING_START ?? nowTs + 3600n);
  const vestingCliff = BigInt(process.env.VESTING_CLIFF ?? 30n * 24n * 3600n);
  const vestingDuration = BigInt(process.env.VESTING_DURATION ?? 365n * 24n * 3600n);

  const pad = await ethers.getContractAt("CurveLaunchpad", padAddress);
  console.log(`siec: ${network.name} (chainId ${chainId})`);
  console.log(`wdrazajacy: ${deployer.address}`);
  console.log(`launchpad:  ${padAddress} (VAULT: ${await pad.VAULT()})`);
  console.log(`Safe rol:   ${safe}`);

  // ---- 1. SphereRewards ----------------------------------------------------
  const Rewards = await ethers.getContractFactory("SphereRewards");
  const rewards = await Rewards.deploy(consumer);
  await rewards.waitForDeployment();
  console.log(`SphereRewards:       ${await rewards.getAddress()} (CONSUMER ${consumer})`);

  // ---- 2. SphereTokenVesting -----------------------------------------------
  const Vesting = await ethers.getContractFactory("SphereTokenVesting");
  const vesting = await Vesting.deploy(beneficiary, vestingStart, vestingCliff, vestingDuration);
  await vesting.waitForDeployment();
  console.log(
    `SphereTokenVesting:  ${await vesting.getAddress()} (start ${vestingStart}, klif ${vestingCliff}s, czas ${vestingDuration}s)`
  );

  // ---- 3. przewidzenie adresu escrow ---------------------------------------
  // `pending`, nie `latest` - patrz deploy.ts, ta sama pulapka nonce.
  const nonce = await deployer.getNonce("pending");
  const predictedEscrow = ethers.getCreateAddress({ from: deployer.address, nonce });

  // ---- 4. adres vanity dla PRZEWIDZIANEGO escrow ---------------------------
  let vanitySalt: `0x${string}`;
  if (process.env.VANITY_SALT) {
    vanitySalt = process.env.VANITY_SALT as `0x${string}`;
  } else if (process.env.VANITY_PREFIX) {
    if (rehearsal || chainId !== 8453) {
      throw new Error(
        "VANITY_PREFIX dziala tylko na realnym Base (chainId 8453) - na forku " +
          "precompile jest atrapa i formula adresu sie nie zgadza. Na probe uzyj VANITY_SALT albo nic."
      );
    }
    const factoryAddr = await pad.TOKEN_FACTORY();
    vanitySalt = mineVanity(padAddress, factoryAddr, predictedEscrow, chainId, process.env.VANITY_PREFIX);
  } else {
    vanitySalt = ethers.keccak256(
      ethers.toUtf8Bytes(`sphere-${chainId}-${nowTs}-${deployer.address}`)
    ) as `0x${string}`;
  }
  const predictedToken = await pad.predictVanityToken(predictedEscrow, vanitySalt);
  console.log(`escrow (przewidziany): ${predictedEscrow}`);
  console.log(`token  (przewidziany): ${predictedToken} (salt ${vanitySalt})`);

  // ---- 5. SphereCreatorEscrow ----------------------------------------------
  const Escrow = await ethers.getContractFactory("SphereCreatorEscrow");
  const escrow = await Escrow.deploy(padAddress, deployer.address, pot, ops, ETH_POT_BPS, await vesting.getAddress(), {
    vanitySalt,
    name: NAME,
    symbol: SYMBOL,
    feeBps: FEE_BPS,
    creatorFeeBps: CREATOR_FEE_BPS,
    buybackBps: BUYBACK_BPS,
    windowCap,
    receiverAccounts: [await rewards.getAddress(), predictedEscrow],
    receiverSharesBps: RECEIVER_SHARES_BPS,
    metadataURI: METADATA_URI,
  });
  await escrow.waitForDeployment();

  if ((await escrow.getAddress()).toLowerCase() !== predictedEscrow.toLowerCase()) {
    throw new Error(
      `Adres escrow rozjechal sie z przewidywaniem: ${await escrow.getAddress()} != ${predictedEscrow}. ` +
        `Ktos wyslal transakcje z portfela wdrazajacego w trakcie - NIE odpalac launchu, wdrozyc od nowa.`
    );
  }
  console.log(`SphereCreatorEscrow: ${await escrow.getAddress()}`);

  // ---- 6. weryfikacja odczytami --------------------------------------------
  if ((await rewards.CONSUMER()) !== consumer) throw new Error("rewards.CONSUMER nie zgadza sie");
  if ((await vesting.BENEFICIARY()) !== beneficiary) throw new Error("vesting.BENEFICIARY nie zgadza sie");
  if ((await escrow.LAUNCHPAD()) !== padAddress) throw new Error("escrow.LAUNCHPAD nie zgadza sie");
  if ((await escrow.TOKEN_TARGET()) !== (await vesting.getAddress())) throw new Error("escrow.TOKEN_TARGET nie zgadza sie");
  if (await escrow.launched()) throw new Error("escrow juz odpalony?");
  console.log("weryfikacja wiazan: OK");

  // ---- 7. LAUNCH (nieodwracalny) -------------------------------------------
  let token: string | null = null;
  if (doLaunch) {
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp) + 600n;
    const tx = await escrow.launch(1n, deadline, { value: devBuy });
    const rc = await tx.wait();
    token = await escrow.sphereToken();
    console.log(`LAUNCH: token ${token} (gaz ${rc!.gasUsed})`);
    if (token!.toLowerCase() !== predictedToken.toLowerCase() && !rehearsal) {
      throw new Error(`token != przewidziany (${token} vs ${predictedToken})`);
    }
    const l = await pad.launchOf(token!);
    if (l[0] !== (await escrow.getAddress())) throw new Error("creator != escrow");
    console.log(`creator == escrow: OK; dev-buy w escrow, rezerwa ${ethers.formatEther(l[2])} ETH`);

    if (rehearsal) {
      // Dymek sanity: obcy zakup nabija odbiorcow i Safe.
      const [, buyer] = await ethers.getSigners();
      await network.provider.send("evm_increaseTime", [301]);
      await network.provider.send("evm_mine");
      await (
        await pad.connect(buyer).buy(token!, 1n, deadline + 1200n, { value: ethers.parseEther("1") })
      ).wait();
      const claimRewards = await pad.claimable(await rewards.getAddress());
      const claimEscrow = await pad.claimable(await escrow.getAddress());
      console.log(
        `proba: claimable rewards=${ethers.formatEther(claimRewards)} escrow=${ethers.formatEther(claimEscrow)}`
      );
      if (claimRewards === 0n || claimEscrow === 0n) throw new Error("split odbiorcow nie dziala");
    }
  } else {
    console.log("LAUNCH pominiety (ustaw LAUNCH=tak, zeby odpalic - NIEODWRACALNE).");
  }

  // ---- 8. zapis wdrozenia ---------------------------------------------------
  const record = {
    chainId,
    network: network.name,
    rehearsal,
    deployer: deployer.address,
    launchpad: padAddress,
    safe,
    sphereRewards: await rewards.getAddress(),
    sphereTokenVesting: await vesting.getAddress(),
    sphereCreatorEscrow: await escrow.getAddress(),
    consumer,
    beneficiary,
    pot,
    ops,
    ethPotBps: ETH_POT_BPS,
    buybackBps: BUYBACK_BPS.toString(),
    receiverSharesBps: RECEIVER_SHARES_BPS,
    vanitySalt,
    predictedToken,
    token,
    devBuyEth: ethers.formatEther(devBuy),
    windowCap: windowCap.toString(),
    vesting: { start: vestingStart.toString(), cliff: vestingCliff.toString(), duration: vestingDuration.toString() },
    deployedAt: new Date().toISOString(),
  };
  const outPath = join(__dirname, "..", "output", `sphere-${rehearsal ? "rehearsal" : network.name}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");
  console.log(`zapisano: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
