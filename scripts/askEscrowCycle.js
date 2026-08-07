/**
 * PELNY CYKL PIENIADZA PRZEZ AskEscrow, na prawdziwym lancuchu.
 *
 *   npx hardhat run scripts/askEscrowCycle.js --network base-sepolia
 *
 * === PO CO TO ISTNIEJE ===
 * Kontrakt mial 9 przechodzacych testow jednostkowych i stal wdrozony na Base
 * Sepolii - a `totalLiabilities` wynosilo 0. Zaden dolar nigdy przez niego nie
 * przeszedl. Testy w Hardhacie chodza na MockUSDC, ktory sam napisalem;
 * prawdziwe USDC na Base to inny kontrakt, z wlasnymi dziwactwami (m.in.
 * `transfer` zwracajacy bool i proxy). "Testy przechodza" nie znaczy
 * "pieniadze przechodza" - i to jest jedyny sposob, zeby te druga rzecz
 * sprawdzic PRZED mainnetem.
 *
 * === CO ROBI, PO KOLEI ===
 *   1. approve      - pozwolenie dokladnie na budzet, ani centa wiecej
 *   2. fund         - budzet wchodzi do kontraktu, powstaje Ask z 2 miejscami
 *   3. resolve      - autor wskazuje 2 zwyciezcow, kazdy dostaje perAnswer
 *   4. claimFor x2  - USDC LADUJE W OBCYCH PORTFELACH (nie w portfelu autora)
 *   5. kontrola     - totalLiabilities wraca do 0, salda sie zgadzaja
 *
 * === DLACZEGO DWA MIEJSCA I DWOCH ZWYCIEZCOW ===
 * `resolve` przed terminem wymaga OBSADZENIA WSZYSTKICH miejsc
 * (EarlyResolveMustFillSeats) - inaczej autor zamykalby Aska wczesniej,
 * odzyskiwal reszte bez oplaty i omijal sciezke wygasniecia. Zeby wiec
 * rozstrzygnac dzis, a nie za 48 godzin, liczba zwyciezcow musi rownac sie
 * liczbie miejsc. Przy okazji sprawdzamy sciezke wielu zwyciezcow, ktora jest
 * trudniejsza od jednego.
 *
 * === CZEGO TEN SKRYPT NIE SPRAWDZA ===
 * Sciezki WYGASNIECIA (`settleExpired`). Wymaga ona `deadline + RESOLVE_GRACE`,
 * czyli 48 godzin po terminie - nie da sie tego przyspieszyc na prawdziwym
 * lancuchu, bo czasu nie ma jak przewinac. Ta sciezka jest pokryta testem
 * jednostkowym z `evm_increaseTime` i to na razie musi wystarczyc; kto bedzie
 * wdrazal na mainnet, powinien wiedziec, ze akurat ta noga nie ma dowodu z
 * prawdziwego lancucha.
 *
 * === ZWYCIEZCY ===
 * Adresy z jawnej frazy testowej Hardhata ("test test ... junk"). Klucze do
 * nich sa publiczne i wszyscy je znaja - to jest CELOWE i dopuszczalne
 * WYLACZNIE na testnecie: dzieki temu cykl jest odtwarzalny, a testowe USDC
 * nie ladują na adresie, ktorego nikt nie kontroluje. NIGDY na mainnecie.
 */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

/** Fraza testowa Hardhata - klucze publiczne z definicji. TYLKO TESTNET. */
const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const USDC = 1_000_000n; // 6 miejsc dziesietnych

/**
 * === DLACZEGO KAZDY ODCZYT JEST PRZYPIETY DO BLOKU I PONAWIANY ===
 *
 * Pierwsze uruchomienie tego skryptu zglosilo cztery niezgodnosci sald przy
 * cyklu, ktory w rzeczywistosci przeszedl bezblednie - kwity mialy status=1,
 * a zdarzenia AskFunded / SeatAwarded x2 / AskResolved / Claimed x2 siedzialy
 * w logach. Nieprawda byly WYLACZNIE odczyty.
 *
 * Publiczny `https://sepolia.base.org` stoi za rozkladaczem ruchu. `tx.wait(1)`
 * dostaje kwit z wezla, ktory blok juz ma, a nastepny `eth_call` moze trafic
 * w SASIEDNI wezel, ktory jeszcze go nie zastosowal - i oddaje stan sprzed
 * transakcji. Stad "w kontrakcie: 0.0 USDC" tuz po udanym `fund`.
 *
 * Dwie poprawki razem to zamykaja:
 *   1. `blockTag` - pytamy o stan W KONKRETNYM BLOKU, a nie "najnowszym",
 *      wiec odpowiedz albo jest poprawna, albo wezel przyznaje sie, ze tego
 *      bloku nie ma (i wtedy dziala punkt 2).
 *   2. ponawianie - kilka podejsc z narastajaca przerwa, zeby dac
 *      rozkladaczowi czas na dogonienie.
 *
 * Skrypt weryfikacyjny, ktory falszywie krzyczy, jest gorszy niz zaden: uczy
 * ignorowac czerwone napisy dokladnie w tym miejscu, w ktorym pilnuja
 * cudzych pieniedzy.
 */
