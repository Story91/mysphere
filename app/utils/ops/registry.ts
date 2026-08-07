/**
 * KONSOLA OPERATORA - REJESTR.
 *
 * === PO CO ===
 * Produkt ma jedenascie kontraktow na siedmiu lancuchach, dwa gorace klucze
 * i zewnetrznego facilitatora platnosci. Awaria tej warstwy nie wyglada jak
 * awaria: wszystko dziala, dopoki jednemu adresowi nie skonczy sie gaz, a wtedy
 * platnosci padaja i dowiadujemy sie o tym od uzytkownikow. Ten plik jest lista
 * rzeczy, ktore maja byc ogladane, i progow, przy ktorych ma byc glosno.
 *
 * === TEN PLIK NIE MOZE TRAFIC DO PRZEGLADARKI ===
 * Adresy portfeli infrastruktury, progi alarmow i klucze RPC to nie sa dane dla
 * kazdego goscia. Importuj WYLACZNIE z tras serwerowych (app/api/admin/ops).
 * Nie ma tu `import 'server-only'`, bo tej paczki nie ma w projekcie - jedyna
 * ochrona jest dyscyplina importu.
 *
 * === CZEGO TU NIE MA I NIE MOZE BYC ===
 * Zadnego adresu, ktory cos WYSYLA. Ta konsola patrzy. Kazdy odczyt ponizej
 * to eth_call / eth_getBalance / eth_getCode.
 */

import type { Address } from 'viem';

/* ------------------------------------------------------------------ */
/*  LANCUCHY                                                           */
/* ------------------------------------------------------------------ */

export interface ChainMeta {
  id: number;
  name: string;
  /** Lista RPC - pierwszy, ktory odpowie I potwierdzi chainId, wygrywa. */
  rpcs: string[];
  explorer: string;
  nativeSymbol: string;
}

/**
 * Lista RPC per lancuch jest po to, zeby jeden padniety publiczny endpoint nie
 * zamienil sie w falszywe "kontraktu nie ma" albo w falszywe "saldo zero".
 * Gdy ZADEN nie odpowie, cala sekcja tego lancucha idzie w stan
 * "nie udalo sie sprawdzic" - nigdy w zero i nigdy w pustke.
 *
 * Wartosci przepisane z scripts/verifyOnchainInventory.js, zeby konsola i
 * skrypt widzialy ten sam swiat.
 */
export const OPS_CHAINS: Record<number, ChainMeta> = {
  8453: {
    id: 8453,
    name: 'Base',
    rpcs: [process.env.BASE_RPC_URL, process.env.CDP_RPC_URL, 'https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com'].filter(Boolean) as string[],
    explorer: 'https://basescan.org',
    nativeSymbol: 'ETH',
  },
  84532: {
    id: 84532,
    name: 'Base Sepolia',
    rpcs: [process.env.BASE_SEPOLIA_RPC_URL, 'https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'].filter(Boolean) as string[],
    explorer: 'https://sepolia.basescan.org',
    nativeSymbol: 'ETH',
  },
  484: {
    id: 484,
    name: 'Camp Network',
    rpcs: [process.env.CAMP_RPC_URL, 'https://rpc.camp.raas.gelato.cloud', 'https://rpc-campnetwork.xyz', 'https://camp.cloud.blockscout.com/api/eth-rpc'].filter(Boolean) as string[],
    explorer: 'https://camp.cloud.blockscout.com',
    nativeSymbol: 'CAMP',
  },
  4663: {
    id: 4663,
    name: 'Robinhood Chain',
    rpcs: [process.env.ROBINHOOD_RPC_URL, 'https://rpc.mainnet.chain.robinhood.com'].filter(Boolean) as string[],
    explorer: 'https://robinhoodchain.blockscout.com',
    nativeSymbol: 'ETH',
  },
  42220: {
    id: 42220,
    name: 'Celo',
    rpcs: [process.env.CELO_RPC_URL, 'https://forno.celo.org', 'https://celo.drpc.org'].filter(Boolean) as string[],
    explorer: 'https://celoscan.io',
    nativeSymbol: 'CELO',
  },
  1: {
    id: 1,
    name: 'Ethereum',
    rpcs: [process.env.ETHEREUM_RPC_URL, 'https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'].filter(Boolean) as string[],
    explorer: 'https://etherscan.io',
    nativeSymbol: 'ETH',
  },
  59144: {
    id: 59144,
    name: 'Linea',
    rpcs: [process.env.LINEA_RPC_URL, 'https://linea-rpc.publicnode.com', 'https://rpc.linea.build'].filter(Boolean) as string[],
    explorer: 'https://lineascan.build',
    nativeSymbol: 'ETH',
  },
  480: {
    id: 480,
    name: 'World Chain',
    rpcs: [process.env.WORLDCHAIN_RPC_URL, 'https://worldchain-mainnet.g.alchemy.com/public', 'https://worldchain.drpc.org'].filter(Boolean) as string[],
    explorer: 'https://worldscan.org',
    nativeSymbol: 'ETH',
  },
};

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const chain = OPS_CHAINS[chainId];
  if (!chain) return null;
  // Blockscout i Etherscan maja ten sam wzor /address/<a> - roznica jest tylko
  // w domenie. Trzymamy to w JEDNYM miejscu, bo repo ma historie recznie
  // sklejanych, blednych linkow.
  return `${chain.explorer}/address/${address}`;
}

