'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../utils/firebase';

interface Stats {
  users: {
    total: number;
    active24h: number;
    active7d: number;
    banned: number;
  };
  content: {
    totalPosts: number;
    totalComments: number;
    postsToday: number;
    commentsToday: number;
  };
  topUsers: Array<{
    address: string;
    name?: string;
    posts: number;
    comments: number;
  }>;
}

export default function Statistics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    fetchStats();
  }, [timeframe]);

  const fetchStats = async () => {
    try {
      // 1. Pobierz statystyki użytkowników
      const usersRef = collection(db, 'users');
      const bannedUsersRef = collection(db, 'bannedUsers');
      const postsRef = collection(db, 'posts');

      // Określ przedział czasowy
      const now = new Date();
      const timeframeDate = new Date();
      switch (timeframe) {
        case '24h':
          timeframeDate.setDate(now.getDate() - 1);
          break;
        case '7d':
          timeframeDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          timeframeDate.setDate(now.getDate() - 30);
          break;
      }

      // Pobierz wszystkich użytkowników
      const usersSnapshot = await getDocs(usersRef);
      const bannedSnapshot = await getDocs(bannedUsersRef);

      // Pobierz posty z wybranego okresu
      const recentPostsQuery = query(
        postsRef,
        where('timestamp', '>=', Timestamp.fromDate(timeframeDate)),
        orderBy('timestamp', 'desc')
      );
      const recentPostsSnapshot = await getDocs(recentPostsQuery);

      // Pobierz top użytkowników
      const userStats = new Map();
      recentPostsSnapshot.docs.forEach(doc => {
        const post = doc.data();
        const author = post.author;
        if (!userStats.has(author)) {
          userStats.set(author, { posts: 0, comments: 0 });
        }
        userStats.get(author).posts += 1;
        if (post.comments) {
          userStats.get(author).comments += post.comments.length;
        }
      });

      // Sortuj użytkowników po aktywności
      const topUsers = Array.from(userStats.entries())
        .map(([address, stats]) => ({
          address,
          ...stats
        }))
        .sort((a, b) => (b.posts + b.comments) - (a.posts + a.comments))
        .slice(0, 10);

      // Oblicz statystyki
      const stats: Stats = {
        users: {
          total: usersSnapshot.size,
          active24h: recentPostsSnapshot.docs.filter(doc => 
            doc.data().timestamp.toDate() >= new Date(Date.now() - 24 * 60 * 60 * 1000)
          ).length,
          active7d: recentPostsSnapshot.size,
          banned: bannedSnapshot.size,
        },
        content: {
          totalPosts: recentPostsSnapshot.size,
          totalComments: recentPostsSnapshot.docs.reduce((acc, doc) => 
            acc + (doc.data().comments?.length || 0), 0
          ),
          postsToday: recentPostsSnapshot.docs.filter(doc => 
            doc.data().timestamp.toDate() >= new Date(Date.now() - 24 * 60 * 60 * 1000)
          ).length,
          commentsToday: recentPostsSnapshot.docs.filter(doc => 
            doc.data().timestamp.toDate() >= new Date(Date.now() - 24 * 60 * 60 * 1000)
          ).reduce((acc, doc) => acc + (doc.data().comments?.length || 0), 0),
        },
        topUsers,
      };

      setStats(stats);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Ładowanie statystyk...</div>;
  }

  if (!stats) {
    return <div>Nie udało się załadować statystyk</div>;
  }

  return (
    <div className="space-y-8">
      {/* Przyciski wyboru okresu */}
      <div className="flex space-x-4">
        <button
          onClick={() => setTimeframe('24h')}
          className={`px-4 py-2 rounded-lg font-semibold ${
            timeframe === '24h'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600'
          }`}
        >
          24 godziny
        </button>
        <button
          onClick={() => setTimeframe('7d')}
          className={`px-4 py-2 rounded-lg font-semibold ${
            timeframe === '7d'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600'
          }`}
        >
          7 dni
        </button>
        <button
          onClick={() => setTimeframe('30d')}
          className={`px-4 py-2 rounded-lg font-semibold ${
            timeframe === '30d'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600'
          }`}
        >
          30 dni
        </button>
      </div>

      {/* Statystyki użytkowników */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Użytkownicy</h3>
          <div className="space-y-2 text-gray-900 dark:text-gray-100">
            <p>Łącznie: {stats.users.total}</p>
            <p>Aktywni (24h): {stats.users.active24h}</p>
            <p>Aktywni (7d): {stats.users.active7d}</p>
            <p>Zbanowani: {stats.users.banned}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Treści</h3>
          <div className="space-y-2 text-gray-900 dark:text-gray-100">
            <p>Posty dziś: {stats.content.postsToday}</p>
            <p>Komentarze dziś: {stats.content.commentsToday}</p>
            <p>Wszystkie posty: {stats.content.totalPosts}</p>
            <p>Wszystkie komentarze: {stats.content.totalComments}</p>
          </div>
        </div>
      </div>

      {/* Top użytkownicy */}
      <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Najbardziej aktywni użytkownicy</h3>
        <div className="space-y-2">
          {stats.topUsers.map((user, index) => (
            <div key={user.address} className="flex items-center justify-between">
              <div>
                <span className="font-mono text-gray-900 dark:text-gray-100">
                  {user.address.slice(0, 6)}...{user.address.slice(-4)}
                </span>
              </div>
              <div className="text-sm text-gray-900 dark:text-gray-100">
                Posty: {user.posts} | Komentarze: {user.comments}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 