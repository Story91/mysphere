import { ImageResponse } from 'next/og';
import { getTipReceipt } from '../../utils/tips/getTipReceipt';
import { getName } from '../../utils/identity/getName';
import { shortAddress } from '../../utils/posts/getPostForShare';

/**
 * Karta OG paragonu.
 *
 * To jest wlasciwy produkt tej trasy. Wieksza czesc ludzi nigdy nie kliknie
 * linku - zobaczy tylko ten obrazek w podgladzie na X albo w Base App. Ma wiec
 * niesc CALA informacje: kwote, kto komu, i to, ze rzecz jest rozliczona.
 *
 * Zadnego brandingu ponad minimum, zadnych ozdobnikow. Bohaterem jest liczba.
 */

export const runtime = 'nodejs';
export const alt = 'Tip receipt on MySphere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function formatAmount(amount: string): string {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) return amount;
  if (value >= 1) return value.toFixed(2).replace(/\.00$/, '');
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

async function displayName(address: string): Promise<string> {
  if (!address) return 'unknown';
  const name = await getName({ address: address as `0x${string}` }).catch(() => null);
  return name || shortAddress(address);
}

export default async function Image({ params }: { params: { txHash: string } }) {
  const tip = await getTipReceipt(params.txHash);

  const [from, to] = await Promise.all([
    displayName(tip?.senderAddress ?? ''),
    displayName(tip?.recipientAddress ?? ''),
  ]);

  const amount = tip ? formatAmount(tip.amount) : '—';
  const token = tip?.token ?? '';

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: '#00E28A' }}
          />
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: 5, color: '#00E28A' }}>
            SETTLED ONCHAIN
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
            <div style={{ display: 'flex', fontSize: 150, fontWeight: 700, color: '#00E28A', lineHeight: 1 }}>
              {amount}
            </div>
            <div style={{ display: 'flex', fontSize: 44, fontWeight: 600, color: '#5C6F94' }}>
              {token}
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 38, color: '#DDE6FA', marginTop: 26 }}>
            {from} → {to}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 22, color: '#5C6F94' }}>
          {tip
            ? `Verifiable on ${tip.network} · mysphere.fun`
            : 'Receipt not found · mysphere.fun'}
        </div>
      </div>
    ),
    size
  );
}
