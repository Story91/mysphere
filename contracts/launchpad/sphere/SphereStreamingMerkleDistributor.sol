// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * SphereStreamingMerkleDistributor - wyplaty volume mining (spec 6.1, faza 1B).
 *
 * ===========================================================================
 * DLACZEGO NIE STOCKOWY URD MORPHO (recenzja zewnetrzna 2026-08-30)
 * ===========================================================================
 * W stockowym URD owner moze ominac timelock (setRoot wprost), updater moze
 * nadpisac pending root, a "spor" osoby trzeciej nie ma zadnej mocy on-chain.
 * Ten kontrakt implementuje wymagania speca wprost:
 *   - PROPOSER proponuje root, GUARDIAN ma prawo WYLACZNIE weta (anuluje
 *     pending, nigdy nie ustawia wlasnego) - obie role immutable,
 *   - immutable MIN_DELAY: zaden root nie aktywuje sie przed uplywem okna,
 *   - sekwencyjne numery epok (epochId musi rosnac o 1),
 *   - monotonicznosc naleznosci egzekwowana przy claimie (cum >= prevCum,
 *     claimed nigdy nie przekracza cum),
 *   - wyplacalnosc: aktywacja wymaga balance >= totalCumulative - totalClaimed
 *     (zobowiazania POKRYTE, razem z nieuwolnionymi),
 *   - kanoniczny manifest: kazdy root niesie manifestHash (keccak pelnych
 *     danych wejsciowych + wyniku indexera) - kazdy moze przeliczyc.
 *
 * ===========================================================================
 * STREAMING (decyzja #15, wzor Streme): partie -> bufor -> ciagle uwalnianie
 * ===========================================================================
 * Leaf = keccak(account, cumulativeAmount, prevCumulativeAmount):
 *   - cumulativeAmount: laczna naleznosc konta po tej epoce (kumulatywna,
 *     jak w URD - jeden claim zbiera wszystkie zalegle epoki),
 *   - prevCumulativeAmount: naleznosc konta pod POPRZEDNIM rootem - w pelni
 *     uwolniona; PRZYROST (cum - prevCum) uwalnia sie LINIOWO przez
 *     STREAM_DURATION od aktywacji roota.
 * streamStart == moment aktywacji, czyli ZAWSZE po oknie weta - weto nie
 * moze anulowac strumienia, ktory juz plynie.
 *
 * Zero admina poza dwiema immutable rolami; brak rescue/sweep - token,
 * ktory tu wplynal, wychodzi wylacznie przez claimy.
 */

interface IDistributorToken {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SphereStreamingMerkleDistributor {
    /** Token wyplat (SPHERE) - ustalany przy wdrozeniu PO launchu tokena. */
    address public immutable TOKEN;
    /** Jedyny adres mogacy proponowac rooty (Safe operacyjny / proposer). */
    address public immutable PROPOSER;
    /** Jedyny adres mogacy WETOWAC pending root. Nigdy nie ustawia wlasnego. */
    address public immutable GUARDIAN;
    /** Okno weta: pending root nie aktywuje sie wczesniej. */
    uint64 public immutable MIN_DELAY;
    /** Czas liniowego uwalniania przyrostu epoki (decyzja #15: 1 epoka). */
    uint64 public immutable STREAM_DURATION;

    struct Pending {
        bytes32 root;
        bytes32 manifestHash;
        uint64 epochId;
        uint256 totalCumulative;
        uint64 validAt;
    }

    Pending public pending;

    bytes32 public root;
    bytes32 public manifestHash;
    uint64 public epochId;
    uint64 public activatedAt;
    uint256 public totalCumulative;
    uint256 public totalClaimed;

    mapping(address => uint256) public claimed;

    event RootProposed(bytes32 indexed newRoot, bytes32 manifestHash, uint64 indexed epochId, uint256 totalCumulative, uint64 validAt);
    event RootVetoed(bytes32 indexed vetoedRoot, uint64 indexed epochId, address indexed guardian);
    event RootActivated(bytes32 indexed newRoot, bytes32 manifestHash, uint64 indexed epochId, uint256 totalCumulative);
    event Claimed(address indexed account, uint256 amount, uint256 cumulative, address indexed caller);

    error ZeroAddress();
    error BadSchedule();
    error NotProposer();
    error NotGuardian();
    error NoPendingRoot();
    error TimelockNotElapsed();
    error WrongEpochId();
    error ShrinkingTotal();
    error Insolvent();
    error InvalidProof();
    error NonMonotonicLeaf();
    error NothingToClaim();
    error TokenTransferFailed();

    constructor(address token_, address proposer_, address guardian_, uint64 minDelay_, uint64 streamDuration_) {
        if (token_ == address(0) || proposer_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        // Guardian == proposer uniewaznialby weto (proponujacy wetuje sam
        // siebie = zadnej kontroli). Odpada przy wdrozeniu, nie w praktyce.
        if (guardian_ == proposer_) revert ZeroAddress();
        if (minDelay_ == 0 || streamDuration_ == 0) revert BadSchedule();
        TOKEN = token_;
        PROPOSER = proposer_;
        GUARDIAN = guardian_;
        MIN_DELAY = minDelay_;
        STREAM_DURATION = streamDuration_;
    }

    /* ====================================================================== */
    /*  CYKL ROOTA: propose -> (veto | activate)                              */
    /* ====================================================================== */

    /**
     * Propozycja roota kolejnej epoki. Nadpisuje wczesniejszy pending (nowa
     * propozycja = nowe okno weta - guardian zawsze ma pelne MIN_DELAY na
     * reakcje na to, co faktycznie moze sie aktywowac).
     */
    function propose(bytes32 root_, bytes32 manifestHash_, uint64 epochId_, uint256 totalCumulative_) external {
        if (msg.sender != PROPOSER) revert NotProposer();
        if (epochId_ != epochId + 1) revert WrongEpochId();
        // Kumulatywny total nie moze sie skurczyc - nowy root MUSI zachowac
        // wszystkie wczesniejsze naleznosci (monotonicznosc globalna).
        if (totalCumulative_ < totalCumulative) revert ShrinkingTotal();

        pending = Pending({
            root: root_,
            manifestHash: manifestHash_,
            epochId: epochId_,
            totalCumulative: totalCumulative_,
            validAt: uint64(block.timestamp) + MIN_DELAY
        });
        emit RootProposed(root_, manifestHash_, epochId_, totalCumulative_, pending.validAt);
    }

    /** Weto guardiana: kasuje pending. NIE ustawia niczego w zamian. */
    function veto() external {
        if (msg.sender != GUARDIAN) revert NotGuardian();
        if (pending.validAt == 0) revert NoPendingRoot();
        emit RootVetoed(pending.root, pending.epochId, msg.sender);
        delete pending;
    }

    /**
     * Aktywacja po oknie weta - moze zawolac KTOKOLWIEK (aktywacja jest
     * mechaniczna; decyzje podjeto w propose, kontrole w wecie).
     * Wymog wyplacalnosci: saldo pokrywa CALE zobowiazanie (z nieuwolnionym).
     */
    function activate() external {
        Pending memory p = pending;
        if (p.validAt == 0) revert NoPendingRoot();
        if (block.timestamp < p.validAt) revert TimelockNotElapsed();
        if (IDistributorToken(TOKEN).balanceOf(address(this)) + totalClaimed < p.totalCumulative) {
            revert Insolvent();
        }

        root = p.root;
        manifestHash = p.manifestHash;
        epochId = p.epochId;
        totalCumulative = p.totalCumulative;
        activatedAt = uint64(block.timestamp);
        delete pending;
        emit RootActivated(root, manifestHash, epochId, totalCumulative);
    }

    /* ====================================================================== */
    /*  CLAIM ZE STREAMINGIEM                                                  */
    /* ====================================================================== */

    /** Ile z naleznosci konta jest uwolnione TERAZ (prevCum + liniowy przyrost). */
    function vestedOf(uint256 cumulative, uint256 prevCumulative) public view returns (uint256) {
        if (cumulative < prevCumulative) revert NonMonotonicLeaf();
        uint256 elapsed = block.timestamp - activatedAt;
        if (elapsed >= STREAM_DURATION) return cumulative;
        return prevCumulative + ((cumulative - prevCumulative) * elapsed) / STREAM_DURATION;
    }

    /**
     * Odbior naroslej czesci. Ktokolwiek placi gaz, tokeny ida do `account`
     * (permissionless delivery jak claimFor w padzie). Jeden claim zbiera
     * wszystkie zalegle epoki (kumulatywnosc) az po biezaco uwolniona czesc.
     */
    function claim(address account, uint256 cumulative, uint256 prevCumulative, bytes32[] calldata proof) external {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, cumulative, prevCumulative))));
        if (!MerkleProof.verifyCalldata(proof, root, leaf)) revert InvalidProof();

        uint256 vested = vestedOf(cumulative, prevCumulative);
        uint256 already = claimed[account];
        if (vested <= already) revert NothingToClaim();
        uint256 amount = vested - already;

        claimed[account] = vested;
        totalClaimed += amount;
        emit Claimed(account, amount, cumulative, msg.sender);

        (bool ok, bytes memory ret) = TOKEN.call(abi.encodeCall(IDistributorToken.transfer, (account, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }
}
