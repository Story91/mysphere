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
