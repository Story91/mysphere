'use client';

import Image from 'next/image';

/**
 * Naglowek profilu na telefonie - wg prawego panelu z drugiego zrzutu.
 *
 * UKLAD: fioletowy gradient na gorze, znak marki na orbicie (ten sam motyw co
 * ekran logowania - tozsamosc produktu wraca w tym samym miejscu), pod nim
 * nazwa, adres do skopiowania i trzy liczby w jednym rzedzie.
 *
 * DLACZEGO PUNKTY SA POMARANCZOWE, A POSTY I LAJKI NIE. W tej aplikacji
 * pomarancz znaczy "pieniadze albo cos, co da sie wymienic na pieniadze" -
 * kwoty tipow, wyplaty, punkty. Posty i lajki to aktywnosc, ktora da sie nabic,
 * wiec dostaja neutralny tusz. Kolor niesie tu informacje, nie ozdobe.
 *
 * Adres jest PRZYCISKIEM, nie tekstem: jedyne, co ktokolwiek chce z nim zrobic,
 * to skopiowac. Ikona obok mowi o tym wprost, zamiast liczyc na to, ze ktos
 * sprobuje zaznaczyc go palcem.
 */

export default function SoftProfileHeader({
  name,
  address,
  avatarUrl,
  posts,
  likes,
  points,
  onCopyAddress,
  onEdit,
}: {
  name: string;
  address: string;
  avatarUrl?: string | null;
  posts: number;
  likes: number;
  points: number;
  onCopyAddress?: () => void;
  onEdit?: () => void;
}) {
  const short = address && address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

  return (
    <div className="lg:hidden">
      <div className="relative -mx-4 overflow-hidden rounded-b-card bg-gradient-to-b from-[#8E7BE8] via-[#7C6BDA] to-[#6656BE] px-4 pb-6 pt-5">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit profile"
            className="absolute right-4 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
        )}

        <div className="mx-auto mb-4 flex h-[124px] w-[124px] items-center justify-center rounded-full bg-[#F5A73B] shadow-[0_12px_36px_rgba(60,44,120,0.35)]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- dowolne domeny
            <img src={avatarUrl} alt="" className="h-[110px] w-[110px] rounded-full object-cover" />
          ) : (
            <Image src="/android-chrome-192x192.png" alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-full" />
          )}
        </div>
      </div>

      <h2 className="mt-4 text-center font-soft-display text-[22px] font-bold text-soft-ink">{name}</h2>

      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={onCopyAddress}
          className="flex items-center gap-2 rounded-pill bg-soft-surface px-3 py-1.5 font-soft text-[12px] font-semibold text-soft-ink-muted shadow-card transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
        >
          <span className="font-mono">{short}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 012-2h10" />
          </svg>
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-soft-line rounded-card bg-soft-surface py-4 shadow-card">
        {[
          { label: 'Posts', value: posts, money: false },
          { label: 'Likes', value: likes, money: false },
          { label: 'Points', value: points, money: true },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div
              className={`font-soft-display text-[19px] font-bold tabular-nums ${
                stat.money ? 'text-soft-accent-deep' : 'text-soft-ink'
              }`}
            >
              {stat.value.toLocaleString('en-US')}
            </div>
            <div className="font-soft text-[11.5px] text-soft-ink-faint">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
