# 🛠️ Creator & Moderator Functions Guide
*Przewodnik funkcji dla twórców i moderatorów społeczności*

## 🎯 **Overview**
As a community creator or moderator, you have special privileges to manage your community, create events, and moderate members. This guide covers all creator/moderator functions based on the actual HybridCommunityPlatform contract.

## 👑 **Creator-Only Functions**
*Funkcje tylko dla twórców społeczności*

### 1. **Member Management**
*Zarządzanie członkami*

#### `banMember(uint256 _communityId, address _member)`
**Purpose:** Ban member from your community (ban członka ze społeczności)
```solidity
function banMember(uint256 _communityId, address _member) external onlyModerator(_communityId)
```
- **Access:** Moderators and creators can ban
- **When to use:** Spam, inappropriate behavior, rule violations
- **Effect:** Member can't participate in community activities
- **Reversible:** Yes, using `unbanMember()` (creator only)

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
- **Requirements:** Member must be active in the community
- **When to use:** Promote trusted members, build moderation team

### 2. **💰 Fund Management**
*Zarządzanie funduszami społeczności*

#### `withdrawCommunityFunds(uint256 _communityId, uint256 _amount)`
**Purpose:** Withdraw community funds (wypłata środków społeczności)
```solidity
function withdrawCommunityFunds(uint256 _communityId, uint256 _amount) external nonReentrant onlyCreator(_communityId)
```
- **Requirements:**
  - Only creator can withdraw
  - Must have sufficient withdrawableBalance
  - Contract must have enough ETH
- **Fee:** 1% withdrawal fee (goes to platform)
- **Example:** Withdraw 1 ETH → receive 0.99 ETH, 0.01 ETH fee
- **Event:** Emits `FundsWithdrawn(communityId, creator, amount, fee)`

**How withdrawable balance is built:**
- **Member fees** - join fees, subscriptions (minus platform fee 2.5%)
- **Event participation** - event fees (minus platform fee)
- **Challenge stakes** - when community creator judges
- **All transactions** - 0.5% transaction fee goes to platform

**Best practices:**
- **Regular withdrawals** - don't let too much accumulate
- **Reinvest in community** - use funds for events and rewards
- **Transparent accounting** - let members know how funds are used
- **Emergency reserve** - keep some funds for unexpected expenses

### 3. **🎨 NFT Rewards**
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
- **Event:** Emits `CollectibleMinted(performer, tokenId, "TopPerformer")`

### 4. **⚔️ Challenge Management**
*Zarządzanie wyzwaniami*

#### `completeChallenge(uint256 _challengeId, address _winner)`
**Purpose:** Judge and complete challenge (sądź i zakończ wyzwanie)
```solidity
function completeChallenge(uint256 _challengeId, address _winner) external nonReentrant
```
- **Requirements:** Only creator can judge challenges
- **Parameters:** Winner must be challenger or challenged
- **Effect:** Awards stake to winner, gives 100 respect points
- **Process:** Sets winner, marks completed, transfers stake amount
- **Event:** Emits `ChallengeCompleted(challengeId, winner)`

## 🎮 **Moderator Functions**
*Funkcje moderatorów (dostępne też dla twórców)*

### 1. **🎪 Event Management**
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
- **💰 Cost:** 0.002 ETH platform fee + 0.5% transaction fee
- **Event Types:**
  - `EventType.STANDARD` (0) - Regular event
  - `EventType.COMPETITION` (1) - Competition with rankings
  - `EventType.SEASONAL` (2) - Seasonal/special event
  - `EventType.MYSTERY` (3) - Mystery box rewards (10% chance instant ETH)
- **Parameters:**
  - `_description`: Event description (max 500 chars)
  - `_feeEth`: Participation fee in ETH
  - `_startTime`: Unix timestamp (must be future)
  - `_endTime`: Unix timestamp (must be after start)
  - `_maxParticipants`: Maximum participants
- **Effects:** Creates event, charges platform fee, enables participation
- **Event:** Emits `EventCreated(communityId, eventId)`

#### `finalizeEvent(uint256 _communityId, uint256 _eventId, address[] memory _winners, uint128[] memory _rewards)`
**Purpose:** Finalize event and distribute rewards (finalizacja i nagrody)
```solidity
function finalizeEvent(uint256 _communityId, uint256 _eventId, address[] memory _winners, uint128[] memory _rewards) external onlyModerator(_communityId)
```
- **Requirements:** Event must be inactive, past end time
- **Parameters:** Arrays must have same length
- **Effects:** 
  - Distributes ETH rewards to winners
  - Updates member stats (totalEventsWon++)
  - Awards 100 respect points per winner
  - Unlocks EVENT_WINNER achievement
- **When to use:** After event ends, when winners are determined

### 2. **📢 Communication**
*Komunikacja*

#### `makeAnnouncement(uint256 _communityId, string memory _announcement)`
**Purpose:** Make community announcement (ogłoszenie społeczności)
```solidity
function makeAnnouncement(uint256 _communityId, string memory _announcement) external onlyModerator(_communityId)
```
- **When to use:** Important updates, rule changes, event announcements
- **Limits:** Max 500 characters, must be non-empty
- **Effect:** Announcement stored permanently in community.announcements[]
- **Event:** Emits `AnnouncementMade(communityId, announcement)`

### 3. **👨‍🏫 Mentor System**
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
- **Effects:** 
  - Creates mentor-mentee relationship
  - Awards 25 respect points to mentor (with boost processing)
  - Adds mentee to mentor's mentees array
- **Event:** Emits `MentorAssigned(communityId, mentor, mentee)`

## 🎯 **Best Practices for Creators**

