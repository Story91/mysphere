/**
 * SONDA OFERTY x402 DLA ASKOW. NIE WYDAJE ANI GROSZA.
 *
 *   node scripts/x402CheckAccepts.mjs http://localhost:4021/api/asks
 *
 * === PO CO ===
 * scripts/x402PayAsk.mjs dowodzi, ze JEDNA sciezka rozlicza sie naprawde - ale
 * kosztuje prawdziwe pieniadze i chodzi tylko po sieci, na ktorej ma saldo.
 * Odkad odpowiedz 402 oglasza KILKA sieci naraz, potrzebny jest sprawdzian,
 * ktory bierze wymagania Z NASZEGO SERWERA i pokazuje, ze KAZDA pozycja jest
 * poprawna - zanim ktokolwiek cokolwiek podpisze.
 *
 * === CO SPRAWDZA, POZYCJA PO POZYCJI ===
 *   1. Czy GET i 402 mowia to samo. GET oglasza liste sieci, 402 niesie liste
 *      wymagan. Rozjazd miedzy nimi to endpoint, ktory klamie o sobie - a to
 *      wlasnie ten rodzaj bledu, przez ktory agent podpisuje zle dane.
 *   2. Czy `extra.name` i `extra.version` w ogole sa. Klient @x402/evm rzuca
 *      wyjatkiem PRZED podpisem, gdy ich brak - platnosc nie dociera nawet do
 *      facilitatora.
 *   3. Czy ta domena EIP-712 jest PRAWDZIWA. Skrypt hashuje ja i porownuje
 *      z DOMAIN_SEPARATOR() odczytanym z kontraktu tokena. Zla wersja psuje
 *      kazdy podpis PO CICHU - blad wychodzi dopiero przy odzyskiwaniu adresu
 *      i wyglada jak zly podpis, a nie jak zla konfiguracja.
 *   4. Czy kwota zgadza sie z cena z cennika po przeliczeniu przez `decimals()`
 *      odczytane z lancucha. Odruchowe 18 miejsc zamiast 6 mnozy cene przez
 *      bilion i nikt tego nie widzi w JSON-ie.
 *   5. Czy odbiorca jest ten sam we wszystkich pozycjach.
 *
 * === CZEGO NIE SPRAWDZA ===
 * NIE WOLA /verify ANI /settle i NIE WYSYLA PLATNOSCI. To znaczy, ze
 * przejscie tej sondy NIE dowodzi, ze facilitator danej sieci rozliczy
 * platnosc - dowodzi tylko, ze mamy co podpisac i ze to, co oglaszamy, jest
 * prawda. Realne rozliczenie robi scripts/x402PayAsk.mjs i to decyzja
 * wlasciciela, nie skryptu.
 *
 * Brak RPC dla ktoregos lancucha nie jest bledem - sprawdzenia lancuchowe sa
 * wtedy NIEZMIERZONE i tak sa raportowane. Niezmierzone to nie to samo, co zle.
 */
import { config } from 'dotenv';
import { Contract, JsonRpcProvider, TypedDataEncoder, getAddress } from 'ethers';

config({ path: '.env.local' });

const url = process.argv[2] || 'http://localhost:4021/api/asks';

/** Publiczne RPC per lancuch. Nadpisywalne z env, bo publiczne bywaja zajete. */
const RPC_BY_CHAIN_ID = {
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  84532: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  4663: process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
};

const TOKEN_ABI = [
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const problems = [];
const fail = (message) => problems.push(message);

/* ---------------- 1. GET: co endpoint MOWI o sobie ---------------- */

const info = await fetch(url, { headers: { Accept: 'application/json' } });
if (!info.ok) {
  console.error(`GET ${url} -> HTTP ${info.status}`);
  process.exit(1);
}
const catalogue = await info.json();
const payment = catalogue.payment ?? {};

console.log('=== GET /api/asks, blok `payment` ===');
console.log(`  price:    ${payment.price}`);
console.log(`  enforced: ${payment.enforced}`);
console.log(`  network:  ${payment.network} (${payment.currency})   <- siec glowna, zgodnosc wsteczna`);
console.log(`  networks: ${JSON.stringify(payment.networks)}`);

if (payment.enforced !== true) {
  console.log('\nBramka NIE JEST uzbrojona (brak X402_PAY_TO_ADDRESS) - 402 nie powstanie.');
  process.exit(1);
}
if (!Array.isArray(payment.networks) || payment.networks.length === 0) {
  fail('GET nie oglasza tablicy `payment.networks`');
}

/* ---------------- 2. POST bez platnosci: czego endpoint ZADA ---------------- */

const probe = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: 'Which networks does this deployment accept?',
    budget: 1,
    seats: 1,
    durationMs: 86400000,
  }),
});

if (probe.status !== 402) {
  console.error(`\nOczekiwano 402, przyszlo ${probe.status}: ${(await probe.text()).slice(0, 500)}`);
  process.exit(1);
}

const header = probe.headers.get('payment-required');
if (!header) {
  console.error('\n402 bez naglowka `payment-required` - agent nie ma skad wziac wymagan.');
  process.exit(1);
}
const required = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
const accepts = required.accepts ?? [];

console.log(`\n=== 402: ${accepts.length} pozycji w \`accepts\` (x402Version ${required.x402Version}) ===`);

