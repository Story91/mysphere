/**
 * Karta udostepniania strony glownej - jedno zrodlo rysunku dla trzech tras:
 * app/opengraph-image.tsx (1200x630), app/twitter-image.tsx (1200x630)
 * i app/miniapp-image/route.tsx (1200x800, proporcja 3:2 wymagana przez
 * fc:miniapp). Jeden plik, zeby te trzy obrazki nie mogly sie rozjechac.
 *
 * === CO TA KARTA POKAZUJE I DLACZEGO AKURAT TO ===
 * Bohaterem nie jest kwota $0.00, tylko ZWROT miedzy dwoma zdaniami - i ten
 * zwrot jest widoczny, zanim ktokolwiek zacznie czytac: pierwsza linijka jest
 * wyblakla (#6B6486), druga stoi pelnym atramentem (#2E2A44). Oba zdania maja
 * IDENTYCZNY stopien i IDENTYCZNA grubosc; rozni je wylacznie wartosc tonalna.
 * Jedna zmienna na raz - gdyby doszla druga (inny kegiel, inna grubosc,
 * kolorowe slowo), kontrast przestalby czytac sie w ulamku sekundy, a caly
 * sens tej karty polega na tym, ze argument dociera przed slowami.
 *
 * === DLACZEGO $0.00 NIE JEST BOHATEREM ===
 * Pomarancz jest w tym systemie zarezerwowany dla PIENIEDZY, a $0.00 jest ich
 * brakiem. Gigantyczne $0.00 w kolorze pieniedzy zaprzeczaloby wlasnej regule
 * i w podgladzie czytaloby sie jak pusty stan aplikacji. Zostaje wiec w zdaniu,
 * gdzie i tak samo sie wybija - jest jedynym numeralem w polu liter.
 *
 * === UWAGA NA PRZYSZLOSC: $0.00 TO NIE JEST STATYSTYKA ===
 * Produkt zakazuje wymyslonych liczb i ta karta tego zakazu nie lamie. $0.00
 * nie jest danymi o MySphere - jest cena lajka, ktora wszedzie wynosi zero.
 * NIE zamieniac tego na "prawdziwa liczbe" z bazy: zdanie przestanie byc
 * twierdzeniem o kategorii, a stanie sie raportem o jednym koncie.
 *
 * === SKAD SIE WZIAL TEKST ===
 * Oba zdania i stopka sa przepisane z ekranu powitalnego
 * (app/basechat/soft/SoftSignInHero.tsx, wiersze 166-176), a ten cytuje
 * manifest z /re-definition. Dzieki temu podglad linku obiecuje dokladnie te
 * zdania, ktore czlowiek zobaczy po kliknieciu - nie ma przeskoku miedzy
 * zajawka a produktem. Gdy zmieni sie manifest, ma sie zmienic i to.
 *
 * === DLACZEGO JASNA PALETA, SKORO POZOSTALE CZTERY KARTY SA GRANATOWE ===
 * Decyzja swiadoma, nie przeoczenie. Ta karta prowadzi na ekran powitalny,
 * ktory JEST lawendowo-fioletowy z pomaranczowa moneta; granatowa zajawka
 * przed jasnym produktem to pekniecie na pierwszym kliknieciu. Drugi powod:
 * osie czasu X i Base App sa zdominowane przez tryb ciemny, wiec jasna plama
 * jest jedyna jasna rzecza w kolumnie. Gramatyka ukladu zostaje ta sama co
 * w /leaderboard, /tip, /post i /u (padding 72, trzy pasma, space-between,
 * rozstrzelona nadlinia, cicha stopka), wiec to ta sama rodzina w innej
 * tonacji. KOSZT, ktory trzeba znac: dopoki tamte cztery sa granatowe, piec
 * kart wrzuconych obok siebie w jeden watek wyglada jak dwa produkty.
 * Mapowanie do migracji jest mechaniczne:
 *   #0A1024 -> #F1EDFA, #EEF3FF -> #2E2A44, #5C6F94 -> #6B6486,
 *   #00E28A -> #F5A73B (kwoty male) / #C2410C (kwoty duze, kontrast na jasnym).
 */

/** Tokeny kierunku Soft Social, przepisane z app/globals.css (:root). */
const SOFT = {
  bg: '#F1EDFA', // --soft-bg
  ink: '#2E2A44', // --soft-ink, kontrast na tle 12:1
  inkMuted: '#6B6486', // --soft-ink-muted, kontrast 4.8:1
  primary: '#7C6BDA', // --soft-primary
  accent: '#F5A73B', // --soft-accent
} as const;

export const HERO_LINE_ONE = 'A like is worth $0.00.';
export const HERO_LINE_TWO = 'A payment is not.';

/** Stopka: zdanie z ekranu powitalnego + format "· mysphere.fun" z /tip i /leaderboard. */
const FOOTER_LINE = 'Every tip settles onchain with a hash anyone can open · mysphere.fun';

/**
 * DLACZEGO 80 px, A NIE 84 CZY 96.
 *
 * Miara kolumny tekstu to 1024 px. Dluzsze zdanie ma 22 znaki i przy kroju,
 * ktorym ta karta realnie renderuje (Noto Sans wbudowany w @vercel/og - patrz
 * nizej), zajmuje przy 80 px okolo 930 px, czyli ~91% miary. Przy 88 px
 * wychodzi poza kolumne. Zapas jest celowy: obrazka nie da sie podejrzec na
 * Windowsie, wiec kegiel nie moze stac dokladnie na krawedzi lamania.
 * `whiteSpace: nowrap` jest polisa na wypadek pomylki w tym szacunku - wolimy
 * zobaczyc zdanie wychodzace poza kadr (widac natychmiast) niz zlamane na
 * dwie linijki (wyglada prawie poprawnie i nikt tego nie zglosi).
 */
