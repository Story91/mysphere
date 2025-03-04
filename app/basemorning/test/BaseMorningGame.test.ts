import { expect } from "chai";
import { ethers } from "hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import "chai-as-promised";

describe("BaseMorningGame", function () {
  let baseMorningGame: any;
  let baseElementNFT: any;
  let owner: any;
  let player1: any;
  let player2: any;

  // Mock Chainlink VRF v2 values
  const vrfCoordinator = "0x2Ca8E0C643bDe4C2E08ab1fA0da3401AdAD7734D"; // Base Sepolia VRF Coordinator
  const subscriptionId = 1n; // Mock subscription ID
  const keyHash = "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15"; // Base Sepolia keyHash

  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();

    // Deploy NFT contract
    const BaseElementNFT = await ethers.getContractFactory("BaseElementNFT");
    baseElementNFT = await BaseElementNFT.deploy();
    await baseElementNFT.waitForDeployment();

    // Deploy game contract
    const BaseMorningGame = await ethers.getContractFactory("BaseMorningGame");
    baseMorningGame = await BaseMorningGame.deploy(
      await baseElementNFT.getAddress(),
      vrfCoordinator,
      subscriptionId,
      keyHash
    );
    await baseMorningGame.waitForDeployment();

    // Grant MINTER_ROLE to game contract
    const MINTER_ROLE = await baseElementNFT.MINTER_ROLE();
    await baseElementNFT.grantRole(MINTER_ROLE, await baseMorningGame.getAddress());

    // Initialize achievements
    await baseMorningGame.initializeAchievements();
  });

  describe("Game Setup", function () {
    it("Should set correct NFT contract address", async function () {
      expect(await baseMorningGame.nftContract()).to.equal(await baseElementNFT.getAddress());
    });

    it("Should initialize achievements", async function () {
      const achievement = await baseMorningGame.achievements("FIRST_STEP");
      expect(achievement.name).to.equal("First Step");
    });
  });

  describe("Check-in System", function () {
    it("Should allow first check-in", async function () {
      await baseMorningGame.connect(player1).checkIn();
      const player = await baseMorningGame.getPlayer(player1.address);
      expect(player.xp).to.equal(100n); // DAILY_XP
      expect(player.streak).to.equal(1n);
    });

    it("Should not allow check-in twice in 24 hours", async function () {
      await baseMorningGame.connect(player1).checkIn();
      await expect(
        baseMorningGame.connect(player1).checkIn()
      ).to.be.revertedWith("Too early for next check-in");
    });
  });

  describe("Element Fusion", function () {
    beforeEach(async function () {
      // Mint 3 common elements for player1
      await baseMorningGame.connect(player1).checkIn(); // This should mint first element
      await baseElementNFT.mint(player1.address, 0, 0, 1); // Mint 2 more
      await baseElementNFT.mint(player1.address, 0, 0, 1);
    });

    it("Should allow fusion of 3 same-level elements", async function () {
      const elements = await baseElementNFT.getPlayerElements(player1.address);
      await baseMorningGame.connect(player1).fuseElements(elements);
      const newElements = await baseElementNFT.getPlayerElements(player1.address);
      expect(newElements.length).to.equal(1); // Should have 1 new element
      const newElement = await baseElementNFT.getElement(newElements[0]);
      expect(newElement.level).to.equal(2); // New element should be level 2
    });
  });

  describe("Ownership", function () {
    it("Should not allow non-owner to set NFT contract", async function () {
      const [, nonOwner] = await ethers.getSigners();
      await expect(
        baseMorningGame.connect(nonOwner).setNFTContract(baseElementNFT.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
}); 