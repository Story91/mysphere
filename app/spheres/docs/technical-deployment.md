# 🔧 Technical Deployment Guide
*Technical guide for deployment and configuration (Przewodnik techniczny deployment i konfiguracji)*

## 📋 **Overview**
Complete guide for deploying and configuring the HybridCommunityPlatform contract on Base network.

## 🏗️ **Pre-Deployment Requirements**

### **1. Network Configuration**
**Base Mainnet:**
- **RPC URL:** `https://mainnet.base.org`
- **Chain ID:** 8453
- **Currency:** ETH
- **Block Explorer:** `https://basescan.org`

**Base Testnet (Sepolia):**
- **RPC URL:** `https://sepolia.base.org`
- **Chain ID:** 84532
- **Currency:** ETH
- **Block Explorer:** `https://sepolia.basescan.org`

### **2. Contract Dependencies**
**OpenZeppelin Contracts Required:**
```solidity
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
```

**✅ ETH Only Implementation:** No token addresses needed - contract uses BASE ETH exclusively

### **3. Wallet Configuration**
- **Minimum ETH balance:** 0.1 ETH for deployment + initial funding
- **Recommended:** Use multi-sig wallet for mainnet ownership
- **Gas settings:** Use `gasLimit: 8,000,000` for deployment
- **Gas price:** Monitor Base network congestion

## 🚀 **Deployment Steps**

### **Step 1: Environment Setup**
```bash
# Install dependencies
npm install --save-dev @nomiclabs/hardhat-ethers ethers @openzeppelin/contracts

# Create .env file
PRIVATE_KEY=your_private_key_here
BASE_RPC_URL=https://mainnet.base.org
BASE_TESTNET_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=your_basescan_api_key
```

### **Step 2: Hardhat Configuration**
```javascript
// hardhat.config.js
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    base: {
      url: process.env.BASE_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
      gasPrice: 1000000000, // 1 gwei
      gasLimit: 8000000
    },
    "base-sepolia": {
      url: process.env.BASE_TESTNET_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
      gasPrice: 1000000000,
      gasLimit: 8000000
    }
  },
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY,
      "base-sepolia": process.env.BASESCAN_API_KEY
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  }
};
```

### **Step 3: Deployment Script**
```javascript
// scripts/deploy.js
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying HybridCommunityPlatform...");
  
  // Get deployer info
  const [deployer] = await ethers.getSigners();
  console.log("🔑 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");
  
  // Get the contract factory
  const HybridCommunityPlatform = await ethers.getContractFactory("HybridCommunityPlatform");
  
  // Deploy contract (no constructor parameters)
  console.log("📝 Deploying contract...");
  const contract = await HybridCommunityPlatform.deploy();
  
  // Wait for deployment
  await contract.deployed();
  
  console.log("✅ Contract deployed successfully!");
  console.log("📍 Contract address:", contract.address);
  console.log("🔗 Transaction hash:", contract.deployTransaction.hash);
  
  // Verify initial contract state
  console.log("\n🔍 Verifying deployment...");
  const owner = await contract.owner();
  const creationFee = await contract.creationFeeEth();
  const transactionFeePercentage = await contract.TRANSACTION_FEE_PERCENTAGE();
  const defaultPlatformFee = await contract.defaultPlatformFeePercentage();
  const utilityBoxFee = await contract.utilityBoxFee();
  const minMysteryBoxBet = await contract.minMysteryBoxBet();
  const maxMysteryBoxBet = await contract.maxMysteryBoxBet();
  const achievementFee = await contract.achievementUnlockFee();
  const boostFee = await contract.boostPurchaseFee();
  const eventFee = await contract.eventPlatformFee();
  const withdrawalFee = await contract.withdrawalFeePercentage();
  
  console.log("👑 Owner:", owner);
  console.log("💎 Creation Fee:", ethers.utils.formatEther(creationFee), "ETH");
  console.log("🔄 Transaction Fee:", transactionFeePercentage.toNumber() / 10, "% (CONSTANT)");
  console.log("🏢 Default Platform Fee:", defaultPlatformFee.toNumber() / 10, "%");
  console.log("🎁 Utility Box Fee:", ethers.utils.formatEther(utilityBoxFee), "ETH");
  console.log("🎰 Mystery Box Bet Range:", ethers.utils.formatEther(minMysteryBoxBet), "-", ethers.utils.formatEther(maxMysteryBoxBet), "ETH");
  console.log("🏆 Achievement Unlock Fee:", ethers.utils.formatEther(achievementFee), "ETH");
  console.log("🚀 Boost Purchase Fee:", ethers.utils.formatEther(boostFee), "ETH");
  console.log("🎪 Event Creation Fee:", ethers.utils.formatEther(eventFee), "ETH");
  console.log("💸 Withdrawal Fee:", withdrawalFee.toNumber() / 10, "%");
  
  console.log("\n✅ Deployment completed successfully!");
  console.log("📝 Next steps: Run post-deployment configuration");
  
  return {
    contractAddress: contract.address,
    owner: owner,
    contract: contract
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
```

