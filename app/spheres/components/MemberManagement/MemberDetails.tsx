'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  User, 
  Calendar, 
  Clock, 
  Award, 
  MessageSquare, 
  TrendingUp,
  Shield,
  Ban,
  UserMinus,
  Edit3,
  Activity,
  Star,
  Target,
  Users,
  Zap,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

interface Member {
  id: string;
  address: string;
  name?: string;
  level: number;
  respectPoints: number;
  joinedDate: string;
  lastActive: string;
  role: 'member' | 'moderator' | 'admin';
  isLifetime: boolean;
  subscriptionExpires: string | null;
  totalSpent: number;
  eventsParticipated: number;
  currentStreak: number;
  longestStreak: number;
  reputation: number;
  totalRatings: number;
  ratingSum: number;
  mentorAddress?: string;
  mentees: string[];
  status: 'active' | 'inactive' | 'banned' | 'suspended';
  banInfo?: {
    reason: string;
    bannedBy: string;
    bannedAt: string;
    expiresAt?: string;
  };
}

interface MemberDetailsProps {
  member: Member;
  onClose: () => void;
  onBan: (reason: string) => void;
  onRoleChange: (newRole: string) => void;
}

const MemberDetails: React.FC<MemberDetailsProps> = ({
  member,
  onClose,
  onBan,
  onRoleChange
}) => {
  const [showBanModal, setShowBanModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [selectedRole, setSelectedRole] = useState<'member' | 'moderator' | 'admin'>(member.role);

  // Funkcja obliczająca średnią ocenę
  const getAverageRating = () => {
    if (member.totalRatings === 0) return 0;
    return (member.ratingSum / member.totalRatings).toFixed(1);
  };

  // Funkcja określająca kolor statusu
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-500/20';
      case 'inactive': return 'text-gray-400 bg-gray-500/20';
      case 'banned': return 'text-red-400 bg-red-500/20';
      case 'suspended': return 'text-yellow-400 bg-yellow-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  // Funkcja określająca kolor roli
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'text-red-400 bg-red-500/20';
      case 'moderator': return 'text-blue-400 bg-blue-500/20';
      case 'member': return 'text-gray-400 bg-gray-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  // Funkcja formatowania daty
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Funkcja formatowania względnego czasu
  const formatRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'wczoraj';
    if (diffDays < 7) return `${diffDays} dni temu`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} tygodni temu`;
    return `${Math.ceil(diffDays / 30)} miesięcy temu`;
  };

  // Funkcja obliczająca poziom aktywności
  const getActivityLevel = () => {
    const daysSinceLastActive = Math.ceil((new Date().getTime() - new Date(member.lastActive).getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceLastActive <= 1) return { level: 'Bardzo aktywny', color: 'text-green-400', icon: Zap };
    if (daysSinceLastActive <= 7) return { level: 'Aktywny', color: 'text-blue-400', icon: Activity };
    if (daysSinceLastActive <= 30) return { level: 'Umiarkowany', color: 'text-yellow-400', icon: Clock };
    return { level: 'Nieaktywny', color: 'text-red-400', icon: AlertTriangle };
  };

  const activityLevel = getActivityLevel();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-700"
      >
        {/* Nagłówek */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-xl">
                {member.name ? member.name.charAt(0).toUpperCase() : 'U'}
              </span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                {member.name || `User ${member.id.slice(-4)}`}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(member.status)}`}>
                  {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                </span>
                <span className={`px-2 py-1 text-xs rounded-full ${getRoleColor(member.role)}`}>
                  {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                </span>
                {member.isLifetime && (
                  <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                    Lifetime
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Zawartość */}
        <div className="p-6 space-y-6">
          {/* Podstawowe informacje */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <User className="w-5 h-5" />
                Podstawowe informacje
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Adres:</span>
                  <span className="text-white font-mono text-sm">
                    {member.address.slice(0, 6)}...{member.address.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Poziom:</span>
                  <span className="text-white font-semibold">{member.level}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Punkty szacunku:</span>
                  <span className="text-purple-400 font-semibold">{member.respectPoints}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Reputacja:</span>
                  <span className="text-yellow-400 font-semibold">{member.reputation}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Średnia ocena:</span>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400 fill-current" />
                    <span className="text-white">{getAverageRating()}</span>
                    <span className="text-gray-400 text-sm">({member.totalRatings})</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Aktywność
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Status aktywności:</span>
                  <div className="flex items-center gap-2">
                    <activityLevel.icon className={`w-4 h-4 ${activityLevel.color}`} />
                    <span className={activityLevel.color}>{activityLevel.level}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Ostatnio aktywny:</span>
                  <span className="text-white">{formatRelativeTime(member.lastActive)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Aktualna seria:</span>
                  <span className="text-green-400 font-semibold">{member.currentStreak} dni</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Najdłuższa seria:</span>
                  <span className="text-blue-400 font-semibold">{member.longestStreak} dni</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Eventy:</span>
                  <span className="text-white">{member.eventsParticipated}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Subskrypcja i finansowe */}
          <div className="bg-gray-700/30 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Subskrypcja i finanse
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Typ subskrypcji:</span>
                <span className="text-white">
                  {member.isLifetime ? 'Lifetime' : 'Standardowa'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Wygasa:</span>
                <span className="text-white">
                  {member.subscriptionExpires ? formatDate(member.subscriptionExpires) : 'Nie wygasa'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Łącznie wydane:</span>
                <span className="text-green-400 font-semibold">{member.totalSpent} ETH</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Data dołączenia:</span>
                <span className="text-white">{formatDate(member.joinedDate)}</span>
              </div>
            </div>
          </div>

          {/* Mentoring */}
          {(member.mentorAddress || member.mentees.length > 0) && (
            <div className="bg-gray-700/30 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Mentoring
              </h3>
              
              <div className="space-y-3">
                {member.mentorAddress && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Mentor:</span>
                    <span className="text-blue-400 font-mono text-sm">
                      {member.mentorAddress.slice(0, 6)}...{member.mentorAddress.slice(-4)}
                    </span>
                  </div>
                )}
                {member.mentees.length > 0 && (
                  <div>
                    <span className="text-gray-400">Podopieczni ({member.mentees.length}):</span>
                    <div className="mt-1 space-y-1">
                      {member.mentees.map((menteeId, index) => (
                        <div key={index} className="text-sm text-blue-400 font-mono">
                          {menteeId.slice(0, 6)}...{menteeId.slice(-4)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Informacje o banie */}
          {member.status === 'banned' && member.banInfo && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-red-400 mb-3 flex items-center gap-2">
                <Ban className="w-5 h-5" />
                Informacje o banie
              </h3>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Powód:</span>
                  <span className="text-white">{member.banInfo.reason}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Zbanowany przez:</span>
                  <span className="text-white">{member.banInfo.bannedBy}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Data bana:</span>
                  <span className="text-white">{formatDate(member.banInfo.bannedAt)}</span>
                </div>
                {member.banInfo.expiresAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Wygasa:</span>
                    <span className="text-white">{formatDate(member.banInfo.expiresAt)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Akcje */}
          <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-700">
            <button
              onClick={() => setShowRoleModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
            >
              <Shield className="w-4 h-4" />
              Zmień rolę
            </button>
            
            {member.status !== 'banned' && (
              <button
                onClick={() => setShowBanModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
              >
                <Ban className="w-4 h-4" />
                Zbanuj
              </button>
            )}
            
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors"
            >
              <X className="w-4 h-4" />
              Zamknij
            </button>
          </div>
        </div>

        {/* Modal banowania */}
        <AnimatePresence>
          {showBanModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700"
              >
                <h3 className="text-lg font-semibold text-white mb-4">
                  Zbanuj użytkownika
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Powód bana
                    </label>
                    <textarea
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      placeholder="Opisz powód banowania..."
                      rows={3}
                      className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (banReason.trim()) {
                          onBan(banReason);
                          setShowBanModal(false);
                          setBanReason('');
                        }
                      }}
                      disabled={!banReason.trim()}
                      className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Zbanuj
                    </button>
                    <button
                      onClick={() => {
                        setShowBanModal(false);
                        setBanReason('');
                      }}
                      className="flex-1 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal zmiany roli */}
        <AnimatePresence>
          {showRoleModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700"
              >
                <h3 className="text-lg font-semibold text-white mb-4">
                  Zmień rolę użytkownika
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nowa rola
                    </label>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as 'member' | 'moderator' | 'admin')}
                      className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="member">Członek</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onRoleChange(selectedRole);
                        setShowRoleModal(false);
                      }}
                      className="flex-1 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                    >
                      Zmień rolę
                    </button>
                    <button
                      onClick={() => {
                        setShowRoleModal(false);
                        setSelectedRole(member.role);
                      }}
                      className="flex-1 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default MemberDetails; 