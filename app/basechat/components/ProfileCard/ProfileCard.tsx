import React, { useEffect, useRef, useCallback, useMemo, useState } from "react";
import "./ProfileCard.css";

const DEFAULT_BEHIND_GRADIENT =
  "radial-gradient(farthest-side circle at var(--pointer-x) var(--pointer-y),hsla(218,100%,90%,var(--card-opacity)) 4%,hsla(218,50%,80%,calc(var(--card-opacity)*0.75)) 10%,hsla(218,25%,70%,calc(var(--card-opacity)*0.5)) 50%,hsla(218,0%,60%,0) 100%),radial-gradient(35% 52% at 55% 20%,#0052FF 0%,#073aff00 100%),radial-gradient(100% 100% at 50% 50%,#0052FF 1%,#073aff00 76%),conic-gradient(from 124deg at 50% 50%,#0052FF 0%,#4C8FFF 40%,#4C8FFF 60%,#0052FF 100%)";

const DEFAULT_INNER_GRADIENT =
  "linear-gradient(145deg,#050B20 0%,#0052FF44 100%)";

const ANIMATION_CONFIG = {
  SMOOTH_DURATION: 600,
  INITIAL_DURATION: 1500,
  INITIAL_X_OFFSET: 70,
  INITIAL_Y_OFFSET: 60,
};

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(Math.max(value, min), max);

const round = (value: number, precision = 3): number =>
  parseFloat(value.toFixed(precision));

const adjust = (
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number
): number =>
  round(toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin));

const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export interface ProfileCardProps {
  avatarUrl?: string;
  iconUrl?: string;
  grainUrl?: string;
  behindGradient?: string;
  innerGradient?: string;
  showBehindGradient?: boolean;
  className?: string;
  enableTilt?: boolean;
  miniAvatarUrl?: string;
  name?: string;
  title?: string;
  handle?: string;
  status?: string;
  fullAddress?: string;
  contactText?: string;
  showUserInfo?: boolean;
  socialLinks?: {
    twitter?: string;
    farcaster?: string;
    discord?: string;
  };
  onContactClick?: () => void;
}

