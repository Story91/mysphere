'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useAuthState, useSocials } from '@campnetwork/origin/react';

interface MusicProfile {
  address: string;
  user: {
    display_name: string;
    id: string;
    followers: number;
  };
  analytics: {
    totalSavedTracks: number;
    totalPlayedTracks: number;
    totalSavedAlbums: number;
    totalSavedPlaylists: number;
    listeningDiversity: number;
  };
  similarity?: number;
  commonGenres?: string[];
  activityLevel?: string;
}

interface MusicSocialFeaturesProps {
  currentUserData: any;
}

export default function MusicSocialFeatures({ currentUserData }: MusicSocialFeaturesProps) {
  const { address } = useAccount();
  const { authenticated } = useAuthState();
  const { data: socialsData } = useSocials();
  const [similarUsers, setSimilarUsers] = useState<MusicProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<MusicProfile | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  const isSpotifyConnected = (socialsData as any)?.spotify;

  useEffect(() => {
    if (authenticated && isSpotifyConnected && currentUserData) {
      // Mock data for similar users - in a real app, this would come from an API
      setSimilarUsers(generateMockSimilarUsers());
    }
  }, [authenticated, isSpotifyConnected, currentUserData]);

  const generateMockSimilarUsers = (): MusicProfile[] => {
    const mockUsers = [
      {
        address: '0x1234...5678',
        user: {
          display_name: 'AudioExplorer',
          id: 'audioexplorer123',
          followers: 42
        },
        analytics: {
          totalSavedTracks: 1247,
          totalPlayedTracks: 3421,
          totalSavedAlbums: 89,
          totalSavedPlaylists: 15,
          listeningDiversity: 78
        },
        similarity: 85,
        commonGenres: ['Electronic', 'Indie Rock', 'Alternative'],
        activityLevel: 'Very Active'
      },
      {
        address: '0x2345...6789',
        user: {
          display_name: 'MelodyMaster',
          id: 'melodymaster456',
          followers: 128
        },
        analytics: {
          totalSavedTracks: 892,
          totalPlayedTracks: 2156,
          totalSavedAlbums: 67,
          totalSavedPlaylists: 23,
          listeningDiversity: 82
        },
        similarity: 79,
        commonGenres: ['Jazz', 'Classical', 'Ambient'],
        activityLevel: 'Active'
      },
      {
        address: '0x3456...7890',
        user: {
          display_name: 'BassLover',
          id: 'basslover789',
          followers: 89
        },
        analytics: {
          totalSavedTracks: 654,
          totalPlayedTracks: 1832,
          totalSavedAlbums: 45,
          totalSavedPlaylists: 12,
          listeningDiversity: 65
        },
        similarity: 73,
        commonGenres: ['Hip Hop', 'R&B', 'Electronic'],
        activityLevel: 'Active'
      }
    ];

    return mockUsers;
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 80) return 'text-green-400';
    if (similarity >= 70) return 'text-yellow-400';
    if (similarity >= 60) return 'text-orange-400';
    return 'text-red-400';
  };

  const calculateCompatibilityScore = (user1: any, user2: MusicProfile): number => {
    if (!user1 || !user2) return 0;
    
    const diversityDiff = Math.abs(user1.analytics.listeningDiversity - user2.analytics.listeningDiversity);
    const activityDiff = Math.abs(
      (user1.analytics.totalSavedTracks + user1.analytics.totalPlayedTracks) - 
      (user2.analytics.totalSavedTracks + user2.analytics.totalPlayedTracks)
    );
    
    // Simple compatibility algorithm
    const diversityScore = Math.max(0, 100 - diversityDiff);
    const activityScore = Math.max(0, 100 - (activityDiff / 100));
    
    return Math.round((diversityScore + activityScore) / 2);
  };

  if (!authenticated || !isSpotifyConnected) {
    return (
      <div className="bg-black/40 rounded-xl p-6 border border-green-500/20">
        <div className="text-center">
          <div className="text-6xl mb-4">🎵</div>
          <h3 className="text-xl font-bold text-green-300 mb-2">Music Social Features</h3>
          <p className="text-green-200/70">
            Connect your Spotify account to discover users with similar music taste
          </p>
        </div>
      </div>
    );
  }

  if (!currentUserData) {
    return (
      <div className="bg-black/40 rounded-xl p-6 border border-green-500/20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
          <p className="text-green-200">Loading your music profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-xl p-6 border border-green-500/20">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-green-300">🎵 Music Social Network</h2>
            <p className="text-green-200/70">
              Discover and connect with users who share your musical taste
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                compareMode
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
              }`}
            >
              {compareMode ? '📊 Exit Compare' : '🔍 Compare Mode'}
            </button>
          </div>
        </div>
      </div>

      {/* Your Music Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black/40 rounded-xl p-4 border border-green-500/20"
      >
        <h3 className="text-lg font-bold text-green-300 mb-3">Your Music Profile</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              {currentUserData.analytics.listeningDiversity}%
            </div>
            <div className="text-green-200/70 text-sm">Diversity</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">
              {(currentUserData.analytics.totalSavedTracks + currentUserData.analytics.totalPlayedTracks).toLocaleString()}
            </div>
            <div className="text-green-200/70 text-sm">Total Activity</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">
              {currentUserData.analytics.totalSavedAlbums}
            </div>
            <div className="text-green-200/70 text-sm">Albums</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {currentUserData.analytics.totalSavedPlaylists}
            </div>
            <div className="text-green-200/70 text-sm">Playlists</div>
          </div>
        </div>
      </motion.div>

      {/* Similar Users */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-green-300">🎯 Users with Similar Taste</h3>
        <div className="grid gap-4">
          {similarUsers.map((user, index) => (
            <motion.div
              key={user.address}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-black/40 rounded-xl p-4 border border-green-500/10 hover:border-green-500/30 transition-all cursor-pointer"
              onClick={() => setSelectedUser(user)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                    <span className="text-lg">🎵</span>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-green-200">{user.user.display_name}</h4>
                    <p className="text-green-200/70 text-sm">
                      {user.user.followers} followers • {user.activityLevel}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${getSimilarityColor(user.similarity || 0)}`}>
                    {user.similarity}%
                  </div>
                  <div className="text-green-200/70 text-sm">Similarity</div>
                </div>
              </div>
              
              {user.commonGenres && (
                <div className="mt-3 pt-3 border-t border-green-500/20">
                  <div className="text-sm text-green-200/70 mb-2">Common Genres:</div>
                  <div className="flex flex-wrap gap-2">
                    {user.commonGenres.map((genre, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-green-500/20 text-green-300 rounded-full text-xs"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Detailed Comparison Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-green-900/90 to-blue-900/90 backdrop-blur-sm border border-green-500/30 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-green-200">Music Profile Comparison</h3>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-green-300 hover:text-green-200 text-2xl"
              >
                ✕
              </button>
            </div>

            {/* User profiles side by side */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Current User */}
              <div className="bg-black/40 rounded-xl p-4">
                <h4 className="text-lg font-bold text-green-300 mb-3">
                  You ({currentUserData.user.display_name})
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-green-200/70">Diversity:</span>
                    <span className="text-green-400">{currentUserData.analytics.listeningDiversity}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-200/70">Saved Tracks:</span>
                    <span className="text-blue-400">{currentUserData.analytics.totalSavedTracks}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-200/70">Played Tracks:</span>
                    <span className="text-purple-400">{currentUserData.analytics.totalPlayedTracks}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-200/70">Albums:</span>
                    <span className="text-yellow-400">{currentUserData.analytics.totalSavedAlbums}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-200/70">Playlists:</span>
                    <span className="text-pink-400">{currentUserData.analytics.totalSavedPlaylists}</span>
                  </div>
                </div>
              </div>

              {/* Selected User */}
              <div className="bg-black/40 rounded-xl p-4">
                <h4 className="text-lg font-bold text-blue-300 mb-3">
                  {selectedUser.user.display_name}
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-green-200/70">Diversity:</span>
                    <span className="text-green-400">{selectedUser.analytics.listeningDiversity}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-200/70">Saved Tracks:</span>
                    <span className="text-blue-400">{selectedUser.analytics.totalSavedTracks}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-200/70">Played Tracks:</span>
                    <span className="text-purple-400">{selectedUser.analytics.totalPlayedTracks}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-200/70">Albums:</span>
                    <span className="text-yellow-400">{selectedUser.analytics.totalSavedAlbums}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-200/70">Playlists:</span>
                    <span className="text-pink-400">{selectedUser.analytics.totalSavedPlaylists}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Compatibility Score */}
            <div className="mt-6 bg-black/40 rounded-xl p-4">
              <h4 className="text-lg font-bold text-green-300 mb-3">Compatibility Analysis</h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className={`text-2xl font-bold ${getSimilarityColor(selectedUser.similarity || 0)}`}>
                    {selectedUser.similarity}%
                  </div>
                  <div className="text-green-200/70 text-sm">Overall Similarity</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-400">
                    {calculateCompatibilityScore(currentUserData, selectedUser)}%
                  </div>
                  <div className="text-green-200/70 text-sm">Compatibility</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {selectedUser.commonGenres?.length || 0}
                  </div>
                  <div className="text-green-200/70 text-sm">Common Genres</div>
                </div>
              </div>

              {selectedUser.commonGenres && (
                <div className="mt-4">
                  <div className="text-sm text-green-200/70 mb-2">Shared Music Interests:</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedUser.commonGenres.map((genre, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setSelectedUser(null)}
                className="flex-1 px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  alert(`🎵 Following ${selectedUser.user.display_name} - Social features coming soon!`);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg transition-colors font-medium"
              >
                🌟 Follow User
              </button>
              <button
                onClick={() => {
                  alert(`💬 Chat with ${selectedUser.user.display_name} - Messaging coming soon!`);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition-colors font-medium"
              >
                💬 Start Chat
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
} 