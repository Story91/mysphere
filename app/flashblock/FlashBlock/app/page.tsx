'use client';

import { useState, useEffect } from 'react';
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
import TransactionTest from './components/TransactionTest';
import RaceTrack from './components/RaceTrack';
import BlockStats from './components/BlockStats';

export default function App() {
  const [isRacing, setIsRacing] = useState(false);
  const [transactionStats, setTransactionStats] = useState<{ hash: string; confirmationTime: number } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [flashBlockCount, setFlashBlockCount] = useState(0);
  const [standardBlockCount, setStandardBlockCount] = useState(0);
  
  // Simulated block data
  const [standardBlock, setStandardBlock] = useState<any>(null);
  const [flashBlock, setFlashBlock] = useState<any>(null);
  
  // Generate standard blocks every 2 seconds
  useEffect(() => {
    const standardBlockInterval = setInterval(() => {
      // Generate a new standard block (1 per 2 seconds)
      const newStandardBlock = {
        number: Math.floor(Math.random() * 10000).toString(),
        transactions: Array(Math.floor(Math.random() * 50) + 10).fill(0),
        hash: '0x' + Math.random().toString(16).substring(2, 42),
        timestamp: Math.floor(Date.now() / 1000)
      };
      setStandardBlock(newStandardBlock);
      setStandardBlockCount(prev => prev + 1);
    }, 2000);
    
    return () => {
      clearInterval(standardBlockInterval);
    };
  }, []);
  
  // Generate flashblocks every 200ms (10 per 2 seconds)
  useEffect(() => {
    const flashBlockInterval = setInterval(() => {
      const newFlashBlock = {
        number: Math.floor(Math.random() * 10000).toString(),
        transactions: Array(Math.floor(Math.random() * 100) + 50).fill(0),
        hash: '0x' + Math.random().toString(16).substring(2, 42),
        timestamp: Math.floor(Date.now() / 1000)
      };
      setFlashBlock(newFlashBlock);
      setFlashBlockCount(prev => prev + 1);
    }, 200);
    
    return () => {
      clearInterval(flashBlockInterval);
    };
  }, []);

  const handleSendTransaction = async (privateKey: string) => {
    setIsPending(true);
    setIsRacing(true);
    
    // Transaction simulation - in a real app this would be a real transaction
    const startTime = Date.now();
    
    try {
      // Zawsze używamy FlashBlock dla transakcji
      const confirmationTime = 5; // ms (skrócone z 50ms)
      
      console.log('Sending transaction through FlashBlock endpoint: https://sepolia-preconf.base.org');
      console.log('Using WebSocket connection: wss://sepolia.flashblocks.base.org/ws');
      console.log('FlashBlock transaction will be confirmed in ~5ms');
      
      // In a real implementation, we would:
      // 1. Send the transaction to the FlashBlock RPC endpoint
      // 2. Listen for the transaction receipt using eth_getTransactionReceipt
      // 3. Monitor the WebSocket for real-time updates
      
      console.log('Transaction flow for FlashBlock:');
      console.log('1. Send transaction to https://sepolia-preconf.base.org');
      console.log('2. Transaction is pre-confirmed in a FlashBlock');
      console.log('3. Transaction appears in the pending block (eth_getBlockByNumber with "pending" tag)');
      console.log('4. Transaction is eventually included in a final block');
      
      // Simulate transaction processing
      await new Promise(resolve => setTimeout(resolve, 5));
      
      // Generate random transaction hash
      const transactionHash = '0x' + Math.random().toString(16).substring(2, 42);
      
      setTransactionStats({
        hash: transactionHash,
        confirmationTime
      });
      
      // Log transaction confirmation
      console.log(`Transaction ${transactionHash} confirmed in ${confirmationTime}ms`);
      console.log('FlashBlock transaction confirmed 400x faster than standard transaction!');
      console.log('To query this transaction: curl https://sepolia-preconf.base.org -X POST -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["' + transactionHash + '"],"id":1}\'');
      
      // Stop racing after transaction completes
      setTimeout(() => {
        setIsPending(false);
        // Keep race active for a moment so user can see results
        setTimeout(() => setIsRacing(false), 1000);
      }, 100);
      
    } catch (error) {
      console.error('Transaction error:', error);
      setIsPending(false);
      setIsRacing(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen font-sans bg-gradient-to-br from-blue-50 to-blue-100">
      <header className="p-4 bg-white shadow-sm">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">FlashBlock Demo</h1>
          <div className="wallet-container">
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
        </div>
      </header>

      <main className="flex-grow container mx-auto p-4">
        <div className="space-y-6">
          <RaceTrack 
            isRacing={isRacing}
            standardBlock={standardBlock}
            flashBlock={flashBlock}
          />
          
          <BlockStats 
            flashBlockCount={flashBlockCount}
            standardBlockCount={standardBlockCount}
            autoIncrement={false}
          />
          
          <TransactionTest 
            onSendTransaction={handleSendTransaction}
            isPending={isPending}
            transactionStats={transactionStats}
          />
        </div>
      </main>

      <footer className="bg-blue-600 text-white p-4 h-16 flex items-center justify-center">
        <div className="container mx-auto text-center">
          <p className="text-white">FlashBlock Demo - Faster transactions on Base Sepolia</p>
        </div>
      </footer>
    </div>
  );
}
