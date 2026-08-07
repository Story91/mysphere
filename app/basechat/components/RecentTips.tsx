'use client';

import { useState, useEffect } from 'react';
import { getRecentTips, getBulkUserNamesOptimized, Tip, TipNetworkType } from '../../utils/firebase';
import { formatDistanceToNow } from 'date-fns';
import { TOKENS, NETWORKS, TipToken, TipNetwork } from './TipNetworkConfig';

interface RecentTipsProps {
  userAddress: string;
  limit?: number;
  className?: string;
}

// Komponent ikony tokena
const TokenIcon = ({ token }: { token: TipToken }) => {
  const tokenConfig = TOKENS[token];
  // Nieznany token: neutralny krazek zamiast emoji 💰. Emoji rysuje sie w innym
  // stylu na kazdym systemie i wybija sie z rzedu prawdziwych logotypow.
  if (!tokenConfig) {
    return <span className="inline-block w-3.5 h-3.5 rounded-full bg-soft-line" aria-hidden="true" />;
  }

  if (tokenConfig.iconUrl) {
    return (
      <img
        src={tokenConfig.iconUrl}
        alt={tokenConfig.name}
        className="w-3.5 h-3.5 object-contain rounded-full inline-block"
        title={tokenConfig.name}
      />
    );
  }
  return <span title={tokenConfig.name}>{tokenConfig.icon}</span>;
};

// Formatuje wartość tokena
const formatTokenAmount = (amount: number, token: TipToken): string => {
  // `parseFloat` na uszkodzonej kwocie z bazy daje NaN, a `NaN.toFixed()` wypisuje
  // uzytkownikowi doslownie "NaN" jako wysokosc napiwku.
  if (!Number.isFinite(amount)) return '0';

  const tokenConfig = TOKENS[token];
  if (!tokenConfig) return amount.toFixed(4);

  if (tokenConfig.decimals === 6) {
    return amount.toFixed(2);
  }
  if (amount >= 1) {
    return amount.toFixed(4);
  }
  return amount.toFixed(6);
};

// Mapuje stare nazwy sieci na nowe
const mapNetworkId = (network: string): TipNetwork => {
  if (network === 'basecamp') return 'camp';
  if (network in NETWORKS) return network as TipNetwork;
  return 'base'; // fallback
};

// Pobiera ikonę sieci
const NetworkIcon = ({ network }: { network: TipNetworkType }) => {
  const networkId = mapNetworkId(network);
  const networkConfig = NETWORKS[networkId];
  if (!networkConfig) {
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-soft-line" aria-hidden="true" />;
  }
  
  if (networkConfig.iconUrl) {
    return (
      <img 
        src={networkConfig.iconUrl} 
        alt={networkConfig.name} 
        className="w-2.5 h-2.5 object-contain rounded-full"
        title={networkConfig.name}
      />
    );
  }
  return <span title={networkConfig.name}>{networkConfig.icon}</span>;
};

