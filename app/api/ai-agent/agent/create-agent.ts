import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { prepareAgentkitAndWalletProvider } from "./prepare-agentkit";

/**
 * Agent Configuration Guide
 *
 * This file handles the core configuration of your AI agent's behavior and capabilities.
 *
 * Key Steps to Customize Your Agent:
 *
 * 1. Select your LLM:
 *    - Modify the `ChatOpenAI` instantiation to choose your preferred LLM
 *    - Configure model parameters like temperature and max tokens
 *
 * 2. Instantiate your Agent:
 *    - Pass the LLM, tools, and memory into `createReactAgent()`
 *    - Configure agent-specific parameters
 */

// The agent
let agent: ReturnType<typeof createReactAgent>;

/**
 * Initializes and returns an instance of the AI agent.
 * If an agent instance already exists, it returns the existing one.
 *
 * @function getOrInitializeAgent
 * @returns {Promise<ReturnType<typeof createReactAgent>>} The initialized AI agent.
 *
 * @description Handles agent setup
 *
 * @throws {Error} If the agent initialization fails.
 */
export async function createAgent(): Promise<ReturnType<typeof createReactAgent>> {
  // If agent has already been initialized, return it
  if (agent) {
    return agent;
  }

  if (!process.env.OPENAI_API_KEY_AGENT) {
    throw new Error("I need an OPENAI_API_KEY_AGENT in your .env file to power my intelligence.");
  }

  const { agentkit, walletProvider } = await prepareAgentkitAndWalletProvider();

  try {
    // Initialize LLM: https://platform.openai.com/docs/models#gpt-4o
    const llm = new ChatOpenAI({ 
      model: "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY_AGENT
    });

    const tools = await getLangChainTools(agentkit);
    const memory = new MemorySaver();

    // Initialize Agent
    const canUseFaucet = walletProvider.getNetwork().networkId == "base-sepolia";
    const faucetMessage = `If you ever need funds, you can request them from the faucet.`;
    const cantUseFaucetMessage = `If you need funds, you can provide your wallet details and request funds from the user.`;
    agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit. 
        You are empowered to interact onchain using your tools.
        
        Note: Twitter functionality is currently disabled for security reasons.
        
        Swap capabilities:
        - Enhanced swap functionality with get_swap_price and swap actions
        - Automatic approval handling and better error messages
        - Supported on Base mainnet and Ethereum mainnet
        - Use normal decimal amounts (e.g., "1.5" for 1.5 tokens, not wei)
        
        Spend Permission capabilities:
        - List spend permissions granted to your wallet by smart accounts
        - Use spend permissions to spend tokens on behalf of smart accounts
        - Both EVM wallet and Smart wallet implementations available
        
        Flaunch Token Creation capabilities:
        - Create custom memecoin tokens using the Flaunch protocol
        - Launch tokens with rich metadata (name, symbol, image, description, social links)
        - Automatic IPFS upload for token metadata and images
        - Users can upload images through the UI (click the image icon next to Send button)
        - Supports Base Mainnet and Base Sepolia networks
        - Use whole units for amounts (e.g., "0.1" ETH, "1000" tokens)
        - Built-in slippage protection (default 5%)
        
        Available Flaunch actions:
        - flaunch: Create a new memecoin token
        - buyCoinWithETHInput: Buy tokens by specifying ETH amount to spend
        - buyCoinWithCoinInput: Buy tokens by specifying token amount desired
        - sellCoin: Sell tokens for ETH
        
        Example Flaunch workflow:
        1. User provides token details (name, symbol, description)
        2. User uploads image through UI or provides image URL
        3. Call flaunch action with all parameters
        4. Token is automatically launched on Flaunch protocol
        
        IMPORTANT Token Addresses on Base Mainnet:
        - USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (USE THIS FOR BASE MAINNET)
        - WETH: 0x4200000000000000000000000000000000000006
        - ETH: Use "eth" as asset ID (native token)
        - For swaps, use asset IDs like "eth", "usdc" NOT contract addresses
        
        TROUBLESHOOTING Swap Errors:
        - If "EVM account not found" error occurs, first try "get_wallet_details" 
        - Check if wallet address exists and has proper CDP account association
        - CRITICAL: For amount format, use smallest units (like WEI for ETH, micro-units for USDC):
          * ETH: "0.01" = "10000000000000000" (18 decimals), "1" = "1000000000000000000"
          * USDC: "0.352227" = "352227" (6 decimals), "100" = "100000000", "1" = "1000000"
          * Always convert decimals to whole numbers in smallest denomination
        - If swap fails, suggest user to try smaller amounts or check wallet funding
        
        ${canUseFaucet ? faucetMessage : cantUseFaucetMessage}.
        Before executing your first action, get the wallet details to see what network 
        you're on. If there is a 5XX (internal) HTTP error code, ask the user to try again later. If someone 
        asks you to do something you can't do with your currently available tools, you must say so, and 
        explain that they can add more capabilities by adding more action providers to your AgentKit configuration.
        ALWAYS include this link when mentioning missing capabilities, which will help them discover available action providers: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#action-providers
        If users require more information regarding CDP or AgentKit, recommend they visit docs.cdp.coinbase.com for more information.
        Be concise and helpful with your responses. Refrain from restating your tools' descriptions unless it is explicitly requested.
        `,
    });

    return agent;
  } catch (error) {
    console.error("Error initializing agent:", error);
    throw new Error("Failed to initialize agent");
  }
}
