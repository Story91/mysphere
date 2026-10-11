// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {
    IPoolManagerV4,
    IUnlockCallback,
    PoolKey,
    ModifyLiquidityParams,
    BalanceDeltaLib
} from "../launchpad/interfaces/IPoolManagerV4.sol";

interface IZapProbeERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * Plynnosc full-range na PRAWDZIWYM PoolManagerze - do testow PerpBuyZap.
 * Tokeny musza lezec na sondzie, ETH przychodzi wartoscia wywolania (reszta wraca).
 */
contract ZapLiquidityProbe is IUnlockCallback {
    address public immutable POOL_MANAGER;

    constructor(address poolManager_) {
        POOL_MANAGER = poolManager_;
    }

    function add(PoolKey calldata key, int24 tickLower, int24 tickUpper, int256 liquidity) external payable {
        IPoolManagerV4(POOL_MANAGER).unlock(abi.encode(key, tickLower, tickUpper, liquidity));
        if (address(this).balance != 0) payable(msg.sender).transfer(address(this).balance);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == POOL_MANAGER, "probe: pm");
        (PoolKey memory key, int24 lo, int24 hi, int256 liq) = abi.decode(data, (PoolKey, int24, int24, int256));
        (int256 delta,) = IPoolManagerV4(POOL_MANAGER).modifyLiquidity(key, ModifyLiquidityParams(lo, hi, liq, 0), "");
        _pay(key.currency0, BalanceDeltaLib.amount0(delta));
        _pay(key.currency1, BalanceDeltaLib.amount1(delta));
        return "";
    }

    function _pay(address currency, int128 d) private {
        if (d >= 0) return;
        uint256 amount = uint256(uint128(-d));
        if (currency == address(0)) {
            IPoolManagerV4(POOL_MANAGER).settle{value: amount}();
        } else {
            IPoolManagerV4(POOL_MANAGER).sync(currency);
            IZapProbeERC20(currency).transfer(POOL_MANAGER, amount);
            IPoolManagerV4(POOL_MANAGER).settle();
        }
    }

    receive() external payable {}
}
