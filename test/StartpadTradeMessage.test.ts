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
});
