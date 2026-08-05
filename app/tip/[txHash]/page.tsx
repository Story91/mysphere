import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTipReceipt } from '../../utils/tips/getTipReceipt';
import { getName } from '../../utils/identity/getName';
import { shortAddress } from '../../utils/posts/getPostForShare';
import { getExplorerTxLink, type TipNetwork } from '../../basechat/components/TipNetworkConfig';

/**
 * Paragon za tipa - publiczna, udostepnialna trasa.
 *
 * PO CO. Tip byl zdarzeniem widocznym wylacznie wewnatrz aplikacji, wiec nie
 * bylo czego nikomu pokazac. A to jest jedyna rzecz w tym produkcie, ktora jest
 * naraz zdarzeniem spolecznym i sprawdzalnym faktem: pieniadze przeszly, jest
 * na to hash, kazdy moze go sprawdzic w dwie sekundy.
 *
 * Dlaczego wlasnie ta forma, a nie kolejny przycisk "udostepnij": wzrost rynkow
 * predykcyjnych w 2026 napedzaja podglady linkow pokazujace stan, nie tresc.
 * Kwota z dowodem rozchodzi sie sama, bo nie jest deklaracja - deklaracji
 * "zarobilem" nikt nie sprawdzi, a tego linku nie da sie sfalszowac.
 *
 * Komponent SERWEROWY, rewalidacja co 5 minut. Paragon jest niezmienny -
 * transakcja z lancucha nie zmieni juz kwoty ani odbiorcy.
 */

export const runtime = 'nodejs';
export const revalidate = 300;

type Props = { params: { txHash: string } };

/** Nazwa do wyswietlenia: Basename albo skrocony adres. */
async function displayName(address: string): Promise<string> {
  if (!address) return 'unknown';
  const name = await getName({ address: address as `0x${string}` }).catch(() => null);
  return name || shortAddress(address);
}

function formatAmount(amount: string): string {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) return amount;
  if (value >= 1) return value.toFixed(2).replace(/\.00$/, '');
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tip = await getTipReceipt(params.txHash);
  if (!tip) return { title: 'Tip not found — MySphere' };

  const [from, to] = await Promise.all([
    displayName(tip.senderAddress),
    displayName(tip.recipientAddress),
  ]);

  const value = `${formatAmount(tip.amount)} ${tip.token}`;
  const title = `${from} sent ${to} ${value}`;

  return {
    title: `${title} — MySphere`,
    description: `Confirmed onchain on ${tip.network}. Anyone can verify this transaction.`,
    openGraph: {
      title,
      description: `Confirmed onchain on ${tip.network}.`,
      type: 'article',
    },
    alternates: { canonical: `https://mysphere.fun/tip/${tip.txHash}` },
  };
}

export default async function TipReceiptPage({ params }: Props) {
  const tip = await getTipReceipt(params.txHash);
  if (!tip) notFound();

  const [from, to] = await Promise.all([
    displayName(tip.senderAddress),
    displayName(tip.recipientAddress),
  ]);

  const explorer = getExplorerTxLink(tip.network as TipNetwork, tip.txHash);
  const sentAt = tip.timestamp > 0 ? new Date(tip.timestamp) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0A1024] px-5 py-16">
      <div className="w-full max-w-[520px]">
        <p className="mb-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#00E28A]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00E28A]" aria-hidden="true" />
          Settled onchain
        </p>

        <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0E1730]/90 backdrop-blur-xl">
          <div className="px-6 py-7 text-center">
            <div className="mb-1 font-['Coinbase_Display'] text-[46px] font-bold leading-none tabular-nums text-[#00E28A]">
              {formatAmount(tip.amount)}
            </div>
            <div className="text-[13px] font-medium uppercase tracking-[0.14em] text-[#5C6F94]">
              {tip.token}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-white/[0.07]">
            <Link
              href={`/u/${tip.senderAddress}`}
              className="bg-[#0E1730] px-5 py-4 transition hover:bg-[#131E3D]"
            >
              <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[#5C6F94]">From</div>
              <div className="truncate font-['Coinbase_Display'] text-[14px] font-semibold text-[#EEF3FF]">
                {from}
              </div>
            </Link>
            <Link
              href={`/u/${tip.recipientAddress}`}
              className="bg-[#0E1730] px-5 py-4 transition hover:bg-[#131E3D]"
            >
              <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[#5C6F94]">To</div>
              <div className="truncate font-['Coinbase_Display'] text-[14px] font-semibold text-[#EEF3FF]">
                {to}
              </div>
            </Link>
          </div>

          <div className="space-y-2.5 border-t border-white/[0.07] px-5 py-4 text-[12px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#5C6F94]">Network</span>
              <span className="capitalize text-[#9EB0D2]">{tip.network}</span>
            </div>
            {sentAt && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#5C6F94]">Sent</span>
                <span className="text-[#9EB0D2]">
                  {sentAt.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <span className="shrink-0 text-[#5C6F94]">Transaction</span>
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                className="truncate font-mono text-[#5B8CFF] transition hover:text-[#8AB0FF]"
              >
                {shortAddress(tip.txHash)} ↗
              </a>
            </div>
          </div>
        </div>

        {/* Ten akapit jest cala pointa strony: to nie jest przechwalka, tylko
            fakt, ktory kazdy sprawdzi u zrodla. */}
        <p className="mt-4 text-center text-[12px] leading-relaxed text-[#5C6F94]">
          Nothing here is self-reported. The amount, the sender and the recipient come from
          the transaction itself — open it in the explorer and check.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {tip.postId && (
            <Link
              href={`/post/${tip.postId}`}
              className="rounded-xl border border-white/[0.12] px-5 py-3 text-[14px] font-semibold text-[#DDE6FA] transition hover:border-white/25 hover:bg-white/[0.04]"
            >
              See the post
            </Link>
          )}
          <Link
            href="/basechat"
            className="rounded-xl bg-[#0052FF] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-[#0044D6]"
          >
            Open the feed
          </Link>
        </div>
      </div>
    </main>
  );
}
