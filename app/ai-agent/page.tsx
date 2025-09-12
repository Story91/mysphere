"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAgent } from "./hooks/useAgent";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import StarBorder from "./reacts/StarBorder";
import ModelViewer from "./reacts/ModelViewer";
import { Separator } from "./reacts/Separator";
import { DataTable } from "./reacts/DataTable";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FlowingMenu } from "./reacts/Menu";
import Stepper, { Step } from "./reacts/Stepper";
import ImageUploader from "./components/ImageUploader";
import { tokenBalanceFetcher, TokenBalance, TokenBalanceFetcher, ExtendedTokenInfo } from "@/app/utils/tokenBalanceUtils";
import { useAccount, useWalletClient } from "wagmi";
import { usePrivyEmbedded } from './hooks/usePrivyEmbeddedHook';
import { useAutonomousAgent } from './hooks/useAutonomousAgent';
import { useZeroDevSmartWallet } from './hooks/useZeroDevSmartWallet';
// Removed old CDP server wallet imports - now using Privy embedded wallets
import { formatEther, parseEther } from "viem";
import { Copy, ExternalLink, RefreshCw, Bot, Wallet, Zap } from "lucide-react";
import AutonomousWalletDemo from "../components/AutonomousWalletDemo";

type ActivePanel = 'profile' | 'spherian' | 'portfolio';

type MenuKey = 'agent' | 'wallet' | 'network' | null;

// Panel components moved outside to prevent re-creation on each render
const ProfilePanel = ({ 
  isAutonomousMode, 
  setIsAutonomousMode,
  smartWalletHook,
  isSmartWalletLoading,
  smartWalletError,
  isSmartWalletConnected,
  initializeSmartWallet,
  getBalance,
  sendTransaction
}: { 
  isAutonomousMode: boolean; 
  setIsAutonomousMode: (value: boolean) => void;
  smartWalletHook: any;
  isSmartWalletLoading: boolean;
  smartWalletError: string | null;
  isSmartWalletConnected: boolean;
  initializeSmartWallet: () => Promise<any>;
  getBalance: () => Promise<bigint>;
  sendTransaction: (to: string, value: bigint | string | number, data?: string) => Promise<string>;
}) => (
    <ProfilePanelInner 
      isAutonomousMode={isAutonomousMode} 
      setIsAutonomousMode={setIsAutonomousMode}
      smartWallet={smartWalletHook}
      isSmartWalletLoading={isSmartWalletLoading}
      smartWalletError={smartWalletError}
      isSmartWalletConnected={isSmartWalletConnected}
      initializeSmartWallet={initializeSmartWallet}
      getBalance={getBalance}
      sendTransaction={sendTransaction}
    />
);

