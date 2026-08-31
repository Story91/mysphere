# Audyt kosztów Firebase i Vercela (2026-08-12)

Przeczesane: cały kod klienta i serwera (51 tras API, `app/utils/firebase.ts`
5,5 tys. linii, basechat, asks, startpad, b20, money, admin, profile),
`vercel.json`, `next.config.js`, `firestore.indexes.json`. Najcięższe
twierdzenia zweryfikowane ręcznie w kodzie (plik:linia przy każdym punkcie).
Stary plan awaryjny (`docs/FIREBASE_COST_REDUCTION_PLAN.md`, 1000$ w 3 dni)
jest w większości wdrożony: limity 50, paginacja z cache, wyszukiwarka
użytkowników wyłączona. Ten audyt pokazuje, co zostało i co doszło od tamtej
pory.

## Werdykt w trzech zdaniach

Nie ma ani jednego listenera realtime (`onSnapshot`: zero trafień), więc koszty
robią zwykłe odczyty pomnożone przez wzorce: globalny dzwonek powiadomień na
każdej trasie, podwójny `PostList`, zapytania bez `limit()` i panel admina
skanujący całą bazę. Jedno zimne wejście na `/basechat` to dziś rzędu
kilkuset do ~1000 odczytów Firestore; jedno kliknięcie w statystyki admina
to ~450 000. Po stronie Vercela największe pozycje to trasy bez nagłówków
cache (link-preview, basemorning), polling co 30-60 s z kilku komponentów
i `list()` na Blobie bez cache serwerowego; do tego jedna dziura
bezpieczeństwa: token zapisu Bloba w bundlu klienta.

## Bezpieczeństwo, naprawić przed optymalizacją

`app/basechat/page.tsx:2354` wysyła `put()` do Vercel Blob wprost z
przeglądarki tokenem `NEXT_PUBLIC_BLOB_READ_WRITE_TOKEN`. Prefiks
`NEXT_PUBLIC_` wkleja token do publicznego bundla JS, a token read-write
pozwala też listować i kasować. Każdy może go wyjąć z devtools i pisać po
naszym magazynie na nasz rachunek. Zmiana avatara musi iść przez istniejące
`POST /api/upload` (tak jak reszta uploadów), a token z env klienta trzeba
usunąć i UNIEWAŻNIĆ w panelu Vercela, bo stary bundle zostaje w cache'ach.

## Firebase: najdroższe wzorce

Ranking po iloczynie mnożnik razy częstotliwość. Numery są odnośnikami do
planu niżej.

1. Panel admina skanuje całe `users` + `posts`, w trzech kopiach.
   `app/utils/firebase.ts:2894/2898` (`getGlobalStatsRealTime`), `2969/2970`
   (`getGlobalStatsIncremental(true)`), `3129/3133` (`getGlobalStats`), wołane
   z `app/admin/page.tsx:189/217/255`. Kod sam loguje koszt (linia 2936).
   Przy ~184k users i ~264k posts jedno kliknięcie to ~450 000 odczytów,
   czyli rząd wielkości dziennego budżetu. `getCountFromServer` w
   `admin/components/Statistics.tsx:61-88` byłby tani (agregacje liczone
   1/1000 dokumentów), ale komentarze w `firebase.ts:396-401` mówią, że
   agregacje na tym projekcie zwracały RESOURCE_EXHAUSTED; do sprawdzenia.

2. Dzwonek powiadomień w globalnej nawigacji czyta 20 pełnych dokumentów
   na każde wejście na każdą trasę. `app/components/AppShell.tsx:40` montuje
   `Navigation`, ta `NotificationsBell`, a hook
   (`app/basechat/friendsystem/hooks.ts:487-490`) robi `getNotifications(20)`
   + `getUnreadNotificationsCount()`. Licznik nieprzeczytanych leży gotowy
   w `users/{id}`, więc do samej kropki wystarczy 1 odczyt; 20 dokumentów
   powinno się pobierać dopiero po otwarciu listy. To jedyny wzorzec mnożony
   przez wszystkie odsłony aplikacji, nie tylko basechat.

