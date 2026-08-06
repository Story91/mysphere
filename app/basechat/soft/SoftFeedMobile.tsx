'use client';

import SoftStoryRail from './SoftStoryRail';
import SoftTabs from './SoftTabs';
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
 * Dotkniecie aktywnej sieci ODZNACZA ja - bez tego nie ma drogi powrotnej
 * bez przeladowania strony.
 *
 * Filtrowanie po sieci jest na razie WYLACZONE (pasek tylko sygnalizuje
 * dostepne lancuchy), bo lista postow nalezy do PostList i to on musialby
 * przyjac ten filtr. Wlaczenie go to jeden prop - ale dopiero wtedy, gdy
 * PostList go obsluzy, a nie "prawie".
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
  activeNetwork,
  onNetworkChange,
}: {
  currentAddress?: string;
  avatarUrl?: string | null;
  activeFeed: string;
  onFeedChange: (id: string) => void;
  onOpenComposer: () => void;
  /** Podany tylko wtedy, gdy lista postow potrafi juz filtrowac po sieci. */
  activeNetwork?: string | null;
  onNetworkChange?: (id: string | null) => void;
}) {
  return (
    <div className="-mx-4 mb-3 bg-soft-bg font-soft">
      <SoftStoryRail
        activeNetwork={activeNetwork ?? ''}
        onSelect={(id) => onNetworkChange?.(activeNetwork === id ? null : id)}
      />

      <SoftTabs tabs={TABS} activeTab={activeFeed} onSelect={onFeedChange} />

      {currentAddress && (
        <div className="px-4 pb-1">
          <SoftComposerPill avatarUrl={avatarUrl} onOpen={onOpenComposer} />
        </div>
      )}
    </div>
  );
}
