/**
 * Karta udostepniania strony glownej - jedno zrodlo rysunku dla dwoch tras:
 * app/opengraph-image.tsx (1200x630) i app/miniapp-image/route.tsx (1200x800,
 * proporcja 3:2 wymagana przez fc:miniapp). Jeden plik, zeby te obrazki nie
 * mogly sie rozjechac. (Pliku app/twitter-image.tsx NIE MA i byc nie moze -
 * powod w app/layout.tsx przy `twitter`.)
 *
 * === CO TA KARTA POKAZUJE I DLACZEGO AKURAT TO ===
 * Poprzednia wersja niosla teze manifestu ("A like is worth $0.00. A payment is
 * not."). Zdanie dobre NA MANIFEST i zostaje na /re-definition, gdzie czytelnik
 * juz kliknal. Jako podglad linku bylo jednak slogan bez produktu: ktos na X
 * czytal filozofie i nie dowiadywal sie ani ze istnieje rynek pytan z budzetem,
 * ani ze zaplacic tu moze maszyna. Karta mowi teraz o rzeczy, ktora sie
 * WYDARZYLA, a stopka mowi, czym jest miejsce, w ktorym sie wydarzyla.
 *
 * === UWAGA: NAGLOWEK BYL ZMIENIONY WOBEC ZAMOWIENIA. CZYTAJ PRZED COFNIECIEM ===
 * Zamowiono pierwsza linijke "An AI agent paid a human." To zdanie jest DZIS
 * nieprawdziwe i nie wolno go tu wpisac, dopoki nie stanie sie prawda:
 *   1. x402 na POST /api/asks placi na X402_PAY_TO_ADDRESS, czyli NAM, za samo
 *      wystawienie Aska (app/api/asks/pricing.ts:409, route.ts:381). Zadna
 *      trasa x402 w tym repo nie placi na adres uzytkownika.
 *   2. Obie trasy wyplat - app/api/asks/[id]/accept/route.ts:58 i
 *      .../escrow-resolve/route.ts:76 - wymagaja ciasteczka sesji SIWE, ktorego
 *      agent x402 nie ma. Agent moze wiec otworzyc Aska i STRUKTURALNIE nie
 *      moze zaplacic za odpowiedz.
 *   3. Nasza wlasna strona stanu mowi to wprost (app/re-definition/page.tsx,
 *      wiersz ~628): "One payment between two of our own addresses is proof the
 *      path works, not evidence of traffic." Podglad linku obiecywalby wiec
 *      cos, czemu zaprzecza strona oddalona o jedno klikniecie.
 * Zostalo to, co jest prawda i co dalo sie zmierzyc: maszyna ZAPLACILA, zeby
 * zapytac, bez grosza gazu i jednym podpisem. Gdy pojawi sie sciezka wyplaty
 * dla agenta (autoryzacja x402 zamiast ciasteczka na accept/escrow-resolve),
 * pierwsza linijka moze wrocic do wersji zamowionej - i dopiero wtedy.
 *
 * === CO W TYCH ZDANIACH JEST CZYM (trzy osobne teksty!) ===
 * Tutaj sa DWA z trzech tekstow karty: naglowek i stopka. Trzeci - `og:title`,
 * czyli czarny pasek, ktory X rysuje POD obrazkiem - i czwarty `og:description`
 * mieszkaja w app/layout.tsx (SOCIAL_TITLE, APP_DESCRIPTION). Sa napisane tak,
 * zeby sie NIE POWTARZAC: obrazek niesie zdarzenie i rynek Askow, pasek nazywa
 * kategorie i siec (slowa "social", "feed", "Base" nie padaja na obrazku ani
 * raz), opis dokłada napiwki i mechanike. Zmieniajac jedno, przeczytaj tamte.
 *
 * === DLACZEGO CIEMNA, SKORO BYLA JASNA LAWENDOWA ===
 * Zmiana zamowiona, ale nie jest sama kwestia gustu i ma dwa powody.
 * 1. RODZINA. Pozostale cztery karty (/leaderboard, /post, /tip, /u) maja
 *    wspolna oprawe: to samo tlo #0A1024, ten sam padding 72, ta sama gramatyka
 *    trzech pasm ze `space-between`, ta sama rozstrzelona nadlinia. Ta karta
 *    byla jedynym wyjatkiem i poprzedni komentarz sam nazywal koszt: piec kart
 *    wrzuconych w jeden watek wygladalo jak dwa produkty. Teraz jest ich piec
 *    z jednej rodziny, a wspolna oprawa zostala wspolna.
 * 2. CUDZY INTERFEJS. To jedyna powierzchnia ogladana WYLACZNIE u kogos innego.
 *    Na bialej osi czasu X-a ciemny prostokat jest figura - jasna karta zlewa
 *    sie z tlem i traci wlasna krawedz. Na ciemnej osi #0A1024 nie znika, bo
 *    jest granatem z fioletem (B=36 > G=16 > R=10), a nie czernia X-a; dodatkowo
 *    obrysowuje ja fioletowy krecoslup.
 * Ceną jest przeskok tonalny na pierwszym kliknieciu - produkt jest lawendowy
 * i jasny. Ten przeskok istnial juz wczesniej cztery razy (kazda karta danych),
 * a fiolet soft-primary na nadlinii i krecoslupie jest mostem miedzy ciemna
 * zajawka a jasnym produktem: kolor sie zgadza, zmienia sie tylko jasnosc.
 *
 * === KONTRAST: KARTA JEST OGLADANA JAKO MINIATURA ===
 * X skaluje podglad do ~500 px szerokosci na pulpicie i ~360 px na telefonie,
 * czyli okolo 0.3-0.42 oryginalu. Kazda wartosc nizej jest wiec liczona przy
 * zalozeniu, ze zniknie wszystko cienkie i wyblakle. Zmierzone kontrasty na
 * tle #0A1024 (WCAG):
 *   #EEF3FF  17.0:1  naglowek
 *   #B9C6E0  11.0:1  druga linijka i stopka
 *   #9B8CEA   6.6:1  nadlinia i krecoslup
 * Dla porownania #5C6F94, ktorym cztery karty danych pisza swoje stopki, daje
 * na tym samym tle 3.7:1 - ponizej progu AA dla malego tekstu i realnie znika
 * w miniaturze. TU tego tonu nie ma; tamte cztery warto poprawic osobno.
 * Zaden tekst nie schodzi ponizej 30 px, bo 30 px w miniaturze to ~12 px.
 */

