// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * Sondy do testow CurveLaunchpad - kontrakty, ktore ROBIA cos, czego nie da sie
 * zrobic z adresu zwyklego (EOA).
 *
 * ===========================================================================
 * PO CO ONE SA, SKORO TESTY MAJA SIGNEROW
 * ===========================================================================
 * Trzy wlasnosci launchpada da sie sprawdzic WYLACZNIE z kontraktu:
 *
 *  1. Wejscie powrotne. `nonReentrant` i kolejnosc checks-effects-interactions
 *     sa niesprawdzalne z EOA, bo EOA nie ma kodu, ktory odpalilby sie przy
 *     odbiorze ETH. Bez tych sond obie warstwy ochrony sa NAPISANE, ale
 *     nieprzetestowane.
 *  2. Odbiorca, ktory rewertuje. `claimable` ma byc pullem wlasnie po to, zeby
 *     jeden zepsuty odbiorca nie blokowal nikogo innego - i to jest zdanie,
 *     ktore trzeba pokazac, a nie zadeklarowac.
 *  3. Kupno z kontraktu w ogole (Coinbase Smart Wallet, ERC-4337). Launchpad
 *     celowo nie ma `tx.origin == msg.sender`, wiec musi dzialac dla kontraktu -
 *     i to tez ma byc sprawdzone, a nie zalozone.
 *
 * Sondy NIE sa atrapami czegokolwiek produkcyjnego. Nie udaja portfela, nie
 * udaja B20, nie wchodza do zadnego artefaktu wdrozeniowego.
 */

import {PoolKey, IPoolManagerV4} from "../launchpad/interfaces/IPoolManagerV4.sol";

interface ICurvePad {
    function buy(address token, uint256 minTokensOut, uint256 deadline)
        external
        payable
        returns (uint256);
    function sell(address token, uint256 tokensIn, uint256 minEthOut, uint256 deadline)
        external
        returns (uint256);
    function claim() external;
    function graduate(address token) external;
    function launch(string calldata name, string calldata symbol, uint256 minTokensOut, uint256 deadline)
        external
        payable
        returns (address token, bytes32 launchId);
    function poolKeyAt(address token, uint256 i) external pure returns (PoolKey memory);
    function creatorNonce(address who) external view returns (uint256);
}

interface IProbeFactory {
    function getB20Address(uint8 variant, address deployer, bytes32 salt) external view returns (address);
}

