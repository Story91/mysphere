'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import BanRestriction from '../../../admin/components/BanRestriction';
import TransactionButtonBaseCamp from './TransactionButtonBaseCamp';
import { createPost } from '../../../utils/firebase';
import { put } from '@vercel/blob';
import { toast } from 'react-hot-toast';
import { Avatar } from '@coinbase/onchainkit/identity';

interface CreatePostBaseCampProps {
  onPostCreated?: () => Promise<void>;
  setShowAIModal?: (show: boolean) => void;
  aiGeneratedContent?: string;
  onAiContentUsed?: () => void;
}

export default function CreatePostBaseCamp({ onPostCreated, setShowAIModal, aiGeneratedContent, onAiContentUsed }: CreatePostBaseCampProps) {
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [postPreviewImage, setPostPreviewImage] = useState<string | null>(null);
  const [postPreviewVideo, setPostPreviewVideo] = useState<string | null>(null);
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

  // Handle the transaction success from the blockchain
  const handleTransactionSuccess = async (txHash: string) => {
    if (!address) return;
    
    setIsSaving(true);
    const toastId = toast.loading("Saving your Camp Network post...");
    
    try {
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;

      // Handle media upload (image or video) - same as Base network
      if (postPreviewImage || postPreviewVideo) {
        setUploadProgress(0);
        const mediaContent = postPreviewImage || postPreviewVideo;
        if (!mediaContent) throw new Error('No media content');

        const base64Response = await fetch(mediaContent);
        const blob = await base64Response.blob();

        const isVideo = postPreviewVideo !== null;
        const fileExtension = isVideo ? (blob.type.split('/')[1] || 'mp4') : (blob.type.split('/')[1] || 'jpg');
        const fileName = `basecamp-post-media-${Date.now()}.${fileExtension}`;

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
        network: 'basecamp', // Mark as a BaseCamp network post
        image: imageUrl,
        video: videoUrl
      });
      
      console.log(`🎉 New post created with Firebase ID: ${newPostId}`);

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
        network: 'basecamp',
        image: imageUrl,
        video: videoUrl,
        likes: 0,
        comments: []
      };
      document.dispatchEvent(new CustomEvent('post-created', { detail: newPostData }));

      // Reset UI
      setContent('');
      setPostPreviewImage(null);
      setPostPreviewVideo(null);
      toast.success('Post saved successfully to Camp Network!', { id: toastId });
      
      // Call the parent's refresh function if provided
      if (onPostCreated) {
        await onPostCreated();
      }
      
    } catch (error) {
      console.error('Error saving Camp Network post:', error);
      toast.error('Failed to save your Camp Network post', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleShowAIModal = () => {
    // Use direct function call instead of CustomEvent
    if (setShowAIModal) {
      setShowAIModal(true);
    }
  };

  if (!address) {
    return null;
  }

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
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
        <div className="flex items-center space-x-3 mb-4">
          <Avatar address={address} className="w-10 h-10 rounded-full" />
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What would you like to post on Camp Network?"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              rows={3}
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
              onClick={() => {
                setPostPreviewImage(null);
                setPostPreviewVideo(null);
              }}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="absolute bottom-2 left-2 right-2 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1 sm:space-x-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs sm:text-sm"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="hidden xs:inline">Add photo/video</span>
              <span className="inline xs:hidden">Photo</span>
            </button>

            <button
              onClick={handleShowAIModal}
              className="flex items-center space-x-1 sm:space-x-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs sm:text-sm"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="hidden xs:inline">Generate AI Post</span>
              <span className="inline xs:hidden">AI</span>
            </button>
          </div>
          
          <div className="mt-3 flex justify-end">
            <TransactionButtonBaseCamp
              content={content}
              onTransactionSuccess={handleTransactionSuccess}
              disabled={!content.trim() || isSaving}
              autoPost={true}
              onPostAdded={onPostCreated} // Pass through to TransactionButton
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
      </div>
    </BanRestriction>
  );
} 