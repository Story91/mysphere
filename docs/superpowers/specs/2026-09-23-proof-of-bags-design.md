# Proof of Bags — spec

Data: 2026-09-23. Zatwierdzone przez właściciela („najpierw 1, później 3").
Kontekst: `docs/SOLANA-INTEGRACJA.md`.

## Teza

X wstawia przyciski kupna pod cashtagami. My pod postem pokazujemy bagi autora.

Post z Solany, który wspomina token, **sam dowodzi**, ile tego tokena autor miał
w chwili publikacji — w metadanych własnej transakcji, na zawsze, sprawdzalnie
w każdym eksploratorze. Feed pokazuje na żywo, co autor zrobił potem.

Narzędzia do śledzenia KOL-i (Arkham, KolClaw, kolscan) obserwują garstkę
znanych portfeli **z zewnątrz**, obok postów. Tu dowód siedzi **w** poście
i działa dla każdego, kto postuje.

## Mechanizm (sprawdzony symulacją na mainnecie 2026-09-23)

Transakcja posta dostaje drugą instrukcję: **SPL Memo v1**
(`Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo`), która — w przeciwieństwie do
v2 — nie wymaga, by przekazane konta podpisywały. Jako konta tylko do odczytu
idą:

1. konta tokenowe autora (ATA) dla wspomnianych mintów,
2. program tokena (SPL Token albo Token-2022), którego te konta dotyczą.

Punkt 2 jest konieczny: runtime zbiera `preTokenBalances` **wyłącznie**, gdy
w kontach transakcji występuje program tokena. Zmierzone:

| Wariant | Wynik |
|---|---|
| Memo v1 + samo konto tokenowe | przechodzi, `preTokenBalances: []` |
| Memo v1 + konto tokenowe + program SPL Token | przechodzi, saldo zapisane z polem `owner` |
| Memo v2 + konto tokenowe (kontrola) | `MissingRequiredSignature` |

Instrukcja nie zmienia żadnego salda, więc portfel nie pokazuje w symulacji
żadnych ruchów środków. Koszt: ~540 CU, zero dodatkowej opłaty ponad bazową.

### Format

- program: Memo v1
- dane: `mysphere:bags|v1|<mint1>,<mint2>,<mint3>` (UTF-8, maks. 3 minty)
- konta, w tej kolejności: `ATA_1 … ATA_n`, potem użyte programy tokena
  (bez duplikatów). Wszystkie read-only, żadne nie podpisuje.

ATA, które nie istnieje (autor nie ma tokena), **też** trafia do transakcji.
`meta.preBalances[i] === 0` dowodzi wtedy, że konta nie było, czyli pozycja
w kanonicznym ATA wynosiła zero.

## Wykrywanie tokenów (klient, przy wysyłce)

1. Z treści posta: wszystkie ciągi base58 długości 32–44. Łapie gołe adresy
   i linki (pump.fun, dexscreener, birdeye, jup.ag, solscan, gmgn), bo adres
   minta siedzi w URL-u.
2. Weryfikacja na łańcuchu jednym `getMultipleAccounts` (jsonParsed):
   zostają tylko konta z `parsed.type === 'mint'` należące do SPL Token albo
   Token-2022. Adresy portfeli, par DEX-owych i śmieci odpadają same.
3. Maks. 3 minty, w kolejności wystąpienia w treści.
4. Awaria RPC przy wykrywaniu **nie blokuje posta** — idzie bez dowodu.

**Cashtagi są poza zakresem v1.** `$XYZ` nie wskazuje jednoznacznie tokena,
a podszywanie się pod tickery to podstawowe narzędzie scamerów.

## Weryfikacja (serwer, `GET /api/bags/[postId]`)

1. Post z Firestore; nie-Solana albo brak `txHash` → `not-applicable`.
2. `getTransaction(txHash)`. **Wiązanie posta z transakcją** — bez tego każdy
   mógłby wpisać do posta cudzy podpis:
   - instrukcja Memo v2 `mysphere:post|<signer>|<treść>` istnieje,
   - `<signer>` = płatnik opłaty,
   - `<treść>` (bez końcowego wielokropka) jest prefiksem znormalizowanej
     treści posta.
   Niespełnione → `unverified`, odznaki brak.
3. Instrukcja Memo v1 z prefiksem `mysphere:bags|v1|`; brak → `no-proof`.
4. Dla każdego minta:
   - ATA z transakcji = ATA wyprowadzone z (signer, mint, program) — inaczej
     `unverifiable`;
   - saldo w chwili posta: wpis w `preTokenBalances` dla tego indeksu z
     `owner === signer`; brak wpisu i `preBalances === 0` → 0; inaczej
     `unverifiable`;
   - saldo teraz: `getMultipleAccounts` (jsonParsed) na ATA; brak konta → 0;
   - symbol: Jupiter tokens v2 (`lite-api.jup.ag/tokens/v2/search`), awaria →
     skrócony adres minta.
5. Cache odpowiedzi: `s-maxage=60, stale-while-revalidate=300`.

### Werdykty

| at post | teraz | werdykt | tekst odznaki |
|---|---|---|---|
| 0 | 0 | `no-position` | posted with no $XYZ |
| 0 | >0 | `bought-after` | posted with no $XYZ · bought after |
| >0 | = | `holding` | posted holding N $XYZ · still holds 100% |
| >0 | > | `added` | posted holding N $XYZ · added P% since |
| >0 | 0 < x < at post | `reduced` | posted holding N $XYZ · wallet down P% since |
| >0 | 0 | `emptied` | posted holding N $XYZ · wallet now holds none |

Porównania na surowych `amount` (BigInt), nie na liczbach zmiennoprzecinkowych.

**Werdykty opisują saldo portfela, nie intencję autora.** Spadek salda może być
sprzedażą albo przelewem na cold wallet — odznaka nie pisze „sold", bo przy
przelewie byłaby nieprawdą o konkretnym człowieku. (Poprawka z 2026-09-23,
przed pierwszym wdrożeniem.)

## UI

- **`BagsBadge`** pod treścią każdego posta z Solany w `PostList`. Pobiera
  `/api/bags/[postId]`, renderuje się tylko przy `status: ok`. Błąd, `unverified`,
  `no-proof` → nic (lepiej brak odznaki niż fałszywa). Link „proof" do
  transakcji w eksploratorze.
- **`SolanaPostButton`**: gdy w treści jest kandydat na adres tokena, obok
  przycisku krótka notka, że post dołączy dowód pozycji. Autor ma wiedzieć,
  zanim podpisze.

## Przy okazji — naprawy w tym samym podsystemie

1. **`/blink/tip/[postId]` podpisuje sam.** dial.to (Dialect) jest wstrzymany
   (`DEPLOYMENT_PAUSED`, zrzut właściciela 2026-09-23), więc przycisk
   prowadził donikąd. Strona dostaje własny portfel Solany i wykonuje tę samą
   akcję co Blink.
2. **Blink tip używa wiązania post↔transakcja** z pkt 2 weryfikacji. Dziś
   odbiorca bierze się z `txHash` bez sprawdzenia, więc podrobiony podpis
   przekierowywałby napiwki na obcy portfel.
3. **`confirmOrAskChain` wydzielone** do wspólnego modułu — używa go przycisk
   posta i strona napiwku.
4. **Memo posta przycinane po bajtach UTF-8, nie po znakach** — z instrukcją
   bags transakcja rośnie, a 180 znaków emoji to do ~720 bajtów.

## Poza zakresem v1

Cashtagi · rankingi „diamond hands / dumpers" · powiadomienia o sprzedaży ·
historia zakupów przed postem · sieci EVM · konta tokenowe inne niż ATA.

## Ryzyka

- Opiera się na tym, że Memo v1 ignoruje konta — to zachowanie programu, nie
  gwarancja protokołu. Gdyby v1 zniknął, posty bez bags działają dalej
  (instrukcja jest dokładana tylko przy wykrytym tokenie).
- Dowodzi portfela, który podpisał post. Post z portfela jednorazowego pokaże
  „no position" — co samo w sobie jest informacją.
- publicnode ma limity (m.in. blokuje `getTokenAccountBalance`) — stąd
  `getMultipleAccounts` i cache.

## Testy

- Jednostkowe (mocha + ts-node, wzorem `scripts/test-perps-math.cjs`):
  wykrywanie kandydatów, format memo bags, werdykty, wiązanie memo z treścią,
  przycinanie po bajtach.
- Symulacja na mainnecie: transakcja z instrukcją bags przechodzi, a
  weryfikator poprawnie czyta wynik symulacji.
- E2E: prawdziwy post właściciela wspominający token, który trzyma.
