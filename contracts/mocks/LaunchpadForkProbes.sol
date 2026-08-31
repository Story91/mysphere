// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {
    IPoolManagerV4,
    IUnlockCallback,
    PoolKey,
    SwapParams,
    BalanceDeltaLib
} from "../launchpad/interfaces/IPoolManagerV4.sol";
import {IB20Asset, IB20AssetFactory, B20AssetCreateParams} from "../launchpad/interfaces/IB20Asset.sol";

interface IForkProbeToken {
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IFullLaunchProbePad {
    function launch(string calldata name, string calldata symbol, uint256 minTokensOut, uint256 deadline)
        external
        payable
        returns (address token, bytes32 launchId);

    function VAULT() external view returns (address);

    function HOOK() external view returns (address);
}

/**
 * Sonda dla forka Base z PRAWDZIWYM PoolManagerem.
 *
 * Lokalny `SwapProbe` czyta `MockPoolManager.deltas()`, bo atrapa trzyma jeden
 * licznik na walute. Prawdziwy v4 tego nie wystawia. Tu rozliczamy sie z delty
 * zwroconej przez `swap`, tak jak robi to normalny integrator: ujemne placimy
 * przez `settle`, dodatnie odbieramy przez `take`.
 */
contract RealPoolSwapProbe is IUnlockCallback {
    using BalanceDeltaLib for int256;

    address public immutable POOL_MANAGER;

    PoolKey private _key;
    SwapParams private _params;

    int128 public lastAmount0;
    int128 public lastAmount1;

    event RealSwapSettled(int128 amount0, int128 amount1);

    error NotPoolManager();
    error TokenTransferFailed();

    constructor(address poolManager_) {
        POOL_MANAGER = poolManager_;
    }

    receive() external payable {}

    function doSwap(PoolKey calldata key, SwapParams calldata params)
        external
        payable
        returns (int128 amount0, int128 amount1)
    {
        _key = key;
        _params = params;

        bytes memory ret = IPoolManagerV4(POOL_MANAGER).unlock("");
        return abi.decode(ret, (int128, int128));
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER) revert NotPoolManager();

        int256 delta = IPoolManagerV4(POOL_MANAGER).swap(_key, _params, "");
        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();

        lastAmount0 = amount0;
        lastAmount1 = amount1;

        if (amount0 < 0) {
            IPoolManagerV4(POOL_MANAGER).settle{value: uint256(uint128(-amount0))}();
        } else if (amount0 > 0) {
            IPoolManagerV4(POOL_MANAGER).take(address(0), address(this), uint256(uint128(amount0)));
        }

        if (amount1 < 0) {
            IPoolManagerV4(POOL_MANAGER).sync(_key.currency1);
            _safeTransfer(_key.currency1, POOL_MANAGER, uint256(uint128(-amount1)));
            IPoolManagerV4(POOL_MANAGER).settle();
        } else if (amount1 > 0) {
            IPoolManagerV4(POOL_MANAGER).take(_key.currency1, address(this), uint256(uint128(amount1)));
        }

        emit RealSwapSettled(amount0, amount1);
        return abi.encode(amount0, amount1);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) =
            token.call(abi.encodeCall(IForkProbeToken.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }
}

/**
 * Sonda wykonywana przez `eth_call` ze state override na prawdziwym RPC Base.
 *
 * Hardhat fork nie umie emulowac B20 precompile, bo pod adresem 0xB20f...
 * nie ma kodu EVM do pobrania. Remote `eth_call` wykonuje natomiast natywna
 * logike wezla Base, wiec tym jednym wywolaniem sprawdzamy trzy rzeczy:
 * kodowanie `params`, semantyke `SEIZE_ROLE()` i transfer ASSET na 0xdEaD.
 */
contract B20PrecompileProbe {
    address public constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint8 public constant VARIANT_ASSET = 0;
    uint8 public constant TOKEN_DECIMALS = 18;
    uint256 public constant SUPPLY = 1_000_000_000e18;

    function run(bytes32 salt)
        external
        returns (
            address token,
            bool seizeRoleStaticcallSucceeded,
            bool deadTransferSucceeded,
            uint256 totalSupply,
            uint256 deadBalance
        )
    {
        bytes memory params = abi.encode(
            B20AssetCreateParams({
                version: 1,
                name: "Fork Probe",
                symbol: "FORK",
                initialAdmin: address(0),
                decimals: TOKEN_DECIMALS
            })
        );

        bytes[] memory initCalls = new bytes[](2);
        initCalls[0] = abi.encodeWithSignature("mint(address,uint256)", address(this), SUPPLY);
        initCalls[1] = abi.encodeWithSignature("updateSupplyCap(uint256)", SUPPLY);

        token = IB20AssetFactory(B20_FACTORY).createB20{value: 0}(VARIANT_ASSET, salt, params, initCalls);
        (seizeRoleStaticcallSucceeded,) = token.staticcall(abi.encodeWithSignature("SEIZE_ROLE()"));

        (bool ok, bytes memory ret) =
            token.call(abi.encodeCall(IB20Asset.transfer, (DEAD, 1)));
        deadTransferSucceeded = ok && (ret.length == 0 || abi.decode(ret, (bool)));

        totalSupply = IB20Asset(token).totalSupply();
        deadBalance = IB20Asset(token).balanceOf(DEAD);
    }
}

/**
 * Sonda pelnego `CurveLaunchpad.launch` z prawdziwym B20 precompile.
 *
 * Wykonywana tylko przez remote `eth_call` ze state override. Loader przyjmuje
 * init code fabryki i launchpada w calldata, zeby nie wbudowywac produkcyjnego
 * bytecode do tej sondy. Mierzy `gasleft` wylacznie wokol `pad.launch`, wiec
 * wynik nie zawiera kosztu deployu sondy, fabryki, launchpada, vaulta ani hooka.
 */
contract FullB20LaunchGasProbe {
    error DeployFailed();

    function run(bytes memory tokenFactoryInitCode, bytes memory launchpadInitCode)
        external
        returns (
            address tokenFactory,
            address launchpad,
            address token,
            address vault,
            address hook,
            uint256 launchGas
        )
    {
        tokenFactory = _deploy(tokenFactoryInitCode);
        launchpad = _deploy(launchpadInitCode);

        uint256 beforeGas = gasleft();
        (token,) = IFullLaunchProbePad(launchpad).launch("Full B20 Gas", "FB20", 0, type(uint256).max);
        launchGas = beforeGas - gasleft();

        vault = IFullLaunchProbePad(launchpad).VAULT();
        hook = IFullLaunchProbePad(launchpad).HOOK();
    }

    function _deploy(bytes memory initCode) private returns (address deployed) {
        assembly {
            deployed := create(0, add(initCode, 0x20), mload(initCode))
        }
        if (deployed == address(0)) revert DeployFailed();
    }
}
