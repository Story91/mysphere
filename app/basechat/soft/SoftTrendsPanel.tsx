'use client';

import { Avatar } from '../../components/identity';
import { NameWithSuffix } from '../../utils/nameSuffix';

/**
 * Panel Trends - cztery liczby i ranking najaktywniejszych.
 *
 * GDZIE STOI. Na telefonie: cala zawartosc zakladki "Trends". Na desktopie:
 * dolna czesc jedynej kolumny bocznej, pod profilem. Byl tu wczesniej
 * `lg:hidden` - i przez to desktop, po usunieciu starego bloku "Global
 * Statistics", nie pokazywal juz ZADNYCH statystyk. Te same dane maja byc
 * widoczne na obu szerokosciach; roznica ma byc w oprawie, nie w tresci.
 *
 * REJESTR, NIE SIATKA PASTELOWYCH KAFLI.
 *
 * Bylo tu szesc kwadratow 2x2, kazdy we wlasnym przygaszonym kolorze
 * kategorii. Argument brzmial: liczby o tej samej wadze bez rozroznienia
 * czytaja sie jak tabela, a z kolorem kazda ma wlasne miejsce w pamieci.
 * Argument jest nieglupi, ale przegral z tym, jak to wygladalo - siatka
 * kolorowych kafli z wielka cyfra w kazdym to najczestszy uklad panelu
 * statystyk, jaki istnieje, i przez to nie mowi o tym produkcie nic.
 * Decyzja wlasciciela produktu i jest sluszna.
 *
 * Teraz jest to jedna karta z wierszami: podpis po lewej, liczba po prawej,
 * wlosowa linia miedzy nimi. Liczby stoja w jednej kolumnie na `tabular-nums`,
 * wiec cyfry sa pod cyframi i sam slupek pokazuje rzedy wielkosci bez zadnego
 * koloru. Czyta sie to jak wyciag, a produkt, ktorego motyw brzmi "kazda
 * liczba jest paragonem", ma prawo tak wygladac.
 *
 * KOLOR ZOSTAL JEDEN: pomarancz na wierszu Tips. On WLASNIE liczy pieniadze -
 * rozliczone platnosci - wiec jako jedyny uzywa akcentu zgodnie z regula
 * "pomarancz znaczy pieniadze", a nie wbrew niej. Pole `tone` zostaje w typie,
 * bo wywolania je podaja, ale czyta sie z niego juz tylko `money`.
 *
 * JEDNA KOLUMNA, NIE DWIE. Wiersz bierze cala szerokosc, wiec panel dziala tak
 * samo na telefonie 320px, w kolumnie bocznej 352px i w prawej 320px - nie ma
 * czego skracac ani zmniejszac, zeby sie zmiescilo. Poprzedni uklad musial
 * pilnowac, zeby "184K" w rozmiarze 26px zmiescilo sie w kaflu 89px.
 *
 * CZEGO TU NIE MA I DLACZEGO: "Networks". Da sie policzyc (SOFT_NETWORKS ma
 * SIEDEM pozycji), ale ta liczba nigdy sie nie zmienia. Kafel, ktory zawsze
 * pokazuje to samo, po drugiej wizycie przestaje byc czytany - i zabiera uwage
 * pozostalym pieciu, ktore naprawde sie ruszaja. Stala nalezy do opisu
 * produktu, nie do panelu o nazwie Trends.
 *
 * RANKING pokazuje pozycje numerem w kolku, nie samym porzadkiem na liscie -
 * przy przewijaniu widac wtedy, na ktorym miejscu sie jest, bez liczenia
 * wierszy od gory.
 */

/**
 * `money` jest zarezerwowane dla kafla Tips i wstawia je ten komponent, nie
 * wywolanie - regula "pomarancz znaczy pieniadze" nalezy do panelu, a nie do
 * tego, kto go uzywa.
 */
