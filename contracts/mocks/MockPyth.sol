// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IPythMinimal} from "../derivatives/PythAggregatorAdapter.sol";

/** Pyth do testow: cena ustawiana recznie, brak feedu rewertuje jak oryginal. */
contract MockPyth is IPythMinimal {
    mapping(bytes32 => Price) private _prices;
    mapping(bytes32 => bool) private _exists;

    error PriceFeedNotFound();

    function setPrice(bytes32 id, int64 price, int32 expo, uint256 publishTime) external {
        _prices[id] = Price({price: price, conf: 0, expo: expo, publishTime: publishTime});
        _exists[id] = true;
    }

    function getPriceUnsafe(bytes32 id) external view returns (Price memory) {
        if (!_exists[id]) revert PriceFeedNotFound();
        return _prices[id];
    }
}
