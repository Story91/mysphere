// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IB20Asset, IB20AssetFactory, B20AssetCreateParams} from "../interfaces/IB20Asset.sol";
import {ITokenFactory} from "../interfaces/ITokenFactory.sol";

/**
 * FABRYKA TOKENA NA BASE, WERSJA 2 - poprawka po hardforku Cobalt.
 *
 * ===========================================================================
 * CO SIE ZEPSULO 30.09.2026 I DLACZEGO V2
 * ===========================================================================
 * `B20TokenFactory` (v1) rozpoznawala wariant SONDA SELEKTORA: jesli token
 * odpowiadal na `SEIZE_ROLE()`, uznawala go za STABLECOIN i rewertowala
 * `WrongVariant()`. Hardfork Cobalt (Base mainnet 2026-09-30, Sepolia
 * 2026-09-23) dodal "seize surface" do WSPOLNEGO interfejsu `IB20`, czyli
 * takze do wariantu ASSET - i to dla wszystkich tokenow, starych tez
 * (sprawdzone odczytem na SAUSAGES 2026-10-11). Od tej chwili KAZDY start
 * przez v1 odbija sie od `WrongVariant()`, a fabryka jest `immutable`
 * w launchpadzie - naprawa to nowa fabryka i nowe wdrozenie launchpada.
 *
 * Lekcja: sonda selektora jest zalezna od INTERFEJSU, ktory Base rozbudowuje
 * "przez dodawanie" (changelog: "new functionality ships by addition").
 * Obecnosc selektora nie jest wlasnoscia wariantu.
 *
 * V2 rozpoznaje wariant z BAJTU ADRESU. Uklad adresu B20 to czesc konsensusu:
 * `[10 B prefiks][1 B wariant][9 B hash]`, a `getB20Address(VARIANT_ASSET, ...)`
 * wiaze go juz z wynikiem. Do tego asercja, ze NIKT nie trzyma nowej roli
 * SEIZE - token jest bez admina, wiec nikt jej nie nada, a sprawdzenie
 * zamienia "nie nada" w "nie ma".
 *
 * Reszta - salt wiazany z wolajacym, mint w oknie bootstrapu, sufit podazy,
 * brak rol - bez zmian wobec v1.
 *
 * ---------------------------------------------------------------------------
 * Dalej opis z v1:
 *
 * FABRYKA TOKENA NA BASE - token robi siec, nie my.
 *
 * ===========================================================================
 * CO TU SIEDZI I SKAD SIE WZIELO
 * ===========================================================================
 * To jest `_createToken` wyjete z `CurveLaunchpad` bez zmiany ani jednej
 * asercji. Powod przeniesienia jest jeden: launchpad ma dzialac tak samo na
 * sieci, ktora B20 nie ma. Kod nie zostal przy okazji "poprawiony" - kazde
 * zdanie ponizej opisuje ten sam odczyt z mainnetu, co przedtem.
 *
 * ===========================================================================
 * DLACZEGO MSG.SENDER JEST TU WAZNIEJSZY NIZ WYGLADA
 * ===========================================================================
 * Precompile wyprowadza adres tokena z (wariant, WOLAJACY, salt). Wolajacym
 * jest TA fabryka, wiec adres zalezy od adresu fabryki - nie od launchpada
 * i nie od czlowieka. Dlatego `predictToken` pyta precompile o `address(this)`,
 * a nie o kogokolwiek innego, i dlatego wymiana fabryki na nowa zmienia adresy
 * przyszlych tokenow. To jest wlasciwe zachowanie: nowa fabryka to nowy zbior
 * tokenow, a nie kontynuacja starego pod tymi samymi adresami.
 */
