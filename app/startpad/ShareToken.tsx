'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Link2, MoreHorizontal, Share2 } from 'lucide-react';
import { sdk } from '@farcaster/miniapp-sdk';
import {
  buildShareText,
  buildShareUrl,
  formatMultiple,
  shareIntentUrl,
  type ShareState,
  type ShareTarget,
} from './shareText';
import { BrandMark, SHARE_BRANDS } from './shareIcons';
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
 * DLACZEGO MENU LECI PORTALEM DO <body>
 * ===========================================================================
 * Tabela rynku siedzi w `overflow-x-auto`. Przegladarka liczy wtedy pion tak
 * samo jak poziom (overflow-y `visible` przy overflow-x `auto` staje sie
 * `auto`), wiec menu rozwiniete w wierszu byloby PRZYCIETE albo dorobiloby
 * kontenerowi pionowy suwak. Portal wychodzi poza kazdy taki kontener, a
 * `position: fixed` z wyliczonej pozycji trzyma go przy przycisku.
 *
 * Skutek uboczny, ktory kosztowal juz jeden zly wyglad: opakowanie przycisku
 * NIE MA i nie moze miec klasy `relative`. Menu nie jest juz w srodku, wiec
 * `relative` niczemu nie sluzy, a bije sie z `absolute` podanym z zewnatrz
 * (kafelek w siatce ustawia `absolute right-3 top-3`). W kolejnosci Tailwinda
 * `relative` stoi PO `absolute`, wiec wygrywalo i przycisk ladowal w lewym
 * gornym rogu karty, na logo tokena, zamiast w wolnym prawym rogu.
 *
 * Pozycje menu liczymy RAZ, przy otwarciu - dlatego przewiniecie strony je
 * zamyka, zamiast pozwolic mu odplynac od przycisku.
 */

const MENU_WIDTH = 248;
const MENU_GAP = 8;
const VIEWPORT_MARGIN = 8;

/** Kolejnosc jest kolejnoscia realnej dystrybucji tego produktu, nie alfabetem. */
const TARGETS: ShareTarget[] = ['x', 'farcaster', 'telegram', 'whatsapp', 'facebook', 'reddit'];

/**
 * Czern X-a zamieniamy na atrament interfejsu. Czysta czern jest jedynym
 * kolorem z tej szostki, ktory na bialej karcie czyta sie jak dziura po
 * ikonie, a nie jak znak firmowy.
 */
const brandColor = (target: ShareTarget) => (target === 'x' ? '#16141b' : SHARE_BRANDS[target].color);

/** Tlo kafelka to ten sam kolor z 8% krycia - stad dwie cyfry doklejone do hexa. */
const brandTint = (target: ShareTarget) => `${brandColor(target)}14`;

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
        left: Math.max(
          VIEWPORT_MARGIN,
          Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)
        ),
      };
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setSpot(null);
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!boxRef.current?.contains(node) && !menuRef.current?.contains(node)) close();
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
  const up = priceEth !== undefined && priceEth >= START_PRICE_ETH;
  const text = buildShareText({ symbol, multiple, raised, target, state });

  const openIntent = useCallback(
    async (destination: ShareTarget) => {
      setSpot(null);

      // W Base App i klientach Farcastera kompozytor jest NA MIEJSCU - okno
      // przegladarki wyrzucaloby czlowieka z miniappki, zeby wrocic tam, gdzie
      // juz jest.
      if (destination === 'farcaster') {
        try {
          if (await sdk.isInMiniApp()) {
            await sdk.actions.composeCast({ text, embeds: [url] });
            return;
          }
        } catch {
          // Poza miniappka SDK nie ma czego zapytac - schodzimy na zwykly adres.
        }
      }

      window.open(shareIntentUrl(destination, { text, url }), '_blank', 'noopener,noreferrer');
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

  const triggerProps = {
    type: 'button' as const,
    onClick: (event: React.MouseEvent) => {
      event.stopPropagation();
      toggle();
    },
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
  };

  const trigger =
    variant === 'button' ? (
      <button
        {...triggerProps}
        className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] transition-colors hover:border-soft-primary hover:text-[#5f4ec2]"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
        Share
      </button>
    ) : (
      <button
        {...triggerProps}
        aria-label={`Share ${symbol}`}
        className={`rounded-full p-1.5 transition-colors ${
          open ? 'bg-[#f4f1ff] text-[#5f4ec2]' : 'text-black/30 hover:bg-[#f4f1ff] hover:text-[#5f4ec2]'
        }`}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
      </button>
    );

  const row =
    'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] font-bold text-black/60 transition-colors hover:bg-[#f7f5ff] hover:text-[#16141b]';

  const menu =
    spot === null ? null : (
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Share ${symbol}`}
        style={{ position: 'fixed', top: spot.top, left: spot.left, width: MENU_WIDTH }}
        className="z-[60] rounded-[20px] border border-black/8 bg-white p-2 shadow-[0_20px_50px_rgba(20,16,40,0.18)]"
      >
        {/* Naglowek mowi, CO sie udostepnia. Bez niego menu otwarte nad
            sasiednim kafelkiem nie ma zwiazku z tokenem, ktorego dotyczy. */}
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5 pt-0.5">
          <span className="truncate text-[12.5px] font-extrabold text-[#16141b]">${symbol}</span>
          {multiple && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${
                up ? 'bg-[#edfff4] text-[#0b9a51]' : 'bg-[#fff8ed] text-[#a34b08]'
              }`}
            >
              {multiple}
            </span>
          )}
        </div>

        {/* Kafelki zamiast listy: znak firmowy rozpoznaje sie szybciej niz
            nazwe, a szesc pozycji w trzech kolumnach zajmuje polowe wysokosci
            tego samego menu w pionie. */}
        <div className="grid grid-cols-3 gap-0.5">
          {TARGETS.map((destination) => (
            <button
              key={destination}
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                void openIntent(destination);
              }}
              className="group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-colors hover:bg-[#f7f5ff]"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-[14px] transition-transform duration-150 group-hover:scale-105 group-active:scale-95"
                style={{ backgroundColor: brandTint(destination), color: brandColor(destination) }}
              >
                <BrandMark target={destination} size={18} />
              </span>
              <span className="text-[10px] font-bold leading-none text-black/50">
                {SHARE_BRANDS[destination].label}
              </span>
            </button>
          ))}
        </div>

        <div className="my-1.5 h-px bg-black/8" />

        <button
          type="button"
          role="menuitem"
          aria-live="polite"
          onClick={(event) => {
            event.stopPropagation();
            void copy();
          }}
          className={row}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-[#0b9a51]" aria-hidden="true" />
          ) : (
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? 'Link copied' : 'Copy link'}
        </button>

        {hasNativeShare && (
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              void nativeShare();
            }}
            className={row}
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            More apps
          </button>
        )}
      </div>
    );

  return (
    <div ref={boxRef} className={className}>
      {trigger}
      {menu && createPortal(menu, document.body)}
    </div>
  );
}
