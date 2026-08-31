'use client';

import { useState, useEffect } from 'react';

// Interface dla danych utworu Spotify
export interface SpotifyTrackData {
  track: {
    id: string;
    name: string;
    artists: Array<{
      name: string;
      external_urls?: {
        spotify: string;
      };
    }>;
    album: {
      name: string;
      images?: Array<{
        url: string;
        height: number;
        width: number;
      }>;
      external_urls?: {
        spotify: string;
      };
      release_date?: string;
      release_date_precision?: string;
    };
    duration_ms: number;
    popularity?: number;
    preview_url?: string;
    external_urls?: {
      spotify: string;
    };
  };
}

interface SpotifyTrackCardProps {
  trackData: SpotifyTrackData;
  isCompact?: boolean; // Wersja kompaktowa dla postów
  showAudioPlayer?: boolean; // Czy pokazywać odtwarzacz
  disableLinks?: boolean; // Wyłącz linki do Spotify (tryb selekcji)
  currentTrackUrl?: string;
  isPlaying?: boolean;
  isLoading?: boolean;
  onPlayTrack?: (previewUrl: string) => void;
  currentTime?: number;
  duration?: number;
  volume?: number;
  onSeekTime?: (time: number) => void;
  onVolumeChange?: (volume: number) => void;
}

