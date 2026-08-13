'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2 } from 'lucide-react';
import { sdk } from '@farcaster/miniapp-sdk';
import {
  buildShareText,
  buildShareUrl,
  formatMultiple,
  shareIntentUrl,
  type ShareState,
  type ShareTarget,
} from './shareText';
import { priceToNumber, START_PRICE_WEI } from './[address]/detailShared';

/**
 * Udostepnianie tokena launchpada - jeden przycisk dla trzech miejsc: kafelka
 * w siatce, wiersza tabeli i naglowka strony tokena.
 *
 * ===========================================================================
 * DLACZEGO WLASNE MENU, SKORO POSTY I ASKI MAJA ARKUSZ SYSTEMOWY
 * ===========================================================================
 * `SharePostActions` wybiera sam `navigator.share` i ma po temu dobre powody:
 * arkusz systemowy zna aplikacje, ktore ten czlowiek ma zainstalowane, i nie
 * starzeje sie razem z nasza lista. Tutaj to nie wystarcza z trzech powodow
 * naraz, i zaden z nich nie dotyczyl postow:
 *
 *   1. FARCASTERA W ARKUSZU NIE MA. A to jest kanal, w ktorym launchpad na
 *      Base naprawde zyje - i jedyny, w ktorym nasz link rozwija sie w karte
 *      z przyciskiem "Trade", a nie w sam obrazek.
 *   2. ARKUSZ NIE NIESIE TEKSTU DO X-a. Mnoznik ("x1.50 since launch") jest
 *      cala trescia udostepnienia; wrzucony przez arkusz zwykle ginie i
 *      zostaje goly adres.
 *   3. NA PULPICIE ARKUSZU NIE MA WCALE. A launchpad oglada sie na pulpicie.
 *
 * Arkusz systemowy zostaje w menu jako jedna z pozycji na telefonie, wiec nie
 * tracimy tego, co dziala.
 *
 * ===========================================================================
 * DLACZEGO KROPKI, A NIE LOGOTYPY SERWISOW
 * ===========================================================================
 * Logotyp narysowany z pamieci to logotyp narysowany zle, a zle narysowany
 * znak firmowy wyglada jak zepsuty interfejs - i to na powierzchni, ktorej
 * zadaniem jest budzic zaufanie. Kropka w barwie serwisu daje to samo, co
 * logotyp daje naprawde w takim menu: rozpoznanie po kolorze, zanim ktos
 * przeczyta nazwe. Wyjatkiem jest X, ktorego znak lezy juz w tym repo
 * (app/basechat/components/ProfileSocials.tsx) i jest sprawdzony na produkcji.
 */

/**
 * ===========================================================================
 * DLACZEGO MENU LECI PORTALEM DO <body>, A NIE STOI OBOK PRZYCISKU
 * ===========================================================================
 * Tabela rynku siedzi w `overflow-x-auto`. Przegladarka liczy wtedy pion tak
 * samo jak poziom (overflow-y `visible` przy overflow-x `auto` staje sie
 * `auto`), wiec menu rozwiniete w wierszu byloby PRZYCIETE albo dorobiloby
 * kontenerowi pionowy suwak. Portal wychodzi poza kazdy taki kontener, a
 * `position: fixed` z wyliczonej pozycji trzyma go przy przycisku.
 *
 * Cena: pozycja jest liczona RAZ, przy otwarciu. Dlatego przewiniecie strony
 * zamyka menu, zamiast pozwolic mu odplynac od przycisku.
 */
type Row = { target: ShareTarget; label: string; dot: string };

const MENU_WIDTH = 190;
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;

/** Kolejnosc jest kolejnoscia realnej dystrybucji tego produktu, nie alfabetem. */
const ROWS: Row[] = [
  { target: 'x', label: 'X', dot: '#0f1419' },
  { target: 'farcaster', label: 'Farcaster', dot: '#8A63D2' },
  { target: 'telegram', label: 'Telegram', dot: '#229ED9' },
  { target: 'whatsapp', label: 'WhatsApp', dot: '#25D366' },
  { target: 'facebook', label: 'Facebook', dot: '#1877F2' },
  { target: 'reddit', label: 'Reddit', dot: '#FF4500' },
];

const START_PRICE_ETH = priceToNumber(START_PRICE_WEI);

