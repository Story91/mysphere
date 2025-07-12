# 👑 Owner Functions Guide
*Guide for contract owner functions (Przewodnik funkcji dla właściciela kontraktu)*

## 🔐 **Overview**
As the contract owner, you have full administrative control over the HybridCommunityPlatform. This guide covers all owner-only functions with detailed explanations and usage examples based on the actual contract implementation.

## 📋 **Core Administrative Functions**

### 1. **Community Management**
*Zarządzanie społecznościami*

#### `suspendCommunity(uint256 _communityId)`
**Purpose:** Temporarily suspend a community (Tymczasowe zawieszenie społeczności)
```solidity
function suspendCommunity(uint256 _communityId) external onlyOwner
```
- **When to use:** Community violates terms, suspicious activity
- **Effect:** Sets status to SUSPENDED, decrements activeCommunities counter
- **Reversible:** Yes, using `reactivateCommunity()`

#### `reactivateCommunity(uint256 _communityId)`
**Purpose:** Reactivate a suspended community (Reaktywacja zawieszonej społeczności)
```solidity
function reactivateCommunity(uint256 _communityId) external onlyOwner
```
- **When to use:** After resolving issues with suspended community
- **Effect:** Sets status to ACTIVE, increments activeCommunities counter

### 2. **User Management**
*Zarządzanie użytkownikami*

#### `globalBanUser(address _user)`
**Purpose:** Ban user from entire platform (Globalny ban użytkownika)
```solidity
function globalBanUser(address _user) external onlyOwner
```
- **When to use:** Serious violations, spam, abuse
- **Effect:** User can't join any community or participate in any functions
- **Permanent:** Until `globalUnbanUser()` is called

#### `globalUnbanUser(address _user)`
**Purpose:** Remove global ban (Usunięcie globalnego bana)
```solidity
function globalUnbanUser(address _user) external onlyOwner
```
- **When to use:** Appeal accepted, wrongful ban
- **Effect:** User can participate again in all platform functions

### 3. **Fee Management**
*Zarządzanie opłatami*

#### `setPlatformFeePercentage(uint256 _communityId, uint256 _percentage)`
**Purpose:** Set platform fee for a specific community (Ustawienie opłaty platformy dla konkretnej społeczności)
```solidity
function setPlatformFeePercentage(uint256 _communityId, uint256 _percentage) external onlyOwner
```
- **Parameters:**
  - `_communityId`: Community ID
  - `_percentage`: 0-100 (maximum 10% = 100)
- **Default:** 25 (2.5%)
- **Maximum:** 100 (10%)
- **When to use:** Custom fee structure, partnerships, penalties

#### `setCreationFee(uint256 _newFee)`
**Purpose:** Change community creation fee (Zmiana opłaty za stworzenie społeczności)
```solidity
function setCreationFee(uint256 _newFee) external onlyOwner
```
- **Default:** 0.01 ETH
- **When to use:** Market conditions, platform growth strategy

#### **Transaction Fee Percentage (CONSTANT!)**
**Purpose:** Transaction fee is hardcoded constant (Opłata transakcyjna jest stałą wartością)
```solidity
uint256 constant public TRANSACTION_FEE_PERCENTAGE = 5; // 0.5% = 5/1000
```
- **Value:** 5 (0.5%) - CANNOT BE CHANGED
- **Reason:** Ensures predictable fees for users and stable revenue

#### `setWithdrawalFeePercentage(uint256 _newPercentage)`
**Purpose:** Set withdrawal fee percentage (Ustawienie procentowej opłaty za wypłatę)
```solidity
function setWithdrawalFeePercentage(uint256 _newPercentage) external onlyOwner
```
- **Default:** 10 (1%)
- **Maximum:** 100 (10%)
- **When to use:** Revenue optimization, prevent frequent withdrawals

#### `setAchievementUnlockFee(uint256 _newFee)`
**Purpose:** Set premium achievement unlock fee (Ustawienie opłaty za odblokowanie premium achievement)
```solidity
function setAchievementUnlockFee(uint256 _newFee) external onlyOwner
```
- **Default:** 0.0005 ETH (~$1.50 at $3000 ETH)
- **When to use:** Balance premium feature pricing

#### `setBoostPurchaseFee(uint256 _newFee)`
**Purpose:** Set boost purchase fee (Ustawienie opłaty za zakup boosta)
```solidity
function setBoostPurchaseFee(uint256 _newFee) external onlyOwner
```
- **Default:** 0.0005 ETH (~$1.50 at $3000 ETH)
- **When to use:** Adjust boost system profitability

#### `setEventPlatformFee(uint256 _newFee)`
**Purpose:** Set event creation fee (Ustawienie opłaty za stworzenie eventu)
```solidity
function setEventPlatformFee(uint256 _newFee) external onlyOwner
```
- **Default:** 0.002 ETH (~$6 at $3000 ETH)
- **When to use:** Balance event creation costs vs. accessibility

