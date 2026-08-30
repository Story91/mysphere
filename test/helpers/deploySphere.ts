const hre = require('hardhat');
const { ethers } = hre;

/**
 * Jedyne zrodlo parametrow z sekcji 10 docs/SPHERE-TOKENOMIKA.md dla testow
 * peryferii SPHERE. Zmiana decyzji (#1, #2, #11...) = jedna linia TUTAJ, a nie
 * polowanie po asercjach - kazdy plik testowy liczy oczekiwane wartosci z tych
 * stalych.
 *
 * Wartosci sa REKOMENDACJAMI ze speca; mroza sie w konstruktorach kontraktow
 * dopiero przy launchu. Testy dowodza WLASNOSCI (np. "launch rewertuje
 * WindowCap wtw. dev-buy > cap"), a nie konkretnej liczby, wiec ich zielonosc
 * nie zalezy od finalnej decyzji.
 */
const SPHERE_PARAMS = {
  // #1 - buybackBps SPHERE
  BUYBACK_BPS: 5000n,
  // #2 - split _feeReceivers = [SphereRewards, SphereCreatorEscrow]
  RECEIVER_SHARES_BPS: [6000n, 4000n],
  // #11b (ZDECYDOWANE 2026-08-30): split ETH w release() escrow - pot/ops
  ETH_POT_BPS: 5000,
  // #11a (ZDECYDOWANE 2026-08-30): tokeny ida do vestingu; harmonogram to
  // REKOMENDACJA do potwierdzenia przed launchem (klif 30 dni, 12 mies. liniowo)
  VESTING_CLIFF: 30n * 24n * 3600n,
  VESTING_DURATION: 365n * 24n * 3600n,
  // parametry wdrozenia Base (do liczenia oczekiwanych splitow)
  FEE_BPS: 100n,
  CREATOR_FEE_BPS: 70n,
  PROTOCOL_SHARE_BPS: 3000n,
};

// Straznik: zla edycja splitu ma odpasc glosno w KAZDYM pliku naraz, a nie
// dac cicho blednych oczekiwan.
const _sharesSum = SPHERE_PARAMS.RECEIVER_SHARES_BPS.reduce((a: bigint, b: bigint) => a + b, 0n);
if (_sharesSum !== 10_000n) {
  throw new Error(
    `SPHERE_PARAMS.RECEIVER_SHARES_BPS musi sumowac sie do 10000, jest ${_sharesSum}`
  );
}

module.exports = { SPHERE_PARAMS };
