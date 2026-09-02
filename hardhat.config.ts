require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ethers");
require("@typechain/hardhat");
require("hardhat-gas-reporter");
require("solidity-coverage");
// Projekt trzyma konfiguracje w .env.local (tam siedzi PRIVATE_KEY do deployu),
// a dotenv domyslnie czyta tylko .env - stad jawna sciezka. `.env` zostaje jako
// fallback, zeby nie zepsuc istniejacych ustawien.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

/**
 * Klucz deployera.
 *
 * ADMIN_PRIVATE_KEY jest wiodacy - to portfel administracyjny, ktory wdraza
 * kontrakty i jest jednoczesnie odbiorca platnosci x402. PRIVATE_KEY zostaje
 * jako fallback dla starszych ustawien, zeby nikomu nie zepsuc lokalnego setupu.
 *
 * ZADEN z tych kluczy NIE MOZE dostac prefiksu NEXT_PUBLIC_ - z nim wartosc
 * trafilaby do publicznego bundle'a JS, czyli klucz prywatny portfela
 * administracyjnego bylby do pobrania z przegladarki.
 *
 * Hardhat wymaga postaci 0x-prefiksowanej; klucze kopiowane z portfeli bywaja
 * bez prefiksu, wiec normalizujemy zamiast wywalac sie na "invalid private key".
 */
function deployerAccounts() {
  const raw = (process.env.ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY || "").trim();
  if (!raw) return [];
  return [raw.startsWith("0x") ? raw : `0x${raw}`];
}

