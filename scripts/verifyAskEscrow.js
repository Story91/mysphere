/**
 * Kontrola wdrozonego AskEscrow - czyta parametry Z LANCUCHA i porownuje
 * z tym, co MIALO byc wdrozone.
 *
 *   npx hardhat run scripts/verifyAskEscrow.js --network base-sepolia
 *
 * Adres bierze sie z deployments/askEscrow.<chainId>.json, ktory zapisuje
 * skrypt wdrozeniowy. Mozna nadpisac przez ASK_ESCROW_ADDRESS.
 *
 * === POPRAWKI PO PRZEGLADZIE KODU ===
 * Pierwsza wersja mialа trzy wady, ktore sprawialy, ze nie wykrywala tego,
 * do czego istnieje:
 *
 *   1. BRAMKA BYLA TAUTOLOGIA. Sprawdzala `feeBps <= maxFeeBps` - warunek,
 *      ktory konstruktor JUZ wymusza, wiec nie moze byc falszywy dla zadnego
 *      wdrozonego kontraktu. Kontrakt z pomylonym odbiorcą oplaty albo
 *      wskazujacy na dowolny inny token z szescioma miejscami przechodzil
 *      i drukowal "STAN POCZATKOWY POPRAWNY". Teraz porownujemy z WARTOSCIAMI
 *      OCZEKIWANYMI.
 *   2. `liabilities === 0n` W BRAMCE. Po pierwszym sfinansowaniu Aska ten
 *      warunek jest trwale falszywy, wiec jedyne narzedzie kontrolne zywego
 *      escrow swiecilo na czerwono na zawsze - i zostaloby zignorowane.
 *      Zobowiazania sa teraz DRUKOWANE, ale nie decyduja o wyniku.
 *   3. ADRES BRANY Z ARGUMENTU, ktorego kod nigdy nie czytal. Docstring
 *      obiecywal `pierwszym argumentem`, a `process.argv` nie bylo tknięte -
 *      wiec adres podany z linii polecen byl po cichu ignorowany i skrypt
 *      sprawdzal wpisana na sztywno Sepolie. Teraz zrodlem jest plik
 *      deployments/, kluczowany po chainId.
 *
 * Doszlo tez porownanie BYTECODE'U z lokalnym artefaktem. Bez tego skrypt
 * potwierdzal tylko, ze "cos tam stoi" - a nie, ze stoi tam ten kod, ktory
 * przeszedl testy.
 */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

