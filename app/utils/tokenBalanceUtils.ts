import { formatUnits } from 'viem';

export interface TokenBalance {
  symbol: string;
  balance: string;
  decimals: number;
  valueUSD?: string;
  contractAddress?: string;
  name?: string;
  imageUrl?: string;
  marketCap?: string;
  volume24h?: string;
  priceUSD?: string;
}

export interface ExtendedTokenInfo {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  imageUrl?: string;
  marketCap?: string;
  volume24h?: string;
  priceUSD?: string;
  createdAt?: string;
}

// Contract addresses for Base network
export const BASE_TOKEN_ADDRESSES = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'
} as const;

// ERC20 ABI for balance checking
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function'
  }
] as const;

export class TokenBalanceFetcher {
  private rpcUrl: string;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 500; // Increased to 500ms between requests
  private fallbackRpcUrls: string[] = [
    'https://base.drpc.org',
    'https://base.blockpi.network/v1/rpc/public',
    'https://1rpc.io/base',
    'https://mainnet.base.org'
  ];
  private currentRpcIndex: number = 0;

  constructor(rpcUrl?: string) {
    this.rpcUrl = rpcUrl || this.fallbackRpcUrls[0];
  }

  private async makeRpcCall(method: string, params: any[]): Promise<any> {
    // Rate limiting - wait if needed
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: 1,
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.result;
  }

  private switchToNextRpc(): void {
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.fallbackRpcUrls.length;
    this.rpcUrl = this.fallbackRpcUrls[this.currentRpcIndex];
    console.log(`Switched to RPC: ${this.rpcUrl}`);
  }

