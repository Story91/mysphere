// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w CurveLaunchpad.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');
const { SPHERE_PARAMS } = require('./helpers/deploySphere');

/**
 * SphereCreatorEscrow (Ring 1) - escrow jako TWORCA SPHERE.
 *
 * Kluczowe zdania do udowodnienia (spec sekcja 8 + decyzja #11):
 *  - escrow wola launchVanity i STAJE SIE creatorem (Launched.creator == escrow),
 *  - przewidziany adres vanity zgadza sie z utworzonym; cudzy adres NIE zajmie
 *    naszego (msg.sender w preimage),
 *  - dev-buy jest atomowy w tx launchu, laduje na escrow i PODLEGA windowCap
 *    (za ciasny cap = rewert calego launchu, nic nie powstaje),
 *  - one-shot: konfiguracja zapieta w konstruktorze, launch tylko raz, tylko
 *    LAUNCH_AUTHORITY,
 *  - obie sciezki wyjscia istnieja i sa szczelne: release() dzieli ETH co do
 *    wei atomowo, releaseToken() oprozna strone tokenowa (dev-buy nie jest
 *    uwieziony),
 *  - wejscie powrotne i odbiorca-odmawiacz nie wyprowadza wiecej niz saldo.
 *
 * Czego NIE dowodza: semantyki B20 (precompile) ani prawdziwego PoolManagera -
 * patrz naglowek CurveLaunchpad.test.ts. Poziomem dowodu dla graduacji jest
 * SphereLaunchLifecycle.test.ts (mock PM) i fork Base (Ring 2).
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const WINDOW = 300;
const VANITY_SALT = ethers.id('sphere-test-salt-1');

describe('SphereCreatorEscrow', function () {
  this.timeout(120_000);
  let deployer: any, authority: any, alice: any, bob: any, treasury: any;
  let pot: any, ops: any, tokenTarget: any;
  let pad: any, vault: any, hook: any, tokenFactory: any, pm: any;
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

  async function warp(seconds: number) {
    await hre.network.provider.send('evm_increaseTime', [seconds]);
    await hre.network.provider.send('evm_mine');
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

  async function deployEscrow(cfgOverrides: any = {}, ethPotBps = 5000) {
    const Escrow = await ethers.getContractFactory('SphereCreatorEscrow');
    // Odbiorcy fee z krzywej: [rewards, escrow]. Adres escrow musi byc znany
    // PRZED wdrozeniem (jest w jego wlasnym configu) - przewidujemy go z nonce,
    // dokladnie tak, jak zrobi to skrypt wdrozeniowy fazy 0.
    const nonce = await deployer.getNonce('pending');
    const predicted = ethers.getCreateAddress({ from: deployer.address, nonce });
    const cfg = launchConfig({
      receiverAccounts: cfgOverrides.receiverAccounts ?? [await rewards.getAddress(), predicted],
      ...cfgOverrides,
    });
    const e = await Escrow.connect(deployer).deploy(
      await pad.getAddress(),
      authority.address,
      pot.address,
      ops.address,
      ethPotBps,
      tokenTarget.address,
      cfg
    );
    await e.waitForDeployment();
    if ((await e.getAddress()).toLowerCase() !== predicted.toLowerCase()) {
      throw new Error('przewidywanie adresu escrow rozjechalo sie z nonce');
    }
    return e;
  }

  beforeEach(async function () {
    [deployer, authority, alice, bob, treasury, pot, ops, tokenTarget] =
      await ethers.getSigners();

    await installAt('MockB20Factory', B20_FACTORY);
    pm = await installAt('MockPoolManager', POOL_MANAGER);
    const TF = await ethers.getContractFactory('B20TokenFactory');
    tokenFactory = await TF.deploy();
    await tokenFactory.waitForDeployment();

    ({ pad, vault, hook } = await deployLaunchpad({
      deployer,
      feeBps: SPHERE_PARAMS.FEE_BPS,
      creatorFeeBps: SPHERE_PARAMS.CREATOR_FEE_BPS,
      feeRecipient: treasury.address,
      protocolShareBps: SPHERE_PARAMS.PROTOCOL_SHARE_BPS,
      tokenFactory: await tokenFactory.getAddress(),
    }));

    const Rewards = await ethers.getContractFactory('SphereRewards');
    rewards = await Rewards.deploy(deployer.address);
    await rewards.waitForDeployment();

    escrow = await deployEscrow();
  });

  // ======================================================================
  //  1. KONSTRUKTOR - konfiguracja zapieta i zwalidowana
  // ======================================================================

  it('zamraza cala konfiguracje w konstruktorze', async function () {
    expect(await escrow.LAUNCHPAD()).to.equal(await pad.getAddress());
    expect(await escrow.LAUNCH_AUTHORITY()).to.equal(authority.address);
    expect(await escrow.BUYBACK_POT()).to.equal(pot.address);
    expect(await escrow.OPS_TARGET()).to.equal(ops.address);
    expect(await escrow.ETH_POT_BPS()).to.equal(5000);
    expect(await escrow.TOKEN_TARGET()).to.equal(tokenTarget.address);
    expect(await escrow.VANITY_SALT()).to.equal(VANITY_SALT);
    expect(await escrow.BUYBACK_BPS()).to.equal(SPHERE_PARAMS.BUYBACK_BPS);
    const [accs, shares] = await escrow.receiverConfig();
    expect(accs[0]).to.equal(await rewards.getAddress());
    expect(accs[1]).to.equal(await escrow.getAddress());
    expect(shares.map((s: any) => BigInt(s))).to.deep.equal(SPHERE_PARAMS.RECEIVER_SHARES_BPS);
    expect(await escrow.launched()).to.equal(false);
  });

  it('odrzuca zle konfiguracje: zero-adresy i split != 10000', async function () {
    const Escrow = await ethers.getContractFactory('SphereCreatorEscrow');
    const good = launchConfig({ receiverAccounts: [alice.address] , receiverSharesBps: [10_000n] });
    await expect(
      Escrow.deploy(ethers.ZeroAddress, authority.address, pot.address, ops.address, 5000, tokenTarget.address, good)
    ).to.be.revertedWithCustomError(escrow, 'ZeroAddress');
    const badShares = launchConfig({
      receiverAccounts: [alice.address, bob.address],
      receiverSharesBps: [6000n, 3000n], // suma 9000
    });
    await expect(
      Escrow.deploy(await pad.getAddress(), authority.address, pot.address, ops.address, 5000, tokenTarget.address, badShares)
    ).to.be.revertedWithCustomError(escrow, 'BadShareConfig');
    await expect(
      Escrow.deploy(await pad.getAddress(), authority.address, pot.address, ops.address, 10_001, tokenTarget.address, good)
    ).to.be.revertedWithCustomError(escrow, 'BadShareConfig');
  });

  // ======================================================================
  //  2. LAUNCH - escrow zostaje tworca, adres zgodny z przewidywaniem
  // ======================================================================

  it('launch: escrow zostaje creatorem, adres == predictVanityToken(escrow, salt)', async function () {
    const predicted = await pad.predictVanityToken(await escrow.getAddress(), VANITY_SALT);

    const tx = await escrow.connect(authority).launch(0n, (await now()) + 600);
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l: any) => {
        try {
          return pad.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((l: any) => l && l.name === 'Launched');

    expect(ev.args[1], 'creator to ESCROW, nie authority').to.equal(await escrow.getAddress());
    const token = ev.args[0] as string;
    expect(token, 'adres zgodny z wykopanym').to.equal(predicted);
    expect(await escrow.sphereToken()).to.equal(token);

    const l = await pad.launchOf(token);
    expect(l[0]).to.equal(await escrow.getAddress());

    // Config przejechal do padu: fee, odbiorcy, buyback.
    const feeCfg = await pad.feeConfigOf(token);
    expect(feeCfg[0]).to.equal(SPHERE_PARAMS.FEE_BPS);
    expect(feeCfg[1]).to.equal(SPHERE_PARAMS.CREATOR_FEE_BPS);
    expect(feeCfg[2]).to.equal(2n);
    expect(await pad.metadataURI(token)).to.equal('ipfs://sphere-meta');
  });

  it('ten sam salt z INNEGO adresu daje INNY adres tokena (front-run zamkniety)', async function () {
    const forEscrow = await pad.predictVanityToken(await escrow.getAddress(), VANITY_SALT);
    const forEoa = await pad.predictVanityToken(alice.address, VANITY_SALT);
    expect(forEscrow).to.not.equal(forEoa);
  });

  it('launch moze zawolac tylko LAUNCH_AUTHORITY i tylko raz', async function () {
    await expect(
      escrow.connect(alice).launch(0n, (await now()) + 600)
    ).to.be.revertedWithCustomError(escrow, 'NotLaunchAuthority');

    await escrow.connect(authority).launch(0n, (await now()) + 600);
    await expect(
      escrow.connect(authority).launch(0n, (await now()) + 600)
    ).to.be.revertedWithCustomError(escrow, 'AlreadyLaunched');
  });

  // ======================================================================
  //  3. DEV-BUY - atomowy, na escrow, pod windowCap
  // ======================================================================

  it('dev-buy: tokeny laduja na escrow, windowBought obciaza escrow', async function () {
    const devBuy = ethers.parseEther('0.05');
    const tx = await escrow.connect(authority).launch(1n, (await now()) + 600, { value: devBuy });
    const rc = await tx.wait();
    const bought = rc.logs
      .map((l: any) => {
        try {
          return pad.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((l: any) => l && l.name === 'Bought');
    expect(bought, 'dev-buy wykonal sie w tx launchu').to.not.equal(undefined);
    expect(bought.args[1], 'kupujacym jest escrow').to.equal(await escrow.getAddress());

    const token = await escrow.sphereToken();
    const asset = await ethers.getContractAt('MockB20', token);
    const tokensOut = bought.args[5] as bigint;
    expect(await asset.balanceOf(await escrow.getAddress()), 'tokeny z dev-buya na escrow').to.equal(
      tokensOut
    );
    expect(await pad.windowBought(token, await escrow.getAddress()), 'cap obciaza escrow').to.equal(
      tokensOut
    );
  });

  it('windowCap ponizej dev-buya rewertuje CALY launch - nic nie powstaje', async function () {
    // Osobny escrow z absurdalnie ciasnym capem: dev-buy da wiecej tokensOut.
    const tight = await deployEscrow({ windowCap: 1n, vanitySalt: ethers.id('tight-salt') });
    await expect(
      tight.connect(authority).launch(1n, (await now()) + 600, { value: ethers.parseEther('0.05') })
    ).to.be.revertedWithCustomError(pad, 'WindowCap');
    expect(await tight.launched(), 'zapadka cofnieta rewertem').to.equal(false);
    expect(await tight.sphereToken()).to.equal(ethers.ZeroAddress);
  });

  // ======================================================================
  //  4. STRUMIEN Z KRZYWEJ - claimable, claimFor, refundy
  // ======================================================================

  it('escrow jako receiver: nabija claimable swoim udzialem i przyjmuje claimFor', async function () {
    await escrow.connect(authority).launch(0n, (await now()) + 600);
    const token = await escrow.sphereToken();
    await warp(WINDOW + 1);

    const ethIn = ethers.parseEther('1');
    const quote = await pad.quoteBuy(token, ethIn);
    const curveFee = quote[1] as bigint;
    await pad.connect(bob).buy(token, 1n, (await now()) + 600, { value: ethIn });

    const doTworcow = (curveFee * SPHERE_PARAMS.CREATOR_FEE_BPS) / SPHERE_PARAMS.FEE_BPS;
    const doRewards = (doTworcow * SPHERE_PARAMS.RECEIVER_SHARES_BPS[0]) / 10_000n;
    const doEscrow = doTworcow - doRewards; // ostatni odbiorca dostaje reszte

    expect(await pad.claimable(await rewards.getAddress())).to.equal(doRewards);
    expect(await pad.claimable(await escrow.getAddress())).to.equal(doEscrow);

    // Permissionless delivery na kontrakt: goly call z _sendEth wchodzi.
    await pad.connect(alice).claimFor(await escrow.getAddress());
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(doEscrow);
  });

  it('przyjmuje goly ETH (EOA i kontrakt) - sciezka refundu i claimow', async function () {
    await alice.sendTransaction({ to: await escrow.getAddress(), value: ethers.parseEther('0.3') });
    const Fwd = await ethers.getContractFactory('EthForwarder');
    const fwd = await Fwd.deploy();
    await fwd.waitForDeployment();
    await fwd.forward(await escrow.getAddress(), { value: ethers.parseEther('0.2') });
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
      ethers.parseEther('0.5')
    );
  });

  // ======================================================================
  //  5. RELEASE ETH - split co do wei, atomowy
  // ======================================================================

  it('release dzieli saldo wg ETH_POT_BPS, pyl do OPS', async function () {
    // 3 wei przy split 50/50: pot=1 (w dol), ops=2 (reszta) - suma == saldo.
    await alice.sendTransaction({ to: await escrow.getAddress(), value: 3n });
    const potBefore = await ethers.provider.getBalance(pot.address);
    const opsBefore = await ethers.provider.getBalance(ops.address);
    await expect(escrow.connect(bob).release())
      .to.emit(escrow, 'EthReleased')
      .withArgs(1n, 2n, bob.address);
    expect((await ethers.provider.getBalance(pot.address)) - potBefore).to.equal(1n);
    expect((await ethers.provider.getBalance(ops.address)) - opsBefore).to.equal(2n);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
  });

  it('release: 1 wei idzie w calosci do OPS (noga reszty), 0 salda rewertuje', async function () {
    await alice.sendTransaction({ to: await escrow.getAddress(), value: 1n });
    const opsBefore = await ethers.provider.getBalance(ops.address);
    await escrow.connect(bob).release();
    expect((await ethers.provider.getBalance(ops.address)) - opsBefore).to.equal(1n);
    await expect(escrow.connect(bob).release()).to.be.revertedWithCustomError(
      escrow,
      'NothingToRelease'
    );
  });

  it('release jest permissionless, ale kierunki zaszyte - wolajacy nic nie dostaje', async function () {
    await alice.sendTransaction({ to: await escrow.getAddress(), value: ethers.parseEther('1') });
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const tx = await escrow.connect(bob).release();
    const rc = await tx.wait();
    const gasCost = rc.gasUsed * rc.gasPrice;
    // Bob tylko zaplacil gaz.
    expect(await ethers.provider.getBalance(bob.address)).to.equal(bobBefore - gasCost);
  });

  it('odbiorca odmawiajacy ETH rewertuje CALY release atomowo - srodki zostaja', async function () {
    // Escrow z potem = EthRejector: release ma odpasc w calosci.
    const rej = await (await ethers.getContractFactory('EthRejector')).deploy(
      await pad.getAddress()
    );
    await rej.waitForDeployment();
    const Escrow = await ethers.getContractFactory('SphereCreatorEscrow');
    const cfg = launchConfig({ receiverAccounts: [alice.address], receiverSharesBps: [10_000n], vanitySalt: ethers.id('rej-salt') });
    const e2 = await Escrow.deploy(
      await pad.getAddress(),
      authority.address,
      await rej.getAddress(),
      ops.address,
      5000,
      tokenTarget.address,
      cfg
    );
    await e2.waitForDeployment();
    await alice.sendTransaction({ to: await e2.getAddress(), value: ethers.parseEther('1') });
    await expect(e2.connect(bob).release()).to.be.revertedWithCustomError(
      e2,
      'EthTransferFailed'
    );
    // Nic nie wyszlo - saldo w calosci na miejscu, retry mozliwy po naprawie.
    expect(await ethers.provider.getBalance(await e2.getAddress())).to.equal(
      ethers.parseEther('1')
    );
  });

  it('wejscie powrotne w release odbija sie o straznika - suma wyplat == saldo poczatkowe', async function () {
    const re = await (await ethers.getContractFactory('ReentrantReleaseTarget')).deploy();
    await re.waitForDeployment();
    const Escrow = await ethers.getContractFactory('SphereCreatorEscrow');
    const cfg = launchConfig({ receiverAccounts: [alice.address], receiverSharesBps: [10_000n], vanitySalt: ethers.id('re-salt') });
    const e2 = await Escrow.deploy(
      await pad.getAddress(),
      authority.address,
      await re.getAddress(), // pot = reentrant
      ops.address,
      5000,
      tokenTarget.address,
      cfg
    );
    await e2.waitForDeployment();
    await alice.sendTransaction({ to: await e2.getAddress(), value: ethers.parseEther('1') });
    await re.arm(await e2.getAddress());

    const opsBefore = await ethers.provider.getBalance(ops.address);
    await e2.connect(bob).release();
    expect(await re.reentered(), 'sonda weszla powrotnie').to.equal(true);
    expect(await re.innerSucceeded(), 'wewnetrzny release odbity straznikiem').to.equal(false);
    // Konserwacja: pot 0.5 + ops 0.5, nic podwojnie.
    expect(await ethers.provider.getBalance(await re.getAddress())).to.equal(
      ethers.parseEther('0.5')
    );
    expect((await ethers.provider.getBalance(ops.address)) - opsBefore).to.equal(
      ethers.parseEther('0.5')
    );
    expect(await ethers.provider.getBalance(await e2.getAddress())).to.equal(0n);
  });

  // ======================================================================
  //  6. RELEASE TOKEN - strona tokenowa NIE jest uwieziona
  // ======================================================================

  it('releaseToken oprozna dev-buy do TOKEN_TARGET (sciezka wyjscia istnieje)', async function () {
    const devBuy = ethers.parseEther('0.05');
    await escrow.connect(authority).launch(1n, (await now()) + 600, { value: devBuy });
    const token = await escrow.sphereToken();
    const asset = await ethers.getContractAt('MockB20', token);
    const escrowBal = await asset.balanceOf(await escrow.getAddress());
    expect(escrowBal).to.be.greaterThan(0n);

    await expect(escrow.connect(bob).releaseToken(ethers.ZeroAddress))
      .to.emit(escrow, 'TokenReleased')
      .withArgs(token, escrowBal, bob.address);
    expect(await asset.balanceOf(tokenTarget.address)).to.equal(escrowBal);
    expect(await asset.balanceOf(await escrow.getAddress())).to.equal(0n);

    // Puste saldo: rewert, nie cicha "wyplata".
    await expect(
      escrow.connect(bob).releaseToken(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(escrow, 'NothingToRelease');
  });

  it('releaseToken przed launchem rewertuje NotLaunched (brak adresu tokena)', async function () {
    await expect(
      escrow.connect(bob).releaseToken(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(escrow, 'NotLaunched');
  });

  // ======================================================================
  //  7. BRAK ADMINA
  // ======================================================================

  it('nie ma zadnej powierzchni admina', async function () {
    const frags = escrow.interface.fragments
      .filter((f: any) => f.type === 'function')
      .map((f: any) => f.name.toLowerCase());
    for (const banned of ['owner', 'transferownership', 'withdraw', 'sweep', 'rescue', 'pause', 'settarget', 'setsplit', 'upgradeto']) {
      expect(frags, `nie powinno byc ${banned}`).to.not.include(banned);
    }
  });
});
