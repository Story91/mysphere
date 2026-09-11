'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from "@campnetwork/origin/react";
import { LicenseType, type LicenseTerms } from "@campnetwork/origin";
import { useWalletClient } from 'wagmi';
import type { Address } from "viem/accounts";
import { useToast } from '../components/Toast';

interface OriginMintProps {
  image: File | null;
  address: string | undefined;
  ipName?: string;
  ipDescription?: string;
  onSuccess?: (tokenId: string) => void;
}

/**
 * Typ warunkow licencji bierzemy z SDK, a nie przepisujemy u siebie.
 *
 * Wlasna kopia rozjechala sie z paczka: w @campnetwork/origin 1.3.x doszlo
 * wymagane pole `licenseType`, a kopia go nie miala, wiec TypeScript uznawal
 * obiekt za poprawny do momentu, w ktorym SDK i tak by go odrzucilo.
 */

/**
 * PLIKU NIE WYSYLAMY JUZ SAMI.
 *
 * Bylo tak: plik szedl na wlasne konto Pinaty, potem pobieralismy go z powrotem,
 * a adres bramki Pinaty wpisywalismy do metadanych jako `image`. Dwa skutki,
 * oba zle:
 *
 * 1. 2026-09-11 konto Pinaty zostalo ZABLOKOWANE za przekroczenie planu -
 *    `pinFileToIPFS` oddaje 403 "Account blocked due to plan usage limit".
 *    Mintowanie przestalo dzialac w calosci, na kazdym pliku.
 * 2. Adres prywatnej bramki wpisany do metadanych umiera razem z kontem.
 *    Dokladnie stad wziely sie puste miniatury na calym marketplace: stare
 *    tokeny maja w `image` adres bramki, ktora dzis odpowiada 403.
 *
 * `origin.mintFile` wysyla plik SAM, przez presigned URL backendu Campa, i przy
 * `useAssetAsPreview` wpisuje do metadanych `ipfs://<cid>` - czyli adres
 * niezalezny od jakiejkolwiek bramki. Nasz wlasny klucz do Pinaty przestal byc
 * do czegokolwiek potrzebny.
 */

