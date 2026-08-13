import { ImageResponse } from 'next/og';
import { TokenShareCard, TokenShareFallback } from '../../components/og/TokenShareCard';
import { loadTokenCard } from '../share/tokenCard';

/**
 * Karta OG pojedynczego tokena launchpada.
 *
 * === PO CO ===
 * Do tej pory KAZDY link do tokena wygladal identycznie: statyczna karta
 * startpada z tytulem "Launch details". Token, ktory zrobil x40, i token sprzed
 * minuty rozchodzily sie po X-ie jako ten sam obrazek - czyli powierzchnia,
 * na ktorej ten produkt naprawde rosnie, byla pusta.
 *
 * === CZEGO TA TRASA NIE WIE ===
 * Konwencja plikowa Next nie podaje tu parametrow zapytania, wiec `?c=` z
 * adresu udostepnienia tutaj nie dociera. Siec rozpoznaje `loadTokenCard`
 * pytajac wszystkie trzy naraz - to trzy rownolegle odczyty, nie trzy kolejki.
 *
 * === CZEMU revalidate, A NIE force-dynamic ===
 * Jedno wklejenie linku to fala pobran: kazdy komunikator ciagnie obrazek
 * osobno, a niektore po kilka razy. Dwie minuty scinaja te fale do jednego
 * renderu, a mnoznik i tak nie zmienia sie miedzy dwoma spojrzeniami.
 */

export const runtime = 'nodejs';
export const revalidate = 120;
export const alt = 'Token on MySphere Startpad';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { address: string } }) {
  const data = await loadTokenCard(params.address, null).catch(() => null);

  return new ImageResponse(
    data ? <TokenShareCard data={data} height={size.height} /> : <TokenShareFallback />,
    size
  );
}
