const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');

/**
 * PlainTokenFactory + LaunchToken - sciezka dla sieci BEZ B20 (Robinhood Chain).
 *
 * ===========================================================================
 * CO TEN PLIK MA UDOWODNIC
 * ===========================================================================
 * Jedno zdanie: `ITokenFactory` naprawde jest jedyna roznica miedzy sieciami.
 * Nie „powinno byc", nie „z zalozenia" - ten sam `CurveLaunchpad`, ta sama
 * krzywa, ten sam prog, ten sam hook, druga fabryka, i cala sciezka od startu
 * do puli przechodzi.
 *
 * Gdyby gdziekolwiek w launchpadzie zostalo zalozenie o B20, wywali sie tutaj.
 *
 * ===========================================================================
 * CZEGO NIE DOWODZI
 * ===========================================================================
 * Ze Robinhood Chain ma Uniswap v4 pod adresem, ktory mamy zaszyty. Pons
 * pokazuje na swojej stronie tokena „Market: Uniswap v4", wiec v4 tam jest -
 * ale ADRESU `PoolManager` na tej sieci nikt z nas nie odczytal. To jest
 * osobna rzecz do sprawdzenia przed jakimkolwiek wdrozeniem tam.
 */

const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';

const T0 = ethers.parseEther('1000000000');
const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 40n;
const WINDOW = 300;

