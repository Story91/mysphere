'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose?: () => void;
}

export const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'info', 
  duration = 5000,
  onClose 
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  // Reset timer when message/type change (aktualizacja toastu)
  }, [duration, onClose, message, type]);

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      case 'warning':
        return 'bg-orange-500 text-white';
      default:
        return 'bg-blue-500 text-white';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.9 }}
      className={`flex items-center gap-3 px-6 py-4 rounded-lg shadow-lg ${getStyles()} backdrop-blur-sm min-w-[300px] max-w-[500px]`}
    >
      <span className="text-2xl flex-shrink-0">{getIcon()}</span>
      <p className="font-medium flex-1">{message}</p>
      <button
        onClick={onClose}
        className="ml-4 text-white/80 hover:text-white transition-colors flex-shrink-0"
      >
        ✕
      </button>
    </motion.div>
  );
};

// Toast Provider
interface ToastContextType {
  showToast: (
    message: string,
    type?: ToastProps['type'],
    duration?: number,
    options?: { key?: string }
  ) => void;
}

const ToastContext = React.createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<(ToastProps & { id: string; key?: string })[]>([]);
  // Rate-limit duplicate toasts (by key or message)
  const lastShownRef = React.useRef<Map<string, number>>(new Map());

  const showToast = (
    message: string,
    type: ToastProps['type'] = 'info',
    duration = 5000,
    options?: { key?: string }
  ) => {
    const now = Date.now();
    const dedupeKey = options?.key || message;
    const last = lastShownRef.current.get(dedupeKey) || 0;
    // ignore bursts within 900ms
    if (now - last < 900) return;
    lastShownRef.current.set(dedupeKey, now);

    setToasts(prev => {
      // If a toast with the same key exists, update it instead of adding
      if (options?.key) {
        const index = prev.findIndex(t => t.key === options.key);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], message, type, duration };
          return updated;
        }
      }

      const id = now.toString();
      const newToasts = [...prev, { id, key: options?.key, message, type, duration }];
      // Limit to max 3 toasts
      if (newToasts.length > 3) {
        return newToasts.slice(-3);
      }
      return newToasts;
    });
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence mode="sync">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 100, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.8 }}
              transition={{ 
                type: "spring", 
                stiffness: 400, 
                damping: 25,
                mass: 0.5
              }}
              className="pointer-events-auto"
            >
              <Toast
                message={toast.message}
                type={toast.type}
                duration={toast.duration}
                onClose={() => removeToast(toast.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
