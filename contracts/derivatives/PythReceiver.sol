// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

import {IPythMinimal} from "./PythAggregatorAdapter.sol";

/**
 * PYTH RECEIVER - wlasny odbiornik aktualizacji Pytha na Arc.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Kontrakt Pytha na Arc testnet (0x2880aB15...C17B43, 1.4.5-alpha.1) nie
 * przeszedl upgrade'u z 26.08.2026 i przyjmuje tylko VAA podpisane
 * zestawem straznikow Wormhole nr 7. Hermes od tego dnia podpisuje
 * "guardian set 1" - piecioma kluczami Pytha, po trzy podpisy na
 * aktualizacje. Kontraktu Pytha nie mozemy podniesc (governance Pytha).
 * Mozemy za to sami zweryfikowac te same podpisy i to samo drzewo Merkle,
 * bo format jest publiczny (pyth-crosschain, Apache-2.0). Ten kontrakt
 * robi dokladnie to i nic wiecej.
 *
 * ===========================================================================
 * CO WERYFIKUJE, KROK PO KROKU
 * ===========================================================================
 * 1. Naglowek PNAU (magic, major = 1, typ 0 = WormholeMerkle).
 * 2. VAA: kazdy podpis odzyskany ecrecover nad keccak(keccak(cialo)) musi
 *    trafic w straznika o podanym indeksie, indeksy rosnaco (jeden straznik
 *    = jeden podpis), liczba podpisow >= quorum.
 * 3. Emiter VAA = zapisane zrodlo danych (Pythnet, chain 26, emiter
 *    "PythnetPythnet..."). Cudzy emiter z prawidlowymi podpisami odpada.
 * 4. Ladunek VAA: magic AUWV, typ 0, korzen Merkle (20 bajtow).
 * 5. Kazda wiadomosc cenowa: dowod Merkle (lisc = keccak(0x00 || dane),
 *    wezel = keccak(0x01 || min || max), 20 bajtow) prowadzi do korzenia.
 * 6. Zapis tylko, gdy publishTime jest nowszy niz zapisany.
 *
 * ===========================================================================
 * ZALOZENIE ZAUFANIA - NAZWANE, NIE SCHOWANE
 * ===========================================================================
 * U Pytha zestaw kluczy zmienia governance przez Wormhole. Tu zmienia go
 * `owner` (setGuardianSet). To JEST wieksze zaufanie niz do Pytha: kto ma
 * klucz ownera, moze wpisac wlasne klucze i podpisywac dowolne ceny. Na
 * testnecie to akceptowalne; na mainnecie owner musi byc multisigiem z
 * opoznieniem albo tego kontraktu nie wolno uzyc. Klucze straznikow sa
 * odzyskane z prawdziwych podpisow Hermesa
 * (scripts/derivatives/collect-pyth-signers.ts) - nie z zadnej listy,
 * ktora ktos nam przyslal.
 *
 * ===========================================================================
 * CZEGO TU NIE MA
 * ===========================================================================
 * - Oplata za aktualizacje = 0 (getUpdateFee oddaje 0; wolajacy placi gaz).
 * - Brak governance Wormhole, brak aktualizacji zestawu z VAA.
 * - Brak getPriceNoOlderThan: adapter i tak liczy wiek sam.
 * - `conf` zapisujemy, ale nikt go tu nie interpretuje.
 */
