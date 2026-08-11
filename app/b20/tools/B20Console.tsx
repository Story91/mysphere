'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { encodeAbiParameters, keccak256, parseUnits, type Address, type Hex } from 'viem';
import {
  HEX_SUBSTITUTES,
  expectedAttempts,
  isMineable,
  mineBatch,
  predictB20Address,
  type B20Variant,
  type VanityHit,
} from '../../utils/b20/addressing';

/**
 * Konsola B20: kopalnia adresow i budowniczy zobowiazan do memo.
 *
 * ===========================================================================
 * DLACZEGO CIEMNY PANEL W LAWENDOWEJ APLIKACJI
 * ===========================================================================
 * Reszta produktu to Soft Social: jasne tlo, biale karty, fiolet. Ten jeden
 * blok jest ciemny i monospace'owy CELOWO i jest to jedyne takie miejsce.
 *
 * Powod nie jest estetyczny, tylko znaczeniowy: kazda inna powierzchnia w tej
 * aplikacji to DOKUMENT - post, karta, rachunek, cos do przeczytania. To jest
 * MASZYNA, ktora pracuje, gdy na nia patrzysz, i ma sie tak czytac. Licznik
 * prob i przelatujace adresy sa prawdziwe, a nie dekoracyjne.
 *
 * ===========================================================================
 * CO TU SIE NAPRAWDE DZIEJE - I CZEGO TO NIE JEST
 * ===========================================================================
 * TO NIE JEST KOPANIE MONET. Nie powstaje ani jedna moneta, nic nie jest
 * zabezpieczane, nikt nie dostaje nagrody. Szukamy LADNEGO ADRESU dla tokena,
 * ktory dopiero powstanie.
 *
 * Da sie tak, bo fabryka B20 nadaje adresy deterministycznie: adres wynika
 * z adresu zakladajacego i z soli, ktora ten wybiera. Zmiana soli daje inny
 * adres, wiec mozna probowac, az ogon ulozy sie w slowo. Wzor sprawdzony
 * przeciwko `getB20Address` na mainnecie (4/4 przypadkow, oba warianty).
 *
 * Cale liczenie idzie w przegladarce. Zero zapytan do sieci, zero kosztu -
 * lancuch dowiaduje sie o wyniku dopiero przy wdrozeniu tokena.
 */

/* -------------------------------------------------------------------------- */
/*  KOPALNIA                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Ile prob na jedna partie.
 *
 * Petla bez oddawania sterowania zawiesza karte, wiec kopiemy partiami
 * i miedzy nimi oddajemy watek. 4000 to kompromis zmierzony na oko: dosc duzo,
 * zeby licznik szedl szybko, dosc malo, zeby "Stop" reagowal natychmiast.
 */
const BATCH = 4000;

