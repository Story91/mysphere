// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


/**
 * @title IPMarketV4
 * @dev Simple marketplace with IP access features - combines IPMarketV4Access with marketplace functions
 */
contract IPMarketV4 is ReentrancyGuard, Ownable {

    // ========== MARKETPLACE STRUCTURES ==========
    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;
        uint256 royaltyBps;
        address paymentToken;
        bool isActive;
        uint256 listedAt;
        bool commercialUse;
        bool derivativeWorks;
        uint256 licenseDuration;
    }

    struct Offer {
        address buyer;
        uint256 price;
        uint256 duration;
        bool isActive;
    }

    // ========== IP ACCESS STRUCTURES ==========
    struct LicenseTerms {
        uint256 price;
        uint256 duration;
        uint256 royaltyBps;
        address paymentToken;
    }

    struct AccessInfo {
        uint256 expiryTime;
        uint256 periodsRemaining;
        bool hasAccess;
    }

    struct IPMetadata {
        string contentHash;
        string uri;
        uint256 parentId;
        uint8 dataStatus;
        address creator;
    }



    // ========== STATE VARIABLES ==========
    uint256 private _listingIdCounter;
    uint256 private _tokenIdCounter;
    uint256 public platformFeeBps = 250; // 2.5%

    // Marketplace mappings
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Offer[]) public offers;
    // Escrow for offers (wei): listingId => offerIndex => amount
    mapping(uint256 => mapping(uint256 => uint256)) private offerEscrow;
    mapping(address => uint256[]) public userListings;

    // IP Access mappings
    mapping(uint256 => IPMetadata) public ipMetadata;
    mapping(uint256 => LicenseTerms) public licenseTerms;
    mapping(uint256 => mapping(address => AccessInfo)) public accessInfo;
    mapping(uint256 => address) public tokenCreators;
    mapping(uint256 => string) public contentHashes;
    mapping(address => uint256[]) public userUploads;
    mapping(address => bool) public authorizedMinters;
    mapping(address => uint256) public userEarnings;
    // Accrued platform fees (pull-payment by owner)
    uint256 public platformFeesAccrued;
    // Pending returns for overbid/cancelled offers/bids
    mapping(address => uint256) public pendingReturns;

    // IP ERC721 collection used for owner-based checks for terms/access
    address public ipNftContract;



    // ========== EVENTS ==========
    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 tokenId, uint256 price);
    event ListingCancelled(uint256 indexed listingId);
    event ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price);
    event OfferMade(uint256 indexed listingId, address indexed buyer, uint256 price);
    event OfferAccepted(uint256 indexed listingId, uint256 offerIndex);
    event OfferCancelled(uint256 indexed listingId, uint256 indexed offerIndex, address indexed buyer, uint256 amount);
    // Auctions
    event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 tokenId, uint256 minPrice, uint256 endTime);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionFinalized(uint256 indexed auctionId, address indexed winner, uint256 amount, bool sold);
    event AuctionCancelled(uint256 indexed auctionId);
    event IPNFTMinted(uint256 indexed tokenId, address indexed creator, string contentHash, uint256 parentId);
    event AccessPurchased(uint256 indexed tokenId, address indexed buyer, uint256 periods, uint256 expiryTime);
    event AccessRenewed(uint256 indexed tokenId, address indexed user, uint256 additionalPeriods, uint256 newExpiryTime);
    event LicenseTermsUpdated(uint256 indexed tokenId, uint256 price, uint256 duration, uint256 royaltyBps);
    event DataDeleteRequested(uint256 indexed tokenId, address indexed requester);

    constructor() Ownable() {  // ✅ POPRAWIONE: BEZ argumentu!
    authorizedMinters[msg.sender] = true;
    }   

    function setIpNftContract(address _ipNftContract) external onlyOwner {
        ipNftContract = _ipNftContract;
    }

    // ========== MODIFIERS ==========
    modifier onlyOwnerOf(address nftContract, uint256 tokenId) {
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not token owner");
        _;
    }

    // ========== MARKETPLACE FUNCTIONS ==========
    
    /**
     * @dev Create a listing for an NFT
     */
    function createListing(
        address _nftContract,
        uint256 _tokenId,
        uint256 _price,
        uint256 _royaltyBps,
        address _paymentToken,
        bool _commercialUse,
        bool _derivativeWorks,
        uint256 _licenseDuration
    ) external nonReentrant returns (uint256) {
        require(_price > 0, "Price=0");
        require(_royaltyBps <= 1000, "Royalty>10%");

        // Verify ownership for external NFTs
        if (_nftContract != address(this)) {
            IERC721 nft = IERC721(_nftContract);
            require(nft.ownerOf(_tokenId) == msg.sender, "Not token owner");
            require(
                nft.getApproved(_tokenId) == address(this) || 
                nft.isApprovedForAll(msg.sender, address(this)),
                "Marketplace not approved"
            );
        } else {
            // For internal IP NFTs
            require(tokenCreators[_tokenId] == msg.sender, "Not token creator");
        }

        // Check if NFT has an active auction
        for (uint256 i = 1; i <= auctionCount; i++) {
            if (auctions[i].nftContract == _nftContract && 
                auctions[i].tokenId == _tokenId && 
                auctions[i].active) {
                revert("NFT has active auction - cancel it first");
            }
        }

        _listingIdCounter++;
        uint256 listingId = _listingIdCounter;

        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: _nftContract,
            tokenId: _tokenId,
            price: _price,
            royaltyBps: _royaltyBps,
            paymentToken: _paymentToken,
            isActive: true,
            listedAt: block.timestamp,
            commercialUse: _commercialUse,
            derivativeWorks: _derivativeWorks,
            licenseDuration: _licenseDuration
        });

        userListings[msg.sender].push(listingId);
        emit ListingCreated(listingId, msg.sender, _tokenId, _price);

        return listingId;
    }

    /**
     * @dev Buy an NFT
     */
    function buyNFT(uint256 _listingId) external payable nonReentrant {
        Listing storage listing = listings[_listingId];
        require(listing.isActive, "Listing not active");
        require(msg.sender != listing.seller, "Cannot buy own NFT");

        uint256 price = listing.price;
        // Native ETH-only flow for safety and simplicity
        require(listing.paymentToken == address(0), "Native payments only");
        require(msg.value == price, "Wrong ETH amount");
        // Verify current ownership for external NFTs
        if (listing.nftContract != address(this)) {
            require(IERC721(listing.nftContract).ownerOf(listing.tokenId) == listing.seller, "Seller no longer owner");
        }
        uint256 platformFee = (price * platformFeeBps) / 10000;
        platformFeesAccrued += platformFee;
        userEarnings[listing.seller] += (price - platformFee);

        // Transfer NFT if external
        if (listing.nftContract != address(this)) {
            IERC721(listing.nftContract).safeTransferFrom(
                listing.seller,
                msg.sender,
                listing.tokenId
            );
        } else {
            // For internal IP NFTs, transfer ownership
            tokenCreators[listing.tokenId] = msg.sender;
        }

        listing.isActive = false;

        // Clean up any zombie auctions for this NFT
        for (uint256 i = 1; i <= auctionCount; i++) {
            if (auctions[i].nftContract == listing.nftContract && 
                auctions[i].tokenId == listing.tokenId && 
                auctions[i].active) {
                // Return highest bid to bidder if exists
                if (auctions[i].highestBidder != address(0)) {
                    pendingReturns[auctions[i].highestBidder] += auctions[i].highestBid;
                }
                auctions[i].active = false;
                emit AuctionCancelled(i);
            }
        }

        emit ListingSold(_listingId, msg.sender, price);
    }

    /**
     * @dev Cancel a listing
     */
    function cancelListing(uint256 _listingId) external nonReentrant {
        Listing storage listing = listings[_listingId];
        require(listing.isActive, "Listing not active");
        require(listing.seller == msg.sender, "Not the seller");
        // Disallow cancel if any active offers exist
        Offer[] storage os = offers[_listingId];
        for (uint256 i = 0; i < os.length; i++) {
            if (os[i].isActive) revert("Active offers exist");
        }
        listing.isActive = false;
        emit ListingCancelled(_listingId);
    }

    /**
     * @dev Make an offer on a listing
     */
    function makeOffer(
        uint256 _listingId,
        uint256 _price,
        uint256 _duration
    ) external payable nonReentrant {
        Listing storage listing = listings[_listingId];
        require(listing.isActive, "Listing not active");
        require(listing.paymentToken == address(0), "Native payments only");
        require(_price > 0 && msg.value == _price, "Invalid offer value");

        offers[_listingId].push(Offer({
            buyer: msg.sender,
            price: _price,
            duration: _duration,
            isActive: true
        }));
        uint256 idx = offers[_listingId].length - 1;
        offerEscrow[_listingId][idx] = _price;

        emit OfferMade(_listingId, msg.sender, _price);
    }

    /**
     * @dev Accept an offer
     */
    function acceptOffer(uint256 _listingId, uint256 _offerIndex) external nonReentrant {
        Listing storage listing = listings[_listingId];
        require(listing.isActive, "Listing not active");
        require(listing.seller == msg.sender, "Not the seller");

        Offer storage offer = offers[_listingId][_offerIndex];
        require(offer.isActive, "Offer not active");

        require(listing.paymentToken == address(0), "Native payments only");
        // Ensure seller still owns the NFT for external collections
        if (listing.nftContract != address(this)) {
            require(IERC721(listing.nftContract).ownerOf(listing.tokenId) == msg.sender, "Seller no longer owner");
        }
        uint256 amount = offerEscrow[_listingId][_offerIndex];
        require(amount == offer.price && amount > 0, "Escrow missing");

        uint256 platformFee = (amount * platformFeeBps) / 10000;
        platformFeesAccrued += platformFee;
        userEarnings[msg.sender] += (amount - platformFee);

        // Transfer NFT
        if (listing.nftContract != address(this)) {
            IERC721(listing.nftContract).safeTransferFrom(
                msg.sender,
                offer.buyer,
                listing.tokenId
            );
        } else {
            tokenCreators[listing.tokenId] = offer.buyer;
        }

        listing.isActive = false;
        offer.isActive = false;
        offerEscrow[_listingId][_offerIndex] = 0;
        emit OfferAccepted(_listingId, _offerIndex);
    }

    /**
     * @dev Cancel an active offer and move escrow to pending returns for the buyer
     */
    function cancelOffer(uint256 _listingId, uint256 _offerIndex) external nonReentrant {
        Offer storage ofr = offers[_listingId][_offerIndex];
        require(ofr.isActive, "Offer not active");
        require(ofr.buyer == msg.sender, "Not buyer");
        ofr.isActive = false;
        uint256 amount = offerEscrow[_listingId][_offerIndex];
        offerEscrow[_listingId][_offerIndex] = 0;
        pendingReturns[msg.sender] += amount;
        emit OfferCancelled(_listingId, _offerIndex, msg.sender, amount);
    }



    function getListingCount() external view returns (uint256) {
        return _listingIdCounter;
    }

    function getOfferCount(uint256 _listingId) external view returns (uint256) {
        return offers[_listingId].length;
    }



    // ========== IP ACCESS FUNCTIONS (from SimpleIPNFTAccess) ==========



    function registerIpNFT(
        string memory source,
        uint256 deadline,
        LicenseTerms memory license,
        string memory uri,
        string memory fileKey,
        uint256 parentId
    ) external nonReentrant returns (uint256) {
        require(block.timestamp <= deadline, "Registration deadline passed");
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;

        string memory generatedContentHash = string(abi.encodePacked(keccak256(abi.encodePacked(source, fileKey))));
        ipMetadata[newTokenId] = IPMetadata({
            contentHash: generatedContentHash,
            uri: uri,
            parentId: parentId,
            dataStatus: 0,
            creator: msg.sender
        });
        licenseTerms[newTokenId] = license;
        tokenCreators[newTokenId] = msg.sender;
        contentHashes[newTokenId] = generatedContentHash;
        userUploads[msg.sender].push(newTokenId);

        emit IPNFTMinted(newTokenId, msg.sender, generatedContentHash, parentId);
        return newTokenId;
    }

    function _applyAccess(uint256 tokenId, uint256 periods) internal {
        require(periods > 0, "Invalid period count");
        require(ipMetadata[tokenId].dataStatus == 0, "Token not active");

        LicenseTerms storage t = licenseTerms[tokenId];
        AccessInfo storage a = accessInfo[tokenId][msg.sender];
        if (a.expiryTime > block.timestamp) {
            a.expiryTime += t.duration * periods;
            a.periodsRemaining += periods;
        } else {
            a.expiryTime = block.timestamp + (t.duration * periods);
            a.periodsRemaining = periods;
            a.hasAccess = true;
        }

        uint256 total = t.price * periods;
        uint256 platformFee = (total * platformFeeBps) / 10000;
        uint256 creatorAmount = total - platformFee - ((total * t.royaltyBps) / 10000);
        userEarnings[tokenCreators[tokenId]] += creatorAmount;
        platformFeesAccrued += platformFee;

        emit AccessPurchased(tokenId, msg.sender, periods, a.expiryTime);
    }

    function buyAccess(uint256 tokenId, uint256 periods) external payable nonReentrant {
        LicenseTerms storage t = licenseTerms[tokenId];
        uint256 total = t.price * periods;
        require(t.paymentToken == address(0), "Native payments only");
        require(msg.value == total, "Wrong payment");
        _applyAccess(tokenId, periods);
    }



    function renewAccess(uint256 tokenId, uint256 periods) external payable nonReentrant {
        require(accessInfo[tokenId][msg.sender].hasAccess, "No existing access");
        LicenseTerms storage t = licenseTerms[tokenId];
        uint256 total = t.price * periods;
        require(t.paymentToken == address(0), "Native payments only");
        require(msg.value == total, "Wrong payment");
        _applyAccess(tokenId, periods);
        emit AccessRenewed(tokenId, msg.sender, periods, accessInfo[tokenId][msg.sender].expiryTime);
    }

    // Owner-based versions without passing owner address (resolved on-chain via ipNftContract)
    function buyAccessOwner(uint256 tokenId, uint256 periods) external payable nonReentrant {
        require(periods > 0, "Periods=0");
        require(ipNftContract != address(0), "IP NFT contract not set");
        LicenseTerms storage t = licenseTerms[tokenId];
        require(t.price > 0 && t.duration > 0, "Terms not set");
        require(t.paymentToken == address(0), "Native payments only");
        uint256 total = t.price * periods;
        require(msg.value == total, "Wrong payment");

        address actualOwner = IERC721(ipNftContract).ownerOf(tokenId);
        uint256 fee = (total * platformFeeBps) / 10000;
        platformFeesAccrued += fee;
        userEarnings[actualOwner] += (total - fee);

        AccessInfo storage a = accessInfo[tokenId][msg.sender];
        uint256 base = a.expiryTime > block.timestamp ? a.expiryTime : block.timestamp;
        a.expiryTime = base + (t.duration * periods);
        a.periodsRemaining += periods;
        a.hasAccess = true;

        emit AccessPurchased(tokenId, msg.sender, periods, a.expiryTime);
    }

    function renewAccessOwner(uint256 tokenId, uint256 periods) external payable nonReentrant {
        require(periods > 0, "Periods=0");
        require(ipNftContract != address(0), "IP NFT contract not set");
        LicenseTerms storage t = licenseTerms[tokenId];
        require(t.price > 0 && t.duration > 0, "Terms not set");
        require(t.paymentToken == address(0), "Native payments only");
        uint256 total = t.price * periods;
        require(msg.value == total, "Wrong payment");

        address actualOwner = IERC721(ipNftContract).ownerOf(tokenId);
        uint256 fee = (total * platformFeeBps) / 10000;
        platformFeesAccrued += fee;
        userEarnings[actualOwner] += (total - fee);

        AccessInfo storage a = accessInfo[tokenId][msg.sender];
        uint256 base = a.expiryTime > block.timestamp ? a.expiryTime : block.timestamp;
        a.expiryTime = base + (t.duration * periods);
        a.periodsRemaining += periods;
        a.hasAccess = true;

        emit AccessRenewed(tokenId, msg.sender, periods, a.expiryTime);
    }

    // Overloads that route earnings to current owner (passed from UI)
    function buyAccess(uint256 tokenId, uint256 periods, address ownerNft) external payable nonReentrant {
        require(periods > 0, "Periods=0");
        LicenseTerms storage t = licenseTerms[tokenId];
        uint256 total = t.price * periods;
        require(t.price > 0 && t.duration > 0, "Terms not set");
        require(t.paymentToken == address(0), "Native payments only");
        require(msg.value == total, "Wrong payment");
        require(ipNftContract != address(0), "IP NFT contract not set");
        address actualOwner = IERC721(ipNftContract).ownerOf(tokenId);
        require(ownerNft == actualOwner, "Invalid owner");

        uint256 fee = (total * platformFeeBps) / 10000;
        platformFeesAccrued += fee;
        userEarnings[actualOwner] += (total - fee);

        AccessInfo storage a = accessInfo[tokenId][msg.sender];
        uint256 base = a.expiryTime > block.timestamp ? a.expiryTime : block.timestamp;
        a.expiryTime = base + (t.duration * periods);
        a.periodsRemaining += periods;
        a.hasAccess = true;

        emit AccessPurchased(tokenId, msg.sender, periods, a.expiryTime);
    }

    function renewAccess(uint256 tokenId, uint256 periods, address ownerNft) external payable nonReentrant {
        require(periods > 0, "Periods=0");
        LicenseTerms storage t = licenseTerms[tokenId];
        uint256 total = t.price * periods;
        require(t.price > 0 && t.duration > 0, "Terms not set");
        require(t.paymentToken == address(0), "Native payments only");
        require(msg.value == total, "Wrong payment");
        require(ipNftContract != address(0), "IP NFT contract not set");
        address actualOwner = IERC721(ipNftContract).ownerOf(tokenId);
        require(ownerNft == actualOwner, "Invalid owner");

        uint256 fee = (total * platformFeeBps) / 10000;
        platformFeesAccrued += fee;
        userEarnings[actualOwner] += (total - fee);

        AccessInfo storage a = accessInfo[tokenId][msg.sender];
        uint256 base = a.expiryTime > block.timestamp ? a.expiryTime : block.timestamp;
        a.expiryTime = base + (t.duration * periods);
        a.periodsRemaining += periods;
        a.hasAccess = true;

        emit AccessRenewed(tokenId, msg.sender, periods, a.expiryTime);
    }

    // View functions
    function hasAccess(uint256 tokenId, address user) external view returns (bool) {
        AccessInfo memory a = accessInfo[tokenId][user];
        return a.hasAccess && a.expiryTime > block.timestamp;
    }

    function subscriptionExpiry(uint256 tokenId, address user) external view returns (uint256) {
        return accessInfo[tokenId][user].expiryTime;
    }

    function updateTerms(uint256 tokenId, LicenseTerms memory newTerms) external nonReentrant {
        require(ipMetadata[tokenId].dataStatus == 0, "Token not active");
        require(ipNftContract != address(0), "IP NFT contract not set");
        require(IERC721(ipNftContract).ownerOf(tokenId) == msg.sender, "Not token owner");
        licenseTerms[tokenId] = newTerms;
        emit LicenseTermsUpdated(tokenId, newTerms.price, newTerms.duration, newTerms.royaltyBps);
    }

    function requestDelete(uint256 tokenId) external nonReentrant {
        require(tokenCreators[tokenId] == msg.sender, "Not token creator");
        require(ipMetadata[tokenId].dataStatus == 0, "Already deleted/pending");
        ipMetadata[tokenId].dataStatus = 1;
        emit DataDeleteRequested(tokenId, msg.sender);
    }

    function getTerms(uint256 tokenId) external view returns (LicenseTerms memory) {
        return licenseTerms[tokenId];
    }

    function getData(uint256 tokenId) external view returns (IPMetadata memory) {
        return ipMetadata[tokenId];
    }





    // Admin functions
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
    }

    function setPlatformFee(uint256 newBps) external onlyOwner {
        require(newBps <= 1000, "Too high");
        platformFeeBps = newBps;
    }

    function withdrawEarnings() external nonReentrant {
        uint256 amount = userEarnings[msg.sender];
        require(amount > 0, "No earnings");
        userEarnings[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function withdrawPendingReturns() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingReturns[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function withdrawPlatformFees() external onlyOwner nonReentrant {
        uint256 amount = platformFeesAccrued;
        require(amount > 0, "No fees");
        platformFeesAccrued = 0;
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    // ========== AUCTIONS ==========
    struct Auction {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 minPrice;
        uint256 reservePrice; // Minimum price to actually sell
        uint256 endTime;
        address highestBidder;
        uint256 highestBid;
        uint256 bidIncrement; // Minimum amount to outbid
        bool active;
        uint256 totalBids; // Track number of bids
    }

    uint256 public auctionCount;
    mapping(uint256 => Auction) public auctions;

    function createAuction(
        address _nftContract,
        uint256 _tokenId,
        uint256 _minPrice,
        uint256 _reservePrice,
        uint256 _durationSec,
        uint256 _bidIncrement
    ) external onlyOwnerOf(_nftContract, _tokenId) nonReentrant returns (uint256) {
        require(_minPrice > 0, "Min=0");
        require(_reservePrice >= _minPrice, "Reserve < min");
        require(_durationSec >= 60 && _durationSec <= 30 days, "Duration 1min-30days");
        require(_bidIncrement >= 0, "Invalid increment");
        require(
            IERC721(_nftContract).getApproved(_tokenId) == address(this) ||
                IERC721(_nftContract).isApprovedForAll(msg.sender, address(this)),
            "Approve marketplace first"
        );

        // Check if NFT is already listed
        for (uint256 i = 1; i <= _listingIdCounter; i++) {
            if (listings[i].nftContract == _nftContract && 
                listings[i].tokenId == _tokenId && 
                listings[i].isActive) {
                revert("NFT already listed - cancel listing first");
            }
        }

        // Check if NFT already has an active auction
        for (uint256 i = 1; i <= auctionCount; i++) {
            if (auctions[i].nftContract == _nftContract && 
                auctions[i].tokenId == _tokenId && 
                auctions[i].active) {
                revert("NFT already has active auction");
            }
        }

        auctionCount += 1;
        uint256 auctionId = auctionCount;

        auctions[auctionId] = Auction({
            seller: msg.sender,
            nftContract: _nftContract,
            tokenId: _tokenId,
            minPrice: _minPrice,
            reservePrice: _reservePrice,
            endTime: block.timestamp + _durationSec,
            highestBidder: address(0),
            highestBid: 0,
            bidIncrement: _bidIncrement,
            active: true,
            totalBids: 0
        });

        emit AuctionCreated(auctionId, msg.sender, _tokenId, _minPrice, auctions[auctionId].endTime);
        return auctionId;
    }

    function bid(uint256 _auctionId) external payable nonReentrant {
        Auction storage a = auctions[_auctionId];
        require(a.active, "Not active");
        require(block.timestamp < a.endTime, "Ended");
        require(msg.sender != a.seller, "Seller cannot bid");
        
        // Check minimum bid requirements
        uint256 minBid = a.highestBid > 0 
            ? a.highestBid + a.bidIncrement 
            : a.minPrice;
        require(msg.value >= minBid, "Bid too low");

        // Return previous bid to previous bidder
        if (a.highestBidder != address(0)) {
            pendingReturns[a.highestBidder] += a.highestBid;
        }

        // Auto-extend auction if bid in last 5 minutes
        uint256 timeLeft = a.endTime - block.timestamp;
        if (timeLeft < 5 minutes) {
            a.endTime += 5 minutes;
        }

        a.highestBidder = msg.sender;
        a.highestBid = msg.value;
        a.totalBids += 1;

        emit BidPlaced(_auctionId, msg.sender, msg.value);
    }

    function finalizeAuction(uint256 _auctionId) external nonReentrant {
        Auction storage a = auctions[_auctionId];
        require(a.active, "Not active");
        require(block.timestamp >= a.endTime, "Not ended yet");

        a.active = false;

        // No bids or reserve not met
        if (a.highestBidder == address(0) || a.highestBid == 0) {
            emit AuctionFinalized(_auctionId, address(0), 0, false);
            return;
        }

        // Check if reserve price was met
        if (a.highestBid < a.reservePrice) {
            // Reserve not met - return bid to bidder
            pendingReturns[a.highestBidder] += a.highestBid;
            emit AuctionFinalized(_auctionId, address(0), a.highestBid, false);
            return;
        }

        require(IERC721(a.nftContract).ownerOf(a.tokenId) == a.seller, "Seller no longer owner");

        uint256 fee = (a.highestBid * platformFeeBps) / 10000;
        platformFeesAccrued += fee;
        userEarnings[a.seller] += (a.highestBid - fee);

        IERC721(a.nftContract).safeTransferFrom(a.seller, a.highestBidder, a.tokenId);

        // Clean up any zombie listings for this NFT
        for (uint256 i = 1; i <= _listingIdCounter; i++) {
            if (listings[i].nftContract == a.nftContract && 
                listings[i].tokenId == a.tokenId && 
                listings[i].isActive) {
                listings[i].isActive = false;
                emit ListingCancelled(i);
            }
        }

        emit AuctionFinalized(_auctionId, a.highestBidder, a.highestBid, true);
    }

    function cancelAuction(uint256 _auctionId) external nonReentrant {
        Auction storage a = auctions[_auctionId];
        require(a.active, "Not active");
        require(a.seller == msg.sender, "Not seller");
        require(a.highestBid == 0, "Has bids");
        a.active = false;
        emit AuctionCancelled(_auctionId);
    }

    // View functions removed to reduce contract size
    // Frontend can calculate these values directly from auction data
}
