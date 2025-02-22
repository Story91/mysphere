// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

contract MySphereAIQuotes is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable, IERC2981 {
    uint256 public mintPrice = 0.0001 ether;
    uint256 public royaltyFee = 500; // 5% (500/10000)
    uint256 private _nextTokenId;
    
    // System kolekcji
    struct Collection {
        string name;
        uint256[] tokenIds;
        bool isComplete;
    }
    mapping(uint256 => Collection) public collections;
    uint256 private _nextCollectionId;
    mapping(uint256 => uint256) private _tokenToCollection;
    
    // System nagród
    mapping(address => uint256) public userPoints;
    mapping(address => uint256[]) public userAchievements;
    
    event QuoteMinted(address indexed to, uint256 indexed tokenId, string uri);
    event CollectionCreated(uint256 collectionId, string name);
    event CollectionCompleted(uint256 collectionId);
    event PointsAwarded(address user, uint256 points);
    event AchievementUnlocked(address user, uint256 achievementId);

    constructor() ERC721("MySphereAIQuotes", "MS") Ownable(msg.sender) {}

    function mintTo(address to, string memory uri) public payable returns (uint256) {
        require(msg.value >= mintPrice, "Insufficient payment");
        
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        
        // Przyznaj punkty za mintowanie
        _awardPoints(to, 10);
        
        emit QuoteMinted(to, tokenId, uri);
        
        return tokenId;
    }

    // System kolekcji
    function createCollection(string memory name) public onlyOwner returns (uint256) {
        uint256 collectionId = _nextCollectionId++;
        collections[collectionId].name = name;
        emit CollectionCreated(collectionId, name);
        return collectionId;
    }

    function addToCollection(uint256 tokenId, uint256 collectionId) public onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        require(collections[collectionId].tokenIds.length < 5, "Collection is full");
        
        collections[collectionId].tokenIds.push(tokenId);
        _tokenToCollection[tokenId] = collectionId;
        
        if(collections[collectionId].tokenIds.length == 5) {
            collections[collectionId].isComplete = true;
            address owner = ownerOf(tokenId);
            _awardPoints(owner, 100);
            emit CollectionCompleted(collectionId);
        }
    }

    // System nagród
    function _awardPoints(address user, uint256 points) internal {
        userPoints[user] += points;
        emit PointsAwarded(user, points);
        _checkAchievements(user);
    }

    function _checkAchievements(address user) internal {
        if(userPoints[user] >= 100 && !_hasAchievement(user, 1)) {
            userAchievements[user].push(1);
            emit AchievementUnlocked(user, 1);
        }
        
        uint256 completedCollections = 0;
        for(uint256 i = 0; i < _nextCollectionId; i++) {
            if(collections[i].isComplete) {
                completedCollections++;
            }
        }
        if(completedCollections >= 3 && !_hasAchievement(user, 2)) {
            userAchievements[user].push(2);
            emit AchievementUnlocked(user, 2);
        }
    }

    function _hasAchievement(address user, uint256 achievementId) internal view returns (bool) {
        for(uint256 i = 0; i < userAchievements[user].length; i++) {
            if(userAchievements[user][i] == achievementId) return true;
        }
        return false;
    }

    // Standardowe funkcje
    function setMintPrice(uint256 _price) public onlyOwner {
        mintPrice = _price;
    }

    function setRoyaltyFee(uint256 _fee) public onlyOwner {
        require(_fee <= 1000, "Fee too high"); // Max 10%
        royaltyFee = _fee;
    }

    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        payable(owner()).transfer(balance);
    }

    function nextTokenIdToMint() public view returns (uint256) {
        return _nextTokenId;
    }

    function totalSupply() public view virtual override(ERC721Enumerable) returns (uint256) {
        return _nextTokenId;
    }

    function royaltyInfo(uint256, uint256 _salePrice) external view override returns (address receiver, uint256 royaltyAmount) {
        return (owner(), (_salePrice * royaltyFee) / 10000);
    }

    // Funkcja pomocnicza do sprawdzania istnienia tokenu
    function _exists(uint256 tokenId) internal view virtual returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    // Overrides wymagane przez rozszerzenia
    function _update(address to, uint256 tokenId, address auth) 
        internal 
        override(ERC721, ERC721Enumerable) 
        returns (address) 
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage, IERC165)
        returns (bool)
    {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
} 