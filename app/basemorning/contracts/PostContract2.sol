// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract PostContract2 is Ownable, Pausable {
    // Event emitted when a new post is created
    event PostCreated(
        address indexed creator,
        string contentHash,
        uint256 timestamp
    );

    // Mapping to track the number of posts per user
    mapping(address => uint256) public userPostCount;
    
    // Total number of posts
    uint256 public totalPosts;

    // Constructor that sets the deployer as the owner
    constructor() {
        // Initialize contract with owner as the deployer
        // Ownable constructor is called implicitly and sets msg.sender as owner
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

    // Function to get the post count for a specific user
    function getPostCount(address user) public view returns (uint256) {
        return userPostCount[user];
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