'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useAccount, useConnect, type Connector } from 'wagmi';
import { isUserRejection } from '../../utils/auth/useSiweAuth';
import { useSolanaWallet } from '../solana/SolanaWalletHost';
import { SOLANA_ROUTE, evmRowLabel, findEvmTwin, isOnSolanaTab } from '../solana/solanaWalletNav';

/**
 * Wybor portfela. Zastepuje modal z <ConnectWallet> OnchainKit.
 *
 * Czemu wlasny: OnchainKit zostal wygaszony przez Base 19 marca 2026 (npm
 * zamrozony na 1.1.2, docs usuniete, repo bez commitow od stycznia), a jego
 * modal mial wlasny, nieprzezroczysty motyw, ktory i tak nadpisywalismy.
 *
 * Lista portfeli bierze sie WPROST z konektorow zarejestrowanych w wagmi
 * (app/providers.tsx), wiec nie ma tu zadnej osobnej listy do utrzymania -
 * dodanie konektora w configu automatycznie pokazuje go tutaj.
 *
 * RENDEROWANY PRZEZ PORTAL DO document.body - to nie jest ozdobnik.
 * WalletButton siedzi w <header>, ktory jest `sticky z-50`, czyli tworzy
 * WLASNY KONTEKST STACKINGU. Bez portalu `z-[10000]` bylo uwiezione wewnatrz
 * `z-50` headera i modal chowal sie pod nawigacja.
 *
 * Historycznie doszlo do tego drugie zrodlo tego samego problemu: header mial
 * `backdrop-blur-xl`, a `backdrop-filter` tworzy takze BLOK ZAWIERAJACY dla
 * potomkow z `position: fixed` - `fixed inset-0` pozycjonowalo sie wtedy
 * wzgledem headera i modal ladowal na srodku belki zamiast ekranu. Rozmycie
 * zniklo wraz z ciemnym szklem, ale portal zostaje: powod z kontekstem
 * stackingu jest niezalezny i nadal aktualny.
 *
 * DWIE SEKCJE: EVM I SOLANA (od 23.09.2026). Zgloszenie wlasciciela: "Phantom
 * w nawigacji laczy sie z eth zamiast z solana". Phantom i MetaMask oglaszaja
 * sie dwa razy - przez EIP-6963 (Ethereum) i przez Wallet Standard (Solana) -
 * a ta lista znala tylko pierwsze ogloszenie, wiec "Phantom" zawsze znaczyl
 * Ethereum. Teraz wiersze EVM portfeli wielolancuchowych maja dopisek
 * "Ethereum & Base", a osobna sekcja Solany laczy konto Solany, przelacza
 * nawigacje na Solane i przenosi na jej zakladke. Nazwy i ikony portfeli
 * Solany pochodza z lekkiego wykrywania Wallet Standard - modal nie laduje
 * stosu Solany, dopoki ktos go nie wybierze.
 *
 * SEKCJA SOLANY TYLKO TAM, GDZIE MA SENS (prop `solana`). Modal otwieraja tez
 * /join (polecenia), /money i panel zlecen perpsow na Arc. Tam wybor
 * "Phantom (Solana)" przenosil na /basechat?network=solana i zrywal
 * onboarding albo zlecenie, a Solana na tych stronach nic nie znaczy.
 * Domyslnie 'off', wiec kazdy stary i przyszly wywolujacy zostaje przy EVM;
 * sekcje wlaczaja jawnie nawigacja (WalletButton) i feed przed logowaniem
 * (MockFeed).
 */

/**
 * Etykiety i podpowiedzi per id konektora.
 *
 * Konektory wykryte przez EIP-6963 (Rabby, Phantom, Brave, OKX, Zerion...)
 * NIE MAJA tu wpisow i miec nie musza: wagmi zna ich nazwe i ikone, bo portfel
 * sam je oglasza. Lista bierze sie wprost z konektorow w configu, wiec nie ma
 * osobnego rejestru do utrzymania.
 */
const CONNECTOR_META: Record<string, { label: string; hint?: string; icon: string }> = {
  baseAccount: { label: 'Base Account', hint: 'Smart wallet, no extension needed', icon: '🔵' },
  coinbaseWallet: { label: 'Coinbase Wallet', hint: 'Extension or mobile app', icon: '🔷' },
  farcaster: { label: 'Farcaster', hint: 'Inside the Farcaster app', icon: '🟣' },
  injected: { label: 'Browser wallet', hint: 'Whatever your browser has', icon: '🧩' },
  metaMask: { label: 'MetaMask', icon: '🦊' },
  gemini: { label: 'Gemini', icon: '♊' },
  walletConnect: { label: 'WalletConnect', hint: 'Scan with your phone', icon: '🔗' },
  safe: { label: 'Safe', hint: 'Multisig', icon: '🔐' },
};