/** Musi zgadzac sie z deployAskEscrow.js. */
const EXPECTED = {
  84532: { token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', feeBps: 250 },
  8453: { token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', feeBps: 250 },
};

function readDeployment(chainId) {
  const file = path.join(__dirname, '..', 'deployments', `askEscrow.${chainId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  const record = readDeployment(chainId);
  const address = process.env.ASK_ESCROW_ADDRESS?.trim() || record?.address;

  if (!address) {
    throw new Error(
      `Nie wiem, ktory kontrakt sprawdzac na chainId ${chainId}.\n` +
        `Podaj ASK_ESCROW_ADDRESS albo uruchom najpierw deployAskEscrow.js ` +
        `(zapisuje deployments/askEscrow.${chainId}.json).`
    );
  }

  console.log(`Siec:     ${net.name} (chainId ${chainId})`);
  console.log(`Kontrakt: ${address}${record?.address === address ? '  (z deployments/)' : ''}`);

  const code = await ethers.provider.getCode(address);
  if (code === '0x') throw new Error('Pod tym adresem NIE MA KODU - zla siec albo zly adres.');
  console.log(`Kod:      ${(code.length - 2) / 2} bajtow\n`);

  const escrow = await ethers.getContractAt('AskEscrow', address);

  // Odczyty rownolegle - osiem serii po kolei to osiem szans na limit
  // zapytan na publicznym RPC.
  const [token, feeBps, feeRecipient, maxFeeBps, grace, liabilities] = await Promise.all([
    escrow.TOKEN(),
    escrow.FEE_BPS(),
    escrow.FEE_RECIPIENT(),
    escrow.MAX_FEE_BPS(),
    escrow.RESOLVE_GRACE(),
    escrow.totalLiabilities(),
  ]);

  console.log(`TOKEN:            ${token}`);
  console.log(`FEE_BPS:          ${feeBps} (${Number(feeBps) / 100}%)`);
  console.log(`MAX_FEE_BPS:      ${maxFeeBps}`);
  console.log(`FEE_RECIPIENT:    ${feeRecipient}`);
  console.log(`RESOLVE_GRACE:    ${grace}s (${Number(grace) / 3600}h)`);
  // Zobowiazania sa INFORMACJA, nie warunkiem: po pierwszym sfinansowaniu
  // Aska nie moga byc zerowe, a kontrola ma dzialac takze na zywym escrow.
  console.log(`totalLiabilities: ${liabilities}  (informacyjnie)`);

  const problemy = [];
  const expected = EXPECTED[chainId];

  if (!expected) {
    problemy.push(`Brak oczekiwanych wartosci dla chainId ${chainId} - nie mam z czym porownac.`);
  } else {
    if (token.toLowerCase() !== expected.token.toLowerCase()) {
      problemy.push(`TOKEN to ${token}, oczekiwano ${expected.token}`);
    }
    if (Number(feeBps) !== expected.feeBps) {
      problemy.push(`FEE_BPS to ${feeBps}, oczekiwano ${expected.feeBps}`);
    }
  }

  if (record?.feeRecipient && feeRecipient.toLowerCase() !== record.feeRecipient.toLowerCase()) {
    problemy.push(`FEE_RECIPIENT to ${feeRecipient}, w deployments/ zapisano ${record.feeRecipient}`);
  }

  // Token musi miec szesc miejsc - sprawdzone na tym, co FAKTYCZNIE wpisano
  // w kontrakt, nie na tym, co skrypt mial wpisac.
  const erc20 = new ethers.Contract(
    token,
    ['function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
    ethers.provider
  );
  const decimals = Number(await erc20.decimals());
  if (decimals !== 6) problemy.push(`Token ma ${decimals} miejsc dziesietnych, oczekiwano 6`);

  let symbol = '(nie odczytano)';
  try {
    symbol = await erc20.symbol();
  } catch (e) {
    // NIE polykamy po cichu: token bez `symbol()` bywa normalny (bytes32),
    // ale rate-limit RPC albo zly adres wygladaja tak samo i trzeba je widziec.
    console.log(`\nsymbol() nie odczytany: ${String(e.message || e).slice(0, 90)}`);
  }
  console.log(`\nToken w kontrakcie: ${symbol}, ${decimals} miejsc dziesietnych`);

  // ---- CZY TO TEN KOD, KTORY PRZESZEDL TESTY ----
  // Bez tego kontrola potwierdza tylko, ze "cos tam stoi".
  try {
    const artifact = await hre.artifacts.readArtifact('AskEscrow');
    const local = artifact.deployedBytecode.toLowerCase();
    const onchain = code.toLowerCase();
    if (local.length !== onchain.length) {
      problemy.push(
        `Bytecode ma inna DLUGOSC niz lokalny artefakt (${(onchain.length - 2) / 2} vs ${(local.length - 2) / 2} bajtow) - to nie ten kontrakt albo zrodlo zmienilo sie po wdrozeniu`
      );
    } else {
      // Rowna dlugosc, a roznice to zwykle sloty argumentow `immutable`,
      // ktore sa wstawiane przy wdrozeniu - dlatego liczymy je, zamiast
      // wymagac identycznosci.
      let rozne = 0;
      for (let i = 2; i < local.length; i++) if (local[i] !== onchain[i]) rozne++;
      const proc = (rozne / (local.length - 2)) * 100;
      console.log(`Bytecode:  ${proc.toFixed(2)}% znakow rozni sie od lokalnego artefaktu (sloty immutable)`);
      if (proc > 5) {
        problemy.push(`Bytecode rozni sie od lokalnego artefaktu w ${proc.toFixed(2)}% - to za duzo na same argumenty immutable`);
      }
    }
  } catch (e) {
    console.log(`\nNie udalo sie porownac bytecode'u: ${String(e.message || e).slice(0, 90)}`);
  }

  if (problemy.length === 0) {
    console.log('\nZGODNE Z OCZEKIWANIAMI.');
  } else {
    console.log('\nROZJAZD:');
    for (const p of problemy) console.log(`  - ${p}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
