'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, ChevronLeft, Megaphone, Share2, Trophy } from 'lucide-react';
import PerpAvatar from '../perps/PerpAvatar';

/**
 * CALLS: kupno z wiadomoscia jako prognoza z wynikiem. Wiadomosc, cena wejscia
 * i portfel sa na lancuchu, wynik liczy /api/launchpad/calls (cena teraz /
 * srednia cena wejscia). Plakietka "Verified human" = Coinbase Verification.
 */

export type Call = {
  txHash: string;
  token: string;
  symbol: string;
  marketId: string | null;
  quoteSymbol: string;
  buyer: string;
  verified: boolean;
  message: string;
  paid: number;
  multiple: number | null;
  ts: number;
};
type Leader = { buyer: string; verified: boolean; calls: number; best: number };

const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

function ago(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtMultiple(m: number | null): string {
  if (m === null) return '--';
  if (m >= 10) return `${m.toFixed(0)}x`;
  return `${m.toFixed(2)}x`;
}

function tokenHref(c: Call) {
  return `/startpad/${c.token.toLowerCase()}${c.marketId ? `?m=${encodeURIComponent(c.marketId)}` : ''}`;
}

function shareUrl(c: Call): string {
  const pct = c.multiple !== null ? `${c.multiple >= 1 ? '+' : ''}${((c.multiple - 1) * 100).toFixed(0)}%` : '';
  const text = `My call on $${c.symbol}: "${c.message}"\n${pct ? `${pct} since I bought. ` : ''}Onchain, can't fake it.\n\nhttps://mysphere.fun${tokenHref(c)}`;
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

export default function CallsBoard() {
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [humansOnly, setHumansOnly] = useState(false);
  const [sort, setSort] = useState<'best' | 'new'>('best');

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/launchpad/calls')
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { calls?: Call[]; leaders?: Leader[] } | null) => {
          if (cancelled) return;
          setCalls(body?.calls ?? []);
          setLeaders(body?.leaders ?? []);
        })
        .catch(() => {
          if (!cancelled) setCalls((c) => c ?? []);
        });
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const visible = useMemo(() => {
    const list = (calls ?? []).filter((c) => !humansOnly || c.verified);
    return sort === 'new' ? [...list].sort((a, b) => b.ts - a.ts) : list;
  }, [calls, humansOnly, sort]);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6">
      <Link href="/startpad" className="inline-flex items-center gap-1 text-[12px] font-bold text-sp-shade/50 hover:text-soft-primary-deep">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Startpad
      </Link>
      <h1 className="mt-1 flex items-center gap-2 font-soft-display text-[28px] font-extrabold leading-tight text-sp-ink">
        <Megaphone className="h-7 w-7 text-soft-primary" aria-hidden="true" /> Calls
      </h1>
      <p className="mt-1 max-w-[620px] text-[13px] leading-[1.5] text-sp-shade/60">
        Every buy with a message is a call. The message, the entry price and the wallet are onchain, so the score below can&apos;t be faked or
        screenshotted. Make a call: buy any Startpad token and say something.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-sp-shade/10 bg-sp-surface p-1">
              {(
                [
                  ['best', 'Best calls'],
                  ['new', 'Latest'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-extrabold ${sort === key ? 'bg-soft-primary text-sp-on-brand' : 'text-sp-shade/55 hover:text-sp-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setHumansOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-extrabold ${humansOnly ? 'border-sp-up bg-sp-up/10 text-sp-up' : 'border-sp-shade/10 text-sp-shade/55'}`}
            >
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified humans only
            </button>
          </div>

          {calls === null ? (
            <p className="mt-4 text-[13px] text-sp-shade/45">Reading calls from Base...</p>
          ) : visible.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-dashed border-sp-shade/20 px-5 py-10 text-center text-[13px] text-sp-shade/55">
              No calls yet{humansOnly ? ' from verified humans' : ''}. Buy a token with a message and you are on the board.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {visible.map((c) => (
                <CallCard key={`${c.txHash}-${c.token}`} call={c} />
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-[18px] border border-sp-shade/10 bg-sp-surface p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-sp-ink">
            <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" /> Top callers (7 days)
          </h2>
          {leaders.length === 0 ? (
            <p className="mt-3 text-[12px] text-sp-shade/45">Nobody yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {leaders.map((l, i) => (
                <li key={l.buyer} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-5 text-right font-extrabold text-sp-shade/40">{i + 1}</span>
                    <a href={`https://basescan.org/address/${l.buyer}`} target="_blank" rel="noreferrer" className="truncate font-bold text-sp-ink hover:text-soft-primary-deep">
                      {short(l.buyer)}
                    </a>
                    {l.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sp-up" aria-label="Coinbase verified" />}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`font-extrabold ${l.best >= 1 ? 'text-sp-up' : 'text-sp-down-deep'}`}>{fmtMultiple(l.best)}</span>
                    <span className="ml-1 text-[10.5px] text-sp-shade/40">{l.calls} calls</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-[10.5px] leading-[1.45] text-sp-shade/45">
            Score = price now / average entry price, in the token&apos;s market currency (ETH or the perp). ✓ = Coinbase verified wallet (EAS on Base).
          </p>
        </aside>
      </div>
    </div>
  );
}

export function CallCard({ call }: { call: Call }) {
  const up = (call.multiple ?? 1) >= 1;
  return (
    <div className="flex flex-col rounded-[18px] border border-sp-shade/10 bg-sp-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={tokenHref(call)} className="flex min-w-0 items-center gap-2">
          {call.marketId ? <PerpAvatar symbol={call.quoteSymbol} size={22} /> : null}
          <span className="truncate text-[15px] font-extrabold text-sp-ink">${call.symbol}</span>
          {call.marketId && <span className="rounded-full bg-sp-brand/10 px-2 py-0.5 text-[9.5px] font-extrabold uppercase text-sp-brand">on {call.quoteSymbol}</span>}
        </Link>
        <span className={`text-[22px] font-extrabold ${up ? 'text-sp-up' : 'text-sp-down-deep'}`}>{fmtMultiple(call.multiple)}</span>
      </div>
      <p className="mt-3 rounded-[14px] bg-sp-sunken px-3.5 py-2.5 text-[14px] font-bold leading-[1.4] text-sp-ink">“{call.message}”</p>
      <div className="mt-3 flex items-center justify-between text-[11.5px] text-sp-shade/50">
        <span className="flex items-center gap-1.5">
          {short(call.buyer)}
          {call.verified && (
            <span className="inline-flex items-center gap-0.5 font-extrabold text-sp-up">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> human
            </span>
          )}
        </span>
        <span>
          {call.paid.toLocaleString('en-US', { maximumSignificantDigits: 3 })} {call.quoteSymbol} · {ago(call.ts)}
        </span>
      </div>
      <a href={shareUrl(call)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full border border-sp-shade/10 px-3 py-1.5 text-[12px] font-extrabold text-sp-ink hover:border-soft-primary">
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Share this call
      </a>
    </div>
  );
}
