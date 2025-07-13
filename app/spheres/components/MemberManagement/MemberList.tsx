'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Filter, 
  UserCheck, 
  UserMinus, 
  Crown, 
  Shield, 
  Star,
  Calendar,
  TrendingUp,
  MessageCircle,
  MoreHorizontal,
  Ban,
  UserPlus
} from 'lucide-react';

// Interfejs dla członka społeczności
interface Member {
  id: string;
  address: string;
  username: string;
  avatar: string;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  joinedAt: Date;
  lastActive: Date;
  reputation: number;
  isOnline: boolean;
  isBanned: boolean;
  subscriptionTier: 'free' | 'basic' | 'premium';
  stats: {
    messagesCount: number;
    eventsAttended: number;
    menteeCount: number;
    contributionScore: number;
  };
}

interface MemberListProps {
  communityId: string;
  members: Member[];
  onMemberAction: (memberId: string, action: string) => void;
  currentUserRole: string;
}

const MemberList: React.FC<MemberListProps> = ({
  communityId,
  members,
  onMemberAction,
  currentUserRole
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState('joinedAt');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  // Filtrowanie i sortowanie członków
  const filteredMembers = useMemo(() => {
    let filtered = members.filter(member => {
      // Wyszukiwanie po nazwie użytkownika
      const matchesSearch = member.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           member.address.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtrowanie po statusie
      const matchesFilter = activeFilter === 'all' || 
                           (activeFilter === 'online' && member.isOnline) ||
                           (activeFilter === 'offline' && !member.isOnline) ||
                           (activeFilter === 'banned' && member.isBanned) ||
                           (activeFilter === 'premium' && member.subscriptionTier === 'premium') ||
                           (activeFilter === member.role);
      
      return matchesSearch && matchesFilter;
    });

    // Sortowanie
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'reputation':
          return b.reputation - a.reputation;
        case 'joinedAt':
          return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
        case 'lastActive':
          return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
        case 'messages':
          return b.stats.messagesCount - a.stats.messagesCount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [members, searchTerm, activeFilter, sortBy]);

  // Funkcja określająca kolor roli
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'text-purple-400';
      case 'admin': return 'text-red-400';
      case 'moderator': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  // Ikona roli
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4" />;
      case 'admin': return <Shield className="w-4 h-4" />;
      case 'moderator': return <Star className="w-4 h-4" />;
      default: return <UserCheck className="w-4 h-4" />;
    }
  };

  // Czy użytkownik może wykonać akcję
  const canPerformAction = (targetRole: string, action: string) => {
    const hierarchy = { owner: 4, admin: 3, moderator: 2, member: 1 };
    const currentLevel = hierarchy[currentUserRole as keyof typeof hierarchy] || 0;
    const targetLevel = hierarchy[targetRole as keyof typeof hierarchy] || 0;
    
    return currentLevel > targetLevel;
  };

  return (
    <div className="space-y-6">
      {/* Nagłówek z wyszukiwarką */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Szukaj członków..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Filtry i sortowanie */}
        <div className="flex gap-2">
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg hover:bg-gray-700/50 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filtry
            </button>
            
            <AnimatePresence>
              {showFilterMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10"
                >
                  <div className="p-2 space-y-1">
                    {['all', 'online', 'offline', 'banned', 'premium', 'owner', 'admin', 'moderator', 'member'].map(filter => (
                      <button
                        key={filter}
                        onClick={() => {
                          setActiveFilter(filter);
                          setShowFilterMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          activeFilter === filter ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-gray-700'
                        }`}
                      >
                        {filter === 'all' ? 'Wszyscy' : filter === 'online' ? 'Online' : filter === 'offline' ? 'Offline' : 
                         filter === 'banned' ? 'Zbanowani' : filter === 'premium' ? 'Premium' : 
                         filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="joinedAt">Data dołączenia</option>
            <option value="reputation">Reputacja</option>
            <option value="lastActive">Ostatnia aktywność</option>
            <option value="messages">Liczba wiadomości</option>
          </select>
        </div>
      </div>

      {/* Statystyki */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
          <div className="text-2xl font-bold text-white">{members.length}</div>
          <div className="text-sm text-gray-400">Wszyscy członkowie</div>
        </div>
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">{members.filter(m => m.isOnline).length}</div>
          <div className="text-sm text-gray-400">Online</div>
        </div>
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-400">{members.filter(m => m.subscriptionTier === 'premium').length}</div>
          <div className="text-sm text-gray-400">Premium</div>
        </div>
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">{members.filter(m => m.isBanned).length}</div>
          <div className="text-sm text-gray-400">Zbanowani</div>
        </div>
      </div>

      {/* Lista członków */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredMembers.map((member) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border ${
                member.isBanned ? 'border-red-500/50' : 'border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Avatar z statusem online */}
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.username} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-white font-bold">
                          {member.username.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {member.isOnline && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-800" />
                    )}
                  </div>

                  {/* Informacje o członku */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white truncate">{member.username}</h3>
                      <div className={`flex items-center gap-1 ${getRoleColor(member.role)}`}>
                        {getRoleIcon(member.role)}
                        <span className="text-sm">{member.role}</span>
                      </div>
                      {member.subscriptionTier === 'premium' && (
                        <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                          Premium
                        </span>
                      )}
                      {member.isBanned && (
                        <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-full">
                          Zbanowany
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400 truncate">{member.address}</div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {member.reputation} rep
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {member.stats.messagesCount} msg
                      </span>
                    </div>
                  </div>
                </div>

                {/* Akcje */}
                <div className="flex items-center gap-2">
                  {canPerformAction(member.role, 'manage') && (
                    <div className="relative">
                      <button
                        onClick={() => setSelectedMember(selectedMember === member.id ? null : member.id)}
                        className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      
                      <AnimatePresence>
                        {selectedMember === member.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10"
                          >
                            <div className="p-2 space-y-1">
                              <button
                                onClick={() => onMemberAction(member.id, 'promote')}
                                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-700 flex items-center gap-2"
                              >
                                <Crown className="w-4 h-4" />
                                Awansuj
                              </button>
                              <button
                                onClick={() => onMemberAction(member.id, 'demote')}
                                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-700 flex items-center gap-2"
                              >
                                <UserMinus className="w-4 h-4" />
                                Degraduj
                              </button>
                              <button
                                onClick={() => onMemberAction(member.id, 'mentor')}
                                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-700 flex items-center gap-2"
                              >
                                <UserPlus className="w-4 h-4" />
                                Przypisz mentora
                              </button>
                              <button
                                onClick={() => onMemberAction(member.id, member.isBanned ? 'unban' : 'ban')}
                                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-700 flex items-center gap-2 text-red-400"
                              >
                                <Ban className="w-4 h-4" />
                                {member.isBanned ? 'Odbanuj' : 'Zbanuj'}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Brak wyników */}
      {filteredMembers.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg">Brak członków spełniających kryteria</div>
          <div className="text-gray-500 text-sm mt-1">Spróbuj zmienić filtry lub zapytanie wyszukiwania</div>
        </div>
      )}
    </div>
  );
};

export default MemberList; 