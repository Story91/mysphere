// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * B20 - wariant ASSET - i jego fabryka-precompile.
 *
 * ===========================================================================
 * DLACZEGO WLASNY INTERFEJS, A NIE TEN Z MemoPay.sol
 * ===========================================================================
 * MemoPay potrzebuje `transferFromWithMemo` i nic wiecej; launchpad potrzebuje
 * calej ceremonii tworzenia, rol i sufitu podazy, a NIE potrzebuje memo
 * (raport integracyjny: `Memo` niesie WOLAJACEGO, czyli nas, wiec do atrybucji
 * kupujacego jest bezuzyteczne - do tego sluza wlasne zdarzenia `Bought`).
 * Osobne nazwy typow trzymaja tez artefakty Hardhata jednoznacznymi.
 *
 * Wszystkie selektory ponizej pochodza z ODCZYTU na Base mainnet, nie
 * z dokumentacji.
 */

interface IB20Asset {
    /* --- obrot --- */
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);

    /* --- ERC-2612, zeby sprzedaz szla jedna transakcja zamiast dwoch --- */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /* --- to, co asertujemy zaraz po utworzeniu --- */
    function supplyCap() external view returns (uint256);
    function hasRole(bytes32 role, address account) external view returns (bool);
}

interface IB20AssetFactory {
    /**
     * `payable` w interfejsie, ale KAZDE wei rewertuje bledem NonPayable()
     * (0x6fb1b0e9) - sprawdzone odczytem z value: 0x1. Wolamy zawsze z value: 0.
     *
     * `params` to `abi.encode(B20AssetCreateParams)`, `initCalls` to tablica
     * gotowej calldaty wykonywanej w oknie bootstrapu, czyli PRZED tym, jak
     * bramki rol zaczna cokolwiek blokowac. To jedyne okno, w ktorym da sie
     * wybic podaz tokenowi, ktory od pierwszej sekundy nie ma administratora.
     */
    function createB20(
        uint8 variant,
        bytes32 salt,
        bytes calldata params,
        bytes[] calldata initCalls
    ) external payable returns (address token);

    /** Autorytatywne wyprowadzenie adresu. Uzywamy go zamiast wklejac wzor adresu do kodu. */
    function getB20Address(uint8 variant, address deployer, bytes32 salt) external view returns (address);

    /**
     * TO, a nie `isB20`. `isB20` sprawdza sam FORMAT adresu i zwraca true takze
     * dla tokena, ktorego nie ma (potwierdzone na mainnecie, teatr T8).
     */
    function isB20Initialized(address token) external view returns (bool);
}

/**
 * Parametry wariantu ASSET.
 *
 * `initialAdmin = address(0)` przechodzi przez bramke bootstrapu - to jest
 * cala podstawa obietnicy "nikt nie dodrukuje". Wersja "utworz z adminem,
 * potem sie zrzec" zostawia okno jednej transakcji, w ktorym posiadacz klucza
 * moze dodrukowac; ta wersja tego okna nie ma.
 */
struct B20AssetCreateParams {
    uint8 version; // = 1
    string name;
    string symbol;
    address initialAdmin; // = address(0)
    uint8 decimals; // 6..18
}
