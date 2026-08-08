'use client';

import type { VaultFacts } from '../../utils/morpho/types';
import {
  formatApy,
  formatCurator,
  formatFactsAge,
  formatFeeBps,
  formatVaultUsd,
  incentiveStateOf,
  shortAddress,
  vaultLabel,
} from '../../utils/asks/vaultContext';

/**
 * Kontekst skarbca: co czlowiek widzi, zanim zada o niego pytanie.
 *
 * ===========================================================================
 * CALA KARTA STOI PO TO, ZEBY ROZBIC JEDNA LICZBE
 * ===========================================================================
 * Skarbiec pokazuje "7%" i to jest sklejka: czesc placa POZYCZKOBIORCY, czesc
 * jest CZASOWA DOPLATA w tokenach, ktora ktos finansuje i moze wylaczyc.
 * Pierwsza czesc zostaje, druga potrafi zniknac z dnia na dzien - a interfejsy
 * pokazuja sume, bo jedna duza liczba lepiej wyglada.
 *
 * Dlatego rozklad NIE JEST w rozwinieciu, tylko stoi bezposrednio pod liczba,
 * w tym samym bloku. Jesli ktos ma z tej karty wyniesc jedna rzecz, ma to byc
 * wlasnie to, ile z tego procentu jest czasowe.
 *
 * ===========================================================================
 * "NIE ZMIERZYLISMY" NIE JEST ZEREM
 * ===========================================================================
 * `incentiveApy === null` renderuje sie jako "incentive share not measured",
 * NIGDY jako "0% from incentives". Zerowa doplata to twierdzenie o skarbcu;
 * brak pomiaru to twierdzenie o nas. Karta, ktora je myli, klamie dokladnie
 * w tym miejscu, w ktorym mialas jej najbardziej ufac.
 *
 * ===========================================================================
 * KOLOR
 * ===========================================================================
 * Pomaranczowy (`soft-accent`) nalezy w tym produkcie WYLACZNIE do kwot. TVL
 * jest kwota w dolarach, wiec dostaje akcent. APY, prowizja i doplata SA
 * PROCENTAMI, nie kwotami - ida na `text-soft-ink`. To nie jest szczegol:
 * procent w kolorze pieniedzy czyta sie jak pieniadze.
 */

export type VaultFactsCardProps = {
  facts: VaultFacts;
  /** Bez ramki i tla - gdy karta siedzi juz w czyjejs karcie (np. w kompozytorze). */
  bare?: boolean;
  className?: string;
};

export default function VaultFactsCard({ facts, bare = false, className = '' }: VaultFactsCardProps) {
  const incentive = incentiveStateOf(facts.incentiveApy);
  // `null` = nie wiadomo, kiedy to zmierzono. Wtedy stopka po prostu milczy
  // o czasie zamiast napisac "just now" o czyms, czego nie wiemy.
  const age = formatFactsAge(facts.fetchedAt);

  return (
    <div
      className={`font-soft ${
        bare ? '' : 'rounded-card border border-soft-line bg-soft-surface p-3.5 shadow-card sm:p-4'
      } ${className}`}
    >
      {/* ===== KTO TO JEST ===== */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="min-w-0 break-words font-soft-display text-[14px] font-bold text-soft-ink">
          {vaultLabel(facts)}
        </h3>
        <span className="shrink-0 rounded-pill border border-soft-line bg-soft-sunken px-2 py-[1px] font-soft text-[10.5px] text-soft-ink-faint">
          Base
        </span>
      </div>
      <p className="mt-0.5 break-all font-soft text-[11px] text-soft-ink-faint">{facts.address}</p>

      {/* ===== ROZBITE OPROCENTOWANIE - POWOD ISTNIENIA TEJ KARTY ===== */}
      <div className="mt-3 rounded-lg bg-soft-sunken px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-soft-ink-faint">
            Net APY
          </span>
          {/* PROCENT NIE JEST KWOTA - zaden akcent, `soft-ink`. Brak pomiaru
              schodzi tez ROZMIAREM: slowa zlozone jak liczba czytaja sie jak
              wartosc, a to jest brak wartosci. */}
          {facts.netApy !== null ? (
            <span className="font-soft-display text-[20px] font-bold tabular-nums text-soft-ink">
              {formatApy(facts.netApy)}
            </span>
          ) : (
            <span className="font-soft text-[12px] text-soft-ink-faint">not measured</span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] leading-[1.45]">
          {facts.netApyWithoutRewards !== null ? (
            <span className="text-soft-ink-muted">
              <span className="font-semibold tabular-nums text-soft-ink">
                {formatApy(facts.netApyWithoutRewards)}
              </span>{' '}
              from borrowers
            </span>
          ) : (
            <span className="text-soft-ink-faint">borrower share not measured</span>
          )}

          <span className="text-soft-ink-faint" aria-hidden="true">
            ·
          </span>

          {incentive === 'some' ? (
            <span className="text-soft-ink-muted">
              <span className="font-semibold tabular-nums text-soft-ink">
                {formatApy(facts.incentiveApy as number)}
              </span>{' '}
              from incentives
            </span>
          ) : incentive === 'none' ? (
            // ZMIERZONE zero - wolno je nazwac, bo naprawde wiemy, ze doplaty nie ma.
            <span className="text-soft-ink-muted">nothing from incentives right now</span>
          ) : (
            // NIE ZMIERZONE. Nigdy "0% incentives".
            <span className="text-soft-ink-faint">incentive share not measured</span>
          )}
        </div>

        {incentive === 'some' && (
          <p className="mt-1.5 text-[11px] leading-[1.45] text-soft-ink-faint">
            The incentive part is a token top-up someone funds. It can stop; the borrower part is
            what the vault pays on its own.
          </p>
        )}
      </div>

      {/* ===== RESZTA FAKTOW ===== */}
      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
        <Fact label="Deposits">
          {facts.totalAssetsUsd !== null ? (
            // Jedyna KWOTA na tej karcie - i jedyne miejsce na pomaranczowy.
            <span className="tabular-nums text-soft-accent-deep">
              {formatVaultUsd(facts.totalAssetsUsd)}
            </span>
          ) : (
            <Unmeasured />
          )}
        </Fact>

        <Fact label="Vault fee">
          {facts.feeBps !== null ? (
            <span className="tabular-nums text-soft-ink">{formatFeeBps(facts.feeBps)}</span>
          ) : (
            <Unmeasured />
          )}
        </Fact>

        <Fact label="Curator" wide>
          {facts.curator ? (
            <span className="break-all text-soft-ink">{formatCurator(facts.curator)}</span>
          ) : (
            <Unmeasured />
          )}
        </Fact>
      </dl>

      {/* Migawka ma date. Bez niej "4.39%" udaje stan biezacy przez tydzien. */}
      <p className="mt-2.5 text-[10.5px] text-soft-ink-faint">
        Read from Morpho{age ? ` ${age}` : ''} · vault {shortAddress(facts.address)}
      </p>
    </div>
  );
}

function Fact({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-[10.5px] uppercase tracking-[0.12em] text-soft-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-soft-display text-[13px] font-semibold">{children}</dd>
    </div>
  );
}

/** Brak pomiaru ma wlasne slowo. Kreska albo zero czytalyby sie jak wartosc. */
function Unmeasured() {
  return <span className="font-soft text-[11.5px] font-normal text-soft-ink-faint">not measured</span>;
}
