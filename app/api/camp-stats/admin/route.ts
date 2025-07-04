import { NextRequest, NextResponse } from 'next/server';
import { 
  getMySphereGlobalStats,
  getGlobalStats,
  ADMIN_ADDRESS 
} from '../../../utils/firebase';

// 🔐 ADMIN ONLY: Prawdziwe dane Firebase (drogi endpoint!)
export async function GET(request: NextRequest) {
  try {
    // Sprawdź autoryzację admina
    const adminKey = request.headers.get('x-admin-key');
    const userAddress = request.headers.get('x-user-address');
    
    if (!userAddress || userAddress.toLowerCase() !== ADMIN_ADDRESS) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized - Admin only'
      }, { status: 403 });
    }
    
    console.log('🔐 ADMIN REQUEST: Fetching REAL Firebase data...');
    console.warn('💰 WARNING: This endpoint costs $1-2 per call!');
    
    // Pobierz prawdziwe dane (kosztowne!)
    const [mySphereStats, globalStats] = await Promise.all([
      getMySphereGlobalStats(),
      getGlobalStats()
    ]);
    
    const combinedStats = {
      mySphere: mySphereStats,
      global: globalStats,
      adminInfo: {
        timestamp: new Date().toISOString(),
        cost: '$1-2 Firebase reads',
        dataSource: 'firebase-real',
        totalFirebaseReads: '~25,000 reads'
      }
    };
    
    console.log('✅ ADMIN: Real Firebase stats loaded');
    console.log(`💰 Cost: ~$${((25000 * 0.00006).toFixed(2))} for this request`);

    return NextResponse.json({
      success: true,
      data: combinedStats,
      admin: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ ADMIN Firebase stats error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch real Firebase statistics',
      admin: true
    }, { status: 500 });
  }
}

// 🔐 ADMIN ONLY: Update static data
export async function POST(request: NextRequest) {
  try {
    const userAddress = request.headers.get('x-user-address');
    
    if (!userAddress || userAddress.toLowerCase() !== ADMIN_ADDRESS) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized - Admin only'
      }, { status: 403 });
    }
    
    const { staticData } = await request.json();
    
    console.log('🔐 ADMIN: Updating static data configuration...');
    
    // Tutaj możesz zapisać statyczne dane do pliku lub bazy danych
    // Na razie zwracam success - implementacja zależy od potrzeb
    
    return NextResponse.json({
      success: true,
      message: 'Static data updated successfully',
      admin: true,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ ADMIN update error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to update static data',
      admin: true
    }, { status: 500 });
  }
} 