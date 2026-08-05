'use client';

import Image from 'next/image';

/**
 * Kompozytor zwiniety do pigulki.
 *
 * PO CO TO ISTNIEJE. Rozwiniety kompozytor zajmowal na telefonie gorna trzecia
 * czesc ekranu - pole tekstowe, wybor sieci, przyciski mediow, sekcja premium -
 * i spychal pierwszy post ponizej krawedzi. Czyli aplikacja spolecznosciowa
 * otwierala sie na formularzu, a nie na tresci. Pigulka zajmuje 52 px i
 * rozwija sie dopiero po dotknieciu.
 *
 * Z projektu (wariant 1b): promien 999px, avatar 36px, tekst zastepczy 13.5px
 * w kolorze najslabszym, przycisk 38px w pomaranczu z wlasnym cieniem.
 *
 * POMARANCZ JEST TU JEDYNYM MOCNYM KOLOREM NA EKRANIE. To celowe: na calym
 * feedzie nie ma drugiego tak nasyconego punktu, wiec oko trafia w niego bez
 * szukania. Gdyby akcentow bylo wiecej, zaden nie bylby akcentem.
 *
 * DOSTEPNOSC: to jeden przycisk, nie pole tekstowe. Udawanie inputa (placeholder
 * w divie) sprawiloby, ze czytnik ekranu obiecuje pisanie w miejscu, w ktorym
 * pisac sie nie da.
 */

export default function SoftComposerPill({
  avatarUrl,
  placeholder = "What's happening onchain?",
  onOpen,
  className = '',
}: {
  avatarUrl?: string | null;
  placeholder?: string;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={placeholder}
      className={[
        'flex w-full items-center gap-2.5 rounded-pill bg-soft-surface p-2',
        'shadow-[0_3px_12px_rgba(102,86,190,0.1)]',
        'transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.985]',
        'outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-bg',
        className,
      ].join(' ')}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatary sa na
        // dowolnych domenach; next/image wymagalby whitelisty kazdej z nich.
        <img src={avatarUrl} alt="" className="h-9 w-9 flex-none rounded-full object-cover" />
      ) : (
        <Image
          src="/ghostavatar.png"
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 flex-none rounded-full object-cover"
        />
      )}

      <span className="flex-1 text-left font-soft text-[13.5px] font-semibold text-soft-ink-faint">
        {placeholder}
      </span>

      <span
        aria-hidden="true"
        className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-soft-accent shadow-[0_4px_10px_rgba(245,167,59,0.4)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
    </button>
  );
}
