'use client';

import { useEffect, useState } from 'react';
import type { Clash } from '../duel';

/**
 * Jedno zrodlo starc dla calego klienta. /api/launchpad/clashes bylo wolane z
 * trzech miejsc w trzech rytmach (hub co 60 s, zakladka co 30 s, naglowek tokena
 * raz); trasa skanuje lancuch przyrostowo, wiec kazdy dodatkowy konsument to
 * dodatkowe obciazenie. Tu: jeden fetch, jeden timer, wszyscy subskrybenci.
 * `null` = jeszcze nie przyszlo nic; blad bez wczesniejszych danych daje `[]`.
 */
const POLL_MS = 30_000;

let store: Clash[] | null = null;
const subscribers = new Set<(value: Clash[] | null) => void>();
let timer: number | undefined;

const RETRY_MS = 5_000;
const MAX_QUIET_FAILURES = 3;
let failures = 0;

async function load(): Promise<void> {
  let next: Clash[] | null = null;
  try {
    const response = await fetch('/api/launchpad/clashes');
    if (response.ok) next = ((await response.json()) as { clashes?: Clash[] }).clashes ?? [];
  } catch {
    // siec padla - zostaja poprzednie dane
  }
  if (next === null) {
    // Blad bez zadnych danych (zimny serwer, RPC pod obciazeniem): "No duels yet" byloby
    // nieprawda, wiec zostaje ladowanie i szybki ponowny strzal; dopiero po kilku porazkach pusto.
    failures += 1;
    if (store === null && failures < MAX_QUIET_FAILURES) {
      window.setTimeout(() => void load(), RETRY_MS);
      return;
    }
    next = store ?? [];
  } else {
    failures = 0;
  }
  store = next;
  subscribers.forEach((notify) => notify(next));
}

function start(): void {
  if (timer !== undefined) return;
  void load();
  timer = window.setInterval(() => void load(), POLL_MS);
}

function stopWhenIdle(): void {
  if (subscribers.size > 0 || timer === undefined) return;
  window.clearInterval(timer);
  timer = undefined;
}

export function useClashes(): Clash[] | null {
  const [value, setValue] = useState<Clash[] | null>(store);
  useEffect(() => {
    subscribers.add(setValue);
    setValue(store);
    start();
    return () => {
      subscribers.delete(setValue);
      stopWhenIdle();
    };
  }, []);
  return value;
}
