'use client';

import { useState, useEffect } from 'react';
import * as linkifyjs from 'linkifyjs';

interface LinkPreviewProps {
  content: string;
  media?: {
    type: 'image' | 'video';
    url: string;
  };
}

interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: 'image' | 'video';
}

interface LinkifyMatch {
  value: string;
  type: string;
}

const isValidUrl = (urlString: string) => {
  try {
    new URL(urlString);
    return true;
  } catch (e) {
    return false;
  }
};

export default function LinkPreview({ content, media }: LinkPreviewProps) {
  const [links, setLinks] = useState<string[]>([]);
  const [previews, setPreviews] = useState<{[key: string]: LinkPreview}>({});
  const [showFullImage, setShowFullImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [failedImages, setFailedImages] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    // Znajdź wszystkie linki w tekście
    const foundLinks = linkifyjs.find(content || '');
    const uniqueLinks = Array.from(new Set(foundLinks.map((link: LinkifyMatch) => link.value)));
    setLinks(uniqueLinks);
  }, [content]);

  useEffect(() => {
    // Pobierz metadane dla każdego linku
    const fetchPreviews = async () => {
      const newPreviews: {[key: string]: LinkPreview} = {};
      
      for (const link of links) {
        try {
          // Pobierz podstawowe metadane (tytuł, opis, obrazek)
          const response = await fetch(`/api/link-preview?url=${encodeURIComponent(link)}`);
          const data = await response.json();
          newPreviews[link] = data;
        } catch (error) {
          console.error('Błąd podczas pobierania podglądu:', error);
        }
      }
      
      setPreviews(newPreviews);
    };

    if (links.length > 0) {
      fetchPreviews();
    }
  }, [links]);

  // Funkcja do zawijania długich linków
  const formatLink = (link: string) => {
    try {
      const url = new URL(link);
      const maxLength = 40;
      if (link.length > maxLength) {
        return `${url.hostname}${url.pathname.slice(0, maxLength - url.hostname.length)}...`;
      }
      return link;
    } catch {
      return link;
    }
  };

  const handleImageClick = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setShowFullImage(true);
  };

  return (
    <div>
      {/* Wyświetl media (zdjęcie lub wideo) */}
      {media && (
        <div className="mb-4">
          {media.type === 'image' ? (
            <div 
              className="relative cursor-pointer group"
              onClick={() => handleImageClick(media.url)}
            >
              <img
                src={media.url}
                alt="Post content"
                className="w-full rounded-lg object-contain max-h-[500px]"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity rounded-lg" />
              <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                Click to enlarge
              </div>
            </div>
          ) : (
            <video
              src={media.url}
              controls
              className="w-full rounded-lg max-h-[500px]"
              controlsList="nodownload"
              playsInline
              preload="metadata"
            >
              Your browser does not support video playback.
            </video>
          )}
        </div>
      )}

      {/* Wyświetl podglądy linków */}
      <div className="space-y-4">
        {links.map((link, index) => {
          let hostname = '';
          try {
            hostname = new URL(link).hostname;
          } catch (e) {
            return null;
          }

          const preview = previews[link];
          if (!preview) return null;

          const hasFailedImage = failedImages[link];

          return (
            <a
              key={index}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
            >
              <div className="flex flex-col md:flex-row">
                {preview.image && !hasFailedImage ? (
                  <div className="w-full md:w-48 h-48 md:h-auto flex-shrink-0">
                    <img
                      src={preview.image}
                      alt={preview.title || 'Link preview'}
                      className="w-full h-full object-cover"
                      onError={() => {
                        setFailedImages(prev => ({
                          ...prev,
                          [link]: true
                        }));
                      }}
                    />
                  </div>
                ) : null}
                <div className="flex-1 p-4">
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <div className="flex items-center">
                      <img 
                        src={`https://www.google.com/s2/favicons?domain=${hostname}`}
                        alt="Site icon"
                        className="w-4 h-4 mr-2"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                      {hostname}
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                    {preview.title || formatLink(link)}
                  </h3>
                  {preview.description && (
                    <p className="text-gray-600 dark:text-gray-300 text-sm line-clamp-3 mb-2">
                      {preview.description}
                    </p>
                  )}
                </div>
              </div>
            </a>
          );
        })}
      </div>

      {/* Modal do wyświetlania pełnego obrazu */}
      {showFullImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90"
          onClick={() => setShowFullImage(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={selectedImage}
              alt="Full size"
              className="max-w-full max-h-[90vh] object-contain"
            />
            <button
              className="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-70"
              onClick={() => setShowFullImage(false)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 
