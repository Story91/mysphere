# 🏗️ HybridCommunityPlatform Contract Documentation
*Complete smart contract documentation based on actual implementation - for frontend developers*

## 📋 **Contract Architecture** (Architektura Kontraktu)

### **🔧 Contract Details:**
- **Name:** HybridCommunityPlatform
- **Symbol:** CMEM (CommunityMembership)
- **Network:** Base Mainnet
- **Standard:** ERC721 (Soulbound NFTs)
- **Inheritance:** ERC721URIStorage, Ownable, ReentrancyGuard, Pausable

### **🎯 Core Features:**
1. **🏘️ Community System** - Create and manage communities (BASE ETH only)
2. **👥 Membership System** - Subscriptions + soulbound membership NFTs
3. **📈 Progression System** - Levels (0-5) based on respect points
4. **🎪 Event System** - Community events with prizes
5. **🏆 Achievement System** - Regular + premium achievements
6. **⚔️ Challenge System** - 1v1 duels between members
7. **🗳️ Proposal System** - Democratic voting
8. **👨‍🏫 Mentorship System** - Experienced members help newcomers
9. **🌐 Cross-Community Visits** - Visit other communities
10. **🎄 Seasonal Events** - Platform-wide events
11. **🎁 Game Boxes** - MysteryBox (ETH) + UtilityBox (items)
12. **⭐ Reputation System** - 1-5 star ratings
13. **🚀 Boost System** - Timed power-ups (3 types)
14. **💸 Withdrawal System** - Community fund management

---

## 🔤 **Enums & Data Types**

### **Enums:**
```solidity
enum MemberRole { MEMBER, MODERATOR, ADMIN }
enum EventType { STANDARD, COMPETITION, SEASONAL, MYSTERY }
enum CommunityStatus { ACTIVE, SUSPENDED, CLOSED }
enum AchievementType { FIRST_JOIN, LEVEL_UP, EVENT_WINNER, REFERRAL_MASTER, STREAK_KEEPER, COLLECTIBLE_RECEIVED }
enum BoostType { EXPERIENCE_MULTIPLIER, REPUTATION_MULTIPLIER, EVENT_DISCOUNT }
```

### **Key Constants:**
```solidity
uint256 constant public TRANSACTION_FEE_PERCENTAGE = 5; // 0.5% (CANNOT BE CHANGED)
uint256 public creationFeeEth = 0.01 ether;
uint256 public minMysteryBoxBet = 0.00035 ether;
uint256 public maxMysteryBoxBet = 0.01 ether;
uint256 public utilityBoxFee = 0.0001 ether;
uint256 public achievementUnlockFee = 0.0005 ether;
uint256 public boostPurchaseFee = 0.0005 ether;
uint256 public eventPlatformFee = 0.002 ether;
uint256 public withdrawalFeePercentage = 10; // 1%
uint256 public defaultPlatformFeePercentage = 25; // 2.5%
```

---

## 🎭 **All Contract Functions** (Wszystkie Funkcje Kontraktu)

### **👑 OWNER FUNCTIONS** (Funkcje Właściciela)

#### **🏘️ Community Management:**
```solidity
function suspendCommunity(uint256 _communityId) external onlyOwner
function reactivateCommunity(uint256 _communityId) external onlyOwner
```

#### **👥 User Management:**
```solidity
function globalBanUser(address _user) external onlyOwner
function globalUnbanUser(address _user) external onlyOwner
```

#### **💰 Fee Management:**
```solidity
function setPlatformFeePercentage(uint256 _communityId, uint256 _percentage) external onlyOwner
function setCreationFee(uint256 _newFee) external onlyOwner
function setWithdrawalFeePercentage(uint256 _newPercentage) external onlyOwner
function setAchievementUnlockFee(uint256 _newFee) external onlyOwner
function setBoostPurchaseFee(uint256 _newFee) external onlyOwner
function setEventPlatformFee(uint256 _newFee) external onlyOwner
```

