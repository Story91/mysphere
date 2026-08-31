/**
 * Stan portfeli przed cyklem escrow. NIC NIE WYSYLA - same odczyty.
 *
 *   npx hardhat run scripts/askEscrowBalances.js --network base-sepolia
 *   npx hardhat run scripts/askEscrowBalances.js --network base
 *
 * Istnieje po to, zeby przed wydaniem gazu bylo widac trzy liczby naraz:
 * ETH na gaz, USDC na budzet i ile USDC kontrakt juz ma pozwolenia wydac.
 * Bez tego kazda proba cyklu konczyla sie zgadywaniem, ktorego z trzech
 * skladnikow brakuje.
 */
const hre = require('hardhat');

const TOKEN_BY_CHAIN = {
  84532: { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', name: 'USDC (Base Sepolia)' },
  8453: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USDC (Base mainnet)' },
};

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const token = TOKEN_BY_CHAIN[chainId];
  if (!token) throw new Error(`Brak tokena dla chainId ${chainId}.`);

  const signers = await ethers.getSigners();
  const erc20 = new ethers.Contract(token.address, ERC20_ABI, ethers.provider);
  const [symbol, decimals] = await Promise.all([erc20.symbol(), erc20.decimals()]);

  // Adres escrow tylko do policzenia pozwolenia - brak pliku nie jest bledem,
  // bo ten skrypt ma dzialac takze PRZED pierwszym wdrozeniem.
  let escrow = null;
  try {
    escrow = require(`../deployments/askEscrow.${chainId}.json`).address;
  } catch {
    /* jeszcze nie wdrozone */
  }

  console.log(`Siec:   ${net.name} (chainId ${chainId})`);
  console.log(`Token:  ${token.address}  ${symbol}, ${decimals} miejsc`);
  console.log(`Escrow: ${escrow || '(brak wdrozenia)'}\n`);

  for (const signer of signers) {
    const [eth, bal, allowance] = await Promise.all([
      ethers.provider.getBalance(signer.address),
      erc20.balanceOf(signer.address),
      escrow ? erc20.allowance(signer.address, escrow) : Promise.resolve(0n),
    ]);
    console.log(`${signer.address}`);
    console.log(`  ETH:       ${ethers.formatEther(eth)}`);
    console.log(`  ${symbol}:      ${ethers.formatUnits(bal, decimals)}`);
    console.log(`  allowance: ${ethers.formatUnits(allowance, decimals)}\n`);
  }

  if (escrow) {
    const held = await erc20.balanceOf(escrow);
    console.log(`W kontrakcie lezy: ${ethers.formatUnits(held, decimals)} ${symbol}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