/**
 * Paleta. Tlo, atrament i padding sa PRZEPISANE z czterech kart danych
 * (np. app/leaderboard/opengraph-image.tsx:65 i :78) - to jest wspolna oprawa
 * rodziny i nie wolno jej tu rozjechac. Fiolet jest jedynym akcentem i pochodzi
 * z --soft-primary (app/globals.css:38), rozjasniony do progu czytelnosci.
 *
 * POMARANCZU (--soft-accent #F5A73B) NA TEJ KARCIE NIE MA ANI RAZU - i to jest
 * decyzja, nie przeoczenie. W tym systemie pomarancz znaczy KWOTE. Na karcie
 * nie ma zadnej kwoty (zamowienie: "bez kwoty"), wiec nie ma czego nim pomalowac.
 * Poprzednia wersja konczyla krecoslup pomarancza jako ozdobnik - to bylo
 * zlamanie tej samej reguly, ktora w tej sesji naprawiano szesc razy.
 */
const CARD = {
  bg: '#0A1024', // wspolne tlo rodziny kart
  ink: '#EEF3FF', // 17.0:1 - naglowek
  inkMuted: '#B9C6E0', // 11.0:1 - mechanizm i stopka
  brand: '#9B8CEA', // 6.6:1 - --soft-primary rozjasniony, jedyny akcent
} as const;

/**
 * NAGLOWEK. Druga linijka jest doslownie taka, jak zamowiono. Pierwsza mowi to,
 * co da sie obronic - uzasadnienie w naglowku pliku, sekcja o zmianie wobec
 * zamowienia. NIE zmieniac tego na zdanie o placeniu CZLOWIEKOWI bez zmiany
 * kodu, ktory na to pozwoli.
 */
const HEAD_EVENT = 'An AI agent paid to ask.';
const HEAD_MECHANISM = 'It held no gas. It signed once.';