3. Panel społeczny (`useSocial.loadAllData`,
   `app/basechat/friendsystem/hooks.ts:172-221`) odpala 7 loaderów naraz,
   w tym `getFollowing` z doczytką do 1000 followersów na sam znacznik
   "mutual" (`follows.ts:333-338`, `config.ts:95` MAX_FOLLOWERS_FETCH=1000)
   i `getNotificationsSummary`, które czyta 100 dokumentów, żeby policzyć
   liczbę leżącą gotową w profilu. Otwarcie zakładki Friends/Following/
   Discover/Notifications: ~270 do ~1300 odczytów.

4. Dwie instancje `PostList` na jednym ekranie podwajają wszystkie zapytania
   zbiorcze feedu. `app/basechat/page.tsx:4929` (feed) +
   `PinnedPosts.tsx:152` (przypięte) renderują pełny `PostList` z kompletem
   hooków: `getBulkPostTipStats`, `fetchFollowingIdSet` (do 1000 dokumentów,
   osobny cache per instancja), unlocks, subscriptions. Cała praca włożona
   w "jedno zapytanie na 30 postów" jest po cichu mnożona przez dwa.

5. `setInitialLastVisible` unieważnia cache feedu.
   `PostList.tsx:1435-1457`: po każdym montażu, nawet przy 100% trafieniu
   w 5-minutowy cache localStorage, leci do Firestore po te same posty tylko
   po to, żeby dostać kursor paginacji (`QueryDocumentSnapshot`). Deps wiszą
   na tożsamości tablicy `internalPosts`, więc zanim kursor się ustawi,
   każdy optymistyczny update odpala efekt ponownie. Razy dwie instancje.

6. Most Active: obietnica 10, pobiera 60, polling trafia zawsze w zimny
   cache. `firebase.ts:4668` + `3760` (zapas 20%) dają 60 dokumentów mimo
   `pageSize=10`. Interval w `page.tsx:2596-2605` tyka co 10 minut, a TTL
   cache'u paginowanego to dokładnie 10 minut, więc każde tyknięcie idzie
   do bazy. Zostawiona otwarta karta: ~8,6 tys. odczytów na dobę.

7. Zapytania bez `limit()` rosnące z danymi:
   - `fetchPinnedPosts` (`firebase.ts:3876-3893`): wszystkie kiedykolwiek
     przypięte posty + wszystkie aktywne paidPins, na każde wejście na feed;
   - `getUserTipStats` (`firebase.ts:4205-4211`): dwa pełne skany `tips` po
     adresie na otwarcie profilu twórcy;
   - `getProfile` (`app/utils/profile/getProfile.ts:110-116`): dwa
     nieograniczone skany `tips` na publicznej trasie `/u/[address]`,
     odwiedzanej przez boty (sitemap);
   - `getPostForShare` (`getPostForShare.ts:117-118`): do 500 tipów na każde
     wyświetlenie `/post/[id]`, a trasa nie ma `revalidate`, więc każdy
     crawler płaci pełną cenę;
   - `getAnswerMeta` (asks), `getAgentFeedback`, `admin/quotes`.

8. Gorący dokument `globalStats/current` dostaje zapis od każdego lajka
   każdego użytkownika (`firebase.ts:499-510`). Twardy limit Firestore to
   ~1 zapis/s na dokument; to jednocześnie koszt i przyszłe wąskie gardło.
   Publikacja posta to ~8 zapisów w 3 osobnych rzutach poza batchem
   (`firebase.ts:703-791` + `page.tsx:1639-1663`).

9. Grube dokumenty postów: pełna tablica `comments[]` i `likedBy[]` w każdym
   dokumencie (`firebase.ts:1048-1059`, `449-452`), komentarze zapisywane
   podwójnie (tablica w poście + kolekcja `comments`). Każdy odczyt feedu
   ciągnie całą historię komentarzy 15 postów; edycja komentarza przepisuje
   całą tablicę.

10. Brak indeksów wymusza nadpobieranie: `firestore.indexes.json` nie ma
    indeksów dla `tips`, `users`, `referrals` i innych, stąd wzorzec
    "pobierz 50, pokaż 10" (`getRecentTips`, `firebase.ts:4388-4396`),
    ROW_CAP 100 x ~6-15 zapytań w `getMoneyLedger`, sortowanie w pamięci
    w `getAgentFeedback`.

