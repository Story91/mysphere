# 🛠️ Creator & Moderator Functions Guide
*Przewodnik funkcji dla twórców i moderatorów społeczności*

## 🎯 **Overview**
As a community creator or moderator, you have special privileges to manage your community, create events, and moderate members. This guide covers all creator/moderator functions.

## 👑 **Creator-Only Functions**
*Funkcje tylko dla twórców społeczności*

### 1. **Member Management**
*Zarządzanie członkami*

#### `banMember(uint256 _communityId, address _member)`
**Purpose:** Ban member from your community (ban członka ze społeczności)
```solidity
function banMember(uint256 _communityId, address _member) external onlyModerator(_communityId)
```
- **When to use:** Spam, inappropriate behavior, rule violations
- **Effect:** Member can't participate in community activities
- **Reversible:** Yes, using `unbanMember()`

#### `unbanMember(uint256 _communityId, address _member)`
**Purpose:** Remove ban from member (usuwa ban z członka)
```solidity
function unbanMember(uint256 _communityId, address _member) external onlyCreator(_communityId)
```
- **⚠️ Note:** Only creator can unban (tylko twórca może usunąć ban)
- **When to use:** Appeal accepted, resolved issues

#### `setMemberRole(uint256 _communityId, address _member, MemberRole _role)`
**Purpose:** Assign moderator or admin role (nadawanie roli moderatora)
```solidity
function setMemberRole(uint256 _communityId, address _member, MemberRole _role) external onlyCreator(_communityId)
```
- **Roles available:**
  - `MemberRole.MEMBER` (0) - Regular member
  - `MemberRole.MODERATOR` (1) - Can moderate, create events
  - `MemberRole.ADMIN` (2) - Full permissions except ownership
- **When to use:** Promote trusted members, build moderation team

### 2. **Community Configuration**
*Konfiguracja społeczności*

#### `updateCommunityFees(...)`
**Purpose:** Update community pricing (aktualizacja opłat społeczności)
```solidity
function updateCommunityFees(
    uint256 _communityId,
    uint256 _joinFeeEth,
    uint256 _monthlySubFeeEth,
    uint256 _lifetimeSubFeeEth
) external onlyCreator(_communityId)
```
- **Parameters:**
  - `_joinFeeEth`: One-time join fee in ETH
  - `_monthlySubFeeEth`: Monthly subscription in ETH
  - `_lifetimeSubFeeEth`: Lifetime subscription in ETH
- **When to use:** Market changes, community growth, inflation
- **🚀 NEW:** Only BASE ETH - USDC removed for simplicity

### 3. **💰 Fund Management (NOWE!)**
*Zarządzanie funduszami społeczności*

#### `withdrawCommunityFunds(uint256 _communityId, uint256 _amount)`
**Purpose:** Withdraw community funds (wypłata środków społeczności)
```solidity
function withdrawCommunityFunds(uint256 _communityId, uint256 _amount) external nonReentrant onlyCreator(_communityId)
```
- **Requirements:**
  - Only creator can withdraw
  - Must have sufficient withdrawable balance
  - Contract must have enough ETH
- **Fee:** 1% withdrawal fee (goes to platform)
- **Example:** Withdraw 1 ETH → receive 0.99 ETH, 0.01 ETH fee

**How withdrawable balance is built:**
- **Member fees** - join fees, subscriptions (minus platform fee)
- **Event participation** - event fees (minus platform fee)
- **Challenge stakes** - when community creator judges
- **Transaction fees** - 0.5% of all payments go to platform

**Best practices:**
- **Regular withdrawals** - don't let too much accumulate
- **Reinvest in community** - use funds for events and rewards
- **Transparent accounting** - let members know how funds are used
- **Emergency reserve** - keep some funds for unexpected expenses

### 3. **NFT Rewards**
*Nagrody NFT*