#### **🎲 Game Management:**
```solidity
function fundMysteryBoxPool() external payable onlyOwner
function withdrawFromPrizePool(uint256 _amount) external onlyOwner
function setMysteryBoxBetLimits(uint256 _minBet, uint256 _maxBet) external onlyOwner
function setUtilityBoxFee(uint256 _newFee) external onlyOwner
function setUtilityBoxNftUri(string memory _newUri) external onlyOwner
```

#### **🎄 Seasonal Events:**
```solidity
function createSeasonalEvent(
    string memory _name,
    uint32 _startTime,
    uint32 _endTime,
    uint32[] memory _participatingCommunities
) external onlyOwner
function startNewSeason() external onlyOwner
```

#### **🎨 NFT Management:**
```solidity
function mintCollectibleNFT(
    address _recipient,
    string memory _tokenURI,
    string memory _category
) external onlyOwner
```

#### **🛡️ Emergency Functions:**
```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
function emergencyWithdraw() external onlyOwner
```

---

### **🏗️ COMMUNITY CREATOR FUNCTIONS** (Funkcje Twórcy Społeczności)

#### **👥 Member Management:**
```solidity
function banMember(uint256 _communityId, address _member) external onlyModerator(_communityId)
function unbanMember(uint256 _communityId, address _member) external onlyCreator(_communityId)
function setMemberRole(uint256 _communityId, address _member, MemberRole _role) external onlyCreator(_communityId)
```

#### **💰 Financial Management:**
```solidity
function withdrawCommunityFunds(uint256 _communityId, uint256 _amount) external onlyCreator(_communityId)
// Fee: 1% of withdrawal amount
// Requires: sufficient withdrawableBalance
```

#### **🎨 NFT Rewards:**
```solidity
function awardTopPerformerCollectible(uint256 _communityId, address _performer) external onlyCreator(_communityId)
// Requires: performer level >= 4, reputation >= 80
// Awards: 200 respect points + unique NFT
```

#### **⚔️ Challenge Management:**
```solidity
function completeChallenge(uint256 _challengeId, address _winner) external onlyCreator(_communityId)
// Only creator can judge challenge outcomes
```

---

### **🎮 MODERATOR FUNCTIONS** (Funkcje Moderatora)

#### **🎪 Event Management:**
```solidity
function createEvent(
    uint256 _communityId,
    string memory _description,
    uint128 _feeEth,
    EventType _eventType,
    uint32 _startTime,
    uint32 _endTime,
    uint32 _maxParticipants
) external payable onlyModerator(_communityId)
// Cost: 0.002 ETH platform fee + transaction fee

function finalizeEvent(
    uint256 _communityId,
    uint256 _eventId,
    address[] memory _winners,
    uint128[] memory _rewards
) external onlyModerator(_communityId)
```

#### **👨‍🏫 Mentorship Management:**
```solidity
function assignMentor(
    uint256 _communityId,
    address _mentee,
    address _mentor
) external onlyModerator(_communityId)
```

#### **📢 Communication:**
```solidity
function makeAnnouncement(
    uint256 _communityId,
    string memory _announcement
) external onlyModerator(_communityId)
```

---

### **👥 MEMBER FUNCTIONS** (Funkcje Członków)

#### **🏠 Community Interaction:**
```solidity
function createCommunity(
    string memory _name,
    string memory _description,
    uint128 _joinFeeEth,
    uint128 _monthlySubFeeEth,
    uint128 _lifetimeSubFeeEth
) external payable returns (uint256)
// Cost: 0.01 ETH + transaction fee (0.5%)

function joinCommunity(
    uint256 _communityId,
    bool _lifetime,
    address _referrer
) external payable
// Cost: joinFee + (monthly/lifetime subscription) + transaction fee (0.5%)
```

#### **🎪 Event Participation:**
```solidity
function participateInEvent(uint256 _communityId, uint256 _eventId) external payable
// Cost: event fee + transaction fee (0.5%)
// Boost: 20% discount if EVENT_DISCOUNT boost is active
```

