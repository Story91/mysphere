import fs from "fs";
import path from "path";

// Manual deployment helper for Base mainnet
async function main() {
  console.log("🚀 PaidPinContract Deployment Helper");
  console.log("======================================");

  console.log("\n📝 Contract Location:");
  console.log("File: contracts/PaidPinContract.sol");
  
  console.log("\n💰 Contract Features:");
  console.log("✅ Pin posts for 1h, 6h, 24h, or 7 days");
  console.log("✅ Prices: 0.0005, 0.002, 0.005, 0.02 ETH");
  console.log("✅ Auto-refund excess payments");
  console.log("✅ Owner can withdraw revenue");
  console.log("✅ Emergency pause functionality");
  console.log("✅ Extend pin duration");
  console.log("✅ Complete event logging");

  console.log("\n🛠️ Manual Deployment Steps:");
  console.log("1. Open https://remix.ethereum.org");
  console.log("2. Create new file: PaidPinContract.sol");
  console.log("3. Copy contract code from contracts/PaidPinContract.sol");
  console.log("4. Compile with Solidity 0.8.19+");
  console.log("5. Connect MetaMask to Base Mainnet (Chain ID: 8453)");
  console.log("6. Deploy contract (no constructor parameters needed)");
  console.log("7. Copy deployed address");
  console.log("8. Verify on https://basescan.org");

  console.log("\n🌐 Base Mainnet Details:");
  console.log("Chain ID: 8453");
  console.log("RPC: https://mainnet.base.org");
  console.log("Explorer: https://basescan.org");
  console.log("Currency: ETH");

  // Generate frontend config template
  const contractConfigTemplate = `// PaidPinContract configuration for Base Mainnet
// Replace YOUR_CONTRACT_ADDRESS with actual deployed address

export const PAID_PIN_CONTRACT_CONFIG = {
  address: "YOUR_CONTRACT_ADDRESS", // Replace after deployment
  chainId: 8453, // Base Mainnet
  blockExplorer: "https://basescan.org"
};

// Contract ABI for frontend integration
export const PAID_PIN_CONTRACT_ABI = [
  "function pinPost(string memory postId, uint8 duration) external payable",
  "function extendPin(string memory postId, uint8 additionalDuration) external payable", 
  "function isPinActive(string memory postId) external view returns (bool)",
  "function getPinDetails(string memory postId) external view returns (tuple(address owner, string postId, uint8 duration, uint256 paidAmount, uint256 expiresAt, bool isActive, uint256 createdAt))",
  "function getPrice(uint8 duration) external view returns (uint256)",
  "function getUserPins(address user) external view returns (string[] memory)",
  "function getTotalPins() external view returns (uint256)",
  "function getBalance() external view returns (uint256)",
  "function owner() external view returns (address)",
  "event PinCreated(address indexed owner, string indexed postId, uint8 duration, uint256 amount, uint256 expiresAt)",
  "event PinExpired(string indexed postId, address indexed owner)",
  "event PinExtended(string indexed postId, uint256 newExpiresAt, uint256 additionalAmount)"
];

// Duration enum mapping (matches contract)
export enum PinDuration {
  HOUR_1 = 0,
  HOURS_6 = 1, 
  HOURS_24 = 2,
  DAYS_7 = 3
}

// Price mapping in ETH
export const PIN_PRICES = {
  [PinDuration.HOUR_1]: "0.0005",
  [PinDuration.HOURS_6]: "0.002", 
  [PinDuration.HOURS_24]: "0.005",
  [PinDuration.DAYS_7]: "0.02"
};
`;

  // Save template config
  const configDir = path.join(process.cwd(), "config");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  const configFile = path.join(configDir, "paidPinContract.ts");
  fs.writeFileSync(configFile, contractConfigTemplate);

  console.log(`\n💾 Config template saved to: ${configFile}`);
  console.log("📝 Remember to update YOUR_CONTRACT_ADDRESS after deployment!");

  // Generate deployment checklist
  const checklist = `# PaidPinContract Deployment Checklist

## Pre-deployment
- [ ] Contract compiled successfully in Remix
- [ ] Connected to Base Mainnet (Chain ID: 8453)
- [ ] Have sufficient ETH for gas (~0.01 ETH)
- [ ] Deployer wallet is secure

## Deployment
- [ ] Contract deployed successfully
- [ ] Deployment transaction confirmed
- [ ] Contract address copied
- [ ] Initial prices verified:
  - 1 Hour: 0.0005 ETH
  - 6 Hours: 0.002 ETH  
  - 24 Hours: 0.005 ETH
  - 7 Days: 0.02 ETH

## Post-deployment
- [ ] Contract verified on Basescan
- [ ] Address updated in config/paidPinContract.ts
- [ ] Frontend integration tested
- [ ] Small test transaction completed
- [ ] Monitor for first 24 hours

## Integration
- [ ] Update PaidPinModal.tsx with real contract calls
- [ ] Replace mock transactions
- [ ] Test with small amounts first
- [ ] Deploy to production

Contract Address: _______________
Deployment TX: _______________
Verification TX: _______________
`;

  const checklistFile = path.join(configDir, "deployment-checklist.md");
  fs.writeFileSync(checklistFile, checklist);

  console.log(`📋 Deployment checklist saved to: ${checklistFile}`);

  console.log("\n🎉 Ready for deployment!");
  console.log("🔗 Next: Open Remix IDE and follow the steps above");

  return true;
}

main()
  .then(() => {
    console.log("\n✅ Deployment helper completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  }); 