Rachunek zimnego wejścia na `/basechat` (zalogowany, pusty localStorage):
dzwonek ~21, profil+statusy ~6, feed 15, duplikat kursora 30 (2 instancje),
Most Active 60, przypięte N bez limitu, szyna asków 30, tipy pod postami T
bez limitu, following 2x do 1000, nazwy ~120 na zimno. Dla konta obserwującego
200 osób i feedu z 30 tipami: około tysiąca odczytów na jedno wejście.

## Vercel: najdroższe wzorce

1. `GET /api/link-preview` (`route.ts`, wołane z `LinkPreview.tsx:96` per
   link w poście): jedyna gorąca trasa bez żadnego `Cache-Control`, bez
   `runtime`, bez dedupu po URL. Każda invokacja trzyma zewnętrzny fetch do
   5 s i ściąga do 512 KB HTML. Mnożnik: posty x linki x każdy mount.

2. `GET /api/b20/board`: polling co 45 s z każdej otwartej karty
   (`B20Board.tsx:448-489`, `cache:'no-store'`), odpowiedź to snapshot
   ~500 tokenów, a cache-miss na CDN (s-maxage=60) kosztuje 19 zapytań RPC
   + GeckoTerminal i 1,8-2,5 s czasu funkcji. Do tego `/b20` jest SSR.

3. `GET /api/basemorning/stats`: dwie pętle (PublicStats 60 s bez pauzy na
   ukrytej karcie, AdminPanel 30 s), zero nagłówków cache, agregacje Mongo
   w każdej invokacji.

4. `GET /api/b20/token/[address]` per karta B20 w feedzie
   (`B20PostCard.tsx:78`): remount przy przewijaniu odpala fetch ponownie,
   brak cache po stronie klienta; ogon rzadkich adresów zawsze trafia w
   funkcję (RPC + GeckoTerminal).

5. `GET /api/premium?postId=` per post premium (`PremiumGate.tsx:165`):
   `no-store`, firebase-admin w każdej invokacji (najcięższy cold start
   w projekcie), useEffect z pięcioma zależnościami.

6. `/post/[id]`: pełny SSR bez `revalidate` + osobny OG-image bez cache;
   `getPostForShare` nie jest owinięte w React `cache()`, więc jedno
   udostępnienie posta to 5 odczytów Firestore, a trasę odwiedzają głównie
   crawlery.

7. `GET /api/startpad/logos`: `force-dynamic` + `list({limit:1000})` na
   Blobie przy każdym cache-missie CDN; koszt operacji Blob rośnie liniowo
   z liczbą logo. Wołane z tablicy i z detalu tokena.

8. `POST /api/onramp/session-token` na każde połączenie portfela na każdej
   stronie (`useFundingUrl` w globalnej nawigacji): nowy JWT + fetch do CDP
   przy każdej zmianie konta/sieci/remoncie, bez cache.

9. `GET /api/wallet-stats`: do 14 zewnętrznych fetchy (10 stron paginacji
   Blockscout + 3 doczytki) w jednej invokacji, bez cache i bez
   `maxDuration`; koszt czasu wykonania, nie liczby wywołań.

10. Drobiazgi, które nic nie dają, a kosztują: rewrite `/flashblock/:path*`
    do obcego deploymentu (zero użyć w kodzie, otwarty proxy na nasz
    egress); `/api/camp-stats` i `/api/myclaw/catalog` jako force-dynamic
    invokacje zwracające dane zahardkodowane w kodzie; `/api/yaps` i
    `/api/yaps/metrics` robiące identyczny fetch do Kaito; fetch do
    nieistniejącej trasy `spotify/debug` (404 też jest invokacją);
    `GET /api/launchpad/tokenlist` z ACAO:* robiący do 600 wywołań RPC na
    invokację dla obcych agregatorów. 33 z 51 tras nie ma żadnego
    `Cache-Control`, 21 nie deklaruje `runtime`.

Co NIE kosztuje, wbrew pozorom: `watchContractEvent` startpada (poll 8 s)
i marketplace idą z przeglądarki wprost na publiczne RPC, poza rachunkiem
Vercela; obrazy mają `unoptimized:true` (zero płatnych transformacji);
jedyny cron (`curator-watch`, raz na dobę) jest tani; wszystkie `setInterval`
w zegarkach UI nie dotykają sieci.

## Plan optymalizacji

