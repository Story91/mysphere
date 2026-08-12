import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Generyczna karta udostepniania (OG) dla POJEDYNCZEJ strony.
 *
 * === DWA WARIANTY ===
 * 1. BEZ tla (domyslny): ciemna karta rodziny #0A1024 z fioletowym krecoslupem -
 *    ta sama oprawa co karta korzenia i cztery karty danych.
 * 2. Z TLEM: wlasciciel wrzuca obrazek do public/backs/<slug>.png. Wtedy obrazek
 *    jest tlem na cala powierzchnie, z lewej
 *    idzie gradient dla czytelnosci, a napisy sa BIALE, z lewej. Gdy obrazka nie
 *    ma, wracamy do wariantu 1 - nic sie nie psuje.
 *
 * === ZASADY (satori, nie przegladarka) ===
 * - Kazdy kontener ma jawny `display`, zero Tailwinda.
 * - Zaden logotyp z pliku w kadrze; tlo jest OPCJONALNE i ladowane z fallbackiem.
 */

const CARD = {
  bg: '#0A1024',
  ink: '#EEF3FF',
  inkMuted: '#B9C6E0',
  brand: '#9B8CEA',
} as const;

const PADDING = 72;
const SPINE_WIDTH = 8;
const SPINE_GAP = 28;
const TEXT_INDENT = SPINE_WIDTH + SPINE_GAP; // 36
const TEXT_WIDTH = 1200 - PADDING * 2 - TEXT_INDENT;

export type PageShareCardProps = {
  eyebrow?: string;
  head: string;
  footer: string;
  accent?: string;
  /** Data-URL tla (z loadOgBg). Gdy podane, karta renderuje sie NA obrazku. */
  bg?: string | null;
};

export function PageShareCard({ eyebrow = 'MYSPHERE.FUN', head, footer, accent = CARD.brand, bg }: PageShareCardProps) {
  const ink = bg ? '#FFFFFF' : CARD.ink;
  const inkMuted = bg ? '#E7ECF7' : CARD.inkMuted;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', background: CARD.bg, fontFamily: 'sans-serif' }}>
      {bg ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bg} width={1200} height={630} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          {/* Gradient z lewej - napisy zostaja czytelne nawet gdy tlo nie jest
              rowno czarne. Ku prawej znika, zeby prawa strona obrazka oddychala. */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', background: 'linear-gradient(90deg, rgba(3,5,15,0.86) 0%, rgba(3,5,15,0.55) 46%, rgba(3,5,15,0.12) 74%, rgba(3,5,15,0) 100%)' }} />
        </>
      ) : null}

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', padding: `${PADDING}px` }}>
        <div style={{ display: 'flex', marginLeft: TEXT_INDENT, fontSize: 24, fontWeight: 700, letterSpacing: 5, color: accent }}>
          {eyebrow}
        </div>

        <div style={{ display: 'flex', gap: SPINE_GAP, alignItems: 'stretch' }}>
          <div style={{ display: 'flex', width: SPINE_WIDTH, borderRadius: 4, background: accent }} />
          <div style={{ display: 'flex', width: TEXT_WIDTH, fontSize: 66, lineHeight: 1.12, fontWeight: 700, letterSpacing: -1.4, color: ink }}>
            {head}
          </div>
        </div>

        <div style={{ display: 'flex', marginLeft: TEXT_INDENT, width: TEXT_WIDTH, fontSize: 30, lineHeight: 1.35, fontWeight: 600, letterSpacing: -0.2, color: inkMuted }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

/**
 * Laduje tlo karty z public/backs/<slug>.png (lub .jpg) i zwraca data-URL,
 * albo null (wtedy karta jest ciemna - fallback).
 *
 * DWIE DROGI, bo serwerowy fetch WLASNEJ domeny na Vercelu bywa zawodny:
 *   1. Z DYSKU: plik jest dolaczony do bundla funkcji przez
 *      outputFileTracingIncludes (next.config.js), wiec czytamy go z
 *      `${cwd}/public/backs/`. Najpewniejsza droga, bez sieci.
 *   2. FETCH backstop: najpierw z VERCEL_URL (adres samego deploya - omija
 *      custom-domain/WAF), potem z kanonicznej domeny.
 * Gdy zadna droga nie da obrazka, zwracamy null i karta dziala jak dotad.
 */
function toDataUrl(buf: Buffer, name: string): string | null {
  if (buf.length === 0 || buf.length > 20_000_000) return null;
  const ct = name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
  return `data:${ct};base64,${buf.toString('base64')}`;
}

export async function loadOgBg(slug: string): Promise<string | null> {
  const names = [`${slug}.png`, `${slug}.jpg`];

  // 1) Z dysku (plik w bundlu funkcji).
  for (const name of names) {
    try {
      const buf = await readFile(join(process.cwd(), 'public', 'backs', name));
      const url = toDataUrl(buf, name);
      if (url) return url;
    } catch {
      // Brak w bundlu - probujemy siec ponizej.
    }
  }

  // 2) Fetch: VERCEL_URL (deploy) najpierw, potem kanoniczna domena.
  const origins = [
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    'https://mysphere.fun',
  ].filter((o): o is string => Boolean(o));
  for (const origin of origins) {
    for (const name of names) {
      try {
        const res = await fetch(`${origin}/backs/${name}`, {
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; MySphereOG/1.0)' },
          cache: 'no-store',
        });
        if (!res.ok) continue;
        const ct = (res.headers.get('content-type') ?? '').split(';')[0];
        if (!ct.startsWith('image/')) continue;
        const url = toDataUrl(Buffer.from(await res.arrayBuffer()), name);
        if (url) return url;
      } catch {
        // Nastepny kandydat / origin.
      }
    }
  }

  return null;
}

/** Ten sam cache co reszta kart. */
export const OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=604800',
};
