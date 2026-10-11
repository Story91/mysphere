'use client';

import { useEffect, useState } from 'react';
import {
  ACTIVE_LAUNCHPAD_NETWORK,
  DEFAULT_LAUNCHPAD_CHAIN_ID,
  LAUNCHPAD_NETWORKS,
  type LaunchpadNetwork,
} from './config';

/**
 * "HOW IT WORKS" - jedno zrodlo opisu cyklu zycia tokena dla uzytkownika.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Do 9 wrzesnia 2026 caly opis cyklu zyl w dwoch miejscach, do ktorych nikt
 * z tablicy nie trafial: w stopce startpada i na /Docs/startpad, do ktorego
 * ze startpada NIE PROWADZIL zaden odnosnik. W samym interfejsie slowo
 * "Locked" nie mialo nigdzie wyjasnienia, a po graduacji nie bylo ani jednego
 * zdania odpowiadajacego na pytanie "to gdzie ja teraz sprzedam".
 *
 * Kazdy launchpad, ktory z tego zyje, rozwiazuje to tak samo: trzy stany
 * nazwane JEDNYM slowem, powtorzonym wszedzie (plakietka na karcie, pastylka
 * w naglowku tokena, naglowek w dokumentacji), tabela "faza / co mozesz
 * zrobic / co dalej" i tabela "gdzie ida pieniadze" z wierszem na kazdego
 * odbiorce. To jest ten komponent.
 *
 * ===========================================================================
 * DLACZEGO ZADNEJ LICZBY NIE MA TU WPISANEJ RECZNIE
 * ===========================================================================
 * Prog zbiorki to `4 x R_VIRT`, a `R_VIRT` jest argumentem konstruktora od
 * 2026-08-14. Zdanie "graduates at 3.00 ETH" jest prawda WYLACZNIE tam, gdzie
 * `R_VIRT` = 0.75 - na Arc launchpad zbiera 1000 USDC, a wdrozenie testowe
 * z 31 sierpnia zbiera 1 ETH. Kazda liczba ponizej liczy sie wiec z sieci,
 * ktora uzytkownik akurat oglada, i przy nastepnym wdrozeniu nie ma czego
 * poprawiac.
 *
 * ===========================================================================
 * DLACZEGO SIEC WCHODZI DOPIERO PO MONTAZU
 * ===========================================================================
 * Ta sama zasada, co w stopce: wybor sieci zyje w `localStorage`, wiec SSR
 * widzi zawsze siec DOMYSLNA. Wersja liczaca prog wprost ze stalych modulu
 * oddawala z serwera "3 ETH", a przy pierwszym renderze klienta na Arc
 * "1,000 USDC" - i React zglaszal blad hydratacji na kazdym wejsciu z
 * wybrana siecia inna niz domyslna.
 */

/**
 * Kwota krzywej. Trzy progi, bo ta sama funkcja pisze i 0.045, i 6250. Przy
 * dwoch miejscach po przecinku nagroda za `graduate()` (1,5% z 3) wychodzila
 * "0.05" - liczba ladna, ale nieprawdziwa i nie do odnalezienia w zdarzeniu
 * na lancuchu; przy zerowych kapitalizacja 18.75 robila sie "19".
 */
function amount(value: number): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: value < 1 ? 3 : value < 100 ? 2 : 0,
  });
}

/**
 * Jedno zdanie na stan, powtorzone wszedzie, gdzie ten stan sie pokazuje:
 * plakietka na karcie tablicy i pastylka w naglowku tokena.
 *
 * Slowo "Locked" nie tlumaczy sie samo, a znaczy rzecz, ktora kupujacy MUSI
 * zrozumiec: kupno jest zamkniete, sprzedaz nie. Zdanie stoi TUTAJ, a nie w
 * `LaunchpadBoard`, bo strona tokena tez go potrzebuje - a import z tamtego
 * modulu wciagnalby do jej pakietu cala tablice.
 */
export const STATE_HINT: Record<'Curve' | 'Locked' | 'Graduated', string> = {
  Curve: 'Trading against the bonding curve. Every buy raises the price and fills the curve.',
  Locked: 'The curve is full, so buying is closed and selling still works. Anyone can now open the Uniswap v4 pool.',
  Graduated: 'The curve is closed for good. Liquidity moved into a Uniswap v4 pool and trading happens there.',
};

/**
 * Trzy fazy, tymi samymi slowami, ktorymi nazywa je kontrakt (`State`).
 * Kolumna "co dalej" jest wazniejsza od "co teraz": pierwsze pytanie kogos,
 * kto patrzy na pasek postepu, brzmi "a co sie stanie, jak dojdzie do konca".
 */
function phasesFor(target: string): Array<{ phase: string; can: string; next: string }> {
  return [
    {
      phase: 'Curve',
      can: 'Buy and sell against the curve at the quoted price. Trading fee up to 1%, fixed at launch.',
      next: `Every buy fills the curve. At ${target} raised it locks.`,
    },
    {
      phase: 'Locked',
      can: 'Selling stays open. Buying reverts, because the curve has nothing left to sell.',
      next: 'Anyone can call graduate() and is paid 1.5% of the reserve for it.',
    },
    {
      phase: 'Graduated',
      can: 'Trade in the Uniswap v4 pool through any v4 router. The curve is closed for good.',
      next: 'Fees keep accruing to the creator and the protocol, and are claimed here.',
    },
  ];
}

