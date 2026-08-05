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
  if (!profile) return { title: 'Profile not found — MySphere' };

  const name = await resolveDisplayName(profile.address, profile.storedName);
  const tipLine = summarizeTips(profile.tips.received);

  const description = tipLine
    ? `${profile.postCount} posts, ${profile.likesReceived} likes, ${tipLine} received in tips.`
    : `${profile.postCount} posts and ${profile.likesReceived} likes on MySphere.`;

  return {
    title: `${name} — MySphere`,
    description,
    openGraph: { title: `${name} on MySphere`, description, type: 'profile' },
    alternates: { canonical: `https://mysphere.fun/u/${profile.address}` },
  };
}

/**
 * Kwoty sumujemy WYLACZNIE w obrebie tokena. Dodanie ETH do USDC dalo by
 * liczbe, ktora nic nie znaczy - a profil ma byc rekordem, nie infografika.
 */
export function summarizeTips(received: Record<string, number>): string {
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5">
      <div className="font-['Coinbase_Display'] text-[20px] font-bold tabular-nums text-[#EEF3FF]">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-[#5C6F94]">{label}</div>
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
    <main className="min-h-screen bg-[#0A1024] px-5 py-14 sm:px-8">
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
              <div
                className="h-16 w-16 shrink-0 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00E28A]"
                aria-hidden="true"
              />
            )}

            <div className="min-w-0">
              <h1 className="truncate font-['Coinbase_Display'] text-[26px] font-bold tracking-[-0.02em] text-[#EEF3FF] sm:text-[32px]">
                {name}
              </h1>
              {isNamed && (
                <p className="mt-0.5 font-mono text-[12px] text-[#5C6F94]">
                  {shortAddress(profile.address)}
                </p>
              )}
            </div>
          </div>

          {profile.bio && (
            <p className="mb-5 max-w-[52ch] text-[15px] leading-[1.65] text-[#9EB0D2]">
              {profile.bio}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[#5C6F94]">
            {profile.joinedAt && <span>Joined {formatDate(profile.joinedAt)}</span>}
            <a
              href={`https://basescan.org/address/${profile.address}`}
              target="_blank"
              rel="noreferrer"
              className="text-[#5B8CFF] transition hover:text-[#8AB0FF]"
            >
              View onchain ↗
            </a>
          </div>
        </header>

        {/* Liczby, ktore da sie sprawdzic - nic tu nie jest deklaracja. */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={String(profile.postCount)} label="Posts" />
          <Stat value={String(profile.likesReceived)} label="Likes" />
          <Stat value={String(profile.tips.receivedCount)} label="Tips in" />
          <Stat value={String(profile.tips.sentCount)} label="Tips out" />
        </div>

        {tipLine && (
          <div className="mb-12 rounded-xl border border-[#00E28A]/20 bg-[#00E28A]/[0.05] px-4 py-3.5">
            <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-[#00E28A]/70">
              Received in tips
            </div>
            <div className="font-['Coinbase_Display'] text-[16px] font-semibold tabular-nums text-[#00E28A]">
              {tipLine}
            </div>
          </div>
        )}

        <section>
          <h2 className="mb-1 font-['Coinbase_Display'] text-[13px] font-semibold uppercase tracking-[0.14em] text-[#5C6F94]">
            Recent posts
          </h2>

          {profile.recentPosts.length === 0 ? (
            <p className="border-t border-white/[0.07] pt-6 text-[14px] text-[#5C6F94]">
              Nothing posted yet.
            </p>
          ) : (
            <div>
              {profile.recentPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="block border-t border-white/[0.07] py-5 transition hover:bg-white/[0.02]"
                >
                  <p className="mb-2 line-clamp-3 text-[15px] leading-[1.6] text-[#DDE6FA]">
                    {post.content || '(no text)'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#5C6F94]">
                    {post.timestamp > 0 && <span>{formatDate(post.timestamp)}</span>}
                    <span>{post.likes} likes</span>
                    <span>{post.commentCount} comments</span>
                    {post.network && <span className="text-[#5B8CFF]">{post.network}</span>}
                  </div>
                </Link>
              ))}
              <div className="border-t border-white/[0.07]" />
            </div>
          )}
        </section>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/basechat"
            className="rounded-xl bg-[#0052FF] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-[#0044D6]"
          >
            Open the feed
          </Link>
          <Link
            href="/re-definition"
            className="rounded-xl border border-white/[0.12] px-5 py-3 text-[14px] font-semibold text-[#DDE6FA] transition hover:border-white/25 hover:bg-white/[0.04]"
          >
            What MySphere is becoming
          </Link>
        </div>
      </div>
    </main>
  );
}
