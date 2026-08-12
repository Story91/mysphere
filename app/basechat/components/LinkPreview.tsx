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
  } catch {
    return false;
  }
};

// Cache na poziomie MODULU: feed montuje i odmontowuje karty przy scrollu,
// wiec ten sam URL potrafil trafic do /api/link-preview kilka razy w jednej
// sesji. Wynik trzymamy per URL, a zapytania w locie deduplikujemy przez
// wspoldzielona obietnice - drugi mount czeka na pierwszy fetch zamiast
// odpalac wlasny.
const previewCache = new Map<string, LinkPreview>();
const inflightPreviews = new Map<string, Promise<LinkPreview | null>>();

function loadPreview(link: string): Promise<LinkPreview | null> {
  const cached = previewCache.get(link);
  if (cached) return Promise.resolve(cached);

  const inflight = inflightPreviews.get(link);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const response = await fetch(`/api/link-preview?url=${encodeURIComponent(link)}`, {
        // Timeout, zeby wiszacy host nie blokowal miejsca w partii
        signal: AbortSignal.timeout(6000)
      });
      const data = await response.json();
      if (data && data.title) {
        // Trasa oznacza fallbacki bledow flaga `degraded` (timeout, blad HTTP,
        // nie-HTML) - pokazujemy je, ale NIE utrwalamy w cache'u modulu, zeby
        // chwilowa czkawka celu nie zamrazala zepsutego podgladu na cala sesje.
        if (!data.degraded) previewCache.set(link, data);
        return data as LinkPreview;
      }
      return null;
    } catch {
      // Bledu nie cache'ujemy - kolejny mount ma prawo sprobowac jeszcze raz
      return null;
    } finally {
      inflightPreviews.delete(link);
    }
  })();

  inflightPreviews.set(link, request);
  return request;
}

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
    
    // Filtruj tylko prawidłowe URL przed ustawieniem
    // (isValidUrl bylo zadeklarowane wyzej i nieuzywane - ta sama logika stala tu inline)
    setLinks(uniqueLinks.filter(isValidUrl));
  }, [content]);

  useEffect(() => {
    if (links.length === 0) return;

    // Podglad dla starej tresci nie moze dojechac po zmianie posta ani po
    // odmontowaniu - wczesniej setPreviews leciał bezwarunkowo.
    let cancelled = false;

    // Pobierz metadane dla każdego linku
    const fetchPreviews = async () => {
      // Ograniczamy liczbę równoczesnych zapytań do API
      const MAX_CONCURRENT_REQUESTS = 3;
      const chunks = [];

      // Dzielimy linki na mniejsze grupy, aby uniknąć zbyt wielu równoczesnych żądań
      for (let i = 0; i < links.length; i += MAX_CONCURRENT_REQUESTS) {
        chunks.push(links.slice(i, i + MAX_CONCURRENT_REQUESTS));
      }

      // Przetwarzaj każdą grupę linków sekwencyjnie
      for (const chunk of chunks) {
        if (cancelled) return;

        // Ale linki w grupie przetwarzaj równolegle
        await Promise.all(chunk.map(async (link) => {
          try {
            // Trafiony cache pomija placeholder - dane sa juz kompletne
            const cached = previewCache.get(link);
            if (cached) {
              if (!cancelled) setPreviews(prev => ({...prev, [link]: cached}));
              return;
            }

            const hostname = new URL(link).hostname;

            // Ustaw podstawowe domyślne wartości
            const defaultPreview = {
              title: hostname,
              description: 'Loading preview...',
              image: '',
              siteName: hostname
            };

            // Na początku ustaw domyślne wartości, aby użytkownik widział coś od razu
            if (cancelled) return;
            setPreviews(prev => ({...prev, [link]: defaultPreview}));

            // Pobierz metadane z API (przez cache i dedup na poziomie modulu)
            const data = await loadPreview(link);

            // Aktualizuj podgląd tylko jeśli dostaliśmy sensowne dane
            if (data && !cancelled) {
              setPreviews(prev => ({...prev, [link]: data}));
            }
          } catch {
            // Cicha obsługa błędów - domyślne wartości już zostały ustawione
          }
        }));
      }
    };

    fetchPreviews();

    return () => { cancelled = true; };
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
            <button
              type="button"
              aria-label="Enlarge image"
              className="relative cursor-pointer group block w-full"
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
            </button>
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
        {links.map((link) => {
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
              key={link}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white dark:bg-gray-800 border border-soft-line dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
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
                  <div className="flex items-center text-xs text-soft-ink-soft dark:text-soft-ink-faint mb-2">
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
                  <h3 className="text-lg font-semibold text-soft-ink dark:text-white mb-2 line-clamp-2">
                    {preview.title || formatLink(link)}
                  </h3>
                  {preview.description && (
                    <p className="text-soft-ink-muted dark:text-gray-300 text-sm line-clamp-3 mb-2">
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
              aria-label="Close image"
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
