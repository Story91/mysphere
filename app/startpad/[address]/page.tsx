import type { Metadata } from 'next';
import LaunchpadTokenDetail from './LaunchpadTokenDetail';
import { loadTokenCard } from '../share/tokenCard';
import { buildShareUrl, safeSymbol } from '../shareText';

/**
 * Strona tokena launchpada.
 *
 * === DLACZEGO METADANE POWSTAJA NA SERWERZE, SKORO WIDOK JEST KLIENCKI ===
 * Sam widok musi byc kliencki (portfel, odczyty na zywo, panel handlu), ale
 * podglad linku powstaje ZANIM ktokolwiek kliknie i widzi wylacznie to, co
 * serwer wypisal w naglowku dokumentu. Stalo tu "Launch details" dla kazdego
 * tokena, wiec kazdy udostepniony launch wygladal tak samo - i tak samo pusto.
 *
 * === CENA I JAK JEST ZAPLACONA ===
 * `generateMetadata` czyta lancuch, wiec nie jest darmowe. Dlatego strona ma
 * `revalidate` i celowo NIE zaglada do parametrow zapytania: gdyby zagladala,
 * Next musialby renderowac ja przy kazdym wejsciu, a `?c=` i tak jest tylko
 * skrotem - siec rozpoznaje `loadTokenCard` sama, a odpowiedz niesie juz jej
 * numer, wiec embed miniappki potrafi go dopisac do adresu obrazka.
 */

export const runtime = 'nodejs';
export const revalidate = 120;

type Props = { params: { address: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Bez logo: metadane niosa tytul, opis i adresy, a obrazek rysuje sie w
  // osobnym zadaniu (opengraph-image). Pobieranie go tutaj bylo praca, ktorej
  // wynik i tak ladowal w koszu.
  const data = await loadTokenCard(params.address, null, { withLogo: false }).catch(() => null);

  if (!data) {
    // Adres, ktorego zaden launchpad nie zna. Zadnej karty tokena tu nie ma i
    // nie wolno jej udawac - zostaje tytul mowiacy, gdzie ktos trafil.
    return {
      title: 'Launch details',
      description: 'Onchain curve, trades and pool details.',
    };
  }

  const symbol = `$${safeSymbol(data.symbol)}`;
  const title = data.multiple ? `${symbol} ${data.multiple} since launch` : `${symbol} on Startpad`;
  const curve =
    data.state === 'Graduated'
      ? 'Graduated to a live pool.'
      : `${data.raised.toFixed(2)} of ${data.target} ETH on the curve.`;
  const description = `${data.name} on MySphere Startpad. ${curve} ${data.holders} buyers so far.`;

  const url = buildShareUrl({ address: data.address, chainId: data.chainId });
  // Obrazek embeddu jest 3:2 i niesie juz rozpoznana siec, wiec klient
  // Farcastera nie placi za zgadywanie jej po raz drugi.
  const embed = JSON.stringify({
    version: '1',
    imageUrl: `https://mysphere.fun/startpad/${data.address}/miniapp-image/?c=${data.chainId}`,
    button: {
      // Limit Farcastera to 32 znaki - symbol jest przyciety do 12, wiec
      // najdluzszy mozliwy napis ma 19.
      title: `Trade ${symbol}`,
      action: {
        type: 'launch_miniapp',
        name: 'MySphere',
        url,
        splashImageUrl: 'https://mysphere.fun/SPLASH.gif',
        splashBackgroundColor: '#FFFFFF',
      },
    },
  });

  return {
    title,
    description,
    openGraph: { title, description, type: 'website', url },
    twitter: { card: 'summary_large_image', title, description },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

export default function LaunchpadTokenPage({ params }: Props) {
  return <LaunchpadTokenDetail address={params.address} />;
}
