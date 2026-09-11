const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');

/**
 * PythAggregatorAdapter - Pyth udajacy feed Chainlinka dla DerivativeMarket.
 *
 * Zdania do udowodnienia:
 *  - expo -8 i -5 i 0 wychodza w 18 miejscach, decimals() = 18,
 *  - cena starsza niz MAX_AGE to same zera, nie rewert,
 *  - cena ujemna lub zerowa to same zera,
 *  - swieza cena oddaje publishTime jako updatedAt i roundId,
 *  - nieistniejacy feed rewertuje (tak robi prawdziwy Pyth) - to jedyny
 *    przypadek, w ktorym adapter nie oslania rynku, i test to dokumentuje.
 */
const ID = '0x' + 'ab'.repeat(32);

describe('PythAggregatorAdapter', function () {
  let pyth: any, adapter: any;

  async function now() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }

  beforeEach(async () => {
    pyth = await (await ethers.getContractFactory('MockPyth')).deploy();
    adapter = await (
      await ethers.getContractFactory('PythAggregatorAdapter')
    ).deploy(await pyth.getAddress(), ID, 3600, 'TEST/USD (Pyth)');
  });

  it('rejects zero config', async () => {
    const F = await ethers.getContractFactory('PythAggregatorAdapter');
    await expect(F.deploy(ethers.ZeroAddress, ID, 3600, 'x')).to.be.revertedWithCustomError(F, 'ZeroAddress');
    await expect(F.deploy(await pyth.getAddress(), ethers.ZeroHash, 3600, 'x')).to.be.revertedWithCustomError(F, 'ZeroPriceId');
    await expect(F.deploy(await pyth.getAddress(), ID, 0, 'x')).to.be.revertedWithCustomError(F, 'ZeroMaxAge');
  });

  it('scales expo -8 to 18 decimals', async () => {
    const t = await now();
    await pyth.setPrice(ID, 7678652948677n, -8, t); // 76 786.52948677 USD
    const [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
    expect(await adapter.decimals()).to.equal(18);
    expect(answer).to.equal(ethers.parseEther('76786.52948677'));
    expect(updatedAt).to.equal(t);
    expect(startedAt).to.equal(t);
    expect(roundId).to.equal(t);
    expect(answeredInRound).to.equal(t);
    expect(await adapter.latestAnswer()).to.equal(answer);
  });

  it('scales expo -5 and 0', async () => {
    const t = await now();
    await pyth.setPrice(ID, 123456n, -5, t);
    expect((await adapter.latestRoundData())[1]).to.equal(ethers.parseEther('1.23456'));
    await pyth.setPrice(ID, 42n, 0, t);
    expect((await adapter.latestRoundData())[1]).to.equal(ethers.parseEther('42'));
  });

  it('returns zeros, not a revert, when the price is older than MAX_AGE', async () => {
    const t = await now();
    await pyth.setPrice(ID, 100n * 10n ** 8n, -8, t - 3601);
    const r = await adapter.latestRoundData();
    expect(r[1]).to.equal(0n);
    expect(r[3]).to.equal(0n);
    expect(await adapter.latestAnswer()).to.equal(0n);
  });

  it('returns zeros for a non-positive price', async () => {
    const t = await now();
    await pyth.setPrice(ID, 0n, -8, t);
    expect((await adapter.latestRoundData())[1]).to.equal(0n);
    await pyth.setPrice(ID, -5n, -8, t);
    expect((await adapter.latestRoundData())[1]).to.equal(0n);
  });

  it('a price exactly MAX_AGE old is still fresh', async () => {
    const t = await now();
    // `setPrice` wybija blok o timestamp >= t + 1, wiec cena z t - 3599 ma
    // w chwili odczytu dokladnie MAX_AGE (3600 s) - granica wlacznie.
    await pyth.setPrice(ID, 5n * 10n ** 8n, -8, t - 3599);
    const r = await adapter.latestRoundData();
    expect(r[1] > 0n).to.equal(true);
  });

  it('reverts when the feed does not exist on Pyth (documented, not shielded)', async () => {
    const other = await (
      await ethers.getContractFactory('PythAggregatorAdapter')
    ).deploy(await pyth.getAddress(), '0x' + 'cd'.repeat(32), 3600, 'NONE');
    await expect(other.latestRoundData()).to.be.reverted;
  });
});
