'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseEther, formatEther, Address, Abi } from 'viem';
import { toast } from 'react-hot-toast';

// Contract configuration
export const CONTRACT_ADDRESS = "0xdE9f006A063eeE1f0dDb15A8198E573B36aCc070" as Address;

// Import ABI from artifacts
import HybridCommunityPlatformArtifacts from '../artifacts/app/spheres/contracts/spheres-core.sol/HybridCommunityPlatform.json';

// Complete ABI for HybridCommunityPlatform
export const CONTRACT_ABI = HybridCommunityPlatformArtifacts.abi as Abi;

// Simplified enums
export enum CommunityStatus {
  ACTIVE = 0,
  SUSPENDED = 1,
  CLOSED = 2
}

export enum MemberRole {
  MEMBER = 0,
  MODERATOR = 1,
  ADMIN = 2
}

export enum AchievementType {
  FIRST_JOIN = 0,
  LEVEL_UP = 1,
  EVENT_WINNER = 2,
  REFERRAL_MASTER = 3,
  STREAK_KEEPER = 4
}

export enum BoostType {
  EXPERIENCE_MULTIPLIER = 0,
  REPUTATION_MULTIPLIER = 1,
  EVENT_DISCOUNT = 2
}

// Enum for system permissions
export enum Permission {
  // Content permissions
  CONTENT_CREATE = 'content.create',
  CONTENT_EDIT = 'content.edit',
  CONTENT_DELETE = 'content.delete',
  CONTENT_MODERATE = 'content.moderate',
  
  // Member permissions  
  MEMBERS_INVITE = 'members.invite',
  MEMBERS_BAN = 'members.ban',
  MEMBERS_KICK = 'members.kick',
  MEMBERS_MANAGE = 'members.manage',
  MEMBERS_ASSIGN_ROLES = 'members.assignRoles',
  
  // Finance permissions
  FINANCE_VIEW = 'finance.view',
  FINANCE_MANAGE = 'finance.manage',
  FINANCE_WITHDRAW = 'finance.withdraw',
  
  // Event permissions
  EVENTS_CREATE = 'events.create',
  EVENTS_MANAGE = 'events.manage',
  EVENTS_MODERATE = 'events.moderate',
  
  // Admin permissions
  ADMIN_SETTINGS = 'admin.settings',
  ADMIN_ROLES = 'admin.roles',
  ADMIN_ANALYTICS = 'admin.analytics',
  ADMIN_COMMUNITY = 'admin.community'
}

// Permission categories for UI grouping
export enum PermissionCategory {
  CONTENT = 'content',
  MEMBERS = 'members', 
  FINANCE = 'finance',
  EVENTS = 'events',
  ADMIN = 'admin'
}

// Helper function to get permission category
export const getPermissionCategory = (permission: Permission): PermissionCategory => {
  if (permission.startsWith('content.')) return PermissionCategory.CONTENT;
  if (permission.startsWith('members.')) return PermissionCategory.MEMBERS;
  if (permission.startsWith('finance.')) return PermissionCategory.FINANCE;
  if (permission.startsWith('events.')) return PermissionCategory.EVENTS;
  if (permission.startsWith('admin.')) return PermissionCategory.ADMIN;
  return PermissionCategory.CONTENT;
};

// Helper function to get permission display name
export const getPermissionDisplayName = (permission: Permission): string => {
  const names: Record<Permission, string> = {
    [Permission.CONTENT_CREATE]: 'Create Content',
    [Permission.CONTENT_EDIT]: 'Edit Content',
    [Permission.CONTENT_DELETE]: 'Delete Content',
    [Permission.CONTENT_MODERATE]: 'Moderate Content',
    [Permission.MEMBERS_INVITE]: 'Invite Members',
    [Permission.MEMBERS_BAN]: 'Ban Members',
    [Permission.MEMBERS_KICK]: 'Kick Members',
    [Permission.MEMBERS_MANAGE]: 'Manage Members',
    [Permission.MEMBERS_ASSIGN_ROLES]: 'Assign Roles',
    [Permission.FINANCE_VIEW]: 'View Finance',
    [Permission.FINANCE_MANAGE]: 'Manage Finance',
    [Permission.FINANCE_WITHDRAW]: 'Withdraw Funds',
    [Permission.EVENTS_CREATE]: 'Create Events',
    [Permission.EVENTS_MANAGE]: 'Manage Events',
    [Permission.EVENTS_MODERATE]: 'Moderate Events',
    [Permission.ADMIN_SETTINGS]: 'Admin Settings',
    [Permission.ADMIN_ROLES]: 'Manage Roles',
    [Permission.ADMIN_ANALYTICS]: 'View Analytics',
    [Permission.ADMIN_COMMUNITY]: 'Manage Community'
  };
  return names[permission] || permission;
};

