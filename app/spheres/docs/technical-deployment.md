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

**Base Testnet (Goerli):**
- **RPC URL:** `https://goerli.base.org`
- **Chain ID:** 84531
- **Currency:** ETH
- **Block Explorer:** `https://goerli.basescan.org`

### **2. Required Token Addresses**
**🚀 NEW:** Contract now uses only BASE ETH - no USDC addresses needed!
```solidity

// NEW: No token addresses needed - ETH only!
```

### **3. Wallet Configuration**
- **Minimum ETH balance:** 0.1 ETH for deployment
- **Recommended:** Use multi-sig wallet for mainnet
- **Gas settings:** Use `gasLimit: 6,000,000` for deployment

## 🚀 **Deployment Steps**

### **Step 1: Environment Setup**
```bash
# Install dependencies
npm install --save-dev @nomiclabs/hardhat-ethers ethers @openzeppelin/contracts

# Create .env file
PRIVATE_KEY=your_private_key_here
BASE_RPC_URL=https://mainnet.base.org
# USDC_ADDRESS removed - not needed anymore!
```

### **Step 2: Hardhat Configuration**
```javascript
// hardhat.config.js
require("@nomiclabs/hardhat-ethers");

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
    }
  }
};
```

### **Step 3: Deployment Script (UPDATED!)**
```javascript
// scripts/deploy.js
const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying HybridCommunityPlatform...");
  
  // Get the contract factory
  const HybridCommunityPlatform = await ethers.getContractFactory("HybridCommunityPlatform");
  
  // Deploy without parameters
  const contract = await HybridCommunityPlatform.deploy();
  
  // Wait for deployment
  await contract.deployed();
  
  console.log("Contract deployed to:", contract.address);
  console.log("Transaction hash:", contract.deployTransaction.hash);
  
  // Verify contract parameters
  const owner = await contract.owner();
  const creationFee = await contract.creationFeeEth();
  const transactionFeePercentage = await contract.TRANSACTION_FEE_PERCENTAGE(); // It's a constant
  const utilityBoxFee = await contract.utilityBoxFee();
  
  console.log("Owner:", owner);
  console.log("Creation Fee:", ethers.utils.formatEther(creationFee), "ETH");
  console.log("Transaction Fee:", transactionFeePercentage.toNumber() / 10, "%");
  console.log("Utility Box Fee:", ethers.utils.formatEther(utilityBoxFee), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

### **Step 4: Deploy Command**
```bash
# Deploy to Base mainnet
npx hardhat run scripts/deploy.js --network base

# Deploy to Base testnet
npx hardhat run scripts/deploy.js --network base-goerli
```

## ⚙️ **Post-Deployment Configuration**

### **1. Initial Settings (CRITICAL STEPS!)**
```javascript
// A. Fund the MysteryBox Prize Pool
console.log("Funding the prize pool...");
const fundTx = await contract.fundMysteryBoxPool({ value: ethers.utils.parseEther("0.5") }); // Fund with 0.5 ETH for example
await fundTx.wait();
console.log("Prize pool funded.");

// B. Set the URI for the UtilityBox NFT
console.log("Setting UtilityBox NFT URI...");
const nftUri = "ipfs://YOUR_METADATA_CID_HERE"; // <-- IMPORTANT: Replace with your actual IPFS CID
const uriTx = await contract.setUtilityBoxNftUri(nftUri);
await uriTx.wait();
console.log("NFT URI set to:", nftUri);

// C. Set Bet Limits and Fees
console.log("Setting bet limits and fees...");
const limitsTx = await contract.setMysteryBoxBetLimits(
    ethers.utils.parseEther("0.00035"), // minBet
    ethers.utils.parseEther("0.01")     // maxBet
);
await limitsTx.wait();

const utilityFeeTx = await contract.setUtilityBoxFee(ethers.utils.parseEther("0.0001"));
await utilityFeeTx.wait();
console.log("Bet limits and fees configured.");

// D. (Optional) Set other platform fees
// Example:
// await contract.setWithdrawalFeePercentage(10); // 1%
```

### **2. Verify Contract on BaseScan**
```bash
# Install verification plugin
npm install --save-dev @nomiclabs/hardhat-etherscan

