/**
 * Wdrozenie AskEscrow.
 *
 *   npx hardhat run scripts/deployAskEscrow.js --network base-sepolia
 *
 * === CZEGO TEN SKRYPT PILNUJE, ZANIM WYDA GAZ ===
 * Kontrakt trzyma cudze pieniadze, a jego parametry sa NIEZMIENNE - token,
 * odbiorca oplaty i stawka sa `immutable`, wiec pomylka nie da sie poprawic
 * inaczej niz wdrozeniem od nowa. Dlatego wszystko jest sprawdzane PRZED
 * wyslaniem transakcji, a nie po.
 *
 * Sprawdzane:
 *   - czy siec zgadza sie z oczekiwanym chainId (deploy na zla siec to
 *     najlatwiejsza i najdrozsza pomylka)
 *   - czy adres tokena MA KOD - kontrakt bez kodu przyjmowalby kazde
 *     wywolanie transferu jako sukces, wiec escrow "dzialalby", nie przenoszac
 *     ani centa
 *   - czy token ma SZESC miejsc dziesietnych, nie osiemnascie
 *   - czy portfel ma z czego zaplacic
 *
 * Po wdrozeniu skrypt odczytuje parametry Z LANCUCHA i porownuje z tym, co
 * mial wpisac. Bez tego "wdrozone" znaczy tylko "transakcja przeszla".
 */
const hre = require('hardhat');

/** USDC na Base Sepolia (Circle). Zweryfikowane: ma kod, 6 miejsc. */
const TOKEN_BY_CHAIN = {
  84532: { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', name: 'USDC (Base Sepolia)' },
  8453: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USDC (Base mainnet)' },
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

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`Siec:      ${net.name} (chainId ${chainId})`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Saldo:     ${ethers.formatEther(balance)} ETH`);
  console.log(`Token:     ${token.address}  ${token.name}`);

  // 1. Token musi miec kod. Kontrakt tez to sprawdza, ale lepiej odbic sie
  //    tutaj niz spalic gaz na nieudanym deployu.
  const code = await ethers.provider.getCode(token.address);
  if (code === '0x') throw new Error('Adres tokena nie ma kodu - zly adres albo zla siec.');

  // 2. Szesc miejsc, nie osiemnascie. Pomylka tutaj to blad kwot o bilion.
  const erc20 = new ethers.Contract(
    token.address,
    ['function decimals() view returns (uint8)'],
    ethers.provider
  );
  const decimals = Number(await erc20.decimals());
  if (decimals !== 6) {
    throw new Error(`Token ma ${decimals} miejsc dziesietnych, oczekiwano 6. Zly adres?`);
  }

  if (balance === 0n) throw new Error('Portfel nie ma ETH na gaz.');

  // Odbiorca oplaty: ten sam portfel, ktory wdraza, chyba ze podano inaczej.
  const feeRecipient = process.env.ASK_ESCROW_FEE_RECIPIENT?.trim() || deployer.address;
  console.log(`Oplata:    ${FEE_BPS / 100}%  ->  ${feeRecipient}`);
  console.log('');

  const Factory = await ethers.getContractFactory('AskEscrow');
  const escrow = await Factory.deploy(token.address, feeRecipient, FEE_BPS);
  console.log(`Transakcja: ${escrow.deploymentTransaction().hash}`);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log(`\nWDROZONY:  ${address}`);

  // 3. Kontrola PO fakcie - czytamy z lancucha, nie ufamy wlasnym argumentom.
  const onchainToken = await escrow.TOKEN();
  const onchainFee = await escrow.FEE_BPS();
  const onchainRecipient = await escrow.FEE_RECIPIENT();

  const zgadza =
    onchainToken.toLowerCase() === token.address.toLowerCase() &&
    Number(onchainFee) === FEE_BPS &&
    onchainRecipient.toLowerCase() === feeRecipient.toLowerCase();

  console.log(`\n--- odczyt z lancucha ---`);
  console.log(`TOKEN:         ${onchainToken}`);
  console.log(`FEE_BPS:       ${onchainFee}`);
  console.log(`FEE_RECIPIENT: ${onchainRecipient}`);
  console.log(zgadza ? '\nZGODNE z tym, co mialo byc wdrozone.' : '\nUWAGA: ROZJAZD parametrow!');

  if (!zgadza) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