/* ------------------------------------------------------------------ */
/*  PORTFELE, KTORE PLACA ZA GAZ                                       */
/* ------------------------------------------------------------------ */

export interface WatchedWallet {
  /** Klucz stabilny miedzy przebiegami - uzywany jako React key i w logach. */
  key: string;
  address: Address;
  chainId: number;
  label: string;
  /** Jednym zdaniem: co pada, gdy temu adresowi skonczy sie gaz. */
  consequence: string;
  /**
   * Ile gazu zjada JEDNA typowa akcja tego adresu. Sluzy do przeliczenia salda
   * na "ile akcji jeszcze wystarczy" - patrz komentarz przy progach nizej.
   * null = ten adres NIE placi gazu, wiec zadne przeliczenie nie ma sensu.
   */
  gasPerAction: bigint | null;
  /** Nazwa tej akcji w liczbie mnogiej, do zdania w UI ("payments", "transactions"). */
  actionNoun: string;
  /** Ponizej tylu akcji zapasu: ALARM. */
  alarmBelowActions: number;
  /** Ponizej tylu akcji zapasu: ostrzezenie. */
  warnBelowActions: number;
}

/**
 * === DLACZEGO PROGI SA W AKCJACH, A NIE W ETH ===
 * Prog wpisany jako "0,0001 ETH" jest zgadywaniem: znaczy co innego przy cenie
 * gazu 0,001 gwei i co innego przy 0,5 gwei, a my nie kontrolujemy zadnej
 * z tych liczb. Dlatego prog jest wyrazony w AKCJACH, a liczba akcji liczona
 * jest z DWOCH ODCZYTOW z lancucha: saldo / (aktualna cena gazu * gaz na akcje).
 * Prog sam sie dopasowuje, gdy sieci podroza, i da sie go sprawdzic - w UI
 * pokazujemy i saldo, i policzony koszt jednej akcji.
 *
 * Gdy eth_gasPrice nie odpowie, przeliczenie NIE jest zgadywane: pokazujemy
 * samo saldo i jawnie mowimy, ze zapasu nie dalo sie policzyc.
 */

/** Facilitator x402 - sygnatariusz, ktory placi gaz za KAZDA platnosc agenta. */
const X402_FACILITATOR_SIGNER = '0x37DfB4033D5dD98fd335F24d0d42E8fE68d587D6' as Address;

/** Admin: deployer, odbiorca prowizji escrow, jedyny adres administracyjny produktu. */
const ADMIN_WALLET = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e' as Address;

/**
 * Skarbiec - odbiorca platnosci za przypiete posty.
 * NIE MYLIC z adresem admina; to osobna decyzja i osobne konto
 * (patrz komentarz przy MYSPHERE_ADDRESS w PaidPinModal.tsx).
 */
const TREASURY_WALLET = '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd' as Address;

