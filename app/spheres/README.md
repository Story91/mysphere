# Spheres (HybridCommunityPlatform) Deployment

## Overview
This directory contains the deployment setup for the Spheres contract (HybridCommunityPlatform) - a comprehensive community management platform with NFT integration, gaming mechanics, and economic features.

## Features
- **Community Management**: Create and manage communities with subscription models
- **NFT Integration**: Soulbound membership NFTs and collectible utility box NFTs
- **Gaming Mechanics**: Mystery boxes, utility boxes, achievements, and boost system
- **Economic Features**: Platform fees, member subscriptions, event monetization
- **Governance**: Proposal voting and moderation tools

## Prerequisites
- Node.js and npm
- Hardhat installed
- Base Sepolia testnet setup with test ETH
- Environment variables configured

## Environment Setup

Create a `.env` file in the root directory with:
```
PRIVATE_KEY=your_private_key_here
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=your_basescan_api_key
```

## Installation

```bash
# Navigate to spheres directory
cd BaseBook/app/spheres

# Install dependencies (if not already installed in root)
npm install

# Compile contracts
npx hardhat compile
```

## Deployment

### Step 1: Test Deployment
```bash
# Deploy to Base Sepolia testnet
npx hardhat run scripts/deploy-spheres.js --network base-sepolia
```

### Step 2: Upload Metadata to IPFS
The deployment script will show TODO items for uploading JSON metadata:
1. Upload `./nft/soulbound-nft.json` to IPFS
2. Upload `./nft/utilitybox-champion.json` to IPFS
3. Update the contract with the new JSON URIs

### Step 3: Update Contract Configuration
After getting IPFS hashes, update the script configuration and re-run specific functions:
```bash
# Update utilityBoxNftUri in contract
npx hardhat run scripts/update-metadata-uri.js --network base-sepolia
```

## Contract Structure

### Main Contract: HybridCommunityPlatform
- **Location**: `./contracts/spheres.sol`
- **Type**: ERC721 with additional features
- **Features**: Community management, NFT minting, gaming mechanics

### Key Functions
- `createCommunity()`: Create new communities
- `joinCommunity()`: Join existing communities
- `openMysteryBox()`: Gaming mechanics
- `openUtilityBox()`: Utility rewards
- `unlockPremiumAchievement()`: Achievement system

## Configuration

### Fees Structure
- Creation Fee: 0.01 ETH
- Utility Box Fee: 0.0001 ETH
- Mystery Box Bets: 0.00035 - 0.01 ETH
- Platform Fee: 2.5% (configurable)

### NFT Metadata
- **Soulbound NFT**: Non-transferable membership tokens
- **Utility Box Champion**: Rare collectible from utility boxes
- **Images**: Stored on IPFS via Pinata

## Deployment Output

After successful deployment, you'll find:
- `deployment-spheres.json`: Contract addresses and configuration
- Console output with contract interaction examples
- TODO list for remaining configuration steps

## Testing

```bash
# Run tests
npx hardhat test

# Run specific test file
npx hardhat test test/spheres.test.js
```

## Verification

```bash
# Verify contract on BaseScan
npx hardhat verify --network base-sepolia CONTRACT_ADDRESS
```

## Frontend Integration

After deployment, update your frontend configuration:
1. Use the contract address from `deployment-spheres.json`
2. Import the ABI from `./artifacts/contracts/spheres.sol/HybridCommunityPlatform.json`
3. Configure IPFS URIs for metadata

## Security Considerations

- All fees are configurable by owner
- Platform has emergency pause functionality
- Withdrawals have built-in fee protection
- Mystery box has prize pool management

## Support

For issues or questions:
- Check the deployment logs in `deployment-spheres.json`
- Verify contract configuration using view functions
- Ensure sufficient ETH balance for transactions

## Next Steps

1. Complete IPFS metadata upload
2. Test all contract functions
3. Deploy to mainnet when ready
4. Update frontend configuration
5. Set up monitoring and analytics 