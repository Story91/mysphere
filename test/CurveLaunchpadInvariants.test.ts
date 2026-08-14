// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w MemoPay.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { deployLaunchpad } = require('./helpers/deployLaunchpad');

/**
 * NIEZMIENNIKI, FUZZ I WYPLACALNOSC krzywej B20.
 *
 * ===========================================================================
 * CZYM TEN PLIK ROZNI SIE OD CurveLaunchpad.test.ts
 * ===========================================================================
 * Tamten plik sprawdza POJEDYNCZE zachowania na ladnych liczbach: ten revert,
 * tamten podzial oplaty, ta zapadka. To jest potrzebne i nie wystarcza.
 *
 * Tutaj sprawdzamy wlasnosci, ktore maja obowiazywac ZAWSZE, po KAZDEJ operacji,
 * na kwotach, ktorych nikt nie wybieral recznie. Bledy zaokraglen nie pokazuja
 * sie przy 1 ETH - pokazuja sie przy 7 wei, przy 999999999999999999 wei i przy
 * czterystu takich krokach jeden po drugim.
 *
 * Niezmienniki sa ponumerowane tak samo, jak w specyfikacji (§6), zeby dalo sie
 * je zestawic jeden do jednego:
 *
 *   I-C1  k = (R_VIRT + ethReserve) * tokenReserve  NIEMALEJACE   <- test nr 1
 *   I-C2  T_MIN <= tokenReserve <= T0
 *   I-C3  balanceOf(launchpad) == tokenReserve      (poza Graduated)
 *   I-C4  totalSupply == T0                          ZAWSZE, na kazdym etapie
 *   I-C5  quoteSell(cala podaz w obiegu) <= ethReserve
 *   I-C6  round-trip w jednym bloku zawsze na minusie
 *   I-C7  quoteBuy slabo rosnaca; cena rosnie po kupnie, maleje po sprzedazy
 *   I-C8  ethReserve maleje WYLACZNIE w sell i w awansie
 *   I-C9  nie ma stanu, w ktorym posiadacz nie moze wyjsc
 *   I-C10 tworca handluje na TYCH SAMYCH zasadach, co kazdy (blokady nie ma)
 *   I-C11 windowBought[token][a] <= WINDOW_ADDR_CAP w oknie
 *   I-G1  balance >= totalLiabilities  (tu mocniej: RowNOSC, gdy nie bylo dotacji)
 *   I-G2  suma oplat naliczonych == wyplacone + claimable
 *   I-X1..X7  po awansie
 *   I-B1..B4  token B20
 *
 * ===========================================================================
 * CZEGO TEN PLIK NIE DOWODZI - PRZECZYTAJ, ZANIM UZNASZ GO ZA ZIELONE SWIATLO
 * ===========================================================================
 * B20 jest PRECOMPILE'EM w oprogramowaniu wezla Base. Na lokalnym Hardhacie nie
 * ma go wcale, a na forku Base TEZ NIE (fork wykonuje lokalnie, wiec wywolanie
 * fabryki trafia w puste konto i oddaje sukces z pustymi danymi - cichy falszywy
 * pozytyw). Atrapa `MockB20` NIE EGZEKWUJE ROL: jej `mint` jest bez uprawnien.
 *
 * Wniosek, ktory trzeba wypowiedziec wprost: zdania "nikt nie dodrukuje" NIE DA
 * SIE tu udowodnic wykonaniem. Da sie udowodnic trzy rzeczy slabsze i to jest
 * dokladnie to, co robi sekcja "zrzeczenie rol":
 *   (a) po starcie ZADEN adres nie ma zadnej z trzech rol - sprawdzone odczytem
 *       dla jedenastu kandydatow, lacznie z nami i z address(0);
 *   (b) kazda z asercji rol POTRAFI wywrocic start - pokazane sabotazem fabryki,
 *       osobno dla ADMIN, MINT i PAUSE. Asercja, ktorej nikt nie widzial
 *       rewertujacej, jest nieodrozninalna od literowki w nazwie roli;
 *   (c) przez cala sekwencje fuzzu `totalSupply` nie drgnal ani o jednostke.
 * Egzekwowanie rol przez sam token sprawdza dopiero transakcja na Base Sepolia.
 *
 * Tak samo `MockPoolManager`: odwzorowuje uklad pamieci, kierunki zaokraglen
 * i regule "na koniec unlocka salda musza byc zerowe", ale nie jest PoolManagerem.
 */

const B20_FACTORY = '0xB20f000000000000000000000000000000000000';
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';
const DEAD = '0x000000000000000000000000000000000000dEaD';

const T0 = 10n ** 27n;
const T_MIN = 2n * 10n ** 26n;
/**
 * Skala krzywej. Do 2026-08-14 stala w kontrakcie; od tej daty jest argumentem
 * konstruktora, bo na Arc `msg.value` to USDC i ten sam bajtkod zbieral tam
 * DOLARY zamiast eteru. Testy ponizej licza na liczbach sprzed zmiany, wiec
 * podaja przy wdrozeniu dokladnie te sama wartosc - rownowaznosc przybija
 * test/CurveScale.test.ts.
 */
const R_VIRT = 750000000000000000n;
const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 40n;
const WINDOW = 300;
/**
 * Oplata awansowa jest UDZIALEM w rezerwie, nie stala kwota - i to jest zmiana
 * wobec poprzedniej wersji tego pliku, w ktorej staly tu `GRAD_FEE = 0.1 ETH`,
 * `MIN_GRAD_RESERVE = 2 ETH` i `GRAD_REWARD = 0.05 ETH`.
 *
 * Prog usunieto, bo kosztowal wiecej, niz naprawial: zejscie pod niego wymagalo
 * sprzedania 7.3% podazy, kupionej na starcie krzywej za 0.059 ETH i wartej
 * w stanie Locked 1.00 ETH. Robil to wiec zwykly wczesny kupujacy realizujacy
 * zysk, a skutkiem bylo TRWALE odebranie tokenowi awansu. Pelne uzasadnienie
 * stoi przy `GRAD_FEE_BPS` w kontrakcie.
 *
 * Te dwie funkcje sa JEDYNYM zrodlem prawdy o oplacie w tym pliku - liczba
 * przepisana w kilkunastu miejscach rozjechalaby sie przy pierwszej zmianie.
 */
const GRAD_FEE_BPS = 300n;
const gradFeeOf = (reserve: bigint) => (reserve * GRAD_FEE_BPS) / 10_000n;
/** Ten sam podzial, co `_accrueFee` dla `kind != 0`: polowa dla wolajacego. */
const gradRewardOf = (reserve: bigint) => gradFeeOf(reserve) / 2n;
const MAX_UINT = ethers.MaxUint256;

/** Stany z enuma `State` w kontrakcie. */
const NONE = 0n;
const CURVE = 1n;
const LOCKED = 2n;
const GRADUATED = 3n;

/* ======================================================================== */
/*  GENERATOR - DETERMINISTYCZNY, ZEBY AWARIA BYLA POWTARZALNA               */
/* ======================================================================== */

/**
 * xorshift64. Wybrany nie dla jakosci statystycznej, tylko dlatego, ze jest
 * odtwarzalny co do bitu z ziarna: gdy fuzz znajdzie blad, do reprodukcji
 * wystarczy numer ziarna wypisany w nazwie testu. `Math.random()` dalby awarie,
 * ktorej nie da sie powtorzyc - czyli raport, z ktorym nie da sie nic zrobic.
 */
function mkRng(seed: number) {
  const MASK = (1n << 64n) - 1n;
  let s = BigInt(seed >>> 0) || 1n;
  return function next(): bigint {
    s = (s ^ ((s << 13n) & MASK)) & MASK;
    s = s ^ (s >> 7n);
    s = (s ^ ((s << 17n) & MASK)) & MASK;
    return s;
  };
}

function between(next: () => bigint, lo: bigint, hi: bigint): bigint {
  if (hi <= lo) return lo;
  return lo + (next() % (hi - lo + 1n));
}

/**
 * Kwota o losowym RZEDZIE WIELKOSCI, nie losowa rownomiernie.
 *
 * Rownomierne losowanie z [1, 3e18] daje w praktyce same kwoty rzedu ETH -
 * a bledy zaokraglen mieszkaja przy 1, 7 i 1337 wei. Losujemy wiec najpierw
 * liczbe cyfr, potem wartosc: kazdy rzad wielkosci ma te sama szanse.
 */
function randomAmount(next: () => bigint, maxWei: bigint): bigint {
  const maxDigits = BigInt(maxWei.toString().length);
  const digits = between(next, 1n, maxDigits);
  let v = between(next, 1n, 10n ** digits);
  if (v > maxWei) v = maxWei;
  if (v < 1n) v = 1n;
  return v;
}

