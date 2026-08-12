'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  ACTIVE_LAUNCHPAD_NETWORK,
  B20_PRECOMPILE_ADDRESS,
  DEFAULT_LAUNCHPAD_CHAIN_ID,
  LAUNCHPAD_NETWORKS,
  type LaunchpadNetwork,
} from './config';

/**
 * STOPKA DOKUMENTACYJNA STARTPADU.
 *
 * Tresc jest skrotem `docs/LAUNCHPAD-DOSSIER.md` - przy kazdej zmianie
 * launchpada aktualizuje sie dossier ORAZ te stopke (ta sama zasada, ktora
 * pilnuje dossiera). Liczby sa przepisane z kontraktow, nie wymyslone:
 * 70/30, prog 3.00 ETH, 25x, buyback z dzialki tworcy.
 *
 * Zaden fragment nie potrzebuje stanu ani sieci - stopka to czysty HTML
 * (details/summary zamiast wlasnego akordeonu), wiec nie dorzuca ani jednego
 * hooka do i tak ciezkiego LaunchpadBoard.
 */

function shortAddr(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/* Krok cyklu zycia - chip z podpisem. Strzalki rysuje rodzic. */
function Step({ title, note }: { title: string; note: string }) {
  return (
    <div className="min-w-[130px] flex-1 rounded-xl border border-black/10 bg-white p-3">
      <p className="text-[12px] font-extrabold text-[#16141b]">{title}</p>
      <p className="mt-1 text-[11px] leading-[1.45] text-black/50">{note}</p>
    </div>
  );
}

function Arrow() {
  return (
    <span aria-hidden="true" className="hidden shrink-0 text-black/25 sm:block">
      →
    </span>
  );
}

/* Pasek podzialu oplaty - proporcje wprost z kontraktu, nie z CSS-owego oka. */
function SplitBar({ creator, protocol }: { creator: number; protocol: number }) {
  return (
    <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
      <div className="bg-soft-primary" style={{ width: `${creator}%` }} />
      <div className="bg-black/20" style={{ width: `${protocol}%` }} />
    </div>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-black/10 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-extrabold text-[#16141b] [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="text-black/30 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="pb-2 pt-3 text-[12.5px] leading-[1.55] text-black/60">{children}</div>
    </details>
  );
}

function contractsFor(net: LaunchpadNetwork): Array<{ name: string; address: string; role: string }> {
  const rows = [
    { name: 'CurveLaunchpad', address: net.launchpad, role: 'curve math, trading, fees, graduation' },
    { name: 'LiquidityVault', address: net.vault, role: 'owns the LP position forever, harvests LP fees' },
    { name: 'B20LaunchHook', address: net.hook, role: '1% swap fee after graduation, buyback accounting' },
    net.tokenStandard === 'b20'
      ? { name: 'B20TokenFactory', address: net.tokenFactory, role: 'asks the network to create each token, then verifies it' }
      : { name: 'PlainTokenFactory', address: net.tokenFactory, role: 'deploys each token (fixed supply, no mint function), then verifies it' },
  ];
  if (net.tokenStandard === 'b20') {
    rows.push({
      name: 'B20 factory (network precompile)',
      address: B20_PRECOMPILE_ADDRESS,
      role: 'built into Base itself; mints the token, enforces the cap',
    });
  }
  return rows;
}

export default function StartpadFooter() {
  /**
   * SSR renderuje siec DOMYSLNA (modul konfiguracyjny nie widzi localStorage
   * na serwerze), a wlasciwa siec wchodzi po montazu. Bez tego kroku HTML
   * z serwera i pierwszy render klienta roznilyby sie adresami - i React
   * zglaszalby blad hydratacji przy kazdym wejsciu z wybranym Robinhoodem.
   */
  const [net, setNet] = useState<LaunchpadNetwork>(() => LAUNCHPAD_NETWORKS[DEFAULT_LAUNCHPAD_CHAIN_ID]);
  useEffect(() => setNet(ACTIVE_LAUNCHPAD_NETWORK), []);
  const isB20 = net.tokenStandard === 'b20';

  return (
    <footer className="mt-10 border-t border-black/10 pb-10 pt-8">
      {/* ===== CO TO JEST - jedno zdanie, zanim pojda szczegoly ===== */}
      <div className="max-w-[72ch]">
        <p className={`flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] ${net.accentTextClass}`}>
          {net.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={net.logo} alt="" className="h-3.5 w-3.5 rounded-full" />
          )}
          How Startpad works
        </p>
        <h2 className="mt-1 text-[19px] font-extrabold text-[#16141b]">
          {isB20
            ? 'A launchpad for B20: tokens made by the Base network itself'
            : `A launchpad on ${net.label}: tokens with no admin and a fixed supply`}
        </h2>
        <p className="mt-2 text-[13px] leading-[1.6] text-black/60">
          {isB20 ? (
            <>
              Every token launched here is a <strong className="text-[#16141b]">B20</strong>: it is
              created by a factory built into the network, born with{' '}
              <strong className="text-[#16141b]">
                no admin, no pause switch and a supply cap equal to its supply
              </strong>{' '}
              so that nobody, including us, can ever mint more.
            </>
          ) : (
            <>
              Every token launched here is a plain ERC-20 deployed by the launchpad&apos;s own
              factory, born with <strong className="text-[#16141b]">no admin, no pause switch and no
              mint function at all</strong>. The supply is fixed by the bytecode, so nobody,
              including us, can ever mint more.
            </>
          )}{' '}
          The launchpad sells it on a bonding curve, and at exactly{' '}
          <strong className="text-[#16141b]">3.00 ETH</strong> raised the token graduates into a
          Uniswap v4 pool whose liquidity is locked forever. No admin keys, no upgrades: every rule
          below is fixed in immutable contracts, and all payouts are claim-based, in ETH.
          {isB20
            ? ` Startpad is among the first launchpads built on the B20 standard. Running live on ${net.label}.`
            : ` Running live on ${net.label}.`}
        </p>
      </div>

      {/* ===== CYKL ZYCIA - diagram z dossiera ===== */}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
        <Step title="1 · Launch" note="One transaction. The network mints the token, the curve gets the full supply. Optional pre-buy on the same curve as everyone." />
        <Arrow />
        <Step title="2 · Curve" note="Buy and sell against the curve. 1% trading fee. Price rises with every buy along a constant-product curve." />
        <Arrow />
        <Step title="3 · Locked" note="Reserve hits exactly 3.00 ETH. Buys revert, sells still work. The token waits for graduation." />
        <Arrow />
        <Step title="4 · Graduated" note="Anyone may call graduate() and earns 0.045 ETH for it. Liquidity moves to a Uniswap v4 pool at the exact closing price." />
      </div>

      <div className="mt-6">
        {/* ===== SZCZEGOLY - akordeony, zeby stopka nie przygniotla rynku ===== */}
        <DocSection title="The curve in numbers">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <tbody>
                {[
                  ['Total supply (minted once, to the curve)', '1,000,000,000'],
                  ['Sold on the curve', 'up to 800,000,000 (80%)'],
                  ['Moved to the pool at graduation', '200,000,000 (20%)'],
                  ['Starting market cap', '0.75 ETH'],
                  ['Graduation trigger', 'reserve = 3.00 ETH exactly'],
                  ['Market cap at graduation', '18.75 ETH (25×)'],
                  ['Creator allocation', 'none (a pre-buy is a normal buy on the same curve)'],
                ].map(([k, v]) => (
                  <tr key={k} className="border-t border-black/5 first:border-t-0">
                    <td className="py-1.5 pr-4 text-black/55">{k}</td>
                    <td className="py-1.5 font-bold text-[#16141b]">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11.5px] text-black/45">
            Solvency invariant: selling every circulating token back returns exactly the ETH reserve.
            The virtual 0.75 ETH is never paid out.
          </p>
        </DocSection>

        <DocSection title="Where every fee goes: the creator gets up to 70%, everywhere">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-black/10 bg-white p-3">
              <p className="text-[12px] font-extrabold text-[#16141b]">Curve trade · 1%</p>
              <SplitBar creator={70} protocol={30} />
              <p className="mt-2 text-[11.5px] text-black/55">
                Up to 70% to the creator&apos;s fee receivers (up to 8 addresses), minimum 30% to the
                protocol. The 30% floor is enforced by the contract, not by the form.
              </p>
            </div>
            <div className="rounded-xl border border-black/10 bg-white p-3">
              <p className="text-[12px] font-extrabold text-[#16141b]">Graduation · 3% of reserve, once</p>
              <SplitBar creator={50} protocol={50} />
              <p className="mt-2 text-[11.5px] text-black/55">
                0.09 ETH total: half to whoever calls graduate(), half to the protocol. The remaining
                ~2.91 ETH plus 200M tokens become the locked pool.
              </p>
            </div>
            <div className="rounded-xl border border-black/10 bg-white p-3">
              <p className="text-[12px] font-extrabold text-[#16141b]">Pool swap · 1% hook fee</p>
              <SplitBar creator={70} protocol={30} />
              <p className="mt-2 text-[11.5px] text-black/55">
                Protocol always receives its full 30%. The creator&apos;s 70% is split by the
                creator&apos;s own launch-time choice between “paid to me in ETH” and the auto-buyback.
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11.5px] text-black/45">
            Auto-buyback is funded only from the creator&apos;s share: at a 50% setting, of a 1% swap
            fee 0.30% goes to the protocol, 0.35% buys &amp; burns the token (sent to 0x…dEaD), 0.35%
            is paid to the creator. Anyone may execute a pending buyback; price impact per execution
            is capped, so it cannot be used to sandwich the pool.
          </p>
        </DocSection>

        <DocSection title="What a creator sets at launch (immutable afterwards)">
          <ul className="list-disc space-y-1 pl-5">
            <li>Name, symbol and metadata: free text. The logo lives off-chain, editable only by the creator verified on-chain.</li>
            <li>Trading fee (0–1%, default 1%) and the creator&apos;s share of it (0–70%, default 70%).</li>
            <li>Fee receivers: up to 8 addresses, shares summing to 100%.</li>
            <li>Auto-buyback slice of the creator&apos;s pool-fee share (0–100%, default 0%).</li>
            <li>Sniper cap: per-wallet buy limit for the first 5 minutes, chosen in Creator setup (for example 4M or 8M tokens). A Quick launch sets no cap, and the creator can disable protection entirely.</li>
            <li>Pre-buy: any ETH amount, on the same curve and fee as everyone else.</li>
          </ul>
          <p className="mt-2 text-[11.5px] text-black/45">
            Nothing on this list has a setter. Changing any of it means launching a new token.
          </p>
        </DocSection>

        <DocSection title="Why you can trust it (and what to still be careful about)">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong className="text-[#16141b]">The token cannot be inflated.</strong> It is born with supply cap = total supply and no MINT role held by anyone. The launchpad verifies this on-chain in the launch transaction and reverts if it is not true.</li>
            <li><strong className="text-[#16141b]">No roles anywhere.</strong> No owner, no pauser, no upgrader on the token, the launchpad, the vault or the hook. The fee caps bind us too.</li>
            <li><strong className="text-[#16141b]">LP is locked forever.</strong> The vault&apos;s only path to the pool has the liquidity change hard-coded to zero: it can harvest fees, never withdraw capital.</li>
            <li><strong className="text-[#16141b]">Pull payments only.</strong> You claim your ETH; nothing is pushed. Anyone may pay gas to deliver your balance to you, never to themselves.</li>
            <li><strong className="text-[#16141b]">What this is not:</strong> most tokens here will never trade meaningfully, a curve token has no external chart until it graduates, and nothing on this page is a recommendation.</li>
          </ul>
        </DocSection>

        <DocSection title={`Contracts (${net.label})`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-left">
              <tbody>
                {contractsFor(net).map((contract) => (
                  <tr key={contract.name} className="border-t border-black/5 first:border-t-0">
                    <td className="py-1.5 pr-4 font-bold text-[#16141b]">{contract.name}</td>
                    <td className="py-1.5 pr-4 text-black/55">{contract.role}</td>
                    <td className="py-1.5">
                      <a
                        href={`${net.explorerUrl}/address/${contract.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[11.5px] font-bold text-soft-primary-deep hover:text-soft-primary"
                      >
                        {shortAddr(contract.address)}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11.5px] text-black/45">
            {isB20
              ? 'The network precompile is not our contract. It is part of Base, and the reason a B20 token can make promises its creator cannot break.'
              : `${net.label} has no B20 precompile, so here the same promises are kept by bytecode: the token contract simply has no function that could mint, pause or confiscate.`}
          </p>
        </DocSection>
      </div>

      <p className="mt-6 text-[11px] text-black/40">
        {net.testnet
          ? `Startpad runs on ${net.label} (testnet), so tokens here have no real value. Nothing on this page is financial advice.`
          : `Startpad runs on ${net.label}. Trades here move real ETH. Nothing on this page is financial advice.`}
      </p>
    </footer>
  );
}
