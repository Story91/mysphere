'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import SpotifyTrackCard, { SpotifyTrackData } from './SpotifyTrackCard';

interface MusicSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrack: (track: any) => void; // Będzie przekazywać wybrany utwór
}

interface SpotifyUserData {
  user?: {
    id: string;
    display_name: string;
  };
  profile?: {
    playedTracks?: SpotifyTrackData[];
    savedTracks?: SpotifyTrackData[];
    savedAlbums?: any[];
    savedPlaylists?: any[];
  };
}

export default function MusicSelector({ isOpen, onClose, onSelectTrack }: MusicSelectorProps) {
  const { address } = useAccount();
  const [spotifyData, setSpotifyData] = useState<SpotifyUserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'saved' | 'albums' | 'playlists'>('recent');
  const [error, setError] = useState<string | null>(null);

  // Dane naleza do konkretnego portfela. Bez tego po zmianie konta warunek
  // `!spotifyData` blokowal pobranie i modal pokazywal muzyke poprzedniego adresu.
  useEffect(() => {
    setSpotifyData(null);
    setError(null);
  }, [address]);

  // Pobierz dane Spotify gdy modal się otwiera
  useEffect(() => {
    if (!isOpen || !address || spotifyData) return;

    let cancelled = false;
    fetchSpotifyData(() => cancelled);

    return () => { cancelled = true; };
    // spotifyData celowo poza deps - jest tylko straza "juz mamy dane".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, address]);

  const fetchSpotifyData = async (isCancelled: () => boolean = () => false) => {
    if (!address) return;

    // Check cache first (30 minutes)
    const cacheKey = `spotify_music_data_${address}`;
    const cachedData = localStorage.getItem(cacheKey);
    
    if (cachedData) {
      try {
        const { data, timestamp } = JSON.parse(cachedData);
        const cacheAge = Date.now() - timestamp;
        const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
        
        if (cacheAge < CACHE_DURATION) {
          console.log('🎵 Using cached Spotify data');
          if (!isCancelled()) setSpotifyData(data);
          return;
        }
      } catch (e) {
        console.warn('Invalid cache data, fetching fresh');
      }
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('🎵 Fetching fresh Spotify data for music selector...');
      const response = await fetch(`/api/camp/spotify?address=${address}&type=full`);
      const data = await response.json();
      // Odpowiedz dla poprzedniego adresu (albo po zamknieciu) nie moze wygrac.
      if (isCancelled()) return;

      if (data.success) {
        setSpotifyData(data.data);

        // Cache the data
        localStorage.setItem(cacheKey, JSON.stringify({
          data: data.data,
          timestamp: Date.now()
        }));

        console.log('✅ Spotify data loaded and cached:', {
          recentTracks: data.data.profile?.playedTracks?.length || 0,
          savedTracks: data.data.profile?.savedTracks?.length || 0,
          savedAlbums: data.data.profile?.savedAlbums?.length || 0,
          savedPlaylists: data.data.profile?.savedPlaylists?.length || 0
        });
      } else {
        setError(data.message || 'Failed to fetch Spotify data');
      }
    } catch (err) {
      if (isCancelled()) return;
      console.error('❌ Error fetching Spotify data:', err);
      setError('Network error while fetching Spotify data');
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  };

  const handleSelectTrack = (trackData: SpotifyTrackData) => {
    // Przekaż wybrane dane utworu do rodzica
    onSelectTrack({
      id: trackData.track.id,
      name: trackData.track.name,
      artists: trackData.track.artists,
      album: trackData.track.album,
      duration_ms: trackData.track.duration_ms,
      popularity: trackData.track.popularity,
      preview_url: trackData.track.preview_url,
      external_urls: trackData.track.external_urls
    });
    onClose();
  };

  const handleRefreshData = () => {
    // Clear cache and fetch fresh data
    if (address) {
      const cacheKey = `spotify_music_data_${address}`;
      localStorage.removeItem(cacheKey);
      setSpotifyData(null);
      fetchSpotifyData();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              🎵 Select Track from Spotify
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefreshData}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Refresh Spotify data"
                disabled={loading}
              >
                <svg className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 mt-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('recent')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'recent'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Recently Played
            </button>
            <button
              onClick={() => setActiveTab('saved')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'saved'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Saved Tracks
            </button>
            <button
              onClick={() => setActiveTab('albums')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'albums'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Albums
            </button>
            <button
              onClick={() => setActiveTab('playlists')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'playlists'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Playlists
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full"></div>
              <span className="ml-3 text-gray-600 dark:text-gray-300">Loading Spotify data...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 mb-4">❌ {error}</div>
              <button
                onClick={() => { void fetchSpotifyData(); }}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : !spotifyData ? (
            <div className="text-center py-12 text-gray-600 dark:text-gray-300">
              No Spotify data found for this user
            </div>
          ) : (
            <div className="space-y-3">
              {/* Recently Played Tracks */}
              {activeTab === 'recent' && (
                <>
                  {spotifyData.profile?.playedTracks?.length ? (
                    spotifyData.profile.playedTracks.slice(0, 20).map((trackData, index) => (
                      <div
                        key={`recent-${index}`}
                        className="relative hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <SpotifyTrackCard
                          trackData={trackData}
                          isCompact={true}
                          showAudioPlayer={false}
                          disableLinks={true}
                        />
                        {/* ➕ Add Track Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTrack(trackData);
                          }}
                          className="absolute top-3 right-3 w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-110 border-2 border-white/20 z-10"
                          title="Add track to post"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No recently played tracks found
                    </div>
                  )}
                </>
              )}

              {/* Saved Tracks */}
              {activeTab === 'saved' && (
                <>
                  {spotifyData.profile?.savedTracks?.length ? (
                    spotifyData.profile.savedTracks.slice(0, 20).map((trackData, index) => (
                      <div
                        key={`saved-${index}`}
                        className="relative hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <SpotifyTrackCard
                          trackData={trackData}
                          isCompact={true}
                          showAudioPlayer={false}
                          disableLinks={true}
                        />
                        {/* ➕ Add Track Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTrack(trackData);
                          }}
                          className="absolute top-3 right-3 w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-110 border-2 border-white/20 z-10"
                          title="Add track to post"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No saved tracks found
                    </div>
                  )}
                </>
              )}

              {/* Albums & Playlists - coming soon */}
              {(activeTab === 'albums' || activeTab === 'playlists') && (
                <div className="text-center py-8 text-gray-500">
                  This feature will be available soon...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="text-sm text-gray-600 dark:text-gray-400 text-center space-y-1">
            <div>💡 Click on a track to add it to your post</div>
            <div className="text-xs opacity-75">
              📊 Data cached for 30 minutes • Use refresh button for latest tracks
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}