describe('CurveLaunchpad - niezmienniki, fuzz i wyplacalnosc', function () {
  // Fuzz to setki transakcji; domyslny limit mochy (40 s) jest za krotki,
  // a przekroczony daje czerwony test, ktory nie mowi nic o kontrakcie.
  this.timeout(20 * 60 * 1000);

  let deployer: any, creator: any, alice: any, bob: any, carol: any, dave: any, treasury: any;
  let pad: any, vault: any, hook: any, factory: any, tokenFactory: any, pm: any;
  let padAddr: string;

  /* ===================================================================== */
  /*  RUSZTOWANIE                                                           */
  /* ===================================================================== */

  /** Podklada bajtkod atrapy pod adres, ktory kontrakt ma wpisany jako stala. */
  async function installAt(name: string, address: string) {
    const F = await ethers.getContractFactory(name);
    const d = await F.deploy();
    await d.waitForDeployment();
    const code = await ethers.provider.getCode(await d.getAddress());
    await hre.network.provider.send('hardhat_setCode', [address, code]);
    return F.attach(address);
  }

  async function now(): Promise<number> {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }

  async function warp(seconds: number) {
    await hre.network.provider.send('evm_increaseTime', [seconds]);
    await hre.network.provider.send('evm_mine');
  }

  function pickEvent(rc: any, iface: any, name: string) {
    for (const log of rc.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === name) return parsed;
      } catch {
        /* log nie nalezy do tego interfejsu */
      }
    }
    return null;
  }

  async function launchToken(from: any = creator, value = 0n, minOut = 0n) {
    const tx = await pad.connect(from).launch('Test', 'TST', minOut, MAX_UINT, { value });
    const rc = await tx.wait();
    const ev = pickEvent(rc, pad.interface, 'Launched');
    const token = ev.args[0] as string;
    return { token, t: await ethers.getContractAt('MockB20', token), rc };
  }

  /** Swiezy token JUZ POZA oknem startowym - okno ma wlasna sekcje testow. */
  async function openCurve(from: any = creator) {
    const c = await launchToken(from);
    await warp(WINDOW + 1);
    return c;
  }

  function plainKey(k: any) {
    return [k[0], k[1], k[2], k[3], k[4]];
  }

  function poolIdOf(k: any) {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['tuple(address,address,uint24,int24,address)'],
        [plainKey(k)]
      )
    );
  }

  /** Cena puli czytana TA SAMA sciezka, co w kontrakcie: extsload + slot 6. */
  async function poolPrice(key: any): Promise<bigint> {
    const slot = ethers.keccak256(
      ethers.solidityPacked(['bytes32', 'uint256'], [poolIdOf(key), 6])
    );
    return BigInt(await pm.extsload(slot)) & ((1n << 160n) - 1n);
  }

  /* ===================================================================== */
  /*  MIGAWKA STANU I ASERCJA NIEZMIENNIKOW                                 */
  /* ===================================================================== */

  type Snap = {
    state: bigint;
    eth: bigint;
    tok: bigint;
    k: bigint;
    liab: bigint;
    bal: bigint;
  };

  async function snap(token: string): Promise<Snap> {
    const l = await pad.launchOf(token);
    const eth = l[2] as bigint;
    const tok = l[3] as bigint;
    return {
      state: l[1] as bigint,
      eth,
      tok,
      k: (R_VIRT + eth) * tok,
      liab: await pad.totalLiabilities(),
      bal: await ethers.provider.getBalance(padAddr)
    };
  }

  /**
   * Wolane po KAZDEJ operacji, nie na koncu przebiegu.
   *
   * To jest cala roznica miedzy "na koncu bilans sie zgadza" a "nie istnieje
   * moment, w ktorym sie nie zgadza". Blad zaokraglenia, ktory raz zabiera
   * i raz oddaje, jest widoczny wylacznie w tej drugiej formie.
   *
   * `donated` mowi, czy do kontraktu trafilo ETH poza jego wlasnymi sciezkami
   * (dotacja). Bez dotacji `balance == totalLiabilities` CO DO WEI - i tak to
   * asertujemy, bo nierownosc `>=` przepuscilaby wyciek liczony w druga strone.
   */
  async function assertInvariants(
    token: string,
    t: any,
    prev: Snap,
    op: 'buy' | 'sell' | 'graduate' | 'claim' | 'none',
    donated = false
  ): Promise<Snap> {
    const s = await snap(token);

    // I-C4: podaz nie zmienia sie NIGDY, na zadnym etapie zycia tokena.
    expect(await t.totalSupply(), 'I-C4 totalSupply').to.equal(T0);

    // I-G1: kontrakt trzyma co najmniej tyle, ile jest komus winien.
    if (donated) {
      expect(s.bal, 'I-G1 balance >= liabilities').to.be.greaterThanOrEqual(s.liab);
    } else {
      expect(s.bal, 'I-G1 balance == liabilities (bez dotacji)').to.equal(s.liab);
    }

    if (s.state === GRADUATED) {
      // I-X2 / I-X3
      expect(s.eth, 'I-X2 ethReserve').to.equal(0n);
      expect(s.tok, 'I-X2 tokenReserve').to.equal(0n);
      expect(await t.balanceOf(padAddr), 'I-X3').to.equal(0n);
      return s;
    }

    // I-C1 - TEST NUMER JEDEN. Jesli k nigdy nie maleje, wyplacalnosc jest
    // udowodniona bez zadnego innego rachunku.
    expect(s.k, 'I-C1 k niemalejace').to.be.greaterThanOrEqual(prev.k);

    // I-C2
    expect(s.tok, 'I-C2 dol').to.be.greaterThanOrEqual(T_MIN);
    expect(s.tok, 'I-C2 gora').to.be.lessThanOrEqual(T0);

    // I-C3: kontrakt trzyma DOKLADNIE tyle tokena, ile mowi jego ksiegowosc.
    expect(await t.balanceOf(padAddr), 'I-C3').to.equal(s.tok);

    // I-C5: gdyby cala podaz w obiegu wrocila naraz, jest z czego zaplacic.
    const [netAll, feeAll] = await pad.quoteSell(token, T0 - s.tok);
    expect(netAll + feeAll, 'I-C5 wyplacalnosc zbiorcza').to.be.lessThanOrEqual(s.eth);

    // I-C8: rezerwa ETH maleje wylacznie w sprzedazy i w awansie.
    if (op === 'buy') {
      expect(s.eth, 'I-C8 kupno nie zmniejsza rezerwy').to.be.greaterThanOrEqual(prev.eth);
    }

    // Zapadka: raz Locked, nigdy z powrotem Curve.
    if (prev.state === LOCKED) {
      expect(s.state, 'zapadka Locked').to.not.equal(CURVE);
    }

    return s;
  }

  /* ===================================================================== */
  /*  OPERACJE Z PELNA WERYFIKACJA WYCENY                                   */
  /* ===================================================================== */

  /**
   * Kupno, ktore SPRAWDZA, ze `quoteBuy` powiedzialo dokladnie to samo, co
   * zrobil `buy`.
   *
   * Interfejs uzytkownika czyta `quoteBuy`. Gdyby te dwie sciezki mogly sie
   * rozjechac, kazdy poslizg byl by liczony wzgledem liczby, ktorej lancuch
   * nie zamierza dotrzymac - a to jest dokladnie ten rodzaj rozjazdu, ktory
   * wyglada jak atak sandwiczowy i nie jest nim.
   */
  async function buyChecked(who: any, token: string, t: any, value: bigint) {
    const q = await pad.quoteBuy(token, value); // [out, fee, refund]
    const rc = await (
      await pad.connect(who).buy(token, 1n, MAX_UINT, { value })
    ).wait();
    const ev = pickEvent(rc, pad.interface, 'Bought');
    expect(ev, 'zdarzenie Bought').to.not.equal(null);

    // ethIn, ethNet, feeEth, tokensOut, refund
    expect(ev.args[2], 'Bought.ethIn').to.equal(value);
    expect(ev.args[5], 'quoteBuy.tokensOut == Bought.tokensOut').to.equal(q[0]);
    expect(ev.args[4], 'quoteBuy.fee == Bought.feeEth').to.equal(q[1]);
    expect(ev.args[6], 'quoteBuy.refund == Bought.refund').to.equal(q[2]);
    // Ksiegowosc jednej transakcji domyka sie co do wei.
    expect(ev.args[3] + ev.args[4] + ev.args[6], 'ethNet + fee + refund == ethIn').to.equal(value);
    return { out: q[0] as bigint, fee: q[1] as bigint, refund: q[2] as bigint, rc };
  }

  async function sellChecked(who: any, token: string, t: any, amount: bigint) {
    const q = await pad.quoteSell(token, amount); // [ethOut, fee]
    const rc = await (
      await pad.connect(who).sell(token, amount, 1n, MAX_UINT)
    ).wait();
    const ev = pickEvent(rc, pad.interface, 'Sold');
    expect(ev, 'zdarzenie Sold').to.not.equal(null);
    // tokensIn, ethGross, feeEth, ethOut
    expect(ev.args[2], 'Sold.tokensIn').to.equal(amount);
    expect(ev.args[5], 'quoteSell.ethOut == Sold.ethOut').to.equal(q[0]);
    expect(ev.args[4], 'quoteSell.fee == Sold.feeEth').to.equal(q[1]);
    expect(ev.args[3], 'gross == net + fee').to.equal(q[0] + q[1]);
    return { net: q[0] as bigint, fee: q[1] as bigint, rc };
  }

  beforeEach(async function () {
    [deployer, creator, alice, bob, carol, dave, treasury] = await ethers.getSigners();

    factory = await installAt('MockB20Factory', B20_FACTORY);
    pm = await installAt('MockPoolManager', POOL_MANAGER);

    const TF = await ethers.getContractFactory('B20TokenFactory');
    tokenFactory = await TF.deploy();
    await tokenFactory.waitForDeployment();

    ({ pad, vault, hook } = await deployLaunchpad({
      deployer,
      feeBps: FEE_BPS,
      creatorFeeBps: CREATOR_FEE_BPS,
      feeRecipient: treasury.address,
      protocolShareBps: 6000,
      tokenFactory: await tokenFactory.getAddress(),
    }));
    padAddr = await pad.getAddress();
  });

  /* ===================================================================== */
  /*  1. NIEZMIENNIKI PO KAZDEJ OPERACJI                                    */
  /* ===================================================================== */

  describe('niezmienniki po kazdej operacji', function () {
    it('I-C1: k nie maleje przez dlugi, mieszany ciag kupien i sprzedazy', async function () {
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);
      await t.connect(bob).approve(padAddr, MAX_UINT);

      let s = await snap(token);
      const plan: [any, 'buy' | 'sell', bigint][] = [
        [alice, 'buy', ethers.parseEther('0.3')],
        [bob, 'buy', 7n],
        [alice, 'buy', 1337n],
        [bob, 'buy', ethers.parseEther('0.9')],
        [alice, 'sell', 0n], // 0 == "polowa tego, co ma"
        [bob, 'buy', 999999999999999999n],
        [bob, 'sell', 0n],
        [alice, 'buy', 3n],
        [alice, 'sell', 0n],
        [bob, 'buy', ethers.parseEther('0.05')]
      ];

      for (const [who, kind, amount] of plan) {
        if (kind === 'buy') {
          const q = await pad.quoteBuy(token, amount);
          if (q[0] === 0n) continue; // pyl - `buy` odbilby sie DustTrade
          await buyChecked(who, token, t, amount);
          s = await assertInvariants(token, t, s, 'buy');
        } else {
          const bal: bigint = await t.balanceOf(who.address);
          const n = bal / 2n;
          if (n === 0n) continue;
          await sellChecked(who, token, t, n);
          s = await assertInvariants(token, t, s, 'sell');
        }
      }
      // Niezerowa historia, a nie ciag pominietych krokow.
      expect(s.eth).to.be.greaterThan(0n);
    });

    it('I-C6: round-trip w jednym bloku jest na minusie dla 60 losowych kwot', async function () {
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);
      const next = mkRng(0xc6);

      let s = await snap(token);
      let tested = 0;
      for (let i = 0; i < 60; i++) {
        // Kwoty ograniczone, zeby round-trip nie domknal krzywej w polowie
        // przebiegu - test dotyczy stanu Curve.
        const value = randomAmount(next, ethers.parseEther('0.2'));
        const q = await pad.quoteBuy(token, value);
        if (q[0] === 0n) continue;

        const spent = value - q[2];
        const before: bigint = await t.balanceOf(alice.address);
        await buyChecked(alice, token, t, value);
        s = await assertInvariants(token, t, s, 'buy');
        const got = (await t.balanceOf(alice.address)) - before;
        expect(got).to.equal(q[0]);

        const qs = await pad.quoteSell(token, got);
        if (qs[0] === 0n) {
          // Kwota tak mala, ze nie da sie jej odsprzedac - a wiec tym bardziej
          // round-trip nie jest zyskowny. To jest ta sama teza, nie wyjatek.
          expect(qs[0] + qs[1]).to.be.lessThan(spent);
          continue;
        }
        await sellChecked(alice, token, t, got);
        s = await assertInvariants(token, t, s, 'sell');

        // I-C6: kupno i natychmiastowa sprzedaz ZAWSZE oddaja mniej, niz
        // kosztowaly. Bez tego istnialaby darmowa petla na zaokragleniu.
        expect(qs[0], `round-trip przy ${value} wei`).to.be.lessThan(spent);
        tested++;
      }
      expect(tested, 'liczba naprawde wykonanych round-tripow').to.be.greaterThan(30);
    });

    it('I-C7: quoteBuy jest slabo rosnaca, cena rosnie po kupnie i maleje po sprzedazy', async function () {
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);

      // Monotonicznosc wyceny wzgledem kwoty.
      let prevOut = 0n;
      for (const e of [1n, 2n, 100n, 10_000n, 10n ** 12n, 10n ** 15n, ethers.parseEther('0.1'), ethers.parseEther('1')]) {
        const q = await pad.quoteBuy(token, e);
        expect(q[0], `quoteBuy(${e}) >= quoteBuy(mniejszej)`).to.be.greaterThanOrEqual(prevOut);
        prevOut = q[0];
      }

      // Cena spot: rosnie po kupnie, maleje po sprzedazy.
      const p0: bigint = await pad.spotPriceWeiPerToken(token);
      await buyChecked(alice, token, t, ethers.parseEther('0.5'));
      const p1: bigint = await pad.spotPriceWeiPerToken(token);
      expect(p1).to.be.greaterThan(p0);

      await sellChecked(alice, token, t, (await t.balanceOf(alice.address)) / 2n);
      const p2: bigint = await pad.spotPriceWeiPerToken(token);
      expect(p2).to.be.lessThan(p1);
      // ...ale NIE ponizej punktu wyjscia: oplaty zostaly w krzywej.
      expect(p2).to.be.greaterThan(p0);
    });

    it('I-G1/I-G2: balans == zobowiazania co do wei, a oplaty sumuja sie do naliczonych', async function () {
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);

      let s = await snap(token);
      let accrued = 0n;

      const r1 = await buyChecked(alice, token, t, ethers.parseEther('1.1'));
      accrued += r1.fee;
      s = await assertInvariants(token, t, s, 'buy');

      const r2 = await sellChecked(alice, token, t, (await t.balanceOf(alice.address)) / 3n);
      accrued += r2.fee;
      s = await assertInvariants(token, t, s, 'sell');

      // I-G2 przed jakakolwiek wyplata.
      const claimTreasury: bigint = await pad.claimable(treasury.address);
      const claimCreator: bigint = await pad.claimable(creator.address);
      expect(claimTreasury + claimCreator, 'I-G2 suma sald == suma naliczen').to.equal(accrued);
      expect(s.liab, 'zobowiazania == rezerwa + oplaty').to.equal(s.eth + accrued);

      // ...i po wyplacie: naliczone == wyplacone + pozostale saldo.
      const before = await ethers.provider.getBalance(treasury.address);
      await pad.connect(alice).claimFor(treasury.address);
      const paid = (await ethers.provider.getBalance(treasury.address)) - before;
      expect(paid).to.equal(claimTreasury);
      expect(paid + (await pad.claimable(creator.address)), 'I-G2 po wyplacie').to.equal(accrued);

      s = await assertInvariants(token, t, s, 'claim');
    });

    it('I-C10/I-C11: tworca handluje jak kazdy, a limit okna jest wspolny dla niego i dla reszty', async function () {
      // Tworca kupuje w oknie - podlega temu samemu limitowi, co kazdy.
      const { token, t } = await launchToken(creator, ethers.parseEther('0.0122'), 1n);
      const cap: bigint = await pad.WINDOW_ADDR_CAP();

      expect(await pad.windowBought(token, creator.address)).to.equal(
        await t.balanceOf(creator.address)
      );
      expect(await pad.windowBought(token, creator.address)).to.be.lessThanOrEqual(cap);

      await t.connect(creator).approve(padAddr, MAX_UINT);

      // TWORCA SPRZEDAJE JAK KAZDY, TAKZE W STANIE `Curve`.
      //
      // Byly tu kolejno dwie wersje blokady i obie tworzyly asymetrie w
      // przeciwne strony: najpierw tworca nie mogl wyjsc NIGDY (a wiekszosc
      // tokenow nie dochodzi do progu), potem nie mogl w `Curve`, ale mogl
      // jako JEDYNY w `Locked`, gdy nikt nie mogl juz kupic. Zadna z nich nie
      // dotykala tworcy sprzedajacego z drugiego adresu - a tylko taki jest
      // problemem. Patrz naglowek `CurveLaunchpad`, punkt 3.
      const przedSprzedaza: bigint = await t.balanceOf(creator.address);
      await sellChecked(creator, token, t, przedSprzedaza / 2n);
      expect(await t.balanceOf(creator.address)).to.be.lessThan(przedSprzedaza);

      await warp(WINDOW + 1);
      await buyChecked(alice, token, t, ethers.parseEther('5'));
      expect((await pad.launchOf(token))[1]).to.equal(LOCKED);
      // Ilosc musi byc realna, a nie 1000 jednostek bazowych: tyle daje zero wei
      // po zaokragleniu w dol i krzywa slusznie odbija to jako `DustTrade`.
      await pad.connect(creator).sell(token, await t.balanceOf(creator.address), 1n, MAX_UINT);
      expect(await t.balanceOf(creator.address)).to.equal(0n);
      // Alice tez moze, tak jak przedtem.
      await t.connect(alice).approve(padAddr, MAX_UINT);
      await sellChecked(alice, token, t, 10n ** 24n);
    });

    it('I-C11: limit okna jest twardy CO DO JEDNOSTKI i znika sekunde po oknie', async function () {
      const { token, t } = await launchToken(creator);
      const cap: bigint = await pad.WINDOW_ADDR_CAP();

      // Szukamy najwiekszej kwoty, ktora jeszcze miesci sie w limicie.
      let lo = 1n;
      let hi = ethers.parseEther('1');
      while (lo < hi) {
        const mid = (lo + hi + 1n) / 2n;
        const q = await pad.quoteBuy(token, mid);
        if (q[0] <= cap) lo = mid;
        else hi = mid - 1n;
      }
      await pad.connect(alice).buy(token, 1n, MAX_UINT, { value: lo });
      const bought: bigint = await pad.windowBought(token, alice.address);
      expect(bought).to.be.lessThanOrEqual(cap);

      // Kolejne kupno, ktore przekroczy limit LACZNIE, rewertuje - nie przycina.
      await expect(
        pad.connect(alice).buy(token, 1n, MAX_UINT, { value: ethers.parseEther('0.02') })
      ).to.be.revertedWithCustomError(pad, 'WindowCap');
      expect(await t.balanceOf(alice.address)).to.equal(bought); // nic sie nie zmienilo

      // Inny adres ma wlasny limit - to jest cala prawda o skutecznosci tej reguly.
      await pad.connect(bob).buy(token, 1n, MAX_UINT, { value: lo });
      expect(await pad.windowBought(token, bob.address)).to.be.greaterThan(0n);

      await warp(WINDOW + 1);
      // Po oknie licznik przestaje byc sprawdzany i przestaje rosnac.
      await pad.connect(alice).buy(token, 1n, MAX_UINT, { value: ethers.parseEther('0.5') });
      expect(await pad.windowBought(token, alice.address)).to.equal(bought);
      expect(await t.balanceOf(alice.address)).to.be.greaterThan(cap);
    });
  });

  /* ===================================================================== */
  /*  2. FUZZ                                                               */
  /* ===================================================================== */

  describe('fuzz - losowe sekwencje kupien i sprzedazy', function () {
    /**
     * Jeden przebieg fuzzu.
     *
     * Zwraca ksiegowosc calego przebiegu, zeby na koncu dalo sie sprawdzic
     * tozsamosc, ktorej nie widac w zadnym pojedynczym kroku:
     *
     *     wplacone - wyplacone == ethReserve + wszystkie naliczone oplaty
     *
     * Ta rownosc jest scisla (nie nierownosc) i wychwytuje kazdy wyciek wei
     * w OBIE strony - takze taki, ktory dodawalby kontraktowi pieniedzy.
     */
    async function fuzzRun(seed: number, steps: number) {
      const next = mkRng(seed);
      const actors = [alice, bob, carol, dave];
      const { token, t } = await openCurve();
      for (const a of actors) await t.connect(a).approve(padAddr, MAX_UINT);

      let s = await snap(token);
      let paidIn = 0n;
      let paidOut = 0n;
      let buys = 0;
      let sells = 0;
      let dusted = 0;
      let graduated = false;

      for (let i = 0; i < steps; i++) {
        const who = actors[Number(next() % BigInt(actors.length))];
        const wantBuy = next() % 100n < 62n;

        // WYMUSZONA sonda pylowa. Losowanie rzedu wielkosci trafia w 1 wei zbyt
        // rzadko, zeby polegac na szczesciu - a to jest wektor A5 (na Base gaz
        // jest tani, wiec petla mikro-kupien oplacilaby sie, gdyby ktorekolwiek
        // zaokraglenie szlo na korzysc wolajacego). Coverage tej sciezki ma byc
        // pewny w KAZDYM przebiegu, a nie wynikac z ziarna.
        if (i % 25 === 12 && s.state === CURVE) {
          await expect(
            pad.connect(who).buy(token, 1n, MAX_UINT, { value: 1n })
          ).to.be.revertedWithCustomError(pad, 'DustTrade');
          const po = await snap(token);
          expect(po.k, 'odbity pyl nie rusza stanu').to.equal(s.k);
          expect(po.liab, 'odbity pyl nie tworzy zobowiazania').to.equal(s.liab);
          dusted++;
          continue;
        }

        // Awans wchodzi do slownika fuzzera, a nie stoi w osobnym tescie:
        // ma byc sprawdzony po DOWOLNEJ historii krzywej, nie po jednej ladnej.
        // Warunek `gradFeeOf(s.eth) > 0` zastapil `s.eth > GRAD_FEE`: awans
        // odpada juz tylko wtedy, gdy oplata zaokragla sie do zera, czyli gdy
        // rezerwa jest pylem i puli i tak nie ma z czego otworzyc.
        if (s.state === LOCKED && next() % 100n < 15n && gradFeeOf(s.eth) > 0n) {
          await pad.connect(who).graduate(token);
          s = await assertInvariants(token, t, s, 'graduate');
          graduated = true;
          break;
        }

        if (wantBuy && s.state === CURVE) {
          // Sufit dobrany tak, zeby dojscie do progu wymagalo KILKU kupien:
          // przy jednym kupnie za 4 ETH krzywa domyka sie w pierwszym kroku
          // i caly przebieg badalby juz tylko stan Locked. Przekroczenie progu
          // ma wlasne testy, ktore trafiaja w nie co do wei.
          const value = randomAmount(next, ethers.parseEther('0.6'));
          const q = await pad.quoteBuy(token, value);
          if (q[0] === 0n) {
            // Pyl MUSI sie odbic. Gdyby przeszedl, istnialaby transakcja, ktora
            // wyglada w historii jak kupno, a nic nie kupila.
            await expect(
              pad.connect(who).buy(token, 1n, MAX_UINT, { value })
            ).to.be.revertedWithCustomError(pad, 'DustTrade');
            const after = await snap(token);
            expect(after.k, 'odbity pyl nie rusza stanu').to.equal(s.k);
            dusted++;
            continue;
          }
          const r = await buyChecked(who, token, t, value);
          paidIn += value - r.refund;
          s = await assertInvariants(token, t, s, 'buy');
          buys++;
        } else {
          const bal: bigint = await t.balanceOf(who.address);
          if (bal === 0n) continue;
          // Sprzedaz losowej CZESCI pozycji - czasem calej, czasem okruchu.
          const numer = between(next, 1n, 100n);
          let amount = (bal * numer) / 100n;
          if (amount === 0n) amount = bal;
          const q = await pad.quoteSell(token, amount);
          if (q[0] === 0n) {
            // net == 0: albo gross == 0 (DustTrade), albo cala kwota poszla na
            // oplate i `minEthOut = 1` nie da sie dotrzymac (Slippage).
            await expect(pad.connect(who).sell(token, amount, 1n, MAX_UINT)).to.be.reverted;
            dusted++;
            continue;
          }
          const r = await sellChecked(who, token, t, amount);
          paidOut += r.net;
          s = await assertInvariants(token, t, s, 'sell');
          sells++;
        }
      }

      return { token, t, s, paidIn, paidOut, buys, sells, dusted, graduated, actors };
    }

    for (const seed of [1, 7, 99, 424242, 0xbeef, 0x1c1]) {
      it(`ziarno ${seed}: 120 losowych operacji, niezmienniki po kazdej`, async function () {
        const r = await fuzzRun(seed, 120);

        // Przebieg ma byc przebiegiem, a nie ciagiem pominietych krokow.
        // Bez tych trzech linijek fuzz, ktory z jakiegos powodu przestal
        // cokolwiek wykonywac, nadal swiecilby na zielono.
        expect(r.buys, 'liczba kupien').to.be.greaterThan(5);
        expect(r.sells, 'liczba sprzedazy').to.be.greaterThan(3);
        expect(r.dusted, 'liczba odbitych operacji pylowych').to.be.greaterThan(0);

        // Tozsamosc ksiegowa calego przebiegu, co do wei. Po awansie rezerwa
        // jest juz w puli, wiec rachunek zamyka sie tylko przed nim.
        if (!r.graduated) {
          const fees = r.s.liab - r.s.eth;
          expect(r.paidIn - r.paidOut, 'wplacone - wyplacone == rezerwa + oplaty').to.equal(
            r.s.eth + fees
          );
          // I-C1 wzgledem STANU POCZATKOWEGO, nie tylko krok po kroku.
          expect(r.s.k).to.be.greaterThanOrEqual(R_VIRT * T0);
        }

        // Gra o sumie ujemnej: uczestnicy nie moga wyjac wiecej, niz wlozyli.
        expect(r.paidOut).to.be.lessThan(r.paidIn);
      });
    }

    it('fuzz na DWOCH krzywych naraz: ksiegowosc globalna nie miesza tokenow', async function () {
      // Singleton na wszystkie starty placi ta cena, ze blad w jednej sciezce
      // dotyka wszystkich krzywych naraz. Domyka to niezmiennik GLOBALNY -
      // i tu jest jedyne miejsce, gdzie da sie go naprawde obciazyc.
      const next = mkRng(0x2c);
      const a = await openCurve(creator);
      const b = await launchToken(alice);
      await warp(WINDOW + 1);
      const krzywe = [a, b];
      const actors = [bob, carol, dave];
      for (const c of krzywe) for (const who of actors) await c.t.connect(who).approve(padAddr, MAX_UINT);

      let sa = await snap(a.token);
      let sb = await snap(b.token);

      for (let i = 0; i < 70; i++) {
        const naA = next() % 2n === 0n;
        const c = naA ? a : b;
        let s = naA ? sa : sb;
        const who = actors[Number(next() % 3n)];

        if (next() % 100n < 65n && s.state === CURVE) {
          const value = randomAmount(next, ethers.parseEther('2'));
          const q = await pad.quoteBuy(c.token, value);
          if (q[0] === 0n) continue;
          await buyChecked(who, c.token, c.t, value);
          s = await assertInvariants(c.token, c.t, s, 'buy');
        } else {
          const bal: bigint = await c.t.balanceOf(who.address);
          if (bal === 0n) continue;
          const amount = (bal * between(next, 1n, 100n)) / 100n;
          if (amount === 0n) continue;
          const q = await pad.quoteSell(c.token, amount);
          if (q[0] === 0n) continue;
          await sellChecked(who, c.token, c.t, amount);
          s = await assertInvariants(c.token, c.t, s, 'sell');
        }

        if (naA) sa = s;
        else sb = s;

        // Krzywa, ktorej NIE dotykalismy, nie drgnela ani o wei.
        const inna = naA ? await snap(b.token) : await snap(a.token);
        const oczekiwana = naA ? sb : sa;
        expect(inna.eth, 'cudza rezerwa ETH').to.equal(oczekiwana.eth);
        expect(inna.tok, 'cudza rezerwa tokena').to.equal(oczekiwana.tok);

        // Zobowiazania globalne pokrywaja OBIE krzywe naraz.
        expect(await ethers.provider.getBalance(padAddr)).to.equal(await pad.totalLiabilities());
        expect(await pad.totalLiabilities()).to.be.greaterThanOrEqual(sa.eth + sb.eth);
      }
    });

    it('petla pyla: 150 kupien po 1-3 wei nie zabiera z rezerwy ani jednego wei', async function () {
      // Wektor A5: na Base gaz jest tani, wiec petla mikro-transakcji przeciw
      // zaokragleniu OPLACILABY sie, gdyby ktorekolwiek zaokraglenie szlo na
      // korzysc wolajacego. Sprawdzamy nie "srednio", tylko po kazdym kroku.
      const { token, t } = await openCurve();
      let s = await snap(token);
      let ok = 0;
      let dust = 0;

      for (let i = 0; i < 150; i++) {
        const value = BigInt(1 + (i % 3));
        const q = await pad.quoteBuy(token, value);
        if (q[0] === 0n) {
          await expect(
            pad.connect(alice).buy(token, 1n, MAX_UINT, { value })
          ).to.be.revertedWithCustomError(pad, 'DustTrade');
          dust++;
          continue;
        }
        const before = s;
        await pad.connect(alice).buy(token, 1n, MAX_UINT, { value });
        s = await assertInvariants(token, t, before, 'buy');
        expect(s.eth, 'rezerwa nie maleje po mikro-kupnie').to.be.greaterThanOrEqual(before.eth);
        ok++;
      }
      expect(dust, 'kupno za 1 wei musi sie odbijac').to.be.greaterThan(0);
      expect(ok, 'kupna za 2-3 wei przechodza').to.be.greaterThan(0);

      // Odsprzedaz calego zebranego pyla nie moze oddac wiecej, niz kosztowal.
      await t.connect(alice).approve(padAddr, MAX_UINT);
      const bal: bigint = await t.balanceOf(alice.address);
      const q = await pad.quoteSell(token, bal);
      expect(q[0] + q[1], 'zwrot z pyla <= rezerwa').to.be.lessThanOrEqual(s.eth);
    });
  });

  /* ===================================================================== */
  /*  3. WYPLACALNOSC - TEST, KTORY PRZEWRACA ZLY LAUNCHPAD                 */
  /* ===================================================================== */

  describe('wyplacalnosc', function () {
    /**
     * Po dowolnej sekwencji KAZDY posiadacz ma dac rade odsprzedac wszystko,
     * a kontrakt ma miec na to ETH.
     *
     * Jedyny dopuszczalny wyjatek jest nazwany i zmierzony: pozycja tak mala,
     * ze jej wartosc rynkowa to zero wei. Test liczy laczna wartosc takich
     * resztek i asertuje, ze jest znikoma - inaczej "nikt nie jest uwieziony"
     * bylo by zdaniem z gwiazdka.
     */
    async function drainEveryone(token: string, t: any, holders: any[], startSnap: Snap) {
      let s = startSnap;
      let paidOut = 0n;
      let dustLeft = 0n;

      for (const h of holders) {
        const bal: bigint = await t.balanceOf(h.address);
        if (bal === 0n) continue;
        const q = await pad.quoteSell(token, bal);
        if (q[0] === 0n) {
          dustLeft += q[0] + q[1];
          continue;
        }
        const balBefore = await ethers.provider.getBalance(padAddr);
        const r = await sellChecked(h, token, t, bal);
        const balAfter = await ethers.provider.getBalance(padAddr);

        // Kontrakt naprawde wyplacil - i naprawde mial z czego.
        expect(balBefore - balAfter, 'wyplacone == to, co obiecal quoteSell').to.equal(r.net);
        expect(await t.balanceOf(h.address), 'posiadacz wyszedl do zera').to.equal(0n);
        paidOut += r.net;
        s = await assertInvariants(token, t, s, 'sell');
      }
      return { s, paidOut, dustLeft };
    }

    it('po losowej sekwencji wszyscy wychodza do zera, a kontrakt ma na to ETH', async function () {
      const next = mkRng(0x5017);
      const actors = [alice, bob, carol, dave];
      const { token, t } = await openCurve();
      for (const a of actors) await t.connect(a).approve(padAddr, MAX_UINT);

      let s = await snap(token);
      let paidIn = 0n;

      // Faza 1: losowy chaos.
      for (let i = 0; i < 45; i++) {
        const who = actors[Number(next() % 4n)];
        if (next() % 100n < 70n && s.state === CURVE) {
          const value = randomAmount(next, ethers.parseEther('0.8'));
          const q = await pad.quoteBuy(token, value);
          if (q[0] === 0n) continue;
          const r = await buyChecked(who, token, t, value);
          paidIn += value - r.refund;
          s = await assertInvariants(token, t, s, 'buy');
        } else {
          const bal: bigint = await t.balanceOf(who.address);
          if (bal < 10n ** 15n) continue;
          const amount = bal / between(next, 2n, 6n);
          const q = await pad.quoteSell(token, amount);
          if (q[0] === 0n) continue;
          await sellChecked(who, token, t, amount);
          s = await assertInvariants(token, t, s, 'sell');
        }
      }

      // Faza 2: WSZYSCY wychodza.
      const drain = await drainEveryone(token, t, actors, s);
      s = drain.s;

      // Nikt nie zostal z niczym wartosciowym.
      expect(drain.dustLeft, 'laczna wartosc resztek nie do sprzedania').to.be.lessThan(10n);

      // Cala podaz wrocila na krzywe (poza pylem, ktorego nikt nie sprzedal).
      expect(T0 - s.tok, 'w obiegu zostal tylko pyl').to.be.lessThan(10n ** 12n);

      // Rezerwa zeszla prawie do zera, ale NIE ponizej: R_VIRT nigdy nie
      // wychodzi, wiec bilans domyka sie sam.
      expect(s.eth).to.be.greaterThanOrEqual(0n);
      expect(s.bal).to.equal(s.liab);

      // Gra o sumie ujemnej - roznica to dokladnie oplaty plus to, co zostalo.
      expect(drain.paidOut).to.be.lessThan(paidIn);
    });

    it('jeden posiadacz kupuje CALA podaz krzywej i sprzedaje ja naraz', async function () {
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);

      let s = await snap(token);
      // 5 ETH: dociagniecie sprowadza tokenReserve na T_MIN, reszta wraca.
      const r = await buyChecked(alice, token, t, ethers.parseEther('5'));
      s = await assertInvariants(token, t, s, 'buy');
      expect(s.state, 'krzywa domknieta').to.equal(LOCKED);
      expect(s.tok).to.equal(T_MIN);
      expect(await t.balanceOf(alice.address)).to.equal(T0 - T_MIN);
      expect(r.refund, 'nadwyzka wrocila').to.be.greaterThan(0n);

      // Sprzedaz CALEJ podazy w obiegu, w jednej transakcji.
      const whole = await t.balanceOf(alice.address);
      const q = await pad.quoteSell(token, whole);
      expect(q[0] + q[1], 'gross nie przekracza rezerwy').to.be.lessThanOrEqual(s.eth);

      await sellChecked(alice, token, t, whole);
      s = await assertInvariants(token, t, s, 'sell');

      expect(s.tok, 'cala podaz wrocila').to.equal(T0);
      expect(s.eth, 'rezerwa zeszla do pyla').to.be.lessThan(10n);
      expect(s.bal).to.equal(s.liab);
      expect(await t.balanceOf(alice.address)).to.equal(0n);

      // Krzywa zostaje Locked i pusta - nikt nie jest uwieziony, bo nikt nic nie ma.
      expect(s.state).to.equal(LOCKED);
      await expect(pad.graduate(token)).to.be.revertedWithCustomError(
        pad,
        'ReserveTooSmallToGraduate'
      );
    });

    it('I-C9: sprzedaz dziala takze wtedy, gdy awans jest trwale niemozliwy', async function () {
      // Wszystkie cztery pule zatrute -> `graduate` rewertuje na zawsze.
      // To jest najgorszy osiagalny stan i wlasnie w nim sprzedaz MUSI dzialac.
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);
      await t.connect(bob).approve(padAddr, MAX_UINT);
      await buyChecked(alice, token, t, ethers.parseEther('2'));
      await buyChecked(bob, token, t, ethers.parseEther('3'));

      // Przedtem ten stan osiagalo sie zatruwajac wszystkie cztery pule.
      // Zatrucie juz nie istnieje (hook-brama), a prog `MIN_GRAD_RESERVE` -
      // druga dawna przyczyna - zostal usuniety razem ze stala oplata. Zostala
      // JEDNA: rezerwa zbita do zera, czyli `eLp == 0`. Zeby tam dojsc, obaj
      // posiadacze musza wyjsc do konca - i wlasnie to jest tresc tego testu:
      // w najgorszym osiagalnym stanie sprzedaz MUSI dzialac.
      for (const kto of [alice, bob]) {
        const bal: bigint = await t.balanceOf(kto.address);
        if (bal > 0n) await pad.connect(kto).sell(token, bal, 1n, MAX_UINT);
      }
      // Zaokraglenia sprzedazy dzialaja na korzysc krzywej, wiec rezerwa
      // schodzi do PYLU, nie zawsze dokladnie do zera.
      const pyl = (await pad.launchOf(token))[2] as bigint;
      expect(pyl, 'rezerwa zeszla do pylu').to.be.lessThan(10n);

      // Ten rewert stoi na progu `MIN_LP_ETH`, nie na `eLp == 0`. Przedtem
      // warunek brzmial `eLp == 0` i TEN TEST GO PRZEWROCIL: oplata 3% z pylu
      // zaokragla sie do zera, wiec `eLp` bylo rowne rezerwie i niezerowe,
      // plynnosc z kilku wei tez wychodzila niezerowa - i awans PRZECHODZIL,
      // otwierajac wieczna pule z pylem w srodku.
      expect(pyl, 'pyl jest ponizej progu plynnosci').to.be.lessThan(
        await pad.MIN_LP_ETH()
      );
      await expect(pad.graduate(token)).to.be.revertedWithCustomError(
        pad,
        'ReserveTooSmallToGraduate'
      );

      let s = await snap(token);
      expect(s.state).to.equal(LOCKED);
      const drain = await drainEveryone(token, t, [alice, bob], s);
      expect(drain.dustLeft).to.be.lessThan(10n);
      expect(drain.s.tok).to.equal(T0);
      expect(drain.s.bal).to.equal(drain.s.liab);
    });

    it('straznik wyplacalnosci odpala, gdy ktos probuje sprzedac wiecej, niz istnieje w obiegu', async function () {
      // Scenariusz niemozliwy na produkcji (podaz jest zamknieta), ale to
      // WLASNIE dlatego straznik `gross > ethReserve` musi byc sprawdzony:
      // jego zadaniem jest nie dopuscic, zeby ksiegowosc krzywej wyplacila
      // cudze pieniadze, gdyby zalozenie o zamknietej podazy kiedys upadlo.
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);
      await buyChecked(alice, token, t, ethers.parseEther('1'));

      // Atrapa pozwala dodrukowac - prawdziwy B20 nie pozwoli, bo nie ma roli.
      await t.mint(alice.address, T0);
      const s = await snap(token);
      const huge: bigint = await t.balanceOf(alice.address);
      await expect(
        pad.connect(alice).sell(token, huge, 1n, MAX_UINT)
      ).to.be.revertedWithCustomError(pad, 'Arithmetic');

      // Stan nietkniety - odbity atak nie kosztowal krzywej ani wei.
      const after = await snap(token);
      expect(after.eth).to.equal(s.eth);
      expect(after.tok).to.equal(s.tok);
    });
  });

  /* ===================================================================== */
  /*  4. PROG I AWANS                                                       */
  /* ===================================================================== */

  describe('prog i awans', function () {
    /** Sprowadza rezerwe ETH mozliwie blisko `target`, sprzedazami w stanie Locked. */
    async function sellDownTo(token: string, t: any, who: any, target: bigint) {
      const l = await pad.launchOf(token);
      const eth = l[2] as bigint;
      if (eth <= target) return;
      const bal: bigint = await t.balanceOf(who.address);
      let lo = 0n;
      let hi = bal;
      // Najwieksza ilosc, ktorej sprzedaz jeszcze zostawia rezerwe >= target.
      while (lo < hi) {
        const mid = (lo + hi + 1n) / 2n;
        const q = await pad.quoteSell(token, mid);
        if (eth - (q[0] + q[1]) >= target) lo = mid;
        else hi = mid - 1n;
      }
      if (lo === 0n) return;
      await pad.connect(who).sell(token, lo, 1n, MAX_UINT);
    }

    it('dociagniecie trafia w T_MIN co do JEDNOSTKI i zbiera dokladnie 3 ETH', async function () {
      const { token, t } = await openCurve();
      let s = await snap(token);
      const r = await buyChecked(alice, token, t, ethers.parseEther('9'));
      s = await assertInvariants(token, t, s, 'buy');

      expect(s.tok, 'tokenReserve == T_MIN co do jednostki').to.equal(T_MIN);
      // §2.1: zbiorka do awansu G = 3.00 ETH dokladnie (plus pyl z zaokraglenia
      // `need` w gore - zawsze w gore, wiec zawsze na korzysc krzywej).
      expect(s.eth).to.be.greaterThanOrEqual(ethers.parseEther('3'));
      expect(s.eth - ethers.parseEther('3'), 'pyl ponad 3 ETH').to.be.lessThan(10n);
      expect(r.refund).to.be.greaterThan(ethers.parseEther('5.9'));
    });

    it('granica dociagniecia: o wei mniej - bez zwrotu, o wei wiecej - ze zwrotem', async function () {
      const { token, t } = await openCurve();

      // Najmniejsza kwota, przy ktorej wycena wchodzi w galaz dociagniecia.
      let lo = 1n;
      let hi = ethers.parseEther('5');
      while (lo < hi) {
        const mid = (lo + hi) / 2n;
        const q = await pad.quoteBuy(token, mid);
        if (q[0] >= T0 - T_MIN) hi = mid;
        else lo = mid + 1n;
      }

      const below = await pad.quoteBuy(token, lo - 1n);
      expect(below[0], 'ponizej progu: nie domyka krzywej').to.be.lessThan(T0 - T_MIN);
      expect(below[2], 'ponizej progu: zadnego zwrotu').to.equal(0n);

      const at = await pad.quoteBuy(token, lo);
      expect(at[0], 'na progu: dokladnie reszta do T_MIN').to.equal(T0 - T_MIN);

      // Kupno o wei wieksze musi oddac te nadwyzke, a nie polknac.
      const above = await pad.quoteBuy(token, lo + 1000n);
      expect(above[0]).to.equal(T0 - T_MIN);
      expect(above[2], 'nadwyzka wraca do kupujacego').to.be.greaterThan(0n);

      let s = await snap(token);
      await buyChecked(alice, token, t, lo);
      s = await assertInvariants(token, t, s, 'buy');
      expect(s.tok).to.equal(T_MIN);
      expect(s.state).to.equal(LOCKED);
    });

    it('I-X1..I-X5: pelna sciezka awansu zachowuje podaz i cene co do bitu', async function () {
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);
      await t.connect(bob).approve(padAddr, MAX_UINT);

      let s = await snap(token);
      await buyChecked(alice, token, t, ethers.parseEther('1.7'));
      s = await assertInvariants(token, t, s, 'buy');
      await buyChecked(bob, token, t, ethers.parseEther('4'));
      s = await assertInvariants(token, t, s, 'buy');
      expect(s.state).to.equal(LOCKED);

      const ethAtLock: bigint = s.eth;
      const terminal: bigint = await pad.SQRT_PRICE_TERMINAL();
      const key = await pad.poolKeyOf(token);
      // Saldo PoolManagera mierzymy PRZYROSTEM, nie wartoscia bezwzgledna:
      // atrapa siedzi pod stalym adresem i przezywa wszystkie testy w pliku,
      // wiec lezy na niej ETH z wczesniejszych awansow.
      const pmBefore = await ethers.provider.getBalance(POOL_MANAGER);

      const rc = await (await pad.connect(carol).graduate(token)).wait();
      const ev = pickEvent(rc, pad.interface, 'Graduated');
      s = await assertInvariants(token, t, s, 'graduate');

      // I-X5: cena puli tuz po zasileniu jest DOKLADNIE terminalna.
      expect(await poolPrice(key), 'I-X5').to.equal(terminal);
      expect(ev.args[7], 'Graduated.sqrtPriceX96').to.equal(terminal);

      // I-X4: podaz rozklada sie bez ubytku.
      const holders = [alice, bob, carol, dave, creator, treasury, deployer];
      let sum = 0n;
      for (const h of holders) sum += await t.balanceOf(h.address);
      sum += await t.balanceOf(POOL_MANAGER);
      sum += await t.balanceOf(DEAD);
      sum += await t.balanceOf(padAddr);
      sum += await t.balanceOf(await vault.getAddress());
      expect(sum, 'I-X4 pula + dead + posiadacze == T0').to.equal(T0);

      // Do puli poszlo CALE ETH poza pylem; oplata awansowa zostala jako salda.
      const eLp = ethAtLock - gradFeeOf(ethAtLock);
      // Rzutujemy OPERANDY, nie wynik: ethers oddaje salda jako `any`,
      // a `any - any` ma w TypeScripcie typ `number`, nie `bigint`.
      const doPuli = ((await ethers.provider.getBalance(POOL_MANAGER)) as bigint) - (pmBefore as bigint);
      expect(doPuli, 'ETH w puli <= eLp').to.be.lessThanOrEqual(eLp);
      expect(eLp - doPuli, 'pyl ETH').to.be.lessThan(100n);

      // Nagroda i udzial protokolu z oplaty awansowej - suma co do wei.
      expect(await pad.claimable(carol.address)).to.equal(gradRewardOf(ethAtLock));
      const protoFromGrad = gradFeeOf(ethAtLock) - gradRewardOf(ethAtLock);
      expect(await pad.claimable(treasury.address)).to.be.greaterThanOrEqual(protoFromGrad);

      // I-X1: zapadka. Nic juz nie przejdzie.
      await expect(
        pad.connect(bob).buy(token, 1n, MAX_UINT, { value: 1000n })
      ).to.be.revertedWithCustomError(pad, 'AlreadyGraduated');
      await expect(
        pad.connect(bob).sell(token, 1000n, 1n, MAX_UINT)
      ).to.be.revertedWithCustomError(pad, 'AlreadyGraduated');
      await expect(pad.graduate(token)).to.be.revertedWithCustomError(pad, 'AlreadyGraduated');
      await expect(pad.quoteBuy(token, 1000n)).to.be.revertedWithCustomError(pad, 'AlreadyGraduated');
      await expect(pad.quoteSell(token, 1000n)).to.be.revertedWithCustomError(pad, 'AlreadyGraduated');
      await expect(pad.spotPriceWeiPerToken(token)).to.be.revertedWithCustomError(
        pad,
        'AlreadyGraduated'
      );

      // I-X7: pozycja zapisana raz; vault nie przyjmie drugiego zasilenia
      // z zadnego adresu - a launchpad nie ma juz sciezki, ktora by je zawolala.
      expect(await vault.seeded(token)).to.equal(true);
      await expect(
        vault.connect(alice).seed(token, creator.address, plainKey(key), terminal)
      ).to.be.revertedWithCustomError(vault, 'NotLaunchpad');
    });

    it('awans z rezerwy przerzedzonej sprzedazami - dla szesciu roznych poziomow', async function () {
      // W stanie Locked sprzedaze zbijaja rezerwe. Do puli i tak idzie CALE
      // pozostale ETH po cenie TERMINALNEJ - wiec pula otwiera sie POWYZEJ
      // biezacej ceny krzywej, czyli luka jest na niekorzysc pierwszego
      // handlujacego w puli. To jest wymagany kierunek (B1) i tu go mierzymy.
      const terminal: bigint = await pad.SQRT_PRICE_TERMINAL();

      // Poziomy schodza teraz DUZO nizej niz dawny prog 2 ETH, bo progu nie ma.
      // To nie jest rozluznienie testu, tylko jego sedno: znalezisko #4 mowilo,
      // ze przy niskiej rezerwie stala oplata 0.1 ETH zzera pokrycie. Oplata
      // procentowa ma przy 0.2 ETH zabrac 3%, tak samo jak przy 2.9 ETH -
      // i asercja `amount0 + dust == eLp` ponizej pilnuje tego przy KAZDYM
      // poziomie, wiec regresja do stalej oplaty wywalilaby dolne poziomy.
      for (const targetEth of ['2.9', '2.6', '2.3', '2.05', '1.0', '0.2']) {
        const { token, t } = await openCurve();
        await t.connect(alice).approve(padAddr, MAX_UINT);
        let s = await snap(token);
        await buyChecked(alice, token, t, ethers.parseEther('5'));
        s = await assertInvariants(token, t, s, 'buy');

        await sellDownTo(token, t, alice, ethers.parseEther(targetEth));
        s = await assertInvariants(token, t, s, 'sell');
        expect(s.eth, `rezerwa dla celu ${targetEth}`).to.be.greaterThan(0n);

        const eLp = s.eth - gradFeeOf(s.eth);
        // Po sprzedazach w stanie Locked na krzywej jest WIECEJ tokena niz
        // T_MIN - i cala ta nadwyzka idzie do puli albo na adres martwy.
        const tokAtGrad = s.tok;
        const pmBefore = await ethers.provider.getBalance(POOL_MANAGER);
        const rc = await (await pad.connect(bob).graduate(token)).wait();
        s = await assertInvariants(token, t, s, 'graduate');

        const seeded = pickEvent(rc, vault.interface, 'Seeded');
        expect(seeded, 'zdarzenie Seeded').to.not.equal(null);
        const amount0 = seeded.args[4] as bigint;
        const amount1 = seeded.args[5] as bigint;
        const dust = seeded.args[6] as bigint;

        // Kluczowe: pula nie moze zazadac wiecej ETH, niz mamy. Gdyby
        // `getLiquidityForAmount0` bylo o wei za hojne, tu byloby odejmowanie
        // ponizej zera - i awans padalby dla NIEKTORYCH kwot, co jest gorsze
        // niz padanie dla wszystkich.
        expect(amount0, `amount0 <= eLp przy ${targetEth}`).to.be.lessThanOrEqual(eLp);
        expect(amount0 + dust).to.equal(eLp);
        expect(dust, `pyl ETH przy ${targetEth}`).to.be.lessThan(100n);
        expect((await ethers.provider.getBalance(POOL_MANAGER)) - pmBefore).to.equal(amount0);

        // Cena puli po zasileniu nadal terminalna, co do bitu.
        const key = await pad.poolKeyOf(token);
        expect(await poolPrice(key), `I-X5 przy ${targetEth}`).to.equal(terminal);

        // Token: tyle, ile pula wziela, reszta na adres martwy - bez ubytku.
        // Wartosc odniesienia to rezerwa Z CHWILI AWANSU, nie T_MIN: sprzedaze
        // w stanie Locked oddaly tokeny krzywej i one tez ida do rozdzialu.
        // Im wiecej ktos sprzedal przed awansem, tym wiecej sztuk lezy na
        // adresie martwym - to jest fakt produktowy, nie szczegol testu.
        expect(tokAtGrad, 'sprzedaze podniosly rezerwe tokena').to.be.greaterThanOrEqual(T_MIN);
        expect(amount1 + (seeded.args[7] as bigint), 'token do puli + na dead').to.equal(tokAtGrad);
        expect(await t.balanceOf(await vault.getAddress())).to.equal(0n);
      }
    });

    it('awans na calym OSIAGALNYM zakresie eLp - 15 poziomow tuz nad progiem', async function () {
      // To jest miejsce, w ktorym najlatwiej o blad o jedno wei, i jedyne,
      // w ktorym taki blad kosztuje CALA pule.
      //
      // `L` liczymy z ETH w DOL, a pula liczy z powrotem `amount0` w GORE -
      // dwa razy, bo `getAmount0Delta` ma dwa zaokraglenia. Jesli te dwa
      // sufity kiedykolwiek przebija podloge, `msg.value - amount0` schodzi
      // ponizej zera i awans PADA - ale tylko dla NIEKTORYCH kwot, czyli
      // w sposob, ktorego nie widac na jednym ladnym przebiegu.
      //
      // Sprawdzamy wiec caly rzad wielkosci: od 1 wei do calej zbiorki.
      const terminal: bigint = await pad.SQRT_PRICE_TERMINAL();
      // Progu juz nie ma, wiec nie ma tez granicy, przy ktorej trzeba usiasc.
      // `BAZA` jest teraz zwyklym, NISKIM punktem zaczepienia - wystarczajaco
      // niskim, zeby `eLp` bylo o rzad wielkosci mniejsze od pelnej zbiorki,
      // i wystarczajaco wysokim, zeby plynnosc wyszla niezerowa. To, co ten
      // test naprawde bada, siedzi w `cel`: przebiega on NAJMLODSZE bity
      // rezerwy, a bledy zaokraglen mieszkaja wlasnie tam.
      const BAZA = ethers.parseEther('0.2');
      const poziomy = [
        0n, 1n, 2n, 3n, 5n, 7n, 13n, 99n, 1000n, 65537n,
        10n ** 6n, 10n ** 9n, 12345678901n, 10n ** 12n, 10n ** 15n, 10n ** 16n
      ];
      let najmniejszy = MAX_UINT;

      for (const cel of poziomy) {
        const { token, t } = await openCurve();
        await t.connect(alice).approve(padAddr, MAX_UINT);
        let s = await snap(token);
        await buyChecked(alice, token, t, ethers.parseEther('5'));
        s = await assertInvariants(token, t, s, 'buy');

        await sellDownTo(token, t, alice, BAZA + cel);
        s = await assertInvariants(token, t, s, 'sell');

        const eLp = s.eth - gradFeeOf(s.eth);
        expect(eLp, `cel ${cel}`).to.be.greaterThan(0n);
        if (eLp < najmniejszy) najmniejszy = eLp;

        const rc = await (await pad.connect(bob).graduate(token)).wait();
        s = await assertInvariants(token, t, s, 'graduate');
        const seeded = pickEvent(rc, vault.interface, 'Seeded');

        const liquidity = seeded.args[3] as bigint;
        const amount0 = seeded.args[4] as bigint;
        const dust = seeded.args[6] as bigint;

        // Pula NIE MOZE zazadac wiecej ETH, niz jej daliśmy.
        expect(amount0, `amount0 <= eLp przy eLp=${eLp}`).to.be.lessThanOrEqual(eLp);
        expect(amount0 + dust, `bilans ETH przy eLp=${eLp}`).to.equal(eLp);
        // Plynnosc zerowa oznaczalaby pule bez glebokosci - vault ma to odbic,
        // wiec jesli tu jestesmy, musi byc niezerowa.
        expect(liquidity, `L > 0 przy eLp=${eLp}`).to.be.greaterThan(0n);
        expect(await poolPrice(await pad.poolKeyOf(token))).to.equal(terminal);
      }

      // Asercja pilnuje, ze petla naprawde zeszla na `BAZA`, a nie utknela
      // wyzej przez `sellDownTo`, ktore trafia w cel od GORY. Nie zadamy tu
      // rownosci co do wei: `sellDownTo` szuka po ILOSCI TOKENA, wiec ostatni
      // krok moze zostawic pyl ponad celem. Zadamy tego, co ten test ma
      // dowiesc - ze zbadany `eLp` lezy w dolnym rzedzie wielkosci.
      expect(najmniejszy, 'najmniejszy zbadany eLp').to.be.lessThan(BAZA);
      expect(najmniejszy, 'najmniejszy zbadany eLp').to.be.greaterThan(BAZA / 2n);
    });

    it('galaz dociagniecia nie potrafi rzucic Arithmetic - 12 stanow x 9 kwot wokol granicy', async function () {
      // `Arithmetic` w `_quoteBuy` jest ASERCJA, nie warunkiem biznesowym:
      // ma nigdy nie odpasc. Asercja, ktorej nikt nie probowal przewrocic,
      // jest zalozeniem. Probujemy ja przewrocic dokladnie tam, gdzie
      // przeliczana jest oplata - czyli na granicy galezi dociagniecia.
      const { token, t } = await openCurve();
      const nast = mkRng(0xa17);

      for (let iter = 0; iter < 12; iter++) {
        const s = await snap(token);
        if (s.state !== CURVE) break;
        const cap = s.tok - T_MIN;

        // Najmniejsza kwota, przy ktorej wycena wchodzi w galaz dociagniecia.
        let lo = 1n;
        let hi: bigint = await pad.MAX_BUY();
        while (lo < hi) {
          const mid = (lo + hi) / 2n;
          const q = await pad.quoteBuy(token, mid);
          if (q[0] >= cap) hi = mid;
          else lo = mid + 1n;
        }

        for (const delta of [-2n, -1n, 0n, 1n, 2n, 3n, 7n, 100n, 10n ** 9n]) {
          const v = lo + delta;
          if (v < 1n || v > (await pad.MAX_BUY())) continue;
          const q = await pad.quoteBuy(token, v); // rzuci Arithmetic, jesli asercja odpadnie
          // Ksiegowosc wyceny domyka sie co do wei niezaleznie od galezi.
          expect(q[1] + q[2], `fee + refund <= ${v}`).to.be.lessThanOrEqual(v);
          if (q[0] === cap) {
            // Galaz dociagniecia: tokeny przyciete DOKLADNIE do progu.
            expect(s.tok - q[0]).to.equal(T_MIN);
          } else {
            expect(q[2], 'poza galezia dociagniecia nie ma zwrotu').to.equal(0n);
          }
        }

        // Przesuwamy stan i probujemy jeszcze raz, z innej strony krzywej.
        const krok = randomAmount(nast, ethers.parseEther('0.35'));
        const q = await pad.quoteBuy(token, krok);
        if (q[0] === 0n) continue;
        await pad.connect(alice).buy(token, 1n, MAX_UINT, { value: krok });
      }
    });

    it('rezerwa 0.05 ETH - kiedys martwy punkt, dzis zwykly awans z mala oplata', async function () {
      // Ten test byl ODWROTNY: sprawdzal, ze przy rezerwie ponizej stalej
      // oplaty 0.1 ETH awans odmawia. Odwrocenie go jest cala tresc zmiany
      // "stala oplata -> procent rezerwy": rezerwa 0.05 ETH nie jest juz
      // stanem, w ktorym token traci awans NA ZAWSZE. Oplata schodzi z nia.
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);
      let s = await snap(token);
      await buyChecked(alice, token, t, ethers.parseEther('5'));
      s = await assertInvariants(token, t, s, 'buy');

      await sellDownTo(token, t, alice, ethers.parseEther('0.05'));
      s = await assertInvariants(token, t, s, 'sell');
      const rezerwa = s.eth;
      expect(rezerwa, 'rezerwa pod dawna stala oplata').to.be.lessThan(ethers.parseEther('0.1'));

      // Kontrakt i test licza oplate osobno i musza sie zgodzic co do wei.
      const [feeZKontraktu, nagrodaZKontraktu] = await pad.gradFeeOf(token);
      expect(feeZKontraktu).to.equal(gradFeeOf(rezerwa));
      expect(nagrodaZKontraktu).to.equal(gradRewardOf(rezerwa));

      await pad.connect(bob).graduate(token);
      s = await assertInvariants(token, t, s, 'graduate');
      expect(s.state).to.equal(GRADUATED);
      expect(await pad.claimable(bob.address)).to.equal(gradRewardOf(rezerwa));

      // Sedno znaleziska #4: oplata NIE zjada pokrycia. Przy 0.05 ETH zabiera
      // 3%, tak samo jak przy 3 ETH - stara stala zabralaby tu ponad 100%.
      expect(feeZKontraktu * 100n, 'oplata to najwyzej 3% rezerwy').to.be.lessThanOrEqual(
        rezerwa * 3n
      );
    });

    /**
     * Tu staly dwa testy wyboru puli - "awans wybiera pierwsza CZYSTA pule"
     * i "CUDZA pula jest pomijana, nawet gdy jej cena jest DOKLADNIE
     * terminalna". Oba opisywaly maske `poolsMask` i `_pickCleanPool`, ktorych
     * juz nie ma: pula jest jedna i nikt obcy nie moze jej otworzyc. W ich
     * miejsce wchodza dwa zdania o nowym stanie rzeczy.
     */
    it('napastnik w TEJ SAMEJ transakcji nie otworzy naszej puli', async function () {
      const terminal: bigint = await pad.SQRT_PRICE_TERMINAL();
      const FR = await ethers.getContractFactory('PoolFrontRunner');
      const fr = await FR.deploy(padAddr);
      await fr.waitForDeployment();

      // Sonda zna adres tokena, ktory dopiero powstanie - jest w tym samym
      // bloku, wiec `blockhash(block.number - 1)` jej nie zatrzymuje. Mimo to
      // brama hooka odrzuca ja na `beforeInitialize`.
      await expect(fr.frontRunOurPool(terminal)).to.be.revertedWithCustomError(hook, 'NotVault');
    });

    it('CUDZA pula bez naszego hooka powstaje - i nie rusza naszego awansu', async function () {
      const terminal: bigint = await pad.SQRT_PRICE_TERMINAL();
      const FR = await ethers.getContractFactory('PoolFrontRunner');
      const fr = await FR.deploy(padAddr);
      await fr.waitForDeployment();

      // Nie udajemy, ze da sie zakazac cudzych pul na te sama pare. Nie da sie -
      // ani nam, ani Clankerowi. Zdanie, ktore nas obowiazuje, jest wezsze:
      // NASZA pula ma powstac tam, gdzie miala, i z nasza cena.
      const rc = await (await fr.frontRunForeignPoolThenLaunch(terminal + 12345n)).wait();
      const ev = pickEvent(rc, pad.interface, 'Launched');
      const token = ev.args[0] as string;
      expect(token, 'sonda przewidziala adres tokena').to.equal(await fr.lastToken());

      const t = await ethers.getContractAt('MockB20', token);
      await warp(WINDOW + 1);
      await buyChecked(alice, token, t, ethers.parseEther('5'));
      await pad.connect(bob).graduate(token);

      const pos = await vault.positionOf(token);
      expect(pos[0], 'plynnosc poszla do NASZEJ puli').to.equal(
        poolIdOf(await pad.poolKeyOf(token))
      );
      expect(await poolPrice(await pad.poolKeyOf(token))).to.equal(terminal);
    });

    it('graduate jest bezuprawnieniowe, ale tylko w stanie Locked', async function () {
      const { token, t } = await openCurve();
      await expect(pad.connect(dave).graduate(token)).to.be.revertedWithCustomError(pad, 'NotLocked');
      await expect(pad.graduate(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        pad,
        'UnknownToken'
      );
      await buyChecked(alice, token, t, ethers.parseEther('5'));
      // Adres, ktory nie ma z tym tokenem nic wspolnego, awansuje go i dostaje nagrode.
      const rezerwa = (await pad.launchOf(token))[2] as bigint;
      await pad.connect(dave).graduate(token);
      expect(await pad.claimable(dave.address)).to.equal(gradRewardOf(rezerwa));
    });
  });

  /* ===================================================================== */
  /*  5. PRZYPADKI BRZEGOWE                                                 */
  /* ===================================================================== */

  describe('przypadki brzegowe', function () {
    it('kupno za 1 wei odbija sie i nie rusza stanu ani o jednostke', async function () {
      const { token, t } = await openCurve();
      const before = await snap(token);
      await expect(
        pad.connect(alice).buy(token, 1n, MAX_UINT, { value: 1n })
      ).to.be.revertedWithCustomError(pad, 'DustTrade');
      // `quoteBuy` mowi to samo, co `buy`: zero tokenow za 1 wei.
      const q = await pad.quoteBuy(token, 1n);
      expect(q[0]).to.equal(0n);
      const after = await snap(token);
      expect(after.eth).to.equal(before.eth);
      expect(after.tok).to.equal(before.tok);
      expect(after.liab).to.equal(before.liab);
      // 2 wei: oplata 1 wei w gore, do rezerwy wchodzi 1 wei - i to juz kupuje.
      const q2 = await pad.quoteBuy(token, 2n);
      expect(q2[1]).to.equal(1n);
      expect(q2[0]).to.be.greaterThan(0n);
    });

    it('sprzedaz pyla odbija sie, ale prog "co jest pylem" jest znikomy', async function () {
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);
      await buyChecked(alice, token, t, ethers.parseEther('1'));

      await expect(
        pad.connect(alice).sell(token, 1n, 1n, MAX_UINT)
      ).to.be.revertedWithCustomError(pad, 'DustTrade');

      // Najmniejsza ilosc, ktora da sie sprzedac. Liczymy ja, a nie zgadujemy -
      // bo "nikt nie jest uwieziony" jest zdaniem o WIELKOSCI tej granicy.
      let lo = 1n;
      let hi = 10n ** 18n;
      while (lo < hi) {
        const mid = (lo + hi) / 2n;
        const q = await pad.quoteSell(token, mid);
        if (q[0] > 0n) hi = mid;
        else lo = mid + 1n;
      }
      // Granica ma byc ponizej 1e-8 tokena - czyli ponizej wartosci, ktorej
      // istnienia nie widac na zadnym interfejsie.
      expect(lo, 'najmniejsza sprzedawalna ilosc').to.be.lessThan(10n ** 10n);
      await sellChecked(alice, token, t, lo);
    });

    it('dotacja ETH wprost na kontrakt: zwykly przelew ODBIJA sie', async function () {
      // Brak `receive()` i `fallback()` jest tu CECHA: pierwsza linia obrony
      // przed "dotacja przesuwa cene" jest taka, ze dotacji nie da sie wyslac.
      await expect(
        deployer.sendTransaction({ to: padAddr, value: ethers.parseEther('1') })
      ).to.be.reverted;
    });

    it('dotacja wymuszona nie rusza ceny, wyceny, progu ani niczyjego salda', async function () {
      const { token, t } = await openCurve();
      await buyChecked(alice, token, t, ethers.parseEther('1'));

      const before = await snap(token);
      const priceBefore: bigint = await pad.spotPriceWeiPerToken(token);
      const quoteBefore = await pad.quoteBuy(token, ethers.parseEther('1'));
      const claimBefore: bigint = await pad.claimable(treasury.address);

      // `hardhat_setBalance` odwzorowuje to, czego nie da sie zablokowac na
      // zadnym kontrakcie: wymuszony przyplyw ETH (selfdestruct, nagroda
      // blokowa). Zaden odczyt w wycenie nie dotyka `address(this).balance`,
      // wiec nie ma czego przesunac - i wlasnie to tu mierzymy.
      const donation = ethers.parseEther('50');
      await hre.network.provider.send('hardhat_setBalance', [
        padAddr,
        '0x' + (before.bal + donation).toString(16)
      ]);

      expect(await pad.spotPriceWeiPerToken(token)).to.equal(priceBefore);
      const quoteAfter = await pad.quoteBuy(token, ethers.parseEther('1'));
      expect(quoteAfter[0]).to.equal(quoteBefore[0]);
      expect(quoteAfter[1]).to.equal(quoteBefore[1]);
      expect(await pad.claimable(treasury.address)).to.equal(claimBefore);
      expect(await pad.totalLiabilities()).to.equal(before.liab);

      // Prog liczy sie na TOKENIE, wiec dotacja nie moze go wyzwolic.
      const mid = await snap(token);
      expect(mid.state).to.equal(CURVE);
      expect(mid.eth).to.equal(before.eth);
      expect(mid.tok).to.equal(before.tok);

      // Handel po dotacji zachowuje sie identycznie i niezmienniki trzymaja
      // (teraz juz jako nierownosc - nadwyzka jest bezpanska).
      const s2 = await assertInvariants(token, t, before, 'none', true);
      await buyChecked(bob, token, t, ethers.parseEther('1'));
      const s3 = await assertInvariants(token, t, s2, 'buy', true);
      expect(s3.bal - s3.liab, 'dotacja zostaje nadwyzka, nikt jej nie widzi').to.equal(donation);

      // I nie da sie jej wyjac: nikt nie ma do niej salda.
      await expect(pad.connect(deployer).claim()).to.be.revertedWithCustomError(
        pad,
        'NothingToClaim'
      );
    });

    it('dotacja do vaulta jest przyjmowana i nieodzyskiwalna - i tak jest opisana', async function () {
      // `receive()` w vaulcie istnieje TYLKO dlatego, ze `PoolManager.take`
      // placi natywne ETH zwyklym `call`. Konsekwencje trzeba pokazac, a nie
      // przemilczec: przyslane tu ETH nie ma zadnej sciezki wyjscia.
      const vaultAddr = await vault.getAddress();
      await deployer.sendTransaction({ to: vaultAddr, value: ethers.parseEther('1') });
      expect(await ethers.provider.getBalance(vaultAddr)).to.equal(ethers.parseEther('1'));
      expect(await vault.claimableEth(deployer.address)).to.equal(0n);
      await expect(vault.connect(deployer).claimEth()).to.be.revertedWithCustomError(
        vault,
        'NothingToClaim'
      );
    });

    it('kupno na granicy MAX_BUY przechodzi, o wei wieksze rewertuje', async function () {
      const { token, t } = await openCurve();
      const max: bigint = await pad.MAX_BUY();
      await expect(
        pad.connect(alice).buy(token, 1n, MAX_UINT, { value: max + 1n })
      ).to.be.revertedWithCustomError(pad, 'BuyTooLarge');
      // Caly sufit i tak zostanie dociagniety do progu - reszta wraca.
      let s = await snap(token);
      const r = await buyChecked(alice, token, t, max);
      s = await assertInvariants(token, t, s, 'buy');
      expect(s.tok).to.equal(T_MIN);
      // Granica jest WYPROWADZONA z parametrow wdrozenia, a nie wpisana recznie.
      // Stalo tu `96`, czyli "100 minus zbiorka i troche" - liczba prawdziwa
      // wylacznie dopoki sufit rowna sie 100. Od 2026-08-14 sufit skaluje sie
      // z R_VIRT (132x), wiec przy tej samej skali wynosi 99 i asercja padala,
      // mimo ze kontrakt zwracal poprawnie. Kupno pochlania najwyzej prog plus
      // oplate od niego (sufit oplaty to 1%), a 2% zapasu miesci kazde
      // zaokraglenie.
      const target = R_VIRT * 4n;
      expect(r.refund).to.be.greaterThan(max - target - target / 50n);
    });

    it('operacje na nieznanym tokenie rewertuja UnknownToken, a nie cicho przechodza', async function () {
      const obcy = '0x00000000000000000000000000000000000000ff';
      await expect(
        pad.connect(alice).buy(obcy, 1n, MAX_UINT, { value: 1000n })
      ).to.be.revertedWithCustomError(pad, 'UnknownToken');
      await expect(
        pad.connect(alice).sell(obcy, 1000n, 1n, MAX_UINT)
      ).to.be.revertedWithCustomError(pad, 'UnknownToken');
      await expect(pad.quoteBuy(obcy, 1000n)).to.be.revertedWithCustomError(pad, 'UnknownToken');
      await expect(pad.quoteSell(obcy, 1000n)).to.be.revertedWithCustomError(pad, 'UnknownToken');
      await expect(pad.spotPriceWeiPerToken(obcy)).to.be.revertedWithCustomError(
        pad,
        'UnknownToken'
      );
      await expect(pad.graduate(obcy)).to.be.revertedWithCustomError(pad, 'UnknownToken');
    });

    it('termin i poslizg sa OBOWIAZKOWE w obie strony', async function () {
      const { token, t } = await openCurve();
      const past = (await now()) - 1;
      await expect(
        pad.connect(alice).buy(token, 1n, past, { value: 1000n })
      ).to.be.revertedWithCustomError(pad, 'Expired');
      await expect(
        pad.connect(alice).buy(token, 0n, MAX_UINT, { value: 1000n })
      ).to.be.revertedWithCustomError(pad, 'SlippageRequired');
      await expect(
        pad.connect(alice).sell(token, 1000n, 0n, MAX_UINT)
      ).to.be.revertedWithCustomError(pad, 'SlippageRequired');
      await expect(
        pad.connect(alice).sell(token, 0n, 1n, MAX_UINT)
      ).to.be.revertedWithCustomError(pad, 'ZeroAmount');
      await expect(
        pad.connect(creator).launch('A', 'A', 0n, past)
      ).to.be.revertedWithCustomError(pad, 'Expired');
      // Start z ETH bez poslizgu idzie ta sama sciezka co kazde kupno.
      await expect(
        pad.connect(creator).launch('A', 'A', 0n, MAX_UINT, { value: 1000n })
      ).to.be.revertedWithCustomError(pad, 'SlippageRequired');

      // Poslizg naprawde dziala: zadamy o jednostke wiecej, niz wycena obiecuje.
      const q = await pad.quoteBuy(token, ethers.parseEther('1'));
      await expect(
        pad.connect(alice).buy(token, q[0] + 1n, MAX_UINT, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(pad, 'Slippage');
    });

    it('sellWithPermit sprzedaje bez wczesniejszego approve i przezywa zepsuty permit', async function () {
      const { token, t } = await openCurve();
      await buyChecked(alice, token, t, ethers.parseEther('1'));
      const held: bigint = await t.balanceOf(alice.address);
      expect(await t.allowance(alice.address, padAddr)).to.equal(0n);

      const dl = (await now()) + 3600;
      await pad
        .connect(alice)
        .sellWithPermit(token, held / 2n, 1n, MAX_UINT, dl, 27, ethers.ZeroHash, ethers.ZeroHash);
      expect(await t.balanceOf(alice.address)).to.equal(held - held / 2n);

      // Podpis zuzyty przez kogos innego w wyscigu: `permit` odpada, ale
      // allowance juz jest, wiec sprzedaz ma przejsc. Dlatego jest try/catch.
      await t.setPermitReverts(true);
      await t.connect(alice).approve(padAddr, MAX_UINT);
      const rest: bigint = await t.balanceOf(alice.address);
      await pad
        .connect(alice)
        .sellWithPermit(token, rest, 1n, MAX_UINT, dl, 27, ethers.ZeroHash, ethers.ZeroHash);
      expect(await t.balanceOf(alice.address)).to.equal(0n);

      // ...ale nieznany token odbija sie PRZED probą permita.
      await expect(
        pad
          .connect(alice)
          .sellWithPermit(DEAD, 1n, 1n, MAX_UINT, dl, 27, ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(pad, 'UnknownToken');
    });

    it('dwa niezalezne tokeny nie mieszaja sobie ksiegowosci', async function () {
      const a = await openCurve(creator);
      const b = await launchToken(alice);
      await warp(WINDOW + 1);

      let sa = await snap(a.token);
      let sb = await snap(b.token);

      await buyChecked(bob, a.token, a.t, ethers.parseEther('1'));
      sa = await assertInvariants(a.token, a.t, sa, 'buy');
      // Drugi token nietkniety.
      const sb2 = await snap(b.token);
      expect(sb2.eth).to.equal(sb.eth);
      expect(sb2.tok).to.equal(sb.tok);

      await buyChecked(carol, b.token, b.t, ethers.parseEther('2'));
      sb = await assertInvariants(b.token, b.t, sb2, 'buy');

      // Zobowiazania sa GLOBALNE i musza pokrywac obie krzywe naraz.
      const liab: bigint = await pad.totalLiabilities();
      expect(await ethers.provider.getBalance(padAddr)).to.equal(liab);
      expect(liab).to.be.greaterThanOrEqual(sa.eth + sb.eth);

      // Kazdy token trzyma swoja podaz osobno.
      expect(await a.t.balanceOf(padAddr)).to.equal(sa.tok);
      expect(await b.t.balanceOf(padAddr)).to.equal(sb.tok);
      expect(await a.t.balanceOf(carol.address)).to.equal(0n);
    });
  });

  /* ===================================================================== */
  /*  5b. CALA DOPUSZCZALNA PRZESTRZEN PARAMETROW                           */
  /* ===================================================================== */

  describe('konfiguracje oplat', function () {
    /**
     * Podmienia badany launchpad na wdrozony z innymi parametrami.
     *
     * Reszta pliku bada JEDNA konfiguracje (100 / 40 / 6000) - te, ktora
     * pojdzie na produkcje. Ale konstruktor dopuszcza caly prostokat wartosci,
     * a kazda z nich to inny kontrakt, ktory ktos moze wdrozyc. Sufity, ktore
     * nikt nie sprawdzil na skrajnosci, sa deklaracja.
     */
    async function usePad(feeBps: number, creatorFeeBps: number, protocolShareBps: number) {
      const deployed = await deployLaunchpad({
        deployer,
        feeBps,
        creatorFeeBps,
        feeRecipient: treasury.address,
        protocolShareBps,
        tokenFactory: await tokenFactory.getAddress(),
      });
      pad = deployed.pad;
      vault = deployed.vault;
      hook = deployed.hook;
      padAddr = await deployed.pad.getAddress();
    }

    it('sufity sa TWARDE i obowiazuja takze wdrazajacego', async function () {
      const Pad = await ethers.getContractFactory('CurveLaunchpad');
      expect(await pad.MAX_FEE_BPS()).to.equal(100n);
      expect(await vault.MAX_PROTOCOL_SHARE_BPS()).to.equal(8000n);

      const tf = await tokenFactory.getAddress();
      // Te warunki stoja PRZED wdrozeniem vaulta, wiec salt jest bez znaczenia.
      await expect(
        Pad.deploy(POOL_MANAGER, 101, 40, treasury.address, 6000, tf, ethers.ZeroHash, R_VIRT)
      ).to.be.revertedWithCustomError(pad, 'FeeTooHigh');
      await expect(
        Pad.deploy(POOL_MANAGER, 100, 101, treasury.address, 6000, tf, ethers.ZeroHash, R_VIRT)
      ).to.be.revertedWithCustomError(pad, 'CreatorFeeTooHigh');
      await expect(
        Pad.deploy(POOL_MANAGER, 100, 40, ethers.ZeroAddress, 6000, tf, ethers.ZeroHash, R_VIRT)
      ).to.be.revertedWithCustomError(pad, 'ZeroAddress');
      // Sufit udzialu protokolu jest PODLOGA udzialu tworcy - 8000 znaczy
      // "tworcy nie da sie zejsc ponizej 20%, nawet literowka przy deployu".
      await expect(
        Pad.deploy(POOL_MANAGER, 100, 40, treasury.address, 8001, tf, ethers.ZeroHash, R_VIRT)
      ).to.be.revertedWithCustomError(vault, 'ProtocolShareTooHigh');
      // Granice od strony dozwolonej naprawde przechodza - tu salt musi juz byc
      // wykopany, bo deploy dochodzi do konstruktora vaulta.
      // Granica DOZWOLONA to dzis (100, 70): sufit oplaty i sufit udzialu
      // tworcy. Stalo tu `(200, 200)`, czyli oplata 2% i cala oplata dla
      // tworcy - jedno lamie `MAX_FEE_BPS`, drugie `MAX_CREATOR_SHARE_BPS`.
      await usePad(100, 70, 8000);
      await usePad(0, 0, 0);
    });

    it('krzywa BEZ oplat: round-trip nadal na minusie, a _accrueFee nie dzieli przez zero', async function () {
      // Przy FEE_BPS = 0 zdanie "round-trip zawsze na minusie" nie ma juz
      // zadnego marginesu z oplaty - stoi WYLACZNIE na kierunku zaokraglen.
      // Jesli ten kierunek gdziekolwiek sie odwroci, widac to tylko tutaj.
      await usePad(0, 0, 6000);
      const { token, t } = await openCurve();
      await t.connect(alice).approve(padAddr, MAX_UINT);

      let s = await snap(token);
      // Bez oplaty 1 wei PRZESTAJE byc pylem - cale wchodzi do rezerwy.
      const q1 = await pad.quoteBuy(token, 1n);
      expect(q1[1], 'zerowa oplata').to.equal(0n);
      expect(q1[0], '1 wei kupuje cokolwiek, gdy nie ma oplaty').to.be.greaterThan(0n);

      const nast = mkRng(0xfee0);
      let sprawdzone = 0;
      for (let i = 0; i < 30; i++) {
        const value = randomAmount(nast, ethers.parseEther('0.2'));
        const q = await pad.quoteBuy(token, value);
        if (q[0] === 0n) continue;
        const wydane = value - q[2];
        const przed: bigint = await t.balanceOf(alice.address);
        await buyChecked(alice, token, t, value);
        s = await assertInvariants(token, t, s, 'buy');
        const got = (await t.balanceOf(alice.address)) - przed;

        const qs = await pad.quoteSell(token, got);
        expect(qs[1], 'zerowa oplata przy sprzedazy').to.equal(0n);
        if (qs[0] === 0n) continue;
        await sellChecked(alice, token, t, got);
        s = await assertInvariants(token, t, s, 'sell');
        expect(qs[0], `round-trip bez oplat przy ${value} wei`).to.be.lessThan(wydane);
        sprawdzone++;
      }
      expect(sprawdzone).to.be.greaterThan(10);

      // Handel nie naliczyl nikomu ani wei - i wlasnie dlatego `_accrueFee`
      // nigdy nie doszlo do dzielenia przez FEE_BPS == 0.
      expect(await pad.claimable(treasury.address)).to.equal(0n);
      expect(await pad.claimable(creator.address)).to.equal(0n);
      expect(s.liab, 'zobowiazania to sama rezerwa').to.equal(s.eth);

      // Awans ma wlasna, niezalezna od FEE_BPS sciezke podzialu.
      await buyChecked(bob, token, t, ethers.parseEther('5'));
      s = await snap(token);
      // Rezerwa MUSI byc zapamietana przed awansem: po nim jest zerowa,
      // a `assertInvariants` nadpisuje `s`.
      const rezerwaPrzedAwansem = s.eth;
      await pad.connect(dave).graduate(token);
      s = await assertInvariants(token, t, s, 'graduate');
      expect(await pad.claimable(dave.address)).to.equal(gradRewardOf(rezerwaPrzedAwansem));
      expect(await pad.claimable(treasury.address)).to.equal(
        gradFeeOf(rezerwaPrzedAwansem) - gradRewardOf(rezerwaPrzedAwansem)
      );
    });

    it('MAKSYMALNY udzial tworcy: protokol i tak nie schodzi ponizej swoich 30%', async function () {
      // Ten test badal kiedys konfiguracje "cala oplata dla tworcy, protokol
      // z handlu nie dostaje nic". Taka konfiguracja jest dzis NIEMOZLIWA -
      // `MAX_CREATOR_SHARE_BPS` odrzuca ja w konstruktorze i w `_launch`.
      // Test pilnuje wiec tego, co ja zastapilo: nawet na SUFICIE udzialu
      // tworcy protokol zabiera swoja czesc kazdej oplaty handlowej.
      await usePad(100, 70, 6000);
      const { token, t } = await openCurve();
      let s = await snap(token);
      const r = await buyChecked(alice, token, t, ethers.parseEther('1'));
      s = await assertInvariants(token, t, s, 'buy');

      expect(r.fee, 'oplata 1%').to.equal(ethers.parseEther('0.01'));
      const doTworcy = (r.fee * 70n) / 100n;
      expect(await pad.claimable(creator.address), 'tworca: 70% oplaty').to.equal(doTworcy);
      expect(await pad.claimable(treasury.address), 'protokol: reszta, nigdy zero').to.equal(
        r.fee - doTworcy
      );
      expect(await pad.claimable(treasury.address)).to.be.greaterThan(0n);

      // Przy awansie protokol dostaje DODATKOWO polowe oplaty awansowej.
      // Liczymy PRZYROST, bo z handlu ma juz swoje.
      await buyChecked(bob, token, t, ethers.parseEther('5'));
      s = await snap(token);
      const rezerwaPrzedAwansem = s.eth;
      const przedAwansem: bigint = await pad.claimable(treasury.address);
      await pad.connect(dave).graduate(token);
      s = await assertInvariants(token, t, s, 'graduate');
      expect(((await pad.claimable(treasury.address)) as bigint) - przedAwansem).to.equal(
        gradFeeOf(rezerwaPrzedAwansem) - gradRewardOf(rezerwaPrzedAwansem)
      );
    });

    it('udzial protokolu w oplatach LP rowny zeru: tworca bierze wszystko', async function () {
      await usePad(100, 40, 0);
      const { token, t } = await openCurve();
      await buyChecked(alice, token, t, ethers.parseEther('5'));
      await pad.connect(bob).graduate(token);

      const key = await pad.poolKeyOf(token);
      const fee0 = ethers.parseEther('0.03');
      await pm.setPendingFees(plainKey(key), fee0, 0n);
      await deployer.sendTransaction({ to: POOL_MANAGER, value: fee0 });
      await vault.connect(dave).harvest(token);

      expect(await vault.claimableEth(creator.address)).to.equal(fee0);
      expect(await vault.claimableEth(treasury.address)).to.equal(0n);
    });
  });

  /* ===================================================================== */
  /*  6. ZRZECZENIE ROL                                                     */
  /* ===================================================================== */

  describe('zrzeczenie rol', function () {
    const MINT_ROLE = ethers.keccak256(ethers.toUtf8Bytes('MINT_ROLE'));
    const PAUSE_ROLE = ethers.keccak256(ethers.toUtf8Bytes('PAUSE_ROLE'));
    const ADMIN_ROLE = ethers.ZeroHash;
    const SEIZE_ROLE = ethers.keccak256(ethers.toUtf8Bytes('SEIZE_ROLE'));

    it('stale rol zgadzaja sie co do bitu z odczytami z mainnetu', async function () {
      // Wartosci sa w kontrakcie WYLICZANE wzorem, nie przepisywane literalem -
      // ale wzor tez mozna przekrecic. Porownanie z odczytem z Base mainnet
      // (MINT_ROLE 0x154c0081...6c3686, PAUSE_ROLE 0x139c2898...816e46d) jest
      // jedyna rzecza, ktora tu cokolwiek dowodzi.
      // Stale zeszly do `B20TokenFactory` razem z tworzeniem tokena - to ona
      // jest jedynym miejscem, ktore wie, czym jest B20.
      expect(await tokenFactory.MINT_ROLE()).to.equal(MINT_ROLE);
      expect(await tokenFactory.PAUSE_ROLE()).to.equal(PAUSE_ROLE);
      expect(await tokenFactory.DEFAULT_ADMIN_ROLE()).to.equal(ADMIN_ROLE);
      expect(MINT_ROLE.slice(0, 10)).to.equal('0x154c0081');
      expect(MINT_ROLE.slice(-6)).to.equal('6c3686');
      expect(PAUSE_ROLE.slice(0, 10)).to.equal('0x139c2898');
      expect(PAUSE_ROLE.slice(-7)).to.equal('816e46d');
    });

    it('I-B1/I-B2: po starcie zadnej z rol nie ma NIKT - lacznie z nami i z address(0)', async function () {
      const { token, t } = await launchToken(creator);
      const kandydaci = [
        ethers.ZeroAddress,
        padAddr,
        await vault.getAddress(),
        B20_FACTORY,
        POOL_MANAGER,
        DEAD,
        token,
        creator.address,
        deployer.address,
        alice.address,
        treasury.address
      ];

      for (const rola of [ADMIN_ROLE, MINT_ROLE, PAUSE_ROLE, SEIZE_ROLE]) {
        for (const kto of kandydaci) {
          expect(await t.hasRole(rola, kto), `rola ${rola} u ${kto}`).to.equal(false);
        }
      }

      // I-B2: sufit podazy rowny podazy - druga, NIEZALEZNA przyczyna tego,
      // ze nikt nie dodrukuje. Sam brak roli i sam sufit to dwa rozne zdania.
      expect(await t.totalSupply()).to.equal(T0);
      expect(await t.supplyCap()).to.equal(T0);
      expect(await t.balanceOf(padAddr)).to.equal(T0);

      // I-B4: sprawdzamy `isB20Initialized`, nie `isB20`. `isB20` patrzy na sam
      // FORMAT adresu i mowi `true` o tokenie, ktorego nie ma.
      expect(await factory.isB20Initialized(token)).to.equal(true);
      expect(await factory.isB20('0xb200000000000000000000000000000000000000')).to.equal(true);
      expect(await factory.isB20Initialized('0xb200000000000000000000000000000000000000')).to.equal(
        false
      );
    });

    it('KAZDA asercja rol potrafi wywrocic start - osobno ADMIN, MINT i PAUSE', async function () {
      // Bez tego testu asercje rol sa nieodrozninalne od literowki w nazwie:
      // zla stala tez "przechodzi", bo nikt nie ma roli, ktora nie istnieje.
      const przypadki: [number, string][] = [
        [1, ADMIN_ROLE],
        [6, MINT_ROLE],
        [7, PAUSE_ROLE]
      ];
      for (const [tryb, rola] of przypadki) {
        await factory.setSabotage(tryb);
        await expect(pad.connect(creator).launch('T', 'T', 0n, MAX_UINT))
          .to.be.revertedWithCustomError(tokenFactory, 'RolesAlive')
          .withArgs(rola);
      }
      await factory.setSabotage(0);
      // Po zdjeciu sabotazu start znowu przechodzi - czyli rewertowal warunek,
      // a nie cokolwiek innego, co zepsulismy po drodze.
      const { t } = await launchToken(creator);
      expect(await t.totalSupply()).to.equal(T0);
    });

    it('zly WARIANT tokena wywraca start - asercja, ktora potrafi odpasc', async function () {
      // `VARIANT_ASSET = 0` nie jest udowodnione odczytem, tylko OSLONIETE:
      // wariant ASSET nie ma `SEIZE_ROLE()`, wiec POWODZENIE tego wywolania
      // znaczy, ze stworzylismy zly wariant. Tu pokazujemy, ze ta oslona dziala.
      await factory.setSabotage(8);
      await expect(
        pad.connect(creator).launch('T', 'T', 0n, MAX_UINT)
      ).to.be.revertedWithCustomError(tokenFactory, 'WrongVariant');
      await factory.setSabotage(0);
    });

    it('launchpad nie ma ZADNEJ sciezki, ktora dotyka podazy po starcie', async function () {
      const { token, t } = await launchToken(creator);

      const fns = Object.keys(pad.interface.fragments)
        .map((k: any) => (pad.interface.fragments as any)[k])
        .filter((f: any) => f.type === 'function')
        .map((f: any) => f.name);

      for (const zakazane of [
        'mint',
        'burn',
        'grantRole',
        'revokeRole',
        'updateSupplyCap',
        'pause',
        'unpause',
        'setFee',
        'setFeeRecipient',
        'withdraw',
        'rescue',
        'sweep',
        'upgradeTo'
      ]) {
        expect(fns, `zakazana funkcja ${zakazane}`).to.not.include(zakazane);
      }

      // I to nie jest tylko sprawa ABI: przez caly handel podaz nie drgnela.
      await warp(WINDOW + 1);
      let s = await snap(token);
      await t.connect(alice).approve(padAddr, MAX_UINT);
      await buyChecked(alice, token, t, ethers.parseEther('1'));
      s = await assertInvariants(token, t, s, 'buy'); // I-C4 w srodku
      await sellChecked(alice, token, t, (await t.balanceOf(alice.address)) / 2n);
      s = await assertInvariants(token, t, s, 'sell');
      expect(await t.totalSupply()).to.equal(T0);
      expect(await t.supplyCap()).to.equal(T0);
    });

    it('CZEGO TEN PLIK NIE DOWODZI: atrapa NIE egzekwuje rol', async function () {
      // Test istnieje po to, zeby nikt nie wzial zielonego pakietu za dowod
      // zdania "nikt nie dodrukuje". Atrapa pozwala dodrukowac KAZDEMU - i to
      // jest udokumentowane w jej naglowku. Egzekwowanie rol sprawdza dopiero
      // transakcja na Base Sepolia albo mainnecie.
      const { token, t } = await launchToken(creator);
      const before: bigint = await t.totalSupply();
      await t.connect(alice).mint(alice.address, 1n); // atrapa: bez roli, przechodzi
      expect(await t.totalSupply()).to.equal(before + 1n);
      // Skutek uboczny wart nazwania: po takim dodruku niezmiennik I-C4 UPADA -
      // czyli nasz wlasny test wykrylby dodruk, gdyby doszlo do niego na krzywej.
      expect(await t.totalSupply()).to.not.equal(T0);
    });
  });

  /* ===================================================================== */
  /*  7. WEJSCIE POWROTNE I ODBIORCY, KTORZY REWERTUJA                      */
  /* ===================================================================== */

  describe('wejscie powrotne i zepsuci odbiorcy', function () {
    const REENTRANCY_SELECTOR = ethers.id('Reentrancy()').slice(0, 10);

    async function newProbe() {
      const P = await ethers.getContractFactory('ReentrancyProbe');
      const p = await P.deploy(padAddr, { value: ethers.parseEther('10') });
      await p.waitForDeployment();
      return p;
    }

    it('kontrakt moze handlowac - launchpad nie ma zadnego tx.origin', async function () {
      // Bez tego testu "nie blokujemy Coinbase Smart Wallet ani ERC-4337" jest
      // deklaracja. Sonda jest kontraktem i musi dac rade kupic i sprzedac.
      const { token, t } = await openCurve();
      const probe = await newProbe();
      const probeAddr = await probe.getAddress();

      await probe.doBuy(token, ethers.parseEther('1'), 1n);
      const held: bigint = await t.balanceOf(probeAddr);
      expect(held).to.be.greaterThan(0n);
      await probe.doSell(token, held, 1n);
      expect(await t.balanceOf(probeAddr)).to.equal(0n);
    });

    it('wejscie powrotne z odbioru ETH odbija sie bledem Reentrancy - w claim, buy i sell', async function () {
      const { token, t } = await openCurve();
      const probe = await newProbe();
      const probeAddr = await probe.getAddress();

      // Sonda zbiera saldo, awansujac krzywe (nagroda 0.05 ETH do claimable).
      await probe.doBuy(token, ethers.parseEther('5'), 1n);
      const rezerwa = (await pad.launchOf(token))[2] as bigint;
      await probe.doGraduate(token);
      expect(await pad.claimable(probeAddr)).to.equal(gradRewardOf(rezerwa));

      // 1. Re-wejscie w `claim` z `receive()` w trakcie wyplaty.
      await probe.arm(1, token);
      await probe.doClaim();
      expect(await probe.reentered(), 'sonda naprawde weszla ponownie').to.equal(true);
      expect(await probe.innerError()).to.equal(REENTRANCY_SELECTOR);
      // Wyplata sie UDALA - straznik zatrzymal tylko wejscie powrotne.
      expect(await pad.claimable(probeAddr)).to.equal(0n);
      expect(await ethers.provider.getBalance(probeAddr)).to.be.greaterThan(0n);

      // 2. Re-wejscie w `buy` przy zwrocie nadwyzki z kupna domykajacego prog.
      const drugi = await openCurve();
      await probe.arm(2, drugi.token);
      await probe.doBuy(drugi.token, ethers.parseEther('5'), 1n); // wygeneruje refund
      expect(await probe.reentered()).to.equal(true);
      expect(await probe.innerError()).to.equal(REENTRANCY_SELECTOR);
      expect((await pad.launchOf(drugi.token))[1]).to.equal(LOCKED);

      // 3. Re-wejscie w `sell` przy wyplacie ETH ze sprzedazy.
      const trzeci = await openCurve();
      await probe.doBuy(trzeci.token, ethers.parseEther('1'), 1n);
      await probe.arm(3, trzeci.token);
      await probe.doSell(trzeci.token, await trzeci.t.balanceOf(probeAddr), 1n);
      expect(await probe.reentered()).to.equal(true);
      expect(await probe.innerError()).to.equal(REENTRANCY_SELECTOR);

      // Po tym wszystkim ksiegowosc obu krzywych jest nienaruszona.
      expect(await ethers.provider.getBalance(padAddr)).to.equal(await pad.totalLiabilities());
    });

    it('odbiorca, ktory rewertuje, blokuje WYLACZNIE swoja wyplate', async function () {
      const { token, t } = await openCurve();
      const R = await ethers.getContractFactory('EthRejector');
      const zly = await R.deploy(padAddr);
      await zly.waitForDeployment();
      const zlyAddr = await zly.getAddress();

      await buyChecked(alice, token, t, ethers.parseEther('5'));
      // Awans wolany przez kontrakt, ktory nie przyjmuje ETH. Nagroda jest
      // KSIEGOWANA, nie pushowana - inaczej taki wolajacy zablokowalby awans
      // wszystkim, a to jest dokladnie ten rodzaj zakladnika, ktorego nie chcemy.
      const rezerwa = (await pad.launchOf(token))[2] as bigint;
      await zly.doGraduate(token);
      expect(await pad.claimable(zlyAddr)).to.equal(gradRewardOf(rezerwa));
      expect((await pad.launchOf(token))[1]).to.equal(GRADUATED);

      // Jego wlasna wyplata odpada...
      await expect(zly.doClaim()).to.be.revertedWithCustomError(pad, 'EthTransferFailed');
      await expect(pad.connect(alice).claimFor(zlyAddr)).to.be.revertedWithCustomError(
        pad,
        'EthTransferFailed'
      );
      // ...ale saldo zostaje jego i nikomu innemu nie przeszkadza.
      expect(await pad.claimable(zlyAddr)).to.equal(gradRewardOf(rezerwa));
      const before = await ethers.provider.getBalance(treasury.address);
      await pad.connect(alice).claimFor(treasury.address);
      expect(await ethers.provider.getBalance(treasury.address)).to.be.greaterThan(before);
    });

    it('claim bez salda rewertuje zamiast cicho przechodzic', async function () {
      await expect(pad.connect(dave).claim()).to.be.revertedWithCustomError(pad, 'NothingToClaim');
      await expect(pad.connect(dave).claimFor(alice.address)).to.be.revertedWithCustomError(
        pad,
        'NothingToClaim'
      );
    });

    it('token oddajacy false zamiast rewertowac przewraca CALE kupno', async function () {
      // B20 rewertuje przy niepowodzeniu, ale kontrakt nie ma prawa na tym
      // polegac: token oddajacy `false` przepuscilby kupno jako udane,
      // a kupujacy nie dostalby ani jednej sztuki.
      const { token, t } = await openCurve();
      const before = await snap(token);
      await t.setReturnsFalse(true);
      await expect(
        pad.connect(alice).buy(token, 1n, MAX_UINT, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(pad, 'TokenTransferFailed');
      // Rewert cofa TAKZE ksiegowosc krzywej - nie zostaje polowa operacji.
      const after = await snap(token);
      expect(after.eth).to.equal(before.eth);
      expect(after.tok).to.equal(before.tok);
      expect(after.liab).to.equal(before.liab);
      expect(await t.balanceOf(alice.address)).to.equal(0n);
    });
  });

  /* ===================================================================== */
  /*  8. VAULT - PLYNNOSC BEZ WYJSCIA                                       */
  /* ===================================================================== */

  describe('vault - plynnosc bez wyjscia', function () {
    let token: string;
    let t: any;
    let vaultAddr: string;

    beforeEach(async function () {
      const c = await openCurve();
      token = c.token;
      t = c.t;
      vaultAddr = await vault.getAddress();
      await buyChecked(alice, token, t, ethers.parseEther('5'));
    });

    it('przed zasileniem pozycja nie istnieje, a harvest nie ma czego zbierac', async function () {
      const pos = await vault.positionOf(token);
      expect(pos[1]).to.equal(0n);
      expect(await vault.seeded(token)).to.equal(false);
      await expect(vault.connect(alice).harvest(token)).to.be.revertedWithCustomError(
        vault,
        'NotSeeded'
      );
    });

    it('unlockCallback jest zamkniete DWOMA warunkami, nie jednym', async function () {
      await pad.connect(bob).graduate(token);

      // 1. Obcy adres - odbija sie na nadawcy.
      await expect(vault.connect(alice).unlockCallback('0x')).to.be.revertedWithCustomError(
        vault,
        'NotPoolManager'
      );

      // 2. PRAWDZIWY PoolManager, ale poza naszym `unlock`. Ten warunek jest
      // tym wazniejszym z dwoch: `unlock` moze zawolac ktokolwiek, a PoolManager
      // oddaje sterowanie TEMU, KTO GO ZAWOLAL. Bez flagi wejscia ktos postronny
      // odblokowalby PoolManagera i kazal nam wykonac nasza wlasna sciezke
      // w wybranym przez siebie momencie.
      const balPm = await ethers.provider.getBalance(POOL_MANAGER);
      await hre.network.provider.send('hardhat_impersonateAccount', [POOL_MANAGER]);
      const jakoPm = await ethers.getSigner(POOL_MANAGER);
      const dane = ethers.AbiCoder.defaultAbiCoder().encode(['uint8', 'address'], [1, token]);
      await expect(vault.connect(jakoPm).unlockCallback(dane)).to.be.revertedWithCustomError(
        vault,
        'NotUnlocking'
      );
      await hre.network.provider.send('hardhat_stopImpersonatingAccount', [POOL_MANAGER]);
      // Impersonacja placi gaz z konta puli - oddajemy stan, zeby kolejne testy
      // liczyly przyrosty od nietknietej wartosci.
      await hre.network.provider.send('hardhat_setBalance', [
        POOL_MANAGER,
        '0x' + balPm.toString(16)
      ]);
    });

    it('I-X6: harvest NIE rusza kapitalu - ani w pozycji, ani w puli', async function () {
      await pad.connect(bob).graduate(token);
      const key = await pad.poolKeyOf(token);
      const id = poolIdOf(key);

      const posPrzed = await vault.positionOf(token);
      const plynnoscPrzed: bigint = await pm.liquidityOf(id);
      expect(plynnoscPrzed).to.be.greaterThan(0n);
      expect(posPrzed[1]).to.equal(plynnoscPrzed);

      // Oplaty musza miec pokrycie - w prawdziwym v4 pochodza ze swapow.
      const fee0 = ethers.parseEther('0.02');
      const fee1 = ethers.parseEther('5000');
      await pm.setPendingFees(plainKey(key), fee0, fee1);
      await deployer.sendTransaction({ to: POOL_MANAGER, value: fee0 });
      await t.mint(POOL_MANAGER, fee1);

      await vault.connect(dave).harvest(token); // bezuprawnieniowe: wola ktokolwiek

      // Kapital nietkniety - to jest cala teza o "plynnosci bez wyjscia",
      // sprawdzona zachowaniem, a nie deklaracja w komentarzu.
      const posPo = await vault.positionOf(token);
      expect(posPo[1], 'plynnosc pozycji').to.equal(plynnoscPrzed);
      expect(await pm.liquidityOf(id), 'plynnosc w puli').to.equal(plynnoscPrzed);
      expect(posPo[2]).to.equal(posPrzed[2]);
      expect(posPo[3]).to.equal(posPrzed[3]);

      // Podzial 60/40 sumuje sie co do wei, pyl idzie do tworcy.
      const protoEth: bigint = await vault.claimableEth(treasury.address);
      const twEth: bigint = await vault.claimableEth(creator.address);
      expect(protoEth + twEth).to.equal(fee0);
      expect(protoEth).to.equal((fee0 * 6000n) / 10000n);
      const protoTok: bigint = await vault.claimableToken(token, treasury.address);
      const twTok: bigint = await vault.claimableToken(token, creator.address);
      expect(protoTok + twTok).to.equal(fee1);

      // Drugi harvest bez nowych oplat nie tworzy pieniedzy z niczego.
      await vault.connect(dave).harvest(token);
      expect(await vault.claimableEth(treasury.address)).to.equal(protoEth);
      expect(await vault.claimableToken(token, treasury.address)).to.equal(protoTok);
    });

    it('kierunek wyplaty z vaulta jest zaszyty - placacy gaz nie jest odbiorca', async function () {
      await pad.connect(bob).graduate(token);
      const key = await pad.poolKeyOf(token);
      const fee0 = ethers.parseEther('0.01');
      await pm.setPendingFees(plainKey(key), fee0, 0n);
      await deployer.sendTransaction({ to: POOL_MANAGER, value: fee0 });
      await vault.connect(dave).harvest(token);

      const naleznosc: bigint = await vault.claimableEth(creator.address);
      expect(naleznosc).to.be.greaterThan(0n);
      const przed = await ethers.provider.getBalance(creator.address);
      // Placi dave, dostaje tworca. Kierunek nie jest parametrem.
      await vault.connect(dave).claimEthFor(creator.address);
      expect((await ethers.provider.getBalance(creator.address)) - przed).to.equal(naleznosc);
      expect(await vault.claimableEth(creator.address)).to.equal(0n);
      await expect(vault.connect(dave).claimEthFor(creator.address)).to.be.revertedWithCustomError(
        vault,
        'NothingToClaim'
      );
    });

    it('dwa awansowane tokeny nie mieszaja sobie oplat LP', async function () {
      await pad.connect(bob).graduate(token);
      const drugi = await openCurve(creator);
      await buyChecked(alice, drugi.token, drugi.t, ethers.parseEther('5'));
      await pad.connect(bob).graduate(drugi.token);

      const keyA = await pad.poolKeyOf(token);
      const feeTok = ethers.parseEther('1000');
      await pm.setPendingFees(plainKey(keyA), 0n, feeTok);
      await t.mint(POOL_MANAGER, feeTok);
      await vault.connect(dave).harvest(token);

      // Oplaty pierwszego tokena nie pojawiaja sie przy drugim.
      expect(await vault.claimableToken(token, treasury.address)).to.be.greaterThan(0n);
      expect(await vault.claimableToken(drugi.token, treasury.address)).to.equal(0n);
      await expect(
        vault.connect(dave).claimTokenFor(drugi.token, treasury.address)
      ).to.be.revertedWithCustomError(vault, 'NothingToClaim');
    });
  });
});

// Ten plik musi byc modulem: bez tego `const hre` zyje w globalnej przestrzeni
// i koliduje z identyczna deklaracja w pozostalych plikach testowych.
