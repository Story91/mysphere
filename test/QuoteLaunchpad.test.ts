export {};

const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');

/**
 * LAUNCHPAD Q NA PRAWDZIWYM POOLMANAGERZE V4.
 *
 * Kazdy test idzie dwa razy: z QUOTE jako currency0 i jako currency1. To jest
 * jedyna rzecz, ktorej wersja ETH nigdy nie musiala robic (ETH ma adres 0x0),
 * i jedyne miejsce, w ktorym blad orientacji wyszedlby dopiero przy pierwszym
 * awansie na mainnecie - z cena puli odwrocona o kilkanascie rzedow wielkosci.
 *
 * PoolManager jest prawdziwy (@uniswap/v4-core z contracts/vendor), wiec znak
 * delty hooka, rozliczenie ERC-20 (sync -> transfer -> settle) i matematyka
 * plynnosci sa sprawdzane na oryginale, a nie na atrapie.
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const DEAD = '0x000000000000000000000000000000000000dEaD';
const HOOK_ALL_MASK = (1n << 14n) - 1n;
const HOOK_REQUIRED_FLAGS = (1n << 13n) | (1n << 6n) | (1n << 2n);

const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 70n;
const PROTOCOL_SHARE_BPS = 3000n;
const DECIMALS = 6;
const UNIT = 10n ** BigInt(DECIMALS);
const R_VIRT = 2500n * UNIT; // zbiorka 4 * R = 10 000 "USDC"
const T0 = 1_000_000_000n * 10n ** 18n;
const T_MIN = 200_000_000n * 10n ** 18n;
const Q96 = 1n << 96n;
const MIN_SQRT = 4295128739n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n;

function plain(k: any) {
  return [k[0], k[1], k[2], k[3], k[4]];
}

for (const orientation of ['quote-currency0', 'quote-currency1'] as const) {
  describe(`Launchpad Q (${orientation})`, function () {
    this.timeout(300_000);

    let deployer: any, creator: any, alice: any, bob: any, treasury: any, carol: any;
    let pm: any, quote: any, tokenFactory: any, pad: any, vault: any, hook: any, probe: any;

    async function now() {
      return (await ethers.provider.getBlock('latest')).timestamp;
    }

    async function deadline() {
      return (await now()) + 3600;
    }

    async function installAt(name: string, address: string) {
      const F = await ethers.getContractFactory(name);
      const d = await F.deploy();
      await d.waitForDeployment();
      const code = await ethers.provider.getCode(await d.getAddress());
      await hre.network.provider.send('hardhat_setCode', [address, code]);
      return F.attach(address);
    }

    /**
     * QUOTE pod adresem z pierwszym bajtem 0x00 albo 0xff - wtedy prawie kazdy
     * token lezy po wlasciwej stronie. Atrapa fabryki B20 NIE nadaje prefiksu
     * 0xB200 (na mainnecie nadaje), wiec porownanie z 0xB2 tu nie wystarcza.
     */
    async function deployQuote() {
      const C2 = await ethers.getContractFactory('Create2Deployer');
      const c2 = await C2.deploy();
      await c2.waitForDeployment();
      const Q = await ethers.getContractFactory('MockQuoteToken');
      const initCode = ethers.concat([Q.bytecode, ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [DECIMALS])]);
      const hash = ethers.keccak256(initCode);
      const from = await c2.getAddress();
      for (let i = 0; i < 1_000_000; i++) {
        const salt = ethers.zeroPadValue(ethers.toBeHex(i), 32);
        const addr = ethers.getCreate2Address(from, salt, hash);
        const first = Number(BigInt(addr) >> 152n);
        const wanted = orientation === 'quote-currency0' ? first === 0x00 : first === 0xff;
        if (!wanted) continue;
        await (await c2.deploy(salt, initCode)).wait();
        return Q.attach(addr);
      }
      throw new Error('nie wykopano adresu QUOTE');
    }

    async function deployPad(quoteAddr: string) {
      const nonce = await deployer.getNonce('pending');
      const padAddr = ethers.getCreateAddress({ from: deployer.address, nonce });
      const vaultAddr = ethers.getCreateAddress({ from: padAddr, nonce: 1 });
      const Hook = await ethers.getContractFactory('QuoteLaunchHook');
      const initCode = ethers.concat([
        Hook.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'address', 'uint16', 'address'],
          [await pm.getAddress(), treasury.address, PROTOCOL_SHARE_BPS, quoteAddr]
        ),
      ]);
      const hash = ethers.keccak256(initCode);
      let salt = '';
      for (let i = 0; i < 2_000_000; i++) {
        const s = ethers.zeroPadValue(ethers.toBeHex(i), 32);
        if ((BigInt(ethers.getCreate2Address(vaultAddr, s, hash)) & HOOK_ALL_MASK) === HOOK_REQUIRED_FLAGS) {
          salt = s;
          break;
        }
      }
      const Pad = await ethers.getContractFactory('QuoteCurveLaunchpad');
      const p = await Pad.connect(deployer).deploy(
        await pm.getAddress(),
        quoteAddr,
        FEE_BPS,
        CREATOR_FEE_BPS,
        treasury.address,
        PROTOCOL_SHARE_BPS,
        await tokenFactory.getAddress(),
        salt,
        R_VIRT
      );
      await p.waitForDeployment();
      expect(await p.getAddress()).to.equal(padAddr);
      return p;
    }

    async function solvent() {
      const bal = await quote.balanceOf(await pad.getAddress());
      const liab = await pad.totalLiabilities();
      expect(bal >= liab, `saldo ${bal} < zobowiazania ${liab}`).to.equal(true);
    }

    /** Orientacja z RZECZYWISTYCH adresow - to samo, co liczy kontrakt. */
    async function quoteIs0Of(tokenAddr: string) {
      return BigInt(await quote.getAddress()) < BigInt(tokenAddr);
    }

    async function launchToken(opts: { quoteIn?: bigint; buybackBps?: bigint; windowCap?: bigint } = {}) {
      // Token po zlej stronie QUOTE (szansa 1/256) - start od nowa, zeby kazdy
      // przypadek naprawde sprawdzal swoja orientacje.
      for (let attempt = 0; attempt < 8; attempt++) {
        const token = await launchOnce(opts);
        if ((await quoteIs0Of(await token.getAddress())) === (orientation === 'quote-currency0')) return token;
      }
      throw new Error('token ciagle po zlej stronie QUOTE');
    }

    async function launchOnce(opts: { quoteIn?: bigint; buybackBps?: bigint; windowCap?: bigint }) {
      const tx = await pad
        .connect(creator)
        .launchAdvanced(
          'Paired Meme',
          'PAIR',
          opts.quoteIn ?? 0n,
          opts.quoteIn ? 1n : 0n,
          await deadline(),
          FEE_BPS,
          CREATOR_FEE_BPS,
          opts.buybackBps ?? 0n,
          opts.windowCap ?? T0,
          [creator.address],
          [10_000],
          ''
        );
      const rc = await tx.wait();
      const ev = rc.logs.map((l: any) => pad.interface.parseLog(l)).find((e: any) => e && e.name === 'Launched');
      return ethers.getContractAt('MockB20', ev.args.token);
    }

    async function fillCurve(token: any) {
      // Prog to 4 * R_VIRT netto - z oplata i zapasem kupno dociagnie do T_MIN i odda reszte.
      const quoteIn = 4n * R_VIRT * 2n;
      await (await pad.connect(alice).buy(await token.getAddress(), quoteIn, 1n, await deadline())).wait();
      const l = await pad.launchOf(await token.getAddress());
      expect(l.state).to.equal(2n); // Locked
      expect(l.tokenReserve).to.equal(T_MIN);
    }

    async function graduate(token: any) {
      const rc = await (await pad.connect(bob).graduate(await token.getAddress())).wait();
      return rc;
    }

    beforeEach(async function () {
      [deployer, creator, alice, bob, treasury, carol] = await ethers.getSigners();
      await installAt('MockB20Factory', B20_FACTORY);
      const TF = await ethers.getContractFactory('B20TokenFactory');
      tokenFactory = await TF.deploy();
      await tokenFactory.waitForDeployment();

      const PM = await ethers.getContractFactory('@uniswap/v4-core/src/PoolManager.sol:PoolManager');
      pm = await PM.deploy(deployer.address);
      await pm.waitForDeployment();

      quote = await deployQuote();
      pad = await deployPad(await quote.getAddress());
      vault = await ethers.getContractAt('QuoteLiquidityVault', await pad.VAULT());
      hook = await ethers.getContractAt('QuoteLaunchHook', await pad.HOOK());

      const SP = await ethers.getContractFactory('QuoteSwapProbe');
      probe = await SP.deploy(await pm.getAddress());
      await probe.waitForDeployment();

      for (const who of [creator, alice, bob, carol]) {
        await (await quote.mint(who.address, 1_000_000n * UNIT)).wait();
        await (await quote.connect(who).approve(await pad.getAddress(), ethers.MaxUint256)).wait();
      }
      // Okno startowe ma limit na adres - testy duzych kupien ida po nim.
    });

    it('wiazanie: QUOTE, vault, hook, flagi i dwie ceny otwarcia w zakresie v4', async function () {
      const quoteAddr = await quote.getAddress();
      expect(await pad.QUOTE()).to.equal(quoteAddr);
      expect(await pad.QUOTE_DECIMALS()).to.equal(BigInt(DECIMALS));
      expect(await vault.QUOTE()).to.equal(quoteAddr);
      expect(await hook.QUOTE()).to.equal(quoteAddr);
      expect(await vault.LAUNCHPAD()).to.equal(await pad.getAddress());
      expect(await hook.VAULT()).to.equal(await vault.getAddress());
      expect(await hook.hasValidHookAddress()).to.equal(true);

      const q0 = await pad.SQRT_PRICE_TERMINAL_Q0();
      const q1 = await pad.SQRT_PRICE_TERMINAL_Q1();
      for (const p of [q0, q1]) expect(p > MIN_SQRT && p < MAX_SQRT).to.equal(true);
      // Obie to ta sama cena terminalna 5R/T_MIN w dwoch kierunkach: q0 * q1 ~ 2^192.
      const product = q0 * q1;
      const rel = Number(((product > Q96 * Q96 ? product - Q96 * Q96 : Q96 * Q96 - product) * 10n ** 12n) / (Q96 * Q96));
      expect(rel).to.be.lessThan(10); // < 1e-11 wzglednie
    });

    it('start z dev-buyem w QUOTE: zdarzenia jak w wersji ETH, rezerwa w QUOTE, wyplacalnosc', async function () {
      const devBuy = 100n * UNIT;
      const balBefore = await quote.balanceOf(creator.address);
      const token = await launchToken({ quoteIn: devBuy });
      const tokenAddr = await token.getAddress();

      const l = await pad.launchOf(tokenAddr);
      expect(l.creator).to.equal(creator.address);
      expect(l.state).to.equal(1n);
      expect(await quote.balanceOf(creator.address)).to.equal(balBefore - devBuy);
      expect(await token.balanceOf(creator.address)).to.be.greaterThan(0n);
      // Rezerwa + oplata == wplata (brak zwrotu ponizej progu).
      expect(l.ethReserve + (await pad.totalLiabilities()) - l.ethReserve).to.equal(devBuy);
      await solvent();

      // Klucz puli w kolejnosci adresow.
      const key = await pad.poolKeyOf(tokenAddr);
      const quoteIs0 = BigInt(await quote.getAddress()) < BigInt(tokenAddr);
      expect(quoteIs0).to.equal(orientation === 'quote-currency0');
      expect(key[0]).to.equal(quoteIs0 ? await quote.getAddress() : tokenAddr);
      expect(await pad.sqrtPriceTerminalOf(tokenAddr)).to.equal(
        quoteIs0 ? await pad.SQRT_PRICE_TERMINAL_Q0() : await pad.SQRT_PRICE_TERMINAL_Q1()
      );
    });

    it('kupno i sprzedaz licza dokladnie to, co quoteBuy/quoteSell; wyplacalnosc po kazdym kroku', async function () {
      const token = await launchToken();
      const tokenAddr = await token.getAddress();
      const amount = 250n * UNIT;
      const [expectOut] = await pad.quoteBuy(tokenAddr, amount);
      await (await pad.connect(alice).buy(tokenAddr, amount, expectOut, await deadline())).wait();
      expect(await token.balanceOf(alice.address)).to.equal(expectOut);
      await solvent();

      const half = expectOut / 2n;
      const [ethOut] = await pad.quoteSell(tokenAddr, half);
      await (await token.connect(alice).approve(await pad.getAddress(), half)).wait();
      const qBefore = await quote.balanceOf(alice.address);
      await (await pad.connect(alice).sell(tokenAddr, half, ethOut, await deadline())).wait();
      expect(await quote.balanceOf(alice.address)).to.equal(qBefore + ethOut);
      await solvent();
    });

    it('buyFor: placi wolajacy, tokeny, limit okna i Bought.buyer naleza do odbiorcy, zwrot do placacego', async function () {
      const token = await launchToken({ windowCap: 16_000_000n * 10n ** 18n });
      const tokenAddr = await token.getAddress();

      // Limit okna liczony na ODBIORCE: kupno ponad limit dla carol odpada.
      await expect(
        pad.connect(alice).buyFor(tokenAddr, 2000n * UNIT, 1n, await deadline(), carol.address)
      ).to.be.revertedWithCustomError(pad, 'WindowCap');

      const amount = 20n * UNIT;
      const rc = await (await pad.connect(alice).buyFor(tokenAddr, amount, 1n, await deadline(), carol.address)).wait();
      const ev = rc.logs.map((l: any) => pad.interface.parseLog(l)).find((e: any) => e && e.name === 'Bought');
      expect(ev.args.buyer).to.equal(carol.address);
      expect(await token.balanceOf(carol.address)).to.equal(ev.args.tokensOut);
      expect(await token.balanceOf(alice.address)).to.equal(0n);
      expect(await pad.windowBought(tokenAddr, carol.address)).to.equal(ev.args.tokensOut);
      expect(await pad.windowBought(tokenAddr, alice.address)).to.equal(0n);

      // Zwrot nadwyzki na progu idzie do PLACACEGO, nie do odbiorcy.
      await ethers.provider.send('evm_increaseTime', [301]);
      const aliceBefore = await quote.balanceOf(alice.address);
      const carolBefore = await quote.balanceOf(carol.address);
      const big = 4n * R_VIRT * 2n;
      const rc2 = await (await pad.connect(alice).buyFor(tokenAddr, big, 1n, await deadline(), carol.address)).wait();
      const ev2 = rc2.logs.map((l: any) => pad.interface.parseLog(l)).find((e: any) => e && e.name === 'Bought');
      expect(ev2.args.refund).to.be.greaterThan(0n);
      expect(await quote.balanceOf(alice.address)).to.equal(aliceBefore - big + ev2.args.refund);
      expect(await quote.balanceOf(carol.address)).to.equal(carolBefore);
      await solvent();
    });

    it('buyWithPermit: jedna transakcja bez wczesniejszego approve', async function () {
      const token = await launchToken();
      const tokenAddr = await token.getAddress();
      await (await quote.connect(bob).approve(await pad.getAddress(), 0n)).wait();

      const amount = 50n * UNIT;
      const permitDeadline = await deadline();
      const nonce = await quote.nonces(bob.address);
      const sig = ethers.Signature.from(
        await bob.signTypedData(
          { name: 'Mock Quote', version: '1', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await quote.getAddress() },
          { Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ] },
          { owner: bob.address, spender: await pad.getAddress(), value: amount, nonce, deadline: permitDeadline }
        )
      );
      await (await pad.connect(bob).buyWithPermit(tokenAddr, amount, 1n, await deadline(), permitDeadline, sig.v, sig.r, sig.s)).wait();
      expect(await token.balanceOf(bob.address)).to.be.greaterThan(0n);
      await solvent();
    });

    it('QUOTE z oplata od transferu jest odrzucany przy wplacie (fail-closed)', async function () {
      const token = await launchToken();
      await (await quote.setTransferFeeBps(50)).wait();
      await expect(
        pad.connect(alice).buy(await token.getAddress(), 100n * UNIT, 1n, await deadline())
      ).to.be.revertedWithCustomError(pad, 'QuoteTransferMismatch');
    });

    it('pelny cykl: zamkniecie na progu, sprzedaz w Locked, awans po cenie terminalnej w dobrej orientacji', async function () {
      const token = await launchToken({ quoteIn: 10n * UNIT });
      const tokenAddr = await token.getAddress();
      await ethers.provider.send('evm_increaseTime', [301]);
      await fillCurve(token);
      await solvent();

      // Kupno w Locked odpada, sprzedaz dopiero po LOCKED_SELL_DELAY (atak FORA, 30.09.2026).
      await expect(pad.connect(bob).buy(tokenAddr, UNIT, 1n, await deadline())).to.be.revertedWithCustomError(pad, 'CurveIsLocked');
      const sellAmt = 1_000_000n * 10n ** 18n;
      await (await token.connect(alice).approve(await pad.getAddress(), sellAmt)).wait();
      await expect(pad.connect(alice).sell(tokenAddr, sellAmt, 1n, await deadline())).to.be.revertedWithCustomError(pad, 'CurveIsLocked');
      const opensAt = Number(await pad.lockedSellOpensAt(tokenAddr));
      await ethers.provider.send('evm_setNextBlockTimestamp', [opensAt]);
      await (await pad.connect(alice).sell(tokenAddr, sellAmt, 1n, opensAt + 3600)).wait();
      await solvent();

      const reserveBefore = (await pad.launchOf(tokenAddr)).ethReserve;
      const rc = await graduate(token);
      const grad = rc.logs.map((l: any) => { try { return pad.interface.parseLog(l); } catch { return null; } }).find((e: any) => e && e.name === 'Graduated');
      const gradFee = (reserveBefore * 300n) / 10_000n;
      const eLp = reserveBefore - gradFee;
      expect(grad.args.gradFee).to.equal(gradFee);
      // Pula wziela prawie cale QUOTE - pyl z zaokraglen ponizej 0.01%.
      expect(grad.args.ethToPool <= eLp).to.equal(true);
      expect(eLp - grad.args.ethToPool).to.be.lessThan(eLp / 10_000n + 2n);
      // Token: tyle, ile trzeba, reszta na DEAD; razem T_MIN + sprzedane w Locked.
      expect(grad.args.tokensToPool + grad.args.tokensToDead).to.equal(T_MIN + sellAmt);
      expect(await token.balanceOf(DEAD)).to.equal(grad.args.tokensToDead);
      expect((await pad.launchOf(tokenAddr)).state).to.equal(3n);
      await solvent();

      // Nagroda dla wolajacego i udzial protokolu.
      expect(await pad.claimable(bob.address)).to.equal(gradFee / 2n);

      // Cena otwarcia puli = cena terminalna krzywej w jednostkach QUOTE za token.
      const pmIface = pm.interface;
      const init = rc.logs.map((l: any) => { try { return pmIface.parseLog(l); } catch { return null; } }).find((e: any) => e && e.name === 'Initialize');
      const sqrtP = init.args.sqrtPriceX96 as bigint;
      const quoteIs0 = orientation === 'quote-currency0';
      // cena v4 = amount1/amount0 (w jednostkach bazowych), w 1e36 dla precyzji
      const p36 = (sqrtP * sqrtP * 10n ** 36n) / (Q96 * Q96);
      const quotePerTokenE36 = quoteIs0 ? 10n ** 72n / p36 : p36;
      const expectedE36 = (5n * R_VIRT * 10n ** 36n) / T_MIN;
      const diff = quotePerTokenE36 > expectedE36 ? quotePerTokenE36 - expectedE36 : expectedE36 - quotePerTokenE36;
      expect(diff * 1_000_000n < expectedE36).to.equal(true); // < 1 ppm

      // Pozycja zamknieta w vaulcie.
      const pos = await vault.positionOf(tokenAddr);
      expect(pos.liquidity).to.be.greaterThan(0n);
      expect(await vault.creatorOf(tokenAddr)).to.equal(creator.address);
    });

    it('po awansie: swapy w obie strony przez prawdziwy PoolManager, 1% hooka w walucie niepodanej, settle i odbior', async function () {
      const token = await launchToken();
      const tokenAddr = await token.getAddress();
      await ethers.provider.send('evm_increaseTime', [301]);
      await fillCurve(token);
      await graduate(token);

      const key = plain(await vault.poolKeyOf(tokenAddr));
      const quoteIs0 = orientation === 'quote-currency0';
      const probeAddr = await probe.getAddress();
      await (await quote.connect(carol).transfer(probeAddr, 1000n * UNIT)).wait();

      // KUPNO tokena za 100 QUOTE, exactInput. Waluta niepodana = token -> oplata w tokenie.
      const buyIn = 100n * UNIT;
      await (await probe.doSwap(key, { zeroForOne: quoteIs0, amountSpecified: -buyIn, sqrtPriceLimitX96: quoteIs0 ? MIN_SQRT + 1n : MAX_SQRT - 1n })).wait();
      const pendingTok = await hook.pendingToken(tokenAddr);
      expect(pendingTok).to.be.greaterThan(0n);
      expect(await hook.pendingEth(tokenAddr)).to.equal(0n);
      const bought = await token.balanceOf(probeAddr);
      // Oplata = ceil(1% z wyjscia brutto): wyjscie netto + oplata = brutto.
      expect(pendingTok).to.equal(((bought + pendingTok) * 100n + 9_999n) / 10_000n);

      // SPRZEDAZ polowy tokena, exactInput. Niepodane = QUOTE -> oplata w QUOTE.
      const sellIn = bought / 2n;
      await (await probe.doSwap(key, { zeroForOne: !quoteIs0, amountSpecified: -sellIn, sqrtPriceLimitX96: quoteIs0 ? MAX_SQRT - 1n : MIN_SQRT + 1n })).wait();
      const pendingQ = await hook.pendingEth(tokenAddr);
      expect(pendingQ).to.be.greaterThan(0n);

      // Podzial 30/70 i odbior w QUOTE i tokenie.
      await (await hook.connect(carol).settle(tokenAddr)).wait();
      const protoQ = (pendingQ * PROTOCOL_SHARE_BPS) / 10_000n;
      expect(await hook.claimableEth(treasury.address)).to.equal(protoQ);
      expect(await hook.claimableEth(creator.address)).to.equal(pendingQ - protoQ);
      const creatorTok = pendingTok - (pendingTok * PROTOCOL_SHARE_BPS) / 10_000n;
      expect(await hook.claimableToken(tokenAddr, creator.address)).to.equal(creatorTok);

      const qBefore = await quote.balanceOf(creator.address);
      await (await hook.connect(carol).claimEthFor(creator.address)).wait();
      expect(await quote.balanceOf(creator.address)).to.equal(qBefore + pendingQ - protoQ);
      await (await hook.connect(creator).claimToken(tokenAddr)).wait();
      expect(await hook.claimableToken(tokenAddr, creator.address)).to.equal(0n);

      // Oplaty LP pozycji vaulta: harvest -> 30/70 w QUOTE i tokenie.
      await (await vault.connect(carol).harvest(tokenAddr)).wait();
      const lpQ = await vault.claimableEth(creator.address);
      const lpT = await vault.claimableToken(tokenAddr, creator.address);
      expect(lpQ > 0n || lpT > 0n).to.equal(true);
      if (lpQ > 0n) await (await vault.connect(creator).claimEth()).wait();
    });

    it('exactOutput: oplata hooka z WEJSCIA (waluta niepodana), wymieniajacy placi o nia wiecej', async function () {
      const token = await launchToken();
      const tokenAddr = await token.getAddress();
      await ethers.provider.send('evm_increaseTime', [301]);
      await fillCurve(token);
      await graduate(token);

      const key = plain(await vault.poolKeyOf(tokenAddr));
      const quoteIs0 = orientation === 'quote-currency0';
      const probeAddr = await probe.getAddress();
      await (await quote.connect(carol).transfer(probeAddr, 1000n * UNIT)).wait();

      // Kupno DOKLADNIE 1M tokena: podane wyjscie, niepodane wejscie = QUOTE.
      const out = 1_000_000n * 10n ** 18n;
      await (await probe.doSwap(key, { zeroForOne: quoteIs0, amountSpecified: out, sqrtPriceLimitX96: quoteIs0 ? MIN_SQRT + 1n : MAX_SQRT - 1n })).wait();
      expect(await token.balanceOf(probeAddr)).to.equal(out);
      const fee = await hook.pendingEth(tokenAddr);
      expect(fee).to.be.greaterThan(0n);
      expect(await hook.pendingToken(tokenAddr)).to.equal(0n);
      // Zaplacone = wejscie puli + oplata; oplata = ceil(1% wejscia puli).
      const paid = 1000n * UNIT - (await quote.balanceOf(probeAddr));
      expect(fee).to.equal(((paid - fee) * 100n + 9_999n) / 10_000n);
    });

    it('buyback z dzialki tworcy w QUOTE kupuje token w dobra strone i wysyla go na DEAD', async function () {
      const token = await launchToken({ buybackBps: 5000n });
      const tokenAddr = await token.getAddress();
      await ethers.provider.send('evm_increaseTime', [301]);
      await fillCurve(token);
      await graduate(token);

      const key = plain(await vault.poolKeyOf(tokenAddr));
      const quoteIs0 = orientation === 'quote-currency0';
      const probeAddr = await probe.getAddress();
      // Probe sprzedaje tokeny (od alice) za QUOTE -> oplata hooka w QUOTE.
      const sellIn = 20_000_000n * 10n ** 18n;
      await (await token.connect(alice).transfer(probeAddr, sellIn)).wait();
      await (await probe.doSwap(key, { zeroForOne: !quoteIs0, amountSpecified: -sellIn, sqrtPriceLimitX96: quoteIs0 ? MAX_SQRT - 1n : MIN_SQRT + 1n })).wait();
      await (await hook.settle(tokenAddr)).wait();

      const pendingBB = await hook.pendingBuybackEth(tokenAddr);
      expect(pendingBB).to.be.greaterThan(0n);
      const deadBefore = await token.balanceOf(DEAD);
      const rc = await (await hook.connect(carol).executeBuyback(tokenAddr, 1n, await deadline())).wait();
      const ev = rc.logs.map((l: any) => { try { return hook.interface.parseLog(l); } catch { return null; } }).find((e: any) => e && e.name === 'AutoBuyback');
      expect(ev.args.tokensBought).to.be.greaterThan(0n);
      expect(ev.args.ethIn <= pendingBB).to.equal(true);
      expect(await token.balanceOf(DEAD)).to.equal(deadBefore + ev.args.tokensBought);
      // Reszta (przy czesciowej wymianie) wraca do kolejki, nic nie znika.
      expect(await hook.pendingBuybackEth(tokenAddr)).to.equal(pendingBB - ev.args.ethIn);
    });

    it('brama: obcy nie otworzy puli z naszym hookiem', async function () {
      const token = await launchToken();
      const key = plain(await pad.poolKeyOf(await token.getAddress()));
      await expect(pm.initialize(key, await pad.sqrtPriceTerminalOf(await token.getAddress()))).to.be.reverted;
    });
  });
}

