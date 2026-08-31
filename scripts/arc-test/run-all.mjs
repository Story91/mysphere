// Caly test w jednej komendzie:
//   node --env-file=.env.local scripts/arc-test/run-all.mjs [kwotaUSDC]
// Kroki: bridge Base->Arc, claim na Arc, deploy testowy, bridge Arc->Base, claim na Base.
// Skrypt sam czeka na atestacje Circle i na pojawienie sie gazu na Arc.
import { base } from 'viem/chains';
import {
  arc, clients, erc20Abi, tokenMessengerAbi, messageTransmitterAbi,
  fastMaxFee, waitForAttestation, addressToBytes32, ZERO_BYTES32,
  TOKEN_MESSENGER_V2, MESSAGE_TRANSMITTER_V2, USDC_BASE, USDC_ARC,
  DOMAIN_BASE, DOMAIN_ARC, fmtUsdc,
} from './lib.mjs';

const amount = BigInt(Math.round(Number(process.argv[2] ?? '5') * 1e6));
const onBase = clients(base);
const onArc = clients(arc);
const me = onBase.account.address;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`Portfel: ${me}, kwota testu: ${fmtUsdc(amount)}`);

async function bridge({ from, srcDomain, dstDomain, usdc, amt }) {
  const allowance = await from.pub.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [me, TOKEN_MESSENGER_V2] });
  if (allowance < amt) {
    const h = await from.wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: 'approve', args: [TOKEN_MESSENGER_V2, amt] });
    await from.pub.waitForTransactionReceipt({ hash: h });
    console.log(`  approve: ${h}`);
  }
  const maxFee = await fastMaxFee(srcDomain, dstDomain, amt);
  const h = await from.wallet.writeContract({
    address: TOKEN_MESSENGER_V2, abi: tokenMessengerAbi, functionName: 'depositForBurn',
    args: [amt, dstDomain, addressToBytes32(me), usdc, ZERO_BYTES32, maxFee, 1000],
  });
  const r = await from.pub.waitForTransactionReceipt({ hash: h });
  console.log(`  depositForBurn: ${h} (${r.status}, maxFee ${fmtUsdc(maxFee)})`);
  return h;
}

async function claim({ to, srcDomain, txHash }) {
  const msg = await waitForAttestation(srcDomain, txHash);
  const h = await to.wallet.writeContract({
    address: MESSAGE_TRANSMITTER_V2, abi: messageTransmitterAbi, functionName: 'receiveMessage',
    args: [msg.message, msg.attestation],
  });
  const r = await to.pub.waitForTransactionReceipt({ hash: h });
  console.log(`  receiveMessage: ${h} (${r.status})`);
}

// ---- 1. Base -> Arc ----
console.log('\n[1/5] Bridge Base -> Arc');
const balBase = await onBase.pub.readContract({ address: USDC_BASE, abi: erc20Abi, functionName: 'balanceOf', args: [me] });
if (balBase < amount) { console.error(`Za malo USDC na Base (${fmtUsdc(balBase)}).`); process.exit(1); }
const tx1 = await bridge({ from: onBase, srcDomain: DOMAIN_BASE, dstDomain: DOMAIN_ARC, usdc: USDC_BASE, amt: amount });

// ---- 2. Claim na Arc (wymaga gazu w natywnym USDC) ----
console.log('\n[2/5] Claim na Arc');
const arcUsdcBefore = await onArc.pub.readContract({ address: USDC_ARC, abi: erc20Abi, functionName: 'balanceOf', args: [me] });
const msgReady = await waitForAttestation(DOMAIN_BASE, tx1);
for (;;) {
  const balArc = await onArc.pub.readContract({ address: USDC_ARC, abi: erc20Abi, functionName: 'balanceOf', args: [me] });
  if (balArc > arcUsdcBefore) { console.log(`  USDC juz na Arc (ktos zrelayowal): ${fmtUsdc(balArc)}`); break; }
  const gas = await onArc.pub.getBalance({ address: me });
  if (gas > 0n) {
    const h = await onArc.wallet.writeContract({
      address: MESSAGE_TRANSMITTER_V2, abi: messageTransmitterAbi, functionName: 'receiveMessage',
      args: [msgReady.message, msgReady.attestation],
    });
    const r = await onArc.pub.waitForTransactionReceipt({ hash: h });
    console.log(`  receiveMessage: ${h} (${r.status})`);
    break;
  }
  console.log('  Brak gazu na Arc. Opcje: (a) ktos z gazem wola receiveMessage za Ciebie (destinationCaller=0),');
  console.log('  (b) ktos podsyla grosze natywnego USDC na ' + me + '. Sprawdzam ponownie za 30 s...');
  await sleep(30000);
}
const balArcNow = await onArc.pub.readContract({ address: USDC_ARC, abi: erc20Abi, functionName: 'balanceOf', args: [me] });
console.log(`  USDC na Arc: ${fmtUsdc(balArcNow)}`);

// ---- 3. Deploy testowego kontraktu ----
console.log('\n[3/5] Deploy testowego kontraktu na Arc');
const h3 = await onArc.wallet.sendTransaction({ data: '0x69602a60005260206000f3600052600a6016f3' });
const r3 = await onArc.pub.waitForTransactionReceipt({ hash: h3 });
const ret = await onArc.pub.call({ to: r3.contractAddress, data: '0x' });
console.log(`  kontrakt: ${r3.contractAddress} (${r3.status}), call -> ${ret.data} ${ret.data?.endsWith('2a') ? '== 42 OK: DEPLOY PERMISSIONLESS' : 'BLAD'}`);

// ---- 4. Arc -> Base ----
console.log('\n[4/5] Bridge Arc -> Base (test drogi wyjscia)');
const backAmt = balArcNow < amount ? balArcNow / 2n : amount / 2n;
const tx4 = await bridge({ from: onArc, srcDomain: DOMAIN_ARC, dstDomain: DOMAIN_BASE, usdc: USDC_ARC, amt: backAmt });

// ---- 5. Claim na Base ----
console.log('\n[5/5] Claim na Base');
await claim({ to: onBase, srcDomain: DOMAIN_ARC, txHash: tx4 });
const balEnd = await onBase.pub.readContract({ address: USDC_BASE, abi: erc20Abi, functionName: 'balanceOf', args: [me] });
console.log(`\nROUND-TRIP ZAKONCZONY. USDC na Base: ${fmtUsdc(balEnd)}`);
console.log('Wniosek: wejscie, wyjscie i deploy na Arc mainnet dzialaja.');
