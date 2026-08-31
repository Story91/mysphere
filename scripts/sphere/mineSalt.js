/**
 * Samodzielny miner vanity salt dla launchVanity - czysty node, bez hardhata.
 *
 * Lancuszek 1:1 z CurveLaunchpad._vanityLaunchId + B20TokenFactory
 * (launchId -> effectiveSalt -> ogon precompile'a). Wzorzec siedzi na
 * POCZATKU 9-bajtowego ogona (za pasem zer i bajtem wariantu).
 *
 * Uzycie:
 *   node scripts/sphere/mineSalt.js <pad> <factory> <creator> <chainId> <prefix>
 * Wynik: salt na stdout (ostatnia linia) + plik scripts/output/vanity-salt.txt
 */
const { keccak256, AbiCoder, solidityPacked } = require('ethers');
const fs = require('fs');
const path = require('path');

const [pad, factory, creator, chainIdRaw, prefixRaw] = process.argv.slice(2);
if (!prefixRaw) {
  console.error('uzycie: node mineSalt.js <pad> <factory> <creator> <chainId> <prefix>');
  process.exit(1);
}
const chainId = BigInt(chainIdRaw);
const prefix = prefixRaw.toLowerCase();
if (![...prefix].every((c) => '0123456789abcdef'.includes(c))) {
  console.error(`prefix '${prefix}' zawiera znaki spoza hex`);
  process.exit(1);
}
const abi = AbiCoder.defaultAbiCoder();
const expected = Math.pow(16, prefix.length);
console.log(`miele '${prefix}' dla creator=${creator} na chainId=${chainId} (srednio ~${expected.toLocaleString()} prob)`);

const t0 = Date.now();
for (let i = 0n; ; i++) {
  const salt = '0x' + i.toString(16).padStart(64, '0');
  const launchId = keccak256(abi.encode(['address', 'address', 'bytes32', 'uint256'], [pad, creator, salt, chainId]));
  const effectiveSalt = keccak256(solidityPacked(['address', 'bytes32'], [pad, launchId]));
  const tail = keccak256(abi.encode(['address', 'bytes32'], [factory, effectiveSalt])).slice(2, 20);
  if (tail.startsWith(prefix)) {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`znaleziono po ${i} probach w ${secs}s; ogon adresu: ${tail}`);
    const out = path.join(__dirname, '..', 'output', 'vanity-salt.txt');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, salt + '\n');
    console.log(salt);
    process.exit(0);
  }
  if (i > 0n && i % 250_000n === 0n) {
    const rate = Number(i) / ((Date.now() - t0) / 1000);
    console.log(`...${i.toLocaleString()} prob (${Math.round(rate).toLocaleString()}/s)`);
  }
}
