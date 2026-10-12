// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {PoolKey} from "../interfaces/IPoolManagerV4.sol";

interface IRaidEthLaunchpad {
    function buy(address token, uint256 minTokensOut, uint256 deadline) external payable returns (uint256 tokensOut);
}

interface IRaidQuoteLaunchpad {
    function QUOTE() external view returns (address);
}

interface IRaidZap {
    function buyWithEth(
        address launchpad,
        address token,
        PoolKey calldata ethPool,
        PoolKey calldata perpPool,
        uint256 minPerpOut,
        uint256 minTokensOut,
        uint256 deadline,
        address recipient
    ) external payable returns (uint256 perpIn, uint256 tokensOut);
}

interface IRaidToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * RAID: wspolne kupno ekipy jednym strzalem.
 *
 * Lider zaklada raid na token Startpada, ekipa wplaca ETH do chwili startu
 * (i moze sie wycofac do `executeAfter`), po `executeAfter` lider odpala JEDNO
 * kupno za cala pule, a kazdy odbiera tokeny proporcjonalnie do wplaty.
 *
 *   tryb ETH:  launchpad.buy{value}            (rynek ETH, tokeny do vaulta)
 *   tryb PERP: PerpZap.buyWithEth{value}(...)  (rynki perpow, ETH -> perp -> mem)
 *
 * Resztki (zwrot z krzywej przy jej zapelnieniu: ETH albo perp) tez sa dzielone
 * proporcjonalnie. Gdy lider nie odpali raidu do `expiresAt` albo go anuluje,
 * kazdy odbiera swoje ETH w calosci.
 *
 * ZAUFANIE: odpala tylko lider i to on podaje ochrone ceny (minTokensOut). To
 * swiadoma decyzja: odpalenie "przez kazdego" z minimum 1 zapraszaloby do
 * kanapki na wspolnych pieniadzach. Ekipa ufa liderowi - UI mowi to wprost.
 * Vault nie ma wlasciciela, pauzy ani wyplaty "awaryjnej".
 */
