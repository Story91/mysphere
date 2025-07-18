import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredPaidPins } from '../../utils/firebase';

/**
 * Cron job endpoint do automatycznego czyszczenia wygasłych paid pins
 * Uruchamiany co 5 minut przez Vercel Cron
 */
export async function GET(request: NextRequest) {
  try {
    // Sprawdź czy request pochodzi z cron job (opcjonalne zabezpieczenie)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    console.log('🧹 Starting paid pins cleanup job...');
    
    // Wykonaj cleanup
    const result = await cleanupExpiredPaidPins();
    
    const response = {
      success: true,
      message: 'Cleanup completed successfully',
      expiredPins: result.expiredCount,
      errors: result.errors,
      timestamp: new Date().toISOString()
    };

    console.log('✅ Cleanup job completed:', response);
    
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('❌ Cleanup job failed:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Cleanup job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}

/**
 * Endpoint do manualnego uruchomienia cleanup (dla adminów)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminAddress } = body;

    // Sprawdź czy użytkownik jest adminem
    const ADMIN_ADDRESS = '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd'.toLowerCase();
    if (!adminAddress || adminAddress.toLowerCase() !== ADMIN_ADDRESS) {
      return NextResponse.json(
        { error: 'Only admins can trigger manual cleanup' },
        { status: 403 }
      );
    }

    console.log(`🧹 Manual cleanup triggered by admin: ${adminAddress}`);
    
    const result = await cleanupExpiredPaidPins();
    
    return NextResponse.json({
      success: true,
      message: 'Manual cleanup completed',
      expiredPins: result.expiredCount,
      errors: result.errors,
      triggeredBy: adminAddress,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Manual cleanup failed:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Manual cleanup failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
} 