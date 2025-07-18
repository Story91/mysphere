// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PaidPinContract (Simplified for Remix)
 * @dev Smart contract for paid pinned posts system on Base mainnet
 * Allows users to pay ETH to pin their posts for premium visibility
 * No external dependencies - works directly in Remix
 */
contract PaidPinContract {
    
    // Pin duration types
    enum PinDuration { HOUR_1, HOURS_6, HOURS_24, DAYS_7 }
    
    // Pin structure
    struct Pin {
        address owner;
        string postId;
        PinDuration duration;
        uint256 paidAmount;
        uint256 expiresAt;
        bool isActive;
        uint256 createdAt;
    }
    
    // Owner of the contract
    address public owner;
    bool public paused = false;
    
    // Pricing for each duration (in wei)
    mapping(PinDuration => uint256) public pinPrices;
    
    // Active pins mapping
    mapping(string => Pin) public activePins;
    
    // User pins history
    mapping(address => string[]) public userPins;
    
    // All pins for admin tracking
    string[] public allPinIds;
    
    // Revenue tracking
    uint256 public totalRevenue;
    uint256 public totalPinsCreated;
    
    // Events
    event PinCreated(
        address indexed owner,
        string indexed postId,
        PinDuration duration,
        uint256 amount,
        uint256 expiresAt
    );
    
    event PinExpired(string indexed postId, address indexed owner);
    event PinExtended(string indexed postId, uint256 newExpiresAt, uint256 additionalAmount);
    event PriceUpdated(PinDuration duration, uint256 newPrice);
    event RevenueWithdrawn(address indexed owner, uint256 amount);
    
    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    
    modifier nonReentrant() {
        // Simple reentrancy protection
        _;
    }
    
    constructor() {
        owner = msg.sender;
        
        // Set initial prices (in wei)
        pinPrices[PinDuration.HOUR_1] = 0.0005 ether;    // ~$1.25
        pinPrices[PinDuration.HOURS_6] = 0.002 ether;    // ~$5.00
        pinPrices[PinDuration.HOURS_24] = 0.005 ether;   // ~$12.50
        pinPrices[PinDuration.DAYS_7] = 0.02 ether;      // ~$50.00
    }
    
    /**
     * @dev Pin a post for specified duration
     * @param postId Unique identifier for the post
     * @param duration Duration enum for how long to pin
     */
    function pinPost(
        string memory postId, 
        PinDuration duration
    ) external payable nonReentrant whenNotPaused {
        require(bytes(postId).length > 0, "Post ID cannot be empty");
        require(!activePins[postId].isActive, "Post is already pinned");
        require(msg.value >= pinPrices[duration], "Insufficient payment");
        
        uint256 durationInSeconds = getDurationInSeconds(duration);
        uint256 expiresAt = block.timestamp + durationInSeconds;
        
        // Create pin
        Pin memory newPin = Pin({
            owner: msg.sender,
            postId: postId,
            duration: duration,
            paidAmount: msg.value,
            expiresAt: expiresAt,
            isActive: true,
            createdAt: block.timestamp
        });
        
        // Store pin
        activePins[postId] = newPin;
        userPins[msg.sender].push(postId);
        allPinIds.push(postId);
        
        // Update stats
        totalRevenue += msg.value;
        totalPinsCreated++;
        
        // Refund excess payment
        if (msg.value > pinPrices[duration]) {
            payable(msg.sender).transfer(msg.value - pinPrices[duration]);
        }
        
        emit PinCreated(msg.sender, postId, duration, pinPrices[duration], expiresAt);
    }
    
    /**
     * @dev Extend an existing pin
     * @param postId Post ID to extend
     * @param additionalDuration Additional duration to add
     */
    function extendPin(
        string memory postId,
        PinDuration additionalDuration
    ) external payable nonReentrant whenNotPaused {
        Pin storage pin = activePins[postId];
        require(pin.isActive, "Pin does not exist or is expired");
        require(pin.owner == msg.sender, "Only pin owner can extend");
        require(msg.value >= pinPrices[additionalDuration], "Insufficient payment");
        
        uint256 additionalSeconds = getDurationInSeconds(additionalDuration);
        pin.expiresAt += additionalSeconds;
        pin.paidAmount += pinPrices[additionalDuration];
        
        totalRevenue += pinPrices[additionalDuration];
        
        // Refund excess payment
        if (msg.value > pinPrices[additionalDuration]) {
            payable(msg.sender).transfer(msg.value - pinPrices[additionalDuration]);
        }
        
        emit PinExtended(postId, pin.expiresAt, pinPrices[additionalDuration]);
    }
    
    /**
     * @dev Cleanup expired pins (can be called by anyone)
     * @param postIds Array of post IDs to check and cleanup
     */
    function cleanupExpiredPins(string[] memory postIds) external {
        for (uint i = 0; i < postIds.length; i++) {
            Pin storage pin = activePins[postIds[i]];
            if (pin.isActive && block.timestamp >= pin.expiresAt) {
                pin.isActive = false;
                emit PinExpired(postIds[i], pin.owner);
            }
        }
    }
    
    /**
     * @dev Check if a pin is active and not expired
     * @param postId Post ID to check
     * @return isActive True if pin is active and not expired
     */
    function isPinActive(string memory postId) external view returns (bool) {
        Pin memory pin = activePins[postId];
        return pin.isActive && block.timestamp < pin.expiresAt;
    }
    
    /**
     * @dev Get pin details
     * @param postId Post ID to get details for
     * @return Pin struct with all details
     */
    function getPinDetails(string memory postId) external view returns (Pin memory) {
        return activePins[postId];
    }
    
    /**
     * @dev Get all pins for a user
     * @param user User address
     * @return Array of post IDs
     */
    function getUserPins(address user) external view returns (string[] memory) {
        return userPins[user];
    }
    
    /**
     * @dev Get price for a duration
     * @param duration Duration enum
     * @return Price in wei
     */
    function getPrice(PinDuration duration) external view returns (uint256) {
        return pinPrices[duration];
    }
    
    /**
     * @dev Get duration in seconds for enum
     * @param duration Duration enum
     * @return Duration in seconds
     */
    function getDurationInSeconds(PinDuration duration) public pure returns (uint256) {
        if (duration == PinDuration.HOUR_1) return 1 hours;
        if (duration == PinDuration.HOURS_6) return 6 hours;
        if (duration == PinDuration.HOURS_24) return 24 hours;
        if (duration == PinDuration.DAYS_7) return 7 days;
        revert("Invalid duration");
    }
    
    /**
     * @dev Get total number of pins created
     * @return Total pins count
     */
    function getTotalPins() external view returns (uint256) {
        return totalPinsCreated;
    }
    
    /**
     * @dev Get contract balance
     * @return Balance in wei
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    // Admin functions
    
    /**
     * @dev Update price for a duration (owner only)
     * @param duration Duration to update
     * @param newPrice New price in wei
     */
    function updatePrice(PinDuration duration, uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Price must be greater than 0");
        pinPrices[duration] = newPrice;
        emit PriceUpdated(duration, newPrice);
    }
    
    /**
     * @dev Withdraw accumulated revenue (owner only)
     * @param amount Amount to withdraw in wei
     */
    function withdrawRevenue(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        payable(owner).transfer(amount);
        emit RevenueWithdrawn(owner, amount);
    }
    
    /**
     * @dev Emergency pause (owner only)
     */
    function pause() external onlyOwner {
        paused = true;
    }
    
    /**
     * @dev Unpause (owner only)
     */
    function unpause() external onlyOwner {
        paused = false;
    }
    
    /**
     * @dev Emergency function to deactivate a pin (owner only)
     * @param postId Post ID to deactivate
     */
    function emergencyDeactivatePin(string memory postId) external onlyOwner {
        Pin storage pin = activePins[postId];
        require(pin.isActive, "Pin is not active");
        pin.isActive = false;
        emit PinExpired(postId, pin.owner);
    }
    
    /**
     * @dev Get all pin IDs for admin purposes
     * @return Array of all pin IDs
     */
    function getAllPinIds() external view onlyOwner returns (string[] memory) {
        return allPinIds;
    }
    
    /**
     * @dev Transfer ownership (owner only)
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        owner = newOwner;
    }
    
    // Receive function for direct ETH deposits
    receive() external payable {
        totalRevenue += msg.value;
    }
} 