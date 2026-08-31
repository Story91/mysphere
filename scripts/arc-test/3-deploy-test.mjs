// Krok 3: deploy trywialnego kontraktu na Arc — test, czy deploy jest permissionless.
// Bytecode deployuje 10-bajtowy runtime, ktory na kazdy call zwraca 42 (0x2a).
// Uruchom: node scripts/arc-test/3-deploy-test.mjs
import { arc, clients } from './lib.mjs';

const INIT_CODE = '0x69602a60005260206000f3600052600a6016f3';

const { account, pub, wallet } = clients(arc);
console.log(`Portfel: ${account.address}`);
const native = await pub.getBalance({ address: account.address });
if (native === 0n) { console.error('Brak gazu (natywnego USDC) na Arc.'); process.exit(1); }

const hash = await wallet.sendTransaction({ data: INIT_CODE });
console.log(`deploy tx: ${hash}`);
const rcpt = await pub.waitForTransactionReceipt({ hash });
console.log(`Status: ${rcpt.status}, kontrakt: ${rcpt.contractAddress}`);

const ret = await pub.call({ to: rcpt.contractAddress, data: '0x' });
const ok = ret.data?.endsWith('2a');
console.log(`Weryfikacja (powinno zwrocic ...2a): ${ret.data} -> ${ok ? 'OK, deploy permissionless dziala' : 'COS NIE TAK'}`);
console.log(`Explorer: https://arc-scan.org/address/${rcpt.contractAddress}`);
