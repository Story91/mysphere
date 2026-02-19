// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

// --- AUTONOMOUS AGENT WALLET SYSTEM INTERFACES ---

interface IAutonomousAgentWallet {
    struct SessionKey {
        address agentAddress;
        uint256 permissions; // Bitmask for permissions
        uint256 expiresAt;
        uint256 dailyLimit; // Maximum ETH that can be spent per day
        uint256 spentToday; // ETH spent today
        uint256 lastActivityDay; // Last day of activity
        bool isActive;
    }

    struct AgentPolicy {
        address agentAddress;
        string name;
        string description;
        uint256 maxTransactionValue;
        uint256 dailyTransactionLimit;
        address[] allowedContracts;
        bytes4[] allowedFunctions;
        bool canTransferNative;
        bool canTransferERC20;
        bool canTransferNFT;
        bool canSwap;
        bool canBridge;
        bool isActive;
    }

    event SessionKeyCreated(address indexed user, address indexed agent, uint256 indexed sessionId);
    event SessionKeyRevoked(address indexed user, address indexed agent, uint256 indexed sessionId);
    event AutonomousTransaction(address indexed user, address indexed agent, address indexed target, uint256 value);
    event AgentPolicyUpdated(address indexed user, address indexed agent);
    event EmergencyStop(address indexed user, address indexed agent);

    function createSessionKey(
        address agentAddress,
        uint256 permissions,
        uint256 duration,
        uint256 dailyLimit
    ) external returns (uint256 sessionId);

    function executeAutonomousTransaction(
        uint256 sessionId,
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (bool success, bytes memory result);

    function revokeSessionKey(uint256 sessionId) external;
    function emergencyStop() external;
    function updateAgentPolicy(address agent, AgentPolicy calldata policy) external;
}

contract HybridCommunityPlatform is ERC721URIStorage, Ownable, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;

    // ... existing enums ...
    enum MemberRole { MEMBER, MODERATOR, ADMIN }
    enum EventType { STANDARD, COMPETITION, SEASONAL, MYSTERY }
    enum CommunityStatus { ACTIVE, SUSPENDED, CLOSED }
    enum AchievementType { FIRST_JOIN, LEVEL_UP, EVENT_WINNER, REFERRAL_MASTER, STREAK_KEEPER, COLLECTIBLE_RECEIVED }
    enum BoostType { EXPERIENCE_MULTIPLIER, REPUTATION_MULTIPLIER, EVENT_DISCOUNT }

    // ... existing structs ...
    struct Community {
        address creator;
        uint128 joinFeeEth;
        uint128 monthlySubFeeEth;
        uint128 lifetimeSubFeeEth;
        uint128 balance;
        uint128 withdrawableBalance; // Saldo które można wypłacić
        uint32 eventIdCounter;
        uint32 totalMembers;
        uint32 createdAt;
        uint16 platformFeePercentage; // 0-1000 (0.1% = 1)
        CommunityStatus status;
        string name;
        string description;
        string[] announcements;
    }

    struct Member {
        uint32 communityId;
        uint32 subscriptionExpiresAt;
        uint32 respectPoints;
        uint32 totalSpent;
        uint32 lastActiveTime;
        uint16 referralCount;
        uint16 level;
        uint16 reputation; // 0-100
        uint16 currentStreak;
        uint16 longestStreak;
        uint16 totalEventsParticipated;
        uint16 totalEventsWon;
        uint16 totalRatings;
        uint32 ratingSum;
        bool lifetime;
        address mentorAddress;
        uint256 achievementFlags; // Bitflags for achievements
        address[] mentees;
    }

    struct Event {
        uint32 id;
        uint32 startTime;
        uint32 endTime;
        uint32 maxParticipants;
        uint32 currentParticipants;
        uint32 seasonId;
        uint128 participationFeeEth;
        uint128 totalPrizePool;
        EventType eventType;
        string description;
        bool active;
        bool isSeasonalEvent;
        mapping(address => bool) participants;
        mapping(address => uint32) participantScores;
        address[] winners;
        uint128[] rewards;
    }

    struct Challenge {
        address challenger;
        address challenged;
        uint32 communityId;
        uint32 deadline;
        uint128 stakeAmount;
        bool active;
        bool completed;
        address winner;
        string description;
    }

    struct Proposal {
        uint32 id;
        uint32 deadline;
        uint32 votesFor;
        uint32 votesAgainst;
        bool executed;
        string description;
        mapping(address => bool) voted;
    }

    struct CrossCommunityVisit {
        uint32 fromCommunityId;
        uint32 toCommunityId;
        address visitor;
        uint32 visitTime;
        uint32 duration;
        bool active;
    }

    struct SeasonalEvent {
        uint32 id;
        uint32 startTime;
        uint32 endTime;
        uint32 seasonId;
        uint128 totalPrizePool;
        string name;
        bool active;
        uint32[] participatingCommunities;
        mapping(uint32 => uint128) communityScores;
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
        uint32 duration; // w sekundach
        uint32 expiresAt;
        uint16 multiplier; // 100 = 1x, 200 = 2x, etc.
        bool active;
    }

    struct AchievementUnlock {
        AchievementType achievementType;
        uint32 unlockedAt;
        uint128 unlockFee;
        bool isPremium;
    }

    // --- STATE VARIABLES ---
    uint256 public communityIdCounter = 1;
    uint256 public membershipTokenIdCounter = 1;
    uint256 public challengeIdCounter = 1;
    uint256 public seasonalEventIdCounter = 1;
    uint256 public visitIdCounter = 1;
    uint256 public currentSeason = 1;

    // Mappings
    mapping(uint256 => Community) public communities;
    mapping(uint256 => mapping(address => Member)) public members;
    mapping(uint256 => mapping(uint256 => Event)) private communityEvents;
    mapping(uint256 => mapping(uint256 => Proposal)) private communityProposals;
    mapping(uint256 => uint256) public communityProposalCount;
    mapping(uint256 => Challenge) public challenges;
    mapping(uint256 => SeasonalEvent) public seasonalEvents;
    mapping(uint256 => CrossCommunityVisit) public crossVisits;
    mapping(address => bool) public globalBannedUsers;
    mapping(uint256 => mapping(address => bool)) public communityBannedUsers;
    mapping(uint256 => mapping(address => MemberRole)) public memberRoles;
    mapping(address => uint256[]) public userAchievements;
    mapping(uint256 => mapping(address => uint256)) public memberRatings;
    mapping(address => mapping(BoostType => Boost)) public userBoosts;
    mapping(address => AchievementUnlock[]) public userAchievementUnlocks;

