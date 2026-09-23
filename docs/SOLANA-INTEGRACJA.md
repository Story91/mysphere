# Solana w basechacie

Stan na 23 września 2026, osobno dla każdej części:

| Część | Commit | Stan |
|---|---|---|
| Postowanie | d00cdde | potwierdzone na mainnecie 22–23.09 |
| Napiwek w SOL (Blink + `/blink/tip`) | a32872f | w kodzie; nikt spoza zespołu nie zapłacił nim jeszcze na mainnecie |
| Proof of Bags | 08b0f73 | sprawdzony symulacją na mainnecie; żaden prawdziwy post go jeszcze nie niósł |
| Post zapisywany przez serwer, rejestr kwitów, płatne odpowiedzi z X | 50e4889 | w kodzie; reguły Firestore wdrożone 23.09; nikt spoza zespołu nie zapłacił jeszcze płatnej odpowiedzi |

## Co zostało zrobione i dlaczego akurat tak

MySphere miała do tej pory osiem łańcuchów i wszystkie były EVM. Solana jest
pierwszym wyjątkiem, więc pierwsza decyzja dotyczyła nie kodu, tylko zakresu.
Teraz: 9 sieci postowania (8 EVM + Solana), napiwki w aplikacji na 8 EVM.

**Post w tej aplikacji nie żyje onchain.** Treść, lajki, komentarze i profile
siedzą w Firestore (`createPost` w `app/utils/firebase.ts`). Łańcuch dostaje
wyłącznie kwit — podpis transakcji zapisany w polu `txHash`. Do 23.09.2026
żadna trasa serwerowa tego podpisu nie weryfikowała. Od tego dnia post z Solany
zapisuje wyłącznie serwer (`POST /api/solana/post`) po odczytaniu transakcji
z łańcucha — patrz „Kto decyduje o portfelu do wypłat”. Posty z sieci EVM
dalej zapisuje przeglądarka. Poza tym weryfikacja receiptów istnieje tylko tam,
gdzie idą pieniądze (Aski w `app/api/asks/[id]/escrow-resolve`, piny
w `app/api/sync-pin-events`).

Z tego wynikły dwa możliwe zakresy:

| | Logowanie portfelem Solany | Kwit na Solanie dla użytkownika EVM |
|---|---|---|
| Tożsamość | przepisana od zera | nietknięta |
| Zasięg zmian | `wagmi` w 100 plikach, `useAccount` w 88, `0x${string}` w 276 miejscach, SIWE przypięte do chainId 8453 | jeden nowy przycisk |
| Co się psuje | profile, follow, tipy, ranking, bany — wszystko kluczowane adresem `0x` | nic |
| Czas | tygodnie | dzień–dwa |

Wybrany został wariant drugi. **Autorem posta pozostaje adres EVM z wagmi.**
Portfel Solany podpisuje wyłącznie kwit.

Memo niesie adres Solany, który podpisał transakcję — **nie** adres EVM:
`mysphere:post|v2|<postId>|<podpisujący Solana>|<pierwsze 280 bajtów treści>`.
Łańcuch nie zna adresu logowania. Oba portfele wiąże publicznie MySphere:
`posts` jest do odczytu dla każdego, `/post/<id>` pokazuje autora EVM, a karta
Blinka drukuje portfel Solany obok jego nazwy. Memo jest publiczne i zostaje
na zawsze.

## Dlaczego Memo Program, a nie własny program w Anchorze

Skoro kwit jest jedynym zadaniem transakcji, własny program nie dodałby nic
poza kosztem: depozytem rent za bajtkod (rzędu 1–2 SOL), łańcuchem narzędzi
Rusta w repo, które dziś jest w całości TypeScriptem, i drugą rzeczą do
utrzymywania. Memo Program stoi na mainnecie i devnecie od lat i nie kosztuje
nic.

Własny program zacznie mieć sens dopiero wtedy, gdy post ma faktycznie żyć
onchain — indeksowanie, odczyt feedu z łańcucha, nagrody za posty.
`app/basechat/Solana/config/solanaChain.ts` jest jedynym miejscem, które o tym
wie.

## Pliki

**Nowe**

| Plik | Rola |
|---|---|
| `app/basechat/Solana/config/solanaChain.ts` | klaster, RPC, adres Memo, link do eksploratora, budowa treści memo |
| `app/basechat/Solana/config/SolanaPostingConfig.tsx` | wygląd composera |
| `app/basechat/Solana/components/SolanaWalletProvider.tsx` | drugi stack portfeli, ładowany leniwie |
| `app/basechat/Solana/components/SolanaPostButton.tsx` | transakcja memo zamiast `writeContract` |
| `app/basechat/Solana/components/CreatePostSolana.tsx` | spina powyższe, bramkuje miniapp |
| `app/hooks/useIsFarcasterMiniApp.ts` | wykrycie webview Farcastera |
| `public/solana.svg` | znak sieci |

**Zmienione**

- `app/basechat/chainPosting/ChainCreatePost.tsx` — nowy opcjonalny prop
  `PostButton` i typ `ComposerOnlyConfig`. Sześć istniejących sieci EVM nie wie,
  że coś się zmieniło.
