# MySphere — raport z wykonania fal (2026-08-04)

Realizacja `AUDYT.md` (fale A–D) + `MARTWY-KOD.md` (fale 0 i 0.5) + bezpieczna część fali E.

**Stan końcowy:** `npx tsc --noEmit` → 0 błędów. `npm run build` → ✓ Compiled successfully, 45/45 stron.
Po każdej fali robiony był build kontrolny.

---

## Fala 0 — kasacja martwego kodu

| | |
|---|---:|
| Usunięte pliki | **290** |
| Usunięty kod aplikacji | **22 149 linii** |
| Artefakty Hardhata wyjęte z gita | 46 plików, −6,5 MB |
| `public/` | 71 MB → **22 MB** |

- `.gitignore` przepisany: `/artifacts` → `**/artifacts/` (kotwica na roocie przepuszczała `app/basemorning/artifacts`).
- Skasowane śmieci z roota: `on`, `postcss.config.mjs`, `styles/globals.css`, `public/index.html`, zduplikowany `app/scripts/deploy-autonomous-wallet.ts`.
- 15 martwych tras API + endpointy debug/seed (`seed-firebase`, `debug-paid-pins`, `test-subgraph`, `camp/spotify/debug`, trasa demo `pinned-demo`).
- **Zostawione świadomie:** `public/nft-assets/` (ścieżki budowane w runtime), `ads.txt`, 14 skryptów deploy/test podpiętych pod `npm run contracts:*`.

---

## Fala A — szybkie zwycięstwa

| # | Co | Efekt |
|---|---|---|
| **25** | **BUG: lazy loading feedu był wyłączony** — `expandedPosts` to obiekt `{}` (zawsze truthy), więc `slice(0, displayLimit)` nigdy nie działał i renderowały się **wszystkie** posty naraz, każdy z własnym TipStats + LinkPreview + Avatar | Największa pojedyncza poprawka w całym audycie |
| 31 | `QueryClient` bez opcji → `staleTime: 60s`, `gcTime: 5min`, `refetchOnWindowFocus: false`, `retry: 1` | Powrót do zakładki nie refetchuje już wszystkich query po publicznych RPC |
| 1 | `PrivyProvider` wycięty z drzewa (zero użyć w repo) | −2 pakiety |
| 6 | OnchainKit CSS: render-blokujący `<link>` z unpkg → same-origin `/vendor/onchainkit.css` | Zero third-party DNS/TLS na krytycznej ścieżce |
| 7+37 | AdSense: `afterInteractive` w `<head>` → `lazyOnload` w body; usunięte 2 duplikaty (`basechat`, `mycamp`) | Nie konkuruje z hydracją |
| 16 | `viewportHeight` — stan nigdy nieczytany, setter w handlerze resize | Każdy resize to był pełny re-render za nic |
| 21 | Memoizacja wartości obu kontekstów theme (`providers.tsx`, `ThemeContext.tsx`) | |
| 22 | Martwy import `CoinGeckoMarqueeWidget` + pusty ruleset CSS | Plik widgetu skasowany |
| 24 | `body.wallet-not-connected div[role="dialog"]` łapał **każdy** dialog i nadpisywał `!important` pozycjonowanie cudzych modali → selektor zawężony do modala OnchainKit | |
| 32 | `useName` dla adresu `0x000...0` przy wylogowanym userze → `{ enabled: !!address }` | |
| 36 | `getNotificationsSummary`: 105 odczytów (fetch 100 + fetch 5) → **100** (`slice(0,5)`) | |
| 38 | 6 × `console.log` w module scope (`follows`, `friends`, `notifications`, `config` ×2, `hooks`) | |

> **Uwaga o #6:** import `@coinbase/onchainkit/styles.css` przez bundler jest **niemożliwy** — Tailwind odrzuca ten plik (`@layer base` bez `@tailwind base`). Rozwiązane skryptem `prebuild` kopiującym CSS do `public/vendor/`, co daje ten sam zysk (brak zewnętrznego hosta) bez walki z PostCSS.

---

## Fala B — izolacja re-renderów

