// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ITokenFactory} from "../interfaces/ITokenFactory.sol";
import {ILaunchTokenConfig, LaunchToken} from "./LaunchToken.sol";

/**
 * FABRYKA TOKENA DLA SIECI BEZ B20 (Robinhood Chain i kazda nastepna).
 *
 * ===========================================================================
 * TA SAMA OBIETNICA, INNY DOWOD
 * ===========================================================================
 * `B20TokenFactory` udowadnia brak dodruku ODCZYTEM: pyta siec o `supplyCap`
 * i o role, i rewertuje, gdy odpowiedz jest zla. Tutaj dowodem jest brak kodu -
 * `LaunchToken` nie ma funkcji, ktora dodrukuje. Zeby ta roznica nie stala sie
 * cicha, ta fabryka wykonuje DOKLADNIE TE SAME asercje po fakcie, mimo ze wie,
 * jaki bajtkod przed chwila wdrozyla.
 *
 * Nie jest to nadmiarowe. Asercja pilnuje tu czegos innego niz na Base: ze
 * `LaunchToken` wdrozony pod tym adresem to naprawde ten kontrakt, ktory
 * czytamy w repo, a nie cos, co weszlo tam wczesniej pod ten sam adres CREATE2.
 *
 * ===========================================================================
 * DLACZEGO CREATE2, A NIE ZWYKLE `new`
 * ===========================================================================
 * Zeby `predictToken(salt)` w ogole dalo sie napisac. Przy CREATE adres zalezy
 * od licznika transakcji fabryki, wiec dwa rownolegle starty w jednym bloku
 * mialyby adresy zalezne od kolejnosci w bloku - czyli od sekwencera.
 *
 * Kod tworzacy `LaunchToken` jest STALY (konstruktor bez argumentow, patrz
 * uzasadnienie w tamtym pliku), wiec adres zalezy wylacznie od (ta fabryka,
 * salt). Konfiguracje token odbiera przez `pendingConfig()` w trakcie wlasnej
 * konstrukcji.
 */
contract PlainTokenFactory is ITokenFactory, ILaunchTokenConfig {
    uint8 public constant TOKEN_DECIMALS = 18;

    struct Pending {
        string name;
        string symbol;
        uint256 supply;
        address mintTo;
    }

    /**
     * Konfiguracja widoczna dla tokena TYLKO w trakcie jego konstrukcji.
     *
     * Zapisywana tuz przed `new` i kasowana zaraz po. Poza ta jedna chwila jest
     * pusta, wiec nie ma stanu, ktory ktos moglby odczytac i wykorzystac -
     * i nie ma sciezki, w ktorej drugi token przeczyta konfiguracje pierwszego.
     */
    Pending private _pending;

    error SupplyMismatch();
    error CapMismatch();
    error ZeroSupply();

    function decimals() external pure returns (uint8) {
        return TOKEN_DECIMALS;
    }

    function pendingConfig()
        external
        view
        returns (string memory name, string memory symbol, uint256 supply, address mintTo)
    {
        Pending storage p = _pending;
        return (p.name, p.symbol, p.supply, p.mintTo);
    }

    /**
     * Salt UZYTY NAPRAWDE. Wiaze salt z wolajacym i to jest zabezpieczenie,
     * a nie porzadkowanie.
     *
     * ATAK, KTORY TO ZAMYKA: `createToken` jest bezuprawnieniowe, a salt
     * launchpada (`launchId`) sklada sie z danych, ktore w tym samym bloku zna
     * kazdy. Napastnik widzacy oczekujace `launch()` mogl wywolac te fabryke
     * PIERWSZY z tym samym saltem, zajac adres CREATE2 i wywalic cudzy start.
     * `creatorNonce` nie rosnie przy rewercie, wiec grief byl powtarzalny co
     * blok za jedna tania transakcje.
     *
     * Po wmieszaniu `msg.sender` napastnik moze zajac wylacznie adres, ktory
     * i tak nalezy do jego wlasnej przestrzeni saltow.
     */
    function _effectiveSalt(address deployer, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(deployer, salt));
    }

    /** Adres, jaki dostanie `deployer` dla tego salta. */
    function predictTokenFor(address deployer, bytes32 salt) public view returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            _effectiveSalt(deployer, salt),
                            keccak256(type(LaunchToken).creationCode)
                        )
                    )
                )
            )
        );
    }

    /**
     * Adres dla WOLAJACEGO. Launchpad wola to ze swojego kontraktu, wiec
     * dostaje swoja przestrzen; kto pyta z zewnatrz o cudzy adres, ma
     * `predictTokenFor`.
     */
    function predictToken(bytes32 salt) public view returns (address) {
        return predictTokenFor(msg.sender, salt);
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 supply,
        bytes32 salt,
        address mintTo,
        address creator
    ) external returns (address token) {
        if (supply == 0) revert ZeroSupply();

        _pending = Pending({name: name, symbol: symbol, supply: supply, mintTo: mintTo});
        token = address(new LaunchToken{salt: _effectiveSalt(msg.sender, salt)}());
        // Kasujemy natychmiast. Zwrot gazu jest tu skutkiem ubocznym - powodem
        // jest to, zeby miedzy startami nie zostawal stan, ktory cokolwiek znaczy.
        delete _pending;

        // ------------------------------------------------------------------
        // CZEGO TU NIE MA I DLACZEGO - to jest wazniejsze od tego, co jest
        // ------------------------------------------------------------------
        // `B20TokenFactory` asertuje po fakcie brak rol, bo tam token robi
        // OBCY kod (precompile) i odpowiedzi naprawde nie znamy. Tutaj token
        // robimy my, z bajtkodu skompilowanego razem z ta fabryka. Petla
        // `hasRole` byla tu w pierwszej wersji i zostala USUNIETA: `hasRole`
        // w `LaunchToken` jest `pure` i zwraca `false` literalem, wiec asercja
        // nie potrafila odpasc. Asercja, ktora nie potrafi odpasc, czyta sie
        // jak zabezpieczenie, ktorym nie jest - kompilator zreszta powiedzial
        // to wprost, ostrzegajac, ze cala sciezka moze byc `pure`.
        //
        // To, co naprawde trzyma obietnice na tej sieci, jest mocniejsze i nie
        // wymaga ani jednego odczytu: w `LaunchToken` NIE ISTNIEJE funkcja
        // zmieniajaca podaz, role ani metadane. Dowodem jest brak kodu, a nie
        // wynik wywolania.
        //
        // Zostaja trzy odczyty ponizej. One tez nie bronia przed napastnikiem -
        // sa STRAZNIKIEM REGRESJI: gdy ktos kiedys tknie `LaunchToken` i zepsuje
        // wybicie podazy, pierwszy test tej fabryki odpadnie tutaj, zamiast
        // wypuscic token z podazem u kogos innego. Tak sa nazwane i tyle o sobie
        // mowia.
        if (LaunchToken(token).totalSupply() != supply) revert SupplyMismatch();
        if (LaunchToken(token).balanceOf(mintTo) != supply) revert SupplyMismatch();
        if (LaunchToken(token).supplyCap() != supply) revert CapMismatch();

        // `creator` nie ma tu zadnego zastosowania i to jest poprawny stan
        // rzeczy: na tej sieci nie istnieje rola, ktora moglaby do niego nalezec.
        creator;
    }
}
