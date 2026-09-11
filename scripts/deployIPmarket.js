/**
 * Deploy IPMarketV4 na Camp mainnet (484).
 *
 *   npx hardhat run scripts/deployIPmarket.js --network camp
 *
 * Wymaga ADMIN_PRIVATE_KEY lub PRIVATE_KEY w .env.local z saldem CAMP na gaz
 * (init code ~17 KB; przy 10 gwei to rzad 0.05 CAMP). Po deployu skrypt od
 * razu ustawia setIpNftContract na kolekcje IP NFT Origin, zeby buyAccess/
 * registerIpNFT mialy wlasciwy kontrakt, i wypisuje adresy do wklejenia w
 * app/marketplace/config/simpleMarketplace.ts.
 *
 * Rozmiar: hardhat.config.ts ma override runs: 1 dla contracts/IPmarketV4.sol,
 * bo z runs: 200 bajtkod przekraczal limit EIP-170.
 */
const hre = require("hardhat");

// Camp Origin IP NFT na 484 (DATANFT_CONTRACT_ADDRESS z @campnetwork/origin 1.3.2)
const ORIGIN_IP_NFT = "0x39EeE1C3989f0dD543Dee60f8582F7F81F522C38";

async function main() {
  const net = await hre.ethers.provider.getNetwork();
  if (Number(net.chainId) !== 484) {
    throw new Error(`Zly lancuch: ${net.chainId}. Uzyj --network camp (484).`);
  }
  const [deployer] = await hre.ethers.getSigners();
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address, "saldo:", hre.ethers.formatEther(bal), "CAMP");
  if (bal === 0n) throw new Error("Deployer ma 0 CAMP - dosyp gaz przed deployem.");

  const code = await hre.ethers.provider.getCode(ORIGIN_IP_NFT);
  if (code === "0x") throw new Error(`Brak kodu pod ORIGIN_IP_NFT ${ORIGIN_IP_NFT}`);

  console.log("Deploying IPMarketV4...");
  const Factory = await hre.ethers.getContractFactory("IPMarketV4");
  const market = await Factory.deploy();
  await market.waitForDeployment();
  const address = await market.getAddress();
  console.log("IPMarketV4:", address);

  const tx = await market.setIpNftContract(ORIGIN_IP_NFT);
  await tx.wait();
  console.log("setIpNftContract ->", ORIGIN_IP_NFT, "tx", tx.hash);

  console.log("\nDo wklejenia:");
  console.log(`  MARKETPLACE_ADDRESS = '${address}'  (app/marketplace/config/simpleMarketplace.ts)`);
  console.log(`  ipmarket-484 -> ${address}, expects: 'code'  (app/utils/ops/registry.ts, scripts/verifyOnchainInventory.js)`);
  console.log("  usun '/marketplace' z DISABLED_ROUTES (config/routeStatus.js)");
  console.log(`\nWeryfikacja: npx hardhat verify --network camp ${address}`);
}

main().catch((e) => { console.error("Deploy failed:", e); process.exit(1); });
