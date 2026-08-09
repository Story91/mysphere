// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * JEDYNE MIEJSCE W CALYM LAUNCHPADZIE, KTORE WIE, CZYM JEST TOKEN.
 *
 * ===========================================================================
 * PO CO TA GRANICA ISTNIEJE
 * ===========================================================================
 * Na Base token robi precompile B20 pod adresem 0xB20f... - siec wymusza sufit
 * podazy i role, wiec da sie je ODCZYTAC i zaasertowac. Na Robinhood Chain
 * zadnego B20 nie ma i token trzeba wdrozyc samemu jako zwykly ERC-20.
 *
 * To jest jedyna roznica miedzy tymi sieciami. Cala reszta - krzywa, oplaty,
 * prog, graduacja, pula, hook - jest identyczna co do bajtu. Gdyby ta roznica
 * siedziala w `CurveLaunchpad`, mielibysmy dwie wersje kontraktu z pieniedzmi
 * i dwa osobne audyty tego samego kodu. Tak mamy jeden kontrakt z pieniedzmi
 * i dwie male fabryki, z ktorych kazda robi jedna rzecz.
 *
 * ===========================================================================
 * FABRYKA NIE OBIECUJE - FABRYKA ASERTUJE
 * ===========================================================================
 * `createToken` nie ma prawa zwrocic adresu tokena, o ktorym nie udowodnila
 * czterech rzeczy. Kazda z nich jest sprawdzana ODCZYTEM PO FAKCIE, a nie
 * zalozeniem o tym, co zrobil kod wyzej:
 *
 *   1. `totalSupply() == supply`
 *   2. `balanceOf(mintTo) == supply`   - cala podaz jest u launchpada
 *   3. `supplyCap() == supply`         - dodruk rewertuje na poziomie tokena
 *   4. zadnej zywej roli, ktora moglaby ktorakolwiek z powyzszych zmienic
 *
 * Falsz w dowolnym punkcie rewertuje CALY start. Nie istnieje sciezka, w ktorej
 * token ze zywa rola trafia na krzywe i zbiera od ludzi pieniadze.
 */
interface ITokenFactory {
    /**
     * Tworzy token i mintuje CALA podaz na `mintTo`.
     *
     * @param name      nazwa tokena
     * @param symbol    ticker
     * @param supply    calosc podazy w jednostkach bazowych; zarazem sufit
     * @param salt      wchodzi do adresu tokena; launchpad wyprowadza go tak,
     *                  zeby nie dalo sie go przewidziec przed transakcja
     * @param mintTo    kto dostaje cala podaz (u nas: launchpad)
     * @param creator   adres czlowieka, ktory zaczyna start. Fabryka NIE daje
     *                  mu zadnych praw - dostaje go wylacznie po to, zeby
     *                  zaasertowac, ze ich nie ma
     */
    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 supply,
        bytes32 salt,
        address mintTo,
        address creator
    ) external returns (address token);

    /**
     * Adres, ktory `createToken` da dla tego salta.
     *
     * Istnieje po to, zeby dalo sie sprawdzic PO FAKCIE, ze token z rejestru
     * krzywej powstal naprawde tutaj, a nie zostal podstawiony. Przed startem
     * jest bezuzyteczny i tak ma byc - salt zawiera `blockhash`, wiec nikt,
     * lacznie z nami, nie zna adresu tokena przed wyslaniem transakcji.
     */
    function predictToken(bytes32 salt) external view returns (address);

    /**
     * Ile miejsc po przecinku ma token z tej fabryki. Stala, nie pole formularza.
     */
    function decimals() external view returns (uint8);
}
