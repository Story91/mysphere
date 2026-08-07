/**
 * GET /api/camp/spotify?address=0x...&type=full|basic|analytics
 *
 * Proxy do Camp Network po dane Spotify danego portfela. Kosztuje nas duzo
 * wiecej niz trasa X - jedno zadanie rozwija sie w piec zapytan na zewnatrz
 * (utwory zapisane, odtworzone, albumy, playlisty, /top), wszystkie naszym
 * kluczem CAMP_API_KEY. Dlatego wpuszczaniem zajmuje sie guardCampRead
 * (app/utils/camp/proxyGuard.ts) i robi to PRZED pierwszym wyjsciem na zewnatrz.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SpotifyAPI } from '@campnetwork/origin';
import { guardCampRead } from '../../../utils/camp/proxyGuard';

// Trasa czyta dane z zadania (nextUrl / naglowki), wiec nie da sie jej
// prerenderowac. Bez tej deklaracji Next probuje ja wygenerowac statycznie
// przy buildzie i zasmieca log stacktrace'ami DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

// Straz czyta sesje przez node:crypto - na edge tego modulu nie ma.
export const runtime = 'nodejs';

interface SpotifyAPIResponse {
  isError: boolean;
  data: any;
  message: string;
}

interface SpotifyUserData {
  user: any;
  profile: {
    savedTracks: any[];
    playedTracks: any[];
    savedAlbums: any[];
    savedPlaylists: any[];
    topArtists: string[];
    topGenres: string[];
  };
  analytics: {
    totalSavedTracks: number;
    totalPlayedTracks: number;
    totalSavedAlbums: number;
    totalSavedPlaylists: number;
    listeningDiversity: number;
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.nextUrl);
    const dataType = searchParams.get('type') || 'full'; // full, basic, analytics

    const guard = guardCampRead(request, searchParams.get('address'));
    if (!guard.ok) return guard.response;
    const address = guard.address;

    // Initialize Spotify API with backend API key
    const apiKey = process.env.CAMP_API_KEY;
    
    if (!apiKey) {
      throw new Error('Camp API key not found in environment variables');
    }
    
    const spotifyAPI = new SpotifyAPI({ 
      apiKey: apiKey
    });

    console.log(`🎵 Fetching Spotify data for ${address}, type: ${dataType}`);

    // First, get the basic user data by wallet address
    const userData = await spotifyAPI.fetchUserByWalletAddress(address) as SpotifyAPIResponse;
    
    if (!userData || userData.isError || !userData.data?.spotifyUser?.id) {
      return NextResponse.json({
        success: false,
        message: 'No Spotify data found for this wallet address',
        data: null
      });
    }

    const spotifyId = userData.data.spotifyUser.id;
    console.log(`🎵 Found Spotify ID: ${spotifyId}`);

    // Return basic data if requested
    if (dataType === 'basic') {
      return NextResponse.json({
        success: true,
        data: userData.data,
        type: 'basic'
      });
    }

    console.log(`🎵 Fetching comprehensive Spotify data for user: ${spotifyId}`);
    
    // Fetch comprehensive profile data using available Origin SDK methods
    const [
      savedTracks,
      playedTracks,
      savedAlbums,
      savedPlaylists,
      topArtistsAndGenres
    ] = await Promise.allSettled([
      spotifyAPI.fetchSavedTracksById(spotifyId).catch((err: any) => {
        console.warn('❌ fetchSavedTracksById failed:', err);
        return { data: [], isError: true, message: 'Failed to fetch saved tracks' };
      }),
      spotifyAPI.fetchPlayedTracksById(spotifyId).catch((err: any) => {
        console.warn('❌ fetchPlayedTracksById failed:', err);
        return { data: [], isError: true, message: 'Failed to fetch played tracks' };
      }),
      spotifyAPI.fetchSavedAlbumsById(spotifyId).catch((err: any) => {
        console.warn('❌ fetchSavedAlbumsById failed:', err);
        return { data: [], isError: true, message: 'Failed to fetch saved albums' };
      }),
      spotifyAPI.fetchSavedPlaylistsById(spotifyId).catch((err: any) => {
        console.warn('❌ fetchSavedPlaylistsById failed:', err);
        return { data: [], isError: true, message: 'Failed to fetch saved playlists' };
      }),
      // Direct HTTP call to /top endpoint since SDK method name is unclear
      fetch(`https://wv2h4to5qa.execute-api.us-east-2.amazonaws.com/dev/spotify/top?spotifyId=${spotifyId}&time_range=long_term`, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      })
      .then(response => response.json())
      .then(data => {
        console.log('✅ Direct /top API call success:', { 
          isError: data.isError, 
          hasNames: !!data.data?.names?.length,
          hasGenres: !!data.data?.genres?.length 
        });
        return data;
      })
      .catch((err: any) => {
        console.warn('❌ Direct /top API call failed:', err);
        return { data: { names: [], genres: [] }, isError: true, message: 'Failed to fetch top artists and genres' };
      })
    ]);

    // Extract results with detailed logging
    const extractData = (result: any, name: string) => {
      if (result.status === 'fulfilled') {
        const response = result.value as SpotifyAPIResponse;
        console.log(`✅ ${name} success:`, {
          isError: response.isError,
          dataLength: Array.isArray(response.data) ? response.data.length : 'not array',
          message: response.message
        });
        
        if (!response.isError && response.data) {
          return Array.isArray(response.data) ? response.data : [];
        }
      } else {
        console.warn(`❌ ${name} failed:`, result.reason);
      }
      return [];
    };

    // Extract top artists and genres data
    const extractTopData = (result: any, name: string) => {
      if (result.status === 'fulfilled') {
        const response = result.value as SpotifyAPIResponse;
        console.log(`✅ ${name} success:`, {
          isError: response.isError,
          dataType: typeof response.data,
          hasNames: !!response.data?.names,
          hasGenres: !!response.data?.genres,
          message: response.message
        });
        
        if (!response.isError && response.data) {
          return {
            topArtists: response.data.names || [],
            topGenres: response.data.genres || []
          };
        }
      } else {
        console.warn(`❌ ${name} failed:`, result.reason);
      }
      return { topArtists: [], topGenres: [] };
    };

    const topData = extractTopData(topArtistsAndGenres, 'topArtistsAndGenres');
    
    const profile = {
      savedTracks: extractData(savedTracks, 'savedTracks'),
      playedTracks: extractData(playedTracks, 'playedTracks'),
      savedAlbums: extractData(savedAlbums, 'savedAlbums'),
      savedPlaylists: extractData(savedPlaylists, 'savedPlaylists'),
      topArtists: topData.topArtists,
      topGenres: topData.topGenres
    };

    console.log('📊 Profile data summary:', {
      savedTracks: profile.savedTracks.length,
      playedTracks: profile.playedTracks.length,
      savedAlbums: profile.savedAlbums.length,
      savedPlaylists: profile.savedPlaylists.length,
      topArtists: profile.topArtists.length,
      topGenres: profile.topGenres.length
    });

    // Check if we have meaningful data (not just empty arrays)
    const hasRealData = profile.savedTracks.length > 0 || profile.playedTracks.length > 0 || 
                       profile.savedAlbums.length > 0 || profile.savedPlaylists.length > 0 ||
                       profile.topArtists.length > 0 || profile.topGenres.length > 0;

    // Check if we have a valid Spotify connection (user exists)
    const hasSpotifyConnection = userData.data.spotifyUser && userData.data.spotifyUser.id;

    if (!hasSpotifyConnection) {
      console.log('❌ No Spotify connection found');
      return NextResponse.json({
        success: false,
        message: 'No Spotify account connected for this wallet address',
        data: null
      });
    }

    // If user is connected but has no data, that's OK - don't add mock data
    if (!hasRealData) {
      console.log('✅ Spotify connected but user has no saved content - this is normal');
      console.log('📭 Empty profile data (user may not have saved any content yet)');
    } else {
      console.log('✅ Using real Spotify data from Origin SDK');
    }

    // Calculate analytics
    const analytics = {
      totalSavedTracks: profile.savedTracks.length,
      totalPlayedTracks: profile.playedTracks.length,
      totalSavedAlbums: profile.savedAlbums.length,
      totalSavedPlaylists: profile.savedPlaylists.length,
      listeningDiversity: calculateListeningDiversity(profile)
    };

    const response: SpotifyUserData = {
      user: userData.data.spotifyUser,
      profile,
      analytics
    };

    // Add metadata about data source - always real data if user is connected
    (response as any).dataSource = hasSpotifyConnection ? 'spotify' : 'none';
    (response as any).usingMockData = false;
    (response as any).hasContent = hasRealData;

    // Return analytics only if requested
    if (dataType === 'analytics') {
      return NextResponse.json({
        success: true,
        data: { user: userData.data.spotifyUser, analytics },
        type: 'analytics'
      });
    }

    // Return full data
    return NextResponse.json({
      success: true,
      data: response,
      type: 'full'
    });

  } catch (error) {
    console.error('❌ Error fetching Spotify data:', error);
    // Kod bledu odroznia awarie od "ten portfel nic nie podpial" - bez niego
    // klient rysowal jedno i drugie tak samo, czyli pustka.
    return NextResponse.json(
      {
        success: false,
        error: 'Camp Network did not answer for this wallet. This is a failure, not an empty profile.',
        code: 'upstream_failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Calculate listening diversity score (0-100)
function calculateListeningDiversity(profile: any): number {
  const totalItems = profile.savedTracks.length + profile.playedTracks.length;
  const totalAlbums = profile.savedAlbums.length;
  const totalPlaylists = profile.savedPlaylists.length;
  
  if (totalItems === 0) return 0;
  
  // Diversity score based on collection variety and listening volume
  const collectionScore = Math.min((totalAlbums + totalPlaylists) * 2, 50); // Max 50 points for collections
  const volumeScore = Math.min(totalItems / 100 * 50, 50); // Max 50 points for volume
  
  return Math.round(collectionScore + volumeScore);
}

 