- `app/basechat/page.tsx` — zakładka, deep link `?network=`, typ `PostingNetwork`
- `app/basechat/components/PostList.tsx` — odznaka i eksplorator
- `app/basechat/soft/SoftStoryRail.tsx` — wpis w `SOFT_NETWORKS`
- `app/components/NetworkSwitcher/NetworkSwitcher.tsx` — wpis nawigacyjny
- `app/types.ts`, `app/utils/firebase.ts` — `'solana'` w uniach `network`
- `app/how/page.tsx` — liczba łańcuchów (była nieaktualna już przed tą zmianą:
  mówiła o siedmiu, a Arc stał tam ósmy)

## Trzy rzeczy, które wyglądają na drobiazgi, a nie są

**1. `solanaChain.ts` nie może importować z `@solana/web3.js`.**
Czyta go również `PostList`, a ten siedzi w głównym bundlu feedu. Jeden import
web3.js w configu przeciągnąłby cały stack Solany (207 pakietów) do każdego
użytkownika, który otwiera feed — czyli dokładnie to, czemu zapobiega
dynamiczne ładowanie providera. Dlatego adres programu jest stringiem, a
`new PublicKey(...)` powstaje dopiero w przycisku.

**2. Globalny `Buffer` nie istnieje w bundlu przeglądarkowym Next.js.**
`SolanaPostButton` importuje go jawnie z `'buffer'`. Bez tego `Buffer.from(...)`
wywaliłoby się w runtime — już **po** tym, jak użytkownik podpisze transakcję.

**3. Blockhash pobierany jest raz.**
Ten sam obiekt idzie do wysyłki i do `confirmTransaction`. Drugie
`getLatestBlockhash` po wysłaniu potrafi zwrócić nowszy blok i wtedy
potwierdzenie wygasa mimo udanej transakcji.

## Miniapp Farcastera

Phantom, Solflare i Backpack to rozszerzenia przeglądarki. W webview
Farcastera nie istnieją i nie pojawią się — portfel jest tam wstrzykiwany przez
hosta i jest to portfel EVM.

Dlatego zakładka Solany w miniappie **znika**, a deep link `?network=solana`
pokazuje wyjaśnienie zamiast formularza. Bez tego byłby to przycisk otwierający
wybór portfela, w którym nie ma czego wybrać — dokładnie to, czym przez miesiąc
był Robinhood z pustym adresem kontraktu.

Hook zwraca trzy stany, nie dwa. `null` znaczy „jeszcze nie wiem" i wstrzymuje
render, żeby zakładka nie mignęła użytkownikom miniappa przed schowaniem.

## Klaster

Domyślnie **devnet**. SOL z faucetu jest darmowy, więc development i testy nie
kosztują nic.

Mainnet włącza jedna zmienna, bez zmiany kodu — ale z nowym buildem:

```
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
```

| Zmienna | Co robi |
|---|---|
| `NEXT_PUBLIC_SOLANA_CLUSTER` | Mainnet daje wyłącznie dokładny napis `mainnet-beta`; każda inna wartość albo brak to devnet (`solanaChain.ts`). Ustawia też CAIP-2 w nagłówku `X-Blockchain-Ids`. Produkcja zbudowana na devnecie nie wystawia Blinków: trasy `/api/actions/*` odpowiadają 503, a linki do nich znikają (`blinksDisabled` w `actionHeaders.ts`). |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Opcjonalna. Domyślnie `solana-rpc.publicnode.com` na mainnecie (publiczny `api.mainnet-beta.solana.com` z przeglądarki zwraca 403 — sekcja niżej) i `api.devnet.solana.com` na devnecie. Czyta ją przeglądarka **i** trasy serwera (`/api/solana/post`, `/api/actions/*`, `/api/bags/*`). Przez prefiks `NEXT_PUBLIC_` adres, razem z kluczem, trafia do publicznego bundla. Klucza nie blokować po originie: funkcje Vercela nie wysyłają Origin przeglądarki, więc taka blokada wyłączyłaby Blinki i odznaki Proof of Bags. |
| `NEXT_PUBLIC_SITE_URL` | Adres domeny dla ikon kart Blinków — patrz „Jak włączyć Blinki”. |
| `GOOGLE_CREDENTIALS` | Firebase Admin: zapis postów z Solany, rejestr kwitów, płatne odpowiedzi, moderacja. Bez niej karta odpowiedzi i jej POST zwracają 503 „Replies are temporarily unavailable. Nothing was charged.” |

`NEXT_PUBLIC_*` są wklejane w kod przy buildzie: zmiana w Vercelu wymaga
redeployu.

## Koszty

- Deploy: **0** — Memo Program jest cudzy i już stoi.
- Transakcja posta: ~0,000005 SOL, płaci ją **portfel użytkownika**.
- Brak keepera, więc **brak dosypywania gazu** — inaczej niż przy perps na Arc.
- Budżet właściciela na własne testy na mainnecie: ~0,05 SOL z zapasem.

## Czego świadomie NIE zrobiono

**Tipy w aplikacji.** `TipNetworkType` w `app/utils/firebase.ts` pozostaje bez
`'solana'`: `TipButton` działa na 8 sieciach EVM. Napiwek w SOL istnieje
wyłącznie jako Blink i strona `/blink/tip` (sekcja „Blinks”) i **nie jest
zapisywany**: nie trafia do `tips`, na Paid, do /money, do sumy napiwków posta
ani na stronę `/tip/<hash>`. Jedynym zapisem jest transakcja z memo
`mysphere:tip|<postId>`. To samo dotyczy napiwku w płatnej odpowiedzi.