#### **🎁 Game Functions:**
```solidity
function openMysteryBox(uint256 _communityId) external payable
// Cost: variable (0.00035 - 0.01 ETH) + transaction fee (0.5%)
// Rewards: 0.5x, 0.8x, 1.0x, 1.1x, 1.5x, 2.0x of your bet
// Probabilities: 13%, 20%, 50%, 10%, 5%, 2% respectively

function openUtilityBox(uint256 _communityId) external payable
// Cost: fixed 0.0001 ETH (100% goes to platform)
// Rewards: NFT (1%), Voucher (4%), Streak Saver (10%), Boosts (15%), Respect Points (40%), Nothing (30%)
```

#### **🏆 Achievement System:**
```solidity
function unlockPremiumAchievement(AchievementType _achievementType) external payable
// Cost: 0.0005 ETH (~$1.50)

function useAchievementVoucher(AchievementType _achievementType) external
// Uses voucher won from UtilityBox (FREE!)
```

#### **🚀 Boost System:**
```solidity
function purchaseBoost(BoostType _boostType, uint32 _duration) external payable
// Cost: 0.0005 ETH (~$1.50)
// Duration: 1 hour - 30 days
// Types: EXPERIENCE_MULTIPLIER (2x), REPUTATION_MULTIPLIER (1.5x), EVENT_DISCOUNT (20%)

function activateBoost(BoostType _boostType) external
// Activate a purchased boost
```

#### **🗳️ Governance:**
```solidity
function createProposal(
    uint256 _communityId,
    string memory _description,
    uint32 _deadline
) external returns (uint256)

function voteOnProposal(uint256 _communityId, uint256 _proposalId, bool _support) external
// Reward: 5 respect points for voting
```

#### **⚔️ Challenges:**
```solidity
function createChallenge(
    uint256 _communityId,
    address _challenged,
    string memory _description,
    uint32 _deadline
) external payable
// Requires: stake amount (msg.value)

function acceptChallenge(uint256 _challengeId) external payable
// Must match original stake amount
```

#### **🌐 Cross-Community:**
```solidity
function startCrossCommunityVisit(uint256 _fromCommunityId, uint256 _toCommunityId) external
function endCrossCommunityVisit(uint256 _visitId) external
// Reward: 10 respect points per visit
```

#### **🎄 Seasonal Events:**
```solidity
function participateInSeasonalEvent(uint256 _eventId, uint256 _communityId) external payable
// Reward: 50 respect points
```

#### **👨‍🏫 Mentorship:**
```solidity
function becomeMentor(uint256 _communityId) external
// Requires: level >= 3, reputation >= 70
// Reward: 25 respect points

function completeMentorship(uint256 _communityId) external
// Rewards: 50 respect points (mentor), 25 respect points (mentee)
```

#### **⭐ Reputation:**
```solidity
function rateMember(uint256 _communityId, address _member, uint256 _rating) external
// Rating: 1-5 stars
// One rating per member per community
```

---

### **📊 VIEW FUNCTIONS** (Funkcje Odczytu)

#### **🏘️ Community Data:**
```solidity
function getCommunityDetails(uint256 _communityId) external view returns (
    address creator,
    string memory name,
    string memory description,
    uint128 joinFeeEth,
    uint128 monthlySubFeeEth,
    uint128 lifetimeSubFeeEth,
    uint128 balance,
    uint128 withdrawableBalance,
    uint32 totalMembers,
    CommunityStatus status
)

function getCommunityAnnouncements(uint256 _communityId) external view returns (string[] memory)
function getCommunityWithdrawableBalance(uint256 _communityId) external view returns (uint128)
function isActiveMember(uint256 _communityId, address _user) external view returns (bool)
```

#### **👤 Member Data:**
```solidity
function getMemberDetails(uint256 _communityId, address _member) external view returns (
    uint16 level,
    uint32 respectPoints,
    uint16 reputation,
    uint16 currentStreak,
    uint16 longestStreak,
    uint16 totalEventsParticipated,
    uint16 totalEventsWon,
    address mentor,
    uint256 menteeCount
)

function getUserAchievements(address _user) external view returns (uint256[] memory)
function getUserAchievementUnlocks(address _user) external view returns (AchievementUnlock[] memory)
function getUserBoost(address _user, BoostType _boostType) external view returns (
    BoostType boostType,
    uint32 expiresAt,
    uint16 multiplier,
    bool active
)
```

