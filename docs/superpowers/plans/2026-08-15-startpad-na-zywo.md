# Startpad na zywo: plan wdrozenia

> Plan wykonywany INLINE w sesji Claude Code (bez subagentow). Kroki maja checkboxy,
> zeby rownolegle czaty widzialy, co jest zrobione. Odhaczamy po commicie fali.

**Cel:** zdjac ze startpada opoznienia i zaleznosci, ktore nie musza istniec: skan
tablicy rosnacy z wiekiem launchpada, osiem sekund do zobaczenia cudzej transakcji,
claimy stojace do przeladowania strony, liczba holderow z zewnetrznego indeksu i
martwa strona tokena po graduacji.

**Architektura:** wszystko czytamy z lancucha. Baza (Firestore) zostaje wylacznie
tam, gdzie chroni przed utrata danych (indeks tozsamosci startow) albo trzyma rzeczy
spoza lancucha (profile, loga). Stan posredni miedzy wizytami idzie do localStorage z
POKRYCIEM (do ktorego bloku), a nie jako placeholder do nadpisania.

**Stack:** Next.js App Router, wagmi 2.16 + viem 2.55, hardhat + chai (testy czystej
logiki), Firestore tylko po stronie tras API.

**Zrodlo:** rozpoznanie z 2026-08-15 w tej sesji (pomiary na zywej glowie Base
49 982 248, wdrozenie launchpada 49 843 030).

## Ograniczenia globalne

- Bez `npm run build` (robi go rownolegly czat). Weryfikacja: `npx tsc --noEmit`
  (dopuszczalne sa zastane bledy w `test/` typu TS6200/TS2451) oraz
  `TS_NODE_PROJECT=./hardhat.tsconfig.json npx hardhat test test/Startpad*.test.ts`.
- Komentarze w kodzie: polski bez znakow diakrytycznych, tlumacza DLACZEGO.
- Commity: autor Story91, bez trailerow, tytul `startpad: ...`.
- Zadna fala nie moze dolozyc odczytu Firestore na sciezce renderu.
- Kazda fala konczy sie osobnym commitem na `feat/b20-launchpad-hook`.

---

## Fala 1: tablica na roznice (TERMIN ~2026-09-01)

**Problem:** `LaunchpadBoard.tsx:1240` skanuje `glowa -> LAUNCHPAD_DEPLOY_BLOCK` przy
kazdym wejsciu i po kazdej transakcji. Dzis 15 okien i 4 rundy `getLogs`; za 7 dni 47
okien i 12 rund; za 14 dni 79 okien i 20 rund; po ~16,6 dnia przekroczony sufit
`maxScanWindows` (90) i skan przestaje siegac bloku startu.

**Rozwiazanie:** migawka tablicy dostaje pokrycie (`lastBlock`) i AGREGATY, a kolejne
wejscie skanuje tylko `lastBlock+1 -> glowa`. Wszystkie agregaty tablicy sa addytywne
(wolumen, liczba transakcji, zbior handlujacych, naliczenia oplat), wiec scalanie jest
dokladne dopoki zakresy nie zachodza na siebie.

**Pliki:**
- Utworz: `app/startpad/boardScan.ts` (czysta redukcja logow do agregatow + scalanie)
- Utworz: `test/StartpadBoardDelta.test.ts`
- Zmien: `app/startpad/snapshot.ts` (migawka agregatow z pokryciem)
- Zmien: `app/startpad/LaunchpadBoard.tsx` (skan roznicowy zamiast pelnego)

**Interfejsy (produkuje fala 1):**
```ts
type BoardAggregate = {
  launched: Record<string, { name; symbol; creator; startedAt }>;
  activity: Record<string, { volume: string; trades: number }>;  // volume w wei, string
  buyers: Record<string, string[]>;
  prices: Record<string, Array<{ order: number; price: number }>>;
  hookCreatorEth: Record<string, string>;
  creatorSideEarned: Record<string, Record<string, string>>;
  feed: Array<{ id; token; label; tone; eth?: number; order: number }>;
};
reduceBoardLogs(logs): BoardAggregate
mergeBoardAggregates(base, delta): BoardAggregate
```

