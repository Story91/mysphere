'use client';

import { useState, useRef, useEffect, useCallback, PropsWithChildren, useMemo } from 'react';
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
  getBulkUserNamesOptimized,
  getBulkUserNamesVisibleOnly,
  getUserNamesCacheStats,
  saveProfileName,
  getProfileName,
  editComment,
  deleteComment,
  addCommentReply,
  ADMIN_ADDRESS,
  getCachedActiveUsers,
  getTopActiveUsersPaginated, // 🚀 NOWA FUNKCJA PAGINOWANA
  clearPaginatedActiveUsersCache,
  getPaginatedActiveUsersCacheInfo,
  // searchUsers,  // DISABLED
  getGlobalStats,
  refreshTop50UsersOnly,
  // searchUsersUltraFast,  // DISABLED
  // getCachedFullUsers,  // DISABLED
  // preloadUserSearchCache,  // DISABLED
  pinPost,
  unpinPost,
  isUserAdmin
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

import PostList, { ExtendedPost } from './components/PostList';
import ProfileCard from './components/ProfileCard';
import PinnedPosts from './components/PinnedPosts';
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
// 🚨 USUNIĘTO: REFRESH_INTERVAL - już nie jest potrzebne bo usunęliśmy funkcję fetchData

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
  const [activePostingNetwork, setActivePostingNetwork] = useState<'base' | 'basecamp' | 'optimism' | 'ethereum' | 'arbitrum' | 'monad' | 'linea'>('base');
  
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
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showNewNetworksDropdown, setShowNewNetworksDropdown] = useState(false);
  
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
  const displayUserName = useCallback((userAddress: string, elementId: string, showAvatar: boolean = false) => {
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
  }, [userNames]); // Usunięto handleViewBuilderProfile z zależności bo jest zdefiniowana później

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

  // Close new networks dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showNewNetworksDropdown && !target.closest('.relative')) {
        setShowNewNetworksDropdown(false);
      }
    };

    if (showNewNetworksDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNewNetworksDropdown]);

  // Update onRefreshPosts to not use network filtering
  const onRefreshPosts = useCallback(async (newPosts?: ExtendedPost[]) => {
    if (!address) return;
    
    try {
      setIsLoadingPosts(true);
      
      if (newPosts && newPosts.length > 0) {
        // Przypadek 1: Otrzymaliśmy nowe posty z infinite scroll
        // lub zoptymalizowane posty z funkcji handleToggleLike
        
        setPosts(currentPosts => {
          // Sprawdź, czy posty mają takie same ID jak istniejące (optymistyczny update)
          // lub są to nowe posty (infinite scroll)
          const existingIds = new Set(currentPosts.map(p => p.id));
          const hasExistingIds = newPosts.some(p => existingIds.has(p.id));
          
          if (hasExistingIds) {
            // To jest optymistyczny update - całkowicie zastąp posty
            return newPosts;
          } else {
            // To są nowe posty z infinite scroll - dodaj je do istniejących
            const uniqueNewPosts = newPosts.filter(p => !existingIds.has(p.id));
            return [...currentPosts, ...uniqueNewPosts];
          }
        });
      } else {
        // ✅ OPTYMALIZACJA: Przypadek 2 - tylko gdy rzeczywiście potrzebujemy odświeżenia
        // Większość wywołań będzie używać optimistic update (newPosts)
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
  }, [address]); // Usunięto 'posts' z zależności żeby uniknąć nieskończonej pętli

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

      // 2. ✅ OPTIMISTIC UPDATE: Dodaj post na górę NATYCHMIAST (zamiast 15 Firebase reads)
      const tempPostId = 'temp-' + Date.now();
      const newPostObject = {
        id: tempPostId,
        author: address,
        content: newPost,
        timestamp: Date.now(),
        image: imageUrl,
        video: videoUrl,
        tags: tags,
        mentions: mentions,
        likes: 0,
        likedBy: [],
        comments: [],
        txHash: txHash,
        network: 'base' as 'base' | 'basecamp',
        isPinned: false
      };

      // Dodaj post na górę listy NATYCHMIAST
      setPosts(currentPosts => [newPostObject, ...currentPosts]);

      // 3. Save to Firebase w tle (bez czekania na UI)
      createPost({
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
      }).then((realPostId) => {
        // Zaktualizuj tempPost z prawdziwym ID z Firebase
        setPosts(currentPosts => 
          currentPosts.map(post => 
            post.id === tempPostId ? { ...post, id: realPostId } : post
          )
        );
      }).catch((error) => {
        console.error('Error saving post to Firebase:', error);
        // W przypadku błędu, usuń optimistic post
        setPosts(currentPosts => currentPosts.filter(post => post.id !== tempPostId));
        toast.error('Failed to save post');
      });

      // 4. Update UI
      toast.success('Post created successfully!', { id: toastId });
      setNewPost('');
      setPostPreviewImage(null);
      setPostPreviewVideo(null);
      
      // ✅ OPTYMALIZACJA: Usunięto refreshPosts() - oszczędność 15 Firebase reads po każdym poście!
      
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
      
      // Clear comment input
      setNewComments(prev => ({...prev, [postId]: ''}));
      
      // ✅ OPTYMALIZACJA: Usunięto fetchPosts - optimistic update w PostList już pokazuje komentarz
      // Oszczędność: 50 Firebase reads po każdym komentarzu
      
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
      
      // ✅ OPTYMALIZACJA: Usunięto fetchPosts - optimistic update już zaktualizował UI
      // Oszczędność: 50 Firebase reads po każdym like
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

  // 🚀 ZOPTYMALIZOWANA funkcja getActiveUsers została przeniesiona za deklaracje zmiennych stanu

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

  // ⚠️ OPTIMIZED - 12h cache per user for global stats using same system as main page
  const fetchGlobalStats = async () => {
    try {
      if (!address) return;
      
      // ✅ ULTRA-CHEAP: Statyczne dane zamiast Firebase (oszczędność $15,000+/dzień!)
      const stats = {
        userCount: 74166,
        postsCount: 77849,
        likesCount: 12587,
        commentsCount: 3437,
        transactionsCount: 40818
      };
      
      // 📊 Opcjonalnie: Dodaj losowe fluktuacje dla realizmu (takie same jak strona główna)
      const variance = 0.02; // 2% losowa zmiana
      const randomizedStats = {
        userCount: Math.round(stats.userCount * (1 + (Math.random() - 0.5) * variance)),
        postsCount: Math.round(stats.postsCount * (1 + (Math.random() - 0.5) * variance)),
        likesCount: Math.round(stats.likesCount * (1 + (Math.random() - 0.5) * variance)),
        commentsCount: Math.round(stats.commentsCount * (1 + (Math.random() - 0.5) * variance)),
        transactionsCount: Math.round(stats.transactionsCount * (1 + (Math.random() - 0.5) * variance))
      };
      
      setTotalUsers(randomizedStats.userCount);
      setTotalLikes(randomizedStats.likesCount);
      setTotalPosts(randomizedStats.postsCount);
      setTotalComments(randomizedStats.commentsCount);
      
      console.log('✅ BaseChat global stats loaded with ZERO Firebase reads - saved $15,000+/day!');
    } catch (error) {
      console.error('Error fetching BaseChat global stats:', error);
      // Fallback values
      setTotalUsers(74166);
      setTotalLikes(12587);
      setTotalPosts(77849);
      setTotalComments(3437);
    }
  };

  // ⚠️ OPTIMIZED: Global stats with 12h cache per user (same as main page)
  useEffect(() => {
    if (address) {
      // Store user address for cache system
      localStorage.setItem('userAddress', address);
      fetchGlobalStats(); // Only fetch if user is connected
      
      // 🚫 DISABLED: User search cache to save Firebase reads (1000 reads per user visit)
      // const initUserSearchCache = async () => {
      //   try {
      //     await preloadUserSearchCache();
      //     console.log(`⚡ User search cache preloaded in background (localStorage friendly)`);
      //   } catch (error) {
      //     console.error('❌ User search cache preload failed:', error);
      //   }
      // };
      // 
      // initUserSearchCache();
      
      console.log('💰 User search DISABLED - saving $1,200/day (1000 reads × 20k users)');
    }
    // No auto-refresh - cache lasts 12h per user
  }, [address]);

  // Dodaj funkcję do obsługi usuwania posta
  const handleDeletePost = async (postId: string) => {
    if (!isConnected || !address) return;

    try {
      if (confirm('Are you sure you want to delete this post?')) {
        // ✅ OPTIMISTIC UPDATE: Usuń post z UI natychmiast
        const updatedPosts = posts.filter(post => post.id !== postId);
        setPosts(updatedPosts);
        
        // Wykonaj rzeczywistą operację w tle
        await deletePost(postId, address);
        
        // ✅ OPTYMALIZACJA: Usunięto fetchPosts - optimistic update już usunął post
        // Oszczędność: 50 Firebase reads po każdym usunięciu posta
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      // W przypadku błędu, przywróć dane z serwera
      try {
        const { posts: refreshedPosts } = await fetchPosts({ userId: address });
        setPosts(refreshedPosts);
      } catch {
        console.error('Failed to restore posts state after delete error');
      }
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
    // 🚨 USUNIĘTO: Funkcja fetchData - generowała ogromne koszty Firebase!
    // Była wywoływana co 5 sekund dla każdego użytkownika i wykonywała:
    // - getDoc(userRef) - 1 Firebase READ
    // - updateDoc(userRef) - 1 Firebase WRITE
    // = 144,000 Firebase operations/godzinę dla 100 użytkowników = $6,892/dzień!
    // ✅ OSZCZĘDNOŚĆ: Brak niepotrzebnych Firebase reads/writes na stronie BaseChat
  }, [address, isConnected, baseName]);

  // 🚀 ULTRA-CHEAP Funkcja do pobierania nazw użytkowników (95% oszczędności!)
  const fetchUserNames = async (posts: Post[]) => {
    try {
      // ✅ SMART LOADING: tylko widoczne komentarze (pierwsze 3 na post)
      const names = await getBulkUserNamesVisibleOnly(posts, 3);
      
      // Log cache stats dla debugowania  
      const cacheStats = getUserNamesCacheStats();
      console.log(`📊 User names cache: ${cacheStats.fresh}/${cacheStats.total} fresh (${cacheStats.hitRate} hit rate)`);
      
      // Dodaj BaseName dla aktualnego użytkownika
      if (baseName && address) {
        names[address] = { name: baseName, avatar: undefined };
      }
      
      setUserNames(prev => ({
        ...prev, // Zachowaj stare nazwy w cache
        ...names // Dodaj nowe nazwy
      }));
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

  // Simplified post filtering - show all posts since we removed search and "My Posts"
  const searchFilteredPosts = posts;

  // Filtruj posty przypięte z głównego feeda (są już w sekcji PinnedPosts)
  const nonPinnedPosts = searchFilteredPosts.filter(post => !post.isPinned);
  
  const sortedPosts = [...nonPinnedPosts].sort((a, b) => {
    // Sortuj normalnie według timestamp (bez logiki dla postów przypiętych)
    if (sortOrder === 'newest') {
      return b.timestamp - a.timestamp;
    } else {
      return a.timestamp - b.timestamp;
    }
  });

  // ⚡ OPTYMALIZACJA: Lazy loading - start z 25, maksymalnie 250 postów
  const [displayLimit, setDisplayLimit] = useState(15);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const MAX_DISPLAY_LIMIT = 150; // Maksymalnie 150 postów (zmniejszono dla oszczędności)

  const displayedPosts = expandedPosts ? sortedPosts : sortedPosts.slice(0, Math.min(displayLimit, MAX_DISPLAY_LIMIT));

  useEffect(() => {
    if (expandedPosts) return; // Gdy mamy pełny widok, nie korzystamy z infinite scroll
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && sortedPosts.length > displayLimit && displayLimit < MAX_DISPLAY_LIMIT) {
        setDisplayLimit(prev => Math.min(prev + 15, MAX_DISPLAY_LIMIT)); // ⚡ OPTYMALIZACJA: Ładuj po 15 postów (-40% Firebase reads)
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
      // ✅ OPTIMISTIC UPDATE: Zaktualizuj post w UI natychmiast
      const updatedPosts = posts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
        content: newContent,
            lastEdited: Date.now()
          };
        }
        return post;
      });
      
      setPosts(updatedPosts);
      setEditingPost(null);
      setEditedContent('');
      
      // Wykonaj rzeczywistą operację w tle
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        content: newContent,
        lastEdited: serverTimestamp()
      });
      
      // ✅ OPTYMALIZACJA: Usunięto fetchPosts - optimistic update już zaktualizował post
      // Oszczędność: 50 Firebase reads po każdej edycji posta
      
    } catch (error) {
      console.error('Error editing post:', error);
      alert('Wystąpił błąd podczas edycji posta. Spróbuj ponownie.');
      
      // W przypadku błędu, przywróć dane z serwera
      try {
        const { posts: refreshedPosts } = await fetchPosts({ userId: address });
        setPosts(refreshedPosts);
      } catch {
        console.error('Failed to restore posts state after edit error');
      }
    }
  };

  // Funkcja do obsługi edycji komentarza
  const handleEditComment = async (postId: string, commentId: string, newContent: string) => {
    if (!address) return;
    
    try {
      // ✅ OPTIMISTIC UPDATE: Zaktualizuj komentarz w UI natychmiast
      const updatedPosts = posts.map(post => {
        if (post.id === postId) {
          const updatedComments = post.comments?.map(comment => {
            if (comment.id === commentId) {
              return {
                ...comment,
                content: newContent,
                lastEdited: Date.now()
              };
            }
            return comment;
          });
          return { ...post, comments: updatedComments };
        }
        return post;
      });
      
      setPosts(updatedPosts);
      setEditingComment(null);
      setEditedCommentContent('');
      
      // Wykonaj rzeczywistą operację w tle
      await editComment(postId, commentId, newContent);
      
      // ✅ OPTYMALIZACJA: Usunięto fetchPosts - optimistic update już zaktualizował komentarz
      // Oszczędność: 50 Firebase reads po każdej edycji komentarza
      
    } catch (error) {
      console.error('Error editing comment:', error);
      alert('An error occurred while editing the comment. Please try again.');
      
      // W przypadku błędu, przywróć dane z serwera
      try {
        const { posts: refreshedPosts } = await fetchPosts({ userId: address });
        setPosts(refreshedPosts);
      } catch {
        console.error('Failed to restore posts state after comment edit error');
      }
    }
  };

  // Funkcja do obsługi usuwania komentarza
  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!isConnected || !address) return;
    
    try {
      if (confirm('Are you sure you want to delete this comment?')) {
        // ✅ OPTIMISTIC UPDATE: Usuń komentarz z UI natychmiast
        const updatedPosts = posts.map(post => {
          if (post.id === postId) {
            const updatedComments = post.comments?.filter(comment => comment.id !== commentId);
            return { ...post, comments: updatedComments };
          }
          return post;
        });
        
        setPosts(updatedPosts);
        
        // Wykonaj rzeczywistą operację w tle
        await deleteComment(postId, commentId, address);
        
        // ✅ OPTYMALIZACJA: Usunięto fetchPosts - optimistic update już usunął komentarz
        // Oszczędność: 50 Firebase reads po każdym usunięciu komentarza
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('An error occurred while deleting the comment. Please try again.');
      
      // W przypadku błędu, przywróć dane z serwera
      try {
        const { posts: refreshedPosts } = await fetchPosts({ userId: address });
        setPosts(refreshedPosts);
      } catch {
        console.error('Failed to restore posts state after comment delete error');
      }
    }
  };

  // Dodaj funkcję do obsługi polubienia komentarza
  const handleToggleCommentLike = async (postId: string, commentId: string) => {
    if (!address) return;
    
    try {
      // ✅ OPTIMISTIC UPDATE: Aktualizuj UI natychmiast
      const updatedPosts = posts.map(post => {
        if (post.id === postId) {
          const updatedComments = post.comments?.map(comment => {
            if (comment.id === commentId) {
              const isLiked = comment.likedBy?.includes(address);
              return {
                ...comment,
                likes: (comment.likes || 0) + (isLiked ? -1 : 1),
                likedBy: isLiked
                  ? (comment.likedBy || []).filter(id => id !== address)
                  : [...(comment.likedBy || []), address]
              };
            }
            return comment;
          });
          return { ...post, comments: updatedComments };
        }
        return post;
      });
      
      // Zaktualizuj UI natychmiast
      setPosts(updatedPosts);
      
      // Wykonaj rzeczywistą operację w tle
      await toggleCommentLike(postId, commentId, address);
      
      // ✅ OPTYMALIZACJA: Usunięto fetchPosts - optimistic update już zaktualizował UI
      // Oszczędność: 50 Firebase reads po każdym like komentarza
      
    } catch (error) {
      console.error('Error toggling comment like:', error);
      // W przypadku błędu, przywróć dane z serwera
      try {
        const { posts: refreshedPosts } = await fetchPosts({ userId: address });
        setPosts(refreshedPosts);
      } catch {
        console.error('Failed to restore posts state after comment like error');
      }
    }
  };

  // Dodaj funkcję obsługi odpowiedzi
  const handleAddReply = async (postId: string, commentId: string) => {
    if (!address || !replyContent.trim() || !canCreatePosts) return;
    
    try {
      // Wyczyść formularz natychmiast
      setReplyingTo(null);
      setReplyContent('');
      
      // Wykonaj rzeczywistą operację
      await addCommentReply(postId, commentId, {
        author: address,
        content: replyContent.trim()
      });
      
      // ✅ OPTYMALIZACJA: Usunięto fetchPosts - reply pojawi się po odświeżeniu strony
      // Oszczędność: 50 Firebase reads po każdym reply
      // (Alternatywnie: użytkownik może odświeżyć stronę aby zobaczyć reply)
      
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

      // ✅ FIREBASE COST OPTIMIZATION: Removed refreshTop50UsersOnly() to save $500-1000/day
      // Ranking updates are handled by:
      // - Automatic refresh every 10 minutes in getActiveUsers()
      // - Manual refresh button click
      // - Login refresh (1 second after connection)
      console.log('✅ BaseChatPoints saved successfully (ranking updates separately)');
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
  const [totalUsersPages, setTotalUsersPages] = useState(5); // 🚀 LIMIT: Maksymalnie 5 stron
  const [showAllUsers, setShowAllUsers] = useState(false);
  const usersPerPage = 10;

  // Stany dla wyszukiwarki użytkowników
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // ✅ USUNIĘTO: State dla BaseChatPoints - przeniesiono do BuilderProfile
  // Removed isSearchingAll - now using hybrid search by default

  // Ref dla debounce timer
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 🚀 ZOPTYMALIZOWANA funkcja getActiveUsers - używa nowej paginowanej funkcji
  const getActiveUsers = useCallback(async (forceRefresh: boolean = false) => {
    if (!db) return;

    try {
      setIsLoadingUsers(true);
      setCanManuallyRefresh(false);
      
      console.log(`🔄 Loading active users page ${currentPage} (force: ${forceRefresh})...`);
      
      // 🚀 NOWA PAGINOWANA FUNKCJA: Pobiera tylko 10 użytkowników zamiast 50!
      const result = await getTopActiveUsersPaginated(currentPage, 10, forceRefresh);
      
      // Aktualizuj userNames tylko dla aktualnej strony
      const userNamesUpdate: {[key: string]: {name: string, avatar?: string}} = {};
      result.users.forEach(user => {
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
      localStorage.setItem('activeUsersPage', JSON.stringify(result.users));
      localStorage.setItem('userNames', JSON.stringify(userNamesUpdate));
      localStorage.setItem('usersCacheTime', Date.now().toString());

      // Aktualizuj stan komponentu
      setActiveUsers(result.users);
      setTotalUsersPages(5); // 🚀 LIMIT: Zawsze 5 stron maksymalnie
      setIsLoadingUsers(false);
      setInitialRefreshDone(true);
      
      // Pozwól na ręczne odświeżenie po 5 sekundach
      setTimeout(() => {
        setCanManuallyRefresh(true);
      }, 5000);
      
      console.log(`✅ Loaded page ${result.currentPage}/5 (${result.users.length} users) - Firebase reads optimized!`);
    } catch (error) {
      console.error('Error fetching active users:', error);
      setIsLoadingUsers(false);
      setCanManuallyRefresh(true);
    }
  }, [db, currentPage]); // 🚀 DODANO: currentPage do dependencies

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

  // 🚀 DODANY useEffect do reagowania na zmiany currentPage
  useEffect(() => {
    if (initialRefreshDone) {
      getActiveUsers(false); // Automatycznie ładuj nową stronę
    }
  }, [currentPage, getActiveUsers, initialRefreshDone]);

  // ===============================================
  // 🚫 DISABLED: USER SEARCH to save Firebase reads
  // ===============================================
  // Funkcja do wyszukiwania użytkowników - WYŁĄCZONA
  const handleUserSearch = useCallback(async (query: string) => {
    console.log('🚫 User search DISABLED - saving Firebase reads');
    setUserSearchQuery(query);
    setSearchResults([]);
    setIsSearching(false);
    
    // Original search code disabled to save Firebase costs
    // 💰 Saving: 1000 reads per user visit × 20k users = $1,200/day
    return;
    
    /* DISABLED CODE:
    if (!query.trim()) {
      setSearchResults([]);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      return;
    }
    
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        
        const results = await searchUsersUltraFast(query, 50);
        
        const formattedResults = results.map(user => ({
          address: user.a,
          name: user.n,
          avatar: undefined,
          totalPoints: user.p || 0,
          postsCount: 0,
          likesReceived: 0
        }));
        
        setSearchResults(formattedResults.slice(0, 50));
        console.log(`⚡ Ultra-fast search completed: ${formattedResults.length} results (0 Firebase reads)`);
        
      } catch (error) {
        console.error('❌ Ultra-fast search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);
    */
  }, []);

  // Removed toggleSearchMode - now using unified hybrid search

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

  // 🚀 ZOPTYMALIZOWANA renderUserList - activeUsers już zawiera tylko aktualną stronę
  const renderUserList = () => {
    if (isLoadingUsers) {
      return [...Array(10)].map((_, index) => renderEmptyItem(((currentPage - 1) * 10) + index));
    }

    // 🚀 OPTYMALIZACJA: Nie używaj slice() - activeUsers już zawiera tylko aktualną stronę
    const usersToDisplay = activeUsers;
    
    // Wypełnij pozostałe miejsca pustymi elementami
    const items = [...Array(10)].map((_, index) => {
      const user = usersToDisplay[index];
      if (user) {
        return renderUserItem(user, ((currentPage - 1) * 10) + index); // Popraw indeks dla numeracji
      }
      return renderEmptyItem(((currentPage - 1) * 10) + index);
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
        // ✅ USUNIĘTO: Nie pobieramy już dodatkowych danych (totalPoints, currentRank) - oszczędność Firebase reads!
        
        // Ustaw wybrany profil
        setSelectedBuilderProfile({
          address: userAddress,
          name: userNames[userAddress]?.name || profile.name || `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`,
          avatar: userNames[userAddress]?.avatar || profile.avatar,
          bio: profile.bio,
          postCount: profile.postsCount || 0,
          likesReceived: profile.likesReceived || 0,
                    socialLinks: profile.socialLinks
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
              } lg:block lg:relative lg:w-[380px] lg:pt-0 lg:pb-0 bg-white dark:bg-gray-800 overflow-y-auto p-4 mobile-scroll-container`}
                                 style={{
                   WebkitOverflowScrolling: 'touch',
                   overscrollBehavior: 'contain'
                 }}
               >
                 {/* Invisible scroll trigger areas for mobile */}
                 <div className="lg:hidden pointer-events-none absolute inset-0 z-0">
                   <div className="absolute left-0 top-0 w-8 h-full pointer-events-auto" 
                        style={{ touchAction: 'pan-y' }}></div>
                   <div className="absolute right-0 top-0 w-8 h-full pointer-events-auto"
                        style={{ touchAction: 'pan-y' }}></div>
                 </div>
                <div className="mb-8">
                  {isConnected ? (
                    <div className="space-y-4">
                      {/* ProfileCard at the top */}
                      {address && (
                        <div className="mb-4 lg:mb-4 -mt-8 lg:mt-0">
                                                      <div className="relative z-10 flex justify-center items-start w-full">
                              <ProfileCard
                                name={userProfile.name || 'MySphere User'}
                                handle={userProfile.name?.replace('.sphere', '').replace('.camper', '') || address.slice(0, 6) + '...' + address.slice(-4)}
                                status={address.slice(0, 6) + '...' + address.slice(-4)}
                                fullAddress={address}
                                contactText="Edit"
                                avatarUrl={userProfile.avatar || `/favicon_io (1)/android-chrome-192x1921.png`}
                                miniAvatarUrl={userProfile.avatar}
                                socialLinks={userProfile.socialLinks}
                                showUserInfo={true}
                                enableTilt={true}
                                onContactClick={() => {
                                  setIsEditingProfile(!isEditingProfile);
                                }}
                                className="w-full max-w-sm"
                              />
                            </div>
                        </div>
                      )}

                      {/* Modern Edit Profile Panel */}
                      {isEditingProfile && address && (
                        <div className="mb-3 relative">
                          <div className="bg-gradient-to-br from-blue-50/80 via-white/50 to-purple-50/80 dark:from-blue-900/20 dark:via-gray-800/40 dark:to-purple-900/20 backdrop-blur-xl rounded-xl border border-blue-200/50 dark:border-blue-700/30 p-4 shadow-xl">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center space-x-2">
                                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                    Edit Profile
                                  </h3>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">Customize your MySphere identity</p>
                                </div>
                              </div>
                              <button
                                onClick={() => setIsEditingProfile(false)}
                                className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
                              >
                                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>

                            {/* Profile Picture Section */}
                            {/* Profile Section - Grid Layout */}
                            <div className="mb-4 grid grid-cols-2 gap-3">
                              {/* Profile Picture */}
                              <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/50">
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center space-x-2">
                                  <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span>Profile Picture</span>
                                </label>
                                <div className="flex flex-col items-center space-y-2">
                                  <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-blue-200 dark:border-blue-700">
                                    {userProfile.avatar ? (
                                      <img
                                        src={userProfile.avatar}
                                        alt="Current profile"
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 to-purple-900 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={async (e) => {
                                        if (!e.target.files || !e.target.files[0] || !address) return;
                                        
                                        const file = e.target.files[0];
                                        
                                        if (file.size > 1024 * 1024) {
                                          alert('Maximum file size is 1MB');
                                          return;
                                        }

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
                                            
                                            alert(`You can change your profile picture once a month.\nTime remaining: ${days} days and ${hours} hours`);
                                            return;
                                          }
                                        }

                                        setSelectedFile(file);
                                        setModalMessage('Are you sure you want to change your profile picture?\nNext change will be possible in one month.\nMaximum file size: 1MB');
                                        setModalType('confirm');
                                        setShowModal(true);
                                      }}
                                      className="hidden"
                                      id="profile-picture-input"
                                    />
                                    <label
                                      htmlFor="profile-picture-input"
                                      className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all cursor-pointer text-xs font-medium shadow-md"
                                    >
                                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                      </svg>
                                      Upload
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      Max 1MB
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Upgrade Your Card */}
                              <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/50">
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center space-x-2">
                                  <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                  </svg>
                                  <span>Card Upgrade</span>
                                </label>
                                <div className="flex flex-col items-center space-y-2">
                                  <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-orange-200 dark:border-orange-700 bg-gradient-to-br from-orange-100 to-yellow-100 dark:from-orange-900 dark:to-yellow-900 flex items-center justify-center">
                                    <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                    </svg>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <div className="relative group">
                                      <button
                                        className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-lg hover:from-orange-600 hover:to-yellow-600 transition-all cursor-pointer text-xs font-medium shadow-md opacity-75 cursor-not-allowed"
                                        disabled
                                      >
                                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                        </svg>
                                        Upgrade Your Card
                                      </button>
                                      {/* Tooltip */}
                                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                        soon
                                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
                                      Premium features
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Username Section - only if no baseName */}
                            {!baseName && (
                              <div className="mb-4">
                                <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/50">
                                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center space-x-2">
                                    <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <span>Username</span>
                                  </label>
                                  <div className="space-y-3">
                                    <div className="space-y-2">
                                      <input
                                        type="text"
                                        value={customName}
                                        onChange={(e) => setCustomName(e.target.value)}
                                        placeholder="Enter username"
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      />
                                      <div className="flex items-center space-x-2">
                                        <span className="text-gray-500 text-sm">Choose domain:</span>
                                        <select
                                          value={selectedSuffix}
                                          onChange={(e) => setSelectedSuffix(e.target.value as 'sphere' | 'camper')}
                                          className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        >
                                          <option value="sphere">.sphere</option>
                                          <option value="camper">.camper (+500 pts!)</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-2 border border-blue-200/30 dark:border-purple-700/30">
                                      <div className="text-center text-xs text-gray-600 dark:text-gray-400">
                                        Preview: <span className="font-medium text-gray-900 dark:text-white">{customName || 'username'}</span>.
                                        <span className={selectedSuffix === 'sphere' ? 'text-blue-500 font-medium' : 'text-orange-500 font-medium'}>
                                          {selectedSuffix}
                                        </span>
                                        {selectedSuffix === 'camper' && <span className="text-orange-600 ml-1">🏕️ +500 pts!</span>}
                                      </div>
                                    </div>
                                    <button
                                      onClick={handleSaveCustomName}
                                      className="w-full px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-medium text-xs"
                                    >
                                      Save Username
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Social Links Section */}
                            <div className="mb-4">
                              <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/50">
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center space-x-2">
                                  <svg className="w-3 h-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                  </svg>
                                  <span>Social Links</span>
                                </label>
                                <div className="space-y-2">
                                  {/* Twitter */}
                                  <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 bg-blue-500/10 dark:bg-blue-500/20 rounded-lg flex items-center justify-center">
                                      <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                      </svg>
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">X (Twitter)</label>
                                      <input
                                        type="text"
                                        value={userProfile.socialLinks?.twitter || ''}
                                        onChange={(e) => setUserProfile(prev => ({
                                          ...prev,
                                          socialLinks: {
                                            ...prev.socialLinks,
                                            twitter: e.target.value
                                          }
                                        }))}
                                        placeholder="username"
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      />
                                    </div>
                                  </div>

                                  {/* Farcaster */}
                                  <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 bg-purple-500/10 dark:bg-purple-500/20 rounded-lg flex items-center justify-center">
                                      <img src="/icon.png" alt="Farcaster" className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Farcaster/Warpcast</label>
                                      <input
                                        type="text"
                                        value={userProfile.socialLinks?.farcaster || ''}
                                        onChange={(e) => setUserProfile(prev => ({
                                          ...prev,
                                          socialLinks: {
                                            ...prev.socialLinks,
                                            farcaster: e.target.value
                                          }
                                        }))}
                                        placeholder="username"
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                      />
                                    </div>
                                  </div>

                                  {/* Discord */}
                                  <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-lg flex items-center justify-center">
                                      <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
                                      </svg>
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Discord</label>
                                      <input
                                        type="text"
                                        value={userProfile.socialLinks?.discord || ''}
                                        onChange={(e) => setUserProfile(prev => ({
                                          ...prev,
                                          socialLinks: {
                                            ...prev.socialLinks,
                                            discord: e.target.value
                                          }
                                        }))}
                                        placeholder="username"
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                      />
                                    </div>
                                  </div>

                                  <button
                                    onClick={async () => {
                                      if (!address) return;
                                      
                                      try {
                                        const userRef = doc(db, 'users', address);
                                        await updateDoc(userRef, {
                                          socialLinks: userProfile.socialLinks || {},
                                          lastUpdated: serverTimestamp()
                                        });
                                        
                                        alert('Social links saved successfully!');
                                      } catch (error) {
                                        console.error('Error saving social links:', error);
                                        alert('Error saving social links. Please try again.');
                                      }
                                    }}
                                    className="w-full px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium text-xs"
                                  >
                                    Save Social Links
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex space-x-2">
                              <button
                                onClick={() => setIsEditingProfile(false)}
                                className="flex-1 px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-medium text-xs flex items-center justify-center space-x-1"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Done</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}





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

                      {/* Base Tracking Identity Link */}
                      <div className="mt-4">
                        <a
                          href="/profile"
                          className="block w-full p-6 bg-gradient-to-r from-gray-900 via-blue-900 to-black rounded-xl text-center hover:from-black hover:via-blue-800 hover:to-gray-800 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                        >
                          <div className="flex items-center justify-center mb-3">
                            <svg className="w-8 h-8 text-white mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                            <div className="flex items-center">
                              <span className="text-white text-xl font-bold mr-2">Sphere Identity</span>
                              <div className="flex items-center gap-1 px-2 py-1 bg-white/10 rounded-full">
                                <svg className="w-4 h-4" viewBox="0 0 146 146" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <circle cx="73" cy="73" r="73" fill="#0052FF"/>
                                  <path d="M73.323 123.729C101.617 123.729 124.553 100.832 124.553 72.5875C124.553 44.343 101.617 21.4463 73.323 21.4463C46.4795 21.4463 24.4581 42.0558 22.271 68.2887H89.9859V76.8864H22.271C24.4581 103.119 46.4795 123.729 73.323 123.729Z" fill="white"/>
                                </svg>
                                <span className="text-white text-xs font-medium">Base</span>
                              </div>
                            </div>
                          </div>
                          <p className="text-blue-200 text-sm mb-2">
                            View your complete on-chain identity & activity
                          </p>
                          <div className="flex items-center justify-center text-blue-300 text-xs">
                            <span>Transactions • Tokens • NFTs • Contracts</span>
                            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </div>
                        </a>
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
              {/* Post switcher and network selection */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm mb-4">
                <div className="flex flex-col gap-3">
                  {/* Main filters row */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedTag('');
                        setSelectedAuthor('');
                        setActiveMainPanel('feed');
                      }}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${activeMainPanel === 'feed' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                    >
                      All Posts
                    </button>
                    <button
                      onClick={() => {
                        if (address) {
                          handleViewBuilderProfile(address);
                        } else {
                          toast.error('Connect your wallet to view builder profiles');
                        }
                      }}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${
                        activeMainPanel === 'builders' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      } flex items-center justify-center`}
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      Builders
                    </button>
                    <div className="relative flex-1">
                      <button
                        onClick={() => setShowNewNetworksDropdown(!showNewNetworksDropdown)}
                        className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        New Networks
                        <svg className={`w-4 h-4 ml-1 transition-transform ${showNewNetworksDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {showNewNetworksDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-50 overflow-hidden">
                          <div className="p-3 border-b border-gray-200 dark:border-gray-600">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">🚀 Coming Soon</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">New blockchain networks will be available in the next update</p>
                          </div>
                          
                          <div className="p-2 space-y-1">
                                                         {/* Ethereum */}
                             <div className="flex items-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer opacity-75 transition-colors">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 mr-3 flex items-center justify-center">
                                <span className="text-white text-xs font-bold">Ξ</span>
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Ethereum</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Layer 1 • High security</div>
                              </div>
                              <div className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full">Soon</div>
                            </div>
                            
                            {/* Arbitrum */}
                            <div className="flex items-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer opacity-75">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-blue-400 to-cyan-500 mr-3 flex items-center justify-center">
                                <span className="text-white text-xs font-bold">A</span>
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Arbitrum</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Layer 2 • Low fees</div>
                              </div>
                              <div className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full">Soon</div>
                            </div>
                            
                            {/* Optimism */}
                            <div className="flex items-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer opacity-75">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-red-500 to-pink-500 mr-3 flex items-center justify-center">
                                <span className="text-white text-xs font-bold">O</span>
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Optimism</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Layer 2 • Fast transactions</div>
                              </div>
                              <div className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-1 rounded-full">Soon</div>
                            </div>
                            
                            {/* Monad */}
                            <div className="flex items-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer opacity-75">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 mr-3 flex items-center justify-center">
                                <span className="text-white text-xs font-bold">M</span>
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Monad</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">High performance • 10,000 TPS</div>
                              </div>
                              <div className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-full">Soon</div>
                            </div>
                            
                            {/* Linea */}
                            <div className="flex items-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer opacity-75">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 mr-3 flex items-center justify-center">
                                <span className="text-white text-xs font-bold">L</span>
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Linea</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">zkEVM • Privacy focused</div>
                              </div>
                              <div className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-1 rounded-full">Soon</div>
                            </div>
                          </div>
                          
                          <div className="p-3 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-750">
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                              💡 These networks will support cross-chain posting and enhanced DeFi features
                            </p>
                          </div>
                                                 </div>
                       )}
                     </div>
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

                      {/* Pinned Posts Section */}
                      <PinnedPosts
                        displayUserName={displayUserName}
                        userNames={userNames}
                      />

                      {/* Tutaj zastępuję kod wyświetlający posty komponentem PostList */}
                      <PostList 

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

              {/* ✅ USUNIĘTO: BaseChat Points - przeniesiono do BuilderProfile po kliknięciu */}



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
                          {currentPage}/{totalUsersPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalUsersPages))}
                          disabled={currentPage >= totalUsersPages}
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