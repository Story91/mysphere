import { NextRequest, NextResponse } from "next/server";
import { CdpClient } from "@coinbase/cdp-sdk";
import { v5 as uuidv5 } from "uuid";

/**
 * Gets existing agent wallet for a user
 * GET /api/ai-agent/wallet/get?userAddress=0x...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');

    if (!userAddress) {
      return NextResponse.json(
        { error: "User address is required" },
        { status: 400 }
      );
    }

    // Validate environment variables
    const requiredEnvVars = ['CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      return NextResponse.json(
        { error: `Missing required environment variables: ${missingVars.join(', ')}` },
        { status: 500 }
      );
    }

    console.log('🔍 Getting agent wallet for user:', userAddress);

    // Initialize CDP client
    const cdp = new CdpClient();
    
    // Try to get existing agent account using same UUID generation logic
    const agentAccountName = `agent-${userAddress.toLowerCase()}`;
    
    // Generate same deterministic UUID v4 as in create endpoint
    const crypto = require('crypto');
    const deterministicSeed = crypto.createHash('sha256')
      .update(userAddress.toLowerCase())
      .digest('hex');
    
    // Create deterministic UUID v4 from the hash (same logic as create endpoint)
    const hex = deterministicSeed.substring(0, 32);
    const idempotencyKey = [
      hex.substring(0, 8),
      hex.substring(8, 12),
      '4' + hex.substring(13, 16), // Version 4
      ((parseInt(hex.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hex.substring(17, 20), // Variant bits
      hex.substring(20, 32)
    ].join('-');
    
    console.log('Looking for agent with idempotencyKey:', idempotencyKey);
    
    try {
      // Try to create with same idempotencyKey - will return existing if already exists
      const agentAccount = await cdp.evm.createAccount({
        idempotencyKey: idempotencyKey
      });
      
      console.log(`✅ Found agent wallet for user ${userAddress}: ${agentAccount.address}`);

      return NextResponse.json({
        success: true,
        agentAddress: agentAccount.address,
        agentAccountName,
        network: "base-mainnet",
        userAddress
      });

    } catch (error) {
      // Account doesn't exist or other error
      console.log(`ℹ️ No agent wallet found for user ${userAddress}:`, error);
      return NextResponse.json(
        { error: "Agent wallet not found" },
        { status: 404 }
      );
    }

  } catch (error) {
    console.error('❌ Failed to get agent wallet:', error);
    return NextResponse.json(
      { 
        error: "Failed to get agent wallet",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
