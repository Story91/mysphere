import { JsonRpcProvider, Contract } from 'ethers';

const p = new JsonRpcProvider('https://mainnet.base.org');

const FACTORY = '0xB20f000000000000000000000000000000000000';
const POLICY = '0x8453000000000000000000000000000000000002';

for (const [name, addr] of [
  ['B20 factory', FACTORY],
  ['Policy registry', POLICY],
]) {
  const code = await p.getCode(addr);
  console.log(`${name.padEnd(16)} ${addr}  ->  ${code === '0x' ? 'BRAK KODU' : `${(code.length - 2) / 2} bajtow`}`);
}

// Czy precompile odpowiada na cokolwiek standardowego
const probe = new Contract(
  FACTORY,
  ['function variantOf(address) view returns (uint8)'],
  p
);
try {
  const v = await probe.variantOf(FACTORY);
  console.log('variantOf() odpowiada:', v.toString());
} catch (e) {
  console.log('variantOf() nie istnieje albo inna sygnatura:', (e.shortMessage || e.message).slice(0, 90));
}

console.log('blok:', await p.getBlockNumber());
