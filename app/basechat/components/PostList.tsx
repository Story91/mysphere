'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Post, Comment } from '../../types';
import { doc, updateDoc, serverTimestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import { fetchPosts, db, toggleLike, deletePost, toggleCommentLike, editComment, deleteComment, addCommentReply, addComment } from '../../utils/firebase';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Avatar as CoinbaseAvatar } from '@coinbase/onchainkit/identity';
import LinkPreview from './LinkPreview';
import CommentTransactionButton from '../../components/CommentTransactionButton';

export interface ExtendedPost extends Post {
  pollId?: string;
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
  displayUserName: (userAddress: string, elementId: string) => JSX.Element;
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
  
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const { address, isConnected } = useAccount();

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
      const newComment = {
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
      
      if (onCommentAdded) {
        await onCommentAdded();
      } else {
        await refreshPosts();
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
      await refreshPosts();
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!address) return;
    
    try {
      // Najpierw lokalnie aktualizujemy UI dla natychmiastowej odpowiedzi
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
      
      // Odświeżamy lokalnie posty dla natychmiastowej aktualizacji UI
      // Nie można używać setPosts, bo to jest props, ale możemy przekazać zaktualizowane posty do rodzica
      // przez onRefreshPosts, jeśli zaimplementujemy tę funkcję
      
      // Następnie wysyłamy akcję do Firebase
      await toggleLike(postId, address);
      
      // Na końcu odświeżamy posty z serwera
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
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
        await deleteComment(postId, commentId);
        
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
      // Optymistyczne UI - aktualizujemy stan lokalnie przed żądaniem do serwera
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
      
      // Wykonaj rzeczywiste żądanie do serwera
      await toggleCommentLike(postId, commentId, address);
      
      // Odśwież posty aby zsynchronizować stan serwera
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    } catch (error) {
      console.error('Error toggling comment like:', error);
      toast.error('Failed to like comment');
      // W przypadku błędu, przywróć poprzedni stan poprzez odświeżenie postów
      if (onRefreshPosts) {
        await onRefreshPosts();
      }
    }
  };

  const handleAddReply = async (postId: string, commentId: string) => {
    if (!address || !replyContent.trim()) return;
    
    try {
      await addCommentReply(postId, commentId, {
        author: address,
        content: replyContent.trim()
      });
      
      setReplyingTo(null);
      setReplyContent('');
      
      await refreshPosts();
      
      toast.success('Reply added successfully');
    } catch (error) {
      console.error('Error adding reply:', error);
      toast.error('Failed to add reply');
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
        // Sprawdź, czy onRefreshPosts jest dostępne
        if (onRefreshPosts) {
          // Wywołaj funkcję z nowymi postami
          // Teraz potrzebujemy zmienić implementację w komponencie nadrzędnym,
          // aby obsłużyć dodawanie nowych postów do istniejących, zamiast tylko odświeżania
          await onRefreshPosts(morePosts);
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
    }, { threshold: 0.5 });

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }
    
