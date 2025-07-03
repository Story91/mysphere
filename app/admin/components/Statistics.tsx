'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, where, orderBy, limit, Timestamp, getDoc, doc } from 'firebase/firestore';
import { db, updateAllUserJoinDates, addBaseNameBonusToAllUsers, fixBaseChatPointsRadical, refreshAllPosts, saveProfileName, refreshUserRankings } from '../../utils/firebase';
import { useName } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';

interface UserWithJoinDate {
  address: string;
  name?: string;
  joinedAt: number;
  lastActive?: number;
}

interface RefreshAllPostsResult {
  success: boolean;
  processedPosts?: number;
  updatedPosts?: number;
  updatedUsers?: number;
  error?: string;
}

interface Stats {
  users: {
    total: number;
    active24h: number;
    active7d: number;
    banned: number;
  };
  content: {
    totalPosts: number;
    totalComments: number;
    postsToday: number;
    commentsToday: number;
  };
  topUsers: Array<{
    address: string;
    name?: string;
    posts: number;
    comments: number;
  }>;
  recentUsers?: UserWithJoinDate[];
}

export default function Statistics() {
  // ⚠️ EMERGENCY FIREBASE COST REDUCTION - COMPONENT DISABLED
  return (
    <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
      <h2 className="text-xl font-bold text-red-800 mb-4">⚠️ Statystyki tymczasowo wyłączone</h2>
      <p className="text-red-700">
        Z powodu wysokich kosztów Firebase, panel statystyk został tymczasowo wyłączony.
        <br />
        Każde wywołanie tego panelu generowało 3000+ odczytów z Firebase.
        <br /><br />
        <strong>Oszczędności:</strong> 3000+ odczytów na każde załadowanie strony
      </p>
      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
        <p className="text-green-700 text-sm">
          ✅ Komponent wyłączony w ramach redukcji kosztów Firebase o 90-95%
        </p>
      </div>
    </div>
  );
} 