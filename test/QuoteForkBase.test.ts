export {};

const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');

/**
 * LAUNCHPAD Q NA FORKU BASE MAINNET: prawdziwe USDC (FiatToken - blokady,
 * pauza, 6 miejsc) i prawdziwy, WDROZONY PoolManager Uniswapa. Jedyna atrapa
 * to precompile B20, ktorego fork nie wykonuje (jak w SphereForkBase).
 *
 * Bez dostepu do RPC test sie pomija, a nie udaje zielonego.
 */

const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const HOOK_ALL_MASK = (1n << 14n) - 1n;
const HOOK_REQUIRED_FLAGS = (1n << 13n) | (1n << 6n) | (1n << 2n);
const MIN_SQRT = 4295128739n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n;
const UNIT = 10n ** 6n;
const R_VIRT = 2500n * UNIT;
const T0 = 1_000_000_000n * 10n ** 18n;

describe('Launchpad Q - fork Base mainnet z prawdziwym USDC i PoolManagerem', function () {
  this.timeout(900_000);
  let forked = true;

  before(async function () {
    try {
      await hre.network.provider.request({ method: 'hardhat_reset', params: [{ forking: { jsonRpcUrl: BASE_RPC } }] });
      const pmCode = await ethers.provider.getCode(POOL_MANAGER);
      const usdcCode = await ethers.provider.getCode(USDC);
      if (pmCode === '0x' || usdcCode === '0x') forked = false;
    } catch {
      forked = false;
    }
  });

  after(async function () {
    await hre.network.provider.request({ method: 'hardhat_reset', params: [] });
  });

  /** Saldo USDC przez zapis slotu mapy sald - szukany, nie zgadywany (sprawdzany odczytem). */
  async function fundUsdc(usdc: any, who: string, amount: bigint) {
    for (let slot = 0; slot < 20; slot++) {
      const key = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [who, slot]));
      const prev = await ethers.provider.getStorage(USDC, key);
      await hre.network.provider.send('hardhat_setStorageAt', [USDC, key, ethers.zeroPadValue(ethers.toBeHex(amount), 32)]);
      if ((await usdc.balanceOf(who)) === amount) return;
      await hre.network.provider.send('hardhat_setStorageAt', [USDC, key, prev]);
    }
    throw new Error('nie znaleziono slotu sald USDC');
  }

  it('start, zamkniecie, awans i swapy w obie strony - USDC jako QUOTE', async function () {
    if (!forked) this.skip();
    const [deployer, creator, alice, bob, treasury, carol] = await ethers.getSigners();

    const F = await ethers.getContractFactory('MockB20Factory');
    const f = await F.deploy();
    await hre.network.provider.send('hardhat_setCode', [B20_FACTORY, await ethers.provider.getCode(await f.getAddress())]);
    const TF = await ethers.getContractFactory('B20TokenFactory');
    const tf = await TF.deploy();

    const nonce = await deployer.getNonce('pending');
    const padAddr = ethers.getCreateAddress({ from: deployer.address, nonce });
    const vaultAddr = ethers.getCreateAddress({ from: padAddr, nonce: 1 });
    const Hook = await ethers.getContractFactory('QuoteLaunchHook');
    const hash = ethers.keccak256(
      ethers.concat([
        Hook.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'address', 'uint16', 'address'], [POOL_MANAGER, treasury.address, 3000, USDC]),
      ])
    );
    let salt = '';
    for (let i = 0; i < 2_000_000 && !salt; i++) {
      const s = ethers.zeroPadValue(ethers.toBeHex(i), 32);
      if ((BigInt(ethers.getCreate2Address(vaultAddr, s, hash)) & HOOK_ALL_MASK) === HOOK_REQUIRED_FLAGS) salt = s;
    }
    const Pad = await ethers.getContractFactory('QuoteCurveLaunchpad');
    const pad = await Pad.deploy(POOL_MANAGER, USDC, 100, 70, treasury.address, 3000, await tf.getAddress(), salt, R_VIRT);
    await pad.waitForDeployment();
    expect(await pad.QUOTE_DECIMALS()).to.equal(6n);
    const vault = await ethers.getContractAt('QuoteLiquidityVault', await pad.VAULT());
    const hook = await ethers.getContractAt('QuoteLaunchHook', await pad.HOOK());

    const usdc = await ethers.getContractAt('MockQuoteToken', USDC); // ABI ERC-20 wystarczy
    for (const who of [creator, alice, carol]) {
      await fundUsdc(usdc, who.address, 50_000n * UNIT);
      await (await usdc.connect(who).approve(await pad.getAddress(), ethers.MaxUint256)).wait();
    }

    const deadline = (await ethers.provider.getBlock('latest')).timestamp + 3600;
    const rc = await (
      await pad.connect(creator).launchAdvanced('Fork Pair', 'FORK', 10n * UNIT, 1n, deadline, 100, 70, 2000, T0, [creator.address], [10_000], '')
    ).wait();
    const tokenAddr = rc.logs.map((l: any) => { try { return pad.interface.parseLog(l); } catch { return null; } }).find((e: any) => e && e.name === 'Launched').args.token;
    const token = await ethers.getContractAt('MockB20', tokenAddr);

    await (await pad.connect(alice).buy(tokenAddr, 4n * R_VIRT * 2n, 1n, deadline)).wait();
    expect((await pad.launchOf(tokenAddr)).state).to.equal(2n);
    expect((await usdc.balanceOf(await pad.getAddress())) >= (await pad.totalLiabilities())).to.equal(true);

    const grc = await (await pad.connect(bob).graduate(tokenAddr)).wait();
    const grad = grc.logs.map((l: any) => { try { return pad.interface.parseLog(l); } catch { return null; } }).find((e: any) => e && e.name === 'Graduated');
    expect(grad.args.ethToPool).to.be.greaterThan(9_000n * UNIT);
    expect((await pad.launchOf(tokenAddr)).state).to.equal(3n);

    const SP = await ethers.getContractFactory('QuoteSwapProbe');
    const probe = await SP.deploy(POOL_MANAGER);
    const probeAddr = await probe.getAddress();
    await (await usdc.connect(carol).transfer(probeAddr, 1_000n * UNIT)).wait();
    const k = await vault.poolKeyOf(tokenAddr);
    const key = [k[0], k[1], k[2], k[3], k[4]];
    const quoteIs0 = BigInt(USDC) < BigInt(tokenAddr);

    // Kupno tokena za 500 USDC i sprzedaz polowy z powrotem.
    await (await probe.doSwap(key, { zeroForOne: quoteIs0, amountSpecified: -(500n * UNIT), sqrtPriceLimitX96: quoteIs0 ? MIN_SQRT + 1n : MAX_SQRT - 1n })).wait();
    const bought = await token.balanceOf(probeAddr);
    expect(bought).to.be.greaterThan(0n);
    await (await probe.doSwap(key, { zeroForOne: !quoteIs0, amountSpecified: -(bought / 2n), sqrtPriceLimitX96: quoteIs0 ? MAX_SQRT - 1n : MIN_SQRT + 1n })).wait();
    expect(await hook.pendingToken(tokenAddr)).to.be.greaterThan(0n);
    expect(await hook.pendingEth(tokenAddr)).to.be.greaterThan(0n);

    await (await hook.settle(tokenAddr)).wait();
    const before = await usdc.balanceOf(treasury.address);
    await (await hook.claimEthFor(treasury.address)).wait();
    expect(await usdc.balanceOf(treasury.address)).to.be.greaterThan(before);

    // Buyback z dzialki tworcy (20%) w USDC - prawdziwa pula, prawdziwy PoolManager.
    if ((await hook.pendingBuybackEth(tokenAddr)) > 0n) {
      await (await hook.executeBuyback(tokenAddr, 1n, deadline)).wait();
      expect(await hook.buybackTokens(tokenAddr)).to.be.greaterThan(0n);
    }
  });
});