**Komentarze onchain na Solanie.** `COMMENT_BUTTON_BY_CHAIN` w `PostList` jest
kluczowane numerycznym chainId, którego Solana nie ma. Zachowanie nie uległo
pogorszeniu: przycisk komentarza zawsze zależał od sieci **portfela**, a nie od
sieci posta, więc użytkownik na Base komentujący post z Solany zapisuje kwit na
Base — tak samo jak dziś komentuje posty z Celo. Jedyną ścieżką komentarza
z kwitem na Solanie są płatne odpowiedzi z X (sekcja niżej), zapisywane przez
serwer.

**Solana jako sieć logowania.** Patrz tabela na górze.

## Stan weryfikacji

- `tsc --noEmit` — czysto (błędy w `test/` są sprzed tej zmiany, dotyczą
  Hardhata i nie wchodzą do `next build`).
- `next build` — przechodzi.
- **Potwierdzone na mainnecie 22–23 września 2026.** Post „GM from SOLANA"
  przeszedł i wylądował w feedzie z odznaką Solany.
- `npm run test:solana` — 43 passing (23.09.2026), szczegóły w „Testy” niżej.

## Co się zepsuło przy pierwszym uruchomieniu na mainnecie

Dwie awarie, obie naprawione, obie warte zapamiętania.

**1. `api.mainnet-beta.solana.com` zwraca z przeglądarki 403.** Nie rate limit —
odmowa. Ten endpoint jest przeznaczony do lokalnego developmentu. Użytkownik
zobaczył „failed to get recent blockhash". Przetestowane pięć endpointów tym
samym zapytaniem: ankr 403, drpc 400, publicnode 200 z CORS i przepuszczonym
`sendTransaction`. Domyślny mainnet to od tej pory publicnode.

**2. Wygaśnięcie okna potwierdzania nie znaczy nieudanej transakcji.** Pierwszy
post dostał „has expired: block height exceeded", a był w tej samej chwili
`finalized` z pobraną opłatą. Aplikacja skasowała treść, za którą użytkownik
już zapłacił, i nic nie zapisała do Firestore. Blockhash jest ważny ~150 bloków
(około minuty), a odliczanie startuje **przed** oknem portfela — kto zastanawia
się nad podpisem dłużej niż minutę, dostaje „expired" mimo udanej transakcji.

Poprawka: po wyjątku pytamy łańcuch o status podpisu
(`getSignatureStatuses` z `searchTransactionHistory`, 6 prób przez 15 s)
i dopiero brak podpisu uznajemy za porażkę. Rozdzielone są też trzy przypadki,
które wcześniej dawały jeden komunikat: weszło / łańcuch odrzucił / naprawdę
wygasło.

---

# Blinks (Solana Actions)

Dodane 23 września 2026.

## Co to jest i czego nie jest

Solana Action to endpoint, który **cudzy** klient zamienia w klikalną kartę
z przyciskiem. Użytkownik podpisuje transakcję tam, gdzie stoi, bez wchodzenia
na naszą stronę.

**To nie jest natywne osadzenie w X.** Sprawdzone w dokumentacji Solany
i Phantoma: karta rysuje się wyłącznie u osób, które mają zainstalowane
rozszerzenie (Phantom, Backpack, Dialect) **i** włączyły Blinki, bo to funkcja
eksperymentalna domyślnie wyłączona. Dodatkowo adres akcji musi być
zarejestrowany w Dialect Actions Registry, inaczej rozszerzenia nie uznają go
za zaufany.

Dla wszystkich pozostałych działają nasze strony `/blink/tip/<id>`
i `/blink/reply/<id>`: mają własny przycisk portfela Solany i wykonują tę samą
akcję — jedno kliknięcie poza X, a nie zero. Ktoś bez rozszerzenia ma zobaczyć
post i działający przycisk, a nie martwy link. `dial.to` nie jest ścieżką
zapasową: jego deployment jest wstrzymany (`DEPLOYMENT_PAUSED`, 23.09.2026).

## Komu idzie napiwek

Autorem posta w bazie jest adres **EVM**, który SOL-a nie przyjmie. Ale post
z Solany niesie kwit — podpis transakcji w `txHash`. Płatnik opłaty tej
transakcji to portfel Solany, którym autor ten post podpisał. Odczytujemy go
z łańcucha i to on jest odbiorcą.

Dzięki temu nie trzeba nic dopisywać do dokumentów postów ani niczego migrować:
każdy post opublikowany na Solanie już dziś niesie komplet potrzebnych danych.

**Zastrzeżenie:** to adres, który *podpisał* post, a nie zadeklarowany adres do
wypłat. Jeśli autor postował z portfela jednorazowego, napiwek trafi właśnie
tam. Dlatego karta mówi wprost, na który adres idzie przelew.

Od drugiego przeglądu (23.09) portfel nie jest już odczytywany z `txHash`
posta, tylko z rejestru kwitów zapisanego przez serwer w chwili publikacji —
szczegóły w sekcji „Kto decyduje o portfelu do wypłat”.

