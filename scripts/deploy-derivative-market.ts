import { ethers, network } from "hardhat";
import { getAddress } from "ethers";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";

/**
 * WDROZENIE MODULU DERYWATOW - dwie transakcje i dwa kroki po nich.
 *
 * ===========================================================================
 * KOLEJNOSC I DLACZEGO WLASNIE TAKA
 * ===========================================================================
 *   1. PriceOracleRegistry  - osobna transakcja, bo jej adres wchodzi do
 *                             konstruktora fabryki.
 *   2. DerivativeMarketFactory - JEDNA transakcja, ktora w swoim konstruktorze
 *                             tworzy InsuranceFund i FeeDistributor. Oba musza
 *                             znac adres fabryki jako `immutable`, a fabryka
 *                             ich - kolejnosc "fabryka pierwsza, reszta z jej
 *                             konstruktora" zamyka to bez ani jednego settera
 *                             i bez przewidywania adresow z nonce.
 *   3. oracle.setInsuranceFund(fundusz) - JEDNORAZOWO, z adresu GOVERNANCE.
 *                             Rejestr powstal przed funduszem, wiec inaczej sie
 *                             nie da. Bez tego kroku przepadle kaucje zgloszen
 *                             ida do skarbca zamiast do funduszu.
 *   4. ZASILENIE FUNDUSZU     - przelew USDC + `notifyDeposit`. Fundusz pusty
 *                             przy niezerowym OI oznacza GLOBALNA pauze nowych
 *                             pozycji. To jest zachowanie zamierzone (fail
 *                             closed), ale swiezy deploy bez zasilenia przyjmie
 *                             dokladnie jedna pozycje i zamknie sie na kolejne.
 *
 * Kroki 3 i 4 robi ten skrypt, jesli wdrazajacy JEST adresem GOVERNANCE
 * (typowo na testnecie). Gdy governance to multisig, skrypt wypisuje calldata
 * do wykonania i konczy sie ostrzezeniem - nie udaje, ze wdrozenie jest gotowe.
 *
 * ===========================================================================
 * DECIMALS - JEDYNA PULAPKA TEJ SIECI
 * ===========================================================================
 * Na Arc jednostka NATYWNA (gaz) to USDC z 18 miejscami, a token ERC-20 USDC
 * pod 0x3600...0000 ma 6. Kolateral modulu to WYLACZNIE ten drugi. Skrypt
 * odczytuje `decimals()` z podanego adresu i odpada, gdy nie jest szescioma -
 * pomylka o bilion nie ma prawa przejsc dalej niz jedno `eth_call`.
 *
 * ===========================================================================
 * UZYCIE
 * ===========================================================================
 *   CONFIRM=tak GOVERNANCE=0x... TREASURY=0x... USDC=0x... \
 *     npx hardhat run scripts/deploy-derivative-market.ts --network arcTestnet
 *
 * Zmienne srodowiskowe:
 *   USDC        adres ERC-20 USDC; domyslny dla znanych sieci (patrz nizej)
 *   GOVERNANCE  multisig rozstrzygajacy spory cenowe (domyslnie wdrazajacy)
 *   TREASURY    odbiorca czesci oplat i resztek scietych kaucji
 *   SEED_USDC   ile USDC wlozyc do funduszu na start (domyslnie 0 = nie zasilaj)
 *   MIN_RATIO_BPS  prog pokrycia OI przez fundusz (domyslnie zostaje 100 = 1%)
 *   CONFIRM     musi byc `tak` przy wdrozeniu na siec inna niz lokalna
 */

