// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * Minimalny wycinek IPyth (pyth-sdk-solidity). Bez zaleznosci npm: interfejs
 * ma trzy funkcje i jedna strukture, a pelny pakiet ciagnie za soba wersje
 * OpenZeppelina inna niz nasza.
 */
interface IPythMinimal {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    /** Ostatnia znana cena, bez sprawdzania wieku. Rewertuje tylko, gdy feed nie istnieje. */
    function getPriceUnsafe(bytes32 id) external view returns (Price memory price);
}

/**
 * PYTH -> AGGREGATOR V3 - zeby DerivativeMarket dostal indeks bez zmiany kodu.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * `DerivativeMarket.indexPrice()` czyta cene referencyjna przez interfejs
 * Chainlinka (`latestRoundData` + `decimals`). Chainlink nie opublikowal
 * adresow na Arc, a Pyth ma tam kontrakt (docs Arc "oracles" -> Pyth EVM
 * addresses: 0x2880aB155794e7179c9eE2e38200202908C17B43 na testnecie).
 * Ten kontrakt jest tlumaczem: udaje feed Chainlinka, a pod spodem czyta Pyth.
 *
 * ===========================================================================
 * DLACZEGO NIE REWERTUJE NA STARA CENE
 * ===========================================================================
 * Pyth to oracle PULL: cena na lancuchu jest tak swieza, jak ostatni, kto ja
 * wypchnal. 11.09.2026 na Arc testnet BTC/USD mial 48 s, a ETH/USD 15 DNI.
 * `getPriceNoOlderThan` rewertuje przy starej cenie - a rewert w
 * `indexPrice()` zatrzymalby funding, likwidacje i zamykanie pozycji na
 * calym rynku. Zamiast tego adapter oddaje `answer = 0`, a rynek (juz dzis,
 * bez zmian) traktuje to jako "brak feedu" i spada na TWAP rejestru.
 * Stara cena jest wiec bezpieczna: rynek jej NIE uzywa, ale tez sie nie
 * zatrzymuje.
 *
 * ===========================================================================
 * SKALA
 * ===========================================================================
 * Pyth podaje `price * 10^expo`, a `expo` zalezy od feedu (dla par USD
 * zwykle -8). Adapter zawsze oddaje 18 miejsc, wiec `decimals()` = 18 i
 * `DerivMath.scalePriceToWad` przepuszcza wynik bez przeliczen.
 *
 * ===========================================================================
 * CZEGO TU NIE MA
 * ===========================================================================
 * Nikt tu nie wypycha aktualizacji. Kto ma je wypychac (keeper przez Hermes,
 * z kluczem API Pytha) i placic `getUpdateFee` w USDC - to osobna praca.
 * Bez niej adapter zwraca zero po MAX_AGE i rynek zyje na rejestrze.
 * `conf` (przedzial ufnosci) jest ignorowany - swiadomie, na testnet.
 */
contract PythAggregatorAdapter {
    IPythMinimal public immutable PYTH;
    bytes32 public immutable PRICE_ID;
    /** Powyzej tego wieku cena jest "brakiem feedu" (answer = 0). */
    uint256 public immutable MAX_AGE;
    /** Opis do UI i eksploratora, np. "BTC/USD (Pyth)". */
    string public description;

    error ZeroAddress();
    error ZeroPriceId();
    error ZeroMaxAge();
    error ExpoOutOfRange(int32 expo);

    constructor(address pyth, bytes32 priceId, uint256 maxAge, string memory description_) {
        if (pyth == address(0)) revert ZeroAddress();
        if (priceId == bytes32(0)) revert ZeroPriceId();
        if (maxAge == 0) revert ZeroMaxAge();
        PYTH = IPythMinimal(pyth);
        PRICE_ID = priceId;
        MAX_AGE = maxAge;
        description = description_;
    }

    /** Zawsze 18 - patrz "SKALA". */
    function decimals() external pure returns (uint8) {
        return 18;
    }

    /** Kompatybilnosc z narzedziami, ktore pytaja o wersje agregatora. */
    function version() external pure returns (uint256) {
        return 1;
    }

    /**
     * Interfejs Chainlinka. `roundId` = `answeredInRound` = publishTime (Pyth
     * nie ma rund; czas publikacji jest monotoniczny, wiec spelnia te role).
     * Stara albo niedodatnia cena -> same zera, NIE rewert (patrz wyzej).
     */
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        IPythMinimal.Price memory p = PYTH.getPriceUnsafe(PRICE_ID);
        if (p.price <= 0 || p.publishTime == 0 || block.timestamp > p.publishTime + MAX_AGE) {
            return (0, 0, 0, 0, 0);
        }
        int256 scaled = _toWad(p.price, p.expo);
        uint80 round = uint80(p.publishTime);
        return (round, scaled, p.publishTime, p.publishTime, round);
    }

    /** Sama cena w 18 miejscach albo 0 gdy stara - dla UI, bez pieciu pol. */
    function latestAnswer() external view returns (int256) {
        (, int256 answer,,,) = this.latestRoundData();
        return answer;
    }

    function _toWad(int64 price, int32 expo) private pure returns (int256) {
        // 18 + expo to liczba miejsc do dopisania (expo < 0) albo odjecia.
        int32 shift = 18 + expo;
        if (shift < -18 || shift > 36) revert ExpoOutOfRange(expo);
        if (shift >= 0) return int256(price) * int256(10 ** uint32(shift));
        return int256(price) / int256(10 ** uint32(-shift));
    }
}
