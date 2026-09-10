// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w CurveLaunchpad.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');

/**
 * Arc Derivative Market - vAMM perp z feedem wystawianym przez tworce.
 *
 * Zdania do udowodnienia, po jednym na bezpiecznik wynikajacy z researchu
 * (HIP-3, niewyplacalnosc Perpetual Protocol v1, Mango Markets):
 *
 *  - feed powstaje TYLKO z kaucja, a kaucja jest wieksza niz minimum, jesli
 *    tworca chce wiekszego rynku,
 *  - cena ma DWA niezalezne wylaczniki: limit skoku i minimalny odstep -
 *    kazdy z nich odrzuca osobno,
 *  - TWAP liczy srednia wazona czasem, a nie ostatnia cene,
 *  - limit OI to funkcja KAUCJI i ma dwa stopnie: probacja i rynek dojrzaly,
 *  - tworca feedu nie kupi na wlasnym rynku wiecej niz 2% limitu OI,
 *  - long i short otwieraja sie i zamykaja, funding idzie we wlasciwa strone,
 *  - likwiduje KAZDY adres, nie tylko tworca, i dostaje za to nagrode,
 *  - pusty fundusz ubezpieczeniowy zatrzymuje NOWE pozycje na calym module,
 *  - zgloszenie ceny zamraza feed, a uznane zgloszenie tnie kaucje,
 *  - nagroda tworcy nie jest do odebrania od razu - dopiero po 7 dniach.
 *
 * Czego te testy NIE dowodza: zachowania prawdziwego feedu Chainlinka (na Arc
 * nie ma jeszcze opublikowanych adresow - galaz `CHAINLINK_FEED != 0` czeka na
 * nie) ani odpornosci multisigu, ktory rozstrzyga spory.
 */

const USDC = (n: number) => BigInt(Math.round(n * 1e6));
const WAD = (n: number) => ethers.parseEther(String(n));

/** Kaucja 100 000 USDC -> limit OI 200 000 USD na probacji, 800 000 po dojrzeniu. */
const BOND = USDC(100_000);
const START_PRICE = WAD(100);
const VLIQ = WAD(1_000_000);