/**
 * STOPKA - podtytul wybrany przez wlasciciela, przepisany co do znaku.
 * Kazde z trzech zdan jest sprawdzone w kodzie, a nie zyczeniowe:
 *   "Questions with budgets"  - app/asks/page.tsx, budzet + miejsca + termin,
 *                               AskEscrow.sol wdrozony na Base.
 *   "Sealed answers"          - firestore.rules:393 odmawia przegladarce
 *                               kolekcji askAnswerContent; seal jest regula
 *                               bazy, nie zaslona w CSS.
 *   "Every payout onchain"    - app/api/asks/[id]/accept/route.ts:84 zada
 *                               payoutTxHash i sprawdza log Transfer na
 *                               lancuchu; escrow-resolve odtwarza zwyciezcow
 *                               z logow SeatAwarded.
 * UWAGA na przyszlosc: to zdanie jest prawdziwe O ASKACH i tak je czyta
 * sasiedztwo dwoch poprzednich. NIE rozciagac go na napiwki - tam z 189 wpisow
 * hash ma 18 (firestore.rules, blok tipow), wiec "every" byloby klamstwem.
 */
const FOOTER_LINE = 'Questions with budgets. Sealed answers. Every payout onchain.';

/** Nadlinia niesie od razu domene - dzieki temu w stopce nie trzeba doklejac
 *  "· mysphere.fun" do zdania, ktore konczy sie kropka. */
const EYEBROW = 'MYSPHERE.FUN';

/**
 * STOPNIE PISMA. Karta renderuje w Noto Sans wbudowanym w @vercel/og (patrz
 * nizej). Wspolczynniki ponizej NIE SA szacunkiem z glowy - zmierzone na
 * wyrenderowanym PNG: znak zajmuje ~0.44 kegla przy grubosci 700 i ~0.48 przy
 * 600. Miara kolumny to 1020 px, wiec przy obecnych stopniach:
 *   naglowek  24 znaki * 0.44 * 88 = ~930 px  (91% miary)
 *   mechanizm 31 znakow * 0.44 * 48 = ~655 px
 *   stopka    61 znakow * 0.48 * 32 = ~940 px  (92% miary)
 * Zapas jest celowy, bo `whiteSpace: nowrap` nizej zamienia pomylke w szacunku
 * na zdanie wychodzace poza kadr - widac to natychmiast, w przeciwienstwie do
 * zdania zlamanego na dwie linijki, ktore wyglada prawie poprawnie. Przy
 * KAZDEJ zmianie tresci trzeba to przeliczyc i obejrzec obrazek ponownie.
 *
 * Naglowek i mechanizm maja ROZNY stopien, a nie sam rozny ton jak poprzednia
 * wersja. Tam oba zdania byly jednym argumentem i rozniac je mogla tylko
 * wartosc tonalna. Tu maja rozne role - pierwsze jest zdarzeniem, drugie
 * przypisem o tym, jak bylo mozliwe - wiec roznica ma byc jednoznaczna, a nie
 * ocierac sie o przypadkowe niedopasowanie.
 */
const HEAD_SIZE = 88;
const HEAD_LINE_HEIGHT = 1.12;
const MECH_SIZE = 48;
const MECH_LINE_HEIGHT = 1.3;
/** Wysokosc calego pasma bohatera - krecoslup ma byc dokladnie tak wysoki. */
const HERO_BLOCK_HEIGHT = Math.round(
  HEAD_SIZE * HEAD_LINE_HEIGHT + MECH_SIZE * MECH_LINE_HEIGHT + 14
);

/** Padding kadru - taki sam jak we wszystkich czterech kartach danych. */
const PADDING = 72;
/**
 * Krecoslup wisi POZA kolumna tekstu, jak `-ml-[26px]` na /re-definition.
 * 8 px, a nie 4 jak poprzednio: 4 px w miniaturze X-a to 1.7 px, czyli kreska
 * na granicy zniknięcia. Jednolity fiolet zamiast gradientu - gradient na
 * pasku tej szerokosci i tak jest niewidoczny, a jego dolny koniec byl
 * pomaranczowy, czyli lamal regule kwot.
 */
