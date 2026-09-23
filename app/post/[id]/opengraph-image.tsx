import { ImageResponse } from 'next/og';
import { getPostForShare, getPostTipTotals, shortAddress } from '../../utils/posts/getPostForShare';
import { ogFonts, DISPLAY_FAMILY, BODY_FAMILY } from '../../components/og/fonts';
import { SOLANA_NETWORK_LABEL } from '../../basechat/Solana/config/solanaChain';

/**
 * Karta OG generowana per post.
 *
 * Bylo to niewykonalne, dopoki root layout byl komponentem klienckim - metadane
 * powstawaly dopiero po hydracji, wiec crawlery i podglady linkow widzialy pusty
 * dokument. Po przejsciu layoutu na serwer mozemy generowac obrazek na zadanie.
 *
 * Base App od 9 kwietnia 2026 traktuje aplikacje jak zwykle strony www, wiec
 * bogaty embed jest realna powierzchnia dystrybucji, a nie ozdobnikiem.
 */

/**
 * === JASNE TLO - ZMIANA ZAMOWIONA PRZEZ WLASCICIELA 2026-09-01 ===
 *
 * Ta karta stala na wspolnym ciemnym granacie rodziny #0A1024. Wlasciciel
 * odrzucil ciemna oprawe, wiec na jasne tlo produktu #F1EDFA (--soft-bg)
 * przechodzi CALA szostka kart udostepniania naraz: strona glowna, token
 * startpada, /leaderboard, /post, /tip i /u. Wspolne przejscie jest tu
 * istotne, bo podglad linku ogladany jest w strumieniu obok innych podgladow:
 * polowa rodziny w jednym tonie, a polowa w drugim czytalaby sie jak dwa
 * rozne produkty.
 *
 * Podmieniamy WYLACZNIE barwy. Uklad, padding 72, stopnie pisma, grubosci,
 * letterSpacing i tresc zostaja nietkniete, a kazdy nowy odcien jest
 * przepisany z tokenu w app/globals.css.
 *
 * Tlo jest lawendowe #F1EDFA, a nie biale #FFFFFF (--soft-surface), z tego
 * samego powodu, dla ktorego rodzina byla wczesniej ciemna: na bialej osi
 * czasu X-a karta musi miec wlasna krawedz. Lawenda ja ma, biel by ja
 * stracila. Zyskiem jest to, co ciemna wersja nazywala swoja cena - znika
 * przeskok tonalny miedzy podgladem a produktem, do ktorego link prowadzi.
 *
 * Kontrasty policzone wzgledem NOWEGO tla #F1EDFA, a nie wobec starego
 * #0A1024:
 *   #2E2A44  11.9:1  --soft-ink          nazwa marki i tresc posta
 *   #6B6486   4.8:1  --soft-ink-muted    autor, lajki, komentarze
 *   #C2410C   4.50:1 --soft-accent-deep  kwota tipow
 *   #0052FF   4.99:1 blekit Base - ZOSTAJE bez zmiany, to tozsamosc lancucha,
 *                    a nie dekoracja, wiec nie podlega przemalowaniu
 *
 * === DAWNA ZIELEN #00E28A ===
 * Na tej karcie miala tylko jedno wystapienie i nioslo ono KWOTE, wiec idzie
 * na pomarancz. Obowiazuje ta sama zasada, co w konsoli operatora
 * (app/admin/ops/OpsConsole.tsx): pomaranczowy znaczy KWOTE i nic wiecej.
 * Wskaznika stanu ta karta dzis nie ma - gdyby kiedys doszedl (kropka albo
 * napis o rozliczeniu onchain), ma dostac zielen "ok" #1E7A55 (4.59:1) z tej
 * samej konsoli, a NIE pomarancz: pomaranczowa plakietka stanu czytalaby sie
 * jak kwota i karta klamalaby o wlasnym stanie.
 *
 * Kafli ani wlosow z rgba bieli ta karta nie ma, wiec odwrocenie alfy, ktore
 * trzeba bylo zrobic na kartach ze statystykami (rgba(255,255,255,0.04) na
 * jasnym tle sklada sie do ~1.01:1 i kafel znika), nie ma tu czego dotyczyc.
 */

export const runtime = 'nodejs';
// To samo okno co strona obok: crawlery kazdego komunikatora pobieraja karte
// osobno, wiec bez revalidate jeden viralowy link generowal serie odczytow.
export const revalidate = 300;
export const alt = 'Post on MySphere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Kwoty sumowane per token - ETH dodane do USDC nie znaczyloby nic.
 * Pokazujemy najwyzej dwa najwieksze, zeby stopka karty zostala czytelna.
 */
function formatTips(totals: Record<string, number>): string | null {
  const parts = Object.entries(totals)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([token, amount]) => {
      const value =
        amount >= 1
          ? amount.toFixed(2).replace(/\.00$/, '')
          : amount.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
      return `${value} ${token}`;
    });

  return parts.length ? parts.join(' + ') : null;
}