### **1. Community Building**
- **Welcome new members** - personal touch matters
- **Set clear rules** - use announcements feature
- **Regular events** - keep community engaged
- **Reward participation** - use NFT rewards system
- **Monitor activity** - track member engagement

### **2. Pricing Strategy**
- **Market research** - check competitor pricing
- **Value proposition** - ensure fees match value
- **Consider platform fees** - 2.5% on all revenue + 0.5% transaction fees
- **Lifetime deals** - encourage long-term commitment
- **Event pricing** - balance accessibility with value

### **3. Moderation**
- **Appoint trusted moderators** - use `setMemberRole()`
- **Consistent enforcement** - apply rules fairly
- **Document decisions** - keep records of bans/unbans
- **Appeal process** - allow members to appeal decisions
- **Regular reviews** - assess moderation effectiveness

### **4. Event Planning**
- **Advance notice** - announce events early
- **Varied content** - mix different event types
- **Fair participation** - set reasonable fees
- **Celebrate winners** - use NFT rewards
- **Track engagement** - monitor participation rates

### **5. Financial Management**
- **Regular withdrawals** - don't let funds accumulate unnecessarily
- **Reinvest profits** - fund better events and rewards
- **Emergency funds** - keep reserve for unexpected needs
- **Transparency** - communicate fund usage to members

## 📊 **Community Growth Strategies**

### **Phase 1: Foundation (0-50 members)**
- **Low/no fees** - attract initial members
- **High engagement** - personal interaction
- **Regular events** - build activity
- **Referral rewards** - leverage existing members
- **Focus on retention** - keep early adopters engaged

### **Phase 2: Growth (50-200 members)**
- **Moderate fees** - start monetizing
- **Moderator team** - delegate responsibilities
- **Specialized events** - cater to interests
- **Member rewards** - recognize contributions
- **Quality over quantity** - maintain standards

### **Phase 3: Maturity (200+ members)**
- **Premium pricing** - established value
- **Advanced features** - seasonal events, NFTs
- **Self-sustaining** - community runs itself
- **Expansion** - consider multiple communities
- **Brand building** - develop community identity

## 🎮 **Gamification Guide**

### **Respect Points System**
- **Event participation:** Variable based on event type
- **Event wins:** 100 points
- **Referrals:** 50 points (referrer), 25 points (referee)
- **Mentorship completion:** 50 points (mentor), 25 points (mentee)
- **Challenges:** 100 points (winner)
- **Cross-community visits:** 10 points per visit
- **Seasonal events:** 50 points
- **Proposal voting:** 5 points per vote
- **Becoming mentor:** 25 points
- **Top performer award:** 200 points

### **Level Progression**
- **Level 0:** Newcomer (0-99 points)
- **Level 1:** Beginner (100-499 points)
- **Level 2:** Intermediate (500-1999 points)
- **Level 3:** Advanced (2000-4999 points) - *Can become mentor*
- **Level 4:** Expert (5000-9999 points) - *Can receive NFT awards*
- **Level 5:** Master (10000+ points) - *Top tier*

### **Achievement System**
- **FIRST_JOIN (0):** Welcome bonus
- **LEVEL_UP (1):** Milestone rewards
- **EVENT_WINNER (2):** Competition achievements
- **REFERRAL_MASTER (3):** 5+ successful referrals
- **STREAK_KEEPER (4):** 7+ day activity streak
- **COLLECTIBLE_RECEIVED (5):** NFT rewards

### **Boost System Integration**
- **EXPERIENCE_MULTIPLIER:** 2x respect points
- **REPUTATION_MULTIPLIER:** 1.5x reputation gains
- **EVENT_DISCOUNT:** 20% off event fees
- **Duration:** 1 hour to 30 days
- **Cost:** 0.0005 ETH per boost

### **New Game Features**
- **Mystery Events:** 10% chance for instant ETH rewards
- **Utility Box rewards:** NFTs, vouchers, streak savers
- **Streak Savers:** Automatic streak protection
- **Achievement Vouchers:** Free premium achievements
- **Cross-community visits:** Expand member reach

## 🔧 **Technical Implementation**

### **Gas Optimization Tips**
- **Batch operations** - group similar actions
- **Event planning** - create events during low gas periods
- **Member management** - handle bans/unbans efficiently
- **Fund management** - optimize withdrawal timing

### **Security Considerations**
- **Role management** - carefully assign moderator roles
- **Fund security** - regular withdrawals reduce risk
- **Member verification** - ensure legitimate participation
- **Event monitoring** - watch for suspicious activity

### **Integration with Platform Features**
- **Seasonal events** - coordinate with platform-wide events
- **NFT rewards** - leverage soulbound NFT system
- **Reputation system** - encourage member ratings
- **Mentorship program** - build community leadership

## 📈 **Success Metrics**

### **Community Health**
- **Active members** - regular participation
- **Event attendance** - participation rates
- **Member retention** - subscription renewals
- **Reputation scores** - member satisfaction
- **Growth rate** - new member acquisition

### **Financial Performance**
- **Revenue growth** - subscription and event fees
- **Profit margins** - after platform fees
- **Member value** - lifetime contribution
- **Event ROI** - participation vs. costs
- **Withdrawal patterns** - fund management efficiency

### **Engagement Metrics**
- **Activity streaks** - daily engagement
- **Achievement unlocks** - progression tracking
- **Cross-community visits** - network expansion
- **Referral success** - organic growth
- **Mentor relationships** - knowledge transfer

This comprehensive guide provides creators and moderators with everything needed to build and manage successful communities on the HybridCommunityPlatform. Regular updates and community feedback help optimize these strategies for maximum success. 