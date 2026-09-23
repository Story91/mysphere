'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import useSiweAuth from '../../utils/auth/useSiweAuth';
import { MAX_ANSWER_LENGTH } from '../../api/asks/pricing';
import { formatAskAmount } from './AskCard';
import AskSolanaWallet, { SolanaAnswerPayee } from './AskSolanaWallet';
import type { Ask } from '../../utils/asks/types';
import { isSolAsk } from '../../utils/asks/solAmounts';
import { useSolanaAskWallet } from '../../utils/asks/useSolanaAskWallet';

/**
 * Pisanie odpowiedzi na Aska BEZ WYCHODZENIA Z FEEDU.
 *
 * ===========================================================================
 * CZEGO BRAKOWALO
 * ===========================================================================
 * Pas nad postami pokazywal Aska w calosci - pytanie, budzet, miejsca, zegar -
 * ale jego przycisk WYPROWADZAL na /asks. Widziales Aska tam, gdzie juz
 * jestes, i nie mogles zajac miejsca tam, gdzie juz jestes. Przy obiekcie,
 * ktorego cala wartosc jest ograniczona terminem, kazde przekierowanie to
 * miejsce, w ktorym czesc ludzi odpada.
 *
 * ===========================================================================
 * DLACZEGO TO NIE JEST KOPIA PANELU Z /asks
 * ===========================================================================
 * Tamten panel robi cztery rzeczy: pisze odpowiedz, pokazuje watek, otwiera
 * zapieczetowane odpowiedzi autorowi i rozstrzyga z platnoscia. Tutaj jest
 * WYLACZNIE pierwsza z nich, i to jest decyzja, a nie brak czasu:
 *
 *  - WATKU NIE POBIERAMY. Kazdy watek to osobne zapytanie, a pas stoi nad
 *    feedem - najczesciej otwieranym ekranem produktu. Cztery karty razy jedno
 *    zapytanie to czterokrotny koszt wejscia na strone glowna za informacje,
 *    ktorej nikt nie prosil. Dlatego nie sprawdzamy TEZ, czy juz odpowiadales:
 *    to wie serwer i powie przy wysylce.
 *  - ROZSTRZYGANIA TU NIE MA. Wymaga portfela, podpisu i transakcji, a bywa,
 *    ze dwoch. To jest robota na wlasnym ekranie, nie w pasku nad postami.
 *    Autor dostaje z pasa odnosnik na /asks i tam robi swoje.
 *
 * ===========================================================================
 * SESJA, A NIE PORTFEL
 * ===========================================================================
 * Serwer przyjmuje odpowiedz po PODPISANEJ SESJI (SIWE), nie po podlaczonym
 * portfelu - inaczej kazdy moglby podac cudzy adres w ciele zadania. Formularz
 * pokazuje wiec trzy rozne stany zamiast jednego "zaloguj sie": brak portfela,
 * portfel bez podpisu, i gotowy. Kazdy ma inne wyjscie, bo kazdy wymaga czego
 * innego od czlowieka.
 *
 * ===========================================================================
 * ASK SOL: WYPLATA IDZIE NA PORTFEL SOLANY
 * ===========================================================================
 * Odpowiedz podpisuje sesja EVM, ale SOL za przyjeta odpowiedz trafia na
 * portfel Solany powiazany z kontem - zamrozony przy odpowiedzi w chwili
 * zapisu. Serwer przyjmie odpowiedz i bez powiazania, tylko nikt jej wtedy nie
 * zaplaci. Dlatego ramka "Get paid in SOL" stoi NAD polem odpowiedzi, a gdy
 * serwer powie `payoutAddressBound: false`, potwierdzenie prowadzi przez
 * powiazanie i przypiecie portfela do tej odpowiedzi (SolanaAnswerPayee).
 */

