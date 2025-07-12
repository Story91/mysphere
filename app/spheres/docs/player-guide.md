# 🎮 Player Game Guide
*Player guide - how to play and win on the platform (Przewodnik gracza - jak grać i wygrywać na platformie)*

## 🚀 **Getting Started** (Pierwsze kroki)

### **1. Connect Your Wallet**
- **Supported wallets:** MetaMask, Coinbase Wallet, WalletConnect
- **Network:** Base (add Base network to MetaMask)
- **Required:** ETH for gas fees and activities

### **2. Find Communities**
- **Browse communities** - explore different options
- **Check fees** - join fee + monthly/lifetime subscription
- **Read descriptions** - understand community focus
- **Look at member count** - active vs inactive communities

### **3. Join Your First Community**
```solidity
// Function: joinCommunity(uint256 _communityId, bool _lifetime, address _referrer)
```
- **Choose subscription type:**
  - `false` - Monthly subscription (cheaper, recurring)
  - `true` - Lifetime subscription (more expensive, one-time)
- **Use referral code** - get bonus points if someone invited you
- **Receive NFT** - soulbound membership token (can't be sold)

## 🎯 **Core Game Mechanics** (Podstawowe mechaniki gry)

### **🏆 Respect Points System** (System Punktów Szacunku)
Your main currency for progression (główna waluta do rozwoju)

**How to earn:**
- **Join community:** 25 points (with referral)
- **Event participation:** 10-50 points
- **Event wins:** 100 points
- **Referrals:** 50 points per successful referral
- **Mentorship completion:** 25 points
- **Daily activity streak:** Bonus points
- **Cross-community visits:** 10 points per visit
- **UtilityBox:** Small and large point packs can be won

### **📈 Level System** (System Poziomów)
Your skill level determines available features (poziom umiejętności)

**Level Progression:**
- **Level 0:** Newcomer (0-99 points) - Basic access
- **Level 1:** Beginner (100-499 points) - Can create challenges
- **Level 2:** Intermediate (500-1999 points) - Advanced features
- **Level 3:** Advanced (2000-4999 points) - Can become mentor
- **Level 4:** Expert (5000-9999 points) - Top performer rewards
- **Level 5:** Master (10000+ points) - Maximum privileges

### **⭐ Reputation System** (System Reputacji)
Community trust score (0-100) (wynik zaufania społeczności)

**How to build reputation:**
- **Participate actively** - join events, help others
- **Win competitions** - show your skills
- **Help new members** - mentor others
- **Follow community rules** - no spam, be respectful
- **Get positive ratings** - other members rate you 1-5 stars

**Requirements for high reputation:**
- **Level 3+ and 70+ reputation** needed to become mentor
- **Level 4+ and 80+ reputation** needed for top performer NFTs

### **🛡️ New Utility Items** (Nowe Przedmioty Użytkowe)
- **Streak Saver:** A one-time use item that automatically protects your login streak if you forget to log in. No more frustration after losing a long streak! (Jednorazowy przedmiot, który automatycznie chroni Twoją passę logowań, jeśli zapomnisz się zalogować. Koniec z frustracją po utracie długiej serii!)
- **Achievement Voucher:** A "Free Ticket" that allows you to unlock any single paid achievement without paying the ETH fee. ("Darmowy bilet", który pozwala odblokować jedno, dowolne płatne osiągnięcie bez ponoszenia opłaty w ETH.)

## 🎲 **Game Activities** (Aktywności w grze)

### **1. 🎪 Events** (Wydarzenia)
Community competitions and activities (konkursy i aktywności społeczności)

**Types of events:**
- **Standard Events** - Regular community activities
- **Competitions** - Skill-based contests with rankings
- **Seasonal Events** - Special platform-wide competitions
- **Mystery Events** - Random rewards and surprises

**How to participate:**
```solidity
// Function: participateInEvent(uint256 _communityId, uint256 _eventId)
```
- **Pay participation fee** - set by event creator
- **Compete with others** - show your skills
- **Win rewards** - ETH prizes, respect points, NFTs
- **Build reputation** - active participation increases trust

### **2. ⚔️ Challenges** (Wyzwania)
One-on-one battles with other players (pojedynki z innymi graczami)

**How to create challenge:**
```solidity
// Function: createChallenge(uint256 _communityId, address _challenged, string memory _description, uint32 _deadline)
```
- **Choose opponent** - any active community member
- **Set stake** - ETH amount both players risk
- **Write description** - what the challenge is about
- **Set deadline** - when challenge expires

**How to accept challenge:**
```solidity
// Function: acceptChallenge(uint256 _challengeId)
```
- **Match the stake** - pay same amount as challenger
- **Compete** - complete the challenge requirements
- **Wait for judgment** - community creator decides winner
- **Winner takes all** - stake + respect points

### **3. 🎁 Random Games: MysteryBox vs UtilityBox** (Gry Losowe: MysteryBox vs UtilityBox)
The platform offers two separate random games, each with different goals and rewards. (Platforma oferuje dwie oddzielne gry losowe, każda z innym celem i nagrodami.)

#### **A. `MysteryBox` (Game for ETH)** (Gra o ETH)
A risk-based game where you stake ETH to win more ETH. (Gra oparta na ryzyku, w której stawiasz ETH, aby wygrać więcej ETH.)

**How to play:**
```solidity
// Function: openMysteryBox(uint256 _communityId)
```
- **Stake:** Variable, from `0.00035 ETH` to `0.01 ETH`. (Stawka: Zmienna, od `0.00035 ETH` do `0.01 ETH`.)
- **Prize Pool:** Your stake goes into a dedicated prize pool from which winnings are paid. The platform ensures the pool is always funded. (Pula Nagród: Twoja stawka zasila dedykowaną pulę, z której wypłacane są wygrane. Platforma zapewnia, że w puli zawsze są środki.)
- **Random Outcomes (House Edge ~5%):**
  - **2% chance:** 2.0x stake (Jackpot)
  - **5% chance:** 1.5x stake (Big win)
  - **10% chance:** 1.1x stake (Small win)
  - **50% chance:** 1.0x stake (Stake back)
  - **20% chance:** 0.8x stake (Small loss)
  - **13% chance:** 0.5x stake (Serious loss)
- **Strategy:** Play responsibly. This is a high-risk, high-reward game. (Strategia: Graj odpowiedzialnie. To gra o wysokim ryzyku i wysokiej nagrodzie.)

#### **B. `UtilityBox` (Item Lottery - NEW!)** (Loteria Przedmiotów - NOWOŚĆ!)
A low, fixed-fee game where you have a chance to win incredibly valuable in-game items. Perfect for those who don't want to risk a lot of ETH. (Gra o niskiej, stałej opłacie, w której masz szansę wygrać niezwykle cenne przedmioty w grze. Idealna dla tych, którzy nie chcą ryzykować dużo ETH.)

**How to play:**
```solidity
// Function: openUtilityBox(uint256 _communityId)
```
- **Cost:** A fixed, low fee of `0.0001 ETH`. (Koszt: Stała, niska opłata `0.0001 ETH`.)
- **Prizes:**
  - **1% chance:** **Legendary Collectible NFT** (Jackpot! Very rare and valuable).
  - **4% chance:** **Achievement Voucher** (Lets you unlock a paid achievement for free).
  - **10% chance:** **Streak Saver** (Protects your login streak).
  - **5% chance:** **Random 3-Day Boost**.
  - **10% chance:** **Random 1-Day Boost**.
  - **20% chance:** **+25 Respect Points**.
  - **20% chance:** **+5 Respect Points**.
  - **30% chance:** **Nothing** (There's always next time!).
- **Strategy:** An excellent way to cheaply acquire items that will significantly speed up your progress or save you ETH in the future. (Strategia: Doskonały sposób na tanie zdobycie przedmiotów, które znacząco przyspieszą Twój postęp lub oszczędzą Ci ETH w przyszłości.)

### **4. 🚀 Boost System (UPDATED!)**
Temporary power-ups to enhance your gaming experience.

**How to purchase:**
```solidity
// Function: purchaseBoost(BoostType _boostType, uint32 _duration)
```
- **Cost:** 0.0005 ETH per boost (~$1.50) (LOWERED!)
- **Duration:** 1 hour to 30 days (you choose)
- **Stackable:** Can extend existing boosts
- **Can also be won in the UtilityBox!** (Można je też wygrać w UtilityBox!)

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

**How to activate:**
```solidity
// Function: activateBoost(BoostType _boostType)
```
- **Buy first, then activate** when you need it
- **Time starts counting** from activation
- **Multiple boosts** can be active simultaneously

### **4. 🌐 Cross-Community Visits**
Explore other communities (eksploruj inne społeczności)

**How to visit:**
```solidity
// Function: startCrossCommunityVisit(uint256 _fromCommunityId, uint256 _toCommunityId)
```
- **Start visit** - leave your community temporarily
- **Explore** - see how other communities work
- **Learn** - discover new strategies and features
- **End visit** - return to your community
- **Earn points** - 10 respect points per visit

### **5. 📊 Governance**
Vote on community decisions (głosuj w sprawach społeczności)

**How to participate:**
```solidity
// Function: voteOnProposal(uint256 _communityId, uint256 _proposalId, bool _support)
```
- **Read proposals** - understand what's being voted on
- **Make informed decisions** - consider impact on community
- **Vote yes/no** - support or oppose proposals
- **Earn points** - 5 respect points per vote

## 🎖️ **Achievements & Rewards** (Osiągnięcia i nagrody)

### **🏅 Achievement Types**

**Free Achievements (Earned through gameplay):**
- **First Join** - Welcome to the platform!
- **Level Up** - Reached new level milestone
- **Event Winner** - Won a competition
- **Referral Master** - Brought 5+ new members
- **Streak Keeper** - 7+ days of daily activity
- **Collectible Received** - Got special NFT reward

**💎 Premium Achievements (UPDATED!)**
Unlock exclusive achievements with ETH payment

**How to unlock:**
```solidity
// Function: unlockPremiumAchievement(AchievementType _achievementType)
```
- **Cost:** 0.0005 ETH per achievement (~$1.50)
- **Instant unlock** - no grinding required
- **Use a Voucher!** - If you won an `Achievement Voucher` in the `UtilityBox`, you can unlock an achievement for free! (Użyj Vouchera! - Jeśli wygrałeś `Achievement Voucher` w `UtilityBox`, możesz odblokować osiągnięcie za darmo!)

**Why unlock premium achievements:**
- **Flex your wealth** - show you can afford premium features
- **Support the platform** - help fund development
- **Collector value** - limited edition status
- **Complete your collection** - get all achievements
- **Social status** - premium member recognition

### **🎨 NFT Rewards**
Two types of NFTs (dwa typy NFT)

**Membership NFTs (Soulbound):**
- **Automatically minted** when you join community
- **Can't be sold or transferred** - proof of membership
- **Shows your stats** - level, points, achievements
- **Permanent record** - your gaming history

**Collectible NFTs (Tradeable):**
- **Earned through achievements** - top performer, special events
- **Won in the `UtilityBox`** - the jackpot prize!
- **Can be sold/traded** - valuable rewards
- **Unique artwork** - different categories and rarities
- **Show off your accomplishments** - display your success

### **💰 Financial Rewards**
- **Event prizes** - ETH rewards for winning competitions
- **Challenge stakes** - winner takes all
- **Referral bonuses** - earn from bringing new members
- **Mystery box wins** - random ETH prizes from `MysteryBox`
- **UtilityBox wins:** valuable items you can use or sell (if it's an NFT) (cenne przedmioty, które można wykorzystać lub sprzedać (jeśli to NFT))

## 🧠 **Strategies for Success** (Strategie sukcesu)

### **💡 Beginner Strategy (Level 0-1)**
1. **Join active community** - look for regular events
2. **Participate in everything** - build points quickly
3. **Find referrals** - bring friends for bonus points
4. **Be helpful** - build reputation early
5. **Learn from others** - observe successful players
6. **🚀 NEW: Open the `UtilityBox`** - for a small fee, you get a chance at rewards that will significantly boost your start. (za niewielką opłatą masz szansę na nagrody, które znacznie przyspieszą Twój start.)

### **🎯 Intermediate Strategy (Level 2-3)**
1. **Specialize in events** - find your strengths
2. **Create challenges** - use your skills to win stakes
3. **Become mentor** - earn steady points helping others
4. **Cross-community visits** - explore new opportunities
5. **Build network** - connect with other players
6. **🚀 NEW: Buy `Experience Boost`** - 2x points for faster leveling, or win one from the `UtilityBox`.
7. **🚀 NEW: Use `Event Discount` boost** - save 20% on event fees.

### **🏆 Advanced Strategy (Level 4-5)**
1. **Optimize boost usage** - time boosts for maximum impact
2. **Play `MysteryBox` wisely** - it's a high-risk game.
3. **Complete your premium achievements** - complete your collection, using vouchers to save money.
4. **Mentor multiple users** - steady income stream
5. **Strategic boost timing** - use during high-activity periods

## 📈 **Progression Tips** (Wskazówki rozwoju)

### **Daily Habits**
- **Log in daily** - maintain activity streak
- **Check events** - don't miss opportunities
- **Help community** - answer questions, be supportive
- **Rate other members** - build reputation network
- **Complete challenges** - practice your skills

### **Weekly Goals**
- **Participate in 2-3 events** - consistent activity
- **Create 1 challenge** - test your skills
- **Bring 1 new member** - referral bonus
- **Cross-visit 1 community** - explore alternatives
- **Vote on proposals** - engage in governance

### **Monthly Objectives**
- **Level up** - increase your tier
- **Win event** - prove your skills
- **Earn collectible NFT** - achieve something special
- **Build mentor relationship** - either side
- **Increase reputation** - get better ratings

## ⚠️ **Common Mistakes to Avoid** (Częste błędy do uniknięcia)

### **❌ Don't Do This:**
- **Spam communities** - you'll get banned
- **Bet too much on mystery boxes** - it's gambling, play responsibly
- **Ignore reputation** - low reputation limits opportunities
- **Hoard Vouchers/Savers** - use them to maximize their benefits! (używaj ich, aby zmaksymalizować korzyści!)
- **Join too many communities** - focus on 1-2 active ones
- **Skip events** - main source of points and rewards

### **✅ Do This Instead:**
- **Be genuine and helpful** - build real relationships
- **Bet only what you can afford** - treat `MysteryBox` as entertainment and `UtilityBox` as a low-cost investment in your progress.
- **Participate actively** - show you're a valuable member
- **Choose quality over quantity** - better to be active in fewer communities
- **Engage consistently** - regular participation beats sporadic bursts

## 🎮 **Advanced Game Features** (Zaawansowane funkcje gry)

### **🎭 Seasonal Events**
Platform-wide competitions (konkursy na całej platformie)

- **Cross-community competition** - represent your community
- **Larger prize pools** - combined from all participants
- **Special recognition** - platform-wide leaderboards
- **Unique rewards** - seasonal NFTs and achievements
- **Community pride** - fight for your community's honor

### **👨‍🏫 Mentorship System**
Help others while earning rewards (pomagaj innym zarabiając nagrody)

**To become mentor:**
- **Reach Level 3** - prove your experience
- **Maintain 70+ reputation** - show you're trustworthy
- **Apply with moderator** - get officially assigned
- **Teach new members** - share your knowledge
- **Earn steady points** - 25-50 points per mentorship

### **🏪 NFT Marketplace**
Trade your collectible NFTs (handluj swoimi NFT)

- **List for sale** - set your price
- **Buy from others** - expand your collection
- **Track rarity** - understand NFT values
- **Build portfolio** - collect valuable pieces
- **Show off achievements** - display your success

## 💰 **Economics & ROI** (Ekonomia i zwrot z inwestycji)

### **Investment Breakdown**
**Initial costs:**
- **Join fee:** 0.001-0.1 ETH (depends on community)
- **Monthly subscription:** 0.005-0.05 ETH
- **OR Lifetime subscription:** 0.05-0.5 ETH

**Earning potential:**
- **Event winnings:** 0.01-1 ETH per event
- **Challenge stakes:** 0.001-0.1 ETH per challenge
- **NFT sales:** 0.01-10 ETH (rare collectibles)
- **Referral bonuses:** varies by community

### **ROI Scenarios**
**Conservative player:**
- **Monthly cost:** 0.01 ETH
- **Earnings:** 0.02 ETH (events + referrals) + prizes from `UtilityBox`
- **Net profit:** 0.01 ETH/month + prizes from `UtilityBox`

**Active player:**
- **Monthly cost:** 0.05 ETH
- **Earnings:** 0.15 ETH (competitions + challenges) + prizes from `UtilityBox`
- **Net profit:** 0.1 ETH/month + prizes from `UtilityBox`

**Pro player:**
- **Monthly cost:** 0.1 ETH
- **Earnings:** 0.5 ETH (high-stakes events + NFTs) + profits from selling rare NFTs from `UtilityBox`
- **Net profit:** 0.4 ETH/month

## 🛡️ **Safety & Security** (Bezpieczeństwo)

### **Wallet Security**
- **Use hardware wallet** - Ledger, Trezor for large amounts
- **Enable 2FA** - secure your accounts
- **Never share private keys** - keep them secret
- **Regular backups** - multiple secure locations
- **Monitor transactions** - check for unauthorized activity

### **Platform Safety**
- **Start small** - test with small amounts first
- **Read community rules** - avoid getting banned
- **Report suspicious activity** - help keep platform safe
- **Don't share personal info** - protect your privacy
- **Use strong passwords** - secure your accounts
- **Remember the risk** - `MysteryBox` is a game of chance, play responsibly. (Pamiętaj o ryzyku - `MysteryBox` to gra losowa, graj odpowiedzialnie.)

### **Smart Contract Risks**
- **Audit results** - contract has been tested
- **Open source** - code is public and reviewable
- **Time locks** - no sudden changes possible
- **Multi-sig security** - multiple approvals required
- **Emergency stops** - can pause if needed

---

**Final Tips:** Success on the platform comes from consistent participation, building genuine relationships, and smart risk management. Start small, learn the system, and gradually increase your involvement as you become more comfortable.

*Final Tips (Końcowe wskazówki): Sukces na platformie wynika z konsekwentnego uczestnictwa, budowania prawdziwych relacji i inteligentnego zarządzania ryzykiem. Zacznij od małych kroków, ucz się systemu i stopniowo zwiększaj swoje zaangażowanie, gdy poczujesz się bardziej komfortowo.* 