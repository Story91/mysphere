// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title AutonomousAgentWallet
 * @dev Smart wallet contract that enables AI agents to autonomously control user funds
 * while maintaining user sovereignty and security through session keys and policies
 */
contract AutonomousAgentWallet is Ownable, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;

    // --- STRUCTS ---
    struct SessionKey {
        address agentAddress;
        uint256 permissions;
        uint256 expiresAt;
        uint256 dailyLimit;
        uint256 spentToday;
        uint256 lastActivityDay;
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

    // Permission bitmasks
    uint256 public constant PERMISSION_NATIVE_TRANSFER = 1 << 0;    // 1
    uint256 public constant PERMISSION_ERC20_TRANSFER = 1 << 1;     // 2
    uint256 public constant PERMISSION_NFT_TRANSFER = 1 << 2;       // 4
    uint256 public constant PERMISSION_CONTRACT_CALL = 1 << 3;      // 8
    uint256 public constant PERMISSION_SWAP = 1 << 4;               // 16
    uint256 public constant PERMISSION_BRIDGE = 1 << 5;             // 32
    uint256 public constant PERMISSION_DEFI = 1 << 6;               // 64
    uint256 public constant PERMISSION_LIMITED = 1 << 7;            // 128

    // State variables
    uint256 public sessionKeyCounter = 1;
    mapping(address => mapping(uint256 => SessionKey)) public userSessionKeys;
    mapping(address => mapping(address => AgentPolicy)) public userAgentPolicies;
    mapping(address => uint256[]) public userSessionKeyIds;
    mapping(address => bool) public emergencyStopped;

    // Events
    event SessionKeyCreated(address indexed user, address indexed agent, uint256 indexed sessionId, uint256 permissions);
    event SessionKeyRevoked(address indexed user, address indexed agent, uint256 indexed sessionId);
    event AutonomousTransactionExecuted(address indexed user, address indexed agent, address indexed target, uint256 value, bytes data);
    event AgentPolicyUpdated(address indexed user, address indexed agent, string policyName);
    event EmergencyStopActivated(address indexed user, address indexed agent);
    event EmergencyStopDeactivated(address indexed user, address indexed agent);
    event DailyLimitUpdated(address indexed user, uint256 indexed sessionId, uint256 newLimit);

    modifier onlySessionKeyOwner(uint256 sessionId) {
        require(userSessionKeys[msg.sender][sessionId].agentAddress != address(0), "Session key does not exist");
        _;
    }

    modifier notEmergencyStopped() {
        require(!emergencyStopped[msg.sender], "Emergency stop activated");
        _;
    }

    modifier validSessionKey(uint256 sessionId) {
        SessionKey storage key = userSessionKeys[msg.sender][sessionId];
        require(key.isActive, "Session key not active");
        require(key.expiresAt > block.timestamp, "Session key expired");
        _;
    }

    /**
     * @dev Create a new session key for an AI agent
     * @param agentAddress The address of the AI agent
     * @param permissions Bitmask of permissions for the agent
     * @param duration Duration in seconds for the session key
     * @param dailyLimit Maximum ETH that can be spent per day
     */
    function createSessionKey(
        address agentAddress,
        uint256 permissions,
        uint256 duration,
        uint256 dailyLimit
    ) external whenNotPaused notEmergencyStopped returns (uint256 sessionId) {
        require(agentAddress != address(0), "Invalid agent address");
        require(duration > 0 && duration <= 365 days, "Invalid duration");
        require(dailyLimit <= 1 ether, "Daily limit too high"); // Max 1 ETH per day

        sessionId = sessionKeyCounter++;

        SessionKey storage newKey = userSessionKeys[msg.sender][sessionId];
        newKey.agentAddress = agentAddress;
        newKey.permissions = permissions;
        newKey.expiresAt = block.timestamp + duration;
        newKey.dailyLimit = dailyLimit;
        newKey.spentToday = 0;
        newKey.lastActivityDay = block.timestamp / 1 days;
        newKey.isActive = true;

        userSessionKeyIds[msg.sender].push(sessionId);

        // Create default policy if none exists
        if (userAgentPolicies[msg.sender][agentAddress].agentAddress == address(0)) {
            _createDefaultPolicy(agentAddress);
        }

        emit SessionKeyCreated(msg.sender, agentAddress, sessionId, permissions);
    }

    /**
     * @dev Execute an autonomous transaction through session key
     * @param sessionId The session key ID
     * @param target The target contract or address
     * @param value The ETH value to send
     * @param data The call data
     */
    function executeAutonomousTransaction(
        uint256 sessionId,
        address target,
        uint256 value,
        bytes calldata data
    ) external validSessionKey(sessionId) notEmergencyStopped nonReentrant returns (bool success, bytes memory result) {
        SessionKey storage key = userSessionKeys[msg.sender][sessionId];

        // Verify the agent is calling
        require(msg.sender == key.agentAddress, "Only agent can execute");

        // Check daily limit
        _updateDailySpending(key, sessionId, value);

        // Check permissions and policies
        require(_checkPermissionsAndPolicies(key, target, value, data), "Permission denied");

        // Execute the transaction
        (success, result) = payable(target).call{value: value}(data);

        require(success, "Transaction failed");

        emit AutonomousTransactionExecuted(msg.sender, key.agentAddress, target, value, data);
    }

    /**
     * @dev Revoke a session key
     * @param sessionId The session key to revoke
     */
    function revokeSessionKey(uint256 sessionId) external onlySessionKeyOwner(sessionId) {
        SessionKey storage key = userSessionKeys[msg.sender][sessionId];
        require(key.isActive, "Session key already inactive");

        key.isActive = false;

        emit SessionKeyRevoked(msg.sender, key.agentAddress, sessionId);
    }

    /**
     * @dev Emergency stop all autonomous operations
     */
    function emergencyStop() external {
        emergencyStopped[msg.sender] = true;

        // Revoke all active session keys
        uint256[] memory sessionIds = userSessionKeyIds[msg.sender];
        for (uint256 i = 0; i < sessionIds.length; i++) {
            SessionKey storage key = userSessionKeys[msg.sender][sessionIds[i]];
            if (key.isActive) {
                key.isActive = false;
                emit SessionKeyRevoked(msg.sender, key.agentAddress, sessionIds[i]);
            }
        }

        emit EmergencyStopActivated(msg.sender, msg.sender);
    }

    /**
     * @dev Deactivate emergency stop
     */
    function deactivateEmergencyStop() external {
        require(emergencyStopped[msg.sender], "Emergency stop not active");
        emergencyStopped[msg.sender] = false;

        emit EmergencyStopDeactivated(msg.sender, msg.sender);
    }

    /**
     * @dev Update agent policy
     * @param agent The agent address
     * @param policy The new policy
     */
    function updateAgentPolicy(address agent, AgentPolicy calldata policy) external {
        require(policy.agentAddress == agent, "Agent address mismatch");

        userAgentPolicies[msg.sender][agent] = policy;

        emit AgentPolicyUpdated(msg.sender, agent, policy.name);
    }

    /**
     * @dev Update daily limit for a session key
     * @param sessionId The session key ID
     * @param newLimit The new daily limit
     */
    function updateDailyLimit(uint256 sessionId, uint256 newLimit) external onlySessionKeyOwner(sessionId) {
        require(newLimit <= 1 ether, "Daily limit too high");

        userSessionKeys[msg.sender][sessionId].dailyLimit = newLimit;

        emit DailyLimitUpdated(msg.sender, sessionId, newLimit);
    }

    // --- INTERNAL FUNCTIONS ---

    function _createDefaultPolicy(address agentAddress) internal {
        address[] memory allowedContracts = new address[](0);
        bytes4[] memory allowedFunctions = new bytes4[](0);

        AgentPolicy memory defaultPolicy = AgentPolicy({
            agentAddress: agentAddress,
            name: "Default Agent Policy",
            description: "Basic autonomous trading and DeFi operations",
            maxTransactionValue: 0.1 ether,
            dailyTransactionLimit: 0.5 ether,
            allowedContracts: allowedContracts,
            allowedFunctions: allowedFunctions,
            canTransferNative: true,
            canTransferERC20: true,
            canTransferNFT: false,
            canSwap: true,
            canBridge: false,
            isActive: true
        });

        userAgentPolicies[msg.sender][agentAddress] = defaultPolicy;
    }

    function _updateDailySpending(SessionKey storage key, uint256 sessionId, uint256 value) internal {
        uint256 currentDay = block.timestamp / 1 days;

        if (key.lastActivityDay != currentDay) {
            key.spentToday = 0;
            key.lastActivityDay = currentDay;
        }

        require(key.spentToday + value <= key.dailyLimit, "Daily limit exceeded");
        key.spentToday += value;
    }

    function _checkPermissionsAndPolicies(
        SessionKey storage key,
        address target,
        uint256 value,
        bytes calldata data
    ) internal view returns (bool) {
        AgentPolicy storage policy = userAgentPolicies[msg.sender][key.agentAddress];
        require(policy.isActive, "Agent policy not active");

        // Check transaction value limits
        if (value > policy.maxTransactionValue) return false;

        // Check permissions based on transaction type
        if (value > 0 && !_hasPermission(key.permissions, PERMISSION_NATIVE_TRANSFER)) {
            return false;
        }

        // If it's a contract call, check additional permissions
        if (data.length > 0) {
            if (!_hasPermission(key.permissions, PERMISSION_CONTRACT_CALL)) {
                return false;
            }

            // Check if target is in allowed contracts (if any specified)
            if (policy.allowedContracts.length > 0) {
                bool isAllowed = false;
                for (uint256 i = 0; i < policy.allowedContracts.length; i++) {
                    if (policy.allowedContracts[i] == target) {
                        isAllowed = true;
                        break;
                    }
                }
                if (!isAllowed) return false;
            }

            // Check function signature if restrictions are in place
            if (policy.allowedFunctions.length > 0 && data.length >= 4) {
                bytes4 functionSig = bytes4(data[:4]);
                bool isAllowed = false;
                for (uint256 i = 0; i < policy.allowedFunctions.length; i++) {
                    if (policy.allowedFunctions[i] == functionSig) {
                        isAllowed = true;
                        break;
                    }
                }
                if (!isAllowed) return false;
            }
        }

        return true;
    }

    function _hasPermission(uint256 permissions, uint256 permission) internal pure returns (bool) {
        return (permissions & permission) != 0;
    }

    // --- VIEW FUNCTIONS ---

    function getSessionKey(address user, uint256 sessionId) external view returns (SessionKey memory) {
        return userSessionKeys[user][sessionId];
    }

    function getUserSessionKeys(address user) external view returns (uint256[] memory) {
        return userSessionKeyIds[user];
    }

    function getAgentPolicy(address user, address agent) external view returns (AgentPolicy memory) {
        return userAgentPolicies[user][agent];
    }

    function isEmergencyStopped(address user) external view returns (bool) {
        return emergencyStopped[user];
    }

    function canExecuteTransaction(
        address user,
        uint256 sessionId,
        address target,
        uint256 value,
        bytes calldata data
    ) external view returns (bool) {
        SessionKey storage key = userSessionKeys[user][sessionId];

        if (!key.isActive || key.expiresAt <= block.timestamp) return false;
        if (emergencyStopped[user]) return false;

        // Check daily spending
        uint256 currentDay = block.timestamp / 1 days;
        uint256 spentToday = key.lastActivityDay == currentDay ? key.spentToday : 0;
        if (spentToday + value > key.dailyLimit) return false;

        return _checkPermissionsAndPolicies(key, target, value, data);
    }

    // --- OWNER FUNCTIONS ---

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // --- RECEIVE FUNCTION ---

    receive() external payable {}
}