export default async function Image({ params }: { params: { id: string } }) {
  const [post, tipTotals] = await Promise.all([
    getPostForShare(params.id),
    getPostTipTotals(params.id),
  ]);
  const tips = formatTips(tipTotals);

  const author = post?.authorName || shortAddress(post?.author ?? '');
  // Tresc przycieta tak, zeby zmiescila sie bez lamania layoutu obrazka.
  const raw = post?.content?.trim() ?? '';
  const content = raw.length > 220 ? `${raw.slice(0, 220)}…` : raw || 'Post on MySphere';
  // Ta karta jest tez podgladem linkow /blink/tip i /blink/reply wklejanych
  // na X - czytajacy ma wiedziec, ze post jest z Solany, zanim kliknie.
  // Sumy SOL-a celowo brak: napiwkow w SOL nic u nas nie zapisuje, a kwota
  // w stopce liczy wylacznie napiwki z kolekcji `tips` (sieci EVM).
  const isSolana = post?.network === 'solana';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#F1EDFA', // --soft-bg, jasne tlo produktu
          padding: '72px',
          /**
           * Nunito jako domyslny kroj kadru, Baloo 2 punktowo na tresci posta
           * i liczbach - te same role, co --font-soft-body i --font-soft-display
           * w app/layout.tsx. Pliki dojezdzaja przez app/components/og/fonts.ts;
           * uzasadnienie, dlaczego to w koncu dalo sie zrobic, jest tam.
           */
          fontFamily: BODY_FAMILY,
        }}
      >
        {/* Pasek marki. Blekit Base zostaje dokladnie taki, jaki byl na
            granacie - to tozsamosc lancucha, a nie odcien dobrany pod tlo, i
            na jasnym #F1EDFA trzyma 4.99:1. Poza nim i kwota w stopce reszta
            jest cicha, zeby czytelna byla tresc posta, a nie ramka wokol niej. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '999px',
              background: '#0052FF',
            }}
          />
          <div
            style={{
              fontSize: '26px',
              fontWeight: 600,
              color: '#2E2A44', // --soft-ink, 11.9:1
              letterSpacing: '-0.01em',
            }}
          >
            MySphere
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            /**
             * Tresc posta zostaje w Nunito, mimo ze zajmuje slot bohatera.
             * To jedyny na wszystkich kartach napis pisany przez UZYTKOWNIKA,
             * a nie przez nas: do 220 znakow ciaglej prozy. Baloo 2 ma
             * zaokraglone konce kresek i jest krojem naglowkowym - caly akapit
             * zlozony nim robi sie ciezki i zaczyna krzyczec zamiast dac sie
             * przeczytac. Baloo 2 dostaja na tej karcie liczby (napiwek,
             * polubienia, komentarze), bo one sa etykietami, nie zdaniem.
             */
            fontFamily: BODY_FAMILY,
            fontSize: content.length > 120 ? '44px' : '56px',
            lineHeight: 1.25,
            color: '#2E2A44', // --soft-ink, 11.9:1 - bohater karty
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          {content}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '24px',
            color: '#6B6486', // --soft-ink-muted, 4.8:1 - AA takze w miniaturze
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex' }}>{author}</div>
            {/* Cichy podpis sieci w kolorze autora - to nie kwota (pomarancz)
                ani stan (zielen), tylko informacja, gdzie lezy kwit. */}
            {isSolana && <div style={{ display: 'flex' }}>{`· on ${SOLANA_NETWORK_LABEL}`}</div>}
          </div>
          {post && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
              {/* Kwota idzie PRZED lajkami i na pomaranczu. To jedyna liczba na
                  tej karcie, ktora kazdy moze sprawdzic u zrodla - i jedyna, dla
                  ktorej ktos wysle ten link dalej.
                  Dawna zielen #00E28A byla policzona pod ciemny granat i na
                  jasnym tle nie utrzymywala sie; jej miejsce zajmuje #C2410C
                  (--soft-accent-deep, 4.50:1), ktory w tym systemie znaczy
                  KWOTE i nic wiecej - ta sama zasada, co w konsoli operatora
                  (app/admin/ops/OpsConsole.tsx). To nie jest kolor "zamiast
                  zielonego": zielen zostala rozdzielona wedle znaczenia, a
                  status na tej karcie dostalby #1E7A55, nie pomarancz. */}
              {tips && (
                <div
                  style={{
                    display: 'flex',
                    fontFamily: DISPLAY_FAMILY,
                    color: '#C2410C', // --soft-accent-deep, 4.50:1 - KWOTA
                    fontWeight: 600,
                    fontSize: '28px',
                  }}
                >
                  {tips} in tips
                </div>
              )}
              <div style={{ display: 'flex', fontFamily: DISPLAY_FAMILY }}>{post.likes} likes</div>
              <div style={{ display: 'flex', fontFamily: DISPLAY_FAMILY }}>
                {post.commentCount} comments
              </div>
            </div>
          )}
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() }
  );
}
