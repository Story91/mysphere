'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { UserProfile } from '../../types';

interface ExtendedUserProfile extends UserProfile {
  isBanned?: boolean;
  banReason?: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<ExtendedUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<ExtendedUserProfile | null>(null);
  const [banReason, setBanReason] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

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

      const usersData = usersSnapshot.docs.map(doc => ({
        ...doc.data() as UserProfile,
        id: doc.id,
        isBanned: bannedAddresses.has(doc.id.toLowerCase()),
      }));

      setUsers(usersData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching users:', error);
      setLoading(false);
    }
  };

  const handleBanUser = async (user: ExtendedUserProfile) => {
    if (!user.id || !banReason) return;

    try {
      const bannedUserRef = doc(db, 'bannedUsers', user.id.toLowerCase());
      await setDoc(bannedUserRef, {
        address: user.id,
        reason: banReason,
        bannedAt: new Date().toISOString(),
      });

      // Aktualizuj lokalny stan
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

      // Aktualizuj lokalny stan
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
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Użytkownik
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
            {users.map((user) => (
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

      {/* Modal do banowania */}
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