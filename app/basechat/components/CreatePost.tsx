'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import BanRestriction from '../../admin/components/BanRestriction';
import TransactionButton from '../../components/TransactionButton';
import MusicSelector from './MusicSelector';
import SpotifyTrackCard from './SpotifyTrackCard';

export default function CreatePost() {
  const [content, setContent] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<any>(null);
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const { address } = useAccount();
  const optionsRef = useRef<HTMLDivElement>(null);

  // Close options menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleStandardPost = async () => {
    if (!content.trim()) return;
    
    try {
      console.log('Creating standard post...', { hasMusic: !!selectedMusic });
      const response = await fetch('/api/posts/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          musicTrack: selectedMusic, // Dodaj dane muzyki
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', response.status, errorText);
        throw new Error('Failed to create post');
      }

      console.log('Post created successfully!');
      setContent('');
      setSelectedMusic(null); // Wyczyść wybraną muzykę
      setShowOptions(false);
    } catch (error) {
      console.error('Error creating post:', error);
    }
  };

  const handlePostZora = () => {
    console.log('Creating Zora post with content:', content);
    // Calling parent's handleCreatePost function via props would happen here
    setShowOptions(false);
    
    // Event to notify parent that the Zora token creation was requested
    const event = new CustomEvent('zoraPostRequested', { detail: { content } });
    document.dispatchEvent(event);
  };

  const handleTransactionSuccess = (txHash: string) => {
    console.log('Transaction successful with hash:', txHash);
    setContent('');
    setSelectedMusic(null); // Wyczyść wybraną muzykę
    setShowOptions(false);
  };

  const handleSelectMusic = (track: any) => {
    setSelectedMusic(track);
    console.log('🎵 Selected music track:', track.name, 'by', track.artists.map((a: any) => a.name).join(', '));
  };

  const handleRemoveMusic = () => {
    setSelectedMusic(null);
  };

  if (!address) {
    return null;
  }

  return (
    <BanRestriction
      fallback={
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
          <div className="text-red-500 dark:text-red-400 text-center">
            You cannot create new posts because your account has been banned
          </div>
        </div>
      }
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            rows={3}
          />

          {/* Selected Music Preview */}
          {selectedMusic && (
            <div className="mt-3 border border-green-300 dark:border-green-600 rounded-lg p-3 bg-green-50 dark:bg-green-900/20">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-green-800 dark:text-green-300">
                  🎵 Attached Track
                </h4>
                <button
                  onClick={handleRemoveMusic}
                  className="text-red-500 hover:text-red-700 text-sm"
                  title="Remove track"
                >
                  ✕
                </button>
              </div>
              <SpotifyTrackCard
                trackData={{ track: selectedMusic }}
                isCompact={true}
                showAudioPlayer={false}
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-3 flex items-center justify-between">
            {/* Music Button */}
            <button
              type="button"
              onClick={() => setShowMusicSelector(true)}
              className="px-3 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center"
              title="Add track from Spotify"
            >
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 6L12 10l-3.5-2v4L12 14l3.5-2V8z"/>
              </svg>
              {selectedMusic ? 'Change Track' : 'Add Track'}
            </button>
            
            <div className="flex justify-end">
            <div ref={optionsRef} className="relative">
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center"
                disabled={!content.trim()}
              >
                Post
                <svg
                  className={`ml-1 w-4 h-4 transition-transform ${showOptions ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showOptions && content.trim() && (
                <div className="absolute z-10 right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={handleStandardPost}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Standard Post
                  </button>
                  
                  <div className="w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <TransactionButton 
                      content={content}
                      onTransactionSuccess={handleTransactionSuccess}
                      disabled={!content.trim()}
                      autoPost={true}
                    />
                  </div>
                  
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={handlePostZora}
                  >
                    <img 
                      src="/zora.png" 
                      alt="Zora Logo" 
                      className="w-4 h-4 mr-2"
                    />
                    Zora Token
                  </button>
                </div>
              )}
            </div>
          </div>
          </div> {/* Zamknij Action Buttons container */}
        </div>

        {/* Music Selector Modal */}
        <MusicSelector
          isOpen={showMusicSelector}
          onClose={() => setShowMusicSelector(false)}
          onSelectTrack={handleSelectMusic}
        />
      </div>
    </BanRestriction>
  );
} 