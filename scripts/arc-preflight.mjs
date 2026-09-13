// Read-only deployment inspection. Never loads a private key or sends transactions.
import { readFile } from 'node:fs/promises';
import { createPublicClient, http, isAddress, parseAbi } from 'viem';
let stage = 'manifest validation';

async function main() {
  const manifest = JSON.parse(await readFile(process.argv[2] || 'deployments/derivativeMarket.5042002.json', 'utf8'));
  if (!Number.isSafeInteger(manifest.chainId) || manifest.chainId <= 0) throw new Error('Invalid manifest chainId');
  const testnet = manifest.chainId === 5042002;
  const rpc = process.env.ARC_PREFLIGHT_RPC_URL || (testnet ? 'https://rpc.testnet.arc.io' : null);
  if (!rpc) throw new Error('Set ARC_PREFLIGHT_RPC_URL to a verified provider for this network. No mainnet RPC is assumed.');
  for (const key of ['usdc', 'oracle', 'factory', 'insuranceFund', 'feeDistributor', 'governance']) {
    if (!isAddress(manifest[key] || '') || /^0x0{40}$/i.test(manifest[key])) throw new Error(`Invalid manifest address: ${key}`);
  }
  const client = createPublicClient({ transport: http(rpc, { timeout: 15_000, retryCount: 1 }) });
  stage = 'RPC chain ID';
  const chainId = await client.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Wrong network: expected ${manifest.chainId}, received ${chainId}`);
  stage = 'RPC head freshness';
  const block = await client.getBlock();
  const age = Math.floor(Date.now() / 1000) - Number(block.timestamp);
  if (age > 120 || age < -30) throw new Error('RPC head is stale or has an implausible timestamp');
  const results = [];
  const check = (name, passed, detail) => results.push({ name, passed, detail });
  for (const key of ['oracle', 'factory', 'insuranceFund', 'feeDistributor']) {
    stage = `${key} bytecode`;
    const code = await client.getCode({ address: manifest[key], blockNumber: block.number });
    check(`${key}: deployed code`, Boolean(code && code !== '0x'), manifest[key]);
  }
  async function read(address, signature, functionName) {
    stage = `contract read: ${functionName}`;
    return client.readContract({ address, abi: parseAbi([signature]), functionName, blockNumber: block.number });
  }
  const decimals = await read(manifest.usdc, 'function decimals() view returns (uint8)', 'decimals');
  check('USDC ERC-20 decimals', decimals === 6, String(decimals));
  for (const [getter, key] of [['ORACLE', 'oracle'], ['USDC', 'usdc'], ['INSURANCE', 'insuranceFund'], ['FEES', 'feeDistributor'], ['GOVERNANCE', 'governance']]) {
    const actual = await read(manifest.factory, `function ${getter}() view returns (address)`, getter);
    check(`factory.${getter}`, actual.toLowerCase() === manifest[key].toLowerCase(), actual);
  }
  const balance = await read(manifest.insuranceFund, 'function balance() view returns (uint256)', 'balance');
  const required = await read(manifest.insuranceFund, 'function requiredBalance() view returns (uint256)', 'requiredBalance');
  const paused = await read(manifest.insuranceFund, 'function newPositionsPaused() view returns (bool)', 'newPositionsPaused');
  check('Insurance funded and above current floor', balance > 0n && balance >= required && !paused, `${balance} / ${required} USDC base units; paused=${paused}`);
  const govCode = await client.getCode({ address: manifest.governance, blockNumber: block.number });
  check('Governance is a contract (manual multisig/timelock review still required)', Boolean(govCode && govCode !== '0x'), manifest.governance);
  console.log(JSON.stringify({ chainId, block: block.number.toString(), testnet, checks: results,
    limitations: ['Not a security audit or approval to launch.', 'Does not verify oracle confidence, signer governance, keeper uptime, market liquidity, or production capital adequacy.', 'Contract code at governance does not prove a multisig or timelock.'] }, null, 2));
  process.exitCode = results.every(r => r.passed) ? 0 : 1;
}

main().catch(() => {
  // Provider errors can contain credential-bearing URLs; never print those.
  console.error(`Preflight failed at ${stage}. Check manifest addresses, chainId, RPC connectivity and contract interfaces. No transaction was sent.`);
  process.exitCode = 1;
});
