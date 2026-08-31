import { ethers } from 'hardhat';
import { ROBINHOOD_CONFIG, ROBINHOOD_TESTNET_CHAIN_ID } from '../config/RobinhoodNetworkConfig';

// Deploy RobinhoodPostContract na Robinhood Chain.
//
// Uruchomienie:
//   npm run contracts:deploy:robinhood
// (pod spodem: hardhat run app/basechat/Robinhood/scripts/deploy-robinhood.ts --network robinhood)
//
// Wymagania:
//  - PRIVATE_KEY w .env.local (root hardhat.config.ts czyta .env.local, potem .env)
//  - troche ETH na koncie deployera na gas
//
// Zrodlo kontraktu: camp-contract/RobinhoodPostContract.sol - lezy tam, bo root
// hardhat.config.ts ma paths.sources ustawione na ./camp-contract.
//
// UWAGA RPC: publiczny endpoint Robinhood Chain jest rate-limited i oficjalnie
// "not recommended for production". Do jednorazowego deployu wystarcza, ale jak
// bedzie rzucal bledami - ustaw ROBINHOOD_RPC_URL na wlasny endpoint.

async function main() {
  console.log('🚀 Rozpoczynanie deployu RobinhoodPostContract...');
  console.log('📍 Siec:', ROBINHOOD_CONFIG.name);
  console.log('🔗 Chain ID:', ROBINHOOD_CONFIG.chainId);
  console.log('🌐 RPC URL:', ROBINHOOD_CONFIG.rpcUrl);
  console.log('📊 Explorer:', ROBINHOOD_CONFIG.explorerUrl);

  // Pobierz deployer account
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      'Brak konta do deployu. Ustaw PRIVATE_KEY w .env.local (bez prefiksu 0x lub z nim - hardhat przyjmuje oba).'
    );
  }
  const deployer = signers[0];
  console.log('👤 Deploying z konta:', deployer.address);

  // Sprawdz ze faktycznie jestesmy na wlasciwej sieci - zeby nie wdrozyc
  // kontraktu przypadkiem na innym chainie przy zlym --network.
  // Akceptujemy mainnet (4663) i testnet (46630), bo skrypt obsluguje oba
  // (npm run contracts:deploy:robinhood[:testnet]).
  const network = await ethers.provider.getNetwork();
  const connectedChainId = Number(network.chainId);
  const allowedChainIds = [ROBINHOOD_CONFIG.chainId, ROBINHOOD_TESTNET_CHAIN_ID];
  if (!allowedChainIds.includes(connectedChainId)) {
    throw new Error(
      `Zly chainId: RPC zwrocil ${connectedChainId}, oczekiwano ${allowedChainIds.join(' lub ')}. ` +
      'Sprawdz flage --network robinhood / --network robinhoodTestnet oraz ROBINHOOD_RPC_URL.'
    );
  }
  const isTestnet = connectedChainId === ROBINHOOD_TESTNET_CHAIN_ID;
  console.log('✅ Potwierdzony chainId z RPC:', connectedChainId, isTestnet ? '(testnet)' : '(mainnet)');

  // Sprawdz balans
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('💰 Balans konta:', ethers.formatEther(balance), 'ETH');

  if (balance < ethers.parseEther('0.001')) {
    console.warn('⚠️  UWAGA: Niski balans ETH! Upewnij sie, ze masz wystarczajaco ETH na gas.');
  }

  // Deploy kontraktu
  console.log('\n📝 Kompilowanie i deployowanie RobinhoodPostContract...');

  const RobinhoodPostContract = await ethers.getContractFactory('RobinhoodPostContract');
  const robinhoodPostContract = await RobinhoodPostContract.deploy();

  // Czekaj na potwierdzenie
  console.log('⏳ Czekanie na potwierdzenie deployu...');
  await robinhoodPostContract.waitForDeployment();

  const contractAddress = await robinhoodPostContract.getAddress();
  console.log('✅ RobinhoodPostContract zostal wdrozony na adres:', contractAddress);

  // Informacje dodatkowe
  console.log('\n📋 Szczegoly kontraktu:');
  console.log('🏠 Adres kontraktu:', contractAddress);
  console.log('👑 Wlasciciel:', deployer.address);
  console.log('🔗 Explorer link:', `${ROBINHOOD_CONFIG.explorerUrl}/address/${contractAddress}`);

  // Testuj podstawowe funkcje
  console.log('\n🧪 Testowanie podstawowych funkcji...');

  try {
    const totalPosts = await robinhoodPostContract.getTotalPosts();
    console.log('📊 Poczatkowa liczba postow:', totalPosts.toString());

    const isPaused = await robinhoodPostContract.isPaused();
    console.log('⏸️  Czy kontrakt jest wstrzymany:', isPaused);

    const owner = await robinhoodPostContract.owner();
    console.log('👑 Wlasciciel kontraktu:', owner);

    console.log('✅ Wszystkie testy podstawowe przeszly pomyslnie!');
  } catch (error) {
    console.error('❌ Blad podczas testowania:', error);
  }

  // Dokladna linia do wklejenia w .env.local - to jedyne miejsce, ktore
  // wlacza postowanie na Robinhood Chain we frontendzie.
  console.log('\n' + '='.repeat(72));
  console.log('📝 NASTEPNY KROK - wklej DOKLADNIE te linie do .env.local:');
  console.log('');
  console.log(`NEXT_PUBLIC_ROBINHOOD_POST_CONTRACT=${contractAddress}`);
  console.log('');
  console.log('='.repeat(72));
  console.log('\nPotem zrestartuj dev server / przebuduj aplikacje - zmienne');
  console.log('NEXT_PUBLIC_* sa wstrzykiwane w czasie builda.');
  console.log('\nWeryfikacja kontraktu na Blockscout (opcjonalnie):');
  console.log(`   npx hardhat verify --network robinhood ${contractAddress}`);

  // Zapis do pliku dla automatycznej konfiguracji
  const fs = require('fs');
  const path = require('path');
  const deploymentInfo = {
    contractAddress: contractAddress,
    deployerAddress: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    network: isTestnet ? 'robinhoodTestnet' : 'robinhood',
    chainId: connectedChainId,
    explorerUrl: `${ROBINHOOD_CONFIG.explorerUrl}/address/${contractAddress}`,
    envLine: `NEXT_PUBLIC_ROBINHOOD_POST_CONTRACT=${contractAddress}`,
  };

  const outPath = path.join(__dirname, '..', 'deployment-info.json');
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('\n💾 Informacje o deployu zapisane w', outPath);
}

main()
  .then(() => {
    console.log('\n🎉 Deploy zakonczony pomyslnie!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Deploy nie powiodl sie:', error);
    process.exit(1);
  });