const CZEKAJ_MS = [0, 400, 1000, 2000, 4000];

async function czytaj(fn, blockTag) {
  let ostatni;
  for (const ms of CZEKAJ_MS) {
    if (ms) await new Promise((r) => setTimeout(r, ms));
    try {
      return await fn(blockTag === undefined ? {} : { blockTag });
    } catch (e) {
      ostatni = e;
    }
  }
  throw ostatni;
}

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  // ---- TWARDA BLOKADA MAINNETU ----
  // Ten skrypt WYDAJE pieniadze i wysyla je na adresy o publicznie znanych
  // kluczach. Na mainnecie to nie jest test, tylko darowizna dla kazdego, kto
  // zna fraze testowa Hardhata.
  if (chainId === 8453) {
    throw new Error(
      'To jest MAINNET. Ten skrypt wysyla srodki na adresy z PUBLICZNIE ZNANYMI ' +
        'kluczami - na mainnecie kazdy moglby je natychmiast zabrac. Odmawiam.'
    );
  }

  const file = path.join(__dirname, '..', 'deployments', `askEscrow.${chainId}.json`);
  if (!fs.existsSync(file)) throw new Error(`Brak ${path.relative(process.cwd(), file)}`);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));

  const [author] = await ethers.getSigners();
  const escrow = await ethers.getContractAt('AskEscrow', record.address, author);
  const token = new ethers.Contract(record.token, ERC20_ABI, author);
  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
  const fmt = (v) => `${ethers.formatUnits(v, decimals)} ${symbol}`;

  // ---- ZWYCIEZCY ----
  const w1 = ethers.HDNodeWallet.fromPhrase(TEST_MNEMONIC, undefined, "m/44'/60'/0'/0/1").address;
  const w2 = ethers.HDNodeWallet.fromPhrase(TEST_MNEMONIC, undefined, "m/44'/60'/0'/0/2").address;

  // ---- PARAMETRY ASKA ----
  const PER_ANSWER = 1n * USDC; // 1 USDC za odpowiedz
  const SEATS = 2;
  const BUDGET = PER_ANSWER * BigInt(SEATS);
  const latest = await ethers.provider.getBlock('latest');
  const deadline = BigInt(latest.timestamp) + 3600n; // +1h, spokojnie w MAX_DURATION

  // askId musi byc unikalny dla tego autora - klucz to hash(author, askId),
  // a raz uzytego nie da sie sfinansowac drugi raz (AlreadyFunded). Bierzemy
  // wiec numer biezacego bloku, zeby kolejne uruchomienie nie kolidowalo.
  const askId = ethers.keccak256(
    ethers.toUtf8Bytes(`mysphere-cycle-${chainId}-${latest.number}`)
  );

  console.log(`Siec:     ${net.name} (chainId ${chainId})`);
  console.log(`Escrow:   ${record.address}`);
  console.log(`Autor:    ${author.address}`);
  console.log(`askId:    ${askId}`);
  console.log(`Budzet:   ${fmt(BUDGET)}  (${SEATS} x ${fmt(PER_ANSWER)})`);
  console.log(`Zwyciezcy: ${w1}\n           ${w2}\n`);

  // ---- STAN PRZED ----
  // Przypiety do JEDNEGO bloku, zeby piec odczytow nie pochodzilo z pieciu
  // roznych chwil - inaczej sama migawka "przed" moze byc wewnetrznie sprzeczna.
  const blokPrzed = latest.number;
  const stanW = async (blok) => ({
    author: await czytaj((o) => token.balanceOf(author.address, o), blok),
    escrow: await czytaj((o) => token.balanceOf(record.address, o), blok),
    w1: await czytaj((o) => token.balanceOf(w1, o), blok),
    w2: await czytaj((o) => token.balanceOf(w2, o), blok),
    liabilities: await czytaj((o) => escrow.totalLiabilities(o), blok),
  });
  const before = await stanW(blokPrzed);
  console.log('PRZED:');
  console.log(`  autor:   ${fmt(before.author)}`);
  console.log(`  escrow:  ${fmt(before.escrow)}   (liabilities ${fmt(before.liabilities)})`);
  console.log(`  w1 / w2: ${fmt(before.w1)} / ${fmt(before.w2)}\n`);

  if (before.author < BUDGET) {
    throw new Error(`Autor ma ${fmt(before.author)}, potrzeba ${fmt(BUDGET)}.`);
  }

  const eth = await ethers.provider.getBalance(author.address);
  console.log(`Gaz w portfelu: ${ethers.formatEther(eth)} ETH\n`);

  const wysylam = async (label, promise) => {
    const tx = await promise;
    process.stdout.write(`${label.padEnd(14)} ${tx.hash} `);
    const receipt = await tx.wait(1);
    console.log(`OK (blok ${receipt.blockNumber}, gaz ${receipt.gasUsed})`);
    return receipt;
  };

  // ---- 1. APPROVE ----
  // Pozwolenie DOKLADNIE na budzet. Nieskonczonego approve tu nie ma celowo:
  // eskrow ma prawo wziac tyle, ile zamraza, i ani jednostki wiecej.
  await wysylam('approve', token.approve(record.address, BUDGET));

  // ---- 2. FUND ----
  const kwitFund = await wysylam('fund', escrow.fund(askId, PER_ANSWER, SEATS, deadline));

  const po_fund = await czytaj((o) => token.balanceOf(record.address, o), kwitFund.blockNumber);
  console.log(`  -> w kontrakcie: ${fmt(po_fund)}`);
  const state = await czytaj((o) => escrow.escrowFor(author.address, askId, o), kwitFund.blockNumber);
  console.log(`  -> escrowFor: perAnswer=${fmt(state.perAnswer)} seats=${state.seats}\n`);

  // ---- 3. RESOLVE ----
  // answerRefs to hashe odpowiedzi - w produkcie beda to identyfikatory
  // dokumentow z askAnswers. Kontrakt ich nie interpretuje, tylko emituje
  // w zdarzeniu, zeby dalo sie polaczyc wyplate z konkretna odpowiedzia.
  const refs = [
    ethers.keccak256(ethers.toUtf8Bytes('answer-1')),
    ethers.keccak256(ethers.toUtf8Bytes('answer-2')),
  ];
  const kwitResolve = await wysylam('resolve', escrow.resolve(askId, [w1, w2], refs));

  const b = kwitResolve.blockNumber;
  console.log(`  -> claimable w1: ${fmt(await czytaj((o) => escrow.claimable(w1, o), b))}`);
  console.log(`  -> claimable w2: ${fmt(await czytaj((o) => escrow.claimable(w2, o), b))}\n`);

  // ---- 4. CLAIM FOR ----
  // `claimFor` zamiast `claim`, bo zwyciezcy nie maja tu gazu. To jest ta sama
  // wlasciwosc, ktora w produkcie pozwala odpowiadajacemu dostac pieniadze bez
  // posiadania ETH: ktokolwiek moze wypchnac wyplate, a adres docelowy jest
  // zaszyty w ksiedze, wiec wolajacy nie ma czego przekierowac.
  await wysylam('claimFor w1', escrow.claimFor(w1));
  const kwitOstatni = await wysylam('claimFor w2', escrow.claimFor(w2));

  // ---- 5. KONTROLA ----
  const after = await stanW(kwitOstatni.blockNumber);

  console.log('\nPO:');
  console.log(`  autor:   ${fmt(after.author)}   (bylo ${fmt(before.author)})`);
  console.log(`  escrow:  ${fmt(after.escrow)}   (liabilities ${fmt(after.liabilities)})`);
  console.log(`  w1 / w2: ${fmt(after.w1)} / ${fmt(after.w2)}`);

  const problemy = [];
  if (after.author !== before.author - BUDGET) {
    problemy.push(`autor stracil ${fmt(before.author - after.author)}, oczekiwano ${fmt(BUDGET)}`);
  }
  if (after.w1 !== before.w1 + PER_ANSWER) problemy.push('w1 nie dostal dokladnie perAnswer');
  if (after.w2 !== before.w2 + PER_ANSWER) problemy.push('w2 nie dostal dokladnie perAnswer');
  if (after.liabilities !== before.liabilities) {
    problemy.push(`liabilities ${fmt(before.liabilities)} -> ${fmt(after.liabilities)}`);
  }
  if (after.escrow !== before.escrow) {
    problemy.push(`w kontrakcie zostalo ${fmt(after.escrow - before.escrow)} ponad stan poczatkowy`);
  }

  if (problemy.length) {
    console.log('\nNIEZGODNOSCI:');
    problemy.forEach((p) => console.log(`  - ${p}`));
    throw new Error('Cykl zakonczony, ale salda sie nie zgadzaja.');
  }

  console.log('\nCYKL PRZESZEDL. Prawdziwe USDC weszlo do escrow i wyszlo do dwoch obcych portfeli.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