/**
 * Gdzie ida pieniadze. Wiersz na kazdego odbiorce, lacznie z protokolem -
 * tabela, ktora przemilcza wlasna dzialke, jest warta tyle, co jej brak.
 *
 * Wiersz "Pool swap" mowi 1.30%, a nie 1%, bo pula v4 ma WLASNA oplate 0.30%
 * ponad oplate hooka. Wszedzie w interfejsie stalo samo "1%" i to zanizalo
 * koszt handlu po graduacji o jedna trzecia.
 */
function feesFor(gradFee: string): Array<{ fee: string; amountText: string; split: string }> {
  return [
    {
      fee: 'Curve trade',
      amountText: 'up to 1% of each buy and sell',
      split: 'up to 70% creator, at least 30% protocol',
    },
    {
      fee: 'Graduation',
      amountText: `3% of the reserve, once (${gradFee} off a full curve)`,
      split: 'half to whoever calls graduate(), half to the protocol',
    },
    {
      fee: 'Pool swap',
      amountText: '1.30% total: 0.30% to the pool, 1% to the hook',
      split: '70% creator, 30% protocol, on both streams',
    },
  ];
}

export function LifecycleGuide({ className = '' }: { className?: string }) {
  const [net, setNet] = useState<LaunchpadNetwork>(
    () => LAUNCHPAD_NETWORKS[DEFAULT_LAUNCHPAD_CHAIN_ID]
  );
  useEffect(() => setNet(ACTIVE_LAUNCHPAD_NETWORK), []);

  const symbol = net.quote?.symbol ?? net.chain.nativeCurrency.symbol;
  const rVirt = net.rVirt;
  const targetValue = rVirt * 4;
  const target = `${amount(targetValue)} ${symbol}`;
  const phases = phasesFor(target);
  const fees = feesFor(`${amount(targetValue * 0.03)} ${symbol}`);

  return (
    <details className={`group rounded-2xl border border-sp-shade/10 bg-sp-surface ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-[12.5px] font-extrabold text-sp-ink">
          How it works: curve, locked, pool
        </span>
        <span aria-hidden="true" className="text-[11px] font-extrabold text-sp-shade/40">
          open
        </span>
      </summary>

      <div className="border-t border-sp-shade/10 px-4 py-4">
        <p className="text-[11.5px] leading-[1.55] text-sp-shade/55">
          A launch mints 1,000,000,000 tokens once, straight to the curve. There is no creator
          allocation: a pre-buy is an ordinary buy on the same curve, at the same fee, in the same
          transaction. Up to 800M sell on the curve. When the curve has raised{' '}
          <strong className="text-sp-ink">{target}</strong> it locks, and the liquidity moves into a
          Uniswap v4 pool that nobody can withdraw.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[11.5px]">
            <thead>
              <tr className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">
                <th className="pb-2 pr-4">Phase</th>
                <th className="pb-2 pr-4">What you can do</th>
                <th className="pb-2">What happens next</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((row) => (
                <tr key={row.phase} className="border-t border-sp-shade/5 align-top">
                  <td className="py-2 pr-4 font-extrabold text-sp-ink">{row.phase}</td>
                  <td className="py-2 pr-4 text-sp-shade/60">{row.can}</td>
                  <td className="py-2 text-sp-shade/60">{row.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">
          What graduation actually does
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[11.5px] leading-[1.5] text-sp-shade/60">
          <li>
            The reserve left after the 3% fee, plus about 155M tokens, open one Uniswap v4 pool at
            the exact price the curve closed at. The leftover tokens go to the burn address.
          </li>
          <li>
            The LP position belongs to the vault contract and is{' '}
            <strong className="text-sp-ink">locked, not burned</strong>: there is no path that
            withdraws it, and the fees it earns are collected and split forever.
          </li>
          <li>
            A swap then costs 1.30%: 0.30% to the pool and 1% to the launch hook. Anyone may add
            their own liquidity to that pool, or open a separate pool without the hook.
          </li>
          <li>
            The token page keeps a Buy and Sell box after graduation, routed through the pool
            instead of the curve, on networks with a confirmed Universal Router. Elsewhere it shows
            the pool id and links to the PoolManager the pool lives in.
          </li>
        </ul>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[11.5px]">
            <thead>
              <tr className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">
                <th className="pb-2 pr-4">Fee</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2">Who gets it</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((row) => (
                <tr key={row.fee} className="border-t border-sp-shade/5 align-top">
                  <td className="py-2 pr-4 font-extrabold text-sp-ink">{row.fee}</td>
                  <td className="py-2 pr-4 text-sp-shade/60">{row.amountText}</td>
                  <td className="py-2 text-sp-shade/60">{row.split}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Skala jest cecha SIECI, nie produktu - i tylko powiedzenie tego
            wprost ratuje czytelnika, ktory widzial "3 ETH" gdzie indziej. */}
        <p className="mt-4 text-[11px] leading-[1.5] text-sp-shade/45">
          These numbers are read from the launchpad deployed on {net.label}: a virtual reserve of{' '}
          {amount(rVirt)} {symbol} makes the target {target} and a market cap of{' '}
          {amount(rVirt * 25)} {symbol} at graduation. Each network sets its own scale, so a target
          quoted on another network will differ.
        </p>

        {/* Do 9 wrzesnia 2026 ze startpada NIE PROWADZIL do dokumentacji ani
            jeden odnosnik - pelny opis lezal na /Docs/startpad i trafial tam
            tylko ten, kto zgadl adres. */}
        <a
          href="/Docs/startpad"
          className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-extrabold text-sp-brand-deep hover:underline"
        >
          Full documentation: the curve, the fees, the pool
        </a>
      </div>
    </details>
  );
}
