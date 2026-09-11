'use client';

/**
 * Mintowanie IP NFT prosto z marketplace.
 *
 * DLACZEGO TU: zeby cokolwiek wystawic na targu, trzeba najpierw mieć IP NFT,
 * a jedyne miejsce, gdzie dalo sie je wybic, to bylo `/mycamp` - trasa
 * wylaczona w config/routeStatus.js. Zakladka "My IP" pokazywala wiec pustke
 * bez zadnej drogi wyjscia. Ten panel domyka petle: logowanie do Camp Origin,
 * plik, tytul, mint - w jednym oknie, na tej samej stronie.
 *
 * MONTAZ: wylacznie przez next/dynamic z ssr:false. CampProvider i hooki SDK
 * Campa wolaja useContext/useState warunkowo (`typeof window !== "undefined"
 * ? useHook() : ...`), wiec przy renderze serwerowym liczba hookow rozjezdza
 * sie z hydracja. Ten sam wymog co przy CampSocialsCard.
 *
 * DWIE SESJE, NIE JEDNA: portfel podlaczony w aplikacji (wagmi) to nie to samo
 * co sesja Camp Origin. Origin podpisuje mint wlasnym JWT, wiec krok "Sign in
 * to Camp" jest osobny i nie da sie go pominac.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';
import {
  CampModal,
  CampProvider,
  useAuth,
  useAuthState,
  useConnect,
  useModal,
  useProvider,
} from '@campnetwork/origin/react';
import { ToastProvider } from '../../mycamp/components/Toast';
import OriginMint from '../../mycamp/MintIPnft/OriginMint';
import {
  CAMP_CLIENT_ID,
  CAMP_ENVIRONMENT,
  buildCampRedirectUri,
  describeCampError,
} from '../../utils/socials/campConnector';

interface MintIpModalProps {
  onClose: () => void;
  /** Wolane po udanym mincie - strona odswieza wtedy liste prac. */
  onMinted?: (tokenId: string) => void;
}

/** Limity rozmiaru per rodzaj pliku - te same, ktore sprawdza OriginMint. */
const MAX_MB: Record<string, number> = { image: 10, audio: 15, video: 20, text: 10, other: 10 };

function kindOf(file: File | null): keyof typeof MAX_MB {
  if (!file) return 'other';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('text/')) return 'text';
  return 'other';
}

/* ------------------------------------------------------------------------- */
/* Wnetrze - dziala wylacznie wewnatrz CampProvider.                          */
/* ------------------------------------------------------------------------- */

