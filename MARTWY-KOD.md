> ## ⚠️ DOKUMENT HISTORYCZNY — 4 sierpnia 2026
>
> **Ten plik jest nieaktualny jako opis stanu. Pierwszeństwo ma [`AUDYT.md`](AUDYT.md)
> (6 sierpnia 2026)** — jedyny obowiązujący dziennik stanu.
>
> Inwentarz opisuje repozytorium **sprzed kasacji**: 390 śledzonych plików → 284 osiągalne,
> 106 nieosiągalnych. Kasacja została wykonana (patrz [`FALE-WYKONANE.md`](FALE-WYKONANE.md)),
> więc wymienione tu pliki w większości już nie istnieją. Dokument zostaje jako zapis **metody**
> (graf importów od punktów wejścia App Routera) i punkt odniesienia dla przyszłych przeglądów.
>
> Materiał do postów: [`POSTY-SOCIAL.md`](POSTY-SOCIAL.md).

# MySphere — inwentarz martwego kodu i plików (2026-08-04)

Uzupełnienie do `AUDYT.md`. Audyt Fable opisywał **co naprawić**; ten dokument opisuje **co usunąć**.

**Metoda:** graf importów zbudowany od punktów wejścia Next App Router (wszystkie `page.tsx` / `layout.tsx` / `route.ts` / `not-found.tsx`) + configi + `.d.ts`, z rozwiązywaniem aliasu `@/*`. Weryfikacja: w repo **nie ma ani jednego dynamicznego importu ze zmienną** (`import(\`...\${x}\`)`) — jedyny `next/dynamic` jest w `app/marketplace/page.tsx` ze statyczną ścieżką. Graf jest więc kompletny, nie ma ukrytych krawędzi.

**Wynik:** 390 śledzonych plików źródłowych → **284 osiągalne, 106 nieosiągalnych** (22 457 linii, 741 KB kodu).

---

## 1. Podsumowanie liczbowe

| Kategoria | Ilość | Rozmiar |
|---|---:|---:|
| Nieosiągalne pliki źródłowe (kod aplikacji) | 91 | ~19 500 linii |
| Nieosiągalne skrypty deploy/test (hardhat) | 15 | ~3 000 linii |
| Nieużywane eksporty w **żywych** plikach | 183 symbole w 46 plikach | — |
| Zacommitowane artefakty builda (`app/basemorning/artifacts` + `cache`) | 46 plików | **6,5 MB** |
| Nieużywane assety w `public/` | 138 z 189 | **50,2 MB z 69,7 MB** |
| Nieużywane zależności npm (`dependencies`) | ~40 | — |

---

## 2. Rozbieżności z `AUDYT.md` — do skorygowania

Trzy rzeczy w audycie są nieścisłe. Sprawdzone grepem:

