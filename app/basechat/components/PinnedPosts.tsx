'use client';

import React, { useState, useEffect, useCallback, memo } from 'react';
import { useAccount } from 'wagmi';
import PostList, { ExtendedPost } from './PostList';
import { fetchPinnedPosts } from '../../utils/firebase';

interface PinnedPostsProps {
  displayUserName: (userAddress: string, elementId: string, showAvatar?: boolean) => JSX.Element;
  userNames: {[key: string]: {name: string, avatar?: string}};
}

function PinnedPosts({ 
  displayUserName, 
  userNames
}: PinnedPostsProps) {
  const [pinnedPosts, setPinnedPosts] = useState<ExtendedPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { address } = useAccount();

  const loadPinnedPosts = useCallback(async () => {
    try {
      console.log('🔄 PinnedPosts: Rozpoczynam ładowanie przypiętych postów...');
      setIsLoading(true);
      // Bezpośrednio pobierz tylko przypięte posty
      const pinnedPosts = await fetchPinnedPosts();
      
      console.log(`📌 PinnedPosts: Otrzymano ${pinnedPosts.length} przypiętych postów:`, pinnedPosts);
      setPinnedPosts(pinnedPosts);
    } catch (error) {
      console.error('❌ PinnedPosts: Błąd podczas ładowania przypiętych postów:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);  // Nie ma zależności zewnętrznych

  useEffect(() => {
    loadPinnedPosts();
  }, [address, loadPinnedPosts]);

  const handleRefreshPinnedPosts = useCallback(async (newPosts?: ExtendedPost[]) => {
    if (newPosts) {
      // Optymistyczna aktualizacja - używamy przekazanych postów
      const pinned = newPosts.filter((post: ExtendedPost) => post.isPinned);
      
      // Sortuj przypięte posty według czasu przypięcia (najnowsze pierwsze)
      pinned.sort((a: ExtendedPost, b: ExtendedPost) => {
        const aPinnedAt = a.pinnedAt || 0;
        const bPinnedAt = b.pinnedAt || 0;
        return bPinnedAt - aPinnedAt;
      });
      
      setPinnedPosts(pinned);
    } else {
      // Tylko gdy nie mamy nowych postów, odświeżamy z Firebase
      await loadPinnedPosts();
    }
  }, [loadPinnedPosts]);

  const handleRefreshClick = useCallback(() => {
    handleRefreshPinnedPosts(); // Bez parametrów - odświeżenie z Firebase
  }, [handleRefreshPinnedPosts]);

  if (pinnedPosts.length === 0 && !isLoading) {
    console.log('🚫 PinnedPosts: Nie wyświetlam sekcji - brak przypiętych postów i nie ładuję');
    return null; // Nie pokazuj sekcji jeśli nie ma przypiętych postów
  }

  console.log(`🎯 PinnedPosts: Wyświetlam sekcję z ${pinnedPosts.length} postami, isLoading: ${isLoading}`);

  return (
    <div className="mb-6">
      {/* Header sekcji przypiętych postów */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center shadow-lg">
            <svg 
              className="w-4 h-4 text-white drop-shadow-md"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold bg-gradient-to-r from-yellow-600 to-orange-600 text-transparent bg-clip-text">
            Pinned Posts
          </h2>
          <div className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-1 rounded-full font-medium">
            {pinnedPosts.length}
          </div>
        </div>
        
        <button
          onClick={handleRefreshClick}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center space-x-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* Gradient border wrapper */}
      <div className="bg-gradient-to-r from-yellow-200 via-orange-200 to-yellow-200 dark:from-yellow-600/20 dark:via-orange-600/20 dark:to-yellow-600/20 p-0.5 rounded-xl">
        <div className="bg-white dark:bg-gray-800 rounded-xl">
          {isLoading ? (
            <div className="p-4">
              <div className="animate-pulse space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/6"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                </div>
              </div>
            </div>
          ) : (
            <PostList
              showOnlyUserPosts={false}
              searchTerm=""
              sortOrder="newest"
              selectedTag=""
              selectedAuthor=""
              onRefreshPosts={handleRefreshPinnedPosts}
              displayUserName={displayUserName}
              userNames={userNames}
              posts={pinnedPosts}
              isLoading={false}
              disableInfiniteScroll={true}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(PinnedPosts);