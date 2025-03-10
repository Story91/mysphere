export interface Post {
  id: string;
  author: string;
  authorName?: string;
  content: string;
  timestamp: number;
  image?: string | null;
  video?: string;
  likes: number;
  likedBy: string[];
  comments: Comment[];
  tags?: string[];
  mentions?: string[];
  visibility?: 'public' | 'followers' | 'private';
  pollId?: string;
  txHash?: string;
}

export interface Comment {
  id: string;
  postId: string;
  author: string;
  authorName?: string;
  content: string;
  timestamp: number;
  likes: number;
  likedBy: string[];
  mentions: string[];
  replyTo?: string;
  txHash?: string;
  tip?: {
    amount: number;
    currency: string;
  };
}

export interface UserProfile {
  name?: string;
  avatar?: string;
  postsCount?: number;
  likesReceived?: number;
  address?: string;
  joinedAt?: number;
  lastActive?: number;
  id?: string;
  bio?: string;
  stats?: {
    posts: number;
    likes: number;
    comments: number;
  };
}

export interface Stats {
  transactions: number;
  tokens: number;
  nfts: number;
  contracts: number;
  transactionPoints: number;
  tokenPoints: number;
  nftPoints: number;
  contractPoints: number;
}

export interface Notification {
  id: string;
  type: 'LIKE' | 'COMMENT' | 'MENTION' | 'FOLLOW';
  fromUser: string;
  postId?: string;
  commentId?: string;
  timestamp: number;
  read: boolean;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: number;
  type: 'achievement' | 'rank' | 'special';
}

export interface HashtagTrend {
  tag: string;
  postsCount: number;
  weeklyGrowth: number;
  lastUpdated: number;
} 