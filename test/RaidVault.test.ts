export {};

const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');

/**
 * ZAP ETH -> USDC -> perp -> mem na krzywej, na PRAWDZIWYM PoolManagerze v4.
 *
 * Pule sa lokalne i bezhakowe (ETH/USDC i USDC/perp) - hook Flash i precompile
 * B20 nie istnieja poza Base, wiec trase z prawdziwym ETH2xL sprawdza
 * symulacja eth_call na mainnecie (scripts/launchpad/perpZapSim.ts, odpalana
 * przez deployPerpZap.ts przed i po wdrozeniu).
 * Tu sprawdzamy logike zapa: rozliczenie dwoch wymian jednym unlock, buyFor
 * na odbiorce, zwrot nadwyzki z krzywej, zero saldo zapa po kazdej transakcji
 * i bramki (poslizg, trasa, termin, wolajacy callbacku).
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const HOOK_ALL_MASK = (1n << 14n) - 1n;
const HOOK_REQUIRED_FLAGS = (1n << 13n) | (1n << 6n) | (1n << 2n);
const ZERO = ethers.ZeroAddress;
const Q96 = 1n << 96n;
const R_VIRT = 1875n * 10n ** 18n; // jak na mainnecie: zbiorka 7 500 perpa
const T_MIN = 200_000_000n * 10n ** 18n;
const T0 = 1_000_000_000n * 10n ** 18n;
const FULL_LO = -887220;
const FULL_HI = 887220;

function sqrtBig(x: bigint) {
  if (x < 2n) return x;
  let r = BigInt(Math.floor(Math.sqrt(Number(x))));
  for (let i = 0; i < 8; i++) r = (r + x / r) >> 1n;
  while (r * r > x) r--;
  while ((r + 1n) * (r + 1n) <= x) r++;
  return r;
}

/** sqrtPriceX96 dla ceny "raw token1 za raw token0" = num / den. */
function sqrtPrice(num: bigint, den: bigint) {
  return sqrtBig((num * Q96 * Q96) / den);
}

