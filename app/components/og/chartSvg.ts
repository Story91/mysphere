/**
 * Wykres ceny na karcie udostepniania - jako gotowy SVG.
 *
 * ===========================================================================
 * DLACZEGO STRING SVG, A NIE ZNACZNIKI W KARCIE
 * ===========================================================================
 * Karty OG rysuje satori, ktore rozumie podzbior CSS-a i garstke znacznikow.
 * Linia lamana z gradientem pod spodem jest dokladnie tym, czego tam nie ma na
 * pewno, a `<img src="data:image/svg+xml;base64,...">` jest wspierane wprost i
 * rasteryzuje sie tym samym resvg, co reszta obrazka.
 *
 * Skutek uboczny jest tu wazniejszy niz sam wykres: liczenie wspolrzednych
 * przestaje byc czescia renderu i staje sie funkcja, ktora da sie przetestowac
 * bez generowania jednego piksela (test/StartpadShare.test.ts).
 *
 * ===========================================================================
 * CZEGO TEN WYKRES NIE ROBI
 * ===========================================================================
 * Nie rysuje niczego przy mniej niz dwoch punktach. Linia poprowadzona miedzy
 * cena startowa a dzisiejsza wygladalaby jak historia rynku, a bylaby zgadywana
 * w calosci poza koncami. Ta sama zasada rzadzi `Sparkline` w tablicy
 * launchpada: brak wykresu jest uczciwy, zmyslony wykres nie jest.
 */

/** Wzrost i spadek w barwach rodziny kart OG (app/components/og/HomeShareCard.tsx). */
const UP_COLOR = '#00E28A';
const DOWN_COLOR = '#F2A33C';

/** Ile punktow trafia na obrazek. Wiecej nie doda ksztaltu, doda wagi pliku. */
const MAX_POINTS = 64;

/** Zapas nad i pod linia, zeby szczyt i dolek nie przycinaly sie o krawedz. */
const PAD_Y = 12;

export type ChartOptions = {
  width: number;
  height: number;
  /** Kierunek liczony przez wolajacego (ostatnia cena vs pierwsza), nie tutaj. */
  up: boolean;
};

/**
 * Rownomierne probkowanie z ZACHOWANIEM koncow. Pierwszy i ostatni punkt to
 * start tokena i cena teraz - dwie liczby, ktore na tej karcie znaczą najwiecej
 * i ktorych zwykle `slice` co n-ty umialoby nie trafic.
 */
export function samplePoints(values: number[], max: number): number[] {
  if (max < 2 || values.length <= max) return values;

  const out: number[] = [];
  const last = values.length - 1;
  for (let index = 0; index < max; index += 1) {
    out.push(values[Math.round((index * last) / (max - 1))]);
  }
  return out;
}

/** Wspolrzedne skracamy do jednego miejsca - reszta to same bajty pliku. */
const coord = (value: number) => String(Math.round(value * 10) / 10);

export function buildChartSvg(values: number[], options: ChartOptions): string | null {
  const points = samplePoints(values.filter((value) => Number.isFinite(value)), MAX_POINTS);
  if (points.length < 2) return null;

  const { width, height, up } = options;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;
  const span = height - PAD_Y * 2;

  const xy = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width;
    // Plaska cena (range === 0) to nie jest brak danych - to jest cisza na
    // rynku. Rysujemy ja w polowie wysokosci zamiast dzielic przez zero.
    const y = range === 0 ? height / 2 : PAD_Y + (1 - (value - min) / range) * span;
    return `${coord(x)} ${coord(y)}`;
  });

  const line = `M ${xy.join(' L ')}`;
  const area = `${line} L ${coord(width)} ${coord(height)} L 0 ${coord(height)} Z`;
  const color = up ? UP_COLOR : DOWN_COLOR;

  // Identyfikator gradientu moze byc staly: kazdy taki SVG jest osobnym
  // dokumentem w `data:`, wiec nie ma z czym kolidowac.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs>',
    `<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>`,
    `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>`,
    '</linearGradient>',
    '</defs>',
    `<path d="${area}" fill="url(#fade)"/>`,
    `<path d="${line}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
  ].join('');
}

/**
 * Ten sam wykres gotowy do wstawienia w `src`. Base64, a nie surowy XML w
 * adresie: tresc niesie `#` w kolorach, a te w `data:` bez kodowania ucina
 * reszte dokumentu.
 */
export function chartDataUri(values: number[], options: ChartOptions): string | null {
  const svg = buildChartSvg(values, options);
  if (svg === null) return null;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
