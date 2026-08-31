'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAccount } from 'wagmi';
import { spotifyFailureKind } from './spotifyState';

/**
 * ssr:false jest WYMOGIEM, nie optymalizacja: CampProvider i hooki SDK wolaja
 * useContext/useState warunkowo (`typeof window !== 'undefined' ? useHook() : ...`),
 * wiec przy renderze serwerowym liczba hookow rozjezdza sie z hydracja.
 * Ten sam import z tym samym zastrzezeniem stoi w BuilderProfile.
 */
const CampSocialsCard = dynamic(() => import('../../utils/socials/CampSocialsCard'), {
  ssr: false,
  loading: () => (
    <div className="rounded-card border border-soft-line bg-soft-surface p-4">
      <div className="h-4 w-40 animate-pulse rounded bg-soft-sunken" />
    </div>
  ),
});
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

  // Modal przykrywal cala strone, a jedynym wyjsciem byl krzyzyk w rogu -
  // klawiatura nie miala jak go zamknac.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
      } else if (spotifyFailureKind(data) === 'not-connected') {
        // BRAK PODLACZONEGO KONTA TO NIE AWARIA. Wczesniej ladowalo to w tym
        // samym `error`, co niedostepny Camp Network, wiec ktos bez Spotify
        // widzial czerwone "❌" i przycisk Try Again - ponawianie czegos, czego
        // nie da sie ponowic. Zostawiamy `error` puste; nizej wchodzi wtedy
        // konektor, ktorym da sie konto podpiac bez wychodzenia z posta.
        setError(null);
        setSpotifyData(null);
      } else {
        // Tu zostaja PRAWDZIWE odmowy: Camp nie odpowiedzial, zly adres, limit.
        // Przy nich ponowienie ma sens, wiec przycisk Try Again zostaje.
        setError(data.error || 'Failed to fetch Spotify data');
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
    <div className="fixed inset-0 bg-soft-ink/30 z-50 flex items-center justify-center p-4">
      <div className="bg-soft-surface rounded-card shadow-float max-w-4xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-soft-line">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-soft-display font-bold text-soft-ink">
              🎵 Select Track from Spotify
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefreshData}
                className="p-2 hover:bg-soft-sunken rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                title="Refresh Spotify data"
                aria-label="Refresh Spotify data"
                disabled={loading}
              >
                <svg className={`w-5 h-5 text-soft-ink-soft ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-soft-sunken rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                aria-label="Close track selector"
              >
                <svg className="w-5 h-5 text-soft-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 mt-4 bg-soft-sunken rounded-pill p-1">
            <button
              onClick={() => setActiveTab('recent')}
              className={`flex-1 px-3 py-2 text-sm font-semibold rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                activeTab === 'recent'
                  ? 'bg-soft-surface text-soft-primary-deep shadow-chip'
                  : 'text-soft-ink-muted hover:text-soft-ink'
              }`}
            >
              Recently Played
            </button>
            <button
              onClick={() => setActiveTab('saved')}
              className={`flex-1 px-3 py-2 text-sm font-semibold rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                activeTab === 'saved'
                  ? 'bg-soft-surface text-soft-primary-deep shadow-chip'
                  : 'text-soft-ink-muted hover:text-soft-ink'
              }`}
            >
              Saved Tracks
            </button>
            <button
              onClick={() => setActiveTab('albums')}
              className={`flex-1 px-3 py-2 text-sm font-semibold rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                activeTab === 'albums'
                  ? 'bg-soft-surface text-soft-primary-deep shadow-chip'
                  : 'text-soft-ink-muted hover:text-soft-ink'
              }`}
            >
              Albums
            </button>
            <button
              onClick={() => setActiveTab('playlists')}
              className={`flex-1 px-3 py-2 text-sm font-semibold rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                activeTab === 'playlists'
                  ? 'bg-soft-surface text-soft-primary-deep shadow-chip'
                  : 'text-soft-ink-muted hover:text-soft-ink'
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
              <div className="animate-spin w-8 h-8 border-4 border-soft-primary border-t-transparent rounded-full"></div>
              <span className="ml-3 text-soft-ink-muted">Loading Spotify data...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-soft-accent-deep mb-4">❌ {error}</div>
              <button
                onClick={() => { void fetchSpotifyData(); }}
                className="px-4 py-2 bg-soft-primary text-white font-semibold rounded-pill shadow-chip hover:bg-soft-primary-deep transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
              >
                Try Again
              </button>
            </div>
          ) : !spotifyData ? (
            /* ===== SLEPY ZAULEK MIAL DROGE WYJSCIA, TYLKO JEJ NIE POKAZYWAL =====
               Stalo tu samo "No Spotify data found for this user" - zdanie
               prawdziwe i bezuzyteczne. Nie mowilo DLACZEGO (konto nie jest
               podlaczone) ani CO Z TYM ZROBIC, a podlaczyc da sie wylacznie
               na /mycamp. Czlowiek klikal zielony przycisk w kompozytorze,
               dostawal te linijke i zamykal okno.

               Rozdzielamy tez dwa rozne "pusto", ktore wygladaly tak samo:
               brak podlaczonego konta to co innego niz podlaczone konto bez
               historii sluchania. Pierwsze naprawia sie klikiem, drugie
               sluchaniem muzyki - i tylko przy pierwszym ma sens odnosnik. */
            /* ===== KONEKTOR STOI TU, A NIE ZA ODNOSNIKIEM =====
               Stalo tu samo "No Spotify data found for this user" - zdanie
               prawdziwe i bezuzyteczne. Nie mowilo DLACZEGO (konto nie jest
               podpiete) ani CO Z TYM ZROBIC.

               Pierwsza poprawka dawala przycisk prowadzacy na /mycamp. To bylo
               gorsze rozwiazanie tego samego problemu: czlowiek jest w polowie
               pisania posta, a my wysylamy go na inna strone i kazemy wrocic.
               Konektor nosi wlasny CampProvider i wlasny CampModal, a logowanie
               Origin wraca na BIEZACY adres - wiec da sie go postawic dokladnie
               tutaj i nie ruszac nikogo z miejsca.

               Ten sam komponent stoi na wlasnym profilu. Jeden mechanizm, dwa
               miejsca - bo w obu ta sama czynnosc blokuje robote. */
            <div className="py-6">
              <p className="mx-auto mb-4 max-w-[300px] text-center text-[13px] leading-[1.5] text-soft-ink-muted">
                No Spotify tracks for this wallet yet. Link Spotify below and your recent listening
                shows up here.
              </p>
              {address && <CampSocialsCard address={address} />}
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
                        className="relative bg-soft-surface border border-soft-line shadow-chip hover:bg-soft-sunken rounded-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong"
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
                          className="absolute top-3 right-3 w-8 h-8 bg-soft-primary hover:bg-soft-primary-deep text-white rounded-full flex items-center justify-center shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:scale-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary border-2 border-soft-surface z-10"
                          title="Add track to post"
                          aria-label="Add track to post"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    ))
                  ) : (
                    /* ===== "PUSTO" MA POWIEDZIEC, CZYJA TO SPRAWA =====
                       Stalo tu samo "No recently played tracks found". Zdanie
                       prawdziwe i mylace: brzmi jak "nie sluchales muzyki albo
                       cos u nas nie gra", wiec wlasciciel poszedl podpinac
                       konto drugi raz. Nie pomoglo i nie mialo prawa pomoc.

                       Sprawdzone 14 sierpnia 2026 na zywym API Campa: konto
                       JEST podpiete (rozwiazuje sie z portfela, ma nazwe i
                       identyfikator), a `lastSynced` jest PUSTE od grudnia -
                       Camp ani razu nie zaciagnal z niego historii. Trzy z
                       czterech zbiorow oddaja pusta tablice, czwarty odmawia
                       401. Naszego kodu to nie dotyczy, wiec interfejs nie ma
                       prawa sugerowac, ze da sie to naprawic po naszej
                       stronie. */
                    <div className="mx-auto max-w-[320px] py-8 text-center text-[13px] leading-[1.5] text-soft-ink-soft">
                      {spotifyData.user?.display_name
                        ? `Linked as ${spotifyData.user.display_name}, but Camp has not sent any listening history for this account yet.`
                        : 'Camp has not sent any listening history for this account yet.'}
                      <span className="mt-2 block text-soft-ink-faint">
                        Linking again does not change it. The history has to arrive from Camp.
                      </span>
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
                        className="relative bg-soft-surface border border-soft-line shadow-chip hover:bg-soft-sunken rounded-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong"
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
                          className="absolute top-3 right-3 w-8 h-8 bg-soft-primary hover:bg-soft-primary-deep text-white rounded-full flex items-center justify-center shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:scale-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary border-2 border-soft-surface z-10"
                          title="Add track to post"
                          aria-label="Add track to post"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-soft-ink-soft">
                      No saved tracks found
                    </div>
                  )}
                </>
              )}

              {/* Albums & Playlists - coming soon */}
              {(activeTab === 'albums' || activeTab === 'playlists') && (
                <div className="text-center py-8 text-soft-ink-soft">
                  This feature will be available soon...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-soft-line bg-soft-sunken">
          <div className="text-sm text-soft-ink-muted text-center space-y-1">
            {/* Karta utworu nie jest klikalna (SpotifyTrackCard nie przyjmuje
                zadnego handlera wyboru) - dodaje wylacznie przycisk ➕. Stara
                tresc obiecywala cos, czego nie da sie zrobic. */}
            <div>💡 Click ➕ on a track to add it to your post</div>
            <div className="text-xs opacity-75">
              📊 Data cached for 30 minutes • Use refresh button for latest tracks
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}