    // --- NEW MAPPINGS FOR UTILITY REWARDS ---
    mapping(address => uint256) public streakSavers;
    mapping(address => uint256) public achievementVouchers;

    // Platform settings
    uint256 public creationFeeEth = 0.01 ether;
    uint256 public defaultPlatformFeePercentage = 25; // 2.5%
    uint256 public maxPlatformFeePercentage = 100; // 10%
    
    // --- MYSTERY BOX & UTILITY BOX STATE VARIABLES ---
    uint256 public mysteryBoxPrizePool;
    uint256 public minMysteryBoxBet = 0.00035 ether;
    uint256 public maxMysteryBoxBet = 0.01 ether;
    uint256 public utilityBoxFee = 0.0001 ether;
    string public utilityBoxNftUri;

    uint256 constant public TRANSACTION_FEE_PERCENTAGE = 5; // 0.5%
    uint256 public withdrawalFeePercentage = 10; // 1%
    uint256 public achievementUnlockFee = 0.0005 ether;
    uint256 public boostPurchaseFee = 0.0005 ether;
    uint256 public eventPlatformFee = 0.002 ether;
    PlatformStats public platformStats;

    uint256 private nonce = 0;

    // --- EVENTS ---
    event CommunityCreated(uint256 indexed communityId, address indexed creator, string name);
    event MemberJoined(uint256 indexed communityId, address indexed member);
    event MemberBanned(uint256 indexed communityId, address indexed member);
    event MemberRoleChanged(uint256 indexed communityId, address indexed member, MemberRole newRole);
    event EventCreated(uint256 indexed communityId, uint256 indexed eventId);
    event EventParticipation(uint256 indexed communityId, uint256 indexed eventId, address indexed participant);
    event AchievementUnlocked(address indexed user, AchievementType achievement);
    event PremiumAchievementUnlocked(address indexed user, AchievementType achievement, uint256 fee);
    event LevelUp(address indexed user, uint256 newLevel);
    event ChallengeCreated(uint256 indexed challengeId, address indexed challenger, address indexed challenged);
    event ChallengeCompleted(uint256 indexed challengeId, address indexed winner);
    event ProposalCreated(uint256 indexed communityId, uint256 indexed proposalId);
    event ProposalVoted(uint256 indexed communityId, uint256 indexed proposalId, address indexed voter, bool support);
    event MysteryBoxOpened(address indexed user, uint256 reward);
    event UtilityBoxOpened(address indexed user, string prizeType, uint256 value);
    // --- NEW UTILITY REWARD EVENTS ---
    event StreakSaverWon(address indexed user, uint256 newTotal);
    event StreakSaverUsed(address indexed user, uint256 streakPreserved);
    event AchievementVoucherWon(address indexed user, uint256 newTotal);
    event AchievementVoucherUsed(address indexed user, AchievementType achievementType);
    
    event CrossCommunityVisitStarted(uint256 indexed visitId, address indexed visitor, uint256 fromCommunity, uint256 toCommunity);
    event SeasonalEventCreated(uint256 indexed eventId, string name);
    event MentorAssigned(uint256 indexed communityId, address indexed mentor, address indexed mentee);
    event CollectibleMinted(address indexed recipient, uint256 indexed tokenId, string category);
    event AnnouncementMade(uint256 indexed communityId, string announcement);
    event MemberRated(uint256 indexed communityId, address indexed rated, address indexed rater, uint256 rating);
    event BoostPurchased(address indexed user, BoostType boostType, uint256 fee, uint32 duration);
    event BoostActivated(address indexed user, BoostType boostType);
    event FundsWithdrawn(uint256 indexed communityId, address indexed creator, uint256 amount, uint256 fee);
    event TransactionFeeCharged(address indexed user, uint256 fee);
    event PlatformFeeCollected(uint256 amount, string source);

    // ... existing modifiers ...
    modifier onlyCreator(uint256 _communityId) {
        require(msg.sender == communities[_communityId].creator, "Only creator");
        _;
    }

    modifier onlyModerator(uint256 _communityId) {
        require(
            memberRoles[_communityId][msg.sender] >= MemberRole.MODERATOR ||
            msg.sender == communities[_communityId].creator,
            "Only moderator or creator"
        );
        _;
    }

    modifier notBanned(uint256 _communityId) {
        require(!globalBannedUsers[msg.sender], "Globally banned");
        require(!communityBannedUsers[_communityId][msg.sender], "Banned from community");
        _;
    }

    modifier activeCommunity(uint256 _communityId) {
        require(communities[_communityId].status == CommunityStatus.ACTIVE, "Community not active");
        _;
    }

    modifier validCommunity(uint256 _communityId) {
        require(communities[_communityId].creator != address(0), "Community doesn't exist");
        _;
    }

    constructor() ERC721("CommunityMembership", "CMEM") {}

    // --- CORE FUNCTIONS ---
    // ... (no changes in createCommunity, joinCommunity)

    function createCommunity(
        string memory _name,
        string memory _description,
        uint128 _joinFeeEth,
        uint128 _monthlySubFeeEth,
        uint128 _lifetimeSubFeeEth
    ) external payable whenNotPaused nonReentrant returns (uint256) {
        require(msg.value >= creationFeeEth, "Insufficient creation fee");
        require(bytes(_name).length > 0 && bytes(_name).length <= 100, "Invalid name length");
        require(bytes(_description).length <= 500, "Description too long");

        uint256 transactionFee = (msg.value * TRANSACTION_FEE_PERCENTAGE) / 1000;
        
        uint256 cid = communityIdCounter++;
        Community storage c = communities[cid];
        
        c.creator = msg.sender;
        c.name = _name;
        c.description = _description;
        c.joinFeeEth = _joinFeeEth;
        c.monthlySubFeeEth = _monthlySubFeeEth;
        c.lifetimeSubFeeEth = _lifetimeSubFeeEth;
        c.status = CommunityStatus.ACTIVE;
        c.platformFeePercentage = uint16(defaultPlatformFeePercentage);
        c.createdAt = uint32(block.timestamp);

        platformStats.totalCommunities++;
        platformStats.activeCommunities++;
        platformStats.totalPlatformFees += uint128(msg.value);

        payable(owner()).transfer(msg.value);

        emit CommunityCreated(cid, msg.sender, _name);
        emit TransactionFeeCharged(msg.sender, transactionFee);
        emit PlatformFeeCollected(msg.value, "Community Creation");
        return cid;
    }

