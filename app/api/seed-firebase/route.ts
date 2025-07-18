import { NextRequest, NextResponse } from 'next/server';
import { 
  seedCompleteTestData, 
  seedActivePaidPins, 
  seedExpiredPaidPins, 
  seedTestPostsWithPaidPins,
  forceIndexCreation,
  cleanupTestData
} from '../../utils/firebase-seed';

// Secret dla API endpoint security
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Basic security check
  const authHeader = request.headers.get('authorization');
  const urlSecret = request.nextUrl.searchParams.get('secret');
  
  if (!authHeader && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const action = request.nextUrl.searchParams.get('action') || 'seed-all';

  try {
    let result;

    switch (action) {
      case 'seed-all':
        console.log('🚀 Seeding complete test data...');
        result = await seedCompleteTestData();
        return NextResponse.json({
          success: true,
          action: 'seed-all',
          message: `Successfully seeded ${result.totalCreated} documents and triggered ${result.indexesTriggered} index queries`,
          details: result,
          timestamp: new Date().toISOString(),
          note: 'Check Firebase Console for index creation links in errors'
        });

      case 'seed-active':
        console.log('🌱 Seeding active paid pins...');
        result = await seedActivePaidPins();
        return NextResponse.json({
          success: true,
          action: 'seed-active',
          message: `Created ${result.created} active paid pins`,
          details: result,
          timestamp: new Date().toISOString()
        });

      case 'seed-expired':
        console.log('🌱 Seeding expired paid pins...');
        result = await seedExpiredPaidPins();
        return NextResponse.json({
          success: true,
          action: 'seed-expired',
          message: `Created ${result.created} expired paid pins`,
          details: result,
          timestamp: new Date().toISOString()
        });

      case 'seed-posts':
        console.log('🌱 Seeding test posts...');
        result = await seedTestPostsWithPaidPins();
        return NextResponse.json({
          success: true,
          action: 'seed-posts',
          message: `Created ${result.created} test posts with paid pins`,
          details: result,
          timestamp: new Date().toISOString()
        });

      case 'force-indexes':
        console.log('🔥 Forcing index creation...');
        result = await forceIndexCreation();
        return NextResponse.json({
          success: true,
          action: 'force-indexes',
          message: `Triggered ${result.triggeredQueries.length} index queries`,
          details: result,
          timestamp: new Date().toISOString(),
          note: 'Firebase errors above contain index creation links'
        });

      case 'cleanup':
        console.log('🧹 Cleaning up test data...');
        result = await cleanupTestData();
        return NextResponse.json({
          success: true,
          action: 'cleanup',
          message: `Deleted ${result.deleted} test documents`,
          details: result,
          timestamp: new Date().toISOString()
        });

      default:
        return NextResponse.json({
          error: 'Invalid action',
          availableActions: [
            'seed-all',      // Complete seeding + index creation
            'seed-active',   // Only active paid pins
            'seed-expired',  // Only expired paid pins  
            'seed-posts',    // Only test posts
            'force-indexes', // Only index creation queries
            'cleanup'        // Remove all test data
          ]
        }, { status: 400 });
    }

  } catch (error) {
    console.error(`❌ Seeding action '${action}' failed:`, error);
    
    return NextResponse.json({
      success: false,
      error: `Seeding failed: ${error}`,
      action,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Same logic as GET but accepts JSON body for advanced options
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader?.includes(CRON_SECRET || 'missing-secret')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action = 'seed-all', options = {} } = body;

    console.log(`🎯 POST seeding action: ${action}`, options);

    // For now, just call the same functions as GET
    // In future, options could customize behavior
    const result = await seedCompleteTestData();

    return NextResponse.json({
      success: true,
      action,
      message: `POST seeding completed: ${result.totalCreated} documents, ${result.indexesTriggered} index queries`,
      details: result,
      options,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ POST seeding failed:', error);
    
    return NextResponse.json({
      success: false,
      error: `POST seeding failed: ${error}`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 