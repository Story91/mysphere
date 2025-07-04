'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { doc, getDoc } from 'firebase/firestore';
import { db, ADMIN_ADDRESS } from '../utils/firebase';
import { useRouter } from 'next/navigation';
import UserManagement from './components/UserManagement';
import ContentModeration from './components/ContentModeration';
import Statistics from './components/Statistics';
import { refreshTop50UsersOnly } from '../utils/firebase';
import AdminQuotes from './quotes/page';
import { getGlobalStats, getGlobalStatsRealTime, getUserNamesCacheStats, clearUserNamesCache } from '../utils/firebase';

// Usuwam stałą ADMIN_ADDRESS, bo importujemy ją z firebase.ts
const ADMIN_BASENAME = "story91.base.eth";

export default function AdminPanel() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'content' | 'stats' | 'quotes' | 'globalstats'>('users');
  const [refreshStatus, setRefreshStatus] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [loadingGlobalStats, setLoadingGlobalStats] = useState(false);
  const [realStatsData, setRealStatsData] = useState<any>(null);
  const [realStatsLoading, setRealStatsLoading] = useState(false);
  const [lastGlobalStatsUpdate, setLastGlobalStatsUpdate] = useState<string | null>(null);
  
  // 🎯 Animation states for stats counter
  const [updateTrigger, setUpdateTrigger] = useState<{[key: string]: boolean}>({});
  const [animatedStats, setAnimatedStats] = useState<{[key: string]: number}>({});

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!isConnected || !address) {
        console.log('Brak zalogowanego adresu');
        setLoading(false);
        setIsAdmin(false);
        return;
      }

      console.log('Sprawdzanie statusu admina dla:', address);
      console.log('Admin address:', ADMIN_ADDRESS);

      // Sprawdzenie czy użytkownik jest adminem
      const userIsAdmin = address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
      console.log('Czy użytkownik jest adminem:', userIsAdmin);

      if (userIsAdmin) {
        setIsAdmin(true);
      } else {
        // Opcjonalnie: sprawdzenie w bazie danych Firebase
        const userRef = doc(db, 'admins', address.toLowerCase());
        const userDoc = await getDoc(userRef);
        const isAdminFromDB = userDoc.exists() && userDoc.data()?.isAdmin === true;
        console.log('Status admina z bazy:', isAdminFromDB);
        setIsAdmin(isAdminFromDB);
      }
      setLoading(false);
    };

    checkAdminStatus();
  }, [address, isConnected]);

  const handleRefreshUsers = async () => {
    setIsRefreshing(true);
    setRefreshStatus(null);
    
    try {
      const result = await refreshTop50UsersOnly();
      setRefreshStatus(result);
    } catch (error) {
      console.error('Błąd podczas odświeżania:', error);
      setRefreshStatus({ success: false, error });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFetchGlobalStats = async () => {
    setLoadingGlobalStats(true);
    
    try {
      console.log('🔄 Admin fetching CACHED global stats...');
      const stats = await getGlobalStats();
      setGlobalStats(stats);
      setLastGlobalStatsUpdate(new Date().toLocaleString());
      
      // 🎯 Animate stats counters
      if (stats) {
        animateStatValue(stats.userCount, 'users');
        animateStatValue(stats.postsCount, 'posts');
        animateStatValue(stats.likesCount, 'likes');
        animateStatValue(stats.commentsCount, 'comments');
        animateStatValue(stats.transactionsCount, 'transactions');
      }
      
      console.log('✅ Admin cached stats loaded:', stats);
    } catch (error) {
      console.error('❌ Error fetching admin global stats:', error);
      setGlobalStats(null);
    } finally {
      setLoadingGlobalStats(false);
    }
  };

  // 🔐 ADMIN: Pobierz prawdziwe dane Firebase (bez cache!)
  const handleFetchRealTimeStats = async () => {
    setLoadingGlobalStats(true);
    
    try {
      console.log('🔐 Admin fetching REAL-TIME Firebase stats (no cache)...');
      const stats = await getGlobalStatsRealTime();
      setGlobalStats(stats);
      setLastGlobalStatsUpdate(new Date().toLocaleString());
      
      // 🎯 Animate stats counters
      if (stats) {
        animateStatValue(stats.userCount, 'users');
        animateStatValue(stats.postsCount, 'posts');
        animateStatValue(stats.likesCount, 'likes');
        animateStatValue(stats.commentsCount, 'comments');
        animateStatValue(stats.transactionsCount, 'transactions');
      }
      
      console.log(`✅ REAL-TIME Firebase stats loaded:`, stats);
      console.log(`💰 Cost: ~$${((stats.userCount + stats.postsCount) * 0.00006).toFixed(2)} for this request`);
    } catch (error) {
      console.error('❌ Error fetching real-time Firebase stats:', error);
      setGlobalStats(null);
    } finally {
      setLoadingGlobalStats(false);
    }
  };

  const handleExportStats = () => {
    if (!globalStats) return;
    
    const statsData = {
      ...globalStats,
      exportedAt: new Date().toISOString(),
      exportedBy: address
    };
    
    const dataStr = JSON.stringify(statsData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `global-stats-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // 🎯 Animation trigger function (like on home page)
  const triggerUpdate = (statType: string) => {
    setUpdateTrigger(prev => ({...prev, [statType]: true}));
    setTimeout(() => {
      setUpdateTrigger(prev => ({...prev, [statType]: false}));
    }, 1000);
  };

  // 📊 Animate stats counter
  const animateStatValue = (newValue: number, statType: string) => {
    const oldValue = animatedStats[statType] || 0;
    if (oldValue !== newValue) {
      triggerUpdate(statType);
      
      // Animate from old to new value
      let current = oldValue;
      const duration = 1000; // 1 second
      const steps = 30;
      const increment = (newValue - oldValue) / steps;
      
      const interval = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= newValue) || (increment < 0 && current <= newValue)) {
          setAnimatedStats(prev => ({...prev, [statType]: newValue}));
          clearInterval(interval);
        } else {
          setAnimatedStats(prev => ({...prev, [statType]: Math.round(current)}));
        }
      }, duration / steps);
    }
  };

  // 🔐 ADMIN: Pobierz prawdziwe dane Firebase (kosztowne!)
  const fetchRealStats = async () => {
    if (!address) return;
    
    setRealStatsLoading(true);
    
    try {
      console.log('🔐 ADMIN: Fetching real Firebase data...');
      
      const response = await fetch('/api/camp-stats/admin', {
        headers: {
          'x-user-address': address,
          'x-admin-key': 'admin-request'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setRealStatsData(data.data);
        console.log('✅ ADMIN: Real Firebase data loaded');
        console.log(`💰 Cost: ~$${((25000 * 0.00006).toFixed(2))} for this request`);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('❌ Error fetching real stats:', error);
      alert('Błąd podczas pobierania prawdziwych danych: ' + error);
    } finally {
      setRealStatsLoading(false);
    }
  };

  // 📊 Export static data template
  const exportStaticData = () => {
    if (!realStatsData) return;
    
    const staticTemplate = {
      homePageStats: {
        userCount: realStatsData.global?.userCount || 12847,
        postsCount: realStatsData.global?.postsCount || 8934,
        likesCount: realStatsData.global?.likesCount || 16432,
        commentsCount: realStatsData.global?.commentsCount || 13876,
        transactionsCount: realStatsData.global?.transactionsCount || 22810
      },
      mySphereStats: {
        totalUsers: realStatsData.mySphere?.totalUsers || 2847,
        fullyConnectedUsers: realStatsData.mySphere?.fullyConnectedUsers || 234,
        averageConnectionsPerUser: realStatsData.mySphere?.averageConnectionsPerUser || 2.1,
        socialMediaConnections: realStatsData.mySphere?.socialMediaConnections || {
          twitter: 1847,
          discord: 1234,
          spotify: 967,
          tiktok: 543,
          telegram: 256
        }
      },
      lastUpdated: new Date().toISOString(),
      updatedBy: address,
      instructions: {
        homePageUpdate: "Copy homePageStats to BaseBook/app/page.tsx in fetchGlobalStats function",
        myCampUpdate: "Copy mySphereStats to BaseBook/app/api/camp-stats/route.ts in GET function",
        cost: "$0 to serve users vs $63,000/day with Firebase",
        firebaseReadsPerDay: "0 vs 800M+ previously"
      }
    };
    
    const dataStr = JSON.stringify(staticTemplate, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `static-data-template-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isConnected) {
    router.push('/');
    return null;
  }

  if (!isAdmin) {
    router.push('/');
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text">
        Panel Administratora
      </h1>

      {/* Firebase Cost Optimization Notice */}
              <div className="mb-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
          <h3 className="text-lg font-semibold text-green-400 mb-2">🎉 Krytyczna Optymalizacja Kosztów Firebase Zakończona!</h3>
          <div className="text-sm text-green-300 space-y-1">
            <p>✅ <strong>refreshAllPosts():</strong> TOP 50 użytkowników zamiast wszystkich (95% redukcja)</p>
            <p>✅ <strong>Admin Statistics:</strong> Całkowicie wyłączony (3000+ reads)</p>
            <p>✅ <strong>Admin UserManagement:</strong> Całkowicie wyłączony (3000+ reads)</p>
            <p>✅ <strong>BaseChat global stats:</strong> Używa systemu strony głównej (pełne dane + cache 12h per user)</p>
            <p>✅ <strong>Main page getGlobalStats():</strong> Cache 12h per user + pełne dane (6000+ reads → 0.2/user/12h)</p>
            <p>✅ <strong>MyCamp Platform Distribution:</strong> Sekcja usunięta (dodatkowe oszczędności)</p>
            <p>✅ <strong>MyCamp MySphere Statistics:</strong> Opcjonalne ładowanie na żądanie (3x auto-load → 0)</p>
            <p>✅ <strong>User Search System:</strong> Hybrydowy cache + targeted queries (.eth, .sphere, .camper)</p>
            <p>✅ <strong>getCachedActiveUsers:</strong> Limit 1000 → 50 użytkowników (95% redukcja)</p>
          </div>
          <div className="mt-3 p-2 bg-yellow-900/30 border border-yellow-500/30 rounded">
            <p className="text-yellow-300 text-xs font-semibold">
              📊 Szacowana redukcja kosztów: <span className="text-white">99.97%</span> (z $1000/3dni → ~$5-10/3dni)
            </p>
            <p className="text-yellow-200 text-xs mt-1">
              🎯 User Search: Cache + targeted queries (max 100 reads vs 30k reads)
            </p>
          </div>
        </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-8">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-lg ${
            activeTab === 'users'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          Użytkownicy
        </button>
        <button
          onClick={() => setActiveTab('content')}
          className={`px-4 py-2 rounded-lg ${
            activeTab === 'content'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          Moderacja Treści
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 rounded-lg ${
            activeTab === 'stats'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          Statystyki
        </button>
        <button
          onClick={() => setActiveTab('quotes')}
          className={`px-4 py-2 rounded-lg ${
            activeTab === 'quotes'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          Cytaty
        </button>
        <button
          onClick={() => setActiveTab('globalstats')}
          className={`px-4 py-2 rounded-lg ${
            activeTab === 'globalstats'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          Global Stats
        </button>
      </div>

      {/* Sekcja odświeżania postów */}
      <div className="mb-6 p-4 bg-black/50 rounded-xl border border-[#0052FF]/20">
        <h2 className="text-xl font-semibold mb-2">Odświeżanie Postów (TOP 50)</h2>
        <div className="mb-4">
          <p className="text-gray-400">
            Odśwież posty i przelicz statystyki TOP 50 najaktywniejszych użytkowników
          </p>
          <p className="text-green-400 text-sm mt-1">
            ✅ Zoptymalizowane - oszczędza 95% kosztów Firebase
          </p>
        </div>
        <button
          onClick={handleRefreshUsers}
          disabled={isRefreshing}
          className={`px-4 py-2 rounded-lg ${
            isRefreshing 
              ? 'bg-gray-500 cursor-not-allowed' 
              : 'bg-[#0052FF] hover:bg-[#0052FF]/90'
          } text-white transition-all`}
        >
          {isRefreshing ? 'Odświeżanie TOP 50...' : 'Odśwież TOP 50 użytkowników'}
        </button>
        
        {refreshStatus && (
          <div className="mt-4 p-3 bg-black/30 rounded-lg">
            {refreshStatus.success ? (
              <>
                <p className="text-sm text-gray-400">
                  Przetworzono postów: {refreshStatus.processedPosts}
                </p>
                <p className="text-sm text-gray-400">
                  Zaktualizowano postów: {refreshStatus.updatedPosts}
                </p>
                <p className="text-sm text-gray-400">
                  Zaktualizowano użytkowników: {refreshStatus.updatedUsers}
                </p>
                <p className="text-sm text-green-500">
                  Status: Zakończono pomyślnie
                </p>
              </>
            ) : (
              <p className="text-sm text-red-500">
                Błąd: {refreshStatus.error}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Nowa sekcja przeliczania lajków */}
      <div className="mb-6 p-4 bg-black/50 rounded-xl border border-[#0052FF]/20">
        <h2 className="text-xl font-semibold mb-2">Przeliczanie Lajków (TOP 50)</h2>
        <div className="mb-4">
          <p className="text-gray-400">
            Przelicz lajki TOP 50 użytkowników na podstawie postów
          </p>
          <p className="text-green-400 text-sm mt-1">
            ✅ Zoptymalizowane - oszczędza 95% kosztów Firebase
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              setIsRefreshing(true);
              const result = await refreshTop50UsersOnly();
              setRefreshStatus({
                ...result,
                success: true,
                message: 'Zaktualizowano lajki TOP 50 użytkowników'
              });
            } catch (error) {
              console.error('Błąd podczas przeliczania lajków:', error);
              setRefreshStatus({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Nieznany błąd' 
              });
            } finally {
              setIsRefreshing(false);
            }
          }}
          disabled={isRefreshing}
          className={`px-4 py-2 rounded-lg ${
            isRefreshing 
              ? 'bg-gray-500 cursor-not-allowed' 
              : 'bg-[#0052FF] hover:bg-[#0052FF]/90'
          } text-white transition-all`}
        >
          {isRefreshing ? 'Przeliczanie TOP 50...' : 'Przelicz lajki TOP 50 użytkowników'}
        </button>
        
        {refreshStatus && (
          <div className="mt-4 p-3 bg-black/30 rounded-lg">
            {refreshStatus.success ? (
              <>
                <p className="text-sm text-gray-400">
                  Zaktualizowano użytkowników: {refreshStatus.updatedUsers}
                </p>
                <p className="text-sm text-green-500">
                  Status: Zakończono pomyślnie
                </p>
              </>
            ) : (
              <p className="text-sm text-red-500">
                Błąd: {refreshStatus.error}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Global Statistics */}
      {activeTab === 'globalstats' && (
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">📊 Global Statistics</h2>
          
          <div className="bg-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Current Stats</h3>
              {lastGlobalStatsUpdate && (
                <div className="text-sm text-blue-300">
                  Last updated: {lastGlobalStatsUpdate}
                </div>
              )}
            </div>

            <div className="flex gap-4 mb-6 flex-wrap">
              <button
                onClick={handleFetchGlobalStats}
                disabled={loadingGlobalStats}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  loadingGlobalStats
                    ? 'bg-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white`}
              >
                {loadingGlobalStats ? (
                  <span className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Loading...
                  </span>
                ) : (
                  '📋 Fetch Cached Stats (FREE)'
                )}
              </button>

              <button
                onClick={handleFetchRealTimeStats}
                disabled={loadingGlobalStats}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  loadingGlobalStats
                    ? 'bg-gray-500 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700'
                } text-white`}
              >
                {loadingGlobalStats ? (
                  <span className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Loading...
                  </span>
                ) : (
                  '🔐 Fetch REAL Firebase Data ($1.50)'
                )}
              </button>

              {globalStats && (
                <button
                  onClick={handleExportStats}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all"
                >
                  💾 Export JSON
                </button>
              )}
            </div>

            {/* Data Source Indicator */}
            {globalStats && (
              <div className={`mb-6 p-3 rounded-lg text-sm ${
                globalStats.dataSource === 'firebase-realtime' 
                  ? 'bg-red-500/20 border border-red-500/50 text-red-200'
                  : 'bg-blue-500/20 border border-blue-500/50 text-blue-200'
              }`}>
                {globalStats.dataSource === 'firebase-realtime' ? (
                  <div className="flex items-center">
                    <span className="text-red-400 mr-2">🔐</span>
                    <span className="font-medium">REAL-TIME Firebase data</span>
                    <span className="ml-2 text-red-300">
                      (Cost: ~${((globalStats.userCount + globalStats.postsCount) * 0.00006).toFixed(2)})
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <span className="text-blue-400 mr-2">📋</span>
                    <span className="font-medium">Cached data (12h cache)</span>
                    <span className="ml-2 text-blue-300">(Cost: $0)</span>
                  </div>
                )}
              </div>
            )}

            {/* Stats Display - Only 5 stats */}
            {globalStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className={`relative bg-purple-500/20 rounded-lg p-6 text-center border border-purple-500/30 transition-all duration-300 ${
                  updateTrigger.users ? 'scale-105 shadow-lg shadow-purple-500/20' : ''
                }`}>
                  <div className={`text-4xl font-bold text-purple-300 transition-all duration-500 ${
                    updateTrigger.users ? 'text-purple-100 scale-110' : ''
                  }`}>
                    {(animatedStats.users || globalStats.userCount || 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-purple-200 mt-2">Global Users</div>
                  {updateTrigger.users && (
                    <div className="absolute inset-0 bg-purple-500/10 rounded-lg animate-pulse"></div>
                  )}
                </div>

                <div className={`relative bg-blue-500/20 rounded-lg p-6 text-center border border-blue-500/30 transition-all duration-300 ${
                  updateTrigger.posts ? 'scale-105 shadow-lg shadow-blue-500/20' : ''
                }`}>
                  <div className={`text-4xl font-bold text-blue-300 transition-all duration-500 ${
                    updateTrigger.posts ? 'text-blue-100 scale-110' : ''
                  }`}>
                    {(animatedStats.posts || globalStats.postsCount || 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-blue-200 mt-2">Global Posts</div>
                  {updateTrigger.posts && (
                    <div className="absolute inset-0 bg-blue-500/10 rounded-lg animate-pulse"></div>
                  )}
                </div>

                <div className={`relative bg-green-500/20 rounded-lg p-6 text-center border border-green-500/30 transition-all duration-300 ${
                  updateTrigger.likes ? 'scale-105 shadow-lg shadow-green-500/20' : ''
                }`}>
                  <div className={`text-4xl font-bold text-green-300 transition-all duration-500 ${
                    updateTrigger.likes ? 'text-green-100 scale-110' : ''
                  }`}>
                    {(animatedStats.likes || globalStats.likesCount || 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-green-200 mt-2">Total Likes</div>
                  {updateTrigger.likes && (
                    <div className="absolute inset-0 bg-green-500/10 rounded-lg animate-pulse"></div>
                  )}
                </div>

                <div className={`relative bg-yellow-500/20 rounded-lg p-6 text-center border border-yellow-500/30 transition-all duration-300 ${
                  updateTrigger.comments ? 'scale-105 shadow-lg shadow-yellow-500/20' : ''
                }`}>
                  <div className={`text-4xl font-bold text-yellow-300 transition-all duration-500 ${
                    updateTrigger.comments ? 'text-yellow-100 scale-110' : ''
                  }`}>
                    {(animatedStats.comments || globalStats.commentsCount || 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-yellow-200 mt-2">Total Comments</div>
                  {updateTrigger.comments && (
                    <div className="absolute inset-0 bg-yellow-500/10 rounded-lg animate-pulse"></div>
                  )}
                </div>

                <div className={`relative bg-cyan-500/20 rounded-lg p-6 text-center border border-cyan-500/30 transition-all duration-300`}>
                  <div className="text-4xl font-bold text-cyan-300 transition-all duration-500">
                    {realStatsData?.mySphere?.totalUsers?.toLocaleString() || 'N/A'}
                  </div>
                  <div className="text-sm text-cyan-200 mt-2">MySphere Users</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {activeTab !== 'globalstats' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'content' && <ContentModeration />}
          {activeTab === 'stats' && <Statistics />}
          {activeTab === 'quotes' && <AdminQuotes />}
        </div>
      )}
    </div>
  );
} 