    function joinCommunity(
        uint256 _communityId,
        bool _lifetime,
        address _referrer
    ) external payable 
        nonReentrant 
        whenNotPaused 
        notBanned(_communityId) 
        activeCommunity(_communityId) 
        validCommunity(_communityId) 
    {
        Community storage c = communities[_communityId];
        Member storage m = members[_communityId][msg.sender];

        uint256 totalFee = _lifetime ? c.lifetimeSubFeeEth : c.monthlySubFeeEth;
        
        if (m.communityId == 0) {
            totalFee += c.joinFeeEth;
            _mint(msg.sender, membershipTokenIdCounter++);
            m.communityId = uint32(_communityId);
            c.totalMembers++;
            platformStats.totalMembers++;
            _unlockAchievement(msg.sender, AchievementType.FIRST_JOIN);
            
            if (_referrer != address(0) && _isActiveMember(_communityId, _referrer)) {
                _processReferral(_communityId, _referrer, msg.sender);
            }
        }

        require(msg.value >= totalFee, "Insufficient fee");

        if (_lifetime) {
            m.lifetime = true;
            m.subscriptionExpiresAt = type(uint32).max;
        } else {
            uint32 newExpire = uint32(block.timestamp + 30 days);
            if (m.subscriptionExpiresAt > block.timestamp) {
                newExpire = m.subscriptionExpiresAt + 30 days;
            }
            m.subscriptionExpiresAt = newExpire;
        }

        uint256 transactionFee = (msg.value * TRANSACTION_FEE_PERCENTAGE) / 1000;
        uint256 actualPayment = msg.value - transactionFee;
        uint256 platformFee = (actualPayment * c.platformFeePercentage) / 1000;
        uint256 communityAmount = actualPayment - platformFee;
        
        c.balance += uint128(communityAmount);
        c.withdrawableBalance += uint128(communityAmount);
        m.totalSpent += uint32(msg.value);
        platformStats.totalVolume += uint128(msg.value);
        platformStats.totalTransactions++;
        platformStats.totalPlatformFees += uint128(platformFee + transactionFee);

        if (platformFee + transactionFee > 0) {
            payable(owner()).transfer(platformFee + transactionFee);
        }

        _updateMemberActivity(_communityId, msg.sender);

        emit MemberJoined(_communityId, msg.sender);
        emit TransactionFeeCharged(msg.sender, transactionFee);
        emit PlatformFeeCollected(platformFee + transactionFee, "Community Join");
    }

    // --- GAME BOXES (REBUILT & SECURED) ---

    function fundMysteryBoxPool() external payable onlyOwner {
        require(msg.value > 0, "Must send ETH to fund the pool");
        mysteryBoxPrizePool += msg.value;
    }

    function setMysteryBoxBetLimits(uint256 _minBet, uint256 _maxBet) external onlyOwner {
        require(_minBet > 0 && _minBet < _maxBet, "Invalid bet limits");
        minMysteryBoxBet = _minBet;
        maxMysteryBoxBet = _maxBet;
    }
    
    function setUtilityBoxFee(uint256 _newFee) external onlyOwner {
        require(_newFee > 0, "Fee must be greater than zero");
        utilityBoxFee = _newFee;
    }
    
    function setUtilityBoxNftUri(string memory _newUri) external onlyOwner {
        utilityBoxNftUri = _newUri;
    }

    function withdrawFromPrizePool(uint256 _amount) external onlyOwner {
        require(mysteryBoxPrizePool >= _amount, "Amount exceeds prize pool balance");
        mysteryBoxPrizePool -= _amount;
        payable(owner()).transfer(_amount);
    }
    
    function openMysteryBox(uint256 _communityId) external payable nonReentrant whenNotPaused {
        require(msg.value >= minMysteryBoxBet, "Bet is below minimum limit");
        require(msg.value <= maxMysteryBoxBet, "Bet exceeds maximum limit");
        require(_isActiveMember(_communityId, msg.sender), "Not active member");

        uint256 transactionFee = (msg.value * TRANSACTION_FEE_PERCENTAGE) / 1000;
        uint256 actualBet = msg.value - transactionFee;

        mysteryBoxPrizePool += actualBet;

        uint256 randomValue = _generateRandomNumber();
        uint256 rand = randomValue % 100;
        uint256 reward = 0;

        if (rand < 2) {           // 2% chance for 2.0x
            reward = actualBet * 2;
        } else if (rand < 7) {    // 5% chance for 1.5x
            reward = (actualBet * 15) / 10;
        } else if (rand < 17) {   // 10% chance for 1.1x
            reward = (actualBet * 11) / 10;
        } else if (rand < 67) {   // 50% chance for 1.0x
            reward = actualBet;
        } else if (rand < 87) {   // 20% chance for 0.8x
            reward = (actualBet * 8) / 10;
        } else {                  // 13% chance for 0.5x
            reward = actualBet / 2;
        }
        
        if (reward > 0) {
            require(mysteryBoxPrizePool >= reward, "Prize pool insufficient for this win");
            mysteryBoxPrizePool -= reward;
            payable(msg.sender).transfer(reward);
        }

        if (transactionFee > 0) {
            platformStats.totalPlatformFees += uint128(transactionFee);
            payable(owner()).transfer(transactionFee);
        }
        
        emit MysteryBoxOpened(msg.sender, reward);
        emit TransactionFeeCharged(msg.sender, transactionFee);
    }
    
    function openUtilityBox(uint256 _communityId) external payable nonReentrant whenNotPaused {
        require(msg.value == utilityBoxFee, "Incorrect fee for Utility Box");
        require(_isActiveMember(_communityId, msg.sender), "Not active member");

        uint256 randomValue = _generateRandomNumber();
        uint256 rand = randomValue % 100;

        if (rand < 1) { // 1% chance for NFT
            _mintUtilityBoxNft(msg.sender);
        } else if (rand < 5) { // 4% chance for Voucher
            achievementVouchers[msg.sender]++;
            emit AchievementVoucherWon(msg.sender, achievementVouchers[msg.sender]);
        } else if (rand < 15) { // 10% chance for Streak Saver
            streakSavers[msg.sender]++;
            emit StreakSaverWon(msg.sender, streakSavers[msg.sender]);
        } else if (rand < 20) { // 5% chance for 3-Day Boost
             _awardBoost(msg.sender, BoostType(randomValue % 3), 3 days);
        } else if (rand < 30) { // 10% chance for 1-Day Boost
             _awardBoost(msg.sender, BoostType(randomValue % 3), 1 days);
        } else if (rand < 50) { // 20% chance for +25 Respect
            _processRespectPointsWithBoost(_communityId, msg.sender, 25);
            emit UtilityBoxOpened(msg.sender, "Respect Points", 25);
        } else if (rand < 70) { // 20% chance for +5 Respect
            _processRespectPointsWithBoost(_communityId, msg.sender, 5);
            emit UtilityBoxOpened(msg.sender, "Respect Points", 5);
        } else { // 30% chance for Nothing
            emit UtilityBoxOpened(msg.sender, "Nothing", 0);
        }

        // The entire fee goes to the platform owner
        platformStats.totalPlatformFees += uint128(msg.value);
        payable(owner()).transfer(msg.value);
    }

