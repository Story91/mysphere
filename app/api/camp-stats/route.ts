import { NextRequest, NextResponse } from 'next/server';
import { 
  getMySphereGlobalStats, 
  saveMySphereUserConnections 
} from '../../utils/firebase';

export async function GET(request: NextRequest) {
  try {
    console.log('📊 Fetching REAL MySphere user statistics from Firebase...');
    
    // Get real statistics from Firebase
    const realStats = await getMySphereGlobalStats();
    
    console.log('✅ Real MySphere stats loaded from Firebase:', {
      totalUsers: realStats.totalUsers,
      fullyConnected: realStats.fullyConnectedUsers,
      dataSource: realStats.dataSource
    });

    return NextResponse.json({
      success: true,
      data: realStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MySphere stats error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch MySphere statistics'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { address, connectedPlatforms } = await request.json();
    
    if (!address || !Array.isArray(connectedPlatforms)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data'
      }, { status: 400 });
    }

    console.log(`📊 Updating social connections for ${address}:`, connectedPlatforms);

    // Save to Firebase
    await saveMySphereUserConnections(address, connectedPlatforms);
    
    return NextResponse.json({
      success: true,
      message: 'Social connections updated successfully in Firebase',
      data: {
        address,
        connectedPlatforms,
        count: connectedPlatforms.length,
        timestamp: new Date().toISOString(),
        savedToFirebase: true
      }
    });

  } catch (error) {
    console.error('❌ Camp stats update error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to update social media statistics'
    }, { status: 500 });
  }
} 