/**
 * Kontrola USDG na Robinhood Chain. SAME ODCZYTY, nic nie wysyla.
 *
 *   npx hardhat run scripts/verifyUsdgRobinhood.js --network robinhood
 *
 * === PO CO ===
 * app/api/asks/pricing.ts wskazuje USDG jako token rozliczeniowy x402 na
 * Robinhood Chain (eip155:4663) i twierdzi dwie rzeczy, ktore MUSZA byc
 * prawda, zanim ten adres trafi na strone produktu:
 *
 *   1. USDG ma 6 miejsc dziesietnych. Gdyby mial 18, cena podana w najmniejszej
 *      jednostce (10000 = 0,01) bylaby zanizona bilion razy.
 *   2. USDG obsluguje EIP-3009 (`transferWithAuthorization`). Bez tego schemat
 *      `exact` z x402 nie ma sie o co oprzec - agent nie ma czego podpisac,
 *      a caly pomysl platnosci bez gazu przestaje istniec. Komentarz w
 *      pricing.ts twierdzi, ze z czterech stablecoinow na tym lancuchu tylko
 *      USDG na to odpowiada.
 *
 * Sprawdzamy TAKZE kanoniczne adresy USDC z Base i z Arbitrum - pricing.ts
 * twierdzi, ze pod nimi na tym lancuchu nie ma zadnego kodu. Jesli kiedys
 * ktos tam cos wdrozy, to zalozenie przestanie byc prawda i lepiej dowiedziec
 * sie o tym stad niz z bledu platnosci.
 */
const hre = require('hardhat');

const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';

/** Adresy, ktorych na tym lancuchu BYC NIE POWINNO - patrz naglowek. */
const NIE_POWINNO_BYC = {
  'USDC (adres z Base)': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'USDC (adres z Arbitrum)': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
};

const ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  // EIP-3009 - to jest sedno sprawy dla x402.
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
];

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  console.log(`Siec: ${net.name} (chainId ${chainId})`);
  if (chainId !== 4663) {
    console.log('UWAGA: to nie jest Robinhood Chain (4663). Wynik nic nie znaczy.\n');
  }

  const code = await ethers.provider.getCode(USDG);
  console.log(`\nUSDG ${USDG}`);
  console.log(`  kod: ${code === '0x' ? 'BRAK - ADRES PUSTY' : `${(code.length - 2) / 2} bajtow`}`);
  if (code === '0x') {
    throw new Error('Pod adresem USDG nie ma kodu. Zly adres albo zla siec.');
  }

  const token = new ethers.Contract(USDG, ABI, ethers.provider);

  const name = await token.name().catch(() => '(brak name())');
  const symbol = await token.symbol().catch(() => '(brak symbol())');
  const decimals = await token.decimals().catch(() => null);
  const supply = await token.totalSupply().catch(() => null);

  console.log(`  name:     ${name}`);
  console.log(`  symbol:   ${symbol}`);
  console.log(`  decimals: ${decimals === null ? '(nie odpowiada)' : decimals}`);
  if (supply !== null && decimals !== null) {
    console.log(`  supply:   ${ethers.formatUnits(supply, decimals)} ${symbol}`);
  }

  // ---- EIP-3009 ----
  // `authorizationState` wolamy zerowym adresem i zerowym nonce: nie zalezy nam
  // na wyniku, tylko na tym, CZY funkcja w ogole istnieje.
  let ma3009 = true;
  try {
    await token.DOMAIN_SEPARATOR();
  } catch {
    ma3009 = false;
    console.log('  DOMAIN_SEPARATOR(): BRAK');
  }
  try {
    await token.authorizationState(ethers.ZeroAddress, ethers.ZeroHash);
    console.log('  authorizationState(): jest');
  } catch {
    ma3009 = false;
    console.log('  authorizationState(): BRAK');
  }

  console.log(`\n  EIP-3009: ${ma3009 ? 'TAK - schemat x402 `exact` ma sie o co oprzec' : 'NIE - x402 `exact` NIE ZADZIALA'}`);

  // ---- ZALOZENIA NEGATYWNE ----
  console.log('\nAdresy, ktorych tu byc nie powinno:');
  for (const [label, addr] of Object.entries(NIE_POWINNO_BYC)) {
    const c = await ethers.provider.getCode(addr);
    console.log(`  ${label.padEnd(24)} ${c === '0x' ? 'pusto (zgodnie z zalozeniem)' : 'MA KOD - ZALOZENIE NIEAKTUALNE'}`);
  }

  const zgodne = decimals !== null && Number(decimals) === 6 && ma3009;
  console.log(`\n${zgodne ? 'ZGODNE Z pricing.ts' : 'NIEZGODNE - NIE WOLNO TEGO PUBLIKOWAC'}`);
  if (!zgodne) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
