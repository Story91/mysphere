# BaseChat na desktopie: plan wdrożenia

> **Dla wykonawcy:** WYMAGANA PODSKILL: użyj `superpowers:subagent-driven-development`
> (zalecane) albo `superpowers:executing-plans` i rób zadanie po zadaniu.
> Kroki mają checkboxy (`- [ ]`) do odhaczania.

**Cel:** `/basechat` na ekranach od 1280px w górę dostaje trzeci pas z Askami,
statystykami i rankingiem, a Aski w tym pasie mają ciemną kartę z sumą pieniędzy
do zgarnięcia.

**Podejście:** Wszystko dzieje się w oprawie. Trzecia kolumna już istnieje
(od `2xl`), więc obniżamy jej próg do `xl` i dokładamy nad nią Aski.
`FeedAskRail` dostaje drugi układ jako prop, a nie drugą implementację.
Jedyny nowy plik to zwarty wiersz Aska bez logiki.

**Stos:** Next.js App Router, React 18, TypeScript, Tailwind, tokeny CSS
`soft-*` w `app/globals.css`.

**Spec:** `docs/BASECHAT-DESKTOP-UI-SPEC.md`

## Ograniczenia globalne

- **Posty są nietykalne.** Karty postów i wszystkie przyciski przy nich (tip,
  lajk, komentarz, przypięcie, akcje per sieć, treść premium, odznaki agentów,
  muzyka) zachowują liczbę, kolejność i zachowanie. Wolno zmienić kolor, promień
  i odstęp. Nic więcej.
- **Poniżej `xl` (1280px) nie zmienia się nic.** Telefon i cała mechanika
  `activeMobilePanel` zostają bit w bit.
- **Zero nowych odczytów Firestore.** Każda liczba na ekranie musi pochodzić
  z danych, które komponent już ma.
- **Zero zmian w `app/utils/asks/*`.**
- Komentarze w kodzie: po polsku, bez znaków diakrytycznych, jak reszta pliku.
- Teksty widoczne dla użytkownika: po angielsku, bez myślników w środku zdania,
  bez pogrubionych etykiet punktów.
- Commity autorstwa Story91, bez stopki `Co-Authored-By`.

## Brak testów automatycznych i co w zamian

W repo nie ma runnera testów JS. `package.json` ma wyłącznie `contracts:test`
(hardhat, kontrakty). Dokładanie jesta albo vitesta pod zmianę wyglądu byłoby
osobnym projektem, którego nikt nie zamawiał, więc bramka każdego zadania to:

```bash
# z katalogu C:\dev\mysphere
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^app/"
```

Ma nie wypisać ani jednej linii. Stan wyjściowy sprawdzony 2026-08-13: `app/`
jest czyste, wszystkie błędy `tsc` siedzą w `test/` (kolizje globali
w hardhatowych testach) i są starsze niż ta zmiana. Nie naprawiaj ich tutaj.

Do tego ręczne sprawdzenie w przeglądarce, opisane przy każdym zadaniu.
`npm run dev`, potem `http://localhost:3000/basechat` z podłączonym portfelem.
Szerokości okna ustawiaj w narzędziach dewelopera (Ctrl+Shift+M w Chrome).

## Struktura plików

| Plik | Odpowiedzialność | Zadanie |
|---|---|---|
| `app/basechat/page.tsx` | siatka kolumn, progi, wpięcie pasa Asków | 1, 4, 6 |
| `app/basechat/components/AskCard.tsx` | eksport pomocników formatowania | 2 |
| `app/basechat/components/AskRailRow.tsx` | NOWY: zwarty wiersz Aska, bez logiki | 2 |
| `app/basechat/components/FeedAskRail.tsx` | prop `layout`, ciemna karta, suma | 3 |
| `app/globals.css` | tokeny warstwy wizualnej | 5 |
| `app/components/GooeyNav/GooeyNav.tsx` | chipsy sieci | 6 |

---

### Zadanie 1: Siatka trzech kolumn od `xl`

**Pliki:**
- Modyfikuj: `app/basechat/page.tsx:3161` (szerokość kolumny bocznej)
- Modyfikuj: `app/basechat/page.tsx:3654-3660` (próg kopii Trends)
- Modyfikuj: `app/basechat/page.tsx:4968-4976` (próg trzeciej kolumny)

**Interfejsy:**
- Konsumuje: nic
- Produkuje: trzecia kolumna widoczna od `xl`; następne zadania wstawiają do
  niej Aski nad `trendsColumnContent`

- [ ] **Krok 1: Zwęź kolumnę boczną na `xl`, zostaw `lg` w spokoju**

W `app/basechat/page.tsx:3161` jest dziś:

```
} lg:relative lg:w-[352px] xl:w-[380px] lg:flex-none lg:pt-6 lg:pb-24 lg:border-r lg:border-soft-line bg-soft-bg overflow-y-auto p-4 lg:px-5 mobile-scroll-container`}
```

Zamień na:

```
} lg:relative lg:w-[352px] xl:w-[280px] 2xl:w-[320px] lg:flex-none lg:pt-6 lg:pb-24 lg:border-r lg:border-soft-line bg-soft-bg overflow-y-auto p-4 lg:px-5 mobile-scroll-container`}
```

