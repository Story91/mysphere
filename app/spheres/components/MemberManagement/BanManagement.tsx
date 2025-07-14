'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Ban, 
  Shield, 
  AlertTriangle, 
  Clock, 
  User, 
  Calendar,
  MessageSquare,
  Trash2,
  Edit,
  Plus,
  Filter,
  Search,
  CheckCircle,
  XCircle,
  Timer,
  AlertCircle
} from 'lucide-react';

// Interfejs dla bana
interface BanRecord {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  banType: 'temporary' | 'permanent' | 'warning';
  reason: string;
  category: 'spam' | 'harassment' | 'inappropriate' | 'violation' | 'other';
  bannedBy: string;
  bannedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  appealStatus: 'none' | 'pending' | 'approved' | 'rejected';
  appealMessage?: string;
  appealedAt?: Date;
}

// Interfejs dla reguł automatycznych
interface AutoModerationRule {
  id: string;
  name: string;
  category: 'spam' | 'harassment' | 'inappropriate' | 'violation';
  triggerCount: number;
  timeWindow: number; // w godzinach
  action: 'warning' | 'mute' | 'ban' | 'kick';
  duration: number; // w godzinach (0 = permanent)
  isActive: boolean;
  createdAt: Date;
}

interface BanManagementProps {
  communityId: string;
  onBanUser: (userId: string, banData: Partial<BanRecord>) => void;
  onUnbanUser: (userId: string) => void;
  onHandleAppeal: (banId: string, decision: 'approved' | 'rejected') => void;
  currentUserRole: string;
}

