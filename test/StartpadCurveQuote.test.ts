export {};

const { expect } = require('chai');
const { quoteBuyLocal, quoteSellLocal, quoteDrifts, CURVE_T_MIN_WEI } = require('../app/startpad/[address]/curveQuote');

/**
 * WYCENA KRZYWEJ POLICZONA W PRZEGLADARCE.
 *
 * Panel handlu czekal z liczba "dostaniesz" na odpowiedz kontraktu: 300 ms
 * debouncu plus czas RPC. Krzywa jest deterministyczna, wiec te sama liczbe
 * umiemy policzyc od razu - ale tylko wtedy, gdy nasza kopia wzoru zgadza sie z
 * kontraktem CO DO ZAOKRAGLENIA. Te testy pilnuja wlasnie zaokraglen: oplata w
 * gore, tokeny w dol, czyli zawsze na niekorzysc wolajacego, tak jak w
 * `CurveLaunchpad._quoteBuy`.
 */

const WEI = 10n ** 18n;
const R_VIRT = 750_000_000_000_000_000n; // 0,75 ETH - skala wdrozenia na Base
const T0 = 1_000_000_000n * WEI;

describe('quoteBuyLocal', () => {
  const swieza = { ethReserve: 0n, tokenReserve: T0, feeBps: 100, rVirtWei: R_VIRT };

  it('liczy tokeny ze wzoru krzywej, nie z ceny spot', () => {
    const { tokensOut, fee } = quoteBuyLocal({ ...swieza, ethIn: WEI / 100n });

    // fee = ceil(0,01 ETH * 1%) = 1e14; eIn = 9,9e15
    expect(fee).to.equal(100_000_000_000_000n);
    // out = floor(T0 * eIn / (R_VIRT + eIn))
    const eIn = WEI / 100n - fee;
    expect(tokensOut).to.equal((T0 * eIn) / (R_VIRT + eIn));
  });

  it('oplate zaokragla W GORE - na niekorzysc kupujacego', () => {
    // 1 wei przy 1% to 0,01 wei, czyli po zaokragleniu w gore caly 1 wei.
    const { fee } = quoteBuyLocal({ ...swieza, ethIn: 1n });

    expect(fee).to.equal(1n);
  });

  it('pyl nie jest bledem, tylko zerem tokenow', () => {
    // Cala kwota schodzi na oplate, wiec do krzywej nie wchodzi nic.
    expect(quoteBuyLocal({ ...swieza, ethIn: 1n }).tokensOut).to.equal(0n);
  });

  it('kupno przy progu dostaje DOKLADNIE tyle, ile do progu brakuje', () => {
    // Rezerwa tuz nad progiem: 100 tokenow ponad T_MIN.
    const tokenReserve = CURVE_T_MIN_WEI + 100n * WEI;
    const { tokensOut, refund } = quoteBuyLocal({
      ethReserve: 3n * WEI,
      tokenReserve,
      feeBps: 100,
      rVirtWei: R_VIRT,
      ethIn: 10n * WEI,
    });

    expect(tokensOut).to.equal(100n * WEI);
    // Reszta ETH wraca - kontrakt nie bierze wiecej, niz potrzebuje do progu.
    expect(refund > 0n).to.equal(true);
  });

  it('suma sie zgadza: to, co wchodzi do krzywej, plus oplata, plus zwrot', () => {
    const tokenReserve = CURVE_T_MIN_WEI + 100n * WEI;
    const ethIn = 10n * WEI;
    const { fee, refund } = quoteBuyLocal({ ethReserve: 3n * WEI, tokenReserve, feeBps: 100, rVirtWei: R_VIRT, ethIn });

    expect(fee + refund <= ethIn).to.equal(true);
  });

  it('zerowa kwota to zerowa wycena, a nie dzielenie przez zero', () => {
    expect(quoteBuyLocal({ ...swieza, ethIn: 0n })).to.deep.equal({ tokensOut: 0n, fee: 0n, refund: 0n });
  });

  it('pusta krzywa nie sprzedaje tokenow, ktorych nie ma', () => {
    expect(quoteBuyLocal({ ...swieza, tokenReserve: 0n, ethIn: WEI }).tokensOut).to.equal(0n);
  });

  it('skala sieci wchodzi argumentem - na Arc wirtualna rezerwa jest inna', () => {
    const base = quoteBuyLocal({ ...swieza, ethIn: WEI });
    const arc = quoteBuyLocal({ ...swieza, rVirtWei: 250n * WEI, ethIn: WEI });

    // Wieksza wirtualna rezerwa to plaskа krzywa, czyli MNIEJ tokenow za te
    // sama kwote.
    expect(arc.tokensOut < base.tokensOut).to.equal(true);
  });
});

describe('quoteSellLocal', () => {
  it('liczy wyplate ze wzoru krzywej i scina oplate w gore', () => {
    const tokensIn = 1_000_000n * WEI;
    const ethReserve = WEI / 2n;
    const tokenReserve = 800_000_000n * WEI;

    const { ethOut, fee } = quoteSellLocal({ tokensIn, ethReserve, tokenReserve, feeBps: 100, rVirtWei: R_VIRT });

    const gross = ((R_VIRT + ethReserve) * tokensIn) / (tokenReserve + tokensIn);
    const expectedFee = (gross * 100n + 9_999n) / 10_000n;
    expect(fee).to.equal(expectedFee);
    expect(ethOut).to.equal(gross - expectedFee);
  });

  it('zero tokenow to zero ETH, a nie rewert', () => {
    expect(quoteSellLocal({ tokensIn: 0n, ethReserve: WEI, tokenReserve: T0, feeBps: 100, rVirtWei: R_VIRT })).to.deep.equal({
      ethOut: 0n,
      fee: 0n,
    });
  });
});

describe('quoteDrifts', () => {
  it('roznica pojedynczych jednostek to zaokraglenie, nie rozjazd', () => {
    expect(quoteDrifts(1_000_000n, 1_000_001n)).to.equal(false);
  });

  it('roznica ponad promil znaczy, ze kopia wzoru przestala pasowac', () => {
    expect(quoteDrifts(1_100n, 1_000n)).to.equal(true);
  });

  it('zero z kontraktu przy niezerowym podgladzie to rozjazd', () => {
    expect(quoteDrifts(5n, 0n)).to.equal(true);
  });

  it('dwa zera sie zgadzaja', () => {
    expect(quoteDrifts(0n, 0n)).to.equal(false);
  });
});
