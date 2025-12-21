import { ReactNode } from 'react';

interface ProfileCardProps {
  avatarUrl?: string;
  iconUrl?: string;
  grainUrl?: string;
  innerGradient?: string;
  behindGlowEnabled?: boolean;
  behindGlowColor?: string;
  behindGlowSize?: string;
  className?: string;
  enableTilt?: boolean;
  enableMobileTilt?: boolean;
  mobileTiltSensitivity?: number;
  miniAvatarUrl?: string;
  name?: string;
  title?: string;
  handle?: string;
  status?: string;
  contactText?: string;
  showUserInfo?: boolean;
  avatarMode?: 'default' | 'contain' | 'cover';
  enableFlip?: boolean;
  logoUrl?: string;
  ensName?: string;
  bottomBadge?: string;
  bottomBadgeIcon?: string;
  backContent?: ReactNode;
  onContactClick?: () => void;
}

declare const ProfileCard: React.FC<ProfileCardProps>;
export default ProfileCard;

