'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount, useSendTransaction } from 'wagmi';
import { base } from 'wagmi/chains';
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
  addCommentReply
} from '../utils/firebase';
import { doc, updateDoc, serverTimestamp, getDoc, setDoc, query, where, Timestamp } from 'firebase/firestore';
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
import { useReCaptcha } from '../hooks/useReCaptcha';
import ReCaptcha from '../components/ReCaptcha/ReCaptcha';

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
}

interface ExtendedPost extends Post {
  pollId?: string;
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

// Add gradient animation styles
const gradientAnimation = `
  @keyframes gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  .animate-gradient {
    background-size: 200% 200%;
    animation: gradient 3s ease infinite;
  }
`;

// Zaktualizuj funkcję sprawdzającą czy nazwa to BaseName
const isBaseName = (name: string) => {
  if (!name) return false;
  return name.endsWith('.base.eth') || name.endsWith('.base');
};

// Nowy komponent BanPage
function BanPage({ children }: { children: React.ReactNode }) {
  const { isBanned, reason, bannedAt } = useBanStatus();

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

export default function BaseChat() {
  const [activeMobilePanel, setActiveMobilePanel] = useState<'left' | 'main' | 'right'>('main');
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
    avatar: undefined,
    postCount: 0,
    likesReceived: 0,
    address: ''
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
  const [userNames, setUserNames] = useState<{[key: string]: {name: string, avatar?: string}}>({});
  const [expandedPosts, setExpandedPosts] = useState(false);
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
  const { startVerification, isVerifying } = useReCaptcha();
  const [dailyPostCount, setDailyPostCount] = useState(0);
  const [showDailyPostOverlay, setShowDailyPostOverlay] = useState(false);
  
  // Hook do sprawdzania BaseName
  const { data: baseName, isLoading: isBaseNameLoading } = useName({ 
    address: address || '0x0000000000000000000000000000000000000000', 
    chain: base 
  });

  // Funkcja sprawdzająca czy użytkownik może tworzyć posty
  const canCreatePosts = Boolean(baseName);

  // Dodaj nowy stan dla tooltipa
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<{[key: string]: Stats & { totalPoints: number }}>({});
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);

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
  const displayUserName = (userAddress: string, elementId: string) => {
    const userName = userNames[userAddress]?.name || userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
    
    return (
      <div className="relative inline-block">
        <div className="flex items-center">
          {userNames[userAddress]?.avatar ? (
            <img
              src={userNames[userAddress].avatar}
              alt="Profile"
              className="w-6 h-6 rounded-full mr-2"
            />
          ) : (
            <Avatar address={userAddress} className="w-6 h-6 rounded-full mr-2" />
          )}
          <div
            className="cursor-pointer"
            onMouseEnter={() => {
              setHoveredElement(elementId);
              setHoveredUser(userAddress);
              fetchUserStats(userAddress);
            }}
            onMouseLeave={() => {
              setHoveredElement(null);
              setHoveredUser(null);
            }}
          >
            <span className={`${isBaseName(userName) ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text font-bold' : 'text-gray-900 dark:text-white'}`}>
              {userName.endsWith('.sphere') ? (
                <>
                  <span className="text-gray-900 dark:text-white">{userName.replace('.sphere', '')}</span>
                  <span className="text-blue-500">.sphere</span>
                </>
              ) : (
                userName
              )}
            </span>
          </div>
        </div>
        
        {/* Tooltip */}
        {hoveredElement === elementId && hoveredUser === userAddress && userStats[userAddress] && (
          <div className="absolute left-0 mt-2 w-64 px-4 py-3 bg-white dark:bg-gray-800 rounded-xl shadow-lg z-50 border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                <div className="text-blue-500 font-bold">{userStats[userAddress].transactions || 0}</div>
                <div className="text-xs text-gray-500">Transactions</div>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                <div className="text-green-500 font-bold">{userStats[userAddress].tokens || 0}</div>
                <div className="text-xs text-gray-500">Tokens</div>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                <div className="text-purple-500 font-bold">{userStats[userAddress].nfts || 0}</div>
                <div className="text-xs text-gray-500">NFTs</div>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                <div className="text-yellow-500 font-bold">{userStats[userAddress].contracts || 0}</div>
                <div className="text-xs text-gray-500">Contracts</div>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-center">
                <div className="text-sm font-medium">Total Points</div>
                <div className="text-lg font-bold text-indigo-500">{userStats[userAddress].totalPoints}</div>
              </div>
              <div className="mt-1 text-center">
                <div className="text-sm font-medium">Badges Earned</div>
                <div className="text-lg font-bold text-indigo-500">
                  {BADGES.filter(badge => badge.condition({
                    totalPoints: userStats[userAddress].totalPoints,
                    rank: UserRank.NEWBIE,
                    percentile: 0,
                    breakdown: {
                      transactionPoints: 0,
                      tokenPoints: 0,
                      nftPoints: 0,
                      uniqueContractPoints: 0
                    },
                    stats: {
                      transactions: userStats[userAddress].transactions || 0,
                      tokens: userStats[userAddress].tokens || 0,
                      nfts: userStats[userAddress].nfts || 0,
                      contracts: userStats[userAddress].contracts || 0
                    }
                  })).length}/24
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Funkcja do zapisywania własnej nazwy
  const handleSaveCustomName = async () => {
    if (!address || !customName.trim()) return;
    
    try {
      // Dodaj końcówkę .sphere do nazwy
      const newName = customName.trim() + '.sphere';
      const success = await saveProfileName(address, newName);
      
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
        
        // Odśwież nazwy użytkowników
        if (posts.length > 0) {
          fetchUserNames(posts);
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

  // Add new useEffect for fetching posts
  useEffect(() => {
    if (isConnected && address) {
      const loadPosts = async () => {
        try {
          const fetchedPosts = await fetchPosts({ userId: address });
          setPosts(fetchedPosts);
        } catch (error) {
          console.error('Error fetching posts:', error);
        }
      };
      loadPosts();
    }
  }, [isConnected, address]);

  // Modify handleCreatePost
  const handleCreatePost = async () => {
    if (!isConnected || !address || !newPost.trim()) return;

    try {
      // Sprawdzenie limitu postów dziennie
      if (dailyPostCount >= 5) {
        alert('You have reached the daily limit of 5 posts.');
        return;
      }
      setDailyPostCount(prev => prev + 1);

      console.log('🚀 Starting post creation...');
      
      // reCAPTCHA verification
      console.log('🔍 Starting reCAPTCHA verification...');
      const verificationToken = await startVerification('create_post');
      
      if (!verificationToken) {
        console.error('❌ reCAPTCHA verification failed');
        return;
      }
      
      console.log('✅ reCAPTCHA verification completed');

      let imageUrl = null;
      let videoUrl = null;
      
      // Handle media upload (image or video)
      if (postPreviewImage || postPreviewVideo) {
        try {
          setUploadProgress(0);
          const mediaContent = postPreviewImage || postPreviewVideo;
          if (!mediaContent) throw new Error('No media content');

          // Convert base64 to Blob
          const base64Response = await fetch(mediaContent);
          const blob = await base64Response.blob();

          // Get file extension and type based on media type
          const isVideo = postPreviewVideo !== null;
          const fileExtension = isVideo ? 'mp4' : 'jpg';
          const fileName = `post-${Date.now()}.${fileExtension}`;

          // Upload to Vercel Blob Storage
          const formData = new FormData();
          formData.append('file', blob, fileName);

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

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
        } catch (uploadError) {
          console.error('Error during media upload:', uploadError);
          throw uploadError;
        }
      }

      // Detect hashtags and mentions
      const hashtagRegex = /#(\w+)/g;
      const tags = Array.from(new Set((newPost.match(hashtagRegex) || []).map(tag => tag.slice(1))));

      const mentionRegex = /@(\w+)/g;
      const mentions = Array.from(new Set((newPost.match(mentionRegex) || []).map(mention => mention.slice(1))));

      // Create post with media
      await createPost({
        author: address,
        content: newPost,
        timestamp: Date.now(),
        image: imageUrl,
        video: videoUrl,
        tags: tags,
        mentions: mentions,
        visibility: 'public'
      });

      // Reset states
      const updatedPosts = await fetchPosts({ userId: address });
      setPosts(updatedPosts);
      setNewPost('');
      setPostPreviewImage(null);
      setPostPreviewVideo(null);
      setUploadProgress(0);
      setShowDailyPostOverlay(true);
      setTimeout(() => setShowDailyPostOverlay(false), 3000);
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Error creating post. Please try again.');
    }
  };

  const handleAddComment = async (postId: string) => {
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
        mentions: mentions
      };

      await addComment(postId, comment);
      
      // Clear comment input and refresh posts
      setNewComments(prev => ({...prev, [postId]: ''}));
      const updatedPosts = await fetchPosts({ userId: address });
      setPosts(updatedPosts);
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  // Funkcja do obsługi polubienia
  const handleToggleLike = async (postId: string) => {
    if (!isConnected || !address) return;
    
    try {
      await toggleLike(postId, address);
      // Odśwież posty po zmianie polubienia
      const updatedPosts = await fetchPosts({ userId: address });
      setPosts(updatedPosts);
      await fetchUserStats(address);
    } catch (error) {
      console.error('Error toggling like:', error);
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

  // Funkcja do szybkiego ładowania podstawowych danych
  const loadInitialData = useCallback(() => {
    try {
      const cachedData = localStorage.getItem('activeUsers');
      const cachedNames = localStorage.getItem('userNames');
      
      if (cachedData) {
        setActiveUsers(JSON.parse(cachedData));
        setIsLoadingUsers(false);
      }
      
      if (cachedNames) {
        setUserNames(JSON.parse(cachedNames));
      }
    } catch (error) {
      console.error('Error loading cached data:', error);
    }
  }, []);

  // Zmodyfikowana funkcja getActiveUsers
  const getActiveUsers = useCallback(async () => {
    if (!db) return;
    
    try {
      const usersRef = collection(db, 'users');
      const usersSnap = await getDocs(usersRef);
      
      const users = await Promise.all(usersSnap.docs.map(async doc => {
        const data = doc.data();
        
        // Zmieniona obsługa lastActive
        const lastActive = data.lastActive ? new Date(data.lastActive).getTime() : Date.now();

        const stats = {
          posts: data.postsCount || 0,
          likes: data.likesReceived || 0
        };

        // Oblicz punkty
        const postPoints = stats.posts * 5;
        const likePoints = stats.likes;
        const basePoints = postPoints + likePoints;
        const activityBonus = Math.round(basePoints * 0.25);
        const totalPoints = basePoints + activityBonus;

        // Aktualizuj nazwy użytkowników
        const userName = data.name || (data.baseName ? `${data.baseName}.base.eth` : doc.id.slice(0, 6) + '...' + doc.id.slice(-4));
        setUserNames(prev => ({
          ...prev,
          [doc.id]: {
            name: userName,
            avatar: data.avatar
          }
        }));

        return {
          address: doc.id,
          points: totalPoints,
          stats: stats,
          lastActive: lastActive,
          name: userName
        };
      }));

      // Sortuj użytkowników po punktach
      const sortedUsers = users.sort((a, b) => b.points - a.points);
      
      // Zapisz do localStorage
      localStorage.setItem('activeUsers', JSON.stringify(sortedUsers));
      localStorage.setItem('userNames', JSON.stringify(userNames));
      
      setActiveUsers(sortedUsers);
      setIsLoadingUsers(false);
    } catch (error) {
      console.error('Error fetching active users:', error);
      setIsLoadingUsers(false);
    }
  }, [db]);

  // Zmodyfikowane useEffect-y
  useEffect(() => {
    // Natychmiast załaduj dane z cache
    loadInitialData();
    
    // Natychmiast pobierz świeże dane
    getActiveUsers();
    
    // Następnie odświeżaj co 30 sekund przez pierwsze 2 minuty
    const quickRefreshInterval = setInterval(getActiveUsers, 30 * 1000);
    
    // Po 2 minutach przełącz na odświeżanie co 5 minut
    const slowRefreshTimeout = setTimeout(() => {
      clearInterval(quickRefreshInterval);
      const slowRefreshInterval = setInterval(getActiveUsers, 5 * 60 * 1000);
      
      // Cleanup dla wolnego odświeżania
      return () => clearInterval(slowRefreshInterval);
    }, 2 * 60 * 1000);
    
    // Cleanup dla szybkiego odświeżania i timeoutu
    return () => {
      clearInterval(quickRefreshInterval);
      clearTimeout(slowRefreshTimeout);
    };
  }, [loadInitialData, getActiveUsers]);

  // Dodaj useEffect do aktualizacji trendujących tagów
  useEffect(() => {
    const trending = getTrendingTags(posts);
    setTrendingTags(trending);
  }, [posts]);

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
        const updatedPosts = await fetchPosts({ userId: address });
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
        try {
          // Pobierz profil z Firebase
          const profile = await fetchUserProfile(address);
          
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
              bio: profile.bio
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
          address: ''
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
        await updateDoc(userRef, {
          totalPoints,
          currentRank: currentRankValue,
          lastUpdated: serverTimestamp(),
          stats: rankingStats.stats
        });

      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }

    if (isConnected && address) {
      fetchData();
      const interval = setInterval(fetchData, REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [address, isConnected]);

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
      const updatedPosts = await fetchPosts({ userId: address });
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
      const updatedPosts = await fetchPosts({ userId: address });
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
    if (!address) return;
    
    try {
      if (confirm('Are you sure you want to delete this comment?')) {
        await deleteComment(postId, commentId);
        
        // Odśwież posty
        const updatedPosts = await fetchPosts({ userId: address });
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
      const updatedPosts = await fetchPosts({ userId: address });
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
      const updatedPosts = await fetchPosts({ userId: address });
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
  const renderUserItem = (user: any, index: number) => (
    <div key={user.address} className="flex items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all duration-300">
      <div className="w-6 flex-shrink-0">
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
          <Avatar address={user.address} className="w-8 h-8 rounded-full" />
        )}
      </div>
      <div className="flex-1 min-w-0 px-2">
        <div className="flex items-center">
          <span className={`text-[11px] font-medium truncate ${
            userNames[user.address]?.name?.includes('.base.eth') 
              ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text' 
              : 'text-gray-900 dark:text-white'
          }`}>
            {userNames[user.address]?.name || user.address.slice(0, 6) + '...' + user.address.slice(-4)}
          </span>
        </div>
        <div className="text-[9px] text-gray-500">
          {user.stats.posts} posts · {user.stats.likes} likes
        </div>
      </div>
      <div className="text-[11px] font-semibold text-purple-500">
        {user.points} pts
      </div>
    </div>
  );

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

  return (
    <BanPage>
      <Script src="https://widgets.coingecko.com/gecko-coin-price-marquee-widget.js" />
      <div className="min-h-screen relative">
        {/* Background effects */}
        <div className="fixed inset-0 z-0">
          <div className="absolute inset-0 bg-black opacity-90">
            <div className="absolute inset-0 bg-[url('/matrix.png')] opacity-10 animate-matrix"></div>
          </div>
          {/* Glowing Coinbase orb */}
          <div className="absolute inset-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[#0052FF] blur-[150px] opacity-20 animate-pulse"></div>
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,82,255,0.1)_0%,transparent_70%)]"></div>
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent)',
            backgroundSize: '50px 50px'
          }}></div>
        </div>

        <div className="relative z-10">
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
            } lg:block lg:relative lg:w-80 lg:pt-0 lg:pb-0 bg-white dark:bg-gray-800 overflow-y-auto p-4`}>
              <div className="mb-8">
                {isConnected ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                      {/* Rank section moved and centered */}
                      <div className="text-center mb-4">
                        <div className="text-2xl font-bold bg-gradient-to-r from-purple-500 via-blue-500 to-green-500 text-transparent bg-clip-text animate-gradient">
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
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={customName}
                              onChange={(e) => setCustomName(e.target.value)}
                              placeholder="Enter username"
                              className="px-2 py-1 border rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                            />
                      <button
                              onClick={handleSaveCustomName}
                              className="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
                      >
                              Save
                            </button>
                            <button
                              onClick={() => setIsEditingName(false)}
                              className="px-3 py-1 bg-gray-500 text-white rounded-lg text-sm hover:bg-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center space-x-2">
                            <span className={`${isBaseName(userProfile.name) ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text font-bold animate-pulse' : 'text-gray-900 dark:text-white'}`}>
                              {userProfile.name}
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
            </div>
            </div>
          </div>

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
                      onClick={() => setShowOnlyUserPosts(false)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium ${!showOnlyUserPosts ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                    >
                      All Posts
                    </button>
                    <button
                      onClick={() => setShowOnlyUserPosts(true)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium ${showOnlyUserPosts ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                    >
                      My Posts
                    </button>
                    <button
                      onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
                      className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                    >
                      {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
                    </button>
                  </div>
                </div>
              </div>

              {/* New post creation */}
              {isConnected ? (
    <>
                  {canCreatePosts ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow mb-6">
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

                      <div className="flex justify-between items-center">
            <button
                          onClick={() => document.getElementById('fileInput')?.click()}
                          className="flex items-center space-x-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>Add photo/video</span>
                        </button>
                        <input
                          id="fileInput"
                          type="file"
                          accept="image/*,video/*"
                          onChange={handlePostFileSelect}
                          className="hidden"
                        />
                        <button
                          onClick={handleCreatePost}
                          disabled={!newPost.trim()}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Post
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl p-6 text-center shadow-lg mb-6 border border-[#0052FF]/20 relative overflow-hidden">
                      {/* Matrix background effect */}
                      <div className="absolute inset-0 bg-[url('/matrix-code.png')] opacity-[0.08] animate-matrix"></div>
                      <div className="absolute inset-0 bg-gradient-to-br from-[#0052FF]/10 via-transparent to-[#0052FF]/10"></div>
                      
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
                          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 group-hover:animate-shine"></div>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          Claim Basename
                          <span className="ml-2 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 text-xs px-1.5 py-0.5 rounded-full font-bold animate-gradient">NEW</span>
                        </a>
                      </div>

                      <style jsx>{`
                        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

                        @keyframes matrix {
                          0% { background-position: 0% 0%; }
                          100% { background-position: 0% 100%; }
                        }
                        @keyframes scan {
                          0% { transform: scaleX(0); opacity: 0.3; }
                          50% { transform: scaleX(1); opacity: 0.8; }
                          100% { transform: scaleX(0); opacity: 0.3; }
                        }
                        @keyframes glitch {
                          0% { transform: translate(0); text-shadow: 2px 0 #0052FF, -2px 0 #00ff00; }
                          25% { transform: translate(-2px,2px); text-shadow: -2px 0 #0052FF, 2px 0 #00ff00; }
                          50% { transform: translate(2px,-2px); text-shadow: 2px 0 #0052FF, -2px 0 #00ff00; }
                          75% { transform: translate(-2px,-2px); text-shadow: -2px 0 #0052FF, 2px 0 #00ff00; }
                          100% { transform: translate(0); text-shadow: 2px 0 #0052FF, -2px 0 #00ff00; }
                        }
                        @keyframes glitch-2 {
                          0% { transform: translate(0); }
                          20% { transform: translate(-1px,1px); }
                          40% { transform: translate(-1px,-1px); }
                          60% { transform: translate(1px,1px); }
                          80% { transform: translate(1px,-1px); }
                          100% { transform: translate(0); }
                        }
                        @keyframes shine {
                          from { left: -100%; }
                          to { left: 100%; }
                        }
                        .animate-matrix {
                          animation: matrix 20s linear infinite;
                        }
                        .animate-scan {
                          animation: scan 3s ease-in-out infinite;
                        }
                        .animate-glitch {
                          animation: glitch 3s infinite;
                        }
                        .animate-glitch-2 {
                          animation: glitch-2 2s infinite;
                        }
                        .animate-shine {
                          animation: shine 1.5s linear infinite;
                        }
                        .animate-gradient {
                          background-size: 200% 200%;
                          animation: gradient 3s ease infinite;
                        }
                        .typewriter {
                          overflow: hidden;
                          white-space: nowrap;
                          animation: typing 3.5s steps(40, end);
                        }
                        @keyframes blink-fast {
                          0%, 100% { opacity: 0; }
                          50% { opacity: 1; }
                        }
                        .animate-blink-fast {
                          animation: blink-fast 0.5s step-end infinite;
                        }
                      `}</style>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center shadow mb-6">
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Connect your wallet to start posting and interacting with the community
                  </p>
                  <ConnectWallet />
                </div>
              )}

              {/* Lista postów */}
              <div className="space-y-6">
                {displayedPosts.map((post) => (
                  <div key={post.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                            {displayUserName(post.author, `post-${post.id}`)}
                        <div className="text-xs text-gray-500">
                            {formatTimestamp(post.timestamp)}
                          </div>
                        </div>
                      
                      {/* Opcje posta dla autora */}
                      {post.author === address && (
                        <div className="relative">
                        <button
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                            onClick={() => setEditingPost(editingPost === post.id ? null : post.id)}
                        >
                            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </button>
                          
                          {editingPost === post.id && (
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10 border border-gray-200 dark:border-gray-700">
                              <button
                                onClick={() => {
                                  setEditingPost(post.id);
                                  setEditedContent(post.content);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                Edytuj post
                              </button>
                              <button
                                onClick={() => handleDeletePost(post.id)}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                Usuń post
                              </button>
                            </div>
                      )}
                    </div>
                      )}
                    </div>

                    {editingPost === post.id ? (
                      <div className="mb-4">
                        <textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                          rows={3}
                          />
                        <div className="flex justify-end space-x-2 mt-2">
                          <button
                            onClick={() => {
                              setEditingPost(null);
                              setEditedContent('');
                            }}
                            className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleEditPost(post.id, editedContent)}
                            className="px-3 py-1 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4">
                        <LinkPreview 
                          content={post.content} 
                          media={post.image ? {
                            type: 'image',
                            url: post.image
                          } : post.video ? {
                            type: 'video',
                            url: post.video
                          } : undefined}
                          />
                      </div>
                    )}

                    <div className="flex items-center space-x-4 mb-4">
                      <button
                        onClick={() => handleToggleLike(post.id)}
                        className={`flex items-center space-x-1 ${
                          post.likedBy?.includes(address || '') ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'
            }`}
          >
                        <svg 
                          className="w-5 h-5" 
                          fill={post.likedBy?.includes(address || '') ? "currentColor" : "none"}
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" 
                          />
                        </svg>
                        <span>{post.likes}</span>
                      </button>
                    </div>
                    
                    {/* Comments section */}
                    <div className="space-y-4">
                      {/* Wyświetl komentarze */}
                      {(expandedComments[post.id] ? post.comments : post.comments.slice(0, 5))
                        .filter(comment => !comment.replyTo) // Filtruj tylko główne komentarze
                        .map(comment => (
                          <div key={comment.id} className="mt-4 border-t dark:border-gray-700 pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                {displayUserName(comment.author, `comment-${post.id}-${comment.id}`)}
                                <div className="text-xs text-gray-500">
                                  {formatTimestamp(comment.timestamp)}
                                </div>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                {/* Przycisk odpowiedzi */}
                                {canCreatePosts ? (
                                  <button
                                    onClick={() => setReplyingTo(replyingTo?.commentId === comment.id ? null : { postId: post.id, commentId: comment.id })}
                                    className="text-sm text-gray-500 hover:text-blue-500 flex items-center space-x-1"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                    </svg>
                                    <span>Reply</span>
                                  </button>
                                ) : (
                                  <span className="text-sm text-gray-500 italic">Get BaseName to reply</span>
                                )}
                                
                                {/* Opcje komentarza dla autora */}
                                {comment.author === address && (
                                  <div className="relative">
                                    <button
                                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full"
                                      onClick={() => setEditingComment(editingComment?.commentId === comment.id ? null : { postId: post.id, commentId: comment.id })}
                      >
                                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
                                    </button>
                                    
                                    {editingComment?.commentId === comment.id && (
                                      <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10">
                                        <button
                                          onClick={() => {
                                            setEditingComment({ postId: post.id, commentId: comment.id });
                                            setEditedCommentContent(comment.content);
                                          }}
                                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => handleDeleteComment(post.id, comment.id)}
                                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                          Delete
            </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {editingComment?.commentId === comment.id ? (
                              <div>
                                <textarea
                                  value={editedCommentContent}
                                  onChange={(e) => setEditedCommentContent(e.target.value)}
                                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <div className="flex justify-end space-x-2 mt-2">
            <button
              onClick={() => {
                                      setEditingComment(null);
                                      setEditedCommentContent('');
              }}
                                    className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleEditComment(post.id, comment.id, editedCommentContent)}
                                    className="px-3 py-1 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded"
                                  >
                                    Save
          </button>
                                </div>
                              </div>
                            ) : (
                              <>
                            <p className="text-sm text-gray-800 dark:text-gray-200">{comment.content}</p>

                                {/* Przyciski akcji komentarza */}
                            <div className="flex items-center space-x-4 mt-2">
                              <button
                                onClick={() => handleToggleCommentLike(post.id, comment.id)}
                                className={`flex items-center space-x-1 ${
                                  comment.likedBy?.includes(address || '') ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'
                                }`}
                              >
                                <svg 
                                  className="w-4 h-4" 
                                  fill={comment.likedBy?.includes(address || '') ? "currentColor" : "none"}
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                >
                                  <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={2} 
                                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" 
                                  />
                                </svg>
                                <span className="text-xs">{comment.likes || 0}</span>
                              </button>
                            </div>
                              </>
                            )}

                            {/* Formularz odpowiedzi */}
                            {replyingTo?.commentId === comment.id && (
                              <div className="mt-2 pl-4 border-l-2 border-gray-300 dark:border-gray-500">
                                <textarea
                                  value={replyContent}
                                  onChange={(e) => setReplyContent(e.target.value)}
                                  placeholder="Write a reply..."
                                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <div className="flex justify-end space-x-2 mt-2">
                                  <button
                                    onClick={() => {
                                      setReplyingTo(null);
                                      setReplyContent('');
                                    }}
                                    className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleAddReply(post.id, comment.id)}
                                    className="px-3 py-1 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded"
                                  >
                                    Reply
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Wyświetl odpowiedzi */}
                            {post.comments
                              .filter(reply => reply.replyTo === comment.id)
                              .map(reply => (
                                <div key={reply.id} className="mt-2 pl-4 border-l-2 border-gray-300 dark:border-gray-500">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                      {displayUserName(reply.author, `reply-${post.id}-${reply.id}`)}
                                      <div className="text-xs text-gray-500">
                                        {formatTimestamp(reply.timestamp)}
                                      </div>
                                  </div>

                                  {reply.author === address && (
                                    <div className="relative">
                                      <button
                                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full"
                                        onClick={() => setEditingComment(editingComment?.commentId === reply.id ? null : { postId: post.id, commentId: reply.id })}
                                      >
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                        </svg>
                                      </button>

                                      {editingComment?.commentId === reply.id && (
                                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10">
                                          <button
                                            onClick={() => {
                                              setEditingComment({ postId: post.id, commentId: reply.id });
                                              setEditedCommentContent(reply.content);
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                          >
                                            Edit
                                          </button>
                                          <button
                                            onClick={() => handleDeleteComment(post.id, reply.id)}
                                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  </div>

                                  <p className="text-sm text-gray-800 dark:text-gray-200">{reply.content}</p>

                                  <div className="flex items-center space-x-4 mt-2">
                                    <button
                                      onClick={() => handleToggleCommentLike(post.id, reply.id)}
                                      className={`flex items-center space-x-1 ${
                                        reply.likedBy?.includes(address || '') ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'
                                      }`}
                                    >
                                      <svg 
                                        className="w-4 h-4" 
                                        fill={reply.likedBy?.includes(address || '') ? "currentColor" : "none"}
                                        stroke="currentColor" 
                                        viewBox="0 0 24 24"
                                      >
                                        <path 
                                          strokeLinecap="round" 
                                          strokeLinejoin="round" 
                                          strokeWidth={2} 
                                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" 
                                        />
                                      </svg>
                                      <span className="text-xs">{reply.likes || 0}</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        ))}

                      {post.comments.length > 5 && (
                              <button
                          onClick={() => setExpandedComments(prev => ({
                            ...prev,
                            [post.id]: !prev[post.id]
                          }))}
                          className="w-full text-sm text-blue-500 hover:text-blue-600 py-2"
                              >
                          {expandedComments[post.id] ? 
                            `Hide comments (${post.comments.length - 5})` : 
                            `Show more comments (${post.comments.length - 5})`
                          }
                              </button>
                      )}
                      
                      {/* New comment input */}
                      {isConnected && (
                        <div className="flex items-center space-x-2">
                          {canCreatePosts ? (
                            <>
                              <Avatar address={address} className="w-6 h-6 rounded-full" />
                              <div className="flex-1">
                                <input
                                  type="text"
                                  placeholder="Write a comment..."
                                  value={newComments[post.id] || ''}
                                  onChange={(e) => setNewComments(prev => ({...prev, [post.id]: e.target.value}))}
                                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                                <button
                                onClick={() => handleAddComment(post.id)}
                                disabled={!newComments[post.id]?.trim()}
                                className="px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                Comment
                                </button>
    </>
                          ) : (
                            <p className="text-sm text-gray-500 italic">Get BaseName to comment on posts</p>
                          )}
                              </div>
                            )}
                          </div>
                  </div>
                        ))}
              </div>
            </div>

            {/* Right panel (Trends & Global Statistics) */}
            <div className={`${
              activeMobilePanel === 'right' ? 'fixed inset-0 z-30 pt-[120px] pb-24' : 'hidden'
            } lg:block lg:relative lg:w-80 lg:pt-0 lg:pb-0 bg-white dark:bg-gray-800 overflow-y-auto p-4`}>
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

              {/* BaseChat Points */}
              {isConnected && (
                <div className="mb-6 bg-gray-50 dark:bg-gray-700 rounded-xl p-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-gradient"></div>
                  
                  <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100 flex items-center">
                    BaseChat Points
                    <div className="ml-2 text-3xl animate-bounce">⚡</div>
                  </h2>

                  <div className="space-y-3">
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

              {/* Most Active Users */}
              <div className="mb-4 relative z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold mb-3 bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text flex items-center">
                  Most Active Users
                  <div className="ml-2 text-2xl">👥</div>
                </h2>
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

      {/* ReCaptcha component as small button */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2">
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full border border-gray-200 dark:border-gray-700 shadow-lg shadow-blue-500/20 hover:bg-white hover:dark:bg-gray-800 transition-all duration-300">
          <div className="px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Protected by</span>
              <span className="text-xs font-medium bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text">reCAPTCHA</span>
              <span className="text-xs text-gray-500">with</span>
              <span className="text-xs font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-transparent bg-clip-text">Google</span>
              <ReCaptcha action="create_post" isVerifying={isVerifying} />
            </div>
          </div>
            </div>
          </div>

      {/* Add small padding */}
      <div className="pb-8">
        {/* ... rest of the content ... */}
      </div>
      <div ref={loadMoreTriggerRef} style={{ height: '1px' }} />
          {showDailyPostOverlay && (
            <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
              <div className="px-4 py-2 bg-black bg-opacity-50 text-white rounded">
                {dailyPostCount}/5 posts today
              </div>
            </div>
          )}

      {/* Mobile footer */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-[#0052FF] bg-opacity-10 backdrop-blur-xl border-t border-[#0052FF]/20 z-50">
        <div className="flex items-center justify-around p-4">
          <button
            onClick={() => setActiveMobilePanel('left')}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${
              activeMobilePanel === 'left' ? 'text-[#0052FF]' : 'text-gray-400'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs mt-1">Profile</span>
          </button>
          <button
            onClick={() => setActiveMobilePanel('main')}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${
              activeMobilePanel === 'main' ? 'text-[#0052FF]' : 'text-gray-400'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1">Feed</span>
          </button>
          <button
            onClick={() => setActiveMobilePanel('right')}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${
              activeMobilePanel === 'right' ? 'text-[#0052FF]' : 'text-gray-400'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-xs mt-1">Trends</span>
          </button>
        </div>
      </div>

      {/* Padding for mobile footer */}
      <div className="h-20 lg:h-0" />
    </BanPage>
  );
}