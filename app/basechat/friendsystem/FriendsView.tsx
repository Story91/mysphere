'use client';

import React, { useState } from 'react';
import { FriendWithStatus, FriendRequest } from '../../utils/friends';
import { useSocial } from './hooks';

// ===============================================
// 🤝 FRIENDS VIEW COMPONENT
// ===============================================

interface FriendsViewProps {
  currentUserAddress: string;
  onUserClick?: (userAddress: string) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  currentUserAddress,
  onUserClick
}) => {
  const {
    friends,
    friendsStats,
    loading,
    error,
    socialAPI,
    refreshData
  } = useSocial(currentUserAddress);

  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'sent'>('friends');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Load friend requests when tab changes
  React.useEffect(() => {
    if (!socialAPI || (activeTab !== 'requests' && activeTab !== 'sent')) return;

    // Szybkie przeskakiwanie miedzy zakladkami: odpowiedz dla poprzedniej
    // zakladki nie moze wygrac z biezaca.
    let cancelled = false;

    const loadRequests = async () => {
      setRequestsLoading(true);
      try {
        if (activeTab === 'requests') {
          const received = await socialAPI.getReceivedFriendRequests(20);
          if (cancelled) return;
          setFriendRequests(received);
        } else {
          const sent = await socialAPI.getSentFriendRequests(20);
          if (cancelled) return;
          setSentRequests(sent);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading friend requests:', error);
      } finally {
        if (!cancelled) setRequestsLoading(false);
      }
    };

    loadRequests();

    return () => { cancelled = true; };
  }, [activeTab, socialAPI]);

  /**
   * Rozpatrzenie zaproszenia. Po akceptacji trzeba przeladowac dane, bo inaczej
   * licznik "Pending Requests" i lista znajomych zostawaly na starych wartosciach.
   */
  const respondToRequest = async (
    requestId: string,
    respond: (id: string) => Promise<{ success: boolean; error?: string }>
  ) => {
    if (!socialAPI || loadingAction) return;

    setLoadingAction(requestId);
    try {
      const result = await respond(requestId);
      if (result.success) {
        setFriendRequests(prev => prev.filter(req => req.id !== requestId));
        await refreshData();
      }
    } catch (error) {
      console.error('Error responding to friend request:', error);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleAcceptRequest = (requestId: string) =>
    respondToRequest(requestId, id => socialAPI!.acceptFriendRequest(id));

  const handleRejectRequest = (requestId: string) =>
    respondToRequest(requestId, id => socialAPI!.rejectFriendRequest(id));

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading friends...</p>
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
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">🤝 Friends</h2>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold">{friendsStats?.totalFriends || 0}</div>
            <div className="text-green-100">Total Friends</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{friendsStats?.pendingRequests || 0}</div>
            <div className="text-green-100">Pending Requests</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{friendsStats?.onlineFriends || 0}</div>
            <div className="text-green-100">Online Now</div>
          </div>
        </div>
      </div>

      {/* Tabs (Zakładki) */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('friends')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'friends'
              ? 'bg-green-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          Friends ({friendsStats?.totalFriends || 0})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'requests'
              ? 'bg-green-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          Requests ({friendsStats?.pendingRequests || 0})
          {(friendsStats?.pendingRequests || 0) > 0 && (
            <span className="ml-1 bg-red-500 text-white text-xs px-1 rounded-full">
              {friendsStats?.pendingRequests}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('sent')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'sent'
              ? 'bg-green-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          Sent ({friendsStats?.sentRequests || 0})
        </button>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'friends' && (
        <div className="space-y-4">
          {friends.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">
                No friends yet
              </h3>
              <p className="text-gray-500 mb-4">
                Send friend requests to connect!
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {friends.map((friend) => (
                <div 
                  key={friend.address} 
                  className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {/* Avatar */}
                      <div className="relative">
                        {friend.avatar ? (
                          <img 
                            src={friend.avatar} 
                            alt={friend.name} 
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold">
                            {friend.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        
                        {/* Online indicator */}
                        {friend.isOnline && (
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
                        )}
                      </div>

                      {/* Friend info */}
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {friend.name}
                        </h4>
                        <p className="text-sm text-gray-500 font-mono">
                          {friend.address.slice(0, 8)}...{friend.address.slice(-6)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                                                  Friends since {new Date(friend.friendsSince).toLocaleDateString('en-US')}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onUserClick?.(friend.address)}
                        className="px-3 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                      >
                        View Profile
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

              {/* Friend Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {requestsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
            </div>
          ) : friendRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">
                No pending requests
              </h3>
            </div>
          ) : (
            <div className="grid gap-4">
              {friendRequests.map((request) => (
                <div 
                  key={request.id} 
                  className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {request.senderName || `${request.senderId.slice(0, 8)}...${request.senderId.slice(-6)}`}
                      </h4>
                      <p className="text-sm text-gray-500">wants to be friends</p>
                      {request.message && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">
                          "{request.message}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleAcceptRequest(request.id!)}
                        disabled={loadingAction === request.id}
                        className="px-3 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleRejectRequest(request.id!)}
                        disabled={loadingAction === request.id}
                        className="px-3 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

              {/* Sent Requests Tab */}
      {activeTab === 'sent' && (
        <div className="space-y-4">
          {requestsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
            </div>
          ) : sentRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">
                No sent requests
              </h3>
            </div>
          ) : (
            <div className="grid gap-4">
              {sentRequests.map((request) => (
                <div 
                  key={request.id} 
                  className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {request.receiverName || `${request.receiverId.slice(0, 8)}...${request.receiverId.slice(-6)}`}
                      </h4>
                      <p className="text-sm text-gray-500">
                        Request sent {new Date(request.sentAt).toLocaleDateString('en-US')}
                      </p>
                      {request.message && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">
                          Your message: "{request.message}"
                        </p>
                      )}
                    </div>

                    <div className="text-sm text-yellow-600 font-medium">
                      Pending...
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FriendsView;