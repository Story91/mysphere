'use client';

import { useEffect } from 'react';
import Script from 'next/script';

interface ReCaptchaProps {
  action: string;
  isVerifying?: boolean;
}

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

export default function ReCaptcha({ action, isVerifying = false }: ReCaptchaProps) {
  useEffect(() => {
    console.log('🔄 Initializing ReCaptcha component...');
    console.log('📝 Action:', action);

    // Check if script is already loaded
    if (typeof window !== 'undefined' && window.grecaptcha) {
      console.log('✅ ReCaptcha script is already loaded');
    } else {
      console.log('⏳ Waiting for ReCaptcha script to load...');
    }
  }, [action]);

  return (
    <>
      <Script
        src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
        onLoad={() => {
          console.log('✅ ReCaptcha script loaded successfully');
          console.log('💡 grecaptcha object status:', window.grecaptcha ? 'available' : 'not available');
        }}
        onError={(e) => {
          console.error('❌ Error loading ReCaptcha script:', e);
          console.error('💡 Error details:', {
            message: e.message,
            type: e.type,
            target: e.target
          });
        }}
      />
      {isVerifying && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-black/90 backdrop-blur-sm rounded-xl p-6 max-w-sm w-full mx-4 text-center border border-gray-800">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-sm text-gray-400">
              Verifying...
            </p>
          </div>
        </div>
      )}
      <div className="text-xs text-gray-500">
        <a href="https://policies.google.com/privacy" className="text-blue-500 hover:underline mx-1">Privacy</a>·
        <a href="https://policies.google.com/terms" className="text-blue-500 hover:underline mx-1">Terms</a>
      </div>
    </>
  );
} 