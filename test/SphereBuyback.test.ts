// Konfiguracja projektu laduje wtyczki przez `require` - jak w pozostalych.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');

/**
 * SphereBuyback - limity skupu egzekwowane W KONTRAKCIE (spec sekcja 5/8).
 *
 * Co ten plik dowodzi:
 *  1. checkpoint: tylko OPERATOR; kurs liczony z ceny puli (extsload).
 *  2. execute (permissionless): sufit transzy, budzet okna czasowego,
 *     swiezosc checkpointu, straznik kursu (sandwich REWERTUJE zamiast
 *     przejsc taniej), split 20% dEaD / 80% distributor, ksiegowanie.
 *  3. cancel: wylacznie OPERATOR i wylacznie do OPERATORA.
 *  4. brak innej powierzchni zapisu.
 *
 * MockPoolManager: cena z initialize (slot czytany extsload - dokladnie ta
 * sciezka, co PoolStateReader na produkcji), wynik swapa z setNextCounterAmount.
 */

const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const DEAD = '0x000000000000000000000000000000000000dEaD';
const Q96 = 1n << 96n;

const TRANCHE_MAX = ethers.parseEther('0.2');
const WINDOW_BUDGET = ethers.parseEther('0.5');
const WINDOW_SECONDS = 24n * 3600n;
const MAX_AGE = 3600n;
const MAX_DEV_BPS = 150n;
const BURN_BPS = 2000n;

