// @ts-nocheck
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import ProfileSocials from './ProfileSocials';
import { toast } from 'react-hot-toast';
// ✅ USUNIĘTO: UserRank i RANK_DESCRIPTIONS - nie używane już
// Warstwa tozsamosci na wagmi/viem - zamiennik @coinbase/onchainkit/identity
import { Avatar } from '../../components/identity';
import TipButton from './TipButton';
import RecentTips from './RecentTips';
import { getUserTipStats, TipStats as TipStatsType } from '../../utils/firebase';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import { useSocialActions } from '../friendsystem/hooks';
// Kanoniczna implementacja z utils/friends. Kopia w friendsystem/friends_system.ts
// miala zaslepke powiadomien (tylko console.log) i polskie komunikaty bledow,
// ktorych ten komponent nigdy nie rozpoznawal.
import {
  sendFriendRequest as sendFriendRequestDirect,
  getUserFollowStats,
  getFriendsStats,
  type FollowStats,
  type FriendsStats
} from '../../utils/friends';
import ReferralDashboard from '../../utils/referrals/components/ReferralDashboard';
import { initializeReferralStats } from '../../utils/referrals';
import CreatorCoinSection from './CreatorCoinSection';

/**
 * Konektor Camp Network (podpinanie X / Spotify / TikTok).
 *
 * ssr:false jest wymogiem, nie optymalizacja: CampProvider i hooki z
 * @campnetwork/origin/react wolaja useContext/useState warunkowo od
 * `typeof window`, wiec render serwerowy i hydracja maja rozna liczbe hookow.
 * Przy okazji caly SDK Campa nie wchodzi do pierwszego pakietu /basechat -
 * dociaga sie dopiero, gdy ktos otworzy WLASNY profil.
 */
const CampSocialsCard = dynamic(() => import('../../utils/socials/CampSocialsCard'), {
  ssr: false,
  loading: () => (
    <div className="mb-6 rounded-card bg-soft-surface border border-soft-line shadow-card p-6">
      <div className="animate-pulse flex items-center">
        <div className="w-12 h-12 rounded-full bg-soft-sunken mr-4" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 bg-soft-sunken rounded-pill" />
          <div className="h-3 w-64 bg-soft-sunken rounded-pill" />
        </div>
      </div>
    </div>
  )
});

// Talent Protocol API types
interface TalentScore {
  score: number;
  percentile: number;
  human_checkmark: boolean;
}

interface TalentProfile {
  display_name: string;
  bio: string;
  human_checkmark: boolean;
  tags: string[];
}

// Twitter/Camp Network API types
interface TwitterUser {
  id: string;
  displayName: string;
  userHandle: string;
  profileBio: string;
  profilePictureUrl: string;
  isVerified: boolean;
  isBlueVerified: boolean;
  followerCount: number;
  followingCount: number;
  likeCount: number;
  location: string;
}

interface TwitterTweet {
  id: string;
  tweetText: string;
  tweetTimestamp: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  isReTweet: boolean;
}

// Spotify/Camp Network API types
interface SpotifyUser {
  id: string;
  display_name: string;
  external_urls: {
    spotify: string;
  };
  href: string;
  images: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  type: string;
  uri: string;
  followers: number;
  lastSynced: string;
  createdAt: string;
  updatedAt: string;
}

interface SpotifyTrack {
  track: {
    id: string;
    name: string;
    artists: Array<{
      name: string;
      external_urls?: {
        spotify: string;
      };
    }>;
    album: {
      name: string;
      images?: Array<{
        url: string;
        height: number;
        width: number;
      }>;
      external_urls?: {
        spotify: string;
      };
      release_date?: string;
      release_date_precision?: string;
    };
    duration_ms: number;
    popularity: number;
    preview_url?: string;
    external_urls?: {
      spotify: string;
    };
  };
  played_at?: string;
  added_at?: string;
}

interface SpotifyAlbum {
  albumId: string;
  albumName: string;
  albumTotalTracks: number;
  albumPopularity: string;
  albumImages: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  albumType: string;
  albumReleaseDate: string;
  added_at: string;
}

interface SpotifyPlaylist {
  playlistId: string;
  playlistName: string;
  playlistDescription: string;
  playlistImages: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  playlistFollowers: number;
  playlistCollaborative: boolean;
  added_at: string;
}

interface SpotifyUserData {
  user: SpotifyUser;
  profile: {
    savedTracks: SpotifyTrack[];
    playedTracks: SpotifyTrack[];
    savedAlbums: SpotifyAlbum[];
    savedPlaylists: SpotifyPlaylist[];
    topArtists: string[];
    topGenres: string[];
  };
  analytics: {
    totalSavedTracks: number;
    totalPlayedTracks: number;
    totalSavedAlbums: number;
    totalSavedPlaylists: number;
    listeningDiversity: number;
  };
  dataSource?: string;
  usingMockData?: boolean;
  hasContent?: boolean;
}

// Funkcja pomocnicza do konwersji adresu do formatu Ethereum
const toEthereumAddress = (address: string): `0x${string}` => {
  // Upewnij się, że adres ma prefiks 0x
  if (address.startsWith('0x')) {
    return address as `0x${string}`;
  }
  return `0x${address}` as `0x${string}`;
};

// Talent Protocol API functions
const fetchTalentScore = async (walletAddress: string): Promise<TalentScore | null> => {
  try {
    // Try different parameter combinations based on the API documentation
    const apiConfigs = [
      // Basic wallet address
      { id: walletAddress, account_source: 'wallet' },
      // Try without account_source
      { id: walletAddress },
      // Try with explicit builder score scorer
      { id: walletAddress, account_source: 'wallet', scorer_slug: 'builder_score' },
      // Try with just scorer_slug
      { id: walletAddress, scorer_slug: 'builder_score' }
    ];
    
    for (const config of apiConfigs) {
      try {
        // Build query string
        const params = new URLSearchParams();
        Object.entries(config).forEach(([key, value]) => {
          if (value) params.append(key, value);
        });
        
        const endpoint = `https://api.talentprotocol.com/score?${params.toString()}`;
        console.log(`Trying Talent Protocol endpoint: ${endpoint}`);
        
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/json',
            'X-API-KEY': process.env.NEXT_PUBLIC_TALENT_PROTOCOL_API_KEY || ''
          }
        });
        
        console.log(`Response status for ${endpoint}:`, response.status);
        
        if (!response.ok) {
          console.warn(`Endpoint returned ${response.status} for config:`, config);
          continue;
        }
        
        const data = await response.json();
        console.log(`✅ SUCCESS - Response from ${endpoint}:`, data);
        console.log('🔍 Detailed score object:', JSON.stringify(data.score, null, 2));
        
        // Handle different possible response structures based on API docs
        if (data.score) {
          console.log('📊 Score object type:', typeof data.score);
          console.log('📊 Score object keys:', Object.keys(data.score || {}));
          
          // If data.score is an object with score/percentile properties
          if (typeof data.score === 'object' && data.score !== null) {
            // Check if score object has score property
            if (data.score.score !== undefined) {
              console.log('✅ Found score.score:', data.score.score);
              return {
                score: data.score.score,
                percentile: data.score.percentile,
                human_checkmark: data.score.human_checkmark
              };
            }
            // Check if score object has value property  
            else if (data.score.value !== undefined) {
              console.log('✅ Found score.value:', data.score.value);
              return {
                score: data.score.value,
                percentile: data.score.percentile,
                human_checkmark: data.score.human_checkmark
              };
            }
            // Check if score object has builder_score property
            else if (data.score.builder_score !== undefined) {
              console.log('✅ Found score.builder_score:', data.score.builder_score);
              return {
                score: data.score.builder_score,
                percentile: data.score.percentile,
                human_checkmark: data.score.human_checkmark
              };
            }
                         // If score object has any numeric properties, try to use them
             else {
               const numericValues = Object.entries(data.score).filter(([key, value]) => typeof value === 'number');
               if (numericValues.length > 0) {
                 console.log('✅ Found numeric values in score object:', numericValues);
                 const scoreValue = numericValues[0][1] as number;
                 return {
                   score: scoreValue,
                   percentile: data.score.percentile,
                   human_checkmark: data.score.human_checkmark
                 };
               }
             }
          }
          // If data.score is just a number
          else if (typeof data.score === 'number') {
            console.log('✅ Found direct numeric score:', data.score);
            return {
              score: data.score,
              percentile: data.percentile,
              human_checkmark: data.human_checkmark
            };
          }
        }
        
        // Try other possible structures
        if (data.builder_score) {
          console.log('✅ Found builder_score:', data.builder_score);
          return data.builder_score;
        }
        
        if (data.scores && Array.isArray(data.scores) && data.scores.length > 0) {
          console.log('✅ Found scores array:', data.scores[0]);
          return data.scores[0];
        }
        
        console.log('⚠️ Score data structure not recognized for config:', config);
        console.log('⚠️ Available data keys:', Object.keys(data));
      } catch (endpointError) {
        console.warn(`Error with config ${JSON.stringify(config)}:`, endpointError);
        continue;
      }
    }
    
    console.warn('❌ No score data found from any endpoint configuration');
    return null;
  } catch (error) {
    console.error('Error fetching Talent Protocol score:', error);
    return null;
  }
};

const fetchTalentProfile = async (walletAddress: string): Promise<TalentProfile | null> => {
  try {
    const response = await fetch(`https://api.talentprotocol.com/profile?id=${walletAddress}`, {
      headers: {
        'Accept': 'application/json',
        'X-API-KEY': process.env.NEXT_PUBLIC_TALENT_PROTOCOL_API_KEY || ''
      }
    });
    
    if (!response.ok) {
      console.warn(`Talent Protocol Profile API returned ${response.status} for ${walletAddress}`);
      return null;
    }
    
    const data = await response.json();
            // console.log('Talent Protocol Profile Response:', data); // Debug log
    
    return data.profile || null;
  } catch (error) {
    console.error('Error fetching Talent Protocol profile:', error);
    return null;
  }
};

// Interfejs definiujący props komponentu
interface BuilderProfileProps {
  userAddress: string;
  currentUserAddress?: string;
  profile: {
    address: string;
    name: string;
    avatar?: string;
    bio?: string;
    postCount?: number;
    likesReceived?: number;
    socialLinks?: {
      twitter?: string;
      farcaster?: string;
      discord?: string;
    };
    baseChatPoints?: {
      postPoints?: number;
      likePoints?: number;
      activityBonus?: number;
      baseNameBonus?: number;
      sphereBonus?: number;
      camperBonus?: number;
      celoBonus?: number;
      worldBonus?: number;
      referralPoints?: number;
      totalPoints?: number;
    };
  };
  onBackToFeed: () => void;
  toEthereumAddress?: (address: string) => `0x${string}`; // Opcjonalne teraz
  // ✅ USUNIĘTO: RANK_DESCRIPTIONS - nie potrzebne już
  onSocialLinksUpdate?: (links: { twitter: string; farcaster: string; discord: string }) => void;
}