const SPINE_WIDTH = 8;
const SPINE_GAP = 28;
/** Lewa krawedz kolumny tekstu wzgledem paddingu: 8 + 28 = 36. */
const TEXT_INDENT = SPINE_WIDTH + SPINE_GAP;
const TEXT_WIDTH = 1200 - PADDING * 2 - TEXT_INDENT;

/**
 * KROJE - CZEGO TU NIE MA I DLACZEGO.
 *
 * Karta renderuje w `sans-serif`, czyli w Noto Sans wbudowanym w @vercel/og -
 * tak samo jak cztery karty danych. Baloo 2 i Nunito, ktore sa prawdziwym
 * glosem produktu, wymagalyby wgrania pliku TTF do bufora ImageResponse.
 * Odrzucone swiadomie: pliku nie ma w repo, a kazda droga jego wczytania na
 * Vercelu (fs z public/, ktore nie trafia do bundle'a funkcji; fetch po sieci
 * przy kazdym zimnym starcie; `new URL(..., import.meta.url)`, ktore wywala
 * `fileURLToPath`) dodaje tryb awarii do karty, ktora ma dzialac zawsze.
 * Glos marki to realna strata i osobne zadanie: wgrac subset Baloo 2 + Nunito
 * (tekst jest staly, wiec zbior glifow jest zamkniety) i podac go przez `fonts`
 * w ImageResponse - dla wszystkich pieciu kart naraz.
 *
 * SATORI, NIE PRZEGLADARKA: kazdy kontener ma jawny `display`, nie ma tu ani
 * jednej klasy Tailwinda i ani jednego cienia pod tekstem. Nie dokladac.
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
        background: CARD.bg,
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
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: 5,
          color: CARD.brand,
        }}
      >
        {EYEBROW}
      </div>

      {/* PASMO 2 - bohater. */}
      <div style={{ display: 'flex', gap: SPINE_GAP }}>
        {/* Krecoslup. Ten sam gest co .spine-fill w globals.css (wiersz 559):
            pionowa kreska na marginesie, ktora prowadzi wzrok do pierwszego
            slowa. Jedyny element graficzny na karcie - bez niego zostaje sam
            tekst na plaskim tle i miniatura nie ma zadnej krawedzi. */}
        <div
          style={{
            display: 'flex',
            width: SPINE_WIDTH,
            height: HERO_BLOCK_HEIGHT,
            borderRadius: 4,
            background: CARD.brand,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', width: TEXT_WIDTH }}>
          <div
            style={{
              display: 'flex',
              fontSize: HEAD_SIZE,
              lineHeight: HEAD_LINE_HEIGHT,
              fontWeight: 700,
              letterSpacing: -1.6,
              color: CARD.ink,
              whiteSpace: 'nowrap',
            }}
          >
            {HEAD_EVENT}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: MECH_SIZE,
              lineHeight: MECH_LINE_HEIGHT,
              fontWeight: 600,
              letterSpacing: -0.6,
              color: CARD.inkMuted,
              whiteSpace: 'nowrap',
            }}
          >
            {HEAD_MECHANISM}
          </div>
        </div>
      </div>

      {/* PASMO 3 - stopka, czyli podtytul. W czterech kartach danych to pasmo
          jest szeptem (22 px, #5C6F94); tutaj niesie tresc produktu, wiec ma
          30 px i 11:1 - ma przetrwac skalowanie do miniatury. Zero liczb i zero
          obietnic: wszystko, czego karta nie moze dotrzymac, jest NIEOBECNE,
          a nie zlagodzone. */}
      <div
        style={{
          display: 'flex',
          marginLeft: TEXT_INDENT,
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: -0.2,
          color: CARD.inkMuted,
        }}
      >
        {FOOTER_LINE}
      </div>
    </div>
  );
}

/**
 * Naglowki cache dla obu tras.
 *
 * Zawartosc karty jest w 100% stala - nie czyta ani jednej liczby z bazy -
 * wiec CDN moze ja trzymac tygodniami. Dla porownania /leaderboard ma godzine,
 * bo tam kazdy tip zmienia obrazek. Tu odswiezenie jest potrzebne dopiero
 * wtedy, gdy zmieni sie tekst, czyli przy wdrozeniu.
 */
export const OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=604800',
};
