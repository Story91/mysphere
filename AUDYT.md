# MySphere — gdzie jesteśmy i co robimy

**Ostatnia aktualizacja: 5 sierpnia 2026.**

To jest JEDYNY dokument, który trzeba przeczytać, żeby wiedzieć, na czym stoimy.
Powstał 4 sierpnia jako audyt wejściowy (8 równoległych agentów) i został przepisany
na dziennik pracy — poprzednia treść, czyli lista 42 poprawek wydajnościowych, mapa
logowania i kolejność fal, jest już wykonana i streszczona w sekcji 2.

Dokumenty pomocnicze, wszystkie starsze od tego:
[`STATUS.md`](STATUS.md) · [`FALE-WYKONANE.md`](FALE-WYKONANE.md) ·
[`MARTWY-KOD.md`](MARTWY-KOD.md) · [`REDEFINICJA.md`](REDEFINICJA.md).
Gdy się rozjadą — **ten plik ma rację.**

---

## 1. Czym jest ten produkt (jedno zdanie)

> MySphere przestaje być miejscem, w którym ludzie publikują, a staje się miejscem,
> w którym pieniądze z zewnątrz — coraz częściej maszynowe — kupują ludzki osąd,
> a jedyną walutą zaufania jest historia rozliczonych płatności.

Jednostką produktu przestaje być post, a staje się **post ze stawką**. Roboczo:
**Ask** — pytanie z budżetem, liczbą miejsc i terminem. Płaci człowiek (USDC na
Base) albo agent (x402). Odpowiedzi są zapieczętowane do rozstrzygnięcia.
Reputacja obu stron bije się wyłącznie z rozliczonych płatności i jest
nietransferowalna, czyli niekupowalna.

### Dlaczego akurat to

| Fakt | Kiedy ustalone |
|---|---|
| Ponad 230 platform „wynajmij agenta”, realne wypłaty łącznie w setkach dolarów; jedna z największych ma **283 ukończone zadania w całej historii** | research własny, 5 sierpnia 2026 |
| Base **wygasiło własny eksperyment z onchain social** — Talk feed i Creator Rewards skasowane, pivot na trading, płatności i agentów | luty 2026 |
| Wzrost rynków predykcyjnych napędzają **podglądy linków pokazujące żywy stan**, nie treść pod nimi. Polymarket: rekord 425 mln USD dziennego wolumenu | 28 lutego 2026 |
| Kash zebrał 2 mln USD na wpięcie rynków predykcyjnych w feedy społecznościowe | 2026 |

Wniosek operacyjny, który steruje całą resztą tego dokumentu:
**nie budujemy kolejnego feedu — budujemy obiekty, które niosą sprawdzalną kwotę
i rozchodzą się same.**

### Świadomie odrzucone

| Odrzucone | Powód |
|---|---|
| Klon Moltverr / MoltJobs | Walka o zerowy popyt — patrz tabela wyżej |
| Klon Moltbooka (agent social) | Kategoria kupiona przez Metę, zero pieniędzy w mechanice, wchodzimy dwa lata po fakcie |
| Ticker Rooms na Robinhood Chain | 27 mln USD floatu, jeden produkt robi cały wolumen, **subsydium gazu wygasa końcem września 2026**. Feature na dwa tygodnie, nie kierunek |
| Feed realtime na Flashblocks / `pendingLogs` | Szczegół implementacyjny, nie powód, żeby otworzyć aplikację. Wymaga płatnego providera z WS |
| Auto-coin profilu, attention market, remix z rev-share | Rynek creator coins zawalił się w 2026 (ZORA −95%) |
| „Stock Card” na tokenizowanych akcjach | Papiery dłużne emitenta z Jersey, tylko dla klientów Robinhood po KYC, wykluczone USA/Kanada/UK/Szwajcaria/ZEA |
| KYA jako zewnętrzna usługa | **Nie istnieje.** `kya-api.registr.ai` → NXDOMAIN, `@registrai/kya` wycofany z npm, Registrai spivotowało. Mamy własny rejestr na Firestore |

---

## 2. Co jest ZROBIONE

### Wiralowość — obiekty, które da się wysłać