### **Step 4: Deploy Commands**
```bash
# Deploy to Base mainnet
npx hardhat run scripts/deploy.js --network base

# Deploy to Base testnet
npx hardhat run scripts/deploy.js --network base-sepolia

# Save deployment info
npx hardhat run scripts/deploy.js --network base > deployment.log
```

## ⚙️ **Post-Deployment Configuration**

### **🚨 CRITICAL SETUP STEPS (Required before platform launch)**

#### **Step 1: Fund MysteryBox Prize Pool**
```javascript
// scripts/setup-mysterybox.js
async function setupMysteryBox(contractAddress) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  
  console.log("💰 Funding MysteryBox prize pool...");
  
  // Fund with substantial amount to cover initial wins
  const fundingAmount = ethers.utils.parseEther("5.0"); // 5 ETH recommended for production
  const fundTx = await contract.fundMysteryBoxPool({ value: fundingAmount });
  await fundTx.wait();
  
  const prizePool = await contract.mysteryBoxPrizePool();
  console.log("✅ Prize pool funded with:", ethers.utils.formatEther(fundingAmount), "ETH");
  console.log("🎰 Current prize pool balance:", ethers.utils.formatEther(prizePool), "ETH");
  
  return prizePool;
}
```

#### **Step 2: Set UtilityBox NFT Metadata**
```javascript
// scripts/setup-utilitybox.js
async function setupUtilityBox(contractAddress) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  
  console.log("🎨 Setting UtilityBox NFT URI...");
  
  // IMPORTANT: Replace with your actual IPFS metadata URI
  const nftUri = "ipfs://QmYourMetadataHashHere/utilitybox-champion.json";
  const uriTx = await contract.setUtilityBoxNftUri(nftUri);
  await uriTx.wait();
  
  const currentUri = await contract.utilityBoxNftUri();
  console.log("✅ NFT URI set to:", currentUri);
  
  return currentUri;
}
```

#### **Step 3: Configure Bet Limits and Fees**
```javascript
// scripts/configure-fees.js
async function configureFees(contractAddress) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  
  console.log("⚙️ Configuring bet limits and fees...");
  
  // Set MysteryBox bet limits (adjust based on ETH price)
  const minBet = ethers.utils.parseEther("0.00035"); // ~$1.05 at $3000 ETH
  const maxBet = ethers.utils.parseEther("0.01");    // ~$30 at $3000 ETH
  const limitsTx = await contract.setMysteryBoxBetLimits(minBet, maxBet);
  await limitsTx.wait();
  console.log("🎰 MysteryBox bet limits set:", ethers.utils.formatEther(minBet), "-", ethers.utils.formatEther(maxBet), "ETH");
  
  // Set UtilityBox fee
  const utilityFee = ethers.utils.parseEther("0.0001"); // ~$0.30 at $3000 ETH
  const utilityTx = await contract.setUtilityBoxFee(utilityFee);
  await utilityTx.wait();
  console.log("🎁 UtilityBox fee set:", ethers.utils.formatEther(utilityFee), "ETH");
  
  // Optional: Adjust other fees based on market conditions
  // const newCreationFee = ethers.utils.parseEther("0.008");
  // await contract.setCreationFee(newCreationFee);
  
  // const newAchievementFee = ethers.utils.parseEther("0.0004");
  // await contract.setAchievementUnlockFee(newAchievementFee);
  
  console.log("✅ All fees configured successfully");
}
```

