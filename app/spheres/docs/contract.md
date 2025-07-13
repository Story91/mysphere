# 🏗️ HybridCommunityPlatform Contract Documentation
*Complete smart contract documentation based on spheres-core.sol implementation - for frontend developers*

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
4. **🎪 Event System** - Community events with equal prize distribution
5. **🏆 Achievement System** - Regular + premium achievements
6. **👨‍🏫 Mentorship System** - Experienced members help newcomers
7. **⭐ Reputation System** - 1-5 star ratings between members
8. **🚀 Boost System** - Timed power-ups (3 types)
9. **🎁 UtilityBox System** - Item rewards (NFT, vouchers, streak savers)
10. **💸 Withdrawal System** - Community fund management

---

## 🔤 **Enums & Data Types**

### **Enums:**
```solidity
enum MemberRole { MEMBER, MODERATOR, ADMIN }
enum EventType { STANDARD, COMPETITION, MYSTERY }
enum CommunityStatus { ACTIVE, SUSPENDED, CLOSED }
enum AchievementType { FIRST_JOIN, LEVEL_UP, EVENT_WINNER, REFERRAL_MASTER, STREAK_KEEPER }
enum BoostType { EXPERIENCE_MULTIPLIER, REPUTATION_MULTIPLIER, EVENT_DISCOUNT }
```

### **Key Constants:**
```solidity
uint256 constant public TRANSACTION_FEE_PERCENTAGE = 5; // 0.5% (CANNOT BE CHANGED)
uint256 public creationFeeEth = 0.01 ether;
uint256 public utilityBoxFee = 0.0001 ether;
uint256 public achievementUnlockFee = 0.0005 ether;
uint256 public boostPurchaseFee = 0.0005 ether;
uint256 public eventPlatformFee = 0.002 ether;
uint256 public withdrawalFeePercentage = 10; // 1%
uint256 public defaultPlatformFeePercentage = 25; // 2.5%
uint256 public maxPlatformFeePercentage = 100; // 10% (maximum allowed)
```

### **Core Data Structures:**
```solidity
struct Community {
    address creator;
    uint64 joinFeeEth;
    uint64 monthlySubFeeEth;
    uint64 lifetimeSubFeeEth;
    uint128 balance;
    uint128 withdrawableBalance;
    uint32 eventIdCounter;
    uint32 totalMembers;
    uint32 createdAt;
    uint16 platformFeePercentage;
    CommunityStatus status;
    string name;
    string description;
}

struct Member {
    uint32 communityId;
    uint32 subscriptionExpiresAt;
    uint32 respectPoints;
    uint32 totalSpent;
    uint32 lastActiveTime;
    uint16 referralCount;
    uint16 level;
    uint16 reputation;
    uint16 currentStreak;
    uint16 longestStreak;
    uint16 totalEventsParticipated;
    uint16 totalEventsWon;
    uint16 totalRatings;
    uint32 ratingSum;
    bool lifetime;
    address mentorAddress;
    address[] mentees;
}

struct Event {
    uint32 id;
    uint32 startTime;
    uint32 endTime;
    uint32 maxParticipants;
    uint32 currentParticipants;
    uint64 participationFeeEth;
    uint128 totalPrizePool;
    EventType eventType;
    string description;
    bool active;
    mapping(address => bool) participants;
    address[] participantsList;
}

struct PlatformStats {
    uint32 totalCommunities;
    uint32 totalMembers;
    uint32 totalTransactions;
    uint32 activeCommunities;
    uint128 totalVolume;
    uint128 totalPlatformFees;
}

struct Boost {
    BoostType boostType;
    uint32 duration;
    uint32 expiresAt;
    uint16 multiplier;
    bool active;
}
```

---

