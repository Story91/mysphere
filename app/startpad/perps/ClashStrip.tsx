'use client';

import { useEffect, useRef, useState } from 'react';
import { Share2, Swords, X } from 'lucide-react';
import { clashPhase, clashSharePct, type ClashSide, type ClashToken } from '../duel';
import { fetchLogos } from '../logos';
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from '../config';
import { shareIntentUrl } from '../shareText';
import { ClashBar, MemeAvatar, TONE } from './ClashBar';
import { bannerOf } from './ClashSection';
import { useClashes } from './useClashes';
import { backedNow, cornerShareText, fightShareText, fightShareUrl, heldSide, rivalHref, sideLogo, stripViewOf, type StripView } from './clashStripLogic';

/**
 * Pasek areny na stronie tokena z pary Bull vs Bear / Asset Clash. Kazdy link z
 * posta, karty OG i miniappki laduje na stronie tokena, a ta dotad o walce
 * mowila tylko malym "vs $TWIN" w naglowku. Pasek pokazuje obie strony, line z
 * VS i baner fazy z tego samego `bannerOf` co karta na /perps, wiec przed
 * pierwszymi zakupami po obu stronach mowi "Waiting for the first blow" i nie
 * oglasza lidera z samej roznicy NAV perpow (patrz `clashPhase` w duel.ts).
 *
 * Montowany przez strone tylko dla tokenow z `duel` w metadanych; bez danych
 * (ladowanie, blad, brak rywala) nie rysuje nic - zadnego skoku ukladu.
 *
 * Co wolno powiedziec o ogladajacym: tylko saldo TEGO tokena ("YOU HOLD BULL").
 * O drugim tokenie nie wiemy nic, a lina rusza z handlu i NAV perpow, nie z
 * tego, kto tu patrzy - wiec zadnego "wygrywasz".
 */

/** Jak dlugo wisi komunikat "You backed" (jest na nim link, wiec nie znika po chwili). */
const NOTICE_MS = 20_000;

function Fighter({
  token,
  side,
  word,
  logo,
  current,
  holding,
}: {
  token: ClashToken;
  side: ClashSide;
  word: string;
  logo?: string;
  /** Strona, na ktorej wlasnie jestesmy. */
  current: boolean;
  holding: boolean;
}) {
  const tone = TONE[side];
  const right = side === 'b';
  return (
    <div
      aria-current={current ? 'page' : undefined}
      className={`flex min-w-0 flex-col justify-center rounded-[14px] border p-2.5 ${current ? tone.ring : 'border-sp-shade/10 bg-sp-surface'}`}
    >
      <div className={`flex min-w-0 items-center gap-2.5 ${right ? 'flex-row-reverse text-right' : ''}`}>
        <MemeAvatar logo={logo} symbol={token.symbol} perpSymbol={token.perpSymbol} size={40} />
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[14px] font-extrabold ${tone.text}`}>${token.symbol}</div>
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/60">Team {word}</div>
        </div>
      </div>
      {holding && (
        <div className={`mt-2 flex ${right ? 'justify-end' : ''}`}>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] ${tone.chip}`}>You hold {word}</span>
        </div>
      )}
    </div>
  );
}

