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

/**
 * AI Agent Chat endpoint
 * POST /api/ai-agent/chat
 * 
 * Handles user messages to the AI agent
 */
export async function POST(request: NextRequest) {
  try {
    const { userAddress, message, embeddedWalletId, embeddedWalletAddress } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // Require wallet connection - no fallback to old system
    if (!userAddress) {
      return NextResponse.json(
        { 
          error: "Please connect your wallet first to use the AI agent",
          requiresWallet: true 
        },
        { status: 400 }
      );
    }

    // Require embedded wallet information
    if (!embeddedWalletId || !embeddedWalletAddress) {
      return NextResponse.json(
        { error: "Missing embedded wallet information" },
        { status: 400 }
      );
    }

    console.log('🤖 Agent message:', { userAddress, message, embeddedWalletId, embeddedWalletAddress });
    
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

    console.log('🔍 Environment variables OK, proceeding with wallet provider creation...');
    console.log('🔍 Privy config:', {
      appId: process.env.PRIVY_APP_ID ? 'SET' : 'MISSING',
      appSecret: process.env.PRIVY_APP_SECRET ? 'SET' : 'MISSING',
      authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ? 'SET' : 'MISSING',
      walletId: embeddedWalletId,
      networkId: "base-mainnet"
    });
    console.log('🔍 Flaunch config:', {
      pinataJwt: process.env.PINATA_JWT ? 'SET' : 'MISSING'
    });
    
    console.log('🔍 Using embedded wallet for user:', userAddress, 'wallet:', embeddedWalletAddress);
    console.log('🔍 Debug info:', {
      embeddedWalletId,
      embeddedWalletAddress,
      userAddress,
      message
    });
    
          // Try PrivyEvmDelegatedEmbeddedWalletProvider with session signer support
      let walletProvider;
      try {
        console.log('🔧 Trying PrivyEvmDelegatedEmbeddedWalletProvider with session signer...');
        console.log('🔍 Using authorization key for session signer...');
        
        walletProvider = await PrivyEvmDelegatedEmbeddedWalletProvider.configureWithWallet({
          appId: process.env.PRIVY_APP_ID!,
          appSecret: process.env.PRIVY_APP_SECRET!,
          authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!,
          walletId: embeddedWalletId,
          networkId: "base-mainnet",
          walletType: "embedded"
        });
        
        console.log('✅ PrivyEvmDelegatedEmbeddedWalletProvider created successfully with session signer');
        console.log('🎯 This wallet can now execute transactions without user popups');
        
      } catch (error) {
        console.log('❌ PrivyEvmDelegatedEmbeddedWalletProvider failed:', error);
        console.log('⚠️ You need to configure session signers in Privy Dashboard:');
        console.log('📖 1. Create authorization key (openssl)');
        console.log('📖 2. Register key quorum in Authorization keys');
        console.log('📖 3. Add session signer to user wallet');
        console.log('📖 4. Use PRIVY_AUTHORIZATION_PRIVATE_KEY in .env.local');
        throw new Error(`Session signer setup required. Follow Privy docs: https://docs.privy.io/wallets/using-wallets/session-signers/overview`);
      }
    
    if (!walletProvider) {
      throw new Error('Failed to create any wallet provider');
    }
    
    console.log('🎯 Agent wallet address:', walletProvider.getAddress());
    console.log('🔍 Wallet provider name:', walletProvider.getName());
    console.log('🔍 Wallet provider network:', walletProvider.getNetwork());
    
    // Test if the wallet provider can perform basic operations
    try {
      const balance = await walletProvider.getBalance();
      console.log('💰 Wallet balance:', balance.toString(), 'wei');
    } catch (error) {
      console.error('❌ Failed to get balance:', error);
    }

    const agentAddress = walletProvider.getAddress();
    console.log('🎯 Using agent wallet:', agentAddress);

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
        // Dodane bezpieczne action providers bez Zod errors
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
Your agent wallet: ${agentAddress}

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
- WELL (0xA88594D404727625A9437C3f886C7643872296AE) → Moonwell WELL: 0xdC7810B47eAAb250De623F0eE07764afa5F71ED1

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
      agentWallet: agentAddress
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
