'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Info, 
  X, 
  AlertTriangle,
  Clock,
  ExternalLink,
  Copy,
  RefreshCw,
  Zap,
  TrendingUp,
  Award,
  Gift,
  DollarSign
} from 'lucide-react';

// Interfejsy
interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'loading' | 'transaction';
  title: string;
  message: string;
  duration?: number;
  isAutoDismiss?: boolean;
  action?: ToastAction;
  transactionHash?: string;
  timestamp: Date;
  metadata?: {
    amount?: number;
    token?: string;
    gasUsed?: number;
    gasFee?: number;
    blockNumber?: number;
    retryCount?: number;
  };
}

interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

interface ToastContextType {
  notifications: ToastNotification[];
  addToast: (toast: Omit<ToastNotification, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;
  updateToast: (id: string, updates: Partial<ToastNotification>) => void;
  clearAll: () => void;
}

// Context
const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Hook do używania toast
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Provider component
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  // Funkcja dodawania toast
  const addToast = (toast: Omit<ToastNotification, 'id' | 'timestamp'>) => {
    const newToast: ToastNotification = {
      ...toast,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      duration: toast.duration || (toast.type === 'loading' ? 0 : 5000),
      isAutoDismiss: toast.isAutoDismiss !== false
    };

    setNotifications(prev => [...prev, newToast]);

    // Auto-dismiss
    if (newToast.isAutoDismiss && newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        removeToast(newToast.id);
      }, newToast.duration);
    }
  };

  // Funkcja usuwania toast
  const removeToast = (id: string) => {
    setNotifications(prev => prev.filter(toast => toast.id !== id));
  };

  // Funkcja aktualizacji toast
  const updateToast = (id: string, updates: Partial<ToastNotification>) => {
    setNotifications(prev => prev.map(toast => 
      toast.id === id ? { ...toast, ...updates } : toast
    ));
  };

  // Funkcja czyszczenia wszystkich toast
  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <ToastContext.Provider value={{ notifications, addToast, removeToast, updateToast, clearAll }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

// Komponent kontenera toast
const ToastContainer: React.FC = () => {
  const { notifications } = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-md">
      <AnimatePresence>
        {notifications.map((notification) => (
          <ToastItem key={notification.id} notification={notification} />
        ))}
      </AnimatePresence>
    </div>
  );
};

// Komponent pojedynczego toast
const ToastItem: React.FC<{ notification: ToastNotification }> = ({ notification }) => {
  const { removeToast, updateToast } = useToast();
  const [isHovered, setIsHovered] = useState(false);

  // Funkcja określająca styl toast
  const getToastStyle = () => {
    switch (notification.type) {
      case 'success':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      case 'error':
        return 'bg-red-500/10 border-red-500/30 text-red-400';
      case 'warning':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400';
      case 'info':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'loading':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      case 'transaction':
        return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
      default:
        return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
    }
  };

  // Funkcja określająca ikonę
  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-400" />;
      case 'loading':
        return <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />;
      case 'transaction':
        return <Zap className="w-5 h-5 text-blue-400" />;
      default:
        return <Info className="w-5 h-5 text-gray-400" />;
    }
  };

  // Funkcja kopiowania hash transakcji
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    updateToast(notification.id, {
      message: 'Hash transakcji skopiowany!'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.8 }}
      className={`
        relative p-4 rounded-lg border backdrop-blur-sm
        ${getToastStyle()}
        cursor-pointer transition-all duration-200
        ${isHovered ? 'shadow-lg transform scale-105' : ''}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-semibold text-white text-sm mb-1">
                {notification.title}
              </h4>
              <p className="text-sm text-gray-300 leading-relaxed">
                {notification.message}
              </p>
            </div>
            
            <button
              onClick={() => removeToast(notification.id)}
              className="ml-2 p-1 hover:bg-gray-700/50 rounded transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Metadata transakcji */}
          {notification.metadata && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {notification.metadata.amount && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Kwota:</span>
                    <span className="text-white">
                      {notification.metadata.amount} {notification.metadata.token || 'ETH'}
                    </span>
                  </div>
                )}
                {notification.metadata.gasFee && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Gas:</span>
                    <span className="text-white">{notification.metadata.gasFee} ETH</span>
                  </div>
                )}
                {notification.metadata.blockNumber && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Blok:</span>
                    <span className="text-white">{notification.metadata.blockNumber}</span>
                  </div>
                )}
                {notification.metadata.retryCount && notification.metadata.retryCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Próby:</span>
                    <span className="text-yellow-400">{notification.metadata.retryCount}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hash transakcji */}
          {notification.transactionHash && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Hash:</span>
                <code className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                  {notification.transactionHash.slice(0, 6)}...{notification.transactionHash.slice(-4)}
                </code>
                <button
                  onClick={() => copyToClipboard(notification.transactionHash!)}
                  className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                >
                  <Copy className="w-3 h-3 text-gray-400" />
                </button>
                <button
                  onClick={() => window.open(`https://basescan.org/tx/${notification.transactionHash}`, '_blank')}
                  className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                >
                  <ExternalLink className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            </div>
          )}

          {/* Akcje */}
          {notification.action && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <button
                onClick={notification.action.onClick}
                className={`
                  w-full px-3 py-2 rounded text-sm font-medium transition-colors
                  ${notification.action.variant === 'primary' 
                    ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' 
                    : notification.action.variant === 'danger'
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                  }
                `}
              >
                {notification.action.label}
              </button>
            </div>
          )}

          {/* Timestamp */}
          <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            <span>{notification.timestamp.toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* Progress bar dla loading */}
      {notification.type === 'loading' && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700/50 rounded-b-lg overflow-hidden">
          <div className="h-full bg-purple-500 animate-pulse" />
        </div>
      )}
    </motion.div>
  );
};