export default function ClashStrip({ token, balance, tradeTick }: { token: string; balance: bigint; tradeTick: number }) {
  const clashes = useClashes();
  const [logos, setLogos] = useState<Record<string, string>>({});
  useEffect(() => {
    void fetchLogos(DEFAULT_LAUNCHPAD_CHAIN_ID).then(setLogos).catch(() => {});
  }, []);

  // "You backed": wzrost salda po potwierdzonej transakcji z panelu handlu. Poprzednie saldo i
  // moment onAfterTx trzymamy w refach, bo samo ich ustawienie nie ma odmalowac paska.
  const prevBalance = useRef<bigint | null>(null);
  const armedAt = useRef<number | null>(null);
  const [backedAt, setBackedAt] = useState<number | null>(null);
  useEffect(() => {
    if (tradeTick > 0) armedAt.current = Date.now();
  }, [tradeTick]);
  useEffect(() => {
    const prev = prevBalance.current;
    prevBalance.current = balance;
    const now = Date.now();
    if (backedNow({ prev, next: balance, armedAt: armedAt.current, now })) {
      armedAt.current = null;
      setBackedAt(now);
    }
  }, [balance]);
  useEffect(() => {
    if (backedAt === null) return;
    const t = window.setTimeout(() => setBackedAt(null), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [backedAt]);

  const view: StripView | null = stripViewOf(clashes, token);
  if (!view) return null;

  const { clash, side, me, rival, bullBear, words } = view;
  const phase = clashPhase(clash);
  const aShare = clashSharePct(clash);
  const banner = bannerOf(clash, bullBear, aShare);
  const held = heldSide(side, balance);
  const a = side === 'a' ? me : rival;
  const b = side === 'a' ? rival : me;
  const nowMs = Date.now();
  const fightHref = shareIntentUrl('x', { text: fightShareText(view), url: fightShareUrl(view, nowMs) });
  const cornerHref = shareIntentUrl('x', { text: cornerShareText(view), url: fightShareUrl(view, nowMs) });
  const barLabel =
    phase === 'warmup'
      ? `${words.a} versus ${words.b}, no blows yet`
      : `${words.a} ${Math.round(aShare)} percent, ${words.b} ${Math.round(100 - aShare)} percent`;

  return (
    <section
      aria-label={`${clash.ticker} fight: ${words.a} versus ${words.b}`}
      className="mt-4 rounded-[20px] border border-sp-shade/10 bg-gradient-to-br from-soft-primary/[0.07] via-sp-surface to-amber-500/[0.07] p-3 sm:p-4"
    >
      <div className="grid grid-cols-2 items-stretch gap-x-3 gap-y-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] md:gap-x-5">
        <Fighter token={a} side="a" word={words.a} logo={sideLogo(a, logos)} current={side === 'a'} holding={held === 'a'} />

        {/* Na telefonie srodek spada pod obu zawodnikow (order-last + col-span-2), od md stoi miedzy nimi. */}
        <div className="order-last col-span-2 min-w-0 self-center md:order-none md:col-span-1">
          {/* Odstep pod banerem: plakietka VS wystaje ponad lina i bez niego dotyka banera. */}
          <div className="mb-5 flex justify-center">
            <div key={banner.key} className={`clash-ko max-w-full truncate rounded-[6px] px-2.5 py-1 text-[10.5px] font-black uppercase italic tracking-[0.04em] ${banner.cls}`}>
              {banner.text}
            </div>
          </div>
          <div role="img" aria-label={barLabel}>
            <ClashBar aShare={aShare} />
          </div>
          <div className="mt-2.5 flex justify-between text-[10.5px] font-extrabold">
            <span className="text-soft-primary-deep">{phase === 'warmup' ? words.a : `${Math.round(aShare)}% ${words.a}`}</span>
            <span className="text-amber-700">{phase === 'warmup' ? words.b : `${Math.round(100 - aShare)}% ${words.b}`}</span>
          </div>
        </div>

        <Fighter token={b} side="b" word={words.b} logo={sideLogo(b, logos)} current={side === 'b'} holding={held === 'b'} />
      </div>

      {backedAt !== null && (
        <div role="status" className={`mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] py-2 pl-3 pr-2 text-[12.5px] ${TONE[side].chip}`}>
          <span className="font-extrabold">You backed {words[side]}</span>
          <a href={cornerHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-extrabold underline underline-offset-2">
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Share your corner
          </a>
          <button type="button" onClick={() => setBackedAt(null)} className="ml-auto rounded-full p-1 hover:bg-sp-shade/10" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {/* Zwykly <a>, nie router.push: siec jest wybierana raz przy ladowaniu modulu z ?m=, wiec zmiana rynku to pelne przeladowanie. */}
        <a
          href={rivalHref(rival)}
          className="inline-flex items-center gap-1.5 rounded-full border border-sp-shade/10 bg-sp-surface px-3 py-2 text-[12px] sm:px-3.5 font-extrabold text-sp-ink hover:border-soft-primary"
        >
          <Swords className="h-3.5 w-3.5" aria-hidden="true" /> Other side: ${rival.symbol}
        </a>
        <a
          href={fightHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-sp-shade/10 bg-sp-surface px-3 py-2 text-[12px] sm:px-3.5 font-extrabold text-sp-ink hover:border-soft-primary"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Share the fight
        </a>
      </div>
    </section>
  );
}
