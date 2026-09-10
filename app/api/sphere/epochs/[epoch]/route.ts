import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Surowy manifest epoki - BAJT W BAJT plik zapisany przez
 * scripts/sphere/publishEpoch.ts (razem z manifestHash i liscmi z proofami).
 * Zadnego reserializowania: kto chce zweryfikowac hash albo policzyc root
 * u siebie, dostaje dokladnie to, co opublikowal proposer. Dlatego przy
 * zrodle HTTP oddajemy `r.text()` nietkniete, a nie JSON przepuszczony przez
 * parse/stringify - manifesty maja rozne konce linii i pretty-print, wiec
 * round-trip przez obiekt zmienialby bajty (sprawdzone na epoch-3.json).
 *
 * ===========================================================================
 * TE SAME ZRODLA, CO W LISCIE EPOK - POPRAWKA 2026-09-10
 * ===========================================================================
 * `.vercelignore` wyklucza CALE `scripts/` z deploya, wiec na produkcji
 * scripts/output/sphere-epochs nie istnieje i kazde zapytanie konczylo sie
 * 404 "manifest not published". publishEpoch.ts pisze ten sam plik takze do
 * public/sphere-epochs i na Blob - schodzimy po tej samej liscie zrodel, co
 * app/api/sphere/epochs/route.ts (celowa, malutka duplikacja: obie trasy
 * maja byc niezalezne od siebie).
 */

const MANIFEST_DIRS = [
  join(process.cwd(), 'scripts', 'output', 'sphere-epochs'),
  join(process.cwd(), 'public', 'sphere-epochs'),
];

function blobBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_VERCEL_BLOB_STORE_ID ?? '';
  const id = raw.replace(/["']/g, '').replace(/^store_/i, '').toLowerCase();
  return id ? `https://${id}.public.blob.vercel-storage.com/sphere-epochs` : null;
}

function originOf(req: Request): string | null {
  try {
    const url = new URL(req.url);
    const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
    return host ? `${proto}://${host}` : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: { epoch: string } }) {
  // Bramka formatu odcina path traversal - do fs idzie wylacznie liczba.
  if (!/^\d{1,5}$/.test(params.epoch)) {
    return NextResponse.json({ error: 'bad epoch index' }, { status: 400 });
  }
  const name = `epoch-${Number(params.epoch)}.json`;

  // Bajty, nie string - przy trasie, ktorej cala obietnica brzmi "bajt w bajt",
  // nie ma powodu przepuszczac tresci przez dekoder.
  //
  // UWAGA na dwie kopie tego samego manifestu: kopia w repo bywa zapisana
  // z CRLF (Windows), kopia na Blobie ma LF. To ten sam dokument - roznica
  // znika po normalizacji koncow linii, a manifestHash jest liczony nad
  // KANONICZNA jednolinijkowa forma (publishEpoch.ts, `canonical()`), wiec
  // weryfikacja hasha wypada identycznie z obu.
  for (const dir of MANIFEST_DIRS) {
    try {
      const raw = readFileSync(join(dir, name));
      return new NextResponse(raw, { headers: { 'content-type': 'application/json; charset=utf-8' } });
    } catch {
      /* nastepne zrodlo */
    }
  }

  const origin = originOf(req);
  const bases = [blobBase(), origin ? `${origin}/sphere-epochs` : null].filter((b): b is string => Boolean(b));
  for (const b of bases) {
    try {
      const r = await fetch(`${b}/${name}`, { cache: 'no-store' });
      if (r.ok) {
        return new NextResponse(await r.arrayBuffer(), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
    } catch {
      /* nastepne zrodlo */
    }
  }

  return NextResponse.json({ error: 'manifest not published' }, { status: 404 });
}
