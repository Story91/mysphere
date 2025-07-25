import { NextRequest, NextResponse } from 'next/server';
import { SpotifyAPI } from '@campnetwork/origin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.nextUrl);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const apiKey = process.env.CAMP_API_KEY || process.env.NEXT_PUBLIC_CAMP_API_KEY;
    
    if (!apiKey) {
      throw new Error('Camp API key not found in environment variables');
    }
    
    const spotifyAPI = new SpotifyAPI({ 
      apiKey: apiKey
    });

    console.log('🔍 DEBUG: Testing Origin SDK Spotify methods for address:', address);

    // First, get user data by wallet address
    const userData = await spotifyAPI.fetchUserByWalletAddress(address);
    console.log('📊 fetchUserByWalletAddress result:', JSON.stringify(userData, null, 2));

    if (!userData || (userData as any).isError || !(userData as any).data?.spotifyUser?.id) {
      return NextResponse.json({
        success: false,
        message: 'No Spotify user found for this wallet address',
        debugInfo: {
          userData,
          address,
          apiKeyPresent: !!apiKey
        }
      });
    }

    const spotifyId = (userData as any).data.spotifyUser.id;
    console.log('🎵 Found Spotify ID:', spotifyId);

    // Test each method individually
    const methods = [
      'fetchSavedTracksById',
      'fetchPlayedTracksById', 
      'fetchSavedAlbumsById',
      'fetchSavedPlaylistsById'
    ];

    const results: any = {
      userData,
      spotifyId,
      methodTests: {}
    };

    for (const methodName of methods) {
      try {
        console.log(`🧪 Testing ${methodName}...`);
        const method = (spotifyAPI as any)[methodName];
        
        if (typeof method !== 'function') {
          results.methodTests[methodName] = {
            error: 'Method not found on SpotifyAPI',
            available: false
          };
          continue;
        }

        const startTime = Date.now();
        const result = await method.call(spotifyAPI, spotifyId);
        const endTime = Date.now();

        console.log(`✅ ${methodName} completed in ${endTime - startTime}ms:`, {
          isError: (result as any)?.isError,
          dataLength: Array.isArray((result as any)?.data) ? (result as any).data.length : 'not array',
          message: (result as any)?.message
        });

        results.methodTests[methodName] = {
          success: true,
          duration: endTime - startTime,
          isError: (result as any)?.isError,
          hasData: !!(result as any)?.data,
          dataType: typeof (result as any)?.data,
          dataLength: Array.isArray((result as any)?.data) ? (result as any).data.length : 'not array',
          message: (result as any)?.message,
          firstItem: Array.isArray((result as any)?.data) && (result as any).data.length > 0 ? (result as any).data[0] : null
        };

      } catch (error) {
        console.error(`❌ ${methodName} failed:`, error);
        results.methodTests[methodName] = {
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        };
      }
    }

    // Test any additional methods that might exist
    console.log('🔍 Available methods on SpotifyAPI:', Object.getOwnPropertyNames(SpotifyAPI.prototype));
    results.availableMethods = Object.getOwnPropertyNames(SpotifyAPI.prototype);

    return NextResponse.json({
      success: true,
      debugResults: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Debug endpoint failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
} 