const ProfilePanelInner = ({ 
  isAutonomousMode, 
  setIsAutonomousMode,
  smartWallet,
  isSmartWalletLoading,
  smartWalletError,
  isSmartWalletConnected,
  initializeSmartWallet,
  getBalance,
  sendTransaction
}: { 
  isAutonomousMode: boolean; 
  setIsAutonomousMode: (value: boolean) => void;
  smartWallet: any;
  isSmartWalletLoading: boolean;
  smartWalletError: string | null;
  isSmartWalletConnected: boolean;
  initializeSmartWallet: () => Promise<any>;
  getBalance: () => Promise<bigint>;
  sendTransaction: (to: string, value: bigint | string | number, data?: string) => Promise<string>;
}) => {
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [activeSection, setActiveSection] = useState<MenuKey>(null);

  // Privy Embedded Wallet
  const {
    embeddedWallet,
    isLoading: isPrivyLoading,
    isAuthenticated: isPrivyAuthenticated,
    login: privyLogin,
    logout: privyLogout
  } = usePrivyEmbedded();

  // Smart Wallet Integration - REMOVED DUPLICATE
  // const {
  //   smartWallet,
  //   isLoading: isSmartWalletLoading,
  //   error: smartWalletError,
  //   isConnected: isSmartWalletConnected,
  //   getBalance
  // } = useZeroDevSmartWallet();

  const handleMenuClick = (key: MenuKey) => {
    setActiveSection(key);
  };

  // No need for manual wallet creation - Privy handles it automatically

  // No need to initialize anything - Privy handles it automatically

  return (
    <div className="h-[calc(95dvh-96px)] lg:h-full flex flex-col space-y-4">
      {/* Header Card with Gradient */}
      <StarBorder
        as="div"
        color="magenta"
        speed="6s"
        thickness={1}
        className="w-full"
      >
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Avatar className="h-12 w-12 border-2 border-white/20 shadow-lg">
              <AvatarFallback className="bg-white/10 text-white text-lg font-bold backdrop-blur-sm">
                U
              </AvatarFallback>
            </Avatar>
            <div className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white shadow-sm ${userAddress ? 'bg-green-400' : 'bg-gray-400'}`}></div>
          </div>
          <div>
            <h3 className="text-white text-lg font-semibold">
              {userAddress ? 'Connected User' : 'Not Connected'}
            </h3>
            <p className="text-white/80 font-mono text-sm">
              {userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : 'Connect your wallet'}
            </p>
          </div>
        </div>
      </StarBorder>

      {/* Menu Section - Top 1/3 */}
      <div className="h-1/3 bg-white border border-gray-200 rounded-lg overflow-hidden">
        <FlowingMenu 
          items={[
            { link: '#', text: 'Agent Settings', image: '/frame-v2.png' },
            { link: '#', text: 'Wallet Management', image: '/frame-v2.png' },
            { link: '#', text: 'Network Config', image: '/frame-v2.png' }
          ]}
          onItemClick={(item) => {
            const keyMap: Record<string, MenuKey> = {
              'Agent Settings': 'agent',
              'Wallet Management': 'wallet',
              'Network Config': 'network',
            };
            handleMenuClick(keyMap[item.text] || 'agent');
          }}
        />
      </div>

      {/* Content Section - Bottom 2/3 */}
      <div className="flex-1 bg-white border border-gray-200 rounded-lg p-4 relative">
        {activeSection && (
          <Button onClick={() => setActiveSection(null)} size="sm" className="absolute top-3 right-3 h-7 px-2 text-xs bg-gray-900 text-white hover:bg-gray-800">
            ← Back
          </Button>
        )}

        {activeSection === null && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">Wallet Activity</h4>
            
            {!userAddress ? (
              /* No wallet connected */
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <div className="text-3xl opacity-50">📊</div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-700">No Activity Yet</p>
                  <p className="text-xs text-gray-500">Connect your wallet to see transaction history</p>
                </div>
              </div>
            ) : !isPrivyAuthenticated ? (
              /* Wallet connected but not Privy authenticated */
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <div className="text-3xl opacity-50">🔐</div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-700">Authenticate with Privy</p>
                  <p className="text-xs text-gray-500">Create your embedded wallet to use the AI agent</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={privyLogin}
                  disabled={isPrivyLoading}
                  className="text-xs"
                >
                  {isPrivyLoading ? '⏳ Loading...' : '🔐 Login with Privy'}
                </Button>
              </div>
            ) : (
              /* Privy authenticated and embedded wallet ready */
              <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="flex items-center space-x-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>

            <Separator className="bg-gray-200" />

                <div className="text-center py-4">
                  <p className="text-xs text-gray-500">Transaction history will appear here</p>
                  <p className="text-xs text-gray-400 mt-1">Embedded Wallet: {embeddedWallet?.address.slice(0, 8)}...{embeddedWallet?.address.slice(-6)}</p>
              </div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'agent' && (
          <div className="space-y-4 text-gray-900">
            <h4 className="text-sm font-semibold text-gray-900">Agent Settings</h4>
            <Stepper initialStep={1} nextButtonText="Next" backButtonText="Previous">
              <Step>
                <div className="space-y-2">
                  <h2 className="text-base font-semibold text-gray-900">Welcome</h2>
                  <p className="text-sm text-gray-800">Quick configuration for your agent.</p>
                </div>
              </Step>
              <Step>
                <div className="space-y-2">
                  <h2 className="text-base font-semibold text-gray-900">Enable TEE</h2>
                  <Button size="sm" variant="outline" className="text-gray-900 border-gray-300">Toggle</Button>
                </div>
              </Step>
              <Step>
                <div className="space-y-2">
                  <h2 className="text-base font-semibold text-gray-900">Language</h2>
                  <Button size="sm" variant="outline" className="text-gray-900 border-gray-300">Polish</Button>
                </div>
              </Step>
              <Step>
                <div className="space-y-2">
                  <h2 className="text-base font-semibold text-gray-900">Done</h2>
                  <p className="text-sm text-gray-800">All set!</p>
                </div>
              </Step>
            </Stepper>
          </div>
        )}

        {activeSection === 'wallet' && (
          <div className="space-y-4 text-gray-900">
            <h4 className="text-sm font-semibold text-gray-900">Wallet Management</h4>

            {/* Autonomous Wallet Demo */}
            {isAutonomousMode && (
              <div className="mt-4">
                <AutonomousWalletDemo />
              </div>
            )}
            
            {/* AI Agent Wallet Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">AI Agent Wallet</span>
              </div>
              
              {!embeddedWallet ? (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-gray-600 mb-2">Login with Privy to create your embedded wallet</p>
                  <Button 
                    onClick={privyLogin}
                    disabled={isPrivyLoading}
                    size="sm"
                    className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isPrivyLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                        Loading...
                      </>
                    ) : (
                      <>
                        🔐 Login with Privy
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-2 bg-green-50 rounded border border-green-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">Embedded Wallet Address</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(embeddedWallet.address);
                        }}
                        className="h-5 w-5 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-900">
                      {embeddedWallet.address.slice(0, 8)}...{embeddedWallet.address.slice(-6)}
                    </p>
                  </div>
                  
                  <div className="p-2 bg-blue-50 rounded border border-blue-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">Status</span>
                    </div>
                    <p className="text-xs text-gray-900">✅ Active</p>
                  </div>
                  
                  <div className="text-center p-2 bg-gray-50 rounded border border-gray-200">
                    <p className="text-xs text-gray-600">
                      {isAutonomousMode
                        ? "🤖 Autonomiczny: Agent działa bez Twojej interakcji"
                        : "🔐 Privy: Wymaga potwierdzenia każdej transakcji"
                      }
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {isAutonomousMode
                        ? "Agent może wykonywać transakcje automatycznie w limitach"
                        : "Transakcje wymagają Twojego zatwierdzenia w popup"
                      }
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator className="bg-gray-200" />

            {/* Smart Wallet Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-gray-900">Smart Wallet (ZeroDev)</span>
              </div>
              
              {!smartWallet ? (
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs text-gray-600 mb-2">
                    {isSmartWalletLoading 
                      ? "Initializing smart wallet..." 
                      : "Smart wallet not initialized"
                    }
                  </p>
                  {smartWalletError && (
                    <p className="text-xs text-red-600 mb-2">Error: {smartWalletError}</p>
                  )}
                  {isSmartWalletLoading && (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-600"></div>
                    </div>
                  )}
                  <Button
                    onClick={initializeSmartWallet}
                    disabled={isSmartWalletLoading}
                    size="sm"
                    className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white mt-2"
                  >
                    {isSmartWalletLoading ? 'Initializing...' : 'Initialize Smart Wallet'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-2 bg-purple-50 rounded border border-purple-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">Smart Wallet Address</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(smartWallet.address);
                        }}
                        className="h-5 w-5 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-900">
                      {smartWallet.address.slice(0, 8)}...{smartWallet.address.slice(-6)}
                    </p>
                  </div>
                  
                  <div className="p-2 bg-green-50 rounded border border-green-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">Status</span>
                    </div>
                    <p className="text-xs text-green-700">✅ Connected</p>
                  </div>
                  
                  <div className="text-center p-2 bg-gray-50 rounded border border-gray-200">
                    <p className="text-xs text-gray-600">
                      🤖 **Autonomiczny Agent Ready!**
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Agent może teraz wykonywać transakcje automatycznie
                    </p>
                  </div>
                  
                  {/* Test Buttons */}
                  <div className="space-y-2">
                    <Button
                      onClick={async () => {
                        try {
                          const balance = await getBalance();
                          const balanceEth = Number(balance) / 10 ** 18;
                          alert(`💰 Saldo: ${balanceEth.toFixed(6)} ETH`);
                        } catch (error) {
                          alert(`❌ Błąd: ${error instanceof Error ? error.message : 'Nieznany błąd'}`);
                        }
                      }}
                      size="sm"
                      className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      🧪 Test getBalance()
                    </Button>
                    
                    <Button
                      onClick={async () => {
                        try {
                          const txHash = await sendTransaction(
                            '0xeF692a11A123295CF1F9789eee87Ff70eB04e364',
                            1000000000000000n, // 0.001 ETH
                            '0x'
                          );
                          alert(`✅ Transakcja: ${txHash}`);
                        } catch (error) {
                          alert(`❌ Błąd: ${error instanceof Error ? error.message : 'Nieznany błąd'}`);
                        }
                      }}
                      size="sm"
                      className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                    >
                      🧪 Test sendTransaction()
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            <Separator className="bg-gray-200" />
            
            {/* Wallet Mode Toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-900">Wallet Mode</span>
                <div className="flex items-center space-x-2">
                  <Badge
                    variant="outline"
                    className={`h-7 px-3 ${isAutonomousMode ? 'text-blue-700 border-blue-300 bg-blue-50' : 'text-green-700 border-green-300 bg-green-50'}`}
                  >
                    {isAutonomousMode ? '🤖 Autonomiczny' : '🔐 Privy'}
                  </Badge>
                  <Button
                    onClick={() => setIsAutonomousMode(!isAutonomousMode)}
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    Przełącz
                  </Button>
                </div>
              </div>
            </div>

            <Separator className="bg-gray-200" />

            {/* Default Settings */}
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-900">Default Wallet</span>
                <Badge variant="outline" className="h-7 px-3 text-gray-900 border-gray-300">CDP</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-900">Auto Gas</span>
                <Badge variant="outline" className="h-7 px-3 text-gray-900 border-gray-300">On</Badge>
              </div>
              {embeddedWallet && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-900">Agent Status</span>
                  <Badge variant="outline" className="h-7 px-3 text-green-700 border-green-300 bg-green-50">Active</Badge>
                </div>
              )}
              {smartWallet && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-900">Smart Wallet</span>
                  <Badge variant="outline" className="h-7 px-3 text-purple-700 border-purple-300 bg-purple-50">ZeroDev Ready</Badge>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'network' && (
          <div className="space-y-4 text-gray-900">
            <h4 className="text-sm font-semibold text-gray-900">Network Config</h4>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-900">Network</span>
                <Badge variant="outline" className="h-7 px-3 text-gray-900 border-gray-300">Base</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-900">RPC</span>
                <Badge variant="outline" className="h-7 px-3 text-gray-900 border-gray-300">Default</Badge>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Target wallet address
const TARGET_WALLET = "0xfF3183b774bc99b730CA6216E08370cB156c3C26";

  const tokenColumns = [
    {
      accessorKey: "network",
      header: "Network",
      cell: ({ row }: any) => {
        const value = row.getValue("network");
        if (typeof value === 'string') {
          return (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-blue-500"></div>
              <span className="font-medium text-gray-900">{value}</span>
            </div>
          );
        }
        return value; // Return skeleton directly
      },
    },
    {
      accessorKey: "symbol", 
      header: "Asset",
      cell: ({ row }: any) => {
        const value = row.getValue("symbol");
        if (typeof value === 'string') {
          return <span className="font-medium text-gray-700">{value}</span>;
        }
        return value;
      },
    },
    {
      accessorKey: "balance",
      header: "Balance", 
      cell: ({ row }: any) => {
        const value = row.getValue("balance");
        if (typeof value === 'string') {
          return <span className="text-gray-900 font-mono">{value}</span>;
        }
        return value;
      },
    },
    {
      accessorKey: "value",
      header: "Value",
      cell: ({ row }: any) => {
        const value = row.getValue("value");
        if (typeof value === 'string') {
          return <span className="text-gray-900 font-medium">{value}</span>;
        }
        return value;
      },
    },
  ];

  const deploymentColumns = [
    {
      accessorKey: "name",
      header: "Token",
      cell: ({ row }: any) => {
        const name = row.getValue("name");
        const logo = row.original.logo;
        const supply = row.original.supply;
        const value = row.original.value;
        
        if (typeof name === 'string') {
          return (
            <div className="flex items-center space-x-3">
              <div className="text-base">{logo}</div>
              <div className="flex flex-col">
              <span className="font-medium text-gray-900 text-sm">{name}</span>
                <Badge variant="outline" className="text-xs px-2 py-0 h-4 w-fit">
                  {supply}
              </Badge>
              </div>
            </div>
          );
        }
        return (
          <div className="flex items-center space-x-3">
            {logo}
            {name}
            {supply}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Balance & Actions", 
      cell: ({ row }: any) => {
        const status = row.getValue("status");
        const value = row.original.value;
        const dexScreener = row.original.dexScreener;
        const basscan = row.original.basscan;
        
        if (typeof status === 'string') {
          return (
            <div className="flex items-center space-x-2">
              <div className="flex flex-col">
                <span className="text-xs font-mono text-gray-900">{status}</span>
                <span className="text-xs text-gray-600">{value}</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 px-1 text-xs text-blue-600 hover:text-blue-700"
                onClick={() => window.open(dexScreener, '_blank')}
                title="View on DexScreener"
              >
                📊
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 px-1 text-xs text-green-600 hover:text-green-700"
                onClick={() => window.open(basscan, '_blank')}
                title="View on BaseScan"
              >
                🔍
              </Button>
            </div>
          );
        }
        return status;
      },
    },
  ];

  const PortfolioPanel = () => {
    const { address: userAddress } = useAccount();
    const { data: walletClient } = useWalletClient();
    const { embeddedWallet, isLoading: isPrivyLoading, isAuthenticated: isPrivyAuthenticated, login: privyLogin } = usePrivyEmbedded();
    const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
    const [walletTokens, setWalletTokens] = useState<ExtendedTokenInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingTokens, setIsLoadingTokens] = useState(true);
    const [totalValue, setTotalValue] = useState("$0.00");
    const [dataFetched, setDataFetched] = useState(false);
    
    // Use embedded wallet address for portfolio data
    const portfolioWallet = embeddedWallet?.address;
    const displayWallet = embeddedWallet?.address;

    // No need for manual wallet creation - Privy handles it automatically

    const fetchTokenBalances = useCallback(async (walletAddress: string, fromCache = true) => {
      const cacheKey = `tokenBalances_${walletAddress}`;
      
      // Check localStorage cache first
      if (fromCache) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const isExpired = Date.now() - timestamp > 5 * 60 * 1000; // 5 minutes cache
            
            if (!isExpired) {
              console.log('📦 Using cached token balances for:', walletAddress);
              setTokenBalances(data.balances);
              setTotalValue(data.totalValue);
              setIsLoading(false);
              return;
            }
          }
        } catch (error) {
          console.log('Cache read error:', error);
        }
      }
      
      try {
        setIsLoading(true);
        console.log('🔄 Fetching fresh token balances for:', walletAddress);
        const balances = await tokenBalanceFetcher.getAllTokenBalances(walletAddress);
        
        // Calculate total value
        let total = 0;
        for (const balance of balances) {
          const usdValue = await TokenBalanceFetcher.getEstimatedUSDValue(balance.balance, balance.symbol);
          balance.valueUSD = usdValue;
          
          // Extract numeric value for total calculation
          const numericValue = parseFloat(usdValue.replace(/[$,]/g, ''));
          if (!isNaN(numericValue)) {
            total += numericValue;
          }
        }
        
        const totalValueFormatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(total);
        
        setTokenBalances(balances);
        setTotalValue(totalValueFormatted);
        
        // Cache the results
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            data: { balances, totalValue: totalValueFormatted },
            timestamp: Date.now()
          }));
        } catch (error) {
          console.log('Cache write error:', error);
        }
        
      } catch (error) {
        console.error('Error fetching token balances:', error);
        // Set fallback data
        setTokenBalances([
          { symbol: 'ETH', balance: '0', decimals: 18, valueUSD: '$0.00' },
          { symbol: 'WETH', balance: '0', decimals: 18, valueUSD: '$0.00' },
          { symbol: 'USDC', balance: '0', decimals: 6, valueUSD: '$0.00' },
        ]);
        setTotalValue("$0.00");
      } finally {
        setIsLoading(false);
      }
    }, []);

    const fetchWalletTokens = useCallback(async (walletAddress: string, fromCache = true) => {
      const cacheKey = `walletTokens_${walletAddress}`;
      
      // Check localStorage cache first
      if (fromCache) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const isExpired = Date.now() - timestamp > 5 * 60 * 1000; // 5 minutes cache
            
            if (!isExpired) {
              console.log('📦 Using cached wallet tokens for:', walletAddress);
              setWalletTokens(data);
              setIsLoadingTokens(false);
              return;
            }
          }
        } catch (error) {
          console.log('Cache read error:', error);
        }
      }
      
      try {
        setIsLoadingTokens(true);
        console.log('🔄 Fetching fresh wallet tokens for:', walletAddress);
        const tokens = await tokenBalanceFetcher.getAllWalletTokens(walletAddress);
        console.log('Found tokens:', tokens.length, 'tokens');
        setWalletTokens(tokens);
        
        // Cache the results
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            data: tokens,
            timestamp: Date.now()
          }));
        } catch (error) {
          console.log('Cache write error:', error);
        }
        
      } catch (error) {
        console.error('Error fetching wallet tokens:', error);
        setWalletTokens([]);
      } finally {
        setIsLoadingTokens(false);
      }
    }, []);



    // No need for balance refresh or funding - Privy handles it

    useEffect(() => {
      // Reset data when no wallet connected
      if (!userAddress) {
        setTokenBalances([]);
        setWalletTokens([]);
        setTotalValue("$0.00");
        setDataFetched(false);
        setIsLoading(false);
        setIsLoadingTokens(false);
        return;
      }
      
      // Only fetch data when we have embedded wallet
      if (embeddedWallet && (!dataFetched || portfolioWallet)) {
        fetchTokenBalances(embeddedWallet.address);
        fetchWalletTokens(embeddedWallet.address);
        setDataFetched(true);
      }
    }, [userAddress, embeddedWallet, portfolioWallet, dataFetched, fetchTokenBalances, fetchWalletTokens]);

    // Transform token data for the DataTable
    const tokenData = isLoading 
      ? [
          {
            network: <Skeleton className="h-4 w-16" /> as any,
            symbol: <Skeleton className="h-4 w-12" /> as any,
            balance: <Skeleton className="h-4 w-20" /> as any,
            value: <Skeleton className="h-4 w-16" /> as any,
          },
          {
            network: <Skeleton className="h-4 w-16" /> as any,
            symbol: <Skeleton className="h-4 w-12" /> as any,
            balance: <Skeleton className="h-4 w-20" /> as any,
            value: <Skeleton className="h-4 w-16" /> as any,
          },
          {
            network: <Skeleton className="h-4 w-16" /> as any,
            symbol: <Skeleton className="h-4 w-12" /> as any,
            balance: <Skeleton className="h-4 w-20" /> as any,
            value: <Skeleton className="h-4 w-16" /> as any,
          },
        ]
      : tokenBalances.map(token => ({
          network: "Base" as any,
          symbol: token.symbol as any,
          balance: TokenBalanceFetcher.formatBalance(token.balance) as any,
          value: token.valueUSD || '$0.00' as any,
        }));

    // Transform wallet tokens for deployment section
    const deploymentData = isLoadingTokens
      ? [
          {
            name: <Skeleton className="h-4 w-16" /> as any,
            logo: <Skeleton className="h-4 w-4" /> as any,
            status: <Skeleton className="h-6 w-16" /> as any,
            network: "Base" as any,
            supply: <Skeleton className="h-4 w-20" /> as any,
            value: <Skeleton className="h-4 w-16" /> as any,
            dexScreener: "#",
            basscan: "#"
          },
          {
            name: <Skeleton className="h-4 w-20" /> as any,
            logo: <Skeleton className="h-4 w-4" /> as any,
            status: <Skeleton className="h-6 w-16" /> as any,
            network: "Base" as any,
            supply: <Skeleton className="h-4 w-18" /> as any,
            value: <Skeleton className="h-4 w-14" /> as any,
            dexScreener: "#",
            basscan: "#"
          },
        ]
      : walletTokens.slice(0, 20).map(token => ({
          name: token.name as any,
          logo: token.imageUrl ? `🖼️` : (token.symbol === 'MCT' ? `🪙` : `🔗`) as any,
          status: TokenBalanceFetcher.formatBalance(token.balance) as any,
          network: "Base" as any,
          supply: token.symbol as any,
          value: token.priceUSD ? `$${parseFloat(token.priceUSD).toFixed(4)}` : '$0.00' as any,
          dexScreener: `https://dexscreener.com/base/${token.address}`,
          basscan: `https://basescan.org/token/${token.address}`,
          source: token.priceUSD ? 'Zora' : 'Basescan' // Add source info
        }));

    return (
    <div className="h-[calc(95dvh-96px)] lg:h-full flex flex-col space-y-4">
      {/* Header Card with Gradient */}
      <StarBorder
        as="div"
        color="white"
        speed="6s"
        thickness={1}
        className="w-full"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="text-2xl">📊</div>
            <div>
              <h3 className="text-white text-lg font-semibold">Portfolio</h3>
              <p className="text-white/80 text-sm">Your onchain activity & stats</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{totalValue}</div>
            <div className="text-sm text-white/70">Total Value</div>
          </div>
        </div>
      </StarBorder>

      {/* Portfolio Dashboard */}
      <Card className="flex-1 overflow-hidden bg-white border-gray-200">
        <CardContent className="p-4 h-full flex flex-col space-y-4">
          {!userAddress ? (
            /* Empty State - No Wallet Connected */
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="text-6xl opacity-50">👛</div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-700">Connect Your Wallet</h3>
                <p className="text-sm text-gray-500 max-w-md">
                  Connect your wallet to view your portfolio, create an AI agent, and manage your onchain assets.
                </p>
              </div>
              <Button variant="outline" className="text-sm" disabled>
                Connect Wallet First
              </Button>
            </div>
          ) : (
            /* Wallet Connected - Show Portfolio */
            <>
              {/* Embedded Wallet Address */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-900">
                  {embeddedWallet ? 'Embedded Wallet Address' : 'Wallet Address'}
                </h4>
                {displayWallet ? (
                  <div className="flex items-center space-x-2">
                    <Badge 
                      variant="outline" 
                      className={`font-mono text-xs ${embeddedWallet ? 'bg-green-50 border-green-300 text-green-700' : ''}`}
                    >
                      {displayWallet.slice(0, 6)}...{displayWallet.slice(-4)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => navigator.clipboard.writeText(displayWallet)}
                    >
                      📋
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => window.open(`https://basescan.org/address/${displayWallet}`, '_blank')}
                    >
                      🔍
                    </Button>
                    {embeddedWallet && (
                      <Badge variant="outline" className="text-xs bg-blue-50 border-blue-300 text-blue-700">
                        🔐 Privy
                      </Badge>
                    )}
                  </div>
                ) : (
                  /* No Embedded Wallet Yet */
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="font-mono text-xs bg-yellow-50 border-yellow-300 text-yellow-700">
                      No Embedded Wallet
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={privyLogin}
                      disabled={isPrivyLoading}
                      className="h-6 px-2 text-xs"
                    >
                      {isPrivyLoading ? '⏳ Loading...' : '🔐 Login with Privy'}
                    </Button>
                  </div>
                )}
              </div>

          <Separator className="bg-gray-200" />

          {/* Token Holdings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">Token Holdings</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  // Force refresh by skipping cache (only if portfolio wallet exists)
                  if (portfolioWallet) {
                    fetchTokenBalances(portfolioWallet, false);
                    fetchWalletTokens(portfolioWallet, false);
                  }
                }}
                disabled={isLoading || isLoadingTokens}
              >
                🔄 {(isLoading || isLoadingTokens) ? 'Loading...' : 'Refresh'}
              </Button>
            </div>
            <DataTable columns={tokenColumns} data={tokenData} />
          </div>

          <Separator className="bg-gray-200" />

          {/* Portfolio Tokens */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Portfolio Tokens</h4>
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="text-xs">
                  {walletTokens.length} tokens
                </Badge>
              </div>
            </div>
            <div className={`${deploymentData.length > 3 ? 'max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100' : ''} border rounded-lg relative`}>
            <DataTable columns={deploymentColumns} data={deploymentData} />
              {deploymentData.length > 3 && (
                <div className="absolute bottom-2 right-2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-75">
                  Scroll for more
                </div>
              )}
            </div>
          </div>

          <Separator className="bg-gray-200" />

          {/* Quick Actions */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-900">Quick Actions</h4>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" size="sm" className="justify-start h-8 text-xs border-gray-300 text-gray-700">
                <span className="mr-2">🚀</span>
                Deploy Token
              </Button>
              <Button variant="outline" size="sm" className="justify-start h-8 text-xs border-gray-300 text-gray-700">
                <span className="mr-2">💰</span>
                Check Balance
              </Button>
              <Button variant="outline" size="sm" className="justify-start h-8 text-xs border-gray-300 text-gray-700">
                <span className="mr-2">🔄</span>
                Swap Tokens
              </Button>
            </div>
          </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
  };

const SpherianPanel = ({ messages, isThinking, input, setInput, onSendMessage, messagesEndRef, scrollToBottom, inputRef }: {
  messages: any[];
  isThinking: boolean;
  input: string;
  setInput: (value: string) => void;
  onSendMessage: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  scrollToBottom: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) => (
    <div className="h-[calc(95dvh-96px)] lg:h-full flex flex-col overflow-hidden">
      {/* Header Card */}
      <StarBorder
        as="div"
        color="cyan"
        speed="6s"
        thickness={1}
        className="w-full mb-4"
      >
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Avatar className="h-12 w-12 border-2 border-white/20 shadow-lg">
              <AvatarFallback className="bg-white/10 text-white text-lg font-bold backdrop-blur-sm">
                🤖
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-400 rounded-full border-2 border-white shadow-sm animate-pulse"></div>
          </div>
          <div>
            <h3 className="text-white text-lg font-semibold">Spherian Agent</h3>
            <p className="text-white/80 text-sm">Your personal AI assistant powered by AgentKit</p>
          </div>
        </div>
      </StarBorder>

      {/* Messages Card */}
      <Card className="flex-1 min-h-0 overflow-hidden bg-gradient-to-br from-gray-50 to-slate-100/50 backdrop-blur-sm border-gray-200/50">
        <CardContent className="p-0 h-full min-h-0 flex flex-col overflow-hidden">
          <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
            {/* Model Viewer - zawsze widoczny w tle */}
            <div className="absolute inset-0 pointer-events-none">
              <ModelViewer
                url="/Futuristic_Robot_Assi_0318030719_texture.glb"
                width="100%"
                height="100%"
                modelXOffset={0}
                modelYOffset={0}
                defaultRotationX={0}
                defaultRotationY={0}
                enableMouseParallax={true}
                enableHoverRotation={true}
                enableManualRotation={true}
                showScreenshotButton={false}
                fadeIn={false}
                autoRotate={false}
                environmentPreset="studio"
                autoFrame={true}
                defaultZoom={1.5}
              />
            </div>
            
            {/* Messages overlay */}
            <div className="relative z-10 flex-1 overflow-y-auto space-y-4 p-4 sm:p-6 min-h-0">
              {/* Scroll to bottom button - only show when not at bottom */}
              <div className="absolute top-4 right-4 z-20">
                <Button
                  onClick={scrollToBottom}
                  size="sm"
                  variant="outline"
                  className="bg-white/80 backdrop-blur-sm border-gray-300 hover:bg-white text-gray-700 shadow-lg"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  Bottom
                </Button>
              </div>
              {messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                  <div
                    className={`inline-block p-3 sm:p-4 rounded-2xl shadow-lg max-w-[75%] md:max-w-[65%] break-words whitespace-pre-wrap transition-all hover:shadow-xl backdrop-blur-sm border ${
                      msg.sender === "user"
                        ? "bg-gradient-to-br from-[#0052FF]/80 to-blue-600/80 text-white shadow-blue-500/25 border-blue-400/30"
                        : "bg-white/60 text-gray-900 border-white/40 shadow-gray-500/20"
                    }`}
                  >
                    <ReactMarkdown
                      components={{
                        a: props => (
                          <a
                            {...props}
                            className={msg.sender === "user" ? "text-blue-200 underline hover:text-white" : "text-blue-600 underline hover:text-blue-800"}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        ),
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>


          </div>

          {/* Input Section */}
          <div className="border-t border-white/20 p-4 bg-white/30 backdrop-blur-sm">
            <div className="flex items-center space-x-3 w-full">
              <ImageUploader onImageUrlGenerated={(url) => {
                // Auto-paste the URL into the input when generated
                setInput(input + (input ? ' ' : '') + `Image URL: ${url}`);
              }} />
              <div className="flex-1 relative">
                {isThinking ? (
                  <div className="w-full px-4 py-3 rounded-2xl border border-gray-300 bg-white text-gray-900 backdrop-blur-sm flex items-center space-x-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                    <span className="text-sm font-medium text-gray-600">Spherian is thinking...</span>
                  </div>
                ) : (
                  <input
                    ref={inputRef}
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/50 focus:border-[#0052FF] bg-white text-gray-900 placeholder-gray-700 backdrop-blur-sm transition-all"
                    placeholder="Message Spherian Agent..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && onSendMessage()}
                    disabled={isThinking}
                  />
                )}
              </div>
              <Button
                onClick={onSendMessage}
                className={`px-6 py-3 rounded-2xl font-semibold transition-all shadow-lg ${
                  isThinking
                    ? "bg-gray-300 cursor-not-allowed text-gray-500 shadow-none"
                    : "bg-gradient-to-r from-[#0052FF] to-blue-600 hover:from-[#003ECF] hover:to-blue-700 text-white shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
                }`}
                disabled={isThinking}
              >
                Send
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

/**
 * Home page for the AgentKit Quickstart
 *
 * @returns {React.ReactNode} The home page
 */
export default function Home() {
  const [input, setInput] = useState("");
  const { address: userAddress } = useAccount();
  const { embeddedWallet } = usePrivyEmbedded();
  const { messages, sendMessage, isThinking } = useAgent();
  const [activePanel, setActivePanel] = useState<ActivePanel>('spherian');
  const [isAutonomousMode, setIsAutonomousMode] = useState(false);

  // Smart wallet integration
  const {
    smartWallet,
    isLoading: isSmartWalletLoading,
    error: smartWalletError,
    isConnected: isSmartWalletConnected,
    initializeSmartWallet,
    getBalance,
    sendTransaction
  } = useZeroDevSmartWallet();

  // Ref for the messages container
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Ref for the input field
  const inputRef = useRef<HTMLInputElement>(null);

  // Function to scroll to the bottom
  const scrollToBottom = () => {
    const messagesContainer = messagesEndRef.current?.parentElement;
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };

  // Auto-scroll to bottom after each new message (like normal chat)
  useEffect(() => {
    if (activePanel === 'spherian' && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, activePanel]);

  // Auto-focus input field when agent stops thinking
  useEffect(() => {
    if (!isThinking && activePanel === 'spherian' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isThinking, activePanel]);

  // Initialize smart wallet when embedded wallet is available
  useEffect(() => {
    if (embeddedWallet && !smartWallet && !isSmartWalletLoading) {
      console.log('🔄 Auto-initializing ZeroDev smart wallet...');
      initializeSmartWallet();
    }
  }, [embeddedWallet, smartWallet, isSmartWalletLoading, initializeSmartWallet]);

  // Debug logging for ZeroDev status
  useEffect(() => {
    console.log('🔍 ZeroDev Hook Status:', {
      smartWallet: !!smartWallet,
      isLoading: isSmartWalletLoading,
      error: smartWalletError,
      isConnected: isSmartWalletConnected,
      address: smartWallet?.address || 'Not initialized',
      hasGetBalance: typeof getBalance === 'function',
      hasSendTransaction: typeof sendTransaction === 'function'
    });
  }, [smartWallet, isSmartWalletLoading, smartWalletError, isSmartWalletConnected, getBalance, sendTransaction]);

  const onSendMessage = async () => {
    if (!input.trim() || isThinking) return;
    if (!userAddress) {
      alert('Please connect your wallet first');
      return;
    }
    if (!embeddedWallet) {
      alert('Please create an embedded wallet first');
      return;
    }
    
    const message = input;
    setInput("");
    
    // Pass smart wallet hook to agent for autonomous operations
    const smartWalletHook = {
      isConnected: isSmartWalletConnected,
      address: smartWallet?.address || embeddedWallet.address,
      getBalance,
      sendTransaction
    };
    
    await sendMessage(message, userAddress, embeddedWallet, smartWalletHook);
  };

  return (
    <>
    {/* Mobile: Single panel view */}
    <div className="lg:hidden min-h-[100dvh] overflow-hidden bg-gradient-to-br from-sky-200 via-blue-300 to-indigo-300 pt-10 px-4">
      <div className="w-full mx-auto max-w-xl">
        {activePanel === 'profile' && <ProfilePanel 
          isAutonomousMode={isAutonomousMode} 
          setIsAutonomousMode={setIsAutonomousMode} 
          smartWalletHook={smartWallet} 
          isSmartWalletLoading={isSmartWalletLoading} 
          smartWalletError={smartWalletError} 
          isSmartWalletConnected={isSmartWalletConnected} 
          initializeSmartWallet={initializeSmartWallet} 
          getBalance={getBalance} 
          sendTransaction={sendTransaction} 
        />}
        {activePanel === 'spherian' && <SpherianPanel 
          messages={messages}
          isThinking={isThinking}
          input={input}
          setInput={setInput}
          onSendMessage={onSendMessage}
          messagesEndRef={messagesEndRef}
          scrollToBottom={scrollToBottom}
          inputRef={inputRef}
        />}
        {activePanel === 'portfolio' && <PortfolioPanel />}
      </div>
    </div>

    {/* Desktop: Full-screen three-panel layout */}
    <div className="hidden lg:block min-h-screen bg-gradient-to-br from-sky-200 via-blue-300 to-indigo-300 pt-3 relative">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-4 w-24 h-24 bg-sky-400/30 rounded-full blur-xl"></div>
        <div className="absolute top-3/4 -right-4 w-32 h-32 bg-blue-500/30 rounded-full blur-xl"></div>
        <div className="absolute bottom-1/4 left-1/3 w-20 h-20 bg-indigo-500/30 rounded-full blur-xl"></div>
      </div>
      
      <div className="relative h-[calc(90vh-13px)] grid grid-cols-3 gap-6 p-6 overflow-hidden">
        <div className="col-span-1 h-full overflow-hidden">
          <ProfilePanel 
            isAutonomousMode={isAutonomousMode} 
            setIsAutonomousMode={setIsAutonomousMode} 
            smartWalletHook={smartWallet} 
            isSmartWalletLoading={isSmartWalletLoading} 
            smartWalletError={smartWalletError} 
            isSmartWalletConnected={isSmartWalletConnected} 
            initializeSmartWallet={initializeSmartWallet} 
            getBalance={getBalance} 
            sendTransaction={sendTransaction} 
          />
        </div>
        <div className="col-span-1 h-full overflow-hidden">
          <SpherianPanel 
            messages={messages}
            isThinking={isThinking}
            input={input}
            setInput={setInput}
            onSendMessage={onSendMessage}
            messagesEndRef={messagesEndRef}
            scrollToBottom={scrollToBottom}
            inputRef={inputRef}
          />
        </div>
        <div className="col-span-1 h-full overflow-hidden">
          <PortfolioPanel />
        </div>
      </div>
    </div>
    {/* Mobile footer nav: Agent | Spherian | Portfolio */}
    <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-white border-t border-gray-200">
      <div className="max-w-2xl mx-auto flex items-center justify-between px-6 py-3">
        <button 
          onClick={() => setActivePanel('profile')}
          className={`flex flex-col items-center ${activePanel === 'profile' ? 'text-purple-600' : 'text-gray-600'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className={`text-xs ${activePanel === 'profile' ? 'font-semibold' : ''}`}>Agent</span>
        </button>
        <button 
          onClick={() => setActivePanel('spherian')}
          className={`flex flex-col items-center ${activePanel === 'spherian' ? 'text-[#0052FF]' : 'text-gray-600'}`}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className={`text-xs ${activePanel === 'spherian' ? 'font-semibold' : ''}`}>Spherian</span>
        </button>
        <button 
          onClick={() => setActivePanel('portfolio')}
          className={`flex flex-col items-center ${activePanel === 'portfolio' ? 'text-green-600' : 'text-gray-600'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h4l3-3 4 8 3-5h4" />
          </svg>
          <span className={`text-xs ${activePanel === 'portfolio' ? 'font-semibold' : ''}`}>Portfolio</span>
        </button>
      </div>
    </div>
    </>
  );
}
