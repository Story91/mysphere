'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db, updateAllUserJoinDates, addBaseNameBonusToAllUsers, fixBaseChatPointsRadical, refreshAllPosts } from '../../utils/firebase';

interface UserWithJoinDate {
  address: string;
  name?: string;
  joinedAt: number;
  lastActive?: number;
}

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
  recentUsers?: UserWithJoinDate[];
}

export default function Statistics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d'>('24h');
  const [isAddingBaseNameBonusToAll, setIsAddingBaseNameBonusToAll] = useState(false);
  const [addToAllResult, setAddToAllResult] = useState<{success: boolean, updatedUsers: number, error?: string} | null>(null);
  const [isFixingBaseChatPointsRadical, setIsFixingBaseChatPointsRadical] = useState(false);
  const [fixBaseChatPointsRadicalResult, setFixBaseChatPointsRadicalResult] = useState<{success: boolean, updatedUsers: number, error?: string} | null>(null);
  const [isUpdatingJoinDates, setIsUpdatingJoinDates] = useState(false);
  const [updateJoinDatesResult, setUpdateJoinDatesResult] = useState<{success: boolean, updatedUsers: number, error?: string} | null>(null);
  const [isRefreshingAllPosts, setIsRefreshingAllPosts] = useState(false);
  const [refreshAllPostsResult, setRefreshAllPostsResult] = useState<{success: boolean, processedPosts: number, updatedPosts: number, updatedUsers: number, error?: string} | null>(null);
  const [userSortOrder, setUserSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [showingUsers, setShowingUsers] = useState<number>(10);

  useEffect(() => {
    fetchStats();
  }, [timeframe]);

  // Dodaj efekt, który będzie aktualizował listę użytkowników po zmianie sortowania
  useEffect(() => {
    if (stats && stats.recentUsers) {
      const sortedUsers = [...stats.recentUsers].sort(
        (a, b) => userSortOrder === 'newest' ? b.joinedAt - a.joinedAt : a.joinedAt - b.joinedAt
      );
      setStats({
        ...stats,
        recentUsers: sortedUsers
      });
    }
  }, [userSortOrder]);

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

      // Pobierz użytkowników z datą dołączenia
      const usersWithJoinDate: UserWithJoinDate[] = usersSnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            address: doc.id,
            name: data.name,
            joinedAt: data.joinedAt ? (data.joinedAt.toDate ? data.joinedAt.toDate().getTime() : data.joinedAt) : 0,
            lastActive: data.lastActive ? (data.lastActive.toDate ? data.lastActive.toDate().getTime() : data.lastActive) : 0
          };
        })
        .filter(user => user.joinedAt)
        .sort((a, b) => userSortOrder === 'newest' ? b.joinedAt - a.joinedAt : a.joinedAt - b.joinedAt)
        .slice(0, showingUsers);

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
        recentUsers: usersWithJoinDate
      };

      setStats(stats);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setLoading(false);
    }
  };

  // Funkcja do formatowania daty
  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Nieznana data';
    return new Date(timestamp).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleAddBaseNameBonusToAll = async () => {
    try {
      setIsAddingBaseNameBonusToAll(true);
      setAddToAllResult(null);
      
      const result = await addBaseNameBonusToAllUsers();
      setAddToAllResult(result);
    } catch (error) {
      console.error('Error adding BaseName bonus to all users:', error);
      setAddToAllResult({
        success: false,
        updatedUsers: 0,
        error: error instanceof Error ? error.message : 'Nieznany błąd podczas dodawania bonusu BaseName dla wszystkich użytkowników'
      });
    } finally {
      setIsAddingBaseNameBonusToAll(false);
    }
  };

  const handleFixBaseChatPointsRadical = async () => {
    try {
      setIsFixingBaseChatPointsRadical(true);
      setFixBaseChatPointsRadicalResult(null);
      
      const result = await fixBaseChatPointsRadical();
      setFixBaseChatPointsRadicalResult(result);
    } catch (error) {
      console.error('Error fixing baseChatPoints radically for all users:', error);
      setFixBaseChatPointsRadicalResult({
        success: false,
        updatedUsers: 0,
        error: error instanceof Error ? error.message : 'Nieznany błąd podczas radykalnej naprawy struktury baseChatPoints'
      });
    } finally {
      setIsFixingBaseChatPointsRadical(false);
    }
  };

  const handleUpdateJoinDates = async () => {
    try {
      setIsUpdatingJoinDates(true);
      setUpdateJoinDatesResult(null);
      
      const result = await updateAllUserJoinDates();
      setUpdateJoinDatesResult(result);
    } catch (error) {
      console.error('Error updating join dates:', error);
      setUpdateJoinDatesResult({
        success: false,
        updatedUsers: 0,
        error: error instanceof Error ? error.message : 'Nieznany błąd podczas aktualizacji dat dołączenia'
      });
    } finally {
      setIsUpdatingJoinDates(false);
    }
  };

  const handleRefreshAllPosts = async () => {
    try {
      setIsRefreshingAllPosts(true);
      setRefreshAllPostsResult(null);
      
      const result = await refreshAllPosts();
      setRefreshAllPostsResult(result);
    } catch (error) {
      console.error('Error refreshing all posts:', error);
      setRefreshAllPostsResult({
        success: false,
        processedPosts: 0,
        updatedPosts: 0,
        updatedUsers: 0,
        error: error instanceof Error ? error.message : 'Nieznany błąd podczas odświeżania wszystkich postów'
      });
    } finally {
      setIsRefreshingAllPosts(false);
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

      {/* Akcje administratora */}
      <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Akcje administratora</h3>
        <div className="space-y-4">
          <div>
            <button
              onClick={handleRefreshAllPosts}
              disabled={isRefreshingAllPosts}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {isRefreshingAllPosts ? 'Odświeżanie...' : 'Odśwież wszystkie posty i przelicz punkty użytkowników'}
            </button>
            
            {refreshAllPostsResult && (
              <div className={`mt-2 p-2 rounded ${refreshAllPostsResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {refreshAllPostsResult.success 
                  ? `Sukces! Przetworzono ${refreshAllPostsResult.processedPosts} postów, zaktualizowano ${refreshAllPostsResult.updatedPosts} postów i ${refreshAllPostsResult.updatedUsers} użytkowników.` 
                  : `Błąd: ${refreshAllPostsResult.error}`}
              </div>
            )}
          </div>

          <div>
            <button
              onClick={handleFixBaseChatPointsRadical}
              disabled={isFixingBaseChatPointsRadical}
              className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-50"
            >
              {isFixingBaseChatPointsRadical ? 'Naprawianie...' : 'RADYKALNIE napraw strukturę baseChatPoints dla wszystkich użytkowników'}
            </button>
            
            {fixBaseChatPointsRadicalResult && (
              <div className={`mt-2 p-2 rounded ${fixBaseChatPointsRadicalResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {fixBaseChatPointsRadicalResult.success 
                  ? `Sukces! Zaktualizowano ${fixBaseChatPointsRadicalResult.updatedUsers} użytkowników.` 
                  : `Błąd: ${fixBaseChatPointsRadicalResult.error}`}
              </div>
            )}
          </div>

          <div>
            <button
              onClick={handleAddBaseNameBonusToAll}
              disabled={isAddingBaseNameBonusToAll}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {isAddingBaseNameBonusToAll ? 'Dodawanie...' : 'Jednorazowo dodaj baseNameBonus (1000 punktów) dla wszystkich użytkowników z BaseName'}
            </button>
            
            {addToAllResult && (
              <div className={`mt-2 p-2 rounded ${addToAllResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {addToAllResult.success 
                  ? `Sukces! Zaktualizowano ${addToAllResult.updatedUsers} użytkowników.` 
                  : `Błąd: ${addToAllResult.error}`}
              </div>
            )}
          </div>

          <div>
            <button
              onClick={handleUpdateJoinDates}
              disabled={isUpdatingJoinDates}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isUpdatingJoinDates ? 'Aktualizowanie...' : 'Aktualizuj daty dołączenia użytkowników'}
            </button>
            
            {updateJoinDatesResult && (
              <div className={`mt-2 p-2 rounded ${updateJoinDatesResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {updateJoinDatesResult.success 
                  ? `Sukces! Zaktualizowano ${updateJoinDatesResult.updatedUsers} użytkowników.` 
                  : `Błąd: ${updateJoinDatesResult.error}`}
              </div>
            )}
          </div>
        </div>
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

      {/* Lista użytkowników według daty dołączenia */}
      {stats.recentUsers && stats.recentUsers.length > 0 && (
        <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Użytkownicy według daty dołączenia
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setUserSortOrder('newest')}
                className={`px-3 py-1 text-sm rounded ${
                  userSortOrder === 'newest'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500'
                }`}
              >
                Najnowsi
              </button>
              <button
                onClick={() => setUserSortOrder('oldest')}
                className={`px-3 py-1 text-sm rounded ${
                  userSortOrder === 'oldest'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500'
                }`}
              >
                Najstarsi
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Adres
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Nazwa
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Data dołączenia
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Ostatnia aktywność
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-800">
                {stats.recentUsers.map((user) => (
                  <tr key={user.address} className="hover:bg-gray-50 dark:hover:bg-gray-600">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">
                      {user.address.slice(0, 6)}...{user.address.slice(-4)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {user.name || 'Brak nazwy'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatDate(user.joinedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {user.lastActive ? formatDate(user.lastActive) : 'Brak aktywności'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setShowingUsers(prev => prev + 10)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Pokaż więcej
            </button>
          </div>
        </div>
      )}

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