// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

// DLACZEGO TEN PLIK LEZY W camp-contract/, a nie obok RobinhoodPostContract.ts:
// root hardhat.config.ts ma paths.sources ustawione na "./camp-contract", wiec tylko
// stad hardhat widzi zrodla przy `hardhat compile` / `hardhat run ... --network robinhood`.
// Sieci robinhood i robinhoodTestnet sa juz skonfigurowane wlasnie w root
// hardhat.config.ts, wiec trzymamy sie tej jednej konfiguracji zamiast dokladac druga.
//
// UWAGA WERSJA OPENZEPPELIN: projekt ma zainstalowane openzeppelin/contracts 4.9.x,
// gdzie Ownable() nie przyjmuje argumentu (wlascicielem zostaje msg.sender automatycznie).
// Dlatego konstruktor wyglada inaczej niz w LineaPostContract.sol, ktory byl pisany
// pod API OpenZeppelin 5.x. Wynikowe ABI jest identyczne.

/**
 * @title RobinhoodPostContract
 * @dev Kontrakt postow dla sieci Robinhood Chain (chainId 4663).
 * @notice Logika identyczna z LineaPostContract - to ten sam kontrakt postow,
 *         tylko wdrazany na innej sieci. ABI po stronie frontendu siedzi
 *         w app/basechat/Robinhood/contracts/RobinhoodPostContract.ts.
 */
contract RobinhoodPostContract is Ownable, Pausable {
    // Zdarzenie emitowane przy stworzeniu posta
    event PostCreated(
        address indexed creator,
        string contentHash,
        uint256 timestamp
    );

    // Mapa liczby postow per uzytkownik
    mapping(address => uint256) public userPostCount;

    // Laczna liczba postow
    uint256 public totalPosts;

    // Konstruktor - OpenZeppelin 4.9 ustawia msg.sender jako wlasciciela
    constructor() Ownable() {}

    // Tworzenie nowego posta - tylko gdy kontrakt nie jest wstrzymany
    function createPost(string memory contentHash) public whenNotPaused {
        userPostCount[msg.sender]++;
        totalPosts++;
        emit PostCreated(msg.sender, contentHash, block.timestamp);
    }

    // Pobieranie liczby postow danego uzytkownika
    function getPostCount(address user) public view returns (uint256) {
        return userPostCount[user];
    }

    // Wstrzymanie dzialania kontraktu - tylko wlasciciel
    function pause() public onlyOwner {
        _pause();
    }

    // Wznowienie dzialania kontraktu - tylko wlasciciel
    function unpause() public onlyOwner {
        _unpause();
    }

    // Calkowita liczba postow
    function getTotalPosts() public view returns (uint256) {
        return totalPosts;
    }

    // Czy kontrakt jest wstrzymany
    function isPaused() public view returns (bool) {
        return paused();
    }
}
