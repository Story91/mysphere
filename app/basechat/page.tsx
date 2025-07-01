'use client';

import { useState, useRef, useEffect, useCallback, PropsWithChildren } from 'react';
import { useAccount, useSendTransaction, usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { Identity, Name, Address, Avatar, IdentityCard, useName } from '@coinbase/onchainkit/identity';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { parseEther } from 'viem';
import {
  saveUserProfile, 
  createPost, 
  addComment, 
  toggleLike,
  toggleCommentLike,
  fetchPosts,
  fetchUserProfile,
  deletePost,
  db,
  updateUserName,
  getBulkUserNames,
  saveProfileName,
  getProfileName,
  editComment,
  deleteComment,
  addCommentReply,
  ADMIN_ADDRESS,
  getCachedActiveUsers,
  searchUsers
} from '../utils/firebase';
import { doc, updateDoc, serverTimestamp, getDoc, setDoc, query, where, Timestamp, orderBy, increment } from 'firebase/firestore';
import { Post, Comment, UserProfile, Stats } from '../types';
import { calculateRanking, UserRank, RANK_DESCRIPTIONS, BADGES } from '../utils/ranking';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import CoinGeckoMarqueeWidget from '../components/CryptoWidget/CoinGeckoMarqueeWidget';
import Script from 'next/script';
import { put } from '@vercel/blob';
import { AnimatePresence, motion } from 'framer-motion';
import BanMessage from '../admin/components/BanMessage';
import { useBanStatus } from '../hooks/useBanStatus';
import LinkPreview from './components/LinkPreview';
import BuilderProfile from './components/BuilderProfile';

import FrameSDK from '@farcaster/frame-sdk'
import farcasterFrame from '@farcaster/frame-wagmi-connector'
import { connect } from 'wagmi/actions'
import { FarcasterFrameProvider } from '../components/FarcasterFrameProvider/FarcasterFrameProvider';
import { RefreshCw } from 'lucide-react';
import TransactionButton from '../components/TransactionButton';
import CommentTransactionButton from '../components/CommentTransactionButton';
import { toast } from 'react-hot-toast';
import YapsMetrics from '../yapscan/components/YapsMetrics';
import ProfileSocials from './components/ProfileSocials';
import PostList, { ExtendedPost } from './components/PostList';
import { HomeIcon, UserIcon, ChartBarIcon, ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid';
// Import Zora SDK functions
import { createCoin, getCoinCreateFromLogs } from '@zoralabs/coins-sdk';
// Import Viem types
import { Address as ViemAddress, Hex } from 'viem';
import CreatePostBaseCamp from './components/BaseCampPosts/CreatePostBaseCamp';
import ClaimPortalBanner from './components/BaseCampPosts/ClaimPortalBanner';

// Add global type declaration for CoinGecko widget
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gecko-coin-price-marquee-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        locale?: string;
        outlined?: string;
        'coin-ids'?: string;
        'initial-currency'?: string;
      };
    }
  }
}

interface LocalUserProfile {
  avatar?: string;
  name: string;
  bio?: string;
  postCount: number;
  likesReceived: number;
  address?: string;
  socialLinks?: {
    twitter?: string;
    farcaster?: string;
    discord?: string;
  };
}

interface ActiveUser {
  address: string;
  points: number;
  stats: {
    posts: number;
    likes: number;
  };
  lastActive: number;
}

const BASESCAN_API_KEY = 'YB9ZQ71MVDJU3CQQXFJ6GQ4Y17MPKEQCBN';
const REFRESH_INTERVAL = 5000; // 5 seconds

// Usuwamy animację gradientu która obciąża przeglądarkę
const gradientAnimation = `
  .static-gradient {
    background-size: 200% 200%;
  }
`;

// Zaktualizuj funkcję sprawdzającą czy nazwa to BaseName
const isBaseName = (name: string) => {
  if (!name) return false;
  return name.endsWith('.base.eth') || name.endsWith('.base');
};

