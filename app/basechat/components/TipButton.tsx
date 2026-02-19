// @ts-nocheck
'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useChainId, useBalance, useSwitchChain } from 'wagmi';
import { 
  Transaction,
  TransactionButton,
} from '@coinbase/onchainkit/transaction';
import { parseEther, parseUnits, formatEther, formatUnits, encodeFunctionData } from 'viem';
import { toast } from 'react-hot-toast';
import { base } from 'wagmi/chains';
import { saveTip } from '../../utils/firebase';
// Base Pay imports
import { pay, getPaymentStatus } from '@base-org/account';
import { BasePayButton } from '@base-org/account-ui/react';
import {
  TipToken,
  TipNetwork,
  NetworkConfig,
  TokenConfig,
  NETWORKS,
  TOKENS,
  getNetworkByChainId,
  getTokensForNetwork,
  getDefaultTokenForNetwork,
  getQuickAmounts,
  getExplorerTxLink,
  chainIdToNetwork,
  ERC20_TRANSFER_ABI,
  ALL_NETWORKS,
} from './TipNetworkConfig';

interface TipButtonProps {
  recipientAddress: string;
  postId: string;
  className?: string;
}

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

  const handleTransactionStatus = useCallback(async (status: any) => {
    if (status.statusName === 'success') {
      // Guard against duplicate saves - OnchainKit may call onStatus multiple times
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
        
        toast.success(`Tip sent successfully! 🎉`, { duration: 3000 });
        
        if (txHash) {
          const explorerLink = getExplorerTxLink(selectedNetwork, txHash);
          setTimeout(() => {
            toast.success(
              <div className="flex flex-col gap-1">
                <span>View on {selectedNetworkConfig?.name}:</span>
                <a 
                  href={explorerLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 underline text-xs"
                >
                  {txHash.slice(0, 16)}...
                </a>
              </div>,
              { duration: 10000 }
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

  const hasInsufficientBalance = () => {
    const amount = parseFloat(tipAmount);
    const balance = selectedTokenConfig.isNative ? nativeBalance : tokenBalance;
    if (!balance) return true;
    const balanceValue = parseFloat(formatUnits(balance.value, selectedTokenConfig.decimals));
    return balanceValue < amount;
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
        className={`flex items-center space-x-1 hover:text-green-500 active:text-green-600 transition-colors touch-manipulation ${className}`}
        disabled={isTransacting}
        title="Send tip"
      >
        <span className="md:hidden text-sm">💲</span>
        <svg className="hidden md:block w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
        <span className="hidden md:inline text-xs">Tip</span>
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overscroll-contain">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setIsOpen(false); setTipSaved(false); }}
          ></div>
          
          {/* Ukryj domyślny "View Transaction" link z OnchainKit */}
          <style>{`
            .tip-modal-container [data-testid="ockTransactionStatus_Action"],
            .tip-modal-container a[href*="basescan.org"],
            .tip-modal-container a[href*="explorer"] {
              display: none !important;
            }
          `}</style>
          <div 
            className="tip-modal-container relative w-full max-w-sm mx-auto bg-gradient-to-br from-gray-900 via-black to-blue-900 backdrop-blur-xl rounded-2xl shadow-2xl border border-blue-500/30 p-5 overflow-hidden max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Glow effects */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500/30 rounded-full filter blur-2xl animate-pulse"></div>
            <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-cyan-400/20 rounded-full filter blur-xl"></div>
            <div className="absolute inset-0 bg-white/5 backdrop-blur-sm rounded-2xl"></div>
            
            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-light text-white">
                  💰 <span className="bg-gradient-to-r from-blue-400 to-cyan-400 text-transparent bg-clip-text">Tip Creator</span>
                </h3>
                <button
                  onClick={() => { setIsOpen(false); setTipSaved(false); }}
                  className="text-blue-300 hover:text-blue-100 transition-colors bg-white/10 rounded-full p-2 border border-blue-400/30"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Network Selection - Icons Grid */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-blue-200 mb-2">Network</label>
                <div className="grid grid-cols-6 gap-2">
                  {ALL_NETWORKS.map((network) => {
                    // Kolory tła dla każdej sieci - wypełniają cały przycisk
                    const bgColors: Record<string, string> = {
                      base: 'bg-white',
                      ethereum: 'bg-white',
                      celo: '', // Celo używa obrazka jako całego tła
                      world: 'bg-black',
                      linea: '', // Linea używa obrazka jako całego tła
                      camp: 'bg-white',
                    };
                    // Sieci które używają pełnego obrazka jako tła
                    const useFullImage = network.id === 'linea' || network.id === 'celo';
                    const iconSize = 'w-6 h-6';
                    const bgColor = bgColors[network.id] || 'bg-white/10';
                    
                    return (
                      <button
                        key={network.id}
                        onClick={() => setSelectedNetwork(network.id)}
                        className={`w-10 h-10 rounded-lg transition-all duration-200 flex items-center justify-center overflow-hidden ${bgColor} ${
                          selectedNetwork === network.id
                            ? 'ring-2 ring-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.4)] scale-110'
                            : 'ring-1 ring-white/20 hover:ring-white/40'
                        }`}
                        title={network.name}
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
                            className={`${iconSize} object-contain`}
                          />
                        ) : (
                          <span className="text-lg">{network.icon}</span>
                        )}
                      </button>
                    );
                  })}
                  </div>
                <div className="text-xs text-blue-300/70 mt-1 text-center">
                  {selectedNetworkConfig?.name}
                </div>
              </div>

              {/* Token Selection - Icons */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-blue-200 mb-2">Token</label>
                <div className="flex gap-2">
                  {availableTokens.map((token) => {
                    // Specjalne tło dla avatara tokena
                    const tokenBgColors: Record<string, string> = {
                      CAMP: 'bg-white',
                    };
                    const tokenBg = tokenBgColors[token.symbol] || '';
                    
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
                        className={`flex-1 px-3 py-3 rounded-xl border transition-all duration-200 flex items-center justify-center gap-2 ${
                          selectedToken === token.symbol
                            ? 'bg-blue-500/30 border-blue-400/60 shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                            : 'bg-white/10 border-white/20 hover:bg-white/20'
                        }`}
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
                        <span className="text-sm text-blue-100">{token.symbol}</span>
                  </button>
                    );
                  })}
                </div>
              </div>

              {/* Network mismatch warning */}
              {!isCorrectNetwork && (
                <div className="mb-4 p-3 bg-orange-500/20 border border-orange-400/50 rounded-xl text-orange-300 text-sm">
                  <div className="flex items-center gap-2">
                    <span>⚠️</span>
                    <span>Switch to {selectedNetworkConfig?.name} to send tip</span>
                  </div>
                </div>
              )}

              {/* Amount Input */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-blue-200 mb-2">Amount</label>
                <input
                  type="number"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  min="0"
                  step="any"
                  className="w-full px-4 py-3 text-base border bg-white/10 border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-blue-300/50"
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
                      className={`flex-1 px-2 py-2 text-sm rounded-xl border transition-all ${
                        tipAmount === amount
                          ? 'bg-blue-500/30 border-blue-400/60'
                          : 'bg-white/10 border-blue-400/30 hover:bg-blue-500/20'
                      } text-blue-200`}
                    >
                      {selectedTokenConfig.decimals === 6 ? '$' : ''}{amount}
                  </button>
                  ))}
                </div>
              </div>

              {/* Balance Display */}
              <div className="mb-4 text-sm text-blue-300">
                <span>Balance: {getCurrentBalance()} {selectedToken}</span>
              </div>

              {/* Transaction states */}
                {isTransacting && !transactionSuccess && (
                <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-400/50 rounded-xl text-yellow-300 text-sm text-center">
                  <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-yellow-300 border-t-transparent"></div>
                    <span>Processing...</span>
                  </div>
                  </div>
                )}
                
                {transactionSuccess && (
                <div className="mb-4 p-3 bg-green-500/20 border border-green-400/50 rounded-xl text-green-300 text-sm text-center">
                  <span>✅ Tip sent successfully!</span>
                  </div>
                )}
                
              {/* Action Button */}
              <div className="mt-4">
                {!isCorrectNetwork ? (
                  <button
                    onClick={ensureCorrectNetwork}
                    className="w-full px-6 py-3 text-base font-medium rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors"
                  >
                    Switch to {selectedNetworkConfig?.name}
                  </button>
                ) : (
                  <Transaction
                    chainId={selectedNetworkConfig?.chainId || 8453}
                    calls={getCalls()}
                    onStatus={handleTransactionStatus}
                    onError={(error) => {
                      console.error('Transaction error:', error);
                      toast.dismiss();
                      toast.error(`Transaction failed: ${error.message || 'Unknown error'}`);
                      setIsTransacting(false);
                    }}
                  >
                    <TransactionButton
                      text={
                        hasInsufficientBalance()
                          ? `Insufficient ${selectedToken}`
                          : isTransacting
                          ? 'Processing...'
                          : `Tip ${tipAmount} ${selectedToken}`
                      }
                      disabled={hasInsufficientBalance() || parseFloat(tipAmount) <= 0 || isTransacting}
                      className="w-full px-6 py-3 text-base font-medium rounded-xl"
                    />
                  </Transaction>
                )}
                
                {/* Base Pay Button - tylko dla USDC na Base */}
                {selectedNetwork === 'base' && selectedToken === 'USDC' && isCorrectNetwork && (
                  <div className="text-center mt-3">
                    <div className="text-xs text-blue-300 mb-2">Or pay with Base Pay:</div>
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
                                  await saveTip({
                                    senderAddress: address!,
                                    recipientAddress,
                                    amount: tipAmount,
                                    token: 'USDC',
                                    postId,
                                    txHash: id,
                                    network: 'base'
                                  });
                                }
                                
                                toast.success('Tip sent via Base Pay! 🎉');
                                setTransactionSuccess(true);
                                setIsTransacting(false);
                                
                                setTimeout(() => {
                                  setIsOpen(false);
                                  setTransactionSuccess(false);
                                  setTipSaved(false);
                                }, 2000);
                              } else if (status === 'failed') {
                                throw new Error('Payment failed');
                              } else {
                                setTimeout(pollStatus, 2000);
                              }
                            } catch (error) {
                              console.error('Error checking payment status:', error);
                              toast.error('Failed to verify payment status');
                              setIsTransacting(false);
                            }
                          };
                          
                          setTimeout(pollStatus, 1000);
                          
                        } catch (error) {
                          console.error('Base Pay error:', error);
                          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                          toast.error(`Base Pay failed: ${errorMessage}`);
                          setIsTransacting(false);
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
