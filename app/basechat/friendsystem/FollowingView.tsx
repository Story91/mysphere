'use client';

import React, { useState } from 'react';
import { UserWithFollowStatus } from '../../utils/friends';
import { useSocial } from './hooks';

// ===============================================
// 👥 FOLLOWING VIEW COMPONENT
// ===============================================

interface FollowingViewProps {
  currentUserAddress: string;
  onUserClick?: (userAddress: string) => void;
}

export const FollowingView: React.FC<FollowingViewProps> = ({
  currentUserAddress,
  onUserClick
}) => {
  const { 
    following, 
    followers,
    followStats, 
    loading, 
    error, 
    unfollowUser 
  } = useSocial(currentUserAddress);

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'following' | 'followers'>('following');

  // Handle unfollow (Obsługa przestania obserwowania)
  const handleUnfollow = async (targetUserId: string) => {
    setLoadingAction(targetUserId);
    try {
      const success = await unfollowUser(targetUserId);
      if (!success) {
        console.error('Failed to unfollow user');
      }
    } catch (error) {
      console.error('Error unfollowing user:', error);
    } finally {
      setLoadingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading following...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">👥 Follow Network</h2>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold">{followStats?.following || 0}</div>
            <div className="text-purple-100">Following</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{followStats?.followers || 0}</div>
            <div className="text-purple-100">Followers</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{followStats?.mutualFollows || 0}</div>
            <div className="text-purple-100">Mutual</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('following')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'following'
              ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400'
          }`}
        >
          👥 Following ({followStats?.following || 0})
        </button>
        <button
          onClick={() => setActiveTab('followers')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'followers'
              ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400'
          }`}
        >
          🫂 Followers ({followStats?.followers || 0})
        </button>
      </div>

      {/* Users list based on active tab */}
      {(() => {
        const currentList = activeTab === 'following' ? following : followers;

        if (currentList.length === 0) {
          return (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">
                {activeTab === 'following' ? 'Not following anyone yet' : 'No followers yet'}
              </h3>
              <p className="text-gray-500 mb-4">
                {activeTab === 'following' 
                  ? 'Discover interesting users to follow!' 
                  : 'Start engaging with the community to gain followers!'}
              </p>
            </div>
          );
        }

        return (
          <>
            <div className="grid gap-4">
              {currentList.map((user) => (
                <div 
                  key={user.address} 
                  className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {/* Avatar */}
                      <div className="relative">
                        {user.avatar ? (
                          <img 
                            src={user.avatar} 
                            alt={user.name} 
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        
                        {/* Online indicator */}
                        {user.isOnline && (
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
                        )}
                      </div>

                      {/* User info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {user.name}
                          </h4>
                          
                          {/* Mutual follow badge */}
                          {user.isMutual && (
                            <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">
                              Mutual
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-500 font-mono">
                          {user.address.slice(0, 8)}...{user.address.slice(-6)}
                        </p>
                        
                        {user.followedAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            Following since {new Date(user.followedAt).toLocaleDateString('en-US')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onUserClick?.(user.address)}
                        className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        View Profile
                      </button>
                      
                      {/* Show unfollow button only in Following tab */}
                      {activeTab === 'following' && (
                        <button
                          onClick={() => handleUnfollow(user.address)}
                          disabled={loadingAction === user.address}
                          className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                            loadingAction === user.address
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-red-500 text-white hover:bg-red-600'
                          }`}
                        >
                          {loadingAction === user.address ? (
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                              Loading...
                            </div>
                          ) : (
                            'Unfollow'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load more button */}
            {currentList.length > 0 && currentList.length % 20 === 0 && (
              <div className="text-center">
                <button className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors">
                  Load More {activeTab === 'following' ? 'Following' : 'Followers'}
                </button>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
};

export default FollowingView;