const ProfileCardComponent: React.FC<ProfileCardProps> = ({
  avatarUrl = "/favicon_io (1)/android-chrome-192x1921.png",
  iconUrl,
  grainUrl,
  behindGradient,
  innerGradient,
  showBehindGradient = true,
  className = "",
  enableTilt = true,
  miniAvatarUrl,
  name = "MySphere User",
  title,
  handle = "basebuilder",
  status = "Building onchain",
  fullAddress,
  contactText = "Connect",
  showUserInfo = true,
  socialLinks,
  onContactClick,
}) => {
  const nameRef = useRef<HTMLHeadingElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  // Detect mobile devices and reduced motion preference
  useEffect(() => {
    const detectMobile = () => {
      const isMobile = window.innerWidth <= 768 || 
                      /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                      ('ontouchstart' in window) ||
                      (navigator.maxTouchPoints > 0);
      
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      
      setIsMobileDevice(isMobile || prefersReducedMotion);
    };

    detectMobile();
    window.addEventListener('resize', detectMobile);
    
    return () => window.removeEventListener('resize', detectMobile);
  }, []);

  const animationHandlers = useMemo(() => {
    if (!enableTilt) return null;

    let rafId: number | null = null;

    const updateCardTransform = (
      offsetX: number,
      offsetY: number,
      card: HTMLElement,
      wrap: HTMLDivElement
    ) => {
      const width = card.clientWidth;
      const height = card.clientHeight;

      const percentX = clamp((100 / width) * offsetX);
      const percentY = clamp((100 / height) * offsetY);

      const centerX = percentX - 50;
      const centerY = percentY - 50;

      const properties = {
        "--pointer-x": `${percentX}%`,
        "--pointer-y": `${percentY}%`,
        "--background-x": `${adjust(percentX, 0, 100, 35, 65)}%`,
        "--background-y": `${adjust(percentY, 0, 100, 35, 65)}%`,
        "--pointer-from-center": `${clamp(Math.hypot(percentY - 50, percentX - 50) / 50, 0, 1)}`,
        "--pointer-from-top": `${percentY / 100}`,
        "--pointer-from-left": `${percentX / 100}`,
        "--rotate-x": `${round(-(centerX / 5))}deg`,
        "--rotate-y": `${round(centerY / 4)}deg`,
      };

      Object.entries(properties).forEach(([property, value]) => {
        wrap.style.setProperty(property, value);
      });
    };

    const createSmoothAnimation = (
      duration: number,
      startX: number,
      startY: number,
      card: HTMLElement,
      wrap: HTMLDivElement
    ) => {
      const startTime = performance.now();
      const targetX = wrap.clientWidth / 2;
      const targetY = wrap.clientHeight / 2;

      const animationLoop = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = clamp(elapsed / duration);
        const easedProgress = easeInOutCubic(progress);

        const currentX = adjust(easedProgress, 0, 1, startX, targetX);
        const currentY = adjust(easedProgress, 0, 1, startY, targetY);

        updateCardTransform(currentX, currentY, card, wrap);

        if (progress < 1) {
          rafId = requestAnimationFrame(animationLoop);
        }
      };

      rafId = requestAnimationFrame(animationLoop);
    };

    return {
      updateCardTransform,
      createSmoothAnimation,
      cancelAnimation: () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
    };
  }, [enableTilt]);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const card = cardRef.current;
      const wrap = wrapRef.current;

      if (!card || !wrap || !animationHandlers) return;

      const rect = card.getBoundingClientRect();
      animationHandlers.updateCardTransform(
        event.clientX - rect.left,
        event.clientY - rect.top,
        card,
        wrap
      );
    },
    [animationHandlers]
  );

  const handlePointerEnter = useCallback(() => {
    const card = cardRef.current;
    const wrap = wrapRef.current;

    if (!card || !wrap || !animationHandlers) return;

    animationHandlers.cancelAnimation();
    wrap.classList.add("active");
    card.classList.add("active");
  }, [animationHandlers]);

  const handlePointerLeave = useCallback(
    (event: PointerEvent) => {
      const card = cardRef.current;
      const wrap = wrapRef.current;

      if (!card || !wrap || !animationHandlers) return;

      animationHandlers.createSmoothAnimation(
        ANIMATION_CONFIG.SMOOTH_DURATION,
        event.offsetX,
        event.offsetY,
        card,
        wrap
      );
      wrap.classList.remove("active");
      card.classList.remove("active");
    },
    [animationHandlers]
  );

  useEffect(() => {
    if (!enableTilt || !animationHandlers || isMobileDevice) return;

    const card = cardRef.current;
    const wrap = wrapRef.current;

    if (!card || !wrap) return;

    const pointerMoveHandler = handlePointerMove;
    const pointerEnterHandler = handlePointerEnter;
    const pointerLeaveHandler = handlePointerLeave;

    card.addEventListener("pointerenter", pointerEnterHandler);
    card.addEventListener("pointermove", pointerMoveHandler as any);
    card.addEventListener("pointerleave", pointerLeaveHandler as any);

    const initialX = wrap.clientWidth - ANIMATION_CONFIG.INITIAL_X_OFFSET;
    const initialY = ANIMATION_CONFIG.INITIAL_Y_OFFSET;

    animationHandlers.updateCardTransform(initialX, initialY, card, wrap);
    animationHandlers.createSmoothAnimation(
      ANIMATION_CONFIG.INITIAL_DURATION,
      initialX,
      initialY,
      card,
      wrap
    );

    return () => {
      card.removeEventListener("pointerenter", pointerEnterHandler);
      card.removeEventListener("pointermove", pointerMoveHandler as any);
      card.removeEventListener("pointerleave", pointerLeaveHandler as any);
      animationHandlers.cancelAnimation();
    };
  }, [
    enableTilt,
    animationHandlers,
    handlePointerMove,
    handlePointerEnter,
    handlePointerLeave,
    isMobileDevice,
  ]);

  // Set static styles for mobile devices
  useEffect(() => {
    if (isMobileDevice) {
      const card = cardRef.current;
      const wrap = wrapRef.current;

      if (!card || !wrap) return;

      // Set static position for mobile
      const centerX = wrap.clientWidth / 2;
      const centerY = wrap.clientHeight / 2;

      card.style.setProperty('--pointer-x', '50%');
      card.style.setProperty('--pointer-y', '50%');
      card.style.setProperty('--pointer-from-center', '0');
      card.style.setProperty('--pointer-from-top', '0.5');
      card.style.setProperty('--pointer-from-left', '0.5');
      card.style.setProperty('--rotate-x', '0deg');
      card.style.setProperty('--rotate-y', '0deg');
      card.style.setProperty('--background-x', '50%');
      card.style.setProperty('--background-y', '50%');

      // Add mobile class for CSS targeting
      wrap.classList.add('mobile-device');
      card.classList.add('mobile-device');
    }
  }, [isMobileDevice]);

  const cardStyle = useMemo(
    () =>
    ({
      "--icon": iconUrl ? `url(${iconUrl})` : "none",
      "--grain": grainUrl ? `url(${grainUrl})` : "none",
      "--behind-gradient": showBehindGradient
        ? (behindGradient ?? DEFAULT_BEHIND_GRADIENT)
        : "none",
      "--inner-gradient": innerGradient ?? DEFAULT_INNER_GRADIENT,
    } as React.CSSProperties),
    [iconUrl, grainUrl, showBehindGradient, behindGradient, innerGradient]
  );

  const handleContactClick = useCallback(() => {
    onContactClick?.();
  }, [onContactClick]);

  const handleCopyAddress = useCallback(async () => {
    if (fullAddress) {
      try {
        await navigator.clipboard.writeText(fullAddress);
        setShowCopied(true);
        setTimeout(() => {
          setShowCopied(false);
        }, 2000); // Show for 2 seconds
        console.log('Address copied to clipboard:', fullAddress);
      } catch (err) {
        console.error('Failed to copy address:', err);
      }
    }
  }, [fullAddress]);

  // Dynamic font size based on name length
  useEffect(() => {
    if (nameRef.current && name) {
      const nameLength = name.length;
      const nameElement = nameRef.current;
      
      // Remove existing data attributes
      nameElement.removeAttribute('data-long');
      nameElement.removeAttribute('data-very-long');
      
      // Add appropriate data attribute based on length
      // Special handling for .base.eth addresses which are typically longer
      if (name.includes('.base.eth') && nameLength > 16) {
        nameElement.setAttribute('data-very-long', 'true');
      } else if (name.includes('.base.eth') && nameLength > 10) {
        nameElement.setAttribute('data-long', 'true');
      } else if (nameLength > 18) {
        nameElement.setAttribute('data-very-long', 'true');
      } else if (nameLength > 12) {
        nameElement.setAttribute('data-long', 'true');
      }
    }
  }, [name]);

  return (
    <div
      ref={wrapRef}
      className={`pc-card-wrapper ${className}`.trim()}
      style={cardStyle}
    >
      <section ref={cardRef} className="pc-card">
        <div className="pc-inside">
          <div className="pc-shine" />
          <div className="pc-glare" />
          <div className="pc-content pc-avatar-content">
            <img
              className="avatar"
              src={avatarUrl}
              alt={`${name || "User"} avatar`}
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
            {showUserInfo && (
              <>
                {/* Social Icons - moved above user info */}
                <div className="pc-social-bar">
                  {/* Twitter/X */}
                  {socialLinks?.twitter ? (
                    <a 
                      href={`https://x.com/${socialLinks.twitter}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="pc-social-link pc-social-active"
                      style={{ pointerEvents: "auto" }}
                    >
                      <svg className="pc-social-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </a>
                  ) : (
                    <span className="pc-social-link pc-social-inactive">
                      <svg className="pc-social-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                      <div className="pc-lock-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 1C8.676 1 6 3.676 6 7v2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V11c0-1.1-.9-2-2-2h-1V7c0-3.324-2.676-6-6-6zm0 2c2.206 0 4 1.794 4 4v2H8V7c0-2.206 1.794-4 4-4z"/>
                        </svg>
                      </div>
                    </span>
                  )}
                  
                  {/* Farcaster/Warpcast */}
                  {socialLinks?.farcaster ? (
                    <a 
                      href={`https://warpcast.com/${socialLinks.farcaster}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="pc-social-link pc-social-active"
                      style={{ pointerEvents: "auto" }}
                    >
                      <img 
                        src="/icon.png" 
                        alt="Warpcast" 
                        className="pc-social-icon pc-social-icon-img"
                      />
                    </a>
                  ) : (
                    <span className="pc-social-link pc-social-inactive">
                      <img 
                        src="/icon.png" 
                        alt="Warpcast" 
                        className="pc-social-icon pc-social-icon-img"
                      />
                      <div className="pc-lock-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 1C8.676 1 6 3.676 6 7v2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V11c0-1.1-.9-2-2-2h-1V7c0-3.324-2.676-6-6-6zm0 2c2.206 0 4 1.794 4 4v2H8V7c0-2.206 1.794-4 4-4z"/>
                        </svg>
                      </div>
                    </span>
                  )}
                  
                  {/* Discord */}
                  {socialLinks?.discord ? (
                    <span className="pc-social-link pc-social-discord pc-social-active">
                      <svg className="pc-social-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
                      </svg>
                    </span>
                  ) : (
                    <span className="pc-social-link pc-social-inactive">
                      <svg className="pc-social-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
                      </svg>
                      <div className="pc-lock-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 1C8.676 1 6 3.676 6 7v2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V11c0-1.1-.9-2-2-2h-1V7c0-3.324-2.676-6-6-6zm0 2c2.206 0 4 1.794 4 4v2H8V7c0-2.206 1.794-4 4-4z"/>
                        </svg>
                      </div>
                    </span>
                  )}
                </div>

                <div className="pc-user-info">
                  <div className="pc-user-details">
                    <div className="pc-mini-avatar">
                      <img
                        src={miniAvatarUrl || avatarUrl}
                        alt={`${name || "User"} mini avatar`}
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.opacity = "0.5";
                          target.src = avatarUrl || "";
                        }}
                      />
                    </div>
                    <div className="pc-user-text">
                      <div className="pc-handle">@{handle}</div>
                      <div className="pc-status-container">
                        <div 
                          className={`pc-status ${fullAddress ? 'pc-status-clickable' : ''}`}
                          onClick={fullAddress ? handleCopyAddress : undefined}
                          title={fullAddress ? 'Click to copy full address' : undefined}
                          style={{ pointerEvents: fullAddress ? "auto" : "none" }}
                        >
                          {status}
                        </div>
                        {showCopied && (
                          <div className="pc-copied-message">
                            ✓ Copied!
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    className="pc-contact-btn"
                    onClick={handleContactClick}
                    style={{ pointerEvents: "auto" }}
                    type="button"
                    aria-label={`Contact ${name || "user"}`}
                  >
                    <svg className="pc-edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"/>
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="pc-content">
            <div className="pc-details">
              <h3 ref={nameRef}>{name}</h3>
              {title && <p>{title}</p>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const ProfileCard = React.memo(ProfileCardComponent);

export default ProfileCard; 