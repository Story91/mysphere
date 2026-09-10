import { ethers } from 'hardhat';

// Deploy ArcPostContract na Arc testnet (Circle).
//
// Uruchomienie:
//   npm run contracts:deploy:arc
// (pod spodem: hardhat run app/basechat/Arc/scripts/deploy-arc.ts --network arcTestnet)
//
// Wymagania:
//  - PRIVATE_KEY w .env.local
//  - USDC NATYWNE na koncie deployera - na Arc gaz placi sie w USDC, nie w ETH.
//    Kran: https://faucet.circle.com (wybrac Arc Testnet).
//    Pierwszy deploy: 2026-09-11 z 0xD488... -> 0xD012Afb6... (deployment-info.json).
//
// Zrodlo kontraktu: contracts/ArcPostContract.sol (ten sam kod co Robinhood/Linea).

const ARC_CHAIN_ID = 5042002;
const EXPLORER = 'https://testnet.arcscan.app';

async function main() {
  console.log('🚀 Deploy ArcPostContract na Arc Testnet (chainId 5042002)');

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error('Brak konta do deployu. Ustaw PRIVATE_KEY w .env.local.');
  }
  const deployer = signers[0];
  console.log('👤 Deployer:', deployer.address);

  const network = await ethers.provider.getNetwork();
  const connectedChainId = Number(network.chainId);
  if (connectedChainId !== ARC_CHAIN_ID) {
    throw new Error(`Zly chainId: RPC zwrocil ${connectedChainId}, oczekiwano ${ARC_CHAIN_ID}. Uzyj --network arcTestnet.`);
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('💰 Balans:', ethers.formatEther(balance), 'USDC (jednostka natywna, 18 miejsc)');
  if (balance < ethers.parseEther('0.05')) {
    throw new Error('Za malo USDC na gaz. Zasil deployera z https://faucet.circle.com (Arc Testnet).');
  }

  const Factory = await ethers.getContractFactory('ArcPostContract');
  // Arc odrzuca transakcje z maxFeePerGas < 20 gwei (docs.arc.io, gas-and-fees).
  const contract: any = await Factory.deploy({ maxFeePerGas: ethers.parseUnits('25', 'gwei'), maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei') });
  console.log('⏳ Czekanie na potwierdzenie...');
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log('✅ ArcPostContract wdrozony:', contractAddress);
  console.log('🔗', `${EXPLORER}/address/${contractAddress}`);

  const totalPosts = await contract.getTotalPosts();
  const owner = await contract.owner();
  console.log('📊 Postow:', totalPosts.toString(), '| 👑 Owner:', owner);

  console.log('\n' + '='.repeat(72));
  console.log('📝 NASTEPNY KROK - wklej do .env.local ORAZ do env na Vercelu:');
  console.log(`NEXT_PUBLIC_ARC_POST_CONTRACT=${contractAddress}`);
  console.log('='.repeat(72));

  const fs = require('fs');
  const path = require('path');
  const deploymentInfo = {
    contractAddress,
    deployerAddress: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    network: 'arcTestnet',
    chainId: connectedChainId,
    explorerUrl: `${EXPLORER}/address/${contractAddress}`,
    envLine: `NEXT_PUBLIC_ARC_POST_CONTRACT=${contractAddress}`,
  };
  const outPath = path.join(__dirname, '..', 'deployment-info.json');
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('💾 Zapisano', outPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deploy nie powiodl sie:', error);
    process.exit(1);
  });
