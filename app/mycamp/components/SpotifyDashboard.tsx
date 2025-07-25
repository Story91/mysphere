'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useAuthState, useSocials } from '@campnetwork/origin/react';
import MusicSocialFeatures from './MusicSocialFeatures';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface SpotifyProfile {
  savedTracks: any[];
  playedTracks: any[];
  savedAlbums: any[];
  savedPlaylists: any[];
}

interface SpotifyAnalytics {
  totalSavedTracks: number;
  totalPlayedTracks: number;
  totalSavedAlbums: number;
  totalSavedPlaylists: number;
  listeningDiversity: number;
}

interface SpotifyData {
  user: any;
  profile: SpotifyProfile;
  analytics: SpotifyAnalytics;
}

export default function SpotifyDashboard() {
  const { address } = useAccount();
  const { authenticated } = useAuthState();
  const { data: socialsData } = useSocials();
  const [spotifyData, setSpotifyData] = useState<SpotifyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'tracks' | 'albums' | 'playlists' | 'social'>('overview');
  const [nftMinting, setNftMinting] = useState(false);
  const [nftPreview, setNftPreview] = useState<any>(null);
  const [showNftModal, setShowNftModal] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const isSpotifyConnected = (socialsData as any)?.spotify;

  useEffect(() => {
    if (authenticated && address && isSpotifyConnected) {
      fetchSpotifyData();
    }
  }, [authenticated, address, isSpotifyConnected]);

  const fetchSpotifyData = async () => {
    if (!address) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('🎵 Fetching comprehensive Spotify data for address:', address);
      const response = await fetch(`/api/camp/spotify?address=${address}&type=full`);
      const data = await response.json();
      
      console.log('📊 Raw API response:', data);
      
      if (data.success) {
        setSpotifyData(data.data);
        console.log('✅ Spotify data loaded successfully:', {
          user: data.data.user?.display_name,
          savedTracks: data.data.profile?.savedTracks?.length || 0,
          playedTracks: data.data.profile?.playedTracks?.length || 0,
          savedAlbums: data.data.profile?.savedAlbums?.length || 0,
          savedPlaylists: data.data.profile?.savedPlaylists?.length || 0,
          listeningDiversity: data.data.analytics?.listeningDiversity
        });
      } else {
        console.error('❌ API returned error:', data);
        setError(data.message || data.error || 'Failed to fetch Spotify data');
      }
    } catch (err) {
      console.error('❌ Error fetching Spotify data:', err);
      setError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getDiversityColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getActivityLevel = (totalItems: number) => {
    if (totalItems >= 1000) return { label: 'Super Active', color: 'text-purple-400' };
    if (totalItems >= 500) return { label: 'Very Active', color: 'text-green-400' };
    if (totalItems >= 200) return { label: 'Active', color: 'text-blue-400' };
    if (totalItems >= 50) return { label: 'Moderate', color: 'text-yellow-400' };
    return { label: 'Casual', color: 'text-gray-400' };
  };

  const createChartData = () => {
    if (!spotifyData) return [];
    
    return [
      {
        name: 'Saved Tracks',
        value: spotifyData.analytics.totalSavedTracks,
        color: '#1DB954'
      },
      {
        name: 'Played Tracks',
        value: spotifyData.analytics.totalPlayedTracks,
        color: '#1ed760'
      },
      {
        name: 'Albums',
        value: spotifyData.analytics.totalSavedAlbums,
        color: '#535353'
      },
      {
        name: 'Playlists',
        value: spotifyData.analytics.totalSavedPlaylists,
        color: '#b3b3b3'
      }
    ];
  };

  const handleMintNFT = async () => {
    if (!address || !spotifyData) return;
    
    setNftMinting(true);
    setError(null);
    
    try {
      console.log('🎨 Starting Music NFT minting process...');
      const response = await fetch('/api/camp/spotify/mint-nft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          spotifyData
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setNftPreview(data.data);
        setShowNftModal(true);
        console.log('✅ Music NFT prepared successfully:', data.data);
      } else {
        setError(data.message || 'Failed to prepare Music NFT');
      }
    } catch (err) {
      console.error('❌ Error minting Music NFT:', err);
      setError('Failed to mint Music NFT');
    } finally {
      setNftMinting(false);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case 'legendary': return 'text-purple-400';
      case 'epic': return 'text-pink-400';
      case 'rare': return 'text-blue-400';
      case 'uncommon': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const runDebugTest = async () => {
    if (!address) return;
    
    setDebugLoading(true);
    setDebugData(null);
    
    try {
      console.log('🔍 Running Origin SDK debug test...');
      const response = await fetch(`/api/camp/spotify/debug?address=${address}`);
      const data = await response.json();
      
      setDebugData(data);
      console.log('🧪 Debug test completed:', data);
    } catch (err) {
      console.error('❌ Debug test failed:', err);
      setDebugData({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setDebugLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="bg-black/40 rounded-xl p-6 border border-orange-500/20">
        <p className="text-orange-200 text-center">Please connect to Camp Network first</p>
      </div>
    );
  }

  if (!isSpotifyConnected) {
    return (
      <div className="bg-black/40 rounded-xl p-6 border border-orange-500/20">
        <div className="text-center">
          <div className="text-6xl mb-4">🎵</div>
          <h3 className="text-xl font-bold text-orange-200 mb-2">Connect Your Spotify Account</h3>
          <p className="text-orange-200/70 mb-4">
            Link your Spotify account to see your detailed music analytics and activity
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-black/40 rounded-xl p-6 border border-orange-500/20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
          <p className="text-orange-200">Loading your Spotify data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-black/40 rounded-xl p-6 border border-red-500/20">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h3 className="text-xl font-bold text-red-300 mb-2">Error Loading Spotify Data</h3>
          <p className="text-red-200/70 mb-4">{error}</p>
          
          <div className="bg-red-500/10 rounded-lg p-4 mb-4 text-left">
            <h4 className="text-red-300 font-medium mb-2">🔍 Possible Issues:</h4>
            <ul className="text-red-200/70 text-sm space-y-1">
              <li>• Spotify account not properly linked to Origin SDK</li>
              <li>• Origin SDK permissions may be limited</li>
              <li>• Camp Network API key issues</li>
              <li>• Spotify API rate limiting</li>
            </ul>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={fetchSpotifyData}
              disabled={loading}
              className={`px-4 py-2 rounded-lg transition-colors ${
                loading 
                  ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
                  : 'bg-green-500/20 hover:bg-green-500/30 text-green-300'
              }`}
            >
              {loading ? 'Retrying...' : 'Retry'}
            </button>
            <button
              onClick={() => window.open('https://camp.network', '_blank')}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition-colors"
            >
              Check Camp Network
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!spotifyData) {
    return (
      <div className="bg-black/40 rounded-xl p-6 border border-orange-500/20">
        <div className="text-center">
          <div className="text-6xl mb-4">🎵</div>
          <h3 className="text-xl font-bold text-orange-200 mb-2">No Spotify Data Available</h3>
          <p className="text-orange-200/70 mb-4">
            We couldn't load your Spotify data. This might be because:
          </p>
          <div className="bg-orange-500/10 rounded-lg p-4 mb-4 text-left">
            <ul className="text-orange-200/70 text-sm space-y-1">
              <li>• Your Spotify account needs to be linked to Origin SDK</li>
              <li>• Origin SDK may not have access to your private Spotify data</li>
              <li>• Demo data will be shown instead of real data</li>
            </ul>
          </div>
          <button
            onClick={fetchSpotifyData}
            className="px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const totalActivity = spotifyData.analytics.totalSavedTracks + spotifyData.analytics.totalPlayedTracks;
  const activityLevel = getActivityLevel(totalActivity);
  const chartData = createChartData();

  return (
    <div className="space-y-6">
      {/* Mock Data Notice */}
      {(spotifyData as any)?.usingMockData && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-xl p-4 border border-yellow-500/30"
        >
          <div className="flex items-center gap-3">
            <div className="text-2xl">🎭</div>
            <div>
              <h4 className="text-yellow-300 font-bold">Demo Mode Active</h4>
              <p className="text-yellow-200/70 text-sm">
                We're showing demo data because Origin SDK doesn't have access to your private Spotify data yet. 
                The interface shows how your real data would look!
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-green-500/10 to-green-600/10 rounded-xl p-6 border border-green-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">🎵</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-green-300">Your Spotify Profile</h2>
              <p className="text-green-200/70">
                {spotifyData.user.display_name || 'Spotify User'} • {spotifyData.user.followers || 0} followers
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold ${activityLevel.color}`}>
              {activityLevel.label} Listener
            </div>
            <div className="text-green-200/70 text-sm">
              {totalActivity.toLocaleString()} total items
            </div>
            {(spotifyData as any)?.usingMockData && (
              <div className="text-yellow-400 text-xs mt-1 px-2 py-1 bg-yellow-500/20 rounded-full">
                🎭 Demo Data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View Mode Selector */}
      <div className="flex gap-2 bg-black/20 rounded-lg p-1">
        {[
          { id: 'overview', label: 'Overview', icon: '📊' },
          { id: 'tracks', label: 'Tracks', icon: '🎵' },
          { id: 'albums', label: 'Albums', icon: '💿' },
          { id: 'playlists', label: 'Playlists', icon: '📚' },
          { id: 'social', label: 'Social', icon: '👥' }
        ].map((mode) => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id as any)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              viewMode === mode.id
                ? 'bg-green-500/20 text-green-300'
                : 'text-orange-200/70 hover:text-orange-200 hover:bg-orange-500/10'
            }`}
          >
            {mode.icon} {mode.label}
          </button>
        ))}
      </div>

      {/* Overview Mode */}
      {viewMode === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Analytics Cards */}
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-black/40 rounded-xl p-4 border border-green-500/20"
            >
              <h3 className="text-lg font-bold text-green-300 mb-3">📈 Analytics Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {spotifyData.analytics.totalSavedTracks.toLocaleString()}
                  </div>
                  <div className="text-green-200/70 text-sm">Saved Tracks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">
                    {spotifyData.analytics.totalPlayedTracks.toLocaleString()}
                  </div>
                  <div className="text-green-200/70 text-sm">Played Tracks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">
                    {spotifyData.analytics.totalSavedAlbums.toLocaleString()}
                  </div>
                  <div className="text-green-200/70 text-sm">Albums</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">
                    {spotifyData.analytics.totalSavedPlaylists.toLocaleString()}
                  </div>
                  <div className="text-green-200/70 text-sm">Playlists</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-black/40 rounded-xl p-4 border border-green-500/20"
            >
              <h3 className="text-lg font-bold text-green-300 mb-3">🎯 Listening Diversity</h3>
              <div className="text-center">
                <div className={`text-4xl font-bold ${getDiversityColor(spotifyData.analytics.listeningDiversity)}`}>
                  {spotifyData.analytics.listeningDiversity}%
                </div>
                <div className="text-green-200/70 text-sm mt-2">
                  Based on your collection variety and listening volume
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 mt-3">
                  <div
                    className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all duration-1000"
                    style={{ width: `${spotifyData.analytics.listeningDiversity}%` }}
                  ></div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-black/40 rounded-xl p-4 border border-green-500/20"
          >
            <h3 className="text-lg font-bold text-green-300 mb-3">📊 Music Activity Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '8px',
                    color: '#22c55e'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      )}

      {/* Social Features View */}
      {viewMode === 'social' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-black/40 rounded-xl p-6 border border-green-500/20"
        >
          <MusicSocialFeatures currentUserData={spotifyData} />
        </motion.div>
      )}

      {/* Tracks View */}
      {viewMode === 'tracks' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-black/40 rounded-xl p-6 border border-green-500/20"
        >
          <h3 className="text-xl font-bold text-green-300 mb-4">🎵 Your Tracks</h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Saved Tracks */}
            <div>
              <h4 className="text-lg font-bold text-blue-300 mb-3">
                💾 Saved Tracks ({spotifyData.analytics.totalSavedTracks})
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {spotifyData.profile.savedTracks.slice(0, 5).map((item: any, index: number) => (
                  <div key={index} className="bg-black/20 rounded-lg p-3 border border-blue-500/20">
                    <div className="font-medium text-blue-200">{item.track?.name || 'Unknown Track'}</div>
                    <div className="text-blue-200/70 text-sm">
                      {item.track?.artists?.[0]?.name || 'Unknown Artist'} • {item.track?.album?.name || 'Unknown Album'}
                    </div>
                    <div className="text-blue-200/50 text-xs mt-1">
                      Added: {item.added_at ? new Date(item.added_at).toLocaleDateString() : 'Unknown'}
                    </div>
                  </div>
                ))}
                {spotifyData.profile.savedTracks.length > 5 && (
                  <div className="text-center text-blue-200/70 text-sm">
                    ... and {spotifyData.profile.savedTracks.length - 5} more tracks
                  </div>
                )}
              </div>
            </div>

            {/* Recently Played */}
            <div>
              <h4 className="text-lg font-bold text-purple-300 mb-3">
                🎧 Recently Played ({spotifyData.analytics.totalPlayedTracks})
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {spotifyData.profile.playedTracks.slice(0, 5).map((item: any, index: number) => (
                  <div key={index} className="bg-black/20 rounded-lg p-3 border border-purple-500/20">
                    <div className="font-medium text-purple-200">{item.track?.name || 'Unknown Track'}</div>
                    <div className="text-purple-200/70 text-sm">
                      {item.track?.artists?.[0]?.name || 'Unknown Artist'} • {item.track?.album?.name || 'Unknown Album'}
                    </div>
                    <div className="text-purple-200/50 text-xs mt-1">
                      Played: {item.played_at ? new Date(item.played_at).toLocaleDateString() : 'Unknown'}
                    </div>
                  </div>
                ))}
                {spotifyData.profile.playedTracks.length > 5 && (
                  <div className="text-center text-purple-200/70 text-sm">
                    ... and {spotifyData.profile.playedTracks.length - 5} more tracks
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Albums View */}
      {viewMode === 'albums' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-black/40 rounded-xl p-6 border border-green-500/20"
        >
          <h3 className="text-xl font-bold text-green-300 mb-4">💿 Your Albums ({spotifyData.analytics.totalSavedAlbums})</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {spotifyData.profile.savedAlbums.map((album: any, index: number) => (
              <div key={index} className="bg-black/20 rounded-lg p-4 border border-yellow-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-lg">💿</span>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-yellow-200">{album.albumName || 'Unknown Album'}</div>
                    <div className="text-yellow-200/70 text-sm">{album.albumTotalTracks || 0} tracks</div>
                    <div className="text-yellow-200/50 text-xs">
                      {album.albumReleaseDate ? new Date(album.albumReleaseDate).getFullYear() : 'Unknown Year'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Playlists View */}
      {viewMode === 'playlists' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-black/40 rounded-xl p-6 border border-green-500/20"
        >
          <h3 className="text-xl font-bold text-green-300 mb-4">📚 Your Playlists ({spotifyData.analytics.totalSavedPlaylists})</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {spotifyData.profile.savedPlaylists.map((playlist: any, index: number) => (
              <div key={index} className="bg-black/20 rounded-lg p-4 border border-pink-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-lg">📚</span>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-pink-200">{playlist.playlistName || 'Unknown Playlist'}</div>
                    <div className="text-pink-200/70 text-sm">{playlist.playlistDescription || 'No description'}</div>
                    <div className="text-pink-200/50 text-xs">
                      {playlist.playlistFollowers ? `${playlist.playlistFollowers.toLocaleString()} followers` : 'No followers data'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Debug Info (Development Only) */}
      {process.env.NODE_ENV === 'development' && spotifyData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-black/60 rounded-xl p-4 border border-gray-500/20"
        >
          <details className="cursor-pointer">
            <summary className="text-gray-300 font-medium mb-2">🔧 Debug Info (Development)</summary>
            <div className="text-xs text-gray-400 space-y-1">
              <div>User ID: {spotifyData.user?.id || 'N/A'}</div>
              <div>Display Name: {spotifyData.user?.display_name || 'N/A'}</div>
              <div>Raw Data Counts:</div>
              <div className="ml-4">
                <div>• Saved Tracks: {spotifyData.profile?.savedTracks?.length || 0}</div>
                <div>• Played Tracks: {spotifyData.profile?.playedTracks?.length || 0}</div>
                <div>• Albums: {spotifyData.profile?.savedAlbums?.length || 0}</div>
                <div>• Playlists: {spotifyData.profile?.savedPlaylists?.length || 0}</div>
              </div>
              <div>Listening Diversity: {spotifyData.analytics?.listeningDiversity || 0}%</div>
              <div>
                Origin SDK Status: {address ? '✅ Connected' : '❌ No Address'} | 
                Spotify Connected: {isSpotifyConnected ? '✅ Yes' : '❌ No'}
              </div>
              <div>
                Data Source: {(spotifyData as any)?.dataSource === 'spotify' ? '🎵 Real Spotify Data' : '🎭 Mock Demo Data'}
              </div>
            </div>
          </details>
        </motion.div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 justify-center">
        <button
          onClick={fetchSpotifyData}
          disabled={loading}
          className={`px-6 py-3 rounded-lg transition-colors font-medium ${
            loading 
              ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
              : 'bg-green-500/20 hover:bg-green-500/30 text-green-300'
          }`}
        >
          {loading ? (
            <>
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-green-400 mr-2"></div>
              Loading...
            </>
          ) : (
            '🔄 Refresh Data'
          )}
        </button>
        <button
          className={`px-6 py-3 rounded-lg transition-colors font-medium ${
            nftMinting 
              ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
              : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300'
          }`}
          onClick={handleMintNFT}
          disabled={nftMinting || !spotifyData}
        >
          {nftMinting ? (
            <>
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400 mr-2"></div>
              Preparing NFT...
            </>
          ) : (
                         '🎨 Mint Music NFT'
           )}
        </button>
        {process.env.NODE_ENV === 'development' && (
          <button
            onClick={runDebugTest}
            disabled={debugLoading}
            className={`px-6 py-3 rounded-lg transition-colors font-medium ${
              debugLoading 
                ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
                : 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300'
            }`}
          >
            {debugLoading ? (
              <>
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400 mr-2"></div>
                Testing...
              </>
            ) : (
              '🔍 Test Origin SDK'
            )}
          </button>
        )}
      </div>

      {/* Debug Results Modal */}
      {debugData && process.env.NODE_ENV === 'development' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-yellow-900/90 to-orange-900/90 backdrop-blur-sm border border-yellow-500/30 rounded-2xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-yellow-200">🔍 Origin SDK Debug Results</h3>
              <button
                onClick={() => setDebugData(null)}
                className="text-yellow-300 hover:text-yellow-200 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {debugData.success ? (
                <>
                  <div className="bg-black/40 rounded-lg p-4">
                    <h4 className="text-yellow-300 font-bold mb-2">✅ User Data Found</h4>
                    <div className="text-sm text-yellow-200/70">
                      <div>Spotify ID: {debugData.debugResults.spotifyId}</div>
                      <div>User: {debugData.debugResults.userData?.data?.spotifyUser?.display_name || 'N/A'}</div>
                    </div>
                  </div>

                  <div className="bg-black/40 rounded-lg p-4">
                    <h4 className="text-yellow-300 font-bold mb-2">🧪 Method Test Results</h4>
                    <div className="space-y-2">
                      {Object.entries(debugData.debugResults.methodTests || {}).map(([method, result]: [string, any]) => (
                        <div key={method} className="flex items-center justify-between p-2 bg-black/20 rounded">
                          <span className="text-yellow-200">{method}</span>
                          <div className="text-right">
                            {result.success ? (
                              <div className="text-green-400 text-sm">
                                ✅ {result.dataLength === 'not array' ? 'No data' : `${result.dataLength} items`}
                                {result.isError && <span className="text-red-400"> (API Error)</span>}
                              </div>
                            ) : (
                              <div className="text-red-400 text-sm">❌ {result.error}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {debugData.debugResults.availableMethods && (
                    <div className="bg-black/40 rounded-lg p-4">
                      <h4 className="text-yellow-300 font-bold mb-2">📋 Available Methods</h4>
                      <div className="text-sm text-yellow-200/70">
                        {debugData.debugResults.availableMethods.join(', ')}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-red-500/20 rounded-lg p-4">
                  <h4 className="text-red-300 font-bold mb-2">❌ Debug Test Failed</h4>
                  <div className="text-red-200/70 text-sm">{debugData.error || debugData.message}</div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDebugData(null)}
                className="flex-1 px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
                  alert('Debug data copied to clipboard!');
                }}
                className="flex-1 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded-lg transition-colors"
              >
                📋 Copy Debug Data
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* NFT Preview Modal */}
      {showNftModal && nftPreview && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-purple-900/90 to-pink-900/90 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-6 max-w-lg w-full mx-4"
          >
            <div className="text-center">
              <div className="text-6xl mb-4">🎵</div>
              <h3 className="text-2xl font-bold text-purple-200 mb-2">Music NFT Preview</h3>
              
              <div className="bg-black/40 rounded-xl p-4 mb-4">
                <img 
                  src={nftPreview.metadata.image} 
                  alt="Music NFT"
                  className="w-32 h-32 mx-auto rounded-xl mb-4"
                />
                <h4 className="text-lg font-bold text-white mb-2">{nftPreview.preview.name}</h4>
                <p className="text-purple-200/70 text-sm mb-4">{nftPreview.metadata.description}</p>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-purple-500/20 rounded-lg p-2">
                    <div className="text-purple-200/70">Rarity</div>
                    <div className={`font-bold ${getRarityColor(nftPreview.preview.rarity)}`}>
                      {nftPreview.preview.rarity}
                    </div>
                  </div>
                  <div className="bg-purple-500/20 rounded-lg p-2">
                    <div className="text-purple-200/70">Estimated Value</div>
                    <div className="font-bold text-green-400">{nftPreview.preview.estimated_value}</div>
                  </div>
                  <div className="bg-purple-500/20 rounded-lg p-2">
                    <div className="text-purple-200/70">Diversity Score</div>
                    <div className="font-bold text-blue-400">{nftPreview.preview.listening_diversity}%</div>
                  </div>
                  <div className="bg-purple-500/20 rounded-lg p-2">
                    <div className="text-purple-200/70">Total Activity</div>
                    <div className="font-bold text-yellow-400">{nftPreview.preview.total_activity.toLocaleString()}</div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNftModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 rounded-lg transition-colors"
                >
                  Close Preview
                </button>
                <button
                  onClick={() => {
                    // This would integrate with Origin SDK IpNFT minting
                    alert('🚀 Full Origin SDK IpNFT minting integration coming soon!');
                    setShowNftModal(false);
                  }}
                  className="flex-1 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg transition-colors font-medium"
                >
                  🚀 Mint on Origin
                </button>
              </div>
              
              <p className="text-purple-200/50 text-xs mt-3">
                Powered by Origin SDK IpNFT • Unique digital representation of your music taste
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
} 