describe('DerivativeMarket (Arc)', function () {
  this.timeout(240_000);

  let deployer: any, governance: any, treasury: any;
  let creator: any, alice: any, bob: any, keeper: any, challenger: any;
  let usdc: any, oracle: any, factory: any, fees: any, insurance: any, market: any;

  async function now() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }

  async function warp(seconds: number) {
    await hre.network.provider.send('evm_increaseTime', [seconds]);
    await hre.network.provider.send('evm_mine');
  }

  /** Pelny modul od zera. `seedInsurance` w USDC - 0 znaczy fundusz pusty. */
  async function deployAll(seedInsurance: bigint) {
    const Usdc = await ethers.getContractFactory('MockUSDC');
    usdc = await Usdc.deploy();
    await usdc.waitForDeployment();

    const Oracle = await ethers.getContractFactory('PriceOracleRegistry');
    oracle = await Oracle.deploy(await usdc.getAddress(), governance.address, treasury.address);
    await oracle.waitForDeployment();

    const Factory = await ethers.getContractFactory('DerivativeMarketFactory');
    factory = await Factory.deploy(
      await usdc.getAddress(),
      await oracle.getAddress(),
      treasury.address,
      governance.address,
    );
    await factory.waitForDeployment();

    fees = await ethers.getContractAt('FeeDistributor', await factory.FEES());
    insurance = await ethers.getContractAt('InsuranceFund', await factory.INSURANCE());
    await oracle.connect(governance).setInsuranceFund(await insurance.getAddress());

    for (const who of [creator, alice, bob, keeper, challenger, deployer]) {
      await usdc.mint(who.address, USDC(5_000_000));
      await usdc.connect(who).approve(await oracle.getAddress(), ethers.MaxUint256);
    }

    if (seedInsurance > 0n) {
      await usdc.connect(deployer).transfer(await insurance.getAddress(), seedInsurance);
      await insurance.connect(deployer).notifyDeposit(seedInsurance);
    }
  }

  /** Rejestruje feed i stawia na nim vAMM. Zwraca id feedu. */
  async function createMarket() {
    await oracle.connect(creator).registerMarket('kASK-USD', START_PRICE, BOND);
    await factory.connect(creator).createMarket(1, VLIQ, ethers.ZeroAddress);
    market = await ethers.getContractAt('DerivativeMarket', await factory.marketOf(1));
    for (const who of [creator, alice, bob, keeper, challenger]) {
      await usdc.connect(who).approve(await market.getAddress(), ethers.MaxUint256);
    }
    return 1;
  }

  beforeEach(async function () {
    [deployer, governance, treasury, creator, alice, bob, keeper, challenger] = await ethers.getSigners();
    await deployAll(USDC(50_000));
    await createMarket();
  });

  /* ==================================================================== */
  /*  FEED: REJESTRACJA I KAUCJA                                           */
  /* ==================================================================== */

  describe('rejestracja feedu i kaucja', function () {
    it('pobiera kaucje i zapisuje tworce', async function () {
      const m = await oracle.getMarket(1);
      expect(m[0]).to.equal(creator.address);
      expect(m[5]).to.equal(BOND);
      expect(await usdc.balanceOf(await oracle.getAddress())).to.equal(BOND);
    });

    it('odrzuca kaucje ponizej minimum', async function () {
      await expect(
        oracle.connect(alice).registerMarket('X-USD', START_PRICE, USDC(99)),
      ).to.be.revertedWithCustomError(oracle, 'BondTooSmall');
    });

    it('doplata kaucji podnosi limit OI rynku', async function () {
      const before = await market.maxOpenInterest();
      await oracle.connect(creator).topUpBond(1, BOND);
      expect(await market.maxOpenInterest()).to.equal(before * 2n);
    });
  });

  /* ==================================================================== */
  /*  CENA: DWA WYLACZNIKI I TWAP                                          */
  /* ==================================================================== */

  describe('aktualizacja ceny', function () {
    it('odrzuca skok wiekszy niz limit odchylenia', async function () {
      await warp(120);
      await expect(
        oracle.connect(creator).submitPrice(1, WAD(120), await now()),
      ).to.be.revertedWithCustomError(oracle, 'DeviationTooLarge');
    });

    it('przyjmuje skok w granicach limitu', async function () {
      await warp(120);
      await oracle.connect(creator).submitPrice(1, WAD(109), await now());
      expect((await oracle.getPrice(1))[0]).to.equal(WAD(109));
    });

    it('odrzuca druga cene w tym samym oknie czasowym', async function () {
      await warp(120);
      await oracle.connect(creator).submitPrice(1, WAD(101), await now());
      await warp(10);
      // Skok jest tu maly, wiec odrzucenie moze pochodzic WYLACZNIE
      // z drugiego, niezaleznego bezpiecznika - odstepu czasu.
      await expect(
        oracle.connect(creator).submitPrice(1, WAD(102), await now()),
      ).to.be.revertedWithCustomError(oracle, 'TooSoon');
    });

    it('nie przyjmuje ceny od obcego adresu', async function () {
      await warp(120);
      await expect(
        oracle.connect(alice).submitPrice(1, WAD(101), await now()),
      ).to.be.revertedWithCustomError(oracle, 'NotPublisher');
    });

    it('TWAP zostaje w tyle za skokiem ceny', async function () {
      await warp(600);
      await oracle.connect(creator).submitPrice(1, WAD(109), await now());
      await warp(60);
      const twap = await market.indexPrice();
      // 600 s po 100 USD, potem 60 s po 109 - srednia musi lezec pomiedzy
      // i znacznie blizej 100 niz 109.
      expect(twap).to.be.gt(WAD(100));
      expect(twap).to.be.lt(WAD(102));
    });
  });

  /* ==================================================================== */
  /*  LIMIT OI: DWA STOPNIE                                                */
  /* ==================================================================== */

  describe('limit OI', function () {
    it('na probacji limit to kaucja razy mnoznik probacyjny', async function () {
      expect(await market.isMature()).to.equal(false);
      const mult = await market.OI_MULTIPLIER_PROBATION();
      expect(await market.maxOpenInterest()).to.equal(BOND * 10n ** 12n * mult);
    });

    it('rynek dojrzewa po czasie i po serii przyjetych cen', async function () {
      await warp(7 * 24 * 3600 + 60);
      expect(await market.isMature()).to.equal(false); // sam wiek nie wystarczy

      for (let i = 0; i < 50; i++) {
        await warp(61);
        await oracle.connect(creator).submitPrice(1, WAD(100 + (i % 3)), await now());
      }

      expect(await market.isMature()).to.equal(true);
      const mult = await market.OI_MULTIPLIER_MATURE();
      expect(await market.maxOpenInterest()).to.equal(BOND * 10n ** 12n * mult);
    });

    it('odrzuca pozycje ponad limit OI', async function () {
      await expect(
        market.connect(alice).openPosition(true, USDC(25_000), 10),
      ).to.be.revertedWithCustomError(market, 'OiCapExceeded');
    });
  });

  /* ==================================================================== */
  /*  SUFIT TWORCY                                                         */
  /* ==================================================================== */

  describe('sufit pozycji tworcy', function () {
    it('odrzuca pozycje tworcy ponad 2% limitu OI', async function () {
      // Limit OI na probacji to 200 000 USD, wiec sufit tworcy to 4 000 USD.
      await expect(
        market.connect(creator).openPosition(true, USDC(1_000), 10),
      ).to.be.revertedWithCustomError(market, 'CreatorCapExceeded');
    });

    it('przepuszcza mala pozycje tworcy', async function () {
      await market.connect(creator).openPosition(true, USDC(300), 10);
      const p = await market.getPosition(creator.address);
      expect(p[0]).to.be.gt(0);
    });

    it('ten sam rozmiar u obcego adresu przechodzi', async function () {
      await market.connect(alice).openPosition(true, USDC(1_000), 10);
      const p = await market.getPosition(alice.address);
      expect(p[0]).to.be.gt(0);
    });
  });

  /* ==================================================================== */
  /*  HANDEL                                                               */
  /* ==================================================================== */

  describe('otwieranie i zamykanie pozycji', function () {
    it('long: rozmiar dodatni, mark rosnie, zamkniecie wyplaca USDC', async function () {
      const markBefore = await market.markPrice();
      await market.connect(alice).openPosition(true, USDC(2_000), 10);

      const p = await market.getPosition(alice.address);
      expect(p[0]).to.be.gt(0);
      expect(await market.markPrice()).to.be.gt(markBefore);
      expect(await market.openInterestNotional()).to.equal(WAD(20_000));

      const balBefore = await usdc.balanceOf(alice.address);
      await market.connect(alice).closePosition();
      expect(await usdc.balanceOf(alice.address)).to.be.gt(balBefore);
      expect((await market.getPosition(alice.address))[0]).to.equal(0);
      expect(await market.openInterestNotional()).to.equal(0);
    });

    it('short: rozmiar ujemny, mark spada', async function () {
      const markBefore = await market.markPrice();
      await market.connect(bob).openPosition(false, USDC(2_000), 10);

      const p = await market.getPosition(bob.address);
      expect(p[0]).to.be.lt(0);
      expect(await market.markPrice()).to.be.lt(markBefore);

      await market.connect(bob).closePosition();
      expect((await market.getPosition(bob.address))[0]).to.equal(0);
    });

    it('nie pozwala na druga pozycje tego samego adresu', async function () {
      await market.connect(alice).openPosition(true, USDC(2_000), 10);
      await expect(
        market.connect(alice).openPosition(true, USDC(2_000), 10),
      ).to.be.revertedWithCustomError(market, 'PositionAlreadyOpen');
    });

    it('odrzuca dzwignie ponad maksimum', async function () {
      await expect(
        market.connect(alice).openPosition(true, USDC(2_000), 11),
      ).to.be.revertedWithCustomError(market, 'BadLeverage');
    });
  });

  /* ==================================================================== */
  /*  FUNDING                                                              */
  /* ==================================================================== */

  describe('funding', function () {
    it('mark powyzej indeksu: funding dodatni, long placi', async function () {
      await market.connect(alice).openPosition(true, USDC(2_000), 10);
      expect(await market.markPrice()).to.be.gt(await market.indexPrice());

      await warp(3600);
      await market.connect(keeper).settleFunding();

      expect(await market.cumFunding()).to.be.gt(0);
      expect(await market.pendingFunding(alice.address)).to.be.gt(0);
    });

    it('mark ponizej indeksu: funding ujemny, short placi', async function () {
      await market.connect(bob).openPosition(false, USDC(2_000), 10);
      expect(await market.markPrice()).to.be.lt(await market.indexPrice());

      await warp(3600);
      await market.connect(keeper).settleFunding();

      expect(await market.cumFunding()).to.be.lt(0);
      // Short ma rozmiar ujemny, a cumFunding jest ujemny - iloczyn dodatni,
      // czyli short PLACI. To jest cala mechanika sciagania marku do indeksu.
      expect(await market.pendingFunding(bob.address)).to.be.gt(0);
    });

    it('nie rozlicza fundingu czesciej niz co interwal', async function () {
      await warp(3600);
      await market.connect(keeper).settleFunding();
      await expect(market.connect(keeper).settleFunding()).to.be.revertedWithCustomError(
        market,
        'FundingTooSoon',
      );
    });
  });

  /* ==================================================================== */
  /*  LIKWIDACJA                                                           */
  /* ==================================================================== */

  describe('likwidacja', function () {
    it('zdrowej pozycji nie da sie zlikwidowac', async function () {
      await market.connect(alice).openPosition(true, USDC(2_000), 10);
      await expect(market.connect(keeper).liquidate(alice.address)).to.be.revertedWithCustomError(
        market,
        'PositionHealthy',
      );
    });

    it('likwiduje DOWOLNY adres i dostaje za to nagrode', async function () {
      await market.connect(alice).openPosition(true, USDC(2_000), 10);
      // Bob spycha mark w dol na tyle, ze long alice schodzi pod prog utrzymania.
      await market.connect(bob).openPosition(false, USDC(3_000), 10);
      expect(await market.marginRatioBps(alice.address)).to.be.lt(
        await market.MAINTENANCE_MARGIN_BPS(),
      );

      // Keeper nie jest ani tworca feedu, ani wlascicielem pozycji.
      expect(keeper.address).to.not.equal(creator.address);
      const balBefore = await usdc.balanceOf(keeper.address);
      await market.connect(keeper).liquidate(alice.address);

      expect(await usdc.balanceOf(keeper.address)).to.be.gt(balBefore);
      expect((await market.getPosition(alice.address))[0]).to.equal(0);
    });
  });

  /* ==================================================================== */
  /*  FUNDUSZ UBEZPIECZENIOWY I PAUZA GLOBALNA                             */
  /* ==================================================================== */

  describe('fundusz ubezpieczeniowy', function () {
    it('czesc kazdej oplaty wplywa do funduszu', async function () {
      const before = await insurance.balance();
      await market.connect(alice).openPosition(true, USDC(2_000), 10);
      expect(await insurance.balance()).to.be.gt(before);
    });

    it('rynki raportuja OI do funduszu', async function () {
      await market.connect(alice).openPosition(true, USDC(2_000), 10);
      expect(await insurance.totalOi()).to.equal(WAD(20_000));
      await market.connect(alice).closePosition();
      expect(await insurance.totalOi()).to.equal(0);
    });

    it('pusty fundusz zatrzymuje NOWE pozycje na calym module', async function () {
      await deployAll(0n);
      await createMarket();

      // Przy zerowym OI nie ma czego pokrywac - pierwsza pozycja przechodzi.
      await market.connect(alice).openPosition(true, USDC(2_000), 10);
      expect(await insurance.newPositionsPaused()).to.equal(true);

      await expect(
        market.connect(bob).openPosition(false, USDC(2_000), 10),
      ).to.be.revertedWithCustomError(market, 'SystemPaused');

      // Zamykanie ma dzialac takze pod pauza - pauza wstrzymuje naplyw ryzyka,
      // a nie wiezi w nim ludzi.
      await market.connect(alice).closePosition();

      await usdc.connect(deployer).transfer(await insurance.getAddress(), USDC(50_000));
      await insurance.connect(deployer).notifyDeposit(USDC(50_000));
      expect(await insurance.newPositionsPaused()).to.equal(false);
      await market.connect(bob).openPosition(false, USDC(2_000), 10);
    });

    it('prog pokrycia zmienia tylko governance i tylko do sufitu', async function () {
      await expect(insurance.connect(alice).setMinRatioBps(50)).to.be.revertedWithCustomError(
        insurance,
        'NotGovernance',
      );
      await expect(
        insurance.connect(governance).setMinRatioBps(1001),
      ).to.be.revertedWithCustomError(insurance, 'RatioTooHigh');
      await insurance.connect(governance).setMinRatioBps(50);
      expect(await insurance.minRatioBps()).to.equal(50);
    });
  });

  /* ==================================================================== */
  /*  ZGLOSZENIE CENY                                                      */
  /* ==================================================================== */

  describe('zgloszenie ceny', function () {
    it('zgloszenie zamraza aktualizacje ceny', async function () {
      await oracle.connect(challenger).challengePrice(1);
      await warp(120);
      await expect(
        oracle.connect(creator).submitPrice(1, WAD(101), await now()),
      ).to.be.revertedWithCustomError(oracle, 'PriceFrozen');
    });

    it('zamrozony rynek wraca na probacje', async function () {
      await oracle.connect(challenger).challengePrice(1);
      expect(await market.isMature()).to.equal(false);
    });

    it('uznane zgloszenie tnie kaucje i nagradza zglaszajacego', async function () {
      const balBefore = await usdc.balanceOf(challenger.address);
      await oracle.connect(challenger).challengePrice(1);
      const bondPaid = balBefore - (await usdc.balanceOf(challenger.address));
      expect(bondPaid).to.equal(await oracle.CHALLENGE_BOND());

      await oracle.connect(governance).resolveChallenge(1, true);

      // Kaucja wraca plus polowa scietej kaucji feedu.
      expect(await usdc.balanceOf(challenger.address)).to.equal(balBefore + BOND / 2n);
      const stats = await oracle.marketStats(1);
      expect(stats[5]).to.equal(true); // slashed
      expect(await market.maxOpenInterest()).to.equal(0);
    });

    it('odrzucone zgloszenie: kaucja przepada do funduszu, feed odmarza', async function () {
      const fundBefore = await insurance.balance();
      await oracle.connect(challenger).challengePrice(1);
      const balAfterBond = await usdc.balanceOf(challenger.address);

      await oracle.connect(governance).resolveChallenge(1, false);

      expect(await usdc.balanceOf(challenger.address)).to.equal(balAfterBond);
      expect(await insurance.balance()).to.equal(fundBefore + (await oracle.CHALLENGE_BOND()));

      await warp(120);
      await oracle.connect(creator).submitPrice(1, WAD(101), await now());
    });

    it('rozstrzyga tylko governance', async function () {
      await oracle.connect(challenger).challengePrice(1);
      await expect(oracle.connect(alice).resolveChallenge(1, true)).to.be.revertedWithCustomError(
        oracle,
        'NotGovernance',
      );
    });

    it('nie da sie zglosic po zamknieciu okna', async function () {
      await warp(3601);
      await expect(oracle.connect(challenger).challengePrice(1)).to.be.revertedWithCustomError(
        oracle,
        'ChallengeWindowClosed',
      );
    });
  });

  /* ==================================================================== */
  /*  NAGRODY TWORCY - BLOKADA 7 DNI                                       */
  /* ==================================================================== */

  describe('nagrody tworcy', function () {
    it('nagroda nie jest do odebrania przed uplywem blokady', async function () {
      await market.connect(alice).openPosition(true, USDC(2_000), 10);

      expect(await fees.lockedTotal(creator.address)).to.be.gt(0);
      expect(await fees.claimableNow(creator.address)).to.equal(0);
      await expect(fees.connect(creator).claim()).to.be.revertedWithCustomError(
        fees,
        'NothingToClaim',
      );
    });

    it('po blokadzie nagroda wychodzi w calosci', async function () {
      await market.connect(alice).openPosition(true, USDC(2_000), 10);
      const owed = await fees.lockedTotal(creator.address);

      await warp(8 * 24 * 3600);

      expect(await fees.lockedTotal(creator.address)).to.equal(0);
      expect(await fees.claimableNow(creator.address)).to.equal(owed);

      const balBefore = await usdc.balanceOf(creator.address);
      await fees.connect(creator).claim();
      expect(await usdc.balanceOf(creator.address)).to.equal(balBefore + owed);
    });

    it('oplata idzie do tworcy FEEDU, nie do przypadkowego adresu', async function () {
      await market.connect(alice).openPosition(true, USDC(2_000), 10);
      expect(await fees.lockedTotal(alice.address)).to.equal(0);
      expect(await fees.lockedTotal(creator.address)).to.be.gt(0);
    });
  });
});