describe('SphereBuyback', function () {
  this.timeout(120_000);
  let deployer: any, operator: any, distributor: any, alice: any;
  let pm: any, sphere: any, buyback: any;

  async function installAt(name: string, address: string) {
    const F = await ethers.getContractFactory(name);
    const d = await F.deploy();
    await d.waitForDeployment();
    const code = await ethers.provider.getCode(await d.getAddress());
    await hre.network.provider.send('hardhat_setCode', [address, code]);
    return F.attach(address);
  }

  async function now() {
    return BigInt((await ethers.provider.getBlock('latest')).timestamp);
  }

  async function warp(seconds: bigint) {
    await hre.network.provider.send('evm_increaseTime', [Number(seconds)]);
    await hre.network.provider.send('evm_mine');
  }

  function key(sphereAddr: string) {
    return [ethers.ZeroAddress, sphereAddr, 3000, 60, ethers.ZeroAddress];
  }

  beforeEach(async function () {
    [deployer, operator, distributor, alice] = await ethers.getSigners();
    pm = await installAt('MockPoolManager', POOL_MANAGER);
    sphere = await (await ethers.getContractFactory('MockB20')).deploy();
    await sphere.waitForDeployment();

    // Pula po kursie 1:1 (sqrtP = 2^96 -> 1e18 tokenow za 1e18 wei).
    await pm.initialize(key(await sphere.getAddress()), Q96);
    // Atrapa PM naprawde TRANSFERUJE przy take() - musi trzymac inwentarz.
    await sphere.mint(POOL_MANAGER, ethers.parseEther('1000'));

    const B = await ethers.getContractFactory('SphereBuyback');
    buyback = await B.deploy(
      POOL_MANAGER,
      await sphere.getAddress(),
      3000,
      60,
      ethers.ZeroAddress,
      distributor.address,
      operator.address,
      BURN_BPS,
      TRANCHE_MAX,
      WINDOW_BUDGET,
      WINDOW_SECONDS,
      MAX_AGE,
      MAX_DEV_BPS
    );
    await buyback.waitForDeployment();
    // Zasilenie: transza przychodu z Safe.
    await deployer.sendTransaction({ to: await buyback.getAddress(), value: ethers.parseEther('1') });
  });

  it('konstruktor odrzuca bezsensowne konfiguracje', async function () {
    const B = await ethers.getContractFactory('SphereBuyback');
    const args = (over: Partial<Record<number, unknown>>) => {
      const a: unknown[] = [
        POOL_MANAGER,
        sphere.target,
        3000,
        60,
        ethers.ZeroAddress,
        distributor.address,
        operator.address,
        BURN_BPS,
        TRANCHE_MAX,
        WINDOW_BUDGET,
        WINDOW_SECONDS,
        MAX_AGE,
        MAX_DEV_BPS,
      ];
      for (const [i, v] of Object.entries(over)) a[Number(i)] = v;
      return a;
    };
    await expect(B.deploy(...args({ 5: ethers.ZeroAddress }))).to.be.revertedWithCustomError(buyback, 'ZeroAddress');
    await expect(B.deploy(...args({ 7: 10_001n }))).to.be.revertedWithCustomError(buyback, 'BadConfig');
    await expect(B.deploy(...args({ 9: TRANCHE_MAX - 1n }))).to.be.revertedWithCustomError(buyback, 'BadConfig');
  });

  it('checkpoint: tylko OPERATOR; kurs z ceny puli', async function () {
    await expect(buyback.connect(alice).checkpoint()).to.be.revertedWithCustomError(buyback, 'NotOperator');
    await expect(buyback.connect(operator).checkpoint()).to.emit(buyback, 'Checkpointed');
    // sqrtP = 2^96 -> 1e18 tokenow (raw) za 1e18 wei.
    expect(await buyback.checkpointTokensPerEthE18()).to.equal(ethers.parseEther('1'));
    expect(await buyback.checkpointAt()).to.be.gt(0n);
  });

  it('execute: happy path - split 20/80, ksiegowanie okna i totali', async function () {
    await buyback.connect(operator).checkpoint();
    const ethIn = ethers.parseEther('0.1');
    const out = ethers.parseEther('0.1'); // kurs 1:1, zero poslizgu
    await pm.setNextCounterAmount(out);

    const burned = (out * BURN_BPS) / 10_000n;
    await expect(buyback.connect(alice).execute(ethIn, 1n, (await now()) + 600n))
      .to.emit(buyback, 'BuybackExecuted')
      .withArgs(ethIn, out, burned, out - burned, alice.address);

    expect(await sphere.balanceOf(DEAD)).to.equal(burned);
    expect(await sphere.balanceOf(distributor.address)).to.equal(out - burned);
    expect(await buyback.totalBurned()).to.equal(burned);
    expect(await buyback.totalToDistributor()).to.equal(out - burned);
    expect(await buyback.totalEthSpent()).to.equal(ethIn);
    expect(await buyback.windowSpent(await buyback.currentWindow())).to.equal(ethIn);
  });

  it('sufit transzy i budzet okna sa twarde; nowe okno otwiera budzet', async function () {
    await buyback.connect(operator).checkpoint();
    await expect(
      buyback.execute(TRANCHE_MAX + 1n, 1n, (await now()) + 600n)
    ).to.be.revertedWithCustomError(buyback, 'TrancheTooBig');

    // 3 x 0.2 = 0.6 > 0.5 budzetu: trzecia transza odpada.
    for (let i = 0; i < 2; i++) {
      await pm.setNextCounterAmount(TRANCHE_MAX);
      await buyback.execute(TRANCHE_MAX, 1n, (await now()) + 600n);
    }
    await pm.setNextCounterAmount(TRANCHE_MAX);
    await expect(
      buyback.execute(TRANCHE_MAX, 1n, (await now()) + 600n)
    ).to.be.revertedWithCustomError(buyback, 'WindowBudgetExceeded');

    // Nastepne okno czasowe: budzet od zera (checkpoint swiezy po warpie).
    await warp(WINDOW_SECONDS + 1n);
    await buyback.connect(operator).checkpoint();
    await pm.setNextCounterAmount(TRANCHE_MAX);
    await deployer.sendTransaction({ to: await buyback.getAddress(), value: ethers.parseEther('0.5') });
    await buyback.execute(TRANCHE_MAX, 1n, (await now()) + 600n);
  });

  it('przeterminowany checkpoint blokuje wykonanie', async function () {
    await buyback.connect(operator).checkpoint();
    await warp(MAX_AGE + 10n);
    await pm.setNextCounterAmount(ethers.parseEther('0.1'));
    await expect(
      buyback.execute(ethers.parseEther('0.1'), 1n, (await now()) + 600n)
    ).to.be.revertedWithCustomError(buyback, 'CheckpointStale');
  });

  it('straznik kursu: sandwich, ktory daje mniej niz checkpoint*(1-dev), REWERTUJE', async function () {
    await buyback.connect(operator).checkpoint();
    const ethIn = ethers.parseEther('0.1');
    // Kurs z checkpointu: 0.1e18 out; guard przy 150 bps: >= 0.0985e18.
    // Napastnik zepchnal cene: pula oddaje tylko 0.09e18.
    await pm.setNextCounterAmount(ethers.parseEther('0.09'));
    await expect(
      buyback.execute(ethIn, 1n, (await now()) + 600n)
    ).to.be.revertedWithCustomError(buyback, 'PriceGuard');
    // Uczciwa cena tuz pod granica przechodzi.
    await pm.setNextCounterAmount(ethers.parseEther('0.0986'));
    await buyback.execute(ethIn, 1n, (await now()) + 600n);
  });

  it('cancel: tylko OPERATOR i tylko do OPERATORA', async function () {
    await expect(
      buyback.connect(alice).cancel(ethers.parseEther('0.5'))
    ).to.be.revertedWithCustomError(buyback, 'NotOperator');
    const before = await ethers.provider.getBalance(operator.address);
    const tx = await buyback.connect(operator).cancel(ethers.parseEther('0.5'));
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    expect((await ethers.provider.getBalance(operator.address)) - before + gas).to.equal(
      ethers.parseEther('0.5')
    );
  });

  it('nie ma powierzchni zapisu poza checkpoint/execute/cancel', async function () {
    const frags = buyback.interface.fragments
      .filter((f: any) => f.type === 'function' && f.stateMutability !== 'view' && f.stateMutability !== 'pure')
      .map((f: any) => f.name)
      .sort();
    expect(frags).to.deep.equal(['cancel', 'checkpoint', 'execute', 'unlockCallback']);
  });
});