## Pliki

| Plik | Rola |
|---|---|
| `app/api/actions/actionHeaders.ts` | CORS, `X-Action-Version`, CAIP-2 łańcucha, `originFrom`, `blinksDisabled` |
| `app/api/actions/tip/[postId]/route.ts` | GET metadane, POST transakcja |
| `app/api/actions/solanaPostAuthor.ts` | portfel autora z rejestru kwitów, wspólny dla napiwku i płatnych odpowiedzi |
| `app/actions.json/route.ts` | mapa akcji w korzeniu domeny: `/blink/tip/*`, `/blink/reply/*`, `/api/actions/**` |
| `app/blink/tip/[postId]/page.tsx` | strona dla wszystkich bez rozszerzenia |
| `app/blink/tip/[postId]/{BlinkTipClient,TipPanel}.tsx` | własny portfel Solany na tej stronie |

Pliki płatnych odpowiedzi — w sekcji „Płatne odpowiedzi z X”.

## Dlaczego `actions.json` nie mapuje `/post/*`

Kuszące było odwzorowanie `/post/*` na akcję — wtedy samo wklejenie linku do
posta zamieniałoby go w Blinka. Odrzucone: napiwek w SOL wymaga adresu Solany,
a posty z pozostałych ośmiu sieci go nie mają. Ponieważ posty z Solany są dziś
ułamkiem feedu, taka reguła psułaby podgląd **większości** udostępnianych
linków, żeby poprawić mniejszość.

Gdy większość postów będzie niosła adres wypłaty, mapowanie stanie się sensowne
i będzie jedną linijką.

## Trzy rzeczy zmierzone przy pierwszym teście

1. **Brak `charset=utf-8`** w `Content-Type` rozsypywał każdy znak spoza ASCII.
   Tytuł `Tip 0xF1…1Dfd` przychodził jako `Tip 0xF1â€¦1Dfd`.
2. **`next dev -H 0.0.0.0`** sprawia, że origin żądania brzmi
   `http://0.0.0.0:3000`. To adres nasłuchu, nie adres do wejścia — ikona Blinka
   z takim hostem nigdy się nie pobierze i karta zostaje pusta.
3. Transakcja rozebrana po zbudowaniu: płatnik opłaty = nadawca, transfer
   10 000 000 lamportów do właściwego odbiorcy, memo `mysphere:tip|<postId>`,
   niepodpisana. Zgadza się co do lamporta.

## Czego brakuje do pełni

**Rejestracja w Dialect Actions Registry.** Bez niej rozszerzenia nie rozwiną
karty na X, a działają tylko nasze strony `/blink/*`. Stan 23.09.2026: rejestr
odpowiada (1015 hostów), mysphere.fun w nim nie ma. To formularz, nie kod —
kroki w „Jak włączyć Blinki”.

**`NEXT_PUBLIC_SITE_URL`.** Bez tej zmiennej ikona karty bierze host
z żądania. `VERCEL_URL` nie jest już używany (host konkretnego deploymentu stoi
za ochroną SSO Vercela). Szczegóły w „Jak włączyć Blinki”.

---

# Proof of Bags

Dodane 23 września 2026. Pełny spec z pomiarami:
`docs/superpowers/specs/2026-09-23-proof-of-bags-design.md`.

Post z Solany, który wspomina token (adres minta albo link z pump.fun,
birdeye, jup.ag, solscan; z dexscreenera tylko wtedy, gdy URL niesie adres
tokena, a nie pary — zostaje wyłącznie to, co RPC rozpoznaje jako mint),
dołącza do własnej transakcji konto tokenowe autora. Liczy się tylko
kanoniczne ATA podpisującego portfela: tokeny na innych kontach są niewidoczne
i odznaka pokaże wtedy brak pozycji. Runtime zapisuje wtedy w metadanych transakcji, ile tego tokena
autor miał w chwili publikacji — na zawsze, sprawdzalnie w każdym eksploratorze.
Pod postem pojawia się odznaka: saldo wtedy i co portfel ma teraz.

Trik, na którym to stoi, i dlaczego działa, zmierzone symulacją na mainnecie:
Memo **v1** przyjmuje konta niepodpisujące (v2 je odrzuca), a runtime zbiera
`preTokenBalances` tylko wtedy, gdy w transakcji występuje program tokena —
więc instrukcja niesie oba.

Odznaka mówi o **saldzie portfela**, nie o intencji: „wallet down 82%", nigdy
„sold 82%". Spadek salda może być przelewem na cold wallet.

## Naprawy przy okazji

**Wiązanie posta z transakcją.** `txHash` w dokumencie posta zapisuje klient
i do 23.09 nikt go nie sprawdzał. Dla Blinka z napiwkiem znaczyło to, że wpisanie
cudzego podpisu do własnego posta przekierowywało napiwki na obcy portfel.
Pierwsza naprawa (weryfikacja memo z pól posta) okazała się niewystarczająca —
patrz „Kto decyduje o portfelu do wypłat” niżej.

**`/blink/tip` podpisuje sam.** Przycisk prowadził do `dial.to`, a deployment
Dialectu został wstrzymany (`DEPLOYMENT_PAUSED` pod adresem dial.to, zrzut
właściciela). Strona ma teraz własny portfel Solany i wykonuje tę samą akcję
co Blink.

