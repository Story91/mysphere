'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { toast } from 'react-hot-toast';
import MemberList from './MemberList';
import MemberDetails from './MemberDetails';
import BanManagement from './BanManagement';
import RoleManagement from './RoleManagement';
import MentoringSystem from './MentoringSystem';
import MemberAnalytics from './MemberAnalytics';

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

interface MemberManagementPanelProps {
  communityId: number;
  isAdmin: boolean;
}

export default function MemberManagementPanel({ communityId, isAdmin }: MemberManagementPanelProps) {
  const [activeTab, setActiveTab] = useState<'members' | 'bans' | 'roles' | 'mentoring' | 'analytics'>('members');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'member' | 'moderator' | 'admin'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'banned'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'level' | 'respectPoints' | 'joinedDate'>('respectPoints');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { address } = useSpheresContract();

  // Interfejs Member oczekiwany przez MemberList
  interface MemberListMember {
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

  // Adapter funkcja do konwersji Member na MemberListMember
  const convertToMemberListMember = (member: Member): MemberListMember => ({
    id: member.id,
    address: member.address,
    username: member.name || `User ${member.id}`,
    avatar: '', // Domyślnie pusty avatar
    role: member.role as 'admin' | 'moderator' | 'member',
    joinedAt: new Date(member.joinedDate),
    lastActive: new Date(member.lastActive),
    reputation: member.reputation,
    isOnline: member.status === 'active',
    isBanned: member.status === 'banned',
    subscriptionTier: member.isLifetime ? 'premium' : 'basic' as 'free' | 'basic' | 'premium',
    stats: {
      messagesCount: 0, // Domyślnie 0, można dodać później
      eventsAttended: member.eventsParticipated,
      menteeCount: member.mentees.length,
      contributionScore: member.respectPoints
    }
  });

  // Symulowane dane członków (w rzeczywistej aplikacji pobierane z API/kontraktu)
  const mockMembers: Member[] = [
    {
      id: '1',
      address: '0x1234567890abcdef1234567890abcdef12345678',
      name: 'Alice Johnson',
      level: 4,
      respectPoints: 2500,
      joinedDate: '2024-01-15',
      lastActive: '2 hours ago',
      role: 'moderator',
      isLifetime: true,
      subscriptionExpires: null,
      totalSpent: 0.15,
      eventsParticipated: 12,
      currentStreak: 8,
      longestStreak: 15,
      reputation: 4.8,
      totalRatings: 25,
      ratingSum: 120,
      mentees: ['2', '3'],
      status: 'active'
    },
    {
      id: '2',
      address: '0xabcdef1234567890abcdef1234567890abcdef12',
      name: 'Bob Smith',
      level: 2,
      respectPoints: 750,
      joinedDate: '2024-01-20',
      lastActive: '1 day ago',
      role: 'member',
      isLifetime: false,
      subscriptionExpires: '2024-02-20',
      totalSpent: 0.05,
      eventsParticipated: 5,
      currentStreak: 3,
      longestStreak: 7,
      reputation: 4.2,
      totalRatings: 8,
      ratingSum: 34,
      mentorAddress: '1',
      mentees: [],
      status: 'active'
    },
    {
      id: '3',
      address: '0x9876543210fedcba9876543210fedcba98765432',
      name: 'Charlie Brown',
      level: 1,
      respectPoints: 300,
      joinedDate: '2024-01-25',
      lastActive: '5 days ago',
      role: 'member',
      isLifetime: false,
      subscriptionExpires: '2024-02-25',
      totalSpent: 0.02,
      eventsParticipated: 2,
      currentStreak: 0,
      longestStreak: 3,
      reputation: 3.5,
      totalRatings: 4,
      ratingSum: 14,
      mentorAddress: '1',
      mentees: [],
      status: 'inactive'
    },
    {
      id: '4',
      address: '0xdeadbeef1234567890abcdef1234567890abcdef',
      name: 'David Wilson',
      level: 0,
      respectPoints: 50,
      joinedDate: '2024-01-30',
      lastActive: '1 week ago',
      role: 'member',
      isLifetime: false,
      subscriptionExpires: '2024-02-30',
      totalSpent: 0.01,
      eventsParticipated: 0,
      currentStreak: 0,
      longestStreak: 0,
      reputation: 0,
      totalRatings: 0,
      ratingSum: 0,
      mentees: [],
      status: 'banned',
      banInfo: {
        reason: 'Spam and inappropriate behavior',
        bannedBy: 'Alice Johnson',
        bannedAt: '2024-01-31',
        expiresAt: '2024-02-07'
      }
    }
  ];

  useEffect(() => {
    const loadMembers = async () => {
      setLoading(true);
      try {
        // Tutaj będzie rzeczywiste pobieranie z API/kontraktu
        await new Promise(resolve => setTimeout(resolve, 1000)); // Symulacja
        setMembers(mockMembers);
      } catch (error) {
        toast.error('Failed to load members');
      } finally {
        setLoading(false);
      }
    };

    loadMembers();
  }, [communityId]);

  // Filtrowanie i sortowanie członków
  const filteredMembers = members.filter(member => {
    const matchesSearch = !searchTerm || 
      member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.address.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === 'all' || member.role === filterRole;
    const matchesStatus = filterStatus === 'all' || member.status === filterStatus;
    
    return matchesSearch && matchesRole && matchesStatus;
  }).sort((a, b) => {
    let aValue: any = a[sortBy];
    let bValue: any = b[sortBy];
    
    // Sprawdzenie i wartości domyślne dla undefined
    if (aValue === undefined) aValue = 0;
    if (bValue === undefined) bValue = 0;
    
    if (sortBy === 'joinedDate') {
      aValue = new Date(aValue as string).getTime();
      bValue = new Date(bValue as string).getTime();
    }
    
    if (sortOrder === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  });

  const memberStats = {
    total: members.length,
    active: members.filter(m => m.status === 'active').length,
    inactive: members.filter(m => m.status === 'inactive').length,
    banned: members.filter(m => m.status === 'banned').length,
    moderators: members.filter(m => m.role === 'moderator').length,
    lifetime: members.filter(m => m.isLifetime).length
  };

  const tabs = [
    { id: 'members', label: 'Members', icon: '👥', count: memberStats.total },
    { id: 'bans', label: 'Bans', icon: '🚫', count: memberStats.banned },
    { id: 'roles', label: 'Roles', icon: '⭐', count: memberStats.moderators },
    { id: 'mentoring', label: 'Mentoring', icon: '👨‍🏫', count: 0 },
    { id: 'analytics', label: 'Analytics', icon: '📊', count: 0 }
  ];

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-500/20 rounded-2xl p-8 border border-red-500/20">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
            <span className="text-2xl">🔒</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400">
            You need admin privileges to access member management.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Member Management</h1>
          <p className="text-gray-300">
            Manage community members, roles, and moderation
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm text-gray-400">Total Members</div>
            <div className="text-2xl font-bold text-white">{memberStats.total}</div>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Total', value: memberStats.total, color: 'text-blue-400' },
          { label: 'Active', value: memberStats.active, color: 'text-green-400' },
          { label: 'Inactive', value: memberStats.inactive, color: 'text-yellow-400' },
          { label: 'Banned', value: memberStats.banned, color: 'text-red-400' },
          { label: 'Moderators', value: memberStats.moderators, color: 'text-purple-400' },
          { label: 'Lifetime', value: memberStats.lifetime, color: 'text-orange-400' }
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white/5 rounded-xl p-4 text-center"
          >
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-sm text-gray-400">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-white/5 rounded-full p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all ${
              activeTab === tab.id
                ? 'bg-purple-500 text-white shadow-lg'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="font-medium">{tab.label}</span>
            {tab.count > 0 && (
              <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'members' && (
            <MemberList
              communityId={communityId.toString()}
              members={filteredMembers.map(convertToMemberListMember)}
              onMemberAction={(memberId: string, action: string) => {
                const member = members.find(m => m.id === memberId);
                if (member) {
                  setSelectedMember(member);
                }
              }}
              currentUserRole="admin"
            />
          )}
          
          {activeTab === 'bans' && (
            <BanManagement
              communityId={communityId.toString()}
              onBanUser={(userId: string, banData: any) => {
                setMembers(prev => prev.map(m => 
                  m.id === userId ? { 
                    ...m, 
                    status: 'banned' as const, 
                    banInfo: {
                      reason: banData.reason || 'No reason provided',
                      bannedBy: 'Current User',
                      bannedAt: new Date().toISOString(),
                      expiresAt: banData.expiresAt
                    }
                  } : m
                ));
                toast.success('Member banned successfully');
              }}
              onUnbanUser={(userId: string) => {
                setMembers(prev => prev.map(m => 
                  m.id === userId ? { ...m, status: 'active' as const, banInfo: undefined } : m
                ));
                toast.success('Member unbanned successfully');
              }}
              onHandleAppeal={(banId: string, decision: 'approved' | 'rejected') => {
                // Logika obsługi apelacji
                toast.success(`Appeal ${decision}`);
              }}
              currentUserRole="admin"
            />
          )}
          
          {activeTab === 'roles' && (
            <RoleManagement
              members={members}
              onRoleChange={(memberId, newRole) => {
                setMembers(prev => prev.map(m => 
                  m.id === memberId ? { ...m, role: newRole as any } : m
                ));
                toast.success('Role updated successfully');
              }}
            />
          )}
          
          {activeTab === 'mentoring' && (
            <MentoringSystem
              members={members}
              onMentorshipChange={(menteeId, mentorId) => {
                setMembers(prev => prev.map(m => {
                  if (m.id === menteeId) {
                    return { ...m, mentorAddress: mentorId };
                  }
                  if (m.id === mentorId) {
                    return { 
                      ...m, 
                      mentees: m.mentees.includes(menteeId) 
                        ? m.mentees.filter(id => id !== menteeId)
                        : [...m.mentees, menteeId]
                    };
                  }
                  return m;
                }));
                toast.success('Mentorship updated successfully');
              }}
            />
          )}
          
          {activeTab === 'analytics' && (
            <MemberAnalytics
              members={members}
              communityId={communityId}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Member Details Modal */}
      <AnimatePresence>
        {selectedMember && (
          <MemberDetails
            member={selectedMember}
            onClose={() => setSelectedMember(null)}
            onBan={(reason) => {
              setMembers(prev => prev.map(m => 
                m.id === selectedMember.id 
                  ? { 
                      ...m, 
                      status: 'banned' as const, 
                      banInfo: {
                        reason,
                        bannedBy: 'Current User',
                        bannedAt: new Date().toISOString(),
                      }
                    } 
                  : m
              ));
              setSelectedMember(null);
              toast.success('Member banned successfully');
            }}
            onRoleChange={(newRole) => {
              setMembers(prev => prev.map(m => 
                m.id === selectedMember.id ? { ...m, role: newRole as any } : m
              ));
              setSelectedMember(null);
              toast.success('Role updated successfully');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
} 