// Helper function to get permission description
export const getPermissionDescription = (permission: Permission): string => {
  const descriptions: Record<Permission, string> = {
    [Permission.CONTENT_CREATE]: 'Create new posts and content',
    [Permission.CONTENT_EDIT]: 'Edit existing content',
    [Permission.CONTENT_DELETE]: 'Delete content',
    [Permission.CONTENT_MODERATE]: 'Moderate and approve content',
    [Permission.MEMBERS_INVITE]: 'Invite new members to the community',
    [Permission.MEMBERS_BAN]: 'Ban members from the community',
    [Permission.MEMBERS_KICK]: 'Remove members from the community',
    [Permission.MEMBERS_MANAGE]: 'Manage member profiles and settings',
    [Permission.MEMBERS_ASSIGN_ROLES]: 'Assign roles to members',
    [Permission.FINANCE_VIEW]: 'View financial information',
    [Permission.FINANCE_MANAGE]: 'Manage community finances',
    [Permission.FINANCE_WITHDRAW]: 'Withdraw funds from community',
    [Permission.EVENTS_CREATE]: 'Create and organize events',
    [Permission.EVENTS_MANAGE]: 'Manage all community events',
    [Permission.EVENTS_MODERATE]: 'Moderate event content',
    [Permission.ADMIN_SETTINGS]: 'Access admin settings',
    [Permission.ADMIN_ROLES]: 'Create and manage roles',
    [Permission.ADMIN_ANALYTICS]: 'View detailed analytics',
    [Permission.ADMIN_COMMUNITY]: 'Manage community settings'
  };
  return descriptions[permission] || permission;
};

// Default permissions for each role
export const getDefaultPermissions = (role: MemberRole): Permission[] => {
  switch (role) {
    case MemberRole.MEMBER:
      return [Permission.CONTENT_CREATE];
    case MemberRole.MODERATOR:
      return [
        Permission.CONTENT_CREATE,
        Permission.CONTENT_EDIT,
        Permission.CONTENT_MODERATE,
        Permission.MEMBERS_KICK,
        Permission.EVENTS_MODERATE
      ];
    case MemberRole.ADMIN:
      return Object.values(Permission);
    default:
      return [];
  }
};

// Interface definitions
export interface PlatformStats {
  totalCommunities: number;
  totalMembers: number;
  totalTransactions: number;
  activeCommunities: number;
  totalVolume: string;
  totalPlatformFees: string;
}

export interface Community {
  id: number;
  creator: Address;
  name: string;
  description: string;
  joinFeeEth: string;
  monthlySubFeeEth: string;
  lifetimeSubFeeEth: string;
  balance: string;
  withdrawableBalance: string;
  totalMembers: number;
  status: CommunityStatus;
}

export interface Member {
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
}

export interface ContractData {
  communityIdCounter: number;
  platformStats: PlatformStats | null;
  isPaused: boolean;
  owner: Address | null;
  creationFee: string;
  utilityBoxFee: string;
  achievementUnlockFee: string;
  boostPurchaseFee: string;
  eventPlatformFee: string;
  withdrawalFeePercentage: number;
  defaultPlatformFeePercentage: number;
  maxPlatformFeePercentage: number;
}

// User data interfaces
export interface UserStats {
  totalRespectPoints: number;
  totalCommunitiesJoined: number;
  totalEventsAttended: number;
  totalEthEarned: string;
  averageCommunityLevel: number;
  totalAchievements: number;
}

export interface CommunityMembership {
  communityId: number;
  level: number;
  respectPoints: number;
  reputation: number;
  currentStreak: number;
  longestStreak: number;
  totalEventsParticipated: number;
  totalEventsWon: number;
  mentor: Address | null;
  menteeCount: number;
}

export interface UserAchievement {
  id: string;
  name: string;
  description: string;
  category: 'social' | 'financial' | 'events' | 'community' | 'leadership';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  icon: string;
  respectPointsReward: number;
  contractType: AchievementType;
}

export interface UserBoost {
  id: string;
  name: string;
  description: string;
  boostType: BoostType;
  multiplier: number;
  duration: number;
  expiresAt: number;
  active: boolean;
  icon: string;
  color: string;
}

// Achievement mapping function
export const mapContractAchievements = (contractAchievements: bigint[]): UserAchievement[] => {
  const achievementDefinitions: Record<AchievementType, UserAchievement> = {
    [AchievementType.FIRST_JOIN]: {
      id: 'first_join',
      name: 'First Steps',
      description: 'Join your first community',
      category: 'community',
      rarity: 'common',
      icon: 'Users',
      respectPointsReward: 25,
      contractType: AchievementType.FIRST_JOIN
    },
    [AchievementType.LEVEL_UP]: {
      id: 'level_up',
      name: 'Rising Star',
      description: 'Level up in a community',
      category: 'community',
      rarity: 'common',
      icon: 'Star',
      respectPointsReward: 50,
      contractType: AchievementType.LEVEL_UP
    },
    [AchievementType.EVENT_WINNER]: {
      id: 'event_winner',
      name: 'Champion',
      description: 'Win your first event',
      category: 'events',
      rarity: 'rare',
      icon: 'Trophy',
      respectPointsReward: 100,
      contractType: AchievementType.EVENT_WINNER
    },
    [AchievementType.REFERRAL_MASTER]: {
      id: 'referral_master',
      name: 'Community Builder',
      description: 'Refer 5 new members',
      category: 'leadership',
      rarity: 'epic',
      icon: 'Users',
      respectPointsReward: 150,
      contractType: AchievementType.REFERRAL_MASTER
    },
    [AchievementType.STREAK_KEEPER]: {
      id: 'streak_keeper',
      name: 'Consistency Master',
      description: 'Maintain a 7-day activity streak',
      category: 'social',
      rarity: 'rare',
      icon: 'Flame',
      respectPointsReward: 75,
      contractType: AchievementType.STREAK_KEEPER
    }
  };

  return contractAchievements.map(achievementId => {
    const achievementType = Number(achievementId) as AchievementType;
    return achievementDefinitions[achievementType];
  }).filter(Boolean);
};

