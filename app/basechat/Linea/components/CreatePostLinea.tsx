'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import BanRestriction from '../../../admin/components/BanRestriction';
import TransactionButtonLinea from './TransactionButtonLinea';
import { createPost } from '../../../utils/firebase';
import { put } from '@vercel/blob';
import { toast } from 'react-hot-toast';
import { Avatar } from '@coinbase/onchainkit/identity';
import MusicSelector from '../../components/MusicSelector';
import SpotifyTrackCard from '../../components/SpotifyTrackCard';
import AIButton from '../../components/AIButton';

interface CreatePostLineaProps {
  onPostCreated?: () => Promise<void>;
  setShowAIModal?: (show: boolean) => void;
  aiGeneratedContent?: string;
  onAiContentUsed?: () => void;
}

export default function CreatePostLinea({ 
  onPostCreated, 
  setShowAIModal, 
  aiGeneratedContent, 
  onAiContentUsed 
}: CreatePostLineaProps) {
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [postPreviewImage, setPostPreviewImage] = useState<string | null>(null);
  const [postPreviewVideo, setPostPreviewVideo] = useState<string | null>(null);
  const [selectedMusic, setSelectedMusic] = useState<any>(null);
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { address } = useAccount();

  // Update content when AI generates new content
  useEffect(() => {
    if (aiGeneratedContent) {
      setContent(aiGeneratedContent);
      // Call callback to clear the AI content after using it
      if (onAiContentUsed) {
        onAiContentUsed();
      }
    }
  }, [aiGeneratedContent, onAiContentUsed]);

  // Handle file selection for media upload
  const handlePostFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    
    const file = e.target.files[0];
    const fileType = file.type;
    
    // Check if file is too large (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Please select a file under 5MB.");
      return;
    }
    
    // Create a preview
    const reader = new FileReader();
    reader.onload = (event) => {
      if (!event.target) return;
      
      if (fileType.startsWith('image/')) {
        setPostPreviewImage(event.target.result as string);
        setPostPreviewVideo(null);
      } else if (fileType.startsWith('video/')) {
        setPostPreviewVideo(event.target.result as string);
        setPostPreviewImage(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Spotify music selection
  const handleSelectMusic = (track: any) => {
    setSelectedMusic(track);
    console.log('🎵 Selected music track for Linea:', track.name, 'by', track.artists.map((a: any) => a.name).join(', '));
  };

  const handleRemoveMusic = () => {
    setSelectedMusic(null);
  };

  // Handle the transaction success from the blockchain
  const handleTransactionSuccess = async (txHash: string) => {
    if (!address) return;
    
    setIsSaving(true);
    const toastId = toast.loading("Saving your Linea Network post...");
    
    try {
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;

      // Handle media upload (image or video) - same as other networks
      if (postPreviewImage || postPreviewVideo) {
        setUploadProgress(0);
        const mediaContent = postPreviewImage || postPreviewVideo;
        if (!mediaContent) throw new Error('No media content');

        const base64Response = await fetch(mediaContent);
        const blob = await base64Response.blob();

        const isVideo = postPreviewVideo !== null;
        const fileExtension = isVideo ? (blob.type.split('/')[1] || 'mp4') : (blob.type.split('/')[1] || 'jpg');
        
        const fileName = `linea-post-media-${Date.now()}.${fileExtension}`;

        const formData = new FormData();
        formData.append('file', blob, fileName);

        const response = await fetch('/api/upload', { method: 'POST', body: formData });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to upload media: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        if (isVideo) {
          videoUrl = data.url;
        } else {
          imageUrl = data.url;
        }
        setUploadProgress(100);
      }
      
      // Extract hashtags and mentions
      const tags = Array.from(new Set((content.match(/#(\w+)/g) || []).map(tag => tag.slice(1))));
      const mentions = Array.from(new Set((content.match(/@(\w+)/g) || []).map(mention => mention.slice(1))));
      
      // Save post to Firebase and get the new post's ID
      const newPostId = await createPost({
        author: address,
        content: content,
        timestamp: Date.now(),
        tags: tags,
        mentions: mentions,
        visibility: 'public',
        txHash: txHash,
        network: 'linea', // Mark as a Linea network post
        image: imageUrl,
        video: videoUrl,
        musicTrack: selectedMusic // Add Spotify track data
      });
      
      console.log(`🎉 New Linea post created with Firebase ID: ${newPostId}`);

      // Dispatch a global event with the new post data
      const newPostData = {
        id: newPostId,
        author: address,
        content: content,
        timestamp: Date.now(),
        tags: tags,
        mentions: mentions,
        visibility: 'public',
        txHash: txHash,
        network: 'linea',
        image: imageUrl,
        video: videoUrl,
        musicTrack: selectedMusic,
        likes: 0,
        likedBy: [],
        comments: []
      };

      // Dispatch custom event for real-time updates
      window.dispatchEvent(new CustomEvent('newPost', { detail: newPostData }));

      toast.dismiss(toastId);
      toast.success('Post saved to Linea Network!');
      
      // Clear form
      setContent('');
      setPostPreviewImage(null);
      setPostPreviewVideo(null);
      setSelectedMusic(null);
      setUploadProgress(0);
      
      // Call parent callback
      if (onPostCreated) {
        await onPostCreated();
      }
      
    } catch (error) {
      console.error('Error saving Linea post:', error);
      toast.dismiss(toastId);
      toast.error('Failed to save post to database: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  // Remove selected media
  const removeSelectedMedia = () => {
    setPostPreviewImage(null);
    setPostPreviewVideo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleShowAIModal = () => {
    // Use direct function call instead of CustomEvent
    if (setShowAIModal) {
      setShowAIModal(true);
    }
  };

  return (
    <BanRestriction 
      fallback={
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 border border-blue-200">
          <div className="text-red-500 dark:text-red-400 text-center">
            You cannot create new posts because your account has been banned
          </div>
        </div>
      }
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 relative overflow-hidden">
        {/* Linea logo w tle */}
        <div className="absolute top-4 right-4 opacity-5 pointer-events-none">
          <img 
            src="/Logomark Blue BG.svg" 
            alt="Linea Background" 
            className="w-16 h-16"
          />
        </div>
        <div className="flex items-center space-x-3 mb-4 relative z-10">
          <Avatar address={address} className="w-10 h-10 rounded-full" />
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening on Linea? Drop your current Spotify vibe and share what's on your mind!"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
              rows={3}
              maxLength={500}
              disabled={isSaving}
            />
          </div>
        </div>
              
        {/* Media preview */}
        {(postPreviewImage || postPreviewVideo) && (
          <div className="mb-4 relative">
            {postPreviewImage ? (
              <img
                src={postPreviewImage}
                alt="Preview"
                className="max-h-60 rounded-lg object-cover"
              />
            ) : postPreviewVideo && (
              <video
                src={postPreviewVideo}
                className="max-h-60 rounded-lg w-full"
                controls
              >
                Your browser does not support video playback.
              </video>
            )}
            <button
              onClick={removeSelectedMedia}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="absolute bottom-2 left-2 right-2">
                <div className="bg-white/90 backdrop-blur-sm rounded-lg p-2">
                  <div className="bg-gray-200 rounded-full h-1">
                    <div 
                      className="bg-orange-500 h-1 rounded-full transition-all duration-300" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Uploading... {uploadProgress}%</p>
                </div>
              </div>
            )}

        
        {selectedMusic && (
          <div className="mb-4 border border-green-300 dark:border-green-600 rounded-lg p-3 bg-green-50 dark:bg-green-900/20">
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

        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1 sm:space-x-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 text-xs sm:text-sm bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              title="Add photo or video"
              disabled={isSaving}
            >
              <span className="text-lg">📷</span>
              <span className="hidden sm:inline font-medium text-blue-600 dark:text-blue-400">Photo</span>
            </button>

            <button 
              onClick={() => setShowMusicSelector(true)}
              className="flex items-center space-x-1 sm:space-x-2 text-gray-500 hover:text-green-600 dark:hover:text-green-400 text-xs sm:text-sm bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
              title="Add track from Spotify"
              disabled={isSaving}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              <span className="hidden sm:inline font-medium text-green-600 dark:text-green-400">
                {selectedMusic ? 'Change Track' : 'Spotify'}
              </span>
            </button>

            {setShowAIModal && (
              <AIButton
                onClick={handleShowAIModal}
                disabled={isSaving}
              />
            )}
          </div>
          
          <div className="mt-3 flex justify-end">
            <TransactionButtonLinea
              content={content}
              onTransactionSuccess={handleTransactionSuccess}
              disabled={!content.trim() || isSaving}
              autoPost={true}
              onPostAdded={onPostCreated}
            />
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handlePostFileSelect}
          className="hidden"
        />

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