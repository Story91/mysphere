export type PostVisibility = 'public' | 'followers' | 'private';

export interface Post {
  id: string;
  author: string;
  authorName?: string;
  content: string;
  timestamp: number;
  image?: string | null;
  video?: string | null;
  likes: number;
  likedBy: string[];
  comments: Comment[];
  tags?: string[];
  mentions?: string[];
  visibility?: PostVisibility;
  pollId?: string;
  txHash?: string;
  zoraCoinAddress?: string;
  lastEdited?: any;
  network?: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood';
  isPinned?: boolean;
  pinnedAt?: number;
  pinnedBy?: string;
  // 🚀 Paid Pin fields
  isPaidPin?: boolean;
  pinExpiresAt?: number;
  pinDuration?: string;
  pinOwner?: string;
  pinAmountPaid?: string;
  pinTxHash?: string;
  // 💰 Tip-to-unlock: wszystkie pola OPCJONALNE, wiec istniejace posty bez nich
  // renderuja sie dokladnie jak dotad. Szczegoly: app/utils/monetization/types.ts
  /**
   * Znacznik, ze post ma platna czesc. Sama tresc NIE jest w dokumencie posta -
   * wydaje ja GET /api/premium po sprawdzeniu sesji i odblokowania.
   */
  hasPremium?: boolean;
  /**
   * ZGODNOSC WSTECZ: posty sprzed przeniesienia tresci do osobnej kolekcji maja
   * ja tutaj, wiec jest publiczna. Nowe posty tego pola nie zapisuja.
   */
  premiumContent?: string;
  /** Cena odblokowania jako string dziesietny, np. "0.5". */
  unlockPrice?: string;
  /** Token ceny. Brak = USDC (domyslny, bo w pelni weryfikowalny na serwerze). */
  unlockToken?: 'ETH' | 'USDC';
  // 🎵 Music attachment field
  musicTrack?: {
    id: string;           // Spotify track ID
    name: string;         // Nazwa utworu
    artists: Array<{      // Artyści
      name: string;
      external_urls?: {
        spotify: string;
      };
    }>;
    album: {              // Album
      name: string;
      images?: Array<{
        url: string;
        height: number;
        width: number;
      }>;
      external_urls?: {
        spotify: string;
      };
      release_date?: string;
      release_date_precision?: string;
    };
    duration_ms: number;  // Długość utworu
    popularity?: number;  // Popularność (0-100)
    preview_url?: string; // URL do podglądu (30 sek)
    external_urls?: {     // Link do Spotify
      spotify: string;
    };
  };
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
  txHash?: string | null;
  network?: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood';
  tip?: {
    amount: number;
    currency: string;
  };
  replies?: Comment[];
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
  socialLinks?: {
    twitter?: string;
    farcaster?: string;
    discord?: string;
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