import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { createPaidPin } from '../../utils/firebase';

/**
 * Backup cron job - automatically sync recent contract events
 * Runs every 2 minutes as backup for ContractEventListener
 */
export async function GET(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 Starting recent events sync backup...');
    
    const client = createPublicClient({
      chain: base,
      transport: http()
    });

    // Zwiększamy okno do ~15 minut (150 bloków), aby mieć większy bufor bezpieczeństwa
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - BigInt(150); 
    console.log(`🔍 Scanning for PinCreated events from block ${fromBlock} to ${currentBlock}`);

    const pinCreatedEvents = await client.getLogs({
      address: '0x163bd9Ec5267491963163dE70D0B64f9400a20AD' as `0x${string}`,
      event: parseAbiItem('event PinCreated(address indexed owner, string indexed postId, uint8 duration, uint256 amount, uint256 expiresAt)'),
      fromBlock,
      toBlock: 'latest'
    });

    if (pinCreatedEvents.length === 0) {
      console.log('✅ No new PinCreated events found in the given block range.');
    } else {
      console.log(`🔥 Found ${pinCreatedEvents.length} new PinCreated events to process.`);
    }

    let syncedCount = 0;
    const errors: string[] = [];

    for (const event of pinCreatedEvents) {
      try {
        const { owner, postId, duration, amount, expiresAt } = event.args;
        const txHash = event.transactionHash;

        if (owner && postId && txHash && duration !== undefined) {
          const durationMapping = ['HOUR_1', 'HOURS_6', 'HOURS_24', 'DAYS_7'] as const;
          const mappedDuration = durationMapping[duration] || 'HOURS_24';
          const amountEth = (Number(amount) / 1e18).toString();

          // Try to create pin (will fail if already exists)
          const success = await createPaidPin(postId, owner, mappedDuration, txHash, amountEth);
          
          if (success) {
            syncedCount++;
            console.log(`✅ Synced pin: ${postId} by ${owner}`);
          }
        }
      } catch (error) {
        errors.push(`Event sync error: ${error}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Recent events sync completed',
      eventsFound: pinCreatedEvents.length,
      syncedCount,
      errors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Recent events sync failed:', error);
    return NextResponse.json({
      success: false,
      error: 'Sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 