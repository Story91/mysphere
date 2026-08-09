const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');

/**
 * B20LaunchHook - brama do puli i udzial w kazdej wymianie.
 *
 * ===========================================================================
 * CZEGO TE TESTY NIE DOWODZA - PRZECZYTAJ, ZANIM UZNASZ JE ZA ZIELONE SWIATLO
 * ===========================================================================
 * `MockPoolManager` wola hooka w tych samych miejscach co oryginal i sprawdza
 * selektory, ale NIE JEST Uniswapem. W szczegolnosci nie odwzorowuje ksiegowosci
 * delt per ADRES - ma jeden licznik na walute, w ktorym uznanie hooka i jego
 * `take` wzajemnie sie znosza.
 *
 * Skutek jest konkretny i trzeba go nazwac: te testy sprawdzaja ARYTMETYKE
 * hooka (od czego liczy oplate, po ktorej stronie ja bierze, jak dzieli) oraz
 * BRAME. NIE dowodza, ze ZNAK zwracanej delty jest ten, ktorego oczekuje
 * prawdziwy v4. To jest punkt §6.1 z `docs/B20-DECYZJA-BEZ-KRZYWEJ.md`
 * i zamyka go wylacznie test na forku Base z prawdziwym PoolManagerem.
 *
 * Kierunek bledu jest przy tym bezpieczny: zly znak nie kradnie pieniedzy,
 * tylko wywala wymiane na `CurrencyNotSettled`.
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';

const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 40n;
const PROTOCOL_SHARE_BPS = 6000n;
const HOOK_FEE_BPS = 100n;
const WINDOW = 300;

/** Ta sama regula, co w kontrakcie: oplata W GORE, na niekorzysc wolajacego. */
function feeOf(amount: bigint) {
  return (amount * HOOK_FEE_BPS + 9999n) / 10000n;
}

