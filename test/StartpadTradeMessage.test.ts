export {};

const { expect } = require('chai');
const { encodeFunctionData, concat, toHex } = require('viem');
const {
  TRADE_MESSAGE_MAX_BYTES,
  messageByteLength,
  cleanTradeMessage,
  encodeTradeMessage,
  decodeTradeMessage,
  displayTradeMessage,
  messageTier,
  buildMessageShareText,
  pickPinnedMessage,
  genesisBuys,
  PIN_SECONDS,
  GENESIS_SIZE,
  txHashFromFeedId,
} = require('../app/startpad/[address]/tradeMessage');

/**
 * WIADOMOSC PRZY KUPNIE.
 *
 * Wiadomosc jedzie jako `dataSuffix` za argumentami `buy`. Solidity ignoruje
 * bajty za ABI, wiec kontrakt widzi zwykle kupno, a tekst zostaje w danych
 * transakcji na zawsze. Testy pilnuja trzech rzeczy: ze to, co zakodujemy,
 * da sie odczytac takze z wnetrza calldaty portfela-kontraktu, ze smieci
 * i znaki sterujace nie przechodza, i ze linki oraz adresy nie trafiaja do
 * tabeli jako klikalna przyneta.
 */

const BUY_ABI = [
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
];

const EXECUTE_ABI = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
];

function buyCalldata() {
  return encodeFunctionData({
    abi: BUY_ABI,
    functionName: 'buy',
    args: ['0xb200000000000000000000000000000000000001', 123456789n, 1_800_000_000n],
  });
}

