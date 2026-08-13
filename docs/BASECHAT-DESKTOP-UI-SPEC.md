# BaseChat na desktopie: trzy kolumny i rail Asków (2026-08-13)

Specyfikacja zmiany wyglądu `/basechat` na szerokich ekranach. Punkt wyjścia:
dwie makiety od właściciela produktu. Z pierwszej bierzemy układ kolumn,
z drugiej wyłącznie blok Asków.

## Zasada nadrzędna

**Nic nie przestaje działać i nic nie znika.** Zmieniamy oprawę, nie mechanikę.
W szczególności: karty postów, wszystkie przyciski przy postach (tip, lajk,
komentarz, przypięcie, akcje per sieć, treść premium, odznaki agentów, muzyka)
zostają dokładnie tam, gdzie są, i robią dokładnie to, co robiły. Wolno im
zmienić kolor, promień i odstęp. Nie wolno im zmienić liczby, kolejności ani
zachowania.

Powód nie jest teoretyczny: podmiana kart postów na własne już raz zabrała na
telefonie tipy, przypinanie, przyciski transakcji per sieć, treść premium,
odznaki agentów i muzykę (komentarz przy `SoftFeedMobile`,
`app/basechat/page.tsx:3715`). Ten dokument istnieje między innymi po to, żeby
to się nie powtórzyło.

Telefon jest poza zakresem. Cała mechanika `activeMobilePanel` i trzy zakładki
na dole zostają bez jednej zmiany.

## Stan dzisiejszy

- Kontener `flex h-screen overflow-hidden` (`app/basechat/page.tsx:3146`).
- Kolumna boczna `lg:w-[352px] xl:w-[380px]` z nawigacją, profilem i Trends
  (`page.tsx:3148-3161`).
- Kolumna główna `flex-1`, treść w środku do `max-w-[640px]` (`page.tsx:3675`,
  `page.tsx:3714`).
- Trzecia kolumna istnieje, ale dopiero od `2xl` (1536px) i trzyma
  `trendsColumnContent` (`page.tsx:4975-4979`). Kopia w kolumnie bocznej ma
  wtedy `2xl:hidden` (`page.tsx:3657-3663`), więc widać dokładnie jedną.
- `FeedAskRail` stoi w środku feedu, nad listą postów (`page.tsx:4902-4904`),
  jako pozioma karuzela kart 290/330px (`FeedAskRail.tsx:450-511`).

Na makiecie (~1290px) trzecia kolumna jeszcze nie wchodzi, więc prawy rail
z Askami i rankingiem nie ma dziś prawa się pokazać.

## 1. Siatka kolumn

| Próg | Lewa | Środek | Prawa |
|---|---|---|---|
| `< xl` (do 1279px) | 352px | reszta, treść do 640px | brak |
| `xl` (1280px+) | 280px | reszta, treść do 640px | 320px |
| `2xl` (1536px+) | 320px | reszta, treść do 640px | 360px |

Kontener `flex h-screen` zostaje. Zmieniają się wyłącznie klasy szerokości
i progi. Poniżej `xl` układ jest bit w bit dzisiejszy.

## 2. Prawy rail

Warunek widoczności trzeciej kolumny zmienia się z `2xl` na `xl`
(`page.tsx:4976`). Razem z nim warunek na kopii w kolumnie bocznej: `2xl:hidden`
staje się `xl:hidden` (`page.tsx:3660`). Te dwie zmiany muszą wejść razem,
inaczej Trends widnieje dwa razy naraz albo znika.

Kolejność w railu od góry:

1. Aski (ciemna karta, patrz punkt 3)
2. Kafle statystyk: Users, Likes, Posts, Comments
3. Most active z paginacją
4. Kafelek YapScan, jeśli `/yapscan` nie jest wyłączony

Punkty 2-4 to niezmieniony `trendsColumnContent` (`page.tsx:3013-3059`).
Jedno źródło zostaje jednym źródłem.

## 3. Aski w prawym railu

`FeedAskRail` dostaje prop `layout: 'row' | 'column'`, domyślnie `'row'`.
`'row'` to dzisiejsze zachowanie, znak w znak.

W feedzie pas dostaje `xl:hidden`, w railu renderuje się `hidden xl:block`
z `layout="column"`. Zawsze widać dokładnie jedną kopię. Poniżej `xl`
i na telefonie Aski są tam, gdzie były.

### Co zmienia tryb `column`

