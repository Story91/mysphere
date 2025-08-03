import { ethers } from 'hardhat';
import { LINEA_CONFIG } from '../config/LineaNetworkConfig';

async function main() {
  console.log('🚀 Rozpoczynanie deployu LineaPostContract na sieci Linea...');
  console.log('📍 Sieć:', LINEA_CONFIG.name);
  console.log('🔗 Chain ID:', LINEA_CONFIG.chainId);
  console.log('🌐 RPC URL:', LINEA_CONFIG.rpcUrl);
  console.log('📊 Explorer:', LINEA_CONFIG.explorerUrl);

  // Pobierz deployer account
  const [deployer] = await ethers.getSigners();
  console.log('👤 Deploying z konta:', deployer.address);

  // Sprawdź balans
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('💰 Balans konta:', ethers.formatEther(balance), 'ETH');

  if (balance < ethers.parseEther('0.001')) {
    console.warn('⚠️  UWAGA: Niski balans ETH! Upewnij się, że masz wystarczająco ETH na gas.');
  }

  // Deploy kontraktu
  console.log('\n📝 Kompilowanie i deployowanie LineaPostContract...');
  
  const LineaPostContract = await ethers.getContractFactory('LineaPostContract');
  const lineaPostContract = await LineaPostContract.deploy();

  // Czekaj na potwierdzenie
  console.log('⏳ Czekanie na potwierdzenie deployu...');
  await lineaPostContract.waitForDeployment();

  const contractAddress = await lineaPostContract.getAddress();
  console.log('✅ LineaPostContract został wdrożony na adres:', contractAddress);

  // Informacje dodatkowe
  console.log('\n📋 Szczegóły kontraktu:');
  console.log('🏠 Adres kontraktu:', contractAddress);
  console.log('👑 Właściciel:', deployer.address);
  console.log('🔗 Explorer link:', `${LINEA_CONFIG.explorerUrl}/address/${contractAddress}`);

  // Testuj podstawowe funkcje
  console.log('\n🧪 Testowanie podstawowych funkcji...');
  
  try {
    const totalPosts = await lineaPostContract.getTotalPosts();
    console.log('📊 Początkowa liczba postów:', totalPosts.toString());
    
    const isPaused = await lineaPostContract.isPaused();
    console.log('⏸️  Czy kontrakt jest wstrzymany:', isPaused);
    
    const owner = await lineaPostContract.owner();
    console.log('👑 Właściciel kontraktu:', owner);
    
    console.log('✅ Wszystkie testy podstawowe przeszły pomyślnie!');
  } catch (error) {
    console.error('❌ Błąd podczas testowania:', error);
  }

  // Instrukcje dla dalszej konfiguracji
  console.log('\n📝 NASTĘPNE KROKI:');
  console.log('1. Zaktualizuj LINEA_CONTRACT_ADDRESS w LineaPostContract.ts:');
  console.log(`   export const LINEA_CONTRACT_ADDRESS = '${contractAddress}';`);
  console.log('\n2. Zweryfikuj kontrakt na Lineascan:');
  console.log(`   npx hardhat verify --network linea ${contractAddress}`);
  console.log('\n3. Dodaj adres do konfiguracji w providers.tsx');
  console.log('\n4. Przetestuj frontend z nowym kontraktem');

  // Zapis do pliku dla automatycznej konfiguracji
  const fs = require('fs');
  const deploymentInfo = {
    contractAddress: contractAddress,
    deployerAddress: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    network: 'linea',
    chainId: LINEA_CONFIG.chainId,
    gasUsed: 'TBD', // Będzie dostępne w receipt
  };

  fs.writeFileSync(
    './app/basechat/Linea/deployment-info.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log('💾 Informacje o deployu zapisane w deployment-info.json');
}

main()
  .then(() => {
    console.log('\n🎉 Deploy zakończony pomyślnie!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Deploy nie powiódł się:', error);
    process.exit(1);
  });