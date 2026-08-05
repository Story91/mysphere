'use client';

import React, { useEffect, useState } from 'react';
import MockPost from './MockPost';
import { SignInWithBaseButton } from '@base-org/account-ui/react';
import { createBaseAccountSDK } from '@base-org/account';
import { useAccount, useConnect } from 'wagmi';
import { useSiweAuth, fetchSiweNonce, isUserRejection } from '../../utils/auth/useSiweAuth';

const mockPostsData = [
  {
    userName: 'onchain-dev.base.eth',
    userHandle: '@onchaindev',
    network: 'Base' as const,
    content: 'Just deployed a new smart contract on Base. The developer experience is getting smoother every day! #L2 #ETH',
    avatar: 'https://i.pravatar.cc/40?u=onchaindev',
    timestamp: '5m ago',
    likes: 12,
    comments: 3,
    tips: 1,
  },
  {
    userName: 'BasedAndBuilt.sphere',
    userHandle: '@basedandbuilt',
    network: 'Base' as const,
    content: 'Base is now 10x faster. Flashblocks are live on Base, speeding up effective block times from 2 seconds to 200 milliseconds and making it the fastest EVM chain today.',
    avatar: 'https://i.pravatar.cc/40?u=basedandbuilt',
    timestamp: '16m ago',
    likes: 25,
    comments: 7,
    tips: 5,
  },
  {
    userName: 'WAGMI.camper',
    userHandle: '@wagmi',
    network: 'Camp Network' as const,
    content: 'Love the community focus on Camp Network. It really feels like we are all building this together. 🏕️ #WAGMI',
    avatar: 'https://i.pravatar.cc/40?u=wagmi',
    timestamp: '28m ago',
    likes: 18,
    comments: 4,
    tips: 2,
  },
  {
    userName: 'DefiDegen.sphere',
    userHandle: '@defidegen',
    network: 'Base' as const,
    content: 'Exploring some new DeFi protocols on Base. The low transaction fees make it so much easier to experiment.',
    avatar: 'https://i.pravatar.cc/40?u=defidegen',
    timestamp: '45m ago',
    likes: 8,
    comments: 1,
    tips: 0,
  },
  {
    userName: 'CreatorDAO',
    userHandle: '@creatordao',
    network: 'Camp Network' as const,
    content: 'The creator economy on Camp Network is about to take off. The tools and support for creators are top-notch.',
    avatar: 'https://i.pravatar.cc/40?u=creatordao',
    timestamp: '1h ago',
    likes: 31,
    comments: 11,
    tips: 8,
  },
];

/** Skrocony adres do wyswietlenia, np. 0x1234...cdef. */
const shortenAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

