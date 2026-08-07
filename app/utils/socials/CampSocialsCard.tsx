'use client';

/**
 * Panel podpinania kont spolecznosciowych przez konektor Camp Network.
 *
 * KONTEKST: identyczny mechanizm dzialal na /mycamp, ale ta trasa jest
 * wylaczona (config/routeStatus.js), wiec podpiac konto nie dalo sie juz
 * nigdzie. Jednoczesnie panel profilu w /basechat CZYTA dane z Campa
 * (app/api/camp/twitter, app/api/camp/spotify) - czyli pokazywal wynik
 * czynnosci, ktorej nie mial gdzie wykonac. Ten komponent domyka petle.
 *
 * MONTAZ: wylacznie przez next/dynamic z ssr:false. CampProvider i hooki SDK
 * wolaja useContext/useState warunkowo (`typeof window !== "undefined" ? useHook() : ...`),
 * wiec przy renderze serwerowym liczba hookow rozjezdza sie z hydracja.
 *
 * ZAKRES: tylko wlasny profil. Cudzego konta nikt tu nie podepnie.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';
import {
  CampModal,
  CampProvider,
  useAuth,
  useAuthState,
  useConnect,
  useLinkSocials,
  useModal,
  useProvider,
  useSocials,
} from '@campnetwork/origin/react';
import {
  CAMP_CLIENT_ID,
  CAMP_SOCIALS,
  buildCampRedirectUri,
  connectedPlatformList,
  describeCampError,
  normalizeLinkedSocials,
  syncCampSocialsToProfile,
  type CampSocialId,
} from './campConnector';

interface CampSocialsCardProps {
  /** Adres wlasciciela profilu - pod nim ladunku kopia stanu w Firestore. */
  address: string;
}

/* ------------------------------------------------------------------------- */
/* Ikony - wektory, bez emoji.                                               */
/* ------------------------------------------------------------------------- */

function SocialGlyph({ id, className }: { id: CampSocialId; className?: string }) {
  const shared = { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true as const };

  if (id === 'twitter') {
    return (
      <svg className={className} {...shared}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }

  if (id === 'spotify') {
    return (
      <svg className={className} {...shared}>
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    );
  }

  return (
    <svg className={className} {...shared}>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.78.12V9.66a5.7 5.7 0 1 0 4.9 5.64V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.35 4.35 0 0 1-3.24-1.48z" />
    </svg>
  );
}

function CampGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5 3.75 19.5h16.5L12 3.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5 7.5 19.5h9L12 10.5z" />
    </svg>
  );
}

/* ------------------------------------------------------------------------- */
/* Skorupa karty - wspolna dla stanu skonfigurowanego i nieskonfigurowanego.  */
/* ------------------------------------------------------------------------- */

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 relative overflow-hidden rounded-card bg-soft-surface border border-soft-line shadow-card font-soft">
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-soft-primary/10 rounded-full filter blur-2xl" />
      <div className="absolute top-0 left-0 right-0 h-px bg-soft-line" />

      <div className="relative z-10 p-6">
        <div className="flex items-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-soft-sunken border border-soft-line mr-4 shadow-chip">
            <CampGlyph className="w-6 h-6 text-soft-primary-deep" />
          </div>
          <div>
            <h3 className="font-soft-display font-bold text-xl text-soft-ink">Camp connector</h3>
            <p className="text-sm text-soft-ink-muted">Link X, Spotify and TikTok to this wallet</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Wnetrze - dziala wylacznie wewnatrz CampProvider.                          */
/* ------------------------------------------------------------------------- */