describe('startpad trade message', () => {
  it('round-trips plain text appended to buy calldata', () => {
    const suffix = encodeTradeMessage('gm frens');
    const input = concat([buyCalldata(), suffix]);
    expect(decodeTradeMessage(input)).to.equal('gm frens');
  });

  it('round-trips emoji and multi-byte text', () => {
    const text = 'to the moon 🚀🌕 zażółć';
    const input = concat([buyCalldata(), encodeTradeMessage(text)]);
    expect(decodeTradeMessage(input)).to.equal(text);
  });

  it('finds the message nested inside a smart-wallet execute call', () => {
    const inner = concat([buyCalldata(), encodeTradeMessage('from a smart wallet')]);
    const outer = encodeFunctionData({
      abi: EXECUTE_ABI,
      functionName: 'execute',
      args: ['0xcf541a7ece881945833ff1680dfc067c5dd4ce2d', 0n, inner],
    });
    expect(decodeTradeMessage(outer)).to.equal('from a smart wallet');
  });

  it('returns null for a buy without a message', () => {
    expect(decodeTradeMessage(buyCalldata())).to.equal(null);
    expect(decodeTradeMessage('0x')).to.equal(null);
  });

  it('returns null for a truncated suffix', () => {
    const suffix = encodeTradeMessage('cut off here');
    const input = concat([buyCalldata(), suffix]).slice(0, -6);
    expect(decodeTradeMessage(input)).to.equal(null);
  });

  it('returns null for invalid UTF-8 behind the marker', () => {
    // marker + dlugosc 2 + bajty, ktore nie sa poprawnym UTF-8
    const input = concat([buyCalldata(), '0x7370687201' + '02' + 'c328']);
    expect(decodeTradeMessage(input)).to.equal(null);
  });

  it('skips a broken marker and reads a later valid one', () => {
    const broken = '0x7370687201ff';
    const input = concat([buyCalldata(), broken, encodeTradeMessage('second one')]);
    expect(decodeTradeMessage(input)).to.equal('second one');
  });

  it('returns null for empty text and rejects text over the byte limit', () => {
    expect(encodeTradeMessage('   ')).to.equal(null);
    const tooLong = 'a'.repeat(TRADE_MESSAGE_MAX_BYTES + 1);
    expect(() => encodeTradeMessage(tooLong)).to.throw(RangeError);
    expect(encodeTradeMessage('a'.repeat(TRADE_MESSAGE_MAX_BYTES))).to.be.a('string');
  });

  it('counts bytes, not characters', () => {
    expect(messageByteLength('abc')).to.equal(3);
    expect(messageByteLength('ż')).to.equal(2);
    expect(messageByteLength('🚀')).to.equal(4);
  });

  it('strips control and bidi characters and collapses whitespace', () => {
    expect(cleanTradeMessage('  hi\u0000\nthere‮  ')).to.equal('hi there');
    expect(cleanTradeMessage('a‏b')).to.equal('ab');
  });

  it('keeps emoji joined with ZWJ intact', () => {
    const family = '👨‍👩‍👧';
    expect(cleanTradeMessage(family)).to.equal(family);
  });

  it('hides links and contract addresses in the displayed text', () => {
    expect(displayTradeMessage('claim at https://evil.example now')).to.equal('[link hidden]');
    expect(displayTradeMessage('go to www.scam.io')).to.equal('[link hidden]');
    expect(displayTradeMessage('airdrop on claim-sphere.xyz')).to.equal('[link hidden]');
    expect(displayTradeMessage('join t.me/rugroom')).to.equal('[link hidden]');
    expect(displayTradeMessage('real CA 0xB2000000000000000000aabbccddeeff00112233')).to.equal('[address hidden]');
    expect(displayTradeMessage('lfg 🚀 see you at 1m')).to.equal('lfg 🚀 see you at 1m');
    expect(displayTradeMessage('3.5x already, wen 10x')).to.equal('3.5x already, wen 10x');
  });

  it('does not decode random calldata that happens to contain the marker without a valid body', () => {
    const noise = toHex(new Uint8Array([0x73, 0x70, 0x68, 0x72, 0x01, 0x00, 0x41]));
    expect(decodeTradeMessage(concat([buyCalldata(), noise]))).to.equal(null);
  });

  describe('tiers', () => {
    const TARGET = 3n * 10n ** 18n; // 3 ETH, prog awansu na Base

    it('scales with the graduation target, not fixed ETH', () => {
      expect(messageTier(10n ** 16n, TARGET)).to.equal('normal'); // 0.01
      expect(messageTier(10n ** 17n, TARGET)).to.equal('loud'); // 0.1 = 1/30
      expect(messageTier(5n * 10n ** 17n, TARGET)).to.equal('whale'); // 0.5 = 1/6
      // Arc: ta sama czesc progu w innych jednostkach daje ten sam poziom
      expect(messageTier(500n, 3000n)).to.equal('whale');
    });
  });

  describe('share text', () => {
    it('quotes the message and hides links in it', () => {
      expect(buildMessageShareText({ symbol: 'SAUSAGES', message: 'lfg 🚀', kind: 'buy' })).to.include('$SAUSAGES').and.include('“lfg 🚀”');
      expect(buildMessageShareText({ symbol: 'X', message: 'go to scam.xyz', kind: 'buy' })).to.not.include('scam.xyz');
      expect(buildMessageShareText({ symbol: 'X', message: 'thanks for the ride', kind: 'sell' })).to.include('“thanks for the ride”');
    });
  });

  describe('pinned and genesis', () => {
    const TARGET = 3n * 10n ** 18n;
    const trade = (n: number, kind: 'buy' | 'sell', eth: bigint, ts: number) => ({
      id: `0x${String(n).padStart(64, '0')}-0`,
      kind,
      account: '0x0000000000000000000000000000000000000001',
      eth,
      tokens: 1n,
      priceWei: 1n,
      ethReserveAfter: 1n,
      block: BigInt(n),
      logIndex: 0,
      ts,
      txHash: `0x${String(n).padStart(64, '0')}`,
    });
    const WHALE = 6n * 10n ** 17n;

    it('pins the newest whale buy with a message from the last hour', () => {
      const now = 1_000_000;
      const trades = [trade(1, 'buy', WHALE, now - 100), trade(2, 'buy', WHALE, now - 50), trade(3, 'buy', 10n ** 15n, now - 10)];
      const messages = new Map([
        [trades[0].txHash, 'older whale'],
        [trades[1].txHash, 'newer whale'],
        [trades[2].txHash, 'small fry'],
      ]);
      expect(pickPinnedMessage(trades, messages, TARGET, now)?.text).to.equal('newer whale');
    });

    it('does not pin after the window, without a message, or for sells', () => {
      const now = 1_000_000;
      const old = [trade(1, 'buy', WHALE, now - PIN_SECONDS - 1)];
      expect(pickPinnedMessage(old, new Map([[old[0].txHash, 'hi']]), TARGET, now)).to.equal(null);
      const silent = [trade(2, 'buy', WHALE, now - 10)];
      expect(pickPinnedMessage(silent, new Map(), TARGET, now)).to.equal(null);
      const sell = [trade(3, 'sell', WHALE, now - 10)];
      expect(pickPinnedMessage(sell, new Map([[sell[0].txHash, 'bye']]), TARGET, now)).to.equal(null);
    });

    it('takes the first buys, oldest first, skipping sells', () => {
      const trades = [trade(1, 'buy', 1n, 1), trade(2, 'sell', 1n, 2), ...Array.from({ length: 12 }, (_, i) => trade(10 + i, 'buy', 1n, 10 + i))];
      const first = genesisBuys(trades);
      expect(first).to.have.length(GENESIS_SIZE);
      expect(first[0].block).to.equal(1n);
      expect(first.every((t: { kind: string }) => t.kind === 'buy')).to.equal(true);
    });
  });

  it('reads the tx hash only from buy and sell feed ids', () => {
    const h = '0x' + 'ab'.repeat(32);
    expect(txHashFromFeedId(`${h}-buy`)).to.equal(h);
    expect(txHashFromFeedId(`${h.toUpperCase().replace('0X', '0x')}-sell`)).to.equal(h);
    expect(txHashFromFeedId(`${h}-launch`)).to.equal(null);
    expect(txHashFromFeedId(`${h}-swap-3`)).to.equal(null);
    expect(txHashFromFeedId(`${h}-pending`)).to.equal(null);
  });
});
