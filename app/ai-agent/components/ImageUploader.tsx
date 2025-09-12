'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Copy, Check, X, Image } from 'lucide-react';

interface ImageUploaderProps {
  onImageUrlGenerated?: (url: string) => void;
}

export default function ImageUploader({ onImageUrlGenerated }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset previous states
    setError('');
    setUploadedUrl('');
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/ai-agent/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setUploadedUrl(result.imageUrl);
      onImageUrlGenerated?.(result.imageUrl);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!uploadedUrl) return;
    
    try {
      await navigator.clipboard.writeText(uploadedUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const openModal = () => {
    setShowModal(true);
    setError('');
    setUploadedUrl('');
  };

  const closeModal = () => {
    setShowModal(false);
    setError('');
    setUploadedUrl('');
    setIsCopied(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      {/* Upload Button */}
      <button
        onClick={openModal}
        className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors duration-200 relative group"
        title="Upload image for token"
      >
        <Image size={20} />
        <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
          Upload token image
        </span>
      </button>

      {/* Modal - using React Portal for proper positioning */}
      {showModal && mounted && createPortal(
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" 
          style={{ 
            zIndex: 9999,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0
          }}
          onClick={(e) => {
            // Close modal when clicking on backdrop
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative transform transition-all duration-200 animate-in fade-in-0 zoom-in-95">
            {/* Close button */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>

            {/* Header */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Upload Token Image</h3>
              <p className="text-sm text-gray-600 mt-1">
                Upload an image and get a URL to use for your token
              </p>
            </div>

            {/* Upload Area */}
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors duration-200"
              >
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-blue-600 hover:text-blue-500">
                    Click to upload
                  </span> or drag and drop
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  PNG, JPG, GIF up to 5MB
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Loading State */}
              {isUploading && (
                <div className="text-center py-4">
                  <div className="inline-flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-600">Uploading...</span>
                  </div>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Success State */}
              {uploadedUrl && (
                <div className="bg-green-50 border border-green-200 rounded-md p-4 space-y-3">
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">Upload successful!</span>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700 block">
                      Image URL (copy this for your token):
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={uploadedUrl}
                        readOnly
                        className="flex-1 text-xs bg-gray-50 border border-gray-300 rounded px-2 py-1 text-gray-700"
                      />
                      <button
                        onClick={copyToClipboard}
                        className="flex items-center space-x-1 bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 transition-colors duration-200"
                      >
                        {isCopied ? (
                          <>
                            <Check size={12} />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="mt-3">
                    <label className="text-xs font-medium text-gray-700 block mb-2">
                      Preview:
                    </label>
                    <img
                      src={uploadedUrl}
                      alt="Uploaded token image"
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
