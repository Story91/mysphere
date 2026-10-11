// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IPoolManagerV4, IUnlockCallback, PoolKey, SwapParams, BalanceDeltaLib} from "../launchpad/interfaces/IPoolManagerV4.sol";

/**
 * Atrapy do testow launchpada Q (test/QuoteLaunchpad.test.ts). Zaden z tych
 * kontraktow nie idzie na siec.
 */

/**
 * QUOTE w testach: ERC-20 z permitem (jak USDC i B20), z wybierana liczba miejsc
 * po przecinku i z opcjonalna oplata od transferu - ta ostatnia istnieje tylko
 * po to, zeby sprawdzic, ze launchpad ja odrzuca.
 */
contract MockQuoteToken is ERC20Permit {
    uint8 private immutable _decimals;
    /** Oplata od transferu w bps, spalana. 0 = zwykly token. */
    uint16 public transferFeeBps;

    constructor(uint8 decimals_) ERC20("Mock Quote", "MQ") ERC20Permit("Mock Quote") {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setTransferFeeBps(uint16 bps) external {
        transferFeeBps = bps;
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        uint256 fee = (amount * transferFeeBps) / 10_000;
        if (fee != 0) _burn(from, fee);
        super._transfer(from, to, amount - fee);
    }
}

/**
 * CREATE2 dla testow: pozwala wykopac adres QUOTE ponizej albo powyzej adresow
 * tokenow B20 (0xB200...) i sprawdzic OBIE orientacje puli na prawdziwym
 * PoolManagerze.
 */
contract Create2Deployer {
    event Deployed(address addr);

    function deploy(bytes32 salt, bytes calldata initCode) external returns (address addr) {
        bytes memory code = initCode;
        assembly {
            addr := create2(0, add(code, 0x20), mload(code), salt)
        }
        require(addr != address(0), "create2 failed");
        emit Deployed(addr);
    }
}

interface IProbeERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * Wymiana na PRAWDZIWYM PoolManagerze v4 dla pary dwoch ERC-20. Placi to, co
 * jest winna, odbiera to, co sie jej nalezy - wg delty zwroconej przez `swap`,
 * ktora zawiera juz udzial hooka.
 */
contract QuoteSwapProbe is IUnlockCallback {
    address public immutable POOL_MANAGER;

    PoolKey private _key;
    SwapParams private _params;

    int128 public lastDelta0;
    int128 public lastDelta1;

    constructor(address poolManager_) {
        POOL_MANAGER = poolManager_;
    }

    function doSwap(PoolKey calldata key, SwapParams calldata params) external {
        _key = key;
        _params = params;
        IPoolManagerV4(POOL_MANAGER).unlock("");
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        require(msg.sender == POOL_MANAGER, "probe: pm");
        int256 delta = IPoolManagerV4(POOL_MANAGER).swap(_key, _params, "");
        int128 d0 = BalanceDeltaLib.amount0(delta);
        int128 d1 = BalanceDeltaLib.amount1(delta);
        lastDelta0 = d0;
        lastDelta1 = d1;
        _settle(_key.currency0, d0);
        _settle(_key.currency1, d1);
        return "";
    }

    function _settle(address currency, int128 d) private {
        if (d < 0) {
            IPoolManagerV4(POOL_MANAGER).sync(currency);
            IProbeERC20(currency).transfer(POOL_MANAGER, uint256(uint128(-d)));
            IPoolManagerV4(POOL_MANAGER).settle();
        } else if (d > 0) {
            IPoolManagerV4(POOL_MANAGER).take(currency, address(this), uint256(uint128(d)));
        }
    }
}
