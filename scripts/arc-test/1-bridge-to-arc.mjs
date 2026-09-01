// Krok 1: burn USDC na Base -> mint na Arc (CCTP v2, fast transfer).
// Uruchom: node scripts/arc-test/1-bridge-to-arc.mjs [kwotaUSDC]
import { base } from 'viem/chains';
import {
  clients, erc20Abi, tokenMessengerAbi, fastMaxFee, addressToBytes32, ZERO_BYTES32,
  TOKEN_MESSENGER_V2, USDC_BASE, DOMAIN_BASE, DOMAIN_ARC, fmtUsdc,
} from './lib.mjs';

const amount = BigInt(Math.round(Number(process.argv[2] ?? '5') * 1e6)); // domyslnie 5 USDC
const { account, pub, wallet } = clients(base);

console.log(`Portfel: ${account.address}`);
const bal = await pub.readContract({ address: USDC_BASE, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
console.log(`USDC na Base: ${fmtUsdc(bal)}, bridguje: ${fmtUsdc(amount)}`);
if (bal < amount) { console.error('Za malo USDC na Base.'); process.exit(1); }

const maxFee = await fastMaxFee(DOMAIN_BASE, DOMAIN_ARC, amount);
console.log(`maxFee (fast transfer): ${fmtUsdc(maxFee)}`);

const allowance = await pub.readContract({ address: USDC_BASE, abi: erc20Abi, functionName: 'allowance', args: [account.address, TOKEN_MESSENGER_V2] });
if (allowance < amount) {
  const h = await wallet.writeContract({ address: USDC_BASE, abi: erc20Abi, functionName: 'approve', args: [TOKEN_MESSENGER_V2, amount] });
  console.log(`approve tx: ${h}`);
  await pub.waitForTransactionReceipt({ hash: h });
}

const hash = await wallet.writeContract({
  address: TOKEN_MESSENGER_V2,
  abi: tokenMessengerAbi,
  functionName: 'depositForBurn',
  args: [amount, DOMAIN_ARC, addressToBytes32(account.address), USDC_BASE, ZERO_BYTES32, maxFee, 1000],
});
console.log(`depositForBurn tx (Base): ${hash}`);
const rcpt = await pub.waitForTransactionReceipt({ hash });
console.log(`Status: ${rcpt.status}. Teraz: node scripts/arc-test/2-claim-on-arc.mjs ${hash}`);