const config = {
  /**
   * DWA KOMPILATORY, I TO NIE JEST DOWOLNOSC.
   *
   * 0.8.20 zostaje pierwszy i z NIETKNIETYMI ustawieniami - wszystkie nasze
   * kontrakty maja `pragma solidity 0.8.20`, wiec kompiluja sie dokladnie tak
   * jak dotad i wychodzi z nich ten sam bajtkod. Dopisanie drugiego wpisu nic
   * im nie zmienia: hardhat dobiera kompilator po pragmie pliku.
   *
   * 0.8.26 jest tu WYLACZNIE dla Uniswapa v4 (contracts/vendor/), ktory wymaga
   * transient storage i na 0.8.20 sie nie skompiluje. Ustawienia przepisane co
   * do liczby z foundry.toml samego Uniswapa: 44 444 444 przebiegi
   * optymalizatora, viaIR, evmVersion cancun. To nie jest przesada - PoolManager
   * ociera sie o limit 24 kB z EIP-170 i przy mniejszych `runs` po prostu sie
   * NIE MIESCI, a dowiedzielibysmy sie o tym dopiero przy wdrozeniu.
   */
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
          viaIR: true
        }
      },
      {
        version: "0.8.26",
        settings: {
          optimizer: {
            enabled: true,
            runs: 44_444_444
          },
          viaIR: true,
          evmVersion: "cancun"
        }
      }
    ]
  },
  paths: {
    // Jedno drzewo kontraktow. Wczesniej wskazywalo na ./camp-contract, wiec
    // `npx hardhat compile` NIE WIDZIALO ./contracts - AskEscrow.sol nie dalo
    // sie skompilowac ani przetestowac standardowa komenda. Pliki Campa
    // przeniesione tutaj; skrypty wdrozeniowe wolaja getContractFactory po
    // NAZWIE, nie po sciezce, wiec przeniesienie ich nie dotyka.
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: deployerAccounts(),
      chainId: 84532
    },
    base: {
      // Kolejnosc: jawny BASE_RPC_URL -> dedykowany wezel Coinbase Developer
      // Platform (klucz OnchainKit z .env.local; darmowe publiczne RPC padaly
      // pod seria transakcji keepera: mainnet.base.org mieszal stan miedzy
      // wezlami, publicnode blokowal paragony, drpc dawal 429) -> publiczny.
      url:
        process.env.BASE_RPC_URL ||
        (process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY
          ? `https://api.developer.coinbase.com/rpc/v1/base/${process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}`
          : "https://mainnet.base.org"),
      accounts: deployerAccounts(),
      chainId: 8453
    },
    "base-goerli": {
      url: process.env.BASE_GOERLI_RPC_URL || "https://goerli.base.org",
      accounts: deployerAccounts(),
      chainId: 84531
    },
    // Robinhood Chain - L2 na Arbitrum Orbit, ETH jako gas.
    // Publiczny RPC jest rate-limited i oficjalnie nie jest zalecany pod
    // produkcje - do deployu wystarczy, ale przy wiekszym ruchu wstaw wlasny
    // endpoint przez ROBINHOOD_RPC_URL.
    robinhood: {
      url: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      accounts: deployerAccounts(),
      chainId: 4663,
    },
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
      accounts: deployerAccounts(),
      chainId: 46630,
    },
    /**
     * Arc testnet (Circle). GAZ PLACI SIE W USDC, nie w ETH - jednostka
     * natywna ma 18 miejsc jak wei, a ten sam pieniadz widziany przez
     * interfejs ERC-20 pod 0x3600...0000 ma 6. Zmierzone 2026-08-13: blok co
     * 0,51 s, gaz 21 gwei, czyli zwykla transakcja kosztuje 0,003 USDC.
     *
     * `maxFeePerGas` musi wynosic co najmniej 20 gwei - ponizej tego progu
     * transakcja albo wisi, albo zostaje odrzucona (docs.arc.io, gas-and-fees).
     * Dlatego nie zostawiamy tu automatu z domyslnym zerem.
     */
    arcTestnet: {
      // Blockdaemon, a nie rpc.testnet.arc.network. Ten drugi oddaje HTTP 429
      // przy kilkudziesieciu transakcjach z rzedu - przebieg tlumu wywrocil sie
      // na nim w PODSUMOWANIU, czyli juz po wyslaniu wszystkich transakcji.
      // Praca zrobiona, raportu brak - najgorsze mozliwe miejsce na blad.
      // To ten sam endpoint, ktory jako jedyny daje okno 50 000 na eth_getLogs.
      url: process.env.ARC_TESTNET_RPC_URL || "https://rpc.blockdaemon.testnet.arc.io",
      accounts: deployerAccounts(),
      chainId: 5042002,
    },
    linea: {
      url: process.env.LINEA_RPC_URL || "https://linea-rpc.publicnode.com",
      accounts: deployerAccounts(),
      chainId: 59144,
      gasPrice: "auto",
      gas: "auto",
      timeout: 120000
    },
    "camp-mainnet": {
      url: process.env.CAMP_MAINNET_RPC_URL || "https://rpc.camp.raas.gelato.cloud",
      accounts: deployerAccounts(),
      chainId: 484
    },
    "camp": {
      url: process.env.CAMP_RPC_URL || "https://rpc.camp.raas.gelato.cloud",
      accounts: deployerAccounts(),
      chainId: 484,
      gasPrice: "auto",
      gas: "auto",
      timeout: 120000
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || process.env.BASESCAN_API_KEY || "",
    // Etherscan V2 rozlicza JEDNYM kluczem etherscan.io dla wszystkich
    // lancuchow, a hardhat-verify sam buduje adres z chainId. Byla tu mapa
    // klucz-per-siec (V1) i wpisy customChains z adresami api.basescan.org -
    // przez to `hardhat verify` odbijalo sie najpierw komunikatem
    // "deprecated V1 endpoint", a po podmianie adresow na V2 gubilo parametr
    // chainid, bo biblioteka doklada wlasna sciezke i ucina query string.
    //
    // Wpisy Blockscouta (camp, robinhood) zostaja w customChains - one nie sa
    // Etherscanem i maja wlasne adresy. Klucz ignoruja.
    customChains: [
      // Etherscan V2: JEDEN endpoint dla wszystkich lancuchow, chainId
      // w zapytaniu. Bylo tu `api-sepolia.basescan.org/api` i `api.basescan.org/api`
      // (V1), przez co `hardhat verify` odbijalo sie komunikatem "You are using
      // a deprecated V1 endpoint". Wpis `linea` nizej byl juz zmigrowany -
      // te dwa zostaly w tyle.
      {
        network: "linea",
        chainId: 59144,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=59144",
          browserURL: "https://lineascan.build"
        }
      },
      {
        network: "camp",
        chainId: 484,
        urls: {
          apiURL: "https://camp.cloud.blockscout.com/api",
          browserURL: "https://camp.cloud.blockscout.com"
        }
      },
      // Robinhood Chain weryfikuje przez Blockscout - potwierdzone w
      // docs.robinhood.com/chain/deploy-smart-contracts. Bez tego wpisu
      // `npx hardhat verify --network robinhood` nie ma dokad wyslac zrodla.
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com"
        }
      },
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com"
        }
      }
    ]
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6"
  },
  gasReporter: {
    enabled: true,
    currency: "USD"
  },
  sourcify: {
    // WYLACZONE swiadomie. Sourcify ma API v1 w zaplanowanym wylaczeniu
    // (brownout do 2027-01-08) i odpowiada 503 na kazde zadanie. Przy
    // wlaczonym Sourcify `hardhat verify` konczy sie bledem TAKZE wtedy, gdy
    // weryfikacja na Etherscanie sie POWIODLA - a wtedy nikt nie czyta wyzej
    // i udane wdrozenie wyglada na zepsute.
    //
    // Wlaczyc z powrotem, gdy hardhat-verify bedzie umial API v2 Sourcify.
    enabled: false
  }
};

module.exports = config; 