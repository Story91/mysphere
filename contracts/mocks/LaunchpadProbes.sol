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

import {PoolKey, SwapParams, IPoolManagerV4} from "../launchpad/interfaces/IPoolManagerV4.sol";

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
    function poolKeyOf(address token) external view returns (PoolKey memory);
    function tokenAddressForSalt(bytes32 salt) external view returns (address);
    function creatorNonce(address who) external view returns (uint256);
}

interface IProbeFactory {
    function getB20Address(uint8 variant, address deployer, bytes32 salt) external view returns (address);
}

interface IProbeToken {
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
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
 * ===========================================================================
 * CO TA SONDA POKAZUJE TERAZ - I CZYM SIE TO ROZNI OD POPRZEDNIEJ WERSJI
 * ===========================================================================
 * Przedtem pokazywala, ze CUDZA pula jest przy awansie POMIJANA dzieki masce
 * "to nasza pula". Maski juz nie ma, bo nie ma czterech pul - i nie ma czego
 * pomijac. Sonda pokazuje wiec rzecz mocniejsza: puli z naszym hookiem
 * napastnik NIE OTWORZY W OGOLE, nawet bedac w tej samej transakcji, co start.
 *
 * Dwie metody, bo to dwa rozne zdania:
 *   `frontRunOurPool`     - proba otwarcia NASZEJ puli. Musi odpasc `NotVault`.
 *   `frontRunForeignPool` - otwarcie puli BEZ naszego hooka, po tej samej
 *                           cenie. Musi PRZEJSC i nie ruszyc naszego awansu:
 *                           nie udajemy, ze da sie zakazac cudzych pul.
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

    /** Salt, ktory launchpad wyliczy dla NASZEGO nastepnego startu. */
    function _nextSalt() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                PAD,
                address(this),
                ICurvePad(PAD).creatorNonce(address(this)),
                block.chainid,
                blockhash(block.number - 1)
            )
        );
    }

    /**
     * Proba otwarcia puli, do ktorej awansuje nasz wlasny, jeszcze nieistniejacy
     * token. Musi odpasc na `beforeInitialize` hooka.
     *
     * Gdyby przeszla, napastnik ustawialby cene startowa puli, a `seed`
     * wkladalby plynnosc po cudzej cenie.
     */
    function frontRunOurPool(uint160 price) external {
        address token = ICurvePad(PAD).tokenAddressForSalt(_nextSalt());
        IPoolManagerV4(POOL_MANAGER).initialize(ICurvePad(PAD).poolKeyOf(token), price);
    }

    /**
     * To samo, ale pula BEZ naszego hooka - czyli zwyczajna, cudza pula na te
     * sama pare. Ta przechodzi i ma przechodzic: nie ma sposobu, zeby tego
     * zakazac, ani u nas, ani u kogokolwiek. Nasz awans ma sie tym nie przejac.
     */
    function frontRunForeignPoolThenLaunch(uint160 price) external returns (address token) {
        bytes32 salt = _nextSalt();
        token = ICurvePad(PAD).tokenAddressForSalt(salt);

        PoolKey memory key = ICurvePad(PAD).poolKeyOf(token);
        key.hooks = address(0);
        IPoolManagerV4(POOL_MANAGER).initialize(key, price);

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

/**
 * Sonda wymiany - jedyny sposob, zeby lokalnie wywolac `afterSwap` hooka.
 *
 * ===========================================================================
 * DLACZEGO KONTRAKT, A NIE WYWOLANIE Z TESTU
 * ===========================================================================
 * `swap` w v4 dziala tylko wewnatrz `unlock`, a `unlock` oddaje sterowanie
 * przez `unlockCallback` NA WOLAJACYM. Z adresu zwyklego (EOA) nie da sie tego
 * zrobic, bo EOA nie ma kodu, ktory odebralby callback.
 *
 * Sonda robi trzy rzeczy w jednym wywolaniu: odblokowuje, wymienia, rozlicza
 * to, co po wymianie zostalo na saldach. Trzeci krok jest tu istotny, a nie
 * porzadkowy: atrapa rewertuje `CurrencyNotSettled`, jesli na koncu cokolwiek
 * zostanie niezerowe. Hook, ktory wzialby wiecej, niz oddal, wywalilby wiec
 * wymiane - i to jest dokladnie ta wlasnosc, ktora ma byc przetestowana.
 */
interface IProbePoolManager {
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external
        returns (int256);
    function deltas() external view returns (int256, int256);
    function settle() external payable returns (uint256);
    function sync(address currency) external;
    function take(address currency, address to, uint256 amount) external;
}

contract SwapProbe {
    address public constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;

    PoolKey private _key;
    SwapParams private _params;

    /** Ile sonda dostala z kazdej strony - do asercji w tescie. */
    int256 public lastDelta0;
    int256 public lastDelta1;

    receive() external payable {}

    function doSwap(PoolKey calldata key, SwapParams calldata params) external payable {
        _key = key;
        _params = params;
        IProbePoolManager(POOL_MANAGER).unlock("");
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        IProbePoolManager(POOL_MANAGER).swap(_key, _params, "");

        (int256 d0, int256 d1) = IProbePoolManager(POOL_MANAGER).deltas();
        lastDelta0 = d0;
        lastDelta1 = d1;

        // Winni jestesmy - placimy. Nalezy sie nam - odbieramy. Kolejnosc
        // sync -> transfer -> settle dla tokena ma znaczenie, tak jak w oryginale.
        if (d0 < 0) {
            IProbePoolManager(POOL_MANAGER).settle{value: uint256(-d0)}();
        } else if (d0 > 0) {
            IProbePoolManager(POOL_MANAGER).take(address(0), address(this), uint256(d0));
        }

        if (d1 < 0) {
            IProbePoolManager(POOL_MANAGER).sync(_key.currency1);
            IProbeToken(_key.currency1).transfer(POOL_MANAGER, uint256(-d1));
            IProbePoolManager(POOL_MANAGER).settle();
        } else if (d1 > 0) {
            IProbePoolManager(POOL_MANAGER).take(_key.currency1, address(this), uint256(d1));
        }

        return "";
    }
}
