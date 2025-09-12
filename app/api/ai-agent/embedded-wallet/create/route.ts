import { NextRequest, NextResponse } from "next/server";
import { PrivyEvmDelegatedEmbeddedWalletProvider } from "@coinbase/agentkit";

/**
 * Create Privy Embedded Wallet for AI Agent
 * POST /api/ai-agent/embedded-wallet/create
 */
export async function POST(request: NextRequest) {
  try {
    const { userAddress, walletId, appId, appSecret, authorizationPrivateKey } = await request.json();

    if (!userAddress || !walletId || !appId || !appSecret || !authorizationPrivateKey) {
      return NextResponse.json(
        { error: "Missing required parameters: userAddress, walletId, appId, appSecret, authorizationPrivateKey" },
        { status: 400 }
      );
    }

    console.log('🔐 Creating Privy embedded wallet for user:', userAddress);

    // Create Privy Embedded Wallet Provider
    const walletProvider = await PrivyEvmDelegatedEmbeddedWalletProvider.configureWithWallet({
      appId,
      appSecret,
      authorizationPrivateKey,
      walletId,
      networkId: "base-mainnet",
      walletType: "embedded"
    });

    const walletAddress = walletProvider.getAddress();
    console.log('✅ Created embedded wallet:', walletAddress);

    return NextResponse.json({
      success: true,
      walletAddress,
      walletId,
      userAddress
    });

  } catch (error) {
    console.error('❌ Failed to create embedded wallet:', error);
    return NextResponse.json(
      { 
        error: "Failed to create embedded wallet",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
