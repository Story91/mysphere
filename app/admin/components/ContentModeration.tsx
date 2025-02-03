'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { Post, Comment } from '../../types';

interface ExtendedPost extends Post {
  id: string;
}

export default function ContentModeration() {
  const [posts, setPosts] = useState<ExtendedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ExtendedPost | null>(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const postsRef = collection(db, 'posts');
      const q = query(postsRef, orderBy('timestamp', 'desc'), limit(50));
      const snapshot = await getDocs(q);

      const postsData = snapshot.docs.map(doc => ({
        ...(doc.data() as Post),
        id: doc.id,
      }));

      setPosts(postsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching posts:', error);
      setLoading(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      // Usuń post
      const postRef = doc(db, 'posts', postId);
      await deleteDoc(postRef);

      // Usuń komentarze posta
      const commentsRef = collection(db, 'posts', postId, 'comments');
      const commentsSnapshot = await getDocs(commentsRef);
      
      const deletePromises = commentsSnapshot.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      
      await Promise.all(deletePromises);

      // Aktualizuj stan
      setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
      setSelectedPost(null);
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    try {
      const commentRef = doc(db, 'posts', postId, 'comments', commentId);
      await deleteDoc(commentRef);

      // Aktualizuj stan
      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === postId
            ? {
                ...post,
                comments: post.comments.filter(comment => comment.id !== commentId)
              }
            : post
        )
      );
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  if (loading) {
    return <div>Ładowanie...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {posts.map((post) => (
          <div key={post.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Autor: {post.authorName || post.author.slice(0, 6) + '...' + post.author.slice(-4)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Data: {new Date(post.timestamp).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => handleDeletePost(post.id)}
                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
              >
                Usuń post
              </button>
            </div>

            <div className="mb-4">
              <p className="text-gray-900 dark:text-gray-100">{post.content}</p>
              {post.image && (
                <img src={post.image} alt="Post content" className="mt-2 rounded-lg max-h-48 object-cover" />
              )}
            </div>

            {post.comments && post.comments.length > 0 && (
              <div className="border-t dark:border-gray-700 pt-4">
                <h4 className="text-sm font-medium mb-2">Komentarze ({post.comments.length})</h4>
                <div className="space-y-2">
                  {post.comments.map((comment) => (
                    <div key={comment.id} className="flex justify-between items-start bg-gray-50 dark:bg-gray-700 p-2 rounded">
                      <div>
                        <p className="text-sm text-gray-900 dark:text-gray-100">{comment.content}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {comment.authorName || comment.author.slice(0, 6) + '...' + comment.author.slice(-4)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteComment(post.id, comment.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 text-sm"
                      >
                        Usuń
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 