#### **Step 4: Complete Setup Script**
```javascript
// scripts/complete-setup.js
const { setupMysteryBox } = require('./setup-mysterybox');
const { setupUtilityBox } = require('./setup-utilitybox');
const { configureFees } = require('./configure-fees');

async function completeSetup() {
  const contractAddress = "0xYourContractAddressHere";
  
  console.log("🚀 Starting complete post-deployment setup...");
  console.log("📍 Contract address:", contractAddress);
  
  try {
    // Step 1: Fund MysteryBox
    await setupMysteryBox(contractAddress);
    console.log("1/3 ✅ MysteryBox setup complete");
    
    // Step 2: Set UtilityBox NFT URI
    await setupUtilityBox(contractAddress);
    console.log("2/3 ✅ UtilityBox setup complete");
    
    // Step 3: Configure fees
    await configureFees(contractAddress);
    console.log("3/3 ✅ Fee configuration complete");
    
    console.log("🎉 Platform setup completed successfully!");
    console.log("🚀 Platform is ready for launch!");
    
  } catch (error) {
    console.error("❌ Setup failed:", error);
    throw error;
  }
}

completeSetup()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

### **Step 5: Verify Contract on BaseScan**
```bash
# Install verification plugin
npm install --save-dev @nomiclabs/hardhat-etherscan

# Verify contract (no constructor parameters)
npx hardhat verify --network base CONTRACT_ADDRESS

# For testnet
npx hardhat verify --network base-sepolia CONTRACT_ADDRESS
```

### **Step 6: Transfer Ownership (Recommended)**
```javascript
// scripts/transfer-ownership.js
async function transferOwnership(contractAddress, newOwner) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  
  console.log("🔄 Transferring ownership...");
  console.log("📍 Contract:", contractAddress);
  console.log("👑 Current owner:", await contract.owner());
  console.log("🎯 New owner:", newOwner);
  
  const transferTx = await contract.transferOwnership(newOwner);
  await transferTx.wait();
  
  console.log("✅ Ownership transferred successfully!");
  console.log("👑 New owner:", await contract.owner());
}

// Usage:
// transferOwnership("0xContractAddress", "0xMultiSigAddress");
```

## 🎯 **Advanced Configuration**

### **1. Fee Optimization**
```javascript
// Adjust fees based on ETH price and usage
async function optimizeFees(contractAddress, ethPriceUSD) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  
  // Target: ~$1.50 for achievement unlocks
  const targetAchievementUSD = 1.50;
  const newAchievementFee = ethers.utils.parseEther((targetAchievementUSD / ethPriceUSD).toString());
  await contract.setAchievementUnlockFee(newAchievementFee);
  
  // Target: ~$0.30 for UtilityBox
  const targetUtilityUSD = 0.30;
  const newUtilityFee = ethers.utils.parseEther((targetUtilityUSD / ethPriceUSD).toString());
  await contract.setUtilityBoxFee(newUtilityFee);
  
  console.log("💰 Fees optimized for ETH price:", ethPriceUSD, "USD");
}
```

### **2. Prize Pool Management**
```javascript
// Monitor and manage MysteryBox prize pool
async function managePrizePool(contractAddress) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  
  const prizePool = await contract.mysteryBoxPrizePool();
  const maxBet = await contract.maxMysteryBoxBet();
  const maxPayout = maxBet.mul(2); // 2x maximum
  
  console.log("🎰 Current prize pool:", ethers.utils.formatEther(prizePool), "ETH");
  console.log("💥 Maximum single payout:", ethers.utils.formatEther(maxPayout), "ETH");
  
  // Recommended: Keep 3-5x max payout in reserve
  const recommendedMinimum = maxPayout.mul(3);
  
  if (prizePool.lt(recommendedMinimum)) {
    console.log("⚠️ Prize pool below recommended minimum!");
    console.log("💡 Consider funding with:", ethers.utils.formatEther(recommendedMinimum.sub(prizePool)), "ETH");
  }
  
  // Auto-fund if needed (optional)
  // const fundingNeeded = recommendedMinimum.sub(prizePool);
  // if (fundingNeeded.gt(0)) {
  //   await contract.fundMysteryBoxPool({ value: fundingNeeded });
  // }
}
```

### **3. Emergency Procedures**
```javascript
// Emergency pause and recovery procedures
async function emergencyPause(contractAddress) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  
  console.log("🚨 EMERGENCY: Pausing contract...");
  const pauseTx = await contract.pause();
  await pauseTx.wait();
  
  const isPaused = await contract.paused();
  console.log("⏸️ Contract paused:", isPaused);
}

