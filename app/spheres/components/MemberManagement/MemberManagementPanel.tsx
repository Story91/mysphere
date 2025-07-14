'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpheresContract, Member, MemberRole, Permission, PermissionCategory } from '../../hooks/useSpheresContract';
import { Address } from 'viem';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';

// Import components
import MemberList from './MemberList';
import MemberDetails from './MemberDetails';
import BanManagement from './BanManagement';
import RoleManagement from './RoleManagement';
import MentoringSystem from './MentoringSystem';
import MemberAnalytics from './MemberAnalytics';

// Extended Member interface for local state management
interface ExtendedMember {
  // Base contract Member fields
  communityId: number;
  subscriptionExpiresAt: number;
  respectPoints: number;
  totalSpent: number;
  lastActiveTime: number;
  referralCount: number;
  level: number;
  reputation: number;
  currentStreak: number;
  longestStreak: number;
  totalEventsParticipated: number;
  totalEventsWon: number;
  totalRatings: number;
  ratingSum: number;
  lifetime: boolean;
  mentorAddress: Address | null;
  
  // Extended fields for UI
  id: string;
  address: string;
  name?: string;
  joinedDate: string;
  lastActive: string;
  role: MemberRole;
  isLifetime: boolean;
  subscriptionExpires: string | null;
  eventsParticipated: number;
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
  userAddress: string | undefined;
  isPlatformAdmin: boolean;
}

