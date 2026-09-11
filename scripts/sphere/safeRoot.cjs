/**
 * JEDNORAZOWY root dystrybutora: dotychczasowi tworcy + lisc skarbca.
 *
 * Nie jest czescia cyklu tygodniowego - automat epoki (publishEpoch.ts) liczy
 * nagrody z wolumenu i nic o tym pliku nie wie. To narzedzie do jednej,
 * recznej decyzji wlasciciela z 12.09.2026: przeniesc 8 000 000 SPHERE
 * z dystrybutora z powrotem na Safe.
 *
 * DLACZEGO PRZEZ ROOT, A NIE PRZELEWEM
 * Dystrybutor nie ma funkcji wyplaty. Cala jego powierzchnia zewnetrzna to
 * propose / veto / activate / vestedOf / claim - brak sweep, rescue, withdraw
 * i wlasciciela. Tokeny wychodza stamtad wylacznie przez `claim` przeciwko
 * aktywowanemu rootowi, wiec jedyna droga jest root z lisciem na adres Safe.
 *
 * DLACZEGO prevCumulative == cumulative DLA WSZYSTKICH
 * `vestedOf` liczy prev + (cum - prev) * czas / STREAM_DURATION. Przy zerowym
 * przyroscie cala kwota jest odblokowana juz w sekundzie aktywacji, wiec nikt
 * nie czeka siedmiu dni. Dla tworcow to poprawa, nie strata: dostaja
 * natychmiastowy dostep do reszty naleznosci zamiast czekac, az dosaczy sie
 * stara epoka. Ich kwoty (`cumulative`) zostaja nietkniete.
 *
 * MIN_DELAY jest immutable - 24 h okna weta obowiazuje i tego nie da sie obejsc.
 *
 * Uruchomienie Z KATALOGU REPO:
 *   node scripts/sphere/safeRoot.cjs                     - policz i pokaz
 *   $env:WRITE="tak"; node scripts/sphere/safeRoot.cjs   - zapisz manifest
 *   $env:PROPOSE="tak"; ...                              - i wywolaj propose()
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const REPO = process.cwd();
const PUB = path.join(REPO, 'public', 'sphere-epochs');
const OUT = path.join(REPO, 'scripts', 'output', 'sphere-epochs');

const DIST = '0xc0b018161bB48383c808Aa47923f5501758D3E9D';
const SAFE = '0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F';
const TOKEN = '0xB200000000000000000000BA5eDb84c678432476';
const SAFE_AMOUNT = 8_000_000n * 10n ** 18n;

const env = fs.readFileSync(path.join(REPO, '.env.local'), 'utf8');
const pick = (n) => (env.match(new RegExp(`^${n}=["']?([^"'\r\n]+)`, 'm')) || [])[1];
const rpc = `https://api.developer.coinbase.com/rpc/v1/base/${pick('NEXT_PUBLIC_ONCHAINKIT_API_KEY')}`;
const provider = new ethers.JsonRpcProvider(rpc, 8453, { staticNetwork: true });

/** Lisc i drzewo DOKLADNIE jak w kontrakcie i w publishEpoch.ts. */
const leafOf = (account, cum, prev) =>
  ethers.keccak256(
    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256', 'uint256'], [account, cum, prev]))
  );

function buildTree(leaves) {
  const sorted = leaves.slice().sort();
  const layers = [sorted];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 === prev.length) next.push(prev[i]);
      else {
        const [a, b] = [prev[i], prev[i + 1]].sort();
        next.push(ethers.keccak256(ethers.concat([a, b])));
      }
    }
    layers.push(next);
  }
  const proofs = {};
  for (const leaf of sorted) {
    const proof = [];
    let idx = sorted.indexOf(leaf);
    for (let l = 0; l < layers.length - 1; l++) {
      const sib = idx ^ 1;
      if (sib < layers[l].length) proof.push(layers[l][sib]);
      idx = Math.floor(idx / 2);
    }
    proofs[leaf] = proof;
  }
  return { root: layers[layers.length - 1][0], proofs };
}

