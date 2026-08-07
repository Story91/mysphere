/**
 * PRAWDZIWA PLATNOSC x402 ZA ZALOZENIE ASKA. Wydaje pieniadze.
 *
 *   node scripts/x402PayAsk.mjs http://localhost:4021/api/asks/
 *
 * === PO CO ===
 * Wszystko poza ostatnim krokiem bylo juz potwierdzone: facilitator deklaruje
 * eip155:4663, waliduje siec naprawde, przyjmuje nasze USDG i dochodzi do
 * odtwarzania podpisu. Nie bylo potwierdzone SETTLE - czyli to, czy pieniadze
 * faktycznie sie ruszaja. Tego nie da sie sprawdzic bez prawdziwego podpisu
 * i prawdziwego USDG, wiec ten skrypt to robi.
 *
 * === CO ROBI, PO KOLEI ===
 *   1. Wola nasza wlasna trase bez platnosci i odbiera 402 razem z naglowkiem
 *      `payment-required` (base64 z JSON-em wymagan). To jest wazne: bierzemy
 *      wymagania Z NASZEGO SERWERA, a nie wpisane recznie - dzieki temu test
 *      sprawdza takze NASZA konfiguracje, nie tylko facilitatora.
 *   2. Podpisuje autoryzacje EIP-3009 (TransferWithAuthorization) kluczem
 *      z ADMIN_PRIVATE_KEY, dokladnie tak jak robi to @x402/evm.
 *   3. Ponawia zadanie z naglowkiem PAYMENT-SIGNATURE.
 *   4. Wypisuje wynik i hash rozliczenia z naglowka X-PAYMENT-RESPONSE.
 *
 * === CZEGO NIE ROBI ===
 * Nie dotyka lancucha samodzielnie. Gaz placi facilitator - na tym polega
 * EIP-3009: placacy tylko podpisuje, transakcje wysyla ktos inny.
 */
import { config } from 'dotenv';
import { Wallet, JsonRpcProvider, Contract, getAddress, hexlify, randomBytes } from 'ethers';

config({ path: '.env.local' });

const url = process.argv[2] || 'http://localhost:4021/api/asks/';
const RPC = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

const key = process.env.ADMIN_PRIVATE_KEY?.trim();
if (!key) throw new Error('Brak ADMIN_PRIVATE_KEY w .env.local');

const provider = new JsonRpcProvider(RPC);
const wallet = new Wallet(key.startsWith('0x') ? key : `0x${key}`, provider);

const body = JSON.stringify({
  question: 'Does the USDG payment path on Robinhood Chain actually settle?',
  budget: 1,
  seats: 1,
  durationMs: 86400000,
});

// ---- 1. NASZ SERWER MOWI, CZEGO CHCE ----
const first = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
});

if (first.status !== 402) {
  console.log(`Oczekiwano 402, przyszlo ${first.status}:`, await first.text());
  process.exit(1);
}

const header = first.headers.get('payment-required');
if (!header) throw new Error('402 bez naglowka payment-required');

const required = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
const req = required.accepts[0];

console.log('WYMAGANIA Z NASZEGO SERWERA:');
console.log(`  siec:    ${req.network}`);
console.log(`  token:   ${req.asset}`);
console.log(`  kwota:   ${req.amount} (najmniejsza jednostka)`);
console.log(`  payTo:   ${req.payTo}`);
console.log(`  extra:   ${JSON.stringify(req.extra)}`);
console.log(`  placi:   ${wallet.address}\n`);

if (!req.extra?.name || !req.extra?.version) {
  throw new Error('Brak domeny EIP-712 w `extra` - klient x402 odmowilby podpisu.');
}

// ---- SALDO PRZED ----
const USDG_ABI = ['function balanceOf(address) view returns (uint256)'];
const token = new Contract(req.asset, USDG_ABI, provider);
const before = {
  from: await token.balanceOf(wallet.address),
  to: await token.balanceOf(req.payTo),
};
console.log(`PRZED: placacy ${before.from}, odbiorca ${before.to}`);

// ---- 2. PODPIS EIP-3009 ----
// Ten sam ksztalt co @x402/evm/exact/client/eip3009.ts - nie wymyslamy wlasnego.
const now = Math.floor(Date.now() / 1000);
const authorization = {
  from: wallet.address,
  to: getAddress(req.payTo),
  value: req.amount,
  validAfter: '0',
  validBefore: (now + (req.maxTimeoutSeconds ?? 300)).toString(),
  nonce: hexlify(randomBytes(32)),
};

const chainId = Number(req.network.split(':')[1]);
const signature = await wallet.signTypedData(
  {
    name: req.extra.name,
    version: req.extra.version,
    chainId,
    verifyingContract: getAddress(req.asset),
  },
  {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  },
  {
    from: getAddress(authorization.from),
    to: getAddress(authorization.to),
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce,
  }
);

// `accepted` = TO WYMAGANIE, ktore wybralismy, odeslane w calosci.
// Bez niego serwer odpowiada 402 z komunikatem "Cannot destructure property
// 'extra' of 'accepted' as it is undefined" - x402 v2 nie zaklada, ze placacy
// wybral pierwsza pozycje z `accepts`, wiec musi dostac ja wprost.
const paymentPayload = {
  x402Version: required.x402Version ?? 2,
  scheme: req.scheme,
  network: req.network,
  accepted: req,
  payload: { authorization, signature },
};

const encoded = Buffer.from(JSON.stringify(paymentPayload), 'utf8').toString('base64');

// ---- 3. PONOWIENIE Z PLATNOSCIA ----
console.log('\nWysylam podpisana platnosc...');
const paid = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'PAYMENT-SIGNATURE': encoded,
  },
  body,
});

const text = await paid.text();
console.log(`\nHTTP ${paid.status}`);
console.log(text.slice(0, 900));

// Powtorzony 402 niesie POWOD odmowy w tym samym naglowku. Bez jego odczytania
// widac tylko "nie przeszlo", co nie mowi nic.
const why = paid.headers.get('payment-required');
if (why) {
  try {
    console.log('\nPOWOD ODMOWY:', JSON.stringify(JSON.parse(Buffer.from(why, 'base64').toString('utf8')), null, 2).slice(0, 1200));
  } catch {
    console.log('\npayment-required (surowy):', why.slice(0, 400));
  }
}

const settleHeader = paid.headers.get('x-payment-response');
if (settleHeader) {
  try {
    console.log('\nROZLICZENIE:', JSON.parse(Buffer.from(settleHeader, 'base64').toString('utf8')));
  } catch {
    console.log('\nX-PAYMENT-RESPONSE (surowy):', settleHeader);
  }
}

// ---- 4. SALDO PO ----
// Chwila na propagacje - transakcje wysyla facilitator, nie my.
await new Promise((r) => setTimeout(r, 6000));
const after = {
  from: await token.balanceOf(wallet.address),
  to: await token.balanceOf(req.payTo),
};
console.log(`\nPO:    placacy ${after.from}, odbiorca ${after.to}`);
console.log(
  before.from === after.from
    ? 'SALDO SIE NIE ZMIENILO - platnosc NIE zostala rozliczona.'
    : `SALDO SIE ZMIENILO o ${before.from - after.from} jednostek - ROZLICZONE.`
);
