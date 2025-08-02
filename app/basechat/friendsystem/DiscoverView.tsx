'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { UserWithFollowStatus } from '../../utils/friends';
import { useSocial } from './hooks';

// ===============================================
// 🔍 DISCOVER VIEW COMPONENT
// ===============================================

interface DiscoverViewProps {
  currentUserAddress: string;
  onUserClick?: (userAddress: string) => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  currentUserAddress,
  onUserClick
}) => {
  const { 
    socialAPI,
    followUser,
    sendFriendRequest,
    loading 
  } = useSocial(currentUserAddress);

  const [suggestedUsers, setSuggestedUsers] = useState<UserWithFollowStatus[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'follow' | 'friend' | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(true);

  // Load suggested users
  useEffect(() => {
    if (socialAPI) {
      const loadSuggestedUsers = async () => {
        setDiscoverLoading(true);
        try {
          const suggested = await socialAPI.getSuggestedUsers(20);
          setSuggestedUsers(suggested);
        } catch (error) {
          console.error('Error loading suggested users:', error);
        } finally {
          setDiscoverLoading(false);
        }
      };
      loadSuggestedUsers();
    }
  }, [socialAPI]);

  // Handle follow user
  const handleFollow = async (targetUserId: string) => {
    setLoadingAction(targetUserId);
    setActionType('follow');
    try {
      const success = await followUser(targetUserId);
      if (success) {
        // Update local state to reflect the change
        setSuggestedUsers(prev => 
          prev.map(user => 
            user.address === targetUserId 
              ? { ...user, isFollowing: true }
              : user
          )
        );
      }
    } catch (error) {
      console.error('Error following user:', error);
    } finally {
      setLoadingAction(null);
      setActionType(null);
    }
  };

  // Handle send friend request
  const handleSendFriendRequest = async (targetUserId: string) => {
    setLoadingAction(targetUserId);
    setActionType('friend');
    
    // Show loading toast
    const loadingToast = toast.loading('Sending friend request...', {
      position: 'top-right',
    });
    
    try {
      const success = await sendFriendRequest(targetUserId, 'Hello! Let\'s be friends! 🤝');
      
      toast.dismiss(loadingToast);
      
      if (success) {
        toast.success('🤝 Friend request sent successfully!', {
          duration: 4000,
          position: 'top-right',
          style: {
            background: '#10B981',
            color: '#fff',
          },
        });
      } else {
        toast.error('❌ Failed to send friend request', {
          duration: 4000,
          position: 'top-right',
        });
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error sending friend request:', error);
      toast.error('❌ Network error! Please try again.', {
        duration: 4000,
        position: 'top-right',
      });
    } finally {
      setLoadingAction(null);
      setActionType(null);
    }
  };

  if (loading || discoverLoading) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Discovering users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">🔍 Discover</h2>
        <p className="text-orange-100">
          Find interesting people to follow and connect with! 
          Find interesting people to follow and connect with!
        </p>
      </div>

      {/* Suggested Users */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Suggested for you
        </h3>

        {suggestedUsers.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">
              No suggestions available
            </h3>
            <p className="text-gray-500">
              Start following users to get personalized recommendations! 
              Start following users to get personalized recommendations!
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {suggestedUsers.map((user) => (
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
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold">
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
                        
                        {/* Follower badge */}
                        {user.isFollower && (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                            Follows you
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-500 font-mono">
                        {user.address.slice(0, 8)}...{user.address.slice(-6)}
                      </p>
                      
                      <div className="flex items-center gap-4 mt-1">
                        {user.lastActive && (
                          <p className="text-xs text-gray-400">
                                                    Active {new Date(user.lastActive).toLocaleDateString('en-US')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onUserClick?.(user.address)}
                      className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      View
                    </button>
                    
                    {!user.isFollowing && (
                      <button
                        onClick={() => handleFollow(user.address)}
                        disabled={loadingAction === user.address && actionType === 'follow'}
                        className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                          loadingAction === user.address && actionType === 'follow'
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-purple-500 text-white hover:bg-purple-600'
                        }`}
                      >
                        {loadingAction === user.address && actionType === 'follow' ? (
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                            Following...
                          </div>
                        ) : (
                          'Follow'
                        )}
                      </button>
                    )}

                    {user.isFollowing && (
                      <span className="px-3 py-2 text-sm bg-purple-100 text-purple-800 rounded-lg">
                        Following
                      </span>
                    )}
                    
                    <button
                      onClick={() => handleSendFriendRequest(user.address)}
                      disabled={loadingAction === user.address && actionType === 'friend'}
                      className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                        loadingAction === user.address && actionType === 'friend'
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                    >
                      {loadingAction === user.address && actionType === 'friend' ? (
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                          Sending...
                        </div>
                      ) : (
                        'Add Friend'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

              {/* Trending Section - Placeholder for future implementation */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Trending Topics
        </h3>
        
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 text-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-gray-500">
            Trending topics coming soon!
          </p>
        </div>
      </div>

      {/* Load more button */}
      {suggestedUsers.length > 0 && suggestedUsers.length % 20 === 0 && (
        <div className="text-center">
          <button 
            onClick={() => {
              // Reload suggested users with higher limit
              if (socialAPI) {
                socialAPI.getSuggestedUsers(suggestedUsers.length + 20)
                  .then(setSuggestedUsers);
              }
            }}
            className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Discover More
          </button>
        </div>
      )}
    </div>
  );
};

export default DiscoverView;