/**
 * ZeroDev Configuration
 * Settings for ZeroDev Account Abstraction integration
 */

export const ZERODEV_CONFIG = {
  // Base network configuration
  CHAIN_ID: 8453, // Base mainnet
  CHAIN_NAME: 'base',
  
  // ZeroDev endpoints (Base mainnet)
  BUNDLER_URL: process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL || 'https://rpc.zerodev.app/api/v2/bundler/8453',
  PAYMASTER_URL: process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL || 'https://rpc.zerodev.app/api/v2/paymaster/8453',
  
  // Entry point address (ERC-4337)
  ENTRYPOINT_ADDRESS: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const,
  
  // Gas sponsorship settings
  GAS_SPONSORSHIP: {
    enabled: true,
    maxGasLimit: '500000', // 500k gas limit
    maxFeePerGas: '1000000000', // 1 gwei
    maxPriorityFeePerGas: '1000000000' // 1 gwei
  },
  
  // Smart wallet settings
  SMART_WALLET: {
    // Kernel account plugin configuration
    plugins: {
      sudo: true, // ECDSA validator as sudo plugin
      // Add more plugins here as needed
    },
    
    // Transaction batching
    batching: {
      enabled: true,
      maxBatchSize: 10 // Maximum transactions per batch
    }
  }
};

// Environment variables required
export const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_ZERODEV_BUNDLER_URL',
  'NEXT_PUBLIC_ZERODEV_PAYMASTER_URL',
  'NEXT_PUBLIC_BASE_RPC_URL'
];

// Validate environment variables
export function validateZeroDevConfig(): boolean {
  const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn('⚠️ Missing ZeroDev environment variables:', missingVars);
    console.warn('Using default ZeroDev endpoints for Base mainnet');
    return false;
  }
  
  return true;
}

// Get ZeroDev project ID from environment
export function getZeroDevProjectId(): string | null {
  return process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID || null;
}

// Check if ZeroDev is properly configured
export function isZeroDevConfigured(): boolean {
  return validateZeroDevConfig() && !!getZeroDevProjectId();
}
