# 💰 Fee Structure & Revenue Model

## 🏦 **Current On-Chain Fees** (Obecne Opłaty w Kontrakcie)

### 1. **Community Creation Fee**
```solidity
uint256 public creationFeeEth = 0.01 ether; // 0.01 ETH to create a community
```
- **Who pays:** Community creators
- **When:** When calling `createCommunity()`
- **Where it goes:** To the contract owner

### 2. **Transaction Fee (NEW!)**
```solidity
uint256 public transactionFeePercentage = 5; // 0.5% of every payment
```
- **Who pays:** All users on every transaction
- **How much:** 0.5% of the payment amount
- **Where it goes:** To the contract owner
- **Example:** You pay 0.1 ETH → Transaction fee: 0.0005 ETH

### 3. **Platform Fee (Commission)**
```solidity
uint256 public defaultPlatformFeePercentage = 25; // 2.5%
uint256 public maxPlatformFeePercentage = 100; // 10%
```
- **Who pays:** Members when joining and participating in events
- **How much:** 2.5% by default (max 10%)
- **Where it goes:** To the contract owner

### 4. **Event Creation Fee (NEW!)**
```solidity
uint256 public eventPlatformFee = 0.002 ether; // 0.002 ETH per event
```
- **Who pays:** Moderators creating events
- **Where it goes:** To the contract owner

### 5. **Membership Fees**
```solidity
// Defined by the community creator
uint128 joinFeeEth;        // Fee to join
uint128 monthlySubFeeEth;  // Monthly subscription
uint128 lifetimeSubFeeEth; // Lifetime subscription
```
- **Who pays:** New members
- **Where it goes:** To the community (minus platform fee + transaction fee)

### 6. **Mystery Box (Game for ETH)**
```solidity
uint256 public minMysteryBoxBet = 0.00035 ether;
uint256 public maxMysteryBoxBet = 0.01 ether;
```
- **Who pays:** Users playing `openMysteryBox`.
- **Where it goes:** The player's stake goes to the prize pool (`mysteryBoxPrizePool`). The platform earns from the built-in "House Edge" (~5%) and the transaction fee (0.5%).

### 7. **Utility Box Fee (NEW!)**
```solidity
uint256 public utilityBoxFee = 0.0001 ether;
```
- **Who pays:** Users playing `openUtilityBox`.
- **Where it goes:** 100% of this fee goes to the contract owner. This is pure profit for the platform, as the rewards are virtual.

### 8. **Boost Purchase Fee (NEW!)**
```solidity
uint256 public boostPurchaseFee = 0.0005 ether; // 0.0005 ETH per boost (LOWERED!)
```
- **Who pays:** Users buying boosts
- **Where it goes:** To the contract owner
- **Boost Types:** Experience (2x), Reputation (1.5x), Event Discount (20%)
- **🔥 MUCH MORE ACCESSIBLE:** From ~$30 down to ~$1.50!