describe('PlainTokenFactory (siec bez B20)', function () {
  let deployer: any, creator: any, alice: any, bob: any, treasury: any;
  let pad: any, vault: any, hook: any, factory: any, pm: any;

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

  beforeEach(async function () {
    [deployer, creator, alice, bob, treasury] = await ethers.getSigners();

    // Zadnego B20 pod 0xB20f... - to jest caly sens tej sieci.
    pm = await installAt('MockPoolManager', POOL_MANAGER);

    const F = await ethers.getContractFactory('PlainTokenFactory');
    factory = await F.deploy();
    await factory.waitForDeployment();

    ({ pad, vault, hook } = await deployLaunchpad({
      deployer,
      feeBps: FEE_BPS,
      creatorFeeBps: CREATOR_FEE_BPS,
      feeRecipient: treasury.address,
      protocolShareBps: 6000,
      tokenFactory: await factory.getAddress(),
    }));
  });

  describe('sama fabryka', function () {
    it('token laduje pod adresem, ktory `predictToken` podal WCZESNIEJ', async function () {
      const salt = ethers.id('salt-1');
      const predicted = await factory.predictToken(salt);

      await factory.createToken('Robin', 'RBN', T0, salt, alice.address, creator.address);

      expect(await ethers.provider.getCode(predicted)).to.not.equal('0x');
      const t = await ethers.getContractAt('LaunchToken', predicted);
      expect(await t.name()).to.equal('Robin');
      expect(await t.symbol()).to.equal('RBN');
      expect(await t.decimals()).to.equal(18n);
    });

    it('ten sam salt od DWOCH wolajacych daje dwa rozne adresy', async function () {
      // To jest test na grief, nie na porzadek. Salt launchpada (`launchId`)
      // sklada sie z danych, ktore w tym samym bloku zna kazdy. Dopoki adres
      // wynikal tylko z (fabryka, salt), napastnik mogl wywolac fabryke
      // PIERWSZY z cudzym saltem, zajac adres i wywalic cudzy `launch()` -
      // a `creatorNonce` nie rosnie przy rewercie, wiec grief byl powtarzalny.
      const salt = ethers.id('ten-sam-salt');

      const forAlice = await factory.connect(alice).predictToken(salt);
      const forBob = await factory.connect(bob).predictToken(salt);
      expect(forAlice).to.not.equal(forBob);
      expect(await factory.predictTokenFor(alice.address, salt)).to.equal(forAlice);

      // Napastnik zajmuje SWOJ adres tym saltem...
      await factory.connect(bob).createToken('Grief', 'GRF', T0, salt, bob.address, bob.address);
      expect(await ethers.provider.getCode(forBob)).to.not.equal('0x');

      // ...a ofiara i tak przechodzi, bo jej przestrzen saltow jest inna.
      await factory.connect(alice).createToken('Ofiara', 'OFR', T0, salt, alice.address, alice.address);
      expect(await ethers.provider.getCode(forAlice)).to.not.equal('0x');
    });

    it('cala podaz idzie na jeden adres, a sufit rowna sie podazy', async function () {
      const salt = ethers.id('salt-2');
      const addr = await factory.predictToken(salt);
      await factory.createToken('Robin', 'RBN', T0, salt, alice.address, creator.address);

      const t = await ethers.getContractAt('LaunchToken', addr);
      expect(await t.totalSupply()).to.equal(T0);
      expect(await t.balanceOf(alice.address)).to.equal(T0);
      expect(await t.supplyCap()).to.equal(T0);
    });

    it('adres NIE zalezy od nazwy - konstruktor tokena nie ma argumentow', async function () {
      // Gdyby nazwa wchodzila do kodu tworzacego, `predictToken(salt)` nie
      // dalo by sie w ogole napisac, a dwa tokeny o tej samej nazwie chcialyby
      // ten sam adres.
      const salt = ethers.id('salt-3');
      const predicted = await factory.predictToken(salt);
      await factory.createToken('Zupelnie Inna Nazwa', 'XYZ', T0, salt, bob.address, creator.address);
      expect(await ethers.provider.getCode(predicted)).to.not.equal('0x');
    });

    it('konfiguracja przejsciowa jest kasowana zaraz po utworzeniu', async function () {
      await factory.createToken('Robin', 'RBN', T0, ethers.id('salt-4'), alice.address, creator.address);
      const pending = await factory.pendingConfig();
      expect(pending[0]).to.equal('');
      expect(pending[2]).to.equal(0n);
      expect(pending[3]).to.equal(ethers.ZeroAddress);
    });

    it('ten sam salt drugi raz odbija sie od kolizji CREATE2', async function () {
      const salt = ethers.id('salt-5');
      await factory.createToken('Robin', 'RBN', T0, salt, alice.address, creator.address);
      await expect(
        factory.createToken('Robin', 'RBN', T0, salt, alice.address, creator.address)
      ).to.be.reverted;
    });

    it('zerowa podaz jest odrzucana', async function () {
      await expect(
        factory.createToken('Robin', 'RBN', 0n, ethers.id('salt-6'), alice.address, creator.address)
      ).to.be.revertedWithCustomError(factory, 'ZeroSupply');
    });
  });

  describe('LaunchToken - obietnica przez BRAK KODU', function () {
    let t: any;

    beforeEach(async function () {
      const salt = ethers.id('token');
      await factory.createToken('Robin', 'RBN', T0, salt, alice.address, creator.address);
      t = await ethers.getContractAt('LaunchToken', await factory.predictToken(salt));
    });

    it('nie ma ZADNEJ funkcji, ktora zmienia podaz, wlasciciela albo metadane', async function () {
      const names = Object.keys(t.interface.fragments)
        .map((k: any) => (t.interface.fragments as any)[k])
        .filter((f: any) => f.type === 'function')
        .map((f: any) => f.name);

      for (const banned of [
        'mint',
        'burn',
        'owner',
        'transferOwnership',
        'pause',
        'unpause',
        'blacklist',
        'seize',
        'upgradeTo',
        'setName',
        'grantRole',
        'updateSupplyCap',
      ]) {
        expect(names, banned).to.not.include(banned);
      }
    });

    it('wybicie podazy jest widoczne jako Transfer z adresu zerowego', async function () {
      // Bez tego zdarzenia indekser sumujacy `Transfer` nigdy nie zobaczy,
      // skad wzielo sie pierwsze saldo, i pokaze zerowa liste posiadaczy.
      const logs = await ethers.provider.getLogs({
        address: await t.getAddress(),
        fromBlock: 0,
        topics: [ethers.id('Transfer(address,address,uint256)')],
      });
      expect(logs.length).to.equal(1);
      expect(t.interface.parseLog(logs[0]).args[0]).to.equal(ethers.ZeroAddress);
    });

    it('permit dziala - sprzedaz na krzywej ma isc jedna transakcja, nie dwoma', async function () {
      const spender = bob.address;
      const value = ethers.parseEther('123');
      const deadline = BigInt((await now()) + 3600);

      const signature = await alice.signTypedData(
        {
          name: 'Robin',
          version: '1',
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: await t.getAddress(),
        },
        {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        {
          owner: alice.address,
          spender,
          value,
          nonce: await t.nonces(alice.address),
          deadline,
        }
      );
      const sig = ethers.Signature.from(signature);

      await t.permit(alice.address, spender, value, deadline, sig.v, sig.r, sig.s);
      expect(await t.allowance(alice.address, spender)).to.equal(value);
      expect(await t.nonces(alice.address)).to.equal(1n);
    });

    it('podpis-smiec nie autoryzuje wydatku z adresu zerowego', async function () {
      // `ecrecover` oddaje adres zerowy przy zlym podpisie - bez jawnego
      // warunku bylaby to darmowa autoryzacja.
      await expect(
        t.permit(
          ethers.ZeroAddress,
          bob.address,
          1n,
          BigInt((await now()) + 3600),
          27,
          ethers.ZeroHash,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(t, 'InvalidSigner');
    });
  });

  describe('cala sciezka launchpada na tej fabryce', function () {
    it('start -> kupno -> prog -> awans -> pula z hookiem, bez ani jednego B20', async function () {
      const rc = await (
        await pad.connect(creator).launch('Robin', 'RBN', 0n, (await now()) + 600)
      ).wait();
      const token = rc.logs
        .map((l: any) => {
          try {
            return pad.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((l: any) => l && l.name === 'Launched').args[0];

      const t = await ethers.getContractAt('LaunchToken', token);
      expect(await t.balanceOf(await pad.getAddress())).to.equal(T0);
      expect(await pad.tokenAddressForSalt((await pad.launchOf(token))[5])).to.equal(token);

      await hre.network.provider.send('evm_increaseTime', [WINDOW + 1]);
      await hre.network.provider.send('evm_mine');
      await pad.connect(alice).buy(token, 1n, (await now()) + 600, { value: ethers.parseEther('5') });

      expect((await pad.launchOf(token))[1]).to.equal(2n); // Locked
      await pad.connect(bob).graduate(token);
      expect((await pad.launchOf(token))[1]).to.equal(3n); // Graduated

      // Pula stoi i niesie NASZ hook - dokladnie jak na Base.
      const key = await pad.poolKeyOf(token);
      expect(key[4]).to.equal(await hook.getAddress());
      const pos = await vault.positionOf(token);
      expect(pos[0]).to.equal(
        ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['tuple(address,address,uint24,int24,address)'],
            [[key[0], key[1], key[2], key[3], key[4]]]
          )
        )
      );
      expect(pos[1]).to.be.greaterThan(0n);
    });
  });
});

export {};