describe('RaidVault - tryb PERP (PerpZap, prawdziwy PoolManager)', function () {
  this.timeout(300_000);

  let deployer: any, creator: any, alice: any, bob: any, treasury: any;
  let pm: any, usdc: any, perp: any, pad: any, zap: any, lp: any;
  let ethPool: any, perpPool: any, token: any, raid: any;

  async function deadline() {
    return (await ethers.provider.getBlock('latest')).timestamp + 3600;
  }

  async function installAt(name: string, address: string) {
    const F = await ethers.getContractFactory(name);
    const d = await F.deploy();
    await d.waitForDeployment();
    await hre.network.provider.send('hardhat_setCode', [address, await ethers.provider.getCode(await d.getAddress())]);
  }

  async function deployPad(quoteAddr: string) {
    // Fabryka B20 PRZED liczeniem adresow - jej wdrozenie zjada nonce.
    const TF = await ethers.getContractFactory('B20TokenFactory');
    const tf = await TF.deploy();
    await tf.waitForDeployment();
    const nonce = await deployer.getNonce('pending');
    const padAddr = ethers.getCreateAddress({ from: deployer.address, nonce });
    const vaultAddr = ethers.getCreateAddress({ from: padAddr, nonce: 1 });
    const Hook = await ethers.getContractFactory('QuoteLaunchHook');
    const initCode = ethers.concat([
      Hook.bytecode,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint16', 'address'],
        [await pm.getAddress(), treasury.address, 3000, quoteAddr]
      ),
    ]);
    const hash = ethers.keccak256(initCode);
    let salt = '';
    for (let i = 0; i < 2_000_000; i++) {
      const s = ethers.zeroPadValue(ethers.toBeHex(i), 32);
      if ((BigInt(ethers.getCreate2Address(vaultAddr, s, hash)) & HOOK_ALL_MASK) === HOOK_REQUIRED_FLAGS) {
        salt = s;
        break;
      }
    }
    const Pad = await ethers.getContractFactory('QuoteCurveLaunchpad');
    const p = await Pad.connect(deployer).deploy(
      await pm.getAddress(), quoteAddr, 100, 70, treasury.address, 3000, await tf.getAddress(), salt, R_VIRT
    );
    await p.waitForDeployment();
    expect(await p.getAddress()).to.equal(padAddr);
    return p;
  }

  async function zapBalances() {
    const z = await zap.getAddress();
    return {
      eth: await ethers.provider.getBalance(z),
      perp: await perp.balanceOf(z),
      usdc: await usdc.balanceOf(z),
    };
  }

  async function buy(value: bigint, opts: { minPerp?: bigint; minTokens?: bigint; recipient?: string; from?: any } = {}) {
    return zap
      .connect(opts.from ?? alice)
      .buyWithEth(
        await pad.getAddress(),
        await token.getAddress(),
        ethPool,
        perpPool,
        opts.minPerp ?? 1n,
        opts.minTokens ?? 1n,
        await deadline(),
        opts.recipient ?? alice.address,
        { value }
      );
  }

  beforeEach(async function () {
    [deployer, creator, alice, bob, treasury] = await ethers.getSigners();
    await installAt('MockB20Factory', B20_FACTORY);

    const PM = await ethers.getContractFactory('@uniswap/v4-core/src/PoolManager.sol:PoolManager');
    pm = await PM.deploy(deployer.address);
    await pm.waitForDeployment();

    const Q = await ethers.getContractFactory('MockQuoteToken');
    usdc = await Q.deploy(6);
    perp = await Q.deploy(18);
    await usdc.waitForDeployment();
    await perp.waitForDeployment();

    pad = await deployPad(await perp.getAddress());

    const Z = await ethers.getContractFactory('PerpZap');
    zap = await Z.deploy(await pm.getAddress());
    await zap.waitForDeployment();

    const LP = await ethers.getContractFactory('ZapLiquidityProbe');
    lp = await LP.deploy(await pm.getAddress());
    await lp.waitForDeployment();
    await (await usdc.mint(await lp.getAddress(), 10_000_000n * 10n ** 6n)).wait();
    await (await perp.mint(await lp.getAddress(), 10_000_000n * 10n ** 18n)).wait();

    // ETH/USDC: 1 ETH = 2 500 USDC, ~100 ETH glebokosci.
    const usdcAddr = await usdc.getAddress();
    const perpAddr = await perp.getAddress();
    ethPool = { currency0: ZERO, currency1: usdcAddr, fee: 3000, tickSpacing: 60, hooks: ZERO };
    await (await pm.initialize(ethPool, sqrtPrice(2500n * 10n ** 6n, 10n ** 18n))).wait();
    await (await lp.add(ethPool, FULL_LO, FULL_HI, 5n * 10n ** 15n, { value: ethers.parseEther('200') })).wait();

    // USDC/perp: 1 perp = 1 USDC, ~1 mln po kazdej stronie.
    const usdcIs0 = BigInt(usdcAddr) < BigInt(perpAddr);
    perpPool = usdcIs0
      ? { currency0: usdcAddr, currency1: perpAddr, fee: 3000, tickSpacing: 60, hooks: ZERO }
      : { currency0: perpAddr, currency1: usdcAddr, fee: 3000, tickSpacing: 60, hooks: ZERO };
    await (await pm.initialize(perpPool, usdcIs0 ? sqrtPrice(10n ** 18n, 10n ** 6n) : sqrtPrice(10n ** 6n, 10n ** 18n))).wait();
    await (await lp.add(perpPool, FULL_LO, FULL_HI, 10n ** 18n)).wait();

    const tx = await pad
      .connect(creator)
      .launchAdvanced('Perp Meme', 'PMEME', 0n, 0n, await deadline(), 100, 70, 0, T0, [creator.address], [10_000], '');
    const rc = await tx.wait();
    const ev = rc.logs.map((l: any) => pad.interface.parseLog(l)).find((e: any) => e && e.name === 'Launched');
    token = await ethers.getContractAt('MockB20', ev.args.token);
    const R = await ethers.getContractFactory('RaidVault');
    raid = await R.deploy();
    await raid.waitForDeployment();
  });


  async function now() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }
  async function warp(seconds: number) {
    await hre.network.provider.send('evm_increaseTime', [seconds]);
    await hre.network.provider.send('evm_mine');
  }
  async function createPerpRaid(value = 0n) {
    const t = await now();
    const tx = await raid
      .connect(alice)
      .createPerpRaid(await pad.getAddress(), await token.getAddress(), await zap.getAddress(), ethPool, perpPool, t + 60, t + 3600, 'lfg 20:00', { value });
    await tx.wait();
    return (await raid.raidCount()) - 1n;
  }

  it('pelny raid: wplaty trzech osob, jedno kupno przez zap, podzial proporcjonalny, vault pusty', async function () {
    const id = await createPerpRaid(ethers.parseEther('0.1'));
    await (await raid.connect(bob).join(id, { value: ethers.parseEther('0.2') })).wait();
    await (await raid.connect(creator).join(id, { value: ethers.parseEther('0.1') })).wait();
    await expect(raid.connect(alice).execute(id, 1n, 1n)).to.be.revertedWithCustomError(raid, 'BadTiming');
    await warp(61);
    await expect(raid.connect(bob).execute(id, 1n, 1n)).to.be.revertedWithCustomError(raid, 'NotLeader');
    const rc = await (await raid.connect(alice).execute(id, 1n, 1n)).wait();
    const ev = rc.logs.map((l: any) => { try { return raid.interface.parseLog(l); } catch { return null; } }).find((e: any) => e?.name === 'Executed');
    const bought = ev.args.tokensBought;
    expect(bought > 0n).to.equal(true);
    // Kupujacym na krzywej jest vault (buyFor z recipient = vault).
    expect(await token.balanceOf(await raid.getAddress())).to.equal(bought);
    for (const who of [alice, bob, creator]) await (await raid.connect(who).claim(id)).wait();
    expect(await token.balanceOf(alice.address)).to.equal((bought * 1n) / 4n);
    expect(await token.balanceOf(bob.address)).to.equal((bought * 2n) / 4n);
    expect(await token.balanceOf(creator.address) >= (bought * 1n) / 4n).to.equal(true); // tworca ma tez swoje z launchu? nie - 0 na starcie
    expect((await token.balanceOf(await raid.getAddress())) <= 2n).to.equal(true);
    await expect(raid.connect(alice).claim(id)).to.be.revertedWithCustomError(raid, 'NothingToClaim');
  });

  it('raid ponad prog: krzywa zamknieta, resztka perpa dzielona proporcjonalnie', async function () {
    const id = await createPerpRaid(ethers.parseEther('3'));
    await (await raid.connect(bob).join(id, { value: ethers.parseEther('3') })).wait();
    await warp(61);
    await (await raid.connect(alice).execute(id, 1n, 1n)).wait();
    const r = await raid.raidOf(id);
    expect(r.perpLeft > 0n).to.equal(true);
    const before = await perp.balanceOf(bob.address);
    await (await raid.connect(bob).claim(id)).wait();
    expect((await perp.balanceOf(bob.address)) - before).to.equal(r.perpLeft / 2n);
    const l = await pad.launchOf(await token.getAddress());
    expect(l.state).to.equal(2n);
  });

  it('wycofanie przed startem, anulowanie i zwrot, wygasniecie', async function () {
    const id = await createPerpRaid(ethers.parseEther('0.05'));
    await (await raid.connect(bob).join(id, { value: ethers.parseEther('0.05') })).wait();
    const b0 = await ethers.provider.getBalance(bob.address);
    const rc = await (await raid.connect(bob).leave(id)).wait();
    expect((await ethers.provider.getBalance(bob.address)) + rc.gasUsed * rc.gasPrice - b0).to.equal(ethers.parseEther('0.05'));
    await expect(raid.connect(alice).refund(id)).to.be.revertedWithCustomError(raid, 'NotOpen');
    await (await raid.connect(alice).cancel(id)).wait();
    await expect(raid.connect(alice).execute(id, 1n, 1n)).to.be.revertedWithCustomError(raid, 'NotOpen');
    await (await raid.connect(alice).refund(id)).wait();
    await expect(raid.connect(alice).refund(id)).to.be.revertedWithCustomError(raid, 'NothingToClaim');

    const id2 = await createPerpRaid(ethers.parseEther('0.05'));
    await warp(3601);
    await expect(raid.connect(alice).execute(id2, 1n, 1n)).to.be.revertedWithCustomError(raid, 'BadTiming');
    await (await raid.connect(alice).refund(id2)).wait();
    expect(await ethers.provider.getBalance(await raid.getAddress())).to.equal(0n);
  });

  it('bramki: zle terminy, zla trasa, za mala wplata, zbyt dluga notka', async function () {
    const t = await now();
    const args = (a: number, b: number, note = '') => [
      pad.getAddress(), token.getAddress(), zap.getAddress(), ethPool, perpPool, a, b, note,
    ];
    await expect(raid.createPerpRaid(...(await Promise.all(args(t - 10, t + 100))))).to.be.revertedWithCustomError(raid, 'BadTiming');
    await expect(raid.createPerpRaid(...(await Promise.all(args(t + 100, t + 50))))).to.be.revertedWithCustomError(raid, 'BadTiming');
    await expect(raid.createPerpRaid(...(await Promise.all(args(t + 100, t + 8 * 86400))))).to.be.revertedWithCustomError(raid, 'BadTiming');
    await expect(raid.createPerpRaid(...(await Promise.all(args(t + 100, t + 200, 'x'.repeat(141)))))).to.be.revertedWithCustomError(raid, 'BadRaid');
    const badPerp = { ...perpPool, currency0: await usdc.getAddress(), currency1: await usdc.getAddress() };
    await expect(
      raid.createPerpRaid(await pad.getAddress(), await token.getAddress(), await zap.getAddress(), ethPool, badPerp, t + 100, t + 200, '')
    ).to.be.revertedWithCustomError(raid, 'BadRoute');
    const id = await createPerpRaid();
    await expect(raid.connect(bob).join(id, { value: 1n })).to.be.revertedWithCustomError(raid, 'TooSmall');
  });
});

