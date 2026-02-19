// Coinbase CDP Node RPC + Etherscan API V2 for Base
// CDP for: ETH balance, transaction count
// Etherscan V2 for: Token list, NFT list, Transaction history

const CDP_RPC_URL = 'https://api.developer.coinbase.com/rpc/v1/base/oMc2GB9cTF7I8zaD11NHTuIVDxECmWz1';

// Etherscan API V2 - supports all chains via chainid
// API key from etherscan.io (works for all chains including Base)
const ETHERSCAN_API_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || '1QU7WWC7EKAVKKB9PV3S7H62JZPS2G5JXW';
const BASE_CHAIN_ID = 8453; // Base Mainnet

// --- Types ---

interface RPCRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: any[];
}

interface RPCResponse<T = any> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

export interface TokenInfo {
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  balance?: string;
}

export interface NFTInfo {
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenID: string;
}

export interface TransactionInfo {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  isError: string;
  functionName?: string;
  input?: string; // Transaction input data (0x for simple transfer, longer for contract calls)
  methodId?: string;
}

// --- CDP Node RPC Methods ---

async function cdpRpcCall<T>(method: string, params: any[] = []): Promise<T> {
  const request: RPCRequest = {
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  };

  const response = await fetch(CDP_RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const data: RPCResponse<T> = await response.json();

  if (data.error) {
    throw new Error(`CDP RPC Error: ${data.error.message}`);
  }

  return data.result as T;
}

// CDP: Get ETH balance
export async function getBalance(address: string): Promise<bigint> {
  const result = await cdpRpcCall<string>('eth_getBalance', [address, 'latest']);
  return BigInt(result);
}

// CDP: Get transaction count (nonce)
export async function getTransactionCount(address: string): Promise<number> {
  const result = await cdpRpcCall<string>('eth_getTransactionCount', [address, 'latest']);
  return parseInt(result, 16);
}

// CDP: Check if address is contract
export async function isContract(address: string): Promise<boolean> {
  const result = await cdpRpcCall<string>('eth_getCode', [address, 'latest']);
  return result !== '0x' && result !== '0x0';
}

// CDP: Get block number
export async function getBlockNumber(): Promise<number> {
  const result = await cdpRpcCall<string>('eth_blockNumber');
  return parseInt(result, 16);
}

// --- Etherscan API V2 Methods ---

async function etherscanFetch<T>(params: Record<string, string>): Promise<T> {
  const queryParams = new URLSearchParams({
    chainid: BASE_CHAIN_ID.toString(),
    ...params,
    apikey: ETHERSCAN_API_KEY,
  });

  const url = `https://api.etherscan.io/v2/api?${queryParams.toString()}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  // Success - return data
  if (data.status === '1' && data.result) {
    return data.result;
  }
  
  // "No transactions found" etc - valid empty response
  if (data.message?.includes('No') || data.message?.includes('no ')) {
    return [] as T;
  }

  // Empty result is valid
  if (Array.isArray(data.result) && data.result.length === 0) {
    return [] as T;
  }

  // Rate limit - throw error so retry can catch it
  if (data.status === '0' && data.message?.includes('rate')) {
    throw new Error(`Rate limit: ${data.message}`);
  }

  // Other API error - throw so retry can handle
  if (data.status === '0') {
    throw new Error(`Etherscan API Error: ${data.message || 'Unknown error'}`);
  }

  // Fallback - return empty array
  return [] as T;
}

// Etherscan: Get transaction list
export async function getTransactions(address: string): Promise<TransactionInfo[]> {
  return await etherscanFetch<TransactionInfo[]>({
    module: 'account',
    action: 'txlist',
    address,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
  });
}

// Etherscan: Get ERC20 token transfers (to count unique tokens)
export async function getTokenTransfers(address: string): Promise<TokenInfo[]> {
  return await etherscanFetch<TokenInfo[]>({
    module: 'account',
    action: 'tokentx',
    address,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
  });
}

// Etherscan: Get NFT transfers (ERC721)
export async function getNFTTransfers(address: string): Promise<NFTInfo[]> {
  return await etherscanFetch<NFTInfo[]>({
    module: 'account',
    action: 'tokennfttx',
    address,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
  });
}

// Etherscan: Get ERC1155 transfers
export async function getERC1155Transfers(address: string): Promise<NFTInfo[]> {
  return await etherscanFetch<NFTInfo[]>({
    module: 'account',
    action: 'token1155tx',
    address,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
  });
}

// --- Utility Functions ---

export function formatEthBalance(weiBalance: bigint): string {
  const eth = Number(weiBalance) / 1e18;
  return eth.toFixed(4);
}

// Count unique tokens from transfer history
export function countUniqueTokens(transfers: TokenInfo[]): number {
  const uniqueContracts = new Set<string>();
  for (const transfer of transfers) {
    if (transfer.contractAddress) {
      uniqueContracts.add(transfer.contractAddress.toLowerCase());
    }
  }
  return uniqueContracts.size;
}

// Count unique NFTs from transfer history
export function countUniqueNFTs(transfers: NFTInfo[]): number {
  const uniqueNFTs = new Set<string>();
  for (const transfer of transfers) {
    if (transfer.contractAddress && transfer.tokenID) {
      uniqueNFTs.add(`${transfer.contractAddress.toLowerCase()}_${transfer.tokenID}`);
    }
  }
  return uniqueNFTs.size;
}

// Count unique contracts interacted with
export function countUniqueContracts(transactions: TransactionInfo[]): number {
  const uniqueContracts = new Set<string>();
  for (const tx of transactions) {
    if (tx.to) {
      // Check if it's a contract interaction:
      // 1. Has functionName (decoded)
      // 2. Has input data longer than '0x' (raw call data)
      // 3. Has methodId
      const isContractCall = 
        (tx.functionName && tx.functionName.length > 0) ||
        (tx.input && tx.input.length > 2 && tx.input !== '0x') ||
        (tx.methodId && tx.methodId.length > 0);
      
      if (isContractCall) {
        uniqueContracts.add(tx.to.toLowerCase());
      }
    }
  }
  return uniqueContracts.size;
}

// --- Main Aggregated Stats ---

export interface WalletStats {
  // CDP data
  ethBalance: bigint;
  ethBalanceFormatted: string;
  transactionCount: number;
  
  // Etherscan data
  tokenCount: number;
  nftCount: number;
  contractInteractionCount: number;
  
  // Raw data for ranking
  transactions: TransactionInfo[];
  tokenTransfers: TokenInfo[];
  nftTransfers: NFTInfo[];
  
  // Data source info
  source: {
    balance: 'cdp';
    transactions: 'etherscan';
    tokens: 'etherscan';
    nfts: 'etherscan';
  };
}

/**
 * Get comprehensive wallet stats using CDP + Etherscan V2 hybrid approach
 * CDP: ETH balance, transaction count (fast, reliable)
 * Etherscan V2: Token list, NFT list, detailed transactions (comprehensive data)
 */
export async function getWalletStats(address: string): Promise<WalletStats> {
  // Fetch all data in parallel
  const [
    ethBalance,
    transactionCount,
    transactions,
    tokenTransfers,
    nftTransfers,
    erc1155Transfers,
  ] = await Promise.all([
    getBalance(address).catch(() => BigInt(0)),
    getTransactionCount(address).catch(() => 0),
    getTransactions(address).catch(() => []),
    getTokenTransfers(address).catch(() => []),
    getNFTTransfers(address).catch(() => []),
    getERC1155Transfers(address).catch(() => []),
  ]);

  // Combine ERC721 and ERC1155 NFTs
  const allNftTransfers = [...nftTransfers, ...erc1155Transfers];

  // Calculate counts
  const tokenCount = countUniqueTokens(tokenTransfers);
  const nftCount = countUniqueNFTs(allNftTransfers);
  const contractInteractionCount = countUniqueContracts(transactions);

  return {
    ethBalance,
    ethBalanceFormatted: formatEthBalance(ethBalance),
    transactionCount,
    tokenCount,
    nftCount,
    contractInteractionCount,
    transactions,
    tokenTransfers,
    nftTransfers: allNftTransfers,
    source: {
      balance: 'cdp',
      transactions: 'etherscan',
      tokens: 'etherscan',
      nfts: 'etherscan',
    },
  };
}

// --- Ranking Data ---

export interface RankingData {
  transactions: number;
  tokens: number;
  nfts: number;
  contracts: number;
}

/**
 * Get data formatted for the ranking system
 */
export async function getRankingData(address: string): Promise<RankingData> {
  const stats = await getWalletStats(address);
  
  return {
    transactions: stats.transactionCount,
    tokens: stats.tokenCount,
    nfts: stats.nftCount,
    contracts: stats.contractInteractionCount,
  };
}
