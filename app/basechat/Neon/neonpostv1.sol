// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title NeonPostv1
 * @dev Smart contract for creating posts on Neon EVM (Solana's EVM layer)
 * @notice This contract is compatible with Neon EVM and can interact with Solana ecosystem
 * 
 * Neon EVM allows EVM contracts to:
 * - Be called by Solana wallets (via Solana Native SDK)
 * - Interact with SPL tokens
 * - Call Solana programs through composability
 * 
 * Docs: https://docs.neonevm.org/docs/quick_start
 */
contract NeonPostv1 is Ownable, Pausable {
    // Event emitted when a new post is created
    event PostCreated(
        address indexed creator,
        string contentHash,
        uint256 timestamp
    );

    // Event emitted when a tip is sent
    event TipSent(
        address indexed from,
        address indexed to,
        uint256 amount,
        string postId,
        uint256 timestamp
    );

    // Mapping to track the number of posts per user
    mapping(address => uint256) public userPostCount;

    // Mapping to track tips received per user
    mapping(address => uint256) public tipsReceived;

    // Mapping to track tips sent per user
    mapping(address => uint256) public tipsSent;

    // Total number of posts
    uint256 public totalPosts;

    // Total tips volume
    uint256 public totalTipsVolume;

    // Minimum tip amount (0.001 NEON)
    uint256 public minTipAmount = 0.001 ether;

    // Constructor that sets the deployer as the owner
    constructor() Ownable(msg.sender) {
        // Ownable is initialized with msg.sender as owner
    }

    // Function to create a new post - can only be called when contract is not paused
    function createPost(string memory contentHash) public whenNotPaused {
        // Increment the user's post count
        userPostCount[msg.sender]++;

        // Increment the total post count
        totalPosts++;

        // Emit the PostCreated event
        emit PostCreated(msg.sender, contentHash, block.timestamp);
    }

    // Function to tip a user (send NEON to post creator)
    function tipUser(address payable recipient, string memory postId) public payable whenNotPaused {
        require(msg.value >= minTipAmount, "Tip amount too low");
        require(recipient != address(0), "Invalid recipient");
        require(recipient != msg.sender, "Cannot tip yourself");

        // Transfer NEON to recipient
        (bool success, ) = recipient.call{value: msg.value}("");
        require(success, "Transfer failed");

        // Update stats
        tipsReceived[recipient] += msg.value;
        tipsSent[msg.sender] += msg.value;
        totalTipsVolume += msg.value;

        // Emit the TipSent event
        emit TipSent(msg.sender, recipient, msg.value, postId, block.timestamp);
    }

    // Function to get the post count for a specific user
    function getPostCount(address user) public view returns (uint256) {
        return userPostCount[user];
    }

    // Function to get tips received by a user
    function getTipsReceived(address user) public view returns (uint256) {
        return tipsReceived[user];
    }

    // Function to get tips sent by a user
    function getTipsSent(address user) public view returns (uint256) {
        return tipsSent[user];
    }

    // Function to set minimum tip amount - only owner can call
    function setMinTipAmount(uint256 _minTipAmount) public onlyOwner {
        minTipAmount = _minTipAmount;
    }

    // Function to pause the contract - only owner can call
    function pause() public onlyOwner {
        _pause();
    }

    // Function to unpause the contract - only owner can call
    function unpause() public onlyOwner {
        _unpause();
    }
}

