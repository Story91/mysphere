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

describe('PerpBuyZap', function () {
  this.timeout(300_000);

  let deployer: any, creator: any, alice: any, bob: any, treasury: any;
  let pm: any, usdc: any, perp: any, pad: any, zap: any, lp: any;
  let ethPool: any, perpPool: any, token: any;

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

    const Z = await ethers.getContractFactory('PerpBuyZap');
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
  });

  it('ETH -> mem jednym wywolaniem: tokeny i Bought.buyer u odbiorcy, zap pusty, wynik = quoteBuy', async function () {
    const value = ethers.parseEther('0.4');
    const res = await buy(value, { recipient: bob.address }).then((t: any) => t.wait());
    const bought = res.logs
      .map((l: any) => { try { return pad.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e && e.name === 'Bought');
    const zapEv = res.logs
      .map((l: any) => { try { return zap.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e && e.name === 'ZapBuy');

    expect(bought.args.buyer).to.equal(bob.address);
    expect(await token.balanceOf(bob.address)).to.equal(bought.args.tokensOut);
    expect(await token.balanceOf(alice.address)).to.equal(0n);
    expect(zapEv.args.ethIn).to.equal(value);
    expect(zapEv.args.tokensOut).to.equal(bought.args.tokensOut);
    // ~0.4 ETH * 2 500 = ~1 000 perpa po dwoch pulach z oplata 0.3%.
    expect(zapEv.args.perpIn > 980n * 10n ** 18n && zapEv.args.perpIn < 1000n * 10n ** 18n).to.equal(true);
    expect(await zapBalances()).to.deep.equal({ eth: 0n, perp: 0n, usdc: 0n });
    expect(await perp.allowance(await zap.getAddress(), await pad.getAddress())).to.equal(0n);
  });

  it('kupno ponad prog: krzywa zamknieta, nadwyzka perpa wraca do odbiorcy, zap pusty', async function () {
    const before = await perp.balanceOf(bob.address);
    const res = await buy(ethers.parseEther('5'), { recipient: bob.address }).then((t: any) => t.wait());
    const zapEv = res.logs
      .map((l: any) => { try { return zap.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e && e.name === 'ZapBuy');
    const l = await pad.launchOf(await token.getAddress());
    expect(l.state).to.equal(2n); // Locked
    expect(l.tokenReserve).to.equal(T_MIN);
    const refund = (await perp.balanceOf(bob.address)) - before;
    expect(refund > 4000n * 10n ** 18n).to.equal(true); // ~12 400 perpa - 7 575 zuzyte
    expect(zapEv.args.perpIn).to.equal(7575n * 10n ** 18n);
    expect(await zapBalances()).to.deep.equal({ eth: 0n, perp: 0n, usdc: 0n });
  });

  it('odbiorca 0x0 = wolajacy', async function () {
    await (await buy(ethers.parseEther('0.01'), { recipient: ZERO })).wait();
    expect((await token.balanceOf(alice.address)) > 0n).to.equal(true);
  });

  it('poslizg: minPerpOut i minTokensOut sa egzekwowane, zero jest odrzucane', async function () {
    await expect(buy(ethers.parseEther('0.01'), { minPerp: 10n ** 30n })).to.be.revertedWithCustomError(zap, 'Slippage');
    await expect(buy(ethers.parseEther('0.01'), { minTokens: T0 })).to.be.revertedWithCustomError(pad, 'Slippage');
    await expect(buy(ethers.parseEther('0.01'), { minPerp: 0n })).to.be.revertedWithCustomError(zap, 'SlippageRequired');
    await expect(buy(ethers.parseEther('0.01'), { minTokens: 0n })).to.be.revertedWithCustomError(zap, 'SlippageRequired');
    await expect(buy(0n)).to.be.revertedWithCustomError(zap, 'ZeroAmount');
  });

  it('trasa: pula ETH musi miec ETH jako currency0, pula perpa musi laczyc posrednia walute z QUOTE', async function () {
    const padAddr = await pad.getAddress();
    const tokenAddr = await token.getAddress();
    const d = await deadline();
    const v = { value: ethers.parseEther('0.01') };
    const badEth = { ...ethPool, currency0: await usdc.getAddress(), currency1: await perp.getAddress() };
    await expect(zap.connect(alice).buyWithEth(padAddr, tokenAddr, badEth, perpPool, 1n, 1n, d, alice.address, v))
      .to.be.revertedWithCustomError(zap, 'BadRoute');
    const Q = await ethers.getContractFactory('MockQuoteToken');
    const other = await Q.deploy(18);
    const badPerp = { ...perpPool, currency0: await usdc.getAddress(), currency1: await other.getAddress() };
    await expect(zap.connect(alice).buyWithEth(padAddr, tokenAddr, ethPool, badPerp, 1n, 1n, d, alice.address, v))
      .to.be.revertedWithCustomError(zap, 'BadRoute');
  });

  it('termin i callback tylko od PoolManagera', async function () {
    const past = (await ethers.provider.getBlock('latest')).timestamp - 1;
    await expect(
      zap.connect(alice).buyWithEth(await pad.getAddress(), await token.getAddress(), ethPool, perpPool, 1n, 1n, past, alice.address, { value: 1n })
    ).to.be.revertedWithCustomError(zap, 'Expired');
    await expect(zap.connect(alice).unlockCallback('0x')).to.be.revertedWithCustomError(zap, 'NotPoolManager');
  });
});
