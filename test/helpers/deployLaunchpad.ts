const hre = require('hardhat');
const { ethers } = hre;

/**
 * Wdrozenie launchpada w testach - razem z kopaniem adresu hooka.
 *
 * ===========================================================================
 * DLACZEGO TESTY MUSZA KOPAC
 * ===========================================================================
 * Uniswap v4 czyta uprawnienia hooka z dolnych 14 bitow jego adresu, a
 * `LiquidityVault` sprawdza te bity w konstruktorze i rewertuje `BadHookAddress`,
 * gdy sie nie zgadzaja. Nie ma wiec "trybu testowego", w ktorym da sie to
 * pominac - i dobrze, bo tryb testowy z innym warunkiem niz produkcja jest
 * dokladnie tym, co pozwala bledowi przejsc przez testy.
 *
 * Trafien jest srednio jedno na 2^14 = 16 384 prob, wiec kopanie kosztuje tu
 * ulamek sekundy na wdrozenie.
 *
 * ===========================================================================
 * DLACZEGO SALT ZALEZY OD WSZYSTKIEGO
 * ===========================================================================
 *   wdrazajacy + nonce      -> launchpad   (CREATE)
 *   launchpad  + nonce 1    -> vault       (CREATE, pierwsze `new` w konstruktorze)
 *   vault + salt + initCode -> hook        (CREATE2)
 *
 * W testach nonce wdrazajacego rosnie z kazda transakcja, wiec salt jest inny
 * przy KAZDYM wdrozeniu i nie da sie go zapisac na stale.
 */

const HOOK_ALL_MASK = (1n << 14n) - 1n;

/** BEFORE_INITIALIZE (13) | AFTER_SWAP (6) | AFTER_SWAP_RETURNS_DELTA (2) = 0x2044. */
const HOOK_REQUIRED_FLAGS = (1n << 13n) | (1n << 6n) | (1n << 2n);

function mineHookSalt(vault: string, initCodeHash: string) {
  for (let i = 0; i < 5_000_000; i++) {
    const salt = ethers.zeroPadValue(ethers.toBeHex(i), 32);
    const address = ethers.getCreate2Address(vault, salt, initCodeHash);
    if ((BigInt(address) & HOOK_ALL_MASK) === HOOK_REQUIRED_FLAGS) {
      return { salt, address };
    }
  }
  throw new Error('Nie znaleziono salta hooka - sprawdz, czy flagi zgadzaja sie z kontraktem.');
}

/**
 * Adres hooka, ktory powstanie, gdy `deployer` wysle teraz wdrozenie launchpada.
 * Zwraca takze salt, bo obie rzeczy wynikaja z tego samego rachunku.
 */
/**
 * Adres, pod ktorym testy trzymaja `MockPoolManager`.
 *
 * To NIE jest wartosc zaszyta w kontrakcie - od czasu, gdy `POOL_MANAGER` jest
 * `immutable`, kontrakt nie wie o zadnym adresie z gory. Testy nadal instaluja
 * atrape przez `hardhat_setCode` pod adresem Base mainnet, wiec ta stala jest
 * domyslna WYLACZNIE dla nich i zgadza sie z tym, co robi ich `beforeEach`.
 *
 * Konstruktor vaulta wymaga `extcodesize > 0`, wiec atrapa musi stac PRZED
 * wdrozeniem launchpada. Gdy nie stoi, deploy odpada na `PoolManagerHasNoCode`
 * - i to jest wlasciwy komunikat, a nie zagadka.
 */
const DEFAULT_POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';

async function predictHook(
  deployer: any,
  feeRecipient: string,
  protocolShareBps: number | bigint,
  poolManager: string = DEFAULT_POOL_MANAGER
) {
  // `getNonce('pending')`, a NIE `getTransactionCount(addr)`. Ten drugi domyslnie
  // pyta o blok `latest`, wiec nie liczy transakcji juz wyslanych, a jeszcze
  // niezablokowanych - i wtedy przewidziany adres launchpada jest o jeden za
  // wczesny. Objawia sie to `BadHookAddress` przy wdrozeniu, w losowych testach,
  // i tylko przy uruchomieniu wielu plikow naraz.
  const nonce = await deployer.getNonce('pending');
  const launchpad = ethers.getCreateAddress({ from: deployer.address, nonce });
  // Nonce kontraktu startuje od 1 (EIP-161), a vault jest pierwszym `new`
  // w konstruktorze launchpada.
  const vault = ethers.getCreateAddress({ from: launchpad, nonce: 1 });

  const Hook = await ethers.getContractFactory('B20LaunchHook');
  const initCode = ethers.concat([
    Hook.bytecode,
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint16'],
      [poolManager, feeRecipient, protocolShareBps]
    ),
  ]);

  const mined = mineHookSalt(vault, ethers.keccak256(initCode));
  return { launchpad, vault, salt: mined.salt, hook: mined.address };
}

type DeployArgs = {
  deployer: any;
  feeBps: number | bigint;
  creatorFeeBps: number | bigint;
  feeRecipient: string;
  protocolShareBps: number | bigint;
  tokenFactory: string;
  /** Domyslnie adres, pod ktorym `beforeEach` testow instaluje `MockPoolManager`. */
  poolManager?: string;
  /**
   * Skala krzywej. Domyslnie 0.75 ether, czyli wartosc, ktora do 2026-08-14
   * byla w kontrakcie STALA - dzieki temu wszystkie istniejace testy licza na
   * dokladnie tych samych liczbach, co przedtem, i nie trzeba bylo ruszyc ani
   * jednej ich asercji.
   */
  rVirt?: bigint;
};

/** Wdraza launchpad (a przez niego vault i hook) i oddaje wszystkie trzy. */
async function deployLaunchpad(args: DeployArgs) {
  const poolManager = args.poolManager ?? DEFAULT_POOL_MANAGER;
  const predicted = await predictHook(args.deployer, args.feeRecipient, args.protocolShareBps, poolManager);

  const Pad = await ethers.getContractFactory('CurveLaunchpad');
  const pad = await Pad.connect(args.deployer).deploy(
    poolManager,
    args.feeBps,
    args.creatorFeeBps,
    args.feeRecipient,
    args.protocolShareBps,
    args.tokenFactory,
    predicted.salt,
    args.rVirt ?? ethers.parseEther('0.75')
  );
  await pad.waitForDeployment();

  // Gdyby przewidywanie adresu sie rozjechalo, deploy padlby wyzej na
  // `BadHookAddress` - czyli komunikatem o kontrakcie, a nie o tym, ze to TEST
  // zle policzyl. Ta asercja zamienia mylacy rewert w zdanie, ktore mowi prawde.
  const actual = await pad.getAddress();
  if (actual.toLowerCase() !== predicted.launchpad.toLowerCase()) {
    throw new Error(
      `Adres launchpada rozjechal sie z przewidywaniem: ${actual} != ${predicted.launchpad}. ` +
        `Salt hooka byl kopany pod inny vault, wiec wdrozenie i tak by odpadlo.`
    );
  }

  const vault = await ethers.getContractAt('LiquidityVault', await pad.VAULT());
  const hook = await ethers.getContractAt('B20LaunchHook', await vault.HOOK());

  return { pad, vault, hook, salt: predicted.salt };
}

module.exports = {
  DEFAULT_POOL_MANAGER,
  HOOK_ALL_MASK,
  HOOK_REQUIRED_FLAGS,
  mineHookSalt,
  predictHook,
  deployLaunchpad,
};
