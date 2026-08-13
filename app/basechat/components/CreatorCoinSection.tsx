'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCreatorCoin, CreatorCoinData, getUserCoinBalances } from '../../utils/creatorCoin';
import TradeCoinModal from './TradeCoinModal';

interface CreatorCoinSectionProps {
  userAddress: string;
  currentUserAddress?: string;
}

export default function CreatorCoinSection({ userAddress, currentUserAddress }: CreatorCoinSectionProps) {
  const [creatorCoin, setCreatorCoin] = useState<CreatorCoinData | null>(null);
  /**
   * Saldo w tej monecie. `null` = NIE WIEMY (odczyt padl), a nie "zero".
   *
   * Wczesniej startowalo i konczylo na '0', wiec nieudane zapytanie do Zory
   * dawalo to samo, co pusty portfel: znikaly i saldo, i przycisk "Sell".
   * Czlowiek nie mial jak sprzedac wlasnej monety i nie wiedzial dlaczego.
   */
  const [userBalance, setUserBalance] = useState<string | null>(null);
  const [balanceFailed, setBalanceFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');

  /** Saldo zalogowanego uzytkownika w danej monecie. Jedno miejsce - ta sama
   *  logika stala wczesniej i w fetchBalance, i w efekcie ladujacym monete. */
  const readCoinBalance = useCallback(async (coinAddress: string): Promise<string> => {
    if (!currentUserAddress) return '0';

    const balances = await getUserCoinBalances(currentUserAddress);
    const balance = balances.find(b =>
      b.coinAddress.toLowerCase() === coinAddress.toLowerCase()
    );
    // Tutaj zero jest prawda: odczyt sie udal, monety w portfelu nie ma.
    return balance?.balanceFormatted || '0';
  }, [currentUserAddress]);

  const fetchBalance = useCallback(async () => {
    if (!currentUserAddress || !creatorCoin) return;

    try {
      setUserBalance(await readCoinBalance(creatorCoin.address));
      setBalanceFailed(false);
    } catch (error) {
      console.error('Error fetching balance:', error);
      setUserBalance(null);
      setBalanceFailed(true);
    }
  }, [currentUserAddress, creatorCoin, readCoinBalance]);

  useEffect(() => {
    if (!userAddress) return;

    // Przy szybkiej zmianie profilu odpowiedz dla poprzedniego adresu
    // pokazywala cudza monete i cudze saldo.
    let cancelled = false;

    const fetchCreatorCoin = async () => {
      setLoading(true);
      setBalanceFailed(false);
      try {
        const coin = await getCreatorCoin(userAddress);
        if (cancelled) return;
        setCreatorCoin(coin);

        // If viewing own profile or logged in, get balance
        if (currentUserAddress && coin) {
          // Wlasny try: padniete SALDO nie moze wygasic calej sekcji monety,
          // ale tez nie moze udac zera.
          try {
            const balance = await readCoinBalance(coin.address);
            if (cancelled) return;
            setUserBalance(balance);
          } catch (balanceError) {
            if (cancelled) return;
            console.error('Error fetching balance:', balanceError);
            setUserBalance(null);
            setBalanceFailed(true);
          }
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Error fetching creator coin:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCreatorCoin();

    return () => { cancelled = true; };
  }, [userAddress, currentUserAddress, readCoinBalance]);

  const handleOpenTrade = (mode: 'buy' | 'sell') => {
    setTradeMode(mode);
    setShowTradeModal(true);
  };

  const handleTradeSuccess = useCallback(() => {
    // Refresh balance after successful trade
    fetchBalance();
  }, [fetchBalance]);

  if (loading) {
    return (
      <div className="animate-pulse rounded-card bg-soft-surface p-4 shadow-card">
        <div className="flex items-center space-x-3">
          <div className="h-12 w-12 rounded-full bg-soft-sunken" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-soft-sunken" />
            <div className="h-3 w-16 rounded bg-soft-sunken" />
          </div>
        </div>
      </div>
    );
  }

  if (!creatorCoin) {
    return null; // No creator coin found - don't show section
  }

  return (
    <>
      /* ===== MONETA TWORCY W JEZYKU RESZTY PRODUKTU =====
          Byl tu gradient przez trzy fiolety, obwodka w czwartym i cien
          `shadow-lg`, ktorego nie uzywa nic innego w tej aplikacji. Sekcja
          krzyczala mocniej niz saldo i przyciski w srodku, a to one sa tu
          trescia. Zwykla karta produktu; kolor niesie tylko to, co znaczy:
          zielen kupna, czerwien sprzedazy, bursztyn przy kwocie. */
        <div className="rounded-card bg-soft-surface p-4 shadow-card">
        {/* Coin Info */}
        <div className="flex items-center space-x-3">
          {creatorCoin.imageUrl ? (
            <img 
              src={creatorCoin.imageUrl} 
              alt={creatorCoin.symbol} 
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-soft-primary">
              <span className="font-soft-display text-lg font-bold text-white">{creatorCoin.symbol.charAt(0)}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-soft-display font-bold text-soft-ink">
                {creatorCoin.symbol}
              </span>
              {creatorCoin.priceUSD && (
                <span className="font-soft-display text-sm font-bold tabular-nums text-soft-accent-deep">
                  ${parseFloat(creatorCoin.priceUSD).toFixed(6)}
                </span>
              )}
            </div>
            <p className="text-xs text-soft-ink-soft truncate">
              {creatorCoin.name}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-soft-line pt-3">
          {creatorCoin.marketCap && (
            <div className="text-center">
              <p className="font-soft text-[10.5px] font-semibold uppercase tracking-[0.07em] text-soft-ink-soft">Market cap</p>
              <p className="font-soft-display text-[15px] font-bold tabular-nums text-soft-ink">
                ${Number(creatorCoin.marketCap).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
          {creatorCoin.volume24h && (
            <div className="text-center">
              <p className="font-soft text-[10.5px] font-semibold uppercase tracking-[0.07em] text-soft-ink-soft">24h volume</p>
              <p className="font-soft-display text-[15px] font-bold tabular-nums text-soft-ink">
                ${Number(creatorCoin.volume24h).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
          {creatorCoin.uniqueHolders !== undefined && (
            <div className="text-center">
              <p className="font-soft text-[10.5px] font-semibold uppercase tracking-[0.07em] text-soft-ink-soft">Holders</p>
              <p className="font-soft-display text-[15px] font-bold tabular-nums text-soft-ink">
                {creatorCoin.uniqueHolders.toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* Trade Buttons */}
        {currentUserAddress && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => handleOpenTrade('buy')}
              className="flex-1 rounded-pill bg-[#15803D] px-3 py-2 font-soft-display text-[13px] font-bold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              Buy
            </button>
            {userBalance !== null && parseFloat(userBalance) > 0 && (
              <button
                onClick={() => handleOpenTrade('sell')}
                className="flex-1 rounded-pill bg-[#BE185D] px-3 py-2 font-soft-display text-[13px] font-bold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
              >
                Sell
              </button>
            )}
          </div>
        )}

        {/* User Balance */}
        {currentUserAddress && userBalance !== null && parseFloat(userBalance) > 0 && (
          <div className="mt-2 text-center">
            <span className="text-xs text-soft-ink-soft">
              Your balance: <span className="font-bold text-soft-accent-deep">{parseFloat(userBalance).toFixed(4)} {creatorCoin.symbol}</span>
            </span>
          </div>
        )}

        {/* Saldo nieodczytane. Piszemy o tym zamiast milczec - milczenie w tym
            miejscu znaczy "nie masz tej monety", a tego nie sprawdzilismy. */}
        {currentUserAddress && balanceFailed && (
          <div className="mt-2 text-center">
            <span className="text-xs text-soft-ink-soft">
              Your balance couldn&apos;t be loaded
            </span>
          </div>
        )}
      </div>

      {/* Trade Modal */}
      {showTradeModal && creatorCoin && (
        <TradeCoinModal
          isOpen={showTradeModal}
          onClose={() => setShowTradeModal(false)}
          coin={creatorCoin}
          userBalance={userBalance}
          mode={tradeMode}
          onTradeSuccess={handleTradeSuccess}
        />
      )}
    </>
  );
}

