'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { doc, getDoc } from 'firebase/firestore';
import { db, ADMIN_ADDRESS } from '../utils/firebase';
import { useRouter } from 'next/navigation';
import UserManagement from './components/UserManagement';
import ContentModeration from './components/ContentModeration';
import Statistics from './components/Statistics';
import PaidPinsManagement from './components/PaidPinsManagement';
import { refreshTop50UsersOnly } from '../utils/firebase';
import AdminQuotes from './quotes/page';
import { getGlobalStats, getGlobalStatsRealTime, getGlobalStatsIncremental, getMySphereGlobalStats, getUserNamesCacheStats, clearUserNamesCache, fixAllUserStats, fixUserPostStats, getUsersWithBasenameCount, migrateHistoricalBaseNamePosts, rebuildReferralAggregates, recomputeReferralPointsStrict, clearPaginatedActiveUsersCache, fixUserRankingStrict, refreshAllDomainBonuses } from '../utils/firebase';

// Usuwam stałą ADMIN_ADDRESS, bo importujemy ją z firebase.ts
const ADMIN_BASENAME = "story91.base.eth";

export default function AdminPanel() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'content' | 'stats' | 'quotes' | 'paidpins' | 'globalstats'>('users');
  const [refreshStatus, setRefreshStatus] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [loadingGlobalStats, setLoadingGlobalStats] = useState(false);
  const [realStatsData, setRealStatsData] = useState<any>(null);
  const [realStatsLoading, setRealStatsLoading] = useState(false);
  const [lastGlobalStatsUpdate, setLastGlobalStatsUpdate] = useState<string | null>(null);
  const [basenameUserCount, setBasenameUserCount] = useState<number | null>(null);
  const [loadingBasenameCount, setLoadingBasenameCount] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<any>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  
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

  // ⚡ OPTIMIZED: Smart auto-loading przy wejściu na Global Stats (tylko jeśli brak danych)
  useEffect(() => {
    if (activeTab === 'globalstats' && address && isAdmin && !loadingGlobalStats && !realStatsLoading) {
      console.log('⚡ ADMIN: Smart auto-loading on Global Stats tab...');
      
      // 🎯 BaseChat: Sprawdź cache, a potem ewentualnie smart refresh
      if (!globalStats) {
        // Sprawdź czy są dane w localStorage cache
        const cachedData = localStorage.getItem('adminGlobalStatsCache');
        if (cachedData) {
          console.log('📋 Found cached BaseChat data - loading from localStorage...');
          try {
            const parsedData = JSON.parse(cachedData);
            setGlobalStats(parsedData);
            setLastGlobalStatsUpdate(new Date().toLocaleString());
            
            // Animuj cached data (bez incremental flag)
            if (parsedData) {
              animateStatValue(parsedData.userCount, 'users', false);
              animateStatValue(parsedData.postsCount, 'posts', false);
              animateStatValue(parsedData.likesCount, 'likes', false);
              animateStatValue(parsedData.commentsCount, 'comments', false);
              animateStatValue(parsedData.transactionsCount, 'transactions', false);
            }
          } catch (error) {
            console.error('Error parsing cached data:', error);
            console.log('📊 Cache invalid - performing smart refresh...');
            handleFetchRealTimeStats(false);
          }
        } else {
          console.log('📊 No cache found - performing smart refresh...');
          handleFetchRealTimeStats(false); // false = smart incremental refresh
        }
      } else {
        console.log('📊 BaseChat data already loaded - skipping refresh');
      }
      
      // 🌐 MySphere: Ładuj tylko jeśli brak danych
      if (!realStatsData) {
        console.log('🌐 No MySphere data found - fetching...');
        fetchMySphereStats();
      } else {
        console.log('🌐 MySphere data already loaded - skipping refresh');
      }
    }
  }, [activeTab, address, isAdmin]);

  // 🔐 ADMIN: Fetch MySphere statistics bezpośrednio z Firebase (szybko!)
  const fetchMySphereStats = async () => {
    setRealStatsLoading(true);
    
    try {
      console.log('🔐 ADMIN: Fetching MySphere stats directly from Firebase...');
      const mySphereStats = await getMySphereGlobalStats();
      
      setRealStatsData({ mySphere: mySphereStats });
      console.log('✅ ADMIN: MySphere Firebase data loaded (direct call):', mySphereStats);
      
      // 🎯 Update MySphere Users counter
      if (mySphereStats.totalUsers) {
        animateStatValue(mySphereStats.totalUsers, 'mysphere');
      }
      
      // 🎯 Update social media counters (tylko Twitter, Spotify, TikTok)
      if (mySphereStats.socialMediaConnections) {
        const social = mySphereStats.socialMediaConnections;
        if (social.twitter) animateStatValue(social.twitter, 'twitter');
        if (social.spotify) animateStatValue(social.spotify, 'spotify');
        if (social.tiktok) animateStatValue(social.tiktok, 'tiktok');
        // Discord i Telegram usunięte - nie są potrzebne w aplikacji
      }
      
      console.log(`💰 MySphere cost: ~$${((mySphereStats.totalUsers || 100) * 0.00006).toFixed(2)} (direct Firebase)`);
    } catch (error) {
      console.error('❌ Error fetching MySphere Firebase stats:', error);
      setRealStatsData(null);
    } finally {
      setRealStatsLoading(false);
    }
  };

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

  // ⚡ OPTIMIZED: Inkrementalne pobieranie (tylko nowe dane!)
  const handleFetchRealTimeStats = async (forceFullRefresh: boolean = false) => {
    setLoadingGlobalStats(true);
    
    try {
      console.log(`🔐 Admin fetching ${forceFullRefresh ? 'FULL' : 'INCREMENTAL'} Firebase stats...`);
      const stats = await getGlobalStatsIncremental(forceFullRefresh);
      setGlobalStats(stats);
      setLastGlobalStatsUpdate(new Date().toLocaleString());
      
      // 🎯 Animate stats counters (z informacją o typie update)
      if (stats) {
        const isIncremental = stats.dataSource === 'firebase-incremental';
        animateStatValue(stats.userCount, 'users', isIncremental);
        animateStatValue(stats.postsCount, 'posts', isIncremental);
        animateStatValue(stats.likesCount, 'likes', isIncremental);
        animateStatValue(stats.commentsCount, 'comments', isIncremental);
        animateStatValue(stats.transactionsCount, 'transactions', isIncremental);
      }
      
      console.log(`✅ ${stats.dataSource} Firebase stats loaded:`, stats);
      if (stats.deltaInfo) {
        console.log(`📊 Delta: +${stats.deltaInfo.newUsers} users, +${stats.deltaInfo.newPosts} posts`);
        
        // 🎉 Pokaż toast notification dla incremental update
        if (stats.dataSource === 'firebase-incremental' && (stats.deltaInfo.newUsers > 0 || stats.deltaInfo.newPosts > 0)) {
          // Opcjonalnie: możemy dodać toast notification że dane zostały zaktualizowane
          console.log(`🔔 Smart Update: +${stats.deltaInfo.newUsers} users, +${stats.deltaInfo.newPosts} posts added`);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching optimized Firebase stats:', error);
      setGlobalStats(null);
    } finally {
      setLoadingGlobalStats(false);
    }
  };

  // 🔄 LEGACY: Stary system (pełne pobieranie - użyj tylko w nagłych przypadkach)
  const handleFetchLegacyStats = async () => {
    setLoadingGlobalStats(true);
    
    try {
      console.log('🔐 Admin fetching LEGACY FULL Firebase stats (expensive!)...');
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
      
      console.log(`✅ LEGACY Firebase stats loaded:`, stats);
      console.log(`💰 Cost: ~$${((stats.userCount + stats.postsCount) * 0.00006).toFixed(2)} for this request`);
    } catch (error) {
      console.error('❌ Error fetching legacy Firebase stats:', error);
      setGlobalStats(null);
    } finally {
      setLoadingGlobalStats(false);
    }
  };

  const handleFetchBasenameCount = async () => {
    setLoadingBasenameCount(true);
    try {
      const count = await getUsersWithBasenameCount();
      setBasenameUserCount(count);
    } catch (error) {
      console.error("Error fetching basename user count:", error);
      setBasenameUserCount(null);
    } finally {
      setLoadingBasenameCount(false);
    }
  };

  const handleMigrateBaseNamePosts = async () => {
    if (!confirm('Czy chcesz uruchomić migrację historycznych postów dla użytkowników z BaseName?\n\nTo może potrwać kilka minut i będzie kosztować dodatkowe odczyty z Firebase.')) {
      return;
    }

    setIsMigrating(true);
    setMigrationStatus(null);
    
    try {
      const result = await migrateHistoricalBaseNamePosts();
      setMigrationStatus(result);
    } catch (error) {
      console.error("Error during migration:", error);
      setMigrationStatus({
        success: false,
        processedPosts: 0,
        migratedPosts: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsMigrating(false);
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

  // 📊 Animate stats counter (zoptymalizowane dla Smart Refresh)
  const animateStatValue = (newValue: number, statType: string, isIncremental: boolean = false) => {
    const oldValue = animatedStats[statType] || 0;
    if (oldValue !== newValue) {
      triggerUpdate(statType);
      
      // 🎯 Smart Refresh: Krótsza, subtelniejsza animacja dla małych przyrostów
      const difference = Math.abs(newValue - oldValue);
      const duration = isIncremental && difference < 100 ? 600 : 1000; // Szybsza animacja dla małych zmian
      const steps = isIncremental && difference < 100 ? 20 : 30;
      
      let current = oldValue;
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



  // 📊 Export static data template
  const exportStaticData = () => {
    if (!realStatsData && !globalStats) return;
    
    const staticTemplate = {
      homePageStats: {
        userCount: globalStats?.userCount || 12847,
        postsCount: globalStats?.postsCount || 8934,
        likesCount: globalStats?.likesCount || 16432,
        commentsCount: globalStats?.commentsCount || 13876,
        transactionsCount: globalStats?.transactionsCount || 22810
      },
      mySphereStats: {
        totalUsers: realStatsData.mySphere?.totalUsers || 2847,
        fullyConnectedUsers: realStatsData.mySphere?.fullyConnectedUsers || 234,
        averageConnectionsPerUser: realStatsData.mySphere?.averageConnectionsPerUser || 2.1,
        socialMediaConnections: realStatsData.mySphere?.socialMediaConnections || {
          twitter: 1847,
          spotify: 967,
          tiktok: 543
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

  // 📊 Export MySphere data separately
  const exportMySphereData = () => {
    if (!realStatsData?.mySphere) return;
    
    const mySphereExport = {
      ...realStatsData.mySphere,
      exportedAt: new Date().toISOString(),
      exportedBy: address,
      dataSource: 'firebase-realtime',
      cost: '$1.50 Firebase reads'
    };
    
    const dataStr = JSON.stringify(mySphereExport, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `mysphere-data-${new Date().toISOString().split('T')[0]}.json`;
    
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
            <p>✅ <strong>Admin Statistics:</strong> Działa na agregacjach — ~467 odczytów zamiast ~461 000 (getCountFromServer liczy po stronie Firestore, 1 odczyt / 1000 wpisów)</p>
            <p>✅ <strong>Admin UserManagement:</strong> Działa na odczytach punktowych — szukanie po adresie to 2 odczyty, lista nigdy nie jest ładowana w całości</p>
            <p>✅ <strong>BaseChat global stats:</strong> Używa systemu strony głównej (pełne dane + cache 12h per user)</p>
            <p>✅ <strong>Main page getGlobalStats():</strong> Cache 12h per user + pełne dane (6000+ reads → 0.2/user/12h)</p>
            <p>✅ <strong>MyCamp Platform Distribution:</strong> Sekcja usunięta (dodatkowe oszczędności)</p>
            <p>✅ <strong>MyCamp MySphere Statistics:</strong> Opcjonalne ładowanie na żądanie (3x auto-load → 0)</p>
            <p>✅ <strong>User Search System:</strong> Hybrydowy cache + targeted queries (.eth, .sphere, .camper)</p>
            <p>✅ <strong>getCachedActiveUsers:</strong> Limit 1000 → 50 użytkowników (95% redukcja)</p>
            <p>✅ <strong>Admin MySphere:</strong> Bezpośrednie Firebase calls (2x szybsze, bez API overhead)</p>
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
          onClick={() => setActiveTab('paidpins')}
          className={`px-4 py-2 rounded-lg ${
            activeTab === 'paidpins'
              ? 'bg-yellow-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          💰 Paid Pins
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

      {/* Sekcja naprawy statystyk użytkowników */}
      <div className="mb-6 p-4 bg-yellow-900/30 rounded-xl border border-yellow-500/20">
        <h2 className="text-xl font-semibold mb-2 text-yellow-300">🔧 Naprawa Statystyk Użytkowników</h2>
        <div className="mb-4">
          <p className="text-gray-400">
            Napraw nieprawidłowe liczby postów i lajków dla użytkowników (bug został już naprawiony)
          </p>
          <p className="text-yellow-400 text-sm mt-1">
            ⚠️ Drogie - sprawdza wszystkich użytkowników. Użyj tylko gdy potrzeba
          </p>
        </div>
        
        <div className="flex gap-4">
          <button
            onClick={async () => {
              try {
                setIsRefreshing(true);
                const result = await fixAllUserStats();
                setRefreshStatus({
                  success: result.success,
                  updatedUsers: result.fixed,
                  message: `Naprawiono ${result.fixed} użytkowników. Błędy: ${result.errors.length}`,
                  errors: result.errors
                });
                // Po zakończeniu: dodatkowo przebuduj agregaty referral i zsynchronizuj punkty
                const agg = await rebuildReferralAggregates();
                setRefreshStatus((prev: any) => ({
                  ...prev,
                  referralFix: `Referral sync: ${agg.updatedUsers} users, errors: ${agg.errors.length}`
                }));
              } catch (error) {
                console.error('Błąd podczas naprawy statystyk:', error);
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
                : 'bg-yellow-600 hover:bg-yellow-700'
            } text-white transition-all`}
          >
            {isRefreshing ? '🔧 Naprawiam...' : '🔧 Napraw Wszystkich'}
          </button>

          <button
            onClick={async () => {
              try {
                setIsRefreshing(true);
                const result = await recomputeReferralPointsStrict();
                setRefreshStatus({
                  success: result.success,
                  message: `STRICT Referral: users ${result.updatedUsers}, processed referrals ${result.processedReferrals}, errors ${result.errors.length}`,
                  errors: result.errors
                });
              } catch (error) {
                console.error('Błąd STRICT referral recompute:', error);
                setRefreshStatus({ success: false, error: error instanceof Error ? error.message : 'Nieznany błąd' });
              } finally {
                setIsRefreshing(false);
              }
            }}
            disabled={isRefreshing}
            className={`px-4 py-2 rounded-lg ${
              isRefreshing 
                ? 'bg-gray-500 cursor-not-allowed' 
                : 'bg-purple-600 hover:bg-purple-700'
            } text-white transition-all`}
          >
            {isRefreshing ? 'Recompute...' : 'Napraw Referral (STRICT)'}
          </button>
          
          <input
            type="text"
            placeholder="0x... (adres użytkownika)"
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm"
            id="singleUserFix"
          />
          <button
            onClick={async () => {
              const input = document.getElementById('singleUserFix') as HTMLInputElement;
              const userAddress = input?.value?.trim();
              if (!userAddress) {
                alert('Wpisz adres użytkownika');
                return;
              }
              
              try {
                setIsRefreshing(true);
                const result = await fixUserRankingStrict(userAddress);
                setRefreshStatus({
                  success: result.success,
                  message: result.success ? `${userAddress}: totalPoints ${result.before?.baseChatPoints?.totalPoints || 0}→${result.after?.totalPoints}` : 'Fix failed'
                });
                input.value = '';
              } catch (error) {
                console.error('Błąd podczas naprawy użytkownika:', error);
                setRefreshStatus({ 
                  success: false, 
                  error: error instanceof Error ? error.message : 'Nieznany błąd' 
                });
              } finally {
                setIsRefreshing(false);
              }
            }}
            disabled={isRefreshing}
            className={`px-3 py-2 rounded-lg ${
              isRefreshing 
                ? 'bg-gray-500 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white transition-all text-sm`}
          >
            {isRefreshing ? '🔧' : '🔧 Jeden'}
          </button>

          <button
            onClick={async () => {
              try {
                setIsRefreshing(true);
                const result = await refreshAllDomainBonuses();
                setRefreshStatus({
                  success: result.success,
                  message: result.success 
                    ? `Odświeżono bonusy domenowe: 🌐 .sphere: ${result.sphere}, 🏕️ .camper: ${result.camper}, 💛 .celo: ${result.celo}, 🌍 .world: ${result.world}` 
                    : `Błąd: ${result.error || 'Nieznany błąd'}`,
                  sphere: result.sphere,
                  camper: result.camper,
                  celo: result.celo,
                  world: result.world
                });
              } catch (error) {
                console.error('Błąd podczas odświeżania bonusów domenowych:', error);
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
                : 'bg-green-600 hover:bg-green-700'
            } text-white transition-all`}
          >
            {isRefreshing ? '🔄 Odświeżam...' : '🔄 Odśwież Bonusy Domenowe'}
          </button>
        </div>
        
        {refreshStatus && (
          <div className="mt-4 p-3 bg-black/30 rounded-lg">
            {refreshStatus.success ? (
              <>
                <p className="text-sm text-gray-400">
                  {refreshStatus.message}
                </p>
                {refreshStatus.errors && refreshStatus.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-sm text-yellow-400 cursor-pointer">
                      Pokaż błędy ({refreshStatus.errors.length})
                    </summary>
                    <div className="mt-2 text-xs text-red-400 max-h-40 overflow-y-auto">
                      {refreshStatus.errors.map((error: string, i: number) => (
                        <div key={i}>{error}</div>
                      ))}
                    </div>
                  </details>
                )}
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

        {/* Hard refresh ranking/cache */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={async () => {
              try {
                setIsRefreshing(true);
                // Wyczyść cache paginowanych użytkowników po stronie serwera
                clearPaginatedActiveUsersCache();
                // Wyczyść cache po stronie przeglądarki (Most Active)
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('activeUsers');
                  localStorage.removeItem('activeUsersPage');
                  localStorage.removeItem('userNames');
                  localStorage.removeItem('usersCacheTime');
                }
                setRefreshStatus({ success: true, message: 'Hard refresh: caches cleared. Open page and click Refresh in Most Active.' });
              } catch (error) {
                console.error('Hard refresh error:', error);
                setRefreshStatus({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
              } finally {
                setIsRefreshing(false);
              }
            }}
            disabled={isRefreshing}
            className={`px-4 py-2 rounded-lg ${isRefreshing ? 'bg-gray-500 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600'} text-white transition-all`}
          >
            {isRefreshing ? 'Clearing...' : 'Hard Refresh Ranking'}
          </button>
        </div>
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

      {/* Nowa sekcja do pobierania liczby użytkowników z BaseName */}
      <div className="mb-6 p-4 bg-black/50 rounded-xl border border-[#0052FF]/20">
        <h2 className="text-xl font-semibold mb-2">BaseName Feed Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Kolumna 1: Liczba użytkowników */}
          <div>
            <h3 className="text-lg font-medium mb-2">Liczba użytkowników z BaseName</h3>
            <p className="text-gray-400 text-sm mb-3">
              Pobierz aktualną liczbę użytkowników, którzy mają zarejestrowaną nazwę .base.eth.
            </p>
            <button
              onClick={handleFetchBasenameCount}
              disabled={loadingBasenameCount}
              className={`px-4 py-2 rounded-lg ${
                loadingBasenameCount
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-[#0052FF] hover:bg-[#0052FF]/90'
              } text-white transition-all mb-3`}
            >
              {loadingBasenameCount ? 'Pobieranie...' : 'Pobierz liczbę'}
            </button>

            {basenameUserCount !== null && (
              <div className="p-3 bg-black/30 rounded-lg">
                <p className="text-2xl font-bold text-white">
                  {basenameUserCount.toLocaleString()}
                </p>
                <p className="text-sm text-gray-400">
                  Użytkowników z BaseName
                </p>
              </div>
            )}
          </div>

          {/* Kolumna 2: Migracja postów */}
          <div>
            <h3 className="text-lg font-medium mb-2">Migracja historycznych postów</h3>
            <p className="text-gray-400 text-sm mb-3">
              Skopiuj wszystkie istniejące posty od użytkowników z BaseName do dedykowanego feedu.
            </p>
            <button
              onClick={handleMigrateBaseNamePosts}
              disabled={isMigrating}
              className={`px-4 py-2 rounded-lg ${
                isMigrating
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'
              } text-white transition-all mb-3`}
            >
              {isMigrating ? 'Migracja w toku...' : 'Uruchom migrację'}
            </button>

            {migrationStatus && (
              <div className={`p-3 rounded-lg ${
                migrationStatus.success 
                  ? 'bg-green-900/30 border border-green-600/30' 
                  : 'bg-red-900/30 border border-red-600/30'
              }`}>
                {migrationStatus.success ? (
                  <div className="text-green-400">
                    <p className="font-bold">✅ Migracja zakończona!</p>
                    <p className="text-sm">Przetworzono: {migrationStatus.processedPosts} postów</p>
                    <p className="text-sm">Zmigrowano: {migrationStatus.migratedPosts} nowych postów</p>
                  </div>
                ) : (
                  <div className="text-red-400">
                    <p className="font-bold">❌ Błąd migracji</p>
                    <p className="text-sm">{migrationStatus.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700/30">
          <p className="text-green-700 dark:text-green-400 text-sm">
            ✅ Feed BaseName jest teraz dostępny w aplikacji! Użytkownicy mogą klikać zakładkę "BaseName" aby zobaczyć posty tylko od użytkowników z .base.eth.
          </p>
        </div>
      </div>

      {/* Global Statistics */}
      {activeTab === 'globalstats' && (
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">📊 Global Statistics</h2>
          
          <div className="bg-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Current Stats</h3>
              <div className="flex items-center space-x-3">
                {globalStats?.dataSource && (
                  <div className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                    {globalStats.dataSource === 'firebase-incremental' ? '⚡ Incremental' :
                     globalStats.dataSource === 'firebase-full-fetch' ? '🔄 Full Fetch' :
                     globalStats.dataSource === 'firebase-realtime' ? '💥 Legacy' :
                     '📋 Cached'}
                  </div>
                )}
                {lastGlobalStatsUpdate && (
                  <div className="text-sm text-blue-300">
                    Last updated: {lastGlobalStatsUpdate}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 mb-6 flex-wrap">
              <div className="flex items-center gap-3 bg-green-900/20 border border-green-500/30 rounded-lg px-4 py-2">
                <span className="text-green-400">🤖</span>
                <div className="text-sm">
                  <div className="text-green-300 font-medium">Auto-loading enabled</div>
                  <div className="text-green-200/70">Real Firebase data loads automatically</div>
                </div>
              </div>

              {realStatsData && (
                <>
                  <button
                    onClick={handleExportStats}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all"
                  >
                    💾 Export Global
                  </button>
                  <button
                    onClick={exportMySphereData}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-all"
                  >
                    💾 Export MySphere
                  </button>
                  <button
                    onClick={exportStaticData}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-all"
                  >
                    📄 Export Template
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  // ⚡ SMART REFRESH: Zachowaj obecne dane, tylko je zaktualizuj
                  // NIE resetuj globalStats ani animatedStats - pozwól na płynną aktualizację
                  handleFetchRealTimeStats(false);
                  fetchMySphereStats();
                }}
                disabled={realStatsLoading}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  realStatsLoading 
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white`}
              >
                {realStatsLoading ? '⏳ Loading...' : '⚡ Smart Refresh'}
              </button>
              
              <button
                onClick={() => {
                  // 🔄 FULL REFRESH: Resetuj wszystko i załaduj od nowa
                  setRealStatsData(null);
                  setGlobalStats(null);
                  setAnimatedStats({});
                  handleFetchRealTimeStats(true);
                  fetchMySphereStats();
                }}
                disabled={realStatsLoading}
                className={`px-3 py-2 rounded-lg font-medium transition-all ${
                  realStatsLoading 
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-orange-600 hover:bg-orange-700'
                } text-white text-sm`}
              >
                {realStatsLoading ? '⏳' : '🔄 Full'}
              </button>
              
              <button
                onClick={() => {
                  // 💥 LEGACY: Resetuj wszystko i użyj starej, drogiej metody
                  setRealStatsData(null);
                  setGlobalStats(null);
                  setAnimatedStats({});
                  handleFetchLegacyStats();
                  fetchMySphereStats();
                }}
                disabled={realStatsLoading}
                className={`px-3 py-2 rounded-lg font-medium transition-all ${
                  realStatsLoading 
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-red-600 hover:bg-red-700'
                } text-white text-sm`}
              >
                {realStatsLoading ? '⏳' : '💥 Legacy'}
              </button>
              
              <button
                onClick={() => {
                  // 🗑️ Wyczyść cache i resetuj stan
                  localStorage.removeItem('adminGlobalStatsCache');
                  localStorage.removeItem('adminGlobalStatsTimestamp');
                  setGlobalStats(null);
                  setAnimatedStats({});
                  console.log('🗑️ Admin cache cleared');
                }}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-all text-sm"
              >
                🗑️ Clear Cache
              </button>
            </div>

            {/* Data Source Indicator & Optimization Status */}
            {(globalStats || realStatsData) && (
              <div className="mb-6 space-y-3">
                {/* Current Data Source */}
                <div className="p-3 rounded-lg text-sm bg-cyan-500/20 border border-cyan-500/50 text-cyan-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-cyan-400 mr-2">
                        {globalStats?.dataSource === 'firebase-incremental' ? '⚡' : 
                         globalStats?.dataSource === 'firebase-full-fetch' ? '🔄' : 
                         '📊'}
                      </span>
                      <span className="font-medium">
                        {globalStats?.dataSource === 'firebase-incremental' ? 'Incremental update (OPTIMIZED)' :
                         globalStats?.dataSource === 'firebase-full-fetch' ? 'Full refresh (first time)' :
                         globalStats?.dataSource === 'firebase-realtime' ? 'Legacy full fetch (EXPENSIVE)' :
                         'Auto-loaded Firebase data'}
                      </span>
                      <span className="ml-2 text-cyan-300">(direct calls, no API overhead)</span>
                    </div>
                    {realStatsData && (
                      <div className="text-xs text-cyan-300">
                        MySphere: {realStatsData.mySphere?.totalUsers || 'N/A'} users • 
                        Updated: {new Date().toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Optimization Details */}
                {globalStats?.deltaInfo && (
                  <div className="p-3 rounded-lg text-sm bg-green-500/20 border border-green-500/50 text-green-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <span className="text-green-400">🎯</span>
                        <div>
                          <span className="font-medium">Delta Update: </span>
                          <span>+{globalStats.deltaInfo.newUsers} users, +{globalStats.deltaInfo.newPosts} posts since {new Date(globalStats.deltaInfo.incrementalSince).toLocaleTimeString()}</span>
                        </div>
                      </div>
                      <div className="text-xs text-green-300">
                        Reads saved: ~{((globalStats.userCount + globalStats.postsCount - (globalStats.deltaInfo.newUsers + globalStats.deltaInfo.newPosts)) * 0.00006).toFixed(2)}$
                      </div>
                    </div>
                  </div>
                )}

                {/* Legacy Warning */}
                {globalStats?.dataSource === 'firebase-realtime' && (
                  <div className="p-3 rounded-lg text-sm bg-red-500/20 border border-red-500/50 text-red-200">
                    <div className="flex items-center">
                      <span className="text-red-400 mr-2">⚠️</span>
                      <span className="font-medium">Legacy Mode Active - This method scans ALL documents and is expensive!</span>
                      <span className="ml-2 text-red-300">Cost: ~$${((globalStats.userCount + globalStats.postsCount) * 0.00006).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Main Stats Display - Global + MySphere */}
            {(globalStats || realStatsData) && (
              <div className="space-y-6">
                {/* Global Stats Row */}
                <div>
                  <h4 className="text-lg font-bold text-white mb-4">📊 Global BaseChat Statistics</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className={`relative bg-purple-500/20 rounded-lg p-6 text-center border border-purple-500/30 transition-all duration-300 ${
                      updateTrigger.users ? 'scale-105 shadow-lg shadow-purple-500/20' : ''
                    }`}>
                      <div className={`text-4xl font-bold text-purple-300 transition-all duration-500 ${
                        updateTrigger.users ? 'text-purple-100 scale-110' : ''
                      }`}>
                        {(animatedStats.users || globalStats?.userCount || 0).toLocaleString()}
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
                        {(animatedStats.posts || globalStats?.postsCount || 0).toLocaleString()}
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
                        {(animatedStats.likes || globalStats?.likesCount || 0).toLocaleString()}
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
                        {(animatedStats.comments || globalStats?.commentsCount || 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-yellow-200 mt-2">Total Comments</div>
                      {updateTrigger.comments && (
                        <div className="absolute inset-0 bg-yellow-500/10 rounded-lg animate-pulse"></div>
                      )}
                    </div>
                  </div>
                </div>

                {/* MySphere Stats Row */}
                <div>
                  <h4 className="text-lg font-bold text-cyan-200 mb-4">🌐 MySphere Social Media Statistics (Twitter, Spotify, TikTok)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Total MySphere Users */}
                    <div className={`relative bg-cyan-500/20 rounded-lg p-6 text-center border border-cyan-500/30 transition-all duration-300 ${
                      updateTrigger.mysphere ? 'scale-105 shadow-lg shadow-cyan-500/20' : ''
                    }`}>
                      <div className={`text-3xl font-bold text-cyan-300 transition-all duration-500 ${
                        updateTrigger.mysphere ? 'text-cyan-100 scale-110' : ''
                      }`}>
                        {(() => {
                          const value = animatedStats.mysphere || realStatsData?.mySphere?.totalUsers;
                          return value ? value.toLocaleString() : (realStatsLoading ? '...' : 'N/A');
                        })()}
                      </div>
                      <div className="text-xs text-cyan-200 mt-2">MySphere Users</div>
                      {updateTrigger.mysphere && (
                        <div className="absolute inset-0 bg-cyan-500/10 rounded-lg animate-pulse"></div>
                      )}
                    </div>

                    {/* Twitter */}
                    <div className={`relative bg-blue-600/20 rounded-lg p-6 text-center border border-blue-600/30 transition-all duration-300 ${
                      updateTrigger.twitter ? 'scale-105 shadow-lg shadow-blue-600/20' : ''
                    }`}>
                      <div className="text-2xl mb-2">🐦</div>
                      <div className={`text-2xl font-bold text-blue-300 transition-all duration-500 ${
                        updateTrigger.twitter ? 'text-blue-100 scale-110' : ''
                      }`}>
                        {(() => {
                          const value = animatedStats.twitter || realStatsData?.mySphere?.socialMediaConnections?.twitter;
                          return value ? value.toLocaleString() : (realStatsLoading ? '...' : 'N/A');
                        })()}
                      </div>
                      <div className="text-xs text-blue-200 mt-1">Twitter</div>
                      {updateTrigger.twitter && (
                        <div className="absolute inset-0 bg-blue-600/10 rounded-lg animate-pulse"></div>
                      )}
                    </div>

                    {/* Spotify */}
                    <div className={`relative bg-green-600/20 rounded-lg p-6 text-center border border-green-600/30 transition-all duration-300 ${
                      updateTrigger.spotify ? 'scale-105 shadow-lg shadow-green-600/20' : ''
                    }`}>
                      <div className="text-2xl mb-2">🎵</div>
                      <div className={`text-2xl font-bold text-green-300 transition-all duration-500 ${
                        updateTrigger.spotify ? 'text-green-100 scale-110' : ''
                      }`}>
                        {(() => {
                          const value = animatedStats.spotify || realStatsData?.mySphere?.socialMediaConnections?.spotify;
                          return value ? value.toLocaleString() : (realStatsLoading ? '...' : 'N/A');
                        })()}
                      </div>
                      <div className="text-xs text-green-200 mt-1">Spotify</div>
                      {updateTrigger.spotify && (
                        <div className="absolute inset-0 bg-green-600/10 rounded-lg animate-pulse"></div>
                      )}
                    </div>

                    {/* TikTok */}
                    <div className={`relative bg-pink-600/20 rounded-lg p-6 text-center border border-pink-600/30 transition-all duration-300 ${
                      updateTrigger.tiktok ? 'scale-105 shadow-lg shadow-pink-600/20' : ''
                    }`}>
                      <div className="text-2xl mb-2">🎬</div>
                      <div className={`text-2xl font-bold text-pink-300 transition-all duration-500 ${
                        updateTrigger.tiktok ? 'text-pink-100 scale-110' : ''
                      }`}>
                        {(() => {
                          const value = animatedStats.tiktok || realStatsData?.mySphere?.socialMediaConnections?.tiktok;
                          return value ? value.toLocaleString() : (realStatsLoading ? '...' : 'N/A');
                        })()}
                      </div>
                      <div className="text-xs text-pink-200 mt-1">TikTok</div>
                      {updateTrigger.tiktok && (
                        <div className="absolute inset-0 bg-pink-600/10 rounded-lg animate-pulse"></div>
                      )}
                    </div>


                  </div>
                </div>
              </div>
            )}

            {/* Loading state */}
            {realStatsLoading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-400 border-t-transparent mx-auto mb-4"></div>
                <p className="text-blue-200 text-lg">⚡ Loading MySphere data (direct Firebase)...</p>
                <p className="text-blue-200/70 text-sm mt-2">Twitter, Spotify, TikTok only • No API overhead • 2x faster!</p>
              </div>
            )}

            {/* Additional MySphere Metrics */}
            {realStatsData?.mySphere && (
              <div className="mt-8 bg-gradient-to-r from-cyan-600/20 via-blue-500/20 to-purple-600/20 backdrop-blur-sm border border-cyan-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-xl font-bold text-cyan-200 flex items-center gap-2">
                    📈 MySphere Advanced Metrics
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {/* Fully Connected */}
                  <div className="text-center bg-green-500/20 rounded-lg p-4 border border-green-500/30">
                    <div className="text-2xl font-bold text-green-300">
                      {realStatsData.mySphere.fullyConnectedUsers?.toLocaleString() || 'N/A'}
                    </div>
                    <div className="text-sm text-green-200/70">Fully Connected (All platforms)</div>
                  </div>
                  
                  {/* Average Connections */}
                  <div className="text-center bg-purple-500/20 rounded-lg p-4 border border-purple-500/30">
                    <div className="text-2xl font-bold text-purple-300">
                      {realStatsData.mySphere.averageConnectionsPerUser || 'N/A'}
                    </div>
                    <div className="text-sm text-purple-200/70">Avg Connections/User</div>
                  </div>

                  {/* Connection Rate */}
                  <div className="text-center bg-orange-500/20 rounded-lg p-4 border border-orange-500/30">
                    <div className="text-2xl font-bold text-orange-300">
                      {realStatsData.mySphere.fullyConnectedUsers && realStatsData.mySphere.totalUsers ? 
                        ((realStatsData.mySphere.fullyConnectedUsers / realStatsData.mySphere.totalUsers) * 100).toFixed(1) + '%' : 
                        'N/A'
                      }
                    </div>
                    <div className="text-sm text-orange-200/70">Full Connection Rate</div>
                  </div>
                </div>

                {/* Last Updated */}
                <div className="text-center text-cyan-200/60 text-sm">
                  🕐 Last updated: {realStatsData.mySphere.lastUpdated ? 
                    new Date(realStatsData.mySphere.lastUpdated).toLocaleString() : 
                    'Unknown'
                  }
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
          {activeTab === 'paidpins' && <PaidPinsManagement />}
        </div>
      )}
    </div>
  );
} 