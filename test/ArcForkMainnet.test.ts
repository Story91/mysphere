// FORK ARC MAINNET (5042): czy pelny cykl launchpada przechodzi przeciw
// PRAWDZIWEMU, WDROZONEMU PoolManagerowi v4 na Arc?
//
// Wzor: test/SphereForkBase.test.ts. Roznica jest zasadnicza: tam launchpad byl
// juz WDROZONY na Base, tutaj na Arc jeszcze go nie ma - wiec fork stawia caly
// stack od zera przeciw cudzemu, zywemu PoolManagerowi. To jest dokladnie ta
// proba, ktorej wymaga komentarz w `PoolStateReader`:
//
//   "bledne wyprowadzenie slotu wywala PIERWSZA GRADUACJE, a nie start -
//    dlatego runbook wdrozenia na nowa siec MUSI zawierac jedna pelna
//    graduacje na testnecie/forku PRZED mainnetem."
//
// CZEGO TEN PLIK DOWODZI
//  - PoolManager `0x8366a39C...` ma na Arc runtime o hashu, ktory pinujemy
//    w `POOL_MANAGER_CODE_HASH` (ten sam build co oficjalny v4 Uniswapa na
//    Base i Robinhood, z dokladnoscia do wlasnego `address(this)`),
//  - caly stack (PlainTokenFactory + CurveLaunchpad -> vault -> hook) wdraza
//    sie jedna transakcja i wszystkie wiazania sie zgadzaja,
//  - POOLS_SLOT = 6 jest POPRAWNY na tym bajtkodzie: `_seed` czyta przez
//    `extsload` cene, ktora sam przed chwila ustawil (inaczej
//    `PoolStateUnreadable` i graduacja pada),
//  - graduacja realnie otwiera pule (initialize + modifyLiquidity + settle),
//  - swapy w obie strony przechodza przez prawdziwa pule z naszym hookiem,
//  - settle/harvest dziela oplaty wedlug wdrozonych parametrow.
//
// CZEGO NIE DOWODZI - i to jest wazne, bo Arc NIE jest zwyklym EVM:
//  - semantyki natywnego USDC Arc. Hardhat forkuje standardowy EVM, wiec nie
//    odtwarza zdarzen EIP-7708 na ruchach natywnych, blocklisty na transferach
//    wartosci, ani reguly `SELFDESTRUCT` przenoszacego saldo USDC.
//    Dokumentacja Arc mowi to wprost (integrate/defi/amm-and-pools, krok 6):
//    "Local EVM simulators run a standard EVM and cannot reproduce the
//     following Arc-specific behaviors".
//    Te rzeczy sprawdza sie transakcja na testnecie/mainnecie, nie tutaj.
//  - proweniencji PoolManagera. Rownosc bajtkodu nie czyni z niego wdrozenia
//    Uniswapa; Uniswap nie listuje Arc (stan 16.09.2026).
//
// URUCHOMIENIE
//   npx hardhat test test/ArcForkMainnet.test.ts
//   (ARC_MAINNET_RPC_URL nadpisuje RPC; bez forka testy sie SKIPUJA, nie pada)
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { buildPlan, HOOK_ALL_MASK, HOOK_REQUIRED_FLAGS } = require('../scripts/launchpad/plan');

const ARC_RPC = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';

// PoolManager v4 na Arc. Ten sam adres co na Robinhood Chain (4663), ktory
// Uniswap listuje oficjalnie; runtime rozni sie od Base wylacznie 20 bajtami
// wlasnego adresu.
const POOL_MANAGER = '0x8366a39CC670B4001A1121B8F6A443A643e40951';
const POOL_MANAGER_CODE_HASH =
  '0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626';

// Peryferia v4 na Arc wg docs.o1.exchange - sprawdzane odczytem, nie uzywane.
const V4_QUOTER = '0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94';
const V4_STATE_VIEW = '0xF3334192D15450CdD385c8B70e03f9A6bD9E673b';
// Interfejs ERC-20 nad natywnym USDC (6 decimals). Pula uzywa waluty NATYWNEJ
// (currency0 = 0x0, 18 decimals), a nie tego adresu - patrz raport.
const USDC_ERC20 = '0x3600000000000000000000000000000000000000';