    // --- INTERNAL & CORE LOGIC FUNCTIONS ---
    
    function _awardBoost(address _user, BoostType _boostType, uint32 _duration) internal {
        Boost storage boost = userBoosts[_user][_boostType];
        
        if (boost.active && boost.expiresAt > block.timestamp) {
            boost.expiresAt += _duration;
        } else {
            boost.boostType = _boostType;
            boost.duration = _duration;
            boost.expiresAt = uint32(block.timestamp + _duration);
            boost.active = true;
            
            if (_boostType == BoostType.EXPERIENCE_MULTIPLIER) {
                boost.multiplier = 200;
            } else if (_boostType == BoostType.REPUTATION_MULTIPLIER) {
                boost.multiplier = 150;
            } else if (_boostType == BoostType.EVENT_DISCOUNT) {
                boost.multiplier = 80;
            }
        }
        emit BoostActivated(_user, _boostType);
    }

    function _updateMemberActivity(uint256 _communityId, address _user) internal {
        Member storage m = members[_communityId][_user];
        
        if (block.timestamp - m.lastActiveTime > 24 hours && block.timestamp - m.lastActiveTime < 48 hours) {
             if (streakSavers[_user] > 0) {
                streakSavers[_user]--;
                emit StreakSaverUsed(_user, m.currentStreak);
             } else {
                m.currentStreak = 1;
             }
        } else if (block.timestamp - m.lastActiveTime > 48 hours) {
             m.currentStreak = 1;
        } else {
            m.currentStreak++;
            if (m.currentStreak > m.longestStreak) {
                m.longestStreak = m.currentStreak;
            }
        }
        
        m.lastActiveTime = uint32(block.timestamp);
        
        if (m.currentStreak >= 7) {
            _unlockAchievement(_user, AchievementType.STREAK_KEEPER);
        }
    }

    function _mintUtilityBoxNft(address _recipient) internal {
        require(bytes(utilityBoxNftUri).length > 0, "NFT URI not set");
        uint256 tokenId = membershipTokenIdCounter++;
        _mint(_recipient, tokenId);
        _setTokenURI(tokenId, utilityBoxNftUri);
        emit CollectibleMinted(_recipient, tokenId, "UtilityBox Champion");
    }

    // ... existing functions like _checkLevelUp, _processRespectPointsWithBoost etc. ...

    // --- PREMIUM ACHIEVEMENT UNLOCK (MODIFIED) ---

    function unlockPremiumAchievement(AchievementType _achievementType) external payable nonReentrant {
        require(msg.value >= achievementUnlockFee, "Insufficient payment");
        _unlockPremiumLogic(_achievementType);
        
        // Collect fees
        platformStats.totalPlatformFees += uint128(msg.value);
        payable(owner()).transfer(msg.value);
        emit PremiumAchievementUnlocked(msg.sender, _achievementType, msg.value);
    }
    
    function useAchievementVoucher(AchievementType _achievementType) external nonReentrant {
        require(achievementVouchers[msg.sender] > 0, "No achievement voucher available");
        achievementVouchers[msg.sender]--;
        _unlockPremiumLogic(_achievementType);
        emit AchievementVoucherUsed(msg.sender, _achievementType);
    }

    function _unlockPremiumLogic(AchievementType _achievementType) internal {
        bool alreadyHas = false;
        for (uint i = 0; i < userAchievements[msg.sender].length; i++) {
            if (userAchievements[msg.sender][i] == uint256(_achievementType)) {
                alreadyHas = true;
                break;
            }
        }
        require(!alreadyHas, "Achievement already unlocked");
        
        userAchievements[msg.sender].push(uint256(_achievementType));
        
        AchievementUnlock memory unlock = AchievementUnlock({
            achievementType: _achievementType,
            unlockedAt: uint32(block.timestamp),
            unlockFee: 0, // Fee handled by caller
            isPremium: true
        });
        userAchievementUnlocks[msg.sender].push(unlock);
    }

    // ... (rest of the file remains largely the same) ...
    // --- CROSS-COMMUNITY VISITS ---

    function startCrossCommunityVisit(uint256 _fromCommunityId, uint256 _toCommunityId) external nonReentrant {
        require(_isActiveMember(_fromCommunityId, msg.sender), "Not member of origin community");
        require(communities[_toCommunityId].status == CommunityStatus.ACTIVE, "Target community not active");
        require(_fromCommunityId != _toCommunityId, "Cannot visit same community");
        
        uint256 visitId = visitIdCounter++;
        CrossCommunityVisit storage visit = crossVisits[visitId];
        
        visit.fromCommunityId = uint32(_fromCommunityId);
        visit.toCommunityId = uint32(_toCommunityId);
        visit.visitor = msg.sender;
        visit.visitTime = uint32(block.timestamp);
        visit.active = true;
        
        emit CrossCommunityVisitStarted(visitId, msg.sender, _fromCommunityId, _toCommunityId);
    }

    function endCrossCommunityVisit(uint256 _visitId) external nonReentrant {
        CrossCommunityVisit storage visit = crossVisits[_visitId];
        require(visit.visitor == msg.sender, "Not your visit");
        require(visit.active, "Visit not active");
        
        visit.duration = uint32(block.timestamp - visit.visitTime);
        visit.active = false;
        
        Member storage m = members[visit.fromCommunityId][msg.sender];
        m.respectPoints += 10;
        
        _checkLevelUp(visit.fromCommunityId, msg.sender);
    }

    // --- SEASONAL EVENTS ---

    function createSeasonalEvent(
        string memory _name,
        uint32 _startTime,
        uint32 _endTime,
        uint32[] memory _participatingCommunities
    ) external onlyOwner {
        require(_startTime > block.timestamp, "Start time must be in future");
        require(_endTime > _startTime, "End time must be after start time");
        
        uint256 eventId = seasonalEventIdCounter++;
        SeasonalEvent storage se = seasonalEvents[eventId];
        
        se.id = uint32(eventId);
        se.name = _name;
        se.startTime = _startTime;
        se.endTime = _endTime;
        se.participatingCommunities = _participatingCommunities;
        se.seasonId = uint32(currentSeason);
        se.active = true;
        
        emit SeasonalEventCreated(eventId, _name);
    }