if (accepts.length === 0) fail('402 z pusta lista `accepts` - zadanie zaplaty bez podania czym');

/* ---------------- 3. Czy GET i 402 mowia to samo ---------------- */

const announced = new Set((payment.networks ?? []).map((entry) => entry.network));
const demanded = new Set(accepts.map((entry) => entry.network));
for (const network of announced) {
  if (!demanded.has(network)) fail(`GET oglasza ${network}, ale 402 tej sieci nie zada`);
}
for (const network of demanded) {
  if (!announced.has(network)) fail(`402 zada ${network}, ale GET tej sieci nie oglasza`);
}

/* ---------------- 4. Kazda pozycja z osobna ---------------- */

const expectedPayTo = process.env.X402_PAY_TO_ADDRESS?.trim();
const priceValue = Number(String(payment.price ?? '').replace('$', ''));
const seenNetworks = new Set();

for (const [index, entry] of accepts.entries()) {
  const label = `accepts[${index}] ${entry.network}`;
  console.log(`\n--- ${label} ---`);
  console.log(`  scheme:  ${entry.scheme}`);
  console.log(`  asset:   ${entry.asset}`);
  console.log(`  amount:  ${entry.amount}`);
  console.log(`  payTo:   ${entry.payTo}`);
  console.log(`  extra:   ${JSON.stringify(entry.extra)}`);
  console.log(`  timeout: ${entry.maxTimeoutSeconds}s`);

  if (entry.scheme !== 'exact') fail(`${label}: schemat "${entry.scheme}", a rejestrujemy tylko "exact"`);
  if (seenNetworks.has(entry.network)) fail(`${label}: ta siec wystepuje dwa razy`);
  seenNetworks.add(entry.network);

  if (!/^0x[a-fA-F0-9]{40}$/.test(entry.asset ?? '')) {
    fail(`${label}: \`asset\` nie jest adresem EVM: ${entry.asset}`);
    continue;
  }
  if (!/^[1-9]\d*$/.test(String(entry.amount ?? ''))) {
    fail(`${label}: \`amount\` nie jest dodatnia liczba calkowita: ${entry.amount}`);
  }
  if (expectedPayTo && entry.payTo?.toLowerCase() !== expectedPayTo.toLowerCase()) {
    fail(`${label}: payTo ${entry.payTo} != X402_PAY_TO_ADDRESS ${expectedPayTo}`);
  }
  if (!entry.extra?.name || !entry.extra?.version) {
    // To jest twardy warunek klienta, nie kosmetyka.
    fail(`${label}: brak domeny EIP-712 w \`extra\` - klient odmowilby PRZED podpisem`);
    continue;
  }

  const chainId = Number(entry.network.split(':')[1]);
  const rpc = RPC_BY_CHAIN_ID[chainId];
  if (!rpc) {
    console.log('  lancuch: NIEZMIERZONE - nie znam RPC dla tego lancucha');
    continue;
  }

  try {
    const token = new Contract(entry.asset, TOKEN_ABI, new JsonRpcProvider(rpc));
    const [separator, decimals, symbol] = await Promise.all([
      token.DOMAIN_SEPARATOR(),
      token.decimals(),
      token.symbol(),
    ]);

    const local = TypedDataEncoder.hashDomain({
      name: entry.extra.name,
      version: entry.extra.version,
      chainId,
      verifyingContract: getAddress(entry.asset),
    });
    const domainOk = separator.toLowerCase() === local.toLowerCase();
    console.log(`  token:   ${symbol}, ${decimals} miejsc`);
    console.log(`  domena:  ${domainOk ? 'ZGADZA SIE z DOMAIN_SEPARATOR()' : 'NIE ZGADZA SIE'}`);
    if (!domainOk) {
      fail(
        `${label}: domena EIP-712 {name:"${entry.extra.name}", version:"${entry.extra.version}"} ` +
          `daje ${local}, a kontrakt ma ${separator} - kazdy podpis bylby odrzucony`
      );
    }

    if (Number.isFinite(priceValue) && priceValue > 0) {
      const expected = Math.round(priceValue * 10 ** Number(decimals)).toString();
      const amountOk = String(entry.amount) === expected;
      console.log(`  kwota:   ${amountOk ? 'ZGADZA SIE' : 'NIE ZGADZA SIE'} z cena ${payment.price} (oczekiwane ${expected})`);
      if (!amountOk) {
        fail(`${label}: amount ${entry.amount}, a cena ${payment.price} przy ${decimals} miejscach daje ${expected}`);
      }
    }
  } catch (error) {
    console.log(`  lancuch: NIEZMIERZONE - ${error.shortMessage || error.message}`);
  }
}

/* ---------------- 5. Wynik ---------------- */

console.log('\n=====================================');
if (problems.length === 0) {
  console.log(`OFERTA SPOJNA: ${accepts.length} pozycji, kazda ma czym i za ile zaplacic.`);
  console.log('To NIE jest dowod, ze facilitatory rozlicza platnosc - sonda nie wolala');
  console.log('ani /verify, ani /settle. Realne rozliczenie: scripts/x402PayAsk.mjs.');
  process.exit(0);
}
console.log(`ZNALEZIONO ${problems.length} PROBLEM(OW):`);
for (const problem of problems) console.log(`  - ${problem}`);
process.exit(1);