export default function RecentTips({ userAddress, limit = 10, className = '' }: RecentTipsProps) {
  const [tips, setTips] = useState<Tip[]>([]);
  const [senderNames, setSenderNames] = useState<{[key: string]: {name: string, avatar?: string}}>({});
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  // Nieudane pobranie konczylo sie stanem "No tips received yet" - komunikat
  // o BRAKU napiwkow zamiast o tym, ze lista sie nie zaladowala.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    // Bez tej flagi zmiana `userAddress` w trakcie pobierania potrafila wpisac
    // do stanu odpowiedz POPRZEDNIEGO uzytkownika - kto pierwszy wrocil, ten
    // wygrywal. Dodatkowo zapis stanu po odmontowaniu.
    let cancelled = false;

    const fetchRecentTips = async () => {
      setLoading(true);
      setLoadFailed(false);

      let recentTips: Tip[];
      try {
        recentTips = await getRecentTips(userAddress, limit);
      } catch (error) {
        console.error('Error fetching recent tips:', error);
        if (!cancelled) {
          setLoadFailed(true);
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;
      setTips(recentTips);

      // Nazwy nadawcow to ozdoba - gdy ich pobranie padnie, lista napiwkow
      // zostaje poprawna, a nadawcy pokazuja sie jako skrocone adresy. Dlatego
      // ten blad NIE moze przelaczac calego kafelka w stan bledu.
      if (recentTips.length > 0) {
        try {
          const senderAddresses = [...new Set(recentTips.map(tip => tip.senderAddress))];
          const names = await getBulkUserNamesOptimized(senderAddresses);
          if (!cancelled) setSenderNames(names);
        } catch (error) {
          console.error('Error fetching tip sender names:', error);
        }
      }

      if (!cancelled) setLoading(false);
    };

    fetchRecentTips();

    return () => { cancelled = true; };
  }, [userAddress, limit]);

  const formatTimestamp = (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (error) {
      return 'recently';
    }
  };

  const getSenderName = (address: string) => {
    const user = senderNames[address];
    if (user?.name) return user.name;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const displayedTips = showAll ? tips : tips.slice(0, 3);

  if (loading) {
    return (
      <div className={`bg-soft-surface rounded-card p-4 shadow-card ${className}`}>
        <div className="flex items-center space-x-2 mb-3">
          <div className="animate-pulse bg-soft-sunken rounded-pill w-4 h-4"></div>
          <div className="animate-pulse bg-soft-sunken rounded-pill w-20 h-4"></div>
        </div>
        <div className="space-y-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse bg-soft-sunken rounded-2xl h-12"></div>
          ))}
        </div>
      </div>
    );
  }

  if (loadFailed || tips.length === 0) {
    return (
      <div className={`bg-soft-surface rounded-card p-4 shadow-card ${className}`}>
        <h3 className="font-soft-display font-semibold text-soft-ink mb-3">Recent tips</h3>
        <div className="py-4">
          {/* Rozroznienie zostaje: "nie udalo sie wczytac" to co innego niz
              "nie ma jeszcze napiwkow". */}
          <span className="font-soft text-soft-ink-soft text-sm">
            {loadFailed ? "Couldn't load recent tips" : 'No tips received yet'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-soft-surface rounded-card p-4 shadow-card ${className}`}>
      {/* Emoji 🎯 zniknelo z naglowka - nie znaczylo nic, a rysowalo sie w innym
          stylu na kazdym systemie. Liczba napiwkow niesie te sama informacje. */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-soft-display font-semibold text-soft-ink truncate">Recent tips</h3>
          <span className="text-sm text-soft-ink-faint font-soft-display tabular-nums">
            {tips.length}
          </span>
        </div>
        {tips.length > 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            aria-expanded={showAll}
            className="flex-shrink-0 font-soft text-xs font-semibold text-soft-primary-deep rounded-pill px-2.5 py-1.5 transition-[color,background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            {showAll ? 'Show less' : 'Show all'}
          </button>
        )}
      </div>
      
      {/* Wiersze bez wlasnej ramki i wlasnego cienia. Kafelek z cieniem, w nim
          trzy mniejsze kafelki z cieniami - to byly trzy poziomy uniesienia
          na przestrzeni 150 pikseli. */}
      <div className="space-y-1">
        {displayedTips.map((tip) => (
          <div key={tip.id} className="flex items-center justify-between gap-3 p-2 rounded-2xl hover:bg-soft-sunken transition-colors [transition-duration:var(--dur-press)] ease-out-strong">
            <div className="flex items-center gap-3 min-w-0">
              {/* Token + Network Icon */}
              <div className="flex-shrink-0 w-8 h-8 bg-soft-sunken rounded-full flex items-center justify-center relative">
                <span className="text-sm">
                  <TokenIcon token={tip.token as TipToken} />
                </span>
                {/* Mała ikona sieci w rogu */}
                <span className="absolute -bottom-0.5 -right-0.5 text-[10px] bg-soft-surface rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-chip">
                  <NetworkIcon network={tip.network} />
                </span>
              </div>
              <div className="min-w-0">
                <div className="font-soft text-sm font-semibold text-soft-ink truncate">
                  {getSenderName(tip.senderAddress)}
                </div>
                <div className="font-soft text-[11.5px] text-soft-ink-soft">
                  {formatTimestamp(tip.timestamp)}
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center space-x-2">
              <div className="text-right">
                {/* Kwota - jedyne miejsce w kafelku z `soft-accent`. */}
                <div className="text-sm font-bold text-soft-accent-deep font-soft-display tabular-nums flex items-center justify-end gap-1">
                  <TokenIcon token={tip.token as TipToken} />
                  <span>{formatTokenAmount(parseFloat(tip.amount), tip.token as TipToken)}</span>
                </div>
                {/* Paragon zamiast surowego linku do eksploratora: ta sama
                    transakcja, ale w formie, ktora da sie komus wyslac.
                    Eksplorator zostaje o klikniecie dalej, na samym paragonie. */}
                {tip.txHash && (
                  <a
                    href={`/tip/${tip.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-soft text-[11.5px] font-semibold text-soft-ink-soft hover:text-soft-primary-deep rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary flex items-center justify-end space-x-1"
                  >
                    <span>Receipt</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { RecentTips };
