'use client';

import { useState, useEffect } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';

// Twitter/Camp Network API types
interface TwitterUser {
  id: string;
  displayName: string;
  userHandle: string;
  profileBio: string;
  profilePictureUrl: string;
  isVerified: boolean;
  isBlueVerified: boolean;
  followerCount: number;
  followingCount: number;
  likeCount: number;
  location: string;
}

interface TwitterTweet {
  id: string;
  tweetText: string;
  tweetTimestamp: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  isReTweet: boolean;
}

interface TwitterProfileSectionProps {
  userAddress: string;
}

export default function TwitterProfileSection({ userAddress }: TwitterProfileSectionProps) {
  const [twitterUser, setTwitterUser] = useState<TwitterUser | null>(null);
  const [twitterTweets, setTwitterTweets] = useState<TwitterTweet[]>([]);
  const [loadingTwitterData, setLoadingTwitterData] = useState(false);
  const [isTwitterSectionExpanded, setIsTwitterSectionExpanded] = useState(false);

  // Fetch Twitter data from Camp Network
  const fetchTwitterData = async (address: string) => {
    if (!address) return null;
    
    try {
      const response = await fetch(`/api/camp/twitter?address=${encodeURIComponent(address)}&direct=true`);
      
      if (!response.ok) {
        console.warn(`Twitter API returned ${response.status} for address ${address}`);
        return null;
      }
      
      const data = await response.json();
      
      if (data.error) {
        console.warn('Twitter API error:', data.error);
        return null;
      }
      
      return data.data;
    } catch (error) {
      console.error('Error fetching Twitter data:', error);
      return null;
    }
  };

  // Fetch Twitter data
  useEffect(() => {
    const fetchTwitterDataEffect = async () => {
      if (!userAddress) return;
      
      setLoadingTwitterData(true);
      try {
        const twitterData = await fetchTwitterData(userAddress);
        
        if (twitterData && twitterData.twitterUser) {
          setTwitterUser(twitterData.twitterUser);
          setTwitterTweets(twitterData.tweets || []);
        } else {
          setTwitterUser(null);
          setTwitterTweets([]);
        }
      } catch (error) {
        console.error('Error fetching Twitter data:', error);
        setTwitterUser(null);
        setTwitterTweets([]);
      } finally {
        setLoadingTwitterData(false);
      }
    };

    fetchTwitterDataEffect();
  }, [userAddress]);

  // Don't render if no data and not loading
  if (!twitterUser && !loadingTwitterData) {
    return null;
  }

  return (
    <div className="mb-4">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-sky-900 via-blue-800 to-blue-900 border border-sky-700/50 backdrop-blur-xl shadow-xl">
        {/* Twitter blue poświata */}
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-sky-400/30 rounded-full filter blur-2xl animate-pulse"></div>
        <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-blue-400/20 rounded-full filter blur-xl"></div>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent"></div>
        
        {/* Efekt szkła */}
        <div className="absolute inset-0 bg-white/5 backdrop-blur-sm"></div>
        
        <div className="relative z-10 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-sky-400/20 to-blue-500/20 backdrop-blur-sm border border-sky-400/30 mr-3 shadow-lg">
                <svg className="w-4 h-4 text-sky-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </div>
            </div>
            
            {twitterUser?.isVerified && (
              <div className="flex items-center bg-sky-400/10 backdrop-blur-sm border border-sky-400/30 px-2 py-1 rounded-full">
                <svg className="w-3 h-3 text-sky-400 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span className="text-xs text-sky-400 font-medium">Verified</span>
              </div>
            )}
          </div>
          
          {loadingTwitterData ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-400/30 border-t-sky-400"></div>
              <span className="ml-3 text-sky-400/80 text-sm">Loading Twitter data...</span>
            </div>
          ) : twitterUser ? (
            <div>
              {/* Twitter User Info */}
              <div className="flex items-start space-x-3 mb-4">
                <img
                  src={twitterUser.profilePictureUrl}
                  alt={`${twitterUser.displayName} avatar`}
                  className="w-12 h-12 rounded-full border-2 border-sky-400/30"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <h4 className="text-base font-medium text-white truncate">{twitterUser.displayName}</h4>
                    <a
                      href={`https://x.com/${twitterUser.userHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:text-sky-300 text-sm font-mono bg-sky-400/10 px-2 py-0.5 rounded transition-colors"
                    >
                      @{twitterUser.userHandle}
                    </a>
                  </div>
                  {twitterUser.profileBio && (
                    <p className="text-gray-300 text-xs leading-relaxed mb-2" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>{twitterUser.profileBio}</p>
                  )}
                  {twitterUser.location && (
                    <div className="flex items-center text-gray-400 text-xs mb-2">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {twitterUser.location}
                    </div>
                  )}
                </div>
              </div>

              {/* Twitter Stats */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center bg-white/5 backdrop-blur-sm rounded-lg p-2 border border-white/10">
                  <div className="text-sky-400 text-lg font-light">{twitterUser.followerCount.toLocaleString()}</div>
                  <div className="text-gray-300 text-xs">Followers</div>
                </div>
                <div className="text-center bg-white/5 backdrop-blur-sm rounded-lg p-2 border border-white/10">
                  <div className="text-sky-400 text-lg font-light">{twitterUser.followingCount.toLocaleString()}</div>
                  <div className="text-gray-300 text-xs">Following</div>
                </div>
                <div className="text-center bg-white/5 backdrop-blur-sm rounded-lg p-2 border border-white/10">
                  <div className="text-sky-400 text-lg font-light">{twitterUser.likeCount.toLocaleString()}</div>
                  <div className="text-gray-300 text-xs">Likes</div>
                </div>
              </div>

              {/* Expandable Recent Tweets */}
              {twitterTweets.length > 0 && (
                <>
                  <button
                    onClick={() => setIsTwitterSectionExpanded(!isTwitterSectionExpanded)}
                    className="w-full flex items-center justify-center text-sky-400 hover:text-sky-300 transition-colors duration-300 border-t border-sky-700/30 pt-3"
                  >
                    <span className="text-sm font-medium mr-2">
                      {isTwitterSectionExpanded ? 'Hide Recent Tweets' : `Show Recent Tweets (${twitterTweets.length})`}
                    </span>
                    {isTwitterSectionExpanded ? (
                      <ChevronUpIcon className="w-4 h-4" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </button>

                  {/* Recent Tweets */}
                  {isTwitterSectionExpanded && (
                    <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                      {twitterTweets.slice(0, 3).map((tweet) => (
                        <div key={tweet.id} className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                          <p className="text-gray-200 text-sm leading-relaxed mb-2 line-clamp-3">{tweet.tweetText}</p>
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>{new Date(tweet.tweetTimestamp).toLocaleDateString()}</span>
                            <div className="flex items-center space-x-3">
                              <span className="flex items-center">
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                                {tweet.likeCount}
                              </span>
                              <span className="flex items-center">
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                {tweet.replyCount}
                              </span>
                              <span className="flex items-center">
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {tweet.retweetCount}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="text-gray-400 text-sm">
                No Twitter data available for this wallet address
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}