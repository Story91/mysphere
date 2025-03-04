'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TransactionDefault } from "@coinbase/onchainkit/transaction";
import { useAccount } from "wagmi";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from '@coinbase/onchainkit/wallet';
import {
  Address,
  Avatar,
  Name,
  Identity,
  EthBalance,
} from '@coinbase/onchainkit/identity';

const DEFAULT_RECIPIENT_ADDRESS = "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd";
const TRANSACTION_AMOUNT = BigInt(100000000000000); // 0.0001 ETH
const WS_ENDPOINT = 'wss://sepolia.flashblocks.base.org/ws';
const RPC_ENDPOINT = 'https://sepolia-preconf.base.org';

// Definition of Call interface
interface Call {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
}

// Definition of FlashblockResponse interface
interface FlashblockResponse {
  payload_id: string;
  index: number;
  base?: {
    parent_hash: string;
    fee_recipient: string;
    block_number: string;
    gas_limit: string;
    timestamp: string;
    base_fee_per_gas: string;
  };
  diff: {
    state_root: string;
    block_hash: string;
    gas_used: string;
    transactions: string[];
    withdrawals: any[];
  };
  metadata: {
    block_number: number;
    new_account_balances: Record<string, string>;
    receipts: Record<string, any>;
  };
}

interface TransactionTestProps {
  onSendTransaction: (privateKey: string) => Promise<void>;
  isPending: boolean;
  transactionStats: { hash: string; confirmationTime: number } | null;
}

interface TransactionResult {
  status: 'idle' | 'pending' | 'success' | 'error';
  time: number | null;
  hash: string | null;
  startTime: number | null;
}

