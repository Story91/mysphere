'use client';

import SoftTabs from './SoftTabs';
import SoftNetworkPicker from './SoftNetworkPicker';
import SoftComposerPill from './SoftComposerPill';

/**
 * OPRAWA mobilnego feedu w kierunku Soft Social.
 *
 * === CZEGO TEN KOMPONENT NIE ROBI I DLACZEGO ===
 * NIE renderuje postow. Pierwsza wersja renderowala - i to byla realna
 * regresja, ktora sam wprowadzilem: podmiana kart postow na wlasne zabrala
 * na telefonie tipy, przypinanie, przyciski transakcji per siec, tresc
 * premium, odznaki agentow i muzyke. Zgloszenie brzmialo "zniknelo duzo
 * ikonek w wersji mobilnej" i bylo trafne co do joty.
 *
 * Wniosek, ktory z tego zostaje: wyglad wolno wymieniac tam, gdzie nic za
 * soba nie ciagnie. Tlo, pasek sieci, zakladki i zwiniety kompozytor sa
 * takie: nie maja wlasnej logiki, wiec ich przemalowanie niczego nie moze
 * urwac. Karta posta ma logike szesciu funkcji naraz i przepisanie jej
 * wygladu MUSI isc razem z przeniesieniem tych funkcji, a nie zamiast.
 *
 * Karta posta w tym kierunku zostaje w SoftPostCard i czeka na moment, w
 * ktorym PostList bedzie mial wydzielone prymitywy. Do tego czasu telefon
 * dostaje nowa oprawe i STARE, kompletne karty.
 *
 * === FILTR SIECI ===
 * Startuje na "wszystkie". Gdyby domyslnie wybrany byl Base, feed po wejsciu
 * ukrywalby posty z siedmiu pozostalych lancuchow bez informacji dlaczego.
 * Wybranie aktywnej sieci jeszcze raz ODZNACZA ja - bez tego nie ma drogi
 * powrotnej bez przeladowania strony.
 *
 * === JEDNA LINIA ZAMIAST DWOCH ===
 * Pasek "stories" (kafle sieci 54x54) i rzad zakladek zajmowaly razem dwa
 * pelne rzedy ekranu, zanim pojawil sie pierwszy post - zgloszenie
 * wlasciciela bylo wprost o tym. Ten sam filtr sieci siedzi teraz w
 * kompaktowym przycisku (SoftNetworkPicker) obok zakladek, w jednym rzedzie.
 * Zakladki zachowuja wlasny przewijany overflow, wiec nic nie znika na
 * waskich ekranach.
 */

const TABS = [
  { id: 'forYou', label: 'All Posts' },
  { id: 'following', label: 'Follows' },
  { id: 'baseName', label: 'Basenames' },
];

export default function SoftFeedMobile({
  currentAddress,
  avatarUrl,
  activeFeed,
  onFeedChange,
  onOpenComposer,
  composerOpen = false,
  activeNetwork,
  onNetworkChange,
}: {
  currentAddress?: string;
  avatarUrl?: string | null;
  activeFeed: string;
  onFeedChange: (id: string) => void;
  onOpenComposer: () => void;
  /**
   * Czy pelny kompozytor jest juz rozwiniety. Gdy tak - pigulka znika, bo
   * inaczej napis "What's happening onchain?" stalby na ekranie DWA RAZY:
   * raz jako zaproszenie, raz jako placeholder pola, ktore wlasnie sie
   * otworzylo. Domyslnie `false`, wiec ekrany, ktore tego nie podaja,
   * zachowuja sie jak dotad.
   */
  composerOpen?: boolean;
  /** Podany tylko wtedy, gdy lista postow potrafi juz filtrowac po sieci. */
  activeNetwork?: string | null;
  onNetworkChange?: (id: string | null) => void;
}) {
  // BEZ PORTFELA NIE MA CZEGO FILTROWAC.
  //
  // Ekran powitalny zajmuje na telefonie caly widok - nie ma pod nim feedu,
  // bo zmyslone posty zostaly stamtad usuniete. Mimo to nad bohaterem stal
  // pasek siedmiu sieci i zakladki "All Posts / Follows / Basenames": trzy
  // filtry do treski, ktorej nie widac, i dwa rzedy interfejsu przed pierwszym
  // zdaniem produktu. Pierwsza rzecz na ekranie ma mowic, czym to jest, a nie
  // oferowac sortowanie pustki.
  //
  // Po zalogowaniu wszystko wraca bez zmian.
  if (!currentAddress) return null;

  return (
    <div className="-mx-4 mb-3 bg-soft-bg font-soft">
      {/* Jeden rzad: zakladki feedu + kompaktowy filtr sieci. SoftTabs nosi
          wlasny padding poziomy (px-4) - tu daje go kontener, wiec padding
          zakladek jest zerowany, zeby brzegi sie nie sumowaly. */}
      <div className="flex items-center gap-2 px-4 pb-1.5 pt-2.5">
        <SoftTabs
          tabs={TABS}
          activeTab={activeFeed}
          onSelect={onFeedChange}
          className="min-w-0 flex-1 !px-0 !py-0"
        />
        <SoftNetworkPicker
          activeNetwork={activeNetwork ?? null}
          onChange={(id) => onNetworkChange?.(id)}
        />
      </div>

      {currentAddress && !composerOpen && (
        <div className="px-4 pb-1">
          <SoftComposerPill avatarUrl={avatarUrl} onOpen={onOpenComposer} />
        </div>
      )}
    </div>
  );
}
