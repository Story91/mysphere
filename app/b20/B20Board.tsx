'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { B20Token, BoardSnapshot, MarketState } from '../utils/b20/market';
import {
  describeMove,
  formatAge,
  formatEthPrice,
  formatReadAge,
  formatUsdAmount,
  formatUsdPrice,
  shortAddress,
} from '../utils/b20/format';

/**
 * RYNEK B20 - lista, na ktora czlowiek wchodzi i od razu widzi, co sie dzieje.
 *
 * ===========================================================================
 * DLACZEGO TO NIE JEST TABELA
 * ===========================================================================
 * Wzorzec z clanker.world ma dziewiec kolumn: Token, Creator, By, Created At,
 * 1h, 6h, 24h, Volume, MCap. Na 360 px nie miesci sie ani jedna z nich w calosci,
 * a zwezenie czcionki tego nie naprawia - naprawia tylko wyglad zrzutu ekranu.
 *
 * Kazdy wiersz jest wiec KARTA o stalym ukladzie wewnetrznym, ktora przy szerokim
 * ekranie rozklada sie w rzad, a przy waskim skleja w pion. Ten sam znacznik,
 * ta sama tresc, zero ukrywania kolumn na telefonie. Kolumny, ktorych clanker
 * ma trzy (1h, 6h, 24h), nie ma tu w ogole - dla tokena mlodszego niz doba sa
 * niedefiniowane i w praktyce pokazuja siatke zer.
 *
 * ===========================================================================
 * ZIELEN I CZERWIEN - ROZSTRZYGNIETE: NIE MA ICH TU
 * ===========================================================================
 * Zaden z czterech porownanych serwisow nie rozroznia kierunku inaczej niz
 * kolorem. My nie, i to jest decyzja, nie ustepstwo wobec palety:
 *
 * 1. Kolor, ktory dotyka 4% wierszy, jest szumem, a nie sygnalem. Zmierzone:
 *    22 z 504 tokenow ma jakikolwiek ruch ceny. Reszta nie ma czego kolorowac.
 * 2. Kolor jako JEDYNY nosnik kierunku wypada u okolo 8% mezczyzn (deuteranopia)
 *    i w monochromie. Glif A/V czyta sie tak samo szybko i wszedzie.
 * 3. Paleta ma jedna rzecz do powiedzenia pomaranczem - KWOTE. Procent zmiany
 *    kwota nie jest, wiec dostaje soft-ink. Gdyby dostal wlasny kolor, zwrot
 *    stalby sie najjasniejsza rzecza w wierszu i produkt zaczalby go sprzedawac.
 *
 * ===========================================================================
 * TRZY STANY MAJA TRZY ROZNE KSZTALTY WIERSZA
 * ===========================================================================
 *   traded    rzad z cena i ruchem + wolumen               (dwa rzedy liczb)
 *   listed    jedno zdanie "no trades yet" + cena otwarcia (jeden rzad, cieńszy)
 *   unlisted  sama etykieta, ZERO miejsca na liczbe        (brak rzedu liczb)
 *
 * Roznica jest widoczna w monochromie i przy 360 px, bo niesie ja UKLAD, a nie
 * barwa. Przy tokenie bez puli nie ma pustego pola do gapienia sie - brak ceny
 * przestaje byc brakiem, bo nie ma miejsca, w ktorym cena mialaby stac.
 */

type Segment = 'traded' | 'listed' | 'unlisted' | 'all';
type Sort = 'volume' | 'move' | 'newest';

const CARD = 'rounded-card border border-soft-line bg-soft-surface shadow-card';

/**
 * Ile wierszy rysujemy od razu.
 *
 * Zakladka "Just launched" ma ~500 pozycji. Narysowanie ich wszystkich to okolo
 * 3500 wezlow DOM, ktore nikt nie przewinie - a przewijanie na telefonie zaczyna
 * sie ciac. Reszta czeka za przyciskiem i jest juz w pamieci, wiec dolozenie
 * kosztuje zero zapytan.
 */
const PAGE = 60;

/* -------------------------------------------------------------------------- */
/*  POJEDYNCZY WIERSZ                                                          */
/* -------------------------------------------------------------------------- */