#### **🎪 Event Data:**
```solidity
function getEventDetails(uint256 _communityId, uint256 _eventId) external view returns (
    string memory description,
    EventType eventType,
    uint32 startTime,
    uint32 endTime,
    uint32 currentParticipants,
    uint32 maxParticipants,
    uint128 totalPrizePool,
    bool active
)
```

#### **🗳️ Proposal Data:**
```solidity
function getProposalDetails(uint256 _communityId, uint256 _proposalId) external view returns (
    string memory description,
    uint32 deadline,
    uint32 votesFor,
    uint32 votesAgainst,
    bool executed
)
```

#### **⚔️ Challenge Data:**
```solidity
function getChallengeDetails(uint256 _challengeId) external view returns (
    address challenger,
    address challenged,
    uint32 communityId,
    string memory description,
    uint128 stakeAmount,
    uint32 deadline,
    bool active,
    address winner
)
```

#### **🎄 Seasonal Event Data:**
```solidity
function getSeasonalEventDetails(uint256 _eventId) external view returns (
    string memory name,
    uint32 startTime,
    uint32 endTime,
    uint32 seasonId,
    uint128 totalPrizePool,
    bool active
)
```

#### **🌐 Cross-Community Data:**
```solidity
function getCrossVisitDetails(uint256 _visitId) external view returns (
    uint32 fromCommunityId,
    uint32 toCommunityId,
    address visitor,
    uint32 visitTime,
    uint32 duration,
    bool active
)

function getActiveCrossVisits(address _user) external view returns (uint256[] memory)
```

#### **📊 Platform Data:**
```solidity
function getPlatformStats() external view returns (PlatformStats memory)
function getAllPlatformFees() external view returns (
    uint256 creationFee,
    uint256 transactionFeePercentage,
    uint256 withdrawalFeePercentage,
    uint256 achievementUnlockFee,
    uint256 boostPurchaseFee,
    uint256 eventPlatformFee,
    uint256 _minMysteryBoxBet,
    uint256 _utilityBoxFee
)
```

#### **🎁 Utility Items:**
```solidity
// Public mappings that can be read directly:
mapping(address => uint256) public streakSavers;
mapping(address => uint256) public achievementVouchers;
mapping(uint256 => uint256) public mysteryBoxPrizePool;
```

---

## 🎯 **Frontend Integration Guide** (Przewodnik Integracji Frontendu)

### **🔧 Required Contract Interaction Pattern:**

```javascript
// 1. Contract Setup
const contract = new ethers.Contract(contractAddress, abi, signer);

// 2. Read Functions (no gas)
const communityDetails = await contract.getCommunityDetails(communityId);
const memberDetails = await contract.getMemberDetails(communityId, userAddress);
const userVouchers = await contract.achievementVouchers(userAddress);

// 3. Write Functions (require gas + ETH)
const tx = await contract.createCommunity(
    name, 
    description, 
    joinFeeEth, 
    monthlySubFeeEth, 
    lifetimeSubFeeEth,
    { value: ethers.utils.parseEther("0.01") } // Creation fee
);
```

### **💰 ETH Amount Calculation:**

```javascript
// Community Creation
const creationFee = ethers.utils.parseEther("0.01");
const transactionFee = creationFee.mul(5).div(1000); // 0.5%
const totalRequired = creationFee.add(transactionFee);

// MysteryBox
const userBet = ethers.utils.parseEther("0.001"); // User choice
const transactionFee = userBet.mul(5).div(1000); // 0.5%
const totalRequired = userBet.add(transactionFee);

// UtilityBox
const utilityFee = ethers.utils.parseEther("0.0001"); // Fixed
// No transaction fee needed (included in fixed fee)
```

### **🎮 Game Probabilities:**

