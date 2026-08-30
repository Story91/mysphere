// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w LaunchpadEndToEnd.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');
const { SPHERE_PARAMS } = require('./helpers/deploySphere');

/**
 * SPHERE - pelny cykl zycia z escrow jako tworca (Ring 1, lustro
 * LaunchpadEndToEnd.test.ts).
 *
 *   escrow.launch (vanity, dev-buy, receivers=[rewards, escrow])
 *     -> krzywa (fee do rewards + escrow + Safe)
 *     -> Locked -> graduate (buybackBps dojezdza do hooka)
 *     -> swap w puli (hook bierze 1%)
 *     -> settle (30% Safe / dzialka tworcy DO ESCROW, ciecie buybacku)
 *     -> claimEthFor(escrow) - post-graduacyjne ETH wchodzi do escrow
 *     -> harvest (LP fee 70/30, obie nogi: ETH i TOKEN do escrow)
 *     -> executeBuyback - SPHERE spalone na 0xdEaD
 *     -> escrow.release() + releaseToken() - NIC nie zostaje uwiezione
 *     -> pad.balance == totalLiabilities (nic nie zginelo)
 *
 * Czego NIE dowodzi: B20 (precompile) i prawdziwego PoolManagera - patrz
 * naglowek CurveLaunchpad.test.ts. Poziomem dowodu dla v4 jest fork (Ring 2).
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const DEAD = '0x000000000000000000000000000000000000dEaD';
const WINDOW = 300;
const HOOK_FEE_BPS = 100n;
const VANITY_SALT = ethers.id('sphere-lifecycle-salt');

describe('SPHERE - pelny cykl zycia (escrow jako tworca)', function () {
  this.timeout(180_000);
  let deployer: any, authority: any, alice: any, bob: any, treasury: any;
  let pot: any, ops: any, tokenTarget: any, consumer: any;
  let pad: any, vault: any, hook: any, tokenFactory: any, pm: any, probe: any;
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

  function plain(k: any) {
    return [k[0], k[1], k[2], k[3], k[4]];
  }

  beforeEach(async function () {
    [deployer, authority, alice, bob, treasury, pot, ops, tokenTarget, consumer] =
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

    const SP = await ethers.getContractFactory('SwapProbe');
    probe = await SP.deploy();
    await probe.waitForDeployment();

    rewards = await (await ethers.getContractFactory('SphereRewards')).deploy(consumer.address);
    await rewards.waitForDeployment();

    // Escrow: adres przewidziany z nonce, bo jest we wlasnym configu odbiorcow.
    const nonce = await deployer.getNonce('pending');
    const predicted = ethers.getCreateAddress({ from: deployer.address, nonce });
    const Escrow = await ethers.getContractFactory('SphereCreatorEscrow');
    escrow = await Escrow.connect(deployer).deploy(
      await pad.getAddress(),
      authority.address,
      pot.address,
      ops.address,
      5000,
      tokenTarget.address,
      {
        vanitySalt: VANITY_SALT,
        name: 'Sphere',
        symbol: 'SPHERE',
        feeBps: SPHERE_PARAMS.FEE_BPS,
        creatorFeeBps: SPHERE_PARAMS.CREATOR_FEE_BPS,
        buybackBps: SPHERE_PARAMS.BUYBACK_BPS,
        windowCap: ethers.parseEther('120000000'),
        receiverAccounts: [await rewards.getAddress(), predicted],
        receiverSharesBps: SPHERE_PARAMS.RECEIVER_SHARES_BPS,
        metadataURI: 'ipfs://sphere-meta',
      }
    );
    await escrow.waitForDeployment();
    expect((await escrow.getAddress()).toLowerCase()).to.equal(predicted.toLowerCase());
  });

  it('launch -> krzywa -> graduate -> swap -> settle -> harvest -> buyback -> release', async function () {
    // ---- 1. LAUNCH Z DEV-BUYEM --------------------------------------------
    const devBuy = ethers.parseEther('0.05');
    await escrow.connect(authority).launch(1n, (await now()) + 600, { value: devBuy });
    const token = await escrow.sphereToken();
    const asset = await ethers.getContractAt('MockB20', token);

    expect((await pad.launchOf(token))[0], 'creator == escrow').to.equal(
      await escrow.getAddress()
    );
    const devBuyTokens = await asset.balanceOf(await escrow.getAddress());
    expect(devBuyTokens, 'dev-buy na escrow').to.be.greaterThan(0n);

    // ---- 2. KRZYWA: fee do receiverow, potem domkniecie -------------------
    await hre.network.provider.send('evm_increaseTime', [WINDOW + 1]);
    await hre.network.provider.send('evm_mine');

    const ethIn = ethers.parseEther('5');
    const quote = await pad.quoteBuy(token, ethIn);
    const curveFee = quote[1] as bigint;
    await pad.connect(alice).buy(token, 1n, (await now()) + 600, { value: ethIn });
    expect((await pad.launchOf(token))[1], 'krzywa domknieta').to.equal(2);

    const doTworcow = (curveFee * SPHERE_PARAMS.CREATOR_FEE_BPS) / SPHERE_PARAMS.FEE_BPS;
    const doRewards = (doTworcow * SPHERE_PARAMS.RECEIVER_SHARES_BPS[0]) / 10_000n;
    expect(await pad.claimable(await rewards.getAddress()), 'udzial rewards z krzywej')
      .to.be.greaterThanOrEqual(doRewards); // >= bo dev-buy tez nabil fee

    // ---- 3. GRADUACJA ------------------------------------------------------
    await pad.connect(bob).graduate(token);
    expect((await pad.launchOf(token))[1], 'po awansie').to.equal(3);
    expect(await hook.buybackBps(token), 'buybackBps dojechal do hooka').to.equal(
      SPHERE_PARAMS.BUYBACK_BPS
    );
    const key = await pad.poolKeyOf(token);

    // ---- 4. SWAP W PULI: hook bierze 1% ------------------------------------
    const outEth = ethers.parseEther('0.02');
    await pm.setNextCounterAmount(outEth);
    await asset.mint(await probe.getAddress(), ethers.parseEther('1000'));
    await probe.doSwap(plain(key), [false, -ethers.parseEther('1000'), 0n], {});

    const hookFee = (outEth * HOOK_FEE_BPS + 9_999n) / 10_000n;
    expect(await hook.pendingEth(token)).to.equal(hookFee);

    // ---- 5. SETTLE: dzialka tworcy IDZIE DO ESCROW -------------------------
    const doProtokolu = (hookFee * SPHERE_PARAMS.PROTOCOL_SHARE_BPS) / 10_000n;
    const dzialkaTworcy = hookFee - doProtokolu;
    const naBuyback = (dzialkaTworcy * SPHERE_PARAMS.BUYBACK_BPS) / 10_000n;
    await hook.connect(bob).settle(token);

    expect(await hook.claimableEth(treasury.address), 'Safe 30%').to.equal(doProtokolu);
    expect(
      await hook.claimableEth(await escrow.getAddress()),
      'reszta dzialki tworcy ksiegowana ESCROW, nie EOA'
    ).to.equal(dzialkaTworcy - naBuyback);
    expect(await hook.pendingBuybackEth(token)).to.equal(naBuyback);

    // Dostawa do escrow przez permissionless claimEthFor.
    const escrowEthBefore = await ethers.provider.getBalance(await escrow.getAddress());
    await hook.connect(bob).claimEthFor(await escrow.getAddress());
    expect(
      (await ethers.provider.getBalance(await escrow.getAddress())) - escrowEthBefore
    ).to.equal(dzialkaTworcy - naBuyback);

    // ---- 6. HARVEST: LP fee 70/30, noga ETH i TOKEN do escrow --------------
    const fee0 = ethers.parseEther('0.01');
    const fee1 = ethers.parseEther('1000');
    await pm.setPendingFees(plain(key), fee0, fee1);
    await deployer.sendTransaction({ to: POOL_MANAGER, value: fee0 });
    await asset.mint(POOL_MANAGER, fee1);
    await vault.connect(bob).harvest(token);

    const protoEth = (fee0 * SPHERE_PARAMS.PROTOCOL_SHARE_BPS) / 10_000n;
    const protoTok = (fee1 * SPHERE_PARAMS.PROTOCOL_SHARE_BPS) / 10_000n;
    expect(await vault.claimableEth(await escrow.getAddress())).to.equal(fee0 - protoEth);
    expect(await vault.claimableToken(token, await escrow.getAddress())).to.equal(
      fee1 - protoTok
    );

    await vault.connect(bob).claimEthFor(await escrow.getAddress());
    await vault.connect(bob).claimTokenFor(token, await escrow.getAddress());
    expect(
      await asset.balanceOf(await escrow.getAddress()),
      'escrow trzyma dev-buy + tokenowa noge LP'
    ).to.equal(devBuyTokens + (fee1 - protoTok));

    // ---- 7. BUYBACK: SPHERE spalone ---------------------------------------
    const kupione = ethers.parseEther('321');
    await pm.setNextCounterAmount(kupione);
    const deadBefore = await asset.balanceOf(DEAD);
    await hook.connect(bob).executeBuyback(token, 1n, (await now()) + 600);
    expect((await asset.balanceOf(DEAD)) - deadBefore, 'spalone na 0xdEaD').to.equal(kupione);
    expect(await hook.pendingBuybackEth(token)).to.equal(0n);

    // ---- 8. RELEASE: NIC nie zostaje uwiezione w escrow --------------------
    // Najpierw sciagamy tez fee z krzywej nalezne escrow.
    await pad.connect(bob).claimFor(await escrow.getAddress());
    const escrowEth = await ethers.provider.getBalance(await escrow.getAddress());
    expect(escrowEth).to.be.greaterThan(0n);

    const potBefore = await ethers.provider.getBalance(pot.address);
    const opsBefore = await ethers.provider.getBalance(ops.address);
    await escrow.connect(bob).release();
    const toPot = (escrowEth * 5000n) / 10_000n;
    expect((await ethers.provider.getBalance(pot.address)) - potBefore).to.equal(toPot);
    expect((await ethers.provider.getBalance(ops.address)) - opsBefore).to.equal(
      escrowEth - toPot
    );
    expect(await ethers.provider.getBalance(await escrow.getAddress()), 'zero ETH w escrow').to.equal(0n);

    await escrow.connect(bob).releaseToken(ethers.ZeroAddress);
    expect(await asset.balanceOf(await escrow.getAddress()), 'zero tokenow w escrow').to.equal(0n);
    expect(await asset.balanceOf(tokenTarget.address)).to.equal(
      devBuyTokens + (fee1 - protoTok)
    );

    // Rewards: saldo z krzywej dostarczone i wyciagalne przez konsumenta.
    await pad.connect(bob).claimFor(await rewards.getAddress());
    const hubBal = await rewards.pullable();
    expect(hubBal).to.be.greaterThan(0n);
    await rewards.connect(consumer).pull(ops.address, hubBal);

    // ---- 9. NIC NIE UTKNELO W PADZIE ---------------------------------------
    expect(await ethers.provider.getBalance(await pad.getAddress())).to.equal(
      await pad.totalLiabilities()
    );
  });
});
