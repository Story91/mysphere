'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { useRouter } from 'next/navigation';
import UserManagement from './components/UserManagement';
import ContentModeration from './components/ContentModeration';
import Statistics from './components/Statistics';

// Stały adres administratora - do zmiany na właściwy
const ADMIN_ADDRESS = "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd";
const ADMIN_BASENAME = "story91.base.eth";

export default function AdminPanel() {
  const { address } = useAccount();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'content' | 'stats'>('users');

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!address) {
        setLoading(false);
        return;
      }

      // Sprawdzenie czy użytkownik jest adminem
      if (address.toLowerCase() === ADMIN_ADDRESS.toLowerCase()) {
        setIsAdmin(true);
      } else {
        // Opcjonalnie: sprawdzenie w bazie danych Firebase
        const userRef = doc(db, 'admins', address.toLowerCase());
        const userDoc = await getDoc(userRef);
        setIsAdmin(userDoc.exists() && userDoc.data()?.isAdmin === true);
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

      {/* Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'content' && <ContentModeration />}
        {activeTab === 'stats' && <Statistics />}
      </div>
    </div>
  );
} 