// Krok 5: odbior USDC z powrotem na Base. Zamyka round-trip.
// Uruchom: node scripts/arc-test/5-claim-on-base.mjs <txHashZArc>
import { base } from 'viem/chains';
import {
  clients, messageTransmitterAbi, waitForAttestation,
  MESSAGE_TRANSMITTER_V2, DOMAIN_ARC, erc20Abi, USDC_BASE, fmtUsdc,
} from './lib.mjs';

const txHash = process.argv[2];
if (!txHash) { console.error('Podaj hash transakcji depositForBurn z Arc.'); process.exit(1); }

const { account, pub, wallet } = clients(base);
const msg = await waitForAttestation(DOMAIN_ARC, txHash);
const hash = await wallet.writeContract({
  address: MESSAGE_TRANSMITTER_V2,
  abi: messageTransmitterAbi,
  functionName: 'receiveMessage',
  args: [msg.message, msg.attestation],
});
console.log(`receiveMessage tx (Base): ${hash}`);
const rcpt = await pub.waitForTransactionReceipt({ hash });
const bal = await pub.readContract({ address: USDC_BASE, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
console.log(`Status: ${rcpt.status}. USDC na Base: ${fmtUsdc(bal)}`);
console.log('ROUND-TRIP ZAKONCZONY — droga wyjscia z Arc potwierdzona.');
