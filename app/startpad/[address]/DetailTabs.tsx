'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  ImagePlus,
  RefreshCw,
  Users,
} from 'lucide-react';
import { fetchTokenHolders, type IndexedHolder } from '../blockscout';
import {
  LAUNCH_HOOK_ADDRESS,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  LAUNCHPAD_EXPLORER_URL,
  LIQUIDITY_VAULT_ADDRESS,
} from '../config';
import { resizeImageFile } from '../logoUpload';
import { parseMetadataUri, pickTokenImage, resolveMediaUrl } from '../metadata';
import {
  DEAD_ADDRESS,
  fmtEth,
  fmtPrice,
  fmtTokens,
  POOL_MANAGER_ADDRESS,
  priceToNumber,
  short,
  SUPPLY_WEI,
  timeAgo,
  usdSuffix,
  type CoreState,
  type HolderRow,
  type TokenProfileView,
  type TradeEntry,
} from './detailShared';

const FIELD =
  'w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-[14px] text-[#16141b] outline-none placeholder:text-black/35 focus:border-soft-primary';

const EXPLORER = LAUNCHPAD_EXPLORER_URL;

type Tab = 'trades' | 'holders' | 'info';

const PAGE_SIZE = 15;

function badgeFor(address: string, creator: string): HolderRow['badge'] {
  const value = address.toLowerCase();
  if (value === creator.toLowerCase()) return 'dev';
  if (value === LAUNCHPAD_ADDRESS.toLowerCase()) return 'bonding curve';
  if (value === DEAD_ADDRESS) return 'burned';
  if (value === LIQUIDITY_VAULT_ADDRESS.toLowerCase()) return 'vault';
  if (value === LAUNCH_HOOK_ADDRESS.toLowerCase()) return 'hook';
  if (value === POOL_MANAGER_ADDRESS) return 'pool';
  return null;
}

const BADGE_CLASS: Record<NonNullable<HolderRow['badge']>, string> = {
  dev: 'bg-[#edeaff] text-[#5f4ec2]',
  'bonding curve': 'bg-[#e8f4ff] text-[#1f6fb2]',
  burned: 'bg-[#ffefef] text-[#a32020]',
  vault: 'bg-[#edfff4] text-[#0b7a41]',
  hook: 'bg-[#fff3e8] text-[#a35408]',
  pool: 'bg-[#edfff4] text-[#0b7a41]',
};