**Memo przycinane po bajtach.** 180 znaków emoji to ~720 bajtów, a z instrukcją
bags transakcja zbliżałaby się do limitu 1232 B. Teraz 280 bajtów UTF-8, bez
rozrywania znaków. Stare posty (ucięte po znakach) weryfikują się dalej.

## Testy

```
npm run test:solana
```

43 testy czystej logiki (zmierzone 23.09.2026: 43 passing), mocha + ts-node
przez `scripts/test-solana.cjs`, bo `npx hardhat test` na Node 24 nie ładuje
`.ts` z `app/`:

- 23 Proof of Bags (`test/solanaBags.test.ts`): wykrywanie mintów (w tym
  odrzucenie fragmentu 88-znakowego podpisu i adresu EVM), format memo,
  werdykty na BigInt, przycinanie po bajtach, wiązanie memo z treścią, odczyt
  dowodu z transakcji (w tym odrzucenie cudzego konta tokenowego),
- 20 płatnych odpowiedzi (`test/solanaReplies.test.ts`) — lista w sekcji
  „Płatne odpowiedzi z X”.

Symulacja na mainnecie z prawdziwym kodem aplikacji: portfel z 1,84 USDC →
`holding`; portfel bez USDC → konto nie istniało → `no-position`. Transakcja
555 B przy limicie 1232.

---

# Kto decyduje o portfelu do wypłat

Stan po drugim przeglądzie przeciwnika, 23 września 2026 (19 potwierdzonych
znalezisk, 3 głosy na każde).

## Problem

Kolekcja `posts` była zapisywalna dla każdej przeglądarki — padała pod ogólną
regułę na końcu `firestore.rules`. Reguły, które zamykają tę drogę dla postów
z Solany, wdrożono 23.09.2026 (sekcja „Reguły Firestore” niżej). Napiwki z Blinka, płatne odpowiedzi i odznaka Proof of Bags biorą
portfel autora z kwitu posta, więc kwit musi pochodzić z miejsca, którego klient
nie zapisze.

Pierwsza naprawa (rejestr weryfikowany „leniwie”, z pól posta, z oknem czasowym
względem `createTime`) miała dziurę: `createTime` resetuje się, gdy dokument
zostanie skasowany i założony od nowa. Ktoś mógł skasować cudzy post, założyć go
od nowa z identyczną treścią i własną świeżą transakcją — i przejąć napiwki.

## Rozwiązanie

1. **Memo niesie ID posta** (`mysphere:post|v2|<postId>|<podpisujący>|<treść>`).
   ID powstaje w przeglądarce przed transakcją (`newPostId`), więc jedna
   transakcja należy do jednego posta na zawsze.
2. **Post z Solany zapisuje wyłącznie serwer** — `POST /api/solana/post`.
   Weryfikuje: memo niesie to ID i tę treść, podpisujący memo = płatnik opłaty,
   transakcja nie starsza niż 30 minut. Autor (adres EVM) pochodzi z sesji SIWE,
   nie z żądania — dlatego przycisk loguje przed transakcją, a nie po.
3. **Post i wpis w rejestrze powstają w jednej transakcji Firestore**, a wpis
   przez `create`: istniejącego nikt nie nadpisze, pierwszy zapis wygrywa.
4. **Odczyt nigdy niczego nie wyprowadza z posta.** Brak wpisu = brak wypłat
   (`unregistered`). Wpis z nieprawidłowym HMAC = alarm w logach i blokada
   (`tampered`), a nie „zweryfikuj od nowa”.
5. **Klucz HMAC ma identyfikator** (`kid`): `SOLANA_RECEIPT_SECRET` albo klucz
   prywatny konta usługowego po sparsowaniu (JSON i base64 dają ten sam klucz).
   Celowo nie `AUTH_SESSION_SECRET` — jego rotacja nie może unieważniać rejestru.
6. **Karta Blinka nazywa odbiorcę z rejestru** (adres z sesji SIWE albo portfel),
   nie z pól posta, które zmieni każdy.
7. **Wpis pamięta klaster.** Kwit z devnetu nie otworzy płatności na mainnecie.

Najgorsze, co może zrobić napastnik przed wdrożeniem reguł: skasować wpis
w rejestrze i wyłączyć napiwki pod postem. Przekierować ich nie może.

## Stare posty

Posty z Solany zapisane przez przeglądarkę przed tą zmianą nie mają wpisu, więc
napiwki i odznaka są pod nimi wyłączone. Rejestruje je jednorazowo
`scripts/solana-backfill-receipts.cjs` (domyślnie suchy bieg, zapis z `--apply`)
— tylko posty z `createTime` przed granicą `LEGACY_POST_CUTOFF_MS`. Post
skasowany i założony od nowa dostaje nowy `createTime` i migracji nie podlega.

## Reguły Firestore (wdrożone 23.09.2026)

- `solanaPostReceipts`: odczyt i zapis tylko serwer.
- `posts`: przeglądarka nie założy posta z `network: 'solana'`; `txHash`,
  `network` i `author` są zamrożone po utworzeniu.
