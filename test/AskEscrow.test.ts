// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS. Import nazwany (`import { ethers } from 'hardhat'`) wywala
// sie na interopie ESM - stad ta forma.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

/**
 * Testy AskEscrow.
 *
 * === JAK SIE TO TESTUJE, ZANIM DOTKNIE PRAWDZIWYCH PIENIEDZY ===
 * Trzy poziomy, w tej kolejnosci:
 *
 *   1. TEN PLIK - siec hardhat w pamieci. Zero kosztu, zero czekania, pelna
 *      kontrola nad zegarem (`time.increase`). Tu sprawdzamy REGULY.
 *   2. Base Sepolia - prawdziwa siec, darmowy ETH z faucetu. Tu wychodza
 *      rzeczy, ktorych symulacja nie widzi: limity gazu, zachowanie
 *      prawdziwego kontraktu USDC, czas bloku.
 *   3. Mainnet - dopiero gdy 1 i 2 sa czyste.
 *
 * Ten plik to poziom 1. Nie wymaga ani grosza i uruchamia sie w sekundy:
 *     npx hardhat test
 *
 * === CO TESTUJEMY W PIERWSZEJ KOLEJNOSCI ===
 * NIE sciezke szczescliwa. Sciezka szczescliwa dziala prawie zawsze - to
 * sciezki wrogie zabieraja ludziom pieniadze. Dlatego pierwszy blok ponizej
 * odtwarza atak znaleziony w przegladzie adwersarialnym, a dopiero potem
 * sprawdzamy, ze uczciwy przypadek nadal przechodzi.
 */

const USDC_DECIMALS = 6;
const usdc = (n: number) => BigInt(Math.round(n * 10 ** USDC_DECIMALS));

