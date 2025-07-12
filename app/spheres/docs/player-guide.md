# 🎮 Player Game Guide
*Player guide - how to play and win on the platform (Przewodnik gracza - jak grać i wygrywać na platformie)*

## 🚀 **Getting Started** (Pierwsze kroki)

### **1. Connect Your Wallet**
- **Supported wallets:** MetaMask, Coinbase Wallet, WalletConnect
- **Network:** Base (add Base network to MetaMask)
- **Required:** ETH for gas fees and activities
- **⚠️ Important:** You need enough ETH for transaction fees (0.5% of all payments)

### **2. Find Communities**
- **Browse communities** - explore different options
- **Check fees** - join fee + monthly/lifetime subscription
- **Read descriptions** - understand community focus
- **Look at member count** - active vs inactive communities
- **Check platform fee** - 2.5% deducted from all community fees

### **3. Join Your First Community**
```solidity
function joinCommunity(uint256 _communityId, bool _lifetime, address _referrer) external payable
```
- **Choose subscription type:**
  - `false` - Monthly subscription (cheaper, recurring)
  - `true` - Lifetime subscription (more expensive, one-time)
- **Use referral code** - get bonus points if someone invited you
- **Receive NFT** - soulbound membership token (can't be sold)
- **Fee breakdown:**
  - Transaction fee: 0.5% of payment → platform
  - Platform fee: 2.5% of payment → platform
  - Community fee: 97% of payment → community

## 🎯 **Core Game Mechanics** (Podstawowe mechaniki gry)

### **🏆 Respect Points System** (System Punktów Szacunku)
Your main currency for progression (główna waluta do rozwoju)

**How to earn:**
- **Join community:** First time joining unlocks FIRST_JOIN achievement
- **Event participation:** Variable points based on event type
- **Event wins:** 100 points
- **Referrals:** 50 points (referrer), 25 points (referee)
- **Mentorship completion:** 50 points (mentor), 25 points (mentee)
- **Cross-community visits:** 10 points per visit
- **Seasonal events:** 50 points
- **Proposal voting:** 5 points per vote
- **Becoming mentor:** 25 points
- **Challenge wins:** 100 points
- **Top performer NFT:** 200 points
- **UtilityBox rewards:** 5 or 25 points randomly

**Boost multipliers:**
- **Experience Multiplier:** 2x respect points when active
- **All points calculated with boost bonuses** if applicable

### **📈 Level System** (System Poziomów)
Your skill level determines available features (poziom umiejętności)

**Level Progression:**
- **Level 0:** Newcomer (0-99 points) - Basic access
- **Level 1:** Beginner (100-499 points) - Can create challenges
- **Level 2:** Intermediate (500-1999 points) - Advanced features
- **Level 3:** Advanced (2000-4999 points) - Can become mentor
- **Level 4:** Expert (5000-9999 points) - Can receive top performer NFTs
- **Level 5:** Master (10000+ points) - Maximum privileges

**Automatic progression:**
- Level up automatically when you reach required respect points
- Emits `LevelUp` event when you advance
- Unlocks `LEVEL_UP` achievement

### **⭐ Reputation System** (System Reputacji)
Community trust score (0-100) based on member ratings

**How reputation is calculated:**
- **Rating formula:** (ratingSum * 100) / (totalRatings * 5)
- **Members rate you 1-5 stars** - one rating per member per community
- **Reputation multiplier boost:** 1.5x when active

**Rate other members:**
```solidity
function rateMember(uint256 _communityId, address _member, uint256 _rating) external
```
- **Rating range:** 1-5 stars
- **One rating per member** - choose wisely
- **Can't rate yourself** - prevents manipulation

**Requirements for special features:**
- **Level 3+ and 70+ reputation** needed to become mentor
- **Level 4+ and 80+ reputation** needed for top performer NFTs

### **🔥 Activity Streak System** (System Serii Aktywności)
Daily activity tracking with automatic streak protection

**How streaks work:**
- **Daily activity** - any transaction extends streak
- **Streak protection:** 
  - 24-48h gap: Streak Saver automatically used (if available)
  - 48+ hours: Streak always resets
- **Streak Keeper achievement:** Unlocked at 7+ day streak
- **Longest streak tracked** - personal record keeping

**Streak Savers:**
- **Won from UtilityBox:** 10% chance per play
- **Automatic usage:** No manual activation needed
- **Streak preservation:** Saves your current streak once

### **🎁 Utility Items** (Przedmioty Użytkowe)
Special items that provide gameplay advantages

**Streak Savers:**
- **Function:** Automatically protects daily activity streak
- **Usage:** Automatic when you would lose streak (24-48h gap)
- **Source:** Won from UtilityBox (10% chance)
- **Event:** `StreakSaverUsed` when automatically consumed

**Achievement Vouchers:**
- **Function:** Unlock any premium achievement for FREE
- **Usage:** Manual activation via `useAchievementVoucher()`
- **Source:** Won from UtilityBox (4% chance)
- **Savings:** 0.0005 ETH per voucher used

## 🎲 **Game Activities** (Aktywności w grze)

### **1. 🎪 Events** (Wydarzenia)
Community competitions and activities

**Event Types:**
- **STANDARD (0)** - Regular community activities
- **COMPETITION (1)** - Skill-based contests with rankings
- **SEASONAL (2)** - Special platform-wide competitions
- **MYSTERY (3)** - 10% chance for instant ETH rewards

**How to participate:**
```solidity
function participateInEvent(uint256 _communityId, uint256 _eventId) external payable
```
- **Requirements:** Active community member
- **Event fee:** Set by event creator
- **Boost discount:** 20% off with EVENT_DISCOUNT boost active
- **Rewards:** ETH prizes, respect points, achievements
- **Fee breakdown:** 0.5% transaction fee + 2.5% platform fee

**Event lifecycle:**
- **Creation:** Moderators create events (costs 0.002 ETH)
- **Participation:** Members join during event window
- **Finalization:** Winners selected by moderators
- **Rewards:** Automatic distribution to winners

### **2. ⚔️ Challenges** (Wyzwania)
One-on-one battles with other players

**Create challenge:**
```solidity
function createChallenge(uint256 _communityId, address _challenged, string memory _description, uint32 _deadline) external payable
```
- **Stake required:** Your ETH at risk
- **Choose opponent:** Any active community member
- **Set deadline:** Future timestamp
- **Description:** Max 200 characters

**Accept challenge:**
```solidity
function acceptChallenge(uint256 _challengeId) external payable
```
- **Match stake:** Pay same amount as challenger
- **Compete:** Complete challenge requirements
- **Judgment:** Community creator decides winner
- **Winner rewards:** Full stake amount + 100 respect points

### **3. 🎁 Game Systems** (Systemy Gier)
Two distinct gaming systems with different risk/reward profiles

#### **A. MysteryBox (ETH Gambling)**
Risk-based game where you bet ETH to win more ETH

**How to play:**
```solidity
function openMysteryBox(uint256 _communityId) external payable
```
- **Requirements:** Active community member
- **Bet range:** 0.00035 - 0.01 ETH (~$1.05 - $30)
- **Transaction fee:** 0.5% of bet goes to platform
- **Prize pool:** 99.5% of bet goes to gambling pool

**Reward probabilities:**
- **2% chance:** 2.0x your bet (Jackpot!)
- **5% chance:** 1.5x your bet (Big win)
- **10% chance:** 1.1x your bet (Small win)  
- **50% chance:** 1.0x your bet (Break even)
- **20% chance:** 0.8x your bet (Small loss)
- **13% chance:** 0.5x your bet (Big loss)

**Economics:**
- **House edge:** ~3% built into probabilities
- **Platform profit:** 0.5% transaction fee + 3% house edge
- **Prize pool:** Dynamic, grows with plays, shrinks with wins

#### **B. UtilityBox (Item Lottery)**
Low-cost item lottery with virtual rewards

**How to play:**
```solidity
function openUtilityBox(uint256 _communityId) external payable
```
- **Cost:** Fixed 0.0001 ETH (~$0.30)
- **Requirements:** Active community member
- **Platform revenue:** 100% (pure profit)

**Reward probabilities:**
- **1% chance:** **Legendary NFT** (Rare collectible)
- **4% chance:** **Achievement Voucher** (Free premium achievement)
- **10% chance:** **Streak Saver** (Automatic streak protection)
- **5% chance:** **3-Day Boost** (Random type)
- **10% chance:** **1-Day Boost** (Random type)
- **20% chance:** **+25 Respect Points**
- **20% chance:** **+5 Respect Points**
- **30% chance:** **Nothing** (Better luck next time!)

**Strategy tips:**
- **High volume play** - Low cost allows frequent attempts
- **Utility focus** - Rewards provide gameplay advantages
- **Long-term value** - Vouchers can save significant ETH

### **4. 🚀 Boost System**
Temporary power-ups to enhance your gaming experience

**How to purchase:**
```solidity
function purchaseBoost(BoostType _boostType, uint32 _duration) external payable
```
- **Cost:** 0.0005 ETH per boost (~$1.50)
- **Duration:** 1 hour to 30 days (you choose)
- **Activation:** Must manually activate after purchase
- **Alternative:** Can be won in UtilityBox

**Boost Types:**

#### **🎯 Experience Multiplier (2x)**
- **Effect:** Double all respect points earned
- **Example:** Win event → normally 100 points → with boost 200 points
- **Best for:** Active players grinding levels

#### **⭐ Reputation Multiplier (1.5x)**
- **Effect:** 50% more reputation from activities
- **Example:** Rating improvement × 1.5
- **Best for:** Building trust quickly

#### **💰 Event Discount (20%)**
- **Effect:** 20% off all event participation fees
- **Example:** Event costs 0.01 ETH → with boost 0.008 ETH
- **Best for:** Heavy event participants

**Activation:**
```solidity
function activateBoost(BoostType _boostType) external
```
- **Buy first, then activate** when ready
- **Time starts counting** from activation
- **Multiple boosts** can be active simultaneously

### **5. 🌐 Cross-Community Visits**
Explore other communities and expand your network

**Start visit:**
```solidity
function startCrossCommunityVisit(uint256 _fromCommunityId, uint256 _toCommunityId) external
```
- **Requirements:** Active member in origin community
- **Target:** Any active community (different from yours)
- **Visit tracking:** Creates visit record with timestamp

**End visit:**
```solidity
function endCrossCommunityVisit(uint256 _visitId) external
```
- **Duration calculated:** Automatic timing
- **Rewards:** 10 respect points to your home community
- **Levels up:** Triggers level check after points added

### **6. 🎄 Seasonal Events**
Platform-wide special events

**Participation:**
```solidity
function participateInSeasonalEvent(uint256 _eventId, uint256 _communityId) external payable
```
- **Requirements:** Active community member
- **Community participation:** Your community must be in event
- **Rewards:** 50 respect points + contribution to community score
- **Prize pool:** Your payment contributes to total prizes

### **7. 👨‍🏫 Mentorship System**
Help newcomers and get rewarded

**Become mentor:**
```solidity
function becomeMentor(uint256 _communityId) external
```
- **Requirements:** Level 3+, reputation 70+
- **Rewards:** 25 respect points
- **Responsibilities:** Guide assigned mentees

**Complete mentorship:**
```solidity
function completeMentorship(uint256 _communityId) external
```
- **Available to:** Current mentees
- **Rewards:** 50 points (mentor), 25 points (mentee)
- **Effect:** Removes mentorship relationship

### **8. 📊 Governance**
Vote on community decisions

**Vote on proposal:**
```solidity
function voteOnProposal(uint256 _communityId, uint256 _proposalId, bool _support) external
```
- **Requirements:** Active community member
- **One vote per proposal** - choose wisely
- **Rewards:** 5 respect points per vote
- **Deadline:** Must vote before proposal expires

**Create proposal:**
```solidity
function createProposal(uint256 _communityId, string memory _description, uint32 _deadline) external
```
- **Requirements:** Active community member
- **Description:** Max 500 characters
- **Deadline:** Future timestamp
- **Democratic process:** All members can vote

## 🎖️ **Achievements & Rewards** (Osiągnięcia i nagrody)

### **🏅 Achievement Types**

**Automatic Achievements (Earned through gameplay):**
- **FIRST_JOIN (0)** - Welcome to the platform!
- **LEVEL_UP (1)** - Reached new level milestone
- **EVENT_WINNER (2)** - Won a competition
- **REFERRAL_MASTER (3)** - Brought 5+ new members
- **STREAK_KEEPER (4)** - 7+ days of daily activity
- **COLLECTIBLE_RECEIVED (5)** - Got special NFT reward

**💎 Premium Achievements**
Unlock exclusive achievements with ETH payment or vouchers

**Method 1: ETH Payment**
```solidity
function unlockPremiumAchievement(AchievementType _achievementType) external payable
```
- **Cost:** 0.0005 ETH per achievement (~$1.50)
- **Instant unlock** - no grinding required
- **One-time purchase** - permanent achievement

**Method 2: Voucher Usage (FREE!)**
```solidity
function useAchievementVoucher(AchievementType _achievementType) external
```
- **Requirements:** Must have Achievement Voucher (won from UtilityBox)
- **Cost:** FREE - uses voucher instead of ETH
- **Same result** - permanent achievement unlock

### **🎨 NFT Rewards**
Special collectible NFTs with different rarities

**Membership NFTs (Soulbound):**
- **Automatically minted** when you join first community
- **Can't be sold or transferred** - proof of membership
- **Permanent record** - shows your platform history

**Collectible NFTs:**
- **UtilityBox NFT:** 1% chance from UtilityBox (legendary rarity)
- **Top Performer NFT:** Awarded by community creators
- **Special Event NFTs:** Minted by platform owner

**NFT Benefits:**
- **Collectible value** - limited edition status
- **Social proof** - show your achievements
- **Platform history** - permanent record of success

## 🎯 **Advanced Strategies** (Zaawansowane strategie)

### **🚀 Progression Strategy**
Optimal path to high levels and reputation

**Phase 1: Foundation (Level 0-1)**
1. **Join community** - Find active community with good events
2. **Complete profile** - Build initial reputation
3. **Participate actively** - Join events, vote on proposals
4. **Use referrals** - Invite friends for bonus points
5. **Buy UtilityBox** - Low cost, high utility rewards

**Phase 2: Growth (Level 2-3)**
1. **Event focus** - Participate in high-reward events
2. **Challenge others** - Win 1v1 battles for big point gains
3. **Cross-community visits** - Explore other communities
4. **Become mentor** - Help newcomers, gain points
5. **Use boosts strategically** - Multiply your gains

**Phase 3: Mastery (Level 4-5)**
1. **Lead community** - Create valuable content
2. **Win competitions** - Dominate events
3. **Collect NFTs** - Build prestigious collection
4. **Mentor others** - Build network and reputation
5. **Platform influence** - Shape community direction

### **💰 Economic Strategy**
Maximize your ETH returns and minimize costs

**Revenue streams:**
- **Event winnings** - Prize pools from competitions
- **Challenge victories** - Take opponent stakes
- **MysteryBox wins** - Gambling profits (high risk)
- **Community creation** - Revenue from member fees

**Cost optimization:**
- **Event discount boost** - 20% off participation fees
- **Achievement vouchers** - Free premium unlocks
- **Lifetime subscriptions** - One-time payment vs recurring
- **Strategic timing** - Play when pools are high

### **🎮 Game Theory**
Understanding platform mechanics for competitive advantage

**Risk management:**
- **MysteryBox:** High risk, high reward - only bet what you can afford
- **UtilityBox:** Low risk, high utility - frequent small investments
- **Challenges:** Medium risk - choose opponents carefully
- **Events:** Low risk - entry fees usually reasonable

**Social dynamics:**
- **Reputation building** - Long-term investment in trust
- **Network effects** - More connections = more opportunities
- **Community leadership** - Influence brings rewards
- **Platform loyalty** - Early adopters often get special rewards

## 🔧 **Technical Tips** (Wskazówki techniczne)

### **Gas Optimization**
- **Batch transactions** - Group multiple actions
- **Off-peak timing** - Lower gas fees during quiet hours
- **Function planning** - Understand fee structures
- **Network monitoring** - Track Base network congestion

### **Security Best Practices**
- **Wallet security** - Use hardware wallets for large amounts
- **Private key protection** - Never share your keys
- **Transaction verification** - Double-check before confirming
- **Phishing awareness** - Only use official platform links

### **Performance Tracking**
- **Daily activity** - Maintain streak for bonuses
- **Achievement progress** - Track unlocked vs available
- **Reputation monitoring** - Build trust consistently
- **Level advancement** - Set respect point goals

This comprehensive guide provides everything you need to succeed on the HybridCommunityPlatform. Remember that success comes from consistent participation, strategic thinking, and building genuine relationships within communities. The platform rewards active, helpful members who contribute to the overall ecosystem health and growth. 