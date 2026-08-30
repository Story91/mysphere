// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * Sondy do testow peryferii SPHERE - kontrakty robiace to, czego nie zrobi EOA.
 * Wzor: contracts/mocks/LaunchpadProbes.sol. Zadna z nich nie udaje niczego
 * produkcyjnego.
 */

interface ISphereRewards {
    function pull(address to, uint256 amount) external;
    function pullable() external view returns (uint256);
}

/**
 * Forwarder ETH - dowodzi, ze `receive()` huba przyjmuje wplate ze sciezki
 * KONTRAKTU (goly `call{value}`), a nie tylko od EOA. To ta sama forma
 * dostawy, ktorej uzywaja launchpad/hook/vault (`_sendEth`).
 */
contract EthForwarder {
    function forward(address to) external payable {
        (bool ok, ) = to.call{value: msg.value}("");
        require(ok, "forward failed");
    }
}

/**
 * Forwarder przez `transfer` (limit 2300 gazu) - PIN na "receive() nie robi
 * SSTORE". Gdyby hub zapisywal stan przy odbiorze, ta wplata by rewertowala.
 */
contract TransferForwarder {
    function forward(address payable to) external payable {
        to.transfer(msg.value);
    }
}

/**
 * Donator przez selfdestruct - wpycha ETH pod adres huba z pominieciem
 * `receive()`. Dowodzi, ze forced-ETH nie lamie zadnego niezmiennika huba
 * (bo hub liczy po saldzie, nie po ksiedze udzialow - patrz naglowek
 * SphereRewards).
 */
contract SelfDestructDonator {
    constructor(address target) payable {
        selfdestruct(payable(target));
    }
}

/**
 * Konsument-kontrakt - dowodzi, ze `pull` dziala, gdy CONSUMER jest kontraktem
 * (Safe/staking), nie tylko EOA. `hub` podawany jako argument wywolania, zeby
 * nie bylo cyklu zaleznosci konstruktorow (hub potrzebuje adresu konsumenta,
 * konsument - adresu huba).
 */
contract PullConsumer {
    receive() external payable {}

    function doPull(address hub, address to, uint256 amount) external {
        ISphereRewards(hub).pull(to, amount);
    }
}

/**
 * Odbiorca release() wchodzacy powrotnie - przy odbiorze swojej nogi ETH
 * probuje zawolac release() jeszcze raz. Straznik `_entered` escrow ma to
 * odbic; sonda zapisuje wynik proby przez goly call (bez importu escrow,
 * zeby sonda kompilowala sie niezaleznie od niego).
 */
contract ReentrantReleaseTarget {
    bool public armed;
    bool public reentered;
    bool public innerSucceeded;
    address private _escrow;

    function arm(address escrow) external {
        _escrow = escrow;
        armed = true;
        reentered = false;
        innerSucceeded = false;
    }

    receive() external payable {
        if (!armed) return;
        armed = false;
        reentered = true;
        (bool ok, ) = _escrow.call(abi.encodeWithSignature("release()"));
        innerSucceeded = ok;
    }
}

/**
 * Konsument wchodzacy powrotnie - przy odbiorze ETH z `pull` probuje wyciagnac
 * jeszcze raz. Dowodzi, ze nawet konsument nie wyciagnie wiecej niz saldo
 * (CEI + limit o biezace saldo). `armed` rozbraja sie przy pierwszym wejsciu,
 * zeby nie wpasc we wlasna nieskonczona petle.
 */
contract ReentrantPullConsumer {
    address private _hub;
    bool public armed;
    bool public reentered;
    bool public innerSucceeded;
    uint256 public pendingAmount;

    function arm(address hub, uint256 amount) external {
        _hub = hub;
        armed = true;
        reentered = false;
        innerSucceeded = false;
        pendingAmount = amount;
    }

    function doPull(address hub, address to, uint256 amount) external {
        _hub = hub;
        ISphereRewards(hub).pull(to, amount);
    }

    receive() external payable {
        if (!armed) return;
        armed = false;
        reentered = true;
        try ISphereRewards(_hub).pull(address(this), pendingAmount) {
            innerSucceeded = true;
        } catch {
            innerSucceeded = false;
        }
    }
}
