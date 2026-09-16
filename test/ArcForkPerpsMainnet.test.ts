// FORK ARC MAINNET (5042): czy CALA sciezka perpsow z runbooka
// (docs/ARC-MAINNET-DEPLOY.md, sekcja "Perps i paired tokens") przechodzi
// przeciw prawdziwemu stanowi lancucha - zanim wlasciciel wyda na nia USDC?
//
// Kolejnosc jak w runbooku, ten sam kod kontraktow, te same stale:
//  1. PythReceiver ze straznikami z deployments/pythSigners.json (na mainnecie
//     Pytha NIE MA - docs Pytha listuja tylko Arc testnet, wiec odbiornik jest
//     jedynym zrodlem indeksu),
//  2. PythAggregatorAdapter BTC/USD i ETH/USD na tym odbiorniku,
//  3. PriceOracleRegistry + DerivativeMarketFactory (fundusz + dystrybutor),
//     setInsuranceFund, zasilenie funduszu,
//  4. rynek: approve + registerMarket (kaucja MIN_BOND_AMOUNT = 100 USDC)
//     + createMarket z adapterem jako CHAINLINK_FEED,
//  5. keeper: prawdziwa aktualizacja Hermesa (PYTH_API_KEY z .env.local; bez
//     klucza - fixture z test/fixtures z MAX_AGE tak duzym, zeby nie wygasla),
//     po niej `indexPrice()` rynku == `latestAnswer()` adaptera,
//  6. otwarcie i zamkniecie pozycji na tym indeksie.
//
// CZEGO NIE DOWODZI: semantyki natywnego USDC Arc (hardhat forkuje zwykly
// EVM - patrz test/ArcForkMainnet.test.ts). Kolateral perpsow to ERC-20 pod
// 0x3600...0000 (proxy, 1798 B na 5042). Sprawdzone 16.09.2026 na forku:
// `balanceOf` widzi `hardhat_setBalance`, ale `transfer` pada w tym proxy
// ("UnrecognizedContract") - ruch natywnego USDC przez widok ERC-20 to
// mechanika Arc, ktorej zwykly EVM nie ma. Dlatego stack na forku dostaje
// MockUSDC (6 miejsc, jak w testach jednostkowych). Pierwszy test nadal
// dotyka prawdziwego 0x3600, zeby ta granica byla widoczna, a nie ukryta.
// Na mainnecie stack MUSI dostac 0x3600 (deploy-derivative-market.ts,
// KNOWN_USDC[5042]) - to jedyna roznica wzgledem tego pliku.
//
// URUCHOMIENIE
//   npx hardhat test test/ArcForkPerpsMainnet.test.ts
//   (ARC_MAINNET_RPC_URL nadpisuje RPC; bez forka testy sie SKIPUJA, nie pada)
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const ARC_RPC = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const USDC_ERC20 = '0x3600000000000000000000000000000000000000';
const HERMES = process.env.HERMES_URL || 'https://hermes.pyth.network';
const BTC_ID = '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
const ETH_ID = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';

const signers = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployments', 'pythSigners.json'), 'utf8'));
const GUARDIANS: string[] = Object.keys(signers.guardians)
  .map(Number)
  .sort((a: number, b: number) => a - b)
  .map((i: number) => signers.guardians[i]);
const [SRC_CHAIN, SRC_EMITTER] = (signers.emitters[0] as string).split(':');

const USDC = (n: number | string) => ethers.parseUnits(String(n), 6);

