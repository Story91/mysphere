// Typy dla systemu referali
import { Timestamp } from 'firebase/firestore';

export interface Referral {
  id?: string;
  referrerId: string;           // Adres portfela osoby polecającej
  referredAddress: string;      // Adres portfela osoby poleconej
  referralCode: string;         // Unikalny kod referalowy
  timestamp: Timestamp | Date;  // Kiedy użyto linku
  status: 'pending' | 'completed' | 'rewarded';
  rewardsClaimed: boolean;
  metadata?: {
    joinedFrom: 'link' | 'qr' | 'direct';
    deviceType?: string;
    ipHash?: string;           // Dla wykrywania duplikatów
    userAgent?: string;
  };
}

export interface ReferralStats {
  userId: string;
  userName?: string;            // Display name (basename, .sphere, .camper, etc.)
  totalReferrals: number;       // Łączna liczba referali
  successfulReferrals: number;  // Liczba aktywnych referali
  pendingReferrals: number;     // Oczekujące na aktywację
  totalRewards: number;          // Łączne nagrody w punktach
  referralCode: string;          // Unikalny kod użytkownika
  referralLink: string;          // Pełny link referalowy
  createdAt: Timestamp | Date;
  lastUpdated?: Timestamp | Date;
  milestones?: {
    five: boolean;              // Osiągnięto 5 referali
    ten: boolean;               // Osiągnięto 10 referali
    twentyFive: boolean;        // Osiągnięto 25 referali
    fifty: boolean;             // Osiągnięto 50 referali
  };
}

export interface ReferralReward {
  id?: string;
  userId: string;
  referralId: string;           // ID powiązanego referala
  amount: number;                // Liczba punktów
  type: 'signup' | 'first_post' | 'milestone' | 'special';
  description: string;
  timestamp: Timestamp | Date;
  claimed: boolean;
}

export interface ReferralConfig {
  rewardPerReferral: number;     // Podstawowa nagroda za referala
  firstPostBonus: number;        // Bonus za pierwszy post poleconego
  milestoneRewards: {
    five: number;
    ten: number;
    twentyFive: number;
    fifty: number;
  };
  minActivityForReward: {        // Minimalna aktywność dla nagrody
    posts: number;
    days: number;
  };
}

// Domyślna konfiguracja nagród
export const DEFAULT_REFERRAL_CONFIG: ReferralConfig = {
  rewardPerReferral: 100,        // 100 punktów za każdego referala
  firstPostBonus: 50,            // +50 punktów gdy polecony napisze pierwszy post
  milestoneRewards: {
    five: 250,                   // Bonus 250 punktów za 5 referali
    ten: 500,                    // Bonus 500 punktów za 10 referali
    twentyFive: 1500,            // Bonus 1500 punktów za 25 referali
    fifty: 5000                  // Bonus 5000 punktów za 50 referali
  },
  minActivityForReward: {
    posts: 1,                    // Minimum 1 post
    days: 7                      // W ciągu 7 dni od rejestracji
  }
};