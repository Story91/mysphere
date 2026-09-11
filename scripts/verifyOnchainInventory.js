/**
 * WERYFIKACJA INWENTARZA KONTRAKTOW - TYLKO ODCZYTY.
 *
 * PO CO TO JEST
 * Strona /re-definition ma pokazac liste WSZYSTKICH kontraktow, ktorych uzywa
 * aplikacja, razem z adresami do sprawdzenia w eksplorerze. Teza produktu brzmi
 * "te liczby sa sprawdzalne", wiec pojedynczy zly adres na tej stronie kosztuje
 * wiecej niz brak strony. Ten skrypt jest dowodem, a nie deklaracja: kazdy
 * wiersz listy musi przejsc przez lancuch, zanim trafi do HTML-a.
 *
 * ZASADA: DOMYSLNIE ADRES JEST BLEDNY, dopoki lancuch go nie potwierdzi.
 * Brak kodu pod adresem na deklarowanym lancuchu = pozycja obalona, nie
 * "pewnie chodzilo o inna siec".
 *
 * CO ROBI
 *   1. eth_chainId  - sprawdza, ze RPC naprawde jest tym lancuchem, za ktory
 *                     sie podaje (chroni przed pomylka endpointu).
 *   2. eth_getCode   - jest bytecode czy nie ma. To jest glowne pytanie.
 *   3. Odczyty tozsamosci tam, gdzie sie da:
 *        - ERC-20:  name() symbol() decimals()
 *        - ERC-721: name() symbol()
 *        - AskEscrow: TOKEN() FEE_BPS() FEE_RECIPIENT() + porownanie
 *          z deployments/askEscrow.<chainId>.json
 *        - owner() wszedzie, gdzie odpowiada
 *
 * ZERO TRANSAKCJI. Zaden krok nie podpisuje niczego i nie potrzebuje klucza
 * prywatnego - to sa wylacznie wywolania eth_call / eth_getCode.
 *
 * JAK URUCHOMIC
 *   node scripts/verifyOnchainInventory.js
 * albo (jesli ktos woli srodowisko hardhata - sieci i tak bierzemy z listy
 * ponizej, bo Celo / Ethereum / World Chain nie ma w hardhat.config.ts):
 *   npx hardhat run scripts/verifyOnchainInventory.js --network base
 *
 * Nadpisanie RPC zmiennymi srodowiskowymi (przydatne, gdy publiczny endpoint
 * padnie albo zacznie limitowac):
 *   BASE_RPC_URL, BASE_SEPOLIA_RPC_URL, CAMP_RPC_URL, ROBINHOOD_RPC_URL,
 *   CELO_RPC_URL, ETHEREUM_RPC_URL, LINEA_RPC_URL, WORLDCHAIN_RPC_URL
 *
 * WYNIK
 *   - tabela na stdout (POTWIERDZONE / OBALONE / NIESPRAWDZONE)
 *   - pelny JSON w scripts/output/onchain-inventory-<data>.json, jesli podasz
 *     --json (zeby dalo sie porownac dwa przebiegi po zmianie w kodzie)
 */

const fs = require('fs');
const path = require('path');
const { JsonRpcProvider, Contract, getAddress } = require('ethers');

/* ------------------------------------------------------------------ */
/*  SIECI                                                              */
/* ------------------------------------------------------------------ */
/*
 * Kazdy lancuch ma liste RPC - pierwszy odpowiadajacy wygrywa. Lista jest
 * po to, zeby jeden padniety publiczny endpoint nie zamienil sie w falszywe
 * "kontraktu nie ma". Jesli ZADEN RPC nie odpowie, lancuch ladnie ladzie
 * w kubelku NIESPRAWDZONE - nigdy w OBALONE.
 *
 * explorer: adres bazowy eksplorera, ktory FAKTYCZNIE obsluguje dany lancuch.
 * Repo ma historie zlych linkow, wiec kazdy z nich jest tu wpisany raz,
 * w jednym miejscu, i stad generujemy URL-e na strone.
 */