| Co | Gdzie |
|---|---|
| **Paragon za tipa** `/tip/[txHash]` z własną kartą OG — bohaterem obrazka jest kwota | `app/tip/[txHash]/` |
| Karta OG posta pokazuje **sumę tipów, na zielono i przed lajkami** | `app/post/[id]/opengraph-image.tsx` |
| **Publiczny profil** `/u/[address]` — Basename, policzone posty/lajki/tipy, własna karta OG | `app/u/[address]/` |
| Post ma własny URL z metadanymi i kartą OG | `app/post/[id]/` |
| `sitemap.xml` (500 ostatnich postów) + `robots.txt` + `llms.txt` | `app/sitemap.ts`, `app/robots.ts`, `public/llms.txt` |
| **Ranking** `/leaderboard` — kto dostał zapłacone w 7 dni, z kartą OG niosącą 3 pierwsze nazwiska | `app/leaderboard/` |
| Link „Public profile” i kopiowanie linku w panelu profilu | `BuilderProfile.tsx` |

Paragony celowo **nie** trafiają do sitemapy — są niezmienne i istnieją po to,
żeby ktoś je wysłał, a nie żeby crawler je zindeksował.

### Bezpieczeństwo — trzy realne dziury zamknięte

1. **Treść premium była publiczna.** `premiumContent` siedziało w dokumencie posta,
   a feed czyta posty klienckim SDK — każdy widział płatny tekst w odpowiedzi
   sieciowej bez płacenia. Teraz mieszka w kolekcji `premiumContent` z regułą
   `allow read, write: if false`; wydaje ją `GET /api/premium` po sprawdzeniu
   podpisanej sesji **i** rekordu odblokowania.
2. **Łańcuch tożsamości kończył się na jednym ekranie.** SIWE było wpięte tylko w
   prelogin; kto podłączył portfel z nawigacji, omijał go całkowicie. Doszedł
   `SessionPrompt` oraz mintowanie tokenu Firebase w `/api/auth/session` — bez tego
   `request.auth` wracało do `null` po każdym F5.
3. **x402 zamrażał decyzję na całe życie instancji.** Ciepła instancja uruchomiona
   przed ustawieniem `X402_PAY_TO_ADDRESS` serwowałaby płatne zasoby za darmo do
   końca życia — czyli dokładnie wtedy, gdy ten adres wreszcie ustawimy. Teraz env
   czytany przy każdym żądaniu, a cena może być funkcją żądania (wymóg Aska).

Wcześniej: cała baza Firestore była otwarta regułą `allow read, write: if true`
od 17 stycznia 2025 — **19 miesięcy**. Reguły zaostrzone i opublikowane 5 sierpnia.

### Sieci i infrastruktura

- **Robinhood Chain (ósma sieć).** `eth_chainId` → `0x1237` = 4663, potwierdzony na
  żywym RPC przed napisaniem configu. Testnet 46630. **Token natywny: ETH** (18
  miejsc). To **L2 Arbitrum, którego rodzicem jest Ethereum mainnet, nie Base** —
  ETH bridguje się przez `portal.arbitrum.io/bridge`. Gaz ~0,02 gwei.
  Tipy działają od razu (transfer natywny), postowanie czeka na kontrakt.
- **OnchainKit usunięty całkowicie** (Base wygasiło go 19 marca 2026). Własna
  warstwa tożsamości na viem z weryfikacją w przód: nazwa musi rozwiązywać się
  z powrotem na ten sam adres, inaczej każdy wyświetlałby cudzy Basename.
- Root layout jako komponent serwerowy, metadane przez Metadata API.
- Connector `baseAccount`, migracja Farcastera na `@farcaster/miniapp-wagmi-connector`.
- SIWE: `/api/auth/{nonce,verify,session,logout}`, weryfikacja przez
  `publicClient.verifyMessage` (ERC-6492 dla smart walletów), sesja 2 h z rollowaniem.
- **Osiem konektorów portfela**: Base Account, Coinbase Wallet, MetaMask,
  WalletConnect, Safe, Gemini, Farcaster + portfele wykryte przez EIP-6963
  (Rabby, Phantom, Brave, OKX…), każdy z własną ikoną. Przycisk nie mówi już
  „Sign In With Base”, bo to była nieprawda.
