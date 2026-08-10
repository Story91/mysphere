import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfile } from '../../utils/profile/getProfile';
import { getName } from '../../utils/identity/getName';
import { shortAddress } from '../../utils/posts/getPostForShare';

/**
 * Publiczny profil.
 *
 * PO CO: tozsamosc w tej aplikacji istniala wylacznie wewnatrz feedu. Nie bylo
 * jednego adresu, ktory mozna wkleic w odpowiedzi na pytanie "kim jestes" - a
 * to jest najtansza dystrybucja, jaka produkt spoleczny moze miec. Ta strona
 * jest jednoczesnie wizytowka dla czlowieka i rekordem do odczytu maszynowego.
 *
 * Komponent SERWEROWY: metadane, tresc i karta OG powstaja przed wyslaniem
 * odpowiedzi, wiec crawlery i podglady linkow widza pelna strone od razu.
 *
 * Rewalidacja co 5 minut - profil nie musi byc swiezy co do sekundy, a bez
 * cache kazde wejscie kosztowaloby cztery zapytania do Firestore.
 */

export const runtime = 'nodejs';
export const revalidate = 300;

type Props = { params: { address: string } };

/** Nazwa do wyswietlenia: Basename > nazwa z profilu > skrocony adres. */
async function resolveDisplayName(address: string, storedName?: string) {
  const basename = await getName({ address: address as `0x${string}` }).catch(() => null);
  return basename || storedName || shortAddress(address);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getProfile(params.address);
  // Marke dokłada `title.template` z layoutu glownego.
  if (!profile) return { title: 'Profile not found' };

  const name = await resolveDisplayName(profile.address, profile.storedName);
  const tipLine = summarizeTips(profile.tips.received);

  const description = tipLine
    ? `${profile.postCount} posts, ${profile.likesReceived} likes, ${tipLine} received in tips.`
    : `${profile.postCount} posts and ${profile.likesReceived} likes on MySphere.`;

  return {
    title: name,
    description,
    openGraph: { title: `${name} on MySphere`, description, type: 'profile' },
    alternates: { canonical: `https://mysphere.fun/u/${profile.address}` },
  };
}

/**
 * Kwoty sumujemy WYLACZNIE w obrebie tokena. Dodanie ETH do USDC dalo by
 * liczbe, ktora nic nie znaczy - a profil ma byc rekordem, nie infografika.
 */
function summarizeTips(received: Record<string, number>): string {
  const parts = Object.entries(received)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([token, amount]) => `${formatAmount(amount)} ${token}`);

  return parts.join(' · ');
}

function formatAmount(value: number): string {
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 1) return value.toFixed(2).replace(/\.00$/, '');
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Liczba na bialej karcie. Wartosc dostaje pelny tusz (soft-ink), etykieta
 * najslabszy (soft-ink-faint) - ta sama para, co w SoftProfileHeader, zeby
 * profil publiczny i profil we feedzie czytalo sie tak samo.
 *
 * Zadna z tych liczb nie jest pieniedzmi, wiec zadna nie jest pomaranczowa.
 */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-card bg-soft-surface px-4 py-3.5 shadow-card">
      <div className="font-soft-display text-[20px] font-bold tabular-nums text-soft-ink">
        {value}
      </div>
      <div className="mt-0.5 font-soft text-[11px] uppercase tracking-[0.12em] text-soft-ink-faint">
        {label}
      </div>
    </div>
  );
}

