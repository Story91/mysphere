import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import Link from 'next/link';
import { getTokenDetail, type TokenDetail } from '../../utils/b20/token';
import { tokenInitials, uniswapBuyUrl } from '../../utils/b20/format';
import B20Nav from '../B20Nav';
import PriceChart from './PriceChart';
import OpenPoolPanel from './OpenPoolPanel';

/**
 * /b20/[address] - strona jednego tokena B20.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Lista na /b20 linkowala tu od poczatku, ale trasy NIE BYLO - kazde klikniecie
 * w token konczylo sie niczym. To ten sam blad co strona bez odnosnika, tylko
 * odwrotnie: odnosnik bez strony.
 *
 * ===========================================================================
 * SKAD DANE - DWA ROZNE ZRODLA I TO WIDAC
 * ===========================================================================
 * Z LANCUCHA: nazwa, symbol, podaz, sufit podazy. To sa fakty o tokenie i
 * czytamy je sami.
 *
 * Z GECKOTERMINAL: cena, wolumen, kapitalizacja i swiece. Tego nie liczymy -
 * i strona mowi o tym pod wykresem, zamiast pozwolic zalozyc, ze policzylismy.
 *
 * Token bez puli nie ma ceny ANI wykresu. Nie rysujemy wtedy plaskiej linii
 * na zerze, bo brak notowan to nie jest cena zero.
 *
 * ===========================================================================
 * SUFIT PODAZY JEST TU NAJWAZNIEJSZA LICZBA
 * ===========================================================================
 * B20 wymusza sufit podazy w SIECI, nie w opisie - wiec da sie odczytac, czy
 * ktos moze jeszcze dodrukowac ten token. Przy zwyklym ERC-20 sie nie da,
 * a to jest pierwsza rzecz, ktora powinien wiedziec kupujacy. Dlatego stoi
 * wysoko i jest opisana zdaniem, a nie sama liczba.
 */

export const revalidate = 60;

type Props = { params: { address: string } };

const CARD = 'rounded-card border border-soft-line bg-soft-surface shadow-card';

/* -------------------------------------------------------------------------- */

function fmtUsd(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value === 0) return '$0';
  return `$${value.toPrecision(3)}`;
}

/** Podaz w postaci czytelnej: 1 000 000 000 zamiast 1e27 jednostek bazowych. */
function fmtSupply(raw: string | null, decimals: number): string | null {
  if (!raw) return null;
  try {
    const whole = BigInt(raw) / 10n ** BigInt(decimals);
    return Number(whole).toLocaleString('en-US');
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await getTokenDetail(params.address);
  if (!result.ok) return { title: 'Token not found · B20' };

  const t = result.token;
  const label = t.symbol ? `${t.name ?? t.symbol} (${t.symbol})` : 'B20 token';
  const price = fmtUsd(t.quote?.priceUsd ?? null);

  return pageMeta({
    title: price ? `${label} · ${price}` : `${label} · B20 on Base`,
    description: `${label} is a B20 token on Base. Supply, cap, pool and price, read from the chain.`,
    image: '/b20/opengraph-image',
  });
}

/* -------------------------------------------------------------------------- */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint">
        {label}
      </dt>
      <dd className="mt-0.5 font-soft-display text-[16px] font-bold tabular-nums text-soft-ink">
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-[11px] leading-[1.4] text-soft-ink-faint">{hint}</p>}
    </div>
  );
}

