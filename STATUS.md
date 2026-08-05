# MySphere — status prac

Stan na 5 sierpnia 2026. Dokument roboczy: co jest zrobione, co w toku, co zostało.

Dokumenty powiązane: [`AUDYT.md`](AUDYT.md) (audyt wejściowy), [`MARTWY-KOD.md`](MARTWY-KOD.md) (inwentarz martwego kodu), [`FALE-WYKONANE.md`](FALE-WYKONANE.md) (raport z fal A–E), [`REDEFINICJA.md`](REDEFINICJA.md) (plan produktowy).

---

## ✅ ZROBIONE

### Audyt i sprzątanie

| | |
|---|---:|
| Usunięte pliki | **290** |
| Usunięty kod | **22 149 linii** |
| `public/` | 71 MB → **22 MB** |
| Artefakty Hardhata wyjęte z gita | 6,5 MB |
| Zależności | 107 → **51** (devDeps 42 → 31) |

Metoda: graf importów od punktów wejścia App Routera, zweryfikowany brak dynamicznych importów ze zmienną.

### Naprawione błędy — zastane

- **Lazy loading feedu był wyłączony.** `expandedPosts ? ... : slice(...)` — mapa `{postId: bool}` jest zawsze truthy, więc `slice` nigdy nie działał i renderowały się wszystkie posty naraz. Stan okazał się przy tym całkowicie martwy.
- **Dropdown portfela lądował na dole strony** na desktopie — klasy z `!important` biły inline'owe style Floating UI.
- **`Add funds` był martwy dla EOA** — OnchainKit wygasza go bez `sessionToken`.
- **`vendor/kya` nie było w repo**, a `package.json` wskazuje `file:./vendor/kya` — deploy z czystego checkoutu by nie wstał.
- **`date-fns` był pakietem-duchem** — importowany, niezadeklarowany.
- **Tokeny shadcn niezmapowane** w Tailwindzie — 15 żywych komponentów z martwymi klasami.
- **`/profile`** — link w czacie do trasy, która nigdy nie istniała.
- **`VERCEL_FORCE_NO_BUILD_CACHE`** wymuszał zimny build przy każdym deployu (był w `vercel.json` **oraz** w dashboardzie).

### Naprawione błędy — wprowadzone przeze mnie i złapane

Zapisane, bo pokazują, czego build nie weryfikuje:

- **Hook za wczesnym `return`** — `handlePinPending` zamieniony na `useCallback` stał się hookiem warunkowym. Zgłoszone przez użytkownika.
- **`cookieToInitialState` w root layoucie kasował prerender całego serwisu** — 46 stron statycznych → 2. Wykryte przez równoległą sesję.
- **Skrypt `prebuild` w katalogu wykluczonym przez `.vercelignore`** — wywalał deploy. Widoczne dopiero przy realnym deployu.
- **Ciemna powierzchnia dropdownu przykryta tłem OnchainKit** — style szły na zewnętrzny div portalu zamiast na `classNames.container`. Zgłoszone przez użytkownika.
- **`next dev --turbo`** — Turbopack ignoruje funkcję `webpack()` z configu, przez co padały polyfille i SDK portfeli.

### Wydajność

| Obszar | Efekt |
|---|---|
| Lista 50 znajomych | 100 → **3** zapytania |
| Feed 25 postów, statystyki tipów | 25 → **1** |
| Status obserwowania autorów | N → **1** |
| Mount feedu (`useSocial`) | ~150 → **~1** odczyt |
| `getActiveUsers` na starcie | 3 → **1** |
| Bundle `/basechat` | 885 → **857 kB** |
| Build lokalny | 125 → **101 s** |

Wycięte źródła janku: `MutationObserver` skanujący cały dokument w pętli oraz odtwarzacz audio re-renderujący feed 4–60×/s.

**`ethers` całkowicie usunięty z klienckiego bundle'a** — `grep "from 'ethers'"` w `app/` daje 0 trafień.

### Architektura

- **Root layout jako komponent serwerowy**, koniec globalnego `ClientOnly`. Metadane przez Metadata API — crawlery i podgląd miniappki widzą je w HTML.
- **Fundament SIWE**: `/api/auth/{nonce,verify,session,logout}`, sesja HMAC bez nowych zależności, weryfikacja przez `publicClient.verifyMessage` (obsługa ERC-6492 dla smart walletów). Sesja **2 h z rollowaniem**.
- **Connector `baseAccount`** zamiast wygaszanego `coinbaseWallet({smartWalletOnly})`.
- **Migracja Farcastera** na `@farcaster/miniapp-wagmi-connector`, manifest `version: "1"` + `fc:miniapp`.

