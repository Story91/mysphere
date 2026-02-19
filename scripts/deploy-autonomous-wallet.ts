import pkg from 'hardhat';
const { ethers } = pkg;

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
  console.log(`npx hardhat verify --network base ${contractAddress}`);

  // Save deployment info
  const deploymentInfo = {
    contractAddress,
    deploymentTime: new Date().toISOString(),
    network: "base-mainnet",
    chainId: 8453
  };

  console.log("📋 Deployment Info:", JSON.stringify(deploymentInfo, null, 2));
  console.log("🎉 Deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