// Decyzja wlasciciela z 12.09.2026 dla Arc mainnet.
const R_VIRT = ethers.parseEther('1250'); // 1250 USDC (natywne, 18 dec)
const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 70n;
const PROTOCOL_SHARE_BPS = 3000n;

const LAUNCH_WINDOW = 300;
const GRAD_FEE_BPS = 300n;
const MIN_SQRT_PRICE = 4295128739n;
const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;

describe('Arc mainnet fork: pelny cykl na PRAWDZIWYM PoolManagerze v4', function () {
  this.timeout(900_000);

  let forked = true;
  let deployer: any, alice: any, bob: any, feeRecipient: any;
  let factory: any, pad: any, vault: any, hook: any, plan: any;

  async function now() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }
  async function warp(seconds: number) {
    await hre.network.provider.send('evm_increaseTime', [seconds]);
    await hre.network.provider.send('evm_mine');
  }
  function plain(k: any) {
    return [k[0], k[1], k[2], k[3], k[4]];
  }

  before(async function () {
    try {
      await hre.network.provider.request({
        method: 'hardhat_reset',
        params: [{ forking: { jsonRpcUrl: ARC_RPC } }],
      });
      // Jeden blok LOKALNY ponad blok forka. Bez tego kazdy `eth_call` celuje
      // w blok historyczny lancucha 5042, dla ktorego hardhat nie ma historii
      // hardforkow ("No known hardfork for execution on historical block").
      // Transakcje tego nie potrzebuja, bo i tak lapia sie na blok lokalny -
      // ale czysty odczyt przed pierwsza transakcja juz tak.
      await hre.network.provider.send('evm_mine');
      // Bez kodu pod PoolManagerem fork nie ma czego dowodzic.
      if ((await ethers.provider.getCode(POOL_MANAGER)) === '0x') forked = false;
    } catch {
      forked = false;
    }
  });

  after(async function () {
    try {
      await hre.network.provider.request({ method: 'hardhat_reset', params: [] });
    } catch {
      /* nic */
    }
  });

  beforeEach(async function () {
    if (!forked) this.skip();
    [deployer, alice, bob, feeRecipient] = await ethers.getSigners();
  });

  it('fork stoi na Arc: PoolManager ma kod o zapinanym hashu, peryferia v4 istnieja', async function () {
    const code = await ethers.provider.getCode(POOL_MANAGER);
    expect(code).to.not.equal('0x');
    expect((code.length - 2) / 2, 'rozmiar runtime v4 PoolManager').to.equal(24009);
    expect(ethers.keccak256(code), 'hash runtime == pin POOL_MANAGER_CODE_HASH').to.equal(
      POOL_MANAGER_CODE_HASH
    );

    // Peryferia: sa na lancuchu, choc nasz cykl ich nie uzywa.
    expect(await ethers.provider.getCode(V4_QUOTER), 'Quoter v4').to.not.equal('0x');
    expect(await ethers.provider.getCode(V4_STATE_VIEW), 'StateView v4').to.not.equal('0x');
    // Fasada ERC-20 nad natywnym USDC - 6 decimals, wbrew 18 decimals natywnym.
    const usdc = await ethers.getContractAt(
      ['function decimals() view returns (uint8)'],
      USDC_ERC20
    );
    expect(await usdc.decimals(), 'fasada USDC ma 6 decimals').to.equal(6n);
  });

  it('caly stack wdraza sie przeciw realnemu PoolManagerowi; wiazania i bity hooka zgadzaja sie', async function () {
    factory = await (await ethers.getContractFactory('PlainTokenFactory')).deploy();
    await factory.waitForDeployment();

    // nonce PENDING, dokladnie jak w deploy.ts - inaczej salt trafia w adres,
    // ktory nigdy nie powstanie (`BadHookAddress`).
    const nonce = await deployer.getNonce('pending');
    plan = await buildPlan({
      poolManager: POOL_MANAGER,
      feeRecipient: feeRecipient.address,
      protocolShareBps: PROTOCOL_SHARE_BPS,
      deployer: deployer.address,
      nonce,
    });

    pad = await (await ethers.getContractFactory('CurveLaunchpad')).deploy(
      POOL_MANAGER,
      FEE_BPS,
      CREATOR_FEE_BPS,
      feeRecipient.address,
      PROTOCOL_SHARE_BPS,
      await factory.getAddress(),
      plan.hookSalt,
      R_VIRT
    );
    await pad.waitForDeployment();

    vault = await ethers.getContractAt('LiquidityVault', await pad.VAULT());
    hook = await ethers.getContractAt('B20LaunchHook', await pad.HOOK());

    expect(await pad.getAddress(), 'launchpad pod przewidzianym adresem').to.equal(plan.launchpad);
    expect(await vault.getAddress(), 'vault pod przewidzianym adresem').to.equal(plan.vault);
    expect(await hook.getAddress(), 'hook pod przewidzianym adresem').to.equal(plan.hook);
    expect(await vault.POOL_MANAGER(), 'vault wskazuje realny PoolManager').to.equal(POOL_MANAGER);
    expect(await hook.POOL_MANAGER(), 'hook wskazuje realny PoolManager').to.equal(POOL_MANAGER);
    expect(await hook.hasValidHookAddress(), 'bity uprawnien w adresie hooka').to.equal(true);
    expect(BigInt(await hook.getAddress()) & HOOK_ALL_MASK).to.equal(HOOK_REQUIRED_FLAGS);

    // Stale krzywej sa WYPROWADZANE z R_VIRT - nie da sie ich podac osobno.
    expect(await pad.R_VIRT()).to.equal(R_VIRT);
    expect(await pad.MIN_LP_ETH(), 'MIN_LP_ETH = R_VIRT/75').to.equal(R_VIRT / 75n);
    expect(await pad.MAX_BUY(), 'MAX_BUY = R_VIRT*132').to.equal(R_VIRT * 132n);
  });

  it('PELNY CYKL: launch -> krzywa -> GRADUACJA (extsload/POOLS_SLOT) -> swapy -> settle -> harvest', async function () {
    // Konta testowe musza udzwignac zbiorke 5000 USDC.
    for (const s of [alice, bob]) {
      await hre.network.provider.send('hardhat_setBalance', [
        s.address,
        '0x' + ethers.parseEther('100000').toString(16),
      ]);
    }

    // ---- LAUNCH ------------------------------------------------------------
    const rc = await (
      await pad.connect(alice).launch('Arc Fork Probe', 'AFP', 1n, (await now()) + 600)
    ).wait();
    const launched = rc.logs
      .map((l: any) => {
        try {
          return pad.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter((l: any) => l)
      .find((l: any) => l.name === 'Launched');
    const token = launched.args[0];
    expect(token, 'token powstal').to.properAddress;

    // ---- KRZYWA DO PROGU ---------------------------------------------------
    // Prog zbiorki G = 4 * R_VIRT = 5000 USDC. Poza oknem startowym, zeby nie
    // wejsc w WINDOW_ADDR_CAP.
    await warp(LAUNCH_WINDOW + 1);
    const target = R_VIRT * 4n;
    await (
      await pad.connect(bob).buy(token, 1n, (await now()) + 600, { value: target + ethers.parseEther('200') })
    ).wait();

    const afterBuy = await pad.launchOf(token);
    expect(afterBuy[1], 'krzywa domknieta (Locked)').to.equal(2);
    const ethReserve: bigint = afterBuy[2];
    expect(ethReserve, 'rezerwa co najmniej progowa').to.be.gte(target);

    // ---- GRADUACJA: TU WYKLADA SIE ZLY POOLS_SLOT --------------------------
    const [gradFee, callerReward] = await pad.gradFeeOf(token);
    expect(gradFee, 'gradFee = 3% rezerwy').to.equal((ethReserve * GRAD_FEE_BPS) / 10_000n);

    const bobBefore: bigint = await pad.claimable(bob.address);
    await expect(pad.connect(bob).graduate(token), 'graduacja NIE rewertuje PoolStateUnreadable').to
      .not.be.reverted;

    expect((await pad.launchOf(token))[1], 'stan Graduated').to.equal(3);
    expect((await pad.claimable(bob.address)) - bobBefore, 'nagroda wolajacego = gradFee/2').to.equal(
      callerReward
    );
    expect((await vault.positionOf(token))[1], 'pozycja LP w realnej puli istnieje').to.be.gt(0n);

    // Niezalezne potwierdzenie, ze pula ZYJE w PoolManagerze: ten sam odczyt
    // przez extsload, ktory robi `_seed`, ale wykonany z testu.
    const key = plain(await pad.poolKeyOf(token));
    const poolId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['tuple(address,address,uint24,int24,address)'],
        [key]
      )
    );
    const stateSlot = ethers.keccak256(ethers.solidityPacked(['bytes32', 'uint256'], [poolId, 6n]));
    const pm = await ethers.getContractAt(
      ['function extsload(bytes32) view returns (bytes32)'],
      POOL_MANAGER
    );
    const slot0 = await pm.extsload(stateSlot);
    const sqrtPrice = BigInt(slot0) & ((1n << 160n) - 1n);
    expect(sqrtPrice, 'slot0 puli ma niezerowa cene => POOLS_SLOT=6 poprawny').to.be.gt(0n);
    expect(sqrtPrice, 'cena == SQRT_PRICE_TERMINAL pada').to.equal(await pad.SQRT_PRICE_TERMINAL());

    // ---- SWAPY W PRAWDZIWEJ PULI ------------------------------------------
    const probe = await (await ethers.getContractFactory('RealPoolSwapProbe')).deploy(POOL_MANAGER);
    await probe.waitForDeployment();
    const asset = await ethers.getContractAt('LaunchToken', token);

    // (1) natywne USDC -> token
    await (
      await probe.doSwap(key, [true, -ethers.parseEther('100'), MIN_SQRT_PRICE + 1n], {
        value: ethers.parseEther('100'),
      })
    ).wait();
    expect(await hook.pendingToken(token), 'hook naliczyl fee tokenowe po kupnie').to.be.gt(0n);

    // (2) token -> natywne USDC
    const probeBal: bigint = await asset.balanceOf(await probe.getAddress());
    expect(probeBal, 'probe ma tokeny z kupna').to.be.gt(0n);
    await (await probe.doSwap(key, [false, -probeBal, MAX_SQRT_PRICE - 1n], {})).wait();
    const pendingEth: bigint = await hook.pendingEth(token);
    expect(pendingEth, 'hook naliczyl fee natywne po sprzedazy').to.be.gt(0n);

    // ---- SETTLE: podzial 30/70 na wdrozonych parametrach --------------------
    const pendingTok: bigint = await hook.pendingToken(token);
    const protoEth = (pendingEth * PROTOCOL_SHARE_BPS) / 10_000n;
    const protoTok = (pendingTok * PROTOCOL_SHARE_BPS) / 10_000n;
    const feeRecipEthBefore: bigint = await hook.claimableEth(feeRecipient.address);

    await (await hook.connect(bob).settle(token)).wait();
    expect(
      (await hook.claimableEth(feeRecipient.address)) - feeRecipEthBefore,
      'protokol: 30% nogi natywnej'
    ).to.equal(protoEth);
    expect(
      await hook.claimableToken(token, feeRecipient.address),
      'protokol: 30% nogi tokenowej'
    ).to.equal(protoTok);

    // ---- HARVEST: realne oplaty LP z pozycji vaulta ------------------------
    await (await vault.connect(bob).harvest(token)).wait();
    const lpEth: bigint = await vault.claimableEth(alice.address);
    const lpTok: bigint = await vault.claimableToken(token, alice.address);
    expect(lpEth + lpTok, 'harvest zebral realne fee LP z puli v4').to.be.gt(0n);

    // ---- NIEZMIENNIK WYPLACALNOSCI ----------------------------------------
    expect(await ethers.provider.getBalance(await pad.getAddress())).to.be.gte(
      await pad.totalLiabilities()
    );
  });
});

