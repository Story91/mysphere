'use client';

/**
 * Zaslona nad premium czescia posta (tip-to-unlock).
 *
 * Zasada: post BEZ pol premium nie renderuje tego komponentu w ogole - stan
 * feedu sprzed monetyzacji wyglada i dziala dokladnie tak samo.
 *
 * Platnosc idzie ta sama sciezka co tip (usePaymentFlow: useSendTransaction ->
 * useWaitForTransactionReceipt), a odblokowanie zapisuje dopiero POST
 * /api/unlock, ktory jeszcze raz sprawdza transakcje na lancuchu. Cofnieta
 * transakcja nie odblokowuje niczego.
 *
 * === SKAD BIERZE SIE TRESC ===
 * Nie z feedu. Tresc premium NIE jest juz zapisywana w dokumencie posta -
 * wczesniej byla, a poniewaz feed czyta posty klienckim SDK, kazdy widzial ja
 * w odpowiedzi sieciowej bez placenia. Teraz mieszka w kolekcji, ktorej klient
 * nie czyta wcale, i wydaje ja GET /api/premium po sprawdzeniu podpisanej sesji
 * oraz rekordu w `unlocks`. Ten komponent pobiera ja dopiero wtedy, gdy ma
 * podstawy sadzic, ze uzytkownik ma prawo - a i tak decyduje serwer.
 *
 * ZGODNOSC WSTECZ: posty sprzed tej zmiany maja tresc w polu `premiumContent`.
 * Ich tresc jest juz publiczna i nic tego nie cofnie, ale trasa serwerowa
 * podaje ja tak samo, wiec odblokowanie dziala bez zmian.
 *
 * === TRZY RZECZY, KTORE MUSZA SIE ZDARZYC W TEJ KOLEJNOSCI ===
 * 1. PODPIS SIWE, potem pieniadze (`requireSession` w usePaymentFlow). Tresc
 *    wydaje sie wylacznie zalogowanemu adresowi, wiec platnosc bez sesji
 *    kupowala dostep, ktorego nie dalo sie odebrac.
 * 2. SPRAWDZENIE, CZY JUZ NIE ZAPLACIL. Zbiorcze `isUnlocked` z feedu potrafi
 *    byc puste takze wtedy, gdy zapytanie do Firestore po prostu padlo - a
 *    "nie wiem" wygladalo wtedy identycznie jak "nie masz dostepu" i prowadzilo
 *    prosto do DRUGIEJ platnosci za to samo. Przed wyslaniem transakcji pytamy
 *    wiec serwer wprost.
 * 3. "Sign in with your wallet to read this" jest PRZYCISKIEM. Dotad bylo samym
 *    zdaniem, a w calej aplikacji nie bylo zadnego miejsca, w ktorym dalo sie
 *    ten podpis zlozyc - kto zaplacil bez sesji, zostawal z tekstem i niczym
 *    wiecej.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';
import { getExplorerTxLink } from '../../basechat/components/TipNetworkConfig';
import { useSiweAuth } from '../../utils/auth/useSiweAuth';
import { DEFAULT_UNLOCK_TOKEN, type MonetizationToken } from '../../utils/monetization/types';
import { usePaymentFlow } from './usePaymentFlow';

export interface PremiumGateProps {
  postId: string;
  /** Autor posta - odbiorca platnosci. */
  creatorAddress: string;
  unlockPrice: string;
  unlockToken?: MonetizationToken;
  /** Wynik ZBIORCZEGO sprawdzenia z useFeedUnlocks - bez zapytania per post. */
  isUnlocked?: boolean;
  onUnlocked?: (postId: string) => void;
}

