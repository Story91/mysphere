/**
 * Odbior naleznosci skarbca z dystrybutora nagrod.
 *
 * `claim` jest bezuprawnieniowe: gaz placi ktokolwiek, a tokeny i tak ida pod
 * adres zapisany w lisciu. Dowod Merkle bierzemy z opublikowanego manifestu,
 * czyli z tego samego pliku, z ktorego korzystaja tworcy.
 *
 * Uruchomienie Z KATALOGU REPO:
 *   node scripts/sphere/safeClaim.cjs             - tylko sprawdz i pokaz
 *   $env:LIVE="tak"; node scripts/sphere/safeClaim.cjs  - wyslij transakcje
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const REPO = process.cwd();
const DIST = '0xc0b018161bB48383c808Aa47923f5501758D3E9D';
const SAFE = '0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F';
const TOKEN = '0xB200000000000000000000BA5eDb84c678432476';

const env = fs.readFileSync(path.join(REPO, '.env.local'), 'utf8');
const pick = (n) => (env.match(new RegExp(`^${n}=["']?([^"'\r\n]+)`, 'm')) || [])[1];
const provider = new ethers.JsonRpcProvider(
  `https://api.developer.coinbase.com/rpc/v1/base/${pick('NEXT_PUBLIC_ONCHAINKIT_API_KEY')}`,
  8453,
  { staticNetwork: true }
);

const F = (x, n = 2) => Number(ethers.formatEther(x)).toLocaleString('en-US', { maximumFractionDigits: n });

(async () => {
  const latest = JSON.parse(fs.readFileSync(path.join(REPO, 'public', 'sphere-epochs', 'latest.json'), 'utf8'));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO, 'public', 'sphere-epochs', `epoch-${latest.epoch}.json`), 'utf8')
  );
  const leaf = manifest.leaves.find((l) => l.account.toLowerCase() === SAFE.toLowerCase());
  if (!leaf) throw new Error('brak liscia skarbca w manifescie');

  const dist = new ethers.Contract(
    DIST,
    [
      'function root() view returns (bytes32)',
      'function epochId() view returns (uint64)',
      'function claimed(address) view returns (uint256)',
      'function vestedOf(uint256,uint256) view returns (uint256)',
      'function claim(address,uint256,uint256,bytes32[])',
    ],
    provider
  );
  const erc = new ethers.Contract(TOKEN, ['function balanceOf(address) view returns (uint256)'], provider);

  const [root, eid, already, vested, safeBefore, distBefore] = await Promise.all([
    dist.root(), dist.epochId(), dist.claimed(SAFE),
    dist.vestedOf(BigInt(leaf.cumulative), BigInt(leaf.prevCumulative)),
    erc.balanceOf(SAFE), erc.balanceOf(DIST),
  ]);

  const claimable = vested > already ? vested - already : 0n;

  console.log('root na lancuchu  ', root);
  console.log('root w manifescie ', manifest.root, root === manifest.root ? '(zgodny)' : '(ROZJECHANY - stop)');
  console.log('epochId           ', eid.toString());
  console.log('lisc skarbca      ', F(BigInt(leaf.cumulative)), 'SPHERE | dowod:', leaf.proof.length, 'wezlow');
  console.log('juz odebrane      ', F(already));
  console.log('odblokowane teraz ', F(vested));
  console.log('DO ODBIORU        ', F(claimable), 'SPHERE');
  console.log('\nsaldo Safe        ', F(safeBefore, 0), '| dystrybutor', F(distBefore, 0));

  if (root !== manifest.root) throw new Error('root z manifestu nie zgadza sie z lancuchem - dowody nie przejda');
  if (claimable === 0n) { console.log('\nnic do odbioru'); return; }

  if (process.env.LIVE !== 'tak') {
    const gas = await dist.claim.estimateGas(SAFE, BigInt(leaf.cumulative), BigInt(leaf.prevCumulative), leaf.proof);
    console.log('\n[na sucho] szacowany gaz:', gas.toString(), '- ustaw LIVE=tak, zeby wyslac');
    return;
  }

  const raw = pick('ADMIN_PRIVATE_KEY') || pick('PRIVATE_KEY');
  if (!raw || !/^(0x)?[0-9a-fA-F]{64}$/.test(raw.trim())) throw new Error('brak poprawnego klucza w .env.local');
  const wallet = new ethers.Wallet(raw.trim().startsWith('0x') ? raw.trim() : '0x' + raw.trim(), provider);
  console.log('\nplaci gaz:', wallet.address, '|', ethers.formatEther(await provider.getBalance(wallet.address)), 'ETH');

  const tx = await dist
    .connect(wallet)
    .claim(SAFE, BigInt(leaf.cumulative), BigInt(leaf.prevCumulative), leaf.proof);
  console.log('wyslane:', tx.hash);
  const rc = await tx.wait();
  console.log('blok', rc.blockNumber, '| gaz', rc.gasUsed.toString(), '| koszt', ethers.formatEther(rc.gasUsed * rc.gasPrice), 'ETH');

  const [safeAfter, distAfter] = await Promise.all([erc.balanceOf(SAFE), erc.balanceOf(DIST)]);
  console.log('\nSafe        ', F(safeBefore, 0), '->', F(safeAfter, 0), 'SPHERE');
  console.log('dystrybutor ', F(distBefore, 0), '->', F(distAfter, 0), 'SPHERE');
})().catch((e) => { console.error('ERR', e.shortMessage || e.message); process.exit(1); });
