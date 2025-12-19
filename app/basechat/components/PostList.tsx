'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { Post, Comment } from '../../types';
import { doc, updateDoc, serverTimestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import { fetchPosts, db, toggleLike, deletePost, toggleCommentLike, editComment, deleteComment, addCommentReply, addComment, ADMIN_ADDRESS, pinPost, unpinPost, isUserAdmin, PinDuration } from '../../utils/firebase';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Avatar as CoinbaseAvatar } from '@coinbase/onchainkit/identity';
import LinkPreview from './LinkPreview';
import CommentTransactionButton from '../../components/CommentTransactionButton';
import CommentTransactionButtonBaseCamp from './BaseCampPosts/CommentTransactionButtonBaseCamp';
import CommentTransactionButtonCelo from '../Celo/components/CommentTransactionButtonCelo';
import CommentTransactionButtonEthereum from '../ETH/components/CommentTransactionButtonEthereum';
import CommentTransactionButtonWorldChain from '../World/components/CommentTransactionButtonWorldChain';
import CommentTransactionButtonLinea from '../Linea/components/CommentTransactionButtonLinea';
import { BASECAMP_CHAIN_ID } from '../../contracts/BaseCampPostContract';
import { CELO_CHAIN_ID } from '../Celo/config/CeloNetworkConfig';
import { ETHEREUM_CHAIN_ID } from '../ETH/config/EthereumNetworkConfig';
import { WORLD_CHAIN_ID } from '../World/config/WorldChainNetworkConfig';
import { LINEA_CHAIN_ID } from '../Linea/config/LineaNetworkConfig';
import { base, baseSepolia } from 'wagmi/chains';
import TipButton from './TipButton';
import TipStats from './TipStats';
import SpotifyTrackCard from './SpotifyTrackCard';

// Import Zora SDK functions and types
import { getProfileBalances } from '@zoralabs/coins-sdk';
import { getCachedCoin } from '../../utils/zoraSdk';
import { parseEther, parseUnits, formatEther, formatUnits, createPublicClient, http } from 'viem'; // Import viem utils
import { Address as ViemAddress } from 'viem';
import TradeCoinModal from './TradeCoinModal';
import { CreatorCoinData } from '../../utils/creatorCoin';

// ERC20 balanceOf ABI - standard for all ERC20 tokens
const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Import social features
import { useSocial } from '../friendsystem/hooks';

// Import icons
import { Users, Coins, ShoppingCart, Tag, ExternalLink, X } from 'lucide-react';

// Import shadcn components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import SpotlightCard from '@/components/SpotlightCard';

// 🚀 Import PinnedJobs components
import PaidPinButton from '../PinnedJobs/components/PaidPinButton';
import PinTimer from '../PinnedJobs/components/PinTimer';
import PendingPinTimer from '../PinnedJobs/components/PendingPinTimer';
import ExtendPinModal from '../PinnedJobs/components/ExtendPinModal';

