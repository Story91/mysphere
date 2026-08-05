# MySphere — pełny audyt (2026-08-04)

Audyt wykonany przez 8 równoległych agentów (kod + aktualne docsy Base/wagmi/Farcaster).
Repo: `C:\dev\mysphere`, branch `Laptop` (= origin/master @ d773add + zmiany fazy 1 poniżej).

---

## 0. CO JUŻ ZROBIONE (nie rób drugi raz)

Faza 1 refaktoru — wykonana i skompilowana:

1. Usunięty zdublowany zewnętrzny `WagmiProvider` — skasowane `context/index.tsx` i `config/appkit.ts`, wypięty `ContextProvider` z `app/layout.tsx`.
2. `app/components/FarcasterFrameProvider/FarcasterFrameProvider.tsx` przepisany: `sdk.isInMiniApp()` z `@farcaster/miniapp-sdk` (1 s timeout — koniec wiecznego wiszenia na localhoście), connector brany z configu (id `farcaster`) zamiast świeżej instancji, usunięty monkey-patch `console.error`, guard na poziomie modułu przeciw podwójnej inicjalizacji.
3. `app/providers.tsx`: metadata WalletConnect/MetaMask używa `window.location.origin` (`APP_ORIGIN`) zamiast zahardkodowanego `https://mysphere.fun`.
4. `app/basechat/page.tsx`: usunięty drugi mount `<FarcasterFrameProvider>` (był podwójny init w miniappce) + 3 martwe importy (`FrameSDK`, default-import `farcasterFrame`, `connect` z wagmi/actions).
5. `next.config.js`: scalony z martwym `next.config.mjs` (który był przykryty przez `.js` — externals `pino-pretty/lokijs/encoding` dla WalletConnect, rewrites `/flashblock` i `/docs`, redirect www→apex). `.mjs` skasowany. CELOWO pominięty redirect `x-forwarded-proto: http → https://mysphere.fun` (porywałby ruch z tuneli). Usunięta nieznana opcja `memoryBasedWorkers`.
6. `.env.local`: dodany `NEXT_PUBLIC_URL=http://localhost:3000`.
7. `app/utils/merkleProxy.ts`: intercept `eth.merkle.io` (domyślny RPC viem dla mainnetu, używany przez ENS-lookupy OnchainKit) kieruje teraz bezpośrednio na `https://ethereum-rpc.publicnode.com` zamiast na `/api/merkle-proxy` — to zatrzymuje sztorm `POST /api/merkle-proxy 502` widoczny w logach dev.

**Niedokończone:** `GET /sw.js 404` w logach — w kodzie repo NIE MA rejestracji service workera (grep czysty). Rejestruje go któryś SDK albo stary SW siedzi w przeglądarce (sprawdź DevTools → Application → Service Workers → Unregister). Ewentualnie dodać pusty `public/sw.js`, żeby uciszyć 404.

---

## 1. KRYTYCZNE — zrób najpierw

- **`NEXT_PUBLIC_COINBASE_PRIVATE_KEY`** istnieje w `.env.local` I na Vercelu (produkcja). Prefiks `NEXT_PUBLIC_` wysyła wartość do publicznego bundle'a JS. Jeśli to prawdziwy klucz prywatny: **zrotować natychmiast**, zapisać bez prefiksu `NEXT_PUBLIC_`.
- **`vendor/kya` jest nietrackowane w gicie**, a `package.json` (niezacommitowany diff) wskazuje `@registrai/kya: file:./vendor/kya`. Deploy z czystego checkoutu na Vercelu nie zainstaluje się albo użyje innej wersji. Trzeba: `git add vendor/ package.json package-lock.json` i commit.
- **`NODE_ENV` jest ustawiony ręcznie jako env var na Vercelu** (Development/Preview/Production). Vercel wstrzykuje dashboardowy NODE_ENV do buildów — jeśli wartość ≠ `production`, prod działa w trybie dev Reacta. **Usunąć NODE_ENV z dashboardu Vercela.**
- Klucze env czytane przez kod, a nieistniejące NIGDZIE (zepsute po cichu): `NEXT_PUBLIC_PINATA_JWT_TOKEN` (kod czyta TOKEN, env ma `NEXT_PUBLIC_PINATA_JWT` — 4 miejsca), `NEXT_PUBLIC_NETWORK_ID` (env ma `NETWORK_ID`), `NEXT_PUBLIC_ADMIN_KEY`, `ADMIN_API_KEY`, `NEXT_PUBLIC_ZORA_API_KEY`, `NEXT_PUBLIC_ZERODEV_*`, `NEXT_PUBLIC_CDP_RPC_URL`, `NEXT_PUBLIC_GOLDSKY_API_KEY`.
- Martwe klucze WalletConnect: kod czyta TYLKO `NEXT_PUBLIC_WC_PROJECT_ID` (`app/providers.tsx`). `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_PROJECT_ID`, `NEXT_PUBLIC_REOWN_*`, `NEXT_PUBLIC_ONCHAINKIT_DOMAIN` — nieużywane, do skasowania z obu środowisk (mylą przy edycji).

