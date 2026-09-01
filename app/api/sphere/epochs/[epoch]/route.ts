import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Surowy manifest epoki - BAJT W BAJT plik zapisany przez
 * scripts/sphere/publishEpoch.ts (razem z manifestHash i liscmi z proofami).
 * Zadnego reserializowania: kto chce zweryfikowac hash albo policzyc root
 * u siebie, dostaje dokladnie to, co opublikowal proposer.
 */

export async function GET(_req: Request, { params }: { params: { epoch: string } }) {
  // Bramka formatu odcina path traversal - do fs idzie wylacznie liczba.
  if (!/^\d{1,5}$/.test(params.epoch)) {
    return NextResponse.json({ error: 'bad epoch index' }, { status: 400 });
  }
  try {
    const raw = readFileSync(
      join(process.cwd(), 'scripts', 'output', 'sphere-epochs', `epoch-${Number(params.epoch)}.json`),
      'utf8'
    );
    return new NextResponse(raw, { headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch {
    return NextResponse.json({ error: 'manifest not published' }, { status: 404 });
  }
}
