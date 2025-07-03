'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, setDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { UserProfile } from '../../types';

interface ExtendedUserProfile extends UserProfile {
  isBanned?: boolean;
  banReason?: string;
  joinedAt?: number;
}

export default function UserManagement() {
  // ⚠️ EMERGENCY FIREBASE COST REDUCTION - COMPONENT DISABLED
  return (
    <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
      <h2 className="text-xl font-bold text-red-800 mb-4">⚠️ Zarządzanie użytkownikami tymczasowo wyłączone</h2>
      <p className="text-red-700">
        Z powodu wysokich kosztów Firebase, panel zarządzania użytkownikami został tymczasowo wyłączony.
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