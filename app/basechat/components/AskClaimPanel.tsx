'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useChainId, useConfig, usePublicClient, useSwitchChain } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { base } from 'wagmi/chains';
import {
  claimPayout,
  describeEscrowError,
  escrowDeployment,
  readClaimable,
  unitsToAmount,
} from '../../utils/asks/escrow';
import { formatAskMoney } from './AskCard';

/**
 * "MASZ X USDC DO ODBIORU" - bez tego panelu escrow jest niedokonczony.
 *
 * === PO CO ===
 * resolve() na kontrakcie NIE WYSYLA tokenow. Przypisuje salda (uzasadnienie
 * przy `claimable` w contracts/AskEscrow.sol: jeden odbiorca na czarnej liscie
 * USDC wywracalby wtedy cale rozstrzygniecie). Dostarcza dopiero claim().
 *
 * Skutek jest taki, ze bez tego panelu pieniadze odpowiadajacego leza w ksiedze
 * kontraktu i NIKT O NICH NIE WIE - saldo nie pojawia sie w portfelu, bo tokeny
 * wciaz nalezaly by do kontraktu. Panel jest jedynym miejscem w aplikacji,
 * ktore o tym mowi.
 *
 * === AWARIA NIE MOZE WYGLADAC JAK ZERO ===
 * Nieudany odczyt `claimable` NIE jest tym samym co saldo zerowe. Zero mowi
 * czlowiekowi "nic ci sie nie nalezy" - twierdzenie o jego pieniadzach postawione
 * w chwili, gdy tego nie wiemy. Dlatego `phase` ma osobny stan 'failed' z wlasnym
 * komunikatem i wlasnym wyjsciem (ponow), a nie cichy powrot do pustki.
 *
 * === CZEGO NIE ROBIMY ===
 * Nie wolamy claimFor() za nikogo. To jest panel dla WLASCICIELA salda -
 * kierunek przelewu w kontrakcie i tak jest zaszyty w kodzie, ale dokladanie
 * przycisku "odbierz za kogos" tylko myliloby patrzacego co do tego, czyje to
 * pieniadze.
 */

/** Escrow zyje na Base - i tylko tam wagmi ma skonfigurowany lancuch. */
const ESCROW_CHAIN_ID = base.id;

type Phase = 'loading' | 'ready' | 'failed';

