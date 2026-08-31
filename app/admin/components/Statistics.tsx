'use client';

import { useCallback, useEffect, useState } from 'react';
import { collection, query, where, orderBy, getCountFromServer, Timestamp } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { saveGlobalStats } from '../../utils/stats/globalStats';

/**
 * Statystyki panelu admina — liczone AGREGACJĄ, nie pobieraniem dokumentów.
 *
 * === CO TU BYŁO WCZEŚNIEJ ===
 * Cały komponent zwracał czerwone pudełko "Statystyki tymczasowo wyłączone",
 * bo każde wejście na panel kosztowało 3000+ odczytów Firestore. To nie była
 * przesada w drugą stronę: kod ściągał CAŁE kolekcje `getDocs`, żeby policzyć
 * ich długość w JavaScripcie. Przy 180 tysiącach użytkowników pełne policzenie
 * tą metodą to 180 000 odczytów na jedno kliknięcie.
 *
 * Wyłączenie panelu rozwiązywało koszt, ale kosztem tego, po co panel istnieje:
 * admin przestał wiedzieć cokolwiek o własnym produkcie.
 *
 * === DLACZEGO TERAZ JEST TANIO ===
 * `getCountFromServer()` liczy po stronie Firestore i jest rozliczane jako
 * JEDEN odczyt na każde 1000 pasujących wpisów indeksu (minimum jeden).
 * Czyli 180 000 użytkowników = **180 odczytów**, a nie 180 000. Tysiąckrotnie
 * taniej, przy dokładnie tej samej liczbie na wyjściu — to nie jest szacunek
 * ani próbka.
 *
 * Wzorzec jest już sprawdzony w tym repo: app/utils/agents/registry.ts.
 *
 * === DWIE ZASADY, KTÓRE TRZYMAJĄ KOSZT NISKO ===
 * 1. NIC nie liczy się samo. Wejście na panel kosztuje ZERO odczytów. Liczby
 *    pojawiają się dopiero po kliknięciu — inaczej odświeżenie strony przez
 *    pomyłkę kosztuje tyle samo co świadome sprawdzenie.
 * 2. Wynik siedzi w localStorage razem z godziną pomiaru. Powrót na panel
 *    pokazuje ostatni pomiar i JAK JEST STARY, zamiast liczyć od nowa. Admin
 *    sam decyduje, czy dane sprzed dziesięciu minut mu wystarczą.
 */

type Metric = {
  key: string;
  label: string;
  /** Krótkie wyjaśnienie, czego dokładnie dotyczy liczba. */
  hint?: string;
  value: number;
};

type Snapshot = {
  takenAt: number;
  metrics: Metric[];
  /** Ile odczytów Firestore kosztował ten pomiar (szacunek wg reguły 1/1000). */
  estimatedReads: number;
};

const CACHE_KEY = 'mysphere.admin.stats.v1';

/** Firestore rozlicza count() jako 1 odczyt na każde rozpoczęte 1000 wpisów. */
const readsFor = (count: number) => Math.max(1, Math.ceil(count / 1000));

const DAY = 24 * 60 * 60 * 1000;

async function countWhere(
  collectionName: string,
  field?: string,
  since?: number
): Promise<number> {
  const base = collection(db, collectionName);
  const q =
    field && since !== undefined
      ? query(base, where(field, '>=', Timestamp.fromMillis(since)))
      : query(base);
  const snapshot = await getCountFromServer(q);
  return snapshot.data().count;
}

/**
 * Ile dokumentów w kolekcji MA dane pole.
 *
 * `orderBy(pole)` pomija dokumenty, w których tego pola nie ma - to nie jest
 * dziwactwo, tylko definicja indeksu. Dzięki temu policzenie z `orderBy` mówi
 * dokładnie tyle: ilu wpisów w ogóle dotyczą zapytania zakresowe po tym polu.
 * Bez tej liczby każde „aktywni” jest zaniżone o nieznaną wartość.
 */
async function countWithField(collectionName: string, field: string): Promise<number> {
  const snapshot = await getCountFromServer(
    query(collection(db, collectionName), orderBy(field))
  );
  return snapshot.data().count;
}

function formatAge(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'przed chwilą';
  if (mins < 60) return `${mins} min temu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} godz. temu`;
  return `${Math.round(hours / 24)} dni temu`;
}