### 9. **Premium Achievement Fee (NEW!)**
```solidity
uint256 public achievementUnlockFee = 0.0005 ether; // 0.0005 ETH per unlock (LOWERED!)
```
- **Who pays:** Users unlocking premium achievements (if they don't have a voucher)
- **Where it goes:** To the contract owner
- **🔥 MUCH MORE ACCESSIBLE:** From ~$15 down to ~$1.50!

### 10. **Withdrawal Fee (NEW!)**
```solidity
uint256 public withdrawalFeePercentage = 10; // 1% of the withdrawal amount
```
- **Who pays:** Community creators withdrawing funds
- **How much:** 1% of the withdrawal amount
- **Where it goes:** To the contract owner

### 11. **Challenge Stakes**
```solidity
uint128 stakeAmount; // The stake in a challenge
```
- **Who pays:** Challenger and Challenged
- **Where it goes:** To the winner (+ transaction fee to the platform)

## 💡 **Additional Monetization Opportunities** (Dodatkowe Możliwości Zarabiania)

### 🎯 **Proposed New Fees** (Proponowane Nowe Opłaty)

#### 1. **Transaction Fee on all operations** (Opłata transakcyjna od wszystkich operacji)
```solidity
uint256 public transactionFeePercentage = 5; // 0.5%

modifier withTransactionFee() {
    uint256 fee = msg.value * transactionFeePercentage / 1000;
    require(msg.value >= fee, "Insufficient transaction fee");
    payable(owner()).transfer(fee);
    _;
}
```

#### 2. **Premium Features Fee** (Opłata za funkcje Premium)
```solidity
uint256 public premiumFeaturesFee = 0.005 ether; // 0.005 ETH

// Premium features:
- Custom NFT collectibles
- Advanced analytics
- Priority support
- Custom community themes
```

#### 3. **Withdrawal Fee** (Opłata za Wypłatę)
```solidity
uint256 public withdrawalFeePercentage = 10; // 1%

function withdrawCommunityFunds(uint256 _communityId, uint256 _amount) external {
    uint256 fee = _amount * withdrawalFeePercentage / 1000;
    uint256 netAmount = _amount - fee;
    // Transfer fee to platform
    // Transfer netAmount to creator
}
```

#### 4. **Listing Fee for Communities** (Opłata za Listowanie Społeczności)
```solidity
uint256 public listingFee = 0.002 ether; // 0.002 ETH

function promoteCommuinity(uint256 _communityId) external payable {
    require(msg.value >= listingFee, "Insufficient listing fee");
    // Add to promoted communities list
}
```

#### 5. **NFT Marketplace Fee** (Opłata na Rynku NFT)
```solidity
uint256 public nftMarketplaceFee = 250; // 2.5%

function sellCollectibleNFT(uint256 _tokenId, uint256 _price) external {
    uint256 fee = _price * nftMarketplaceFee / 10000;
    // Platform takes fee from sale
}
```

#### 6. **Mentor Program Fee** (Opłata za Program Mentorski)
```solidity
uint256 public mentorProgramFee = 0.001 ether; // 0.001 ETH

function becomeMentor(uint256 _communityId) external payable {
    require(msg.value >= mentorProgramFee, "Insufficient mentor fee");
    // Allow becoming mentor
}
```

#### 7. **Cross-Community Visit Fee** (Opłata za Wizytę Między Społecznościami)
```solidity
uint256 public visitFee = 0.0005 ether; // 0.0005 ETH

function startCrossCommunityVisit(uint256 _from, uint256 _to) external payable {
    require(msg.value >= visitFee, "Insufficient visit fee");
    // Enable cross-community visit
}
```

#### 8. **Governance Proposal Fee** (Opłata za Propozycję Zarządzania)
```solidity
uint256 public proposalFee = 0.001 ether; // 0.001 ETH

function createProposal(...) external payable {
    require(msg.value >= proposalFee, "Insufficient proposal fee");
    // Create governance proposal
}
```

## 📊 **Revenue Examples (UPDATED!)** (Przykładowe Przychody (ZAKTUALIZOWANE!))

### **Scenario: 100 active communities** (Scenariusz: 100 aktywnych społeczności)

**Monthly revenue:**
- **Creation fees:** 10 new communities × 0.01 ETH = 0.1 ETH
- **Transaction fees:** 2000 transactions × 0.01 ETH × 0.5% = 0.1 ETH
- **Platform fees:** 1000 transactions × 0.01 ETH × 2.5% = 0.25 ETH
- **Event creation fees:** 200 events × 0.002 ETH = 0.4 ETH
- **Mystery boxes (house edge):** 1000 stakes (avg. 0.001 ETH) * 5% = 0.05 ETH
- **Utility boxes:** 2000 openings × 0.0001 ETH = 0.2 ETH
- **Boost purchases:** 100 boosts × 0.0005 ETH = 0.05 ETH
- **Premium achievements:** 50 unlocks × 0.0005 ETH = 0.025 ETH
- **Withdrawal fees:** 10 ETH withdrawn × 1% = 0.1 ETH

**Total monthly revenue:** ~1.175 ETH

### **With ETH price at $3000:** (Przy cenie ETH = $3000)
**Monthly revenue:** $3,525
**Annual revenue:** $42,300

### **Optimistic Scenario (500 communities):** (Scenariusz optymistyczny (500 społeczności))
**Monthly revenue:** ~5.625 ETH = $16,875
**Annual revenue:** $202,500

### **💡 Benefits of Lowered Fees:** (Korzyści z obniżonych opłat)
- **Much higher adoption** - boosts from ~$30 down to ~$1.50
- **More transactions** - lower entry barrier
- **Better user retention** - affordable prices
- **Potentially higher revenue** from a larger user base

## 🚀 **Boost System - New Revenue Source** (System Boostów - Nowe Źródło Przychodów)

### **Boost Types:**

#### 1. **Experience Multiplier (2x)**
- **Fee:** 0.0005 ETH (~$1.50)
- **Effect:** Doubles respect points from all activities
- **Time:** 1 hour - 30 days (user chooses)
- **Example:** Normally 50 points → with boost 100 points

#### 2. **Reputation Multiplier (1.5x)**
- **Fee:** 0.0005 ETH (~$1.50)
- **Effect:** Increases reputation gain by 50%
- **Popular:** For quickly achieving high reputation

#### 3. **Event Discount (20%)**
- **Fee:** 0.0005 ETH (~$1.50)
- **Effect:** 20% discount on all event fees
- **Savings:** Significant savings on expensive events

### **Mechanism:** (Mechanizm Działania)
```solidity
struct Boost {
    BoostType boostType;
    uint32 expiresAt;
    uint16 multiplier;
    bool active;
}

function purchaseBoost(BoostType _boostType, uint32 _duration) external payable {
    // Purchase a boost for a specific duration
    // Can extend existing boosts
}
```

## 🎯 **Monetization Strategy** (Strategia Monetyzacji)

### **Phase 1: Basic Fees**
- Community creation fee
- Platform fee on transactions
- Mystery box fee
- **Transaction fee on all operations**

### **Phase 2: Premium features**
- **Boost system** (main revenue driver)
- **Premium achievements**
- **Event creation fees**
- **Withdrawal fees**

### **Phase 3: Expansion**
- Cross-chain communities
- Mobile app premium
- Enterprise solutions
- Advanced boost types

## ⚖️ **Price-Value Balance** (Równowaga Cena-Wartość)

### **Principles:** (Zasady)
1. **Fees cannot be too high** - they kill adoption
2. **Value must exceed cost**
3. **Progressive pricing** - pay more for more features
4. **Rewards program** - cashback for active users

### **Example Tiers:** (Przykładowe Tiers)
- **Free:** Basic features
- **Pro ($5/month):** Advanced features
- **Enterprise ($50/month):** Full capabilities

## 🔥 **Micropayments - Additional Ideas** (Mikropłatności - Dodatkowe Pomysły)

### **Gas Optimization Fee**
```solidity
uint256 public gasOptimizationFee = 0.0001 ether; // 0.0001 ETH
// Users pay for batch transactions
```

### **Priority Queue Fee**
```solidity
uint256 public priorityFee = 0.0002 ether; // 0.0002 ETH
// Faster transaction processing
```

### **Data Storage Fee**
```solidity
uint256 public storageFee = 0.00005 ether; // 0.00005 ETH per KB
// Storing additional data
```

### **API Access Fee**
```solidity
uint256 public apiAccessFee = 0.00001 ether; // 0.00001 ETH per call
// API access for external apps
```

## 🎮 **Gamification Revenue**

### **Achievement Unlock Fee**
```solidity
uint256 public achievementFee = 0.0001 ether; // 0.0001 ETH
// Faster achievement unlocking
```

### **Boost Purchase**
```solidity
uint256 public boostFee = 0.001 ether; // 0.001 ETH
// 2x respect points for 24h
```

### **Leaderboard Premium**
```solidity
uint256 public leaderboardFee = 0.0005 ether; // 0.0005 ETH
// Access to advanced leaderboards
```

---

**Summary:** Micropayments can generate significant revenue with high transaction volume. The key is to find a balance between fees and user value.
*(Podsumowanie: Mikropłatności mogą generować znaczne przychody przy wysokim wolumenie transakcji. Kluczowe jest znalezienie balansu między opłatami a wartością dla użytkowników.)* 