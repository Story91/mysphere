// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract BaseElementNFT is ERC721, AccessControl {
    using Counters for Counters.Counter;
    using Strings for uint256;
    
    Counters.Counter private _tokenIds;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    enum ElementType { REACTOR, STORAGE, DEFENSE_TOWER, LIVING_MODULE, TECH_LAB }
    enum Rarity { COMMON, UNCOMMON, RARE, EPIC, GENESIS }

    struct Element {
        ElementType elementType;
        Rarity rarity;
        uint8 level;
        uint256 power;
        uint256 mintedAt;
    }

    mapping(uint256 => Element) private _elements;
    mapping(address => uint256[]) private _playerElements;
    
    // Base URI for IPFS metadata  
    string private _baseTokenURI = "https://gateway.pinata.cloud/ipfs/";
    string private _metadataHash; // Hash of IPFS folder with metadata

    constructor() ERC721("Base Element", "BELEM") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function mint(
        address to,
        ElementType elementType,
        Rarity rarity,
        uint8 level
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        _safeMint(to, newTokenId);
        
        uint256 power = calculatePower(level, rarity);
        _elements[newTokenId] = Element({
            elementType: elementType,
            rarity: rarity,
            level: level,
            power: power,
            mintedAt: block.timestamp
        });

        _playerElements[to].push(newTokenId);

        return newTokenId;
    }

    function calculatePower(uint8 level, Rarity rarity) internal pure returns (uint256) {
        uint256 basePower = level * 100;
        uint256 rarityMultiplier;

        if (rarity == Rarity.EPIC) rarityMultiplier = 4;
        else if (rarity == Rarity.RARE) rarityMultiplier = 3;
        else if (rarity == Rarity.UNCOMMON) rarityMultiplier = 2;
        else rarityMultiplier = 1;

        return basePower * rarityMultiplier;
    }

    function getElement(uint256 tokenId) external view returns (Element memory) {
        require(_exists(tokenId), "Element does not exist");
        return _elements[tokenId];
    }

    function getPlayerElements(address player) external view returns (uint256[] memory) {
        return _playerElements[player];
    }

    function burn(uint256 tokenId) external {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "Not approved to burn");
        address owner = ownerOf(tokenId);
        
        // Remove from player's elements
        uint256[] storage playerTokens = _playerElements[owner];
        for (uint256 i = 0; i < playerTokens.length; i++) {
            if (playerTokens[i] == tokenId) {
                playerTokens[i] = playerTokens[playerTokens.length - 1];
                playerTokens.pop();
                break;
            }
        }

        _burn(tokenId);
        delete _elements[tokenId];
    }

    // ===== METADATA FUNCTIONS =====
    
    /**
     * @dev Returns the token URI for a given token ID
     * Generates path to IPFS metadata based on element properties (without level)
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");
        
        Element memory element = _elements[tokenId];
        
        // If we have IPFS metadata hash, use that
        if (bytes(_metadataHash).length > 0) {
            return string(abi.encodePacked(
                _baseTokenURI,
                _metadataHash,
                "/",
                _getElementFileName(element)
            ));
        }
        
        // Fallback - return base URI
        return _baseTokenURI;
    }
    
    /**
     * @dev Generate filename for IPFS metadata based on element properties
     * Format: "elementtype_rarity.json" (level is dynamic in JSON)
     */
    function _getElementFileName(Element memory element) internal pure returns (string memory) {
        return string(abi.encodePacked(
            _getElementTypeString(element.elementType),
            "_",
            _getRarityString(element.rarity),
            ".json"
        ));
    }
    
    /**
     * @dev Set the IPFS metadata hash (only admin)
     */
    function setMetadataHash(string memory hash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _metadataHash = hash;
    }
    
    /**
     * @dev Set the base URI (only admin)
     */
    function setBaseURI(string memory baseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = baseURI;
    }
    
    /**
     * @dev Get current metadata hash
     */
    function getMetadataHash() external view returns (string memory) {
        return _metadataHash;
    }
    
    /**
     * @dev Get current base URI
     */
    function getBaseURI() external view returns (string memory) {
        return _baseTokenURI;
    }
    
    // Helper functions for metadata generation
    function _getElementTypeString(ElementType elementType) internal pure returns (string memory) {
        if (elementType == ElementType.REACTOR) return "reactor";
        if (elementType == ElementType.STORAGE) return "storage";
        if (elementType == ElementType.DEFENSE_TOWER) return "defense_tower";
        if (elementType == ElementType.LIVING_MODULE) return "living_module";
        if (elementType == ElementType.TECH_LAB) return "tech_lab";
        return "unknown";
    }
    
    function _getRarityString(Rarity rarity) internal pure returns (string memory) {
        if (rarity == Rarity.COMMON) return "common";
        if (rarity == Rarity.UNCOMMON) return "uncommon";
        if (rarity == Rarity.RARE) return "rare";
        if (rarity == Rarity.EPIC) return "epic";
        if (rarity == Rarity.GENESIS) return "genesis";
        return "unknown";
    }

    // Override required by Solidity
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function totalSupply() public view returns (uint256) {
        return _tokenIds.current();
    }
} 