| # | Co |
|---|---|
| **13** | **MutationObserver na całym `document.body`** w `Navigation.tsx` (67 linii) — obserwował childList+subtree i odpalał DWA pełne skany dokumentu (TreeWalker po wszystkich text nodach + `querySelectorAll('h1..h6,button,span,div')`) tylko po to, żeby przepisać `Sign up` → `Sign In With Base`. Marquee CoinGecko mutuje DOM bez przerwy, więc pętla chodziła non-stop. **Zastąpione natywnym propem `disconnectedLabel`** — 67 linii → 1 |
| **15** | **Audio player re-renderował feed 4–60×/s** — `timeupdate` → `setCurrentTime` w stanie `PostList`. Stan wyniesiony do `audioPlayerStore.ts` (poza Reactem) + `PostAudioPlayer` z `useSyncExternalStore`. Teraz re-renderuje się **wyłącznie grająca karta** |
| 14/39 | `PostList` → `React.memo`, `handlePinPending` → `useCallback` (jedyny niestabilny prop) |
| 17 | `sortedPosts`/`nonPinnedPosts` → `useMemo`; observer infinite-scrolla nie jest już odtwarzany przy każdej zmianie postów (świeża długość przez ref) |
| 18 | `@import` Google Fonts wewnątrz `globals.css` (serializował krytyczny łańcuch) → `next/font` (Space Grotesk + Outfit, same-origin, preload). **15 martwych rodzin fontów** (`.font-roboto`…`.font-anton`) — zero użyć, fonty nigdy się nie ładowały — usunięte |
| 19 | Media w feedzie bez wymiarów przy `images.unoptimized` → kontener `aspect-ratio` + `loading="lazy"` + `decoding="async"` (CLS) |
| 20 | Podwójny `backdrop-blur-xl` na sticky headerze (re-blur co klatkę scrolla) → jeden blur |
| 23 | Efekt `aiGenerator` miał w deps **wywołanie funkcji** i świeży obiekt → odpalał się co render |

---

## Fala C — sieć i Firestore

| # | Co | Odczyty Firestore |
|---|---|---|
| **26** | `useSocial` montowany 2–3× (page + PostList + PinnedPosts); każdy mount = 7 równoległych loaderów. Dodany lekki **`useSocialActions`** (tylko follow/unfollow/status, bez `loadAllData`), `PostList` przepięty | ~150 → ~1 zapytanie na mount feedu |
| **28** | Seryjny `await checkIfFollowing()` per autor przy KAŻDEJ zmianie postów → jedno pobranie własnej listy following + porównanie w `Set` | N → 1 |
| **29** | N+1 w `getFollowers`/`getFollowing`/`getFriends` — `getDoc()` per user **plus** `checkIfFollowing()` per user (2N) → `where('__name__','in', chunk)` po 30 + mutual z jednego `Set` | 50 userów: **100 → 3** |
| **30** | `TipStats` robił własny `getDocs` per post → `getBulkPostTipStats()` (`where('postId','in',chunk)`), wynik przekazywany propsem | 25 postów: **25 → 1** |
| 27 | `getActiveUsers` 3× na starcie: mount + `setTimeout` 1 s po loginie z `forceRefresh=true` (omijał OBA cache) + effect `currentPage`. Force-refresh usunięty, `currentPage` z guardem `prevPageRef` | 3 → 1 |
| 33 | Druga instancja Firebase (`initializeApp(config,'social-features')`) → re-export `db` z głównego klienta | Jeden kanał zamiast dwóch |
| 34 | `loadUserProfile`: seryjne `await` → `Promise.all`; **bezwarunkowy WRITE przy każdym przebiegu efektu** → zapis tylko gdy BaseName faktycznie się zmienił (guard w ref) | −2…4 zapisy na mount |
| 35 | `JSON.parse` całego blobu `userNames` z localStorage przy **każdej** zmianie feedu → hydracja raz na sesję |

---

## Fala D — bundle

