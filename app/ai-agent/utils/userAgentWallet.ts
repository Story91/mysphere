// Note: AgentKit cannot be used directly in frontend due to @privy-io/server-auth dependency
// We'll use API routes instead for agent wallet operations
import { formatEther, parseEther } from "viem";

/**
 * User Agent Wallet Manager
 * 
 * Creates and manages dedicated agent wallets for each connected user.
 * Private keys are securely stored in CDP's TEE (Trusted Execution Environment).
 */

export interface UserAgentWallet {
  userAddress: string;        // User's connected wallet (0xUser123...)
  agentAddress: string;       // Agent's CDP wallet (0xAgent456...)
  agentAccountName: string;   // CDP account name
  network: string;            // Network (base-mainnet)
}

export interface AgentWalletData {
  agentWalletAddress: string;
  agentWalletName: string;
  userAddress: string;
  createdAt: number;
  network: string;
}

/**
 * Creates a secure agent wallet for a user using CDP TEE via API route
 */
export async function createUserAgentWallet(userAddress: string): Promise<UserAgentWallet> {
  if (!userAddress) {
    throw new Error('User address is required');
  }

  try {
    console.log('🚀 Creating agent wallet for user:', userAddress);
    
    const response = await fetch('/api/ai-agent/wallet/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userAddress }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create agent wallet');
    }

    const walletData = await response.json();
    console.log('🎯 Agent wallet created:', walletData);

    return {
      userAddress,
      agentAddress: walletData.agentAddress,
      agentAccountName: walletData.agentAccountName,
      network: walletData.network || 'base-mainnet'
    };

  } catch (error) {
    console.error('❌ Failed to create agent wallet:', error);
    throw new Error(`Failed to create agent wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Gets existing agent wallet for a user via API route
 */
export async function getUserAgentWallet(userAddress: string): Promise<UserAgentWallet | null> {
  if (!userAddress) {
    return null;
  }

  try {
    console.log('🔍 Getting agent wallet for user:', userAddress);
    
    const response = await fetch(`/api/ai-agent/wallet/get?userAddress=${encodeURIComponent(userAddress)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // No wallet found
      }
      const error = await response.json();
      throw new Error(error.message || 'Failed to get agent wallet');
    }

    const walletData = await response.json();
    console.log('🎯 Agent wallet found:', walletData);

    return {
      userAddress,
      agentAddress: walletData.agentAddress,
      agentAccountName: walletData.agentAccountName,
      network: walletData.network || 'base-mainnet'
    };

  } catch (error) {
    console.error('❌ Failed to get agent wallet:', error);
    return null;
  }
}

/**
 * Gets or creates agent wallet for a user via API route
 */
export async function getOrCreateUserAgentWallet(userAddress: string): Promise<UserAgentWallet> {
  const existingWallet = await getUserAgentWallet(userAddress);
  if (existingWallet) {
    return existingWallet;
  }
  return await createUserAgentWallet(userAddress);
}

/**
 * Gets agent wallet balance via direct RPC call
 */
export async function getAgentWalletBalance(agentAddress: string): Promise<bigint> {
  try {
    // Use viem directly for balance checking
    const { createPublicClient, http } = await import('viem');
    const { base } = await import('viem/chains');
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http()
    });
    
    return await publicClient.getBalance({
      address: agentAddress as `0x${string}`
    });
  } catch (error) {
    console.error('Failed to get agent wallet balance:', error);
    return 0n;
  }
}

/**
 * Funds agent wallet via API route
 */
export async function fundAgentWallet(
  userAddress: string, 
  agentAddress: string, 
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log('💰 Funding agent wallet:', { userAddress, agentAddress, amount });
    
    const response = await fetch('/api/ai-agent/wallet/fund', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        userAddress,
        agentAddress, 
        amount 
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { 
        success: false, 
        error: error.message || 'Failed to fund agent wallet' 
      };
    }

    const result = await response.json();
    console.log('✅ Agent wallet funded:', result);

    return {
      success: true,
      txHash: result.txHash
    };

  } catch (error) {
    console.error('❌ Failed to fund agent wallet:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Sends agent message via API route
 */
export async function sendAgentMessage(
  userAddress: string,
  message: string
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    console.log('🤖 Sending message to agent:', { userAddress, message });
    
    const response = await fetch('/api/ai-agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        userAddress,
        message 
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { 
        success: false, 
        error: error.message || 'Failed to send message to agent' 
      };
    }

    const result = await response.json();
    console.log('✅ Agent response:', result);

    return {
      success: true,
      response: result.response
    };

  } catch (error) {
    console.error('❌ Failed to send message to agent:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}