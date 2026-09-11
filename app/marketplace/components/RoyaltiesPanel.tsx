'use client';

/**
 * Tantiemy Camp Origin - saldo i odbior.
 *
 * DLACZEGO TO POWSTALO: Camp daje kazdemu IP NFT wlasne konto ERC-6551 (Token
 * Bound Account) i wplaca na nie tantiemy z licencji. Nasz IPMarketV4 o tym
 * koncie nie wie, wiec do dzis tworca mogl miec naliczone pieniadze i NIE MIAL
 * w tej aplikacji zadnego sposobu, zeby je zobaczyc ani odebrac. To jest
 * jedyna droga do tych srodkow z poziomu MySphere.
 *
 * MONTAZ: przez next/dynamic z ssr:false. CampProvider i hooki SDK wolaja
 * useContext/useState warunkowo, wiec przy renderze serwerowym liczba hookow
 * rozjezdza sie z hydracja. Ten sam wymog co przy MintIpModal.
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
import { fetchIpNftsFor } from '../../mycamp/api/fetchIpNfts';
import {
  CAMP_CLIENT_ID,
  buildCampRedirectUri,
  describeCampError,
} from '../../utils/socials/campConnector';

interface RoyaltyRow {
  tokenId: string;
  name: string;
  /** Konto ERC-6551 przypisane do tego tokena. */
  account: string;
  balance: bigint;
  formatted: string;
}

function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function RoyaltiesInner() {
  const auth = useAuth();
  const { origin } = auth as any;
  const { authenticated, loading: authLoading } = useAuthState();
  const { openModal } = useModal();
  const { connect } = useConnect();
  const { setProvider } = useProvider();
  const { address, connector, isConnected } = useAccount();

  const [rows, setRows] = useState<RoyaltyRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

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
      toast.error(`Camp sign-in failed: ${describeCampError(error)}`);
      openModal();
    } finally {
      setConnecting(false);
    }
  }, [address, connector, setProvider, connect, openModal]);

  const load = useCallback(async () => {
    if (!address || !origin || !authenticated) return;
    setLoading(true);
    try {
      const owned = await fetchIpNftsFor(address);
      /* Kazdy token to osobny odczyt konta ERC-6551. Idzie rownolegle, a blad
         na jednym tokenie nie moze schowac pozostalych - stad allSettled. */
      const settled = await Promise.allSettled(
        owned.map(async (nft: any): Promise<RoyaltyRow> => {
          const info = await origin.getRoyalties(BigInt(nft.tokenId));
          return {
            tokenId: String(nft.tokenId),
            name: nft.metadata?.name || `IP NFT ${shortId(String(nft.tokenId))}`,
            account: info.tokenBoundAccount,
            balance: BigInt(info.balance ?? 0n),
            formatted: info.balanceFormatted ?? '0',
          };
        }),
      );
      setRows(
        settled
          .filter((r): r is PromiseFulfilledResult<RoyaltyRow> => r.status === 'fulfilled')
          .map((r) => r.value),
      );
    } catch (e) {
      toast.error(`Could not read royalties: ${describeCampError(e)}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [address, origin, authenticated]);

  useEffect(() => {
    if (authenticated && origin && address) void load();
  }, [authenticated, origin, address, load]);

  const claim = async (tokenId: string) => {
    if (!origin) return;
    setClaiming(tokenId);
    try {
      await origin.claimRoyalties(BigInt(tokenId));
      toast.success('Royalties claimed.');
      await load();
    } catch (e) {
      toast.error(`Claim failed: ${describeCampError(e)}`);
    } finally {
      setClaiming(null);
    }
  };

  const withBalance = useMemo(() => (rows || []).filter((r) => r.balance > 0n), [rows]);

  return (
    <section className="rounded-[22px] bg-white p-4 shadow-[var(--soft-shadow-card)] sm:p-5">
      <CampModal injectButton={false} />

      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-soft-display text-[18px] font-extrabold text-soft-ink">Royalties on Camp</h3>
        {authenticated && (
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-[13px] font-bold text-soft-ink-soft underline decoration-dotted underline-offset-4 hover:text-soft-ink disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Refresh'}
          </button>
        )}
      </div>

      {!isConnected ? (
        <p className="text-[13px] text-soft-ink-muted">Connect your wallet to see royalties.</p>
      ) : !authenticated ? (
        <div>
          <p className="text-[13px] leading-relaxed text-soft-ink-muted">
            Camp pays licence royalties into a separate account owned by each of your IP NFTs.
            Sign in to Camp to read those balances and move the money to your wallet.
          </p>
          <button
            type="button"
            onClick={handleCampConnect}
            disabled={connecting || authLoading}
            className="mt-3 rounded-pill bg-soft-primary px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-soft-primary-deep disabled:opacity-50"
          >
            {connecting || authLoading ? 'Opening Camp…' : 'Sign in to Camp'}
          </button>
        </div>
      ) : loading && !rows ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-2xl bg-soft-surface-sunken" />
          ))}
        </div>
      ) : withBalance.length === 0 ? (
        <p className="text-[13px] text-soft-ink-muted">
          {rows && rows.length > 0
            ? `Nothing to claim yet across ${rows.length} ${rows.length === 1 ? 'work' : 'works'}. Royalties land here when somebody licences your IP.`
            : 'No IP NFTs in this wallet yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {withBalance.map((r) => (
            <li
              key={r.tokenId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-soft-surface-sunken px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-soft-display text-[15px] font-extrabold text-soft-ink">{r.name}</p>
                <p className="font-mono text-[11px] text-soft-ink-soft">
                  #{shortId(r.tokenId)} · account {r.account.slice(0, 6)}…{r.account.slice(-4)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-soft-display text-[16px] font-extrabold tabular-nums text-soft-ink">
                  {r.formatted} CAMP
                </span>
                <button
                  type="button"
                  onClick={() => claim(r.tokenId)}
                  disabled={claiming === r.tokenId}
                  className="rounded-pill bg-soft-primary px-4 py-1.5 text-[13px] font-bold text-white transition hover:bg-soft-primary-deep disabled:opacity-50"
                >
                  {claiming === r.tokenId ? 'Claiming…' : 'Claim'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function RoyaltiesPanel() {
  const redirectUri = useMemo(() => buildCampRedirectUri(), []);

  if (!CAMP_CLIENT_ID) return null;

  return (
    <CampProvider clientId={CAMP_CLIENT_ID} redirectUri={redirectUri}>
      <RoyaltiesInner />
    </CampProvider>
  );
}
