import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import ProfileSocials from './ProfileSocials';
import { toast } from 'react-hot-toast';
import { UserRank, RANK_DESCRIPTIONS } from '../../utils/ranking';
import { Avatar } from '@coinbase/onchainkit/identity';
import TipButton from './TipButton';
import TipStats from './TipStats';
import RecentTips from './RecentTips';

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
    console.log('Talent Protocol Profile Response:', data); // Debug log
    
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
    stats?: {
      transactions: number;
      tokens: number;
      nfts: number;
      contracts: number;
    };
    totalPoints?: number;
    currentRank?: UserRank;
  };
  onBackToFeed: () => void;
  toEthereumAddress?: (address: string) => `0x${string}`; // Opcjonalne teraz
  RANK_DESCRIPTIONS?: Record<string, string>; // Opcjonalne - używane będzie importowane
  onSocialLinksUpdate?: (links: { twitter: string; farcaster: string; discord: string }) => void;
}

// Komponent funkcyjny do wyświetlania i edycji profilu budowniczego
export default function BuilderProfile({ 
  userAddress, 
  currentUserAddress, 
  profile, 
  onBackToFeed,
  toEthereumAddress: externalToEthereumAddress,
  RANK_DESCRIPTIONS: externalRankDescriptions,
  onSocialLinksUpdate
}: BuilderProfileProps) {
  // Używaj dostarczonej funkcji lub wewnętrznej implementacji
  const convertAddress = externalToEthereumAddress || toEthereumAddress;
  
  // Używaj dostarczonych opisów rang lub importowanych
  const rankDescriptions = externalRankDescriptions || RANK_DESCRIPTIONS;
  
  // Sprawdź czy to profil Vitalika
  const isVitalik = profile.name === 'vitalik.eth';
  
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [newBio, setNewBio] = useState(profile.bio || '');
  const [isSaving, setIsSaving] = useState(false);
  
  // Talent Protocol state
  const [talentScore, setTalentScore] = useState<TalentScore | null>(null);
  const [talentProfile, setTalentProfile] = useState<TalentProfile | null>(null);
  const [loadingTalentData, setLoadingTalentData] = useState(false);
  
  // Zresetuj stan edycji bio kiedy zmienia się profil
  useEffect(() => {
    setNewBio(profile.bio || '');
    setIsEditingBio(false);
  }, [profile]);

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
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-6 p-6 relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-blue-50 to-blue-100 border border-blue-200/50 backdrop-blur-xl shadow-xl">
          {/* Niebieska poświata */}
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-blue-300/20 rounded-full filter blur-2xl"></div>
          <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-blue-400/15 rounded-full filter blur-xl"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent"></div>
          
          {/* Efekt szkła */}
          <div className="absolute inset-0 bg-white/30 backdrop-blur-sm"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6 w-full">
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-full overflow-hidden mr-0 md:mr-4 flex-shrink-0 ring-4 ring-white dark:ring-gray-800 shadow-lg relative">
              {profile.avatar ? (
                <img 
                  src={profile.avatar} 
                  alt="Profile" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <Avatar address={convertAddress(profile.address)} className="w-24 h-24" />
              )}
              {/* Subtelny efekt ramki z gradientem */}
              <div className="absolute inset-0 rounded-full border border-white/20 bg-gradient-to-br from-transparent via-blue-100/10 to-blue-200/20 opacity-50"></div>
            </div>
            
            {/* Linki społecznościowe pod avatarem */}
            <div className="mt-3 w-full">
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

          <div className="flex-1">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-2">
              <div className="flex flex-col">
                <div className={`text-2xl font-semibold ${
                  isVitalik 
                    ? "bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-transparent bg-clip-text"
                    : "bg-gradient-to-r from-blue-500 to-purple-600 text-transparent bg-clip-text"
                }`}>
                  {profile.name.endsWith('.base.eth') ? (
                    <>
                      <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text">{profile.name}</span>
                      <span className="ml-1.5 text-sm bg-blue-100 dark:bg-blue-900 text-blue-500 px-1.5 py-0.5 rounded-md">BaseName</span>
                    </>
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
                <div className="flex items-center space-x-2 mt-1">
                  <button
                    onClick={copyAddressToClipboard}
                    className="flex items-center text-xs text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md w-fit"
                  >
                    <span className="mr-1.5 font-mono">{profile.address.slice(0,6)}...{profile.address.slice(-4)}</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  
                  {/* Tip Button - Don't show for own profile */}
                  {currentUserAddress !== userAddress && (
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-md">
                      <TipButton
                        recipientAddress={userAddress}
                        postId={`profile-${userAddress}`}
                        className="text-gray-500 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400 p-1"
                      />
                    </div>
                  )}
                  
                  {/* Tip Stats - Show received tips for this user */}
                  <TipStats
                    userAddress={userAddress}
                    className="ml-2"
                  />
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
        
        {/* Stats Grid */}
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
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-blue-50 to-blue-100 border border-blue-200/50 backdrop-blur-xl shadow-xl p-6 text-center transition-transform duration-300 hover:scale-[1.02]">
            <div className="absolute -top-4 -right-4 w-16 h-16 bg-blue-300/20 rounded-full filter blur-xl"></div>
            <div className="absolute inset-0 bg-white/20 backdrop-blur-sm"></div>
            <div className="relative z-10">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-pink-400/20 to-pink-500/20 backdrop-blur-sm border border-pink-400/30 mb-3 shadow-lg">
                <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div className="text-pink-600 text-3xl font-light drop-shadow-sm">{profile.likesReceived || 0}</div>
              <div className="text-sm text-pink-500 font-light mt-1">Likes Received</div>
            </div>
          </div>
        </div>
        
        {/* On-chain Stats */}
        {profile.stats && (
          <div className="mb-6 overflow-hidden">
            <h3 className="font-light text-xl text-gray-900 dark:text-white mb-4">On-chain Activity</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-gray-800 rounded-2xl p-4 shadow-sm text-center border border-blue-50 dark:border-blue-900/30 transition-transform duration-300 hover:scale-[1.02]">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 mb-2">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div className="text-blue-500 text-2xl font-light">{profile.stats.transactions || 0}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-light mt-1">Transactions</div>
              </div>
              <div className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-gray-800 rounded-2xl p-4 shadow-sm text-center border border-blue-50 dark:border-blue-900/30 transition-transform duration-300 hover:scale-[1.02]">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 mb-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-green-500 text-2xl font-light">{profile.stats.tokens || 0}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-light mt-1">Tokens</div>
              </div>
              <div className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-gray-800 rounded-2xl p-4 shadow-sm text-center border border-blue-50 dark:border-blue-900/30 transition-transform duration-300 hover:scale-[1.02]">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-2">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-purple-500 text-2xl font-light">{profile.stats.nfts || 0}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-light mt-1">NFTs</div>
              </div>
              <div className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-gray-800 rounded-2xl p-4 shadow-sm text-center border border-blue-50 dark:border-blue-900/30 transition-transform duration-300 hover:scale-[1.02]">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 mb-2">
                  <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="text-yellow-500 text-2xl font-light">{profile.stats.contracts || 0}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-light mt-1">Contracts</div>
              </div>
            </div>
          </div>
        )}
        
        {/* Builder Rank */}
        {profile.currentRank && (
          <div className="mb-6 bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-gray-800 rounded-2xl shadow-sm p-6 border border-blue-50 dark:border-blue-900/30 transition-transform duration-300 hover:scale-[1.01] relative overflow-hidden">
            {/* Efekt świecenia */}
            <div className="absolute -top-10 right-0 w-32 h-32 bg-blue-400 rounded-full filter blur-3xl opacity-10"></div>
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-400 rounded-full filter blur-3xl opacity-10"></div>
            
            <div className="text-center relative z-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 mb-4 shadow-lg">
                <span className="text-white text-2xl">✨</span>
              </div>
              <div className="text-2xl font-light bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 text-transparent bg-clip-text">
                {profile.currentRank}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto font-light">
                {rankDescriptions[profile.currentRank]}
              </div>
            </div>
          </div>
        )}
        
        {/* Points */}
        {profile.totalPoints !== undefined && (
          <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-lg p-6 relative overflow-hidden">
            {/* Efekt świecenia */}
            <div className="absolute -top-10 right-0 w-32 h-32 bg-blue-300 rounded-full filter blur-3xl opacity-20"></div>
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-300 rounded-full filter blur-3xl opacity-20"></div>
            
            <div className="flex justify-between items-center relative z-10">
              <div className="text-xl font-light text-white">
                Total Points
              </div>
              <div className="text-3xl font-light text-white flex items-center">
                <span>{profile.totalPoints}</span>
                <span className="ml-2 text-lg">⚡</span>
              </div>
            </div>
            
            {/* Pasek postępu */}
            <div className="mt-4 w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full"
                style={{ width: `${Math.min(100, (profile.totalPoints / 2000) * 100)}%` }}
              ></div>
            </div>
            <div className="mt-2 text-xs text-white/70 text-right font-light">
              {Math.min(100, Math.round((profile.totalPoints / 2000) * 100))}% to next level
            </div>
          </div>
        )}
        
        {/* Recent Tips */}
        <div className="mt-6">
          <RecentTips 
            userAddress={userAddress}
            limit={10}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
} 