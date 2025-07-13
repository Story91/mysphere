// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract HybridCommunityPlatform is ERC721URIStorage, Ownable, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;

    // --- ENUMS ---
    enum MemberRole { MEMBER, MODERATOR, ADMIN }
    enum EventType { STANDARD, COMPETITION, MYSTERY }
    enum CommunityStatus { ACTIVE, SUSPENDED, CLOSED }
    enum AchievementType { FIRST_JOIN, LEVEL_UP, EVENT_WINNER, REFERRAL_MASTER, STREAK_KEEPER }
    enum BoostType { EXPERIENCE_MULTIPLIER, REPUTATION_MULTIPLIER, EVENT_DISCOUNT }

    // --- STRUCTS ---
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



    // --- STATE VARIABLES ---
    uint256 public communityIdCounter = 1;
    uint256 public membershipTokenIdCounter = 1;

    // Mappings
    mapping(uint256 => Community) public communities;
    mapping(uint256 => mapping(address => Member)) public members;
    mapping(uint256 => mapping(uint256 => Event)) private communityEvents;
    mapping(address => bool) public globalBannedUsers;
    mapping(uint256 => mapping(address => bool)) public communityBannedUsers;
    mapping(uint256 => mapping(address => MemberRole)) public memberRoles;
    mapping(address => uint256[]) public userAchievements;
    mapping(uint256 => mapping(address => uint256)) public memberRatings;
    mapping(address => mapping(BoostType => Boost)) public userBoosts;

    // --- UTILITY REWARDS MAPPINGS ---
    mapping(address => uint256) public streakSavers;
    mapping(address => uint256) public achievementVouchers;

    // Platform settings
    uint256 public creationFeeEth = 0.01 ether;
    uint256 public defaultPlatformFeePercentage = 25; // 2.5%
    uint256 public maxPlatformFeePercentage = 100; // 10%
    
    // --- UTILITY BOX STATE VARIABLES ---
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
    event UtilityBoxOpened(address indexed user, string prizeType, uint256 value);
    event StreakSaverWon(address indexed user, uint256 newTotal);
    event StreakSaverUsed(address indexed user, uint256 streakPreserved);
    event AchievementVoucherWon(address indexed user, uint256 newTotal);
    event AchievementVoucherUsed(address indexed user, AchievementType achievementType);
    event MentorAssigned(uint256 indexed communityId, address indexed mentor, address indexed mentee);
    event MentorshipCompleted(uint256 indexed communityId, address indexed mentor, address indexed mentee);
    event CollectibleMinted(address indexed recipient, uint256 indexed tokenId, string category);
    event MemberRated(uint256 indexed communityId, address indexed rated, address indexed rater, uint256 rating);
    event BoostPurchased(address indexed user, BoostType boostType, uint256 fee, uint32 duration);
    event BoostActivated(address indexed user, BoostType boostType);


    // --- MODIFIERS ---
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
    function createCommunity(
        string memory _name,
        string memory _description,
        uint64 _joinFeeEth,
        uint64 _monthlySubFeeEth,
        uint64 _lifetimeSubFeeEth
    ) external payable whenNotPaused nonReentrant returns (uint256) {
        require(msg.value >= creationFeeEth, "ICF");
        require(bytes(_name).length > 0 && bytes(_name).length <= 100, "INL");
        require(bytes(_description).length <= 500, "DTL");

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

        require(msg.value >= totalFee, "IF");

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
    }

    // --- UTILITY BOX ---
    function setUtilityBoxFee(uint256 _newFee) external onlyOwner {
        require(_newFee > 0, "FGZ");
        utilityBoxFee = _newFee;
    }
    
    function setUtilityBoxNftUri(string memory _newUri) external onlyOwner {
        utilityBoxNftUri = _newUri;
    }
    
    function openUtilityBox(uint256 _communityId) external payable nonReentrant whenNotPaused {
        require(msg.value == utilityBoxFee, "IFU");
        require(_isActiveMember(_communityId, msg.sender), "NAM");

        uint256 randomValue = _generateRandomNumber();
        uint256 rand = randomValue % 100;

        if (rand < 1) {
            _mintUtilityBoxNft(msg.sender);
        } else if (rand < 5) {
            achievementVouchers[msg.sender]++;
            emit AchievementVoucherWon(msg.sender, achievementVouchers[msg.sender]);
        } else if (rand < 15) {
            streakSavers[msg.sender]++;
            emit StreakSaverWon(msg.sender, streakSavers[msg.sender]);
        } else if (rand < 20) {
             _awardBoost(msg.sender, BoostType(randomValue % 3), 3 days);
        } else if (rand < 30) {
             _awardBoost(msg.sender, BoostType(randomValue % 3), 1 days);
        } else if (rand < 50) {
            _processRespectPointsWithBoost(_communityId, msg.sender, 25);
            emit UtilityBoxOpened(msg.sender, "Respect Points", 25);
        } else if (rand < 70) {
            _processRespectPointsWithBoost(_communityId, msg.sender, 5);
            emit UtilityBoxOpened(msg.sender, "Respect Points", 5);
        } else {
            emit UtilityBoxOpened(msg.sender, "Nothing", 0);
        }

        platformStats.totalPlatformFees += uint128(msg.value);
        payable(owner()).transfer(msg.value);
    }

    // --- ACHIEVEMENT SYSTEM ---
    function unlockPremiumAchievement(AchievementType _achievementType) external payable nonReentrant {
        require(msg.value >= achievementUnlockFee, "IP");
        _unlockPremiumLogic(_achievementType);
        
        platformStats.totalPlatformFees += uint128(msg.value);
        payable(owner()).transfer(msg.value);
        emit PremiumAchievementUnlocked(msg.sender, _achievementType, msg.value);
    }
    
    function useAchievementVoucher(AchievementType _achievementType) external nonReentrant {
        require(achievementVouchers[msg.sender] > 0, "NAV");
        achievementVouchers[msg.sender]--;
        _unlockPremiumLogic(_achievementType);
        emit AchievementVoucherUsed(msg.sender, _achievementType);
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

    function completeMentorship(uint256 _communityId) external validCommunity(_communityId) {
        require(_isActiveMember(_communityId, msg.sender), "NAM");
        Member storage mentee = members[_communityId][msg.sender];
        require(mentee.mentorAddress != address(0), "NMA");
        
        address mentorAddress = mentee.mentorAddress;
        Member storage mentor = members[_communityId][mentorAddress];
        
        _processRespectPointsWithBoost(_communityId, mentorAddress, 50);
        _processRespectPointsWithBoost(_communityId, msg.sender, 25);
        
        mentee.mentorAddress = address(0);
        
        for (uint256 i = 0; i < mentor.mentees.length; i++) {
            if (mentor.mentees[i] == msg.sender) {
                mentor.mentees[i] = mentor.mentees[mentor.mentees.length - 1];
                mentor.mentees.pop();
                break;
            }
        }
        
        emit MentorshipCompleted(_communityId, mentorAddress, msg.sender);
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
        m.reputation = uint16((m.ratingSum * 100) / (m.totalRatings * 5));

        memberRatings[_communityId][msg.sender] = _rating;
        emit MemberRated(_communityId, _member, msg.sender, _rating);
    }



    // --- EVENTS SYSTEM ---
    function createEvent(
        uint256 _communityId,
        string memory _description,
        uint64 _feeEth,
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

        uint256 transactionFee = (msg.value * TRANSACTION_FEE_PERCENTAGE) / 1000;
        platformStats.totalPlatformFees += uint128(msg.value);
        payable(owner()).transfer(msg.value);

        emit EventCreated(_communityId, eventId);
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
            requiredFee = (requiredFee * 80) / 100;
        }
        
        require(msg.value >= requiredFee, "Insufficient fee");

        e.participants[msg.sender] = true;
        e.participantsList.push(msg.sender);
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

        _updateMemberActivity(_communityId, msg.sender);
        platformStats.totalTransactions++;

        emit EventParticipation(_communityId, _eventId, msg.sender);
    }



    function finalizeEvent(uint256 _communityId, uint256 _eventId) 
        external 
        onlyModerator(_communityId) 
        nonReentrant 
    {
        Event storage e = communityEvents[_communityId][_eventId];
        require(e.active, "Event not active");
        require(block.timestamp > e.endTime, "Event still in progress");
        require(e.currentParticipants > 0, "No participants");
        
        e.active = false;
        
        // Równy podział puli nagród między wszystkich uczestników
        uint128 rewardPerParticipant = e.totalPrizePool / e.currentParticipants;
        
        // Wypłać każdemu uczestnikowi równą część
        for (uint256 i = 0; i < e.participantsList.length; i++) {
            address participant = e.participantsList[i];
            payable(participant).transfer(rewardPerParticipant);
            
            Member storage m = members[_communityId][participant];
            m.totalEventsWon++;
            m.respectPoints += 50; // Wszyscy dostają punkty, ale mniej niż wcześniej
            
            _checkLevelUp(_communityId, participant);
            _unlockAchievement(participant, AchievementType.EVENT_WINNER);
        }
        
        communities[_communityId].balance -= e.totalPrizePool;
    }

    // --- INTERNAL FUNCTIONS ---
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
    }

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
        require(_newPercentage <= 100, "Fee too high");
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
        uint64 joinFeeEth,
        uint64 monthlySubFeeEth,
        uint64 lifetimeSubFeeEth,
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