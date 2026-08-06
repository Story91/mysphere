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

## 1. Główny — x402 na mainnecie

> An AI agent can now pay a human to answer a question on MySphere.
>
> Real USDC. Base mainnet. No signup, no API key, no invoice — the endpoint
> answers 402, the agent signs, retries, done.
>
> Every marketplace in this space sells machine work to humans. We're selling
> human judgment to machines. That shelf was empty.

*Dlaczego to działa jako post: jedno zdanie tezy, brak przymiotników,
i odwrócenie, którego nikt nie mówi.*

---

## 2. Krótki, na X

> `POST /api/asks` → 402 Payment Required
>
> Agent signs a USDC authorization, retries, and a human gets paid to answer.
>
> Base mainnet. Live today.

---

## 3. Techniczny — dla ludzi, którzy sprawdzą

> We wired x402 on Base mainnet today. The 402 response carries:
>
> asset `0x833589fC…` (real USDC, not testnet)
> amount `10000` (6 decimals — that's one cent)
> payTo, deadline, scheme `exact`
>
> If you're building agents: you don't need us to onboard you. Read the
> header, sign, retry.

---

## 4. Robinhood Chain

> MySphere now speaks x402 on Robinhood Chain too — gasless, in USDG.
>
> Fun detail I found while wiring it: Robinhood Chain has no canonical USDC.
> Of the four stablecoins on the explorer, exactly one answers
> `authorizationState()` — USDG. Without EIP-3009 there's nothing for an agent
> to sign, so that one token is the whole reason this works there at all.

*To jest post typu „patrzcie, sprawdziłem", nie „wspieramy kolejny łańcuch".*

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
> What's not built yet: escrow. Right now the author pays on resolve. I'd
> rather say that plainly than call it "funded."

*Nie obiecuj escrow. Adwersarialny przegląd kontraktu znalazł dziurę
krytyczną i dopóki nie jest zamknięta, ani słowa o escrow.*

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

> Od dziś agent AI może zapłacić człowiekowi za odpowiedź.
>
> Prawdziwe USDC, mainnet Base, bez rejestracji i bez klucza API. Endpoint
> odpowiada 402, agent podpisuje, ponawia — koniec.
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

# Czego NIE pisać

- **„Zdecentralizowany", „rewolucyjny", „przełomowy"** — nic nie znaczą i
  czytelnik to wie.
- **Escrow** — nie istnieje, a kontrakt ma niezamkniętą dziurę krytyczną.
- **„Wspieramy 8 sieci"** — jest ich **siedem**. Sam się na tym przejechałem,
  licząc `camp` i `basecamp` jako dwie.
- **Liczby użytkowników bez kontekstu** — 184 064 konta brzmi świetnie, ale
  aktywnych w kwartale jest 38. Jeśli ktoś sprawdzi, a sprawdzi, wyjdzie
  gorzej, niż gdybyśmy sami o tym powiedzieli.
- **Cokolwiek w czasie teraźniejszym o Asku w feedzie** — model danych jest,
  widoku w feedzie jeszcze nie.
