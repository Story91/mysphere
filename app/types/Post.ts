export interface Post {
  id: string;
  author: string;
  content: string;
  timestamp: number;
  image?: string | null;
  video?: string | null;
  likes: number;
  likedBy?: string[];
  comments: Comment[];
  tags?: string[];
  mentions?: string[];
  visibility?: 'public' | 'followers' | 'private';
} 