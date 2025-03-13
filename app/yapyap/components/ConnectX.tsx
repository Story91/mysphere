'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateCodeVerifier, generateCodeChallenge } from '../utils/pkce';

interface ConnectXProps {
  onConnect: (username: string, accessToken: string) => void;
  onCancel: () => void;
}

const SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'offline.access'
].join(' ');

export default function ConnectX({ onConnect, onCancel }: ConnectXProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for mobile auth completion
  useEffect(() => {
    const checkMobileAuth = async () => {
      const code = localStorage.getItem('x_auth_code');
      if (code) {
        setIsAuthenticating(true);
        setError(null);

        try {
          const codeVerifier = localStorage.getItem('codeVerifier');
          if (!codeVerifier) {
            throw new Error('Code verifier not found');
          }

          console.log('Exchanging code for token...');
          // Exchange code for access token
          const tokenResponse = await fetch('/api/x/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              code,
              code_verifier: codeVerifier
            })
          });

          if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            console.error('Token exchange error:', errorData);
            throw new Error(`Failed to get access token: ${errorData.error || 'Unknown error'}`);
          }

          const { access_token } = await tokenResponse.json();
          console.log('Got access token, fetching user info...');

          // Clean up storage
          localStorage.removeItem('x_auth_code');
          localStorage.removeItem('x_auth_state');
          localStorage.removeItem('codeVerifier');

          // Get user info
          const userResponse = await fetch(`/api/x/user?access_token=${access_token}`);
          if (!userResponse.ok) {
            const errorData = await userResponse.json();
            console.error('User info error:', errorData);
            throw new Error(`Failed to get user info: ${errorData.error || 'Unknown error'}`);
          }

          const userData = await userResponse.json();
          console.log('Authentication successful!');
          onConnect(userData.data.username, access_token);
        } catch (err) {
          console.error('X auth error:', err);
          setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
        } finally {
          setIsAuthenticating(false);
        }
      }
    };

    checkMobileAuth();
  }, [onConnect]);

  const handleConnect = async () => {
    try {
      setIsAuthenticating(true);
      setError(null);

      // Generate PKCE challenge
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      
      // Store verifier for later use
      localStorage.setItem('codeVerifier', verifier);

      // Build authorization URL with required scopes
      const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('client_id', process.env.NEXT_PUBLIC_X_CLIENT_ID || '');
      authUrl.searchParams.append('redirect_uri', process.env.NEXT_PUBLIC_X_REDIRECT_URI || '');
      authUrl.searchParams.append('scope', SCOPES);
      authUrl.searchParams.append('state', 'state');
      authUrl.searchParams.append('code_challenge', challenge);
      authUrl.searchParams.append('code_challenge_method', 'S256');

      // Redirect to X auth page
      window.location.href = authUrl.toString();
    } catch (err) {
      console.error('Connect error:', err);
      setError('Failed to connect to X');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-700"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Connect X Account</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-gray-300 text-sm">
            Connect your X account to access your attention metrics. We'll only read your public profile information.
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              disabled={isAuthenticating}
            >
              Cancel
            </button>
            <button
              onClick={handleConnect}
              disabled={isAuthenticating}
              className="px-6 py-2 bg-black text-white rounded-xl flex items-center space-x-2 hover:bg-black/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAuthenticating ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  <span>Connect with X</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
} 