contract PythReceiver is IPythMinimal {
    /* ====================================================================== */
    /*  STALE FORMATU (pyth-crosschain)                                        */
    /* ====================================================================== */

    uint32 private constant ACCUMULATOR_MAGIC = 0x504e4155; // "PNAU"
    uint32 private constant ACCUMULATOR_WORMHOLE_MAGIC = 0x41555756; // "AUWV"
    uint8 private constant MAJOR_VERSION = 1;
    uint8 private constant UPDATE_TYPE_WORMHOLE_MERKLE = 0;
    uint8 private constant MESSAGE_TYPE_PRICE_FEED = 0;
    bytes1 private constant MERKLE_LEAF_PREFIX = 0x00;
    bytes1 private constant MERKLE_NODE_PREFIX = 0x01;

    /* ====================================================================== */
    /*  STAN                                                                   */
    /* ====================================================================== */

    address public owner;
    /** Straznicy wg indeksu z VAA. Pusty adres = indeks nieuzywany. */
    address[] public guardians;
    uint8 public quorum;
    /** Zestaw, ktory VAA musi wskazac. Inny numer = odrzucone. */
    uint32 public guardianSetIndex;

    uint16 public immutable SOURCE_CHAIN_ID;
    bytes32 public immutable SOURCE_EMITTER;

    mapping(bytes32 => Price) private _latest;
    mapping(bytes32 => bool) private _exists;

    event GuardianSetChanged(uint32 indexed setIndex, uint8 quorum, uint256 count);
    event PriceFeedUpdate(bytes32 indexed id, uint64 publishTime, int64 price, uint64 conf);
    event OwnerChanged(address indexed from, address indexed to);

    error NotOwner();
    error ZeroAddress();
    error BadQuorum();
    error InvalidUpdateData();
    error InvalidVaaVersion();
    error WrongGuardianSet(uint32 got);
    error GuardianIndexOutOfRange(uint8 index);
    error SignaturesNotAscending();
    error InvalidSignature(uint8 index);
    error NoQuorum(uint8 got, uint8 need);
    error InvalidDataSource(uint16 chainId, bytes32 emitter);
    error InvalidMerkleProof();
    error PriceFeedNotFound();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address[] memory guardians_,
        uint8 quorum_,
        uint32 guardianSetIndex_,
        uint16 sourceChainId,
        bytes32 sourceEmitter
    ) {
        owner = msg.sender;
        SOURCE_CHAIN_ID = sourceChainId;
        SOURCE_EMITTER = sourceEmitter;
        _setGuardianSet(guardians_, quorum_, guardianSetIndex_);
    }

    /* ====================================================================== */
    /*  ADMINISTRACJA                                                          */
    /* ====================================================================== */

    function setGuardianSet(address[] calldata guardians_, uint8 quorum_, uint32 setIndex) external onlyOwner {
        _setGuardianSet(guardians_, quorum_, setIndex);
    }

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        emit OwnerChanged(owner, to);
        owner = to;
    }

    function _setGuardianSet(address[] memory guardians_, uint8 quorum_, uint32 setIndex) private {
        if (quorum_ == 0 || quorum_ > guardians_.length) revert BadQuorum();
        delete guardians;
        for (uint256 i = 0; i < guardians_.length; i++) guardians.push(guardians_[i]);
        quorum = quorum_;
        guardianSetIndex = setIndex;
        emit GuardianSetChanged(setIndex, quorum_, guardians_.length);
    }

    function guardianCount() external view returns (uint256) {
        return guardians.length;
    }

    /* ====================================================================== */
    /*  ODCZYT (IPythMinimal)                                                  */
    /* ====================================================================== */

    function getPriceUnsafe(bytes32 id) external view returns (Price memory price) {
        if (!_exists[id]) revert PriceFeedNotFound();
        return _latest[id];
    }

    function priceFeedExists(bytes32 id) external view returns (bool) {
        return _exists[id];
    }

    /** Zgodnosc z IPyth: keeper pyta o oplate przed wyslaniem. Tu zawsze 0. */
    function getUpdateFee(bytes[] calldata) external pure returns (uint256) {
        return 0;
    }

    /* ====================================================================== */
    /*  AKTUALIZACJA                                                           */
    /* ====================================================================== */

    function updatePriceFeeds(bytes[] calldata updateData) external payable {
        for (uint256 i = 0; i < updateData.length; i++) _processUpdate(updateData[i]);
    }

    function _processUpdate(bytes calldata data) private {
        uint256 o = 0;
        if (data.length < 8 || _u32(data, o) != ACCUMULATOR_MAGIC) revert InvalidUpdateData();
        o += 4;
        if (_u8(data, o) != MAJOR_VERSION) revert InvalidUpdateData();
        o += 2; // major, minor
        uint8 trailing = _u8(data, o);
        o += 1 + trailing;
        if (_u8(data, o) != UPDATE_TYPE_WORMHOLE_MERKLE) revert InvalidUpdateData();
        o += 1;
        uint16 vaaLen = _u16(data, o);
        o += 2;
        bytes calldata vaa = data[o:o + vaaLen];
        o += vaaLen;

        bytes20 root = _verifyVaaAndGetRoot(vaa);

        uint8 n = _u8(data, o);
        o += 1;
        for (uint256 i = 0; i < n; i++) {
            uint16 msgLen = _u16(data, o);
            o += 2;
            bytes calldata message = data[o:o + msgLen];
            o += msgLen;
            uint8 proofLen = _u8(data, o);
            o += 1;
            bytes calldata proof = data[o:o + uint256(proofLen) * 20];
            o += uint256(proofLen) * 20;

            if (!_merkleValid(root, message, proof)) revert InvalidMerkleProof();
            _storeMessage(message);
        }
        if (o != data.length) revert InvalidUpdateData();
    }

    /* ---- VAA ---- */

    function _verifyVaaAndGetRoot(bytes calldata vaa) private view returns (bytes20 root) {
        if (vaa.length < 6 || _u8(vaa, 0) != 1) revert InvalidVaaVersion();
        uint32 setIndex = _u32(vaa, 1);
        if (setIndex != guardianSetIndex) revert WrongGuardianSet(setIndex);
        uint8 sigCount = _u8(vaa, 5);
        uint256 bodyStart = 6 + uint256(sigCount) * 66;
        if (vaa.length < bodyStart + 51) revert InvalidUpdateData();

        bytes32 digest = keccak256(abi.encodePacked(keccak256(vaa[bodyStart:])));

        uint256 lastIndex = 0;
        for (uint256 i = 0; i < sigCount; i++) {
            uint256 p = 6 + i * 66;
            uint8 idx = _u8(vaa, p);
            if (i > 0 && idx <= lastIndex) revert SignaturesNotAscending();
            lastIndex = idx;
            if (idx >= guardians.length) revert GuardianIndexOutOfRange(idx);
            bytes32 r = bytes32(vaa[p + 1:p + 33]);
            bytes32 s = bytes32(vaa[p + 33:p + 65]);
            uint8 v = _u8(vaa, p + 65) + 27;
            address signer = ecrecover(digest, v, r, s);
            if (signer == address(0) || signer != guardians[idx]) revert InvalidSignature(idx);
        }
        if (sigCount < quorum) revert NoQuorum(sigCount, quorum);

        // Cialo: timestamp(4) nonce(4) chain(2) emitter(32) sequence(8) consistency(1) payload
        uint16 chainId = _u16(vaa, bodyStart + 8);
        bytes32 emitter = bytes32(vaa[bodyStart + 10:bodyStart + 42]);
        if (chainId != SOURCE_CHAIN_ID || emitter != SOURCE_EMITTER) revert InvalidDataSource(chainId, emitter);

        uint256 payload = bodyStart + 51;
        if (_u32(vaa, payload) != ACCUMULATOR_WORMHOLE_MAGIC) revert InvalidUpdateData();
        if (_u8(vaa, payload + 4) != UPDATE_TYPE_WORMHOLE_MERKLE) revert InvalidUpdateData();
        // slot(8) ringSize(4) root(20)
        root = bytes20(vaa[payload + 17:payload + 37]);
    }

    /* ---- MERKLE ---- */

    function _merkleValid(bytes20 root, bytes calldata leaf, bytes calldata proof) private pure returns (bool) {
        bytes20 current = bytes20(keccak256(abi.encodePacked(MERKLE_LEAF_PREFIX, leaf)));
        for (uint256 i = 0; i < proof.length; i += 20) {
            bytes20 sibling = bytes20(proof[i:i + 20]);
            current = current < sibling
                ? bytes20(keccak256(abi.encodePacked(MERKLE_NODE_PREFIX, current, sibling)))
                : bytes20(keccak256(abi.encodePacked(MERKLE_NODE_PREFIX, sibling, current)));
        }
        return current == root;
    }

    /* ---- WIADOMOSC CENOWA ---- */

    function _storeMessage(bytes calldata message) private {
        // Inne typy (TWAP, publisher stake caps) sa poprawne, ale nas nie
        // interesuja - przechodza przez dowod i sa pomijane.
        if (_u8(message, 0) != MESSAGE_TYPE_PRICE_FEED) return;
        if (message.length < 85) revert InvalidUpdateData();
        bytes32 id = bytes32(message[1:33]);
        int64 price = int64(uint64(_u64(message, 33)));
        uint64 conf = _u64(message, 41);
        int32 expo = int32(uint32(_u32(message, 49)));
        uint64 publishTime = _u64(message, 53);
        // prevPublishTime(8) emaPrice(8) emaConf(8) - nieuzywane.

        if (_exists[id] && _latest[id].publishTime >= publishTime) return;
        _latest[id] = Price({price: price, conf: conf, expo: expo, publishTime: publishTime});
        _exists[id] = true;
        emit PriceFeedUpdate(id, publishTime, price, conf);
    }

    /* ---- ODCZYT BAJTOW (big-endian) ---- */

    function _u8(bytes calldata b, uint256 o) private pure returns (uint8) {
        if (o + 1 > b.length) revert InvalidUpdateData();
        return uint8(b[o]);
    }

    function _u16(bytes calldata b, uint256 o) private pure returns (uint16) {
        if (o + 2 > b.length) revert InvalidUpdateData();
        return uint16(bytes2(b[o:o + 2]));
    }

    function _u32(bytes calldata b, uint256 o) private pure returns (uint32) {
        if (o + 4 > b.length) revert InvalidUpdateData();
        return uint32(bytes4(b[o:o + 4]));
    }

    function _u64(bytes calldata b, uint256 o) private pure returns (uint64) {
        if (o + 8 > b.length) revert InvalidUpdateData();
        return uint64(bytes8(b[o:o + 8]));
    }
}
