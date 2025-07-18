import { ExtendedPost } from '../../components/PostList';

/**
 * Mock pinned post data dla testowania PinTimer
 * Możesz dodać to do posts state w BaseChat dla testów
 */
export const createMockPinnedPost = (currentUserId?: string): ExtendedPost => {
  const mockPost: ExtendedPost = {
    id: 'mock-pinned-' + Date.now(),
    author: '0x7476c2Ee2E79e70bdabA30D0eD0ADe6e7bB3bfb3', // Różny od current user
    content: '🚀 This is a MOCK pinned post with live timer! Watch the countdown and see the progress bar change colors as time runs out. Timer updates every second!',
    timestamp: Date.now() - (60 * 60 * 1000), // 1 hour ago
    likes: 42,
    likedBy: [],
    comments: [],
    tags: ['test', 'pinned', 'mock'],
    mentions: [],
    visibility: 'public',
    txHash: '0x' + Math.random().toString(16).substr(2, 64),
    network: 'base',
    
    // Paid pin fields - aktywny pin na 15 minut
    isPinned: true,
    isPaidPin: true,
    pinnedAt: Date.now(),
    pinExpiresAt: Date.now() + (15 * 60 * 1000), // 15 minutes from now
    pinDuration: 'HOURS_6',
    pinOwner: '0x7476c2Ee2E79e70bdabA30D0eD0ADe6e7bB3bfb3',
    pinAmountPaid: '0.002',
    pinTxHash: '0x' + Math.random().toString(16).substr(2, 64)
  };

  return mockPost;
};

/**
 * Mock expired pinned post dla testowania cleanup
 */
export const createMockExpiredPost = (): ExtendedPost => {
  const mockPost: ExtendedPost = {
    id: 'mock-expired-' + Date.now(),
    author: '0x8586c2Ee2E79e70bdabA30D0eD0ADe6e7bB3bfb4',
    content: '⏰ This mock post was pinned but the timer expired. It should be cleaned up automatically.',
    timestamp: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
    likes: 23,
    likedBy: [],
    comments: [],
    tags: ['expired', 'test'],
    mentions: [],
    visibility: 'public',
    txHash: '0x' + Math.random().toString(16).substr(2, 64),
    network: 'base',
    
    // Expired paid pin
    isPinned: true,
    isPaidPin: true,
    pinnedAt: Date.now() - (60 * 60 * 1000), // 1 hour ago
    pinExpiresAt: Date.now() - (5 * 60 * 1000), // Expired 5 minutes ago
    pinDuration: 'HOUR_1',
    pinOwner: '0x8586c2Ee2E79e70bdabA30D0eD0ADe6e7bB3bfb4',
    pinAmountPaid: '0.0005',
    pinTxHash: '0x' + Math.random().toString(16).substr(2, 64)
  };

  return mockPost;
};

/**
 * Helper do dodawania mock posts do existing posts array
 */
export const addMockPinnedPosts = (existingPosts: ExtendedPost[], userId?: string): ExtendedPost[] => {
  const mockPinned = createMockPinnedPost(userId);
  
  // Dodaj na górę listy
  return [mockPinned, ...existingPosts];
};

/**
 * Helper do usuwania mock posts (po id prefix)
 */
export const removeMockPosts = (posts: ExtendedPost[]): ExtendedPost[] => {
  return posts.filter(post => !post.id.startsWith('mock-'));
}; 