// Boost mapping function
export const mapContractBoosts = (contractBoosts: any[]): UserBoost[] => {
  const boostDefinitions: Record<BoostType, Omit<UserBoost, 'multiplier' | 'duration' | 'expiresAt' | 'active'>> = {
    [BoostType.EXPERIENCE_MULTIPLIER]: {
      id: 'experience_multiplier',
      name: 'Experience Multiplier',
      description: 'Double your respect points gain',
      boostType: BoostType.EXPERIENCE_MULTIPLIER,
      icon: 'Zap',
      color: 'from-yellow-500 to-orange-500'
    },
    [BoostType.REPUTATION_MULTIPLIER]: {
      id: 'reputation_multiplier',
      name: 'Reputation Multiplier',
      description: '1.5x reputation gain from activities',
      boostType: BoostType.REPUTATION_MULTIPLIER,
      icon: 'Star',
      color: 'from-purple-500 to-pink-500'
    },
    [BoostType.EVENT_DISCOUNT]: {
      id: 'event_discount',
      name: 'Event Discount',
      description: '20% discount on event participation fees',
      boostType: BoostType.EVENT_DISCOUNT,
      icon: 'DollarSign',
      color: 'from-green-500 to-teal-500'
    }
  };

  return contractBoosts.map(boostData => {
    if (!boostData || !Array.isArray(boostData) || boostData.length < 5) return null;
    
    const [boostType, duration, expiresAt, multiplier, active] = boostData;
    const boostTypeNum = Number(boostType) as BoostType;
    const definition = boostDefinitions[boostTypeNum];
    
    if (!definition) return null;
    
    return {
      ...definition,
      multiplier: Number(multiplier),
      duration: Number(duration),
      expiresAt: Number(expiresAt),
      active: Boolean(active)
    };
  }).filter(Boolean) as UserBoost[];
};