#### `awardTopPerformerCollectible(uint256 _communityId, address _performer)`
**Purpose:** Award special NFT to top performer (nagroda NFT dla najlepszego)
```solidity
function awardTopPerformerCollectible(uint256 _communityId, address _performer) external onlyCreator(_communityId)
```
- **Requirements:**
  - Performer must be level 4+ (poziom 4+)
  - Reputation 80+ (reputacja 80+)
- **Effect:** Mints unique NFT, awards 200 respect points
- **When to use:** Monthly/quarterly rewards, special achievements

## 🎮 **Moderator Functions**
*Funkcje moderatorów (dostępne też dla twórców)*

### 1. **Event Management**
*Zarządzanie wydarzeniami*

#### `createEvent(...)`
**Purpose:** Create community event (tworzenie wydarzeń społeczności)
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
```
- **🚀 NEW:** Event creation is now PAID - 0.002 ETH + 0.5% transaction fee
- **Event Types:**
  - `EventType.STANDARD` (0) - Regular event
  - `EventType.COMPETITION` (1) - Competition with rankings
  - `EventType.SEASONAL` (2) - Seasonal/special event
  - `EventType.MYSTERY` (3) - Mystery box rewards
- **Parameters:**
  - `_description`: Event description (max 500 chars)
  - `_feeEth`: Participation fee in ETH
  - `_startTime`: Unix timestamp
  - `_endTime`: Unix timestamp
  - `_maxParticipants`: Maximum participants
- **💰 Platform Fee:** 0.002 ETH per event helps fund platform development

#### `finalizeEvent(uint256 _communityId, uint256 _eventId, address[] memory _winners, uint128[] memory _rewards)`
**Purpose:** Finalize event and distribute rewards (finalizacja i nagrody)
```solidity
function finalizeEvent(uint256 _communityId, uint256 _eventId, address[] memory _winners, uint128[] memory _rewards) external onlyModerator(_communityId)
```
- **When to use:** After event ends, when winners are determined
- **Effect:** Distributes rewards, updates member stats
- **Requirements:** Event must be inactive, past end time

### 2. **Challenge Management**
*Zarządzanie wyzwaniami*

#### `completeChallenge(uint256 _challengeId, address _winner)`
**Purpose:** Judge and complete challenge (sądź i zakończ wyzwanie)
```solidity
function completeChallenge(uint256 _challengeId, address _winner) external nonReentrant
```
- **Requirements:** Only creator can judge challenges
- **Parameters:** Winner must be challenger or challenged
- **Effect:** Awards stake to winner, gives 100 respect points

### 3. **Communication**
*Komunikacja*

#### `makeAnnouncement(uint256 _communityId, string memory _announcement)`
**Purpose:** Make community announcement (ogłoszenie społeczności)
```solidity
function makeAnnouncement(uint256 _communityId, string memory _announcement) external onlyModerator(_communityId)
```
- **When to use:** Important updates, rule changes, event announcements
- **Limits:** Max 500 characters
- **Effect:** Announcement stored permanently, visible to all members

### 4. **Mentor System**
*System mentorowania*

#### `assignMentor(uint256 _communityId, address _mentee, address _mentor)`
**Purpose:** Assign mentor to new member (przypisanie mentora)
```solidity
function assignMentor(uint256 _communityId, address _mentee, address _mentor) external onlyModerator(_communityId)
```
- **Requirements:**
  - Both must be active members
  - Mentor must have higher level than mentee
  - Mentee can't already have mentor
- **Effect:** Creates mentor-mentee relationship, awards 25 respect points to mentor

## 🎯 **Best Practices for Creators**

### **1. Community Building**
- **Welcome new members** - personal touch matters
- **Set clear rules** - use announcements feature
- **Regular events** - keep community engaged
- **Reward participation** - use NFT rewards system

### **2. Pricing Strategy**
- **Market research** - check competitor pricing
- **Value proposition** - ensure fees match value
- **Gradual increases** - don't shock existing members
- **Lifetime deals** - encourage long-term commitment

### **3. Moderation**
- **Appoint trusted moderators** - use `setMemberRole()`
- **Consistent enforcement** - apply rules fairly
- **Document decisions** - keep records of bans/unbans
- **Appeal process** - allow members to appeal decisions

### **4. Event Planning**
- **Advance notice** - announce events early
- **Varied content** - mix different event types
- **Fair participation** - set reasonable fees
- **Celebrate winners** - use NFT rewards

## 📊 **Community Growth Strategies**

### **Phase 1: Foundation (0-50 members)**
- **Low/no fees** - attract initial members
- **High engagement** - personal interaction
- **Regular events** - build activity
- **Referral rewards** - leverage existing members

### **Phase 2: Growth (50-200 members)**
- **Moderate fees** - start monetizing
- **Moderator team** - delegate responsibilities
- **Specialized events** - cater to interests
- **Member rewards** - recognize contributions

### **Phase 3: Maturity (200+ members)**
- **Premium pricing** - established value
- **Advanced features** - seasonal events, NFTs
- **Self-sustaining** - community runs itself
- **Expansion** - consider multiple communities

## 🎮 **Gamification Tips**

### **Respect Points System**
- **Event participation:** 10-50 points
- **Event wins:** 100 points
- **Referrals:** 50 points (referrer), 25 points (referee)
- **Mentorship:** 25-50 points
- **Streak bonuses:** Daily activity rewards

### **Level Progression**
- **Level 0:** Newcomer (0-99 points)
- **Level 1:** Beginner (100-499 points)
- **Level 2:** Intermediate (500-1999 points)
- **Level 3:** Advanced (2000-4999 points)
- **Level 4:** Expert (5000-9999 points)
- **Level 5:** Master (10000+ points)

### **Achievement System**
- **First Join:** Welcome bonus
- **Level Up:** Milestone rewards
- **Event Winner:** Competition achievements
- **Referral Master:** 5+ successful referrals
- **Streak Keeper:** 7+ day activity streak
- **Collectible Received:** Special NFT rewards

## 🔧 **Technical Considerations**

### **Gas Optimization**
- **Batch operations** - combine multiple actions
- **Off-peak timing** - schedule during low gas
- **Event planning** - consider gas costs in fees

### **Security**
- **Multi-sig wallet** - for community funds
- **Regular backups** - community data
- **Monitor activity** - unusual patterns

### **Legal Compliance**
- **Terms of service** - clear community rules
- **Data protection** - member privacy
- **Tax implications** - revenue reporting
- **Regulatory compliance** - local laws

## 📈 **Revenue Optimization**

### **Fee Structure Ideas**
```solidity
// Example pricing tiers
Basic Community:
- Join: 0.001 ETH
- Monthly: 0.005 ETH
- Lifetime: 0.05 ETH

