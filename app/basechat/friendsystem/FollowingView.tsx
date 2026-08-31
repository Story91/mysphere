'use client';

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
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
    failedSections,
    unfollowUser 
  } = useSocial(currentUserAddress);

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'following' | 'followers'>('following');

  /**
   * Liczba, ktorej nie udalo sie odczytac, jest KRESKA, nie zerem.
   *
   * `followStats` jest `null` wylacznie wtedy, gdy odczyt padl (getUserFollowStats
   * oddaje policzone zera, gdy naprawde nikt nie obserwuje). Stare
   * `followStats?.followers || 0` zamienialo awarie w zdanie "nikt cie nie
   * obserwuje" - i to na ekranie, ktory sluzy wlasnie do sprawdzenia tej liczby.
   */
  const statValue = (value: number | undefined): string =>
    typeof value === 'number' ? value.toLocaleString() : '—';

  // Handle unfollow (Obsługa przestania obserwowania)
  const handleUnfollow = async (targetUserId: string) => {
    if (loadingAction) return;

    setLoadingAction(targetUserId);
    try {
      const success = await unfollowUser(targetUserId);
      // Bez tego nieudane odpiecie konczylo sie samym console.error: spinner
      // gasl, wiersz zostawal na liscie i uzytkownik nie wiedzial, ze serwer
      // odrzucil operacje.
      if (!success) {
        toast.error('Could not unfollow this user. Please try again.');
      }
    } catch (error) {
      console.error('Error unfollowing user:', error);
      toast.error('Could not unfollow this user. Please try again.');
    } finally {
      setLoadingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-soft-primary mx-auto"></div>
          <p className="mt-4 font-soft text-soft-ink-muted">Loading following...</p>
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
        <h2 className="font-soft-display text-[26px] font-bold leading-none text-soft-ink">Follow network</h2>
        <div className="mt-4 flex items-center gap-6 border-t border-soft-line pt-4">
          <div>
            <div className="font-soft-display text-[22px] font-bold tabular-nums text-soft-ink">{statValue(followStats?.following)}</div>
            <div className="mt-0.5 font-soft text-[11px] font-semibold uppercase tracking-[0.07em] text-soft-ink-soft">Following</div>
          </div>
          <div>
            <div className="font-soft-display text-[22px] font-bold tabular-nums text-soft-ink">{statValue(followStats?.followers)}</div>
            <div className="mt-0.5 font-soft text-[11px] font-semibold uppercase tracking-[0.07em] text-soft-ink-soft">Followers</div>
          </div>
          <div>
            <div className="font-soft-display text-[22px] font-bold tabular-nums text-soft-ink">{statValue(followStats?.mutualFollows)}</div>
            <div className="mt-0.5 font-soft text-[11px] font-semibold uppercase tracking-[0.07em] text-soft-ink-soft">Mutual</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-soft-sunken rounded-pill p-1 font-soft">
        <button
          onClick={() => setActiveTab('following')}
          className={`flex-1 rounded-pill px-4 py-2 text-sm font-semibold transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
            activeTab === 'following'
              ? 'bg-soft-surface text-soft-primary-deep shadow-chip'
              : 'text-soft-ink-muted hover:text-soft-ink'
          }`}
        >
          👥 Following ({statValue(followStats?.following)})
        </button>
        <button
          onClick={() => setActiveTab('followers')}
          className={`flex-1 rounded-pill px-4 py-2 text-sm font-semibold transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
            activeTab === 'followers'
              ? 'bg-soft-surface text-soft-primary-deep shadow-chip'
              : 'text-soft-ink-muted hover:text-soft-ink'
          }`}
        >
          🫂 Followers ({statValue(followStats?.followers)})
        </button>
      </div>

      {/* Users list based on active tab */}
      {(() => {
        const currentList = activeTab === 'following' ? following : followers;

        // Pusta lista po NIEUDANYM odczycie nie jest zdaniem o nikim - jest
        // zdaniem o naszym zapytaniu. Bez tego rozroznienia ekran pisal
        // "No followers yet" komus, kto ma ich trzysta.
        const listFailed = failedSections.includes(activeTab);

        if (listFailed) {
          return (
            <div className="text-center py-12 bg-soft-surface border border-soft-line rounded-card shadow-card font-soft">
              <h3 className="font-soft-display text-xl font-semibold text-soft-ink mb-2">
                {activeTab === 'following' ? "Following list couldn't be loaded" : "Followers couldn't be loaded"}
              </h3>
              <p className="text-soft-ink-muted">Try again in a moment.</p>
            </div>
          );
        }

        if (currentList.length === 0) {
          return (
            <div className="text-center py-12 bg-soft-surface border border-soft-line rounded-card shadow-card font-soft">
              <div className="text-soft-ink-faint mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="font-soft-display text-xl font-semibold text-soft-ink mb-2">
                {activeTab === 'following' ? 'Not following anyone yet' : 'No followers yet'}
              </h3>
              <p className="text-soft-ink-muted mb-4">
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
                  className="bg-soft-surface rounded-card p-4 shadow-card border border-soft-line font-soft transition-shadow [transition-duration:var(--dur-dropdown)] ease-out-strong hover:shadow-float"
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
                          
                          {/* Mutual follow badge */}
                          {user.isMutual && (
                            <span className="bg-soft-sunken text-soft-primary-deep text-xs font-semibold px-2.5 py-1 rounded-pill">
                              Mutual
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-soft-ink-soft font-mono">
                          {user.address.slice(0, 8)}...{user.address.slice(-6)}
                        </p>

                        {user.followedAt && (
                          <p className="text-xs text-soft-ink-faint mt-1">
                            Following since {new Date(user.followedAt).toLocaleDateString('en-US')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onUserClick?.(user.address)}
                        className="px-4 py-2 text-sm font-semibold bg-soft-sunken text-soft-ink rounded-pill transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-line active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
                      >
                        View Profile
                      </button>
                      
                      {/* Show unfollow button only in Following tab */}
                      {activeTab === 'following' && (
                        <button
                          onClick={() => handleUnfollow(user.address)}
                          disabled={loadingAction === user.address}
                          className={`px-4 py-2 text-sm font-semibold rounded-pill border transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${
                            loadingAction === user.address
                              ? 'border-soft-line bg-soft-sunken text-soft-ink-soft cursor-not-allowed'
                              : 'border-soft-line text-soft-ink-muted hover:bg-soft-sunken hover:text-soft-ink active:scale-[0.97]'
                          }`}
                        >
                          {loadingAction === user.address ? (
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 border-2 border-soft-ink-soft border-t-transparent rounded-full animate-spin"></div>
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

            {/* USUNIETO: przycisk "Load More Following/Followers". Nie mial
                zadnego onClick - klikniecie nie robilo nic, a wygladal na
                dzialajacy. Dodatkowo warunek `% 20 === 0` prawie nigdy nie
                zachodzil, bo useSocial wczytuje listy z limitem 50, wiec
                przycisk pojawial sie tylko przy dokladnie 20 albo 40 wpisach.
                Prawdziwe stronicowanie wymaga kursora w useSocial (hook nie
                oddaje zadnego) - to decyzja produktowa, nie lokalna poprawka. */}
          </>
        );
      })()}
    </div>
  );
};

export default FollowingView;