export default function MemberManagementPanel({ communityId, userAddress, isPlatformAdmin }: MemberManagementPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'members' | 'bans' | 'roles' | 'mentoring' | 'analytics'>('members');
  const [selectedMember, setSelectedMember] = useState<ExtendedMember | null>(null);
  const [members, setMembers] = useState<ExtendedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | MemberRole>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'banned'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'level' | 'respectPoints' | 'joinedDate'>('respectPoints');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Helper function to convert MemberRole enum to string
  const memberRoleToString = (role: MemberRole): string => {
    switch (role) {
      case MemberRole.MEMBER: return 'member';
      case MemberRole.MODERATOR: return 'moderator';
      case MemberRole.ADMIN: return 'admin';
      default: return 'member';
    }
  };

  // Helper function to convert string to MemberRole enum
  const stringToMemberRole = (role: string): MemberRole => {
    switch (role) {
      case 'moderator': return MemberRole.MODERATOR;
      case 'admin': return MemberRole.ADMIN;
      default: return MemberRole.MEMBER;
    }
  };

  const { 
    address, 
    globalBanUser, 
    globalUnbanUser, 
    getMemberDetails, 
    isGloballyBanned,
    banMember,
    unbanMember,
    setMemberRole,
    getCommunityDetails,
    isLoading: contractLoading 
  } = useSpheresContract();

  // State for community details
  const [communityDetails, setCommunityDetails] = useState<any>(null);
  const [isCommunityCreator, setIsCommunityCreator] = useState(false);

  // Load community details to check if user is creator
  useEffect(() => {
    const loadCommunityDetails = async () => {
      if (userAddress && communityId) {
        try {
          const details = await getCommunityDetails(communityId);
          setCommunityDetails(details);
          setIsCommunityCreator(
            details?.creator?.toLowerCase() === userAddress.toLowerCase()
          );
        } catch (error) {
          console.error('Failed to load community details:', error);
        }
      }
    };

    loadCommunityDetails();
  }, [userAddress, communityId, getCommunityDetails]);

  // User has access if they are platform admin OR community creator
  const hasAccess = isPlatformAdmin || isCommunityCreator;

  // Convert contract Member to MemberListMember interface
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

  const convertToMemberListMember = (member: ExtendedMember): MemberListMember => ({
    id: member.id,
    address: member.address,
    username: member.name || `User ${member.id}`,
    avatar: '',
    role: memberRoleToString(member.role) as 'admin' | 'moderator' | 'member',
    joinedAt: new Date(member.joinedDate),
    lastActive: new Date(), // We'll need to parse member.lastActive properly
    reputation: member.reputation,
    isOnline: member.status === 'active',
    isBanned: member.status === 'banned',
    subscriptionTier: member.isLifetime ? 'premium' : 'basic',
    stats: {
      messagesCount: 0, // Not available in contract data
      eventsAttended: member.eventsParticipated,
      menteeCount: member.mentees.length,
      contributionScore: member.respectPoints
    }
  });

  // Convert contract Member to MemberWithRole interface
  interface MemberWithRole {
    id: string;
    address: string;
    username: string;
    avatar: string;
    currentRole: string;
    roleAssignedAt: Date;
    roleAssignedBy: string;
    isOnline: boolean;
  }

  const convertToMemberWithRole = (member: ExtendedMember): MemberWithRole => ({
    id: member.id,
    address: member.address,
    username: member.name || `User ${member.id}`,
    avatar: '',
    currentRole: memberRoleToString(member.role),
    roleAssignedAt: new Date(member.joinedDate), // Fallback to join date
    roleAssignedBy: 'System', // Not available in contract data
    isOnline: member.status === 'active'
  });

  // Load members from contract
  useEffect(() => {
    const loadMembers = async () => {
      setLoading(true);
      try {
        // Note: Currently there's no getAllMembers function in the contract
        // This would need to be implemented on the contract side
        // For now, we'll initialize with empty array and members would be added
        // through other means (events, manual addition, etc.)
        
        // TODO: Implement contract function to get all community members
        // const memberAddresses = await getAllCommunityMembers(communityId);
        // const membersData = await Promise.all(
        //   memberAddresses.map(addr => getMemberDetails(communityId, addr))
        // );
        
        // Placeholder: empty members array since contract doesn't have getAllMembers yet
        setMembers([]);
        
      } catch (error) {
        console.error('Failed to load members:', error);
        toast.error('Failed to load members');
        setMembers([]);
      } finally {
        setLoading(false);
      }
    };

    loadMembers();
  }, [communityId, getMemberDetails]);

  // Handle member ban
  const handleBanMember = async (memberAddress: string, reason: string, isGlobal: boolean = false) => {
    try {
      if (isGlobal) {
        await globalBanUser(memberAddress as Address);
        toast.success('Member banned globally');
      } else {
        await banMember(communityId, memberAddress as Address);
        toast.success('Member banned from community');
      }
      
      // Update local state
      setMembers(prev => prev.map(m => 
        m.address === memberAddress 
          ? { 
              ...m, 
              status: 'banned' as const,
              banInfo: {
                reason,
                bannedBy: address || 'Unknown',
                bannedAt: new Date().toISOString(),
              }
            } 
          : m
      ));
    } catch (error) {
      console.error('Ban failed:', error);
      toast.error('Failed to ban member');
    }
  };

  // Handle member unban
  const handleUnbanMember = async (memberAddress: string, isGlobal: boolean = false) => {
    try {
      if (isGlobal) {
        await globalUnbanUser(memberAddress as Address);
        toast.success('Member unbanned globally');
      } else {
        await unbanMember(communityId, memberAddress as Address);
        toast.success('Member unbanned from community');
      }
      
      // Update local state
      setMembers(prev => prev.map(m => 
        m.address === memberAddress 
          ? { ...m, status: 'active', banInfo: undefined } 
          : m
      ));
    } catch (error) {
      console.error('Unban failed:', error);
      toast.error('Failed to unban member');
    }
  };

  // Handle role change
  const handleRoleChange = async (memberAddress: string, newRole: string) => {
    try {
      let roleValue = MemberRole.MEMBER;
      if (newRole === 'moderator') roleValue = MemberRole.MODERATOR;
      if (newRole === 'admin') roleValue = MemberRole.ADMIN;
      
      await setMemberRole(communityId, memberAddress as Address, roleValue);
      
      // Update local state
      setMembers(prev => prev.map(m => 
        m.address === memberAddress ? { ...m, role: roleValue } : m
      ));
      
      toast.success('Role updated successfully');
    } catch (error) {
      console.error('Role change failed:', error);
      toast.error('Failed to update role');
    }
  };

  // Filter and sort members
  const filteredMembers = members.filter(member => {
    const matchesSearch = !searchTerm || 
      member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.address.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Fixed role filtering to handle MemberRole enum properly
    const matchesRole = filterRole === 'all' || 
      (filterRole === MemberRole.ADMIN && member.role === MemberRole.ADMIN) ||
      (filterRole === MemberRole.MODERATOR && member.role === MemberRole.MODERATOR) ||
      (filterRole === MemberRole.MEMBER && member.role === MemberRole.MEMBER);
    
    const matchesStatus = filterStatus === 'all' || member.status === filterStatus;
    
    return matchesSearch && matchesRole && matchesStatus;
  }).sort((a, b) => {
    let aValue: any = a[sortBy];
    let bValue: any = b[sortBy];
    
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
    moderators: members.filter(m => m.role === MemberRole.MODERATOR).length,
    lifetime: members.filter(m => m.isLifetime).length
  };

  const tabs = [
    { id: 'members', label: 'Members', icon: '👥', count: memberStats.total },
    { id: 'bans', label: 'Bans', icon: '🚫', count: memberStats.banned },
    { id: 'roles', label: 'Roles', icon: '⭐', count: memberStats.moderators },
    { id: 'mentoring', label: 'Mentoring', icon: '👨‍🏫', count: 0 },
    { id: 'analytics', label: 'Analytics', icon: '📊', count: 0 }
  ];

  if (!hasAccess) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-500/20 rounded-2xl p-8 border border-red-500/20">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
            <span className="text-2xl">🔒</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400">
            You need to be the community creator or platform admin to access member management.
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
        <div className="flex items-center space-x-4">
            <button
                onClick={() => router.back()}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
            </button>
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Member Management</h1>
                <p className="text-gray-300">
                    Manage community members, roles, and moderation
                </p>
            </div>
        </div>
        <div className="text-right">
            <div className="text-sm text-gray-400">Total Members</div>
            <div className="text-2xl font-bold text-white">{memberStats.total}</div>
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
              <span className="bg-white/20 text-xs px-2 py-1 rounded-full">
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
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'members' && (
            <div className="space-y-4">
              {/* Search and Filters */}
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Search members..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-purple-500 text-white placeholder-gray-400"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-white"
                  >
                    <span>🔽</span>
                    <span>Filters</span>
                  </button>
                  <select
                    value={`${sortBy}-${sortOrder}`}
                    onChange={(e) => {
                      const [field, order] = e.target.value.split('-');
                      setSortBy(field as any);
                      setSortOrder(order as 'asc' | 'desc');
                    }}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-purple-500 text-white"
                  >
                    <option value="respectPoints-desc">Respect Points (High to Low)</option>
                    <option value="respectPoints-asc">Respect Points (Low to High)</option>
                    <option value="level-desc">Level (High to Low)</option>
                    <option value="level-asc">Level (Low to High)</option>
                    <option value="joinedDate-desc">Join Date (Newest)</option>
                    <option value="joinedDate-asc">Join Date (Oldest)</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                  <p className="text-gray-400 mt-4">Loading members...</p>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-500/20 rounded-full flex items-center justify-center">
                    <span className="text-2xl">👥</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">No Members Found</h3>
                  <p className="text-gray-400">
                    {searchTerm ? 'No members match your search criteria.' : 'No members in this community yet.'}
                  </p>
                </div>
              ) : (
                // TODO: Update MemberList component props to match the expected interface
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <span className="text-2xl">👥</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Member List</h3>
                  <p className="text-gray-400">
                    Member list component needs interface updates to work with contract data.
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Total members: {filteredMembers.length}
                  </p>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'bans' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                <span className="text-2xl">🚫</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Ban Management</h3>
              <p className="text-gray-400">
                Ban management component needs interface updates to work with contract data.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Banned members: {members.filter(m => m.status === 'banned').length}
              </p>
            </div>
          )}
          
          {activeTab === 'roles' && (
            <RoleManagement
              communityId={communityId.toString()}
              members={members.map(convertToMemberWithRole)}
              roles={[
                {
                  id: 'admin',
                  name: 'Administrator',
                  displayName: 'Administrator',
                  description: 'Full access to all community features',
                  permissions: [
                    Permission.MEMBERS_MANAGE,
                    Permission.CONTENT_MODERATE,
                    Permission.ADMIN_SETTINGS,
                    Permission.ADMIN_ROLES,
                    Permission.FINANCE_MANAGE,
                    Permission.EVENTS_MANAGE
                  ],
                  color: '#ef4444',
                  level: 10,
                  isDefault: false,
                  isSystemRole: true,
                  memberCount: members.filter(m => m.role === MemberRole.ADMIN).length,
                  createdAt: new Date(),
                  updatedAt: new Date()
                },
                {
                  id: 'moderator',
                  name: 'Moderator',
                  displayName: 'Moderator',
                  description: 'Can moderate content and manage members',
                  permissions: [
                    Permission.MEMBERS_KICK,
                    Permission.CONTENT_MODERATE,
                    Permission.EVENTS_MODERATE
                  ],
                  color: '#f59e0b',
                  level: 5,
                  isDefault: false,
                  isSystemRole: true,
                  memberCount: members.filter(m => m.role === MemberRole.MODERATOR).length,
                  createdAt: new Date(),
                  updatedAt: new Date()
                },
                {
                  id: 'member',
                  name: 'Member',
                  displayName: 'Member',
                  description: 'Standard community access',
                  permissions: [
                    Permission.CONTENT_CREATE
                  ],
                  color: '#10b981',
                  level: 1,
                  isDefault: true,
                  isSystemRole: true,
                  memberCount: members.filter(m => m.role === MemberRole.MEMBER).length,
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
              ]}
              onCreateRole={(roleData: any) => {
                toast.success('Role created successfully');
              }}
              onUpdateRole={(roleId: string, roleData: any) => {
                toast.success('Role updated successfully');
              }}
              onDeleteRole={(roleId: string) => {
                toast.success('Role deleted successfully');
              }}
              onAssignRole={(memberId: string, roleId: string) => {
                const member = members.find(m => m.id === memberId);
                if (member) {
                  let newRole = MemberRole.MEMBER;
                  if (roleId === 'moderator') newRole = MemberRole.MODERATOR;
                  if (roleId === 'admin') newRole = MemberRole.ADMIN;
                  
                  handleRoleChange(member.address, roleId);
                }
              }}
              onRemoveRole={(memberId: string) => {
                const member = members.find(m => m.id === memberId);
                if (member) {
                  handleRoleChange(member.address, 'member');
                }
              }}
              currentUserRole={isPlatformAdmin ? 'admin' : (isCommunityCreator ? 'admin' : 'member')}
            />
          )}
          
          {activeTab === 'mentoring' && (
            <MentoringSystem
              communityId={communityId.toString()}
              mentors={members.filter(m => m.mentees.length > 0).map(m => ({
                id: m.id,
                userId: m.id,
                username: m.name || `User ${m.id}`,
                avatar: '',
                specialization: ['DeFi', 'Blockchain'],
                experience: 12,
                rating: 4.5,
                totalMentees: m.mentees.length,
                activeMentees: m.mentees.length,
                completedSessions: 0,
                joinedAt: new Date(m.joinedDate),
                isAvailable: m.status === 'active',
                maxMentees: 5,
                description: 'Experienced community member',
                achievements: ['Top Contributor']
              }))}
              mentees={members.filter(m => m.mentorAddress).map(m => ({
                id: m.id,
                userId: m.id,
                username: m.name || `User ${m.id}`,
                avatar: '',
                mentorId: m.mentorAddress || '',
                startDate: new Date(m.joinedDate),
                currentGoals: ['Learn DeFi', 'Increase reputation'],
                completedGoals: [],
                progressScore: Math.min(m.respectPoints / 10, 100),
                lastSessionDate: undefined,
                nextSessionDate: undefined,
                totalSessions: 0,
                status: 'active' as const,
                notes: 'New mentee in the community'
              }))}
              sessions={[]} // Would need separate contract functions for sessions
              onAssignMentor={(menteeId: string, mentorId: string) => {
                setMembers(prev => prev.map(m => {
                  if (m.id === menteeId) {
                    return { ...m, mentorAddress: mentorId as Address };
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
                toast.success('Mentor assigned successfully');
              }}
              onRemoveMentor={(menteeId: string) => {
                setMembers(prev => prev.map(m => 
                  m.id === menteeId ? { ...m, mentorAddress: null } : m
                ));
                toast.success('Mentor removed successfully');
              }}
              onUpdateProgress={(menteeId: string, progress: any) => {
                toast.success('Progress updated successfully');
              }}
              onScheduleSession={(sessionData: any) => {
                toast.success('Session scheduled successfully');
              }}
              currentUserId={address || 'anonymous'}
            />
          )}
          
          {activeTab === 'analytics' && (
            <MemberAnalytics
              communityId={communityId.toString()}
              analytics={[]}
              communityStats={{
                totalMembers: members.length,
                activeMembers: members.filter(m => m.status === 'active').length,
                retentionRate: 0.85,
                averageEngagement: 0.75,
                growthRate: 0.12,
                newMembersThisMonth: members.filter(m => new Date(m.joinedDate) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
                activityByHour: Array.from({ length: 24 }, (_, i) => ({ hour: i, activity: Math.floor(Math.random() * 100) })),
                membersByRole: [
                  {
                    role: 'admin',
                    count: members.filter(m => m.role === MemberRole.ADMIN).length,
                    percentage: Math.round((members.filter(m => m.role === MemberRole.ADMIN).length / Math.max(members.length, 1)) * 100)
                  },
                  {
                    role: 'moderator',
                    count: members.filter(m => m.role === MemberRole.MODERATOR).length,
                    percentage: Math.round((members.filter(m => m.role === MemberRole.MODERATOR).length / Math.max(members.length, 1)) * 100)
                  },
                  {
                    role: 'member',
                    count: members.filter(m => m.role === MemberRole.MEMBER).length,
                    percentage: Math.round((members.filter(m => m.role === MemberRole.MEMBER).length / Math.max(members.length, 1)) * 100)
                  }
                ],
                topContributors: members.slice(0, 5).map((m, index) => ({
                  userId: m.id,
                  username: m.name || `User ${m.id}`,
                  points: m.respectPoints,
                  rank: index + 1
                }))
              }}
              onExportData={(format: 'csv' | 'json') => {
                toast.success(`Data exported as ${format.toUpperCase()}`);
              }}
              onRefreshData={() => {
                toast.success('Data refreshed');
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Member Details Modal */}
      <AnimatePresence>
        {selectedMember && (
          <MemberDetails
            member={{
              ...selectedMember,
              role: memberRoleToString(selectedMember.role) as 'member' | 'moderator' | 'admin',
              mentorAddress: selectedMember.mentorAddress || undefined
            }}
            onClose={() => setSelectedMember(null)}
            onBan={(reason) => {
              handleBanMember(selectedMember.address, reason);
              setSelectedMember(null);
            }}
            onRoleChange={(newRole) => {
              handleRoleChange(selectedMember.address, newRole);
              setSelectedMember(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
} 