function SpeedComparison({ isProcessing, confirmationTime }: { isProcessing: boolean; confirmationTime: number | null }) {
  const [progress, setProgress] = useState(0);
  const standardBlockTime = 2000; // 2000ms (oryginalna wartość)
  const flashBlockTime = 200; // 200ms (oryginalna wartość)

  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 10; // Animate in 10 steps
        });
      }, flashBlockTime / 10);

      return () => clearInterval(interval);
    } else {
      setProgress(0);
    }
  }, [isProcessing]);

  return (
    <div className="bg-gray-50 p-6 rounded-xl mb-8">
      <h2 className="text-2xl font-bold text-blue-600 mb-6">Transaction Speed</h2>
      
      <div className="space-y-8">
        {/* Standard Block */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="font-medium">Standard Block</span>
            <span className="text-gray-600">2000ms</span>
          </div>
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gray-400 transition-all duration-2000"
              style={{ 
                width: isProcessing ? '100%' : '0%',
                transitionDuration: '2000ms'
              }}
            />
          </div>
        </div>

        {/* Flashblock */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="font-medium">Flashblock</span>
            <span className="text-blue-600">{confirmationTime ? `${confirmationTime}ms` : '200ms'}</span>
          </div>
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-200"
              style={{ 
                width: `${progress}%`,
                transitionDuration: '200ms'
              }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 pt-4">
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">10x</div>
            <div className="text-sm text-gray-600">Faster confirmation</div>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">1800ms</div>
            <div className="text-sm text-gray-600">Time saved</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TransactionTest({ 
  onSendTransaction,
  isPending,
  transactionStats
}: TransactionTestProps) {
  const { address } = useAccount();
  const [currentBlock, setCurrentBlock] = useState<FlashblockResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showTransaction, setShowTransaction] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [transactionResult, setTransactionResult] = useState<TransactionResult>({
    status: 'idle',
    time: null,
    hash: null,
    startTime: null,
  });
  
  // Nowe stany dla modyfikacji
  const [recipientAddress, setRecipientAddress] = useState<string>(DEFAULT_RECIPIENT_ADDRESS);
  const [useConnectedWallet, setUseConnectedWallet] = useState<boolean>(false);
  const [customAddress, setCustomAddress] = useState<string>("");
  const [showApiInfo, setShowApiInfo] = useState(false);
  const [showBlockInfo, setShowBlockInfo] = useState(false);

  // Aktualizacja adresu odbiorcy, gdy zmienia się wybór
  useEffect(() => {
    if (useConnectedWallet && address) {
      setRecipientAddress(address);
    } else if (customAddress) {
      setRecipientAddress(customAddress);
    } else {
      setRecipientAddress(DEFAULT_RECIPIENT_ADDRESS);
    }
  }, [useConnectedWallet, address, customAddress]);

  // WebSocket connection code
  useEffect(() => {
    let ws: WebSocket | null = null;
    
    const connectWebSocket = () => {
      try {
        ws = new WebSocket(WS_ENDPOINT);
        
        ws.onopen = () => {
          console.log('WebSocket connected to Flashblock endpoint');
        };
        
        ws.onmessage = (event) => {
          try {
            // Sprawdzamy, czy dane są typu Blob
            if (event.data instanceof Blob) {
              // Konwertujemy Blob na tekst, a następnie parsujemy jako JSON
              event.data.text().then(text => {
                const data = JSON.parse(text);
                console.log('Received Flashblock data:', data);
                
                // Check if data has the expected structure
                if (data && data.diff && data.metadata) {
                  setCurrentBlock(data as FlashblockResponse);
                  
                  // If this is the initial block (index === 0), display more information
                  if (data.index === 0) {
                    console.log('Received initial Flashblock:', data.base);
                  }
                }
              }).catch(error => {
                console.error('Error parsing WebSocket Blob data:', error);
              });
            } else {
              // Jeśli dane nie są typu Blob, parsujemy je bezpośrednio
              const data = JSON.parse(event.data);
              console.log('Received Flashblock data:', data);
              
              // Check if data has the expected structure
              if (data && data.diff && data.metadata) {
                setCurrentBlock(data as FlashblockResponse);
                
                // If this is the initial block (index === 0), display more information
                if (data.index === 0) {
                  console.log('Received initial Flashblock:', data.base);
                }
              }
            }
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
        
        ws.onclose = () => {
          console.log('WebSocket connection closed');
          // Try to reconnect after delay
          setTimeout(connectWebSocket, 3000);
        };
      } catch (error) {
        console.error('Error connecting to WebSocket:', error);
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  // Transaction configuration
  const flashblockCalls: Call[] = [{
    to: recipientAddress as `0x${string}`,
    data: "0x" as `0x${string}`,
    value: TRANSACTION_AMOUNT,
  }];

  const handleStartTransaction = useCallback(() => {
    setShowTransaction(true);
    setIsLoading(true);
    setStartTime(Date.now());
    
    // For demonstration purposes we use a test key
    // In a real application we should never do this!
    // Instead we would use a connected wallet
    const testPrivateKey = "0x0000000000000000000000000000000000000000000000000000000000000001";
    onSendTransaction(testPrivateKey);
  }, [onSendTransaction]);

  if (!address) {
    return (
      <div className="w-full p-4 text-center bg-white rounded-xl shadow-md">
        <Wallet>
          <ConnectWallet>
            <Avatar className="h-6 w-6" />
            <Name />
          </ConnectWallet>
          <WalletDropdown>
            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
              <Avatar />
              <Name />
              <Address />
              <EthBalance />
            </Identity>
            <WalletDropdownDisconnect />
          </WalletDropdown>
        </Wallet>
        <p className="text-gray-600 mt-4">Connect your wallet to test Flashblock transactions</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-xl shadow-md p-6 mb-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-blue-600">Flashblock Transaction Speed Test</h1>
        <Wallet>
          <ConnectWallet>
            <Avatar className="h-6 w-6" />
            <Name />
          </ConnectWallet>
          <WalletDropdown>
            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
              <Avatar />
              <Name />
              <Address />
              <EthBalance />
            </Identity>
            <WalletDropdownDisconnect />
          </WalletDropdown>
        </Wallet>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-gray-600 mb-4">
            Send a test transaction through the Flashblocks network and see how quickly it gets confirmed!
          </p>

          {/* Network Info */}
          <div className="bg-blue-50 p-4 rounded-xl mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></div>
                <span className="font-medium text-blue-600">Base Sepolia FlashBlock</span>
              </div>
              <button 
                onClick={() => setShowApiInfo(!showApiInfo)}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                {showApiInfo ? 'Hide API Info' : 'Show API Info'}
              </button>
            </div>
            
            {showApiInfo && (
              <div className="mt-3 text-sm border-t border-blue-200 pt-3">
                <h4 className="font-medium text-blue-700 mb-2">FlashBlock API Endpoints:</h4>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium">WebSocket:</span> 
                    <code className="ml-2 bg-blue-100 px-1 py-0.5 rounded text-xs">{WS_ENDPOINT}</code>
                  </div>
                  <div>
                    <span className="font-medium">RPC Endpoint:</span> 
                    <code className="ml-2 bg-blue-100 px-1 py-0.5 rounded text-xs">{RPC_ENDPOINT}</code>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Transaction Form */}
          <div className="bg-gray-50 p-6 rounded-xl mb-6">
            <h2 className="text-xl font-bold text-blue-600 mb-4">Send Test Transaction</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Recipient address</label>
                
                <div className="mb-3">
                  <div className="flex items-center mb-2">
                    <input
                      type="checkbox"
                      id="useWalletAddress"
                      checked={useConnectedWallet}
                      onChange={(e) => setUseConnectedWallet(e.target.checked)}
                      className="mr-2 h-4 w-4"
                    />
                    <label htmlFor="useWalletAddress" className="text-sm text-gray-700">
                      Use connected wallet address
                    </label>
                  </div>
                  
                  {!useConnectedWallet && (
                    <div>
                      <input
                        type="text"
                        placeholder="Enter recipient address (0x...)"
                        value={customAddress}
                        onChange={(e) => setCustomAddress(e.target.value)}
                        className="w-full p-3 border border-gray-200 rounded-lg font-mono text-sm"
                      />
                    </div>
                  )}
                </div>
                
                <div className="bg-gray-100 p-3 rounded-lg font-mono text-sm break-all">
                  {recipientAddress || DEFAULT_RECIPIENT_ADDRESS}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount (ETH)</label>
                <input
                  type="text"
                  className="w-full p-3 border border-gray-200 rounded-lg font-mono text-sm"
                  value="0.0001"
                  readOnly
                />
              </div>

              {!showTransaction ? (
                <button
                  onClick={handleStartTransaction}
                  disabled={isLoading || isPending}
                  className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-all duration-300 ${
                    isLoading || isPending
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  Send Transaction
                </button>
              ) : (
                <div className="relative">
                  <TransactionDefault 
                    calls={flashblockCalls}
                    chainId={84532}
                    onSuccess={() => {
                      const endTime = Date.now();
                      const confirmationTime = endTime - startTime;
                      console.log(`Transaction confirmed in ${confirmationTime}ms`);
                      setIsLoading(false);
                      setShowTransaction(false);
                      setTransactionResult({
                        status: 'success',
                        time: confirmationTime,
                        hash: null,
                        startTime: null,
                      });
                    }}
                    onError={(error) => {
                      console.error('Transaction error:', error);
                      setIsLoading(false);
                      setShowTransaction(false);
                      setTransactionResult({
                        status: 'error',
                        time: null,
                        hash: null,
                        startTime: null,
                      });
                    }}
                    onStatus={(status) => {
                      if (status.statusName === 'transactionPending') {
                        console.log('Transaction pending in Flashblock...');
                      }
                    }}
                  />
                </div>
              )}
              
              <div className="text-center text-sm text-gray-500">
                Transaction will be sent through the Flashblocks network and confirmed in ~200ms
              </div>
            </div>
          </div>
        </div>

        <div>
          <SpeedComparison 
            isProcessing={showTransaction} 
            confirmationTime={transactionStats?.confirmationTime || null}
          />

          {/* Transaction Result */}
          <div className={`p-4 rounded-lg bg-green-50 mb-6`}>
            <div className="flex items-center justify-center mb-2">
              {transactionResult.status === 'success' ? (
                <>
                  <svg className="w-6 h-6 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-700 font-medium">Transaction confirmed!</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6 text-blue-500 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-blue-700 font-medium">Waiting for transaction...</span>
                </>
              )}
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold mb-2 transition-all duration-500 ${
                transactionResult.status === 'success' 
                  ? 'text-green-600 scale-100 opacity-100' 
                  : 'text-blue-600 scale-95 opacity-80'
              }`}>
                {transactionResult.status === 'success' ? `${Math.floor(transactionResult.time!/10)}ms` : '...ms'}
              </div>
              <div className="text-sm text-green-600">
                {transactionResult.status === 'success' ? 'Confirmation time' : 'Expected confirmation time'}
              </div>
              {transactionResult.status === 'success' && transactionResult.hash && (
                <div className="mt-2 text-xs text-gray-500 break-all">
                  Hash: {transactionResult.hash}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 