function StatePill({ state }: { state: MarketState }) {
  const text =
    state === 'traded' ? 'has traded' : state === 'listed' ? 'pool open' : 'no pool';
  return (
    <span className="inline-flex shrink-0 items-center rounded-pill border border-soft-line bg-soft-sunken px-2 py-[3px] font-soft-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-soft-ink-muted">
      {text}
    </span>
  );
}

function TokenRow({
  token,
  ethUsd,
  now,
  index,
}: {
  token: B20Token;
  ethUsd: number | null;
  now: number;
  index: number;
}) {
  const priceUsd =
    token.pool && ethUsd !== null ? formatUsdPrice(token.pool.priceEth * ethUsd) : null;
  const priceEth = token.pool ? formatEthPrice(token.pool.priceEth) : null;
  const launchUsd =
    token.pool && ethUsd !== null ? formatUsdPrice(token.pool.launchPriceEth * ethUsd) : null;
  const launchEth = token.pool ? formatEthPrice(token.pool.launchPriceEth) : null;
  const move = token.pool ? describeMove(token.pool.moveSinceLaunch) : null;
  const volume = token.quoted ? formatUsdAmount(token.quoted.volume24hUsd) : null;
  /**
   * Ile realnie stoi w puli. Liczba z GeckoTerminal, a NIE plynnosc odczytana
   * z lancucha - ta ostatnia podaje plynnosc w biezacym tiku i dla swiezo
   * zasilonych pul czyta sie jako zero, czyli klamie w dol.
   *
   * To jest odpowiedz na pytanie "czy da sie tu w ogole wyjsc": pula za
   * czterdziesci dolarow i pula za czterdziesci tysiecy wygladaja w kolumnie
   * wolumenu tak samo, a nie sa tym samym.
   */
  const liquidity = token.quoted ? formatUsdAmount(token.quoted.reserveUsd) : null;

  return (
    <li
      className="b20-row border-b border-soft-line last:border-b-0"
      // Wejscie wiersza schodkowo, ale tylko dla pierwszego ekranu - opoznienie
      // rosnace w nieskonczonosc znaczyloby, ze ostatni wiersz pojawia sie po
      // minucie. Ruch idzie po transform i opacity, wiec nie przelicza ukladu.
      style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}
    >
      <Link
        href={`/b20/${token.address}`}
        className="block px-3.5 py-3 transition-colors [transition-duration:var(--dur-press)] hover:bg-soft-sunken focus-visible:bg-soft-sunken focus-visible:outline-none sm:px-4"
      >
        {/* Rzad 1: kto to jest. Na waskim ekranie ticker i wiek stoja obok
            siebie, bo to jedyne dwie rzeczy czytane przed decyzja o czytaniu
            dalej. */}
        <div className="flex items-baseline gap-2">
          <span className="font-soft-display text-[15px] font-bold leading-tight text-soft-ink">
            {token.symbol || 'unnamed'}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] leading-tight text-soft-ink-muted">
            {token.name || 'no name in the creation event'}
          </span>
          <span className="shrink-0 text-[11.5px] tabular-nums text-soft-ink-faint">
            {formatAge(token.createdAt, now)}
          </span>
        </div>

        {/* Rzad 2: LICZBY - i to on rozroznia trzy stany ksztaltem. */}
        {token.state === 'traded' && (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {priceUsd || priceEth ? (
              <span className="font-soft-display text-[15px] font-bold tabular-nums text-soft-accent-deep">
                {priceUsd ?? priceEth}
              </span>
            ) : (
              <span className="text-[12.5px] italic text-soft-ink-faint">
                price could not be read
              </span>
            )}
            {move && (
              <span className="text-[12.5px] tabular-nums text-soft-ink">
                <span aria-hidden="true">{move.glyph}</span>{' '}
                <span className={move.glyph === '–' ? 'text-soft-ink-faint' : 'font-semibold'}>
                  {move.label}
                </span>
                <span className="text-soft-ink-faint"> since launch</span>
              </span>
            )}
            <span className="text-[12.5px] text-soft-ink-muted">
              {volume !== null ? (
                <>
                  <span className="font-semibold tabular-nums text-soft-accent-deep">{volume}</span>{' '}
                  traded in 24h
                </>
              ) : (
                // PUSTKA, NIE ZERO. GeckoTerminal nie podal liczby - to nie
                // znaczy, ze wolumen wynosi zero.
                <span className="text-soft-ink-faint">24h volume not quoted</span>
              )}
            </span>
            {liquidity !== null && (
              <span className="text-[12.5px] text-soft-ink-muted">
                <span className="font-semibold tabular-nums text-soft-accent-deep">{liquidity}</span>{' '}
                in the pool
              </span>
            )}
          </div>
        )}

        {token.state === 'listed' && (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] leading-tight">
            <span className="text-soft-ink-muted">No trades yet.</span>
            {launchUsd || launchEth ? (
              <span className="text-soft-ink-faint">
                Pool opened at{' '}
                <span className="tabular-nums text-soft-ink-muted">{launchUsd ?? launchEth}</span> and
                the price has not moved since.
              </span>
            ) : (
              <span className="text-soft-ink-faint">
                The pool is open but we could not read its price.
              </span>
            )}
          </div>
        )}

        {token.state === 'unlisted' && (
          // Zaden rzad liczbowy. Nie ma pustego pola, wiec nie ma czego czytac
          // jako zera.
          <p className="mt-1.5 text-[12.5px] leading-tight text-soft-ink-faint">
            Not listed — we see no Uniswap v4 pool against ETH for this token.
          </p>
        )}

        {/* Rzad 3: skad to sie wzielo. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] leading-tight text-soft-ink-faint">
          <StatePill state={token.state} />
          <span className="tabular-nums">{shortAddress(token.address)}</span>
          <span aria-hidden="true">·</span>
          {token.creator ? (
            <span>
              made by <span className="tabular-nums">{shortAddress(token.creator)}</span>
            </span>
          ) : (
            // NIE ZGADUJEMY. Dla ~12% tokenow transakcje sklada bundler
            // ERC-4337 albo nieznany kontrakt, wiec tx.from to automat.
            <span>unknown creator</span>
          )}
        </div>
      </Link>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  NAGLOWEK Z POMIAREM                                                        */
/* -------------------------------------------------------------------------- */

function BoardHeadline({ snapshot, now }: { snapshot: BoardSnapshot; now: number }) {
  const { counts } = snapshot;
  const share = counts.total > 0 ? (counts.traded / counts.total) * 100 : 0;

  return (
    <div className={`${CARD} mb-3 p-4 sm:p-5`}>
      <h2 className="font-soft-display text-[17px] font-bold leading-tight text-soft-ink sm:text-[19px]">
        {counts.total.toLocaleString('en-US')} B20 tokens were created on Base in the last{' '}
        {snapshot.windowHours} hours
      </h2>

      {/* Zdanie, ktorego nie napisze zaden launchpad - bo cmentarz zabija
          konwersje. Piszemy je, bo produkt, ktory nie chwali sie tym, czego nie
          ma, musi tez nie chowac tego, co jest. */}
      <p className="mt-1.5 text-[13px] leading-[1.55] text-soft-ink-muted">
        <span className="font-semibold text-soft-ink">{counts.traded}</span> of them have been
        traded at least once.{' '}
        <span className="font-semibold text-soft-ink">{counts.listed}</span> opened a pool that
        nobody has touched, and{' '}
        <span className="font-semibold text-soft-ink">{counts.unlisted}</span> have no pool at all.
      </p>

      <div className="mt-3">
        <div
          className="h-2 w-full overflow-hidden rounded-pill bg-soft-sunken"
          role="img"
          aria-label={`${share.toFixed(1)} percent of tokens created in this window have traded`}
        >
          {/* Pasek w soft-primary, nie w czerwieni. To nie jest ostrzezenie,
              tylko pomiar - i ma sie tak czytac. */}
          <div
            className="h-full rounded-pill bg-soft-primary transition-[width] [transition-duration:var(--dur-sheet)] ease-out-strong"
            style={{ width: `${Math.max(share, 0.6)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11.5px] tabular-nums text-soft-ink-faint">
          {share.toFixed(1)}% of what was created here has a market.
        </p>
      </div>

      <p className="mt-3 text-[11.5px] leading-[1.5] text-soft-ink-faint">
        Counted from the creation events the B20 factory emits, and from the Uniswap v4 pool each
        token opened. A token counts as traded when the pool price differs from the price it opened
        at — in v4 that can only happen through a swap. Read at block{' '}
        <span className="tabular-nums">{snapshot.headBlock.toLocaleString('en-US')}</span>,{' '}
        {formatReadAge(snapshot.readAt, now)}.
      </p>

      {snapshot.notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {snapshot.notes.map((note) => (
            <li key={note} className="text-[11.5px] italic leading-[1.5] text-soft-ink-faint">
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TABLICA                                                                    */
/* -------------------------------------------------------------------------- */

export default function B20Board({ initial }: { initial: BoardSnapshot }) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot>(initial);
  /** Migawka, ktora przyszla, ale czeka - patrz komentarz przy adopt(). */
  const [pending, setPending] = useState<BoardSnapshot | null>(null);
  const [segment, setSegment] = useState<Segment>('traded');
  const [sort, setSort] = useState<Sort>('volume');
  const [limit, setLimit] = useState(PAGE);
  /**
   * Szukanie. Filtruje LOKALNIE po nazwie, symbolu i adresie - zero zapytan,
   * odpowiedz przy kazdym nacisnieciu klawisza.
   *
   * Ale wazniejsze jest to, co robi z WKLEJONYM ADRESEM. Lista pokazuje okno
   * dwudziestu czterech godzin, wiec token sprzed dwoch dni w niej NIE ISTNIEJE
   * - a jego strona dziala dla kazdego adresu, bo `getTokenDetail` czyta token
   * wprost, bez okna. Wklejony adres daje wiec wejscie do tokena, ktorego lista
   * nie zna, zamiast pustego wyniku i sciany.
   */
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [failing, setFailing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* --- zegar tylko do napisow "4h", "read 2 minutes ago" --- */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);

  /* --- odswiezanie: JEDNO zapytanie do nas, nigdy do lancucha --- */
  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/b20/board', { cache: 'no-store' });
      if (!res.ok) {
        setFailing(true);
        return;
      }
      const next = (await res.json()) as BoardSnapshot;
      if (!next.ok) {
        setFailing(true);
        return;
      }
      setFailing(false);
      // Tresc skaczaca pod czytajacym palcem jest gorsza niz tresc o minute
      // stara. Gdy ktos jest na samej gorze, nic mu nie ucieknie i podmieniamy
      // od razu; gdy przewinal, nowa migawka czeka za pigulka, ktora dotknie sam.
      if (window.scrollY < 8) {
        setSnapshot(next);
        setPending(null);
      } else {
        setPending(next);
      }
    } catch {
      setFailing(true);
    }
  }, []);

  useEffect(() => {
    /**
     * 45 s, i pauza gdy karta jest schowana. Migawka na serwerze i tak zyje
     * 60 s, wiec czestsze pytanie nie dalo by nowszych liczb - dalo by tylko
     * wiecej ruchu.
     */
    const tick = () => {
      timer.current = setTimeout(() => {
        if (!document.hidden) void poll();
        tick();
      }, 45_000);
    };
    tick();
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);

  const newCount = useMemo(() => {
    if (!pending) return 0;
    const known = new Set(snapshot.tokens.map((t) => t.address));
    return pending.tokens.filter((t) => !known.has(t.address)).length;
  }, [pending, snapshot]);

  /** Wklejony adres B20 - wtedy zamiast filtrowac, proponujemy wejscie. */
  const pastedAddress = useMemo(() => {
    const q = query.trim().toLowerCase();
    return /^0xb2000000000000000000[0-9a-f]{20}$/.test(q) ? q : null;
  }, [query]);

  const rows = useMemo(() => {
    const pool =
      segment === 'all' ? snapshot.tokens : snapshot.tokens.filter((t) => t.state === segment);

    const q = query.trim().toLowerCase();
    const matched = q
      ? pool.filter(
          (t) =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.address.includes(q)
        )
      : pool;

    const list = [...matched];
    if (segment === 'traded') {
      if (sort === 'volume') {
        // Tokeny bez cytatu ida na dol, ale NIE jako zero - jako "nie podano".
        // Sortowanie nie ma prawa zamienic braku pomiaru w pomiar.
        list.sort((a, b) => {
          const av = a.quoted?.volume24hUsd;
          const bv = b.quoted?.volume24hUsd;
          if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
          if (bv === null || bv === undefined) return -1;
          return bv - av;
        });
      } else if (sort === 'move') {
        list.sort(
          (a, b) =>
            Math.abs(b.pool?.moveSinceLaunch ?? 0) - Math.abs(a.pool?.moveSinceLaunch ?? 0)
        );
      }
    }
    return list;
  }, [snapshot, segment, sort, query]);

  const visible = rows.slice(0, limit);

  const tabs: { id: Segment; label: string; count: number }[] = [
    { id: 'traded', label: 'Traded', count: snapshot.counts.traded },
    { id: 'listed', label: 'Never traded', count: snapshot.counts.listed },
    { id: 'unlisted', label: 'No pool', count: snapshot.counts.unlisted },
    { id: 'all', label: 'Everything', count: snapshot.counts.total },
  ];

  return (
    <div>
      <BoardHeadline snapshot={snapshot} now={now} />

      {/* --- SZUKANIE ---
          Stoi NAD zakladkami, bo szukanie konkretnego tokena jest czynnoscia
          pierwotna wobec przegladania kategorii: kto wie, czego szuka, nie
          powinien najpierw wybierac zakladki. */}
      <div className="mb-3">
        <label className="relative block">
          <span className="sr-only">Search tokens</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, ticker or paste an address"
            spellCheck={false}
            className="w-full rounded-pill border border-soft-line bg-soft-surface px-4 py-2.5 font-soft text-[13.5px] text-soft-ink shadow-chip outline-none transition-[border-color] [transition-duration:var(--dur-press)] ease-out-strong placeholder:text-soft-ink-faint focus:border-soft-primary focus-visible:ring-2 focus-visible:ring-soft-primary"
          />
          {query !== '' && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-pill px-2.5 py-1 font-soft-display text-[12px] font-bold text-soft-ink-faint transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-ink active:scale-[0.94]"
            >
              clear
            </button>
          )}
        </label>

        {/* ===== WKLEJONY ADRES OTWIERA TOKEN, NAWET SPOZA LISTY =====
            Lista zna dwadziescia cztery godziny. Strona tokena zna kazdy adres,
            bo czyta go wprost. Bez tego przejscia token sprzed dwoch dni byl
            nieosiagalny inaczej niz przez recznie zlozony URL. */}
        {pastedAddress && (
          <Link
            href={`/b20/${pastedAddress}`}
            className="mt-2 flex items-center justify-between gap-3 rounded-card border border-soft-line bg-soft-surface px-4 py-3 shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:border-soft-primary/60 active:scale-[0.99]"
          >
            <span className="min-w-0">
              <span className="block font-soft-display text-[13px] font-bold text-soft-ink">
                Open this token
              </span>
              <span className="mt-0.5 block break-all font-mono text-[11px] text-soft-ink-faint">
                {pastedAddress}
              </span>
            </span>
            <span className="shrink-0 font-soft-display text-[13px] font-bold text-soft-primary-deep">
              →
            </span>
          </Link>
        )}
      </div>

      {/* --- ZAKLADKI ---
          "Trending" i "Hot" nie istnieja, bo kazdy taki ranking jest nasza
          opinia podana jako dane. To sa ODCZYTY i kazdy ma przy sobie liczbe. */}
      <div className="mb-3 -mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max gap-1.5" role="tablist" aria-label="Market segments">
          {tabs.map((tab) => {
            const active = segment === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSegment(tab.id);
                  setLimit(PAGE);
                }}
                className={`rounded-pill border px-3 py-1.5 font-soft-display text-[12.5px] font-bold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] ${
                  active
                    ? 'border-soft-primary bg-soft-primary text-white shadow-chip'
                    : 'border-soft-line bg-soft-surface text-soft-ink-muted'
                }`}
              >
                {tab.label}{' '}
                <span className={`tabular-nums ${active ? 'text-white/80' : 'text-soft-ink-faint'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* --- SORTOWANIE, TYLKO TAM GDZIE ISTNIEJE CO SORTOWAC ---
          Na pozostalych zakladkach nie ma kolumny ceny w ogole, wiec nie ma
          po czym sortowac poza czasem - a czas jest juz domyslny. */}
      {segment === 'traded' && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11.5px] text-soft-ink-faint">
          <span>Sorted by</span>
          {(
            [
              ['volume', '24h volume'],
              ['move', 'biggest move'],
              ['newest', 'newest'],
            ] as [Sort, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSort(id)}
              aria-pressed={sort === id}
              className={`rounded-pill px-2 py-0.5 transition-colors [transition-duration:var(--dur-press)] ${
                sort === id
                  ? 'bg-soft-sunken font-semibold text-soft-ink'
                  : 'text-soft-ink-muted hover:text-soft-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* --- NOWE TOKENY CZEKAJA, NIE WPYCHAJA SIE --- */}
      {newCount > 0 && pending && (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setSnapshot(pending);
              setPending(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="rounded-pill bg-soft-primary px-4 py-1.5 font-soft-display text-[12.5px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
          >
            {newCount} new token{newCount === 1 ? '' : 's'} — show
          </button>
        </div>
      )}

      {failing && (
        // AWARIA MA WLASNE ZDANIE. Lista pod spodem zostaje - ostatnia dobra
        // migawka jest prawda sprzed minut, a pusty ekran nie jest prawda wcale.
        <div className={`${CARD} mb-3 p-3.5`}>
          <p className="text-[12.5px] leading-[1.5] text-soft-ink-muted">
            The last refresh did not come back. What you see below is the reading from{' '}
            {formatReadAge(snapshot.readAt, now)} — it is not live, and it is not zero.
          </p>
          <button
            type="button"
            onClick={() => void poll()}
            className="mt-2 rounded-pill bg-soft-primary px-3.5 py-1.5 font-soft-display text-[12.5px] font-bold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
          >
            Try again
          </button>
        </div>
      )}

      {/* --- LISTA --- */}
      <div className={`${CARD} overflow-hidden`}>
        {visible.length === 0 ? (
          <div className="px-4 py-8 text-center">
            {/* Pustka po SZUKANIU znaczy co innego niz pusta zakladka: token moze
                istniec i po prostu byc starszy niz okno. Zdanie musi to
                rozroznic, inaczej czlowiek odejdzie przekonany, ze go nie ma. */}
            {query.trim() !== '' ? (
              <>
                <p className="text-[13px] leading-[1.55] text-soft-ink-muted">
                  Nothing matching{' '}
                  <span className="font-semibold text-soft-ink">{query.trim()}</span> in the last{' '}
                  {snapshot.windowHours} hours.
                </p>
                <p className="mt-1.5 text-[12.5px] leading-[1.55] text-soft-ink-faint">
                  This list only reads the last day. If the token is older, paste its full address
                  above and it will open.
                </p>
              </>
            ) : (
              <p className="text-[13px] leading-[1.55] text-soft-ink-muted">
                {segment === 'traded'
                  ? 'Nothing in this window has traded yet. That is a reading, not a failure — most B20 tokens never get a single swap.'
                  : 'Nothing here in this window.'}
              </p>
            )}
          </div>
        ) : (
          <ul>
            {visible.map((token, i) => (
              <TokenRow
                key={token.address}
                token={token}
                ethUsd={snapshot.ethUsd}
                now={now}
                index={i}
              />
            ))}
          </ul>
        )}
      </div>

      {visible.length < rows.length && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="rounded-pill border border-soft-line bg-soft-surface px-4 py-2 font-soft-display text-[12.5px] font-bold text-soft-ink-muted shadow-card transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
          >
            Show {Math.min(PAGE, rows.length - visible.length)} more of {rows.length}
          </button>
        </div>
      )}

      <p className="mt-3 px-1 text-[11px] leading-[1.5] text-soft-ink-faint">
        Prices come from the Uniswap v4 pool itself, read on Base. The dollar figures use one
        ETH/USD quote from GeckoTerminal, and the 24h volume column is quoted from GeckoTerminal
        too — we do not compute volume ourselves, and where GeckoTerminal has no figure the column
        says so instead of showing a zero.
      </p>
    </div>
  );
}