// ===========================================================================
// STACK JUZ WDROZONY NA ARC MAINNET (16.09.2026 01:20 UTC, blok 21 078 146)
// ===========================================================================
// Powyzsze testy dowodza, ze KOD dziala przeciw realnemu PoolManagerowi.
// Ponizsze dowodza czegos wazniejszego i wezszego: ze dziala WDROZONY,
// NIEZMIENNY egzemplarz - ten, ktory juz kosztowal 0,19 USDC i ktorego nie da
// sie ani zmienic, ani zapauzowac, ani zmigrowac.
//
// Roznica jest istotna, bo wdrozenie poszlo z `R_VIRT=1250` i `FEE_RECIPIENT`
// ustawionym na portfel wdrazajacego - a nie na Safe, jak na Base. Test czyta
// te wartosci z LANCUCHA, nie z manifestu, wiec rozjazd manifest/lancuch
// wyszedlby tutaj.
const DEPLOYED = {
  launchpad: '0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340',
  vault: '0x49FD3A54b23A0ee1d6A7720F493618F5CCF4681D',
  hook: '0x9669d2809710aD8218793e0CD55317Ccd984E044',
  tokenFactory: '0x04bdaD462B66B152689076975db1197766A69568',
  feeRecipient: '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e',
};

describe('Arc mainnet fork: WDROZONY stack (0xD5f6...) awansuje', function () {
  this.timeout(900_000);

  let forked = true;
  let alice: any, bob: any;
  let pad: any, vault: any, hook: any;

  async function now() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }
  async function warp(seconds: number) {
    await hre.network.provider.send('evm_increaseTime', [seconds]);
    await hre.network.provider.send('evm_mine');
  }
  function plain(k: any) {
    return [k[0], k[1], k[2], k[3], k[4]];
  }

  before(async function () {
    try {
      await hre.network.provider.request({
        method: 'hardhat_reset',
        params: [{ forking: { jsonRpcUrl: ARC_RPC } }],
      });
      await hre.network.provider.send('evm_mine');
      if ((await ethers.provider.getCode(DEPLOYED.launchpad)) === '0x') forked = false;
    } catch {
      forked = false;
    }
  });

  after(async function () {
    try {
      await hre.network.provider.request({ method: 'hardhat_reset', params: [] });
    } catch {
      /* nic */
    }
  });

  beforeEach(async function () {
    if (!forked) this.skip();
    [, alice, bob] = await ethers.getSigners();
    pad = await ethers.getContractAt('CurveLaunchpad', DEPLOYED.launchpad);
    vault = await ethers.getContractAt('LiquidityVault', DEPLOYED.vault);
    hook = await ethers.getContractAt('B20LaunchHook', DEPLOYED.hook);
  });

  it('wdrozone parametry zgadzaja sie z manifestem - czytane z lancucha', async function () {
    expect(await pad.VAULT()).to.equal(DEPLOYED.vault);
    expect(await vault.HOOK()).to.equal(DEPLOYED.hook);
    expect(await vault.POOL_MANAGER()).to.equal(POOL_MANAGER);
    expect(await hook.POOL_MANAGER()).to.equal(POOL_MANAGER);
    expect(await pad.TOKEN_FACTORY()).to.equal(DEPLOYED.tokenFactory);
    expect(await pad.R_VIRT(), 'R_VIRT = 1250 USDC').to.equal(R_VIRT);
    expect(await pad.FEE_BPS()).to.equal(FEE_BPS);
    expect(await pad.CREATOR_FEE_BPS()).to.equal(CREATOR_FEE_BPS);
    // Odbiorca oplat to EOA wdrazajacego, nie Safe - swiadoma obserwacja, nie blad.
    expect(await pad.FEE_RECIPIENT()).to.equal(DEPLOYED.feeRecipient);
    expect(await hook.hasValidHookAddress(), 'bity hooka poprawne na wdrozonym adresie').to.equal(
      true
    );
  });

  it('WDROZONY pad: launch -> krzywa -> GRADUACJA -> swap w prawdziwej puli', async function () {
    for (const s of [alice, bob]) {
      await hre.network.provider.send('hardhat_setBalance', [
        s.address,
        '0x' + ethers.parseEther('100000').toString(16),
      ]);
    }

    const rc = await (
      await pad.connect(alice).launch('Arc Deployed Probe', 'ADP', 1n, (await now()) + 600)
    ).wait();
    const token = rc.logs
      .map((l: any) => {
        try {
          return pad.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter((l: any) => l)
      .find((l: any) => l.name === 'Launched').args[0];

    await warp(LAUNCH_WINDOW + 1);
    await (
      await pad
        .connect(bob)
        .buy(token, 1n, (await now()) + 600, { value: R_VIRT * 4n + ethers.parseEther('200') })
    ).wait();
    expect((await pad.launchOf(token))[1], 'krzywa domknieta na wdrozonym padzie').to.equal(2);

    // TO JEST TEN MOMENT: zly POOLS_SLOT zabilby tu niezmienny kontrakt na zawsze.
    await expect(pad.connect(bob).graduate(token)).to.not.be.reverted;
    expect((await pad.launchOf(token))[1], 'Graduated').to.equal(3);
    expect((await vault.positionOf(token))[1], 'pozycja LP istnieje').to.be.gt(0n);

    // Swap w powstalej puli - dowod, ze pula jest uzywalna, a nie tylko otwarta.
    const probe = await (await ethers.getContractFactory('RealPoolSwapProbe')).deploy(POOL_MANAGER);
    await probe.waitForDeployment();
    const key = plain(await pad.poolKeyOf(token));
    await (
      await probe.doSwap(key, [true, -ethers.parseEther('100'), MIN_SQRT_PRICE + 1n], {
        value: ethers.parseEther('100'),
      })
    ).wait();
    expect(await hook.pendingToken(token), 'hook wdrozonego stacku nalicza fee').to.be.gt(0n);

    expect(await ethers.provider.getBalance(DEPLOYED.launchpad)).to.be.gte(
      await pad.totalLiabilities()
    );
  });

  // =========================================================================
  // SCIEZKA HANDLU Z UI: quoter + Universal Router na Arc
  // =========================================================================
  // To jest test, ktory decyduje, czy `V4_BY_CHAIN[5042]` w
  // app/startpad/[address]/v4Swap.ts wolno tam trzymac. Uniswap nie listuje
  // Arc, wiec adres routera zostal ZNALEZIONY odczytem zdarzen `Swap`
  // PoolManagera, a nie wziety z dokumentacji - i jedynym dowodem, ze jest
  // wlasciwy, jest przejscie przez niego prawdziwej wymiany.
  //
  // Test uzywa `encodeV4ExactInSingle` Z PLIKU UI, nie wlasnej kopii. Gdyby
  // ktos zmienil kodowanie w UI i zepsul je, ten test ma spasc.
  it('SCIEZKA UI: quoter wycenia, a Universal Router na Arc wykonuje swap w naszej puli', async function () {
    const { V4_BY_CHAIN, canonicalPoolKey, encodeV4ExactInSingle } = require('../app/startpad/[address]/v4Swap');
    const arcV4 = V4_BY_CHAIN[5042];
    expect(arcV4, 'wpis dla 5042 istnieje w V4_BY_CHAIN').to.not.equal(undefined);

    for (const s of [alice, bob]) {
      await hre.network.provider.send('hardhat_setBalance', [
        s.address,
        '0x' + ethers.parseEther('100000').toString(16),
      ]);
    }

    // Router i quoter MUSZA istniec na forku Arc - inaczej caly wpis jest fikcja.
    expect(await ethers.provider.getCode(arcV4.universalRouter), 'UniversalRouter ma kod').to.not.equal('0x');
    expect(await ethers.provider.getCode(arcV4.quoter), 'V4Quoter ma kod').to.not.equal('0x');
    expect(await ethers.provider.getCode(arcV4.permit2), 'Permit2 ma kod').to.not.equal('0x');

    // --- token po graduacji -------------------------------------------------
    const rc = await (
      await pad.connect(alice).launch('Arc UI Route', 'AUR', 1n, (await now()) + 600)
    ).wait();
    const token = rc.logs
      .map((l: any) => {
        try {
          return pad.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter((l: any) => l)
      .find((l: any) => l.name === 'Launched').args[0];

    await warp(LAUNCH_WINDOW + 1);
    await (
      await pad
        .connect(bob)
        .buy(token, 1n, (await now()) + 600, { value: R_VIRT * 4n + ethers.parseEther('200') })
    ).wait();
    await (await pad.connect(bob).graduate(token)).wait();
    expect((await pad.launchOf(token))[1], 'Graduated').to.equal(3);

    const poolKey = canonicalPoolKey(token, DEPLOYED.hook);
    const amountIn = ethers.parseEther('50'); // 50 USDC natywnego

    // --- WYCENA przez V4Quoter Arc -----------------------------------------
    const quoter = await ethers.getContractAt(
      [
        'function quoteExactInputSingle((( address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData)) view returns (uint256 amountOut, uint256 gasEstimate)',
      ],
      arcV4.quoter
    );
    const [quotedOut] = await quoter.quoteExactInputSingle({
      poolKey: [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
      zeroForOne: true,
      exactAmount: amountIn,
      hookData: '0x',
    });
    expect(quotedOut, 'quoter Arc wycenil wymiane w NASZEJ puli').to.be.gt(0n);

    // --- WYKONANIE przez Universal Router Arc, kodowaniem Z UI --------------
    const minOut = (quotedOut * 95n) / 100n; // 5% tolerancji na poslizg
    const { commands, inputs } = encodeV4ExactInSingle({
      poolKey,
      zeroForOne: true,
      amountIn,
      minOut,
    });

    const router = await ethers.getContractAt(
      ['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable'],
      arcV4.universalRouter
    );
    const asset = await ethers.getContractAt('LaunchToken', token);
    const before: bigint = await asset.balanceOf(alice.address);

    await (
      await router
        .connect(alice)
        .execute(commands, inputs, (await now()) + 600, { value: amountIn })
    ).wait();

    const gained = (await asset.balanceOf(alice.address)) - before;
    expect(gained, 'Universal Router Arc dostarczyl tokeny do portfela').to.be.gte(minOut);
    expect(gained, 'ilosc zgodna z wycena quotera (tolerancja 5%)').to.be.lte((quotedOut * 105n) / 100n);

    // --- SPRZEDAZ: sciezka zgod, ktora rozni sie miedzy Base a Arc ----------
    // Na Arc `routerTrusted` jest false, wiec UI daje Permit2 zgode na DOKLADNA
    // kwote tej sprzedazy zamiast bez limitu. Test przechodzi ta sama droga.
    expect(arcV4.routerTrusted, 'router na Arc jest oznaczony jako niepotwierdzony').to.equal(false);

    const sellAmount = gained / 2n;
    const permit2 = await ethers.getContractAt(
      [
        'function approve(address token, address spender, uint160 amount, uint48 expiration)',
        'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
      ],
      arcV4.permit2
    );
    await (await asset.connect(alice).approve(arcV4.permit2, ethers.MaxUint256)).wait();
    const expiration = (await now()) + 30 * 24 * 3600;
    await (
      await permit2.connect(alice).approve(token, arcV4.universalRouter, sellAmount, expiration)
    ).wait();

    const [allowed] = await permit2.allowance(alice.address, token, arcV4.universalRouter);
    expect(allowed, 'zgoda Permit2 na dokladna kwote, nie bez limitu').to.equal(sellAmount);
    expect(allowed, 'zdecydowanie ponizej uint160 max').to.be.lt((1n << 160n) - 1n);

    const sell = encodeV4ExactInSingle({
      poolKey,
      zeroForOne: false, // token -> natywne USDC
      amountIn: sellAmount,
      minOut: 1n,
    });
    const nativeBefore: bigint = await ethers.provider.getBalance(alice.address);
    const rcSell = await (
      await router.connect(alice).execute(sell.commands, sell.inputs, (await now()) + 600)
    ).wait();
    // ABI podane stringiem, wiec ethers typuje paragon luzno - jawna konwersja.
    const gasCost: bigint = BigInt(rcSell.gasUsed) * BigInt(rcSell.gasPrice);
    const nativeAfter: bigint = await ethers.provider.getBalance(alice.address);

    expect(nativeAfter + gasCost, 'sprzedaz zwrocila natywne USDC ponad koszt gazu').to.be.gt(nativeBefore);
    expect(
      await asset.balanceOf(alice.address),
      'tokeny zeszly z portfela dokladnie o sprzedana ilosc'
    ).to.equal(gained - sellAmount);
    // Zgoda zostala skonsumowana - to jest cala roznica wobec zgody bez limitu.
    const [allowedAfter] = await permit2.allowance(alice.address, token, arcV4.universalRouter);
    expect(allowedAfter, 'po sprzedazy nie zostaje zadna zgoda dla routera').to.equal(0n);
  });
});

// Ten plik jest MODULEM, zeby jego stale nie ladowaly do globalnej przestrzeni
// testow (TS2451 "Cannot redeclare block-scoped variable" miedzy plikami test/).
export {};