    function participateInSeasonalEvent(uint256 _eventId, uint256 _communityId) external payable nonReentrant {
        SeasonalEvent storage se = seasonalEvents[_eventId];
        require(se.active, "Event not active");
        require(block.timestamp >= se.startTime && block.timestamp <= se.endTime, "Event not in progress");
        require(_isActiveMember(_communityId, msg.sender), "Not active member");
        
        bool communityParticipating = false;
        for (uint i = 0; i < se.participatingCommunities.length; i++) {
            if (se.participatingCommunities[i] == _communityId) {
                communityParticipating = true;
                break;
            }
        }
        require(communityParticipating, "Community not participating");
        
        se.communityScores[uint32(_communityId)] += uint128(msg.value);
        se.totalPrizePool += uint128(msg.value);
        
        Member storage m = members[_communityId][msg.sender];
        m.respectPoints += 50;
        _checkLevelUp(_communityId, msg.sender);
    }

    // --- MENTOR SYSTEM ---

    function becomeMentor(uint256 _communityId) external validCommunity(_communityId) {
        require(_isActiveMember(_communityId, msg.sender), "Not active member");
        Member storage m = members[_communityId][msg.sender];
        require(m.level >= 3, "Minimum level 3 required");
        require(m.reputation >= 70, "Minimum reputation 70 required");
        
        m.respectPoints += 25;
        _checkLevelUp(_communityId, msg.sender);
    }

    function assignMentor(uint256 _communityId, address _mentee, address _mentor) external onlyModerator(_communityId) {
        require(_isActiveMember(_communityId, _mentee), "Mentee not active member");
        require(_isActiveMember(_communityId, _mentor), "Mentor not active member");
        
        Member storage mentee = members[_communityId][_mentee];
        Member storage mentor = members[_communityId][_mentor];
        
        require(mentee.level < mentor.level, "Mentor must have higher level");
        require(mentee.mentorAddress == address(0), "Already has mentor");
        
        mentee.mentorAddress = _mentor;
        mentor.mentees.push(_mentee);
        
        _processRespectPointsWithBoost(_communityId, _mentor, 25);
        
        emit MentorAssigned(_communityId, _mentor, _mentee);
    }

    function completeMentorship(uint256 _communityId) external nonReentrant {
        Member storage m = members[_communityId][msg.sender];
        require(m.mentorAddress != address(0), "No mentor assigned");
        
        address mentorAddr = m.mentorAddress;
        m.mentorAddress = address(0);
        
        Member storage mentor = members[_communityId][mentorAddr];
        for (uint i = 0; i < mentor.mentees.length; i++) {
            if (mentor.mentees[i] == msg.sender) {
                mentor.mentees[i] = mentor.mentees[mentor.mentees.length - 1];
                mentor.mentees.pop();
                break;
            }
        }
        
        mentor.respectPoints += 50;
        m.respectPoints += 25;
        
        _checkLevelUp(_communityId, mentorAddr);
        _checkLevelUp(_communityId, msg.sender);
    }

    // --- COLLECTIBLE NFTS ---