- `comments`: płatnej odpowiedzi nie stworzy ani nie podrobi przeglądarka;
  usunąć ją może serwer (moderacja: admin albo autor posta z rejestru) albo
  kasowanie posta w tym samym batchu.

Według commita 50e4889 wdrożenie 23.09 objęło wszystko poza blokiem
`globalStats` i ograniczeniem kasowania postów z Solany (autor albo admin).
Stan w konsoli sprawdza `node scripts/checkRulesEffect.mjs` →
`solanaPostReceipts: denied`.

## Kolejność dla właściciela

1. ~~`firebase deploy --only firestore:rules`~~ — zrobione 23.09.2026; kontrola:
   `node scripts/checkRulesEffect.mjs`.
2. Zmienne produkcji: `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`,
   `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_SITE_URL`; opcjonalnie
   `SOLANA_RECEIPT_SECRET` (ustaw raz i nie zmieniaj). Redeploy.
3. `node scripts/solana-backfill-receipts.cjs` z tymi samymi zmiennymi co
   produkcja, przejrzeć raport, potem `--apply`.

---

# Płatne odpowiedzi z X

Dodane 23 września 2026 (commit 50e4889). Spec:
`docs/superpowers/specs/2026-09-23-paid-replies-from-x-design.md`.

Ktoś odpowiada na post z Solany i płaci jego autorowi w jednej transakcji:
memo z treścią odpowiedzi plus przelew SOL na portfel, który podpisał post.
Minimum 0.001 SOL. Komentarz zapisuje serwer dopiero po odczytaniu tej
transakcji z łańcucha, a treść bierze z memo, nie z żądania — w feedzie ląduje
dokładnie to, co ktoś podpisał i opłacił.

Tylko pod postami z Solany, bo tylko tam wiemy, który portfel Solany należy
do autora: z rejestru kwitów zapisanego przez serwer w chwili publikacji posta.
To portfel, który **podpisał** post, a nie adres wskazany przez autora do
wypłat.

Stan 23.09.2026: nikt spoza zespołu nie zapłacił jeszcze na mainnecie płatnej
odpowiedzi.

## Przepływ

1. **Karta** — `GET /api/actions/reply/[postId]`: tytuł, fragment posta, pełny
   adres portfela autora, pole tekstu i wybór kwoty 0.001 / 0.01 / 0.05 SOL
   (`REPLY_AMOUNTS_SOL` w `replyCore.ts`). Zanim ktokolwiek zapłaci, karta
   sprawdza, czy serwer w ogóle może zapisać komentarz; jeśli nie — 503
   „Replies are temporarily unavailable. Nothing was charged.”
2. **Transakcja** — `POST /api/actions/reply/[postId]?text=…&amount=…`, body
   `{ account }`. Dwie instrukcje, obie podpisuje odpowiadający:
   - Memo v2: `mysphere:reply|v1|<postId>|<tekst>`,
   - `SystemProgram.transfer` na portfel autora.

   Odpowiedź niesie `links.next` → `/confirm` (action chaining).
3. **Zapis** — `POST /api/actions/reply/[postId]/confirm`: jedno pytanie
   o status podpisu (`getSignatureStatuses`), potem do 4 odczytów transakcji
   co 1,5 s, weryfikacja (`verifyReplyTransaction`) i zapis `comments/{podpis}`
   przez Firebase Admin w transakcji Firestore. `commentsCount` rośnie tylko
   przy faktycznym utworzeniu dokumentu. Po zapisie
   `revalidatePath('/post/<id>')`, żeby odpowiedź była od razu na stronie posta.
4. **Strona dla wszystkich** — `/blink/reply/[postId]`: ten sam przepływ
   własnym portfelem Solany (Phantom, Solflare, Backpack), bez dial.to.

`/confirm` zawsze odpowiada HTTP 200, a stan niesie w treści: `saved`,
`pending` (z przyciskiem „Retry saving”) albo `rejected` (z powodem). Klient
Blinka na każdą odpowiedź spoza 2xx pokazuje sukces poprzedniego kroku, więc
409 albo 503 wyglądałyby w X jak „gotowe” — szczegóły w nagłówku trasy.

## Reguły weryfikacji

- transakcja przeszła (inaczej `failed-tx`),
- płatnik opłaty = odpowiadający,
- autor posta nie odpowie sam sobie (`self-reply`) — sprawdzane i w POST,
  i przy zapisie, bo transakcję da się zbudować samemu,
- memo z dokładnym prefiksem `mysphere:reply|v1|<ten postId>|` (ID zawierające
  `|` nie rozjedzie dopasowania),
- tekst niepusty, znormalizowany, najwyżej 280 bajtów UTF-8. Za długi jest
  **odrzucany**, a nie przycinany: nie redagujemy opłaconej wypowiedzi,
- przelew od odpowiadającego na portfel autora z rejestru, łącznie co najmniej
  1 000 000 lamportów (0.001 SOL); trasa POST ma górny limit 100 SOL,
- świeżości transakcji nie sprawdzamy: ID dokumentu = podpis, więc duplikatu
  nie ma, a późne zgłoszenie prawdziwej, opłaconej odpowiedzi nie jest
  nadużyciem.

## Co trafia do Firestore

