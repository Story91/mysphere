// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w CurveLaunchpad.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');
const { SPHERE_PARAMS } = require('./helpers/deploySphere');

/**
 * SphereRewards - pasywny pull-hub (Ring 1, faza 0 speca).
 *
 * Dwie warstwy dowodu:
 *  1. HUB W IZOLACJI - przyjmowanie ETH kazda droga (EOA / kontrakt /
 *     transfer-2300 / selfdestruct), pobor tylko przez CONSUMER, CEI, brak
 *     admina.
 *  2. HUB JAKO ODBIORCA LAUNCHPADA - wpisany do `_feeReceivers`, nabija
 *     `claimable`, odbiera przez `claimFor` (permissionless), a saldo laduje
 *     na hubie jako czyste ETH gotowe do `pull`.
 *
 * Czego te testy NIE dowodza: semantyki B20 (precompile - patrz naglowek
 * CurveLaunchpad.test.ts). Do splitow uzywamy MockB20Factory, wiec sciezka
 * `_accrueFee` i `_sendEth` jest prawdziwa, a token - atrapa.
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const WINDOW = 300;

describe('SphereRewards', function () {
  this.timeout(120_000);
  let deployer: any, consumer: any, alice: any, bob: any, treasury: any, sink: any;
  let pad: any, vault: any, hook: any, tokenFactory: any, pm: any;
  let rewards: any;

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

  beforeEach(async function () {
    [deployer, consumer, alice, bob, treasury, sink] = await ethers.getSigners();

    const Rewards = await ethers.getContractFactory('SphereRewards');
    rewards = await Rewards.deploy(consumer.address);
    await rewards.waitForDeployment();
  });

  // ======================================================================
  //  1. KONSTRUKTOR
  // ======================================================================

  it('zamraza CONSUMER w konstruktorze', async function () {
    expect(await rewards.CONSUMER()).to.equal(consumer.address);
    expect(await rewards.totalPulled()).to.equal(0n);
  });

  it('odrzuca zerowy CONSUMER', async function () {
    const Rewards = await ethers.getContractFactory('SphereRewards');
    await expect(Rewards.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      rewards,
      'ZeroAddress'
    );
  });

  // ======================================================================
  //  2. PRZYJMOWANIE ETH - KAZDA DROGA
  // ======================================================================

  it('przyjmuje goly call{value} od EOA', async function () {
    await alice.sendTransaction({ to: await rewards.getAddress(), value: ethers.parseEther('1') });
    expect(await ethers.provider.getBalance(await rewards.getAddress())).to.equal(
      ethers.parseEther('1')
    );
    expect(await rewards.pullable()).to.equal(ethers.parseEther('1'));
  });

  it('przyjmuje wplate ze sciezki KONTRAKTU (goly call - jak _sendEth padu)', async function () {
    const Fwd = await ethers.getContractFactory('EthForwarder');
    const fwd = await Fwd.deploy();
    await fwd.waitForDeployment();
    await fwd.forward(await rewards.getAddress(), { value: ethers.parseEther('2') });
    expect(await rewards.pullable()).to.equal(ethers.parseEther('2'));
  });

  it('przyjmuje wplate przez transfer (limit 2300 gazu) - receive() nie pisze stanu', async function () {
    // `transfer` daje odbiorcy tylko 2300 gazu: przejdzie TYLKO, gdy receive()
    // nie robi SSTORE. To twardy pin na "hub zostaje golym akumulatorem".
    const Fwd = await ethers.getContractFactory('TransferForwarder');
    const fwd = await Fwd.deploy();
    await fwd.waitForDeployment();
    await fwd.forward(await rewards.getAddress(), { value: ethers.parseEther('0.7') });
    expect(await rewards.pullable()).to.equal(ethers.parseEther('0.7'));
    expect(await rewards.totalPulled()).to.equal(0n);
  });

  it('saldo scisle narasta przy wielu wplatach; hub nigdy nie forwarduje sam', async function () {
    const addr = await rewards.getAddress();
    await alice.sendTransaction({ to: addr, value: ethers.parseEther('1') });
    await bob.sendTransaction({ to: addr, value: ethers.parseEther('0.5') });
    await alice.sendTransaction({ to: addr, value: ethers.parseEther('0.25') });
    expect(await ethers.provider.getBalance(addr)).to.equal(ethers.parseEther('1.75'));
    // Zaden outflow bez pull: totalPulled dalej 0.
    expect(await rewards.totalPulled()).to.equal(0n);
  });

  it('forced-ETH (selfdestruct) tylko powieksza pullable - zaden niezmiennik nie peka', async function () {
    const addr = await rewards.getAddress();
    await alice.sendTransaction({ to: addr, value: ethers.parseEther('1') });
    const Don = await ethers.getContractFactory('SelfDestructDonator');
    await Don.deploy(addr, { value: ethers.parseEther('0.3') });
    // Donacja doliczona do salda; konsument moze ja wyciagnac normalnie.
    expect(await rewards.pullable()).to.equal(ethers.parseEther('1.3'));
    await rewards.connect(consumer).pull(sink.address, ethers.parseEther('1.3'));
    expect(await rewards.pullable()).to.equal(0n);
  });

  // ======================================================================
  //  3. POBOR - TYLKO CONSUMER
  // ======================================================================

  it('CONSUMER wyciaga ETH na wskazany adres', async function () {
    const addr = await rewards.getAddress();
    await alice.sendTransaction({ to: addr, value: ethers.parseEther('1') });
    const before = await ethers.provider.getBalance(sink.address);
    await expect(rewards.connect(consumer).pull(sink.address, ethers.parseEther('0.4')))
      .to.emit(rewards, 'Pulled')
      .withArgs(sink.address, ethers.parseEther('0.4'), consumer.address);
    expect((await ethers.provider.getBalance(sink.address)) - before).to.equal(
      ethers.parseEther('0.4')
    );
    expect(await rewards.totalPulled()).to.equal(ethers.parseEther('0.4'));
    expect(await rewards.pullable()).to.equal(ethers.parseEther('0.6'));
  });

  it('pobor dziala, gdy CONSUMER jest KONTRAKTEM (Safe/staking)', async function () {
    const c = await (await ethers.getContractFactory('PullConsumer')).deploy();
    await c.waitForDeployment();
    const hub = await (await ethers.getContractFactory('SphereRewards')).deploy(await c.getAddress());
    await hub.waitForDeployment();

    await alice.sendTransaction({ to: await hub.getAddress(), value: ethers.parseEther('1') });
    const before = await ethers.provider.getBalance(sink.address);
    await c.doPull(await hub.getAddress(), sink.address, ethers.parseEther('0.5'));
    expect((await ethers.provider.getBalance(sink.address)) - before).to.equal(
      ethers.parseEther('0.5')
    );
    expect(await hub.pullable()).to.equal(ethers.parseEther('0.5'));
  });

  it('adres inny niz CONSUMER nie wyciagnie nic', async function () {
    await alice.sendTransaction({ to: await rewards.getAddress(), value: ethers.parseEther('1') });
    await expect(
      rewards.connect(alice).pull(alice.address, ethers.parseEther('0.1'))
    ).to.be.revertedWithCustomError(rewards, 'NotConsumer');
  });

  it('pull odrzuca kwote 0, kwote ponad saldo i adres zero', async function () {
    await alice.sendTransaction({ to: await rewards.getAddress(), value: ethers.parseEther('1') });
    await expect(
      rewards.connect(consumer).pull(sink.address, 0n)
    ).to.be.revertedWithCustomError(rewards, 'NothingToPull');
    await expect(
      rewards.connect(consumer).pull(sink.address, ethers.parseEther('1.1'))
    ).to.be.revertedWithCustomError(rewards, 'NothingToPull');
    await expect(
      rewards.connect(consumer).pull(ethers.ZeroAddress, ethers.parseEther('0.1'))
    ).to.be.revertedWithCustomError(rewards, 'ZeroAddress');
  });

  it('pull do odbiorcy, ktory rewertuje, odbija sie EthTransferFailed (blokuje tylko ten pobor)', async function () {
    // EthRejector z LaunchpadProbes odrzuca kazde ETH w receive(). Jego adres
    // pada w konstruktorze nie jest tu uzywany (nie wolamy doGraduate/doClaim),
    // wiec podajemy adres huba jako nieszkodliwy placeholder.
    const rej = await (await ethers.getContractFactory('EthRejector')).deploy(
      await rewards.getAddress()
    );
    await rej.waitForDeployment();
    await alice.sendTransaction({ to: await rewards.getAddress(), value: ethers.parseEther('1') });
    await expect(
      rewards.connect(consumer).pull(await rej.getAddress(), ethers.parseEther('0.5'))
    ).to.be.revertedWithCustomError(rewards, 'EthTransferFailed');
    // Saldo nietkniete (rewert cofnal totalPulled), kolejny pull na dobry adres dziala.
    expect(await rewards.pullable()).to.equal(ethers.parseEther('1'));
    await rewards.connect(consumer).pull(sink.address, ethers.parseEther('1'));
    expect(await rewards.pullable()).to.equal(0n);
  });

  it('wejscie powrotne konsumenta nie wyciagnie wiecej niz saldo (CEI)', async function () {
    const re = await (await ethers.getContractFactory('ReentrantPullConsumer')).deploy();
    await re.waitForDeployment();
    const hub = await (await ethers.getContractFactory('SphereRewards')).deploy(await re.getAddress());
    await hub.waitForDeployment();

    await alice.sendTransaction({ to: await hub.getAddress(), value: ethers.parseEther('1') });
    // re wyciaga 0.5 na SIEBIE, a przy odbiorze probuje jeszcze raz 0.5.
    await re.arm(await hub.getAddress(), ethers.parseEther('0.5'));
    await re.doPull(await hub.getAddress(), await re.getAddress(), ethers.parseEther('0.5'));
    expect(await re.reentered()).to.equal(true);
    // Niezaleznie od tego, czy wewnetrzny pull przeszedl - laczny outflow NIGDY
    // nie przekracza pierwotnego salda; hub nie tworzy ETH z niczego.
    const hubBal = await hub.pullable();
    const reBal = await ethers.provider.getBalance(await re.getAddress());
    expect(hubBal + reBal).to.equal(ethers.parseEther('1'));
  });

  // ======================================================================
  //  4. BRAK ADMINA (negatywne sprawdzenia interfejsu)
  // ======================================================================

  it('nie ma zadnej powierzchni admina', async function () {
    const frags = rewards.interface.fragments
      .filter((f: any) => f.type === 'function')
      .map((f: any) => f.name.toLowerCase());
    for (const banned of ['owner', 'transferownership', 'withdraw', 'sweep', 'rescue', 'pause', 'setconsumer', 'upgradeto']) {
      expect(frags, `nie powinno byc ${banned}`).to.not.include(banned);
    }
  });

  // ======================================================================
  //  5. HUB JAKO ODBIORCA LAUNCHPADA (integracja z padem)
  // ======================================================================

  describe('jako odbiorca _feeReceivers launchpada', function () {
    beforeEach(async function () {
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
    });

    async function launchWithReceivers(receivers: string[], shares: bigint[]) {
      const tx = await pad
        .connect(alice)
        .launchAdvanced(
          'Sphere',
          'SPHERE',
          0n,
          (await now()) + 600,
          SPHERE_PARAMS.FEE_BPS,
          SPHERE_PARAMS.CREATOR_FEE_BPS,
          SPHERE_PARAMS.BUYBACK_BPS,
          ethers.parseEther('1000000000'),
          receivers,
          shares,
          ''
        );
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
      return ev.args[0] as string;
    }

    it('nabija claimable swoim udzialem i wyplaca przez claimFor na hub', async function () {
      const token = await launchWithReceivers(
        [await rewards.getAddress(), sink.address],
        SPHERE_PARAMS.RECEIVER_SHARES_BPS
      );
      await warp(WINDOW + 1);

      const ethIn = ethers.parseEther('1');
      const quote = await pad.quoteBuy(token, ethIn);
      const curveFee = quote[1] as bigint;
      await pad.connect(bob).buy(token, 1n, (await now()) + 600, { value: ethIn });

      // Dzialka tworcy = fee * creatorFeeBps / feeBps; hub bierze pierwszy udzial.
      const doTworcow = (curveFee * SPHERE_PARAMS.CREATOR_FEE_BPS) / SPHERE_PARAMS.FEE_BPS;
      const doRewards =
        (doTworcow * SPHERE_PARAMS.RECEIVER_SHARES_BPS[0]) / 10_000n;
      expect(await pad.claimable(await rewards.getAddress())).to.equal(doRewards);

      // claimFor permissionless: ETH laduje na hubie jako czyste saldo do pull.
      await pad.connect(deployer).claimFor(await rewards.getAddress());
      expect(await rewards.pullable()).to.equal(doRewards);

      // I konsument moze je stad wyciagnac.
      await rewards.connect(consumer).pull(sink.address, doRewards);
      expect(await rewards.pullable()).to.equal(0n);
    });
  });
});
