// Krok 2: odbior (mint) USDC na Arc — receiveMessage(message, attestation).
// Uruchom: node scripts/arc-test/2-claim-on-arc.mjs <txHashZBase>
// UWAGA: gaz na Arc placi sie natywnym USDC. Jesli portfel ma 0 na Arc,
// pierwszy claim musi oplacic ktos inny (destinationCaller=0, wiec kazdy moze
// zawolac receiveMessage) albo ktos musi podeslac Ci grosze na gaz.
import {
  clients, messageTransmitterAbi, waitForAttestation, arc,
  MESSAGE_TRANSMITTER_V2, DOMAIN_BASE, erc20Abi, USDC_ARC, fmtUsdc,
} from './lib.mjs';

const txHash = process.argv[2];
if (!txHash) { console.error('Podaj hash transakcji depositForBurn z Base.'); process.exit(1); }

const { account, pub, wallet } = clients(arc);
const native = await pub.getBalance({ address: account.address });
console.log(`Portfel: ${account.address}, natywny balans na Arc: ${native} wei`);
if (native === 0n) console.warn('UWAGA: 0 gazu na Arc — ta transakcja się nie uda, patrz komentarz na gorze pliku.');

const msg = await waitForAttestation(DOMAIN_BASE, txHash);
const hash = await wallet.writeContract({
  address: MESSAGE_TRANSMITTER_V2,
  abi: messageTransmitterAbi,
  functionName: 'receiveMessage',
  args: [msg.message, msg.attestation],
});
console.log(`receiveMessage tx (Arc): ${hash}`);
const rcpt = await pub.waitForTransactionReceipt({ hash });
const bal = await pub.readContract({ address: USDC_ARC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
console.log(`Status: ${rcpt.status}. USDC na Arc: ${fmtUsdc(bal)}`);
console.log(`Explorer: https://arc-scan.org/tx/${hash}`);
