# 👑 Owner Functions Guide
*Guide for contract owner functions (Przewodnik funkcji dla właściciela kontraktu)*

## 🔐 **Overview**
As the contract owner, you have full administrative control over the platform. This guide covers all owner-only functions with detailed explanations and usage examples.

## 📋 **Core Administrative Functions**

### 1. **Community Management**
*Zarządzanie społecznościami*

#### `suspendCommunity(uint256 _communityId)`
**Purpose:** Temporarily suspend a community (Tymczasowe zawieszenie społeczności)
```solidity
function suspendCommunity(uint256 _communityId) external onlyOwner
```
- **When to use:** Community violates terms, suspicious activity
- **Effect:** Members can't join, events are disabled
- **Reversible:** Yes, using `reactivateCommunity()`

#### `reactivateCommunity(uint256 _communityId)`
**Purpose:** Reactivate a suspended community (Reaktywacja zawieszonej społeczności)
```solidity
function reactivateCommunity(uint256 _communityId) external onlyOwner
```
- **When to use:** After resolving issues with suspended community
- **Effect:** Community returns to normal operation

### 2. **User Management**
*Zarządzanie użytkownikami*

#### `globalBanUser(address _user)`
**Purpose:** Ban user from entire platform (Globalny ban użytkownika)
```solidity
function globalBanUser(address _user) external onlyOwner
```
- **When to use:** Serious violations, spam, abuse
- **Effect:** User can't join any community or participate
- **Permanent:** Until `globalUnbanUser()` is called

#### `globalUnbanUser(address _user)`
**Purpose:** Remove global ban (Usunięcie globalnego bana)
```solidity
function globalUnbanUser(address _user) external onlyOwner
```
- **When to use:** Appeal accepted, wrongful ban
- **Effect:** User can participate again

### 3. **Fee Management**
*Zarządzanie opłatami*

#### `setPlatformFeePercentage(uint256 _communityId, uint256 _percentage)`
**Purpose:** Set platform fee for a specific community (Ustawienie opłaty platformy dla konkretnej społeczności)
```solidity
function setPlatformFeePercentage(uint256 _communityId, uint256 _percentage) external onlyOwner
```
- **Parameters:**
  - `_communityId`: Community ID
  - `_percentage`: 0-1000 (0.1% = 1, max 10%)
- **When to use:** Custom fee structure, partnerships, penalties

#### `setCreationFee(uint256 _newFee)`
**Purpose:** Change community creation fee (Zmiana opłaty za stworzenie społeczności)
```solidity
function setCreationFee(uint256 _newFee) external onlyOwner
```
- **Default:** 0.01 ETH
- **When to use:** Market conditions, platform growth strategy

#### **Transaction Fee Percentage** **(CONSTANT!)** (STAŁA!)
**Purpose:** Transaction fee is now a constant value (Opłata transakcyjna jest teraz stałą wartością)
```solidity
uint256 constant public TRANSACTION_FEE_PERCENTAGE = 5; // 0.5% = 5/1000 (CONSTANT!)
```
- **Value:** 5 (0.5%) - CANNOT BE CHANGED
- **Reason:** Ensures predictable fees for users and stable revenue

#### `setWithdrawalFeePercentage(uint256 _newPercentage)` **(NEW!)**
**Purpose:** Set withdrawal fee percentage (Ustawienie procentowej opłaty za wypłatę)
```solidity
function setWithdrawalFeePercentage(uint256 _newPercentage) external onlyOwner
```
- **Default:** 10 (1%)
- **Maximum:** 100 (10%)
- **When to use:** Revenue optimization, prevent frequent withdrawals

#### `setAchievementUnlockFee(uint256 _newFee)` **(NEW!)**
**Purpose:** Set premium achievement unlock fee (Ustawienie opłaty za odblokowanie premium achievement)
```solidity
function setAchievementUnlockFee(uint256 _newFee) external onlyOwner
```
- **Default:** 0.0005 ETH (~$1.50) (LOWERED!)
- **When to use:** Balance premium feature pricing

#### `setBoostPurchaseFee(uint256 _newFee)` **(NEW!)**
**Purpose:** Set boost purchase fee (Ustawienie opłaty za zakup boosta)
```solidity
function setBoostPurchaseFee(uint256 _newFee) external onlyOwner
```
- **Default:** 0.0005 ETH (~$1.50) (LOWERED!)
- **When to use:** Adjust boost system profitability