| # | Co |
|---|---|
| **3** | **ethers v6 całkowicie usunięty z klienckiego bundle'a.** `PostContract2.ts`: 11 z 13 eksportów było martwych; jedyny żywy `encodeCreatePostData2` przepisany z `ethers.Interface` na `encodeFunctionData` z viem. `LineaPostContract.ts`: 8 martwych eksportów na ethers wycięte. Martwy import `formatEther` w `NftCreator`. **`grep "from 'ethers'"` w `app/` → 0 trafień**; pakiet przeniesiony do `devDependencies` (potrzebny tylko Hardhatowi) |
| 2 | `next/dynamic` dla 9 komponentów renderowanych warunkowo: `CreatePost{BaseCamp,Linea,Celo,Ethereum,WorldChain}`, `MusicSelector`, `AIPostGenerator`, `YapsMetrics`, `ReferralLeaderboard` |
| 38★ | `next/dynamic` dla 4 widoków social (`Following`/`Friends`/`Discover`/`Notifications`) — ~9k linii social+firebase nie ewaluuje się na starcie |
| 4 | RainbowKit (provider + CSS) wyjęty z root layoutu → nowy `app/marketplace/layout.tsx` (jedyny konsument to `<ConnectButton>`) |
| 5 | `CampProvider` wyjęty z root layoutu → nowy `app/mycamp/layout.tsx` |
| 8 | `@zoralabs/coins-sdk` → `await import()` w handlerze tworzenia coina |
| 11 | Monkey-patch `window.fetch`: usunięty `try/catch` owijający **każdy** request i fabrykowanie odpowiedzi 200 dla `api.basescan.org` (ten host jest wołany wyłącznie z trasy serwerowej — branch nigdy nie działał w przeglądarce, a maskował prawdziwe błędy). Został wyłącznie redirect `eth.merkle.io`, z pass-through bez narzutu dla reszty |

**Bundle `/basechat`: 885 → 857 kB First Load** (route: 288 → 277 kB). Shared chunk: 91,4 → 90,4 kB.

> Największe zyski wydajnościowe są **runtime'owe**, nie bundle'owe — bug #25, re-rendery i odczyty Firestore ważą tu znacznie więcej niż kilobajty.

---

## Fala 0.5 — zależności

**`dependencies`: 107 → 51. `devDependencies`: 42 → 31.**

Usunięte (zweryfikowane: zero importów w źródłach): `@ai-sdk/*` ×3, `@coinbase/agentkit*` ×3, `@coinbase/wallet-sdk`, `@divvi/referral-sdk`, `@google-cloud/recaptcha-enterprise`, `@langchain/*` ×3, `langchain`, `ai`, `@privy-io/*` ×2, `@radix-ui/*` ×6, `@react-three/drei`, `@react-three/fiber`, `ogl`, `@solana/web3.js`, `@stacks/*` ×3, `@tanstack/react-table`, `@walletconnect/*` ×3, `@zerodev/*` ×2, `permissionless`, `bs58`, `cmdk`, `gray-matter`, `gsap`, `html2canvas`, `lottie-react`, `motion`, `react-colorful`, `react-intersection-observer`, `react-window`, `remark-gfm`, `tailwindcss-animate`, `tsparticles` ×3, `uuid`, `zod` + polyfille browserify ×9 (wszystkie fallbacki w `next.config.js` i tak stoją na `false`), `http-proxy`, `baseline-browser-mapping`.

**Korekty względem listy z audytu:**
- Audyt kazał **zostawić** `tsparticles-slim`/`react-tsparticles` — oba importował wyłącznie martwy `ParticlesBackground.tsx`. Usunięte.
- `three` **zostaje** (żywe `SpaceBackground.tsx`), ale `@react-three/drei` i `@react-three/fiber` mają zero użyć.
- `ethers` przeniesiony do `devDependencies` zamiast usunięty — Hardhat i skrypty deploy go potrzebują.
- `react-is` **zostawiony** — dodany celowo w commicie `fd5afc9` żeby naprawić build na Vercelu, usuwanie to niepotrzebne ryzyko.

---

## Fala E — wykonana część bezpieczna

- **Migracja connectora Farcastera:** `@farcaster/frame-wagmi-connector` + `@farcaster/frame-sdk` (przestarzałe nazwy, frame-sdk był już tylko shimem) → **`@farcaster/miniapp-wagmi-connector`** (`farcasterMiniApp()`). Ten sam id connectora `farcaster`, więc lookup w `FarcasterFrameProvider` działa bez zmian. Zostajemy na wagmi 2.x zgodnie z ostrzeżeniem z audytu.
  > To była też blokada dla Fali 0.5 — `frame-wagmi-connector` twardo zależy od `frame-sdk`, więc pakietu nie dało się usunąć bez tej migracji.
