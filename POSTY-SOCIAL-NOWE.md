# Posty na social — nowe funkcje

Pisane jak przez człowieka, który to zbudował. Bez „excited to announce", bez
rakiet, bez wyliczanek buzzwordów. Konkret, liczba, czasem przyznanie się do
błędu — bo to jest jedyna rzecz, której konkurencja nie skopiuje.

**Zasada, wg której to pisałem:** każdy post ma jedną rzecz do powiedzenia
i jedną liczbę, którą da się sprawdzić. Jeśli post nie ma liczby, ma mieć
przyznanie się do czegoś.

Warianty **EN** są główne (publiczność Base i x402 jest anglojęzyczna).
Warianty **PL** na dole — nie tłumaczenia, tylko osobno napisane.

---

## 1. Główny — pierwsza rozliczona płatność x402

> An AI agent can now pay a human to answer a question on MySphere. One just
> did, for a cent.
>
> No signup, no API key, no invoice — the endpoint answers 402 with its price,
> the agent signs, retries, and the Ask is written. The payer signed and paid
> no gas; the facilitator sent the transaction.
>
> Every marketplace in this space sells machine work to humans. We're selling
> human judgment to machines. That shelf was empty.

*Dlaczego to działa jako post: jedno zdanie tezy, brak przymiotników,
i odwrócenie, którego nikt nie mówi. Liczbą jest „a cent" — i to jest cała
prawdziwa skala tego przebiegu.*

---

## 2. Krótki, na X

> `POST /api/asks` → 402 Payment Required
>
> Agent signs a transfer authorization, retries, and a human gets paid to
> answer. First one settled today: 0.01 USDG, no gas on the payer's side.

---

## 3. Techniczny — dla ludzi, którzy sprawdzą

> Ran a real x402 payment through our own endpoint today. What the 402
> actually carried:
>
> network `eip155:4663` (Robinhood Chain)
> asset `0x5fc5360D…` (USDG — Robinhood Chain has no canonical USDC)
> amount `10000` (6 decimals — one cent)
> payTo, deadline, scheme `exact`
>
> Balances moved by exactly 10000 units in a transaction the payer never sent.
> That's EIP-3009: you sign, the facilitator pays the gas.
>
> If you're building agents: you don't need us to onboard you. Read the
> response, sign, retry. Read the asset off the response — don't assume USDC.

*Ten post jest sprawdzalny linijka po linijce, więc każda linijka musi być
przepisana z prawdziwej odpowiedzi, nie z pamięci. Poprzednia wersja podawała
tu adres USDC z Base — token, którego ten endpoint nigdy nie zażądał.*

---

## 4. Dlaczego USDG, a nie USDC

> Everyone asks why the payment settles in USDG and not USDC. Because on
> Robinhood Chain there is no USDC. I checked the addresses USDC uses on Base
> and on Arbitrum — no contract at either, on that chain.
>
> Of the stablecoins listed there, exactly one answers `authorizationState()`
> — USDG. Without EIP-3009 there's nothing for an agent to sign and the whole
> scheme has nothing to stand on. So it isn't a taste in tokens. It's the only
> one that works.

*To jest post typu „patrzcie, sprawdziłem", nie „wspieramy kolejny łańcuch".*

---

## 4a. Uczciwe zastrzeżenie — jeśli ktoś dopyta

> To be exact about what happened: one payment, one cent, between two addresses
> I control. It proves the handshake and the settlement work end to end. It
> does not prove anyone else is paying. The facilitator's signing key on that
> chain had 19 transactions in its entire history when I looked.
>
> I'd rather say that than have someone else say it for me.

---

## 5. Budowanie na widoku — najmocniejszy

> Spent today auditing our own claims instead of shipping features.
>
> Our tagline is "every tip is a settled payment you can verify onchain."
> So I took 17 payment hashes from the database and asked the chain about them.
>
> 17 out of 17 came back null. Not one link worked.
>
> Turns out we were saving the userOp hash instead of the transaction hash.
> Fixed, backfilled, verified. But for months we'd been promising proof and
> shipping dead links.

*Ten post jest najlepszy z całej listy. Ludzie udostępniają przyznanie się do
błędu, którego nikt nie musiał ujawniać.*

---

## 6. Koszt, dla technicznych

> Our admin stats panel was disabled. Not slow — disabled, with a red box
> saying "temporarily off due to Firebase costs."
>
> It was pulling entire collections to call `.length` on them. At our size
> that's ~461,000 reads to open one page.
>
> Rewrote it on count aggregations: **467 reads**. Same numbers, three orders
> of magnitude cheaper.
>
> The panel had been dark for so long nobody knew we had 184,064 accounts.

---

## 7. O uczciwości liczb — krótki

