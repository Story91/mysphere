export {};

const { expect } = require('chai');
const { zapSellersFromTransfers, withRealSeller } = require('../app/startpad/[address]/historyScan');

/**
 * Sprzedaz przez PerpZap v2: `Sold.seller` to zap. Prawdziwy sprzedajacy to
 * nadawca Transferu mema DO zapa w tej samej transakcji.
 */
describe('Historia: sprzedajacy przez zap', function () {
  const ZAP = '0x00000000000000000000000000000000000000aa';
  const ALICE = '0x00000000000000000000000000000000000a11ce';
  const TX = '0xabc0000000000000000000000000000000000000000000000000000000000001';
  const sell = { id: `${TX}-3`, kind: 'sell', account: ZAP, eth: 1n, tokens: 5n, priceWei: 1n, ethReserveAfter: 1n, block: 1n, logIndex: 3, ts: 0, txHash: TX };

  it('podmienia zap na nadawce Transferu do zapa', function () {
    const sellers = zapSellersFromTransfers(
      [
        { args: { from: ALICE, to: ZAP, value: 5n }, transactionHash: TX },
        { args: { from: ZAP, to: '0x0000000000000000000000000000000000000c0e', value: 5n }, transactionHash: TX },
      ],
      [ZAP]
    );
    expect(withRealSeller(sell, [ZAP], sellers).account).to.equal(ALICE);
  });

  it('nie rusza kupna, zwyklej sprzedazy ani sprzedazy bez Transferu', function () {
    const sellers = new Map();
    expect(withRealSeller(sell, [ZAP], sellers).account).to.equal(ZAP);
    expect(withRealSeller({ ...sell, kind: 'buy' }, [ZAP], new Map([[TX, ALICE]])).account).to.equal(ZAP);
    expect(withRealSeller({ ...sell, account: ALICE }, [ZAP], new Map([[TX, ZAP]])).account).to.equal(ALICE);
    expect(zapSellersFromTransfers([{ args: { from: ALICE, to: ZAP, value: 1n }, transactionHash: TX }], []).size).to.equal(0);
  });
});