export default function PremiumGate({
  postId,
  creatorAddress,
  unlockPrice,
  unlockToken = DEFAULT_UNLOCK_TOKEN,
  isUnlocked = false,
  onUnlocked,
}: PremiumGateProps) {
  const { address, isConnected } = useAccount();
  const { signIn, isAuthenticated } = useSiweAuth();
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Tresc pobierana z serwera - nie ma jej w propsach i nie ma jej w feedzie.
  const [content, setContent] = useState<string | null>(null);
  /**
   * Blad odczytu tresci wraz z informacja, CZY da sie z nim cos zrobic samemu.
   * `needsSignIn` znaczy "serwer nie wie, kim jestes" - a to jedyny blad, ktory
   * uzytkownik usuwa jednym podpisem, wiec musi dostac na to przycisk, nie zdanie.
   */
  const [contentError, setContentError] = useState<{ message: string; needsSignIn: boolean } | null>(
    null
  );

  /**
   * Stan sprawdzenia "czy juz zaplaciles", robionego przed kazda platnoscia.
   *  - 'checking' - pytanie w locie,
   *  - 'unreachable' - serwer nie odpowiedzial. To NIE jest "nie zaplaciles":
   *    nie wiemy, wiec nie wysylamy transakcji. Cicha zgoda konczylaby sie
   *    druga platnoscia za ten sam post.
   */
  const [accessCheck, setAccessCheck] = useState<'idle' | 'checking' | 'unreachable'>('idle');

  const isAuthor = !!address && address.toLowerCase() === creatorAddress.toLowerCase();
  const unlocked = isUnlocked || justUnlocked || isAuthor;

  /**
   * "Ani tresci, ani bledu" znaczy dokladnie tyle, co "pobieranie trwa albo
   * zaraz sie zacznie" - wiec szkielet pokazuje sie juz w pierwszej klatce.
   * Osobny stan `isFetchingContent` byl na to za wolny: ustawial go dopiero
   * efekt PO renderze, wiec miedzy odslonieciem a startem pobierania mrugala
   * pusta ramka.
   */
  const isLoadingContent = unlocked && content === null && contentError === null;

  /**
   * Post pod tym samym komponentem sie zmienil - wszystko, co dotyczylo
   * poprzedniego, przestaje obowiazywac.
   *
   * Bez tego React, ktory przy przesortowaniu feedu potrafi uzyc tej samej
   * instancji dla innego posta, pokazywal tresc premium POPRZEDNIEGO posta:
   * `content` nie bylo `null`, wiec efekt pobierajacy z serwera nawet nie
   * ruszal. `justUnlocked` przenosilo w ten sam sposob cudze odblokowanie.
   *
   * Efekt jest zadeklarowany PRZED pobieraniem celowo - najpierw czysci stan,
   * a dopiero kolejny render odpala zapytanie o wlasciwy post.
   */
  useEffect(() => {
    setContent(null);
    setContentError(null);
    setJustUnlocked(false);
    setAccessCheck('idle');
  }, [postId]);

  /**
   * JEDEN PODPIS ODSLANIA WSZYSTKO OD RAZU.
   *
   * Sesja jest wspolna dla calej strony (useSiweAuth trzyma ja w module), ale
   * kazda bramka pamietala WLASNE "serwer nie wie, kim jestes" i czekala na
   * osobne klikniecie. Autor z dwoma platnymi postami musial wiec podpisac
   * pierwszy, a drugi i tak dalej prosil - albo odswiezyc strone.
   *
   * Skoro sesja wlasnie powstala - obojetne, czy z przycisku tutaj, z paska
   * sesji, czy z platnosci - powod bledu przestal istniec. Wyzerowanie go jest
   * jednoczesnie sygnalem dla efektu ponizej, zeby pobrac tresc.
   *
   * REAGUJEMY NA PRZEJSCIE, NIE NA STAN. Warunek "jest sesja, wiec skasuj
   * blad" petliby sie w nieskonczonosc, gdyby serwer mimo wszystko odpowiadal
   * 401 (wygasle cookie przy adresie wciaz pamietanym po stronie klienta):
   * blad znikalby, efekt pobierania odpalalby sie od nowa i tak w kolko.
   */
  const wasAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    const justSignedIn = isAuthenticated && !wasAuthenticatedRef.current;
    wasAuthenticatedRef.current = isAuthenticated;
    if (justSignedIn) setContentError((previous) => (previous?.needsSignIn ? null : previous));
  }, [isAuthenticated]);

  /**
   * Pobranie tresci. Odpalane tylko wtedy, gdy klient ma POWODY sadzic, ze
   * uzytkownik ma prawo - ale to serwer jest tu rozstrzygajacy. 401 znaczy
   * "nie wiem, kim jestes": bez podpisanej sesji nie da sie odroznic
   * placacego od kogos, kto poda cudzy adres.
   *
   * Warunek na `contentError` pilnuje, zeby nieudana proba nie zapetlila sie
   * w kolko; wyzerowanie bledu ("Try again") jest jednoczesnie sygnalem do
   * ponownego pobrania.
   */
  useEffect(() => {
    if (!unlocked || content !== null || contentError !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/premium?postId=${encodeURIComponent(postId)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = (await response.json().catch(() => ({}))) as {
          content?: string;
          error?: string;
          code?: string;
        };

        if (cancelled) return;

        if (!response.ok) {
          const needsSignIn = data.code === 'session_required';
          setContentError({
            needsSignIn,
            /**
             * === AUTOR NIE PROSI O POZWOLENIE NA WLASNY TEKST ===
             * Zgloszenie brzmialo: "nie rozumiem, czemu musze sie podpisac,
             * zeby zobaczyc swoj wlasny post". Powod jest nasz, nie jego:
             * tekst lezy poza feedem, wiec serwer widzi tylko zadanie HTTP -
             * sam adres portfela moze podac kazdy. Trzeba wiec to POWIEDZIEC,
             * a nie kazac sie domyslac.
             */
            message: needsSignIn
              ? isAuthor
                ? 'This is your own text - we just have to know it is you. It is kept off the feed so nobody reads it without paying, and the only way we can tell your wallet from anyone typing your address is one signature. No gas, no transaction.'
                : 'This text is only served to a wallet that signed in - we have to know it is you. Signing costs no gas and sends no transaction, and your payment stays valid.'
              : response.status === 404 && isAuthor
                ? 'The paid text for this post was never stored, so there is nothing to hand out and nobody can buy it.'
                : data.error || 'Could not load the premium content.',
          });
          return;
        }

        setContent(typeof data.content === 'string' ? data.content : '');
      } catch {
        if (!cancelled) {
          setContentError({ message: 'Could not load the premium content.', needsSignIn: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `isAuthor` jest w zaleznosciach, bo rozstrzyga TRESC komunikatu bledu.
    // Ponowne wejscie jest tanie: efekt i tak nic nie robi, dopoki tresc albo
    // blad juz sa.
  }, [unlocked, content, contentError, postId, isAuthor]);

  const recordUnlock = useCallback(
    async (txHash: `0x${string}`) => {
      const response = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, walletAddress: address, txHash }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unlock could not be recorded');
      }
      setJustUnlocked(true);
      onUnlocked?.(postId);
      toast.success('Premium content unlocked');
    },
    [postId, address, onUnlocked]
  );

  // requireSession: podpis SIWE jest warunkiem WSTEPNYM platnosci, nie jej
  // nastepstwem - patrz naglowek pliku i komentarz w usePaymentFlow.
  const { phase, error, txHash, isBusy, isOnBase, needsSignIn, switchToBase, pay, reset } =
    usePaymentFlow(recordUnlock, { requireSession: true });

  /**
   * Podpis dla kogos, kto JUZ zaplacil, ale wrocil bez sesji. Po udanym podpisie
   * kasujemy blad - to jednoczesnie sygnal dla efektu, zeby pobrac tresc jeszcze
   * raz. Nikt nie placi drugi raz za nic.
   */
  const handleSignInForContent = useCallback(async () => {
    setIsSigningIn(true);
    try {
      const ok = await signIn();
      if (ok) setContentError(null);
    } finally {
      setIsSigningIn(false);
    }
  }, [signIn]);

  /**
   * Klikniecie "Unlock". Pytamy serwer, czy ten portfel juz nie ma tego posta -
   * i dopiero potem pozwalamy platnosci ruszyc.
   *
   * Zbiorcze `isUnlocked` przychodzi z useFeedUnlocks, ktore przy bledzie
   * zapytania do Firestore zwraca PUSTY zbior i loguje blad do konsoli. Dla tego
   * komponentu "awaria odczytu" wygladalo wiec dokladnie tak samo jak "nie masz
   * dostepu", a jedyna droga naprzod, jaka mu pokazywalismy, byla ZAPLACIC
   * PONOWNIE za post, ktory juz jest jego.
   */
  const handleUnlockClick = useCallback(async () => {
    if (!address || isBusy || accessCheck === 'checking') return;

    setAccessCheck('checking');

    let alreadyUnlocked: boolean;
    try {
      const response = await fetch(
        `/api/unlock?postId=${encodeURIComponent(postId)}&wallet=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error(`unlock check failed: ${response.status}`);
      const data = (await response.json()) as { unlocked?: unknown };
      alreadyUnlocked = data.unlocked === true;
    } catch (checkError) {
      console.error('[PremiumGate] nie udalo sie sprawdzic wczesniejszego odblokowania:', checkError);
      setAccessCheck('unreachable');
      return;
    }

    setAccessCheck('idle');

    if (alreadyUnlocked) {
      setJustUnlocked(true);
      onUnlocked?.(postId);
      toast.success('You already paid for this post - opening it instead of charging you again.');
      return;
    }

    pay({ to: creatorAddress, amount: unlockPrice, token: unlockToken });
  }, [
    address,
    isBusy,
    accessCheck,
    postId,
    onUnlocked,
    pay,
    creatorAddress,
    unlockPrice,
    unlockToken,
  ]);

  // Brak sensownej ceny = post nie jest platny, nic nie rysujemy. O istnieniu
  // czesci premium decyduje juz hasPremiumContent() po stronie feedu.
  if (!unlockPrice || !(parseFloat(unlockPrice) > 0)) {
    return null;
  }

  const priceLabel = `${unlockPrice} ${unlockToken}`;

  if (unlocked) {
    return (
      /* ===== POMARANCZ TYLKO NA KWOCIE, NIE NA CALYM PANELU =====
         Ten blok byl pomaranczowy w calosci: tlo bg-soft-accent-soft, obwodka
         border-soft-accent, naglowek i KAZDY napis w text-soft-accent-deep.
         To dokladnie ten sam blad, ktory naprawilismy w PremiumComposer, i
         uzasadnienie jest to samo: zasada "pomaranczowy zarezerwowany dla
         pieniedzy" dziala tak dlugo, jak dlugo pomaranczowy jest RZADKI. Gdy
         nosi go tlo, ramka i trzy napisy, przestaje cokolwiek znaczyc - wzrok
         nie ma za czym isc, a blok czyta sie jak ostrzezenie zamiast jak
         kupiona tresc.

         Tutaj, w stanie ODBLOKOWANYM, zadnej kwoty juz nie ma - nie ma wiec
         powodu, zeby byl choc jeden pomaranczowy piksel. Zostaje spokojna
         karta na lawendowym tle, taka sama jak panel kompozytora, a bohaterem
         jest tresc, nie ramka wokol niej.

         KONTRAST po przemalowaniu (na bg-soft-bg #f1edfa):
           ink 12.0:1, ink-muted 4.8:1, primary-deep 5.4:1 - wszystkie >= 4.5:1. */
      <div className="my-3 rounded-card border border-soft-line bg-soft-bg p-4 font-soft">
        <div className="flex items-center gap-2 mb-2 font-soft-display text-xs font-semibold text-soft-ink-muted">
          <span>🔓</span>
          <span>{isAuthor ? 'Premium content (yours)' : 'Premium content unlocked'}</span>
        </div>
        {isLoadingContent ? (
          <div className="space-y-2" aria-live="polite" aria-label="Loading premium content">
            <div className="h-3 w-11/12 animate-pulse rounded-pill bg-soft-line-strong/70" />
            <div className="h-3 w-8/12 animate-pulse rounded-pill bg-soft-line-strong/70" />
          </div>
        ) : contentError ? (
          <div className="space-y-2">
            {/* Komunikat bledu na pelnym atramencie, nie na akcencie: to nie jest
                kwota, a przy okazji 12:1 zamiast 4.5:1. */}
            <p role="alert" className="text-xs leading-relaxed text-soft-ink">
              {contentError.message}
            </p>
            {contentError.needsSignIn ? (
              /* PRZYCISK, nie zdanie. Wczesniej staly tu same slowa "Sign in
                 with your wallet to read this", a w calej aplikacji nie bylo
                 miejsca, w ktorym dalo sie to zrobic - kto zaplacil bez sesji,
                 nie mial jak dojsc do swojej tresci. */
              <button
                type="button"
                onClick={handleSignInForContent}
                disabled={isSigningIn}
                aria-busy={isSigningIn}
                /* bg-soft-primary-deep, nie bg-soft-primary: bialy tekst na
                   #7c6bda daje 4.2:1, czyli PONIZEJ 4.5:1 wymaganego dla tekstu
                   tej wielkosci. Na #5f4ec2 to 6.3:1. Podpis nie jest platnoscia,
                   wiec kolor zostaje fioletowy - pomaranczowy nalezy do kwoty. */
                className="rounded-pill bg-soft-primary-deep px-4 py-2 text-xs font-semibold text-white shadow-chip transition-[filter,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
              >
                {/* Autor nie "kupuje dostepu" i nie ma czego odblokowywac -
                    prosimy go wylacznie o potwierdzenie tozsamosci, wiec
                    przycisk mowi, co sie stanie, a nie czego mu brakuje. */}
                {isSigningIn
                  ? 'Check your wallet…'
                  : isAuthor
                    ? 'Confirm it is me'
                    : 'Sign in to read this'}
              </button>
            ) : (
              /* Wyzerowanie bledu odpala efekt jeszcze raz. Bez tego jedna
                 chwilowa awaria sieci zostawiala zaplacona tresc niedostepna
                 az do przeladowania strony. */
              <button
                type="button"
                onClick={() => setContentError(null)}
                className="rounded-pill px-1 text-xs font-semibold text-soft-primary-deep underline transition-[color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
              >
                Try again
              </button>
            )}
          </div>
        ) : content ? (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words text-soft-ink">
            {content}
          </div>
        ) : (
          // Pusta tresc to nie to samo, co blad: post jest oznaczony jako platny,
          // ale nic w nim nie ma. Puste miejsce wygladaloby jak zaciecie.
          <p className="text-xs leading-relaxed text-soft-ink-muted">
            This post has no premium text.
          </p>
        )}

        {/* Informacja WIDOCZNA DLA AUTORA - to jedyna osoba decydujaca o
            zamknieciu tresci, wiec musi wiedziec, czym ta zaslona naprawde jest. */}
        {isAuthor && (
          <p className="mt-3 border-t border-soft-line pt-2 text-[11px] leading-relaxed text-soft-ink-muted">
            This text is stored outside the feed and served only to readers who paid, so it
            is not visible in the page&apos;s network response. It is still plain text on our
            server, not end-to-end encrypted.
          </p>
        )}
      </div>
    );
  }

  return (
    /* Ta sama zamiana co wyzej: spokojna karta zamiast pomaranczowej plamy.
       Roznica jest jedna i celowa - TU jest kwota, wiec tu zostaje akcent.
       Nosza go dokladnie dwie rzeczy, obie bedace pieniedzmi: pigulka z cena
       i przycisk, ktory te cene pobiera. Reszta jest atramentowa. */
    <div className="my-3 rounded-card border border-soft-line bg-soft-bg p-4 font-soft">
      {/* Rozmyty podglad - sygnalizuje, ze cos tam jest, ale nic nie zdradza.
          Tresc premium NIE jest tu renderowana; przychodzi dopiero z serwera
          w dokumencie posta, gdy uzytkownik ma do niej prawo. */}
      <div className="relative mb-3 select-none" aria-hidden="true">
        <div className="blur-sm opacity-60 space-y-2">
          <div className="h-3 w-11/12 rounded-pill bg-soft-ink-faint" />
          <div className="h-3 w-9/12 rounded-pill bg-soft-ink-faint" />
          <div className="h-3 w-10/12 rounded-pill bg-soft-ink-faint" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-soft-display font-semibold text-soft-ink">🔒 Premium part of this post</div>
          <div className="text-xs text-soft-ink-muted">
            {/* KWOTA - jedyne miejsce w tym zdaniu, ktore dostaje akcent.
                Pigulka jest biala, nie lawendowa, i nie jest ozdoba: pomaranczowy
                #c2410c na tle #f1edfa daje 4.496:1, czyli wlos PONIZEJ progu,
                a na bieli 5.2:1. To ta sama para kolorow co pole ceny w
                PremiumComposer. */}
            One-time payment of{' '}
            <span className="inline-block rounded-pill bg-soft-surface px-1.5 py-0.5 font-soft-display font-bold tabular-nums text-soft-accent-deep">
              {priceLabel}
            </span>{' '}
            to the author. No subscription, no token.
          </div>
        </div>

        {!isConnected ? (
          /* ink-soft na tym tle to 3.0:1 - ponizej progu, a to jedyna
             wskazowka, jaka niepodlaczony uzytkownik tu dostaje. ink-muted daje 4.8:1. */
          <span className="text-xs text-soft-ink-muted">Connect your wallet to unlock</span>
        ) : !isOnBase ? (
          <button
            type="button"
            onClick={switchToBase}
            /* Zmiana sieci NIE jest platnoscia - to warunek wstepny. Pomaranczowy
               oddajemy wiec przyciskowi, ktory faktycznie pobiera kwote, a ten
               zostaje fioletowy. Bialy tekst na #5f4ec2 to 6.3:1. */
            className="px-4 py-2 text-sm font-semibold rounded-pill bg-soft-primary-deep text-white shadow-chip transition-[filter,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
          >
            Switch to Base
          </button>
        ) : (
          <button
            type="button"
            onClick={handleUnlockClick}
            disabled={isBusy || accessCheck === 'checking'}
            aria-busy={isBusy || accessCheck === 'checking'}
            /* JEDYNE pelne wypelnienie akcentem w calym komponencie - i jedyne
               uzasadnione, bo ten przycisk pobiera pieniadze, a jego napis JEST
               kwota. Wypelnienie zostaje rzadkie, wiec dalej cos znaczy.
               Kolor: bialy na #c2410c to 5.2:1. Wczesniej bylo tu
               bg-soft-primary z bialym tekstem, czyli 4.2:1 - PONIZEJ progu
               dla 14px. disabled:opacity-70 zamiast 50, bo w tym stanie
               przycisk niesie tresc ("Checking your access..."), a nie sama
               swoja obecnosc. */
            className="px-4 py-2 text-sm font-semibold rounded-pill bg-soft-accent-deep text-white shadow-chip transition-[filter,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
          >
            {accessCheck === 'checking'
              ? 'Checking your access...'
              : phase === 'authorizing'
              ? 'Sign in your wallet...'
              : phase === 'signing'
              ? 'Confirm in wallet...'
              : phase === 'confirming'
              ? 'Waiting for confirmation...'
              : phase === 'recording'
              ? 'Unlocking...'
              : /* Podpis idzie PRZED transakcja, wiec przycisk zapowiada oba
                   kroki. Okno portfela proszace o podpis nie ma prawa byc
                   niespodzianka dla kogos, kto kliknal "zaplac". */
              needsSignIn
              ? `Sign in and unlock for ${priceLabel}`
              : `Unlock for ${priceLabel}`}
          </button>
        )}
      </div>

      {/* Nie wiemy, czy ten post juz nie jest oplacony - i wlasnie dlatego nic
          nie wyslalismy. Rachunek za niepewnosc nie moze isc na uzytkownika. */}
      {accessCheck === 'unreachable' && (
        /* bg-soft-surface, nie bg-soft-sunken: karta jest teraz lawendowa, a
           sunken (#eee9fb) rozni sie od niej o dwa punkty - komunikat po prostu
           przestalby byc widoczny jako osobny blok. Na bieli ink-muted daje 5.5:1. */
        <div role="alert" className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-soft-line bg-soft-surface p-2.5 text-xs text-soft-ink-muted">
          <span>
            We could not check whether you already paid for this post, so we stopped before sending
            anything. Nothing was charged.
          </span>
          <button
            type="button"
            onClick={handleUnlockClick}
            className="shrink-0 rounded-pill px-1 font-semibold text-soft-ink underline transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            Try again
          </button>
        </div>
      )}

      {phase === 'error' && error && (
        <div role="alert" className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-red-400/50 bg-red-500/10 p-2.5 text-xs text-red-700">
          <span>{error}</span>
          <button type="button" onClick={reset} className="shrink-0 rounded-pill px-1 font-semibold underline transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary">
            Try again
          </button>
        </div>
      )}

      {/* Link pokazujemy TAKZE przy bledzie. Jesli hash w ogole istnieje, to
          transakcja zostala wyslana - a wlasnie wtedy, gdy cos poszlo nie tak,
          uzytkownik najbardziej potrzebuje dowodu, co sie z nia stalo. */}
      {txHash && (
        <a
          href={getExplorerTxLink('base', txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block rounded-pill text-xs font-semibold text-soft-primary-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
        >
          View transaction
        </a>
      )}
    </div>
  );
}
