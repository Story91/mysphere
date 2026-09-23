'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { bindAnswerPayee, type SolanaAskWallet } from '../../utils/asks/useSolanaAskWallet';
import { shortBase58 } from '../../utils/asks/solAskDisplay';

/**
 * RAMKA "PORTFEL SOLANY DLA ASKOW" - jedna dla kompozytora, formularza
 * odpowiedzi i panelu /asks.
 *
 * Czysto prezentacyjna: stan i akcje przychodza z useSolanaAskWallet(), wiec
 * trzy miejsca nie maja trzech wersji tych samych zdan. Zadnego @solana/* -
 * komponent stoi w glownym bundlu feedu.
 *
 * `purpose` zmienia TYLKO to, po co jest portfel:
 *   pay      autor - z tego portfela placi przyjete odpowiedzi
 *   receive  odpowiadajacy - na ten portfel przychodzi SOL za przyjeta odpowiedz
 *
 * Wyglad: morski akcent Askow (`soft-ask`) na jasnym tle, jak pasek stanu
 * AskCard - to czesc Aska, a nie osobny modal portfela.
 */

export const LINK_EXPLAINER =
  'Linking is one free signature in your Solana wallet. It moves no funds and costs no fee - it only tells MySphere which Solana wallet belongs to your account.';

const buttonClass =
  'inline-flex shrink-0 items-center justify-center rounded-pill px-3.5 py-1.5 font-soft-display text-[12px] font-semibold transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface disabled:cursor-not-allowed disabled:bg-soft-line-strong disabled:shadow-none disabled:active:scale-100';
const primary = `${buttonClass} bg-soft-primary-deep text-white shadow-chip hover:bg-soft-primary-deep/90`;
const quiet = `${buttonClass} border border-soft-line bg-soft-surface text-soft-ink-muted hover:text-soft-ink`;