---

## 2. LOGOWANIE PORTFELA — czemu lokalnie działa inaczej niż na produkcji

Ranking przyczyn (część naprawiona w fazie 1):

1. **Allowlisty originów w zewnętrznych dashboardach** (niewidoczne w kodzie): Coinbase CDP (klucz `NEXT_PUBLIC_ONCHAINKIT_API_KEY` + `NEXT_PUBLIC_CDP_PROJECT_ID`), WalletConnect Cloud/Reown (`NEXT_PUBLIC_WC_PROJECT_ID`), Camp Origin OAuth (redirect `http://localhost:3000/mycamp` musi być zarejestrowany dla `NEXT_PUBLIC_CAMP_CLIENT_ID`). Sprawdzić, że `http://localhost:3000` jest dodany wszędzie.
2. **Miniapp-only ścieżka**: autoconnect farcasterowy odpala się wyłącznie w hoście (Warpcast/Base app) — na localhoście w przeglądarce testuje się INNĄ ścieżkę logowania. Manifest `public/.well-known/farcaster.json` jest statyczny, domain-bound do `mysphere.fun` — localhost nigdy nie przejdzie weryfikacji domeny. Testy miniappki: tunel HTTPS (cloudflared) + farcaster.xyz/~/settings/developer-tools (preview tool); `addMiniApp()`/notyfikacje działają tylko na produkcyjnej domenie.
3. ~~Hardkodowane URL-e w metadanych connectorów~~ — NAPRAWIONE (faza 1).
4. **`next dev -H 0.0.0.0` po HTTP**: wejście przez IP LAN (telefon) to insecure context — pada crypto.subtle/passkeys → Coinbase Smart Wallet i WalletConnect nie działają. Przez `http://localhost:3000` OK (secure context).
5. Wartości env mogą się różnić localhost↔Vercel mimo tych samych nazw (nie porównywałem wartości) — `vercel env pull` i diff.

---

## 3. STRATEGICZNE MIGRACJE (stan docsów: sierpień 2026)

- **OnchainKit został WYGASZONY przez Base** (~19.03.2026, 60 dni na migrację; npm zamrożony na 1.1.2 = wasza wersja; docs usunięte). Wasz główny login (`<ConnectWallet>` w `Navigation.tsx`) stoi na martwej bibliotece. Docelowo: czyste wagmi + connector `baseAccount` + SIWE. Base publikuje oficjalny skill migracyjny: `npx skills add base/skills`.
- **Base App od 09.04.2026 traktuje wszystkie appki jako zwykłe web appy** — nie woła SDK Farcastera (ready(), signIn, composeCast — nic). Zamienniki: signIn→SIWE (viem/siwe + useSignMessage), sendToken→useWriteContract, openUrl→window.open, identyfikacja FID→adres portfela, manifest→rejestracja na Base.dev, notyfikacje Neynar→Base Notifications API (wallet-address-based).
- **Farcaster (Warpcast) nadal używa spec miniapp**: aktualny stack `@farcaster/miniapp-sdk` + `@farcaster/miniapp-wagmi-connector` (v2, `farcasterMiniApp()`). Wasze `@farcaster/frame-sdk` i `@farcaster/frame-wagmi-connector` to przestarzałe nazwy (frame-sdk to shim). UWAGA: miniapp-wagmi-connector v2 wymaga wagmi v2 (peer @wagmi/core ^2.14) — **zostać na wagmi 2.16.x**, nie wchodzić na wagmi v3, dopóki appka celuje też w klientów Farcastera.
- **Manifest**: `version` musi być stringiem `"1"` (nie `"next"`!) — wasz meta tag `fc:frame` w `layout.tsx` ma `"version": "next"` (przestarzałe) i brak `fc:miniapp` (aktualny tag). `minikit.config.ts` jest ORPHANEM — nic go nie importuje; zmiany env FARCASTER_* nic nie zmieniają w serwowanym manifeście (liczy się tylko statyczny `public/.well-known/farcaster.json`).
- **Coinbase Smart Wallet → Base Account**: `coinbaseWallet({preference:'smartWalletOnly'})` zastąpione przez dedykowany connector `baseAccount({appName, appLogoUrl})` (@wagmi/connectors ≥5.9). Popup keys.coinbase.com wymaga COOP ≠ `same-origin` i wywołania connect bezpośrednio w click-handlerze.
- **wagmi SSR**: docelowo `createConfig({ssr:true, storage: createStorage({storage: cookieStorage})})` + `cookieToInitialState` w serwerowym layoutcie — eliminuje flash „niezalogowany" przy każdym wejściu. Wymaga zamiany root layoutu na server component (patrz sekcja 5, pkt „ClientOnly").

