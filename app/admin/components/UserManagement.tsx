'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, setDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { UserProfile } from '../../types';

interface ExtendedUserProfile extends UserProfile {
  isBanned?: boolean;
  banReason?: string;
  joinedAt?: number;
}

export default function UserManagement() {
  const [users, setUsers] = useState<ExtendedUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<ExtendedUserProfile | null>(null);
  const [banReason, setBanReason] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (users.length > 0) {
      const sortedUsers = [...users].sort((a, b) => {
        const aTime = a.joinedAt || 0;
        const bTime = b.joinedAt || 0;
        return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
      });
      setUsers(sortedUsers);
    }
  }, [sortOrder]);

  const fetchUsers = async () => {
    try {
      const usersRef = collection(db, 'users');
      const bannedUsersRef = collection(db, 'bannedUsers');
      
      const [usersSnapshot, bannedSnapshot] = await Promise.all([
        getDocs(usersRef),
        getDocs(bannedUsersRef)
      ]);

      const bannedAddresses = new Set(
        bannedSnapshot.docs.map(doc => doc.id.toLowerCase())
      );

      const usersData = usersSnapshot.docs.map(doc => {
        const userData = doc.data();
        let joinedAt = 0;
        if (userData.joinedAt) {
          if (userData.joinedAt.toDate) {
            joinedAt = userData.joinedAt.toDate().getTime();
          } else if (typeof userData.joinedAt === 'number') {
            joinedAt = userData.joinedAt;
          }
        }
        
        return {
          ...userData as UserProfile,
          id: doc.id,
          isBanned: bannedAddresses.has(doc.id.toLowerCase()),
          joinedAt: joinedAt
        };
      });

      const sortedUsers = usersData.sort((a, b) => {
        const aTime = a.joinedAt || 0;
        const bTime = b.joinedAt || 0;
        return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
      });

      setUsers(sortedUsers);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching users:', error);
      setLoading(false);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Nieznana data';
    return new Date(timestamp).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (user.name && user.name.toLowerCase().includes(searchLower)) ||
      (user.id && user.id.toLowerCase().includes(searchLower))
    );
  });

  const handleBanUser = async (user: ExtendedUserProfile) => {
    if (!user.id || !banReason) return;

    try {
      const bannedUserRef = doc(db, 'bannedUsers', user.id.toLowerCase());
      await setDoc(bannedUserRef, {
        address: user.id,
        reason: banReason,
        bannedAt: new Date().toISOString(),
      });

      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === user.id ? { ...u, isBanned: true, banReason } : u
        )
      );

      setBanReason('');
      setSelectedUser(null);
    } catch (error) {
      console.error('Error banning user:', error);
    }
  };

  const handleUnbanUser = async (user: ExtendedUserProfile) => {
    if (!user.id) return;

    try {
      const bannedUserRef = doc(db, 'bannedUsers', user.id.toLowerCase());
      await deleteDoc(bannedUserRef);

      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === user.id ? { ...u, isBanned: false, banReason: undefined } : u
        )
      );
    } catch (error) {
      console.error('Error unbanning user:', error);
    }
  };

  if (loading) {
    return <div>Ładowanie...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0 mb-4">
        <div className="flex space-x-2">
          <button
            onClick={() => setSortOrder('newest')}
            className={`px-3 py-1 text-sm rounded ${
              sortOrder === 'newest'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600'
            }`}
          >
            Najnowsi
          </button>
          <button
            onClick={() => setSortOrder('oldest')}
            className={`px-3 py-1 text-sm rounded ${
              sortOrder === 'oldest'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600'
            }`}
          >
            Najstarsi
          </button>
        </div>
        <div className="w-full md:w-auto">
          <input
            type="text"
            placeholder="Szukaj użytkownika..."
            className="px-4 py-2 border rounded-lg w-full md:w-64 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Użytkownik
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Data dołączenia
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Akcje
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {user.name || user.id?.slice(0, 6) + '...' + user.id?.slice(-4)}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {user.id}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(user.joinedAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    user.isBanned
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  }`}>
                    {user.isBanned ? 'Zbanowany' : 'Aktywny'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {user.isBanned ? (
                    <button
                      onClick={() => handleUnbanUser(user)}
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      Odbanuj
                    </button>
                  ) : (
                    <button
                      onClick={() => setSelectedUser(user)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Banuj
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">
              Banowanie użytkownika: {selectedUser.name || selectedUser.id}
            </h3>
            <textarea
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              placeholder="Powód bana..."
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setBanReason('');
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400"
              >
                Anuluj
              </button>
              <button
                onClick={() => handleBanUser(selectedUser)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                disabled={!banReason}
              >
                Banuj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 