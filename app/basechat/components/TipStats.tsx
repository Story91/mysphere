'use client';

import { useState, useEffect } from 'react';
import { getUserTipStats, getPostTipStats, TipStats as TipStatsType, PostTipStats, TipNetworkType, TipTokenType } from '../../utils/firebase';
import { TOKENS, NETWORKS, TipToken, TipNetwork } from './TipNetworkConfig';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface TipStatsProps {
  userAddress?: string;
  postId?: string;
  className?: string;
  /**
   * Statystyki dostarczone z zewnatrz (jedno zbiorcze zapytanie dla calego feedu).
   * Gdy podane, komponent nie robi wlasnego getDocs - to eliminuje N zapytan
   * przy N postach w feedzie.
   */
  presetPostStats?: PostTipStats | null;
  /** true dopoki zbiorcze zapytanie nie wrocilo - trzyma stan ladowania. */
  presetLoading?: boolean;
}

// Mapuje stare nazwy sieci na nowe
const mapNetworkId = (network: TipNetworkType): TipNetwork => {
  if (network === 'basecamp') return 'camp';
  if (network in NETWORKS) return network as TipNetwork;
  return 'base'; // fallback
};

// Komponent ikony sieci z czarnym tłem dla World
const NetworkIconSimple = ({ network, size = 'md' }: { network: TipNetworkType; size?: 'sm' | 'md' }) => {
  const networkId = mapNetworkId(network);
  const networkConfig = NETWORKS[networkId];
  const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  
  if (networkConfig?.iconUrl) {
    // World ma czarne tło w środku
    if (network === 'world') {
      return (
        <div className={`${sizeClass} bg-black rounded-full flex items-center justify-center shrink-0`}>
          <img 
            src={networkConfig.iconUrl} 
            alt={networkConfig.name} 
            className="w-3/4 h-3/4 object-contain"
          />
        </div>
      );
    }
    
    return (
      <img 
        src={networkConfig.iconUrl} 
        alt={networkConfig.name} 
        className={`${sizeClass} object-contain rounded-full shrink-0`}
      />
    );
  }
  
  return <span className="text-sm">{networkConfig?.icon || '🔵'}</span>;
};

// Komponent ikony tokena (legacy, kept for user stats)
const TokenIcon = ({ token, size = 'sm' }: { token: TipToken; size?: 'sm' | 'md' }) => {
  const tokenConfig = TOKENS[token];
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  
  if (tokenConfig?.iconUrl) {
    return (
      <img 
        src={tokenConfig.iconUrl} 
        alt={tokenConfig.name} 
        className={`${sizeClass} object-contain rounded-full inline-block`}
        title={tokenConfig.name}
      />
    );
  }
  
  return (
    <span 
      className={size === 'sm' ? 'text-xs' : 'text-sm'}
      title={tokenConfig?.name || token}
    >
      {tokenConfig?.icon || '💰'}
    </span>
  );
};

// Formatuje wartość tokena - ETH do 5 miejsc, native tokens do 3
const formatTokenAmount = (amount: number, token: TipToken): string => {
  // Native tokens with 6 decimals (USDC) - whole numbers with max 3 decimals
  const decimals = TOKENS[token].decimals;
  if (decimals === 6) {
    // USDC - max 3 decimal places
    if (amount >= 1) {
      return amount.toFixed(2);
    }
    return amount.toFixed(3);
  }
  
  // Native tokens like CAMP, LINEA, CELO, WLD - whole numbers with max 3 decimals
  if (['CAMP', 'LINEA', 'CELO', 'WLD'].includes(token)) {
    if (amount >= 1) {
      return amount.toFixed(2);
    }
    return amount.toFixed(3);
  }
  
  // ETH - up to 5 decimal places
  if (amount >= 1) {
    return amount.toFixed(4);
  }
  return amount.toFixed(5);
};

// Collapsible component for post tips
interface NetworkGroup {
  network: TipNetworkType;
  name: string;
  tokens: { token: TipTokenType; label: string }[];
}

interface TipStatsCollapsibleProps {
  networkGroups: NetworkGroup[];
  getAmount: (network: TipNetworkType, token: TipTokenType) => number;
  activeTips: { network: TipNetworkType; token: TipTokenType; amount: number }[];
  className?: string;
}