### 4. **🎲 Game Management**
*Zarządzanie grami MysteryBox i UtilityBox*

#### `fundMysteryBoxPool()`
**Purpose:** Fund the MysteryBox prize pool (Zasilenie puli nagród MysteryBox)
```solidity
function fundMysteryBoxPool() external payable onlyOwner
```
- **When to use:** **Critical before platform launch!** Initial funding required to cover big wins
- **Effect:** Increases `mysteryBoxPrizePool` by `msg.value`
- **Strategy:** Fund with enough ETH to cover maximum potential payouts

#### `withdrawFromPrizePool(uint256 _amount)`
**Purpose:** Withdraw excess funds from prize pool (Wypłata nadwyżki z puli nagród)
```solidity
function withdrawFromPrizePool(uint256 _amount) external onlyOwner
```
- **Requirements:** Prize pool must have sufficient balance
- **When to use:** When prize pool has accumulated excess funds
- **Effect:** Decreases `mysteryBoxPrizePool` by `_amount`

#### `setMysteryBoxBetLimits(uint256 _minBet, uint256 _maxBet)`
**Purpose:** Set min/max bet for MysteryBox (Ustawienie limitów stawek dla MysteryBox)
```solidity
function setMysteryBoxBetLimits(uint256 _minBet, uint256 _maxBet) external onlyOwner
```
- **Requirements:** `_minBet > 0` and `_minBet < _maxBet`
- **Defaults:** min: 0.00035 ETH, max: 0.01 ETH
- **When to use:** Adjust for ETH price changes, control risk exposure

#### `setUtilityBoxFee(uint256 _newFee)`
**Purpose:** Set the fee for the UtilityBox (Ustawienie opłaty za UtilityBox)
```solidity
function setUtilityBoxFee(uint256 _newFee) external onlyOwner
```
- **Requirements:** `_newFee > 0`
- **Default:** 0.0001 ETH (~$0.30 at $3000 ETH)
- **When to use:** Adjust price based on reward value and demand

#### `setUtilityBoxNftUri(string memory _newUri)`
**Purpose:** Set the metadata URI for the UtilityBox NFT reward (Ustawienie URI metadanych dla NFT)
```solidity
function setUtilityBoxNftUri(string memory _newUri) external onlyOwner
```
- **When to use:** **Required before platform launch!** Must set IPFS URI for NFT metadata
- **Effect:** Updates `utilityBoxNftUri` string
- **Format:** Usually IPFS hash like "ipfs://QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

### 5. **Seasonal Events**
*Wydarzenia sezonowe*

#### `createSeasonalEvent(...)`
**Purpose:** Create platform-wide seasonal event (Tworzenie wydarzeń sezonowych na całą platformę)
```solidity
function createSeasonalEvent(
    string memory _name,
    uint32 _startTime,
    uint32 _endTime,
    uint32[] memory _participatingCommunities
) external onlyOwner
```
- **Requirements:** 
  - `_startTime` must be in future
  - `_endTime` must be after `_startTime`
- **Parameters:**
  - `_name`: Event name (e.g., "Winter Championship")
  - `_startTime`: Unix timestamp
  - `_endTime`: Unix timestamp  
  - `_participatingCommunities`: Array of community IDs
- **Effect:** Creates new seasonal event, emits `SeasonalEventCreated`
- **When to use:** Platform-wide competitions, special occasions

#### `startNewSeason()`
**Purpose:** Start new season (Rozpoczęcie nowego sezonu)
```solidity
function startNewSeason() external onlyOwner
```
- **Effect:** Increments `currentSeason` counter
- **Event:** Emits `SeasonalEventCreated` with "New Season Started"
- **When to use:** Quarterly/yearly, major platform updates

### 6. **NFT Management**
*Zarządzanie NFT*

#### `mintCollectibleNFT(address _recipient, string memory _tokenURI, string memory _category)`
**Purpose:** Mint special collectible NFT (Mintowanie specjalnych NFT kolekcjonerskich)
```solidity
function mintCollectibleNFT(address _recipient, string memory _tokenURI, string memory _category) external onlyOwner
```
- **Parameters:**
  - `_recipient`: User receiving NFT
  - `_tokenURI`: Metadata URI (IPFS link)
  - `_category`: NFT category (e.g., "SpecialEvent", "Founder")
- **Effect:** 
  - Mints new NFT with incremented token ID
  - Unlocks COLLECTIBLE_RECEIVED achievement
  - Emits `CollectibleMinted` event
- **When to use:** Special rewards, partnerships, unique events

### 7. **Emergency Functions**
*Funkcje awaryjne*

#### `pause()`
**Purpose:** Pause entire platform (Zatrzymanie całej platformy)
```solidity
function pause() external onlyOwner
```
- **When to use:** Security vulnerability, maintenance, emergency
- **Effect:** All user functions disabled (whenNotPaused modifier)

#### `unpause()`
**Purpose:** Resume platform operations (Wznowienie działania platformy)
```solidity
function unpause() external onlyOwner
```
- **When to use:** After resolving emergency situation
- **Effect:** All user functions re-enabled

