import {
  AgentKit,
  cdpApiActionProvider,
  cdpEvmWalletActionProvider,
  cdpSmartWalletActionProvider,
  erc20ActionProvider,
  pythActionProvider,
  CdpSmartWalletProvider,
  CdpEvmWalletProvider,
  walletActionProvider,
  WalletProvider,
  wethActionProvider,
  moonwellActionProvider,
  FlaunchActionProvider,
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";

// Cache for agents with different wallets
const agentCache = new Map<string, ReturnType<typeof createReactAgent>>();

/**
 * Creates an AgentKit agent that uses the user's selected wallet instead of creating its own.
 * 
 * @param walletType - Type of wallet ('main' or 'cdp')
 * @param walletAddress - Address of the user's wallet
 * @returns Promise<ReturnType<typeof createReactAgent>> The initialized AI agent
 */
export async function createAgentWithUserWallet(
  walletType: 'main' | 'cdp',
  walletAddress: string
): Promise<ReturnType<typeof createReactAgent>> {
  const cacheKey = `${walletType}-${walletAddress}`;
  
  // Return cached agent if available
  if (agentCache.has(cacheKey)) {
    return agentCache.get(cacheKey)!;
  }

  if (!process.env.OPENAI_API_KEY_AGENT) {
    throw new Error("I need an OPENAI_API_KEY_AGENT in your .env file to power my intelligence.");
  }

  // Validate CDP credentials for CDP wallet
  if (walletType === 'cdp' && (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET || !process.env.CDP_WALLET_SECRET)) {
    throw new Error("CDP credentials are required for CDP wallet operations.");
  }

  let walletProvider: WalletProvider;

  try {
    if (walletType === 'cdp') {
      // Use CDP wallet provider with user's wallet address
      console.log('🔧 Creating CDP wallet provider for user wallet:', walletAddress);
      
      walletProvider = await CdpEvmWalletProvider.configureWithWallet({
        apiKeyId: process.env.CDP_API_KEY_ID!,
        apiKeySecret: process.env.CDP_API_KEY_SECRET!,
        walletSecret: process.env.CDP_WALLET_SECRET!,
        networkId: process.env.NETWORK_ID || "base-mainnet",
        address: walletAddress as any, // Use user's wallet address
      });
    } else {
      // For main wallet, we need to create a custom wallet provider
      // This is a simplified approach - in production you'd want more sophisticated wallet integration
      console.log('🔧 Creating custom wallet provider for main wallet:', walletAddress);
      
      // Create a mock wallet provider that uses the user's address
      walletProvider = {
        getAddress: () => walletAddress,
        getNetwork: () => ({ networkId: process.env.NETWORK_ID || "base-mainnet" }),
        getName: () => "User Main Wallet",
        // Add other required methods as needed
      } as WalletProvider;
    }

    // Initialize FlaunchActionProvider with PINATA_JWT
    const flaunchProvider = new FlaunchActionProvider({
      pinataJwt: process.env.PINATA_JWT,
    });

    // Initialize AgentKit with user's wallet provider
    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        wethActionProvider(),
        pythActionProvider(),
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider(),
        cdpEvmWalletActionProvider(),
        cdpSmartWalletActionProvider(),
        moonwellActionProvider(),
        flaunchProvider,
      ],
    });

    // Initialize LangChain LLM
    const llm = new ChatOpenAI({ 
      model: "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY_AGENT
    });

    // Get LangChain tools from AgentKit
    const tools = await getLangChainTools(agentkit);
    const memory = new MemorySaver();

    // Create LangChain agent with user's wallet
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit. 
You are empowered to interact onchain using your tools. 

Current user wallet: ${walletAddress}
Wallet type: ${walletType}

Note: Twitter functionality is currently disabled for security reasons.

Swap capabilities:
- Enhanced swap functionality with get_swap_price and swap actions
- Automatic approval handling and better error messages
- Supported on Base mainnet and Ethereum mainnet

Flaunch Token Creation capabilities:
- Create custom memecoin tokens using the Flaunch protocol
- Launch tokens with rich metadata (name, symbol, image, description, social links)
- Users can upload images through the UI (click the image icon next to Send button)
- Supports Base Mainnet 
- Use whole units for amounts (e.g., "0.1" ETH, "1000" tokens)
- Built-in slippage protection (default 5%)

IMPORTANT Token Addresses on Base Mainnet:
- USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (USE THIS FOR BASE MAINNET)
- WETH: 0x4200000000000000000000000000000000000006
- ETH: Use "eth" as asset ID (native token)
- For swaps, use asset IDs like "eth", "usdc" NOT contract addresses

Be concise and helpful with your responses. Refrain from restating your tools' descriptions unless it is explicitly requested.`,
    });

    // Cache the agent
    agentCache.set(cacheKey, agent);
    
    console.log('✅ Agent created with user wallet:', walletAddress, 'type:', walletType);
    return agent;

  } catch (error) {
    console.error('❌ Failed to create agent with user wallet:', error);
    throw error;
  }
}
