// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * SphereTokenVesting - jawny lock/vesting tokenow skarbca (decyzja #11a,
 * 2026-08-30: tokeny SPHERE z escrow ida do vestingu, nie do gologo Safe).
 *
 * ===========================================================================
 * ROLA
 * ===========================================================================
 * TOKEN_TARGET escrow wskazuje TEN kontrakt. releaseToken() escrow wysyla tu
 * dev-buy i tokenowa noge fee; stad tokeny wychodza WYLACZNIE do BENEFICIARY
 * (Safe operacyjny) i WYLACZNIE wg harmonogramu zapietego przy wdrozeniu.
 * Harmonogram jest jawny on-chain - kazdy moze policzyc, ile skarbiec moze
 * wyjac dzisiaj.
 *
 * ===========================================================================
 * MODEL: VESTING PO SALDZIE (wzor OZ VestingWallet)
 * ===========================================================================
 * vested(t) = (saldo + wyplacone) * min(1, (t - START) / DURATION), z klifem.
 *
 * Tokeny KAPIA tu na biezaco (noga tokenowa fee plynie latami), wiec nie ma
 * jednej "kwoty do zvestowania" - kazdy nowy wplyw automatycznie wchodzi do
 * puli i vestuje wg tego samego zegara. Po koncu harmonogramu wszystko, co
 * przyjdzie, jest natychmiast wyplacalne - vesting dyscyplinuje przede
 * wszystkim poczatkowy dev-buy, a nie wieczny strumien.
 *
 * Zero admina: brak zmiany beneficjenta, harmonogramu, brak rescue. Kontrakt
 * jest generyczny per token (mapping released), zeby ZADEN ERC-20 wrzucony
 * tutaj nie zamurowal sie na zawsze.
 */

interface IVestingToken {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SphereTokenVesting {
    /** Jedyny odbiorca wyplat - Safe operacyjny skarbca. */
    address public immutable BENEFICIARY;
    /** Poczatek zegara vestingu (unix). Ustalany na moment launchu SPHERE. */
    uint64 public immutable START;
    /** Do (START + CLIFF) nie wychodzi nic. */
    uint64 public immutable CLIFF;
    /** Po (START + DURATION) wychodzi wszystko. Liniowo pomiedzy. */
    uint64 public immutable DURATION;

    /** Ile juz wyplacono per token - wchodzi do podstawy vested(). */
    mapping(address => uint256) public released;

    event TokensReleased(address indexed token, uint256 amount, address indexed caller);

    error ZeroAddress();
    error BadSchedule();
    error NothingToRelease();
    error TokenTransferFailed();

    constructor(address beneficiary_, uint64 start_, uint64 cliff_, uint64 duration_) {
        if (beneficiary_ == address(0)) revert ZeroAddress();
        // Klif dluzszy niz caly harmonogram to konfiguracja bez sensu -
        // odpada przy wdrozeniu, nie przy pierwszej wyplacie.
        if (duration_ == 0 || cliff_ > duration_) revert BadSchedule();
        BENEFICIARY = beneficiary_;
        START = start_;
        CLIFF = cliff_;
        DURATION = duration_;
    }

    /** Laczna podstawa vestingu: to, co lezy, plus to, co juz wyszlo. */
    function totalReceived(address token) public view returns (uint256) {
        return IVestingToken(token).balanceOf(address(this)) + released[token];
    }

    /** Ile z podstawy jest juz odblokowane w chwili `timestamp`. */
    function vestedAmount(address token, uint64 timestamp) public view returns (uint256) {
        uint256 total = totalReceived(token);
        if (timestamp < START + CLIFF) return 0;
        if (timestamp >= START + DURATION) return total;
        return (total * (timestamp - START)) / DURATION;
    }

    /** Ile mozna wyplacic TERAZ. */
    function releasable(address token) public view returns (uint256) {
        return vestedAmount(token, uint64(block.timestamp)) - released[token];
    }

    /**
     * Wyplata odblokowanej czesci do BENEFICIARY. Bezuprawnieniowa - kierunek
     * zaszyty, wolajacy placi tylko gaz. CEI: `released` rosnie przed
     * transferem, wiec wejscie powrotne widzi juz pomniejszona baze.
     */
    function release(address token) external {
        uint256 amount = releasable(token);
        // Rewert zamiast cichego przejscia - pusta transakcja wygladalaby
        // w historii jak wyplata (ta sama doktryna co _payout launchpada).
        if (amount == 0) revert NothingToRelease();

        released[token] += amount;
        emit TokensReleased(token, amount, msg.sender);

        (bool ok, bytes memory ret) =
            token.call(abi.encodeCall(IVestingToken.transfer, (BENEFICIARY, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }
}
