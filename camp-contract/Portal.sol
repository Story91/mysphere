// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Portal is ERC1155, Ownable {
    string public name = "MySphere X CampNetwork";
    string public symbol = "PORTAL";
    
    uint256 public constant TOKEN_ID = 1;
    uint256 public constant NFT_PRICE = 10 * 10**18; // ✅ DODANE: 10 CAMP
    uint256 public totalClaimed = 0;
    mapping(address => bool) public hasClaimed;

    constructor()
        ERC1155("ipfs://bafkreiht6fov7q4iuu2usxorbmt5n5io7qwvigud6rudzpljik6ab36ej4")
        Ownable()
    {}

    function claim() external payable {  // ✅ DODANE: payable
        require(!hasClaimed[msg.sender], "Already claimed");
        require(msg.value >= NFT_PRICE, "Insufficient CAMP payment");  // ✅ DODANE: sprawdzanie płatności
        
        hasClaimed[msg.sender] = true;
        totalClaimed += 1;
        _mint(msg.sender, TOKEN_ID, 1, "");
    }

    function setURI(string memory newuri) external onlyOwner {
        _setURI(newuri);
    }

    // ✅ DODANE: funkcja do wypłaty CAMP
    function withdrawCAMP() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
}