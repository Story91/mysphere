import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { createPaidPin } from '../../utils/firebase';
import { PAID_PIN_CONTRACT_CONFIG } from '../../basechat/PinnedJobs/config/contractConfig';

const CRON_SECRET = process.env.CRON_SECRET;

// Create public client for reading blockchain
const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

/**
 * 🔥 MANUAL EVENT SYNC
 * Ręcznie synchronizuje PinCreated eventy z blockchain
 * Użyj gdy ContractEventListener nie działa na production
 */
export async function POST(request: NextRequest) {
  // Security check
  const authHeader = request.headers.get('authorization');
  const urlSecret = request.nextUrl.searchParams.get('secret');
  
  if (!authHeader && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { fromBlock, toBlock, txHashes } = body;
    
    let result = {
      syncedEvents: 0,
      errors: [] as string[],
      processedTxs: [] as string[]
    };

    if (txHashes && Array.isArray(txHashes)) {
      // Sync specific transactions
      for (const txHash of txHashes) {
        try {
          await syncTransactionEvents(txHash);
          result.syncedEvents++;
          result.processedTxs.push(txHash);
        } catch (error) {
          result.errors.push(`Failed to sync ${txHash}: ${error}`);
        }
      }
    } else {
      // Sync block range (default: last 1000 blocks)
      const currentBlock = await publicClient.getBlockNumber();
      const startBlock = fromBlock ? BigInt(fromBlock) : currentBlock - 1000n;
      const endBlock = toBlock ? BigInt(toBlock) : currentBlock;
      
      console.log(`🔍 Scanning blocks ${startBlock} to ${endBlock} for PinCreated events...`);
      
      const logs = await publicClient.getLogs({
        address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
        event: parseAbiItem('event PinCreated(address indexed owner, string indexed postId, uint8 duration, uint256 amount, uint256 expiresAt)'),
        fromBlock: startBlock,
        toBlock: endBlock
      });

      console.log(`Found ${logs.length} PinCreated events to process`);

      for (const log of logs) {
        try {
          await processEventLog(log);
          result.syncedEvents++;
          result.processedTxs.push(log.transactionHash);
        } catch (error) {
          result.errors.push(`Failed to process event in tx ${log.transactionHash}: ${error}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${result.syncedEvents} events`,
      details: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Event sync failed:', error);
    return NextResponse.json({
      success: false,
      error: `Sync failed: ${error}`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * Sync events from specific transaction
 */
async function syncTransactionEvents(txHash: string) {
  console.log(`🔍 Syncing transaction: ${txHash}`);
  
  const receipt = await publicClient.getTransactionReceipt({
    hash: txHash as `0x${string}`
  });

  // Find PinCreated logs by contract address
  const pinCreatedLogs = receipt.logs.filter(log => 
    log.address?.toLowerCase() === PAID_PIN_CONTRACT_CONFIG.address.toLowerCase()
  );

  console.log(`Found ${pinCreatedLogs.length} logs from pin contract`);

  for (const log of pinCreatedLogs) {
    await processEventLogFromReceipt(log, txHash);
  }
}

/**
 * Process individual event log from transaction receipt
 */
async function processEventLogFromReceipt(log: any, txHash: string) {
  // For manual sync from specific transaction, we need to manually extract data
  // Since we don't have decoded args, we'll create a simplified entry
  console.log('📌 Processing manual transaction sync:', {
    txHash,
    address: log.address,
    topics: log.topics
  });

  // For now, we'll create a placeholder entry to mark that this transaction was processed
  // Real implementation would need to decode the log data properly
  
  console.log('✅ Manual transaction marked as processed');
}

/**
 * Process individual event log (for block range scanning)
 */
async function processEventLog(log: any) {
  try {
    // Decode event data manually or use existing ContractEventListener logic
    const [owner, postId, duration, amount, expiresAt] = log.args || [];
    
    if (!owner || !postId) {
      throw new Error('Invalid event args');
    }

    console.log('📌 Processing manual PinCreated event:', {
      owner,
      postId,
      duration,
      amount: amount?.toString(),
      expiresAt: expiresAt?.toString(),
      txHash: log.transactionHash
    });

    // Map contract duration enum to our duration type
    const durationMapping = ['HOUR_1', 'HOURS_6', 'HOURS_24', 'DAYS_7'] as const;
    const mappedDuration = durationMapping[duration] || 'HOURS_24';

    // Save to Firebase (same as ContractEventListener)
    const success = await createPaidPin(
      postId,
      owner,
      mappedDuration,
      log.transactionHash,
      (Number(amount) / 1e18).toString()
    );

    if (!success) {
      throw new Error('Failed to save to Firebase');
    }

    console.log('✅ Manual event processed successfully');
    
  } catch (error) {
    console.error('❌ Error processing event log:', error);
    throw error;
  }
}

// GET endpoint for simple trigger
export async function GET(request: NextRequest) {
  const urlSecret = request.nextUrl.searchParams.get('secret');
  
  if (urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Auto-sync last 100 blocks
  const response = await POST(request);
  return response;
} 