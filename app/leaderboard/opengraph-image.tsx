import { ImageResponse } from 'next/og';
import { getLeaderboard, formatReceived } from '../utils/tips/getLeaderboard';
import { getIdentities } from '../utils/identity/getIdentities';
import { shortAddress } from '../utils/posts/getPostForShare';
import { ogFonts } from '../components/og/fonts';
import { LeaderboardShareCard } from '../components/og/SocialCards';

/**
 * Karta OG rankingu.
 *
 * To jest wlasciwy nosnik tej strony. Ranking dziala wiralowo dlatego, ze ludzie
 * wysylaja go, gdy sami sa na liscie - a wysylaja podglad, nie strone. Karta
 * musi wiec niesc trzy pierwsze nazwiska i kwoty, a nie sam tytul.
 */

export const runtime = 'nodejs';
export const alt = 'Who got paid this week on MySphere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * DLACZEGO force-dynamic, skoro pozostale karty OG go nie maja.
 *
 * Karty postu i profilu sa trasami z parametrem, wiec Next nie probuje ich
 * prerenderowac przy buildzie. Ta nie ma parametru, wiec probuje - i wywraca
 * sie w @vercel/og na `fileURLToPath` ("TypeError: Invalid URL") podczas
 * generowania stron statycznych. To nie jest blad naszego kodu i nie da sie go
 * obejsc trescia komponentu.
 *
 * Renderowanie na zadanie jest tu zreszta wlasciwsze: ranking zmienia sie z
 * kazdym tipem, a obrazek przybity do momentu builda pokazywalby nieaktualne
 * nazwiska. Naglowek cache ponizej trzyma koszt w ryzach.
 */
export const dynamic = 'force-dynamic';

/**
 * KOLOR KARTY - jasne tlo produktu.
 *
 * Wlasciciel zdecydowal 2026-09-01, ze cala rodzina kart OG schodzi z ciemnego
 * granatu na jasne tlo produktu (--soft-bg, #F1EDFA). Wszystkie szesc kart
 * przechodzi razem i to jest tu istotne: podglad linku ogladany jest w
 * strumieniu obok innych podgladow, wiec polowa rodziny w jednym tonie, a
 * polowa w drugim czytalaby sie jak dwa rozne produkty.
 *
 * Kontrasty policzone wzgledem NOWEGO tla #F1EDFA:
 *   #2E2A44  11.9:1  tytul i nazwy (--soft-ink)
 *   #6B6486   4.8:1  nadtytul, stopka, numer poza podium (--soft-ink-muted)
 *   #C2410C   4.50:1 KWOTY (--soft-accent-deep)
 *
 * Pomaranczowy jest tym samym pomaranczowym, co w konsoli operatora
 * (app/admin/ops/OpsConsole.tsx) i obowiazuje ta sama zasada: pomaranczowy
 * znaczy KWOTE i nic wiecej. Na tej karcie nie ma dzis zadnego wskaznika
 * stanu, wiec nie ma tu tez zieleni statusu (#1E7A55). Gdyby kiedys doszedl
 * napis o rozliczeniu onchain, ma dostac te zielen, a NIE pomaranczowy -
 * pomaranczowa plakietka stanu czytalaby sie jak kwota i karta klamalaby o
 * wlasnym stanie.
 */

/**
 * Od 2026-10-12 miejsce niesie naklejka: pierwsza bursztynowa, reszta biala,
 * numer w srodku. Metalowe barwy medali (zloto/srebro/braz) zniknely razem
 * ze starym ukladem.
 */

export default async function Image() {
  const board = await getLeaderboard(3);

  /**
   * Ta sama warstwa tozsamosci, co strona - i z tego samego powodu.
   *
   * Stalo tu `getName({ address })` bez `chain`, czyli z domyslka `mainnet`.
   * Przy mainnecie getName w ogole nie pyta L2Resolvera Basenames, wiec karta,
   * ktora ma zyc trzema nazwiskami, wysylala w swiat trzy skroty adresow.
   * getIdentities siega najpierw po nazwe zapisana w bazie, a na lancuch idzie
   * tylko wtedy, gdy jej nie ma.
   */
  const identities = await getIdentities(board.entries.map((entry) => entry.address));
  const names = board.entries.map(
    (entry) => identities.get(entry.address.toLowerCase())?.name ?? shortAddress(entry.address)
  );

  const totalLine = formatReceived(board.totalReceived, 2);

  // Rysunek: LeaderboardShareCard (app/components/og/SocialCards.tsx).
  return new ImageResponse(
    <LeaderboardShareCard
      windowLabel={board.windowDays === null ? 'All time' : `Last ${board.windowDays} days`}
      rows={board.entries.map((entry, index) => ({ name: names[index], amount: formatReceived(entry.received, 1) }))}
      footer={
        board.totalTips > 0
          ? `${totalLine} settled across ${board.totalTips} tips`
          : 'Settled payments only - no points, no activity score'
      }
    />,
    {
      ...size,
      fonts: await ogFonts(),
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  );
}
