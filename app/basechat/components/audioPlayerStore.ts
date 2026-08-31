'use client';

/**
 * Globalny store odtwarzacza podgladow Spotify.
 *
 * Wczesniej stan odtwarzacza (currentTime aktualizowany z eventu `timeupdate`,
 * 4-60x/s) siedzial w useState PostList, wiec kazde tykniecie czasu re-renderowalo
 * caly feed przez cala dlugosc utworu. Teraz stan zyje poza Reactem, a subskrybuje
 * go tylko ta jedna karta utworu, ktora akurat gra.
 */

export type AudioPlayerState = {
  currentTrackUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
};

const initialState: AudioPlayerState = {
  currentTrackUrl: null,
  isPlaying: false,
  isLoading: false,
  currentTime: 0,
  duration: 0,
  volume: 0.5,
};

let state: AudioPlayerState = initialState;
let audio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

function emit(patch: Partial<AudioPlayerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): AudioPlayerState {
  return state;
}

// Serwer nie ma odtwarzacza - stala referencja, zeby useSyncExternalStore nie petlil.
export function getServerSnapshot(): AudioPlayerState {
  return initialState;
}

export function playTrack(previewUrl: string) {
  if (!previewUrl) return;

  // Ten sam utwor - tylko play/pause
  if (state.currentTrackUrl === previewUrl && audio) {
    if (audio.paused) {
      audio.play();
      emit({ isPlaying: true });
    } else {
      audio.pause();
      emit({ isPlaying: false });
    }
    return;
  }

  if (audio) {
    audio.pause();
    audio = null;
  }

  const next = new Audio(previewUrl);
  next.volume = state.volume;
  audio = next;

  emit({ currentTrackUrl: previewUrl, isLoading: true, isPlaying: false, currentTime: 0, duration: 0 });

  next.addEventListener('loadedmetadata', () => {
    if (audio !== next) return;
    emit({ duration: next.duration, isLoading: false });
  });

  next.addEventListener('timeupdate', () => {
    if (audio !== next) return;
    emit({ currentTime: next.currentTime });
  });

  next.addEventListener('ended', () => {
    if (audio !== next) return;
    emit({ isPlaying: false, currentTime: 0 });
  });

  next.addEventListener('error', () => {
    if (audio !== next) return;
    emit({ isLoading: false, isPlaying: false });
    console.error('Failed to load audio');
  });

  next.play();
  emit({ isPlaying: true });
}

export function setVolume(volume: number) {
  if (audio) audio.volume = volume;
  emit({ volume });
}

export function seek(time: number) {
  if (!audio) return;
  audio.currentTime = time;
  emit({ currentTime: time });
}

export function stopAndReset() {
  if (audio) {
    audio.pause();
    audio = null;
  }
  emit({ isPlaying: false, currentTrackUrl: null, currentTime: 0, duration: 0, isLoading: false });
}
