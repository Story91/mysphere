import { ImageResponse } from 'next/og';
import { ClashShareCard } from '../../../components/og/ClashShareCard';
import { PerpsShareCard } from '../../../components/og/PerpsShareCard';
import { loadClashPair } from '../../../startpad/share/tokenCard';
import { perpMarkets } from '../../../api/launchpad/flashFeed';
import { ogFonts } from '../../../components/og/fonts';
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from '../../../startpad/config';

/**
 * Karta OG plakatu pojedynku: /perps/clash/<tokenA>-<tokenB>/.
 *
 * === PO CO ===
 * Do tej pory kazdy link do pojedynku rozwijal sie jako ogolna karta /perps.
 * Ta rysuje obie strony, lina z VS i "Pick a side" - tak, zeby link byl
 * plakatem walki, a nie reklama dzialu.
 *
 * === CZEGO TA TRASA NIE ROBI ===
 * Nie skanuje lancucha. Adres niesie oba tokeny, a `loadClashPair` robi dwa
 * zwykle odczyty i sprawdza po niezmiennych metadanych, ze to jedna para
 * (cold skan /api/launchpad/clashes to 45-60 s, a crawler X-a nie czeka).
 *
 * === GDY PARA NIE JEST PARA ===
 * Zadnego bledu: karta wraca do ogolnej karty /perps. Podglad linku, ktory nie
 * wstal, jest gorszy niz ogolny podglad.
 *
 * Cache jak karta tokena: `revalidate` scina fale pobran z jednego wklejenia
 * do jednego renderu, a lina i tak nie zmienia sie miedzy dwoma spojrzeniami.
 */

export const runtime = 'nodejs';
export const revalidate = 120;
export const alt = 'Two memes, two sides: pick a side on MySphere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { pair: string } }) {
  const pair = await loadClashPair(params.pair, true).catch(() => null);
  const fonts = await ogFonts();

  if (!pair) {
    const perps = await perpMarkets(DEFAULT_LAUNCHPAD_CHAIN_ID).catch(() => []);
    return new ImageResponse(<PerpsShareCard perps={perps} />, { ...size, fonts });
  }

  return new ImageResponse(<ClashShareCard a={pair.a} b={pair.b} ticker={pair.ticker} />, { ...size, fonts });
}
