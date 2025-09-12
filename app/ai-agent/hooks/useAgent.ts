import { useState } from "react";
import { useAccount } from "wagmi";
import { AgentRequest, AgentResponse } from "../types/api";
import { useZeroDevSmartWallet } from "./useZeroDevSmartWallet";
import { useCDPWallet } from "./useCDPWallet";
import { CDPWalletActionProvider } from "../providers/CDPWalletActionProvider";

/**
 * Fixes common URL issues in agent responses and converts transaction hashes to clickable links
 * @param text - The response text from the agent
 * @returns Fixed text with corrected URLs and clickable transaction links
 */
function fixAgentResponseUrls(text: string): string {
  let fixedText = text
    // Fix base.scan.com -> basescan.org
    .replace(/https?:\/\/base\.scan\.com/g, 'https://basescan.org')
    // Fix any subdomain variants of base.scan.com
    .replace(/https?:\/\/[^\/]*\.base\.scan\.com/g, 'https://basescan.org')
    // Fix base-sepolia.scan.com -> sepolia.basescan.org
    .replace(/https?:\/\/base-sepolia\.scan\.com/g, 'https://sepolia.basescan.org')
    // Fix sepolia.base.scan.com -> sepolia.basescan.org  
    .replace(/https?:\/\/sepolia\.base\.scan\.com/g, 'https://sepolia.basescan.org')
    // Ensure consistent transaction path format
    .replace(/\/tx\/([0-9a-fA-F]+)/g, '/tx/$1');

  // Convert transaction hashes to clickable links
  // Pattern for transaction hash: 0x followed by 64 hex characters
  const txHashPattern = /\b(0x[a-fA-F0-9]{64})\b/g;
  
  fixedText = fixedText.replace(txHashPattern, (match, hash, offset) => {
    // Check if it's already part of a URL by looking at the text before this match
    const beforeMatch = fixedText.substring(Math.max(0, offset - 50), offset);
    if (beforeMatch.includes('https://') || 
        beforeMatch.includes('http://') || 
        beforeMatch.includes('/tx/') ||
        beforeMatch.includes('[') ||
        beforeMatch.includes('](')) {
      return match; // Already a link, don't modify
    }
    
    // Detect network from context - check if message mentions sepolia/testnet
    const textLower = fixedText.toLowerCase();
    const isTestnet = textLower.includes('sepolia') || 
                     textLower.includes('testnet') || 
                     textLower.includes('base-sepolia');
    
    const explorerUrl = isTestnet 
      ? `https://sepolia.basescan.org/tx/${hash}`
      : `https://basescan.org/tx/${hash}`;
    
    return `[${hash}](${explorerUrl})`;
  });

  return fixedText;
}

/**
 * Smart wallet command parser - extracts wallet commands from agent messages
 * @param message - The agent's message
 * @returns Parsed wallet command or null
 */
