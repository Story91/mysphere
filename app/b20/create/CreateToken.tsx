'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base } from 'viem/chains';
import { formatEther, type Address, type Hex } from 'viem';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import {
  HEX_SUBSTITUTES,
  expectedAttempts,
  isMineable,
  mineBatch,
  predictB20Address,
  saltFromCounter,
} from '../../utils/b20/addressing';
import {
  B20_FACTORY_ADDRESS,
  B20_SUPPLY_TOKENS,
  NAME_MAX,
  SYMBOL_MAX,
  encodeCreateCall,
  suggestSymbol,
  validateName,
  validateSymbol,
} from '../../utils/b20/create';

/**
 * EKRAN TWORZENIA TOKENA B20.
 *
 * ===========================================================================
 * TO NIE JEST ATRAPA. TA STRONA ROBI PRAWDZIWY TOKEN.
 * ===========================================================================
 * Fabryka B20 to precompile, ktory dziala na Base od miesiaca i wypuszcza okolo
 * pieciuset tokenow dziennie. Nie trzeba czekac na nasz launchpad, zeby zrobic
 * token - trzeba tylko poprawnie zakodowac wywolanie. Ksztalt wywolania zostal
 * odczytany z realnej transakcji i potwierdzony symulacja (patrz naglowek
 * app/utils/b20/create.ts).
 *
 * ===========================================================================
 * PRZYCISK WLACZA SYMULACJA, NIE FLAGA W KODZIE
 * ===========================================================================
 * Zanim ktokolwiek cokolwiek podpisze, wysylamy DOKLADNIE TE SAMA calldata
 * przez eth_call z jego adresu i sprawdzamy, czy lancuch oddaje adres, ktory
 * policzylismy lokalnie. Zgoda dwoch niezaleznych sciezek jest warunkiem
 * odblokowania podpisu.
 *
 * Flaga w kodzie ("launchpad wdrozony: tak") zostaje kiedys nieaktualna
 * i strona zaczyna klamac po cichu. Symulacja nie moze sie zdezaktualizowac,
 * bo jest odczytem z tej samej sieci, do ktorej za chwile pojdzie transakcja.
 * Uwaga: eth_getCode NIE nadaje sie tutaj - precompile nie ma kodu, wiec pusta
 * odpowiedz nic nie znaczy.
 *
 * ===========================================================================
 * KOPALNIA ADRESOW JEST TU PRAWDZIWA, A NIE OZDOBNA
 * ===========================================================================
 * Adres B20 wynika z `msg.sender` i z soli. Wolamy fabryke WPROST z portfela
 * uzytkownika, wiec `msg.sender` to jego portfel - i adres wykopany na tym
 * ekranie jest adresem, ktory naprawde powstanie. (Gdyby transakcje skladal
 * launchpad, msg.sender bylby launchpadem i wykopany adres nigdy by nie
 * powstal. Ta pulapka jest tu wiec zamknieta z definicji, a nie obejsciem.)
 *
 * Zasada obslugi: KOPANIE NIGDY NIE BLOKUJE TWORZENIA. Przycisk dziala przez
 * caly czas z adresem, ktory widac na ekranie. Kopalnia, ktora kaze czekac,
 * przestaje byc czescia tworzenia i staje sie gadzetem.
 *
 * ===========================================================================
 * PODPIS TO JESZCZE NIE JEST TOKEN
 * ===========================================================================
 * Po podpisie mamy hash, a nie token. Transakcja moze odpasc na lancuchu -
 * wtedy nie ma ani tokena, ani wykopanego adresu, jest tylko spalony gaz.
 * Dlatego ekran koncowy czeka na pokwitowanie i rozroznia CZTERY stany:
 * w drodze, weszlo, odrzucone, nie udalo sie odczytac. Napis "{TICKER} is on
 * Base" pojawia sie WYLACZNIE przy `status === 'success'`.
 *
 * ===========================================================================
 * CZEGO NIE MA I DLACZEGO TO NIE JEST BRAK
 * ===========================================================================
 * WLASNEJ STRONY TOKENA. Trasa /b20/[address] nie istnieje, wiec ekran koncowy
 * prowadzi na Basescan i na nasza liste - a nie pod adres, ktory oddalby 404.
 * PULI. Ta transakcja tworzy token i nic wiecej; obietnica ceny albo wykresu
 * bylaby klamstwem, bo indeksery reaguja na powstanie PULI, nie tokena.
 */

