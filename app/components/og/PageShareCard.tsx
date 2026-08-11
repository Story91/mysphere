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
 * Laduje tlo karty z public/backs/. Probuje <slug>.png, potem <slug>.jpg.
 * Zwraca data-URL albo null (wtedy karta jest ciemna, fallback). Fetch z
 * KANONICZNEJ domeny - obraz jest statycznym assetem tego samego serwisu; gdy
 * pliku nie ma, proba konczy sie null i karta dziala jak dotad.
 *
 * Limit 15 MB, bo tla sa duzymi PNG-ami (~6-7 MB). Wynikowa karta to i tak
 * przerenderowany PNG 1200x630, wiec jej rozmiar zalezy od kadru, nie od zrodla.
 */
const OG_ORIGIN = 'https://mysphere.fun';

export async function loadOgBg(slug: string): Promise<string | null> {
  const candidates = [`${slug}.png`, `${slug}.jpg`];
  for (const name of candidates) {
    try {
      const res = await fetch(`${OG_ORIGIN}/backs/${name}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') ?? '').split(';')[0];
      if (!ct.startsWith('image/')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 15_000_000) continue;
      return `data:${ct};base64,${buf.toString('base64')}`;
    } catch {
      // Brak pliku / blad sieci - probujemy nastepny kandydat.
    }
  }
  return null;
}

/** Ten sam cache co reszta kart. */
export const OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=604800',
};