const canonical = (obj) =>
  JSON.stringify(obj, (_k, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return v;
  });

const F = (x) => Number(ethers.formatEther(x)).toLocaleString('en-US', { maximumFractionDigits: 2 });

(async () => {
  const src = JSON.parse(fs.readFileSync(path.join(PUB, 'epoch-3.json'), 'utf8'));
  const latest = JSON.parse(fs.readFileSync(path.join(PUB, 'latest.json'), 'utf8'));

  // 1. Nowa mapa naleznosci: tworcy bez zmian + skarbiec.
  const cumulative = { ...src.cumulative };
  const safeKey = SAFE.toLowerCase();
  // Zabezpieczenie ma bronic przed PODWOJENIEM kwoty, nie przed powtorzeniem
  // tego samego przebiegu. Skrypt czyta i zapisuje ten sam plik, wiec po
  // WRITE=tak lisc skarbca juz w nim stoi - i wtedy drugie uruchomienie
  // (to z PROPOSE=tak) musi policzyc DOKLADNIE ten sam root, a nie przerwac.
  // Inna kwota pod tym adresem znaczy, ze ktos zmienil zamiar albo plik -
  // wtedy stop, bo roznica nie jest oczywista.
  const existing = cumulative[safeKey];
  if (existing && BigInt(existing) !== SAFE_AMOUNT) {
    throw new Error(`skarbiec ma juz lisc na ${F(BigInt(existing))} SPHERE, a skrypt chce ${F(SAFE_AMOUNT)} - przerywam`);
  }
  cumulative[safeKey] = SAFE_AMOUNT.toString();

  // 2. Liscie: prev == cum dla wszystkich (natychmiastowa dostepnosc).
  const leafData = Object.entries(cumulative).map(([account, cum]) => ({
    account,
    cumulative: cum,
    prevCumulative: cum,
  }));
  const tree = buildTree(leafData.map((l) => leafOf(l.account, BigInt(l.cumulative), BigInt(l.prevCumulative))));
  const leaves = leafData.map((l) => ({
    ...l,
    proof: tree.proofs[leafOf(l.account, BigInt(l.cumulative), BigInt(l.prevCumulative))],
  }));

  const totalCumulative = leafData.reduce((a, l) => a + BigInt(l.cumulative), 0n);

  // 3. Cialo manifestu w ksztalcie automatu - hash liczy sie z niego.
  const body = {
    epoch: src.epoch,
    fromBlock: src.fromBlock,
    toBlock: src.toBlock,
    closed: src.closed,
    algorithmHash: src.algorithmHash,
    inputs: src.inputs,
    result: src.result,
    poolSphere: src.poolSphere,
    vwapSpherePerEth: src.vwapSpherePerEth,
    cumulative,
    root: tree.root,
  };
  const canon = canonical(body);
  const manifestHash = ethers.keccak256(ethers.toUtf8Bytes(canon));

  // 4. Stan lancucha: wyplacalnosc, numer epoki, rola klucza.
  const dist = new ethers.Contract(
    DIST,
    [
      'function epochId() view returns (uint64)',
      'function totalCumulative() view returns (uint256)',
      'function totalClaimed() view returns (uint256)',
      'function pending() view returns (bytes32,bytes32,uint64,uint256,uint64)',
      'function PROPOSER() view returns (address)',
      'function propose(bytes32,bytes32,uint64,uint256)',
    ],
    provider
  );
  const erc = new ethers.Contract(TOKEN, ['function balanceOf(address) view returns (uint256)'], provider);
  const [epochId, onchainTotal, totalClaimed, pend, proposer, balance] = await Promise.all([
    dist.epochId(), dist.totalCumulative(), dist.totalClaimed(), dist.pending(), dist.PROPOSER(), erc.balanceOf(DIST),
  ]);

  const nextEpochId = Number(epochId) + 1;
  const solvent = balance + totalClaimed >= totalCumulative;
  const leftAfter = balance - (totalCumulative - totalClaimed);

  console.log('=== NOWY ROOT ===');
  console.log('root           ', tree.root);
  console.log('manifestHash   ', manifestHash);
  console.log('epochId nastepny', nextEpochId, '| pending czeka?', Number(pend[4]) > 0 ? 'TAK - propose go nadpisze' : 'nie');
  console.log('totalCumulative', F(totalCumulative), 'SPHERE');
  console.log('  poprzedni    ', F(onchainTotal), '| monotonicznie?', totalCumulative >= onchainTotal ? 'OK' : 'BLAD - propose odrzuci');
  console.log('\n=== LISCIE (prev == cum, wszystko dostepne od aktywacji) ===');
  for (const l of leaves) {
    console.log(' ', l.account, F(BigInt(l.cumulative)).padStart(14), 'SPHERE', l.account === safeKey ? '<-- SKARBIEC' : '');
  }
  console.log('\n=== WYPLACALNOSC (warunek activate) ===');
  console.log('saldo dystrybutora   ', F(balance), 'SPHERE');
  console.log('juz odebrane         ', F(totalClaimed));
  console.log('saldo + odebrane     ', F(balance + totalClaimed), solvent ? '>= zobowiazanie  OK' : '< zobowiazanie  BLAD');
  console.log('zostanie po wszystkim', F(leftAfter), 'SPHERE');
  console.log('\nPROPOSER kontraktu:', proposer);

  if (process.env.WRITE !== 'tak') {
    console.log('\n[bez zapisu] ustaw WRITE=tak, zeby zapisac manifest');
    return;
  }

  const manifestJson = JSON.stringify({ ...JSON.parse(canon), manifestHash, leaves }, null, 2) + '\n';
  fs.mkdirSync(PUB, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(PUB, `epoch-${src.epoch}.json`), manifestJson);
  fs.writeFileSync(path.join(OUT, `epoch-${src.epoch}.json`), manifestJson);
  fs.writeFileSync(
    path.join(PUB, 'latest.json'),
    JSON.stringify(
      {
        ...latest,
        root: tree.root,
        manifestHash,
        totalCumulative: totalCumulative.toString(),
        onchainEpochId: String(nextEpochId),
        proposedAt: new Date().toISOString(),
      },
      null,
      2
    ) + '\n'
  );
  console.log(`\nmanifest zapisany: public/sphere-epochs/epoch-${src.epoch}.json + latest.json`);

  if (process.env.PROPOSE !== 'tak') {
    console.log('[bez propose] ustaw PROPOSE=tak, zeby wywolac propose() na lancuchu');
    return;
  }
  const raw = pick('ADMIN_PRIVATE_KEY') || pick('PRIVATE_KEY');
  if (!raw || !/^(0x)?[0-9a-fA-F]{64}$/.test(raw.trim())) throw new Error('brak poprawnego klucza w .env.local');
  const wallet = new ethers.Wallet(raw.trim().startsWith('0x') ? raw.trim() : '0x' + raw.trim(), provider);
  if (wallet.address.toLowerCase() !== proposer.toLowerCase()) {
    throw new Error(`klucz ${wallet.address} nie jest PROPOSEREM (${proposer})`);
  }
  const tx = await dist.connect(wallet).propose(tree.root, manifestHash, nextEpochId, totalCumulative);
  console.log('\npropose wyslane:', tx.hash);
  const rc = await tx.wait();
  const p = await dist.pending();
  console.log('blok', rc.blockNumber, '| okno weta do', new Date(Number(p[4]) * 1000).toISOString());
  console.log('po tym czasie activate() - keeper zrobi to sam przy najblizszym biegu');
})().catch((e) => { console.error('ERR', e.shortMessage || e.message); process.exit(1); });
