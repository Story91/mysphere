'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
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
  NATIVE_SYMBOL,
} from '../config';
import { resizeImageFile } from '../logoUpload';
import useSiweAuth from '../../utils/auth/useSiweAuth';
import { parseMetadataUri, pickTokenImage, resolveMediaUrl } from '../metadata';
import {
  DEAD_ADDRESS,
  fmtEth,
  fmtPrice,
  fmtTokens,
  holdersAreExact,
  pageSlice,
  pickHolderRows,
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
  'w-full rounded-xl border border-sp-shade/10 bg-sp-surface px-3.5 py-3 text-[14px] text-sp-ink outline-none placeholder:text-sp-shade/35 focus:border-soft-primary';

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
  dev: 'bg-sp-brand-soft text-sp-brand-deep',
  'bonding curve': 'bg-sp-info-soft text-sp-info',
  burned: 'bg-sp-danger-soft text-sp-danger',
  vault: 'bg-sp-up-soft text-sp-up',
  hook: 'bg-sp-down-soft text-sp-down-deep',
  pool: 'bg-sp-up-soft text-sp-up',
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
  historyComplete,
  onRetryHistory,
  profile,
  isCreator,
  profileRequest,
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
  /** Historia siega bloku startu tokena, wiec salda sa dokladne, nie przyblizone. */
  historyComplete: boolean;
  onRetryHistory: () => void;
  profile: TokenProfileView | null;
  isCreator: boolean;
  /** Licznik zadan z naglowka: tworca kliknal pusta ikonke linku. */
  profileRequest: number;
  onProfileSaved: (profile: TokenProfileView) => void;
}) {
  const [tab, setTab] = useState<Tab>('trades');
  const [page, setPage] = useState(0);
  const editorRef = useRef<HTMLDivElement | null>(null);

  // Zadanie z naglowka: otworz Info i pokaz formularz. Pierwsze wywolanie
  // (licznik 0) pomijamy - inaczej kazde wejscie tworcy na strone przerzucaloby
  // go z Trades na Info.
  useEffect(() => {
    if (!profileRequest || !isCreator) return;
    setTab('info');
    const timer = setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    return () => clearTimeout(timer);
  }, [profileRequest, isCreator]);

  /**
   * Ranking posiadaczy z Blockscouta - potrzebny TYLKO wtedy, gdy nasza historia
   * nie siega startu tokena.
   *
   * Odkad salda czyta `balanceOf`, przy kompletnej historii nasza tabela jest
   * dokladna co do wei, a indeks bywa spozniony o godziny - to on pokazywal
   * „Holders (1)" przy czterech kupujacych na GLIFE. Pytanie go w takiej
   * sytuacji kosztuje kredyty planu Buildera i nie wnosi nic.
   */
  const exactHolders = holdersAreExact({ complete: historyComplete, knownBalances: balances.size });
  const [indexHolders, setIndexHolders] = useState<IndexedHolder[] | null>(null);
  useEffect(() => {
    if (!tokenAddress || exactHolders) return;
    let cancelled = false;
    void fetchTokenHolders(LAUNCHPAD_CHAIN.id, tokenAddress).then((rows) => {
      if (!cancelled && rows.length > 0) setIndexHolders(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [tokenAddress, exactHolders]);

  // Jedno zrodlo logo dla tabel: profil tworcy wygrywa z lancuchem - ta sama
  // regula co w naglowku strony, zeby jedna strona nie pokazywala dwoch logo.
  const logoUrl = pickTokenImage({ profileLogoUrl: profile?.logoUrl, metadataUri: core.config.metadataURI }).url;

  const holders = useMemo<HolderRow[]>(() => {
    // Przy kompletnej historii wygrywaja NASZE salda - sa z `balanceOf`, wiec
    // dokladne co do wei. Dopiero gdy historia jest ucieta, bierzemy zrodlo z
    // wieksza liczba wierszy, bo wtedy nasza mapa jest przyblizeniem.
    //
    // Liczymy PO odsianiu sald niedodatnich, bo tylko one sa wierszami tabeli.
    // Bez tego mapa z lancucha wygrywala samymi zerami i pustymi wierszami po
    // sprzedazach - zrodlo "wieksze" o rzeczy, ktorych nikt nie zobaczy.
    const positive = (rows: Array<[string, bigint]>) => rows.filter(([, balance]) => balance > 0n);
    const chainRows = positive(Array.from(balances.entries()));
    const indexRows = positive((indexHolders ?? []).map((h) => [h.address, h.balance] as [string, bigint]));
    const source = pickHolderRows({ chain: chainRows, index: indexRows, exact: exactHolders });
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
  }, [indexHolders, balances, core.creator, exactHolders]);

  const newestFirst = useMemo(() => [...trades].reverse(), [trades]);
  // Strona liczona przy renderze, nie trzymana w stanie: lista zmienia dlugosc
  // pod reka (zdarzenia na zywo, dociagana historia), wiec numer strony musi
  // sam sie miescic w tym, ile stron jest TERAZ.
  const tradePage = pageSlice(newestFirst, page, PAGE_SIZE);

  const loadingRow = historyLoading && trades.length === 0 && (
    <div className="flex items-center justify-center gap-2 px-5 py-10 text-[12px] text-sp-shade/45">
      <RefreshCw className="h-4 w-4 animate-spin text-soft-primary" aria-hidden="true" /> Reading onchain history...
    </div>
  );

  return (
    <section className="overflow-hidden rounded-[20px] border border-sp-shade/10 bg-sp-surface">
      <div className="flex items-center justify-between gap-3 border-b border-sp-shade/10 px-4 py-3 sm:px-5" role="tablist" aria-label="Token history tabs">
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
              className={`rounded-full px-3.5 py-2 text-[12px] font-extrabold transition-colors ${tab === value ? 'bg-soft-primary text-sp-on-brand' : 'text-sp-shade/50 hover:text-soft-primary-deep'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {historyLoading && trades.length > 0 && <RefreshCw className="h-3.5 w-3.5 animate-spin text-soft-primary" aria-hidden="true" />}
      </div>

      {historyError && (
        <div className="flex items-center justify-between gap-3 border-b border-sp-shade/10 bg-sp-down-soft px-4 py-2.5 text-[11.5px] text-sp-down-deep sm:px-5">
          <span className="min-w-0 truncate">History scan failed: {historyError}</span>
          <button type="button" onClick={onRetryHistory} className="shrink-0 rounded-full border border-sp-down-line px-3 py-1 text-[11px] font-extrabold hover:bg-sp-surface">
            Retry
          </button>
        </div>
      )}
      {truncated && !historyError && (
        <div className="border-b border-sp-shade/10 bg-sp-bg px-4 py-2 text-[10.5px] text-sp-shade/40 sm:px-5">
          The public RPC limits how far back one page can scan, so the oldest part of this history is not shown.
        </div>
      )}

      {tab === 'trades' && (
        <>
          {loadingRow}
          {!historyLoading && newestFirst.length === 0 && !historyError && (
            <div className="px-5 py-10 text-center text-[12px] text-sp-shade/45">No trades yet. The first buy will show up here within seconds.</div>
          )}
          {newestFirst.length > 0 && (
            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
                <div className="grid grid-cols-[90px_70px_1fr_110px_110px_110px_44px] gap-2 border-b border-sp-shade/10 bg-sp-sunken px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40 sm:px-5">
                  <span>Time</span>
                  <span>Side</span>
                  <span>Account</span>
                  <span className="text-right">{NATIVE_SYMBOL}</span>
                  <span className="flex items-center justify-end gap-1.5">
                    <SymbolGlyph url={logoUrl} symbol={core.symbol} />
                    {core.symbol}
                  </span>
                  <span className="text-right">Price</span>
                  <span />
                </div>
                <div className="divide-y divide-sp-shade/5">
                  {tradePage.rows.map((trade) => (
                    <div key={trade.id} className="grid grid-cols-[90px_70px_1fr_110px_110px_110px_44px] items-center gap-2 px-4 py-2.5 text-[12px] sm:px-5">
                      <span className="text-[11px] text-sp-shade/45">{timeAgo(trade.ts)}</span>
                      <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${trade.kind === 'buy' ? 'bg-sp-up-soft text-sp-up' : 'bg-sp-down-soft text-sp-down-deep'}`}>
                        {trade.kind === 'buy' ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}
                        {trade.kind}
                      </span>
                      <a href={`${EXPLORER}/address/${trade.account}`} target="_blank" rel="noreferrer" className="truncate font-bold text-sp-ink hover:text-soft-primary-deep">
                        {short(trade.account)}
                      </a>
                      <span className="text-right font-extrabold text-sp-ink">{fmtEth(trade.eth, 4)}</span>
                      <span className="text-right text-sp-shade/60">{fmtTokens(trade.tokens, core.decimals)}</span>
                      <span className="text-right text-[11px] text-sp-shade/50">{fmtPrice(priceToNumber(trade.priceWei))}</span>
                      {trade.txHash ? (
                        <a href={`${EXPLORER}/tx/${trade.txHash}`} target="_blank" rel="noreferrer" className="justify-self-end rounded-full p-1.5 text-sp-shade/35 hover:bg-sp-brand-soft hover:text-soft-primary-deep" aria-label="Open transaction on BaseScan">
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
          {/* Strony, nie rosnaca kolumna: 141 transakcji "Show more" rozciagalo
              strone na kilka ekranow i psulo przewijanie wszystkiego ponizej. */}
          {tradePage.pages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-sp-shade/10 px-4 py-2.5 sm:px-5">
              <span className="text-[11px] font-bold text-sp-shade/40">
                {tradePage.page * PAGE_SIZE + 1}-{tradePage.page * PAGE_SIZE + tradePage.rows.length} of {newestFirst.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage(tradePage.page - 1)}
                  disabled={tradePage.page === 0}
                  className="rounded-full border border-sp-shade/10 p-1.5 text-sp-shade/50 transition-colors hover:border-soft-primary hover:text-soft-primary-deep disabled:opacity-30 disabled:hover:border-sp-shade/10 disabled:hover:text-sp-shade/50"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-[62px] text-center text-[11.5px] font-extrabold text-sp-ink">
                  {tradePage.page + 1} / {tradePage.pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(tradePage.page + 1)}
                  disabled={tradePage.page >= tradePage.pages - 1}
                  className="rounded-full border border-sp-shade/10 p-1.5 text-sp-shade/50 transition-colors hover:border-soft-primary hover:text-soft-primary-deep disabled:opacity-30 disabled:hover:border-sp-shade/10 disabled:hover:text-sp-shade/50"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'holders' && (
        <>
          {loadingRow}
          {!historyLoading && holders.length === 0 && !historyError && (
            <div className="px-5 py-10 text-center text-[12px] text-sp-shade/45">No holder balances reconstructed yet.</div>
          )}
          {holders.length > 0 && (
            <div className="divide-y divide-sp-shade/5">
              {holders.map((holder, index) => (
                <div key={holder.address} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <span className="w-5 shrink-0 text-[11px] font-bold text-sp-shade/35">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`${EXPLORER}/address/${holder.address}`} target="_blank" rel="noreferrer" className="text-[12.5px] font-extrabold text-sp-ink hover:text-soft-primary-deep">
                        {short(holder.address)}
                      </a>
                      {holder.badge && (
                        <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.05em] ${BADGE_CLASS[holder.badge]}`}>{holder.badge}</span>
                      )}
                    </div>
                    {/* Pasek udzialu: procent calej podazy 1e9, nie procent "free float". */}
                    <div className="mt-1.5 h-1 w-full max-w-[240px] overflow-hidden rounded-full bg-sp-shade/6">
                      <div className="h-full rounded-full bg-soft-primary/70" style={{ width: `${Math.min(100, holder.pctBps / 100)}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-[12.5px] font-extrabold text-sp-ink">{(holder.pctBps / 100).toFixed(2)}%</span>
                    <span className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-sp-shade/45">
                      <SymbolGlyph url={logoUrl} symbol={core.symbol} />
                      {fmtTokens(holder.balance, core.decimals)} {core.symbol}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-sp-shade/10 px-4 py-2.5 text-[10.5px] text-sp-shade/40 sm:px-5">
            <Users className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Top 20 by balance, rebuilt from ERC-20 Transfer events. Percentages are of the full 1B supply.
          </div>
        </>
      )}

      {tab === 'info' && (
        <div className="space-y-5 p-4 sm:p-5">
          {core.config.known ? (
            <div>
              <h3 className="text-[13px] font-extrabold text-sp-ink">Creator setup</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-sp-sunken p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">Trading fee</p>
                  <p className="mt-1 text-[16px] font-extrabold text-sp-ink">{(core.config.feeBps / 100).toFixed(2)}%</p>
                  <p className="mt-0.5 text-[10.5px] text-sp-shade/45">
                    {(core.config.creatorFeeBps / 100).toFixed(2)}% to {core.config.receiverCount} receiver{core.config.receiverCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="rounded-xl bg-sp-sunken p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">Auto-buyback</p>
                  <p className="mt-1 text-[16px] font-extrabold text-sp-ink">{(core.config.buybackBps / 100).toFixed(0)}%</p>
                  {/* Buyback jest ciety z DZIALKI TWORCY, nie z calej oplaty
                      hooka - protokol dostaje swoja czesc w calosci. */}
                  <p className="mt-0.5 text-[10.5px] text-sp-shade/45">of the creator&apos;s fee share</p>
                </div>
                <div className="rounded-xl bg-sp-sunken p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">Buyback waiting</p>
                  <p className="mt-1 text-[16px] font-extrabold text-sp-ink">
                    {fmtEth(core.config.pendingBuybackEth)} {NATIVE_SYMBOL}
                    {core.config.pendingBuybackEth > 0n && usdSuffix(core.config.pendingBuybackEth, ethUsd) && (
                      <span className="ml-1 text-[11px] font-bold text-sp-shade/40">· {usdSuffix(core.config.pendingBuybackEth, ethUsd)}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-sp-shade/45">set aside from the creator&apos;s {NATIVE_SYMBOL} share at settle; anyone can execute</p>
                </div>
                <div className="rounded-xl bg-sp-sunken p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">Burned so far</p>
                  <p className="mt-1 text-[16px] font-extrabold text-sp-ink">{fmtTokens(core.config.buybackBurned, core.decimals)}</p>
                  <p className="mt-0.5 text-[10.5px] text-sp-shade/45">{core.symbol} sent to the burn address</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-sp-bg p-3 text-[11.5px] leading-[1.5] text-sp-shade/50">
              This token was launched on a contract version that predates per-token fee configuration, so there is no creator setup to show.
            </p>
          )}

          {(() => {
            const meta = parseMetadataUri(core.config.metadataURI);
            if (!meta.image && !meta.description && !meta.link) return null;
            return (
              <div>
                <h3 className="text-[13px] font-extrabold text-sp-ink">Onchain metadata</h3>
                <div className="mt-3 flex items-start gap-3 rounded-xl bg-sp-sunken p-3">
                  {/* `next/image` wymagaloby listy `remotePatterns`, a logo pochodzi
                      z dowolnego hosta albo bramy IPFS - adres przeszedl juz przez
                      parseMetadataUri, ktore odsiewa wszystko poza https i ipfs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {meta.image && <img src={meta.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />}
                  <div className="min-w-0">
                    {meta.description && <p className="text-[12px] leading-[1.5] text-sp-shade/60">{meta.description}</p>}
                    {meta.link && (
                      <a href={meta.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] font-extrabold text-soft-primary-deep hover:text-soft-primary">
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Metadata URI
                      </a>
                    )}
                    <p className="mt-1 text-[10px] text-sp-shade/35">Set once at launch, immutable. The editable profile below can override the logo and description in our interface.</p>
                  </div>
                </div>
              </div>
            );
          })()}

          <div>
            <h3 className="text-[13px] font-extrabold text-sp-ink">Contracts</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['Token', core.token],
                  ['Curve launchpad', LAUNCHPAD_ADDRESS],
                  ['Launch hook', LAUNCH_HOOK_ADDRESS],
                  ['Liquidity vault', LIQUIDITY_VAULT_ADDRESS],
                ] as const
              ).map(([label, address]) => (
                <a key={label} href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl border border-sp-shade/10 px-3 py-2.5 text-[11.5px] hover:border-soft-primary">
                  <span className="font-extrabold text-sp-ink">{label}</span>
                  <span className="flex items-center gap-1.5 text-sp-shade/50">
                    {short(address)}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </span>
                </a>
              ))}
            </div>
            {core.state === 'Graduated' && (
              <p className="mt-2 text-[10.5px] text-sp-shade/40">
                Pool {core.poolId === `0x${'0'.repeat(64)}` ? 'not seeded yet' : short(core.poolId)} · position liquidity {core.liquidity.toString()} · full-range, owned by the vault.
              </p>
            )}
          </div>

          {isCreator && (
            <div ref={editorRef}>
              <ProfileEditor token={core.token} profile={profile} onSaved={onProfileSaved} />
            </div>
          )}
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
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-soft-primary text-[8px] font-extrabold leading-none text-sp-on-brand">
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
  // X i Telegram API przyjmowalo od poczatku - formularz ich po prostu nie
  // zbieral, wiec te dwie ikonki w naglowku nie mialy prawa sie nigdy zapalic.
  const [twitterDraft, setTwitterDraft] = useState('');
  const [telegramDraft, setTelegramDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, signIn } = useSiweAuth();

  useEffect(() => {
    setLogoDraft(profile?.logoUrl ?? '');
    setDescriptionDraft(profile?.description ?? '');
    setWebsiteDraft(profile?.website ?? '');
    setTwitterDraft(profile?.twitter ?? '');
    setTelegramDraft(profile?.telegram ?? '');
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
      // Zapis wymaga sesji SIWE (serwer sprawdza tworce z lancucha). Jak jej nie
      // ma, NAJPIERW podpisujemy wiadomosc - to NIE transakcja i NIE kosztuje
      // gazu, wiec dziala na kazdej sieci (tez Robinhood). Dopiero potem POST.
      // Wczesniej edytor tylko pokazywal "Sign in first" bez zadnego sposobu, by
      // to zrobic - stad "nie da sie zapisac logo".
      if (!isAuthenticated) {
        const ok = await signIn();
        if (!ok) {
          setNotice({ kind: 'error', text: 'Sign in with your wallet to save (just a signature, no gas). If the wallet did not prompt, click Save again.' });
          return;
        }
      }
      const response = await fetch('/api/launchpad/token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: token,
          chainId: LAUNCHPAD_CHAIN.id,
          logoUrl: logoDraft,
          description: descriptionDraft,
          website: websiteDraft,
          twitter: twitterDraft,
          telegram: telegramDraft,
        }),
      });
      const payload = (await response.json()) as { profile?: TokenProfileView; error?: string };
      if (!response.ok) {
        setNotice({
          kind: 'error',
          text: response.status === 401 ? 'Sign in with your wallet, then click Save again.' : payload.error ?? 'Saving the profile failed.',
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
    <div className="border-t border-sp-shade/10 pt-5">
      <h3 className="text-[13px] font-extrabold text-sp-ink">Token profile (creator only)</h3>
      <p className="mt-1 text-[11.5px] leading-[1.5] text-sp-shade/50">
        Only you can edit this. The server checks the creator on chain before saving. The logo also feeds{' '}
        <a href="/api/launchpad/tokenlist" className="font-bold text-soft-primary-deep hover:text-soft-primary">our token list</a>, which wallets and aggregators can import.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-[12px] font-extrabold text-sp-ink">Logo</span>
          <div className="flex items-center gap-2">
            {logoDraft.startsWith('data:') ? (
              // Data URL w polu tekstowym to sciana base64 - zamiast niej
              // czytelna plakietka z mozliwoscia cofniecia do pola URL.
              <div className={`${FIELD} flex items-center justify-between gap-2`}>
                <span className="truncate text-sp-shade/55">Uploaded image (stored with the profile)</span>
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
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sp-shade/10 bg-sp-surface px-3 py-3 text-[12px] font-extrabold text-sp-ink hover:border-soft-primary disabled:opacity-60"
            >
              {resizing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />}
              Upload
            </button>
          </div>
          <span className="mt-1 block text-[10.5px] text-sp-shade/45">
            ipfs:// is safer: its address is the file&apos;s hash, so nobody can swap the image later. Uploaded files are resized in your browser and shown only on this site.
          </span>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-extrabold text-sp-ink">Website</span>
            <input value={websiteDraft} onChange={(event) => setWebsiteDraft(event.target.value)} className={FIELD} placeholder="https://..." />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-extrabold text-sp-ink">X</span>
              {/* Sam uchwyt wystarczy - serwer sklada z niego adres x.com. */}
              <input value={twitterDraft} onChange={(event) => setTwitterDraft(event.target.value)} className={FIELD} placeholder="@handle" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-extrabold text-sp-ink">Telegram</span>
              <input value={telegramDraft} onChange={(event) => setTelegramDraft(event.target.value)} className={FIELD} placeholder="@channel" />
            </label>
          </div>
        </div>
      </div>
      <label className="mt-3 block">
        <span className="mb-1.5 block text-[12px] font-extrabold text-sp-ink">Description</span>
        <textarea rows={2} value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} className={FIELD} maxLength={280} />
      </label>
      {notice && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-[11.5px] font-bold ${notice.kind === 'success' ? 'bg-sp-up-soft text-sp-up' : 'bg-sp-danger-soft text-sp-danger'}`}>{notice.text}</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={busy} className="rounded-full bg-soft-primary px-4 py-2.5 text-[12.5px] font-extrabold text-sp-on-brand disabled:opacity-60">
          {busy ? 'Saving...' : 'Save profile'}
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="" className="h-10 w-10 rounded-xl object-cover" referrerPolicy="no-referrer" />}
      </div>
    </div>
  );
}
