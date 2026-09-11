const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

/**
 * PythReceiver - wlasny odbiornik aktualizacji Pytha, sprawdzany na PRAWDZIWYCH
 * danych z Hermesa (test/fixtures/pyth-*.json, pobrane przez
 * scripts/derivatives/collect-pyth-signers.ts) i prawdziwym zestawie kluczy
 * (deployments/pythSigners.json, odzyskanym ecrecover z podpisow).
 *
 * Zdania do udowodnienia:
 *  - aktualizacja z Hermesa przechodzi w calosci i daje DOKLADNIE te liczby,
 *    ktore Hermes podal w `parsed` (cena, conf, expo, publishTime),
 *  - starsza aktualizacja nie nadpisuje nowszej,
 *  - przestawiony bajt w ciele VAA = zly podpis; przestawiony bajt w
 *    wiadomosci = zly dowod Merkle,
 *  - quorum wyzsze niz liczba podpisow = odrzucenie,
 *  - inny emiter = odrzucenie,
 *  - inny numer zestawu = odrzucenie,
 *  - zestaw zmienia tylko owner.
 */
const signers = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployments', 'pythSigners.json'), 'utf8'));
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `pyth-${name}.json`), 'utf8'));

const GUARDIANS: string[] = Object.keys(signers.guardians)
  .map(Number)
  .sort((a: number, b: number) => a - b)
  .map((i: number) => signers.guardians[i]);
const [SRC_CHAIN, SRC_EMITTER] = (signers.emitters[0] as string).split(':');

function flip(hex: string, byteOffset: number): string {
  const b = Buffer.from(hex.replace(/^0x/, ''), 'hex');
  b[byteOffset] ^= 0x01;
  return '0x' + b.toString('hex');
}

describe('PythReceiver', function () {
  this.timeout(120_000);
  let receiver: any, owner: any, stranger: any;
  const btc = fixture('btc');
  const tsla = fixture('tsla');

  async function deploy(quorum = 3, setIndex = signers.guardianSet, emitter = SRC_EMITTER) {
    const F = await ethers.getContractFactory('PythReceiver');
    return F.deploy(GUARDIANS, quorum, setIndex, Number(SRC_CHAIN), emitter);
  }

  beforeEach(async () => {
    [owner, stranger] = await ethers.getSigners();
    receiver = await deploy();
  });

  it('accepts a real Hermes update and stores exactly what Hermes parsed', async () => {
    await receiver.updatePriceFeeds(['0x' + btc.binary]);
    const p = await receiver.getPriceUnsafe(btc.id);
    expect(p.price).to.equal(BigInt(btc.parsed.price.price));
    expect(p.conf).to.equal(BigInt(btc.parsed.price.conf));
    expect(Number(p.expo)).to.equal(btc.parsed.price.expo);
    expect(p.publishTime).to.equal(BigInt(btc.parsed.price.publish_time));
    expect(await receiver.priceFeedExists(btc.id)).to.equal(true);
  });

  it('handles an equity feed the same way (TSLA)', async () => {
    await receiver.updatePriceFeeds(['0x' + tsla.binary]);
    const p = await receiver.getPriceUnsafe(tsla.id);
    expect(p.price).to.equal(BigInt(tsla.parsed.price.price));
    expect(p.publishTime).to.equal(BigInt(tsla.parsed.price.publish_time));
  });

  it('does not let an older update overwrite a newer one', async () => {
    await receiver.updatePriceFeeds(['0x' + btc.binary]);
    const before = await receiver.getPriceUnsafe(btc.id);
    // Ten sam blob raz jeszcze: publishTime rowny, wiec bez zapisu i bez rewertu.
    await receiver.updatePriceFeeds(['0x' + btc.binary]);
    const after = await receiver.getPriceUnsafe(btc.id);
    expect(after.publishTime).to.equal(before.publishTime);
  });

  it('rejects a flipped byte in the VAA body as a bad signature', async () => {
    // Cialo VAA zaczyna sie po 6 + 3*66 bajtach naglowka VAA; VAA zaczyna sie
    // po naglowku PNAU (4 magic + 2 wersja + 1 trailing + trailing + 1 typ + 2 dlugosc).
    const b = Buffer.from(btc.binary, 'hex');
    const trailing = b[6];
    const vaaStart = 7 + trailing + 1 + 2;
    const sigCount = b[vaaStart + 5];
    const bodyStart = vaaStart + 6 + sigCount * 66;
    await expect(receiver.updatePriceFeeds([flip(btc.binary, bodyStart + 1)])).to.be.revertedWithCustomError(
      receiver,
      'InvalidSignature',
    );
  });

  it('rejects a flipped byte in a price message as a bad Merkle proof', async () => {
    const b = Buffer.from(btc.binary, 'hex');
    const trailing = b[6];
    const vaaStart = 7 + trailing + 1 + 2;
    const vaaLen = b.readUInt16BE(vaaStart - 2);
    const afterVaa = vaaStart + vaaLen; // numUpdates
    const messageStart = afterVaa + 1 + 2; // + msgLen
    // +34: za typem (1) i id (32), czyli pierwszy bajt ceny.
    await expect(receiver.updatePriceFeeds([flip(btc.binary, messageStart + 34)])).to.be.revertedWithCustomError(
      receiver,
      'InvalidMerkleProof',
    );
  });

  it('rejects when quorum is above the number of signatures', async () => {
    const strict = await deploy(4);
    await expect(strict.updatePriceFeeds(['0x' + btc.binary])).to.be.revertedWithCustomError(strict, 'NoQuorum');
  });

  it('rejects a different data source', async () => {
    const other = await deploy(3, signers.guardianSet, '0x' + 'ab'.repeat(32));
    await expect(other.updatePriceFeeds(['0x' + btc.binary])).to.be.revertedWithCustomError(other, 'InvalidDataSource');
  });

  it('rejects a different guardian set index', async () => {
    const other = await deploy(3, signers.guardianSet + 1);
    await expect(other.updatePriceFeeds(['0x' + btc.binary])).to.be.revertedWithCustomError(other, 'WrongGuardianSet');
  });

  it('only the owner can change the guardian set, and quorum must fit', async () => {
    await expect(receiver.connect(stranger).setGuardianSet(GUARDIANS, 3, 1)).to.be.revertedWithCustomError(receiver, 'NotOwner');
    await expect(receiver.setGuardianSet(GUARDIANS, 6, 1)).to.be.revertedWithCustomError(receiver, 'BadQuorum');
    await receiver.setGuardianSet(GUARDIANS, 2, 1);
    expect(await receiver.quorum()).to.equal(2);
    expect(await receiver.guardianCount()).to.equal(GUARDIANS.length);
  });

  it('reads through PythAggregatorAdapter unchanged', async () => {
    await receiver.updatePriceFeeds(['0x' + btc.binary]);
    const adapter = await (
      await ethers.getContractFactory('PythAggregatorAdapter')
    ).deploy(await receiver.getAddress(), btc.id, 10n ** 12n, 'BTC/USD (own receiver)');
    const [, answer] = await adapter.latestRoundData();
    const expo = btc.parsed.price.expo as number;
    const expected = BigInt(btc.parsed.price.price) * 10n ** BigInt(18 + expo);
    expect(answer).to.equal(expected);
  });
});