```javascript
// MysteryBox Outcomes
const mysteryBoxProbabilities = [
    { multiplier: 2.0, chance: 2, reward: "2x your bet" },
    { multiplier: 1.5, chance: 5, reward: "1.5x your bet" },
    { multiplier: 1.1, chance: 10, reward: "1.1x your bet" },
    { multiplier: 1.0, chance: 50, reward: "1x your bet" },
    { multiplier: 0.8, chance: 20, reward: "0.8x your bet" },
    { multiplier: 0.5, chance: 13, reward: "0.5x your bet" }
];

// UtilityBox Outcomes
const utilityBoxProbabilities = [
    { item: "Legendary NFT", chance: 1 },
    { item: "Achievement Voucher", chance: 4 },
    { item: "Streak Saver", chance: 10 },
    { item: "3-Day Boost", chance: 5 },
    { item: "1-Day Boost", chance: 10 },
    { item: "25 Respect Points", chance: 20 },
    { item: "5 Respect Points", chance: 20 },
    { item: "Nothing", chance: 30 }
];
```

### **🚀 Boost System Integration:**

```javascript
// Boost Types
const boostTypes = {
    EXPERIENCE_MULTIPLIER: 0, // 2x respect points
    REPUTATION_MULTIPLIER: 1, // 1.5x reputation
    EVENT_DISCOUNT: 2         // 20% event discount
};

// Check Active Boosts
const checkBoost = async (userAddress, boostType) => {
    const boost = await contract.getUserBoost(userAddress, boostType);
    return boost.active && boost.expiresAt > Date.now() / 1000;
};

// Purchase Boost
const purchaseBoost = async (boostType, duration) => {
    const fee = ethers.utils.parseEther("0.0005");
    const tx = await contract.purchaseBoost(boostType, duration, { value: fee });
    await tx.wait();
};
```

### **🏆 Achievement System:**

```javascript
// Achievement Types
const achievementTypes = {
    FIRST_JOIN: 0,
    LEVEL_UP: 1,
    EVENT_WINNER: 2,
    REFERRAL_MASTER: 3,
    STREAK_KEEPER: 4,
    COLLECTIBLE_RECEIVED: 5
};

// Unlock Premium Achievement
const unlockAchievement = async (achievementType) => {
    const fee = ethers.utils.parseEther("0.0005");
    const tx = await contract.unlockPremiumAchievement(achievementType, { value: fee });
    await tx.wait();
};

// Use Voucher (FREE!)
const useVoucher = async (achievementType) => {
    const voucherCount = await contract.achievementVouchers(userAddress);
    if (voucherCount.gt(0)) {
        const tx = await contract.useAchievementVoucher(achievementType);
        await tx.wait();
    }
};
```

### **📱 Event Listening:**

```javascript
// Listen to important events
contract.on("CommunityCreated", (communityId, creator, name) => {
    console.log(`New community created: ${name} (ID: ${communityId})`);
});

contract.on("MysteryBoxOpened", (user, reward) => {
    console.log(`${user} won ${ethers.utils.formatEther(reward)} ETH from MysteryBox!`);
});

contract.on("UtilityBoxOpened", (user, prizeType, value) => {
    console.log(`${user} won ${prizeType} (${value}) from UtilityBox!`);
});

contract.on("LevelUp", (user, newLevel) => {
    console.log(`${user} reached level ${newLevel}!`);
});
```

---

## 🛠️ **Contract Editability Analysis** (Analiza Edytowalności Kontraktu)

### **✅ Currently Editable by Owner:**

#### **💰 Fee Parameters:**
- `creationFeeEth` - Community creation fee
- `defaultPlatformFeePercentage` - Platform fee percentage
- `withdrawalFeePercentage` - Withdrawal fee percentage
- `achievementUnlockFee` - Premium achievement unlock fee
- `boostPurchaseFee` - Boost purchase fee
- `eventPlatformFee` - Event creation fee
- `minMysteryBoxBet` / `maxMysteryBoxBet` - MysteryBox bet limits
- `utilityBoxFee` - UtilityBox fee