contract RaidVault {
    enum Mode {
        Eth,
        Perp
    }

    enum Status {
        None,
        Open,
        Executed,
        Cancelled
    }

    struct Raid {
        address leader;
        Mode mode;
        Status status;
        address launchpad;
        address token;
        address zap; // tylko tryb PERP
        uint40 executeAfter;
        uint40 expiresAt;
        uint256 totalEth;
        uint256 tokensBought;
        uint256 ethLeft; // ETH do podzialu po kupnie (zwrot z krzywej / zapa)
        uint256 perpLeft; // perp do podzialu po kupnie (zwrot z krzywej, tryb PERP)
        string note;
    }

    uint256 public constant MAX_DURATION = 7 days;
    uint256 public constant MIN_DEPOSIT = 0.00001 ether;

    Raid[] private _raids;
    mapping(uint256 => PoolKey) private _ethPool;
    mapping(uint256 => PoolKey) private _perpPool;
    mapping(uint256 => mapping(address => uint256)) public deposits;
    mapping(uint256 => mapping(address => bool)) public settled;
    uint256 private _locked;

    event RaidCreated(
        uint256 indexed id,
        address indexed leader,
        address indexed token,
        address launchpad,
        Mode mode,
        uint40 executeAfter,
        uint40 expiresAt,
        string note
    );
    event Joined(uint256 indexed id, address indexed member, uint256 amount, uint256 totalEth);
    event Left(uint256 indexed id, address indexed member, uint256 amount, uint256 totalEth);
    event Executed(uint256 indexed id, uint256 ethSpent, uint256 tokensBought, uint256 ethLeft, uint256 perpLeft);
    event Claimed(uint256 indexed id, address indexed member, uint256 tokens, uint256 eth, uint256 perp);
    event Cancelled(uint256 indexed id);
    event Refunded(uint256 indexed id, address indexed member, uint256 amount);

    error BadTiming();
    error BadRaid();
    error NotOpen();
    error NotLeader();
    error TooSmall();
    error NothingToClaim();
    error Reentrancy();
    error TransferFailed();
    error BadRoute();

    modifier nonReentrant() {
        if (_locked != 0) revert Reentrancy();
        _locked = 1;
        _;
        _locked = 0;
    }

    /* ===================================================================== */
    /*  ZAKLADANIE I WPLATY                                                   */
    /* ===================================================================== */

    /**
     * Raid na rynku ETH. `msg.value` (opcjonalnie) to wplata lidera.
     */
    function createEthRaid(address launchpad, address token, uint40 executeAfter, uint40 expiresAt, string calldata note)
        external
        payable
        returns (uint256 id)
    {
        id = _create(Mode.Eth, launchpad, token, address(0), executeAfter, expiresAt, note);
    }

    /**
     * Raid na rynku perpa przez PerpZap. Pule jak w zapie: ETH/USDC i USDC/perp.
     */
    function createPerpRaid(
        address launchpad,
        address token,
        address zap,
        PoolKey calldata ethPool,
        PoolKey calldata perpPool,
        uint40 executeAfter,
        uint40 expiresAt,
        string calldata note
    ) external payable returns (uint256 id) {
        if (zap == address(0) || zap.code.length == 0) revert BadRoute();
        address perp = IRaidQuoteLaunchpad(launchpad).QUOTE();
        if (ethPool.currency0 != address(0)) revert BadRoute();
        if (perpPool.currency0 != perp && perpPool.currency1 != perp) revert BadRoute();
        id = _create(Mode.Perp, launchpad, token, zap, executeAfter, expiresAt, note);
        _ethPool[id] = ethPool;
        _perpPool[id] = perpPool;
    }

    function _create(
        Mode mode,
        address launchpad,
        address token,
        address zap,
        uint40 executeAfter,
        uint40 expiresAt,
        string calldata note
    ) private returns (uint256 id) {
        if (launchpad.code.length == 0 || token == address(0)) revert BadRaid();
        if (executeAfter < block.timestamp || expiresAt <= executeAfter || expiresAt > block.timestamp + MAX_DURATION) revert BadTiming();
        if (bytes(note).length > 140) revert BadRaid();
        id = _raids.length;
        _raids.push(
            Raid({
                leader: msg.sender,
                mode: mode,
                status: Status.Open,
                launchpad: launchpad,
                token: token,
                zap: zap,
                executeAfter: executeAfter,
                expiresAt: expiresAt,
                totalEth: 0,
                tokensBought: 0,
                ethLeft: 0,
                perpLeft: 0,
                note: note
            })
        );
        emit RaidCreated(id, msg.sender, token, launchpad, mode, executeAfter, expiresAt, note);
        if (msg.value != 0) _join(id);
    }

    function join(uint256 id) external payable nonReentrant {
        _join(id);
    }

    function _join(uint256 id) private {
        Raid storage r = _raid(id);
        if (r.status != Status.Open || block.timestamp >= r.expiresAt) revert NotOpen();
        if (msg.value < MIN_DEPOSIT) revert TooSmall();
        deposits[id][msg.sender] += msg.value;
        r.totalEth += msg.value;
        emit Joined(id, msg.sender, msg.value, r.totalEth);
    }

    /** Wycofanie sie przed startem (do `executeAfter`). */
    function leave(uint256 id) external nonReentrant {
        Raid storage r = _raid(id);
        if (r.status != Status.Open || block.timestamp >= r.executeAfter) revert NotOpen();
        uint256 amount = deposits[id][msg.sender];
        if (amount == 0) revert NothingToClaim();
        deposits[id][msg.sender] = 0;
        r.totalEth -= amount;
        emit Left(id, msg.sender, amount, r.totalEth);
        _sendEth(msg.sender, amount);
    }

    /* ===================================================================== */
    /*  START                                                                 */
    /* ===================================================================== */

    /**
     * Jedno kupno za cala pule. Tylko lider, miedzy `executeAfter` a `expiresAt`.
     * `minTokensOut` (i `minPerpOut` w trybie PERP) to ochrona ceny lidera.
     */
    function execute(uint256 id, uint256 minPerpOut, uint256 minTokensOut) external nonReentrant returns (uint256 tokensBought) {
        Raid storage r = _raid(id);
        if (msg.sender != r.leader) revert NotLeader();
        if (r.status != Status.Open) revert NotOpen();
        if (block.timestamp < r.executeAfter || block.timestamp >= r.expiresAt) revert BadTiming();
        if (r.totalEth == 0) revert TooSmall();

        uint256 total = r.totalEth;
        uint256 ethBefore = address(this).balance - total;
        uint256 tokBefore = IRaidToken(r.token).balanceOf(address(this));
        address perp = r.mode == Mode.Perp ? IRaidQuoteLaunchpad(r.launchpad).QUOTE() : address(0);
        uint256 perpBefore = perp == address(0) ? 0 : IRaidToken(perp).balanceOf(address(this));

        // Efekt przed wywolaniem: raid nie moze zostac odpalony drugi raz.
        r.status = Status.Executed;
        if (r.mode == Mode.Eth) {
            IRaidEthLaunchpad(r.launchpad).buy{value: total}(r.token, minTokensOut, block.timestamp);
        } else {
            IRaidZap(r.zap).buyWithEth{value: total}(
                r.launchpad, r.token, _ethPool[id], _perpPool[id], minPerpOut, minTokensOut, block.timestamp, address(this)
            );
        }

        r.tokensBought = IRaidToken(r.token).balanceOf(address(this)) - tokBefore;
        r.ethLeft = address(this).balance - ethBefore;
        if (perp != address(0)) r.perpLeft = IRaidToken(perp).balanceOf(address(this)) - perpBefore;
        if (r.tokensBought == 0) revert TooSmall();
        tokensBought = r.tokensBought;
        emit Executed(id, total - r.ethLeft, r.tokensBought, r.ethLeft, r.perpLeft);
    }

    function cancel(uint256 id) external {
        Raid storage r = _raid(id);
        if (msg.sender != r.leader) revert NotLeader();
        if (r.status != Status.Open) revert NotOpen();
        r.status = Status.Cancelled;
        emit Cancelled(id);
    }

    /* ===================================================================== */
    /*  ODBIOR                                                                */
    /* ===================================================================== */

    /** Po starcie: tokeny i resztki proporcjonalnie do wplaty. */
    function claim(uint256 id) external nonReentrant {
        Raid storage r = _raid(id);
        if (r.status != Status.Executed) revert NotOpen();
        uint256 dep = deposits[id][msg.sender];
        if (dep == 0 || settled[id][msg.sender]) revert NothingToClaim();
        settled[id][msg.sender] = true;

        uint256 tokens = (r.tokensBought * dep) / r.totalEth;
        uint256 eth = (r.ethLeft * dep) / r.totalEth;
        uint256 perpAmt = (r.perpLeft * dep) / r.totalEth;
        emit Claimed(id, msg.sender, tokens, eth, perpAmt);
        if (tokens != 0) _transfer(r.token, msg.sender, tokens);
        if (perpAmt != 0) _transfer(IRaidQuoteLaunchpad(r.launchpad).QUOTE(), msg.sender, perpAmt);
        if (eth != 0) _sendEth(msg.sender, eth);
    }

    /** Raid anulowany albo nieodpalony do `expiresAt`: pelny zwrot wplaty. */
    function refund(uint256 id) external nonReentrant {
        Raid storage r = _raid(id);
        bool expired = r.status == Status.Open && block.timestamp >= r.expiresAt;
        if (r.status != Status.Cancelled && !expired) revert NotOpen();
        uint256 dep = deposits[id][msg.sender];
        if (dep == 0 || settled[id][msg.sender]) revert NothingToClaim();
        settled[id][msg.sender] = true;
        emit Refunded(id, msg.sender, dep);
        _sendEth(msg.sender, dep);
    }

    /* ===================================================================== */
    /*  ODCZYT                                                                */
    /* ===================================================================== */

    function raidCount() external view returns (uint256) {
        return _raids.length;
    }

    function raidOf(uint256 id) external view returns (Raid memory) {
        return _raid(id);
    }

    function poolsOf(uint256 id) external view returns (PoolKey memory ethPool, PoolKey memory perpPool) {
        return (_ethPool[id], _perpPool[id]);
    }

    function _raid(uint256 id) private view returns (Raid storage) {
        if (id >= _raids.length) revert BadRaid();
        return _raids[id];
    }

    function _transfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IRaidToken.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _sendEth(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /** Zwrot z krzywej (tryb ETH) i niewydane ETH z zapa (tryb PERP). */
    receive() external payable {}
}