- **Portfel administracyjny**: `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e`.
  Klucz w `.env.local` jako `ADMIN_PRIVATE_KEY` (zweryfikowane, że wyprowadza się
  na ten adres), ten sam adres jako `X402_PAY_TO_ADDRESS`. `hardhat.config.ts`
  czyta go we wszystkich ośmiu sieciach.

### Sprzątanie i wydajność (fale 0–E, zakończone)

| | |
|---|---:|
| Usunięte pliki | **290** |
| Usunięty kod | **22 149 linii** |
| `public/` | 71 MB → **22 MB** |
| Zależności | 107 → **51** |
| Build lokalny | 125 → **101 s** |
| Lista 50 znajomych | 100 → **3** zapytania |
| Feed 25 postów, statystyki tipów | 25 → **1** |

Najpoważniejsze znalezisko: **lazy loading feedu był wyłączony** —
`expandedPosts ? ... : slice(...)`, a `expandedPosts` to mapa, więc zawsze truthy.
Renderowały się wszystkie posty naraz, a stan był całkowicie martwy. Drugie:
**OnchainKit raportował `success` po wejściu transakcji na łańcuch**, więc cofnięta
transakcja zapisywała tip, który nigdy nie doszedł.

---

## 2a. Druga tura porządków (5 sierpnia, wieczór)

Dwie tury po czterech agentów na rozłącznych zakresach plików, potem mój przegląd.
Łącznie **netto −2500 linii**, build przechodzi, `tsc --noEmit` = 0.

**`app/basechat/page.tsx` miał `@ts-nocheck` w pierwszej linii** — 4342 linie nigdy
nie sprawdzone przez kompilator. Po zdjęciu wyszedł jeden, za to poważny błąd:
**przycisk „PostCoin" nie może działać**, bo `@zoralabs/coins-sdk` 0.8.0 ma
dwuetapowe API, a kod woła stary podpis z trzema argumentami. Rozjazd wszedł
z podbiciem zależności i był niewidoczny właśnie przez `@ts-nocheck`. Świadomie
nie naprawiony — nowe API wymaga wyboru `currency` i `startingMarketCap`, czyli
decyzji produktowej.

**Duplikacja per łańcuch zlikwidowana.** 6 kopii przycisku postu, 6 kopii przycisku
komentarza i 5 kopii composera → trzy implementacje sterowane konfiguracją
(`app/basechat/chainPosting/`). Każdy łańcuch to teraz jeden plik konfigu, a nie
trzy skopiowane komponenty. To samo w feedzie: 36 ręcznych bloków `network ===`
→ jeden `NetworkBadge`.

**Cache feedu: dopisujemy zamiast kasować.** Post szedł do stanu Reacta, ale nie do
`localStorage`, więc powrót na zakładkę odtwarzał listę sprzed publikacji — stąd
zgłoszone „musiałem przeklikać i wrócić". Kasowanie całego cache'u naprawiłoby
objaw, ale kazałoby pobrać wszystkie listy od nowa; Firestore liczy za każdy
odczyt dokumentu. `prependPostToCache` daje ten sam efekt za zero odczytów.

**Daty z Firestore były zerowane.** Kolekcja `posts` trzyma `timestamp` w dwóch
postaciach (Timestamp z `serverTimestamp()` albo liczba). Czytniki serwerowe
sprawdzały `typeof === 'number'` i przy pierwszej wstawiały 0 — profile pokazywały
1970, sitemapa dawała crawlerom `lastModified` sprzed pół wieku. Nowy
`app/utils/firestoreTime.ts` obsługuje wszystkie postacie, przetestowany na 9
przypadkach.

**Znalezione i naprawione przy okazji:** `eth.llamarpc.com` przestał wysyłać CORS
(każdy odczyt z mainnetu padał — teraz `fallback()` na publicnode + ankr), salda
monet Zory czytane klientem aktualnej sieci zamiast Base, `SessionPrompt` znikał
w chwili kliknięcia „Sign", `<button>` zagnieżdżony w `<button>` w menu posta,
wyścigi w `RecentTips` i w ładowaniu feedu.

