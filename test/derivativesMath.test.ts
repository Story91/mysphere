export {};

// Czysta matematyka modulu perps (app/derivatives/[market]/math.ts) - bez
// lancucha. `previewOpen` to lustro `DerivativeMarket.openPosition`, wiec
// pilnujemy tu kierunkow i powodow odrzucenia, nie konkretnych cyfr (te
// potwierdza test kontraktu i raport z 10 wrzesnia).
const { expect } = require('chai');
const { previewOpen, filterRange, priceChangePct, WAD } = require('../app/derivatives/[market]/math');
const { resolvePriceSource, spendableMargin, requireSuccessfulReceipt } = require('../app/derivatives/priceSource');

describe('perps price provenance and transaction safety', () => {
  const feed = '0x1111111111111111111111111111111111111111';
  it('uses the external timestamp rather than a newer registry timestamp', () => {
    expect(resolvePriceSource(feed, [0n, 100n, 0n, 123n, 0n], 999)).to.deep.equal({ source: 'external', updatedAt: 123 });
  });
  it('distinguishes explicit fallback from failed RPC reads', () => {
    expect(resolvePriceSource(feed, [0n, 0n, 0n, 0n, 0n], 999)).to.deep.equal({ source: 'fallback', updatedAt: 999 });
    expect(resolvePriceSource(feed, null, 999)).to.deep.equal({ source: 'unknown', updatedAt: null });
    expect(resolvePriceSource(null, null, 999).source).to.equal('unknown');
    expect(resolvePriceSource('0x' + '0'.repeat(40), null, 999).source).to.equal('registry');
  });
  it('preserves gas without inventing a balance or producing negative margin', () => {
    expect(spendableMargin(1_000_000n, 50_000n)).to.equal(950_000n);
    expect(spendableMargin(49_999n, 50_000n)).to.equal(0n);
    expect(spendableMargin(null, 50_000n)).to.equal(null);
  });
  it('never reports a reverted receipt as success', () => {
    expect(() => requireSuccessfulReceipt({ status: 'reverted' })).to.throw('reverted');
    expect(() => requireSuccessfulReceipt({ status: 'success' })).not.to.throw();
  });
});

const base = {
  quoteReserve: 1000n * WAD,
  baseReserve: 1000n * WAD,
  tradeFeeBps: 30,
  maintenanceBps: 500,
  maxLeverage: 10,
  minMarginUsdc: 5_000_000n,
  openInterest: 0n,
  maxOpenInterest: 10_000n * WAD,
  creatorCap: 0n,
  isCreator: false,
};

describe('derivatives math', () => {
  it('long moves mark up and sets liq below entry', () => {
    const p = previewOpen({ ...base, isLong: true, marginUsdc: 50_000_000n, leverage: 2 })!;
    expect(p.reason).to.equal(null);
    expect(p.markAfter > WAD).to.equal(true);
    expect(p.liqPrice < p.entryPrice).to.equal(true);
  });

  it('short moves mark down and sets liq above entry', () => {
    const p = previewOpen({ ...base, isLong: false, marginUsdc: 50_000_000n, leverage: 2 })!;
    expect(p.reason).to.equal(null);
    expect(p.markAfter < WAD).to.equal(true);
    expect(p.liqPrice > p.entryPrice).to.equal(true);
  });

  it('rejects margin below minimum', () => {
    const p = previewOpen({ ...base, isLong: true, marginUsdc: 1_000_000n, leverage: 2 })!;
    expect(p.reason).to.match(/Minimum margin/);
  });

  it('rejects over the OI cap', () => {
    const p = previewOpen({ ...base, maxOpenInterest: 10n * WAD, isLong: true, marginUsdc: 50_000_000n, leverage: 2 })!;
    expect(p.reason).to.match(/open-interest cap/);
  });

  it('returns null outside leverage bounds', () => {
    expect(previewOpen({ ...base, isLong: true, marginUsdc: 50_000_000n, leverage: 11 })).to.equal(null);
    expect(previewOpen({ ...base, isLong: true, marginUsdc: 50_000_000n, leverage: 0 })).to.equal(null);
  });

  it('filterRange keeps only points inside the window', () => {
    const pts = [
      { time: 0, price: 1n },
      { time: 3000, price: 2n },
      { time: 3500, price: 3n },
    ];
    expect(filterRange(pts, '1h', 4000).map((p: { price: bigint }) => p.price)).to.deep.equal([2n, 3n]);
    expect(filterRange(pts, 'all', 4000).length).to.equal(3);
  });

  it('priceChangePct needs two points and divides by the first', () => {
    expect(priceChangePct([])).to.equal(null);
    expect(priceChangePct([{ time: 0, price: WAD }])).to.equal(null);
    expect(priceChangePct([{ time: 0, price: WAD }, { time: 1, price: (WAD * 11n) / 10n }])).to.equal(10);
  });
});
