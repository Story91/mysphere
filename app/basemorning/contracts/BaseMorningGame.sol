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
    uint256 public constant ALLIANCE_CREATE_COST = 1000;
    uint256 public constant MAX_ALLIANCE_MEMBERS = 50;
    uint256 public constant PVP_COOLDOWN = 1 hours;
    
    // Struktury podstawowe
    struct LevelRequirement {
        uint8 elementCount;
        uint8 minElementLevel;
        uint256 requiredXP;
    }
    
    struct Player {
        uint256 xp;
        uint256 lastCheckIn;
        uint256 streak;
        uint8 baseLevel;
        bool isActive;
        uint256 lastPvpBattle;
        uint256 pvpWins;
        uint256 resources;
        uint256 allianceId;
        uint256[] completedAchievements;
        uint256[] activeMissions;
    }

    // Nowe struktury
    struct Trade {
        address seller;
        uint256 tokenId;
        uint256 price;
        bool isActive;
    }
    
    struct Mission {
        string name;
        uint256 duration;
        uint256 xpReward;
        uint256 resourceReward;
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
        uint256 resources;
        mapping(address => bool) memberStatus;
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
    
    enum AchievementType {
        STREAK_DAYS,
        TOTAL_CHECK_INS,
        PVP_WINS,
        ELEMENTS_FUSED,
        MISSIONS_COMPLETED,
        BASE_LEVEL,
        ALLIANCE_LEVEL
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
    
    // Counters
    uint256 public totalTrades;
    uint256 public totalMissions;
    uint256 public totalAlliances;
    uint256 public totalAchievements;
    uint256 public totalEvents;
    
    // Events
    event PlayerRegistered(address player);
    event CheckInCompleted(address player, uint256 streak, uint256 xpEarned);
    event BaseLevelUp(address player, uint8 newLevel);
    event ElementFused(address player, uint256[] burnedTokenIds, uint256 newTokenId);
    event TradeCreated(uint256 tradeId, address seller, uint256 tokenId, uint256 price);
    event TradeCancelled(uint256 tradeId);
    event TradeCompleted(uint256 tradeId, address buyer);
    event MissionStarted(address player, uint256 missionId);
    event MissionCompleted(address player, uint256 missionId, uint256 xpEarned, uint256 resourcesEarned);
    event AllianceCreated(uint256 allianceId, string name, address leader);
    event AllianceJoined(uint256 allianceId, address member);
    event AllianceLeft(uint256 allianceId, address member);
    event EventStarted(uint256 eventId, string name);
    event EventEnded(uint256 eventId);
    event AchievementCompleted(address player, uint256 achievementId);
    event PvpBattleCompleted(address winner, address loser, uint256 xpEarned);
    
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
    }
    
    function initializeLevelRequirements() private {
        levelRequirements[1] = LevelRequirement(1, 1, 0);
        levelRequirements[2] = LevelRequirement(3, 2, 500);
        levelRequirements[3] = LevelRequirement(5, 3, 1500);
        levelRequirements[4] = LevelRequirement(8, 4, 3000);
        levelRequirements[5] = LevelRequirement(12, 5, 6000);
        levelRequirements[6] = LevelRequirement(18, 6, 10000);
        levelRequirements[7] = LevelRequirement(25, 7, 20000);
        levelRequirements[8] = LevelRequirement(35, 8, 40000);
        levelRequirements[9] = LevelRequirement(50, 9, 80000);
        levelRequirements[10] = LevelRequirement(75, 10, 150000);
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
            resources: 0,
            allianceId: 0,
            completedAchievements: new uint256[](0),
            activeMissions: new uint256[](0)
        });
        
        emit PlayerRegistered(msg.sender);
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
        
        // Calculate XP reward
        uint256 xpReward = calculateXPReward(player.streak);
        player.xp += xpReward;
        player.lastCheckIn = block.timestamp;
        
        // Request random number for NFT chance
        requestRandomness();
        
        emit CheckInCompleted(msg.sender, player.streak, xpReward);
    }
    
    function calculateXPReward(uint256 streak) public pure returns (uint256) {
        uint256 reward = DAILY_XP;
        
        if (streak >= 30) reward += 1000;
        else if (streak >= 14) reward += 500;
        else if (streak >= 7) reward += 200;
        else if (streak >= 3) reward += 50;
        
        return reward;
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
        uint256 chance = randomWords[0] % 100;
        
        // NFT minting logic based on chance and player's base level
        if (chance < getMintChance(players[msg.sender].baseLevel)) {
            mintRandomElement(msg.sender, randomWords[0]);
        }
    }
    
    function getMintChance(uint8 baseLevel) public pure returns (uint256) {
        return 50 + (baseLevel * 5); // Base 50% + 5% per level
    }
    
    function mintRandomElement(address player, uint256 randomness) private {
        uint256 typeRandom = randomness % 5;
        uint256 rarityRandom = (randomness / 100) % 100;
        uint8 level = uint8(1 + (players[player].baseLevel / 2));
        
        BaseElementNFT.ElementType elementType = BaseElementNFT.ElementType(typeRandom);
        BaseElementNFT.Rarity rarity;
        
        if (rarityRandom < 50) rarity = BaseElementNFT.Rarity.COMMON;
        else if (rarityRandom < 80) rarity = BaseElementNFT.Rarity.UNCOMMON;
        else if (rarityRandom < 95) rarity = BaseElementNFT.Rarity.RARE;
        else rarity = BaseElementNFT.Rarity.EPIC;
        
        nftContract.mint(player, elementType, rarity, level);
    }
    
    function fuseElements(uint256[] calldata tokenIds) external {
        require(tokenIds.length == 3, "Must fuse exactly 3 elements");
        require(players[msg.sender].xp >= 100, "Not enough XP for fusion");
        
        // Check ownership and similarity
        BaseElementNFT.Element memory firstElement = nftContract.getElement(tokenIds[0]);
        
        for (uint256 i = 1; i < 3; i++) {
            BaseElementNFT.Element memory element = nftContract.getElement(tokenIds[i]);
            require(
                element.elementType == firstElement.elementType &&
                element.level == firstElement.level &&
                element.rarity == firstElement.rarity,
                "Elements must be of same type, level and rarity"
            );
        }
        
        // Burn elements and mint new one
        uint8 newLevel = firstElement.level + 1;
        nftContract.mint(
            msg.sender,
            firstElement.elementType,
            firstElement.rarity,
            newLevel
        );
        
        players[msg.sender].xp -= 100;
        emit ElementFused(msg.sender, tokenIds, nftContract.totalSupply());
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

    // Trading System
    function createTrade(uint256 tokenId, uint256 price) external {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not the owner");
        require(price > 0, "Price must be greater than 0");
        
        totalTrades++;
        trades[totalTrades] = Trade({
            seller: msg.sender,
            tokenId: tokenId,
            price: price,
            isActive: true
        });
        
        nftContract.transferFrom(msg.sender, address(this), tokenId);
        emit TradeCreated(totalTrades, msg.sender, tokenId, price);
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
        emit TradeCompleted(tradeId, msg.sender);
    }
    
    // Mission System
    function createMission(
        string memory name,
        uint256 duration,
        uint256 xpReward,
        uint256 resourceReward,
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

    // PvP System
    function initiatePvpBattle(address opponent, uint256[] calldata elementIds) external {
        require(block.timestamp >= players[msg.sender].lastPvpBattle + PVP_COOLDOWN, "PvP cooldown");
        require(elementIds.length > 0, "No elements selected");
        require(opponent != msg.sender, "Cannot battle yourself");
        require(players[opponent].isActive, "Opponent not registered");
        
        uint256 attackerPower = 0;
        for (uint256 i = 0; i < elementIds.length; i++) {
            BaseElementNFT.Element memory element = nftContract.getElement(elementIds[i]);
            require(nftContract.ownerOf(elementIds[i]) == msg.sender, "Not your element");
            attackerPower += element.power;
        }
        
        uint256[] memory opponentElements = nftContract.getPlayerElements(opponent);
        uint256 defenderPower = 0;
        for (uint256 i = 0; i < opponentElements.length; i++) {
            BaseElementNFT.Element memory element = nftContract.getElement(opponentElements[i]);
            defenderPower += element.power;
        }
        
        players[msg.sender].lastPvpBattle = block.timestamp;
        
        // Battle logic with some randomness
        uint256 attackerRoll = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender))) % 100;
        uint256 defenderRoll = uint256(keccak256(abi.encodePacked(block.timestamp, opponent))) % 100;
        
        uint256 attackerScore = attackerPower * (100 + attackerRoll) / 100;
        uint256 defenderScore = defenderPower * (100 + defenderRoll) / 100;
        
        if (attackerScore > defenderScore) {
            // Attacker wins
            uint256 xpReward = 100 + (defenderPower / 10);
            players[msg.sender].xp += xpReward;
            players[msg.sender].pvpWins++;
            emit PvpBattleCompleted(msg.sender, opponent, xpReward);
        } else {
            // Defender wins
            uint256 xpReward = 50 + (attackerPower / 10);
            players[opponent].xp += xpReward;
            players[opponent].pvpWins++;
            emit PvpBattleCompleted(opponent, msg.sender, xpReward);
        }
        
        checkAchievements(msg.sender);
        checkAchievements(opponent);
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
} 