const CARD = 'rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5';
const FIELD =
  'w-full rounded-card border border-soft-line bg-soft-sunken px-3 py-2.5 font-soft text-[14px] text-soft-ink outline-none transition-colors [transition-duration:var(--dur-press)] placeholder:text-soft-ink-faint focus:border-soft-primary';
const LABEL = 'font-soft-display text-[12.5px] font-bold text-soft-ink';

/** Ile prob na jedna partie kopania - tyle samo, co w konsoli na /b20/tools. */
const BATCH = 4000;

type Phase = 'form' | 'review' | 'sending' | 'done';

type SimState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; address: Address }
  | { kind: 'mismatch'; chainSaid: string; weSaid: string }
  | { kind: 'failed'; message: string };

/**
 * Co sie stalo z podpisana transakcja. CZTERY stany, bo trzy z nich mowia
 * rozne rzeczy: `pending` nie jest sukcesem (token jeszcze nie istnieje),
 * `reverted` jest awaria (token NIE powstal), a `unread` znaczy tylko tyle,
 * ze nie udalo nam sie tego odczytac - i nie wolno go mylic z porazka.
 */
type Landed =
  | { kind: 'pending' }
  | { kind: 'success' }
  | { kind: 'reverted' }
  | { kind: 'unread'; message: string };

/** Oplata sieciowa zmierzona przy symulacji. Nieodczytana NIE ZNACZY zerowa. */
type FeeState = { kind: 'idle' } | { kind: 'ok'; wei: bigint; gas: bigint } | { kind: 'unread' };

/**
 * Oplata w ETH bez notacji wykladniczej i bez zaokraglenia do zera.
 * Kwota rzedu 1e-6 ETH wpisana przez `toFixed(4)` dalaby "0.0000", czyli
 * darmowa transakcje - a ta jest darmowa nigdy.
 */
function formatEthFee(wei: bigint): string {
  const [whole, fraction = ''] = formatEther(wei).split('.');
  const cut = fraction.slice(0, 8).replace(/0+$/, '');
  if (!cut) return whole === '0' ? '<0.00000001' : whole;
  return `${whole}.${cut}`;
}

