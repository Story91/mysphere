import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import { LINEA_CONFIG } from './config/LineaNetworkConfig';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    linea: {
      url: LINEA_CONFIG.rpcUrl,
      chainId: LINEA_CONFIG.chainId,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 'auto',
      gas: 'auto',
      timeout: 120000, // 2 minuty timeout
    },
    // Backup RPC dla Linea
    'linea-backup': {
      url: 'https://linea.drpc.org',
      chainId: LINEA_CONFIG.chainId,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      linea: LINEA_CONFIG.etherscanApiKey, // Twój klucz Etherscan API
    },
    customChains: [
      {
        network: 'linea',
        chainId: LINEA_CONFIG.chainId,
        urls: {
          apiURL: LINEA_CONFIG.explorerApiUrl,
          browserURL: LINEA_CONFIG.explorerUrl,
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  paths: {
    sources: './app/basechat/Linea/contracts',
    tests: './app/basechat/Linea/test',
    cache: './app/basechat/Linea/cache',
    artifacts: './app/basechat/Linea/artifacts',
  },
};

export default config;