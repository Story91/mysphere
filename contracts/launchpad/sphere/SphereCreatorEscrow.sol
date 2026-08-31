// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * SphereCreatorEscrow - IMMUTABLE, NON-CUSTODIALNY tworca SPHERE (faza 0).
 *
 * ===========================================================================
 * ROLA
 * ===========================================================================
 * Ten kontrakt wola `launchVanity` i przez to staje sie `creatorOf[SPHERE]`
 * NA ZAWSZE - po graduacji cala dzialka tworcy (hook + LP, w ETH i w tokenie)
 * plynie tutaj przez `claimEthFor`/`claimTokenFor`, a fee z krzywej przez
 * `claimFor` (escrow jest tez jednym z `_feeReceivers`). Dev-buy (msg.value
 * w tx launchu) laduje tu jako tokeny SPHERE, refund z dev-buya jako ETH.
 *
 * Zero admina. Wszystko, co kontrakt umie zrobic ze srodkami, jest zaszyte
 * w konstruktorze i wykonywalne bezuprawnieniowo:
 *
 *   ETH   -> release():      split ETH_POT_BPS / reszta miedzy BUYBACK_POT
 *                            i OPS_TARGET (decyzja #11 speca),
 *   token -> releaseToken(): CALE saldo tokena do TOKEN_TARGET (lock/vesting -
 *                            decyzja #11; wazne, ze SCIEZKA WYJSCIA ISTNIEJE,
 *                            inaczej dev-buy i tokenowa noga fee sa uwiezione
 *                            na zawsze - showstopper z konsultacji 2026-08-30).
 *
 * ===========================================================================
 * ONE-SHOT LAUNCH
 * ===========================================================================
 * Konfiguracja launchu (salt, nazwa, fee, odbiorcy...) jest ZAPIETA w
 * konstruktorze - `launch()` nie przyjmuje zadnych parametrow ekonomicznych,
 * wiec nikt nie odpali escrow z inna nazwa, splitem ani saltem (wymog z
 * recenzji zewnetrznej). Wolac moze tylko LAUNCH_AUTHORITY (jednorazowa rola
 * operacyjna: podaje dev-buy ETH i egzekucyjne minTokensOut/deadline), a
 * `launched` to zapadka jednokierunkowa.
 *
 * ===========================================================================
 * SEMANTYKA AWARII: ATOMOWY REWERT
 * ===========================================================================
 * Gdy ktorykolwiek odbiorca release() odmowi ETH, CALY release rewertuje -
 * srodki zostaja i mozna probowac ponownie. Wybieramy atomowosc zamiast
 * izolacji nog, bo obie nogi sa NASZE (pot + ops, oba wdrozone przed
 * launchem i przetestowane na przyjecie ETH) - awaria ktorejkolwiek to blad
 * wdrozeniowy, ktory ma byc glosny, a nie polowiczna wyplata.
 */

interface ICurveLaunchpadForEscrow {
    function launchVanity(
        bytes32 vanitySalt,
        string calldata name_,
        string calldata symbol_,
        uint256 minTokensOut,
        uint256 deadline,
        uint16 feeBps_,
        uint16 creatorFeeBps_,
        uint16 buybackBps_,
        uint256 windowCap_,
        address[] calldata receiverAccounts_,
        uint16[] calldata receiverSharesBps_,
        string calldata metadataURI_
    ) external payable returns (address token, bytes32 launchId);
}

interface IEscrowToken {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SphereCreatorEscrow {
    /* ---------------------------------------------------------------- */
    /*  KONFIGURACJA - wszystko zapiete przy wdrozeniu                   */
    /* ---------------------------------------------------------------- */

    address public immutable LAUNCHPAD;
    /** Jednorazowa rola: moze zawolac launch() (podaje dev-buy i deadline). */
    address public immutable LAUNCH_AUTHORITY;
    /** Odbiorcy ETH z release(): pot buybacku i operacje. */
    address public immutable BUYBACK_POT;
    address public immutable OPS_TARGET;
    /** Udzial pota w kazdym release ETH; reszta (i pyl) idzie do OPS_TARGET. */
    uint16 public immutable ETH_POT_BPS;
    /** Dokad wychodza tokeny (dev-buy + tokenowa noga fee): lock/vesting/Safe. */
    address public immutable TOKEN_TARGET;

    // Konfiguracja launchu. Stringi i tablice nie moga byc immutable -
    // leza w storage, ale NIE MAJA zadnego settera.
    bytes32 public immutable VANITY_SALT;
    uint16 public immutable FEE_BPS;
    uint16 public immutable CREATOR_FEE_BPS;
    uint16 public immutable BUYBACK_BPS;
    uint256 public immutable WINDOW_CAP;
    string public tokenName;
    string public tokenSymbol;
    string public metadataURI;
    address[] private _receiverAccounts;
    uint16[] private _receiverSharesBps;

    /* ---------------------------------------------------------------- */
    /*  STAN                                                             */
    /* ---------------------------------------------------------------- */

    /** Zapadka one-shot. */
    bool public launched;
    /** Token utworzony przez launch() - do releaseToken bez podawania adresu. */
    address public sphereToken;

    uint256 private _entered;

    /* ---------------------------------------------------------------- */

    event LaunchedSphere(address indexed token, bytes32 launchId, uint256 devBuyEth);
    event EthReleased(uint256 toPot, uint256 toOps, address indexed caller);
    event TokenReleased(address indexed token, uint256 amount, address indexed caller);

    error ZeroAddress();
    error BadShareConfig();
    error NotLaunchAuthority();
    error AlreadyLaunched();
    error NotLaunched();
    error NothingToRelease();
    error EthTransferFailed();
    error TokenTransferFailed();
    error Reentered();

    struct LaunchConfig {
        bytes32 vanitySalt;
        string name;
        string symbol;
        uint16 feeBps;
        uint16 creatorFeeBps;
        uint16 buybackBps;
        uint256 windowCap;
        address[] receiverAccounts;
        uint16[] receiverSharesBps;
        string metadataURI;
    }

    constructor(
        address launchpad_,
        address launchAuthority_,
        address buybackPot_,
        address opsTarget_,
        uint16 ethPotBps_,
        address tokenTarget_,
        LaunchConfig memory cfg
    ) {
        if (
            launchpad_ == address(0) ||
            launchAuthority_ == address(0) ||
            buybackPot_ == address(0) ||
            opsTarget_ == address(0) ||
            tokenTarget_ == address(0)
        ) revert ZeroAddress();
        if (ethPotBps_ > 10_000) revert BadShareConfig();
        // Walidacja odbiorcow TERAZ, nie przy launchu - blad konfiguracji ma
        // odpasc przy wdrozeniu escrow, kiedy jeszcze nic nie kosztuje.
        uint256 len = cfg.receiverAccounts.length;
        if (len == 0 || len != cfg.receiverSharesBps.length) revert BadShareConfig();
        uint256 sum;
        for (uint256 i = 0; i < len; i++) {
            if (cfg.receiverAccounts[i] == address(0)) revert ZeroAddress();
            sum += cfg.receiverSharesBps[i];
        }
        if (sum != 10_000) revert BadShareConfig();

        LAUNCHPAD = launchpad_;
        LAUNCH_AUTHORITY = launchAuthority_;
        BUYBACK_POT = buybackPot_;
        OPS_TARGET = opsTarget_;
        ETH_POT_BPS = ethPotBps_;
        TOKEN_TARGET = tokenTarget_;

        VANITY_SALT = cfg.vanitySalt;
        FEE_BPS = cfg.feeBps;
        CREATOR_FEE_BPS = cfg.creatorFeeBps;
        BUYBACK_BPS = cfg.buybackBps;
        WINDOW_CAP = cfg.windowCap;
        tokenName = cfg.name;
        tokenSymbol = cfg.symbol;
        metadataURI = cfg.metadataURI;
        _receiverAccounts = cfg.receiverAccounts;
        _receiverSharesBps = cfg.receiverSharesBps;
    }

    /** Odbior ETH: claimFor/claimEthFor z padu, refund dev-buya - goly call. */
    receive() external payable {}

    function receiverConfig() external view returns (address[] memory, uint16[] memory) {
        return (_receiverAccounts, _receiverSharesBps);
    }

    /* ---------------------------------------------------------------- */
    /*  LAUNCH - one-shot                                                */
    /* ---------------------------------------------------------------- */

    /**
     * Odpala launchVanity z ZAPIETA konfiguracja. `msg.value` = dev-buy
     * (atomowy, pierwszy - nie do wyprzedzenia). Tokeny z dev-buya i refund
     * laduja na tym kontrakcie (launchpad wysyla do msg.sender = escrow).
     */
    function launch(uint256 minTokensOut, uint256 deadline)
        external
        payable
        returns (address token)
    {
        if (msg.sender != LAUNCH_AUTHORITY) revert NotLaunchAuthority();
        if (launched) revert AlreadyLaunched();
        launched = true;

        (token, ) = ICurveLaunchpadForEscrow(LAUNCHPAD).launchVanity{value: msg.value}(
            VANITY_SALT,
            tokenName,
            tokenSymbol,
            minTokensOut,
            deadline,
            FEE_BPS,
            CREATOR_FEE_BPS,
            BUYBACK_BPS,
            WINDOW_CAP,
            _receiverAccounts,
            _receiverSharesBps,
            metadataURI
        );
        sphereToken = token;
        emit LaunchedSphere(token, bytes32(0), msg.value);
    }

    /* ---------------------------------------------------------------- */
    /*  RELEASE - bezuprawnieniowe, kierunki zaszyte                     */
    /* ---------------------------------------------------------------- */

    /**
     * Rozdziela CALE biezace saldo ETH: ETH_POT_BPS w dol do BUYBACK_POT,
     * RESZTA (w tym pyl z dzielenia) do OPS_TARGET - obie nogi sumuja sie
     * do salda co do wei. Atomowo: odmowa ktorejkolwiek nogi rewertuje calosc.
     */
    function release() external {
        if (_entered != 0) revert Reentered();
        _entered = 1;

        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToRelease();

        uint256 toPot = (balance * ETH_POT_BPS) / 10_000;
        uint256 toOps = balance - toPot;

        emit EthReleased(toPot, toOps, msg.sender);

        if (toPot != 0) _sendEth(BUYBACK_POT, toPot);
        if (toOps != 0) _sendEth(OPS_TARGET, toOps);

        _entered = 0;
    }

    /**
     * Wysyla CALE saldo `token` do TOKEN_TARGET. Domyslnie sphereToken
     * (dev-buy + tokenowa noga fee z hooka/vaulta), ale przyjmuje dowolny
     * adres tokena - zeby zaden wrzucony ERC-20 nie zamurowal sie tutaj.
     */
    function releaseToken(address token) external {
        if (_entered != 0) revert Reentered();
        _entered = 1;

        address target = token == address(0) ? sphereToken : token;
        if (target == address(0)) revert NotLaunched();
        uint256 balance = IEscrowToken(target).balanceOf(address(this));
        if (balance == 0) revert NothingToRelease();

        emit TokenReleased(target, balance, msg.sender);

        (bool ok, bytes memory ret) =
            target.call(abi.encodeCall(IEscrowToken.transfer, (TOKEN_TARGET, balance)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();

        _entered = 0;
    }

    function _sendEth(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }
}
