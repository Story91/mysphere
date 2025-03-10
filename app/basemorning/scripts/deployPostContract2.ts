const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying PostContract2 with account:", deployer.address);
  console.log("Network:", hre.network.name);

  // Deploy PostContract2
  const PostContract2 = await ethers.getContractFactory("PostContract2");
  const postContract2 = await PostContract2.deploy();
  await postContract2.waitForDeployment();
  const postContract2Address = await postContract2.getAddress();
  console.log("PostContract2 deployed to:", postContract2Address);

  // Verify contract on Base Explorer
  if (process.env.BASESCAN_API_KEY) {
    console.log("Verifying PostContract2 on Base Explorer...");
    
    try {
      await hre.run("verify:verify", {
        address: postContract2Address,
        constructorArguments: []
      });
      console.log("PostContract2 verified");
    } catch (error) {
      console.log("PostContract2 verification failed:", error);
    }
  } else {
    console.log("Skipping contract verification - BASESCAN_API_KEY not found");
  }

  console.log("\nDeployment Summary:");
  console.log("-------------------");
  console.log("PostContract2:", postContract2Address);
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("\nIMPORTANT: Update the contract addresses in app/contracts/PostContract2.ts");
  console.log("For Base Mainnet, update MAINNET_CONTRACT_ADDRESS2");
  console.log("For Base Sepolia, update TESTNET_CONTRACT_ADDRESS2");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 