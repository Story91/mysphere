'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Post, Comment } from '../../types';
import { doc, updateDoc, serverTimestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import { fetchPosts, db, toggleLike, deletePost, toggleCommentLike, editComment, deleteComment, addCommentReply, addComment, ADMIN_ADDRESS } from '../../utils/firebase';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Avatar as CoinbaseAvatar } from '@coinbase/onchainkit/identity';
import LinkPreview from './LinkPreview';
import CommentTransactionButton from '../../components/CommentTransactionButton';

// Import Zora SDK functions and types
import { tradeCoin, getCoin } from '@zoralabs/coins-sdk';
import { parseEther, parseUnits, formatEther } from 'viem'; // Import viem utils
import { Address as ViemAddress } from 'viem';

// Import icons
import { Users, Coins, ShoppingCart, Tag, ExternalLink } from 'lucide-react';

export interface ExtendedPost extends Post {
  pollId?: string;
}

// Placeholder type for Zora Coin data
interface ZoraCoinData {
  totalSupply?: string;
  uniqueHolders?: number;
  symbol?: string;
  // Add other relevant fields from getCoin response as needed
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
}

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
  isLoading = false
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
  
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const formatTimestamp = (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (error) {
      return 'recently';
    }
  };

  const refreshPosts = async () => {
    if (onRefreshPosts) {
      await onRefreshPosts();
    }
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

  const handleEditPost = async (postId: string, newContent: string) => {
    if (!address) return;
    
    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        content: newContent,
        lastEdited: serverTimestamp()
      });
      
      await refreshPosts();
      setEditingPost(null);
      setEditedContent('');
      
      toast.success('Post updated successfully');
    } catch (error) {
      console.error('Error editing post:', error);
      toast.error('Failed to edit post');
    }
  };

  const handleAddComment = async (postId: string, txHash: string) => {
    if (!address) return;
    
    try {
      const newComment: Comment = {
        id: `temp-${Date.now()}`, // Tymczasowe ID
        postId: postId,
        author: address,
        content: newComments[postId],
        timestamp: Date.now(),
        txHash: txHash,
        likes: 0,
        likedBy: [],
        mentions: []
      };
      
      await addComment(postId, newComment);
      
      setNewComments(prev => ({
        ...prev,
        [postId]: ''
      }));
      
      toast.success('Comment added successfully');
      
      // Optymistyczna aktualizacja UI - dodajemy komentarz lokalnie
      const updatedPosts = posts.map(post => {
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
      // Lokalna optymistyczna aktualizacja UI bez resetowania całej listy
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
      
      // Zachowujemy bieżące sortedPosts i displayLimit
      // Zamiast pełnego odświeżenia, które resetuje scroll i widok
      // aktualizujemy tylko konkretny post
      const postIndex = posts.findIndex(p => p.id === postId);
      if (postIndex !== -1) {
        const postsCopy = [...posts];
        postsCopy[postIndex] = updatedPosts[postIndex];
        
        // Aktualizujemy stan bez resetowania widoku
        if (onRefreshPosts) {
          onRefreshPosts([...postsCopy]);
        }
      }
      
      // Wysyłamy akcję do Firebase w tle
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
      await editComment(postId, commentId, newContent);
      
      setEditingComment(null);
      setEditedCommentContent('');
      
      await refreshPosts();
      
      toast.success('Comment updated successfully');
    } catch (error) {
      console.error('Error editing comment:', error);
      toast.error('Failed to edit comment');
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!address) return;
    
    try {
      if (confirm('Are you sure you want to delete this comment?')) {
        await deleteComment(postId, commentId, address);
        
        await refreshPosts();
        
        toast.success('Comment deleted successfully');
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
    }
  };

  const handleToggleCommentLike = async (postId: string, commentId: string) => {
    if (!address) return;
    
    try {
      // Optymistyczna aktualizacja UI - lokalna bez resetowania widoku
      const updatedPosts = posts.map(post => {
        if (post.id === postId) {
          // Znajdź komentarz
          const updatedComments = (post.comments || []).map(comment => {
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
            
          return {
            ...post,
            comments: updatedComments
          };
        }
        return post;
      });
      
      // Zachowujemy bieżące sortowanie i limity wyświetlania
      // Aktualizujemy tylko konkretny post z komentarzem
      const postIndex = posts.findIndex(p => p.id === postId);
      if (postIndex !== -1) {
        const postsCopy = [...posts];
        postsCopy[postIndex] = updatedPosts[postIndex];
        
        // Aktualizujemy stan bez resetowania widoku
        if (onRefreshPosts) {
          onRefreshPosts([...postsCopy]);
        }
      }
      
      // Wykonaj rzeczywiste żądanie do serwera w tle
      await toggleCommentLike(postId, commentId, address);
    } catch (error) {
      console.error('Error toggling comment like:', error);
      toast.error('Failed to like comment');
      // W przypadku błędu, przywróć poprzedni stan
      const postIndex = posts.findIndex(p => p.id === postId);
      if (postIndex !== -1 && onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleAddReply = async (postId: string, commentId: string, txHash?: string) => {
    if (!address || !replyContent.trim()) return;
    
    try {
      // Dodajemy odpowiedź z poprawnie ustawionym polem replyTo
      const newReply = await addCommentReply(postId, commentId, {
        author: address,
        content: replyContent.trim(),
        txHash // Uproszczona wersja, pozwalamy aby undefined było przekazywane
      });
      
      setReplyingTo(null);
      setReplyContent('');
      
      // Optymistyczna aktualizacja UI - dodajemy odpowiedź lokalnie
      const updatedPosts = posts.map(post => {
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
            txHash // Uproszczona wersja bez null
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

  const filteredPosts = showOnlyUserPosts ? posts.filter(post => post.author === address) : posts;

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

  const [displayLimit, setDisplayLimit] = useState(100);
  const displayedPosts = sortedPosts.slice(0, displayLimit);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && sortedPosts.length > displayLimit) {
        setDisplayLimit(prev => prev + 50);
      }
    }, { threshold: 0.5 });

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }
    
    return () => {
      if (loadMoreTriggerRef.current) {
        observer.unobserve(loadMoreTriggerRef.current);
      }
    };
  }, [displayLimit, sortedPosts]);

  const loadMorePosts = async () => {
    if (!hasMorePosts || isLoadingMore || !address) return;
    
    try {
      setIsLoadingMore(true);
      
      // Pobierz następną partię postów
      const { posts: morePosts, lastVisible: newLastVisible } = await fetchPosts({
        userId: address,
        startAfter: lastVisible
      });
      
      if (morePosts.length > 0) {
        // Dodaj nowe posty do istniejących bez resetowania widoku
        if (onRefreshPosts) {
          // Połącz istniejące posty z nowymi
          const allPosts = [...posts, ...morePosts];
          await onRefreshPosts(allPosts);
          console.log(`Załadowano ${morePosts.length} nowych postów`);
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
      toast.error('Failed to load more posts');
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    // Ustawienie obserwatora dla infinite scroll
    const observer = new IntersectionObserver((entries) => {
      // Gdy element obserwowany jest widoczny i mamy więcej postów
      if (entries[0].isIntersecting && hasMorePosts && !isLoadingMore) {
        loadMorePosts();
      }
    }, { threshold: 0.1, rootMargin: '100px' }); // Zmniejszamy próg dla wcześniejszego ładowania

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }
    
    return () => {
      if (loadMoreTriggerRef.current) {
        observer.unobserve(loadMoreTriggerRef.current);
      }
    };
  }, [hasMorePosts, isLoadingMore, lastVisible, loadMorePosts]);

  useEffect(() => {
    const setInitialLastVisible = async () => {
      if (posts.length > 0 && !lastVisible && address) {
        try {
          const { posts: fetchedPosts, lastVisible: newLastVisible } = await fetchPosts({
            userId: address,
            limit: posts.length // Pobierz tyle postów, ile już mamy, żeby uzyskać poprawny lastVisible
          });
          
          setLastVisible(newLastVisible);
    } catch (error) {
          console.error('Error setting initial lastVisible:', error);
        }
      }
    };
    
    setInitialLastVisible();
  }, [posts, address, lastVisible]);

  useEffect(() => {
    const fetchAllTokenData = async () => {
      const tokenPosts = posts.filter(post => post.zoraCoinAddress);
      if (tokenPosts.length === 0) return;

      console.log(`Fetching Zora data for ${tokenPosts.length} posts...`);

      // Use Promise.allSettled to fetch data for all posts concurrently
      // and handle potential errors for individual posts
      const results = await Promise.allSettled(
        tokenPosts.map(async (post) => {
          if (!post.zoraCoinAddress) return { postId: post.id, data: null }; // Should not happen due to filter

          // Indicate loading for this specific post
          setIsLoadingTokenData(prev => ({ ...prev, [post.id]: true }));

          try {
            // Access data correctly via response.data.zora20Token
            const response = await getCoin({ address: post.zoraCoinAddress });
            const tokenInfo = response?.data?.zora20Token;
            if (tokenInfo) {
              // Basic data extraction - simplified due to typing issues
              const data: ZoraCoinData = {
                totalSupply: tokenInfo.totalSupply || undefined,
                uniqueHolders: tokenInfo.uniqueHolders || undefined,
                symbol: tokenInfo.symbol || 'POST'
              };
              return { postId: post.id, data };
            } else {
              console.warn(`No Zora token data found for address: ${post.zoraCoinAddress}`);
              return { postId: post.id, data: null };
            }
          } catch (error) {
            console.error(`Error fetching Zora data for post ${post.id} (${post.zoraCoinAddress}):`, error);
            return { postId: post.id, data: null, error: true }; // Indicate error
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
            // delete newData[result.value.postId]; // Or mark as errored
          } else if (result.status === 'rejected') {
            // Handle unexpected promise rejection
            console.error("Unexpected error fetching Zora data:", result.reason);
          }
        });
        return newData;
      });
    };

    if (posts && posts.length > 0) {
      fetchAllTokenData();
    }

    // We might not want to refetch every time `posts` changes if it changes frequently
    // Consider adding more specific dependencies if needed, e.g., posts.length
  }, [posts]); // Dependency on the posts array

  const handleBuyCoin = async (postId: string) => {
      const post = posts.find(p => p.id === postId);
      if (!post?.zoraCoinAddress || !address || !walletClient || !publicClient) return;

      const amountEth = prompt("Enter amount of ETH to spend:", "0.01");
      if (!amountEth || isNaN(parseFloat(amountEth)) || parseFloat(amountEth) <= 0) {
        toast.error("Invalid amount");
        return;
      }

      const toastId = toast.loading(`Buying ${postTokenData[postId]?.symbol || 'tokens'}...`);

      try {
          const buyParams = {
              direction: "buy" as const,
              target: post.zoraCoinAddress as ViemAddress,
              args: {
                  recipient: address as ViemAddress,
                  orderSize: parseEther(amountEth),
                  minAmountOut: 0n, // TODO: Add slippage control
              }
          };

          // Remove the 4th argument (value). SDK should handle value for ETH buys.
          const result = await tradeCoin(buyParams, walletClient, publicClient);

          toast.loading("Waiting for transaction...", { id: toastId });
          await publicClient.waitForTransactionReceipt({ hash: result.hash });
          toast.success(`Successfully bought ${postTokenData[postId]?.symbol || 'tokens'}!`, { id: toastId });
          // TODO: Refresh token data or user balance
          refreshPosts(); // Refresh posts to potentially update token data
      } catch (error: any) {
          console.error("Error buying coin:", error);
          toast.error(`Buy failed: ${error.message.substring(0, 60)}...`, { id: toastId });
      }
  };

  const handleSellCoin = async (postId: string) => {
      const post = posts.find(p => p.id === postId);
      const tokenData = postTokenData[postId];
      // Need decimals for parseUnits, default to 18 if unavailable for now
      const decimals = 18; // Defaulting to 18 as tokenInfo.decimals is unavailable
      if (!post?.zoraCoinAddress || !address || !walletClient || !publicClient) return;

      const amountTokens = prompt(`Enter amount of ${tokenData?.symbol || 'tokens'} to sell:`);
      if (!amountTokens || isNaN(parseFloat(amountTokens)) || parseFloat(amountTokens) <= 0) {
          toast.error("Invalid amount");
          return;
      }

      const toastId = toast.loading(`Selling ${tokenData?.symbol || 'tokens'}...`);

      try {
          const sellParams = {
              direction: "sell" as const,
              target: post.zoraCoinAddress as ViemAddress,
              args: {
                  recipient: address as ViemAddress,
                  orderSize: parseUnits(amountTokens, decimals), // Using default decimals
                  minAmountOut: 0n, // TODO: Add slippage control
              }
          };

          // Note: Selling might require prior approval of the token contract
          // Zora SDK might handle this, but needs verification.
          const result = await tradeCoin(sellParams, walletClient, publicClient);

          toast.loading("Waiting for transaction...", { id: toastId });
          await publicClient.waitForTransactionReceipt({ hash: result.hash });
          toast.success(`Successfully sold ${tokenData?.symbol || 'tokens'}!`, { id: toastId });
          // TODO: Refresh token data or user balance
          refreshPosts(); // Refresh posts to potentially update token data
      } catch (error: any) {
          console.error("Error selling coin:", error);
          toast.error(`Sell failed: ${error.message.substring(0, 60)}...`, { id: toastId });
      }
  };

  const renderComments = (post: ExtendedPost) => {
    // Grupujemy odpowiedzi według ID komentarza, do którego należą
    const repliesByCommentId: { [key: string]: Comment[] } = {};
    
    // Szukamy wszystkich odpowiedzi i grupujemy je
    (post.comments || []).forEach(comment => {
      if (comment.replyTo) {
        // To jest odpowiedź do komentarza
        if (!repliesByCommentId[comment.replyTo]) {
          repliesByCommentId[comment.replyTo] = [];
        }
        repliesByCommentId[comment.replyTo].push(comment);
      }
    });
    
    // Filtrujemy tylko główne komentarze (te, które nie są odpowiedziami)
    const mainComments = (post.comments || []).filter(comment => !comment.replyTo);
    
    return (
      <div className="mt-4 space-y-4">
        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0">
            {userNames[address || '']?.avatar ? (
              <img
                src={userNames[address || ''].avatar}
                alt="Profile"
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <CoinbaseAvatar address={address as `0x${string}`} className="w-8 h-8 rounded-full" />
            )}
          </div>
          <div className="flex-1">
            <textarea
              value={newComments[post.id] || ''}
              onChange={(e) => setNewComments(prev => ({
                ...prev,
                [post.id]: e.target.value
              }))}
              placeholder="Write a comment..."
              className="w-full p-2 text-sm border rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
              rows={2}
            />
            <div className="flex justify-end mt-2">
              <CommentTransactionButton
                content={newComments[post.id] || ''}
                onTransactionSuccess={(txHash) => handleAddComment(post.id, txHash)}
                disabled={!newComments[post.id]?.trim()}
                autoPost={true}
                onCommentAdded={onCommentAdded}
              />
            </div>
          </div>
        </div>

        {mainComments.map((comment: Comment, index: number) => (
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
                  
                  {comment.author === address && !editingComment && (
                    <div className="flex space-x-1">
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
                      <CommentTransactionButton 
                        content={replyContent} 
                        disabled={!replyContent.trim()} 
                        onTransactionSuccess={(txHash) => handleAddReply(post.id, comment.id, txHash)}
                      />
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
      </div>
    );
  };

  const renderPost = (post: ExtendedPost) => {
    const isLiked = post.likedBy?.includes(address ?? '');
    const isAuthor = post.author === address;
    const commentCount = post.comments?.length || 0;
    const postDate = formatTimestamp(post.timestamp);
    const canEdit = isAuthor || address === ADMIN_ADDRESS;
    const canDelete = isAuthor || address === ADMIN_ADDRESS;
    const isTextExpanded = expandedTextPosts[post.id] || false;
    const zoraData = postTokenData[post.id];
    const isLoadingData = isLoadingTokenData[post.id];

    return (
      <div key={post.id} className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 mb-4 border border-gray-100 dark:border-gray-700">
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
              {/* Logo Zora jeśli post jest tokenem Zora */}
              {post.zoraCoinAddress && (
                <img 
                  src="/zora.png"
                  alt="Zora Token"
                  className="w-4 h-4 mx-1"
                  title="This post is a Zora token"
                />
              )}
              {displayUserName(post.author, `post-author-${post.id}`, false)}
              {post.zoraCoinAddress && (
                <span className="ml-1 text-xs text-purple-500 font-medium">PostCoin on Zora</span>
              )}
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {postDate}
            {post.lastEdited && <span className="italic"> (edited)</span>}
          </div>
        </div>

        <div className="mb-3">
          <div className={`prose prose-sm max-w-none break-words text-black dark:text-white ${!isTextExpanded && post.content.length > 300 ? 'max-h-24 overflow-hidden relative' : ''}`}>
            {post.content}
            {!isTextExpanded && post.content.length > 300 && (
              <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-white dark:from-gray-800 to-transparent"></div>
            )}
          </div>
          {post.content.length > 300 && (
            <button
              onClick={() => setExpandedTextPosts(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
              className="text-blue-500 text-xs mt-1 hover:underline"
            >
              {isTextExpanded ? 'Show less' : 'Show more'}
            </button>
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

        {post.zoraCoinAddress && (
          <div className="mt-3 mb-3 text-xs">
            <a 
              href={`https://zora.co/collections/base/${post.zoraCoinAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-blue-500 hover:text-blue-600 hover:underline"
            >
              <img 
                src="/zora.png" 
                alt="Zora Logo" 
                className="w-3.5 h-3.5 mr-1.5"
              />
              <span>View token on Zora: {post.zoraCoinAddress.substring(0,6)}...{post.zoraCoinAddress.substring(38)}</span>
              <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </div>
        )}

        {/* --- ZORA TOKEN INFO & ACTIONS --- */}
        {post.zoraCoinAddress && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-b-lg -mx-4 -mb-4 px-4 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-gray-600 dark:text-gray-300 mb-3">
              {isLoadingData && (
                <span className="flex items-center text-gray-500">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading token data...
                </span>
              )}
              {zoraData && (
                <>
                  <span className="flex items-center" title="Token Symbol">
                    <Tag className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                    Symbol: <span className="font-medium text-gray-800 dark:text-gray-100 ml-1">{zoraData.symbol || 'N/A'}</span>
                  </span>
                  {zoraData.uniqueHolders !== undefined && (
                    <span className="flex items-center" title="Number of Holders">
                      <Users className="w-3.5 h-3.5 mr-1.5 text-purple-500" />
                      Holders: <span className="font-medium text-gray-800 dark:text-gray-100 ml-1">{zoraData.uniqueHolders}</span>
                    </span>
                  )}
                  {zoraData.totalSupply && (
                    <span className="flex items-center" title="Total Supply">
                      <Coins className="w-3.5 h-3.5 mr-1.5 text-green-500" />
                      Supply: <span className="font-medium text-gray-800 dark:text-gray-100 ml-1">{formatEther(BigInt(zoraData.totalSupply || '0'))}</span>
                    </span>
                  )}
                  <a
                    href={`https://basescan.org/token/${post.zoraCoinAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-blue-500 hover:text-blue-600 hover:underline"
                    title="View on Basescan"
                  >
                    View on Basescan
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </>
              )}
            </div>
            {/* Buy/Sell Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleBuyCoin(post.id)}
                className="flex items-center justify-center px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-green-500 to-emerald-600 rounded-md hover:from-green-600 hover:to-emerald-700 transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 shadow-sm hover:shadow-md"
                disabled={!address || !walletClient}
              >
                <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                Buy
              </button>
              <button
                onClick={() => handleSellCoin(post.id)}
                className="flex items-center justify-center px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-red-500 to-rose-600 rounded-md hover:from-red-600 hover:to-rose-700 transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 shadow-sm hover:shadow-md"
                disabled={!address || !walletClient}
              >
                <Tag className="w-3.5 h-3.5 mr-1.5 transform rotate-180" />
                Sell
              </button>
            </div>
          </div>
        )}
        {/* --- END ZORA TOKEN INFO & ACTIONS --- */}

        <div className="flex items-center space-x-4 text-gray-900 dark:text-gray-200 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => handleToggleLike(post.id)}
            className={`flex items-center space-x-1 hover:text-pink-500 transition-colors ${isLiked ? 'text-pink-500' : ''}`}
            disabled={!isConnected}
          >
            <svg className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
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

          {post.txHash && (
            <a
              href={`https://basescan.org/tx/${post.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 text-gray-900 dark:text-gray-200 hover:text-blue-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-xs">Transaction</span>
            </a>
          )}

          {(canEdit || canDelete) && (
            <div className="relative group ml-auto">
              <button className="hover:text-gray-700 dark:hover:text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
              </button>
              <div className="absolute right-0 bottom-full mb-1 w-28 bg-white dark:bg-gray-700 rounded-md shadow-lg py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 border border-gray-100 dark:border-gray-600">
                {canEdit && (
                  <button
                    onClick={() => { setEditingPost(post.id); setEditedContent(post.content); }}
                    className="block w-full text-left px-4 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="block w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
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
    );
  };

  if (isLoading && posts.length === 0) {
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

  if (posts.length === 0 && !isLoading) {
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
      {displayedPosts.map(renderPost)}
      
      <div ref={loadMoreTriggerRef} className="flex justify-center p-4">
        {isLoadingMore ? (
        <div className="animate-pulse space-y-4 w-full">
          <div className="bg-gray-200 dark:bg-gray-700 h-10 rounded-lg"></div>
        </div>
      ) : hasMorePosts ? (
          <button 
            onClick={loadMorePosts}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Load more
          </button>
      ) : posts.length > 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No more posts to load</p>
      ) : null}
      </div>

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
    </div>
  );
} 