> Removed the fake posts from our sign-in screen today.
>
> Three invented people, invented avatars, invented like counts. First thing
> every logged-out visitor saw.
>
> On a product whose entire pitch is "these numbers are verifiable."

---

## 8. Ask — zapowiedź, uczciwa

> Working on Asks: a question with a budget, seats, and a deadline. Answers
> stay sealed until you resolve, so nobody can read someone else's and take
> a seat with a reworded copy.
>
> The sealing is real, not a UI curtain — answers live in a collection the app
> itself can't read, released only by a server route.
>
> The budget can now be locked up front. AskEscrow is on Base at
> 0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340, source verified, no owner and no
> pause — before you write an answer you can read the locked amount off the
> contract yourself.
>
> It's a choice per Ask, not a blanket claim: the older way pays out of pocket
> at resolve and locks nothing, so every card says which one it is.
>
> What it doesn't fix: the author still picks the winners. Escrow proves the
> money is there, not that you'll be the one who gets it.

*Escrow wolno juz wymieniać — dziura krytyczna z przeglądu adwersarialnego jest
zamknięta, kontrakt stoi na mainnecie ze zweryfikowanym źródłem. Ale:*
- *podawaj adres, nie samo słowo „escrow" — obietnica bez adresu jest znowu
  tylko obietnicą;*
- *nigdy „every Ask is escrowed" — to wybór autora, `on-resolve` żyje dalej;*
- *nie pisz, że ścieżka z przeglądarki jest sprawdzona w boju. Przez `fund()`
  na mainnecie nie przeszedł jeszcze ani jeden dolar — kontrakt nie ma tam ani
  jednego zdarzenia od bloku wdrożenia, a jego saldo USDC wynosi zero;*
- *nie zestawiaj escrow z liczbą 187. To napiwki i 0,1% kont; przez escrow nie
  przeszedł nikt. Zlepienie tych dwóch rzeczy w jeden post robi z nich dowód
  rynku, którego nie ma;*
- *nie pisz, że opłata to prowizja od wypłaty. 2,5% leci wyłącznie od pieniędzy
  WRACAJĄCYCH do autora, nigdy z kieszeni odpowiadającego.*

---

## 9. Dla deweloperów agentów — zaproszenie

> If you run an agent with a budget and no way to ask a human anything:
>
> `GET https://mysphere.fun/api/asks` — free, tells you the price
> `POST` the same URL — 402, sign, retry
>
> Your answer comes back as JSON. No account, no key, no call with sales.

---

## 10. Jednozdaniowy, do przypięcia

> The only feed where the timeline is money.

---

# Warianty PL

## 1a. Główny

> Od dziś agent AI może zapłacić człowiekowi za odpowiedź. Właśnie zapłacił —
> jednego centa.
>
> Bez rejestracji i bez klucza API. Endpoint odpowiada 402 razem z ceną, agent
> podpisuje, ponawia, Ask powstaje. Płacący tylko podpisał i nie wydał grosza
> na gaz — transakcję wysłał facilitator.
>
> Wszyscy w tej branży sprzedają pracę maszyn ludziom. My sprzedajemy ludzki
> osąd maszynom. Ta półka była pusta.

## 5a. Budowanie na widoku

> Zamiast dowozić funkcje, spędziłem dziś dzień na sprawdzaniu własnych
> obietnic.
>
> Piszemy, że każdy napiwek to rozliczona płatność, którą da się sprawdzić na
> łańcuchu. Wziąłem więc 17 hashy z bazy i zapytałem łańcuch.
>
> 17 na 17 wróciło puste. Żaden link nie działał.
>
> Zapisywaliśmy hash userOp zamiast hasha transakcji. Naprawione i przepisane
> wstecz. Ale przez miesiące obiecywaliśmy dowód, a dawaliśmy martwe linki.

## 6a. Koszt

> Panel statystyk admina był u nas wyłączony. Nie wolny — wyłączony, z
> czerwonym prostokątem „tymczasowo, z powodu kosztów Firebase".
>
> Ściągał całe kolekcje, żeby policzyć ich długość. Przy naszym rozmiarze to
> ~461 000 odczytów na jedno wejście.
>
> Przepisane na agregacje: **467 odczytów**. Te same liczby.
>
> Panel był ciemny tak długo, że nikt nie wiedział, że mamy 184 064 konta.

---

## 11. Perps na Arc — keeper i błąd, który znaleźliśmy sami

> Our perps on Arc testnet had a liquidation button and nobody to press it.
>
> Funding was 8 hours overdue. One position sat at −169 bps margin ratio —
> below zero, so the insurance fund was already covering it — and it stayed
> open because liquidation only ran when someone opened the market page.
>
> Wrote a keeper today. First run: settled funding for $0.0012, liquidated
> the position for $0.0067. Gas on Arc is USDC, so that's the whole bill.
>
> Also found that our "Max" button put the entire USDC balance into margin.
> On Arc, gas comes out of the same balance. Max meant "can't pay for the
> transaction you're about to send." Fixed: Max now keeps 0.05 USDC back.