`comments/{podpis}`: `author` (adres Solany), `authorName` (skrót adresu),
`content` (z memo), `postId`, `txHash`, `network: 'solana'`, `onchain: true`,
`tipLamports` (string, bo to u64), `via: 'blink'`, `timestamp`, `likes`,
`likedBy`, `mentions`. Dokument `users/{adres}` nie powstaje — istnieje tylko
dla adresów EVM.

Pod komentarzem odznaka „paid reply · X SOL” z linkiem do transakcji
(`PostList.tsx`, `app/post/[id]/page.tsx`). Napiwek z odpowiedzi **nie** trafia
do `tips`: nie ma go na Paid, w /money ani w sumie napiwków posta. Jego
rekordem jest transakcja.

Jeśli pod tym podpisem leży już dokument niezgodny z łańcuchem (np. podróbka
zapisana przed wdrożeniem reguł), `saveVerifiedReply` nadpisuje go
zweryfikowaną treścią (`repaired`) i nie rusza licznika.

## Gdzie to widać w aplikacji

- Pod każdym postem z Solany, tylko na buildzie mainnetowym: „Paid replies on.
  Anyone can reply from X and tip in SOL (0.001 min).” z „Share on X” i „Copy
  link” (`app/basechat/components/SolanaBlinkShare.tsx`).
- Strona `/post/<id>` posta z Solany: link do kwitu obok sieci, „Reply and tip
  the author (from 0.001 SOL) or just tip” i zdanie, że karta w X wymaga
  Blinków i wpisu w rejestrze Dialect, którego nie mamy.
- Karta „New: Solana, with receipts.” nad feedem
  (`app/basechat/components/WhatsNewCard.tsx`): zamykana raz (localStorage),
  niewidoczna w miniappie Farcastera i na buildzie devnetowym, prowadzi do
  `/Docs/solana`.

## Odzyskanie opłaconej, niezapisanej odpowiedzi

Najgorszy stan: pieniądze poszły, komentarza nie ma (zerwany callback, awaria
Firestore albo RPC).

- Strona `/blink/reply` zapisuje podpis w localStorage **przed** zapytaniem
  `/confirm`, ponawia do 4 razy, a po odświeżeniu sama wznawia zapis. Dopóki
  podpis czeka, głównym przyciskiem jest „Retry saving”, który nie buduje nowej
  transakcji — nie da się zapłacić drugi raz.
- Odpowiedź `pending` z `/confirm` niesie link
  `/blink/reply/<id>?signature=…` i przycisk „Retry saving” z podpisem
  w adresie.
- Każdy, kto ma podpis, może go zgłosić ponownie:
  `/blink/reply/<id>?signature=<podpis>` albo
  `POST /api/actions/reply/<id>/confirm` z `{ "signature": "<podpis>" }`.
  Trasa nie wymaga logowania, a zapis jest idempotentny; treść i kwotę serwer
  i tak czyta z łańcucha.
- Wpis, którego transakcja nigdy nie weszła do bloku, wygasa po oknie
  blockhasha („Not charged”); wpis nierozstrzygalny ma „Dismiss”.

## Moderacja

Reguły Firestore nie pozwalają przeglądarce stworzyć, podrobić ani skasować
płatnej odpowiedzi (pola `tipLamports`, `via`). Usuwa ją
`POST /api/solana/reply-moderation` z `{ commentId }`:

- kto pyta — z sesji SIWE (httpOnly cookie), nigdy z żądania,
- wolno adminowi albo autorowi posta **z rejestru kwitów**, nie
  z `posts.author`; post z kwitem z migracji (bez autora) moderuje tylko admin,
- razem z odpowiedzią znikają odpowiedzi na nią, a licznik schodzi o tyle samo,
- SOL zostaje u autora posta — usunięcie komentarza niczego nie zwraca.

Tą trasą idą przycisk w feedzie (`deleteComment` w `app/utils/firebase.ts`)
i panel admina (`app/admin/components/ContentModeration.tsx`).

Odpowiadający nie edytuje ani nie usuwa swojej odpowiedzi: jego adres Solany
nie ma sesji w MySphere. Treść i tak zostaje w memo na łańcuchu.

## Znane ograniczenia

- Adres Solany nie ma profilu. W feedzie autor płatnej odpowiedzi to skrót
  adresu, który otwiera ten adres w eksploratorze Solany (`displayUserName`
  w `app/basechat/page.tsx`); na `/post/<id>` to sam skrót, bez linku.
- Autor posta nie dostaje powiadomienia ani o płatnej odpowiedzi, ani
  o napiwku w SOL: `saveVerifiedReply` pisze tylko komentarz i licznik, a trasa
  napiwku nie pisze nic.
- Karta w X nie rozwija się nikomu, dopóki mysphere.fun nie jest w rejestrze
  Dialect (sekcja niżej).

## Pliki

