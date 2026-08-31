// ===============================================
// 🔧 CONFIG RE-EXPORT - Przekierowanie do głównej konfiguracji
// ===============================================

// Re-export konfiguracji z utils/friends
export * from '../../utils/friends/config';

// Główna instancja db dla kompatybilności wstecznej
export { db } from '../../utils/friends/config';