function parseWalletCommand(message: string): { command: string; params: any } | null {
  const lowerMessage = message.toLowerCase();
  
  // Check balance command
  if (lowerMessage.includes('check balance') || lowerMessage.includes('sprawdź saldo') || lowerMessage.includes('ile mam')) {
    return { command: 'checkBalance', params: {} };
  }
  
  // Send transaction command
  const sendMatch = message.match(/send\s+([\d.]+)\s+eth\s+to\s+(0x[a-fA-F0-9]{40})/i);
  if (sendMatch) {
    return {
      command: 'sendTransaction',
      params: {
        amount: parseFloat(sendMatch[1]),
        to: sendMatch[2]
      }
    };
  }
  
  // Transfer command (English)
  const transferMatch = message.match(/transfer\s+([\d.]+)\s+eth\s+to\s+(0x[a-fA-F0-9]{40})/i);
  if (transferMatch) {
    return {
      command: 'sendTransaction',
      params: {
        amount: parseFloat(transferMatch[1]),
        to: transferMatch[2]
      }
    };
  }
  
  // Simple transfer command (transfer X ETH to address)
  const simpleTransferMatch = message.match(/transfer\s+([\d.]+)\s+eth\s+to\s+(0x[a-fA-F0-9]{40})/i);
  if (simpleTransferMatch) {
    return {
      command: 'sendTransaction',
      params: {
        amount: parseFloat(simpleTransferMatch[1]),
        to: simpleTransferMatch[2]
      }
    };
  }
  
  // Very simple transfer (transfer X to address)
  const verySimpleTransferMatch = message.match(/transfer\s+([\d.]+)\s+to\s+(0x[a-fA-F0-9]{40})/i);
  if (verySimpleTransferMatch) {
    return {
      command: 'sendTransaction',
      params: {
        amount: parseFloat(verySimpleTransferMatch[1]),
        to: verySimpleTransferMatch[2]
      }
    };
  }
  
  // Polish version
  const sendMatchPl = message.match(/wyślij\s+([\d.]+)\s+eth\s+do\s+(0x[a-fA-F0-9]{40})/i);
  if (sendMatchPl) {
    return {
      command: 'sendTransaction',
      params: {
        amount: parseFloat(sendMatchPl[1]),
        to: sendMatchPl[2]
      }
    };
  }
  
  return null;
}

/**
 * Executes wallet commands autonomously
 * @param command - The parsed wallet command
 * @param smartWallet - The smart wallet instance
 * @returns Response message with transaction details
 */