export default function DetailTabs({
  core,
  tokenAddress,
  ethUsd,
  trades,
  balances,
  historyLoading,
  historyError,
  truncated,
  onRetryHistory,
  profile,
  isCreator,
  onProfileSaved,
}: {
  core: CoreState;
  tokenAddress: Address | null;
  /** Kurs ETH/USD do dopiskow; null = dopiski znikaja, ETH zostaje. */
  ethUsd: number | null;
  trades: TradeEntry[];
  balances: Map<string, bigint>;
  historyLoading: boolean;
  historyError: string | null;
  truncated: boolean;
  onRetryHistory: () => void;
  profile: TokenProfileView | null;
  isCreator: boolean;
  onProfileSaved: (profile: TokenProfileView) => void;
}) {
  const [tab, setTab] = useState<Tab>('trades');
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Ranking posiadaczy z Blockscouta - pelny, nie obciety oknem skanu. Pusty
  // (brak klucza / token nieznany) -> zostaje odtworzenie z lancucha ponizej.
  const [indexHolders, setIndexHolders] = useState<IndexedHolder[] | null>(null);
  useEffect(() => {
    if (!tokenAddress) return;
    let cancelled = false;
    void fetchTokenHolders(LAUNCHPAD_CHAIN.id, tokenAddress).then((rows) => {
      if (!cancelled && rows.length > 0) setIndexHolders(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  // Jedno zrodlo logo dla tabel: profil tworcy wygrywa z lancuchem - ta sama
  // regula co w naglowku strony, zeby jedna strona nie pokazywala dwoch logo.
  const logoUrl = pickTokenImage({ profileLogoUrl: profile?.logoUrl, metadataUri: core.config.metadataURI }).url;

  const holders = useMemo<HolderRow[]>(() => {
    // Bierzemy zrodlo z WIEKSZA liczba posiadaczy: Blockscout bywa na Base
    // Sepolii spozniony i pokazuje mniej niz jest naprawde, a odtworzenie
    // z lancucha lapie swiezy ruch. Wygrywa to, ktore widzi wiecej.
    const chainRows = Array.from(balances.entries());
    const indexRows: Array<[string, bigint]> = (indexHolders ?? []).map((h) => [h.address, h.balance]);
    const source: Array<[string, bigint]> = indexRows.length >= chainRows.length ? indexRows : chainRows;
    const rows: HolderRow[] = [];
    for (const [address, balance] of source) {
      if (balance <= 0n) continue;
      rows.push({
        address,
        balance,
        pctBps: Number((balance * 10_000n) / SUPPLY_WEI),
        badge: badgeFor(address, core.creator),
      });
    }
    rows.sort((a, b) => (a.balance === b.balance ? 0 : a.balance < b.balance ? 1 : -1));
    return rows.slice(0, 20);
  }, [indexHolders, balances, core.creator]);

  const newestFirst = useMemo(() => [...trades].reverse(), [trades]);

  const loadingRow = historyLoading && trades.length === 0 && (
    <div className="flex items-center justify-center gap-2 px-5 py-10 text-[12px] text-black/45">
      <RefreshCw className="h-4 w-4 animate-spin text-soft-primary" aria-hidden="true" /> Reading onchain history...
    </div>
  );

  return (
    <section className="overflow-hidden rounded-[20px] border border-black/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-5" role="tablist" aria-label="Token history tabs">
        <div className="flex items-center gap-1">
          {(
            [
              ['trades', `Trades${trades.length ? ` (${trades.length})` : ''}`],
              ['holders', `Holders${holders.length ? ` (${holders.length >= 20 ? '20+' : holders.length})` : ''}`],
              ['info', 'Info'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-full px-3.5 py-2 text-[12px] font-extrabold transition-colors ${tab === value ? 'bg-soft-primary text-white' : 'text-black/50 hover:text-soft-primary-deep'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {historyLoading && trades.length > 0 && <RefreshCw className="h-3.5 w-3.5 animate-spin text-soft-primary" aria-hidden="true" />}
      </div>

      {historyError && (
        <div className="flex items-center justify-between gap-3 border-b border-black/10 bg-[#fff8ed] px-4 py-2.5 text-[11.5px] text-[#a34b08] sm:px-5">
          <span className="min-w-0 truncate">History scan failed: {historyError}</span>
          <button type="button" onClick={onRetryHistory} className="shrink-0 rounded-full border border-[#f3c58a] px-3 py-1 text-[11px] font-extrabold hover:bg-white">
            Retry
          </button>
        </div>
      )}
      {truncated && !historyError && (
        <div className="border-b border-black/10 bg-[#fbfbfd] px-4 py-2 text-[10.5px] text-black/40 sm:px-5">
          The public RPC limits how far back one page can scan, so the oldest part of this history is not shown.
        </div>
      )}

      {tab === 'trades' && (
        <>
          {loadingRow}
          {!historyLoading && newestFirst.length === 0 && !historyError && (
            <div className="px-5 py-10 text-center text-[12px] text-black/45">No trades yet. The first buy will show up here within seconds.</div>
          )}
          {newestFirst.length > 0 && (
            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
                <div className="grid grid-cols-[90px_70px_1fr_110px_110px_110px_44px] gap-2 border-b border-black/10 bg-[#fafafd] px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/40 sm:px-5">
                  <span>Time</span>
                  <span>Side</span>
                  <span>Account</span>
                  <span className="text-right">ETH</span>
                  <span className="flex items-center justify-end gap-1.5">
                    <SymbolGlyph url={logoUrl} symbol={core.symbol} />
                    {core.symbol}
                  </span>
                  <span className="text-right">Price</span>
                  <span />
                </div>
                <div className="divide-y divide-black/5">
                  {newestFirst.slice(0, visible).map((trade) => (
                    <div key={trade.id} className="grid grid-cols-[90px_70px_1fr_110px_110px_110px_44px] items-center gap-2 px-4 py-2.5 text-[12px] sm:px-5">
                      <span className="text-[11px] text-black/45">{timeAgo(trade.ts)}</span>
                      <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${trade.kind === 'buy' ? 'bg-[#edfff4] text-[#0b9a51]' : 'bg-[#fff8ed] text-[#a34b08]'}`}>
                        {trade.kind === 'buy' ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}
                        {trade.kind}
                      </span>
                      <a href={`${EXPLORER}/address/${trade.account}`} target="_blank" rel="noreferrer" className="truncate font-bold text-[#16141b] hover:text-soft-primary-deep">
                        {short(trade.account)}
                      </a>
                      <span className="text-right font-extrabold text-[#16141b]">{fmtEth(trade.eth, 4)}</span>
                      <span className="text-right text-black/60">{fmtTokens(trade.tokens, core.decimals)}</span>
                      <span className="text-right text-[11px] text-black/50">{fmtPrice(priceToNumber(trade.priceWei))}</span>
                      {trade.txHash ? (
                        <a href={`${EXPLORER}/tx/${trade.txHash}`} target="_blank" rel="noreferrer" className="justify-self-end rounded-full p-1.5 text-black/35 hover:bg-[#f4f1ff] hover:text-soft-primary-deep" aria-label="Open transaction on BaseScan">
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {newestFirst.length > visible && (
            <div className="border-t border-black/10 px-4 py-3 text-center sm:px-5">
              <button type="button" onClick={() => setVisible((current) => current + PAGE_SIZE)} className="rounded-full border border-black/10 px-4 py-2 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary">
                Show {Math.min(PAGE_SIZE, newestFirst.length - visible)} more of {newestFirst.length - visible}
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'holders' && (
        <>
          {loadingRow}
          {!historyLoading && holders.length === 0 && !historyError && (
            <div className="px-5 py-10 text-center text-[12px] text-black/45">No holder balances reconstructed yet.</div>
          )}
          {holders.length > 0 && (
            <div className="divide-y divide-black/5">
              {holders.map((holder, index) => (
                <div key={holder.address} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <span className="w-5 shrink-0 text-[11px] font-bold text-black/35">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`${EXPLORER}/address/${holder.address}`} target="_blank" rel="noreferrer" className="text-[12.5px] font-extrabold text-[#16141b] hover:text-soft-primary-deep">
                        {short(holder.address)}
                      </a>
                      {holder.badge && (
                        <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.05em] ${BADGE_CLASS[holder.badge]}`}>{holder.badge}</span>
                      )}
                    </div>
                    {/* Pasek udzialu: procent calej podazy 1e9, nie procent "free float". */}
                    <div className="mt-1.5 h-1 w-full max-w-[240px] overflow-hidden rounded-full bg-black/6">
                      <div className="h-full rounded-full bg-soft-primary/70" style={{ width: `${Math.min(100, holder.pctBps / 100)}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-[12.5px] font-extrabold text-[#16141b]">{(holder.pctBps / 100).toFixed(2)}%</span>
                    <span className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-black/45">
                      <SymbolGlyph url={logoUrl} symbol={core.symbol} />
                      {fmtTokens(holder.balance, core.decimals)} {core.symbol}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-black/10 px-4 py-2.5 text-[10.5px] text-black/40 sm:px-5">
            <Users className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Top 20 by balance, rebuilt from ERC-20 Transfer events. Percentages are of the full 1B supply.
          </div>
        </>
      )}

      {tab === 'info' && (
        <div className="space-y-5 p-4 sm:p-5">
          {core.config.known ? (
            <div>
              <h3 className="text-[13px] font-extrabold text-[#16141b]">Creator setup</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-[#f8f7fc] p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/40">Trading fee</p>
                  <p className="mt-1 text-[16px] font-extrabold text-[#16141b]">{(core.config.feeBps / 100).toFixed(2)}%</p>
                  <p className="mt-0.5 text-[10.5px] text-black/45">
                    {(core.config.creatorFeeBps / 100).toFixed(2)}% to {core.config.receiverCount} receiver{core.config.receiverCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="rounded-xl bg-[#f8f7fc] p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/40">Auto-buyback</p>
                  <p className="mt-1 text-[16px] font-extrabold text-[#16141b]">{(core.config.buybackBps / 100).toFixed(0)}%</p>
                  {/* Buyback jest ciety z DZIALKI TWORCY, nie z calej oplaty
                      hooka - protokol dostaje swoja czesc w calosci. */}
                  <p className="mt-0.5 text-[10.5px] text-black/45">of the creator&apos;s fee share</p>
                </div>
                <div className="rounded-xl bg-[#f8f7fc] p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/40">Buyback waiting</p>
                  <p className="mt-1 text-[16px] font-extrabold text-[#16141b]">
                    {fmtEth(core.config.pendingBuybackEth)} ETH
                    {core.config.pendingBuybackEth > 0n && usdSuffix(core.config.pendingBuybackEth, ethUsd) && (
                      <span className="ml-1 text-[11px] font-bold text-black/40">· {usdSuffix(core.config.pendingBuybackEth, ethUsd)}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-black/45">set aside from the creator&apos;s ETH share at settle; anyone can execute</p>
                </div>
                <div className="rounded-xl bg-[#f8f7fc] p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/40">Burned so far</p>
                  <p className="mt-1 text-[16px] font-extrabold text-[#16141b]">{fmtTokens(core.config.buybackBurned, core.decimals)}</p>
                  <p className="mt-0.5 text-[10.5px] text-black/45">{core.symbol} sent to the burn address</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-[#fbfbfd] p-3 text-[11.5px] leading-[1.5] text-black/50">
              This token was launched on a contract version that predates per-token fee configuration, so there is no creator setup to show.
            </p>
          )}

          {(() => {
            const meta = parseMetadataUri(core.config.metadataURI);
            if (!meta.image && !meta.description && !meta.link) return null;
            return (
              <div>
                <h3 className="text-[13px] font-extrabold text-[#16141b]">Onchain metadata</h3>
                <div className="mt-3 flex items-start gap-3 rounded-xl bg-[#f8f7fc] p-3">
                  {/* `next/image` wymagaloby listy `remotePatterns`, a logo pochodzi
                      z dowolnego hosta albo bramy IPFS - adres przeszedl juz przez
                      parseMetadataUri, ktore odsiewa wszystko poza https i ipfs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {meta.image && <img src={meta.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />}
                  <div className="min-w-0">
                    {meta.description && <p className="text-[12px] leading-[1.5] text-black/60">{meta.description}</p>}
                    {meta.link && (
                      <a href={meta.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] font-extrabold text-soft-primary-deep hover:text-soft-primary">
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Metadata URI
                      </a>
                    )}
                    <p className="mt-1 text-[10px] text-black/35">Set once at launch, immutable. The editable profile below can override the logo and description in our interface.</p>
                  </div>
                </div>
              </div>
            );
          })()}

          <div>
            <h3 className="text-[13px] font-extrabold text-[#16141b]">Contracts</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['Token', core.token],
                  ['Curve launchpad', LAUNCHPAD_ADDRESS],
                  ['Launch hook', LAUNCH_HOOK_ADDRESS],
                  ['Liquidity vault', LIQUIDITY_VAULT_ADDRESS],
                ] as const
              ).map(([label, address]) => (
                <a key={label} href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl border border-black/10 px-3 py-2.5 text-[11.5px] hover:border-soft-primary">
                  <span className="font-extrabold text-[#16141b]">{label}</span>
                  <span className="flex items-center gap-1.5 text-black/50">
                    {short(address)}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </span>
                </a>
              ))}
            </div>
            {core.state === 'Graduated' && (
              <p className="mt-2 text-[10.5px] text-black/40">
                Pool {core.poolId === `0x${'0'.repeat(64)}` ? 'not seeded yet' : short(core.poolId)} · position liquidity {core.liquidity.toString()} · full-range, owned by the vault.
              </p>
            )}
          </div>

          {isCreator && <ProfileEditor token={core.token} profile={profile} onSaved={onProfileSaved} />}
        </div>
      )}
    </section>
  );
}

/**
 * Male logo tokena przy symbolu w tabelach. Fallback to inicjal, bo obrazek
 * pochodzi od obcego tworcy i moze nie wstac - pusta dziura przy kazdym
 * wierszu wygladalaby na blad interfejsu, kolorowy inicjal nie.
 */
function SymbolGlyph({ url, symbol }: { url: string | null; symbol: string }) {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-soft-primary text-[8px] font-extrabold leading-none text-white">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
      ) : (
        symbol.slice(0, 1)
      )}
    </span>
  );
}

/**
 * Edytor profilu tworcy - ta sama logika, co w poprzedniej wersji strony:
 * zapis przez POST /api/launchpad/token, serwer sprawdza sesje SIWE i tworce
 * odczytanego z lancucha. Tu tylko przenosiny do taba Info.
 */
function ProfileEditor({
  token,
  profile,
  onSaved,
}: {
  token: string;
  profile: TokenProfileView | null;
  onSaved: (profile: TokenProfileView) => void;
}) {
  const [logoDraft, setLogoDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [websiteDraft, setWebsiteDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLogoDraft(profile?.logoUrl ?? '');
    setDescriptionDraft(profile?.description ?? '');
    setWebsiteDraft(profile?.website ?? '');
  }, [profile]);

  // Plik NIE wychodzi z przegladarki w oryginale: resizeImageFile skaluje go
  // lokalnie do malego data URL i dopiero ten string idzie tym samym POST-em,
  // co zwykly adres logo. Dzieki temu upload nie potrzebuje zadnego storage.
  const pickFile = async (file: File | null) => {
    if (!file) return;
    setNotice(null);
    setResizing(true);
    try {
      setLogoDraft(await resizeImageFile(file));
    } catch (cause) {
      setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'Could not read that image.' });
    } finally {
      setResizing(false);
    }
  };

  // Podglad pokazuje ROBOCZE logo (w tym swiezo wgrany plik), nie zapisane -
  // tworca ma widziec, co zapisze, zanim kliknie Save.
  const preview = resolveMediaUrl(logoDraft) ?? resolveMediaUrl(profile?.logoUrl);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/launchpad/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: token, chainId: LAUNCHPAD_CHAIN.id, logoUrl: logoDraft, description: descriptionDraft, website: websiteDraft }),
      });
      const payload = (await response.json()) as { profile?: TokenProfileView; error?: string };
      if (!response.ok) {
        // 401 to brak sesji SIWE - mowimy, jaki jest pierwszy krok, zamiast
        // powtarzac ogolny komunikat serwera o edycji profilu.
        setNotice({
          kind: 'error',
          text: response.status === 401 ? 'Sign in with your wallet first' : payload.error ?? 'Saving the profile failed.',
        });
        return;
      }
      if (payload.profile) {
        onSaved(payload.profile);
        setNotice({ kind: 'success', text: 'Profile saved. It shows up in the board and the token list.' });
      }
    } catch (cause) {
      setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'Saving the profile failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-black/10 pt-5">
      <h3 className="text-[13px] font-extrabold text-[#16141b]">Token profile (creator only)</h3>
      <p className="mt-1 text-[11.5px] leading-[1.5] text-black/50">
        Only you can edit this. The server checks the creator on chain before saving. The logo also feeds{' '}
        <a href="/api/launchpad/tokenlist" className="font-bold text-soft-primary-deep hover:text-soft-primary">our token list</a>, which wallets and aggregators can import.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-[12px] font-extrabold text-[#16141b]">Logo</span>
          <div className="flex items-center gap-2">
            {logoDraft.startsWith('data:') ? (
              // Data URL w polu tekstowym to sciana base64 - zamiast niej
              // czytelna plakietka z mozliwoscia cofniecia do pola URL.
              <div className={`${FIELD} flex items-center justify-between gap-2`}>
                <span className="truncate text-black/55">Uploaded image (stored with the profile)</span>
                <button type="button" onClick={() => setLogoDraft('')} className="shrink-0 text-[11px] font-extrabold text-soft-primary-deep hover:text-soft-primary">
                  Clear
                </button>
              </div>
            ) : (
              <input value={logoDraft} onChange={(event) => setLogoDraft(event.target.value)} className={FIELD} placeholder="ipfs://... or https://..." aria-label="Logo URL" />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                // Reset wartosci pozwala wybrac ten sam plik drugi raz,
                // np. po Clear - inaczej onChange by nie odpalil.
                event.target.value = '';
                void pickFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={resizing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-3 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary disabled:opacity-60"
            >
              {resizing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />}
              Upload
            </button>
          </div>
          <span className="mt-1 block text-[10.5px] text-black/45">
            ipfs:// is safer: its address is the file&apos;s hash, so nobody can swap the image later. Uploaded files are resized in your browser and shown only on this site.
          </span>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-extrabold text-[#16141b]">Website</span>
          <input value={websiteDraft} onChange={(event) => setWebsiteDraft(event.target.value)} className={FIELD} placeholder="https://..." />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="mb-1.5 block text-[12px] font-extrabold text-[#16141b]">Description</span>
        <textarea rows={2} value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} className={FIELD} maxLength={280} />
      </label>
      {notice && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-[11.5px] font-bold ${notice.kind === 'success' ? 'bg-[#edfff4] text-[#0b7a41]' : 'bg-[#ffefef] text-[#a32020]'}`}>{notice.text}</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={busy} className="rounded-full bg-soft-primary px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-60">
          {busy ? 'Saving...' : 'Save profile'}
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="" className="h-10 w-10 rounded-xl object-cover" referrerPolicy="no-referrer" />}
      </div>
    </div>
  );
}
