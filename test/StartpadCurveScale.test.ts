export {};

const { expect } = require('chai');
const {
  LAUNCHPAD_NETWORKS,
  CURVE_TARGET_ETH,
  R_VIRT_NATIVE,
  ACTIVE_LAUNCHPAD_NETWORK,
} = require('../app/startpad/config');
const {
  rVirtWeiFor,
  targetWeiFor,
  startPriceWeiFor,
  priceWeiAfterOn,
  SUPPLY_WEI,
} = require('../app/startpad/[address]/detailShared');

/**
 * SKALA KRZYWEJ W INTERFEJSIE.
 *
 * ===========================================================================
 * CO SIE STALO I DLACZEGO TEN PLIK ISTNIEJE
 * ===========================================================================
 * 14 sierpnia 2026 `R_VIRT` przestalo byc stala kontraktu i stalo sie
 * argumentem konstruktora - inaczej ten sam bajtkod zbieral na Base 3 ETH,
 * a na Arc, gdzie jednostka natywna to USDC, 3 DOLARY.
 *
 * Kontrakty przeszly, a front zostal ze stalymi wpisanymi w trzech miejscach:
 * `CURVE_TARGET_ETH = 3`, `R_VIRT_ETH = 0.75` w tablicy i `TARGET_WEI = 3e18`
 * na stronie tokena. Efekt na Arc: KAZDY token pokazywal pelny pasek postepu
 * i "0.00 USDC to graduation", a strona tokena pisala "61.72 of 3.00 USDC"
 * przy krzywej przejechanej w szesciu procentach.
 *
 * To jest najgorszy gatunek bledu w tym projekcie: dane z lancucha byly
 * poprawne przez caly czas, wiec nic nie rzucalo wyjatkiem i nic nie bylo
 * puste. Klamal jeden mnoznik, a klamal wiarygodnie.
 *
 * ===========================================================================
 * CZEGO TE TESTY PILNUJA
 * ===========================================================================
 * Nie tego, ze liczby sa "jakies". Tego, ze KAZDA z nich wynika ze skali
 * SWOJEJ sieci - bo nastepne wdrozenie w innej skali (mainnet Arc) wroci
 * dokladnie w to samo miejsce.
 */

/** Sieci sprzed parametryzacji: skala rowna dawnej stalej kontraktu. */
const LEGACY_SCALE = 0.75;
const ARC_CHAIN_ID = 5042002;

describe('Skala krzywej w interfejsie', () => {
  describe('kazda siec niesie wlasna skale', () => {
    it('kazdy wpis sieci ma dodatnia skale - bez niej prog wychodzi zero', () => {
      const networks = Object.values(LAUNCHPAD_NETWORKS) as Array<{ rVirt: number; label: string }>;
      expect(networks.length).to.be.greaterThan(0);
      for (const net of networks) {
        expect(net.rVirt, `${net.label} nie ma skali`).to.be.a('number');
        expect(net.rVirt, `${net.label} ma skale <= 0`).to.be.greaterThan(0);
      }
    });

    it('sieci sprzed zmiany zostaja na dawnej stalej - stare wdrozenia sa nietkniete', () => {
      for (const chainId of [8453, 84532, 4663]) {
        expect(LAUNCHPAD_NETWORKS[chainId].rVirt, `chainId ${chainId}`).to.equal(LEGACY_SCALE);
      }
    });

    it('Arc stoi na 250, czyli progu 1000 USDC', () => {
      expect(LAUNCHPAD_NETWORKS[ARC_CHAIN_ID].rVirt).to.equal(250);
    });
  });

  describe('prog graduacji idzie ze skali, a nie z wpisanej trojki', () => {
    it('prog to zawsze czterokrotnosc skali - na kazdej sieci', () => {
      for (const [chainId, net] of Object.entries(LAUNCHPAD_NETWORKS) as Array<[string, { rVirt: number }]>) {
        const expected = BigInt(Math.round(net.rVirt * 4 * 1e6)) * 10n ** 12n;
        expect(targetWeiFor(Number(chainId)), `chainId ${chainId}`).to.equal(expected);
      }
    });

    it('Arc ma prog 1000, a NIE 3 - to jest ten blad, ktory tu zlapiemy', () => {
      expect(targetWeiFor(ARC_CHAIN_ID)).to.equal(1000n * 10n ** 18n);
      // Gdyby ktos wrocil do stalej, obie sieci oddalyby te sama liczbe.
      expect(targetWeiFor(ARC_CHAIN_ID)).to.not.equal(targetWeiFor(8453));
    });

    it('Base zostaje przy 3.00 - stare wdrozenie nie zmienia sie w niczym', () => {
      expect(targetWeiFor(8453)).to.equal(3n * 10n ** 18n);
    });

    it('stala eksportowana przez config zgadza sie z aktywna siecia', () => {
      expect(CURVE_TARGET_ETH).to.equal(ACTIVE_LAUNCHPAD_NETWORK.rVirt * 4);
      expect(R_VIRT_NATIVE).to.equal(ACTIVE_LAUNCHPAD_NETWORK.rVirt);
    });
  });

  describe('cena tez idzie ze skali', () => {
    it('cena startowa to R_VIRT / calkowita podaz', () => {
      for (const chainId of [8453, ARC_CHAIN_ID]) {
        const expected = (rVirtWeiFor(chainId) * 10n ** 18n) / SUPPLY_WEI;
        expect(startPriceWeiFor(chainId)).to.equal(expected);
      }
    });

    it('token na Arc startuje DROZEJ niz na Base - inna skala, inna cena', () => {
      // Trzysta trzydziesci trzy razy, bo 250 / 0.75. Gdyby cena startowa
      // zostala stala, mnoznik "x1.50" na karcie udostepniania liczylby sie
      // wzgledem ceny, ktorej ten token nigdy nie mial.
      const arc = startPriceWeiFor(ARC_CHAIN_ID);
      const base = startPriceWeiFor(8453);
      expect(arc).to.be.greaterThan(base);
      expect((arc * 100n) / base).to.equal(33_333n);
    });

    it('cena spot po transakcji dolicza wirtualna rezerwe WLASCIWEJ sieci', () => {
      const ethReserve = 10n * 10n ** 18n;
      const tokenReserve = 500_000_000n * 10n ** 18n;
      // (R_VIRT + 10) / 500 mln, liczone w wei za caly token.
      const onArc = priceWeiAfterOn(ARC_CHAIN_ID, ethReserve, tokenReserve);
      const onBase = priceWeiAfterOn(8453, ethReserve, tokenReserve);
      expect(onArc).to.equal(((260n * 10n ** 18n) * 10n ** 18n) / tokenReserve);
      expect(onBase).to.equal(((10n * 10n ** 18n + 750_000_000_000_000_000n) * 10n ** 18n) / tokenReserve);
      expect(onArc).to.be.greaterThan(onBase);
    });

    it('pusta rezerwa tokenow nie dzieli przez zero', () => {
      expect(priceWeiAfterOn(ARC_CHAIN_ID, 10n ** 18n, 0n)).to.equal(0n);
    });
  });

  describe('nieznana siec nie wywraca widoku', () => {
    it('obcy chainId spada na siec aktywna zamiast oddac zero', () => {
      expect(targetWeiFor(999_999)).to.equal(targetWeiFor(ACTIVE_LAUNCHPAD_NETWORK.chain.id));
    });
  });
});
