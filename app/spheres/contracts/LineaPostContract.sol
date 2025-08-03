// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title LineaPostContract
 * @dev Smart contract dla postów na sieci Linea
 * @notice Umożliwia tworzenie postów onchain z pausable funkcjonalnością
 */
contract LineaPostContract is Ownable, Pausable {
    // Zdarzenie emitowane przy stworzeniu posta
    event PostCreated(
        address indexed creator,
        string contentHash,
        uint256 timestamp
    );

    // Mapa liczby postów per użytkownik
    mapping(address => uint256) public userPostCount;

    // Łączna liczba postów
    uint256 public totalPosts;

    // Konstruktor — kompatybilny ze starszą wersją OpenZeppelin
    constructor() {
        _transferOwnership(msg.sender);
    }

    // Tworzenie nowego posta — tylko gdy kontrakt nie jest wstrzymany
    function createPost(string memory contentHash) public whenNotPaused {
        userPostCount[msg.sender]++;
        totalPosts++;
        emit PostCreated(msg.sender, contentHash, block.timestamp);
    }

    // Pobieranie liczby postów danego użytkownika
    function getPostCount(address user) public view returns (uint256) {
        return userPostCount[user];
    }

    // Wstrzymanie działania kontraktu — tylko właściciel
    function pause() public onlyOwner {
        _pause();
    }

    // Wznowienie działania kontraktu — tylko właściciel
    function unpause() public onlyOwner {
        _unpause();
    }

    // Funkcja do pobierania całkowitej liczby postów
    function getTotalPosts() public view returns (uint256) {
        return totalPosts;
    }

    // Funkcja sprawdzająca czy kontrakt jest wstrzymany
    function isPaused() public view returns (bool) {
        return paused();
    }
}