# Verify contract (no parameters needed!)
npx hardhat verify --network base CONTRACT_ADDRESS
```

### **3. Set Up Multi-Sig (Recommended)**
```javascript
// Transfer ownership to multi-sig
const multisigAddress = "0x..."; // Your multi-sig address
await contract.transferOwnership(multisigAddress);
```

## 🎯 **Contract Configuration**

### **1. Fee Structure Setup**
```solidity
// Platform fee percentages (per community)
// Default: 25 (2.5%), Max: 100 (10%)
await contract.setPlatformFeePercentage(communityId, 25);

// Creation fee for new communities
await contract.setCreationFee(ethers.utils.parseEther("0.01"));
```

### **2. Emergency Functions**
```solidity
// Pause contract in emergency
await contract.pause();

// Resume operations
await contract.unpause();

// Emergency withdrawal (extreme cases only)
await contract.emergencyWithdraw();
```

## 🔍 **Testing & Verification**

### **1. Basic Function Tests**
```javascript
// Test community creation (BASE ETH only!)
const tx = await contract.createCommunity(
  "Test Community",
  "A test community",
  ethers.utils.parseEther("0.001"), // joinFeeEth
  ethers.utils.parseEther("0.01"),  // monthlySubFeeEth
  ethers.utils.parseEther("0.1"),   // lifetimeSubFeeEth
  { value: ethers.utils.parseEther("0.01") } // creation fee
);

// Test joining community
const joinTx = await contract.joinCommunity(
  1, // communityId
  false, // lifetime
  ethers.constants.AddressZero, // referrer
  { value: ethers.utils.parseEther("0.011") } // join fee + monthly fee
);

// Test boost purchase
const boostTx = await contract.purchaseBoost(
  0, // BoostType.EXPERIENCE_MULTIPLIER
  86400, // 24 hours in seconds
  { value: ethers.utils.parseEther("0.0005") }
);

// Test mystery box
const mysteryTx = await contract.openMysteryBox(
  1, // communityId
  { value: ethers.utils.parseEther("0.00035") } // min bet
);

// Test utility box
const utilityTx = await contract.openUtilityBox(
  1, // communityId
  { value: ethers.utils.parseEther("0.0001") } // utility box fee
);

// Test premium achievement unlock with voucher
// First, win a voucher from utility box (requires luck or script adjustment)
// Then:
// await contract.useAchievementVoucher(0); // AchievementType.FIRST_JOIN
```

### **2. Event Verification**
```javascript
// Listen for events
contract.on("CommunityCreated", (communityId, creator, name) => {
  console.log(`Community created: ${name} by ${creator}`);
});

contract.on("MemberJoined", (communityId, member) => {
  console.log(`Member ${member} joined community ${communityId}`);
});
```

## 📊 **Monitoring & Analytics**

### **1. Key Metrics to Track**
```javascript
// Platform statistics
const stats = await contract.getPlatformStats();
console.log("Total Communities:", stats.totalCommunities);
console.log("Active Communities:", stats.activeCommunities);
console.log("Total Members:", stats.totalMembers);

// Individual community stats
const communityDetails = await contract.getCommunityDetails(1);
console.log("Community Members:", communityDetails.totalMembers);
```

### **2. Financial Monitoring**
```javascript
// Check contract balance
const balance = await ethers.provider.getBalance(contract.address);
console.log("Contract Balance:", ethers.utils.formatEther(balance));