    function mintCollectibleNFT(address _recipient, string memory _tokenURI, string memory _category) external onlyOwner {
        uint256 tokenId = membershipTokenIdCounter++;
        _mint(_recipient, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        
        _unlockAchievement(_recipient, AchievementType.COLLECTIBLE_RECEIVED);
        
        emit CollectibleMinted(_recipient, tokenId, _category);
    }

    function awardTopPerformerCollectible(uint256 _communityId, address _performer) external onlyCreator(_communityId) {
        Member storage m = members[_communityId][_performer];
        require(m.level >= 4, "Must be high level performer");
        require(m.reputation >= 80, "Must have high reputation");
        
        uint256 tokenId = membershipTokenIdCounter++;
        _mint(_performer, tokenId);
        
        m.respectPoints += 200;
        _checkLevelUp(_communityId, _performer);
        
        emit CollectibleMinted(_performer, tokenId, "TopPerformer");
    }

    // --- REPUTATION SYSTEM ---

    function rateMember(uint256 _communityId, address _member, uint256 _rating) external validCommunity(_communityId) {
        require(_isActiveMember(_communityId, msg.sender), "Not active member");
        require(_isActiveMember(_communityId, _member), "Target not active member");
        require(_rating >= 1 && _rating <= 5, "Rating must be 1-5");
        require(msg.sender != _member, "Cannot rate yourself");
        require(memberRatings[_communityId][msg.sender] == 0, "Already rated this member");

        Member storage m = members[_communityId][_member];
        m.totalRatings++;
        m.ratingSum += uint32(_rating);
        m.reputation = uint16((m.ratingSum * 100) / (m.totalRatings * 5)); // 0-100 scale

        memberRatings[_communityId][msg.sender] = _rating;
        emit MemberRated(_communityId, _member, msg.sender, _rating);
    }

    // --- ANNOUNCEMENTS ---

    function makeAnnouncement(uint256 _communityId, string memory _announcement) external onlyModerator(_communityId) {
        require(bytes(_announcement).length > 0 && bytes(_announcement).length <= 500, "Invalid announcement");
        
        communities[_communityId].announcements.push(_announcement);
        emit AnnouncementMade(_communityId, _announcement);
    }

    // --- EVENTS (Enhanced from base contract) ---

    function createEvent(
        uint256 _communityId,
        string memory _description,
        uint128 _feeEth,
        EventType _eventType,
        uint32 _startTime,
        uint32 _endTime,
        uint32 _maxParticipants
    ) external payable onlyModerator(_communityId) validCommunity(_communityId) {
        require(_startTime > block.timestamp, "Start time must be in future");
        require(_endTime > _startTime, "End time must be after start time");
        require(_maxParticipants > 0, "Max participants must be > 0");
        require(bytes(_description).length <= 500, "Description too long");
        
        require(msg.value >= eventPlatformFee, "Event platform fee required");

        Community storage c = communities[_communityId];
        c.eventIdCounter++;
        uint32 eventId = c.eventIdCounter;

        Event storage e = communityEvents[_communityId][eventId];
        e.id = eventId;
        e.description = _description;
        e.participationFeeEth = _feeEth;
        e.eventType = _eventType;
        e.startTime = _startTime;
        e.endTime = _endTime;
        e.maxParticipants = _maxParticipants;
        e.active = true;
        
        if (_eventType == EventType.SEASONAL) {
            e.isSeasonalEvent = true;
            e.seasonId = uint32(currentSeason);
        }

        uint256 transactionFee = (msg.value * TRANSACTION_FEE_PERCENTAGE) / 1000;
        platformStats.totalPlatformFees += uint128(msg.value);
        payable(owner()).transfer(msg.value);

        emit EventCreated(_communityId, eventId);
        emit TransactionFeeCharged(msg.sender, transactionFee);
        emit PlatformFeeCollected(msg.value, "Event Creation");
    }

    function participateInEvent(uint256 _communityId, uint256 _eventId) 
        external 
        payable 
        nonReentrant 
        whenNotPaused 
        validCommunity(_communityId) 
    {
        Event storage e = communityEvents[_communityId][_eventId];
        require(e.active, "Event not active");
        require(block.timestamp >= e.startTime && block.timestamp <= e.endTime, "Event not in progress");
        require(e.currentParticipants < e.maxParticipants, "Event full");
        require(_isActiveMember(_communityId, msg.sender), "Not active member");
        require(!e.participants[msg.sender], "Already participating");

        Boost storage discountBoost = userBoosts[msg.sender][BoostType.EVENT_DISCOUNT];
        bool hasDiscountBoost = discountBoost.active && discountBoost.expiresAt > block.timestamp;
        
        uint256 requiredFee = e.participationFeeEth;
        if (hasDiscountBoost) {
            requiredFee = (requiredFee * 80) / 100; // 20% discount
        }
        
        require(msg.value >= requiredFee, "Insufficient fee");

        e.participants[msg.sender] = true;
        e.currentParticipants++;
        
        Member storage m = members[_communityId][msg.sender];
        m.totalEventsParticipated++;
        
        Community storage c = communities[_communityId];
        uint256 transactionFee = (msg.value * TRANSACTION_FEE_PERCENTAGE) / 1000;
        uint256 actualPayment = msg.value - transactionFee;
        uint256 platformFee = (actualPayment * c.platformFeePercentage) / 1000;
        uint256 communityAmount = actualPayment - platformFee;
        
        c.balance += uint128(communityAmount);
        c.withdrawableBalance += uint128(communityAmount);
        e.totalPrizePool += uint128(communityAmount);
        
        platformStats.totalPlatformFees += uint128(platformFee + transactionFee);
        if (platformFee + transactionFee > 0) {
            payable(owner()).transfer(platformFee + transactionFee);
        }

        if (e.eventType == EventType.MYSTERY) {
            _handleMysteryEventParticipation(_communityId, msg.sender);
        }

        _updateMemberActivity(_communityId, msg.sender);
        platformStats.totalTransactions++;

        emit EventParticipation(_communityId, _eventId, msg.sender);
        emit TransactionFeeCharged(msg.sender, transactionFee);
    }

    function _handleMysteryEventParticipation(uint256 _communityId, address _participant) internal {
        uint256 randomValue = _generateRandomNumber();
        
        if (randomValue % 10 == 0) { // 10% chance for instant reward
            uint256 reward = 0.001 ether;
            if (address(this).balance >= reward) {
                payable(_participant).transfer(reward);
                emit MysteryBoxOpened(_participant, reward);
            }
        }
    }

    function finalizeEvent(uint256 _communityId, uint256 _eventId, address[] memory _winners, uint128[] memory _rewards) 
        external 
        onlyModerator(_communityId) 
        nonReentrant 
    {
        Event storage e = communityEvents[_communityId][_eventId];
        require(e.active, "Event not active");
        require(block.timestamp > e.endTime, "Event still in progress");
        require(_winners.length == _rewards.length, "Arrays length mismatch");
        
        e.active = false;
        e.winners = _winners;
        e.rewards = _rewards;
        
        for (uint i = 0; i < _winners.length; i++) {
            if (_rewards[i] > 0) {
                payable(_winners[i]).transfer(_rewards[i]);
                communities[_communityId].balance -= _rewards[i];
                
                Member storage m = members[_communityId][_winners[i]];
                m.totalEventsWon++;
                m.respectPoints += 100;
                
                _checkLevelUp(_communityId, _winners[i]);
                _unlockAchievement(_winners[i], AchievementType.EVENT_WINNER);
            }
        }
    }

    // --- PROPOSAL SYSTEM (From new contract) ---

    function createProposal(
        uint256 _communityId,
        string memory _description,
        uint32 _deadline
    ) external validCommunity(_communityId) returns (uint256) {
        require(_isActiveMember(_communityId, msg.sender), "Not active member");
        require(_deadline > block.timestamp, "Deadline must be in future");
        require(bytes(_description).length > 0 && bytes(_description).length <= 500, "Invalid description");
        
        uint256 proposalId = ++communityProposalCount[_communityId];
        Proposal storage p = communityProposals[_communityId][proposalId];
        
        p.id = uint32(proposalId);
        p.description = _description;
        p.deadline = _deadline;
        
        emit ProposalCreated(_communityId, proposalId);
        return proposalId;
    }

    function voteOnProposal(uint256 _communityId, uint256 _proposalId, bool _support) 
        external 
        validCommunity(_communityId) 
    {
        require(_isActiveMember(_communityId, msg.sender), "Not active member");
        
        Proposal storage p = communityProposals[_communityId][_proposalId];
        require(p.id != 0, "Proposal doesn't exist");
        require(block.timestamp < p.deadline, "Voting ended");
        require(!p.voted[msg.sender], "Already voted");
        
        p.voted[msg.sender] = true;
        
        if (_support) {
            p.votesFor++;
        } else {
            p.votesAgainst++;
        }
        
        Member storage m = members[_communityId][msg.sender];
        m.respectPoints += 5;
        _checkLevelUp(_communityId, msg.sender);
        
        emit ProposalVoted(_communityId, _proposalId, msg.sender, _support);
    }

    // --- CHALLENGES (Enhanced from base contract) ---

    function createChallenge(
        uint256 _communityId,
        address _challenged,
        string memory _description,
        uint32 _deadline
    ) external payable nonReentrant validCommunity(_communityId) {
        require(_isActiveMember(_communityId, msg.sender), "Not active member");
        require(_isActiveMember(_communityId, _challenged), "Target not active member");
        require(msg.value > 0, "Stake required");
        require(_deadline > block.timestamp, "Deadline must be in future");
        require(bytes(_description).length <= 200, "Description too long");
        
        uint256 challengeId = challengeIdCounter++;
        Challenge storage c = challenges[challengeId];
        
        c.challenger = msg.sender;
        c.challenged = _challenged;
        c.communityId = uint32(_communityId);
        c.description = _description;
        c.stakeAmount = uint128(msg.value);
        c.deadline = _deadline;
        c.active = true;
        
        emit ChallengeCreated(challengeId, msg.sender, _challenged);
    }

    function acceptChallenge(uint256 _challengeId) external payable nonReentrant {
        Challenge storage c = challenges[_challengeId];
        require(msg.sender == c.challenged, "Not challenged user");
        require(c.active, "Challenge not active");
        require(msg.value == c.stakeAmount, "Must match stake");
        require(block.timestamp < c.deadline, "Challenge expired");
        
        c.stakeAmount += uint128(msg.value);
    }

    function completeChallenge(uint256 _challengeId, address _winner) external nonReentrant {
        Challenge storage c = challenges[_challengeId];
        require(msg.sender == communities[c.communityId].creator, "Only creator can judge");
        require(c.active, "Challenge not active");
        require(_winner == c.challenger || _winner == c.challenged, "Invalid winner");
        
        c.winner = _winner;
        c.completed = true;
        c.active = false;
        
        Member storage winner = members[c.communityId][_winner];
        winner.respectPoints += 100;
        _checkLevelUp(c.communityId, _winner);
        
        payable(_winner).transfer(c.stakeAmount);
        emit ChallengeCompleted(_challengeId, _winner);
    }

    // --- INTERNAL FUNCTIONS ---

    function _processReferral(uint256 _communityId, address _referrer, address _referee) internal {
        Member storage referrer = members[_communityId][_referrer];
        referrer.referralCount++;
        
        _processRespectPointsWithBoost(_communityId, _referrer, 50);
        _processRespectPointsWithBoost(_communityId, _referee, 25);
        
        if (referrer.referralCount >= 5) {
            _unlockAchievement(_referrer, AchievementType.REFERRAL_MASTER);
        }
    }

    function _checkLevelUp(uint256 _communityId, address _user) internal {
        Member storage m = members[_communityId][_user];
        uint16 newLevel = _calculateLevel(m.respectPoints);
        
        if (newLevel > m.level) {
            m.level = newLevel;
            emit LevelUp(_user, newLevel);
            _unlockAchievement(_user, AchievementType.LEVEL_UP);
        }
    }

    function _processRespectPointsWithBoost(uint256 _communityId, address _user, uint32 _basePoints) internal {
        Member storage m = members[_communityId][_user];
        
        Boost storage expBoost = userBoosts[_user][BoostType.EXPERIENCE_MULTIPLIER];
        uint32 finalPoints = _basePoints;
        
        if (expBoost.active && expBoost.expiresAt > block.timestamp) {
            finalPoints = (finalPoints * expBoost.multiplier) / 100;
        }
        
        m.respectPoints += finalPoints;
        _checkLevelUp(_communityId, _user);
    }

    function _calculateLevel(uint32 _respectPoints) internal pure returns (uint16) {
        if (_respectPoints >= 10000) return 5;
        if (_respectPoints >= 5000) return 4;
        if (_respectPoints >= 2000) return 3;
        if (_respectPoints >= 500) return 2;
        if (_respectPoints >= 100) return 1;
        return 0;
    }

    function _unlockAchievement(address _user, AchievementType _achievement) internal {
        userAchievements[_user].push(uint256(_achievement));
        emit AchievementUnlocked(_user, _achievement);
    }

    function _isActiveMember(uint256 _communityId, address _user) internal view returns (bool) {
        Member storage m = members[_communityId][_user];
        if (m.communityId == 0) return false;
        if (m.lifetime) return true;
        return m.subscriptionExpiresAt > block.timestamp;
    }

    function _generateRandomNumber() internal returns (uint256) {
        nonce++;
        return uint256(keccak256(abi.encodePacked(block.timestamp, block.difficulty, nonce, msg.sender)));
    }

    // --- WITHDRAWAL FUNCTIONS ---

    function withdrawCommunityFunds(uint256 _communityId, uint256 _amount) external nonReentrant onlyCreator(_communityId) {
        Community storage c = communities[_communityId];
        require(_amount > 0, "Amount must be > 0");
        require(c.withdrawableBalance >= _amount, "Insufficient withdrawable balance");
        require(address(this).balance >= _amount, "Insufficient contract balance");
        
        uint256 withdrawalFee = (_amount * withdrawalFeePercentage) / 1000;
        uint256 amountAfterFee = _amount - withdrawalFee;
        
        c.withdrawableBalance -= uint128(_amount);
        c.balance -= uint128(_amount);
        
        platformStats.totalPlatformFees += uint128(withdrawalFee);
        
        payable(owner()).transfer(withdrawalFee);
        payable(msg.sender).transfer(amountAfterFee);
        
        emit FundsWithdrawn(_communityId, msg.sender, amountAfterFee, withdrawalFee);
    }

    // --- BOOST SYSTEM ---

    function purchaseBoost(BoostType _boostType, uint32 _duration) external payable nonReentrant {
        require(_duration >= 1 hours && _duration <= 30 days, "Invalid duration");
        require(msg.value >= boostPurchaseFee, "Insufficient payment");
        
        uint256 transactionFee = (msg.value * TRANSACTION_FEE_PERCENTAGE) / 1000;
        
        _awardBoost(msg.sender, _boostType, _duration);
        
        platformStats.totalPlatformFees += uint128(msg.value);
        payable(owner()).transfer(msg.value);
        
        emit BoostPurchased(msg.sender, _boostType, msg.value, _duration);
        emit TransactionFeeCharged(msg.sender, transactionFee);
    }

    function activateBoost(BoostType _boostType) external {
        Boost storage boost = userBoosts[msg.sender][_boostType];
        require(boost.expiresAt > block.timestamp, "Boost expired or not owned");
        require(!boost.active, "Boost already active");
        
        boost.active = true;
        emit BoostActivated(msg.sender, _boostType);
    }
    
    // --- ADMIN FUNCTIONS ---

    function suspendCommunity(uint256 _communityId) external onlyOwner {
        communities[_communityId].status = CommunityStatus.SUSPENDED;
        platformStats.activeCommunities--;
    }

    function reactivateCommunity(uint256 _communityId) external onlyOwner {
        communities[_communityId].status = CommunityStatus.ACTIVE;
        platformStats.activeCommunities++;
    }

    function globalBanUser(address _user) external onlyOwner {
        globalBannedUsers[_user] = true;
    }

    function globalUnbanUser(address _user) external onlyOwner {
        globalBannedUsers[_user] = false;
    }

    function banMember(uint256 _communityId, address _member) external onlyModerator(_communityId) {
        communityBannedUsers[_communityId][_member] = true;
        emit MemberBanned(_communityId, _member);
    }

    function unbanMember(uint256 _communityId, address _member) external onlyCreator(_communityId) {
        communityBannedUsers[_communityId][_member] = false;
    }

    function setMemberRole(uint256 _communityId, address _member, MemberRole _role) 
        external 
        onlyCreator(_communityId) 
    {
        require(_isActiveMember(_communityId, _member), "Not active member");
        memberRoles[_communityId][_member] = _role;
        emit MemberRoleChanged(_communityId, _member, _role);
    }

    function setPlatformFeePercentage(uint256 _communityId, uint256 _percentage) external onlyOwner {
        require(_percentage <= maxPlatformFeePercentage, "Fee too high");
        communities[_communityId].platformFeePercentage = uint16(_percentage);
    }

    function setCreationFee(uint256 _newFee) external onlyOwner {
        creationFeeEth = _newFee;
    }

    function setWithdrawalFeePercentage(uint256 _newPercentage) external onlyOwner {
        require(_newPercentage <= 100, "Fee too high"); // Max 10%
        withdrawalFeePercentage = _newPercentage;
    }

    function setAchievementUnlockFee(uint256 _newFee) external onlyOwner {
        achievementUnlockFee = _newFee;
    }

    function setBoostPurchaseFee(uint256 _newFee) external onlyOwner {
        boostPurchaseFee = _newFee;
    }

    function setEventPlatformFee(uint256 _newFee) external onlyOwner {
        eventPlatformFee = _newFee;
    }

    function startNewSeason() external onlyOwner {
        currentSeason++;
        emit SeasonalEventCreated(currentSeason, "New Season Started");
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // --- VIEW FUNCTIONS ---

    function isActiveMember(uint256 _communityId, address _user) external view returns (bool) {
        return _isActiveMember(_communityId, _user);
    }

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
    ) {
        Member storage m = members[_communityId][_member];
        return (
            m.level,
            m.respectPoints,
            m.reputation,
            m.currentStreak,
            m.longestStreak,
            m.totalEventsParticipated,
            m.totalEventsWon,
            m.mentorAddress,
            m.mentees.length
        );
    }

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
    ) {
        Community storage c = communities[_communityId];
        return (
            c.creator,
            c.name,
            c.description,
            c.joinFeeEth,
            c.monthlySubFeeEth,
            c.lifetimeSubFeeEth,
            c.balance,
            c.withdrawableBalance,
            c.totalMembers,
            c.status
        );
    }