const CHAINS = {
  8453: {
    name: 'Base',
    rpcs: [process.env.BASE_RPC_URL, 'https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com'],
    explorer: 'https://basescan.org',
  },
  84532: {
    name: 'Base Sepolia',
    rpcs: [process.env.BASE_SEPOLIA_RPC_URL, 'https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'],
    explorer: 'https://sepolia.basescan.org',
  },
  484: {
    name: 'Camp Network',
    // Ta sama kolejnosc, co w config/camp.ts (rpc-mainnet.campnetwork.xyz
    // z docs Campa, potem eth-rpc Blockscouta). Dawny host gelato zniknal
    // z DNS 2026-09 - pytanie brzmi "czy aplikacja moze sie dogadac
    // z lancuchem", wiec sprawdzamy dokladnie te adresy, ktore ma aplikacja.
    rpcs: [process.env.CAMP_RPC_URL, 'https://rpc-mainnet.campnetwork.xyz', 'https://camp.cloud.blockscout.com/api/eth-rpc'],
    explorer: 'https://camp.cloud.blockscout.com',
  },
  4663: {
    name: 'Robinhood Chain',
    rpcs: [process.env.ROBINHOOD_RPC_URL, 'https://rpc.mainnet.chain.robinhood.com'],
    explorer: 'https://robinhoodchain.blockscout.com',
  },
  42220: {
    name: 'Celo',
    rpcs: [process.env.CELO_RPC_URL, 'https://forno.celo.org', 'https://celo.drpc.org'],
    explorer: 'https://celoscan.io',
  },
  1: {
    name: 'Ethereum',
    rpcs: [process.env.ETHEREUM_RPC_URL, 'https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
    explorer: 'https://etherscan.io',
  },
  59144: {
    name: 'Linea',
    rpcs: [process.env.LINEA_RPC_URL, 'https://linea-rpc.publicnode.com', 'https://rpc.linea.build'],
    explorer: 'https://lineascan.build',
  },
  480: {
    name: 'World Chain',
    rpcs: [process.env.WORLDCHAIN_RPC_URL, 'https://worldchain-mainnet.g.alchemy.com/public', 'https://worldchain.drpc.org'],
    explorer: 'https://worldscan.org',
  },
};

/* ------------------------------------------------------------------ */
/*  CO SPRAWDZAMY                                                      */
/* ------------------------------------------------------------------ */
/*
 * chainId to lancuch, na ktorym KOD APLIKACJI uzywa tego adresu - nie ten,
 * na ktorym adres bylby wygodny. To rozroznienie jest cala pointa: jesli
 * plik konfiguracyjny mowi "Base", a kod woła to na Base Sepolia, sprawdzamy
 * oba i wypisujemy roznice.
 *
 * kind: 'escrow' | 'erc20' | 'erc721' | 'post' | 'plain'
 */
const TARGETS = [
  /* --- A. wdrozone przez nas --- */
  { address: '0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340', chainId: 8453, kind: 'escrow',
    label: 'AskEscrow', source: 'deployments/askEscrow.8453.json + app/utils/asks/escrow.ts' },
  { address: '0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6', chainId: 84532, kind: 'escrow',
    label: 'AskEscrow (testnet)', source: 'deployments/askEscrow.84532.json' },
  { address: '0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6', chainId: 4663, kind: 'post',
    label: 'RobinhoodPostContract', source: 'app/basechat/Robinhood/deployment-info.json' },
  { address: '0x163bd9Ec5267491963163dE70D0B64f9400a20AD', chainId: 8453, kind: 'plain',
    label: 'PaidPin', source: 'app/basechat/PinnedJobs/config/contractConfig.ts:5-6' },
  { address: '0x6e1811A5401dfC30E8F3E2DD9dE0Bbe156F97aC7', chainId: 8453, kind: 'post',
    label: 'PostContract2 (mainnet)', source: 'app/contracts/PostContract2.ts:201' },
  // TEN SAM adres deklarowany jako testnetowy w linii 202 - sprawdzamy osobno,
  // bo to jest dokladnie to miejsce, gdzie komentarz w kodzie moze klamac.
  { address: '0x6e1811A5401dfC30E8F3E2DD9dE0Bbe156F97aC7', chainId: 84532, kind: 'post',
    label: 'PostContract2 (deklarowany testnet)', source: 'app/contracts/PostContract2.ts:202' },
  { address: '0x71bE438ee579de33EBf353579A413439Db042CA5', chainId: 484, kind: 'post',
    label: 'CampPostv1', source: 'app/contracts/BaseCampPostContract.ts:27' },
  { address: '0x57CC99c9E1942a34a0cfF7FCC27c227455f14587', chainId: 484, kind: 'erc721',
    label: 'Portal NFT', source: 'app/basechat/components/BaseCampPosts/ClaimPortalBanner.tsx:11' },
  { address: '0xA79651c953A987C815b3f5b82b69492e437CcFED', chainId: 42220, kind: 'post',
    label: 'CeloPostContract', source: 'app/basechat/Celo/contracts/CeloPostContract.ts:229' },
  { address: '0x7c4C79176dc098Fb304E4AcD4e93b1a1DfCF1749', chainId: 1, kind: 'post',
    label: 'EthereumPostContract', source: 'app/basechat/ETH/contracts/EthereumPostContract.ts:229' },
  { address: '0x9fB36660849D85CEe6609f6020af3336aB7541f5', chainId: 59144, kind: 'post',
    label: 'LineaPostContract', source: 'app/basechat/Linea/contracts/LineaPostContract.ts:228' },
  { address: '0xFF426EA2f562C6866edA81981C2420bC574eA2DF', chainId: 480, kind: 'post',
    label: 'WorldChainPostContract', source: 'app/basechat/World/contracts/WorldChainPostContract.ts:229' },
  // BaseMorning: plik konfiguracyjny NIE MOWI o zadnej sieci, a hook wola
  // switchChain(baseSepolia). Sprawdzamy oba lancuchy, zeby rozstrzygnac.
  { address: '0xdaD4777b825548F3eeAD4bc6cAC8499ca2776fC2', chainId: 84532, kind: 'plain',
    label: 'BaseMorningGame (Base Sepolia)', source: 'app/basemorning/config/contract.ts:1 + hooks/useBaseMorningContract.ts:112' },
  { address: '0xdaD4777b825548F3eeAD4bc6cAC8499ca2776fC2', chainId: 8453, kind: 'plain',
    label: 'BaseMorningGame (czy jest na mainnecie?)', source: 'app/basemorning/config/contract.ts:1' },
  { address: '0xf528f920d0ce1d1ea230b0ec10f0f64b8f43cbac', chainId: 484, kind: 'plain',
    label: 'SimpleIPNFTMarketplace', source: 'app/marketplace/config/simpleMarketplace.ts:4' },
  { address: '0xF90733b9eCDa3b49C250B2C3E3E42c96fC93324E', chainId: 484, kind: 'erc721',
    label: 'DEFAULT_IP_NFT_CONTRACT', source: 'app/marketplace/config/simpleMarketplace.ts:1653' },

  /* --- B. obce kontrakty, ktore wolamy --- */
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chainId: 8453, kind: 'erc20',
    label: 'USDC (Base)', source: 'app/utils/monetization/verifyPayment.ts:30' },
  { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', chainId: 84532, kind: 'erc20',
    label: 'USDC (Base Sepolia)', source: 'deployments/askEscrow.84532.json:8' },
  { address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', chainId: 4663, kind: 'erc20',
    label: 'USDG', source: 'app/api/asks/pricing.ts:78' },
  { address: '0x2cFc85d8E48F8EAB294be644d9E25C3030863003', chainId: 480, kind: 'erc20',
    label: 'WLD', source: 'app/basechat/components/TipNetworkConfig.ts:48' },
  { address: '0x1789e0043623282d5dcc7f213d703c6d8bafbb04', chainId: 59144, kind: 'erc20',
    label: 'LINEA token', source: 'app/basechat/components/TipNetworkConfig.ts:50' },
  { address: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD', chainId: 8453, kind: 'plain',
    label: 'L2Resolver Basenames', source: 'app/utils/identity/resolver.ts:23' },
  { address: '0x6533C94869D28fAA8dF77cc63f9e2b2D6Cf77eBA', chainId: 84532, kind: 'plain',
    label: 'L2Resolver Basenames (testnet)', source: 'app/utils/identity/resolver.ts:24' },
  // Fabryka CDP - deklarowana jako "Base Sepolia address" w komentarzu.
  // Sprawdzamy oba lancuchy Base, bo komentarz moze byc nieaktualny.
  { address: '0x0222ffA046596B3Abf7818cCBfef1cb6b3b5B0c1', chainId: 84532, kind: 'plain',
    label: 'CDP smart account factory', source: 'app/api/cdp/wallet/route.ts:65' },
  { address: '0x0222ffA046596B3Abf7818cCBfef1cb6b3b5B0c1', chainId: 8453, kind: 'plain',
    label: 'CDP smart account factory (mainnet?)', source: 'app/api/cdp/wallet/route.ts:65' },
  { address: '0x2Ca8E0C643bDe4C2E08ab1fA0da3401AdAD7734D', chainId: 84532, kind: 'plain',
    label: 'Chainlink VRF Coordinator', source: 'app/basemorning/test/BaseMorningGame.test.ts:14 (tylko test)' },

  /* --- C. kontrakty z docs/contractsmainpage.md, ktorych NIE MA w kodzie ---
   *
   * Znalezione przy weryfikacji: dokument docs/contractsmainpage.md wymienia je
   * jako kontrakty MySphere, ale grep po calym repo pokazuje, ze zaden plik
   * aplikacji ich nie wola - wystepuja WYLACZNIE w dokumentacji. Istnieja na
   * lancuchu i maja realna podaz, wiec trzymamy je pod obserwacja: jesli strona
   * ma mowic "kontrakty, ktorych uzywa aplikacja", to ich tam NIE MA MIEJSCA;
   * jesli ma mowic "kontrakty MySphere", to trzeba je dopisac swiadomie.
   *
   * UWAGA: trzy NFT ponizej maja po 45 bajtow kodu - to ERC-1167 (minimal
   * proxy), czyli klon wskazujacy na implementacje pod innym adresem. Sam
   * getCode potwierdza istnienie, nie logike.
   */
  { address: '0x9c44802843a670732383f62b2f3304f92ec1702b', chainId: 8453, kind: 'erc721',
    label: 'QuotesOnBase / MySphereAIQuotes (tylko w docs)', source: 'docs/contractsmainpage.md:15' },
  { address: '0x8edb8B2383f41e14b49414dd32c4A786Ed2e277d', chainId: 8453, kind: 'erc721',
    label: 'SPHERE Pioneer NFT (tylko w docs)', source: 'docs/contractsmainpage.md:22' },
  { address: '0x4087EFD20F2A91ADeAa2b7259F61d04d1e5B233E', chainId: 8453, kind: 'erc721',
    label: 'SPHERE Guardian NFT (tylko w docs)', source: 'docs/contractsmainpage.md:28' },
  { address: '0x6d55153A6B1d1157f19D403DEd541fbe6De48C5A', chainId: 8453, kind: 'erc721',
    label: 'SPHERE Master NFT (tylko w docs)', source: 'docs/contractsmainpage.md:34' },

  /* --- D. adresy, ktore w kodzie wystepuja jako portfele --- */
  /* Sprawdzamy je TYLKO po to, zeby potwierdzic, ze to NIE sa kontrakty.
     Adres uzytkownika z app/api/manual-pin/route.ts swiadomie pominiety -
     to portfel prywatnej osoby, nie infrastruktura produktu. */
  { address: '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd', chainId: 8453, kind: 'plain',
    label: 'EOA: skarbiec (odbiorca platnych przypiec)', source: 'app/basechat/PinnedJobs/components/PaidPinModal.tsx:32' },
  { address: '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e', chainId: 8453, kind: 'plain',
    label: 'EOA: admin / odbiorca prowizji escrow', source: 'app/utils/firebase.ts:55' },
  { address: '0x9fb014812e5c22643640a5885866f499b1bbb5e0', chainId: 8453, kind: 'plain',
    label: 'EOA: platformReferrer Zora', source: 'app/basechat/page.tsx:1410' },
];

