/**
 * Odczyt wlasnosci tokena z retry - lekarstwo na wyscig z publicznym RPC.
 *
 * `launchOf` wolane tuz po wykopaniu bloku startu potrafi oddac state 0
 * ("nie znam tego tokena"), bo publiczny RPC oddaje nieswieze odczyty tuz po
 * zapisie. Pojedynczy odczyt zamienial ten wyscig w 404 i logo przepadalo.
 * Kilka prob z odstepem rozwiazuje go w calosci: po paru sekundach kazdy
 * node juz widzi token. Modul jest czysty (odczyt wstrzykniety), wiec testuje
 * sie bez sieci - patrz test/LaunchpadOwnershipRetry.test.ts.
 */

export type LaunchStateRead = { creator: string; state: number };

export type CreatorResolution =
  | { ok: true; creator: string }
  | { ok: false; reason: 'unknown_token' | 'chain_unavailable' };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function resolveCreatorWithRetry(
  read: () => Promise<LaunchStateRead>,
  opts: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<CreatorResolution> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 2000;
  const sleep = opts.sleep ?? wait;

  // Ostatnia napotkana porazka decyduje o powodzie odmowy: state 0 po zdrowym
  // odczycie to "launchpad nie zna tokena", wyjatek to "lancuch niedostepny".
  let reason: 'unknown_token' | 'chain_unavailable' = 'chain_unavailable';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(delayMs);
    try {
      const launch = await read();
      if (launch.state !== 0) return { ok: true, creator: launch.creator };
      reason = 'unknown_token';
    } catch {
      reason = 'chain_unavailable';
    }
  }
  return { ok: false, reason };
}