export type SoftTrendTone = 'purple' | 'amber' | 'green' | 'pink' | 'blue' | 'teal' | 'money';
export type SoftTrendStat = {
  label: string;
  /**
   * `null` znaczy NIEZMIERZONE i pokazuje sie jako kreska.
   *
   * Typ dopuszcza `null` CELOWO. Wczesniej bylo tu samo `string`, wiec
   * wywolanie robilo `String(totalLikes)` - a `String(null)` to napis "null",
   * ktory przechodzil przez compact() bez zmian i laduje na kaflu jako slowo
   * "null". Tak wygladal kafel Likes na produkcji. Znak "nie wiem" ma wstawiac
   * ten komponent, bo tylko tutaj wiadomo, jak on wyglada.
   */
  value: string | number | null;
  tone: SoftTrendTone;
  /**
   * Zastrzezenie pod podpisem, np. "since Aug 6".
   *
   * Istnieje dla liczb NIEPELNYCH: licznik lajkow rusza od zera w chwili
   * wlaczenia i nie obejmuje lajkow wczesniejszych, wiec podana bez tej linijki
   * bylaby czescia sumy podana jako calosc.
   */
  note?: string;
  /**
   * Pelne zdanie do dymka, np. "at least this many. A full count as of
   * Aug 16, 2025, plus ...".
   *
   * Bylo tu zdanie sklejane NA MIEJSCU: `${note}, earlier ones are not included
   * yet`. Dzialalo, dopoki niepelna liczba mogla byc niepelna tylko na jeden
   * sposob. Odkad suma potrafi byc dolna granica (stara migawka + licznik),
   * tamten dopisek stal sie nieprawda - tam wczesniejsze lajki wlasnie SA
   * policzone, a brakuje srodka. Ten plik nie ma skad wiedziec, ktory to
   * przypadek, wiec dostaje gotowe zdanie od tego, kto wie.
   */
  detail?: string;
};
export type SoftActiveUser = {
  address: string;
  name: string;
  points: number;
  /** Awatar zapisany u nas. Uzywany DOPIERO, gdy nie ma awatara z ENS/Basename. */
  avatar?: string | null;
};

/**
 * Skrocony zapis duzej liczby: 184064 -> "184K".
 *
 * Kafle maja 4 znaki szerokosci uzytecznej i staly obok siebie w kwadracie.
 * "184064" wchodzilo w nie na styk i psulo rowna siatke, a przy 2,6 mln
 * rozpychalo kafel. Pelna wartosc zostaje w `title`, wiec nic nie ginie -
 * schodzi tylko z pierwszego planu, gdzie i tak nikt nie czyta szesciu cyfr.
 *
 * Ponizej 10 000 pokazujemy dokladnie: tam kazda cyfra jeszcze cos znaczy.
 */
function compact(value: string): string {
  const n = Number(value.replace(/\s/g, ''));
  if (!Number.isFinite(n)) return value;
  if (n < 10_000) return n.toLocaleString('en-US');
  if (n < 1_000_000) return `${Math.round(n / 100) / 10}K`.replace('.0K', 'K');
  return `${Math.round(n / 100_000) / 10}M`.replace('.0M', 'M');
}

/**
 * Znak "nie wiem". `null` z gory znaczy NIEUDANY ODCZYT, a nie zero - to dwie
 * rozne rzeczy i tak samo rozroznia je warstwa danych (`failed` w
 * getLeaderboard i getOpenAsks). Zero na kaflu Tips to zdanie o swiecie
 * ("nikomu jeszcze nie zaplacono"); kreska to zdanie o nas.
 *
 * compact() przepuszcza ten znak bez zmian, bo Number('—') nie jest liczba.
 */
const UNKNOWN = '—';

function toTileValue(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return UNKNOWN;
  // "null"/"NaN" przychodzace jako NAPIS to tez brak pomiaru, nie wartosc.
  // Wywolania skladaja te kafle z roznych zrodel i jedno String(x) po drodze
  // wystarczy, zeby na kaflu wyladowalo slowo "null" - patrz SoftTrendStat.value.
  const text = String(input).trim();
  if (text === '' || text === 'null' || text === 'undefined' || text === 'NaN') return UNKNOWN;
  return text;
}

const MEDAL = ['#F5A73B', '#B9B1D8', '#C98B5A'];