## 🎭 **Complete Function Reference** (Kompletna Lista Funkcji)

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
function setUtilityBoxFee(uint256 _newFee) external onlyOwner
function setUtilityBoxNftUri(string memory _newUri) external onlyOwner
```

#### **🛡️ Emergency Functions:**
```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
function emergencyWithdraw() external onlyOwner
```

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

### **🎮 MODERATOR FUNCTIONS** (Funkcje Moderatora)

#### **🎪 Event Management:**
```solidity
function createEvent(
    uint256 _communityId,
    string memory _description,
    uint64 _feeEth,
    EventType _eventType,
    uint32 _startTime,
    uint32 _endTime,
    uint32 _maxParticipants
) external payable onlyModerator(_communityId)
// Cost: 0.002 ETH platform fee + transaction fee

function finalizeEvent(uint256 _communityId, uint256 _eventId) external onlyModerator(_communityId)
// Distributes prize pool equally among all participants
```

#### **👨‍🏫 Mentorship Management:**
```solidity
function assignMentor(
    uint256 _communityId,
    address _mentee,
    address _mentor
) external onlyModerator(_communityId)
```

### **👥 MEMBER FUNCTIONS** (Funkcje Członków)

#### **🏠 Community Interaction:**
```solidity
function createCommunity(
    string memory _name,
    string memory _description,
    uint64 _joinFeeEth,
    uint64 _monthlySubFeeEth,
    uint64 _lifetimeSubFeeEth
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

#### **🎁 UtilityBox System:**
```solidity
function openUtilityBox(uint256 _communityId) external payable
// Cost: 0.0001 ETH (100% goes to platform)
// Rewards: NFT (1%), Voucher (4%), Streak Saver (10%), 3-Day Boost (5%), 
//          1-Day Boost (10%), +25 Respect (20%), +5 Respect (20%), Nothing (30%)
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

#### **👨‍🏫 Mentorship System:**
```solidity
function becomeMentor(uint256 _communityId) external
// Requires: level >= 3, reputation >= 70
// Reward: 25 respect points

function completeMentorship(uint256 _communityId) external
// Rewards: 50 respect points (mentor), 25 respect points (mentee)
```

#### **⭐ Reputation System:**
```solidity
function rateMember(uint256 _communityId, address _member, uint256 _rating) external
// Rating: 1-5 stars
// One rating per member per community
```

### **📊 VIEW FUNCTIONS** (Funkcje Odczytu)

#### **🏘️ Community Data:**
```solidity
function getCommunityDetails(uint256 _communityId) external view returns (
    address creator,
    string memory name,
    string memory description,
    uint64 joinFeeEth,
    uint64 monthlySubFeeEth,
    uint64 lifetimeSubFeeEth,
    uint128 balance,
    uint128 withdrawableBalance,
    uint32 totalMembers,
    CommunityStatus status
)

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
```

#### **📊 Platform Data:**
```solidity
function getPlatformStats() external view returns (PlatformStats memory)
```

#### **🎁 Utility Items:**
```solidity
// Public mappings that can be read directly:
mapping(address => uint256) public streakSavers;
mapping(address => uint256) public achievementVouchers;
```

---

## 🎭 **Complete Event Reference** (Kompletna Lista Eventów)

### **🏘️ Community Events:**
```solidity
event CommunityCreated(uint256 indexed communityId, address indexed creator, string name);
event MemberJoined(uint256 indexed communityId, address indexed member);
event MemberBanned(uint256 indexed communityId, address indexed member);
event MemberRoleChanged(uint256 indexed communityId, address indexed member, MemberRole newRole);
```

### **🎪 Event System Events:**
```solidity
event EventCreated(uint256 indexed communityId, uint256 indexed eventId);
event EventParticipation(uint256 indexed communityId, uint256 indexed eventId, address indexed participant);
```

### **🏆 Achievement & Progression Events:**
```solidity
event AchievementUnlocked(address indexed user, AchievementType achievement);
event PremiumAchievementUnlocked(address indexed user, AchievementType achievement, uint256 fee);
event LevelUp(address indexed user, uint256 newLevel);
event CollectibleMinted(address indexed recipient, uint256 indexed tokenId, string category);
```

### **🎁 UtilityBox Events:**
```solidity
event UtilityBoxOpened(address indexed user, string prizeType, uint256 value);
event StreakSaverWon(address indexed user, uint256 newTotal);
event StreakSaverUsed(address indexed user, uint256 streakPreserved);
event AchievementVoucherWon(address indexed user, uint256 newTotal);
event AchievementVoucherUsed(address indexed user, AchievementType achievementType);
```

### **🚀 Boost System Events:**
```solidity
event BoostPurchased(address indexed user, BoostType boostType, uint256 fee, uint32 duration);
event BoostActivated(address indexed user, BoostType boostType);
```

### **👨‍🏫 Mentorship & Social Events:**
```solidity
event MentorAssigned(uint256 indexed communityId, address indexed mentor, address indexed mentee);
event MentorshipCompleted(uint256 indexed communityId, address indexed mentor, address indexed mentee);
event MemberRated(uint256 indexed communityId, address indexed rated, address indexed rater, uint256 rating);
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

// UtilityBox
const utilityFee = ethers.utils.parseEther("0.0001"); // Fixed
// No additional transaction fee needed (included in fixed fee)
```

### **🎁 UtilityBox Probabilities:**

```javascript
// UtilityBox Outcomes (EXACT FROM CONTRACT CODE)
const utilityBoxProbabilities = [
    { item: "Legendary NFT", chance: 1 },
    { item: "Achievement Voucher", chance: 4 },
    { item: "Streak Saver", chance: 10 },
    { item: "3-Day Boost (Random Type)", chance: 5 },
    { item: "1-Day Boost (Random Type)", chance: 10 },
    { item: "+25 Respect Points", chance: 20 },
    { item: "+5 Respect Points", chance: 20 },
    { item: "Nothing", chance: 30 }
];
```

### **🚀 Boost System Integration:**

```javascript
// Boost Types
const boostTypes = {
    EXPERIENCE_MULTIPLIER: 0, // 2x respect points
    REPUTATION_MULTIPLIER: 1, // 1.5x reputation (NOTE: Defined in contract but not currently used in any logic)
    EVENT_DISCOUNT: 2         // 20% event discount
};

// Check Active Boosts
const checkBoost = async (userAddress, boostType) => {
    const boost = await contract.userBoosts(userAddress, boostType);
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
    STREAK_KEEPER: 4
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

contract.on("UtilityBoxOpened", (user, prizeType, value) => {
    console.log(`${user} won ${prizeType} (${value}) from UtilityBox!`);
});

contract.on("LevelUp", (user, newLevel) => {
    console.log(`${user} reached level ${newLevel}!`);
});

contract.on("StreakSaverWon", (user, newTotal) => {
    console.log(`${user} won streak saver! Total: ${newTotal}`);
});

contract.on("AchievementVoucherWon", (user, newTotal) => {
    console.log(`${user} won achievement voucher! Total: ${newTotal}`);
});

contract.on("BoostActivated", (user, boostType) => {
    console.log(`${user} activated ${boostType} boost`);
});
```

---

## 📈 **Level System & Progression Formula** (System Poziomów i Wzór Progresji)

### **🎯 Level Calculation:**

```javascript
// Contract function: _calculateLevel(uint32 _respectPoints)
function calculateLevel(respectPoints) {
    if (respectPoints >= 10000) return 5; // Master
    if (respectPoints >= 5000) return 4;  // Expert
    if (respectPoints >= 2000) return 3;  // Advanced
    if (respectPoints >= 500) return 2;   // Intermediate
    if (respectPoints >= 100) return 1;   // Beginner
    return 0; // Newcomer
}

// Level progression requirements:
const levelRequirements = {
    0: { name: "Newcomer", minPoints: 0, maxPoints: 99 },
    1: { name: "Beginner", minPoints: 100, maxPoints: 499 },
    2: { name: "Intermediate", minPoints: 500, maxPoints: 1999 },
    3: { name: "Advanced", minPoints: 2000, maxPoints: 4999 },
    4: { name: "Expert", minPoints: 5000, maxPoints: 9999 },
    5: { name: "Master", minPoints: 10000, maxPoints: Infinity }
};
```

### **💎 Respect Points Sources:**

```javascript
// Ways to earn respect points:
const respectPointSources = {
    // Automatic rewards
    memberJoin: 25,           // When someone joins via your referral
    referralReward: 50,       // When you refer someone
    eventParticipation: 50,   // All event participants (equal distribution)
    mentorshipComplete: 50,   // Completing mentorship (mentor)
    menteeComplete: 25,       // Completing mentorship (mentee)
    becomeMentor: 25,         // Becoming a mentor
    
    // UtilityBox rewards
    utilityBoxSmall: 5,       // Small respect reward (20% chance)
    utilityBoxMedium: 25,     // Medium respect reward (20% chance)
    
    // Boosted rewards (with EXPERIENCE_MULTIPLIER boost)
    // All above values are multiplied by 2x when boost is active
};
```

### **🔄 Activity Streak System:**

```javascript
// Streak calculation logic (from contract):
const updateStreak = (lastActiveTime, currentTime, streakSavers) => {
    const timeDiff = currentTime - lastActiveTime;
    const oneDayInSeconds = 24 * 60 * 60;
    const twoDaysInSeconds = 48 * 60 * 60;
    
    if (timeDiff > oneDayInSeconds && timeDiff < twoDaysInSeconds) {
        // 24-48h gap - streak can be saved
        if (streakSavers > 0) {
            return { streakSaved: true, streakSaversUsed: 1 };
        } else {
            return { streakReset: true, newStreak: 1 };
        }
    } else if (timeDiff > twoDaysInSeconds) {
        // 48+ hours - streak always resets
        return { streakReset: true, newStreak: 1 };
    } else {
        // Less than 24h - streak continues
        return { streakContinues: true };
    }
};

// Streak benefits:
// - 7+ day streak unlocks STREAK_KEEPER achievement
// - Streak Savers provide automatic protection against accidental breaks
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
- `utilityBoxFee` - UtilityBox fee

#### **🎨 Content Parameters:**
- `utilityBoxNftUri` - NFT metadata for UtilityBox rewards
- Individual community platform fees (per community)

#### **🏘️ Community Management:**
- Suspend/reactivate communities
- Global user bans

#### **🛡️ Emergency Controls:**
- Pause/unpause entire contract
- Emergency withdraw all funds

### **❌ NOT Editable (Hardcoded):**

#### **⚖️ Core Logic:**
- `TRANSACTION_FEE_PERCENTAGE = 5` (0.5%) - **CONSTANT**
- UtilityBox probabilities
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

## 🎯 **Summary for Frontend Development**

### **🚀 Key Points:**
1. **📝 Contract is comprehensive** - All documented functions exist and work as described
2. **💰 ETH-only model** - No external tokens, simplified payment flow
3. **🎮 UtilityBox system** - Item-based rewards with strategic utility
4. **🔧 Owner has sufficient control** - Can adjust fees and key parameters
5. **🛡️ Security first** - Non-upgradable design for maximum trust
6. **📊 Complete API** - All view functions needed for frontend

### **📱 Frontend Development Priority:**
1. **🏠 Community Dashboard** - Create, join, manage communities
2. **🎁 UtilityBox Interface** - Interactive opening with animations
3. **👤 User Profile** - Achievements, boosts, stats, utility items
4. **🎪 Event Management** - Create, participate, view events
5. **📊 Analytics Dashboard** - Platform stats and leaderboards

**The contract is production-ready and provides everything needed for a complete Web3 community gaming platform!** 🚀 