export default function CreateToken() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [symbolTouched, setSymbolTouched] = useState(false);
  /** Domyslnie NIKT nie zostaje adminem - patrz panel nieodwracalnosci. */
  const [keepAdmin, setKeepAdmin] = useState(false);

  const [pattern, setPattern] = useState('');
  const [mining, setMining] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [rate, setRate] = useState(0);
  const [salt, setSalt] = useState<Hex>(saltFromCounter(0n));
  const [spelled, setSpelled] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('form');
  const [sim, setSim] = useState<SimState>({ kind: 'idle' });
  const [fee, setFee] = useState<FeeState>({ kind: 'idle' });
  const [txHash, setTxHash] = useState<string | null>(null);
  const [landed, setLanded] = useState<Landed>({ kind: 'pending' });
  const [sendError, setSendError] = useState<string | null>(null);

  const counterRef = useRef(0n);
  const runningRef = useRef(false);
  const startedRef = useRef(0);

  const nameError = name.length > 0 ? validateName(name) : null;
  const symbolError = symbol.length > 0 ? validateSymbol(symbol) : null;
  const ready = !validateName(name) && !validateSymbol(symbol) && isConnected && !!address;

  /* --- adres jest zywy od chwili polaczenia portfela, bez zadnego zapytania --- */
  const predicted = useMemo(
    () => (address ? predictB20Address(address, salt, 'asset') : null),
    [address, salt]
  );

  /* --- ticker podpowiadany z nazwy, dopoki czlowiek go nie tknie --- */
  useEffect(() => {
    if (!symbolTouched) setSymbol(suggestSymbol(name));
  }, [name, symbolTouched]);

  /* --- kopanie: startuje samo po wpisaniu wzorca, bez przycisku "Start" --- */
  const target = pattern.trim().toLowerCase();
  const patternOk = target.length > 0 && isMineable(target);
  const impossible = [...target].filter((c) => !isMineable(c));

  const stopMining = useCallback(() => {
    runningRef.current = false;
    setMining(false);
  }, []);

  useEffect(() => {
    if (!address || !patternOk) {
      runningRef.current = false;
      setMining(false);
      return;
    }
    // Nowy wzorzec = nowe poszukiwanie. Licznik startuje od zera, zeby liczba
    // prob odpowiadala temu, co czlowiek widzi, a nie sumie wszystkich sesji.
    counterRef.current = 0n;
    startedRef.current = Date.now();
    runningRef.current = true;
    setMining(true);
    setAttempts(0);
    setRate(0);

    let cancelled = false;
    const step = () => {
      if (cancelled || !runningRef.current) return;
      const { hit, nextCounter } = mineBatch(address, target, 'asset', counterRef.current, BATCH);
      counterRef.current = nextCounter;
      const done = Number(nextCounter);
      setAttempts(done);
      const elapsed = (Date.now() - startedRef.current) / 1000;
      if (elapsed > 0) setRate(Math.round(done / elapsed));
      if (hit) {
        runningRef.current = false;
        setMining(false);
        setSalt(hit.salt);
        setSpelled(target);
        return;
      }
      // Oddajemy sterowanie miedzy partiami - petla bez tego zawiesza karte.
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
    return () => {
      cancelled = true;
      runningRef.current = false;
    };
  }, [address, target, patternOk]);

  /* --- symulacja: warunek odblokowania podpisu --- */
  const runSimulation = useCallback(async () => {
    if (!address || !publicClient || !predicted) return;
    setSim({ kind: 'checking' });
    setFee({ kind: 'idle' });
    try {
      const data = encodeCreateCall({
        name: name.trim(),
        symbol: symbol.trim(),
        admin: keepAdmin ? address : null,
        salt,
        creator: address,
      });
      const result = await publicClient.call({
        account: address,
        to: B20_FACTORY_ADDRESS,
        data,
      });
      const returned = result.data ? `0x${result.data.slice(-40)}`.toLowerCase() : '';
      if (returned === predicted.toLowerCase()) {
        setSim({ kind: 'ok', address: predicted });
        // Oplata jest INFORMACJA, nie warunkiem - dlatego mierzy sie osobno
        // i jej brak nigdy nie blokuje podpisu. Liczymy ja tu, a nie w panelu
        // obok formularza, bo to jedyny pomiar na tym ekranie, ktory wymaga
        // sieci - a panel obiecuje, ze nie pyta sieci o nic.
        try {
          const [gas, gasPrice] = await Promise.all([
            publicClient.estimateGas({ account: address, to: B20_FACTORY_ADDRESS, data }),
            publicClient.getGasPrice(),
          ]);
          setFee({ kind: 'ok', wei: gas * gasPrice, gas });
        } catch {
          setFee({ kind: 'unread' });
        }
      } else {
        // Dwie sciezki daly dwa rozne adresy. Nie zgadujemy, ktora ma racje -
        // pokazujemy obie i nie pozwalamy podpisac.
        setSim({ kind: 'mismatch', chainSaid: returned || 'nothing', weSaid: predicted });
      }
    } catch (err) {
      setSim({
        kind: 'failed',
        message: err instanceof Error ? err.message.split('\n')[0] : String(err),
      });
    }
  }, [address, publicClient, predicted, name, symbol, keepAdmin, salt]);

  const goReview = useCallback(() => {
    setPhase('review');
    setSendError(null);
    void runSimulation();
  }, [runSimulation]);

  const send = useCallback(async () => {
    if (!address || !walletClient || sim.kind !== 'ok') return;
    setSendError(null);
    try {
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
      }
      setPhase('sending');
      const data = encodeCreateCall({
        name: name.trim(),
        symbol: symbol.trim(),
        admin: keepAdmin ? address : null,
        salt,
        creator: address,
      });
      const hash = await walletClient.sendTransaction({
        to: B20_FACTORY_ADDRESS,
        data,
        chain: base,
        account: address,
      });
      setTxHash(hash);
      setLanded({ kind: 'pending' });
      setPhase('done');

      // SAM HASH NIE JEST DOWODEM, ZE TOKEN POWSTAL. Transakcja moze jeszcze
      // odpasc na lancuchu, a wtedy nie ma ani tokena, ani tego adresu - jest
      // tylko spalony gaz. Dopoki nie ma pokwitowania, ekran mowi "w drodze".
      if (!publicClient) {
        setLanded({
          kind: 'unread',
          message: 'This tab has no reader for Base, so nothing followed the transaction.',
        });
        return;
      }
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
        setLanded(receipt.status === 'success' ? { kind: 'success' } : { kind: 'reverted' });
      } catch (err) {
        // Nieudany ODCZYT, nie nieudana transakcja - i te dwie rzeczy dostaja
        // na ekranie dwa rozne zdania.
        setLanded({
          kind: 'unread',
          message: err instanceof Error ? err.message.split('\n')[0] : String(err),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message.split('\n')[0] : String(err);
      // Odmowa w portfelu nie jest awaria i nie dostaje straszacego zdania.
      setSendError(
        /user rejected|denied|rejected the request/i.test(message)
          ? 'You closed the wallet without signing. Nothing was sent.'
          : message
      );
      setPhase('review');
    }
  }, [
    address,
    walletClient,
    publicClient,
    sim,
    chainId,
    switchChainAsync,
    name,
    symbol,
    keepAdmin,
    salt,
  ]);

  /* ------------------------------------------------------------------ */
  /*  PO PODPISIE                                                        */
  /* ------------------------------------------------------------------ */

  if (phase === 'done' && txHash && predicted) {
    const ticker = symbol.trim() || 'The token';
    return (
      <div className={CARD}>
        <h2 className="font-soft-display text-[17px] font-bold text-soft-ink">
          {landed.kind === 'reverted'
            ? 'Base rejected the transaction'
            : landed.kind === 'success'
              ? `${ticker} is on Base`
              : `${ticker} is on its way`}
        </h2>

        {/* Cztery stany, cztery zdania. "Wyslane" nie jest tym samym co
            "powstalo", a nieudany odczyt nie jest tym samym co odrzucenie. */}
        {landed.kind === 'pending' && (
          <p className="mt-1.5 text-[13px] leading-[1.55] text-soft-ink-muted" aria-live="polite">
            Signed and sent. Base has not included it yet, so the token does not exist for a few
            more seconds. This page is watching the transaction and will say when it lands.
          </p>
        )}
        {landed.kind === 'success' && (
          <>
            <p className="mt-1.5 text-[13px] leading-[1.55] text-soft-ink-muted">
              Base included it and it went through. The token address is the one you saw before you
              signed. It could not have been anything else.
            </p>
            {/* ===== NASTEPNY KROK, A NIE KONIEC =====
                Token bez puli nie ma ceny i nikt go nie kupi. Ekran, ktory
                konczy sie gratulacjami, zostawia czlowieka z martwym tokenem
                i bez pojecia, dlaczego nic sie nie dzieje.

                Docelowo pule otwiera nasz kontrakt w tej samej transakcji.
                Zanim stanie na sieci, ta droga istnieje i dziala. */}
            <p className="mt-2.5 text-[13px] leading-[1.55] text-soft-ink">
              <span className="font-semibold">One thing left:</span> nobody can buy it until a pool
              exists. Open one against ETH and the token gets a price, a chart and a buy button
              everywhere on this site.
            </p>
            {/* Prowadzimy na STRONE TOKENA, a nie prosto na Uniswapa: tam stoi
                panel z adresem do skopiowania i wyjasnieniem, a po otwarciu puli
                ta sama strona pokazuje juz cene i wykres. Jedno miejsce zamiast
                dwoch rozjezdzajacych sie sciezek. */}
            {predicted && (
              <a
                href={`/b20/${predicted.toLowerCase()}`}
                className="mt-3 inline-flex rounded-pill bg-soft-primary px-5 py-2.5 font-soft-display text-[13px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
              >
                Open your token’s page
              </a>
            )}
          </>
        )}
        {landed.kind === 'reverted' && (
          <p className="mt-1.5 text-[13px] leading-[1.55] text-soft-ink-muted" role="alert">
            Base included the transaction and it failed, so no token was made and this address was
            not taken. The gas is spent either way. Your name, ticker and mined address are still
            here, so go back and send it again.
          </p>
        )}
        {landed.kind === 'unread' && (
          <>
            <p className="mt-1.5 text-[13px] leading-[1.55] text-soft-ink-muted" role="alert">
              It is signed and sent, and we could not read whether it landed. That is a failed read
              on our side, not a failed transaction. The link below is the only answer that counts.
            </p>
            <p className="mt-1 break-words font-mono text-[11px] leading-[1.45] text-soft-ink-faint">
              {landed.message}
            </p>
          </>
        )}

        <p className="mt-2.5 font-soft-display text-[11px] font-bold uppercase tracking-[0.1em] text-soft-ink-faint">
          {landed.kind === 'reverted'
            ? 'The address it would have had'
            : landed.kind === 'success'
              ? 'Token address'
              : 'The address it gets when it lands'}
        </p>
        <p className="mt-1 break-all rounded-card bg-soft-sunken px-3 py-2 font-mono text-[12px] text-soft-ink">
          {predicted}
        </p>

        {/* Zdanie, ktorego zaden launchpad o sobie nie napisze - i jedyne, ktore
            tlumaczy, dlaczego token nie pojawi sie na zadnym wykresie. */}
        {landed.kind !== 'reverted' && (
          <p className="mt-3 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            Nobody can buy it. This transaction makes the token and nothing else: there is no pool,
            so there is no price and no chart anywhere. On our own market list it shows up as{' '}
            <span className="font-semibold text-soft-ink">no pool</span>, exactly like every other
            token in that state.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`https://basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-pill border border-soft-line bg-soft-surface px-3.5 py-2 font-soft-display text-[12.5px] font-bold text-soft-ink-muted transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
          >
            See the transaction
          </a>
          {landed.kind === 'reverted' ? (
            <button
              type="button"
              onClick={() => {
                setTxHash(null);
                setPhase('review');
              }}
              className="rounded-pill bg-soft-primary px-3.5 py-2 font-soft-display text-[12.5px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
            >
              Back to the check
            </button>
          ) : (
            <>
              {/* Wlasnej strony tokena jeszcze nie ma, wiec nie udajemy, ze
                  jest - Basescan istnieje dla kazdego adresu na Base. */}
              <a
                href={`https://basescan.org/token/${predicted}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-pill border border-soft-line bg-soft-surface px-3.5 py-2 font-soft-display text-[12.5px] font-bold text-soft-ink-muted transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
              >
                Open it on Basescan
              </a>
              <Link
                href="/b20"
                className="rounded-pill bg-soft-primary px-3.5 py-2 font-soft-display text-[12.5px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
              >
                Back to the market
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  FORMULARZ + PANEL NA ZYWO                                          */
  /* ------------------------------------------------------------------ */

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)] md:items-start">
      {/* ================= FORMULARZ ================= */}
      <div className={CARD}>
        <h2 className="font-soft-display text-[16px] font-bold text-soft-ink">
          Three things, and two of them are words
        </h2>

        <div className="mt-3 space-y-3">
          <div>
            <label className={LABEL} htmlFor="b20-name">
              Name
            </label>
            <input
              id="b20-name"
              className={`${FIELD} mt-1`}
              value={name}
              maxLength={NAME_MAX + 8}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pocket Rocket"
              autoComplete="off"
            />
            {nameError && (
              <p className="mt-1 text-[11.5px] text-soft-ink-muted" role="alert">
                {nameError}
              </p>
            )}
          </div>

          <div>
            <label className={LABEL} htmlFor="b20-symbol">
              Ticker
            </label>
            <input
              id="b20-symbol"
              className={`${FIELD} mt-1 uppercase`}
              value={symbol}
              maxLength={SYMBOL_MAX + 4}
              onChange={(e) => {
                setSymbolTouched(true);
                setSymbol(e.target.value.toUpperCase());
              }}
              placeholder="PCKT"
              autoComplete="off"
            />
            <p className="mt-1 text-[11.5px] text-soft-ink-faint">
              {symbolError ?? 'Suggested from the name until you change it. Every market row starts with this.'}
            </p>
          </div>

          {/* Trzecie pole jest JEDYNYM realnym wyborem na tym ekranie - i jest
              wyborem, ktorego konkurencja nie pokazuje wcale. */}
          <fieldset>
            <legend className={LABEL}>Who can change this token later</legend>
            <div className="mt-1.5 space-y-1.5">
              {[
                {
                  value: false,
                  title: 'Nobody',
                  body:
                    'No address is made admin, so nobody (including us and including you) can mint more, rename it, or freeze anyone.',
                },
                {
                  value: true,
                  title: 'You keep admin rights',
                  body:
                    'Your wallet stays admin. You could raise the supply cap and mint more later. Anyone reading this token can see that, and should assume you might.',
                },
              ].map((option) => (
                <label
                  key={String(option.value)}
                  className={`flex cursor-pointer gap-2.5 rounded-card border p-2.5 transition-colors [transition-duration:var(--dur-press)] ${
                    keepAdmin === option.value
                      ? 'border-soft-primary bg-soft-sunken'
                      : 'border-soft-line bg-transparent'
                  }`}
                >
                  <input
                    type="radio"
                    name="b20-admin"
                    className="mt-0.5 accent-soft-primary"
                    checked={keepAdmin === option.value}
                    onChange={() => setKeepAdmin(option.value)}
                  />
                  <span>
                    <span className="block font-soft-display text-[12.5px] font-bold text-soft-ink">
                      {option.title}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-soft-ink-muted">
                      {option.body}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Czego tu NIE MA - i dlaczego to nie jest brak. */}
        <p className="mt-3 text-[11.5px] leading-[1.5] text-soft-ink-faint">
          There is no supply field because the supply is fixed at{' '}
          {B20_SUPPLY_TOKENS.toLocaleString('en-US')} and the cap is set to the same number in the
          same transaction. There is no picture or description field because neither is stored on
          the chain. Anything we kept would be ours, not the token’s, and putting it here before
          you sign would suggest otherwise.
        </p>

        {phase === 'form' && (
          <button
            type="button"
            disabled={!ready}
            onClick={goReview}
            className="mt-4 w-full rounded-pill bg-soft-primary px-4 py-2.5 font-soft-display text-[13.5px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-soft-line disabled:text-soft-ink-faint disabled:shadow-none"
          >
            {isConnected ? 'Review what happens' : 'Connect a wallet first'}
          </button>
        )}
      </div>

      {/* ================= PANEL NA ZYWO ================= */}
      <aside className={CARD}>
        <h2 className="font-soft-display text-[14px] font-bold text-soft-ink">
          What you are about to create
        </h2>

        <dl className="mt-2.5 space-y-2 text-[12.5px]">
          <div>
            <dt className="text-soft-ink-faint">Address</dt>
            <dd className="mt-0.5 break-all font-mono text-[11.5px] leading-[1.45] text-soft-ink">
              {predicted ?? (
                <span className="font-soft text-soft-ink-faint">
                  Connect a wallet first. The address depends on it.
                </span>
              )}
            </dd>
            {predicted && (
              <p className="mt-0.5 text-[11px] leading-[1.4] text-soft-ink-faint">
                Worked out here, not asked of the network. It comes from your wallet and the salt,
                and nothing else can change it.
              </p>
            )}
            {spelled && (
              <span className="mt-1 inline-flex rounded-pill bg-soft-sunken px-2 py-[3px] font-soft-display text-[10.5px] font-bold uppercase tracking-[0.06em] text-soft-ink-muted">
                spells {spelled}
              </span>
            )}
          </div>

          <div className="flex justify-between gap-3 border-t border-soft-line pt-2">
            <dt className="text-soft-ink-faint">Supply</dt>
            <dd className="text-right tabular-nums text-soft-ink">
              {B20_SUPPLY_TOKENS.toLocaleString('en-US')}
              <span className="block text-[11px] text-soft-ink-faint">capped at that number</span>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-soft-ink-faint">Admin</dt>
            <dd className="text-right text-soft-ink">{keepAdmin ? 'you' : 'nobody'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-soft-ink-faint">Market</dt>
            {/* Nie obiecujemy puli, bo ta transakcja jej nie robi. */}
            <dd className="text-right text-soft-ink-muted">
              none
              <span className="block text-[11px] text-soft-ink-faint">no pool is created here</span>
            </dd>
          </div>
        </dl>

        {/* ---- KOPALNIA ---- */}
        <div className="mt-3 border-t border-soft-line pt-3">
          <label className={LABEL} htmlFor="b20-pattern">
            Make the address spell something
          </label>
          <input
            id="b20-pattern"
            className={`${FIELD} mt-1 font-mono text-[13px]`}
            value={pattern}
            maxLength={8}
            onChange={(e) => {
              setPattern(e.target.value);
              setSpelled(null);
            }}
            placeholder="cafe"
            autoComplete="off"
            disabled={!address}
          />
          {impossible.length > 0 && (
            <p className="mt-1 text-[11.5px] leading-[1.45] text-soft-ink-muted">
              An address is hexadecimal, so {impossible.map((c) => `“${c}”`).join(', ')} cannot
              appear in one. Try{' '}
              {impossible
                .map((c) => (HEX_SUBSTITUTES[c] ? `${c} → ${HEX_SUBSTITUTES[c]}` : `dropping ${c}`))
                .join(', ')}
              .
            </p>
          )}
          {patternOk && (
            <p className="mt-1 text-[11.5px] leading-[1.45] text-soft-ink-faint">
              {target.length} characters, about{' '}
              <span className="tabular-nums">
                {expectedAttempts(target).toLocaleString('en-US')}
              </span>{' '}
              tries on average.
              {target.length >= 7 && ' At this length, expect to leave it running.'}
            </p>
          )}
          {mining && (
            <p className="mt-1 text-[11.5px] tabular-nums text-soft-ink-muted" aria-live="polite">
              searching · {attempts.toLocaleString('en-US')} tries · {rate.toLocaleString('en-US')}/s
            </p>
          )}
          {/* To zdanie jest cala roznica miedzy czescia tworzenia a gadzetem. */}
          <p className="mt-1 text-[11px] leading-[1.45] text-soft-ink-faint">
            You can create with the address above at any time. Searching never blocks it.
            {mining && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={stopMining}
                  className="font-semibold text-soft-primary-deep underline underline-offset-2"
                >
                  Stop searching
                </button>
              </>
            )}
          </p>
        </div>
      </aside>

      {/* ================= NIEODWRACALNOSC + PODPIS ================= */}
      {phase !== 'form' && (
        <div className={`${CARD} md:col-span-2`}>
          <h2 className="font-soft-display text-[16px] font-bold text-soft-ink">
            After you sign, these stop being possible
          </h2>
          <ul className="mt-2 space-y-1.5 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            <li>
              <span className="font-semibold text-soft-ink">You cannot mint more.</span> The supply
              is {B20_SUPPLY_TOKENS.toLocaleString('en-US')} and the cap is set to the same number in
              the same transaction, so minting reverts.
            </li>
            <li>
              <span className="font-semibold text-soft-ink">
                You cannot change the name or the ticker.
              </span>{' '}
              They are written once and no address can rewrite them.
            </li>
            <li>
              <span className="font-semibold text-soft-ink">You cannot delete the token.</span> It
              stays on Base for as long as Base does.
            </li>
            {!keepAdmin ? (
              <li>
                <span className="font-semibold text-soft-ink">
                  You cannot raise the cap, pause transfers or take tokens back
                </span>{' '}
                You chose to make nobody admin, so there is no address left that could. That
                includes us. It also cannot be undone if you change your mind.
              </li>
            ) : (
              // Ta sama uczciwosc w druga strone. Kto zostawia sobie wladze,
              // ma to przeczytac tutaj, a nie dowiedziec sie z regulaminu.
              <li>
                <span className="font-semibold text-soft-ink">
                  You keep the power to raise the cap and mint more.
                </span>{' '}
                Anyone who buys this token is trusting you not to. We will not describe this token as
                capped anywhere, because it is not.
              </li>
            )}
            <li>
              <span className="font-semibold text-soft-ink">Nobody can buy it.</span> This
              transaction creates the token and nothing else. Until somebody opens a pool there is no
              price, no chart and nothing for an indexer to pick up, and we are not going to promise
              you one.
            </li>
          </ul>

          {/* ---- WYNIK SYMULACJI ---- */}
          <div className="mt-3 rounded-card border border-soft-line bg-soft-sunken p-3">
            {sim.kind === 'checking' && (
              <p className="text-[12.5px] text-soft-ink-muted" aria-busy="true">
                Running this exact transaction against Base without sending it…
              </p>
            )}
            {sim.kind === 'ok' && (
              <p className="text-[12.5px] leading-[1.55] text-soft-ink-muted">
                Base ran this transaction and returned{' '}
                <span className="break-all font-mono text-[11.5px] text-soft-ink">
                  {sim.address}
                </span>
                , the same address this page worked out on its own. Two independent paths, one
                answer.
              </p>
            )}
            {sim.kind === 'mismatch' && (
              <p className="text-[12.5px] leading-[1.55] text-soft-ink-muted" role="alert">
                Base returned{' '}
                <span className="break-all font-mono text-[11.5px]">{sim.chainSaid}</span> but this
                page worked out{' '}
                <span className="break-all font-mono text-[11.5px]">{sim.weSaid}</span>. We do not
                know which is right, so we are not letting you sign.
              </p>
            )}
            {sim.kind === 'failed' && (
              <>
                <p className="text-[12.5px] leading-[1.55] text-soft-ink-muted" role="alert">
                  Base refused this transaction in simulation, so signing it would only burn gas.
                  This is a failed check, not proof that creating is impossible.
                </p>
                <p className="mt-1 break-words font-mono text-[11px] leading-[1.45] text-soft-ink-faint">
                  {sim.message}
                </p>
                <button
                  type="button"
                  onClick={() => void runSimulation()}
                  className="mt-2 rounded-pill bg-soft-primary px-3.5 py-1.5 font-soft-display text-[12px] font-bold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
                >
                  Check again
                </button>
              </>
            )}

            {/* ---- KOSZT ----
                Jedyna kwota na tym ekranie, wiec jedyne miejsce z pomaranczem.
                Stoi PRZY symulacji, bo jest z tej samej chwili i tego samego
                odczytu - a nie w panelu obok, ktory obiecuje zero zapytan. */}
            {fee.kind === 'ok' && (
              <p className="mt-2 border-t border-soft-line pt-2 text-[12.5px] leading-[1.55] text-soft-ink-muted">
                Sending it costs{' '}
                <span className="font-soft-display font-bold tabular-nums text-soft-accent-deep">
                  {formatEthFee(fee.wei)} ETH
                </span>{' '}
                in network fees ({fee.gas.toLocaleString('en-US')} gas at the price Base is charging
                right now, measured a moment ago). Nothing else leaves your wallet: this transaction
                pays us nothing.
              </p>
            )}
            {fee.kind === 'unread' && (
              <p className="mt-2 border-t border-soft-line pt-2 text-[12.5px] leading-[1.55] text-soft-ink-muted">
                We could not measure the network fee just now. That is a failed read, not a free
                transaction. Your wallet will show you the real number before you sign.
              </p>
            )}
          </div>

          {sendError && (
            <p className="mt-2 text-[12.5px] leading-[1.55] text-soft-ink-muted" role="alert">
              {sendError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPhase('form')}
              disabled={phase === 'sending'}
              className="rounded-pill border border-soft-line bg-soft-surface px-4 py-2.5 font-soft-display text-[13px] font-bold text-soft-ink-muted transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={sim.kind !== 'ok' || phase === 'sending'}
              className="flex-1 rounded-pill bg-soft-primary px-4 py-2.5 font-soft-display text-[13.5px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-soft-line disabled:text-soft-ink-faint disabled:shadow-none"
            >
              {phase === 'sending'
                ? 'Waiting for your wallet…'
                : sim.kind === 'ok'
                  ? `Create ${symbol.trim() || 'the token'}`
                  : 'Waiting for the check above'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