Faza 1, szybkie i bez ryzyka (jeden dzień):
- wyciąć token Bloba z klienta (avatar przez `/api/upload`), unieważnić token;
- dzwonek: 1 odczyt licznika na trasę, pełna lista dopiero po kliknięciu;
- skasować duplikat `setInitialLastVisible` (kursor można dostać z tego
  samego zapytania, które wypełnia feed, albo dociągać dopiero przy "Load
  more");
- `PinnedPosts` bez drugiego pełnego `PostList` albo z przekazaniem danych
  z pierwszej instancji; `fetchPinnedPosts` z `limit()`;
- interval Most Active z 10 min na 30+ min albo TTL dłuższy od intervalu;
  wyrównać 60 do faktycznych 50;
- `limit()` wszędzie tam, gdzie go nie ma (tips w profilach, pinned,
  answers, quotes, agentFeedback);
- `Cache-Control` + `runtime` na link-preview (np. s-maxage=86400 per URL,
  dedup po stronie klienta), basemorning-stats (s-maxage=30/60), premium
  (private, krótki), camp-stats/myclaw-catalog (statyczne: długi cache albo
  zwykłe stałe w bundlu);
- `revalidate` na `/post/[id]` + React `cache()` na `getPostForShare`;
- usunąć rewrite `/flashblock`, zdublowaną trasę yaps, fetch do
  nieistniejącego `spotify/debug`;
- pauza na `document.hidden` w pollingach (eth-price, PublicStats).

Faza 2, strukturalne w basechacie (kilka dni):
- liczniki zamiast dokumentów: `commentsCount`, `likesCount`, `tipsTotal`
  utrzymywane przy zapisie, feed przestaje ciągnąć tablice `comments[]`
  i `likedBy[]` (nowe pola + migracja + odchudzenie `mapPostDoc`);
- `getBulkPostTipStats` na zagregowane liczniki per post zamiast wszystkich
  dokumentów tips;
- jeden system powiadomień (dziś są dwa równoległe), licznik nieprzeczytanych
  wyłącznie z pola w profilu;
- panel admina: statystyki z `globalStats/current` utrzymywanego
  inkrementalnie (już istnieje) plus dzienne snapshoty z crona, pełne skany
  za twardą flagą z potwierdzeniem; sprawdzić, czy `getCountFromServer`
  działa po podniesieniu limitów;
- indeksy złożone dla `tips` (postId+timestamp, recipient+timestamp),
  `notifications` (isRead), `following`; po nich znikają wzorce
  "pobierz 50, pokaż 10";
- rozładować `globalStats/current` (sharded counters albo agregacja z crona
  zamiast zapisu przy każdym lajku).

Faza 3, porządki (przy okazji):
- `/api/startpad/logos`: cache w pamięci funkcji z TTL zamiast `list()` na
  każdy miss, albo manifest logo w jednym blobie;
- onramp session-token dopiero na klik "Fund", nie na mount nawigacji;
- b20: rozważyć web push/ETag zamiast pełnego snapshotu co 45 s, klientowy
  cache na `token/[address]`;
- usunąć martwy kod (wyłączona wyszukiwarka użytkowników ~1,5 tys. linii,
  `fetchUserStats` bez importów, trasy-crony bez crona) i `console.log`
  w gorących ścieżkach;
- `maxDuration` + cache na `wallet-stats`.

Szacunek łączny: faza 1 tnie odczyty Firestore na wejście na feed o 60-70%
(dzwonek, duplikat kursora, druga instancja PostList, Most Active) i zdejmuje
większość pustych invokacji Vercela; faza 2 zdejmuje mnożniki rosnące z
danymi (tips, comments, likedBy), które dziś rosną same z siebie nawet bez
wzrostu ruchu.

## Zrobione dobrze, nie ruszać

Chunki po 30 z `where(documentId(),'in')` (`fetchDocsByIds` i rodzina),
klucze deps po ID zamiast tożsamości tablic w `PostList:550-561`,
`presetPostStats` eliminujący N+1 w TipStats, cache nazw 24/48 h, `hints`
w `toggleLike` (zero odczytów), `unstable_cache` na leaderboardzie,
`limit(2)` przy "pierwszym poście", uploady jako URL-e w Blobie zamiast
data-URLi w Firestore, brak jakiegokolwiek `onSnapshot`.
