'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, deleteComment, deletePost, ADMIN_ADDRESS } from '../../utils/firebase';
import { Post, Comment } from '../../types';
import { useAccount } from 'wagmi';

interface ExtendedPost extends Post {
  id: string;
}

/**
 * Wpis z LEGACY tablicy posta bez pol platnej odpowiedzi. Panel czyta posty
 * wprost z Firestore (z pominieciem mapPostDoc), a tablice zapisuje kazda
 * przegladarka - platna odpowiedz nigdy w niej nie lezy, wiec `tipLamports`
 * czy `via` w tablicy to podrobka i nie moze dac etykiety "paid reply".
 */
const withoutPaidFields = (entry: Comment): Comment => {
  const { tipLamports: _tipLamports, via: _via, ...rest } = entry;
  return rest as Comment;
};

/**
 * Tekst do wyswietlenia z pola, ktore zapisuje kazda przegladarka. Wpis
 * w tablicy posta albo komentarz bez `author` (albo z obiektem w `content`)
 * wywracal render calego panelu - a to jest wlasnie narzedzie, ktorym admin
 * zdejmuje podrobki. Jeden zly wpis nie moze go wylaczyc.
 */
const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

const shortAuthor = (name: unknown, author: unknown): string => {
  if (typeof name === 'string' && name) return name;
  const address = asText(author);
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'unknown';
};

/** Kwota platnej odpowiedzi do etykiety; lamporty leza w bazie jako string. */
const paidReplySol = (comment: Comment): string | null => {
  if (comment.tipLamports == null) return null;
  const lamports = Number(comment.tipLamports);
  return Number.isFinite(lamports) ? `${lamports / 1e9} SOL` : '';
};