#### `setEventPlatformFee(uint256 _newFee)` **(NEW!)**
**Purpose:** Set event creation fee (Ustawienie opłaty za stworzenie eventu)
```solidity
function setEventPlatformFee(uint256 _newFee) external onlyOwner
```
- **Default:** 0.002 ETH
- **When to use:** Balance event creation costs vs. accessibility

### 4. **🎲 Game Management (NEW!)**
*Zarządzanie grami MysteryBox i UtilityBox*

#### `fundMysteryBoxPool()`
**Purpose:** Fund the MysteryBox prize pool (Zasilenie puli nagród MysteryBox)
```solidity
function fundMysteryBoxPool() external payable onlyOwner
```
- **When to use:** **Crucial before platform launch!** The pool must be funded to cover initial, potentially high winnings before players contribute enough. Refill as needed. (Konieczne przed uruchomieniem platformy! Należy zasilić pulę, aby pokryć pierwsze, potencjalnie wysokie wygrane. Regularne zasilanie w miarę potrzeby.)
- **Effect:** Increases `mysteryBoxPrizePool`.

#### `withdrawFromPrizePool(uint256 _amount)`
**Purpose:** Withdraw excess funds from prize pool (Wypłata nadwyżki z puli nagród)
```solidity
function withdrawFromPrizePool(uint256 _amount) external onlyOwner
```
- **When to use:** When the prize pool has a significant surplus beyond what's needed to cover current winnings. (Gdy w puli nagród zgromadzi się znaczna nadwyżka.)
- **Effect:** Decreases `mysteryBoxPrizePool`.

#### `setMysteryBoxBetLimits(uint256 _minBet, uint256 _maxBet)`
**Purpose:** Set min/max bet for MysteryBox (Ustawienie limitów stawek dla MysteryBox)
```solidity
function setMysteryBoxBetLimits(uint256 _minBet, uint256 _maxBet) external onlyOwner
```
- **When to use:** To adjust the game to ETH prices, control risk, and manage the game's economy. (Aby dostosować grę do cen ETH, kontrolować ryzyko i zarządzać ekonomią gry.)
- **Defaults:** min: `0.00035 ETH`, max: `0.01 ETH`.

#### `setUtilityBoxFee(uint256 _newFee)`
**Purpose:** Set the fee for the UtilityBox (Ustawienie opłaty za UtilityBox)
```solidity
function setUtilityBoxFee(uint256 _newFee) external onlyOwner
```
- **Default:** `0.0001 ETH`.
- **When to use:** To adjust the price according to the value of rewards and demand. (Aby dostosować cenę do wartości nagród i popytu.)

#### `setUtilityBoxNftUri(string memory _newUri)`
**Purpose:** Set the metadata URI for the jackpot NFT (Ustawienie URI metadanych dla NFT)
```solidity
function setUtilityBoxNftUri(string memory _newUri) external onlyOwner
```
- **When to use:** **Crucial before platform launch!** You must set the link to the `.json` metadata file (hosted on IPFS) so the contract can mint the NFT prize. (Konieczne przed uruchomieniem platformy! Należy ustawić link do pliku `.json` z metadanymi (hostowanego na IPFS).)
- **Effect:** Updates `utilityBoxNftUri` string.


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
- **Parameters:**
  - `_name`: Event name (e.g., "Winter Championship")
  - `_startTime`: Unix timestamp
  - `_endTime`: Unix timestamp
  - `_participatingCommunities`: Array of community IDs
- **When to use:** Platform-wide competitions, special occasions

#### `startNewSeason()`
**Purpose:** Start new season (Rozpoczęcie nowego sezonu)
```solidity
function startNewSeason() external onlyOwner
```
- **Effect:** Increments season counter, enables seasonal features
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
  - `_tokenURI`: Metadata URI
  - `_category`: NFT category (e.g., "SpecialEvent", "Founder")
- **When to use:** Special rewards, partnerships, unique events

### 7. **Emergency Functions**
*Funkcje awaryjne*

#### `pause()`
**Purpose:** Pause entire platform (Zatrzymanie całej platformy)
```solidity
function pause() external onlyOwner
```
- **When to use:** Security vulnerability, maintenance, emergency
- **Effect:** All user functions disabled

#### `unpause()`
**Purpose:** Resume platform operations (Wznowienie działania platformy)
```solidity
function unpause() external onlyOwner
```
- **When to use:** After resolving emergency situation

#### `emergencyWithdraw()`
**Purpose:** Emergency withdrawal of all funds (Awaryjna wypłata wszystkich środków)
```solidity
function emergencyWithdraw() external onlyOwner
```
- **When to use:** Critical security issue, platform shutdown
- **Effect:** All ETH sent to owner address
- **⚠️ WARNING:** Use only in extreme situations

