const hre = require("hardhat");

async function main() {
  console.log("Deploying Portal NFT...");
  
  const Portal = await hre.ethers.getContractFactory("Portal");
  const portal = await Portal.deploy();
  await portal.waitForDeployment();

  const address = await portal.getAddress();
  console.log("✅ Portal deployed to:", address);
  console.log("🔗 Contract address:", address);
  console.log("🎨 NFT: MySphere X CampNetwork");
  console.log("�� Price: 10 CAMP");  // ✅ POPRAWIONE: 10 CAMP!
  console.log("💎 Native CAMP payment required");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });