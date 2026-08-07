'use client';

/**
 * /join?ref=KOD - strona, na którą prowadzi każdy link referalowy.
 *
 * === CZEGO TU DOTĄD NIE BYŁO ===
 * `generateReferralLink()` od zawsze zwracał `https://mysphere.fun/join?ref=…`,
 * a katalog `app/join` nie istniał. Każdy skopiowany, wysłany znajomemu i
 * wklejony na Farcastera link referalowy prowadził więc na stronę „nie
 * znaleziono". Do tego jedyny hook rejestrujący polecenie nie miał w całym
 * repozytorium ani jednego wywołania poza własnym plikiem - nawet gdyby ktoś
 * trafił we właściwe miejsce, polecenie i tak by się nie zapisało.
 *
 * Wybrałem tę drogę zamiast przepisania linków na `/basechat?ref=` z dwóch
 * powodów. Po pierwsze, linki są już w obiegu: siedzą w dokumentach
 * `referralStats.referralLink`, w schowkach, w kodach QR i w cudzych wiadomościach.
 * Zmiana generatora naprawia tylko te, które ktoś skopiuje od jutra - wszystkie
 * rozesłane wcześniej dalej lądowałyby na 404. Po drugie, `/basechat` to feed z
 * kilkoma tysiącami linii stanu; doklejenie do niego cichego efektu ubocznego
 * „przy okazji zarejestruj polecenie" chowa rzecz, która wymaga od człowieka
 * świadomej zgody, pod ekranem o czymś zupełnie innym. Zaproszenie ma własną
 * stronę, która mówi wprost, co się stanie i co się właśnie stało.
 *
 * === TRZY KROKI, W TEJ KOLEJNOŚCI ===
 *  1. zapamiętaj kod (przeżywa przeskok do aplikacji portfela - patrz
 *     `usePendingReferralCode`),
 *  2. podłącz portfel,
 *  3. PODPISZ. Adres z portfela nie jest tożsamością; bez podpisu każdy mógłby
 *     wpisać cudzy adres i doczepić mu polecającego. Podpis nic nie kosztuje i
 *     nie wysyła transakcji.
 * Rejestracja rusza dopiero po podpisie i jest jedna na parę (kod, portfel).
 *
 * KAŻDE ZAKOŃCZENIE MA WŁASNY EKRAN. „Nie znam tego kodu", „ten portfel ma już
 * polecającego", „to Twój własny link" i „baza nie odpowiedziała" to cztery
 * różne wiadomości i tylko przy ostatniej ma sens przycisk „spróbuj ponownie".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import ConnectModal from '../components/wallet/ConnectModal';
import { useSiweAuth } from '../utils/auth/useSiweAuth';
import { usePendingReferralCode, useReferralRegistration } from '../utils/referrals/referralHooks';

/** Dokąd prowadzi każde wyjście z tej strony. */
const APP_ROUTE = '/basechat';

const shorten = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

const PRIMARY_BUTTON = [
  'rounded-pill bg-soft-primary px-5 py-2.5 text-[13px] font-semibold text-white shadow-chip',
  'transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong',
  'hover:bg-soft-primary-deep active:scale-[0.97]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
].join(' ');

const QUIET_BUTTON = [
  'rounded-pill border border-soft-line px-5 py-2.5 text-[13px] font-semibold text-soft-ink-muted',
  'transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong',
  'hover:bg-soft-sunken active:scale-[0.97]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2',
].join(' ');

/** Karta, w której mieści się cała strona - jeden kształt dla każdego stanu. */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[520px] px-4 py-10 font-soft sm:py-14">
      <div className="rounded-card border border-soft-line bg-soft-surface p-6 shadow-card sm:p-8">
        {children}
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-soft-display text-[22px] font-bold leading-tight text-soft-ink">{children}</h1>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[14px] leading-[1.6] text-soft-ink-muted">{children}</p>;
}

/** Kod zaproszenia pokazany dosłownie - człowiek widzi, co niesie jego link. */
function CodeBadge({ code }: { code: string }) {
  return (
    <p className="mt-4 inline-flex items-center gap-2 rounded-pill border border-soft-line bg-soft-sunken px-3 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-soft-ink-soft">
        Invite code
      </span>
      <span className="font-soft-display text-[13px] font-bold tracking-wide text-soft-ink">
        {code}
      </span>
    </p>
  );
}

/**
 * Trzy kroki z zaznaczonym bieżącym. Nie jest ozdobnikiem: pokazuje, że po
 * podłączeniu portfela przyjdzie jeszcze prośba o podpis, zanim okno portfela
 * wyskoczy samo z siebie.
 */
function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Connect a wallet', 'Sign to prove it is yours', 'Link the invite'];

  return (
    <ol className="mt-5 space-y-2">
      {steps.map((label, index) => {
        const step = index + 1;
        const isCurrent = step === current;
        const isDone = step < current;

        return (
          <li key={label} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border text-[11px] font-bold tabular-nums ${
                isCurrent
                  ? 'border-soft-primary bg-soft-primary text-white'
                  : isDone
                  ? 'border-soft-line bg-soft-sunken text-soft-ink-muted'
                  : 'border-soft-line bg-soft-surface text-soft-ink-faint'
              }`}
            >
              {step}
            </span>
            <span
              className={`text-[13px] ${
                isCurrent ? 'font-semibold text-soft-ink' : 'text-soft-ink-soft'
              }`}
            >
              {label}
              {isCurrent && <span className="sr-only"> (current step)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function OpenAppLink({ label = 'Open MySphere' }: { label?: string }) {
  return (
    <Link href={APP_ROUTE} className={`${PRIMARY_BUTTON} mt-6 inline-block`}>
      {label}
    </Link>
  );
}

export default function JoinPage() {
  const { address, isConnected } = useAccount();
  const { isAuthenticated, address: sessionAddress, signIn, error: siweError } = useSiweAuth();
  const { code, ready, clear } = usePendingReferralCode();
  const { registerWithReferral, processing, outcome, resetOutcome } = useReferralRegistration();

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  /**
   * Kod, na którym rozegrała się próba. Trzymany osobno, bo po rozliczeniu
   * kasujemy zapamiętany kod z magazynu - a ekran wyniku ma nadal pokazywać,
   * o który kod chodziło.
   */
  const [settledCode, setSettledCode] = useState<string | null>(null);

  // Sesja musi dotyczyć TEGO portfela. Po przepięciu konta w portfelu stara
  // sesja jest sesją kogoś innego.
  const signedInWithThisWallet =
    isAuthenticated && !!address && sessionAddress === address.toLowerCase();

  /** Jedna próba na parę (kod, portfel) - efekt potrafi wrócić przy re-renderze. */
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!code || !address || !signedInWithThisWallet) return;
    if (processing || outcome) return;

    const attemptKey = `${code}:${address.toLowerCase()}`;
    if (attemptedRef.current === attemptKey) return;
    attemptedRef.current = attemptKey;

    setSettledCode(code);
    void registerWithReferral(code, address, { joinedFrom: 'link' });
  }, [code, address, signedInWithThisWallet, processing, outcome, registerWithReferral]);

  /**
   * Rozliczony kod znika z magazynu. Awarii NIE kasujemy - przy niej kod jest
   * jedyną rzeczą, która pozwala spróbować jeszcze raz.
   */
  useEffect(() => {
    if (!outcome || outcome.status === 'failed') return;
    clear();
  }, [outcome, clear]);

  const handleSignIn = useCallback(async () => {
    setIsSigningIn(true);
    try {
      await signIn();
    } finally {
      setIsSigningIn(false);
    }
  }, [signIn]);

  const handleRetry = useCallback(() => {
    attemptedRef.current = null;
    resetOutcome();
  }, [resetOutcome]);

  const shownCode = settledCode ?? code;

  /* ---------------------------------------------------------------- */
  /* Wynik rejestracji - ma pierwszeństwo nad wszystkim innym          */
  /* ---------------------------------------------------------------- */

  if (outcome) {
    if (outcome.status === 'registered') {
      return (
        <Panel>
          <Title>You are in</Title>
          <Body>
            Your invite is linked to {shorten(outcome.referrerId)}. They get their referral points
            when you publish your first post - nothing is owed by you, now or later.
          </Body>
          {shownCode && <CodeBadge code={shownCode} />}
          <OpenAppLink label="Write your first post" />
        </Panel>
      );
    }

    if (outcome.status === 'already_referred') {
      return (
        <Panel>
          <Title>This wallet already has an inviter</Title>
          <Body>
            Someone brought you here earlier, and an invite counts once per wallet. Nothing changed
            and nothing was lost.
          </Body>
          <OpenAppLink />
        </Panel>
      );
    }

    if (outcome.status === 'self_referral') {
      return (
        <Panel>
          <Title>This is your own invite link</Title>
          <Body>
            You cannot invite yourself. Send the link to someone else - their first post is what
            makes it count.
          </Body>
          <OpenAppLink />
        </Panel>
      );
    }

    if (outcome.status === 'unknown_code') {
      return (
        <Panel>
          <Title>We do not recognise this code</Title>
          <Body>
            No account carries this invite code, so there is nothing to link. The link may have been
            cut short when it was shared. You can still use MySphere - only the invite is lost.
          </Body>
          {shownCode && <CodeBadge code={shownCode} />}
          <OpenAppLink />
        </Panel>
      );
    }

    // status === 'failed' - jedyny przypadek, w którym ponowna próba ma sens.
    return (
      <Panel>
        <Title>We could not save your invite</Title>
        <Body>{outcome.message}</Body>
        {shownCode && <CodeBadge code={shownCode} />}
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={handleRetry} className={PRIMARY_BUTTON}>
            Try again
          </button>
          <Link href={APP_ROUTE} className={QUIET_BUTTON}>
            Skip and open MySphere
          </Link>
        </div>
      </Panel>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Odczyt kodu - dzieje się po zamontowaniu                          */
  /* ---------------------------------------------------------------- */

  if (!ready) {
    /**
     * Nagłówek jest TUTAJ, a nie dopiero po odczycie kodu. Ta strona jest
     * prerenderowana statycznie, a odczyt dzieje się po zamontowaniu - gdyby
     * stan startowy był samym szkieletem, to właśnie pusty prostokąt byłby
     * jedyną treścią, jaką dostaje crawler linku i ktoś z wolnym łączem.
     */
    return (
      <Panel>
        <Title>Joining MySphere</Title>
        <Body>Reading your invite link.</Body>
        <div className="mt-5 space-y-2" aria-live="polite" aria-label="Reading your invite link">
          <div className="h-3 w-full animate-pulse rounded-pill bg-soft-sunken" />
          <div className="h-3 w-4/6 animate-pulse rounded-pill bg-soft-sunken" />
        </div>
      </Panel>
    );
  }

  /**
   * Brak kodu to nie awaria - to link bez kodu. Rozróżnienie jest tu istotne:
   * człowiek musi wiedzieć, czy ma szukać pełniejszego linku, czy odświeżyć.
   */
  if (!code) {
    return (
      <Panel>
        <Title>This link has no invite code</Title>
        <Body>
          An invite link ends with <code className="font-soft-display">?ref=</code> and a code. This
          one does not carry any, so there is no invite to link - most often the address was cut
          short somewhere on the way. Ask for the full link, or just come in.
        </Body>
        <OpenAppLink />
      </Panel>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Krok 1 - portfel                                                  */
  /* ---------------------------------------------------------------- */

  if (!isConnected || !address) {
    return (
      <Panel>
        <Title>You were invited to MySphere</Title>
        <Body>
          Connect a wallet and confirm it is yours. That is the whole sign-up - there is no form, no
          email and no payment on this page.
        </Body>
        <CodeBadge code={code} />
        <Steps current={1} />
        <button
          type="button"
          onClick={() => setIsWalletModalOpen(true)}
          className={`${PRIMARY_BUTTON} mt-6`}
        >
          Connect a wallet
        </button>
        <ConnectModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
      </Panel>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Krok 2 - podpis                                                   */
  /* ---------------------------------------------------------------- */

  if (!signedInWithThisWallet) {
    return (
      <Panel>
        <Title>Confirm this wallet is yours</Title>
        <Body>
          Sign a message with {shorten(address)} so the invite is attached to you and not to whoever
          types your address. It costs no gas and sends no transaction.
        </Body>
        <CodeBadge code={code} />
        <Steps current={2} />

        {siweError && (
          <p role="alert" className="mt-4 text-[12px] leading-[1.55] text-soft-accent-deep">
            {siweError}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isSigningIn}
            aria-busy={isSigningIn}
            className={PRIMARY_BUTTON}
          >
            {isSigningIn ? 'Check your wallet…' : 'Sign'}
          </button>
          <Link href={APP_ROUTE} className={QUIET_BUTTON}>
            Skip the invite
          </Link>
        </div>
      </Panel>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Krok 3 - zapis                                                    */
  /* ---------------------------------------------------------------- */

  return (
    <Panel>
      <Title>Linking your invite</Title>
      <Body>Recording that {shorten(address)} came in through this link.</Body>
      <CodeBadge code={code} />
      <Steps current={3} />
      <div className="mt-6 space-y-2" aria-live="polite">
        <div className="h-3 w-full animate-pulse rounded-pill bg-soft-sunken" />
        <div className="h-3 w-3/5 animate-pulse rounded-pill bg-soft-sunken" />
      </div>
    </Panel>
  );
}