// Hook z predefiniowanymi funkcjami
export const useNotifications = () => {
  const { addToast, removeToast, updateToast } = useToast();

  return {
    // Podstawowe notyfikacje
    success: (title: string, message: string, action?: ToastAction) => {
      addToast({ type: 'success', title, message, action });
    },
    
    error: (title: string, message: string, action?: ToastAction) => {
      addToast({ type: 'error', title, message, action });
    },
    
    warning: (title: string, message: string, action?: ToastAction) => {
      addToast({ type: 'warning', title, message, action });
    },
    
    info: (title: string, message: string, action?: ToastAction) => {
      addToast({ type: 'info', title, message, action });
    },

    // Notyfikacje związane z transakcjami
    transactionPending: (hash: string, amount?: number, token?: string) => {
      const id = addToast({
        type: 'loading',
        title: 'Transakcja w toku',
        message: 'Oczekiwanie na potwierdzenie...',
        transactionHash: hash,
        metadata: { amount, token },
        isAutoDismiss: false
      });
      return id;
    },
    
    transactionSuccess: (hash: string, amount?: number, token?: string, gasFee?: number) => {
      addToast({
        type: 'success',
        title: 'Transakcja zakończona pomyślnie',
        message: 'Transakcja została potwierdzona w blockchain',
        transactionHash: hash,
        metadata: { amount, token, gasFee },
        action: {
          label: 'Zobacz na Basescan',
          onClick: () => window.open(`https://basescan.org/tx/${hash}`, '_blank')
        }
      });
    },
    
    transactionError: (error: string, hash?: string, retryFn?: () => void) => {
      addToast({
        type: 'error',
        title: 'Transakcja nieudana',
        message: error,
        transactionHash: hash,
        action: retryFn ? {
          label: 'Spróbuj ponownie',
          onClick: retryFn,
          variant: 'primary'
        } : undefined
      });
    },

    // Notyfikacje związane z rewards
    rewardEarned: (type: string, amount: number, description: string) => {
      addToast({
        type: 'success',
        title: 'Nagroda otrzymana!',
        message: `${description}: ${amount} ${type}`,
        metadata: { amount, token: type },
        duration: 8000
      });
    },
    
    levelUp: (newLevel: number, rewards: string[]) => {
      addToast({
        type: 'success',
        title: 'Poziom podniesiony!',
        message: `Gratulacje! Osiągnąłeś poziom ${newLevel}`,
        metadata: { amount: newLevel },
        duration: 10000
      });
    },

    // Notyfikacje związane z community
    communityUpdate: (title: string, message: string) => {
      addToast({
        type: 'info',
        title,
        message,
        duration: 7000
      });
    },
    
    membershipExpiring: (daysLeft: number) => {
      addToast({
        type: 'warning',
        title: 'Członkostwo wygasa',
        message: `Twoje członkostwo premium wygaśnie za ${daysLeft} dni`,
        action: {
          label: 'Odnów członkostwo',
          onClick: () => {/* Implementacja odnowienia */},
          variant: 'primary'
        }
      });
    },

    // Notyfikacje związane z eventami
    eventReminder: (eventName: string, startsIn: string) => {
      addToast({
        type: 'info',
        title: 'Przypomnienie o evencie',
        message: `Event "${eventName}" rozpocznie się za ${startsIn}`,
        duration: 8000
      });
    },
    
    eventStarted: (eventName: string) => {
      addToast({
        type: 'info',
        title: 'Event rozpoczęty',
        message: `Event "${eventName}" właśnie się rozpoczął!`,
        action: {
          label: 'Dołącz teraz',
          onClick: () => {/* Implementacja dołączenia */},
          variant: 'primary'
        }
      });
    },

    // Notyfikacje związane z UtilityBox
    boxOpened: (boxName: string, rewards: string[]) => {
      addToast({
        type: 'success',
        title: 'Box otwarty!',
        message: `Otworzyłeś ${boxName} i otrzymałeś: ${rewards.join(', ')}`,
        duration: 10000
      });
    },
    
    rareReward: (rewardName: string, rarity: string) => {
      addToast({
        type: 'success',
        title: '🎉 Rzadka nagroda!',
        message: `Otrzymałeś ${rarity} nagrodę: ${rewardName}`,
        duration: 15000
      });
    },

    // Notyfikacje systemowe
    maintenanceMode: (message: string, duration: string) => {
      addToast({
        type: 'warning',
        title: 'Tryb konserwacji',
        message: `System będzie niedostępny ${duration}. ${message}`,
        isAutoDismiss: false
      });
    },
    
    networkError: (retryFn?: () => void) => {
      addToast({
        type: 'error',
        title: 'Błąd sieci',
        message: 'Wystąpił problem z połączeniem. Sprawdź połączenie internetowe.',
        action: retryFn ? {
          label: 'Spróbuj ponownie',
          onClick: retryFn,
          variant: 'primary'
        } : undefined
      });
    }
  };
};