### Produkt

- **9 modułów wyłączonych** przekierowaniami z jednej listy (`config/routeStatus.js`). Kod nietknięty, powrót to usunięcie jednej pozycji.
- **MySphere = BaseChat** — usunięty sztuczny podział, `/` przekierowuje serwerowo.
- **`/re-definition`** — strona dla użytkownika: rejestr modułów czytany z tej samej konfiguracji co przekierowania, uzasadnienie zmiany kierunku, praktyczne przewodniki. Podpięta do nawigacji i do `/Docs` jako „User Guide".

### Faza 0 — fundament ✅

**0.1 — OnchainKit usunięty całkowicie.** Base wygasiło go 19 marca 2026; termin migracji minął w maju.

- Własna warstwa tożsamości na viem: `getName`/`getAvatar` z **weryfikacją w przód** (nazwa musi rozwiązywać się z powrotem na ten sam adres — bez tego każdy mógłby wyświetlać cudzy Basename), hooki `useName`/`useAvatar`, komponenty `Avatar`/`Name`/`Address`/`Identity`/`IdentityCard`
- Zweryfikowane na prawdziwym adresie, **wynik identyczny z OnchainKit**: `getName(base)` → `story91.base.eth`, `getName(vitalik)` → `vitalik.eth`, losowy adres → `null`
- Własna warstwa portfela: `ConnectModal` (lista konektorów prosto z wagmi) + `WalletButton` (menu na własnym `absolute`, koniec z portalem Floating UI)
- `TipButton` na `useSendTransaction` + `useWaitForTransactionReceipt`. **Przy okazji naprawiony realny błąd:** OnchainKit raportował `success` po wejściu transakcji na łańcuch, więc **cofnięta transakcja mogła zapisać tip, który nigdy nie doszedł**. Teraz `receipt.status === 'reverted'` to błąd.
- Widget Swap usunięty (jedyny konsument `/swap` i `/token`, oznaczony jako wycofany w planie)
- `grep -r "from '@coinbase/onchainkit'" app/` → **0 trafień**

**0.2 — zależności podbite.** `miniapp-sdk` 0.2.1→0.3.0, `miniapp-wagmi-connector` 1.1.0→**2.0.0** (major), `coins-sdk` 0.2.11→0.8.0. Zostajemy na wagmi 2.16.x, bo connector wymaga `@wagmi/core ^2.14`.

**0.3 — dual-mode.** Base App (od 9.04.2026 traktuje appki jak zwykłe strony) i Farcaster (nadal rozwija spec) rozdzielone strażnikiem `isInMiniApp()` z sekundowym timeoutem. `addFrame()` → `addMiniApp()`.

### Vercel

`AUTH_SESSION_SECRET` ustawiony w trzech środowiskach. Usunięte: `VERCEL_FORCE_NO_BUILD_CACHE`, `NODE_ENV` (nadpisywał wstrzyknięcie Vercela) i 5 martwych kluczy WalletConnect/Reown.

---

## 🔴 ZNALEZISKO, KTÓRE ZMIENIA PLAN

**KYA jako usługa nie istnieje.** Sprawdzone 5 sierpnia 2026:

```
kya-api.registr.ai      →  NXDOMAIN (brak rekordu DNS)
registr.ai              →  brak odpowiedzi
@registrai/kya          →  wycofany z npm
registrai-web.pages.dev →  żyje, ale spivotowało na oracle i atestacje
```

`vendor/kya/index.js` sam przyznaje w nagłówku, że jest **rekonstrukcją z `docs/KYA.md`**. `app/MyAgents/hooks/useAgents.ts` czyta wyłącznie z KYA i nie ma własnego magazynu.

Konsekwencja: odznaka agenta jest zbudowana i poprawna, ale **nie pokaże niczego, dopóki nie ma rejestru**. Szczegóły i propozycja kierunku w [`REDEFINICJA.md`](REDEFINICJA.md), pytanie 0.

## 🔄 W TOKU

Nic. Wszystkie zadania niewymagające decyzji właściciela są zamknięte.

## ⬜ ZOSTAŁO

### Faza 0 — fundament

| # | Co | Blokada |
|---|---|---|
| 0.4 | Reguły Firestore + dokończenie SIWE | **Potrzebny eksport reguł z konsoli Firebase** |

### Faza 1 — most agenty ↔ x402