**Logo Robinhooda** — `/logotypy/robinhood.svg` był 449-bajtową atrapą (zielony
kwadrat z kreską), nie logo. Zastąpiony przez `/robin.webp`, atrapa skasowana.
Selektor sieci pokazuje teraz same znaki bez podpisów — siedem nazw rozciągało
rząd na całą szerokość kompozytora.

## 2c. Kierunek wizualny Soft Social (5–6 sierpnia 2026)

Projekt właściciela z Claude Design (wariant **1b Soft Social**) wdrożony w kodzie.
Tokeny **wyciągnięte z pliku projektu**, nie dobrane na oko — każda wartość tam
występuje i policzyłem wystąpienia: fiolet `#7C6BDA` (23), tusz `#2E2A44` (19),
lawenda `#EEE9FB` (15), pomarańcz `#F5A73B` (9), cień kart (8).

**Fundament:** 16 zmiennych kolorów + 3 cienie (wszystkie **fioletowe**, nie
czarne — czarny na lawendzie wygląda jak brud), Baloo 2 + Nunito przez
`next/font`, mapowanie w Tailwindzie (`bg-soft-surface`, `rounded-card`,
`shadow-card`, `font-soft-display`).

**Warstwa ruchu** (ze skilla `emil-design-eng`): mocniejsze krzywe zamiast
wbudowanych, cztery czasy 140–280 ms, **`ease-in` celowo nieobecny** — zaczyna
wolno, czyli opóźnia ruch dokładnie wtedy, gdy użytkownik patrzy najuważniej.
`prefers-reduced-motion` zeruje ruch, zostawiając kolor i przezroczystość.

**Wdrożone:** `/basechat` (mobile: pasek sieci jako „stories", zakładki-pigułki,
zwinięty kompozytor; desktop: przemalowana karta postu, nawigacja, panele boczne),
`/leaderboard`, `/re-definition`, `/basechat/soft`.

### ZASADA, KTÓRA MUSI ZOSTAĆ

**Przemalowujemy, nigdy nie podmieniamy.**

Wyszła z realnej regresji: podmieniłem na telefonie karty postów na własne,
ładniejsze — i feed stracił naraz tipy, przypinanie, przyciski transakcji per
sieć, treść premium, odznaki agentów i muzykę. Zgłoszenie brzmiało „zniknęło
dużo ikonek" i było trafne co do joty.

Wygląd wolno wymieniać tam, gdzie **nic za sobą nie ciągnie**: tło, pasek sieci,
zakładki, pigułka kompozytora. Karta postu ma logikę sześciu funkcji naraz —
przepisanie jej wyglądu musi iść **razem** z przeniesieniem tych funkcji, a nie
zamiast nich. Weryfikacja po przemalowaniu: liczba handlerów przed i po
(`PostList`: 26 → 26).

## 2d. Wiralowy kąsek: oś czasu pieniędzy

Każdy produkt społecznościowy ma feed tego, co ludzie **powiedzieli**. Żaden nie
ma feedu tego, co ludzie sobie **zapłacili**.