function MintIpInner({ onClose, onMinted }: MintIpModalProps) {
  const auth = useAuth();
  const { authenticated, loading: authLoading } = useAuthState();
  const { openModal } = useModal();
  const { connect, disconnect } = useConnect();
  const { setProvider } = useProvider();
  const { address, connector, isConnected } = useAccount();

  const [connecting, setConnecting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dragging, setDragging] = useState(false);

  /* Podglad pliku zyje tylko tak dlugo, jak plik - inaczej zostaje wyciek
     obiektu URL przy kazdej podmianie. */
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /* Zamkniecie klawiszem Escape - okno modalne bez tego lapie ludzi w pulapke. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Logowanie do Campa. Najpierw probujemy portfela, ktory juz jest podlaczony
   * w aplikacji - inaczej w Base App albo w miniappce Farcastera czlowiek
   * dostaje liste providerow EIP-6963, ktora tam bywa pusta. Modal Campa
   * zostaje jako druga droga.
   */
  const handleCampConnect = useCallback(async () => {
    setConnecting(true);
    try {
      if (address && connector?.getProvider) {
        const provider = await connector.getProvider();
        if (provider) {
          setProvider({ provider, info: { name: connector.name || 'Wallet' }, address });
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
      setConnecting(false);
    }
  }, [address, connector, setProvider, connect, openModal]);

  const pickFile = (f: File | null) => {
    if (!f) return;
    const limit = MAX_MB[kindOf(f)];
    const mb = f.size / (1024 * 1024);
    if (mb > limit) {
      toast.error(`That file is ${mb.toFixed(1)} MB. The limit for ${kindOf(f)} is ${limit} MB.`);
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const sizeLabel = file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : '';

  const step = !isConnected ? 'wallet' : !authenticated ? 'camp' : 'form';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-soft-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Mint an IP NFT"
    >
      {/* Modal Campa - wlasnego przycisku nie wstrzykuje, otwieramy go sami. */}
      <CampModal injectButton={false} />

      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[26px] bg-white p-6 shadow-[var(--soft-shadow-float)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-soft-display text-[22px] font-extrabold text-soft-ink">Mint an IP NFT</h2>
            <p className="mt-1 text-[13px] text-soft-ink-muted">
              Register a work on Camp Origin. Once it is minted you can list it here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-pill bg-soft-surface-sunken px-3 py-1.5 text-[13px] font-bold text-soft-ink-muted transition hover:bg-soft-line hover:text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            Close
          </button>
        </div>

        {/* Krok 1 - portfel */}
        {step === 'wallet' && (
          <div className="rounded-[20px] bg-soft-surface-sunken p-5 text-center">
            <p className="font-soft-display text-[16px] font-extrabold text-soft-ink">Connect your wallet first</p>
            <p className="mt-1.5 text-[13px] text-soft-ink-muted">
              Use the Connect button at the top of the page, then come back here.
            </p>
          </div>
        )}

        {/* Krok 2 - sesja Camp Origin */}
        {step === 'camp' && (
          <div className="rounded-[20px] bg-soft-surface-sunken p-5">
            <p className="font-soft-display text-[16px] font-extrabold text-soft-ink">Sign in to Camp Origin</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-soft-ink-muted">
              Camp Origin is what actually holds your IP. Signing in is free and does not move any
              funds. Your wallet stays the same.
            </p>
            <button
              type="button"
              onClick={handleCampConnect}
              disabled={connecting || authLoading}
              className="mt-4 w-full rounded-pill bg-soft-primary px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-soft-primary-deep disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary-deep"
            >
              {connecting || authLoading ? 'Opening Camp…' : 'Sign in to Camp'}
            </button>
          </div>
        )}

        {/* Krok 3 - plik i mint */}
        {step === 'form' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-pill bg-[#edfff4] px-4 py-2">
              <span className="text-[12px] font-bold text-[#0b9a51]">Signed in to Camp Origin</span>
              <button
                type="button"
                onClick={() => disconnect()}
                className="text-[12px] font-bold text-soft-ink-soft underline decoration-dotted underline-offset-2 hover:text-soft-ink"
              >
                Sign out
              </button>
            </div>

            {/* Plik */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0] || null); }}
              className={`rounded-[20px] border-2 border-dashed p-5 text-center transition ${
                dragging ? 'border-soft-primary bg-soft-surface-sunken' : 'border-soft-line bg-soft-surface-sunken/50'
              }`}
            >
              {preview ? (
                <img src={preview} alt="" className="mx-auto max-h-40 rounded-2xl object-contain" />
              ) : file ? (
                <p className="font-soft-display text-[16px] font-extrabold text-soft-ink">{kindOf(file).toUpperCase()}</p>
              ) : (
                <p className="text-[13px] text-soft-ink-muted">Drop a file here, or choose one below.</p>
              )}

              {file && (
                <p className="mt-2 break-all text-[12px] font-bold text-soft-ink-muted">
                  {file.name} · {sizeLabel}
                </p>
              )}

              <label className="mt-3 inline-block cursor-pointer rounded-pill bg-white px-4 py-2 text-[13px] font-bold text-soft-ink ring-1 ring-soft-line transition hover:bg-soft-surface-sunken focus-within:ring-2 focus-within:ring-soft-primary">
                {file ? 'Choose a different file' : 'Choose a file'}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*,audio/*,video/*,text/*"
                  onChange={(e) => pickFile(e.target.files?.[0] || null)}
                />
              </label>
              <p className="mt-2 text-[11px] text-soft-ink-faint">
                Image up to 10 MB, audio 15 MB, video 20 MB, text 10 MB.
              </p>
            </div>

            {/* Opis */}
            <div className="space-y-3">
              <div>
                <label htmlFor="mint-title" className="mb-1 block text-[12px] font-bold uppercase tracking-[0.08em] text-soft-ink-soft">
                  Title
                </label>
                <input
                  id="mint-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="What is this work called?"
                  className="w-full rounded-2xl bg-soft-surface-sunken px-4 py-2.5 text-[14px] font-bold text-soft-ink placeholder:font-normal placeholder:text-soft-ink-faint focus:outline-none focus:ring-2 focus:ring-soft-primary"
                />
              </div>
              <div>
                <label htmlFor="mint-desc" className="mb-1 block text-[12px] font-bold uppercase tracking-[0.08em] text-soft-ink-soft">
                  Description
                </label>
                <textarea
                  id="mint-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={600}
                  placeholder="A line or two about the work and who made it."
                  className="w-full resize-none rounded-2xl bg-soft-surface-sunken px-4 py-2.5 text-[14px] text-soft-ink placeholder:text-soft-ink-faint focus:outline-none focus:ring-2 focus:ring-soft-primary"
                />
              </div>
            </div>

            {/* Sam mint zostaje w OriginMint - tam jest wysylka na IPFS,
                metadane, warunki licencji i origin.mintFile. */}
            <OriginMint
              image={file}
              address={address}
              ipName={title || 'Untitled IP NFT'}
              ipDescription={description || 'Minted on MySphere'}
              onSuccess={(tokenId: string) => {
                setFile(null);
                setTitle('');
                setDescription('');
                onMinted?.(tokenId);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export default function MintIpModal({ onClose, onMinted }: MintIpModalProps) {
  /* Liczone raz - CampProvider czyta redirectUri tylko przy tworzeniu Auth. */
  const redirectUri = useMemo(() => buildCampRedirectUri(), []);

  /* Bez clientId przycisk "Sign in to Camp" nie zrobilby nic. Lepiej powiedziec
     wprost, czego brakuje, niz zostawic martwy przycisk. */
  if (!CAMP_CLIENT_ID) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-soft-ink/50 p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-[26px] bg-white p-6 shadow-[var(--soft-shadow-float)]" onClick={(e) => e.stopPropagation()}>
          <h2 className="font-soft-display text-[20px] font-extrabold text-soft-ink">Minting is not configured</h2>
          <p className="mt-2 text-[13px] text-soft-ink-muted">
            This deployment is missing <code className="text-[12px]">NEXT_PUBLIC_CAMP_CLIENT_ID</code>, so
            Camp Origin cannot be reached.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-pill bg-soft-primary px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-soft-primary-deep"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <CampProvider clientId={CAMP_CLIENT_ID} redirectUri={redirectUri} environment={CAMP_ENVIRONMENT}>
      {/* OriginMint zglasza postep przez useToast, ktory bez tego providera rzuca. */}
      <ToastProvider>
        <MintIpInner onClose={onClose} onMinted={onMinted} />
      </ToastProvider>
    </CampProvider>
  );
}