| # | Co | Stan |
|---|---|---|
| 1.1 | x402 **v2** (`@x402/next` 2.21.0, CAIP-2, `PAYMENT-SIGNATURE`) | ✅ |
| 1.2 | Realna certyfikacja — 8 pytań/dyscyplinę, próg 70% | ✅ |
| 1.3 | Egzekwowanie płatności | ✅ kod gotowy, **czeka na `X402_PAY_TO_ADDRESS`** |
| 1.4 | Odznaka agent/człowiek w feedzie | ✅ kod gotowy, **czeka na rejestr agentów** |
| 1.5 | „Wynajmij agenta" w feedzie | ⬜ zablokowane przez 0.4 i decyzję o rejestrze |

**Dziury w certyfikacji, świadomie zostawione i opisane w odpowiedzi endpointu:** brak magazynu postępów per agent, więc nie ma limitu podejść — agent może powtarzać ten sam stały zestaw 8 pytań do skutku. `certificateId` to paragon off-chain, nie dowód; mint SBT niepodpięty.

### Faza 2 — pieniądz w social

| Co | Stan |
|---|---|
| Dynamiczne karty OG per post (`/post/[id]` + `opengraph-image`) | ✅ |
| Link „Share" w feedzie | ✅ |
| Subskrypcje przez x402 | ⬜ |
| Tip-to-unlock | ⬜ |

### Poza kodem — wymaga właściciela

1. **Eksport reguł Firestore** — blokuje 0.4, a przez to całą fazę 1.
2. **`NEXT_PUBLIC_COINBASE_PRIVATE_KEY`** — 0 użyć w kodzie, ale publiczny prefiks i 548 dni w env. Do rotacji i usunięcia.
3. **Automatyczny deploy z GitHuba nie działa od 166 dni.** Repo podłączone, ale nic się nie buduje. Do sprawdzenia: Settings → Git → Ignored Build Step / Production Branch. Do tego czasu każdy release wymaga ręcznego `vercel --prod`.
4. **NAJWAŻNIEJSZE: budujemy własny rejestr agentów, czy szukamy innego dostawcy?** KYA nie istnieje. Własny rejestr na Firestore reużywa całe istniejące UI i model reputacji. Ta decyzja determinuje sens fazy 1.
5. **`X402_PAY_TO_ADDRESS`** — bez niego płatności MyClaw nie są egzekwowane (endpointy działają za darmo). Przed produkcją: realny handshake 402 na Base Sepolia, bo `@x402/next` deklaruje peer `next >= 16.2.6`, a jesteśmy na 14.2.35.
6. **MyClaw Academy zostaje?** Certyfikacja jest już realna, więc akademia ma sens — ale dziury wyżej trzeba domknąć.

### Świadomie odrzucone

| Odrzucone | Powód |
|---|---|
| Auto-coin profilu, attention market, remix z rev-share | Rynek creator coins zawalił się w 2026 (ZORA −95%, Creator Rewards wygaszone w lutym) |
| „Stock Card" na tokenizowanych akcjach | Papiery **dłużne** emitenta z Jersey, tylko dla klientów Robinhood po KYC, wykluczone USA/Kanada/UK/Szwajcaria/ZEA |
| Mikro-predykcje na postach | Najwyższy wysiłek, wymaga oracle. Dopiero po działającej warstwie płatności |
| Pełne wydzielenie `PostComposer` | `React.memo` na `PostList` zdjął dominujący koszt; reszta to ~20 miejsc z `newPost` i realne ryzyko regresji |

---

## Znane ograniczenia

- **`/mycamp` renderuje statycznie tylko tło.** `useSearchParams()` na górze 2000-liniowego komponentu. Nie regresja (wcześniej `ClientOnly` nie renderował nic), ale widać „pop" treści.
- **Brak cookie-SSR dla wagmi.** Na Next 14 wyklucza się z prerenderem całego serwisu. Rozwiąże PPR z Next 15.
- **`/basechat` First Load 826 → 868 kB** po usunięciu OnchainKit, przy niezmienionym chunku współdzielonym. Warstwa tożsamości ciągnie tylko viem/react/react-query, więc to wygląda na przetasowanie chunków po usunięciu trasy `/swap`, nie na nowy kod. Do sprawdzenia.
- **Build bywa flaky na Windowsie** — `collect-build-traces` rzuca `UNKNOWN errno -4094` (blokada pliku, `@vercel/nft`). Powtórka przechodzi, ale w CI to potrafi wywalić deploy.
