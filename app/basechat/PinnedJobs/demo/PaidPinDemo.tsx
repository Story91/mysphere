'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { Crown, Clock, DollarSign, Zap } from 'lucide-react';
import { PaidPinButton, PinTimer, getAllDurations, formatTimeLeft } from '../index';
import { PinDuration } from '../../../utils/firebase';

export default function PaidPinDemo() {
  const { address } = useAccount();
  
  const [demoPost] = useState({
    id: 'demo-post-1',
    content: 'This is a demo post showing how the paid pin system works! 🚀 Users can pin posts for visibility and admins can see revenue analytics.',
    author: '0x1234567890123456789012345678901234567890', // Placeholder, will use current address in component
    isPinned: false,
    isPaidPin: false
  });

  const [demoTimer] = useState({
    postId: 'demo-timer-post',
    expiresAt: Date.now() + (25 * 60 * 1000), // 25 minutes from now (to see the timer in action)
    isPaidPin: true,
    pinOwner: '0x1234567890123456789012345678901234567890',
    duration: 'HOURS_6' as PinDuration
  });

  const prices = getAllDurations();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          💰 Paid Pinned Posts Demo
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Test wszystkich komponentów systemu płatnych przypiętych postów
        </p>
      </div>

      {/* Pricing Demo */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
          <Crown className="w-5 h-5 mr-2 text-yellow-500" />
          Pricing Options
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {prices.map((price) => (
            <div key={price.duration} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {price.label}
              </div>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 my-2">
                {price.priceETH} ETH
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                ~${price.priceUSD}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {price.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pin Button Demo */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
          <DollarSign className="w-5 h-5 mr-2 text-green-500" />
          Pin Button Demo
        </h2>
        
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4">
          <p className="text-gray-900 dark:text-white mb-3">
            {demoPost.content}
          </p>
          <div className="flex items-center space-x-4">
            <button className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span className="text-xs">42</span>
            </button>
            
            <button className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs">8</span>
            </button>

            {/* Demo Pin Button */}
            <PaidPinButton
              postId={demoPost.id}
              postContent={demoPost.content}
              authorAddress={address || '0x0000000000000000000000000000000000000000'} // Use current user's address for demo
              isPinned={demoPost.isPinned}
              isPaidPin={demoPost.isPaidPin}
              onPinSuccess={(txHash, duration) => {
                console.log('Demo pin success:', { txHash, duration });
                alert(`Demo: Post would be pinned for ${duration} with tx: ${txHash.slice(0, 10)}...`);
              }}
            />
          </div>
        </div>
        
        <div className="text-sm text-gray-600 dark:text-gray-400">
          💡 Kliknij "Pin Post" aby zobaczyć modal płatności
        </div>
      </div>

      {/* Timer Demo */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
          <Clock className="w-5 h-5 mr-2 text-blue-500" />
          Pin Timer Demo
        </h2>
        
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4">
          <p className="text-gray-900 dark:text-white mb-3">
            This post is currently pinned and will expire soon. Watch the countdown!
          </p>
          
          <PinTimer
            postId={demoTimer.postId}
            expiresAt={demoTimer.expiresAt}
            isPaidPin={demoTimer.isPaidPin}
            pinOwner={demoTimer.pinOwner}
            duration={demoTimer.duration}
            onExtendClick={() => {
              alert('Demo: Extend pin modal would open here');
            }}
          />
        </div>
        
        <div className="text-sm text-gray-600 dark:text-gray-400">
          ⏱️ Timer aktualizuje się co sekundę i zmienia kolory w zależności od pozostałego czasu
        </div>
      </div>

      {/* Integration Instructions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
          <Zap className="w-5 h-5 mr-2 text-purple-500" />
          Integration Summary
        </h2>
        
        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">✅ Completed</h3>
            <ul className="space-y-1">
              <li>• PaidPinModal - kompletny UI do płacenia za piny</li>
              <li>• PinTimer - countdown z progress bar</li>
              <li>• PaidPinButton - integration button dla PostList</li>
              <li>• TypeScript types dla całego systemu</li>
              <li>• Pricing logic z tańszymi cenami</li>
              <li>• PostList integration (importy i komponenty)</li>
            </ul>
          </div>
          
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-2">⏳ Next Steps</h3>
            <ul className="space-y-1">
              <li>• Smart contract implementation</li>
              <li>• Cron job dla auto cleanup</li>
              <li>• Firebase functions dla paid pins</li>
              <li>• Admin dashboard dla revenue</li>
              <li>• Extend pin functionality</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 