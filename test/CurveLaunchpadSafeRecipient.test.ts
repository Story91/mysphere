// ZLOTY TEST: czy PRAWDZIWY Safe dziala jako immutable FEE_RECIPIENT?
//
// Decyzja (docs/LAUNCHPAD-STAN.md): na mainnecie FEE_RECIPIENT = Gnosis Safe
// 0x83E2...4142F. Adres jest `immutable`, wiec zla decyzja jest nieodwracalna.
// safeRecipientProbe.ts udowodnil, ze Safe przyjmuje SUROWY call{value}(""); ten
// test idzie dalej i przechodzi przez FAKTYCZNE entrypointy kontraktu na forku
// Base mainnet, gdzie stoi PRAWDZIWY bytecode Safe:
//
//   1. ETH: buy na krzywej nalicza protokolowi (=Safe) oplate; claimFor(Safe)
//      wyplaca ja przez _sendEth -> Safe.call{value}(""). Sprawdzamy, ze saldo
//      Safe realnie rosnie i claimable spada do zera.
//   2. TOKEN: transfer ERC20 na Safe laduje (to dokladnie prymityw _safeTransfer,
//      ktorym vault placi tokenowa czesc oplaty po graduacji).
//
// B20 to precompile, ktorego hardhat nie wykonuje, wiec fabryka to MockB20Factory
// (jak w pozostalych testach). PoolManager na forku jest PRAWDZIWY, ale sciezka
// krzywej go nie dotyka - liczy sie tu odbiorca oplaty, nie graduacja.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');

const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const SAFE = '0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F';
const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const FEE_BPS = 100n; // 1%
const CREATOR_FEE_BPS = 70n; // 0.70% tworcy -> 0.30% protokolowi (=Safe)
const PROTOCOL_SHARE_BPS = 3000; // wartosc mainnetowa hooka
const WINDOW_CAP = ethers.parseEther('1000000000');

describe('CurveLaunchpad - Safe jako FEE_RECIPIENT (fork Base mainnet)', function () {
  this.timeout(240_000);
  let deployer: any, creator: any, buyer: any;
  let pad: any, tokenFactory: any;
  let forked = true;

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

  async function launch(from: any) {
    const tx = await pad
      .connect(from)
      .launchAdvanced('SafeFee', 'SAFE', 0n, (await now()) + 600, FEE_BPS, CREATOR_FEE_BPS, 0, WINDOW_CAP, [from.address], [10000], '');
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

  before(async function () {
    try {
      await hre.network.provider.request({
        method: 'hardhat_reset',
        params: [{ forking: { jsonRpcUrl: BASE_RPC } }],
      });
      const code = await ethers.provider.getCode(SAFE);
      if (code === '0x') {
        // Safe nie ma kodu na tym forku - bez tego test nie ma czego dowodzic.
        forked = false;
      }
    } catch {
      forked = false;
    }
  });

  after(async function () {
    // Zdejmij fork, zeby nie zostawic go innym plikom testowym.
    try {
      await hre.network.provider.request({ method: 'hardhat_reset', params: [] });
    } catch {
      /* nic */
    }
  });

  beforeEach(async function () {
    if (!forked) this.skip();
    [deployer, creator, buyer] = await ethers.getSigners();
    await installAt('MockB20Factory', B20_FACTORY);

    const TF = await ethers.getContractFactory('B20TokenFactory');
    tokenFactory = await TF.deploy();
    await tokenFactory.waitForDeployment();

    ({ pad } = await deployLaunchpad({
      deployer,
      feeBps: FEE_BPS,
      creatorFeeBps: CREATOR_FEE_BPS,
      feeRecipient: SAFE,
      protocolShareBps: PROTOCOL_SHARE_BPS,
      tokenFactory: await tokenFactory.getAddress(),
    }));
  });

  it('claimFor(Safe) wyplaca naliczone ETH na PRAWDZIWY Safe', async function () {
    const token = await launch(creator);

    // Kilka zakupow, zeby protokol (=Safe) uzbieral claimable na krzywej.
    for (const eth of ['0.5', '0.3']) {
      await (await pad.connect(buyer).buy(token, 1n, (await now()) + 600, { value: ethers.parseEther(eth) })).wait();
    }

    const claimable = await pad.claimable(SAFE);
    expect(claimable, 'protokol nie uzbieral zadnej oplaty - sprawdz split').to.be.gt(0n);

    const before = await ethers.provider.getBalance(SAFE);
    await (await pad.connect(buyer).claimFor(SAFE)).wait();
    const after = await ethers.provider.getBalance(SAFE);

    expect(after - before).to.equal(claimable);
    expect(await pad.claimable(SAFE)).to.equal(0n);
  });

  it('Safe przyjmuje token ERC20 (prymityw wyplaty tokenowej czesci oplaty)', async function () {
    const token = await launch(creator);
    await (await pad.connect(buyer).buy(token, 1n, (await now()) + 600, { value: ethers.parseEther('0.5') })).wait();

    const erc20 = await ethers.getContractAt('IB20Asset', token);
    const amount = ethers.parseEther('1000');
    const before = await erc20.balanceOf(SAFE);
    await (await erc20.connect(buyer).transfer(SAFE, amount)).wait();
    const after = await erc20.balanceOf(SAFE);

    expect(after - before).to.equal(amount);
  });
});