  private async makeRpcCallWithRetry(method: string, params: any[], maxRetries: number = 3): Promise<any> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.makeRpcCall(method, params);
      } catch (error) {
        console.warn(`RPC call attempt ${i + 1} failed:`, error);
        
        // If rate limited, try switching RPC endpoint
        if (error instanceof Error && (error.message.includes('rate limit') || error.message.includes('429'))) {
          this.switchToNextRpc();
        }
        
        if (i === maxRetries - 1) throw error;
        
        // Increased exponential backoff for rate limiting
        const delay = Math.min(2000 * Math.pow(2, i), 10000); // Start with 2s, max 10s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Fetch ETH balance for a given address
   */
  async getEthBalance(address: string): Promise<TokenBalance> {
    try {
      const balanceHex = await this.makeRpcCallWithRetry('eth_getBalance', [address, 'latest']);
      const balanceWei = BigInt(balanceHex);
      const balanceEth = formatUnits(balanceWei, 18);

      return {
        symbol: 'ETH',
        balance: balanceEth,
        decimals: 18,
      };
    } catch (error) {
      console.error('Error fetching ETH balance:', error);
      return {
        symbol: 'ETH',
        balance: '0',
        decimals: 18,
      };
    }
  }

  /**
   * Fetch ERC20 token balance for a given address and token contract
   */
  async getTokenBalance(address: string, tokenContract: string, symbol: string): Promise<TokenBalance> {
    try {
      // Create the function selector for balanceOf(address)
      const functionSelector = '0x70a08231'; // balanceOf function selector
      const paddedAddress = address.slice(2).padStart(64, '0'); // Remove 0x and pad to 32 bytes
      const data = functionSelector + paddedAddress;

      const balanceHex = await this.makeRpcCallWithRetry('eth_call', [
        {
          to: tokenContract,
          data: data,
        },
        'latest',
      ]);

      // Get decimals
      const decimalsSelector = '0x313ce567'; // decimals function selector
      const decimalsHex = await this.makeRpcCallWithRetry('eth_call', [
        {
          to: tokenContract,
          data: decimalsSelector,
        },
        'latest',
      ]);

      const decimals = parseInt(decimalsHex, 16);
      const balanceWei = BigInt(balanceHex);
      const balance = formatUnits(balanceWei, decimals);

      return {
        symbol,
        balance,
        decimals,
        contractAddress: tokenContract,
      };
    } catch (error) {
      console.error(`Error fetching ${symbol} balance:`, error);
      return {
        symbol,
        balance: '0',
        decimals: 18,
        contractAddress: tokenContract,
      };
    }
  }

  /**
   * Fetch all token balances for the common tokens (ETH, WETH, USDC)
   */
  async getAllTokenBalances(address: string): Promise<TokenBalance[]> {
    try {
      const [ethBalance, wethBalance, usdcBalance] = await Promise.all([
        this.getEthBalance(address),
        this.getTokenBalance(address, BASE_TOKEN_ADDRESSES.WETH, 'WETH'),
        this.getTokenBalance(address, BASE_TOKEN_ADDRESSES.USDC, 'USDC'),
      ]);

      return [ethBalance, wethBalance, usdcBalance];
    } catch (error) {
      console.error('Error fetching all token balances:', error);
      return [
        { symbol: 'ETH', balance: '0', decimals: 18 },
        { symbol: 'WETH', balance: '0', decimals: 18, contractAddress: BASE_TOKEN_ADDRESSES.WETH },
        { symbol: 'USDC', balance: '0', decimals: 6, contractAddress: BASE_TOKEN_ADDRESSES.USDC },
      ];
    }
  }

  /**
   * Fetch tokens from Basescan API
   */
  async getTokensFromBasescan(address: string): Promise<ExtendedTokenInfo[]> {
    try {
      const API_KEY = process.env.NEXT_PUBLIC_BASESCAN_API_KEY;
      if (!API_KEY) {
        console.warn('Basescan API key not found');
        return [];
      }

      // Get token transactions to find all tokens the address has interacted with
      const response = await fetch(
        `https://api.basescan.org/api?module=account&action=tokentx&address=${address}&page=1&offset=1000&sort=desc&apikey=${API_KEY}`
      );
      
      if (!response.ok) {
        console.warn(`Basescan API HTTP error: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      
      if (data.status !== '1' || !data.result) {
        console.warn('No token transactions found on Basescan');
        return [];
      }

      // Get unique contract addresses
      const contractAddresses = new Set<string>();
      data.result.forEach((tx: any) => {
        if (tx.contractAddress && tx.to?.toLowerCase() === address.toLowerCase()) {
          contractAddresses.add(tx.contractAddress);
        }
      });

      // Fetch balance and metadata for each token (limit to avoid rate limiting)
      const tokens: ExtendedTokenInfo[] = [];
      const contractAddressArray = Array.from(contractAddresses).slice(0, 10); // Reduce from 20 to 10
      
      for (const contractAddress of contractAddressArray) {
        try {
          // Get token balance
          const balanceResponse = await fetch(
            `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${address}&tag=latest&apikey=${API_KEY}`
          );
          const balanceData = await balanceResponse.json();
          
          if (balanceData.status === '1' && balanceData.result && balanceData.result !== '0') {
            // Get token info using our RPC method
            try {
              // Get symbol
              const symbolSelector = '0x95d89b41'; // symbol() function selector
              const symbolHex = await this.makeRpcCallWithRetry('eth_call', [
                {
                  to: contractAddress,
                  data: symbolSelector,
                },
                'latest',
              ]);

              // Get name
              const nameSelector = '0x06fdde03'; // name() function selector
              const nameHex = await this.makeRpcCallWithRetry('eth_call', [
                {
                  to: contractAddress,
                  data: nameSelector,
                },
                'latest',
              ]);

              // Get decimals
              const decimalsSelector = '0x313ce567'; // decimals() function selector
              const decimalsHex = await this.makeRpcCallWithRetry('eth_call', [
                {
                  to: contractAddress,
                  data: decimalsSelector,
                },
                'latest',
              ]);

              const decimals = parseInt(decimalsHex, 16) || 18;
              const balance = formatUnits(BigInt(balanceData.result), decimals);
              
              // Decode hex strings to readable text
              const symbol = this.decodeHexString(symbolHex) || 'UNKNOWN';
              const name = this.decodeHexString(nameHex) || 'Unknown Token';

              // Only add tokens with significant balance
              if (parseFloat(balance) > 0.000001) {
                tokens.push({
                  address: contractAddress,
                  symbol,
                  name,
                  balance,
                  decimals,
                });
              }
            } catch (metadataError) {
              console.warn(`Failed to get metadata for token ${contractAddress}:`, metadataError);
            }
          }
        } catch (tokenError) {
          console.warn(`Failed to process token ${contractAddress}:`, tokenError);
        }
      }

      return tokens;
    } catch (error) {
      console.error('Error fetching tokens from Basescan:', error);
      return [];
    }
  }

  /**
   * Decode hex string to readable text
   */
  private decodeHexString(hex: string): string {
    try {
      if (!hex || hex === '0x') return '';
      
      // Remove 0x prefix
      const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
      
      // For dynamic types like string, skip the first 64 chars (offset and length)
      let textHex = cleanHex;
      if (cleanHex.length > 128) {
        // Skip offset (32 bytes) and length (32 bytes), get actual string
        const lengthHex = cleanHex.slice(64, 128);
        const length = parseInt(lengthHex, 16) * 2; // Convert to hex length
        textHex = cleanHex.slice(128, 128 + length);
      }
      
      // Convert hex to ASCII
      let result = '';
      for (let i = 0; i < textHex.length; i += 2) {
        const byte = parseInt(textHex.substr(i, 2), 16);
        if (byte > 0) { // Skip null bytes
          result += String.fromCharCode(byte);
        }
      }
      
      return result.trim();
    } catch (error) {
      console.warn('Error decoding hex string:', error);
      return '';
    }
  }

  /**
   * Fallback method using only Basescan API without RPC calls
   */
  async getTokensFromBasescanOnly(address: string): Promise<ExtendedTokenInfo[]> {
    try {
      const API_KEY = process.env.NEXT_PUBLIC_BASESCAN_API_KEY;
      if (!API_KEY) {
        console.warn('Basescan API key not found');
        return [];
      }

      // Get token transactions to find all tokens
      const response = await fetch(
        `https://api.basescan.org/api?module=account&action=tokentx&address=${address}&page=1&offset=500&sort=desc&apikey=${API_KEY}`
      );
      
      if (!response.ok) {
        console.warn(`Basescan API HTTP error: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      
      if (data.status !== '1' || !data.result) {
        console.warn('No token transactions found on Basescan');
        return [];
      }

      // Create a map of unique tokens with their latest transaction data
      const tokenMap = new Map<string, any>();
      
      data.result.forEach((tx: any) => {
        if (tx.contractAddress && tx.to?.toLowerCase() === address.toLowerCase()) {
          const key = tx.contractAddress.toLowerCase();
          if (!tokenMap.has(key) || new Date(tx.timeStamp * 1000) > new Date(tokenMap.get(key).timeStamp * 1000)) {
            tokenMap.set(key, tx);
          }
        }
      });

      // Format tokens using transaction data (no RPC calls needed)
      const tokens: ExtendedTokenInfo[] = [];
      
      for (const [contractAddress, tx] of tokenMap.entries()) {
        try {
          // Use transaction data for token info
          const decimals = parseInt(tx.tokenDecimal) || 18;
          const balance = formatUnits(BigInt(tx.value || '0'), decimals);
          
          if (parseFloat(balance) > 0.000001) {
            tokens.push({
              address: contractAddress,
              symbol: tx.tokenSymbol || 'UNKNOWN',
              name: tx.tokenName || 'Unknown Token',
              balance,
              decimals,
            });
          }
        } catch (error) {
          console.warn(`Failed to process token ${contractAddress}:`, error);
        }
      }

      return tokens;
    } catch (error) {
      console.error('Error fetching tokens from Basescan only:', error);
      return [];
    }
  }

  /**
   * Fetch all tokens from wallet using multiple sources
   * Combines Zora SDK and Basescan API for complete coverage
   */
  async getAllWalletTokens(address: string): Promise<ExtendedTokenInfo[]> {
    try {
      // First try with RPC calls
      try {
        const [zoraTokens, basescanTokens] = await Promise.all([
          this.getTokensFromZora(address),
          this.getTokensFromBasescan(address)
        ]);

        // Combine and deduplicate tokens by contract address
        const tokenMap = new Map<string, ExtendedTokenInfo>();
        
        // Add Zora tokens first (they have more metadata)
        zoraTokens.forEach(token => {
          if (token.address) {
            tokenMap.set(token.address.toLowerCase(), token);
          }
        });
        
        // Add Basescan tokens, but don't overwrite Zora data
        basescanTokens.forEach(token => {
          const key = token.address.toLowerCase();
          if (!tokenMap.has(key)) {
            tokenMap.set(key, token);
          }
        });

        const result = Array.from(tokenMap.values());
        
        if (result.length > 0) {
          return result;
        }
      } catch (rpcError) {
        console.warn('RPC method failed, falling back to Basescan-only:', rpcError);
      }
      
      // Fallback to Basescan-only method (no RPC calls)
      console.log('Using Basescan-only fallback method');
      const [zoraTokens, basescanOnlyTokens] = await Promise.all([
        this.getTokensFromZora(address).catch(() => []),
        this.getTokensFromBasescanOnly(address)
      ]);

      // Combine results
      const tokenMap = new Map<string, ExtendedTokenInfo>();
      
      zoraTokens.forEach(token => {
        if (token.address) {
          tokenMap.set(token.address.toLowerCase(), token);
        }
      });
      
      basescanOnlyTokens.forEach(token => {
        const key = token.address.toLowerCase();
        if (!tokenMap.has(key)) {
          tokenMap.set(key, token);
        }
      });

      return Array.from(tokenMap.values());
    } catch (error) {
      console.error('Error fetching wallet tokens:', error);
      return [];
    }
  }

  /**
   * Fetch tokens from Zora SDK (original method)
   */
  private async getTokensFromZora(address: string): Promise<ExtendedTokenInfo[]> {
    try {
      // Import the function dynamically to avoid circular dependencies
      const { getProfileBalances } = await import('@zoralabs/coins-sdk');
      
      const result = await getProfileBalances({
        identifier: address,
        count: 100 // Get up to 100 tokens
      });
      
      const tokenData = result.data?.profile?.coinBalances?.edges || [];
      
      const formattedTokens = tokenData
        .filter((edge: any) => edge?.node?.coin && edge.node.balance)
        .map((edge: any) => {
          const coin = edge.node.coin;
          const balance = edge.node.balance;
          
          return {
            address: coin.address || '',
            symbol: coin.symbol || 'UNKNOWN',
            name: coin.name || 'Unknown Token',
            balance: formatUnits(BigInt(balance), coin.decimals || 18),
            decimals: coin.decimals || 18,
            imageUrl: coin.media?.previewImage || coin.media?.medium,
            marketCap: coin.marketCap,
            volume24h: coin.volume24h,
            priceUSD: coin.priceUSD,
            createdAt: coin.createdAt,
          };
        })
        .filter((token: ExtendedTokenInfo) => {
          // Filter out tokens with zero balance or very small balances
          const balanceNum = parseFloat(token.balance);
          return balanceNum > 0.000001;
        });

      return formattedTokens;
    } catch (error) {
      console.error('Error fetching tokens from Zora:', error);
      return [];
    }
  }

  /**
   * Format balance for display with proper decimals
   */
  static formatBalance(balance: string, maxDecimals: number = 6): string {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.000001) return '< 0.000001';
    return num.toFixed(maxDecimals).replace(/\.?0+$/, '');
  }

  /**
   * Get estimated USD value for tokens (placeholder - could integrate with price APIs)
   */
  static async getEstimatedUSDValue(balance: string, symbol: string): Promise<string> {
    // This is a simplified version - in production you'd integrate with a price API
    try {
      const amount = parseFloat(balance);
      if (amount === 0) return '$0.00';

      // Mock prices for demonstration
      const mockPrices: Record<string, number> = {
        ETH: 3500,
        WETH: 3500,
        USDC: 1,
      };

      const price = mockPrices[symbol] || 0;
      const value = amount * price;
      
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(value);
    } catch (error) {
      return '$0.00';
    }
  }
}

export const tokenBalanceFetcher = new TokenBalanceFetcher();
