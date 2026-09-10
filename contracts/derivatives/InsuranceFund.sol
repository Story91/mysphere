// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {DerivMath} from "./DerivMath.sol";

interface IMarketList {
    function isMarket(address market) external view returns (bool);
}

/**
 * INSURANCE FUND - wspolny bufor na zle dlugi i JEDYNY wylacznik calego modulu.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Suma PnL na vAMM nie jest tozsamosciowo zerowa: funding miedzy niesymetrycznymi
 * stronami i pozycje likwidowane pod woda zostawiaja dziure. Perpetual Protocol
 * v1 przekonalo sie o tym na zywym rynku - bez wspolnego bufora dziura wychodzi
 * na wyplatach traderow, ktorzy nie mieli z nia nic wspolnego.
 *
 * Fundusz zbiera trzy strumienie:
 *   1. czesc KAZDEJ oplaty handlowej (INSURANCE_SHARE_BPS w FeeDistributor),
 *   2. przepadle kaucje przegranych zgloszen cenowych (PriceOracleRegistry),
 *   3. dobrowolne dotacje przez `notifyDeposit`.
 *
 * ===========================================================================
 * WYLACZNIK GLOBALNY
 * ===========================================================================
 * Rynki raportuja tu swoje OI (w WAD USD) po kazdej zmianie. Gdy saldo funduszu
 * spadnie ponizej `minRatioBps` calego OI systemu, `newPositionsPaused()` robi
 * sie prawdziwe i KAZDY rynek przestaje przyjmowac nowe pozycje. Zamykanie,
 * likwidacje i wyplaty dzialaja dalej - pauza ma zatrzymac naplyw ryzyka,
 * a nie uwiezic w nim ludzi.
 *
 * `minRatioBps` jest jedynym parametrem konfigurowalnym w calym module
 * i moze go zmienic tylko GOVERNANCE (multisig). Sufit MAX_MIN_RATIO_BPS
 * odbiera multisigowi mozliwosc zablokowania handlu na zawsze przez
 * ustawienie progu, ktorego zaden fundusz nie spelni.
 *
 * Kwoty tu sa w USDC (6 miejsc), OI w WAD - porownanie idzie przez
 * DerivMath.usdcToWad i nigdzie indziej.
 */
contract InsuranceFund is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /** Start: fundusz ma pokrywac 1% OI systemu. */
    uint16 public constant DEFAULT_MIN_RATIO_BPS = 100;
    /** 10% - powyzej tego multisig moglby zamknac handel na stale. */
    uint16 public constant MAX_MIN_RATIO_BPS = 1000;

    IERC20 public immutable USDC;
    address public immutable GOVERNANCE;
    /** Fabryka rynkow; sluzy WYLACZNIE do pytania `isMarket`. */
    IMarketList public immutable MARKETS;

    /** Saldo ksiegowe funduszu w USDC. Nadwyzka nad nim to darowizna niczyja. */
    uint256 public balance;

    uint16 public minRatioBps;

    mapping(address => uint256) public oiByMarket;
    /** Suma OI wszystkich rynkow, WAD USD. */
    uint256 public totalOi;

    event Deposited(address indexed from, uint256 amount, uint256 balance);
    event ShortfallCovered(address indexed market, uint256 amount, uint256 balance);
    event OiReported(address indexed market, uint256 oi, uint256 totalOi);
    event MinRatioSet(uint16 minRatioBps);

    error ZeroAddress();
    error NotMarket();
    error NotGovernance();
    error DepositNotFunded();
    error RatioTooHigh();

    constructor(address usdc, address governance, address markets) {
        if (usdc == address(0) || governance == address(0) || markets == address(0)) revert ZeroAddress();
        USDC = IERC20(usdc);
        GOVERNANCE = governance;
        MARKETS = IMarketList(markets);
        minRatioBps = DEFAULT_MIN_RATIO_BPS;
    }

    /* ====================================================================== */
    /*  ZASILANIE                                                              */
    /* ====================================================================== */

    /**
     * Wolajacy PRZELEWA USDC, potem wola te funkcje. Sprawdzamy, ze pieniadze
     * naprawde przyszly - inaczej falszywe `notifyDeposit` podnioslo by saldo
     * ksiegowe bez pokrycia i wylaczylo pauze, ktora powinna byc wlaczona.
     *
     * Otwarte dla kazdego: dotacja do funduszu nie wymaga uprawnien.
     */
    function notifyDeposit(uint256 amount) external nonReentrant {
        if (amount == 0) return;
        if (USDC.balanceOf(address(this)) < balance + amount) revert DepositNotFunded();
        balance += amount;
        emit Deposited(msg.sender, amount, balance);
    }

    /* ====================================================================== */
    /*  POKRYCIE ZLEGO DLUGU                                                   */
    /* ====================================================================== */

    /**
     * Rynek zglasza dziure po likwidacji pod woda i dostaje tyle, ile fundusz
     * ma. Wyplata CZESCIOWA jest tu swiadoma: lepiej zalatac ile sie da niz
     * zrewertowac likwidacje i zostawic pozycje, ktora tylko powieksza dziure.
     */
    function coverShortfall(uint256 amount) external nonReentrant returns (uint256 paid) {
        if (!MARKETS.isMarket(msg.sender)) revert NotMarket();
        if (amount == 0) return 0;
        paid = amount > balance ? balance : amount;
        if (paid == 0) return 0;
        balance -= paid;
        USDC.safeTransfer(msg.sender, paid);
        emit ShortfallCovered(msg.sender, paid, balance);
    }

    /* ====================================================================== */
    /*  OI I PAUZA                                                             */
    /* ====================================================================== */

    /** Rynek podaje swoje CALE OI, nie delte - stan absolutny sie nie rozjedzie. */
    function reportOi(uint256 oi) external {
        if (!MARKETS.isMarket(msg.sender)) revert NotMarket();
        totalOi = totalOi - oiByMarket[msg.sender] + oi;
        oiByMarket[msg.sender] = oi;
        emit OiReported(msg.sender, oi, totalOi);
    }

    /** Wymagane saldo funduszu przy biezacym OI, w USDC. */
    function requiredBalance() public view returns (uint256) {
        return DerivMath.wadToUsdc((totalOi * minRatioBps) / DerivMath.BPS);
    }

    function newPositionsPaused() external view returns (bool) {
        return balance < requiredBalance();
    }

    function setMinRatioBps(uint16 newRatio) external {
        if (msg.sender != GOVERNANCE) revert NotGovernance();
        if (newRatio > MAX_MIN_RATIO_BPS) revert RatioTooHigh();
        minRatioBps = newRatio;
        emit MinRatioSet(newRatio);
    }
}