Oprawa. Ciemna granatowa karta zamiast bloku na jasnym tle. Nagłówek
wersalikami z rozstrzeleniem, pod nim suma (punkt 3.1), lista Asków w pionie,
na dole bursztynowy przycisk prowadzący do odpowiadania.

Układ kart. Kontener z `flex snap-x overflow-x-auto` na `flex flex-col`,
karty z `w-[290px] shrink-0 snap-start` na `w-full` (`FeedAskRail.tsx:450-473`).

Zwarty wiersz zamiast `AskCard`. `AskCard` jest jasny i ma za dużo powietrza na
kolumnę 320px, więc tryb `column` rysuje własny, krótki wiersz: pytanie, kwota,
liczba miejsc, zegar, ile odpowiedzi zapieczętowanych. To jedyny nowy kawałek
widoku w całej zmianie i nie ma w nim żadnej logiki: dostaje gotowego `Ask`
i rysuje pięć pól. `AskCard` zostaje nietknięty dla trybu `row` i dla `/asks`.

### Co NIE zmienia tryb `column`

Odczyty, cache w localStorage i jego ważność, przełącznik Open/Resolved,
zwijanie pasa do jednej karty przy pisaniu odpowiedzi, `bumpAnswerCount`,
`FeedAnswerForm`, warunek `answerable`, rozgałęzienie autor/odpowiadający
(`onAnswer` kontra `href="/asks"`), obsługa awarii odczytu. Zero zmian
w `utils/asks/*`.

### 3.1 Suma „money on the table"

Liczona z Asków, które komponent i tak już ma w pamięci. Zero nowych odczytów.

Wzór: po Askach ze statusem `open` i `deadline > Date.now()` sumujemy
`perAnswer × (seats − acceptedCount)`.

Dlaczego nie suma budżetów: budżet obejmuje także miejsca już zajęte, a nagłówek
mówi o pieniądzach, które nadal można zgarnąć. Napis musi wynikać z liczby.

Dlaczego per token: `Ask.token` domyślnie to `USDC` i kompozytor wpisuje `USDC`
na sztywno (`utils/asks/useCreateAsk.ts:311`), ale typ dopuszcza inne
(`utils/asks/types.ts:60`, `asks.ts:70`). Zsumowanie różnych tokenów w jedną
kwotę byłoby napisem nieprawdziwym. Używamy istniejącego `TokenAmounts`
i `addTokenAmount` (`utils/asks/types.ts:338`). Jeden token to jedna kwota jak
na makiecie, więcej niż jeden to tyle linii, ile tokenów.

Gdy nie ma żadnego otwartego Aska: karta nie znika i nie pokazuje zera jako
zachęty. Pokazuje jedno zdanie i odnośnik do `/asks`. Powód przy „DECYZJA 2"
w nagłówku `FeedAskRail.tsx`: znikający element uczy tylko tego, że nie ma na co
patrzeć.

## 4. Warstwa wizualna

Kierunek: jaśniejsze karty na lawendowym tle, większe zaokrąglenia, miększy
cień, więcej powietrza między kartami, fiolet jako akcent na aktywnej pozycji
nawigacji.

Robione na tokenach `soft-*` w `app/globals.css`, nie przez podmianę klas
w setkach miejsc. Zmiana tokenu przechodzi przez cały produkt naraz i tak samo
naraz się cofa.

Chipsy sieci nad feedem: kółko z literą, etykieta pod spodem, aktywny
w obwódce. To sam wygląd. Wybór sieci steruje tym, który kompozytor się
pokazuje i na którym łańcuchu wyląduje post (`page.tsx:3777`), i ta rola się
nie zmienia.

Karty postów: wolno zmienić tło, promień, cień i odstępy. Nie wolno tknąć
zawartości ani przycisków. Patrz zasada nadrzędna.

Ciemna karta Asków jest jedynym ciemnym elementem na jasnej stronie i to jest
świadome: ma być jednym akcentem, nie początkiem drugiego motywu.

## 5. Poza zakresem

- Kafelek „Tips settled today $318.50" z pierwszej makiety. Takiej agregacji nie
  ma: `TipStats` liczy per użytkownik i per post. Dzienna suma globalna to nowe
  odczyty Firestore, czyli odwrotność trzech ostatnich commitów o kosztach.
- Górny pasek z wyszukiwarką i saldem USDC. Nowe funkcje, nie oprawa.
  Nawigacja zostaje dzisiejsza.
- Oś czasu przy feedzie i wpisy typu SETTLEMENT z drugiej makiety.
- Cokolwiek poniżej `xl` i cokolwiek na telefonie.

