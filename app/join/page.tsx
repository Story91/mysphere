'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { motion } from 'framer-motion';
import { 
  registerReferral, 
  findUserByReferralCode,
  checkIfUserWasReferred 
} from '../utils/referrals';
import { fetchUserProfile } from '../utils/firebase';
import { FiGift, FiUsers, FiTrendingUp, FiCheck, FiArrowRight } from 'react-icons/fi';

// Komponent do obsługi parametrów URL
function JoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { address, isConnected } = useAccount();
  
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referrerName, setReferrerName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyReferred, setAlreadyReferred] = useState(false);

  // Pobierz kod referalowy z URL
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setReferralCode(ref);
      loadReferrerInfo(ref);
    } else {
      // Jeśli brak kodu, przekieruj do głównej strony
      router.push('/basechat');
    }
  }, [searchParams, router]);

  // Załaduj informacje o polecającym
  const loadReferrerInfo = async (code: string) => {
    try {
      const referrerId = await findUserByReferralCode(code);
      if (referrerId) {
        const profile = await fetchUserProfile(referrerId);
        if (profile) {
          setReferrerName(profile.name || `${referrerId.slice(0, 6)}...${referrerId.slice(-4)}`);
        }
      } else {
        setError('Nieprawidłowy kod referalowy');
      }
    } catch (err) {
      console.error('Błąd podczas ładowania danych polecającego:', err);
      setError('Nie udało się załadować danych');
    }
  };

  // Sprawdź czy użytkownik już był polecony
  useEffect(() => {
    const checkReferralStatus = async () => {
      if (address) {
        const status = await checkIfUserWasReferred(address);
        if (status.wasReferred) {
          setAlreadyReferred(true);
          setError('Twoje konto już zostało polecone wcześniej');
        }
      }
    };

    checkReferralStatus();
  }, [address]);

  // Obsługa rejestracji z kodem referalowym
  useEffect(() => {
    const handleReferralRegistration = async () => {
      if (isConnected && address && referralCode && !isRegistered && !alreadyReferred && !isProcessing) {
        setIsProcessing(true);
        setError(null);

        try {
          // Pobierz metadane
          const metadata = {
            userAgent: navigator.userAgent,
            deviceType: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            joinedFrom: 'link' as const
          };

          // Zarejestruj referal
          const success = await registerReferral(referralCode, address, metadata);

          if (success) {
            setIsRegistered(true);
            // Przekieruj do BaseChat po 3 sekundach
            setTimeout(() => {
              router.push('/basechat?welcome=true');
            }, 3000);
          } else {
            setError('Registration failed. You may have already used another referral link before.');
          }
        } catch (err) {
          console.error('Registration error:', err);
          setError('An error occurred during registration');
        } finally {
          setIsProcessing(false);
        }
      }
    };

    handleReferralRegistration();
  }, [isConnected, address, referralCode, isRegistered, alreadyReferred, isProcessing, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
            Join MySphere! 🚀
          </h1>
          {referrerName && (
            <p className="text-xl text-gray-800 dark:text-gray-200 font-medium">
              You were invited by <span className="font-bold text-blue-600 dark:text-blue-400">{referrerName}</span>
            </p>
          )}
        </motion.div>

        {/* Korzyści */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid md:grid-cols-3 gap-6 mb-12"
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-blue-100 dark:bg-blue-900 rounded-full w-12 h-12 flex items-center justify-center mb-4">
              <FiGift className="text-blue-600 dark:text-blue-400 text-xl" />
            </div>
            <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Welcome Bonus</h3>
            <p className="text-gray-700 dark:text-gray-300">
              Get extra points for joining through a referral link
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-purple-100 dark:bg-purple-900 rounded-full w-12 h-12 flex items-center justify-center mb-4">
              <FiUsers className="text-purple-600 dark:text-purple-400 text-xl" />
            </div>
            <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Community</h3>
            <p className="text-gray-700 dark:text-gray-300">
              Join an active community of builders on Base
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-green-100 dark:bg-green-900 rounded-full w-12 h-12 flex items-center justify-center mb-4">
              <FiTrendingUp className="text-green-600 dark:text-green-400 text-xl" />
            </div>
            <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Growth</h3>
            <p className="text-gray-700 dark:text-gray-300">
              Earn points, badges and grow your position in the community
            </p>
          </div>
        </motion.div>

        {/* Status Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl"
        >
          {!isConnected ? (
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Connect your wallet to continue</h2>
              <p className="text-gray-700 dark:text-gray-300 mb-6 font-medium">
                Connect your wallet to join MySphere and receive your welcome bonus
              </p>
              <div className="flex justify-center">
                <ConnectWallet />
              </div>
            </div>
          ) : isRegistered ? (
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="bg-green-100 dark:bg-green-900 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4"
              >
                <FiCheck className="text-green-600 dark:text-green-400 text-3xl" />
              </motion.div>
              <h2 className="text-2xl font-semibold mb-4 text-green-600 dark:text-green-400">
                Registration successful!
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4 font-medium">
                Welcome to MySphere! You will be redirected shortly...
              </p>
              <div className="flex justify-center items-center gap-2 text-blue-600 dark:text-blue-400">
                <span>Redirecting to app</span>
                <FiArrowRight className="animate-pulse" />
              </div>
            </div>
          ) : isProcessing ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold mb-2">Registering...</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Setting up your account...
              </p>
            </div>
          ) : error ? (
            <div className="text-center">
              <div className="bg-red-100 dark:bg-red-900 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-xl font-semibold mb-2 text-red-600 dark:text-red-400">
                Oops! Something went wrong
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4 font-medium">{error}</p>
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Don't worry! You can still join MySphere and participate in the community.
                </p>
                <button
                  onClick={() => router.push('/basechat')}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Continue to MySphere
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Preparing registration...</h2>
              <p className="text-gray-700 dark:text-gray-300">
                Checking your status...
              </p>
            </div>
          )}
        </motion.div>

        {/* Informacje dodatkowe */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-12 text-center text-sm text-gray-600 dark:text-gray-400"
        >
          <p>
            By joining through a referral link, you accept our{' '}
            <a href="/terms" className="text-blue-600 hover:underline">
              terms of service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-blue-600 hover:underline">
              privacy policy
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

// Główny komponent z Suspense
export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <JoinContent />
    </Suspense>
  );
}