Dziś kolumna ROŚNIE na `xl` do 380px. Od teraz maleje do 280px, bo od `xl`
wchodzi trzecia kolumna i szerokość jest do podziału na trzy, a nie na dwa.
Na `lg` zostaje 352px, czyli dokładnie jak przedtem.

- [ ] **Krok 2: Obniż próg trzeciej kolumny z `2xl` na `xl`**

W `app/basechat/page.tsx:4976` jest dziś:

```
                <div className="hidden 2xl:block 2xl:w-[360px] 2xl:flex-none overflow-y-auto border-l border-soft-line bg-soft-bg px-5 pt-6 pb-24">
```

Zamień na:

```
                <div className="hidden xl:block xl:w-[320px] xl:flex-none 2xl:w-[360px] overflow-y-auto border-l border-soft-line bg-soft-bg px-5 pt-6 pb-24">
```

- [ ] **Krok 3: Obniż próg kopii Trends w kolumnie bocznej**

To jest druga połowa tej samej zmiany i MUSI wejść razem z krokiem 2. Bez niej
Trends widnieje dwa razy naraz między 1280 a 1535px.

W `app/basechat/page.tsx:3657-3661` jest dziś:

```tsx
              <div
                className={`${
                  activeMobilePanel === 'right' ? 'block' : 'hidden lg:block'
                } 2xl:hidden lg:mt-8 lg:border-t lg:border-soft-line lg:pt-6`}
              >
```

Zamień `2xl:hidden` na `xl:hidden`:

```tsx
              <div
                className={`${
                  activeMobilePanel === 'right' ? 'block' : 'hidden lg:block'
                } xl:hidden lg:mt-8 lg:border-t lg:border-soft-line lg:pt-6`}
              >
```

- [ ] **Krok 4: Popraw komentarze, żeby nie kłamały o progu**

W tym pliku komentarze niosą uzasadnienia i są traktowane serio, więc zostawienie
w nich `2xl` po zmianie progu byłoby zostawieniem nieprawdy.

W komentarzu przy `app/basechat/page.tsx:3654-3656` zamień zdanie:

```
                  `2xl:hidden`: na najszerszych ekranach ten sam blok stoi
                  w osobnej prawej kolumnie, wiec kopia w kolumnie bocznej
                  schodzi - inaczej Trends widnialoby dwa razy naraz. */}
```

na:

```
                  `xl:hidden`: od 1280px ten sam blok stoi w osobnej prawej
                  kolumnie, wiec kopia w kolumnie bocznej schodzi - inaczej
                  Trends widnialoby dwa razy naraz. Prog byl wczesniej `2xl`
                  i przez to na typowym laptopie (1280-1535px) trzeciej
                  kolumny w ogole nie bylo. */}
```

W komentarzu przy `app/basechat/page.tsx:4968-4974` zamień:

```
              {/* ===== PRAWA KOLUMNA TRENDS - NAJSZERSZE EKRANY =====
                  Od progu 2xl uklad przechodzi na trzy kolumny, jak w duzych
```

na:

```
              {/* ===== PRAWA KOLUMNA: ASKI I TRENDS =====
                  Od progu xl uklad przechodzi na trzy kolumny, jak w duzych
```

oraz w tym samym komentarzu `Ponizej 2xl ten sam blok` na `Ponizej xl ten sam
blok` i `(tam ma `2xl:hidden`)` na `(tam ma `xl:hidden`)`.

