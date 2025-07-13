'use client';

import React from 'react';
import AdminPanel from '../components/AdminPanel/AdminPanel';
import { Toaster } from 'react-hot-toast';

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-slate-900">
      <AdminPanel />
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1e293b',
            color: '#fff',
            border: '1px solid #334155'
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff'
            }
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff'
            }
          }
        }}
      />
    </div>
  );
} 