// Funkcja formatowania czasu
const formatTime = (time: number): string => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export default function SpotifyTrackCard({
  trackData,
  isCompact = false,
  showAudioPlayer = true,
  disableLinks = false,
  currentTrackUrl,
  isPlaying = false,
  isLoading = false,
  onPlayTrack,
  currentTime = 0,
  duration = 0,
  volume = 0.5,
  onSeekTime,
  onVolumeChange
}: SpotifyTrackCardProps) {
  const { track } = trackData;

  return (
    <div 
      className={`relative overflow-hidden rounded-lg ${isCompact ? 'p-2' : 'p-3'} hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/30 origin-left transition-all duration-300`}
      style={{
        backgroundImage: track?.album?.images?.[0]?.url 
          ? `url(${track.album.images[0].url})` 
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Blurred Background Overlay */}
      <div className={`absolute inset-0 rounded-lg ${
        track?.album?.images?.[0]?.url 
          ? 'bg-black/40' 
          : 'bg-gradient-to-br from-green-900/30 to-emerald-800/30'
      }`}></div>
      
      {/* Content Container */}
      <div className="relative z-10">
        <div className="flex items-center space-x-3">
          {/* Album Cover */}
          {track?.album?.images && track.album.images[0] && (
            <div className="relative group">
              {disableLinks ? (
                <img
                  src={track.album.images[0].url}
                  alt={track.album.name}
                  className={`${isCompact ? 'w-10 h-10' : 'w-12 h-12'} rounded transition-all duration-200`}
                />
              ) : (
                <a
                  href={track?.album?.external_urls?.spotify || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:opacity-80 transition-opacity"
                  title={`View album: ${track?.album?.name}`}
                >
                  <img
                    src={track.album.images[0].url}
                    alt={track.album.name}
                    className={`${isCompact ? 'w-10 h-10' : 'w-12 h-12'} rounded cursor-pointer hover:shadow-lg transition-all duration-200`}
                  />
                </a>
              )}
              
              {/* Preview Play Button */}
              {track?.preview_url && showAudioPlayer && (
                <button
                  onClick={() => onPlayTrack?.(track.preview_url!)}
                  disabled={isLoading && currentTrackUrl === track.preview_url}
                  className={`absolute inset-0 flex items-center justify-center rounded transition-opacity duration-200 disabled:opacity-50 ${
                    isPlaying && currentTrackUrl === track.preview_url 
                      ? 'bg-black/30 opacity-100' 
                      : 'bg-black/50 opacity-0 group-hover:opacity-100'
                  }`}
                  title={isPlaying && currentTrackUrl === track.preview_url ? 'Pause' : 'Play 30s preview'}
                >
                  {isLoading && currentTrackUrl === track.preview_url ? (
                    <div className="animate-spin w-4 h-4 border border-white border-t-transparent rounded-full"></div>
                  ) : isPlaying && currentTrackUrl === track.preview_url ? (
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
              )}
              
              {/* No Preview Indicator */}
              {!track?.preview_url && showAudioPlayer && (
                <div 
                  className="absolute inset-0 flex items-center justify-center bg-soft-ink/50 rounded transition-opacity duration-200 opacity-0 group-hover:opacity-100"
                  title="No preview available for this track"
                >
                  <svg className="w-4 h-4 text-soft-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
              )}
            </div>
          )}

          {/* Track Info */}
          <div className="flex-1 min-w-0">
            {/* Track Name */}
            {track?.external_urls?.spotify ? (
              <a
                href={track.external_urls.spotify}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-white hover:text-green-300 ${isCompact ? 'text-xs' : 'text-sm'} font-medium truncate block transition-colors`}
                title={`Play on Spotify: ${track?.name}`}
              >
                🎵 {track?.name || 'Unknown Track'}
              </a>
            ) : (
              <p className={`text-white ${isCompact ? 'text-xs' : 'text-sm'} font-medium truncate`}>
                {track?.name || 'Unknown Track'}
              </p>
            )}

            {/* Artist & Album */}
            <div className={`text-soft-ink-faint ${isCompact ? 'text-xs' : 'text-xs'} truncate`}>
              {track?.artists?.map((artist, idx) => (
                <span key={idx}>
                  {artist?.external_urls?.spotify ? (
                    <a
                      href={artist.external_urls.spotify}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-green-300 transition-colors"
                      title={`View artist: ${artist?.name}`}
                    >
                      {artist?.name}
                    </a>
                  ) : (
                    artist?.name
                  )}
                  {idx < (track?.artists?.length || 0) - 1 && ', '}
                </span>
              )) || 'Unknown Artist'} • 
              {track?.album?.external_urls?.spotify ? (
                <a
                  href={track.album.external_urls.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-green-300 transition-colors ml-1"
                  title={`View album: ${track?.album?.name}`}
                >
                  {track?.album?.name || 'Unknown Album'}
                </a>
              ) : (
                <span className="ml-1">{track?.album?.name || 'Unknown Album'}</span>
              )}
            </div>
            
            {/* Track Metadata (nie w wersji kompaktowej) */}
            {!isCompact && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {/* Track Popularity */}
                {track?.popularity !== undefined && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-yellow-400/10 rounded border border-yellow-400/20">
                    <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    <span className="text-yellow-400">
                      {track.popularity}/100 
                      <span className="text-soft-ink-faint ml-1">
                        {track.popularity >= 70 ? 'Mainstream' : track.popularity >= 40 ? 'Popular' : 'Niche'}
                      </span>
                    </span>
                  </div>
                )}
                
                {/* Release Year */}
                {track?.album?.release_date && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-blue-400/10 rounded border border-blue-400/20">
                    <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 11H7v6h2v-6zm4 0h-2v6h2v-6zm4 0h-2v6h2v-6zm2.5 0h-2v6h2v-6zm3-9H3v2h2v16h14V4h2V2z"/>
                    </svg>
                    <span className="text-blue-400">
                      {new Date(track.album.release_date).getFullYear()}
                      <span className="text-soft-ink-faint ml-1">
                        {(() => {
                          const year = new Date(track.album.release_date).getFullYear();
                          const currentYear = new Date().getFullYear();
                          if (year >= currentYear - 2) return 'Recent';
                          if (year >= 2010) return '2010s+';
                          if (year >= 2000) return '2000s';
                          if (year >= 1990) return '90s';
                          return 'Classic';
                        })()}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* Compact Audio Player */}
            {showAudioPlayer && track?.preview_url && currentTrackUrl === track.preview_url && duration > 0 && (
              <div className="mt-2 flex items-center gap-2">
                {/* Progress Bar */}
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-green-400 min-w-[30px]">{formatTime(currentTime)}</span>
                  <div 
                    className="flex-1 h-0.5 bg-green-400/20 rounded-full cursor-pointer"
                    onClick={(e) => {
                      if (onSeekTime) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const percent = (e.clientX - rect.left) / rect.width;
                        onSeekTime(percent * duration);
                      }
                    }}
                  >
                    <div 
                      className="h-full bg-green-400 rounded-full transition-all"
                      style={{ width: `${(currentTime / duration) * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-green-400 min-w-[30px]">{formatTime(duration)}</span>
                </div>
                
                {/* Volume Control (nie w wersji kompaktowej) */}
                {!isCompact && onVolumeChange && (
                  <div className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                    </svg>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                      className="w-8 h-0.5 bg-green-400/20 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${volume * 100}%, rgba(74, 222, 128, 0.2) ${volume * 100}%, rgba(74, 222, 128, 0.2) 100%)`
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}