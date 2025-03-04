import { expect } from "chai";
import { ethers } from "hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import "chai-as-promised";

describe("BaseElementNFT", function () {
  let baseElementNFT: any;
  let owner: any;
  let addr1: any;
  let addr2: any;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const BaseElementNFT = await ethers.getContractFactory("BaseElementNFT");
    baseElementNFT = await BaseElementNFT.deploy();
    await baseElementNFT.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await baseElementNFT.hasRole(await baseElementNFT.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
    });

    it("Should grant MINTER_ROLE to owner", async function () {
      expect(await baseElementNFT.hasRole(await baseElementNFT.MINTER_ROLE(), owner.address)).to.equal(true);
    });
  });

  describe("Minting", function () {
    it("Should allow minting by MINTER_ROLE", async function () {
      await baseElementNFT.mint(addr1.address, 0, 0, 1); // REACTOR, COMMON, level 1
      expect(await baseElementNFT.balanceOf(addr1.address)).to.equal(1n);
    });

    it("Should not allow minting by non-MINTER_ROLE", async function () {
      const minterRole = await baseElementNFT.MINTER_ROLE();
      await expect(
        baseElementNFT.connect(addr1).mint(addr2.address, 0, 0, 1)
      ).to.be.rejectedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${minterRole}`);
    });

    it("Should calculate power correctly", async function () {
      await baseElementNFT.mint(addr1.address, 0, 3, 1); // REACTOR, EPIC, level 1
      const tokenId = 1n;
      const element = await baseElementNFT.getElement(tokenId);
      expect(element.power).to.equal(400n); // level 1 * 100 * 4 (EPIC multiplier)
    });
  });

  describe("Element Management", function () {
    beforeEach(async function () {
      await baseElementNFT.mint(addr1.address, 0, 0, 1);
    });

    it("Should return correct element data", async function () {
      const element = await baseElementNFT.getElement(1n);
      expect(element.elementType).to.equal(0); // REACTOR
      expect(element.rarity).to.equal(0); // COMMON
      expect(element.level).to.equal(1);
    });

    it("Should return player elements", async function () {
      const elements = await baseElementNFT.getPlayerElements(addr1.address);
      expect(elements.length).to.equal(1);
      expect(elements[0]).to.equal(1n);
    });

    it("Should allow burning by owner", async function () {
      await baseElementNFT.connect(addr1).burn(1n);
      await expect(baseElementNFT.getElement(1n)).to.be.revertedWith("Element does not exist");
    });
  });
}); 