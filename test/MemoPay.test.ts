// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w AskEscrow.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');

/**
 * Testy MemoPay.
 *
 * ===========================================================================
 * JAK TESTUJE SIE KONTRAKT OPARTY NA PRECOMPILE'U
 * ===========================================================================
 * B20 nie jest kontraktem - to precompile w oprogramowaniu wezla Base. Na
 * lokalnym EVM nie ma go wcale, a MemoPay ma adres fabryki wpisany jako STALA
 * (bo na Base jest staly).
 *
 * Zamiast robic adres fabryki parametrem konstruktora - co byloby testowaniem
 * innego kontraktu niz ten, ktory wdrozymy - podkladamy bajtkod atrapy POD TEN
 * SAM ADRES przez `hardhat_setCode`. Sciezka wywolania jest wiec identyczna
 * z produkcyjna.
 *
 * `hardhat_setCode` wgrywa sam KOD, bez stanu, wiec atrapa fabryki jest
 * konfigurowana po podlozeniu, przez zwykle wywolania.
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const FEE_BPS = 250; // 2.5% - ta sama stawka co w AskEscrow

describe('MemoPay', function () {
  let payer: any, alice: any, bob: any, treasury: any;
  let token: any, memoPay: any, factory: any;

  /** Podklada atrape fabryki pod adres precompile'a i oddaje jej uchwyt. */
  async function installFactory() {
    const Factory = await ethers.getContractFactory('MockB20Factory');
    const deployed = await Factory.deploy();
    await deployed.waitForDeployment();

    const code = await ethers.provider.getCode(await deployed.getAddress());
    await hre.network.provider.send('hardhat_setCode', [B20_FACTORY, code]);

    return Factory.attach(B20_FACTORY);
  }

  beforeEach(async function () {
    [payer, alice, bob, treasury] = await ethers.getSigners();

    factory = await installFactory();

    const Token = await ethers.getContractFactory('MockB20');
    token = await Token.deploy();
    await token.waitForDeployment();

    const MemoPay = await ethers.getContractFactory('MemoPay');
    memoPay = await MemoPay.deploy(FEE_BPS, treasury.address);
    await memoPay.waitForDeployment();

    await factory.setInitialized(await token.getAddress(), true);
    await token.mint(payer.address, ethers.parseEther('1000'));
    await token.connect(payer).approve(await memoPay.getAddress(), ethers.MaxUint256);
  });

  /* ===================================================================== */
  /*  KONSTRUKTOR                                                           */
  /* ===================================================================== */

  describe('wdrozenie', function () {
    it('odrzuca stawke ponad sufit', async function () {
      const MemoPay = await ethers.getContractFactory('MemoPay');
      await expect(MemoPay.deploy(251, treasury.address)).to.be.revertedWithCustomError(
        memoPay,
        'FeeTooHigh'
      );
    });

    it('odrzuca pusty adres oplaty', async function () {
      const MemoPay = await ethers.getContractFactory('MemoPay');
      await expect(MemoPay.deploy(FEE_BPS, ethers.ZeroAddress)).to.be.revertedWithCustomError(
        memoPay,
        'ZeroAddress'
      );
    });

    it('stawka i odbiorca sa niezmienne', async function () {
      expect(await memoPay.feeBps()).to.equal(FEE_BPS);
      expect(await memoPay.feeRecipient()).to.equal(treasury.address);
      // Brak jakiegokolwiek settera to CECHA, nie przeoczenie - patrz naglowek
      // kontraktu. Gdyby ktos go dopisal, ten test ma zniknac swiadomie.
      expect((memoPay as any).setFeeBps).to.equal(undefined);
    });
  });

  /* ===================================================================== */
  /*  ZOBOWIAZANIE                                                          */
  /* ===================================================================== */

  describe('zobowiazanie', function () {
    it('memo nie zdradza tresci, ale da sie ja udowodnic', async function () {
      const invoiceRef = ethers.encodeBytes32String('FV-2026-011');
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const amount = ethers.parseEther('12');

      const memo = await memoPay.commitment(payer.address, alice.address, amount, invoiceRef, salt);

      // Z samego memo nie wynika nic - to skrot.
      expect(memo).to.not.equal(invoiceRef);
      expect(await memoPay.verify(memo, payer.address, alice.address, amount, invoiceRef, salt)).to
        .equal(true);
    });

    it('zmiana ktoregokolwiek pola unieważnia dowod', async function () {
      const invoiceRef = ethers.encodeBytes32String('FV-2026-011');
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const amount = ethers.parseEther('12');
      const memo = await memoPay.commitment(payer.address, alice.address, amount, invoiceRef, salt);

      expect(await memoPay.verify(memo, payer.address, bob.address, amount, invoiceRef, salt)).to.equal(
        false
      );
      expect(
        await memoPay.verify(memo, payer.address, alice.address, amount + 1n, invoiceRef, salt)
      ).to.equal(false);
      expect(
        await memoPay.verify(
          memo,
          payer.address,
          alice.address,
          amount,
          ethers.encodeBytes32String('FV-2026-012'),
          salt
        )
      ).to.equal(false);
    });

    it('ten sam przedobraz z innym salt daje inne memo', async function () {
      const invoiceRef = ethers.encodeBytes32String('FV-1');
      const amount = ethers.parseEther('1');
      const a = await memoPay.commitment(payer.address, alice.address, amount, invoiceRef, '0x' + '01'.repeat(32));
      const b = await memoPay.commitment(payer.address, alice.address, amount, invoiceRef, '0x' + '02'.repeat(32));
      expect(a).to.not.equal(b);
    });
  });

  /* ===================================================================== */
  /*  PLATNOSC                                                              */
  /* ===================================================================== */

  describe('pay', function () {
    const memo = '0x' + 'ab'.repeat(32);

    it('odbiorca dostaje DOKLADNIE kwote, oplata idzie ponad nia', async function () {
      const amount = ethers.parseEther('100');
      const fee = (amount * BigInt(FEE_BPS)) / 10_000n;

      const before = await token.balanceOf(payer.address);
      await memoPay.connect(payer).pay(await token.getAddress(), alice.address, amount, memo);

      expect(await token.balanceOf(alice.address)).to.equal(amount);
      expect(await token.balanceOf(treasury.address)).to.equal(fee);
      expect(await token.balanceOf(payer.address)).to.equal(before - amount - fee);
    });

    it('kontrakt nie trzyma ani grosza', async function () {
      await memoPay
        .connect(payer)
        .pay(await token.getAddress(), alice.address, ethers.parseEther('10'), memo);
      expect(await token.balanceOf(await memoPay.getAddress())).to.equal(0);
    });

    it('emituje Paid z kwota, oplata i memo', async function () {
      const amount = ethers.parseEther('40');
      const fee = (amount * BigInt(FEE_BPS)) / 10_000n;

      await expect(memoPay.connect(payer).pay(await token.getAddress(), alice.address, amount, memo))
        .to.emit(memoPay, 'Paid')
        .withArgs(await token.getAddress(), payer.address, alice.address, amount, fee, memo);
    });

    it('token emituje Memo z WOLAJACYM, nie placacym', async function () {
      // To nie jest ciekawostka: na tym opiera sie decyzja, zeby MemoPay
      // emitowal wlasne `Paid`. Gdyby `Memo` niosl placacego, byloby zbedne.
      await expect(
        memoPay.connect(payer).pay(await token.getAddress(), alice.address, ethers.parseEther('5'), memo)
      )
        .to.emit(token, 'Memo')
        .withArgs(await memoPay.getAddress(), memo);
    });

    it('przy stawce zerowej nie ma przelewu oplaty', async function () {
      const MemoPay = await ethers.getContractFactory('MemoPay');
      const free = await MemoPay.deploy(0, treasury.address);
      await free.waitForDeployment();
      await token.connect(payer).approve(await free.getAddress(), ethers.MaxUint256);

      const amount = ethers.parseEther('7');
      await free.connect(payer).pay(await token.getAddress(), alice.address, amount, memo);

      expect(await token.balanceOf(alice.address)).to.equal(amount);
      expect(await token.balanceOf(treasury.address)).to.equal(0);
    });

    it('odrzuca pusty adres i zerowa kwote', async function () {
      await expect(
        memoPay.connect(payer).pay(await token.getAddress(), ethers.ZeroAddress, 1, memo)
      ).to.be.revertedWithCustomError(memoPay, 'ZeroAddress');

      await expect(
        memoPay.connect(payer).pay(await token.getAddress(), alice.address, 0, memo)
      ).to.be.revertedWithCustomError(memoPay, 'ZeroAmount');
    });

    it('odrzuca token, ktory nie jest zainicjalizowanym B20', async function () {
      const Token = await ethers.getContractFactory('MockB20');
      const obcy = await Token.deploy();
      await obcy.waitForDeployment();
      // Celowo NIE rejestrujemy go w fabryce.

      await expect(
        memoPay.connect(payer).pay(await obcy.getAddress(), alice.address, 1, memo)
      ).to.be.revertedWithCustomError(memoPay, 'NotB20');
    });

    it('odrzuca adres bez kodu, mimo ze EVM przepuscilby wywolanie', async function () {
      // Bez bramki `isB20Initialized` wywolanie pustego adresu zwraca sukces,
      // a `Paid` twierdziloby, ze pieniadze poszly.
      const pusty = '0x000000000000000000000000000000000000dEaD';
      await expect(
        memoPay.connect(payer).pay(pusty, alice.address, 1, memo)
      ).to.be.revertedWithCustomError(memoPay, 'NotB20');
    });

    it('odrzuca token oddajacy false zamiast rewertowac', async function () {
      await token.setReturnsFalse(true);
      await expect(
        memoPay.connect(payer).pay(await token.getAddress(), alice.address, 1, memo)
      ).to.be.revertedWithCustomError(memoPay, 'TransferRejected');
    });

    it('brak allowance przewraca cala platnosc, nie polowe', async function () {
      await token.connect(payer).approve(await memoPay.getAddress(), 0);
      await expect(
        memoPay.connect(payer).pay(await token.getAddress(), alice.address, ethers.parseEther('1'), memo)
      ).to.be.reverted;
      expect(await token.balanceOf(alice.address)).to.equal(0);
      expect(await token.balanceOf(treasury.address)).to.equal(0);
    });

    it('niedobor na oplacie cofa TAKZE przelew do odbiorcy', async function () {
      // Wprost sprawdzamy to, co mowi komentarz w kontrakcie: atomowosc, a nie
      // ochrona odbiorcy przez kolejnosc.
      const [, , , , ubogi] = await ethers.getSigners();
      const amount = ethers.parseEther('10');
      await token.mint(ubogi.address, amount); // dokladnie tyle, bez oplaty
      await token.connect(ubogi).approve(await memoPay.getAddress(), ethers.MaxUint256);

      await expect(
        memoPay.connect(ubogi).pay(await token.getAddress(), alice.address, amount, memo)
      ).to.be.reverted;
      expect(await token.balanceOf(alice.address)).to.equal(0);
    });
  });

  /* ===================================================================== */
  /*  PERMIT                                                                */
  /* ===================================================================== */

  describe('payWithPermit', function () {
    const memo = '0x' + 'cd'.repeat(32);

    it('placi bez wczesniejszego approve', async function () {
      const [, , , , , swiezy] = await ethers.getSigners();
      const amount = ethers.parseEther('20');
      await token.mint(swiezy.address, ethers.parseEther('100'));
      // Zero allowance na starcie - permit ma je zalozyc.
      expect(await token.allowance(swiezy.address, await memoPay.getAddress())).to.equal(0);

      // Termin liczony z ZEGARA LANCUCHA, nie komputera. Testy AskEscrow
      // przewijaja czas w tej samej sieci w pamieci, wiec `Date.now()` bywa
      // GLEBOKO w przeszlosci wzgledem bloku - podpis bylby przeterminowany
      // w chwili powstania, a `permit` w try/catch polknalby ten blad po
      // cichu i platnosc padlaby dopiero na braku allowance.
      const deadline = (await ethers.provider.getBlock('latest')).timestamp + 3600;
      await memoPay
        .connect(swiezy)
        .payWithPermit(
          await token.getAddress(),
          alice.address,
          amount,
          memo,
          deadline,
          27,
          ethers.ZeroHash,
          ethers.ZeroHash
        );

      expect(await token.balanceOf(alice.address)).to.equal(amount);
    });

    it('nieudany permit nie przewraca platnosci, gdy allowance juz jest', async function () {
      // Znany wyscig: ktos zuzyl podpis przed nami. Allowance i tak istnieje,
      // wiec platnosc ma przejsc - to dlatego permit jest w try/catch.
      await token.setPermitReverts(true);
      const amount = ethers.parseEther('3');
      // Termin liczony z ZEGARA LANCUCHA, nie komputera. Testy AskEscrow
      // przewijaja czas w tej samej sieci w pamieci, wiec `Date.now()` bywa
      // GLEBOKO w przeszlosci wzgledem bloku - podpis bylby przeterminowany
      // w chwili powstania, a `permit` w try/catch polknalby ten blad po
      // cichu i platnosc padlaby dopiero na braku allowance.
      const deadline = (await ethers.provider.getBlock('latest')).timestamp + 3600;

      await memoPay
        .connect(payer)
        .payWithPermit(
          await token.getAddress(),
          alice.address,
          amount,
          memo,
          deadline,
          27,
          ethers.ZeroHash,
          ethers.ZeroHash
        );

      expect(await token.balanceOf(alice.address)).to.equal(amount);
    });
  });

  /* ===================================================================== */
  /*  PACZKA                                                                */
  /* ===================================================================== */

  describe('paySplit', function () {
    const memo = '0x' + 'ef'.repeat(32);

    it('placi wielu odbiorcom pod jednym memo', async function () {
      const a = ethers.parseEther('10');
      const b = ethers.parseEther('30');
      const fee = ((a + b) * BigInt(FEE_BPS)) / 10_000n;

      await memoPay
        .connect(payer)
        .paySplit(await token.getAddress(), [alice.address, bob.address], [a, b], memo);

      expect(await token.balanceOf(alice.address)).to.equal(a);
      expect(await token.balanceOf(bob.address)).to.equal(b);
      expect(await token.balanceOf(treasury.address)).to.equal(fee);
    });

    it('oplata liczona od SUMY, a nie od kazdej pozycji', async function () {
      // Trzy pozycje, na ktorych zaokraglenie w dol per pozycja zgubiloby grosze.
      const kwoty = [333n, 333n, 334n];
      const suma = 1000n;
      await memoPay
        .connect(payer)
        .paySplit(
          await token.getAddress(),
          [alice.address, bob.address, treasury.address],
          kwoty,
          memo
        );

      const oplata = (suma * BigInt(FEE_BPS)) / 10_000n;
      // treasury dostaje wlasna pozycje 334 plus oplate od sumy
      expect(await token.balanceOf(treasury.address)).to.equal(334n + oplata);
    });

    it('emituje PaidBatch z liczba odbiorcow i suma', async function () {
      const a = ethers.parseEther('1');
      const b = ethers.parseEther('2');
      const suma = a + b;
      const fee = (suma * BigInt(FEE_BPS)) / 10_000n;

      await expect(
        memoPay.connect(payer).paySplit(await token.getAddress(), [alice.address, bob.address], [a, b], memo)
      )
        .to.emit(memoPay, 'PaidBatch')
        .withArgs(await token.getAddress(), payer.address, memo, 2, suma, fee);
    });

    it('odrzuca niezgodne dlugosci, pusta liste i przekroczony sufit', async function () {
      await expect(
        memoPay.connect(payer).paySplit(await token.getAddress(), [alice.address], [1, 2], memo)
      ).to.be.revertedWithCustomError(memoPay, 'LengthMismatch');

      await expect(
        memoPay.connect(payer).paySplit(await token.getAddress(), [], [], memo)
      ).to.be.revertedWithCustomError(memoPay, 'NoRecipients');

      const duzo = new Array(101).fill(alice.address);
      const jedynki = new Array(101).fill(1);
      await expect(
        memoPay.connect(payer).paySplit(await token.getAddress(), duzo, jedynki, memo)
      ).to.be.revertedWithCustomError(memoPay, 'TooManyRecipients');
    });

    it('jedna zerowa pozycja przewraca cala paczke', async function () {
      await expect(
        memoPay
          .connect(payer)
          .paySplit(await token.getAddress(), [alice.address, bob.address], [ethers.parseEther('1'), 0], memo)
      ).to.be.revertedWithCustomError(memoPay, 'ZeroAmount');

      // Nic nie przeszlo - paczka jest wszystkim albo niczym.
      expect(await token.balanceOf(alice.address)).to.equal(0);
    });
  });
});
