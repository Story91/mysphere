// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IInsuranceSink {
    function notifyDeposit(uint256 amount) external;
}

/**
 * FEE DISTRIBUTOR - oplata z handlu wraca do tego, kto dostarcza cene,
 * ale NIE OD RAZU.
 *
 * ===========================================================================
 * PODZIAL
 * ===========================================================================
 * 65% tworca feedu / 15% fundusz ubezpieczeniowy / 20% skarbiec. Noga
 * ubezpieczeniowa wychodzi z tego kontraktu NATYCHMIAST - fundusz jest
 * wylacznikiem calego modulu, wiec jego saldo musi byc prawdziwe w tej samej
 * transakcji, w ktorej rosnie OI. Dwie pozostale nogi zostaja tu i dojrzewaja.
 *
 * ===========================================================================
 * BLOKADA 7 DNI - RING OSMIU KUBELKOW DZIENNYCH
 * ===========================================================================
 * Tworca, ktory rozchwieje wlasny feed i porzuci rynek, nie moze wyjac oplat
 * w tej samej transakcji. Wzorzec jak w SphereCreatorEscrow (kontrakt nigdy
 * nie pushuje, tylko dopisuje i czeka na `claim`), tylko z zegarem.
 *
 * Naliczenie wpada do kubelka dnia `t / 1 dzien`, a kubelkow jest OSIEM przy
 * blokadzie SIEDMIU dni. Ta jedna nadwyzka jest cala sztuczka: indeks to
 * `dzien % 8`, wiec zanim slot zostanie uzyty ponownie, mija dokladnie 8 dni -
 * czyli jego stara zawartosc na pewno jest juz dojrzala i mozna ja przesunac
 * do `claimable` bez zadnej petli po historii. Koszt naliczenia i `claim`
 * jest stily, niezaleznie od tego, jak dlugo rynek zyje.
 *
 * Ziarnistosc jest DZIENNA, wiec faktyczna blokada to 7 do 8 dni, nigdy mniej
 * niz 7. Zaokraglenie idzie na niekorzysc odbiorcy i tak ma byc.
 *
 * Kwoty sa w USDC (6 miejsc) i nigdzie tu nie ma skali WAD - dystrybutor
 * dostaje juz gotowe tokeny, ktore rynek mu przelal PRZED wolaniem `notifyFee`.
 */