*Dlaczego to działa jako post: dwie liczby do sprawdzenia na Arcscan
(0xa9544f4f… i 0x46cd9209…), jedna właściwość Arc, której ludzie nie znają
(gaz to to samo USDC co depozyt), i przyznanie się do błędu w produkcie.
Bez „we're excited". Perps są na TESTNECIE — nie pisać inaczej.*

## 11a. Krótki, na X

> Perps keeper on Arc, first run:
> settleFunding — 8h overdue — $0.0012
> liquidate — position at −169 bps — $0.0067
>
> Gas is USDC. The bill is the bill.

## 11b. Techniczny — dla ludzi, którzy sprawdzą

> Two things Arc's docs say that changed our perps code today.
>
> 1. Native USDC (gas, 18 dec) and ERC-20 USDC at 0x3600… (6 dec) are one
> balance. Our Max-margin button ignored that. Now: balance − 0.05 USDC.
>
> 2. Finality is instant and blocks are 1s, so a keeper is cheap. Ours polls
> the factory, settles funding past FUNDING_INTERVAL, liquidates below
> MAINTENANCE_MARGIN_BPS. Dry-run by default.
>
> Next: index price from Pyth. Pull oracle, so we wrote an adapter that
> returns 0 on a stale price instead of reverting — a revert there would
> freeze funding and closes for the whole market. Stale means the market
> falls back to the bonded registry TWAP. On testnet today: BTC/USD 48s old,
> ETH/USD 15 days old. That gap is why the fallback exists.

## PL — 11. Keeper

> Nasze perpsy na Arc testnet miały przycisk „likwiduj" i nikogo, kto by go
> nacisnął.
>
> Funding zaległy o 8 godzin. Jedna pozycja na −169 bps — czyli poniżej zera,
> fundusz już dopłacał — i żyła, bo likwidacja działała tylko, gdy ktoś
> wszedł na stronę rynku.
>
> Dziś keeper. Pierwszy bieg: funding za 0,0012 $, likwidacja za 0,0067 $.
> Gaz na Arc to USDC, więc to cały rachunek.
>
> Przy okazji: przycisk „Max" wpisywał całe saldo USDC w depozyt. Na Arc gaz
> schodzi z tego samego salda. „Max" znaczyło „nie zapłacisz za transakcję,
> którą zaraz wyślesz". Naprawione — Max zostawia 0,05 USDC.

## 12. Perps na Arc — ekran dla tradera, nie dla protokołu

> Rebuilt the perps screen on Arc testnet. The old one was written by the
> people who wrote the contract, and it showed: bond, challenges, premium
> in bps, eight cards, and the order form somewhere below the funding
> chart.
>
> New one answers one question before you click: how much am I risking and
> where do I get liquidated. Three numbers above the button — position
> size, liquidation price with distance from mark, entry with price impact.
> All computed with the same arithmetic the contract runs, so the preview
> is the fill, not an estimate.
>
> Chart is real feed history from PriceSubmitted logs — mark, entry and
> liquidation drawn as lines, and the liquidation line moves while you drag
> the leverage slider. On mobile the order form is a bottom sheet.
>
> One honest detail: the "Change" column says "since 5h ago", not "24h",
> because that's how far one getLogs window reaches on Arc. If there are
> fewer than two prices in the window, it shows a dash. Zero would be a lie.
>
> Market info — bond, challenges, insurance fund, keeper actions — is one
> tab away. Nothing was removed, it just stopped being the first thing you
> see.

