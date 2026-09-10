import { ethers, network } from "hardhat";
import { getAddress } from "ethers";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * PRZYKLADOWY RYNEK - zeby tablica na /derivatives nie stala pusta.
 *
 * Trzy transakcje, w tej kolejnosci (to samo co robi CreateMarketModal.tsx
 * z przegladarki, tu jako skrypt dla konta administracyjnego):
 *   1. approve USDC dla rejestru (kaucja schodzi z portfela wdrazajacego)
 *   2. registerMarket - feed + kaucja + cena startowa (min. kaucja to
 *      MIN_BOND_AMOUNT = 100 USDC, patrz PriceOracleRegistry.sol)
 *   3. createMarket   - vAMM na tym feedzie (min. glebokosc to
 *      MIN_VIRTUAL_LIQUIDITY = 1000 USD, patrz DerivativeMarketFactory.sol)
 *
 * Adresy FACTORY/ORACLE/USDC czyta z deployments/derivativeMarket.<chainId>.json,
 * wiec nie trzeba ich przepisywac recznie po kazdym wdrozeniu.
 *
 * UZYCIE
 *   CONFIRM=tak npx cross-env TS_NODE_PROJECT=./hardhat.tsconfig.json \
 *     hardhat run scripts/create-sample-derivative-market.ts --network arcTestnet
 *
 * Zmienne srodowiskowe (wszystkie opcjonalne):
 *   SYMBOL     domyslnie "ARC-USD"
 *   PRICE      cena startowa w USD, domyslnie "1"
 *   BOND       kaucja w USDC, domyslnie "100" (minimum kontraktu)
 *   LIQUIDITY  glebokosc vAMM w USD, domyslnie "1000" (minimum kontraktu)
 *   CONFIRM    musi byc "tak" na sieci innej niz lokalna
 */
async function main() {
  const [signer] = await ethers.getSigners();
  const deployer = getAddress(signer.address);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = network.name === "hardhat" || network.name === "localhost";

  if (!isLocal && process.env.CONFIRM !== "tak") {
    throw new Error(
      "To wysyla trzy prawdziwe transakcje (approve + registerMarket + createMarket) " +
        "i blokuje kaucje w rejestrze.\nPowtorz z CONFIRM=tak, jesli na pewno o to chodzi."
    );
  }

  const deploymentPath = join(process.cwd(), "deployments", `derivativeMarket.${chainId}.json`);
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  if (!deployment.factory || !deployment.oracle) {
    throw new Error(`${deploymentPath} nie ma adresow factory/oracle - najpierw uruchom deploy-derivative-market.ts.`);
  }
  const factoryAddress = getAddress(deployment.factory);
  const oracleAddress = getAddress(deployment.oracle);
  const usdcAddress = getAddress(deployment.usdc);

  const symbol = process.env.SYMBOL ?? "ARC-USD";
  const price = ethers.parseUnits(process.env.PRICE ?? "1", 18);
  const bond = ethers.parseUnits(process.env.BOND ?? "100", 6);
  const liquidity = ethers.parseUnits(process.env.LIQUIDITY ?? "1000", 18);

  console.log("siec       ", `${network.name} (chainId ${chainId})`);
  console.log("wdrazajacy ", deployer);
  console.log("oracle     ", oracleAddress);
  console.log("factory    ", factoryAddress);
  console.log("symbol     ", symbol);
  console.log("cena start ", ethers.formatUnits(price, 18), "USD");
  console.log("kaucja     ", ethers.formatUnits(bond, 6), "USDC");
  console.log("glebokosc  ", ethers.formatUnits(liquidity, 18), "USD");
  console.log("");

  const usdc = await ethers.getContractAt("IERC20", usdcAddress);
  const oracle = await ethers.getContractAt("PriceOracleRegistry", oracleAddress);
  const factory = await ethers.getContractAt("DerivativeMarketFactory", factoryAddress);

  const allowance: bigint = await usdc.allowance(deployer, oracleAddress);
  if (allowance < bond) {
    console.log("zatwierdzam USDC dla rejestru...");
    await (await usdc.approve(oracleAddress, bond)).wait();
  }

  console.log("rejestruje feed i wplacam kaucje...");
  await (await oracle.registerMarket(symbol, price, bond)).wait();
  const marketId: bigint = await oracle.marketCount();
  console.log("id feedu   ", marketId.toString());

  console.log("stawiam vAMM...");
  const createTx = await factory.createMarket(marketId, liquidity, "0x0000000000000000000000000000000000000000");
  const receipt = await createTx.wait();
  const marketAddress = getAddress(await factory.marketOf(marketId));

  console.log("");
  console.log("GOTOWE");
  console.log(JSON.stringify({ marketId: marketId.toString(), market: marketAddress, symbol, tx: receipt?.hash }, null, 2));
  console.log("");
  console.log(`Zobacz go na /derivatives/${marketAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
