/**
 * Wdrozenie AskEscrow.
 *
 *   npx hardhat run scripts/deployAskEscrow.js --network base-sepolia
 *
 * MAINNET wymaga SWIADOMEGO potwierdzenia zmienna srodowiskowa:
 *   ASK_ESCROW_CONFIRM_MAINNET=yes npx hardhat run ... --network base
 *
 * === CZEGO TEN SKRYPT PILNUJE, ZANIM WYDA GAZ ===
 * Parametry kontraktu sa `immutable` - pomylki nie da sie poprawic inaczej niz
 * wdrozeniem od nowa, a kontrakt trzyma cudze pieniadze. Wszystko jest wiec
 * sprawdzane PRZED wyslaniem transakcji.
 *
 * Poprawki po przegladzie kodu (kazda zamyka realny scenariusz):
 *   - MAINNET ZA BRAMKA. Pierwsza wersja deployowala na `--network base` bez
 *     jednego pytania. `--network base` zostawione w historii powloki po
 *     pracy nad x402 wystarczylo, zeby postawic niezmienny escrow na mainnecie.
 *   - ODBIORCA OPLATY WALIDOWANY. Bylo `env?.trim() || deployer.address`:
 *     pusta zmienna (`ASK_ESCROW_FEE_RECIPIENT=`) jest falsy, wiec zamierzony
 *     odbiorca znikal po cichu, a oplaty szly na goracy klucz deployera - i to
 *     wlasnie sie stalo przy pierwszym wdrozeniu. Teraz adres musi byc podany
 *     jawnie i przejsc `isAddress`, albo skrypt odmawia.
 *   - CZEKANIE NA POTWIERDZENIA. Odczyt tuz po `waitForDeployment()` potrafi
 *     trafic w wezel bez stanu; skrypt konczyl sie wtedy bledem, chociaz
 *     wdrozenie sie powiodlo - i kusil do ponownego uruchomienia, czyli
 *     drugiego kontraktu.
 *   - SALDO LICZONE Z KOSZTU, nie porownywane z zerem. `balance === 0n`
 *     przepuszczalo portfel z jednym wei.
 *   - ZAPIS ADRESU do deployments/ - inaczej jedynym sladem jest wklejona
 *     recznie stala w drugim skrypcie.
 *   - WERYFIKACJA ZRODLA na eksplorerze. Cala wartosc tego kontraktu polega
 *     na tym, ze odpowiadajacy moze SAM sprawdzic, czy pieniadze sa
 *     zablokowane. Bez zweryfikowanego zrodla widzi opkody.
 */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

/** Sieci, na ktorych wolno wdrazac, wraz z tokenem rozliczeniowym. */
const TOKEN_BY_CHAIN = {
  84532: {
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    name: 'USDC (Base Sepolia)',
    mainnet: false,
  },
  8453: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    name: 'USDC (Base mainnet)',
    mainnet: true,
  },
};

