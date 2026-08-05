import { ImageResponse } from 'next/og';
import { getProfile } from '../../utils/profile/getProfile';
import { getName } from '../../utils/identity/getName';
import { shortAddress } from '../../utils/posts/getPostForShare';

/**
 * Karta OG per profil.
 *
 * To jest ta polowa profilu, ktora ktos naprawde zobaczy: link wklejony na
 * X albo w Base App renderuje sie jako obrazek, zanim ktokolwiek kliknie.
 * Dlatego lezy tu ten sam zestaw liczb, co na stronie - nic dodatkowego,
 * nic upiekszonego.
 */

export const runtime = 'nodejs';
export const alt = 'Profile on MySphere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function formatAmount(value: number): string {
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 1) return value.toFixed(2).replace(/\.00$/, '');
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export default async function Image({ params }: { params: { address: string } }) {
  const profile = await getProfile(params.address);

  const address = profile?.address ?? params.address;
  const basename = profile
    ? await getName({ address: address as `0x${string}` }).catch(() => null)
    : null;
  const name = basename || profile?.storedName || shortAddress(address);

  const topTip = Object.entries(profile?.tips.received ?? {})
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])[0];

  const stats: { value: string; label: string }[] = [
    { value: String(profile?.postCount ?? 0), label: 'POSTS' },
    { value: String(profile?.likesReceived ?? 0), label: 'LIKES' },
    { value: String(profile?.tips.receivedCount ?? 0), label: 'TIPS IN' },
  ];

  if (topTip) {
    stats.push({ value: `${formatAmount(topTip[1])} ${topTip[0]}`, label: 'RECEIVED' });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0A1024',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              letterSpacing: 4,
              color: '#5C6F94',
              marginBottom: 28,
            }}
          >
            MYSPHERE
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 78,
              fontWeight: 700,
              color: '#EEF3FF',
              lineHeight: 1.05,
            }}
          >
            {name}
          </div>
          {basename && (
            <div style={{ display: 'flex', fontSize: 26, color: '#5C6F94', marginTop: 14 }}>
              {shortAddress(address)}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '22px 30px',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.09)',
                background: 'rgba(255,255,255,0.03)',
                minWidth: 190,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: 40,
                  fontWeight: 700,
                  color: stat.label === 'RECEIVED' ? '#00E28A' : '#EEF3FF',
                }}
              >
                {stat.value}
              </div>
              <div style={{ display: 'flex', fontSize: 18, letterSpacing: 2, color: '#5C6F94', marginTop: 6 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