const { deployLaunchpad, DEFAULT_POOL_MANAGER } = require('./helpers/deployLaunchpad');

describe('RaidVault - tryb ETH (CurveLaunchpad)', function () {
  this.timeout(120_000);
  let deployer: any, creator: any, alice: any, bob: any, treasury: any;
  let pad: any, token: any, raid: any;

  async function installAt(name: string, address: string) {
    const F = await ethers.getContractFactory(name);
    const d = await F.deploy();
    await d.waitForDeployment();
    await hre.network.provider.send('hardhat_setCode', [address, await ethers.provider.getCode(await d.getAddress())]);
  }
  async function now() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }

  beforeEach(async function () {
    [deployer, creator, alice, bob, treasury] = await ethers.getSigners();
    await installAt('MockB20Factory', B20_FACTORY);
    await installAt('MockPoolManager', DEFAULT_POOL_MANAGER);
    const TF = await ethers.getContractFactory('B20TokenFactory');
    const tf = await TF.deploy();
    await tf.waitForDeployment();
    ({ pad } = await deployLaunchpad({
      deployer,
      feeBps: 100,
      creatorFeeBps: 70,
      feeRecipient: treasury.address,
      protocolShareBps: 3000,
      tokenFactory: await tf.getAddress(),
    }));
    const rc = await (await pad.connect(creator).launch('Raid Me', 'RAID', 0n, (await now()) + 600)).wait();
    const ev = rc.logs.map((l: any) => { try { return pad.interface.parseLog(l); } catch { return null; } }).find((e: any) => e?.name === 'Launched');
    token = await ethers.getContractAt('MockB20', ev.args.token);
    const R = await ethers.getContractFactory('RaidVault');
    raid = await R.deploy();
    await raid.waitForDeployment();
  });

  it('raid na rynku ETH: launchpad.buy za cala pule, podzial proporcjonalny', async function () {
    const t = await now();
    // Start po oknie startowym (LAUNCH_WINDOW = 300 s): w oknie limit 16 mln tokenow
    // na ADRES, a raid to jeden adres - UI ostrzega przed raidem w pierwszych minutach.
    await (await raid.connect(alice).createEthRaid(await pad.getAddress(), await token.getAddress(), t + 310, t + 3600, 'gm', { value: ethers.parseEther('0.01') })).wait();
    await (await raid.connect(bob).join(0n, { value: ethers.parseEther('0.03') })).wait();
    await hre.network.provider.send('evm_increaseTime', [311]);
    await hre.network.provider.send('evm_mine');
    const quote = await pad.quoteBuy(await token.getAddress(), ethers.parseEther('0.04'));
    await expect(raid.connect(alice).execute(0n, 0n, quote[0] + 1n)).to.be.reverted; // ochrona ceny lidera dziala
    await (await raid.connect(alice).execute(0n, 0n, quote[0])).wait();
    const r = await raid.raidOf(0n);
    expect(r.tokensBought).to.equal(quote[0]);
    await (await raid.connect(alice).claim(0n)).wait();
    await (await raid.connect(bob).claim(0n)).wait();
    expect(await token.balanceOf(alice.address)).to.equal(quote[0] / 4n);
    expect(await token.balanceOf(bob.address)).to.equal((quote[0] * 3n) / 4n);
  });
});
