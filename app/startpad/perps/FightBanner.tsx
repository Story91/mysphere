'use client';

import { useEffect, useState } from 'react';
import { Swords } from 'lucide-react';
import { clashSharePct, fightOfTheDay, isBullBear, sideWord, type Clash } from '../duel';
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from '../config';
import { fetchLogos } from '../logos';
import { ClashBar, MemeAvatar } from './ClashBar';
import { bannerOf } from './ClashSection';

/**
 * Pierwszy ekran /perps: jedna cienka belka z walka dnia i mala lina. Walka
 * siedzi w czwartej zakladce, a domyslna jest Memes, wiec bez tej belki wiekszosc
 * gosci jej nie zobaczy. Klik otwiera zakladke Bull vs Bear przewinieta do karty.
 * Tekst fazy ten sam co na karcie (`bannerOf`): przed pierwszymi zakupami po obu
 * stronach "waiting for the first blow", nie "X leads" z samej roznicy NAV.
 */
export default function FightBanner({ clashes, onOpen }: { clashes: Clash[]; onOpen: (id: string) => void }) {
  const [logos, setLogos] = useState<Record<string, string>>({});
  useEffect(() => {
    void fetchLogos(DEFAULT_LAUNCHPAD_CHAIN_ID).then(setLogos).catch(() => {});
  }, []);

  const clash = fightOfTheDay(clashes);
  if (!clash || !clash.a || !clash.b) return null;
  const bullBear = isBullBear(clash.a.perpSymbol, clash.b.perpSymbol);
  const share = clashSharePct(clash);
  const banner = bannerOf(clash, bullBear, share);
  const title = bullBear ? 'Bull vs Bear' : `${sideWord(clash.a.perpSymbol, false)} vs ${sideWord(clash.b.perpSymbol, false)}`;
  const logo = (t: NonNullable<Clash['a']>) => logos[t.address.toLowerCase()] ?? t.image ?? undefined;

  return (
    <button
      type="button"
      onClick={() => onOpen(clash.id)}
      className="clash-arena mt-3 block w-full rounded-[16px] border border-sp-shade/10 bg-gradient-to-r from-soft-primary/[0.07] via-sp-surface to-amber-500/[0.08] px-3.5 py-2.5 text-left transition-colors hover:border-soft-primary/50"
      aria-label={`Open the fight: $${clash.ticker} ${title}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-extrabold text-sp-ink">
          <Swords className="h-3.5 w-3.5 shrink-0 text-soft-primary" aria-hidden="true" />
          <span className="shrink-0 uppercase tracking-[0.06em] text-sp-shade/45">Fight of the day</span>
          <span className="truncate">
            ${clash.ticker}: {title}
          </span>
        </span>
        <span key={banner.key} className={`clash-ko shrink-0 rounded-[6px] px-2 py-0.5 text-[10.5px] font-black uppercase italic tracking-[0.04em] ${banner.cls}`}>
          {banner.text}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <MemeAvatar logo={logo(clash.a)} symbol={clash.a.symbol} perpSymbol={clash.a.perpSymbol} size={26} />
        <div className="min-w-0 flex-1">
          <ClashBar aShare={share} compact />
        </div>
        <MemeAvatar logo={logo(clash.b)} symbol={clash.b.symbol} perpSymbol={clash.b.perpSymbol} size={26} />
      </div>
    </button>
  );
}