describe('Launchpad Q - konstruktor', function () {
  it('odrzuca QUOTE bez kodu, zle miejsca po przecinku i skale poza zakresem', async function () {
    const [deployer, treasury] = await ethers.getSigners();
    const PM = await ethers.getContractFactory('@uniswap/v4-core/src/PoolManager.sol:PoolManager');
    const pm = await PM.deploy(deployer.address);
    const TF = await ethers.getContractFactory('B20TokenFactory');
    const tf = await TF.deploy();
    const Pad = await ethers.getContractFactory('QuoteCurveLaunchpad');
    const salt = ethers.ZeroHash;

    await expect(
      Pad.deploy(await pm.getAddress(), treasury.address, 100, 70, treasury.address, 3000, await tf.getAddress(), salt, R_VIRT)
    ).to.be.revertedWithCustomError(Pad, 'QuoteHasNoCode');

    const Q = await ethers.getContractFactory('MockQuoteToken');
    const q2 = await Q.deploy(2);
    await expect(
      Pad.deploy(await pm.getAddress(), await q2.getAddress(), 100, 70, treasury.address, 3000, await tf.getAddress(), salt, R_VIRT)
    ).to.be.revertedWithCustomError(Pad, 'BadQuoteDecimals');

    // 18 miejsc (perpy, wiekszosc ERC-20): skala 1000e18 przechodzi, ceny w zakresie v4.
    const q18 = await Q.deploy(18);
    const nonce = await deployer.getNonce('pending');
    const padAddr = ethers.getCreateAddress({ from: deployer.address, nonce });
    const vaultAddr = ethers.getCreateAddress({ from: padAddr, nonce: 1 });
    const Hook = await ethers.getContractFactory('QuoteLaunchHook');
    const hash = ethers.keccak256(ethers.concat([Hook.bytecode, ethers.AbiCoder.defaultAbiCoder().encode(['address', 'address', 'uint16', 'address'], [await pm.getAddress(), treasury.address, 3000, await q18.getAddress()])]));
    let hookSalt = '';
    for (let i = 0; i < 2_000_000 && !hookSalt; i++) {
      const s = ethers.zeroPadValue(ethers.toBeHex(i), 32);
      if ((BigInt(ethers.getCreate2Address(vaultAddr, s, hash)) & HOOK_ALL_MASK) === HOOK_REQUIRED_FLAGS) hookSalt = s;
    }
    const p18 = await Pad.deploy(await pm.getAddress(), await q18.getAddress(), 100, 70, treasury.address, 3000, await tf.getAddress(), hookSalt, 1000n * 10n ** 18n);
    await p18.waitForDeployment();
    expect(await p18.QUOTE_DECIMALS()).to.equal(18n);
    expect(await p18.MIN_LP_ETH()).to.equal((1000n * 10n ** 18n) / 75n);

    const q6 = await Q.deploy(6);
    await expect(
      Pad.deploy(await pm.getAddress(), await q6.getAddress(), 100, 70, treasury.address, 3000, await tf.getAddress(), salt, 10n)
    ).to.be.revertedWithCustomError(Pad, 'BadScale');
  });
});
