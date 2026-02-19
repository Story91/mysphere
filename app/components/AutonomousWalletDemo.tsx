// @ts-nocheck
/**
 * Simplified Smart Wallet Demo Component
 * Shows basic wallet functionality with Privy
 */

import { useState } from 'react';
import { useZeroDevSmartWallet } from '../ai-agent/hooks/useZeroDevSmartWallet';

export default function AutonomousWalletDemo() {
  const {
    smartWallet,
    initializeSmartWallet,
    sendTransaction,
    getBalance,
    isLoading,
    error,
    isConnected,
    address
  } = useZeroDevSmartWallet();

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionStatus, setTransactionStatus] = useState('');
  const [balance, setBalance] = useState<string>('0');

  const handleInitialize = async () => {
    try {
      setTransactionStatus('Initializing smart wallet...');
      await initializeSmartWallet();
      setTransactionStatus('Smart wallet initialized! 🎉');
    } catch (error) {
      setTransactionStatus(`Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSendTransaction = async () => {
    if (!recipientAddress || !amount) {
      setTransactionStatus('Please enter recipient address and amount');
      return;
    }

    try {
      setTransactionStatus('Sending transaction...');
      
      // Convert amount to wei (assuming ETH input)
      const amountInWei = BigInt(Math.floor(parseFloat(amount) * 10 ** 18));
      
      const txHash = await sendTransaction(
        recipientAddress,
        amountInWei,
        '0x' // No additional data
      );
      
      setTransactionStatus(`Transaction sent! Hash: ${txHash} 🚀`);
    } catch (error) {
      setTransactionStatus(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleGetBalance = async () => {
    try {
      setTransactionStatus('Getting balance...');
      const balanceWei = await getBalance();
      const balanceEth = Number(balanceWei) / 10 ** 18;
      setBalance(balanceEth.toFixed(6));
      setTransactionStatus(`Balance: ${balanceEth.toFixed(6)} ETH 💰`);
    } catch (error) {
      setTransactionStatus(`Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Container with Scroll */}
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header - Fixed */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 text-center">
            <h1 className="text-3xl font-bold mb-2">
              🚀 Smart Wallet Demo
            </h1>
            <p className="text-blue-100">
              Basic wallet functionality with Privy integration
            </p>
          </div>

          {/* Scrollable Content */}
          <div className="max-h-[70vh] overflow-y-auto p-6">
            {/* Status Panel */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">📊 Wallet Status</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg border">
                  <div className="text-sm text-gray-500">Connection Status</div>
                  <div className={`text-lg font-semibold ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                    {isConnected ? '✅ Connected' : '❌ Disconnected'}
                  </div>
                </div>
                
                <div className="bg-white p-4 rounded-lg border">
                  <div className="text-sm text-gray-500">Wallet Address</div>
                  <div className="text-lg font-mono text-gray-800 break-all">
                    {address || 'Not initialized'}
                  </div>
                </div>
                
                <div className="bg-white p-4 rounded-lg border">
                  <div className="text-sm text-gray-500">Balance</div>
                  <div className="text-lg font-semibold text-gray-800">
                    {balance} ETH
                  </div>
                </div>
                
                <div className="bg-white p-4 rounded-lg border">
                  <div className="text-sm text-gray-500">Loading State</div>
                  <div className={`text-lg font-semibold ${isLoading ? 'text-yellow-600' : 'text-green-600'}`}>
                    {isLoading ? '⏳ Loading...' : '✅ Ready'}
                  </div>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="text-red-800">
                  <strong>Error:</strong> {error}
                </div>
              </div>
            )}

            {/* Transaction Status */}
            {transactionStatus && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="text-blue-800">
                  <strong>Status:</strong> {transactionStatus}
                </div>
              </div>
            )}

            {/* Control Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Initialize Smart Wallet */}
              <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-semibold mb-4">🔧 Initialize Wallet</h3>
                <p className="text-gray-600 mb-4">
                  Create a new smart wallet using your Privy embedded wallet
                </p>
                <button
                  onClick={handleInitialize}
                  disabled={isLoading || isConnected}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  {isLoading ? 'Initializing...' : isConnected ? 'Already Connected' : 'Initialize Wallet'}
                </button>
              </div>

              {/* Get Balance */}
              <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-semibold mb-4">💰 Check Balance</h3>
                <p className="text-gray-600 mb-4">
                  Get the current balance of your wallet
                </p>
                <button
                  onClick={handleGetBalance}
                  disabled={!isConnected || isLoading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Get Balance
                </button>
              </div>
            </div>

            {/* Send Transaction */}
            <div className="bg-white rounded-lg border p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">📤 Send Transaction</h3>
              <p className="text-gray-600 mb-4">
                Send ETH from your wallet (standard gas fees apply)
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount (ETH)
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.01"
                    step="0.001"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <button
                onClick={handleSendTransaction}
                disabled={!isConnected || isLoading || !recipientAddress || !amount}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                🚀 Send Transaction
              </button>
            </div>

            {/* Features Info */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">✨ Wallet Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl mb-2">🔐</div>
                  <div className="font-semibold">Self-Custodial</div>
                  <div className="text-sm text-gray-600">Full control over your funds</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-2">⚡</div>
                  <div className="font-semibold">Fast Transactions</div>
                  <div className="text-sm text-gray-600">Quick and reliable</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-2">🔄</div>
                  <div className="font-semibold">Easy Integration</div>
                  <div className="text-sm text-gray-600">Works with Privy</div>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4 text-yellow-800">📖 How to Use</h3>
              <ol className="text-sm text-yellow-700 space-y-2">
                <li>1. <strong>Login with Privy</strong> - Use email or social login</li>
                <li>2. <strong>Initialize Wallet</strong> - Click the blue button above</li>
                <li>3. <strong>Check Balance</strong> - See your current ETH balance</li>
                <li>4. <strong>Send Transactions</strong> - Transfer ETH to other addresses</li>
              </ol>
            </div>
          </div>

          {/* Footer - Fixed */}
          <div className="bg-gray-100 p-4 text-center text-gray-600">
            <p>Smart Wallet Demo - Built with Privy & Viem</p>
          </div>
        </div>
      </div>
    </div>
  );
}