## 6. Jak sprawdzamy, że nic nie padło

Ręcznie, w przeglądarce, na czterech szerokościach: 1024, 1280, 1440, 1920.

1. Trends widać dokładnie raz na każdej z nich. Nigdy zero, nigdy dwa razy.
2. Aski widać dokładnie raz. Do 1279px w feedzie, od 1280px w railu.
3. Przełącznik Open/Resolved działa w obu trybach.
4. Odpowiadanie na Aska z raila otwiera formularz w railu i po wysłaniu
   podbija licznik odpowiedzi.
5. Suma w nagłówku zgadza się z tym, co widać na liście pod nią.
6. Post w feedzie ma te same przyciski co przed zmianą. Tip przechodzi.
7. Telefon: trzy zakładki na dole prowadzą do trzech różnych ekranów.
8. Gość bez portfela widzi ekran powitalny na całej szerokości, bez pustych
   kolumn po bokach.
9. `npm run build` przechodzi.

---

# Aneks: co dołożyliśmy w trakcie (2026-08-13, ta sama sesja)

Wszystko poniżej powstało po zatwierdzeniu specyfikacji wyżej, na żywo, na
prośbę właściciela produktu przy patrzeniu na localhost. Zasada nadrzędna
obowiązuje bez zmian: żadna funkcja nie zniknęła.

## 1. Tryb ciemny wyłączony klasą (BŁĄD, nie kosmetyka)

`tailwind.config.ts` nie miał `darkMode`, więc Tailwind stał na domyślnym
`media`. W repo jest około 170 klas `dark:` w samym basechacie, a `ThemeContext`
nigdy nie dokłada klasy `dark` do dokumentu, więc sterowało tym wyłącznie
ustawienie systemu patrzącego. Strona ma jedno jasne tło na stałe.

Skutek: człowiek z ciemnym systemem widział `dark:text-white` na białej karcie,
czyli biały tekst na białym, i ciemne kafle w jasnym panelu.

Poprawka: `darkMode: 'class'`. Jedna linia zamiast 170 podmian. Klasy zostają
w kodzie i odżyją, gdy ktoś doda prawdziwy przełącznik motywu — wtedy trzeba je
przejrzeć, bo dziś nikt ich nie widział i nikt nie sprawdził, czy są spójne.

**Dotyczy całej aplikacji, nie tylko basechatu.**

## 2. Ask jako jeden obiekt

`AskCard` jest ciemna WSZĘDZIE: w pasie nad feedem, w prawym railu i na `/asks`.
Ask nie jest postem — ma budżet, termin i miejsca, które się kończą — i jako
jedyny element aplikacji ma własny kolor. Kto raz zobaczy taką kartę, rozpozna
ją wszędzie.

To odpowiada też na pytanie o telefon: tak, na telefonie Aski są teraz ciemne,
bo ciemna jest sama karta, a nie jej oprawa w railu.

W prawym railu Aski stoją PIONOWO, do czterech (`SHOW_LIMIT`), bez suwaka na
boki. Karuzela została tam, gdzie była: w pasie nad feedem poniżej `xl`.

## 3. Trends: rejestr zamiast siatki kafli

Sześć pastelowych kwadratów z wielką cyfrą zamieniło się w jedną kartę
z wierszami: podpis po lewej, liczba po prawej, włosowa linia między nimi.
Powód: siatka kolorowych kafli to najczęstszy układ panelu statystyk, jaki
istnieje, więc nie mówiła o tym produkcie nic.

Liczby są PEŁNE (`184,064`, nie `184.1K`) — skrót był zaokrągleniem podanym
jako pomiar. Kolor siedzi w cyfrze, jeden na kategorię. Napis „at least" przy
lajkach zamienił się w `+` przy liczbie, bo to naprawdę dolna granica.

Zamiast odznaki „LIVE" jest naliczanie wartości przy wejściu: `getGlobalStats`
czyta raz, ranking co 30 minut, więc słowo „live" byłoby nieprawdą.
`prefers-reduced-motion` wyłącza ruch.

## 4. Lewa kolumna to wyłącznie nawigacja

Zeszły z niej: nagłówek profilu na telefonie, karta `ProfileCard` z tiltem,
sekcja „About Me" z edycją bio, socjale i kafel Sphere Identity.

Nic nie zginęło: bio wraz z regułą „raz na dobę" oraz socjale są w
`BuilderProfile`, a Sphere Identity został tam przeniesiony. Kafel YapScan i tak
się nie rysował, bo `/yapscan` jest wyłączony w `config/routeStatus.js`.

