// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract QuotesNFT is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    struct Quote {
        string content;
        string author;
        uint256 timestamp;
    }

    mapping(uint256 => Quote) public quotes;
    mapping(address => uint256) public points;

    event QuoteMinted(address indexed owner, string quote, string author);

    constructor() ERC721("BaseBook Quotes", "BBQ") Ownable(msg.sender) {}

    function mintQuote(string memory _quote, string memory _author) public {
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        quotes[newTokenId] = Quote({
            content: _quote,
            author: _author,
            timestamp: block.timestamp
        });

        _safeMint(msg.sender, newTokenId);
        points[msg.sender] += 1;

        emit QuoteMinted(msg.sender, _quote, _author);
    }

    function getQuote(uint256 tokenId) public view returns (Quote memory) {
        return quotes[tokenId];
    }

    function getPoints(address owner) public view returns (uint256) {
        return points[owner];
    }
} 