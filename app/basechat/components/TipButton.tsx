// @ts-nocheck
'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { normalizeAmountInput } from '../../utils/monetization/parseAmount';
import { createPortal } from 'react-dom';
import {
  useAccount,
  useChainId,
  useBalance,
  useSwitchChain,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseEther, parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { toast } from 'react-hot-toast';
import { saveTip } from '../../utils/firebase';
// Base Pay imports
import { pay, getPaymentStatus } from '@base-org/account';
import { BasePayButton } from '@base-org/account-ui/react';
import {
  TipToken,
  TipNetwork,
  NETWORKS,
  TOKENS,
  getNetworkByChainId,
  getTokensForNetwork,
  getDefaultTokenForNetwork,
  getQuickAmounts,
  getExplorerTxLink,
  ERC20_TRANSFER_ABI,
  ALL_NETWORKS,
} from './TipNetworkConfig';
import { resolveUserOpToTxHash } from '../../utils/tips/resolveUserOp';

interface TipButtonProps {
  recipientAddress: string;
  postId: string;
  className?: string;
}

// Tla kafelkow sieci i tokenow - stale, wiec nie ma powodu budowac ich
// od nowa przy kazdym renderze wewnatrz map().
// Sieci spoza mapy (celo, linea, robinhood) dostaja domyslne 'bg-white/10'.
const NETWORK_BG_COLORS: Record<string, string> = {
  base: 'bg-white',
  ethereum: 'bg-white',
  world: 'bg-black',
  camp: 'bg-white',
};

// Sieci, ktorych logo wypelnia caly kafelek
const NETWORK_FULL_IMAGE = new Set(['linea', 'celo']);

const TOKEN_BG_COLORS: Record<string, string> = {
  CAMP: 'bg-white',
};

/**
 * Odmowa podpisu w portfelu (EIP-1193, kod 4001) to DECYZJA uzytkownika, nie awaria.
 * Wczesniej konczyla sie czerwonym "Tip failed: User rejected the request..." -
 * czyli aplikacja krzyczala bledem o tym, ze ktos rozmyslil sie i kliknal "Odrzuc".
 */
const isUserRejection = (err: any): boolean => {
  if (!err) return false;
  const code = err.code ?? err.cause?.code;
  if (code === 4001 || code === 'ACTION_REJECTED') return true;
  const message = `${err.shortMessage || ''} ${err.name || ''} ${err.message || ''}`.toLowerCase();
  return (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('userrejected') ||
    message.includes('rejected the request')
  );
};

export default function TipButton({ recipientAddress, postId, className = '' }: TipButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState('0.001');
  const [selectedNetwork, setSelectedNetwork] = useState<TipNetwork>('base');
  const [selectedToken, setSelectedToken] = useState<TipToken>('ETH');
  const [isTransacting, setIsTransacting] = useState(false);
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [tipSaved, setTipSaved] = useState(false); // Guard against duplicate saves
  
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  
  // Pobierz konfigurację aktualnej sieci
  const currentNetworkConfig = useMemo(() => getNetworkByChainId(chainId), [chainId]);
  const selectedNetworkConfig = useMemo(() => NETWORKS[selectedNetwork], [selectedNetwork]);
  const selectedTokenConfig = useMemo(() => TOKENS[selectedToken], [selectedToken]);
  const availableTokens = useMemo(() => getTokensForNetwork(selectedNetwork), [selectedNetwork]);
  
  // Auto-detect sieci przy otwarciu modalu
  useEffect(() => {
    if (isOpen && currentNetworkConfig) {
      setSelectedNetwork(currentNetworkConfig.id);
      const defaultToken = getDefaultTokenForNetwork(currentNetworkConfig.id);
      setSelectedToken(defaultToken.symbol);
      setTipAmount(getQuickAmounts(defaultToken.symbol)[0]);
    }
  }, [isOpen, currentNetworkConfig]);
  
  // Aktualizuj token gdy zmieni się sieć
  useEffect(() => {
    const tokens = getTokensForNetwork(selectedNetwork);
    if (!tokens.find(t => t.symbol === selectedToken)) {
      const defaultToken = getDefaultTokenForNetwork(selectedNetwork);
      setSelectedToken(defaultToken.symbol);
      setTipAmount(getQuickAmounts(defaultToken.symbol)[0]);
    }
  }, [selectedNetwork, selectedToken]);
  
  // Modal dalo sie zamknac tylko klikiem w tlo albo krzyzykiem - z klawiatury nie
  // bylo z niego wyjscia.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setIsOpen(false);
      setTipSaved(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen]);
  
  // Get native token balance for selected network
  const { data: nativeBalance, isLoading: nativeLoading } = useBalance({
    address: address,
    chainId: selectedNetworkConfig?.chainId
  });
  
  // Get ERC20 token balance if token is not native
  const { data: tokenBalance, isLoading: tokenLoading } = useBalance({
    address: address,
    token: selectedTokenConfig?.contractAddress,
    chainId: selectedNetworkConfig?.chainId,
    query: {
      enabled: !selectedTokenConfig?.isNative && !!selectedTokenConfig?.contractAddress
    }
  });

  // Check if user is trying to tip themselves
  const isSelfTip = address?.toLowerCase() === recipientAddress.toLowerCase();

  // Check if on correct network
  const isCorrectNetwork = chainId === selectedNetworkConfig?.chainId;

  // Function to switch network
  const ensureCorrectNetwork = useCallback(async () => {
    if (!isCorrectNetwork && selectedNetworkConfig) {
      try {
        await switchChain({ chainId: selectedNetworkConfig.chainId });
        return true;
      } catch (error) {
        console.error('Failed to switch network:', error);
        toast.error(`Please switch to ${selectedNetworkConfig.name} manually`);
        return false;
      }
    }
    return true;
  }, [chainId, selectedNetworkConfig, switchChain, isCorrectNetwork]);

  // Wysylka transakcji na czystym wagmi. getCalls() zwraca ZAWSZE dokladnie
  // jedno wywolanie (natywny transfer albo transfer ERC-20), wiec batchowanie
  // nie jest potrzebne - wystarczy useSendTransaction.
  const { sendTransaction, data: sentTxHash, error: sendError, reset: resetSend } = useSendTransaction();
  const { data: receipt, isLoading: isWaitingForReceipt } = useWaitForTransactionReceipt({
    hash: sentTxHash,
    query: { enabled: !!sentTxHash },
  });

  const handleTransactionStatus = useCallback(async (status: any) => {
    if (status.statusName === 'success') {
      // Straznik przed podwojnym zapisem - efekt reagujacy na potwierdzenie
      // moze sie wykonac ponownie przy re-renderze.
      if (tipSaved) return;
      setTipSaved(true);
      
      try {
        toast.dismiss();
        
        const txHash = status.statusData?.transactionHash || '';
        await saveTip({
          senderAddress: address!,
          recipientAddress,
          amount: tipAmount,
          token: selectedToken,
          postId,
          txHash,
          network: selectedNetwork
        });
        
        toast.success('Tip sent successfully', { duration: 3000 });
        
        if (txHash) {
          const explorerLink = getExplorerTxLink(selectedNetwork, txHash);
          // Paragon dostaje pierwszenstwo przed linkiem do eksploratora.
          // Eksplorator jest dowodem dla jednej osoby; paragon jest tym samym
          // dowodem w formie, ktora da sie komus wyslac - z wlasna karta OG,
          // wiec podglad linku pokazuje kwote, zanim ktokolwiek kliknie.
          const receiptLink = `/tip/${txHash}`;
          setTimeout(() => {
            toast.success(
              <div className="flex flex-col gap-1.5">
                <span className="font-medium">Receipt ready to share</span>
                <div className="flex items-center gap-3 text-xs">
                  <a
                    href={receiptLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-white underline underline-offset-2 hover:opacity-80 transition-opacity [transition-duration:var(--dur-press)] ease-out-strong"
                  >
                    Open receipt
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}${receiptLink}`);
                      toast.success('Receipt link copied');
                    }}
                    className="text-white underline underline-offset-2 hover:opacity-80 transition-opacity [transition-duration:var(--dur-press)] ease-out-strong"
                  >
                    Copy link
                  </button>
                  <a
                    href={explorerLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/80 underline underline-offset-2 hover:text-white transition-colors [transition-duration:var(--dur-press)] ease-out-strong"
                  >
                    {selectedNetworkConfig?.name}
                  </a>
                </div>
              </div>,
              { duration: 12000 }
            );
          }, 2000);
        }
      } catch (error) {
        console.error('Error saving tip:', error);
        toast.error('Tip sent but failed to save to database');
      }
      
      setTransactionSuccess(true);
      setTimeout(() => {
        setIsTransacting(false);
        setTransactionSuccess(false);
        setIsOpen(false);
        setTipSaved(false); // Reset for next tip
      }, 2000);
    } else if (status.statusName === 'error') {
      toast.dismiss();
      const errorMessage = status.statusData?.message || 'Transaction failed';
      console.error('Transaction error:', errorMessage);
      toast.error(`Tip failed: ${errorMessage}`);
      setIsTransacting(false);
      setTipSaved(false); // Reset on error
    } else if (status.statusName === 'transactionPending') {
      toast.dismiss();
      toast.loading('Sending tip...', { duration: 0 });
      setIsTransacting(true);
    }
  }, [address, recipientAddress, tipAmount, selectedToken, selectedNetwork, postId, selectedNetworkConfig, tipSaved]);

  // Mapowanie stanu wagmi na ten sam cykl statusow, ktory wczesniej dostarczal
  // OnchainKit przez onStatus. Dzieki temu cala logika ponizej (zapis tipu,
  // toasty, link do eksploratora) zostaje bez zmian.
  useEffect(() => {
    if (sentTxHash && isWaitingForReceipt) {
      handleTransactionStatus({ statusName: 'transactionPending' });
    }
  }, [sentTxHash, isWaitingForReceipt, handleTransactionStatus]);

  useEffect(() => {
    if (!receipt) return;
    if (receipt.status === 'success') {
      handleTransactionStatus({
        statusName: 'success',
        statusData: { transactionHash: receipt.transactionHash },
      });
    } else {
      // Transakcja weszla na lancuch, ale sie cofnela - to NIE jest sukces.
      handleTransactionStatus({
        statusName: 'error',
        statusData: { message: 'Transaction reverted on-chain' },
      });
    }
    resetSend();
  }, [receipt, handleTransactionStatus, resetSend]);

  useEffect(() => {
    if (!sendError) return;

    // Uzytkownik odrzucil podpis w portfelu - sprzatamy stan i milkniemy.
    // Czerwony komunikat o "nieudanym napiwku" bylby klamstwem: nic sie nie
    // zepsulo, po prostu nie doszlo do wyslania.
    if (isUserRejection(sendError)) {
      toast.dismiss();
      setIsTransacting(false);
      setTipSaved(false);
      resetSend();
      return;
    }

    handleTransactionStatus({
      statusName: 'error',
      statusData: { message: sendError.message },
    });
    resetSend();
  }, [sendError, handleTransactionStatus, resetSend]);

  const getCalls = useCallback(() => {
    if (!isConnected || !address || !recipientAddress || !tipAmount) {
      return [];
    }

    const amount = parseFloat(tipAmount);
    if (amount <= 0) return [];

    if (selectedTokenConfig.isNative) {
      // Native token transfer (ETH, CELO, CAMP)
      return [{
        to: recipientAddress as `0x${string}`,
        value: parseEther(tipAmount)
      }];
    } else {
      // ERC20 token transfer
      const tokenAmount = parseUnits(tipAmount, selectedTokenConfig.decimals);
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [recipientAddress as `0x${string}`, tokenAmount]
      });
      
      return [{
        to: selectedTokenConfig.contractAddress!,
        data
      }];
    }
  }, [address, recipientAddress, tipAmount, selectedTokenConfig, isConnected]);

  const formatBalance = (balance: any, decimals: number, isLoading?: boolean) => {
    if (isLoading) return 'Loading...';
    if (!balance) return '0.00';
    const formatted = parseFloat(formatUnits(balance.value, decimals));
    return decimals === 6 ? formatted.toFixed(2) : formatted.toFixed(6);
  };

  const getCurrentBalance = () => {
    if (selectedTokenConfig.isNative) {
      return formatBalance(nativeBalance, selectedTokenConfig.decimals, nativeLoading);
    }
    return formatBalance(tokenBalance, selectedTokenConfig.decimals, tokenLoading);
  };

  // Saldo, ktore dopiero sie laduje, to NIE jest "brak srodkow". Wczesniej przez
  // pierwsze sekundy po otwarciu modalu przycisk mowil "Insufficient ETH", nawet
  // gdy uzytkownik mial pelny portfel.
  const isBalanceLoading = selectedTokenConfig.isNative ? nativeLoading : tokenLoading;
  // Pusty albo niepoprawny wpis to nie jest kwota do wyslania - trzymane osobno,
  // bo NaN w porownaniach cicho wychodzi na "false" i przepuszczal klikniecie.
  const parsedTipAmount = parseFloat(tipAmount);
  const hasValidAmount = Number.isFinite(parsedTipAmount) && parsedTipAmount > 0;

  const hasInsufficientBalance = () => {
    if (!hasValidAmount) return false;
    if (isBalanceLoading) return false;
    const balance = selectedTokenConfig.isNative ? nativeBalance : tokenBalance;
    if (!balance) return true;
    const balanceValue = parseFloat(formatUnits(balance.value, selectedTokenConfig.decimals));
    return balanceValue < parsedTipAmount;
  };

  if (!isConnected || isSelfTip) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setTransactionSuccess(false);
        }}
        className={`flex items-center gap-1.5 rounded-pill font-soft transition-[color,background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-accent-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary touch-manipulation ${className}`}
        disabled={isTransacting}
        title="Send tip"
        aria-label="Send tip"
      >
        {/* Ta sama ikona wektorowa na kazdej szerokosci. Wczesniej telefon
            dostawal emoji 💲, a desktop wektor - czyli DWA rozne przyciski
            w zaleznosci od ekranu. */}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
        {/* Prog `sm:`, nie `md:` - taki sam jak w calym pasku akcji pod postem
            (ACTION_LABEL w PostList.tsx). Gdy ten przycisk chowal napis dopiero
            od `md`, a sasiednie od `sm`, to miedzy 576 a 768 px pasek mial
            mieszankę: czesc pozycji z napisem, czesc bez.

            PostList dorownywal to z ZEWNATRZ, selektorem potomnym po strukturze
            tego komponentu - czyli jego wyglad zalezal od tego, ze pierwszym
            dzieckiem jest tu `span`. Prog ustawiony u zrodla usuwa to
            sprzezenie. */}
        <span className="hidden sm:inline text-[12.5px] font-semibold">Tip</span>
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overscroll-contain">
          <div 
            className="absolute inset-0 bg-soft-ink/30"
            onClick={() => { setIsOpen(false); setTipSaved(false); }}
          ></div>

          {/* Reguly ukrywajace linki OnchainKit zniknely razem z OnchainKit -
              transakcja idzie teraz przez czyste wagmi, w modalu nie ma czego chowac. */}
          <div
            className="relative w-full max-w-sm mx-auto bg-soft-surface rounded-card shadow-float border border-soft-line p-5 overflow-hidden max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Jedna, ciepla poswiata w rogu. Druga (fioletowa) i pusty
                `bg-transparent` nic nie wnosily poza trzema warstwami do zlozenia. */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-soft-accent-soft/70 rounded-full"></div>

            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-soft-display font-bold text-soft-ink">
                  Tip creator
                </h3>
                <button
                  onClick={() => { setIsOpen(false); setTipSaved(false); }}
                  className="text-soft-ink-muted hover:text-soft-ink hover:bg-soft-line transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary bg-soft-sunken rounded-full p-2 border border-soft-line"
                  aria-label="Close tip dialog"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Network Selection - Icons Grid */}
              <div className="mb-4">
                <label className="block font-soft text-[11px] font-bold uppercase tracking-wider text-soft-ink-soft mb-2">Network</label>
                <div className="grid grid-cols-6 gap-2">
                  {ALL_NETWORKS.map((network) => {
                    // Linea i Celo maja logo, ktore wypelnia caly kafelek
                    const useFullImage = NETWORK_FULL_IMAGE.has(network.id);
                    const bgColor = NETWORK_BG_COLORS[network.id] || 'bg-soft-sunken';

                    return (
                      <button
                        key={network.id}
                        onClick={() => setSelectedNetwork(network.id)}
                        className={`w-10 h-10 rounded-pill transition-[transform,box-shadow] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary flex items-center justify-center overflow-hidden ${bgColor} ${
                          selectedNetwork === network.id
                            ? 'ring-2 ring-soft-primary shadow-chip scale-110'
                            : 'ring-1 ring-soft-line hover:ring-soft-line-strong'
                        }`}
                        title={network.name}
                        aria-label={network.name}
                        aria-pressed={selectedNetwork === network.id}
                      >
                        {useFullImage && network.iconUrl ? (
                          <img 
                            src={network.iconUrl} 
                            alt={network.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : network.iconUrl ? (
                          <img 
                            src={network.iconUrl} 
                            alt={network.name}
                            className="w-6 h-6 object-contain"
                          />
                        ) : (
                          <span className="text-lg">{network.icon}</span>
                        )}
                      </button>
                    );
                  })}
                  </div>
                <div className="font-soft text-xs text-soft-ink-soft mt-2">
                  {selectedNetworkConfig?.name}
                </div>
              </div>

              {/* Token Selection - Icons */}
              <div className="mb-4">
                <label className="block font-soft text-[11px] font-bold uppercase tracking-wider text-soft-ink-soft mb-2">Token</label>
                <div className="flex gap-2">
                  {availableTokens.map((token) => {
                    const tokenBg = TOKEN_BG_COLORS[token.symbol] || '';

                    // Na Base używamy niebieskiego kwadratu zamiast ETH logo
                    const isBaseETH = selectedNetwork === 'base' && token.symbol === 'ETH';
                    const tokenIconUrl = isBaseETH ? '/logotypy/Base_square_blue.png' : token.iconUrl;
                    
                    return (
                  <button
                        key={token.symbol}
                        onClick={() => {
                          setSelectedToken(token.symbol);
                          setTipAmount(getQuickAmounts(token.symbol)[0]);
                        }}
                        className={`flex-1 px-3 py-3 rounded-pill border transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary flex items-center justify-center gap-2 ${
                          selectedToken === token.symbol
                            ? 'bg-soft-sunken border-soft-primary shadow-chip'
                            : 'bg-soft-surface border-soft-line hover:bg-soft-sunken'
                        }`}
                        aria-pressed={selectedToken === token.symbol}
                      >
                        {tokenIconUrl ? (
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center overflow-hidden ${tokenBg} ${isBaseETH ? 'ring-1 ring-white' : ''}`}>
                            <img 
                              src={tokenIconUrl} 
                              alt={token.symbol} 
                              className="w-4 h-4 object-contain"
                            />
                          </div>
                        ) : (
                          <span className="text-lg">{token.icon}</span>
                        )}
                        <span className={`font-soft text-sm font-semibold ${selectedToken === token.symbol ? 'text-soft-primary-deep' : 'text-soft-ink-muted'}`}>{token.symbol}</span>
                  </button>
                    );
                  })}
                </div>
              </div>

              {/* Network mismatch warning */}
              {!isCorrectNetwork && (
                <div className="mb-4 p-3 bg-soft-accent-soft rounded-card text-soft-accent-deep font-soft text-sm">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.5M12 16h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <span>Switch to {selectedNetworkConfig?.name} to send tip</span>
                  </div>
                </div>
              )}

              {/* Amount Input */}
              <div className="mb-3">
                <label className="block font-soft text-[11px] font-bold uppercase tracking-wider text-soft-ink-soft mb-2">Amount</label>
                {/* type="text", nie "number" - przegladarka w polu liczbowym
                    ODRZUCA przecinek zamiast zamienic go na kropke, wiec
                    wpisane "0,5" zostawalo jako "05", czyli PIEC. Ten sam blad
                    zlapal wlasciciel na cenie platnej sekcji. Powod i testy
                    w app/utils/monetization/parseAmount.ts. */}
                <input
                  type="text"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(normalizeAmountInput(e.target.value))}
                  autoComplete="off"
                  className="w-full px-4 py-3 text-base border bg-soft-sunken border-soft-line rounded-card text-soft-accent-deep font-soft-display font-bold tabular-nums transition-colors [transition-duration:var(--dur-press)] ease-out-strong focus:outline-none focus:ring-2 focus:ring-soft-primary focus:border-soft-primary placeholder:text-soft-ink-faint"
                  inputMode="decimal"
                />
              </div>

              {/* Quick amounts */}
              <div className="mb-4">
                <div className="flex gap-2">
                  {getQuickAmounts(selectedToken).map((amount) => (
                  <button
                      key={amount}
                      onClick={() => setTipAmount(amount)}
                      className={`flex-1 px-2 py-2 text-sm font-soft-display font-bold tabular-nums rounded-pill border transition-[background-color,border-color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                        tipAmount === amount
                          ? 'bg-soft-sunken border-soft-primary text-soft-primary-deep'
                          : 'bg-soft-surface border-soft-line hover:bg-soft-sunken text-soft-ink-muted'
                      }`}
                    >
                      {selectedTokenConfig.decimals === 6 ? '$' : ''}{amount}
                  </button>
                  ))}
                </div>
              </div>

              {/* Balance Display */}
              <div className="mb-4 font-soft text-sm text-soft-ink-soft">
                <span>Balance: <span className="font-soft-display font-semibold tabular-nums text-soft-ink">{getCurrentBalance()}</span> {selectedToken}</span>
              </div>

              {/* Transaction states */}
                {/* Postep to komunikat INTERFEJSU, wiec bierze kolor interfejsu.
                    `soft-accent` zostaje przy kwocie - to jedyna rzecz w tym
                    oknie, ktorej nie da sie nabic. */}
                {isTransacting && !transactionSuccess && (
                <div className="mb-4 p-3 bg-soft-sunken rounded-card text-soft-primary-deep font-soft text-sm text-center">
                  <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
                    <span>Processing...</span>
                  </div>
                  </div>
                )}

                {transactionSuccess && (
                <div className="mb-4 p-3 bg-soft-info-soft rounded-card text-soft-info font-soft text-sm">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Tip sent successfully</span>
                  </div>
                  </div>
                )}
                
              {/* Action Button */}
              <div className="mt-4">
                {!isCorrectNetwork ? (
                  <button
                    onClick={ensureCorrectNetwork}
                    // Zmiana sieci to czynnosc interfejsu, a nie kwota - stad
                    // `soft-primary`. Pomaranczowy zostaje przy pieniadzach.
                    className="w-full px-6 py-3 font-soft text-base font-bold rounded-pill bg-soft-primary hover:bg-soft-primary-deep text-white shadow-chip transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    Switch to {selectedNetworkConfig?.name}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const calls = getCalls();
                      if (calls.length === 0) return;
                      const [call] = calls;
                      setIsTransacting(true);
                      sendTransaction({
                        to: call.to,
                        // Natywny transfer ma `value`, ERC-20 ma `data` - wysylamy
                        // dokladnie to, co zbudowal getCalls().
                        ...('value' in call ? { value: call.value } : {}),
                        ...('data' in call ? { data: call.data } : {}),
                      });
                    }}
                    // `parseFloat('') <= 0` to `NaN <= 0`, czyli `false` - przycisk
                    // z pustym polem kwoty byl WLACZONY, a klikniecie nie robilo nic
                    // (getCalls() zwracalo pusta tablice i handler cicho wychodzil).
                    disabled={!hasValidAmount || isBalanceLoading || hasInsufficientBalance() || isTransacting}
                    className="w-full px-6 py-3 font-soft text-base font-bold rounded-pill bg-soft-primary text-white shadow-chip transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {hasInsufficientBalance()
                      ? `Insufficient ${selectedToken}`
                      : isTransacting
                      ? 'Processing...'
                      : `Tip ${tipAmount} ${selectedToken}`}
                  </button>
                )}
                
                {/* Base Pay Button - tylko dla USDC na Base */}
                {selectedNetwork === 'base' && selectedToken === 'USDC' && isCorrectNetwork && (
                  <div className="text-center mt-3">
                    <div className="font-soft text-xs text-soft-ink-soft mb-2">Or pay with Base Pay</div>
                    <BasePayButton
                      colorScheme="dark"
                      onClick={async () => {
                        try {
                          setIsTransacting(true);
                          
                          const paymentResult = await pay({
                            amount: tipAmount,
                            to: recipientAddress,
                            testnet: false
                          });
                          
                          const id = (paymentResult as any)?.id || 
                                    (paymentResult as any)?.paymentId || 
                                    (paymentResult as any)?.transactionId || 
                                    paymentResult;
                          
                          // Odpytywanie nie moze trwac w nieskonczonosc - platnosc,
                          // ktora nigdy nie wychodzi ze stanu "pending", zostawiala
                          // modal na zawsze w "Processing...".
                          const MAX_STATUS_POLLS = 60; // ~2 minuty co 2 sekundy
                          let statusPolls = 0;

                          const pollStatus = async () => {
                            try {
                              const { status } = await getPaymentStatus({
                                id,
                                testnet: false
                              });

                              if (status === 'completed') {
                                // Guard against duplicate saves
                                if (!tipSaved) {
                                  setTipSaved(true);
                                  // Nieudany zapis do bazy NIE moze wpasc do catch
                                  // ponizej - platnosc sie udala, a uzytkownik
                                  // zobaczylby komunikat o bledzie sprawdzania statusu.
                                  try {
                                    // `id` z Base Pay to hash userOp, a nie
                                    // transakcji - pod /tx/ w eksploratorze go
                                    // nie ma. Zapisanie go do `txHash` sprawialo,
                                    // ze dowod platnosci na stronie Paid
                                    // prowadzil do pustej strony. Pytamy bundlera
                                    // o prawdziwy hash; gdy nie odpowie, zapisujemy
                                    // to co mamy - tip jest wazniejszy niz link.
                                    const realTxHash = await resolveUserOpToTxHash(id);

                                    await saveTip({
                                      senderAddress: address!,
                                      recipientAddress,
                                      amount: tipAmount,
                                      token: 'USDC',
                                      postId,
                                      txHash: realTxHash ?? id,
                                      network: 'base'
                                    });
                                  } catch (saveError) {
                                    console.error('Error saving tip:', saveError);
                                    toast.error('Tip sent but failed to save to database');
                                  }
                                }

                                toast.success('Tip sent via Base Pay');
                                setTransactionSuccess(true);
                                setIsTransacting(false);

                                setTimeout(() => {
                                  setIsOpen(false);
                                  setTransactionSuccess(false);
                                  setTipSaved(false);
                                }, 2000);
                                return;
                              }

                              if (status === 'failed') {
                                // To platnosc sie nie powiodla, a nie sprawdzanie jej
                                // statusu. Wczesniej `throw` wpadal do catch ponizej
                                // i pokazywal komunikat o NIEWLASCIWEJ przyczynie.
                                toast.error('Base Pay payment failed');
                                setIsTransacting(false);
                                setTipSaved(false);
                                return;
                              }

                              statusPolls += 1;
                              if (statusPolls >= MAX_STATUS_POLLS) {
                                toast.error('Base Pay is taking longer than expected - check your wallet for the final status');
                                setIsTransacting(false);
                                return;
                              }

                              setTimeout(pollStatus, 2000);
                            } catch (error) {
                              console.error('Error checking payment status:', error);
                              toast.error('Failed to verify payment status');
                              setIsTransacting(false);
                            }
                          };

                          setTimeout(pollStatus, 1000);

                        } catch (error) {
                          console.error('Base Pay error:', error);
                          setIsTransacting(false);
                          // Rezygnacja z platnosci w portfelu to nie awaria - patrz isUserRejection.
                          if (isUserRejection(error)) return;
                          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                          toast.error(`Base Pay failed: ${errorMessage}`);
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
} 
