// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w MemoPay.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');

/**
 * Testy CurveLaunchpad + LiquidityVault.
 *
 * ===========================================================================
 * CZEGO TE TESTY NIE DOWODZA - PRZECZYTAJ ZANIM UZNASZ JE ZA ZIELONE SWIATLO
 * ===========================================================================
 * B20 jest PRECOMPILE'EM w oprogramowaniu wezla Base, nie kontraktem EVM.
 * Na lokalnym Hardhacie nie ma go wcale, a NA FORKU BASE TEZ NIE - fork sciaga
 * stan przez RPC i wykonuje lokalnie, wiec `eth_getCode(0xB20f...)` zwraca
 * pustke i wywolanie fabryki trafia w puste konto, oddajac sukces z pustymi
 * danymi. To jest cichy falszywy pozytyw i nie wolno na nim polegac.
 *
 * Lokalnie NIE SA testowalne: prawdziwa semantyka `initCalls`, kodowanie
 * `params`, bramka bootstrapu `initialAdmin = address(0)`, wyprowadzenie adresu
 * tokena, `NonPayable()`, rzeczywisty gaz precompile'a, egzekwowanie rol,
 * `supplyCap`, PolicyRegistry, ActivationRegistry.
 *
 * Tak samo z Uniswapem: `MockPoolManager` odwzorowuje uklad pamieci, kierunki
 * zaokraglen i regule "na koniec unlocka salda musza byc zerowe", ale nie jest
 * PoolManagerem. Poziomem dowodu jest fork mainnetu z PRAWDZIWYM
 * `0x498581fF...`, a potem transakcja na Sepolii.
 *
 * To, co ponizej sprawdza sie NAPRAWDE: arytmetyka krzywej, kierunki
 * zaokraglen, niezmiennik `k`, maszyna stanow, zapadki, limity, ksiegowanie
 * oplat i to, ze kazda asercja post-warunkow potrafi wywrocic start.
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const DEAD = '0x000000000000000000000000000000000000dEaD';

const T0 = ethers.parseEther('1000000000');
const T_MIN = ethers.parseEther('200000000');
const R_VIRT = ethers.parseEther('0.75');
const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 40n;
const WINDOW = 300;

const MAX_UINT = ethers.MaxUint256;

describe('CurveLaunchpad', function () {
  let deployer: any, creator: any, alice: any, bob: any, treasury: any;
  let pad: any, vault: any, hook: any, factory: any, tokenFactory: any, pm: any;

  /** Podklada bajtkod atrapy pod adres, ktory kontrakt ma wpisany jako stala. */
  async function installAt(name: string, address: string) {
    const F = await ethers.getContractFactory(name);
    const d = await F.deploy();
    await d.waitForDeployment();
    const code = await ethers.provider.getCode(await d.getAddress());
    await hre.network.provider.send('hardhat_setCode', [address, code]);
    return F.attach(address);
  }

  async function launch(from: any, value = 0n, minOut = 0n) {
    const tx = await pad
      .connect(from)
      .launch('Test', 'TST', minOut, (await time()) + 600, { value });
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

  async function time() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }

  /**
   * `poolKeyOf` oddaje ethersowy `Result`, ktory jest tylko do odczytu - a jako
   * argument struktury ethers probuje go modyfikowac. Kopiujemy do zwyklej
   * tablicy.
   */
  function plainKey(k2: any) {
    return [k2[0], k2[1], k2[2], k2[3], k2[4]];
  }

  function poolIdOf(k2: any) {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['tuple(address,address,uint24,int24,address)'],
        [plainKey(k2)]
      )
    );
  }

  async function warp(seconds: number) {
    await hre.network.provider.send('evm_increaseTime', [seconds]);
    await hre.network.provider.send('evm_mine');
  }

  /** k = (R_VIRT + ethReserve) * tokenReserve */
  async function k(token: string) {
    const l = await pad.launchOf(token);
    return (R_VIRT + l[2]) * l[3];
  }

  beforeEach(async function () {
    [deployer, creator, alice, bob, treasury] = await ethers.getSigners();

    factory = await installAt('MockB20Factory', B20_FACTORY);
    pm = await installAt('MockPoolManager', POOL_MANAGER);

    // Fabryka tokena jest teraz osobnym kontraktem - to ona wola precompile
    // i to ona asertuje role oraz sufit podazy. Launchpad zna ja tylko przez
    // `ITokenFactory`, wiec sabotaz atrapy odbija sie TU, a nie w launchpadzie.
    const TF = await ethers.getContractFactory('B20TokenFactory');
    tokenFactory = await TF.deploy();
    await tokenFactory.waitForDeployment();

    ({ pad, vault, hook } = await deployLaunchpad({
      deployer,
      feeBps: FEE_BPS,
      creatorFeeBps: CREATOR_FEE_BPS,
      feeRecipient: treasury.address,
      protocolShareBps: 6000,
      tokenFactory: await tokenFactory.getAddress(),
    }));
  });

  /* ===================================================================== */
  /*  WDROZENIE                                                             */
  /* ===================================================================== */

  describe('wdrozenie', function () {
    it('wiaze vault z launchpadem w jednej transakcji, obustronnie', async function () {
      expect(await vault.LAUNCHPAD()).to.equal(await pad.getAddress());
      expect(await pad.VAULT()).to.equal(await vault.getAddress());
    });

    it('wiaze hook z vaultem i nadaje mu adres o wlasciwych bitach', async function () {
      expect(await hook.VAULT()).to.equal(await vault.getAddress());
      expect(await vault.HOOK()).to.equal(await hook.getAddress());
      expect(await pad.HOOK()).to.equal(await hook.getAddress());

      // To jest warunek, ktory v4 sprawdza przy kazdej puli.
      expect(await hook.hasValidHookAddress()).to.equal(true);
      const flags = BigInt(await hook.getAddress()) & (await hook.ALL_HOOK_MASK());
      expect(flags).to.equal(await hook.HOOK_FLAGS());
    });

    it('hook dostaje te sama konfiguracje oplat, co vault', async function () {
      expect(await hook.FEE_RECIPIENT()).to.equal(await vault.FEE_RECIPIENT());
      expect(await hook.PROTOCOL_SHARE_BPS()).to.equal(await vault.PROTOCOL_SHARE_BPS());
    });

    it('zly salt hooka wywala WDROZENIE, a nie pierwszy awans', async function () {
      // Salt, ktorego nikt nie kopal - adres hooka prawie na pewno nie bedzie
      // mial wymaganych bitow. To jest cala roznica miedzy bledem wykrytym
      // przy deployu a bledem wykrytym po zebraniu cudzych pieniedzy.
      const Pad = await ethers.getContractFactory('CurveLaunchpad');
      await expect(
        Pad.deploy(100, 40, treasury.address, 6000, await tokenFactory.getAddress(), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(vault, 'BadHookAddress');
    });

    it('odrzuca oplate ponad sufit i oplate tworcy ponad calosc', async function () {
      const Pad = await ethers.getContractFactory('CurveLaunchpad');
      const tf = await tokenFactory.getAddress();
      // Te warunki stoja PRZED wdrozeniem vaulta, wiec salt jest tu bez znaczenia.
      await expect(
        Pad.deploy(201, 40, treasury.address, 6000, tf, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(pad, 'FeeTooHigh');
      await expect(
        Pad.deploy(100, 101, treasury.address, 6000, tf, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(pad, 'CreatorFeeTooHigh');
      await expect(
        Pad.deploy(100, 40, ethers.ZeroAddress, 6000, tf, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(pad, 'ZeroAddress');
      await expect(
        Pad.deploy(100, 40, treasury.address, 6000, ethers.ZeroAddress, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(pad, 'ZeroAddress');
    });

    it('nie ma zadnego settera', async function () {
      const fns = Object.keys(pad.interface.fragments)
        .map((k2: any) => (pad.interface.fragments as any)[k2])
        .filter((f: any) => f.type === 'function')
        .map((f: any) => f.name);
      for (const banned of ['setFee', 'setFeeRecipient', 'pause', 'withdraw', 'rescue', 'sweep']) {
        expect(fns).to.not.include(banned);
      }
    });
  });

  /* ===================================================================== */
  /*  START                                                                 */
  /* ===================================================================== */

  describe('launch', function () {
    it('tworzy token bez wlasciciela z cala podaz na krzywej', async function () {
      const token = await launch(creator);
      const t = await ethers.getContractAt('MockB20', token);

      expect(await t.totalSupply()).to.equal(T0);
      expect(await t.supplyCap()).to.equal(T0);
      expect(await t.balanceOf(await pad.getAddress())).to.equal(T0);
      expect(await t.hasRole(ethers.ZeroHash, await pad.getAddress())).to.equal(false);
      expect(await t.hasRole(ethers.ZeroHash, ethers.ZeroAddress)).to.equal(false);

      const l = await pad.launchOf(token);
      expect(l[0]).to.equal(creator.address);
      expect(l[1]).to.equal(1n); // Curve
      expect(l[2]).to.equal(0n);
      expect(l[3]).to.equal(T0);
    });

    it('NIE tworzy zadnej puli - pula powstaje dopiero przy awansie', async function () {
      const token = await launch(creator);
      const key = await pad.poolKeyOf(token);

      expect(key[0]).to.equal(ethers.ZeroAddress); // currency0 = natywne ETH
      expect(key[1]).to.equal(token);
      expect(key[2]).to.equal(await pad.POOL_FEE());
      expect(key[3]).to.equal(await pad.POOL_TICK_SPACING());
      expect(key[4]).to.equal(await hook.getAddress());

      // Slot ceny jest PUSTY. Poprzednia wersja inicjalizowala tu cztery pule;
      // z hookiem-brama nie ma powodu, bo nikt obcy tej puli nie otworzy.
      const slot = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint256'], [poolIdOf(key), 6])
      );
      expect(BigInt(await pm.extsload(slot))).to.equal(0n);
    });

    it('kurs startowy to 7.5e-10 ETH/token', async function () {
      const token = await launch(creator);
      expect(await pad.spotPriceWeiPerToken(token)).to.equal(750000000n);
    });

    it('dwa starty tego samego tworcy daja rozne tokeny', async function () {
      const a = await launch(creator);
      const b = await launch(creator);
      expect(a).to.not.equal(b);
    });

    it('dev-buy idzie ta sama sciezka, co wszyscy - i podlega limitowi okna', async function () {
      // Pelny limit 16M kosztuje ~0.0122 ETH po cenie startowej.
      const token = await launch(creator, ethers.parseEther('0.0122'), 1n);
      const t = await ethers.getContractAt('MockB20', token);
      const got = await t.balanceOf(creator.address);
      expect(got).to.be.greaterThan(0n);
      expect(got).to.be.lessThanOrEqual(await pad.WINDOW_ADDR_CAP());
      // Tworca zaplacil oplate jak kazdy - i 0.4% wrocilo do niego jako claimable.
      expect(await pad.claimable(treasury.address)).to.be.greaterThan(0n);
      expect(await pad.claimable(creator.address)).to.be.greaterThan(0n);
    });

    it('dev-buy ponad limit okna REWERTUJE, nie przycina', async function () {
      await expect(
        pad.connect(creator).launch('T', 'T', 1n, (await time()) + 600, {
          value: ethers.parseEther('1'),
        })
      ).to.be.revertedWithCustomError(pad, 'WindowCap');
    });

    it('kazda asercja post-warunkow potrafi wywrocic start', async function () {
      // Asercje zeszly do `B20TokenFactory` razem z tworzeniem tokena, wiec
      // rewert niesie teraz JEJ blad. Sam start wywala sie tak samo - i o to
      // chodzi: przeniesienie kodu nie moze zmienic tego, co przechodzi.
      const cases: [number, string][] = [
        [1, 'RolesAlive'],
        [2, 'SupplyMismatch'],
        [3, 'CapMismatch'],
        [4, 'NotB20'],
        [5, 'WrongTokenAddress'],
      ];
      for (const [mode, err] of cases) {
        await factory.setSabotage(mode);
        await expect(
          pad.connect(creator).launch('T', 'T', 0n, (await time()) + 600)
        ).to.be.revertedWithCustomError(tokenFactory, err);
      }
      await factory.setSabotage(0);
    });
  });

  /* ===================================================================== */
  /*  KUPNO I SPRZEDAZ                                                      */
  /* ===================================================================== */

  describe('handel', function () {
    let token: string;
    let t: any;

    beforeEach(async function () {
      token = await launch(creator);
      t = await ethers.getContractAt('MockB20', token);
      await warp(WINDOW + 1); // poza oknem startowym, zeby limit nie mieszal
    });

    it('wymaga poslizgu i terminu, odrzuca pyl', async function () {
      const dl = (await time()) + 600;
      await expect(
        pad.connect(alice).buy(token, 0, dl, { value: 1n })
      ).to.be.revertedWithCustomError(pad, 'SlippageRequired');
      await expect(
        pad.connect(alice).buy(token, 1, (await time()) - 1, { value: 1n })
      ).to.be.revertedWithCustomError(pad, 'Expired');
      await expect(pad.connect(alice).buy(token, 1, dl, { value: 0 })).to.be.revertedWithCustomError(
        pad,
        'ZeroAmount'
      );
      // 1 wei: cala kwota idzie na oplate (zaokraglona w gore), zostaje zero.
      await expect(
        pad.connect(alice).buy(token, 1, dl, { value: 1n })
      ).to.be.revertedWithCustomError(pad, 'DustTrade');
      await expect(
        pad.connect(alice).buy(token, 1, dl, { value: ethers.parseEther('101') })
      ).to.be.revertedWithCustomError(pad, 'BuyTooLarge');
    });

    it('quoteBuy zwraca dokladnie to, co wykona buy', async function () {
      const q = await pad.quoteBuy(token, ethers.parseEther('1'));
      await pad.connect(alice).buy(token, 1, (await time()) + 600, { value: ethers.parseEther('1') });
      expect(await t.balanceOf(alice.address)).to.equal(q[0]);
    });

    it('k jest niemalejace po kazdej operacji', async function () {
      let prev = await k(token);
      for (const v of ['0.1', '0.37', '1.2', '0.05']) {
        await pad.connect(alice).buy(token, 1, (await time()) + 600, { value: ethers.parseEther(v) });
        const now = await k(token);
        expect(now).to.be.greaterThanOrEqual(prev);
        prev = now;
      }
      await t.connect(alice).approve(await pad.getAddress(), MAX_UINT);
      const bal = await t.balanceOf(alice.address);
      for (const part of [4n, 3n, 2n]) {
        await pad.connect(alice).sell(token, bal / part / 4n, 1, (await time()) + 600);
        const now = await k(token);
        expect(now).to.be.greaterThanOrEqual(prev);
        prev = now;
      }
    });

    it('round-trip w jednym bloku zawsze na minusie', async function () {
      const spent = ethers.parseEther('2');
      await pad.connect(alice).buy(token, 1, (await time()) + 600, { value: spent });
      const got = await t.balanceOf(alice.address);
      const q = await pad.quoteSell(token, got);
      expect(q[0]).to.be.lessThan(spent);
    });

    it('oplata dzieli sie 60/40 i sumuje co do wei', async function () {
      const before = { p: await pad.claimable(treasury.address), c: await pad.claimable(creator.address) };
      const q = await pad.quoteBuy(token, ethers.parseEther('1'));
      await pad.connect(alice).buy(token, 1, (await time()) + 600, { value: ethers.parseEther('1') });
      const dp = (await pad.claimable(treasury.address)) - before.p;
      const dc = (await pad.claimable(creator.address)) - before.c;
      expect(dp + dc).to.equal(q[1]);
      expect(dc).to.equal((q[1] * CREATOR_FEE_BPS) / FEE_BPS);
    });

    it('tworca nie moze sprzedac na krzywej', async function () {
      await pad.connect(creator).buy(token, 1, (await time()) + 600, { value: ethers.parseEther('0.5') });
      await t.connect(creator).approve(await pad.getAddress(), MAX_UINT);
      await expect(
        pad.connect(creator).sell(token, 1000n, 1, (await time()) + 600)
      ).to.be.revertedWithCustomError(pad, 'CreatorLocked');
    });

    it('wyplacalnosc: odsprzedaz calej podazy w obiegu nie przekracza rezerwy', async function () {
      await pad.connect(alice).buy(token, 1, (await time()) + 600, { value: ethers.parseEther('2.5') });
      const l = await pad.launchOf(token);
      const circulating = T0 - l[3];
      const q = await pad.quoteSell(token, circulating);
      expect(q[0] + q[1]).to.be.lessThanOrEqual(l[2]);
    });

    it('kontrakt trzyma co najmniej tyle ETH, ile jest komus winien', async function () {
      await pad.connect(alice).buy(token, 1, (await time()) + 600, { value: ethers.parseEther('1') });
      await t.connect(alice).approve(await pad.getAddress(), MAX_UINT);
      await pad.connect(alice).sell(token, await t.balanceOf(alice.address), 1, (await time()) + 600);
      const bal = await ethers.provider.getBalance(await pad.getAddress());
      expect(bal).to.be.greaterThanOrEqual(await pad.totalLiabilities());
    });

    it('limit okna startowego dziala na granicy i znika po niej', async function () {
      const fresh = await launch(creator);
      const cap = await pad.WINDOW_ADDR_CAP();
      await expect(
        pad.connect(alice).buy(fresh, 1, (await time()) + 600, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(pad, 'WindowCap');
      await warp(WINDOW + 1);
      await pad.connect(alice).buy(fresh, 1, (await time()) + 600, { value: ethers.parseEther('1') });
      const ft = await ethers.getContractAt('MockB20', fresh);
      expect(await ft.balanceOf(alice.address)).to.be.greaterThan(cap);
    });
  });

  /* ===================================================================== */
  /*  PROG I ZAPADKA                                                        */
  /* ===================================================================== */

  describe('prog', function () {
    let token: string;
    let t: any;

    async function fillToThreshold(buyer: any) {
      // Jedno duze kupno: dociagniecie sprowadza tokenReserve na T_MIN co do
      // jednostki i zwraca nadwyzke.
      await pad.connect(buyer).buy(token, 1, (await time()) + 600, { value: ethers.parseEther('5') });
    }

    beforeEach(async function () {
      token = await launch(creator);
      t = await ethers.getContractAt('MockB20', token);
      await warp(WINDOW + 1);
    });

    it('dociagnienie sprowadza rezerwe tokena DOKLADNIE na T_MIN i zwraca reszte', async function () {
      const before = await ethers.provider.getBalance(alice.address);
      const tx = await pad
        .connect(alice)
        .buy(token, 1, (await time()) + 600, { value: ethers.parseEther('5') });
      const rc = await tx.wait();
      const after = await ethers.provider.getBalance(alice.address);

      const l = await pad.launchOf(token);
      expect(l[3]).to.equal(T_MIN);
      expect(l[1]).to.equal(2n); // Locked
      // Zbiorka do awansu to dokladnie 3.00 ETH (plus pyl zaokraglen).
      expect(l[2]).to.be.greaterThanOrEqual(ethers.parseEther('3'));
      expect(l[2]).to.be.lessThan(ethers.parseEther('3.000000001'));
      // Realnie wydane = 5 ETH minus zwrot; zwrot musial nastapic.
      const spent = before - after - rc.gasUsed * rc.gasPrice;
      expect(spent).to.be.lessThan(ethers.parseEther('3.04'));
    });

    it('po zamknieciu krzywej kupno rewertuje, sprzedaz dziala', async function () {
      await fillToThreshold(alice);
      await expect(
        pad.connect(bob).buy(token, 1, (await time()) + 600, { value: ethers.parseEther('0.1') })
      ).to.be.revertedWithCustomError(pad, 'CurveIsLocked');

      await t.connect(alice).approve(await pad.getAddress(), MAX_UINT);
      const bal = await t.balanceOf(alice.address);
      await pad.connect(alice).sell(token, bal / 10n, 1, (await time()) + 600);
      const l = await pad.launchOf(token);
      expect(l[3]).to.be.greaterThan(T_MIN);
      // Sprzedaz podniosla rezerwe tokena, ale stan zostaje Locked - nie ma
      // powrotu do Curve, wiec nie da sie bujac wokol progu.
      expect(l[1]).to.equal(2n);
    });

    it('graduate przed progiem rewertuje', async function () {
      await expect(pad.graduate(token)).to.be.revertedWithCustomError(pad, 'NotLocked');
    });

    /**
     * TO JEST TEST DECYZJI, NIE SZCZEGOLU.
     *
     * Cala specyfikacja mowila, ze najwiekszym ryzykiem jest to, ze ta sama
     * calldata `buy` kosztuje ~85k gazu normalnie i ponad milion, gdy przekroczy
     * prog - bo portfel oszacuje gaz na stanie sprzed progu. Awans zostal wiec
     * wyjety z `buy` do osobnego wywolania.
     *
     * Ten test pilnuje, zeby ktos tego kiedys nie cofnal: kupno przekraczajace
     * prog ma miescic sie w tym samym rzedzie wielkosci, co zwykle. Gdyby awans
     * wrocil do `buy`, roznica bylaby kilkukrotna i test padnie.
     */
    it('kupno przekraczajace prog kosztuje tyle samo, co zwykle - awans jest OSOBNY', async function () {
      const normal = await pad
        .connect(bob)
        .buy(token, 1, (await time()) + 600, { value: ethers.parseEther('1') });
      const rcNormal = await normal.wait();

      const crossing = await pad
        .connect(alice)
        .buy(token, 1, (await time()) + 600, { value: ethers.parseEther('5') });
      const rcCrossing = await crossing.wait();

      expect((await pad.launchOf(token))[1]).to.equal(2n); // faktycznie przekroczylo
      expect(rcCrossing.gasUsed).to.be.lessThan(rcNormal.gasUsed * 2n);
    });
  });

  /* ===================================================================== */
  /*  AWANS                                                                 */
  /* ===================================================================== */

  describe('awans', function () {
    let token: string;
    let t: any;

    beforeEach(async function () {
      token = await launch(creator);
      t = await ethers.getContractAt('MockB20', token);
      await warp(WINDOW + 1);
      await pad.connect(alice).buy(token, 1, (await time()) + 600, { value: ethers.parseEther('5') });
    });

    it('wklada cale ETH do puli, nadmiar tokena na adres martwy, cena bez zmian', async function () {
      const l = await pad.launchOf(token);
      // Jawne `bigint`: ethers oddaje te wartosci jako `any`, a bez adnotacji
      // TypeScript zwezal jedna z nich do `number` i odmawial odejmowania.
      const ethReserve: bigint = l[2];
      const gradFee: bigint = await pad.GRAD_FEE();
      const terminal = await pad.SQRT_PRICE_TERMINAL();

      // Saldo PoolManagera mierzymy PRZYROSTEM, nie wartoscia bezwzgledna.
      // Atrapa siedzi pod stalym adresem i przezywa cala sesje testowa, wiec
      // przy uruchomieniu wielu plikow naraz lezy juz na niej ETH z awansow
      // z poprzednich plikow. Wersja bezwzgledna przechodzila w pojedynczym
      // pliku i padala w calym przebiegu - czyli byla zielona z niewlasciwego
      // powodu.
      const pmBefore = await ethers.provider.getBalance(POOL_MANAGER);

      await expect(pad.connect(bob).graduate(token)).to.emit(pad, 'Graduated');

      const after = await pad.launchOf(token);
      expect(after[1]).to.equal(3n); // Graduated
      expect(after[2]).to.equal(0n);
      expect(after[3]).to.equal(0n);
      expect(await t.balanceOf(await pad.getAddress())).to.equal(0n);

      // ETH w puli = rezerwa minus oplata awansowa, z dokladnoscia do pyla wei.
      const pmDelta = (await ethers.provider.getBalance(POOL_MANAGER)) - pmBefore;
      expect(pmDelta).to.be.greaterThan(ethReserve - gradFee - 10n);
      expect(pmDelta).to.be.lessThanOrEqual(ethReserve - gradFee);

      // Nadmiar tokena poszedl na adres martwy - to NIE jest spalenie.
      // Saldo tego tokena na `DEAD` jest wlasne, bo token powstal w tym tescie.
      expect(await t.balanceOf(DEAD)).to.be.greaterThan(0n);
      expect(await t.totalSupply()).to.equal(T0);

      // Cena puli po zasileniu jest DOKLADNIE terminalna.
      const pos = await vault.positionOf(token);
      const slot = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint256'], [pos[0], 6])
      );
      expect(BigInt(await pm.extsload(slot)) & ((1n << 160n) - 1n)).to.equal(terminal);

      // Ksiegowosc: 154.67M do puli + reszta na dead == T_MIN
      const toPool = await t.balanceOf(POOL_MANAGER);
      expect(toPool + (await t.balanceOf(DEAD))).to.equal(T_MIN);
    });

    it('nagroda dla wolajacego jest ksiegowana, nie pushowana', async function () {
      // Polowa oplaty awansowej. Liczona z niej, a nie z osobnej stalej -
      // dwie stale musialyby byc trzymane w zgodzie recznie.
      const reward = (await pad.GRAD_FEE()) / 2n;
      await pad.connect(bob).graduate(token);
      expect(await pad.claimable(bob.address)).to.equal(reward);
      const before = await ethers.provider.getBalance(bob.address);
      const tx = await pad.connect(alice).claimFor(bob.address); // ktokolwiek placi gaz
      await tx.wait();
      expect((await ethers.provider.getBalance(bob.address)) - before).to.equal(reward);
    });

    it('po awansie kupno i sprzedaz rewertuja bezwarunkowo', async function () {
      await pad.connect(bob).graduate(token);
      await expect(
        pad.connect(bob).buy(token, 1, (await time()) + 600, { value: 1000n })
      ).to.be.revertedWithCustomError(pad, 'AlreadyGraduated');
      await t.connect(alice).approve(await pad.getAddress(), MAX_UINT);
      await expect(
        pad.connect(alice).sell(token, 1000n, 1, (await time()) + 600)
      ).to.be.revertedWithCustomError(pad, 'AlreadyGraduated');
      await expect(pad.graduate(token)).to.be.revertedWithCustomError(pad, 'AlreadyGraduated');
    });

    /**
     * Tu stały dwa testy zatruwania puli - "zatruta pula najwyzszego tieru,
     * awans schodzi na nastepny" i "wszystkie cztery zatrute: NoCleanPool".
     * Oba opisywaly zachowanie, ktorego JUZ NIE MA, bo nie ma juz czterech pul
     * ani wyboru miedzy nimi. W ich miejsce wchodzi test przyczyny: puli
     * z naszym hookiem obcy nie otworzy, wiec nie ma czego zatruwac.
     */
    it('OBCY NIE OTWORZY puli z naszym hookiem - to kasuje znaleziska #1, #2 i #3', async function () {
      const key = await pad.poolKeyOf(token);
      await expect(
        pm.connect(alice).initialize(plainKey(key), await pad.SQRT_PRICE_TERMINAL())
      ).to.be.revertedWithCustomError(hook, 'NotVault');

      // Ten sam adres tokena, ale bez naszego hooka w kluczu - taka pula
      // powstaje bez przeszkod i jest CUDZA. Nie udajemy, ze da sie tego
      // zakazac: nie da sie, u nikogo. Nasza pula pozostaje nietknieta.
      const foreign = [key[0], key[1], key[2], key[3], ethers.ZeroAddress];
      await pm.connect(alice).initialize(foreign, 123456789n);

      await pad.connect(bob).graduate(token);
      const pos = await vault.positionOf(token);
      expect(pos[0]).to.equal(poolIdOf(key));
    });

    it('krzywa wyprzedana ponizej progu NIE awansuje, a sprzedaz dziala - znalezisko #4', async function () {
      // Sprzedaz w stanie Locked schodzi ponizej MIN_GRAD_RESERVE. Przedtem
      // `graduate()` bylo tu legalne i palilo 0.1 ETH z resztki pokrycia,
      // z czego polowa szla do wolajacego.
      await t.connect(alice).approve(await pad.getAddress(), MAX_UINT);
      const min: bigint = await pad.MIN_GRAD_RESERVE();
      while (((await pad.launchOf(token))[2] as bigint) >= min) {
        const bal: bigint = await t.balanceOf(alice.address);
        await pad.connect(alice).sell(token, bal / 4n, 1, (await time()) + 600);
      }

      await expect(pad.connect(bob).graduate(token)).to.be.revertedWithCustomError(
        pad,
        'ReserveTooSmallToGraduate'
      );

      // Nikt nie jest uwieziony: krzywa zostaje w Locked, sprzedaz dziala dalej.
      expect((await pad.launchOf(token))[1]).to.equal(2n);
      await pad.connect(alice).sell(token, (await t.balanceOf(alice.address)) / 2n, 1, (await time()) + 600);
    });
  });

  /* ===================================================================== */
  /*  VAULT                                                                 */
  /* ===================================================================== */

  describe('vault', function () {
    let token: string;
    let t: any;

    beforeEach(async function () {
      token = await launch(creator);
      t = await ethers.getContractAt('MockB20', token);
      await warp(WINDOW + 1);
      await pad.connect(alice).buy(token, 1, (await time()) + 600, { value: ethers.parseEther('5') });
      await pad.connect(bob).graduate(token);
    });

    it('nie da sie zasilic drugi raz ani z obcego adresu', async function () {
      const key = await pad.poolKeyOf(token);
      await expect(
        vault.connect(alice).seed(token, creator.address, plainKey(key), await pad.SQRT_PRICE_TERMINAL())
      ).to.be.revertedWithCustomError(vault, 'NotLaunchpad');
    });

    it('nie da sie wejsc w unlockCallback z zewnatrz', async function () {
      await expect(vault.connect(alice).unlockCallback('0x')).to.be.revertedWithCustomError(
        vault,
        'NotPoolManager'
      );
    });

    it('nie istnieje funkcja zmniejszajaca plynnosc', async function () {
      const fns = Object.keys(vault.interface.fragments)
        .map((k2: any) => (vault.interface.fragments as any)[k2])
        .filter((f: any) => f.type === 'function');
      for (const f of fns) {
        // Zadna funkcja publiczna nie przyjmuje liczby ze znakiem - a bez niej
        // nie ma jak podac ujemnej delty plynnosci.
        for (const inp of f.inputs) {
          expect(inp.type.startsWith('int')).to.equal(false, `${f.name}(${inp.type})`);
        }
      }
      const names = fns.map((f: any) => f.name);
      for (const banned of ['withdraw', 'rescue', 'removeLiquidity', 'sweep', 'burn']) {
        expect(names).to.not.include(banned);
      }
    });

    it('harvest zbiera oplaty LP i dzieli je 60/40, wyplata jest pullem', async function () {
      const pos = await vault.positionOf(token);
      const key = await pad.poolKeyOf(token);
      const fee0 = ethers.parseEther('0.01');
      const fee1 = ethers.parseEther('1000');
      await pm.setPendingFees(plainKey(key), fee0, fee1);
      // Pula musi miec z czego wyplacic - w prawdziwym v4 te srodki pochodza
      // ze swapow; tutaj wstrzykujemy je wprost.
      await deployer.sendTransaction({ to: POOL_MANAGER, value: fee0 });
      await t.mint(POOL_MANAGER, fee1);

      await expect(vault.connect(alice).harvest(token)).to.emit(vault, 'Harvested');
      expect(pos[1]).to.be.greaterThan(0n);

      expect(await vault.claimableEth(treasury.address)).to.equal((fee0 * 6000n) / 10000n);
      expect(await vault.claimableEth(creator.address)).to.equal(fee0 - (fee0 * 6000n) / 10000n);
      expect(await vault.claimableToken(token, treasury.address)).to.equal((fee1 * 6000n) / 10000n);

      const before = await t.balanceOf(creator.address);
      await vault.connect(bob).claimTokenFor(token, creator.address);
      expect((await t.balanceOf(creator.address)) - before).to.equal(fee1 - (fee1 * 6000n) / 10000n);
      await expect(vault.connect(bob).claimTokenFor(token, creator.address)).to.be.revertedWithCustomError(
        vault,
        'NothingToClaim'
      );
    });
  });
});

export {};
