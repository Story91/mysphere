import { NextRequest, NextResponse } from 'next/server';
import { createPaidPin } from '../../utils/firebase';

/**
 * Manual API to add paid pins with real transaction hashes
 * Use this when ContractEventListener fails on production
 */
export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { postId, userAddress, duration, txHash, amountPaid } = await request.json();

    if (!postId || !userAddress || !duration || !txHash || !amountPaid) {
      return NextResponse.json(
        { error: 'Missing required fields: postId, userAddress, duration, txHash, amountPaid' }, 
        { status: 400 }
      );
    }

    console.log(`🔧 Manual pin creation for post ${postId}, tx: ${txHash}`);

    const success = await createPaidPin(postId, userAddress, duration, txHash, amountPaid);

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Pin created manually for post ${postId}`,
        txHash,
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to create pin in Firebase'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('❌ Manual pin creation failed:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET endpoint with predefined pins from your recent transactions
 */
export async function GET(request: NextRequest) {
  const urlSecret = request.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  
  if (urlSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Your recent transactions from Basescan
  const recentPins = [
    {
      postId: "community-rules-post", // Zakładam że to Community Rules post
      owner: "0xe8b8ac32edc7b18c1a86f65b73c3b9b0e965b8fa",
      duration: "HOURS_24",
      txHash: "0xdf4522c0a85",
      amountEth: "0.005"
    },
    {
      postId: "test-post-2",
      owner: "0xe8b8ac32edc7b18c1a86f65b73c3b9b0e965b8fa", 
      duration: "HOURS_24",
      txHash: "0xf284247fc36",
      amountEth: "0.005"
    },
    {
      postId: "test-post-3",
      owner: "0xe8b8ac32edc7b18c1a86f65b73c3b9b0e965b8fa",
      duration: "HOURS_24", 
      txHash: "0x8fddd90ca72",
      amountEth: "0.005"
    }
  ];

  try {
    let result = {
      created: 0,
      errors: [] as string[]
    };

    for (const pin of recentPins) {
      try {
        const success = await createPaidPin(
          pin.postId,
          pin.owner,
          pin.duration as any,
          pin.txHash,
          pin.amountEth
        );

        if (success) {
          result.created++;
          console.log(`✅ Auto pin created: ${pin.postId}`);
        } else {
          result.errors.push(`Failed to create pin for: ${pin.postId}`);
        }
      } catch (error) {
        result.errors.push(`Error creating pin ${pin.postId}: ${error}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Auto-created ${result.created} pins from recent transactions`,
      details: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Auto-creation failed: ${error}`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 