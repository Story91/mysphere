/**
 * AI Agent Chat endpoint with Autonomous Wallet Support
 * POST /api/ai-agent/autonomous-chat
 *
 * Supports both Privy embedded wallets and autonomous self-custodial wallets
 */

import { NextRequest, NextResponse } from "next/server";
import {
  AgentKit,
  walletActionProvider,
  erc20ActionProvider,
  cdpApiActionProvider,
  PrivyEvmDelegatedEmbeddedWalletProvider,
  wethActionProvider,
  pythActionProvider,
  cdpEvmWalletActionProvider,
  cdpSmartWalletActionProvider,
  moonwellActionProvider,
  FlaunchActionProvider
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { ethers } from "ethers";
import { createAutonomousWalletProvider } from "../../../ai-agent/providers/AutonomousWalletProvider";

export async function POST(request: NextRequest) {
  try {
    const {
      userAddress,
      message,
      walletType = "privy", // "privy" or "autonomous"
      sessionId,
      autonomousWalletConfig
    } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // Require wallet connection
    if (!userAddress) {
      return NextResponse.json(
        {
          error: "Please connect your wallet first to use the AI agent",
          requiresWallet: true
        },
        { status: 400 }
      );
    }

    console.log('🤖 Agent message:', {
      userAddress,
      message,
      walletType,
      sessionId,
      autonomousWalletConfig
    });

    // Validate environment variables
    const requiredEnvVars = ['OPENAI_API_KEY_AGENT', 'PINATA_JWT'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      return NextResponse.json(
        { error: `Missing required environment variables: ${missingVars.join(', ')}` },
        { status: 500 }
      );
    }

    let walletProvider;
    let agentWalletAddress;

    if (walletType === "autonomous") {
      // Use autonomous wallet provider
      if (!sessionId || !autonomousWalletConfig) {
        return NextResponse.json(
          {
            error: "Missing sessionId or autonomousWalletConfig for autonomous wallet",
            requiresSetup: true
          },
          { status: 400 }
        );
      }

      try {
        console.log('🔧 Setting up autonomous wallet provider...');

        // Create provider from RPC URL
        const provider = new ethers.JsonRpcProvider(
          autonomousWalletConfig.rpcUrl || "https://mainnet.base.org"
        );

        // Create wallet from user address (user must have funds)
        const wallet = new ethers.Wallet(
          process.env.USER_PRIVATE_KEY!, // User provides their own key
          provider
        );

        // Create autonomous wallet provider
        const autonomousProvider = createAutonomousWalletProvider(
          {
            walletContractAddress: autonomousWalletConfig.walletContractAddress,
            rpcUrl: autonomousWalletConfig.rpcUrl || "https://mainnet.base.org",
            chainId: autonomousWalletConfig.chainId || 8453
          },
          wallet
        );

        // Check if session key is valid
        const sessionKey = await autonomousProvider.getSessionKey(sessionId);
        if (!sessionKey.isActive) {
          return NextResponse.json(
            {
              error: "Session key is not active",
              requiresNewSession: true
            },
            { status: 400 }
          );
        }

        // For now, create a minimal wrapper - the autonomous provider will handle the actual execution
        // This is a temporary solution until we properly implement the AgentKit WalletProvider interface
        walletProvider = {
          getAddress: async () => userAddress,
          getBalance: async () => {
            const balance = await provider.getBalance(userAddress);
            return {
              toString: () => ethers.formatEther(balance)
            };
          },
          getNetwork: async () => ({
            chainId: autonomousWalletConfig.chainId || 8453
          }),
          getName: () => "AutonomousAgentWallet"
        } as any;

        agentWalletAddress = userAddress;
        console.log('✅ Autonomous wallet provider created successfully');

      } catch (error) {
        console.error('❌ Autonomous wallet setup failed:', error);
        return NextResponse.json(
          {
            error: "Failed to setup autonomous wallet",
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          { status: 500 }
        );
      }

    } else {
      // Use existing Privy system
      if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET || !process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY) {
        return NextResponse.json(
          { error: "Privy configuration missing" },
          { status: 500 }
        );
      }

      try {
        console.log('🔧 Trying PrivyEvmDelegatedEmbeddedWalletProvider...');

        walletProvider = await PrivyEvmDelegatedEmbeddedWalletProvider.configureWithWallet({
          appId: process.env.PRIVY_APP_ID,
          appSecret: process.env.PRIVY_APP_SECRET,
          authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY,
          walletId: sessionId || userAddress,
          networkId: "base-mainnet",
          walletType: "embedded"
        });

        console.log('✅ PrivyEvmDelegatedEmbeddedWalletProvider created successfully');

      } catch (error) {
        console.error('❌ Privy wallet setup failed:', error);
        return NextResponse.json(
          {
            error: "Failed to setup Privy wallet",
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          { status: 500 }
        );
      }
    }

    if (!walletProvider) {
      throw new Error('Failed to create any wallet provider');
    }

    agentWalletAddress = await walletProvider.getAddress();
    console.log('🎯 Using agent wallet:', agentWalletAddress);

    // Test wallet connectivity
    try {
      const balance = await walletProvider.getBalance();
      console.log('💰 Wallet balance:', balance.toString());
    } catch (error) {
      console.error('❌ Failed to get balance:', error);
    }

    // Initialize FlaunchActionProvider with PINATA_JWT
    const flaunchProvider = new FlaunchActionProvider({
      pinataJwt: process.env.PINATA_JWT,
    });

    // Initialize AgentKit with user-specific wallet provider + ALL action providers
    const agentkit = await AgentKit.from({
      walletProvider: walletProvider,
      actionProviders: [
        wethActionProvider(),
        pythActionProvider(),
        walletActionProvider(),
        erc20ActionProvider(),
        moonwellActionProvider(),
        flaunchProvider, // Flaunch token creation capabilities
        // Add other providers as needed
      ]
    });

    // Initialize LangChain LLM
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY_AGENT
    });

    // Get LangChain tools from AgentKit
    const tools = await getLangChainTools(agentkit);
    const memory = new MemorySaver();

    // Create LangChain agent with user-specific wallet
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit.
You are empowered to interact onchain using your tools.

Current user: ${userAddress}
Your agent wallet: ${agentWalletAddress}
Wallet type: ${walletType}

Note: Twitter functionality is currently disabled for security reasons.

${walletType === "autonomous" ?
  `🤖 AUTONOMOUS MODE: You have autonomous control over the user's self-custodial wallet.
You can execute transactions directly without user confirmation within the limits set by the user.
Be responsible and only execute transactions that align with the user's explicit instructions.` :
  `🔐 PRIVY MODE: You are using an embedded wallet with session signers.
You can execute transactions without user popups, but the user retains full control.`
}

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

Flaunch IMPORTANT Rules:
- websiteUrl, discordUrl, twitterUrl, telegramUrl MUST be valid URLs or OMITTED
- Valid URL format: "https://example.com" (with http/https)
- If no social media, use empty strings: ""
- Image URL must be accessible IPFS/HTTP link
- Name and Symbol must be unique
- Description should be clear and concise

Moonwell DeFi capabilities:
- mint: Deposit assets into Moonwell MToken (lending/supply)
- redeem: Withdraw assets from Moonwell MToken
- Supports Base mainnet and Base sepolia networks
- Use whole units for amounts (e.g., "100" USDC, "0.5" ETH)
- Requires both token address and mToken address for operations

Moonwell Token Addresses on Base Mainnet:
- USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) → Moonwell USDC: 0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22
- WETH (0x4200000000000000000000000000000000000006) → Moonwell WETH: 0x628ff69342658319a7FB391E5436629292509D57
- WELL (0xA88594D404727625A9437C3f886C7643872296AE) → Moonwell WELL: 0xdC7810B47eAAb250De623F0E07764afa5F71ED1

IMPORTANT Token Addresses on Base Mainnet:
- USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (USE THIS FOR BASE MAINNET)
- WETH: 0x4200000000000000000000000000000000000006
- ETH: Use "eth" as asset ID (native token)
- For swaps, use asset IDs like "eth", "usdc" NOT contract addresses

ETH/WEI Conversion Rules:
- CRITICAL: Always convert ETH amounts to WEI before processing
- 0.0000001 ETH = 100,000,000,000 wei (minimum)
- 0.0001 ETH = 100,000,000,000,000 wei (100 trillion wei)
- 0.001 ETH = 1,000,000,000,000,000 wei (1 quadrillion wei)
- 0.1 ETH = 100,000,000,000,000,000 wei
- 1 ETH = 1,000,000,000,000,000,000 wei

WETH Actions (wrap/unwrap):
- Use wei amounts: "wrap 100000000000000" for 0.0001 ETH
- NEVER use decimal amounts like "0.1" or "0.001"

Transfer Rules:
- For ETH transfers, use wei amounts
- 0.0001 ETH = 100,000,000,000,000 wei
- Check wallet balance before transferring
- Use nativeTransfer for ETH transfers
- Example: "transfer 100000000000000 wei to 0x..." for 0.0001 ETH
- NEVER use decimal amounts in transfers

If you ever need funds, you can provide your wallet details and request funds from the user.
Be concise and helpful with your responses. Refrain from restating your tools' descriptions unless it is explicitly requested.`,
    });

    // Stream agent response
    const stream = await agent.stream(
      { messages: [{ content: message, role: "user" }] },
      { configurable: { thread_id: `user-${userAddress}` } }
    );

    // Process streamed response into single message
    let agentResponse = "";
    for await (const chunk of stream) {
      if ("agent" in chunk) {
        agentResponse += chunk.agent.messages[0].content;
      }
    }

    console.log('✅ Agent response:', agentResponse);

    return NextResponse.json({
      success: true,
      response: agentResponse,
      userAddress,
      agentWallet: agentWalletAddress,
      walletType,
      sessionId: sessionId || null
    });

  } catch (error) {
    console.error('❌ Failed to process agent message:', error);
    return NextResponse.json(
      {
        error: "Failed to process agent message",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
