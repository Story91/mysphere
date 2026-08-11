const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');

/**
 * SCIEZKA OD KONCA DO KONCA - wszystkie nowe funkcje NARAZ.
 *
 * ===========================================================================
 * PO CO OSOBNY PLIK, SKORO KAZDY KAWALEK MA JUZ SWOJ TEST
 * ===========================================================================
 * Pozostale pliki badaja czesci w izolacji: krzywa osobno, hook osobno,
 * fabryka osobno. Kazdy z nich moze byc zielony, a system i tak nie zlozy sie
 * w calosc - bo skladaja go PRZEJSCIA miedzy czesciami: konfiguracja z
 * `launchAdvanced` musi dojechac przez graduacje do hooka, oplata z puli musi
 * trafic do tych samych odbiorcow, co oplata z krzywej, a ETH odlozone na
 * buyback musi dac sie naprawde wydac i spalic.
 *
 * Ten plik przechodzi cala droge JEDNYM tokenem:
 *
 *   launchAdvanced (2 odbiorcow, buyback 10%, metadata)
 *     -> kupno domykajace krzywa -> Locked
 *     -> graduate -> pula v4 z naszym hookiem
 *     -> wymiana w puli -> hook bierze oplate w calosci
 *     -> settle -> podzial, ciecie buybacku z dzialki tworcy -> claim (krzywa, hook)
 *     -> executeBuyback -> tokeny spalone na 0x...dEaD
 *
 * ===========================================================================
 * CZEGO TEN PLIK NIE DOWODZI
 * ===========================================================================
 * `MockPoolManager` nie jest Uniswapem - nie odwzorowuje ksiegowosci delt per
 * ADRES. Dowodzimy tu ARYTMETYKI i PRZEPLYWU miedzy kontraktami, nie tego, ze
 * prawdziwy v4 przyjmie nasze delty. To zamyka fork Base i przebieg na Sepolii.
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const DEAD = '0x000000000000000000000000000000000000dEaD';

const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 70n;
const PROTOCOL_SHARE_BPS = 6000n;
const HOOK_FEE_BPS = 100n;
const BUYBACK_BPS = 1000n;
const WINDOW = 300;

describe('Launchpad od konca do konca', function () {
  this.timeout(180_000);

  let deployer: any, creator: any, alice: any, bob: any, treasury: any, partner: any;
  let pad: any, vault: any, hook: any, tokenFactory: any, pm: any, probe: any;

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
    [deployer, creator, alice, bob, treasury, partner] = await ethers.getSigners();

    await installAt('MockB20Factory', B20_FACTORY);
    pm = await installAt('MockPoolManager', POOL_MANAGER);

    const TF = await ethers.getContractFactory('B20TokenFactory');
    tokenFactory = await TF.deploy();
    await tokenFactory.waitForDeployment();

    ({ pad, vault, hook } = await deployLaunchpad({
      deployer,
      feeBps: FEE_BPS,
      creatorFeeBps: CREATOR_FEE_BPS,
      feeRecipient: treasury.address,
      protocolShareBps: PROTOCOL_SHARE_BPS,
      tokenFactory: await tokenFactory.getAddress(),
    }));

    const SP = await ethers.getContractFactory('SwapProbe');
    probe = await SP.deploy();
    await probe.waitForDeployment();
  });

  it('konfiguracja ze startu dojezdza az do spalenia tokenow z buybacku', async function () {
    const metadata = 'ipfs://mysphere/e2e.json';

    // ---- 1. START z pelna konfiguracja tworcy -------------------------------
    // Dwaj odbiorcy oplat: tworca 70%, partner 30%. Udzial tworcy w samej
    // oplacie to 70 ze 100 bps, czyli gorna granica dozwolona przez kontrakt.
    const launchRc = await (
      await pad
        .connect(creator)
        .launchAdvanced(
          'Endgame',
          'END',
          0n,
          (await now()) + 600,
          FEE_BPS,
          CREATOR_FEE_BPS,
          BUYBACK_BPS,
          ethers.parseEther('16000000'),
          [creator.address, partner.address],
          [7000, 3000],
          metadata
        )
    ).wait();

    const token = launchRc.logs
      .map((log: any) => {
        try {
          return pad.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed && parsed.name === 'Launched').args[0] as string;

    const asset = await ethers.getContractAt('MockB20', token);

    expect(await pad.metadataURI(token), 'metadata z lancucha').to.equal(metadata);
    expect(await pad.feeConfigOf(token)).to.deep.equal([FEE_BPS, CREATOR_FEE_BPS, 2n]);

    // ---- 2. KUPNO DOMYKAJACE KRZYWA ----------------------------------------
    await hre.network.provider.send('evm_increaseTime', [WINDOW + 1]);
    await hre.network.provider.send('evm_mine');

    const creatorBefore: bigint = await pad.claimable(creator.address);
    const partnerBefore: bigint = await pad.claimable(partner.address);
    const treasuryBefore: bigint = await pad.claimable(treasury.address);

    const ethIn = ethers.parseEther('5');
    const quote = await pad.quoteBuy(token, ethIn);
    const curveFee = quote[1] as bigint;
    await pad.connect(alice).buy(token, 1n, (await now()) + 600, { value: ethIn });

    expect((await pad.launchOf(token))[1], 'krzywa zamknieta').to.equal(2);

    // Oplata z krzywej dzieli sie 70/30 miedzy tworce i protokol, a czesc
    // tworcy - 70/30 miedzy jego dwoch odbiorcow. To jest to samo `_accrueFee`,
    // ale sprawdzone na koncu lancucha, a nie w izolacji.
    const doTworcow = (curveFee * CREATOR_FEE_BPS) / FEE_BPS;
    const doCreatora = (doTworcow * 7000n) / 10_000n;
    expect(((await pad.claimable(creator.address)) as bigint) - creatorBefore).to.equal(doCreatora);
    expect(((await pad.claimable(partner.address)) as bigint) - partnerBefore).to.equal(doTworcow - doCreatora);
    expect(((await pad.claimable(treasury.address)) as bigint) - treasuryBefore).to.equal(curveFee - doTworcow);

    // ---- 3. GRADUACJA ------------------------------------------------------
    await pad.connect(bob).graduate(token);
    expect((await pad.launchOf(token))[1], 'po awansie').to.equal(3);

    const key = await pad.poolKeyOf(token);
    expect(key[4], 'pula ma NASZ hook').to.equal(await hook.getAddress());
    expect((await vault.positionOf(token))[1], 'pula ma plynnosc').to.be.greaterThan(0n);

    // Konfiguracja buybacku przejechala ze startu, przez graduacje, do hooka.
    expect(await hook.buybackBps(token), 'buyback dojechal do hooka').to.equal(BUYBACK_BPS);

    // ---- 4. WYMIANA W PULI: hook bierze oplate ------------------------------
    const outEth = ethers.parseEther('0.02');
    await pm.setNextCounterAmount(outEth);
    await asset.mint(await probe.getAddress(), ethers.parseEther('1000'));
    await probe.doSwap(plain(key), [false, -ethers.parseEther('1000'), 0n], {});

    const hookFee = (outEth * HOOK_FEE_BPS + 9_999n) / 10_000n;
    // Buyback nie jest juz scinany przy swapie - po wymianie CALA oplata ETH
    // czeka nierozdzielona, a ciecie na skup powstaje dopiero w settle.
    expect(await hook.pendingEth(token), 'cala oplata czeka na podzial').to.equal(hookFee);
    expect(await hook.pendingBuybackEth(token), 'buyback dopiero po settle').to.equal(0n);

    // ---- 5. SETTLE: podzial oplaty z puli ----------------------------------
    // Protokol bierze pelny udzial od calej oplaty; buyback wychodzi
    // WYLACZNIE z dzialki tworcy, wiec jego decyzja nie scina protokolu.
    const doProtokolu = (hookFee * PROTOCOL_SHARE_BPS) / 10_000n;
    const dzialkaTworcy = hookFee - doProtokolu;
    const naBuyback = (dzialkaTworcy * BUYBACK_BPS) / 10_000n;
    await expect(hook.connect(bob).settle(token))
      .to.emit(hook, 'HookFeeSettled')
      .withArgs(token, doProtokolu, dzialkaTworcy - naBuyback, naBuyback, 0n, 0n);
    expect(await hook.claimableEth(treasury.address)).to.equal(doProtokolu);
    expect(await hook.claimableEth(creator.address)).to.equal(dzialkaTworcy - naBuyback);
    expect(await hook.pendingBuybackEth(token), 'ciecie z dzialki tworcy odlozone na skup').to.equal(naBuyback);

    // ---- 6. WYPLATY: kazdy odbiera swoje -----------------------------------
    const partnerEthPrzed: bigint = await ethers.provider.getBalance(partner.address);
    await pad.connect(bob).claimFor(partner.address);
    expect(
      (await ethers.provider.getBalance(partner.address)) as bigint,
      'partner dostal ETH z krzywej'
    ).to.be.greaterThan(partnerEthPrzed);

    const creatorEthPrzed: bigint = await ethers.provider.getBalance(creator.address);
    await hook.connect(bob).claimEthFor(creator.address);
    expect(
      (await ethers.provider.getBalance(creator.address)) as bigint,
      'tworca dostal ETH z puli'
    ).to.be.greaterThan(creatorEthPrzed);

    // ---- 7. BUYBACK: ETH zamienia sie w spalone tokeny ---------------------
    const kupione = ethers.parseEther('321');
    await pm.setNextCounterAmount(kupione);
    const deadPrzed: bigint = await asset.balanceOf(DEAD);

    await hook.connect(bob).executeBuyback(token, 1n, (await now()) + 600);

    expect(await hook.buybackTokens(token), 'licznik odkupionych').to.equal(kupione);
    expect(((await asset.balanceOf(DEAD)) as bigint) - deadPrzed, 'tokeny naprawde spalone').to.equal(kupione);
    expect(await hook.pendingBuybackEth(token), 'pula buybacku wydana').to.equal(0n);

    // ---- 8. NIC NIE UTKNELO ------------------------------------------------
    // Launchpad trzyma dokladnie tyle, ile jest komus winien. Gdyby ktorykolwiek
    // przeplyw powyzej zgubil wei, ta jedna asercja to pokaze.
    const padAddr = await pad.getAddress();
    expect(await ethers.provider.getBalance(padAddr)).to.equal(await pad.totalLiabilities());
  });
});

