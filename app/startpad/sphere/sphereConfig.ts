/**
 * Konfiguracja peryferii SPHERE (docs/SPHERE-TOKENOMIKA.md, faza 0).
 *
 * TRZY STANY STRONY:
 *  1) pre-deploy: adresy peryferii puste, UI renderuje baner "Pre-launch";
 *  2) POSREDNI: rewards/escrow/vesting wdrozone (SPHERE_LIVE = true), ale
 *     token JESZCZE nie wystartowal - SPHERE_TOKEN_ADDRESS pusty, a
 *     escrow.sphereToken() zwraca 0x0. UI pokazuje "Token not launched yet"
 *     i chowa akcje tokenowe (releaseToken, release z vestingu);
 *  3) po launchu: wpisanie adresu tokena odblokowuje pelny widok.
 * Wdrozenie robi scripts/launchpad/deploySphere.ts (CONFIRM=tak LAUNCH=tak),
 * ktory zapisuje adresy do scripts/output/sphere-base.json. Po wdrozeniu
 * wystarczy uzupelnic fallbacki ponizej (albo env NEXT_PUBLIC_SPHERE_*) -
 * strona przelaczy sie na dany stan bez zmian w kodzie.
 *
 * ABI sa wyciete 1:1 z artefaktow kompilacji galezi sphere-tests
 * (contracts/launchpad/sphere/*.sol) - to z nich strona buduje "cala
 * powierzchnie kontraktu" w konsoli zaawansowanej.
 */

import type { Address } from 'viem';

function envAddress(name: string, fallback: string): Address | null {
  const raw = (process.env[name as keyof typeof process.env] as string | undefined) ?? fallback;
  return raw && raw.startsWith('0x') && raw.length === 42 ? (raw as Address) : null;
}

/** Adresy peryferii - wdrozenie Base mainnet 2026-08-31 (sphere-base.json). */
export const SPHERE_REWARDS_ADDRESS = envAddress(
  'NEXT_PUBLIC_SPHERE_REWARDS_ADDRESS',
  '0x9030e53E7AC1bc81Cf28b196BA336E5544ce4A47'
);
export const SPHERE_ESCROW_ADDRESS = envAddress(
  'NEXT_PUBLIC_SPHERE_ESCROW_ADDRESS',
  '0xe984986f4F1E067f697b548D5fe942813d03Da37'
);
export const SPHERE_VESTING_ADDRESS = envAddress(
  'NEXT_PUBLIC_SPHERE_VESTING_ADDRESS',
  '0xB5dE95224F2bEDee2e7Ca7170F5B6a02641255AD'
);
/** Adres tokena SPHERE - launch 2026-09-01, blok 50749275, tx
 * 0x5ce63026327044a3fda26f8f343a1a6382ab183bb37d7df0c5a57c23e1e592a5
 * (escrow.sphereToken(), zgodny z predictVanityToken opublikowanym 1.09). */
export const SPHERE_TOKEN_ADDRESS = envAddress(
  'NEXT_PUBLIC_SPHERE_TOKEN_ADDRESS',
  '0xB200000000000000000000BA5eDb84c678432476'
);

/** Wspolny Safe wszystkich rol (decyzje #12 i Gate 0 z 2026-08-31). */
export const SPHERE_SAFE_ADDRESS = '0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F' as Address;

/**
 * Dystrybutor wyplat volume mining (SphereStreamingMerkleDistributor,
 * faza 1B). Kontrakt gotowy w contracts/launchpad/sphere/, JESZCZE
 * niewdrozony - fallback pusty, wiec adres jest null i UI sezonu pokazuje
 * uczciwe "claiming not live yet". Po wdrozeniu wystarczy wpisac adres
 * (albo env), a stan odbioru przy epokach zapali sie bez zmian w kodzie -
 * ten sam mechanizm trzech stanow co przy pozostalych peryferiach.
 */
export const SPHERE_DISTRIBUTOR_ADDRESS = envAddress('NEXT_PUBLIC_SPHERE_DISTRIBUTOR_ADDRESS', '');

/** Czy peryferia sa wdrozone - od tego zalezy caly tryb strony. */
export const SPHERE_LIVE = Boolean(
  SPHERE_REWARDS_ADDRESS && SPHERE_ESCROW_ADDRESS && SPHERE_VESTING_ADDRESS
);