// Monitor fee collection
const creationFee = await contract.creationFeeEth();
const platformFee = await contract.defaultPlatformFeePercentage();
```

## 🛡️ **Security Considerations**

### **1. Access Control**
- **Owner functions:** Only contract owner can call
- **Multi-sig recommended:** Use Gnosis Safe or similar
- **Role-based access:** Creators and moderators have limited privileges

### **2. Economic Security**
- **Fee limits:** Maximum platform fee is 10%
- **Emergency stops:** Can pause contract if needed
- **Withdrawal limits:** No unlimited withdrawal functions

### **3. Smart Contract Security**
- **ReentrancyGuard:** Prevents reentrancy attacks
- **Pausable:** Can stop operations in emergency
- **Input validation:** All parameters validated
- **Overflow protection:** Using Solidity ^0.8.0 compiler checks

## 🔄 **Upgrade Strategy** (Strategia Aktualizacji)

### **1. Proxy Pattern (Recommended for future)**
Although the current contract is not deployed as a proxy, this is the recommended strategy for the future to allow updates without data loss.
(Chociaż obecny kontrakt nie jest wdrożony jako proxy, jest to zalecana strategia na przyszłość, aby umożliwić aktualizacje bez utraty danych.)
```solidity
// Example using OpenZeppelin's upgradeable contracts
// This requires changing the contract structure to use an initializer
// instead of a constructor.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// contract HybridCommunityPlatform is Initializable, ... {
//    function initialize() public initializer {
//        // constructor logic here
//    }
// }
```
Implementing this pattern would allow calling `upgradeTo(newImplementationAddress)` on the proxy contract to update the logic in the future.
(Wdrożenie tego wzorca pozwoliłoby na wywołanie `upgradeTo(newImplementationAddress)` na kontrakcie proxy, aby zaktualizować logikę w przyszłości.)

### **2. Migration Strategy** (Strategia Migracji)
Without a proxy, the only upgrade option is to deploy a new contract and migrate the data. This is a complex process that would require:
(W przypadku braku proxy, jedyną opcją aktualizacji jest wdrożenie nowego kontraktu i migracja danych. Jest to proces złożony, który wymagałby:)
- Building scripts to read the state from the old contract.
- Writing that state into the new contract.
- Informing users about the new contract address.

## 📈 **Scaling Considerations**

### **1. Gas Optimization**
- **Optimized data types:** uint128, uint32, uint16 instead of uint256
- **Packed structs:** Minimize storage slots
- **Batch operations:** Group multiple operations

### **2. Performance Monitoring**
- **Transaction costs:** Monitor gas prices
- **Success rates:** Track failed transactions
- **User experience:** Optimize for common operations

## 🎮 **Frontend Integration**

### **1. Web3 Setup**
```javascript
// Using ethers.js
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
```

### **2. React Hook Example**
```javascript
// useContract hook
import { useContract } from 'wagmi';

const contract = useContract({
  address: CONTRACT_ADDRESS,
  abi: CONTRACT_ABI,
  signerOrProvider: signer
});
```

## 🔧 **Maintenance Tasks**

### **Weekly Tasks:**
- Monitor contract balance and fee collection
- Check for unusual transaction patterns
- Review new communities for compliance
- Update documentation if needed

### **Monthly Tasks:**
- Analyze platform growth metrics
- Review and adjust fee structures
- Plan seasonal events
- Security audit reviews

### **Quarterly Tasks:**
- Consider contract upgrades
- Comprehensive security review
- Performance optimization
- Feature roadmap updates

## 📞 **Support & Resources**

### **Technical Support:**
- **Base Discord:** https://discord.gg/base
- **Documentation:** https://docs.base.org
- **Github:** Repository with issues and discussions

### **Emergency Contacts:**
- **Primary Developer:** [Your contact]
- **Security Team:** [Security contact]
- **Community Manager:** [Community contact]

---

**Deployment Checklist:**
- [ ] Test on Base testnet first
- [ ] Verify all contract parameters
- [ ] Set up monitoring and alerts
- [ ] Configure multi-sig wallet
- [ ] Document all addresses and keys
- [ ] Test emergency procedures
- [ ] Verify contract on BaseScan
- [ ] Set up frontend integration
- [ ] Create user documentation
- [ ] Announce launch to community

*Remember: Always test thoroughly on testnet before mainnet deployment. Keep private keys secure and use multi-sig wallets for production.*
*(Pamiętaj: Zawsze testuj dokładnie na testnecie przed wdrożeniem na mainnet. Trzymaj klucze prywatne w bezpiecznym miejscu i używaj portfeli multi-sig w środowisku produkcyjnym.)* 