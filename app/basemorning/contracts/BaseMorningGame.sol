// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseElementNFT.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";

contract BaseMorningGame is Ownable, VRFConsumerBaseV2 {
    VRFCoordinatorV2Interface COORDINATOR;
    
    // VRF subscription
    uint64 s_subscriptionId;
    bytes32 keyHash;
    uint32 callbackGasLimit = 100000;
    uint16 requestConfirmations = 3;
    uint32 numWords = 1;

    BaseElementNFT public nftContract;
    
    // Game constants
    uint256 public constant DAILY_XP = 100;
    uint256 public constant CHECK_IN_COOLDOWN = 24 hours;
    uint256 public constant STREAK_RESET_TIME = 48 hours;
    uint256 public constant MINT_PRICE = 0.00005 ether; // Fixed price per NFT
    uint256 public constant FUSION_BASE_COST = 0.0005 ether; // Base fusion cost
    uint256 public constant FUSION_LEVEL_MULTIPLIER = 0.00005 ether; // Cost increase per level
    uint256 public constant ALLIANCE_CREATE_COST = 1000;
    uint256 public constant MAX_ALLIANCE_MEMBERS = 50;
    uint256 public constant PVP_COOLDOWN = 1 hours;

    // NEW: Resource System Constants
    uint256 public constant DAILY_RESOURCE_REWARD = 50; // Base daily resources from check-in
    uint256 public constant RESOURCE_PER_XP = 1; // Resources earned per XP point
    uint256 public constant FUSION_RESOURCE_COST = 100; // Resources needed for fusion
    uint256 public constant MARKETPLACE_FEE_PERCENT = 3; // 3% marketplace fee
    uint256 public constant RESOURCE_EXCHANGE_RATE = 1000; // 1000 resources = 0.0001 ETH
    
    // Power Calculation Constants
    uint256 public constant BASE_POWER = 100;
    uint256 public constant RARITY_MULTIPLIER_COMMON = 10;
    uint256 public constant RARITY_MULTIPLIER_UNCOMMON = 12;
    uint256 public constant RARITY_MULTIPLIER_RARE = 15;
    uint256 public constant RARITY_MULTIPLIER_EPIC = 20;
    uint256 public constant PLAYER_LEVEL_POWER_BONUS = 5;
    
    // Struktury podstawowe
    struct LevelRequirement {
        uint8 elementCount;
        uint8 minElementLevel;
        uint256 requiredXP;
        uint256 requiredResources; // NEW: Resources needed for level up
    }
    
    struct Player {
        uint256 xp;
        uint256 lastCheckIn;
        uint256 streak;
        uint8 baseLevel;
        bool isActive;
        uint256 lastPvpBattle;
        uint256 pvpWins;
        uint256 resources; // NEW: Player's resource balance
        uint256 totalResourcesEarned; // NEW: Lifetime resources earned
        uint256 totalResourcesSpent; // NEW: Lifetime resources spent
        uint256 allianceId;
        uint256[] completedAchievements;
        uint256[] activeMissions;
    }

    // Nowe struktury
    struct Trade {
        address seller;
        uint256 tokenId;
        uint256 price;
        uint256 resourcePrice; // NEW: Optional resource price
        bool isActive;
        bool acceptsResources; // NEW: Whether trade accepts resources
    }
    
    struct Mission {
        string name;
        uint256 duration;
        uint256 xpReward;
        uint256 resourceReward;
        uint256 resourceCost; // NEW: Resources required to start mission
        uint8 minBaseLevel;
        uint8 requiredElements;
        BaseElementNFT.ElementType requiredElementType;
    }
    
    struct Alliance {
        string name;
        address leader;
        address[] members;
        uint256 totalPower;
        uint256 level;
        uint256 resources; // NEW: Alliance shared resources
        uint256 resourceContributions; // NEW: Total resources contributed
        mapping(address => bool) memberStatus;
        mapping(address => uint256) memberContributions; // NEW: Individual contributions
    }
    
    struct Event {
        string name;
        uint256 startTime;
        uint256 endTime;
        uint256 xpMultiplier;
        uint256 resourceMultiplier;
        bool isActive;
    }
    
    struct Achievement {
        string name;
        string description;
        uint256 requirement;
        uint256 xpReward;
        uint256 resourceReward;
        AchievementType achievementType;
    }
    
    // NEW: Resource Shop Items
    struct ShopItem {
        string name;
        uint256 resourceCost;
        uint256 xpBonus;
        uint256 powerBonus;
        uint256 duration; // in seconds, 0 for permanent
        bool isActive;
    }
    
    // NEW: Player Buffs
    struct PlayerBuff {
        uint256 xpBonus;
        uint256 powerBonus;
        uint256 expiresAt;
    }
    
    // Batch minting tracking
    struct BatchMint {
        address player;
        uint8 quantity;
        uint8 remaining;
        uint256 totalPaid;
    }
    
    // Fusion tracking
    struct FusionRequest {
        address player;
        uint256[] tokenIds;
        FusionType fusionType;
        uint256 cost;
    }
    
    enum FusionType {
        STANDARD,
        EPIC,
        GENESIS
    }
    
    enum AchievementType {
        STREAK_DAYS,
        TOTAL_CHECK_INS,
        PVP_WINS,
        ELEMENTS_FUSED,
        MISSIONS_COMPLETED,
        BASE_LEVEL,
        ALLIANCE_LEVEL,
        RESOURCES_EARNED, // NEW
        RESOURCES_SPENT   // NEW
    }
    
    // Mappings
    mapping(address => Player) public players;
    mapping(uint8 => LevelRequirement) public levelRequirements;
    mapping(uint256 => Trade) public trades;
    mapping(uint256 => Mission) public missions;
    mapping(uint256 => Alliance) public alliances;
    mapping(uint256 => Achievement) public achievements;
    mapping(uint256 => Event) public events;
    mapping(address => mapping(uint256 => bool)) public playerMissions;
    mapping(uint256 => address) public pendingMints;
    mapping(uint256 => BatchMint) public pendingBatchMints;
    mapping(uint256 => FusionRequest) public pendingFusions;
    
    // NEW: Resource System Mappings
    mapping(uint256 => ShopItem) public shopItems;
    mapping(address => PlayerBuff) public playerBuffs;
    mapping(address => mapping(uint256 => uint256)) public playerItemPurchases; // player => itemId => quantity
    
    // Counters
    uint256 public totalTrades;
    uint256 public totalMissions;
    uint256 public totalAlliances;
    uint256 public totalAchievements;
    uint256 public totalEvents;
    uint256 public totalShopItems; // NEW
    uint256 public totalResourcesInCirculation; // NEW
    
    // Events
    event PlayerRegistered(address player);
    event CheckInCompleted(address player, uint256 streak, uint256 xpEarned, uint256 resourcesEarned);
    event BaseLevelUp(address player, uint8 newLevel);
    event ElementFused(address player, uint256[] burnedTokenIds, uint256 newTokenId);
    event EpicElementFused(address player, uint256[] burnedTokenIds, uint256 newTokenId, uint8 newLevel);
    event GenesisElementFused(address player, uint256[] burnedTokenIds, uint256 newTokenId);
    event ElementMinted(address player, uint256 tokenId, uint256 price);
    event BatchElementsMinted(address player, uint8 quantity, uint256 totalPrice, uint256 discount);
    event FundsWithdrawn(address owner, uint256 amount);
    event TradeCreated(uint256 tradeId, address seller, uint256 tokenId, uint256 price, uint256 resourcePrice);
    event TradeCancelled(uint256 tradeId);
    event TradeCompleted(uint256 tradeId, address buyer, bool paidWithResources);
    event MissionStarted(address player, uint256 missionId);
    event MissionCompleted(address player, uint256 missionId, uint256 xpEarned, uint256 resourcesEarned);
    event AllianceCreated(uint256 allianceId, string name, address leader);
    event AllianceJoined(uint256 allianceId, address member);
    event AllianceLeft(uint256 allianceId, address member);
    event EventStarted(uint256 eventId, string name);
    event EventEnded(uint256 eventId);
    event AchievementCompleted(address player, uint256 achievementId);
    event PvpBattleCompleted(address winner, address loser, uint256 xpEarned, uint256 resourcesEarned);
    
    // NEW: Resource Events
    event ResourcesEarned(address player, uint256 amount, string source);
    event ResourcesSpent(address player, uint256 amount, string purpose);
    event ResourcesExchanged(address player, uint256 resourcesSpent, uint256 ethReceived);
    event ShopItemPurchased(address player, uint256 itemId, uint256 cost);
    event AllianceResourceContribution(uint256 allianceId, address member, uint256 amount);
    event MarketplaceFeeCollected(uint256 tradeId, uint256 feeAmount);
    
    constructor(
        address _nftContract,
        address _vrfCoordinator,
        uint64 _subscriptionId,
        bytes32 _keyHash
    ) 
        VRFConsumerBaseV2(_vrfCoordinator)
        Ownable()
    {
        COORDINATOR = VRFCoordinatorV2Interface(_vrfCoordinator);
        nftContract = BaseElementNFT(_nftContract);
        s_subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        initializeLevelRequirements();
        initializeShopItems();
    }
    
    function initializeLevelRequirements() private {
        levelRequirements[1] = LevelRequirement(1, 1, 0, 0);
        levelRequirements[2] = LevelRequirement(3, 2, 500, 100);
        levelRequirements[3] = LevelRequirement(5, 3, 1500, 300);
        levelRequirements[4] = LevelRequirement(8, 4, 3000, 600);
        levelRequirements[5] = LevelRequirement(12, 5, 6000, 1200);
        levelRequirements[6] = LevelRequirement(18, 6, 10000, 2000);
        levelRequirements[7] = LevelRequirement(25, 7, 20000, 4000);
        levelRequirements[8] = LevelRequirement(35, 8, 40000, 8000);
        levelRequirements[9] = LevelRequirement(50, 9, 80000, 16000);
        levelRequirements[10] = LevelRequirement(75, 10, 150000, 30000);
    }
    
    // NEW: Initialize shop items
    function initializeShopItems() private {
        totalShopItems = 5;
        
        shopItems[1] = ShopItem("XP Booster", 200, 50, 0, 3600, true); // 1 hour XP boost
        shopItems[2] = ShopItem("Power Enhancer", 500, 0, 25, 7200, true); // 2 hour power boost
        shopItems[3] = ShopItem("Daily Boost", 100, 25, 10, 86400, true); // 24 hour combo boost
        shopItems[4] = ShopItem("Fusion Discount", 1000, 0, 0, 0, true); // Permanent fusion cost reduction
        shopItems[5] = ShopItem("Resource Multiplier", 800, 0, 0, 10800, true); // 3 hour resource boost
    }
    
    function register() external {
        require(!players[msg.sender].isActive, "Player already registered");
        
        players[msg.sender] = Player({
            xp: 0,
            lastCheckIn: 0,
            streak: 0,
            baseLevel: 1,
            isActive: true,
            lastPvpBattle: 0,
            pvpWins: 0,
            resources: 100, // NEW: Starting resources
            totalResourcesEarned: 100,
            totalResourcesSpent: 0,
            allianceId: 0,
            completedAchievements: new uint256[](0),
            activeMissions: new uint256[](0)
        });
        
        totalResourcesInCirculation += 100;
        emit PlayerRegistered(msg.sender);
        emit ResourcesEarned(msg.sender, 100, "Registration bonus");
    }
    
    function checkIn() external {
        require(players[msg.sender].isActive, "Player not registered");
        require(
            block.timestamp >= players[msg.sender].lastCheckIn + CHECK_IN_COOLDOWN,
            "Too early for check-in"
        );
        
        Player storage player = players[msg.sender];
        
        // Calculate streak
        if (block.timestamp > player.lastCheckIn + STREAK_RESET_TIME) {
            player.streak = 1;
        } else {
            player.streak += 1;
        }
        
        // Calculate XP reward with enhanced streak bonuses
        uint256 xpReward = calculateXPReward(player.streak);
        
        // Apply player buffs
        if (playerBuffs[msg.sender].expiresAt > block.timestamp) {
            xpReward += playerBuffs[msg.sender].xpBonus;
        }
        
        // Calculate resource reward
        uint256 resourceReward = calculateResourceReward(player.streak);
        
        // Apply resource multiplier buff
        if (playerBuffs[msg.sender].expiresAt > block.timestamp) {
            // Check if player has resource multiplier buff (item 5)
            if (playerItemPurchases[msg.sender][5] > 0) {
                resourceReward = resourceReward * 2; // Double resources
            }
        }
        
        player.xp += xpReward;
        player.resources += resourceReward;
        player.totalResourcesEarned += resourceReward;
        player.lastCheckIn = block.timestamp;
        
        totalResourcesInCirculation += resourceReward;
        
        emit CheckInCompleted(msg.sender, player.streak, xpReward, resourceReward);
        emit ResourcesEarned(msg.sender, resourceReward, "Daily check-in");
    }
    
    function calculateXPReward(uint256 streak) public pure returns (uint256) {
        uint256 reward = DAILY_XP;
        
        if (streak >= 30) reward += 2000;
        else if (streak >= 14) reward += 1000;
        else if (streak >= 7) reward += 400;
        else if (streak >= 3) reward += 100;
        
        return reward;
    }
    
    // NEW: Calculate resource reward based on streak
    function calculateResourceReward(uint256 streak) public pure returns (uint256) {
        uint256 reward = DAILY_RESOURCE_REWARD;
        
        if (streak >= 30) reward += 200;
        else if (streak >= 14) reward += 100;
        else if (streak >= 7) reward += 50;
        else if (streak >= 3) reward += 25;
        
        return reward;
    }

    // Paid NFT minting function
    function mintElement() external payable {
        require(players[msg.sender].isActive, "Player not registered");
        require(msg.value == MINT_PRICE, "Incorrect payment amount");
        
        // Request randomness for NFT generation
        uint256 requestId = requestRandomness();
        pendingMints[requestId] = msg.sender;
    }
    
    // Batch NFT minting with automatic discounts
    function mintElements(uint8 quantity) external payable {
        require(players[msg.sender].isActive, "Player not registered");
        require(quantity > 0 && quantity <= 20, "Invalid quantity (1-20)");
        
        uint256 totalCost = calculateBatchPrice(quantity);
        require(msg.value == totalCost, "Incorrect payment amount");
        
        // Request randomness for first NFT in batch
        uint256 requestId = requestRandomness();
        pendingBatchMints[requestId] = BatchMint({
            player: msg.sender,
            quantity: quantity,
            remaining: quantity,
            totalPaid: totalCost
        });
        
        // Calculate discount for event
        uint256 originalPrice = MINT_PRICE * quantity;
        uint256 discount = originalPrice - totalCost;
        
        emit BatchElementsMinted(msg.sender, quantity, totalCost, discount);
    }
    
    // Calculate batch pricing with automatic discounts
    function calculateBatchPrice(uint8 quantity) public pure returns (uint256) {
        require(quantity > 0 && quantity <= 20, "Invalid quantity");
        
        uint256 basePrice = MINT_PRICE * quantity;
        uint256 discountPercent = 0;
        
        // Bulk discounts
        if (quantity >= 10) {
            discountPercent = 15; // 15% off for 10+
        } else if (quantity >= 5) {
            discountPercent = 10; // 10% off for 5+
        } else if (quantity >= 3) {
            discountPercent = 5;  // 5% off for 3+
        }
        
        if (discountPercent > 0) {
            uint256 discount = (basePrice * discountPercent) / 100;
            return basePrice - discount;
        }
        
        return basePrice;
    }
    
    // Get discount percentage for quantity
    function getDiscountPercent(uint8 quantity) external pure returns (uint8) {
        if (quantity >= 10) return 15;
        if (quantity >= 5) return 10;
        if (quantity >= 3) return 5;
        return 0;
    }

    function getPower(uint256 tokenId) external view returns (uint256) {
        BaseElementNFT.Element memory element = nftContract.getElement(tokenId);
        address owner = nftContract.ownerOf(tokenId);
        Player storage player = players[owner];

        uint256 rarityMultiplier;
        if (element.rarity == BaseElementNFT.Rarity.COMMON) {
            rarityMultiplier = RARITY_MULTIPLIER_COMMON;
        } else if (element.rarity == BaseElementNFT.Rarity.UNCOMMON) {
            rarityMultiplier = RARITY_MULTIPLIER_UNCOMMON;
        } else if (element.rarity == BaseElementNFT.Rarity.RARE) {
            rarityMultiplier = RARITY_MULTIPLIER_RARE;
        } else {
            rarityMultiplier = RARITY_MULTIPLIER_EPIC;
        }

        uint256 basePower = BASE_POWER * element.level;
        uint256 rarityAdjustedPower = (basePower * rarityMultiplier) / 10;
        uint256 playerBonus = player.baseLevel * PLAYER_LEVEL_POWER_BONUS;
        
        // Add buff bonus if active
        if (playerBuffs[owner].expiresAt > block.timestamp) {
            rarityAdjustedPower += playerBuffs[owner].powerBonus;
        }
        
        return rarityAdjustedPower + playerBonus;
    }

    function getFusionCost(address playerAddress) external view returns (uint256) {
        Player storage player = players[playerAddress];
        require(player.isActive, "Player not registered");
        return FUSION_BASE_COST + (FUSION_LEVEL_MULTIPLIER * (player.baseLevel - 1));
    }
    
    function requestRandomness() internal returns (uint256 requestId) {
        requestId = COORDINATOR.requestRandomWords(
            keyHash,
            s_subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        return requestId;
    }
    
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        // Handle single mint
        if (pendingMints[requestId] != address(0)) {
            address player = pendingMints[requestId];
            uint256 tokenId = mintRandomElement(player, randomWords[0]);
            delete pendingMints[requestId];
            emit ElementMinted(player, tokenId, MINT_PRICE);
            return;
        }
        
        // Handle batch mint
        BatchMint storage batch = pendingBatchMints[requestId];
        if (batch.player != address(0)) {
            // Mint one element for this randomness
            uint256 tokenId = mintRandomElement(batch.player, randomWords[0]);
            batch.remaining--;
            
            // If more elements needed, request more randomness
            if (batch.remaining > 0) {
                uint256 nextRequestId = requestRandomness();
                pendingBatchMints[nextRequestId] = BatchMint({
                    player: batch.player,
                    quantity: batch.quantity,
                    remaining: batch.remaining,
                    totalPaid: batch.totalPaid
                });
            }
            
            emit ElementMinted(batch.player, tokenId, MINT_PRICE);
            
            // Clean up if batch complete
            if (batch.remaining == 0) {
                delete pendingBatchMints[requestId];
            }
        }
    }
    
    function mintRandomElement(address player, uint256 randomness) private returns (uint256) {
        uint256 typeRandom = randomness % 5;
        uint256 rarityRandom = (randomness / 100) % 100;
        uint8 level = uint8(1 + (players[player].baseLevel / 2));
        
        BaseElementNFT.ElementType elementType = BaseElementNFT.ElementType(typeRandom);
        BaseElementNFT.Rarity rarity;
        
        if (rarityRandom < 50) rarity = BaseElementNFT.Rarity.COMMON;
        else if (rarityRandom < 80) rarity = BaseElementNFT.Rarity.UNCOMMON;
        else if (rarityRandom < 95) rarity = BaseElementNFT.Rarity.RARE;
        else rarity = BaseElementNFT.Rarity.EPIC;
        
        return nftContract.mint(player, elementType, rarity, level);
    }
    
    function fuseElements(uint256[] calldata tokenIds) external payable {
        Player storage player = players[msg.sender];
        require(player.isActive, "Player not registered");

        uint256 fusionCost = getFusionCost(msg.sender);
        require(msg.value >= fusionCost, "Incorrect payment for fusion");
        
        if (tokenIds.length == 3) {
            handleStandardOrEpicFusion(tokenIds);
        } else if (tokenIds.length == 5) {
            handleGenesisFusion(tokenIds);
        } else {
            revert("Invalid number of elements for fusion (must be 3 or 5)");
        }
    }

    function handleStandardOrEpicFusion(uint256[] memory tokenIds) private {
        // Check ownership and similarity for all 3 tokens
        BaseElementNFT.Element memory firstElement = nftContract.getElement(tokenIds[0]);
        for (uint i = 0; i < 3; i++) {
            require(nftContract.ownerOf(tokenIds[i]) == msg.sender, "Not the owner of an element");
            if (i > 0) {
                BaseElementNFT.Element memory currentElement = nftContract.getElement(tokenIds[i]);
                require(
                    currentElement.elementType == firstElement.elementType &&
                    currentElement.rarity == firstElement.rarity &&
                    currentElement.level == firstElement.level,
                    "Elements must be of the same type, rarity, and level"
                );
            }
        }
        
        // Burn the old elements
        for (uint i = 0; i < 3; i++) {
            nftContract.burn(tokenIds[i]);
        }

        uint256 newTokenId;
        if (firstElement.rarity == BaseElementNFT.Rarity.EPIC) {
            // Epic Fusion
            uint8 newLevel = firstElement.level + 1;
            newTokenId = nftContract.mint(msg.sender, firstElement.elementType, firstElement.rarity, newLevel);
            emit EpicElementFused(msg.sender, tokenIds, newTokenId, newLevel);
        } else {
            // Standard Fusion
            BaseElementNFT.Rarity newRarity = BaseElementNFT.Rarity(uint8(firstElement.rarity) + 1);
            newTokenId = nftContract.mint(msg.sender, firstElement.elementType, newRarity, firstElement.level);
            emit ElementFused(msg.sender, tokenIds, newTokenId);
        }
    }

    function handleGenesisFusion(uint256[] memory tokenIds) private {
        // Check for 5 unique element types, all must be EPIC
        bool[5] memory typesFound;
        for (uint i = 0; i < 5; i++) {
            require(nftContract.ownerOf(tokenIds[i]) == msg.sender, "Not the owner of an element");
            BaseElementNFT.Element memory currentElement = nftContract.getElement(tokenIds[i]);
            require(currentElement.rarity == BaseElementNFT.Rarity.EPIC, "All elements for Genesis Fusion must be Epic");
            
            uint typeIndex = uint(currentElement.elementType);
            require(!typesFound[typeIndex], "Duplicate element type in Genesis Fusion");
            typesFound[typeIndex] = true;
        }

        // Burn the old elements
        for (uint i = 0; i < 5; i++) {
            nftContract.burn(tokenIds[i]);
        }

        // Mint the Genesis element
        uint256 newTokenId = nftContract.mint(msg.sender, BaseElementNFT.ElementType.TECH_LAB, BaseElementNFT.Rarity.GENESIS, 1);
        emit GenesisElementFused(msg.sender, tokenIds, newTokenId);
    }
    
    function checkLevelUpEligibility(address player) public view returns (bool) {
        Player memory p = players[player];
        if (p.baseLevel >= 10) return false;
        
        LevelRequirement memory req = levelRequirements[p.baseLevel + 1];
        uint256[] memory tokenIds = nftContract.getPlayerElements(player);
        
        // Check element count
        if (tokenIds.length < req.elementCount) return false;
        
        // Check XP requirement
        if (p.xp < req.requiredXP) return false;
        
        // Check resource requirement
        if (p.resources < req.requiredResources) return false;
        
        // Check element levels
        uint256 validElements = 0;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            BaseElementNFT.Element memory element = nftContract.getElement(tokenIds[i]);
            if (element.level >= req.minElementLevel) {
                validElements++;
            }
        }
        
        return validElements >= req.elementCount;
    }
    
    function levelUp() external {
        require(checkLevelUpEligibility(msg.sender), "Level up requirements not met");
        
        players[msg.sender].baseLevel += 1;
        emit BaseLevelUp(msg.sender, players[msg.sender].baseLevel);
    }
    
    // Owner can withdraw accumulated funds
    function withdrawFunds() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        payable(owner()).transfer(balance);
        emit FundsWithdrawn(owner(), balance);
    }
    
    // Get current mint price
    function getMintPrice() external pure returns (uint256) {
        return MINT_PRICE;
    }
    
    // Get contract balance
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Trading System
    function createTrade(uint256 tokenId, uint256 price) external {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not the owner");
        require(price > 0, "Price must be greater than 0");
        
        totalTrades++;
        trades[totalTrades] = Trade({
            seller: msg.sender,
            tokenId: tokenId,
            price: price,
            resourcePrice: 0, // NEW: Initialize resource price
            isActive: true,
            acceptsResources: false // NEW: Default to false
        });
        
        nftContract.transferFrom(msg.sender, address(this), tokenId);
        emit TradeCreated(totalTrades, msg.sender, tokenId, price, 0);
    }
    
    function cancelTrade(uint256 tradeId) external {
        Trade storage trade = trades[tradeId];
        require(trade.seller == msg.sender, "Not the seller");
        require(trade.isActive, "Trade not active");
        
        trade.isActive = false;
        nftContract.transferFrom(address(this), msg.sender, trade.tokenId);
        emit TradeCancelled(tradeId);
    }
    
    function completeTrade(uint256 tradeId) external payable {
        Trade storage trade = trades[tradeId];
        require(trade.isActive, "Trade not active");
        require(msg.value == trade.price, "Incorrect payment");
        
        trade.isActive = false;
        nftContract.transferFrom(address(this), msg.sender, trade.tokenId);
        payable(trade.seller).transfer(msg.value);
        emit TradeCompleted(tradeId, msg.sender, false);
    }
    
    // Mission System
    function createMission(
        string memory name,
        uint256 duration,
        uint256 xpReward,
        uint256 resourceReward,
        uint256 resourceCost, // NEW: Add resource cost
        uint8 minBaseLevel,
        uint8 requiredElements,
        BaseElementNFT.ElementType requiredElementType
    ) external onlyOwner {
        totalMissions++;
        missions[totalMissions] = Mission({
            name: name,
            duration: duration,
            xpReward: xpReward,
            resourceReward: resourceReward,
            resourceCost: resourceCost, // NEW: Assign resource cost
            minBaseLevel: minBaseLevel,
            requiredElements: requiredElements,
            requiredElementType: requiredElementType
        });
    }
    
    function startMission(uint256 missionId, uint256[] calldata elementIds) external {
        Mission memory mission = missions[missionId];
        require(!playerMissions[msg.sender][missionId], "Mission already started");
        require(players[msg.sender].baseLevel >= mission.minBaseLevel, "Base level too low");
        require(elementIds.length >= mission.requiredElements, "Not enough elements");
        
        // Check element types
        for (uint256 i = 0; i < elementIds.length; i++) {
            BaseElementNFT.Element memory element = nftContract.getElement(elementIds[i]);
            require(element.elementType == mission.requiredElementType, "Wrong element type");
        }
        
        players[msg.sender].activeMissions.push(missionId);
        playerMissions[msg.sender][missionId] = true;
        emit MissionStarted(msg.sender, missionId);
    }
    
    function completeMission(uint256 missionId) external {
        require(playerMissions[msg.sender][missionId], "Mission not started");
        Mission memory mission = missions[missionId];
        
        // Apply event multipliers if active
        uint256 xpReward = mission.xpReward;
        uint256 resourceReward = mission.resourceReward;
        
        for (uint256 i = 1; i <= totalEvents; i++) {
            Event memory gameEvent = events[i];
            if (gameEvent.isActive && block.timestamp >= gameEvent.startTime && block.timestamp <= gameEvent.endTime) {
                xpReward = xpReward * gameEvent.xpMultiplier / 100;
                resourceReward = resourceReward * gameEvent.resourceMultiplier / 100;
            }
        }
        
        players[msg.sender].xp += xpReward;
        players[msg.sender].resources += resourceReward;
        players[msg.sender].totalResourcesSpent += mission.resourceCost; // NEW: Track resources spent
        
        // Remove from active missions
        uint256[] storage activeMissions = players[msg.sender].activeMissions;
        for (uint256 i = 0; i < activeMissions.length; i++) {
            if (activeMissions[i] == missionId) {
                activeMissions[i] = activeMissions[activeMissions.length - 1];
                activeMissions.pop();
                break;
            }
        }
        
        delete playerMissions[msg.sender][missionId];
        emit MissionCompleted(msg.sender, missionId, xpReward, resourceReward);
        
        // Check for achievements
        checkAchievements(msg.sender);
    }

    // Alliance System
    function createAlliance(string memory name) external {
        require(players[msg.sender].xp >= ALLIANCE_CREATE_COST, "Not enough XP");
        require(players[msg.sender].allianceId == 0, "Already in alliance");
        
        totalAlliances++;
        Alliance storage newAlliance = alliances[totalAlliances];
        newAlliance.name = name;
        newAlliance.leader = msg.sender;
        newAlliance.members.push(msg.sender);
        newAlliance.memberStatus[msg.sender] = true;
        newAlliance.level = 1;
        
        players[msg.sender].allianceId = totalAlliances;
        players[msg.sender].xp -= ALLIANCE_CREATE_COST;
        
        emit AllianceCreated(totalAlliances, name, msg.sender);
    }
    
    function joinAlliance(uint256 allianceId) external {
        Alliance storage alliance = alliances[allianceId];
        require(alliance.leader != address(0), "Alliance doesn't exist");
        require(!alliance.memberStatus[msg.sender], "Already a member");
        require(alliance.members.length < MAX_ALLIANCE_MEMBERS, "Alliance full");
        require(players[msg.sender].allianceId == 0, "Already in another alliance");
        
        alliance.members.push(msg.sender);
        alliance.memberStatus[msg.sender] = true;
        players[msg.sender].allianceId = allianceId;
        
        // Update alliance power
        uint256[] memory elements = nftContract.getPlayerElements(msg.sender);
        for (uint256 i = 0; i < elements.length; i++) {
            BaseElementNFT.Element memory element = nftContract.getElement(elements[i]);
            alliance.totalPower += element.power;
        }
        
        emit AllianceJoined(allianceId, msg.sender);
    }
    
    function leaveAlliance() external {
        uint256 allianceId = players[msg.sender].allianceId;
        require(allianceId != 0, "Not in alliance");
        Alliance storage alliance = alliances[allianceId];
        require(alliance.leader != msg.sender, "Leader cannot leave");
        
        // Remove from members array
        for (uint256 i = 0; i < alliance.members.length; i++) {
            if (alliance.members[i] == msg.sender) {
                alliance.members[i] = alliance.members[alliance.members.length - 1];
                alliance.members.pop();
                break;
            }
        }
        
        alliance.memberStatus[msg.sender] = false;
        players[msg.sender].allianceId = 0;
        
        // Update alliance power
        uint256[] memory elements = nftContract.getPlayerElements(msg.sender);
        for (uint256 i = 0; i < elements.length; i++) {
            BaseElementNFT.Element memory element = nftContract.getElement(elements[i]);
            alliance.totalPower -= element.power;
        }
        
        emit AllianceLeft(allianceId, msg.sender);
    }

    // NEW: Base Level Bonus Functions
    function getBaseLevelBonuses(address player) external view returns (
        uint256 powerBonus,
        uint256 xpMultiplier,
        uint256 resourceMultiplier,
        uint256 dailyCheckInBonus,
        uint256 fusionCostReduction
    ) {
        uint8 level = players[player].baseLevel;
        
        // Power bonus: 5 per level (already implemented in getPower function)
        powerBonus = level * PLAYER_LEVEL_POWER_BONUS;
        
        // XP multiplier: 5% per level above 1 (base 100% = 100)
        xpMultiplier = 100 + (level - 1) * 5;
        
        // Resource multiplier: 5% per level above 1
        resourceMultiplier = 100 + (level - 1) * 5;
        
        // Daily check-in bonus: progressive bonus
        if (level >= 10) dailyCheckInBonus = 500;
        else if (level >= 9) dailyCheckInBonus = 300;
        else if (level >= 8) dailyCheckInBonus = 250;
        else if (level >= 7) dailyCheckInBonus = 200;
        else if (level >= 6) dailyCheckInBonus = 150;
        else if (level >= 5) dailyCheckInBonus = 100;
        else if (level >= 4) dailyCheckInBonus = 75;
        else if (level >= 3) dailyCheckInBonus = 50;
        else if (level >= 2) dailyCheckInBonus = 25;
        else dailyCheckInBonus = 0;
        
        // Fusion cost reduction: 2% per level above 1
        fusionCostReduction = (level - 1) * 2;
        if (fusionCostReduction > 25) fusionCostReduction = 25; // Cap at 25%
    }
    
    function getUnlockedFeatures(address player) external view returns (string[] memory) {
        uint8 level = players[player].baseLevel;
        string[] memory features = new string[](15);
        uint256 count = 0;
        
        // Always unlocked
        features[count++] = "Basic Gameplay";
        features[count++] = "Daily Check-in";
        features[count++] = "Element Collection";
        
        if (level >= 2) features[count++] = "Element Fusion";
        if (level >= 3) features[count++] = "Advanced Fusion";
        if (level >= 4) features[count++] = "Batch Minting";
        if (level >= 5) {
            features[count++] = "PvP Arena";
            features[count++] = "Player Battles";
        }
        if (level >= 6) features[count++] = "Advanced Missions";
        if (level >= 7) features[count++] = "Epic Fusion";
        if (level >= 8) features[count++] = "Marketplace Trading";
        if (level >= 9) features[count++] = "Advanced Trading";
        if (level >= 10) {
            features[count++] = "Alliance System";
            features[count++] = "Genesis Fusion";
            features[count++] = "Endgame Content";
        }
        
        // Resize array to actual size
        string[] memory result = new string[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = features[i];
        }
        
        return result;
    }
    
    function getNextLevelRequirements(address player) external view returns (
        uint8 nextLevel,
        uint8 requiredElements,
        uint8 minElementLevel,
        uint256 requiredXP,
        bool canLevelUp
    ) {
        uint8 currentLevel = players[player].baseLevel;
        
        if (currentLevel >= 10) {
            return (11, 0, 0, 0, false); // Max level reached
        }
        
        nextLevel = currentLevel + 1;
        LevelRequirement memory req = levelRequirements[nextLevel];
        
        requiredElements = req.elementCount;
        minElementLevel = req.minElementLevel;
        requiredXP = req.requiredXP;
        canLevelUp = checkLevelUpEligibility(player);
    }
    
    // Enhanced check-in with level bonuses
    function checkInWithBonuses() external {
        require(players[msg.sender].isActive, "Player not registered");
        require(
            block.timestamp >= players[msg.sender].lastCheckIn + CHECK_IN_COOLDOWN,
            "Too early for check-in"
        );
        
        Player storage player = players[msg.sender];
        
        // Calculate streak
        if (block.timestamp > player.lastCheckIn + STREAK_RESET_TIME) {
            player.streak = 1;
        } else {
            player.streak += 1;
        }
        
        // Calculate base XP reward
        uint256 baseXpReward = calculateXPReward(player.streak);
        
        // Apply level bonuses
        (, uint256 xpMultiplier, , uint256 dailyBonus,) = this.getBaseLevelBonuses(msg.sender);
        
        // Apply multiplier (convert from percentage)
        uint256 totalXpReward = (baseXpReward * xpMultiplier) / 100 + dailyBonus;
        
        player.xp += totalXpReward;
        player.lastCheckIn = block.timestamp;
        
        emit CheckInCompleted(msg.sender, player.streak, totalXpReward, 0); // NEW: No resource reward in this function
    }

    // Enhanced mission completion with bonuses
    function completeMissionWithBonuses(uint256 missionId) external {
        require(playerMissions[msg.sender][missionId], "Mission not started");
        Mission memory mission = missions[missionId];
        
        // Get base rewards
        uint256 baseXpReward = mission.xpReward;
        uint256 baseResourceReward = mission.resourceReward;
        
        // Apply level bonuses
        (, uint256 xpMultiplier, uint256 resourceMultiplier,,) = this.getBaseLevelBonuses(msg.sender);
        
        // Apply multipliers
        uint256 finalXpReward = (baseXpReward * xpMultiplier) / 100;
        uint256 finalResourceReward = (baseResourceReward * resourceMultiplier) / 100;
        
        // Apply event multipliers if active
        for (uint256 i = 1; i <= totalEvents; i++) {
            Event memory gameEvent = events[i];
            if (gameEvent.isActive && block.timestamp >= gameEvent.startTime && block.timestamp <= gameEvent.endTime) {
                finalXpReward = finalXpReward * gameEvent.xpMultiplier / 100;
                finalResourceReward = finalResourceReward * gameEvent.resourceMultiplier / 100;
            }
        }
        
        players[msg.sender].xp += finalXpReward;
        players[msg.sender].resources += finalResourceReward;
        players[msg.sender].totalResourcesSpent += mission.resourceCost; // NEW: Track resources spent
        
        // Remove from active missions
        uint256[] storage activeMissions = players[msg.sender].activeMissions;
        for (uint256 i = 0; i < activeMissions.length; i++) {
            if (activeMissions[i] == missionId) {
                activeMissions[i] = activeMissions[activeMissions.length - 1];
                activeMissions.pop();
                break;
            }
        }
        
        delete playerMissions[msg.sender][missionId];
        emit MissionCompleted(msg.sender, missionId, finalXpReward, finalResourceReward);
        
        // Check for achievements
        checkAchievements(msg.sender);
    }

    // Enhanced fusion with cost reduction
    function fuseElementsWithDiscount(uint256[] calldata tokenIds) external payable {
        require(tokenIds.length == 3, "Must fuse exactly 3 elements");
        
        // Verify ownership and get elements
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(nftContract.ownerOf(tokenIds[i]) == msg.sender, "Not owner of element");
        }
        
        // Calculate fusion cost with level discount
        uint256 baseCost = getFusionCost(msg.sender);
        (,,, uint256 discountPercent) = this.getBaseLevelBonuses(msg.sender);
        uint256 discountedCost = baseCost - (baseCost * discountPercent / 100);
        
        require(msg.value >= discountedCost, "Insufficient payment for fusion");
        
        // Burn the tokens
        for (uint256 i = 0; i < tokenIds.length; i++) {
            nftContract.burn(tokenIds[i]);
        }
        
        // Request randomness for new element
        uint256 requestId = requestRandomness();
        pendingFusions[requestId] = FusionRequest({
            player: msg.sender,
            tokenIds: tokenIds,
            fusionType: FusionType.STANDARD,
            cost: discountedCost
        });
        
        emit ElementFused(msg.sender, tokenIds, 0); // tokenId will be set in callback
    }
    
    // Event System
    function createEvent(
        string memory name,
        uint256 duration,
        uint256 xpMultiplier,
        uint256 resourceMultiplier
    ) external onlyOwner {
        totalEvents++;
        events[totalEvents] = Event({
            name: name,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            xpMultiplier: xpMultiplier,
            resourceMultiplier: resourceMultiplier,
            isActive: true
        });
        
        emit EventStarted(totalEvents, name);
    }
    
    function endEvent(uint256 eventId) external onlyOwner {
        Event storage gameEvent = events[eventId];
        require(gameEvent.isActive, "Event not active");
        
        gameEvent.isActive = false;
        gameEvent.endTime = block.timestamp;
        
        emit EventEnded(eventId);
    }
    
    function getActiveEvents() external view returns (uint256[] memory) {
        uint256[] memory activeEvents = new uint256[](totalEvents);
        uint256 count = 0;
        
        for (uint256 i = 1; i <= totalEvents; i++) {
            Event memory gameEvent = events[i];
            if (gameEvent.isActive && block.timestamp <= gameEvent.endTime) {
                activeEvents[count] = i;
                count++;
            }
        }
        
        // Trim array to actual size
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = activeEvents[i];
        }
        
        return result;
    }

    // ========== PvP ARENA SYSTEM ==========
    
    // PvP Arena Constants
    uint256 public constant ARENA_ENTRY_FEE = 100; // Resources
    uint256 public constant TOURNAMENT_ENTRY_FEE = 500; // Resources
    uint256 public constant RANKING_DECAY_TIME = 7 days; // Rating decay period
    uint256 public constant BATTLE_PHASES = 3; // Number of battle phases
    uint256 public constant CRITICAL_HIT_CHANCE = 15; // 15% chance
    uint256 public constant DODGE_CHANCE = 10; // 10% chance
    
    // PvP Arena Structures
    struct ArenaPlayer {
        uint256 rating; // ELO-style rating
        uint256 wins;
        uint256 losses;
        uint256 winStreak;
        uint256 maxWinStreak;
        uint256 lastBattleTime;
        uint256 seasonWins;
        uint256 seasonLosses;
        ArenaRank rank;
        uint256 tournamentWins;
        bool isInTournament;
    }
    
    struct BattleResult {
        address winner;
        address loser;
        uint256 winnerRatingChange;
        uint256 loserRatingChange;
        BattleMode mode;
        uint256 timestamp;
        uint256 duration; // Battle duration in seconds
        BattlePhase[] phases;
    }
    
    struct BattlePhase {
        uint256 attackerDamage;
        uint256 defenderDamage;
        bool criticalHit;
        bool dodged;
        BaseElementNFT.ElementType elementUsed;
        string action; // "attack", "defend", "special"
    }
    
    struct Tournament {
        uint256 id;
        string name;
        uint256 entryFee;
        uint256 prizePool;
        uint256 startTime;
        uint256 endTime;
        uint256 maxParticipants;
        address[] participants;
        address winner;
        TournamentStatus status;
        mapping(address => bool) isParticipant;
        mapping(address => uint256) playerScores;
    }
    
    struct ArenaReward {
        uint256 xp;
        uint256 resources;
        uint256 ratingGain;
        bool rankUp;
        ArenaRank newRank;
    }
    
    enum ArenaRank {
        BRONZE,
        SILVER,
        GOLD,
        PLATINUM,
        DIAMOND,
        MASTER,
        GRANDMASTER
    }
    
    enum BattleMode {
        CASUAL,
        RANKED,
        TOURNAMENT,
        PRACTICE
    }
    
    enum TournamentStatus {
        UPCOMING,
        ACTIVE,
        COMPLETED,
        CANCELLED
    }
    
    // PvP Arena Mappings
    mapping(address => ArenaPlayer) public arenaPlayers;
    mapping(uint256 => BattleResult) public battleHistory;
    mapping(uint256 => Tournament) public tournaments;
    mapping(address => uint256[]) public playerBattleHistory;
    mapping(ArenaRank => uint256) public rankThresholds;
    mapping(ArenaRank => ArenaReward) public rankRewards;
    
    // PvP Arena Counters
    uint256 public totalBattles;
    uint256 public totalTournaments;
    uint256 public currentSeason;
    uint256 public seasonEndTime;
    
    // PvP Arena Events
    event ArenaPlayerRegistered(address player, uint256 initialRating);
    event BattleInitiated(address attacker, address defender, BattleMode mode, uint256 battleId);
    event BattleCompleted(address winner, address loser, uint256 battleId, ArenaReward winnerReward);
    event RankChanged(address player, ArenaRank oldRank, ArenaRank newRank);
    event TournamentCreated(uint256 tournamentId, string name, uint256 prizePool);
    event TournamentJoined(uint256 tournamentId, address player);
    event TournamentCompleted(uint256 tournamentId, address winner, uint256 prize);
    event SeasonEnded(uint256 season, address topPlayer);
    
    // Initialize PvP Arena System
    function initializePvPArena() external onlyOwner {
        // Set rank thresholds
        rankThresholds[ArenaRank.BRONZE] = 0;
        rankThresholds[ArenaRank.SILVER] = 1200;
        rankThresholds[ArenaRank.GOLD] = 1500;
        rankThresholds[ArenaRank.PLATINUM] = 1800;
        rankThresholds[ArenaRank.DIAMOND] = 2200;
        rankThresholds[ArenaRank.MASTER] = 2600;
        rankThresholds[ArenaRank.GRANDMASTER] = 3000;
        
        // Set rank rewards
        rankRewards[ArenaRank.BRONZE] = ArenaReward(50, 25, 10, false, ArenaRank.BRONZE);
        rankRewards[ArenaRank.SILVER] = ArenaReward(75, 50, 15, false, ArenaRank.SILVER);
        rankRewards[ArenaRank.GOLD] = ArenaReward(100, 75, 20, false, ArenaRank.GOLD);
        rankRewards[ArenaRank.PLATINUM] = ArenaReward(150, 100, 25, false, ArenaRank.PLATINUM);
        rankRewards[ArenaRank.DIAMOND] = ArenaReward(200, 150, 30, false, ArenaRank.DIAMOND);
        rankRewards[ArenaRank.MASTER] = ArenaReward(300, 200, 35, false, ArenaRank.MASTER);
        rankRewards[ArenaRank.GRANDMASTER] = ArenaReward(500, 300, 40, false, ArenaRank.GRANDMASTER);
        
        currentSeason = 1;
        seasonEndTime = block.timestamp + 30 days; // 30-day seasons
    }
    
    // Register player for PvP Arena
    function registerForArena() external {
        require(players[msg.sender].isActive, "Player not registered");
        require(players[msg.sender].baseLevel >= 5, "Minimum level 5 required for PvP Arena");
        require(arenaPlayers[msg.sender].rating == 0, "Already registered for arena");
        
        arenaPlayers[msg.sender] = ArenaPlayer({
            rating: 1000, // Starting rating
            wins: 0,
            losses: 0,
            winStreak: 0,
            maxWinStreak: 0,
            lastBattleTime: block.timestamp,
            seasonWins: 0,
            seasonLosses: 0,
            rank: ArenaRank.BRONZE,
            tournamentWins: 0,
            isInTournament: false
        });
        
        emit ArenaPlayerRegistered(msg.sender, 1000);
    }
    
    // Enhanced PvP Battle System with detailed combat simulation
    function initiatePvpBattle(address opponent, uint256[] calldata elementIds, BattleMode mode) external {
        require(block.timestamp >= players[msg.sender].lastPvpBattle + PVP_COOLDOWN, "PvP cooldown");
        require(elementIds.length > 0 && elementIds.length <= 3, "1-3 elements required");
        require(opponent != msg.sender, "Cannot battle yourself");
        require(players[opponent].isActive, "Opponent not registered");
        
        if (mode == BattleMode.RANKED) {
            require(arenaPlayers[msg.sender].rating > 0, "Not registered for arena");
            require(arenaPlayers[opponent].rating > 0, "Opponent not registered for arena");
            require(players[msg.sender].resources >= ARENA_ENTRY_FEE, "Insufficient resources for entry fee");
            players[msg.sender].resources -= ARENA_ENTRY_FEE;
            players[msg.sender].totalResourcesSpent += ARENA_ENTRY_FEE;
        }
        
        // Validate attacker elements
        uint256 attackerPower = 0;
        BaseElementNFT.ElementType[] memory attackerElements = new BaseElementNFT.ElementType[](elementIds.length);
        
        for (uint256 i = 0; i < elementIds.length; i++) {
            BaseElementNFT.Element memory element = nftContract.getElement(elementIds[i]);
            require(nftContract.ownerOf(elementIds[i]) == msg.sender, "Not your element");
            attackerPower += calculateElementPower(element, msg.sender);
            attackerElements[i] = element.elementType;
        }
        
        // Get defender elements (auto-select best elements)
        uint256[] memory opponentElementIds = nftContract.getPlayerElements(opponent);
        uint256 defenderPower = 0;
        BaseElementNFT.ElementType[] memory defenderElements = new BaseElementNFT.ElementType[](
            opponentElementIds.length > 3 ? 3 : opponentElementIds.length
        );
        
        // Select best 3 elements for defender
        for (uint256 i = 0; i < defenderElements.length; i++) {
            BaseElementNFT.Element memory element = nftContract.getElement(opponentElementIds[i]);
            defenderPower += calculateElementPower(element, opponent);
            defenderElements[i] = element.elementType;
        }
        
        players[msg.sender].lastPvpBattle = block.timestamp;
        
        // Simulate detailed battle
        BattleResult memory result = simulateBattle(
            msg.sender, opponent, 
            attackerPower, defenderPower,
            attackerElements, defenderElements,
            mode
        );
        
        // Store battle result
        totalBattles++;
        battleHistory[totalBattles] = result;
        playerBattleHistory[msg.sender].push(totalBattles);
        playerBattleHistory[opponent].push(totalBattles);
        
        // Apply battle results
        applyBattleResults(result);
        
        emit BattleInitiated(msg.sender, opponent, mode, totalBattles);
    }
    
    // Calculate element power with buffs and bonuses
    function calculateElementPower(BaseElementNFT.Element memory element, address player) internal view returns (uint256) {
        uint256 basePower = element.power;
        
        // Apply player level bonus
        basePower += players[player].baseLevel * PLAYER_LEVEL_POWER_BONUS;
        
        // Apply active buffs
        PlayerBuff memory buff = playerBuffs[player];
        if (buff.expiresAt > block.timestamp) {
            basePower += buff.powerBonus;
        }
        
        // Apply element type advantages (rock-paper-scissors style)
        // This would be expanded based on your element types
        
        return basePower;
    }
    
    // Simulate detailed battle with phases
    function simulateBattle(
        address attacker, address defender,
        uint256 attackerPower, uint256 defenderPower,
        BaseElementNFT.ElementType[] memory attackerElements,
        BaseElementNFT.ElementType[] memory defenderElements,
        BattleMode mode
    ) internal view returns (BattleResult memory) {
        
        BattlePhase[] memory phases = new BattlePhase[](BATTLE_PHASES);
        uint256 attackerHP = attackerPower;
        uint256 defenderHP = defenderPower;
        
        // Simulate each battle phase
        for (uint256 i = 0; i < BATTLE_PHASES && attackerHP > 0 && defenderHP > 0; i++) {
            phases[i] = simulateBattlePhase(
                attacker, defender,
                attackerElements[i % attackerElements.length],
                defenderElements[i % defenderElements.length],
                i
            );
            
            // Apply damage
            if (!phases[i].dodged) {
                if (phases[i].criticalHit) {
                    phases[i].attackerDamage = phases[i].attackerDamage * 150 / 100; // 50% more damage
                }
                defenderHP = defenderHP > phases[i].attackerDamage ? 
                    defenderHP - phases[i].attackerDamage : 0;
            }
            
            // Defender counter-attack
            if (defenderHP > 0) {
                uint256 counterDamage = (defenderPower * (50 + (i * 10))) / 100;
                attackerHP = attackerHP > counterDamage ? attackerHP - counterDamage : 0;
                phases[i].defenderDamage = counterDamage;
            }
        }
        
        // Determine winner
        address winner = attackerHP > defenderHP ? attacker : defender;
        address loser = winner == attacker ? defender : attacker;
        
        // Calculate rating changes for ranked battles
        uint256 winnerRatingChange = 0;
        uint256 loserRatingChange = 0;
        
        if (mode == BattleMode.RANKED) {
            (winnerRatingChange, loserRatingChange) = calculateRatingChanges(winner, loser);
        }
        
        return BattleResult({
            winner: winner,
            loser: loser,
            winnerRatingChange: winnerRatingChange,
            loserRatingChange: loserRatingChange,
            mode: mode,
            timestamp: block.timestamp,
            duration: BATTLE_PHASES * 10, // 10 seconds per phase
            phases: phases
        });
    }
    
    // Simulate individual battle phase
    function simulateBattlePhase(
        address attacker, address defender,
        BaseElementNFT.ElementType attackerElement,
        BaseElementNFT.ElementType defenderElement,
        uint256 phaseIndex
    ) internal view returns (BattlePhase memory) {
        
        uint256 randomSeed = uint256(keccak256(abi.encodePacked(
            block.timestamp, attacker, defender, phaseIndex
        )));
        
        // Calculate base damage
        uint256 baseDamage = 100 + (phaseIndex * 25); // Damage increases each phase
        
        // Check for critical hit
        bool criticalHit = (randomSeed % 100) < CRITICAL_HIT_CHANCE;
        
        // Check for dodge
        bool dodged = ((randomSeed >> 8) % 100) < DODGE_CHANCE;
        
        // Apply element type advantages
        uint256 elementMultiplier = getElementAdvantage(attackerElement, defenderElement);
        uint256 finalDamage = (baseDamage * elementMultiplier) / 100;
        
        return BattlePhase({
            attackerDamage: finalDamage,
            defenderDamage: 0, // Will be calculated in main battle simulation
            criticalHit: criticalHit,
            dodged: dodged,
            elementUsed: attackerElement,
            action: criticalHit ? "critical_attack" : "attack"
        });
    }
    
    // Get element type advantage multiplier
    function getElementAdvantage(
        BaseElementNFT.ElementType attacker, 
        BaseElementNFT.ElementType defender
    ) internal pure returns (uint256) {
        // Implement rock-paper-scissors style advantages
        // This is a simplified version - expand based on your element types
        if (attacker == BaseElementNFT.ElementType.FIRE && defender == BaseElementNFT.ElementType.ICE) {
            return 125; // 25% advantage
        } else if (attacker == BaseElementNFT.ElementType.ICE && defender == BaseElementNFT.ElementType.FIRE) {
            return 75; // 25% disadvantage
        }
        // Add more element interactions here
        return 100; // Neutral
    }
    
    // Calculate ELO-style rating changes
    function calculateRatingChanges(address winner, address loser) internal view returns (uint256, uint256) {
        uint256 winnerRating = arenaPlayers[winner].rating;
        uint256 loserRating = arenaPlayers[loser].rating;
        
        // K-factor (rating change sensitivity)
        uint256 kFactor = 32;
        
        // Expected score calculation
        uint256 expectedWinner = 100 * winnerRating / (winnerRating + loserRating);
        uint256 expectedLoser = 100 - expectedWinner;
        
        // Actual score (winner gets 100, loser gets 0)
        uint256 actualWinner = 100;
        uint256 actualLoser = 0;
        
        // Rating change calculation
        uint256 winnerChange = (kFactor * (actualWinner - expectedWinner)) / 100;
        uint256 loserChange = (kFactor * (actualLoser - expectedLoser)) / 100;
        
        return (winnerChange, loserChange);
    }
    
    // Apply battle results to players
    function applyBattleResults(BattleResult memory result) internal {
        address winner = result.winner;
        address loser = result.loser;
        
        // Update basic PvP stats
        players[winner].pvpWins++;
        players[loser].lastPvpBattle = block.timestamp;
        
        // Calculate rewards based on battle mode
        ArenaReward memory reward = calculateBattleReward(result);
        
        // Apply rewards to winner
        players[winner].xp += reward.xp;
        players[winner].resources += reward.resources;
        players[winner].totalResourcesEarned += reward.resources;
        
        // Update arena stats if ranked battle
        if (result.mode == BattleMode.RANKED) {
            ArenaPlayer storage winnerArena = arenaPlayers[winner];
            ArenaPlayer storage loserArena = arenaPlayers[loser];
            
            // Update ratings
            winnerArena.rating += result.winnerRatingChange;
            loserArena.rating = loserArena.rating > result.loserRatingChange ? 
                loserArena.rating - result.loserRatingChange : 0;
            
            // Update win/loss records
            winnerArena.wins++;
            winnerArena.seasonWins++;
            winnerArena.winStreak++;
            if (winnerArena.winStreak > winnerArena.maxWinStreak) {
                winnerArena.maxWinStreak = winnerArena.winStreak;
            }
            
            loserArena.losses++;
            loserArena.seasonLosses++;
            loserArena.winStreak = 0;
            
            // Check for rank changes
            checkRankChanges(winner);
            checkRankChanges(loser);
        }
        
        // Update tournament scores if tournament battle
        if (result.mode == BattleMode.TOURNAMENT) {
            // Find active tournament for these players
            for (uint256 i = 1; i <= totalTournaments; i++) {
                Tournament storage tournament = tournaments[i];
                if (tournament.status == TournamentStatus.ACTIVE && 
                    tournament.isParticipant[winner] && 
                    tournament.isParticipant[loser]) {
                    
                    // Award points based on battle outcome
                    uint256 winnerPoints = 100; // Base points for win
                    uint256 loserPoints = 25;   // Consolation points for participation
                    
                    // Bonus points for win streak in tournament
                    if (tournament.playerScores[winner] > 0) {
                        winnerPoints += 25; // Streak bonus
                    }
                    
                    tournament.playerScores[winner] += winnerPoints;
                    tournament.playerScores[loser] += loserPoints;
                    
                    break; // Only one active tournament per player
                }
            }
        }
        
        // Emit events
        emit BattleCompleted(winner, loser, totalBattles, reward);
        emit PvpBattleCompleted(winner, loser, reward.xp, reward.resources);
        
        // Check achievements
        checkAchievements(winner);
        checkAchievements(loser);
    }
    
    // Calculate battle rewards
    function calculateBattleReward(BattleResult memory result) internal view returns (ArenaReward memory) {
        ArenaRank winnerRank = result.mode == BattleMode.RANKED ? 
            arenaPlayers[result.winner].rank : ArenaRank.BRONZE;
        
        ArenaReward memory baseReward = rankRewards[winnerRank];
        
        // Bonus for win streak
        if (result.mode == BattleMode.RANKED) {
            uint256 winStreak = arenaPlayers[result.winner].winStreak;
            if (winStreak >= 3) {
                baseReward.xp += baseReward.xp * (winStreak - 2) * 10 / 100; // 10% bonus per streak above 2
                baseReward.resources += baseReward.resources * (winStreak - 2) * 10 / 100;
            }
        }
        
        return baseReward;
    }
    
    // Check and update player ranks
    function checkRankChanges(address player) internal {
        ArenaPlayer storage arenaPlayer = arenaPlayers[player];
        ArenaRank currentRank = arenaPlayer.rank;
        ArenaRank newRank = currentRank;
        
        // Check for rank up
        if (currentRank != ArenaRank.GRANDMASTER) {
            ArenaRank nextRank = ArenaRank(uint256(currentRank) + 1);
            if (arenaPlayer.rating >= rankThresholds[nextRank]) {
                newRank = nextRank;
            }
        }
        
        // Check for rank down
        if (currentRank != ArenaRank.BRONZE) {
            if (arenaPlayer.rating < rankThresholds[currentRank]) {
                newRank = ArenaRank(uint256(currentRank) - 1);
            }
        }
        
        // Apply rank change
        if (newRank != currentRank) {
            arenaPlayer.rank = newRank;
            emit RankChanged(player, currentRank, newRank);
        }
    }
    
    // Get player's arena stats
    function getArenaStats(address player) external view returns (
        uint256 rating, uint256 wins, uint256 losses, 
        uint256 winStreak, ArenaRank rank, uint256 seasonWins
    ) {
        ArenaPlayer memory arenaPlayer = arenaPlayers[player];
        return (
            arenaPlayer.rating,
            arenaPlayer.wins,
            arenaPlayer.losses,
            arenaPlayer.winStreak,
            arenaPlayer.rank,
            arenaPlayer.seasonWins
        );
    }
    
    // Get battle details
    function getBattleDetails(uint256 battleId) external view returns (
        address winner, address loser, BattleMode mode, 
        uint256 timestamp, uint256 duration
    ) {
        BattleResult memory battle = battleHistory[battleId];
        return (
            battle.winner,
            battle.loser,
            battle.mode,
            battle.timestamp,
            battle.duration
        );
    }
    
    // Get player's recent battles
    function getPlayerBattles(address player, uint256 limit) external view returns (uint256[] memory) {
        uint256[] memory battles = playerBattleHistory[player];
        uint256 length = battles.length > limit ? limit : battles.length;
        uint256[] memory recentBattles = new uint256[](length);
        
        for (uint256 i = 0; i < length; i++) {
            recentBattles[i] = battles[battles.length - 1 - i];
        }
        
        return recentBattles;
    }
    
    // Legacy function for backward compatibility
    function initiatePvpBattle(address opponent, uint256[] calldata elementIds) external {
        initiatePvpBattle(opponent, elementIds, BattleMode.CASUAL);
    }
    
    // ========== TOURNAMENT SYSTEM ==========
    
    // Create a new tournament
    function createTournament(
        string memory name,
        uint256 entryFee,
        uint256 maxParticipants,
        uint256 duration
    ) external onlyOwner {
        require(maxParticipants >= 4 && maxParticipants <= 64, "Invalid participant count");
        require(duration >= 1 hours && duration <= 7 days, "Invalid duration");
        
        totalTournaments++;
        
        Tournament storage tournament = tournaments[totalTournaments];
        tournament.id = totalTournaments;
        tournament.name = name;
        tournament.entryFee = entryFee;
        tournament.prizePool = 0;
        tournament.startTime = block.timestamp + 1 hours; // 1 hour registration period
        tournament.endTime = block.timestamp + 1 hours + duration;
        tournament.maxParticipants = maxParticipants;
        tournament.status = TournamentStatus.UPCOMING;
        
        emit TournamentCreated(totalTournaments, name, 0);
    }
    
    // Join a tournament
    function joinTournament(uint256 tournamentId) external {
        require(tournamentId > 0 && tournamentId <= totalTournaments, "Invalid tournament ID");
        require(players[msg.sender].isActive, "Player not registered");
        require(arenaPlayers[msg.sender].rating > 0, "Not registered for arena");
        
        Tournament storage tournament = tournaments[tournamentId];
        require(tournament.status == TournamentStatus.UPCOMING, "Tournament not accepting participants");
        require(block.timestamp < tournament.startTime, "Registration period ended");
        require(tournament.participants.length < tournament.maxParticipants, "Tournament full");
        require(!tournament.isParticipant[msg.sender], "Already joined");
        require(players[msg.sender].resources >= tournament.entryFee, "Insufficient resources");
        
        // Charge entry fee
        players[msg.sender].resources -= tournament.entryFee;
        players[msg.sender].totalResourcesSpent += tournament.entryFee;
        
        // Add to tournament
        tournament.participants.push(msg.sender);
        tournament.isParticipant[msg.sender] = true;
        tournament.prizePool += tournament.entryFee;
        arenaPlayers[msg.sender].isInTournament = true;
        
        emit TournamentJoined(tournamentId, msg.sender);
    }
    
    // Start a tournament (can be called by anyone once conditions are met)
    function startTournament(uint256 tournamentId) external {
        require(tournamentId > 0 && tournamentId <= totalTournaments, "Invalid tournament ID");
        
        Tournament storage tournament = tournaments[tournamentId];
        require(tournament.status == TournamentStatus.UPCOMING, "Tournament already started");
        require(block.timestamp >= tournament.startTime, "Tournament not ready to start");
        require(tournament.participants.length >= 4, "Not enough participants");
        
        tournament.status = TournamentStatus.ACTIVE;
        
        // Initialize all participant scores to 0
        for (uint256 i = 0; i < tournament.participants.length; i++) {
            tournament.playerScores[tournament.participants[i]] = 0;
        }
    }
    
    // Complete a tournament and distribute prizes
    function completeTournament(uint256 tournamentId) external {
        require(tournamentId > 0 && tournamentId <= totalTournaments, "Invalid tournament ID");
        
        Tournament storage tournament = tournaments[tournamentId];
        require(tournament.status == TournamentStatus.ACTIVE, "Tournament not active");
        require(block.timestamp >= tournament.endTime, "Tournament not finished");
        
        // Find winner (player with highest score)
        address winner = tournament.participants[0];
        uint256 highestScore = tournament.playerScores[winner];
        
        for (uint256 i = 1; i < tournament.participants.length; i++) {
            address participant = tournament.participants[i];
            if (tournament.playerScores[participant] > highestScore) {
                highestScore = tournament.playerScores[participant];
                winner = participant;
            }
        }
        
        // Distribute prizes
        uint256 winnerPrize = tournament.prizePool * 60 / 100; // 60% to winner
        uint256 runnerUpPrize = tournament.prizePool * 30 / 100; // 30% to runner-up
        uint256 thirdPlacePrize = tournament.prizePool * 10 / 100; // 10% to third place
        
        players[winner].resources += winnerPrize;
        players[winner].totalResourcesEarned += winnerPrize;
        arenaPlayers[winner].tournamentWins++;
        
        // Find runner-up and third place
        address runnerUp = findNthPlace(tournamentId, 2);
        address thirdPlace = findNthPlace(tournamentId, 3);
        
        if (runnerUp != address(0)) {
            players[runnerUp].resources += runnerUpPrize;
            players[runnerUp].totalResourcesEarned += runnerUpPrize;
        }
        
        if (thirdPlace != address(0)) {
            players[thirdPlace].resources += thirdPlacePrize;
            players[thirdPlace].totalResourcesEarned += thirdPlacePrize;
        }
        
        // Update tournament status
        tournament.status = TournamentStatus.COMPLETED;
        tournament.winner = winner;
        
        // Reset participant tournament status
        for (uint256 i = 0; i < tournament.participants.length; i++) {
            arenaPlayers[tournament.participants[i]].isInTournament = false;
        }
        
        emit TournamentCompleted(tournamentId, winner, winnerPrize);
    }
    
    // Find nth place in tournament
    function findNthPlace(uint256 tournamentId, uint256 place) internal view returns (address) {
        Tournament storage tournament = tournaments[tournamentId];
        
        if (tournament.participants.length < place) {
            return address(0);
        }
        
        // Simple sorting to find nth place
        address[] memory sortedParticipants = new address[](tournament.participants.length);
        uint256[] memory sortedScores = new uint256[](tournament.participants.length);
        
        // Copy participants and scores
        for (uint256 i = 0; i < tournament.participants.length; i++) {
            sortedParticipants[i] = tournament.participants[i];
            sortedScores[i] = tournament.playerScores[tournament.participants[i]];
        }
        
        // Simple bubble sort (good enough for tournament sizes)
        for (uint256 i = 0; i < sortedScores.length - 1; i++) {
            for (uint256 j = 0; j < sortedScores.length - i - 1; j++) {
                if (sortedScores[j] < sortedScores[j + 1]) {
                    // Swap scores
                    uint256 tempScore = sortedScores[j];
                    sortedScores[j] = sortedScores[j + 1];
                    sortedScores[j + 1] = tempScore;
                    
                    // Swap participants
                    address tempParticipant = sortedParticipants[j];
                    sortedParticipants[j] = sortedParticipants[j + 1];
                    sortedParticipants[j + 1] = tempParticipant;
                }
            }
        }
        
        return sortedParticipants[place - 1];
    }
    
    // Tournament battle (special battle mode for tournaments)
    function tournamentBattle(uint256 tournamentId, address opponent, uint256[] calldata elementIds) external {
        require(tournamentId > 0 && tournamentId <= totalTournaments, "Invalid tournament ID");
        
        Tournament storage tournament = tournaments[tournamentId];
        require(tournament.status == TournamentStatus.ACTIVE, "Tournament not active");
        require(block.timestamp < tournament.endTime, "Tournament ended");
        require(tournament.isParticipant[msg.sender], "Not a participant");
        require(tournament.isParticipant[opponent], "Opponent not a participant");
        require(opponent != msg.sender, "Cannot battle yourself");
        
        // Use existing battle system but with tournament mode
        initiatePvpBattle(opponent, elementIds, BattleMode.TOURNAMENT);
        
        // Award tournament points to winner
        // This would be integrated with the battle result system
        // For now, we'll award points based on battle outcome
        // Points are awarded in the applyBattleResults function
    }
    
    // Get tournament details
    function getTournamentDetails(uint256 tournamentId) external view returns (
        string memory name,
        uint256 entryFee,
        uint256 prizePool,
        uint256 startTime,
        uint256 endTime,
        uint256 participantCount,
        TournamentStatus status,
        address winner
    ) {
        require(tournamentId > 0 && tournamentId <= totalTournaments, "Invalid tournament ID");
        
        Tournament storage tournament = tournaments[tournamentId];
        return (
            tournament.name,
            tournament.entryFee,
            tournament.prizePool,
            tournament.startTime,
            tournament.endTime,
            tournament.participants.length,
            tournament.status,
            tournament.winner
        );
    }
    
    // Get tournament participants
    function getTournamentParticipants(uint256 tournamentId) external view returns (address[] memory) {
        require(tournamentId > 0 && tournamentId <= totalTournaments, "Invalid tournament ID");
        return tournaments[tournamentId].participants;
    }
    
    // Get tournament leaderboard
    function getTournamentLeaderboard(uint256 tournamentId, uint256 limit) external view returns (
        address[] memory players,
        uint256[] memory scores
    ) {
        require(tournamentId > 0 && tournamentId <= totalTournaments, "Invalid tournament ID");
        
        Tournament storage tournament = tournaments[tournamentId];
        uint256 length = tournament.participants.length > limit ? limit : tournament.participants.length;
        
        address[] memory topPlayers = new address[](length);
        uint256[] memory topScores = new uint256[](length);
        
        // Create arrays for sorting
        address[] memory allPlayers = new address[](tournament.participants.length);
        uint256[] memory allScores = new uint256[](tournament.participants.length);
        
        for (uint256 i = 0; i < tournament.participants.length; i++) {
            allPlayers[i] = tournament.participants[i];
            allScores[i] = tournament.playerScores[tournament.participants[i]];
        }
        
        // Sort by score (descending)
        for (uint256 i = 0; i < allScores.length - 1; i++) {
            for (uint256 j = 0; j < allScores.length - i - 1; j++) {
                if (allScores[j] < allScores[j + 1]) {
                    // Swap scores
                    uint256 tempScore = allScores[j];
                    allScores[j] = allScores[j + 1];
                    allScores[j + 1] = tempScore;
                    
                    // Swap players
                    address tempPlayer = allPlayers[j];
                    allPlayers[j] = allPlayers[j + 1];
                    allPlayers[j + 1] = tempPlayer;
                }
            }
        }
        
        // Return top players
        for (uint256 i = 0; i < length; i++) {
            topPlayers[i] = allPlayers[i];
            topScores[i] = allScores[i];
        }
        
        return (topPlayers, topScores);
    }
    
    // Get arena leaderboard (global rankings)
    function getArenaLeaderboard(uint256 limit) external view returns (
        address[] memory players,
        uint256[] memory ratings,
        ArenaRank[] memory ranks
    ) {
        // This would require maintaining a sorted list of players
        // For now, return empty arrays - would need to implement proper leaderboard storage
        address[] memory emptyPlayers = new address[](0);
        uint256[] memory emptyRatings = new uint256[](0);
        ArenaRank[] memory emptyRanks = new ArenaRank[](0);
        
        return (emptyPlayers, emptyRatings, emptyRanks);
    }
    
    // End current season and start new one
    function endSeason() external onlyOwner {
        require(block.timestamp >= seasonEndTime, "Season not finished");
        
        // Award season rewards to top players
        // This would require implementing proper leaderboard tracking
        
        currentSeason++;
        seasonEndTime = block.timestamp + 30 days;
        
        // Reset all seasonal stats
        // This would be implemented with proper player enumeration
        
        emit SeasonEnded(currentSeason - 1, address(0)); // Would pass actual top player
    }
    
    // Achievement System
    function initializeAchievements() public onlyOwner {
        achievements[1] = Achievement({
            name: "First Step",
            description: "Complete your first check-in",
            requirement: 1,
            xpReward: 500,
            resourceReward: 100,
            achievementType: AchievementType.TOTAL_CHECK_INS
        });

        achievements[2] = Achievement({
            name: "Weekly Warrior",
            description: "Maintain streak for 7 days",
            requirement: 7,
            xpReward: 1000,
            resourceReward: 200,
            achievementType: AchievementType.STREAK_DAYS
        });

        achievements[3] = Achievement({
            name: "Fusion Master",
            description: "Fuse 5 elements",
            requirement: 5,
            xpReward: 2000,
            resourceReward: 300,
            achievementType: AchievementType.ELEMENTS_FUSED
        });

        totalAchievements = 3;
    }
    
    function checkAchievements(address player) internal {
        Player storage playerData = players[player];
        
        for (uint256 i = 1; i <= totalAchievements; i++) {
            if (!isAchievementCompleted(player, i)) {
                Achievement memory achievement = achievements[i];
                bool completed = false;
                
                if (achievement.achievementType == AchievementType.STREAK_DAYS && 
                    playerData.streak >= achievement.requirement) {
                    completed = true;
                }
                else if (achievement.achievementType == AchievementType.PVP_WINS && 
                    playerData.pvpWins >= achievement.requirement) {
                    completed = true;
                }
                else if (achievement.achievementType == AchievementType.BASE_LEVEL && 
                    playerData.baseLevel >= achievement.requirement) {
                    completed = true;
                }
                else if (achievement.achievementType == AchievementType.RESOURCES_EARNED && 
                    playerData.totalResourcesEarned >= achievement.requirement) {
                    completed = true;
                }
                else if (achievement.achievementType == AchievementType.RESOURCES_SPENT && 
                    playerData.totalResourcesSpent >= achievement.requirement) {
                    completed = true;
                }
                
                if (completed) {
                    playerData.completedAchievements.push(i);
                    playerData.xp += achievement.xpReward;
                    playerData.resources += achievement.resourceReward;
                    emit AchievementCompleted(player, i);
                }
            }
        }
    }
    
    function isAchievementCompleted(address player, uint256 achievementId) internal view returns (bool) {
        uint256[] memory completed = players[player].completedAchievements;
        for (uint256 i = 0; i < completed.length; i++) {
            if (completed[i] == achievementId) {
                return true;
            }
        }
        return false;
    }
    
    function getPlayerAchievements(address player) external view returns (uint256[] memory) {
        return players[player].completedAchievements;
    }

    // NEW: Resource System Functions
    
    // Purchase item from resource shop
    function purchaseShopItem(uint256 itemId) external {
        require(players[msg.sender].isActive, "Player not registered");
        require(itemId > 0 && itemId <= totalShopItems, "Invalid item ID");
        
        ShopItem memory item = shopItems[itemId];
        require(item.isActive, "Item not available");
        require(players[msg.sender].resources >= item.resourceCost, "Insufficient resources");
        
        Player storage player = players[msg.sender];
        player.resources -= item.resourceCost;
        player.totalResourcesSpent += item.resourceCost;
        totalResourcesInCirculation -= item.resourceCost;
        
        // Apply item effects
        if (item.duration > 0) {
            // Temporary buff
            PlayerBuff storage buff = playerBuffs[msg.sender];
            if (buff.expiresAt < block.timestamp) {
                // New buff
                buff.xpBonus = item.xpBonus;
                buff.powerBonus = item.powerBonus;
                buff.expiresAt = block.timestamp + item.duration;
            } else {
                // Extend existing buff
                buff.xpBonus += item.xpBonus;
                buff.powerBonus += item.powerBonus;
                buff.expiresAt += item.duration;
            }
        }
        
        playerItemPurchases[msg.sender][itemId]++;
        
        emit ShopItemPurchased(msg.sender, itemId, item.resourceCost);
        emit ResourcesSpent(msg.sender, item.resourceCost, "Shop purchase");
    }
    
    // Exchange resources for ETH
    function exchangeResourcesForETH(uint256 resourceAmount) external {
        require(players[msg.sender].isActive, "Player not registered");
        require(resourceAmount > 0, "Amount must be greater than 0");
        require(players[msg.sender].resources >= resourceAmount, "Insufficient resources");
        require(resourceAmount >= RESOURCE_EXCHANGE_RATE, "Minimum 1000 resources required");
        
        uint256 ethAmount = (resourceAmount * 0.0001 ether) / RESOURCE_EXCHANGE_RATE;
        require(address(this).balance >= ethAmount, "Insufficient contract balance");
        
        Player storage player = players[msg.sender];
        player.resources -= resourceAmount;
        player.totalResourcesSpent += resourceAmount;
        totalResourcesInCirculation -= resourceAmount;
        
        payable(msg.sender).transfer(ethAmount);
        
        emit ResourcesExchanged(msg.sender, resourceAmount, ethAmount);
        emit ResourcesSpent(msg.sender, resourceAmount, "ETH exchange");
    }
    
    // Enhanced trading with resources
    function createTradeWithResources(uint256 tokenId, uint256 ethPrice, uint256 resourcePrice) external {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not the owner");
        require(ethPrice > 0 || resourcePrice > 0, "At least one price must be set");
        
        totalTrades++;
        trades[totalTrades] = Trade({
            seller: msg.sender,
            tokenId: tokenId,
            price: ethPrice,
            resourcePrice: resourcePrice,
            isActive: true,
            acceptsResources: resourcePrice > 0
        });
        
        nftContract.transferFrom(msg.sender, address(this), tokenId);
        emit TradeCreated(totalTrades, msg.sender, tokenId, ethPrice, resourcePrice);
    }
    
    // Complete trade with resources
    function completeTradeWithResources(uint256 tradeId) external {
        Trade storage trade = trades[tradeId];
        require(trade.isActive, "Trade not active");
        require(trade.acceptsResources, "Trade doesn't accept resources");
        require(players[msg.sender].resources >= trade.resourcePrice, "Insufficient resources");
        
        // Calculate marketplace fee (in resources)
        uint256 fee = (trade.resourcePrice * MARKETPLACE_FEE_PERCENT) / 100;
        uint256 sellerAmount = trade.resourcePrice - fee;
        
        // Transfer resources
        players[msg.sender].resources -= trade.resourcePrice;
        players[msg.sender].totalResourcesSpent += trade.resourcePrice;
        players[trade.seller].resources += sellerAmount;
        players[trade.seller].totalResourcesEarned += sellerAmount;
        
        // Fee goes to contract (burned)
        totalResourcesInCirculation -= fee;
        
        trade.isActive = false;
        nftContract.transferFrom(address(this), msg.sender, trade.tokenId);
        
        emit TradeCompleted(tradeId, msg.sender, true);
        emit MarketplaceFeeCollected(tradeId, fee);
        emit ResourcesSpent(msg.sender, trade.resourcePrice, "NFT purchase");
        emit ResourcesEarned(trade.seller, sellerAmount, "NFT sale");
    }
    
    // Enhanced fusion with resource cost
    function fuseElementsWithResources(uint256[] calldata tokenIds) external payable {
        Player storage player = players[msg.sender];
        require(player.isActive, "Player not registered");
        require(player.resources >= FUSION_RESOURCE_COST, "Insufficient resources");

        uint256 fusionCost = getFusionCost(msg.sender);
        
        // Check for fusion discount buff
        if (playerItemPurchases[msg.sender][4] > 0) {
            fusionCost = fusionCost * 80 / 100; // 20% discount
        }
        
        require(msg.value >= fusionCost, "Incorrect payment for fusion");
        
        // Deduct resources
        player.resources -= FUSION_RESOURCE_COST;
        player.totalResourcesSpent += FUSION_RESOURCE_COST;
        totalResourcesInCirculation -= FUSION_RESOURCE_COST;
        
        if (tokenIds.length == 3) {
            handleStandardOrEpicFusion(tokenIds);
        } else if (tokenIds.length == 5) {
            handleGenesisFusion(tokenIds);
        } else {
            revert("Invalid number of elements for fusion (must be 3 or 5)");
        }
        
        emit ResourcesSpent(msg.sender, FUSION_RESOURCE_COST, "Element fusion");
    }
    
    // Alliance resource contribution
    function contributeToAlliance(uint256 amount) external {
        require(players[msg.sender].isActive, "Player not registered");
        require(players[msg.sender].allianceId > 0, "Not in alliance");
        require(players[msg.sender].resources >= amount, "Insufficient resources");
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 allianceId = players[msg.sender].allianceId;
        Alliance storage alliance = alliances[allianceId];
        
        players[msg.sender].resources -= amount;
        players[msg.sender].totalResourcesSpent += amount;
        alliance.resources += amount;
        alliance.resourceContributions += amount;
        alliance.memberContributions[msg.sender] += amount;
        
        emit AllianceResourceContribution(allianceId, msg.sender, amount);
        emit ResourcesSpent(msg.sender, amount, "Alliance contribution");
    }
    
    // Enhanced level up with resource requirement
    function levelUpWithResources() external {
        require(checkLevelUpEligibility(msg.sender), "Level up requirements not met");
        
        Player storage player = players[msg.sender];
        LevelRequirement memory req = levelRequirements[player.baseLevel + 1];
        
        require(player.resources >= req.requiredResources, "Insufficient resources for level up");
        
        // Deduct resources
        player.resources -= req.requiredResources;
        player.totalResourcesSpent += req.requiredResources;
        totalResourcesInCirculation -= req.requiredResources;
        
        player.baseLevel += 1;
        
        emit BaseLevelUp(msg.sender, player.baseLevel);
        emit ResourcesSpent(msg.sender, req.requiredResources, "Level up");
    }
    
    // Enhanced mission system with resource costs
    function startMissionWithResources(uint256 missionId, uint256[] calldata elementIds) external {
        Mission memory mission = missions[missionId];
        require(!playerMissions[msg.sender][missionId], "Mission already started");
        require(players[msg.sender].baseLevel >= mission.minBaseLevel, "Base level too low");
        require(elementIds.length >= mission.requiredElements, "Not enough elements");
        require(players[msg.sender].resources >= mission.resourceCost, "Insufficient resources");
        
        // Check element types
        for (uint256 i = 0; i < elementIds.length; i++) {
            BaseElementNFT.Element memory element = nftContract.getElement(elementIds[i]);
            require(element.elementType == mission.requiredElementType, "Wrong element type");
        }
        
        // Deduct resource cost
        players[msg.sender].resources -= mission.resourceCost;
        players[msg.sender].totalResourcesSpent += mission.resourceCost;
        totalResourcesInCirculation -= mission.resourceCost;
        
        players[msg.sender].activeMissions.push(missionId);
        playerMissions[msg.sender][missionId] = true;
        
        emit MissionStarted(msg.sender, missionId);
        emit ResourcesSpent(msg.sender, mission.resourceCost, "Mission start");
    }
    
    // Get player's current buffs
    function getPlayerBuffs(address player) external view returns (
        uint256 xpBonus,
        uint256 powerBonus,
        uint256 expiresAt,
        bool isActive
    ) {
        PlayerBuff memory buff = playerBuffs[player];
        return (
            buff.xpBonus,
            buff.powerBonus,
            buff.expiresAt,
            buff.expiresAt > block.timestamp
        );
    }
    
    // Get shop item details
    function getShopItem(uint256 itemId) external view returns (
        string memory name,
        uint256 resourceCost,
        uint256 xpBonus,
        uint256 powerBonus,
        uint256 duration,
        bool isActive
    ) {
        require(itemId > 0 && itemId <= totalShopItems, "Invalid item ID");
        ShopItem memory item = shopItems[itemId];
        return (
            item.name,
            item.resourceCost,
            item.xpBonus,
            item.powerBonus,
            item.duration,
            item.isActive
        );
    }
    
    // Get player resource stats
    function getPlayerResourceStats(address player) external view returns (
        uint256 currentResources,
        uint256 totalEarned,
        uint256 totalSpent,
        uint256 netGain
    ) {
        Player memory p = players[player];
        return (
            p.resources,
            p.totalResourcesEarned,
            p.totalResourcesSpent,
            p.totalResourcesEarned - p.totalResourcesSpent
        );
    }
    
    // Get alliance resource stats
    function getAllianceResourceStats(uint256 allianceId) external view returns (
        uint256 totalResources,
        uint256 totalContributions,
        uint256 memberContribution
    ) {
        Alliance storage alliance = alliances[allianceId];
        return (
            alliance.resources,
            alliance.resourceContributions,
            alliance.memberContributions[msg.sender]
        );
    }
    
    // Admin function to add shop items
    function addShopItem(
        string memory name,
        uint256 resourceCost,
        uint256 xpBonus,
        uint256 powerBonus,
        uint256 duration
    ) external onlyOwner {
        totalShopItems++;
        shopItems[totalShopItems] = ShopItem({
            name: name,
            resourceCost: resourceCost,
            xpBonus: xpBonus,
            powerBonus: powerBonus,
            duration: duration,
            isActive: true
        });
    }
    
    // Admin function to update shop item
    function updateShopItem(uint256 itemId, bool isActive) external onlyOwner {
        require(itemId > 0 && itemId <= totalShopItems, "Invalid item ID");
        shopItems[itemId].isActive = isActive;
    }
    
    // Get total resources in circulation
    function getTotalResourcesInCirculation() external view returns (uint256) {
        return totalResourcesInCirculation;
    }
} 