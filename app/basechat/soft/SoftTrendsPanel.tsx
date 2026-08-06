'use client';

/**
 * Panel Trends na telefonie - wg lewego panelu z pierwszego zrzutu.
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
export type SoftActiveUser = { address: string; name: string; points: number };

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
  children,
}: {
  stats: SoftTrendStat[];
  activeUsers: SoftActiveUser[];
  onOpenUser?: (address: string) => void;
  onSeeAll?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 font-soft lg:hidden">
      <h2 className="font-soft-display text-[24px] font-bold text-soft-ink">Trends</h2>

      <div className="grid grid-cols-2 gap-2.5">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-card p-4 ${TONE[stat.tone].bg}`}>
            <div className={`font-soft-display text-[22px] font-bold tabular-nums ${TONE[stat.tone].text}`}>
              {stat.value}
            </div>
            <div className="font-soft text-[12px] font-semibold text-soft-ink-soft">{stat.label}</div>
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
                    style={{ background: MEDAL[index] ?? 'var(--soft-line-strong)' }}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-soft text-[13.5px] font-semibold text-soft-ink">
                    {user.name}
                  </span>
                  <span className="flex-none rounded-pill bg-soft-sunken px-2.5 py-1 font-soft-display text-[12px] font-bold tabular-nums text-soft-primary-deep">
                    {user.points.toLocaleString('en-US')}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {children}
    </div>
  );
}
