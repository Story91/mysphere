'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tokenInitials, uniswapBuyUrl } from '../../utils/b20/format';

/**
 * Karta tokena B20 pod postem.
 *
 * ===========================================================================
 * DLACZEGO Z TRESCI POSTA, A NIE Z POLA W BAZIE
 * ===========================================================================
 * Kusilo dopisac postom pole `b20Address`. Odrzucone, i to jest wazna decyzja:
 *
 *  - pole w bazie dziala TYLKO dla postow napisanych po tej zmianie, a link
 *    dziala takze dla tych, ktore juz istnieja i dla tych, ktore ktos wklei
 *    recznie albo przyniesie z zewnatrz,
 *  - pole trzeba by dopisac do regul Firestore, do sciezki zapisu i do
 *    optymistycznego postu w feedzie - trzy miejsca, w ktorych mozna sie
 *    rozjechac, zamiast jednego wyrazenia regularnego przy renderze,
 *  - post z linkiem i post z polem musialyby wygladac tak samo, wiec i tak
 *    trzeba by obslugiwac obie sciezki.
 *
 * Karta jest wiec PODGLADEM LINKU, dokladnie tak jak podglady na X czy
 * Farcasterze - i z tego samego powodu: tresc niesie adres, a interfejs go
 * rozwija.
 *
 * ===========================================================================
 * CO KARTA OBIECUJE
 * ===========================================================================
 * Cene i kupno albo NIC z tych dwoch. Token bez puli nie dostaje przycisku,
 * bo Uniswap odpowiedzialby "no route"; nie dostaje tez ceny, bo jej nie ma -
 * i pisze to wprost zamiast zera.
 *
 * Nieudany odczyt NIE renderuje karty wcale. Pusta ramka pod postem wygladalaby
 * jak zepsuty post, a nie jak nieudane zapytanie - a to nie jest wina autora.
 */

type Token = {
  address: string;
  name: string | null;
  symbol: string | null;
  quote: {
    priceUsd: number | null;
    volume24hUsd: number | null;
    reserveUsd: number | null;
    poolId: string | null;
    imageUrl: string | null;
  } | null;
};

/** Wyciaga PIERWSZY adres tokena B20 z tresci posta. `null`, gdy go nie ma. */
export function findB20Address(content: string): string | null {
  if (!content) return null;
  // Format B20 jest na tyle charakterystyczny (0xb2 + dziewiec zer), ze nie
  // trzeba wymagac calego adresu strony - sam adres tokena w tresci wystarczy.
  const match = content.match(/0xb2000000000000000000[0-9a-fA-F]{20}/);
  return match ? match[0].toLowerCase() : null;
}

function money(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value === 0) return '$0';
  return `$${value.toPrecision(3)}`;
}

export default function B20PostCard({ address }: { address: string }) {
  const [token, setToken] = useState<Token | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/b20/token/${address}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (!cancelled && body?.ok) setToken(body.token as Token);
        else if (!cancelled) setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Ani szkieletu, ani ramki bledu: karta jest DODATKIEM do posta, a post czyta
  // sie bez niej. Miganie pustego prostokata przy kazdym przewinieciu byloby
  // gorsze niz jej pozniejsze pojawienie sie.
  if (failed || !token) return null;

  const price = money(token.quote?.priceUsd ?? null);
  const volume = money(token.quote?.volume24hUsd ?? null);
  const canBuy = Boolean(token.quote?.poolId);
  const image = token.quote?.imageUrl ?? null;

  return (
    <div className="mt-2 overflow-hidden rounded-card border border-soft-line bg-soft-surface">
      <div className="flex items-center gap-3 p-3">
        <Link href={`/b20/${token.address}`} className="flex min-w-0 flex-1 items-center gap-3">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              loading="lazy"
              className="h-10 w-10 shrink-0 rounded-full bg-soft-sunken object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft-sunken font-soft-display text-[12px] font-bold text-soft-ink-muted">
              {tokenInitials(token.symbol ?? '', token.name ?? '')}
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span className="truncate font-soft-display text-[14px] font-bold text-soft-ink">
                {token.symbol || 'B20 token'}
              </span>
              <span className="truncate text-[12px] text-soft-ink-muted">{token.name}</span>
            </span>
            <span className="mt-0.5 block text-[12px] text-soft-ink-faint">
              {price ? (
                <>
                  <span className="font-semibold tabular-nums text-soft-accent-deep">{price}</span>
                  {volume ? <> · {volume} traded in 24h</> : null}
                </>
              ) : (
                // Brak puli to nie cena zero i tak ma byc napisane.
                'no market yet'
              )}
            </span>
          </span>
        </Link>

        {canBuy && (
          <a
            href={uniswapBuyUrl(token.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-pill bg-soft-primary px-3.5 py-1.5 font-soft-display text-[12px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.96]"
          >
            Buy
          </a>
        )}
      </div>
    </div>
  );
}