function MinerPanel({ sender }: { sender: Address | undefined }) {
  const [pattern, setPattern] = useState('cafe');
  const [variant, setVariant] = useState<B20Variant>('asset');
  const [running, setRunning] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [rate, setRate] = useState(0);
  const [sample, setSample] = useState<string>('');
  const [hit, setHit] = useState<VanityHit | null>(null);

  const counterRef = useRef(0n);
  const startedRef = useRef(0);
  const runningRef = useRef(false);

  const target = pattern.trim().toLowerCase();
  const valid = isMineable(target);
  const expected = valid ? expectedAttempts(target) : 0;

  /** Znaki, ktorych w hex nie ma, razem z podpowiedzia zamiennika. */
  const impossible = [...pattern.toLowerCase()].filter((c) => !isMineable(c));

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
  }, []);

  const run = useCallback(() => {
    if (!sender || !valid) return;
    setHit(null);
    setAttempts(0);
    counterRef.current = 0n;
    startedRef.current = Date.now();
    runningRef.current = true;
    setRunning(true);

    const step = () => {
      if (!runningRef.current) return;

      const { hit: found, nextCounter } = mineBatch(
        sender,
        target,
        variant,
        counterRef.current,
        BATCH
      );

      const done = Number(nextCounter);
      counterRef.current = nextCounter;
      setAttempts(done);

      const seconds = (Date.now() - startedRef.current) / 1000;
      if (seconds > 0) setRate(Math.round(done / seconds));

      // Ostatni adres z partii jako podglad - zeby bylo widac, ze maszyna
      // pracuje na prawdziwych danych, a nie rysuje animacje.
      const ostatniaSol = `0x${(nextCounter - 1n).toString(16).padStart(64, '0')}` as Hex;
      setSample(predictB20Address(sender, ostatniaSol, variant));

      if (found) {
        setHit(found);
        runningRef.current = false;
        setRunning(false);
        return;
      }

      // setTimeout(0), a nie requestAnimationFrame: rAF zwalnia do 1 klatki
      // na sekunde w karcie w tle, a kopanie ma isc dalej, gdy ktos przelaczy
      // zakladke.
      window.setTimeout(step, 0);
    };

    step();
  }, [sender, target, valid, variant]);

  useEffect(() => () => {
    runningRef.current = false;
  }, []);

  return (
    <section className="rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5">
      <h2 className="font-soft-display text-[17px] font-bold text-soft-ink">Mine a token address</h2>
      <p className="mt-1 text-[12.5px] leading-[1.5] text-soft-ink-muted">
        A B20 address is derived from your wallet and a number you pick, so you can search for one
        that spells something. This is not mining coins: nothing is minted, nothing is secured, and
        it costs nothing. It runs in this tab.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[140px] flex-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint">
          Pattern
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value.slice(0, 8))}
            spellCheck={false}
            className="mt-1.5 block w-full rounded-lg border border-soft-line bg-soft-bg px-3 py-2 font-mono text-[14px] normal-case tracking-normal text-soft-ink outline-none focus:border-soft-primary"
          />
        </label>

        <div className="flex gap-1.5 pb-0.5">
          {(['asset', 'stablecoin'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              disabled={running}
              className={`rounded-pill border px-3 py-2 font-soft-display text-[12px] font-semibold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] disabled:opacity-50 ${
                variant === v
                  ? 'border-soft-primary bg-soft-surface text-soft-primary-deep'
                  : 'border-soft-line text-soft-ink-muted'
              }`}
            >
              {v === 'asset' ? 'Asset' : 'Stablecoin'}
            </button>
          ))}
        </div>
      </div>

      {impossible.length > 0 && (
        <p className="mt-2 text-[12px] leading-[1.5] text-soft-ink-muted">
          Addresses are hexadecimal, so{' '}
          <span className="font-mono">{[...new Set(impossible)].join(' ')}</span> cannot appear.
          {impossible.some((c) => HEX_SUBSTITUTES[c]) && (
            <>
              {' '}
              Try{' '}
              <span className="font-mono">
                {[...new Set(impossible)]
                  .map((c) => (HEX_SUBSTITUTES[c] ? `${c}→${HEX_SUBSTITUTES[c]}` : null))
                  .filter(Boolean)
                  .join(', ')}
              </span>
              .
            </>
          )}
        </p>
      )}

      {valid && (
        <p className="mt-2 text-[12px] leading-[1.5] text-soft-ink-muted">
          {target.length} characters, around{' '}
          <span className="font-mono tabular-nums">{expected.toLocaleString('en-US')}</span> tries on
          average.
          {target.length >= 7 && ' At this length expect to leave it running.'}
        </p>
      )}

      {/* ===== MASZYNA ===== */}
      <div className="mt-4 rounded-lg bg-[#0A1024] p-4 font-mono text-[12px] leading-[1.6] text-[#B9C6E0]">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            tries <span className="tabular-nums text-white">{attempts.toLocaleString('en-US')}</span>
          </span>
          <span>
            rate <span className="tabular-nums text-white">{rate.toLocaleString('en-US')}/s</span>
          </span>
          <span>
            state <span className="text-white">{running ? 'searching' : hit ? 'found' : 'idle'}</span>
          </span>
        </div>
        <div className="mt-2 break-all text-[11.5px] text-[#6E7FA6]">
          {hit ? hit.address : sample || '—'}
        </div>
      </div>

      {!sender && (
        <p className="mt-3 text-[12.5px] text-soft-ink-muted">
          Connect a wallet first. The address depends on who creates the token.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={running ? stop : run}
          disabled={!sender || !valid}
          className="rounded-lg bg-soft-primary px-4 py-2 font-soft-display text-[13px] font-semibold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
        >
          {running ? 'Stop' : 'Start'}
        </button>
      </div>

      {hit && (
        <div className="mt-3 rounded-lg border border-soft-line bg-soft-sunken p-3">
          <p className="font-mono text-[12.5px] break-all text-soft-ink">{hit.address}</p>
          <p className="mt-1.5 text-[11.5px] leading-[1.5] text-soft-ink-faint">
            Found after {hit.attempts.toLocaleString('en-US')} tries. Keep this salt. It is the only
            thing that reproduces this address:
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-soft-ink-muted">{hit.salt}</p>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  ZOBOWIAZANIE DO MEMO                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Ten sam skrot, ktory liczy `MemoPay.commitment` w Solidity.
 *
 * Liczony TUTAJ, a nie pobierany z lancucha, bo to czysta funkcja - a wywolanie
 * sieci po cos, co da sie policzyc lokalnie, dodaje tylko czekanie i awarie.
 * Jesli kiedys rozjedzie sie z kontraktem, rozjedzie sie CICHO: stad test
 * w test/MemoPay.test.ts sprawdzajacy te sama trojke pol.
 */
function commitment(
  payer: Address,
  to: Address,
  amount: bigint,
  invoiceRef: Hex,
  salt: Hex
): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'bytes32' }],
      [payer, to, amount, invoiceRef, salt]
    )
  );
}