export default function SoftTrendsPanel({
  stats,
  tips,
  openAsks,
  activeUsers,
  onOpenUser,
  onSeeAll,
  page,
  totalPages,
  onPageChange,
  isLoadingPage = false,
  children,
}: {
  stats: SoftTrendStat[];
  /**
   * Liczba rozliczonych platnosci - `totalTips` z getLeaderboard()
   * (app/utils/tips/getLeaderboard.ts). Jedyna liczba w tej siatce, ktora
   * dotyczy pieniedzy, wiec jedyna, ktora dostaje pomarancz.
   *
   * `undefined` = jeszcze niepodpiete, kafel w ogole nie powstaje (siatka
   * zostaje taka, jaka byla). `null` = odczyt sie nie udal, kafel pokazuje
   * kreske. Liczba = liczba.
   */
  tips?: string | number | null;
  /**
   * Liczba OTWARTYCH Askow - `asks.length` z getOpenAsks()
   * (app/utils/asks/asks.ts). Uwaga przy podpinaniu: ta funkcja ma domyslny
   * limit 20 dokumentow, wiec bez podniesienia `max` kafel utknie na 20.
   *
   * Podpis brzmi "Open Asks", a nie "Asks", bo liczone sa wylacznie te ze
   * `status === 'open'` - i tylko one da sie jeszcze zgarnac.
   */
  openAsks?: string | number | null;
  activeUsers: SoftActiveUser[];
  onOpenUser?: (address: string) => void;
  onSeeAll?: () => void;
  /** Numer biezacej strony rankingu (1-indeks). Bez niego stopka nie powstaje. */
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  isLoadingPage?: boolean;
  children?: React.ReactNode;
}) {
  // Numeracja ma byc CIAGLA przez wszystkie strony: druga strona zaczyna sie
  // od 11, a nie znowu od 1. Inaczej "top 10" na kazdej stronie znaczy co
  // innego, a medale trafialyby na miejsca 11-13.
  const offset = page && page > 1 ? (page - 1) * 10 : 0;
  const showPager = Boolean(page && totalPages && totalPages > 1 && onPageChange);

  // Kafle skladaja sie z tego, co przyszlo w `stats`, plus dwa liczone gdzie
  // indziej. Tips i Asks nie ida przez `stats`, bo maja WLASNE zrodla (kolekcje
  // `tips` i `asks`) i wlasny stan "nie udalo sie odczytac" - a tone dla
  // pieniedzy ustala ten plik, nie wywolanie.
  const tiles: { label: string; value: string; tone: SoftTrendTone; note?: string; detail?: string }[] = [
    ...stats.map((stat) => ({ ...stat, value: toTileValue(stat.value) })),
    ...(tips !== undefined ? [{ label: 'Tips', value: toTileValue(tips), tone: 'money' as const }] : []),
    ...(openAsks !== undefined
      ? [{ label: 'Open Asks', value: toTileValue(openAsks), tone: 'teal' as const }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4 font-soft">
      <h2 className="font-soft-display text-[24px] font-bold text-soft-ink lg:text-[18px]">Trends</h2>

      {/* ===== REJESTR, NIE SIATKA KAFLI =====
          Uzasadnienie tej formy stoi w naglowku pliku. Jedna karta, wiersze
          oddzielone wlosowa linia, podpis po lewej, liczba po prawej w kolumnie
          o stalej szerokosci cyfry (`tabular-nums`) - przez to jednostki,
          dziesiatki i setki stoja pod soba i wysokosc slupka sama pokazuje
          rzedy wielkosci. */}
      <div className="rounded-card bg-soft-surface px-4 py-1 shadow-card">
        <dl className="flex flex-col">
          {tiles.map((stat, index) => (
            <div
              key={stat.label}
              className={`flex items-baseline justify-between gap-3 py-3 ${
                index > 0 ? 'border-t border-soft-line/60' : ''
              }`}
            >
              <dt className="min-w-0 font-soft text-[12px] font-semibold uppercase tracking-[0.07em] text-soft-ink-soft">
                {stat.label}
                {/* Zastrzezenie stoi PRZY liczbie, nie w dymku - liczba
                    niepelna podana bez niego jest po prostu liczba
                    nieprawdziwa, a dymka nikt nie otwiera. */}
                {stat.note && (
                  <span className="ml-1.5 font-soft text-[10.5px] font-medium normal-case tracking-normal text-soft-ink-faint">
                    {stat.note}
                  </span>
                )}
              </dt>
              {/* Skrot na wierzchu, pelna liczba w `title` - patrz compact(). */}
              <dd
                title={
                  stat.value === UNKNOWN
                    ? 'Not available right now'
                    : stat.detail
                      ? `${stat.value} — ${stat.detail}`
                      : stat.value
                }
                className={`flex-none font-soft-display text-[21px] font-bold leading-none tabular-nums ${
                  stat.tone === 'money' ? 'text-soft-accent-deep' : 'text-soft-ink'
                }`}
              >
                {compact(stat.value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <section className="rounded-card bg-soft-surface p-4 shadow-card">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-soft-display text-[15px] font-bold text-soft-ink">Most Active</h3>
          {onSeeAll && (
            <button
              type="button"
              onClick={onSeeAll}
              className="font-soft text-[12.5px] font-semibold text-soft-primary-deep transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              See all
            </button>
          )}
        </div>

        {activeUsers.length === 0 ? (
          <p className="py-4 text-center font-soft text-[13px] text-soft-ink-soft">
            Nobody has earned points yet.
          </p>
        ) : (
          <ol className="flex flex-col">
            {activeUsers.map((user, index) => (
              <li key={user.address}>
                <button
                  type="button"
                  onClick={() => onOpenUser?.(user.address)}
                  className="flex w-full items-center gap-3 rounded-pill py-2.5 text-left transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.99] hover:bg-soft-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                >
                  <span
                    className="flex h-6 w-6 flex-none items-center justify-center rounded-full font-soft-display text-[11px] font-bold text-white"
                    /* rgb(var(...)), nie samo var(...). Tokeny kolorow w tym
                       repo trzymaja TROJKE KANALOW ("185 177 216"), a nie
                       gotowy kolor - taki jest warunek dzialania modyfikatorow
                       przezroczystosci Tailwinda. Wstawione wprost do
                       `background` dawalo `background: 185 177 216`, czyli CSS
                       nieprawidlowy i po cichu pomijany: kolko traci tlo, a
                       numer pozycji jest bialy, wiec od CZWARTEGO miejsca w dol
                       znikal calkowicie. */
                    style={{ background: MEDAL[offset + index] ?? 'rgb(var(--soft-line-strong))' }}
                  >
                    {offset + index + 1}
                  </span>

                  {/* Awatar: NAJPIERW z ENS/Basename, dopiero potem nasz.
                      <Avatar> sam rozwiazuje nazwe i obrazek z lancucha, a
                      `defaultComponent` wchodzi wylacznie wtedy, gdy tam nic
                      nie ma. Czyli dokladnie "ich ENS albo nasze profilowe,
                      zaleznie co maja" - bez zgadywania po naszej stronie. */}
                  <span className="h-7 w-7 flex-none overflow-hidden rounded-full bg-soft-sunken">
                    <Avatar
                      address={user.address as `0x${string}`}
                      className="h-7 w-7"
                      defaultComponent={
                        user.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.avatar}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : undefined
                      }
                    />
                  </span>

                  {/* Koncowka trzyma kolor swojej sieci - patrz
                      app/utils/nameSuffix.tsx. Wczesniej caly napis byl
                      jednolity, wiec .sphere, .camper, .celo i .world
                      wygladaly identycznie. */}
                  <NameWithSuffix
                    name={user.name}
                    className="min-w-0 flex-1 truncate font-soft text-[13.5px] font-semibold text-soft-ink"
                  />
                  <span className="flex-none rounded-pill bg-soft-sunken px-2.5 py-1 font-soft-display text-[12px] font-bold tabular-nums text-soft-primary-deep">
                    {user.points.toLocaleString('en-US')}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {/* Stopka stronicowania. Powstaje TYLKO wtedy, gdy jest wiecej niz
            jedna strona - pojedyncza strona z napisem "1 / 1" i dwoma
            wygaszonymi strzalkami to obietnica nawigacji, ktorej nie ma.

            Liczba stron idzie z tego, ile danych FAKTYCZNIE przyszlo, a nie
            ze stalej: ta lista raz juz oglaszala 5 stron i 50 osob, majac
            w reku 12 rekordow. */}
        {showPager && (
          <div className="mt-3 flex items-center justify-between border-t border-soft-line pt-3">
            <button
              type="button"
              disabled={page! <= 1 || isLoadingPage}
              onClick={() => onPageChange!(page! - 1)}
              className="rounded-pill px-3 py-1.5 font-soft text-[12.5px] font-semibold text-soft-primary-deep transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:text-soft-ink-faint disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              ← Prev
            </button>

            <span className="font-soft text-[12px] font-semibold tabular-nums text-soft-ink-soft">
              {isLoadingPage ? 'Loading…' : `${page} / ${totalPages}`}
            </span>

            <button
              type="button"
              disabled={page! >= totalPages! || isLoadingPage}
              onClick={() => onPageChange!(page! + 1)}
              className="rounded-pill px-3 py-1.5 font-soft text-[12.5px] font-semibold text-soft-primary-deep transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:text-soft-ink-faint disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              Next →
            </button>
          </div>
        )}
      </section>

      {children}
    </div>
  );
}