Premium Community:
- Join: 0.01 ETH
- Monthly: 0.02 ETH
- Lifetime: 0.2 ETH

Exclusive Community:
- Join: 0.1 ETH
- Monthly: 0.05 ETH
- Lifetime: 0.5 ETH
```

### **Additional Revenue Streams**
- **Premium events** - higher fees, better rewards
- **NFT sales** - collectible marketplace
- **Mentorship programs** - paid coaching
- **Exclusive content** - subscriber-only material

## 🎁 **Member Retention**

### **Loyalty Programs**
- **Streak rewards** - daily activity bonuses
- **Milestone NFTs** - long-term membership rewards
- **Exclusive events** - member-only competitions
- **Referral bonuses** - reward community growth

### **Engagement Strategies**
- **Personal recognition** - highlight top members
- **Community challenges** - group goals
- **Seasonal themes** - holiday events
- **Cross-community** - collaboration opportunities

---

**Success Formula:** Great communities are built on trust, value, and engagement. Use these tools wisely to create a thriving ecosystem where members want to participate and contribute.

*Formuła sukcesu: Wielkie społeczności budowane są na zaufaniu, wartości i zaangażowaniu. Używaj tych narzędzi mądrze, aby stworzyć kwitnący ekosystem, w którym członkowie chcą uczestniczyć i wnosić wkład.* 