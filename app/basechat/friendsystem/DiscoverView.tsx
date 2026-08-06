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
  const [loadingMore, setLoadingMore] = useState(false);

  // Load suggested users
  useEffect(() => {
    if (!socialAPI) return;

    // Odpowiedz dla poprzedniego uzytkownika (albo po odmontowaniu) nie moze
    // nadpisac biezacej listy.
    let cancelled = false;

    const loadSuggestedUsers = async () => {
      setDiscoverLoading(true);
      try {
        const suggested = await socialAPI.getSuggestedUsers(20);
        if (cancelled) return;
        setSuggestedUsers(suggested);
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading suggested users:', error);
      } finally {
        if (!cancelled) setDiscoverLoading(false);
      }
    };

    loadSuggestedUsers();

    return () => { cancelled = true; };
  }, [socialAPI]);

  // Handle "Discover More"
  const handleDiscoverMore = async () => {
    if (!socialAPI || loadingMore) return;

    setLoadingMore(true);
    try {
      const more = await socialAPI.getSuggestedUsers(suggestedUsers.length + 20);
      setSuggestedUsers(more);
    } catch (error) {
      // Wczesniej bylo golе `.then(setSuggestedUsers)` - blad leciał jako
      // nieobsluzone odrzucenie, a przycisk wygladal, jakby nic sie nie stalo.
      console.error('Error loading more suggested users:', error);
      toast.error('Could not load more people. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  };

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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-soft-primary mx-auto"></div>
          <p className="mt-4 font-soft text-soft-ink-muted">Discovering users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-soft-surface border border-soft-line rounded-card p-6 shadow-card font-soft">
        <h2 className="font-soft-display text-2xl font-bold mb-2 text-soft-ink">🔍 Discover</h2>
        <p className="text-soft-ink-muted">
          Find interesting people to follow and connect with!
        </p>
      </div>

      {/* Suggested Users */}
      <div className="space-y-4">
        <h3 className="font-soft-display text-lg font-semibold text-soft-ink">
                      Suggested for you
        </h3>

        {suggestedUsers.length === 0 ? (
          <div className="text-center py-12 bg-soft-surface border border-soft-line rounded-card shadow-card font-soft">
            <div className="text-soft-ink-faint mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="font-soft-display text-xl font-semibold text-soft-ink mb-2">
              No suggestions available
            </h3>
            <p className="text-soft-ink-muted">
              Start following users to get personalized recommendations!
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {suggestedUsers.map((user) => (
              <div 
                key={user.address} 
                className="bg-soft-surface rounded-card p-4 shadow-card border border-soft-line font-soft transition-shadow duration-[--dur-dropdown] ease-out-strong hover:shadow-float"
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
                        <div className="w-12 h-12 rounded-full bg-soft-primary flex items-center justify-center font-soft-display text-white font-bold">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      
                      {/* Online indicator */}
                      {user.isOnline && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-soft-surface rounded-full"></div>
                      )}
                    </div>

                    {/* User info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-soft-display font-semibold text-soft-ink">
                          {user.name}
                        </h4>
                        
                        {/* Follower badge */}
                        {user.isFollower && (
                          <span className="bg-soft-sunken text-soft-primary-deep text-xs font-semibold px-2.5 py-1 rounded-pill">
                            Follows you
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-soft-ink-soft font-mono">
                        {user.address.slice(0, 8)}...{user.address.slice(-6)}
                      </p>
                      
                      <div className="flex items-center gap-4 mt-1">
                        {user.lastActive && (
                          <p className="text-xs text-soft-ink-faint">
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
                      className="px-4 py-2 text-sm font-semibold bg-soft-sunken text-soft-ink rounded-pill transition-[background-color,transform] duration-[--dur-press] ease-out-strong hover:bg-soft-line active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
                    >
                      View
                    </button>
                    
                    {!user.isFollowing && (
                      <button
                        onClick={() => handleFollow(user.address)}
                        disabled={loadingAction === user.address && actionType === 'follow'}
                        className={`px-4 py-2 text-sm font-semibold rounded-pill transition-[background-color,transform] duration-[--dur-press] ease-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${
                          loadingAction === user.address && actionType === 'follow'
                            ? 'bg-soft-sunken text-soft-ink-soft cursor-not-allowed'
                            : 'bg-soft-primary text-white shadow-chip hover:bg-soft-primary-deep active:scale-[0.97]'
                        }`}
                      >
                        {loadingAction === user.address && actionType === 'follow' ? (
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 border-2 border-soft-ink-soft border-t-transparent rounded-full animate-spin"></div>
                            Following...
                          </div>
                        ) : (
                          'Follow'
                        )}
                      </button>
                    )}

                    {user.isFollowing && (
                      <span className="px-4 py-2 text-sm font-semibold bg-soft-sunken text-soft-primary-deep rounded-pill">
                        Following
                      </span>
                    )}
                    
                    <button
                      onClick={() => handleSendFriendRequest(user.address)}
                      disabled={loadingAction === user.address && actionType === 'friend'}
                      className={`px-4 py-2 text-sm font-semibold rounded-pill transition-[background-color,transform] duration-[--dur-press] ease-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${
                        loadingAction === user.address && actionType === 'friend'
                          ? 'bg-soft-sunken text-soft-ink-soft cursor-not-allowed'
                          : 'bg-soft-accent-deep text-white shadow-chip hover:brightness-110 active:scale-[0.97]'
                      }`}
                    >
                      {loadingAction === user.address && actionType === 'friend' ? (
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 border-2 border-soft-ink-soft border-t-transparent rounded-full animate-spin"></div>
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
        <h3 className="font-soft-display text-lg font-semibold text-soft-ink">
                      Trending Topics
        </h3>
        
        <div className="bg-soft-surface border border-soft-line rounded-card p-6 text-center shadow-card font-soft">
          <div className="text-soft-ink-faint mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-soft-ink-muted">
            Trending topics coming soon!
          </p>
        </div>
      </div>

      {/* Load more button */}
      {suggestedUsers.length > 0 && suggestedUsers.length % 20 === 0 && (
        <div className="text-center">
          <button
            onClick={handleDiscoverMore}
            disabled={loadingMore}
            className="px-6 py-3 font-soft font-semibold bg-soft-primary text-white rounded-pill shadow-chip transition-[background-color,transform] duration-[--dur-press] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {loadingMore ? 'Loading...' : 'Discover More'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DiscoverView;