/** Tekst -> bytes32, obcinany do 31 bajtow, zeby zawsze zostalo miejsce na zero. */
function toBytes32Text(text: string): Hex {
  const bytes = new TextEncoder().encode(text).slice(0, 31);
  let hex = '';
  bytes.forEach((b) => (hex += b.toString(16).padStart(2, '0')));
  return `0x${hex.padEnd(64, '0')}` as Hex;
}

function MemoPanel({ payer }: { payer: Address | undefined }) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('100');
  const [invoice, setInvoice] = useState('INV-2026-001');
  const [salt, setSalt] = useState<Hex>(() => randomSalt());
  const [decimals] = useState(18);

  function randomSalt(): Hex {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let hex = '';
    bytes.forEach((b) => (hex += b.toString(16).padStart(2, '0')));
    return `0x${hex}` as Hex;
  }

  let memo: Hex | null = null;
  let problem: string | null = null;

  if (!payer) problem = 'Connect a wallet to build a commitment.';
  else if (!/^0x[0-9a-fA-F]{40}$/.test(to)) problem = 'Enter the recipient address.';
  else {
    try {
      memo = commitment(payer, to as Address, parseUnits(amount || '0', decimals), toBytes32Text(invoice), salt);
    } catch {
      problem = 'That amount is not a number.';
    }
  }

  return (
    <section className="mt-4 rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5">
      <h2 className="font-soft-display text-[17px] font-bold text-soft-ink">
        Build a private receipt
      </h2>
      <p className="mt-1 text-[12.5px] leading-[1.5] text-soft-ink-muted">
        B20 transfers can carry 32 bytes. Put an invoice number there in plain text and everyone
        reading the chain knows what you bought. Put this hash there instead and nobody does, but
        you can prove it later to anyone, by showing the four fields it was made from.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint">
          Recipient
          <input
            value={to}
            onChange={(e) => setTo(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            className="mt-1.5 block w-full rounded-lg border border-soft-line bg-soft-bg px-3 py-2 font-mono text-[13px] normal-case tracking-normal text-soft-ink outline-none focus:border-soft-primary"
          />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint">
          Amount
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
            inputMode="decimal"
            className="mt-1.5 block w-full rounded-lg border border-soft-line bg-soft-bg px-3 py-2 font-mono text-[13px] normal-case tracking-normal text-soft-ink outline-none focus:border-soft-primary"
          />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint sm:col-span-2">
          What it is for
          <input
            value={invoice}
            onChange={(e) => setInvoice(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-soft-line bg-soft-bg px-3 py-2 text-[13px] normal-case tracking-normal text-soft-ink outline-none focus:border-soft-primary"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSalt(randomSalt())}
          className="rounded-lg border border-soft-line px-3 py-1.5 font-soft-display text-[12px] font-semibold text-soft-ink-muted transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
        >
          New salt
        </button>
        <span className="break-all font-mono text-[10.5px] text-soft-ink-faint">{salt}</span>
      </div>

      <div className="mt-3 rounded-lg bg-[#0A1024] p-3 font-mono text-[11.5px] leading-[1.6] text-[#B9C6E0]">
        <div className="text-[#6E7FA6]">memo</div>
        <div className="mt-1 break-all text-white">{memo ?? '—'}</div>
      </div>

      {problem && <p className="mt-2 text-[12px] text-soft-ink-muted">{problem}</p>}

      {/* Salt jest jedyna rzecza, ktorej nie da sie odtworzyc, wiec ostrzezenie
          stoi przy wyniku, a nie w regulaminie na dole strony. */}
      <p className="mt-3 border-t border-soft-line pt-2 text-[11.5px] leading-[1.5] text-soft-ink-faint">
        Keep the salt with the invoice. Without it the payment stays private from everyone,
        including you.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export default function B20Console() {
  const { address } = useAccount();

  return (
    <>
      <MinerPanel sender={address} />
      <MemoPanel payer={address} />
    </>
  );
}
