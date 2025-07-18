import { NextRequest, NextResponse } from 'next/server';
import { 
  debugAllPaidPins, 
  debugPostPinStatus, 
  debugPinByTxHash, 
  debugUserPaidPins 
} from '../../utils/debug-paid-pins';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'overview';
  const userAddress = searchParams.get('user');
  const txHash = searchParams.get('tx');
  const postId = searchParams.get('post');

  try {
    let result;

    switch (action) {
      case 'overview':
        result = await debugAllPaidPins();
        return NextResponse.json({
          success: true,
          action: 'overview',
          data: result,
          timestamp: new Date().toISOString()
        });

      case 'user':
        if (!userAddress) {
          return NextResponse.json(
            { error: 'User address required for user action' },
            { status: 400 }
          );
        }
        result = await debugUserPaidPins(userAddress);
        return NextResponse.json({
          success: true,
          action: 'user',
          userAddress,
          data: result,
          timestamp: new Date().toISOString()
        });

      case 'tx':
        if (!txHash) {
          return NextResponse.json(
            { error: 'Transaction hash required for tx action' },
            { status: 400 }
          );
        }
        result = await debugPinByTxHash(txHash);
        return NextResponse.json({
          success: true,
          action: 'tx',
          txHash,
          data: result,
          timestamp: new Date().toISOString()
        });

      case 'post':
        if (!postId) {
          return NextResponse.json(
            { error: 'Post ID required for post action' },
            { status: 400 }
          );
        }
        result = await debugPostPinStatus(postId);
        return NextResponse.json({
          success: true,
          action: 'post',
          postId,
          data: result,
          timestamp: new Date().toISOString()
        });

      default:
        return NextResponse.json({
          error: 'Invalid action',
          availableActions: [
            'overview - Get all paid pins overview',
            'user - Get pins for specific user (?user=0x...)',
            'tx - Find pin by transaction hash (?tx=0x...)',
            'post - Check post pin status (?post=postId)'
          ]
        }, { status: 400 });
    }

  } catch (error) {
    console.error(`❌ Debug action '${action}' failed:`, error);
    
    return NextResponse.json({
      success: false,
      error: `Debug failed: ${error}`,
      action,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 