// Utility function for formatting large numbers with K, M, B suffixes
const formatNumberWithSuffix = (value: number | string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) return 'N/A';
  
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}B`;
  } else if (num >= 1_000_000) {
    return `${(num / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}K`;
  } else if (num < 0.01 && num > 0) {
    // Zamiast notacji naukowej, użyjmy bardziej przyjaznego formatu
    if (num < 0.000001) {
      return `${(num * 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}n`;
    } else if (num < 0.001) {
      return `${(num * 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}μ`;
    } else {
      return `${(num * 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}m`;
    }
  }
  
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

export interface ExtendedPost extends Post {
  pollId?: string;
  network?: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain';
  // 🚀 Paid Pin fields
  isPaidPin?: boolean;
  pinExpiresAt?: number;
  // 🤖 AI Generated flag
  isAIGenerated?: boolean;
  pinDuration?: string;
  pinOwner?: string;
  pinAmountPaid?: string;
  pinTxHash?: string;
  // ⏳ Pending Pin fields
  pendingPin?: boolean;
  pendingPinTx?: string;
  pendingPinExpectedAt?: number;
  pendingPinDuration?: string;
}

// Placeholder type for Zora Coin data
interface ZoraCoinData {
  totalSupply?: string;
  uniqueHolders?: number;
  symbol?: string;
  name?: string;
  marketCap?: string;
  volume24h?: string;
  createdAt?: string;
  priceUSD?: string;
  imageUrl?: string;
  priceChange24h?: number; // Add 24h price change percentage
  isFetched?: boolean;
}

// Interface for Zora API response
interface ZoraApiTokenInfo {
  id: string;
  name: string;
  description?: string;
  address: string;
  symbol: string;
  totalSupply: string;
  totalVolume?: string;
  volume24h?: string;
  createdAt?: string;
  creatorAddress?: string;
  marketCap?: string;
  priceUSD?: string;
  uniqueHolders?: number;
  priceChange24h?: number; // Add 24h price change percentage
  media?: {
    previewImage?: string;
    medium?: string;
    blurhash?: string;
  };
}

interface PostListProps {
  showOnlyUserPosts?: boolean;
  searchTerm?: string;
  sortOrder?: 'newest' | 'oldest';
  selectedTag?: string;
  selectedAuthor?: string;
  onRefreshPosts?: (newPosts?: ExtendedPost[]) => Promise<void>;
  onPostAdded?: () => Promise<void>;
  onCommentAdded?: () => Promise<void>;
  displayUserName: (userAddress: string, elementId: string, showAvatar?: boolean) => JSX.Element;
  userNames: {[key: string]: {name: string, avatar?: string}};
  posts: ExtendedPost[];
  isLoading?: boolean;
  disableInfiniteScroll?: boolean; // Nowy prop do wyłączenia infinite scroll
  showMyFeed?: boolean; // Nowy prop dla trybu My Feed
  getCachedPosts?: (cacheKey: string) => ExtendedPost[] | null; // Funkcje cache'owania
  setCachedPosts?: (cacheKey: string, posts: ExtendedPost[]) => void;
  clearPostsCache?: () => void;
  // Pending pins props
  pendingPins?: {[postId: string]: {
    txHash: string;
    duration: string;
    expectedAt: number;
  }};
  onPinPending?: (postId: string, txHash: string, duration: string) => void;
}

// Utility function for extracting hashtags from text
const extractHashtags = (text: string): string[] => {
  const hashtags: string[] = [];
  text.split(/\s+/).forEach(word => {
    if (word.startsWith('#') && word.length > 1) {
      if (!hashtags.includes(word)) {
        hashtags.push(word);
      }
    }
  });
  return hashtags;
};

export default function PostList({
  showOnlyUserPosts = false,
  searchTerm = '',
  sortOrder = 'newest',
  selectedTag = '',
  selectedAuthor = '',
  onRefreshPosts,
  onPostAdded,
  onCommentAdded,
  displayUserName,
  userNames,
  posts,
  isLoading = false,
  disableInfiniteScroll = false,
  showMyFeed = false,
  getCachedPosts,
  setCachedPosts,
  clearPostsCache,
  pendingPins = {},
  onPinPending
}: PostListProps) {
  const [newComments, setNewComments] = useState<{[key: string]: string}>({});
  const [expandedPosts, setExpandedPosts] = useState<{[key: string]: boolean}>({});
  const [expandedComments, setExpandedComments] = useState<{[key: string]: boolean}>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [editingComment, setEditingComment] = useState<{postId: string, commentId: string} | null>(null);
  const [editedCommentContent, setEditedCommentContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<{postId: string, commentId: string} | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [expandedTextPosts, setExpandedTextPosts] = useState<{[key: string]: boolean}>({});
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [lastPostRef, setLastPostRef] = useState<QueryDocumentSnapshot | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [postTokenData, setPostTokenData] = useState<{[postId: string]: ZoraCoinData}>({});
  const [isLoadingTokenData, setIsLoadingTokenData] = useState<{[postId: string]: boolean}>({});
  const [userTokenBalances, setUserTokenBalances] = useState<{[tokenAddress: string]: string}>({});
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  
  // ✅ LAZY LOADING KOMENTARZY: Stan do śledzenia ile komentarzy pokazywać
  const [visibleComments, setVisibleComments] = useState<{[key: string]: number}>({});
  const INITIAL_COMMENTS_COUNT = 5;
  const LOAD_MORE_COMMENTS_COUNT = 3;
  
  // States for transaction modal
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'buy' | 'sell'>('buy');
  const [transactionAmount, setTransactionAmount] = useState('0.01');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [isTransacting, setIsTransacting] = useState(false);
  const [internalPosts, setInternalPosts] = useState<ExtendedPost[]>(posts);
  
  // States for TradeCoinModal
  const [showTradeCoinModal, setShowTradeCoinModal] = useState(false);
  const [tradeCoinData, setTradeCoinData] = useState<CreatorCoinData | null>(null);
  const [tradeCoinBalance, setTradeCoinBalance] = useState<string>('0');
  const [tradeCoinMode, setTradeCoinMode] = useState<'buy' | 'sell'>('buy');
  
  useEffect(() => {
    setInternalPosts(posts);
  }, [posts]);
  
  // Extend Pin Modal state
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendingPostId, setExtendingPostId] = useState<string | null>(null);
  const [extendingExpiresAt, setExtendingExpiresAt] = useState<number>(0);
  
  // Pending Pin state is now managed by parent component via props
  
  // ❌ Usunięto loadMoreTriggerRef - nie potrzebny bez infinite scroll
  const { address, isConnected } = useAccount();

  // 🚀 SOCIAL FEATURES: Hook i stany (MOVED AFTER useAccount)
  const { followUser, unfollowUser, checkIfFollowing } = useSocial(address || null);
  const [followingStatus, setFollowingStatus] = useState<{[address: string]: boolean}>({});
  const [followLoading, setFollowLoading] = useState<{[address: string]: boolean}>({});
  
  // 🎵 Audio Player state for music previews
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [currentTrackUrl, setCurrentTrackUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // 🎵 Cleanup audio when component unmounts
  useEffect(() => {
    return () => {
      if (currentAudio) {
        currentAudio.pause();
        setCurrentAudio(null);
        setIsPlayingAudio(false);
      }
    };
  }, [currentAudio]);
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const networkChainId = useChainId();

  useEffect(() => {
    const handleNewPost = (event: Event) => {
      const newPost = (event as CustomEvent).detail as ExtendedPost;
      // Add the new post to the beginning of the list
      setInternalPosts(prevPosts => [newPost, ...prevPosts]);
    };

    document.addEventListener('post-created', handleNewPost);

    return () => {
      document.removeEventListener('post-created', handleNewPost);
    };
  }, []);

  const formatTimestamp = (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (error) {
      return 'recently';
    }
  };

  // Pending Pin management is now handled by parent component

  const refreshPosts = async () => {
    if (onRefreshPosts) {
      await onRefreshPosts();
    }
  };
  
  // ✅ LAZY LOADING KOMENTARZY: Funkcja do ładowania więcej komentarzy
  const loadMoreComments = (postId: string) => {
    const currentVisible = visibleComments[postId] || INITIAL_COMMENTS_COUNT;
    setVisibleComments(prev => ({
      ...prev,
      [postId]: currentVisible + LOAD_MORE_COMMENTS_COUNT
    }));
  };

  const fetchAndUpdateSinglePost = async (postId: string) => {
    if (onRefreshPosts) {
      await onRefreshPosts();
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!address) return;
    
    try {
      if (confirm('Are you sure you want to delete this post?')) {
        await deletePost(postId, address);
        toast.success('Post deleted successfully');
        
        await refreshPosts();
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post');
      await refreshPosts();
    }
  };

  const handlePinPost = async (postId: string) => {
    if (!address || !isUserAdmin(address)) {
      toast.error('Only admins can pin posts');
      return;
    }
    
    try {
      // ✅ OPTIMISTIC UPDATE: Zaktualizuj post w UI natychmiast
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            isPinned: true,
            pinnedAt: Date.now(),
            pinnedBy: address
          };
        }
        return post;
      });
      
      // Zaktualizuj UI natychmiast z optimistic update
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      // Wykonaj rzeczywistą operację w tle
      const success = await pinPost(postId, address);
      
      if (success) {
        toast.success('Post pinned successfully');
        // ✅ OPTYMALIZACJA: Usunięto refreshPosts - optimistic update już zaktualizował UI
        // Oszczędność: 50 Firebase reads po każdym pin
      } else {
        toast.error('Failed to pin post');
        // W przypadku błędu, przywróć poprzedni stan
        if (onRefreshPosts) {
          await onRefreshPosts();
        }
      }
    } catch (error) {
      console.error('Error pinning post:', error);
      toast.error('Failed to pin post');
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleUnpinPost = async (postId: string) => {
    if (!address || !isUserAdmin(address)) {
      toast.error('Only admins can unpin posts');
      return;
    }
    
    try {
      // ✅ OPTIMISTIC UPDATE: Zaktualizuj post w UI natychmiast
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            isPinned: false,
            pinnedAt: undefined,
            pinnedBy: undefined
          };
        }
        return post;
      });
      
      // Zaktualizuj UI natychmiast z optimistic update
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      // Wykonaj rzeczywistą operację w tle
      const success = await unpinPost(postId, address);
      
      if (success) {
        toast.success('Post unpinned successfully');
        // ✅ OPTYMALIZACJA: Usunięto refreshPosts - optimistic update już zaktualizował UI
        // Oszczędność: 50 Firebase reads po każdym unpin
      } else {
        toast.error('Failed to unpin post');
        // W przypadku błędu, przywróć poprzedni stan
        if (onRefreshPosts) {
          await onRefreshPosts();
        }
      }
    } catch (error) {
      console.error('Error unpinning post:', error);
      toast.error('Failed to unpin post');
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleEditPost = async (postId: string, newContent: string) => {
    if (!address) return;
    
    try {
      // ✅ OPTIMISTIC UPDATE: Zaktualizuj post w UI natychmiast
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
        content: newContent,
            lastEdited: Date.now()
          };
        }
        return post;
      });
      
      // Zaktualizuj UI natychmiast
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      setEditingPost(null);
      setEditedContent('');
      
      // Wykonaj rzeczywistą operację w tle
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        content: newContent,
        lastEdited: serverTimestamp()
      });
      
      toast.success('Post updated successfully');
      
      // ✅ OPTYMALIZACJA: Usunięto refreshPosts - optimistic update już zaktualizował post
      // Oszczędność: 50 Firebase reads po każdej edycji posta
      
    } catch (error) {
      console.error('Error editing post:', error);
      toast.error('Failed to edit post');
      
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  // 🎵 Audio Player Functions
  const playTrack = (previewUrl: string) => {
    if (!previewUrl) return;
    
    // If same track, just toggle play/pause
    if (currentTrackUrl === previewUrl && currentAudio) {
      if (currentAudio.paused) {
        console.log('🎵 Resuming track');
        currentAudio.play();
        setIsPlayingAudio(true);
      } else {
        console.log('⏸️ Pausing track');
        currentAudio.pause();
        setIsPlayingAudio(false);
      }
      return;
    }

    // Stop current track if playing (only for different tracks)
    if (currentAudio) {
      currentAudio.pause();
      setIsPlayingAudio(false);
    }

    // Create new audio for different track
    setIsLoadingAudio(true);
    setCurrentTrackUrl(previewUrl);
    
    const audio = new Audio(previewUrl);
    audio.volume = volume;
    
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setIsLoadingAudio(false);
    });
    
    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });
    
    audio.addEventListener('ended', () => {
      setIsPlayingAudio(false);
      setCurrentTime(0);
    });
    
    audio.addEventListener('error', () => {
      setIsLoadingAudio(false);
      console.error('Failed to load audio');
    });

    setCurrentAudio(audio);
    audio.play();
    setIsPlayingAudio(true);
  };

  const handleAddComment = async (postId: string, txHash: string) => {
    if (!address) return;
    
    try {
      // Określ network na podstawie networkChainId
      let network: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | undefined = undefined;
      if (networkChainId === base.id || networkChainId === baseSepolia.id) {
        network = 'base';
      } else if (networkChainId === BASECAMP_CHAIN_ID) {
        network = 'basecamp';
      } else if (networkChainId === LINEA_CHAIN_ID) {
        network = 'linea';
      } else if (networkChainId === CELO_CHAIN_ID) {
        network = 'celo';
      } else if (networkChainId === ETHEREUM_CHAIN_ID) {
        network = 'ethereum';
      } else if (networkChainId === WORLD_CHAIN_ID) {
        network = 'worldchain';
      }

      const newComment: Comment = {
        id: `temp-${Date.now()}`, // Tymczasowe ID
        postId: postId,
        author: address,
        content: newComments[postId],
        timestamp: Date.now(),
        txHash: txHash,
        likes: 0,
        likedBy: [],
        mentions: [],
        network: network // Dodajemy network komentarza
      };
      
      await addComment(postId, newComment);
      
      setNewComments(prev => ({
        ...prev,
        [postId]: ''
      }));
      
      toast.success('Comment added successfully');
      
      // Optymistyczna aktualizacja UI - dodajemy komentarz lokalnie
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            comments: [...(post.comments || []), newComment]
          };
        }
        return post;
      });

      // Aktualizujemy posty lokalnie, zachowując stan scrollowania
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
      // W przypadku błędu, odświeżamy posty
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!address) return;
    
    try {
      // Znajdź post w obecnej liście
      const postIndex = internalPosts.findIndex(p => p.id === postId);
      if (postIndex === -1) return;
      
      const post = internalPosts[postIndex];
      const isLiked = post.likedBy?.includes(address);
      
      // Utwórz kopię postów, aby nie modyfikować bezpośrednio stanu
      const updatedPosts = [...internalPosts];
      
      // Zaktualizuj konkretny post
      updatedPosts[postIndex] = {
        ...post,
        likes: (post.likes || 0) + (isLiked ? -1 : 1),
        likedBy: isLiked 
          ? (post.likedBy || []).filter(id => id !== address)
          : [...(post.likedBy || []), address]
      };
      
      // Wywołaj onRefreshPosts z zaktualizowaną listą, ale zachowaj pozycję na liście
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      // Wykonaj rzeczywiste żądanie do serwera w tle
      await toggleLike(postId, address);
    } catch (error) {
      console.error('Error toggling like:', error);
      toast.error('Failed to like post');
      // W przypadku błędu, przywróć poprzedni stan poprzez odświeżenie postów
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleEditComment = async (postId: string, commentId: string, newContent: string) => {
    if (!address) return;
    
    try {
      // ✅ OPTIMISTIC UPDATE: Zaktualizuj komentarz w UI natychmiast
      const updatedPosts = internalPosts.map(post => {
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
      
      // Zaktualizuj UI natychmiast
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      setEditingComment(null);
      setEditedCommentContent('');
      
      // Wykonaj rzeczywistą operację w tle
      await editComment(postId, commentId, newContent);
      
      toast.success('Comment updated successfully');
      
      // ✅ OPTYMALIZACJA: Usunięto refreshPosts - optimistic update już zaktualizował komentarz
      // Oszczędność: 50 Firebase reads po każdej edycji komentarza
      
    } catch (error) {
      console.error('Error editing comment:', error);
      toast.error('Failed to edit comment');
      
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!address) return;
    
    try {
      if (confirm('Are you sure you want to delete this comment?')) {
        // ✅ OPTIMISTIC UPDATE: Usuń komentarz z UI natychmiast
        const updatedPosts = internalPosts.map(post => {
          if (post.id === postId) {
            const updatedComments = post.comments?.filter(comment => comment.id !== commentId);
            return { ...post, comments: updatedComments };
          }
          return post;
        });
        
        // Zaktualizuj UI natychmiast
        if (onRefreshPosts) {
          await onRefreshPosts(updatedPosts);
        }
        
        // Wykonaj rzeczywistą operację w tle
        await deleteComment(postId, commentId, address);
        
        toast.success('Comment deleted successfully');
        
        // ✅ OPTYMALIZACJA: Usunięto refreshPosts - optimistic update już usunął komentarz
        // Oszczędność: 50 Firebase reads po każdym usunięciu komentarza
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
      
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleToggleCommentLike = async (postId: string, commentId: string) => {
    if (!address) return;
    
    try {
      // Znajdź post i komentarz
      const postIndex = internalPosts.findIndex(p => p.id === postId);
      if (postIndex === -1) return;
      
      const post = internalPosts[postIndex];
      const comments = post.comments || [];
      const commentIndex = comments.findIndex(c => c.id === commentId);
      if (commentIndex === -1) return;
      
      const comment = comments[commentIndex];
      const isLiked = comment.likedBy?.includes(address);
      
      // Utwórz kopię postów, aby nie modyfikować bezpośrednio stanu
      const updatedPosts = [...internalPosts];
      
      // Zaktualizuj komentarze dla posta
      const updatedComments = [...comments];
      updatedComments[commentIndex] = {
        ...comment,
        likes: (comment.likes || 0) + (isLiked ? -1 : 1),
        likedBy: isLiked 
          ? (comment.likedBy || []).filter(id => id !== address)
          : [...(comment.likedBy || []), address]
      };
      
      // Zaktualizuj post
      updatedPosts[postIndex] = {
        ...post,
        comments: updatedComments
      };
      
      // Zaktualizuj stan bez pełnego odświeżenia
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      // Wykonaj rzeczywiste żądanie do serwera w tle
      await toggleCommentLike(postId, commentId, address);
    } catch (error) {
      console.error('Error toggling comment like:', error);
      toast.error('Failed to like comment');
      // W przypadku błędu, przywróć poprzedni stan
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  // 🚀 FOLLOW/UNFOLLOW HANDLERS (Obsługa obserwowania/przestawania obserwowania)
  const handleFollowUser = async (targetUserAddress: string) => {
    if (!address || targetUserAddress === address) return;
    
    setFollowLoading(prev => ({ ...prev, [targetUserAddress]: true }));
    
    try {
      const success = await followUser(targetUserAddress);
      if (success) {
        setFollowingStatus(prev => ({ ...prev, [targetUserAddress]: true }));
        toast.success('User followed successfully! (Użytkownik obserwowany!)');
      } else {
        toast.error('Failed to follow user (Nie udało się obserwować użytkownika)');
      }
    } catch (error) {
      console.error('Error following user:', error);
      toast.error('Failed to follow user (Nie udało się obserwować użytkownika)');
    } finally {
      setFollowLoading(prev => ({ ...prev, [targetUserAddress]: false }));
    }
  };

  const handleUnfollowUser = async (targetUserAddress: string) => {
    if (!address || targetUserAddress === address) return;
    
    setFollowLoading(prev => ({ ...prev, [targetUserAddress]: true }));
    
    try {
      const success = await unfollowUser(targetUserAddress);
      if (success) {
        setFollowingStatus(prev => ({ ...prev, [targetUserAddress]: false }));
        toast.success('User unfollowed successfully! (Przestałeś obserwować użytkownika!)');
      } else {
        toast.error('Failed to unfollow user (Nie udało się przestać obserwować użytkownika)');
      }
    } catch (error) {
      console.error('Error unfollowing user:', error);
      toast.error('Failed to unfollow user (Nie udało się przestać obserwować użytkownika)');
    } finally {
      setFollowLoading(prev => ({ ...prev, [targetUserAddress]: false }));
    }
  };

  // Check follow status when posts change (Sprawdź status obserwowania gdy posty się zmieniają)
  useEffect(() => {
    if (!address || !posts || posts.length === 0) return;

    const checkFollowStatus = async () => {
      const authorAddresses = [...new Set(posts.map(post => post.author))];
      const followStatuses: {[address: string]: boolean} = {};
      
      for (const authorAddress of authorAddresses) {
        if (authorAddress !== address) { // Don't check for self
          try {
            const isFollowing = await checkIfFollowing(authorAddress);
            followStatuses[authorAddress] = isFollowing;
          } catch (error) {
            console.error('Error checking follow status:', error);
            followStatuses[authorAddress] = false;
          }
        }
      }
      
      setFollowingStatus(followStatuses);
    };

    checkFollowStatus();
  }, [posts, address, checkIfFollowing]);

  const handleAddReply = async (postId: string, commentId: string, txHash?: string) => {
    if (!address || !replyContent.trim()) return;
    
    try {
      // Określ network na podstawie networkChainId
      let network: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | undefined = undefined;
      if (networkChainId === base.id || networkChainId === baseSepolia.id) {
        network = 'base';
      } else if (networkChainId === BASECAMP_CHAIN_ID) {
        network = 'basecamp';
      } else if (networkChainId === LINEA_CHAIN_ID) {
        network = 'linea';
      } else if (networkChainId === CELO_CHAIN_ID) {
        network = 'celo';
      } else if (networkChainId === ETHEREUM_CHAIN_ID) {
        network = 'ethereum';
      } else if (networkChainId === WORLD_CHAIN_ID) {
        network = 'worldchain';
      }

      // Dodajemy odpowiedź z poprawnie ustawionym polem replyTo
      const newReply = await addCommentReply(postId, commentId, {
        author: address,
        content: replyContent.trim(),
        txHash, // Uproszczona wersja, pozwalamy aby undefined było przekazywane
        network: network
      });
      
      setReplyingTo(null);
      setReplyContent('');
      
      // Optymistyczna aktualizacja UI - dodajemy odpowiedź lokalnie
      const updatedPosts = internalPosts.map(post => {
        if (post.id === postId) {
          // Tworzymy nową odpowiedź zgodną z typem Comment
          const newReplyComment: Comment = {
            id: newReply.id,
            postId: postId,
            author: address,
            content: replyContent.trim(),
            timestamp: Date.now(),
            likes: 0,
            likedBy: [],
            mentions: [],
            replyTo: commentId, // Kluczowe pole - oznaczamy, że to odpowiedź do konkretnego komentarza
            txHash, // Uproszczona wersja bez null
            network: network // Dodajemy network odpowiedzi
          };
          
          return {
            ...post,
            comments: [
              ...(post.comments || []),
              newReplyComment
            ]
          };
        }
        return post;
      });
      
      // Aktualizujemy stan bez pełnego odświeżenia
      if (onRefreshPosts) {
        await onRefreshPosts(updatedPosts);
      }
      
      toast.success('Reply added successfully');
    } catch (error) {
      console.error('Error adding reply:', error);
      toast.error('Failed to add reply');
      // W przypadku błędu, pełne odświeżenie
      await refreshPosts();
    }
  };

  const filteredPosts = showOnlyUserPosts ? internalPosts.filter(post => post.author === address) : internalPosts;

  const searchFilteredPosts = filteredPosts.filter(post => {
    const matchesSearch = searchTerm === '' || 
      post.content.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTag = !selectedTag || (post.tags && post.tags.includes(selectedTag));

    const matchesAuthor = !selectedAuthor || post.author === selectedAuthor;

    return matchesSearch && matchesTag && matchesAuthor;
  });

  const sortedPosts = [...searchFilteredPosts].sort((a, b) => {
    if (sortOrder === 'newest') {
      return b.timestamp - a.timestamp;
    } else {
      return a.timestamp - b.timestamp;
    }
  });

  const [displayLimit, setDisplayLimit] = useState(15); // ⚡ OPTYMALIZACJA: Start z 15 postów (-40% Firebase reads)
  const MAX_DISPLAY_LIMIT = 150; // Maksymalnie 150 postów (zmniejszono dla oszczędności)
  const displayedPosts = sortedPosts.slice(0, Math.min(displayLimit, MAX_DISPLAY_LIMIT));

  // ❌ USUNIĘTO DRUGI INFINITE SCROLL obserwator - oszczędność Firebase reads/writes

  const loadMorePosts = async () => {
    if (!hasMorePosts || isLoadingMore || !address) return;
    
    try {
      setIsLoadingMore(true);
      
      // Pobierz następną partię postów
      const { posts: morePosts, lastVisible: newLastVisible } = await fetchPosts({
        userId: address,
        startAfter: lastVisible,
        limit: 15, // ⚡ OPTYMALIZACJA: Pobieraj 15 postów za razem (-40% Firebase reads)
        ...(showMyFeed ? { authorFilter: address } : {}) // Pobierz tylko posty użytkownika gdy showMyFeed=true
      });
      
      if (morePosts.length > 0) {
        // Sprawdź, czy nowe posty nie są duplikatami (porównaj przez ID)
        const existingPostIds = new Set(internalPosts.map(post => post.id));
        const uniqueNewPosts = morePosts.filter(post => !existingPostIds.has(post.id));
        
        if (uniqueNewPosts.length > 0) {
          // ⚡ OPTYMALIZACJA: Zwiększ displayLimit żeby pokazać nowe posty
          setDisplayLimit(prev => Math.min(prev + uniqueNewPosts.length, MAX_DISPLAY_LIMIT));
          
          // Dodaj nowe posty do istniejących bez resetowania widoku
          if (onRefreshPosts) {
            // Połącz istniejące posty z nowymi
            const allPosts = [...internalPosts, ...uniqueNewPosts];
            await onRefreshPosts(allPosts);
            console.log(`Załadowano ${uniqueNewPosts.length} nowych postów`);
          }
        } else {
          console.log('Brak nowych unikalnych postów do załadowania');
        }
      }
      
      // Zaktualizuj referencję do ostatniego dokumentu
      if (newLastVisible) {
        setLastVisible(newLastVisible);
      }
      
      // Sprawdź, czy są jeszcze posty do załadowania
      setHasMorePosts(morePosts.length > 0);
      
    } catch (error) {
      console.error('Error loading more posts:', error);
      // 🗑️ Wyczyść cache w przypadku błędu
      if (clearPostsCache) {
        clearPostsCache();
      }
      toast.error('Failed to load more posts');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // ❌ USUNIĘTO INFINITE SCROLL - oszczędność Firebase reads/writes
  // Teraz tylko przycisk "Load More" będzie kontrolować ładowanie kolejnych postów

  useEffect(() => {
    const setInitialLastVisible = async () => {
      if (internalPosts.length > 0 && !lastVisible && address) {
        try {
          const { posts: fetchedPosts, lastVisible: newLastVisible } = await fetchPosts({
            userId: address,
            limit: internalPosts.length, // Pobierz tyle postów, ile już mamy, żeby uzyskać poprawny lastVisible
            ...(showMyFeed ? { authorFilter: address } : {}) // Pobierz tylko posty użytkownika gdy showMyFeed=true
          });
          
          setLastVisible(newLastVisible);
    } catch (error) {
          console.error('Error setting initial lastVisible:', error);
          // 🗑️ Wyczyść cache w przypadku błędu
          if (clearPostsCache) {
            clearPostsCache();
          }
        }
      }
    };
    
    setInitialLastVisible();
  }, [internalPosts, address, lastVisible, showMyFeed]);

  useEffect(() => {
    const fetchAllTokenData = async () => {
      // Pobierz tylko posty z adresami zoraCoinAddress, które nie mają jeszcze danych w cache
      const tokenPostsToFetch = internalPosts.filter(post => 
        post.zoraCoinAddress && 
        (!postTokenData[post.id] || !postTokenData[post.id].isFetched)
      );

      if (tokenPostsToFetch.length === 0) return;

      console.log(`Fetching Zora data for ${tokenPostsToFetch.length} new posts...`);

      // Use Promise.allSettled to fetch data for all posts concurrently
      // and handle potential errors for individual posts
      const results = await Promise.allSettled(
        tokenPostsToFetch.map(async (post) => {
          if (!post.zoraCoinAddress) return { postId: post.id, data: null }; // Should not happen due to filter

          // Indicate loading for this specific post
          setIsLoadingTokenData(prev => ({ ...prev, [post.id]: true }));

          try {
            // Timeout dla zapytania, aby uniknąć zawieszenia
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout fetching token data')), 5000)
            );
            
            // Race między rzeczywistym zapytaniem a timeoutem
            const response = await Promise.race([
              getCachedCoin(post.zoraCoinAddress),
              timeoutPromise
            ]) as any;
            
            const tokenInfo = response?.data?.zora20Token as unknown as ZoraApiTokenInfo;
            
            if (tokenInfo) {
              // Basic data extraction - simplified due to typing issues
              const data: ZoraCoinData = {
                totalSupply: tokenInfo.totalSupply || undefined,
                uniqueHolders: tokenInfo.uniqueHolders || undefined,
                symbol: tokenInfo.symbol || 'POST',
                name: tokenInfo.name || 'POST',
                marketCap: tokenInfo.marketCap,
                volume24h: tokenInfo.volume24h,
                createdAt: tokenInfo.createdAt,
                priceUSD: tokenInfo.priceUSD,
                imageUrl: tokenInfo.media?.previewImage || tokenInfo.media?.medium,
                priceChange24h: tokenInfo.priceChange24h,
                isFetched: true // Mark as fetched for caching
              };
              return { postId: post.id, data };
            } else {
              console.warn(`No Zora token data found for address: ${post.zoraCoinAddress}`);
              return { postId: post.id, data: { isFetched: true } }; // Mark as fetched even if no data
            }
          } catch (error) {
            console.error(`Error fetching Zora data for post ${post.id} (${post.zoraCoinAddress}):`, error);
            return { postId: post.id, data: { isFetched: true }, error: true }; // Mark as fetched with error
          } finally {
            // Finish loading for this specific post
            setIsLoadingTokenData(prev => ({ ...prev, [post.id]: false }));
          }
        })
      );

      // Update the state with fetched data
      setPostTokenData(prevData => {
        const newData = { ...prevData };
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value && result.value.data) {
            newData[result.value.postId] = result.value.data;
          } else if (result.status === 'fulfilled' && result.value && result.value.error) {
            // Optionally handle posts where data fetching failed
            if (!newData[result.value.postId]) {
              newData[result.value.postId] = { isFetched: true }; // Mark as attempted
            }
          } else if (result.status === 'rejected') {
            // Handle unexpected promise rejection
            console.error("Unexpected error fetching Zora data:", result.reason);
          }
        });
        return newData;
      });
    };

    if (internalPosts?.length > 0) {
      fetchAllTokenData();
    }

    // Teraz zależymy tylko od długości tablicy postów zamiast całej tablicy
    // co zapobiega niepotrzebnym re-renderom i wielokrotnym zapytaniom API
  }, [internalPosts.length, postTokenData]); // Zmienione zależności

  useEffect(() => {
    // Fetch user token balances directly from blockchain (most reliable)
    const fetchUserBalances = async () => {
      if (!address || !publicClient) return;
      
      try {
        setIsLoadingBalances(true);
        
        // Get all unique token addresses from posts
        const tokenAddresses = [...new Set(
          internalPosts
            .filter(post => post.zoraCoinAddress)
            .map(post => post.zoraCoinAddress as string)
        )];
        
        if (tokenAddresses.length === 0) {
          setIsLoadingBalances(false);
          return;
        }
        
        const freshBalances: {[tokenAddress: string]: string} = {};
        
        // Fetch balances directly from blockchain using ERC20 balanceOf
        await Promise.all(
          tokenAddresses.map(async (tokenAddress) => {
            try {
              const balance = await publicClient.readContract({
                address: tokenAddress as `0x${string}`,
                abi: ERC20_BALANCE_ABI,
                functionName: 'balanceOf',
                args: [address as `0x${string}`],
              });
              
              const formattedBalance = formatUnits(balance, 18);
              freshBalances[tokenAddress.toLowerCase()] = formattedBalance;
              
              // Save to localStorage cache
              const cacheKey = `token_balance_${address.toLowerCase()}_${tokenAddress.toLowerCase()}`;
              localStorage.setItem(cacheKey, JSON.stringify({
                balance: formattedBalance,
                timestamp: Date.now()
              }));
            } catch (err) {
              console.error(`Error fetching balance for ${tokenAddress}:`, err);
              freshBalances[tokenAddress.toLowerCase()] = '0';
            }
          })
        );
        
        setUserTokenBalances(freshBalances);
      } catch (error) {
        console.error('Error fetching user balances:', error);
      } finally {
        setIsLoadingBalances(false);
      }
    };
    
    fetchUserBalances();
  }, [address, internalPosts, publicClient]);

  // Function to refresh balances after trade - fetches directly from blockchain
  const refreshBalancesAfterTrade = useCallback(async () => {
    if (!address || !publicClient) return;
    
    try {
      setIsLoadingBalances(true);
      
      // Get all unique token addresses from posts
      const tokenAddresses = [...new Set(
        internalPosts
          .filter(post => post.zoraCoinAddress)
          .map(post => post.zoraCoinAddress as string)
      )];
      
      if (tokenAddresses.length === 0) {
        setIsLoadingBalances(false);
        return;
      }
      
      const freshBalances: {[tokenAddress: string]: string} = {};
      
      // Fetch balances directly from blockchain
      await Promise.all(
        tokenAddresses.map(async (tokenAddress) => {
          try {
            const balance = await publicClient.readContract({
              address: tokenAddress as `0x${string}`,
              abi: ERC20_BALANCE_ABI,
              functionName: 'balanceOf',
              args: [address as `0x${string}`],
            });
            
            const formattedBalance = formatUnits(balance, 18);
            freshBalances[tokenAddress.toLowerCase()] = formattedBalance;
            
            // Update localStorage cache
            const cacheKey = `token_balance_${address.toLowerCase()}_${tokenAddress.toLowerCase()}`;
            localStorage.setItem(cacheKey, JSON.stringify({
              balance: formattedBalance,
              timestamp: Date.now()
            }));
          } catch (err) {
            console.error(`Error refreshing balance for ${tokenAddress}:`, err);
          }
        })
      );
      
      setUserTokenBalances(prev => ({ ...prev, ...freshBalances }));
    } catch (error) {
      console.error('Error refreshing balances:', error);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [address, publicClient, internalPosts]);

  // Trading functions removed - now handled by direct links to Zora.co in the UI

  const renderComments = (post: ExtendedPost) => {
    // Check if post is from BaseCamp network
    const isBaseCampPost = post.network === 'basecamp';
    
    // Split comments into main comments and replies
    const comments = post.comments || [];
    
    // Group by main comments and replies
    const mainComments = comments.filter((c: Comment) => !c.replyTo);
    const repliesByCommentId: {[key: string]: Comment[]} = {};
    
    comments.filter((c: Comment) => c.replyTo).forEach((c: Comment) => {
      if (c.replyTo) {
        if (!repliesByCommentId[c.replyTo]) {
          repliesByCommentId[c.replyTo] = [];
        }
        repliesByCommentId[c.replyTo].push(c);
      }
    });
    
    // ✅ LAZY LOADING KOMENTARZY: Liczba komentarzy do pokazania
    const visibleCount = visibleComments[post.id] || INITIAL_COMMENTS_COUNT;
    const visibleMainComments = mainComments.slice(0, visibleCount);
    const hasMoreComments = mainComments.length > visibleCount;
    
    return (
      <div className="space-y-6">
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <textarea
              value={newComments[post.id] || ''}
            onChange={(e) => setNewComments(prev => ({...prev, [post.id]: e.target.value}))}
              placeholder="Write a comment..."
            className="w-full p-3 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white"
              rows={2}
            />
          
            <div className="flex justify-end mt-2">
            {/* Show comment button based on user's connected network chainId instead of post network */}
            {networkChainId === BASECAMP_CHAIN_ID ? (
              <CommentTransactionButtonBaseCamp
                content={newComments[post.id] || ''}
                onTransactionSuccess={(txHash) => handleAddComment(post.id, txHash)}
                disabled={!newComments[post.id]?.trim()}
                onCommentAdded={onCommentAdded}
              />
            ) : networkChainId === CELO_CHAIN_ID ? (
              <CommentTransactionButtonCelo
                content={newComments[post.id] || ''}
                onTransactionSuccess={(txHash) => handleAddComment(post.id, txHash)}
                disabled={!newComments[post.id]?.trim()}
                onCommentAdded={onCommentAdded}
              />
            ) : networkChainId === ETHEREUM_CHAIN_ID ? (
              <CommentTransactionButtonEthereum
                content={newComments[post.id] || ''}
                onTransactionSuccess={(txHash) => handleAddComment(post.id, txHash)}
                disabled={!newComments[post.id]?.trim()}
                onCommentAdded={onCommentAdded}
              />
            ) : networkChainId === WORLD_CHAIN_ID ? (
              <CommentTransactionButtonWorldChain
                content={newComments[post.id] || ''}
                onTransactionSuccess={(txHash) => handleAddComment(post.id, txHash)}
                disabled={!newComments[post.id]?.trim()}
                onCommentAdded={onCommentAdded}
              />
            ) : networkChainId === LINEA_CHAIN_ID ? (
              <CommentTransactionButtonLinea
                content={newComments[post.id] || ''}
                onTransactionSuccess={(txHash) => handleAddComment(post.id, txHash)}
                disabled={!newComments[post.id]?.trim()}
                onCommentAdded={onCommentAdded}
              />
            ) : (networkChainId === base.id || networkChainId === baseSepolia.id) ? (
              <CommentTransactionButton
                content={newComments[post.id] || ''}
                onTransactionSuccess={(txHash) => handleAddComment(post.id, txHash)}
                disabled={!newComments[post.id]?.trim()}
                onCommentAdded={onCommentAdded}
              />
            ) : (
              <CommentTransactionButton
                content={newComments[post.id] || ''}
                onTransactionSuccess={(txHash) => handleAddComment(post.id, txHash)}
                disabled={!newComments[post.id]?.trim()}
                onCommentAdded={onCommentAdded}
              />
            )}
          </div>
        </div>

        {visibleMainComments.map((comment: Comment, index: number) => (
          <div key={comment.id} className={`border-l-2 border-gray-200 dark:border-gray-700 pl-3 pb-3 ${index > 0 ? 'pt-3 border-t border-gray-100 dark:border-gray-800' : ''}`}>
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                {userNames[comment.author]?.avatar ? (
                  <img
                    src={userNames[comment.author].avatar}
                    alt="Profile"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <CoinbaseAvatar address={comment.author as `0x${string}`} className="w-8 h-8 rounded-full" />
                )}
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {displayUserName(comment.author, `comment-${comment.id}`, false)}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        {formatTimestamp(comment.timestamp)}
                      </span>
                      
                      {/* Network badges for comments */}
                      {comment.network === 'basecamp' && (
                        <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-orange-50/30 dark:bg-orange-900/20 shadow-sm">
                          <svg 
                            className="w-3 h-3 drop-shadow-md"
                            viewBox="0 0 600 600"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M300 0C134.3 0 0 134.3 0 300s134.3 300 300 300 300-134.3 300-300S465.7 0 300 0z" fill="#000"/>
                            <path d="M300 100c-110.5 0-200 89.5-200 200s89.5 200 200 200 200-89.5 200-200-89.5-200-200-200z" fill="#fff"/>
                            <path d="M330 190c0 0-30 40-10 80 20 40 20 90-20 120 0 0 70-30 70-100 0-70-40-100-40-100z" fill="#FF6B00"/>
                            <path d="M270 230c0 0-20 30-10 60 10 30 10 60-30 80 0 0 60-10 60-60 0-50-20-80-20-80z" fill="#FF6B00"/>
                          </svg>
                        </div>
                      )}
                      
                      {comment.network === 'base' && (
                        <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-blue-50/30 dark:bg-blue-900/20 shadow-sm">
                          <img 
                            src="/logotypy/Base_lockup_2color.png"
                            alt="Base"
                            className="h-3 drop-shadow-md"
                          />
                        </div>
                      )}
                      
                      {comment.network === 'linea' && (
                        <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-cyan-50/30 dark:bg-cyan-900/20 shadow-sm">
                          <img 
                            src="/Logomark Blue BG.svg"
                            alt="Linea"
                            className="w-3 h-3 drop-shadow-md"
                          />
                        </div>
                      )}
                      
                      {comment.network === 'celo' && (
                        <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-green-50/30 dark:bg-green-900/20 shadow-sm">
                          <img 
                            src="/logotypy/ENL3ZjX9OnprxVs5u8A81khADqA.webp"
                            alt="Celo"
                            className="h-4 drop-shadow-md"
                          />
                        </div>
                      )}
                      
                      {comment.network === 'ethereum' && (
                        <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-blue-50/30 dark:bg-blue-900/20 shadow-sm">
                          <img 
                            src="/ethlogo.png"
                            alt="Ethereum"
                            className="w-3 h-3 drop-shadow-md"
                          />
                        </div>
                      )}
                      
                      {comment.network === 'worldchain' && (
                        <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-purple-50/30 dark:bg-purple-900/20 shadow-sm">
                          <div className="bg-white rounded-full p-0.5 flex items-center justify-center drop-shadow-md">
                            <img 
                              src="/logotypy/logo.svg"
                              alt="World Chain"
                              className="h-2.5 drop-shadow-md"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    {editingComment && editingComment.commentId === comment.id ? (
                      <div className="mt-1">
                        <textarea
                          value={editedCommentContent}
                          onChange={(e) => setEditedCommentContent(e.target.value)}
                          className="w-full p-2 text-sm border rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                          rows={2}
                        />
                        <div className="flex justify-end mt-1 space-x-2">
                          <button
                            onClick={() => handleEditComment(post.id, comment.id, editedCommentContent)}
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingComment(null);
                              setEditedCommentContent('');
                            }}
                            className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap">
                        {comment.content}
                      </div>
                    )}
                  </div>
                  
                  {(comment.author === address || address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()) && !editingComment && (
                    <div className="flex space-x-1">
                      {comment.author === address && (
                        <button
                          onClick={() => {
                            setEditingComment({ postId: post.id, commentId: comment.id });
                            setEditedCommentContent(comment.content);
                          }}
                          className="text-gray-400 hover:text-blue-500"
                        >
                          <svg className="w-4 h-4 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteComment(post.id, comment.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <svg className="w-4 h-4 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center mt-1 text-xs text-gray-500 space-x-2">
                  <button
                    onClick={() => handleToggleCommentLike(post.id, comment.id)}
                    className={`flex items-center ${
                      comment.likedBy?.includes(address || '') ? 'text-blue-500' : 'hover:text-blue-500'
                    }`}
                  >
                    {comment.likedBy?.includes(address || '') ? (
                      <svg className="w-4 h-4 mr-1 transform scale-95" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 mr-1 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    )}
                    {comment.likes || 0}
                  </button>
                  <button 
                    onClick={() => setReplyingTo({ postId: post.id, commentId: comment.id })}
                    className="flex items-center hover:text-blue-500"
                  >
                    <svg className="w-4 h-4 mr-1 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Reply
                  </button>
                </div>

                {replyingTo && replyingTo.commentId === comment.id && (
                  <div className="mt-2 pl-3 border-l-2 border-blue-200 dark:border-blue-700">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Write a reply..."
                      className="w-full p-2 text-xs border rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                    <div className="flex justify-end mt-1 space-x-2">
                      {networkChainId === BASECAMP_CHAIN_ID ? (
                        <CommentTransactionButtonBaseCamp 
                          content={replyContent} 
                          disabled={!replyContent.trim()} 
                          onTransactionSuccess={(txHash) => handleAddReply(post.id, comment.id, txHash)}
                        />
                      ) : networkChainId === CELO_CHAIN_ID ? (
                        <CommentTransactionButtonCelo
                          content={replyContent} 
                          disabled={!replyContent.trim()} 
                          onTransactionSuccess={(txHash) => handleAddReply(post.id, comment.id, txHash)}
                        />
                      ) : networkChainId === ETHEREUM_CHAIN_ID ? (
                        <CommentTransactionButtonEthereum
                          content={replyContent} 
                          disabled={!replyContent.trim()} 
                          onTransactionSuccess={(txHash) => handleAddReply(post.id, comment.id, txHash)}
                        />
                      ) : networkChainId === WORLD_CHAIN_ID ? (
                        <CommentTransactionButtonWorldChain
                          content={replyContent} 
                          disabled={!replyContent.trim()} 
                          onTransactionSuccess={(txHash) => handleAddReply(post.id, comment.id, txHash)}
                        />
                      ) : networkChainId === LINEA_CHAIN_ID ? (
                        <CommentTransactionButtonLinea
                          content={replyContent} 
                          disabled={!replyContent.trim()} 
                          onTransactionSuccess={(txHash) => handleAddReply(post.id, comment.id, txHash)}
                        />
                      ) : (networkChainId === base.id || networkChainId === baseSepolia.id) ? (
                      <CommentTransactionButton 
                        content={replyContent} 
                        disabled={!replyContent.trim()} 
                        onTransactionSuccess={(txHash) => handleAddReply(post.id, comment.id, txHash)}
                      />
                      ) : (
                      <CommentTransactionButton 
                        content={replyContent} 
                        disabled={!replyContent.trim()} 
                        onTransactionSuccess={(txHash) => handleAddReply(post.id, comment.id, txHash)}
                      />
                      )}
                    </div>
                  </div>
                )}

                {/* Wyświetlamy odpowiedzi do tego komentarza */}
                {repliesByCommentId[comment.id] && repliesByCommentId[comment.id].length > 0 && (
                  <div className="mt-3 pl-3 border-l-2 border-gray-100 dark:border-gray-800 space-y-2">
                    {repliesByCommentId[comment.id].map((reply: Comment, replyIndex: number) => (
                      <div key={reply.id || replyIndex} className={`text-xs ${replyIndex > 0 ? 'mt-2 pt-2 border-t border-gray-50 dark:border-gray-900' : ''}`}>
                        <div className="flex items-start">
                          <div className="flex-shrink-0 mt-1">
                            {userNames[reply.author]?.avatar ? (
                              <img
                                src={userNames[reply.author].avatar}
                                alt="Profile"
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            ) : (
                              <CoinbaseAvatar address={reply.author as `0x${string}`} className="w-6 h-6 rounded-full" />
                            )}
                          </div>
                          <div className="ml-2 flex-1">
                            <div className="flex items-center">
                              <span className="font-medium text-gray-900 dark:text-white text-xs">
                                {displayUserName(reply.author, `reply-${comment.id}-${replyIndex}`, false)}
                              </span>
                              <span className="text-[10px] text-gray-500 ml-1.5">
                                {formatTimestamp(reply.timestamp)}
                              </span>
                              
                              {/* Network badges for replies */}
                              {reply.network === 'basecamp' && (
                                <div className="flex items-center ml-1.5 px-1.5 py-0.5 rounded-full bg-orange-50/30 dark:bg-orange-900/20 shadow-sm">
                                  <svg 
                                    className="w-2.5 h-2.5 drop-shadow-md"
                                    viewBox="0 0 600 600"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path d="M300 0C134.3 0 0 134.3 0 300s134.3 300 300 300 300-134.3 300-300S465.7 0 300 0z" fill="#000"/>
                                    <path d="M300 100c-110.5 0-200 89.5-200 200s89.5 200 200 200 200-89.5 200-200-89.5-200-200-200z" fill="#fff"/>
                                    <path d="M330 190c0 0-30 40-10 80 20 40 20 90-20 120 0 0 70-30 70-100 0-70-40-100-40-100z" fill="#FF6B00"/>
                                    <path d="M270 230c0 0-20 30-10 60 10 30 10 60-30 80 0 0 60-10 60-60 0-50-20-80-20-80z" fill="#FF6B00"/>
                                  </svg>
                                </div>
                              )}
                              
                              {reply.network === 'base' && (
                                <div className="flex items-center ml-1.5 px-1.5 py-0.5 rounded-full bg-blue-50/30 dark:bg-blue-900/20 shadow-sm">
                                  <img 
                                    src="/logotypy/Base_lockup_2color.png"
                                    alt="Base"
                                    className="h-2.5 drop-shadow-md"
                                  />
                                </div>
                              )}
                              
                              {reply.network === 'linea' && (
                                <div className="flex items-center ml-1.5 px-1.5 py-0.5 rounded-full bg-cyan-50/30 dark:bg-cyan-900/20 shadow-sm">
                                  <img 
                                    src="/Logomark Blue BG.svg"
                                    alt="Linea"
                                    className="w-2.5 h-2.5 drop-shadow-md"
                                  />
                                </div>
                              )}
                              
                              {reply.network === 'celo' && (
                                <div className="flex items-center ml-1.5 px-1.5 py-0.5 rounded-full bg-green-50/30 dark:bg-green-900/20 shadow-sm">
                                  <img 
                                    src="/logotypy/ENL3ZjX9OnprxVs5u8A81khADqA.webp"
                                    alt="Celo"
                                    className="h-3 drop-shadow-md"
                                  />
                                </div>
                              )}
                              
                              {reply.network === 'ethereum' && (
                                <div className="flex items-center ml-1.5 px-1.5 py-0.5 rounded-full bg-blue-50/30 dark:bg-blue-900/20 shadow-sm">
                                  <img 
                                    src="/ethlogo.png"
                                    alt="Ethereum"
                                    className="w-2.5 h-2.5 drop-shadow-md"
                                  />
                                </div>
                              )}
                              
                              {reply.network === 'worldchain' && (
                                <div className="flex items-center ml-1.5 px-1.5 py-0.5 rounded-full bg-purple-50/30 dark:bg-purple-900/20 shadow-sm">
                                  <div className="bg-white rounded-full p-0.5 flex items-center justify-center drop-shadow-md">
                                    <img 
                                      src="/logotypy/logo.svg"
                                      alt="World Chain"
                                      className="h-2 drop-shadow-md"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-gray-800 dark:text-gray-200 mt-0.5 whitespace-pre-wrap">
                              {reply.content}
                            </div>
                            {/* Dodajemy przycisk lajkowania i usuwania odpowiedzi */}
                            <div className="flex items-center mt-1 text-xs text-gray-500 space-x-2">
                              <button
                                onClick={() => handleToggleCommentLike(post.id, reply.id)}
                                className={`flex items-center ${
                                  reply.likedBy?.includes(address || '') ? 'text-blue-500' : 'hover:text-blue-500'
                                }`}
                              >
                                {reply.likedBy?.includes(address || '') ? (
                                  <svg className="w-3 h-3 mr-0.5 transform scale-95" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 mr-0.5 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                  </svg>
                                )}
                                <span className="text-[10px]">{reply.likes || 0}</span>
                              </button>
                              
                              {/* Przycisk usunięcia odpowiedzi - wyświetlany dla autora odpowiedzi lub admina */}
                              {(reply.author === address || address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()) && (
                                <button
                                  onClick={() => handleDeleteComment(post.id, reply.id)}
                                  className="flex items-center hover:text-red-500"
                                >
                                  <svg className="w-3 h-3 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {/* ✅ LAZY LOADING KOMENTARZY: Przycisk "Load more comments" */}
        {hasMoreComments && (
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={() => loadMoreComments(post.id)}
              className="w-full py-2 px-4 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span>Load {Math.min(LOAD_MORE_COMMENTS_COUNT, mainComments.length - visibleCount)} more comments ({mainComments.length - visibleCount} remaining)</span>
            </button>
                  </div>
      )}
    </div>
  );
};

  const renderPost = (post: ExtendedPost) => {
    const isLiked = post.likedBy?.includes(address ?? '');
    const isAuthor = post.author === address;
    const commentCount = post.comments?.length || 0;
    const postDate = formatTimestamp(post.timestamp);
    const canEdit = isAuthor || address?.toLowerCase() === ADMIN_ADDRESS;
    const canDelete = isAuthor || address?.toLowerCase() === ADMIN_ADDRESS;
    const isTextExpanded = expandedTextPosts[post.id] || false;
    const zoraData = postTokenData[post.id];
    const isLoadingData = isLoadingTokenData[post.id];
    const isBaseCampPost = post.network === 'basecamp';

    return (
      <div key={`post-${post.id}`} className={`bg-white dark:bg-gray-800 rounded-xl shadow p-4 mb-4 border relative ${
        post.isPinned 
          ? 'border-yellow-300 dark:border-yellow-600 shadow-yellow-100 dark:shadow-yellow-900/20 shadow-lg' 
          : 'border-gray-100 dark:border-gray-700'
      }`}>
        {/* Gradient overlay dla przypięć */}
        {post.isPinned && (
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-50/30 via-transparent to-yellow-50/30 dark:from-yellow-900/10 dark:via-transparent dark:to-yellow-900/10 rounded-xl pointer-events-none" />
        )}
        <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              {userNames[post.author]?.avatar ? (
                <img
                  src={userNames[post.author].avatar}
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <CoinbaseAvatar address={post.author as `0x${string}`} className="w-8 h-8 rounded-full" />
              )}
            </div>
            <div className="flex items-center">
              {displayUserName(post.author, `post-author-${post.id}`, false)}
              
              {/* Przypięcie - żółta gwiazdka */}
              {post.isPinned && (
                <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-yellow-50/50 dark:bg-yellow-900/20 shadow-sm">
                  <svg 
                    className="w-4 h-4 text-yellow-500 drop-shadow-md"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span className="ml-1 text-xs bg-gradient-to-r from-yellow-600 to-orange-500 text-transparent bg-clip-text font-bold drop-shadow-sm">Pinned</span>
                </div>
              )}
              
              {/* BaseCamp badge */}
              {isBaseCampPost && (
                <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-orange-50/30 dark:bg-orange-900/20 shadow-sm">
                  <svg 
                    className="w-4 h-4 drop-shadow-md"
                    viewBox="0 0 600 600"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M300 0C134.3 0 0 134.3 0 300s134.3 300 300 300 300-134.3 300-300S465.7 0 300 0z" fill="#000"/>
                    <path d="M300 100c-110.5 0-200 89.5-200 200s89.5 200 200 200 200-89.5 200-200-89.5-200-200-200z" fill="#fff"/>
                    <path d="M330 190c0 0-30 40-10 80 20 40 20 90-20 120 0 0 70-30 70-100 0-70-40-100-40-100z" fill="#FF6B00"/>
                    <path d="M270 230c0 0-20 30-10 60 10 30 10 60-30 80 0 0 60-10 60-60 0-50-20-80-20-80z" fill="#FF6B00"/>
                  </svg>
                  <span className="ml-1 text-xs bg-gradient-to-r from-orange-600 to-yellow-500 text-transparent bg-clip-text font-bold drop-shadow-sm">Camp Network</span>
                </div>
              )}
              
              {/* Base network badge */}
              {post.network === 'base' && (
                <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-blue-50/30 dark:bg-blue-900/20 shadow-sm">
                  <img 
                    src="/logotypy/Base_lockup_2color.png"
                    alt="Base"
                    className="h-3 drop-shadow-md"
                  />
                </div>
              )}
              
              {/* Linea network badge */}
              {post.network === 'linea' && (
                <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-cyan-50/30 dark:bg-cyan-900/20 shadow-sm">
                  <img 
                    src="/Logomark Blue BG.svg"
                    alt="Linea"
                    className="w-4 h-4 drop-shadow-md"
                  />
                  <span className="ml-1 text-xs bg-gradient-to-r from-cyan-600 to-blue-500 text-transparent bg-clip-text font-bold drop-shadow-sm">Linea</span>
                </div>
              )}

              {/* Celo network badge */}
              {post.network === 'celo' && (
                <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-green-50/30 dark:bg-green-900/20 shadow-sm">
                  <img 
                    src="/logotypy/ENL3ZjX9OnprxVs5u8A81khADqA.webp"
                    alt="Celo"
                    className="h-5 drop-shadow-md"
                  />
                </div>
              )}

              {/* Ethereum network badge */}
              {post.network === 'ethereum' && (
                <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-blue-50/30 dark:bg-blue-900/20 shadow-sm">
                  <img 
                    src="/ethlogo.png"
                    alt="Ethereum"
                    className="w-4 h-4 drop-shadow-md"
                  />
                  <span className="ml-1 text-xs bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text font-bold drop-shadow-sm">ETH</span>
                </div>
              )}

              {/* World Chain network badge */}
              {post.network === 'worldchain' && (
                <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-purple-50/30 dark:bg-purple-900/20 shadow-sm">
                  <div className="bg-white rounded-full p-0.5 flex items-center justify-center drop-shadow-md">
                    <img 
                      src="/logotypy/logo.svg"
                      alt="World Chain"
                      className="h-3 drop-shadow-md"
                    />
                  </div>
                </div>
              )}

              {/* AI Generated badge */}
              {post.isAIGenerated && (
                <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-green-50/30 to-emerald-50/30 dark:from-green-900/20 dark:to-emerald-900/20 shadow-sm">
                  <svg
                    className="w-4 h-4 drop-shadow-md text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9" />
                  </svg>
                  <span className="ml-1 text-xs bg-gradient-to-r from-green-600 to-emerald-500 text-transparent bg-clip-text font-bold drop-shadow-sm">AI</span>
                </div>
              )}

              {/* Zora logo and badge */}
              {post.zoraCoinAddress && (
                <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-purple-50/30 dark:bg-purple-900/20 shadow-sm">
                  <img 
                    src="/android-chrome-512x512.png"
                    alt="Sphere Token"
                    className="w-5 h-5 drop-shadow-md"
                    title="This post is a Sphere token"
                  />
                  <span className="ml-1 text-sm bg-gradient-to-r from-purple-600 to-blue-500 text-transparent bg-clip-text font-bold drop-shadow-sm">PostCoin</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {postDate}
            {post.lastEdited && <span className="italic"> (edited)</span>}
          </div>
        </div>

        <div className="mb-3">
          <div className={`prose prose-sm max-w-none whitespace-pre-wrap break-words text-black dark:text-white ${!isTextExpanded && post.content.length > 500 ? 'max-h-52 overflow-hidden relative' : ''}`}>
            {post.content.split('\n').map((paragraph, index) => (
              paragraph.trim() ? (
                <p key={index} className="mb-2 break-words whitespace-normal overflow-wrap-anywhere">
                  {paragraph.split(/(\s+)/).map((part, partIndex) => {
                    if (part.startsWith('#')) {
                      return (
                        <span key={partIndex} className="text-blue-500 dark:text-blue-400 font-medium hover:underline">
                          {part}
                        </span>
                      );
                    }
                    return part;
                  })}
                </p>
              ) : (
                <br key={index} />
              )
            ))}
            {!isTextExpanded && post.content.length > 500 && (
              <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-white dark:from-gray-800 to-transparent"></div>
            )}
          </div>
          
          {post.content.length > 500 && (
            <button
              onClick={() => setExpandedTextPosts(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
              className="text-blue-500 text-xs mt-1 hover:underline"
            >
              {isTextExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
          
          {/* Pasek hashtagów - wyświetla wszystkie hashtagi, nawet te niewidoczne */}
          {extractHashtags(post.content).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
              {extractHashtags(post.content).map((tag, i) => (
                <a 
                  key={i}
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault();
                    // Można dodać funkcjonalność filtrowania po hashtagach
                  }}
                  className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400 text-xs font-medium rounded-full hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-colors"
                >
                  {tag}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Zawsze umieszczaj LinkPreview tutaj, pod treścią posta */}
        <LinkPreview content={post.content} />

        {/* Media (obrazek lub wideo) */}
        {(post.image || post.video) && (
          <div 
            className="my-3 cursor-pointer" 
            onClick={() => {
              const mediaUrl = post.image || post.video;
              if (mediaUrl) {
                setEnlargedImage(mediaUrl);
              }
            }}
          >
            {post.image && (
              <img src={post.image} alt="Post media" className="max-h-96 w-full object-contain rounded-lg" />
            )}
            {post.video && (
              <video src={post.video} controls className="max-h-96 w-full rounded-lg" />
            )}
          </div>
        )}

        {/* 🎵 Music Track - wyświetlaj kafelek muzyczny jeśli post ma załączony utwór */}
        {post.musicTrack && (
          <div className="my-3">
            <SpotifyTrackCard
              trackData={{ track: post.musicTrack as any }}
              isCompact={false}
              showAudioPlayer={true}
              onPlayTrack={playTrack}
              currentTrackUrl={currentTrackUrl || undefined}
              isPlaying={isPlayingAudio && currentTrackUrl === post.musicTrack.preview_url}
              isLoading={isLoadingAudio && currentTrackUrl === post.musicTrack.preview_url}
              currentTime={currentTrackUrl === post.musicTrack.preview_url ? currentTime : 0}
              duration={currentTrackUrl === post.musicTrack.preview_url ? duration : 0}
              volume={volume}
              onVolumeChange={(newVolume) => {
                setVolume(newVolume);
                if (currentAudio) {
                  currentAudio.volume = newVolume;
                }
              }}
              onSeekTime={(time) => {
                if (currentAudio) {
                  currentAudio.currentTime = time;
                  setCurrentTime(time);
                }
              }}
            />
          </div>
        )}

        {/* --- NEW ZORA TOKEN INFO & ACTIONS SECTION --- */}
        {post.zoraCoinAddress && (
          <div className="mt-4 mb-2">
            <SpotlightCard 
              spotlightColor="rgba(147, 51, 234, 0.25)" 
              className="border-2 border-purple-200/50 dark:border-purple-800/50 bg-gradient-to-br from-purple-50/50 via-blue-50/50 to-purple-50/50 dark:from-purple-950/30 dark:via-blue-950/30 dark:to-purple-950/30 shadow-lg hover:shadow-xl transition-shadow"
            >
              <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  {zoraData?.imageUrl ? (
                    <div className="relative">
                      <img 
                        src={zoraData.imageUrl} 
                        alt={zoraData?.name || 'Token'} 
                        className="w-10 h-10 rounded-full ring-2 ring-purple-200 dark:ring-purple-800"
                      />
                    </div>
                  ) : (
                    <div className="relative">
                      <img 
                        src="/android-chrome-512x512.png" 
                        alt="Sphere Logo" 
                        className="w-10 h-10 rounded-full ring-2 ring-purple-200 dark:ring-purple-800"
                      />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-bold text-purple-700 dark:text-purple-300 m-0">
                        {zoraData?.symbol || 'POSTCOIN'}
                      </CardTitle>
                      {zoraData?.priceUSD && (
                        <Badge variant="secondary" className="text-xs font-semibold">
                          ${formatNumberWithSuffix(zoraData.priceUSD)}
                        </Badge>
                      )}
                      {zoraData?.priceChange24h !== undefined && (
                        <Badge 
                          variant="outline"
                          className={`text-xs font-semibold ${
                            zoraData.priceChange24h > 0 
                              ? 'border-green-500 text-green-600 dark:text-green-400' 
                              : zoraData.priceChange24h < 0 
                                ? 'border-red-500 text-red-600 dark:text-red-400' 
                                : ''
                          }`}
                        >
                          {zoraData.priceChange24h > 0 ? '↑' : zoraData.priceChange24h < 0 ? '↓' : ''}
                          {Math.abs(zoraData.priceChange24h).toFixed(2)}%
                        </Badge>
                      )}
                    </div>
                    {zoraData?.name && zoraData.name !== zoraData?.symbol && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {zoraData.name}
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {isLoadingData ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                  </div>
                ) : (
                  <>
                    {/* Token Stats Grid */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <Card className="bg-background/50 border">
                        <CardContent className="p-3 text-center">
                          <div className="text-xs text-muted-foreground mb-1">Holders</div>
                          <div className="text-base font-semibold">{zoraData?.uniqueHolders || '0'}</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-background/50 border">
                        <CardContent className="p-3 text-center">
                          <div className="text-xs text-muted-foreground mb-1">Supply</div>
                          <div className="text-base font-semibold">
                            {zoraData?.totalSupply 
                              ? formatNumberWithSuffix(parseFloat(zoraData.totalSupply))
                              : '0'}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-background/50 border">
                        <CardContent className="p-3 text-center">
                          <div className="text-xs text-muted-foreground mb-1">Your Balance</div>
                          <div className="text-base font-semibold">
                            {isLoadingBalances 
                              ? '...' 
                              : (function() {
                                  if (!post.zoraCoinAddress) return '0';
                                  const balanceStr = userTokenBalances[post.zoraCoinAddress.toLowerCase()];
                                  if (!balanceStr) return '0';
                                  try {
                                    const balanceNum = parseFloat(balanceStr);
                                    if (isNaN(balanceNum) || balanceNum === 0) return '0';
                                    return formatNumberWithSuffix(balanceNum);
                                  } catch (e) {
                                    return '0';
                                  }
                                })()
                            }
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Market Data Row */}
                    {(zoraData?.marketCap || zoraData?.volume24h) && (
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {zoraData?.marketCap && (
                          <Card className="bg-background/50 border">
                            <CardContent className="p-3 text-center">
                              <div className="text-xs text-muted-foreground mb-1">Market Cap</div>
                              <div className="text-base font-semibold">
                                ${formatNumberWithSuffix(zoraData.marketCap)}
                              </div>
                            </CardContent>
                          </Card>
                        )}
                        {zoraData?.volume24h && (
                          <Card className="bg-background/50 border">
                            <CardContent className="p-3 text-center">
                              <div className="text-xs text-muted-foreground mb-1">24h Volume</div>
                              <div className="text-base font-semibold">
                                ${formatNumberWithSuffix(zoraData.volume24h)}
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                    
                    {/* Trade Buttons */}
                    {address && post.zoraCoinAddress && (
                      <div className="pt-3 border-t">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const coinData: CreatorCoinData = {
                                address: post.zoraCoinAddress!,
                                name: zoraData?.name || postTokenData[post.id]?.name || 'Post Token',
                                symbol: zoraData?.symbol || postTokenData[post.id]?.symbol || 'TOKEN',
                                totalSupply: zoraData?.totalSupply || '0',
                                marketCap: zoraData?.marketCap,
                                priceUSD: zoraData?.priceUSD,
                                volume24h: zoraData?.volume24h,
                                uniqueHolders: zoraData?.uniqueHolders,
                                imageUrl: zoraData?.imageUrl || postTokenData[post.id]?.imageUrl,
                              };
                              setTradeCoinData(coinData);
                              setTradeCoinBalance(userTokenBalances[post.zoraCoinAddress!.toLowerCase()] || '0');
                              setTradeCoinMode('buy');
                              setShowTradeCoinModal(true);
                            }}
                            className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg"
                          >
                            Buy
                          </button>
                          <button
                            onClick={() => {
                              const coinData: CreatorCoinData = {
                                address: post.zoraCoinAddress!,
                                name: zoraData?.name || postTokenData[post.id]?.name || 'Post Token',
                                symbol: zoraData?.symbol || postTokenData[post.id]?.symbol || 'TOKEN',
                                totalSupply: zoraData?.totalSupply || '0',
                                marketCap: zoraData?.marketCap,
                                priceUSD: zoraData?.priceUSD,
                                volume24h: zoraData?.volume24h,
                                uniqueHolders: zoraData?.uniqueHolders,
                                imageUrl: zoraData?.imageUrl || postTokenData[post.id]?.imageUrl,
                              };
                              setTradeCoinData(coinData);
                              setTradeCoinBalance(userTokenBalances[post.zoraCoinAddress!.toLowerCase()] || '0');
                              setTradeCoinMode('sell');
                              setShowTradeCoinModal(true);
                            }}
                            className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-red-500 to-rose-600 text-white hover:from-red-600 hover:to-rose-700 transition-all shadow-md hover:shadow-lg"
                          >
                            Sell
                          </button>
                        </div>
                        {/* User Balance */}
                        {userTokenBalances[post.zoraCoinAddress.toLowerCase()] && 
                         parseFloat(userTokenBalances[post.zoraCoinAddress.toLowerCase()]) > 0 && (
                          <div className="mt-2 text-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Your balance: <span className="font-medium text-purple-600 dark:text-purple-400">
                                {parseFloat(userTokenBalances[post.zoraCoinAddress.toLowerCase()]).toFixed(4)} {zoraData?.symbol || 'TOKEN'}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* External Links */}
                    <div className="flex flex-wrap items-center justify-center gap-4 pt-3 border-t">
                      {post.zoraCoinAddress && userTokenBalances[post.zoraCoinAddress.toLowerCase()] && 
                       parseFloat(userTokenBalances[post.zoraCoinAddress.toLowerCase()]) > 0 && (
                        <a 
                          href={`https://zora.co/profile/${address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 flex items-center gap-1 transition-colors"
                        >
                          View your tokens
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      
                      <a 
                        href={`${
                          post.network === 'basecamp' 
                            ? 'https://camp.cloud.blockscout.com/token/' 
                            : post.network === 'celo'
                            ? 'https://explorer.celo.org/token/'
                            : post.network === 'ethereum'
                            ? 'https://etherscan.io/token/'
                            : post.network === 'worldchain'
                            ? 'https://worldscan.org/token/'
                            : 'https://basescan.org/token/'
                        }${post.zoraCoinAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        View on {
                          post.network === 'basecamp' 
                            ? 'Camp Network Explorer' 
                            : post.network === 'celo'
                            ? 'Celo Explorer'
                            : post.network === 'ethereum'
                            ? 'Etherscan'
                            : post.network === 'worldchain'
                            ? 'Worldscan'
                            : 'Basescan'
                        }
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      
                      <a 
                        href={`https://zora.co/coin/base:${post.zoraCoinAddress}?referrer=0xf1fa20027b6202bc18e4454149c85cb01dc91dfd`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 flex items-center gap-1 transition-colors"
                      >
                        View on Zora
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      
                      <a 
                        href={`https://dexscreener.com/base/${post.zoraCoinAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 flex items-center gap-1 transition-colors"
                      >
                        View on DexScreener
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            </SpotlightCard>
          </div>
        )}
        {/* --- END NEW ZORA TOKEN INFO & ACTIONS --- */}

        {/* ⏳ Pending Pin Timer - Shows while waiting for confirmation */}
        {pendingPins[post.id] && (
          <div className="mt-3">
            <PendingPinTimer
              postId={post.id}
              txHash={pendingPins[post.id].txHash}
              expectedAt={pendingPins[post.id].expectedAt}
              duration={pendingPins[post.id].duration as PinDuration}
            />
          </div>
        )}

        {/* 🚀 Pin Timer for Confirmed Paid Pins */}
        {post.isPinned && post.isPaidPin && post.pinExpiresAt && !pendingPins[post.id] && (
          <div className="mt-3">
            <PinTimer
              postId={post.id}
              expiresAt={post.pinExpiresAt}
              isPaidPin={true}
              pinOwner={post.pinOwner}
              duration={post.pinDuration as PinDuration}
              onExtendClick={() => {
                setExtendingPostId(post.id);
                setExtendingExpiresAt(post.pinExpiresAt || 0);
                setShowExtendModal(true);
              }}
            />
          </div>
        )}

        <div className="flex items-center space-x-4 text-gray-900 dark:text-gray-200 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => handleToggleLike(post.id)}
            className={`flex items-center space-x-1 hover:text-pink-500 transition-colors ${isLiked ? 'text-pink-500' : ''}`}
            disabled={!isConnected}
          >
            <svg className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span className="text-xs">{post.likes || 0}</span>
          </button>

          <button
            onClick={() => setExpandedComments(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
            className="flex items-center space-x-1 hover:text-blue-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-xs">{commentCount}</span>
          </button>

          {/* FOLLOW BUTTON - Show only if not author and user is connected */}
          {address && post.author !== address && (
            <button
              onClick={() => {
                const isCurrentlyFollowing = followingStatus[post.author];
                if (isCurrentlyFollowing) {
                  handleUnfollowUser(post.author);
                } else {
                  handleFollowUser(post.author);
                }
              }}
              disabled={followLoading[post.author]}
              className={`flex items-center space-x-1 transition-colors text-xs px-2 py-1 rounded-full ${
                followingStatus[post.author]
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-purple-100 hover:text-purple-700 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-purple-900/30 dark:hover:text-purple-300'
              } ${followLoading[post.author] ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {followLoading[post.author] ? (
                <>
                  <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Loading...</span>
                </>
              ) : followingStatus[post.author] ? (
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

          {/* 💰 Paid Pin Button - Show for non-pinned posts */}
          <PaidPinButton
            postId={post.id}
            postContent={post.content}
            authorAddress={post.author}
            isPinned={!!post.isPinned}
            onPinSuccess={(txHash: string, duration: PinDuration) => {
              if (onPinPending) {
                onPinPending(post.id, txHash, duration);
              }
            }}
          />

          {/* Tip Button - Show for all posts */}
          <TipButton
            recipientAddress={post.author}
            postId={post.id}
            className="text-gray-900 dark:text-gray-200"
          />

          {post.txHash && (
            <a
              href={`${
                post.network === 'basecamp' 
                  ? 'https://camp.cloud.blockscout.com/tx/' 
                  : post.network === 'celo'
                  ? 'https://explorer.celo.org/tx/'
                  : post.network === 'ethereum'
                  ? 'https://etherscan.io/tx/'
                  : post.network === 'worldchain'
                  ? 'https://worldscan.org/tx/'
                  : post.network === 'linea'
                  ? 'https://lineascan.build/tx/'
                  : 'https://basescan.org/tx/'
              }${post.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 text-gray-900 dark:text-gray-200 hover:text-blue-500"
              title="View Transaction"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {/* Tekst tylko na desktop */}
              <span className="hidden md:inline text-xs">Transaction</span>
            </a>
          )}

          {/* 🗑️ ADMIN DELETE BUTTON - Dedykowana ikonka dla admina */}
          {address && isUserAdmin(address) && post.author !== address && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this post?')) {
                  handleDeletePost(post.id);
                }
              }}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors ml-auto p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Delete post (Admin)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}

          {(canEdit || (canDelete && post.author === address)) && (
            <div className="relative ml-auto">
              <button className="hover:text-gray-700 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 group">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                <div className="absolute right-0 bottom-full mb-1 w-32 bg-white dark:bg-gray-700 rounded-md shadow-lg py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 border border-gray-100 dark:border-gray-600 pointer-events-none group-hover:pointer-events-auto">
                {canEdit && (
                  <button
                    onClick={() => { setEditingPost(post.id); setEditedContent(post.content); }}
                    className="block w-full text-left px-4 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Edit
                  </button>
                )}
                {address && isUserAdmin(address) && (
                  <button
                    onClick={() => post.isPinned ? handleUnpinPost(post.id) : handlePinPost(post.id)}
                    className={`block w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-600 ${
                      post.isPinned 
                        ? 'text-yellow-600 dark:text-yellow-400' 
                        : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {post.isPinned ? '📌 Unpin' : '📌 Pin'}
                  </button>
                )}
                {/* ✅ TYLKO AUTOR może usuwać przez menu (admin ma dedykowaną ikonkę) */}
                {canDelete && post.author === address && (
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="block w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/50"
                  >
                    Delete
                  </button>
                )}
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Tip Stats - Always under action buttons for better layout */}
        <div className="mt-2">
          <TipStats
            postId={post.id}
            className="text-gray-900 dark:text-gray-200"
          />
        </div>

        {editingPost === post.id && (
          <div className="mt-4">
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
            />
            <div className="flex justify-end space-x-2 mt-2">
              <button
                onClick={() => setEditingPost(null)}
                className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                 onClick={() => handleEditPost(post.id, editedContent)}
                 className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                 Save
               </button>
            </div>
          </div>
        )}

        {expandedComments[post.id] && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            {renderComments(post)}
          </div>
        )}
        </div>
      </div>
    );
  };

  if (isLoading && internalPosts.length === 0) {
    return (
      <div className="animate-pulse space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/6"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (internalPosts.length === 0 && !isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm text-center">
        <div className="text-4xl mb-4">📭</div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No posts found</h3>
        <p className="text-gray-500 dark:text-gray-400">
          {showOnlyUserPosts 
            ? "You haven't created any posts yet." 
            : "There are no posts matching your search criteria."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {displayedPosts.map(post => (
        <React.Fragment key={`post-fragment-${post.id}`}>
          {renderPost(post)}
        </React.Fragment>
      ))}
      
      {/* Load More Button - Hidden for pinned posts */}
      {!disableInfiniteScroll && displayLimit < MAX_DISPLAY_LIMIT && (
        <div className="flex justify-center p-4">
          {isLoadingMore ? (
            <div className="animate-pulse space-y-4 w-full">
              <div className="bg-gray-200 dark:bg-gray-700 h-10 rounded-lg"></div>
            </div>
          ) : hasMorePosts ? (
            <button 
              onClick={loadMorePosts}
              className="group relative px-8 py-4 bg-gradient-to-r from-gray-900 via-gray-800 to-black text-white rounded-xl font-semibold hover:from-gray-800 hover:via-gray-700 hover:to-gray-900 transition-all duration-300 transform hover:scale-105 shadow-2xl backdrop-blur-sm border border-gray-700/50 hover:border-gray-600/50"
              style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.8) 0%, rgba(17,17,17,0.9) 50%, rgba(0,0,0,0.8) 100%)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
              }}
            >
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10 group-hover:ring-white/20 transition-all duration-300"></div>
              <div className="relative flex items-center space-x-2">
                <span className="text-lg">📚</span>
                <span>Load More Posts</span>
                <div className="w-2 h-2 bg-white rounded-full animate-pulse group-hover:animate-bounce"></div>
              </div>
            </button>
          ) : internalPosts.length > 0 ? (
            <div className="text-center p-4">
              <div className="text-gray-500 dark:text-gray-400 text-sm mb-2">🎉 You've reached the end!</div>
              <div className="text-gray-400 dark:text-gray-500 text-xs">All posts have been loaded</div>
            </div>
          ) : null}
        </div>
      )}

      {/* Informacja o limicie wyświetlania */}
      {!disableInfiniteScroll && displayLimit >= MAX_DISPLAY_LIMIT && internalPosts.length > MAX_DISPLAY_LIMIT && (
        <div className="text-center p-4">
          <div className="text-yellow-500 dark:text-yellow-400 text-sm mb-2">📊 Display limit reached</div>
          <div className="text-gray-400 dark:text-gray-500 text-xs">
            Showing {MAX_DISPLAY_LIMIT} most recent posts for performance
          </div>
        </div>
      )}

      {enlargedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-auto">
            <img 
              src={enlargedImage} 
              alt="Enlarged post image" 
              className="object-contain max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            />
            <button 
              className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70"
              onClick={() => setEnlargedImage(null)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Extend Pin Modal - moved to the top level */}
      <ExtendPinModal
        isOpen={showExtendModal}
        onClose={() => {
          setShowExtendModal(false);
          setExtendingPostId(null);
          setExtendingExpiresAt(0);
        }}
        postId={extendingPostId || ''}
        currentExpiresAt={extendingExpiresAt}
        onExtendSuccess={(txHash: string, additionalDuration: PinDuration) => {
          console.log('Pin extended successfully:', { postId: extendingPostId, txHash, additionalDuration });
          setShowExtendModal(false);
          // Refresh posts to show updated expiration
          if (onRefreshPosts) {
            onRefreshPosts();
          }
        }}
      />

      {/* Trade Coin Modal */}
      {showTradeCoinModal && tradeCoinData && (
        <TradeCoinModal
          isOpen={showTradeCoinModal}
          onClose={() => {
            setShowTradeCoinModal(false);
            setTradeCoinData(null);
          }}
          coin={tradeCoinData}
          userBalance={tradeCoinBalance}
          mode={tradeCoinMode}
          onTradeSuccess={refreshBalancesAfterTrade}
        />
      )}
    </div>
  );
} 