async function emergencyUnpause(contractAddress) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  
  console.log("▶️ Unpausing contract...");
  const unpauseTx = await contract.unpause();
  await unpauseTx.wait();
  
  const isPaused = await contract.paused();
  console.log("▶️ Contract running:", !isPaused);
}
```

## 🔍 **Testing & Verification**

### **1. Comprehensive Function Tests**
```javascript
// scripts/test-functions.js
async function testAllFunctions(contractAddress) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  const [deployer] = await ethers.getSigners();
  
  console.log("🧪 Testing all contract functions...");
  
  try {
    // Test 1: Community creation
    console.log("1️⃣ Testing community creation...");
    const createTx = await contract.createCommunity(
      "Test Community",
      "A test community for verification",
      ethers.utils.parseEther("0.001"), // joinFeeEth
      ethers.utils.parseEther("0.01"),  // monthlySubFeeEth
      ethers.utils.parseEther("0.1"),   // lifetimeSubFeeEth
      { value: ethers.utils.parseEther("0.01") } // creation fee
    );
    await createTx.wait();
    console.log("✅ Community creation successful");
    
    // Test 2: Join community
    console.log("2️⃣ Testing community join...");
    const joinTx = await contract.joinCommunity(
      1, // communityId
      false, // lifetime
      ethers.constants.AddressZero, // referrer
      { value: ethers.utils.parseEther("0.011") } // join fee + monthly fee
    );
    await joinTx.wait();
    console.log("✅ Community join successful");
    
    // Test 3: MysteryBox
    console.log("3️⃣ Testing MysteryBox...");
    const mysteryTx = await contract.openMysteryBox(
      1, // communityId
      { value: ethers.utils.parseEther("0.00035") } // min bet
    );
    await mysteryTx.wait();
    console.log("✅ MysteryBox test successful");
    
    // Test 4: UtilityBox
    console.log("4️⃣ Testing UtilityBox...");
    const utilityTx = await contract.openUtilityBox(
      1, // communityId
      { value: ethers.utils.parseEther("0.0001") } // utility box fee
    );
    await utilityTx.wait();
    console.log("✅ UtilityBox test successful");
    
    // Test 5: Boost purchase
    console.log("5️⃣ Testing boost purchase...");
    const boostTx = await contract.purchaseBoost(
      0, // BoostType.EXPERIENCE_MULTIPLIER
      86400, // 24 hours
      { value: ethers.utils.parseEther("0.0005") }
    );
    await boostTx.wait();
    console.log("✅ Boost purchase successful");
    
    // Test 6: Premium achievement unlock
    console.log("6️⃣ Testing premium achievement unlock...");
    const achievementTx = await contract.unlockPremiumAchievement(
      0, // AchievementType.FIRST_JOIN
      { value: ethers.utils.parseEther("0.0005") }
    );
    await achievementTx.wait();
    console.log("✅ Premium achievement unlock successful");
    
    console.log("🎉 All function tests passed!");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  }
}
```

### **2. Event Monitoring Setup**
```javascript
// scripts/monitor-events.js
async function setupEventMonitoring(contractAddress) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  
  console.log("👂 Setting up event monitoring...");
  
  // Community events
  contract.on("CommunityCreated", (communityId, creator, name) => {
    console.log(`🏘️ Community created: ${name} (ID: ${communityId}) by ${creator}`);
  });
  
  contract.on("MemberJoined", (communityId, member) => {
    console.log(`👥 Member joined: ${member} → Community ${communityId}`);
  });
  
  // Game events
  contract.on("MysteryBoxOpened", (user, reward) => {
    console.log(`🎰 MysteryBox: ${user} won ${ethers.utils.formatEther(reward)} ETH`);
  });
  
  contract.on("UtilityBoxOpened", (user, prizeType, value) => {
    console.log(`🎁 UtilityBox: ${user} won ${prizeType} (${value})`);
  });
  
  // Achievement events
  contract.on("AchievementUnlocked", (user, achievement) => {
    console.log(`🏆 Achievement: ${user} unlocked achievement ${achievement}`);
  });
  
  contract.on("LevelUp", (user, newLevel) => {
    console.log(`📈 Level up: ${user} reached level ${newLevel}`);
  });
  
  // Financial events
  contract.on("TransactionFeeCharged", (user, fee) => {
    console.log(`💰 Transaction fee: ${ethers.utils.formatEther(fee)} ETH from ${user}`);
  });
  
  contract.on("PlatformFeeCollected", (amount, source) => {
    console.log(`🏢 Platform fee: ${ethers.utils.formatEther(amount)} ETH from ${source}`);
  });
  
  // Utility item events
  contract.on("StreakSaverWon", (user, newTotal) => {
    console.log(`🛡️ Streak Saver won: ${user} (total: ${newTotal})`);
  });
  
  contract.on("AchievementVoucherWon", (user, newTotal) => {
    console.log(`🎫 Achievement Voucher won: ${user} (total: ${newTotal})`);
  });
  
  console.log("✅ Event monitoring active");
}
```

### **3. Health Check Script**
```javascript
// scripts/health-check.js
async function healthCheck(contractAddress) {
  const contract = await ethers.getContractAt("HybridCommunityPlatform", contractAddress);
  
  console.log("🏥 Running platform health check...");
  
  // Check contract status
  const isPaused = await contract.paused();
  const owner = await contract.owner();
  
  console.log("📊 Contract Status:");
  console.log("  Paused:", isPaused ? "❌ YES" : "✅ NO");
  console.log("  Owner:", owner);
  
  // Check prize pool
  const prizePool = await contract.mysteryBoxPrizePool();
  const maxBet = await contract.maxMysteryBoxBet();
  const maxPayout = maxBet.mul(2);
  const poolRatio = prizePool.div(maxPayout);
  
  console.log("🎰 MysteryBox Health:");
  console.log("  Prize Pool:", ethers.utils.formatEther(prizePool), "ETH");
  console.log("  Max Payout:", ethers.utils.formatEther(maxPayout), "ETH");
  console.log("  Safety Ratio:", poolRatio.toString() + "x");
  console.log("  Status:", poolRatio.gte(3) ? "✅ HEALTHY" : "⚠️ LOW RESERVES");
  
  // Check platform stats
  const stats = await contract.getPlatformStats();
  console.log("📈 Platform Stats:");
  console.log("  Total Communities:", stats.totalCommunities.toString());
  console.log("  Active Communities:", stats.activeCommunities.toString());
  console.log("  Total Members:", stats.totalMembers.toString());
  console.log("  Total Volume:", ethers.utils.formatEther(stats.totalVolume), "ETH");
  console.log("  Platform Fees:", ethers.utils.formatEther(stats.totalPlatformFees), "ETH");
  
  // Check utility box NFT URI
  const nftUri = await contract.utilityBoxNftUri();
  console.log("🎨 UtilityBox NFT URI:", nftUri || "❌ NOT SET");
  
  console.log(isPaused ? "❌ PLATFORM OFFLINE" : "✅ PLATFORM HEALTHY");
}
```

## 📈 **Monitoring & Maintenance**

### **Daily Monitoring**
```bash
# Check contract health
npx hardhat run scripts/health-check.js --network base