function CampSocialsInner({ address }: CampSocialsCardProps) {
  const auth = useAuth();
  const { authenticated, loading: authLoading } = useAuthState();
  const socialsQuery = useSocials();
  const linkFunctions = useLinkSocials();
  const { openModal } = useModal();
  const { connect, disconnect } = useConnect();
  const { setProvider } = useProvider();
  const { address: walletAddress, connector } = useAccount();

  const [isConnecting, setIsConnecting] = useState(false);
  /** Ktora siec jest w trakcie operacji - blokuje wlasny wiersz, nie caly panel. */
  const [busySocial, setBusySocial] = useState<CampSocialId | null>(null);
  const [tiktokHandle, setTiktokHandle] = useState('');
  const [isTiktokFormOpen, setIsTiktokFormOpen] = useState(false);

  const linked = useMemo(
    () => normalizeLinkedSocials(socialsQuery.data),
    [socialsQuery.data]
  );

  /**
   * "Nie sprawdzilismy" to co innego niz "nie podpieto". Bez tego rozroznienia
   * padniete zapytanie wygladaloby jak trzy puste konta.
   */
  const checkFailed = authenticated && socialsQuery.isError;
  const checking = authenticated && socialsQuery.isLoading;

  /* Kopia stanu do mySphereUserSocials. Wysylamy tylko przy realnej zmianie -
     ref trzyma ostatnio wyslany podpis, wiec kazdy render nie generuje zapisu. */
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authenticated || !address) return;
    if (socialsQuery.isError || socialsQuery.isLoading || !socialsQuery.data) return;

    const platforms = connectedPlatformList(linked);
    const signature = `${address.toLowerCase()}:${platforms.join(',')}`;
    if (lastSyncedRef.current === signature) return;

    lastSyncedRef.current = signature;
    void syncCampSocialsToProfile(address, platforms);
  }, [authenticated, address, linked, socialsQuery.data, socialsQuery.isError, socialsQuery.isLoading]);

  /**
   * Podlaczenie portfela do Campa. Najpierw probujemy portfela, ktory w
   * aplikacji juz jest podlaczony (wagmi) - inaczej uzytkownik w Base App albo
   * w miniappce Farcastera dostawalby liste providerow EIP-6963, ktora tam bywa
   * pusta. Modal Campa zostaje jako druga droga.
   */
  const handleCampConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      if (walletAddress && connector?.getProvider) {
        const provider = await connector.getProvider();
        if (provider) {
          setProvider({ provider, info: { name: connector.name || 'Wallet' }, address: walletAddress });
          await connect();
          return;
        }
      }
      openModal();
    } catch (error) {
      console.error('Camp connect failed:', error);
      toast.error(`Camp sign-in failed: ${describeCampError(error)}`);
      openModal();
    } finally {
      setIsConnecting(false);
    }
  }, [walletAddress, connector, setProvider, connect, openModal]);

  const handleCampDisconnect = useCallback(async () => {
    try {
      await disconnect();
      lastSyncedRef.current = null;
      toast.success('Camp session closed on this device.');
    } catch (error) {
      toast.error(`Could not close the Camp session: ${describeCampError(error)}`);
    }
  }, [disconnect]);

  /** X i Spotify: pelne przekierowanie na Camp. Strona znika - stad ostrzezenie. */
  const handleOAuthLink = useCallback(
    async (id: CampSocialId, fnName: string) => {
      const linkFn = linkFunctions[fnName];
      if (typeof linkFn !== 'function') {
        toast.error('This network is not available in the installed Camp SDK.');
        return;
      }

      setBusySocial(id);
      try {
        await linkFn();
      } catch (error) {
        console.error(`Camp link ${id} failed:`, error);
        toast.error(`Could not start linking: ${describeCampError(error)}`);
        setBusySocial(null);
      }
    },
    [linkFunctions]
  );

  /** TikTok: bez OAuth - Camp przyjmuje sama nazwe uzytkownika. */
  const handleTiktokLink = useCallback(async () => {
    const handle = tiktokHandle.trim().replace(/^@/, '');
    if (!handle) {
      toast.error('Enter your TikTok handle first.');
      return;
    }

    const linkFn = linkFunctions.linkTikTok;
    if (typeof linkFn !== 'function') {
      toast.error('TikTok is not available in the installed Camp SDK.');
      return;
    }

    setBusySocial('tiktok');
    try {
      await linkFn(handle);
      setIsTiktokFormOpen(false);
      setTiktokHandle('');
      await socialsQuery.refetch();
      toast.success('TikTok linked.');
    } catch (error) {
      console.error('Camp link tiktok failed:', error);
      toast.error(`TikTok not linked: ${describeCampError(error)}`);
    } finally {
      setBusySocial(null);
    }
  }, [tiktokHandle, linkFunctions, socialsQuery]);

  const handleUnlink = useCallback(
    async (id: CampSocialId, fnName: string) => {
      const unlinkFn = linkFunctions[fnName];
      if (typeof unlinkFn !== 'function') {
        toast.error('This network cannot be unlinked from here.');
        return;
      }

      setBusySocial(id);
      try {
        await unlinkFn();
        await socialsQuery.refetch();
        toast.success('Account unlinked.');
      } catch (error) {
        console.error(`Camp unlink ${id} failed:`, error);
        toast.error(`Could not unlink: ${describeCampError(error)}`);
      } finally {
        setBusySocial(null);
      }
    },
    [linkFunctions, socialsQuery]
  );

  /* Camp moze byc zalogowany INNYM portfelem niz ogladany profil. Wtedy dane
     czytane po adresie profilu (app/api/camp/*) i tak nie pokaza tych kont. */
  const campWallet = authenticated ? (auth?.walletAddress || '') : '';
  const walletMismatch =
    Boolean(campWallet) && campWallet.toLowerCase() !== address.toLowerCase();

  return (
    <CardShell>
      {/* Modal Campa - wlasnego przycisku nie wstrzykuje, otwieramy go sami. */}
      <CampModal injectButton={false} />

      {!authenticated ? (
        <div>
          <p className="text-sm text-soft-ink-muted mb-4">
            Camp holds the link between your wallet and your social accounts. Sign in once with
            the wallet you use here, then link each network.
          </p>
          <button
            type="button"
            onClick={handleCampConnect}
            disabled={isConnecting || authLoading}
            className="inline-flex items-center px-4 py-2 rounded-pill bg-soft-primary text-white text-sm font-semibold shadow-chip hover:bg-soft-primary-deep transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isConnecting || authLoading ? 'Opening Camp...' : 'Sign in with Camp'}
          </button>
          <button
            type="button"
            onClick={openModal}
            className="ml-3 text-xs font-semibold text-soft-primary-deep hover:bg-soft-line bg-soft-sunken px-3 py-1.5 rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            Use another wallet
          </button>
        </div>
      ) : (
        <div>
          {walletMismatch && (
            <p className="text-xs text-soft-ink-muted bg-soft-sunken border border-soft-line rounded-card px-3 py-2 mb-4">
              Camp is signed in with a different wallet than this profile. Accounts you link now
              belong to that wallet, so they will not show up on this profile.
            </p>
          )}

          <ul className="space-y-3">
            {CAMP_SOCIALS.map((social) => {
              const isLinked = linked[social.id];
              const isBusy = busySocial === social.id;

              return (
                <li
                  key={social.id}
                  className="flex items-center justify-between gap-3 bg-soft-sunken border border-soft-line rounded-card px-4 py-3"
                >
                  <div className="flex items-center min-w-0">
                    <SocialGlyph
                      id={social.id}
                      className={`w-6 h-6 mr-3 shrink-0 ${isLinked ? 'text-soft-primary-deep' : 'text-soft-line-strong'}`}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-soft-ink">{social.label}</div>
                      <div className="text-xs text-soft-ink-muted truncate">
                        {checking
                          ? 'Checking...'
                          : checkFailed
                            ? 'Could not check with Camp'
                            : isLinked
                              ? 'Linked'
                              : 'Not linked'}
                      </div>
                    </div>
                  </div>

                  {checkFailed ? (
                    <button
                      type="button"
                      onClick={() => socialsQuery.refetch()}
                      className="shrink-0 text-xs font-semibold text-soft-primary-deep bg-soft-surface border border-soft-line px-3 py-1.5 rounded-pill shadow-chip hover:bg-soft-line transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                    >
                      Retry
                    </button>
                  ) : isLinked ? (
                    <button
                      type="button"
                      onClick={() => handleUnlink(social.id, social.unlinkFn)}
                      disabled={isBusy || checking}
                      className="shrink-0 text-xs font-semibold text-soft-ink-muted bg-soft-surface border border-soft-line px-3 py-1.5 rounded-pill shadow-chip hover:text-soft-primary-deep hover:bg-soft-line transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isBusy ? 'Working...' : 'Unlink'}
                    </button>
                  ) : social.flow === 'handle' ? (
                    <button
                      type="button"
                      onClick={() => setIsTiktokFormOpen((open) => !open)}
                      disabled={isBusy || checking}
                      aria-expanded={isTiktokFormOpen}
                      className="shrink-0 text-xs font-semibold text-white bg-soft-primary px-3 py-1.5 rounded-pill shadow-chip hover:bg-soft-primary-deep transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isTiktokFormOpen ? 'Close' : 'Link'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOAuthLink(social.id, social.linkFn)}
                      disabled={isBusy || checking}
                      title={social.hint}
                      className="shrink-0 text-xs font-semibold text-white bg-soft-primary px-3 py-1.5 rounded-pill shadow-chip hover:bg-soft-primary-deep transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isBusy ? 'Redirecting...' : 'Link'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {isTiktokFormOpen && !linked.tiktok && (
            <div className="mt-3 bg-soft-sunken border border-soft-line rounded-card px-4 py-3">
              <label htmlFor="camp-tiktok-handle" className="block text-xs text-soft-ink-muted mb-2">
                TikTok handle - no redirect, Camp verifies it directly.
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="camp-tiktok-handle"
                  type="text"
                  value={tiktokHandle}
                  onChange={(event) => setTiktokHandle(event.target.value)}
                  placeholder="@yourhandle"
                  className="rounded-pill text-xs bg-soft-surface border border-soft-line text-soft-ink placeholder:text-soft-ink-faint transition-colors [transition-duration:var(--dur-press)] ease-out-strong focus:outline-none focus:ring-2 focus:ring-soft-primary focus:border-soft-primary flex-1 min-w-0 px-3 py-1.5"
                />
                <button
                  type="button"
                  onClick={handleTiktokLink}
                  disabled={busySocial === 'tiktok'}
                  className="shrink-0 text-xs font-semibold text-white bg-soft-primary px-3 py-1.5 rounded-pill shadow-chip hover:bg-soft-primary-deep transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busySocial === 'tiktok' ? 'Linking...' : 'Confirm'}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-soft-ink-faint pr-3">
              X and Spotify open Camp in this tab and come back when you are done.
            </p>
            <button
              type="button"
              onClick={handleCampDisconnect}
              className="shrink-0 text-xs font-semibold text-soft-ink-muted hover:text-soft-primary-deep bg-soft-sunken px-3 py-1.5 rounded-pill transition-colors [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              Sign out of Camp
            </button>
          </div>
        </div>
      )}
    </CardShell>
  );
}

/* ------------------------------------------------------------------------- */

export default function CampSocialsCard({ address }: CampSocialsCardProps) {
  /* Liczone raz - CampProvider czyta redirectUri tylko przy tworzeniu Auth. */
  const redirectUri = useMemo(() => buildCampRedirectUri(), []);

  /* Brak clientId to nie jest powod, zeby pokazac pusta karte albo przycisk,
     ktory nic nie zrobi - lepiej powiedziec wprost, czego brakuje. */
  if (!CAMP_CLIENT_ID) {
    return (
      <CardShell>
        <p className="text-sm text-soft-ink-muted">
          The Camp connector is not configured on this deployment
          (<code className="text-xs">NEXT_PUBLIC_CAMP_CLIENT_ID</code> is missing), so linking is
          unavailable right now.
        </p>
      </CardShell>
    );
  }

  return (
    <CampProvider clientId={CAMP_CLIENT_ID} redirectUri={redirectUri}>
      <CampSocialsInner address={address} />
    </CampProvider>
  );
}
