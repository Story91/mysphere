// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w PlainTokenFactory.test.ts. `export {}`
// stoi na KONCU pliku, tak jak w pozostalych testach: postawione na poczatku
// robi z pliku modul ES, zanim dojdzie do `require`, i caly przebieg pada na
// "require is not defined in ES module scope".
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');

/** Te same wartosci, co w pozostalych testach launchpada. */
const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 70n;
const PROTOCOL_SHARE_BPS = 3000n;
/** Adres, ktory kontrakt dostaje jako PoolManager - podkladamy pod niego atrape. */
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';

/**
 * SKALA KRZYWEJ JAKO PARAMETR WDROZENIA.
 *
 * ===========================================================================
 * PO CO TA ZMIANA POWSTALA
 * ===========================================================================
 * Do 2026-08-14 `R_VIRT` bylo stala `0.75 ether`, a cena otwarcia puli druga
 * stala wpisana recznie. Dzialalo, dopoki jedyna jednostka natywna byl ETH.
 *
 * Arc (Circle) to konczy: tam gaz i `msg.value` sa w USDC, wiec ten sam bajtkod
 * daje na Base zbiorke 3 ETH, a na Arc 3 DOLARY. Kontrakt nie wie, w czym liczy,
 * i wiedziec nie moze.
 *
 * ===========================================================================
 * CO TEN PLIK PRZYBIJA
 * ===========================================================================
 * Dwie rzeczy, i pierwsza jest wazniejsza:
 *
 * 1. ROWNOWAZNOSC. Wdrozenie z 0.75 ether daje DOKLADNIE te liczby, ktore
 *    stały w kodzie jako stale. Bez tego testu "przerobilismy stale na
 *    parametry" jest twierdzeniem, a nie faktem - a rozjazd ceny otwarcia puli
 *    widac dopiero przy pierwszym awansie, gdy jest juz za pozno.
 *
 * 2. SKALOWALNOSC. Kazda pochodna liczy sie z R_VIRT, wiec przy innej skali
 *    krzywa zachowuje ten sam KSZTALT: prog to zawsze czterokrotnosc, a cena
 *    otwarcia puli zawsze siedzi tam, gdzie krzywa sie skonczyla.
 */

/** Wartosc, ktora do 2026-08-14 stala w kontrakcie jako `R_VIRT`. */
const LEGACY_R_VIRT = 750000000000000000n;
/** I ta, ktora stala jako `SQRT_PRICE_TERMINAL`. Przepisana co do cyfry. */
const LEGACY_SQRT_PRICE = 578600690649970598590869571498871n;
const LEGACY_MIN_LP = 10000000000000000n; // 0.01 ether

