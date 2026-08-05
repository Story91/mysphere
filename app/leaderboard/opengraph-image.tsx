import { ImageResponse } from 'next/og';
import { getLeaderboard, formatReceived } from '../utils/tips/getLeaderboard';
import { getName } from '../utils/identity/getName';
import { shortAddress } from '../utils/posts/getPostForShare';

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

const MEDALS = ['#F5C24C', '#C7D0E0', '#C98B5A'];

export default async function Image() {
  const board = await getLeaderboard(3);

  const names = await Promise.all(
    board.entries.map((entry) =>
      getName({ address: entry.address as `0x${string}` })
        .catch(() => null)
        .then((name) => name || shortAddress(entry.address))
    )
  );

  const totalLine = formatReceived(board.totalReceived, 2);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0A1024',
          padding: '68px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 5, color: '#5C6F94' }}>
            MYSPHERE · {board.windowDays === null ? 'ALL TIME' : `LAST ${board.windowDays} DAYS`}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 72,
              fontWeight: 700,
              color: '#EEF3FF',
              marginTop: 14,
            }}
          >
            Who got paid
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {board.entries.length === 0 ? (
            <div style={{ display: 'flex', fontSize: 34, color: '#5C6F94' }}>
              Nobody yet — the list is open.
            </div>
          ) : (
            board.entries.map((entry, index) => (
              <div
                key={entry.address}
                style={{ display: 'flex', alignItems: 'center', gap: 26, fontSize: 38 }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: 34,
                    color: MEDALS[index] ?? '#3A4A6B',
                    fontWeight: 700,
                  }}
                >
                  {index + 1}
                </div>
                <div style={{ display: 'flex', flex: 1, color: '#DDE6FA' }}>{names[index]}</div>
                <div style={{ display: 'flex', color: '#00E28A', fontWeight: 600 }}>
                  {formatReceived(entry.received, 1)}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', fontSize: 22, color: '#5C6F94' }}>
          {board.totalTips > 0
            ? `${totalLine} settled across ${board.totalTips} tips · every number verifiable onchain`
            : 'Settled payments only · no points, no activity score'}
        </div>
      </div>
    ),
    {
      ...size,
      // Godzina w cache CDN, doba na serwowanie nieswiezego w tle. Podglad linku
      // pobierany jest raz na wklejenie, wiec kazde renderowanie od zera byloby
      // czystym marnotrawstwem - a jednoczesnie karta ma nadazac za rankingiem.
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  );
}