export default async function ProfilePage({ params }: Props) {
  const profile = await getProfile(params.address);
  if (!profile) notFound();

  const name = await resolveDisplayName(profile.address, profile.storedName);
  const tipLine = summarizeTips(profile.tips.received);
  const isNamed = name !== shortAddress(profile.address);

  return (
    <main className="min-h-screen bg-soft-bg px-5 py-14 font-soft sm:px-8">
      <div className="mx-auto max-w-[720px]">
        <header className="mb-10">
          <div className="mb-6 flex items-center gap-4">
            {profile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatary sa
              // hostowane na dowolnych domenach uzytkownikow; next/image
              // wymagalby whitelisty kazdej z nich w next.config.js.
              <img
                src={profile.avatar}
                alt=""
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              // Zastepnik awatara jest fioletowy, nie pomaranczowy: to tozsamosc,
              // a nie pieniadze. Gradient w obrebie jednego odcienia, zeby plamka
              // nie krzyczala glosniej niz imie obok niej.
              <div
                className="h-16 w-16 shrink-0 rounded-full bg-gradient-to-br from-soft-primary to-soft-primary-deep"
                aria-hidden="true"
              />
            )}

            <div className="min-w-0">
              <h1 className="truncate font-soft-display text-[26px] font-bold tracking-[-0.02em] text-soft-ink sm:text-[32px]">
                {name}
              </h1>
              {isNamed && (
                <p className="mt-0.5 font-mono text-[12px] text-soft-ink-soft">
                  {shortAddress(profile.address)}
                </p>
              )}
            </div>
          </div>

          {profile.bio && (
            <p className="mb-5 max-w-[52ch] font-soft text-[15px] leading-[1.65] text-soft-ink-muted">
              {profile.bio}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-soft text-[13px] text-soft-ink-soft">
            {profile.joinedAt && <span>Joined {formatDate(profile.joinedAt)}</span>}
            <a
              href={`https://basescan.org/address/${profile.address}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-soft-primary-deep transition-colors [transition-duration:var(--dur-press)] hover:text-soft-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              View onchain ↗
            </a>
          </div>
        </header>

        {/* AWARIA != PUSTKA. Gdy ktorys odczyt sie wywrocil, liczby ponizej sa
            zanizone - i bez tego zdania czytalyby sie jako fakt o czlowieku.
            Wczesniej mowila o tym tylko sekcja postow, wiec nieudany odczyt
            tipow przechodzil bez sladu. */}
        {profile.partial && (
          <p className="mb-4 rounded-card bg-soft-surface px-4 py-3 font-soft text-[13px] leading-[1.55] text-soft-ink-muted shadow-card">
            Some of this profile could not be read right now, so the numbers below may be
            incomplete. Try again in a moment.
          </p>
        )}

        {/* Liczby, ktore da sie sprawdzic - nic tu nie jest deklaracja. */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={String(profile.postCount)} label="Posts" />
          <Stat value={String(profile.likesReceived)} label="Likes" />
          <Stat value={String(profile.tips.receivedCount)} label="Tips in" />
          <Stat value={String(profile.tips.sentCount)} label="Tips out" />
        </div>

        {/* Jedyne pomaranczowe miejsce na tej stronie - bo jedyne, ktore mowi
            o pieniadzach. Reszta liczb to aktywnosc i dostaje neutralny tusz. */}
        {tipLine && (
          <div className="mb-12 rounded-card bg-soft-accent-soft px-4 py-3.5">
            <div className="mb-1 font-soft text-[11px] font-bold uppercase tracking-[0.12em] text-soft-accent-deep">
              Received in tips
            </div>
            <div className="font-soft-display text-[16px] font-bold tabular-nums text-soft-accent-deep">
              {tipLine}
            </div>
          </div>
        )}

        <section>
          <h2 className="mb-3 font-soft-display text-[13px] font-bold uppercase tracking-[0.14em] text-soft-ink-faint">
            Recent posts
          </h2>

          {profile.recentPosts.length === 0 ? (
            /* "Nic nie napisal" to twierdzenie o czlowieku. Nie stawiamy go w
               momencie, w ktorym odczyt sie wywrocil - wtedy mowimy prawde
               o sobie, nie nieprawde o nim. */
            <div className="rounded-card bg-soft-surface p-8 text-center shadow-card">
              <p className="mb-1 font-soft-display text-[15px] font-bold text-soft-ink">
                {profile.partial ? 'Posts could not be loaded' : 'Nothing posted yet'}
              </p>
              <p className="font-soft text-[13px] text-soft-ink-soft">
                {profile.partial
                  ? 'This is a read error on our side, not an empty profile. Try again in a moment.'
                  : 'The first post shows up here.'}
              </p>
            </div>
          ) : (
            /* Posty jako biale karty, a nie wiersze rozdzielone linia: na jasnym
               tle linia jest za slaba, zeby zamknac blok tekstu, a karta jest
               dokladnie tym, czym post jest we feedzie. */
            <div className="flex flex-col gap-2.5">
              {profile.recentPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="block rounded-card bg-soft-surface p-4 shadow-card transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                >
                  <p className="mb-2 line-clamp-3 font-soft text-[15px] leading-[1.6] text-soft-ink-muted">
                    {post.content || '(no text)'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-soft text-[12px] text-soft-ink-soft">
                    {post.timestamp > 0 && <span>{formatDate(post.timestamp)}</span>}
                    <span>{post.likes} likes</span>
                    <span>{post.commentCount} comments</span>
                    {post.network && (
                      <span className="font-semibold text-soft-primary-deep">{post.network}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="mt-12 flex flex-wrap gap-2.5">
          <Link
            href="/basechat"
            className="rounded-pill bg-soft-primary px-5 py-3 font-soft text-[14px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
          >
            Open the feed
          </Link>
          {/* Paid zyje jako zakladka na /money - link celuje wprost w nia,
              zeby nie placic przekierowania ze starego /leaderboard. */}
          <Link
            href="/money?tab=paid"
            className="rounded-pill bg-soft-surface px-5 py-3 font-soft text-[14px] font-semibold text-soft-ink-muted shadow-card transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
          >
            Who got paid this week
          </Link>
          <Link
            href="/re-definition"
            className="rounded-pill bg-soft-surface px-5 py-3 font-soft text-[14px] font-semibold text-soft-ink-muted shadow-card transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
          >
            What MySphere is becoming
          </Link>
        </div>
      </div>
    </main>
  );
}