describe('B20LaunchHook', function () {
  let deployer: any, creator: any, alice: any, bob: any, treasury: any;
  let pad: any, vault: any, hook: any, tokenFactory: any, pm: any;
  let token: string, t: any, key: any, probe: any;

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

  function plain(k: any) {
    return [k[0], k[1], k[2], k[3], k[4]];
  }

  beforeEach(async function () {
    [deployer, creator, alice, bob, treasury] = await ethers.getSigners();

    await installAt('MockB20Factory', B20_FACTORY);
    pm = await installAt('MockPoolManager', POOL_MANAGER);

    const TF = await ethers.getContractFactory('B20TokenFactory');
    tokenFactory = await TF.deploy();
    await tokenFactory.waitForDeployment();

    ({ pad, vault, hook } = await deployLaunchpad({
      deployer,
      feeBps: FEE_BPS,
      creatorFeeBps: CREATOR_FEE_BPS,
      feeRecipient: treasury.address,
      protocolShareBps: PROTOCOL_SHARE_BPS,
      tokenFactory: await tokenFactory.getAddress(),
    }));

    // Pelna sciezka do puli: start -> kupno ponad prog -> awans.
    const rc = await (
      await pad.connect(creator).launch('Hooked', 'HOOK', 0n, (await now()) + 600)
    ).wait();
    token = rc.logs
      .map((l: any) => {
        try {
          return pad.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((l: any) => l && l.name === 'Launched').args[0];

    t = await ethers.getContractAt('MockB20', token);
    await hre.network.provider.send('evm_increaseTime', [WINDOW + 1]);
    await hre.network.provider.send('evm_mine');
    await pad.connect(alice).buy(token, 1n, (await now()) + 600, { value: ethers.parseEther('5') });
    await pad.connect(bob).graduate(token);

    key = await pad.poolKeyOf(token);

    const SP = await ethers.getContractFactory('SwapProbe');
    probe = await SP.deploy();
    await probe.waitForDeployment();
  });

  /* ===================================================================== */
  /*  BRAMA                                                                 */
  /* ===================================================================== */

  describe('brama', function () {
    it('pule z tym hookiem otwiera WYLACZNIE vault', async function () {
      // Inny token, zeby pula jeszcze nie istniala.
      const otherKey = [key[0], alice.address, key[2], key[3], key[4]];
      await expect(pm.connect(alice).initialize(otherKey, 1n << 96n)).to.be.revertedWithCustomError(
        hook,
        'NotVault'
      );
    });

    it('odrzuca pule o zlym ksztalcie, nawet gdy wola ja VAULT', async function () {
      // Pierwsza wersja tego testu wysylala `initialize` z adresu Alice
      // i asertowala `NotVault` - czyli nosila nazwe o ksztalcie puli,
      // a sprawdzala brame. Zielony test, ktory nie bada tego, co ma
      // w nazwie, jest gorszy niz jego brak.
      //
      // Zeby dosiegnac warunku ksztaltu, trzeba przejsc brame, czyli byc
      // vaultem, i wejsc od strony PoolManagera. W produkcji ta sciezka nie
      // jest osiagalna - vault zawsze buduje klucz sam i buduje go poprawnie.
      // Warunek jest wiec obrona w glab, a ten test pokazuje, ze potrafi odpasc.
      const vaultAddr = await vault.getAddress();
      await hre.network.provider.send('hardhat_impersonateAccount', [POOL_MANAGER]);
      await hre.network.provider.send('hardhat_setBalance', [POOL_MANAGER, '0xde0b6b3a7640000']);
      const asPm = await ethers.getSigner(POOL_MANAGER);

      // currency0 musi byc natywnym ETH - od tego zalezy, ktory akumulator
      // hooka dostaje pieniadze.
      const badCurrency0 = [alice.address, key[1], key[2], key[3], key[4]];
      await expect(
        hook.connect(asPm).beforeInitialize(vaultAddr, badCurrency0, 1n << 96n)
      ).to.be.revertedWithCustomError(hook, 'BadPoolShape');

      // ...i hook w kluczu musi byc TYM hookiem.
      const badHook = [key[0], key[1], key[2], key[3], alice.address];
      await expect(
        hook.connect(asPm).beforeInitialize(vaultAddr, badHook, 1n << 96n)
      ).to.be.revertedWithCustomError(hook, 'BadPoolShape');

      // Kontrola dodatnia: poprawny ksztalt od vaulta przechodzi.
      await hook.connect(asPm).beforeInitialize(vaultAddr, plain(key), 1n << 96n);

      await hre.network.provider.send('hardhat_stopImpersonatingAccount', [POOL_MANAGER]);
    });

    it('nikt poza PoolManagerem nie zawola wywolan zwrotnych', async function () {
      await expect(
        hook.connect(alice).beforeInitialize(await vault.getAddress(), plain(key), 1n << 96n)
      ).to.be.revertedWithCustomError(hook, 'NotPoolManager');

      await expect(
        hook.connect(alice).afterSwap(alice.address, plain(key), [true, -1n, 0n], 0n, '0x')
      ).to.be.revertedWithCustomError(hook, 'NotPoolManager');
    });

    it('pula NASZEGO tokena naprawde istnieje i ma nasz hook w kluczu', async function () {
      expect(key[4]).to.equal(await hook.getAddress());
      const pos = await vault.positionOf(token);
      expect(pos[1]).to.be.greaterThan(0n);
    });
  });

  /* ===================================================================== */
  /*  UDZIAL W WYMIANIE                                                     */
  /* ===================================================================== */

  describe('udzial w wymianie', function () {
    it('exactInput ETH->token: oplata schodzi z TOKENA, ktory dostaje kupujacy', async function () {
      const out = ethers.parseEther('1000');
      await pm.setNextCounterAmount(out);

      const inEth = ethers.parseEther('0.01');
      await probe.doSwap(plain(key), [true, -inEth, 0n], { value: inEth });

      const fee = feeOf(out);
      expect(await hook.pendingToken(token)).to.equal(fee);
      expect(await hook.pendingEth(token)).to.equal(0n);
      // Kupujacy dostal o oplate MNIEJ - to on ja placi, nie pula.
      expect(await t.balanceOf(await probe.getAddress())).to.equal(out - fee);
      expect(await t.balanceOf(await hook.getAddress())).to.equal(fee);
    });

    it('exactInput token->ETH: oplata schodzi z ETH, ktore dostaje sprzedajacy', async function () {
      const inTok = ethers.parseEther('1000');
      const out = ethers.parseEther('0.01');
      await pm.setNextCounterAmount(out);

      // Sonda musi miec czym zaplacic.
      await t.mint(await probe.getAddress(), inTok);
      await probe.doSwap(plain(key), [false, -inTok, 0n], {});

      const fee = feeOf(out);
      expect(await hook.pendingEth(token)).to.equal(fee);
      expect(await hook.pendingToken(token)).to.equal(0n);
      expect(await ethers.provider.getBalance(await hook.getAddress())).to.equal(fee);
      expect(await ethers.provider.getBalance(await probe.getAddress())).to.equal(out - fee);
    });

    it('exactOutput: oplata schodzi z WEJSCIA, czyli kupujacy placi wiecej', async function () {
      // Chce dokladnie tyle tokena; ile ETH trzeba - liczy pula (tu: atrapa).
      const wantTok = ethers.parseEther('1000');
      const needEth = ethers.parseEther('0.01');
      await pm.setNextCounterAmount(needEth);

      const fee = feeOf(needEth);
      // Placi `needEth`, a oplata jest DODATKOWO po tej samej stronie.
      await probe.doSwap(plain(key), [true, wantTok, 0n], { value: needEth + fee });

      expect(await hook.pendingEth(token)).to.equal(fee);
      expect(await t.balanceOf(await probe.getAddress())).to.equal(wantTok);
    });

    it('wymiana o zerowym przeplywie nie tworzy oplaty z niczego', async function () {
      await pm.setNextCounterAmount(0n);
      await probe.doSwap(plain(key), [true, -1000n, 0n], { value: 1000n });
      expect(await hook.pendingEth(token)).to.equal(0n);
      expect(await hook.pendingToken(token)).to.equal(0n);
    });
  });

  /* ===================================================================== */
  /*  PODZIAL I ODBIOR                                                      */
  /* ===================================================================== */

  describe('podzial i odbior', function () {
    beforeEach(async function () {
      const out = ethers.parseEther('1000');
      await pm.setNextCounterAmount(out);
      const inEth = ethers.parseEther('0.01');
      await probe.doSwap(plain(key), [true, -inEth, 0n], { value: inEth });
    });

    it('dzieli zebrane 60/40, a pyl z dzielenia idzie do TWORCY', async function () {
      const pending: bigint = await hook.pendingToken(token);
      expect(pending).to.be.greaterThan(0n);

      await expect(hook.connect(alice).settle(token)).to.emit(hook, 'HookFeeSettled');

      const proto = (pending * PROTOCOL_SHARE_BPS) / 10000n;
      expect(await hook.claimableToken(token, treasury.address)).to.equal(proto);
      expect(await hook.claimableToken(token, creator.address)).to.equal(pending - proto);
      // Obie nogi sumuja sie do calosci CO DO WEI - nie gubimy pyla i nie tworzymy go.
      expect(
        (await hook.claimableToken(token, treasury.address)) +
          (await hook.claimableToken(token, creator.address))
      ).to.equal(pending);

      expect(await hook.pendingToken(token)).to.equal(0n);
      await expect(hook.settle(token)).to.be.revertedWithCustomError(hook, 'NothingToSettle');
    });

    it('wyplata jest pullem i ktokolwiek moze zaplacic za nia gaz', async function () {
      await hook.settle(token);
      const due: bigint = await hook.claimableToken(token, creator.address);

      const before: bigint = await t.balanceOf(creator.address);
      await hook.connect(bob).claimTokenFor(token, creator.address);
      expect((await t.balanceOf(creator.address)) - before).to.equal(due);

      await expect(
        hook.connect(bob).claimTokenFor(token, creator.address)
      ).to.be.revertedWithCustomError(hook, 'NothingToClaim');
    });

    it('tworca czytany jest z vaulta, wiec obcy token nie ma czego rozdzielic', async function () {
      await expect(hook.settle(alice.address)).to.be.revertedWithCustomError(
        hook,
        'NothingToSettle'
      );
    });

    it('hook nie ma settera ani drogi wyjscia dla nikogo innego', async function () {
      const fns = Object.keys(hook.interface.fragments)
        .map((k: any) => (hook.interface.fragments as any)[k])
        .filter((f: any) => f.type === 'function')
        .map((f: any) => f.name);
      for (const banned of [
        'setFee',
        'setFeeRecipient',
        'setVault',
        'pause',
        'withdraw',
        'rescue',
        'sweep',
      ]) {
        expect(fns).to.not.include(banned);
      }
    });
  });
});

export {};
