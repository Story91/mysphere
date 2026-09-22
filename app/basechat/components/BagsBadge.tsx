'use client';

/**
 * Proof of Bags pod postem z Solany: ile tokena autor mial w chwili posta
 * i co jego portfel ma teraz.
 *
 * Renderuje sie WYLACZNIE przy pelnym dowodzie (`status: ok`). Kazdy inny
 * wynik - post bez tokena, transakcja niepowiazana z postem, awaria RPC -
 * konczy sie brakiem odznaki. Lepiej nie powiedziec nic niz powiedziec cos
 * falszywego o konkretnym czlowieku.
 *
 * Teksty opisuja SALDO PORTFELA, nie intencje: "wallet down 82%", a nie
 * "sold 82%". Spadek salda moze byc przelewem na cold wallet - patrz
 * komentarz przy `BagsVerdict` w bagsCore.ts.
 *
 * Bez web3.js: odznaka tylko pyta nasze API, wiec nie ciagnie stosu Solany do
 * bundle'a feedu.
 */

import { useQuery } from '@tanstack/react-query';
import type { BagsPositionDto, BagsResponse } from '../Solana/bags/bagsCore';

function tokenLabel(p: BagsPositionDto): string {
  return p.symbol ? `$${p.symbol}` : `${p.mint.slice(0, 4)}…${p.mint.slice(-4)}`;
}

function pct(value: number | null): string {
  if (value === null) return '';
  const abs = Math.abs(value);
  return `${Number.isInteger(abs) ? abs : abs.toFixed(1)}%`;
}

function describe(p: BagsPositionDto): { text: string; tone: string } {
  const token = tokenLabel(p);
  const posted = `Posted holding ${p.atPostUi} ${token}`;
  switch (p.verdict) {
    case 'holding':
      return { text: `${posted} · still holds all of it`, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    case 'added':
      return { text: `${posted} · wallet up ${pct(p.changePct)} since`, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    case 'reduced':
      return { text: `${posted} · wallet down ${pct(p.changePct)} since`, tone: 'text-amber-800 bg-amber-50 border-amber-200' };
    case 'emptied':
      return { text: `${posted} · wallet now holds none`, tone: 'text-rose-700 bg-rose-50 border-rose-200' };
    case 'bought-after':
      return { text: `Posted with no ${token} · wallet holds ${p.nowUi} now`, tone: 'text-soft-ink-muted bg-soft-sunken border-soft-line' };
    case 'no-position':
    default:
      return { text: `Posted with no ${token} in the wallet`, tone: 'text-soft-ink-muted bg-soft-sunken border-soft-line' };
  }
}

export default function BagsBadge({ postId }: { postId: string }) {
  const { data } = useQuery({
    queryKey: ['bags', postId],
    queryFn: async (): Promise<BagsResponse> => {
      const res = await fetch(`/api/bags/${postId}`);
      return (await res.json()) as BagsResponse;
    },
    // API i tak trzyma odpowiedz minute na CDN - czestsze pytanie nic nie da.
    staleTime: 60_000,
    // Brak dowodu to nie awaria do ponawiania, tylko odpowiedz.
    retry: false,
  });

  if (!data || data.status !== 'ok' || data.positions.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-col gap-1.5" aria-label="Proof of Bags">
      {data.positions.map(p => {
        const { text, tone } = describe(p);
        return (
          <div
            key={p.mint}
            className={`flex items-center gap-2 rounded-pill border px-2.5 py-1 font-soft text-[12px] font-medium ${tone}`}
            title="Recorded on-chain in this post's own transaction: the posting wallet's balance at the moment of posting. 'Now' is read live from Solana."
          >
            {p.icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.icon} alt="" className="h-4 w-4 flex-none rounded-full" loading="lazy" />
            )}
            <span className="min-w-0 truncate">{text}</span>
            <a
              href={data.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex-none underline decoration-dotted underline-offset-2 opacity-80 hover:opacity-100"
            >
              proof
            </a>
          </div>
        );
      })}
    </div>
  );
}