// Composite icon: network with token badge overlay
const NetworkWithTokenBadge = ({ network, token, size = 'sm' }: { network: TipNetworkType; token: TipTokenType; size?: 'sm' | 'md' }) => {
  const networkConfig = NETWORKS[mapNetworkId(network)];
  const tokenConfig = TOKENS[token as TipToken];
  
  const mainSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const badgeSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  
  // Native tokens don't need badge (CELO, CAMP, WLD, LINEA) - just show network icon
  const isNativeToken = ['CELO', 'CAMP', 'WLD', 'LINEA'].includes(token);
  
  // World needs black background inside
  const isWorld = network === 'world';
  
  return (
    <div className="relative inline-flex shrink-0">
      {/* Network icon - World has black background */}
      {isWorld ? (
        <div className={`${mainSize} bg-black rounded-full flex items-center justify-center`}>
          {networkConfig?.iconUrl && (
            <img 
              src={networkConfig.iconUrl} 
              alt={networkConfig.name} 
              className="w-3/4 h-3/4 object-contain"
            />
          )}
        </div>
      ) : networkConfig?.iconUrl ? (
        <img 
          src={networkConfig.iconUrl} 
          alt={networkConfig.name} 
          className={`${mainSize} object-contain rounded-full`}
        />
      ) : (
        <span className="text-xs">{networkConfig?.icon || '🔵'}</span>
      )}
      
      {/* Token badge overlay for ETH/USDC */}
      {!isNativeToken && tokenConfig?.iconUrl && (
        <div className="absolute -bottom-0.5 -right-0.5 bg-white dark:bg-gray-800 rounded-full p-px">
          <img 
            src={tokenConfig.iconUrl} 
            alt={token} 
            className={`${badgeSize} object-contain rounded-full`}
          />
        </div>
      )}
    </div>
  );
};

const TipStatsCollapsible = ({ networkGroups, getAmount, activeTips, className = '' }: TipStatsCollapsibleProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`w-full ${className}`}>
      <div className="bg-gradient-to-r from-blue-50/80 to-cyan-50/80 dark:from-blue-950/40 dark:to-cyan-950/40 border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden">
        {/* Toggle button with tips preview */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Tips</span>
            {/* Show active tips on the button - with composite icons */}
            {activeTips.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                {activeTips.map(({ network, token, amount }) => (
                  <span 
                    key={`${network}:${token}`}
                    className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300"
                  >
                    <NetworkWithTokenBadge network={network} token={token} size="sm" />
                    <span>{formatTokenAmount(amount, token as TipToken)}</span>
                  </span>
                ))}
              </div>
            )}
            {activeTips.length === 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">No tips yet</span>
            )}
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
          )}
        </button>

        {/* Collapsible table */}
        <div 
          className={`overflow-hidden transition-all duration-200 ease-in-out ${
            isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="border-t border-blue-200 dark:border-blue-800">
            <Table>
              <TableBody>
                {networkGroups.map(({ network, name, tokens }) => {
                  return (
                    <TableRow 
                      key={network} 
                      className="border-blue-100 dark:border-blue-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/20"
                    >
                      <TableCell className="py-2 px-3 w-24">
                        <div className="flex items-center gap-2">
                          <NetworkIconSimple network={network} size="md" />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{name}</span>
                        </div>
                      </TableCell>
                      {tokens.map((t) => {
                        const amount = getAmount(network, t.token);
                        return (
                          <TableCell 
                            key={t.token} 
                            className="py-2 px-3 text-right"
                          >
                            <div className={`flex items-center justify-end gap-1.5 ${amount > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500'}`}>
                              <NetworkWithTokenBadge network={network} token={t.token} size="md" />
                              <span className="text-sm font-medium">{formatTokenAmount(amount, t.token as TipToken)}</span>
                            </div>
                          </TableCell>
                        );
                      })}
                      {/* Fill empty cell if only one token */}
                      {tokens.length === 1 && (
                        <TableCell className="py-2 px-3 text-right text-gray-300 dark:text-gray-600">
                          —
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function TipStats({ userAddress, postId, className = '', presetPostStats, presetLoading }: TipStatsProps) {
  const [userStats, setUserStats] = useState<TipStatsType | null>(null);
  const [postStats, setPostStats] = useState<PostTipStats | null>(presetPostStats ?? null);
  const [loading, setLoading] = useState(presetPostStats === undefined || presetLoading === true);

  useEffect(() => {
    // Statystyki posta przyszly propsem - zero zapytan.
    if (presetPostStats !== undefined) {
      setPostStats(presetPostStats);
      if (!userAddress) {
        setLoading(presetLoading === true);
        return;
      }
    }

    const fetchStats = async () => {
      setLoading(true);
      try {
        if (userAddress) {
          const stats = await getUserTipStats(userAddress);
          setUserStats(stats);
        }
        
        if (postId && presetPostStats === undefined) {
          const stats = await getPostTipStats(postId);
          setPostStats(stats);
        }
      } catch (error) {
        console.error('Error fetching tip stats:', error);
      } finally {
        setLoading(false);
      }
    };

    if (userAddress || (postId && presetPostStats === undefined)) {
      fetchStats();
    }
  }, [userAddress, postId, presetPostStats, presetLoading]);

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded px-2 py-1 text-xs">
          Loading...
        </div>
      </div>
    );
  }

  // User stats (for profiles)
  if (userAddress && userStats && userStats.tipCount > 0) {
    const tokenAmounts = [
      { token: 'ETH' as TipToken, amount: userStats.ethReceived },
      { token: 'USDC' as TipToken, amount: userStats.usdcReceived },
      { token: 'CELO' as TipToken, amount: userStats.celoReceived },
      { token: 'WLD' as TipToken, amount: userStats.wldReceived },
      { token: 'LINEA' as TipToken, amount: userStats.lineaReceived },
      { token: 'CAMP' as TipToken, amount: userStats.campReceived },
    ].filter(t => t.amount > 0);

    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="flex items-center space-x-1 bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full px-3 py-1">
          <span className="text-xs">💰</span>
          <div className="flex items-center space-x-2 text-xs font-medium text-green-700 dark:text-green-300">
            {tokenAmounts.map(({ token, amount }) => (
              <span key={token} className="flex items-center" title={`${amount} ${token}`}>
                <TokenIcon token={token} />
                <span className="ml-0.5">{formatTokenAmount(amount, token)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Post stats (for individual posts) - collapsible table with tips preview
  if (postId && postStats) {
    // Network groups with their tokens
    const networkGroups = [
      { 
        network: 'base' as TipNetworkType, 
        name: 'Base',
        tokens: [
          { token: 'ETH' as TipTokenType, label: 'ETH' },
          { token: 'USDC' as TipTokenType, label: 'USDC' },
        ]
      },
      { 
        network: 'world' as TipNetworkType, 
        name: 'World',
        tokens: [
          { token: 'ETH' as TipTokenType, label: 'ETH' },
          { token: 'WLD' as TipTokenType, label: 'WLD' },
        ]
      },
      { 
        network: 'linea' as TipNetworkType, 
        name: 'Linea',
        tokens: [
          { token: 'ETH' as TipTokenType, label: 'ETH' },
          { token: 'LINEA' as TipTokenType, label: 'LINEA' },
        ]
      },
      { 
        network: 'camp' as TipNetworkType, 
        name: 'Camp',
        tokens: [
          { token: 'CAMP' as TipTokenType, label: 'CAMP' },
        ]
      },
      { 
        network: 'celo' as TipNetworkType, 
        name: 'Celo',
        tokens: [
          { token: 'CELO' as TipTokenType, label: 'CELO' },
        ]
      },
    ];

    // Build a map from networkTips for quick lookup
    const tipsMap = new Map<string, number>();
    if (postStats.networkTips) {
      postStats.networkTips.forEach(({ network, token, amount }) => {
        tipsMap.set(`${network}:${token}`, amount);
      });
    }

    const getAmount = (network: TipNetworkType, token: TipTokenType) => 
      tipsMap.get(`${network}:${token}`) || 0;

    // Get tips with amount > 0 for the preview button
    const activeTips: { network: TipNetworkType; token: TipTokenType; amount: number }[] = [];
    networkGroups.forEach(({ network, tokens }) => {
      tokens.forEach(({ token }) => {
        const amount = getAmount(network, token);
        if (amount > 0) {
          activeTips.push({ network, token, amount });
        }
      });
    });

    return (
      <TipStatsCollapsible
        networkGroups={networkGroups}
        getAmount={getAmount}
        activeTips={activeTips}
        className={className}
      />
    );
  }

  return null;
}

export { TipStats };
