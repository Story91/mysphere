'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import {
  getFriendsList,
  getReceivedFriendRequests,
  getSentFriendRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getUserChats
} from '../../utils/firebase';

interface FriendRequest {
  id: string;
  from: string;
  to: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: number;
  senderAvatar?: string;
  senderName?: string;
  receiverAvatar?: string;
  receiverName?: string;
}

interface Friend {
  id: string;
  name: string;
  address: string;
  avatar?: string;
}

interface Chat {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageTime?: number | null;
  participantData?: {
    name: string;
    avatar?: string;
  };
}

interface FriendsPanelProps {
  onFriendshipUpdate?: () => void;
  onStartChat?: (friendAddress: string) => void;
}

type TabOption = 'friends' | 'received' | 'sent';

export default function FriendsPanel({ onFriendshipUpdate, onStartChat }: FriendsPanelProps) {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<TabOption>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [recentChats, setRecentChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Funkcja pobierająca dane (lista znajomych, zaproszenia przychodzące i wysłane)
  const fetchFriendsData = async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const [friendsList, received, sent, chats] = await Promise.all([
        getFriendsList(address),
        getReceivedFriendRequests(address),
        getSentFriendRequests(address),
        getUserChats(address)
      ]);

      setFriends(
        friendsList.map(friend => ({
          id: friend.id,
          name: friend.name || friend.id.slice(0, 6) + '...',
          address: friend.address || friend.id,
          avatar: friend.avatar
        }))
      );
      setReceivedRequests(received);
      setSentRequests(sent);
      setRecentChats(chats.map(chat => ({
        ...chat,
        lastMessageTime: chat.lastMessageTime || undefined
      })));
    } catch (err) {
      console.error('Error fetching friends data:', err);
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!address) {
      console.log('No address available, skipping data fetch');
      return;
    }
    console.log('Initial data fetch for address:', address);
    fetchFriendsData();

    // Dodaj nasłuchiwanie na eventy odświeżenia
    const handleRefresh = (event: Event) => {
      console.log('Received refresh event:', event);
      fetchFriendsData();
    };

    document.addEventListener('refreshFriendRequests', handleRefresh);
    document.addEventListener('refreshData', handleRefresh);

    return () => {
      document.removeEventListener('refreshFriendRequests', handleRefresh);
      document.removeEventListener('refreshData', handleRefresh);
    };
  }, [address]);

  // Funkcja obsługująca akceptację zaproszenia
  const handleAcceptRequest = async (requestId: string) => {
    try {
      await acceptFriendRequest(requestId);
      await fetchFriendsData();
      onFriendshipUpdate?.();
    } catch (err) {
      console.error('Error accepting request:', err);
      setError('Error accepting friend request');
    }
  };

  // Funkcja obsługująca odrzucenie zaproszenia
  const handleRejectRequest = async (requestId: string) => {
    try {
      await rejectFriendRequest(requestId);
      await fetchFriendsData();
    } catch (err) {
      console.error('Error rejecting request:', err);
      setError('Error rejecting friend request');
    }
  };

  // Renderowanie listy znajomych
  const renderFriendsTab = () => (
    <div className="space-y-3">
      {friends.length === 0 && <div className="text-white/50 text-center">No friends yet</div>}
      {friends.map(friend => (
        <div
          key={friend.id}
          className="flex items-center space-x-3 p-2 rounded-xl bg-[#1E293B] hover:bg-[#1E293B]/80 transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-[#0052FF]/20 flex items-center justify-center overflow-hidden">
            {friend.avatar ? (
              <img src={friend.avatar} alt={friend.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white">{friend.name.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1">
            <div className="text-white font-medium">{friend.name}</div>
            <div className="text-white/50 text-sm">
              {friend.address.slice(0, 6)}...{friend.address.slice(-4)}
            </div>
          </div>
          <button
            onClick={() => onStartChat?.(friend.address)}
            className="px-3 py-1 bg-[#0052FF] text-white rounded-lg text-sm hover:bg-[#0052FF]/90 transition-all"
          >
            Message
          </button>
        </div>
      ))}
    </div>
  );

  // Renderowanie zakładki z otrzymanymi zaproszeniami
  const renderReceivedTab = () => (
    <div className="space-y-3">
      {receivedRequests.length === 0 && (
        <div className="text-white/50 text-center">No pending requests</div>
      )}
      {receivedRequests.map(request => (
        <div key={request.id} className="p-3 rounded-xl bg-[#1E293B]">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[#0052FF]/20 flex items-center justify-center overflow-hidden">
              {request.senderAvatar ? (
                <img src={request.senderAvatar} alt={request.senderName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white">{request.senderName?.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1">
              <div className="text-white font-medium">{request.senderName}</div>
              <div className="text-white/50 text-sm">
                {request.from.slice(0, 6)}...{request.from.slice(-4)}
              </div>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => handleAcceptRequest(request.id)}
              className="px-3 py-1 bg-[#0052FF] text-white rounded-lg text-sm hover:bg-[#0052FF]/90 transition-all"
            >
              Accept
            </button>
            <button
              onClick={() => handleRejectRequest(request.id)}
              className="px-3 py-1 bg-red-500/20 text-red-500 rounded-lg text-sm hover:bg-red-500/30 transition-all"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  // Renderowanie zakładki z wysłanymi zaproszeniami
  const renderSentTab = () => (
    <div className="space-y-3">
      {sentRequests.length === 0 && (
        <div className="text-white/50 text-center">No sent requests</div>
      )}
      {sentRequests.map(request => (
        <div key={request.id} className="p-3 rounded-xl bg-[#1E293B]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-[#0052FF]/20 flex items-center justify-center overflow-hidden">
              {request.receiverAvatar ? (
                <img src={request.receiverAvatar} alt={request.receiverName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white">{request.receiverName?.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1">
              <div className="text-white font-medium">{request.receiverName}</div>
              <div className="text-white/50 text-sm">
                {request.to.slice(0, 6)}...{request.to.slice(-4)}
              </div>
            </div>
            <div className="text-yellow-500 text-sm">Pending</div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div id="friends-panel" className="w-80 bg-[#0F172A] border-l border-[#0052FF]/20 flex flex-col h-full">
      {/* Nagłówek */}
      <div className="p-4 border-b border-[#0052FF]/20">
        <h2 className="text-lg font-semibold text-white">Friends</h2>
      </div>

      {/* Nawigacja - przyciski zmiany zakładek */}
      <div className="flex border-b border-[#0052FF]/20">
        <button
          onClick={() => setActiveTab('friends')}
          className={`flex-1 p-2 text-sm ${
            activeTab === 'friends'
              ? 'text-[#0052FF] border-b-2 border-[#0052FF]'
              : 'text-white/70'
          }`}
        >
          Friends ({friends.length})
        </button>
        <button
          onClick={() => setActiveTab('received')}
          className={`flex-1 p-2 text-sm ${
            activeTab === 'received'
              ? 'text-[#0052FF] border-b-2 border-[#0052FF]'
              : 'text-white/70'
          }`}
        >
          Received ({receivedRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('sent')}
          className={`flex-1 p-2 text-sm ${
            activeTab === 'sent'
              ? 'text-[#0052FF] border-b-2 border-[#0052FF]'
              : 'text-white/70'
          }`}
        >
          Sent ({sentRequests.length})
        </button>
      </div>

      {/* Główna treść panelu */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-center text-white">Loading...</div>}
        {error && <div className="text-center text-red-500">{error}</div>}
        {!loading && !error && activeTab === 'friends' && renderFriendsTab()}
        {!loading && !error && activeTab === 'received' && renderReceivedTab()}
        {!loading && !error && activeTab === 'sent' && renderSentTab()}
      </div>
    </div>
  );
} 