// Nowy komponent BanPage
function BanPage({ children }: { children: React.ReactNode }) {
  const { isBanned, reason, bannedAt, isMounted } = useBanStatus();

  if (!isMounted) {
    return <div></div>;
  }

  if (isBanned) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-3xl">
          <BanMessage reason={reason} bannedAt={bannedAt} />
          <div className="mt-8 text-center text-gray-400">
            Nie masz dostępu do tej strony z powodu blokady konta.
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

type EthereumAddress = `0x${string}`;

const toEthereumAddress = (address: string): EthereumAddress => {
  if (!address.startsWith('0x')) {
    throw new Error('Invalid Ethereum address format');
  }
  return address as `0x${string}`;
};

// Komponent odznaki BaseName
const BaseNameBadge = () => (
  <span className="inline-flex items-center px-2 py-0.5 ml-2 text-xs font-medium rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white">
    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
    BaseName
  </span>
);

// Helper function to upload metadata JSON (replace with actual implementation)
async function uploadMetadataJson(metadata: object): Promise<string> {
  // Example: Upload to Vercel Blob or IPFS
  console.log("Uploading metadata:", metadata);
  // Use fetch to call an API route or directly upload to IPFS/Blob
  const response = await fetch('/api/upload-metadata', { // Assuming an API route exists
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  });
  if (!response.ok) {
    throw new Error('Failed to upload metadata');
  }
  const data = await response.json();
  if (!data.uri) {
    throw new Error('Metadata URI not returned from upload');
  }
  console.log("Metadata URI:", data.uri);
  return data.uri; // Should be like "ipfs://<hash>" or "https://<...>/metadata.json"
}

export default function BaseChat() {
  const [isMounted, setIsMounted] = useState(false);
  const [activeMobilePanel, setActiveMobilePanel] = useState<'left' | 'main' | 'right'>('main');
  const [activeMainPanel, setActiveMainPanel] = useState('feed');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [selectedBuilderProfile, setSelectedBuilderProfile] = useState<{
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
  } | null>(null);
  
  // Network filter state - renamed to activePostingNetwork to reflect its new purpose
  const [activePostingNetwork, setActivePostingNetwork] = useState<'base' | 'basecamp'>('base');
  
  // Stany dla generowania AI
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiGeneratedContentForCamp, setAiGeneratedContentForCamp] = useState<string>('');
  
  // Globalne deklaracje stanów modalu przeniesione na początek funkcji
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'error' | 'warning' | 'confirm'>('error');
  const [showModal, setShowModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [posts, setPosts] = useState<ExtendedPost[]>([]);
  const [newPost, setNewPost] = useState('');
  const [newComments, setNewComments] = useState<{[key: string]: string}>({});
  const [userProfile, setUserProfile] = useState<LocalUserProfile>({
    name: '',
    postCount: 0,
    likesReceived: 0
  });
  const [stats, setStats] = useState<Stats>({
    transactions: 0,
    tokens: 0,
    nfts: 0,
    contracts: 0,
    transactionPoints: 0,
    tokenPoints: 0,
    nftPoints: 0,
    contractPoints: 0
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [postPreviewImage, setPostPreviewImage] = useState<string | null>(null);
  const [postPreviewVideo, setPostPreviewVideo] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [trendingTags, setTrendingTags] = useState<{tag: string, count: number}[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);
  const [totalPosts, setTotalPosts] = useState(0);
  const [totalComments, setTotalComments] = useState(0);
  const [expandedUsersList, setExpandedUsersList] = useState(false);
  const [expandedTagsList, setExpandedTagsList] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [customName, setCustomName] = useState('');
  const [selectedSuffix, setSelectedSuffix] = useState<'sphere' | 'camper'>('sphere');
  const [userNames, setUserNames] = useState<{[key: string]: {name: string, avatar?: string}}>({});
  const [expandedPosts, setExpandedPosts] = useState<{[key: string]: boolean}>({});
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [editingComment, setEditingComment] = useState<{postId: string, commentId: string} | null>(null);
  const [editedCommentContent, setEditedCommentContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<{postId: string, commentId: string} | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [expandedComments, setExpandedComments] = useState<{[key: string]: boolean}>({});
  const [showOnlyUserPosts, setShowOnlyUserPosts] = useState(false);
  const [currentRank, setCurrentRank] = useState<UserRank>(UserRank.NEWBIE);
  const [nextRank, setNextRank] = useState<UserRank>(UserRank.EXPLORER);
  const [progress, setProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedAuthor, setSelectedAuthor] = useState('');
  const [dailyPostCount, setDailyPostCount] = useState(0);
  const [showDailyPostOverlay, setShowDailyPostOverlay] = useState(false);
  const [isAppleDevice, setIsAppleDevice] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showPostImagePreview, setShowPostImagePreview] = useState(false);
  
  // Hook do sprawdzania BaseName
  const { data: baseName, isLoading: isBaseNameLoading } = useName({ 
    address: address || '0x0000000000000000000000000000000000000000', 
    chain: base 
  });

  // Funkcja sprawdzająca czy użytkownik może tworzyć posty - dostępne dla wszystkich
  const canCreatePosts = true; // Zmieniono z Boolean(baseName) na true, aby wszyscy mogli tworzyć posty

  // Sprawdzenie czy użytkownik ma BaseName (do wyróżnienia w UI)
  const userHasBaseName = Boolean(baseName);

  // Dodaj nowy stan dla tooltipa
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<{[key: string]: Stats & { totalPoints: number }}>({});
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);

  const chainId = useChainId();

  // Funkcja do pobierania statystyk użytkownika
  const fetchUserStats = async (userAddress: string) => {
    if (!userStats[userAddress]) {
      try {
        const userRef = doc(db, 'users', userAddress);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data();
        
        if (userData?.stats) {
          setUserStats(prev => ({
            ...prev,
            [userAddress]: {
              ...userData.stats,
              totalPoints: userData.totalPoints || 0
            }
          }));
        }
      } catch (error) {
        console.error('Error fetching user stats:', error);
      }
    }
  };

  // Funkcja pomocnicza do wyświetlania nazwy użytkownika z tooltipem
  const displayUserName = (userAddress: string, elementId: string, showAvatar: boolean = false) => {
    // Sprawdź, czy mamy już nazwę w cache
    const userName = userNames[userAddress]?.name || userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
    const hasBaseName = isBaseName(userName);
    
    return (
      <div className="relative inline-block">
        <div className="flex items-center">
          {showAvatar && (
            userNames[userAddress]?.avatar ? (
              <img
                src={userNames[userAddress].avatar}
                alt="Profile"
                className="w-10 h-10 rounded-full mr-2"
              />
            ) : (
              <Avatar address={toEthereumAddress(userAddress)} className="w-10 h-10 rounded-full mr-2" />
            )
          )}
          <div 
            className="cursor-pointer group relative"
            onClick={() => handleViewBuilderProfile(userAddress)}
            onMouseEnter={() => {
              setHoveredElement(elementId);
            }}
            onMouseLeave={() => {
              setHoveredElement(null);
            }}
          >
            <span className={`${hasBaseName ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text font-bold' : 'text-gray-900 dark:text-white'} text-base`}>
              {userName.endsWith('.sphere') ? (
                <>
                  <span className="text-gray-900 dark:text-white">{userName.replace('.sphere', '')}</span>
                  <span className="text-blue-500">.sphere</span>
                </>
              ) : userName.endsWith('.camper') ? (
                <>
                  <span className="text-gray-900 dark:text-white">{userName.replace('.camper', '')}</span>
                  <span className="text-orange-500">.camper🏕️</span>
                </>
              ) : (
                userName
              )}
            </span>
            {/* Base logo removed as requested */}
            {/* Podpowiedź nad nazwą zamiast pod nią */}
            <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 text-[9px] text-blue-400 bg-white/80 dark:bg-gray-800/80 px-2 py-0.5 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
              Click to view profile
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Funkcja do zapisywania własnej nazwy
  const handleSaveCustomName = async () => {
    if (!address || !customName.trim()) return;
    
    try {
      // Dodaj wybraną końcówkę do nazwy
      const newName = customName.trim() + '.' + selectedSuffix;
      const success = await saveProfileName(address, newName, selectedSuffix);
      
      if (success) {
        // Aktualizuj lokalny stan
        setUserNames(prev => ({
          ...prev,
          [address]: { name: newName, avatar: undefined }
        }));
        
        // Aktualizuj profil użytkownika
        setUserProfile(prev => ({
          ...prev,
          name: newName,
          address: address
        }));
        
        // Zapisz pełny profil do Firebase
        await saveUserProfile({
          walletAddress: address,
          name: newName
        });
        
        // Wyczyść formularz
        setIsEditingName(false);
        setCustomName('');
        setSelectedSuffix('sphere');
        
        // Odśwież nazwy użytkowników
        if (posts.length > 0) {
          fetchUserNames(posts);
        }
        
        // Pokaż komunikat o bonusie punktów za .camper
        if (selectedSuffix === 'camper') {
          alert('🎉 Congratulations! You earned 500 bonus points for choosing .camper!');
        }
      } else {
        alert('Wystąpił błąd podczas zapisywania nazwy. Spróbuj ponownie.');
      }
    } catch (error) {
      console.error('Error saving custom name:', error);
      alert('Wystąpił błąd podczas zapisywania nazwy. Spróbuj ponownie.');
    }
  };

  // Funkcja do obsługi zdjęcia w poście
  const handlePostFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    
    if (file.type.startsWith('image/')) {
      reader.onloadend = () => {
        setPostPreviewImage(reader.result as string);
        setPostPreviewVideo(null);
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      reader.onloadend = () => {
        setPostPreviewVideo(reader.result as string);
        setPostPreviewImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Dodaj nowy stan isLoadingPosts do głównego komponentu, niedaleko innych deklaracji stanów
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);

  // Zmodyfikuj useEffect, który pobiera posty, aby obsługiwał stan ładowania
  useEffect(() => {
    if (isConnected && address) {
      const loadPosts = async () => {
        try {
          setIsLoadingPosts(true); // Ustaw ładowanie na true przed rozpoczęciem pobierania
          const { posts: fetchedPosts } = await fetchPosts({ 
            userId: address
            // Remove networkFilter parameter to always fetch all posts
          });
          setPosts(fetchedPosts);
        } catch (error) {
          console.error('Error fetching posts:', error);
        } finally {
          setIsLoadingPosts(false); // Ustaw ładowanie na false po zakończeniu
        }
      };
      loadPosts();
    }
  }, [isConnected, address]); // Remove networkFilter from dependencies

  // Update onRefreshPosts to not use network filtering
  const onRefreshPosts = async (newPosts?: ExtendedPost[]) => {
    if (!address) return;
    
    try {
      setIsLoadingPosts(true);
      
      if (newPosts && newPosts.length > 0) {
        // Przypadek 1: Otrzymaliśmy nowe posty z infinite scroll
        // lub zoptymalizowane posty z funkcji handleToggleLike
        
        // Sprawdź, czy posty mają takie same ID jak istniejące (optymistyczny update)
        // lub są to nowe posty (infinite scroll)
        const existingIds = new Set(posts.map(p => p.id));
        const hasExistingIds = newPosts.some(p => existingIds.has(p.id));
        
        if (hasExistingIds) {
          // To jest optymistyczny update - całkowicie zastąp posty
          setPosts(newPosts);
        } else {
          // To są nowe posty z infinite scroll - dodaj je do istniejących
          setPosts(currentPosts => {
            // Filtruj tylko nowe posty, których jeszcze nie mamy
            const uniqueNewPosts = newPosts.filter(p => !existingIds.has(p.id));
            // Zwróć połączone tablice postów
            return [...currentPosts, ...uniqueNewPosts];
          });
        }
      } else {
        // Przypadek 2: Standardowe odświeżenie - pobierz wszystkie posty od nowa
        const { posts: refreshedPosts } = await fetchPosts({ 
          userId: address
          // Remove networkFilter parameter to always fetch all posts
        });
        setPosts(refreshedPosts);
      }
    } catch (error) {
      console.error('Error refreshing posts:', error);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  // Dodaj stan dla przechowywania hash transakcji i flagi blokującej wielokrotne tworzenie postów
  const [storedTxHash, setStoredTxHash] = useState<string | null>(null);
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  
  // Obsługa sukcesu transakcji
  const handleTransactionSuccess = (txHash: string) => {
    // Jeśli już trwa tworzenie posta, nie wywołuj ponownie
    if (isCreatingPost) {
      console.log('Post creation already in progress, ignoring duplicate transaction success');
      return;
    }
    
    // Zapisz txHash i wywołaj nową funkcję dla prostych postów onchain
    // zamiast tworzenia tokena Zora
    handleOnchainPostSuccess(txHash);
  };

  // Nowa funkcja do obsługi prostych postów onchain (bez tokena Zora)
  const handleOnchainPostSuccess = async (txHash: string) => {
    if (!isConnected || !address || !newPost.trim()) {
      toast.error("Wallet not connected or post content empty");
      return;
    }

    if (isCreatingPost) {
      console.log('Post creation already in progress, ignoring duplicate request');
      toast("Post creation in progress...", { icon: '⏳' });
      return;
    }

    setIsCreatingPost(true);
    const toastId = toast.loading("Creating post...");

    try {
      // Sprawdzenie czy użytkownik jest adminem
      const isAdmin = address.toLowerCase() === ADMIN_ADDRESS;

      // Sprawdzenie limitu postów dziennie (tylko dla zwykłych użytkowników)
      if (!isAdmin && dailyPostCount >= 5) {
        toast.error('You have reached the daily limit of 5 posts.');
        setIsCreatingPost(false);
        toast.dismiss(toastId);
        return;
      }

      let imageUrl: string | null = null;
      let videoUrl: string | null = null;

      // 1. Handle media upload (image or video) - jeśli istnieje
      if (postPreviewImage || postPreviewVideo) {
        setUploadProgress(0);
        const mediaContent = postPreviewImage || postPreviewVideo;
        if (!mediaContent) throw new Error('No media content');

        const base64Response = await fetch(mediaContent);
        const blob = await base64Response.blob();

        const isVideo = postPreviewVideo !== null;
        const fileExtension = isVideo ? (blob.type.split('/')[1] || 'mp4') : (blob.type.split('/')[1] || 'jpg');
        const fileName = `post-media-${Date.now()}.${fileExtension}`;

        const formData = new FormData();
        formData.append('file', blob, fileName);

        const response = await fetch('/api/upload', { method: 'POST', body: formData });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to upload media: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        if (isVideo) {
          videoUrl = data.url;
        } else {
          imageUrl = data.url;
        }
        setUploadProgress(100);
      }

      // Extract hashtags and mentions
      const tags = Array.from(new Set((newPost.match(/#(\w+)/g) || []).map(tag => tag.slice(1))));
      const mentions = Array.from(new Set((newPost.match(/@(\w+)/g) || []).map(mention => mention.slice(1))));

      // 2. Save to Firebase bez tokena Zora
      await createPost({
        author: address,
        content: newPost,
        timestamp: Date.now(),
        image: imageUrl,
        video: videoUrl,
        tags: tags,
        mentions: mentions,
        visibility: 'public',
        txHash: txHash, // Zapisz hash transakcji onchain
        network: 'base' // Identify as a Base network post
      });

      // 3. Update UI
      toast.success('Post created successfully!', { id: toastId });
      setNewPost('');
      setPostPreviewImage(null);
      setPostPreviewVideo(null);
      
      // 4. Refresh posts
      await refreshPosts();
      
      // 5. Increment daily count
      setDailyPostCount(prev => prev + 1);
      await updateDoc(doc(db, 'users', address), {
        [`dailyPosts.${today}`]: increment(1)
      });
      
      // 6. Update user stats
      await updateDoc(doc(db, 'users', address), {
        postCount: increment(1)
      });
      
      // 7. Update global stats
      try {
        await setDoc(doc(db, 'stats', 'global'), {
          posts: increment(1)
        }, { merge: true }); // Użyj setDoc z merge: true zamiast updateDoc
      } catch (error) {
        console.log("Error updating global stats, but post was created:", error);
        // Nie przerywamy procesu tworzenia posta, tylko logujemy błąd
      }
      
      // 8. Calculate and update BaseChatPoints
      try {
        await calculateAndSaveBaseChatPoints();
      } catch (error) {
        console.log("Error calculating BaseChatPoints, but post was created:", error);
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error(`Failed to create post: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId });
    } finally {
      setIsCreatingPost(false);
    }
  };

  // Modyfikacja handleCreatePost, aby odświeżał posty po dodaniu nowego posta
  const handleCreatePost = async () => { // Function for Zora token creation
    // Ensure clients are available
    if (!isConnected || !address || !newPost.trim() || !publicClient || !walletClient) {
        toast.error("Wallet not connected or client not ready.");
        return;
    }

    // Jeśli już trwa tworzenie posta, nie kontynuuj
    if (isCreatingPost) {
      console.log('Post creation already in progress, ignoring duplicate request');
      toast("Post creation in progress...", { icon: '⏳' }); // Use default toast for info/warning
      return;
    }

    // Ustaw flagę blokującą wielokrotne tworzenie postów
    setIsCreatingPost(true);
    const toastId = toast.loading("Creating post token..."); // Store toast ID
    
    // Declare variables outside try block so they're accessible in catch
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    let mediaMimeType: string | undefined = undefined;

    try {
      // Sprawdzenie czy użytkownik jest adminem
      const isAdmin = address.toLowerCase() === ADMIN_ADDRESS;

      // Sprawdzenie limitu postów dziennie (tylko dla zwykłych użytkowników)
      if (!isAdmin && dailyPostCount >= 5) {
        toast.error('You have reached the daily limit of 5 posts.');
        setIsCreatingPost(false); // Resetuj flagę
        toast.dismiss(toastId);
        return;
      }
      // Optimistically update count, handle potential failure later if needed
      // setDailyPostCount(prev => prev + 1); // Moved after successful creation

      console.log('🚀 Starting Zora coin creation for post...');

      // Declare variables for media URLs
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;
      let mediaMimeType: string | undefined = undefined;

      // 1. Handle media upload (image or video)
      if (postPreviewImage || postPreviewVideo) {
        setUploadProgress(0); // Start progress indication
        const mediaContent = postPreviewImage || postPreviewVideo;
        if (!mediaContent) throw new Error('No media content');

        const base64Response = await fetch(mediaContent);
        const blob = await base64Response.blob();
        mediaMimeType = blob.type; // Store mime type

        const isVideo = postPreviewVideo !== null;
        const fileExtension = isVideo ? (blob.type.split('/')[1] || 'mp4') : (blob.type.split('/')[1] || 'jpg');
        const fileName = `post-media-${Date.now()}.${fileExtension}`;

        const formData = new FormData();
        formData.append('file', blob, fileName);

        const response = await fetch('/api/upload', { method: 'POST', body: formData });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to upload media: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        if (isVideo) {
          videoUrl = data.url;
        } else {
          imageUrl = data.url;
        }
        setUploadProgress(100); // Finish progress indication
        console.log("Media uploaded:", isVideo ? videoUrl : imageUrl);
      }

      // 2. Generate Metadata
      const postContentExcerpt = newPost.length > 100 ? newPost.substring(0, 97) + "..." : newPost;
      const metadata = {
        name: `Post by ${userProfile.name || address.slice(0,6)}: ${postContentExcerpt}`, // Example name
        description: newPost,
        image: imageUrl || '', // Use uploaded image URL or empty string
        ...(videoUrl && { animation_url: videoUrl }), // Add animation_url if video exists
        ...(videoUrl && mediaMimeType && { // Add Zora 'content' extension if video
          content: {
            mime: mediaMimeType,
            uri: videoUrl
          }
        }),
        properties: {
          category: "social", // Example property
          author: address,
          createdAt: new Date().toISOString(),
          tags: Array.from(new Set((newPost.match(/#(\w+)/g) || []).map(tag => tag.slice(1)))),
          mentions: Array.from(new Set((newPost.match(/@(\w+)/g) || []).map(mention => mention.slice(1))))
        }
      };

      // 3. Upload Metadata using /api/upload
      console.log("Uploading metadata JSON via /api/upload...");
      const metadataJsonString = JSON.stringify(metadata);
      const metadataBlob = new Blob([metadataJsonString], { type: 'application/json' });
      const metadataFileName = `metadata-${Date.now()}.json`;

      const metadataFormData = new FormData();
      metadataFormData.append('file', metadataBlob, metadataFileName);

      const metadataUploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: metadataFormData,
      });

      if (!metadataUploadResponse.ok) {
          const errorData = await metadataUploadResponse.json();
          throw new Error(`Failed to upload metadata: ${errorData.error || metadataUploadResponse.statusText}`);
      }

      const metadataUploadData = await metadataUploadResponse.json();
      const metadataUri = metadataUploadData.url; // Get the URL from the response
      if (!metadataUri) {
          throw new Error("Metadata URI not returned from upload");
      }
      console.log("Metadata URI:", metadataUri);

              // 4. Prepare Coin Parameters for Zora SDK
        // Clean and validate parameters according to Zora SDK documentation
        const cleanName = `MySphere Post by ${userProfile.name || address.slice(0,6)}`.substring(0, 32).trim();
        const firstWord = newPost.trim().split(/\s+/)[0];
        const cleanSymbol = firstWord.replace(/[^A-Z0-9]/gi, '').substring(0, 10).toUpperCase() || 'POST';
        
        const coinParams = {
          name: cleanName,
          symbol: cleanSymbol,
          uri: metadataUri, // Use the URL from Vercel Blob
          payoutRecipient: address as ViemAddress, // Creator receives earnings
          owners: [address as ViemAddress], // Required: specify owners array
          platformReferrer: "0x9fb014812e5c22643640a5885866f499b1bbb5e0" as ViemAddress, // Referral fees recipient
          // Remove problematic parameters that cause poolConfig issues
        };
              console.log("Zora coin parameters:", coinParams);
        
        // Validate parameters before calling createCoin  
        if (!coinParams.name || coinParams.name.length === 0) {
          throw new Error("Token name cannot be empty");
        }
        if (!coinParams.symbol || coinParams.symbol.length === 0) {
          throw new Error("Token symbol cannot be empty"); 
        }
        if (!coinParams.uri || !coinParams.uri.startsWith('http')) {
          throw new Error("Invalid metadata URI - must be a valid HTTP/HTTPS URL");
        }
        
        // 5. Call createCoin
      console.log("Calling createCoin via Zora SDK...");
      // Make sure walletClient is not null/undefined before calling createCoin
      if (!walletClient) {
          throw new Error("Wallet client is not available.");
      }
      const result = await createCoin(coinParams, walletClient, publicClient);

      console.log("Zora coin creation transaction sent:", result.hash);
      toast.loading("Waiting for transaction confirmation...", { id: toastId });

      // Wait for the transaction to be confirmed
      const receipt = await publicClient.waitForTransactionReceipt({ hash: result.hash });
      console.log("Transaction confirmed:", receipt);

      // 6. Get Coin Address from logs
      const coinDeployment = getCoinCreateFromLogs(receipt);
      if (!coinDeployment?.coin) {
        throw new Error("Could not extract coin address from transaction logs.");
      }
      const zoraCoinAddress = coinDeployment.coin;
      console.log("Successfully created Zora Coin Address:", zoraCoinAddress);


      // Extract hashtags and mentions (already done for metadata)
      const tags = metadata.properties.tags;
      const mentions = metadata.properties.mentions;

      // 7. Save to Firebase (including the new zoraCoinAddress)
      console.log("Saving post data to Firebase...");
      const visibilityValue = 'public'; // Use simple string type
      const postDataForFirebase = {
        author: address,
        content: newPost,
        timestamp: Date.now(),
        image: imageUrl,
        video: videoUrl,
        tags: tags,
        mentions: mentions,
        visibility: visibilityValue, // Use simple string
        zoraCoinAddress: zoraCoinAddress, // <-- Save the Zora Coin address
        txHash: result.hash // <-- Save the Zora creation tx hash
      };

      // Optimistic UI update (Add temporary post)
      const tempPost: ExtendedPost = {
        id: `temp-${Date.now()}`,
        author: address,
        content: newPost,
        timestamp: Date.now(),
        image: imageUrl ?? undefined, // Ensure undefined if null
        video: videoUrl ?? undefined, // Ensure undefined if null
        tags: tags,
        mentions: mentions,
        visibility: visibilityValue, // Use simple string
        zoraCoinAddress: zoraCoinAddress,
        txHash: result.hash,
        likes: 0,
        likedBy: [],
        comments: []
      };
      setPosts(currentPosts => [tempPost, ...currentPosts]);

      // Actual Firebase save
      // Assuming createPost in firebase.ts can handle the new zoraCoinAddress field
      await createPost({
          author: address,
          content: newPost,
          timestamp: Date.now(),
          image: imageUrl,
          video: videoUrl,
          tags: tags,
          mentions: mentions,
          visibility: visibilityValue,
          zoraCoinAddress: zoraCoinAddress,
          txHash: result.hash
      });
      console.log("Post saved to Firebase.");

      // Successfully created, now increment daily count
      setDailyPostCount(prev => prev + 1);

      // Refresh posts list from Firebase to get the real ID
      const { posts: updatedPosts } = await fetchPosts({ userId: address });
      setPosts(updatedPosts);

      // Reset form
      setNewPost('');
      setPostPreviewImage(null);
      setPostPreviewVideo(null);
      setUploadProgress(0);

      // Show success message
      toast.dismiss(toastId);
      toast.success('Post created successfully as a Zora token!');

      // Show daily post overlay with delay
      setTimeout(() => {
        setShowDailyPostOverlay(true);
        setTimeout(() => setShowDailyPostOverlay(false), 3000);
      }, 1000); // Shorter delay now

    } catch (error: any) {
      console.error('Error creating Zora coin post:', error);
      toast.dismiss(toastId); // Ensure loading toast is dismissed on error
      
      // Determine the specific error type and show appropriate message
      let errorMessage = 'Unknown error occurred while creating post';
      let shouldFallback = false;
      
      if (error.message.includes('execution reverted') || error.message.includes('ContractFunctionExecutionError')) {
        errorMessage = 'Token creation failed due to contract error. Creating as regular post instead.';
        shouldFallback = true;
      } else if (error.message.includes('Missing or invalid parameters')) {
        errorMessage = 'Invalid token parameters. Creating as regular post instead.';
        shouldFallback = true;
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds to create the token. Please ensure you have enough ETH for gas fees.';
      } else if (error.message.includes('user rejected')) {
        errorMessage = 'Transaction was rejected by user.';
      } else if (error.message.includes('Failed to upload')) {
        errorMessage = 'Failed to upload media or metadata. Please try again.';
      } else if (error.message.includes('Token name cannot be empty') || 
                 error.message.includes('Token symbol cannot be empty') ||
                 error.message.includes('Invalid metadata URI')) {
        errorMessage = error.message;
      } else if (error.message) {
        errorMessage = error.message.substring(0, 100);
      }
      
      // Try fallback to regular post if token creation failed
      if (shouldFallback) {
        try {
          console.log('Attempting fallback to regular post...');
          toast.loading('Creating as regular post...', { id: toastId });
          
          // Extract hashtags and mentions  
          const tags = Array.from(new Set((newPost.match(/#(\w+)/g) || []).map(tag => tag.slice(1))));
          const mentions = Array.from(new Set((newPost.match(/@(\w+)/g) || []).map(mention => mention.slice(1))));
          
          // Create regular post without token
          await createPost({
            author: address,
            content: newPost,
            timestamp: Date.now(),
            image: imageUrl ?? undefined,
            video: videoUrl ?? undefined,
            tags: tags,
            mentions: mentions,
            visibility: 'public',
            network: 'base' // Identify as a Base network post without token
          });
          
          // Update UI
          toast.success('Post created successfully!', { id: toastId });
          setNewPost('');
          setPostPreviewImage(null);
          setPostPreviewVideo(null);
          
          // Refresh posts
          await refreshPosts();
          
          // Increment daily count
          setDailyPostCount(prev => prev + 1);
          
        } catch (fallbackError) {
          console.error('Fallback post creation also failed:', fallbackError);
          toast.error('Failed to create post. Please try again.', { id: toastId });
        }
      } else {
        toast.error(`Error creating post: ${errorMessage}`);
      }
      
      // Log detailed error for debugging
      console.error('Detailed error:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause
      });
    } finally {
      // Zawsze resetuj flagę blokującą, nawet w przypadku błędu
      setIsCreatingPost(false);
    }
  };

  const handleAddComment = async (postId: string, txHash?: string) => {
    if (!isConnected || !address || !newComments[postId]?.trim()) return;

    try {
      // Wykryj wzmianki w treści
      const mentionRegex = /@(\w+)/g;
      const mentions = Array.from(
        new Set((newComments[postId].match(mentionRegex) || []).map(m => m.slice(1)))
      );

      const comment = {
        postId,
        author: address,
        content: newComments[postId],
        timestamp: Date.now(),
        likes: 0,
        likedBy: [],
        mentions: mentions,
        txHash: txHash || null // Dodajemy hash transakcji, jeśli istnieje
      };

      await addComment(postId, comment);
      
      // Clear comment input and refresh posts
      setNewComments(prev => ({...prev, [postId]: ''}));
      const { posts: updatedPosts } = await fetchPosts({ userId: address });
      setPosts(updatedPosts);
      
      toast.success('Comment added successfully!');
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
    }
  };

  // Funkcja do obsługi polubienia
  const handleToggleLike = async (postId: string) => {
    if (!isConnected || !address) return;
    
    try {
      // Optymistyczna aktualizacja UI - natychmiastowa reakcja
      const updatedPosts = posts.map(post => {
        if (post.id === postId) {
          const isLiked = post.likedBy?.includes(address);
          return {
            ...post,
            likes: (post.likes || 0) + (isLiked ? -1 : 1),
            likedBy: isLiked 
              ? (post.likedBy || []).filter(id => id !== address)
              : [...(post.likedBy || []), address]
          };
        }
        return post;
      });
      
      // Aktualizuj stan natychmiast, aby użytkownik widział efekt od razu
      setPosts(updatedPosts);
      
      // Wykonaj rzeczywistą operację w tle
      await toggleLike(postId, address);
      
      // Na końcu odśwież dane z serwera (opcjonalnie, aby upewnić się, że dane są zgodne)
      const { posts: refreshedPosts } = await fetchPosts({ userId: address });
      setPosts(refreshedPosts);
      await fetchUserStats(address);
    } catch (error) {
      console.error('Error toggling like:', error);
      // W przypadku błędu, przywróć dane z serwera
      try {
        const { posts: refreshedPosts } = await fetchPosts({ userId: address });
        setPosts(refreshedPosts);
      } catch {
        console.error('Failed to restore posts state after like error');
      }
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  };

  const handleSendCrypto = async (toAddress: string, amount: string = "0.01") => {
    if (!isConnected) return;
    
    try {
      const { sendTransaction } = useSendTransaction();
      
      await sendTransaction({
        to: toAddress as `0x${string}`,
        value: parseEther(amount)
      });
    } catch (error) {
      console.error('Error sending crypto:', error);
    }
  };

  // Funkcja do pobierania trendujących hashtagów z postów
  const getTrendingTags = (posts: Post[]) => {
    const tagCounts = new Map<string, number>();
    
    posts.forEach(post => {
      post.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  // Dodaj nowy stan dla statusu ładowania
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  // Dodaj stan do śledzenia, czy dane zostały już odświeżone po starcie
  const [initialRefreshDone, setInitialRefreshDone] = useState(false);
  // Dodaj stan do śledzenia, czy można odświeżyć dane ręcznie
  const [canManuallyRefresh, setCanManuallyRefresh] = useState(true);

  // Funkcja do szybkiego ładowania podstawowych danych z localStorage
  const loadInitialData = useCallback(() => {
    try {
      const cachedData = localStorage.getItem('activeUsers');
      const cachedNames = localStorage.getItem('userNames');
      
      if (cachedData) {
        const parsedUsers = JSON.parse(cachedData);
        // Sprawdź czy cache nie jest za stary (max 10 minut)
        const cacheTime = localStorage.getItem('usersCacheTime');
        const isStale = !cacheTime || (Date.now() - parseInt(cacheTime)) > 10 * 60 * 1000;
        
        if (!isStale) {
          setActiveUsers(parsedUsers);
          setIsLoadingUsers(false);
          console.log('📋 Loaded cached users data');
        }
      }
        
      if (cachedNames) {
        setUserNames(JSON.parse(cachedNames));
      }
    } catch (error) {
      console.error('Error loading cached data:', error);
    }
  }, []);

  // Zmodyfikowana funkcja getActiveUsers - teraz używa cache'u
  const getActiveUsers = useCallback(async (forceRefresh: boolean = false) => {
    if (!db) return;

    try {
      setIsLoadingUsers(true);
      setCanManuallyRefresh(false);
      
      console.log(`🔄 Loading active users (force: ${forceRefresh})...`);
      
             // Użyj nowej funkcji z cache'em
       const users = await getCachedActiveUsers(1000, forceRefresh);
      
      // Aktualizuj userNames
      const userNamesUpdate: {[key: string]: {name: string, avatar?: string}} = {};
      users.forEach(user => {
        userNamesUpdate[user.address] = {
          name: user.name,
          avatar: user.avatar
        };
      });
      
      setUserNames(prev => ({
        ...prev,
        ...userNamesUpdate
      }));
      
             // Zapisz do localStorage z timestampem
       localStorage.setItem('activeUsers', JSON.stringify(users));
       localStorage.setItem('userNames', JSON.stringify(userNamesUpdate));
       localStorage.setItem('usersCacheTime', Date.now().toString());

      setActiveUsers(users);
      setIsLoadingUsers(false);
      setInitialRefreshDone(true);
      
      // Pozwól na ręczne odświeżenie po 5 sekundach (skrócono z 10)
      setTimeout(() => {
        setCanManuallyRefresh(true);
      }, 5000);
      
             console.log(`✅ Loaded ${users.length}/1000 active users from cache`);
    } catch (error) {
      console.error('Error fetching active users:', error);
      setIsLoadingUsers(false);
      setCanManuallyRefresh(true);
    }
  }, [db]);

  // Funkcja do ręcznego odświeżania danych z force refresh
  const handleManualRefresh = useCallback(() => {
    if (canManuallyRefresh) {
      getActiveUsers(true); // Force refresh when manually triggered
    }
  }, [canManuallyRefresh, getActiveUsers]);

  // Automatyczne odświeżanie przy pierwszym załadowaniu strony
  useEffect(() => {
    if (isMounted && !initialRefreshDone) {
      // Pobierz aktualne dane z Firebase (bez force refresh - użyj cache'u jeśli dostępny)
      getActiveUsers(false);
      setInitialRefreshDone(true);
    }
  }, [isMounted, initialRefreshDone, getActiveUsers]);
  
  // Automatyczne odświeżanie po zalogowaniu - symuluje kliknięcie przycisku Refresh
  useEffect(() => {
    if (isConnected && address) {
      // Odśwież po 1 sekundzie od zalogowania (force refresh)
      const timer = setTimeout(() => {
        getActiveUsers(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isConnected, address, getActiveUsers]);
  
  // Regularne odświeżanie co 10 minut (zwiększono z 2 minut)
  useEffect(() => {
    if (isMounted) {
      const refreshInterval = setInterval(() => getActiveUsers(false), 10 * 60 * 1000); // Co 10 minut, używa cache'u
      
      // Cleanup dla interwału
      return () => {
        clearInterval(refreshInterval);
      };
    }
  }, [isMounted, getActiveUsers]);

  // Dodaj useEffect do aktualizacji trendujących tagów
  useEffect(() => {
    const trending = getTrendingTags(posts);
    setTrendingTags(trending);
  }, [posts]);

  // useEffect do ustawienia isMounted i wczytania cache'u
  useEffect(() => {
    setIsMounted(true);
    loadInitialData(); // Załaduj cache od razu
    return () => {
      setIsMounted(false);
      // Cleanup search timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [loadInitialData]);

  // Dodaj funkcję do tworzenia grupy
  const handleCreateGroup = async () => {
    if (!address) return;
    const groupName = prompt('Enter group name:');
    if (!groupName) return;

    try {
      const groupRef = collection(db, 'groups');
      await addDoc(groupRef, {
        name: groupName,
        creator: address,
        members: [address],
        createdAt: serverTimestamp()
      });
      alert('Group created successfully!');
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  // Dodaj funkcję do pobierania statystyk
  const fetchGlobalStats = async () => {
    try {
      // Pobierz wszystkich użytkowników
      const usersSnap = await getDocs(collection(db, 'users'));
      setTotalUsers(usersSnap.size);

      // Pobierz wszystkie posty i zlicz polubienia, posty i komentarze
      const postsSnap = await getDocs(collection(db, 'posts'));
      let likesCount = 0;
      let commentsCount = 0;
      let postsCount = 0;

      postsSnap.forEach(doc => {
        const post = doc.data();
        likesCount += post.likes || 0;
        commentsCount += post.comments?.length || 0;
        postsCount += 1;
      });

      setTotalLikes(likesCount);
      setTotalPosts(postsCount);
      setTotalComments(commentsCount);
    } catch (error) {
      console.error('Error fetching global stats:', error);
    }
  };

  // Dodaj useEffect do pobierania statystyk
  useEffect(() => {
    fetchGlobalStats();
    const interval = setInterval(fetchGlobalStats, 60000); // Odświeżaj co minutę
    return () => clearInterval(interval);
  }, []);

  // Dodaj funkcję do obsługi usuwania posta
  const handleDeletePost = async (postId: string) => {
    if (!isConnected || !address) return;

    try {
      if (confirm('Are you sure you want to delete this post?')) {
        await deletePost(postId, address);
        // Odśwież posty po usunięciu
        const { posts: updatedPosts } = await fetchPosts({ userId: address });
        setPosts(updatedPosts);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  // useEffect do pobierania profilu użytkownika
  useEffect(() => {
    if (isConnected && address) {
      const loadUserProfile = async () => {
        if (!address) return;
        
        try {
          // Pobierz profil z Firebase
          const profile = await fetchUserProfile(address, { loadSocialLinks: true });
          
          if (profile) {
            // Pobierz nazwę z Firebase
            const savedName = await getProfileName(address);
            
            if (profile) {
              // Ustaw profil z odpowiednią nazwą
              setUserProfile({
                name: baseName || savedName || profile.name || `${address.slice(0, 6)}...${address.slice(-4)}`,
                avatar: profile.avatar,
                postCount: profile.postsCount || 0,
                likesReceived: profile.likesReceived || 0,
                address: address,
                bio: profile.bio,
                socialLinks: profile.socialLinks
              });
              
              // Jeśli mamy BaseName, zapisz go do Firebase wraz z avatarem
              if (baseName) {
                await saveProfileName(address, baseName);
                // Zaktualizuj userNames dla aktualnego użytkownika
                setUserNames(prev => ({
                  ...prev,
                  [address]: {
                    name: baseName,
                    avatar: profile.avatar
                  }
                }));
              }
            }
          }
        } catch (error) {
          console.error('Error loading user profile:', error);
        }
      };

      loadUserProfile();
    }
  }, [isConnected, address, baseName]);

  // Dodaj nowy useEffect do resetowania stanu przy zmianie portfela
  useEffect(() => {
    const resetStats = async () => {
      if (!address) {
        // Reset stanu przy braku portfela
        setUserProfile({
          name: '',
          avatar: undefined,
          postCount: 0,
          likesReceived: 0,
          address: '',
          socialLinks: {
            twitter: '',
            farcaster: '',
            discord: ''
          }
        });
        setPreviewImage(null);
        setUserStats({}); // Reset statystyk użytkowników
        setHoveredUser(null); // Reset hoveredUser
      } else {
        // Jeśli jest adres, pobierz statystyki dla aktualnego użytkownika
        await fetchUserStats(address);
      }
    };
      
    resetStats();
  }, [address]);

  // Dodaj nowy useEffect do pobierania statystyk dla najechanego użytkownika
  useEffect(() => {
    if (hoveredUser) {
      fetchUserStats(hoveredUser);
    }
  }, [hoveredUser]);

  // Zaktualizuj funkcję handleAvatarUpdate
  const handleAvatarUpdate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !event.target.files[0] || !address) return;
    
    const file = event.target.files[0];
    
    // Sprawdź rozmiar pliku (max 1MB)
    if (file.size > 1024 * 1024) {
      setModalMessage('Maximum file size is 1MB');
      setModalType('error');
      setShowModal(true);
      return;
    }

    // Sprawdź czy można zmienić zdjęcie
          const userRef = doc(db, 'users', address);
          const userDoc = await getDoc(userRef);
    const userData = userDoc.data();
    
    if (userData?.lastImageUpdate) {
      const lastUpdate = userData.lastImageUpdate.toDate();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      if (lastUpdate > oneMonthAgo) {
        const timeToWait = new Date(lastUpdate.getTime() + 30 * 24 * 60 * 60 * 1000);
        const now = new Date();
        const diff = timeToWait.getTime() - now.getTime();
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        setModalMessage(`You can change your profile picture once a month.\nTime remaining: ${days} days and ${hours} hours`);
        setModalType('warning');
        setShowModal(true);
        return;
      }
    }

    setSelectedFile(file);
    setModalMessage('Are you sure you want to change your profile picture?\nNext change will be possible in one month.\nMaximum file size: 1MB');
    setModalType('confirm');
    setShowModal(true);
  };

  // Funkcja do obsługi potwierdzenia zmiany zdjęcia
  const handleConfirmUpload = async () => {
    if (!selectedFile || !address) return;
    
    try {
      setIsUploading(true);
      
      // Upload do Vercel Blob
      const { url } = await put(selectedFile.name, selectedFile, {
        access: 'public',
        token: process.env.NEXT_PUBLIC_BLOB_READ_WRITE_TOKEN
      });

      // Aktualizuj profil użytkownika
      const userRef = doc(db, 'users', address);
      await updateDoc(userRef, {
        avatar: url,
        lastImageUpdate: new Date()
      });

      // Aktualizuj lokalny stan
      setPreviewImage(url);
      setUserProfile(prev => ({
            ...prev,
        avatar: url
      }));
      
      setShowModal(false);
    } catch (error) {
      console.error('Error updating avatar:', error);
      setModalMessage('Wystąpił błąd podczas zapisywania zdjęcia. Spróbuj ponownie.');
      setModalType('error');
      setShowModal(true);
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
    }
  };

  // Dodaj funkcję do pobierania danych z BaseScan
  useEffect(() => {
    async function fetchData() {
      if (!address) {
        setStats({
          transactions: 0,
          tokens: 0,
          nfts: 0,
          contracts: 0,
          transactionPoints: 0,
          tokenPoints: 0,
          nftPoints: 0,
          contractPoints: 0
        });
        setCurrentRank(UserRank.NEWBIE);
        setNextRank(UserRank.EXPLORER);
        setProgress(0);
        return;
      }

      try {
        // Fetch data from BaseScan
        const [txResponse, nftResponse, tokenResponse] = await Promise.all([
          fetch(`https://api.basescan.org/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${BASESCAN_API_KEY}`),
          fetch(`https://api.basescan.org/api?module=account&action=tokennfttx&address=${address}&apikey=${BASESCAN_API_KEY}`),
          fetch(`https://api.basescan.org/api?module=account&action=tokentx&address=${address}&apikey=${BASESCAN_API_KEY}`)
        ]);

        const [txData, nftData, tokenData] = await Promise.all([
          txResponse.json(),
          nftResponse.json(),
          tokenResponse.json()
        ]);

        // Calculate ranking using the same function as in Identity component
        const rankingStats = calculateRanking(
          txData.status === '1' ? txData.result : [],
          tokenData.status === '1' ? tokenData.result : [],
          nftData.status === '1' ? nftData.result : []
        );

        // Update stats
        setStats({
          transactions: rankingStats.stats.transactions,
          tokens: rankingStats.stats.tokens,
          nfts: rankingStats.stats.nfts,
          contracts: rankingStats.stats.contracts,
          transactionPoints: rankingStats.breakdown.transactionPoints,
          tokenPoints: rankingStats.breakdown.tokenPoints,
          nftPoints: rankingStats.breakdown.nftPoints,
          contractPoints: rankingStats.breakdown.uniqueContractPoints
        });

        // Calculate total points
        const totalPoints = rankingStats.totalPoints;

        // Update rank and progress
        let currentRankValue = UserRank.NEWBIE;
        let nextRankValue = UserRank.EXPLORER;
        let progressValue = 0;

        if (totalPoints >= 450_000) {
          currentRankValue = UserRank.LEGEND;
          nextRankValue = UserRank.LEGEND;
          progressValue = 100;
        } else if (totalPoints >= 225_000) {
          currentRankValue = UserRank.WHALE;
          nextRankValue = UserRank.LEGEND;
          progressValue = ((totalPoints - 225_000) / (450_000 - 225_000)) * 100;
        } else if (totalPoints >= 90_000) {
          currentRankValue = UserRank.INVESTOR;
          nextRankValue = UserRank.WHALE;
          progressValue = ((totalPoints - 90_000) / (225_000 - 90_000)) * 100;
        } else if (totalPoints >= 22_500) {
          currentRankValue = UserRank.TRADER;
          nextRankValue = UserRank.INVESTOR;
          progressValue = ((totalPoints - 22_500) / (90_000 - 22_500)) * 100;
        } else if (totalPoints >= 4_500) {
          currentRankValue = UserRank.EXPLORER;
          nextRankValue = UserRank.TRADER;
          progressValue = ((totalPoints - 4_500) / (22_500 - 4_500)) * 100;
        } else {
          progressValue = (totalPoints / 4_500) * 100;
        }

        setCurrentRank(currentRankValue);
        setNextRank(nextRankValue);
        setProgress(progressValue);

        // Update user profile in Firebase
        const userRef = doc(db, 'users', address);
        
        // Sprawdź czy dokument istnieje
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          // Aktualizuj istniejący dokument
          await updateDoc(userRef, {
            totalPoints,
            currentRank: currentRankValue,
            lastUpdated: serverTimestamp(),
            stats: rankingStats.stats
          });
        } else {
          // Utwórz nowy dokument
          await setDoc(userRef, {
            address,
            name: baseName || `${address.slice(0, 6)}...${address.slice(-4)}`,
            totalPoints,
            currentRank: currentRankValue,
            joinedAt: serverTimestamp(),
            lastUpdated: serverTimestamp(),
            stats: rankingStats.stats
          });
        }

      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }

    if (isConnected && address) {
      fetchData();
      const interval = setInterval(fetchData, REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [address, isConnected, baseName]);

  // Funkcja do pobierania nazw użytkowników
  const fetchUserNames = async (posts: Post[]) => {
    try {
      const addresses = new Set<string>();
      
      // Zbierz wszystkie adresy
      posts.forEach(post => {
        addresses.add(post.author);
        post.comments?.forEach(comment => {
          addresses.add(comment.author);
        });
      });

      // Pobierz nazwy z Firebase
      const names = await getBulkUserNames(Array.from(addresses));
      
      // Dodaj BaseName dla aktualnego użytkownika
      if (baseName && address) {
        names[address] = { name: baseName, avatar: undefined };
      }
      
      setUserNames(names);
    } catch (error) {
      console.error('Error fetching user names:', error);
    }
  };

  // useEffect do aktualizacji nazw
  useEffect(() => {
    if (posts.length > 0) {
      fetchUserNames(posts);
    }
  }, [posts, baseName, address]);

  // Modify displayedPosts calculation
  const filteredPosts = showOnlyUserPosts ? posts.filter(post => post.author === address) : posts;

  const searchFilteredPosts = filteredPosts.filter(post => {
    const matchesSearch = searchTerm === '' || 
      post.content.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  const sortedPosts = [...searchFilteredPosts].sort((a, b) => {
    if (sortOrder === 'newest') {
      return b.timestamp - a.timestamp;
    } else {
      return a.timestamp - b.timestamp;
    }
  });

  // Dodajemy infinite scroll
  const [displayLimit, setDisplayLimit] = useState(100);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const displayedPosts = expandedPosts ? sortedPosts : sortedPosts.slice(0, displayLimit);

  useEffect(() => {
    if (expandedPosts) return; // Gdy mamy pełny widok, nie korzystamy z infinite scroll
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && sortedPosts.length > displayLimit) {
        setDisplayLimit(prev => prev + 50);
      }
    }, { threshold: 1.0 });

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }
    return () => {
      if (loadMoreTriggerRef.current) {
        observer.unobserve(loadMoreTriggerRef.current);
      }
    };
  }, [displayLimit, sortedPosts, expandedPosts]);

  // Funkcja do obsługi edycji posta
  const handleEditPost = async (postId: string, newContent: string) => {
    if (!address) return;
    
    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        content: newContent,
        lastEdited: serverTimestamp()
      });
      
      // Odśwież posty
      const { posts: updatedPosts } = await fetchPosts({ userId: address });
      setPosts(updatedPosts);
      setEditingPost(null);
      setEditedContent('');
    } catch (error) {
      console.error('Error editing post:', error);
      alert('Wystąpił błąd podczas edycji posta. Spróbuj ponownie.');
    }
  };

  // Funkcja do obsługi edycji komentarza
  const handleEditComment = async (postId: string, commentId: string, newContent: string) => {
    if (!address) return;
    
    try {
      await editComment(postId, commentId, newContent);
      
      // Odśwież posty
      const { posts: updatedPosts } = await fetchPosts({ userId: address });
      setPosts(updatedPosts);
      setEditingComment(null);
      setEditedCommentContent('');
    } catch (error) {
      console.error('Error editing comment:', error);
      alert('An error occurred while editing the comment. Please try again.');
    }
  };

  // Funkcja do obsługi usuwania komentarza
  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!isConnected || !address) return;
    
    try {
      if (confirm('Are you sure you want to delete this comment?')) {
        await deleteComment(postId, commentId, address);
        
        // Odśwież posty
        const { posts: updatedPosts } = await fetchPosts({ userId: address });
        setPosts(updatedPosts);
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('An error occurred while deleting the comment. Please try again.');
    }
  };

  // Dodaj funkcję do obsługi polubienia komentarza
  const handleToggleCommentLike = async (postId: string, commentId: string) => {
    if (!address) return;
    
    try {
      await toggleCommentLike(postId, commentId, address);
      
      // Odśwież posty
      const { posts: updatedPosts } = await fetchPosts({ userId: address });
      setPosts(updatedPosts);
    } catch (error) {
      console.error('Error toggling comment like:', error);
    }
  };

  // Dodaj funkcję obsługi odpowiedzi
  const handleAddReply = async (postId: string, commentId: string) => {
    if (!address || !replyContent.trim() || !canCreatePosts) return;
    
    try {
      await addCommentReply(postId, commentId, {
        author: address,
        content: replyContent.trim()
      });
      
      // Odśwież posty
      const { posts: updatedPosts } = await fetchPosts({ userId: address });
      setPosts(updatedPosts);
      
      // Wyczyść formularz
      setReplyingTo(null);
      setReplyContent('');
    } catch (error) {
      console.error('Error adding reply:', error);
      alert('An error occurred while adding the reply. Please try again.');
    }
  };

  // Dodaj nową funkcję do obliczania i zapisywania BaseChat Points
  const calculateAndSaveBaseChatPoints = async () => {
      if (!address || !isConnected) return;

      try {
      // Oblicz punkty
      const postPoints = userProfile.postCount * 5;
      const likePoints = userProfile.likesReceived;
      const activityBonus = Math.round((postPoints + likePoints) * 0.25);
      const totalBaseChatPoints = Math.round((postPoints + likePoints) * 1.25);

      // Zapisz punkty w Firebase
      const userRef = doc(db, 'users', address);
      await updateDoc(userRef, {
        baseChatPoints: {
          postPoints,
          likePoints,
          activityBonus,
          totalPoints: totalBaseChatPoints,
          lastUpdated: serverTimestamp()
        }
      });

      // Zaktualizuj ranking aktywnych użytkowników
      const usersSnap = await getDocs(collection(db, 'users'));
      const activeUsersData = usersSnap.docs
        .map(doc => {
          const data = doc.data();
          // Zmieniona obsługa lastActive
          const lastActive = data.lastActive ? new Date(data.lastActive).getTime() : Date.now();
          
          return {
            address: doc.id,
            points: data.baseChatPoints?.totalPoints || 0,
            stats: {
              posts: data.postsCount || 0,
              likes: data.likesReceived || 0
            },
            lastActive: lastActive
          };
        })
        .sort((a, b) => b.points - a.points)
        .slice(0, 10);

      setActiveUsers(activeUsersData);
    } catch (error) {
      console.error('Error saving BaseChat points:', error);
    }
  };

  // Dodaj useEffect do aktualizacji punktów
  useEffect(() => {
    if (isConnected && address) {
      calculateAndSaveBaseChatPoints();
    }
  }, [userProfile.postCount, userProfile.likesReceived, isConnected, address]);

  // Dodaj nowe stany dla modalu
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const usersPerPage = 10;

  // Stany dla wyszukiwarki użytkowników
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isBaseChatPointsExpanded, setIsBaseChatPointsExpanded] = useState(true);
  const [isSearchingAll, setIsSearchingAll] = useState(false);

  // Ref dla debounce timer
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Funkcja do wyszukiwania użytkowników z debounce
  const handleUserSearch = useCallback(async (query: string, forceSearchAll: boolean = false) => {
    setUserSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      return;
    }
    
    if (query.length < 2) {
      setSearchResults([]);
      return; // Wyszukuj dopiero od 2 znaków
    }
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Decide whether to search all users
    const searchAll = forceSearchAll || isSearchingAll;
    
    // Set new timeout for debounce (300ms for quick search, 500ms for full search)
    const debounceTime = searchAll ? 500 : 300;
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        const results = await searchUsers(query, 5, searchAll);
        setSearchResults(results);
      } catch (error) {
        console.error('Error searching users:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, debounceTime);
  }, [isSearchingAll]);

  // Funkcja do przełączania trybu wyszukiwania
  const toggleSearchMode = useCallback(() => {
    setIsSearchingAll(!isSearchingAll);
    // Jeśli jest aktywne wyszukiwanie, wyszukaj ponownie w nowym trybie
    if (userSearchQuery.trim() && userSearchQuery.length >= 2) {
      handleUserSearch(userSearchQuery, !isSearchingAll);
    }
  }, [isSearchingAll, userSearchQuery, handleUserSearch]);

  // Funkcja renderująca pusty element listy
  const renderEmptyItem = (index: number) => (
    <div key={`empty-${index}`} className="flex items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all duration-300 opacity-50">
      <div className="w-6 flex-shrink-0">
        <span className="text-[11px] font-bold text-gray-400">
          #{index + 1}
        </span>
      </div>
      <div className="w-8 h-8 flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="flex-1 min-w-0 px-2">
        <div className="flex items-center">
          <span className="text-[11px] font-medium text-gray-400">···</span>
        </div>
        <div className="text-[9px] text-gray-400">
          0 posts · 0 likes
        </div>
      </div>
      <div className="text-[11px] font-semibold text-gray-400">
        0 pts
      </div>
    </div>
  );

  // Modyfikacja renderUserList aby zawsze pokazywał wszystkich użytkowników z paginacją
  const renderUserList = () => {
    if (isLoadingUsers) {
      return [...Array(10)].map((_, index) => renderEmptyItem(index));
    }

    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const usersToDisplay = activeUsers.slice(startIndex, endIndex);
    
    // Wypełnij pozostałe miejsca pustymi elementami
    const items = [...Array(10)].map((_, index) => {
      const user = usersToDisplay[index];
      if (user) {
        return renderUserItem(user, startIndex + index);
      }
      return renderEmptyItem(startIndex + index);
    });

    return items;
  };
        
  // Funkcja renderująca pojedynczy element listy użytkowników
  const renderUserItem = (user: any, index: number) => {
    // Special case for vitalik.eth
    const isVitalik = userNames[user.address]?.name === 'vitalik.eth';
    // Add 5000 points for display if it's vitalik.eth
    const displayPoints = isVitalik ? 5000 : user.points;
    // Sprawdź, czy numer pozycji ma dwie lub więcej cyfr
    const hasLargeRankNumber = (index + 1) >= 10;
    
    return (
    <div key={user.address} className="flex items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all duration-300">
      <div className={`${hasLargeRankNumber ? 'w-8' : 'w-6'} flex-shrink-0`}>
        <span className={`text-[11px] font-bold ${
          index === 0 ? 'text-yellow-500' :
          index === 1 ? 'text-gray-400' :
          index === 2 ? 'text-amber-600' :
          'text-gray-500'
        }`}>
          #{index + 1}
        </span>
      </div>
      <div className="w-8 h-8 flex-shrink-0">
        {userNames[user.address]?.avatar ? (
          <img
            src={userNames[user.address].avatar}
            alt="Profile"
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <Avatar address={toEthereumAddress(user.address)} className="w-8 h-8 rounded-full" />
        )}
      </div>
      <div className="flex-1 min-w-0 px-2">
        <div className="flex items-center">
          <span className={`text-[11px] font-medium truncate ${
            isVitalik
              ? 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-transparent bg-clip-text font-bold'
              : userNames[user.address]?.name?.includes('.base.eth') 
                ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text' 
                : 'text-gray-900 dark:text-white'
          }`}>
            <span>
          {userNames[user.address]?.name?.endsWith('.sphere') ? (
            <>
              <span>{userNames[user.address].name.replace('.sphere', '')}</span>
              <span className="text-blue-500">.sphere</span>
            </>
                     ) : userNames[user.address]?.name?.endsWith('.camper') ? (
             <>
               <span>{userNames[user.address].name.replace('.camper', '')}</span>
               <span className="text-orange-500">.camper🏕️</span>
             </>
           ) : (
            userNames[user.address]?.name || user.address.slice(0, 6) + '...' + user.address.slice(-4)
          )}
        </span>
          </span>
          
          {/* Display Ethereum Founder badge for vitalik.eth */}
          {isVitalik && (
            <span className="inline-flex items-center px-2 py-0.5 ml-2 text-[9px] font-medium rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-white">
              <img 
                src="/ethlogo.png" 
                alt="ETH" 
                className="w-3 h-3 mr-1"
              />
              ETH Founder
            </span>
          )}
        </div>
        <div className="text-[9px] text-gray-500">
          {displayPoints.toLocaleString()} pts
        </div>
      </div>
      <div 
        onTouchStart={() => handleViewBuilderProfile(user.address)} 
        onClick={() => handleViewBuilderProfile(user.address)}
        className="text-[11px] px-2 py-1 rounded-md bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors cursor-pointer"
      >
        View
      </div>
    </div>
  )};

  useEffect(() => {
    const fetchDailyPostCount = async () => {
      if (!isConnected || !address) return;
      try {
        const postsRef = collection(db, 'posts');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const q = query(postsRef, where('author', '==', address), where('timestamp', '>=', Timestamp.fromDate(today)));
        const postsSnap = await getDocs(q);
        setDailyPostCount(postsSnap.size);
      } catch (error) {
        console.error('Error fetching daily post count:', error);
      }
    };
    fetchDailyPostCount();
  }, [address, isConnected]);

  // Funkcja do ręcznego odświeżania licznika dziennych postów
  const resetDailyPostCount = async () => {
    if (!isConnected || !address) return;
    try {
      const postsRef = collection(db, 'posts');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const q = query(postsRef, where('author', '==', address), where('timestamp', '>=', Timestamp.fromDate(today)));
      const postsSnap = await getDocs(q);
      setDailyPostCount(postsSnap.size);
      toast.success('Post limit refreshed!');
    } catch (error) {
      console.error('Error refreshing daily post count:', error);
      toast.error('Failed to refresh post limit');
    }
  };

  const handleGenerateAIPost = async () => {
    if (!aiPrompt.trim() || !address || isGeneratingAI) return;
    
    try {
      setIsGeneratingAI(true);
      console.log('Starting AI post generation...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://basebook.vercel.app',
            'X-Title': 'BaseBook',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: "deepseek/deepseek-r1:free",
            messages: [
              {
                role: "system",
                content: activePostingNetwork === 'basecamp' 
                  ? "You are an assistant who generates engaging social media posts related to the Camp Network ecosystem. Your posts should be informative, but also friendly and encouraging interaction. Focus on community building, innovation, and the unique features of Camp Network."
                  : "You are an assistant who generates engaging social media posts related to the Base blockchain ecosystem. Your posts should be informative, but also friendly and encouraging interaction."
              },
              {
                role: "user",
                content: aiPrompt
              }
            ],
            temperature: 1,
            top_p: 1,
            repetition_penalty: 1
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log('Received API response, status:', response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('API Error:', errorData);
          throw new Error(errorData.error || `Error while generating post (${response.status})`);
        }

        const data = await response.json();
        console.log('Received data:', data);

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          console.error('Invalid response structure:', data);
          throw new Error('Invalid API response');
        }

        const generatedPost = data.choices[0].message.content;
        console.log('Post generated:', generatedPost);

        // Check which network is active and set appropriate content
        if (activePostingNetwork === 'basecamp') {
          setAiGeneratedContentForCamp(generatedPost);
        } else {
          setNewPost(generatedPost);
        }
        
        setShowAIModal(false);
        setAiPrompt('');
        
      } catch (fetchError: unknown) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timeout exceeded');
        }
        throw fetchError;
      }

    } catch (error: unknown) {
      console.error('Error generating AI post:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`An error occurred while generating the post: ${errorMessage}`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Efekt uruchamiany przy montowaniu komponentu
  useEffect(() => {
    if (!isMounted) {
      setIsMounted(true);
      // Usunięto automatyczne wykonanie funkcji naprawiających strukturę baseChatPoints i dodających bonus BaseName
    }
  }, [isMounted]);

  // Wykrywanie urządzeń Apple i naprawianie vh
  useEffect(() => {
    // Wykrywanie urządzeń Apple
    const userAgent = navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|macintosh|mac os x/.test(userAgent) && !('MSStream' in window);
    setIsAppleDevice(isApple);
    
    // Naprawianie problemu z vh na iOS
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      setViewportHeight(window.innerHeight);
    };
    
    setVh();
    window.addEventListener('resize', setVh);
    
    // Dodanie styli CSS dla urządzeń Apple
    if (isApple) {
      const styleElement = document.createElement('style');
      styleElement.innerHTML = `
        .modal-open {
          overflow: hidden;
          position: fixed;
          width: 100%;
          height: 100%;
        }
        .apple-touch-scroll {
          -webkit-overflow-scrolling: touch;
        }
        .apple-performance {
          will-change: transform;
          transform: translateZ(0);
        }
        .full-height {
          height: calc(var(--vh, 1vh) * 100);
        }
        .reduce-animation {
          animation-duration: 0.5s !important;
          transition-duration: 0.3s !important;
        }
      `;
      document.head.appendChild(styleElement);
    }
    
    return () => {
      window.removeEventListener('resize', setVh);
    };
  }, []);

  // Blokowanie przewijania gdy modal jest otwarty
  useEffect(() => {
    if (showShareModal || showPostDialog || showSettingsModal || showProfileModal || showGroupModal || showPostImagePreview) {
      document.body.classList.add('modal-open');
      
      // Dodatkowa obsługa dla iOS aby zapobiec przewijaniu w tle
      if (isAppleDevice) {
        const preventScroll = (e: TouchEvent) => {
          if (e.target && e.target instanceof Element && !e.target.closest('.apple-touch-scroll')) {
            e.preventDefault();
          }
        };
        document.addEventListener('touchmove', preventScroll, { passive: false });
        return () => {
          document.removeEventListener('touchmove', preventScroll);
          document.body.classList.remove('modal-open');
        };
      }
    } else {
      document.body.classList.remove('modal-open');
    }
  }, [showShareModal, showPostDialog, showSettingsModal, showProfileModal, showGroupModal, showPostImagePreview, isAppleDevice]);

  // Jeśli komponent nie jest zamontowany, zwracamy pusty div
  if (!isMounted) {
    return <div></div>;
  }

  // Funkcja do ładowania profilu użytkownika i przełączenia panelu
  const handleViewBuilderProfile = async (userAddress: string) => {
    if (!userAddress) return;
    
    try {
      // Pobierz profil z Firebase
      const profile = await fetchUserProfile(userAddress, { loadSocialLinks: true });
      
      if (profile) {
        // Pobierz dodatkowe dane o użytkowniku z referencji
        const userRef = doc(db, 'users', userAddress);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data();
        
        // Ustaw wybrany profil
        setSelectedBuilderProfile({
          address: userAddress,
          name: userNames[userAddress]?.name || profile.name || `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`,
          avatar: userNames[userAddress]?.avatar || profile.avatar,
          bio: profile.bio,
          postCount: profile.postsCount || 0,
          likesReceived: profile.likesReceived || 0,
          socialLinks: profile.socialLinks,
          stats: userData?.stats as {
            transactions: number;
            tokens: number;
            nfts: number;
            contracts: number;
          },
          totalPoints: userData?.totalPoints as number,
          currentRank: userData?.currentRank as UserRank
        });
        
        // Przełącz panel
        setActiveMainPanel('builders');
        
        // Na telefonach, ustaw główny widok na środkowy panel i przełącz z Trends na główny panel
        if (window.innerWidth < 1024) {
          // Przełącz na główny panel
          setActiveMobilePanel('main');
          
          // Automatyczne przewijanie do widoku builder profile
          setTimeout(() => {
            const builderSection = document.querySelector('.builder-profile-container');
            if (builderSection) {
              builderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error('Error loading builder profile:', error);
    }
  };

  // Funkcja do powrotu do panelu feed
  const handleBackToFeed = () => {
    setActiveMainPanel('feed');
    setSelectedBuilderProfile(null);
    // Resetowanie tooltipów
    setHoveredElement(null);
    setHoveredUser(null);
  };

  // Na początku pliku po inicjalizacji wszystkich stanów, dodajmy funkcję refreshPosts i zmienną today
  const today = new Date().toISOString().split('T')[0];

  // Funkcja do odświeżania postów
  const refreshPosts = async () => {
    if (onRefreshPosts) {
      await onRefreshPosts();
    }
  };

  return (
    <FarcasterFrameProvider>
      <BanPage>
        <Script src="https://widgets.coingecko.com/gecko-coin-price-marquee-widget.js" />
        <div className="min-h-screen relative">
          {/* Prosty gradient w tle zamiast skomplikowanych efektów */}
          <div className="fixed inset-0 bg-[#050B20] z-0">
            {/* Usuwamy wszystkie skomplikowane tła i efekty */}
            <div className="fixed inset-0 bg-gradient-to-b from-[#050B20] via-[#071030] to-[#050B20] z-0"></div>
          </div>

          {/* Dodajemy klasę reduce-animation do elementów z animacjami dla urządzeń Apple */}
          <div className={`relative z-10 ${isAppleDevice ? 'reduce-animation' : ''}`}>
            {/* Widgets */}
            <div className="w-full space-y-1">
              <div className="w-full bg-white/[.02] backdrop-blur-sm py-1">
                <gecko-coin-price-marquee-widget 
                  locale="en" 
                  outlined="true"
                  coin-ids="bitcoin,ethereum,binancecoin,ripple,cardano,solana,polkadot,dogecoin" 
                  initial-currency="usd"
                />
              </div>
              <div className="w-full bg-white/[.02] backdrop-blur-sm py-1">
                <gecko-coin-price-marquee-widget 
                  locale="en" 
                  outlined="true"
                  coin-ids="official-trump,american-coin,maga,ondo-finance,fartcoin,department-of-government-efficiency,ai16z,dogelon-mars,jupiter-exchange-solana,dogecoin,griffain,virtual-protocol,aixbt" 
                  initial-currency="usd"
                />
              </div>
            </div>

            {/* Main content with panels */}
            <div className="flex h-screen overflow-hidden">
              {/* Left panel (Profile & Stats) */}
              <div className={`${
                activeMobilePanel === 'left' ? 'fixed inset-0 z-30 pt-[120px] pb-24' : 'hidden'
              } lg:block lg:relative lg:w-[380px] lg:pt-0 lg:pb-0 bg-white dark:bg-gray-800 overflow-y-auto p-4`}>
                <div className="mb-8">
                  {isConnected ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                        {/* Rank section moved and centered */}
                        <div className="text-center mb-4">
                          <div className="text-2xl font-bold bg-gradient-to-r from-purple-500 via-blue-500 to-green-500 text-transparent bg-clip-text static-gradient">
                            {currentRank}
                          </div>
                          <div className="text-sm text-gray-500 mt-1">{RANK_DESCRIPTIONS[currentRank]}</div>
              </div>

                        {isConnected && userProfile && (
                          <div className="mb-6">
                            <div className="relative group">
                              <input
                                type="file"
                                ref={fileInputRef}
                                onChange={async (e) => {
                                  if (!e.target.files || !e.target.files[0] || !address) return;
                                  
                                  const file = e.target.files[0];
                                  
                                  // Sprawdź rozmiar pliku (max 1MB)
                                  if (file.size > 1024 * 1024) {
                                    setModalMessage('Maximum file size is 1MB');
                                    setModalType('error');
                                    setShowModal(true);
                                    return;
      }

                                  // Sprawdź czy można zmienić zdjęcie
                                  const userRef = doc(db, 'users', address);
                                  const userDoc = await getDoc(userRef);
                                  const userData = userDoc.data();

                                  if (userData?.lastImageUpdate) {
                                    const lastUpdate = userData.lastImageUpdate.toDate();
                                    const oneMonthAgo = new Date();
                                    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                                    
                                    if (lastUpdate > oneMonthAgo) {
                                      const timeToWait = new Date(lastUpdate.getTime() + 30 * 24 * 60 * 60 * 1000);
                                      const now = new Date();
                                      const diff = timeToWait.getTime() - now.getTime();
                                      
                                      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                                      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                      
                                      setModalMessage(`You can change your profile picture once a month.\nTime remaining: ${days} days and ${hours} hours`);
                                      setModalType('warning');
                                      setShowModal(true);
                                      return;
                                    }
                                  }

                                  setSelectedFile(file);
                                  setModalMessage('Are you sure you want to change your profile picture?\nNext change will be possible in one month.\nMaximum file size: 1MB');
                                  setModalType('confirm');
                                  setShowModal(true);
                    }}
                                accept="image/*"
                                className="hidden"
                              />
                              <div 
                                className="relative w-32 h-32 mx-auto mb-4 cursor-pointer group"
                                onClick={() => fileInputRef.current?.click()}
                  >
                                {previewImage || userProfile.avatar ? (
                                  <img
                                    src={previewImage || userProfile.avatar}
                                    alt="Profile"
                                    className="w-32 h-32 rounded-full object-cover border-4 border-blue-500 group-hover:opacity-80 transition-opacity"
                                  />
                                ) : (
                                  <Avatar address={address} className="w-32 h-32 rounded-full border-4 border-blue-500 group-hover:opacity-80 transition-opacity" />
                                )}
                                <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-white text-sm">
                                    {isUploading ? 'Uploading...' : 'Change Picture'}
                            </span>
                  </div>
                  </div>
                </div>
                            {/* Reszta profilu */}
              </div>
              )}

                          <div className="text-center">
                            {isEditingName ? (
                              <div className="space-y-3">
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="text"
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    placeholder="Enter username"
                                    className="px-2 py-1 border rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 flex-1"
                                  />
                                  <span className="text-sm text-gray-500">.</span>
                                  <select
                                    value={selectedSuffix}
                                    onChange={(e) => setSelectedSuffix(e.target.value as 'sphere' | 'camper')}
                                    className="px-2 py-1 border rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                                  >
                                    <option value="sphere">sphere</option>
                                    <option value="camper">camper (+500 pts!)</option>
                                  </select>
                                </div>
                                <div className="text-xs text-center text-gray-500">
                                  Preview: {customName || 'username'}.
                                  <span className={selectedSuffix === 'sphere' ? 'text-blue-500' : 'text-orange-500'}>
                                    {selectedSuffix}
                                  </span>
                                  {selectedSuffix === 'camper' && <span className="text-orange-600 ml-1">🏕️ +500 Base Points!</span>}
                                </div>
                                <div className="flex justify-center space-x-2">
                        <button
                                    onClick={handleSaveCustomName}
                                    className="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
                        >
                                    Save
                        </button>
                        <button
                                    onClick={() => {
                                      setIsEditingName(false);
                                      setCustomName('');
                                      setSelectedSuffix('sphere');
                                    }}
                                    className="px-3 py-1 bg-gray-500 text-white rounded-lg text-sm hover:bg-gray-600"
                        >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center space-x-2">
                                <span className={`${isBaseName(userProfile.name) ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text font-bold animate-pulse' : 'text-gray-900 dark:text-white'}`}>
                                  {userProfile.name.endsWith('.sphere') ? (
                                    <>
                                      <span className="text-gray-900 dark:text-white">{userProfile.name.replace('.sphere', '')}</span>
                                      <span className="text-blue-500">.sphere</span>
                                    </>
                                                     ) : userProfile.name.endsWith('.camper') ? (
                     <>
                       <span className="text-gray-900 dark:text-white">{userProfile.name.replace('.camper', '')}</span>
                       <span className="text-orange-500">.camper🏕️</span>
                     </>
                   ) : (
                                    userProfile.name
                                  )}
                                </span>
                                {!baseName && (
                                  <button
                                    onClick={() => setIsEditingName(true)}
                                    className="text-sm text-blue-500 hover:text-blue-600"
                                  >
                                    ✏️
                        </button>
                      )}
                    </div>
                            )}
                            <div className="text-sm text-gray-500 break-all mt-2">
                              <Address address={address} />
                              {address && (
                                <ProfileSocials 
                                  address={address}
                                  initialLinks={userProfile.socialLinks}
                                  lazyLoad={false} // User's own profile, load immediately
                                  isOwner={true}
                                  onSave={(newLinks) => {
                                    console.log("Updating userProfile with new social links:", newLinks);
                                    setUserProfile(prev => ({
                                      ...prev,
                                      socialLinks: newLinks
                                    }));
                                  }}
                                />
                              )}
                            </div>
              </div>
            </div>

                      {/* YapYap Integration - moved outside About Me */}
                      {address && (
                        <div className="mb-4">
                          <div className="bg-white dark:bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                            <YapsMetrics address={address} />
                            <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-center">
                              <div className="flex items-center">
                                <div className="text-xs text-gray-400 mr-1">Powered by</div>
                                <div className="text-xs font-medium text-blue-600 flex items-center">
                                  <svg className="w-4 h-4 mx-1" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="12" r="10" fill="currentColor" />
                                    <path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                  </svg>
                                  Kaito.ai
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bio Section - Moved and restyled */}
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl mt-4">
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center space-x-2">
                            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <div className="text-lg font-semibold bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text">About Me</div>
                          </div>
                          <button
                            onClick={async () => {
                              if (!address) return;
                              
                              // Sprawdź ostatnią edycję bio
                              const userRef = doc(db, 'users', address);
                              const userDoc = await getDoc(userRef);
                              const lastBioUpdate = userDoc.data()?.lastBioUpdate?.toDate() || new Date(0);
                              const now = new Date();
                              
                              // Sprawdź czy minęło 24h od ostatniej edycji
                              if (now.getTime() - lastBioUpdate.getTime() < 24 * 60 * 60 * 1000) {
                                const nextUpdate = new Date(lastBioUpdate.getTime() + 24 * 60 * 60 * 1000);
                                const hoursLeft = Math.ceil((nextUpdate.getTime() - now.getTime()) / (1000 * 60 * 60));
                                alert(`You can edit your bio once per day. ${hoursLeft} hours remaining.`);
                                return;
                              }

                              const newBio = prompt('Enter your bio (max 90 characters):', userProfile.bio);
                              if (newBio && newBio.length <= 90) {
                                await updateDoc(userRef, { 
                                  bio: newBio,
                                  lastBioUpdate: serverTimestamp()
                                });
                                setUserProfile(prev => ({ ...prev, bio: newBio }));
                              }
                            }}
                            className="flex items-center space-x-1 text-sm text-blue-500 hover:text-blue-600 transition-colors duration-200"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Edit</span>
                          </button>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-inner">
                          <div className="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {userProfile.bio || 
                              <span className="text-gray-400 italic flex items-center justify-center space-x-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Click Edit to add your bio</span>
                              </span>
                            }
                          </div>
                        </div>
                      </div>

                      {/* Stats Grid - Network Activity */}
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
                          <div className="text-blue-500 text-2xl font-bold">{stats.transactions}</div>
                          <div className="text-sm text-gray-500">Transactions</div>
                          <div className="text-xs text-gray-400">{stats.transactionPoints} points</div>
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
                          <div className="text-green-500 text-2xl font-bold">{stats.tokens}</div>
                          <div className="text-sm text-gray-500">Tokens</div>
                          <div className="text-xs text-gray-400">{stats.tokenPoints} points</div>
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
                          <div className="text-purple-500 text-2xl font-bold">{stats.nfts}</div>
                          <div className="text-sm text-gray-500">NFTs</div>
                          <div className="text-xs text-gray-400">{stats.nftPoints} points</div>
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
                          <div className="text-yellow-500 text-2xl font-bold">{stats.contracts}</div>
                          <div className="text-sm text-gray-500">Contracts</div>
                          <div className="text-xs text-gray-400">{stats.contractPoints} points</div>
                        </div>
                      </div>

                      {/* Stats Grid - Posts and Likes */}
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
                          <div className="text-blue-500 text-2xl font-bold">{userProfile.postCount}</div>
                          <div className="text-sm text-gray-500">Posts</div>
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
                          <div className="text-pink-500 text-2xl font-bold">{userProfile.likesReceived}</div>
                          <div className="text-sm text-gray-500">Likes Received</div>
                        </div>
                      </div>

                      {/* Total Points Section */}
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl mt-4">
                        <div className="flex justify-between items-center mb-4">
                          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                            Total Points
                          </div>
                          <div className="text-2xl font-bold text-indigo-500">
                            {stats.transactionPoints + stats.tokenPoints + stats.nftPoints + stats.contractPoints}
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Current Rank:</span>
                            <span className="text-green-500 font-semibold">{currentRank}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Next Rank:</span>
                            <span className="text-blue-500 font-semibold">{nextRank}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Progress:</span>
                            <span className="text-purple-500 font-semibold">{Math.round(progress)}%</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Badges Earned:</span>
                            <span className="text-orange-500 font-semibold">
                              {BADGES.filter(badge => badge.condition({
                                totalPoints: stats.transactionPoints + stats.tokenPoints + stats.nftPoints + stats.contractPoints,
                                rank: currentRank,
                                percentile: 0,
                                breakdown: {
                                  transactionPoints: stats.transactionPoints,
                                  tokenPoints: stats.tokenPoints,
                                  nftPoints: stats.nftPoints,
                                  uniqueContractPoints: stats.contractPoints
                                },
                                stats: {
                                  transactions: stats.transactions,
                                  tokens: stats.tokens,
                                  nfts: stats.nfts,
                                  contracts: stats.contracts
                                }
                              })).length}/24
                            </span>
                          </div>
                        </div>

                        <div className="relative pt-1">
                          <div className="overflow-hidden h-2 mb-1 text-xs flex rounded bg-gray-200 dark:bg-gray-600">
        <div 
                              style={{ width: `${progress}%` }}
                              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                            ></div>
                          </div>
                        </div>

                        <div className="mt-4 text-xs text-gray-500 text-center">
                          {RANK_DESCRIPTIONS[currentRank]}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    Connect wallet to view profile
                  </div>
          )}
              </div>
            </div>

            {/* Middle panel (Feed) */}
            <div className={`flex-1 p-4 overflow-y-auto ${
              activeMobilePanel === 'main' ? 'block w-full' : 'hidden lg:block'
            }`}>
              {/* Combined search and post switcher section */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm mb-4">
                {/* Search row */}
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Search posts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  {/* Filters row */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowOnlyUserPosts(false);
                        setSelectedTag('');
                        setSelectedAuthor('');
                        setActiveMainPanel('feed');
                      }}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium ${!showOnlyUserPosts && activeMainPanel === 'feed' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                    >
                      All Posts
                    </button>
                    <button
                      onClick={() => {
                        setShowOnlyUserPosts(true);
                        setSelectedTag('');
                        setSelectedAuthor('');
                        setActiveMainPanel('feed');
                      }}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium ${showOnlyUserPosts && activeMainPanel === 'feed' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                    >
                      My Posts
                    </button>
                    <button
                      onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
                      className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                    >
                      {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
                    </button>
                    <button
                      onClick={() => {
                        if (address) {
                          handleViewBuilderProfile(address);
                        } else {
                          toast.error('Connect your wallet to view builder profiles');
                        }
                      }}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium ${
                        activeMainPanel === 'builders' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      } flex items-center justify-center`}
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      Builders
                    </button>
                  </div>
                </div>
              </div>

              {/* Network Filter tabs */}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setActivePostingNetwork('base')}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium ${activePostingNetwork === 'base' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'} flex items-center justify-center`}
                >
                  <img 
                    src="/brand-kit/base/logo/symbol/Base_Symbol_Blue.png"
                    alt="Base"
                    className="w-4 h-4 mr-1.5 bg-white rounded-full p-0.5"
                  />
                  Base Post
                </button>
                <button
                  onClick={() => setActivePostingNetwork('basecamp')}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium ${activePostingNetwork === 'basecamp' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'} flex items-center justify-center`}
                >
                  <svg 
                    className="w-4 h-4 mr-1.5"
                    viewBox="0 0 600 600"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M300 0C134.3 0 0 134.3 0 300s134.3 300 300 300 300-134.3 300-300S465.7 0 300 0z" fill="#000"/>
                    <path d="M300 100c-110.5 0-200 89.5-200 200s89.5 200 200 200 200-89.5 200-200-89.5-200-200-200z" fill="#fff"/>
                    <path d="M330 190c0 0-30 40-10 80 20 40 20 90-20 120 0 0 70-30 70-100 0-70-40-100-40-100z" fill="#FF6B00"/>
                    <path d="M270 230c0 0-20 30-10 60 10 30 10 60-30 80 0 0 60-10 60-60 0-50-20-80-20-80z" fill="#FF6B00"/>
                  </svg>
                  Camp Network Post
                </button>
              </div>

              {/* Dodaj warunek wyświetlania panelu Builders lub feed */}
              {activeMainPanel === 'builders' ? (
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg mb-4 overflow-hidden border border-blue-100 dark:border-blue-900">
                  {/* Builder Profile Content */}
                  {selectedBuilderProfile ? (
                    <BuilderProfile 
                      userAddress={selectedBuilderProfile.address}
                      currentUserAddress={address}
                      profile={selectedBuilderProfile}
                      onBackToFeed={handleBackToFeed}
                      onSocialLinksUpdate={(newLinks) => {
                        setSelectedBuilderProfile(prev => ({
                          ...prev!,
                          socialLinks: newLinks
                        }));
                      }}
                    />
                  ) : (
                    <div className="p-6 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 mb-4">
                        <svg className="w-8 h-8 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                      <p className="text-gray-500 dark:text-gray-400">Loading builder profile...</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* New post creation */}
                  {isConnected ? (
                    <>
                      {canCreatePosts ? (
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow mb-6">
                          {/* Show Base post form conditionally */}
                          {activePostingNetwork === 'base' && (
                            <>
                          <div className="flex items-center space-x-3 mb-4">
                            {userProfile.avatar ? (
                              <img
                                src={userProfile.avatar}
                                alt="Profile"
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <Avatar address={address} className="w-10 h-10 rounded-full" />
                            )}
                            <div className="flex-1">
                              <textarea
                                value={newPost}
                                onChange={(e) => setNewPost(e.target.value)}
                                placeholder="What's happening on Base?"
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                rows={3}
                              />
                            </div>
                          </div>

                          {/* Media preview in post */}
                          {(postPreviewImage || postPreviewVideo) && (
                            <div className="mb-4 relative">
                              {postPreviewImage ? (
                                <img
                                  src={postPreviewImage}
                                  alt="Preview"
                                  className="max-h-60 rounded-lg object-cover"
                                />
                              ) : postPreviewVideo && (
                                <video
                                  src={postPreviewVideo}
                                  className="max-h-60 rounded-lg w-full"
                                  controls
                                >
                                  Your browser does not support video playback.
                                </video>
                              )}
                              <button
                                onClick={() => {
                                  setPostPreviewImage(null);
                                  setPostPreviewVideo(null);
                                }}
                                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                              {uploadProgress > 0 && uploadProgress < 100 && (
                                <div className="absolute bottom-2 left-2 right-2 bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 sm:space-x-4">
                              <button 
                                onClick={() => document.getElementById('fileInput')?.click()}
                                className="flex items-center space-x-1 sm:space-x-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs sm:text-sm"
                              >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span className="hidden xs:inline">Add photo/video</span>
                                <span className="inline xs:hidden">Photo</span>
                              </button>

                              <button
                                onClick={() => setShowAIModal(true)}
                                className="flex items-center space-x-1 sm:space-x-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs sm:text-sm"
                              >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <span className="hidden xs:inline">Generate AI Post</span>
                                <span className="inline xs:hidden">AI</span>
                              </button>
                            </div>
                            
                            <div className="flex space-x-2">
                            <button 
                              onClick={handleCreatePost}
                                    disabled={!newPost.trim() || isCreatingPost || (chainId !== base.id && chainId !== baseSepolia.id)} 
                              className={`px-3 py-0.5 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center justify-center h-[32px] ${ 
                                      (!newPost.trim() || isCreatingPost || (chainId !== base.id && chainId !== baseSepolia.id))
                                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                    : 'bg-white text-[#0052FF] border border-[#0052FF]'
                              }`}
                            >
                              {isCreatingPost ? (
                                <>
                                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-[#0052FF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span className="leading-tight">Creating...</span>
                                </>                                  
                              ) : (
                                  <>
                                    <img 
                                      src="/android-chrome-512x512.png"
                                      alt="Sphere"
                                      className="w-4 h-4 mr-1.5"
                                    />
                                    <span className="leading-tight">PostCoin</span>
                                  </>
                              )}
                            </button>
                              
                              <TransactionButton 
                                content={newPost}
                                onTransactionSuccess={handleTransactionSuccess}
                                disabled={!newPost.trim() || isCreatingPost}
                                autoPost={true}
                              />
                            </div>
                          </div>
                          <input
                            id="fileInput"
                            type="file"
                            accept="image/*,video/*"
                            onChange={handlePostFileSelect}
                            className="hidden"
                          />
                            </>
                          )}

                          {/* Add BaseCamp post form conditionally */}
                          {activePostingNetwork === 'basecamp' && (
                            <div>
                              <CreatePostBaseCamp 
                                onPostCreated={refreshPosts} 
                                setShowAIModal={setShowAIModal}
                                aiGeneratedContent={aiGeneratedContentForCamp}
                                onAiContentUsed={() => setAiGeneratedContentForCamp('')}
                              />
                              <ClaimPortalBanner />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-white rounded-xl p-6 text-center shadow-lg mb-6 border border-[#0052FF]/20 relative overflow-hidden">
                          {/* Usuwam linię z matrix-code.png i zastępuję ją gradientem */}
                          <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/40"></div>
                          <div className="relative z-10">
                            <div className="text-xl font-['Share_Tech_Mono'] text-[#0052FF] mb-3 tracking-[0.2em] animate-glitch">
                              {'>'} SYSTEM_BASECHAT_DETECTED
                            </div>
                            
                            <div className="font-['Share_Tech_Mono'] text-[#0052FF]/80 mb-4 tracking-[0.15em] text-base typewriter">
                              {'>'} INITIALIZING_ONCHAIN_PROTOCOL
                              <span className="animate-blink ml-1">_</span>
                            </div>

                            <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#0052FF] to-transparent mb-4 animate-scan"></div>

                            <div className="font-['Share_Tech_Mono'] text-[#0052FF] mb-4 tracking-[0.15em] text-lg animate-glitch-2">
                              {'>'} BRING_NEW_PEOPLE_ONCHAIN
                            </div>

                            <div className="flex justify-center mb-4">
                              <div className="w-16 h-px bg-[#0052FF]/50"></div>
                            </div>

                            <div className="font-['Share_Tech_Mono'] text-[#0052FF]/80 mb-4 tracking-[0.15em] text-base">
                              {'>'} BASENAME_REQUIRED
                              <span className="animate-blink ml-1">_</span>
                            </div>

                            <a href="https://www.base.org/names" target="_blank" rel="noopener noreferrer" 
                              className="inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-[#0052FF] to-[#0040CC] text-white text-sm font-medium rounded-full transition-all duration-200 transform hover:scale-[1.02] shadow-[0_8px_16px_-3px_rgba(0,82,255,0.5)] hover:shadow-[0_12px_20px_-3px_rgba(0,82,255,0.6)] relative overflow-hidden group">
                              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0"></div>
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                              Claim Basename
                              <span className="ml-2 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 text-xs px-1.5 py-0.5 rounded-full font-bold">NEW</span>
                            </a>
                          </div>
                    </div>
                  )}

                      {/* Tutaj zastępuję kod wyświetlający posty komponentem PostList */}
                      <PostList 
                        showOnlyUserPosts={showOnlyUserPosts}
                        searchTerm={searchTerm}
                        sortOrder={sortOrder}
                        selectedTag={selectedTag}
                        selectedAuthor={selectedAuthor}
                        onRefreshPosts={onRefreshPosts}
                        displayUserName={displayUserName}
                        userNames={userNames}
                        posts={posts} // Dodajemy przekazywanie postów jako prop
                        isLoading={isLoadingPosts} // Przekaż stan ładowania do PostList
                      />
                                </>
                              ) : (
                    <div className="relative rounded-xl overflow-hidden shadow-xl">
                      {/* Animated gradient border */}
                      <div className="absolute -z-10 inset-0 bg-gradient-to-r from-blue-500 via-indigo-600 to-blue-400 animate-gradient-x"></div>
                      
                      {/* Inner content with background */}
                      <div className="m-[2px] bg-gradient-to-br from-black via-gray-900 to-blue-900 rounded-xl p-2 pt-1 shadow-inner">
                        {/* Logo with custom styling to avoid background issues */}
                        <div className="flex justify-center mt-2 mb-3 overflow-hidden">
                          <div className="relative w-[300px] h-[120px] overflow-hidden">
                            <img 
                              src="/frame-v2.png" 
                              alt="Logo" 
                              className="w-full h-full object-contain"
                              style={{
                                filter: 'brightness(1.1) contrast(1.1)',
                                mixBlendMode: 'lighten'
                              }}
                            />
                          </div>
                        </div>
                        
                        <div className="text-gray-200 mb-3 max-w-md mx-auto">
                          <p className="mb-3 text-center">
                            Welcome to our decentralized social platform! Connect your wallet to unlock all features:
                          </p>
                          <ul className="text-left space-y-2 mb-3">
                            <li className="flex items-start">
                              <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Create and share posts with the Base community</span>
                            </li>
                            <li className="flex items-start">
                              <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Engage with other users through likes and comments</span>
                            </li>
                            <li className="flex items-start">
                              <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Build your profile and track your on-chain activity</span>
                            </li>
                            <li className="flex items-start">
                              <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Earn points and climb the community leaderboard</span>
                            </li>
                          </ul>
                        </div>
                        
                        <div className="flex justify-center mb-2">
                          <div className="transform hover:scale-105 transition-transform duration-300">
                            <ConnectWallet />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right panel (Trends & Global Statistics) */}
            <div className={`${
              activeMobilePanel === 'right' ? 'fixed inset-0 z-30 pt-[120px] pb-24' : 'hidden'
            } lg:block lg:relative lg:w-[380px] lg:pt-0 lg:pb-0 bg-white dark:bg-gray-800 overflow-y-auto p-4`}>
              {/* Global Statistics */}
              <div className="mb-4">
                <h2 className="text-lg font-semibold mb-3 bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text flex items-center">
                    Global Statistics
                    <div className="ml-2 text-2xl">🔥</div>
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
                    <div className="text-green-500 text-2xl font-bold">{totalUsers}</div>
                    <div className="text-sm text-gray-500">Users</div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
                    <div className="text-pink-500 text-2xl font-bold">{totalLikes}</div>
                    <div className="text-sm text-gray-500">Likes</div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
                    <div className="text-blue-500 text-2xl font-bold">{totalPosts}</div>
                    <div className="text-sm text-gray-500">Posts</div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
                    <div className="text-purple-500 text-2xl font-bold">{totalComments}</div>
                    <div className="text-sm text-gray-500">Comments</div>
                  </div>
                </div>
              </div>

              {/* BaseChat Points - Collapsible */}
              {isConnected && (
                <div className="mb-6 bg-gray-50 dark:bg-gray-700 rounded-xl p-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 static-gradient"></div>
                  
                  <button
                    onClick={() => setIsBaseChatPointsExpanded(!isBaseChatPointsExpanded)}
                    className="w-full flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-600 p-2 rounded-lg transition-all duration-300"
                  >
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                      BaseChat Points
                      <div className="ml-2 text-3xl animate-bounce">⚡</div>
                    </h2>
                    {isBaseChatPointsExpanded ? (
                      <ChevronUpIcon className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                    )}
                  </button>

                  {isBaseChatPointsExpanded && (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center justify-between group transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-600 p-2 rounded-lg">
                        <span className="text-gray-500 flex items-center">
                          <svg className="w-4 h-4 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Posts
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-400">{userProfile.postCount} × 5</span>
                          <span className="text-blue-500 font-semibold">{userProfile.postCount * 5}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between group transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-600 p-2 rounded-lg">
                        <span className="text-gray-500 flex items-center">
                          <svg className="w-4 h-4 mr-2 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                          Likes Received
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-400">{userProfile.likesReceived} × 1</span>
                          <span className="text-pink-500 font-semibold">{userProfile.likesReceived}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between group transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-600 p-2 rounded-lg">
                        <span className="text-gray-500 flex items-center">
                          <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Activity Bonus
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-400">+25%</span>
                          <span className="text-purple-500 font-semibold">
                            {Math.round((userProfile.postCount * 5 + userProfile.likesReceived) * 0.25)}
                          </span>
                        </div>
                      </div>

                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-10 rounded-lg"></div>
                        <div className="flex items-center justify-between p-3 relative">
                          <span className="text-gray-700 dark:text-gray-300 font-bold">Total Score</span>
                          <div className="flex items-center">
                            <div className="text-2xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text animate-pulse">
                              {Math.round((userProfile.postCount * 5 + userProfile.likesReceived) * 1.25)}
                            </div>
                            <div className="ml-2 text-lg">✨</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 text-sm text-gray-400">
                        <div className="p-3 bg-gray-100 dark:bg-gray-600 rounded-lg">
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
                          <div className="mt-2 text-xs italic text-gray-500">Building the Base community together!</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* User Search */}
              <div className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-transparent bg-clip-text flex items-center">
                    Search Users
                    <div className="ml-2 text-2xl">🔍</div>
                  </h2>
                  
                  <button
                    onClick={toggleSearchMode}
                    className={`px-3 py-1 text-xs rounded-full transition-all duration-300 ${
                      isSearchingAll
                        ? 'bg-orange-500 text-white hover:bg-orange-600'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                    }`}
                  >
                    {isSearchingAll ? '🌐 All Users' : '⚡ Quick Search'}
                  </button>
                </div>
                
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => handleUserSearch(e.target.value)}
                    placeholder={isSearchingAll 
                      ? "Searching all 12k+ users..." 
                      : "Search by address, .eth, .sphere, .camper..."
                    }
                    className={`w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 ${
                      isSearchingAll 
                        ? 'focus:ring-orange-500 border-orange-200 dark:border-orange-600' 
                        : 'focus:ring-purple-500'
                    }`}
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <RefreshCw className={`w-4 h-4 animate-spin ${isSearchingAll ? 'text-orange-500' : 'text-purple-500'}`} />
                    </div>
                  )}
                </div>
                
                {/* Search Mode Info */}
                <div className="mt-2 text-xs text-gray-500 flex items-center">
                  {isSearchingAll ? (
                    <>
                      <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                      Searching all Firebase users (may take longer)
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                      Quick search in top 1000 active users
                    </>
                  )}
                </div>

                                 {/* Search Results */}
                 {userSearchQuery && (
                   <div className="mt-4 space-y-2">
                     {searchResults.length > 0 ? (
                       <>
                         {/* Results Header */}
                         <div className="flex items-center justify-between px-2 py-1">
                           <div className="text-xs text-gray-500">
                             Found {searchResults.length} user{searchResults.length !== 1 ? 's' : ''}
                           </div>
                           <div className="text-xs text-gray-400">
                             {isSearchingAll ? '🌐 All users' : '⚡ Top 1k'}
                           </div>
                         </div>
                         
                         {/* Results List */}
                         {searchResults.map((user, index) => (
                           <button
                             key={user.address}
                             onClick={() => handleViewBuilderProfile(user.address)}
                             className={`w-full flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-300 group border-l-4 ${
                               isSearchingAll 
                                 ? 'border-orange-300 hover:border-orange-500' 
                                 : 'border-purple-300 hover:border-purple-500'
                             }`}
                           >
                             <div className="w-10 h-10 flex-shrink-0">
                               {user.avatar ? (
                                 <img
                                   src={user.avatar}
                                   alt="Profile"
                                   className="w-10 h-10 rounded-full object-cover"
                                 />
                               ) : (
                                 <Avatar address={toEthereumAddress(user.address)} className="w-10 h-10 rounded-full" />
                               )}
                             </div>
                             <div className="ml-3 flex-1 text-left">
                               <div className={`font-medium text-gray-900 dark:text-gray-100 transition-colors ${
                                 isSearchingAll 
                                   ? 'group-hover:text-orange-500' 
                                   : 'group-hover:text-purple-500'
                               }`}>
                                 {user.name}
                               </div>
                               <div className="text-xs text-gray-500 flex items-center mt-1">
                                 <span>{user.totalPoints || 0} pts</span>
                                 <span className="mx-2">•</span>
                                 <span>{user.postsCount || 0} posts</span>
                               </div>
                             </div>
                             <div className={`text-gray-400 transition-colors ${
                               isSearchingAll 
                                 ? 'group-hover:text-orange-500' 
                                 : 'group-hover:text-purple-500'
                             }`}>
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                               </svg>
                             </div>
                           </button>
                         ))}
                       </>
                     ) : userSearchQuery.length >= 2 && !isSearching ? (
                       <div className="text-center py-4 text-gray-500">
                         <div className="mb-2">No users found matching "{userSearchQuery}"</div>
                         {!isSearchingAll && (
                           <button
                             onClick={() => handleUserSearch(userSearchQuery, true)}
                             className="text-xs text-orange-500 hover:text-orange-600 underline"
                           >
                             Try searching all 12k+ users instead?
                           </button>
                         )}
                       </div>
                     ) : userSearchQuery.length >= 2 && isSearching ? (
                       <div className="text-center py-4 text-gray-500">
                         <div className="flex items-center justify-center space-x-2">
                           <RefreshCw className={`w-4 h-4 animate-spin ${isSearchingAll ? 'text-orange-500' : 'text-purple-500'}`} />
                           <span>
                             {isSearchingAll ? 'Searching all users...' : 'Searching top users...'}
                           </span>
                         </div>
                       </div>
                     ) : userSearchQuery.length > 0 && userSearchQuery.length < 2 ? (
                       <div className="text-center py-4 text-gray-500 text-sm">
                         Type at least 2 characters to search
                       </div>
                     ) : null}
                   </div>
                 )}
              </div>

              {/* Most Active Users */}
              <div className="mb-4 relative z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-semibold mb-0 bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text flex items-center">
                    Most Active Users
                    <div className="ml-2 text-2xl">👥</div>
                  </h2>
                  <button 
                    onClick={handleManualRefresh} 
                    disabled={!canManuallyRefresh}
                    className={`text-xs ${canManuallyRefresh ? 'text-blue-500 hover:text-blue-700' : 'text-gray-400 cursor-not-allowed'} flex items-center`}
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                    {isLoadingUsers ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
                <div className="space-y-3">
                  {renderUserList()}
                  <div className="mt-4">
                    <div className="flex justify-center items-center gap-1 mb-3">
                      <div className="bg-gray-100 dark:bg-gray-700 rounded-full p-1 flex items-center">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1 text-[11px] bg-gray-800 dark:bg-gray-600 text-white rounded-l-full disabled:opacity-50"
                        >
                          Prev
                        </button>
                        <span className="text-[11px] text-gray-600 dark:text-gray-300 px-3">
                          {currentPage}/{Math.max(1, Math.ceil(activeUsers.length / usersPerPage))}
                        </span>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.max(1, Math.ceil(activeUsers.length / usersPerPage))))}
                          disabled={currentPage >= Math.ceil(activeUsers.length / usersPerPage)}
                          className="px-3 py-1 text-[11px] bg-gray-800 dark:bg-gray-600 text-white rounded-r-full disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trending Hashtags */}
              <div className="mb-6 bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                    Trending Hashtags
                    <div className="ml-2 text-2xl">🔥</div>
                  </h2>
                  {trendingTags.length > 5 && (
                    <button
                      onClick={() => setExpandedTagsList(!expandedTagsList)}
                      className="text-sm text-blue-500 hover:text-blue-600 transition-colors"
                    >
                      {expandedTagsList ? 'Show Less' : 'Show More'}
                </button>
                  )}
                </div>
                <div className="space-y-2">
                  {trendingTags
                    .slice(0, expandedTagsList ? undefined : 5)
                    .map(({ tag, count }) => (
                      <div
                        key={tag} 
                        className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-all duration-300 group"
                      >
                        <span className="text-blue-500 hover:text-blue-600 cursor-pointer flex items-center group-hover:translate-x-1 transition-transform">
                          <span className="text-sm mr-2">#</span>
                          {tag}
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">{count}</span>
                          <span className="text-xs text-gray-400">posts</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Yaps Stats Widget */}
              <div className="mb-4">
                <a 
                  href="/yapscan" 
                  className="block bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-blue-600 font-medium">YapScan</span>
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </a>
              </div>
            </div>
              </div>
            </div>
          </div>

      {/* Animowany modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                {modalType === 'error' && (
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
                {modalType === 'warning' && (
                  <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                )}
                {modalType === 'confirm' && (
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
                )}
                
                <p className="text-lg mb-4 whitespace-pre-line text-gray-800 dark:text-gray-100">{modalMessage}</p>

                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                    disabled={isUploading}
                  >
                    Cancel
                </button>
                {modalType === 'confirm' && (
                  <button
                    onClick={handleConfirmUpload}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                    disabled={isUploading}
                  >
                      {isUploading ? 'Uploading...' : 'Confirm'}
                  </button>
                )}
              </div>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add small padding */}
      <div className="pb-8">
        {/* ... rest of the content ... */}
      </div>
      <div ref={loadMoreTriggerRef} style={{ height: '1px' }} />
          {showDailyPostOverlay && (
            <div className="fixed bottom-20 left-0 right-0 flex items-center justify-center z-40 pointer-events-auto">
              <div className="px-4 py-2 bg-black bg-opacity-80 text-white rounded-lg flex items-center gap-2 shadow-lg">
                <span>{dailyPostCount}/5 posts today</span>
                <button 
                  onClick={resetDailyPostCount}
                  className="ml-2 p-1 bg-[#0052FF] rounded-md text-xs flex items-center hover:bg-[#0047E1] transition-colors"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </div>
            </div>
          )}

      {/* Mobile footer */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-[#0052FF] bg-opacity-10 backdrop-blur-xl border-t border-[#0052FF]/20 z-40">
        <div className="flex items-center justify-around p-4">
          <button
            onClick={() => setActiveMobilePanel('left')}
            className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${
              activeMobilePanel === 'left' 
                ? 'bg-blue-500/10 text-[#0052FF] font-medium' 
                : 'text-gray-100 hover:bg-blue-500/5'
            }`}
          >
            <div className={`p-1 rounded-full ${activeMobilePanel === 'left' ? 'bg-blue-500/20' : ''}`}>
              <UserIcon 
                className="w-6 h-6" 
                color={activeMobilePanel === 'left' ? '#0052FF' : '#172554'} 
              />
            </div>
            <span className={`text-xs mt-1 font-medium ${activeMobilePanel === 'left' ? 'text-[#0052FF]' : 'text-[#60A5FA]'}`}>Profile</span>
          </button>
          <button
            onClick={() => setActiveMobilePanel('main')}
            className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${
              activeMobilePanel === 'main' 
                ? 'bg-blue-500/10 text-[#0052FF] font-medium' 
                : 'text-gray-100 hover:bg-blue-500/5'
            }`}
          >
            <div className={`p-1 rounded-full ${activeMobilePanel === 'main' ? 'bg-blue-500/20' : ''}`}>
              <HomeIcon 
                className="w-6 h-6" 
                color={activeMobilePanel === 'main' ? '#0052FF' : '#172554'} 
              />
            </div>
            <span className={`text-xs mt-1 font-medium ${activeMobilePanel === 'main' ? 'text-[#0052FF]' : 'text-[#60A5FA]'}`}>Feed</span>
          </button>
          <button
            onClick={() => setActiveMobilePanel('right')}
            className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${
              activeMobilePanel === 'right' 
                ? 'bg-blue-500/10 text-[#0052FF] font-medium' 
                : 'text-gray-100 hover:bg-blue-500/5'
            }`}
          >
            <div className={`p-1 rounded-full ${activeMobilePanel === 'right' ? 'bg-blue-500/20' : ''}`}>
              <ChartBarIcon 
                className="w-6 h-6" 
                color={activeMobilePanel === 'right' ? '#0052FF' : '#172554'} 
              />
            </div>
            <span className={`text-xs mt-1 font-medium ${activeMobilePanel === 'right' ? 'text-[#0052FF]' : 'text-[#60A5FA]'}`}>Trends</span>
          </button>
        </div>
      </div>

      {/* Padding for mobile footer */}
      <div className="h-20 lg:h-0" />

      {/* Modal do generowania postów AI */}
      <AnimatePresence>
        {showAIModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setShowAIModal(false)}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className={`${
                activePostingNetwork === 'basecamp' 
                  ? 'bg-gradient-to-br from-black/90 to-orange-900/90 border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.3)]'
                  : 'bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-white/10 shadow-[0_0_30px_rgba(59,130,246,0.2)]'
              } backdrop-blur-xl rounded-2xl p-6 max-w-md w-full mx-4 border`}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-col items-center mb-6 relative">
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 ${
                  activePostingNetwork === 'basecamp'
                    ? 'bg-gradient-to-r from-transparent via-orange-500 to-transparent'
                    : 'bg-gradient-to-r from-transparent via-blue-500 to-transparent'
                }`}></div>
                
                <h3 className={`text-xl font-medium text-transparent bg-clip-text ${
                  activePostingNetwork === 'basecamp'
                    ? 'bg-gradient-to-r from-orange-400 to-yellow-400'
                    : 'bg-gradient-to-r from-blue-400 to-purple-400'
                } mt-4`}>
                  {activePostingNetwork === 'basecamp' ? 'Camp AI Generator' : 'AI Post Generator'}
                </h3>
                
                <div className="text-sm text-gray-400 mt-2 text-center">
                  {activePostingNetwork === 'basecamp' 
                    ? 'Let AI help you create engaging Camp Network content'
                    : 'Let AI help you create engaging content'
                  }
                </div>

                <button
                  onClick={() => setShowAIModal(false)}
                  className="absolute top-0 right-0 text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="relative">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={
                    activePostingNetwork === 'basecamp'
                      ? "I'm your personal Camp Network agent. How can I assist you with creating engaging content for the Camp community today?"
                      : "I'm your personal Base network agent. How can I assist you with creating engaging content today?"
                  }
                  className={`w-full px-4 py-3 ${
                    activePostingNetwork === 'basecamp'
                      ? 'bg-gradient-to-r from-black/50 to-orange-900/50 border-orange-500/20 focus:ring-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.1)]'
                      : 'bg-gradient-to-r from-gray-800/50 to-gray-900/50 border-white/10 focus:ring-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                  } backdrop-blur-md border rounded-xl text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 resize-none`}
                  rows={4}
                  maxLength={500}
                />
                <div className="absolute bottom-3 right-3 text-xs text-gray-500">
                  {aiPrompt.length}/500
                </div>
              </div>

              <div className="flex justify-between items-center mt-4">
                <button
                  onClick={() => setShowAIModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateAIPost}
                  disabled={isGeneratingAI || !aiPrompt.trim()}
                  className={`flex items-center gap-2 px-6 py-2 ${
                    activePostingNetwork === 'basecamp'
                      ? 'bg-gradient-to-r from-orange-500/30 to-yellow-500/30 hover:shadow-[0_0_20px_rgba(249,115,22,0.5)] border-orange-500/20'
                      : 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] border-white/20'
                  } backdrop-blur-md rounded-xl text-white font-medium transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed border`}
                >
                  {isGeneratingAI ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Generating...</span>
                    </>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Generate
                    </span>
                  )}
                </button>
              </div>
              {isGeneratingAI && (
                <div className={`mt-4 p-4 rounded-xl ${
                  activePostingNetwork === 'basecamp'
                    ? 'bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border-orange-500/20'
                    : 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-white/10'
                } backdrop-blur-md border shadow-lg`}>
                  <p className="text-sm text-white/80 text-center">
                    Due to high demand, generation may take about a minute.
                    <br />
                    <span className={`${
                      activePostingNetwork === 'basecamp' ? 'text-orange-400' : 'text-blue-400'
                    } font-medium`}>
                      We're creating the perfect {activePostingNetwork === 'basecamp' ? 'Camp Network' : ''} post for you! ✨
                    </span>
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </BanPage>
  </FarcasterFrameProvider>
  );
}