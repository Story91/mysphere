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
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  paths: {
    sources: "./camp-contract",
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
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
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
    apiKey: {
      "base-sepolia": process.env.BASESCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
      "base-goerli": process.env.BASESCAN_API_KEY || "",
      linea: "HSHV72NNW6KVQA88YB5BFSZHTVPFWC2GJU",
      "camp": "empty",
      // Blockscout nie sprawdza klucza, ale hardhat-verify wymaga wpisu.
      robinhood: "empty",
      robinhoodTestnet: "empty"
    },
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "base-goerli",
        chainId: 84531,
        urls: {
          apiURL: "https://api-goerli.basescan.org/api",
          browserURL: "https://goerli.basescan.org"
        }
      },
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
    enabled: true
  }
};

module.exports = config; 