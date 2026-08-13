// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.26;

/**
 * PoolManager Uniswapa v4 - WCIAGNIETY DO KOMPILACJI, NIE NAPISANY PRZEZ NAS.
 *
 * ===========================================================================
 * PO CO TEN PLIK ISTNIEJE
 * ===========================================================================
 * Nasz launchpad wypuszcza plynnosc do puli v4 - vault i hook rozmawiaja z
 * `IPoolManagerV4`. Na Base, Base Sepolii i Robinhoodzie PoolManager jest
 * wdrozony przez Uniswapa i bierzemy jego adres z mapy sprawdzonych
 * (scripts/launchpad/plan.ts). Na Arc go NIE MA: sprawdzone `eth_getCode` na
 * trzech kanonicznych adresach oddaje pustke, a oficjalna lista wdrozen v4
 * Arc nie wymienia.
 *
 * Arc ma za to transient storage (EIP-1153 zmierzone opcode po opcodzie), czyli
 * wszystko, czego v4 potrzebuje do dzialania. Wiec stawiamy go sami.
 *
 * ===========================================================================
 * DLACZEGO IMPORT, A NIE WKLEJONY BAJTKOD
 * ===========================================================================
 * Bajtkod przepisany z innej sieci dziala tak samo, ale nie da sie go
 * zweryfikowac w eksploratorze i nikt po nas nie sprawdzi, co tam wlasciwie
 * stoi. Import z pakietu `@uniswap/v4-core` daje ten sam kontrakt ZE ZRODLEM:
 * hardhat wyprodukuje artefakt, ktory mozna wgrac do arcscana.
 *
 * Ten plik nie dodaje ani jednej linii logiki. Jest tylko punktem zaczepienia,
 * zeby kompilator w ogole zobaczyl PoolManagera - hardhat kompiluje to, co
 * lezy w `contracts/`, a nie to, co lezy w `node_modules`.
 *
 * Wersja pakietu: @uniswap/v4-core 1.0.2. Ustawienia kompilatora (0.8.26,
 * 44 444 444 przebiegi, viaIR, cancun) sa przepisane z foundry.toml Uniswapa -
 * uzasadnienie przy `solidity.compilers` w hardhat.config.ts.
 */

// solhint-disable-next-line no-unused-import
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