const HERO_SIZE = 80;
const HERO_LINE_HEIGHT = 1.14;
/** Wysokosc bloku dwoch linijek - krecoslup ma byc dokladnie tak wysoki. */
const HERO_BLOCK_HEIGHT = Math.round(HERO_SIZE * HERO_LINE_HEIGHT * 2);

/** Padding kadru - taki sam jak we wszystkich czterech istniejacych kartach. */
const PADDING = 72;
/** Krecoslup wisi POZA kolumna tekstu, dokladnie jak `-ml-[26px]` na /re-definition. */
const SPINE_WIDTH = 4;
const SPINE_GAP = 28;
/** Lewa krawedz kolumny tekstu: 72 + 4 + 28 = 104. */
const TEXT_INDENT = SPINE_WIDTH + SPINE_GAP;
const TEXT_WIDTH = 1200 - PADDING * 2 - TEXT_INDENT;

/**
 * KROJE - CZEGO TU NIE MA I DLACZEGO.
 *
 * Karta renderuje w `sans-serif`, czyli w Noto Sans wbudowanym w @vercel/og -
 * tak samo jak cztery istniejace karty. Baloo 2 i Nunito, ktore sa prawdziwym
 * glosem produktu, wymagalyby wgrania pliku TTF do bufora ImageResponse.
 * Odrzucone swiadomie: pliku nie ma w repo, a kazda droga jego wczytania na
 * Vercelu (fs z public/, ktore nie trafia do bundle'a funkcji; fetch po sieci
 * przy kazdym zimnym starcie; `new URL(..., import.meta.url)`, ktore wywala
 * `fileURLToPath` na Windowsie) dodaje tryb awarii do jedynej karty, ktorej
 * NIE da sie tu obejrzec przed wdrozeniem. Argument tej karty jest tonalny,
 * nie typograficzny - blade kontra ciemne czyta sie w kazdym kroju. Glos
 * marki to realna strata i osobne zadanie: wgrac subset Baloo 2 + Nunito
 * (tekst jest staly, wiec zbior glifow jest zamkniety, ~35 znakow) i podac go
 * przez `fonts` w ImageResponse - dla wszystkich pieciu kart naraz.
 */
export function HomeShareCard() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: SOFT.bg,
        padding: `${PADDING}px`,
        fontFamily: 'sans-serif',
      }}
    >
      {/* PASMO 1 - nadlinia. Zaden logotyp jako obrazek: pobranie pliku to
          zaleznosc, ktora moze paść, a karta ma dzialac zawsze. */}
      <div
        style={{
          display: 'flex',
          marginLeft: TEXT_INDENT,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 5,
          color: SOFT.inkMuted,
        }}
      >
        MYSPHERE
      </div>

      {/* PASMO 2 - bohater. */}
      <div style={{ display: 'flex', gap: SPINE_GAP }}>
        {/* Krecoslup. Zywcem z globals.css (.spine-fill, wiersz 565):
            linear-gradient(to bottom, soft-primary, soft-accent). Nie jest
            ozdobnikiem wymyslonym na karte - koduje ten sam zwrot drugi raz,
            od fioletu interakcji do pomaranczu pieniedzy. To jedyny akcent
            na calej karcie i jedyne miejsce, gdzie wystepuje pomarancz: na
            dolnym koncu, przy zdaniu o platnosci. NIE USUWAC "dla czystosci" -
            bez niego zostaje ladna grafika cytatowa bez zadnego produktu. */}
        <div
          style={{
            display: 'flex',
            width: SPINE_WIDTH,
            height: HERO_BLOCK_HEIGHT,
            borderRadius: 2,
            backgroundImage: `linear-gradient(to bottom, ${SOFT.primary}, ${SOFT.accent})`,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', width: TEXT_WIDTH }}>
          <div
            style={{
              display: 'flex',
              fontSize: HERO_SIZE,
              lineHeight: HERO_LINE_HEIGHT,
              fontWeight: 700,
              letterSpacing: -1.6,
              color: SOFT.inkMuted,
              whiteSpace: 'nowrap',
            }}
          >
            {HERO_LINE_ONE}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: HERO_SIZE,
              lineHeight: HERO_LINE_HEIGHT,
              fontWeight: 700,
              letterSpacing: -1.6,
              color: SOFT.ink,
              whiteSpace: 'nowrap',
            }}
          >
            {HERO_LINE_TWO}
          </div>
        </div>
      </div>

      {/* PASMO 3 - stopka. Zero liczb, zero obietnicy escrow i Askow w feedzie,
          zero liczby sieci: wszystko, czego karta nie moze dotrzymac, jest
          nieobecne, a nie zlagodzone. */}
      <div
        style={{
          display: 'flex',
          marginLeft: TEXT_INDENT,
          fontSize: 24,
          fontWeight: 600,
          color: SOFT.inkMuted,
        }}
      >
        {FOOTER_LINE}
      </div>
    </div>
  );
}

/**
 * Naglowki cache dla wszystkich trzech tras.
 *
 * Zawartosc karty jest w 100% stala - nie czyta ani jednej liczby z bazy -
 * wiec CDN moze ja trzymac tygodniami. Dla porownania /leaderboard ma godzine,
 * bo tam kazdy tip zmienia obrazek. Tu odswiezenie jest potrzebne dopiero
 * wtedy, gdy zmieni sie tekst manifestu, czyli przy wdrozeniu.
 */
export const OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=604800',
};
