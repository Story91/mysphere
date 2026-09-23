// Czysta logika selektora sieci (GooeyNav.tsx) - bez Reacta, bez CSS, zeby
// dalo sie ja sprawdzic w mocha (test/GooeyNavLogic.test.ts) bez przegladarki.

export type GooeySpecialStyle =
  | 'base'
  | 'world'
  | 'celo'
  | 'camp'
  | 'linea'
  | 'ethereum'
  | 'robinhood'
  | 'arc';

type TileLook = {
  // 'white' = biale tlo, 'gradient' = gradient z koloru sieci (item.color)
  surface: 'white' | 'gradient';
  // 'item' = obramowanie w kolorze samej sieci (item.color)
  border: string;
  width: 1 | 2;
};

// Wyglad AKTYWNEGO kafla dla kazdej sieci. Wartosci przepisane jeden do
// jednego z trzech rownoleglych lancuchow warunkow, ktore staly wczesniej
// w GooeyNav.tsx (className, borderColor, borderWidth) - kazda nowa siec
// trzeba bylo dopisac w trzech miejscach. Arc nie mial wpisu w lancuchu
// kolorow ramki, wiec dostawal ramke 1px w kolorze 'transparent'; zostawione
// tak, bo tak dzis wyglada.
const LOOKS: Record<GooeySpecialStyle, TileLook> = {
  base: { surface: 'white', border: 'item', width: 2 },
  world: { surface: 'white', border: '#000000', width: 1 },
  celo: { surface: 'gradient', border: '#000000', width: 1 },
  camp: { surface: 'gradient', border: '#000000', width: 1 },
  linea: { surface: 'gradient', border: '#7FFFD4', width: 1 }, // jasno seledynowa
  ethereum: { surface: 'gradient', border: '#ADD8E6', width: 1 }, // bladoniebieska
  robinhood: { surface: 'gradient', border: '#00C805', width: 1 }, // firmowa zielen Robinhooda
  arc: { surface: 'gradient', border: 'transparent', width: 1 },
};

// Siec BEZ specialStyle (dzis Solana) dostaje wyglad Base: biale tlo i ramke
// 2px we wlasnym kolorze. Wczesniej wpadala w galaz domyslna: gradient z
// wlasnego koloru i ramka 0px. Dla Solany to gradient z #9945FF, a jej znak
// sam jest gradientem #9945FF -> #14F195 - fioletowa polowa logo znikala w
// fioletowym tle i wybrany kafel wygladal na pusty. Na bialym znak jest caly,
// a zaznaczenie niesie ramka. Dziala dla kazdej kolejnej sieci bez wpisu
// w LOOKS, wiec nowa siec nie wymaga zmian w tym pliku, zeby wygladac porzadnie.
const DEFAULT_LOOK: TileLook = { surface: 'white', border: 'item', width: 2 };

const FALLBACK_COLOR = '#3b82f6';

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [59, 130, 246]; // FALLBACK_COLOR
}

// Rozjasnienie w strone bieli o `factor` (0..1).
function lighten(rgb: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.min(255, rgb[0] + (255 - rgb[0]) * factor),
    Math.min(255, rgb[1] + (255 - rgb[1]) * factor),
    Math.min(255, rgb[2] + (255 - rgb[2]) * factor),
  ];
}

export type ActiveTileStyle = {
  background: string;
  borderColor: string;
  borderWidth: string;
};

/**
 * Inline style nakladki aktywnego kafla. Gradient idzie od koloru sieci do
 * tego samego koloru rozjasnionego o 30% - dokladnie ta formula, ktora
 * GooeyNav liczyl dotad z pozycji aktywnej.
 */
export function activeTileStyle(
  specialStyle: GooeySpecialStyle | undefined,
  color: string | undefined,
): ActiveTileStyle {
  const look = (specialStyle && LOOKS[specialStyle]) || DEFAULT_LOOK;
  const itemColor = color || FALLBACK_COLOR;
  let background = 'white';
  if (look.surface === 'gradient') {
    const from = hexToRgb(itemColor);
    const to = lighten(from, 0.3);
    background = `linear-gradient(135deg, rgb(${from[0]}, ${from[1]}, ${from[2]}), rgb(${to[0]}, ${to[1]}, ${to[2]}))`;
  }
  return {
    background,
    borderColor: look.border === 'item' ? itemColor : look.border,
    borderWidth: `${look.width}px`,
  };
}

/**
 * Dokad przeniesc fokus po wcisnieciu klawisza na kaflu `current`.
 * null = klawisz nie nalezy do selektora i ma zadzialac normalnie.
 *
 * Tylko strzalki w poziomie + Home/End (wzorzec toolbar z WAI-ARIA APG).
 * Gora/dol celowo NIE: rzad jest poziomy, a przechwycone strzalki pionowe
 * zablokowalyby przewijanie strony, gdy fokus stoi na selektorze.
 * Z Alt/Ctrl/Meta klawisz tez przepuszczamy - Alt+strzalka to w przegladarce
 * "wstecz/dalej", nie nasz ruch.
 *
 * Ruch fokusu NIE wybiera sieci. Wybor to Enter albo Spacja (natywne
 * zachowanie <button>). Gdyby wybor szedl za fokusem (wzorzec radio),
 * kazda strzalka montowalaby inny kompozytor: znika wpisany szkic, podglad
 * zalacznikow i stan wysylki, a przejscie przez Solane sciaga paczke
 * portfeli Solany.
 */
export function rovingTarget(
  e: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  current: number,
  count: number,
): number | null {
  if (count <= 0 || e.altKey || e.ctrlKey || e.metaKey) return null;
  switch (e.key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * Ktory kafel ma tabIndex=0, czyli jedyny przystanek Tab w calym rzedzie
 * (roving tabindex). Dopoki fokus jest w rzedzie - kafel z fokusem, zeby
 * Shift+Tab wychodzil z selektora, a nie skakal na kafel wybranej sieci.
 * Poza rzedem - wybrana siec, wiec Tab zawsze wchodzi na to, co jest wybrane.
 * Indeksy spoza zakresu (lista sie skrocila) sa ignorowane.
 */
export function tabStopIndex(focused: number | null, active: number, count: number): number {
  if (count <= 0) return -1;
  if (focused !== null && focused >= 0 && focused < count) return focused;
  if (active >= 0 && active < count) return active;
  return 0;
}
