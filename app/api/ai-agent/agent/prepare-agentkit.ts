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
  // twitterActionProvider, // DISABLED: Security risk - users could post to main X account
  moonwellActionProvider,
  FlaunchActionProvider, // ADDED: Flaunch token creation capabilities
} from "@coinbase/agentkit";
import * as fs from "fs";
import { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * AgentKit Integration Route
 *
 * This file is your gateway to integrating AgentKit with your product.
 * It defines the core capabilities of your agent through WalletProvider
 * and ActionProvider configuration.
 *
 * Key Components:
 * 1. WalletProvider Setup:
 *    - Configures the blockchain wallet integration
 *    - Learn more: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#evm-wallet-providers
 *
 * 2. ActionProviders Setup:
 *    - Defines the specific actions your agent can perform
 *    - Choose from built-in providers or create custom ones:
 *      - Built-in: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#action-providers
 *      - Custom: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#creating-an-action-provider
 *
 * # Next Steps:
 * - Explore the AgentKit README: https://github.com/coinbase/agentkit
 * - Experiment with different LLM configurations
 * - Fine-tune agent parameters for your use case
 *
 * ## Want to contribute?
 * Join us in shaping AgentKit! Check out the contribution guide:
 * - https://github.com/coinbase/agentkit/blob/main/CONTRIBUTING.md
 * - https://discord.gg/CDP
 */

// Configure a file to persist the agent's Smart Wallet + Private Key data
const WALLET_DATA_FILE = "wallet_data.txt";

type WalletData = {
  privateKey: Hex;
  smartWalletAddress: Address;
};

/**
 * Prepares the AgentKit and WalletProvider.
 *
 * @function prepareAgentkitAndWalletProvider
 * @returns {Promise<{ agentkit: AgentKit, walletProvider: WalletProvider }>} The initialized AI agent.
 *
 * @description Handles agent setup
 *
 * @throws {Error} If the agent initialization fails.
 */
export async function prepareAgentkitAndWalletProvider(): Promise<{
  agentkit: AgentKit;
  walletProvider: WalletProvider;
}> {
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    throw new Error(
      "I need both CDP_API_KEY_ID and CDP_API_KEY_SECRET in your .env file to connect to the Coinbase Developer Platform.",
    );
  }

  let walletData: WalletData | null = null;
  let privateKey: Hex | null = null;

  // Read existing wallet data if available
  if (fs.existsSync(WALLET_DATA_FILE)) {
    try {
      walletData = JSON.parse(fs.readFileSync(WALLET_DATA_FILE, "utf8")) as WalletData;
      privateKey = walletData.privateKey;
    } catch (error) {
      console.error("Error reading wallet data:", error);
    }
  }

  if (!privateKey) {
    if (walletData?.smartWalletAddress) {
      throw new Error(
        `I found your smart wallet but can't access your private key. Please either provide the private key in your .env, or delete ${WALLET_DATA_FILE} to create a new wallet.`,
      );
    }
    privateKey = (process.env.PRIVATE_KEY || generatePrivateKey()) as Hex;
  }

  try {
    const owner = privateKeyToAccount(privateKey);

    // Initialize WalletProvider: https://docs.cdp.coinbase.com/agentkit/docs/wallet-management
    // Using CdpEvmWalletProvider for better compatibility with swap operations
    const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
      networkId: process.env.NETWORK_ID || "base-mainnet", // Changed default to mainnet
      address: walletData?.smartWalletAddress, // Keep existing address if available
    });

    // Initialize FlaunchActionProvider with PINATA_JWT
    const flaunchProvider = new FlaunchActionProvider({
      pinataJwt: process.env.PINATA_JWT,
    });

    // Initialize AgentKit: https://docs.cdp.coinbase.com/agentkit/docs/agent-actions
    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        wethActionProvider(),
        pythActionProvider(),
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider(),
        cdpEvmWalletActionProvider(), // ADDED: Enhanced spend permissions and EVM wallet functions
        cdpSmartWalletActionProvider(), // ADDED: Smart wallet specific spend permissions
        // twitterActionProvider(), // DISABLED: Security risk - users could post to main X account
        moonwellActionProvider(),
        flaunchProvider, // ADDED: Flaunch token creation capabilities
      ],
    });

    // Save wallet data
    const smartWalletAddress = walletProvider.getAddress();
    fs.writeFileSync(
      WALLET_DATA_FILE,
      JSON.stringify({
        privateKey,
        smartWalletAddress,
      } as WalletData),
    );

    // 🔍 DEBUG: Check what actions are available
    const availableActions = agentkit.getActions();
    console.log("🎯 Available Actions:", availableActions.map(action => ({
      name: action.name,
      description: action.description.substring(0, 100) + "..."
    })));
    
    // 🔍 DEBUG: Check network compatibility
    console.log("🌐 Current Network:", walletProvider.getNetwork());
    
    // 🔍 DEBUG: Check if swap action specifically exists
    const swapAction = availableActions.find(action => action.name === "swap");
    console.log("🔄 Swap Action Available:", !!swapAction);
    if (swapAction) {
      console.log("🔄 Swap Action Details:", {
        name: swapAction.name,
        description: swapAction.description.substring(0, 200),
        schema: swapAction.schema
      });
    }
    
    // 🔍 DEBUG: Check cdpApiActionProvider specifically
    const cdpProvider = new (await import("@coinbase/agentkit")).CdpApiActionProvider();
    console.log("🏛️ CDP Provider supports network:", cdpProvider.supportsNetwork(walletProvider.getNetwork()));
    
    return { agentkit, walletProvider };
  } catch (error) {
    console.error("Error initializing agent:", error);
    throw new Error("Failed to initialize agent");
  }
}