// Komponent funkcyjny do wyświetlania i edycji profilu budowniczego
export default function BuilderProfile({ 
  userAddress, 
  currentUserAddress, 
  profile, 
  onBackToFeed,
  toEthereumAddress: externalToEthereumAddress,
  onSocialLinksUpdate
}: BuilderProfileProps) {
  // Używaj dostarczonej funkcji lub wewnętrznej implementacji
  const convertAddress = externalToEthereumAddress || toEthereumAddress;
  
  // ✅ USUNIĘTO: rankDescriptions - nie potrzebne już bo usunęliśmy Builder Rank
  
  // Sprawdź czy to profil Vitalika
  const isVitalik = profile.name === 'vitalik.eth';
  
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [newBio, setNewBio] = useState(profile.bio || '');
  const [isSaving, setIsSaving] = useState(false);
  // Zapisane bio nie wraca do `profile` (rodzic trzyma je w swoim stanie i nie
  // ma dla niego zadnego callbacku). Bez tej nakladki po udanym zapisie sekcja
  // "About" pokazywala STARY tekst az do ponownego wejscia w profil.
  const [savedBioOverride, setSavedBioOverride] = useState<string | null>(null);
  const displayedBio = savedBioOverride ?? profile.bio;
  
  
  // Tip Stats state
  const [tipStats, setTipStats] = useState<TipStatsType | null>(null);
  const [loadingTipStats, setLoadingTipStats] = useState(false);
  
  // Talent Protocol state
  const [talentScore, setTalentScore] = useState<TalentScore | null>(null);
  const [talentProfile, setTalentProfile] = useState<TalentProfile | null>(null);
  const [loadingTalentData, setLoadingTalentData] = useState(false);

  // Twitter/Camp Network state
  const [twitterUser, setTwitterUser] = useState<TwitterUser | null>(null);
  const [twitterTweets, setTwitterTweets] = useState<TwitterTweet[]>([]);
  const [loadingTwitterData, setLoadingTwitterData] = useState(false);
  const [isTwitterSectionExpanded, setIsTwitterSectionExpanded] = useState(false);
  /* Nieudany odczyt z Campa. Null znaczy "nie bylo awarii", NIE "nie ma danych" -
     brak podpietego konta zostaje osobnym, pustym stanem. */
  const [twitterError, setTwitterError] = useState<string | null>(null);

  // Spotify/Camp Network state
  const [spotifyUserData, setSpotifyUserData] = useState<SpotifyUserData | null>(null);
  const [loadingSpotifyData, setLoadingSpotifyData] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [isSpotifySectionExpanded, setIsSpotifySectionExpanded] = useState(false);

  // Audio Player state
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [currentTrackUrl, setCurrentTrackUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [isLoading, setIsLoading] = useState(false);
  
  // Referral System state
  const [showReferralDashboard, setShowReferralDashboard] = useState(false);
  const [referralStatsInitialized, setReferralStatsInitialized] = useState(false);

  // 🚀 SOCIAL FEATURES: Hook i stany
  // Statystyki ogladanego profilu. Wczesniej szedl tu pelny useSocial, ktory dla
  // dwoch licznikow dociagal listy obserwujacych/znajomych/powiadomien (~150
  // odczytow) i zakladal nasluch na powiadomienia OBCEGO uzytkownika.
  const [followStats, setFollowStats] = useState<FollowStats | null>(null);
  const [friendsStats, setFriendsStats] = useState<FriendsStats | null>(null);

  useEffect(() => {
    if (!userAddress) {
      setFollowStats(null);
      setFriendsStats(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [follow, friends] = await Promise.all([
          getUserFollowStats(userAddress),
          getFriendsStats(userAddress)
        ]);
        if (cancelled) return;
        setFollowStats(follow);
        setFriendsStats(friends);
      } catch (error) {
        console.error('Error loading profile social stats:', error);
      }
    })();

    // Odpowiedz dla poprzedniego profilu nie moze nadpisac biezacego.
    return () => { cancelled = true; };
  }, [userAddress]);

  // Get actions for the current logged-in user
  const {
    followUser,
    unfollowUser,
    getFollowStatuses
  } = useSocialActions(currentUserAddress || null);

  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [checkingFollowStatus, setCheckingFollowStatus] = useState(true);
  // "Add Friend" nie mial zadnej blokady na czas zapytania - kazde kolejne
  // klikniecie wysylalo nastepne zaproszenie i nastepny toast "Sending...".
  const [sendingFriendRequest, setSendingFriendRequest] = useState(false);
  
  // Zresetuj stan edycji bio kiedy zmienia się profil
  useEffect(() => {
    setNewBio(profile.bio || '');
    setIsEditingBio(false);
    setSavedBioOverride(null);
  }, [profile]);
  
  // Initialize referral stats
  useEffect(() => {
    const initReferralStats = async () => {
      if (currentUserAddress && !referralStatsInitialized) {
        try {
          console.log('🔄 Initializing referral stats for:', currentUserAddress);
          const stats = await initializeReferralStats(currentUserAddress);
          setReferralStatsInitialized(true);
          console.log('✅ Referral stats initialized:', stats);
        } catch (error) {
          console.error('Error initializing referral stats:', error);
        }
      }
    };
    
    initReferralStats();
  }, [currentUserAddress, referralStatsInitialized]);

  // 🚀 SOCIAL FEATURES: Sprawdź follow status
  useEffect(() => {
    if (!currentUserAddress || currentUserAddress === userAddress) {
      setCheckingFollowStatus(false);
      return;
    }

    let cancelled = false;
    const checkFollowStatusAsync = async () => {
      setCheckingFollowStatus(true);
      try {
        const statuses = await getFollowStatuses([userAddress]);
        if (cancelled) return;
        setIsFollowing(Boolean(statuses[userAddress]));
      } catch (error) {
        if (cancelled) return;
        console.error('Error checking follow status:', error);
        setIsFollowing(false);
      } finally {
        if (!cancelled) setCheckingFollowStatus(false);
      }
    };

    checkFollowStatusAsync();
    // Szybkie przelaczanie profili nie moze wpisac odpowiedzi dla poprzedniego.
    return () => { cancelled = true; };
  }, [currentUserAddress, userAddress, getFollowStatuses]);

  // 🚀 FOLLOW/UNFOLLOW HANDLERS
  const handleFollowUser = async () => {
    if (!currentUserAddress || followLoading) return;
    
    setFollowLoading(true);
    try {
      const success = await followUser(userAddress);
      if (success) {
        setIsFollowing(true);
        toast.success('👥 User followed successfully!', {
          duration: 3000,
          position: 'top-right',
        });
      } else {
        toast.error('❌ Failed to follow user', {
          duration: 3000,
          position: 'top-right',
        });
      }
    } catch (error) {
      console.error('Error following user:', error);
      toast.error('❌ Failed to follow user', {
        duration: 3000,
        position: 'top-right',
      });
    } finally {
      setFollowLoading(false);
    }
  };

  const handleUnfollowUser = async () => {
    if (!currentUserAddress || followLoading) return;
    
    setFollowLoading(true);
    try {
      const success = await unfollowUser(userAddress);
      if (success) {
        setIsFollowing(false);
        toast.success('👋 User unfollowed successfully!', {
          duration: 3000,
          position: 'top-right',
        });
      } else {
        toast.error('❌ Failed to unfollow user', {
          duration: 3000,
          position: 'top-right',
        });
      }
    } catch (error) {
      console.error('Error unfollowing user:', error);
      toast.error('❌ Failed to unfollow user', {
        duration: 3000,
        position: 'top-right',
      });
    } finally {
      setFollowLoading(false);
    }
  };

  const handleSendFriendRequest = async () => {
    if (sendingFriendRequest) return;

    if (!currentUserAddress) {
      toast.error('Please connect your wallet first!');
      return;
    }

    // Check if trying to send request to yourself
    if (currentUserAddress === userAddress) {
      toast.error('🚫 Cannot send friend request to yourself!', {
        duration: 3000,
        position: 'top-right',
      });
      return;
    }
    
    setSendingFriendRequest(true);

    // Show loading toast
    const loadingToast = toast.loading('Sending friend request...', {
      position: 'top-right',
    });

    try {
      const result = await sendFriendRequestDirect(currentUserAddress!, userAddress, 'Hello! Let\'s be friends! 🤝');
      
      toast.dismiss(loadingToast);
      
      if (result.success) {
        toast.success('🤝 Friend request sent successfully!', {
          duration: 4000,
          position: 'top-right',
          style: {
            background: '#10B981',
            color: '#fff',
          },
        });
      } else {
        // Different toasts for different errors
        if (result.error === 'Already friends') {
          toast('👥 You are already friends!', {
            duration: 3000,
            position: 'top-right',
            icon: '👥',
          });
        } else if (result.error === 'Friend request already sent') {
          toast('⏳ Friend request already sent!', {
            duration: 3000,
            position: 'top-right',
            icon: '⏳',
          });
        } else {
          toast.error(`❌ ${result.error || 'Failed to send friend request'}`, {
            duration: 4000,
            position: 'top-right',
          });
        }
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error sending friend request:', error);
      toast.error('❌ Network error! Please try again.', {
        duration: 4000,
        position: 'top-right',
      });
    } finally {
      setSendingFriendRequest(false);
    }
  };

  /**
   * Wynik odczytu z tras Campa.
   *
   * DLACZEGO NIE `T | null`. Trasy /api/camp/* moga teraz odmowic (zly adres,
   * za szybko) albo nie dostac odpowiedzi od Campa. Zwijanie tego do `null`
   * sprawialo, ze awaria rysowala sie dokladnie tak samo jak "ten portfel nic
   * nie podpial" - czyli klamalismy uzytkownikowi w oczy.
   */
  type CampReadResult<T> =
    | { state: 'ok'; data: T }
    | { state: 'error'; message: string };

  /** Wyciaga zdanie od serwera; kazda odmowa niesie `error`. */
  const readCampError = async (response: Response, fallback: string): Promise<string> => {
    try {
      const data = await response.json();
      if (typeof data?.error === 'string' && data.error.trim()) return data.error;
    } catch {
      // odpowiedz bez JSON - zostajemy przy zdaniu zapasowym
    }
    return fallback;
  };

  // Fetch Twitter data from Camp Network
  const fetchTwitterData = async (address: string): Promise<CampReadResult<any>> => {
    if (!address) return { state: 'error', message: 'No wallet address to look up.' };

    const fallback = 'X data could not be loaded for this wallet.';

    try {
      // Try direct Camp Network API first for more complete data
      const response = await fetch(`/api/camp/twitter?address=${encodeURIComponent(address)}&direct=true`);

      if (!response.ok) {
        console.warn(`Twitter API returned ${response.status} for address ${address}`);
        return { state: 'error', message: await readCampError(response, fallback) };
      }

      const data = await response.json();

      if (data.error) {
        console.warn('Twitter API error:', data.error);
        return {
          state: 'error',
          message: typeof data.error === 'string' && data.error.trim() ? data.error : fallback,
        };
      }

      return { state: 'ok', data: data.data };
    } catch (error) {
      console.error('Error fetching Twitter data:', error);
      return { state: 'error', message: 'Could not reach the server to load X data.' };
    }
  };

  // Fetch Spotify data from Camp Network with localStorage caching
  const fetchSpotifyData = async (address: string): Promise<CampReadResult<any>> => {
    if (!address) return { state: 'error', message: 'No wallet address to look up.' };

    const fallback = 'Spotify data could not be loaded for this wallet.';

    // Try to load from localStorage first
    const cacheKey = `spotify_data_${address}`;
    const cacheTimestampKey = `spotify_data_${address}_timestamp`;
    const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes cache
    
    try {
      const cachedData = localStorage.getItem(cacheKey);
      const cachedTimestamp = localStorage.getItem(cacheTimestampKey);
      
      if (cachedData && cachedTimestamp) {
        const age = Date.now() - parseInt(cachedTimestamp);
        if (age < CACHE_DURATION) {
          console.log(`🎵 Spotify data loaded from cache (${Math.round(age/1000)}s old)`);
          return { state: 'ok', data: JSON.parse(cachedData) };
        } else {
          // Cache expired, remove old data
          localStorage.removeItem(cacheKey);
          localStorage.removeItem(cacheTimestampKey);
          console.log(`🎵 Spotify cache expired (${Math.round(age/1000)}s old) - fetching fresh data`);
        }
      }
    } catch (error) {
      console.warn('Error reading Spotify cache:', error);
    }
    
    try {
      // Fetch comprehensive Spotify data using Camp Network API
      const response = await fetch(`/api/camp/spotify?address=${encodeURIComponent(address)}&type=full`);

      if (!response.ok) {
        console.warn(`Spotify API returned ${response.status} for address ${address}`);
        return { state: 'error', message: await readCampError(response, fallback) };
      }

      const data = await response.json();

      if (data.error) {
        console.warn('Spotify API error:', data.message || data.error);
        return {
          state: 'error',
          message: typeof data.error === 'string' && data.error.trim() ? data.error : fallback,
        };
      }

      // 200 + success:false to jedyny przypadek, w ktorym trasa naprawde mowi
      // "sprawdzilem i nic tu nie ma" - i tylko to wolno pokazac jako pustke.
      if (!data.success) {
        return { state: 'ok', data: null };
      }

      // 🐛 DEBUG: Check what data we're getting
      console.log('🎵 Spotify API Response:', {
        hasUser: !!data.data?.user,
        hasProfile: !!data.data?.profile,
        playedTracksCount: data.data?.profile?.playedTracks?.length || 0,
        savedTracksCount: data.data?.profile?.savedTracks?.length || 0,
        dataSource: data.data?.dataSource,
        usingMockData: data.data?.usingMockData
      });

      // Save to localStorage for caching
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data.data));
        localStorage.setItem(cacheTimestampKey, Date.now().toString());
        console.log('🎵 Spotify data cached successfully');
      } catch (cacheError) {
        console.warn('Failed to cache Spotify data:', cacheError);
      }

      return { state: 'ok', data: data.data };
    } catch (error) {
      console.error('Error fetching Spotify data:', error);
      return { state: 'error', message: 'Could not reach the server to load Spotify data.' };
    }
  };

  // Clear Spotify cache function (for debugging or manual refresh)
  const clearSpotifyCache = (address: string) => {
    try {
      localStorage.removeItem(`spotify_data_${address}`);
      localStorage.removeItem(`spotify_data_${address}_timestamp`);
      console.log('🎵 Spotify cache cleared for address:', address);
    } catch (error) {
      console.warn('Error clearing Spotify cache:', error);
    }
  };

  /**
   * Jedno wejscie do odczytu X - uzywaja go pierwsze ladowanie i przycisk
   * ponowienia. Awaria zostawia wlasny komunikat, a nie pusty panel.
   */
  const loadTwitterData = async (address: string) => {
    setLoadingTwitterData(true);
    setTwitterError(null);
    try {
      const result = await fetchTwitterData(address);

      if (result.state === 'error') {
        setTwitterUser(null);
        setTwitterTweets([]);
        setTwitterError(result.message);
        return;
      }

      const twitterData = result.data;
      if (twitterData && twitterData.twitterUser) {
        setTwitterUser(twitterData.twitterUser);
        setTwitterTweets(twitterData.tweets || []);
      } else {
        // Camp odpowiedzial i nic nie mial - to JEST pustka, wolno ja pokazac.
        setTwitterUser(null);
        setTwitterTweets([]);
      }
    } finally {
      setLoadingTwitterData(false);
    }
  };

  /** To samo dla Spotify - wspolne dla ladowania i przycisku odswiezenia. */
  const loadSpotifyData = async (address: string) => {
    setLoadingSpotifyData(true);
    setSpotifyError(null);
    try {
      const result = await fetchSpotifyData(address);

      if (result.state === 'error') {
        setSpotifyUserData(null);
        setSpotifyError(result.message);
        return;
      }

      setSpotifyUserData(result.data);
    } finally {
      setLoadingSpotifyData(false);
    }
  };

  // Refresh Spotify data
  const refreshSpotifyData = async () => {
    if (!userAddress) return;
    clearSpotifyCache(userAddress);
    await loadSpotifyData(userAddress);
  };

  // Audio Player Functions
  const playTrack = (previewUrl: string) => {
    if (!previewUrl) return;
    
    // If same track, just toggle play/pause
    if (currentTrackUrl === previewUrl && currentAudio) {
      if (currentAudio.paused) {
        console.log('🎵 Resuming track');
        currentAudio.play();
        setIsPlaying(true);
      } else {
        console.log('⏸️ Pausing track');
        currentAudio.pause();
        setIsPlaying(false);
      }
      return;
    }

    // Stop current track if playing (only for different tracks)
    if (currentAudio) {
      currentAudio.pause();
      setIsPlaying(false);
    }

    // Create new audio for different track
    setIsLoading(true);
    setCurrentTrackUrl(previewUrl);
    
    const audio = new Audio(previewUrl);
    audio.volume = volume;
    
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setIsLoading(false);
    });
    
    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });
    
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });
    
    audio.addEventListener('error', () => {
      setIsLoading(false);
      console.error('Failed to load audio');
    });

    setCurrentAudio(audio);
    audio.play();
    setIsPlaying(true);
  };

  const pauseTrack = () => {
    if (currentAudio) {
      currentAudio.pause();
      setIsPlaying(false);
    }
  };

  const stopTrack = () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

  const setTrackVolume = (newVolume: number) => {
    setVolume(newVolume);
    if (currentAudio) {
      currentAudio.volume = newVolume;
    }
  };

  const seekToTime = (time: number) => {
    if (currentAudio) {
      currentAudio.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup audio on component unmount
  useEffect(() => {
    return () => {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
      }
    };
  }, [currentAudio]);

  // Fetch Tip Stats data
  useEffect(() => {
    const fetchTipStatsData = async () => {
      if (!userAddress) return;
      
      setLoadingTipStats(true);
      try {
        const stats = await getUserTipStats(userAddress);
        setTipStats(stats);
      } catch (error) {
        console.error('Error fetching tip stats:', error);
      } finally {
        setLoadingTipStats(false);
      }
    };

    fetchTipStatsData();
  }, [userAddress]);

  // Fetch Talent Protocol data
  useEffect(() => {
    const fetchTalentData = async () => {
      if (!userAddress || !process.env.NEXT_PUBLIC_TALENT_PROTOCOL_API_KEY) return;
      
      setLoadingTalentData(true);
      try {
        const [scoreData, profileData] = await Promise.all([
          fetchTalentScore(userAddress),
          fetchTalentProfile(userAddress)
        ]);
        
        setTalentScore(scoreData);
        setTalentProfile(profileData);
      } catch (error) {
        console.error('Error fetching Talent Protocol data:', error);
      } finally {
        setLoadingTalentData(false);
      }
    };

    fetchTalentData();
  }, [userAddress]);

  // Fetch Twitter data
  useEffect(() => {
    if (!userAddress) return;
    void loadTwitterData(userAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress]);

  // Fetch Spotify data
  useEffect(() => {
    if (!userAddress) return;
    void loadSpotifyData(userAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress]);

  // Funkcja do zapisywania nowego bio
  const handleSaveBio = async () => {
    if (!currentUserAddress || currentUserAddress !== userAddress) return;
    
    try {
      setIsSaving(true);
      
      // Sprawdź ostatnią edycję bio
      const userRef = doc(db, 'users', userAddress);
      const userDoc = await getDoc(userRef);
      const lastBioUpdate = userDoc.data()?.lastBioUpdate?.toDate() || new Date(0);
      const now = new Date();
      
      // Sprawdź czy minęło 24h od ostatniej edycji
      if (now.getTime() - lastBioUpdate.getTime() < 24 * 60 * 60 * 1000) {
        const nextUpdate = new Date(lastBioUpdate.getTime() + 24 * 60 * 60 * 1000);
        const hoursLeft = Math.ceil((nextUpdate.getTime() - now.getTime()) / (1000 * 60 * 60));
        alert(`You can edit your bio once per day. ${hoursLeft} hours remaining.`);
        setIsEditingBio(false);
        return;
      }

      if (newBio.length <= 90) {
        await updateDoc(userRef, {
          bio: newBio,
          lastBioUpdate: serverTimestamp()
        });

        // Pokaz to, co naprawde zostalo zapisane - inaczej po zamknieciu
        // edytora wraca stara tresc z propsa `profile`.
        setSavedBioOverride(newBio);

        // Zamknij tryb edycji
        setIsEditingBio(false);
      } else {
        alert('Bio must be 90 characters or less.');
      }
    } catch (error) {
      console.error('Error saving bio:', error);
      alert('An error occurred while saving your bio. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Funkcja do kopiowania adresu do schowka
  const copyAddressToClipboard = () => {
    navigator.clipboard.writeText(profile.address);
    toast.success('Address copied to clipboard!');
  };

  /**
   * Kopiuje link do PUBLICZNEGO profilu (/u/[address]).
   *
   * Ten panel jest widoczny tylko wewnatrz aplikacji - nie da sie go nikomu
   * wyslac. Trasa /u/[address] jest serwerowa, ma wlasne metadane i karte OG,
   * wiec dopiero ona jest czyms, co ma sens wkleic poza aplikacja.
   */
  const copyPublicProfileLink = () => {
    // origin z przegladarki, a nie stala - dzieki temu link dziala tak samo na
    // produkcji, na preview Vercela i lokalnie.
    const url = `${window.location.origin}/u/${profile.address}`;
    navigator.clipboard.writeText(url);
    toast.success('Profile link copied — paste it anywhere.');
  };

  return (
    <div className="font-soft">
      {/* Builder Panel Header with Back Button - nowoczesny gradient */}
      <div className="bg-soft-primary-deep p-5 relative overflow-hidden">
        {/* Dodajemy efekt połysku */}
        <div className="absolute top-0 left-0 right-0 h-px bg-white opacity-20"></div>
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-soft-primary rounded-full filter blur-3xl opacity-30"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-soft-primary rounded-full filter blur-3xl opacity-20"></div>

        <div className="flex items-center justify-between relative z-10">
          <button
            onClick={onBackToFeed}
            className="flex items-center text-white bg-white/15 rounded-pill px-4 py-2 font-semibold transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-white/25 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white border border-white/20"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Feed
          </button>
          <div className="text-xl font-soft-display font-bold text-white">Builder Profile</div>
          <div className="w-24"></div> {/* Placeholder dla wyrównania */}
        </div>
      </div>
      
      {/* User Info Section */}
      <div className="p-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-12 mb-6 p-8 lg:p-12 relative overflow-hidden rounded-card bg-soft-surface border border-soft-line shadow-card">
          {/* Premium białe i niebieskie efekty świetlne */}
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-soft-primary/10 rounded-full filter blur-3xl"></div>
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-soft-accent-soft/50 rounded-full filter blur-2xl"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-soft-line"></div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-soft-line"></div>

          {/* Efekt premium szkła z białymi refleksami */}
          <div className="absolute inset-0 bg-transparent"></div>
          <div className="absolute inset-0 bg-transparent"></div>
          
          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-12 w-full">
          <div className="flex flex-col items-center lg:items-start">
            <div className="w-28 h-28 lg:w-32 lg:h-32 rounded-full overflow-hidden flex-shrink-0 relative group">
              {/* Premium ramka z białym gradientem */}
              <div className="absolute inset-0 rounded-full bg-soft-sunken p-1 shadow-card">
                <div className="w-full h-full rounded-full overflow-hidden bg-soft-surface">
                  {profile.avatar ? (
                    <img 
                      src={profile.avatar} 
                      alt="Profile" 
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                  ) : (
                    <Avatar address={convertAddress(profile.address)} className="w-full h-full" />
                  )}
                </div>
              </div>
              
              {/* Premium efekty świetlne */}
              <div className="absolute inset-0 rounded-full bg-transparent"></div>
              <div className="absolute -inset-2 rounded-full bg-soft-primary/10 filter blur-lg opacity-60 group-hover:opacity-80 transition-opacity [transition-duration:var(--dur-dropdown)] ease-out-strong"></div>
            </div>
            
            {/* Nazwa użytkownika pod avatarem */}
            <div className={`mt-3 text-lg lg:text-xl font-soft-display font-bold text-center lg:text-left ${
              isVitalik
                ? "text-soft-accent-deep"
                : "text-soft-ink"
            }`}>
              {profile.name.endsWith('.base.eth') ? (
                <span className="text-soft-primary-deep font-semibold">{profile.name}</span>
              ) : profile.name.endsWith('.sphere') ? (
                <>
                  <span className="text-soft-ink">{profile.name.replace('.sphere', '')}</span>
                  <span className="text-soft-primary-deep">.sphere</span>
                </>
              ) : profile.name.endsWith('.camper') ? (
                <>
                  <span className="text-soft-ink">{profile.name.replace('.camper', '')}</span>
                  <span className="text-soft-accent-deep">.camper🏕️</span>
                </>
              ) : profile.name.endsWith('.celo') ? (
                <>
                  <span className="text-soft-ink">{profile.name.replace('.celo', '')}</span>
                  <span className="!text-soft-accent-deep">.celo</span>
                </>
              ) : profile.name.endsWith('.world') ? (
                <>
                  <span className="text-soft-ink">{profile.name.replace('.world', '')}</span>
                  <span className="text-soft-info">.world</span>
                </>
              ) : (
                <>
                  {profile.name}
                  {isVitalik && (
                    <span className="inline-flex items-center ml-2">
                      <img 
                        src="/ethlogo.png" 
                        alt="ETH" 
                        className="w-4 h-4 object-contain"
                      />
                    </span>
                  )}
                </>
              )}
            </div>
            
            {/* Badge dla Vitalika */}
            {isVitalik && (
              <div className="mt-1 flex justify-center lg:justify-start">
                <span className="inline-flex items-center px-3 py-0.5 rounded-pill bg-soft-accent-deep text-white text-xs font-semibold shadow-chip">
                  Ethereum Founder
                </span>
              </div>
            )}
            
            {/* Skrócony adres portfela pod avatarem */}
            <div className="mt-3 lg:mt-4 w-full lg:w-auto flex flex-col items-center lg:items-start space-y-3">
              <button
                onClick={copyAddressToClipboard}
                aria-label="Copy wallet address"
                className="flex items-center text-xs text-soft-ink-muted hover:text-soft-primary-deep bg-soft-sunken hover:bg-soft-line px-3 py-1.5 rounded-pill border border-soft-line shadow-chip transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary w-fit"
              >
                <span className="mr-2 font-mono tabular-nums text-soft-ink">{profile.address.slice(0,6)}...{profile.address.slice(-4)}</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>

              {/* Link do publicznego profilu - jedyne wyjscie z tego panelu na
                  zewnatrz aplikacji. Otwiera trase w nowej karcie, a ikona obok
                  kopiuje ten sam adres do schowka. */}
              <div className="flex items-center gap-1.5">
                <a
                  href={`/u/${profile.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center text-xs text-soft-primary-deep hover:bg-soft-line bg-soft-sunken px-3 py-1.5 rounded-pill border border-soft-line shadow-chip transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary w-fit"
                >
                  <span className="mr-1.5 font-semibold">Public profile</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                <button
                  onClick={copyPublicProfileLink}
                  title="Copy profile link"
                  aria-label="Copy profile link"
                  className="flex items-center justify-center h-[30px] w-[30px] text-soft-ink-muted hover:text-soft-primary-deep bg-soft-surface hover:bg-soft-sunken rounded-pill border border-soft-line shadow-chip transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
                  </svg>
                </button>
              </div>

              {/* Linki społecznościowe */}
              <ProfileSocials
                address={convertAddress(profile.address)}
                initialLinks={profile.socialLinks}
                lazyLoad={false}
                isOwner={currentUserAddress === userAddress}
                onSave={(newLinks) => {
                  if (onSocialLinksUpdate) {
                    onSocialLinksUpdate(newLinks);
                  }
                }}
              />
            </div>
          </div>

          <div className="flex-1 w-full lg:max-w-none">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between mb-4 lg:mb-6">
              <div className="flex flex-col lg:flex-1">
                <div className="flex flex-col space-y-4 lg:space-y-5">
                  {/* Creator Earnings - Rozciągnięty na całą szerokość */}
                  {(tipStats && tipStats.tipCount > 0) ? (
                    <div className="bg-soft-surface border border-soft-line rounded-card px-6 py-4 shadow-card transition-shadow [transition-duration:var(--dur-press)] ease-out-strong relative w-full">
                      {/* Golden glow effect */}
                      <div className="absolute inset-0 bg-soft-accent-soft/30 rounded-card opacity-50"></div>
                      
                      <div className="relative flex items-center justify-between">
                        {/* Left side - Title and icon */}
                        <div className="flex items-center space-x-2">
                          <img 
                            src="/favicon_io (1)/android-chrome-192x1921.png" 
                            alt="MySphere" 
                            className="w-4 h-4 object-contain"
                          />
                          <span className="text-xs font-semibold uppercase tracking-wider text-soft-ink-faint">Creator Earnings</span>
                        </div>
                        
                        {/* Right side - ETH, USDC and CAMP values with proper icons */}
                        <div className="flex items-center space-x-4">
                          {tipStats.ethReceived > 0 && (
                            <div className="flex items-center space-x-2.5">
                              <div className="flex items-center -space-x-0.5">
                                <img src="/brand-kit/base/logo/in-product/Base_Network_Logo.svg" alt="Base" className="w-4 h-4 z-10" />
                                <img src="/icons/eth.svg" alt="ETH" className="w-4 h-4" />
                              </div>
                              <span className="text-sm font-semibold text-soft-accent-deep font-soft-display tabular-nums">
                                {tipStats.ethReceived.toFixed(4)}
                              </span>
                            </div>
                          )}
                          {tipStats.usdcReceived > 0 && (
                            <div className="flex items-center space-x-1.5">
                              <img src="/icons/usdc.svg" alt="USDC" className="w-4 h-4" />
                              <span className="text-sm font-semibold text-soft-accent-deep font-soft-display tabular-nums">
                                {tipStats.usdcReceived.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {/* CAMP token support - ODBLOKOWANY */}
                          <div className="flex items-center space-x-1.5">
                            <img src="/Camp.png" alt="CAMP" className="w-4 h-4" />
                            <span className="text-sm font-semibold text-soft-accent-deep font-soft-display tabular-nums">
                              0.00
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : loadingTipStats ? (
                    <div className="bg-soft-surface border border-soft-line rounded-card px-6 py-4 shadow-card w-full">
                      <div className="flex items-center justify-center space-x-2">
                        <div className="animate-pulse bg-soft-sunken text-soft-ink-faint rounded-pill px-3 py-2 text-sm">
                          Loading earnings...
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Creator Coin Section */}
                  <CreatorCoinSection 
                    userAddress={userAddress} 
                    currentUserAddress={currentUserAddress}
                  />

                  {/* Separator gradientowy przed social stats */}
                  {(followStats || friendsStats) && (
                    <>
                      <div className="w-full h-px bg-soft-line my-3"></div>
                      <div className="flex items-center flex-wrap gap-3 lg:gap-4 text-xs">
                        {followStats && (
                        <>
                          <div className="flex items-center space-x-1 bg-soft-sunken border border-soft-line px-3 py-1.5 rounded-pill shadow-chip">
                            <svg className="w-3 h-3 text-soft-primary-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="text-soft-ink font-soft-display font-bold tabular-nums">{followStats.followers}</span>
                            <span className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">followers</span>
                          </div>
                          <div className="flex items-center space-x-1 bg-soft-sunken border border-soft-line px-3 py-1.5 rounded-pill shadow-chip">
                            <svg className="w-3 h-3 text-soft-primary-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="text-soft-ink font-soft-display font-bold tabular-nums">{followStats.following}</span>
                            <span className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">following</span>
                          </div>
                        </>
                        )}
                        {friendsStats && (
                          <div className="flex items-center space-x-1 bg-soft-sunken border border-soft-line px-3 py-1.5 rounded-pill shadow-chip">
                            <svg className="w-3 h-3 text-soft-primary-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                            </svg>
                            <span className="text-soft-ink font-soft-display font-bold tabular-nums">{friendsStats.totalFriends}</span>
                            <span className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">friends</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  
                  {/* Referral System Button - only for own profile */}
                  {currentUserAddress === userAddress && (
                    <>
                      <div className="w-full h-px bg-soft-line my-3"></div>
                      <button
                        onClick={() => setShowReferralDashboard(!showReferralDashboard)}
                        aria-expanded={showReferralDashboard}
                        className="flex items-center space-x-2 px-4 py-2 rounded-pill text-sm font-semibold bg-soft-primary text-white hover:bg-soft-primary-deep transition-colors [transition-duration:var(--dur-press)] ease-out-strong shadow-chip active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M4.5 12a7.5 7.5 0 1115 0 7.5 7.5 0 01-15 0z" />
                        </svg>
                        <span>Referral System</span>
                        <svg className={`w-4 h-4 transition-transform ${showReferralDashboard ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </>
                  )}

                  {/* Separator gradientowy przed action buttons */}
                  {currentUserAddress !== userAddress && (
                    <>
                      <div className="w-full h-px bg-soft-line my-3"></div>
                      <div className="flex items-center flex-wrap gap-3 lg:gap-4">
                      {/* Follow Button (Przycisk obserwowania) */}
                      {!checkingFollowStatus && (
                        <button
                          onClick={isFollowing ? handleUnfollowUser : handleFollowUser}
                          disabled={followLoading}
                          className={`flex items-center space-x-1 px-3 py-1.5 rounded-pill text-xs font-semibold transition-colors [transition-duration:var(--dur-press)] ease-out-strong shadow-chip border active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                            isFollowing
                              ? 'bg-soft-sunken border-soft-line text-soft-primary-deep hover:bg-soft-line'
                              : 'bg-soft-primary border-soft-primary text-white hover:bg-soft-primary-deep'
                          } ${followLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {followLoading ? (
                            <>
                              <div className="w-3 h-3 border-2 border-soft-ink-soft border-t-transparent rounded-full animate-spin"></div>
                              <span>Loading...</span>
                            </>
                          ) : isFollowing ? (
                            <>
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                              </svg>
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              <span>Follow</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Friend Request Button (Przycisk zaproszenia do znajomych) */}
                      <button
                        onClick={handleSendFriendRequest}
                        disabled={sendingFriendRequest}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-pill text-xs font-semibold bg-soft-accent-deep border border-soft-accent-deep text-white hover:bg-soft-accent transition-colors [transition-duration:var(--dur-press)] ease-out-strong shadow-chip active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${sendingFriendRequest ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                        </svg>
                        <span>Add Friend</span>
                      </button>

                      {/* Tip Button */}
                      <div className="bg-soft-sunken border border-soft-line rounded-pill shadow-chip transition-colors [transition-duration:var(--dur-press)] ease-out-strong">
                        <TipButton
                          recipientAddress={userAddress}
                          postId={`profile-${userAddress}`}
                          className="text-soft-accent-deep p-2"
                        />
                      </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
                    </div>
          </div>
        </div>
        
        {/* Referral Dashboard - displayed after clicking the button */}
        {showReferralDashboard && currentUserAddress === userAddress && (
          <div className="mb-6">
            <ReferralDashboard 
              userAddress={userAddress} 
              isOwnProfile={true}
            />
          </div>
        )}
          
        {/* Talent Protocol Builder Score */}
        {(talentScore || talentProfile || loadingTalentData) && (
          <div className="mb-6 relative overflow-hidden rounded-card bg-soft-surface border border-soft-line shadow-card">
            {/* Neonowa poświata */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-soft-primary/10 rounded-full filter blur-2xl"></div>
            <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-soft-accent-soft/50 rounded-full filter blur-xl"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-soft-line"></div>

            {/* Efekt szkła */}
            <div className="absolute inset-0 bg-transparent"></div>

            <div className="relative z-10 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-soft-sunken border border-soft-line mr-4 shadow-chip">
                    <svg className="w-6 h-6 text-soft-primary-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-soft-display font-bold text-xl text-soft-ink">Talent Protocol</h3>
                    <p className="text-sm text-soft-ink-muted">Builder Reputation</p>
                  </div>
                </div>

                {talentProfile?.human_checkmark && (
                  <div className="flex items-center bg-soft-sunken border border-soft-line px-3 py-1.5 rounded-pill shadow-chip">
                    <svg className="w-4 h-4 text-soft-primary-deep mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-soft-primary-deep font-semibold">Human Verified</span>
                  </div>
                )}
              </div>
              
              {loadingTalentData ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-soft-line border-t-soft-primary"></div>
                  <span className="ml-4 text-soft-ink-muted">Loading Builder Score...</span>
                </div>
              ) : (talentScore && (talentScore.score !== undefined || talentScore.percentile !== undefined)) ? (
                <div className="text-center">
                  {/* Builder Score z neonową poświatą */}
                  <div className="relative inline-block mb-2">
                    <div className="text-6xl font-soft-display font-bold tabular-nums text-soft-primary-deep relative z-10">
                      {(talentScore.score !== undefined && talentScore.score !== null) ? talentScore.score.toFixed(0) : 'N/A'}
                    </div>
                    {/* Dodatkowa neonowa poświata */}
                    <div className="absolute inset-0 text-6xl font-soft-display font-bold tabular-nums text-soft-primary blur-md opacity-20">
                      {(talentScore.score !== undefined && talentScore.score !== null) ? talentScore.score.toFixed(0) : 'N/A'}
                    </div>
                  </div>

                  <div className="text-xs uppercase tracking-wider font-semibold text-soft-ink-faint mb-4">Builder Score</div>
                  
                  {/* Percentile - jeśli dostępny */}
                  {(talentScore.percentile !== undefined && talentScore.percentile !== null) && (
                    <div className="flex items-center justify-center">
                      <div className="bg-soft-sunken border border-soft-line rounded-pill px-4 py-2 shadow-chip">
                        <span className="text-soft-primary-deep text-sm font-semibold tabular-nums">
                          Top {100 - talentScore.percentile}% Builder
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : talentProfile ? (
                <div className="text-center py-6">
                  <div className="text-soft-ink-soft text-sm">
                    Profile found but Builder Score not available
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="text-soft-ink-soft text-sm">
                    No Talent Protocol data available
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Konektor Camp Network - tylko na wlasnym profilu.
            Stoi NAD sekcjami Twittera i Spotify celowo: te sekcje pokazuja dane
            czytane z Campa po adresie portfela, wiec bez podpiecia konta nie
            renderuja sie wcale. Wczesniej nie bylo z tego miejsca zadnej drogi
            do podpiecia - mechanizm zyl tylko na /mycamp, a ta trasa jest
            wylaczona w config/routeStatus.js. */}
        {currentUserAddress === userAddress && (
          <CampSocialsCard address={userAddress} />
        )}

        {/* Twitter Profile Section.
            Sekcja pokazuje sie takze przy awarii odczytu - inaczej padnieta
            trasa /api/camp/twitter znikala bez sladu i wygladala jak brak konta. */}
        {(twitterUser || loadingTwitterData || twitterError) && (
          <div className="mb-6 relative overflow-hidden rounded-card bg-soft-surface border border-soft-line shadow-card">
            {/* Twitter blue poświata */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-soft-primary/10 rounded-full filter blur-2xl"></div>
            <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-soft-accent-soft/50 rounded-full filter blur-xl"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-soft-line"></div>

            {/* Efekt szkła */}
            <div className="absolute inset-0 bg-transparent"></div>

            <div className="relative z-10 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-soft-sunken border border-soft-line mr-4 shadow-chip">
                    <svg className="w-6 h-6 text-soft-primary-deep" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-soft-display font-bold text-xl text-soft-ink">Twitter Profile</h3>
                    <p className="text-sm text-soft-ink-muted">Social Activity</p>
                  </div>
                </div>

                {twitterUser?.isVerified && (
                  <div className="flex items-center bg-soft-sunken border border-soft-line px-3 py-1.5 rounded-pill shadow-chip">
                    <svg className="w-4 h-4 text-soft-primary-deep mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <span className="text-xs text-soft-primary-deep font-semibold">Verified</span>
                  </div>
                )}
              </div>
              
              {loadingTwitterData ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-soft-line border-t-soft-primary"></div>
                  <span className="ml-4 text-soft-ink-muted">Loading Twitter data...</span>
                </div>
              ) : twitterError ? (
                <div className="text-center py-6" role="status">
                  <div className="text-soft-ink-muted text-sm">{twitterError}</div>
                  <div className="text-soft-ink-faint text-xs mt-1">
                    This is a failed lookup, not an empty profile.
                  </div>
                  <button
                    type="button"
                    onClick={() => userAddress && loadTwitterData(userAddress)}
                    className="mt-3 text-xs font-semibold text-soft-primary-deep bg-soft-sunken border border-soft-line px-3 py-1.5 rounded-pill shadow-chip hover:bg-soft-line transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    Try again
                  </button>
                </div>
              ) : twitterUser ? (
                <div>
                  {/* Twitter User Info */}
                  <div className="flex items-start space-x-4 mb-6">
                    <img
                      src={twitterUser.profilePictureUrl}
                      alt={`${twitterUser.displayName} avatar`}
                      className="w-16 h-16 rounded-full border-2 border-soft-line"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="text-lg font-soft-display font-bold text-soft-ink truncate">{twitterUser.displayName}</h4>
                        <a
                          href={`https://x.com/${twitterUser.userHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-soft-primary-deep hover:bg-soft-line text-sm font-mono bg-soft-sunken px-2 py-1 rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                        >
                          @{twitterUser.userHandle}
                        </a>
                      </div>
                      {twitterUser.profileBio && (
                        <p className="text-soft-ink-muted text-sm leading-relaxed mb-3">{twitterUser.profileBio}</p>
                      )}
                      {twitterUser.location && (
                        <div className="flex items-center text-soft-ink-soft text-sm mb-3">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {twitterUser.location}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Twitter Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center bg-soft-surface rounded-card p-3 shadow-card">
                      <div className="text-soft-ink text-2xl font-soft-display font-bold tabular-nums">{twitterUser.followerCount.toLocaleString()}</div>
                      <div className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">Followers</div>
                    </div>
                    <div className="text-center bg-soft-surface rounded-card p-3 shadow-card">
                      <div className="text-soft-ink text-2xl font-soft-display font-bold tabular-nums">{twitterUser.followingCount.toLocaleString()}</div>
                      <div className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">Following</div>
                    </div>
                    <div className="text-center bg-soft-surface rounded-card p-3 shadow-card">
                      <div className="text-soft-ink text-2xl font-soft-display font-bold tabular-nums">{twitterUser.likeCount.toLocaleString()}</div>
                      <div className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">Likes</div>
                    </div>
                  </div>

                  {/* Expandable Recent Tweets */}
                  {twitterTweets.length > 0 && (
                    <>
                      <button
                        onClick={() => setIsTwitterSectionExpanded(!isTwitterSectionExpanded)}
                        aria-expanded={isTwitterSectionExpanded}
                        className="w-full flex items-center justify-center text-soft-primary-deep hover:text-soft-ink transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary border-t border-soft-line pt-4"
                      >
                        <span className="text-sm font-semibold mr-2">
                          {isTwitterSectionExpanded ? 'Hide Recent Tweets' : `Show Recent Tweets (${twitterTweets.length})`}
                        </span>
                        {isTwitterSectionExpanded ? (
                          <ChevronUpIcon className="w-4 h-4" />
                        ) : (
                          <ChevronDownIcon className="w-4 h-4" />
                        )}
                      </button>

                      {/* Recent Tweets */}
                      {isTwitterSectionExpanded && (
                        <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                          {twitterTweets.slice(0, 5).map((tweet) => (
                            <div key={tweet.id} className="bg-soft-surface rounded-card p-4 border border-soft-line shadow-chip">
                              <p className="text-soft-ink-muted text-sm leading-relaxed mb-3">{tweet.tweetText}</p>
                              <div className="flex items-center justify-between text-xs text-soft-ink-faint tabular-nums">
                                <span>{new Date(tweet.tweetTimestamp).toLocaleDateString()}</span>
                                <div className="flex items-center space-x-4">
                                  <span className="flex items-center">
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                    {tweet.likeCount}
                                  </span>
                                  <span className="flex items-center">
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    {tweet.replyCount}
                                  </span>
                                  <span className="flex items-center">
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    {tweet.retweetCount}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="text-soft-ink-soft text-sm">
                    No Twitter data available for this wallet address
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Spotify Profile Section - jak wyzej, awaria zostaje widoczna. */}
        {(spotifyUserData || loadingSpotifyData || spotifyError) && (
          <div className="mb-6 relative overflow-hidden rounded-card bg-soft-surface border border-soft-line shadow-card">
            {/* Spotify green poświata */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-soft-primary/10 rounded-full filter blur-2xl"></div>
            <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-soft-accent-soft/50 rounded-full filter blur-xl"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-soft-line"></div>

            {/* Efekt szkła */}
            <div className="absolute inset-0 bg-transparent"></div>

            <div className="relative z-10 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-soft-sunken border border-soft-line mr-4 shadow-chip">
                    <svg className="w-6 h-6 text-soft-primary-deep" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-soft-display font-bold text-xl text-soft-ink">Spotify Profile</h3>
                    <p className="text-sm text-soft-ink-muted">Music Activity</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {spotifyUserData?.dataSource === 'spotify' && (
                    <div className="flex items-center bg-soft-sunken border border-soft-line px-3 py-1.5 rounded-pill shadow-chip">
                      <svg className="w-4 h-4 text-soft-primary-deep mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span className="text-xs text-soft-primary-deep font-semibold">Connected</span>
                    </div>
                  )}
                  
                  {/* Refresh Button */}
                  <button
                    onClick={refreshSpotifyData}
                    disabled={loadingSpotifyData}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-soft-sunken border border-soft-line hover:bg-soft-line transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-50 disabled:cursor-not-allowed group"
                    title="Refresh Spotify Data"
                    aria-label="Refresh Spotify Data"
                  >
                    <svg
                      className={`w-4 h-4 text-soft-primary-deep transition-transform [transition-duration:var(--dur-dropdown)] ease-out-strong ${loadingSpotifyData ? 'animate-spin' : 'group-hover:rotate-180'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {loadingSpotifyData ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-soft-line border-t-soft-primary"></div>
                  <span className="ml-4 text-soft-ink-muted">Loading Spotify data...</span>
                </div>
              ) : spotifyError ? (
                <div className="text-center py-6" role="status">
                  <div className="text-soft-ink-muted text-sm">{spotifyError}</div>
                  <div className="text-soft-ink-faint text-xs mt-1">
                    This is a failed lookup, not an empty profile.
                  </div>
                  <button
                    type="button"
                    onClick={refreshSpotifyData}
                    className="mt-3 text-xs font-semibold text-soft-primary-deep bg-soft-sunken border border-soft-line px-3 py-1.5 rounded-pill shadow-chip hover:bg-soft-line transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    Try again
                  </button>
                </div>
              ) : spotifyUserData ? (
                <div>
                  {/* Spotify User Info */}
                  <div className="flex items-start space-x-4 mb-6">
                    {spotifyUserData.user.images && spotifyUserData.user.images[0] && (
                      <img
                        src={spotifyUserData.user.images[0].url}
                        alt={`${spotifyUserData.user.display_name} avatar`}
                        className="w-16 h-16 rounded-full border-2 border-soft-line"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="text-lg font-soft-display font-bold text-soft-ink truncate">{spotifyUserData.user.display_name}</h4>
                        {spotifyUserData.user.external_urls?.spotify && (
                          <a
                            href={spotifyUserData.user.external_urls.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-soft-primary-deep hover:bg-soft-line text-sm font-mono bg-soft-sunken px-2 py-1 rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary flex items-center"
                            title="Open Spotify Profile"
                          >
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
                            </svg>
                            Open Profile
                          </a>
                        )}
                      </div>
                      {!spotifyUserData.hasContent && (
                        <div className="flex items-center text-soft-info text-xs mb-3 bg-soft-info-soft px-2 py-1 rounded-pill">
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          Spotify connected • Start saving tracks to see activity
                        </div>
                      )}
                      <div className="flex items-center text-soft-ink-soft text-sm mb-3">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span className="font-soft-display font-semibold tabular-nums mr-1">{(spotifyUserData.user.followers || 0).toLocaleString()}</span> followers
                      </div>
                    </div>
                  </div>

                  {/* Spotify Analytics Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center bg-soft-surface rounded-card p-3 shadow-card">
                      <div className="text-soft-ink text-xl font-soft-display font-bold tabular-nums">{spotifyUserData.analytics?.totalSavedTracks || 0}</div>
                      <div className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">Saved Tracks</div>
                    </div>
                    <div className="text-center bg-soft-surface rounded-card p-3 shadow-card">
                      <div className="text-soft-ink text-xl font-soft-display font-bold tabular-nums">{spotifyUserData.analytics?.totalSavedAlbums || 0}</div>
                      <div className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">Albums</div>
                    </div>
                    <div className="text-center bg-soft-surface rounded-card p-3 shadow-card">
                      <div className="text-soft-ink text-xl font-soft-display font-bold tabular-nums">{spotifyUserData.analytics?.totalSavedPlaylists || 0}</div>
                      <div className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">Playlists</div>
                    </div>
                    <div className="text-center bg-soft-surface rounded-card p-3 shadow-card">
                      <div className="text-soft-ink text-xl font-soft-display font-bold tabular-nums">{spotifyUserData.analytics?.listeningDiversity || 0}%</div>
                      <div className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">Diversity</div>
                    </div>
                  </div>

                  {/* Music Matching Profile */}
                  {(spotifyUserData.profile?.topGenres?.length > 0 || spotifyUserData.profile?.topArtists?.length > 0) && (
                    <div className="mt-4 p-4 bg-soft-sunken rounded-card border border-soft-line">
                      <div className="flex items-center mb-3">
                        <svg className="w-5 h-5 text-soft-primary-deep mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.58L19 8l-9 9z"/>
                        </svg>
                        <h4 className="text-soft-ink text-sm font-soft-display font-bold">Music Matching Profile</h4>
                        <span className="ml-2 text-xs text-soft-ink-faint">• User compatibility data</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Top Genres */}
                        {spotifyUserData.profile.topGenres.length > 0 && (
                          <div className="bg-soft-surface rounded-card p-3 shadow-card">
                            <div className="flex items-center mb-2">
                              <svg className="w-4 h-4 text-soft-primary-deep mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                              </svg>
                              <span className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">Top Genres</span>
                              <span className="ml-1 text-xs text-soft-ink-faint tabular-nums">({spotifyUserData.profile.topGenres.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {spotifyUserData.profile.topGenres.slice(0, 6).map((genre, index) => (
                                <span 
                                  key={index}
                                  className="px-2 py-1 bg-soft-sunken text-soft-ink-muted text-xs rounded-pill border border-soft-line"
                                >
                                  {genre}
                                </span>
                              ))}
                              {spotifyUserData.profile.topGenres.length > 6 && (
                                <span className="px-2 py-1 bg-soft-sunken text-soft-ink-faint text-xs rounded-pill border border-soft-line tabular-nums">
                                  +{spotifyUserData.profile.topGenres.length - 6} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Top Artists */}
                        {spotifyUserData.profile.topArtists.length > 0 && (
                          <div className="bg-soft-surface rounded-card p-3 shadow-card">
                            <div className="flex items-center mb-2">
                              <svg className="w-4 h-4 text-soft-primary-deep mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                              <span className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider">Top Artists</span>
                              <span className="ml-1 text-xs text-soft-ink-faint tabular-nums">({spotifyUserData.profile.topArtists.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {spotifyUserData.profile.topArtists.slice(0, 4).map((artist, index) => (
                                <span 
                                  key={index}
                                  className="px-2 py-1 bg-soft-sunken text-soft-ink-muted text-xs rounded-pill border border-soft-line"
                                >
                                  {artist}
                                </span>
                              ))}
                              {spotifyUserData.profile.topArtists.length > 4 && (
                                <span className="px-2 py-1 bg-soft-sunken text-soft-ink-faint text-xs rounded-pill border border-soft-line tabular-nums">
                                  +{spotifyUserData.profile.topArtists.length - 4} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Expandable Music Content */}
                  {(spotifyUserData.profile?.savedTracks?.length > 0 || spotifyUserData.profile?.playedTracks?.length > 0) && (
                    <>
                      <button
                        onClick={() => setIsSpotifySectionExpanded(!isSpotifySectionExpanded)}
                        className="w-full flex items-center justify-center text-soft-primary-deep hover:text-soft-ink transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary border-t border-soft-line pt-4"
                      >
                        <span className="text-sm font-medium mr-2">
                          {isSpotifySectionExpanded ? 'Hide Music Details' : `Show Recent Music (${Math.max(spotifyUserData.profile?.savedTracks?.length || 0, spotifyUserData.profile?.playedTracks?.length || 0)})`}
                        </span>
                        {isSpotifySectionExpanded ? (
                          <ChevronUpIcon className="w-4 h-4" />
                        ) : (
                          <ChevronDownIcon className="w-4 h-4" />
                        )}
                      </button>

                      {/* Recent Music */}
                      {isSpotifySectionExpanded && (
                        <div className="mt-4 space-y-4 max-h-96 overflow-y-auto">
                          {/* Recently Played Tracks */}
                          {spotifyUserData.profile?.playedTracks?.length > 0 && (
                            <div>
                              <h5 className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider mb-3">Recently Played</h5>
                              <div className="space-y-2">
                                {(spotifyUserData.profile?.playedTracks || []).slice(0, 3).map((item, index) => (
                                  <div 
                                    key={index} 
                                    className="relative overflow-hidden rounded-card p-3 hover:scale-[1.02] hover:shadow-float origin-left transition-[transform,box-shadow] [transition-duration:var(--dur-dropdown)] ease-out-strong"
                                    style={{
                                      backgroundImage: item?.track?.album?.images?.[0]?.url 
                                        ? `url(${item.track.album.images[0].url})` 
                                        : undefined,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                      backgroundRepeat: 'no-repeat'
                                    }}
                                  >
                                    {/* Blurred Background Overlay */}
                                    <div className={`absolute inset-0 rounded-lg backdrop-blur-md ${
                                      item?.track?.album?.images?.[0]?.url 
                                        ? 'bg-black/40' 
                                        : 'bg-soft-ink/90'
                                    }`}></div>
                                    
                                    {/* Content Container */}
                                    <div className="relative z-10">
                                    <div className="flex items-center space-x-3">
                                      {item?.track?.album?.images && item.track.album.images[0] && (
                                        <div className="relative group">
                                          {/* Bez adresu albumu bylo tu <a href="#">:
                                              link wygladal na dzialajacy, a
                                              klikniecie tylko przeskakiwalo na
                                              gore strony. Teraz okladka bez
                                              adresu jest zwyklym obrazkiem. */}
                                          {item?.track?.album?.external_urls?.spotify ? (
                                            <a
                                              href={item.track.album.external_urls.spotify}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="block hover:opacity-80 transition-opacity"
                                              title={`View album: ${item?.track?.album?.name}`}
                                            >
                                              <img
                                                src={item.track.album.images[0].url}
                                                alt={item.track.album.name}
                                                className="w-12 h-12 rounded cursor-pointer hover:shadow-float transition-shadow [transition-duration:var(--dur-press)] ease-out-strong"
                                              />
                                            </a>
                                          ) : (
                                            <img
                                              src={item.track.album.images[0].url}
                                              alt={item.track.album.name}
                                              className="w-12 h-12 rounded"
                                            />
                                          )}

                                          {/* Preview Overlay */}
                                          {item?.track?.preview_url && (
                                            <button
                                              onClick={() => playTrack(item.track.preview_url!)}
                                              disabled={isLoading && currentTrackUrl === item.track.preview_url}
                                              className={`absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded transition-opacity duration-200 disabled:opacity-50 ${
                                                isPlaying && currentTrackUrl === item.track.preview_url 
                                                  ? 'opacity-100' 
                                                  : 'opacity-0 group-hover:opacity-100'
                                              }`}
                                              title={isPlaying && currentTrackUrl === item.track.preview_url ? 'Pause' : 'Play 30s preview'}
                                            >
                                              {isLoading && currentTrackUrl === item.track.preview_url ? (
                                                <div className="animate-spin w-4 h-4 border border-white border-t-transparent rounded-full"></div>
                                              ) : isPlaying && currentTrackUrl === item.track.preview_url ? (
                                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                                                </svg>
                                              ) : (
                                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                  <path d="M8 5v14l11-7z"/>
                                                </svg>
                                              )}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        {item?.track?.external_urls?.spotify ? (
                                          <a
                                            href={item.track.external_urls.spotify}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-white hover:text-green-300 text-sm font-medium truncate block transition-colors"
                                            title={`Play on Spotify: ${item?.track?.name}`}
                                          >
                                            🎵 {item?.track?.name || 'Unknown Track'}
                                          </a>
                                        ) : (
                                          <p className="text-white text-sm font-medium truncate">{item?.track?.name || 'Unknown Track'}</p>
                                        )}
                                        <div className="text-gray-300 text-xs truncate">
                                          {item?.track?.artists?.map((artist, idx) => (
                                            <span key={idx}>
                                              {artist?.external_urls?.spotify ? (
                                                <a
                                                  href={artist.external_urls.spotify}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="hover:text-green-300 transition-colors"
                                                  title={`View artist: ${artist?.name}`}
                                                >
                                                  {artist?.name}
                                                </a>
                                              ) : (
                                                artist?.name
                                              )}
                                              {idx < (item?.track?.artists?.length || 0) - 1 && ', '}
                                            </span>
                                          )) || 'Unknown Artist'} • 
                                          {item?.track?.album?.external_urls?.spotify ? (
                                            <a
                                              href={item.track.album.external_urls.spotify}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="hover:text-green-300 transition-colors ml-1"
                                              title={`View album: ${item?.track?.album?.name}`}
                                            >
                                              {item?.track?.album?.name || 'Unknown Album'}
                                            </a>
                                          ) : (
                                            <span className="ml-1">{item?.track?.album?.name || 'Unknown Album'}</span>
                                          )}
                                        </div>
                                        
                                        {/* Additional Matching Data */}
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                          {/* Track Popularity */}
                                          {item?.track?.popularity !== undefined && (
                                            <div className="flex items-center gap-1 px-2 py-1 bg-yellow-400/10 rounded border border-yellow-400/20">
                                              <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                              </svg>
                                              <span className="text-yellow-400">
                                                {item.track.popularity}/100 
                                                <span className="text-soft-ink-faint ml-1">
                                                  {item.track.popularity >= 70 ? 'Mainstream' : item.track.popularity >= 40 ? 'Popular' : 'Niche'}
                                                </span>
                                              </span>
                                            </div>
                                          )}
                                          
                                          {/* Release Year/Era */}
                                          {item?.track?.album?.release_date && (
                                            <div className="flex items-center gap-1 px-2 py-1 bg-blue-400/10 rounded border border-blue-400/20">
                                              <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M9 11H7v6h2v-6zm4 0h-2v6h2v-6zm4 0h-2v6h2v-6zm2.5 0h-2v6h2v-6zm3-9H3v2h2v16h14V4h2V2z"/>
                                              </svg>
                                              <span className="text-blue-400">
                                                {new Date(item.track.album.release_date).getFullYear()}
                                                <span className="text-soft-ink-faint ml-1">
                                                  {(() => {
                                                    const year = new Date(item.track.album.release_date).getFullYear();
                                                    const currentYear = new Date().getFullYear();
                                                    if (year >= currentYear - 2) return 'Recent';
                                                    if (year >= 2010) return '2010s+';
                                                    if (year >= 2000) return '2000s';
                                                    if (year >= 1990) return '90s';
                                                    return 'Classic';
                                                  })()}
                                                </span>
                                              </span>
                                            </div>
                                          )}

                                        </div>
                                        
                                        {/* Compact Audio Player - tylko gdy track się odtwarza */}
                                        {item?.track?.preview_url && currentTrackUrl === item.track.preview_url && duration > 0 && (
                                          <div className="mt-2 flex items-center gap-2">
                                            {/* Mini Progress Bar */}
                                            <div className="flex-1 flex items-center gap-2">
                                              <span className="text-xs text-white/80 tabular-nums min-w-[30px]">{formatTime(currentTime)}</span>
                                              {/* Byl to goly klikalny <div>: bez
                                                  focusu i bez strzalek nie dalo
                                                  sie przewinac podgladu z
                                                  klawiatury. */}
                                              <div
                                                role="slider"
                                                tabIndex={0}
                                                aria-label="Seek preview"
                                                aria-valuemin={0}
                                                aria-valuemax={Math.round(duration)}
                                                aria-valuenow={Math.round(currentTime)}
                                                aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
                                                className="flex-1 h-0.5 bg-green-400/20 rounded-full cursor-pointer"
                                                onClick={(e) => {
                                                  const rect = e.currentTarget.getBoundingClientRect();
                                                  const percent = (e.clientX - rect.left) / rect.width;
                                                  seekToTime(percent * duration);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    seekToTime(Math.min(duration, currentTime + 5));
                                                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    seekToTime(Math.max(0, currentTime - 5));
                                                  } else if (e.key === 'Home') {
                                                    e.preventDefault();
                                                    seekToTime(0);
                                                  } else if (e.key === 'End') {
                                                    e.preventDefault();
                                                    seekToTime(duration);
                                                  }
                                                }}
                                              >
                                                <div 
                                                  className="h-full bg-soft-accent rounded-full transition-[width] [transition-duration:var(--dur-press)] ease-out-strong"
                                                  style={{ width: `${(currentTime / duration) * 100}%` }}
                                                ></div>
                                              </div>
                                              <span className="text-xs text-white/80 tabular-nums min-w-[30px]">{formatTime(duration)}</span>
                                            </div>
                                            
                                            {/* Mini Volume */}
                                            <div className="flex items-center gap-1">
                                              <svg className="w-3 h-3 text-white/80" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                                              </svg>
                                              <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.01"
                                                value={volume}
                                                onChange={(e) => setTrackVolume(parseFloat(e.target.value))}
                                                className="w-8 h-0.5 bg-green-400/20 rounded-full appearance-none cursor-pointer"
                                                style={{
                                                  background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${volume * 100}%, rgba(74, 222, 128, 0.2) ${volume * 100}%, rgba(74, 222, 128, 0.2) 100%)`
                                                }}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Saved Tracks */}
                          {spotifyUserData.profile?.savedTracks?.length > 0 && (
                            <div>
                              <h5 className="text-soft-ink-faint text-xs font-semibold uppercase tracking-wider mb-3">Saved Tracks</h5>
                              <div className="space-y-2">
                                {(spotifyUserData.profile?.savedTracks || []).slice(0, 3).map((item, index) => (
                                  <div 
                                    key={index} 
                                    className="relative overflow-hidden rounded-card p-3 hover:scale-[1.02] hover:shadow-float origin-left transition-[transform,box-shadow] [transition-duration:var(--dur-dropdown)] ease-out-strong"
                                    style={{
                                      backgroundImage: item?.track?.album?.images?.[0]?.url 
                                        ? `url(${item.track.album.images[0].url})` 
                                        : undefined,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                      backgroundRepeat: 'no-repeat'
                                    }}
                                  >
                                    {/* Blurred Background Overlay */}
                                    <div className={`absolute inset-0 rounded-lg backdrop-blur-md ${
                                      item?.track?.album?.images?.[0]?.url 
                                        ? 'bg-black/40' 
                                        : 'bg-soft-ink/90'
                                    }`}></div>
                                    
                                    {/* Content Container */}
                                    <div className="relative z-10">
                                    <div className="flex items-center space-x-3">
                                      {item?.track?.album?.images && item.track.album.images[0] && (
                                        <div className="relative group">
                                          {/* Bez adresu albumu bylo tu <a href="#">:
                                              link wygladal na dzialajacy, a
                                              klikniecie tylko przeskakiwalo na
                                              gore strony. Teraz okladka bez
                                              adresu jest zwyklym obrazkiem. */}
                                          {item?.track?.album?.external_urls?.spotify ? (
                                            <a
                                              href={item.track.album.external_urls.spotify}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="block hover:opacity-80 transition-opacity"
                                              title={`View album: ${item?.track?.album?.name}`}
                                            >
                                              <img
                                                src={item.track.album.images[0].url}
                                                alt={item.track.album.name}
                                                className="w-12 h-12 rounded cursor-pointer hover:shadow-float transition-shadow [transition-duration:var(--dur-press)] ease-out-strong"
                                              />
                                            </a>
                                          ) : (
                                            <img
                                              src={item.track.album.images[0].url}
                                              alt={item.track.album.name}
                                              className="w-12 h-12 rounded"
                                            />
                                          )}

                                          {/* Preview Overlay */}
                                          {item?.track?.preview_url && (
                                            <button
                                              onClick={() => playTrack(item.track.preview_url!)}
                                              disabled={isLoading && currentTrackUrl === item.track.preview_url}
                                              className={`absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded transition-opacity duration-200 disabled:opacity-50 ${
                                                isPlaying && currentTrackUrl === item.track.preview_url 
                                                  ? 'opacity-100' 
                                                  : 'opacity-0 group-hover:opacity-100'
                                              }`}
                                              title={isPlaying && currentTrackUrl === item.track.preview_url ? 'Pause' : 'Play 30s preview'}
                                            >
                                              {isLoading && currentTrackUrl === item.track.preview_url ? (
                                                <div className="animate-spin w-4 h-4 border border-white border-t-transparent rounded-full"></div>
                                              ) : isPlaying && currentTrackUrl === item.track.preview_url ? (
                                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                                                </svg>
                                              ) : (
                                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                  <path d="M8 5v14l11-7z"/>
                                                </svg>
                                              )}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        {item?.track?.external_urls?.spotify ? (
                                          <a
                                            href={item.track.external_urls.spotify}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-white hover:text-green-300 text-sm font-medium truncate block transition-colors"
                                            title={`Play on Spotify: ${item?.track?.name}`}
                                          >
                                            🎵 {item?.track?.name || 'Unknown Track'}
                                          </a>
                                        ) : (
                                          <p className="text-white text-sm font-medium truncate">{item?.track?.name || 'Unknown Track'}</p>
                                        )}
                                        <div className="text-gray-300 text-xs truncate">
                                          {item?.track?.artists?.map((artist, idx) => (
                                            <span key={idx}>
                                              {artist?.external_urls?.spotify ? (
                                                <a
                                                  href={artist.external_urls.spotify}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="hover:text-green-300 transition-colors"
                                                  title={`View artist: ${artist?.name}`}
                                                >
                                                  {artist?.name}
                                                </a>
                                              ) : (
                                                artist?.name
                                              )}
                                              {idx < (item?.track?.artists?.length || 0) - 1 && ', '}
                                            </span>
                                          )) || 'Unknown Artist'} • 
                                          {item?.track?.album?.external_urls?.spotify ? (
                                            <a
                                              href={item.track.album.external_urls.spotify}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="hover:text-green-300 transition-colors ml-1"
                                              title={`View album: ${item?.track?.album?.name}`}
                                            >
                                              {item?.track?.album?.name || 'Unknown Album'}
                                            </a>
                                          ) : (
                                            <span className="ml-1">{item?.track?.album?.name || 'Unknown Album'}</span>
                                          )}
                                        </div>
                                        
                                        {/* Additional Matching Data */}
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                          {/* Track Popularity */}
                                          {item?.track?.popularity !== undefined && (
                                            <div className="flex items-center gap-1 px-2 py-1 bg-yellow-400/10 rounded border border-yellow-400/20">
                                              <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                              </svg>
                                              <span className="text-yellow-400">
                                                {item.track.popularity}/100 
                                                <span className="text-soft-ink-faint ml-1">
                                                  {item.track.popularity >= 70 ? 'Mainstream' : item.track.popularity >= 40 ? 'Popular' : 'Niche'}
                                                </span>
                                              </span>
                                            </div>
                                          )}
                                          
                                          {/* Release Year/Era */}
                                          {item?.track?.album?.release_date && (
                                            <div className="flex items-center gap-1 px-2 py-1 bg-blue-400/10 rounded border border-blue-400/20">
                                              <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M9 11H7v6h2v-6zm4 0h-2v6h2v-6zm4 0h-2v6h2v-6zm2.5 0h-2v6h2v-6zm3-9H3v2h2v16h14V4h2V2z"/>
                                              </svg>
                                              <span className="text-blue-400">
                                                {new Date(item.track.album.release_date).getFullYear()}
                                                <span className="text-soft-ink-faint ml-1">
                                                  {(() => {
                                                    const year = new Date(item.track.album.release_date).getFullYear();
                                                    const currentYear = new Date().getFullYear();
                                                    if (year >= currentYear - 2) return 'Recent';
                                                    if (year >= 2010) return '2010s+';
                                                    if (year >= 2000) return '2000s';
                                                    if (year >= 1990) return '90s';
                                                    return 'Classic';
                                                  })()}
                                                </span>
                                              </span>
                                            </div>
                                          )}

                                        </div>
                                        
                                        {/* Compact Audio Player - tylko gdy track się odtwarza */}
                                        {item?.track?.preview_url && currentTrackUrl === item.track.preview_url && duration > 0 && (
                                          <div className="mt-2 flex items-center gap-2">
                                            {/* Mini Progress Bar */}
                                            <div className="flex-1 flex items-center gap-2">
                                              <span className="text-xs text-white/80 tabular-nums min-w-[30px]">{formatTime(currentTime)}</span>
                                              {/* Byl to goly klikalny <div>: bez
                                                  focusu i bez strzalek nie dalo
                                                  sie przewinac podgladu z
                                                  klawiatury. */}
                                              <div
                                                role="slider"
                                                tabIndex={0}
                                                aria-label="Seek preview"
                                                aria-valuemin={0}
                                                aria-valuemax={Math.round(duration)}
                                                aria-valuenow={Math.round(currentTime)}
                                                aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
                                                className="flex-1 h-0.5 bg-green-400/20 rounded-full cursor-pointer"
                                                onClick={(e) => {
                                                  const rect = e.currentTarget.getBoundingClientRect();
                                                  const percent = (e.clientX - rect.left) / rect.width;
                                                  seekToTime(percent * duration);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    seekToTime(Math.min(duration, currentTime + 5));
                                                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    seekToTime(Math.max(0, currentTime - 5));
                                                  } else if (e.key === 'Home') {
                                                    e.preventDefault();
                                                    seekToTime(0);
                                                  } else if (e.key === 'End') {
                                                    e.preventDefault();
                                                    seekToTime(duration);
                                                  }
                                                }}
                                              >
                                                <div 
                                                  className="h-full bg-soft-accent rounded-full transition-[width] [transition-duration:var(--dur-press)] ease-out-strong"
                                                  style={{ width: `${(currentTime / duration) * 100}%` }}
                                                ></div>
                                              </div>
                                              <span className="text-xs text-white/80 tabular-nums min-w-[30px]">{formatTime(duration)}</span>
                                            </div>
                                            
                                            {/* Mini Volume */}
                                            <div className="flex items-center gap-1">
                                              <svg className="w-3 h-3 text-white/80" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                                              </svg>
                                              <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.01"
                                                value={volume}
                                                onChange={(e) => setTrackVolume(parseFloat(e.target.value))}
                                                className="w-8 h-0.5 bg-green-400/20 rounded-full appearance-none cursor-pointer"
                                                style={{
                                                  background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${volume * 100}%, rgba(74, 222, 128, 0.2) ${volume * 100}%, rgba(74, 222, 128, 0.2) 100%)`
                                                }}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="text-soft-ink-soft text-sm">
                    No Spotify data available for this wallet address
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Bio Section */}
        <div className="mb-6 relative overflow-hidden rounded-card bg-soft-surface border border-soft-line shadow-card">
          {/* Niebieska poświata */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-soft-primary/10 rounded-full filter blur-2xl"></div>
          <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-soft-accent-soft/50 rounded-full filter blur-xl"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-soft-line"></div>

          {/* Efekt szkła */}
          <div className="absolute inset-0 bg-transparent"></div>

          <div className="relative z-10 p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-soft-sunken border border-soft-line mr-3 shadow-chip">
                  <svg className="w-5 h-5 text-soft-primary-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="font-soft-display font-bold text-xl text-soft-ink">About</h3>
              </div>
              {currentUserAddress === userAddress && !isEditingBio && (
                <button
                  onClick={() => setIsEditingBio(true)}
                  className="text-xs font-semibold text-soft-primary-deep hover:bg-soft-line flex items-center bg-soft-sunken border border-soft-line px-3 py-1.5 rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Edit</span>
                </button>
              )}
            </div>
            <div className="bg-soft-sunken rounded-card p-5 border border-soft-line">
              {isEditingBio ? (
                <div>
                  <textarea
                    value={newBio}
                    onChange={(e) => setNewBio(e.target.value)}
                    maxLength={90}
                    placeholder="Write something about yourself..."
                    className="w-full bg-soft-surface border border-soft-line rounded-card p-3 text-soft-ink placeholder:text-soft-ink-faint transition-colors [transition-duration:var(--dur-press)] ease-out-strong focus:outline-none focus:ring-2 focus:ring-soft-primary focus:border-soft-primary"
                    rows={3}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <div className="text-xs text-soft-ink-faint tabular-nums">
                      {newBio.length}/90 characters
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setIsEditingBio(false);
                          // displayedBio, nie profile.bio - po wczesniejszym
                          // zapisie props jest juz nieaktualny.
                          setNewBio(displayedBio || '');
                        }}
                        className="px-3 py-1.5 bg-soft-surface text-soft-ink-muted border border-soft-line rounded-pill text-xs font-semibold hover:bg-soft-line transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                        disabled={isSaving}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveBio}
                        disabled={isSaving}
                        className="px-3 py-1.5 bg-soft-primary text-white rounded-pill text-xs font-semibold shadow-chip hover:bg-soft-primary-deep transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-soft-ink-muted leading-relaxed">
                  {displayedBio ||
                    <span className="text-soft-ink-faint italic">
                      {currentUserAddress === userAddress ? 
                        "Click Edit to add your bio" : 
                        "This builder hasn't added a bio yet"}
                    </span>
                  }
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Vitalik Buterin Info - Tylko dla profilu Vitalika */}
        {isVitalik && (
          <div className="mb-6 bg-soft-surface rounded-card shadow-card p-6 border border-soft-line relative overflow-hidden">
            {/* Efekt świecenia */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-soft-accent-soft rounded-full filter blur-3xl opacity-40"></div>
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-soft-primary/10 rounded-full filter blur-3xl opacity-30"></div>

            <div className="text-soft-ink-muted relative z-10">
              <h3 className="font-soft-display font-bold text-xl mb-3 text-soft-ink">About Vitalik Buterin</h3>
              <div className="space-y-2 text-sm">
                <p className="leading-relaxed">
                  Vitalik Buterin is the co-founder of Ethereum, a decentralized, open-source blockchain platform that enables smart contracts and decentralized applications (dApps). He proposed Ethereum in a white paper in late 2013 when he was just 19 years old.
                </p>
                <p className="leading-relaxed">
                  Ethereum launched in 2015 and quickly became the second-largest blockchain platform after Bitcoin. It introduced programmability through smart contracts, revolutionizing blockchain technology by enabling DeFi, NFTs, and DAOs.
                </p>
                <p className="leading-relaxed">
                  Vitalik is known for his vision of a decentralized future and continues to lead Ethereum's development, including its major upgrade to Ethereum 2.0, which transitioned the network from Proof-of-Work (PoW) to Proof-of-Stake (PoS) for improved scalability and energy efficiency.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* BaseChatPoints - Zunifikowana sekcja z kafelkami */}
        <div className="mb-6 bg-soft-sunken rounded-card p-6 relative overflow-hidden shadow-card">
          <div className="absolute top-0 left-0 w-full h-1 bg-soft-primary"></div>

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-soft-display font-bold text-soft-ink flex items-center">
              Sphere Points
              <div className="ml-2 text-3xl">⚡</div>
            </h2>

            {/* Total Score - zawsze widoczny */}
            <div className="flex items-center bg-soft-primary p-0.5 rounded-card">
              <div className="bg-soft-surface px-4 py-2 rounded-card flex items-center">
                <span className="text-soft-ink-faint text-xs uppercase tracking-wider font-semibold mr-2">Total Score:</span>
                <div className="text-2xl font-soft-display font-bold tabular-nums text-soft-primary-deep">
                  {profile.baseChatPoints?.totalPoints || Math.round(((profile.postCount || 0) * 5 + (profile.likesReceived || 0)) * 1.25)}
                </div>
                <div className="ml-2 text-lg">✨</div>
              </div>
            </div>
          </div>

          {/* Lista punktów */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center justify-between group bg-soft-surface shadow-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken p-3 rounded-card">
              <span className="text-soft-ink-muted flex items-center">
                <svg className="w-5 h-5 mr-2 text-soft-primary-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                Posts ({profile.postCount || 0})
              </span>
              <span className="text-soft-primary-deep font-soft-display font-bold tabular-nums">
                {profile.baseChatPoints?.postPoints || (profile.postCount || 0) * 5} points
              </span>
            </div>
            
            <div className="flex items-center justify-between group bg-soft-surface shadow-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken p-3 rounded-card">
              <span className="text-soft-ink-muted flex items-center">
                <svg className="w-5 h-5 mr-2 text-soft-accent-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                Likes Received ({profile.likesReceived || 0})
              </span>
              <span className="text-soft-primary-deep font-soft-display font-bold tabular-nums">
                {profile.baseChatPoints?.likePoints || profile.likesReceived || 0} points
              </span>
            </div>
          </div>

          {/* Szczegóły punktów - zawsze widoczne */}
          <div className="mt-4 space-y-3 border-t border-soft-line pt-4">
              <div className="flex items-center justify-between group bg-soft-surface shadow-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken p-3 rounded-card">
                <span className="text-soft-ink-muted flex items-center">
                  <svg className="w-4 h-4 mr-2 text-soft-primary-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Activity Bonus
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-soft-ink-faint tabular-nums">+25%</span>
                  <span className="text-soft-primary-deep font-soft-display font-bold tabular-nums">
                    {profile.baseChatPoints?.activityBonus || Math.round(((profile.postCount || 0) * 5 + (profile.likesReceived || 0)) * 0.25)}
                  </span>
                </div>
              </div>

              {/* Domain Bonuses */}
              {(profile.baseChatPoints?.baseNameBonus || 0) > 0 && (
                <div className="flex items-center justify-between group bg-soft-surface shadow-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken p-3 rounded-card">
                  <span className="text-soft-ink-muted flex items-center">
                    <span className="mr-2">🌐</span>
                    Base Name Bonus
                  </span>
                  <span className="text-soft-primary-deep font-soft-display font-bold tabular-nums">
                    +{profile.baseChatPoints?.baseNameBonus || 0}
                  </span>
                  </div>
              )}

              {(profile.baseChatPoints?.sphereBonus || 0) > 0 && (
                <div className="flex items-center justify-between group bg-soft-surface shadow-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken p-3 rounded-card">
                  <span className="text-soft-ink-muted flex items-center">
                    <span className="mr-2">🌐</span>
                    .sphere Bonus
                  </span>
                  <span className="text-soft-primary-deep font-soft-display font-bold tabular-nums">
                    +{profile.baseChatPoints?.sphereBonus || 0}
                  </span>
                  </div>
              )}

              {(profile.baseChatPoints?.camperBonus || 0) > 0 && (
                <div className="flex items-center justify-between group bg-soft-surface shadow-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken p-3 rounded-card">
                  <span className="text-soft-ink-muted flex items-center">
                    <span className="mr-2">🏕️</span>
                    .camper Bonus
                  </span>
                  <span className="text-soft-accent-deep font-soft-display font-bold tabular-nums">
                    +{profile.baseChatPoints?.camperBonus || 0}
                  </span>
                </div>
              )}

              {(profile.baseChatPoints?.celoBonus || 0) > 0 && (
                <div className="flex items-center justify-between group bg-soft-surface shadow-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken p-3 rounded-card">
                  <span className="text-soft-ink-muted flex items-center">
                    <span className="mr-2">💛</span>
                    .celo Bonus
                  </span>
                  <span className="text-soft-accent-deep font-soft-display font-bold tabular-nums">
                    +{profile.baseChatPoints?.celoBonus || 0}
                  </span>
              </div>
              )}

              {(profile.baseChatPoints?.worldBonus || 0) > 0 && (
                <div className="flex items-center justify-between group bg-soft-surface shadow-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken p-3 rounded-card">
                  <span className="text-soft-ink-muted flex items-center">
                    <span className="mr-2">🌍</span>
                    .world Bonus
                  </span>
                  <span className="text-soft-primary-deep font-soft-display font-bold tabular-nums">
                    +{profile.baseChatPoints?.worldBonus || 0}
                  </span>
            </div>
          )}

              {/* Referral Points */}
              {(profile.baseChatPoints?.referralPoints || 0) > 0 && (
                <div className="flex items-center justify-between group bg-soft-surface shadow-card transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken p-3 rounded-card">
                  <span className="text-soft-ink-muted flex items-center">
                    <span className="mr-2">👥</span>
                    Referral Points
                  </span>
                  <span className="text-soft-primary-deep font-soft-display font-bold tabular-nums">
                    +{profile.baseChatPoints?.referralPoints || 0}
                  </span>
                </div>
              )}
          </div>
        </div>

        

        

        

      </div>
    </div>
  );
} 