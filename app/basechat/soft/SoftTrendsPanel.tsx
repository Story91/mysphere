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
 * CZTERY KAFLE, CZTERY KOLORY. To jedyne miejsce w aplikacji, gdzie kolor jest
 * przypisany do kategorii, a nie do znaczenia - i jest to swiadomy wyjatek.
 * Cztery liczby o tej samej wadze, ustawione w kwadrat, bez rozroznienia
 * czytaja sie jak tabela; z rozroznieniem kazda ma wlasne miejsce w pamieci
 * i wzrok wraca do wlasciwej bez czytania podpisu.
 *
 * Odcienie sa PRZYGASZONE (tla ~8% nasycenia), zeby kwadrat nie konkurowal
 * z pomaranczem, ktory w tej aplikacji znaczy pieniadze.
 *
 * RANKING pokazuje pozycje numerem w kolku, nie samym porzadkiem na liscie -
 * przy przewijaniu widac wtedy, na ktorym miejscu sie jest, bez liczenia
 * wierszy od gory.
 */

export type SoftTrendStat = { label: string; value: string; tone: 'purple' | 'amber' | 'green' | 'pink' };
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

const TONE = {
  purple: { bg: 'bg-[#EEE9FB]', text: 'text-soft-primary-deep' },
  amber: { bg: 'bg-[#FDF0DC]', text: 'text-soft-accent-deep' },
  green: { bg: 'bg-[#E4F5EA]', text: 'text-[#15803D]' },
  pink: { bg: 'bg-[#FCE7F0]', text: 'text-[#BE185D]' },
} as const;

const MEDAL = ['#F5A73B', '#B9B1D8', '#C98B5A'];

export default function SoftTrendsPanel({
  stats,
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
  return (
    <div className="flex flex-col gap-4 font-soft">
      <h2 className="font-soft-display text-[24px] font-bold text-soft-ink lg:text-[18px]">Trends</h2>

      <div className="grid grid-cols-2 gap-2.5">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-card px-4 py-3.5 ${TONE[stat.tone].bg}`}>
            {/* Skrot na wierzchu, pelna liczba w `title` - patrz compact(). */}
            <div
              title={stat.value}
              className={`font-soft-display text-[26px] font-bold leading-none tabular-nums ${TONE[stat.tone].text}`}
            >
              {compact(stat.value)}
            </div>
            <div className="mt-1.5 font-soft text-[11.5px] font-semibold uppercase tracking-[0.06em] text-soft-ink-soft">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-card bg-soft-surface p-4 shadow-card">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-soft-display text-[15px] font-bold text-soft-ink">Most Active</h3>
          {onSeeAll && (
            <button
              type="button"
              onClick={onSeeAll}
              className="font-soft text-[12.5px] font-semibold text-soft-primary-deep transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
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
                  className="flex w-full items-center gap-3 rounded-pill py-2.5 text-left transition-[background-color,transform] duration-[--dur-press] ease-out-strong active:scale-[0.99] hover:bg-soft-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
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
              className="rounded-pill px-3 py-1.5 font-soft text-[12.5px] font-semibold text-soft-primary-deep transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:text-soft-ink-faint disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
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
              className="rounded-pill px-3 py-1.5 font-soft text-[12.5px] font-semibold text-soft-primary-deep transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:text-soft-ink-faint disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
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
