import type { Metadata } from 'next';
import LaunchpadTokenDetail from './LaunchpadTokenDetail';
import NetworkThemeSync from '../NetworkThemeSync';
import { loadTokenCard } from '../share/tokenCard';
import { buildShareUrl, safeSymbol } from '../shareText';
// Jednostka natywna SIECI TOKENA, nie wpisany na sztywno eter: opis karty
// udostepnienia idzie na X i Farcastera, a token z Arc rozliczany "w ETH"
// bylby zdaniem o cudzych pieniadzach, ktore jest nieprawda.
import { LAUNCHPAD_NETWORKS } from '../config';

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
  // Trzy stany, trzy zdania. Wersja z jednym zdaniem na "nie-Graduated"
  // pisala o tokenie w stanie Locked "... on the curve", chociaz krzywa jest
  // wtedy DOMKNIETA i kupic sie juz nie da. `target` szlo tu tez surowo, wiec
  // podglad linku pokazywal "3" i "1000" zamiast kwoty.
  // Karta tokena zna juz jednostke (ETH albo aktywo rynku Q, np. ETH2xL).
  const nativeSymbol = data.nativeSymbol || (LAUNCHPAD_NETWORKS[data.chainId]?.chain.nativeCurrency.symbol ?? 'ETH');
  const targetText = data.target.toLocaleString('en-US', {
    maximumFractionDigits: data.target < 10 ? 2 : 0,
  });
  const curve =
    data.state === 'Graduated'
      ? 'Graduated to a live Uniswap v4 pool.'
      : data.state === 'Locked'
        ? `Curve full at ${data.raised.toFixed(2)} ${nativeSymbol}, waiting for graduation.`
        : `${data.raised.toFixed(2)} of ${targetText} ${nativeSymbol} on the curve.`;
  const buyers = `${data.holders} ${data.holders === 1 ? 'buyer' : 'buyers'} so far.`;
  // Mem z rynku perpa mowi od razu, z czym jest sparowany - to jego wyroznik.
  const intro = data.perp
    ? `${data.name} is a meme paired with ${data.perp.name ?? data.perp.symbol} on MySphere.`
    : `${data.name} on MySphere Startpad.`;
  const description = `${intro} ${curve} ${buyers}`;

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
  return (
    <>
      <NetworkThemeSync />
      <LaunchpadTokenDetail address={params.address} />
    </>
  );
}
