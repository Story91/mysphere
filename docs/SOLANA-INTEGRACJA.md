# Solana w basechacie

Stan na 23 września 2026. Wdrożone i potwierdzone na mainnecie.

## Co zostało zrobione i dlaczego akurat tak

MySphere miała do tej pory osiem łańcuchów i wszystkie były EVM. Solana jest
pierwszym wyjątkiem, więc pierwsza decyzja dotyczyła nie kodu, tylko zakresu.

**Post w tej aplikacji nie żyje onchain.** Treść, lajki, komentarze i profile
siedzą w Firestore (`createPost` w `app/utils/firebase.ts`). Łańcuch dostaje
wyłącznie kwit — podpis transakcji zapisany w polu `txHash`. Zmierzone: żadna
trasa serwerowa tego podpisu nie weryfikuje. Weryfikacja receiptów istnieje
tylko tam, gdzie idą pieniądze (Aski w `app/api/asks/[id]/escrow-resolve`,
piny w `app/api/sync-pin-events`).

Z tego wynikły dwa możliwe zakresy:

| | Logowanie portfelem Solany | Kwit na Solanie dla użytkownika EVM |
|---|---|---|
| Tożsamość | przepisana od zera | nietknięta |
| Zasięg zmian | `wagmi` w 100 plikach, `useAccount` w 88, `0x${string}` w 276 miejscach, SIWE przypięte do chainId 8453 | jeden nowy przycisk |
| Co się psuje | profile, follow, tipy, ranking, bany — wszystko kluczowane adresem `0x` | nic |
| Czas | tygodnie | dzień–dwa |

Wybrany został wariant drugi. **Autorem posta pozostaje adres EVM z wagmi.**
Portfel Solany podpisuje wyłącznie kwit.

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

Mainnet włącza jedna zmienna, bez zmiany kodu:

```
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
```

Pod mainnet ustaw też własny RPC — publiczny `api.mainnet-beta.solana.com` jest
mocno rate-limited i Solana Foundation wprost odradza go w produkcji:

```
NEXT_PUBLIC_SOLANA_RPC_URL=https://...
```

## Koszty

- Deploy: **0** — Memo Program jest cudzy i już stoi.
- Transakcja posta: ~0,000005 SOL, płaci ją **portfel użytkownika**.
- Brak keepera, więc **brak dosypywania gazu** — inaczej niż przy perps na Arc.
- Budżet właściciela na własne testy na mainnecie: ~0,05 SOL z zapasem.

## Czego świadomie NIE zrobiono

**Tipy.** `TipNetworkType` w `app/utils/firebase.ts` pozostaje bez `'solana'`.
Tipy dotykają pieniędzy, escrow i kwitów weryfikowanych po stronie serwera —
to osobny zakres, nie dopisek.

**Komentarze onchain na Solanie.** `COMMENT_BUTTON_BY_CHAIN` w `PostList` jest
kluczowane numerycznym chainId, którego Solana nie ma. Zachowanie nie uległo
pogorszeniu: przycisk komentarza zawsze zależał od sieci **portfela**, a nie od
sieci posta, więc użytkownik na Base komentujący post z Solany zapisuje kwit na
Base — tak samo jak dziś komentuje posty z Celo.

**Solana jako sieć logowania.** Patrz tabela na górze.

## Stan weryfikacji

- `tsc --noEmit` — czysto (błędy w `test/` są sprzed tej zmiany, dotyczą
  Hardhata i nie wchodzą do `next build`).
- `next build` — przechodzi.
- **Potwierdzone na mainnecie 22–23 września 2026.** Post „GM from SOLANA"
  przeszedł i wylądował w feedzie z odznaką Solany.

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

Dla wszystkich pozostałych działa link przez `dial.to` — jedno kliknięcie poza
X, a nie zero. Dlatego `/blink/tip/<id>` jest też zwykłą stroną: ktoś bez
rozszerzenia ma zobaczyć post i działający przycisk, a nie martwy link.

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

## Pliki

| Plik | Rola |
|---|---|
| `app/api/actions/actionHeaders.ts` | CORS, `X-Action-Version`, CAIP-2 łańcucha |
| `app/api/actions/tip/[postId]/route.ts` | GET metadane, POST transakcja |
| `app/actions.json/route.ts` | mapa akcji w korzeniu domeny |
| `app/blink/tip/[postId]/page.tsx` | strona dla wszystkich bez rozszerzenia |

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
karty na X — zadziała tylko `dial.to`. To formularz, nie kod.

**`NEXT_PUBLIC_SITE_URL`.** Bez tej zmiennej ikona i adresy akcji biorą się
z żądania. Na produkcji za Vercelem działa `VERCEL_URL`, ale własna domena
w tej zmiennej jest pewniejsza.