async function hermesLatest(ids: string[]): Promise<string[] | null> {
  const key = process.env.PYTH_API_KEY;
  if (!key) return null;
  const params = ids.map((id) => `ids[]=${id}`).join('&');
  const res = await fetch(`${HERMES}/v2/updates/price/latest?${params}&encoding=hex`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { binary?: { data?: string[] } };
  const data = json.binary?.data ?? [];
  return data.length ? data.map((h) => (h.startsWith('0x') ? h : `0x${h}`)) : null;
}

describe('Arc mainnet fork: perps od odbiornika Pytha do pozycji', function () {
  this.timeout(900_000);

  let forked = true;
  let deployer: any, alice: any;
  let usdc: any, receiver: any, adapterBtc: any, adapterEth: any, oracle: any, factory: any, insurance: any, market: any;
  let freshHermes = false;
  let maxAge = 3600;

  before(async function () {
    try {
      await hre.network.provider.request({ method: 'hardhat_reset', params: [{ forking: { jsonRpcUrl: ARC_RPC } }] });
      // Hardhat nie ma historii hardforkow dla chainId 5042, wiec `eth_call`
      // na SAMYM bloku forka pada ("No known hardfork for execution on
      // historical block"). Jeden wykopany blok i kazdy odczyt idzie juz na
      // lokalnym lancuchu.
      await hre.network.provider.send('evm_mine');
    } catch (e: any) {
      forked = false;
      console.log(`      (pominiete: fork ${ARC_RPC} niedostepny: ${String(e?.message || e).split('\n')[0]})`);
      return;
    }
    // Hardhat zostawia na forku chainId 31337, wiec sprawdzamy stan, nie numer:
    // PoolManager v4 pod 0x8366 stoi na Arc mainnet (24 009 B) - na pustym
    // hardhacie nie ma tam nic.
    const pmCode = await ethers.provider.getCode('0x8366a39CC670B4001A1121B8F6A443A643e40951');
    if (pmCode === '0x') {
      forked = false;
      console.log('      (pominiete: to nie jest fork Arc mainnet - brak PoolManagera pod 0x8366)');
      return;
    }
    [deployer, alice] = await ethers.getSigners();
    for (const who of [deployer, alice]) {
      await hre.network.provider.send('hardhat_setBalance', [who.address, '0x' + ethers.parseEther('100000').toString(16)]);
    }
    usdc = new ethers.Contract(
      USDC_ERC20,
      [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
        'function approve(address,uint256) returns (bool)',
        'function transfer(address,uint256) returns (bool)',
      ],
      deployer,
    );
  });

  it('prawdziwe 0x3600: decimals()==6 i balanceOf widzi saldo natywne; transfer to granica forka', async function () {
    if (!forked) return this.skip();
    expect(await usdc.decimals()).to.equal(6n);
    expect(await usdc.balanceOf(deployer.address)).to.be.gte(USDC(1000));
    // Dokumentujemy granice odczytem, nie zalozeniem: jesli kiedys hardhat
    // zacznie to obslugiwac, ten log powie, ze mock mozna wyrzucic.
    // 0x3600 deleguje do precompile 0x1800 (invalid opcode na zwyklym EVM).
    const moved = await usdc.transfer(alice.address, USDC(1)).then(() => true).catch(() => false);
    console.log(`      transfer przez widok ERC-20 na forku: ${moved ? 'DZIALA (mock zbedny)' : 'nie dziala - stack dostaje MockUSDC'}`);
    if (!moved) {
      const M = await ethers.getContractFactory('MockUSDC');
      usdc = await M.deploy();
      await usdc.waitForDeployment();
      for (const who of [deployer, alice]) await (await usdc.mint(who.address, USDC(10_000))).wait();
    }
  });

  it('1-2. PythReceiver i adaptery BTC/ETH wdrazaja sie na 5042', async function () {
    if (!forked) return this.skip();
    const R = await ethers.getContractFactory('PythReceiver');
    receiver = await R.deploy(GUARDIANS, 3, signers.guardianSet, Number(SRC_CHAIN), SRC_EMITTER);
    await receiver.waitForDeployment();

    // Swieza aktualizacja Hermesa albo fixture z 11.09 (wtedy MAX_AGE musi
    // objac jej wiek - inaczej adapter uczciwie odda 0 i test nie dowiedzie nic).
    const updates = await hermesLatest([BTC_ID, ETH_ID]);
    freshHermes = updates !== null;
    if (!freshHermes) {
      const btc = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pyth-btc.json'), 'utf8'));
      maxAge = 365 * 24 * 3600;
      await receiver.updatePriceFeeds(['0x' + btc.binary]);
    } else {
      await receiver.updatePriceFeeds(updates);
    }

    const A = await ethers.getContractFactory('PythAggregatorAdapter');
    adapterBtc = await A.deploy(await receiver.getAddress(), BTC_ID, maxAge, 'BTC/USD (Pyth)');
    await adapterBtc.waitForDeployment();
    if (freshHermes) {
      adapterEth = await A.deploy(await receiver.getAddress(), ETH_ID, maxAge, 'ETH/USD (Pyth)');
      await adapterEth.waitForDeployment();
    }
    const answer = await adapterBtc.latestAnswer();
    expect(answer).to.be.gt(0n);
    console.log(`      BTC/USD z adaptera: ${ethers.formatEther(answer)} USD (${freshHermes ? 'Hermes na zywo' : 'fixture 11.09'})`);
    if (adapterEth) console.log(`      ETH/USD z adaptera: ${ethers.formatEther(await adapterEth.latestAnswer())} USD`);
  });

  it('3. rejestr + fabryka + fundusz jak w deploy-derivative-market.ts', async function () {
    if (!forked) return this.skip();
    const O = await ethers.getContractFactory('PriceOracleRegistry');
    const usdcAddress = await usdc.getAddress();
    oracle = await O.deploy(usdcAddress, deployer.address, deployer.address);
    await oracle.waitForDeployment();
    const F = await ethers.getContractFactory('DerivativeMarketFactory');
    factory = await F.deploy(usdcAddress, await oracle.getAddress(), deployer.address, deployer.address);
    await factory.waitForDeployment();
    insurance = await ethers.getContractAt('InsuranceFund', await factory.INSURANCE());
    await (await oracle.setInsuranceFund(await insurance.getAddress())).wait();

    const seed = USDC(5);
    await (await usdc.transfer(await insurance.getAddress(), seed)).wait();
    await (await insurance.notifyDeposit(seed)).wait();
    expect(await insurance.balance()).to.equal(seed);
  });

  it('4. rynek BTC-USD: kaucja 100 USDC + createMarket z adapterem jako feedem', async function () {
    if (!forked) return this.skip();
    const bond = await oracle.MIN_BOND_AMOUNT();
    expect(bond).to.equal(USDC(100));
    await (await usdc.approve(await oracle.getAddress(), bond)).wait();
    const initial = await adapterBtc.latestAnswer();
    const regTx = await (await oracle.registerMarket('BTC-USD', initial, bond)).wait();
    const reg = regTx.logs.map((l: any) => { try { return oracle.interface.parseLog(l); } catch { return null; } }).find((e: any) => e?.name === 'MarketRegistered');
    const marketId = reg ? reg.args[0] : 1n;

    const liquidity = ethers.parseEther('1000');
    const createTx = await (await factory.createMarket(marketId, liquidity, await adapterBtc.getAddress())).wait();
    const count = await factory.marketCount();
    market = await ethers.getContractAt('DerivativeMarket', await factory.allMarkets(count - 1n));
    expect(await market.CHAINLINK_FEED()).to.equal(await adapterBtc.getAddress());
    console.log(`      rynek ${await market.getAddress()} (tx createMarket gas ${createTx.gasUsed})`);
  });

  it('5. indexPrice() rynku == latestAnswer() adaptera - indeks idzie z odbiornika, nie z rejestru', async function () {
    if (!forked) return this.skip();
    const idx = await market.indexPrice();
    const ans = await adapterBtc.latestAnswer();
    expect(idx).to.equal(ans);
    expect(idx).to.be.gt(0n);
  });

  it('6. pozycja: approve + openPosition + closePosition na indeksie z Pytha', async function () {
    if (!forked) return this.skip();
    await (await usdc.connect(alice).approve(await market.getAddress(), ethers.MaxUint256)).wait();
    await (await market.connect(alice).openPosition(true, USDC(50), 2)).wait();
    const pos = await market.getPosition(alice.address);
    expect(pos[0]).to.be.gt(0n);
    await (await market.connect(alice).closePosition()).wait();
    const after = await market.getPosition(alice.address);
    expect(after[0]).to.equal(0n);
    console.log(`      saldo alice po cyklu: ${ethers.formatUnits(await usdc.balanceOf(alice.address), 6)} USDC`);
  });
});

// UWAGA: bez `export {}`. Pod Node 24 + ts-node (CJS) `export` robi z pliku
// ESM i `require` przestaje istniec ("require is not defined in ES module
// scope") - test w ogole sie nie laduje. Kolizje TS2451 miedzy plikami
// testow to sprawa `tsc` na calym repo, nie hardhata; hardhat mocha laduje
// kazdy plik osobno i dziala.