export default function ConnectModal({
  isOpen,
  onClose,
  solana: solanaSection = 'off',
}: {
  isOpen: boolean;
  onClose: () => void;
  /** 'navigate': sekcja Solany, a wybor przenosi na zakladke Solany. 'off': tylko EVM. */
  solana?: 'navigate' | 'off';
}) {
  const { connectors, connect, connectAsync, status, error, variables } = useConnect();
  const { isConnected: isEvmConnected } = useAccount();
  const solana = useSolanaWallet();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  /**
   * onClose przychodzi z gory jako inline `() => setIsModalOpen(false)`, czyli
   * ma NOWA TOZSAMOSC przy kazdym renderze rodzica. Trzymany wprost w
   * zaleznosciach efektu ponizej powodowal, ze pulapka fokusu rozbierala sie
   * i skladala od nowa przy kazdym renderze WalletButton/MockFeed - a dzieje
   * sie to w trakcie laczenia (useAccount przechodzi przez 'connecting',
   * dochodzi saldo z useBalance). Skutek: sprzatanie efektu oddawalo fokus
   * przyciskowi POD modalem, a nowy przebieg wrzucal go z powrotem na "Close".
   * Uzytkownik klawiatury tracil miejsce w liscie portfeli w polowie laczenia.
   * Ref odcina tozsamosc funkcji od cyklu zycia efektu.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Portal montujemy dopiero po stronie klienta - document nie istnieje na serwerze.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * Escape zamyka, blokada scrolla zapobiega przewijaniu tla, a Tab krazy
   * WEWNATRZ modalu.
   *
   * Pulapka fokusu nie jest ozdobnikiem: `aria-modal="true"` oglasza czytnikowi
   * ekranu, ze reszta strony jest niedostepna, wiec jesli Tab i tak z modalu
   * wychodzi, uzytkownik klawiatury laduje w tresci, o ktorej mu wlasnie
   * powiedziano, ze jej nie ma. Do tego bez tego kodu fokus po otwarciu zostawal
   * na przycisku pod spodem, a po zamknieciu - na elemencie, ktorego juz nie ma.
   */
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]), a[href], input, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Fokus wypada poza modal takze bez Taba: gdy trwa laczenie, wszystkie
      // wiersze robia sie `disabled` i przegladarka odklada fokus na <body>.
      // Wtedy nastepny Tab poszedlby w tresc pod modalem.
      if (!dialogRef.current?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Fokus do srodka (pierwszy jest przycisk zamkniecia), zeby klawiatura
    // zaczela od modalu, a nie od tresci pod nim.
    focusable()[0]?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, mounted]);

  if (!isOpen || !mounted) return null;

  /**
   * Ogolny wpis "Browser wallet" chowamy, gdy przegladarka oglosila konkretne
   * portfele przez EIP-6963. Inaczej lista pokazuje jednoczesnie "Browser
   * wallet" i np. "Rabby", ktore w praktyce sa tym samym - a uzytkownik nie ma
   * jak zgadnac, ktory wybrac.
   */
  const hasDiscovered = connectors.some(
    (connector) => connector.id !== 'injected' && connector.type === 'injected'
  );
  const visibleConnectors = hasDiscovered
    ? connectors.filter((connector) => connector.id !== 'injected')
    : connectors;

  // `variables.connector` bywa fabryka konektora, a nie instancja - uid ma
  // tylko instancja, wiec pytamy o nie ostroznie.
  const pendingConnector = variables?.connector;
  const pendingConnectorUid =
    pendingConnector && typeof pendingConnector === 'object' && 'uid' in pendingConnector
      ? (pendingConnector as Connector).uid
      : undefined;

  const handleConnect = (connector: Connector) => {
    // Wywolanie MUSI zostac w handlerze klikniecia - popup keys.coinbase.com
    // jest blokowany, jesli otwiera sie po asynchronicznej przerwie.
    connect(
      { connector },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  const showSolana = solanaSection === 'navigate' && solana.available;
  const solanaNames = showSolana ? solana.discoveredWallets.map((wallet) => wallet.name) : [];
  // Kto jest juz w trybie Solany albo na jej zakladce, przyszedl po Solane -
  // dostaje jej sekcje NA GORZE. Inaczej przy kilku rozszerzeniach "Phantom
  // (Solana)" lezal pod krawedzia przewijanej listy, a pierwszym "Phantom" na
  // ekranie byl znowu wiersz Ethereum - dokladnie ten blad ze zgloszenia.
  // Modal renderuje sie tylko po stronie klienta (`mounted`), wiec odczyt
  // window.location nie grozi rozjazdem hydracji.
  const solanaFirst =
    showSolana && (solana.mode === 'solana' || isOnSolanaTab(window.location.pathname, window.location.search));

  /**
   * Wybor portfela w sekcji Solany.
   *
   * Konto Solany sluzy tylko do podpisu kwitu - profil, sesja SIWE i autor
   * posta stoja na adresie EVM. Dlatego, gdy strona EVM nie jest jeszcze
   * podlaczona, a ten sam portfel ma konektor wagmi (Phantom, MetaMask),
   * laczymy ja tez. Kolejnosc: najpierw EVM - jego wywolanie musi zostac w
   * tym samym kliknieciu (portfele z popupem blokuja okna otwarte po
   * przerwie), potem Solana, zeby portfel nie dostal dwoch prosb naraz.
   * Rozszerzenia Solany nie potrzebuja gestu, wiec moga poczekac.
   */
  const handleSolanaPick = (walletName: string | null) => {
    const twin = !isEvmConnected && walletName ? findEvmTwin(visibleConnectors, walletName) : null;
    const connectSolana = () => (walletName ? solana.connectWallet(walletName) : solana.openPicker());

    solana.setMode('solana');
    // Stos Solany zaczyna sie ladowac juz teraz, rownolegle z prosba EVM.
    solana.ensureLoaded();
    router.push(SOLANA_ROUTE);
    onClose();

    if (!twin) {
      connectSolana();
      return;
    }
    // connectAsync, a nie connect z callbackiem: modal zaraz sie zamyka, a
    // callbacki przekazane do mutate() nie odpalaja po odmontowaniu
    // komponentu (react-query). Obietnica rozwiazuje sie zawsze.
    connectAsync({ connector: twin })
      .catch((connectError: unknown) => {
        if (isUserRejection(connectError)) {
          // Obietnica "zapytamy pozniej" jest prawdziwa: przycisk posta na
          // Solanie bez adresu EVM sam laczy strone EVM tego samego portfela.
          toast(`${twin.name}: Ethereum side not connected. Your posts are saved under it, so posting on Solana will ask for it again.`);
        } else {
          const message = connectError instanceof Error ? connectError.message : String(connectError);
          toast.error(`Could not connect ${twin.name} (Ethereum): ${message.slice(0, 120)}`);
        }
      })
      .finally(connectSolana);
  };

  // Sekcja Solany jako zmienna: stoi pod lista EVM albo nad nia (solanaFirst).
  const solanaBlock = showSolana ? (
    <section
      aria-labelledby="connect-modal-solana"
      className={solanaFirst ? 'mb-1 border-b border-soft-line pb-1' : 'mt-1 border-t border-soft-line pt-1'}
    >
      <h3
        id="connect-modal-solana"
        className="px-5 pb-1 pt-3 font-soft-display text-[11px] font-bold uppercase tracking-wide text-soft-ink-faint"
      >
        Solana
      </h3>
      {!isEvmConnected && (
        <p className="px-5 pb-2 font-soft text-[11px] leading-snug text-soft-ink-soft">
          Your profile lives on the wallet&apos;s Ethereum address, so it may ask twice: once for Ethereum, once for Solana.
        </p>
      )}
      {solana.discoveredWallets.length > 0 ? (
        solana.discoveredWallets.map((wallet) => {
          const isLinked = solana.connected && solana.walletName === wallet.name;
          const hasTwin = !isEvmConnected && !!findEvmTwin(visibleConnectors, wallet.name);
          return (
            <button
              key={`solana-${wallet.name}`}
              type="button"
              disabled={status === 'pending'}
              onClick={() => handleSolanaPick(wallet.name)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-inset"
            >
              {wallet.icon ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URI od portfela
                <img src={wallet.icon} alt="" className="h-5 w-5 shrink-0 rounded" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- znak Solany z public/
                <img src="/solana.svg" alt="" className="h-5 w-5 shrink-0 rounded" />
              )}
              <span className="flex-1">
                <span className="block font-soft-display text-[13px] font-bold text-soft-ink">
                  {wallet.name} · Solana
                </span>
                <span className="block font-soft text-[11px] text-soft-ink-soft">
                  {isLinked
                    ? 'Connected'
                    : hasTwin
                      ? 'Solana account + Ethereum profile'
                      : 'Solana account'}
                </span>
              </span>
            </button>
          );
        })
      ) : (
        // Nic nie oglosilo sie przez Wallet Standard (np. telefon bez
        // rozszerzen). Wiersz i tak prowadzi dalej: wybor portfela
        // wallet-adaptera zna jeszcze Mobile Wallet Adapter, a gdy nie
        // ma zupelnie niczego, uzytkownik dostaje komunikat, co
        // zainstalowac - nie martwy przycisk.
        <button
          type="button"
          disabled={status === 'pending'}
          onClick={() => handleSolanaPick(null)}
          className="flex w-full items-center gap-3 px-5 py-3 text-left transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-inset"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- znak Solany z public/ */}
          <img src="/solana.svg" alt="" className="h-5 w-5 shrink-0 rounded" />
          <span className="flex-1">
            <span className="block font-soft-display text-[13px] font-bold text-soft-ink">Solana wallet</span>
            <span className="block font-soft text-[11px] text-soft-ink-soft">
              Phantom, MetaMask, Solflare, Backpack
            </span>
          </span>
        </button>
      )}
    </section>
  ) : null;

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a wallet"
    >
      {/* Tlo zamyka przez klikniecie, ale jest poza kolejnoscia Taba i poza
          drzewem dostepnosci: dla klawiatury i czytnika ekranu ta sama akcja
          jest juz w przycisku "Close" i pod Escape, a pelnoekranowy przycisk
          "Close" jako pierwszy przystanek Taba byl tylko przeszkoda. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 bg-soft-ink/45 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={onClose}
      />

      {/* Modal skaluje sie OD SRODKA - w odroznieniu od popoverow, ktore
          wychodza od swojego przycisku. Ten nie ma zadnego zaczepienia na
          ekranie, wiec srodek jest jedynym uczciwym punktem startu. */}
      <div className="relative w-full max-w-[360px] overflow-hidden rounded-card border border-soft-line bg-soft-surface shadow-float animate-in fade-in-0 zoom-in-95 duration-200 ease-out-strong">
        <div className="flex items-center justify-between border-b border-soft-line px-5 py-4">
          <h2 className="font-soft-display text-[15px] font-bold text-soft-ink">
            Connect a wallet
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill p-1.5 text-soft-ink-faint transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken hover:text-soft-ink active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            aria-label="Close"
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {solanaFirst && solanaBlock}
          {showSolana && (
            <h3 className="px-5 pb-1 pt-3 font-soft-display text-[11px] font-bold uppercase tracking-wide text-soft-ink-faint">
              Ethereum &amp; Base
            </h3>
          )}
          {visibleConnectors.map((connector) => {
            const meta = CONNECTOR_META[connector.id];
            const isPending = status === 'pending';
            // Ktory portfel czeka na odpowiedz. Bez tego caly modal tylko
            // gasl i nic nie mowilo, ze cokolwiek sie dzieje - a niektore
            // portfele otwieraja swoje okno z paroma sekundami opoznienia.
            const isConnecting = isPending && pendingConnectorUid === connector.uid;
            // Portfele wykryte przez EIP-6963 podaja wlasna ikone jako data URI.
            // Uzywamy jej, zamiast rysowac wszystkim ten sam emoji-zastepnik.
            const iconUrl = connector.icon;

            return (
              <button
                key={connector.uid}
                type="button"
                disabled={isPending}
                aria-busy={isConnecting}
                onClick={() => handleConnect(connector)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-inset"
              >
                {iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI
                  // od portfela; next/image wymagalby whitelisty hostow.
                  <img src={iconUrl} alt="" className="h-5 w-5 shrink-0 rounded" />
                ) : (
                  <span className="w-5 shrink-0 text-center text-lg" aria-hidden="true">
                    {meta?.icon ?? '👛'}
                  </span>
                )}
                <span className="flex-1">
                  <span className="block font-soft-display text-[13px] font-bold text-soft-ink">
                    {/* Dopisek sieci tylko przy portfelach, ktore maja tez konto
                        Solany - inaczej "Phantom" tu i "Phantom" w sekcji Solany
                        wygladaja identycznie. */}
                    {evmRowLabel(meta?.label ?? connector.name, solanaNames)}
                  </span>
                  {isConnecting ? (
                    <span className="block font-soft text-[11px] text-soft-ink-soft">Check your wallet…</span>
                  ) : (
                    meta?.hint && (
                      <span className="block font-soft text-[11px] text-soft-ink-soft">{meta.hint}</span>
                    )
                  )}
                </span>
              </button>
            );
          })}

          {!solanaFirst && solanaBlock}
        </div>

        {/* Odmowa w portfelu NIE jest bledem. Zamkniecie okna portfela albo
            klikniecie "Cancel" konczy mutacje `connect` bledem
            UserRejectedRequestError, a ten blok wypisywal go tak samo jak awarie
            - czerwonym paskiem "User rejected the request." Uzytkownik dostawal
            komunikat o bledzie za to, ze zrobil dokladnie to, co chcial zrobic.
            Lista portfeli zostaje otwarta i aktywna, wiec moze po prostu wybrac
            inny albo zamknac modal. */}
        {error && !isUserRejection(error) && (
          <p role="alert" className="border-t border-soft-line bg-soft-accent-soft px-5 py-3 font-soft text-[12px] font-semibold text-soft-accent-deep">
            {error.message.slice(0, 140)}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