#### `emergencyWithdraw()`
**Purpose:** Emergency withdrawal of all funds (Awaryjna wypłata wszystkich środków)
```solidity
function emergencyWithdraw() external onlyOwner
```
- **When to use:** Critical security issue, platform shutdown
- **Effect:** All contract ETH sent to owner address
- **⚠️ WARNING:** Use only in extreme situations - will break all game functions

## 🎯 **Best Practices**

### **1. Community Moderation**
- **Regular monitoring:** Check community activity and reports
- **Graduated responses:** Warning → Suspension → Ban
- **Documentation:** Keep records of all actions taken
- **Appeal process:** Allow communities to appeal suspensions

### **2. Fee Management**
- **Market research:** Monitor competitor fees and ETH price
- **User feedback:** Consider community input before changes
- **Gradual changes:** Avoid sudden large fee increases
- **Testing:** Use testnet to verify fee changes work correctly

### **3. Game Pool Management**
- **Initial funding:** Fund MysteryBox pool with substantial amount before launch
- **Regular monitoring:** Check pool balance vs. potential max payouts
- **Rebalancing:** Withdraw excess or add funds as needed
- **Risk management:** Set bet limits appropriate for pool size

### **4. Event Planning**
- **Advance notice:** Announce seasonal events early
- **Fair participation:** Ensure all communities can participate
- **Reward distribution:** Plan prize pools carefully
- **Cross-community coordination:** Encourage collaboration

### **5. Emergency Preparedness**
- **Monitoring tools:** Set up alerts for unusual activity
- **Response plan:** Have clear procedures for emergencies
- **Communication:** Keep users informed during issues
- **Security audits:** Regular code reviews and testing

## 📊 **Owner Dashboard Metrics**

### **Key Statistics to Monitor:**
- **Platform Stats:** via `getPlatformStats()`
  - Total communities: `platformStats.totalCommunities`
  - Active communities: `platformStats.activeCommunities`
  - Total members: `platformStats.totalMembers`
  - Total volume: `platformStats.totalVolume`
  - Platform fees collected: `platformStats.totalPlatformFees`

### **Financial Metrics:**
- **MysteryBox pool balance:** `mysteryBoxPrizePool`
- **Daily/weekly fee collection:** Track via events
- **Top communities by revenue:** Analyze community balances
- **User activity trends:** Monitor transaction patterns

### **Security Metrics:**
- **Global bans issued:** Track banned users
- **Community suspensions:** Monitor suspended communities
- **Failed transactions:** Watch for unusual patterns
- **Contract balance:** Ensure sufficient liquidity

## 🔧 **Technical Implementation**

### **Fee Collection Mechanism:**
All owner functions automatically collect fees where applicable:
- Transaction fees (0.5%) collected on all paid functions
- Platform fees (2.5%) collected on community revenue
- 100% of game fees go directly to owner

### **Event Monitoring:**
Key events to monitor:
- `PlatformFeeCollected` - Revenue tracking
- `TransactionFeeCharged` - Volume tracking
- `FundsWithdrawn` - Community activity
- `CommunityCreated` - Growth metrics

### **Security Features:**
- **Reentrancy protection:** All functions use nonReentrant where needed
- **Access control:** Strict onlyOwner modifiers
- **Input validation:** All parameters validated
- **Emergency controls:** Pause/unpause system

## 📈 **Growth Strategy**

### **Platform Development:**
- **Regular fee optimization:** Adjust fees based on usage and market
- **New features:** Add seasonal events and special promotions
- **Community incentives:** Use NFT rewards to drive engagement
- **Partnership programs:** Custom fee structures for partners

### **Revenue Optimization:**
- **Game balancing:** Optimize MysteryBox probabilities for profitability
- **Premium features:** Introduce new paid features
- **Volume incentives:** Encourage high-volume communities
- **Cross-promotion:** Use seasonal events to drive engagement

### **Risk Management:**
- **Liquidity management:** Maintain sufficient ETH reserves
- **Legal compliance:** Ensure all features meet regulations
- **Community health:** Monitor and maintain platform reputation
- **Technical security:** Regular audits and updates

## 🎮 **Game Economics Management**

### **MysteryBox Economics:**
- **House edge:** Built into probabilities (~3% expected profit)
- **Pool management:** Maintain 2-3x maximum payout in reserve
- **Risk assessment:** Monitor large bets vs. pool size
- **Profitability:** Track revenue vs. payouts over time

### **UtilityBox Economics:**
- **Pure profit:** 100% of fees (rewards are virtual)
- **Demand optimization:** Adjust price based on usage
- **Reward balancing:** Ensure rewards drive engagement
- **Volume tracking:** Monitor daily/weekly usage patterns

This comprehensive guide provides everything needed to effectively manage and grow the HybridCommunityPlatform as the contract owner. Regular monitoring and strategic adjustments will ensure long-term success and profitability. 