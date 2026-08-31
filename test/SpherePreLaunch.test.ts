// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w CurveLaunchpad.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');
const { SPHERE_PARAMS } = require('./helpers/deploySphere');

/**
 * SpherePreLaunch - stan PRZED-LAUNCHOWY peryferii SPHERE.
 *
 * Kontrakty (escrow, rewards, vesting) sa juz WDROZONE, ale `launch()` na
 * escrow NIE zostal jeszcze wywolany - dokladnie stan, w jakim mainnet bedzie
 * zyl przez pierwsze dni po wdrozeniu fazy 0. Te testy dowodza, ze w tym
 * oknie:
 *  - zaden view nie klamie (launched=false, sphereToken=0, pullable=0,
 *    releasable=0),
 *  - kazda sciezka wyplaty pada WLASCIWYM bledem, a nie cicho przechodzi,
 *  - launch jest dostepny tylko dla LAUNCH_AUTHORITY i dziala takze bez
 *    dev-buya (zerowe value),
 *  - przedwczesna wplata ETH na escrow NIE jest uwieziona ani przekierowana -
 *    idzie tym samym zaszytym splitem pot/ops co po launchu.
 *
 * Czego NIE dowodza: semantyki B20 (precompile) ani prawdziwego PoolManagera -
 * patrz naglowek CurveLaunchpad.test.ts.
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const VANITY_SALT = ethers.id('sphere-prelaunch-salt-1');

describe('SpherePreLaunch', function () {
  this.timeout(120_000);
  let deployer: any, authority: any, alice: any, bob: any, treasury: any;
  let pot: any, ops: any, tokenTarget: any;
  let pad: any, tokenFactory: any;
  let rewards: any, escrow: any;

  async function installAt(name: string, address: string) {
    const F = await ethers.getContractFactory(name);
    const d = await F.deploy();
    await d.waitForDeployment();
    const code = await ethers.provider.getCode(await d.getAddress());
    await hre.network.provider.send('hardhat_setCode', [address, code]);
    return F.attach(address);
  }

  async function now() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }

  /** Konfiguracja launchu SPHERE z parametrami ze speca (patrz deploySphere). */
  function launchConfig(overrides: any = {}) {
    return {
      vanitySalt: VANITY_SALT,
      name: 'Sphere',
      symbol: 'SPHERE',
      feeBps: SPHERE_PARAMS.FEE_BPS,
      creatorFeeBps: SPHERE_PARAMS.CREATOR_FEE_BPS,
      buybackBps: SPHERE_PARAMS.BUYBACK_BPS,
      windowCap: ethers.parseEther('120000000'),
      receiverAccounts: overrides.receiverAccounts,
      receiverSharesBps: overrides.receiverSharesBps ?? SPHERE_PARAMS.RECEIVER_SHARES_BPS,
      metadataURI: 'ipfs://sphere-meta',
      ...overrides,
    };
  }

  beforeEach(async function () {
    [deployer, authority, alice, bob, treasury, pot, ops, tokenTarget] =
      await ethers.getSigners();

    await installAt('MockB20Factory', B20_FACTORY);
    await installAt('MockPoolManager', POOL_MANAGER);
    const TF = await ethers.getContractFactory('B20TokenFactory');
    tokenFactory = await TF.deploy();
    await tokenFactory.waitForDeployment();

    ({ pad } = await deployLaunchpad({
      deployer,
      feeBps: SPHERE_PARAMS.FEE_BPS,
      creatorFeeBps: SPHERE_PARAMS.CREATOR_FEE_BPS,
      feeRecipient: treasury.address,
      protocolShareBps: SPHERE_PARAMS.PROTOCOL_SHARE_BPS,
      tokenFactory: await tokenFactory.getAddress(),
    }));

    // CONSUMER = deployer - w tych testach wystarczy EOA, pobor testujemy
    // wylacznie o pusty stan (NothingToPull).
    const Rewards = await ethers.getContractFactory('SphereRewards');
    rewards = await Rewards.deploy(deployer.address);
    await rewards.waitForDeployment();

    // Adres escrow musi byc znany PRZED wdrozeniem (jest w jego wlasnym
    // configu odbiorcow) - przewidujemy go z nonce, jak skrypt fazy 0.
    const nonce = await deployer.getNonce('pending');
    const predicted = ethers.getCreateAddress({ from: deployer.address, nonce });
    const Escrow = await ethers.getContractFactory('SphereCreatorEscrow');
    escrow = await Escrow.connect(deployer).deploy(
      await pad.getAddress(),
      authority.address,
      pot.address,
      ops.address,
      SPHERE_PARAMS.ETH_POT_BPS,
      tokenTarget.address,
      launchConfig({ receiverAccounts: [await rewards.getAddress(), predicted] })
    );
    await escrow.waitForDeployment();
    if ((await escrow.getAddress()).toLowerCase() !== predicted.toLowerCase()) {
      throw new Error('przewidywanie adresu escrow rozjechalo sie z nonce');
    }
  });

  // ======================================================================
  //  1. ESCROW PO DEPLOYU - stan zerowy, wlasciwe bledy
  // ======================================================================

  it('escrow po deployu: launched=false, sphereToken=0, release i releaseToken padaja wlasciwym bledem', async function () {
    expect(await escrow.launched()).to.equal(false);
    expect(await escrow.sphereToken()).to.equal(ethers.ZeroAddress);

    // Zero ETH na kontrakcie: release pada na saldzie (NothingToRelease),
    // ZANIM w ogole dojdzie do jakiejkolwiek wysylki.
    await expect(escrow.connect(bob).release()).to.be.revertedWithCustomError(
      escrow,
      'NothingToRelease'
    );

    // releaseToken(0) rozwiazuje sie do sphereToken == 0, wiec pada
    // NotLaunched (a NIE NothingToRelease - do balanceOf w ogole nie dochodzi,
    // bo nie ma jeszcze adresu tokena, o ktory mozna by pytac).
    await expect(
      escrow.connect(bob).releaseToken(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(escrow, 'NotLaunched');
  });

  // ======================================================================
  //  2. LAUNCH - tylko authority; zerowe value przechodzi (brak dev-buya)
  // ======================================================================

  it('launch: obcy adres pada NotLaunchAuthority; authority z zerowym value PRZECHODZI bez dev-buya', async function () {
    // Obcy (nawet deployer escrow) nie odpali launchu.
    await expect(
      escrow.connect(alice).launch(0n, (await now()) + 600)
    ).to.be.revertedWithCustomError(escrow, 'NotLaunchAuthority');
    await expect(
      escrow.connect(deployer).launch(0n, (await now()) + 600)
    ).to.be.revertedWithCustomError(escrow, 'NotLaunchAuthority');
    expect(await escrow.launched(), 'nieudane proby nie ruszyly zapadki').to.equal(false);

    // Authority z msg.value == 0: kontrakt NIE wymaga dev-buya - launchVanity
    // dostaje value 0, wiec zaden zakup sie nie wykonuje, a launch przechodzi.
    // To rzeczywiste zachowanie kontraktu (launch() nie sprawdza msg.value).
    const predicted = await pad.predictVanityToken(await escrow.getAddress(), VANITY_SALT);
    await escrow.connect(authority).launch(0n, (await now()) + 600);
    expect(await escrow.launched()).to.equal(true);
    const token = await escrow.sphereToken();
    expect(token).to.equal(predicted);

    // Brak dev-buya: escrow nie trzyma zadnych tokenow SPHERE.
    const asset = await ethers.getContractAt('MockB20', token);
    expect(await asset.balanceOf(await escrow.getAddress())).to.equal(0n);
  });

  // ======================================================================
  //  3. PRZEDWCZESNA WPLATA ETH - release dziala juz PRZED launchem
  // ======================================================================

  it('ETH wyslane na escrow PRZED launchem: release splituje 50/50 do pot/ops', async function () {
    // Ktos wysle ETH za wczesnie (pomylka, donacja). release() celowo NIE ma
    // bramki `launched` - kierunki (BUYBACK_POT / OPS_TARGET) i split
    // (ETH_POT_BPS) sa zaszyte w konstruktorze, wiec przedwczesna wplata nie
    // moze byc ani uwieziona, ani przekierowana gdzie indziej: idzie DOKLADNIE
    // tym samym splitem, ktorym poszlaby po launchu. To jest poprawne, bo
    // launch nie zmienia niczego w ekonomii release'u - bramka dawalaby tylko
    // okno, w ktorym srodki leza martwe.
    const early = ethers.parseEther('1');
    await alice.sendTransaction({ to: await escrow.getAddress(), value: early });
    expect(await escrow.launched(), 'wciaz przed launchem').to.equal(false);

    const potBefore = await ethers.provider.getBalance(pot.address);
    const opsBefore = await ethers.provider.getBalance(ops.address);
    // ETH_POT_BPS = 5000 -> 50/50.
    await expect(escrow.connect(bob).release())
      .to.emit(escrow, 'EthReleased')
      .withArgs(ethers.parseEther('0.5'), ethers.parseEther('0.5'), bob.address);
    expect((await ethers.provider.getBalance(pot.address)) - potBefore).to.equal(
      ethers.parseEther('0.5')
    );
    expect((await ethers.provider.getBalance(ops.address)) - opsBefore).to.equal(
      ethers.parseEther('0.5')
    );
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
  });

  // ======================================================================
  //  4. SPHERE REWARDS PRZED LAUNCHEM - pusty hub
  // ======================================================================

  it('SphereRewards przed launchem: pullable=0, pull pada NothingToPull', async function () {
    expect(await rewards.pullable()).to.equal(0n);
    expect(await rewards.totalPulled()).to.equal(0n);

    // Pobor testujemy jako CONSUMER (deployer) - obcy padlby wczesniej na
    // NotConsumer i nie doszlibysmy do sprawdzenia pustego salda.
    await expect(
      rewards.connect(deployer).pull(alice.address, 1n)
    ).to.be.revertedWithCustomError(rewards, 'NothingToPull');
    // Kwota 0 tez pada NothingToPull - nie ma cichej pustej "wyplaty".
    await expect(
      rewards.connect(deployer).pull(alice.address, 0n)
    ).to.be.revertedWithCustomError(rewards, 'NothingToPull');
  });

  // ======================================================================
  //  5. SPHERE TOKEN VESTING PRZED LAUNCHEM - pusta podstawa
  // ======================================================================

  it('SphereTokenVesting przed launchem: releasable=0 dla tokena bez salda, release pada', async function () {
    // Harmonogram jak w fazie 0: start w przyszlosci (moment launchu),
    // klif i czas trwania ze speca.
    const start = BigInt(await now()) + 100n;
    const V = await ethers.getContractFactory('SphereTokenVesting');
    const vesting = await V.deploy(
      tokenTarget.address,
      start,
      SPHERE_PARAMS.VESTING_CLIFF,
      SPHERE_PARAMS.VESTING_DURATION
    );
    await vesting.waitForDeployment();

    // Dowolny ERC-20 bez salda na vestingu: podstawa vested() jest zerowa.
    const T = await ethers.getContractFactory('MockB20');
    const token = await T.deploy();
    await token.waitForDeployment();

    expect(await vesting.totalReceived(await token.getAddress())).to.equal(0n);
    expect(await vesting.releasable(await token.getAddress())).to.equal(0n);
    await expect(
      vesting.connect(bob).release(await token.getAddress())
    ).to.be.revertedWithCustomError(vesting, 'NothingToRelease');
  });
});
