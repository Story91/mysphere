'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { VaultFacts, VaultListResult } from '../../utils/morpho/types';
import { vaultLabel } from '../../utils/asks/vaultContext';
import VaultFactsCard from './VaultFactsCard';

/**
 * Wybor skarbca do Aska - Z LISTY, nigdy z klawiatury.
 *
 * ===========================================================================
 * DLACZEGO NIE POLE TEKSTOWE
 * ===========================================================================
 * Zaczatek "Vault risk" ma w sobie `<vault address>` i do dzis kazdy wpisywal
 * tam adres recznie. Adres z literowka wyglada jak adres, przechodzi walidacje
 * "czy cos wpisano" i daje Aska o skarbcu, ktory nie istnieje - z budzetem,
 * terminem i odpowiadajacymi, ktorzy nie maja czego przeczytac. Z listy nie da
 * sie wybrac adresu, ktorego nie ma.
 *
 * Drugi zysk jest wazniejszy: wybor z listy przynosi RAZEM Z ADRESEM komplet
 * liczb (`VaultListResult` niesie pelne `VaultFacts`), wiec pytajacy widzi
 * rozklad oprocentowania ZANIM zaplaci za pytanie o niego.
 *
 * ===========================================================================
 * AWARIA MORPHO NIE MOZE ZATRZYMAC ASKA
 * ===========================================================================
 * Ten blok jest DODATKIEM do formularza. Nieudany odczyt listy pokazuje wlasna
 * linie i wlasne "Try again" (wzorzec `FailedLine` z FeedAskRail.tsx) - i nic
 * poza tym. Zaden stan tego komponentu nie blokuje przycisku "Post ask": Aska
 * ma sie dac zalozyc takze wtedy, gdy Morpho milczy.
 *
 * Loader wolamy w `try`, bo wstrzyknieta funkcja moze RZUCIC, a nie tylko
 * zwrocic `ok: false` - rzucona obietnica w efekcie przewrocilaby caly
 * kompozytor, czyli formularz od pieniedzy.
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; vaults: VaultFacts[] }
  | { kind: 'failed'; reason: 'unavailable' | 'not-found' | 'malformed' };

export type AskVaultPickerProps = {
  /**
   * Skad biora sie notowane skarbce. WSTRZYKIWANY, a nie importowany na sztywno:
   * kompozytor stoi w dwoch miejscach i zaden z nich nie ma prawa placic za
   * odczyt Morpho, gdy nikt o skarbiec nie pyta.
   */
  loadVaults: () => Promise<VaultListResult>;
  selected: VaultFacts | null;
  onSelect: (facts: VaultFacts | null) => void;
  disabled?: boolean;
};

/** Co pisze przy nieudanym odczycie. Kazdy powod mowi co innego - i zaden nie mowi "pusto". */
const FAILURE_TEXT: Record<'unavailable' | 'not-found' | 'malformed', string> = {
  unavailable:
    'Morpho could not be reached, so the vault list is missing. This is a failed read, not an empty list.',
  'not-found': 'Morpho returned no vault list for Base. This is a failed read, not an empty list.',
  malformed:
    'Morpho answered with something we could not read, so the vault list is missing. This is a failed read, not an empty list.',
};

export default function AskVaultPicker({
  loadVaults,
  selected,
  onSelect,
  disabled = false,
}: AskVaultPickerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: 'loading' });

    (async () => {
      try {
        const result = await loadVaults();
        if (cancelled) return;
        setPhase(
          result.ok ? { kind: 'ready', vaults: result.vaults } : { kind: 'failed', reason: result.reason }
        );
      } catch (error) {
        if (cancelled) return;
        console.error('[asks] Odczyt listy skarbcow nie powiodl sie:', error);
        setPhase({ kind: 'failed', reason: 'unavailable' });
      }
    })();

    return () => {
      cancelled = true;
    };
    // `loadVaults` celowo poza zaleznosciami: wolajacy czesto poda ja jako
    // literal, a wtedy kazdy render rodzica wysylalby zapytanie od nowa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const pick = useCallback(
    (address: string) => {
      if (phase.kind !== 'ready') return;
      onSelect(phase.vaults.find((vault) => vault.address === address) ?? null);
    },
    [phase, onSelect]
  );

  return (
    <div>
      <label className="block text-[12px] font-semibold text-soft-ink-muted">
        Pick a listed vault

        {phase.kind === 'ready' && phase.vaults.length > 0 && (
          <select
            value={selected?.address ?? ''}
            disabled={disabled}
            onChange={(event) => pick(event.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-soft-line bg-soft-surface px-3 py-2 font-soft text-[14px] font-normal normal-case tracking-normal text-soft-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-50"
          >
            <option value="">No vault (this ask is not about one)</option>
            {phase.vaults.map((vault) => (
              <option key={vault.address} value={vault.address}>
                {vaultLabel(vault)}
              </option>
            ))}
          </select>
        )}
      </label>

      {phase.kind === 'loading' && (
        <p className="mt-1.5 text-[11.5px] leading-[1.45] text-soft-ink-faint">
          Checking listed vaults…
        </p>
      )}

      {phase.kind === 'failed' && (
        <FailedLine message={`${FAILURE_TEXT[phase.reason]} You can still post this ask.`} onRetry={retry} />
      )}

      {/* Pusta lista to NIE awaria - i musi czytac sie inaczej niz awaria. */}
      {phase.kind === 'ready' && phase.vaults.length === 0 && (
        <p className="mt-1.5 text-[11.5px] leading-[1.45] text-soft-ink-faint">
          No vaults are listed right now, so there is none to attach. The ask works without one.
        </p>
      )}

      {selected && (
        <>
          <VaultFactsCard
            facts={selected}
            className="mt-2.5 rounded-lg border border-soft-line bg-soft-sunken p-3"
            bare
          />
          <p className="mt-1.5 text-[11.5px] leading-[1.45] text-soft-ink-faint">
            These numbers get attached to your ask, so whoever answers argues with the same snapshot
            you saw.
          </p>
          {/* Jedyny moment w produkcie, w ktorym czlowiek patrzy na prowizje
              KONKRETNEGO skarbca - wiec zapis zmian jest tu dana na miejscu,
              a nie osobna wycieczka. Prowizja to procent, nie kwota: odnosnik
              idzie fioletem, nie bursztynem. */}
          <p className="mt-1 text-[11.5px] leading-[1.45] text-soft-ink-faint">
            Fee and curator changes for listed vaults are on{' '}
            <Link
              href="/curators"
              className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              the curator record
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Awaria ma wlasny slad i wlasne wyjscie - nigdy nie udaje pustki. Wzorzec
 * przepisany z `FailedLine` w FeedAskRail.tsx; tamten nie jest wyeksportowany,
 * a eksportowanie go stad przez pol repo zwiazaloby pas nad feedem z formularzem
 * od pieniedzy.
 */
function FailedLine({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="status"
      className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-soft-line bg-soft-sunken px-3 py-2.5"
    >
      <p className="min-w-0 flex-1 break-words font-soft text-[11.5px] font-normal normal-case leading-[1.5] tracking-normal text-soft-ink-muted">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-lg border border-soft-line bg-soft-surface px-3 py-1 font-soft-display text-[11.5px] font-semibold normal-case tracking-normal text-soft-ink-muted transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
      >
        Try again
      </button>
    </div>
  );
}