`/leaderboard` (Paid) ma dwie sekcje odpowiadające na różne pytania:
**„As it lands"** — strumień przelewów w kolejności, w jakiej wpadały, każdy
z hashem i linkiem do eksploratora (*„czy tu coś żyje"*); **„Who got paid most"**
— suma w oknie (*„komu ufać"*). Pozycja bez hasha jest odfiltrowana — bez dowodu
ta linia nie ma po co istnieć.

Nie da się tego skopiować bez przeniesienia płatności na łańcuch.

### Naprawione przy okazji

- **Most Active pokazywało 12 osób** — nie było ich 12, tyle pobieraliśmy
  (`1 × pageSize` = 10 + 20% zapasu). Funkcja raportowała przy tym `totalPages: 5`
  i `totalUsers: 50`, mając w ręku 12 rekordów.
- **Sesja SIWE żyła 2 godziny** — prośba o podpis co dwie godziny uczy klikać
  „podpisz" bez czytania. Teraz 7 dni z rollowaniem.
- **Sekcje przeniesione do Profilu** (wzorem Twittera) — cztery z pięciu pozycji
  na feedzie to wcale nie feed, tylko osobne widoki.

## 2b. NIEROZWIĄZANE — logowanie SIWE nie działa na produkcji

**Objaw:** na `mysphere.fun` trasy `/api/auth/verify/`, `/api/auth/session/` i
`/api/premium/` zwracają **500 w postaci strony HTML**. `/api/auth/nonce/` — jedyna
z nich nieimportująca `firebaseAdmin.ts` — zwraca 200. Użytkownik widzi
„Server sign-in is not configured yet".

**Czego już nie jest to warte sprawdzania (sprawdzone, wykluczone):**

| Hipoteza | Wynik |
|---|---|
| `gcp-metadata` w ręcznych `externals` wypychał `firebase-admin` poza ślad plików | **Obalone.** Porównałem `.nft.json` przed i po zmianie — oba warianty zawierają komplet (50 plików `firebase-admin`, 24 `gcp-metadata`) |
| Brak pakietu `server-only` | **Obalone.** Next dostarcza własny shim w `dist/compiled/server-only` |
| Błąd w kodzie tras | **Obalone.** Build produkcyjny lokalnie + `next start`: nonce 200, session 200, verify 405, premium 400 — wszystko poprawnie |
| `AUTH_SESSION_SECRET` / `GOOGLE_CREDENTIALS` lokalnie | Oba obecne w `.env.local` |

**Co zostaje do sprawdzenia:** różnica środowiskowa po stronie Vercela. Bez logów
funkcji nie da się tego ustalić zdalnie — potrzebny `npm i -g vercel` i
`vercel logs`, albo wklejenie logu funkcji z dashboardu.

**Co zrobione mimo braku diagnozy:** `cert()` i `initializeApp()` w
`firebaseAdmin.ts` stały poza jakimkolwiek `try` — wyjątek leciał przez
`mintFirebaseToken` do wołającego i przewracał całą trasę uwierzytelnienia.
Teraz błąd konfiguracji Firebase wyłącza tylko tokeny Firebase, a logowanie
działa dalej. To usztywnienie, **nie** potwierdzona naprawa.

## 3. Co jest W TOKU

**PR #17** — treść premium + x402, czeka na merge.
Po merge'u trzeba **opublikować `firestore.rules` z konsoli** — doszła sekcja
`premiumContent`, reszta pliku bez zmian.

---

## 4. Co ZOSTAŁO — i co blokuje

### Blokady po stronie właściciela

| # | Co | Po co |
|---|---|---|
| 1 | **`PRIVATE_KEY`** nowego portfela w `.env.local`, **bez prefiksu `NEXT_PUBLIC_`** | Deploy kontraktu postów. Z prefiksem klucz prywatny trafiłby do publicznego bundle'a JS |
| 2 | ETH na Robinhood Chain dla tego portfela | Gaz. Most z **Ethereum mainnet**, nie z Base |
| 3 | **`X402_PAY_TO_ADDRESS`** | Włącza egzekwowanie płatności x402 |
| 4 | `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Publiczny RPC jest rate-limited i oficjalnie „not recommended for production” |
| 5 | Rotacja **`NEXT_PUBLIC_COINBASE_PRIVATE_KEY`** | 0 użyć w kodzie, ale publiczny prefiks i 548 dni w env |

### Praca inżynierska

| Co | Stan |
|---|---|
| **Test falsyfikujący kierunek** — 20 ręcznych Asków przez istniejące tipy, zanim powstanie backend | ⬜ patrz sekcja 5 |
| Backend Aska: `POST /api/asks` z dwiema ścieżkami płatności, zapieczętowane odpowiedzi, wypłata USDC | ⬜ |
| Realny handshake 402 na Base Sepolia (`eip155:84532`) — nikt nie przeszedł tej ścieżki end-to-end na Next 14.2.35 | ⬜ **przed produkcją** |
| Zaostrzenie reguł Firestore na istniejące kolekcje (wymaga, żeby klienci faktycznie podpisywali) | ⬜ |
| Deploy kontraktu na Robinhood + `NEXT_PUBLIC_ROBINHOOD_POST_CONTRACT` | ⬜ blokada #1 i #2 |
| 38 brakujących lekcji MyClaw, mint certyfikatu SBT | ⬜ świadomie odłożone |

---

## 5. Test, który trzeba zrobić PRZED pisaniem Aska

Największe założenie nie dotyczy agentów. Dotyczy tego, czy **istnieje człowiek
gotowy zapłacić realne pieniądze za odpowiedź od obcych ludzi w feedzie**. Strona
maszynowa daje unikalność i historię dla Base, ale pierwsze pieniądze przyjdą od
ludzi — i strony maszynowej nie da się zbootstrapować wcześniej.

**Zero inżynierii, jeden tydzień:** wystaw ręcznie 20 Asków w obecnym feedzie jako
zwykłe posty, płać ręcznie przez istniejące tipy. Paragony już działają, więc każda
wypłata ma dowód do wysłania — czyli test przy okazji sprawdza mechanikę wiralową.

Mierz trzy rzeczy:

1. odsetek zleceń z **≥3 użytecznymi odpowiedziami w 24 h**,
2. czy odpowiedź była warta zapłaconej kwoty w ocenie pytającego,
3. ilu pytających wraca po **drugie zlecenie z własnymi pieniędzmi**.

**Próg: 70% / „tak” w większości / ≥5 powracających.** Poniżej progu kierunek pada
i trzeba mieć odwagę to przyjąć.

---

## 6. Znane ograniczenia (świadome, nie zapomniane)

- **`PremiumGate` to paywall, nie szyfrowanie end-to-end.** Treść jest już poza
  feedem, ale na serwerze leży zwykłym tekstem. Autor widzi to napisane wprost.
- **Posty sprzed przeniesienia treści** mają ją w dokumencie i jest publiczna —
  nic tego nie cofnie. Edycja przez autora kasuje pole.
- **Reguły nie odróżniają serwera od przeglądarki** poza kolekcją `premiumContent`.
  Trasy `/api/unlock` piszą tym samym klienckim SDK.
- **Brak cookie-SSR dla wagmi.** Na Next 14 wyklucza się z prerenderem całego
  serwisu — sprawdzone: 46 stron statycznych spadło do 2. Rozwiąże PPR z Next 15.
- **`next dev --turbo` nie działa** — Turbopack ignoruje funkcję `webpack()` z
  configu, przez co padają polyfille i SDK portfeli.
- **Build bywa flaky na Windowsie** — `collect-build-traces` rzuca `UNKNOWN errno
  -4094`. Powtórka przechodzi, ale w CI potrafi wywalić deploy.
- **`@x402/next` 2.21 deklaruje peer `next >= 16.2.6`**, a projekt stoi na 14.2.35.
  Sprawdzone, że importuje wyłącznie z `next/server`, ale pełnej ścieżki 402 nikt
  nie przeszedł na tej kombinacji.
- **`/mycamp` renderuje statycznie tylko tło** — `useSearchParams()` na górze
  2000-liniowego komponentu.

---

## 7. Zasady pracy w tym repo

- Po każdej zmianie w TS/TSX: `npx tsc --noEmit` (~20 s). Pełny `npm run build`
  tylko przed commitem grupy zmian — buildy po każdej edycji były realną stratą
  czasu w sierpniu.
- Build kontrolny do izolowanego katalogu: `NEXT_DIST_DIR=.next-verify npm run build`.
  Bez izolacji dev server nadpisuje `.next` i wszystkie trasy zwracają 500.
- Zmiany czysto wizualne build **nie** weryfikuje wcale — potrzebne oko w przeglądarce.
- Dane o Base bierzemy z **basehub.org**, nie z pamięci modelu.
- `GOOGLE_CREDENTIALS` czytamy wyłącznie **w pamięci** (`app/utils/auth/firebaseAdmin.ts`).
  Klucz usługowy nigdy nie ląduje na dysku.
- `firestore.rules` nie zastępuje reguł z konsoli w całości — istniejące kolekcje
  żyją tylko tam. Wklejenie całego pliku zablokowałoby czat.
- Pliki źródłowe mają **CRLF**. Podmiany wieloliniowe skryptem po `\n` cicho nie
  trafiają — używać narzędzia do edycji albo operować na liniach.
