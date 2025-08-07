// Główny plik eksportujący wszystkie funkcje i typy systemu referali
export * from './types';
export * from './referralService';
export * from './referralHooks';

// Re-eksport najważniejszych funkcji dla łatwiejszego importu
export {
  // Typy
  type Referral,
  type ReferralStats,
  type ReferralReward,
  type ReferralConfig,
  DEFAULT_REFERRAL_CONFIG,
  
  // Serwisy
  generateReferralCode,
  generateReferralLink,
  initializeReferralStats,
  getUserReferralStats,
  registerReferral,
  activateReferral,
  awardReferralPoints,
  checkAndAwardMilestones,
  getUserReferrals,
  getUserReferralRewards,
  checkIfUserWasReferred,
  awardFirstPostBonus,
  findUserByReferralCode,
  
  // Hooki
  useReferralStats,
  useUserReferrals,
  useReferralRewards,
  useReferralRegistration,
  useReferralStatus,
  useReferralLink,
  useReferralQRCode,
  useMilestoneProgress
} from './index';