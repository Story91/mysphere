import { NextRequest, NextResponse } from "next/server";

/**
 * Funds agent wallet via user's connected wallet
 * POST /api/ai-agent/wallet/fund
 * 
 * Note: This endpoint returns transaction data for the user to sign
 * The actual funding happens via user's wallet (MetaMask/Coinbase Wallet)
 */
export async function POST(request: NextRequest) {
  try {
    const { userAddress, agentAddress, amount } = await request.json();

    if (!userAddress || !agentAddress || !amount) {
      return NextResponse.json(
        { error: "userAddress, agentAddress, and amount are required" },
        { status: 400 }
      );
    }

    console.log('💰 Funding request:', { userAddress, agentAddress, amount });

    // Return transaction data for frontend to execute
    // The user will sign this transaction with their connected wallet
    return NextResponse.json({
      success: true,
      transactionData: {
        to: agentAddress,
        value: amount, // Should be in wei
        from: userAddress,
        data: "0x" // Empty data for simple ETH transfer
      },
      message: `Transfer ${amount} ETH to agent wallet`
    });

  } catch (error) {
    console.error('❌ Failed to prepare funding transaction:', error);
    return NextResponse.json(
      { 
        error: "Failed to prepare funding transaction",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