#### **🎨 Content Parameters:**
- `utilityBoxNftUri` - NFT metadata for UtilityBox rewards
- Individual community platform fees (per community)

#### **🎮 Game Parameters:**
- `mysteryBoxPrizePool` - Can be funded and withdrawn
- MysteryBox bet limits - Can be adjusted

#### **🏘️ Community Management:**
- Suspend/reactivate communities
- Global user bans
- Create seasonal events
- Mint collectible NFTs

#### **🛡️ Emergency Controls:**
- Pause/unpause entire contract
- Emergency withdraw all funds

### **❌ NOT Editable (Hardcoded):**

#### **⚖️ Core Logic:**
- `TRANSACTION_FEE_PERCENTAGE = 5` (0.5%) - **CONSTANT**
- Game probabilities (MysteryBox/UtilityBox)
- Achievement unlock logic
- Boost multipliers (2x, 1.5x, 20% discount)
- Level progression formula
- Soulbound NFT behavior

#### **🔧 Technical Limitations:**
- Contract address (once deployed)
- Function signatures
- Storage layout
- Inheritance structure

---

## 🚀 **Upgradable Contract Analysis** (Analiza Upgradowalności)

### **🤔 Should the Contract be Upgradable?**

#### **✅ Pros of Upgradable:**
1. **🔄 Future-Proof:** Can add new features without redeployment
2. **🐛 Bug Fixes:** Can fix critical bugs without losing data
3. **📈 Scalability:** Can optimize gas usage in future versions
4. **🎮 Game Balance:** Can adjust game mechanics if needed
5. **💰 Business Model:** Can adapt to market changes

#### **❌ Cons of Upgradable:**
1. **🔐 Security Risk:** Proxy patterns add complexity
2. **👥 Trust Issues:** Users must trust admin won't abuse upgrade power
3. **⚡ Gas Costs:** Proxy calls cost extra gas
4. **🧩 Complexity:** Harder to develop and audit
5. **📊 Transparency:** Users can't verify final contract code

### **🎯 Recommendation:**

**For HybridCommunityPlatform, I recommend KEEPING it NON-UPGRADABLE because:**

1. **🎮 Game Integrity:** Games with fixed rules are more trustworthy
2. **💰 Financial Security:** Users depositing ETH need absolute certainty
3. **🔒 Immutability:** Critical for DeFi/Gaming applications
4. **🎯 Current Flexibility:** Owner already has enough control over key parameters
5. **🔧 Easy Redeployment:** If major changes needed, can deploy V2 with migration

### **🛠️ Alternative Approach:**

Instead of making it upgradable, consider:
- **📊 Comprehensive Testing:** Thorough testing before mainnet
- **🧪 Testnet Deployment:** Extended testing period
- **🔍 Security Audits:** Professional audit before launch
- **📈 V2 Strategy:** Plan for future V2 deployment if needed
- **🔗 Migration Tools:** Build tools to help users migrate to V2

**The current contract design with owner-editable parameters provides the perfect balance of flexibility and security for a gaming/DeFi platform.**

---

## 🎯 **Summary for Frontend Development**

### **🚀 Key Points:**
1. **📝 Contract is comprehensive** - All documented functions exist and work as described
2. **💰 ETH-only model** - No USDC, simplified payment flow
3. **🎮 Dual game system** - MysteryBox (ETH) vs UtilityBox (items)
4. **🔧 Owner has sufficient control** - Can adjust fees and game parameters
5. **🛡️ Security first** - Non-upgradable design for maximum trust
6. **📊 Complete API** - All view functions needed for frontend

### **📱 Frontend Development Priority:**
1. **🏠 Community Dashboard** - Create, join, manage communities
2. **🎮 Game Interface** - MysteryBox and UtilityBox components
3. **👤 User Profile** - Achievements, boosts, stats
4. **🎪 Event Management** - Create, participate, view events
5. **📊 Analytics Dashboard** - Platform stats and leaderboards

**The contract is production-ready and provides everything needed for a complete Web3 community gaming platform!** 🚀 