    function getCommunityAnnouncements(uint256 _communityId) external view returns (string[] memory) {
        return communities[_communityId].announcements;
    }

    function getEventDetails(uint256 _communityId, uint256 _eventId) external view returns (
        string memory description,
        EventType eventType,
        uint32 startTime,
        uint32 endTime,
        uint32 currentParticipants,
        uint32 maxParticipants,
        uint128 totalPrizePool,
        bool active
    ) {
        Event storage e = communityEvents[_communityId][_eventId];
        return (
            e.description,
            e.eventType,
            e.startTime,
            e.endTime,
            e.currentParticipants,
            e.maxParticipants,
            e.totalPrizePool,
            e.active
        );
    }

    function getProposalDetails(uint256 _communityId, uint256 _proposalId) external view returns (
        string memory description,
        uint32 deadline,
        uint32 votesFor,
        uint32 votesAgainst,
        bool executed
    ) {
        Proposal storage p = communityProposals[_communityId][_proposalId];
        return (
            p.description,
            p.deadline,
            p.votesFor,
            p.votesAgainst,
            p.executed
        );
    }

    function getChallengeDetails(uint256 _challengeId) external view returns (
        address challenger,
        address challenged,
        uint32 communityId,
        string memory description,
        uint128 stakeAmount,
        uint32 deadline,
        bool active,
        address winner
    ) {
        Challenge storage c = challenges[_challengeId];
        return (
            c.challenger,
            c.challenged,
            c.communityId,
            c.description,
            c.stakeAmount,
            c.deadline,
            c.active,
            c.winner
        );
    }