| Plik | Rola |
|---|---|
| `app/basechat/Solana/replies/replyCore.ts` | czysta logika: minimum, kwoty, memo, walidacja tekstu, odczyt transferu, `verifyReplyTransaction` |
| `app/api/actions/reply/[postId]/route.ts` | GET karta, POST transakcja |
| `app/api/actions/reply/[postId]/confirm/route.ts` | weryfikacja i zapis, stan w treści odpowiedzi |
| `app/api/actions/solanaPostAuthor.ts` | portfel autora z rejestru kwitów (wspólny z napiwkiem) |
| `app/utils/solana/replyStore.ts` | zapis `comments/{podpis}` przez Firebase Admin |
| `app/utils/solana/moderation.ts`, `app/api/solana/reply-moderation/route.ts` | usuwanie płatnej odpowiedzi |
| `app/blink/reply/[postId]/{page,BlinkReplyClient,ReplyPanel}.tsx` | strona dla wszystkich bez rozszerzenia, odzyskanie z podpisu |
| `app/basechat/components/SolanaBlinkShare.tsx` | wiersz „Paid replies on.” pod postem |
| `app/basechat/components/WhatsNewCard.tsx` | ogłoszenie nad feedem |
| `app/actions.json/route.ts` | reguła `/blink/reply/*` → `/api/actions/reply/*` |
| `test/solanaReplies.test.ts` | 20 testów |

## Weryfikacja

- `npm run test:solana` — 43 passing, w tym 20 odpowiedzi (23.09.2026):
  memo w obie strony, tekst liczony w bajtach, odczyt surowego transferu,
  dokładnie minimum przechodzi, a lamport mniej nie, zły płatnik / post /
  odbiorca, transakcja z błędem, pusta treść na łańcuchu, odpowiedź samemu
  sobie, ID posta z `|`, format podpisu i adresu sprawdzany przed RPC.
- `npx tsc --noEmit -p .` po dołożeniu powierzchni w aplikacji (karta „co
  nowego”, kwit i linki na `/post/<id>`, metadane `/blink/*`): 152 błędy,
  wszystkie w `test/` (Hardhat, sprzed tej zmiany), poza `test/` zero
  (23.09.2026).
- Na mainnecie: nikt spoza zespołu nie zapłacił jeszcze płatnej odpowiedzi
  (23.09.2026). Wynik symulacji z punktu „Testy” specu nie jest zapisany.

---

# Jak włączyć Blinki i jak je promować

## Włączenie (właściciel)

1. Vercel Production: `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta` i redeploy.
   Bez tego produkcja stoi na devnecie: `/api/actions/*` odpowiada 503, a linki
   do Blinków znikają z `/post/<id>` i spod postów.
2. `NEXT_PUBLIC_SITE_URL=https://mysphere.fun`. Bez niej ikona karty bierze host
   z żądania (`originFrom`: `x-forwarded-host`, potem adres żądania). Linki
   akcji (`href`, `links.next`) są względne. Strony `/blink/*` bez tej zmiennej
   biorą `https://mysphere.fun` do adresu obrazka podglądu.
3. `GOOGLE_CREDENTIALS` w Production — bez niej karta odpowiedzi odpowiada 503,
   a posty z Solany się nie zapisują.
4. Sprawdzenie: `GET https://mysphere.fun/actions.json` (trzy reguły)
   i `GET /api/actions/reply/<id>` dla posta z Solany: karta JSON, nagłówki
   `X-Action-Version: 2.4` i `X-Blockchain-Ids:
   solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`.
5. Dialect Actions Registry: zgłoszenie domeny mysphere.fun, obejmuje obie
   akcje z `/actions.json` (tip i reply). To formularz, nie kod. Stan
   23.09.2026: mysphere.fun nie ma w rejestrze. Po wpisie zmienić zdanie na
   `/post/<id>` („which MySphere does not have yet”) i nagłówek
   `app/blink/tip/[postId]/page.tsx`.

## Kto zobaczy kartę

Karta z przyciskiem rysuje się w X tylko u osób, które mają Phantoma albo
Backpacka, włączyły w nim Blinki, i tylko dla domen z rejestru Dialect.
Wszyscy pozostali widzą zwykły podgląd linku — obrazek
`/post/<id>/opengraph-image` z podpisem „on Solana” — i po kliknięciu lądują
na `/blink/reply/<id>` albo `/blink/tip/<id>`. Te strony działają w każdej
przeglądarce z portfelem Solany. Dopóki nie ma wpisu w rejestrze, to jedyna
ścieżka dla wszystkich.

## Jak promować

- Linkować `/blink/reply/<id>` albo `/blink/tip/<id>`, nie `/post/<id>`: tylko
  ścieżki `/blink/*` są w `actions.json`, więc tylko one mogą kiedyś rozwinąć
  się w kartę. `/post/*` celowo nie jest mapowany (sekcja „Blinks”).
- Autor bierze link spod własnego posta: „Share on X” otwiera okno posta na X
  z gotowym linkiem do odpowiedzi, „Copy link” kopiuje sam link.
- W treści na X mówić o mechanice, nie o liczbach: odpowiedź i napiwek w jednej
  transakcji, minimum 0.001 SOL, treść odpowiedzi zostaje w memo na łańcuchu,
  pieniądze idą na portfel, który podpisał post. Nie obiecywać karty w X przed
  wpisem do rejestru i nie pisać o użyciu, którego nie było.
- Pierwszy prawdziwy post z Proof of Bags (post z Solany z adresem tokena) jest
  dobrym pierwszym linkiem do udostępnienia: dziś ta ścieżka ma za sobą tylko
  symulację.
- Nie reklamować tego w miniappie Farcastera: zakładki Solany tam nie ma.

