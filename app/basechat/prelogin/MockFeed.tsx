'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createBaseAccountSDK } from '@base-org/account';
import { useAccount, useConnect } from 'wagmi';
import { useSiweAuth, fetchSiweNonce, isUserRejection } from '../../utils/auth/useSiweAuth';
import ConnectModal from '../../components/wallet/ConnectModal';
import SoftSignInHero from '../soft/SoftSignInHero';

/**
 * === DLACZEGO NIE MA TU JUZ ZMYSLONYCH POSTOW ===
 * Staly tutaj trzy wpisy z wymyslonymi ludzmi (onchain-dev.base.eth,
 * BasedAndBuilt.sphere, WAGMI.camper), awatarami z pravatar.cc i wymyslonymi
 * liczbami lajkow, komentarzy i tipow. Widzial je KAZDY niezalogowany gosc -
 * byly wiec pierwsza rzecza, jaka nowa osoba widziala z tego produktu.
 *
 * Produkt, ktorego cala teza brzmi "te liczby sa sprawdzalne i nie da sie
 * ich nabic", otwieral sie nieprawdziwymi liczbami przy nieistniejacych
 * ludziach. Zaden argument o konwersji tego nie odrabia: jesli pierwsze
 * dane, ktore ktos widzi, sa zmyslone, obietnica sprawdzalnosci jest pusta,
 * zanim ktokolwiek zdazy ja przeczytac.
 *
 * Ekran powitalny to teraz sam SoftSignInHero - znak marki, orbita, oferta,
 * znaki sieci i dwa przyciski. Nic wiecej i nic udawanego.
 *
 * Gdyby kiedys mialo tu stac cos ponizej, niech to beda PRAWDZIWE ostatnie
 * posty albo prawdziwe rozliczone platnosci (te drugie sa juz policzone na
 * /leaderboard) - nie rekwizyty.
 */

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
  // Pelna lista portfeli - ta sama, ktorej uzywa przycisk w nawigacji.
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  /**
   * Blad polaczenia, ktory byl juz widoczny w chwili STARTU tej proby.
   *
   * Mutacja `connect` z useConnect zostaje w stanie 'error' po nieudanej
   * probie i wychodzi z niego DOPIERO w kolejnym cyklu powiadomien
   * react-query. Klikniecie "Continue with Base Account" po raz drugi
   * ustawialo `pendingSiwe` i renderowalo sie ZANIM status zdazyl wrocic do
   * 'pending' - efekt ponizej widzial wiec `connectStatus === 'error'` z
   * POPRZEDNIEJ proby i natychmiast pisal "Wallet connection was interrupted",
   * w momencie gdy okno portfela dopiero sie otwieralo. Porownanie tozsamosci
   * bledu odroznia stary blad od nowego; sam status tego nie potrafi.
   */
  const staleConnectErrorRef = useRef<unknown>(null);

  const handleSignInWithBase = async () => {
    staleConnectErrorRef.current = connectError;
    setIsBusy(true);
    setLocalError(null);

    // Gdy sciezka konektora wagmi przekaze robote efektowi, spinner ma zostac
    // zapalony - dlatego finally nie gasi go bezwarunkowo (return tez odpala finally).
    let handedOffToEffect = false;

    try {
      // Szukamy DEDYKOWANEGO konektora Base Account.
      //
      // Wczesniej ten kod szukal `coinbaseWallet` i dzialal tylko dlatego, ze
      // takiego konektora w configu NIE BYLO - wiec zawsze spadal do sciezki
      // Base Account SDK ponizej. Odkad Coinbase Wallet jest osobna opcja na
      // liscie portfeli, dopasowanie po tamtym id otwieraloby ZLY portfel.
      const baseAccountConnector = connectors.find(
        (connector) => connector.id === 'baseAccount'
      );

      if (baseAccountConnector) {
        // Krok SIWE dolaczy efekt ponizej, gdy wagmi zaraportuje adres.
        handedOffToEffect = true;
        setPendingSiwe(true);
        await connect({ connector: baseAccountConnector });
        return;
      } else {

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
    // Tylko blad NOWSZY niz start tej proby - patrz staleConnectErrorRef.
    if (connectStatus === 'error' && connectError !== staleConnectErrorRef.current) {
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
      <SoftSignInHero
        onContinueWithBase={handleSignInWithBase}
        onUseAnotherWallet={() => setIsWalletModalOpen(true)}
        isBusy={isBusy}
        statusMessage={statusMessage}
        signedInAs={isAuthenticated && sessionAddress ? shortenAddress(sessionAddress) : null}
      />

      <ConnectModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />

    </div>
  );
};

export default MockFeed; 