/* ------------------------------------------------------------------ */
/*  ABI - minimum potrzebne do potwierdzenia tozsamosci                */
/* ------------------------------------------------------------------ */
const ABI_ERC20 = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
];
const ABI_ERC721 = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
];
const ABI_OWNER = ['function owner() view returns (address)'];
const ABI_ESCROW = [
  'function TOKEN() view returns (address)',
  'function FEE_BPS() view returns (uint16)',
  'function FEE_RECIPIENT() view returns (address)',
  'function MAX_FEE_BPS() view returns (uint16)',
  'function totalLiabilities() view returns (uint256)',
];
const ABI_POST = [
  'function postCount() view returns (uint256)',
  'function totalPosts() view returns (uint256)',
  'function getPostCount() view returns (uint256)',
];

/* ------------------------------------------------------------------ */
/*  NARZEDZIA                                                          */
/* ------------------------------------------------------------------ */

/** Probuje kolejne RPC, az ktorys odpowie I potwierdzi wlasciwy chainId. */
async function connect(chainId) {
  const meta = CHAINS[chainId];
  const errors = [];
  for (const url of meta.rpcs.filter(Boolean)) {
    try {
      // staticNetwork: bez tego ethers sam dopytuje o siec i gubi blad DNS
      // w mniej czytelnym opakowaniu.
      const provider = new JsonRpcProvider(url, chainId, { staticNetwork: true });
      const net = await withTimeout(provider.getNetwork(), 12000);
      if (Number(net.chainId) !== chainId) {
        errors.push(`${url}: RPC podaje chainId ${net.chainId}, oczekiwano ${chainId}`);
        continue;
      }
      const block = await withTimeout(provider.getBlockNumber(), 12000);
      return { provider, url, block, errors };
    } catch (e) {
      errors.push(`${url}: ${short(e)}`);
    }
  }
  return { provider: null, url: null, block: null, errors };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms)),
  ]);
}