const MockFeed = () => {
  const { connect, connectors, status: connectStatus, error: connectError } = useConnect();
  const { address: walletAddress, status: accountStatus } = useAccount();
  const { isAuthenticated, address: sessionAddress, error: siweError, signIn } = useSiweAuth();

  // Stan lokalny tylko na potrzeby tego przycisku - hook ma wlasny isLoading,
  // ale ten jest true takze przy starcie (odczyt sesji), a tu chcemy pokazac
  // spinner wylacznie po kliknieciu.
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Portfel podlaczony przez konektor wagmi pojawia sie asynchronicznie
  // (connect() z useConnect nic nie zwraca), wiec krok SIWE odpalamy z efektu.
  const [pendingSiwe, setPendingSiwe] = useState(false);

  const handleSignInWithBase = async () => {
    setIsBusy(true);
    setLocalError(null);

    // Gdy sciezka konektora wagmi przekaze robote efektowi, spinner ma zostac
    // zapalony - dlatego finally nie gasi go bezwarunkowo (return tez odpala finally).
    let handedOffToEffect = false;

    try {
      console.log('🔵 Sign In With Base clicked in MockFeed');

      // Find Coinbase Wallet connector (which supports Base Account)
      const coinbaseConnector = connectors.find(connector =>
        connector.name === 'Coinbase Wallet' || connector.id === 'coinbaseWallet'
      );

      if (coinbaseConnector) {
        console.log('✅ Found Coinbase Wallet connector, connecting...');
        // Krok SIWE dolaczy efekt ponizej, gdy wagmi zaraportuje adres.
        handedOffToEffect = true;
        setPendingSiwe(true);
        await connect({ connector: coinbaseConnector });
        return;
      } else {
        console.log('❌ Coinbase Wallet connector not found');

        // Nonce MUSI pochodzic z naszego serwera, bo /api/auth/verify porownuje
        // go z httpOnly cookie. Gdy trasa nie odpowie, wracamy do losowego nonce
        // i zachowujemy dotychczasowe zachowanie (polaczenie bez sesji serwerowej).
        let serverNonce: string | null = null;
        try {
          serverNonce = await fetchSiweNonce();
        } catch (nonceError) {
          console.warn('⚠️ Nie udalo sie pobrac nonce z serwera:', nonceError);
        }

        // Fallback to Base Account SDK (automatically connects to Base network)
        const sdk = createBaseAccountSDK({
          appName: 'BaseBook'
        });

        const provider = sdk.getProvider();

        const result = await provider.request({
          method: 'wallet_connect',
          params: [{
            version: '1',
            capabilities: {
              signInWithEthereum: {
                nonce: serverNonce || window.crypto?.randomUUID?.()?.replace(/-/g, '') || Math.random().toString(36).substring(7),
                chainId: '0x2105' // Base Mainnet - 8453
              }
            }
          }]
        });

        if ((result as any)?.accounts?.[0]) {
          const account = (result as any).accounts[0];
          console.log('✅ Base Account connected:', account.address);

          // SDK sam podpisuje wiadomosc SIWE - jesli niesie nasz nonce,
          // wystarczy oddac ja serwerowi do weryfikacji.
          const siwe = account?.capabilities?.signInWithEthereum;
          if (serverNonce && account?.address && siwe?.message && siwe?.signature) {
            await signIn({
              presigned: {
                address: account.address,
                message: siwe.message,
                signature: siwe.signature,
              },
            });
          } else {
            console.warn('⚠️ Base Account nie zwrocil podpisu SIWE - sesja serwerowa pominieta.');
          }
        }
      }

    } catch (error) {
      handedOffToEffect = false;
      setPendingSiwe(false);

      // Odmowa w portfelu to nie awaria - nie krzyczymy na uzytkownika.
      if (isUserRejection(error)) {
        console.info('ℹ️ Uzytkownik anulowal logowanie.');
      } else {
        console.error('❌ Sign In With Base error:', error);
        setLocalError('Could not connect your wallet. Please try again.');
      }
    } finally {
      if (!handedOffToEffect) setIsBusy(false);
    }
  };

  // Krok SIWE po tym, jak wagmi faktycznie podlaczyl portfel.
  useEffect(() => {
    if (!pendingSiwe) return;

    // Uzytkownik zamknal modal konektora / polaczenie padlo.
    if (connectStatus === 'error') {
      setPendingSiwe(false);
      setIsBusy(false);
      if (!isUserRejection(connectError)) {
        setLocalError('Wallet connection was interrupted. Please try again.');
      }
      return;
    }

    if (accountStatus !== 'connected' || !walletAddress) return;

    setPendingSiwe(false);

    if (isAuthenticated && sessionAddress === walletAddress.toLowerCase()) {
      setIsBusy(false);
      return;
    }

    setIsBusy(true);
    void signIn().finally(() => setIsBusy(false));
  }, [pendingSiwe, connectStatus, connectError, accountStatus, walletAddress, isAuthenticated, sessionAddress, signIn]);

  const statusMessage = localError || siweError;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-black via-gray-900 to-blue-900 rounded-lg text-center text-white p-4">
        <div className="flex justify-center mb-2 overflow-hidden">
          <div className="relative w-[250px] h-[100px] overflow-hidden">
            <img 
              src="/elo2.png" 
              alt="MySphere Logo" 
              className="w-full h-full object-contain"
            />
          </div>
        </div>
        <p className="text-sm text-gray-300 mb-4">Connect your wallet to join the conversation and see the live feed.</p>
        
        {/* Sign In With Base Button */}
        <div className="flex justify-center">
          <SignInWithBaseButton
            colorScheme="dark"
            onClick={handleSignInWithBase}
          />
        </div>

        {/* Stan logowania - ta sama stylistyka co reszta karty, bez nowych bibliotek */}
        {isBusy && (
          <p className="mt-3 text-xs text-gray-400 animate-pulse">
            Waiting for your signature...
          </p>
        )}

        {!isBusy && isAuthenticated && sessionAddress && (
          <p className="mt-3 text-xs text-green-400">
            Signed in as {shortenAddress(sessionAddress)}
          </p>
        )}

        {!isBusy && !isAuthenticated && statusMessage && (
          <p className="mt-3 text-xs text-red-400">
            {statusMessage}
          </p>
        )}
      </div>
      
      {mockPostsData.map((post, index) => (
        <MockPost key={index} {...post} />
      ))}
    </div>
  );
};

export default MockFeed; 