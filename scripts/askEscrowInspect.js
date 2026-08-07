/**
 * Diagnostyka po cyklu: status KAZDEGO kwitu + swiezy odczyt stanu.
 * Nic nie wysyla.
 *
 *   npx hardhat run scripts/askEscrowInspect.js --network base-sepolia
 *
 * Powod istnienia: cykl zglosil niezgodnosc sald, a odczyty tuz po
 * `tx.wait(1)` pokazywaly zera przy transakcjach, ktore ewidentnie przeszly.
 * Trzeba rozroznic dwie zupelnie rozne przyczyny:
 *   (a) wezel oddaje PRZESTARZALY stan przy eth_call - kod jest w porzadku,
 *   (b) ktoras transakcja COFNELA SIE, a my potraktowalismy ja jak sukces.
 * Rozstrzyga o tym `receipt.status` i logi zdarzen, nie salda.
 */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const HASHES = process.env.ASK_ESCROW_HASHES
  ? process.env.ASK_ESCROW_HASHES.split(',').map((h) => h.trim()).filter(Boolean)
  : [];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const record = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'deployments', `askEscrow.${chainId}.json`), 'utf8')
  );

  const escrow = await ethers.getContractAt('AskEscrow', record.address);
  const token = new ethers.Contract(record.token, ERC20_ABI, ethers.provider);
  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
  const fmt = (v) => `${ethers.formatUnits(v, decimals)} ${symbol}`;

  const blok = await ethers.provider.getBlockNumber();
  console.log(`Siec: ${net.name} (${chainId}), najnowszy blok: ${blok}\n`);

  // ---- KWITY ----
  if (HASHES.length) {
    console.log('KWITY:');
    for (const hash of HASHES) {
      const receipt = await ethers.provider.getTransactionReceipt(hash);
      if (!receipt) {
        console.log(`  ${hash}  BRAK KWITU (nie zostala wykopana?)`);
        continue;
      }
      const stan = receipt.status === 1 ? 'SUKCES' : 'COFNIETA';
      console.log(`  ${hash}`);
      console.log(`     status=${stan}  blok=${receipt.blockNumber}  gaz=${receipt.gasUsed}  logow=${receipt.logs.length}`);

      // Zdarzenia escrow rozszyfrowane - to jest dowod, ze funkcja naprawde
      // zrobila to, co miala, a nie tylko "nie rzucila".
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== record.address.toLowerCase()) continue;
        try {
          const parsed = escrow.interface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed) console.log(`     -> ${parsed.name}(${parsed.args.map(String).join(', ')})`);
        } catch {
          console.log('     -> (nierozpoznane zdarzenie escrow)');
        }
      }
    }
    console.log('');
  }

  // ---- SWIEZY STAN ----
  const author = process.env.ASK_ESCROW_AUTHOR || record.feeRecipient;
  console.log('STAN (swiezy odczyt):');
  console.log(`  saldo kontraktu:  ${fmt(await token.balanceOf(record.address))}`);
  console.log(`  totalLiabilities: ${fmt(await escrow.totalLiabilities())}`);
  console.log(`  claimable(autor ${author}): ${fmt(await escrow.claimable(author))}`);

  if (process.env.ASK_ESCROW_ASK_ID) {
    const state = await escrow.escrowFor(author, process.env.ASK_ESCROW_ASK_ID);
    console.log(`\n  escrowFor(${author}, ${process.env.ASK_ESCROW_ASK_ID}):`);
    console.log(`    perAnswer=${fmt(state.perAnswer)} seats=${state.seats} deadline=${state.deadline}`);
  }

  for (const addr of (process.env.ASK_ESCROW_WINNERS || '').split(',').map((a) => a.trim()).filter(Boolean)) {
    console.log(`  claimable(${addr}): ${fmt(await escrow.claimable(addr))}   saldo: ${fmt(await token.balanceOf(addr))}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