- [x] **1.1** Wydziel czysta redukcje logow (`reduceBoardLogs`) z petli w
  `LaunchpadBoard.tsx:1293-1344` do `boardScan.ts`, bez zmiany zachowania.
- [x] **1.2** Napisz `mergeBoardAggregates` (sumy addytywne, unia zbiorow, sufit na
  ceny i tasme) + testy scalania, w tym test "dwa razy ten sam zakres to NIE jest
  scalanie" (kontrakt: wolajacy nie ma prawa podac zakresu, ktory juz policzyl).
- [x] **1.3** Dodaj do `snapshot.ts` zapis/odczyt agregatu z `lastBlock`, wlasnym TTL
  i wersja formatu (stara migawka bez wersji jest ignorowana, nie doklejana).
- [x] **1.4** Wepnij w `LaunchpadBoard.tsx`: pokrycie z migawki -> zakres
  `lastBlock+1..glowa`; brak migawki albo zaleglosc wieksza niz jedno zadanie ->
  pelny skan jak dzis. Agregat delty stosujemy TYLKO gdy zadne okno nie padlo.
- [x] **1.5** `tsc --noEmit` + testy + commit.

**Ryzyko:** zatruty agregat (podwojne policzenie zakresu) daje zawyzony wolumen na
zawsze. Zabezpieczenie: pokrycie jest jednym ciaglym zakresem od `deployBlock`,
delta stosowana all-or-nothing, wersja formatu w kluczu, TTL.

---

## Fala 2: zywe zdarzenia bez osmiu sekund

**Problem:** `LaunchpadBoard.tsx:1688` i `LaunchpadTokenDetail.tsx:221` maja
`pollingInterval: 8_000` przy bloku co 2 s.

**Pliki:**
- Zmien: `app/startpad/config.ts` (eksport tempa subskrypcji per siec)
- Zmien: `app/providers.tsx` (opcjonalny transport WebSocket dla Base)
- Zmien: `app/startpad/LaunchpadBoard.tsx`, `app/startpad/[address]/LaunchpadTokenDetail.tsx`
- Zmien/utworz: `test/StartpadLiveTempo.test.ts`

- [x] **2.1** `LIVE_WATCH` w config: `{ poll, pollingInterval }` liczone z
  `secondsPerBlock` sieci i z tego, czy jest wlasny RPC; publiczny endpoint zostaje
  na 8 s, wlasny schodzi do tempa bloku.
- [x] **2.2** Testy czystej funkcji `liveWatchFor(net, env)`.
- [x] **2.3** Podepnij `LIVE_WATCH` w obu subskrypcjach.
- [x] **2.4** WebSocket: gdy `NEXT_PUBLIC_BASE_WS_URL` jest ustawiony, transport
  Base to `fallback([webSocket(ws), http(...)])`, a `poll` schodzi na false.
- [x] **2.5** `tsc --noEmit` + testy + commit.

---

## Fala 3: claimy rosnace na zywo