/** ERC-20 USDC na znanych sieciach. Arc: kanoniczny adres z docs.arc.io. */
const KNOWN_USDC: Record<number, string> = {
  5042002: "0x3600000000000000000000000000000000000000",
  // Arc mainnet: ten sam kanoniczny adres (sprawdzone eth_call 16.09.2026, 6 miejsc).
  5042: "0x3600000000000000000000000000000000000000",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

async function main() {
  const [signer] = await ethers.getSigners();
  const deployer = getAddress(signer.address);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = network.name === "hardhat" || network.name === "localhost";

  const usdcAddress = getAddress(process.env.USDC ?? KNOWN_USDC[chainId] ?? "");
  const governance = getAddress(process.env.GOVERNANCE ?? deployer);
  const treasury = getAddress(process.env.TREASURY ?? deployer);
  const seedUsdc = BigInt(process.env.SEED_USDC ?? "0");
  const minRatioBps = process.env.MIN_RATIO_BPS ? Number(process.env.MIN_RATIO_BPS) : undefined;

  if ((await ethers.provider.getCode(usdcAddress)) === "0x") {
    throw new Error(`Pod ${usdcAddress} nie ma kodu na chainId ${chainId}. To NIE jest USDC.`);
  }
  // Surowe ABI zamiast artefaktu - `decimals()` nie nalezy do IERC20, a modul
  // nie importuje IERC20Metadata, wiec taki artefakt moze tu po prostu nie byc.
  const usdcMeta = new ethers.Contract(usdcAddress, ["function decimals() view returns (uint8)"], signer);
  const decimals = Number(await usdcMeta.decimals());
  if (decimals !== 6) {
    throw new Error(
      `USDC pod ${usdcAddress} ma ${decimals} miejsc, a caly modul zaklada 6. ` +
        `Na Arc jednostka natywna (18 miejsc) to NIE jest ten token.`
    );
  }

  // Jednostka natywna SIECI - na Arc te same liczby znacza dolary, wiec
  // podpisanie ich "ETH" myli dokladnie tam, gdzie boli najbardziej.
  const unit = chainId === 5042002 || chainId === 5042 ? "USDC" : "ETH";

  console.log("siec              ", `${network.name} (chainId ${chainId})`);
  console.log("wdrazajacy        ", deployer);
  console.log("saldo             ", ethers.formatEther(await ethers.provider.getBalance(deployer)), unit);
  console.log("USDC (ERC-20)     ", usdcAddress, `[${decimals} miejsc]`);
  console.log("governance        ", governance, governance === deployer ? "(= wdrazajacy)" : "(multisig)");
  console.log("treasury          ", treasury);
  console.log("zasilenie funduszu", seedUsdc === 0n ? "BRAK" : `${ethers.formatUnits(seedUsdc, 6)} USDC`);
  console.log("");

  if (seedUsdc === 0n) {
    console.log(
      "UWAGA: fundusz startuje pusty. Po pierwszej otwartej pozycji OI systemu\n" +
        "       przestanie byc pokryte i modul ZATRZYMA nowe pozycje na wszystkich\n" +
        "       rynkach, dopoki ktos nie zasili funduszu (SEED_USDC).\n"
    );
  }

  if (!isLocal && process.env.CONFIRM !== "tak") {
    throw new Error(
      "To jest wdrozenie na prawdziwa siec i jest NIEODWRACALNE - kontrakty nie maja " +
        "setterow ani migracji.\nPrzeczytaj powyzsze wartosci i powtorz z CONFIRM=tak."
    );
  }

  // ------------------------------------------------------------------------
  // 1. REJESTR CEN
  // ------------------------------------------------------------------------
  const Oracle = await ethers.getContractFactory("PriceOracleRegistry");
  const oracle = await Oracle.deploy(usdcAddress, governance, treasury);
  await oracle.waitForDeployment();
  const oracleAddress = getAddress(await oracle.getAddress());
  const deployBlock = (await oracle.deploymentTransaction()?.wait())?.blockNumber ?? 0;
  console.log("PriceOracleRegistry", oracleAddress);

  // ------------------------------------------------------------------------
  // 2. FABRYKA - w jednej transakcji tworzy fundusz i dystrybutor oplat
  // ------------------------------------------------------------------------
  const Factory = await ethers.getContractFactory("DerivativeMarketFactory");
  const factory = await Factory.deploy(usdcAddress, oracleAddress, treasury, governance);
  await factory.waitForDeployment();
  const factoryAddress = getAddress(await factory.getAddress());
  const insuranceAddress = getAddress(await factory.INSURANCE());
  const feesAddress = getAddress(await factory.FEES());
  console.log("Factory            ", factoryAddress);
  console.log("InsuranceFund      ", insuranceAddress);
  console.log("FeeDistributor     ", feesAddress);
  console.log("");

  // ------------------------------------------------------------------------
  // 3. PODPIECIE FUNDUSZU DO REJESTRU
  // ------------------------------------------------------------------------
  const insurance = await ethers.getContractAt("InsuranceFund", insuranceAddress);
  const pending: string[] = [];

  if (governance === deployer) {
    await (await oracle.setInsuranceFund(insuranceAddress)).wait();
    console.log("ok    oracle.setInsuranceFund");
  } else {
    pending.push(
      `oracle.setInsuranceFund(${insuranceAddress})\n    do: ${oracleAddress}\n    data: ` +
        oracle.interface.encodeFunctionData("setInsuranceFund", [insuranceAddress])
    );
  }

  if (minRatioBps !== undefined) {
    if (governance === deployer) {
      await (await insurance.setMinRatioBps(minRatioBps)).wait();
      console.log("ok    insurance.setMinRatioBps", minRatioBps);
    } else {
      pending.push(
        `insurance.setMinRatioBps(${minRatioBps})\n    do: ${insuranceAddress}\n    data: ` +
          insurance.interface.encodeFunctionData("setMinRatioBps", [minRatioBps])
      );
    }
  }

  // ------------------------------------------------------------------------
  // 4. ZASILENIE FUNDUSZU - przelew, potem `notifyDeposit`
  // ------------------------------------------------------------------------
  if (seedUsdc > 0n) {
    const erc20 = await ethers.getContractAt("IERC20", usdcAddress);
    await (await erc20.transfer(insuranceAddress, seedUsdc)).wait();
    await (await insurance.notifyDeposit(seedUsdc)).wait();
    console.log("ok    fundusz zasilony", ethers.formatUnits(seedUsdc, 6), "USDC");
  }
  console.log("");

  // ------------------------------------------------------------------------
  // 5. WERYFIKACJA - kazde wiazanie sprawdzone ODCZYTEM, nie zalozeniem
  // ------------------------------------------------------------------------
  const fees = await ethers.getContractAt("FeeDistributor", feesAddress);
  const checks: [string, boolean, string][] = [
    ["factory.ORACLE() == rejestr", getAddress(await factory.ORACLE()) === oracleAddress, oracleAddress],
    ["factory.USDC() == USDC", getAddress(await factory.USDC()) === usdcAddress, usdcAddress],
    ["insurance.MARKETS() == fabryka", getAddress(await insurance.MARKETS()) === factoryAddress, factoryAddress],
    ["insurance.GOVERNANCE() == governance", getAddress(await insurance.GOVERNANCE()) === governance, governance],
    ["fees.FACTORY() == fabryka", getAddress(await fees.FACTORY()) === factoryAddress, factoryAddress],
    ["fees.INSURANCE() == fundusz", getAddress(await fees.INSURANCE()) === insuranceAddress, insuranceAddress],
    ["fees.TREASURY() == skarbiec", getAddress(await fees.TREASURY()) === treasury, treasury],
    ["oracle.GOVERNANCE() == governance", getAddress(await oracle.GOVERNANCE()) === governance, governance],
    ["insurance.balance() == zasilenie", (await insurance.balance()) === seedUsdc, seedUsdc.toString()],
  ];
  if (governance === deployer) {
    checks.push([
      "oracle.insuranceFund() == fundusz",
      getAddress(await oracle.insuranceFund()) === insuranceAddress,
      insuranceAddress,
    ]);
  }

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

  const record = {
    chainId,
    network: network.name,
    deployer,
    governance,
    treasury,
    usdc: usdcAddress,
    oracle: oracleAddress,
    factory: factoryAddress,
    insuranceFund: insuranceAddress,
    feeDistributor: feesAddress,
    deployBlock,
    insuranceSeedUsdc: seedUsdc.toString(),
    deployedAt: new Date().toISOString(),
  };

  console.log("WDROZONE");
  console.log(JSON.stringify(record, null, 2));

  if (pending.length > 0) {
    console.log("");
    console.log("WDROZENIE NIE JEST JESZCZE KOMPLETNE - wykonaj z multisigu GOVERNANCE:");
    for (const step of pending) console.log(`  - ${step}`);
    console.log("");
  }

  // ZAPIS DO PLIKU, A NIE TYLKO NA EKRAN - front i skrypty czytaja plik, wiec
  // wdrozenie, ktore konczy sie samym wypisem, zostawia na dysku STARE adresy.
  const outputPath = join(process.cwd(), "deployments", `derivativeMarket.${chainId}.json`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`);
  console.log("zapisano          ", outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