- [ ] **Krok 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^app/"
```

Oczekiwane: pusto.

- [ ] **Krok 6: Sprawdzenie w przeglądarce**

Na czterech szerokościach, z podłączonym portfelem:

| Szerokość | Kolumn | Trends widać |
|---|---|---|
| 1024 | 2 | raz, w lewej kolumnie |
| 1280 | 3 | raz, w prawej kolumnie |
| 1440 | 3 | raz, w prawej kolumnie |
| 1920 | 3 | raz, w prawej kolumnie |

Nigdy zero, nigdy dwa razy. Feed nie ma poziomego paska przewijania na żadnej
z nich. Bez portfela: ekran powitalny na całej szerokości, bez pustych kolumn
po bokach.

- [ ] **Krok 7: Commit**

```bash
git add app/basechat/page.tsx
git commit -m "basechat desktop: trzecia kolumna od 1280px zamiast 1536px"
```

---

### Zadanie 2: Zwarty wiersz Aska

**Pliki:**
- Modyfikuj: `app/basechat/components/AskCard.tsx:86` i `:116` (eksport dwóch pomocników)
- Utwórz: `app/basechat/components/AskRailRow.tsx`

**Interfejsy:**
- Konsumuje: `Ask` z `app/utils/asks/types.ts`, `formatAskMoney` z `AskCard`
- Produkuje:
  - `export function formatCountdown(left: number): string` w `AskCard.tsx`
  - `export function useNow(deadline: number, running: boolean): number | null` w `AskCard.tsx`
  - `export default function AskRailRow(props: AskRailRowProps)` w `AskRailRow.tsx`
  - `export type AskRailRowProps = { ask: Ask; onAnswer?: () => void; href?: string }`

- [ ] **Krok 1: Wyeksportuj dwa pomocniki z `AskCard.tsx`**

Zegar Aska już istnieje i jest przemyślany: tyka co sekundę tylko na ostatniej
godzinie, wyżej co minutę, i nigdy nie przeskakuje terminu. Druga implementacja
byłaby drugim miejscem, w którym trzeba naprawiać ten sam błąd.

W `app/basechat/components/AskCard.tsx:86` zamień:

```tsx
/** Ponizej doby zegar HH:MM:SS jak w manifescie, wyzej "3d 04h" - sekundy nic tam nie znacza. */
function formatCountdown(left: number): string {
```

na:

```tsx
/**
 * Ponizej doby zegar HH:MM:SS jak w manifescie, wyzej "3d 04h" - sekundy nic
 * tam nie znacza.
 *
 * Eksportowane, bo ten sam zegar rysuje zwarty wiersz w prawym railu
 * (AskRailRow.tsx). Skopiowany format byloby drugim miejscem, w ktorym ten sam
 * Ask moze pokazac dwie rozne godziny.
 */
export function formatCountdown(left: number): string {
```

W `app/basechat/components/AskCard.tsx:116` zamień:

```tsx
function useNow(deadline: number, running: boolean): number | null {
```

na:

```tsx
export function useNow(deadline: number, running: boolean): number | null {
```

- [ ] **Krok 2: Typecheck po samym eksporcie**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^app/"
```

Oczekiwane: pusto. Sam eksport niczego nie psuje, ale sprawdzamy przed dołożeniem
nowego pliku, żeby wiedzieć, co zepsuł który krok.

- [ ] **Krok 3: Utwórz `app/basechat/components/AskRailRow.tsx`**

```tsx
'use client';

import Link from 'next/link';
import type { Ask } from '../../utils/asks/types';
import { formatAskMoney, formatCountdown, useNow } from './AskCard';

/**
 * ZWARTY WIERSZ ASKA - wylacznie do prawego raila (FeedAskRail w trybie
 * `layout="column"`).
 *
 * PO CO OSOBNY WIERSZ, SKORO JEST JUZ AskCard.
 * AskCard jest jasna i szeroka: ma naglowek autora, odznake rozstrzygalnosci,
 * siatke czterech komorek i przycisk. W kolumnie 320px na ciemnym tle nie
 * miesci sie ani jedno, ani drugie - biala karta na granacie swiecilaby jak
 * prostokat podswietlony od tylu, a cztery komorki zlozylyby sie w dwie linijki
 * po dwa slowa.
 *
 * TU NIE MA ZADNEJ LOGIKI. Komponent dostaje gotowego `Ask` i gotowa akcje,
 * i rysuje piec pol. O tym, czy Ask da sie jeszcze zajac i czy patrzacy jest
 * jego autorem, decyduje wylacznie FeedAskRail - tam, gdzie decydowal
 * przedtem. Dzieki temu nie ma drugiego miejsca, w ktorym te same warunki
 * moglyby sie rozjechac.
 *
 * ZEGAR JEST TEN SAM co na AskCard (`useNow` + `formatCountdown`, oba
 * importowane stamtad). Ten sam Ask nie ma prawa pokazac dwoch roznych godzin
 * w dwoch miejscach jednego ekranu.
 */
export type AskRailRowProps = {
  ask: Ask;
  /** Otwiera formularz odpowiedzi w railu. Bez niej wiersz jest odnosnikiem. */
  onAnswer?: () => void;
  /** Dokad prowadzi wiersz, gdy odpowiadac sie nie da (autor, komplet miejsc). */
  href?: string;
};

export default function AskRailRow({ ask, onAnswer, href }: AskRailRowProps) {
  /**
   * `running` na sztywno true: rail pokazuje wylacznie Aski, ktore przeszly
   * przez `isAnswerable`, wiec kazdy z nich ma termin w przyszlosci. Gdy termin
   * minie w trakcie patrzenia, zegar dojdzie do 00:00:00 i stanie - dokladnie
   * jak na AskCard.
   */
  const now = useNow(ask.deadline, true);
  /** `null` do zamontowania - serwer i przegladarka nie zgodzilyby sie co do "teraz". */
  const left = now === null ? null : ask.deadline - now;
  const seatsLeft = Math.max(0, ask.seats - ask.acceptedCount);

  const body = (
    <>
      <p className="mb-1.5 font-soft-display text-[13px] font-bold leading-[1.35] text-white">
        {ask.question}
      </p>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-soft text-[11.5px] leading-none">
        <span className="font-bold text-soft-accent">
          {formatAskMoney(ask.perAnswer, ask.token)}
        </span>
        <span className="text-white/55">
          {seatsLeft} {seatsLeft === 1 ? 'slot' : 'slots'}
        </span>
        {left !== null && <span className="text-white/55">{formatCountdown(left)}</span>}
        <span className="text-white/40">{ask.answerCount} sealed</span>
      </div>
    </>
  );

  /**
   * Ten sam podzial co na AskCard: odpowiadajacy zostaje na miejscu, autor
   * i domkniete Aski ida na /asks. Napis "Answer" prowadzacy w odmowe 403
   * bylby gorszy niz jego brak.
   */
  const shell =
    'block w-full rounded-xl px-3 py-2.5 text-left transition-colors [transition-duration:var(--dur-press)] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-accent';

  if (onAnswer) {
    return (
      <button type="button" onClick={onAnswer} className={shell}>
        {body}
      </button>
    );
  }

  return (
    <Link href={href ?? '/asks'} className={shell}>
      {body}
    </Link>
  );
}
```

- [ ] **Krok 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^app/"
```

Oczekiwane: pusto. Plik nie jest jeszcze nigdzie importowany, więc na ekranie
nic się nie zmienia. To jest w porządku: następne zadanie go wpina.

- [ ] **Krok 5: Sprawdzenie, że nic nie padło**

Otwórz `/asks` i `/basechat` na 1440px. Karty Asków wyglądają i działają
dokładnie jak przed zmianą, bo tknęliśmy w `AskCard.tsx` wyłącznie słowo
`export` przy dwóch funkcjach.

- [ ] **Krok 6: Commit**

```bash
git add app/basechat/components/AskCard.tsx app/basechat/components/AskRailRow.tsx
git commit -m "aski: zwarty wiersz do prawego raila, zegar wspolny z AskCard"
```

---

### Zadanie 3: `FeedAskRail` w układzie kolumnowym

**Pliki:**
- Modyfikuj: `app/basechat/components/FeedAskRail.tsx` (prop, suma, ciemna karta, warianty linii)

**Interfejsy:**
- Konsumuje: `AskRailRow` z zadania 2, `addTokenAmount` i `TokenAmounts`
  z `app/utils/asks/types.ts`
- Produkuje: `FeedAskRailProps` rozszerzone o `layout?: 'row' | 'column'`
  (domyślnie `'row'`); zadanie 4 wpina wariant `'column'` w prawą kolumnę

- [ ] **Krok 1: Dołóż importy**

W `app/basechat/components/FeedAskRail.tsx:6-8` jest dziś:

```tsx
import AskCard from './AskCard';
import FeedAnswerForm from './FeedAnswerForm';
import { getOpenAsks, getResolvedAsks } from '../../utils/asks/asks';
import { isExpired, type Ask } from '../../utils/asks/types';
```

Zamień na:

```tsx
import AskCard, { formatAskMoney } from './AskCard';
import AskRailRow from './AskRailRow';
import FeedAnswerForm from './FeedAnswerForm';
import { getOpenAsks, getResolvedAsks } from '../../utils/asks/asks';
import { addTokenAmount, isExpired, type Ask, type TokenAmounts } from '../../utils/asks/types';
```

- [ ] **Krok 2: Dołóż prop `layout`**

W `app/basechat/components/FeedAskRail.tsx:255-265` zamień:

```tsx
export type FeedAskRailProps = {
  /**
   * Adres patrzacego, jesli jakis jest. Sluzy WYLACZNIE do napisu na przycisku:
   * autor nie moze odpowiedziec na wlasnego Aska (trasa odrzuca to z 403), wiec
   * "Answer" na jego karcie prowadzilby prosto w odmowe.
   */
  viewer?: string | null;
  className?: string;
};

function FeedAskRail({ viewer = null, className = '' }: FeedAskRailProps) {
```

na:

```tsx
export type FeedAskRailProps = {
  /**
   * Adres patrzacego, jesli jakis jest. Sluzy WYLACZNIE do napisu na przycisku:
   * autor nie moze odpowiedziec na wlasnego Aska (trasa odrzuca to z 403), wiec
   * "Answer" na jego karcie prowadzilby prosto w odmowe.
   */
  viewer?: string | null;
  /**
   * `row`    poziomy pas nad lista postow. Domyslny i niezmieniony.
   * `column` ciemna karta w prawej kolumnie na ekranach od 1280px.
   *
   * TO JEST WYLACZNIE UKLAD. Odczyty, cache, przelacznik Open/Resolved,
   * odsiew po terminie i miejscach, zwijanie pasa przy pisaniu odpowiedzi
   * i obsluga awarii sa wspolne dla obu wariantow - inaczej mielibysmy dwa
   * miejsca do naprawiania jednego bledu.
   */
  layout?: 'row' | 'column';
  className?: string;
};

function FeedAskRail({ viewer = null, layout = 'row', className = '' }: FeedAskRailProps) {
  const column = layout === 'column';
```

- [ ] **Krok 3: Policz sumę pieniędzy do zgarnięcia**

W `app/basechat/components/FeedAskRail.tsx:311-319` jest dziś:

```tsx
  // Odsiew na BIEZACYM czasie, nie na tym z chwili pobrania.
  const now = Date.now();
  const openShown =
    openList.phase === 'ready'
      ? openList.asks.filter((ask) => isAnswerable(ask, now)).slice(0, SHOW_LIMIT)
      : [];

  /** Odczyt sie udal i nie zostalo nic, w co da sie jeszcze wejsc. */
  const openEmpty = openList.phase === 'ready' && openShown.length === 0;
```

Zamień na:

```tsx
  // Odsiew na BIEZACYM czasie, nie na tym z chwili pobrania.
  const now = Date.now();
  /**
   * WSZYSTKIE otwarte, w ktore da sie jeszcze wejsc - nie tylko te pokazane.
   * Suma w naglowku liczy sie z tej listy, bo mowi o pieniadzach lezacych
   * na stole, a nie o pieniadzach lezacych na czterech pierwszych kartach.
   */
  const openAnswerable =
    openList.phase === 'ready' ? openList.asks.filter((ask) => isAnswerable(ask, now)) : [];
  const openShown = openAnswerable.slice(0, SHOW_LIMIT);

  /** Odczyt sie udal i nie zostalo nic, w co da sie jeszcze wejsc. */
  const openEmpty = openList.phase === 'ready' && openShown.length === 0;

  /**
   * ===== ILE PIENIEDZY LEZY NA STOLE =====
   *
   * `perAnswer * (seats - acceptedCount)`, czyli miejsca JESZCZE WOLNE. Suma
   * calych budzetow obejmowalaby takze miejsca juz zajete i oplacone, a
   * naglowek mowi o pieniadzach, ktore nadal da sie zgarnac.
   *
   * PER TOKEN, a nie w jednej liczbie. `Ask.token` domyslnie to USDC
   * i kompozytor wpisuje USDC na sztywno (useCreateAsk.ts), ale typ dopuszcza
   * inne. Zsumowanie roznych tokenow w jedno "$17.00" byloby napisem
   * nieprawdziwym. `addTokenAmount` jest do dokladnie tego i zwraca `false`,
   * gdy nie bylo czego dodac - takie pozycje liczymy osobno, jako "nie wiadomo
   * ile", zamiast wrzucac je jako zero.
   *
   * ZERO NOWYCH ODCZYTOW: liczone z tablicy, ktora komponent i tak juz ma.
   */
  const openMoney: TokenAmounts = {};
  let unpricedCount = 0;
  for (const ask of openAnswerable) {
    const seatsLeft = Math.max(0, ask.seats - ask.acceptedCount);
    if (!addTokenAmount(openMoney, ask.token, ask.perAnswer * seatsLeft)) unpricedCount += 1;
  }
  const moneyLines = Object.entries(openMoney).map(([token, amount]) =>
    formatAskMoney(amount, token)
  );
```

- [ ] **Krok 4: Ciemne warianty linii pustej i awarii**

Jasna karta wewnątrz granatowej wyglądałaby jak dziura. W
`app/basechat/components/FeedAskRail.tsx:660-687` zamień `QuietLine`
i `FailedLine` na wersje z tonem:

```tsx
/**
 * Zdanie zamiast kart. Jedna linia w karcie o tej samej obwodce co reszta
 * produktu - pas ma zajmowac miejsce takze wtedy, gdy nie ma czego pokazac,
 * bo znikanie uczylo ludzi, ze tej funkcji nie ma.
 *
 * `tone="dark"` dla wariantu kolumnowego: ta sama tresc i ta sama rola, tylko
 * na granacie. Biala kartka w srodku ciemnej karty czytalaby sie jak dziura.
 */
function QuietLine({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <p
      className={
        tone === 'dark'
          ? 'rounded-xl bg-white/[0.06] px-3.5 py-3 text-[12.5px] leading-[1.5] text-white/70'
          : 'rounded-card border border-soft-line bg-soft-surface px-4 py-3 text-[12.5px] leading-[1.5] text-soft-ink-muted shadow-card'
      }
    >
      {children}
    </p>
  );
}

/** Awaria ma wlasny slad na ekranie i wlasne wyjscie - nigdy nie udaje pustki. */
function FailedLine({
  message,
  onRetry,
  tone = 'light',
}: {
  message: string;
  onRetry: () => void;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <div
      role="status"
      className={
        dark
          ? 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-white/[0.06] px-3.5 py-3'
          : 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-card border border-soft-line bg-soft-surface px-4 py-3 shadow-card'
      }
    >
      <p
        className={`min-w-0 flex-1 break-words text-[12.5px] leading-[1.5] ${
          dark ? 'text-white/70' : 'text-soft-ink-muted'
        }`}
      >
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={`shrink-0 rounded-lg px-3.5 py-1.5 font-soft-display text-[12px] font-semibold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 ${
          dark
            ? 'bg-soft-accent text-[#1a1f3a] focus-visible:ring-soft-accent'
            : 'bg-soft-primary text-white focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface'
        }`}
      >
        Try again
      </button>
    </div>
  );
}
```

Następnie w ciele komponentu przekaż ton do wszystkich siedmiu wywołań tych
dwóch funkcji: `FailedLine` w liniach 540, 556 i 583, `QuietLine` w liniach
550, 564, 591 i 599 dzisiejszego pliku. Każde z nich dostaje
`tone={column ? 'dark' : 'light'}`. Nie zmieniaj ani jednego słowa w treściach
komunikatów.

- [ ] **Krok 5: Kolumnowy wariant `renderCards`**

W `app/basechat/components/FeedAskRail.tsx:450-511`, wewnątrz `renderCards`,
zaraz po linii `const single = list.length === 1;` wstaw osobną gałąź dla
kolumny, przed dzisiejszym `return`:

```tsx
    /**
     * WARIANT KOLUMNOWY. Ta sama lista, ten sam podzial na "odpowiadajacy
     * zostaje, autor wychodzi" - inny tylko ksztalt wiersza i kierunek.
     * Formularz odpowiedzi zostaje jasny i siedzi w jasnej ramce: to pole do
     * pisania, a nie element ozdobny, i ma sie czytac tak samo jak w feedzie.
     */
    if (column) {
      return (
        <ul className="-mx-1 flex flex-col">
          {list.map((ask) => {
            const isAuthor = viewerAddress !== null && ask.author.toLowerCase() === viewerAddress;
            const answerable =
              !isAuthor &&
              ask.status === 'open' &&
              ask.deadline > Date.now() &&
              ask.acceptedCount < ask.seats;

            return (
              <li key={ask.id} className="border-t border-white/10 first:border-t-0">
                <AskRailRow
                  ask={ask}
                  {...(answerable ? { onAnswer: () => setAnswering(ask.id) } : { href: '/asks' })}
                />
                {answering === ask.id && (
                  <div className="mx-1 mb-2 rounded-card bg-soft-surface p-2">
                    <FeedAnswerForm
                      ask={ask}
                      onSent={bumpAnswerCount}
                      onClose={() => setAnswering(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      );
    }
```

Dzisiejszy `return` z karuzelą zostaje pod spodem, nietknięty. Tryb `row`
działa dalej znak w znak.

- [ ] **Krok 6: Ciemna oprawa i suma w nagłówku**

W `app/basechat/components/FeedAskRail.tsx:514-536` jest dziś `return` z sekcją
i nagłówkiem. Zamień otwarcie sekcji i nagłówek na wariant zależny od `column`:

```tsx
  return (
    <section
      className={`font-soft ${
        column ? 'rounded-card bg-[#141a33] p-4 shadow-card' : ''
      } ${className}`}
      aria-label={shownTab === 'open' ? 'Open asks' : 'Resolved asks'}
    >
      {column ? (
        /* ===== NAGLOWEK KOLUMNOWY: NAJPIERW LICZBA, POTEM LISTA =====
           Sama lista pytan nie mowi, ile tu lezy. Suma mowi to jednym rzutem
           oka i jest policzona z tych samych Askow, ktore widac pod nia -
           zadnego drugiego zrodla. Podpis nazywa zakres wprost, bo pas zna
           tylko FETCH_LIMIT najnowszych otwartych Askow i nie wolno mu
           udawac, ze zna wszystkie. */
        <div className="mb-3">
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <h2 className="font-soft-display text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/45">
              {shownTab === 'open' ? 'Open asks · money on the table' : 'Resolved asks'}
            </h2>
            <RailFilter value={shownTab} onPick={pick} tone="dark" />
          </div>
          {shownTab === 'open' && moneyLines.length > 0 && (
            <>
              <p className="font-soft-display text-[26px] font-bold leading-none text-white">
                {moneyLines.join(' + ')}
              </p>
              <p className="mt-1 font-soft text-[11px] text-white/40">
                across {openAnswerable.length}{' '}
                {openAnswerable.length === 1 ? 'open ask' : 'open asks'}
                {unpricedCount > 0
                  ? `, ${unpricedCount} without a listed budget`
                  : ''}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-0.5">
          <h2 className="min-w-0 font-soft-display text-[13px] font-bold text-soft-ink">
            Asks
            <span className="ml-1.5 font-soft text-[12px] font-normal text-soft-ink-faint">
              questions with a budget and a deadline
            </span>
          </h2>

          <div className="flex shrink-0 items-center gap-2.5">
            <RailFilter value={shownTab} onPick={pick} />
            <Link
              href="/asks"
              className="shrink-0 text-[12px] font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              See all
            </Link>
          </div>
        </div>
      )}
```

- [ ] **Krok 7: Ciemny wariant przełącznika**

W `app/basechat/components/FeedAskRail.tsx:623-653` dołóż `tone` do `RailFilter`:

```tsx
function RailFilter({
  value,
  onPick,
  tone = 'light',
}: {
  value: RailTab;
  onPick: (next: RailTab) => void;
  tone?: 'light' | 'dark';
}) {
  const options: { key: RailTab; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'resolved', label: 'Resolved' },
  ];
  const dark = tone === 'dark';

  return (
    <div
      role="group"
      aria-label="Filter asks"
      className={`flex shrink-0 items-center gap-0.5 rounded-pill p-0.5 ${
        dark ? 'bg-white/10' : 'border border-soft-line bg-soft-sunken'
      }`}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(option.key)}
            className={`rounded-pill px-2.5 py-[3px] font-soft-display text-[11px] font-semibold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-1 focus-visible:ring-offset-soft-bg ${
              active
                ? dark
                  ? 'bg-white/90 text-[#141a33]'
                  : 'bg-soft-surface text-soft-ink shadow-chip'
                : dark
                  ? 'text-white/50'
                  : 'text-soft-ink-faint'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Krok 8: Przycisk na dole ciemnej karty**

Bezpośrednio przed zamykającym `</section>` w `return` komponentu (dzisiejsza
linia 610) wstaw:

```tsx
      {column && (
        /* Jedno wyjscie z karty. Prowadzi na /asks, bo tam jest cala lista,
           zakladanie wlasnego Aska i rozstrzyganie. Napis mowi, co sie stanie
           po klinieciu, a nie jak sie nazywa strona docelowa. */
        <Link
          href="/asks"
          className="mt-3 block rounded-pill bg-soft-accent px-4 py-2.5 text-center font-soft-display text-[12px] font-bold uppercase tracking-[0.1em] text-[#1a1f3a] transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#141a33]"
        >
          {shownTab === 'open' ? 'Answer an ask' : 'See all asks'}
        </Link>
      )}
```

- [ ] **Krok 9: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^app/"
```

Oczekiwane: pusto.

- [ ] **Krok 10: Sprawdzenie, że tryb `row` nie drgnął**

`/basechat` na 1024px i na telefonie (375px): pas Asków nad postami wygląda
i działa dokładnie jak przed zmianą. Wariantu kolumnowego jeszcze nigdzie nie
widać, bo nikt go nie wywołuje. To jest w porządku, wpina go zadanie 4.

- [ ] **Krok 11: Commit**

```bash
git add app/basechat/components/FeedAskRail.tsx
git commit -m "aski: uklad kolumnowy z suma pieniedzy do zgarniecia"
```

---

### Zadanie 4: Wpięcie Asków w prawą kolumnę

**Pliki:**
- Modyfikuj: `app/basechat/page.tsx:4902-4904` (pas w feedzie chowa się od `xl`)
- Modyfikuj: `app/basechat/page.tsx:4975-4979` (rail w prawej kolumnie)

**Interfejsy:**
- Konsumuje: `FeedAskRail` z propem `layout` (zadanie 3), trzecia kolumna
  od `xl` (zadanie 1)
- Produkuje: gotowy układ z makiety

- [ ] **Krok 1: Schowaj pas w feedzie od `xl`**

W `app/basechat/page.tsx:4902-4904` jest dziś:

```tsx
                  {!showMyFeed && (
                    <FeedAskRail viewer={address ?? null} className="mb-4" />
                  )}
```

Zamień na:

```tsx
                  {/* Od 1280px ten sam pas stoi w prawej kolumnie, w ukladzie
                      kolumnowym - `xl:hidden` pilnuje, zeby Aski nie byly na
                      ekranie dwa razy naraz. Ponizej 1280px i na telefonie
                      wszystko zostaje tak, jak bylo. */}
                  {!showMyFeed && (
                    <FeedAskRail viewer={address ?? null} className="mb-4 xl:hidden" />
                  )}
```

- [ ] **Krok 2: Wstaw rail nad Trends w prawej kolumnie**

W `app/basechat/page.tsx:4975-4979` jest dziś:

```tsx
              {isConnected && (
                <div className="hidden xl:block xl:w-[320px] xl:flex-none 2xl:w-[360px] overflow-y-auto border-l border-soft-line bg-soft-bg px-5 pt-6 pb-24">
                  {trendsColumnContent}
                </div>
              )}
```

Zamień na:

```tsx
              {isConnected && (
                <div className="hidden xl:block xl:w-[320px] xl:flex-none 2xl:w-[360px] overflow-y-auto border-l border-soft-line bg-soft-bg px-5 pt-6 pb-24">
                  {/* Aski stoja NAD statystykami, bo jako jedyne w tej kolumnie
                      sa czyms do zrobienia, a nie czyms do przeczytania.
                      W "My Feed" ich nie ma - z tego samego powodu co
                      w feedzie: patrzacy oglada wtedy wlasne posty, a cudze
                      otwarte Aski nie sa czescia tej odpowiedzi. */}
                  {!showMyFeed && (
                    <FeedAskRail viewer={address ?? null} layout="column" className="mb-4" />
                  )}
                  {trendsColumnContent}
                </div>
              )}
```

- [ ] **Krok 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^app/"
```

Oczekiwane: pusto.

- [ ] **Krok 4: Sprawdzenie w przeglądarce**

Na 1024px: Aski w feedzie, prawej kolumny nie ma.
Na 1280, 1440 i 1920px:

1. Aski widać dokładnie raz, w prawej kolumnie, jako ciemną kartę.
2. W feedzie nad postami Asków nie ma.
3. Suma nad listą zgadza się z tym, co widać pod nią. Policz ręcznie:
   dla każdego Aska kwota razy liczba wolnych miejsc.
4. Przełącznik Open/Resolved przestawia listę w obu kierunkach.
5. Kliknięcie w cudzego Aska z wolnym miejscem otwiera formularz odpowiedzi
   w railu, na jasnej ramce. Wysłanie odpowiedzi podbija licznik "sealed".
6. Kliknięcie we własnego Aska prowadzi na `/asks`.
7. Przełączenie na "My Feed" chowa całą ciemną kartę.
8. Zegar tyka. Na Asku z terminem poniżej godziny co sekundę.
9. Post w feedzie ma te same przyciski co przed całą zmianą. Wyślij jednego
   tipa i sprawdź, że przechodzi.

- [ ] **Krok 5: Commit**

```bash
git add app/basechat/page.tsx
git commit -m "basechat desktop: aski w prawej kolumnie, jedna kopia na ekranie"
```

---

### Zadanie 5: Warstwa wizualna

**Pliki:**
- Modyfikuj: `app/globals.css:52-59` (cienie i promienie)

**Interfejsy:**
- Konsumuje: nic
- Produkuje: nic dla kodu; zmiana dotyka wyglądu wszystkiego, co używa tokenów

- [ ] **Krok 1: Zmiękcz cień i podnieś promień**

Kierunek z makiety to więcej powietrza i mniej krawędzi. Robimy to na tokenach,
bo tam jest jedno miejsce na całą aplikację. W `app/globals.css:54-59` zamień:

```css
  --soft-shadow-card: 0 4px 16px rgba(102, 86, 190, 0.08);
  --soft-shadow-chip: 0 2px 8px rgba(102, 86, 190, 0.14);
  --soft-shadow-float: 0 10px 30px rgba(74, 60, 150, 0.18);

  --soft-radius-card: 24px;
  --soft-radius-pill: 999px;
```

na:

```css
  --soft-shadow-card: 0 6px 24px rgba(102, 86, 190, 0.10);
  --soft-shadow-chip: 0 2px 10px rgba(102, 86, 190, 0.16);
  --soft-shadow-float: 0 14px 38px rgba(74, 60, 150, 0.20);

  --soft-radius-card: 26px;
  --soft-radius-pill: 999px;
```

- [ ] **Krok 2: Sprawdzenie zasięgu zmiany**

To dotyka KAŻDEGO ekranu, który używa `shadow-card` i `rounded-card`, więc
obejrzyj po kolei: `/basechat` na 1440px i na 375px, `/asks`, `/money`,
`/leaderboard`. Szukasz jednego: czy gdzieś cień nie zrobił się brudny albo
promień nie zjadł treści w rogu.

Jeżeli którykolwiek ekran wygląda gorzej niż przed zmianą, cofnij ten krok
i zgłoś to zamiast dobierać wartości na oko. Tokeny są wyciągnięte z projektu
właściciela, nie dobrane, i tak mają zostać.

- [ ] **Krok 3: Commit**

```bash
git add app/globals.css
git commit -m "soft: miekszy cien i wiekszy promien kart"
```

---

### Zadanie 6: Chipsy sieci nad kompozytorem

**Pliki:**
- Modyfikuj: `app/components/GooeyNav/GooeyNav.tsx:68` (siatka), `:92` i `:105`, `:167` (kolory kafli)

**Interfejsy:**
- Konsumuje: nic
- Produkuje: nic dla kodu

- [ ] **Krok 1: Sprawdź, że komponent jest używany tylko tutaj**

```bash
grep -rn "GooeyNav" app --include=*.tsx | grep -v "app/components/GooeyNav/"
```

Oczekiwane: dokładnie dwie linie, obie w `app/basechat/page.tsx` (import
w linii 76 i użycie w linii 3797). Jeżeli jest więcej, ZATRZYMAJ SIĘ i zgłoś:
zmiana przestaje być lokalna i trzeba ją przemyśleć od nowa.

- [ ] **Krok 2: Wymień szare kafle na tokeny `soft-*`**

W `app/components/GooeyNav/GooeyNav.tsx:105` jest dziś:

```tsx
                <div aria-hidden="true" className="absolute inset-0 rounded-2xl bg-gray-100 dark:bg-gray-700" />
```

Zamień na:

```tsx
                <div aria-hidden="true" className="absolute inset-0 rounded-2xl bg-soft-sunken" />
```

W `app/components/GooeyNav/GooeyNav.tsx:167` jest dziś:

```tsx
                  className="absolute inset-0 rounded-2xl bg-gray-200 dark:bg-gray-600"
```

Zamień na:

```tsx
                  className="absolute inset-0 rounded-2xl bg-soft-line"
```

Szarość pochodziła z ciemnego tła, którego na tej stronie już nie ma. Warianty
`dark:` są tu martwe: `/basechat` chodzi na jednym, jasnym tle na obu
szerokościach (patrz komentarz przy `bg-soft-bg` w `page.tsx:3090`).

- [ ] **Krok 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "^app/"
```

Oczekiwane: pusto.

- [ ] **Krok 4: Sprawdzenie w przeglądarce**

`/basechat` na 1440px, z podłączonym portfelem, kompozytor w trybie postu.
Rząd sieci ma siedem pozycji, dokładnie tych samych co przed zmianą.
Kliknięcie w każdą przestawia kompozytor na tę sieć. Animacja przy przełączaniu
działa jak przedtem. Na telefonie rząd dalej przewija się w poziomie.

W trybie Ask rzędu nie ma. To jest zamierzone i było tak przed zmianą.

- [ ] **Krok 5: Commit**

```bash
git add app/components/GooeyNav/GooeyNav.tsx
git commit -m "chipsy sieci: kolory z tokenow zamiast szarosci po ciemnym tle"
```

---

## Domknięcie

- [ ] **Pełny build**

```bash
npm run build
```

Oczekiwane: przechodzi. Jeżeli nie, napraw przed dalszymi krokami.

- [ ] **Przejście po liście kontrolnej ze specyfikacji**

`docs/BASECHAT-DESKTOP-UI-SPEC.md`, sekcja 6. Dziewięć punktów, cztery
szerokości. Odhacz każdy.

- [ ] **Zaktualizuj specyfikację, jeżeli coś poszło inaczej**

Gdy w trakcie zmieniła się któraś decyzja (inna szerokość kolumny, inny próg,
inny kształt sumy), popraw specyfikację w tym samym commicie co kod. Dokument,
który opisuje nieistniejący układ, jest gorszy niż jego brak.
