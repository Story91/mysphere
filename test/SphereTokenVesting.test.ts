// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w CurveLaunchpad.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');
const { SPHERE_PARAMS } = require('./helpers/deploySphere');

/**
 * SphereTokenVesting - decyzja #11a (2026-08-30): tokeny z escrow ida do
 * jawnego vestingu, nie do gologo Safe.
 *
 * Dwie warstwy dowodu:
 *  1. VESTING W IZOLACJI - zegar (klif / liniowo / koniec), vesting po
 *     saldzie (doplywy w trakcie wchodza do tej samej podstawy), wyplata
 *     tylko do BENEFICIARY, CEI, brak admina, zaden token nie zamurowany.
 *  2. WIRING Z ESCROW - TOKEN_TARGET escrow wskazuje vesting: dev-buy
 *     przechodzi launch -> releaseToken -> vesting -> (po harmonogramie)
 *     BENEFICIARY. To jest dokladnie sciezka fazy 0.
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const WINDOW = 300;

const DAY = 24n * 3600n;
const CLIFF = SPHERE_PARAMS.VESTING_CLIFF;
const DURATION = SPHERE_PARAMS.VESTING_DURATION;

describe('SphereTokenVesting', function () {
  this.timeout(120_000);
  let deployer: any, beneficiary: any, alice: any, bob: any;
  let vesting: any, token: any;
  let start: bigint;

  async function now() {
    return BigInt((await ethers.provider.getBlock('latest')).timestamp);
  }

  async function warpTo(timestamp: bigint) {
    await hre.network.provider.send('evm_setNextBlockTimestamp', [Number(timestamp)]);
    await hre.network.provider.send('evm_mine');
  }

  beforeEach(async function () {
    [deployer, beneficiary, alice, bob] = await ethers.getSigners();

    // Goly MockB20 jako token - vesting jest generyczny per ERC-20.
    const T = await ethers.getContractFactory('MockB20');
    token = await T.deploy();
    await token.waitForDeployment();

    start = (await now()) + 100n;
    const V = await ethers.getContractFactory('SphereTokenVesting');
    vesting = await V.deploy(beneficiary.address, start, CLIFF, DURATION);
    await vesting.waitForDeployment();
  });

  // ======================================================================
  //  1. KONSTRUKTOR
  // ======================================================================

  it('zamraza harmonogram; odrzuca bezsensowne konfiguracje', async function () {
    expect(await vesting.BENEFICIARY()).to.equal(beneficiary.address);
    expect(await vesting.START()).to.equal(start);
    expect(await vesting.CLIFF()).to.equal(CLIFF);
    expect(await vesting.DURATION()).to.equal(DURATION);

    const V = await ethers.getContractFactory('SphereTokenVesting');
    await expect(V.deploy(ethers.ZeroAddress, start, CLIFF, DURATION)).to.be.revertedWithCustomError(
      vesting,
      'ZeroAddress'
    );
    await expect(V.deploy(beneficiary.address, start, 10n, 0n)).to.be.revertedWithCustomError(
      vesting,
      'BadSchedule'
    );
    await expect(
      V.deploy(beneficiary.address, start, DURATION + 1n, DURATION)
    ).to.be.revertedWithCustomError(vesting, 'BadSchedule');
  });

  // ======================================================================
  //  2. ZEGAR: klif -> liniowo -> koniec
  // ======================================================================

  it('przed klifem nie wychodzi NIC', async function () {
    await token.mint(await vesting.getAddress(), ethers.parseEther('1000'));
    await warpTo(start + CLIFF - 10n);
    expect(await vesting.releasable(await token.getAddress())).to.equal(0n);
    await expect(
      vesting.connect(bob).release(await token.getAddress())
    ).to.be.revertedWithCustomError(vesting, 'NothingToRelease');
  });

  it('liniowo w polowie harmonogramu: dokladnie total * elapsed / DURATION', async function () {
    const total = ethers.parseEther('1000');
    await token.mint(await vesting.getAddress(), total);
    const half = start + DURATION / 2n;
    await warpTo(half);
    const expected = (total * (half - start)) / DURATION;
    expect(await vesting.releasable(await token.getAddress())).to.equal(expected);

    const before = await token.balanceOf(beneficiary.address);
    // Timestamp NASTEPNEGO bloku bez minowania - tx release laduje dokladnie
    // w zadanym czasie, wiec oczekiwana kwota liczy sie z tego samego zegara.
    const releaseAt = half + 5n;
    await hre.network.provider.send('evm_setNextBlockTimestamp', [Number(releaseAt)]);
    const expectedAtRelease = (total * (releaseAt - start)) / DURATION;
    await expect(vesting.connect(bob).release(await token.getAddress()))
      .to.emit(vesting, 'TokensReleased')
      .withArgs(await token.getAddress(), expectedAtRelease, bob.address);
    expect((await token.balanceOf(beneficiary.address)) - before).to.equal(expectedAtRelease);
    expect(await vesting.released(await token.getAddress())).to.equal(expectedAtRelease);
  });

  it('po koncu harmonogramu wychodzi wszystko, takze POZNIEJSZE doplywy', async function () {
    await token.mint(await vesting.getAddress(), ethers.parseEther('100'));
    await warpTo(start + DURATION + 1n);
    await vesting.connect(bob).release(await token.getAddress());
    expect(await token.balanceOf(beneficiary.address)).to.equal(ethers.parseEther('100'));

    // Wieczny strumien fee: doplyw po koncu jest natychmiast wyplacalny.
    await token.mint(await vesting.getAddress(), ethers.parseEther('7'));
    expect(await vesting.releasable(await token.getAddress())).to.equal(ethers.parseEther('7'));
    await vesting.connect(alice).release(await token.getAddress());
    expect(await token.balanceOf(beneficiary.address)).to.equal(ethers.parseEther('107'));
  });

  it('doplyw W TRAKCIE harmonogramu wchodzi do tej samej podstawy (vesting po saldzie)', async function () {
    await token.mint(await vesting.getAddress(), ethers.parseEther('100'));
    const half = start + DURATION / 2n;
    await warpTo(half);
    // Doplyw drugiej setki w polowie: vested liczy sie od CALOSCI podstawy.
    await token.mint(await vesting.getAddress(), ethers.parseEther('100'));
    const t = await now();
    const expected = (ethers.parseEther('200') * (t - start)) / DURATION;
    expect(await vesting.vestedAmount(await token.getAddress(), t)).to.equal(expected);
  });

  it('wyplata idzie WYLACZNIE do BENEFICIARY - wolajacy placi tylko gaz', async function () {
    await token.mint(await vesting.getAddress(), ethers.parseEther('50'));
    await warpTo(start + DURATION + 1n);
    await vesting.connect(alice).release(await token.getAddress());
    expect(await token.balanceOf(alice.address)).to.equal(0n);
    expect(await token.balanceOf(beneficiary.address)).to.equal(ethers.parseEther('50'));
  });

  it('drugi release bez nowych doplywow rewertuje; podstawa nie podwaja sie', async function () {
    await token.mint(await vesting.getAddress(), ethers.parseEther('10'));
    await warpTo(start + DURATION + 1n);
    await vesting.connect(bob).release(await token.getAddress());
    await expect(
      vesting.connect(bob).release(await token.getAddress())
    ).to.be.revertedWithCustomError(vesting, 'NothingToRelease');
    // totalReceived stabilne: saldo 0 + released 10.
    expect(await vesting.totalReceived(await token.getAddress())).to.equal(
      ethers.parseEther('10')
    );
  });

  it('nie ma zadnej powierzchni admina', async function () {
    const frags = vesting.interface.fragments
      .filter((f: any) => f.type === 'function')
      .map((f: any) => f.name.toLowerCase());
    for (const banned of ['owner', 'transferownership', 'withdraw', 'sweep', 'rescue', 'pause', 'setbeneficiary', 'setschedule', 'upgradeto']) {
      expect(frags, `nie powinno byc ${banned}`).to.not.include(banned);
    }
  });

  // ======================================================================
  //  3. WIRING Z ESCROW - sciezka fazy 0
  // ======================================================================

  describe('jako TOKEN_TARGET escrow', function () {
    let pad: any, tokenFactory: any, authority: any, pot: any, ops: any, consumer: any;
    let rewards: any, escrow: any;

    async function installAt(name: string, address: string) {
      const F = await ethers.getContractFactory(name);
      const d = await F.deploy();
      await d.waitForDeployment();
      const code = await ethers.provider.getCode(await d.getAddress());
      await hre.network.provider.send('hardhat_setCode', [address, code]);
      return F.attach(address);
    }

    beforeEach(async function () {
      [deployer, beneficiary, alice, bob, authority, pot, ops, consumer] =
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
        feeRecipient: alice.address,
        protocolShareBps: SPHERE_PARAMS.PROTOCOL_SHARE_BPS,
        tokenFactory: await tokenFactory.getAddress(),
      }));

      rewards = await (await ethers.getContractFactory('SphereRewards')).deploy(consumer.address);
      await rewards.waitForDeployment();

      const nonce = await deployer.getNonce('pending');
      const predicted = ethers.getCreateAddress({ from: deployer.address, nonce });
      const Escrow = await ethers.getContractFactory('SphereCreatorEscrow');
      escrow = await Escrow.connect(deployer).deploy(
        await pad.getAddress(),
        authority.address,
        pot.address,
        ops.address,
        SPHERE_PARAMS.ETH_POT_BPS,
        await vesting.getAddress(), // TOKEN_TARGET = vesting (decyzja #11a)
        {
          vanitySalt: ethers.id('vesting-wiring-salt'),
          name: 'Sphere',
          symbol: 'SPHERE',
          feeBps: SPHERE_PARAMS.FEE_BPS,
          creatorFeeBps: SPHERE_PARAMS.CREATOR_FEE_BPS,
          buybackBps: SPHERE_PARAMS.BUYBACK_BPS,
          windowCap: ethers.parseEther('120000000'),
          receiverAccounts: [await rewards.getAddress(), predicted],
          receiverSharesBps: SPHERE_PARAMS.RECEIVER_SHARES_BPS,
          metadataURI: '',
        }
      );
      await escrow.waitForDeployment();
    });

    it('dev-buy: launch -> releaseToken -> vesting -> (po harmonogramie) Safe', async function () {
      const t = BigInt((await ethers.provider.getBlock('latest')).timestamp);
      await escrow.connect(authority).launch(1n, t + 600n, { value: ethers.parseEther('0.05') });
      const sphere = await escrow.sphereToken();
      const asset = await ethers.getContractAt('MockB20', sphere);
      const devBuyTokens = await asset.balanceOf(await escrow.getAddress());

      // Tokeny wychodza z escrow do vestingu...
      await escrow.connect(bob).releaseToken(ethers.ZeroAddress);
      expect(await asset.balanceOf(await vesting.getAddress())).to.equal(devBuyTokens);

      // ...ale przed klifem NIE da sie ich ruszyc dalej.
      await expect(vesting.connect(bob).release(sphere)).to.be.revertedWithCustomError(
        vesting,
        'NothingToRelease'
      );

      // Po koncu harmonogramu: wszystko do BENEFICIARY.
      await warpTo(start + DURATION + 1n);
      await vesting.connect(bob).release(sphere);
      expect(await asset.balanceOf(beneficiary.address)).to.equal(devBuyTokens);
      expect(await asset.balanceOf(await vesting.getAddress())).to.equal(0n);
    });
  });
});
