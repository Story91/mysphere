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
