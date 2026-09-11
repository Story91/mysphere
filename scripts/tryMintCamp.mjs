/**
 * Proba mintu IP NFT na Camp mainnet BEZ przegladarki.
 *
 * PO CO: interfejs oddawal bledy, ktore mozna bylo czytac na kilka sposobow
 * (portfel? sesja? nasz kod?). Ten skrypt wycina z rownania przegladarke,
 * portfel i cala aplikacje - zostaje samo SDK Campa i ich backend. Jesli tutaj
 * tez padnie, wiadomo na pewno, ze przyczyna lezy po stronie Campa.
 *
 * Uruchomienie:  node scripts/tryMintCamp.mjs
 * Wymaga PRIVATE_KEY (albo ADMIN_PRIVATE_KEY) w .env.local.
 *
 * UWAGA: przy powodzeniu POWSTAJE prawdziwy token na mainnecie i wydany
 * zostaje gaz. Skrypt jest diagnostyczny, nie nalezy go wolac rutynowo.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { Auth, campMainnet, LicenseType } from '@campnetwork/origin';

loadEnv({ path: '.env.local' });

const step = (n, t) => console.log(`\n[${n}] ${t}`);
const fail = (t, e) => {
  console.log(`   PADLO: ${t}`);
  console.log(`   powod: ${e?.message || e}`);
  if (e?.cause) console.log(`   przyczyna: ${String(e.cause).slice(0, 300)}`);
  process.exitCode = 1;
};

// ADMIN_PRIVATE_KEY pierwszy - to na nim jest CAMP (0xD488...). PRIVATE_KEY
// wskazuje inny portfel z zerowym saldem.
const rawKey = (process.env.ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY || '').trim();
const clientId = (process.env.NEXT_PUBLIC_CAMP_CLIENT_ID || '').trim();

if (!rawKey) { console.log('Brak PRIVATE_KEY w .env.local'); process.exit(1); }
if (!clientId) { console.log('Brak NEXT_PUBLIC_CAMP_CLIENT_ID w .env.local'); process.exit(1); }

const account = privateKeyToAccount(rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`);
console.log('Portfel:', account.address);
console.log('Siec:   ', campMainnet.name, `(${campMainnet.id})`);

step(1, 'Klient portfela (podpis lokalny, nie przez RPC)');
const walletClient = createWalletClient({
  account,
  chain: campMainnet,
  transport: http('https://rpc-mainnet.campnetwork.xyz'),
});
/**
 * Wlasny signer zamiast createNodeWalletClient.
 *
 * POWOD: createNodeWalletClient kierowal `personal_sign` DO WEZLA RPC, a wezly
 * publiczne takiej metody nie maja ("Method not found") - klucz prywatny nigdy
 * do nich nie trafia i trafic nie powinien. SDK przyjmuje dowolny obiekt
 * z getAddress/signMessage/getChainId (BaseSigner), wiec podpisujemy lokalnie
 * kluczem z pliku.
 */
const signer = {
  getAddress: async () => account.address,
  signMessage: async (message) => account.signMessage({ message }),
  getChainId: async () => campMainnet.id,
};
console.log('   ok');

step(2, 'Sesja Camp Origin (PRODUCTION)');
const auth = new Auth({
  clientId,
  redirectUri: 'https://mysphere.fun/marketplace',
  environment: 'PRODUCTION',
});

try {
  const res = await auth.connectWithSigner(signer, {
    domain: 'mysphere.fun',
    uri: 'https://mysphere.fun',
  });
  console.log('   zalogowano:', res.success, '|', res.walletAddress);
} catch (e) {
  fail('logowanie do Camp Origin', e);
  process.exit(1);
}

step(3, 'Mint pliku');
const origin = auth.origin;
if (!origin) { console.log('   brak obiektu origin po zalogowaniu'); process.exit(1); }
// Transakcje musi wysylac prawdziwy klient viem, nie nasz signer do podpisow.
if (typeof origin.setViemClient === 'function') origin.setViemClient(walletClient);

// Najmniejszy sensowny obraz: 1x1 PNG. Chodzi o sprawdzenie sciezki, nie o tresc.
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const bytes = Buffer.from(pngBase64, 'base64');
const file = new File([bytes], 'probe.png', { type: 'image/png' });

const license = {
  price: 0n,
  duration: 2629800,
  royaltyBps: 0,
  paymentToken: '0x0000000000000000000000000000000000000000',
  licenseType: LicenseType.DURATION_BASED,
};

const metadata = {
  name: 'MySphere mint probe',
  description: 'Diagnostyka sciezki mintu Camp Origin na mainnecie.',
  mimeType: 'image/png',
};

try {
  const tokenId = await origin.mintFile(file, metadata, license, undefined, {
    useAssetAsPreview: true,
  });
  console.log('   UDALO SIE, tokenId:', tokenId);
} catch (e) {
  fail('mint z podgladem', e);
  step('3b', 'Ponowna proba BEZ podgladu');
  try {
    const tokenId = await origin.mintFile(file, metadata, license);
    console.log('   UDALO SIE bez podgladu, tokenId:', tokenId);
    process.exitCode = 0;
  } catch (e2) {
    fail('mint bez podgladu', e2);
  }
}