---

## 4. ARCHITEKTURA LOGOWANIA — obecny stan (mapa)

- `app/providers.tsx` — jedyny wagmi config (6 connectorów: farcasterFrame, injected, metaMask, coinbaseWallet(smartWalletOnly), walletConnect, safe; 6-7 chainów). Drzewo: Wagmi > RainbowKit > Camp > FarcasterFrame > **Privy (NIEUŻYWANE)** > OnchainKit.
- Login UI: OnchainKit `<ConnectWallet>` w `app/components/Navigation/Navigation.tsx` + `SignInWithBaseButton` w `app/basechat/prelogin/MockFeed.tsx` (Base Account SDK `wallet_connect` + signInWithEthereum — podpis SIWE NIEWERYFIKOWANY serwerowo).
- **Brak jakiegokolwiek server-side auth**: tożsamość = adres z wagmi w localStorage (`userAddress`), autoryzacja Firestore wyłącznie client-side. `app/components/LoginForm/LoginForm.tsx` — martwy formularz email/hasło POST-ujący na nieistniejące `/api/auth/login`.
- Ominięcia wagmi (psują nie-injected portfele): `app/components/Staking/StakingComponent.tsx` (surowe `window.ethereum` + ethers), `app/mycamp/MintIPnft/MintButton.tsx` (fallback window.ethereum), `SimpleMint/WorkingMint` (import wagmiConfig z providers do @wagmi/core — OK, ale krucho).
- Martwe: `app/api/privy/*` (mockowe route'y), `app/api/frame/route.ts` (Frames v1, hardkod basebook.vercel.app), `public/index.html` (stary fc:frame), plik `on` w rootcie repo (przypadkowa kopia package.json).

---

## 5. WYDAJNOŚĆ — 42 poprawki z audytu (3 agentów: bundle / runtime / dataflow)

Format: **[impact/risk]** tytuł — problem → fix.

### 5A. Waga startowa (bundle)

1. **[high/careful] Usunąć PrivyProvider + oba pakiety @privy-io** — `app/providers.tsx` montuje `<PrivyProvider>` na każdej trasie; ZERO użyć w repo (brak usePrivy/useLogin/useWallets). → Wyciąć import i wrapper JSX, usunąć `@privy-io/react-auth` i `@privy-io/server-auth` z package.json, `npm install`. Login nieruszony (OnchainKit + SignInWithBase).
2. **[high/careful] Code-split ciężkich warunkowych komponentów w `app/basechat/page.tsx`** — statyczne importy rzeczy renderowanych warunkowo: `CreatePostBaseCamp/Linea/Celo/Ethereum/WorldChain` (linie ~90-95, renderowane tylko dla wybranej sieci ~3769-3811), `MusicSelector` (modal), `AIPostGenerator` (gated), `YapsMetrics`, `ReferralLeaderboard` (taby). → `next/dynamic(() => import(...), {ssr:false})`.
3. **[high/careful] Wyeliminować ethers v6 z initial chunka** — `app/contracts/PostContract2.ts` importuje ethers tylko do enkodowania ABI; przez TransactionButton/CommentTransactionButton ładuje ~100-130 KB duplikując viem. → przepisać na viem `encodeFunctionData/decodeFunctionResult` (viem już w bundle) w: PostContract2.ts, PostContract.ts, LineaPostContract.ts. Stopgap: `await import('ethers')` wewnątrz funkcji.
4. **[medium/careful] RainbowKit tylko na /marketplace** — provider globalny + CSS w root layoutcie, a jedyny konsument to `ConnectButton` w `app/marketplace/page.tsx`. → usunąć z providers.tsx i layout.tsx; stworzyć `app/marketplace/layout.tsx` ('use client') z importem CSS + `<RainbowKitProvider>`.
5. **[medium/careful] CampProvider tylko na /mycamp** — konsumenci wyłącznie pod `app/mycamp/**` (route'y api/camp to server-side, nie używają React providera). → `app/mycamp/layout.tsx` ('use client') z `<CampProvider clientId=... redirectUri={origin+'/mycamp'}>`.
6. **[medium/safe] CSS OnchainKit lokalnie zamiast unpkg** — `layout.tsx` linia ~55 ładuje render-blokujący stylesheet z CDN. → skasować `<link>`, dodać `import '@coinbase/onchainkit/styles.css'` obok globals.css (identyczne bajty, wersja 1.1.2 zainstalowana).
7. **[medium/careful] AdSense poza ścieżką krytyczną** — `layout.tsx` ładuje adsbygoogle `afterInteractive`, konkuruje z hydracją. → `strategy="lazyOnload"` i przenieść `<Script>` z `<head>` do body layoutu.
8. **[medium/safe] Zora coins SDK na żądanie** — `basechat/page.tsx` importuje `@zoralabs/coins-sdk` na topie, używa tylko w handlerze tworzenia coina (~1096). → `await import('@zoralabs/coins-sdk')` w handlerze.
9. **[medium/careful] Wyciąć ~30 nieużywanych zależności z package.json** (zero importów w źródłach, zweryfikowane grep): @solana/web3.js, @stacks/{connect,network,transactions}, @zerodev/{sdk,ecdsa-validator}, permissionless, @coinbase/agentkit(+langchain,+vercel-ai-sdk), langchain, @langchain/{core,langgraph,openai}, ai, @ai-sdk/{fal,google-vertex,openai}, gsap, lottie-react, html2canvas, react-window(+types), tsparticles(v3), motion (duplikat framer-motion), @google-cloud/recaptcha-enterprise, @walletconnect/{core,modal,ethereum-provider} (wagmi ma własne transytywnie), @divvi/referral-sdk, @farcaster/frame-sdk (po migracji importów na miniapp-sdk; frame-wagmi-connector ZOSTAJE), @tanstack/react-table, react-colorful, bs58, gray-matter. Po usunięciu: `npm install` + build kontrolny. ZOSTAWIĆ: openai, mongodb, recharts, three/@react-three/*, ogl, tsparticles-slim/react-tsparticles, react-countup, cmdk, node-html-parser, react-markdown, linkifyjs, @farcaster/miniapp-node.
10. **[high/risky] Przemyśleć globalny gate ClientOnly + client-only root layout** — cała appka renderuje spinner do czasu pełnej hydracji (multi-MB bundle), SEO/metadata client-side. → krok 1: po odchudzeniu providerów zdjąć blanket ClientOnly, gate'ować tylko komponenty czytające window/localStorage; krok 2 (docelowo): layout.tsx jako server component z Metadata API, 'use client' zepchnięte do providers.tsx. Odpali też poprawny `fc:miniapp` embed i wagmi cookie-SSR (sekcja 3).
11. **[low/careful] Skasować globalny monkey-patch window.fetch** (`ClientOnly.tsx` → `installMerkleProxy`) — podatek na KAŻDY request + fabrykowane 200 dla basescan. Po fazie 1 przekierowuje na publicnode; docelowo usunąć patch całkiem, a mainnet transport ustawić w wagmi/viem configu.
12. **[info] Zweryfikowane jako OK**: wagmi connectory lazy-loadują swoje SDK; three.js/ogl/tsparticles są route-local (/basemorning); SPLASH.gif nie renderuje się w appce; brak onSnapshot listenerów na basechat; .glb (20MB) nieużywane w runtime.

### 5B. Jank w runtime

13. **[high/careful] MutationObserver w `Navigation.tsx` (linie ~53-116)** — observer na całym document.body (childList+subtree) czyta textContent dodanych poddrzew i odpala DWA pełne skany dokumentu (TreeWalker po wszystkich text nodach + querySelectorAll('h1..h6,button,span,div')) żeby przepisać 'Sign up'→'Sign In With Base'. Marquee CoinGecko mutuje DOM bez przerwy → pętla działa non-stop. GŁÓWNY stutter logowania. → obserwować tylko pojawienie się `[role="dialog"]`, skan ograniczony do dialogu, raz, bez podwójnego setTimeout, flaga przeciw reagowaniu na własne zapisy; najlepiej: `<ConnectWallet disconnectedLabel="Sign In With Base">` i zero patchowania DOM.
14. **[high/careful] Kompozytor posta re-renderuje całą stronę** — page.tsx to jeden komponent (76 useState/32 useEffect); textarea `value={newPost}` → każda litera re-renderuje 4200 linii + niememoizowany 2683-liniowy PostList ze wszystkimi postami. → wydzielić PostComposer (stan newPost/preview/music lokalnie), wydzielić PostItem z React.memo po post.id, React.memo na PostList, handlePinPending w useCallback, hover przez CSS zamiast setHoveredElement na stanie strony.
15. **[high/careful] Audio player re-renderuje feed 4-60×/s** — `PostList.tsx:533` timeupdate → setCurrentTime w stanie PostList → wszystkie posty re-renderują się przez cały czas odtwarzania. → stan playera do dedykowanego komponentu/kontekstu; tylko aktywna karta subskrybuje timeupdate; progress bar przez ref/DOM.
16. **[medium/safe] `viewportHeight` — stan nigdy nieczytany** — `page.tsx:406` + setter w resize handlerze (:2486) → każdy resize = pełny re-render za nic. → usunąć useState i wywołanie settera, zostawić `--vh`.
17. **[medium/careful] IntersectionObserver odtwarzany co render** — `sortedPosts` budowane co render bez useMemo i siedzi w deps effektu observera (:1817-1849). → useMemo([posts, sortOrder]); deps observera `[displayLimit, sortedPosts.length, expandedPosts]`, świeża length przez ref.
18. **[medium/careful] Render-blokujące fonty/CSS** — `globals.css:6` `@import` Google Fonts wewnątrz arkusza (serializuje łańcuch krytyczny); 15 rodzin fontów w klasach `.font-*` nigdy nieładowanych (martwe). → next/font (Inter, Space Grotesk, Outfit); skasować martwe klasy.
19. **[medium/careful] Wymiary mediów w feedzie** — `PostList.tsx:1982` `<img>` bez width/height/aspect-ratio przy images.unoptimized → każdy obraz reflow'uje feed (CLS). → kontener z aspect-ratio + loading="lazy" decoding="async".
20. **[medium/careful] Podwójny backdrop-blur na sticky headerze** — `Navigation.tsx:147+170` dwa backdrop-blur-xl na sobie → re-blur co klatkę scrolla. → jedna półprzezroczysta solidna warstwa (np. bg-[#050B20]/90) albo max jeden blur-sm.
21. **[low/safe] Memoizacja wartości kontekstów** — `providers.tsx:122` i `context/ThemeContext.tsx:32` przekazują świeże obiekty co render. → useMemo + useCallback. (Uwaga: DWA równoległe systemy theme — ThemeProvider i ThemeContext w providers — do konsolidacji.)
22. **[low/safe] Martwy kod** — `page.tsx:51` import CoinGeckoMarqueeWidget nigdy nierenderowany (strona używa surowego custom elementu); pusty ruleset `globals.css:704-709`. → skasować.
23. **[low/careful] Effect aiGenerator odpala się co render** — `page.tsx:327-333` deps zawierają wynik wywołania funkcji i świeży obiekt. → useCallback/useMemo w useAIGenerator, deps `[aiGenerator.aiGeneratedContentForBase, activePostingNetwork]`.
24. **[low/careful] CSS `body.wallet-not-connected div[role="dialog"]`** (`globals.css:693-702`) — centruje z !important KAŻDY dialog w appce (walczy z animacjami cudzych modali). → zawęzić selektor do modala OnchainKit.

### 5C. Sieć / dane

25. **[high/careful] BUG: lazy-loading feedu wyłączony przez truthy obiekt** — `page.tsx:1831` `displayedPosts = expandedPosts ? sortedPosts : sortedPosts.slice(0, displayLimit)` — `expandedPosts` to obiekt `{}` (truthy!), więc slice NIGDY nie działa i wszystkie posty renderują się naraz (a każdy = TipStats query + LinkPreview + Avatar/Name). Też `:1834` `if (expandedPosts) return;` blokuje observer infinite-scrolla. → `slice(0, displayLimit)` bezwarunkowo, usunąć early-return. NAJWIĘKSZY pojedynczy zysk.
26. **[high/careful] useSocial montowany 2-3×** — page.tsx:433 + PostList.tsx:263 + PostList w PinnedPosts; każdy mount = 7 równoległych loaderów, ~150 odczytów Firestore. → SocialContext montowany raz; PostList potrzebuje tylko follow/unfollow/checkIfFollowing (osobny useSocialActions bez loadAllData).
27. **[high/careful] getActiveUsers 3× na starcie** — mount (:2212), setTimeout 1 s po loginie z forceRefresh=true omijającym OBA cache (:2221-2230), effect currentPage (:2245). → zostawić tylko mount; force-refresh usunąć albo zmienić na false; currentPage z guardem prevPage w ref.
28. **[high/careful] Serial checkIfFollowing per autor** — `PostList.tsx:842-865` sekwencyjny await na każdego autora przy KAŻDEJ zmianie identity posts. → wyliczać z już załadowanej listy following (`Set`); ewentualnie Promise.all + cache w ref.
29. **[high/careful] N+1 w getFollowers/getFollowing/getFriends** — `follows.ts:323,387`, `friends.ts:509` — po jednym getDoc na usera (50 odczytów/lista). → query `where(documentId(),'in',chunk)` po 30 (wzorzec już jest w `firebase.ts:4340`); 50 userów = 2 zapytania.
30. **[high/careful] TipStats per post** — osobne getDocs na każdy post (`TipStats.tsx:273-296`), przy bugu #25 wszystkie naraz. → jedno zapytanie `where('postId','in',chunk)` na 30 postów, przekazywane propsami; docelowo licznik agregowany na dokumencie posta.
31. **[high/careful] Domyślne opcje react-query** — `new QueryClient()` bez opcji = staleTime 0 + refetchOnWindowFocus → każdy powrót do taba re-fetchuje WSZYSTKIE query (identity per wiersz, useBalance, useName) po publicznych RPC. → `defaultOptions: {queries: {staleTime: 60_000, gcTime: 300_000, refetchOnWindowFocus: false, retry: 1}}`.
32. **[medium/safe] useName dla adresu zero** — `page.tsx:418-421` wylogowany user odpala lookup Basename dla 0x000...0. → `useName({address, chain}, {enabled: !!address})`.
33. **[medium/careful] Druga instancja Firebase** — `friends/config.ts:24` `initializeApp(config,'social-features')` = drugi klient, podwójne kanały. → re-export `db` z `../firebase` (zweryfikowane: ten sam projekt/kolekcje).
34. **[medium/careful] loadUserProfile: seryjne await + zbędny WRITE co mount** — `page.tsx:1589-1635` fetchUserProfile → getProfileName sekwencyjnie, potem bezwarunkowy saveProfileName (zapis!) przy każdym runie effektu (min. 2× przez dep baseName, ×2 StrictMode). Analogicznie calculateAndSaveBaseChatPoints (:2121). → Promise.all + zapis tylko gdy wartość się zmieniła (porównanie w ref).
35. **[medium/safe] JSON.parse całego blobu userNames z localStorage przy każdej zmianie feedu** — `firebase.ts:4677-4689`. → hydratować cache z localStorage RAZ, potem ufać pamięci.
36. **[low/safe] getNotificationsSummary robi 105 odczytów** — `notifications.ts:599-608` fetch(100) + fetch(5), a 5 to slice(0,5) tej setki. → jeden fetch, recent = slice.
37. **[low/safe] Duplikat AdSense** — layout.tsx ORAZ BanPage (`page.tsx:180-185`). → zostawić jeden (lazyOnload).
38. **[low/safe] Module-scope console.logi** („System initialized") — `follows.ts:617`, `friends.ts:847`, `notifications.ts:899`, `friends/index.ts:480`, `friendsystem/hooks.ts:690`. → skasować; follow-up: FriendsView/FollowingView/DiscoverView/NotificationsView przez next/dynamic, żeby ~9k linii social+firebase nie ewaluowało się na starcie.
39. **[medium/careful] Memoizacja ścieżki renderu feedu** — sortedPosts bez useMemo (:1815-1824), PostList bez React.memo. → useMemo + memo + useCallback na propsach. (Nakłada się z #14/#17.)
40. **[info] StrictMode podwaja wszystko w dev** — dlatego localhost wydaje się dramatycznie gorszy niż prod. Nie wyłączać — naprawić przyczyny.
41. **[info] Marquee CoinGecko** animuje bez przerwy na ekranie logowania (`page.tsx:2699` + Script :2665); MockFeed ciągnie awatary z zewnętrznego pravatar.cc. Opcjonalnie: renderować marquee tylko po zalogowaniu.
42. **[info] `docs/miniapps-archive.md`** — opublikowany URL miniappki: farcaster.xyz/miniapps/wLwL313HxiaE/mysphere (przyda się przy testach po migracji manifestu).

---

## 6. SUGEROWANA KOLEJNOŚĆ

**Fala A (szybkie, bezpieczne, największy zysk):** #25 (bug lazy-loadingu!), #31 (react-query defaults), #1 (Privy out), #6 (CSS lokalnie), #16, #22, #32, #36, #37, #38, #21.
**Fala B (izolacja re-renderów):** #13 (observer), #14 (PostComposer/PostItem), #15 (audio), #17, #23, #39.
**Fala C (sieć/Firestore):** #26-#30, #33, #34, #35.
**Fala D (bundle):** #2, #3, #4, #5, #7, #8, #9, #11.
**Fala E (architektura, osobna decyzja):** #10 (server layout + wagmi cookie-SSR), migracja OnchainKit→wagmi+baseAccount+SIWE, migracja frame-sdk→miniapp-sdk w importach, manifest `fc:miniapp` version "1", rejestracja Base.dev, prawdziwy server-side auth (SIWE verify + cookie sesyjna zamiast localStorage), Staking/MintButton na hooki wagmi, kasacja martwych plików (LoginForm, api/privy, api/frame, public/index.html, plik `on`, minikit.config.ts — albo podpiąć go jako dynamiczny manifest route).

**Po każdej fali:** `npm run build` (albo dev + smoke test), commit. Nie robić fal równolegle w jednym commicie — za dużo plików wspólnych (page.tsx, PostList.tsx, providers.tsx).

---

## 7. ŹRÓDŁA (docsy zweryfikowane w sierpniu 2026)

- docs.base.org/apps/quickstart/build-app — kanoniczny config wagmi 2026 (injected + baseAccount, cookieStorage, ssr:true)
- docs.base.org/apps/quickstart/migrate-to-standard-web-app — deprecjacja spec miniapp w Base App (09.04.2026), tabela zamienników SDK, SIWE, Base.dev
- docs.base.org/base-account/framework-integrations/wagmi/sign-in-with-base — SignInWithBase + signInWithEthereum capability
- docs.base.org/base-account/more/troubleshooting/usage-details/popups — COOP, popup-blocker
- wagmi.sh/react/guides/ssr — cookieStorage + cookieToInitialState
- wagmi.sh/react/guides/migrate-from-v2-to-v3 — breaking changes v3 (NIE wchodzić póki Farcaster connector wymaga v2)
- miniapps.farcaster.xyz/docs/getting-started, /docs/specification, /docs/guides/wallets, /docs/sdk/quick-auth — miniapp-sdk, manifest version "1", fc:miniapp, Quick Auth, cloudflared do testów
- x.com/buildonbase/status/2034734794257703141 — ogłoszenie sunsetu OnchainKit
