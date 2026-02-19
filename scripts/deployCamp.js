const hre = require("hardhat");

async function main() {
  console.log("Deploying CampPostv1...");
  
  const CampPostv1 = await hre.ethers.getContractFactory("CampPostv1");
  const campPost = await CampPostv1.deploy();
  await campPost.waitForDeployment();

  const address = await campPost.getAddress();
  console.log("✅ CampPostv1 deployed to:", address);
  console.log("🔗 Contract address:", address);
  console.log("📝 Save this address for verification!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });