# MySphere — materiał na posty (4–6 sierpnia 2026)

Surowiec do postów z aktualizacjami. **Każda pozycja pochodzi z git loga albo z `AUDYT.md`** —
nic tu nie jest domysłem ani zaokrągleniem. Liczby są takie, jakie zmierzyliśmy.

Zakres: commity z 4, 5 i 6 sierpnia 2026 (`git log`, ~120 commitów, PR #13–#28).

Kolejność w każdej grupie: od najmocniejszego.

---

## 1. Uczciwość danych — produkt, który obiecuje sprawdzalność, i to sprawdza

### 1.1. 17 z 17 linków „verify onchain" prowadziło do pustej strony
Odpytaliśmy produkcyjną kolekcję `tips` i sprawdziliśmy zapisane identyfikatory **na łańcuchu**.
17 z 17 hashy o poprawnym formacie zwracało `null` z `eth_getTransactionByHash` na Base mainnet.
Te same hashe sprawdzone na Base Sepolia, Ethereum, Optimism i Arbitrum — nigdzie ich nie ma.
Przyczyna: płatności przez Base Pay zapisują to, co zwraca `pay()`, a dokumentacja SDK opisuje tę
wartość jako *„Transaction ID (userOp hash)"*. userOp to zlecenie ERC-4337 — leży w jakiejś
transakcji, ale ma własny hash i pod `/tx/` go nie ma.
> **Dlaczego to ciekawe:** to jest dokładnie ten rodzaj wady, którego zielony build i zero błędów
> typów nie wykryją nigdy — dane były poprawne składniowo i całkowicie nieprawdziwe.

### 1.2. Rozwiązane u źródła: SDK miał prawdziwy hash w ręku i go wyrzucał
Bundler zna powiązanie userOp → transakcja i oddaje je przez `eth_getUserOperationReceipt`.
Sam SDK Base Pay woła to w `getPaymentStatus()`, ma `receipt.transactionHash` — i go odrzuca,
bo jego typ zwrotny nie ma takiego pola. Pytamy o to samo i zatrzymujemy wynik
(`app/utils/tips/resolveUserOp.ts`). Sprawdzone na żywo: `0x0230ff…` → `0xa8af69…` (blok `0x22fb95c`),
`0xdb6d5a…` → `0xf1f8a2…` (blok `0x2036390`), oba potwierdzone na Base mainnet.
> **Dlaczego to ciekawe:** odpowiedź na wadę nie brzmiała „obejdźmy to" — brzmiała „skąd bierze się
> ta liczba i kto zna prawdziwą".

### 1.3. Migracja 17 rekordów: 17 zapisanych, 0 błędów, 0 nierozwiązanych
`scripts/migrate-userop-hashes.mjs --apply` przepisał 17 rekordów z hasha userOp na hash prawdziwej
transakcji; 171 dokumentów pominiętych (pusty hash albo inna sieć). Każdy nowy hash weryfikowany
na łańcuchu **przed** zapisem, stara wartość zachowana w `txHashLegacyUserOp`. Ponowne uruchomienie
podglądu: „17 już poprawne, 0 do naprawy" — migracja jest idempotentna.
> **Dlaczego to ciekawe:** jedyny skrypt w repo, który pisze do produkcyjnej bazy, domyślnie
> **nic nie zapisuje** — zapis wymaga świadomej flagi `--apply`.

### 1.4. Ekran powitalny otwierał się trzema zmyślonymi ludźmi
Nowa osoba jako pierwszą rzecz z MySphere widziała trzy wpisy: `onchain-dev.base.eth`,
`BasedAndBuilt.sphere` i `WAGMI.camper`, z awatarami z `pravatar.cc` i wymyślonymi liczbami lajków,
komentarzy i tipów. Usunięte razem z `MockPost.tsx`.
> **Dlaczego to ciekawe:** produkt, którego cała teza brzmi „tych liczb nie da się nabić", otwierał
> się nieprawdziwymi liczbami przy nieistniejących ludziach.

### 1.5. Awaria odczytu udawała pustkę — na stronie o dowodach
`getLeaderboard` i `getSettledPayments` zwracały pusty wynik zarówno przy braku danych, jak i przy
błędzie. Strona ogłaszała wtedy „Nothing has settled yet" i „Nobody has been paid yet" — twierdzenia
o stanie świata postawione dokładnie wtedy, gdy nie udało się go sprawdzić. Obie zwracają teraz
flagę `failed`.
> **Dlaczego to ciekawe:** „nic nie ma" i „nie udało się sprawdzić" to dwa różne zdania, a większość
> kodu na świecie traktuje je jak jedno.

### 1.6. Przejściowa awaria Firestore kasowała czyjś profil pod 404
`getProfile` składało cztery niezależne odczyty i na końcu pytało, czy jest jakikolwiek ślad po tym
adresie. Gdy wszystkie cztery się wywróciły, ślad był zerowy — tak samo jak dla adresu, który nigdy
nie istniał — więc strona wołała `notFound()`. Dla crawlera 404 to oświadczenie, że strona nie
istnieje. To samo dotyczyło udostępnionego posta i paragonu.
> **Dlaczego to ciekawe:** szkoda była **trwalsza niż sama awaria** — sekundowa czkawka bazy wypisywała
> istniejącego człowieka z wyszukiwarek.

### 1.7. „Most Active" pokazywało 12 osób i twierdziło, że ma 50
`getTopActiveUsersPaginated` pobierało tylko tyle, ile potrzeba na bieżącą stronę (`1 × pageSize` = 10),
plus 20% zapasu z cache'u — stąd dokładnie 12 dokumentów. Funkcja **raportowała przy tym
`totalPages: 5` i `totalUsers: 50`**, mając w ręku 12 rekordów. Ten sam ekran podawał inne liczby
z cache'u niż bez niego.
> **Dlaczego to ciekawe:** to nie był błąd wyświetlania — paginacja obiecywała strony, których nie
> miała z czego zbudować.

### 1.8. Piętro wyżej ta sama klasa błędu: `setTotalUsersPages(5)` wpisane na sztywno
W panelu stała stała z komentarzem „zawsze 5 stron maksymalnie" — czyli stopka ogłaszałaby pięć stron
także wtedy, gdy danych starczy na jedną. Teraz idzie `result.totalPages`.
> **Dlaczego to ciekawe:** ten sam błąd potrafi mieszkać w dwóch warstwach naraz i każda z nich
> potwierdza drugą.

### 1.9. Manifest liczył sześć zaparkowanych modułów zamiast ośmiu
Strona `/re-definition` liczyła wyłączone trasy z **własnej listy** sześciu ścieżek przefiltrowanej
przez `isRouteDisabled()` — z komentarzem obiecującym, że „strona nie może rozjechać się z produkcją".
`DISABLED_ROUTES` ma osiem pozycji; doszły `/MyAgents` i `/MyClaw`, a lista w komponencie ich nie znała.
> **Dlaczego to ciekawe:** filtrowanie własnej listy przez funkcję ze źródła prawdy **nie jest**
> czytaniem źródła prawdy. I akurat na stronie, której nagłówek brzmi „no promises, only state".

### 1.10. „Siedem sieci, nie osiem" — poprawka policzalna we własnej dokumentacji
`AUDYT.md` mówił „Robinhood Chain (ósma sieć)", a ta liczba szła dalej do instrukcji dla agentów.
Sprawdzone w kodzie: `NETWORKS` w `TipNetworkConfig.ts` i `SOFT_NETWORKS` mają po **siedem** wpisów —
base, camp, celo, ethereum, linea, robinhood, world. Ósemka brała się z liczenia `camp` i `basecamp`
jako dwóch sieci, a to ten sam łańcuch pod dwiema nazwami.
> **Dlaczego to ciekawe:** ten sam alias, który dawał błędną liczbę w dokumentacji, groził realnym
> błędem 500 w kodzie (patrz 6.6). Jedna pomyłka w słowniku nazw, dwa różne skutki.

### 1.11. Link polecający był budowany z `Math.random()`
Podawany jako „tymczasowy", w praktyce **martwy adres** — kto go skopiował i rozesłał, rozdawał link
nieistniejący w bazie. Usunięty razem z obietnicą o „danych w czasie rzeczywistym", której nie miał
kto spełnić (nie było tam żadnego listenera).
> **Dlaczego to ciekawe:** to jedyna funkcja w produkcie, której cały sens polega na tym, że ktoś ją
> wyśle komuś innemu.

### 1.12. Taśma płatności była pusta, gdy ranking pod nią pokazywał ludzi
Pobierała dokładnie tyle dokumentów, ile chciała pokazać, i filtrowała je *dopiero potem* —
a **44 z 50 najnowszych tipów ma pusty `txHash`** (zaszłość po starej ścieżce OnchainKit; obecna
ścieżka wagmi zawsze podaje `receipt.transactionHash`).
> **Dlaczego to ciekawe:** dwa sprzeczne komunikaty na jednym ekranie: „nic się nie dzieje"
> i lista ludzi, którym się zdarzyło.

### 1.13. Daty z Firestore były zerowane — profile pokazywały rok 1970
Kolekcja `posts` trzyma `timestamp` w dwóch postaciach (Timestamp z `serverTimestamp()` albo liczba).
Czytniki serwerowe sprawdzały `typeof === 'number'` i przy pierwszej wstawiały 0. Skutek: profile
pokazywały 1 stycznia 1970, **sitemapa dawała crawlerom `lastModified` sprzed pół wieku**, paragony
gubiły datę. Nowy `app/utils/firestoreTime.ts` obsługuje każdą postać, przetestowany na 9 przypadkach.
> **Dlaczego to ciekawe:** nic nie wybuchało, więc nikt tego nie widział — dane po prostu były
> nieprawdziwe.

### 1.14. Panel admina ogłaszał na własnym banerze, że jest wyłączony — po włączeniu
Zielony baner na górze panelu nadal głosił „Admin Statistics: całkowicie wyłączony" i to samo
o UserManagement, gdy oba już działały.
> **Dlaczego to ciekawe:** dokumentacja wypisana na wierzchu własnego interfejsu starzeje się
> tak samo jak każda inna.

### 1.15. Sprawdziliśmy, czy „14 aktywnych w tygodniu" to prawda o produkcie — jest
Pomiar na produkcyjnej bazie: pole `lastActive` ma **174 031 kont z 184 064** (94,5%),
bez pola: 10 033. Aktywni: 24 h — 10, 7 dni — 14, 30 dni — 21, 90 dni — 38, 12 miesięcy — **22 910**.
Posty z 30 dni: **4** (na 263 613 razem). Kontrola krzyżowa po własnym znaczniku postów daje ten sam obraz.
> **Dlaczego to ciekawe:** zamiast schować liczbę, sprawdziliśmy, czy to artefakt pomiaru,
> i opublikowaliśmy ją we własnym panelu razem z liczbą kont **niewidocznych dla zapytania**.

### 1.16. Ask był rysunkiem na stronie manifestu, opisywanym w czasie teraźniejszym
Do 6 sierpnia „Ask" istniał **wyłącznie** jako funkcja `AskCard` w `app/re-definition/page.tsx`.
Zero modelu danych, tworzenia i API. `app/utils/asks/types.ts` + `asks.ts` to pierwsze miejsce,
w którym staje się rzeczywisty.
> **Dlaczego to ciekawe:** strona produktowa opisywała mechanikę, której nie było — i to zostało
> nazwane wprost w commicie, a nie po cichu naprawione.

### 1.17. Strona publiczna twierdziła, że umiemy weryfikować agentów. Nie umieliśmy
`/re-definition` mówiła: *„MySphere already knows how to verify who an AI agent is"*. Usługa KYA
nie istnieje: `kya-api.registr.ai` → NXDOMAIN, `registr.ai` bez odpowiedzi, `@registrai/kya` wycofany
z npm, Registrai spivotowało na oracle. Strona dostała osobny blok przyznający to wprost.
> **Dlaczego to ciekawe:** strona publiczna nie może powtarzać błędu z wewnętrznego dokumentu
> planistycznego.

### 1.18. Przycisk mówił „Sign In With Base", a w configu siedzi osiem konektorów
Teraz „Connect wallet", a na ekranie przedlogowania dwie realne drogi: „Continue with Base Account"
i „Use another wallet" z pełną listą.
> **Dlaczego to ciekawe:** nazwa przycisku to też twierdzenie o produkcie.

---

## 2. Bezpieczeństwo

### 2.1. Cała baza Firestore była otwarta przez 19 miesięcy
Produkcyjne reguły od 17 stycznia 2025 brzmiały dokładnie:
`match /{document=**} { allow read, write: if true; }` — z komentarzem „Tymczasowo".
Konfiguracja Firebase trafia do bundle'a klienta, więc każdy mógł skasować wszystkie posty albo
podmienić cudze dane z konsoli przeglądarki. Reguły zaostrzone i opublikowane 5 sierpnia.
> **Dlaczego to ciekawe:** nie dało się tego zamknąć jednym ruchem — aplikacja **nie logowała się
> do Firebase Auth**, więc `request.auth` było zawsze `null` i reguły nie miały jak sprawdzić, kto pisze.

### 2.2. Treść premium była publiczna — paywall był zasłoną, nie zabezpieczeniem
`premiumContent` siedziało w dokumencie posta, a feed czyta posty klienckim SDK. Każdy, kto zajrzał
w odpowiedź sieciową, widział płatny tekst bez płacenia. Teraz treść mieszka w kolekcji
`premiumContent` z regułą `allow read, write: if false`; wydaje ją `GET /api/premium` po sprawdzeniu
**podpisanej sesji SIWE i** rekordu odblokowania.
> **Dlaczego to ciekawe:** posty sprzed zmiany nadal mają treść w dokumencie i jest ona publiczna —
> nic tego nie cofnie. To jest napisane wprost, a nie przemilczane.

### 2.3. Poświadczenie konkretnego człowieka leciało bez `Cache-Control`
`/api/auth/session` zwracał `firebaseToken` bez nagłówka. `force-dynamic` gwarantuje tylko tyle, że
Next nie zbuduje trasy statycznie — **nie zabrania** pośrednikom (CDN, proxy firmowe, cache przeglądarki
przy nawigacji wstecz) trzymać gotowej odpowiedzi. Odpowiedź podana z cache'u innemu użytkownikowi
zalogowałaby go **jako ktoś inny**. Dodane `no-store, private` na wszystkich trzech ścieżkach zwrotu.
> **Dlaczego to ciekawe:** najgroźniejsza dziura w tej sesji nie była błędem logiki, tylko
> **brakującym nagłówkiem HTTP**.

### 2.4. Kto jest adminem — trzy niezależne definicje, wszystkie na starym portfelu
Kasowanie cudzych postów i komentarzy, przypinanie, panel `/admin`, moderacja i ręczny cleanup
przypięć chodziły nadal na `0xF1fa2002…1Dfd`, choć admin produktu zmienił się przy wdrożeniu
kontraktów. Adres siedział w `firebase.ts` (48 użyć), w `friends/config.ts` (z komentarzem „kopiowane
z głównego") i **wewnątrz funkcji** w `/api/cleanup-expired-pins`. Dziś jedno źródło, dwa pozostałe
importują; brama uprawnień to `0xD4885A…030e`.
> **Dlaczego to ciekawe:** zmiana w jednym miejscu zostawiłaby dwa pozostałe przy starym właścicielu —
> w tym trasę API, gdzie nikt by tego nie zauważył.

### 2.5. `MYSPHERE_ADDRESS` **celowo** został przy starej wartości
To odbiorca płatności za przypięte posty, nie brama uprawnień. „Kto może moderować" i „na jakie konto
wpływają pieniądze" to dwie osobne decyzje, a właściciel podjął tylko pierwszą. Powód zapisany
w kodzie, żeby nikt nie wyrównał tego odruchowo „dla spójności".
> **Dlaczego to ciekawe:** świadome **niezrobienie** czegoś, z uzasadnieniem zostawionym na miejscu.

### 2.6. x402 zamrażał decyzję o płatnościach na całe życie instancji
Wrapper zapamiętywał pierwszą decyzję, więc ciepła instancja uruchomiona **przed** ustawieniem
`X402_PAY_TO_ADDRESS` serwowałaby płatne zasoby za darmo do końca swojego życia — czyli dokładnie
wtedy, gdy ten adres wreszcie ustawimy. Teraz env czytany przy każdym żądaniu, a cena może być
funkcją żądania.
> **Dlaczego to ciekawe:** błąd, który uruchamia się dopiero w momencie, w którym wszystko zaczyna
> działać poprawnie.

### 2.7. Osiem pytań egzaminacyjnych dało się **kupić** wraz z odpowiedziami
Przy 4 opcjach i progu 6/8 czyste zgadywanie trafia ~0,4%, więc przy cenie $0.01 za próbę oczekiwany
koszt „kupienia" certyfikatu wynosił **~$2,50 — taniej niż się nauczyć**. Do tego 8 pytań pochodziło
dosłownie z lekcji za $0.001 i z challenge'y za $0.005, które zwracają `correct` w wynikach.
Usunięte. Doszedł magazyn postępów, cooldown 1 h, 3 próby na 24 h w oknie przesuwnym, brak podejść po
zdaniu, bank **16 pytań na dyscyplinę losowanych po 8**.
> **Dlaczego to ciekawe:** cooldown przenosi koszt z pieniędzy na czas — ~250 prób to 80+ dni przy
> 3 dziennie — nie karząc agenta, który realnie oblał i wrócił do lekcji.

### 2.8. Klucz API wpisany na sztywno i ładowany do publicznego bundle'a
`BASESCAN_API_KEY` — usunięty przy drugiej turze porządków.
> **Dlaczego to ciekawe:** wyszedł dopiero przy zdejmowaniu `@ts-nocheck` z pliku, którego kompilator
> nie sprawdzał nigdy.

### 2.9. Sesja SIWE żyła 2 godziny — i to był błąd projektowy, nie oszczędność
Prośba o podpis co dwie godziny uczy klikać „podpisz" bez czytania, czyli produkuje dokładnie ten
nawyk, przed którym ta aplikacja ma chronić. Właściwa miara ryzyka: ta sesja potwierdza, że adres
należy do tej przeglądarki, i **nie porusza żadnych środków** — każda płatność wymaga osobnego podpisu
transakcji. Teraz 7 dni z rollowaniem.
> **Dlaczego to ciekawe:** „krócej znaczy bezpieczniej" jest poprawne co do zasady i było błędne
> co do proporcji. Zaoszczędziliśmy na ryzyku kradzieży cookie, płacąc gorszą monetą.

### 2.10. Zamknięte jako fałszywy alarm
`ADMIN_API_KEY` w `/api/basemorning/stats` **nie jest dziurą** — warunek `!adminKey || adminKey !== ADMIN_KEY`
przechwytuje brak klucza, zanim dojdzie do porównania, więc `undefined === undefined` nie zachodzi.
> **Dlaczego to ciekawe:** wynik audytu bezpieczeństwa, który brzmi „to działa poprawnie", też jest
> wynikiem i też został zapisany.

---

## 3. Wydajność i koszt — panele, które były wyłączone, bo za drogie

### 3.1. Statystyki admina: ~461 000 odczytów Firestore → **467**
Cały komponent zwracał czerwone pudełko „Statystyki tymczasowo wyłączone". Nie była to przesada:
stary kod ściągał całe kolekcje przez `getDocs`, żeby policzyć ich długość w JavaScripcie —
184 064 + 263 613 + 13 492 ≈ **461 000 odczytów na jedno wejście na panel**.
Teraz `getCountFromServer()` liczy po stronie Firestore (jeden odczyt na każde rozpoczęte 1000 wpisów
indeksu). Zmierzone: użytkownicy 184 064 → ~185 odczytów / 513 ms; posty 263 613 → ~264 / 353 ms;
komentarze 13 492 → ~14 / 61 ms; tipy 188 → ~1 / 46 ms. **Razem ~467 odczytów, ~1,3 s.**
To pełne policzenie, nie próbka — te same liczby na wyjściu.
> **Dlaczego to ciekawe:** około **tysiąckrotnie taniej** przy identycznym wyniku. Do tego panel nic
> nie liczy sam: wejście kosztuje zero odczytów, a wynik siedzi w `localStorage` razem z godziną
> pomiaru — i panel mówi wprost, ile kosztowało jego własne odświeżenie.

### 3.2. Zarządzanie użytkownikami: 184 000 odczytów na wejście → trzy zapytania punktowe
Stara wersja robiła `getDocs` na **całej** kolekcji `users`. Wyłączenie było właściwą reakcją na koszt
i złą odpowiedzią na potrzebę — admin przestał mieć jakikolwiek sposób, żeby kogoś znaleźć albo
zbanować. Zmierzone na produkcyjnej bazie: `bannedUsers` (limit 100) → 0 dok. / 314 ms;
ostatnio dołączyli (`orderBy` + limit 25) → 25 dok. / 154 ms; szukanie punktowe po adresie →
1 dok. / 64 ms. **Żadne z tych zapytań nie rośnie razem z bazą.**
> **Dlaczego to ciekawe:** stary kod i tak by nie zadziałał po włączeniu — czytał `isBanned`
> z dokumentu użytkownika, a bany mieszkają w osobnej kolekcji `bannedUsers` i tamtego pola nikt nie
> zapisuje. Panel pokazywałby, że nikt nigdy nie jest zbanowany.

### 3.3. Jedno polubienie przełączało **cały feed** w stan ładowania
Trzy efekty wisiały na tożsamości tablicy postów. Optymistyczne polubienie tworzy nową tablicę, więc
każde kliknięcie serduszka dawało: pigułkę „Loading…" pod każdym postem, ponowne zbiorcze zapytanie
o napiwki dla całego feedu, ponowny lookup odznak agentów i ponowne sprawdzenie odblokowań premium.
Klucze są teraz łańcuchami ID.
> **Dlaczego to ciekawe:** zgłoszenie brzmiało „ekran miga jak się lajkuje" i było trafne
> co do joty — pod spodem leciały cztery niepotrzebne rundy zapytań.

### 3.4. Lajki: trzy niezależne błędy naraz
(1) **Miganie** — optymistyczna zmiana szła przez `onRefreshPosts()`, które podnosi `isLoadingPosts`.
(2) **Fałszywy błąd** — `catch` obejmował odświeżanie i zapis naraz, więc błąd odświeżania wyglądał
identycznie jak odrzucony lajk. (3) Post optymistyczny z ID `temp-…` zostawał w `localStorage`
**na stałe**, jeśli sesja skończyła się przed odpowiedzią Firestore — i każda próba polubienia go
kończyła się błędem.
> **Dlaczego to ciekawe:** trzeci błąd był nasz własny, wprowadzony przy poprzedniej optymalizacji,
> i został tak nazwany w commicie.

### 3.5. Lajk przeżywa nawigację za **zero odczytów**
`patchPostInCache` nanosi tę samą zmianę na zapisane listy w `localStorage`. Bez tego serduszko
wracało do poprzedniego stanu po przejściu na inną zakładkę i powrocie. Alternatywą byłoby skasowanie
cache'u i pobranie całego feedu **za jedno kliknięcie**.
> **Dlaczego to ciekawe:** Firestore liczy za każdy odczyt dokumentu — poprawka wizualna miała tu
> cenę wyrażoną w rachunku.

### 3.6. Cache feedu dopisuje zamiast kasować
Post szedł do stanu Reacta, ale nie do `localStorage`, więc powrót na zakładkę odtwarzał listę sprzed
publikacji — stąd zgłoszenie „musiałem przeklikać i wrócić". `prependPostToCache` daje ten sam efekt
za zero odczytów, a `replacePostIdInCache` podmienia temp-ID na prawdziwe, żeby w cache nie został
wpis prowadzący do nieistniejącej trasy `/post/temp-…`.
> **Dlaczego to ciekawe:** oczywista naprawa (skasuj cache) kosztowałaby pełne przeładowanie feedu
> za jeden post, którego treść i tak mamy w pamięci.

### 3.7. Lazy loading feedu był **wyłączony** i nikt tego nie widział
`expandedPosts ? … : slice(…)` — `expandedPosts` to mapa, więc zawsze truthy. `slice` nigdy nie
działał, renderowały się wszystkie posty naraz, a stan okazał się przy tym całkowicie martwy.
> **Dlaczego to ciekawe:** kod istniał, wyglądał na przemyślany i nie robił absolutnie nic.

### 3.8. Efekt liczył trending hashtags **dla nikogo**
Po usunięciu widoku nic już nie czytało `trendingTags` ani `expandedTagsList`, a efekt wciąż wołał
`getTrendingTags(posts)` — czyli przemiatał całą listę postów przy każdej jej zmianie.
> **Dlaczego to ciekawe:** martwy kod, który nadal kosztuje przy każdym renderze.

### 3.9. Hook robił 7 zapytań przy każdym wejściu, a wyniku nie czytał nikt
`useSocial` usunięty. Przy okazji: `hoveredElement` przerenderowywał 4000-liniową stronę przy każdym
najechaniu myszą na nick, a w repo leżało 12 handlerów bez ani jednego wywołania.
> **Dlaczego to ciekawe:** to nie były mikrooptymalizacje — to była praca wykonywana w całości na darmo.

### 3.10. Sprzątanie w liczbach (fale 0–E, zakończone)
Usunięte pliki: **290**. Usunięty kod: **22 149 linii**. `public/`: 71 MB → **22 MB**.
Zależności: 107 → **51**. Build lokalny: 125 → **101 s**. Lista 50 znajomych: 100 → **3** zapytania.
Feed 25 postów, statystyki tipów: 25 → **1** zapytanie.
> **Dlaczego to ciekawe:** metoda była policzalna — graf importów od punktów wejścia App Routera,
> ze zweryfikowanym brakiem dynamicznych importów ze zmienną.

### 3.11. Druga tura porządków: netto **−2500 linii**, a pod spodem czekał zepsuty przycisk
`app/basechat/page.tsx` miał `@ts-nocheck` w pierwszej linii — **4342 linie nigdy nie sprawdzone przez
kompilator** (po pracy: 3759). Po zdjęciu wyszedł jeden, za to poważny błąd: przycisk „PostCoin"
nie mógł działać, bo `@zoralabs/coins-sdk` 0.8.0 ma inne API niż kod. Rozjazd wszedł z podbiciem
zależności i był niewidoczny właśnie przez `@ts-nocheck`.
> **Dlaczego to ciekawe:** jedna linijka na górze pliku ukrywała zepsutą funkcję produktową przez
> całą podbitą wersję zależności.

### 3.12. Sześć kopii tego samego przycisku na sześć łańcuchów
6 kopii przycisku postu, 6 kopii przycisku komentarza i 5 kopii composera → **trzy implementacje
sterowane konfiguracją** (`app/basechat/chainPosting/`). W feedzie: **36 ręcznie wypisanych bloków
`network ===` → jeden `NetworkBadge`** ze zweryfikowanym pokryciem 1:1 (siedem sieci przed, siedem po).
> **Dlaczego to ciekawe:** dodanie ósmej sieci to teraz **jeden wpis** zamiast edycji w 36 miejscach.

---

## 4. Nowe funkcje i dystrybucja

### 4.1. Paid — feed tego, co ludzie sobie **zapłacili**
Każdy produkt społecznościowy ma feed tego, co ludzie *powiedzieli*. Żaden nie ma feedu tego, co
ludzie sobie *zapłacili*. `/leaderboard` ma dwie sekcje odpowiadające na różne pytania:
**„As it lands"** — strumień przelewów w kolejności, w jakiej wpadały, każdy z hashem i linkiem
do eksploratora (*„czy tu coś żyje"*); **„Who got paid most"** — suma w oknie (*„komu ufać"*).
Pozycja bez hasha jest odfiltrowana.
> **Dlaczego to ciekawe:** nie da się tego skopiować bez przeniesienia płatności na łańcuch.
> Ranking liczy sumy **rozliczonych płatności**, nie punkty za aktywność — punkty da się nabić,
> przelewów nie.

### 4.2. Paragon za tipa — kwota jako obiekt do wysłania
`/tip/[txHash]` z własną kartą OG, w której **bohaterem obrazka jest kwota**, bo większość ludzi
nigdy nie kliknie linku i zobaczy tylko podgląd. Po udanym tipie toast proponuje paragon i kopiowanie
linku **przed** linkiem do eksploratora: eksplorator jest dowodem dla jednej osoby, paragon jest tym
samym dowodem w formie, którą da się wysłać.
> **Dlaczego to ciekawe:** paragony **celowo nie trafiają do sitemapy** — istnieją po to, żeby ktoś
> je wysłał, a nie żeby crawler je zindeksował.

### 4.3. Publiczny profil `/u/[address]` — jedna strona dla człowieka i dla crawlera
Basename z weryfikacją w przód, policzone posty/lajki/tipy, własna karta OG. Dwie pułapki w danych,
obie obsłużone: kolekcje zapisują adres raz w checksumie, raz małymi literami (**bez tego połowa
profili byłaby pusta**), a kwoty tipów sumowane są wyłącznie w obrębie tokena — dodanie ETH do USDC
dałoby liczbę, która nic nie znaczy.
> **Dlaczego to ciekawe:** tożsamość istniała wyłącznie wewnątrz feedu — nie było adresu, który
> można wkleić w odpowiedzi na pytanie „kim jesteś".

### 4.4. Karta OG posta pokazuje sumę tipów — na zielono i **przed** lajkami
> **Dlaczego to ciekawe:** post z widoczną kwotą jest obiektem, który ktoś wyśle dalej; post z samym
> tekstem nie jest.

### 4.5. `sitemap.xml` (500 ostatnich postów) + `robots.txt` + `llms.txt`
Każdy post miał już własny URL z metadanymi, ale nic o tych URL-ach nie mówiło wyszukiwarkom —
do całego feedu prowadził jeden link. Trasy statyczne filtrowane przez `isRouteDisabled`, więc
sitemapa nie może zaprosić crawlera tam, gdzie i tak dostanie przekierowanie.
> **Dlaczego to ciekawe:** `llms.txt` opisuje kierunek produktu **jako kierunek**, z jawnym
> ostrzeżeniem, żeby traktować oznaczone „building" jako niezbudowane.

### 4.6. Strona posta przepisana — bo to pierwsza rzecz, jaką ktoś widzi z MySphere
Była ostatnią stroną na ciemnogranatowym tle, a przychodzi się na nią z wklejonego linku, nie
z aplikacji. Doszły: pasek marki, nazwa autora prowadząca do profilu, **suma tipów jako jedyny mocny
kolor na stronie** i stopka kierująca na `/leaderboard`. Treść i sumy tipów czytane równolegle.
> **Dlaczego to ciekawe:** ktoś, kto trafił tu z linku, dostaje jedno zdanie o tym, czym to miejsce
> się różni, i jedno kliknięcie do dowodu.

### 4.7. Udostępnianie przez natywny arkusz systemu, nie własne okienko
`navigator.share` — ten sam arkusz, którego użytkownik używa w każdej innej aplikacji.
Własne okienko z czterema ikonami sieci jest gorsze na trzy sposoby naraz: nie zna aplikacji
zainstalowanych u tego człowieka, wymaga utrzymywania starzejącej się listy i wygląda obco na każdym
systemie. Na desktopie przycisk od razu mówi „Copy link" zamiast obiecywać udostępnianie, którego nie ma.
> **Dlaczego to ciekawe:** zamknięcie arkusza przez użytkownika **nie jest błędem** i nie pokazuje
> niczego; gdy schowek jest zablokowany, pokazujemy adres do skopiowania ręcznie zamiast udawać sukces.

### 4.8. Ranking Most Active 1–50 ze stronicowaniem — paginacja istniała tylko w danych
Backend od dawna oddawał 10 osób na stronie i do 5 stron, ale panel robił `slice(0, 5)`
i `setCurrentPage` **nie było wołane nigdzie**. Teraz cała strona, stopka „1 / 5", numeracja ciągła
przez strony (druga zaczyna się od 11), awatary najpierw z ENS/Basename, skrót liczb (184K, 2,6M)
z pełną wartością w `title`, dokładnie poniżej 10 000.
> **Dlaczego to ciekawe:** stopka powstaje tylko przy więcej niż jednej stronie — „1 / 1" z dwoma
> wygaszonymi strzałkami to obietnica nawigacji, której nie ma.

### 4.9. Ask dostaje model danych, a razem z nim trzy decyzje
`app/utils/asks/types.ts` + `asks.ts`: pytanie, budżet, miejsca, termin, liczniki, resolve rate.
(1) **Zapieczętowanie odpowiedzi jest prawdziwe** — treść idzie do osobnej kolekcji
`askAnswerContent` z regułą `if false`, wydaje ją wyłącznie trasa serwerowa (ten sam układ,
co działa już dla treści premium). (2) **`perAnswer` dzieli w dół do centa** — zaokrąglenie w górę
dawałoby Aska, który przy komplecie miejsc jest droższy, niż obiecywał. (3) `acceptAnswer`
**wymaga hasha wypłaty** — bez niego „przyjęta" jest samym słowem.
> **Dlaczego to ciekawe:** resolve rate liczy tylko Aski **po terminie**, a błąd odczytu daje `null`,
> nie zero — zero byłoby zarzutem wobec człowieka postawionym wtedy, gdy nie udało się tego sprawdzić.

### 4.10. PostCoin (Zora) znowu działa — i wymagał dwóch decyzji produktowych
SDK 0.8 ma inne API niż kod: jeden obiekt zamiast trzech argumentów pozycyjnych, `metadata: {type, uri}`
zamiast płaskiego `uri`, `creator` zamiast `owners`. Wybrane: **`currency: ETH`** — bo ETH ma każdy,
kto doszedł do tego przycisku (płaci nim za gaz), a wymaganie ZORA znaczyłoby, że zanim ktoś wybije
monetę ze swojego posta, musi najpierw kupić obcy token. Oraz **`startingMarketCap: LOW`** — post
w feedzie to ślad po treści, nie zbiórka. Zweryfikowane na żywym SDK, bez wydawania grosza.
> **Dlaczego to ciekawe:** sprawdzone w `docs.zora.co`, nie zgadywane — i ETH jako jedyna z czterech
> opcji działa też na Base Sepolia, więc da się to przetestować bez prawdziwych pieniędzy.

### 4.11. Własny rejestr agentów zamiast wynajętego, którego nie ma
KYA nie istnieje, więc MySphere przestaje wynajmować warstwę zaufania i zaczyna ją posiadać:
kolekcja `agents`, docId = adres w lowercase, więc dopasowanie autora z feedu to odczyt **po kluczu**,
nie skanowanie. `getAgentsByAddresses` chunkuje po 30: feed 150 postów / 150 unikalnych autorów
= **5 zapytań**; 50 autorów = 2; zero = 0. `lib/kya.ts` został cienką warstwą zgodności, więc całe
istniejące UI `/MyAgents` działa bez przeróbek.
> **Dlaczego to ciekawe:** score przy zerze opinii to `null`, **nie zero** — dlatego próg liczby
> opinii jest osobną bramką.

### 4.12. „Wynajmij agenta" w feedzie — bez udawania gwarancji
`HireAgentModal`: zlecenie i zapłata bez wychodzenia z czatu. UI mówi wprost, że płatność idzie
bezpośrednio do agenta, **bez escrow i bez automatycznego zwrotu**.
> **Dlaczego to ciekawe:** `receipt.status === 'reverted'` jest tu błędem, nie sukcesem — dokładnie
> ten błąd naprawiliśmy wcześniej w `TipButton`.

### 4.13. Robinhood Chain — siódma sieć, `chainId` potwierdzony **przed** napisaniem configu
`eth_chainId` → `0x1237` = 4663 (testnet 46630), explorer Blockscout. Tipy działają od razu (transfer
natywny nie dotyka kontraktu i nie czeka na deploy). Postowanie jest **jawnie niedostępne, nie po cichu
zepsute**: bez adresu kontraktu przycisk jest `disabled` („Coming soon"), composer pokazuje baner,
a przed `writeContract` stoją dwie bramki. Kontrakt wdrożony i zweryfikowany:
`0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6`, blok 28672626, `paused = false`.
> **Dlaczego to ciekawe:** skrypt deployu sprawdza `chainId` **zanim** cokolwiek wyśle — zły
> `--network` kończy się błędem, nie kontraktem na obcej sieci. A ABI zweryfikowane względem
> frontendu: 16/16 sygnatur.

---

## 5. Wygląd i wrażenie — kierunek Soft Social

### 5.1. Tokeny wyciągnięte z pliku projektu, nie dobrane na oko
Każda wartość występuje w projekcie właściciela i została policzona: fiolet `#7C6BDA` (23 wystąpienia),
tusz `#2E2A44` (19), lawenda `#EEE9FB` (15), pomarańcz `#F5A73B` (9), cień kart (8).
16 zmiennych kolorów + 3 cienie — wszystkie **fioletowe, nie czarne**, bo czarny cień na lawendzie
wygląda jak brud.
> **Dlaczego to ciekawe:** kierunek wizualny ma jedno miejsce w kodzie, a nie kilkaset wpisanych
> na sztywno kolorów.

### 5.2. Przezroczystość działała **tylko pozornie** — i był to błąd we własnym fundamencie
Tokeny trzymały zapis hex w zmiennej CSS. Tailwind potrafi doklejać przezroczystość
(`bg-soft-primary/10`) tylko wtedy, gdy token da się złożyć jako `rgb(… / <alpha-value>)` — przy hex
modyfikator alfy jest **ignorowany**. Klasa nie znika, nie ma ostrzeżenia, po prostu maluje kolorem
w pełnej mocy. Subtelne poświaty w profilu rysowały się jako solidne fioletowe i pomarańczowe plamy.
Szesnaście tokenów przepisanych na trójki kanałów RGB.
> **Dlaczego to ciekawe:** objaw był cichy, dlatego groźny — a znalazł to agent przy przemalowywaniu
> karty postu, nie autor tokenów.

### 5.3. Biała plama w rankingu: `background: 185 177 216` to CSS nieprawidłowy
Ta sama klasa błędu co wyżej. Tokeny trzymają trójkę kanałów (bo tego wymagają modyfikatory
przezroczystości Tailwinda), a wstawione wprost do `background` dawały wartość po cichu pomijaną:
kółko traciło tło, a numer pozycji był biały — czyli **od czwartego miejsca w dół niewidoczny**,
w panelu Trends i na stronie Paid. Poprawione na `rgb(var(…))`.
> **Dlaczego to ciekawe:** zgłoszone przez właściciela z ekranu, nie znalezione przez żaden build.

### 5.4. Czarne prostokąty zamiast nazw na Androidzie
`bg-clip-text` + `text-transparent` z Tailwinda daje `background-clip: text` razem z `color: transparent`,
a silniki Chromium na Androidzie (zwłaszcza Samsung Internet) potrafią w tej kombinacji narysować
czarną plamę. Wzorzec występował w **~50 miejscach**, więc naprawiliśmy przyczynę raz
(`-webkit-text-fill-color`) zamiast przepisywać każde użycie.
> **Dlaczego to ciekawe:** zgłoszenie przyszło ze zrzutu ekranu i wyglądało jak zepsuta czcionka.

### 5.5. Logo Robinhooda było 449-bajtową atrapą
`/logotypy/robinhood.svg` to zielony kwadrat z kreską, nie logo. Stąd wrażenie, że „logo brakuje":
obok napisu stał generyczny kwadracik zamiast pióra. Wszystkie 7 odwołań przepięte na `/robin.webp`,
atrapa skasowana.
> **Dlaczego to ciekawe:** plik istniał, ładował się poprawnie i nie przedstawiał niczego.

### 5.6. Logo World Chain miało obrys `#FFFFFF` — czyli było niewidoczne na jasnym tle
Powstał wariant `world-symbol-dark.svg`, podmieniony w ośmiu miejscach. Przy okazji: odznaka miała
pod nim biały krążek (istniejący wyłącznie po to, żeby biel miała się na czym odcinać) i wymiar `h-3`
bez szerokości, który rozciągał symbol według proporcji lockupu 4:1.
> **Dlaczego to ciekawe:** jeden zły kolor obrysu ciągnął za sobą dwa obejścia, które udawały decyzje
> projektowe.

### 5.7. **Zasada, która wyszła z realnej regresji: przemalowujemy, nigdy nie podmieniamy**
Podmiana kart postów na telefonie na własne, ładniejsze — i feed stracił naraz tipy, przypinanie,
przyciski transakcji per sieć, treść premium, odznaki agentów i muzykę. Zgłoszenie brzmiało
„zniknęło dużo ikonek" i było trafne co do joty. Wygląd wolno wymieniać tam, gdzie **nic za sobą nie
ciągnie**: tło, pasek sieci, zakładki, pigułka kompozytora.
> **Dlaczego to ciekawe:** weryfikacja po przemalowaniu jest policzalna — **liczba handlerów przed
> i po** (`PostList`: 26 → 26). Ta kontrola pojawia się teraz w każdym commicie wizualnym.

### 5.8. Toasty: kolor niesie wyłącznie ramka i ikona
Były pełnymi płachtami koloru z białym tekstem — płachta krzyczy tak samo przy „polubiono post"
i przy „transakcja odrzucona", więc siła komunikatu nie miała związku z jego wagą. Teraz biała karta,
czarny tekst, cienka kolorowa ramka i ikona (drugi kanał, więc kto nie odróżnia zieleni od czerwieni,
widzi ptaszek albo krzyżyk). Błąd zostaje 5 s, sukces 3 s. Ustawione **globalnie** zamiast przy
~200 wywołaniach `toast.*` rozsianych po aplikacji.
> **Dlaczego to ciekawe:** sukces potwierdza to, o czym użytkownik już wie; błąd niesie informację,
> której jeszcze nie ma.

### 5.9. Ekran powitalny mówi tezę, nie ogólnik
Było: „Post, tip & connect onchain" — opis pasujący do każdego produktu społecznościowego z portfelem
i do żadnego w szczególności. Jest: **„A like is worth $0.00. A payment is not."** — wzięte wprost
z manifestu na `/re-definition`, który otwiera się znacznikiem *„$0.00 — what a like is worth"*.
Doszedł cichy link do manifestu, bo twierdzenie bez uzasadnienia jest sloganem.
> **Dlaczego to ciekawe:** link, a nie `onClick` — bo to nawigacja i ma działać środkowym przyciskiem
> oraz w nowej karcie.

### 5.10. Scena rozliczenia zamiast orbity awatarów — bez jednej linii JavaScriptu
Znak marki w środku, siedem sieci na kole, po przewodach jadą monety i znikają pod znakiem, gdy
obwódka błyska. **Jedna moneta naraz, nie siedem** — siedem jednocześnie to migotanie, jedna to
zdarzenie, które da się przeprowadzić wzrokiem. Zrobione samymi ujemnymi opóźnieniami CSS.
Pomarańcz zszedł z dysku marki na monety: kolor zarezerwowany dla pieniędzy nosił element, który
z pieniędzmi nie ma nic wspólnego.
> **Dlaczego to ciekawe:** w tej aplikacji pomarańcz **znaczy** „pieniądze albo coś wymienialnego na
> pieniądze" — dlatego punkty w profilu są pomarańczowe, a posty i lajki nie: aktywność da się nabić.

### 5.11. Taśma paragonowa na stronie Paid
Paragon to jedyny przedmiot codzienny, którego cała funkcja polega na tym, że potwierdza przepływ
pieniędzy i da się go komuś pokazać. Stąd ciągły pas papieru z perforacją (gradient radialny, nie
obrazek — skaluje się z dowolną wysokością i nie kosztuje ani jednego żądania sieciowego) i oderwaną
krawędzią (maska stożkowa — nikt nie odrywa paragonu równo). Kwoty monospace'em, wyrównane do prawej,
więc rząd wielkości widać bez czytania cyfr.
> **Dlaczego to ciekawe:** wiersze wchodzą kaskadą co **45 ms** z górnym ograniczeniem, a najświeższa
> płatność dostaje **jeden** impuls obwódki — pulsowanie bez końca przestaje cokolwiek znaczyć
> po trzeciej powtórce.

### 5.12. Kręgosłup kwot na `/re-definition` — jedyna animacja sterowana przewijaniem
Znaczniki sekcji były już kwotami, nie numerami, bo kolejne sekcje to **stany tej samej kwoty**:
zero (reputacja za darmo), stawka, 402 (żądanie zapłaty), rozliczona suma. Teraz są stacjami
na pionowej linii, która rysuje się w miarę przewijania — przez `animation-timeline: view()`,
**bez jednej linii JavaScriptu**. Gdzie przeglądarka tego nie ma, linia jest narysowana w całości.
> **Dlaczego to ciekawe:** reszta strony jest nieruchoma celowo — to strona do czytania, a ruch obok
> tekstu konkuruje z każdym zdaniem.

### 5.13. Na telefonie stały **dwa** kompozytory i **dwa** wybory sieci
Pasek sieci na górze, zwinięta pigułka „What's happening onchain?" z plusem, poniżej drugi wybór sieci
i poniżej pełny kompozytor z tym samym napisem. Dwa pytania „co słychać?" i dwa rzędy logotypów, zanim
pojawił się pierwszy post. Co ważne, te dwa wybory sieci **nie były tym samym**: górny filtruje feed,
dolny decyduje, na który łańcuch poleci post.
> **Dlaczego to ciekawe:** wybór łańcucha docelowego należy do kompozytora i jest teraz w jego środku —
> widoczny dopiero wtedy, gdy ktoś faktycznie pisze. Drugi formularz byłby drugim miejscem, w którym
> trzeba naprawiać ten sam błąd.

### 5.14. Oprawa feedu renderowała się nad **każdym** widokiem
Pasek sieci, zakładki „All Posts / Follows / Basenames" i pigułka kompozytora stały nad Powiadomieniami
i Discover — trzy filtry do treści, której tam nie ma, i zaproszenie do napisania posta tam, gdzie
żaden post nie powstanie. Zakładki były przy tym **czynne**, więc kliknięcie „Follows" na ekranie
powiadomień przełączało niewidoczny feed pod spodem.
> **Dlaczego to ciekawe:** oprawa i treść włączają się teraz razem — ta sama gałąź warunku.

### 5.15. Prawy panel pokazywał te same cztery liczby dwa razy, w dwóch stylach naraz
„Global Statistics" renderowało Users / Likes / Posts / Comments, które wyżej pokazywał już
`SoftTrendsPanel`. Raz w kierunku Soft Social, raz w starych szarych kaflach z gradientowym nagłówkiem.
**123 linie mniej.**
> **Dlaczego to ciekawe:** to nie była nadmiarowa informacja, tylko ta sama informacja dwa razy.

### 5.16. Trzy kolumny → dwie, bo prawa nie miała czego pokazywać
Jedyny komponent w niej był `lg:hidden`, więc na desktopie stało tam **380 px białej pustki** —
i przy okazji desktop nie widział żadnych statystyk. Sześć kafli przeniesione 1:1 do kolumny bocznej.
Usunięte zmyślone bio niezalogowanego.
> **Dlaczego to ciekawe:** pusty kontener wygląda w kodzie jak działający layout.

### 5.17. Panel edycji profilu otwierał się **poza ekranem**
Stał 340 linii niżej, pod obiema kartami profilu. Na telefonie: dotykasz „Edit" na górze, nic
widocznego się nie dzieje. Przeniesiony bezpośrednio pod nagłówek z przyciskiem, który go otwiera.
> **Dlaczego to ciekawe:** reakcja na dotknięcie ma być widoczna w tym samym kadrze, w którym
> nastąpiło dotknięcie.

### 5.18. Kolory końcówek nazw: `.celo` dostawało żółty na białym
Trends pokazywał nazwy jednolicie, więc `.sphere`, `.camper`, `.celo` i `.world` wyglądały identycznie —
a to jedyna informacja o sieci, jaką niesie sam napis. Gdzie indziej kolory były, ale wpisane ręcznie
w pięć gałęzi `endsWith()`, w dodatku różnie: `text-blue-500` w jednym pliku, `text-soft-primary-deep`
w drugim, a `.celo` → `yellow-500`, czyli praktycznie brak tekstu. Lista żyje teraz
w `app/utils/nameSuffix.tsx`.
> **Dlaczego to ciekawe:** barwy wzięte z `NETWORKS`, ale **przyciemnione tam, gdzie oryginał jest
> nieczytelny na białym** — Celo z żółtego na ciemną zieleń, World z czerni na grafit (czerń jest
> czytelna, ale nieodróżnialna od reszty napisu).

### 5.19. Modal logowania lądował na środku headera i chował się pod nawigacją
`backdrop-blur-xl` na `<header>` robi dwie rzeczy naraz: tworzy blok zawierający dla potomków
z `position: fixed` **i** własny kontekst stackingu. Więc `fixed inset-0` pozycjonowało się względem
headera, a `z-[10000]` było uwięzione wewnątrz `z-50`. Naprawa: `createPortal` do `document.body`.
> **Dlaczego to ciekawe:** ta sama klasa błędu co dwa wcześniejsze problemy z dropdownem —
> raz portal bity klasami z `!important`, raz brak portalu w elemencie z `backdrop-filter`.

### 5.20. Przyciski, które wyglądały na działające
„Tip" przy pustej kwocie był **włączony** (`parseFloat('')` to `NaN`, a `NaN <= 0` jest fałszem) —
kliknięcie wchodziło do handlera i cicho z niego wychodziło. „Load More Posts" bez portfela: widoczny,
klikalny, nie robił nic. Kosz admina pytał o potwierdzenie **dwa razy** (raz w `onClick`, raz
w handlerze), więc „Anuluj" w drugim okienku wyglądało jak zepsuty przycisk.
> **Dlaczego to ciekawe:** przycisk, który reaguje i nic nie robi, jest gorszy niż wyłączony —
> użytkownik nie ma jak odróżnić awarii od własnego błędu.

### 5.21. Komunikaty o niewłaściwej przyczynie
Odmowa podpisu w portfelu (kod 4001) pokazywana jako **czerwona awaria** — aplikacja krzyczała błędem
o tym, że ktoś się rozmyślił. „Insufficient ETH" przy pełnym portfelu, przez pierwsze sekundy zanim
saldo się załaduje. Nieudana płatność Base Pay raportowana jako „nieudane sprawdzenie statusu".
Błąd zapisu tipa **po udanej płatności** pokazywany jako błąd płatności. Błąd pobrania listy tipów
wyglądał identycznie jak „brak tipów".
> **Dlaczego to ciekawe:** pięć różnych zdarzeń pokazywanych jako to samo — użytkownik nie miał jak
> wiedzieć, czy stracił pieniądze.

### 5.22. Wieczne „Processing" i wyścigi
`pollStatus` Base Pay odpytywał w **nieskończoność** przy statusie utkniętym w „pending" (teraz limit
60 prób i uczciwy komunikat). Odczyt sald tokenów bez flagi anulowania: zmiana portfela w trakcie
wpisywała salda **poprzedniego** adresu. `RecentTips` nie anulował pobierania — ten sam objaw.
> **Dlaczego to ciekawe:** wyścig przy zmianie portfela to nie kosmetyka — to cudze liczby na
> Twoim ekranie.

### 5.23. Świeży komentarz dostawał ID `temp-…`
`addComment` było `Promise<void>`, więc wołający wstawiał do listy komentarz z tymczasowym ID.
Firestore miał pod tym wpisem właściwy identyfikator, więc **każda operacja na świeżym komentarzu** —
polubienie, usunięcie — trafiała w nic i kończyła się komunikatem o awarii, mimo że zapis się powiódł.
Sygnatura zmieniona na `Promise<string>`.
> **Dlaczego to ciekawe:** zmiana jest czysto dodająca — kto ignorował wynik, działa bez zmian.

### 5.24. Dekoracja, która nic nie robiła
Skasowane: 27 cieni z ikon 12–20 px (na tej wielkości cień daje wyłącznie rozmycie) i 6 gradientów
tekstowych `bg-clip-text` — tej samej techniki, która na Androidzie renderowała czarne prostokąty.
Selektor sieci pokazuje same znaki bez podpisów (siedem nazw rozciągało rząd na całą szerokość
kompozytora), ale nazwa **nie ginie**: `aria-label` staje się jedyną nazwą dostępną, doszedł `title`.
> **Dlaczego to ciekawe:** warunkiem usunięcia podpisów było to, żeby informacja nie zniknęła —
> znaki sieci nie są powszechnie rozpoznawalne.

---

## 6. Infrastruktura, sieci, deploy

### 6.1. Logowanie padało na produkcji, bo w projekcie nie było pola `engines`
`firebase-admin@14.2.0` deklaruje `engines: {"node": ">=22"}`, a projekt nie miał ani `engines`,
ani `.nvmrc`. To tłumaczy **cały** obraz objawów: padały dokładnie trzy trasy importujące
`firebaseAdmin.ts` (`/api/auth/verify`, `/api/auth/session`, `/api/premium`), a `/api/auth/nonce` —
jedyna z tej grupy bez tego importu — działała. Błąd był HTML-ową pięćsetką, czyli wybuchem przy
ładowaniu modułu, a nie odpowiedzią handlera. Lokalnie wszystko działało, bo tam stoi Node 24.
> **Dlaczego to ciekawe:** wcześniejsze hipotezy zostały **obalone i zapisane**, żeby nikt nie szedł
> nimi drugi raz: ślad plików `@vercel/nft` zawiera komplet `firebase-admin` w obu wariantach
> konfiguracji, a shim `server-only` dostarcza sam Next.

### 6.2. `/Docs` i `/docs` to była nieskończona pętla przekierowań
Reguła `/docs → /Docs` zapętlała się z kanonizacją `trailingSlash`, bo matcher reguł ignoruje wielkość
liter: `/Docs → /Docs/ → /Docs → …`. Zmierzone curlem: przerwanie po **12 skokach**, w przeglądarce
`ERR_TOO_MANY_REDIRECTS`. **Cała dokumentacja z whitepaperem była nieosiągalna** — także lokalnie,
więc poprzedni komentarz w `next.config.js` obwiniający Vercela był błędną diagnozą.
> **Dlaczego to ciekawe:** wcześniejsza „naprawa" tej samej trasy była poprawna i niekompletna;
> dopiero pomiar pokazał, że problem przeniósł się o warstwę dalej.

### 6.3. Publiczny RPC Ethereum przestał wysyłać CORS
`eth.llamarpc.com` przestał odpowiadać na preflight — w konsoli dawało to kilkadziesiąt
„blocked by CORS policy" pod rząd i **każdy odczyt z mainnetu kończył się porażką**. Zweryfikowane
curlem. Zamiast pojedynczego `http()` stoi teraz `fallback()` z dwoma endpointami.
> **Dlaczego to ciekawe:** llamarpc był **pierwszy** na liście, czyli domyślny — jeden publiczny RPC
> to pojedynczy punkt awarii dla całego łańcucha.

### 6.4. Salda monet Zory czytane na złym łańcuchu
`usePublicClient()` bez argumentu daje klienta aktualnie podłączonej sieci, a kontrakty tych monet
istnieją wyłącznie na Base. Gdy portfel siedział na Ethereum, `balanceOf` szło pod adres, pod którym
nic nie ma, i wracało puste `0x` — błąd w konsoli, ciche zero w UI.
> **Dlaczego to ciekawe:** „ciche zero" jest gorsze od błędu, bo wygląda jak prawdziwy stan konta.

### 6.5. OnchainKit usunięty **całkowicie** — i przy okazji naprawiony realny błąd z pieniędzmi
Base wygasiło go 19 marca 2026 (npm zamrożony na 1.1.2, docs usunięte, termin migracji minął w maju).
Powstała własna warstwa tożsamości na viem z **weryfikacją w przód**: nazwa musi rozwiązywać się
z powrotem na ten sam adres, inaczej każdy wyświetlałby cudzy Basename. Wynik identyczny z OnchainKit
na prawdziwych adresach. **Najważniejsze:** OnchainKit raportował `success` po wejściu transakcji
na łańcuch, więc **cofnięta transakcja mogła zapisać tip, który nigdy nie doszedł**. Teraz
`receipt.status === 'reverted'` to błąd.
> **Dlaczego to ciekawe:** migracja z wygaszonej biblioteki wyciągnęła błąd, który przez cały ten czas
> zapisywał do bazy nieistniejące płatności.

### 6.6. `as TipNetwork` groziło błędem 500 na każdym paragonie z World Chain i BaseCamp
W bazie żyją dwa słowniki nazw sieci naraz (`worldchain` vs `world`, `basecamp` vs `camp`).
Rzutowanie uciszało TypeScript dokładnie tam, gdzie ostrzegał słusznie: `NETWORKS['worldchain']`
to `undefined`, a odczyt `.explorerUrl` wywracał **komponent serwerowy**, czyli cały błąd 500 zamiast
strony. Zamiast rzutowania jest `resolveTipNetwork()` z jawną mapą aliasów.
> **Dlaczego to ciekawe:** przy okazji znalazła się **druga kopia mapy eksplorerów** na stronie Paid,
> rozjechana z konfiguracją (`basecamp` wskazywał na `camp.cloud.blockscout.com`).

### 6.7. `cookieToInitialState` w root layoucie kasował prerender **całego serwisu**
46 stron statycznych → 2. Wykryte przez równoległą sesję i wycofane.
> **Dlaczego to ciekawe:** jedna linijka w layoucie potrafi wyłączyć generowanie statyczne całej aplikacji.

### 6.8. `VERCEL_FORCE_NO_BUILD_CACHE` wymuszał zimny build przy każdym deployu
Był w `vercel.json` **oraz** w dashboardzie. Po wyjęciu flagi plik był pusty, więc został usunięty.
Build lokalny przy okazji: 125 → **101 s** (`webpackBuildWorker` + `optimizePackageImports` dla
6 pakietów z barrel files, które faktycznie są w repo).
> **Dlaczego to ciekawe:** największy pojedynczy zysk w tej zmianie dotyczy CI, a nie lokalnego builda —
> i był to jeden wpis w konfiguracji.

### 6.9. `date-fns` był pakietem-duchem
Importowany w `PostList.tsx` i `RecentTips.tsx`, **nieobecny w `package.json`**. Działał wyłącznie
dlatego, że ciągnęła go tranzytywnie inna zależność; dowolna zmiana drzewa zależności wywaliłaby build.
Skan całego repo: to był jedyny taki przypadek.
> **Dlaczego to ciekawe:** deploy z czystego checkoutu mógł nie wstać z powodu importu, który działał
> lokalnie od miesięcy.

### 6.10. Tokeny shadcn były zmapowane w trzech miejscach na dwadzieścia — i to w błędnej formie
`app/globals.css` miał komplet 20 zmiennych, a `tailwind.config.ts` mapował trzy, w postaci `var(--x)`
zamiast `hsl(var(--x))`, mimo że zmienne są trójkami HSL. **15 żywych komponentów renderowało się
z martwymi klasami** (`bg-popover`, `text-muted-foreground`, `ring-ring`, `bg-card`…).
> **Dlaczego to ciekawe:** zweryfikowane w zbudowanym CSS, nie w konfiguracji — `.bg-popover`
> i `@keyframes enter` faktycznie są teraz w arkuszu.

### 6.11. Osiem konektorów portfela, każdy z własną ikoną
Base Account, Coinbase Wallet, MetaMask, WalletConnect, Safe, Gemini, Farcaster + portfele wykryte
przez EIP-6963 (Rabby, Phantom, Brave, OKX…), które ogłaszają własną ikonę same. Ogólny wpis
„Browser wallet" chowa się, gdy takie portfele są.
> **Dlaczego to ciekawe:** przy dodawaniu Coinbase Wallet złapana została regresja — przycisk
> Base Account szukał konektora po `id === 'coinbaseWallet'` i działał tylko dlatego, że **takiego
> konektora w configu nie było**. Po dodaniu otwierałby zły portfel.

### 6.12. Komunikaty błędów portfela mówią, **co zrobić**
Punktem wyjścia był realny przypadek: użytkownik zobaczył `nonce too high: address 0x… tx: 2 state: 1`
i nie miał jak wywnioskować, że to rozjazd licznika w MetaMasku po wdrożeniu kontraktu z hardhata
tym samym adresem.
> **Dlaczego to ciekawe:** sprawdzone na łańcuchu, że to **nie jest błąd aplikacji** —
> `getTransactionCount` zwracał 1, a MetaMask wysłał 2.

---

## 7. Co dalej

### 7.1. Ask jako realna funkcja — pętla domknięta
Model danych (`app/utils/asks/types.ts`, `asks.ts`): pytanie, budżet, miejsca, termin, liczniki,
resolve rate. Domknięte jest też wszystko wokół: kompozytor, zapieczętowane odpowiedzi, przyjmowanie
(`/api/asks/[id]/accept`, które **sprawdza hash na łańcuchu**, a nie wierzy klientowi na słowo)
i rozstrzygnięcie (`/api/asks/[id]/resolve`). Wszystko na `/asks`. **Czego dalej nie ma:**
odpowiadania bez wychodzenia z feedu. Pas otwartych Asków nad postami już jest (`FeedAskRail`),
ale jego przycisk prowadzi na `/asks` i dopiero tam się pisze, otwiera i rozstrzyga.

### 7.2. Escrow **istnieje** — i dokładnie tyle, ile istnieje
Manifest mówił *„fund it once in USDC"* w czasie teraźniejszym, kiedy kontraktu nie było. Teraz jest:
`AskEscrow` na Base mainnet, `0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340`, źródło zweryfikowane,
bez `owner`, bez pauzy, bez upgrade'u i bez funkcji ratunkowej. Ścieżka zakładania blokuje budżet
**przed** zapisem dokumentu — Ask bez pokrycia nie powstaje.

Cztery zastrzeżenia, bez których to zdanie robi się reklamą:
- **To wybór autora, nie właściwość produktu.** `funding: 'on-resolve'` żyje dalej i nie blokuje
  niczego. Pole w modelu mówi wprost, który to wariant — po to tam jest.
- **Opłata 2,5% leci wyłącznie od pieniędzy wracających do autora** (niewypełnione miejsca przy
  rozstrzygnięciu po terminie albo cały budżet po wygaśnięciu). Odpowiadający dostaje pełne
  `perAnswer`, nigdy pomniejszone.
- **Zwrot po wygaśnięciu ma już i kontrakt, i interfejs** — przycisk jest na `/money`
  (`handleRecover` → `settleExpiredAsk`). Czego nie ma: **zapisu w bazie**. Nic nie ustawia Aska na
  wygasły, więc po zwrocie budżetu dokument dalej mówi o sobie „otwarty". I noga wygaśnięcia dalej
  nie przeszła na żadnej prawdziwej sieci — wymaga terminu + 48h, dowodem jest test jednostkowy.
- **Ścieżka z przeglądarki nie została przejechana na mainnecie.** Pełny cykl pieniądza przeszedł
  dwa razy na Base Sepolii prawdziwym USDC, ale skryptem z node — to dowód kontraktu, nie klienta.
- **Przez kontrakt na mainnecie nie przeszedł NIKT.** `eth_getLogs` od bloku wdrożenia 49635587:
  pusto. `balanceOf(USDC)` = 0. To jest mocniejsze zdanie niż „nie z przeglądarki" i to ono ma
  stać w każdym tekście dla użytkownika. Escrow jest **działającym kontraktem bez ruchu**, nie
  działającym rynkiem.

### 7.3. x402 dla agentów — pierwsza prawdziwa płatność przeszła
`@x402/next` 2.21 wpięty (CAIP-2, `PAYMENT-SIGNATURE`), settlement odpala się wyłącznie przy
statusie < 400, więc agent nie płaci za błąd walidacji ani za nieudany zapis. Egzekwowanie jest
**włączone**: `X402_PAY_TO_ADDRESS` ustawiony, a `POST /api/asks` bez podpisu oddaje 402 z ceną.

**Co dokładnie przeszło.** Jeden przebieg `scripts/x402PayAsk.mjs`: 402 z wymaganiami → podpis
EIP-3009 → ponowienie z `PAYMENT-SIGNATURE` → **201** z `identityVia: "x402"`. Na łańcuchu
(Robinhood Chain, `eip155:4663`, USDG `0x5fc5360D…`, 6 miejsc) płacący `0xD4885A5a…` stracił
10 000 jednostek, odbiorca `0xF1fa2002…` dostał 10 000. Czyli **0,01 USDG**. Płacący **nie płacił
gazu** — na tym polega EIP-3009, transakcję wysłał facilitator (`https://x402.primer.systems`).

**Czego to NIE dowodzi, i nie wolno tego napisać inaczej:** jeden przebieg, jeden cent, dwa
**nasze** adresy. To dowód, że handshake i rozliczenie działają, nie dowód ruchu. Klucz podpisujący
facilitatora na 4663 miał przy sprawdzeniu 0,000273 ETH i **19 transakcji** w całej historii tego
łańcucha; jego `/stats` podaje 27 tys. rozliczeń, ale to suma po wszystkich łańcuchach.

**Otwarte:** ta sama trasa na **Base w USDC** — gałąź CDP jest w kodzie i wchodzi się w nią dwiema
zmiennymi środowiskowymi, ale nie przeszedł przez nią ani jeden cent. Dalej otwarte też:
`@x402/next` deklaruje peer `next >= 16.2.6`, a projekt stoi na 14.2.35 (importuje wyłącznie
z `next/server`, więc działa — ale to zgodność sprawdzona, nie zadeklarowana).

### 7.4. Test falsyfikujący kierunek — przed pisaniem backendu Aska
Największe założenie nie dotyczy agentów, tylko tego, **czy istnieje człowiek gotowy zapłacić realne
pieniądze za odpowiedź od obcych ludzi w feedzie**. Zero inżynierii, jeden tydzień: 20 ręcznych Asków
w obecnym feedzie jako zwykłe posty, płatność przez istniejące tipy. Mierzone: odsetek zleceń
z ≥3 użytecznymi odpowiedziami w 24 h, czy odpowiedź była warta kwoty w ocenie pytającego, ilu
pytających wraca po drugie zlecenie z własnymi pieniędzmi.
**Próg: 70% / „tak" w większości / ≥5 powracających.** Poniżej progu kierunek pada.

### 7.5. Czego nie zrobimy bez zgody
Test end-to-end nowej ścieżki zapisu tipa wymaga wysłania **prawdziwej płatności** przez Base Pay.
Logika jest sprawdzona na produkcyjnych danych (17/17), ale sam przelew przez nią nie przeszedł.

### 7.6. Blokady po stronie właściciela
`PRIVATE_KEY` nowego portfela **bez prefiksu `NEXT_PUBLIC_`** (z prefiksem klucz prywatny trafiłby
do publicznego bundle'a JS) · ETH na Robinhood Chain (most z **Ethereum mainnet**, nie z Base) ·
~~`X402_PAY_TO_ADDRESS`~~ **(zdjęte — adres ustawiony, egzekwowanie chodzi, patrz 7.3)** ·
`NEXT_PUBLIC_ROBINHOOD_RPC_URL` (publiczny jest rate-limited i oficjalnie
„not recommended for production") · rotacja `NEXT_PUBLIC_COINBASE_PRIVATE_KEY` (0 użyć w kodzie,
ale publiczny prefiks i 548 dni w env).

### 7.7. Praca inżynierska, która jeszcze przed nami
Zaostrzenie reguł Firestore na **istniejące** kolekcje (wymaga, żeby klienci faktycznie się podpisywali) ·
deploy kontraktu postów na Robinhood i uzupełnienie `NEXT_PUBLIC_ROBINHOOD_POST_CONTRACT` ·
38 brakujących lekcji MyClaw i mint certyfikatu SBT (świadomie odłożone — `certificateId` to dziś
paragon off-chain, nie dowód).

---

## 8. Stan dokumentacji — który plik obowiązuje

| Plik | Data | Status |
|---|---|---|
| **`AUDYT.md`** | **6 sierpnia 2026** | **AKTUALNY.** Jedyny obowiązujący dziennik stanu — teza produktu, co zrobione, co w toku, co blokuje i po czyjej stronie, znane ograniczenia i zasady pracy w repo. Przy rozjeździe z pozostałymi plikami **ten ma rację**. |
| `POSTY-SOCIAL.md` | 6 sierpnia 2026 | Ten plik. Materiał do publikacji zebrany z git loga i `AUDYT.md`; nie jest dokumentem stanu i nie zastępuje `AUDYT.md`. |
| `STATUS.md` | 5 sierpnia 2026 | **HISTORYCZNY.** Rozjechał się w kilku miejscach: mówi „Robinhood Chain — ósma sieć" (jest siódma), wymienia jako otwarte ograniczenia już zamknięte (`PremiumGate` jako publiczny paywall, brak UI treści premium w kompozytorze, brak limitu podejść do egzaminu) i czeka na merge PR #16, który poszedł 5 sierpnia. |
| `REDEFINICJA.md` | 5 sierpnia 2026 | **HISTORYCZNY.** Plan produktowy sprzed decyzji o własnym rejestrze agentów. Wartościowy jako zapis **dlaczego** zmieniliśmy kierunek (Base porzuciło social, rynek creator coins, x402 rośnie) — ale jego tabela stanu i lista otwartych pytań są nieaktualne. |
| `FALE-WYKONANE.md` | 4 sierpnia 2026 | **HISTORYCZNY.** Raport z wykonania fal A–E: 290 usuniętych plików, 22 149 linii, `public/` 71 → 22 MB. Wykonane w całości, streszczone w `AUDYT.md` §2. |
| `MARTWY-KOD.md` | 4 sierpnia 2026 | **HISTORYCZNY.** Inwentarz martwego kodu z metodą pomiaru (graf importów: 390 plików → 284 osiągalne, 106 nieosiągalnych). Kasacja wykonana, więc dokument opisuje stan sprzed niej. |

Żaden z tych plików nie został skasowany — mają wartość historyczną, bo pokazują, **jak zmieniała się
diagnoza**, a nie tylko jaka jest dzisiaj.