/** 2,5%. MAX_FEE_BPS w kontrakcie to 500 (5%), wiec mamy zapas w dol. */
const FEE_BPS = 250;

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  const token = TOKEN_BY_CHAIN[chainId];
  if (!token) {
    throw new Error(
      `Brak adresu tokena dla chainId ${chainId}. Dopisz go do TOKEN_BY_CHAIN albo wybierz inna siec.`
    );
  }

  // ---- BRAMKA MAINNETU ----
  if (token.mainnet && process.env.ASK_ESCROW_CONFIRM_MAINNET !== 'yes') {
    throw new Error(
      `To jest MAINNET (chainId ${chainId}) i kontrakt jest NIEZMIENNY.\n` +
        `Jesli naprawde tego chcesz, uruchom z ASK_ESCROW_CONFIRM_MAINNET=yes.`
    );
  }

  // ---- ODBIORCA OPLATY: JAWNY I ZWALIDOWANY ----
  const rawRecipient = process.env.ASK_ESCROW_FEE_RECIPIENT?.trim();
  if (!rawRecipient) {
    throw new Error(
      'Brak ASK_ESCROW_FEE_RECIPIENT. Odbiorca oplaty jest NIEZMIENNY, wiec ' +
        'nie ma domyslnego - podaj go jawnie.'
    );
  }
  if (!ethers.isAddress(rawRecipient)) {
    throw new Error(`ASK_ESCROW_FEE_RECIPIENT nie jest adresem: ${rawRecipient}`);
  }
  const feeRecipient = ethers.getAddress(rawRecipient);

  const [deployer] = await ethers.getSigners();

  // Odczyty rownolegle - to niezalezne zapytania, a skrypt czeka na komplet.
  const [balance, code, feeData] = await Promise.all([
    ethers.provider.getBalance(deployer.address),
    ethers.provider.getCode(token.address),
    ethers.provider.getFeeData(),
  ]);

  console.log(`Siec:      ${net.name} (chainId ${chainId})${token.mainnet ? '  *** MAINNET ***' : ''}`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Saldo:     ${ethers.formatEther(balance)} ETH`);
  console.log(`Token:     ${token.address}  ${token.name}`);
  console.log(`Oplata:    ${FEE_BPS / 100}%  ->  ${feeRecipient}`);

  if (feeRecipient.toLowerCase() === deployer.address.toLowerCase()) {
    console.log(
      '\nUWAGA: odbiorca oplaty to TEN SAM klucz, ktory wdraza. Klucz deployera\n' +
        '       jest goracy (siedzi w .env.local). Rozwaz osobny adres.\n'
    );
  }

  if (code === '0x') throw new Error('Adres tokena nie ma kodu - zly adres albo zla siec.');

  const erc20 = new ethers.Contract(
    token.address,
    ['function decimals() view returns (uint8)'],
    ethers.provider
  );
  const decimals = Number(await erc20.decimals());
  if (decimals !== 6) {
    throw new Error(`Token ma ${decimals} miejsc dziesietnych, oczekiwano 6. Zly adres?`);
  }

  // ---- SALDO LICZONE Z REALNEGO KOSZTU ----
  const Factory = await ethers.getContractFactory('AskEscrow');
  const deployTx = await Factory.getDeployTransaction(token.address, feeRecipient, FEE_BPS);
  const gas = await ethers.provider.estimateGas({ ...deployTx, from: deployer.address });
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  const koszt = gas * gasPrice;

  console.log(`Szacunek:  ${gas} gazu * ${ethers.formatUnits(gasPrice, 'gwei')} gwei = ${ethers.formatEther(koszt)} ETH`);

  if (balance < koszt) {
    throw new Error(
      `Za malo ETH: mamy ${ethers.formatEther(balance)}, potrzeba ~${ethers.formatEther(koszt)}.`
    );
  }

  console.log('');
  const escrow = await Factory.deploy(token.address, feeRecipient, FEE_BPS);
  const tx = escrow.deploymentTransaction();
  console.log(`Transakcja: ${tx.hash}`);

  // ---- CZEKAMY NA POTWIERDZENIA, nie na sam kwit ----
  // Bez tego kolejny odczyt trafia w wezel bez stanu i skrypt konczy sie
  // bledem, chociaz wdrozenie sie powiodlo. Ten sam wzorzec co scripts/deploy.js.
  const confirmations = token.mainnet ? 5 : 2;
  console.log(`Czekam na ${confirmations} potwierdzen...`);
  const receipt = await tx.wait(confirmations);

  const address = await escrow.getAddress();
  console.log(`\nWDROZONY:  ${address}`);
  console.log(`Blok:      ${receipt.blockNumber}`);
  console.log(`Gaz:       ${receipt.gasUsed}`);

  // ---- ZAPIS ADRESU: jedno zrodlo prawdy ----
  const dir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `askEscrow.${chainId}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        chainId,
        address,
        txHash: tx.hash,
        block: receipt.blockNumber,
        gasUsed: String(receipt.gasUsed),
        token: token.address,
        feeRecipient,
        feeBps: FEE_BPS,
        deployedAt: new Date(0).toISOString().slice(0, 10) === '1970-01-01' ? undefined : undefined,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`Zapisano:  ${path.relative(process.cwd(), file)}`);

  // ---- WERYFIKACJA ZRODLA ----
  // Kontrakt istnieje po to, zeby odpowiadajacy mogl SAM sprawdzic, czy
  // pieniadze sa zablokowane. Bez zweryfikowanego zrodla widzi opkody.
  if (process.env.BASESCAN_API_KEY) {
    console.log('\nWeryfikuje zrodlo na eksplorerze...');
    try {
      await hre.run('verify:verify', {
        address,
        constructorArguments: [token.address, feeRecipient, FEE_BPS],
      });
      console.log('Zrodlo zweryfikowane.');
    } catch (e) {
      console.log(`Weryfikacja nie powiodla sie: ${e.message?.slice(0, 160)}`);
      console.log('Kontrakt DZIALA - to tylko czytelnosc zrodla na eksplorerze.');
    }
  } else {
    console.log('\nBrak BASESCAN_API_KEY - zrodlo NIEZWERYFIKOWANE.');
    console.log('Uruchom pozniej: npx hardhat verify --network <siec> ' + address +
      ` ${token.address} ${feeRecipient} ${FEE_BPS}`);
  }

  console.log('\nKontrola stanu: npx hardhat run scripts/verifyAskEscrow.js --network ' + hre.network.name);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