**Problem:** panel „Your claims" czyta sie raz w `loadCore`. `FeeAccrued(token,
account indexed, amount, kind)` juz dolatuje do subskrypcji strony tokena i jest
ignorowany.

**Pliki:**
- Zmien: `app/startpad/[address]/LaunchpadTokenDetail.tsx`
- Utworz: `app/startpad/[address]/liveClaims.ts` (czysta arytmetyka naliczen)
- Utworz: `test/StartpadLiveClaims.test.ts`

- [x] **3.1** `applyFeeAccrued(core, log, me)` - dolicza `amount` do
  `launchClaimable`, gdy `account == me`; ignoruje cudze i nieznane `kind`.
- [x] **3.2** `applyHookSettled(core, log, me, creator)` - `ethToCreator` i
  `tokenToCreator` do claimow hooka, gdy patrzy tworca tokena.
- [x] **3.3** Subskrypcja obejmuje hook (jeden `watchEvent` na dwa adresy zamiast
  drugiego pollera); `Harvested` na tym tokenie wymusza celowany doczyt claimow.
- [x] **3.4** Testy + wpiecie + commit.

---

## Fala 4: holdersi z wlasnych danych

**Problem:** liczba holderow na stronie tokena idzie z Blockscouta (platny plan,
opoznienie indeksu) mimo ze mamy dokladne salda z `balanceOf`.

**Pliki:**
- Zmien: `app/startpad/[address]/LaunchpadTokenDetail.tsx`
- Zmien: `app/startpad/[address]/DetailTabs.tsx`

- [x] **4.1** Gdy historia jest kompletna (`loaded && !truncated`), liczba holderow i
  tabela ida z naszej mapy, a Blockscout nie jest w ogole pytany.
- [x] **4.2** Historia nieukonczona - jak dzis: Blockscout jako zrodlo z wieksza
  liczba wierszy.
- [x] **4.3** Testy reguly wyboru zrodla + commit.

---

## Fala 5: cena po graduacji

**Problem:** po graduacji `spotPriceWeiPerToken` rewertuje, cena idzie na zero,
strona wyglada na martwa dla tokenow, ktorym sie udalo.

**Pliki:**
- Utworz: `app/startpad/[address]/poolPrice.ts` (slot0 -> cena, czysta matematyka + odczyt)
- Utworz: `test/StartpadPoolPrice.test.ts`
- Zmien: `app/startpad/config.ts` (adres StateView per siec)
- Zmien: `app/startpad/[address]/LaunchpadTokenDetail.tsx`

- [x] **5.1** Adres StateView v4 dla Base wziety z dokumentacji (basehub/Uniswap),
  NIE z pamieci; brak adresu dla sieci = funkcja milczy zamiast zgadywac.
- [x] **5.2** `priceFromSqrtX96(sqrtPriceX96, tokenIsCurrency0)` + testy na znanych
  wartosciach.
- [x] **5.3** Odczyt `getSlot0(poolId)` i podmiana ceny/mcap w stanie Graduated.
- [x] **5.4** Weryfikacja na prawdziwym graduowanym tokenie, jesli taki jest.
      (Na Base nikt jeszcze nie graduowal - zero zdarzen `Graduated` - wiec wzor
      sprawdzony na czterech prawdziwych pulach v4 z natywnym ETH: zgodnosc z
      przetestowanym wzorem z `/b20` do osmego miejsca.)
- [x] **5.5** ZNAK GRADUACJI w UI (dopisane w trakcie): filtr „Graduated" na
      tablicy juz byl, wiec doszedl znak na GLIFIE (pierscien + czapka), bo glif
      rysuje sie we wszystkich trzech ukladach naraz, oraz ikona w pastylce stanu.
- [x] **5.6** Commit.

---

## Fala 6: drobiazgi

**Pliki:**
- Zmien: `app/startpad/[address]/LaunchpadTokenDetail.tsx` (jedna runda odczytow)
- Zmien: `app/startpad/[address]/TradePanel.tsx` (natychmiastowa wycena lokalna)
- Zmien: `app/startpad/LaunchpadBoard.tsx` (wiersz „pending" na tasmie)

- [x] **6.1** `launchOf` wchodzi do tej samej paczki co reszta odczytow; sprawdzenie
  stanu 0 po fakcie. Trzy rundy schodza do jednej.
- [x] **6.2** Lokalna wycena krzywej pokazywana natychmiast, `quoteBuy`/`quoteSell`
  zostaje jedynym zrodlem liczby do podpisu; rozjazd obu liczb kasuje podglad.
- [x] **6.3** Wlasna transakcja wchodzi na tasme jako „pending" po podpisaniu.
- [x] **6.4** Testy + commit.