export const WATCHED_WALLETS: WatchedWallet[] = [
  {
    key: 'x402-facilitator-4663',
    address: X402_FACILITATOR_SIGNER,
    chainId: 4663,
    label: 'x402 facilitator signer',
    consequence:
      'Pays the gas for every agent payment on Robinhood Chain. When it runs dry, agent payments start failing and nothing on our side changes to tell us.',
    /*
     * 120 tys. NIE jest zgadniete. Ostatnie 12 transakcji tego adresu na 4663
     * (blockscout, wszystkie transferWithAuthorization) zuzylo od 73 875 do
     * 102 495 gazu, mediana okolo 85 500. Budzet stoi tuz nad zaobserwowanym
     * maksimum, wiec policzony zapas jest ostrozny, a nie optymistyczny -
     * a taki ma byc, bo blad w druga strone znaczy cisza przed awaria.
     */
    gasPerAction: 120_000n,
    actionNoun: 'agent payments',
    /*
     * PROG NAJSZERSZY W CALEJ KONSOLI, bo to jedyny adres, ktory wydaje
     * pieniadze BEZ udzialu czlowieka i ktorego wyschniecie jest niewidoczne
     * dla nas, a widoczne dla uzytkownika. Czlowiek zaglada tu raz na dobe,
     * nie co minute - alarm musi zostawic dosc czasu, zeby dolac zanim zabraknie.
     * 100 platnosci zapasu przy 19 transakcjach w calej historii tego adresu to
     * wielokrotnosc dotychczasowego ruchu, czyli margines liczony w tygodniach.
     */
    alarmBelowActions: 100,
    warnBelowActions: 400,
  },
  {
    key: 'admin-8453',
    address: ADMIN_WALLET,
    chainId: 8453,
    label: 'Admin / fee recipient (Base)',
    consequence:
      'Deployer and escrow fee recipient. Without gas here nobody can claim the platform fee or deploy anything on Base.',
    gasPerAction: 250_000n,
    actionNoun: 'transactions',
    /*
     * Wezszy prog niz facilitator, bo tu ZAWSZE jest czlowiek przy klawiaturze:
     * brak gazu objawia sie natychmiast jako nieudana transakcja tego samego
     * czlowieka, ktory ja wlasnie wyslal. Nie ma cichej awarii do wykrycia.
     */
    alarmBelowActions: 25,
    warnBelowActions: 100,
  },
  {
    key: 'admin-4663',
    address: ADMIN_WALLET,
    chainId: 4663,
    label: 'Admin (Robinhood Chain)',
    consequence:
      'Same key on Robinhood Chain. It is the payer in the x402 flow; the payer signs but does not pay gas, so this balance only matters for direct transactions.',
    gasPerAction: 250_000n,
    actionNoun: 'transactions',
    alarmBelowActions: 25,
    warnBelowActions: 100,
  },
  {
    key: 'treasury-8453',
    address: TREASURY_WALLET,
    chainId: 8453,
    label: 'Treasury (paid pins)',
    consequence:
      'Receives payments for pinned posts. It only receives, so an empty gas balance breaks nothing on its own.',
    /*
     * null, bo ten adres NICZEGO nie wysyla. Wpisanie mu progu zrobiloby alarm,
     * ktory nic nie znaczy - a alarm, ktory nic nie znaczy, uczy ignorowac
     * wszystkie pozostale. Pokazujemy saldo bez oceny.
     */
    gasPerAction: null,
    actionNoun: 'transactions',
    alarmBelowActions: 0,
    warnBelowActions: 0,
  },
];

/* ------------------------------------------------------------------ */
/*  ESCROW                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lancuchy, na ktorych sprawdzamy wyplacalnosc escrow. Adresy NIE sa tu
 * przepisane - bierzemy je z deployments/askEscrow.<chainId>.json przez
 * app/utils/asks/escrow.ts, bo to jest jedyne zrodlo prawdy o wdrozeniu.
 */
export const ESCROW_WATCHED_CHAIN_IDS = [8453, 84532];

/* ------------------------------------------------------------------ */
/*  FACILITATOR X402                                                   */
/* ------------------------------------------------------------------ */

/**
 * Facilitator, ktory realnie rozliczyl nasza platnosc w USDG na 4663
 * (patrz app/api/asks/pricing.ts). Jesli przestanie deklarowac dokladnie ten
 * schemat, platnosci agentow przestana dzialac BEZ zadnej zmiany u nas -
 * dlatego to jest osobna pozycja w konsoli, a nie przypis.
 */
export const X402_FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL || 'https://x402.primer.systems';

/** Dokladnie ten wpis musi byc na liscie /supported. */
export const X402_REQUIRED_KIND = {
  x402Version: 2,
  scheme: 'exact',
  network: 'eip155:4663',
} as const;

/* ------------------------------------------------------------------ */
/*  KONTRAKTY                                                          */
/* ------------------------------------------------------------------ */

/**
 * `expects` mowi, CZEGO SIE SPODZIEWAMY pod adresem - i to jest cala roznica
 * miedzy uzyteczna konsola a sciana czerwieni:
 *   'code'    - to ma byc kontrakt. Brak kodu = ALARM.
 *   'no-code' - wiemy, ze kodu tam nie ma (portfel albo znany martwy wpis
 *               w konfiguracji). Brak kodu = stan normalny, cisza.
 *               POJAWIENIE SIE kodu jest natomiast warte uwagi.
 *   'probe'   - sprawdzenie rozstrzygajace, gdzie ten adres wlasciwie stoi.
 *               Zaden wynik nie jest awaria; obie odpowiedzi sa informacja.
 *   'delegated' - portfel, pod ktorym STOI JUZ delegacja EIP-7702 i wiemy o tym.
 *               Delegacja na miejscu = stan zapisany, cisza. Jej ZNIKNIECIE
 *               albo zamiana na zwykly bajtkod = zmiana warta uwagi.
 *
 * Cztery adresy bez kodu sa oznaczone jako ZNANE swiadomie: gdyby krzyczaly
 * przy kazdym wejsciu, po tygodniu nikt nie patrzylby na te liste w ogole.
 */