- **Manifest embed:** `fc:frame` miał `"version": "next"` (przestarzałe, klienci odrzucają) i brakowało `fc:miniapp`. Teraz oba tagi serwują ten sam obiekt z `version: "1"` i `type: "launch_miniapp"`.
- **`minikit.config.ts` usunięty.** Był orphanem (0 importerów), więc zmienne `FARCASTER_*` nic nie robiły. Podpięcie go jako dynamiczna trasa jest **niewykonalne**: statyczny `public/.well-known/farcaster.json` (z podpisanym `accountAssociation`) i tak przykrywa każdą trasę Next. Statyczny manifest zostaje jedynym źródłem prawdy.

---

## CO ZOSTAŁO — wymaga Twojej decyzji

### Krytyczne, poza kodem (sekcja §1 audytu — nie mam dostępu)

1. **`NEXT_PUBLIC_COINBASE_PRIVATE_KEY`** — prefiks `NEXT_PUBLIC_` wysyła wartość do publicznego bundle'a JS. Jeśli to prawdziwy klucz prywatny: **zrotować i zapisać bez prefiksu**.
2. **`NODE_ENV` ustawiony ręcznie na Vercelu** — jeśli ≠ `production`, prod chodzi w trybie dev Reacta. Usunąć z dashboardu.
3. **`vendor/kya` nietrackowane w gicie**, a `package.json` wskazuje `file:./vendor/kya` → deploy z czystego checkoutu się nie zainstaluje. Trzeba `git add vendor/`.
4. Klucze env czytane przez kod, a nieistniejące nigdzie: `NEXT_PUBLIC_PINATA_JWT_TOKEN` (env ma `NEXT_PUBLIC_PINATA_JWT`), `NEXT_PUBLIC_NETWORK_ID`, `NEXT_PUBLIC_ADMIN_KEY`, `ADMIN_API_KEY`, `NEXT_PUBLIC_ZORA_API_KEY`, `NEXT_PUBLIC_GOLDSKY_API_KEY`.

### Architektura (audyt sam oznaczył jako „osobna decyzja")

5. **#10 — globalny gate `ClientOnly` + client-only root layout** `[high/risky]`. Cała aplikacja renderuje spinner do pełnej hydracji, metadata jest client-side. Po odchudzeniu providerów (fale A i D) to jest teraz **znacznie bezpieczniejsze niż było** — ale to nadal przepisanie root layoutu na server component. Osobna sesja.
6. **Migracja OnchainKit → wagmi + `baseAccount` + SIWE.** Base wygasiło OnchainKit (~19.03.2026), npm zamrożony na 1.1.2. Główny login stoi na martwej bibliotece. Base publikuje oficjalny skill migracyjny: `npx skills add base/skills`.
7. **Prawdziwy server-side auth.** Dziś tożsamość = adres z wagmi w localStorage, autoryzacja Firestore wyłącznie client-side, podpis SIWE z `SignInWithBaseButton` **nie jest weryfikowany serwerowo**. Do zrobienia razem z #6.
8. **wagmi cookie-SSR** (`ssr:true` + `cookieStorage` + `cookieToInitialState`) — eliminuje flash „niezalogowany". Wymaga najpierw #5.
9. **#14 w pełnej wersji** — wydzielenie `PostComposer` i `PostItem` z 4200-liniowego `page.tsx`. Zrobiłem `React.memo` na `PostList` + stabilne propsy, co zdejmuje dominujący koszt (feed nie re-renderuje się już przy pisaniu). Pełne wydzielenie oznacza przewleczenie ~20 miejsc używających `newPost` przez handlery — realne ryzyko regresji, warte osobnego podejścia z testami.
10. **Tokeny shadcn w `tailwind.config.ts`.** Config nie definiuje `popover`, `muted-foreground`, `accent`, `ring`, `destructive` — wszystkie żywe komponenty z `components/ui/` renderują się z częściowo niedziałającymi klasami. Osobny bug, nie było go w audycie.
