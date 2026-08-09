// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IB20Asset, IB20AssetFactory, B20AssetCreateParams} from "../interfaces/IB20Asset.sol";
import {ITokenFactory} from "../interfaces/ITokenFactory.sol";

/**
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
contract B20TokenFactory is ITokenFactory {
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

    function predictToken(bytes32 salt) external view returns (address) {
        return IB20AssetFactory(B20_FACTORY).getB20Address(VARIANT_ASSET, address(this), salt);
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
        token = IB20AssetFactory(B20_FACTORY).createB20{value: 0}(VARIANT_ASSET, salt, params, initCalls);

        // Adres musi zgadzac sie z tym, co fabryka sama wylicza dla NASZEGO
        // adresu, tego salta i tego wariantu. Zamyka to podmiane zwracanego
        // adresu i wiaze `VARIANT_ASSET` z wynikiem - bez wklejania wzoru
        // adresu do kodu.
        if (token != IB20AssetFactory(B20_FACTORY).getB20Address(VARIANT_ASSET, address(this), salt)) {
            revert WrongTokenAddress();
        }

        // isB20Initialized, a NIE isB20: isB20 sprawdza sam FORMAT adresu
        // i zwraca true takze dla tokena, ktorego nie ma.
        if (!IB20AssetFactory(B20_FACTORY).isB20Initialized(token)) revert NotB20();

        // Nieznany selektor odbija sie od precompile'a, wiec POWODZENIE tego
        // wywolania znaczy, ze stworzylismy zly wariant.
        (bool seizeExists,) = token.staticcall(abi.encodeWithSignature("SEIZE_ROLE()"));
        if (seizeExists) revert WrongVariant();

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
    }

    function _requireNoRole(address token, bytes32 role, address account) private view {
        if (IB20Asset(token).hasRole(role, account)) revert RolesAlive(role);
    }
}