/** Parametry launchu SPHERE (sekcja 4 speca) - do paska splitow i opisow. */
export const SPHERE_PLAN = {
  feeBps: 100,
  creatorFeeBps: 70,
  buybackBps: 5000,
  receiverSharesBps: [6000, 4000] as const,
  ethPotBps: 5000,
  vestingCliffDays: 30,
  vestingDurationDays: 365,
} as const;

/* ========================================================================== */
/*  ABI - 1:1 z artefaktow kompilacji                                          */
/* ========================================================================== */

/**
 * Odczytowy wycinek ABI dystrybutora - tylko to, czego potrzebuje stan
 * odbioru w UI sezonu (claimed / vestedOf / metadane roota). Pelne ABI
 * wejdzie 1:1 z artefaktu przy wdrozeniu, jak przy pozostalych peryferiach;
 * sygnatury zgodne ze zrodlem SphereStreamingMerkleDistributor.sol.
 */
export const sphereDistributorReadsAbi = [
  { type: 'function', name: 'claimed', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'vestedOf', stateMutability: 'view', inputs: [{ name: 'cumulative', type: 'uint256' }, { name: 'prevCumulative', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'root', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bytes32' }] },
  { type: 'function', name: 'epochId', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint64' }] },
  { type: 'function', name: 'activatedAt', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint64' }] },
  { type: 'function', name: 'STREAM_DURATION', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint64' }] },
] as const;

export const sphereRewardsAbi = [{"inputs":[{"internalType":"address","name":"consumer_","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"EthTransferFailed","type":"error"},{"inputs":[],"name":"NotConsumer","type":"error"},{"inputs":[],"name":"NothingToPull","type":"error"},{"inputs":[],"name":"ZeroAddress","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":true,"internalType":"address","name":"caller","type":"address"}],"name":"Pulled","type":"event"},{"inputs":[],"name":"CONSUMER","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"pull","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"pullable","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalPulled","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"stateMutability":"payable","type":"receive"}] as const;

export const sphereCreatorEscrowAbi = [{"inputs":[{"internalType":"address","name":"launchpad_","type":"address"},{"internalType":"address","name":"launchAuthority_","type":"address"},{"internalType":"address","name":"buybackPot_","type":"address"},{"internalType":"address","name":"opsTarget_","type":"address"},{"internalType":"uint16","name":"ethPotBps_","type":"uint16"},{"internalType":"address","name":"tokenTarget_","type":"address"},{"components":[{"internalType":"bytes32","name":"vanitySalt","type":"bytes32"},{"internalType":"string","name":"name","type":"string"},{"internalType":"string","name":"symbol","type":"string"},{"internalType":"uint16","name":"feeBps","type":"uint16"},{"internalType":"uint16","name":"creatorFeeBps","type":"uint16"},{"internalType":"uint16","name":"buybackBps","type":"uint16"},{"internalType":"uint256","name":"windowCap","type":"uint256"},{"internalType":"address[]","name":"receiverAccounts","type":"address[]"},{"internalType":"uint16[]","name":"receiverSharesBps","type":"uint16[]"},{"internalType":"string","name":"metadataURI","type":"string"}],"internalType":"struct SphereCreatorEscrow.LaunchConfig","name":"cfg","type":"tuple"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"AlreadyLaunched","type":"error"},{"inputs":[],"name":"BadShareConfig","type":"error"},{"inputs":[],"name":"EthTransferFailed","type":"error"},{"inputs":[],"name":"NotLaunchAuthority","type":"error"},{"inputs":[],"name":"NotLaunched","type":"error"},{"inputs":[],"name":"NothingToRelease","type":"error"},{"inputs":[],"name":"Reentered","type":"error"},{"inputs":[],"name":"TokenTransferFailed","type":"error"},{"inputs":[],"name":"ZeroAddress","type":"error"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"toPot","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"toOps","type":"uint256"},{"indexed":true,"internalType":"address","name":"caller","type":"address"}],"name":"EthReleased","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":false,"internalType":"bytes32","name":"launchId","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"devBuyEth","type":"uint256"}],"name":"LaunchedSphere","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":true,"internalType":"address","name":"caller","type":"address"}],"name":"TokenReleased","type":"event"},{"inputs":[],"name":"BUYBACK_BPS","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"BUYBACK_POT","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"CREATOR_FEE_BPS","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"ETH_POT_BPS","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"FEE_BPS","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"LAUNCHPAD","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"LAUNCH_AUTHORITY","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"OPS_TARGET","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"TOKEN_TARGET","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"VANITY_SALT","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"WINDOW_CAP","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"minTokensOut","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"launch","outputs":[{"internalType":"address","name":"token","type":"address"}],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"launched","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"metadataURI","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"receiverConfig","outputs":[{"internalType":"address[]","name":"","type":"address[]"},{"internalType":"uint16[]","name":"","type":"uint16[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"release","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"releaseToken","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"sphereToken","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"tokenName","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"tokenSymbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"stateMutability":"payable","type":"receive"}] as const;

export const sphereTokenVestingAbi = [{"inputs":[{"internalType":"address","name":"beneficiary_","type":"address"},{"internalType":"uint64","name":"start_","type":"uint64"},{"internalType":"uint64","name":"cliff_","type":"uint64"},{"internalType":"uint64","name":"duration_","type":"uint64"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"BadSchedule","type":"error"},{"inputs":[],"name":"NothingToRelease","type":"error"},{"inputs":[],"name":"TokenTransferFailed","type":"error"},{"inputs":[],"name":"ZeroAddress","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":true,"internalType":"address","name":"caller","type":"address"}],"name":"TokensReleased","type":"event"},{"inputs":[],"name":"BENEFICIARY","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"CLIFF","outputs":[{"internalType":"uint64","name":"","type":"uint64"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"DURATION","outputs":[{"internalType":"uint64","name":"","type":"uint64"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"START","outputs":[{"internalType":"uint64","name":"","type":"uint64"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"releasable","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"release","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"released","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"totalReceived","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint64","name":"timestamp","type":"uint64"}],"name":"vestedAmount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}] as const;

/** Opisy funkcji dla konsoli ABI - jezyk ludzki obok surowej powierzchni. */
export const SPHERE_FN_DOCS: Record<string, string> = {
  // SphereRewards
  CONSUMER: 'Jedyny adres z prawem poboru (Rewards Safe). Immutable.',
  pull: 'Pobor ETH ze skarbonki na wskazany adres. Tylko CONSUMER.',
  pullable: 'Ile ETH lezy w skarbonce teraz.',
  totalPulled: 'Suma dotychczasowych poborow (obserwowalnosc, nie rozliczenia).',
  // SphereCreatorEscrow
  launch: 'Jednorazowy start SPHERE z zapieta konfiguracja + atomowy dev-buy (msg.value). Tylko LAUNCH_AUTHORITY. NIEODWRACALNE.',
  launched: 'Czy launch juz sie odbyl (zapadka one-shot).',
  release: 'Wyplata calego ETH escrow: split BUYBACK_POT / OPS_TARGET wg ETH_POT_BPS. Bezuprawnieniowa.',
  releaseToken: 'Wyplata calego salda tokena do TOKEN_TARGET (vesting). address(0) = token SPHERE. Bezuprawnieniowa.',
  sphereToken: 'Adres tokena SPHERE (po launchu).',
  receiverConfig: 'Zamrozeni odbiorcy fee z krzywej + ich udzialy bps.',
  BUYBACK_POT: 'Dokad idzie czesc buyback przy release().',
  OPS_TARGET: 'Dokad idzie czesc operacyjna przy release().',
  TOKEN_TARGET: 'Dokad ida tokeny przy releaseToken() (SphereTokenVesting).',
  LAUNCH_AUTHORITY: 'Kto moze zawolac launch() (jednorazowo).',
  ETH_POT_BPS: 'Udzial buybacku w splicie ETH (bps z 10000).',
  WINDOW_CAP: 'Cap tokenow per adres w oknie startowym (300 s).',
  VANITY_SALT: 'Salt vanity zapiety w konstruktorze.',
  // SphereTokenVesting
  BENEFICIARY: 'Jedyny odbiorca wyplat z vestingu (Safe).',
  START: 'Poczatek zegara vestingu (unix).',
  CLIFF: 'Okres klifu w sekundach - wczesniej nie wychodzi nic.',
  DURATION: 'Pelny czas vestingu w sekundach (liniowo).',
  releasable: 'Ile danego tokena mozna wyplacic TERAZ.',
  released: 'Ile danego tokena juz wyplacono.',
  totalReceived: 'Podstawa vestingu: saldo + wyplacone.',
  vestedAmount: 'Ile z podstawy jest odblokowane w zadanym momencie.',
};
