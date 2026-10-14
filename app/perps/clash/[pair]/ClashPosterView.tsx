'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { Check, Link2, RefreshCw, Swords } from 'lucide-react';
import { sdk } from '@farcaster/miniapp-sdk';
import { ClashCard } from '../../../startpad/perps/ClashSection';
import { fetchLogos } from '../../../startpad/logos';
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from '../../../startpad/config';
import type { Clash } from '../../../startpad/duel';
import { buildClashShareText, buildClashUrl, shareIntentUrl, type ShareTarget } from '../../../startpad/shareText';
import { BrandMark, SHARE_BRANDS } from '../../../startpad/shareIcons';

/**
 * Zywa czesc plakatu pojedynku: karta walki z tablicy (`ClashCard`) i
 * przyciski udostepnienia.
 *
 * === DLACZEGO KARTA SIE DOCIAGA, A NIE JEST W HTML-U ===
 * /api/launchpad/clashes na zimnej instancji skanuje siedem launchpadow od ich
 * bloku startu - do minuty - i moze zwrocic 502. Serwerowa strona nie moze na
 * to czekac (crawler by nie poczekal), wiec naglowek i metadane powstaja bez
 * skanu, a ta czesc czyta pojedynek w przegladarce, z lagodnym stanem
 * ladowania i ponowieniem. Po pierwszym sukcesie odswieza sie cicho co 30 s,
 * tak jak tablica.
 *
 * Przyciski udostepnienia nie czekaja na odczyt: potrzebuja tylko adresow
 * tokenow i slow stron, ktore strona serwerowa juz zna.
 */

const POLL_MS = 30_000;
/** Zimny skan trwa do minuty; dluzej niz ~100 s nie ma po co trzymac zapytania. */
const FETCH_TIMEOUT_MS = 100_000;
/** Po tylu ms z rzedu bez odpowiedzi tekst ladowania uprzedza, ze to potrwa. */
const SLOW_AFTER_MS = 6_000;

/** Kolejnosc jak w menu tokena, bez Facebooka (nie ma tresci, tylko adres). */
const TARGETS: ShareTarget[] = ['x', 'farcaster', 'telegram', 'whatsapp', 'reddit', 'mysphere'];

const RISK_NOTE = 'Flash perps are 2x leveraged and can lose most of their value in a large move. Not financial advice.';

type Status = 'loading' | 'ready' | 'error';

type Props = {
  /** Adres strony 'a' i 'b' (male litery) - serwer juz sprawdzil, ze to para. */
  tokenA: string;
  tokenB: string;
  ticker: string;
  /** Slowa stron do tekstu posta: BULL / BEAR albo ETH / NVDA. */
  sideA: string;
  sideB: string;
};

