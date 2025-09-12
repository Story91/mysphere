import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, ExternalLink, Wallet, Shield, Key, AlertCircle } from 'lucide-react';
import { formatEther } from 'viem';
import { useCDPWallet } from '../hooks/useCDPWalletClient';
import { toast } from 'react-hot-toast';

interface CDPWalletManagerProps {
  networkId?: string;
  onWalletCreated?: (address: string, type: 'eoa' | 'smart') => void;
}

export const CDPWalletManager: React.FC<CDPWalletManagerProps> = ({
  networkId,
  onWalletCreated,
}) => {
  const cdpWallet = useCDPWallet({ networkId });
  const [balance, setBalance] = useState<bigint | null>(null);
  const [showCreateOptions, setShowCreateOptions] = useState(false);

  // Copy address to clipboard
  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied to clipboard');
  };

  // Fetch balance
  const fetchBalance = async () => {
    try {
      const bal = await cdpWallet.getBalance();
      setBalance(bal);
    } catch (error) {
      toast.error('Failed to fetch balance');
    }
  };

  // Create EOA wallet
  const handleCreateEOA = async () => {
    try {
      const { address } = await cdpWallet.createEOAWallet();
      toast.success('EOA wallet created successfully');
      onWalletCreated?.(address, 'eoa');
      setShowCreateOptions(false);
      fetchBalance();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create EOA wallet');
    }
  };

  // Create Smart Account
  const handleCreateSmartAccount = async () => {
    try {
      const { address } = await cdpWallet.createSmartAccount(true);
      toast.success('Smart Account created with Spend Permissions support');
      onWalletCreated?.(address, 'smart');
      setShowCreateOptions(false);
      fetchBalance();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create Smart Account');
    }
  };

  // Render wallet info
  const renderWalletInfo = () => {
    if (cdpWallet.smartAccount.isConnected) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-blue-500" />
              <span className="font-semibold">Smart Account</span>
              {cdpWallet.smartAccount.supportsSpendPermissions && (
                <Badge variant="secondary" className="text-xs">
                  Spend Permissions Enabled
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Account Address</p>
                <p className="font-mono text-sm">{cdpWallet.smartAccount.address?.slice(0, 10)}...{cdpWallet.smartAccount.address?.slice(-8)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyAddress(cdpWallet.smartAccount.address!)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            {cdpWallet.smartAccount.ownerAddress && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm text-gray-500">Owner Address</p>
                  <p className="font-mono text-sm">{cdpWallet.smartAccount.ownerAddress.slice(0, 10)}...{cdpWallet.smartAccount.ownerAddress.slice(-8)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyAddress(cdpWallet.smartAccount.ownerAddress!)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (cdpWallet.eoaWallet.isConnected) {
      return (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Key className="h-5 w-5 text-green-500" />
            <span className="font-semibold">EOA Wallet</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Wallet Address</p>
              <p className="font-mono text-sm">{cdpWallet.eoaWallet.address?.slice(0, 10)}...{cdpWallet.eoaWallet.address?.slice(-8)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyAddress(cdpWallet.eoaWallet.address!)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Wallet className="h-5 w-5" />
          <span>CDP Server Wallet</span>
        </CardTitle>
        <CardDescription>
          Create and manage CDP wallets with Spend Permissions support
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error display */}
        {cdpWallet.error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-2 pt-6">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <p className="text-sm text-destructive">{cdpWallet.error}</p>
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {cdpWallet.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {/* Wallet creation options */}
        {!cdpWallet.eoaWallet.isConnected && !cdpWallet.smartAccount.isConnected && !cdpWallet.isLoading && (
          <div className="space-y-4">
            {!showCreateOptions ? (
              <Button
                onClick={() => setShowCreateOptions(true)}
                className="w-full"
                variant="default"
              >
                Create CDP Wallet
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-center space-x-2">
                    <Key className="h-4 w-4 text-green-500" />
                    <h4 className="font-semibold">EOA Wallet</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    Standard wallet controlled by private keys. Good for simple transactions.
                  </p>
                  <Button
                    onClick={handleCreateEOA}
                    variant="outline"
                    className="w-full"
                    disabled={cdpWallet.isLoading}
                  >
                    Create EOA Wallet
                  </Button>
                </div>

                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-blue-500" />
                    <h4 className="font-semibold">Smart Account</h4>
                    <Badge variant="secondary" className="text-xs">Recommended</Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    Advanced account with Spend Permissions, gasless transactions, and batch operations.
                  </p>
                  <Button
                    onClick={handleCreateSmartAccount}
                    variant="default"
                    className="w-full"
                    disabled={cdpWallet.isLoading}
                  >
                    Create Smart Account
                  </Button>
                </div>

                <Button
                  onClick={() => setShowCreateOptions(false)}
                  variant="ghost"
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Connected wallet info */}
        {(cdpWallet.eoaWallet.isConnected || cdpWallet.smartAccount.isConnected) && (
          <>
            {renderWalletInfo()}

            {/* Balance display */}
            {balance !== null && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Balance</p>
                <p className="font-semibold text-lg">{formatEther(balance)} ETH</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex space-x-2">
              <Button
                onClick={fetchBalance}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Refresh Balance
              </Button>
              <Button
                onClick={cdpWallet.disconnect}
                variant="destructive"
                size="sm"
                className="flex-1"
              >
                Disconnect
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