const BanManagement: React.FC<BanManagementProps> = ({
  communityId,
  onBanUser,
  onUnbanUser,
  onHandleAppeal,
  currentUserRole
}) => {
  const [activeTab, setActiveTab] = useState<'bans' | 'rules' | 'create'>('bans');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired'>('all');
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [banRecords, setBanRecords] = useState<BanRecord[]>([]);
  const [autoRules, setAutoRules] = useState<AutoModerationRule[]>([]);
  const [newRule, setNewRule] = useState<Partial<AutoModerationRule>>({
    name: '',
    category: 'spam',
    triggerCount: 3,
    timeWindow: 24,
    action: 'warning',
    duration: 0,
    isActive: true
  });

  // Przykładowe dane banów
  useEffect(() => {
    const mockBans: BanRecord[] = [
      {
        id: '1',
        userId: '0x123',
        username: 'SpamUser',
        avatar: '',
        banType: 'temporary',
        reason: 'Multiple spam messages',
        category: 'spam',
        bannedBy: 'Admin',
        bannedAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        isActive: true,
        appealStatus: 'none'
      },
      {
        id: '2',
        userId: '0x456',
        username: 'TrollUser',
        avatar: '',
        banType: 'permanent',
        reason: 'Harassment and toxicity',
        category: 'harassment',
        bannedBy: 'Admin',
        bannedAt: new Date(Date.now() - 172800000),
        isActive: true,
        appealStatus: 'pending',
        appealMessage: 'I was just joking, please unban me',
        appealedAt: new Date(Date.now() - 86400000)
      }
    ];

    const mockRules: AutoModerationRule[] = [
      {
        id: '1',
        name: 'Spam Detection',
        category: 'spam',
        triggerCount: 5,
        timeWindow: 1,
        action: 'mute',
        duration: 24,
        isActive: true,
        createdAt: new Date()
      },
      {
        id: '2',
        name: 'Harassment Prevention',
        category: 'harassment',
        triggerCount: 3,
        timeWindow: 24,
        action: 'ban',
        duration: 168,
        isActive: true,
        createdAt: new Date()
      }
    ];

    setBanRecords(mockBans);
    setAutoRules(mockRules);
  }, []);

  // Filtrowanie banów
  const filteredBans = banRecords.filter(ban => {
    const matchesSearch = ban.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ban.reason.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'active' && ban.isActive) ||
                         (filterStatus === 'expired' && !ban.isActive);
    
    return matchesSearch && matchesStatus;
  });

  const handleCreateBan = () => {
    // Logika tworzenia bana
    console.log('Creating ban');
  };

  const handleCreateRule = () => {
    if (newRule.name && newRule.category && newRule.triggerCount && newRule.timeWindow) {
      const rule: AutoModerationRule = {
        id: Date.now().toString(),
        name: newRule.name,
        category: newRule.category,
        triggerCount: newRule.triggerCount,
        timeWindow: newRule.timeWindow,
        action: newRule.action || 'warning',
        duration: newRule.duration || 0,
        isActive: newRule.isActive || true,
        createdAt: new Date()
      };

      setAutoRules([...autoRules, rule]);
      setNewRule({
        name: '',
        category: 'spam',
        triggerCount: 3,
        timeWindow: 24,
        action: 'warning',
        duration: 0,
        isActive: true
      });
      setShowCreateRule(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleString();
  };

  const getRemainingTime = (expiresAt: Date) => {
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m left`;
  };

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex space-x-2">
        {[
          { id: 'bans', label: 'Active Bans', icon: Ban },
          { id: 'rules', label: 'Auto Rules', icon: Shield },
          { id: 'create', label: 'New Ban', icon: Plus }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Aktywne bany */}
      {activeTab === 'bans' && (
        <div className="space-y-4">
          {/* Nagłówek z wyszukiwarką */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search bans..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            
            <div className="flex gap-2">
              <div className="text-sm text-gray-400 flex items-center gap-2">
                <Ban className="w-4 h-4" />
                {filteredBans.filter(b => b.isActive).length} active bans
              </div>
            </div>
          </div>

          {/* Lista banów */}
          <div className="space-y-3">
            <AnimatePresence>
              {filteredBans.map(ban => (
                <motion.div
                  key={ban.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={`bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border ${
                    ban.isActive ? 'border-red-500/50' : 'border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
                        {ban.avatar ? (
                          <img src={ban.avatar} alt={ban.username} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-white font-bold">
                            {ban.username.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Informacje o banie */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white">{ban.username}</h3>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            ban.banType === 'permanent' 
                              ? 'bg-red-500/20 text-red-400' 
                              : ban.banType === 'temporary'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-orange-500/20 text-orange-400'
                          }`}>
                            {ban.banType === 'permanent' ? 'Permanent' : 
                             ban.banType === 'temporary' ? 'Temporary' : 'Warning'}
                          </span>
                          <span className="px-2 py-1 text-xs bg-gray-600/20 text-gray-400 rounded-full">
                            {ban.category}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-400 mb-2">{ban.reason}</div>
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            by {ban.bannedBy}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatTime(ban.bannedAt)}
                          </span>
                          {ban.expiresAt && ban.isActive && (
                            <span className="flex items-center gap-1">
                              <Timer className="w-3 h-3" />
                              {getRemainingTime(ban.expiresAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Akcje */}
                    <div className="flex items-center gap-2">
                      {ban.appealStatus === 'pending' && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">
                          <AlertCircle className="w-3 h-3" />
                          Appeal
                        </div>
                      )}
                      {ban.isActive && (
                        <button
                          onClick={() => onUnbanUser(ban.userId)}
                          className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/30 transition-colors"
                        >
                          Unban
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Odwołanie */}
                  {ban.appealStatus === 'pending' && ban.appealMessage && (
                    <div className="mt-3 p-3 bg-gray-700/30 rounded-lg border border-gray-600">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="w-4 h-4 text-yellow-400" />
                        <span className="text-sm font-medium text-yellow-400">Appeal</span>
                        <span className="text-xs text-gray-500">
                          {ban.appealedAt && formatTime(ban.appealedAt)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-300 mb-3">{ban.appealMessage}</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onHandleAppeal(ban.id, 'approved')}
                          className="flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/30 transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Approve
                        </button>
                        <button
                          onClick={() => onHandleAppeal(ban.id, 'rejected')}
                          className="flex items-center gap-1 px-3 py-1 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30 transition-colors"
                        >
                          <XCircle className="w-3 h-3" />
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Tab: Reguły automatyczne */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Auto-Moderation Rules</h3>
            <button
              onClick={() => setShowCreateRule(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Rule
            </button>
          </div>

          <div className="space-y-3">
            {autoRules.map(rule => (
              <div key={rule.id} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-white">{rule.name}</h4>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        rule.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400 mb-2">
                      {rule.triggerCount} violations in {rule.timeWindow}h → {rule.action}
                      {rule.duration > 0 && ` for ${rule.duration}h`}
                    </div>
                    <div className="text-xs text-gray-500">
                      Category: {rule.category}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-1 text-gray-400 hover:text-white">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-gray-400 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Rule Modal */}
      <AnimatePresence>
        {showCreateRule && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800/90 backdrop-blur-sm rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700"
            >
              <h3 className="text-lg font-semibold text-white mb-4">Create Auto-Moderation Rule</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Rule Name
                  </label>
                  <input
                    type="text"
                    value={newRule.name}
                    onChange={(e) => setNewRule({...newRule, name: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Category
                  </label>
                  <select
                    value={newRule.category}
                    onChange={(e) => setNewRule({...newRule, category: e.target.value as any})}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="spam">Spam</option>
                    <option value="harassment">Harassment</option>
                    <option value="inappropriate">Inappropriate Content</option>
                    <option value="violation">Rule Violation</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Violation Threshold
                    </label>
                    <input
                      type="number"
                      value={newRule.triggerCount}
                      onChange={(e) => setNewRule({...newRule, triggerCount: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Time Window (h)
                    </label>
                    <input
                      type="number"
                      value={newRule.timeWindow}
                      onChange={(e) => setNewRule({...newRule, timeWindow: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Action
                  </label>
                  <select
                    value={newRule.action}
                    onChange={(e) => setNewRule({...newRule, action: e.target.value as any})}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="warning">Warning</option>
                    <option value="mute">Mute</option>
                    <option value="ban">Ban</option>
                    <option value="kick">Kick</option>
                  </select>
                </div>

                {newRule.action !== 'warning' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Duration (h, 0 = permanent)
                    </label>
                    <input
                      type="number"
                      value={newRule.duration}
                      onChange={(e) => setNewRule({...newRule, duration: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleCreateRule}
                    className="flex-1 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
                  >
                    Create Rule
                  </button>
                  <button
                    onClick={() => setShowCreateRule(false)}
                    className="flex-1 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BanManagement; 