export default function OriginMint({ 
  image, 
  address, 
  ipName = "My IP NFT",
  ipDescription = "Uploaded via Origin SDK",
  onSuccess
}: OriginMintProps) {
  const auth = useAuth();
  const { origin } = auth;
  const { showToast } = useToast();
  const { data: walletClient } = useWalletClient();
  const [isRegistering, setIsRegistering] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Set up provider once per walletClient session
  const providerSetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!walletClient || !auth || !origin) return;
    const currentAccount = walletClient?.account?.address as string | undefined;
    if (!currentAccount) return;
    if (providerSetRef.current === currentAccount) return;

    console.log("Setting up walletClient for Origin SDK in OriginMint");
    try {
      if (typeof (auth as any).setProvider === 'function') {
        (auth as any).setProvider({
          provider: walletClient,
          info: { name: 'WagmiWalletClient' }
        });
        console.log("Provider set successfully in OriginMint");
      }
      if (typeof origin.setViemClient === 'function') {
        origin.setViemClient(walletClient);
        console.log("Viem client set on origin in OriginMint");
      }
      providerSetRef.current = currentAccount;
    } catch (error) {
      console.error("Error setting provider in OriginMint:", error);
    }
  }, [walletClient, auth, origin]);

  const handleRegisterIP = async () => {
    if (!image || !address || !origin) {
      setError("Missing required data for registration");
      showToast("❌ Missing required data for registration", 'error');
      return;
    }
    
    // Check if walletClient is available
    if (!walletClient) {
      setError("WalletClient not connected. Please reconnect your wallet");
      showToast("⚠️ WalletClient not connected. Please reconnect your wallet", 'warning');
      console.error("WalletClient not available");
      return;
    }

    // Check if wallet is connected
    if (!auth.walletAddress) {
      setError("Please connect your wallet first through MyOrigin button");
      showToast("⚠️ Please connect through MyOrigin button first", 'warning');
      return;
    }
    console.log("Wallet connected:", auth.walletAddress);
    console.log("WalletClient available:", !!walletClient);

    // Check if Origin is properly initialized
    if (!origin) {
      setError("Origin SDK not initialized. Please reconnect through MyOrigin");
      showToast("⚠️ Origin SDK not initialized. Please reconnect through MyOrigin", 'warning');
      return;
    }

    // Additional debug info
    console.log("Debug info before minting:", {
      hasAuth: !!auth,
      hasOrigin: !!origin,
      hasWalletClient: !!walletClient,
      walletAddress: auth.walletAddress,
      provider: (auth as any).provider,
      jwt: !!(auth as any).jwt
    });
    
    showToast("🚀 Starting IP NFT registration process...", 'info', 2000, { key: 'flow' });
    setIsRegistering(true);
    setError(null);
    
    try {
      // Try to set provider again if not set
      if (!((auth as any).provider) && walletClient) {
        console.log("Provider not set, attempting to set it now...");
        if (typeof (auth as any).setProvider === 'function') {
          (auth as any).setProvider({ 
            provider: walletClient, 
            info: { name: 'WagmiWalletClient' } 
          });
          console.log("Provider set just before minting");
        }
      }
      
      // Plik idzie prosto do mintFile - Camp wysyla go wlasnym kanalem.
      const file = image;

      // Determine media kind and size limits
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      const isText  = file.type.startsWith('text/');
      const kind = isImage ? 'IMAGE' : isVideo ? 'VIDEO' : isAudio ? 'AUDIO' : isText ? 'TEXT' : 'FILE';
      const maxMB = isImage ? 10 : isAudio ? 15 : isVideo ? 20 : isText ? 10 : 10;

      // Check file size per kind
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > maxMB) {
        setError(`File too large: ${fileSizeMB.toFixed(2)}MB. Max for ${kind} is ${maxMB}MB.`);
        showToast(`❌ File too large: ${fileSizeMB.toFixed(2)}MB. Max for ${kind} is ${maxMB}MB.`, 'error', 4000, { key: 'err' });
        return;
      }

      // Define license terms (exactly as in working example)
      // DURATION_BASED = licencja na czas, jedyny wariant, ktory obsluguje
      // nasz interfejs. SINGLE_PAYMENT i X402 wymagaja `duration: 0`.
      const license: LicenseTerms = {
        price: BigInt(0),
        duration: 2629800, // 30 dni w sekundach
        royaltyBps: 0,
        paymentToken: "0x0000000000000000000000000000000000000000" as Address,
        licenseType: LicenseType.DURATION_BASED,
      };

      // Create metadata (ERC721 media best practices)
      const siteOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const metadata: Record<string, any> = {
        name: ipName,
        description: ipDescription,
        attributes: [
          { trait_type: 'Type', value: kind },
          { trait_type: 'MIME', value: file.type },
          { trait_type: 'File Size', value: `${fileSizeMB.toFixed(2)}MB` },
        ],
        mimeType: file.type,
        properties: { mimeType: file.type },
        external_url: siteOrigin ? `${siteOrigin}/mycamp` : undefined,
      };
      // `image` ustawia SDK na `ipfs://<cid>` po wyslaniu pliku (patrz
      // useAssetAsPreview nizej). Wpisanie tu adresu bramki oznaczaloby
      // miniature, ktora umiera razem z ta bramka - juz raz tak bylo.

      console.log("Starting IP registration...", {
        fileSize: fileSizeMB.toFixed(2) + "MB",
        walletAddress: address,
        hasOrigin: !!origin,
        fileName: file.name,
        fileType: file.type
      });
      
      showToast("📝 Preparing metadata and license terms...", 'info', 1500, { key: 'flow' });

      // Register IP using Origin SDK
      console.log("Calling origin.mintFile...");
      showToast("🔐 Signing transaction with Origin SDK...", 'info', 4000, { key: 'flow' });
      
            /**
       * Podglad jest MILE WIDZIANY, ale nie moze blokowac mintu.
       *
       * ZGLOSZENIE 11.09: "Failed to upload preview image to IPFS: Failed to
       * get presigned URL (HTTP 400) ... account surpassing plan limits".
       * Ten 403 przychodzi z Pinaty PO STRONIE CAMPA, nie z naszego konta -
       * my zadnego klucza do Pinaty juz nie uzywamy. Czyli o powodzeniu mintu
       * decydowal limit planu na cudzym koncie.
       *
       * Praca jest wazniejsza od miniatury: gdy podglad nie przechodzi,
       * powtarzamy mint bez niego. Token wtedy nie ma `image`, a karta pokazuje
       * nazwe medium - to znosna strata w porownaniu z brakiem tokena.
       */
      const wantsPreview = file.type.startsWith('image/');
      let result: string | null = null;
      try {
        result = await origin.mintFile(file, metadata, license, undefined, {
          useAssetAsPreview: wantsPreview,
        });
      } catch (previewError: any) {
        const msg = String(previewError?.message || '');
        const previewFailed = wantsPreview && /preview image|presigned url|plan limits|surpassing plan/i.test(msg);
        if (!previewFailed) throw previewError;
        console.warn('Podglad odrzucony przez backend Campa, mintuje bez niego:', msg);
        showToast('Camp storage refused the thumbnail. Trying the mint without one.', 'warning', 4000, { key: 'flow' });
        result = await origin.mintFile(file, metadata, license);
      }
      setSuccess(result);

      console.log("✅ IP registration successful! Token ID:", result);
      showToast("⏳ Transaction submitted, waiting for confirmation...", 'info', 2500, { key: 'flow' });
      
      // Format token ID for display (show first 6 and last 4 characters)
      const shortId = result && result.length > 15 
        ? `${result.slice(0, 6)}...${result.slice(-4)}`
        : result || '';
      
      showToast(`🎉 IP NFT minted successfully! Token ID: ${shortId}`, 'success', 6000, { key: 'success' });
      
      // Call onSuccess callback if provided
      if (onSuccess && result) {
        onSuccess(result);
      }
      
    } catch (error: any) {
      console.error("❌ IP registration failed:", error);
      
      /**
       * KONIEC ZGADYWANIA - pokazujemy POWOD, nie nasza interpretacje.
       *
       * Ten blok dwa razy wprowadzil w blad. Najpierw mowil "approve in
       * wallet" przy awarii, w ktorej portfel nie byl nawet pytany. Potem
       * kazal wylogowac sie z Campa przy awarii, ktorej wylogowanie nie
       * dotyczy. Oba razy prawdziwa tresc bledu byla schowana.
       *
       * USTALONE 11.09.2026: mint na Camp mainnet nie dziala z powodow po
       * STRONIE CAMPA. Ich backend odmawia i wysylki pliku ("account
       * surpassing plan limits"), i podpisu. Ostatni mint w kolekcji
       * 0x39EeE1...2C38 pochodzi z 1 maja 2026 - przez cztery miesiace nie
       * powstal tam ani jeden token, wiec nie jest to usterka naszej
       * integracji. Tego nie da sie naprawic z tej strony.
       */
      const detail = String(error?.message || error || 'unknown error');
      const isCampQuota = /plan limits|surpassing plan|presigned url|upload preview/i.test(detail);
      const isCampSignature = /signature|failed to register/i.test(detail);

      let errorMessage: string;
      if (isCampQuota || isCampSignature) {
        errorMessage =
          'Camp Origin refused this mint on its side: ' + detail +
          '. That is Camp own storage and signing service, not your wallet and not this app.';
      } else {
        errorMessage = detail;
      }
      showToast(errorMessage, 'error', 9000, { key: 'err' });

      setError(errorMessage);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="w-full space-y-4">
        <button
          disabled={!image || !address || isRegistering || !ipName?.trim() || !origin}
          onClick={handleRegisterIP}
          className="w-full rounded-pill bg-soft-primary px-6 py-3 text-[14px] font-bold text-white transition hover:bg-soft-primary-deep disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary-deep"
        >
          {isRegistering ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Minting…
            </div>
          ) : !origin ? (
            "Sign in to Camp first"
          ) : (
            "Mint this IP NFT"
          )}
        </button>
      
      {/* Error Display */}
      {error && (
        <div className="rounded-2xl bg-[#ffefef] p-4">
          <p className="text-[13px] font-bold text-[#a32020]">{error}</p>
        </div>
      )}
      
      {/* Success Display */}
      {success && (
        <div className="w-full rounded-2xl bg-[#edfff4] p-4">
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-green-800 font-medium">IP registration successful!</span>
          </div>
          <p className="text-green-600 text-sm">Token ID: {success}</p>
          <a
                            href={`https://camp.cloud.blockscout.com/token/0x39EeE1C3989f0dD543Dee60f8582F7F81F522C38/instance/${success}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-700 underline mt-2 inline-block"
          >
            View your IP NFT on Explorer
          </a>
        </div>
      )}

    </div>
  );
}
