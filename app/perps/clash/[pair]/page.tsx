import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ClashPosterView from './ClashPosterView';
import { loadClashPair, type ClashPairCards } from '../../../startpad/share/tokenCard';
import { buildClashUrl, safeSymbol } from '../../../startpad/shareText';
import { isBullBear, isShortPerp, perpBaseOf, sideWord } from '../../../startpad/duel';
import { pageMeta } from '../../../utils/pageMeta';

/**
 * Plakat pojedynku: /perps/clash/<tokenA>-<tokenB>/ - staly, udostepnialny
 * adres jednego Bull vs Bear albo Asset Clash.
 *
 * === DLACZEGO ADRES NIESIE OBA TOKENY ===
 * Zadnego skanu lancucha po stronie serwera: /api/launchpad/clashes na zimnej
 * instancji czyta siedem launchpadow od ich bloku startu (45-60 s), a crawler
 * X-a tyle nie czeka. Para jest sprawdzana po niezmiennych metadanych obu
 * tokenow (`loadClashPair`), a zywa karta pojedynku dociaga sie w przegladarce.
 *
 * === OBRAZEK ===
 * `openGraph` ustawione tu NIE ma `images`: obok pliku opengraph-image.tsx
 * w tym samym segmencie wygrywa plik i Next dokleja go sam (og:image i
 * twitter:image). Wpisane tu `images` przykrylyby go - patrz app/utils/pageMeta.ts.
 *
 * === TEKSTY ===
 * Zaproszenie do wyboru strony, nigdy wynik: zadnych cen, zwrotow ani
 * "x od startu". Ostrzezenie o dzwigni 2x jest w opisie i na stronie.
 *
 * `revalidate` i brak `searchParams`: strona zostaje w ISR, a `?r=` z linku
 * udostepnienia sluzy tylko rozroznieniu adresow w cache'u crawlerow.
 */

export const runtime = 'nodejs';
export const revalidate = 120;

type Props = { params: { pair: string } };

/** Slowa stron i opisy liczone w jednym miejscu dla metadanych i naglowka strony. */
function describe(pair: ClashPairCards) {
  const perpA = pair.a.perp?.symbol ?? '';
  const perpB = pair.b.perp?.symbol ?? '';
  const bullBear = isBullBear(perpA, perpB);
  const wordA = sideWord(perpA, bullBear) || 'A';
  const wordB = sideWord(perpB, bullBear) || 'B';
  const ticker = safeSymbol(pair.ticker);
  const versus = bullBear ? 'Bull vs Bear' : `${wordA} vs ${wordB}`;

  // "$MOREBULL rides ETH 2x long" - kierunek mowi, na czym stoi krzywa.
  const rides = (card: ClashPairCards['a'], perp: string) =>
    `$${safeSymbol(card.symbol)} rides ${perpBaseOf(perp)} 2x ${isShortPerp(perp) ? 'short' : 'long'}`;

  return { bullBear, wordA, wordB, ticker, versus, rides: `${rides(pair.a, perpA)} and ${rides(pair.b, perpB)}` };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pair = await loadClashPair(params.pair).catch(() => null);

  if (!pair) {
    // Para, ktorej nie ma. Strona i tak odda 404; nie ma sensu jej indeksowac.
    return { title: 'Duel not found', robots: { index: false, follow: false } };
  }

  const info = describe(pair);
  const title = `$${info.ticker}: ${info.versus}`;
  const description = `One meme, two sides. ${info.rides}. Pick a side on MySphere. Flash perps are 2x leveraged and can lose most of their value in a large move.`;
  const url = buildClashUrl(pair.a.address, pair.b.address);

  const base = pageMeta({ title, description });
  return {
    ...base,
    // Adres kanoniczny zawsze w kolejnosci a-b i z ukosnikiem, nawet gdy ktos
    // wkleil pare odwrocona albo z `?r=`.
    alternates: { canonical: url },
    openGraph: { ...base.openGraph, url },
  };
}

export default async function ClashPosterPage({ params }: Props) {
  const pair = await loadClashPair(params.pair).catch(() => null);
  if (!pair) notFound();

  const info = describe(pair);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-28 pt-4 sm:px-6">
      <h1 className="font-soft-display text-[26px] font-extrabold leading-tight text-sp-ink">
        ${info.ticker}: {info.versus}
      </h1>
      <p className="mt-1 text-[13px] leading-[1.5] text-sp-shade/60">
        One meme, two sides. {info.rides}. Pick a side.
      </p>

      <ClashPosterView
        tokenA={pair.a.address}
        tokenB={pair.b.address}
        ticker={info.ticker}
        sideA={info.wordA}
        sideB={info.wordB}
      />
    </div>
  );
}