/** Minimalny token z EIP-20 na potrzeby testu - bez zaleznosci zewnetrznych. */
const MOCK_TOKEN_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract MockUSDC {
    string public name = "Mock USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(balanceOf[f] >= a, "balance");
        require(allowance[f][msg.sender] >= a, "allowance");
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}
`;

describe('AskEscrow', () => {
  const ASK_ID = ethers.keccak256(ethers.toUtf8Bytes('ask-1'));
  const REF_1 = ethers.keccak256(ethers.toUtf8Bytes('answer-1'));
  const REF_2 = ethers.keccak256(ethers.toUtf8Bytes('answer-2'));

  async function deploy() {
    const [author, alice, bob, feeRecipient] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('MockUSDC');
    const token = await Token.deploy();
    await token.waitForDeployment();

    // Oplata 2,5% - w granicach MAX_FEE_BPS (500 = 5%). Podana jawnie, zeby
    // test liczyl na TEJ stawce, a nie na domyslnej, ktora moze sie zmienic.
    const Escrow = await ethers.getContractFactory('AskEscrow');
    const escrow = await Escrow.deploy(await token.getAddress(), feeRecipient.address, 250);
    await escrow.waitForDeployment();

    // Autor ma z czego finansowac.
    await token.mint(author.address, usdc(1000));
    await token.connect(author).approve(await escrow.getAddress(), usdc(1000));

    return { escrow, token, author, alice, bob, feeRecipient };
  }

  /** Ask na 5 miejsc po 2 USDC, termin za dobe. */
  async function fundedAsk() {
    const ctx = await deploy();
    const deadline = (await time.latest()) + 24 * 60 * 60;
    await ctx.escrow.connect(ctx.author).fund(ASK_ID, usdc(2), 5, deadline);
    return { ...ctx, deadline };
  }

  // ================================================================
  // 1. LUKA KRYTYCZNA Z PRZEGLADU ADWERSARIALNEGO
  // ================================================================
  describe('wczesne rozstrzygniecie', () => {
    it('NIE pozwala autorowi odzyskac niewykorzystanych miejsc przed terminem', async () => {
      // To jest DOKLADNIE atak z przegladu: autor finansuje, czeka na
      // odpowiedzi, a potem zamyka Aska jednym zwyciezca i zabiera reszte.
      const { escrow, author, alice } = await fundedAsk();

      await expect(
        escrow.connect(author).resolve(ASK_ID, [alice.address], [REF_1])
      ).to.be.revertedWithCustomError(escrow, 'EarlyResolveMustFillSeats');
    });

    it('POZWALA zamknac wczesnie, gdy kazde miejsce jest wypelnione', async () => {
      // Przypadek uczciwy: Ask dostal komplet dobrych odpowiedzi w godzine.
      // Nic nie wraca do autora, wiec nie ma czego odzyskac - i nie ma powodu
      // kazac ludziom czekac do terminu.
      const ctx = await deploy();
      const deadline = (await time.latest()) + 24 * 60 * 60;
      const askTwo = ethers.keccak256(ethers.toUtf8Bytes('ask-2'));
      await ctx.escrow.connect(ctx.author).fund(askTwo, usdc(2), 2, deadline);

      await expect(
        ctx.escrow
          .connect(ctx.author)
          .resolve(askTwo, [ctx.alice.address, ctx.bob.address], [REF_1, REF_2])
      ).to.not.be.reverted;

      expect(await ctx.escrow.claimable(ctx.alice.address)).to.equal(usdc(2));
      expect(await ctx.escrow.claimable(ctx.bob.address)).to.equal(usdc(2));
      // Komplet miejsc: autorowi nie wraca nic.
      expect(await ctx.escrow.claimable(ctx.author.address)).to.equal(0n);
    });
  });

  // ================================================================
  // 2. OPLATA - druga polowa naprawy
  // ================================================================
  describe('oplata przy zwrocie', () => {
    it('pobiera oplate od zwrotu takze przy rozstrzygnieciu, nie tylko przy wygasnieciu', async () => {
      // Bez tego wycofanie pieniedzy przez resolve byloby TANSZE niz przez
      // wygasniecie, wiec oplacaloby sie przyjac jedna odpowiedz i skonczyc.
      const { escrow, author, alice, feeRecipient, deadline } = await fundedAsk();

      // Po terminie wolno rozstrzygnac czesciowo.
      await time.increaseTo(deadline + 1);
      await escrow.connect(author).resolve(ASK_ID, [alice.address], [REF_1]);

      const feeBps = await escrow.FEE_BPS();
      const refund = usdc(2) * 4n; // 4 niewykorzystane miejsca
      const expectedFee = (refund * feeBps) / 10_000n;

      expect(await escrow.claimable(alice.address)).to.equal(usdc(2));
      expect(await escrow.claimable(feeRecipient.address)).to.equal(expectedFee);
      expect(await escrow.claimable(author.address)).to.equal(refund - expectedFee);
    });

    it('nie gubi ani jednej jednostki - suma przypisan rowna sie budzetowi', async () => {
      const { escrow, author, alice, feeRecipient, deadline } = await fundedAsk();
      await time.increaseTo(deadline + 1);
      await escrow.connect(author).resolve(ASK_ID, [alice.address], [REF_1]);

      const suma =
        (await escrow.claimable(alice.address)) +
        (await escrow.claimable(author.address)) +
        (await escrow.claimable(feeRecipient.address));

      // 5 miejsc * 2 USDC = 10 USDC, co do jednostki.
      expect(suma).to.equal(usdc(10));
    });
  });

  // ================================================================
  // 3. POZOSTALE BRAMKI
  // ================================================================
  describe('bramki', () => {
    it('nie pozwala rozstrzygnac nikomu poza autorem', async () => {
      const { escrow, alice } = await fundedAsk();
      // Klucz odtwarzany z msg.sender - obcy nie ma wpisu, wiec dla niego
      // Ask nie istnieje.
      await expect(
        escrow.connect(alice).resolve(ASK_ID, [alice.address], [REF_1])
      ).to.be.revertedWithCustomError(escrow, 'NotOpen');
    });

    it('nie pozwala autorowi zaplacic samemu sobie', async () => {
      const { escrow, author, deadline } = await fundedAsk();
      await time.increaseTo(deadline + 1);
      await expect(
        escrow.connect(author).resolve(ASK_ID, [author.address], [REF_1])
      ).to.be.revertedWithCustomError(escrow, 'InvalidWinner');
    });

    it('wymaga dowodu przy kazdej wyplacie', async () => {
      const { escrow, author, alice, deadline } = await fundedAsk();
      await time.increaseTo(deadline + 1);
      await expect(
        escrow.connect(author).resolve(ASK_ID, [alice.address], [ethers.ZeroHash])
      ).to.be.revertedWithCustomError(escrow, 'MissingAnswerRef');
    });

    it('rozstrzygniecie jest terminalne - drugi raz sie nie da', async () => {
      const { escrow, author, alice, deadline } = await fundedAsk();
      await time.increaseTo(deadline + 1);
      await escrow.connect(author).resolve(ASK_ID, [alice.address], [REF_1]);
      await expect(
        escrow.connect(author).resolve(ASK_ID, [alice.address], [REF_2])
      ).to.be.revertedWithCustomError(escrow, 'NotOpen');
    });

    it('odbior przenosi tokeny i zeruje saldo', async () => {
      const { escrow, token, author, alice, deadline } = await fundedAsk();
      await time.increaseTo(deadline + 1);
      await escrow.connect(author).resolve(ASK_ID, [alice.address], [REF_1]);

      await escrow.connect(alice).claim();
      expect(await token.balanceOf(alice.address)).to.equal(usdc(2));
      expect(await escrow.claimable(alice.address)).to.equal(0n);
    });
  });
});
