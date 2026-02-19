const hre = require("hardhat");

async function main() {
  console.log("Deploying IPMarketV4...");  // ✅ POPRAWIONE: duże M!
  
  const IPMarketV4 = await hre.ethers.getContractFactory("IPMarketV4");  // ✅ POPRAWIONE: duże M!
  const ipmarket = await IPMarketV4.deploy();
  await ipmarket.waitForDeployment();

  const address = await ipmarket.getAddress();
  console.log("✅ IPMarketV4 deployed to:", address);  // ✅ POPRAWIONE: duże M!
  console.log("🔗 Contract address:", address);
  console.log(" Full marketplace + IP NFT access");
  console.log(" Platform fee: 2.5%");
  console.log("🎨 Supports ERC721 + auctions + offers");
  console.log("⚡ Optimization: 200 runs");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });