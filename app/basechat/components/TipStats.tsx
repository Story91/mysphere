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
        <div className="absolute -bottom-0.5 -right-0.5 bg-soft-surface rounded-full p-px">
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
      <div className="bg-soft-surface border border-soft-line rounded-card overflow-hidden shadow-card">
        {/* Toggle button with tips preview */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-soft-sunken transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-soft-ink-faint uppercase tracking-wider">Tips</span>
            {/* Show active tips on the button - with composite icons */}
            {activeTips.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                {activeTips.map(({ network, token, amount }) => (
                  <span 
                    key={`${network}:${token}`}
                    className="flex items-center gap-1 text-xs font-semibold text-soft-accent-deep font-soft-display tabular-nums"
                  >
                    <NetworkWithTokenBadge network={network} token={token} size="sm" />
                    <span>{formatTokenAmount(amount, token as TipToken)}</span>
                  </span>
                ))}
              </div>
            )}
            {activeTips.length === 0 && (
              <span className="text-xs text-soft-ink-faint">No tips yet</span>
            )}
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-soft-ink-soft shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-soft-ink-soft shrink-0" aria-hidden="true" />
          )}
        </button>

        {/* Collapsible table */}
        <div 
          className={`overflow-hidden transition-[max-height,opacity] [transition-duration:var(--dur-dropdown)] ease-out-strong ${
            isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="border-t border-soft-line">
            <Table>
              <TableBody>
                {networkGroups.map(({ network, name, tokens }) => {
                  return (
                    <TableRow 
                      key={network} 
                      className="border-soft-line hover:bg-soft-sunken"
                    >
                      <TableCell className="py-2 px-3 w-24">
                        <div className="flex items-center gap-2">
                          <NetworkIconSimple network={network} size="md" />
                          <span className="text-sm font-medium text-soft-ink-muted">{name}</span>
                        </div>
                      </TableCell>
                      {tokens.map((t) => {
                        const amount = getAmount(network, t.token);
                        return (
                          <TableCell 
                            key={t.token} 
                            className="py-2 px-3 text-right"
                          >
                            <div className={`flex items-center justify-end gap-1.5 ${amount > 0 ? 'text-soft-accent-deep' : 'text-soft-ink-faint'}`}>
                              <NetworkWithTokenBadge network={network} token={t.token} size="md" />
                              <span className="text-sm font-semibold font-soft-display tabular-nums">{formatTokenAmount(amount, t.token as TipToken)}</span>
                            </div>
                          </TableCell>
                        );
                      })}
                      {/* Fill empty cell if only one token */}
                      {tokens.length === 1 && (
                        <TableCell className="py-2 px-3 text-right text-soft-ink-faint">
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
  // Wylacznie wlasne pobrania. `presetLoading` NIE moze byc czescia tego stanu ani
  // zaleznoscia efektu ponizej - to tylko flaga wyswietlania. Trzymanie jej w deps
  // powodowalo ponowne fetchStats() przy kazdym przelaczeniu flagi.
  const [fetching, setFetching] = useState(presetPostStats === undefined);
  const loading = presetLoading === true || fetching;

  // Statystyki posta przyszly propsem - zero zapytan.
  useEffect(() => {
    if (presetPostStats !== undefined) setPostStats(presetPostStats);
  }, [presetPostStats]);

  useEffect(() => {
    const needsUserFetch = Boolean(userAddress);
    const needsPostFetch = Boolean(postId) && presetPostStats === undefined;

    if (!needsUserFetch && !needsPostFetch) {
      setFetching(false);
      return;
    }

    let cancelled = false;
    const fetchStats = async () => {
      setFetching(true);
      try {
        if (needsUserFetch) {
          const stats = await getUserTipStats(userAddress!);
          if (!cancelled) setUserStats(stats);
        }

        if (needsPostFetch) {
          const stats = await getPostTipStats(postId!);
          if (!cancelled) setPostStats(stats);
        }
      } catch (error) {
        console.error('Error fetching tip stats:', error);
      } finally {
        if (!cancelled) setFetching(false);
      }
    };

    fetchStats();
    return () => { cancelled = true; };
    // presetPostStats celowo tylko przez `=== undefined`, zeby nowa referencja
    // obiektu ze zbiorczego fetcha nie wywolywala ponownego pobrania.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress, postId, presetPostStats === undefined]);

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="animate-pulse bg-soft-sunken text-soft-ink-faint rounded-pill px-2 py-1 text-xs">
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
        <div className="flex items-center space-x-1 bg-soft-accent-soft border border-soft-line rounded-pill px-3 py-1 shadow-chip">
          <span className="text-xs">💰</span>
          <div className="flex items-center space-x-2 text-xs font-semibold text-soft-accent-deep font-soft-display tabular-nums">
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