# Monitor events
npx hardhat run scripts/monitor-events.js --network base

# Check prize pool levels
npx hardhat run scripts/check-prize-pool.js --network base
```

### **Weekly Maintenance**
```bash
# Optimize fees based on ETH price
npx hardhat run scripts/optimize-fees.js --network base

# Review platform statistics
npx hardhat run scripts/platform-stats.js --network base

# Backup configuration
npx hardhat run scripts/backup-config.js --network base
```

### **Emergency Response**
```bash
# Pause contract
npx hardhat run scripts/emergency-pause.js --network base

# Unpause contract
npx hardhat run scripts/emergency-unpause.js --network base

# Emergency fund management
npx hardhat run scripts/emergency-funds.js --network base
```

## 🛡️ **Security Checklist**

### **Pre-Launch Security Verification**
- [ ] Contract verified on BaseScan
- [ ] Ownership transferred to multi-sig
- [ ] Prize pool adequately funded (5x max payout)
- [ ] UtilityBox NFT URI properly set
- [ ] All fees configured appropriately
- [ ] Emergency procedures tested
- [ ] Event monitoring active
- [ ] Health check script running

### **Post-Launch Monitoring**
- [ ] Daily health checks
- [ ] Prize pool level monitoring
- [ ] Event log analysis
- [ ] Fee optimization based on usage
- [ ] Community growth tracking
- [ ] Security incident response plan active

## 📋 **Deployment Checklist**

### **Pre-Deployment**
- [ ] Hardhat configuration verified
- [ ] Dependencies installed
- [ ] Network settings confirmed
- [ ] Deployment script tested on testnet
- [ ] Gas estimation completed

### **Deployment**
- [ ] Contract deployed successfully
- [ ] Contract verified on BaseScan
- [ ] Initial state verified
- [ ] Transaction hash saved

### **Post-Deployment**
- [ ] MysteryBox prize pool funded
- [ ] UtilityBox NFT URI set
- [ ] Bet limits and fees configured
- [ ] Ownership transferred (if applicable)
- [ ] Event monitoring setup
- [ ] Health check implemented
- [ ] Documentation updated

### **Launch Ready**
- [ ] All functions tested
- [ ] Platform health verified
- [ ] Monitoring systems active
- [ ] Emergency procedures ready
- [ ] Team trained on operations

**🎉 Platform ready for launch!** All technical requirements satisfied and monitoring systems active. 