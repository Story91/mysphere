import { ethers } from 'hardhat';

// Deploy ArcPostContract na Arc (Circle) - testnet ALBO mainnet.
//
// Uruchomienie:
//   npm run contracts:deploy:arc            (testnet 5042002)
//   npm run contracts:deploy:arc:mainnet    (mainnet 5042)
//
// Siec bierze sie z tego, co oddal RPC - skrypt nie zgaduje i nie ma
// domyslnego lancucha. Dopisanie mainnetu 16.09.2026: postowanie w basechat
// dzialalo WYLACZNIE na testnecie, wiec kto mial portfel na Arc mainnet,
// dostawal prosbe o przelaczenie na siec testowa.
//
// Wymagania:
//  - PRIVATE_KEY w .env.local
//  - USDC NATYWNE na koncie deployera - na Arc gaz placi sie w USDC, nie w ETH.
//    Kran (tylko testnet): https://faucet.circle.com (wybrac Arc Testnet).
//    Na mainnecie USDC musi byc prawdziwe - deploy launchpada kosztowal 0,19 USDC,
//    ten kontrakt jest mniejszy (2 148 B kodu).
//    Pierwszy deploy: 2026-09-11 z 0xD488... -> 0xD012Afb6... (deployment-info.json).
//
// Zrodlo kontraktu: contracts/ArcPostContract.sol (ten sam kod co Robinhood/Linea).

/** Siec -> nazwa, eksplorator i plik z wynikiem. Nic poza ta mapa nie jest wspierane. */
const CHAINS: Record<number, { name: string; explorer: string; infoFile: string; envVar: string }> = {
  5042002: {
    name: 'Arc Testnet',
    explorer: 'https://testnet.arcscan.app',
    infoFile: 'deployment-info.json',
    envVar: 'NEXT_PUBLIC_ARC_POST_CONTRACT',
  },
  5042: {
    name: 'Arc Mainnet',
    explorer: 'https://arc-scan.org',
    infoFile: 'deployment-info.mainnet.json',
    envVar: 'NEXT_PUBLIC_ARC_POST_CONTRACT_MAINNET',
  },
};

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error('Brak konta do deployu. Ustaw PRIVATE_KEY w .env.local.');
  }
  const deployer = signers[0];
  console.log('👤 Deployer:', deployer.address);

  const network = await ethers.provider.getNetwork();
  const connectedChainId = Number(network.chainId);
  const target = CHAINS[connectedChainId];
  if (!target) {
    throw new Error(
      `RPC zwrocil chainId ${connectedChainId}, a ten skrypt wdraza tylko na Arc: ` +
        `5042002 (--network arcTestnet) albo 5042 (--network arcMainnet).`
    );
  }
  console.log(`🚀 Deploy ArcPostContract na ${target.name} (chainId ${connectedChainId})`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('💰 Balans:', ethers.formatEther(balance), 'USDC (jednostka natywna, 18 miejsc)');
  if (balance < ethers.parseEther('0.05')) {
    throw new Error(
      connectedChainId === 5042002
        ? 'Za malo USDC na gaz. Zasil deployera z https://faucet.circle.com (Arc Testnet).'
        : 'Za malo USDC na gaz na Arc mainnet. Przeslij USDC na ten adres (gaz placi sie natywnym USDC).'
    );
  }

  const Factory = await ethers.getContractFactory('ArcPostContract');
  // Arc odrzuca transakcje z maxFeePerGas < 20 gwei (docs.arc.io, gas-and-fees).
  const contract: any = await Factory.deploy({ maxFeePerGas: ethers.parseUnits('25', 'gwei'), maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei') });
  console.log('⏳ Czekanie na potwierdzenie...');
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log('✅ ArcPostContract wdrozony:', contractAddress);
  console.log('🔗', `${target.explorer}/address/${contractAddress}`);

  const totalPosts = await contract.getTotalPosts();
  const owner = await contract.owner();
  console.log('📊 Postow:', totalPosts.toString(), '| 👑 Owner:', owner);

  console.log('\n' + '='.repeat(72));
  console.log('📝 NASTEPNY KROK - wklej do .env.local ORAZ do env na Vercelu:');
  console.log(`${target.envVar}=${contractAddress}`);
  console.log('='.repeat(72));

  const fs = require('fs');
  const path = require('path');
  const deploymentInfo = {
    contractAddress,
    deployerAddress: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    network: connectedChainId === 5042 ? 'arcMainnet' : 'arcTestnet',
    chainId: connectedChainId,
    explorerUrl: `${target.explorer}/address/${contractAddress}`,
    envLine: `${target.envVar}=${contractAddress}`,
  };
  const outPath = path.join(__dirname, '..', target.infoFile);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('💾 Zapisano', outPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deploy nie powiodl sie:', error);
    process.exit(1);
  });
