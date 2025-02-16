'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { doc, getDoc } from 'firebase/firestore';
import { db, ADMIN_ADDRESS } from '../utils/firebase';
import { useRouter } from 'next/navigation';
import UserManagement from './components/UserManagement';
import ContentModeration from './components/ContentModeration';
import Statistics from './components/Statistics';
import { refreshAllPosts } from '../utils/firebase';

// Usuwam stałą ADMIN_ADDRESS, bo importujemy ją z firebase.ts
const ADMIN_BASENAME = "story91.base.eth";

export default function AdminPanel() {
  const { address } = useAccount();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'content' | 'stats'>('users');
  const [refreshStatus, setRefreshStatus] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!address) {
        console.log('Brak zalogowanego adresu');
        setLoading(false);
        return;
      }

      console.log('Sprawdzanie statusu admina dla:', address);
      console.log('Admin address:', ADMIN_ADDRESS);

      // Sprawdzenie czy użytkownik jest adminem
      const userIsAdmin = address.toLowerCase() === ADMIN_ADDRESS;
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
  }, [address]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!address || !isAdmin) {
    router.push('/');
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text">
        Panel Administratora
      </h1>

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
      </div>

      {/* Sekcja odświeżania postów */}
      <div className="mb-6 p-4 bg-black/50 rounded-xl border border-[#0052FF]/20">
        <h2 className="text-xl font-semibold mb-2">Odświeżanie Postów</h2>
        <div className="mb-4">
          <p className="text-gray-400">
            Odśwież wszystkie posty i przelicz statystyki użytkowników
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              setIsRefreshing(true);
              const result = await refreshAllPosts();
              setRefreshStatus(result);
            } catch (error) {
              console.error('Błąd podczas odświeżania:', error);
              setRefreshStatus({ success: false, error });
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
          {isRefreshing ? 'Odświeżanie w toku...' : 'Odśwież wszystkie posty'}
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
        <h2 className="text-xl font-semibold mb-2">Przeliczanie Lajków</h2>
        <div className="mb-4">
          <p className="text-gray-400">
            Przelicz lajki wszystkich użytkowników na podstawie postów
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              setIsRefreshing(true);
              const result = await refreshAllPosts();
              setRefreshStatus({
                ...result,
                success: true,
                message: 'Zaktualizowano lajki użytkowników'
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
          {isRefreshing ? 'Przeliczanie w toku...' : 'Przelicz lajki użytkowników'}
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

      {/* Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'content' && <ContentModeration />}
        {activeTab === 'stats' && <Statistics />}
      </div>
    </div>
  );
} 