    return () => {
      if (loadMoreTriggerRef.current) {
        observer.unobserve(loadMoreTriggerRef.current);
      }
    };
  }, [hasMorePosts, isLoadingMore, lastVisible]);

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

  const renderComments = (post: ExtendedPost) => {
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

        {post.comments && post.comments.map((comment: Comment, index: number) => (
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
                        {displayUserName(comment.author, `comment-${comment.id}`).props.children[0].props.children[1]}
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
                      <button
                        onClick={() => handleAddReply(post.id, comment.id)}
                        disabled={!replyContent.trim()}
                        className="px-2 py-1 text-xs bg-blue-500 text-white rounded disabled:opacity-50"
                      >
                        Reply
                      </button>
                      <button
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyContent('');
                        }}
                        className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {comment.replies && comment.replies.length > 0 && (
                  <div className="mt-3 pl-3 border-l-2 border-gray-100 dark:border-gray-800 space-y-2">
                    {comment.replies.map((reply: Comment, replyIndex: number) => (
                      <div key={replyIndex} className={`text-xs ${replyIndex > 0 ? 'mt-2 pt-2 border-t border-gray-50 dark:border-gray-900' : ''}`}>
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
                                {displayUserName(reply.author, `reply-${comment.id}-${replyIndex}`).props.children[0].props.children[1]}
                              </span>
                              <span className="text-[10px] text-gray-500 ml-1.5">
                                {formatTimestamp(reply.timestamp)}
                              </span>
                            </div>
                            <div className="text-xs text-gray-800 dark:text-gray-200 mt-0.5 whitespace-pre-wrap">
                              {reply.content}
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
      {displayedPosts.map((post) => (
        <div key={post.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div>
                <div className="font-medium text-gray-900 dark:text-white flex items-center scale-110 transform origin-left">
                  {displayUserName(post.author, `post-${post.id}`)}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="text-sm text-gray-500">
                {formatTimestamp(post.timestamp)}
                {post.lastEdited && <span className="ml-2 text-xs italic">(edited)</span>}
              </div>
            
              {post.author === address && (
                <div className="relative">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => {
                        setEditingPost(post.id);
                        setEditedContent(post.content);
                      }}
                      className="text-gray-400 hover:text-blue-500 p-1"
                    >
                      <svg className="w-5 h-5 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <svg className="w-5 h-5 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mb-3 border-b border-gray-100 dark:border-gray-700 pb-1"></div>

          {editingPost === post.id ? (
            <div className="mb-4">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                rows={4}
              />
              <div className="flex justify-end mt-2 space-x-2">
                <button
                  onClick={() => handleEditPost(post.id, editedContent)}
                  className="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingPost(null);
                    setEditedContent('');
                  }}
                  className="px-3 py-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-800 dark:text-gray-200 mb-4 whitespace-pre-wrap break-words">
              {post.content.length > 500 && !expandedTextPosts[post.id] ? (
                <>
                  {post.content.substring(0, 500)}...
                  <button 
                    onClick={() => setExpandedTextPosts(prev => ({ ...prev, [post.id]: true }))}
                    className="text-blue-500 hover:text-blue-600 font-medium text-sm ml-1"
                  >
                    Show more
                  </button>
                </>
              ) : (
                <>
                  {post.content}
                  {post.content.length > 500 && expandedTextPosts[post.id] && (
                    <button 
                      onClick={() => setExpandedTextPosts(prev => ({ ...prev, [post.id]: false }))}
                      className="text-blue-500 hover:text-blue-600 font-medium text-sm block mt-2"
                    >
                      Show less
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {post.image && (
            <div className="mb-4 rounded-lg overflow-hidden">
              <div className="relative cursor-pointer">
                <img 
                  src={post.image} 
                  alt="Post content" 
                  className="w-full object-cover rounded-lg max-h-72"
                  loading="lazy"
                  onClick={(e) => {
                    if (post.image) {
                      setEnlargedImage(post.image);
                    }
                  }}
                />
                <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full opacity-80">
                  <svg className="w-3 h-3 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View
                </div>
              </div>
            </div>
          )}
          
          {post.video && (
            <div className="mb-4 rounded-lg overflow-hidden">
              <div className="relative">
                <video 
                  src={post.video} 
                  controls 
                  className="w-full rounded-lg max-h-72"
                  preload="metadata"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  Your browser does not support the video tag.
                </video>
                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full opacity-80">
                  <svg className="w-3 h-3 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Video
                </div>
              </div>
            </div>
          )}

          {post.content.includes('http') && !post.image && !post.video && (
            <div className="mb-4">
              <LinkPreview content={post.content} />
            </div>
          )}

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map(tag => (
                <span 
                  key={tag} 
                  className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-300 rounded-lg text-xs"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex space-x-4">
              <button
                onClick={() => handleToggleLike(post.id)}
                className={`flex items-center space-x-1.5 ${
                  post.likedBy?.includes(address || '') ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'
                }`}
              >
                {post.likedBy?.includes(address || '') ? (
                  <svg className="w-5 h-5 transform scale-95" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                )}
                <span>{post.likes || 0}</span>
              </button>
              <button
                onClick={() => setExpandedComments(prev => ({
                  ...prev,
                  [post.id]: !prev[post.id]
                }))}
                className="flex items-center space-x-1.5 text-gray-500 hover:text-blue-500"
              >
                <svg className="w-5 h-5 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>{post.comments?.length || 0}</span>
              </button>
              {post.txHash && (
                <a
                  href={`https://basescan.org/tx/${post.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-1.5 text-gray-500 hover:text-blue-500"
                >
                  <svg className="w-5 h-5 transform scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="hidden sm:inline">Transaction</span>
                </a>
              )}
            </div>
            
            {post.timestamp && (
              <div className="text-xs text-gray-400">
                {new Date(post.timestamp).toLocaleDateString()}
              </div>
            )}
          </div>

          {expandedComments[post.id] && renderComments(post)}
        </div>
      ))}
      
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