contract B20TokenFactoryV2 is ITokenFactory {
    /**
     * Precompile fabryki B20. Ten sam adres na kazdej sieci Base.
     * `eth_getCode` zwraca tu pustke, bo precompile zyje w oprogramowaniu wezla,
     * a nie jako bajtkod EVM. Brak kodu NIE znaczy, ze fabryki nie ma - i wlasnie
     * dlatego nie ma tu zadnego `extcodesize`.
     */
    address public constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;

    /**
     * Wariant ASSET. Nie jest to zalozenie przyjete na slowo: `createToken`
     * sprawdza, ze token NIE MA selektora `SEIZE_ROLE()`. Konfiskata istnieje
     * w wariancie STABLECOIN, a w ASSET jej nie ma. To jest asercja, ktora
     * POTRAFI odpasc, w odroznieniu od porownania adresu z samym soba.
     */
    uint8 public constant VARIANT_ASSET = 0;

    uint8 public constant TOKEN_DECIMALS = 18;

    /**
     * Identyfikatory rol AccessControl w B20. Wyliczone z keccak256 nazwy
     * i zgodne co do bitu z odczytami z mainnetu (MINT_ROLE zaczyna sie
     * 0x154c0081 i konczy 6c3686, PAUSE_ROLE 0x139c2898 ... 816e46d). Zapisane
     * wzorem, a nie literalem, zeby nie dalo sie ich przekrecic literowka.
     */
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 public constant MINT_ROLE = keccak256("MINT_ROLE");
    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");

    error NotB20();
    error WrongVariant();
    error WrongTokenAddress();
    error RolesAlive(bytes32 role);
    error SupplyMismatch();
    error CapMismatch();

    function decimals() external pure returns (uint8) {
        return TOKEN_DECIMALS;
    }

    /**
     * Salt UZYTY NAPRAWDE. Wiaze salt z wolajacym i to jest zabezpieczenie,
     * a nie porzadkowanie.
     *
     * ATAK, KTORY TO ZAMYKA: `createToken` jest bezuprawnieniowe, a salt
     * launchpada (`launchId`) sklada sie z danych, ktore w tym samym bloku zna
     * kazdy. Napastnik widzacy oczekujace `launch()` mogl wywolac te fabryke
     * PIERWSZY z tym samym saltem, zajac adres i wywalic cudzy start.
     * `creatorNonce` nie rosnie przy rewercie, wiec grief byl powtarzalny.
     */
    function _effectiveSalt(address deployer, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(deployer, salt));
    }

    /** Adres, jaki dostanie `deployer` dla tego salta. */
    function predictTokenFor(address deployer, bytes32 salt) public view returns (address) {
        return IB20AssetFactory(B20_FACTORY).getB20Address(
            VARIANT_ASSET,
            address(this),
            _effectiveSalt(deployer, salt)
        );
    }

    function predictToken(bytes32 salt) external view returns (address) {
        return predictTokenFor(msg.sender, salt);
    }

    /**
     * Tworzenie tokena + WSZYSTKIE asercje post-warunkow.
     *
     * Czego tu NIE asertujemy i dlaczego - to jest wazniejsze od tego, co
     * asertujemy:
     *
     * - `policyId(TRANSFER_SENDER) == 0` (blocklista). Numer slotu polityki jest
     *   ENUMEM, ktorego wartosci nie odczytalismy z lancucha. Zle zgadniety numer
     *   wskazalby na INNY slot, ktory takze jest zerem - wiec asercja by przeszla
     *   i niczego nie dowiodla. Asercja, ktora nie potrafi odpasc, jest teatrem.
     *   To, co ja zastepuje, jest mocniejsze: `updatePolicy` wymaga
     *   DEFAULT_ADMIN_ROLE, ktorego nie ma u nikogo (asertowane nizej) i ktorego
     *   nie da sie odtworzyc, bo `grantRole` tez jest za ta rola.
     * - `BURN_ROLE` / `METADATA_ROLE`. Nie wiemy, czy te selektory istnieja
     *   w wariancie ASSET. Wywolanie nieistniejacej roli rewertuje, wiec asercja
     *   "na wszelki wypadek" zablokowalaby KAZDY start. Brak roli MINT i brak
     *   admina i tak zamykaja wszystko, co dotyczy podazy; METADATA pozostaje
     *   jako ryzyko, ktore ma byc NAPISANE na stronie tokena, a nie przemilczane.
     */
    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 supply,
        bytes32 salt,
        address mintTo,
        address creator
    ) external returns (address token) {
        bytes memory params = abi.encode(
            B20AssetCreateParams({
                version: 1,
                name: name,
                symbol: symbol,
                initialAdmin: address(0), // token bez wlasciciela OD PIERWSZEJ SEKUNDY
                decimals: TOKEN_DECIMALS
            })
        );

        // Wykonywane w oknie bootstrapu, czyli zanim bramki rol cokolwiek
        // zablokuja. To jedyny moment, w ktorym da sie wybic podaz tokenowi,
        // ktory nigdy nie mial administratora.
        //
        // Kolejnosc ma znaczenie: mint PRZED sufitem. Odwrotna tez przechodzi,
        // ale ta gwarantuje `supplyCap == totalSupply` niezaleznie od tego, jaki
        // sufit mial token przed nasza zmiana.
        bytes[] memory initCalls = new bytes[](2);
        initCalls[0] = abi.encodeWithSignature("mint(address,uint256)", mintTo, supply);
        initCalls[1] = abi.encodeWithSignature("updateSupplyCap(uint256)", supply);

        // value: 0 OBOWIAZKOWO - fabryka rewertuje NonPayable() (0x6fb1b0e9)
        // na kazde wei, mimo ze jej interfejs jest `payable`.
        token = IB20AssetFactory(B20_FACTORY).createB20{value: 0}(VARIANT_ASSET, _effectiveSalt(msg.sender, salt), params, initCalls);

        // Adres musi zgadzac sie z tym, co fabryka sama wylicza dla NASZEGO
        // adresu, tego salta i tego wariantu. Zamyka to podmiane zwracanego
        // adresu i wiaze `VARIANT_ASSET` z wynikiem - bez wklejania wzoru
        // adresu do kodu.
        if (token != IB20AssetFactory(B20_FACTORY).getB20Address(VARIANT_ASSET, address(this), _effectiveSalt(msg.sender, salt))) {
            revert WrongTokenAddress();
        }

        // isB20Initialized, a NIE isB20: isB20 sprawdza sam FORMAT adresu
        // i zwraca true takze dla tokena, ktorego nie ma.
        if (!IB20AssetFactory(B20_FACTORY).isB20Initialized(token)) revert NotB20();

        // Wariant z BAJTU ADRESU (uklad z konsensusu B20), a nie z sondy
        // selektora - patrz naglowek. Porownanie z `getB20Address` wyzej juz to
        // wiaze; ta linia czyni to jawnym i odporne na zmiane wzoru salta.
        if (uint8(uint160(token) >> 72) != VARIANT_ASSET) revert WrongVariant();

        if (IB20Asset(token).totalSupply() != supply) revert SupplyMismatch();
        if (IB20Asset(token).balanceOf(mintTo) != supply) revert SupplyMismatch();
        // supplyCap == totalSupply domyka "nikt nie dodrukuje" na poziomie
        // niezmiennika, a nie tylko braku roli. Dwie niezalezne przyczyny.
        if (IB20Asset(token).supplyCap() != supply) revert CapMismatch();

        // address(0) jako POSIADACZ roli tez jest sprawdzany: "rola nalezy do
        // nikogo" i "rola nalezy do adresu zerowego" to dwa rozne stany
        // i tylko pierwszy jest tym, o co nam chodzi.
        //
        // `mintTo` jest tu launchpadem, a `address(this)` fabryka - obie musza
        // wyjsc z tej funkcji bez zadnej wladzy nad tokenem, tak samo jak tworca.
        _requireNoRole(token, DEFAULT_ADMIN_ROLE, address(0));
        _requireNoRole(token, DEFAULT_ADMIN_ROLE, address(this));
        _requireNoRole(token, DEFAULT_ADMIN_ROLE, mintTo);
        _requireNoRole(token, DEFAULT_ADMIN_ROLE, B20_FACTORY);
        _requireNoRole(token, DEFAULT_ADMIN_ROLE, creator);
        _requireNoRole(token, MINT_ROLE, address(this));
        _requireNoRole(token, MINT_ROLE, mintTo);
        _requireNoRole(token, MINT_ROLE, creator);
        _requireNoRole(token, PAUSE_ROLE, address(this));
        _requireNoRole(token, PAUSE_ROLE, mintTo);
        _requireNoRole(token, PAUSE_ROLE, creator);

        // Rola SEIZE od Cobalt. Selektor moze istniec (ASSET po Cobalcie) albo
        // nie (przed Cobaltem) - oba stany sa poprawne. Jesli istnieje, nikt nie
        // moze jej trzymac: konfiskata bez posiadacza roli jest martwa.
        (bool hasSeize, bytes memory seizeRet) = token.staticcall(abi.encodeWithSignature("SEIZE_ROLE()"));
        if (hasSeize && seizeRet.length == 32) {
            bytes32 seizeRole = abi.decode(seizeRet, (bytes32));
            _requireNoRole(token, seizeRole, address(0));
            _requireNoRole(token, seizeRole, address(this));
            _requireNoRole(token, seizeRole, mintTo);
            _requireNoRole(token, seizeRole, B20_FACTORY);
            _requireNoRole(token, seizeRole, creator);
        }
    }

    function _requireNoRole(address token, bytes32 role, address account) private view {
        if (IB20Asset(token).hasRole(role, account)) revert RolesAlive(role);
    }
}