async function executeWalletCommand(command: { command: string; params: any }, smartWallet: any): Promise<string> {
  try {
    switch (command.command) {
      case 'checkBalance':
        const balance = await smartWallet.getBalance();
        const balanceEth = Number(balance) / 10 ** 18;
        return `💰 **Wallet Balance:** ${balanceEth.toFixed(6)} ETH\n\nAddress: \`${smartWallet.address}\``;
      
      case 'sendTransaction':
        const { amount, to } = command.params;
        const amountWei = BigInt(Math.floor(amount * 10 ** 18));
        
        console.log(`🤖 Agent executing: Send ${amount} ETH to ${to}`);
        
        const txHash = await smartWallet.sendTransaction(to, amountWei);
        
        return `✅ **Transaction sent successfully!**\n\n` +
               `💰 Amount: ${amount} ETH\n` +
               `📤 To: \`${to}\`\n` +
               `🔗 Hash: [${txHash}](https://basescan.org/tx/${txHash})\n\n` +
               `🌐 [View on BaseScan](https://basescan.org/tx/${txHash})`;
      
      default:
        return `❌ Unknown wallet command: ${command.command}`;
    }
  } catch (error) {
    console.error('❌ Wallet command execution failed:', error);
    return `❌ **Wallet command execution error:**\n\n${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Sends a user message to the NEW user-specific AgentKit backend API and retrieves the agent's response.
 *
 * @async
 * @function callAgentAPI
 * @param {string} userMessage - The message sent by the user.
 * @param {string} userAddress - The user's wallet address for user-specific agent.
 * @returns {Promise<string | null>} The agent's response message or `null` if an error occurs.
 *
 * @throws {Error} Logs an error if the request fails.
 */
async function messageAgent(
  userMessage: string, 
  userAddress?: string, 
  embeddedWallet?: { id: string; address: string },
  smartWalletHook?: any,
  cdpWallet?: any,
  activeWalletType?: 'main' | 'cdp'
): Promise<string | null> {
  try {
    // Require wallet connection and embedded wallet
    if (!userAddress) {
      return "❌ Please connect your wallet first to use the AI agent. The agent needs a connected wallet to create your personal agent wallet and operate autonomously.";
    }

    if (!embeddedWallet) {
      return "❌ Please create an embedded wallet first. Click 'Create Embedded Wallet' to get started.";
    }

    // FIRST: Check if user message contains wallet commands (direct execution)
    let walletResult = '';
    let directWalletCommand = null;
    
    // Try CDP wallet first if available (preferred for spend permissions)
    if (cdpWallet && (cdpWallet.eoaWallet.isConnected || cdpWallet.smartAccount.isConnected)) {
      console.log('🔍 CDP wallet available:', {
        eoaConnected: cdpWallet.eoaWallet.isConnected,
        smartAccountConnected: cdpWallet.smartAccount.isConnected,
        address: cdpWallet.smartAccount.address || cdpWallet.eoaWallet.address,
        supportsSpendPermissions: cdpWallet.smartAccount.supportsSpendPermissions
      });
      
      directWalletCommand = parseWalletCommand(userMessage);
      if (directWalletCommand) {
        console.log('🤖 CDP wallet command detected:', directWalletCommand);
        try {
          const cdpActionProvider = new CDPWalletActionProvider(cdpWallet);
          const result = await cdpActionProvider.processAgentRequest(userMessage);
          
          if (result.success) {
            walletResult = `✅ **CDP Wallet Transaction:**\n\n${result.message}${result.txHash ? `\n\nTransaction: ${result.txHash}` : ''}`;
          } else {
            walletResult = `❌ **CDP Wallet error:**\n\n${result.message || 'Unknown error'}`;
          }
          console.log('✅ CDP wallet command executed:', walletResult);
        } catch (error) {
          console.error('❌ CDP wallet command failed:', error);
          walletResult = `❌ **CDP Wallet error:**\n\n${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    }
    // Fall back to smart wallet if CDP wallet not available
    else if (smartWalletHook && smartWalletHook.isConnected) {
      console.log('🔍 Smart wallet hook available:', {
        isConnected: smartWalletHook.isConnected,
        address: smartWalletHook.address,
        hasGetBalance: typeof smartWalletHook.getBalance === 'function',
        hasSendTransaction: typeof smartWalletHook.sendTransaction === 'function'
      });
      
      directWalletCommand = parseWalletCommand(userMessage);
      if (directWalletCommand) {
        console.log('🤖 Direct wallet command detected:', directWalletCommand);
        try {
          // Create a smartWallet object with the functions from the hook
          const smartWallet = {
            address: smartWalletHook.address,
            getBalance: smartWalletHook.getBalance,
            sendTransaction: smartWalletHook.sendTransaction
          };
          
          console.log('🔧 Created smartWallet object:', {
            address: smartWallet.address,
            hasGetBalance: typeof smartWallet.getBalance === 'function',
            hasSendTransaction: typeof smartWallet.sendTransaction === 'function'
          });
          
          walletResult = await executeWalletCommand(directWalletCommand, smartWallet);
          console.log('✅ Direct wallet command executed:', walletResult);
        } catch (error) {
          console.error('❌ Direct wallet command failed:', error);
          walletResult = `❌ **Wallet command execution error:**\n\n${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    } else {
      console.log('⚠️ No wallet available or connected:', {
        hasCDP: !!cdpWallet,
        cdpConnected: cdpWallet?.eoaWallet.isConnected || cdpWallet?.smartAccount.isConnected,
        hasSmartWallet: !!smartWalletHook,
        smartWalletConnected: smartWalletHook?.isConnected
      });
    }

    // SECOND: Get agent response (if no direct wallet command or as additional context)
    let agentResponse = '';
    if (!directWalletCommand || directWalletCommand.command === 'checkBalance') {
      // Determine which wallet to use based on activeWalletType
      let walletType: 'main' | 'cdp' = 'main';
      let walletAddress = embeddedWallet.address;
      
      if (activeWalletType === 'cdp' && cdpWallet?.smartAccount?.isConnected) {
        walletType = 'cdp';
        walletAddress = cdpWallet.smartAccount.address;
      }
      
      console.log('🤖 Using selected wallet for:', userAddress, 'wallet:', walletAddress, 'type:', walletType);
      const response = await fetch("/api/ai-agent/agent-with-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userMessage: userMessage,
          walletType: walletType,
          walletAddress: walletAddress
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Agent API error:', error);
        agentResponse = `Error: ${error.error || 'Failed to communicate with agent'}`;
      } else {
        const data = await response.json();
        agentResponse = data.response || 'Agent responded but message was empty';
      }
    }

    // THIRD: Combine results
    let finalResponse = '';
    
    if (walletResult && agentResponse) {
      // Both wallet result and agent response
      finalResponse = `${walletResult}\n\n---\n\n🤖 **Odpowiedź Agenta:**\n\n${agentResponse}`;
    } else if (walletResult) {
      // Only wallet result
      finalResponse = walletResult;
    } else if (agentResponse) {
      // Only agent response
      finalResponse = agentResponse;
    } else {
      finalResponse = '❌ No response available';
    }
    
    return finalResponse;
    
  } catch (error) {
    console.error("Error communicating with agent:", error);
    return null;
  }
}

/**
 *
 * This hook manages interactions with the AI agent by making REST calls to the backend.
 * It also stores the local conversation state, tracking messages sent by the user and
 * responses from the agent.
 *
 * #### How It Works
 * - `sendMessage(input)` sends a message to `/api/agent` and updates state.
 * - `messages` stores the chat history.
 * - `isThinking` tracks whether the agent is processing a response.
 *
 * #### See Also
 * - The API logic in `/api/agent.ts`
 *
 * @returns {object} An object containing:
 * - `messages`: The conversation history.
 * - `sendMessage`: A function to send a new message.
 * - `isThinking`: Boolean indicating if the agent is processing a response.
 */
export function useAgent() {
  const { address: userAddress } = useAccount();
  const [messages, setMessages] = useState<{ text: string; sender: "user" | "agent" }[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  /**
   * Sends a user message, updates local state, and retrieves the agent's response.
   * Now uses Privy embedded wallet for AI agent and integrates with smart wallet!
   *
   * @param {string} input - The message from the user.
   * @param {string} userAddress - The user's wallet address.
   * @param {object} embeddedWallet - The Privy embedded wallet info.
   * @param {object} smartWallet - The smart wallet instance for autonomous operations.
   * @param {object} cdpWallet - The CDP wallet instance for spend permissions.
   */
  const sendMessage = async (
    input: string, 
    userAddress?: string, 
    embeddedWallet?: { id: string; address: string },
    smartWalletHook?: any,
    cdpWallet?: any,
    activeWalletType?: 'main' | 'cdp'
  ) => {
    if (!input.trim()) return;

    console.log('📤 sendMessage called with:', {
      input,
      userAddress,
      embeddedWallet: embeddedWallet?.address,
      smartWalletHook: {
        isConnected: smartWalletHook?.isConnected,
        address: smartWalletHook?.address,
        hasGetBalance: typeof smartWalletHook?.getBalance === 'function',
        hasSendTransaction: typeof smartWalletHook?.sendTransaction === 'function'
      }
    });

    setMessages(prev => [...prev, { text: input, sender: "user" }]);
    setIsThinking(true);

    // Use Privy embedded wallet for agent + smart wallet for autonomous operations + CDP wallet for spend permissions
    const responseMessage = await messageAgent(input, userAddress, embeddedWallet, smartWalletHook, cdpWallet, activeWalletType);

    if (responseMessage) {
      // WORKAROUND: Fix common URL issues in agent responses (e.g., base.scan.com -> basescan.org)
      // This handles cases where AgentKit or its dependencies generate incorrect block explorer URLs
      const fixedResponse = fixAgentResponseUrls(responseMessage);
      setMessages(prev => [...prev, { text: fixedResponse, sender: "agent" }]);
    }

    setIsThinking(false);
  };

  return { messages, sendMessage, isThinking };
}
