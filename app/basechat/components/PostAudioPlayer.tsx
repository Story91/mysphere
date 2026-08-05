'use client';

import { useSyncExternalStore } from 'react';
import SpotifyTrackCard from './SpotifyTrackCard';
import { subscribe, getSnapshot, getServerSnapshot, playTrack, setVolume, seek } from './audioPlayerStore';

/**
 * Jedyny konsument stanu odtwarzacza. Re-renderuje sie na kazdy `timeupdate`,
 * ale jest liscmi drzewa - feed (PostList) sie tego nie dowiaduje.
 */
export default function PostAudioPlayer({ musicTrack }: { musicTrack: any }) {
  const player = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isThisTrack = player.currentTrackUrl === musicTrack?.preview_url;

  return (
    <SpotifyTrackCard
      trackData={{ track: musicTrack }}
      isCompact={false}
      showAudioPlayer={true}
      onPlayTrack={playTrack}
      currentTrackUrl={player.currentTrackUrl || undefined}
      isPlaying={player.isPlaying && isThisTrack}
      isLoading={player.isLoading && isThisTrack}
      currentTime={isThisTrack ? player.currentTime : 0}
      duration={isThisTrack ? player.duration : 0}
      volume={player.volume}
      onVolumeChange={setVolume}
      onSeekTime={seek}
    />
  );
}
