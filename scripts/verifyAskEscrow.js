/**
 * Kontrola wdrozonego AskEscrow - czyta parametry Z LANCUCHA.
 *
 *   npx hardhat run scripts/verifyAskEscrow.js --network base-sepolia
 *
 * PO CO OSOBNO OD DEPLOYU: kontrola tuz po `waitForDeployment()` potrafi
 * trafic w wezel, ktory nie zdazyl jeszcze zaindeksowac nowego kontraktu -
 * i zwraca pustke, chociaz wdrozenie sie powiodlo. Tak wlasnie stalo sie przy
 * pierwszym uruchomieniu. Kontrola uruchamiana osobno nie ma tego problemu.
 *
 * Adres podaj przez ASK_ESCROW_ADDRESS albo pierwszym argumentem.
 */
const hre = require('hardhat');

const DEFAULT_ADDRESS = '0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6';

async function main() {
  const { ethers } = hre;
  const address = process.env.ASK_ESCROW_ADDRESS?.trim() || DEFAULT_ADDRESS;

  const net = await ethers.provider.getNetwork();
  console.log(`Siec:     ${net.name} (chainId ${net.chainId})`);
  console.log(`Kontrakt: ${address}`);

  const code = await ethers.provider.getCode(address);
  if (code === '0x') {
    throw new Error('Pod tym adresem NIE MA KODU - zla siec albo zly adres.');
  }
  console.log(`Kod:      ${(code.length - 2) / 2} bajtow\n`);

  const escrow = await ethers.getContractAt('AskEscrow', address);

  const token = await escrow.TOKEN();
  const feeBps = await escrow.FEE_BPS();
  const feeRecipient = await escrow.FEE_RECIPIENT();
  const maxFeeBps = await escrow.MAX_FEE_BPS();
  const grace = await escrow.RESOLVE_GRACE();
  const liabilities = await escrow.totalLiabilities();

  console.log(`TOKEN:            ${token}`);
  console.log(`FEE_BPS:          ${feeBps} (${Number(feeBps) / 100}%)`);
  console.log(`MAX_FEE_BPS:      ${maxFeeBps}`);
  console.log(`FEE_RECIPIENT:    ${feeRecipient}`);
  console.log(`RESOLVE_GRACE:    ${grace}s (${Number(grace) / 3600}h)`);
  console.log(`totalLiabilities: ${liabilities}`);

  // Token musi miec kod i szesc miejsc - te same warunki co przy deployu,
  // sprawdzone na tym, co FAKTYCZNIE wpisano w kontrakt.
  const erc20 = new ethers.Contract(
    token,
    ['function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
    ethers.provider
  );
  const decimals = Number(await erc20.decimals());
  let symbol = '?';
  try { symbol = await erc20.symbol(); } catch { /* symbol bywa bytes32 */ }

  console.log(`\nToken w kontrakcie: ${symbol}, ${decimals} miejsc dziesietnych`);

  const ok = decimals === 6 && Number(feeBps) <= Number(maxFeeBps) && liabilities === 0n;
  console.log(ok ? '\nSTAN POCZATKOWY POPRAWNY.' : '\nUWAGA: cos sie nie zgadza.');
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