function short(e) {
  const m = (e && (e.shortMessage || e.message)) || String(e);
  return m.split('\n')[0].slice(0, 160);
}

/** Odczyt widoku, ktory MOZE nie istniec - brak funkcji to informacja, nie blad. */
async function tryRead(provider, address, abi, fn) {
  try {
    const c = new Contract(address, abi, provider);
    const v = await withTimeout(c[fn](), 12000);
    return typeof v === 'bigint' ? v.toString() : v;
  } catch {
    return null;
  }
}

function explorerAddressUrl(chainId, address) {
  const base = CHAINS[chainId].explorer;
  // Blockscout uzywa /address/<a>, Etherscan-podobne tez - roznica jest tylko
  // w domenie, wiec jeden wzor wystarcza. Trzymamy to w JEDNYM miejscu,
  // bo repo ma historie recznie sklejanych, blednych linkow.
  return `${base}/address/${address}`;
}

/* ------------------------------------------------------------------ */
/*  GLOWNA PETLA                                                       */
/* ------------------------------------------------------------------ */
async function main() {
  const byChain = new Map();
  for (const t of TARGETS) {
    if (!byChain.has(t.chainId)) byChain.set(t.chainId, []);
    byChain.get(t.chainId).push(t);
  }

  const results = [];

  for (const [chainId, targets] of byChain) {
    const meta = CHAINS[chainId];
    process.stderr.write(`\n=== ${meta.name} (${chainId}) ===\n`);
    const conn = await connect(chainId);

    if (!conn.provider) {
      process.stderr.write(`  RPC NIEDOSTEPNY:\n${conn.errors.map((e) => '    - ' + e).join('\n')}\n`);
      for (const t of targets) {
        results.push({ ...t, status: 'NIESPRAWDZONE', reason: 'zaden RPC tego lancucha nie odpowiedzial', rpcErrors: conn.errors });
      }
      continue;
    }
    process.stderr.write(`  RPC: ${conn.url} (blok ${conn.block})\n`);

    for (const t of targets) {
      // Checksum EIP-55 lapie literowki w adresie. Adres, ktory NIE przechodzi
      // checksumu, a nie jest w calosci malymi literami, zostal recznie
      // przepisany i po drodze zmieniono w nim znak - odnotowujemy to jawnie,
      // ale i tak sprawdzamy lancuch (adres moze byc poprawny, tylko zle
      // zapisany).
      let addr;
      let badChecksum = false;
      try {
        addr = getAddress(t.address);
      } catch {
        badChecksum = t.address !== t.address.toLowerCase();
        addr = getAddress(t.address.toLowerCase());
      }
      const row = { ...t, address: addr, badChecksum, chainName: meta.name, rpc: conn.url, explorer: explorerAddressUrl(chainId, addr) };
      if (badChecksum) process.stderr.write(`  ! ${t.label} - adres w kodzie ma ZLY checksum EIP-55 (${t.address})\n`);
      let code;
      try {
        code = await withTimeout(conn.provider.getCode(addr), 15000);
      } catch (e) {
        row.status = 'NIESPRAWDZONE';
        row.reason = `eth_getCode nie odpowiedzial: ${short(e)}`;
        results.push(row);
        process.stderr.write(`  ? ${t.label} - ${row.reason}\n`);
        continue;
      }

      row.codeSize = code === '0x' ? 0 : (code.length - 2) / 2;
      row.hasCode = row.codeSize > 0;

      // EIP-7702: pod adresem stoi 23 bajty zaczynajace sie od 0xef0100.
      // To NADAL jest portfel z delegacja, nie kontrakt - mylenie tych dwoch
      // rzeczy na publicznej stronie byloby po prostu nieprawda.
      row.is7702 = code.startsWith('0xef0100');

      if (!row.hasCode) {
        row.status = 'OBALONE';
        row.reason = `eth_getCode zwraca 0x - pod tym adresem NIE MA kodu na ${meta.name} (${chainId})`;
        results.push(row);
        process.stderr.write(`  X ${t.label} - BRAK KODU\n`);
        continue;
      }

      // --- odczyty tozsamosci ---
      const id = {};
      if (t.kind === 'erc20') {
        id.name = await tryRead(conn.provider, addr, ABI_ERC20, 'name');
        id.symbol = await tryRead(conn.provider, addr, ABI_ERC20, 'symbol');
        id.decimals = await tryRead(conn.provider, addr, ABI_ERC20, 'decimals');
        id.totalSupply = await tryRead(conn.provider, addr, ABI_ERC20, 'totalSupply');
      } else if (t.kind === 'erc721') {
        id.name = await tryRead(conn.provider, addr, ABI_ERC721, 'name');
        id.symbol = await tryRead(conn.provider, addr, ABI_ERC721, 'symbol');
        id.totalSupply = await tryRead(conn.provider, addr, ABI_ERC721, 'totalSupply');
      } else if (t.kind === 'escrow') {
        id.TOKEN = await tryRead(conn.provider, addr, ABI_ESCROW, 'TOKEN');
        id.FEE_BPS = await tryRead(conn.provider, addr, ABI_ESCROW, 'FEE_BPS');
        id.FEE_RECIPIENT = await tryRead(conn.provider, addr, ABI_ESCROW, 'FEE_RECIPIENT');
        id.MAX_FEE_BPS = await tryRead(conn.provider, addr, ABI_ESCROW, 'MAX_FEE_BPS');
        id.totalLiabilities = await tryRead(conn.provider, addr, ABI_ESCROW, 'totalLiabilities');

        // Porownanie z plikiem wdrozenia. Plik jest DEKLARACJA - lancuch jest
        // prawda. Rozjazd tutaj znaczy, ze plik jest do poprawki.
        const file = path.join(__dirname, '..', 'deployments', `askEscrow.${chainId}.json`);
        if (fs.existsSync(file)) {
          const dep = JSON.parse(fs.readFileSync(file, 'utf8'));
          id.matchesDeploymentFile = {
            address: getAddress(dep.address) === addr,
            token: id.TOKEN ? getAddress(dep.token) === getAddress(id.TOKEN) : null,
            feeBps: id.FEE_BPS != null ? Number(dep.feeBps) === Number(id.FEE_BPS) : null,
            feeRecipient: id.FEE_RECIPIENT ? getAddress(dep.feeRecipient) === getAddress(id.FEE_RECIPIENT) : null,
          };
        }
      } else if (t.kind === 'post') {
        id.postCount = await tryRead(conn.provider, addr, ABI_POST, 'postCount');
        if (id.postCount == null) id.totalPosts = await tryRead(conn.provider, addr, ABI_POST, 'totalPosts');
        if (id.postCount == null && id.totalPosts == null) id.getPostCount = await tryRead(conn.provider, addr, ABI_POST, 'getPostCount');
        id.name = await tryRead(conn.provider, addr, ABI_ERC721, 'name');
      }
      id.owner = await tryRead(conn.provider, addr, ABI_OWNER, 'owner');
      row.identity = id;

      row.status = row.is7702 ? 'KOD 7702 (portfel z delegacja, nie kontrakt)' : 'POTWIERDZONE';
      results.push(row);
      process.stderr.write(`  OK ${t.label} - ${row.codeSize} B kodu${id.symbol ? ` [${id.symbol}]` : ''}${row.is7702 ? ' (EIP-7702!)' : ''}\n`);
    }
  }

  /* --- podsumowanie --- */
  const buckets = { POTWIERDZONE: [], OBALONE: [], NIESPRAWDZONE: [], INNE: [] };
  for (const r of results) {
    if (buckets[r.status]) buckets[r.status].push(r);
    else buckets.INNE.push(r);
  }

  console.log('\n================ PODSUMOWANIE ================');
  for (const [k, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    console.log(`\n--- ${k} (${list.length}) ---`);
    for (const r of list) {
      const extra = r.identity && r.identity.symbol ? ` [${r.identity.symbol}]` : '';
      console.log(`${r.address}  ${r.chainName} (${r.chainId})  ${r.label}${extra}`);
      if (r.reason) console.log(`    powod: ${r.reason}`);
      if (r.identity) console.log(`    ${JSON.stringify(r.identity)}`);
      if (r.explorer) console.log(`    ${r.explorer}`);
    }
  }

  if (process.argv.includes('--json')) {
    const outDir = path.join(__dirname, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, `onchain-inventory-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(`\nJSON: ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
