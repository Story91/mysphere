'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useNotifications } from '../../basechat/friendsystem/hooks';

// ===============================================
// 🔔 NOTIFICATIONS BELL COMPONENT
// ===============================================

interface NotificationsBellProps {
  onNotificationsClick: () => void; // Callback kiedy user kliknie w dzwoneczek
}

export const NotificationsBell: React.FC<NotificationsBellProps> = ({
  onNotificationsClick
}) => {
  const { address } = useAccount();
  const { unreadCount, loading } = useNotifications(address || null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Animacja gdy pojawią się nowe powiadomienia
  useEffect(() => {
    if (unreadCount > 0) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  // Nie pokazuj dzwoneczka jeśli user nie jest zalogowany
  if (!address) return null;

  // Reszta interfejsu jest po angielsku - tooltip i nazwa dostepna tez.
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <button
      type="button"
      onClick={onNotificationsClick}
      className={`
        relative p-2 rounded-pill
        transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong
        active:scale-[0.97] outline-none
        focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface
        hover:bg-soft-sunken
        ${isAnimating ? 'animate-bounce' : ''}
        ${unreadCount > 0 ? 'text-soft-primary-deep' : 'text-soft-ink-muted hover:text-soft-ink'}
      `}
      title={label}
      aria-label={label}
    >
      {/* Bell Icon (Ikonka dzwoneczka) */}
      <svg
        aria-hidden="true"
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" 
        />
      </svg>

      {/* Red Dot for Unread Notifications (Czerwona kropka dla nieprzeczytanych) */}
      {unreadCount > 0 && (
        // Liczba jest juz w nazwie dostepnej przycisku - powtorzona w drzewie
        // dostepnosci czytalaby sie dwa razy.
        <div aria-hidden="true" className="absolute -top-1 -right-1 flex items-center justify-center">
          {/* Pulsating background (Pulsujące tło) - jasny pomarancz akcentu,
              zeby pulsowanie bylo widac na bialej belce. */}
          <div className="absolute w-5 h-5 bg-soft-accent rounded-full animate-ping opacity-75"></div>

          {/* Statyczna kropka z liczba. Czerwien 500 na bieli miala 4.0:1 pod
              bialym napisem; accent-deep ma 5.9:1 i nalezy do palety. */}
          <div className="relative w-5 h-5 bg-soft-accent-deep rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold font-soft-display">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </div>
        </div>
      )}

      {/* Loading indicator (Wskaźnik ładowania) */}
      {loading && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 border-2 border-soft-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </button>
  );
};

export default NotificationsBell;