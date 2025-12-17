# MySphere Smart Contracts - All Networks

This document contains all verified smart contract addresses used in the MySphere application across different blockchain networks.

## Base Network (Chain ID: 8453)

### Social & Content Contracts
- **OnchainPost Contract**
  - Address: `0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7`
  - Explorer: [BaseScan](https://basescan.org/address/0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7)
  - Purpose: Main post creation contract for Base Network
  - Function: `createPost(string contentHash)`, `totalPosts()`

- **QuotesOnBase Contract**
  - Address: `0x9c44802843a670732383f62b2f3304f92ec1702b`
  - Explorer: [BaseScan](https://basescan.org/address/0x9c44802843a670732383f62b2f3304f92ec1702b)
  - Purpose: Crypto quotes NFT collection
  - Function: `totalSupply()`

### NFT Collections
- **SPHERE Pioneer NFT**
  - Address: `0x8edb8B2383f41e14b49414dd32c4A786Ed2e277d`
  - Explorer: [BaseScan](https://basescan.org/address/0x8edb8B2383f41e14b49414dd32c4A786Ed2e277d)
  - Purpose: Pioneer tier NFT collection
  - Function: `totalSupply()`

- **SPHERE Guardian NFT**
  - Address: `0x4087EFD20F2A91ADeAa2b7259F61d04d1e5B233E`
  - Explorer: [BaseScan](https://basescan.org/address/0x4087EFD20F2A91ADeAa2b7259F61d04d1e5B233E)
  - Purpose: Guardian tier NFT collection
  - Function: `totalSupply()`

- **SPHERE Master NFT**
  - Address: `0x6d55153A6B1d1157f19D403DEd541fbe6De48C5A`
  - Explorer: [BaseScan](https://basescan.org/address/0x6d55153A6B1d1157f19D403DEd541fbe6De48C5A)
  - Purpose: Master tier NFT collection
  - Function: `totalSupply()`

---

## Camp Network (Chain ID: 484)

### Social & Content Contracts
- **Camp Network Post Contract**
  - Address: `0x71bE438ee579de33EBf353579A413439Db042CA5`
  - Explorer: [Camp Blockscout](https://camp.cloud.blockscout.com/address/0x71bE438ee579de33EBf353579A413439Db042CA5)
  - Purpose: Post creation contract for Camp Network
  - Function: `createPost(string contentHash)`, `totalPosts()`

- **PORTAL MSxCAMP NFT**
  - Address: `0x57CC99c9E1942a34a0cfF7FCC27c227455f14587`
  - Explorer: [BaseCamp Blockscout](https://basecamp.cloud.blockscout.com/token/0x57CC99c9E1942a34a0cfF7FCC27c227455f14587)
  - Purpose: ERC1155 NFT collection for MySphere X Camp Network integration
  - Function: `claim()`, `totalClaimed()`, `hasClaimed(address)`

### Marketplace Contracts
- **IP Market v3 (SimpleIPNFTMarketplace)**
  - Address: `0xF528f920d0ce1D1EA230B0ec10F0F64B8F43cbac`
  - Explorer: [BaseCamp Blockscout](https://basecamp.cloud.blockscout.com/address/0xF528f920d0ce1D1EA230B0ec10F0F64B8F43cbac)
  - Purpose: IP NFT marketplace with listings, auctions, and licensing
  - Functions: `createListing()`, `createAuction()`, `buyNFT()`, `registerIpNFT()`, `totalPosts()`

- **Default IP NFT Contract**
  - Address: `0xF90733b9eCDa3b49C250B2C3E3E42c96fC93324E`
  - Explorer: [BaseCamp Blockscout](https://basecamp.cloud.blockscout.com/address/0xF90733b9eCDa3b49C250B2C3E3E42c96fC93324E)
  - Purpose: Main IP NFT collection used for marketplace listings

---

## Linea Network (Chain ID: 59144)

### Social & Content Contracts
- **Linea Post Contract**
  - Address: `0x9fB36660849D85CEe6609f6020af3336aB7541f5`
  - Explorer: [LineaScan](https://lineascan.build/address/0x9fB36660849D85CEe6609f6020af3336aB7541f5)
  - Purpose: Post creation contract for Linea Network
  - Function: `createPost(string contentHash)`, `totalPosts()`

---

## Network Configuration

### Base Network
- **Chain ID**: 8453
- **RPC URL**: `https://mainnet.base.org`
- **Block Explorer**: [BaseScan](https://basescan.org)
- **Native Currency**: ETH

### Camp Network
- **Chain ID**: 484
- **RPC URL**: `https://rpc.camp.raas.gelato.cloud`
- **Block Explorer**: [Camp Blockscout](https://camp.cloud.blockscout.com)
- **Native Currency**: CAMP Token (ETH)

### Linea Network
- **Chain ID**: 59144
- **RPC URL**: `https://linea-rpc.publicnode.com`
- **Block Explorer**: [LineaScan](https://lineascan.build)
- **Native Currency**: ETH

---

## Contract Verification Status

All contracts listed above are **verified** on their respective block explorers and can be viewed with full source code.

---

## Last Updated
- Date: 2024
- All contracts are deployed and active on mainnet