contract FeeDistributor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant CREATOR_SHARE_BPS = 6500;
    uint16 public constant INSURANCE_SHARE_BPS = 1500;
    uint16 private constant BPS = 10_000;

    /** Ile pelnych dni oplata lezy, zanim da sie ja odebrac. */
    uint32 public constant LOCK_DAYS = 7;
    uint8 private constant BUCKETS = 8;

    IERC20 public immutable USDC;
    address public immutable TREASURY;
    address public immutable INSURANCE;

    /**
     * Fabryka jest jedynym adresem, ktory moze DOPISAC rynek do listy
     * uprawnionych. Nie ma sciezki odwrotnej ani zadnego innego uprawnienia -
     * `FACTORY` nie dotknie sald.
     */
    address public immutable FACTORY;

    struct Bucket {
        uint64 day;
        uint256 amount;
    }

    mapping(address => bool) public isMarket;
    /** Juz dojrzale, czeka tylko na `claim`. */
    mapping(address => uint256) public claimable;
    mapping(address => Bucket[BUCKETS]) private _locked;
    /** Ile lacznie oplat wygenerowal dany rynek - do UI, nie do rozliczen. */
    mapping(address => uint256) public feesByMarket;
    /** Wszystko, co kontrakt komus winien: dojrzale plus jeszcze zablokowane. */
    uint256 public totalLiabilities;

    event MarketRegistered(address indexed market);
    event FeeReceived(
        address indexed market,
        address indexed creator,
        uint256 creatorAmount,
        uint256 insuranceAmount,
        uint256 treasuryAmount
    );
    event Accrued(address indexed account, uint256 amount, uint64 day);
    event Claimed(address indexed account, uint256 amount);

    error ZeroAddress();
    error NotFactory();
    error NotMarket();
    error NothingToClaim();
    error FeeNotFunded();

    constructor(address usdc, address treasury, address factory, address insurance) {
        if (usdc == address(0) || treasury == address(0) || factory == address(0) || insurance == address(0)) {
            revert ZeroAddress();
        }
        USDC = IERC20(usdc);
        TREASURY = treasury;
        FACTORY = factory;
        INSURANCE = insurance;
    }

    function registerMarket(address market) external {
        if (msg.sender != FACTORY) revert NotFactory();
        if (market == address(0)) revert ZeroAddress();
        isMarket[market] = true;
        emit MarketRegistered(market);
    }

    /**
     * Rynek najpierw PRZELEWA USDC, potem wola `notifyFee`. Sprawdzamy, ze
     * pieniadze naprawde sa: saldo kontraktu musi pokrywac stare zobowiazania
     * plus te nowa oplate. Bez tego wpisu falszywe `notifyFee` wypisaloby
     * roszczenie z cudzych srodkow.
     */
    function notifyFee(address creator, uint256 amount) external nonReentrant {
        if (!isMarket[msg.sender]) revert NotMarket();
        if (creator == address(0)) revert ZeroAddress();
        if (amount == 0) return;
        if (USDC.balanceOf(address(this)) < totalLiabilities + amount) revert FeeNotFunded();

        uint256 creatorCut = (amount * CREATOR_SHARE_BPS) / BPS;
        uint256 insuranceCut = (amount * INSURANCE_SHARE_BPS) / BPS;
        uint256 treasuryCut = amount - creatorCut - insuranceCut;

        _accrue(creator, creatorCut);
        _accrue(TREASURY, treasuryCut);
        totalLiabilities += creatorCut + treasuryCut;
        feesByMarket[msg.sender] += amount;

        if (insuranceCut != 0) {
            USDC.safeTransfer(INSURANCE, insuranceCut);
            IInsuranceSink(INSURANCE).notifyDeposit(insuranceCut);
        }

        emit FeeReceived(msg.sender, creator, creatorCut, insuranceCut, treasuryCut);
    }

    function _accrue(address account, uint256 amount) private {
        if (amount == 0) return;
        uint64 day = uint64(block.timestamp / 1 days);
        Bucket storage b = _locked[account][day % BUCKETS];
        if (b.day != day) {
            // Slot z innym dniem rozni sie o WIELOKROTNOSC 8 dni, czyli jego
            // zawartosc dojrzala dawno - przenosimy i zaczynamy dzien od nowa.
            if (b.amount != 0) {
                claimable[account] += b.amount;
                b.amount = 0;
            }
            b.day = day;
        }
        b.amount += amount;
        emit Accrued(account, amount, day);
    }

    /** Ile mozna odebrac TERAZ - z uwzglednieniem kubelkow, ktore juz dojrzaly. */
    function claimableNow(address account) public view returns (uint256 amount) {
        amount = claimable[account];
        uint64 today = uint64(block.timestamp / 1 days);
        for (uint256 i = 0; i < BUCKETS; ++i) {
            Bucket storage b = _locked[account][i];
            if (b.amount != 0 && today >= b.day + LOCK_DAYS) amount += b.amount;
        }
    }

    /** Ile jeszcze lezy pod blokada. `claimableNow + lockedTotal` = calosc. */
    function lockedTotal(address account) external view returns (uint256 amount) {
        uint64 today = uint64(block.timestamp / 1 days);
        for (uint256 i = 0; i < BUCKETS; ++i) {
            Bucket storage b = _locked[account][i];
            if (b.amount != 0 && today < b.day + LOCK_DAYS) amount += b.amount;
        }
    }

    function claim() external nonReentrant returns (uint256 amount) {
        amount = claimable[msg.sender];
        claimable[msg.sender] = 0;

        uint64 today = uint64(block.timestamp / 1 days);
        for (uint256 i = 0; i < BUCKETS; ++i) {
            Bucket storage b = _locked[msg.sender][i];
            if (b.amount != 0 && today >= b.day + LOCK_DAYS) {
                amount += b.amount;
                b.amount = 0;
            }
        }

        if (amount == 0) revert NothingToClaim();
        totalLiabilities -= amount;
        USDC.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }
}