export default function ClashPosterView({ tokenA, tokenB, ticker, sideA, sideB }: Props) {
  const [clash, setClash] = useState<Clash | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [round, setRound] = useState<string | undefined>(undefined);

  useEffect(() => {
    void fetchLogos(DEFAULT_LAUNCHPAD_CHAIN_ID).then(setLogos).catch(() => {});
  }, []);

  // Przelamywacz cache'u crawlerow: godzinne wiadro. Liczony PO montowaniu -
  // serwer i klient mialyby inny `Date.now()`, a to rozjezdza hydracje.
  useEffect(() => {
    setRound(Math.floor(Date.now() / 3_600_000).toString(36));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Flaga i kontroler zyja W TYM efekcie, a nie w refie: w trybie dev React
    // montuje efekt dwa razy, a wspolna flaga "w locie" kazalaby drugiemu
    // montowaniu pominac zapytanie, ktorego wynik pierwsze juz odrzucilo -
    // widok wisialby na ladowaniu bez konca (tak samo po "Try again").
    let busy = false;
    let controller: AbortController | null = null;

    const load = async (first: boolean) => {
      if (busy) return;
      busy = true;
      const own = new AbortController();
      controller = own;
      const timer = window.setTimeout(() => own.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`/api/launchpad/clashes?token=${tokenA}`, {
          signal: own.signal,
          headers: { accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`clashes ${res.status}`);
        const body = (await res.json()) as { clashes?: Clash[] };
        const found = (body.clashes ?? []).find(
          (c) => c.a?.address.toLowerCase() === tokenA && c.b?.address.toLowerCase() === tokenB
        );
        if (!found) throw new Error('pair not on the board');
        if (!cancelled) {
          setClash(found);
          setStatus('ready');
        }
      } catch {
        // Po udanym odczycie cichy blad odswiezania nie zabiera karty sprzed
        // chwili - pokazujemy ostatnia znana.
        if (!cancelled) setStatus((current) => (first || current !== 'ready' ? 'error' : current));
      } finally {
        window.clearTimeout(timer);
        busy = false;
      }
    };

    setStatus('loading');
    setSlow(false);
    const slowTimer = window.setTimeout(() => !cancelled && setSlow(true), SLOW_AFTER_MS);
    void load(true);
    const poll = window.setInterval(() => void load(false), POLL_MS);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearTimeout(slowTimer);
      window.clearInterval(poll);
    };
  }, [tokenA, tokenB, attempt]);

  const url = useMemo(() => buildClashUrl(tokenA, tokenB, round), [tokenA, tokenB, round]);
  const text = useMemo(() => buildClashShareText({ ticker, sideA, sideB }), [ticker, sideA, sideB]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Schowek bywa zablokowany - pokazujemy adres do recznego skopiowania.
      window.prompt('Copy this link', url);
    }
  }, [url]);

  // W miniappce Farcastera kompozytor jest na miejscu - okno przegladarki
  // wyrzucaloby czlowieka z aplikacji. Poza nia zostaje zwykly link.
  const onFarcaster = useCallback(
    async (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      try {
        if (await sdk.isInMiniApp()) {
          await sdk.actions.composeCast({ text, embeds: [url] });
          return;
        }
      } catch {
        // Nie w miniappce - schodzimy na zwykly adres.
      }
      window.open(shareIntentUrl('farcaster', { text, url }), '_blank', 'noopener,noreferrer');
    },
    [text, url]
  );

  return (
    <div className="mt-5">
      {status === 'ready' && clash ? (
        <ClashCard clash={clash} logos={logos} />
      ) : status === 'error' ? (
        <div className="rounded-[18px] border border-sp-shade/10 bg-sp-surface p-5 text-center" role="status">
          <p className="text-[14px] font-extrabold text-sp-ink">We could not read this fight just now.</p>
          <p className="mx-auto mt-1 max-w-[420px] text-[12.5px] leading-[1.5] text-sp-shade/60">
            The chain reader can be slow on a cold start. Nothing is wrong with the link.
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2.5 text-[13px] font-extrabold text-sp-on-brand"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        </div>
      ) : (
        <div className="rounded-[18px] border border-sp-shade/10 bg-sp-surface p-5" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-[13px] font-extrabold text-sp-ink">
            <Swords className="h-4 w-4 text-soft-primary" aria-hidden="true" /> Reading the fight from Base...
          </div>
          <div className="mt-4 h-9 rounded-full bg-sp-sunken motion-safe:animate-pulse" aria-hidden="true" />
          <div className="mt-4 grid grid-cols-2 gap-2.5" aria-hidden="true">
            <div className="h-28 rounded-[14px] bg-sp-sunken motion-safe:animate-pulse" />
            <div className="h-28 rounded-[14px] bg-sp-sunken motion-safe:animate-pulse" />
          </div>
          {slow && (
            <p className="mt-3 text-[12px] leading-[1.5] text-sp-shade/55">
              Still reading. A cold start can take up to a minute; this page will fill in by itself.
            </p>
          )}
        </div>
      )}

      <section className="mt-5 rounded-[18px] border border-sp-shade/10 bg-sp-surface p-4" aria-label="Share this fight">
        <h2 className="text-[14px] font-extrabold text-sp-ink">Share this fight</h2>
        <p className="mt-0.5 text-[12px] text-sp-shade/55">{text}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TARGETS.map((target) => {
            const href = shareIntentUrl(target, { text, url });
            const brand = SHARE_BRANDS[target];
            return (
              <a
                key={target}
                href={href}
                {...(target === 'mysphere' ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                onClick={target === 'farcaster' ? onFarcaster : undefined}
                className="inline-flex items-center gap-2 rounded-full border border-sp-shade/10 bg-sp-surface px-3.5 py-2 text-[12.5px] font-extrabold text-sp-ink transition-colors hover:border-soft-primary hover:text-sp-brand-deep"
              >
                <span style={{ color: target === 'x' ? 'rgb(var(--sp-ink))' : brand.color }} className="inline-flex">
                  <BrandMark target={target} size={16} />
                </span>
                {brand.label}
              </a>
            );
          })}
          <button
            type="button"
            onClick={() => void copy()}
            aria-live="polite"
            className="inline-flex items-center gap-2 rounded-full border border-sp-shade/10 bg-sp-surface px-3.5 py-2 text-[12.5px] font-extrabold text-sp-ink transition-colors hover:border-soft-primary hover:text-sp-brand-deep"
          >
            {copied ? <Check className="h-4 w-4 text-sp-up" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/perps/?tab=clash" className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-sp-brand-deep hover:underline">
          <Swords className="h-4 w-4" aria-hidden="true" /> All duels
        </Link>
      </div>
      <p className="mt-3 text-[11.5px] leading-[1.5] text-sp-shade/50">{RISK_NOTE}</p>
    </div>
  );
}
