// ZLOTY TEST SPHERE: czy escrow-as-creator dziala na PRAWDZIWYM, WDROZONYM
// bajtkodzie Base mainnet?
//
// Wzor: test/CurveLaunchpadSafeRecipient.test.ts. Tam launchpad byl swiezy,
// a Safe prawdziwy; TUTAJ WSZYSTKO jest prawdziwe - CurveLaunchpad
// 0xCF54..., LiquidityVault 0x6108..., B20LaunchHook 0x7102...,
// B20TokenFactory 0xEC7d..., PoolManager v4 0x4985... i Safe 0x83E2... -
// z jednym wyjatkiem: B20 to precompile w oprogramowaniu wezla, ktorego fork
// nie pobierze (eth_getCode(0xB20f...) = pustka), wiec pod TEN JEDEN adres
// wchodzi MockB20Factory przez hardhat_setCode. Realna fabryka 0xEC7d...
// wola wtedy atrape dokladnie ta sama sciezka, co precompile.
//
// CZEGO TEN PLIK DOWODZI (a czego nie dowiodl Ring 1):
//  - launchVanity/predictVanityToken/claimFor/settle/harvest/executeBuyback
//    dzialaja na WDROZONYCH immutable'ach (FEE_BPS=100, CREATOR_FEE_BPS=70,
//    PROTOCOL_SHARE_BPS=3000, FEE_RECIPIENT=Safe), nie na swiezym deployu,
//  - graduacja przechodzi przez PRAWDZIWY PoolManager (initialize +
//    modifyLiquidity + settle), swap przez prawdziwa pule z naszym hookiem,
//  - protokolowa noga laduje na PRAWDZIWYM Safe.
//
// CZEGO NIE DOWODZI: semantyki samego B20 (tylko transakcja na Sepolii /
// mainnecie) - patrz naglowek CurveLaunchpad.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { SPHERE_PARAMS } = require('./helpers/deploySphere');

const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// scripts/output/launchpad-base.json - wdrozenie 2026-08-11, blok 49843030.
const REAL_PAD = '0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D';
const REAL_VAULT = '0x6108aDCb176D2A4A6283A06bb0Dd468b86A6AB63';
const REAL_HOOK = '0x71028Ea6999e2c415b46cc022ED0A9fDca2e2044';
const SAFE = '0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const DEAD = '0x000000000000000000000000000000000000dEaD';

const WINDOW = 300;
const HOOK_FEE_BPS = 100n;
// Granice cen v4 (TickMath) - prawdziwy PoolManager egzekwuje limity,
// atrapa je ignorowala.
const MIN_SQRT_PRICE = 4295128739n;
const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;

