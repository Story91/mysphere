// Testy sciezki VANITY: launchVanity + predictVanityToken.
//
// Dowodzi trzech rzeczy, na ktorych stoi feature "wybierz 4 znaki adresu":
//   1. adres, ktory wykopiesz z predictVanityToken, jest DOKLADNIE tym, ktory
//      powstanie przy launchVanity (inaczej kopanie klamie),
//   2. ten sam salt u innego tworcy daje INNY adres - czyli front-run cudzego
//      salta nie zajmuje cudzego adresu (brak griefingu),
//   3. predictVanityToken jest deterministyczny i bezstanowy (da sie kopac).
//
// Uwaga jak w CurveLaunchpad.test.ts: B20 to precompile, wiec tu stoi
// MockB20Factory - to NIE dowodzi semantyki precompile'a, tylko ze launchpad
// liczy launchId i pyta fabryke o adres spojnie po obu stronach.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 40n;
const WINDOW_CAP = ethers.parseEther('16000000');

describe('CurveLaunchpad - vanity', function () {
  this.timeout(120_000);
  let deployer: any, creator: any, other: any, treasury: any;
  let pad: any, tokenFactory: any;

  async function installAt(name: string, address: string) {
    const F = await ethers.getContractFactory(name);
    const d = await F.deploy();
    await d.waitForDeployment();
    const code = await ethers.provider.getCode(await d.getAddress());
    await hre.network.provider.send('hardhat_setCode', [address, code]);
    return F.attach(address);
  }

  async function now() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }

  async function launchVanity(from: any, salt: string) {
    const tx = await pad
      .connect(from)
      .launchVanity(salt, 'Vanity', 'VAN', 0n, (await now()) + 600, FEE_BPS, CREATOR_FEE_BPS, 0, WINDOW_CAP, [from.address], [10000], '');
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l: any) => {
        try {
          return pad.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((l: any) => l && l.name === 'Launched');
    return ev.args[0] as string;
  }

  beforeEach(async function () {
    [deployer, creator, other, treasury] = await ethers.getSigners();
    await installAt('MockB20Factory', B20_FACTORY);
    await installAt('MockPoolManager', POOL_MANAGER);

    const TF = await ethers.getContractFactory('B20TokenFactory');
    tokenFactory = await TF.deploy();
    await tokenFactory.waitForDeployment();

    ({ pad } = await deployLaunchpad({
      deployer,
      feeBps: FEE_BPS,
      creatorFeeBps: CREATOR_FEE_BPS,
      feeRecipient: treasury.address,
      protocolShareBps: 6000,
      tokenFactory: await tokenFactory.getAddress(),
    }));
  });

  it('predictVanityToken zgadza sie z faktycznie wystartowanym adresem', async function () {
    const salt = ethers.zeroPadValue('0x1234', 32);
    const predicted = await pad.predictVanityToken(creator.address, salt);
    const token = await launchVanity(creator, salt);
    expect(token.toLowerCase()).to.equal(predicted.toLowerCase());
  });

  it('ten sam salt, inny tworca => INNY adres (brak kolizji / griefingu)', async function () {
    const salt = ethers.zeroPadValue('0xbeef', 32);
    const forCreator = await pad.predictVanityToken(creator.address, salt);
    const forOther = await pad.predictVanityToken(other.address, salt);
    expect(forCreator.toLowerCase()).to.not.equal(forOther.toLowerCase());

    // Start tworcy laduje pod JEGO przewidzianym adresem, nie cudzym.
    const token = await launchVanity(creator, salt);
    expect(token.toLowerCase()).to.equal(forCreator.toLowerCase());
  });

  it('predictVanityToken jest deterministyczny i oddaje poprawny adres', async function () {
    const salt = ethers.zeroPadValue('0xcafe', 32);
    const a = await pad.predictVanityToken(creator.address, salt);
    const b = await pad.predictVanityToken(creator.address, salt);
    expect(a).to.equal(b);
    expect(ethers.isAddress(a)).to.equal(true);
  });
});