Dolna zakładka na telefonie nazywa się teraz „Menu" i ma ikonę listy. Wcześniej
nazywała się „Profile" i konkurowała z pozycją „My Profile" w środku tej samej
listy — jedna nazwa, dwa różne ekrany.

## 5. Builder Profile

- Fioletowy pas przez całą szerokość z napisem „Builder Profile" zniknął.
  Została sama strzałka powrotu, a obok niej „Edit profile”. Napis nazywał
  ekran, na który człowiek właśnie sam wszedł.
- Nagłówek to jeden rząd: zdjęcie, obok nazwa, adres i link do profilu
  publicznego. Wcześniej desktop dzielił to na dwie kolumny i tożsamość
  dostawała słupek ~200px na ekranie szerokim na 1900.
- Zdjęcie ma przycisk aparatu, widoczny tylko dla właściciela profilu. NIE robi
  drugiego uploadu — otwiera ten sam panel edycji, więc zapis zdjęcia ma dalej
  jedno miejsce w kodzie.
- Z panelu edycji wyleciała druga edycja X, Farcastera i Discorda z własnym
  „Save Social Links”. Ta sama robota siedzi w `ProfileSocials` na profilu.
  Zostało to, czego profil nie ma u siebie: zdjęcie i system nazw.
- Liczby z X i ze Spotify (3 i 4 kafle) czytają się teraz jak rejestr, tak samo
  jak Trends. Na 360px kafel miał tam około 100px.
- Biała karta owijająca cały profil zeszła: profil ma własne sekcje z własnymi
  kartami, więc była pudełkiem na pudełka, a `overflow-hidden` przycinał to, co
  z niej wystawało.

## 6. Cztery widoki z nawigacji

Follows, Friends, Discover i powiadomienia zaczynały się identycznie: biała
karta, w niej emotka z tytułem i trzy wielkie liczby na środku. Ten sam szablon
cztery razy. Teraz tytuł stoi wprost na tle, liczby idą w jednym rzędzie za
włosową linią. Ramek dookoła (`rounded-card bg-soft-surface … overflow-hidden`)
już nie ma — widoki wypełniają kolumnę.

## 7. Jeden pasek nad kompozytorem

Zakładki feedu (All Posts / Follows / Basenames) stały POD kompozytorem, a nad
nim był drugi rząd pigułek (Post / Ask). Trzy rzędy pigułek na jednym ekranie
i żaden nie mówił, który czym steruje.

Teraz jedna linia: po lewej WIDOK, po prawej TRYB PISANIA, rozdzielone pionową
włosową linią. Przyklejenie do góry kolumny zostaje, ale dopiero od `lg`.

## 8. Wybór sieci tylko nad feedem

Rząd siedmiu logotypów renderował się nad KAŻDYM widokiem środkowej kolumny,
także nad profilem i Discover, gdzie sterował kompozytorem stojącym gdzie
indziej. Na desktopie zabierał pierwsze 110 pikseli profilu. Teraz warunek to
`activeMainPanel === 'feed'`.

## 9. Drobne

- Nazwy użytkowników straciły gradient w tekście (`bg-clip-text`) — ten sam
  chwyt usunięto kiedyś z `PinnedPosts`, bo na Androidzie daje czarne
  prostokąty zamiast liter.
- Panel edycji profilu przeszedł na tokeny `soft`: poszły gradientowe tło,
  nagłówek malowany `bg-clip-text`, cztery różne kolory obwódki focusa na
  czterech polach obok siebie i przyciski w czterech gradientach.
- `PinnedPosts`, `LinkPreview`, `SpotifyTrackCard` i kompozytory łańcuchowe
  przeszły z twardych szarości na tokeny; martwe nadpisania `dark:` z tych
  plików usunięte.

## Czego NADAL nie zrobiono

- Lista kontrolna z sekcji 6 nie została przejechana systematycznie na czterech
  szerokościach.
- `BuilderProfile.tsx`, `PostList.tsx`, `TipButton.tsx` i `basechat/page.tsx`
  mają `@ts-nocheck`. Typecheck ich nie sprawdza, a to razem prawie 12 tys.
  linii.
- Reszta `BuilderProfile` poniżej nagłówka (zarobki, referral, Camp connector,
  Spotify) nie została uporządkowana.
- `CreatorCoinSection` i konfiguracje sieci per łańcuch nadal mają stare klasy.