export default function Statistics() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Ostatni pomiar z pamięci przeglądarki. Zero odczytów Firestore.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) setSnapshot(JSON.parse(raw) as Snapshot);
    } catch {
      // Uszkodzony wpis nie ma prawa wywrócić panelu - po prostu go nie ma.
    }
    setNow(Date.now());
  }, []);

  const runCount = useCallback(async () => {
    setIsCounting(true);
    setError(null);

    try {
      const since24h = Date.now() - DAY;
      const since7d = Date.now() - 7 * DAY;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Wszystko równolegle - to niezależne zapytania, a panel czeka na komplet.
      const [
        users,
        withLastActive,
        active24h,
        active7d,
        active30d,
        active365d,
        posts,
        postsToday,
        posts30d,
        comments,
        tips,
      ] = await Promise.all([
        countWhere('users'),
        // Dokumenty BEZ pola `lastActive` sa dla zapytania zakresowego
        // niewidoczne, wiec bez tej liczby kazde "aktywni" jest zanizone o
        // nieznana wartosc. orderBy pomija dokumenty bez pola, czyli count
        // z orderBy = ile dokumentow to pole w ogole ma.
        countWithField('users', 'lastActive'),
        countWhere('users', 'lastActive', since24h),
        countWhere('users', 'lastActive', since7d),
        countWhere('users', 'lastActive', Date.now() - 30 * DAY),
        countWhere('users', 'lastActive', Date.now() - 365 * DAY),
        countWhere('posts'),
        countWhere('posts', 'timestamp', startOfToday.getTime()),
        countWhere('posts', 'timestamp', Date.now() - 30 * DAY),
        countWhere('comments'),
        countWhere('tips'),
      ]);

      const bezPola = users - withLastActive;

      const metrics: Metric[] = [
        { key: 'users', label: 'Konta razem', value: users },
        {
          key: 'active24h',
          label: 'Aktywni 24 h',
          hint: 'wg lastActive',
          value: active24h,
        },
        { key: 'active7d', label: 'Aktywni 7 dni', value: active7d },
        { key: 'active30d', label: 'Aktywni 30 dni', value: active30d },
        {
          key: 'active365d',
          label: 'Aktywni 12 mies.',
          hint: 'porównaj z 30 dniami',
          value: active365d,
        },
        {
          key: 'noLastActive',
          label: 'Bez pola lastActive',
          hint: 'niewidoczni w oknach wyżej',
          value: bezPola,
        },
        { key: 'posts', label: 'Posty razem', value: posts },
        { key: 'posts30d', label: 'Posty 30 dni', value: posts30d },
        { key: 'postsToday', label: 'Posty dzisiaj', value: postsToday },
        { key: 'comments', label: 'Komentarze', value: comments },
        { key: 'tips', label: 'Tipy', value: tips },
      ];

      // Koszt liczymy z tych samych liczb, które właśnie dostaliśmy - czyli
      // panel mówi wprost, ile kosztowało jego własne odświeżenie.
      const estimatedReads = metrics.reduce((sum, m) => sum + readsFor(m.value), 0);

      const fresh: Snapshot = { takenAt: Date.now(), metrics, estimatedReads };
      setSnapshot(fresh);

      /**
       * Pomiar trafia takze do globalStats/current, skad czyta go FEED.
       *
       * PO CO: liczniki w panelu Trends czytaly wczesniej wartosci wpisane na
       * sztywno (175 708 uzytkownikow przy prawdziwych 184 064) z losowym
       * drganiem "dla realizmu". Po przepisaniu ich na prawdziwy odczyt feed
       * zostal pusty, bo NIKT tego dokumentu nie zapisywal - i musialem
       * podlozyc go recznie skryptem.
       *
       * Teraz kazde swiadome przeliczenie tutaj odswieza to, co widza wszyscy.
       * Jeden odczyt na goscia zamiast ~467, a liczby sa te same, ktore admin
       * wlasnie zobaczyl.
       *
       * Zapis NIE MOZE wywrocic panelu: to skutek uboczny, nie cel klikniecia.
       * Gdy sie nie uda, liczby i tak sa juz na ekranie.
       */
      void saveGlobalStats({
        users,
        posts,
        comments,
        tips,
        // Lajki nie maja wlasnej kolekcji - siedza jako pole `likes` na postach,
        // wiec ich policzenie wymaga sumy, nie zliczenia. Dopoki tego nie
        // liczymy, pole zostaje `null`: kreska na ekranie jest uczciwa,
        // a zero byloby twierdzeniem.
        likes: null,
      }).catch((saveError) => {
        console.warn('[Statistics] Nie udalo sie zapisac globalStats:', saveError);
      });
      setNow(Date.now());

      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
      } catch {
        // Brak miejsca w localStorage nie unieważnia samego pomiaru.
      }
    } catch (countError) {
      console.error('[Statistics] Liczenie nie powiodlo sie:', countError);

      // Awaria i zero to nie to samo zdanie - nie podmieniamy liczb na zera.
      //
      // `resource-exhausted` dostaje WLASNY komunikat, bo to jedyna przyczyna
      // z tej listy, ktora MIJA SAMA i nie jest awaria niczego. Firestore ma
      // osobny, dobowy limit na zapytania agregujace - niezalezny od limitu
      // zwyklych odczytow, ktore w tym czasie dzialaja normalnie.
      //
      // Zmierzone: rano to samo zapytanie zwracalo 184 064 uzytkownikow,
      // wieczorem `resource-exhausted`, a `getDocs` obok dzialal bez zarzutu.
      // Ogolne "nie udalo sie policzyc" kazaloby szukac bledu tam, gdzie go
      // nie ma.
      const code = (countError as { code?: string } | null)?.code;
      const exhausted =
        code === 'resource-exhausted' ||
        (countError instanceof Error && /resource-exhausted|quota/i.test(countError.message));

      setError(
        exhausted
          ? 'Wyczerpany dobowy limit zapytań agregujących w Firestore. To nie jest awaria — limit odnawia się sam, a zwykłe odczyty działają normalnie.'
          : countError instanceof Error
            ? `Nie udało się policzyć: ${countError.message}`
            : 'Nie udało się policzyć.'
      );
    } finally {
      setIsCounting(false);
    }
  }, []);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Statystyki</h2>
          <p className="mt-1 text-sm text-gray-500">
            {snapshot
              ? `Pomiar ${formatAge(now - snapshot.takenAt)} · kosztował ~${snapshot.estimatedReads} odczytów`
              : 'Jeszcze nie liczone. Wejście na panel nie kosztuje nic.'}
          </p>
        </div>

        <button
          type="button"
          onClick={runCount}
          disabled={isCounting}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          {isCounting ? 'Liczę…' : snapshot ? 'Policz ponownie' : 'Policz teraz'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          {snapshot && ' Liczby poniżej pochodzą z poprzedniego pomiaru.'}
        </p>
      )}

      {snapshot ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {snapshot.metrics.map((metric) => (
            <div key={metric.key} className="rounded-md border border-gray-200 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {metric.label}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                {metric.value.toLocaleString('pl-PL')}
              </p>
              {metric.hint && <p className="mt-0.5 text-[11px] text-gray-400">{metric.hint}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          Liczby pojawią się po kliknięciu. Liczenie idzie agregacją po stronie
          Firestore — 180 tys. użytkowników kosztuje ok. 180 odczytów, nie 180 tys.
        </p>
      )}

      <details className="mt-5 text-sm text-gray-600">
        <summary className="cursor-pointer font-semibold text-gray-700">
          Skąd biorą się te liczby
        </summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            Każda pozycja to <code>getCountFromServer()</code> — Firestore liczy po swojej
            stronie i odsyła samą liczbę. Rozliczane jako jeden odczyt na każde rozpoczęte
            1000 pasujących wpisów, więc koszt rośnie tysiąc razy wolniej niż liczba
            dokumentów. To pełne policzenie, nie próbka ani szacunek.
          </p>
          <p>
            <strong>„Aktywni” liczone są po polu <code>lastActive</code></strong>, które
            aplikacja zapisuje jako znacznik serwerowy. Konta bez tego pola są dla takiego
            zapytania niewidoczne — dlatego stoi tu osobny kafelek „Bez pola lastActive”.
            Każde „aktywni” jest zaniżone najwyżej o tę liczbę, nigdy zawyżone.
          </p>
          <p>
            Okna 30-dniowe i 12-miesięczne stoją obok siebie celowo. Jedna liczba
            aktywnych nic nie znaczy — dopiero <strong>stosunek rocznego okna do
            miesięcznego</strong> pokazuje, czy produkt rośnie, stoi, czy się wykrusza.
            Ten sam powód dla „Posty 30 dni” obok „Posty razem”: łączna suma rośnie
            zawsze i sama w sobie nie mówi nic o dziś.
          </p>
          <p>
            Nic nie odświeża się samo i nic nie liczy się w tle. Ostatni wynik siedzi
            w pamięci przeglądarki razem z godziną pomiaru.
          </p>
        </div>
      </details>
    </div>
  );
}
