'use client';

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
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
    failedSections,
    socialAPI,
    refreshData
  } = useSocial(currentUserAddress);

  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'sent'>('friends');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  /**
   * Liczba, ktorej nie udalo sie odczytac, jest KRESKA, nie zerem.
   *
   * `friendsStats` jest `null` wylacznie przy AWARII odczytu. Stare
   * `friendsStats?.pendingRequests || 0` chowalo wtedy odznake oczekujacych
   * zaproszen - czlowiek nie odpisywal komus, kto do niego napisal, bo ekran
   * twierdzil, ze nikt nie pisal.
   */
  const statValue = (value: number | undefined): string =>
    typeof value === 'number' ? value.toLocaleString() : '—';
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  /* Nieudany odczyt zaproszen. Bez tego pusta lista mowila "No pending
     requests" takze wtedy, gdy zapytanie padlo. */
  const [requestsFailed, setRequestsFailed] = useState(false);

  // Load friend requests when tab changes
  React.useEffect(() => {
    if (!socialAPI || (activeTab !== 'requests' && activeTab !== 'sent')) return;

    // Szybkie przeskakiwanie miedzy zakladkami: odpowiedz dla poprzedniej
    // zakladki nie moze wygrac z biezaca.
    let cancelled = false;

    const loadRequests = async () => {
      setRequestsLoading(true);
      setRequestsFailed(false);
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
        setRequestsFailed(true);
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
      } else {
        // Odmowa serwera nie moze konczyc sie cisza: przed poprawka spinner
        // gasl, zaproszenie zostawalo na liscie i nic tego nie tlumaczylo.
        toast.error(result.error || 'Could not process this request. Please try again.');
      }
    } catch (error) {
      console.error('Error responding to friend request:', error);
      toast.error('Could not process this request. Please try again.');
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-soft-primary mx-auto"></div>
          <p className="mt-4 font-soft text-soft-ink-muted">Loading friends...</p>
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
      {/* ===== NAGLOWEK EKRANU, NIE KARTA Z EMOTKA =====
          Cztery widoki z lewej nawigacji zaczynaly sie identycznie: biala
          karta, w niej emotka z tytulem i trzy wielkie liczby na srodku.
          Ten sam szablon cztery razy - a karta byla naglowkiem kolumny, ktora
          i tak stoi sama na tle strony, wiec ramka niczego nie oddzielala
          od niczego.

          Teraz tytul jest tytulem: stoi wprost na tle, a liczby ida w jednym
          rzedzie pod nim, oddzielone wlosowa linia. Ten sam jezyk co panel
          Trends w prawej kolumnie - liczba po prawej, podpis wersalikami. */}
      <div className="font-soft">
        <h2 className="font-soft-display text-[26px] font-bold leading-none text-soft-ink">Friends</h2>
        <div className="mt-4 flex items-center gap-6 border-t border-soft-line pt-4">
          <div>
            <div className="font-soft-display text-[22px] font-bold tabular-nums text-soft-ink">{statValue(friendsStats?.totalFriends)}</div>
            <div className="mt-0.5 font-soft text-[11px] font-semibold uppercase tracking-[0.07em] text-soft-ink-soft">Total Friends</div>
          </div>
          <div>
            <div className="font-soft-display text-[22px] font-bold tabular-nums text-soft-ink">{statValue(friendsStats?.pendingRequests)}</div>
            <div className="mt-0.5 font-soft text-[11px] font-semibold uppercase tracking-[0.07em] text-soft-ink-soft">Pending Requests</div>
          </div>
          <div>
            <div className="font-soft-display text-[22px] font-bold tabular-nums text-soft-ink">{statValue(friendsStats?.onlineFriends)}</div>
            <div className="mt-0.5 font-soft text-[11px] font-semibold uppercase tracking-[0.07em] text-soft-ink-soft">Online Now</div>
          </div>
        </div>
      </div>

      {/* Tabs (Zakładki) */}
      <div className="flex bg-soft-sunken rounded-pill p-1 font-soft">
        <button
          onClick={() => setActiveTab('friends')}
          className={`flex-1 rounded-pill px-4 py-2 text-sm font-semibold transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
            activeTab === 'friends'
              ? 'bg-soft-surface text-soft-primary-deep shadow-chip'
              : 'text-soft-ink-muted hover:text-soft-ink'
          }`}
        >
          Friends ({statValue(friendsStats?.totalFriends)})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex-1 rounded-pill px-4 py-2 text-sm font-semibold transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
            activeTab === 'requests'
              ? 'bg-soft-surface text-soft-primary-deep shadow-chip'
              : 'text-soft-ink-muted hover:text-soft-ink'
          }`}
        >
          Requests ({statValue(friendsStats?.pendingRequests)})
          {(friendsStats?.pendingRequests || 0) > 0 && (
            <span className="ml-1 bg-soft-accent-deep text-white text-xs px-1.5 rounded-pill">
              {friendsStats?.pendingRequests}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('sent')}
          className={`flex-1 rounded-pill px-4 py-2 text-sm font-semibold transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
            activeTab === 'sent'
              ? 'bg-soft-surface text-soft-primary-deep shadow-chip'
              : 'text-soft-ink-muted hover:text-soft-ink'
          }`}
        >
          Sent ({statValue(friendsStats?.sentRequests)})
        </button>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'friends' && (
        <div className="space-y-4">
          {/* Nieudany odczyt listy to nie jest "nie masz znajomych". */}
          {failedSections.includes('friends') ? (
            <div className="text-center py-12 bg-soft-surface border border-soft-line rounded-card shadow-card font-soft">
              <h3 className="font-soft-display text-xl font-semibold text-soft-ink mb-2">
                Friends couldn&apos;t be loaded
              </h3>
              <p className="text-soft-ink-muted">Try again in a moment.</p>
            </div>
          ) : friends.length === 0 ? (
            <div className="text-center py-12 bg-soft-surface border border-soft-line rounded-card shadow-card font-soft">
              <div className="text-soft-ink-faint mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <h3 className="font-soft-display text-xl font-semibold text-soft-ink mb-2">
                No friends yet
              </h3>
              <p className="text-soft-ink-muted mb-4">
                Send friend requests to connect!
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {friends.map((friend) => (
                <div 
                  key={friend.address} 
                  className="bg-soft-surface rounded-card p-4 shadow-card border border-soft-line font-soft transition-shadow [transition-duration:var(--dur-dropdown)] ease-out-strong hover:shadow-float"
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
                          <div className="w-12 h-12 rounded-full bg-soft-primary flex items-center justify-center font-soft-display text-white font-bold">
                            {friend.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        
                        {/* Online indicator */}
                        {friend.isOnline && (
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-soft-surface rounded-full"></div>
                        )}
                      </div>

                      {/* Friend info */}
                      <div className="flex-1">
                        <h4 className="font-soft-display font-semibold text-soft-ink">
                          {friend.name}
                        </h4>
                        <p className="text-sm text-soft-ink-soft font-mono">
                          {friend.address.slice(0, 8)}...{friend.address.slice(-6)}
                        </p>
                        <p className="text-xs text-soft-ink-faint mt-1">
                                                  Friends since {new Date(friend.friendsSince).toLocaleDateString('en-US')}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onUserClick?.(friend.address)}
                        className="px-4 py-2 text-sm font-semibold bg-soft-primary text-white rounded-pill shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-soft-primary mx-auto"></div>
            </div>
          ) : requestsFailed ? (
            <div className="text-center py-12 bg-soft-surface border border-soft-line rounded-card shadow-card font-soft">
              <h3 className="font-soft-display text-xl font-semibold text-soft-ink mb-2">
                Requests couldn&apos;t be loaded
              </h3>
              <p className="text-soft-ink-muted">Try again in a moment.</p>
            </div>
          ) : friendRequests.length === 0 ? (
            <div className="text-center py-12 bg-soft-surface border border-soft-line rounded-card shadow-card font-soft">
              <h3 className="font-soft-display text-xl font-semibold text-soft-ink mb-2">
                No pending requests
              </h3>
            </div>
          ) : (
            <div className="grid gap-4">
              {friendRequests.map((request) => (
                <div 
                  key={request.id} 
                  className="bg-soft-surface rounded-card p-4 shadow-card border border-soft-line font-soft"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-soft-display font-semibold text-soft-ink">
                        {request.senderName || `${request.senderId.slice(0, 8)}...${request.senderId.slice(-6)}`}
                      </h4>
                      <p className="text-sm text-soft-ink-soft">wants to be friends</p>
                      {request.message && (
                        <p className="text-sm text-soft-ink-muted mt-1 italic">
                          "{request.message}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* Blokada obejmuje CALA liste, nie tylko klikniety
                          wiersz: respondToRequest i tak odrzuca rownolegle
                          wywolania, wiec wczesniej klikniecie "Accept" w innym
                          wierszu w trakcie trwajacego zapytania nie robilo nic
                          i nic tego nie sygnalizowalo. */}
                      <button
                        onClick={() => handleAcceptRequest(request.id!)}
                        disabled={loadingAction !== null}
                        className="px-4 py-2 text-sm font-semibold bg-soft-primary text-white rounded-pill shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:active:scale-100"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleRejectRequest(request.id!)}
                        disabled={loadingAction !== null}
                        className="px-4 py-2 text-sm font-semibold border border-soft-line text-soft-ink-muted rounded-pill transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken hover:text-soft-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:active:scale-100"
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-soft-primary mx-auto"></div>
            </div>
          ) : requestsFailed ? (
            <div className="text-center py-12 bg-soft-surface border border-soft-line rounded-card shadow-card font-soft">
              <h3 className="font-soft-display text-xl font-semibold text-soft-ink mb-2">
                Sent requests couldn&apos;t be loaded
              </h3>
              <p className="text-soft-ink-muted">Try again in a moment.</p>
            </div>
          ) : sentRequests.length === 0 ? (
            <div className="text-center py-12 bg-soft-surface border border-soft-line rounded-card shadow-card font-soft">
              <h3 className="font-soft-display text-xl font-semibold text-soft-ink mb-2">
                No sent requests
              </h3>
            </div>
          ) : (
            <div className="grid gap-4">
              {sentRequests.map((request) => (
                <div 
                  key={request.id} 
                  className="bg-soft-surface rounded-card p-4 shadow-card border border-soft-line font-soft"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-soft-display font-semibold text-soft-ink">
                        {request.receiverName || `${request.receiverId.slice(0, 8)}...${request.receiverId.slice(-6)}`}
                      </h4>
                      <p className="text-sm text-soft-ink-soft">
                        Request sent {new Date(request.sentAt).toLocaleDateString('en-US')}
                      </p>
                      {request.message && (
                        <p className="text-sm text-soft-ink-muted mt-1 italic">
                          Your message: "{request.message}"
                        </p>
                      )}
                    </div>

                    <div className="rounded-pill bg-soft-accent-soft px-3 py-1 text-xs font-semibold text-soft-accent-deep">
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