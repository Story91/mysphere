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

const key = process.env.ADMIN_PRIVATE_KEY?.trim();
if (!key) throw new Error('Brak ADMIN_PRIVATE_KEY w .env.local');

/**
 * RPC MUSI ISC ZA WYBRANA SIECIA, a nie byc wpisany na sztywno.
 *
 * Bylo tu jedno RPC Robinhooda, ustawione zanim skrypt w ogole wiedzial,
 * ktora pozycje z `accepts` wybierzemy. Przy `--network=eip155:8453` skrypt
 * pytal o saldo USDC z Base pod adresem tego kontraktu, ale NA LANCUCHU
 * ROBINHOODA - gdzie pod tym adresem nie ma kodu. Wynik: BAD_DATA
 * "could not decode result data", czyli awaria wygladajaca na blad ABI.
 */
const RPC_PER_CHAIN = {
  4663: process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  84532: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
};

/**
 * Tresc Aska z linii polecen, a nie wpisana na sztywno.
 *
 * Bylo tu jedno zdanie o USDG na Robinhoodzie - pytanie testowe, ktore mialo
 * sens dokladnie raz. Kazdy nastepny przebieg zakladal PUBLICZNEGO Aska z tym
 * samym, juz nieaktualnym pytaniem; tak powstala czesc smieci, ktore trzeba
 * bylo potem sprzatac. Parametry ratuja przed edytowaniem skryptu przy kazdym
 * uzyciu - a edytowanie skryptu, ktory wydaje pieniadze, jest samo w sobie
 * dobra okazja do pomylki.
 */
function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found === undefined ? fallback : found.slice(prefix.length);
}

const budgetArg = Number(arg('budget', '1'));
const seatsArg = Number(arg('seats', '1'));
const hoursArg = Number(arg('hours', '24'));

// Stawka za odpowiedz jest wazniejsza niz budzet i to ona bywa zaskoczeniem:
// serwer odrzuca Aski, w ktorych na odpowiedz wypada mniej niz 0.50. Lepiej
// zatrzymac sie tutaj niz na 400 po podpisaniu platnosci za wystawienie.
if (!Number.isFinite(budgetArg) || !Number.isFinite(seatsArg) || seatsArg < 1) {
  throw new Error('Bledny --budget lub --seats');
}
if (budgetArg / seatsArg < 0.5) {
  throw new Error(
    `Na odpowiedz wypada ${(budgetArg / seatsArg).toFixed(2)} - minimum to 0.50`
  );
}

const question = arg('question', 'Does the USDG payment path on Robinhood Chain actually settle?');

const body = JSON.stringify({
  question,
  budget: budgetArg,
  seats: seatsArg,
  durationMs: Math.round(hoursArg * 60 * 60 * 1000),
});

// ===========================================================================
// TEN SKRYPT ZAKLADA PRAWDZIWEGO ASKA. NA PRODUKCJI TEZ.
// ===========================================================================
// Sprawdzenie platnosci polega na wywolaniu POST /api/asks, wiec KAZDY UDANY
// PRZEBIEG ZOSTAWIA WPIS NA PUBLICZNEJ LISCIE. Serwer deweloperski czyta to
// samo .env.local co produkcja, wiec "lokalnie" NIE ZNACZY "w piaskownicy" -
// dokument i tak ladue w produkcyjnym Firestore.
//
// Trzy przebiegi zostawily trzy Aski i wlasciciel zauwazyl je pierwszy.
// Sprzatanie: scripts/cleanupTestAsks.cjs (pomija te z odpowiedziami).
//
// Dlatego kazdy przebieg musi byc SWIADOMY, a nie odruchowy:
const POTWIERDZENIE = process.argv.includes('--i-know-this-creates-an-ask');
if (!POTWIERDZENIE) {
  console.log(
    [
      'Ten skrypt ZAKLADA PRAWDZIWEGO ASKA na publicznej liscie i wydaje',
      'prawdziwe pieniadze. Serwer deweloperski pisze do TEJ SAMEJ bazy co',
      'produkcja, wiec adres localhost niczego nie izoluje.',
      '',
      'Jesli o tym wiesz, dodaj:  --i-know-this-creates-an-ask',
      'Sprzatanie po testach:     node scripts/cleanupTestAsks.cjs',
    ].join('\n')
  );
  process.exit(1);
}

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
// === WYBOR SIECI ===
// Od chwili, gdy `accepts` niesie WIELE pozycji, branie zerowej znaczy
// "testujemy zawsze te sama noge". Agent w prawdziwym swiecie wybiera ta,
// w ktorej ma pieniadze - i my musimy umiec sprawdzic kazda z osobna.
//   node scripts/x402PayAsk.mjs <url> --network=eip155:8453
const chcianaSiec = (process.argv.find((a) => a.startsWith('--network=')) || '').split('=')[1];
const req = chcianaSiec
  ? required.accepts.find((a) => a.network === chcianaSiec)
  : required.accepts[0];

if (!req) {
  console.log(`Siec ${chcianaSiec} nie jest w accepts. Dostepne:`);
  for (const a of required.accepts) console.log('   ', a.network, a.asset);
  process.exit(1);
}

console.log(`accepts ma ${required.accepts.length} pozycji, wybrana: ${req.network}
`);

const chainIdWybrany = Number(req.network.split(':')[1]);
const rpc = RPC_PER_CHAIN[chainIdWybrany];
if (!rpc) {
  console.log(`Brak RPC dla chainId ${chainIdWybrany}. Dopisz go do RPC_PER_CHAIN.`);
  process.exit(1);
}
const provider = new JsonRpcProvider(rpc);
const wallet = new Wallet(key.startsWith('0x') ? key : `0x${key}`, provider);

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
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];
const token = new Contract(req.asset, ERC20_ABI, provider);
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

const chainId = chainIdWybrany;
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
