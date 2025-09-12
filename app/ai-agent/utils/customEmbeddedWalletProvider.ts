import {
  Abi,
  Address,
  ContractFunctionArgs,
  ContractFunctionName,
  createPublicClient,
  Hex,
  http,
  PublicClient,
  ReadContractParameters,
  ReadContractReturnType,
  serializeTransaction,
  TransactionRequest,
  TransactionSerializable,
  WalletClient,
  createWalletClient,
} from "viem";
import { Network, NETWORK_ID_TO_CHAIN_ID, NETWORK_ID_TO_VIEM_CHAIN } from "../network";

/**
 * Configuration options for CustomEmbeddedWalletProvider
 */
export interface CustomEmbeddedWalletProviderConfig {
  /**
   * The user's wallet address
   */
  userWalletAddress: Address;
  
  /**
   * The user's wallet client (from wagmi)
   */
  userWalletClient: WalletClient;
  
  /**
   * The network to use (optional, defaults to base-mainnet)
   */
  networkId?: string;
  
  /**
   * Custom RPC URL (optional)
   */
  rpcUrl?: string;
}

/**
 * A custom wallet provider that allows the AI agent to manage the user's embedded wallet locally.
 * 
 * This provider:
 * - Uses the user's existing wallet address
 * - Connects to the user's wallet client locally
 * - Allows the agent to perform operations on behalf of the user
 * - Maintains user control over their funds
 * - No server-side wallet creation or management
 */
export class CustomEmbeddedWalletProvider {
  #userWalletAddress: Address;
  #userWalletClient: WalletClient;
  #network: Network;
  #publicClient: PublicClient;

  private constructor(config: CustomEmbeddedWalletProviderConfig) {
    this.#userWalletAddress = config.userWalletAddress;
    this.#userWalletClient = config.userWalletClient;
    
    const networkId = config.networkId || "base-mainnet";
    this.#network = {
      protocolFamily: "evm" as const,
      chainId: NETWORK_ID_TO_CHAIN_ID[networkId],
      networkId: networkId,
    };

    const rpcUrl = config.rpcUrl || process.env.RPC_URL;
    this.#publicClient = createPublicClient({
      chain: NETWORK_ID_TO_VIEM_CHAIN[networkId],
      transport: rpcUrl ? http(rpcUrl) : http(),
    });
  }

  /**
   * Creates a new CustomEmbeddedWalletProvider instance
   * 
   * @param config - Configuration options
   * @returns A new CustomEmbeddedWalletProvider instance
   */
  public static create(config: CustomEmbeddedWalletProviderConfig): CustomEmbeddedWalletProvider {
    return new CustomEmbeddedWalletProvider(config);
  }

  /**
   * Gets the user's wallet address
   * 
   * @returns The wallet address
   */
  public getAddress(): `0x${string}` {
    return this.#userWalletAddress;
  }

  /**
   * Gets the network configuration
   * 
   * @returns The network configuration
   */
  public getNetwork(): Network {
    return this.#network;
  }

  /**
   * Gets the public client for blockchain interactions
   * 
   * @returns The public client
   */
  public getPublicClient(): PublicClient {
    return this.#publicClient;
  }

  /**
   * Gets the user's wallet client
   * 
   * @returns The wallet client
   */
  public getUserWalletClient(): WalletClient {
    return this.#userWalletClient;
  }

  /**
   * Signs a transaction using the user's wallet
   * 
   * @param transaction - The transaction to sign
   * @returns The signed transaction
   */
  public async signTransaction(transaction: TransactionRequest): Promise<Hex> {
    try {
      // Use the user's wallet client to sign the transaction
      const signedTx = await this.#userWalletClient.signTransaction({
        ...transaction,
        account: this.#userWalletClient.account || this.#userWalletAddress,
        chain: NETWORK_ID_TO_VIEM_CHAIN[this.#network.networkId]
      } as any);
      return signedTx;
    } catch (error) {
      throw new Error(`Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sends a transaction using the user's wallet
   * 
   * @param transaction - The transaction to send
   * @returns The transaction hash
   */
  public async sendTransaction(transaction: TransactionRequest): Promise<Hex> {
    try {
      // Use the user's wallet client to send the transaction
      const hash = await this.#userWalletClient.sendTransaction({
        ...transaction,
        account: this.#userWalletClient.account || this.#userWalletAddress,
        chain: NETWORK_ID_TO_VIEM_CHAIN[this.#network.networkId]
      } as any);
      return hash;
    } catch (error) {
      throw new Error(`Failed to send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Signs a message using the user's wallet
   * 
   * @param message - The message to sign
   * @returns The signature
   */
  public async signMessage(message: string): Promise<Hex> {
    try {
      // Use the user's wallet client to sign the message
      const signature = await this.#userWalletClient.signMessage({ 
        message,
        account: this.#userWalletClient.account || this.#userWalletAddress
      });
      return signature;
    } catch (error) {
      throw new Error(`Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets the user's account for transaction building
   * 
   * @returns The account object
   */
  public getAccount() {
    return this.#userWalletClient.account;
  }

  /**
   * Converts the provider to a signer for use with other libraries
   * 
   * @returns A signer object
   */
  public toSigner() {
    return this.#userWalletClient;
  }

  /**
   * Exports wallet information (for compatibility with other providers)
   * 
   * @returns Basic wallet information
   */
  async exportWallet(): Promise<{ name: string | undefined; address: `0x${string}` }> {
    return {
      name: "User Embedded Wallet",
      address: this.#userWalletAddress,
    };
  }
}