1. **`app/mycamp/MintIPnft/MintButton.tsx` NIE jest żywy.** Audyt (sekcja 4, „Ominięcia wagmi") wymienia go jako aktywny fallback na `window.ethereum`. W rzeczywistości importuje go wyłącznie `app/mycamp/MintIPnft/page (2).tsx` — plik, który sam nie jest trasą Next (nazwa ze spacją i nawiasem nie pasuje do `page.tsx`) i nikt go nie importuje. To samo dotyczy `SimpleMint.tsx` i `WorkingMint.tsx`. **Jedyny żywy komponent w `MintIPnft/` to `OriginMint.tsx`** (import w `app/mycamp/components/NftCreator.tsx:8`). Czyli punkt „Staking/MintButton na hooki wagmi" z Fali E redukuje się do samego `StakingComponent.tsx` — a ten też jest martwy (patrz niżej), więc cały ten punkt można wykreślić.

2. **`app/components/Staking/StakingComponent.tsx` jest martwy** (0 importerów, tak samo `StakingDocs.tsx` i `GovernanceComponent.tsx`/`GovernanceDocs.tsx`). Audyt traktuje go jako kod produkcyjny do refaktoru. Wystarczy skasować.

3. **`app/api/merkle-proxy/route.ts` jest już martwy** po fazie 1. `app/utils/merkleProxy.ts` po zmianie kieruje na `ethereum-rpc.publicnode.com` i nikt nie woła `/api/merkle-proxy`. Do skasowania razem z punktem #11 audytu.

Dodatkowo: **`app/basechat/friendsystem/` i `app/utils/friends/` to dwie równoległe implementacje tego samego systemu społecznościowego** (6 604 linie łącznie), czego audyt nie wychwycił. Żywa ścieżka to `friendsystem/hooks.ts` → `utils/friends/index.ts` (`createSocialAPI`). Duplikaty `follows_system.ts` (498 l.), `notifications_system.ts` (926 l.) i `social_index.ts` (588 l.) wiszą tylko na sobie nawzajem — **2 012 linii do skasowania**. `friends_system.ts` zostaje (importowany bezpośrednio przez `BuilderProfile.tsx`).

---

## 3. Martwe pliki — kod aplikacji (91)

### 3A. Bezpieczne do skasowania od razu, zero zależności

Duże komponenty bez żadnego importera:

```
app/components/Identity/Identity.tsx                 1713 l.  (+ ClaimIdentityCard.tsx 351 l. + ClaimIdentityCard.css)
app/components/Backgrounds/HomeNeonBackground.tsx     727 l.
app/components/FallingOrbs.tsx                        688 l.
app/components/NFT/NFT.tsx                            597 l.
app/components/Backgrounds/NeonRoomBackground.tsx     586 l.
app/components/Governance/GovernanceComponent.tsx     410 l.  (+ GovernanceDocs.tsx)
app/components/Staking/StakingComponent.tsx           408 l.  (+ StakingDocs.tsx)
app/components/AutonomousWalletDemo.tsx               264 l.
app/components/Buy/Buy.tsx                            261 l.
app/components/Backgrounds/DarkVeil.tsx               (+ DarkVeil.css)
app/components/Backgrounds/GenesisBackground.tsx      (+ ThreeJsBackground.tsx — tylko dla niej)
app/components/Background/ParticlesBackground.tsx
app/components/Fund/Fund.tsx
app/components/LoginForm/LoginForm.tsx                ← audyt §4, martwy formularz na /api/auth/login
app/components/Navigation/NavMenu.tsx
app/components/NetworkStats/NetworkStats.tsx
app/components/RobotModel.tsx
app/components/TokenStats/TransactionStats.tsx
app/components/VaultDashboard.tsx                     (+ NetworkDashboard.tsx + app/hooks/useVaultData.ts — łańcuch tylko dla niej)
app/components/CreatePost/CreatePost.tsx
app/components/CryptoWidget/CoinGeckoWidget.tsx
app/components/CryptoWidget/CoinGeckoMultiWidget.tsx  (+ app/config/coingecko.ts — tylko dla niej)
app/components/Animation/CountUpAnimation.tsx
app/components/Animation/InitialAnimation.tsx         (+ BadgesReveal / PointsReveal / RankReveal / StatsReveal — łańcuch tylko pod Identity.tsx)
app/svg/ArrowSvg.tsx, app/svg/Image.tsx, app/svg/Sphere.tsx
```

> **Uwaga o kolejności:** `CoinGeckoMarqueeWidget.tsx` NIE jest tu wymieniony, bo `app/page.tsx:51` go importuje — ale (zgodnie z audytem #22) nigdy nie renderuje. Usuń najpierw ten import, wtedy plik dołącza do listy.

Cały łańcuch `Identity.tsx` (Identity + ClaimIdentityCard + 5 komponentów Animation) to **~2 900 linii**, które nie mają jednego punktu wejścia.

### 3B. Martwe w podkatalogach featurów

```
app/basechat/components/CreatePost.tsx               224 l.  (zastąpiony przez per-sieciowe CreatePost*)
app/basechat/components/UserTokenBalances.tsx        340 l.
app/basechat/components/TokenBalanceForPost.tsx
app/basechat/components/BasePosts/GenesisMiniClaims.tsx
app/basechat/privy/PrivyProvider.tsx                 ← audyt #1
app/basechat/PinnedJobs/index.ts                     (barrel, którego nikt nie używa)
app/basechat/PinnedJobs/utils/mockPinnedPost.ts
app/basechat/Celo/celopost.ts, ETH/ethpost.ts, World/worldpost.ts   (3× ~220 l., stare klienty ethers)
app/basechat/api/update-firebase.js                  (skrypt jednorazowy w katalogu api/)

app/basemorning/components/ElementsInventory.tsx → ElementsGrid.tsx → ElementCard.tsx (+ ElementCard.css)
app/basemorning/lib/contract-indexer.ts              534 l.
app/basemorning/lib/admin-analytics.ts               467 l.
app/basemorning/types/mongodb-schema.ts              (tylko dla dwóch powyższych)
app/basemorning/types/wagmi.ts → app/basemorning/types/contract.ts

app/marketplace/config/abi.ts                       1644 l.  (żywy jest simpleMarketplace.ts)
app/marketplace/utils/subgraphClient.ts              386 l.
app/marketplace/components/PurchaseModal.tsx
app/marketplace/components/ListingCard.tsx           (DashboardView ma własny lokalny ListingCardWithPreview)
app/marketplace/components/SubgraphTest.tsx          (komponent testowy)

app/mycamp/MintIPnft/{MintButton,SimpleMint,WorkingMint}.tsx + "page (2).tsx"
app/mycamp/components/SocialLinksManager.tsx
app/mycamp/quest/components/index.ts → FloatingNFT.tsx

app/base/components/ProfilePicAI.tsx                 358 l.
app/base/components/AvatarCreator/AvatarCategoryPanel.tsx  363 l.
app/base/components/AvatarCreator/AvatarStyleSelector.tsx

app/yapscan/components/AttentionMetrics.tsx
```

### 3C. Martwe utils / configi

```
app/config/contract.ts        896 l.   (żywy jest app/contracts/*)
app/config/zerodev.ts                  ← powiązane z martwymi @zerodev/*
app/config/brandKit.ts
app/utils/tokenBalanceUtils.ts 604 l.
app/utils/social.ts
app/contracts/PostContract.ts  169 l.  (żywy jest PostContract2.ts)
app/types/Post.ts                      (duplikat typów z app/types.ts)
app/styles/global.ts
```

### 3D. Nieużywane komponenty shadcn/ui

```
components/ui/command.tsx      (+ zależność npm cmdk)
components/ui/popover.tsx      (+ @radix-ui/react-popover)
components/ui/progress.tsx     (+ @radix-ui/react-progress)
components/ui/sheet.tsx
components/ui/switch.tsx       (+ @radix-ui/react-switch)
components/ui/toggle.tsx  ←  używany tylko przez toggle-group.tsx
components/ui/toggle-group.tsx ← używany tylko przez martwy AvatarCategoryPanel.tsx
```

> **Osobna obserwacja:** `tailwind.config.ts` nie definiuje tokenów shadcn (`popover`, `muted-foreground`, `accent`, `ring`, `destructive`…) ani nie ładuje `tailwindcss-animate`. Wszystkie **żywe** komponenty z `components/ui/` renderują się więc z częściowo niedziałającymi klasami. To osobny bug do zaadresowania (albo dodać tokeny, albo przyznać, że shadcn tu nie działa i wyciąć całość).

---

## 4. Martwe trasy API (zerowe wywołania z frontendu)

Zweryfikowane grepem po całym `app/`, `components/`, `lib/`, `public/sw.js`, `minikit.config.ts`, `vercel.json`:

**Do skasowania — martwe i/lub wskazane w audycie:**
```
app/api/merkle-proxy/route.ts        ← martwy po fazie 1 (patrz §2 pkt 3)
app/api/privy/send-transaction/route.ts   ← audyt §4, mock
app/api/privy/sign-transaction/route.ts   ← audyt §4, mock
app/api/frame/route.ts               ← audyt §4, Frames v1, hardkod basebook.vercel.app
app/basechat/api/link-preview/route.ts    ← duplikat /api/link-preview (żywa jest ta w app/api/)
app/api/eth-price/route.ts
app/api/chat/route.ts
app/api/leaderboard/route.ts
app/api/transaction-count/route.ts
app/api/camp-stats/admin/route.ts
```

**Endpointy debug/seed publicznie wystawione — do skasowania albo zagate'owania:**
```
app/api/seed-firebase/route.ts       (+ app/utils/firebase-seed.ts)
app/api/debug-paid-pins/route.ts     (+ app/utils/debug-paid-pins.ts)
app/api/test-subgraph/route.ts
app/api/camp/spotify/debug/route.ts
app/basechat/pinned-demo/page.tsx    (+ app/basechat/PinnedJobs/demo/PaidPinDemo.tsx) — trasa demo na produkcji
```

**Do zweryfikowania ręcznie przed usunięciem (mogą być wołane z zewnątrz / cronem):**
```
app/api/webhook/route.ts             (Farcaster/Neynar — minikit.config.ts wskazuje na api.neynar.com, nie na tę trasę)
app/api/cleanup-expired-pins/route.ts (dokumentacja mówi o cronie, ale vercel.json NIE ma sekcji crons — cron nie istnieje)
app/api/sync-pin-events/route.ts, app/api/sync-recent-events/route.ts, app/api/refresh-stats/route.ts, app/api/manual-pin/route.ts  (zapewne wołane ręcznie/adminowo)
app/api/cdp/*  (4 trasy — spend permissions, transaction, wallet: zero wywołań z UI)
```

`vercel.json` zawiera tylko `VERCEL_FORCE_NO_BUILD_CACHE` — **nie ma żadnego crona**, więc wszystkie „cronowe" trasy nikt nie wywołuje automatycznie.

---

## 5. Nieużywane eksporty w żywych plikach (183 symbole)

Top-lista — te warto przyciąć, bo mają realny wpływ na bundle:

| Plik | Martwe eksporty | Uwaga |
|---|---:|---|
| `app/utils/firebase.ts` | 32 | m.in. `addSphereBonusToAllUsers`, `addCamperBonusToAllUsers`, `addCeloBonusToAllUsers`, `addWorldBonusToAllUsers`, `recalculateUserLikes`, `deletePostLikes` — jednorazowe migracje danych |
| `app/contracts/PostContract2.ts` | 11 z 13 | **Kluczowe dla audytu #3.** Żywe są tylko `getContractAddress2` i `prepareCreatePostCall2`. Po usunięciu reszty jedynym miejscem z `ethers` zostaje `encodeCreatePostData2` (`new ethers.Interface(...).encodeFunctionData`) → jedna podmiana na `encodeFunctionData` z viem **wywala ethers v6 z klienckiego bundle'a** (~100–130 KB), bez przepisywania czegokolwiek innego |
| `app/base/components/AvatarCreator/types.ts` | 22 | plik żywy, ale połowa panelu AvatarCreator martwa |
| `app/mycamp/quest/types/quest.ts` | 15 | typy pod nieistniejące funkcje |
| `app/utils/friends/notifications.ts` | 9 | `notifyPostLiked`, `notifyNewComment`, `notifyNewFollower`… — cała warstwa powiadomień zdefiniowana i nieużywana |
| `app/basechat/Linea/contracts/LineaPostContract.ts` | 8 | drugi importer `ethers` |
| `app/utils/friends/index.ts` | 5 | `useSocialAPI`, `getGlobalSocialStats`, `batchSocialOperations`, `maintenanceOperations`, `moderationOperations` |
| `app/utils/referrals/referralService.ts` | 5 | |
| `app/basechat/components/TipNetworkConfig.ts` | 6 | |
| 4× `*/config/*NetworkConfig.ts` (Celo/ETH/Linea/World) | 3 każdy | `*_CHAIN_ID_HEX`, `*_RPC_URLS`, `*_CONFIG` — martwe we wszystkich czterech |

Pełna lista 183 symboli: odtwarzalna skryptem, powiedz jeśli chcesz ją wypisać.

---

## 6. Pliki generowane zacommitowane do repo

**`app/basemorning/artifacts/` — 45 plików, 6,5 MB** artefaktów Hardhata (ABI + bytecode OpenZeppelin, Chainlink VRF, własnych kontraktów) plus **`app/basemorning/cache/solidity-files-cache.json`**.

`.gitignore` ma `/cache` i `/artifacts`, ale **zakotwiczone na roocie** (`/`), więc ścieżki pod `app/basemorning/` się prześlizgnęły. Fix:

```gitignore
# zamiast /artifacts i /cache
**/artifacts/
**/cache/solidity-files-cache.json
```

plus `git rm -r --cached app/basemorning/artifacts app/basemorning/cache`.

**Sprawdzone:** `git grep "artifacts/"` daje tylko dwa trafienia, oba w `app/basemorning/scripts/deploy.ts:48-49` (odczyt ABI przy deployu). Hardhat i tak regeneruje te pliki przy `npm run contracts:compile`, więc usunięcie z gita niczego nie psuje — żaden komponent Reacta nie importuje z `artifacts/`.

---

## 7. Assety `public/` — 50,2 MB z 69,7 MB nieużywane

Sprawdzone przez wyszukanie każdej nazwy pliku i ścieżki `/…` w całym źródle + CSS + `public/*.json|html`.

**Największe pozycje:**
```
20,9 MB  public/Meshy_Merged_Animations (1).glb   ← duplikat
20,8 MB  public/Meshy_Merged_Animations.glb        ← audyt §5A #12 potwierdza: nieużywane w runtime
 2,1 MB  public/_base-brand/1_Base Brand Assets/Base Brand Guidelines.pdf
 1,2 MB  public/uploads/c68efcb1-….png             ← przypadkowo zacommitowany upload użytkownika
 1,1 MB  public/tloais.png
 1,0 MB  public/nft-assets/s.o.c_blue_reactor.png
 0,9 MB  public/ais.png
 0,8 MB  public/SoulboundSphere.png
```

Same dwa `.glb` to **41,7 MB** — połowa repo.

**Całe katalogi bez ani jednego odwołania w kodzie:**
- `public/_base-brand/__MACOSX/` — **26 plików metadanych macOS** (`._*`), artefakt rozpakowania ZIP-a. Zero wartości, kasować bezwarunkowo.
- `public/Morpho Brand Kit/` — 33 pliki, ~0,4 MB, zero odwołań.
- `public/_base-brand/` — 43 pliki (poza `__MACOSX`), zero odwołań. Żywy jest `public/brand-kit/base/`.
- `public/brand-kit/base/fonts/` — z 30 plików woff2 kod (`app/globals.css`, `app/Docs/mysphere-whitepaper/page.tsx`) ładuje tylko kilka wariantów Coinbase Display. **Wszystkie warianty Italic + całe rodziny Coinbase-Text, Coinbase-Sans i Coinbase-Mono (25 plików, ~1 MB) są nieładowane.** Spójne z audytem #18 („15 rodzin fontów w klasach `.font-*` nigdy nieładowanych").

> Assety `public/` nie trafiają do JS bundle'a, więc **nie przyspieszą ładowania strony** — ale skrócą deploy, `git clone` i checkouty CI. Traktuj jako higienę, nie jako performance.

---

## 8. Zależności npm

Audyt (#9) wymienia ~30 pakietów do wycięcia. Moja analiza potwierdza jego listę i **dokłada kilka pozycji**, ale też jedną **koryguje**:

**Korekta:** audyt każe ZOSTAWIĆ `tsparticles-slim` i `react-tsparticles`. Oba są importowane **wyłącznie przez `app/components/Background/ParticlesBackground.tsx`, który jest martwy** (0 importerów). Po usunięciu komponentu wszystkie trzy pakiety tsparticles (`tsparticles`, `tsparticles-slim`, `react-tsparticles`) znikają.

**Dokładki do listy audytu:**
```
@coinbase/wallet-sdk           — zero bezpośrednich importów (wagmi ma własny transytywnie)
@privy-io/server-auth          — audyt wymienia, potwierdzam: zero użyć
@radix-ui/react-toast          — zero użyć (nie ma components/ui/toast.tsx)
uuid + @types/uuid             — zero importów
zod                            — zero importów w źródłach (jest w `overrides`, zostawić tam)
react-is                       — dodany w commicie fd5afc9 „fix Vercel build"; sprawdź, czy nadal potrzebny po `npm install`
react-intersection-observer    — zero importów (kod używa gołego IntersectionObserver)
remark-gfm                     — zero importów (react-markdown używany bez pluginów)
```

**Warunkowo — dopiero po usunięciu martwych plików z §3:**
```
cmdk                     ← tylko components/ui/command.tsx
@radix-ui/react-popover  ← tylko components/ui/popover.tsx
@radix-ui/react-progress ← tylko components/ui/progress.tsx
@radix-ui/react-switch   ← tylko components/ui/switch.tsx
@radix-ui/react-toggle, @radix-ui/react-toggle-group ← tylko martwy łańcuch toggle
```

**Nie ruszać** mimo braku bezpośrednich importów: `@types/*`, `autoprefixer`, `postcss*` (używane przez `postcss.config.js`), `typescript`, `eslint*`, `ts-node`, `cross-env` (skrypty npm), `pino-pretty` (`next.config.js` externals), polyfille `*-browserify` (`next.config.js` fallbacks), `@openzeppelin/contracts` (importowane z `.sol`), `@nomicfoundation/*` + `chai*` + `@typechain/*` (hardhat).

---

## 9. Zduplikowane / porzucone pliki konfiguracyjne w roocie

```
on                      ← plik bez rozszerzenia, 6,2 KB: przypadkowa kopia package.json
                          (z `"build": "rm -rf node_modules package-lock.json && npm install && next build"`).
                          Audyt §4 też to wychwycił. Kasować.

postcss.config.js       ← AKTYWNY (Next preferuje .js)
postcss.config.mjs      ← MARTWY, inna konfiguracja (bez postcss-flexbugs-fixes, z nesting-rules:false).
                          Dokładnie ta sama pułapka co next.config.mjs z fazy 1. Kasować.

styles/globals.css      ← 11 linii, zero importerów. Żywy jest app/globals.css (709 linii). Kasować.

hardhat.config.ts + hardhat.tsconfig.json     ← żywe (skrypty npm)
app/basechat/Linea/hardhat-linea.config.ts    ← drugi, niepodpięty config hardhata
app/basechat/Linea/package.json               ← zagnieżdżony package.json, nie jest workspace'em

app/scripts/deploy-autonomous-wallet.ts   ← duplikat scripts/deploy-autonomous-wallet.ts
                                            (różnią się importem hardhata i logami; wersja w scripts/ nowsza).
                                            Zostawić jedną.

public/index.html       ← audyt §4: stary fc:frame. Statyczny plik w public/ przykrywa trasę Next dla `/`?
                          Nie — Next serwuje app/page.tsx, ale plik i tak jest deployowany. Kasować.

minikit.config.ts       ← audyt §3: orphan, zero importerów. Albo skasować, albo podpiąć jako
                          dynamiczną trasę /.well-known/farcaster.json (wtedy zmienne FARCASTER_*
                          zaczną cokolwiek robić). Decyzja produktowa, nie techniczna.

.cursor/plans/*.plan.md ← 2 pliki planów z innej sesji AI, zacommitowane
```

---

## 10. Sugerowana kolejność (zsynchronizowana z Falami z AUDYT.md)

**Fala 0 — czysto mechaniczna, zero ryzyka, przed wszystkim innym.**
Nic tu nie dotyka `page.tsx` / `PostList.tsx` / `providers.tsx`, więc nie koliduje z żadną falą audytu i można zrobić w jednym commicie:

1. `git rm` plików generowanych + fix `.gitignore` (§6) — **−6,5 MB**
2. Kasacja `public/_base-brand/__MACOSX/`, obu `.glb`, `Morpho Brand Kit/`, `_base-brand/`, `public/uploads/`, nieładowanych fontów (§7) — **−50 MB**
3. Kasacja rootowych śmieci: `on`, `postcss.config.mjs`, `styles/globals.css`, `public/index.html`, jednego z dwóch `deploy-autonomous-wallet.ts` (§9)
4. Kasacja 91 martwych plików aplikacji (§3) — **−19 500 linii**
5. Kasacja martwych tras API (§4, sekcja „do skasowania") + zagate'owanie/kasacja endpointów debug
6. `npm run build` → commit

**Fala 0.5 — dopiero po fali 0**, bo dopiero wtedy pakiety są naprawdę osierocone:

7. Usunięcie zależności z §8 (lista audytu #9 + dokładki + warunkowe) → `npm install` → `npm run build` → commit

**Wpięcie w Fale audytu:**
- Przycięcie `PostContract2.ts` do 2 żywych eksportów (§5) rób **razem z audytem #3** (Fala D) — to ta sama zmiana i wtedy ethers wypada z bundle'a jedną podmianą na viem.
- Usunięcie importu `CoinGeckoMarqueeWidget` (audyt #22, Fala A) odblokowuje skasowanie pliku — dopisz plik do tego commita.
- Usunięcie `PrivyProvider` (audyt #1, Fala A) — dorzuć `app/basechat/privy/PrivyProvider.tsx`.
- Punkt Fali E „Staking/MintButton na hooki wagmi" — **wykreślić**, oba pliki są martwe (§2).

---

## 11. Weryfikacja przed usunięciem

Graf importów jest kompletny (brak dynamicznych importów ze zmienną), ale **nie wykrywa**:
- referencji z `.env.local` / dashboardu Vercela (np. ścieżka do skryptu w cronie),
- endpointów wołanych z zewnątrz (webhooki, ręczne curle adminowe),
- ABI ładowanych ze ścieżki jako string.

Dlatego przed masową kasacją: `git grep -n "artifacts/"` i przejrzyj listę „do zweryfikowania ręcznie" z §4.

Bezpieczna procedura: kasuj falami po ~20 plików, po każdej `npm run build`, każda fala osobnym commitem — łatwy `git revert` przy niespodziance.
