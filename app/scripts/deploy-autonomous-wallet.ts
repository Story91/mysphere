import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying AutonomousAgentWallet...");

  // Get the contract factory
  const AutonomousAgentWallet = await ethers.getContractFactory("AutonomousAgentWallet");

  // Deploy the contract
  const walletContract = await AutonomousAgentWallet.deploy();
  await walletContract.waitForDeployment();

  const contractAddress = await walletContract.getAddress();
  console.log("✅ AutonomousAgentWallet deployed to:", contractAddress);

  // Verify contract
  console.log("🔍 Verifying contract...");
  console.log("⚠️ Contract verification skipped - run manually:");
  console.log(`npx hardhat verify --network base-mainnet ${contractAddress}`);

  // Save deployment info
  const deploymentInfo = {
    contractAddress,
    deploymentTime: new Date().toISOString(),
    network: await ethers.provider.getNetwork(),
  };

  console.log("📝 Deployment Info:", deploymentInfo);
  console.log("🎯 Copy this address to your .env.local as AUTONOMOUS_WALLET_CONTRACT_ADDRESS");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