describe('SPHERE - fork Base: escrow na WDROZONYM bajtkodzie', function () {
  this.timeout(600_000);
  let forked = true;
  let deployer: any, authority: any, alice: any, bob: any;
  let pot: any, ops: any, tokenTarget: any, consumer: any;
  let pad: any, vault: any, hook: any;
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

  function plain(k: any) {
    return [k[0], k[1], k[2], k[3], k[4]];
  }

  /** Wdraza pare rewards+escrow spieta z REALNYM padem; salt per wywolanie. */
  async function deployPair(saltTag: string, windowCap: bigint) {
    const Rewards = await ethers.getContractFactory('SphereRewards');
    const r = await Rewards.deploy(consumer.address);
    await r.waitForDeployment();

    const nonce = await deployer.getNonce('pending');
    const predicted = ethers.getCreateAddress({ from: deployer.address, nonce });
    const Escrow = await ethers.getContractFactory('SphereCreatorEscrow');
    const e = await Escrow.connect(deployer).deploy(
      REAL_PAD,
      authority.address,
      pot.address,
      ops.address,
      5000,
      tokenTarget.address,
      {
        vanitySalt: ethers.id(saltTag),
        name: 'Sphere',
        symbol: 'SPHERE',
        feeBps: SPHERE_PARAMS.FEE_BPS,
        creatorFeeBps: SPHERE_PARAMS.CREATOR_FEE_BPS,
        buybackBps: SPHERE_PARAMS.BUYBACK_BPS,
        windowCap,
        receiverAccounts: [await r.getAddress(), predicted],
        receiverSharesBps: SPHERE_PARAMS.RECEIVER_SHARES_BPS,
        metadataURI: 'ipfs://sphere-fork',
      }
    );
    await e.waitForDeployment();
    expect((await e.getAddress()).toLowerCase()).to.equal(predicted.toLowerCase());
    return { rewards: r, escrow: e };
  }

  before(async function () {
    try {
      await hre.network.provider.request({
        method: 'hardhat_reset',
        params: [{ forking: { jsonRpcUrl: BASE_RPC } }],
      });
      // Bez kodu pod padem i Safe fork nie ma czego dowodzic.
      if (
        (await ethers.provider.getCode(REAL_PAD)) === '0x' ||
        (await ethers.provider.getCode(SAFE)) === '0x'
      ) {
        forked = false;
      }
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
    [deployer, authority, alice, bob, pot, ops, tokenTarget, consumer] =
      await ethers.getSigners();

    // Jedyna atrapa na calym forku: precompile B20.
    await installAt('MockB20Factory', B20_FACTORY);

    pad = await ethers.getContractAt('CurveLaunchpad', REAL_PAD);
    vault = await ethers.getContractAt('LiquidityVault', REAL_VAULT);
    hook = await ethers.getContractAt('B20LaunchHook', REAL_HOOK);
  });

  it('sanity: wdrozone wiazania zgadzaja sie z launchpad-base.json', async function () {
    expect(await pad.VAULT()).to.equal(REAL_VAULT);
    expect(await vault.HOOK()).to.equal(REAL_HOOK);
    expect(await pad.FEE_RECIPIENT()).to.equal(SAFE);
    expect(await hook.FEE_RECIPIENT()).to.equal(SAFE);
  });

  it('escrow zostaje creatorem na wdrozonym bajtkodzie; dev-buy pod windowCap', async function () {
    ({ rewards, escrow } = await deployPair('fork-salt-1', ethers.parseEther('120000000')));

    const predicted = await pad.predictVanityToken(
      await escrow.getAddress(),
      ethers.id('fork-salt-1')
    );

    const devBuy = ethers.parseEther('0.05');
    const tx = await escrow.connect(authority).launch(1n, (await now()) + 600, { value: devBuy });
    const rc = await tx.wait();
    const parsed = rc.logs
      .map((l: any) => {
        try {
          return pad.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter((l: any) => l);
    const launched = parsed.find((l: any) => l.name === 'Launched');
    const bought = parsed.find((l: any) => l.name === 'Bought');

    expect(launched.args[1], 'creator == escrow na realnym padzie').to.equal(
      await escrow.getAddress()
    );
    expect(launched.args[0], 'adres zgodny z predictVanityToken realnego padu').to.equal(
      predicted
    );
    const tokensOut = bought.args[5] as bigint;
    expect(
      await pad.windowBought(launched.args[0], await escrow.getAddress()),
      'cap obciaza escrow na wdrozonym bajtkodzie'
    ).to.equal(tokensOut);
  });

  it('za ciasny windowCap rewertuje CALY launch na wdrozonym bajtkodzie', async function () {
    const pair = await deployPair('fork-salt-tight', 1n);
    await expect(
      pair.escrow
        .connect(authority)
        .launch(1n, (await now()) + 600, { value: ethers.parseEther('0.05') })
    ).to.be.revertedWithCustomError(pad, 'WindowCap');
    expect(await pair.escrow.launched()).to.equal(false);
  });

  it('pelny cykl na REALNYM PoolManagerze: krzywa -> graduate -> swapy -> settle/harvest -> buyback -> release', async function () {
    ({ rewards, escrow } = await deployPair('fork-salt-full', ethers.parseEther('120000000')));

    // ---- LAUNCH + KRZYWA ---------------------------------------------------
    const devBuy = ethers.parseEther('0.05');
    await (
      await escrow.connect(authority).launch(1n, (await now()) + 600, { value: devBuy })
    ).wait();
    const token = await escrow.sphereToken();
    const asset = await ethers.getContractAt('MockB20', token);
    const devBuyTokens = await asset.balanceOf(await escrow.getAddress());

    await warp(WINDOW + 1);
    const safeCurveBefore: bigint = await pad.claimable(SAFE);
    await (
      await pad.connect(alice).buy(token, 1n, (await now()) + 600, { value: ethers.parseEther('5') })
    ).wait();
    expect((await pad.launchOf(token))[1], 'krzywa domknieta').to.equal(2);

    // Protokolowa noga z krzywej naliczona PRAWDZIWEMU Safe.
    expect((await pad.claimable(SAFE)) - safeCurveBefore, 'Safe zebral 30% fee krzywej').to.be.gt(
      0n
    );
    // Odbiorcy: rewards + escrow maja claimable > 0.
    expect(await pad.claimable(await rewards.getAddress())).to.be.gt(0n);
    expect(await pad.claimable(await escrow.getAddress())).to.be.gt(0n);

    // ---- GRADUATE: prawdziwy initialize + modifyLiquidity ------------------
    const [gradFee, callerReward] = await pad.gradFeeOf(token);
    const bobBefore: bigint = await pad.claimable(bob.address);
    await (await pad.connect(bob).graduate(token)).wait();
    expect((await pad.launchOf(token))[1], 'po awansie').to.equal(3);
    expect((await pad.claimable(bob.address)) - bobBefore, 'nagroda wolajacego = gradFee/2').to.equal(
      callerReward
    );
    expect(callerReward).to.equal(gradFee / 2n);
    expect(await hook.buybackBps(token), 'buybackBps dojechal do realnego hooka').to.equal(
      SPHERE_PARAMS.BUYBACK_BPS
    );
    expect((await vault.positionOf(token))[1], 'realna pozycja LP istnieje').to.be.gt(0n);

    // ---- SWAPY W PRAWDZIWEJ PULI ------------------------------------------
    const Probe = await ethers.getContractFactory('RealPoolSwapProbe');
    const probe = await Probe.deploy(POOL_MANAGER);
    await probe.waitForDeployment();
    const key = plain(await pad.poolKeyOf(token));

    // (1) ETH -> token (zeroForOne): wejscie ETH, hook tnie strone tokenowa.
    await (
      await probe.doSwap(key, [true, -ethers.parseEther('0.2'), MIN_SQRT_PRICE + 1n], {
        value: ethers.parseEther('0.2'),
      })
    ).wait();
    expect(await hook.pendingToken(token), 'fee tokenowe hooka po kupnie').to.be.gt(0n);

    // (2) token -> ETH: wejscie tokenowe, hook tnie strone ETH.
    await (await asset.mint(await probe.getAddress(), ethers.parseEther('1000000'))).wait();
    await (
      await probe.doSwap(key, [false, -ethers.parseEther('1000000'), MAX_SQRT_PRICE - 1n], {})
    ).wait();
    const pendingEth: bigint = await hook.pendingEth(token);
    expect(pendingEth, 'fee ETH hooka po sprzedazy').to.be.gt(0n);

    // ---- SETTLE: podzial na wdrozonych parametrach (30/70, buyback 50%) ----
    const pendingTok: bigint = await hook.pendingToken(token);
    const protoEth = (pendingEth * SPHERE_PARAMS.PROTOCOL_SHARE_BPS) / 10_000n;
    const creatorEthGross = pendingEth - protoEth;
    const naBuyback = (creatorEthGross * SPHERE_PARAMS.BUYBACK_BPS) / 10_000n;
    const protoTok = (pendingTok * SPHERE_PARAMS.PROTOCOL_SHARE_BPS) / 10_000n;

    // Delty, nie wartosci bezwzgledne: realny Safe moze miec juz claimable
    // z prawdziwej aktywnosci mainnetu sprzed bloku forka.
    const safeHookEthBefore: bigint = await hook.claimableEth(SAFE);
    await (await hook.connect(bob).settle(token)).wait();
    expect(
      (await hook.claimableEth(SAFE)) - safeHookEthBefore,
      'Safe: 30% ETH z hooka'
    ).to.equal(protoEth);
    expect(
      await hook.claimableEth(await escrow.getAddress()),
      'escrow: reszta dzialki tworcy ETH'
    ).to.equal(creatorEthGross - naBuyback);
    expect(
      await hook.claimableToken(token, await escrow.getAddress()),
      'escrow: 70% tokenowej nogi (bez ciecia buybacku)'
    ).to.equal(pendingTok - protoTok);
    expect(await hook.pendingBuybackEth(token)).to.equal(naBuyback);

    // Dostawy do escrow (permissionless).
    await (await hook.connect(bob).claimEthFor(await escrow.getAddress())).wait();
    await (await hook.connect(bob).claimTokenFor(token, await escrow.getAddress())).wait();

    // ---- HARVEST: realne oplaty LP z pozycji vaulta ------------------------
    // Swapy powyzej naliczyly 0.3% fee puli pozycji vaulta w OBU walutach.
    await (await vault.connect(bob).harvest(token)).wait();
    const lpEthEscrow: bigint = await vault.claimableEth(await escrow.getAddress());
    const lpTokEscrow: bigint = await vault.claimableToken(token, await escrow.getAddress());
    expect(lpEthEscrow + lpTokEscrow, 'harvest zebral realne fee LP').to.be.gt(0n);
    if (lpEthEscrow > 0n) {
      await (await vault.connect(bob).claimEthFor(await escrow.getAddress())).wait();
    }
    if (lpTokEscrow > 0n) {
      await (await vault.connect(bob).claimTokenFor(token, await escrow.getAddress())).wait();
    }

    // ---- BUYBACK: realny swap w puli, tokeny na 0xdEaD ---------------------
    const deadBefore: bigint = await asset.balanceOf(DEAD);
    await (await hook.connect(bob).executeBuyback(token, 1n, (await now()) + 600)).wait();
    const spalone = (await asset.balanceOf(DEAD)) - deadBefore;
    expect(spalone, 'buyback spalil tokeny na realnym v4').to.be.gt(0n);
    // Clamp poslizgu moze zostawic czesc w pending (czesciowe wykonanie) -
    // ale nigdy nie wydaje wiecej, niz bylo odlozone.
    expect(await hook.pendingBuybackEth(token)).to.be.lte(naBuyback);

    // ---- RELEASE: nic nie zostaje uwiezione --------------------------------
    await (await pad.connect(bob).claimFor(await escrow.getAddress())).wait();
    const escrowEth: bigint = await ethers.provider.getBalance(await escrow.getAddress());
    expect(escrowEth).to.be.gt(0n);
    await (await escrow.connect(bob).release()).wait();
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);

    const escrowTok: bigint = await asset.balanceOf(await escrow.getAddress());
    expect(escrowTok, 'dev-buy + nogi tokenowe czekaja w escrow').to.be.gte(devBuyTokens);
    await (await escrow.connect(bob).releaseToken(ethers.ZeroAddress)).wait();
    expect(await asset.balanceOf(await escrow.getAddress())).to.equal(0n);
    expect(await asset.balanceOf(tokenTarget.address)).to.equal(escrowTok);

    // Rewards: dostawa z krzywej + pobor konsumenta.
    await (await pad.connect(bob).claimFor(await rewards.getAddress())).wait();
    const hubBal: bigint = await rewards.pullable();
    expect(hubBal).to.be.gt(0n);
    await (await rewards.connect(consumer).pull(ops.address, hubBal)).wait();

    // ---- KONSERWACJA: niezmiennik wyplacalnosci realnego pada --------------
    // Na zywym padzie z historia mainnetu obowiazuje balance >= totalLiabilities
    // (ktos mogl kiedys wymusic ETH selfdestructem); rownosci nie zakladamy.
    // Nasz przebieg ma go NIE zepsuc.
    expect(await ethers.provider.getBalance(REAL_PAD)).to.be.gte(await pad.totalLiabilities());
  });
});
