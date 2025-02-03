'use client';

import { useState, useCallback } from 'react';

declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export function useReCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startVerification = useCallback(async (action: string) => {
    console.log('🚀 Starting reCAPTCHA verification process...');
    console.log('📝 Action:', action);
    
    setIsVerifying(true);
    setError(null);
    
    try {
      console.log('🔍 Checking grecaptcha object availability...');
      
      if (!window.grecaptcha) {
        console.error('❌ grecaptcha object is not available!');
        console.log('💡 window.grecaptcha:', window.grecaptcha);
        throw new Error('reCAPTCHA is not available');
      }

      console.log('✅ grecaptcha object found');
      
      await new Promise<void>((resolve) => {
        console.log('⏳ Waiting for reCAPTCHA to be ready...');
        window.grecaptcha.ready(() => {
          console.log('✅ reCAPTCHA is ready to use');
          resolve();
        });
      });

      console.log('🎯 Executing reCAPTCHA verification...');
      const token = await window.grecaptcha.execute(
        RECAPTCHA_SITE_KEY!,
        { action }
      );

      console.log('🎫 Token received:', token.substring(0, 20) + '...');

      console.log('🌐 Sending token for server verification...');
      const response = await fetch('/api/verify-recaptcha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, action }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server response error:', response.status, errorText);
        throw new Error('reCAPTCHA verification failed');
      }

      const { score } = await response.json();
      console.log('📊 Verification score received:', score);
      
      if (score < 0.5) {
        console.error('❌ Verification score too low:', score);
        throw new Error('reCAPTCHA verification score too low');
      }

      console.log('✅ Verification completed successfully! Score:', score);
      setToken(token);
      return token;
    } catch (err) {
      console.error('❌ Error during reCAPTCHA verification:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      throw err;
    } finally {
      setIsVerifying(false);
      console.log('🏁 Verification process completed');
    }
  }, []);

  return {
    startVerification,
    token,
    isVerifying,
    error,
  };
}

export default useReCaptcha; 