// Główny komponent systemu
const ToastNotificationSystem: React.FC = () => {
  const notifications = useNotifications();
  
  // Przykładowe użycie (można usunąć w produkcji)
  const handleTestNotifications = () => {
    notifications.success('Test Success', 'To jest przykładowa notyfikacja sukcesu');
    
    setTimeout(() => {
      notifications.error('Test Error', 'To jest przykładowa notyfikacja błędu', {
        label: 'Napraw błąd',
        onClick: () => console.log('Naprawianie błędu...'),
        variant: 'danger'
      });
    }, 1000);
    
    setTimeout(() => {
      notifications.transactionPending('0x123abc...', 0.5, 'ETH');
    }, 2000);
    
    setTimeout(() => {
      notifications.rewardEarned('tokens', 100, 'Daily login bonus');
    }, 3000);
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">
          Toast Notification System
        </h1>
        
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">
            Przykłady notyfikacji
          </h2>
          <p className="text-gray-400 mb-6">
            System notyfikacji obsługuje różne typy powiadomień z animacjami i interakcjami.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={() => notifications.success('Sukces!', 'Operacja zakończona pomyślnie')}
              className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-colors"
            >
              <CheckCircle className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <div className="text-sm font-medium text-green-400">Success Toast</div>
            </button>
            
            <button
              onClick={() => notifications.error('Błąd!', 'Wystąpił nieoczekiwany błąd')}
              className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              <XCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <div className="text-sm font-medium text-red-400">Error Toast</div>
            </button>
            
            <button
              onClick={() => notifications.transactionPending('0x123abc...', 0.5, 'ETH')}
              className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg hover:bg-purple-500/20 transition-colors"
            >
              <Zap className="w-6 h-6 text-purple-400 mx-auto mb-2" />
              <div className="text-sm font-medium text-purple-400">Transaction Toast</div>
            </button>
            
            <button
              onClick={() => notifications.rewardEarned('tokens', 100, 'Daily bonus')}
              className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/20 transition-colors"
            >
              <Gift className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
              <div className="text-sm font-medium text-yellow-400">Reward Toast</div>
            </button>
            
            <button
              onClick={() => notifications.levelUp(5, ['New badge', 'More tokens'])}
              className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-colors"
            >
              <TrendingUp className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <div className="text-sm font-medium text-blue-400">Level Up Toast</div>
            </button>
            
            <button
              onClick={handleTestNotifications}
              className="p-4 bg-gray-500/10 border border-gray-500/30 rounded-lg hover:bg-gray-500/20 transition-colors"
            >
              <Award className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <div className="text-sm font-medium text-gray-400">Test All</div>
            </button>
          </div>
        </div>
        
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">
            Funkcje systemu
          </h3>
          <ul className="space-y-2 text-gray-300">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>Różne typy notyfikacji (success, error, warning, info, loading)</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>Animacje wejścia i wyjścia</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>Obsługa transakcji blockchain z hash i linkami</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>Akcje do wykonania (retry, view, etc.)</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>Metadata i szczegóły transakcji</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>Auto-dismiss z konfigurowalnymi czasami</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>Kopiowanie hash transakcji</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>Linki do block explorów</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ToastNotificationSystem; 