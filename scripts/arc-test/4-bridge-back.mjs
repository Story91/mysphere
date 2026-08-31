// Krok 4: burn USDC na Arc -> powrot na Base (test drogi WYJSCIA — najwazniejszy).
// Uruchom: node scripts/arc-test/4-bridge-back.mjs [kwotaUSDC]
import {
  clients, erc20Abi, tokenMessengerAbi, fastMaxFee, addressToBytes32, ZERO_BYTES32, arc,
  TOKEN_MESSENGER_V2, USDC_ARC, DOMAIN_BASE, DOMAIN_ARC, fmtUsdc,
} from './lib.mjs';

const amount = BigInt(Math.round(Number(process.argv[2] ?? '3') * 1e6)); // domyslnie 3 USDC
const { account, pub, wallet } = clients(arc);

console.log(`Portfel: ${account.address}`);
const bal = await pub.readContract({ address: USDC_ARC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
console.log(`USDC na Arc: ${fmtUsdc(bal)}, wracam z: ${fmtUsdc(amount)}`);
if (bal < amount) { console.error('Za malo USDC na Arc.'); process.exit(1); }

const maxFee = await fastMaxFee(DOMAIN_ARC, DOMAIN_BASE, amount);
console.log(`maxFee: ${fmtUsdc(maxFee)}`);

const allowance = await pub.readContract({ address: USDC_ARC, abi: erc20Abi, functionName: 'allowance', args: [account.address, TOKEN_MESSENGER_V2] });
if (allowance < amount) {
  const h = await wallet.writeContract({ address: USDC_ARC, abi: erc20Abi, functionName: 'approve', args: [TOKEN_MESSENGER_V2, amount] });
  console.log(`approve tx: ${h}`);
  await pub.waitForTransactionReceipt({ hash: h });
}

const hash = await wallet.writeContract({
  address: TOKEN_MESSENGER_V2,
  abi: tokenMessengerAbi,
  functionName: 'depositForBurn',
  args: [amount, DOMAIN_BASE, addressToBytes32(account.address), USDC_ARC, ZERO_BYTES32, maxFee, 1000],
});
console.log(`depositForBurn tx (Arc): ${hash}`);
const rcpt = await pub.waitForTransactionReceipt({ hash });
console.log(`Status: ${rcpt.status}. Teraz: node scripts/arc-test/5-claim-on-base.mjs ${hash}`);
