export {};

const { expect } = require('chai');
const { parseMetadataUri } = require('../app/startpad/metadata');
const { feedByAddress, pairedMarketSymbol, INDEX_FEEDS } = require('../app/derivatives/indexFeeds');

/**
 * TOKEN SPAROWANY Z INDEKSEM (Arc): deklaracja `pairedIndex` jedzie w
 * niezmiennych metadanych tokena jako data-URI. Ten test pilnuje umowy
 * miedzy formularzem startu (koduje), parserem (dekoduje) i modulem
 * derywatow (mapuje adres adaptera na feed i buduje symbol rynku).
 * Zle dane maja odpadac po cichu - strona tokenu nie moze sie wywalic na
 * cudzych metadanych.
 */
function uri(payload: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

const FEED = '0x6531d59b0000000000000000000000000000AbCd';

describe('Startpad: pairedIndex w metadanych', function () {
  it('koduje i odczytuje pare symbol + adres adaptera', function () {
    const meta = parseMetadataUri(uri({ name: 'X', description: 'd', pairedIndex: { symbol: 'TSLA/USD', feed: FEED } }));
    expect(meta.pairedIndex).to.deep.equal({ symbol: 'TSLA/USD', feed: FEED });
    expect(meta.description).to.equal('d');
  });

  it('bez pairedIndex zwraca null, takze dla linku ipfs/https', function () {
    expect(parseMetadataUri(uri({ name: 'X' })).pairedIndex).to.equal(null);
    expect(parseMetadataUri('ipfs://bafy123').pairedIndex).to.equal(null);
    expect(parseMetadataUri('').pairedIndex).to.equal(null);
  });

  it('odrzuca zly adres, za dlugi symbol i obce typy', function () {
    const bad = [
      { symbol: 'TSLA/USD', feed: '0x123' },
      { symbol: 'A'.repeat(17), feed: FEED },
      { symbol: 'TSLA<script>', feed: FEED },
      { symbol: 1, feed: FEED },
      'TSLA/USD',
      null,
    ];
    for (const pairedIndex of bad) {
      expect(parseMetadataUri(uri({ name: 'X', pairedIndex })).pairedIndex, JSON.stringify(pairedIndex)).to.equal(null);
    }
  });

  it('adresy adapterow z deployments przechodza przez parser (to one trafiaja do metadanych)', function () {
    const file = require('../deployments/pythAdapters.5042002.json');
    const entries = Object.entries(file.adapters) as [string, { address: string }][];
    expect(entries.length).to.be.greaterThan(0);
    for (const [symbol, entry] of entries) {
      const meta = parseMetadataUri(uri({ name: 'X', pairedIndex: { symbol: symbol + '/USD', feed: entry.address } }));
      expect(meta.pairedIndex?.feed, symbol).to.equal(entry.address);
    }
  });

  it('adres adaptera z metadanych mapuje sie na feed z deployments (bez wzgledu na wielkosc liter)', function () {
    expect(INDEX_FEEDS.length).to.be.greaterThan(0);
    const feed = INDEX_FEEDS[0];
    expect(feedByAddress(feed.address.toLowerCase())?.symbol).to.equal(feed.symbol);
    expect(feedByAddress(FEED)).to.equal(null);
    expect(feedByAddress(null)).to.equal(null);
  });

  it('symbol rynku perp laczy indeks z symbolem tokena i jest stabilny wzgledem wielkosci liter', function () {
    const s = pairedMarketSymbol('TSLA', 'MYTOK');
    expect(s).to.include('TSLA');
    expect(s).to.include('MYTOK');
    expect(s).to.equal(pairedMarketSymbol('TSLA', 'my-tok'));
    expect(s.length).to.be.at.most(24);
  });
});