## 🎯 **Best Practices**

### **1. Community Moderation**
- **Regular monitoring:** Check community activity and reports
- **Graduated responses:** Warning → Suspension → Ban
- **Documentation:** Keep records of all actions taken

### **2. Fee Management**
- **Market research:** Monitor competitor fees
- **User feedback:** Consider community input
- **Gradual changes:** Avoid sudden large fee increases

### **3. Event Planning**
- **Advance notice:** Announce seasonal events early
- **Fair participation:** Ensure all communities can participate
- **Reward distribution:** Plan prize pools carefully

### **4. Emergency Preparedness**
- **Monitoring tools:** Set up alerts for unusual activity
- **Response plan:** Have clear procedures for emergencies
- **Communication:** Keep users informed during issues

## 📊 **Monitoring Dashboard**

### **Key Metrics to Track:**
- Total communities created
- Active users per day/week/month
- Revenue from fees (transaction, platform, withdrawal)
- Mystery box participation
- Event participation rates
- Boost system usage and revenue
- Premium achievement unlocks
- Community withdrawal patterns
- Support tickets/complaints

### **New Revenue Tracking:**
- **Transaction fees:** 0.5% from all payments
- **Boost purchases:** Track most popular boost types
- **Event creation fees:** Monitor event creation trends
- **Premium achievements:** Track unlock patterns
- **Withdrawal fees:** Monitor community cash-out behavior

### **Red Flags to Watch:**
- Sudden drop in activity
- Unusual transaction patterns
- Community creator complaints
- High support ticket volume
- Negative social media mentions
- **Excessive boost usage** (potential exploitation)
- **Unusual withdrawal patterns** (potential fraud)
- **Mystery box addiction indicators** (responsible gaming)

## 🔧 **Common Administrative Tasks**

### **Initial Setup Checklist (before launch):**
1. ✅ Deploy the contract.
2. ✅ Fund the `mysteryBoxPrizePool` with a sufficient amount to cover initial jackpots.
3. ✅ Set the `utilityBoxNftUri` to point to the IPFS metadata file for the collectible NFT.
4. ✅ Review and set all platform fees (`setMysteryBoxBetLimits`, `setUtilityBoxFee`, etc.).
5. ✅ Transfer ownership to a secure multi-sig wallet.

### **Weekly Tasks:**
1. Review new communities for compliance
2. Check support tickets and user reports
3. Monitor platform statistics
4. Update seasonal events if needed
5. Monitor prize pool balance for `MysteryBox`

### **Monthly Tasks:**
1. Analyze revenue and fee structure
2. Review suspended communities
3. Plan upcoming seasonal events
4. Update documentation

### **Quarterly Tasks:**
1. Consider starting new season
2. Review platform fee percentages
3. Audit emergency procedures
4. Platform feature updates

## 🎖️ **Special Privileges**

### **NFT Rewards:**
- Mint commemorative NFTs for milestones
- Create founder/early adopter NFTs
- Reward top community creators
- Partnership collaboration NFTs

### **Community Partnerships:**
- Set custom fee structures
- Create exclusive events
- Provide technical support
- Marketing collaboration

### **Platform Evolution:**
- Add new features
- Modify game mechanics
- Integrate with external platforms
- Expand to new networks

## ⚠️ **Important Warnings**

### **Security Considerations:**
- **Never share private keys** - use a multi-sig wallet (używaj multi-sig wallet)
- **Test on testnet first** - before mainnet deployment (przed mainnet deployment)
- **Monitor gas prices** - optimize transaction costs (optymalizuj koszty transakcji)
- **Keep emergency contacts** - list of developers and experts (lista deweloperów i ekspertów)

### **Legal Considerations:**
- **Comply with regulations** - different countries have different laws (różne kraje mają różne przepisy)
- **Terms of service** - clear platform rules (jasne zasady platformy)
- **Data protection** - GDPR and other regulations (GDPR i inne regulacje)
- **Tax implications** - consult with accountants (konsultuj z księgowymi)

---

**Remember:** Great power comes with great responsibility. Use these functions wisely to create a thriving, safe, and profitable platform for all users.

*Pamiętaj: Wielka władza wiąże się z wielką odpowiedzialnością. Używaj tych funkcji mądrze, aby stworzyć kwitnącą, bezpieczną i zyskowną platformę dla wszystkich użytkowników.* 