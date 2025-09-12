import { NextRequest, NextResponse } from "next/server";
import { CdpClient } from "@coinbase/cdp-sdk";
import { v4 as uuidv4, v5 as uuidv5 } from "uuid";

/**
 * Creates a new agent wallet for a user
 * POST /api/ai-agent/wallet/create
 */
export async function POST(request: NextRequest) {
  try {
    const { userAddress } = await request.json();

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

    console.log('🚀 Creating agent wallet for user:', userAddress);

    // Initialize CDP client
    const cdp = new CdpClient();
    
    // Create agent account for this user (TEE-secured)
    const agentAccountName = `agent-${userAddress.toLowerCase()}`;
    
    // CDP requires UUID v4 format, but we need deterministic behavior
    // Use crypto to create deterministic seed, then generate UUID v4 from it
    const crypto = require('crypto');
    const deterministicSeed = crypto.createHash('sha256')
      .update(userAddress.toLowerCase())
      .digest('hex');
    
    // Create deterministic UUID v4 from the hash
    // Take first 32 chars of hash and format as UUID v4
    const hex = deterministicSeed.substring(0, 32);
    const idempotencyKey = [
      hex.substring(0, 8),
      hex.substring(8, 12),
      '4' + hex.substring(13, 16), // Version 4
      ((parseInt(hex.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hex.substring(17, 20), // Variant bits
      hex.substring(20, 32)
    ].join('-');
    
    console.log('Generated idempotencyKey:', idempotencyKey);
    
    const agentAccount = await cdp.evm.createAccount({
      idempotencyKey: idempotencyKey // Use proper UUID v4 format
    });

    console.log(`✅ Created agent wallet for user ${userAddress}: ${agentAccount.address}`);

    return NextResponse.json({
      success: true,
      agentAddress: agentAccount.address,
      agentAccountName,
      network: "base-mainnet",
      userAddress
    });

  } catch (error) {
    console.error('❌ Failed to create agent wallet:', error);
    return NextResponse.json(
      { 
        error: "Failed to create agent wallet",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