export default function AskClaimPanel({
  className = '',
  showEmpty = false,
  reloadKey = 0,
}: {
  className?: string;
  /**
   * Czy odezwac sie takze przy saldzie ZEROWYM.
   *
   * Domyslnie `false` i tak zostaje na /asks: tam panel jest wtretem nad lista
   * pytan, wiec "nie masz nic do odebrania" byloby zdaniem, o ktore nikt nie
   * pytal. Na /money jest odwrotnie - cala strona istnieje po to, zeby
   * odpowiedziec na pytanie "ile mam do odebrania", a milczenie nie jest tam
   * odpowiedzia. To wciaz JEDEN panel i jedna sciezka claim(); rozni sie tylko
   * to, czy zero wolno przemilczec.
   */
  showEmpty?: boolean;
  /**
   * Zmiana tej liczby wymusza PONOWNY odczyt salda.
   *
   * PO CO: zwrot wygaslego budzetu (settleExpired) dokłada autorowi saldo w tym
   * samym kontrakcie, ale robi to INNY komponent, nizej na /money. Bez tego
   * sygnalu ten panel dalej pokazywalby saldo sprzed transakcji - czyli liczbe,
   * ktora wlasnie przestala byc prawdziwa, tuz obok komunikatu o sukcesie.
   * Sam licznik, a nie callback z kwota: zrodlem prawdy o saldzie zostaje
   * lancuch, a nie arytmetyka po stronie przegladarki.
   */
  reloadKey?: number;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: ESCROW_CHAIN_ID });
  /**
   * Klient portfela pobierany DOPIERO przy podpisie, przez getWalletClient.
   * `useWalletClient()` oddaje klienta przypietego do sieci z chwili renderu,
   * wiec po zmianie sieci w portfelu podpis szedlby na stary lancuch.
   */
  const config = useConfig();
  const { switchChain } = useSwitchChain();

  const [phase, setPhase] = useState<Phase>('loading');
  const [units, setUnits] = useState<bigint>(0n);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimedTx, setClaimedTx] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!address || !publicClient) return;
    setPhase('loading');
    // Paragon poprzedniego odbioru schodzi razem ze swoim saldem. Zostawiony
    // przy nowej kwocie mowilby "Collected" nad pieniedzmi, ktorych nikt
    // jeszcze nie odebral.
    setClaimedTx(null);
    try {
      const value = await readClaimable(publicClient, ESCROW_CHAIN_ID, address);
      if (!mountedRef.current) return;
      setUnits(value);
      setPhase('ready');
    } catch (error) {
      console.error('[asks] Odczyt salda escrow nie powiodl sie:', error);
      if (!mountedRef.current) return;
      setPhase('failed');
    }
    // reloadKey nie jest uzyty w ciele celowo - to sygnal "przeczytaj jeszcze
    // raz", nie dana wejsciowa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, publicClient, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Panel nie ma sie po co pokazywac komus bez portfela ani na sieci, na ktorej
   * kontraktu nie ma - saldo jest wtedy pytaniem bez adresata, a nie zerem.
   */
  if (!address) return null;
  if (!escrowDeployment(ESCROW_CHAIN_ID)) return null;

  // Saldo zero i odczyt udany: nie ma o czym mowic. To JEDYNY przypadek, w
  // ktorym panel milczy - awaria odczytu ma swoj wlasny widok nizej.
  if (phase === 'ready' && units === 0n && !claimedTx && !showEmpty) return null;

  const wrap = `rounded-card border border-soft-accent/40 bg-soft-accent-soft p-4 font-soft shadow-card sm:p-5 ${className}`;
  const buttonClass =
    'inline-flex shrink-0 items-center justify-center rounded-lg px-3.5 py-2 font-soft-display text-[12.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface disabled:cursor-not-allowed disabled:bg-soft-line-strong';

  if (phase === 'loading') {
    return (
      <section className={wrap} aria-busy="true" aria-label="Escrow balance">
        <p className="text-[12.5px] leading-[1.5] text-soft-ink-muted">
          Checking what the escrow contract owes you…
        </p>
      </section>
    );
  }

  if (phase === 'failed') {
    return (
      <section className={wrap} aria-label="Escrow balance">
        <h2 className="mb-1.5 font-soft-display text-[15px] font-bold text-soft-ink">
          We could not read your escrow balance
        </h2>
        <p className="mb-3 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
          This is a failed read, not an empty balance. You may well have money waiting in the
          contract — we just could not reach the chain to check.
        </p>
        <button type="button" onClick={() => void load()} className={`${buttonClass} bg-soft-primary text-white`}>
          Try again
        </button>
      </section>
    );
  }

  /**
   * Saldo zerowe, ale wolajacy prosil o odpowiedz mimo wszystko (`showEmpty`).
   *
   * Panel jest wtedy NEUTRALNY, nie bursztynowy: bursztyn w tej aplikacji niesie
   * KWOTE, a tutaj zadnej kwoty nie ma. Zdanie mowi rowniez, czego ten odczyt
   * dotyczy - inaczej "nic tu nie ma" brzmi jak zdanie o calym portfelu, a
   * dotyczy wylacznie ksiegi kontraktu escrow.
   */
  if (phase === 'ready' && units === 0n && !claimedTx) {
    return (
      <section
        className={`rounded-card border border-soft-line bg-soft-surface p-4 font-soft shadow-card sm:p-5 ${className}`}
        aria-label="Escrow balance"
      >
        <h2 className="mb-1 font-soft-display text-[15px] font-bold text-soft-ink">
          Nothing waiting to be collected
        </h2>
        <p className="break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
          The escrow contract is not holding anything for this wallet right now. Accepted answers
          and the unused part of your own Ask budgets both land here, and they wait as long as you
          need them to.
        </p>
      </section>
    );
  }

  const amount = unitsToAmount(units);
  const onEscrowChain = chainId === ESCROW_CHAIN_ID;

  async function handleClaim() {
    if (claiming || !publicClient || !address) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const signer = await getWalletClient(config, { chainId: ESCROW_CHAIN_ID });
      const txHash = await claimPayout(publicClient, signer, ESCROW_CHAIN_ID, address);
      if (!mountedRef.current) return;
      setClaimedTx(txHash);
      setUnits(0n);
    } catch (error) {
      console.error('[asks] Odbior z escrow nie powiodl sie:', error);
      if (!mountedRef.current) return;
      // Surowy revert nie jest komunikatem - describeEscrowError zamienia
      // NothingToClaim i reszte listy na zdania.
      setClaimError(describeEscrowError(error));
    } finally {
      if (mountedRef.current) setClaiming(false);
    }
  }

  return (
    <section className={wrap} aria-label="Escrow balance">
      {claimedTx ? (
        <>
          <h2 className="mb-1.5 font-soft-display text-[15px] font-bold text-soft-ink">
            Collected
          </h2>
          <p className="mb-2 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
            The USDC left the escrow contract and is in your wallet.
          </p>
          <a
            href={`https://basescan.org/tx/${claimedTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block break-all text-[11px] font-medium text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            {claimedTx.slice(0, 10)}…{claimedTx.slice(-6)}
          </a>
        </>
      ) : (
        <>
          <h2 className="mb-1 font-soft-display text-[15px] font-bold text-soft-ink">
            You have{' '}
            {/* Bursztyn tylko na kwocie - to jedyne miejsce w tym panelu,
                w ktorym stoi liczba pieniedzy. */}
            <span className="tabular-nums text-soft-accent-deep">{formatAskMoney(amount)}</span>{' '}
            waiting
          </h2>
          <p className="mb-3 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
            Accepted answers are paid by assignment, not by transfer: the money is already yours in
            the escrow contract and nobody can take it back. It reaches your wallet when you collect
            it — there is no deadline for doing so.
          </p>
          {onEscrowChain ? (
            <button
              type="button"
              onClick={() => void handleClaim()}
              disabled={claiming}
              className={`${buttonClass} bg-soft-primary text-white`}
            >
              {claiming ? 'Collecting…' : `Collect ${formatAskMoney(amount)}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchChain({ chainId: ESCROW_CHAIN_ID })}
              className={`${buttonClass} bg-soft-primary text-white`}
            >
              Switch to Base to collect
            </button>
          )}
          {claimError && (
            <p className="mt-2 break-words text-[12px] leading-[1.5] text-soft-accent-deep" role="alert">
              {claimError}
            </p>
          )}
        </>
      )}
    </section>
  );
}
