import { ImageResponse } from 'next/og';
import { DISPLAY_FAMILY, BODY_FAMILY, ogFonts } from '../../components/og/fonts';
import { getTipReceipt } from '../../utils/tips/getTipReceipt';
import { getName } from '../../utils/identity/getName';
import { shortAddress } from '../../utils/posts/getPostForShare';

/**
 * Karta OG paragonu.
 *
 * To jest wlasciwy produkt tej trasy. Wieksza czesc ludzi nigdy nie kliknie
 * linku - zobaczy tylko ten obrazek w podgladzie na X albo w Base App. Ma wiec
 * niesc CALA informacje: kwote, kto komu, i to, ze rzecz jest rozliczona.
 *
 * Zadnego brandingu ponad minimum, zadnych ozdobnikow. Bohaterem jest liczba.
 *
 * === JASNE TLO - ZMIANA ZAMOWIONA PRZEZ WLASCICIELA 2026-09-01 ===
 * Ta karta stala na wspolnym ciemnym tle rodziny #0A1024. Wlasciciel odrzucil
 * ciemna oprawe wprost, wiec na tlo produktu #F1EDFA (--soft-bg) przechodzi
 * CALA szostka kart udostepniania naraz: strona glowna, token startpada,
 * /leaderboard, /post, /tip i /u. Rodzina nie zostaje wiec rozjechana 2:4 -
 * to byl dlug zapisany przy pierwszych dwoch kartach i wlasnie sie domyka.
 * Uklad, padding 72, stopnie pisma, grubosci i tresc sa NIETKNIETE: to jest
 * podmiana samych barw, kazda przepisana z tokenu w app/globals.css.
 *
 * Tlo jest lawendowe #F1EDFA, a nie biale #FFFFFF (--soft-surface), z tego
 * samego powodu, dla ktorego rodzina byla wczesniej ciemna: na bialej osi
 * czasu X-a karta musi miec wlasna krawedz. Lawenda ja ma, biel by ja stracila.
 * Zyskiem jest to, co ciemna wersja nazywala swoja cena - znika przeskok
 * tonalny miedzy podgladem a produktem, do ktorego link prowadzi.
 *
 * === KONTRAST: KARTA JEST OGLADANA JAKO MINIATURA ===
 * X skaluje podglad do ~0.3-0.42 oryginalu, wiec kazda barwa jest policzona
 * (nie oszacowana) wobec NOWEGO tla #F1EDFA, a nie wobec starego #0A1024:
 *   #2E2A44  11.9:1  --soft-ink          linia "kto komu"
 *   #6B6486   4.8:1  --soft-ink-muted    ticker i stopka, AA takze dla malego
 *   #C2410C   4.50:1 --soft-accent-deep  kwota
 *   #1E7A55   4.59:1 zielen "ok" z konsoli - kropka i "SETTLED ONCHAIN"
 * Ta karta nie ma kafli ani wlosow, wiec odwrocenie alfy, ktore trzeba bylo
 * zrobic na kartach ze statystykami (rgba bialego na jasnym tle daje ~1.01:1
 * i kafel znika), nie ma tu czego dotyczyc.
 *
 * === DWA ZNACZENIA JEDNEJ ZIELENI ===
 * Stara karta pisala kwote i status tym samym #00E28A. To nie byl jeden kolor
 * do podmiany, tylko dwa rozne komunikaty, ktore przypadkiem mialy wspolny
 * odcien - i dlatego nie wolno tu bylo zrobic zwyklego find-replace.
 * 1. KWOTA idzie na #C2410C (--soft-accent-deep). W tym systemie pomarancz
 *    znaczy KWOTE i nic wiecej; regula jest spisana w
 *    app/admin/ops/OpsConsole.tsx:27. Bohaterem tej karty jest liczba, wiec to
 *    wlasnie ona dostaje kolor zarezerwowany dla pieniedzy.
 * 2. STATUS (kropka i napis "SETTLED ONCHAIN") idzie na #1E7A55 - te sama
 *    zielen, ktorej konsola uzywa na chipie "ok". Statusu NIE wolno zmapowac
 *    na pomarancz: pomaranczowa plakietka czytalaby sie jak kwota i karta
 *    zaczelaby klamac o wlasnym stanie. Zielen zostaje zieleni, tylko
 *    sciemniona pod jasne tlo.
 */

export const runtime = 'nodejs';
export const alt = 'Tip receipt on MySphere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function formatAmount(amount: string): string {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) return amount;
  if (value >= 1) return value.toFixed(2).replace(/\.00$/, '');
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

async function displayName(address: string): Promise<string> {
  if (!address) return 'unknown';
  const name = await getName({ address: address as `0x${string}` }).catch(() => null);
  return name || shortAddress(address);
}

export default async function Image({ params }: { params: { txHash: string } }) {
  const tip = await getTipReceipt(params.txHash);

  const [from, to] = await Promise.all([
    displayName(tip?.senderAddress ?? ''),
    displayName(tip?.recipientAddress ?? ''),
  ]);

  const amount = tip ? formatAmount(tip.amount) : '—';
  const token = tip?.token ?? '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#F1EDFA',
          padding: '72px',
          /**
           * Nunito jako domyslny kroj kadru, Baloo 2 punktowo na naglowku i
           * liczbach - te same role, co --font-soft-body i --font-soft-display
           * w app/layout.tsx. Pliki dojezdzaja przez app/components/og/fonts.ts;
           * uzasadnienie, dlaczego to w koncu dalo sie zrobic, jest tam.
           */
          fontFamily: BODY_FAMILY,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: '#1E7A55' }}
          />
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: 5, color: '#1E7A55' }}>
            SETTLED ONCHAIN
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
            <div
              style={{
                display: 'flex',
                fontFamily: DISPLAY_FAMILY,
                fontSize: 150,
                fontWeight: 700,
                color: '#C2410C',
                lineHeight: 1,
              }}
            >
              {amount}
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: DISPLAY_FAMILY,
                fontSize: 44,
                fontWeight: 600,
                color: '#6B6486',
              }}
            >
              {token}
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 38, color: '#2E2A44', marginTop: 26 }}>
            {from} → {to}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 22, color: '#6B6486' }}>
          {tip
            ? `Verifiable on ${tip.network} · mysphere.fun`
            : 'Receipt not found · mysphere.fun'}
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() }
  );
}