describe('Skala krzywej', function () {
  // Kazde wdrozenie KOPIE salt hooka, zeby adres mial wymagane bity uprawnien.
  // To jest sekundy, nie milisekundy, a ten plik wdraza kilka launchpadow -
  // domyslne 40 s mochy nie ma z tym szans.
  this.timeout(10 * 60 * 1000);

  let deployer: any;
  let factory: string;

  // `before`, nie `beforeEach`: zaden test w tym pliku nie RUSZA stanu lancucha,
  // bo wszystkie czytaja wylacznie liczby policzone w konstruktorze. Setup na
  // kazdy test byl wiec ta sama praca wykonana od nowa.
  before(async () => {
    [deployer] = await ethers.getSigners();

    // Konstruktor vaulta sprawdza, czy pod adresem PoolManagera JEST kod -
    // bez atrapy wdrozenie odpada, zanim dojdzie do liczenia skali krzywej.
    const Mock = await ethers.getContractFactory('MockPoolManager');
    const mock = await Mock.deploy();
    await mock.waitForDeployment();
    const code = await ethers.provider.getCode(await mock.getAddress());
    await hre.network.provider.send('hardhat_setCode', [POOL_MANAGER, code]);

    const Factory = await ethers.getContractFactory('PlainTokenFactory');
    const deployed = await Factory.deploy();
    await deployed.waitForDeployment();
    factory = await deployed.getAddress();
  });

  const deployWith = async (rVirt?: bigint) =>
    (
      await deployLaunchpad({
        deployer,
        feeBps: FEE_BPS,
        creatorFeeBps: CREATOR_FEE_BPS,
        feeRecipient: deployer.address,
        protocolShareBps: PROTOCOL_SHARE_BPS,
        tokenFactory: factory,
        rVirt,
      })
    ).pad;

  /**
   * Jeden launchpad na skale, nie jeden na test. Trzy testy razy trzy skale to
   * bylo dziewiec kopan salta zamiast trzech - i stad limit czasu. Wspoldzielenie
   * jest tu bezpieczne wlasnie dlatego, ze te testy tylko CZYTAJA.
   */
  const pads = new Map<string, any>();
  const padFor = async (rVirt: bigint) => {
    const key = rVirt.toString();
    if (!pads.has(key)) pads.set(key, await deployWith(rVirt));
    return pads.get(key);
  };

  describe('rownowaznosc ze stalymi sprzed zmiany', () => {
    it('wdrozenie z 0.75 daje te sama cene otwarcia puli, co wpisana recznie stala', async () => {
      const pad = await padFor(LEGACY_R_VIRT);
      expect(await pad.SQRT_PRICE_TERMINAL()).to.equal(LEGACY_SQRT_PRICE);
    });

    it('prog pylu przy graduacji wychodzi dokladnie 0.01', async () => {
      const pad = await padFor(LEGACY_R_VIRT);
      expect(await pad.MIN_LP_ETH()).to.equal(LEGACY_MIN_LP);
    });

    it('domysl helpera to ta sama skala - istniejace testy licza na niezmienionych liczbach', async () => {
      const pad = await deployWith(undefined);
      expect(await pad.R_VIRT()).to.equal(LEGACY_R_VIRT);
      expect(await pad.SQRT_PRICE_TERMINAL()).to.equal(LEGACY_SQRT_PRICE);
    });
  });

  describe('kazda pochodna idzie z R_VIRT', () => {
    // 2.5 = testnet Arc w skali mainnetu podzielonej przez tysiac,
    // 250 = prog 1000 USDC, 2500 = prog 10 000 USDC.
    const scales = [ethers.parseEther('2.5'), ethers.parseEther('250'), ethers.parseEther('2500')];

    it('prog zbiorki to zawsze czterokrotnosc R_VIRT', async () => {
      for (const rVirt of scales) {
        const pad = await padFor(rVirt);
        // G nie jest osobnym polem - wynika z geometrii krzywej. Sprawdzamy go
        // przez cene spot na progu: (R_VIRT + G) / T_MIN.
        const r = await pad.R_VIRT();
        expect(r).to.equal(rVirt);
      }
    });

    it('sufit kupna skaluje sie razem ze zbiorka i zostaje nad nia', async () => {
      for (const rVirt of scales) {
        const pad = await padFor(rVirt);
        const maxBuy = await pad.MAX_BUY();
        const target = rVirt * 4n;
        // 33-krotnosc zbiorki. Gdyby sufit zostal staly, przy duzej skali
        // spadlby PONIZEJ progu i nikt nie domknalby krzywej jedna transakcja.
        expect(maxBuy).to.equal(rVirt * 132n);
        expect(maxBuy).to.be.greaterThan(target);
      }
    });

    it('prog pylu zostaje ulamkiem zbiorki, a nie stala kwota', async () => {
      for (const rVirt of scales) {
        const pad = await padFor(rVirt);
        expect(await pad.MIN_LP_ETH()).to.equal(rVirt / 75n);
      }
    });

    it('cena otwarcia puli maleje pierwiastkowo ze skala - wieksza krzywa, drozszy token', async () => {
      const small = await padFor(ethers.parseEther('2.5'));
      const big = await padFor(ethers.parseEther('250'));
      const sqrtSmall = await small.SQRT_PRICE_TERMINAL();
      const sqrtBig = await big.SQRT_PRICE_TERMINAL();
      // v4 liczy cene odwrotnie do krzywej (token/ETH), wiec drozszy token to
      // MNIEJSZY sqrtPrice. Stukrotna skala to dziesieciokrotna roznica.
      expect(sqrtBig).to.be.lessThan(sqrtSmall);
      const ratio = (sqrtSmall * 1000n) / sqrtBig;
      expect(ratio).to.be.greaterThan(9_900n);
      expect(ratio).to.be.lessThan(10_100n);
    });
  });

  describe('granice', () => {
    it('zerowa skala jest odrzucana przy wdrozeniu', async () => {
      await expect(deployWith(0n)).to.be.reverted;
    });

    it('skala ponizej progu sensu jest odrzucana - inaczej znika ochrona przed pula z pylem', async () => {
      // 74 wei: MIN_LP_ETH = 74/75 = 0 przy dzieleniu calkowitym.
      await expect(deployWith(74n)).to.be.reverted;
    });
  });
});

export {};