export type ShareTokenProps = {
  address: string;
  chainId: number;
  symbol: string;
  raised: number;
  target: number;
  state: ShareState;
  /** Ostatnia znana cena spot w ETH za token; bez niej tekst idzie bez mnoznika. */
  priceEth?: number;
  variant?: 'icon' | 'button';
  className?: string;
};

export default function ShareToken({
  address,
  chainId,
  symbol,
  raised,
  target,
  state,
  priceEth,
  variant = 'icon',
  className = '',
}: ShareTokenProps) {
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState(false);
  // Obecnosc arkusza systemowego sprawdzamy PO montowaniu. Serwer jej nie zna,
  // wiec pytanie o nia w renderze rozjezdza hydracje.
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const open = spot !== null;

  useEffect(() => {
    setHasNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const toggle = useCallback(() => {
    setSpot((current) => {
      if (current) return null;
      const rect = boxRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        top: rect.bottom + MENU_GAP,
        // Wyrownanie do prawej krawedzi przycisku, ale nigdy poza ekran -
        // przycisk w kafelku przy prawym brzegu siatki jest normalnym
        // przypadkiem, nie skrajnym.
        left: Math.max(VIEWPORT_MARGIN, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)),
      };
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setSpot(null);
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!boxRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    // `true` lapie tez przewijanie wewnetrznych kontenerow (tabela rynku),
    // ktore nie dochodzi do okna.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const url = buildShareUrl({ address, chainId });
  const multiple = priceEth ? formatMultiple(priceEth, START_PRICE_ETH) : null;
  const text = buildShareText({ symbol, multiple, raised, target, state });

  const openIntent = useCallback(
    async (row: Row) => {
      setSpot(null);

      // W Base App i klientach Farcastera kompozytor jest NA MIEJSCU - okno
      // przegladarki wyrzucaloby czlowieka z miniappki, zeby wrocic tam, gdzie
      // juz jest.
      if (row.target === 'farcaster') {
        try {
          if (await sdk.isInMiniApp()) {
            await sdk.actions.composeCast({ text, embeds: [url] });
            return;
          }
        } catch {
          // Poza miniappka SDK nie ma czego zapytac - schodzimy na zwykly adres.
        }
      }

      window.open(shareIntentUrl(row.target, { text, url }), '_blank', 'noopener,noreferrer');
    },
    [text, url]
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Schowek bywa zablokowany (brak HTTPS, odmowa uprawnien). Pokazujemy
      // adres do recznego skopiowania, zamiast udawac, ze sie udalo.
      window.prompt('Copy this link', url);
    }
  }, [url]);

  const nativeShare = useCallback(async () => {
    setSpot(null);
    try {
      await navigator.share({ title: `$${symbol} on MySphere Startpad`, text, url });
    } catch {
      // Zamkniecie arkusza przez czlowieka to nie jest blad - nic nie robimy.
    }
  }, [symbol, text, url]);

  const trigger =
    variant === 'button' ? (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] transition-colors hover:border-soft-primary hover:text-[#5f4ec2]"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
        Share
      </button>
    ) : (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Share ${symbol}`}
        className="rounded-full p-2 text-black/35 transition-colors hover:bg-[#f4f1ff] hover:text-[#5f4ec2]"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    );

  const menu =
    spot === null ? null : (
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Share ${symbol}`}
        style={{ position: 'fixed', top: spot.top, left: spot.left, width: MENU_WIDTH }}
        className="z-[60] overflow-hidden rounded-2xl border border-black/10 bg-white py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
      >
        {ROWS.map((row) => (
          <button
            key={row.target}
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              void openIntent(row);
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] font-bold text-[#16141b] transition-colors hover:bg-[#f7f5ff]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.dot }} aria-hidden="true" />
            {row.label}
          </button>
        ))}

        <div className="my-1 h-px bg-black/8" />

        {hasNativeShare && (
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              void nativeShare();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] font-bold text-black/60 transition-colors hover:bg-[#f7f5ff]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-black/25" aria-hidden="true" />
            More apps
          </button>
        )}

        <button
          type="button"
          role="menuitem"
          aria-live="polite"
          onClick={(event) => {
            event.stopPropagation();
            void copy();
          }}
          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] font-bold text-black/60 transition-colors hover:bg-[#f7f5ff]"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${copied ? 'bg-[#16A34A]' : 'bg-black/25'}`}
            aria-hidden="true"
          />
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </div>
    );

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {trigger}
      {menu && createPortal(menu, document.body)}
    </div>
  );
}
