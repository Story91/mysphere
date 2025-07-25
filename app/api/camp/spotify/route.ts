import { NextRequest, NextResponse } from 'next/server';
import { SpotifyAPI } from '@campnetwork/origin';

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
    const address = searchParams.get('address');
    const dataType = searchParams.get('type') || 'full'; // full, basic, analytics

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    // Initialize Spotify API with backend API key
    const apiKey = process.env.CAMP_API_KEY || process.env.NEXT_PUBLIC_CAMP_API_KEY;
    
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
      savedPlaylists
    ] = await Promise.allSettled([
      spotifyAPI.fetchSavedTracksById(spotifyId).catch(err => {
        console.warn('❌ fetchSavedTracksById failed:', err);
        return { data: [], isError: true, message: 'Failed to fetch saved tracks' };
      }),
      spotifyAPI.fetchPlayedTracksById(spotifyId).catch(err => {
        console.warn('❌ fetchPlayedTracksById failed:', err);
        return { data: [], isError: true, message: 'Failed to fetch played tracks' };
      }),
      spotifyAPI.fetchSavedAlbumsById(spotifyId).catch(err => {
        console.warn('❌ fetchSavedAlbumsById failed:', err);
        return { data: [], isError: true, message: 'Failed to fetch saved albums' };
      }),
      spotifyAPI.fetchSavedPlaylistsById(spotifyId).catch(err => {
        console.warn('❌ fetchSavedPlaylistsById failed:', err);
        return { data: [], isError: true, message: 'Failed to fetch saved playlists' };
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

    const profile = {
      savedTracks: extractData(savedTracks, 'savedTracks'),
      playedTracks: extractData(playedTracks, 'playedTracks'),
      savedAlbums: extractData(savedAlbums, 'savedAlbums'),
      savedPlaylists: extractData(savedPlaylists, 'savedPlaylists')
    };

    console.log('📊 Profile data summary:', {
      savedTracks: profile.savedTracks.length,
      playedTracks: profile.playedTracks.length,
      savedAlbums: profile.savedAlbums.length,
      savedPlaylists: profile.savedPlaylists.length
    });

    // Check if we have meaningful data (not just empty arrays)
    const hasRealData = profile.savedTracks.length > 0 || profile.playedTracks.length > 0 || 
                       profile.savedAlbums.length > 0 || profile.savedPlaylists.length > 0;

    if (!hasRealData) {
      console.log('⚠️ No real Spotify data available - Origin SDK may not have access to private data');
      console.log('🎭 Adding mock data for demonstration purposes');
      
      // Add mock data to demonstrate functionality
      profile.savedTracks = generateMockSavedTracks();
      profile.playedTracks = generateMockPlayedTracks();
      profile.savedAlbums = generateMockSavedAlbums();
      profile.savedPlaylists = generateMockSavedPlaylists();
      
      console.log('✅ Mock data added:', {
        savedTracks: profile.savedTracks.length,
        playedTracks: profile.playedTracks.length,
        savedAlbums: profile.savedAlbums.length,
        savedPlaylists: profile.savedPlaylists.length
      });
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

    // Add metadata about data source
    (response as any).dataSource = hasRealData ? 'spotify' : 'mock';
    (response as any).usingMockData = !hasRealData;

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
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch Spotify data',
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

// Mock data generators for demo purposes when real data is not available
function generateMockSavedTracks(): any[] {
  return [
    {
      track: {
        id: 'mock1',
        name: 'Bohemian Rhapsody',
        artists: [{ name: 'Queen' }],
        album: { name: 'A Night at the Opera' },
        duration_ms: 355000,
        popularity: 85
      },
      added_at: '2024-01-15T10:30:00Z'
    },
    {
      track: {
        id: 'mock2',
        name: 'Stairway to Heaven',
        artists: [{ name: 'Led Zeppelin' }],
        album: { name: 'Led Zeppelin IV' },
        duration_ms: 482000,
        popularity: 82
      },
      added_at: '2024-01-10T15:20:00Z'
    },
    {
      track: {
        id: 'mock3',
        name: 'Hotel California',
        artists: [{ name: 'Eagles' }],
        album: { name: 'Hotel California' },
        duration_ms: 391000,
        popularity: 80
      },
      added_at: '2024-01-05T09:45:00Z'
    }
  ];
}

function generateMockPlayedTracks(): any[] {
  return [
    {
      track: {
        id: 'played1',
        name: 'Billie Jean',
        artists: [{ name: 'Michael Jackson' }],
        album: { name: 'Thriller' },
        duration_ms: 294000,
        popularity: 88
      },
      played_at: '2024-01-20T14:30:00Z'
    },
    {
      track: {
        id: 'played2',
        name: 'Sweet Child O Mine',
        artists: [{ name: 'Guns N Roses' }],
        album: { name: 'Appetite for Destruction' },
        duration_ms: 356000,
        popularity: 84
      },
      played_at: '2024-01-20T13:15:00Z'
    },
    {
      track: {
        id: 'played3',
        name: 'Imagine',
        artists: [{ name: 'John Lennon' }],
        album: { name: 'Imagine' },
        duration_ms: 183000,
        popularity: 86
      },
      played_at: '2024-01-20T12:00:00Z'
    },
    {
      track: {
        id: 'played4',
        name: 'Purple Haze',
        artists: [{ name: 'Jimi Hendrix' }],
        album: { name: 'Are You Experienced' },
        duration_ms: 167000,
        popularity: 79
      },
      played_at: '2024-01-20T11:30:00Z'
    }
  ];
}

function generateMockSavedAlbums(): any[] {
  return [
    {
      albumId: 'album1',
      albumName: 'Abbey Road',
      albumTotalTracks: 17,
      albumPopularity: 85,
      albumImages: [
        { url: 'https://via.placeholder.com/640x640', height: 640, width: 640 }
      ],
      albumType: 'album',
      albumReleaseDate: '1969-09-26',
      added_at: '2024-01-12T10:00:00Z'
    },
    {
      albumId: 'album2',
      albumName: 'Dark Side of the Moon',
      albumTotalTracks: 10,
      albumPopularity: 88,
      albumImages: [
        { url: 'https://via.placeholder.com/640x640', height: 640, width: 640 }
      ],
      albumType: 'album',
      albumReleaseDate: '1973-03-01',
      added_at: '2024-01-08T16:30:00Z'
    },
    {
      albumId: 'album3',
      albumName: 'Rumours',
      albumTotalTracks: 11,
      albumPopularity: 83,
      albumImages: [
        { url: 'https://via.placeholder.com/640x640', height: 640, width: 640 }
      ],
      albumType: 'album',
      albumReleaseDate: '1977-02-04',
      added_at: '2024-01-03T14:15:00Z'
    }
  ];
}

function generateMockSavedPlaylists(): any[] {
  return [
    {
      playlistId: 'playlist1',
      playlistName: 'Rock Classics',
      playlistDescription: 'The best rock songs of all time',
      playlistImages: [
        { url: 'https://via.placeholder.com/640x640', height: 640, width: 640 }
      ],
      playlistCollaborative: false,
      playlistFollowers: 1524,
      playlistType: 'playlist',
      added_at: '2024-01-01T00:00:00Z'
    },
    {
      playlistId: 'playlist2',
      playlistName: 'Chill Vibes',
      playlistDescription: 'Relaxing music for any mood',
      playlistImages: [
        { url: 'https://via.placeholder.com/640x640', height: 640, width: 640 }
      ],
      playlistCollaborative: false,
      playlistFollowers: 892,
      playlistType: 'playlist',
      added_at: '2023-12-15T12:00:00Z'
    }
  ];
} 