    function getSeasonalEventDetails(uint256 _eventId) external view returns (
        string memory name,
        uint32 startTime,
        uint32 endTime,
        uint32 seasonId,
        uint128 totalPrizePool,
        bool active
    ) {
        SeasonalEvent storage se = seasonalEvents[_eventId];
        return (
            se.name,
            se.startTime,
            se.endTime,
            se.seasonId,
            se.totalPrizePool,
            se.active
        );
    }

    function getCrossVisitDetails(uint256 _visitId) external view returns (
        uint32 fromCommunityId,
        uint32 toCommunityId,
        address visitor,
        uint32 visitTime,
        uint32 duration,
        bool active
    ) {
        CrossCommunityVisit storage visit = crossVisits[_visitId];
        return (
            visit.fromCommunityId,
            visit.toCommunityId,
            visit.visitor,
            visit.visitTime,
            visit.duration,
            visit.active
        );
    }

    function getUserAchievements(address _user) external view returns (uint256[] memory) {
        return userAchievements[_user];
    }

    function getPlatformStats() external view returns (PlatformStats memory) {
        return platformStats;
    }

    function getActiveCrossVisits(address _user) external view returns (uint256[] memory) {
        uint256[] memory activeVisits = new uint256[](10);
        uint256 count = 0;
        
        for (uint256 i = 1; i < visitIdCounter && count < 10; i++) {
            if (crossVisits[i].visitor == _user && crossVisits[i].active) {
                activeVisits[count] = i;
                count++;
            }
        }
        
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = activeVisits[i];
        }
        
        return result;
    }

    function getUserBoost(address _user, BoostType _boostType) external view returns (
        BoostType boostType,
        uint32 expiresAt,
        uint16 multiplier,
        bool active
    ) {
        Boost storage boost = userBoosts[_user][_boostType];
        return (
            boost.boostType,
            boost.expiresAt,
            boost.multiplier,
            boost.active && boost.expiresAt > block.timestamp
        );
    }

    function getUserAchievementUnlocks(address _user) external view returns (AchievementUnlock[] memory) {
        return userAchievementUnlocks[_user];
    }

    function getAllPlatformFees() external view returns (
        uint256 creationFee,
        uint256 transactionFeePercentage,
        uint256 withdrawalFeePercentage,
        uint256 achievementUnlockFee,
        uint256 boostPurchaseFee,
        uint256 eventPlatformFee,
        uint256 _minMysteryBoxBet,
        uint256 _utilityBoxFee
    ) {
        return (
            creationFeeEth,
            TRANSACTION_FEE_PERCENTAGE,
            withdrawalFeePercentage,
            achievementUnlockFee,
            boostPurchaseFee,
            eventPlatformFee,
            minMysteryBoxBet,
            utilityBoxFee
        );
    }

    function getCommunityWithdrawableBalance(uint256 _communityId) external view returns (uint128) {
        return communities[_communityId].withdrawableBalance;
    }

    // --- OVERRIDE FUNCTIONS ---

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override {
        require(from == address(0) || to == address(0), "Soulbound NFT: transfers not allowed");
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}