interface IProbeToken {
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * Sonda wejscia powrotnego.
 *
 * Kluczowy szczegol konstrukcji: proba wejscia jest w `try/catch`, a selektor
 * bledu zapisywany w stanie. Bez tego zewnetrzne wywolanie odbijaloby sie
 * bledem `EthTransferFailed` (bo rewert wraca przez `to.call`) i test nie
 * odroznilby "straznik zadzialal" od "odbiorca po prostu rewertuje" - czyli
 * nie dowodzilby tego, o co chodzi.
 *
 * `armed` rozbraja sie przy pierwszym wejsciu, zeby sonda nie wpadla we wlasna
 * nieskonczona petle, gdyby straznika kiedys zabraklo.
 */
contract ReentrancyProbe {
    /** 0 = nic nie rob, 1 = claim, 2 = buy, 3 = sell */
    uint8 public mode;
    bool public armed;
    bool public reentered;
    bytes4 public innerError;

    address public immutable PAD;
    address public token;

    error ProbeInnerCallSucceeded();

    constructor(address pad_) payable {
        PAD = pad_;
    }

    receive() external payable {
        if (!armed) return;
        armed = false;
        reentered = true;

        if (mode == 1) {
            try ICurvePad(PAD).claim() {
                innerError = bytes4(ProbeInnerCallSucceeded.selector);
            } catch (bytes memory err) {
                innerError = _selector(err);
            }
        } else if (mode == 2) {
            try ICurvePad(PAD).buy{value: 2}(token, 1, type(uint256).max) returns (uint256) {
                innerError = bytes4(ProbeInnerCallSucceeded.selector);
            } catch (bytes memory err) {
                innerError = _selector(err);
            }
        } else if (mode == 3) {
            try ICurvePad(PAD).sell(token, 1_000_000_000_000, 1, type(uint256).max) returns (uint256) {
                innerError = bytes4(ProbeInnerCallSucceeded.selector);
            } catch (bytes memory err) {
                innerError = _selector(err);
            }
        }
    }

    function arm(uint8 mode_, address token_) external {
        mode = mode_;
        token = token_;
        armed = true;
        reentered = false;
        innerError = bytes4(0);
    }

    function doBuy(address token_, uint256 value, uint256 minOut) external {
        ICurvePad(PAD).buy{value: value}(token_, minOut, type(uint256).max);
    }

    function doSell(address token_, uint256 amount, uint256 minEthOut) external {
        IProbeToken(token_).approve(PAD, type(uint256).max);
        ICurvePad(PAD).sell(token_, amount, minEthOut, type(uint256).max);
    }

    function doGraduate(address token_) external {
        ICurvePad(PAD).graduate(token_);
    }

    function doClaim() external {
        ICurvePad(PAD).claim();
    }

    /** Pierwsze cztery bajty danych rewertu. `bytes memory` -> `bytes4` bez zgadywania dlugosci. */
    function _selector(bytes memory err) private pure returns (bytes4 out) {
        if (err.length < 4) return bytes4(0);
        assembly {
            out := mload(add(err, 32))
        }
    }
}

/**
 * Sonda wektora A2: pula zainicjalizowana PRZED naszym startem.
 *
 * ===========================================================================
 * DLACZEGO TO MUSI BYC KONTRAKT, A NIE DWIE TRANSAKCJE W TESCIE
 * ===========================================================================
 * Salt zawiera `blockhash(block.number - 1)`, wiec adres tokena jest inny
 * w kazdym bloku. Zeby postawic pule pod adresem, ktory dopiero powstanie,
 * trzeba wykonac oba kroki w JEDNYM bloku - a mempool Hardhata bierze tylko
 * jedna transakcje na `evm_mine`. Jedynym sposobem jest wiec kontrakt, ktory
 * robi obie rzeczy w jednym wywolaniu.
 *
 * Wychodzi z tego napastnik MOCNIEJSZY niz prawdziwy: prawdziwy nie moze byc
 * w tej samej transakcji, co nasz start, wiec skrotu ostatniego bloku nie zna
 * na czas. Jesli launchpad wytrzymuje tego, wytrzymuje tamtego tym bardziej.
 *
 * Co ta sonda ma pokazac: pula, ktorej NIE zainicjalizowalismy sami, jest przy
 * awansie pomijana takze wtedy, gdy jej cena jest dokladnie ta, ktorej szukamy.
 * Maska "nasza pula" i kontrola ceny to dwa NIEZALEZNE warunki i tylko taki
 * test je od siebie oddziela.
 */
contract PoolFrontRunner {
    address public constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;
    address public constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;

    address public immutable PAD;
    address public lastToken;

    error PredictionFailed();

    constructor(address pad_) {
        PAD = pad_;
    }

    /**
     * Wylicza adres tokena, ktory za chwile powstanie, stawia pod nim pule
     * warstwy `tier` po cenie `price`, i dopiero potem woła `launch`.
     *
     * Salt liczony DOKLADNIE tym samym wzorem, co w launchpadzie - lacznie
     * z `blockhash(block.number - 1)`, ktory tutaj jest juz znany, bo jestesmy
     * w tym samym bloku.
     */
    function frontRunThenLaunch(uint256 tier, uint160 price) external returns (address token) {
        bytes32 salt = keccak256(
            abi.encode(
                PAD,
                address(this),
                ICurvePad(PAD).creatorNonce(address(this)),
                block.chainid,
                blockhash(block.number - 1)
            )
        );
        token = IProbeFactory(B20_FACTORY).getB20Address(0, PAD, salt);

        IPoolManagerV4(POOL_MANAGER).initialize(ICurvePad(PAD).poolKeyAt(token, tier), price);

        (address created,) = ICurvePad(PAD).launch("FrontRun", "FR", 0, type(uint256).max);
        // Gdyby wyprowadzenie salta sie rozjechalo, test bylby zielony
        // z zupelnie innego powodu, niz twierdzi. Lepiej, zeby padl tutaj.
        if (created != token) revert PredictionFailed();
        lastToken = token;
    }
}

/**
 * Odbiorca, ktory ODRZUCA kazde ETH.
 *
 * Sluzy do jednego zdania: saldo `claimable` naliczone takiemu adresowi nie
 * blokuje NIKOGO innego - ani awansu (nagroda jest ksiegowana, nie pushowana),
 * ani cudzych wyplat. Blokuje wylacznie jego wlasna wyplate, i to jest jedyny
 * poprawny zasieg tej awarii.
 */
contract EthRejector {
    address public immutable PAD;

    error NoThanks();

    constructor(address pad_) {
        PAD = pad_;
    }

    receive() external payable {
        revert NoThanks();
    }

    function doGraduate(address token_) external {
        ICurvePad(PAD).graduate(token_);
    }

    function doClaim() external {
        ICurvePad(PAD).claim();
    }
}