export default function FeedAnswerForm({
  ask,
  onSent,
  onClose,
}: {
  ask: Ask;
  /** Wolane po udanej wysylce - pas podbija licznik bez ponownego odczytu. */
  onSent: (askId: string) => void;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const { isAuthenticated, isLoading: authLoading, signIn } = useSiweAuth();

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  /** Odpowiedz Aska SOL bez zamrozonego odbiorcy - id do POST .../payee. */
  const [unboundAnswerId, setUnboundAnswerId] = useState<string | null>(null);

  const sol = isSolAsk(ask);
  // Serwer pytamy o powiazanie tylko przy Asku SOL - pas ma kilka kart naraz.
  const solWallet = useSolanaAskWallet({ enabled: sol });

  const content = draft.trim();
  const tooLong = draft.length >= MAX_ANSWER_LENGTH;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (content === '' || sending) return;

    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/asks/answers', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ askId: ask.id, content }),
      });

      if (!response.ok) {
        // Serwer zna powody, ktorych ten formularz celowo nie sprawdza sam
        // (juz odpowiadales, jestes autorem, termin minal w miedzyczasie).
        // Jego zdanie jest tu lepsze niz nasze zgadywanie.
        let detail = 'The answer was not sent.';
        try {
          const body = await response.json();
          if (typeof body?.error === 'string' && body.error) detail = body.error;
        } catch {
          // Odpowiedz bez JSON-a - zostaje zdanie ogolne.
        }
        setError(detail);
        return;
      }

      // Ask SOL: czy odbiorca wyplaty zostal zamrozony razem z odpowiedzia.
      // Brak pola (starszy serwer, Ask USDC) = nie pytamy o nic wiecej.
      if (sol) {
        try {
          const saved = (await response.json()) as { id?: unknown; payoutAddressBound?: unknown };
          if (saved.payoutAddressBound === false && typeof saved.id === 'string') {
            setUnboundAnswerId(saved.id);
          }
        } catch {
          // Odpowiedz bez JSON-a - zapis sie udal, reszta i tak jest na /asks.
        }
      }

      setDraft('');
      setSent(true);
      onSent(ask.id);
    } catch (caught) {
      console.error('[feed] Wyslanie odpowiedzi nie powiodlo sie:', caught);
      // "Nic nie zapisano" jest tu WAZNE: bez tego czlowiek nie wie, czy
      // ponowna wysylka nie zrobi drugiej odpowiedzi.
      setError('The answer was not sent. Nothing was stored. Try again.');
    } finally {
      setSending(false);
    }
  }

  const box = 'mt-2 rounded-lg border border-soft-line bg-soft-surface p-3';
  const button =
    'inline-flex items-center justify-center rounded-lg px-3 py-1.5 font-soft-display text-[12.5px] font-semibold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface disabled:opacity-50 disabled:active:scale-100';

  /* ===== POTWIERDZENIE ZOSTAJE, DOPOKI CZLOWIEK GO NIE ZAMKNIE =====
     Zapieczetowanej odpowiedzi nie da sie potem obejrzec, wiec zniknieciu
     formularza musi towarzyszyc zdanie o tym, co sie wlasnie stalo i kiedy
     to sie rozstrzygnie. */
  if (sent) {
    return (
      <div className={box}>
        <p className="text-[12.5px] leading-[1.5] text-soft-ink">
          Answer sealed. The author sees it only when they resolve. If they pick yours, it pays{' '}
          {formatAskAmount(ask, 'perAnswer')}
          {sol ? ' to your Solana wallet' : ''}.
        </p>
        {sol && unboundAnswerId && (
          <SolanaAnswerPayee askId={ask.id} answerId={unboundAnswerId} wallet={solWallet} className="mt-2" />
        )}
        <button type="button" onClick={onClose} className={`${button} mt-2 bg-soft-primary text-white`}>
          Done
        </button>
      </div>
    );
  }

  if (!address) {
    return (
      <div className={box}>
        <p className="text-[12.5px] leading-[1.5] text-soft-ink-muted">
          Connect a wallet to answer. Payment goes to the address that answers, so it has to be yours.
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={box}>
        <p className="mb-2 text-[12.5px] leading-[1.5] text-soft-ink-muted">
          Sign in once so the server knows the answer is yours. It is a signature, not a
          transaction, and it costs nothing.
        </p>
        <button
          type="button"
          onClick={() => void signIn()}
          disabled={authLoading}
          className={`${button} bg-soft-primary text-white`}
        >
          {authLoading ? 'Signing…' : 'Sign in'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={box}>
      {/* Nad polem, nie pod przyciskiem: portfel na wyplate trzeba ustawic,
          ZANIM ktos spedzi czas na odpowiedzi. Serwer przyjmie ja i bez tego,
          ale wtedy nikt jej nie zaplaci. */}
      {sol && <AskSolanaWallet wallet={solWallet} purpose="receive" className="mb-2" />}
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value.slice(0, MAX_ANSWER_LENGTH))}
        rows={4}
        autoFocus
        placeholder="Answer the question. Nobody else sees this until the author resolves."
        className="w-full resize-y rounded-lg border border-soft-line bg-soft-bg px-3 py-2 font-soft text-[13.5px] text-soft-ink outline-none transition-[border-color] [transition-duration:var(--dur-press)] ease-out-strong placeholder:text-soft-ink-faint focus:border-soft-primary focus-visible:ring-2 focus-visible:ring-soft-primary"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span
          className={`font-soft text-[11.5px] tabular-nums ${
            tooLong ? 'text-soft-ink' : 'text-soft-ink-faint'
          }`}
        >
          {draft.trim().length}/{MAX_ANSWER_LENGTH}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`${button} border border-soft-line text-soft-ink-muted hover:text-soft-ink`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={content === '' || sending}
            className={`${button} bg-soft-primary text-white`}
          >
            {sending ? 'Sending…' : 'Send answer'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-[12px] leading-[1.5] text-red-700">{error}</p>
      )}
    </form>
  );
}