export interface WatchedContract {
  key: string;
  address: Address;
  chainId: number;
  label: string;
  /** Skad w repo pochodzi ten adres - zeby dalo sie sprawdzic bez grepowania. */
  source: string;
  expects: 'code' | 'no-code' | 'probe' | 'delegated';
  /** Wyjasnienie dla wpisow 'no-code' i 'probe'. */
  note?: string;
}

export const WATCHED_CONTRACTS: WatchedContract[] = [
  /* --- wdrozone przez nas --- */
  { key: 'askescrow-8453', address: '0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340', chainId: 8453, expects: 'code',
    label: 'AskEscrow', source: 'deployments/askEscrow.8453.json' },
  { key: 'askescrow-84532', address: '0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6', chainId: 84532, expects: 'code',
    label: 'AskEscrow (testnet)', source: 'deployments/askEscrow.84532.json' },
  { key: 'robinhoodpost-4663', address: '0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6', chainId: 4663, expects: 'code',
    label: 'RobinhoodPostContract', source: 'app/basechat/Robinhood/deployment-info.json' },
  { key: 'paidpin-8453', address: '0x163bd9Ec5267491963163dE70D0B64f9400a20AD', chainId: 8453, expects: 'code',
    label: 'PaidPin', source: 'app/basechat/PinnedJobs/config/contractConfig.ts' },
  { key: 'post2-8453', address: '0x6e1811A5401dfC30E8F3E2DD9dE0Bbe156F97aC7', chainId: 8453, expects: 'code',
    label: 'PostContract2', source: 'app/contracts/PostContract2.ts:201' },
  { key: 'post2-84532', address: '0x6e1811A5401dfC30E8F3E2DD9dE0Bbe156F97aC7', chainId: 84532, expects: 'probe',
    label: 'PostContract2 (declared testnet)', source: 'app/contracts/PostContract2.ts:202',
    note: 'The same address is declared for both networks in one file. This row only answers which of the two declarations is real.' },
  { key: 'camppost-484', address: '0x71bE438ee579de33EBf353579A413439Db042CA5', chainId: 484, expects: 'code',
    label: 'CampPostv1', source: 'app/contracts/BaseCampPostContract.ts:27' },
  { key: 'portalnft-484', address: '0x57CC99c9E1942a34a0cfF7FCC27c227455f14587', chainId: 484, expects: 'code',
    label: 'Portal NFT', source: 'app/basechat/components/BaseCampPosts/ClaimPortalBanner.tsx' },
  { key: 'celopost-42220', address: '0xA79651c953A987C815b3f5b82b69492e437CcFED', chainId: 42220, expects: 'code',
    label: 'CeloPostContract', source: 'app/basechat/Celo/contracts/CeloPostContract.ts' },
  { key: 'ethpost-1', address: '0x7c4C79176dc098Fb304E4AcD4e93b1a1DfCF1749', chainId: 1, expects: 'code',
    label: 'EthereumPostContract', source: 'app/basechat/ETH/contracts/EthereumPostContract.ts' },
  { key: 'lineapost-59144', address: '0x9fB36660849D85CEe6609f6020af3336aB7541f5', chainId: 59144, expects: 'code',
    label: 'LineaPostContract', source: 'app/basechat/Linea/contracts/LineaPostContract.ts' },
  { key: 'worldpost-480', address: '0xFF426EA2f562C6866edA81981C2420bC574eA2DF', chainId: 480, expects: 'code',
    label: 'WorldChainPostContract', source: 'app/basechat/World/contracts/WorldChainPostContract.ts' },
  { key: 'basemorning-84532', address: '0xdaD4777b825548F3eeAD4bc6cAC8499ca2776fC2', chainId: 84532, expects: 'code',
    label: 'BaseMorningGame', source: 'app/basemorning/config/contract.ts' },

  /* --- obce kontrakty, ktore wolamy --- */
  { key: 'usdc-8453', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chainId: 8453, expects: 'code',
    label: 'USDC (Base)', source: 'app/utils/monetization/verifyPayment.ts' },
  { key: 'usdc-84532', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', chainId: 84532, expects: 'code',
    label: 'USDC (Base Sepolia)', source: 'deployments/askEscrow.84532.json' },
  { key: 'usdg-4663', address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', chainId: 4663, expects: 'code',
    label: 'USDG', source: 'app/api/asks/pricing.ts' },
  { key: 'wld-480', address: '0x2cFc85d8E48F8EAB294be644d9E25C3030863003', chainId: 480, expects: 'code',
    label: 'WLD', source: 'app/basechat/components/TipNetworkConfig.ts' },
  { key: 'linea-59144', address: '0x1789e0043623282d5dcc7f213d703c6d8bafbb04', chainId: 59144, expects: 'code',
    label: 'LINEA token', source: 'app/basechat/components/TipNetworkConfig.ts' },
  { key: 'l2resolver-8453', address: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD', chainId: 8453, expects: 'code',
    label: 'L2Resolver Basenames', source: 'app/utils/identity/resolver.ts' },
  { key: 'l2resolver-84532', address: '0x6533C94869D28fAA8dF77cc63f9e2b2D6Cf77eBA', chainId: 84532, expects: 'code',
    label: 'L2Resolver Basenames (testnet)', source: 'app/utils/identity/resolver.ts' },

  /* --- ZNANE BRAKI KODU ---
   * To NIE jest awaria i nie ma prawa krzyczec. Kazdy z tych trzech adresow
   * zostal sprawdzony (scripts/verifyOnchainInventory.js) i nie ma pod nim
   * bajtkodu na deklarowanej sieci. Zostaja na liscie, bo sa w konfiguracji
   * aplikacji - a wpis w konfiguracji, o ktorym nikt nie pamieta, jest gorszy
   * niz wpis widoczny i opisany.
   *
   * Byl tu czwarty: 'cdpfactory-84532' (0x0222ffA0...b5B0c1, "CDP smart account
   * factory"). Zszedl, bo aplikacja juz go nie zawiera - app/api/cdp/wallet
   * /route.ts przeszedl na `enableSpendPermissions` z SDK i zaden plik nie
   * podaje tego adresu. Trzymanie go tutaj znaczyloby, ze konsola ops wskazuje
   * `source`, ktorego nie ma, czyli klamie o wlasnej konfiguracji. */
  { key: 'ipnft-484', address: '0xF90733b9eCDa3b49C250B2C3E3E42c96fC93324E', chainId: 484, expects: 'no-code',
    label: 'DEFAULT_IP_NFT_CONTRACT', source: 'app/marketplace/config/simpleMarketplace.ts',
    note: 'Known: no bytecode at this address on Camp. The marketplace config points at nothing.' },
  { key: 'ipmarket-484', address: '0xf528f920d0ce1d1ea230b0ec10f0f64b8f43cbac', chainId: 484, expects: 'no-code',
    label: 'SimpleIPNFTMarketplace', source: 'app/marketplace/config/simpleMarketplace.ts',
    note: 'Known: no bytecode at this address on Camp.' },
  { key: 'vrf-84532', address: '0x2Ca8E0C643bDe4C2E08ab1fA0da3401AdAD7734D', chainId: 84532, expects: 'no-code',
    label: 'Chainlink VRF Coordinator', source: 'app/basemorning/test/BaseMorningGame.test.ts',
    note: 'Known: no bytecode on Base Sepolia. Test fixture only - production never calls it.' },

  /* --- portfele: sprawdzane po to, by potwierdzic, ze to NIE sa kontrakty --- */
  /*
   * Skarbiec MA juz zainstalowana delegacje EIP-7702 (23 bajty z prefiksem
   * 0xef0100) - sprawdzone na Base przy budowie tej konsoli. To normalne dla
   * smart walletu i NIE jest awaria, wiec wpis jest 'delegated', a nie
   * 'no-code'; inaczej ten wiersz swiecilby na czerwono w nieskonczonosc,
   * a wiersz, ktory zawsze swieci, przestaje cokolwiek znaczyc.
   */
  { key: 'eoa-treasury-8453', address: '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd', chainId: 8453, expects: 'delegated',
    label: 'Treasury wallet', source: 'app/basechat/PinnedJobs/components/PaidPinModal.tsx',
    note: 'Recorded state: an EIP-7702 delegation is installed on this wallet. Normal for a smart wallet. If it changes, that is worth knowing.' },
  { key: 'eoa-admin-8453', address: '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e', chainId: 8453, expects: 'no-code',
    label: 'Admin wallet', source: 'app/utils/firebase.ts',
    note: 'A wallet. Bytecode appearing here would mean a delegation or a takeover, which is why it is checked at all.' },
];
