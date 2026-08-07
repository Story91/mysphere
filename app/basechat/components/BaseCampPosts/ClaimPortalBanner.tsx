import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useContractRead, useWalletClient, usePublicClient, useChainId, useSwitchChain } from 'wagmi';
import { formatEther } from 'viem';
import { toast } from 'react-hot-toast';
import { baseCampChain } from '../../../contracts/BaseCampPostContract';
import { describeWalletError } from '../../../components/useTxFeedback';

const PORTAL_NFT_ADDRESS = '0x57CC99c9E1942a34a0cfF7FCC27c227455f14587' as const;

// Tylko te cztery funkcje sa tu wolane. Wczesniej lezal w tym miejscu caly ABI
// ERC-1155 wklejony w jednej linii i deklarowal `claim` jako `nonpayable`,
// wiec transakcja szla bez CAMP - a kontrakt wymaga `msg.value >= NFT_PRICE`
// (odczytane z lancucha: 10 CAMP). Kazda proba odbioru konczyla sie revertem.
const PORTAL_NFT_ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'hasClaimed',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalClaimed',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'NFT_PRICE',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [], name: 'claim', outputs: [], stateMutability: 'payable', type: 'function' },
] as const;

interface NFTAttribute {
  trait_type: string;
  value: string | number;
}

interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: NFTAttribute[];
}

// Opis kolekcji jest staly (kontrakt trzyma jedno `uri` dla TOKEN_ID = 1),
// ale cena NIE jest tu wpisana - ta idzie z lancucha, zeby liczba na ekranie
// i kwota w transakcji nie mogly sie rozjechac.
const portalMetadata: NFTMetadata = {
  name: 'MySphere X CampNetwork',
  description: 'Exclusive NFT for the MySphere X Camp community members',
  image: '/MSxCAMP.png',
  attributes: [
    { trait_type: 'Collection', value: 'MySphere X' },
    { trait_type: 'Edition', value: 'Limited' },
    { trait_type: 'Network', value: 'Camp' },
  ],
};

// Fiolet jest kolorem akcji w Soft Social, ale `soft-primary` pod bialym
// napisem daje 4,2:1 - za malo dla 13-14 px. `soft-primary-deep` daje 6,3:1
// przy tym samym odcieniu, wiec przyciski sprawcze uzywaja glebszego tonu.
const PRIMARY_BUTTON =
  'inline-flex items-center justify-center rounded-pill bg-soft-primary-deep px-4 py-2 font-soft-display text-[13px] font-bold text-white shadow-chip transition-transform ease-out-strong [transition-duration:var(--dur-press)] hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface disabled:opacity-60 disabled:hover:scale-100';

const GHOST_BUTTON =
  'inline-flex items-center justify-center rounded-pill border border-soft-line bg-soft-surface px-4 py-2 font-soft-display text-[13px] font-bold text-soft-primary-deep transition-transform ease-out-strong [transition-duration:var(--dur-press)] hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-60 disabled:hover:scale-100';

// Cztery sytuacje, w ktorych uzytkownik NIE moze kliknac "claim", musza byc
// czterema roznymi zdaniami. Najwazniejsze rozroznienie: `unreadable` (odczyt
// padl) to nie to samo co "nie masz NFT" - inaczej awaria sieci wygladalaby
// jak zaproszenie do kupna czegos, co uzytkownik moze juz miec.
type BannerState = 'no-wallet' | 'checking' | 'unreadable' | 'owned' | 'wrong-network' | 'ready';

const STATE_SENTENCE: Record<BannerState, string> = {
  'no-wallet': 'Connect a wallet to see whether this NFT is still yours to claim.',
  checking: 'Checking your claim status on Camp Network...',
  unreadable: 'Camp Network did not answer. Your claim status is unchecked, not empty.',
  owned: 'You already own this NFT.',
  'wrong-network': 'Your wallet is on another network. Claiming switches it to Camp Network first.',
  ready: 'One claim per wallet.',
};

const ClaimPortalBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  // Klient przypiety do 484: po `switchChain` domyslny klient moze jeszcze
  // wskazywac poprzedni lancuch, a symulacja musi isc do Camp.
  const publicClient = usePublicClient({ chainId: baseCampChain.id });
  const { switchChainAsync } = useSwitchChain();
  const [isLoading, setIsLoading] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  // Optymistyczne "mam" po wlasnej transakcji - odczyt z lancucha dogoni to
  // dopiero po kilku sekundach, a baner nie moze w tym czasie zapraszac
  // do drugiego odbioru.
  const [justClaimed, setJustClaimed] = useState(false);

  const isOnCampNetwork = chainId === baseCampChain.id;

  const claimedRead = useContractRead({
    address: PORTAL_NFT_ADDRESS,
    abi: PORTAL_NFT_ABI,
    functionName: 'hasClaimed',
    args: address ? [address] : undefined,
    chainId: baseCampChain.id,
    query: { enabled: Boolean(address) },
  });

  const totalRead = useContractRead({
    address: PORTAL_NFT_ADDRESS,
    abi: PORTAL_NFT_ABI,
    functionName: 'totalClaimed',
    chainId: baseCampChain.id,
  });

  const priceRead = useContractRead({
    address: PORTAL_NFT_ADDRESS,
    abi: PORTAL_NFT_ABI,
    functionName: 'NFT_PRICE',
    chainId: baseCampChain.id,
  });

  // `null` = nie zmierzono. Zaden z tych odczytow nie ma prawa spasc do zera
  // ani do `false`, bo to sa dwie rozne wiadomosci dla uzytkownika.
  const claimCount: number | null = typeof totalRead.data === 'bigint' ? Number(totalRead.data) : null;
  const priceWei: bigint | null = typeof priceRead.data === 'bigint' ? priceRead.data : null;
  const priceLabel = priceWei === null ? null : `${formatEther(priceWei)} CAMP`;

  const state: BannerState = !isConnected || !address
    ? 'no-wallet'
    : justClaimed
      ? 'owned'
      : claimedRead.isError
        ? 'unreadable'
        : claimedRead.data === undefined
          ? 'checking'
          : claimedRead.data
            ? 'owned'
            : isOnCampNetwork
              ? 'ready'
              : 'wrong-network';

  const canClaim = state === 'ready' || state === 'wrong-network';

  const retryReads = useCallback(() => {
    claimedRead.refetch();
    totalRead.refetch();
    priceRead.refetch();
  }, [claimedRead, totalRead, priceRead]);

  const handleClaim = useCallback(async () => {
    if (!isConnected || !address || isLoading) {
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    // Toast `loading` nie znika sam - bez zdjecia po ID zostawal na ekranie
    // obok komunikatu o sukcesie albo bledzie.
    let loadingToastId: string | undefined;

    try {
      setIsLoading(true);
      loadingToastId = toast.loading('Preparing your claim...');

      // `switchChainAsync`, nie `switchChain`: ta druga to mutacja bez promisy,
      // wiec `catch` ponizej nigdy sie nie wykonywal, a "Switched to Camp
      // Network" pokazywalo sie nawet po odmowie w portfelu.
      if (!isOnCampNetwork) {
        try {
          await switchChainAsync({ chainId: baseCampChain.id });
          toast.success('Switched to Camp Network');
        } catch (switchError) {
          console.error('Failed to switch network:', switchError);
          toast.error('Please switch to Camp Network manually');
          return;
        }
      }

      // Cena czytana tuz przed wyslaniem, a nie z ekranu: kontrakt odrzuca
      // `msg.value` mniejsze niz NFT_PRICE, wiec kwota musi pochodzic z tego
      // samego zrodla co warunek, ktory ja sprawdza.
      const price = await publicClient.readContract({
        address: PORTAL_NFT_ADDRESS,
        abi: PORTAL_NFT_ABI,
        functionName: 'NFT_PRICE',
      });

      const { request } = await publicClient.simulateContract({
        address: PORTAL_NFT_ADDRESS,
        abi: PORTAL_NFT_ABI,
        functionName: 'claim',
        account: address,
        chain: baseCampChain,
        value: price,
      });

      await walletClient.writeContract({ ...request, chain: baseCampChain });

      toast.success('Claim transaction sent!');
      setJustClaimed(true);
      setShowPreviewModal(false);
    } catch (error) {
      console.error('Claim transaction error:', error);
      const info = describeWalletError(error, {
        network: 'Camp Network',
        gasSymbol: baseCampChain.nativeCurrency.symbol,
      });
      // Odmowa w portfelu to nie awaria - nie straszymy czerwonym bledem.
      if (info.isFailure) {
        toast.error('Could not claim the NFT: ' + info.message);
      } else {
        toast(info.message);
      }
    } finally {
      if (loadingToastId) toast.dismiss(loadingToastId);
      setIsLoading(false);
    }
  }, [
    isConnected,
    address,
    isLoading,
    walletClient,
    publicClient,
    isOnCampNetwork,
    switchChainAsync,
  ]);

  // Okno modalne bez Escape jest pulapka dla klawiatury - `aria-modal` obiecuje
  // zachowanie dialogu, wiec musi je miec.
  useEffect(() => {
    if (!showPreviewModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowPreviewModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPreviewModal]);

  if (dismissed) {
    return null;
  }

  // Modal renderowany inline. Wczesniej byl komponentem definiowanym w ciele
  // rendera, wiec przy kazdym renderze React dostawal NOWY typ komponentu
  // i przemontowywal caly modal od zera - stad migotanie, ktore probowano
  // leczyc komentarzem "simplified to prevent flickering".
  const previewModal = showPreviewModal ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-soft-ink/45 p-4 backdrop-blur-sm"
      onClick={() => setShowPreviewModal(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={portalMetadata.name}
        className="w-full max-w-md rounded-card border border-soft-line bg-soft-surface p-5 font-soft shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-soft-display text-[18px] font-bold leading-snug text-soft-ink">
          {portalMetadata.name}
        </h2>
        <p className="mt-1 text-[13px] leading-[1.5] text-soft-ink-muted">
          {portalMetadata.description}
        </p>

        <div className="mt-4 aspect-square w-full overflow-hidden rounded-card border border-soft-line bg-soft-sunken">
          <img
            src={portalMetadata.image}
            alt={portalMetadata.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          {portalMetadata.attributes?.map((attr) => (
            <div key={attr.trait_type} className="rounded-card border border-soft-line bg-soft-sunken px-3 py-2">
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-soft-ink-muted">
                {attr.trait_type}
              </dt>
              <dd className="mt-0.5 text-[13px] font-semibold text-soft-ink">{attr.value}</dd>
            </div>
          ))}
          {/* Biale tlo zamiast `soft-sunken`: pomaranczowy na liliowym daje
              4,4:1, na bieli 5,2:1. Ta jedna komorka niesie kwote. */}
          <div className="rounded-card border border-soft-accent/40 bg-soft-surface px-3 py-2">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-soft-ink-muted">
              Price
            </dt>
            {/* Pomaranczowy tylko tutaj - to jedyna kwota w tym oknie. */}
            <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-soft-accent-deep">
              {priceLabel ?? (priceRead.isError ? 'not checked' : 'checking...')}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setShowPreviewModal(false)} className={GHOST_BUTTON}>
            Cancel
          </button>
          <button type="button" onClick={handleClaim} disabled={isLoading} className={PRIMARY_BUTTON}>
            {isLoading ? 'Waiting for your wallet...' : priceLabel ? `Claim for ${priceLabel}` : 'Claim'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <section
        aria-label="Portal NFT on Camp Network"
        className="mb-4 rounded-card border border-soft-line bg-soft-surface p-3.5 font-soft shadow-card sm:p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* Staly kwadrat - obrazek nigdy nie dostaje wymiaru z tekstu obok,
                wiec nie da sie go rozciagnac ani splaszczyc. */}
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-card border border-soft-line bg-soft-sunken sm:h-16 sm:w-16">
              <img
                src={portalMetadata.image}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="min-w-0">
              <h3 className="font-soft-display text-[15px] font-bold leading-snug text-soft-ink sm:text-[16px]">
                Portal NFT on Camp Network
              </h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-soft-ink-muted">
                {/* Akcent wylacznie na kwocie - reszta banera zostaje neutralna. */}
                <span className="font-bold tabular-nums text-soft-accent-deep">
                  {priceLabel ?? (priceRead.isError ? 'Price not checked' : 'Checking price...')}
                </span>
                <span aria-hidden="true" className="text-soft-line-strong">|</span>
                <span className="tabular-nums">
                  {claimCount === null
                    ? totalRead.isError
                      ? 'claims not checked'
                      : 'counting claims...'
                    : `${claimCount} claimed so far`}
                </span>
              </p>
              {/* `soft-ink-muted`, nie `soft-ink-soft`: przy 12 px ten drugi
                  daje 3,4:1 na bialej karcie, a to jest zdanie niosace stan. */}
              <p className="mt-1 text-[12px] leading-[1.45] text-soft-ink-muted">
                {STATE_SENTENCE[state]}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 sm:flex-col sm:items-end sm:gap-1.5">
            {canClaim && (
              <button type="button" onClick={() => setShowPreviewModal(true)} disabled={isLoading} className={PRIMARY_BUTTON}>
                {state === 'wrong-network' ? 'Switch & claim' : 'Claim'}
              </button>
            )}
            {state === 'checking' && (
              <span className="inline-flex items-center rounded-pill border border-soft-line bg-soft-sunken px-4 py-2 font-soft-display text-[13px] font-bold text-soft-ink-muted">
                Checking...
              </span>
            )}
            {state === 'unreadable' && (
              <button type="button" onClick={retryReads} className={GHOST_BUTTON}>
                Try again
              </button>
            )}
            {state === 'owned' && (
              <span className="inline-flex items-center gap-2 rounded-pill border border-soft-line bg-soft-sunken px-4 py-2 font-soft-display text-[13px] font-bold text-soft-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-soft-primary" aria-hidden="true" />
                Owned
              </span>
            )}

            <button
              type="button"
              onClick={() => setDismissed(true)}
              /* Kontrolka klikalna, wiec `soft-ink-faint` (2,6:1) odpada mimo
                 ze to drobny tekst poboczny. */
              className="rounded-pill px-2 py-1 text-[11px] text-soft-ink-muted underline decoration-soft-line underline-offset-2 transition-transform ease-out-strong [transition-duration:var(--dur-press)] hover:text-soft-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              Dismiss
            </button>
          </div>
        </div>
      </section>

      {previewModal}
    </>
  );
};

export default ClaimPortalBanner;
