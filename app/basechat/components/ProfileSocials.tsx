import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import Image from 'next/image';

interface ProfileSocialsProps {
  address: `0x${string}`;
  initialLinks?: {
    twitter?: string;
    farcaster?: string;
    discord?: string;
  };
  onSave?: (links: { twitter: string; farcaster: string; discord: string }) => void;
  lazyLoad?: boolean;
  isOwner?: boolean;
}

export default function ProfileSocials({ address, initialLinks, onSave, lazyLoad = false, isOwner = false }: ProfileSocialsProps) {
  // Rozbite na stringi celowo. Domyslne `initialLinks = {}` tworzylo NOWY obiekt
  // przy kazdym renderze, wiec efekt z zaleznoscia [initialLinks] odpalal sie
  // bez konca i setLinks kreciło petle renderow dla kazdego profilu bez linkow.
  const initialTwitter = initialLinks?.twitter || '';
  const initialFarcaster = initialLinks?.farcaster || '';
  const initialDiscord = initialLinks?.discord || '';

  const [isEditing, setIsEditing] = useState(false);
  const [links, setLinks] = useState({
    twitter: initialTwitter,
    farcaster: initialFarcaster,
    discord: initialDiscord
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(!lazyLoad);
  const [copiedDiscord, setCopiedDiscord] = useState(false);

  useEffect(() => {
    setLinks({
      twitter: initialTwitter,
      farcaster: initialFarcaster,
      discord: initialDiscord
    });
  }, [initialTwitter, initialFarcaster, initialDiscord]);

  useEffect(() => {
    if (!lazyLoad || !address) {
      setHasLoaded(!lazyLoad);
      return;
    }

    // `hasLoaded` nie resetowalo sie przy zmianie adresu - drugi ogladany profil
    // nie doczytywal juz nic i zostawal na linkach poprzedniego uzytkownika.
    setHasLoaded(false);
    let cancelled = false;

    const loadData = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', address));
        if (cancelled) return;

        const socialLinks = userSnap.exists() ? userSnap.data().socialLinks : null;
        if (socialLinks) {
          setLinks({
            twitter: socialLinks.twitter || '',
            farcaster: socialLinks.farcaster || '',
            discord: socialLinks.discord || ''
          });
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading social links:', error);
      } finally {
        // Takze po bledzie - inaczej sekcja zostawala pusta na zawsze.
        if (!cancelled) setHasLoaded(true);
      }
    };

    loadData();

    return () => { cancelled = true; };
  }, [address, lazyLoad]);

  const handleSave = async () => {
    if (!address || !isOwner) return;
    
    setIsSubmitting(true);
    try {
      const userRef = doc(db, 'users', address);
      await setDoc(userRef, {
        socialLinks: links,
        lastUpdated: serverTimestamp()
      }, { merge: true });
      
      setIsEditing(false);
      
      if (onSave) {
        onSave(links);
      }
    } catch (error) {
      console.error('Error saving social links:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    };
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      // writeText odrzuca obietnice bez HTTPS i bez uprawnienia - wczesniej
      // szlo to jako nieobsluzone odrzucenie, a UI i tak mowilo "Copied!".
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      return;
    }

    setCopiedDiscord(true);
    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = setTimeout(() => setCopiedDiscord(false), 2000);
  };

  return (
    <div className="flex flex-col">
      {/* Gradient separator line */}
      <div className="w-full h-0.5 bg-soft-line my-2 rounded-pill"></div>
      
      {isEditing ? (
        <div className="space-y-2 mt-1">
          <div className="flex items-center space-x-2">
            <svg className="w-6 h-6 text-soft-ink-muted" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <input
              type="text"
              value={links.twitter}
              onChange={(e) => setLinks({...links, twitter: e.target.value})}
              className="rounded-pill text-xs bg-soft-sunken border border-soft-line text-soft-ink placeholder:text-soft-ink-faint transition-colors duration-[--dur-press] ease-out-strong focus:outline-none focus:ring-2 focus:ring-soft-primary focus:border-soft-primary block flex-1 min-w-0 w-full px-3 py-1.5"
              placeholder="X username"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 relative">
              <Image 
                src="/icon.png" 
                alt="Warpcast Logo" 
                width={24} 
                height={24} 
                className="text-purple-500" 
              />
            </div>
            <input
              type="text"
              value={links.farcaster}
              onChange={(e) => setLinks({...links, farcaster: e.target.value})}
              className="rounded-pill text-xs bg-soft-sunken border border-soft-line text-soft-ink placeholder:text-soft-ink-faint transition-colors duration-[--dur-press] ease-out-strong focus:outline-none focus:ring-2 focus:ring-soft-primary focus:border-soft-primary block flex-1 min-w-0 w-full px-3 py-1.5"
              placeholder="Warpcast username"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <svg className="w-6 h-6 text-soft-ink-muted" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
            </svg>
            <input
              type="text"
              value={links.discord}
              onChange={(e) => setLinks({...links, discord: e.target.value})}
              className="rounded-pill text-xs bg-soft-sunken border border-soft-line text-soft-ink placeholder:text-soft-ink-faint transition-colors duration-[--dur-press] ease-out-strong focus:outline-none focus:ring-2 focus:ring-soft-primary focus:border-soft-primary block flex-1 min-w-0 w-full px-3 py-1.5"
              placeholder="Discord username"
            />
          </div>
          
          <div className="flex justify-end space-x-2 mt-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 bg-soft-sunken text-soft-ink-muted rounded-pill text-xs font-semibold hover:bg-soft-line transition-colors duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSubmitting}
              className={`px-3 py-1 bg-soft-primary text-white rounded-pill text-xs font-semibold shadow-chip hover:bg-soft-primary-deep transition-colors duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${isSubmitting ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          {hasLoaded ? (
            <div className="flex flex-col items-center w-full">
              <div className="flex justify-center items-center gap-10 my-2">
                {/* X / Twitter */}
                {links.twitter ? (
                  <a href={`https://x.com/${links.twitter}`} target="_blank" rel="noopener noreferrer" aria-label={`X: ${links.twitter}`} className="text-soft-ink-muted hover:text-soft-primary-deep rounded-pill transition-colors duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary">
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                ) : (
                  <button 
                    onClick={() => isOwner && setIsEditing(true)}
                    aria-label={isOwner ? 'Add X link' : 'No X link'}
                    className={`text-soft-line-strong rounded-pill transition-colors duration-[--dur-press] ease-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${isOwner ? 'hover:text-soft-primary-deep cursor-pointer active:scale-[0.97]' : ''}`}
                  >
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </button>
                )}
                
                {/* Farcaster / Warpcast */}
                {links.farcaster ? (
                  <a href={`https://warpcast.com/${links.farcaster}`} target="_blank" rel="noopener noreferrer" aria-label={`Warpcast: ${links.farcaster}`} className="text-soft-ink-muted hover:text-soft-primary-deep rounded-pill transition-colors duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary">
                    <div className="w-7 h-7 relative">
                      <Image 
                        src="/icon.png" 
                        alt="Warpcast Logo" 
                        width={28} 
                        height={28}
                      />
                    </div>
                  </a>
                ) : (
                  <button 
                    onClick={() => isOwner && setIsEditing(true)}
                    aria-label={isOwner ? 'Add Warpcast link' : 'No Warpcast link'}
                    className={`rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${isOwner ? 'cursor-pointer active:scale-[0.97]' : ''}`}
                  >
                    <div className="w-7 h-7 relative opacity-30 hover:opacity-70 transition-opacity duration-[--dur-press] ease-out-strong">
                      <Image 
                        src="/icon.png" 
                        alt="Warpcast Logo" 
                        width={28} 
                        height={28}
                      />
                    </div>
                  </button>
                )}
                
                {/* Discord */}
                {links.discord ? (
                  <div className="relative group">
                    <button 
                      onClick={() => copyToClipboard(links.discord)}
                      aria-label={`Copy Discord username: ${links.discord}`}
                      className="text-soft-ink-muted hover:text-soft-primary-deep rounded-pill transition-colors duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                    >
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
                      </svg>
                    </button>
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-soft-surface text-xs px-2 py-1 rounded-pill shadow-float opacity-0 group-hover:opacity-100 transition-opacity duration-[--dur-tooltip] ease-out-strong whitespace-nowrap text-soft-ink">
                      {copiedDiscord ? 'Copied!' : links.discord}
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => isOwner && setIsEditing(true)}
                    aria-label={isOwner ? 'Add Discord username' : 'No Discord username'}
                    className={`text-soft-line-strong rounded-pill transition-colors duration-[--dur-press] ease-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${isOwner ? 'hover:text-soft-primary-deep cursor-pointer active:scale-[0.97]' : ''}`}
                  >
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
                    </svg>
                  </button>
                )}
              </div>
              
              {isOwner && (
                <button 
                  onClick={() => setIsEditing(true)} 
                  className="text-xs font-semibold text-soft-primary-deep hover:bg-soft-line transition-colors duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary bg-soft-sunken px-3 py-1 rounded-pill mt-1"
                >
                  {!(links.twitter || links.farcaster || links.discord) ? '+ Add social links' : 'Edit links'}
                </button>
              )}
            </div>
          ) : (
            <div className="flex justify-center my-2">
              <div className="animate-pulse flex space-x-4">
                <div className="h-7 w-7 bg-soft-sunken rounded-full"></div>
                <div className="h-7 w-7 bg-soft-sunken rounded-full"></div>
                <div className="h-7 w-7 bg-soft-sunken rounded-full"></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 