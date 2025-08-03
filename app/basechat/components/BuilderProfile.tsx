import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import ProfileSocials from './ProfileSocials';
import { toast } from 'react-hot-toast';
// ✅ USUNIĘTO: UserRank i RANK_DESCRIPTIONS - nie używane już
import { Avatar } from '@coinbase/onchainkit/identity';
import TipButton from './TipButton';
import RecentTips from './RecentTips';
import { getUserTipStats, TipStats as TipStatsType } from '../../utils/firebase';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import { useSocial } from '../friendsystem/hooks';
import { sendFriendRequest as sendFriendRequestDirect } from '../friendsystem/friends_system';

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
  
  // BaseChatPoints section state
  const [isBaseChatPointsExpanded, setIsBaseChatPointsExpanded] = useState(false);
  
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

  // 🚀 SOCIAL FEATURES: Hook i stany  
  // Get stats for the profile we're viewing (userAddress)
  const { 
    followStats, 
    friendsStats
  } = useSocial(userAddress || null);
  
  // Get actions for the current logged-in user
  const {
    followUser, 
    unfollowUser, 
    checkIfFollowing
  } = useSocial(currentUserAddress || null);
  
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [checkingFollowStatus, setCheckingFollowStatus] = useState(true);
  
  // Zresetuj stan edycji bio kiedy zmienia się profil
  useEffect(() => {
    setNewBio(profile.bio || '');
    setIsEditingBio(false);
  }, [profile]);

  // 🚀 SOCIAL FEATURES: Sprawdź follow status
  useEffect(() => {
    if (!currentUserAddress || currentUserAddress === userAddress) {
      setCheckingFollowStatus(false);
      return;
    }

    const checkFollowStatusAsync = async () => {
      setCheckingFollowStatus(true);
      try {
        const isCurrentlyFollowing = await checkIfFollowing(userAddress);
        setIsFollowing(isCurrentlyFollowing);
      } catch (error) {
        console.error('Error checking follow status:', error);
        setIsFollowing(false);
      } finally {
        setCheckingFollowStatus(false);
      }
    };

    checkFollowStatusAsync();
  }, [currentUserAddress, userAddress, checkIfFollowing]);

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
    }
  };

  // Fetch Twitter data from Camp Network
  const fetchTwitterData = async (address: string) => {
    if (!address) return null;
    
    try {
      // Try direct Camp Network API first for more complete data
      const response = await fetch(`/api/camp/twitter?address=${encodeURIComponent(address)}&direct=true`);
      
      if (!response.ok) {
        console.warn(`Twitter API returned ${response.status} for address ${address}`);
        return null;
      }
      
      const data = await response.json();
      
      if (data.error) {
        console.warn('Twitter API error:', data.error);
        return null;
      }
      
      return data.data;
    } catch (error) {
      console.error('Error fetching Twitter data:', error);
      return null;
    }
  };

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
    const fetchTwitterDataEffect = async () => {
      if (!userAddress) return;
      
      setLoadingTwitterData(true);
      try {
        const twitterData = await fetchTwitterData(userAddress);
        
        if (twitterData && twitterData.twitterUser) {
          setTwitterUser(twitterData.twitterUser);
          setTwitterTweets(twitterData.tweets || []);
        } else {
          setTwitterUser(null);
          setTwitterTweets([]);
        }
      } catch (error) {
        console.error('Error fetching Twitter data:', error);
        setTwitterUser(null);
        setTwitterTweets([]);
      } finally {
        setLoadingTwitterData(false);
      }
    };

    fetchTwitterDataEffect();
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

  return (
    <div className="font-['Coinbase_Display']">
      {/* Builder Panel Header with Back Button - nowoczesny gradient */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 p-5 relative overflow-hidden">
        {/* Dodajemy efekt połysku */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-30"></div>
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-400 rounded-full filter blur-3xl opacity-20"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-400 rounded-full filter blur-3xl opacity-10"></div>
        
        <div className="flex items-center justify-between relative z-10">
          <button 
            onClick={onBackToFeed}
            className="flex items-center text-white bg-white/10 backdrop-blur-md rounded-lg px-4 py-2 transition-all duration-300 hover:bg-white/20 hover:scale-105 border border-white/10"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Feed
          </button>
          <div className="text-xl font-light text-white font-['Coinbase_Display']">Builder Profile</div>
          <div className="w-24"></div> {/* Placeholder dla wyrównania */}
        </div>
      </div>
      
      {/* User Info Section */}
      <div className="p-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-12 mb-6 p-8 lg:p-12 relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-slate-50/80 to-blue-50/60 border border-white/60 backdrop-blur-2xl shadow-2xl">
          {/* Premium białe i niebieskie efekty świetlne */}
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-gradient-to-br from-blue-200/30 to-indigo-300/20 rounded-full filter blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-gradient-to-tr from-white/40 to-blue-100/30 rounded-full filter blur-2xl"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent"></div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"></div>
          
          {/* Efekt premium szkła z białymi refleksami */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/20 to-blue-50/30 backdrop-blur-xl"></div>
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent"></div>
          
          {/* MySphere Logo with Verified Badge - Top Right */}
          <div className="absolute top-6 right-6 flex items-center space-x-2 bg-gradient-to-r from-white/80 to-blue-50/60 backdrop-blur-sm border border-blue-200/50 rounded-full px-3 py-2 shadow-lg">
            <img 
              src="/favicon_io (1)/android-chrome-192x1921.png" 
              alt="MySphere" 
              className="w-5 h-5 object-contain"
            />
            <div className="flex items-center space-x-1">
              <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span className="text-xs font-medium text-blue-700">Verified</span>
            </div>
          </div>
          
          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-12 w-full">
          <div className="flex flex-col items-center lg:items-start">
            <div className="w-28 h-28 lg:w-32 lg:h-32 rounded-full overflow-hidden flex-shrink-0 relative group">
              {/* Premium ramka z białym gradientem */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-200 p-1 shadow-2xl">
                <div className="w-full h-full rounded-full overflow-hidden bg-white">
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
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 via-transparent to-blue-300/20 opacity-70"></div>
              <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-blue-200/20 to-transparent filter blur-lg opacity-60 group-hover:opacity-80 transition-opacity duration-300"></div>
            </div>
            
            {/* Skrócony adres portfela pod avatarem */}
            <div className="mt-4 lg:mt-6 w-full lg:w-auto flex flex-col items-center lg:items-start space-y-3">
              <button
                onClick={copyAddressToClipboard}
                className="flex items-center text-xs text-slate-600 hover:text-blue-600 bg-gradient-to-r from-white to-blue-50 hover:from-blue-50 hover:to-blue-100 px-3 py-1.5 rounded-lg border border-blue-200/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 w-fit"
              >
                <span className="mr-2 font-mono text-slate-700">{profile.address.slice(0,6)}...{profile.address.slice(-4)}</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              
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
                <div className={`text-2xl lg:text-3xl font-semibold mb-2 lg:mb-3 ${
                  isVitalik 
                    ? "bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-transparent bg-clip-text"
                    : "bg-gradient-to-r from-blue-500 to-purple-600 text-transparent bg-clip-text"
                }`}>
                  {profile.name.endsWith('.base.eth') ? (
                    <div className="flex items-center">
                      <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-transparent bg-clip-text font-medium">{profile.name}</span>
                      <div className="inline-flex items-center ml-3 px-3 py-1.5 rounded-full bg-gradient-to-r from-white/80 to-blue-50/60 backdrop-blur-sm border border-blue-200/50 shadow-lg">
                        <div className="w-2.5 h-2.5 bg-blue-600 rounded-full mr-2"></div>
                        <span className="text-blue-700 text-sm font-medium">basename</span>
                      </div>
                    </div>
                  ) : profile.name.endsWith('.sphere') ? (
                    <>
                      <span className="text-gray-900 dark:text-white">{profile.name.replace('.sphere', '')}</span>
                      <span className="text-blue-500">.sphere</span>
                    </>
                                     ) : profile.name.endsWith('.camper') ? (
                     <>
                       <span className="text-gray-900 dark:text-white">{profile.name.replace('.camper', '')}</span>
                       <span className="text-orange-500">.camper🏕️</span>
                     </>
                   ) : (
                    <>
                      {profile.name}
                      {isVitalik && (
                        <span className="inline-flex items-center ml-2">
                          <img 
                            src="/ethlogo.png" 
                            alt="ETH" 
                            className="w-5 h-5 object-contain"
                          />
                        </span>
                      )}
                    </>
                  )}
                </div>
                
                {/* Badge dla Vitalika */}
                {isVitalik && (
                  <div className="mt-1">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-yellow-500 text-white text-xs font-medium">
                      Ethereum Founder
                    </span>
                  </div>
                )}
                {/* Separator gradientowy */}
                <div className="w-full h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent my-4"></div>
                
                <div className="flex flex-col space-y-4 lg:space-y-5 mt-2 lg:mt-4">
                  {/* Creator Earnings - Rozciągnięty na całą szerokość */}
                  {(tipStats && tipStats.tipCount > 0) ? (
                    <div className="bg-gradient-to-r from-yellow-50 via-amber-50/50 to-yellow-100 border border-yellow-300/60 rounded-xl px-6 py-4 shadow-md backdrop-blur-sm hover:scale-[1.02] hover:shadow-lg transition-all duration-300 relative w-full">
                      {/* Golden glow effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-yellow-100/30 to-amber-200/30 rounded-xl opacity-50"></div>
                      
                      <div className="relative flex items-center justify-between">
                        {/* Left side - Title and icon */}
                        <div className="flex items-center space-x-2">
                          <img 
                            src="/favicon_io (1)/android-chrome-192x1921.png" 
                            alt="MySphere" 
                            className="w-4 h-4 object-contain"
                          />
                          <span className="text-sm font-bold text-amber-700">Creator Earnings</span>
                        </div>
                        
                        {/* Right side - ETH, USDC and CAMP values with proper icons */}
                        <div className="flex items-center space-x-4">
                          {tipStats.ethReceived > 0 && (
                            <div className="flex items-center space-x-2.5">
                              <div className="flex items-center -space-x-0.5">
                                <img src="/brand-kit/base/logo/in-product/Base_Network_Logo.svg" alt="Base" className="w-4 h-4 z-10" />
                                <img src="/icons/eth.svg" alt="ETH" className="w-4 h-4" />
                              </div>
                              <span className="text-sm font-semibold text-amber-700">
                                {tipStats.ethReceived.toFixed(4)}
                              </span>
                            </div>
                          )}
                          {tipStats.usdcReceived > 0 && (
                            <div className="flex items-center space-x-1.5">
                              <img src="/icons/usdc.svg" alt="USDC" className="w-4 h-4" />
                              <span className="text-sm font-semibold text-amber-700">
                                {tipStats.usdcReceived.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {/* CAMP token support - ODBLOKOWANY */}
                          <div className="flex items-center space-x-1.5">
                            <img src="/Camp.png" alt="CAMP" className="w-4 h-4" />
                            <span className="text-sm font-semibold text-amber-700">
                              0.00
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : loadingTipStats ? (
                    <div className="bg-gradient-to-r from-yellow-50 via-amber-50/50 to-yellow-100 border border-yellow-300/60 rounded-xl px-6 py-4 shadow-md backdrop-blur-sm w-full">
                      <div className="flex items-center justify-center space-x-2">
                        <div className="animate-pulse bg-amber-200 rounded px-3 py-2 text-sm">
                          Loading earnings...
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Separator gradientowy przed social stats */}
                  {(followStats || friendsStats) && (
                    <>
                      <div className="w-full h-px bg-gradient-to-r from-transparent via-purple-300/60 to-transparent my-3"></div>
                      <div className="flex items-center flex-wrap gap-3 lg:gap-4 text-xs">
                        {followStats && (
                        <>
                          <div className="flex items-center space-x-1 bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-300/60 px-3 py-1.5 rounded-full shadow-md backdrop-blur-sm">
                            <svg className="w-3 h-3 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="text-purple-800 font-semibold">{followStats.followers}</span>
                            <span className="text-purple-700 text-xs font-medium">followers</span>
                          </div>
                          <div className="flex items-center space-x-1 bg-gradient-to-r from-blue-50 to-cyan-100 border border-cyan-300/60 px-3 py-1.5 rounded-full shadow-md backdrop-blur-sm">
                            <svg className="w-3 h-3 text-cyan-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="text-cyan-800 font-semibold">{followStats.following}</span>
                            <span className="text-cyan-700 text-xs font-medium">following</span>
                          </div>
                        </>
                        )}
                        {friendsStats && (
                          <div className="flex items-center space-x-1 bg-gradient-to-r from-green-50 to-emerald-100 border border-green-300/60 px-3 py-1.5 rounded-full shadow-md backdrop-blur-sm">
                            <svg className="w-3 h-3 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                            </svg>
                            <span className="text-green-800 font-semibold">{friendsStats.totalFriends}</span>
                            <span className="text-green-700 text-xs font-medium">friends</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Separator gradientowy przed action buttons */}
                  {currentUserAddress !== userAddress && (
                    <>
                      <div className="w-full h-px bg-gradient-to-r from-transparent via-indigo-300/60 to-transparent my-3"></div>
                      <div className="flex items-center flex-wrap gap-3 lg:gap-4">
                      {/* Follow Button (Przycisk obserwowania) */}
                      {!checkingFollowStatus && (
                        <button
                          onClick={isFollowing ? handleUnfollowUser : handleFollowUser}
                          disabled={followLoading}
                          className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 shadow-sm backdrop-blur-sm border hover:scale-105 ${
                            isFollowing
                              ? 'bg-gradient-to-r from-white to-indigo-50 border-indigo-200/50 text-indigo-700 hover:from-indigo-50 hover:to-indigo-100'
                              : 'bg-gradient-to-r from-indigo-500 to-blue-600 border-indigo-400/50 text-white hover:from-indigo-600 hover:to-blue-700 shadow-lg'
                          } ${followLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {followLoading ? (
                            <>
                              <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
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
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-emerald-500 to-green-600 border border-emerald-400/50 text-white hover:from-emerald-600 hover:to-green-700 transition-all duration-300 shadow-sm backdrop-blur-sm hover:scale-105 shadow-lg"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                        </svg>
                        <span>Add Friend</span>
                      </button>

                      {/* Tip Button */}
                      <div className="bg-gradient-to-r from-white to-yellow-50 border border-yellow-200/50 rounded-lg shadow-sm backdrop-blur-sm hover:scale-105 transition-all duration-300">
                        <TipButton
                          recipientAddress={userAddress}
                          postId={`profile-${userAddress}`}
                          className="text-yellow-600 hover:text-yellow-700 p-2 transition-colors"
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
          
        {/* Talent Protocol Builder Score */}
        {(talentScore || talentProfile || loadingTalentData) && (
          <div className="mb-6 relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-black to-gray-800 border border-gray-700/50 backdrop-blur-xl shadow-2xl">
            {/* Neonowa poświata */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-green-400/30 rounded-full filter blur-2xl animate-pulse"></div>
            <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-emerald-400/20 rounded-full filter blur-xl"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-400/50 to-transparent"></div>
            
            {/* Efekt szkła */}
            <div className="absolute inset-0 bg-white/5 backdrop-blur-sm"></div>
            
            <div className="relative z-10 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-green-400/20 to-emerald-500/20 backdrop-blur-sm border border-green-400/30 mr-4 shadow-lg">
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-light text-xl text-white">Talent Protocol</h3>
                    <p className="text-sm text-green-400/80">Builder Reputation</p>
                  </div>
                </div>
                
                {talentProfile?.human_checkmark && (
                  <div className="flex items-center bg-green-400/10 backdrop-blur-sm border border-green-400/30 px-3 py-1.5 rounded-full">
                    <svg className="w-4 h-4 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-green-400 font-medium">Human Verified</span>
                  </div>
                )}
              </div>
              
              {loadingTalentData ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-green-400/30 border-t-green-400"></div>
                  <span className="ml-4 text-green-400/80">Loading Builder Score...</span>
                </div>
              ) : (talentScore && (talentScore.score !== undefined || talentScore.percentile !== undefined)) ? (
                <div className="text-center">
                  {/* Builder Score z neonową poświatą */}
                  <div className="relative inline-block mb-2">
                    <div className="text-6xl font-light text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.5)] relative z-10">
                      {(talentScore.score !== undefined && talentScore.score !== null) ? talentScore.score.toFixed(0) : 'N/A'}
                    </div>
                    {/* Dodatkowa neonowa poświata */}
                    <div className="absolute inset-0 text-6xl font-light text-green-400 blur-md opacity-40">
                      {(talentScore.score !== undefined && talentScore.score !== null) ? talentScore.score.toFixed(0) : 'N/A'}
                    </div>
                  </div>
                  
                  <div className="text-lg text-gray-300 font-light mb-4">Builder Score</div>
                  
                  {/* Percentile - jeśli dostępny */}
                  {(talentScore.percentile !== undefined && talentScore.percentile !== null) && (
                    <div className="flex items-center justify-center">
                      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2">
                        <span className="text-green-400 text-sm font-medium">
                          Top {100 - talentScore.percentile}% Builder
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : talentProfile ? (
                <div className="text-center py-6">
                  <div className="text-gray-400 text-sm">
                    Profile found but Builder Score not available
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="text-gray-400 text-sm">
                    No Talent Protocol data available
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Twitter Profile Section */}
        {(twitterUser || loadingTwitterData) && (
          <div className="mb-6 relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-900 via-blue-800 to-blue-900 border border-sky-700/50 backdrop-blur-xl shadow-2xl">
            {/* Twitter blue poświata */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-sky-400/30 rounded-full filter blur-2xl animate-pulse"></div>
            <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-blue-400/20 rounded-full filter blur-xl"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent"></div>
            
            {/* Efekt szkła */}
            <div className="absolute inset-0 bg-white/5 backdrop-blur-sm"></div>
            
            <div className="relative z-10 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-sky-400/20 to-blue-500/20 backdrop-blur-sm border border-sky-400/30 mr-4 shadow-lg">
                    <svg className="w-6 h-6 text-sky-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-light text-xl text-white">Twitter Profile</h3>
                    <p className="text-sm text-sky-400/80">Social Activity</p>
                  </div>
                </div>
                
                {twitterUser?.isVerified && (
                  <div className="flex items-center bg-sky-400/10 backdrop-blur-sm border border-sky-400/30 px-3 py-1.5 rounded-full">
                    <svg className="w-4 h-4 text-sky-400 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <span className="text-xs text-sky-400 font-medium">Verified</span>
                  </div>
                )}
              </div>
              
              {loadingTwitterData ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-sky-400/30 border-t-sky-400"></div>
                  <span className="ml-4 text-sky-400/80">Loading Twitter data...</span>
                </div>
              ) : twitterUser ? (
                <div>
                  {/* Twitter User Info */}
                  <div className="flex items-start space-x-4 mb-6">
                    <img
                      src={twitterUser.profilePictureUrl}
                      alt={`${twitterUser.displayName} avatar`}
                      className="w-16 h-16 rounded-full border-2 border-sky-400/30"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="text-lg font-medium text-white truncate">{twitterUser.displayName}</h4>
                        <a
                          href={`https://x.com/${twitterUser.userHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 hover:text-sky-300 text-sm font-mono bg-sky-400/10 px-2 py-1 rounded transition-colors"
                        >
                          @{twitterUser.userHandle}
                        </a>
                      </div>
                      {twitterUser.profileBio && (
                        <p className="text-gray-300 text-sm leading-relaxed mb-3">{twitterUser.profileBio}</p>
                      )}
                      {twitterUser.location && (
                        <div className="flex items-center text-gray-400 text-sm mb-3">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <div className="text-center bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <div className="text-sky-400 text-2xl font-light">{twitterUser.followerCount.toLocaleString()}</div>
                      <div className="text-gray-300 text-sm">Followers</div>
                    </div>
                    <div className="text-center bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <div className="text-sky-400 text-2xl font-light">{twitterUser.followingCount.toLocaleString()}</div>
                      <div className="text-gray-300 text-sm">Following</div>
                    </div>
                    <div className="text-center bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                      <div className="text-sky-400 text-2xl font-light">{twitterUser.likeCount.toLocaleString()}</div>
                      <div className="text-gray-300 text-sm">Likes</div>
                    </div>
                  </div>

                  {/* Expandable Recent Tweets */}
                  {twitterTweets.length > 0 && (
                    <>
                      <button
                        onClick={() => setIsTwitterSectionExpanded(!isTwitterSectionExpanded)}
                        className="w-full flex items-center justify-center text-sky-400 hover:text-sky-300 transition-colors duration-300 border-t border-sky-700/30 pt-4"
                      >
                        <span className="text-sm font-medium mr-2">
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
                            <div key={tweet.id} className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                              <p className="text-gray-200 text-sm leading-relaxed mb-3">{tweet.tweetText}</p>
                              <div className="flex items-center justify-between text-xs text-gray-400">
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
                  <div className="text-gray-400 text-sm">
                    No Twitter data available for this wallet address
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Bio Section */}
        <div className="mb-6 relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-blue-50 to-blue-100 border border-blue-200/50 backdrop-blur-xl shadow-xl">
          {/* Niebieska poświata */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-300/20 rounded-full filter blur-2xl"></div>
          <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-blue-400/15 rounded-full filter blur-xl"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent"></div>
          
          {/* Efekt szkła */}
          <div className="absolute inset-0 bg-white/30 backdrop-blur-sm"></div>
          
          <div className="relative z-10 p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-400/20 to-blue-500/20 backdrop-blur-sm border border-blue-400/30 mr-3 shadow-lg">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="font-light text-xl text-blue-900">About</h3>
              </div>
              {currentUserAddress === userAddress && !isEditingBio && (
                <button
                  onClick={() => setIsEditingBio(true)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center bg-blue-100/50 backdrop-blur-sm border border-blue-300/30 px-3 py-1.5 rounded-full transition-all duration-300 hover:scale-105"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Edit</span>
                </button>
              )}
            </div>
            <div className="bg-white/60 backdrop-blur-sm rounded-xl p-5 border border-blue-200/30">
              {isEditingBio ? (
                <div>
                  <textarea
                    value={newBio}
                    onChange={(e) => setNewBio(e.target.value)}
                    maxLength={90}
                    placeholder="Write something about yourself..."
                    className="w-full bg-white border border-blue-200 rounded-lg p-3 text-blue-900 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                    rows={3}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <div className="text-xs text-blue-600">
                      {newBio.length}/90 characters
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setIsEditingBio(false);
                          setNewBio(profile.bio || '');
                        }}
                        className="px-3 py-1.5 bg-white/80 text-blue-700 border border-blue-200 rounded-lg text-xs hover:bg-blue-50 transition-colors"
                        disabled={isSaving}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveBio}
                        disabled={isSaving}
                        className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-blue-800 leading-relaxed font-light">
                  {profile.bio || 
                    <span className="text-blue-400 italic">
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
          <div className="mb-6 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-2xl shadow-sm p-6 border border-yellow-200 relative overflow-hidden">
            {/* Efekt świecenia */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-yellow-200 rounded-full filter blur-3xl opacity-30"></div>
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-yellow-400 rounded-full filter blur-3xl opacity-20"></div>
            
            <div className="text-black relative z-10">
              <h3 className="font-medium text-xl mb-3">About Vitalik Buterin</h3>
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
        <div className="mb-6 bg-gray-50 dark:bg-gray-700 rounded-2xl p-6 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
          
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-light text-gray-900 dark:text-gray-100 flex items-center">
              BaseChat Points
              <div className="ml-2 text-3xl animate-bounce">⚡</div>
            </h2>
            
            {/* Total Score - zawsze widoczny */}
            <div className="flex items-center bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-0.5 rounded-xl">
              <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-xl flex items-center">
                <span className="text-gray-600 dark:text-gray-400 text-sm mr-2">Total Score:</span>
                <div className="text-2xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text animate-pulse">
                  {Math.round(((profile.postCount || 0) * 5 + (profile.likesReceived || 0)) * 1.25)}
                </div>
                <div className="ml-2 text-lg">✨</div>
              </div>
            </div>
          </div>

          {/* Kafelki z punktami */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-blue-50 to-blue-100 border border-blue-200/50 backdrop-blur-xl shadow-xl p-6 text-center transition-transform duration-300 hover:scale-[1.02]">
              <div className="absolute -top-4 -right-4 w-16 h-16 bg-blue-300/20 rounded-full filter blur-xl"></div>
              <div className="absolute inset-0 bg-white/20 backdrop-blur-sm"></div>
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-blue-400/20 to-blue-500/20 backdrop-blur-sm border border-blue-400/30 mb-3 shadow-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="text-blue-600 text-3xl font-light drop-shadow-sm">{profile.postCount || 0}</div>
                <div className="text-sm text-blue-500 font-light mt-1">Posts</div>
                <div className="text-xs text-blue-400 font-medium mt-2 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-full">
                  {(profile.postCount || 0) * 5} points
                </div>
              </div>
            </div>
            
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-pink-50 to-pink-100 border border-pink-200/50 backdrop-blur-xl shadow-xl p-6 text-center transition-transform duration-300 hover:scale-[1.02]">
              <div className="absolute -top-4 -right-4 w-16 h-16 bg-pink-300/20 rounded-full filter blur-xl"></div>
              <div className="absolute inset-0 bg-white/20 backdrop-blur-sm"></div>
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-pink-400/20 to-pink-500/20 backdrop-blur-sm border border-pink-400/30 mb-3 shadow-lg">
                  <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div className="text-pink-600 text-3xl font-light drop-shadow-sm">{profile.likesReceived || 0}</div>
                <div className="text-sm text-pink-500 font-light mt-1">Likes Received</div>
                <div className="text-xs text-pink-400 font-medium mt-2 bg-pink-50 dark:bg-pink-900/20 px-2 py-1 rounded-full">
                  {profile.likesReceived || 0} points
                </div>
              </div>
            </div>
          </div>

          {/* Rozwijane szczegóły */}
          <button
            onClick={() => setIsBaseChatPointsExpanded(!isBaseChatPointsExpanded)}
            className="w-full flex items-center justify-center text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors duration-300 border-t border-gray-200 dark:border-gray-600 pt-4"
          >
            <span className="text-sm font-medium mr-2">
              {isBaseChatPointsExpanded ? 'Hide Details' : 'Show Details'}
            </span>
            {isBaseChatPointsExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
          </button>

          {isBaseChatPointsExpanded && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between group transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-600 p-3 rounded-lg">
                <span className="text-gray-600 dark:text-gray-400 flex items-center">
                  <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Activity Bonus
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-400">+25%</span>
                  <span className="text-purple-500 font-semibold">
                    {Math.round(((profile.postCount || 0) * 5 + (profile.likesReceived || 0)) * 0.25)}
                  </span>
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="p-4 bg-gray-100 dark:bg-gray-600 rounded-lg">
                  <div className="font-medium text-gray-700 dark:text-gray-200 mb-2 flex items-center">
                    BaseBook Tips
                    <span className="ml-2">💡</span>
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-center text-xs">
                      <span className="mr-2">🎯</span>
                      Share your Base journey and experiences
                    </li>
                    <li className="flex items-center text-xs">
                      <span className="mr-2">🤝</span>
                      Engage with other Base enthusiasts
                    </li>
                    <li className="flex items-center text-xs">
                      <span className="mr-2">🌟</span>
                      Stay active to unlock special features
                    </li>
                  </ul>
                  <div className="mt-2 text-xs italic text-gray-500 dark:text-gray-400">
                    Building the Base community together!
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        

        

        

        

      </div>
    </div>
  );
} 