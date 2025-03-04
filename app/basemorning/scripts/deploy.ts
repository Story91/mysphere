const hre = require("hardhat");
const { ethers } = require("hardhat");
const { writeFileSync } = require("fs");
const { join } = require("path");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Network:", hre.network.name);

  // Deploy BaseElementNFT
  const BaseElementNFT = await ethers.getContractFactory("BaseElementNFT");
  const baseElementNFT = await BaseElementNFT.deploy();
  await baseElementNFT.waitForDeployment();
  const baseElementNFTAddress = await baseElementNFT.getAddress();
  console.log("BaseElementNFT deployed to:", baseElementNFTAddress);

  // Chainlink VRF configuration
  const vrfCoordinator = process.env.CHAINLINK_VRF_COORDINATOR;
  const linkToken = process.env.CHAINLINK_LINK_TOKEN;
  const keyHash = process.env.CHAINLINK_KEY_HASH;
  const subscriptionId = 1n; // Mock subscription ID

  if (!vrfCoordinator || !linkToken || !keyHash) {
    throw new Error("Missing Chainlink VRF configuration");
  }

  // Deploy BaseMorningGame
  const BaseMorningGame = await ethers.getContractFactory("BaseMorningGame");
  const baseMorningGame = await BaseMorningGame.deploy(
    baseElementNFTAddress,
    vrfCoordinator,
    subscriptionId,
    keyHash
  );
  await baseMorningGame.waitForDeployment();
  const baseMorningGameAddress = await baseMorningGame.getAddress();
  console.log("BaseMorningGame deployed to:", baseMorningGameAddress);

  // Grant MINTER_ROLE to game contract
  const MINTER_ROLE = await baseElementNFT.MINTER_ROLE();
  await baseElementNFT.grantRole(MINTER_ROLE, baseMorningGameAddress);
  console.log("Granted MINTER_ROLE to game contract");

  // Initialize achievements
  await baseMorningGame.initializeAchievements();
  console.log("Achievements initialized");

  // Update contract addresses in configuration
  const configPath = join(__dirname, "../config/contract.ts");
  const configContent = `
export const CONTRACT_ADDRESS = "${baseMorningGameAddress}" as const;

export const CONTRACT_ABI = [
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayer",
    outputs: [
      { name: "xp", type: "uint256" },
      { name: "lastCheckIn", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "baseLevel", type: "uint8" },
      { name: "isActive", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayerNFTs",
    outputs: [
      {
        components: [
          { name: "id", type: "string" },
          { name: "elementType", type: "uint8" },
          { name: "rarity", type: "uint8" },
          { name: "level", type: "uint8" },
          { name: "power", type: "uint256" },
          { name: "mintedAt", type: "uint256" }
        ],
        name: "elements",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "checkIn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "tokenIds", type: "string[]" }],
    name: "fuseElements",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;
`;

  try {
    writeFileSync(configPath, configContent);
    console.log("Contract configuration updated");
  } catch (error) {
    console.error("Failed to update contract configuration:", error);
  }

  // Verify contracts on Base Sepolia Explorer
  if (process.env.BASESCAN_API_KEY) {
    console.log("Verifying contracts on Base Sepolia Explorer...");
    
    try {
      await hre.run("verify:verify", {
        address: baseElementNFTAddress,
        constructorArguments: []
      });
      console.log("BaseElementNFT verified");
    } catch (error) {
      console.log("BaseElementNFT verification failed:", error);
    }

    try {
      await hre.run("verify:verify", {
        address: baseMorningGameAddress,
        constructorArguments: [
          baseElementNFTAddress,
          vrfCoordinator,
          subscriptionId,
          keyHash
        ]
      });
      console.log("BaseMorningGame verified");
    } catch (error) {
      console.log("BaseMorningGame verification failed:", error);
    }
  } else {
    console.log("Skipping contract verification - BASESCAN_API_KEY not found");
  }

  console.log("\nDeployment Summary:");
  console.log("-------------------");
  console.log("BaseElementNFT:", baseElementNFTAddress);
  console.log("BaseMorningGame:", baseMorningGameAddress);
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 