export default function AskSolanaWallet({
  wallet,
  purpose,
  className = '',
}: {
  wallet: SolanaAskWallet;
  purpose: 'pay' | 'receive';
  className?: string;
}) {
  const {
    available,
    connected,
    connecting,
    address,
    walletName,
    canSignMessage,
    binding,
    bindingPhase,
    bindingError,
    linkedHere,
    linking,
    linkNote,
    linkError,
  } = wallet;

  const title = purpose === 'pay' ? 'Your Solana wallet' : 'Get paid in SOL';

  const shell = `rounded-lg border border-soft-ask/25 bg-soft-ask-soft/50 p-3 font-soft ${className}`;
  const heading = (
    <p className="mb-1 flex items-center gap-2 font-soft-display text-[12px] font-bold uppercase tracking-[0.12em] text-soft-ask-deep">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${binding ? 'bg-soft-ask' : 'bg-soft-line-strong'}`}
        aria-hidden="true"
      />
      {title}
    </p>
  );
  const body = 'break-words text-[12px] leading-[1.5] text-soft-ink-muted';

  const footer = (
    <>
      {linkNote && (
        <p className="mt-2 break-words text-[12px] leading-[1.5] text-soft-primary-deep" role="status">
          {linkNote}
        </p>
      )}
      {linkError && (
        <p className="mt-2 break-words text-[12px] leading-[1.5] text-soft-accent-deep" role="alert">
          {linkError}
        </p>
      )}
    </>
  );

  if (!available) {
    return (
      <div className={shell}>
        {heading}
        <p className={body}>
          Solana wallets do not work inside this app view. Open MySphere in a browser with Phantom,
          Solflare or Backpack to {purpose === 'pay' ? 'pay in SOL' : 'link a wallet and get paid in SOL'}.
        </p>
      </div>
    );
  }

  if (bindingPhase === 'needs-session') {
    return (
      <div className={shell}>
        {heading}
        <p className={`${body} mb-2`}>
          Sign in with your main wallet first. The Solana wallet is linked to that account, so the
          server needs to know it is you.
        </p>
        <button type="button" onClick={() => void wallet.signIn()} className={primary}>
          Sign in
        </button>
        {footer}
      </div>
    );
  }

  if (bindingPhase === 'loading' || (bindingPhase === 'idle' && connecting)) {
    return (
      <div className={shell} aria-busy="true">
        {heading}
        <p className={body}>{connecting ? 'Connecting your Solana wallet…' : 'Checking your linked Solana wallet…'}</p>
      </div>
    );
  }

  if (bindingPhase === 'failed') {
    return (
      <div className={shell}>
        {heading}
        <p className={`${body} mb-2`}>
          {bindingError ?? 'Your linked Solana wallet could not be checked.'} This is a failed read, not
          a missing link.
        </p>
        <button type="button" onClick={() => void wallet.refresh()} className={quiet}>
          Try again
        </button>
      </div>
    );
  }

  /* ===== POWIAZANY I PODLACZONY - wszystko gotowe ===== */
  if (linkedHere && binding) {
    return (
      <div className={shell}>
        {heading}
        <p className={body}>
          <span className="font-semibold text-soft-ink" title={binding.solana}>
            {shortBase58(binding.solana)}
          </span>
          {walletName ? ` · ${walletName}` : ''} is linked.{' '}
          {purpose === 'pay'
            ? 'Every answer you accept is paid from this wallet.'
            : 'Accepted answers pay SOL straight to this wallet.'}
        </p>
        {footer}
      </div>
    );
  }

  /* ===== POWIAZANY, ALE PODLACZONY INNY (albo zaden) ===== */
  if (binding) {
    return (
      <div className={shell}>
        {heading}
        <p className={`${body} mb-2`}>
          Your account is linked to{' '}
          <span className="font-semibold text-soft-ink" title={binding.solana}>
            {shortBase58(binding.solana)}
          </span>
          .{' '}
          {connected && address ? (
            <>
              You are connected with{' '}
              <span className="font-semibold text-soft-ink" title={address}>
                {shortBase58(address)}
              </span>
              . Linking it instead only changes {purpose === 'pay' ? 'Asks you post' : 'answers you write'} from
              now on.
            </>
          ) : purpose === 'pay' ? (
            'Connect that wallet when you accept answers - payments come from it.'
          ) : (
            'Accepted answers pay SOL to that wallet.'
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {connected && address ? (
            <button
              type="button"
              onClick={() => void wallet.link()}
              disabled={linking || !canSignMessage}
              className={quiet}
            >
              {linking ? 'Linking…' : `Link ${shortBase58(address)} instead`}
            </button>
          ) : (
            <button type="button" onClick={wallet.connect} className={quiet}>
              Connect Solana wallet
            </button>
          )}
        </div>
        {footer}
      </div>
    );
  }

  /* ===== NIC NIE JEST POWIAZANE ===== */
  return (
    <div className={shell}>
      {heading}
      <p className={`${body} mb-2`}>
        {purpose === 'pay'
          ? 'SOL Asks are paid from the Solana wallet linked to your account. '
          : 'This Ask pays in SOL. Link a Solana wallet to get paid if your answer is accepted. '}
        {LINK_EXPLAINER}
      </p>
      {connected && address ? (
        <>
          <button
            type="button"
            onClick={() => void wallet.link()}
            disabled={linking || !canSignMessage}
            className={primary}
          >
            {linking ? 'Check your wallet…' : `Link ${shortBase58(address)} · free signature`}
          </button>
          {!canSignMessage && (
            <p className="mt-2 break-words text-[12px] leading-[1.5] text-soft-accent-deep">
              {walletName ?? 'This wallet'} cannot sign messages, so it cannot be linked. Try Phantom,
              Solflare or Backpack.
            </p>
          )}
        </>
      ) : (
        <button type="button" onClick={wallet.connect} disabled={connecting} className={primary}>
          {connecting ? 'Connecting…' : 'Connect Solana wallet'}
        </button>
      )}
      {footer}
    </div>
  );
}

/**
 * ODPOWIEDZ BEZ PORTFELA DO WYPLATY - przypiecie odbiorcy po fakcie.
 *
 * Serwer przyjmuje odpowiedz na Ask SOL takze bez powiazanego portfela (spec,
 * "Dla wlasciciela" pkt 4), ale wyplata jest zablokowana, dopoki odbiorca nie
 * zostanie zamrozony przy tej odpowiedzi. Ta ramka prowadzi przez oba kroki:
 * powiaz portfel (podpis, zero pieniedzy), potem POST /api/asks/[id]/payee.
 * Drugi krok rusza sam, gdy tylko powiazanie istnieje - czlowiek nie musi
 * wiedziec, ze to dwie operacje.
 */
export function SolanaAnswerPayee({
  askId,
  answerId,
  wallet,
  onBound,
  className = '',
}: {
  askId: string;
  answerId: string;
  wallet: SolanaAskWallet;
  onBound?: (payoutAddress: string) => void;
  className?: string;
}) {
  const [phase, setPhase] = useState<'idle' | 'attaching' | 'done' | 'failed'>('idle');
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const triedFor = useRef<string | null>(null);

  const attach = useCallback(async () => {
    setPhase('attaching');
    setError(null);
    const result = await bindAnswerPayee(askId, answerId);
    if (result.ok) {
      setAddress(result.payoutAddress);
      setPhase('done');
      onBound?.(result.payoutAddress);
      return;
    }
    setError(result.error);
    setPhase('failed');
  }, [askId, answerId, onBound]);

  // Powiazanie wlasnie powstalo (albo juz bylo) - przypinamy raz na dany
  // portfel. Ponowna proba tylko przyciskiem, zeby blad nie krecil sie w petli.
  const bound = wallet.binding?.solana ?? null;
  useEffect(() => {
    if (!bound || phase !== 'idle' || triedFor.current === bound) return;
    triedFor.current = bound;
    void attach();
  }, [bound, phase, attach]);

  if (phase === 'done' && address) {
    return (
      <div className={`rounded-lg border border-soft-ask/25 bg-soft-ask-soft/50 p-3 font-soft ${className}`}>
        <p className="break-words text-[12px] leading-[1.5] text-soft-ask-deep">
          <span className="font-semibold" title={address}>
            {shortBase58(address)}
          </span>{' '}
          will receive the SOL if this answer is accepted.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="mb-2 break-words text-[12px] leading-[1.5] text-soft-ink-muted">
        This answer has no payout wallet yet, so the author cannot pay it. Link a Solana wallet to get
        paid if it is accepted.
      </p>
      <AskSolanaWallet wallet={wallet} purpose="receive" />
      {phase === 'attaching' && (
        <p className="mt-2 text-[12px] leading-[1.5] text-soft-primary-deep" role="status">
          Attaching your wallet to this answer…
        </p>
      )}
      {phase === 'failed' && (
        <div className="mt-2">
          <p className="mb-1.5 break-words text-[12px] leading-[1.5] text-soft-accent-deep" role="alert">
            {error}
          </p>
          <button type="button" onClick={() => void attach()} className={quiet}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
