'use client';

import { useLinkSocials, useSocials, useAuthState, useModal } from '@campnetwork/origin/react';
import { motion } from 'framer-motion';

interface SocialPlatform {
  id: 'twitter' | 'spotify' | 'tiktok';
  name: string;
  icon: string;
  color: string;
  available: boolean;
}

const socialPlatforms: SocialPlatform[] = [
  { id: 'twitter', name: 'Twitter', icon: '🐦', color: 'blue', available: true },
  { id: 'spotify', name: 'Spotify', icon: '🎵', color: 'green', available: true },
  { id: 'tiktok', name: 'TikTok', icon: '🎬', color: 'pink', available: true }
];

export default function SocialLinksManager() {
  const { authenticated } = useAuthState();
  const { data: socialsData, isLoading, error } = useSocials();
  const modal = useModal();
  const {
    linkTwitter,
    linkSpotify,
    linkTiktok,
    unlinkTwitter,
    unlinkSpotify,
    unlinkTiktok
  } = useLinkSocials();

  // Debug logging - DISABLED
  // console.log('🔍 SocialLinksManager Debug:', {
  //   authenticated,
  //   isLoading,
  //   error,
  //   socialsData,
  //   hasSocialsData: !!socialsData,
  //   socialsDataKeys: socialsData ? Object.keys(socialsData) : [],
  //   linkFunctions: {
  //     linkTwitter: typeof linkTwitter,
  //     linkSpotify: typeof linkSpotify,
  //     linkTiktok: typeof linkTiktok,
  //     unlinkTwitter: typeof unlinkTwitter,
  //     unlinkSpotify: typeof unlinkSpotify,
  //     unlinkTiktok: typeof unlinkTiktok
  //   }
  // });

  if (!authenticated) {
    return (
      <div className="text-center py-8">
        <p className="text-orange-200">Please connect to Camp Network first</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-400 mx-auto"></div>
        <p className="text-orange-200 mt-2">Loading social accounts...</p>
      </div>
    );
  }

  const handleSocialAction = async (platform: SocialPlatform) => {
    const isConnected = (socialsData as any)?.[platform.id];
    
    console.log(`🔗 ${isConnected ? 'Unlinking' : 'Linking'} ${platform.name}...`);
    
    // Sprawdź czy jesteśmy na mobile czy desktop
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    try {
      if (!isMobile) {
        // Na desktop używamy modalu Camp Network
        console.log('💻 Desktop detected - opening Camp Modal for social action...');
        modal.openModal();
      } else {
        // Na mobile próbujemy bezpośrednio
        // console.log('📱 Mobile detected - trying direct social action...');
        switch (platform.id) {
          case 'twitter':
            if (isConnected) {
              console.log('🐦 Unlinking Twitter...');
              await unlinkTwitter();
            } else {
              console.log('🐦 Linking Twitter...');
              await linkTwitter();
            }
            break;
          case 'tiktok':
            if (isConnected) {
              console.log('🎬 Unlinking TikTok...');
              await unlinkTiktok();
            } else {
              console.log('🎬 Linking TikTok...');
              await linkTiktok();
            }
            break;
          case 'spotify':
            if (isConnected) {
              console.log('🎵 Unlinking Spotify...');
              await unlinkSpotify();
            } else {
              console.log('🎵 Linking Spotify...');
              await linkSpotify();
            }
            break;
        }
        console.log(`✅ ${platform.name} ${isConnected ? 'unlinked' : 'linked'} successfully`);
      }
    } catch (error) {
      console.error(`❌ Failed to ${isConnected ? 'unlink' : 'link'} ${platform.name}:`, error);
      // Fallback - jeśli bezpośrednie wywołanie nie działa, otwórz modal
      if (isMobile) {
        console.log('⚠️ Direct action failed, falling back to modal...');
        modal.openModal();
      }
    }
  };

  return (
    <div className="space-y-4">
      {socialPlatforms.map((platform, index) => {
        const isConnected = (socialsData as any)?.[platform.id];
        
        return (
          <motion.div
            key={platform.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="bg-black/40 rounded-xl p-4 border border-orange-500/10 hover:border-orange-500/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{platform.icon}</span>
                <div>
                  <h4 className="text-orange-100 font-medium">{platform.name}</h4>
                  <p className="text-orange-200/70 text-sm">
                    {isConnected ? 'Connected to your account' : 'Not connected'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  isConnected 
                    ? 'bg-green-500/20 text-green-300' 
                    : 'bg-orange-500/20 text-orange-300'
                }`}>
                  {isConnected ? '✅ Connected' : '❌ Not Connected'}
                </span>
                
                <button
                  onClick={() => handleSocialAction(platform)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isConnected
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200'
                      : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 hover:text-orange-200'
                  }`}
                >
                  {isConnected ? 'Unlink' : 'Link'}
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}
      
      <div className="mt-6 p-4 bg-orange-500/10 rounded-xl border border-orange-500/20">
        <p className="text-orange-200/70 text-sm">
          💡 <strong>Tip:</strong> Linking your social accounts allows Camp Network to verify your 
          social presence and enables advanced features like social-based reputation.
        </p>
        <p className="text-orange-200/60 text-xs mt-2">
          🖥️ <strong>Desktop:</strong> Click buttons to open Camp Modal | 📱 <strong>Mobile:</strong> Direct linking available
        </p>
      </div>
    </div>
  );
} 