*Dlaczego to działa jako post: przyznanie, kto pisał stary ekran i po czym
to widać; jedna decyzja projektowa („trzy liczby przed przyciskiem");
jedna rzecz, której inni nie robią („since 5h ago" zamiast „24h").
Testnet — pisać „on Arc testnet". Nie pisać „inspired by Hyperliquid".*

## 12a. Krótki, na X

> Perps on Arc testnet, new screen.
>
> Before the button: size, liq price, entry. Same math as the contract.
> Liq line on the chart moves with the leverage slider.
> "Change" says "since 5h ago" — one log window, no fake 24h.

## 12b. Techniczny — dla ludzi, którzy sprawdzą

> What changed under the perps screen on Arc testnet.
>
> 1. MarketDetail.tsx went from 1,887 lines to ~300. The vAMM math
> (swap, previewOpen, liquidation price) is a separate module with a mocha
> test — previewOpen mirrors DerivativeMarket.openPosition including
> rounding direction, and the test pins the sides: long liq below entry,
> short above, reject below min margin, reject over OI cap.
>
> 2. Chart is lightweight-charts fed by PriceSubmitted events, time from
> the event's timestamp argument, no getBlock per point. Blockdaemon's RPC
> takes 50k blocks per getLogs; Arc mints a block every 0.51 s, so one
> window is ~5.5 h. We fire four windows in parallel — ~23 h — because the
> feed had last updated 9 h earlier and the chart was empty.
>
> 3. The price axis autoscales to the series, so a mark 40% above index
> (normal on a thin vAMM) fell off the canvas together with its label.
> Fixed with autoscaleInfoProvider extended by every drawn price line.
>
> 4. Failed reads still render as "n/a", never as $0.00. That rule survived
> the rewrite.

## PL — 12. Ekran dla tradera

> Przepisaliśmy ekran perpsów na Arc testnet. Stary pisali ludzie od
> kontraktu i było to widać: kaucja, challenge'e, premia w bps, osiem kart,
> a formularz gdzieś pod wykresem fundingu.
>
> Nowy odpowiada na jedno pytanie przed kliknięciem: ile ryzykuję i gdzie
> mnie wyrzuci. Trzy liczby nad przyciskiem — rozmiar pozycji, cena
> likwidacji z odległością od marku, wejście z poślizgiem. Liczone tą samą
> arytmetyką, co kontrakt, więc podgląd to wypełnienie, nie szacunek.
>
> Wykres z prawdziwych logów feedu: mark, wejście i likwidacja jako linie,
> a linia likwidacji przesuwa się, gdy ciągniesz suwak dźwigni. Na telefonie
> formularz to dolny arkusz.
>
> Jeden szczegół: kolumna „Zmiana" mówi „od 5 h", nie „24 h", bo tyle sięga
> jedno okno logów na Arc. Mniej niż dwie ceny w oknie — kreska. Zero byłoby
> kłamstwem.

---

# Czego NIE pisać

- **„Zdecentralizowany", „rewolucyjny", „przełomowy"** — nic nie znaczą i
  czytelnik to wie.
- **Escrow bez adresu ani bez zastrzeżeń.** Kontrakt istnieje i stoi na
  mainnecie — ale nie pisz „każdy Ask jest zabezpieczony" (to wybór autora),
  ani że opłata 2,5% jest pobierana z wypłaty (leci wyłącznie od zwrotu do
  autora), ani że zwrot po wygaśnięciu da się kliknąć w produkcie (nie da się —
  kontrakt to ma, interfejs nie).
- **„x402 na Base, w USDC"** — nieprawda. Płatna trasa rozlicza się na
  **Robinhood Chain (`eip155:4663`) w USDG**, bo tam nie ma kanonicznego USDC,
  a USDG jest jedynym tokenem z EIP-3009 na tym łańcuchu. Gałąź na Base
  istnieje w kodzie i nie przeszedł przez nią ani jeden cent.
- **„Przetestowane w boju", „działa w produkcji", „agenci już płacą"** — był
  **jeden** przebieg, na **0,01 USDG**, między **dwoma naszymi** adresami.
  To dowód, że ścieżka działa, nie dowód ruchu. Nie powołuj się też na
  27 tysięcy rozliczeń z `/stats` facilitatora: to suma po wszystkich
  łańcuchach, a jego klucz podpisujący na 4663 miał 19 transakcji w historii.
- **Nie sklejaj x402 z escrow.** x402 płaci za **założenie** Aska (0,01 USDG na
  Robinhood). Escrow blokuje **budżet** Aska (USDC na Base). To dwie różne
  rzeczy, dwa różne łańcuchy i dwa różne tokeny — a Ask założony przez agenta
  jest zawsze `on-resolve`, czyli nie ma escrow wcale.
- **„Wspieramy 8 sieci"** — jest ich **siedem**. Sam się na tym przejechałem,
  licząc `camp` i `basecamp` jako dwie.
- **Liczby użytkowników bez kontekstu** — 184 064 konta brzmi świetnie, ale
  aktywnych w kwartale jest 38. Jeśli ktoś sprawdzi, a sprawdzi, wyjdzie
  gorzej, niż gdybyśmy sami o tym powiedzieli.
- **Cokolwiek w czasie teraźniejszym o Asku w feedzie** — model danych jest,
  widoku w feedzie jeszcze nie.
- **Perps jako produkt „na mainnecie" albo „z prawdziwym oracle"** — moduł
  stoi na **Arc testnet**, indeks to własny rejestr z kaucją, a adapter Pytha
  jest napisany i przetestowany, ale **nie podpięty do żadnego rynku**
  (pole feedu jest immutable, potrzebny nowy rynek). Keeper działa co 15 min
  z jednego portfela — nie „sieć keeperów".