export default function ContentModeration() {
  const [posts, setPosts] = useState<ExtendedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ExtendedPost | null>(null);
  const [isDeleting, setIsDeleting] = useState<{[key: string]: boolean}>({});
  const { address } = useAccount();

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const postsRef = collection(db, 'posts');
      const q = query(postsRef, orderBy('timestamp', 'desc'), limit(50));
      const snapshot = await getDocs(q);

      const postsData = snapshot.docs.map(doc => {
        const data = doc.data() as Post;
        const legacy: unknown[] = Array.isArray(data.comments) ? data.comments : [];
        return {
          ...data,
          id: doc.id,
          comments: legacy
            .filter((entry): entry is Comment => typeof entry === 'object' && entry !== null)
            .map(withoutPaidFields),
        };
      });

      // Nowe komentarze zyja WYLACZNIE w kolekcji `comments` (dokument posta
      // niesie sam licznik) - panel czytajacy tylko tablice legacy bylby
      // slepy na wszystko, co powstalo po wprowadzeniu licznikow. Jedno
      // zapytanie o najswiezsze wpisy i scalenie po id per post.
      try {
        const commentsSnap = await getDocs(
          query(collection(db, 'comments'), orderBy('timestamp', 'desc'), limit(200))
        );
        const byPost = new Map<string, Comment[]>();
        commentsSnap.docs.forEach(commentDoc => {
          const data = commentDoc.data() as Comment & { postId?: string; timestamp?: any };
          if (!data.postId) return;
          const list = byPost.get(data.postId) ?? [];
          list.push({
            ...data,
            id: commentDoc.id,
            timestamp:
              typeof data.timestamp === 'number'
                ? data.timestamp
                : data.timestamp?.toMillis?.() ?? Date.now(),
          } as Comment);
          byPost.set(data.postId, list);
        });
        for (const post of postsData) {
          const fresh = byPost.get(post.id);
          if (!fresh) continue;
          // Przy kolizji ID wygrywa kopia z kolekcji: tylko ona moze byc
          // platna odpowiedzia, a wpis z tablicy pod tym samym ID podmienialby
          // jej tresc i autora (tablice zapisuje kazda przegladarka).
          const fromCollection = new Set(fresh.map(c => c.id));
          post.comments = [
            ...(post.comments || []).filter(c => !fromCollection.has(c.id)),
            ...fresh,
          ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        }
      } catch (mergeError) {
        // Panel dalej pokazuje komentarze legacy - lepsze to niz pusty ekran.
        console.error('Error merging collection comments:', mergeError);
      }

      setPosts(postsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching posts:', error);
      setLoading(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!address || address.toLowerCase() !== ADMIN_ADDRESS) {
      alert('Only admins can delete posts');
      return;
    }

    if (!confirm('Are you sure you want to delete this post and all its comments?')) {
      return;
    }

    try {
      setIsDeleting(prev => ({ ...prev, [`post-${postId}`]: true }));

      // deletePost, nie goly deleteDoc: tamten kasowal SAM dokument posta,
      // a komentarze (w tym platne odpowiedzi) zostawaly w kolekcji jako
      // sieroty. deletePost usuwa je w tym samym batchu co post - tylko tak
      // reguly pozwalaja przegladarce zdjac platna odpowiedz razem z postem.
      await deletePost(postId, address);

      // Aktualizuj stan lokalny
      setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
      setSelectedPost(null);
      
      alert('Post deleted successfully!');
    } catch (error) {
      console.error('Error deleting post:', error);
      alert(`Error deleting post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(prev => ({ ...prev, [`post-${postId}`]: false }));
    }
  };

  // 🚀 POPRAWNA FUNKCJA - używa prawdziwej deleteComment z firebase.ts
  const handleDeleteComment = async (postId: string, commentId: string, isPaidReply = false) => {
    if (!address || address.toLowerCase() !== ADMIN_ADDRESS) {
      alert('Only admins can delete comments');
      return;
    }

    const question = isPaidReply
      ? 'This is a paid reply - its author already tipped the post author on Solana. Remove it anyway?'
      : 'Are you sure you want to delete this comment?';
    if (!confirm(question)) {
      return;
    }

    try {
      setIsDeleting(prev => ({ ...prev, [`comment-${commentId}`]: true }));

      // deleteComment sam rozpoznaje platna odpowiedz (po dokumencie
      // w kolekcji, nie po tym, co widzi panel) i usuwa ja przez serwer -
      // przegladarce reguly na to nie pozwalaja. Wymaga sesji SIWE admina.
      await deleteComment(postId, commentId, address);

      // Aktualizuj stan lokalny - komentarz znika razem z odpowiedziami,
      // tak jak w bazie (deleteComment i trasa moderacji kasuja tez odpowiedzi).
      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === postId
            ? {
                ...post,
                comments: post.comments.filter(
                  comment => comment.id !== commentId && comment.replyTo !== commentId
                )
              }
            : post
        )
      );

      alert('Comment deleted successfully!');
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert(`Error deleting comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(prev => ({ ...prev, [`comment-${commentId}`]: false }));
    }
  };

  // Sprawdź czy użytkownik jest adminem
  const isAdmin = address && address.toLowerCase() === ADMIN_ADDRESS;

  if (!isAdmin) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-xl font-bold text-red-800 mb-4">⚠️ Access Denied</h2>
        <p className="text-red-700">
          Only administrators can access content moderation panel.
          <br />
          Please connect with an admin wallet to continue.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading posts for moderation...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h2 className="text-xl font-bold text-blue-800 mb-2">🛡️ Content Moderation Panel</h2>
        <p className="text-blue-700 text-sm">
          Admin: {address?.slice(0, 6)}...{address?.slice(-4)} | 
          Total Posts: {posts.length} | 
          Total Comments: {posts.reduce((acc, post) => acc + (post.comments?.length || 0), 0)}
        </p>
        <button 
          onClick={fetchPosts}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 Refresh Posts
        </button>
      </div>

      <div className="grid gap-4">
        {posts.map((post) => (
          <div key={post.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <strong>Author:</strong> {shortAuthor(post.authorName, post.author)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <strong>Date:</strong> {new Date(post.timestamp).toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <strong>Post ID:</strong> {post.id}
                </p>
                {post.isPinned && (
                  <p className="text-sm text-yellow-600 font-medium">
                    📌 PINNED POST
                  </p>
                )}
              </div>
              <button
                onClick={() => handleDeletePost(post.id)}
                disabled={isDeleting[`post-${post.id}`]}
                className="px-3 py-1 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 border border-red-300 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {isDeleting[`post-${post.id}`] ? 'Deleting...' : '🗑️ Delete Post'}
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-gray-900 dark:text-gray-100">{asText(post.content)}</p>
              {post.image && (
                <img src={post.image} alt="Post content" className="mt-2 rounded-lg max-h-48 object-cover" />
              )}
              {post.video && (
                <video src={post.video} className="mt-2 rounded-lg max-h-48" controls />
              )}
            </div>

            {post.comments && post.comments.length > 0 && (
              <div className="border-t dark:border-gray-700 pt-4">
                <h4 className="text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
                  💬 Comments ({post.comments.length})
                </h4>
                <div className="space-y-3">
                  {post.comments.map((comment) => (
                    <div key={comment.id} className="flex justify-between items-start bg-gray-50 dark:bg-gray-700 p-3 rounded border-l-4 border-gray-300">
                      <div className="flex-1">
                        <p className="text-sm text-gray-900 dark:text-gray-100 mb-1">{asText(comment.content)}</p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            <strong>Author:</strong> {shortAuthor(comment.authorName, comment.author)}
                          </span>
                          <span>
                            <strong>Date:</strong> {new Date(comment.timestamp).toLocaleString()}
                          </span>
                          <span>
                            <strong>ID:</strong> {comment.id}
                          </span>
                          {comment.txHash && (
                            <span className="text-blue-500">⛓️ Onchain</span>
                          )}
                          {paidReplySol(comment) !== null && (
                            <span
                              className="rounded border border-purple-300 bg-purple-50 px-1.5 py-0.5 font-semibold text-purple-700 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                              title="Paid reply: saved by the server after verifying the Solana transaction. Removal goes through the server."
                            >
                              paid reply{paidReplySol(comment) ? ` · ${paidReplySol(comment)}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteComment(post.id, comment.id, comment.tipLamports != null)}
                        disabled={isDeleting[`comment-${comment.id}`]}
                        className="ml-3 px-2 py-1 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 text-sm border border-red-300 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {isDeleting[`comment-${comment.id}`] ? 'Deleting...' : '🗑️ Delete'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {posts.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No posts found for moderation.
        </div>
      )}
    </div>
  );
} 