function SupplyPanel({ token }: { token: TokenDetail }) {
  const total = fmtSupply(token.totalSupply, token.decimals);
  const cap = fmtSupply(token.supplyCap, token.decimals);
  const capIsZero = token.supplyCap === '0';

  /**
   * Trzy rozne zdania dla trzech roznych faktow. `null` to NIE to samo co zero:
   * pierwsze znaczy "nie odczytalismy", drugie "sufitu nie ma".
   */
  let verdict: string;
  if (token.supplyCap === null) {
    verdict = 'We could not read the supply cap for this token.';
  } else if (capIsZero) {
    verdict = 'No supply cap is set, so whoever holds the mint role can still make more.';
  } else if (cap && total && cap === total) {
    verdict = 'The cap equals the supply: every token that will ever exist already does.';
  } else {
    verdict = `Capped at ${cap}. Nothing above that can ever be minted.`;
  }

  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <h2 className="font-soft-display text-[15px] font-bold text-soft-ink">Supply</h2>
      <dl className="mt-3 grid grid-cols-2 gap-4">
        <Stat label="Total supply" value={total ?? '—'} />
        <Stat label="Cap" value={capIsZero ? 'none' : (cap ?? '—')} />
      </dl>
      <p className="mt-3 border-t border-soft-line pt-2.5 text-[12.5px] leading-[1.55] text-soft-ink-muted">
        {verdict}
      </p>
      {/* Zdanie o standardzie, bo to jest przewaga B20 nad ERC-20 i wiekszosc
          ludzi jej nie zna: sufit egzekwuje siec, nie obietnica autora. */}
      <p className="mt-2 text-[11px] leading-[1.5] text-soft-ink-faint">
        On B20 the cap is enforced by Base itself, not by a promise in the token’s description.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export default async function TokenPage({ params }: Props) {
  const result = await getTokenDetail(params.address);

  if (!result.ok) {
    return (
      <div className="min-h-screen bg-soft-bg px-4 pb-24 pt-6 font-soft sm:pt-10">
        <div className="mx-auto w-full max-w-[1120px]">
          <B20Nav active="market" />
          <section className={`${CARD} mt-4 p-4 sm:p-5`}>
            <h1 className="font-soft-display text-[18px] font-bold text-soft-ink">
              {result.reason === 'unreadable' ? 'We could not read Base just now' : 'Nothing here'}
            </h1>
            <p className="mt-1.5 text-[13px] leading-[1.55] text-soft-ink-muted">{result.message}</p>
            <Link
              href="/b20"
              className="mt-3 inline-flex rounded-pill bg-soft-primary px-4 py-2 font-soft-display text-[12.5px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
            >
              Back to the market
            </Link>
          </section>
        </div>
      </div>
    );
  }

  const t = result.token;
  const price = fmtUsd(t.quote?.priceUsd ?? null);
  const fdv = fmtUsd(t.quote?.fdvUsd ?? null);
  const vol = fmtUsd(t.quote?.volume24hUsd ?? null);
  const liq = fmtUsd(t.quote?.reserveUsd ?? null);
  const hasMarket = Boolean(t.quote?.poolId);

  return (
    <div className="min-h-screen bg-soft-bg px-4 pb-24 pt-6 font-soft sm:pt-10">
      <div className="mx-auto w-full max-w-[1120px]">
        <B20Nav active="market" />

        {/* ===== NAGLOWEK ===== */}
        <header className={`${CARD} mt-4 p-4 sm:p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {/* Awatar z GeckoTerminal, a bez niego inicjaly - pusty kwadrat
                  czytalby sie jak nieudane ladowanie obrazka. */}
              {t.quote?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.quote.imageUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-full bg-soft-sunken object-cover sm:h-16 sm:w-16"
                />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-soft-sunken font-soft-display text-[18px] font-bold text-soft-ink-muted sm:h-16 sm:w-16">
                  {tokenInitials(t.symbol ?? '', t.name ?? '')}
                </span>
              )}
            <div className="min-w-0">
              <h1 className="font-soft-display text-[24px] font-bold leading-[1.2] text-soft-ink sm:text-[30px]">
                {t.name ?? 'Unnamed token'}
              </h1>
              <p className="mt-0.5 font-soft-display text-[14px] font-bold text-soft-ink-muted">
                {t.symbol ?? '—'}
              </p>
            </div>
            </div>
            {price && (
              <div className="text-right">
                <p className="font-soft-display text-[24px] font-bold tabular-nums text-soft-ink">
                  {price}
                </p>
                <p className="text-[11px] text-soft-ink-faint">per token</p>
              </div>
            )}
          </div>

          <p className="mt-3 break-all font-mono text-[11.5px] leading-[1.5] text-soft-ink-faint">
            {t.address}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {/* KUPNO JAKO PIERWSZA AKCJA. To sa prawdziwe pule Uniswap v4 na
                Base, wiec kupic da sie juz dzis - brakowalo tylko drogi.
                Przycisk pojawia sie WYLACZNIE przy tokenie z pula: bez niej
                Uniswap odpowiedzialby "no route", czyli obiecalibysmy czynnosc
                niemozliwa i odeslali czlowieka do cudzego bledu. */}
            {hasMarket && (
              <a
                href={uniswapBuyUrl(t.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-pill bg-soft-primary px-5 py-2.5 font-soft-display text-[13.5px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
              >
                Buy on Uniswap ↗
              </a>
            )}
            <a
              href={`https://basescan.org/token/${t.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-pill border border-soft-line px-3 py-1.5 font-soft-display text-[12px] font-semibold text-soft-ink-muted transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-ink active:scale-[0.97]"
            >
              Basescan ↗
            </a>
            {hasMarket && (
              <a
                href={`https://www.geckoterminal.com/base/pools/${t.quote!.poolId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-pill border border-soft-line px-3 py-1.5 font-soft-display text-[12px] font-semibold text-soft-ink-muted transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-ink active:scale-[0.97]"
              >
                Trade ↗
              </a>
            )}
          </div>
        </header>

        {/* ===== DWIE KOLUMNY OD lg =====
            Na telefonie wszystko idzie jedno pod drugim, ale na desktopie
            jedna waska kolumna posrodku ekranu wyglada jak strona mobilna
            rozciagnieta na monitor. Wykres i liczby rynkowe to jedna mysl
            ("ile to kosztuje i ile sie tym handluje"), podaz to druga
            ("ile tego jest i czy przybedzie") - wiec dziela sie naturalnie.

            Kolumny 3:2, bo wykres potrzebuje szerokosci, a panel podazy to
            dwie liczby i zdanie. */}
        <div className="mt-3 grid gap-3 lg:grid-cols-5">
          <div className="lg:col-span-3">
        {/* ===== WYKRES ALBO UCZCIWE ZDANIE ZAMIAST NIEGO ===== */}
        <section className={`${CARD} p-4 sm:p-5`}>
          {t.candles && t.candles.length > 1 ? (
            <PriceChart candles={t.candles} />
          ) : (
            <>
              <h2 className="font-soft-display text-[15px] font-bold text-soft-ink">No market yet</h2>
              <p className="mt-1.5 text-[12.5px] leading-[1.55] text-soft-ink-muted">
                Nobody has opened a pool for this token, so it has no price and nothing to chart.
                This is where most tokens made on Base stay.
              </p>
              {/* Zdanie o pustce jest prawdziwe, ale samo w sobie zostawia
                  czlowieka bez wyjscia. Panel obok daje mu je: pule moze
                  otworzyc kazdy i wtedy token dostaje cene, wykres i przycisk
                  kupna, ktore ta strona juz umie pokazac. */}
              <OpenPoolPanel address={t.address} />
            </>
          )}
        </section>

            {/* ===== LICZBY RYNKOWE - tylko gdy rynek istnieje ===== */}
            {hasMarket && (
              <section className={`${CARD} mt-3 p-4 sm:p-5`}>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Stat label="24h volume" value={vol ?? '—'} />
                  <Stat label="Liquidity" value={liq ?? '—'} />
                  <Stat label="Fully diluted" value={fdv ?? '—'} hint="price × total supply" />
                </dl>
              </section>
            )}
          </div>

          <div className="lg:col-span-2">
            <SupplyPanel token={t} />
          </div>
        </div>

        {/* Braki nazwane, zeby zadna pusta kratka nie czytala sie jak zero. */}
        {t.notes.length > 0 && (
          <p className="mt-3 px-1 text-[11.5px] leading-[1.5] text-soft-ink-faint">
            {t.notes.join(' ')}
          </p>
        )}

        <p className="mt-4 px-1 text-[11.5px] leading-[1.5] text-soft-ink-faint">
          Supply and cap are read from Base.{' '}
          <Link href="/b20" className="font-semibold text-soft-primary-deep underline underline-offset-2">
            All B20 tokens
          </Link>
        </p>
      </div>
    </div>
  );
}