// Main hook
export function useSpheresContract() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [userMemberships, setUserMemberships] = useState<CommunityMembership[]>([]);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  
  // Debug wallet connection
  useEffect(() => {
    console.log('🔗 Wallet Status:');
    console.log('Address:', address);
    console.log('Has Address:', !!address);
  }, [address]);

  // Read contract data
  const { data: communityIdCounter, refetch: refetchCommunityIdCounter } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'communityIdCounter',
    query: { enabled: !!address },
  });

  const communityCount = Number(communityIdCounter || 0);

  const { data: communitiesData, refetch: refetchCommunities } = useReadContracts({
    contracts: Array.from({ length: communityCount > 0 ? communityCount - 1 : 0 }, (_, i) => ({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getCommunityDetails',
        args: [BigInt(i + 1)],
    })),
    query: {
        enabled: communityCount > 0,
    }
  });

  const { data: creationFeeRaw, refetch: refetchCreationFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'creationFeeEth',
    query: { enabled: !!address },
  });

  useEffect(() => {
    const calculateStats = async () => {
      if (communitiesData && creationFeeRaw) {
        const formattedCommunities = communitiesData.map((communityResult, index) => {
            if (communityResult.status === 'success' && communityResult.result) {
                const data = communityResult.result as any;
                return {
                    id: index + 1,
                    creator: data[0],
                    name: data[1],
                    description: data[2],
                    joinFeeEth: formatEther(data[3] as bigint),
                    monthlySubFeeEth: formatEther(data[4] as bigint),
                    lifetimeSubFeeEth: formatEther(data[5] as bigint),
                    balance: formatEther(data[6] as bigint),
                    withdrawableBalance: formatEther(data[7] as bigint),
                    totalMembers: Number(data[8]),
                    status: data[9],
                };
            }
            return null;
        }).filter((c): c is Community => c !== null);
        setCommunities(formattedCommunities);

        const totalMembers = formattedCommunities.reduce((sum, community) => sum + community.totalMembers, 0);
        
        const creationFee = (creationFeeRaw as bigint) || 0n;
        const totalCommunityCreationFees = BigInt(formattedCommunities.length) * creationFee;
        
        const totalVolumeInWei = formattedCommunities.reduce((sum, community) => {
            return sum + parseEther(community.balance);
        }, totalCommunityCreationFees);
        
        // Fetch transaction count from our API endpoint
        let transactionCount = formattedCommunities.length; // Default to community count
        try {
          const response = await fetch('/api/transaction-count');
          const data = await response.json();
          if (response.ok) {
            transactionCount = data.count;
          }
        } catch (error) {
          console.error('Failed to fetch transaction count, using fallback.', error);
        }

        const newPlatformStats: PlatformStats = {
            totalCommunities: formattedCommunities.length,
            totalMembers,
            totalTransactions: transactionCount,
            activeCommunities: formattedCommunities.filter(c => c.status === CommunityStatus.ACTIVE).length,
            totalVolume: formatEther(totalVolumeInWei),
            totalPlatformFees: '0', // Placeholder for now
        };
        setPlatformStats(newPlatformStats);
      }
    };
    calculateStats();
  }, [communitiesData, creationFeeRaw]);

  const { data: isPaused, refetch: refetchPaused } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'paused',
    query: { enabled: !!address },
  });

  const { data: owner, error: ownerError, refetch: refetchOwner } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'owner',
    query: { enabled: !!address },
  });
  
  // Debug owner loading
  useEffect(() => {
    if (owner) {
      console.log('📋 Owner loaded from contract:', owner);
    }
    if (ownerError) {
      console.error('🚨 Error fetching owner:', ownerError);
    }
  }, [owner, ownerError]);

  const { data: utilityBoxFeeRaw, refetch: refetchUtilityBoxFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'utilityBoxFee',
    query: { enabled: !!address },
  });

  const { data: achievementUnlockFeeRaw, refetch: refetchAchievementUnlockFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'achievementUnlockFee',
    query: { enabled: !!address },
  });

  const { data: boostPurchaseFeeRaw, refetch: refetchBoostPurchaseFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'boostPurchaseFee',
    query: { enabled: !!address },
  });

  const { data: eventPlatformFeeRaw, refetch: refetchEventPlatformFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'eventPlatformFee',
    query: { enabled: !!address },
  });

  const { data: withdrawalFeePercentageRaw, refetch: refetchWithdrawalFeePercentage } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'withdrawalFeePercentage',
    query: { enabled: !!address },
  });

  const { data: defaultPlatformFeePercentageRaw, refetch: refetchDefaultPlatformFeePercentage } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'defaultPlatformFeePercentage',
    query: { enabled: !!address },
  });

  const { data: maxPlatformFeePercentageRaw, refetch: refetchMaxPlatformFeePercentage } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'maxPlatformFeePercentage',
    query: { enabled: !!address },
  });

  // Write contract functions
  const { writeContract: writeContractFn, data: hash, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Format contract data
  const contractData: ContractData = {
    communityIdCounter: Number(communityIdCounter || 0),
    platformStats: platformStats,
    isPaused: Boolean(isPaused) || false,
    owner: (owner as Address) || null,
    creationFee: formatEther((creationFeeRaw as bigint) || 0n),
    utilityBoxFee: formatEther((utilityBoxFeeRaw as bigint) || 0n),
    achievementUnlockFee: formatEther((achievementUnlockFeeRaw as bigint) || 0n),
    boostPurchaseFee: formatEther((boostPurchaseFeeRaw as bigint) || 0n),
    eventPlatformFee: formatEther((eventPlatformFeeRaw as bigint) || 0n),
    withdrawalFeePercentage: Number(withdrawalFeePercentageRaw || 0),
    defaultPlatformFeePercentage: Number(defaultPlatformFeePercentageRaw || 0),
    maxPlatformFeePercentage: Number(maxPlatformFeePercentageRaw || 0),
  };



  // Helper function to execute transactions
  const executeTransaction = useCallback(async (
    functionName: string,
    args: any[],
    value: bigint = 0n,
    successMessage: string = 'Transaction successful!'
  ) => {
    try {
      setIsLoading(true);
      setError(null);

      const txHash = await writeContractFn({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName,
        args,
        value,
      });

      // Return a simple object with hash and wait method
      const result = {
        hash: txHash,
        wait: async () => {
          // Wait for transaction receipt
          if (publicClient && txHash) {
            return await publicClient.waitForTransactionReceipt({ hash: txHash });
          }
          throw new Error('Public client not available');
        }
      };

      // Refetch contract data after successful transaction
      setTimeout(() => {
        refetchAll();
      }, 3000);

      return result;

    } catch (err: any) {
      const errorMessage = err?.message || 'Transaction failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [writeContractFn, publicClient]);

  // Helper functions
  const getCommunityDetails = useCallback(async (communityId: number): Promise<Community | null> => {
    try {
      // In real implementation, this would use useReadContract for specific community
      const community = communities.find(c => c.id === communityId);
      return community || null;
    } catch (err) {
      console.error('Error fetching community details:', err);
      return null;
    }
  }, [communities]);

  const getMemberDetails = useCallback(async (communityId: number, memberAddress: Address): Promise<Member | null> => {
    try {
      if (!publicClient) return null;
      
      const memberDetails = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getMemberDetails',
        args: [BigInt(communityId), memberAddress],
      });
      
      if (memberDetails && Array.isArray(memberDetails)) {
        const [level, respectPoints, reputation, currentStreak, longestStreak, 
               totalEventsParticipated, totalEventsWon, mentor] = memberDetails;
        
        return {
          communityId,
          subscriptionExpiresAt: 0, // TODO: Get from contract if available
          respectPoints: Number(respectPoints),
          totalSpent: 0, // TODO: Calculate from contract data
          lastActiveTime: 0, // TODO: Get from contract if available
          referralCount: 0, // TODO: Get from contract if available
          level: Number(level),
          reputation: Number(reputation),
          currentStreak: Number(currentStreak),
          longestStreak: Number(longestStreak),
          totalEventsParticipated: Number(totalEventsParticipated),
          totalEventsWon: Number(totalEventsWon),
          totalRatings: 0, // TODO: Get from contract if available
          ratingSum: 0, // TODO: Get from contract if available
          lifetime: false, // TODO: Get from contract if available
          mentorAddress: mentor as Address
        };
      }
      
      return null;
    } catch (err) {
      console.error('Error fetching member details:', err);
      return null;
    }
  }, [publicClient]);

  const isGloballyBanned = useCallback(async (userAddress: Address): Promise<boolean> => {
    try {
      // This would use useReadContract with globalBannedUsers function
      return false;
    } catch (err) {
      console.error('Error checking global ban status:', err);
      return false;
    }
  }, []);

  // Admin functions - Real contract interactions
  const globalBanUser = useCallback(async (userAddress: Address) => {
    return executeTransaction('globalBanUser', [userAddress], 0n, 'User banned globally!');
  }, [executeTransaction]);

  const globalUnbanUser = useCallback(async (userAddress: Address) => {
    return executeTransaction('globalUnbanUser', [userAddress], 0n, 'User unbanned!');
  }, [executeTransaction]);

  const suspendCommunity = useCallback(async (communityId: number) => {
    return executeTransaction('suspendCommunity', [BigInt(communityId)], 0n, 'Community suspended!');
  }, [executeTransaction]);

  const reactivateCommunity = useCallback(async (communityId: number) => {
    return executeTransaction('reactivateCommunity', [BigInt(communityId)], 0n, 'Community reactivated!');
  }, [executeTransaction]);

  const setPlatformFeePercentage = useCallback(async (communityId: number, percentage: number) => {
    return executeTransaction('setPlatformFeePercentage', [BigInt(communityId), BigInt(percentage)], 0n, 'Platform fee updated!');
  }, [executeTransaction]);

  const setCreationFee = useCallback(async (fee: string) => {
    return executeTransaction('setCreationFee', [parseEther(fee)], 0n, 'Creation fee updated!');
  }, [executeTransaction]);

  const setUtilityBoxFee = useCallback(async (fee: string) => {
    return executeTransaction('setUtilityBoxFee', [parseEther(fee)], 0n, 'Utility box fee updated!');
  }, [executeTransaction]);

  const setAchievementUnlockFee = useCallback(async (fee: string) => {
    return executeTransaction('setAchievementUnlockFee', [parseEther(fee)], 0n, 'Achievement unlock fee updated!');
  }, [executeTransaction]);

  const setBoostPurchaseFee = useCallback(async (fee: string) => {
    return executeTransaction('setBoostPurchaseFee', [parseEther(fee)], 0n, 'Boost purchase fee updated!');
  }, [executeTransaction]);

  const setEventPlatformFee = useCallback(async (fee: string) => {
    return executeTransaction('setEventPlatformFee', [parseEther(fee)], 0n, 'Event platform fee updated!');
  }, [executeTransaction]);

  const setWithdrawalFeePercentage = useCallback(async (percentage: number) => {
    return executeTransaction('setWithdrawalFeePercentage', [BigInt(percentage)], 0n, 'Withdrawal fee percentage updated!');
  }, [executeTransaction]);

  const pausePlatform = useCallback(async () => {
    return executeTransaction('pause', [], 0n, 'Platform paused!');
  }, [executeTransaction]);

  const unpausePlatform = useCallback(async () => {
    return executeTransaction('unpause', [], 0n, 'Platform resumed!');
  }, [executeTransaction]);

  const emergencyWithdraw = useCallback(async (to: Address, amount: string) => {
    return executeTransaction('emergencyWithdraw', [to, parseEther(amount)], 0n, 'Emergency withdrawal completed!');
  }, [executeTransaction]);

  // User functions
  const createCommunity = useCallback(async (name: string, description: string, joinFee: string, monthlySubFee: string, lifetimeSubFee: string) => {
    const value = (contractData.creationFee ? parseEther(contractData.creationFee) : 0n);
    return executeTransaction(
      'createCommunity',
      [name, description, parseEther(joinFee.toString()), parseEther(monthlySubFee.toString()), parseEther(lifetimeSubFee.toString())],
      value,
      'Community created successfully!'
    );
  }, [executeTransaction, contractData.creationFee]);

  const joinCommunity = useCallback(async (communityId: number, lifetime: boolean, referrer: Address, value: bigint) => {
    return executeTransaction(
      'joinCommunity',
      [BigInt(communityId), lifetime, referrer],
      value,
      'Joining community...'
    );
  }, [executeTransaction]);

  const openUtilityBox = useCallback(async (communityId: number) => {
    const fee = contractData?.utilityBoxFee ? parseEther(contractData.utilityBoxFee) : 0n;
    if (fee === 0n) {
        throw new Error("Utility Box fee is not set or is zero.");
    }
    return executeTransaction('openUtilityBox', [communityId], fee, 'Opening Utility Box...');
  }, [executeTransaction, contractData?.utilityBoxFee]);

  const useAchievementVoucher = useCallback(async (achievementType: AchievementType) => {
    return executeTransaction('useAchievementVoucher', [achievementType], 0n, 'Using Achievement Voucher...');
  }, [executeTransaction]);

  const unlockPremiumAchievement = useCallback(async (achievementType: AchievementType) => {
    const fee = contractData?.achievementUnlockFee ? parseEther(contractData.achievementUnlockFee) : 0n;
    if (fee === 0n) {
        throw new Error("Achievement unlock fee is not set or is zero.");
    }
    return executeTransaction('unlockPremiumAchievement', [achievementType], fee, 'Unlocking Premium Achievement...');
  }, [executeTransaction, contractData?.achievementUnlockFee]);

  const purchaseBoost = useCallback(async (boostType: BoostType, durationHours: number) => {
    const baseFee = contractData?.boostPurchaseFee ? parseEther(contractData.boostPurchaseFee) : 0n;
    if (baseFee === 0n) {
        throw new Error("Boost purchase fee is not set or is zero.");
    }
    
    // Calculate dynamic pricing based on duration
    // Base fee * duration multiplier
    const durationMultiplier = Math.max(1, durationHours / 24); // Per day pricing
    const dynamicFee = (baseFee * BigInt(Math.ceil(durationMultiplier * 100))) / 100n;
    
    const durationSeconds = durationHours * 3600; // Convert hours to seconds
    return executeTransaction('purchaseBoost', [boostType, durationSeconds], dynamicFee, 'Purchasing Boost...');
  }, [executeTransaction, contractData?.boostPurchaseFee]);

  const activateBoost = useCallback(async (boostType: BoostType) => {
    return executeTransaction('activateBoost', [boostType], 0n, 'Activating Boost...');
  }, [executeTransaction]);

  // Community member management functions
  const banMember = useCallback(async (communityId: number, memberAddress: Address) => {
    return executeTransaction('banMember', [BigInt(communityId), memberAddress], 0n, 'Member banned from community!');
  }, [executeTransaction]);

  const unbanMember = useCallback(async (communityId: number, memberAddress: Address) => {
    return executeTransaction('unbanMember', [BigInt(communityId), memberAddress], 0n, 'Member unbanned from community!');
  }, [executeTransaction]);

  const setMemberRole = useCallback(async (communityId: number, memberAddress: Address, role: number) => {
    return executeTransaction('setMemberRole', [BigInt(communityId), memberAddress, BigInt(role)], 0n, 'Member role updated!');
  }, [executeTransaction]);

  // Daily activity function - uses becomeMentor as a way to update activity
  // In a real implementation, there would be a dedicated updateActivity function
  const updateDailyActivity = useCallback(async (communityId: number) => {
    try {
      // For now, we'll use the becomeMentor function call to trigger _updateMemberActivity
      // This is a workaround until we add a dedicated updateActivity function to the contract
      const memberDetails = await getMemberDetails(communityId, address as Address);
      
      if (memberDetails && memberDetails.level >= 3 && memberDetails.reputation >= 70) {
        // User can become mentor, which will update their activity
        return executeTransaction('becomeMentor', [BigInt(communityId)], 0n, 'Daily activity updated!');
      } else {
        // Alternative: open utility box to update activity (requires fee)
        const fee = contractData?.utilityBoxFee ? parseEther(contractData.utilityBoxFee) : 0n;
        if (fee > 0) {
          return executeTransaction('openUtilityBox', [BigInt(communityId)], fee, 'Daily activity updated via Utility Box!');
        } else {
          throw new Error('Cannot update daily activity - requirements not met and no utility box available');
        }
      }
    } catch (err) {
      console.error('Error updating daily activity:', err);
      throw err;
    }
  }, [executeTransaction, getMemberDetails, address, contractData?.utilityBoxFee]);

  // Computed values - with debugging
  console.log('🔍 Admin Check Debug:');
  console.log('User address:', address);
  console.log('Contract owner:', contractData.owner);
  console.log('Owner raw data:', owner);
  console.log('Address exists:', !!address);
  console.log('Owner exists:', !!contractData.owner);
  
  const isAdmin = !!(address && contractData.owner && 
    address.toLowerCase() === contractData.owner.toLowerCase());
  
  console.log('✅ Final isAdmin result:', isAdmin);

  const getAllCommunities = useCallback(() => {
    return communities;
  }, [communities]);

  // Get user's achievements
  const { data: userAchievementsRaw, refetch: refetchUserAchievements } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'userAchievements',
    args: [address],
    query: { enabled: !!address },
  });

  // Get user's boosts for all boost types
  const { data: experienceBoostRaw, refetch: refetchExperienceBoost } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'userBoosts',
    args: [address, BoostType.EXPERIENCE_MULTIPLIER],
    query: { enabled: !!address },
  });

  const { data: reputationBoostRaw, refetch: refetchReputationBoost } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'userBoosts',
    args: [address, BoostType.REPUTATION_MULTIPLIER],
    query: { enabled: !!address },
  });

  const { data: eventDiscountBoostRaw, refetch: refetchEventDiscountBoost } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'userBoosts',
    args: [address, BoostType.EVENT_DISCOUNT],
    query: { enabled: !!address },
  });

  // Get user's utility box items
  const { data: streakSaversCount, refetch: refetchStreakSavers } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'streakSavers',
    args: [address],
    query: { enabled: !!address },
  });

  const { data: achievementVouchersCount, refetch: refetchAchievementVouchers } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'achievementVouchers',
    args: [address],
    query: { enabled: !!address },
  });

  // RefetchAll function - defined after all refetch variables are available
  const refetchAll = useCallback(() => {
    refetchCommunityIdCounter();
    refetchCommunities();
    refetchPaused();
    refetchOwner();
    refetchCreationFee();
    refetchUtilityBoxFee();
    refetchAchievementUnlockFee();
    refetchBoostPurchaseFee();
    refetchEventPlatformFee();
    refetchWithdrawalFeePercentage();
    refetchDefaultPlatformFeePercentage();
    refetchMaxPlatformFeePercentage();
    // User data refetch
    refetchUserAchievements();
    refetchStreakSavers();
    refetchAchievementVouchers();
    refetchExperienceBoost();
    refetchReputationBoost();
    refetchEventDiscountBoost();
  }, [refetchCommunityIdCounter, refetchCommunities, refetchPaused, refetchOwner, refetchCreationFee, refetchUtilityBoxFee, refetchAchievementUnlockFee, refetchBoostPurchaseFee, refetchEventPlatformFee, refetchWithdrawalFeePercentage, refetchDefaultPlatformFeePercentage, refetchMaxPlatformFeePercentage, refetchUserAchievements, refetchStreakSavers, refetchAchievementVouchers, refetchExperienceBoost, refetchReputationBoost, refetchEventDiscountBoost]);

  // User data functions - using real contract data
  const getUserMembershipData = useCallback(async (communityId: number): Promise<CommunityMembership | null> => {
    if (!address || !publicClient) return null;
    
    try {
      // Check if user is active member first
      const isActiveMemberData = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'isActiveMember',
        args: [BigInt(communityId), address],
      });
      
      if (!isActiveMemberData) return null;
      
      // Get member details from contract
      const memberDetails = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getMemberDetails',
        args: [BigInt(communityId), address],
      });
      
      if (memberDetails && Array.isArray(memberDetails)) {
        const [level, respectPoints, reputation, currentStreak, longestStreak, 
               totalEventsParticipated, totalEventsWon, mentor, menteeCount] = memberDetails;
        
        return {
          communityId,
          level: Number(level),
          respectPoints: Number(respectPoints),
          reputation: Number(reputation),
          currentStreak: Number(currentStreak),
          longestStreak: Number(longestStreak),
          totalEventsParticipated: Number(totalEventsParticipated),
          totalEventsWon: Number(totalEventsWon),
          mentor: mentor as Address,
          menteeCount: Number(menteeCount)
        };
      }
      
      return null;
    } catch (err) {
      console.error('Error fetching user membership data:', err);
      return null;
    }
  }, [address, publicClient]);

  const getAllUserMemberships = useCallback(async (): Promise<CommunityMembership[]> => {
    if (!address || !contractData.communityIdCounter || !publicClient) {
      console.log('❌ Missing requirements for getAllUserMemberships:', { 
        address: !!address, 
        communityIdCounter: contractData.communityIdCounter, 
        publicClient: !!publicClient 
      });
      return [];
    }
    
    try {
      const memberships: CommunityMembership[] = [];
      
      console.log(`🔍 Sprawdzanie członkostwa w ${contractData.communityIdCounter - 1} społecznościach...`);
      
      // Iterować przez wszystkie społeczności i sprawdzić członkostwo użytkownika
      for (let i = 1; i < contractData.communityIdCounter; i++) {
        try {
          console.log(`📋 Sprawdzanie społeczności ${i}...`);
          
          // Sprawdzić czy użytkownik jest aktywnym członkiem tej społeczności
          const isActiveMemberData = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'isActiveMember',
            args: [BigInt(i), address],
          });
          
          console.log(`🤝 Community ${i} - isActiveMember:`, isActiveMemberData);
          
          if (isActiveMemberData) {
            // Pobrać szczegóły członkostwa
            const memberDetails = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'getMemberDetails',
              args: [BigInt(i), address],
            });
            
            console.log(`📊 Community ${i} - memberDetails:`, memberDetails);
            
            if (memberDetails && Array.isArray(memberDetails)) {
              const [level, respectPoints, reputation, currentStreak, longestStreak, 
                     totalEventsParticipated, totalEventsWon, mentor, menteeCount] = memberDetails;
              
              const membership = {
                communityId: i,
                level: Number(level),
                respectPoints: Number(respectPoints),
                reputation: Number(reputation),
                currentStreak: Number(currentStreak),
                longestStreak: Number(longestStreak),
                totalEventsParticipated: Number(totalEventsParticipated),
                totalEventsWon: Number(totalEventsWon),
                mentor: mentor as Address,
                menteeCount: Number(menteeCount)
              };
              
              console.log(`✅ Dodano członkostwo ${i}:`, membership);
              memberships.push(membership);
            }
          }
        } catch (err) {
          console.warn(`⚠️ Błąd podczas pobierania danych członkostwa dla społeczności ${i}:`, err);
          // Kontynuować z następną społecznością
        }
      }
      
      console.log(`🎉 Pobrano dane członkostwa dla ${memberships.length} społeczności:`, memberships);
      return memberships;
      
    } catch (err) {
      console.error('💥 Błąd podczas pobierania wszystkich członkostw użytkownika:', err);
      return [];
    }
  }, [address, contractData.communityIdCounter, publicClient]);

  const calculateUserStats = useCallback(async (): Promise<UserStats> => {
    if (!address) {
      return {
        totalRespectPoints: 0,
        totalCommunitiesJoined: 0,
        totalEventsAttended: 0,
        totalEthEarned: '0',
        averageCommunityLevel: 0,
        totalAchievements: 0
      };
    }

    try {
      const memberships = await getAllUserMemberships();
      
      const totalRespectPoints = memberships.reduce((sum, m) => sum + m.respectPoints, 0);
      const totalCommunitiesJoined = memberships.length;
      const totalEventsAttended = memberships.reduce((sum, m) => sum + m.totalEventsParticipated, 0);
      const totalEventsWon = memberships.reduce((sum, m) => sum + m.totalEventsWon, 0);
      
      // Calculate average level
      const averageCommunityLevel = totalCommunitiesJoined > 0 
        ? Math.round(memberships.reduce((sum, m) => sum + m.level, 0) / totalCommunitiesJoined)
        : 0;

      // Calculate ETH earned (rough estimate based on events won)
      // This is a simplified calculation - in reality, you'd need to track actual earnings
      const estimatedEthEarned = totalEventsWon * 0.001; // rough estimate
      
      // Get achievements count
      const achievementsCount = Array.isArray(userAchievementsRaw) ? userAchievementsRaw.length : 0;

      return {
        totalRespectPoints,
        totalCommunitiesJoined,
        totalEventsAttended,
        totalEthEarned: estimatedEthEarned.toString(),
        averageCommunityLevel,
        totalAchievements: achievementsCount
      };
    } catch (err) {
      console.error('Error calculating user stats:', err);
      return {
        totalRespectPoints: 0,
        totalCommunitiesJoined: 0,
        totalEventsAttended: 0,
        totalEthEarned: '0',
        averageCommunityLevel: 0,
        totalAchievements: 0
      };
    }
  }, [address, getAllUserMemberships, userAchievementsRaw]);

  // Auto-fetch user data when address changes
  useEffect(() => {
    if (address && contractData.communityIdCounter && publicClient) {
      console.log('🔄 Pobieranie danych użytkownika...', { 
        address, 
        communityCount: contractData.communityIdCounter 
      });
      
      setIsLoading(true);
      
      Promise.all([
        calculateUserStats(),
        getAllUserMemberships()
      ]).then(([stats, memberships]) => {
        console.log('✅ Dane użytkownika pobrane:', { stats, membershipsCount: memberships.length });
        setUserStats(stats);
        setUserMemberships(memberships);
      }).catch(err => {
        console.error('❌ Błąd podczas pobierania danych użytkownika:', err);
        setError(err.message);
      }).finally(() => {
        setIsLoading(false);
      });
    } else {
      setUserStats(null);
      setUserMemberships([]);
    }
  }, [address, contractData.communityIdCounter, publicClient, calculateUserStats, getAllUserMemberships]);

  return {
    // Contract data
    ...contractData,
    
    // Helper functions
    getCommunityDetails,
    getMemberDetails,
    isGloballyBanned,
    getAllCommunities,
    refetchAll,
    
    // User functions
    createCommunity,
    joinCommunity,
    openUtilityBox,
    useAchievementVoucher,
    unlockPremiumAchievement,
    purchaseBoost,
    activateBoost,
    
    // Member management functions
    banMember,
    unbanMember,
    setMemberRole,
    updateDailyActivity,
    
    // Admin functions
    globalBanUser,
    globalUnbanUser,
    suspendCommunity,
    reactivateCommunity,
    pausePlatform,
    unpausePlatform,
    emergencyWithdraw,
    setCreationFee,
    setUtilityBoxFee,
    setAchievementUnlockFee,
    setBoostPurchaseFee,
    setEventPlatformFee,
    setWithdrawalFeePercentage,
    setPlatformFeePercentage,
    
    // State
    isLoading: isLoading || isConfirming,
    error: error || writeError?.message,
    address,
    isConnected: !!address,
    isAdmin,
    
    // Transaction status
    hash,
    isConfirming,
    isConfirmed,
    
    // Constants
    CONTRACT_ADDRESS,
    CONTRACT_ABI,
    
    // Communities data
    communities,
    
    // Utilities
    formatEther,
    parseEther,
    
    // Enums
    CommunityStatus,
    MemberRole,
    Permission,
    PermissionCategory,
    getPermissionCategory,
    getPermissionDisplayName,
    getPermissionDescription,
    getDefaultPermissions,
    
    // User data
    userStats,
    userMemberships,
    
    // User data functions
    getUserMembershipData,
    getAllUserMemberships,
    calculateUserStats,
    
      // Utility box data
  streakSaversCount: Number(streakSaversCount || 0),
  achievementVouchersCount: Number(achievementVouchersCount || 0),
  
  // User achievements data
  userAchievements: mapContractAchievements((userAchievementsRaw as bigint[]) || []),
  
  // User boosts data
  userBoosts: mapContractBoosts([
    experienceBoostRaw,
    reputationBoostRaw,
    eventDiscountBoostRaw
  ].filter(Boolean)),
  };
} 